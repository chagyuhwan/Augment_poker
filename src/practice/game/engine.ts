import {
  applyRerollFatePick,
  canUseAugment,
  onStreetEndClearEffects,
  useAugment as useAugmentImpl,
  type AugmentPayload,
} from './augmentActions';
import { AUGMENTS, emptyEffects, MAX_AUGMENT_SLOTS, TIER_LABEL, rollOffer, rollTier } from './augments';
import { cardLabel, fullDeck, shuffle } from './cards';
import { compareScore, evaluate } from './evaluator';
import type {
  AugmentId,
  AugmentRound,
  GameState,
  HandResult,
  Player,
  PlayerAction,
  TableEventInput,
  TableMode,
} from './types';

export const MAX_SEATS = 6;
export const AUGMENT_PICK_MS = 15_000;
/** 레거시: 슬롯 단위 리롤은 제거. 운명 재추첨 증강으로 대체 */
export const REROLLS_PER_PICK = 0;
/** 연결이 끊긴 플레이어가 다시 접속할 수 있는 시간 */
export const RECONNECT_GRACE_MS = 30_000;

export type EngineResult = { ok: true; state: GameState } | { ok: false; error: string };

export interface SeatRequest {
  name: string;
  isHuman: boolean;
  chips: number;
}

export interface CreateTableOptions {
  tableId: string;
  mode: TableMode;
  hero: SeatRequest;
  others: SeatRequest[];
  smallBlind: number;
  bigBlind: number;
  /** null이면 노리밋 */
  maxBet: number | null;
  maxSeats?: number;
}

function clone(s: GameState): GameState {
  return structuredClone(s);
}

function pushLog(s: GameState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

function emit(s: GameState, event: TableEventInput) {
  s.eventSeq += 1;
  s.events.push({ ...event, seq: s.eventSeq } as GameState['events'][number]);
  if (s.events.length > 100) s.events.splice(0, s.events.length - 100);
}

export const byId = (s: GameState, id: number): Player | undefined => s.players.find((p) => p.id === id);
export const hero = (s: GameState): Player | undefined => byId(s, s.heroId);

/** 이번 핸드에서 아직 팟을 다투는 플레이어 */
export const isLive = (p: Player) => p.inHand && !p.folded;
const canAct = (p: Player) => isLive(p) && !p.allIn;

function seatOf(s: GameState, id: number): number {
  return byId(s, id)?.seat ?? s.dealerSeat;
}

/** fromSeat 다음 좌석부터 시계 방향으로 조건에 맞는 첫 플레이어 */
function nextPlayer(s: GameState, fromSeat: number, pred: (p: Player) => boolean): Player | undefined {
  const sorted = s.players;
  const after = sorted.filter((p) => p.seat > fromSeat && pred(p));
  if (after.length) return after[0];
  return sorted.find(pred);
}

export function potSize(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.totalBet, 0);
}

function putChips(p: Player, amount: number) {
  const amt = Math.max(0, Math.min(amount, p.chips));
  p.chips -= amt;
  p.bet += amt;
  p.totalBet += amt;
  if (p.chips === 0) p.allIn = true;
  return amt;
}

// ── 증강 보유 ──

export function owns(p: Player, id: AugmentId): boolean {
  return p.augments.some((a) => a.id === id && !a.used);
}

/** 이번 핸드에 효과를 낼 수 있는 증강인지. 폴드했거나 일반 모드면 false */
export function hasActive(s: GameState, p: Player, id: AugmentId): boolean {
  return s.mode === 'augmented' && isLive(p) && owns(p, id);
}

const augmentCtx = {
  byId,
  isLive,
  clone,
  pushLog,
  emit: (s: GameState, e: { type: 'augmentUsed'; playerId: number; augmentId: AugmentId; blocked?: boolean }) =>
    emit(s, e),
};

// ── 테이블 생성 / 착석 ──

function newPlayer(s: GameState, req: SeatRequest, seat: number, status: Player['status']): Player {
  const p: Player = {
    id: s.nextPlayerId++,
    seat,
    name: req.name.trim().slice(0, 16) || '플레이어',
    isHuman: req.isHuman,
    chips: req.chips,
    hole: [],
    bet: 0,
    totalBet: 0,
    inHand: false,
    folded: true,
    allIn: false,
    hasActed: false,
    status,
    connected: true,
    disconnectedAt: null,
    augments: [],
    lastAction: null,
  };
  s.players.push(p);
  s.players.sort((a, b) => a.seat - b.seat);
  return p;
}

