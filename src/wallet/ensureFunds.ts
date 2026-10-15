import type { IWalletService } from './types';

/**
 * 바이인에 필요한 잔액을 맞춘다.
 * - 이전에 끊긴 LAN 테이블 보관금을 먼저 회수
 * - 부족하면 무료 충전 1회 시도
 */
export async function ensureFundsForBuyIn(
  wallet: IWalletService,
  need: number,
  /** 이번에 쓸 테이블은 회수하지 않음 */
  keepTableId?: string,
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  let snap = await wallet.snapshot();
  if (!snap.available || !snap.account) {
    return { ok: false, error: snap.error ?? '지갑을 불러올 수 없습니다.' };
  }

  const stranded = snap.account.tables.filter(
    (t) => t.tableId.startsWith('lan-') && t.tableId !== keepTableId,
  );
  for (const t of stranded) {
    await wallet.cashOut(t.tableId, t.stack, 'leave');
  }
  if (stranded.length) snap = await wallet.snapshot();
  if (!snap.account) return { ok: false, error: '지갑을 불러올 수 없습니다.' };

  if (snap.account.balance >= need) return { ok: true, balance: snap.account.balance };

  if (snap.account.freeCharge.eligible) {
    const free = await wallet.claimFreeCharge();
    if (free.ok && free.account.balance >= need) {
      return { ok: true, balance: free.account.balance };
    }
    if (free.ok) snap = { ...snap, account: free.account };
  }

  const bal = snap.account?.balance ?? 0;
  const locked = snap.account?.tableTotal ?? 0;
  if (bal < need) {
    const hint =
      locked > 0
        ? ` (다른 테이블에 ${locked.toLocaleString('ko-KR')}이 묶여 있습니다)`
        : snap.account?.freeCharge.eligible === false && snap.account.freeCharge.reason
          ? ` · ${snap.account.freeCharge.reason}`
          : '';
    return {
      ok: false,
      error: `게임머니가 부족합니다. 최소 ${need.toLocaleString('ko-KR')}이 필요합니다.${hint}`,
    };
  }
  return { ok: true, balance: bal };
}
