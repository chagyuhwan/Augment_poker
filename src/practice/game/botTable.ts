import { createTable, seatPlayer } from './engine';
import type { GameState, TableMode } from './types';

const BOT_NAMES = ['가렌', '아리', '징크스', '럭스', '티모', '애쉬', '이즈리얼', '카이사', '야스오', '세트', '유미', '말파이트'];

export interface PracticeOptions {
  tableId: string;
  mode: TableMode;
  playerName: string;
  /** 계정에서 가져온 바이인 금액 */
  buyIn: number;
  /** 처음 앉는 봇 수 (1~5). 이 수를 유지하도록 빈자리를 채운다 */
  botCount: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBet: number | null;
}

/** 봇 스택은 계정 지갑과 무관한 가상 칩. 최소 입장 금액 ~ 3배 사이에서 빅 블라인드 단위로 정한다. */
function botStack(o: Pick<PracticeOptions, 'minBuyIn' | 'bigBlind'>, rng: () => number): number {
  const raw = o.minBuyIn * (1 + rng() * 2);
  return Math.max(o.minBuyIn, Math.round(raw / o.bigBlind) * o.bigBlind);
}

function pickName(s: GameState | null, rng: () => number): string {
  const used = new Set(s?.players.map((p) => p.name) ?? []);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free.length ? free[Math.floor(rng() * free.length)] : `봇 ${Math.floor(rng() * 900 + 100)}`;
}

export function createPracticeTable(o: PracticeOptions, rng: () => number = Math.random, now = Date.now()): GameState {
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
      hero: { name: o.playerName, isHuman: true, chips: o.buyIn },
      others: names.map((name) => ({ name, isHuman: false, chips: botStack(o, rng) })),
      smallBlind: o.smallBlind,
      bigBlind: o.bigBlind,
      maxBet: o.maxBet,
    },
    now,
  );
}

/**
 * 판 사이에 빈자리를 봇으로 채운다. 소진/퇴장한 봇 자리에 새 봇이 앉아 다음 판부터 참가한다.
 * 한 판에 한 명씩, 일정 확률로만 들어와 자리가 비어 있는 시간이 생긴다.
 */
export function refillBots(
  s: GameState,
  o: Pick<PracticeOptions, 'botCount' | 'minBuyIn' | 'bigBlind'>,
  rng: () => number = Math.random,
): GameState {
  const seatedBots = s.players.filter((p) => !p.isHuman && p.status !== 'busted' && p.status !== 'leaving').length;
  const occupied = s.players.filter((p) => p.status !== 'busted' && p.status !== 'leaving').length;
  if (seatedBots >= o.botCount || occupied >= s.maxSeats) return s;
  // 혼자 남았으면 바로 채우고, 아니면 판마다 40% 확률
  const alone = occupied <= 1;
  if (!alone && rng() >= 0.4) return s;
  const r = seatPlayer(s, { name: pickName(s, rng), isHuman: false, chips: botStack(o, rng) });
  return r.ok ? r.state : s;
}
