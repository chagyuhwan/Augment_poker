import { describe, expect, it } from 'vitest';
import { decideBotAction } from '../src/practice/game/ai';
import { AUGMENTS, MAX_AUGMENT_SLOTS } from '../src/practice/game/augments';
import { createPracticeTable, refillBots } from '../src/practice/game/botTable';
import { fullDeck, sameCard } from '../src/practice/game/cards';
import {
  AUGMENT_PICK_MS,
  RECONNECT_GRACE_MS,
  act,
  applyAction,
  buildPots,
  byId,
  canStartHand,
  chooseAugment,
  createTable,
  hasActive,
  legalActions,
  markDisconnected,
  markReconnected,
  requestLeave,
  rerollAugmentSlot,
  seatPlayer,
  startHand,
  tickTimeouts,
  totalChips,
  type CreateTableOptions,
} from '../src/practice/game/engine';
import { evaluate } from '../src/practice/game/evaluator';
import type { Card, GameState, PlayerAction } from '../src/practice/game/types';

const c = (s: string): Card => {
  const rankMap: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return { rank: rankMap[s[0]] ?? Number(s[0]), suit: s[1] as Card['suit'] };
};
const cards = (s: string) => s.split(' ').map(c);

const T = 1_000_000;

function table(o: Partial<CreateTableOptions> & { stacks: number[] }): GameState {
  return createTable(
    {
      tableId: 'test-table',
      mode: o.mode ?? 'normal',
      hero: { name: '나', isHuman: true, chips: o.stacks[0] },
      others: o.stacks.slice(1).map((chips, i) => ({ name: `봇${i + 1}`, isHuman: false, chips })),
      smallBlind: o.smallBlind ?? 5,
      bigBlind: o.bigBlind ?? 10,
      maxBet: o.maxBet ?? null,
    },
    T,
  );
}

/** 지정한 핸드 카드와 보드가 나오도록 덱을 맞춘다. 보드는 앞에서부터 순서대로 깔린다. */
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
  const rest = fullDeck().filter((x) => !used.some((u) => sameCard(u, x)));
  r.deck = [...rest, ...[...b].reverse()];
  return r;
}

function doAct(s: GameState, action: PlayerAction): GameState {
  const r = act(s, s.currentPlayer, action, s.actionSeq, T);
  if (!r.ok) throw new Error(`${action.type} rejected: ${r.error}`);
  return r.state;
}

/** 모두 체크/콜로 진행. 증강 선택이 나오면 멈춘다 */
function checkAround(s: GameState): GameState {
  let guard = 0;
  while (s.phase === 'betting' && guard++ < 50) s = doAct(s, { type: 'call' });
  return s;
}

function allInAll(s: GameState): GameState {
  let guard = 0;
  while (s.phase === 'betting' && guard++ < 50) {
    const p = byId(s, s.currentPlayer)!;
    const legal = legalActions(s, p);
    s = doAct(s, legal.allInTo > s.currentBet ? { type: 'raise', amount: legal.allInTo } : { type: 'call' });
  }
  return s;
}

