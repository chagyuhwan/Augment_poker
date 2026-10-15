import type { RoomConfig } from '../core/roomConfig';
import type { AugmentId, GameState, PlayerAction } from '../practice/game/types';
import type { AugmentPayload } from '../practice/game/engine';
import type { RoomSnapshot } from './types';

export const LAN_DEFAULT_PORT = 17845;

export type LanActionRequest =
  | { kind: 'act'; action: PlayerAction; actionSeq: number }
  | { kind: 'chooseAugment'; pick: AugmentId | null; replace: AugmentId | null }
  | { kind: 'invokeAugment'; id: AugmentId; payload: AugmentPayload }
  | { kind: 'peekForesight' };

/** 호스트 ↔ 게스트 JSON 메시지 */
export type LanMessage =
  | {
      t: 'hello';
      code: string;
      password?: string;
      playerId: string;
      displayName: string;
      buyIn: number;
    }
  | { t: 'welcome'; peerId: string; room: RoomSnapshot; yourPlayerId: string }
  | { t: 'reject'; reason: string }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'ready'; playerId: string; ready: boolean }
  | {
      t: 'start';
      tableId: string;
      /** peerId → 엔진 seat player id */
      seatByPeer: Record<string, number>;
      buyIns: Record<string, number>;
    }
  | { t: 'state'; seq: number; view: GameState }
  | { t: 'action'; playerId: string; reqId: string; request: LanActionRequest }
  | { t: 'actionAck'; reqId: string; ok: boolean; error?: string }
  | { t: 'leave'; playerId: string }
  | { t: 'ping' }
  | { t: 'pong' };

export type LanHostInfo = {
  port: number;
  addresses: string[];
  /** 같은 PC 테스트용 */
  loopback: string;
};

export function isLanMessage(v: unknown): v is LanMessage {
  return Boolean(v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string');
}

export function roomConfigPublic(config: RoomConfig): RoomSnapshot['config'] {
  const { password, ...rest } = config;
  return { ...rest, hasPassword: Boolean(password) };
}
