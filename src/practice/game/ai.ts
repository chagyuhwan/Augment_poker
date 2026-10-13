import { evalOptionsFor } from './augments';
import { fullDeck, sameCard, shuffle } from './cards';
import { byId, hasActive, isLive, legalActions, potSize } from './engine';
import { compareScore, evaluate } from './evaluator';
import type { Card, GameState, Player, PlayerAction } from './types';

const SIMULATIONS = 250;
const MAX_RAISES_PER_STREET = 4;

/** 몬테카를로로 내 승률 추정 (상대 카드는 모른다고 가정) */
function estimateEquity(s: GameState, me: Player): number {
  const opponents = s.players.filter((p) => isLive(p) && p.id !== me.id).length;
  if (opponents === 0) return 1;

  const known: Card[] = [...me.hole, ...s.community];
  const unknown = fullDeck().filter((c) => !known.some((k) => sameCard(k, c)));
  const opts = evalOptionsFor(me.augments.filter((a) => hasActive(s, me, a.id)).map((a) => a.id));
  const need = 5 - s.community.length;

  let score = 0;
  for (let i = 0; i < SIMULATIONS; i++) {
    const deck = shuffle(unknown);
    const board = [...s.community, ...deck.slice(0, need)];
    let pos = need;
    const mine = evaluate([...me.hole, ...board], opts).score;
    let beaten = false;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluate([deck[pos], deck[pos + 1], ...board]).score;
      pos += 2;
      const cmp = compareScore(mine, theirs);
      if (cmp < 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) ties++;
    }
    if (!beaten) score += 1 / (ties + 1);
  }
  return score / SIMULATIONS;
}

/** 현재 차례인 봇의 액션. 항상 엔진 규칙상 유효한 금액만 낸다. */
export function decideBotAction(s: GameState): PlayerAction {
  const me = byId(s, s.currentPlayer)!;
  const legal = legalActions(s, me);
  const pot = potSize(s);
  const opponents = s.players.filter((p) => isLive(p) && p.id !== me.id).length;

  let equity = estimateEquity(s, me);

  // 위압: 위압을 가진 플레이어가 마지막 공격자면 더 쉽게 접는다
  const aggressor = s.lastAggressor === null ? undefined : byId(s, s.lastAggressor);
  if (aggressor && aggressor.id !== me.id && hasActive(s, aggressor, 'intimidate')) equity -= 0.12;

  const fair = 1 / (opponents + 1);
  const strong = Math.min(0.8, fair * 2.2);
  const decent = Math.min(0.6, fair * 1.5);
  const r = Math.random();
  const canRaise = legal.canRaise && me.chips > legal.toCall && s.raisesThisStreet < MAX_RAISES_PER_STREET;

  const raiseTo = (fraction: number): PlayerAction => {
    const size = Math.max(s.minRaise, Math.floor(pot * fraction));
    const target = Math.max(legal.minRaiseTo, Math.min(s.currentBet + size, legal.maxRaiseTo));
    return { type: 'raise', amount: target };
  };

  if (canRaise) {
    if (equity > strong) return raiseTo(0.6 + Math.random() * 0.6);
    if (equity > decent && r < 0.3) return raiseTo(0.4 + Math.random() * 0.3);
    if (legal.toCall === 0 && r < 0.07) return raiseTo(0.5); // 블러프
  }

  if (legal.toCall === 0) return { type: 'check' };

  const potOdds = legal.toCall / (pot + legal.toCall);
  const cheap = legal.toCall <= s.bb && equity > fair * 0.6;
  if (equity >= potOdds * 1.1 || cheap) return { type: 'call' };
  return { type: 'fold' };
}
