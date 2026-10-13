// 계정 게임머니 장부. 파일 입출력이 없는 순수 로직이라 메인 프로세스(권한자),
// 브라우저 개발 모드, 테스트가 같은 규칙을 쓴다. 이후 서버로 옮길 때도 이 규칙을 그대로 따른다.
// 게임머니는 현금·경품·외부 재화로 환전하거나 이용자 간에 거래할 수 없다.

export const WALLET_VERSION = 1;

export const WALLET_RULES = Object.freeze({
  initialGrant: 100_000,
  freeChargeAmount: 50_000,
  /** 잔액과 테이블 보관금의 합이 이 값 미만일 때만 무료 충전 가능 */
  freeChargeThreshold: 5_000,
  freeChargeDailyLimit: 3,
  /** 이보다 크게 시계가 과거로 돌아가면 무료 충전을 거부한다 */
  clockSkewToleranceMs: 5 * 60 * 1000,
  ledgerMax: 500,
  opsMax: 300,
  maxAmount: 1_000_000_000_000,
});

const TABLE_ID = /^[A-Za-z0-9_-]{4,64}$/;
const OP_ID = /^[A-Za-z0-9_-]{8,80}$/;

const isAmount = (v) => Number.isSafeInteger(v) && v >= 0 && v <= WALLET_RULES.maxAmount;

