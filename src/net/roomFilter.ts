import type { RoomListing, RoomQuery } from './types';

export type JoinBlockReason = 'full' | 'money';

/**
 * 게임이 진행 중인 방에도 빈자리가 있으면 입장할 수 있다(다음 판부터 참가).
 * balance가 null이면 아직 잔액을 모르는 것이므로 금액 조건은 검사하지 않는다.
 */
export function joinBlockReason(room: RoomListing, balance: number | null = null): JoinBlockReason | null {
  if (room.currentPlayers >= room.maxPlayers) return 'full';
  if (balance !== null && balance < room.minBuyIn) return 'money';
  return null;
}

export const JOIN_BLOCK_LABEL: Record<JoinBlockReason, string> = {
  full: '인원이 가득 찼습니다',
  money: '게임머니가 부족합니다',
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
