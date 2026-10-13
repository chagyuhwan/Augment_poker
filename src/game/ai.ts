import { evalOptionsFor } from './augments';
import { fullDeck, sameCard, shuffle } from './cards';
import { potSize } from './engine';
import { compareScore, evaluate } from './evaluator';
import type { Card, GameState, PlayerAction } from './types';

const SIMULATIONS = 250;
const MAX_RAISES_PER_STREET = 4;

/** 몬테카를로로 내 승률 추정 (상대 카드는 모른다고 가정) */
function estimateEquity(s: GameState, playerIdx: number): number {
  const me = s.players[playerIdx];
  const opponents = s.players.filter((p) => !p.out && !p.folded && p.id !== me.id).length;
  if (opponents === 0) return 1;

  const known: Card[] = [...me.hole, ...s.community];
  const unknown = fullDeck().filter((c) => !known.some((k) => sameCard(k, c)));
  const opts = evalOptionsFor(me.augment);
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

export function decideBotAction(s: GameState): PlayerAction {
  const idx = s.currentPlayer;
  const me = s.players[idx];
  const toCall = Math.max(0, s.currentBet - me.bet);
  const pot = potSize(s);
  const opponents = s.players.filter((p) => !p.out && !p.folded && p.id !== me.id).length;

  let equity = estimateEquity(s, idx);

  // 위압: 인간 플레이어가 마지막 공격자면 더 쉽게 접는다
  const human = s.players[0];
  if (human.augment === 'intimidate' && s.lastAggressor === human.id) equity -= 0.12;

  const fair = 1 / (opponents + 1);
  const strong = Math.min(0.8, fair * 2.2);
  const decent = Math.min(0.6, fair * 1.5);
  const r = Math.random();
  const canRaise = me.chips > toCall && s.raisesThisStreet < MAX_RAISES_PER_STREET;

  const raiseTo = (fraction: number): PlayerAction => {
    const size = Math.max(s.minRaise, Math.floor(pot * fraction));
    return { type: 'raise', amount: s.currentBet + size };
  };

  if (canRaise) {
    if (equity > strong) return raiseTo(0.6 + Math.random() * 0.6);
    if (equity > decent && r < 0.3) return raiseTo(0.4 + Math.random() * 0.3);
    if (toCall === 0 && r < 0.07) return raiseTo(0.5); // 블러프
  }

  if (toCall === 0) return { type: 'check' };

  const potOdds = toCall / (pot + toCall);
  const cheap = toCall <= s.bb && equity > fair * 0.6;
  if (equity >= potOdds * 1.1 || cheap) return { type: 'call' };
  return { type: 'fold' };
}
