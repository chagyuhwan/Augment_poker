export declare const WALLET_VERSION: 1;

export declare const WALLET_RULES: Readonly<{
  initialGrant: number;
  freeChargeAmount: number;
  freeChargeThreshold: number;
  freeChargeDailyLimit: number;
  clockSkewToleranceMs: number;
  ledgerMax: number;
  opsMax: number;
  maxAmount: number;
}>;

export type LedgerType = 'grant' | 'buyIn' | 'cashOut' | 'freeCharge' | 'recovery';

export interface LedgerEntry {
  id: number;
  at: number;
  type: LedgerType;
  /** 계정 잔액 변화량 (입장은 음수) */
  amount: number;
  balance: number;
  tableId: string | null;
  note: string;
}

export interface TableEscrow {
  buyIn: number;
  /** 팟에 넣지 않은 테이블 칩 */
  stack: number;
  /** 진행 중인 판에 낸 칩 */
  committed: number;
  handNo: number;
  openedAt: number;
}

export interface WalletData {
  version: 1;
  balance: number;
  tables: Record<string, TableEscrow>;
  freeCharge: { day: string; count: number; lastAt: number };
  ledger: LedgerEntry[];
  ops: Record<string, { ok: boolean; error?: string }>;
  opOrder: string[];
  seq: number;
}

export interface FreeChargeStatus {
  amount: number;
  threshold: number;
  dailyLimit: number;
  remaining: number;
  eligible: boolean;
  reason: string | null;
  resetsAt: number;
}

export interface WalletAccount {
  balance: number;
  tables: Array<TableEscrow & { tableId: string }>;
  tableTotal: number;
  freeCharge: FreeChargeStatus;
}

export type WalletOp =
  | { type: 'buyIn'; opId: string; tableId: string; amount: number; label?: string }
  | { type: 'cashOut'; opId: string; tableId: string; stack: number; reason: 'leave' | 'bust' }
  | { type: 'claimFree'; opId: string }
  | { type: 'checkpoint'; tableId: string; stack: number; committed: number; handNo: number };

export type WalletResult =
  | { ok: true; account: WalletAccount; duplicate?: boolean }
  | { ok: false; error: string; account: WalletAccount; duplicate?: boolean };

export declare function localDay(now: number): string;
export declare function createWallet(now: number): WalletData;
export declare function isWalletData(v: unknown): v is WalletData;
export declare function freeChargeStatus(data: WalletData, now: number): FreeChargeStatus;
export declare function toAccount(data: WalletData, now: number): WalletAccount;
export declare function applyWalletOp(
  prev: WalletData,
  op: WalletOp,
  now: number,
): { data: WalletData; result: WalletResult };
export declare function recoverOpenTables(
  prev: WalletData,
  now: number,
): { data: WalletData; recovered: Array<{ tableId: string; amount: number }> };