export function localDay(now) {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nextMidnight(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function createWallet(now) {
  const data = {
    version: WALLET_VERSION,
    balance: 0,
    tables: {},
    freeCharge: { day: '', count: 0, lastAt: 0 },
    ledger: [],
    ops: {},
    opOrder: [],
    seq: 0,
  };
  credit(data, now, 'grant', WALLET_RULES.initialGrant, null, '첫 접속 기본 지급');
  return data;
}

/** 저장된 데이터가 장부 형식에 맞는지 검사한다. 맞지 않으면 사용하지 않는다. */
export function isWalletData(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.version !== WALLET_VERSION || !isAmount(v.balance)) return false;
  if (!v.tables || typeof v.tables !== 'object') return false;
  for (const t of Object.values(v.tables)) {
    if (!t || !isAmount(t.buyIn) || !isAmount(t.stack) || !isAmount(t.committed)) return false;
  }
  return Array.isArray(v.ledger) && v.ops && typeof v.ops === 'object' && Array.isArray(v.opOrder);
}

function credit(data, now, type, delta, tableId, note) {
  data.balance += delta;
  data.seq += 1;
  data.ledger.push({ id: data.seq, at: now, type, amount: delta, balance: data.balance, tableId, note });
  if (data.ledger.length > WALLET_RULES.ledgerMax) data.ledger.splice(0, data.ledger.length - WALLET_RULES.ledgerMax);
}

export function freeChargeStatus(data, now) {
  const today = localDay(now);
  const used = data.freeCharge.day === today ? data.freeCharge.count : 0;
  const remaining = Math.max(0, WALLET_RULES.freeChargeDailyLimit - used);
  const total = data.balance + tableTotal(data);
  let reason = null;
  if (now + WALLET_RULES.clockSkewToleranceMs < data.freeCharge.lastAt) {
    reason = '시스템 시간이 마지막 충전 시각보다 이전입니다. PC 시간을 확인해 주세요.';
  } else if (remaining <= 0) {
    reason = '오늘 무료 충전 횟수를 모두 사용했습니다.';
  } else if (total >= WALLET_RULES.freeChargeThreshold) {
    reason = `보유 게임머니(테이블 보관금 포함)가 ${WALLET_RULES.freeChargeThreshold.toLocaleString('ko-KR')} 미만일 때 충전할 수 있습니다.`;
  }
  return {
    amount: WALLET_RULES.freeChargeAmount,
    threshold: WALLET_RULES.freeChargeThreshold,
    dailyLimit: WALLET_RULES.freeChargeDailyLimit,
    remaining,
    eligible: reason === null,
    reason,
    resetsAt: nextMidnight(now),
  };
}

function tableTotal(data) {
  return Object.values(data.tables).reduce((sum, t) => sum + t.stack, 0);
}

export function toAccount(data, now) {
  return {
    balance: data.balance,
    tables: Object.entries(data.tables).map(([tableId, t]) => ({ tableId, ...t })),
    tableTotal: tableTotal(data),
    freeCharge: freeChargeStatus(data, now),
  };
}

function fail(data, now, error) {
  return { ok: false, error, account: toAccount(data, now) };
}

function rememberOp(data, opId, result) {
  data.ops[opId] = { ok: result.ok, error: result.ok ? undefined : result.error };
  data.opOrder.push(opId);
  while (data.opOrder.length > WALLET_RULES.opsMax) delete data.ops[data.opOrder.shift()];
}

/**
 * 장부 작업을 적용한다. data를 직접 바꾸지 않고 새 데이터를 돌려준다.
 * opId가 같은 요청이 다시 오면 처음 결과를 그대로 돌려주고 아무것도 바꾸지 않는다(중복 지급/차감 방지).
 */
export function applyWalletOp(prev, op, now) {
  if (!op || typeof op !== 'object') return { data: prev, result: fail(prev, now, '잘못된 요청입니다.') };

  if (op.type === 'checkpoint') return checkpoint(prev, op, now);

  if (typeof op.opId !== 'string' || !OP_ID.test(op.opId)) {
    return { data: prev, result: fail(prev, now, '잘못된 요청 번호입니다.') };
  }
  const seen = prev.ops[op.opId];
  if (seen) {
    const result = seen.ok ? { ok: true, account: toAccount(prev, now) } : fail(prev, now, seen.error);
    return { data: prev, result: { ...result, duplicate: true } };
  }

  const data = structuredClone(prev);
  let result;
  switch (op.type) {
    case 'buyIn':
      result = buyIn(data, op, now);
      break;
    case 'cashOut':
      result = cashOut(data, op, now);
      break;
    case 'claimFree':
      result = claimFree(data, now);
      break;
    default:
      result = fail(prev, now, '알 수 없는 작업입니다.');
  }
  if (!result.ok) {
    // 실패한 요청도 기억해 같은 opId 재시도가 다른 결과를 내지 않게 한다
    const failed = structuredClone(prev);
    rememberOp(failed, op.opId, result);
    return { data: failed, result };
  }
  rememberOp(data, op.opId, result);
  return { data, result };
}

function buyIn(data, op, now) {
  if (typeof op.tableId !== 'string' || !TABLE_ID.test(op.tableId)) return fail(data, now, '잘못된 테이블입니다.');
  if (!isAmount(op.amount) || op.amount <= 0) return fail(data, now, '입장 금액이 올바르지 않습니다.');
  if (data.tables[op.tableId]) return fail(data, now, '이미 이 테이블에 게임머니를 가져왔습니다.');
  if (op.amount > data.balance) return fail(data, now, '보유 게임머니가 부족합니다.');
  data.tables[op.tableId] = { buyIn: op.amount, stack: op.amount, committed: 0, handNo: 0, openedAt: now };
  credit(data, now, 'buyIn', -op.amount, op.tableId, typeof op.label === 'string' ? op.label.slice(0, 40) : '테이블 입장');
  return { ok: true, account: toAccount(data, now) };
}

function cashOut(data, op, now) {
  const table = data.tables[op.tableId];
  if (!table) return fail(data, now, '입장한 테이블이 아닙니다.');
  if (!isAmount(op.stack)) return fail(data, now, '정산 금액이 올바르지 않습니다.');
  delete data.tables[op.tableId];
  const note = op.reason === 'bust' ? '게임머니 소진으로 퇴장' : '테이블 퇴장 정산';
  credit(data, now, 'cashOut', op.stack, op.tableId, note);
  return { ok: true, account: toAccount(data, now) };
}

function claimFree(data, now) {
  const status = freeChargeStatus(data, now);
  if (!status.eligible) return fail(data, now, status.reason);
  const today = localDay(now);
  data.freeCharge = {
    day: today,
    count: (data.freeCharge.day === today ? data.freeCharge.count : 0) + 1,
    lastAt: now,
  };
  credit(data, now, 'freeCharge', status.amount, null, '무료 충전');
  return { ok: true, account: toAccount(data, now) };
}

/** 판 시작·베팅·정산 시점의 테이블 칩을 기록한다. 같은 값을 여러 번 보내도 결과가 같다. */
function checkpoint(prev, op, now) {
  const table = prev.tables[op.tableId];
  if (!table) return { data: prev, result: fail(prev, now, '입장한 테이블이 아닙니다.') };
  if (!isAmount(op.stack) || !isAmount(op.committed) || !Number.isSafeInteger(op.handNo) || op.handNo < 0) {
    return { data: prev, result: fail(prev, now, '기록 값이 올바르지 않습니다.') };
  }
  if (op.handNo < table.handNo) return { data: prev, result: fail(prev, now, '이전 판의 기록입니다.') };
  const data = structuredClone(prev);
  data.tables[op.tableId] = { ...table, stack: op.stack, committed: op.committed, handNo: op.handNo };
  return { data, result: { ok: true, account: toAccount(data, now) } };
}

/**
 * 비정상 종료로 남은 테이블 보관금을 돌려준다.
 * stack은 팟에 넣지 않은 칩이다. 진행 중이던 판에 이미 낸 금액(committed)은 폴드한 것으로 보고 돌려주지 않는다.
 */
export function recoverOpenTables(prev, now) {
  const ids = Object.keys(prev.tables);
  if (ids.length === 0) return { data: prev, recovered: [] };
  const data = structuredClone(prev);
  const recovered = [];
  for (const id of ids) {
    const amount = data.tables[id].stack;
    delete data.tables[id];
    credit(data, now, 'recovery', amount, id, '비정상 종료된 테이블 정산');
    recovered.push({ tableId: id, amount });
  }
  return { data, recovered };
}
