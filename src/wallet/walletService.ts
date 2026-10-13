import {
  applyWalletOp,
  createWallet,
  isWalletData,
  recoverOpenTables,
  toAccount,
  type LedgerEntry,
  type WalletData,
  type WalletOp,
} from '../../electron/walletCore.mjs';
import { bridge, desktop } from '../platform/desktopBridge';
import type { IWalletService, WalletOpResult, WalletSnapshot } from './types';

interface WalletBackend {
  get(): Promise<WalletSnapshot>;
  history(): Promise<LedgerEntry[]>;
  op(op: WalletOp): Promise<WalletOpResult>;
}

export function newOpId(): string {
  return crypto.randomUUID();
}

export function newTableId(prefix = 'bot'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

class WalletService implements IWalletService {
  private listeners = new Set<(s: WalletSnapshot) => void>();
  private last: WalletSnapshot | null = null;

  constructor(
    private backend: WalletBackend,
    readonly persistent: boolean,
  ) {}

  async snapshot(): Promise<WalletSnapshot> {
    this.last = await this.backend.get();
    return this.last;
  }

  history(): Promise<LedgerEntry[]> {
    return this.backend.history();
  }

  buyIn(tableId: string, amount: number, label: string) {
    return this.run({ type: 'buyIn', opId: newOpId(), tableId, amount, label });
  }

  checkpoint(tableId: string, stack: number, committed: number, handNo: number) {
    return this.run({ type: 'checkpoint', tableId, stack, committed, handNo }, false);
  }

  cashOut(tableId: string, stack: number, reason: 'leave' | 'bust') {
    return this.run({ type: 'cashOut', opId: newOpId(), tableId, stack, reason });
  }

  claimFreeCharge() {
    return this.run({ type: 'claimFree', opId: newOpId() });
  }

  subscribe(listener: (s: WalletSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async run(op: WalletOp, notify = true): Promise<WalletOpResult> {
    let result: WalletOpResult;
    try {
      result = await this.backend.op(op);
    } catch (err) {
      // 같은 opId로 한 번 더 보낸다. 첫 요청이 이미 처리됐다면 장부가 중복을 무시한다.
      bridge.log('warn', `wallet ${op.type} failed once, retrying: ${String(err)}`);
      try {
        result = await this.backend.op(op);
      } catch (err2) {
        bridge.log('error', `wallet ${op.type} failed: ${String(err2)}`);
        return { ok: false, error: '게임머니 처리 중 오류가 발생했습니다.', account: this.last?.account ?? null };
      }
    }
    if (result.account) {
      this.last = { available: true, error: null, account: result.account, recovered: this.last?.recovered ?? [] };
      if (notify) for (const l of this.listeners) l(this.last);
    }
    return result;
  }
}

const desktopBackend = (): WalletBackend => ({
  get: () => desktop!.walletGet(),
  history: () => desktop!.walletHistory(),
  op: (op) => desktop!.walletOp(op),
});

const DEV_KEY = 'augmented-poker-wallet-dev';

/** 브라우저 개발 모드 전용. 같은 장부 규칙을 쓰지만 localStorage라 보안 의미는 없다. */
function browserBackend(): WalletBackend {
  let recovered: WalletSnapshot['recovered'] = [];
  const read = (): WalletData => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(DEV_KEY) ?? 'null');
      if (isWalletData(v)) return v;
    } catch {
      // 손상된 개발용 데이터는 새로 만든다
    }
    return createWallet(Date.now());
  };
  const write = (d: WalletData) => localStorage.setItem(DEV_KEY, JSON.stringify(d));

  const initial = recoverOpenTables(read(), Date.now());
  recovered = initial.recovered;
  write(initial.data);

  return {
    async get() {
      return { available: true, error: null, account: toAccount(read(), Date.now()), recovered };
    },
    async history() {
      return [...read().ledger].reverse();
    },
    async op(op) {
      const { data, result } = applyWalletOp(read(), op, Date.now());
      write(data);
      return result;
    },
  };
}

export function createWalletService(): IWalletService {
  return desktop ? new WalletService(desktopBackend(), true) : new WalletService(browserBackend(), false);
}
