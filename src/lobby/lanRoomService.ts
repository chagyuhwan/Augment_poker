import { getGameMode } from '../core/gameModes';
import type { RoomConfig } from '../core/roomConfig';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../core/roomCode';
import { isLanMessage, LAN_DEFAULT_PORT, roomConfigPublic, type LanMessage } from '../net/lanProtocol';
import type {
  IRoomService,
  Result,
  RoomListing,
  RoomMember,
  RoomSnapshot,
  Unsubscribe,
} from '../net/types';
import { bridge } from '../platform/desktopBridge';

export type LanRole = 'idle' | 'host' | 'guest';

export interface LanMember extends RoomMember {
  peerId: string;
  buyIn: number;
}

export interface LanStartPayload {
  tableId: string;
  seatByPeer: Record<string, number>;
  buyIns: Record<string, number>;
  room: RoomSnapshot;
  /** 로컬 플레이어 id */
  localPlayerId: string;
  role: 'host' | 'guest';
}

type Listener = (room: RoomSnapshot | null) => void;
type StartListener = (payload: LanStartPayload) => void;
type ActionListener = (fromPeerId: string, msg: Extract<LanMessage, { t: 'action' }>) => void;
type StateListener = (view: import('../practice/game/types').GameState, seq: number) => void;

function cryptoRandomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/**
 * Electron LAN WebSocket 기반 방 서비스.
 * 호스트가 권한·방 상태를 들고, 게스트는 코드+IP로 접속한다.
 */
export class LanRoomService implements IRoomService {
  readonly available = true;
  readonly unavailableReason: string | null = null;
  readonly kind = 'lan' as const;

  private role: LanRole = 'idle';
  private room: RoomSnapshot | null = null;
  private config: RoomConfig | null = null;
  private members: LanMember[] = [];
  private localPlayerId = '';
  private localName = '';
  private code: string | null = null;
  private port = LAN_DEFAULT_PORT;
  private addresses: string[] = [];
  private hostAddress = '';
  private listeners = new Set<Listener>();
  private startListeners = new Set<StartListener>();
  private actionListeners = new Set<ActionListener>();
  private stateListeners = new Set<StateListener>();
  private unsubMsg: Unsubscribe | null = null;
  private unsubPeer: Unsubscribe | null = null;
  /** peerId → playerId (host side) */
  private peerToPlayer = new Map<string, string>();

  constructor(localPlayerId: string, localName: string) {
    this.localPlayerId = localPlayerId;
    this.localName = localName;
  }

  getCurrentRoom(): RoomSnapshot | null {
    return this.room;
  }

  getLanMeta() {
    return {
      role: this.role,
      code: this.code,
      port: this.port,
      addresses: this.addresses,
      hostAddress: this.hostAddress || this.addresses[0] || '127.0.0.1',
      members: this.members.map((m) => ({ ...m })),
      localPlayerId: this.localPlayerId,
    };
  }

