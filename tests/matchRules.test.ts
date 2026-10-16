import { describe, expect, it } from 'vitest';
import {
  blindsForHand,
  blindMultiplier,
  netChipScore,
  nextBlindIncreaseHand,
  rankMatchPlayers,
} from '../src/core/matchRules';
import { createPracticeTable } from '../src/practice/game/botTable';
import { fullDeck, makeCard, sameFace } from '../src/practice/game/cards';
import {
  act,
  byId,
  createTable,
  getMatchStandings,
  legalActions,
  rematch,
  requestLeave,
  startHand,
  type CreateTableOptions,
} from '../src/practice/game/engine';
import type { Card, GameState, PlayerAction } from '../src/practice/game/types';

const T = 1_000_000;
let testCardId = 50000;
const c = (s: string): Card => {
  const rankMap: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return makeCard({ nextCardId: testCardId++ }, rankMap[s[0]] ?? Number(s[0]), s[1] as Card['suit']);
};
const cards = (s: string) => s.split(' ').map(c);

function table(o: Partial<CreateTableOptions> & { stacks: number[] }): GameState {
  return createTable(
    {
      tableId: 'match-test',
      mode: o.mode ?? 'normal',
      hero: { name: '나', isHuman: true, chips: o.stacks[0] },
      others: o.stacks.slice(1).map((chips, i) => ({ name: `봇${i + 1}`, isHuman: false, chips })),
      smallBlind: o.smallBlind ?? 10,
      bigBlind: o.bigBlind ?? 20,
      maxBet: o.maxBet ?? null,
      matchHands: o.matchHands ?? 8,
      startingChips: o.startingChips ?? 1000,
    },
    T,
  );
}

/** player id → 홀카드 */
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

function doAct(s: GameState, a: PlayerAction): GameState {
  const r = act(s, s.currentPlayer, a, s.actionSeq, T);
  if (!r.ok) throw new Error(`${a.type} rejected: ${r.error}`);
  return r.state;
}

function allInAll(s: GameState): GameState {
  let cur = s;
  let guard = 0;
  while (cur.phase === 'betting' && guard++ < 80) {
    const p = byId(cur, cur.currentPlayer)!;
    const legal = legalActions(cur, p);
    cur = doAct(cur, legal.allInTo > cur.currentBet ? { type: 'raise', amount: legal.allInTo } : { type: 'call' });
  }
  return cur;
}

describe('blindsForHand', () => {
  it('8핸드 기본 스케줄을 따른다', () => {
    expect(blindsForHand(1, 8, 10, 20)).toEqual({ sb: 10, bb: 20 });
    expect(blindsForHand(2, 8, 10, 20)).toEqual({ sb: 10, bb: 20 });
    expect(blindsForHand(3, 8, 10, 20)).toEqual({ sb: 15, bb: 30 });
    expect(blindsForHand(5, 8, 10, 20)).toEqual({ sb: 20, bb: 40 });
    expect(blindsForHand(7, 8, 10, 20)).toEqual({ sb: 30, bb: 60 });
  });

  it('12·16핸드에서도 단계가 늘어난다', () => {
    expect(blindMultiplier(1, 12)).toBe(1);
    expect(blindMultiplier(4, 12)).toBe(1.5);
    expect(blindMultiplier(7, 12)).toBe(2);
    expect(blindMultiplier(10, 12)).toBe(3);
    expect(nextBlindIncreaseHand(1, 8)).toBe(3);
    expect(nextBlindIncreaseHand(8, 8)).toBeNull();
  });
});

describe('netChipScore / rankMatchPlayers', () => {
  it('순이익 = 보유 - 지급 총합', () => {
    expect(netChipScore(1500, 1000)).toBe(500);
    expect(netChipScore(800, 2000)).toBe(-1200);
  });

  it('복구가 많은 플레이어가 칩이 많아도 순이익이 낮을 수 있다', () => {
    const ranks = rankMatchPlayers([
      { id: 1, name: 'A', chips: 2000, chipGranted: 1000, chipRefills: 0, handsWon: 2, potWon: 1000 },
      { id: 2, name: 'B', chips: 3000, chipGranted: 3000, chipRefills: 2, handsWon: 1, potWon: 500 },
    ]);
    expect(ranks[0].name).toBe('A');
    expect(ranks[0].netScore).toBe(1000);
    expect(ranks[1].netScore).toBe(0);
  });

  it('동점이면 공동 순위', () => {
    const ranks = rankMatchPlayers([
      { id: 1, name: 'A', chips: 1000, chipGranted: 1000, chipRefills: 0, handsWon: 0, potWon: 0 },
      { id: 2, name: 'B', chips: 1000, chipGranted: 1000, chipRefills: 0, handsWon: 0, potWon: 0 },
      { id: 3, name: 'C', chips: 500, chipGranted: 1000, chipRefills: 0, handsWon: 0, potWon: 0 },
    ]);
    expect(ranks[0].rank).toBe(1);
    expect(ranks[1].rank).toBe(1);
    expect(ranks[2].rank).toBe(3);
  });
});

