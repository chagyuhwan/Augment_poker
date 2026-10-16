/**
 * QA 자동 시뮬레이션 공통 하네스.
 * 시드 RNG로 핸드를 끝까지 돌리고 칩 보존·조기종료·증강 정지를 검증한다.
 */
import { AUGMENTS, MAX_AUGMENT_SLOTS } from '../src/practice/game/augments';
import { refillBots } from '../src/practice/game/botTable';
import {
  AUGMENT_PICK_MS,
  act,
  applyAction,
  byId,
  canStartHand,
  chooseAugment,
  createTable,
  invokeAugment,
  legalActions,
  potSize,
  seatPlayer,
  startHand,
  tickTimeouts,
  totalChips,
  type AugmentPayload,
  type CreateTableOptions,
} from '../src/practice/game/engine';
import type { AugmentId, GameState, PlayerAction, TableMode } from '../src/practice/game/types';

export const T0 = 1_000_000;

export function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

export function makeTable(
  stacks: number[],
  opts: Partial<CreateTableOptions> & { mode?: TableMode } = {},
  now = T0,
): GameState {
  const starting = opts.startingChips ?? Math.max(...stacks, 1000);
  return createTable(
    {
      tableId: opts.tableId ?? 'qa',
      mode: opts.mode ?? 'augmented',
      hero: { name: 'P0', isHuman: true, chips: stacks[0] },
      others: stacks.slice(1).map((chips, i) => ({ name: `P${i + 1}`, isHuman: false, chips })),
      smallBlind: opts.smallBlind ?? 5,
      bigBlind: opts.bigBlind ?? 10,
      maxBet: opts.maxBet ?? null,
      matchHands: opts.matchHands ?? 10_000,
      startingChips: starting,
    },
    now,
  );
}

export type Style = 'tight' | 'aggro' | 'random' | 'bluff' | 'allin' | 'passive';

export function styleAction(s: GameState, style: Style, rng: () => number): PlayerAction {
  const p = byId(s, s.currentPlayer)!;
  const legal = legalActions(s, p);
  const r = rng();
  switch (style) {
    case 'tight':
      if (legal.toCall === 0) return { type: 'check' };
      if (legal.toCall > p.chips * 0.15) return { type: 'fold' };
      return { type: 'call' };
    case 'aggro':
      if (legal.canRaise && r < 0.55) {
        const span = Math.max(0, legal.maxRaiseTo - legal.minRaiseTo);
        return { type: 'raise', amount: legal.minRaiseTo + Math.floor(rng() * (span + 1)) };
      }
      return legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
    case 'bluff':
      if (legal.canRaise && r < 0.4) return { type: 'raise', amount: legal.minRaiseTo };
      if (legal.toCall > 0 && r < 0.35) return { type: 'fold' };
      return legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
    case 'allin':
      if (legal.canRaise) return { type: 'raise', amount: legal.allInTo };
      return legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
    case 'passive':
      return legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
    case 'random':
    default:
      if (r < 0.12 && legal.toCall > 0) return { type: 'fold' };
      if (r < 0.35 && legal.canRaise) {
        const span = Math.max(0, legal.maxRaiseTo - legal.minRaiseTo);
        return { type: 'raise', amount: legal.minRaiseTo + Math.floor(rng() * (span + 1)) };
      }
      return legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
  }
}

export interface HandResult {
  state: GameState;
  steps: number;
  error?: string;
  /** 쇼다운인데 보드가 5장 미만 */
  incompleteBoard: boolean;
  /** 생존 ≥2 인데 폴드승으로 끝난 경우(비정상 후보) — awardUncontested는 live=1만 */
  contestedWithoutShowdown: boolean;
}

