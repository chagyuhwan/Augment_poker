import { AUGMENTS, TIER_LABEL, evalOptionsFor, rollBotAugment, rollOffer, rollTier } from './augments';
import { cardLabel, fullDeck, shuffle } from './cards';
import { compareScore, evaluate } from './evaluator';
import type { AugmentId, GameState, HandResult, Player, PlayerAction } from './types';

export const STARTING_CHIPS = 1000;
export const BASE_BB = 20;
export const BLIND_UP_EVERY = 10;
export const STARTING_REROLLS = 3;

const BOT_NAMES = ['가렌', '아리', '징크스'];

function clone(s: GameState): GameState {
  return structuredClone(s);
}

function pushLog(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

function nextIndex(s: GameState, from: number, pred: (p: Player) => boolean): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (pred(s.players[idx])) return idx;
  }
  return -1;
}

const inHand = (p: Player) => !p.out && !p.folded;
const canAct = (p: Player) => inHand(p) && !p.allIn;

export function potSize(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.totalBet, 0);
}

function putChips(p: Player, amount: number) {
  const amt = Math.min(amount, p.chips);
  p.chips -= amt;
  p.bet += amt;
  p.totalBet += amt;
  if (p.chips === 0) p.allIn = true;
  return amt;
}

export function createGame(): GameState {
  const players: Player[] = [
    { name: '나', isHuman: true },
    ...BOT_NAMES.map((name) => ({ name, isHuman: false })),
  ].map((p, id) => ({
    id,
    name: p.name,
    isHuman: p.isHuman,
    chips: STARTING_CHIPS,
    hole: [],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    hasActed: false,
    out: false,
    augment: null,
    lastAction: null,
  }));

  const s: GameState = {
    players,
    deck: [],
    community: [],
    dealer: Math.floor(Math.random() * players.length) - 1,
    street: 'preflop',
    phase: 'augment',
    currentPlayer: -1,
    currentBet: 0,
    minRaise: BASE_BB,
    raisesThisStreet: 0,
    lastAggressor: null,
    sb: BASE_BB / 2,
    bb: BASE_BB,
    handNumber: 0,
    log: [],
    augmentOffer: [],
    offerTier: 'silver',
    rerolls: STARTING_REROLLS,
    revealed: {},
    mulliganUsed: false,
    fateUsed: false,
    result: null,
  };
  return startHand(s);
}

/** 새 핸드 시작: 증강 선택 단계로 진입 */
export function startHand(prev: GameState): GameState {
  const s = clone(prev);
  for (const p of s.players) if (p.chips <= 0) p.out = true;

  const alive = s.players.filter((p) => !p.out);
  if (s.players[0].out || alive.length < 2) {
    s.phase = 'gameOver';
    return s;
  }

  s.handNumber += 1;
  const level = Math.floor((s.handNumber - 1) / BLIND_UP_EVERY);
  s.bb = BASE_BB * 2 ** level;
  s.sb = s.bb / 2;

  s.dealer = nextIndex(s, s.dealer, (p) => !p.out);
  for (const p of s.players) {
    p.hole = [];
    p.bet = 0;
    p.totalBet = 0;
    p.folded = p.out;
    p.allIn = false;
    p.hasActed = false;
    p.augment = null;
    p.lastAction = null;
  }
  s.community = [];
  s.deck = [];
  s.street = 'preflop';
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raisesThisStreet = 0;
  s.lastAggressor = null;
  s.revealed = {};
  s.mulliganUsed = false;
  s.fateUsed = false;
  s.result = null;
  s.currentPlayer = -1;

  s.offerTier = rollTier();
  s.augmentOffer = rollOffer(s.offerTier);
  s.phase = 'augment';

  pushLog(s, `━━ 핸드 #${s.handNumber} (블라인드 ${s.sb}/${s.bb}) ━━`);
  if (level > 0 && (s.handNumber - 1) % BLIND_UP_EVERY === 0) {
    pushLog(s, `⚠️ 블라인드가 ${s.sb}/${s.bb}로 올랐습니다!`);
  }
  return s;
}

export function rerollAugments(prev: GameState): GameState {
  if (prev.phase !== 'augment' || prev.rerolls <= 0) return prev;
  const s = clone(prev);
  s.rerolls -= 1;
  s.augmentOffer = rollOffer(s.offerTier);
  return s;
}

