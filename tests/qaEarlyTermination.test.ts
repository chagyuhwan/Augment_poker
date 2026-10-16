/**
 * P0 우선: 비정상 조기 종료 · 런아웃 · 증강 정지 · actLast 크래시 · 숏 BB
 */
import { describe, expect, it } from 'vitest';
import {
  AUGMENT_PICK_MS,
  act,
  byId,
  chooseAugment,
  invokeAugment,
  legalActions,
  tickTimeouts,
} from '../src/practice/game/engine';
import { fullDeck, makeCard, sameFace } from '../src/practice/game/cards';
import type { Card, GameState } from '../src/practice/game/types';
import { makeTable, playHandToEnd, runManyHands, seeded, T0 } from './qaHarness';

let testCardId = 50_000;
const c = (s: string): Card => {
  const rankMap: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return makeCard({ nextCardId: testCardId++ }, rankMap[s[0]] ?? Number(s[0]), s[1] as Card['suit']);
};
const cards = (s: string) => s.split(' ').map(c);

function rig(s: GameState, holes: Record<number, string>, board: string): GameState {
  const r = structuredClone(s);
  const used: Card[] = [];
  for (const [id, h] of Object.entries(holes)) {
    const p = byId(r, Number(id))!;
    p.hole = cards(h);
    used.push(...p.hole);
  }
  const b = cards(board);
  used.push(...b);
  const rest = fullDeck(r).filter((x) => !used.some((u) => sameFace(u, x)));
  r.deck = [...rest, ...[...b].reverse()];
  return r;
}