export function createTable(o: CreateTableOptions, now = Date.now()): GameState {
  const s: GameState = {
    tableId: o.tableId,
    mode: o.mode,
    heroId: 0,
    maxSeats: Math.min(MAX_SEATS, Math.max(2, o.maxSeats ?? MAX_SEATS)),
    nextPlayerId: 0,
    nextCardId: 1,
    players: [],
    deck: [],
    community: [],
    dealerSeat: -1,
    street: 'preflop',
    phase: 'waiting',
    currentPlayer: -1,
    currentBet: 0,
    minRaise: o.bigBlind,
    raisesThisStreet: 0,
    lastAggressor: null,
    sb: o.smallBlind,
    bb: o.bigBlind,
    maxBet: o.maxBet,
    handNumber: 0,
    actionSeq: 0,
    log: [],
    augmentRound: null,
    augmentRoundsDone: 0,
    runout: false,
    revealed: {},
    effects: emptyEffects(),
    result: null,
    events: [],
    eventSeq: 0,
    minted: 0,
  };
  const me = newPlayer(s, o.hero, 0, 'active');
  s.heroId = me.id;
  o.others.slice(0, s.maxSeats - 1).forEach((req, i) => newPlayer(s, req, i + 1, 'active'));
  pushLog(s, `테이블 입장 · 블라인드 ${s.sb}/${s.bb}${s.maxBet ? ` · 최대 베팅 ${s.maxBet}` : ' · 노리밋'}`);
  return canStartHand(s) ? startHand(s, now) : s;
}

/**
 * 빈자리에 플레이어를 앉힌다. 판이 진행 중이면 대기 상태로 앉아 다음 판부터 참가한다.
 */
export function seatPlayer(prev: GameState, req: SeatRequest): EngineResult & { playerId?: number } {
  if (!Number.isSafeInteger(req.chips) || req.chips <= 0) return { ok: false, error: '가져올 게임머니가 없습니다.' };
  const taken = new Set(prev.players.map((p) => p.seat));
  let seat = -1;
  for (let i = 0; i < prev.maxSeats; i++) {
    if (!taken.has(i)) {
      seat = i;
      break;
    }
  }
  if (seat < 0) return { ok: false, error: '빈자리가 없습니다.' };
  const s = clone(prev);
  const running = s.phase !== 'waiting';
  const p = newPlayer(s, req, seat, running ? 'waiting' : 'active');
  s.actionSeq += 1;
  emit(s, { type: 'joined', playerId: p.id });
  pushLog(s, running ? `👋 ${p.name} 입장 (다음 판부터 참가)` : `👋 ${p.name} 입장`);
  return { ok: true, state: s, playerId: p.id };
}

function eligibleForHand(p: Player): boolean {
  return (p.status === 'active' || p.status === 'waiting') && p.connected && p.chips > 0;
}

export function canStartHand(s: GameState): boolean {
  return (s.phase === 'waiting' || s.phase === 'handOver') && s.players.filter(eligibleForHand).length >= 2;
}

/** 소진/퇴장한 플레이어를 자리에서 지운다. 증강과 게임 상태도 함께 사라진다. */
function cleanupSeats(s: GameState) {
  const keep: Player[] = [];
  for (const p of s.players) {
    if (p.status === 'busted') {
      pushLog(s, `🚪 ${p.name}: 게임머니가 모두 소진되어 퇴장했습니다.`);
      continue;
    }
    if (p.status === 'leaving') {
      emit(s, { type: 'left', playerId: p.id, chips: p.chips, reason: p.connected ? 'leave' : 'disconnect' });
      pushLog(s, `🚪 ${p.name} 퇴장`);
      continue;
    }
    keep.push(p);
  }
  s.players = keep;
}

function resetHandFields(s: GameState) {
  s.community = [];
  s.deck = [];
  s.street = 'preflop';
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raisesThisStreet = 0;
  s.lastAggressor = null;
  s.revealed = {};
  s.effects = emptyEffects();
  s.result = null;
  s.currentPlayer = -1;
  s.augmentRound = null;
  s.augmentRoundsDone = 0;
  s.runout = false;
  for (const p of s.players) {
    p.hole = [];
    p.bet = 0;
    p.totalBet = 0;
    p.inHand = false;
    p.folded = true;
    p.allIn = false;
    p.hasActed = false;
    p.lastAction = null;
    // 증강은 판이 바뀌면 전부 초기화
    p.augments = [];
  }
}

/**
 * 다음 판을 시작한다. 정산이 끝난 뒤 자동으로 호출되며, 판 수 제한 없이 계속 반복된다.
 * 참가 가능한 플레이어가 2명 미만이면 새 참가자가 올 때까지 대기 상태가 된다.
 */