/** 증강 선택 후 카드를 나눠주고 베팅 시작 */
export function chooseAugment(prev: GameState, augmentId: AugmentId): GameState {
  if (prev.phase !== 'augment' || !prev.augmentOffer.includes(augmentId)) return prev;
  const s = clone(prev);
  const human = s.players[0];
  human.augment = augmentId;
  pushLog(s, `✨ 나: [${TIER_LABEL[AUGMENTS[augmentId].tier]}] ${AUGMENTS[augmentId].name} 선택`);

  for (const p of s.players) {
    if (p.isHuman || p.out) continue;
    p.augment = rollBotAugment();
    const a = AUGMENTS[p.augment];
    pushLog(s, `✨ ${p.name}: [${TIER_LABEL[a.tier]}] ${a.name}`);
  }

  // 딜링
  s.deck = shuffle(fullDeck());
  for (const p of s.players) {
    if (p.out) continue;
    const count = p.augment === 'thirdHand' ? 3 : 2;
    p.hole = s.deck.splice(-count, count);
  }

  if (human.augment === 'clairvoyance') {
    for (const p of s.players) {
      if (p.isHuman || p.out) continue;
      s.revealed[p.id] = Math.floor(Math.random() * p.hole.length);
    }
  }

  // 징수
  for (const taxer of s.players) {
    if (taxer.out || taxer.augment !== 'tax') continue;
    let collected = 0;
    for (const p of s.players) {
      if (p.out || p.id === taxer.id) continue;
      const amt = Math.min(s.bb, p.chips);
      p.chips -= amt;
      collected += amt;
    }
    taxer.chips += collected;
    pushLog(s, `🏦 ${taxer.name}이(가) ${collected}칩을 징수했습니다.`);
  }
  // 징수로 칩이 0이 된 플레이어는 이번 핸드에서 제외
  for (const p of s.players) {
    if (!p.out && p.chips === 0) {
      p.out = true;
      p.folded = true;
      pushLog(s, `💀 ${p.name}이(가) 징수로 파산했습니다.`);
    }
  }
  if (s.players[0].out || s.players.filter((p) => !p.out).length < 2) {
    s.phase = 'gameOver';
    return s;
  }
  if (s.players[s.dealer].out) s.dealer = nextIndex(s, s.dealer, (p) => !p.out);

  // 블라인드
  const aliveCount = s.players.filter((p) => !p.out).length;
  const sbIdx = aliveCount === 2 ? s.dealer : nextIndex(s, s.dealer, (p) => !p.out);
  const bbIdx = nextIndex(s, sbIdx, (p) => !p.out);
  const sbAmt = putChips(s.players[sbIdx], s.sb);
  const bbAmt = putChips(s.players[bbIdx], s.bb);
  s.players[sbIdx].lastAction = `SB ${sbAmt}`;
  s.players[bbIdx].lastAction = `BB ${bbAmt}`;
  s.currentBet = s.bb;
  s.minRaise = s.bb;
  pushLog(s, `${s.players[sbIdx].name} 스몰 블라인드 ${sbAmt}, ${s.players[bbIdx].name} 빅 블라인드 ${bbAmt}`);

  s.phase = 'betting';
  s.currentPlayer = bbIdx;
  advance(s);
  return s;
}

