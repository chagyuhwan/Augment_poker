/**
 * 증강 20종 스모크 + 선택 규칙 + 핸드 종료 시 초기화
 */
import { describe, expect, it } from 'vitest';
import { AUGMENTS, MAX_AUGMENT_SLOTS, isOffensive } from '../src/practice/game/augments';
import {
  act,
  byId,
  chooseAugment,
  invokeAugment,
  startHand,
  tickTimeouts,
} from '../src/practice/game/engine';
import type { AugmentId, GameState } from '../src/practice/game/types';
import { makeTable, playHandToEnd, seeded, T0 } from './qaHarness';

const ALL_IDS = Object.keys(AUGMENTS) as AugmentId[];

function forceAugments(s: GameState, playerId: number, ids: AugmentId[]) {
  const p = byId(s, playerId)!;
  p.augments = ids.map((id) => ({ id, used: false }));
}

function toFlopBetting(s: GameState): GameState {
  let cur = s;
  let now = T0;
  let guard = 0;
  while (!(cur.phase === 'betting' && cur.street === 'flop') && guard++ < 80) {
    if (cur.phase === 'betting' && cur.street === 'preflop') {
      const r = act(cur, cur.currentPlayer, { type: 'call' }, cur.actionSeq, now);
      if (!r.ok) throw new Error(r.error);
      cur = r.state;
    } else if (cur.phase === 'augment') {
      for (const [idStr, e] of Object.entries(cur.augmentRound!.entries)) {
        if (e.done) continue;
        const pick = e.offer.find((x) => x !== 'rerollFate') ?? e.offer[0];
        const rr = chooseAugment(cur, Number(idStr), pick, null, now);
        if (rr.ok) cur = rr.state;
      }
      if (cur.phase === 'augment') cur = tickTimeouts(cur, (cur.augmentRound?.deadline ?? now) + 1);
    } else break;
  }
  return cur;
}

describe('증강 카탈로그 (실실행)', () => {
  it('확정 증강이 정확히 20종이다', () => {
    expect(ALL_IDS).toHaveLength(20);
  });

  it('한 후보 목록에 중복이 없고 최대 3개다 — 다수 핸드 샘플', () => {
    let s = makeTable([2000, 2000, 2000], { mode: 'augmented' });
    let samples = 0;
    let now = T0;
    for (let i = 0; i < 400 && samples < 40; i++) {
      if (s.phase === 'handOver') {
        s = startHand(s, now);
        if (s.phase === 'waiting') break;
        continue;
      }
      if (s.phase === 'betting') {
        const r = act(s, s.currentPlayer, { type: 'call' }, s.actionSeq, now);
        if (!r.ok) break;
        s = r.state;
        continue;
      }
      if (s.phase === 'augment') {
        for (const e of Object.values(s.augmentRound!.entries)) {
          expect(e.offer.length).toBeLessThanOrEqual(3);
          expect(new Set(e.offer).size).toBe(e.offer.length);
          samples++;
        }
        now = (s.augmentRound?.deadline ?? now) + 1;
        s = tickTimeouts(s, now);
        continue;
      }
      break;
    }
    expect(samples).toBeGreaterThanOrEqual(20);
  });


  it('핸드 종료 후 모든 증강이 비워진다', () => {
    const rng = seeded(3);
    let s = makeTable([1500, 1500], { mode: 'augmented' });
    const result = playHandToEnd(s, { rng, style: 'random', useAugmentChance: 0.5 });
    expect(result.error).toBeUndefined();
    expect(result.state.phase).toBe('handOver');
    expect(result.state.players.every((p) => p.augments.length === 0)).toBe(true);
  });

  it('한 핸드 증강 보유는 최대 2슬롯', () => {
    expect(MAX_AUGMENT_SLOTS).toBe(2);
  });
});