/** 한 핸드를 phase 드라이버로 끝까지 진행. 멈추거나 예외면 error 기록 */
export function playHandToEnd(
  start: GameState,
  opts: {
    rng: () => number;
    style?: Style | ((s: GameState) => Style);
    now?: number;
    maxSteps?: number;
    /** 베팅 중 능동 증강 시도 (확률) */
    useAugmentChance?: number;
    pickAugment?: (s: GameState, playerId: number, offer: AugmentId[]) => AugmentId | null;
  },
): HandResult {
  let s = start;
  let now = opts.now ?? T0;
  const maxSteps = opts.maxSteps ?? 800;
  let steps = 0;
  let error: string | undefined;

  const pickStyle = (st: GameState): Style =>
    typeof opts.style === 'function' ? opts.style(st) : (opts.style ?? 'random');

  try {
    while (s.phase !== 'handOver' && steps++ < maxSteps) {
      if (s.phase === 'betting') {
        if ((opts.useAugmentChance ?? 0) > 0 && opts.rng() < (opts.useAugmentChance ?? 0)) {
          const actor = byId(s, s.currentPlayer)!;
          const usable = actor.augments.filter((a) => !a.used && a.id !== 'augShield' && a.id !== 'rerollFate');
          if (usable.length) {
            const id = usable[Math.floor(opts.rng() * usable.length)].id;
            const payload = autoPayload(s, actor.id, id, opts.rng);
            if (payload) {
              const r = invokeAugment(s, id, payload, actor.id);
              if (r.ok) s = r.state;
            }
          }
        }
        // QA에서는 decideBotAction(몬테카를로) 대신 가벼운 스타일 에이전트만 사용
        const action = styleAction(s, pickStyle(s), opts.rng);
        const r = act(s, s.currentPlayer, action, s.actionSeq, now);
        if (!r.ok) {
          // 잘못된 액션이면 콜/체크로 재시도
          const fallback = applyAction(s, { type: 'call' }, now);
          if (fallback === s) {
            error = `act rejected: ${r.error}`;
            break;
          }
          s = fallback;
        } else {
          s = r.state;
        }
      } else if (s.phase === 'augment') {
        const round = s.augmentRound!;
        let progressed = false;
        for (const [idStr, entry] of Object.entries(round.entries)) {
          if (entry.done) continue;
          const pid = Number(idStr);
          const pick =
            opts.pickAugment?.(s, pid, entry.offer) ??
            entry.offer.find((id) => id !== 'rerollFate' && !(byId(s, pid)?.augments.some((a) => a.id === id))) ??
            entry.offer[0];
          if (pick === 'rerollFate') {
            const rr = chooseAugment(s, pid, 'rerollFate', null, now);
            if (rr.ok) {
              s = rr.state;
              progressed = true;
            }
            continue;
          }
          if (pick && byId(s, pid)!.augments.length < MAX_AUGMENT_SLOTS) {
            const rr = chooseAugment(s, pid, pick, null, now);
            if (rr.ok) {
              s = rr.state;
              progressed = true;
            }
          }
        }
        if (!progressed) {
          now += AUGMENT_PICK_MS + 1;
          const next = tickTimeouts(s, now);
          if (next === s && s.phase === 'augment') {
            error = 'augment stalled (tickTimeouts no-op)';
            break;
          }
          s = next;
        }
      } else {
        break;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (steps >= maxSteps && s.phase !== 'handOver') error = error ?? `exceeded maxSteps=${maxSteps}`;

  const liveAtEnd = s.players.filter((p) => p.inHand && !p.folded);
  return {
    state: s,
    steps,
    error,
    incompleteBoard: Boolean(s.result?.showdown && s.community.length < 5),
    contestedWithoutShowdown: Boolean(s.result && !s.result.showdown && liveAtEnd.length >= 2),
  };
}

function autoPayload(s: GameState, playerId: number, id: AugmentId, rng: () => number): AugmentPayload | null {
  const me = byId(s, playerId)!;
  const others = s.players.filter((p) => p.id !== playerId && p.inHand && !p.folded);
  const opp = others[Math.floor(rng() * Math.max(1, others.length))];
  switch (AUGMENTS[id].target) {
    case 'none':
      return { type: 'none' };
    case 'selfHole':
      return me.hole.length ? { type: 'hole', index: Math.floor(rng() * me.hole.length) } : null;
    case 'selfHoleMulti':
      return me.hole.length ? { type: 'holes', indices: [0] } : null;
    case 'selfHoleSuit':
      return me.hole.length ? { type: 'suitUnify', indices: [0], suit: 'h' } : null;
    case 'selfHoleDelta': {
      const idx = 0;
      const c = me.hole[idx];
      if (!c) return null;
      const delta: 1 | -1 = c.rank >= 14 ? -1 : 1;
      return { type: 'rankNudge', index: idx, delta };
    }
    case 'opponent':
      return opp ? { type: 'target', playerId: opp.id } : null;
    case 'opponentSwap':
      return opp && me.hole.length ? { type: 'swap', targetId: opp.id, myIndex: 0 } : null;
    case 'opponentHand':
      return opp ? { type: 'handFlip', targetId: opp.id } : null;
    case 'board':
      return s.community.length ? { type: 'board', index: 0 } : null;
    case 'sealAugment': {
      const t = others.find((p) => p.augments.some((a) => !a.used));
      const a = t?.augments.find((x) => !x.used);
      return t && a ? { type: 'seal', targetId: t.id, augmentId: a.id } : null;
    }
    case 'copyPower': {
      const t = others.find((p) => p.augments.some((a) => !a.used && AUGMENTS[a.id].copyable));
      const a = t?.augments.find((x) => !x.used && AUGMENTS[x.id].copyable);
      return t && a ? { type: 'copy', targetId: t.id, augmentId: a.id } : null;
    }
    default:
      return null;
  }
}

export function chipInvariant(s: GameState, baseline: number) {
  return totalChips(s) - s.minted === baseline;
}

export function runManyHands(opts: {
  seed: number;
  hands: number;
  stacks: number[];
  mode: TableMode;
  style?: Style;
  useAugmentChance?: number;
  /** bust 후 봇 리필 (칩 총량 baseline 갱신) */
  refill?: boolean;
  targetPlayers?: number;
}) {
  const rng = seeded(opts.seed);
  let s = makeTable(opts.stacks, { mode: opts.mode, matchHands: Math.max(opts.hands + 50, 100) });
  let baseline = totalChips(s) - s.minted;
  let now = T0;
  let completed = 0;
  const errors: { hand: number; error: string }[] = [];
  let incompleteBoard = 0;
  let contestedBad = 0;
  let showdowns = 0;
  let foldsWins = 0;
  const augmentPicks: Record<string, number> = {};
  const targetPlayers = opts.targetPlayers ?? opts.stacks.length;

  for (let h = 0; h < opts.hands; h++) {
    if (s.phase === 'matchOver') break;
    if (s.phase === 'handOver' || s.phase === 'waiting') {
      if (s.phase === 'handOver' || s.phase === 'waiting') {
        s = startHand(s, now);
      }
      if (s.phase === 'matchOver') break;
      if (opts.refill && (s.phase === 'waiting' || s.players.length < targetPlayers)) {
        let guard = 0;
        while (s.players.filter((p) => p.status !== 'leaving').length < targetPlayers && guard++ < 8) {
          const before = totalChips(s) - s.minted;
          if (!byId(s, s.heroId)) {
            const r = seatPlayer(s, { name: 'P0', isHuman: true, chips: s.startingChips || 5000 });
            if (r.ok) s = { ...r.state, heroId: r.playerId! };
          } else {
            s = refillBots(
              s,
              {
                botCount: Math.max(1, targetPlayers - 1),
                minBuyIn: s.startingChips || 1000,
                startingChips: s.startingChips || 1000,
                bigBlind: s.bb,
              },
              () => 0,
            );
          }
          baseline += totalChips(s) - s.minted - before;
        }
        if (canStartHand(s)) s = startHand(s, now);
      }
      if (s.phase !== 'betting' && s.phase !== 'augment') {
        if (!opts.refill) break;
        continue;
      }
    }

    const eventSeqBefore = s.eventSeq;
    const result = playHandToEnd(s, {
      rng,
      style: opts.style ?? 'random',
      now,
      useAugmentChance: opts.useAugmentChance ?? (opts.mode === 'augmented' ? 0.25 : 0),
    });
    s = result.state;
    now += 60_000;
    if (result.error) errors.push({ hand: h, error: result.error });
    if (result.incompleteBoard) incompleteBoard++;
    if (result.contestedWithoutShowdown) contestedBad++;
    if (s.result?.showdown) showdowns++;
    else if (s.result) foldsWins++;

    for (const e of s.events) {
      if (e.seq <= eventSeqBefore) continue;
      if (e.type === 'augmentPicked') {
        augmentPicks[e.augmentId] = (augmentPicks[e.augmentId] ?? 0) + 1;
      }
    }
    if (!chipInvariant(s, baseline)) {
      errors.push({
        hand: h,
        error: `chip leak: total=${totalChips(s) - s.minted} baseline=${baseline} pot=${potSize(s)}`,
      });
      // 이후 비교를 위해 재동기화
      baseline = totalChips(s) - s.minted;
    }
    completed++;
  }

  return {
    completed,
    errors,
    incompleteBoard,
    contestedBad,
    showdowns,
    foldsWins,
    augmentPicks,
    finalHandNumber: s.handNumber,
    baseline,
  };
}

export { AUGMENTS };
