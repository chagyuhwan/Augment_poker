import { useEffect, useMemo, useRef } from 'react';
import { audio } from '../audio/audioEngine';
import { AUGMENTS } from '../practice/game/augments';
import type { GameState, Player } from '../practice/game/types';
import { createFxBus, type FxBus, type FxEvent } from './fxBus';

/** 연출 길이(ms, 보통 속도 기준) */
export const FX_MS = {
  dealCard: 110,
  dealTail: 380,
  bet: 420,
  fold: 320,
  collect: 520,
  streetCard: 260,
  streetTail: 260,
  showdown: 700,
  award: 1500,
  augment: 1200,
  busted: 900,
};

type EventInput = FxEvent extends infer E ? (E extends FxEvent ? Omit<E, 'id' | 'at'> : never) : never;

export interface TableDirector {
  bus: FxBus;
  /** 이 시각(performance.now) 전까지는 화면 연출이 진행 중이다 */
  busyUntil: { current: number };
}

/**
 * 엔진 상태가 바뀔 때마다 이전 상태와 비교해 연출 이벤트를 순서대로 큐에 넣는다.
 * 엔진은 즉시 다음 상태가 되고 화면만 시간차로 따라간다. 봇 행동과 다음 판 시작은 busyUntil 뒤로 미룬다.
 */
