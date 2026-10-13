import type { IRoomService, Result, RoomSnapshot, Unsubscribe } from '../net/types';

/**
 * 임시 구현: 방 서비스가 아직 연결되지 않은 상태를 표현한다.
 * 2단계에서 Steam 로비 기반 IRoomService로 교체한다. 가짜 방 목록은 만들지 않는다.
 */
export class UnavailableRoomService implements IRoomService {
  readonly available = false;

  constructor(readonly unavailableReason: string) {}

  getCurrentRoom(): RoomSnapshot | null {
    return null;
  }

  onCurrentRoomChanged(): Unsubscribe {
    return () => {};
  }

  private fail<T>(): Promise<Result<T>> {
    return Promise.resolve({ ok: false, code: 'not-connected', message: this.unavailableReason });
  }

  listRooms() {
    return this.fail<never>();
  }

  createRoom() {
    return this.fail<RoomSnapshot>();
  }

  joinRoom() {
    return this.fail<RoomSnapshot>();
  }

  joinByCode() {
    return this.fail<RoomSnapshot>();
  }

  leaveRoom(): Promise<void> {
    return Promise.resolve();
  }
}
