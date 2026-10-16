import { describe, expect, it } from 'vitest';
import { filterRooms, joinBlockReason } from '../src/net/roomFilter';
import type { RoomListing, RoomQuery } from '../src/net/types';

const room = (overrides: Partial<RoomListing>): RoomListing => ({
  id: overrides.title ?? 'id',
  title: '방',
  mode: 'normal-holdem',
  currentPlayers: 1,
  maxPlayers: 6,
  hasPassword: false,
  state: 'waiting',
  hostName: '호스트',
  minBuyIn: 1000,
  ...overrides,
});

const all: RoomQuery = { mode: 'all', joinableOnly: false, search: '' };

const rooms = [
  room({ title: '홀덤 초보방', mode: 'normal-holdem', currentPlayers: 2 }),
  room({ title: '7포커 고수방', mode: 'normal-seven', currentPlayers: 6, maxPlayers: 6 }),
  room({ title: '증강 홀덤 한판', mode: 'augmented-holdem', currentPlayers: 4, minBuyIn: 50000 }),
  room({ title: 'Augmented Seven', mode: 'augmented-seven', state: 'playing', currentPlayers: 3 }),
];

describe('joinBlockReason', () => {
  it('가득 찬 방을 막는다', () => {
    expect(joinBlockReason(room({ currentPlayers: 6, maxPlayers: 6 }))).toBe('full');
    expect(joinBlockReason(room({}))).toBeNull();
  });

  it('게임 중인 방도 빈자리가 있으면 입장할 수 있다', () => {
    expect(joinBlockReason(room({ state: 'playing' }))).toBeNull();
    expect(joinBlockReason(room({ state: 'playing', currentPlayers: 6 }))).toBe('full');
  });

  it('계정 잔액과 무관하게 입장할 수 있다', () => {
    expect(joinBlockReason(room({ minBuyIn: 5000 }), 0)).toBeNull();
    expect(joinBlockReason(room({ minBuyIn: 5000 }), null)).toBeNull();
  });
});

describe('filterRooms', () => {
  it('모드로 거른다', () => {
    expect(filterRooms(rooms, { ...all, mode: 'normal-seven' }).map((r) => r.title)).toEqual(['7포커 고수방']);
  });

  it('참가 가능한 방만 남긴다', () => {
    expect(filterRooms(rooms, { ...all, joinableOnly: true }).map((r) => r.title)).toEqual([
      '증강 홀덤 한판',
      'Augmented Seven',
      '홀덤 초보방',
    ]);
  });

  it('제목을 대소문자 구분 없이 검색한다', () => {
    expect(filterRooms(rooms, { ...all, search: ' augmented ' }).map((r) => r.title)).toEqual(['Augmented Seven']);
    expect(filterRooms(rooms, { ...all, search: '홀덤' })).toHaveLength(2);
  });

  it('참가 가능한 방을 먼저, 인원 많은 순으로 정렬한다', () => {
    expect(filterRooms(rooms, all).map((r) => r.title)).toEqual([
      '증강 홀덤 한판',
      'Augmented Seven',
      '홀덤 초보방',
      '7포커 고수방',
    ]);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const copy = [...rooms];
    filterRooms(rooms, all);
    expect(rooms).toEqual(copy);
  });
});
