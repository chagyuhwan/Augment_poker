import { DEFAULT_MATCH_HANDS, DEFAULT_STARTING_CHIPS } from '../../core/matchRules';
import { createTable, seatPlayer } from './engine';
import type { GameState, TableMode } from './types';

const BOT_NAMES = ['가렌', '아리', '징크스', '럭스', '티모', '애쉬', '이즈리얼', '카이사', '야스오', '세트', '유미', '말파이트'];

export interface PracticeOptions {
  tableId: string;
  mode: TableMode;
  playerName: string;
  /** 매치 시작 칩(전원 동일). 레거시 필드명 buyIn 유지 */
  buyIn: number;
  botCount: number;
  smallBlind: number;
  bigBlind: number;
  /** @deprecated startingChips와 동일 */
  minBuyIn: number;
  maxBet: number | null;
  matchHands?: number;
  startingChips?: number;
}

function pickName(s: GameState | null, rng: () => number): string {
  const used = new Set(s?.players.map((p) => p.name) ?? []);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free.length ? free[Math.floor(rng() * free.length)] : `봇 ${Math.floor(rng() * 900 + 100)}`;
}

export function createPracticeTable(o: PracticeOptions, rng: () => number = Math.random, now = Date.now()): GameState {
  const startingChips = o.startingChips ?? o.buyIn ?? o.minBuyIn ?? DEFAULT_STARTING_CHIPS;
  const matchHands = o.matchHands ?? DEFAULT_MATCH_HANDS;
  const count = Math.min(5, Math.max(1, Math.floor(o.botCount)));
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const pool = BOT_NAMES.filter((n) => !names.includes(n));
    names.push(pool[Math.floor(rng() * pool.length)]);
  }
  return createTable(
    {
      tableId: o.tableId,
      mode: o.mode,
      hero: { name: o.playerName, isHuman: true, chips: startingChips },
      others: names.map((name) => ({ name, isHuman: false, chips: startingChips })),
      smallBlind: o.smallBlind,
      bigBlind: o.bigBlind,
      maxBet: o.maxBet,
      matchHands,
      startingChips,
    },
    now,
  );
}

/**
 * 빈자리를 봇으로 채운다. 매치 중에는 칩 소진으로 퇴장하지 않으므로
 * 주로 자발 퇴장·연결 끊김 자리를 채운다.
 */
export function refillBots(
  s: GameState,
  o: Pick<PracticeOptions, 'botCount' | 'bigBlind'> &
    Partial<Pick<PracticeOptions, 'minBuyIn' | 'startingChips' | 'buyIn'>>,
  rng: () => number = Math.random,
): GameState {
  const chips = o.startingChips ?? o.buyIn ?? o.minBuyIn ?? s.startingChips;
  const seatedBots = s.players.filter((p) => !p.isHuman && p.status !== 'leaving').length;
  const occupied = s.players.filter((p) => p.status !== 'leaving').length;
  if (seatedBots >= o.botCount || occupied >= s.maxSeats) return s;
  const alone = occupied <= 1;
  if (!alone && rng() >= 0.4) return s;
  const r = seatPlayer(s, { name: pickName(s, rng), isHuman: false, chips });
  return r.ok ? r.state : s;
}