function randomAction(s: GameState, rng: () => number): PlayerAction {
  const p = byId(s, s.currentPlayer)!;
  const legal = legalActions(s, p);
  const r = rng();
  if (r < 0.15 && legal.toCall > 0) return { type: 'fold' };
  if (r < 0.3 && legal.canRaise) {
    const span = legal.maxRaiseTo - legal.minRaiseTo;
    return { type: 'raise', amount: legal.minRaiseTo + Math.floor(rng() * (span + 1)) };
  }
  return { type: 'call' };
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe('테이블 생성과 무제한 진행', () => {
  it('2명 이상이면 바로 첫 판을 시작한다', () => {
    const s = table({ stacks: [1000, 1000, 1000] });
    expect(s.phase).toBe('betting');
    expect(s.handNumber).toBe(1);
    expect(s.players.every((p) => p.hole.length === 2)).toBe(true);
    expect(s.players.every((p) => p.augments.length === 0)).toBe(true);
  });

  it('핸드 수 제한 없이 300판 이상 계속되고, 판마다 칩 총량이 보존된다', () => {
    const rng = seeded(42);
    let s = createPracticeTable(
      { tableId: 'loop-test', mode: 'augmented', playerName: '나', buyIn: 5000, botCount: 4, smallBlind: 5, bigBlind: 10, minBuyIn: 2000, maxBet: null },
      rng,
      T,
    );
    let now = T;
    let hands = 0;
    let guard = 0;
    while (hands < 320 && guard++ < 40_000) {
      if (s.phase === 'betting') {
        s = applyAction(s, randomAction(s, rng), now);
      } else if (s.phase === 'augment') {
        now += AUGMENT_PICK_MS + 1;
        s = tickTimeouts(s, now);
      } else {
        if (s.phase === 'handOver') hands++;
        s = refillBots(s, { botCount: 4, minBuyIn: 2000, bigBlind: 10 }, rng);
        s = startHand(s, now);
        if (s.phase === 'waiting') {
          s = refillBots(s, { botCount: 4, minBuyIn: 2000, bigBlind: 10 }, () => 0);
          if (canStartHand(s)) s = startHand(s, now);
        }
        // 사람이 소진되어 나갔으면 다시 앉힌다(대기 상태로 다음 판부터)
        if (!byId(s, s.heroId)) {
          const r = seatPlayer(s, { name: '나2', isHuman: true, chips: 5000 });
          if (r.ok) s = { ...r.state, heroId: r.playerId! };
        }
        (s as GameState & { __base?: number }).__base = totalChips(s) - s.minted;
        continue;
      }
      if (s.phase === 'handOver') {
        const base = (s as GameState & { __base?: number }).__base;
        if (base !== undefined) expect(totalChips(s) - s.minted).toBe(base);
      }
    }
    expect(hands).toBeGreaterThanOrEqual(300);
    expect(s.handNumber).toBeGreaterThanOrEqual(300);
  });

  it('일반 모드에는 증강 선택이 나오지 않는다', () => {
    const rng = seeded(7);
    let s = table({ stacks: [2000, 2000, 2000] });
    for (let i = 0; i < 400 && s.handNumber < 30; i++) {
      expect(s.phase).not.toBe('augment');
      if (s.phase === 'betting') s = applyAction(s, randomAction(s, rng), T);
      else if (canStartHand(s)) s = startHand(s, T);
      else break;
    }
    expect(s.players.every((p) => p.augments.length === 0)).toBe(true);
  });

  it('봇 AI는 항상 유효한 액션을 낸다', () => {
    let s = table({ stacks: [1000, 1000, 1000], maxBet: 100 });
    let guard = 0;
    while (s.handNumber < 4 && guard++ < 200) {
      if (s.phase === 'betting') {
        const r = act(s, s.currentPlayer, decideBotAction(s), s.actionSeq, T);
        expect(r.ok).toBe(true);
        if (r.ok) s = r.state;
      } else if (canStartHand(s)) s = startHand(s, T);
      else break;
    }
  });
});

describe('올인과 게임머니 소진', () => {
  it('올인한 플레이어는 결과가 나올 때까지 남고, 이기면 계속 플레이한다', () => {
    let s = table({ stacks: [100, 1000] });
    s = rig(s, { 0: 'As Ah', 1: '7c 2d' }, 'Kd 9s 4h 3c 8d');
    // 1:1에서는 딜러(SB)가 먼저 행동한다
    const heroFirst = s.currentPlayer === s.heroId;
    if (!heroFirst) s = doAct(s, { type: 'call' });
    s = doAct(s, { type: 'raise', amount: 100 });
    const heroAfterAllIn = byId(s, s.heroId)!;
    if (s.phase === 'betting') {
      expect(heroAfterAllIn.chips).toBe(0);
      expect(heroAfterAllIn.status).toBe('active');
      expect(s.events.some((e) => e.type === 'busted')).toBe(false);
      s = doAct(s, { type: 'call' });
    }
    expect(s.phase).toBe('handOver');
    expect(byId(s, s.heroId)).toMatchObject({ chips: 200, status: 'active' });
    expect(s.events.some((e) => e.type === 'busted')).toBe(false);
    const next = startHand(s, T);
    expect(next.handNumber).toBe(2);
    expect(byId(next, next.heroId)!.inHand).toBe(true);
  });

  it('판이 끝나고 칩이 0이면 그때 소진 처리하고, 다음 판 전에 자리를 비운다', () => {
    let s = table({ stacks: [100, 1000, 2000] });
    s = rig(s, { 0: '7c 2d', 1: 'As Ah', 2: 'Ks Kh' }, 'Qd 9s 4h 3c 8d');
    s = allInAll(s);
    expect(s.phase).toBe('handOver');
    const me = byId(s, s.heroId)!;
    expect(me.chips).toBe(0);
    expect(me.status).toBe('busted');
    expect(s.events.filter((e) => e.type === 'busted')).toHaveLength(1);

    const next = startHand(s, T);
    expect(byId(next, s.heroId)).toBeUndefined();
    expect(next.players).toHaveLength(2);
    expect(next.phase).toBe('betting');
  });

  it('남은 플레이어가 한 명이면 대기 상태가 되고, 새 참가자가 오면 다시 시작한다', () => {
    let s = table({ stacks: [1000, 50] });
    s = rig(s, { 0: 'As Ah', 1: '7c 2d' }, 'Kd 9s 4h 3c 8d');
    s = allInAll(s);
    expect(byId(s, 1)!.status).toBe('busted');
    s = startHand(s, T);
    expect(s.phase).toBe('waiting');
    expect(canStartHand(s)).toBe(false);

    const r = seatPlayer(s, { name: '새 봇', isHuman: false, chips: 500 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(byId(r.state, r.playerId!)!.status).toBe('active');
    expect(canStartHand(r.state)).toBe(true);
    expect(startHand(r.state, T).phase).toBe('betting');
  });
});

describe('팟 정산', () => {
  it('3명 올인 사이드 팟을 정확히 나눈다', () => {
    let s = table({ stacks: [100, 300, 500] });
    s = rig(s, { 0: 'As Ah', 1: 'Ks Kh', 2: 'Qs Qh' }, '2d 7c 9h 3s 4d');
    s = allInAll(s);
    expect(s.phase).toBe('handOver');
    expect(byId(s, 0)!.chips).toBe(300); // 메인 팟 100×3
    expect(byId(s, 1)!.chips).toBe(400); // 사이드 팟 200×2
    expect(byId(s, 2)!.chips).toBe(200); // 아무도 받지 않은 초과분 반환
    expect(s.result!.net).toEqual({ 0: 200, 1: 100, 2: -300 });
  });

  it('동점이면 팟을 나눈다', () => {
    let s = table({ stacks: [1000, 1000] });
    s = rig(s, { 0: '2c 3d', 1: '2h 3s' }, 'As Kd Qh Jc Td');
    s = checkAround(s);
    expect(s.phase).toBe('handOver');
    expect(byId(s, 0)!.chips).toBe(1000);
    expect(byId(s, 1)!.chips).toBe(1000);
    expect(s.result!.winnerIds.sort()).toEqual([0, 1]);
  });

  it('폴드한 플레이어가 낸 칩도 팟에 포함된다', () => {
    let s = table({ stacks: [1000, 1000, 1000] });
    s = rig(s, { 0: 'As Ah', 1: 'Ks Kh', 2: '7c 2d' }, '2s 8c 9h 3s 4d');
    const pots0 = buildPots(s);
    expect(pots0.reduce((a, p) => a + p.amount, 0)).toBe(15);
    // 첫 행동자가 레이즈, 다음은 콜, 마지막은 폴드
    s = doAct(s, { type: 'raise', amount: 40 });
    s = doAct(s, { type: 'call' });
    const folder = s.currentPlayer;
    s = doAct(s, { type: 'fold' });
    const folderPaid = 1000 - byId(s, folder)!.chips;
    expect(folderPaid).toBeGreaterThan(0);
    s = checkAround(s);
    expect(s.phase).toBe('handOver');
    expect(s.result!.pot).toBe(80 + folderPaid);
    expect(totalChips(s)).toBe(3000);
  });

  it('이긴 칩만큼 진 플레이어가 잃는다 (순이익 합 0)', () => {
    const rng = seeded(3);
    let s = table({ stacks: [1000, 1000, 1000, 1000] });
    for (let n = 0; n < 40; n++) {
      while (s.phase === 'betting') s = applyAction(s, randomAction(s, rng), T);
      expect(s.phase).toBe('handOver');
      expect(Object.values(s.result!.net).reduce((a, b) => a + b, 0)).toBe(0);
      if (!canStartHand(s)) break;
      s = startHand(s, T);
    }
  });
});

describe('액션 검증', () => {
  it('잘못된 요청과 중복 요청을 거부한다', () => {
    const s = table({ stacks: [1000, 1000, 1000], maxBet: 100 });
    const cur = byId(s, s.currentPlayer)!;
    const other = s.players.find((p) => p.id !== cur.id)!;

    expect(act(s, other.id, { type: 'call' }, s.actionSeq, T)).toMatchObject({ ok: false, error: '차례가 아닙니다.' });
    expect(act(s, cur.id, { type: 'check' }, s.actionSeq, T).ok).toBe(false);
    expect(act(s, cur.id, { type: 'raise', amount: 5000 }, s.actionSeq, T).ok).toBe(false);
    expect(act(s, cur.id, { type: 'raise', amount: 15 }, s.actionSeq, T).ok).toBe(false); // 최소 레이즈 미만
    expect(act(s, cur.id, { type: 'raise', amount: 111 }, s.actionSeq, T).ok).toBe(false); // 최대 베팅 초과
    expect(act(s, cur.id, { type: 'raise', amount: 20.5 }, s.actionSeq, T).ok).toBe(false);

    const ok = act(s, cur.id, { type: 'call' }, s.actionSeq, T);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    // 같은 요청을 한 번 더 보내도 처리되지 않는다
    const dup = act(ok.state, cur.id, { type: 'call' }, s.actionSeq, T);
    expect(dup.ok).toBe(false);
  });

  it('칩이 부족하면 남은 칩으로 올인할 수 있다', () => {
    let s = table({ stacks: [1000, 30, 1000] });
    while (s.currentPlayer !== 1) s = doAct(s, { type: 'raise', amount: Math.max(100, s.currentBet + s.minRaise) });
    const short = byId(s, 1)!;
    const legal = legalActions(s, short);
    expect(legal.allInTo).toBeLessThan(s.currentBet);
    s = doAct(s, { type: 'raise', amount: legal.allInTo });
    expect(byId(s, 1)).toMatchObject({ chips: 0, allIn: true });
  });
});

describe('증강 선택', () => {
  it('첫 번째 베팅 구간 뒤와 세 번째 베팅 구간 뒤에 한 번씩 선택한다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000, 1000] });
    s = checkAround(s);
    expect(s.phase).toBe('augment');
    expect(s.augmentRound!.round).toBe(1);
    expect(s.community).toHaveLength(0);
    // 봇은 바로 고르고 사람만 남는다
    const pending = Object.entries(s.augmentRound!.entries).filter(([, e]) => !e.done).map(([id]) => Number(id));
    expect(pending).toEqual([s.heroId]);

    const offer = s.augmentRound!.entries[s.heroId].offer;
    expect(offer).toHaveLength(3);
    const r1 = chooseAugment(s, s.heroId, offer[0], null, T);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.state;
    expect(s.phase).toBe('betting');
    expect(s.community).toHaveLength(3);

    s = doAct(s, { type: 'call' });
    s = doAct(s, { type: 'call' });
    s = doAct(s, { type: 'call' }); // 플랍 베팅 종료 → 턴
    expect(s.phase).toBe('betting');
    expect(s.community).toHaveLength(4);
    s = checkAround(s); // 턴 베팅 종료 → 두 번째 증강
    expect(s.phase).toBe('augment');
    expect(s.augmentRound!.round).toBe(2);
    expect(s.community).toHaveLength(4);

    const offer2 = s.augmentRound!.entries[s.heroId].offer;
    expect(offer2).not.toContain(offer[0]);
    const r2 = chooseAugment(s, s.heroId, offer2[0], null, T);
    if (!r2.ok) throw new Error(r2.error);
    s = r2.state;
    expect(s.community).toHaveLength(5);
    s = checkAround(s);
    expect(s.phase).toBe('handOver');
    expect(s.augmentRoundsDone).toBe(2);
    expect(byId(s, s.heroId)!.augments.map((a) => a.id)).toEqual([offer[0], offer2[0]]);

    // 판이 바뀌어도 증강은 유지된다
    const next = startHand(s, T);
    expect(byId(next, next.heroId)!.augments.length).toBeGreaterThanOrEqual(1);
  });

  it('한 명만 남아 핸드가 끝나면 증강 선택을 생략한다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000] });
    s = doAct(s, { type: 'fold' });
    expect(s.phase).toBe('handOver');
    expect(s.augmentRoundsDone).toBe(0);
  });

  it('모두 올인해도 증강 선택 시점에서 멈춘 뒤 남은 카드를 깐다', () => {
    let s = table({ mode: 'augmented', stacks: [500, 500] });
    s = allInAll(s);
    expect(s.phase).toBe('augment');
    expect(s.community).toHaveLength(0);
    s = tickTimeouts(s, T + AUGMENT_PICK_MS);
    expect(s.phase).toBe('augment');
    expect(s.augmentRound!.round).toBe(2);
    expect(s.community).toHaveLength(4);
    s = tickTimeouts(s, T + AUGMENT_PICK_MS * 3);
    expect(s.phase).toBe('handOver');
    expect(s.community).toHaveLength(5);
  });

  it('제한시간이 지나면 자동으로 선택한다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000] });
    s = checkAround(s);
    expect(tickTimeouts(s, T + AUGMENT_PICK_MS - 1)).toBe(s);
    s = tickTimeouts(s, T + AUGMENT_PICK_MS);
    expect(s.phase).toBe('betting');
    expect(byId(s, s.heroId)!.augments).toHaveLength(1);
  });

  it('슬롯은 3개, 가득 차면 교체하거나 버리고, 같은 증강은 다시 나오지 않는다', () => {
    let s = table({ mode: 'augmented', stacks: [100000, 100000] });
    const me = () => byId(s, s.heroId)!;
    let picks = 0;
    let guard = 0;
    while (picks < 5 && guard++ < 200) {
      if (s.phase === 'betting') s = doAct(s, { type: 'call' });
      else if (s.phase === 'augment') {
        const entry = s.augmentRound!.entries[s.heroId];
        const owned = me().augments.map((a) => a.id);
        expect(entry.offer.some((id) => owned.includes(id))).toBe(false);
        if (owned.length < MAX_AUGMENT_SLOTS) {
          // 빈 슬롯이 있으면 교체 요청은 거부된다
          expect(chooseAugment(s, s.heroId, entry.offer[0], owned[0] ?? 'interest', T).ok).toBe(false);
          const r = chooseAugment(s, s.heroId, entry.offer[0], null, T);
          if (!r.ok) throw new Error(r.error);
          s = r.state;
        } else if (picks === 3) {
          expect(chooseAugment(s, s.heroId, entry.offer[0], null, T)).toMatchObject({ ok: false });
          const r = chooseAugment(s, s.heroId, entry.offer[0], owned[0], T);
          if (!r.ok) throw new Error(r.error);
          s = r.state;
          expect(me().augments.map((a) => a.id)).not.toContain(owned[0]);
          expect(me().augments.map((a) => a.id)).toContain(entry.offer[0]);
        } else {
          const r = chooseAugment(s, s.heroId, null, null, T);
          if (!r.ok) throw new Error(r.error);
          s = r.state;
          expect(me().augments.map((a) => a.id)).toEqual(owned);
        }
        picks++;
        expect(me().augments.length).toBeLessThanOrEqual(MAX_AUGMENT_SLOTS);
        expect(new Set(me().augments.map((a) => a.id)).size).toBe(me().augments.length);
      } else s = startHand(s, T);
    }
    expect(picks).toBe(5);
  });

  it('카드별 새로고침은 한 칸만 바꾸고 보유 증강과 겹치지 않는다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000] });
    s = checkAround(s);
    const before = s.augmentRound!.entries[s.heroId];
    const r = rerollAugmentSlot(s, s.heroId, 1);
    if (!r.ok) throw new Error(r.error);
    const after = r.state.augmentRound!.entries[s.heroId];
    expect(after.rerolls).toBe(before.rerolls - 1);
    expect(after.offer[0]).toBe(before.offer[0]);
    expect(after.offer[2]).toBe(before.offer[2]);
    expect(after.offer[1]).not.toBe(before.offer[1]);
    expect(new Set(after.offer).size).toBe(3);
    expect(rerollAugmentSlot(r.state, s.heroId, 0).ok).toBe(false);
  });

  it('일회용 증강은 발동 후 사라진다 (징수)', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000, 1000] });
    s = checkAround(s);
    const fake = structuredClone(s);
    byId(fake, fake.heroId)!.augments = [{ id: 'tax', acquiredHand: 0 }];
    fake.phase = 'handOver';
    fake.augmentRound = null;
    for (const p of fake.players) {
      p.chips += p.totalBet;
      p.bet = 0;
      p.totalBet = 0;
    }
    const next = startHand(fake, T);
    expect(byId(next, next.heroId)!.augments).toEqual([]);
    expect(next.log.some((l) => l.includes('징수했습니다'))).toBe(true);
  });

  it('폴드한 플레이어도 고를 수 있지만 이번 판에는 효과가 없다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000, 1000] });
    // 사람이 폴드하고 나머지가 진행
    let guard = 0;
    while (s.phase === 'betting' && guard++ < 20) {
      s = doAct(s, s.currentPlayer === s.heroId ? { type: 'fold' } : { type: 'call' });
    }
    expect(s.phase).toBe('augment');
    const entry = s.augmentRound!.entries[s.heroId];
    expect(entry).toBeDefined();
    const r = chooseAugment(s, s.heroId, entry.offer[0], null, T);
    if (!r.ok) throw new Error(r.error);
    const me = byId(r.state, r.state.heroId)!;
    expect(me.augments).toHaveLength(1);
    expect(hasActive(r.state, me, me.augments[0].id)).toBe(false);
  });

  it('봇에게는 봇이 쓸 수 있는 증강만 제시된다', () => {
    let s = table({ mode: 'augmented', stacks: [1000, 1000, 1000] });
    s = checkAround(s);
    for (const p of s.players) {
      if (p.isHuman) continue;
      for (const a of p.augments) expect(AUGMENTS[a.id].botUsable).toBe(true);
    }
  });
});

