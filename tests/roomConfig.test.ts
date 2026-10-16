import { describe, expect, it } from 'vitest';
import { GAME_MODES, getGameMode, isGameModeId } from '../src/core/gameModes';
import {
  buyInRange,
  createDefaultRoomConfig,
  maxBetAmount,
  defaultRoomTitle,
  normalizeRoomConfig,
  ROOM_LIMITS,
  validateRoomConfig,
  type RoomConfig,
} from '../src/core/roomConfig';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET } from '../src/core/roomCode';

const fields = (c: RoomConfig) => validateRoomConfig(c).map((e) => e.field);

describe('gameModes', () => {
  it('정확히 4개 모드를 가진다', () => {
    expect(GAME_MODES.map((m) => m.id)).toEqual([
      'normal-holdem',
      'normal-seven',
      'augmented-holdem',
      'augmented-seven',
    ]);
  });

  it('증강 여부와 변형이 올바르다', () => {
    expect(getGameMode('normal-holdem')).toMatchObject({ variant: 'holdem', augmented: false });
    expect(getGameMode('augmented-seven')).toMatchObject({ variant: 'seven', augmented: true });
  });

  it('잘못된 모드 ID를 거른다', () => {
    expect(isGameModeId('normal-holdem')).toBe(true);
    expect(isGameModeId('omaha')).toBe(false);
    expect(isGameModeId(3)).toBe(false);
  });
});

describe('createDefaultRoomConfig', () => {
  it('파티 매치 기본값을 쓴다', () => {
    const c = createDefaultRoomConfig('normal-holdem', '철수');
    expect(c).toMatchObject({
      maxPlayers: 6,
      visibility: 'public',
      password: '',
      startingChips: 1000,
      matchHands: 8,
      minBuyIn: 1000,
      smallBlind: 10,
      bigBlind: 20,
      ante: 10,
      maxBetMultiple: 0,
      actionSeconds: 15,
      augmentPickSeconds: 12,
    });
    expect(validateRoomConfig(c)).toEqual([]);
  });

  it('시작 칩과 최대 베팅 금액을 계산한다', () => {
    expect(buyInRange(1000)).toEqual({ min: 1000, max: 1000 });
    const c = createDefaultRoomConfig('normal-holdem', '철수');
    expect(maxBetAmount(c)).toBeNull();
    expect(maxBetAmount({ ...c, maxBetMultiple: 50 })).toBe(1000);
    const seven = createDefaultRoomConfig('normal-seven', '철수');
    expect(maxBetAmount({ ...seven, ante: 25, maxBetMultiple: 100 })).toBe(2500);
  });

  it('모든 모드의 기본값이 유효하다', () => {
    for (const m of GAME_MODES) expect(validateRoomConfig(createDefaultRoomConfig(m.id, 'p'))).toEqual([]);
  });

  it('긴 닉네임이어도 제목 길이 제한을 지킨다', () => {
    expect(defaultRoomTitle('가'.repeat(40)).length).toBe(ROOM_LIMITS.titleMax);
    expect(defaultRoomTitle('  ')).toBe('플레이어의 테이블');
  });
});

describe('validateRoomConfig', () => {
  const base = () => createDefaultRoomConfig('normal-holdem', '철수');

  it('제목 길이와 공백을 검사한다', () => {
    expect(fields({ ...base(), title: ' a ' })).toContain('title');
    expect(fields({ ...base(), title: 'a'.repeat(25) })).toContain('title');
    expect(fields({ ...base(), title: '  좋은 방  ' })).not.toContain('title');
    expect(fields({ ...base(), title: '탭\t포함' })).toContain('title');
  });

  it('인원은 2~6명 정수만 허용한다', () => {
    expect(fields({ ...base(), maxPlayers: 1 })).toContain('maxPlayers');
    expect(fields({ ...base(), maxPlayers: 7 })).toContain('maxPlayers');
    expect(fields({ ...base(), maxPlayers: 2.5 })).toContain('maxPlayers');
    expect(fields({ ...base(), maxPlayers: 2 })).not.toContain('maxPlayers');
  });

  it('비밀번호는 비어 있거나 4~16자 공백 없이', () => {
    expect(fields({ ...base(), password: '' })).not.toContain('password');
    expect(fields({ ...base(), password: '123' })).toContain('password');
    expect(fields({ ...base(), password: '12 34' })).toContain('password');
    expect(fields({ ...base(), password: '1234' })).not.toContain('password');
    expect(fields({ ...base(), password: 'x'.repeat(17) })).toContain('password');
  });

  it('홀덤은 시작 블라인드 쌍을 검사한다', () => {
    expect(fields({ ...base(), smallBlind: 10, bigBlind: 30 })).toContain('bigBlind');
    expect(fields({ ...base(), smallBlind: 10, bigBlind: 20 })).not.toContain('bigBlind');
  });

  it('7포커는 앤티를 검사한다', () => {
    const seven = createDefaultRoomConfig('normal-seven', '철수');
    expect(fields({ ...seven, smallBlind: 1, bigBlind: 3 })).toEqual([]);
    expect(fields({ ...seven, ante: 7 })).toContain('ante');
  });

  it('선택지에 없는 값을 거부한다', () => {
    expect(fields({ ...base(), startingChips: 1234 })).toContain('startingChips');
    expect(fields({ ...base(), matchHands: 7 as RoomConfig['matchHands'] })).toContain('matchHands');
    expect(fields({ ...base(), maxBetMultiple: 7 })).toContain('maxBetMultiple');
    expect(fields({ ...base(), actionSeconds: 5 })).toContain('actionSeconds');
    expect(fields({ ...base(), augmentPickSeconds: 60 })).toContain('augmentPickSeconds');
  });

  it('normalizeRoomConfig는 제목 공백을 없애고 startingChips를 동기화한다', () => {
    const n = normalizeRoomConfig({ ...base(), title: '  방  ', startingChips: 1500, minBuyIn: 0 });
    expect(n.title).toBe('방');
    expect(n.minBuyIn).toBe(1500);
  });
});

describe('roomCode', () => {
  it('입력을 정규화한다', () => {
    expect(normalizeRoomCode(' k7p-2qx ')).toBe('K7P2QX');
  });

  it('형식을 검사한다', () => {
    expect(isValidRoomCode('K7P2QX')).toBe(true);
    expect(isValidRoomCode('K7P2Q')).toBe(false);
    expect(isValidRoomCode('K7P2Q0')).toBe(false);
    expect(isValidRoomCode('K7P2QI')).toBe(false);
  });

  it('생성된 코드는 항상 유효하다', () => {
    let seed = 7;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let i = 0; i < 200; i++) expect(isValidRoomCode(generateRoomCode(rand))).toBe(true);
    expect(generateRoomCode(() => 0)).toBe(ROOM_CODE_ALPHABET[0].repeat(6));
  });
});