function doAct(s: GameState, action: Parameters<typeof act>[2]): GameState {
  const r = act(s, s.currentPlayer, action, s.actionSeq, T0);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('조기 종료 / 런아웃 (실실행)', () => {
  it('전원 체크다운이면 보드 5장 후 쇼다운', () => {
    let s = makeTable([2000, 2000], { mode: 'normal' });
    s = rig(s, { 0: 'As Kh', 1: 'Qd Jc' }, '2c 3d 4h 5s 9c');
    const rng = seeded(1);
    const result = playHandToEnd(s, { rng, style: 'passive' });
    expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe('handOver');
    expect(result.state.result?.showdown).toBe(true);
    expect(result.state.community).toHaveLength(5);
    expect(result.incompleteBoard).toBe(false);
  });

  it('프리플랍 올인 런아웃도 보드 5장까지 깐 뒤 쇼다운', () => {
    let s = makeTable([100, 100], { mode: 'normal' });
    s = rig(s, { 0: 'As Ah', 1: 'Kd Kh' }, '2c 3d 4h 5s 9c');
    // 1:1 딜러(SB) 먼저
    while (s.phase === 'betting') {
      const p = byId(s, s.currentPlayer)!;
      const legal = legalActions(s, p);
      s = doAct(s, legal.canRaise ? { type: 'raise', amount: legal.allInTo } : { type: 'call' });
    }
    expect(s.phase).toBe('handOver');
    expect(s.result?.showdown).toBe(true);
    expect(s.community).toHaveLength(5);
  });

  it('한 명만 폴드하면 쇼다운 없이 폴드승 (정상 조기종료)', () => {
    let s = makeTable([1000, 1000], { mode: 'normal' });
    s = doAct(s, { type: 'fold' });
    expect(s.phase).toBe('handOver');
    expect(s.result?.showdown).toBe(false);
    expect(s.community.length).toBe(0);
  });

  it('증강 모드 올인 런아웃 중 증강 선택 후 보드를 마저 깐다', () => {
    let s = makeTable([200, 200], { mode: 'augmented' });
    s = rig(s, { 0: 'As Ah', 1: 'Kd Kh' }, '2c 3d 4h 5s 9c');
    let now = T0;
    while (s.phase === 'betting') {
      const p = byId(s, s.currentPlayer)!;
      const legal = legalActions(s, p);
      const r = act(s, s.currentPlayer, legal.canRaise ? { type: 'raise', amount: legal.allInTo } : { type: 'call' }, s.actionSeq, now);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    // 프리플랍 증강 → 턴 증강 → 쇼다운
    let guard = 0;
    while (s.phase !== 'handOver' && guard++ < 20) {
      if (s.phase === 'augment') {
        for (const [idStr, e] of Object.entries(s.augmentRound!.entries)) {
          if (e.done) continue;
          const pick = e.offer.find((id) => id !== 'rerollFate') ?? e.offer[0];
          const rr = chooseAugment(s, Number(idStr), pick, null, now);
          if (rr.ok) s = rr.state;
        }
        if (s.phase === 'augment') {
          now += AUGMENT_PICK_MS + 1;
          s = tickTimeouts(s, now);
        }
      } else break;
    }
    expect(s.phase).toBe('handOver');
    expect(s.result?.showdown).toBe(true);
    expect(s.community).toHaveLength(5);
    expect(s.augmentRoundsDone).toBe(2);
  });

  it('증강 선택 타임아웃이 지나면 자동 진행된다', () => {
    let s = makeTable([1000, 1000, 1000], { mode: 'augmented' });
    // 전원 콜로 프리플랍 종료 → 증강
    let guard = 0;
    while (s.phase === 'betting' && s.street === 'preflop' && guard++ < 30) {
      s = doAct(s, { type: 'call' });
    }
    expect(s.phase).toBe('augment');
    const now = (s.augmentRound?.deadline ?? T0) + 1;
    s = tickTimeouts(s, now);
    expect(s.phase).not.toBe('augment');
    expect(['betting', 'handOver']).toContain(s.phase);
  });
});

describe('actLast / 숏 BB (실실행)', () => {
  it('actLast 후에도 핸드가 크래시 없이 끝까지 간다', () => {
    let s = makeTable([2000, 500, 500], { mode: 'augmented' });
    // 프리플랍 콜로 플랍 진입 전 증강
    let guard = 0;
    while (s.phase === 'betting' && s.street === 'preflop' && guard++ < 40) {
      s = doAct(s, { type: 'call' });
    }
    expect(s.phase).toBe('augment');
    // 전원에게 actLast가 있으면 좋지만 offer에 없을 수 있음 — 강제로 장착 후 사용
    for (const p of s.players) {
      if (!p.folded) p.augments = [{ id: 'actLast', used: false }];
    }
    // 증강 선택 스킵: 타임아웃
    s = tickTimeouts(s, (s.augmentRound?.deadline ?? T0) + 1);
    // 플랍 베팅 중 actLast 사용
    if (s.phase === 'betting') {
      const actor = s.players.find((p) => p.augments.some((a) => a.id === 'actLast' && !a.used))!;
      const r = invokeAugment(s, 'actLast', { type: 'none' }, actor.id);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    // 숏 스택 올인으로 홀로 액터 만들기
    const rng = seeded(99);
    const result = playHandToEnd(s, { rng, style: 'allin', useAugmentChance: 0 });
    expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe('handOver');
  });

  it('숏 스택 BB는 실제 포스트 금액만큼만 콜을 요구한다', () => {
    let s = makeTable([1000, 7], { mode: 'normal', smallBlind: 5, bigBlind: 10 });
    // stacks[0]=hero seat0, stacks[1]=P1. 2인: 딜러=SB, 다른 쪽=BB
    const bb = s.players.find((p) => p.lastAction?.startsWith('BB'))!;
    expect(bb.bet).toBe(7);
    expect(bb.allIn).toBe(true);
    expect(s.currentBet).toBe(7);
    const actor = byId(s, s.currentPlayer)!;
    const legal = legalActions(s, actor);
    expect(legal.toCall).toBe(Math.max(0, 7 - actor.bet));
  });
});

describe('인원별 랜덤 시뮬 (실실행)', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    it(`${n}인 증강 홀덤 80핸드 — 비정상 종료·칩 누수 없음`, () => {
      const stats = runManyHands({
        seed: 1000 + n,
        hands: 80,
        stacks: Array.from({ length: n }, () => 3000),
        mode: 'augmented',
        style: 'random',
        refill: true,
        targetPlayers: n,
        useAugmentChance: 0.3,
      });
      expect(stats.errors.slice(0, 3)).toEqual([]);
      expect(stats.incompleteBoard).toBe(0);
      expect(stats.contestedBad).toBe(0);
      expect(stats.completed).toBeGreaterThanOrEqual(80);
    }, 60_000);
  }

  it('일반 홀덤 200핸드 칩 보존', () => {
    const stats = runManyHands({
      seed: 42,
      hands: 200,
      stacks: [5000, 5000, 5000, 5000],
      mode: 'normal',
      style: 'random',
      refill: true,
      targetPlayers: 4,
      useAugmentChance: 0,
    });
    expect(stats.errors).toHaveLength(0);
    expect(stats.completed).toBe(200);
  }, 60_000);
});