describe('입장 / 퇴장 / 연결 끊김', () => {
  it('게임 중에 들어온 플레이어는 대기하다가 다음 판부터 참가한다', () => {
    let s = table({ stacks: [1000, 1000] });
    const r = seatPlayer(s, { name: '늦은 봇', isHuman: false, chips: 800 });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    const late = byId(s, r.playerId!)!;
    expect(late).toMatchObject({ status: 'waiting', inHand: false });
    expect(s.events.some((e) => e.type === 'joined')).toBe(true);
    while (s.phase === 'betting') s = doAct(s, { type: 'call' });
    s = startHand(s, T);
    expect(byId(s, r.playerId!)).toMatchObject({ status: 'active', inHand: true });
  });

  it('빈자리가 없으면 입장할 수 없다', () => {
    const s = table({ stacks: [1000, 1000, 1000, 1000, 1000, 1000] });
    expect(seatPlayer(s, { name: 'x', isHuman: false, chips: 100 }).ok).toBe(false);
  });

  it('핸드 중 자발적 퇴장은 자동 폴드되고, 이미 낸 칩은 팟에 남는다', () => {
    let s = table({ stacks: [1000, 1000, 1000] });
    const meBefore = byId(s, s.heroId)!;
    const r = requestLeave(s, s.heroId, T);
    if (!r.ok) throw new Error(r.error);
    expect(r.chips).toBe(meBefore.chips);
    s = r.state;
    expect(byId(s, s.heroId)).toMatchObject({ folded: true, status: 'leaving' });
    expect(s.phase).toBe('betting');
    while (s.phase === 'betting') s = doAct(s, { type: 'call' });
    expect(totalChips(s) + 0).toBe(3000);
    const next = startHand(s, T);
    expect(byId(next, s.heroId)).toBeUndefined();
    expect(next.events.some((e) => e.type === 'left' && e.playerId === s.heroId)).toBe(true);
    expect(next.phase).toBe('betting');
  });

  it('연결이 끊긴 플레이어는 유예 시간 안에 돌아오면 계속하고, 지나면 자동 폴드·퇴장된다', () => {
    let s = table({ stacks: [1000, 1000, 1000] });
    s = markDisconnected(s, s.heroId, T);
    expect(tickTimeouts(s, T + RECONNECT_GRACE_MS - 1)).toBe(s);
    const back = markReconnected(s, s.heroId);
    expect(byId(back, back.heroId)!.connected).toBe(true);

    s = tickTimeouts(s, T + RECONNECT_GRACE_MS);
    expect(byId(s, s.heroId)).toMatchObject({ folded: true, status: 'leaving' });
    while (s.phase === 'betting') s = doAct(s, { type: 'call' });
    expect(s.phase).toBe('handOver');
    const next = startHand(s, T);
    expect(byId(next, s.heroId)).toBeUndefined();
    expect(next.events.some((e) => e.type === 'left' && e.reason === 'disconnect')).toBe(true);
  });

  it('퇴장으로 한 명만 남으면 그 판은 남은 사람이 가져간다', () => {
    let s = table({ stacks: [1000, 1000] });
    const other = s.players.find((p) => p.id !== s.heroId)!;
    const r = requestLeave(s, s.heroId, T);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.phase).toBe('handOver');
    expect(s.result!.winnerIds).toEqual([other.id]);
    expect(startHand(s, T).phase).toBe('waiting');
  });

  it('족보 판정 sanity', () => {
    expect(evaluate(cards('As Ks Qs Js Ts 2d 3c')).name).toBe('로열 스트레이트 플러시');
  });
});