export function useTableDirector(state: GameState, speed: number, paused: boolean): TableDirector {
  const bus = useMemo(() => createFxBus(), []);
  const busyUntil = useRef(0);
  const prevRef = useRef<GameState | null>(null);
  const nextId = useRef(1);
  const pausedAt = useRef<number | null>(null);

  // 일시정지하면 진행 중인 연출 시간만큼 뒤로 민다
  useEffect(() => {
    if (paused) {
      pausedAt.current = performance.now();
    } else if (pausedAt.current !== null) {
      busyUntil.current += performance.now() - pausedAt.current;
      pausedAt.current = null;
    }
  }, [paused]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!prev || prev === state) return;

    const now = performance.now();
    let cursor = Math.max(now, busyUntil.current - 200);
    const push = (e: EventInput, sfx?: Parameters<typeof audio.play>[0]) => {
      const dur = e.dur * speed;
      const ev = { ...e, dur, id: nextId.current++, at: cursor } as FxEvent;
      bus.emit(ev);
      if (sfx) {
        const delay = Math.max(0, cursor - now);
        if (delay < 16) audio.play(sfx);
        else setTimeout(() => audio.play(sfx), delay);
      }
      cursor += dur;
      busyUntil.current = Math.max(busyUntil.current, cursor);
    };

    const byId = new Map(prev.players.map((p) => [p.id, p]));
    const newHand = state.handNumber !== prev.handNumber && state.phase !== 'waiting';

    if (newHand) {
      // 딜러 왼쪽부터 한 장씩 두 바퀴
      const dealt = state.players.filter((p) => p.inHand);
      const dealerIdx = Math.max(0, dealt.findIndex((p) => p.seat === state.dealerSeat));
      const ordered = [...dealt.slice(dealerIdx + 1), ...dealt.slice(0, dealerIdx + 1)];
      const rounds = Math.max(0, ...ordered.map((p) => p.hole.length));
      const order: { playerId: number; idx: number }[] = [];
      for (let r = 0; r < rounds; r++) for (const p of ordered) if (p.hole[r]) order.push({ playerId: p.id, idx: r });
      push({ type: 'deal', handNo: state.handNumber, order, dur: order.length * FX_MS.dealCard + FX_MS.dealTail }, 'shuffle');
      // 블라인드
      for (const p of state.players) {
        if (p.bet > 0) push({ type: 'bet', playerId: p.id, amount: p.bet, allIn: p.allIn, dur: 160 }, 'chip');
      }
      return;
    }
    if (state.handNumber !== prev.handNumber) return;

    // 액션: 베팅·체크·폴드
    for (const p of state.players) {
      const was = byId.get(p.id);
      if (!was) continue;
      if (p.folded && !was.folded) push({ type: 'fold', playerId: p.id, dur: FX_MS.fold }, 'fold');
      else if (p.totalBet > was.totalBet) {
        const allIn = p.allIn && !was.allIn;
        push({ type: 'bet', playerId: p.id, amount: p.totalBet - was.totalBet, allIn, dur: FX_MS.bet }, allIn ? 'allIn' : 'chip');
      } else if (p.lastAction !== was.lastAction && p.lastAction === '체크') {
        push({ type: 'check', playerId: p.id, dur: 220 }, 'check');
      }
    }

    // 스트리트가 넘어가거나 판이 끝나면 베팅을 팟으로 모은다
    const streetChanged = state.community.length > prev.community.length;
    const ended = state.phase === 'handOver' && prev.phase !== 'handOver';
    if (streetChanged || ended) {
      const from = prev.players
        .map((p) => ({ playerId: p.id, amount: betAfterAction(p, state) }))
        .filter((x) => x.amount > 0);
      if (from.length) push({ type: 'collect', from, dur: FX_MS.collect }, 'chipStack');
    }
    if (streetChanged) {
      // 올인 런아웃은 스트리트별로 끊어서 보여 준다
      let from = prev.community.length;
      for (const step of runoutSteps(prev.community.length, state.community.length)) {
        push(
          { type: 'street', street: streetOf(from + step), from, count: step, dur: step * FX_MS.streetCard + FX_MS.streetTail },
          'cardFlip',
        );
        from += step;
      }
    }

    if (ended && state.result) {
      if (state.result.showdown) push({ type: 'showdown', dur: FX_MS.showdown }, 'reveal');
      const winners = state.result.winnerIds.map((id) => {
        const before = byId.get(id);
        const net = state.result!.net[id] ?? 0;
        return { playerId: id, amount: Math.max(0, net + (before ? totalCommitted(before, state, id) : 0)) };
      });
      const heroWon = state.result.winnerIds.includes(state.heroId);
      const heroIn = state.players.find((p) => p.id === state.heroId)?.inHand;
      push({ type: 'award', winners, showdown: state.result.showdown, dur: FX_MS.award }, heroWon ? 'win' : heroIn ? 'lose' : 'chipStack');
    }

    // 증강 획득
    for (const p of state.players) {
      const was = byId.get(p.id);
      if (!was) continue;
      for (const a of p.augments) {
        if (!was.augments.some((o) => o.id === a.id)) {
          const def = AUGMENTS[a.id];
          push(
            { type: 'augment', playerId: p.id, tier: def.tier, name: def.name, dur: p.id === state.heroId ? FX_MS.augment : 360 },
            p.id === state.heroId ? (def.tier === 'prismatic' ? 'augmentRare' : 'augment') : undefined,
          );
        }
      }
      if (p.status === 'busted' && was.status !== 'busted') push({ type: 'busted', playerId: p.id, dur: FX_MS.busted }, p.id === state.heroId ? 'bust' : 'fold');
    }

    // 차례 알림
    if (state.phase === 'betting' && state.currentPlayer !== prev.currentPlayer && state.currentPlayer >= 0) {
      const hero = state.currentPlayer === state.heroId;
      push({ type: 'turn', playerId: state.currentPlayer, hero, dur: 0 }, hero ? 'turn' : undefined);
    }
  }, [state, speed, bus]);

  return { bus, busyUntil };
}

/** 이전 상태의 이번 스트리트 베팅 + 이번 변화에서 더 낸 금액 (액션과 스트리트 전환이 한 번에 일어난 경우) */
function betAfterAction(prevP: Player, next: GameState): number {
  const n = next.players.find((p) => p.id === prevP.id);
  const added = n ? Math.max(0, n.totalBet - prevP.totalBet) : 0;
  // 판이 끝나면 엔진이 totalBet을 0으로 되돌리므로 prev 기준으로만 계산
  if (next.phase === 'handOver') return prevP.bet + Math.max(0, added);
  return prevP.bet + added - (n?.bet ?? 0);
}

function totalCommitted(prevP: Player, next: GameState, id: number): number {
  const n = next.players.find((p) => p.id === id);
  return prevP.totalBet + (n && next.phase !== 'handOver' ? Math.max(0, n.totalBet - prevP.totalBet) : 0);
}

function runoutSteps(from: number, to: number): number[] {
  const steps: number[] = [];
  let c = from;
  while (c < to) {
    const step = c === 0 ? Math.min(3, to - c) : 1;
    steps.push(step);
    c += step;
  }
  return steps;
}

function streetOf(cards: number) {
  return cards <= 3 ? 'flop' : cards === 4 ? 'turn' : 'river';
}
