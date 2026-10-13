import type { LedgerEntry, WalletAccount } from '../../electron/walletCore.mjs';

export type { FreeChargeStatus, LedgerEntry, LedgerType, WalletAccount } from '../../electron/walletCore.mjs';

export interface WalletSnapshot {
  available: boolean;
  /** 지갑을 쓸 수 없을 때의 이유 */
  error: string | null;
  account: WalletAccount | null;
  /** 이번 실행에서 비정상 종료 테이블을 정산한 내역 */
  recovered: Array<{ tableId: string; amount: number }>;
}

export type WalletOpResult = { ok: true; account: WalletAccount } | { ok: false; error: string; account: WalletAccount | null };

/**
 * 계정 게임머니. 잔액의 권한자는 구현체 뒤에 있다(현재 Electron 메인 프로세스, 이후 게임 서버).
 * 화면은 결과로 받은 account만 표시하고 잔액을 직접 계산하지 않는다.
 */
export interface IWalletService {
  /** 앱을 다시 켜도 잔액이 유지되는 저장소인지 (브라우저 개발 모드는 false) */
  readonly persistent: boolean;
  snapshot(): Promise<WalletSnapshot>;
  history(): Promise<LedgerEntry[]>;
  buyIn(tableId: string, amount: number, label: string): Promise<WalletOpResult>;
  /** stack: 팟에 넣지 않은 칩, committed: 진행 중인 판에 낸 칩 */
  checkpoint(tableId: string, stack: number, committed: number, handNo: number): Promise<WalletOpResult>;
  cashOut(tableId: string, stack: number, reason: 'leave' | 'bust'): Promise<WalletOpResult>;
  claimFreeCharge(): Promise<WalletOpResult>;
  subscribe(listener: (snapshot: WalletSnapshot) => void): () => void;
}
