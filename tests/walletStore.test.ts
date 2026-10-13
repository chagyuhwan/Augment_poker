/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  WALLET_RULES,
  applyWalletOp,
  createWallet,
  recoverOpenTables,
  type WalletData,
  type WalletOp,
} from '../electron/walletCore.mjs';

const require = createRequire(import.meta.url);
const { createWalletStore } = require('../electron/walletStore.cjs') as {
  createWalletStore: (o: { userDataDir: string; accountKey: string; logger: unknown; now?: () => number }) => {
    file: string;
    get(): { available: boolean; account: { balance: number; tableTotal: number } | null; recovered: unknown[] };
    apply(op: WalletOp): { ok: boolean; error?: string; account: { balance: number } | null };
    history(): unknown[];
  };
};

const T0 = new Date(2026, 9, 13, 12, 0, 0).getTime();
const silent = { info() {}, warn() {}, error() {} };
let n = 0;
const op = () => `op-test-${++n}-xxxx`;

function run(data: WalletData, o: WalletOp, now = T0) {
  return applyWalletOp(data, o, now);
}

describe('walletCore 장부 규칙', () => {
  it('첫 지갑은 기본 지급액을 가진다', () => {
    const w = createWallet(T0);
    expect(w.balance).toBe(WALLET_RULES.initialGrant);
    expect(w.ledger[0]).toMatchObject({ type: 'grant', amount: WALLET_RULES.initialGrant });
  });

  it('바이인은 계정 잔액에서 테이블 보관금으로 옮기고, 캐시아웃은 남은 칩을 돌려준다', () => {
    let w = createWallet(T0);
    const a = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 20_000 });
    expect(a.result.ok).toBe(true);
    w = a.data;
    expect(w.balance).toBe(80_000);
    expect(w.tables['table-1'].stack).toBe(20_000);

    const b = run(w, { type: 'cashOut', opId: op(), tableId: 'table-1', stack: 35_000, reason: 'leave' });
    expect(b.result.ok).toBe(true);
    expect(b.data.balance).toBe(115_000);
    expect(b.data.tables['table-1']).toBeUndefined();
  });

  it('잔액보다 큰 바이인과 같은 테이블 중복 바이인을 거부한다', () => {
    let w = createWallet(T0);
    expect(run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 100_001 }).result.ok).toBe(false);
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 10_000 }).data;
    const dup = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 10_000 });
    expect(dup.result.ok).toBe(false);
    expect(dup.data.balance).toBe(90_000);
  });

  it('같은 opId를 다시 보내면 아무것도 바꾸지 않고 처음 결과를 돌려준다', () => {
    let w = createWallet(T0);
    const id = op();
    w = run(w, { type: 'buyIn', opId: id, tableId: 'table-1', amount: 10_000 }).data;
    const again = run(w, { type: 'buyIn', opId: id, tableId: 'table-1', amount: 10_000 });
    expect(again.result).toMatchObject({ ok: true, duplicate: true });
    expect(again.data).toBe(w);

    const cashId = op();
    w = run(w, { type: 'cashOut', opId: cashId, tableId: 'table-1', stack: 10_000, reason: 'leave' }).data;
    const cashAgain = run(w, { type: 'cashOut', opId: cashId, tableId: 'table-1', stack: 10_000, reason: 'leave' });
    expect(cashAgain.data.balance).toBe(100_000);
  });

  it('잘못된 값은 거부한다', () => {
    const w = createWallet(T0);
    expect(run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: -5 }).result.ok).toBe(false);
    expect(run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 1.5 }).result.ok).toBe(false);
    expect(run(w, { type: 'buyIn', opId: 'x', tableId: 'table-1', amount: 100 }).result.ok).toBe(false);
    expect(run(w, { type: 'cashOut', opId: op(), tableId: 'nope', stack: 100, reason: 'leave' }).result.ok).toBe(false);
  });

  it('무료 충전: 기준 금액 미만일 때만, 하루 횟수 제한', () => {
    let w = createWallet(T0);
    expect(run(w, { type: 'claimFree', opId: op() }).result.ok).toBe(false);

    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 100_000 }).data;
    w = run(w, { type: 'cashOut', opId: op(), tableId: 'table-1', stack: 0, reason: 'bust' }).data;
    expect(w.balance).toBe(0);

    for (let i = 0; i < WALLET_RULES.freeChargeDailyLimit; i++) {
      const r = run(w, { type: 'claimFree', opId: op() });
      expect(r.result.ok).toBe(true);
      w = r.data;
      // 다음 충전 조건을 만들기 위해 다시 전부 잃는다
      w = run(w, { type: 'buyIn', opId: op(), tableId: `t-loop-${i}`, amount: w.balance }).data;
      w = run(w, { type: 'cashOut', opId: op(), tableId: `t-loop-${i}`, stack: 0, reason: 'bust' }).data;
    }
    expect(run(w, { type: 'claimFree', opId: op() }).result.ok).toBe(false);

    const tomorrow = T0 + 24 * 60 * 60 * 1000;
    expect(run(w, { type: 'claimFree', opId: op() }, tomorrow).result.ok).toBe(true);
  });

  it('테이블 보관금도 무료 충전 기준 금액에 포함한다', () => {
    let w = createWallet(T0);
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 99_000 }).data;
    expect(w.balance).toBe(1_000);
    expect(run(w, { type: 'claimFree', opId: op() }).result.ok).toBe(false);
  });

  it('시계를 과거로 돌리면 무료 충전을 거부한다', () => {
    let w = createWallet(T0);
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 100_000 }).data;
    w = run(w, { type: 'cashOut', opId: op(), tableId: 'table-1', stack: 0, reason: 'bust' }).data;
    w = run(w, { type: 'claimFree', opId: op() }).data;
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-2', amount: w.balance }).data;
    w = run(w, { type: 'cashOut', opId: op(), tableId: 'table-2', stack: 0, reason: 'bust' }).data;
    const past = T0 - 2 * 24 * 60 * 60 * 1000;
    expect(run(w, { type: 'claimFree', opId: op() }, past).result.ok).toBe(false);
  });

  it('비정상 종료 복구는 팟에 넣지 않은 칩만 돌려준다', () => {
    let w = createWallet(T0);
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 20_000 }).data;
    w = run(w, { type: 'checkpoint', tableId: 'table-1', stack: 14_000, committed: 3_000, handNo: 5 }).data;
    const r = recoverOpenTables(w, T0);
    expect(r.recovered).toEqual([{ tableId: 'table-1', amount: 14_000 }]);
    expect(r.data.balance).toBe(80_000 + 14_000);
    expect(r.data.tables).toEqual({});
  });

  it('이전 판의 체크포인트는 무시한다', () => {
    let w = createWallet(T0);
    w = run(w, { type: 'buyIn', opId: op(), tableId: 'table-1', amount: 20_000 }).data;
    w = run(w, { type: 'checkpoint', tableId: 'table-1', stack: 10_000, committed: 0, handNo: 7 }).data;
    const stale = run(w, { type: 'checkpoint', tableId: 'table-1', stack: 99_999, committed: 0, handNo: 6 });
    expect(stale.result.ok).toBe(false);
    expect(stale.data.tables['table-1'].stack).toBe(10_000);
  });
});

