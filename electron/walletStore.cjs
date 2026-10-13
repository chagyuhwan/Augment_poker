const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { applyWalletOp, createWallet, isWalletData, recoverOpenTables, toAccount } = require('./walletCore.mjs');

// 로컬 파일 변조를 탐지하기 위한 서명 키. 실행 파일 안에 있는 키라 완전한 보호는 아니다.
// 출시 전 서버 지갑으로 교체하면 이 파일은 오프라인 캐시 용도로만 남는다.
const SIGNING_SECRET = 'augmented-poker/wallet/v1/9f3c1e7a52b84d06';

function sign(payload, accountKey) {
  return crypto.createHmac('sha256', `${SIGNING_SECRET}:${accountKey}`).update(payload).digest('hex');
}

/**
 * 계정별 게임머니 장부를 보관한다. 렌더러는 IPC로 작업을 요청할 뿐 잔액을 직접 바꿀 수 없다.
 * 메인 프로세스는 단일 스레드라 요청이 순서대로 처리되어 경쟁 상태가 생기지 않는다.
 */
function createWalletStore({ userDataDir, accountKey, logger, now = Date.now }) {
  const safeKey = String(accountKey).replace(/[^A-Za-z0-9_-]/g, '') || 'local';
  const dir = path.join(userDataDir, 'wallet');
  const file = path.join(dir, `${safeKey}.json`);
  const backup = `${file}.bak`;

  let data = null;
  let lockedReason = null;
  let recovered = [];

  const readSigned = (target) => {
    let raw;
    try {
      raw = fs.readFileSync(target, 'utf8').replace(/^\uFEFF/, '');
    } catch (err) {
      if (err.code === 'ENOENT') return { missing: true };
      return { error: `read failed: ${err.message}` };
    }
    try {
      const parsed = JSON.parse(raw);
      const payload = typeof parsed?.payload === 'string' ? parsed.payload : null;
      if (!payload || typeof parsed.sig !== 'string') return { error: 'malformed file' };
      const expected = sign(payload, safeKey);
      const a = Buffer.from(parsed.sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'signature mismatch' };
      const value = JSON.parse(payload);
      if (!isWalletData(value)) return { error: 'invalid wallet data' };
      return { data: value };
    } catch (err) {
      return { error: `parse failed: ${err.message}` };
    }
  };

  const persist = (next) => {
    const payload = JSON.stringify(next);
    const body = JSON.stringify({ payload, sig: sign(payload, safeKey) });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, body);
    fs.renameSync(`${file}.tmp`, file);
    // 백업도 최신본으로 유지해 한쪽이 손상돼도 이전 상태로 되돌아가지 않게 한다
    fs.writeFileSync(`${backup}.tmp`, body);
    fs.renameSync(`${backup}.tmp`, backup);
  };

  const load = () => {
    const main = readSigned(file);
    if (main.data) {
      data = main.data;
    } else if (main.missing && !fs.existsSync(backup)) {
      data = createWallet(now());
      persist(data);
      logger.info(`[wallet] created account=${safeKey} balance=${data.balance}`);
    } else {
      const bak = readSigned(backup);
      if (bak.data) {
        logger.warn(`[wallet] main file unusable (${main.error ?? 'missing'}), restored from backup`);
        data = bak.data;
        persist(data);
      } else {
        lockedReason = '게임머니 데이터가 손상되었거나 변조되어 사용할 수 없습니다. 로그 폴더의 파일과 함께 문의해 주세요.';
        logger.error(`[wallet] locked: main=${main.error ?? 'missing'} backup=${bak.error ?? 'missing'}`);
        return;
      }
    }

    const r = recoverOpenTables(data, now());
    if (r.recovered.length > 0) {
      data = r.data;
      persist(data);
      recovered = r.recovered;
      for (const t of r.recovered) logger.warn(`[wallet] recovered table=${t.tableId} amount=${t.amount}`);
    }
  };

  load();

  const snapshot = () =>
    lockedReason ? { available: false, error: lockedReason, account: null, recovered: [] } : { available: true, error: null, account: toAccount(data, now()), recovered };

  return {
    file,
    get() {
      return snapshot();
    },
    history() {
      return lockedReason ? [] : [...data.ledger].reverse();
    },
    apply(op) {
      if (lockedReason) return { ok: false, error: lockedReason, account: null };
      const t = now();
      const { data: next, result } = applyWalletOp(data, op, t);
      if (next !== data) {
        try {
          persist(next);
          data = next;
        } catch (err) {
          logger.error(`[wallet] save failed: ${err.message}`);
          return { ok: false, error: '게임머니를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', account: toAccount(data, t) };
        }
      }
      if (op?.type !== 'checkpoint') {
        logger.info(
          `[wallet] ${op?.type} op=${op?.opId} table=${op?.tableId ?? '-'} amount=${op?.amount ?? op?.stack ?? '-'} ` +
            `ok=${result.ok}${result.duplicate ? ' duplicate' : ''}${result.ok ? '' : ` error=${result.error}`} balance=${data.balance}`,
        );
      }
      return result;
    },
  };
}

module.exports = { createWalletStore };
