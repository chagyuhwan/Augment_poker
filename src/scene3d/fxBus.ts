import type { AugmentTier, Street } from '../practice/game/types';

/** 연출 이벤트. at은 performance.now() 기준 시작 시각, dur는 길이(ms) */
export type FxEvent = { id: number; at: number; dur: number } & (
  | { type: 'deal'; handNo: number; order: { playerId: number; idx: number }[] }
  | { type: 'bet'; playerId: number; amount: number; allIn: boolean }
  | { type: 'check'; playerId: number }
  | { type: 'fold'; playerId: number }
  | { type: 'collect'; from: { playerId: number; amount: number }[] }
  | { type: 'street'; street: Street; from: number; count: number }
  | { type: 'showdown' }
  | { type: 'award'; winners: { playerId: number; amount: number }[]; showdown: boolean }
  | { type: 'augment'; playerId: number; tier: AugmentTier; name: string }
  | { type: 'busted'; playerId: number }
  | { type: 'turn'; playerId: number; hero: boolean }
);

type Listener = (e: FxEvent) => void;

export interface FxBus {
  emit(e: FxEvent): void;
  subscribe(fn: Listener): () => void;
  /** 최근 이벤트(늦게 마운트된 컴포넌트가 진행 중인 연출을 이어받는다) */
  recent(): readonly FxEvent[];
}

export function createFxBus(): FxBus {
  const listeners = new Set<Listener>();
  let log: FxEvent[] = [];
  return {
    emit(e) {
      log.push(e);
      if (log.length > 80) log = log.slice(-60);
      for (const fn of listeners) fn(e);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    recent: () => log,
  };
}