export function startHand(prev: GameState, now = Date.now()): GameState {
  if (prev.phase !== 'waiting' && prev.phase !== 'handOver') return prev;
  const s = clone(prev);
  cleanupSeats(s);
  resetHandFields(s);
  s.actionSeq += 1;

  const eligible = s.players.filter(eligibleForHand);
  if (eligible.length < 2) {
    if (s.phase !== 'waiting') pushLog(s, '⏸ 참가자가 부족해 새 플레이어를 기다립니다.');
    s.phase = 'waiting';
    return s;
  }

  s.handNumber += 1;
  for (const p of eligible) {
    p.status = 'active';
    p.inHand = true;
    p.folded = false;
  }
  s.dealerSeat = nextPlayer(s, s.dealerSeat, (p) => p.inHand)!.seat;
  pushLog(s, `━━ 핸드 #${s.handNumber} (블라인드 ${s.sb}/${s.bb}) ━━`);

  s.deck = shuffle(fullDeck(s));
  for (const p of eligible) {
    p.hole = s.deck.splice(-2, 2);
  }

  // 1:1이면 딜러가 스몰 블라인드
  const dealer = s.players.find((p) => p.seat === s.dealerSeat)!;
  const sbP = eligible.length === 2 ? dealer : nextPlayer(s, s.dealerSeat, (p) => p.inHand)!;
  const bbP = nextPlayer(s, sbP.seat, (p) => p.inHand)!;
  const sbAmt = putChips(sbP, s.sb);
  const bbAmt = putChips(bbP, s.bb);
  sbP.lastAction = `SB ${sbAmt}`;
  bbP.lastAction = `BB ${bbAmt}`;
  s.currentBet = s.bb;
  s.minRaise = s.bb;
  pushLog(s, `${sbP.name} 스몰 블라인드 ${sbAmt}, ${bbP.name} 빅 블라인드 ${bbAmt}`);

  s.phase = 'betting';
  s.currentPlayer = bbP.id;
  emit(s, { type: 'handStarted', handNo: s.handNumber });
  advance(s, now);
  return s;
}

// ── 베팅 ──

export interface LegalActions {
  toCall: number;
  canCheck: boolean;
  /** 레이즈 가능한지 (칩이 콜 금액보다 많고 최대 베팅 제한 안) */
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** 가진 칩 전부를 걸었을 때의 이번 스트리트 총액 */
  allInTo: number;
}

export function legalActions(s: GameState, p: Player): LegalActions {
  const toCall = Math.max(0, s.currentBet - p.bet);
  const allInTo = p.bet + p.chips;
  const capTo = s.maxBet === null ? allInTo : Math.min(allInTo, s.currentBet + s.maxBet);
  const minRaiseTo = Math.min(s.currentBet + s.minRaise, capTo);
  const banned = s.effects.raiseBannedUntil[p.id];
  const raiseSealed = banned === s.street || banned === 'done';
  const capHit = s.effects.raiseCapStreet === s.street && s.effects.raisesUnderCap >= 1;
  // 봉인/제한 시: 기존 베팅 이하 올인 콜만 허용(레이즈로 올리는 올인 불가)
  let canRaise = capTo > s.currentBet && !raiseSealed && !capHit;
  if (raiseSealed && toCall > 0 && allInTo <= s.currentBet) {
    // 올인 콜은 call로 처리되므로 canRaise는 false 유지
  }
  return {
    toCall,
    canCheck: toCall === 0,
    canRaise,
    minRaiseTo,
    maxRaiseTo: capTo,
    allInTo,
  };
}

/**
 * 플레이어의 액션 요청을 검증하고 적용한다.
 * seq는 요청을 보낼 때 본 actionSeq. 다르면 이미 처리된 중복 요청이거나 지난 요청이므로 거부한다.
 */
