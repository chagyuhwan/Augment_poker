import type { GameModeId } from '../core/gameModes';
import type { RoomConfig } from '../core/roomConfig';

export type RoomErrorCode =
  | 'not-connected'
  | 'not-found'
  | 'full'
  | 'in-progress'
  | 'wrong-password'
  | 'invalid-config'
  | 'network'
  | 'unknown';

export type Result<T> = { ok: true; value: T } | { ok: false; code: RoomErrorCode; message: string };

export type RoomState = 'waiting' | 'playing';

export interface RoomListing {
  id: string;
  title: string;
  mode: GameModeId;
  currentPlayers: number;
  maxPlayers: number;
  hasPassword: boolean;
  state: RoomState;
  hostName: string;
  /** 입장할 때 필요한 최소 게임머니 */
  minBuyIn: number;
}

export type RoomModeFilter = GameModeId | 'all';

export interface RoomQuery {
  mode: RoomModeFilter;
  joinableOnly: boolean;
  search: string;
}

export interface RoomMember {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
}

export interface RoomSnapshot {
  id: string;
  /** 비공개 방에만 부여되는 입장 코드 */
  code: string | null;
  config: Omit<RoomConfig, 'password'> & { hasPassword: boolean };
  hostId: string;
  members: RoomMember[];
  state: RoomState;
}

export type Unsubscribe = () => void;

export interface IRoomService {
  readonly available: boolean;
  /** available이 false일 때 사용자에게 보여줄 이유 */
  readonly unavailableReason: string | null;
  getCurrentRoom(): RoomSnapshot | null;
  onCurrentRoomChanged(listener: (room: RoomSnapshot | null) => void): Unsubscribe;
  listRooms(): Promise<Result<RoomListing[]>>;
  createRoom(config: RoomConfig): Promise<Result<RoomSnapshot>>;
  joinRoom(roomId: string, password?: string): Promise<Result<RoomSnapshot>>;
  joinByCode(code: string, password?: string): Promise<Result<RoomSnapshot>>;
  leaveRoom(): Promise<void>;
}

export type IdentityProvider = 'steam' | 'offline';

export interface PlayerIdentity {
  playerId: string;
  displayName: string;
  provider: IdentityProvider;
}

export interface IPlayerIdentityService {
  getLocalPlayer(): PlayerIdentity;
}

export type TransportKind = 'steam-p2p' | 'local-ws' | 'unity-relay';

export interface TransportMessage {
  fromPeerId: string;
  channel: number;
  data: Uint8Array;
}

export interface INetworkTransportService {
  readonly kind: TransportKind;
  send(peerId: string, channel: number, data: Uint8Array, reliable: boolean): void;
  broadcast(channel: number, data: Uint8Array, reliable: boolean): void;
  onMessage(listener: (message: TransportMessage) => void): Unsubscribe;
  onPeerDisconnected(listener: (peerId: string) => void): Unsubscribe;
  shutdown(): Promise<void>;
}

export type GameSessionState = 'idle' | 'starting' | 'running' | 'ended';

export interface IGameSessionService {
  readonly state: GameSessionState;
  start(room: RoomSnapshot): Promise<Result<void>>;
  leave(): Promise<void>;
  onStateChanged(listener: (state: GameSessionState) => void): Unsubscribe;
}