/** 현재 차례 플레이어의 액션 처리 */
export function applyAction(prev: GameState, action: PlayerAction): GameState {
  if (prev.phase !== 'betting') return prev;
  const s = clone(prev);
  const p = s.players[s.currentPlayer];
  const toCall = s.currentBet - p.bet;

  switch (action.type) {
    case 'fold': {
      p.folded = true;
      p.lastAction = '폴드';
      pushLog(s, `${p.name}: 폴드`);
      if (p.augment === 'retreat' && p.totalBet > 0) {
        const refund = Math.floor(p.totalBet * 0.5);
        p.chips += refund;
        pushLog(s, `🏳️ ${p.name}: 전략적 후퇴로 ${refund}칩 회수`);
      }
      break;
    }
    case 'check':
    case 'call': {
      if (toCall <= 0) {
        p.lastAction = '체크';
        pushLog(s, `${p.name}: 체크`);
      } else {
        const amt = putChips(p, toCall);
        p.lastAction = p.allIn ? `올인 ${p.bet}` : `콜 ${amt}`;
        pushLog(s, `${p.name}: ${p.allIn ? '올인' : '콜'} ${amt}`);
      }
      break;
    }
    case 'raise': {
      const maxTotal = p.bet + p.chips;
      const minTotal = Math.min(s.currentBet + s.minRaise, maxTotal);
      const target = Math.max(minTotal, Math.min(Math.floor(action.amount), maxTotal));
      if (target <= s.currentBet) {
        // 레이즈할 칩이 부족하면 콜로 처리
        return applyAction(prev, { type: 'call' });
      }
      putChips(p, target - p.bet);
      s.minRaise = Math.max(s.minRaise, target - s.currentBet);
      const wasBet = s.currentBet === 0;
      s.currentBet = target;
      s.raisesThisStreet += 1;
      s.lastAggressor = p.id;
      for (const o of s.players) if (o.id !== p.id && canAct(o)) o.hasActed = false;
      const label = p.allIn ? '올인' : wasBet ? '베팅' : '레이즈';
      p.lastAction = `${label} ${target}`;
      pushLog(s, `${p.name}: ${label} ${target}`);
      break;
    }
  }
  p.hasActed = true;
  advance(s);
  return s;
}

function advance(s: GameState) {
  const live = s.players.filter(inHand);
  if (live.length === 1) {
    awardUncontested(s, live[0]);
    return;
  }

  const actors = live.filter((p) => !p.allIn);
  if (actors.length === 0 || (actors.length === 1 && actors[0].bet >= s.currentBet)) {
    runOut(s);
    return;
  }

  const roundDone = actors.every((p) => p.hasActed && p.bet === s.currentBet);
  if (roundDone) {
    nextStreet(s);
    return;
  }

  s.currentPlayer = nextIndex(s, s.currentPlayer, canAct);
}

function dealCommunity(s: GameState, n: number) {
  for (let i = 0; i < n; i++) s.community.push(s.deck.pop()!);
}

function resetStreet(s: GameState) {
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
    if (!p.folded && !p.allIn) p.lastAction = null;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raisesThisStreet = 0;
  s.lastAggressor = null;
}

function nextStreet(s: GameState) {
  resetStreet(s);
  if (s.street === 'river') {
    showdown(s);
    return;
  }
  if (s.street === 'preflop') {
    dealCommunity(s, 3);
    s.street = 'flop';
  } else {
    dealCommunity(s, 1);
    s.street = s.street === 'flop' ? 'turn' : 'river';
  }
  const names = { flop: '플랍', turn: '턴', river: '리버' } as const;
  pushLog(s, `── ${names[s.street as keyof typeof names]}: ${s.community.map(cardLabel).join(' ')}`);

  s.currentPlayer = s.dealer;
  advance(s);
}

function runOut(s: GameState) {
  resetStreet(s);
  if (s.community.length < 5) {
    dealCommunity(s, 5 - s.community.length);
    pushLog(s, `── 보드 공개: ${s.community.map(cardLabel).join(' ')}`);
  }
  s.street = 'river';
  showdown(s);
}

function applyWinBonus(p: Player, won: number, lines: string[]) {
  const profit = won - p.totalBet;
  if (profit <= 0) return;
  let bonus = 0;
  if (p.augment === 'interest') bonus = Math.floor(profit * 0.3);
  if (p.augment === 'jackpot') bonus = profit;
  if (bonus > 0) {
    p.chips += bonus;
    lines.push(`${AUGMENTS[p.augment!].icon} ${p.name}: ${AUGMENTS[p.augment!].name} 보너스 +${bonus}`);
  }
}

function finishHand(s: GameState, result: HandResult) {
  for (const line of result.lines) pushLog(s, line);
  s.result = result;
  s.phase = 'handOver';
  s.currentPlayer = -1;
}

function awardUncontested(s: GameState, winner: Player) {
  const pot = potSize(s);
  winner.chips += pot;
  const lines = [`🏆 ${winner.name}이(가) ${pot}칩을 획득했습니다. (상대 전원 폴드)`];
  applyWinBonus(winner, pot, lines);
  finishHand(s, { showdown: false, lines, winnerIds: [winner.id] });
}