export function act(prev: GameState, playerId: number, action: PlayerAction, seq: number, now = Date.now()): EngineResult {
  if (prev.phase !== 'betting') return { ok: false, error: '베팅할 수 있는 단계가 아닙니다.' };
  if (seq !== prev.actionSeq) return { ok: false, error: '이미 처리되었거나 지난 요청입니다.' };
  if (prev.currentPlayer !== playerId) return { ok: false, error: '차례가 아닙니다.' };
  const me = byId(prev, playerId);
  if (!me || !canAct(me)) return { ok: false, error: '행동할 수 없는 플레이어입니다.' };
  const legal = legalActions(prev, me);

  const s = clone(prev);
  const p = byId(s, playerId)!;

  switch (action.type) {
    case 'fold': {
      p.folded = true;
      p.lastAction = '폴드';
      pushLog(s, `${p.name}: 폴드`);
      break;
    }
    case 'check': {
      if (!legal.canCheck) return { ok: false, error: '콜해야 할 금액이 있어 체크할 수 없습니다.' };
      p.lastAction = '체크';
      pushLog(s, `${p.name}: 체크`);
      break;
    }
    case 'call': {
      if (legal.toCall === 0) {
        p.lastAction = '체크';
        pushLog(s, `${p.name}: 체크`);
      } else {
        const amt = putChips(p, legal.toCall);
        p.lastAction = p.allIn ? `올인 ${p.bet}` : `콜 ${amt}`;
        pushLog(s, `${p.name}: ${p.allIn ? '올인' : '콜'} ${amt}`);
        // 심리 압박: 지정 상대가 레이즈에 콜하면 카드 한 장 공개
        const pr = s.effects.pressure;
        if (pr && !pr.fired && pr.armed && pr.targetId === p.id && s.lastAggressor === pr.ownerId) {
          const idx = Math.floor(Math.random() * p.hole.length);
          if (p.hole[idx]) {
            s.effects.privatePeeks.push({
              viewerId: pr.ownerId,
              targetId: p.id,
              cardId: p.hole[idx].id,
              rank: p.hole[idx].rank,
              suit: p.hole[idx].suit,
            });
            pr.fired = true;
            const owner = byId(s, pr.ownerId);
            if (owner) {
              const aug = owner.augments.find((a) => a.id === 'pressure' && !a.used);
              if (aug) aug.used = true;
            }
            pushLog(s, `😠 심리 압박: ${p.name}의 카드 한 장이 공개됨`);
          }
        }
      }
      break;
    }
    case 'raise': {
      const target = action.amount;
      if (!Number.isSafeInteger(target)) return { ok: false, error: '베팅 금액이 올바르지 않습니다.' };
      if (target > legal.allInTo) return { ok: false, error: '보유한 칩보다 많이 걸 수 없습니다.' };
      if (target <= s.currentBet) {
        if (target === legal.allInTo) return act(prev, playerId, { type: 'call' }, seq, now);
        return { ok: false, error: '현재 베팅보다 높게 걸어야 합니다.' };
      }
      if (!legal.canRaise || target > legal.maxRaiseTo) return { ok: false, error: '레이즈할 수 없습니다.' };
      if (target < legal.minRaiseTo && target !== legal.allInTo) {
        return { ok: false, error: `최소 ${legal.minRaiseTo}까지 올려야 합니다.` };
      }
      putChips(p, target - p.bet);
      const increment = target - s.currentBet;
      const wasBet = s.currentBet === 0;
      if (increment >= s.minRaise) {
        s.minRaise = increment;
        for (const o of s.players) if (o.id !== p.id && canAct(o)) o.hasActed = false;
      }
      s.currentBet = target;
      s.raisesThisStreet += 1;
      if (s.effects.raiseCapStreet === s.street) s.effects.raisesUnderCap += 1;
      s.lastAggressor = p.id;
      const label = p.allIn ? '올인' : wasBet ? '베팅' : '레이즈';
      p.lastAction = `${label} ${target}`;
      pushLog(s, `${p.name}: ${label} ${target}`);
      break;
    }
  }
  p.hasActed = true;
  s.actionSeq += 1;
  advance(s, now);
  return { ok: true, state: s };
}

/** 현재 차례 플레이어의 액션을 적용한다. 잘못된 요청이면 상태를 그대로 돌려준다. */
export function applyAction(prev: GameState, action: PlayerAction, now = Date.now()): GameState {
  const r = act(prev, prev.currentPlayer, action, prev.actionSeq, now);
  return r.ok ? r.state : prev;
}

function advance(s: GameState, now: number) {
  const live = s.players.filter(isLive);
  if (live.length === 1) {
    awardUncontested(s, live[0]);
    return;
  }

  const actors = live.filter((p) => !p.allIn);
  if (actors.length === 0 || (actors.length === 1 && actors[0].bet >= s.currentBet)) {
    resetStreet(s);
    s.runout = true;
    continueRunout(s, now);
    return;
  }

  const roundDone = actors.every((p) => p.hasActed && p.bet === s.currentBet);
  if (roundDone) {
    nextStreet(s, now);
    return;
  }

  // 순서 조작: actLast 플레이어는 다른 사람이 모두 행동한 뒤에만 차례
  const actLast = s.effects.actLastId;
  const actStreet = s.effects.actLastStreet;
  const next = nextPlayer(s, seatOf(s, s.currentPlayer), (p) => {
    if (!canAct(p)) return false;
    if (actLast !== null && actStreet === s.street && p.id === actLast) {
      const others = actors.filter((o) => o.id !== actLast);
      return others.every((o) => o.hasActed && o.bet === s.currentBet);
    }
    return true;
  });
  s.currentPlayer = (next ?? nextPlayer(s, seatOf(s, s.currentPlayer), canAct))!.id;
}

function dealCommunity(s: GameState, n: number) {
  for (let i = 0; i < n; i++) s.community.push(s.deck.pop()!);
}

function resetStreet(s: GameState) {
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
    if (isLive(p) && !p.allIn) p.lastAction = null;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
  s.raisesThisStreet = 0;
  s.lastAggressor = null;
}

const STREET_NAME = { flop: '플랍', turn: '턴', river: '리버' } as const;

function dealNextStreet(s: GameState) {
  if (s.street === 'preflop') {
    dealCommunity(s, 3);
    s.street = 'flop';
  } else {
    dealCommunity(s, 1);
    s.street = s.street === 'flop' ? 'turn' : 'river';
  }
  pushLog(s, `── ${STREET_NAME[s.street as keyof typeof STREET_NAME]}: ${s.community.map(cardLabel).join(' ')}`);
}