  onCurrentRoomChanged(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onMatchStart(listener: StartListener): Unsubscribe {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onRemoteAction(listener: ActionListener): Unsubscribe {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  onStateView(listener: StateListener): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async listRooms(): Promise<Result<RoomListing[]>> {
    return {
      ok: true,
      value: [],
    };
  }

  async createRoom(config: RoomConfig): Promise<Result<RoomSnapshot>> {
    const mode = getGameMode(config.mode);
    if (mode.variant !== 'holdem') {
      return { ok: false, code: 'invalid-config', message: 'LAN 대전은 홀덤만 지원합니다. (7포커는 준비 중)' };
    }
    await this.leaveRoom();
    const started = await bridge.lanHostStart({ port: LAN_DEFAULT_PORT });
    if (!started.ok) {
      return {
        ok: false,
        code: 'network',
        message:
          started.error.includes('is not a function') || started.error.includes('No handler')
            ? 'LAN 서버를 시작할 수 없습니다. Electron을 완전히 종료한 뒤 npm run electron:dev 로 다시 실행해 주세요.'
            : started.error,
      };
    }

    this.role = 'host';
    this.port = started.port;
    this.addresses = started.addresses;
    this.code = generateRoomCode(cryptoRandomInt);
    this.config = { ...config };
    this.members = [
      {
        playerId: this.localPlayerId,
        displayName: this.localName,
        isHost: true,
        isReady: true,
        peerId: 'local',
        buyIn: config.startingChips || config.minBuyIn,
      },
    ];
    this.peerToPlayer.clear();
    this.room = this.buildSnapshot();
    this.bindTransport();
    this.emitRoom();
    return { ok: true, value: this.room };
  }

  async joinRoom(_roomId: string, _password?: string): Promise<Result<RoomSnapshot>> {
    return {
      ok: false,
      code: 'not-found',
      message: '공개 방 목록은 LAN에서 지원하지 않습니다. 방 코드와 호스트 IP로 입장하세요.',
    };
  }

  async joinByCode(code: string, password?: string, host?: string): Promise<Result<RoomSnapshot>> {
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      return { ok: false, code: 'invalid-config', message: '방 코드가 올바르지 않습니다.' };
    }
    const hostAddr = (host ?? '').trim() || '127.0.0.1';
    await this.leaveRoom();
    const connected = await bridge.lanConnect({ host: hostAddr, port: LAN_DEFAULT_PORT });
    if (!connected.ok) {
      return {
        ok: false,
        code: 'network',
        message:
          connected.error.includes('is not a function') || connected.error.includes('No handler')
            ? 'LAN 연결 API가 없습니다. Electron을 완전히 종료한 뒤 다시 실행해 주세요.'
            : connected.error,
      };
    }

    this.role = 'guest';
    this.port = connected.port;
    this.hostAddress = hostAddr;
    this.code = normalized;
    this.bindTransport();

    const hello: LanMessage = {
      t: 'hello',
      code: normalized,
      password: password || undefined,
      playerId: this.localPlayerId,
      displayName: this.localName,
      buyIn: 0,
    };
    await bridge.lanSend('host', hello);

    const welcomed = await this.waitWelcome(10_000);
    if (!welcomed.ok) {
      await this.leaveRoom();
      return welcomed;
    }
    return { ok: true, value: welcomed.value };
  }

  /** 입장 시 바이인 금액을 확정(대기실에서 호출) */
  async setLocalBuyIn(buyIn: number): Promise<void> {
    const me = this.members.find((m) => m.playerId === this.localPlayerId);
    if (me) me.buyIn = buyIn;
    if (this.role === 'guest') {
      await bridge.lanSend('host', {
        t: 'hello',
        code: this.code!,
        playerId: this.localPlayerId,
        displayName: this.localName,
        buyIn,
      } satisfies LanMessage);
    }
    this.refreshSnapshot();
  }

  setReady(ready: boolean): void {
    const me = this.members.find((m) => m.playerId === this.localPlayerId);
    if (!me) return;
    me.isReady = ready;
    this.refreshSnapshot();
    const msg: LanMessage = { t: 'ready', playerId: this.localPlayerId, ready };
    if (this.role === 'host') void bridge.lanBroadcast(msg);
    else void bridge.lanSend('host', msg);
  }

  /** 호스트: 매치 시작 신호. seatByPeer는 호스트가 테이블 생성 후 채워 보낼 수 있음 */
  async beginMatch(tableId: string, seatByPeer: Record<string, number>): Promise<Result<LanStartPayload>> {
    if (this.role !== 'host' || !this.room) {
      return { ok: false, code: 'unknown', message: '방장만 시작할 수 있습니다.' };
    }
    if (this.members.length < 1) {
      return { ok: false, code: 'invalid-config', message: '방에 플레이어가 없습니다.' };
    }
    const buyIns: Record<string, number> = {};
    for (const m of this.members) buyIns[m.playerId] = m.buyIn;
    const payload: LanStartPayload = {
      tableId,
      seatByPeer,
      buyIns,
      room: this.room,
      localPlayerId: this.localPlayerId,
      role: 'host',
    };
    const msg: LanMessage = { t: 'start', tableId, seatByPeer, buyIns };
    await bridge.lanBroadcast(msg);
    this.room = { ...this.room, state: 'playing' };
    this.emitRoom();
    for (const l of this.startListeners) l(payload);
    return { ok: true, value: payload };
  }

  /** 호스트가 게스트에게 시야 제한된 상태 전송 */
  async sendStateView(peerId: string, seq: number, view: import('../practice/game/types').GameState): Promise<void> {
    if (this.role !== 'host') return;
    await bridge.lanSend(peerId, { t: 'state', seq, view } satisfies LanMessage);
  }

  async broadcastActionAck(reqId: string, ok: boolean, error?: string): Promise<void> {
    const msg: LanMessage = { t: 'actionAck', reqId, ok, error };
    if (this.role === 'host') await bridge.lanBroadcast(msg);
  }

  async sendAction(request: Extract<LanMessage, { t: 'action' }>['request'], reqId: string): Promise<void> {
    const msg: LanMessage = { t: 'action', playerId: this.localPlayerId, reqId, request };
    if (this.role === 'guest') await bridge.lanSend('host', msg);
  }

  async leaveRoom(): Promise<void> {
    if (this.role === 'guest' && this.localPlayerId) {
      await bridge.lanSend('host', { t: 'leave', playerId: this.localPlayerId } satisfies LanMessage);
    } else if (this.role === 'host') {
      await bridge.lanBroadcast({ t: 'leave', playerId: this.localPlayerId } satisfies LanMessage);
    }
    this.teardown();
    await bridge.lanShutdown();
  }

  // ── internal ──

  private bindTransport() {
    this.unsubMsg?.();
    this.unsubPeer?.();
    this.unsubMsg = bridge.onLanMessage(({ from, msg }) => {
      if (!isLanMessage(msg)) return;
      void this.handleMessage(from, msg);
    });
    this.unsubPeer = bridge.onLanPeer(({ type, peerId }) => {
      if (type === 'disconnected' && this.role === 'host') {
        const playerId = this.peerToPlayer.get(peerId);
        if (playerId) this.removeMember(playerId);
        this.peerToPlayer.delete(peerId);
      }
      if (type === 'disconnected' && this.role === 'guest' && peerId === 'host') {
        this.teardown();
        this.emitRoom();
      }
    });
  }

  private async handleMessage(from: string, msg: LanMessage) {
    if (this.role === 'host') {
      if (msg.t === 'hello') {
        await this.hostHandleHello(from, msg);
        return;
      }
      if (msg.t === 'ready') {
        const m = this.members.find((x) => x.playerId === msg.playerId);
        if (m) {
          m.isReady = msg.ready;
          this.refreshSnapshot();
          await bridge.lanBroadcast({ t: 'room', room: this.room! });
        }
        return;
      }
      if (msg.t === 'leave') {
        this.removeMember(msg.playerId);
        return;
      }
      if (msg.t === 'action') {
        for (const l of this.actionListeners) l(from, msg);
        return;
      }
      if (msg.t === 'ping') {
        await bridge.lanSend(from, { t: 'pong' });
        return;
      }
    }

    if (this.role === 'guest') {
      if (msg.t === 'welcome') {
        this.room = msg.room;
        this.members = msg.room.members.map((m) => ({
          ...m,
          peerId: m.playerId === this.localPlayerId ? 'local' : m.isHost ? 'host' : m.playerId,
          buyIn: this.config?.minBuyIn ?? msg.room.config.minBuyIn,
        }));
        this.emitRoom();
        this.resolveWelcome?.({ ok: true, value: msg.room });
        this.resolveWelcome = null;
        return;
      }
      if (msg.t === 'reject') {
        this.resolveWelcome?.({ ok: false, code: 'network', message: msg.reason });
        this.resolveWelcome = null;
        return;
      }
      if (msg.t === 'room') {
        this.room = msg.room;
        this.members = msg.room.members.map((m) => ({
          ...m,
          peerId: m.playerId === this.localPlayerId ? 'local' : m.isHost ? 'host' : m.playerId,
          buyIn: this.members.find((x) => x.playerId === m.playerId)?.buyIn ?? msg.room.config.minBuyIn,
        }));
        this.emitRoom();
        return;
      }
      if (msg.t === 'ready') {
        const m = this.members.find((x) => x.playerId === msg.playerId);
        if (m) m.isReady = msg.ready;
        this.refreshSnapshot();
        return;
      }
      if (msg.t === 'start') {
        if (!this.room) return;
        this.room = { ...this.room, state: 'playing' };
        this.emitRoom();
        const payload: LanStartPayload = {
          tableId: msg.tableId,
          seatByPeer: msg.seatByPeer,
          buyIns: msg.buyIns,
          room: this.room,
          localPlayerId: this.localPlayerId,
          role: 'guest',
        };
        for (const l of this.startListeners) l(payload);
        return;
      }
      if (msg.t === 'state') {
        for (const l of this.stateListeners) l(msg.view, msg.seq);
        return;
      }
      if (msg.t === 'leave') {
        this.teardown();
        this.emitRoom();
        return;
      }
    }
  }

  private async hostHandleHello(
    peerId: string,
    msg: Extract<LanMessage, { t: 'hello' }>,
  ) {
    if (!this.config || !this.room || !this.code) return;
    if (msg.code !== this.code) {
      await bridge.lanSend(peerId, { t: 'reject', reason: '방 코드가 일치하지 않습니다.' });
      return;
    }
    if (this.config.password && msg.password !== this.config.password) {
      await bridge.lanSend(peerId, { t: 'reject', reason: '비밀번호가 올바르지 않습니다.' });
      return;
    }
    if (this.room.state === 'playing') {
      await bridge.lanSend(peerId, { t: 'reject', reason: '이미 게임이 시작되었습니다.' });
      return;
    }
    const existing = this.members.find((m) => m.playerId === msg.playerId);
    if (existing) {
      existing.peerId = peerId;
      existing.displayName = msg.displayName;
      if (msg.buyIn > 0) existing.buyIn = msg.buyIn;
      this.peerToPlayer.set(peerId, msg.playerId);
      this.refreshSnapshot();
      await bridge.lanSend(peerId, {
        t: 'welcome',
        peerId,
        room: this.room!,
        yourPlayerId: msg.playerId,
      });
      await bridge.lanBroadcast({ t: 'room', room: this.room! }, peerId);
      return;
    }
    if (this.members.length >= this.config.maxPlayers) {
      await bridge.lanSend(peerId, { t: 'reject', reason: '방이 가득 찼습니다.' });
      return;
    }
    this.members.push({
      playerId: msg.playerId,
      displayName: msg.displayName,
      isHost: false,
      isReady: false,
      peerId,
      buyIn: msg.buyIn > 0 ? msg.buyIn : this.config.minBuyIn,
    });
    this.peerToPlayer.set(peerId, msg.playerId);
    this.refreshSnapshot();
    await bridge.lanSend(peerId, {
      t: 'welcome',
      peerId,
      room: this.room!,
      yourPlayerId: msg.playerId,
    });
    await bridge.lanBroadcast({ t: 'room', room: this.room! }, peerId);
  }

  private removeMember(playerId: string) {
    if (playerId === this.localPlayerId) return;
    this.members = this.members.filter((m) => m.playerId !== playerId);
    this.refreshSnapshot();
    if (this.room) void bridge.lanBroadcast({ t: 'room', room: this.room });
  }

  private buildSnapshot(): RoomSnapshot {
    return {
      id: `lan-${this.code}`,
      code: this.code,
      config: roomConfigPublic(this.config!),
      hostId: this.localPlayerId,
      members: this.members.map(({ playerId, displayName, isHost, isReady }) => ({
        playerId,
        displayName,
        isHost,
        isReady,
      })),
      state: this.room?.state ?? 'waiting',
    };
  }

  private refreshSnapshot() {
    if (!this.config) return;
    this.room = this.buildSnapshot();
    this.emitRoom();
  }

  private emitRoom() {
    for (const l of this.listeners) l(this.room);
  }

  private resolveWelcome: ((r: Result<RoomSnapshot>) => void) | null = null;

  private waitWelcome(ms: number): Promise<Result<RoomSnapshot>> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.resolveWelcome = null;
        resolve({ ok: false, code: 'network', message: '호스트 응답이 없습니다. IP와 코드를 확인하세요.' });
      }, ms);
      this.resolveWelcome = (r) => {
        window.clearTimeout(timer);
        resolve(r);
      };
    });
  }

  private teardown() {
    this.unsubMsg?.();
    this.unsubPeer?.();
    this.unsubMsg = null;
    this.unsubPeer = null;
    this.role = 'idle';
    this.room = null;
    this.config = null;
    this.members = [];
    this.code = null;
    this.peerToPlayer.clear();
    this.resolveWelcome = null;
  }

  /** peerId로 멤버 찾기 (호스트용) */
  peerIdForPlayer(playerId: string): string | null {
    const m = this.members.find((x) => x.playerId === playerId);
    return m?.peerId ?? null;
  }

  playerIdForPeer(peerId: string): string | null {
    return this.peerToPlayer.get(peerId) ?? null;
  }
}