describe('칩 복구와 매치 종료', () => {
  it('시작 칩을 전원 동일하게 지급한다', () => {
    const s = createPracticeTable({
      tableId: 'p',
      mode: 'normal',
      playerName: '나',
      buyIn: 1000,
      botCount: 2,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 1000,
      startingChips: 1000,
      matchHands: 6,
      maxBet: null,
    });
    for (const p of s.players) {
      expect(p.chipGranted).toBe(1000);
      expect(p.chipRefills).toBe(0);
    }
    expect(s.startingChips).toBe(1000);
    expect(s.matchHands).toBe(6);
  });

  it('올인 중에는 복구하지 않고, 다음 핸드에서 한 번만 복구한다', () => {
    let s = table({ stacks: [100, 1000, 1000], startingChips: 1000, matchHands: 8 });
    expect(s.phase).toBe('betting');
    const ids = s.players.map((p) => p.id);
    s = rig(s, { [ids[0]]: '7c 2d', [ids[1]]: 'As Ah', [ids[2]]: 'Ks Kh' }, 'Qd 9s 4h 3c 8d');
    s = allInAll(s);
    expect(s.phase).toBe('handOver');
    const me = byId(s, s.heroId)!;
    expect(me.chips).toBe(0);
    expect(me.status).toBe('active');
    expect(s.events.some((e) => e.type === 'busted' && e.playerId === me.id)).toBe(true);
    expect(s.events.some((e) => e.type === 'chipRefill')).toBe(false);

    const grantedBefore = me.chipGranted;
    const next = startHand(s, T);
    const refilled = byId(next, me.id)!;
    expect(refilled.chipGranted).toBe(grantedBefore + 1000);
    expect(refilled.chipRefills).toBe(1);
    expect(refilled.inHand).toBe(true);
    expect(refilled.chips).toBeGreaterThan(0);
    expect(next.events.filter((e) => e.type === 'chipRefill' && e.playerId === me.id)).toHaveLength(1);
  });

  it('마지막 핸드 후에는 복구하지 않고 matchOver로 간다', () => {
    let s = table({ stacks: [100, 1000], startingChips: 1000, matchHands: 1 });
    expect(s.handNumber).toBe(1);
    const ids = s.players.map((p) => p.id);
    s = rig(s, { [ids[0]]: '7c 2d', [ids[1]]: 'As Ah' }, 'Kd 9s 4h 3c 8d');
    s = allInAll(s);
    expect(s.phase).toBe('handOver');
    expect(byId(s, s.heroId)!.chips).toBe(0);
    const ended = startHand(s, T);
    expect(ended.phase).toBe('matchOver');
    expect(byId(ended, ended.heroId)!.chips).toBe(0);
    expect(ended.events.some((e) => e.type === 'chipRefill')).toBe(false);
    expect(ended.events.some((e) => e.type === 'matchEnded')).toBe(true);
  });

  it('재대전 시 칩·증강·핸드를 초기화한다', () => {
    let s = table({ stacks: [500, 1500], startingChips: 1000, matchHands: 2, mode: 'augmented' });
    const hero = byId(s, s.heroId)!;
    hero.chipRefills = 2;
    hero.chipGranted = 3000;
    hero.handsWon = 3;
    hero.augments = [{ id: 'clone', used: false }];
    s.handNumber = 2;
    s.phase = 'matchOver';
    const again = rematch(s, T);
    expect(again.handNumber).toBe(1);
    expect(again.phase).toBe('betting');
    for (const p of again.players) {
      expect(p.chipGranted).toBe(1000);
      expect(p.chipRefills).toBe(0);
      expect(p.handsWon).toBe(0);
      expect(p.augments).toEqual([]);
      expect(p.chips).toBeLessThanOrEqual(1000);
    }
  });

  it('중도 퇴장 시 DNF로 구분된다', () => {
    let s = table({ stacks: [1000, 1000, 1000], startingChips: 1000, matchHands: 4 });
    const leave = requestLeave(s, s.heroId, T);
    expect(leave.ok).toBe(true);
    if (!leave.ok) return;
    if (leave.state.players.some((p) => p.id === s.heroId && p.status === 'leaving')) {
      leave.state.phase = 'matchOver';
      const standings = getMatchStandings(leave.state);
      expect(standings.find((x) => x.playerId === s.heroId)?.dnf).toBe(true);
    } else {
      expect(leave.state.players.some((p) => p.id === s.heroId)).toBe(false);
    }
  });
});