/** 증강 선택 시점: 1번째 베팅 구간(프리플랍) 뒤, 3번째 베팅 구간(턴) 뒤. 생존자가 1명이면 생략 */
function augmentPickDue(s: GameState): boolean {
  if (s.mode !== 'augmented' || s.players.filter(isLive).length < 2) return false;
  return (s.street === 'preflop' && s.augmentRoundsDone === 0) || (s.street === 'turn' && s.augmentRoundsDone === 1);
}

function nextStreet(s: GameState, now: number) {
  const ended = s.street;
  resetStreet(s);
  onStreetEndClearEffects(s, ended);
  if (augmentPickDue(s)) {
    openAugmentRound(s, now);
    return;
  }
  if (ended === 'river') {
    showdown(s);
    return;
  }
  dealNextStreet(s);
  startBettingRound(s, now);
}

/** 플랍 이후 베팅은 딜러 왼쪽부터 */
function startBettingRound(s: GameState, now: number) {
  s.phase = 'betting';
  for (const p of s.players) p.hasActed = false;
  if (s.players.filter(canAct).length <= 1) {
    s.runout = true;
    continueRunout(s, now);
    return;
  }
  const actLast = s.effects.actLastId;
  const skipLast = actLast !== null && s.effects.actLastStreet === s.street;
  s.currentPlayer = nextPlayer(
    s,
    s.dealerSeat,
    (p) => canAct(p) && !(skipLast && p.id === actLast),
  )!.id;
}

/** 더 베팅할 사람이 없을 때 남은 카드를 깐다. 증강 선택 시점에서는 멈춘다. */
function continueRunout(s: GameState, now: number) {
  while (true) {
    if (augmentPickDue(s)) {
      openAugmentRound(s, now);
      return;
    }
    if (s.street === 'river') {
      showdown(s);
      return;
    }
    dealNextStreet(s);
  }
}

// ── 증강 선택 (모든 참가자가 동시에) ──

function openAugmentRound(s: GameState, now: number) {
  const round = (s.augmentRoundsDone + 1) as 1 | 2;
  const tier = rollTier();
  const entries: AugmentRound['entries'] = {};
  for (const p of s.players) {
    if (!isLive(p) || p.status === 'leaving') continue;
    entries[p.id] = {
      offer: rollOffer(tier, p.augments.map((a) => a.id), 3, !p.isHuman, Math.random, round, true),
      rerolled: false,
      done: false,
    };
  }
  s.augmentRound = { round, tier, deadline: now + AUGMENT_PICK_MS, entries };
  s.phase = 'augment';
  s.currentPlayer = -1;
  s.actionSeq += 1;
  pushLog(s, `✨ 증강 선택 ${round}/2 · ${TIER_LABEL[tier]} 등급 (${AUGMENT_PICK_MS / 1000}초)`);

  for (const p of s.players) {
    if (!p.isHuman && entries[p.id]) botPick(s, p);
  }
  maybeFinishAugmentRound(s, now);
}

function addAugment(s: GameState, p: Player, pick: AugmentId) {
  p.augments.push({ id: pick, used: false });
  pushLog(s, `✨ ${p.name}: [${TIER_LABEL[AUGMENTS[pick].tier]}] ${AUGMENTS[pick].name} 획득`);
  emit(s, { type: 'augmentPicked', playerId: p.id, augmentId: pick });
}

function botPick(s: GameState, p: Player) {
  const entry = s.augmentRound!.entries[p.id];
  let pick = entry.offer[Math.floor(Math.random() * entry.offer.length)];
  // 봇이 재추첨을 고르면 한 번 돌리고 다시 고른다
  if (pick === 'rerollFate') {
    applyRerollFatePick(s, p.id, { pushLog });
    pick = entry.offer[Math.floor(Math.random() * entry.offer.length)] ?? pick;
  }
  if (pick && pick !== 'rerollFate' && p.augments.length < MAX_AUGMENT_SLOTS) addAugment(s, p, pick);
  entry.done = true;
}

/**
 * 증강을 고른다. pick=null은 허용하지 않는다(반드시 하나 선택).
 * 운명 재추첨을 고르면 후보만 갱신하고 선택은 계속한다.
 */