describe('walletStore 파일 저장', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ap-wallet-'));

  it('저장 후 다시 열어도 잔액이 유지된다', () => {
    const dir = tmp();
    const a = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    expect(a.apply({ type: 'buyIn', opId: op(), tableId: 'table-1', amount: 30_000 }).ok).toBe(true);
    expect(a.apply({ type: 'cashOut', opId: op(), tableId: 'table-1', stack: 45_000, reason: 'leave' }).ok).toBe(true);
    const b = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    expect(b.get().account?.balance).toBe(115_000);
  });

  it('잔액을 직접 고친 파일은 백업본으로 되돌리고, 둘 다 변조되면 잠근다', () => {
    const dir = tmp();
    const a = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    a.apply({ type: 'buyIn', opId: op(), tableId: 'table-1', amount: 10_000 });
    a.apply({ type: 'cashOut', opId: op(), tableId: 'table-1', stack: 10_000, reason: 'leave' });

    const tamper = (file: string) => {
      const body = JSON.parse(fs.readFileSync(file, 'utf8'));
      body.payload = body.payload.replace(/"balance":\d+/, '"balance":999999999');
      fs.writeFileSync(file, JSON.stringify(body));
    };
    tamper(a.file);
    const b = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    expect(b.get().account?.balance).toBe(100_000);

    tamper(b.file);
    tamper(`${b.file}.bak`);
    const c = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    expect(c.get().available).toBe(false);
    expect(c.apply({ type: 'claimFree', opId: op() }).ok).toBe(false);
  });

  it('다른 계정의 파일 서명은 통과하지 못한다', () => {
    const dir = tmp();
    const a = createWalletStore({ userDataDir: dir, accountKey: 'aaa', logger: silent, now: () => T0 });
    a.apply({ type: 'buyIn', opId: op(), tableId: 'table-1', amount: 1_000 });
    fs.copyFileSync(a.file, path.join(dir, 'wallet', 'bbb.json'));
    const b = createWalletStore({ userDataDir: dir, accountKey: 'bbb', logger: silent, now: () => T0 });
    expect(b.get().available).toBe(false);
  });

  it('다시 열 때 열린 테이블을 정산한다', () => {
    const dir = tmp();
    const a = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    a.apply({ type: 'buyIn', opId: op(), tableId: 'table-1', amount: 20_000 });
    a.apply({ type: 'checkpoint', tableId: 'table-1', stack: 18_000, committed: 2_000, handNo: 3 });
    const b = createWalletStore({ userDataDir: dir, accountKey: '765', logger: silent, now: () => T0 });
    expect(b.get().recovered).toEqual([{ tableId: 'table-1', amount: 18_000 }]);
    expect(b.get().account).toMatchObject({ balance: 98_000, tableTotal: 0 });
  });
});
