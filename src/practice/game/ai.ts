import { fullDeck, sameFace, shuffle } from './cards';
import { byId, isLive, legalActions, potSize } from './engine';
import { compareScore, evaluate } from './evaluator';
import type { Card, GameState, Player, PlayerAction } from './types';

const SIMULATIONS = 250;
const MAX_RAISES_PER_STREET = 4;

/** 몬테카를로로 내 승률 추정 (상대 카드는 모른다고 가정) */
function estimateEquity(s: GameState, me: Player): number {
  const opponents = s.players.filter((p) => isLive(p) && p.id !== me.id).length;
  if (opponents === 0) return 1;

  const known: Card[] = [...me.hole, ...s.community];
  // 기본 52장 얼굴 기준으로 남은 카드 추정(생성 카드는 희귀하므로 근사)
  const unknown = fullDeck({ nextCardId: 1 }).filter((c) => !known.some((k) => sameFace(k, c)));
  const need = 5 - s.community.length;

  let score = 0;
  for (let i = 0; i < SIMULATIONS; i++) {
    const deck = shuffle(unknown);
    const board = [...s.community, ...deck.slice(0, need)];
    let pos = need;
    const mine = evaluate([...me.hole, ...board]).score;
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

  const equity = estimateEquity(s, me);
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
    if (legal.toCall === 0 && r < 0.07) return raiseTo(0.5);
  }

  if (legal.toCall === 0) return { type: 'check' };

  const potOdds = legal.toCall / (pot + legal.toCall);
  const cheap = legal.toCall <= s.bb && equity > fair * 0.6;
  if (equity >= potOdds * 1.1 || cheap) return { type: 'call' };
  return { type: 'fold' };
}