export function chooseAugment(
  prev: GameState,
  playerId: number,
  pick: AugmentId | null,
  _replace: AugmentId | null = null,
  now = Date.now(),
): EngineResult {
  const entry = prev.augmentRound?.entries[playerId];
  if (prev.phase !== 'augment' || !entry) return { ok: false, error: '증강을 고를 수 있는 단계가 아닙니다.' };
  if (entry.done) return { ok: false, error: '이미 선택했습니다.' };
  if (pick === null) return { ok: false, error: '증강을 하나 골라 주세요.' };
  if (!entry.offer.includes(pick)) return { ok: false, error: '제시된 증강이 아닙니다.' };
  const me = byId(prev, playerId)!;
  if (owns(me, pick) && pick !== 'rerollFate') return { ok: false, error: '이미 보유한 증강입니다.' };

  const s = clone(prev);
  const p = byId(s, playerId)!;

  if (pick === 'rerollFate') {
    if (!applyRerollFatePick(s, playerId, { pushLog })) {
      return { ok: false, error: '이미 재추첨했거나 사용할 수 없습니다.' };
    }
    s.actionSeq += 1;
    return { ok: true, state: s };
  }

  if (p.augments.length >= MAX_AUGMENT_SLOTS) return { ok: false, error: '이번 판 증강이 가득 찼습니다.' };
  addAugment(s, p, pick);
  s.augmentRound!.entries[playerId].done = true;
  s.actionSeq += 1;
  maybeFinishAugmentRound(s, now);
  return { ok: true, state: s };
}

/** @deprecated 운명 재추첨 증강으로 대체. 호환용 no-op 실패 */
export function rerollAugments(_prev: GameState, _playerId: number): EngineResult {
  return { ok: false, error: '전체 새로고침은 운명 재추첨 증강으로 대체되었습니다.' };
}

/** @deprecated */
export function rerollAugmentSlot(_prev: GameState, _playerId: number, _index: number): EngineResult {
  return { ok: false, error: '슬롯 새로고침은 더 이상 없습니다.' };
}

function maybeFinishAugmentRound(s: GameState, now: number) {
  const round = s.augmentRound!;
  if (!Object.values(round.entries).every((e) => e.done)) return;
  s.augmentRoundsDone += 1;
  s.augmentRound = null;
  s.actionSeq += 1;
  if (s.runout) {
    continueRunout(s, now);
    return;
  }
  dealNextStreet(s);
  startBettingRound(s, now);
}

/** 선택 제한시간이 지나도록 고르지 않은 플레이어는 후보 중 하나를 자동으로 받는다. */
function autoPickExpired(s: GameState, now: number) {
  const round = s.augmentRound;
  if (!round || now < round.deadline) return false;
  for (const [idStr, e] of Object.entries(round.entries)) {
    if (e.done) continue;
    const p = byId(s, Number(idStr))!;
    let pick = e.offer.find((id) => id !== 'rerollFate') ?? e.offer[0];
    if (pick === 'rerollFate') {
      applyRerollFatePick(s, p.id, { pushLog });
      pick = e.offer.find((id) => id !== 'rerollFate') ?? e.offer[0];
    }
    if (pick && pick !== 'rerollFate' && p.augments.length < MAX_AUGMENT_SLOTS) {
      pushLog(s, `⏱ ${p.name}: 시간 초과로 자동 선택`);
      addAugment(s, p, pick);
    } else {
      pushLog(s, `⏱ ${p.name}: 시간 초과 · 증강을 받지 못했습니다.`);
    }
    e.done = true;
  }
  maybeFinishAugmentRound(s, now);
  return true;
}

/** 일시정지 등으로 멈춘 시간만큼 증강 선택 제한시간을 늘린다. */
export function extendAugmentDeadline(prev: GameState, ms: number): GameState {
  if (!prev.augmentRound || ms <= 0) return prev;
  const s = clone(prev);
  s.augmentRound!.deadline += ms;
  return s;
}

// ── 퇴장 / 연결 끊김 ──

function foldOutOfTurn(s: GameState, p: Player, now: number) {
  const wasTurn = s.phase === 'betting' && s.currentPlayer === p.id;
  p.folded = true;
  p.lastAction = '폴드';
  pushLog(s, `${p.name}: 폴드 (퇴장)`);
  const entry = s.augmentRound?.entries[p.id];
  if (entry && !entry.done) entry.done = true;

  const live = s.players.filter(isLive);
  if (s.phase === 'betting' || s.phase === 'augment') {
    if (live.length === 1) {
      s.augmentRound = null;
      awardUncontested(s, live[0]);
      return;
    }
  }
  if (s.phase === 'augment') {
    maybeFinishAugmentRound(s, now);
  } else if (wasTurn) {
    p.hasActed = true;
    advance(s, now);
  }
}

/**
 * 자발적 퇴장. 진행 중인 핸드에 참가 중이면 자동 폴드하고(이미 낸 칩은 팟에 남는다) 판이 끝나면 자리에서 지운다.
 * 핸드에 참가하지 않았다면 바로 자리를 비운다. 반환 state에서 해당 플레이어의 chips가 돌려받을 금액이다.
 */
