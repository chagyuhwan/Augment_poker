import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/services';
import type { WalletSnapshot } from './types';

/** 현재 지갑 상태를 구독한다. 작업 결과가 오면 자동으로 갱신된다. */
export function useWallet() {
  const { wallet } = useServices();
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);

  const refresh = useCallback(async () => {
    const s = await wallet.snapshot();
    setSnapshot(s);
    return s;
  }, [wallet]);

  useEffect(() => {
    void refresh();
    return wallet.subscribe(setSnapshot);
  }, [wallet, refresh]);

  return { snapshot, account: snapshot?.account ?? null, refresh, wallet };
}

export const fmtMoney = (n: number) => n.toLocaleString('ko-KR');