describe('증강 효과 스모크 (실실행)', () => {
  it('에이스 각인: 숫자만 A, 무늬 유지', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const before = { ...me.hole[0] };
    forceAugments(s, me.id, ['aceStamp']);
    const r = invokeAugment(s, 'aceStamp', { type: 'hole', index: 0 }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const card = byId(r.state, me.id)!.hole[0];
    expect(card.rank).toBe(14);
    expect(card.suit).toBe(before.suit);
  });

  it('복제술: 원본 유지 + 동일 얼굴 카드 추가, id는 다름', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const src = me.hole[0];
    forceAugments(s, me.id, ['clone']);
    const r = invokeAugment(s, 'clone', { type: 'hole', index: 0 }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const hole = byId(r.state, me.id)!.hole;
    expect(hole).toHaveLength(3);
    expect(hole[0].rank).toBe(src.rank);
    expect(hole[2].rank).toBe(src.rank);
    expect(hole[2].suit).toBe(src.suit);
    expect(hole[2].id).not.toBe(src.id);
    expect(hole[2].isGenerated).toBe(true);
  });

  it('무늬 통일: 숫자 유지·무늬 변경', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const rank = me.hole[0].rank;
    forceAugments(s, me.id, ['suitUnify']);
    const r = invokeAugment(s, 'suitUnify', { type: 'suitUnify', indices: [0], suit: 's' }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const card = byId(r.state, me.id)!.hole[0];
    expect(card.rank).toBe(rank);
    expect(card.suit).toBe('s');
  });

  it('숫자 교정: ±1, A↔2 불가', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    me.hole[0].rank = 14;
    forceAugments(s, me.id, ['rankNudge']);
    const bad = invokeAugment(s, 'rankNudge', { type: 'rankNudge', index: 0, delta: 1 }, me.id);
    expect(bad.ok).toBe(false);
    const ok = invokeAugment(s, 'rankNudge', { type: 'rankNudge', index: 0, delta: -1 }, me.id);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(byId(ok.state, me.id)!.hole[0].rank).toBe(13);
  });

  it('운명의 교환: 서로 한 장씩 소유권 변경', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const opp = s.players.find((p) => p.id !== me.id)!;
    const myCard = me.hole[0];
    const theirBefore = [...opp.hole];
    forceAugments(s, opp.id, []);
    forceAugments(s, me.id, ['fateSwap']);
    const r = invokeAugment(s, 'fateSwap', { type: 'swap', targetId: opp.id, myIndex: 0 }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const me2 = byId(r.state, me.id)!;
    const opp2 = byId(r.state, opp.id)!;
    expect(opp2.hole.some((c) => c.id === myCard.id)).toBe(true);
    expect(me2.hole[0].id).not.toBe(myCard.id);
    expect(theirBefore.some((c) => c.id === me2.hole[0].id)).toBe(true);
  });

  it('패 뒤집기: 손패 전체 교환 (카드 수 같을 때)', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    // augmentRoundsDone=1 필요
    s.augmentRoundsDone = 1;
    const me = byId(s, s.heroId)!;
    const opp = s.players.find((p) => p.id !== me.id)!;
    const myHole = me.hole.map((c) => c.id);
    const oppHole = opp.hole.map((c) => c.id);
    forceAugments(s, opp.id, []);
    forceAugments(s, me.id, ['handFlip']);

    const r = invokeAugment(s, 'handFlip', { type: 'handFlip', targetId: opp.id }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(byId(r.state, me.id)!.hole.map((c) => c.id).sort()).toEqual([...oppHole].sort());
    expect(byId(r.state, opp.id)!.hole.map((c) => c.id).sort()).toEqual([...myHole].sort());
  });

  it('판 뒤집기: 공용 카드 교체, 전원 동일 보드', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    expect(s.community.length).toBeGreaterThanOrEqual(3);
    const old = s.community[0];
    forceAugments(s, s.heroId, ['boardFlip']);
    const r = invokeAugment(s, 'boardFlip', { type: 'board', index: 0 }, s.heroId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.community[0].id).not.toBe(old.id);
  });

  it('독심술: privatePeeks는 시전자에게만', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const opp = s.players.find((p) => p.id !== s.heroId)!;
    forceAugments(s, opp.id, []); // 방패 등 방해 제거
    forceAugments(s, s.heroId, ['mindRead']);
    const r = invokeAugment(s, 'mindRead', { type: 'target', playerId: opp.id }, s.heroId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.effects.privatePeeks.some((p) => p.viewerId === s.heroId && p.targetId === opp.id)).toBe(true);
  });

  it('강제 공개: forceRevealed에 대상 포함', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const opp = s.players.find((p) => p.id !== s.heroId)!;
    forceAugments(s, opp.id, []);
    forceAugments(s, s.heroId, ['forceReveal']);
    const r = invokeAugment(s, 'forceReveal', { type: 'target', playerId: opp.id }, s.heroId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.effects.forceRevealed).toContain(opp.id);
  });


  it('레이즈 봉인: 대상 canRaise false', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const opp = s.players.find((p) => p.id !== s.heroId)!;
    forceAugments(s, s.heroId, ['raiseSeal']);
    const r = invokeAugment(s, 'raiseSeal', { type: 'target', playerId: opp.id }, s.heroId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 봉인은 다음 스트리트부터 — 효과 필드에 기록되는지
    expect(r.state.effects.raiseBannedUntil[opp.id]).toBeTruthy();
  });

  it('증강 방패: 공격 증강을 1회 차단', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const opp = s.players.find((p) => p.id !== me.id)!;
    forceAugments(s, me.id, ['fateSwap']);
    forceAugments(s, opp.id, ['augShield']);
    expect(isOffensive('fateSwap')).toBe(true);
    const r = invokeAugment(s, 'fateSwap', { type: 'swap', targetId: opp.id, myIndex: 0 }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 방패 소모, 교환 미적용(홀 길이/id)
    expect(byId(r.state, opp.id)!.augments.some((a) => a.id === 'augShield')).toBe(false);
    expect(byId(r.state, me.id)!.hole[0].id).toBe(me.hole[0].id);
  });

  it('방패·재추첨은 베팅 중 수동 사용 불가', () => {
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    forceAugments(s, s.heroId, ['augShield']);
    expect(invokeAugment(s, 'augShield', { type: 'none' }, s.heroId).ok).toBe(false);
    forceAugments(s, s.heroId, ['rerollFate']);
    expect(invokeAugment(s, 'rerollFate', { type: 'none' }, s.heroId).ok).toBe(false);
  });

  it('능력 복제: copyable만, 재귀 복제 대상 제외', () => {
    expect(AUGMENTS.copyPower.copyable).not.toBe(true);
    let s = toFlopBetting(makeTable([2000, 2000], { mode: 'augmented' }));
    const me = byId(s, s.heroId)!;
    const opp = s.players.find((p) => p.id !== me.id)!;
    forceAugments(s, opp.id, ['rankNudge']);
    forceAugments(s, me.id, ['copyPower']);
    const r = invokeAugment(s, 'copyPower', { type: 'copy', targetId: opp.id, augmentId: 'rankNudge' }, me.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(byId(r.state, me.id)!.augments.some((a) => a.id === 'rankNudge')).toBe(true);
  });
});