export function requestLeave(prev: GameState, playerId: number, now = Date.now()): EngineResult & { chips?: number } {
  const me = byId(prev, playerId);
  if (!me) return { ok: false, error: '테이블에 없는 플레이어입니다.' };
  const s = clone(prev);
  const p = byId(s, playerId)!;
  const handRunning = s.phase === 'betting' || s.phase === 'augment';
  if (handRunning && isLive(p)) foldOutOfTurn(s, p, now);
  const chips = p.chips;

  if (p.status === 'busted') {
    s.players = s.players.filter((x) => x.id !== p.id);
  } else if (p.inHand && (s.phase === 'betting' || s.phase === 'augment')) {
    p.status = 'leaving';
  } else {
    emit(s, { type: 'left', playerId: p.id, chips, reason: p.connected ? 'leave' : 'disconnect' });
    pushLog(s, `🚪 ${p.name} 퇴장`);
    s.players = s.players.filter((x) => x.id !== p.id);
  }
  s.actionSeq += 1;
  return { ok: true, state: s, chips };
}

export function markDisconnected(prev: GameState, playerId: number, now = Date.now()): GameState {
  const p0 = byId(prev, playerId);
  if (!p0 || !p0.connected) return prev;
  const s = clone(prev);
  const p = byId(s, playerId)!;
  p.connected = false;
  p.disconnectedAt = now;
  pushLog(s, `📡 ${p.name}: 연결 끊김 (${RECONNECT_GRACE_MS / 1000}초 안에 재접속 가능)`);
  return s;
}

export function markReconnected(prev: GameState, playerId: number): GameState {
  const p0 = byId(prev, playerId);
  if (!p0 || p0.connected || p0.status === 'leaving') return prev;
  const s = clone(prev);
  const p = byId(s, playerId)!;
  p.connected = true;
  p.disconnectedAt = null;
  pushLog(s, `📡 ${p.name}: 재접속`);
  return s;
}

/**
 * 시간 경과 처리: 증강 선택 시간 초과 자동 선택, 재접속 유예가 지난 플레이어 자동 폴드·퇴장.
 * 바뀐 것이 없으면 같은 객체를 돌려준다.
 */
export function tickTimeouts(prev: GameState, now = Date.now()): GameState {
  const expiredAugment = prev.augmentRound !== null && now >= prev.augmentRound.deadline;
  const dropped = prev.players.filter(
    (p) => !p.connected && p.disconnectedAt !== null && p.status !== 'leaving' && now - p.disconnectedAt >= RECONNECT_GRACE_MS,
  );
  if (!expiredAugment && dropped.length === 0) return prev;

  let s = clone(prev);
  for (const d of dropped) {
    const r = requestLeave(s, d.id, now);
    if (r.ok) s = r.state;
  }
  if (s.phase === 'augment') autoPickExpired(s, now);
  s.actionSeq += 1;
  return s;
}

// ── 정산 ──

function applyWinBonus(_s: GameState, _p: Player, _won: number, _lines: string[]) {
  // 신규 증강은 칩 민팅 보너스가 없다
}

function finishHand(s: GameState, result: HandResult) {
  for (const line of result.lines) pushLog(s, line);
  s.result = result;
  s.phase = 'handOver';
  s.currentPlayer = -1;
  s.augmentRound = null;
  // 판 종료 시 증강·임시 효과 즉시 초기화(다음 startHand에서도 다시 비움)
  for (const p of s.players) p.augments = [];
  s.effects = emptyEffects();
  s.actionSeq += 1;
  // 팟은 모두 분배됐다
  for (const p of s.players) {
    p.bet = 0;
    p.totalBet = 0;
  }
  emit(s, { type: 'handSettled', handNo: s.handNumber, pot: result.pot, lines: result.lines });

  // 정산이 끝난 뒤에만 소진 여부를 판단한다. 올인했더라도 이겼다면 계속 플레이한다.
  for (const p of s.players) {
    if (p.inHand && p.chips === 0 && p.status !== 'leaving') {
      p.status = 'busted';
      p.augments = [];
      emit(s, { type: 'busted', playerId: p.id, handNo: s.handNumber });
      pushLog(s, `💀 ${p.name}: 게임머니가 모두 소진되었습니다.`);
    }
  }
}

function netOf(s: GameState, won: Map<number, number>): Record<number, number> {
  const net: Record<number, number> = {};
  for (const p of s.players) if (p.inHand) net[p.id] = (won.get(p.id) ?? 0) - p.totalBet;
  return net;
}

function awardUncontested(s: GameState, winner: Player) {
  const pot = potSize(s);
  winner.chips += pot;
  const lines = [`🏆 ${winner.name}이(가) ${pot}칩을 획득했습니다. (상대 전원 폴드)`];
  applyWinBonus(s, winner, pot, lines);
  const won = new Map([[winner.id, pot]]);
  finishHand(s, { showdown: false, lines, winnerIds: [winner.id], pot, net: netOf(s, won) });
}

export interface SidePot {
  amount: number;
  eligibleIds: number[];
}