function showdown(s: GameState) {
  const contenders = s.players.filter(inHand);
  const values = new Map(
    contenders.map((p) => [p.id, evaluate([...p.hole, ...s.community], evalOptionsFor(p.augment))]),
  );
  const lines: string[] = [];
  for (const p of contenders) {
    lines.push(`${p.name}: ${p.hole.map(cardLabel).join(' ')} → ${values.get(p.id)!.name}`);
  }

  // 사이드팟 계산
  const levels = [...new Set(s.players.map((p) => p.totalBet).filter((v) => v > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: Player[] }[] = [];
  let prevLevel = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of s.players) amount += Math.min(p.totalBet, level) - Math.min(p.totalBet, prevLevel);
    const eligible = contenders.filter((p) => p.totalBet >= level);
    prevLevel = level;
    if (amount <= 0) continue;
    const last = pots[pots.length - 1];
    if (eligible.length === 0 && last) {
      last.amount += amount;
    } else if (last && last.eligible.length === eligible.length) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }

  const won = new Map<number, number>();
  pots.forEach((pot, i) => {
    if (pot.eligible.length === 0) return;
    let best: number[] | null = null;
    let winners: Player[] = [];
    for (const p of pot.eligible) {
      const sc = values.get(p.id)!.score;
      const cmp = best ? compareScore(sc, best) : 1;
      if (cmp > 0) {
        best = sc;
        winners = [p];
      } else if (cmp === 0) {
        winners.push(p);
      }
    }
    if (winners.length > 1) {
      const lucky = winners.filter((p) => p.augment === 'luckyCoin');
      if (lucky.length > 0 && lucky.length < winners.length) {
        winners = lucky;
        lines.push(`🪙 행운의 동전 발동! 무승부를 ${lucky.map((p) => p.name).join(', ')}이(가) 가져갑니다.`);
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const w of winners) {
      const amt = share + (remainder-- > 0 ? 1 : 0);
      w.chips += amt;
      won.set(w.id, (won.get(w.id) ?? 0) + amt);
    }
    const potName = pots.length > 1 ? (i === 0 ? '메인 팟' : `사이드 팟 ${i}`) : '팟';
    lines.push(
      `🏆 ${winners.map((w) => w.name).join(', ')}: ${potName} ${pot.amount}칩 획득 (${values.get(winners[0].id)!.name})`,
    );
  });

  for (const p of contenders) {
    const w = won.get(p.id) ?? 0;
    if (w > 0) {
      applyWinBonus(p, w, lines);
    } else if (p.augment === 'insurance') {
      const refund = Math.floor(p.totalBet * 0.5);
      p.chips += refund;
      lines.push(`🛡️ ${p.name}: 보험으로 ${refund}칩 환급`);
    }
  }

  finishHand(s, { showdown: true, lines, winnerIds: [...won.keys()] });
}

// ── 능동형 증강 ──

export function canUseMulligan(s: GameState): boolean {
  const me = s.players[0];
  return (
    s.phase === 'betting' && me.augment === 'mulligan' && !s.mulliganUsed && !me.folded && s.street !== 'river'
  );
}

export function mulliganCard(prev: GameState, cardIndex: number): GameState {
  if (!canUseMulligan(prev)) return prev;
  const s = clone(prev);
  const me = s.players[0];
  const old = me.hole[cardIndex];
  me.hole[cardIndex] = s.deck.pop()!;
  s.mulliganUsed = true;
  pushLog(s, `🔄 멀리건: ${cardLabel(old)} → ${cardLabel(me.hole[cardIndex])}`);
  return s;
}

export function canSeeNextCard(s: GameState): boolean {
  const aug = s.players[0].augment;
  return s.phase === 'betting' && (aug === 'foresight' || aug === 'fateTwist') && s.community.length < 5;
}

export function canUseFateTwist(s: GameState): boolean {
  return s.phase === 'betting' && s.players[0].augment === 'fateTwist' && !s.fateUsed && s.community.length < 5;
}

export function twistFate(prev: GameState): GameState {
  if (!canUseFateTwist(prev)) return prev;
  const s = clone(prev);
  const burned = s.deck.pop()!;
  s.fateUsed = true;
  pushLog(s, `🌀 운명 조작: 다음 카드 ${cardLabel(burned)}을(를) 버렸습니다.`);
  return s;
}

export function peekNextCard(s: GameState) {
  return s.deck[s.deck.length - 1];
}
