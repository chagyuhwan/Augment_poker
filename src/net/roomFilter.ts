import type { RoomListing, RoomQuery } from './types';

export type JoinBlockReason = 'full';

/**
 * 게임이 진행 중인 방에도 빈자리가 있으면 입장할 수 있다(관전 → 다음 경기부터 참가).
 * 매치 전용 칩이므로 계정 잔액으로 입장을 막지 않는다.
 */
export function joinBlockReason(room: RoomListing, _balance: number | null = null): JoinBlockReason | null {
  if (room.currentPlayers >= room.maxPlayers) return 'full';
  return null;
}

export const JOIN_BLOCK_LABEL: Record<JoinBlockReason, string> = {
  full: '인원이 가득 찼습니다',
};

/** 모드/참가 가능 여부/제목 검색으로 거르고, 참가 가능한 방과 인원이 많은 방을 위로 정렬한다. */
export function filterRooms(
  rooms: readonly RoomListing[],
  query: RoomQuery,
  balance: number | null = null,
): RoomListing[] {
  const search = query.search.trim().toLocaleLowerCase('ko-KR');
  const blocked = (room: RoomListing) => joinBlockReason(room, balance) !== null;
  return rooms
    .filter((room) => query.mode === 'all' || room.mode === query.mode)
    .filter((room) => !query.joinableOnly || !blocked(room))
    .filter((room) => search === '' || room.title.toLocaleLowerCase('ko-KR').includes(search))
    .sort((a, b) => {
      const joinA = blocked(a) ? 1 : 0;
      const joinB = blocked(b) ? 1 : 0;
      if (joinA !== joinB) return joinA - joinB;
      if (a.currentPlayers !== b.currentPlayers) return b.currentPlayers - a.currentPlayers;
      return a.title.localeCompare(b.title, 'ko-KR');
    });
}