/** 각 플레이어가 이번 판에 낸 금액으로 메인/사이드 팟을 나눈다. 폴드한 플레이어의 칩도 포함된다. */
export function buildPots(s: GameState): SidePot[] {
  const contenders = s.players.filter(isLive);
  const levels = [...new Set(s.players.map((p) => p.totalBet).filter((v) => v > 0))].sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let prevLevel = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of s.players) amount += Math.min(p.totalBet, level) - Math.min(p.totalBet, prevLevel);
    const eligibleIds = contenders.filter((p) => p.totalBet >= level).map((p) => p.id);
    prevLevel = level;
    if (amount <= 0) continue;
    const last = pots[pots.length - 1];
    if (eligibleIds.length === 0 && last) last.amount += amount;
    else if (last && last.eligibleIds.length === eligibleIds.length) last.amount += amount;
    else pots.push({ amount, eligibleIds });
  }
  return pots;
}

function showdown(s: GameState) {
  // 올인 런아웃이 끊겼거나 덱이 모자란 경우에도 보드를 5장까지 채운다
  while (s.community.length < 5 && s.deck.length > 0) {
    s.community.push(s.deck.pop()!);
  }
  s.street = 'river';
  const contenders = s.players.filter(isLive);
  const values = new Map(contenders.map((p) => [p.id, evaluate([...p.hole, ...s.community])]));
  const lines: string[] = [];
  lines.push(`보드: ${s.community.map(cardLabel).join(' ')}`);
  for (const p of contenders) {
    lines.push(`${p.name}: ${p.hole.map(cardLabel).join(' ')} → ${values.get(p.id)!.name}`);
  }

  const pot = potSize(s);
  const pots = buildPots(s);
  const won = new Map<number, number>();
  pots.forEach((sidePot, i) => {
    const eligible = sidePot.eligibleIds.map((id) => byId(s, id)!);
    if (eligible.length === 0) return;
    let best: number[] | null = null;
    let winners: Player[] = [];
    for (const p of eligible) {
      const sc = values.get(p.id)!.score;
      const cmp = best ? compareScore(sc, best) : 1;
      if (cmp > 0) {
        best = sc;
        winners = [p];
      } else if (cmp === 0) {
        winners.push(p);
      }
    }
    // 나누어떨어지지 않는 칩은 딜러 왼쪽부터 한 칩씩 준다
    winners.sort((a, b) => ((a.seat - s.dealerSeat + MAX_SEATS * 2 - 1) % MAX_SEATS) - ((b.seat - s.dealerSeat + MAX_SEATS * 2 - 1) % MAX_SEATS));
    const share = Math.floor(sidePot.amount / winners.length);
    let remainder = sidePot.amount - share * winners.length;
    for (const w of winners) {
      const amt = share + (remainder-- > 0 ? 1 : 0);
      w.chips += amt;
      won.set(w.id, (won.get(w.id) ?? 0) + amt);
    }
    const potName = pots.length > 1 ? (i === 0 ? '메인 팟' : `사이드 팟 ${i}`) : '팟';
    lines.push(
      `🏆 ${winners.map((w) => w.name).join(', ')}: ${potName} ${sidePot.amount}칩 획득 (${values.get(winners[0].id)!.name})`,
    );
  });

  for (const p of contenders) {
    const w = won.get(p.id) ?? 0;
    if (w > 0) applyWinBonus(s, p, w, lines);
  }

  finishHand(s, { showdown: true, lines, winnerIds: [...won.keys()], pot, net: netOf(s, won) });
}

// ── 능동형 증강 ──

export function invokeAugment(
  prev: GameState,
  augmentId: AugmentId,
  payload: AugmentPayload,
  playerId = prev.heroId,
): EngineResult {
  return useAugmentImpl(prev, playerId, augmentId, payload, augmentCtx);
}

export { canUseAugment };
export type { AugmentPayload };

/** 미래 예지로 본 다음 카드(본인만) */
export function peekForesight(s: GameState, playerId = s.heroId) {
  return s.effects.foresight[playerId] ?? null;
}

export function peekNextCard(s: GameState) {
  return s.deck[s.deck.length - 1];
}

/** @deprecated */
export function canUseMulligan() {
  return false;
}
/** @deprecated */
export function mulliganCard(prev: GameState) {
  return prev;
}
/** @deprecated */
export function canSeeNextCard(s: GameState, playerId = s.heroId) {
  return Boolean(s.effects.foresight[playerId]);
}
/** @deprecated */
export function canUseFateTwist() {
  return false;
}
/** @deprecated */
export function twistFate(prev: GameState) {
  return prev;
}

/** 테이블 위 전체 칩 (스택 + 팟). 증강으로 생긴 칩을 빼면 판이 바뀌어도 일정해야 한다. */
export function totalChips(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.chips + p.totalBet, 0);
}