describe('증강 2개 조합 샘플 (실실행)', () => {
  const pairs: [AugmentId, AugmentId][] = [
    ['aceStamp', 'clone'],
    ['suitUnify', 'boardFlip'],
    ['fateSwap', 'augShield'],
    ['raiseSeal', 'actLast'],
    ['mindRead', 'foresight'],
    ['rankNudge', 'redeal'],
    ['forceReveal', 'auraPeek'],
    ['raiseCap', 'pressure'],
    ['augSeal', 'copyPower'],
    ['handFlip', 'clone'],
  ];

  for (const [a, b] of pairs) {
    it(`${a} + ${b} 보유 핸드가 끝까지 진행`, () => {
      const rng = seeded(a.charCodeAt(0) + b.charCodeAt(0));
      let s = makeTable([2500, 2500, 2500], { mode: 'augmented' });
      // 첫 증강 라운드까지 진행 후 강제 장착
      let now = T0;
      let guard = 0;
      while (s.phase !== 'augment' && guard++ < 60) {
        if (s.phase === 'betting') {
          const r = act(s, s.currentPlayer, { type: 'call' }, s.actionSeq, now);
          if (!r.ok) break;
          s = r.state;
        } else break;
      }
      if (s.phase === 'augment') {
        for (const p of s.players.filter((x) => x.inHand && !x.folded)) {
          p.augments = [
            { id: a, used: false },
            { id: b, used: false },
          ].slice(0, MAX_AUGMENT_SLOTS);
        }
        s = tickTimeouts(s, (s.augmentRound?.deadline ?? now) + 1);
      }
      const result = playHandToEnd(s, { rng, style: 'random', now, useAugmentChance: 0.6 });
      expect(result.error).toBeUndefined();
      expect(result.state.phase).toBe('handOver');
    });
  }
});
