import { createTable } from './engine';
import type { GameState, TableMode } from './types';

const BOT_NAMES = ['가렌', '아리', '징크스', '럭스', '티모', '애쉬', '이즈리얼', '카이사'];

export interface LanHumanSeat {
  peerId: string;
  playerId: string;
  name: string;
  chips: number;
}

/**
 * LAN 매치용 테이블. humans[0]이 엔진 hero(방장)로 앉고,
 * 나머지가 게스트·봇으로 채워진다. seatByPeer는 peerId → 엔진 player.id.
 */
export function createLanTable(opts: {
  tableId: string;
  mode: TableMode;
  humans: LanHumanSeat[];
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBet: number | null;
  fillBots?: boolean;
  rng?: () => number;
  now?: number;
}): { state: GameState; seatByPeer: Record<string, number> } {
  const rng = opts.rng ?? Math.random;
  const humans = opts.humans;
  if (humans.length < 1) throw new Error('인간이 최소 1명 필요합니다.');

  const others: { name: string; isHuman: boolean; chips: number }[] = [];
  const meta: { peerId: string; playerId: string }[] = [{ peerId: humans[0].peerId, playerId: humans[0].playerId }];

  for (let i = 1; i < humans.length; i++) {
    others.push({ name: humans[i].name, isHuman: true, chips: humans[i].chips });
    meta.push({ peerId: humans[i].peerId, playerId: humans[i].playerId });
  }

  const fill = opts.fillBots !== false;
  const seatsWanted = Math.max(2, Math.min(opts.maxSeats, fill ? opts.maxSeats : Math.max(2, humans.length)));
  while (1 + others.length < seatsWanted) {
    const used = new Set([humans[0].name, ...others.map((o) => o.name)]);
    const pool = BOT_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(rng() * pool.length)] : `봇 ${others.length + 1}`;
    const raw = opts.minBuyIn * (1 + rng() * 2);
    const chips = Math.max(opts.minBuyIn, Math.round(raw / opts.bigBlind) * opts.bigBlind);
    others.push({ name, isHuman: false, chips });
  }

  const state = createTable(
    {
      tableId: opts.tableId,
      mode: opts.mode,
      maxSeats: opts.maxSeats,
      hero: { name: humans[0].name, isHuman: true, chips: humans[0].chips },
      others,
      smallBlind: opts.smallBlind,
      bigBlind: opts.bigBlind,
      maxBet: opts.maxBet,
    },
    opts.now,
  );

  const seatByPeer: Record<string, number> = {};
  // createTable: hero gets first id, then others in order
  const ordered = [...state.players].sort((a, b) => a.seat - b.seat);
  let humanIdx = 0;
  for (const p of ordered) {
    if (!p.isHuman) continue;
    const m = meta[humanIdx++];
    if (m) seatByPeer[m.peerId] = p.id;
  }

  return { state, seatByPeer };
}
