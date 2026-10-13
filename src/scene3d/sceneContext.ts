import { createContext, useContext, useEffect, useRef } from 'react';
import type { GameState } from '../practice/game/types';
import type { FxBus, FxEvent } from './fxBus';
import { polar, SEAT, seatAngle, TABLE_Y, viewIndexOf, type Vec3 } from './layout';

export interface SceneData {
  state: GameState;
  bus: FxBus;
  /** 애니메이션 속도 배율 (설정 '카드 애니메이션 속도') */
  speed: number;
  reduceMotion: boolean;
  paused: boolean;
  busyUntil: { current: number };
  htmlLayer: { current: HTMLDivElement };
  /** 본인 카드 클릭(멀리건 증강) */
  onHeroCard?: (index: number) => void;
  /** 내 패를 카메라 앞으로 크게 당겨 본다 */
  zoomHand?: boolean;
}

export const SceneContext = createContext<SceneData | null>(null);
export const useScene = () => useContext(SceneContext)!;

/** 플레이어 id → 화면 좌석 위치(0 = 본인 자리) */
export function viewOf(state: GameState, playerId: number): number {
  const hero = state.players.find((p) => p.id === state.heroId);
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  return viewIndexOf(p.seat, hero?.seat ?? 0, state.maxSeats);
}

export function seatPoint(state: GameState, playerId: number, r: number, y = TABLE_Y): Vec3 {
  return polar(seatAngle(viewOf(state, playerId)), r, y);
}

export function stackPoint(state: GameState, playerId: number): Vec3 {
  const v = viewOf(state, playerId);
  const a = seatAngle(v) + (v === 0 ? -0.62 : -0.3);
  return polar(a, SEAT.stack, TABLE_Y);
}

export function betPoint(state: GameState, playerId: number): Vec3 {
  return seatPoint(state, playerId, viewOf(state, playerId) === 0 ? SEAT.heroBet : SEAT.bet);
}

/** 버스 이벤트 구독 (최신 콜백 유지) */
export function useFx(handler: (e: FxEvent) => void) {
  const { bus } = useScene();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => bus.subscribe((e) => ref.current(e)), [bus]);
}
