import { getGameMode, isGameModeId, type GameModeId } from './gameModes';

export type RoomVisibility = 'public' | 'private';

export interface RoomConfig {
  title: string;
  mode: GameModeId;
  maxPlayers: number;
  visibility: RoomVisibility;
  /** 빈 문자열이면 비밀번호 없음 */
  password: string;
  /** 입장할 때 테이블로 가져와야 하는 최소 게임머니 */
  minBuyIn: number;
  /** 기본 베팅 단위(홀덤). 최소 베팅은 빅 블라인드 */
  smallBlind: number;
  bigBlind: number;
  /** 기본 베팅 단위(7포커) */
  ante: number;
  /** 한 번에 걸 수 있는 최대 금액 = 빅 블라인드(또는 앤티) × 배수. 0이면 제한 없음(노리밋) */
  maxBetMultiple: number;
  actionSeconds: number;
  augmentPickSeconds: number;
}

export const ROOM_LIMITS = {
  minPlayers: 2,
  maxPlayers: 6,
  titleMin: 2,
  titleMax: 24,
  passwordMin: 4,
  passwordMax: 16,
} as const;

export const ROOM_OPTIONS = {
  minBuyIns: [2_000, 5_000, 10_000, 20_000, 50_000],
  blinds: [
    [5, 10],
    [10, 20],
    [25, 50],
    [50, 100],
    [100, 200],
    [250, 500],
  ] as ReadonlyArray<readonly [number, number]>,
  antes: [5, 10, 25, 50, 100, 250],
  maxBetMultiples: [0, 50, 100],
  actionSeconds: [10, 15, 20, 30, 45],
  augmentPickSeconds: [10, 15, 20],
} as const;

/** 칩이 너무 빨리 바닥나지 않도록 최소 입장 게임머니는 빅 블라인드(또는 앤티)의 최소 이 배수여야 한다. */
export const MIN_BUYIN_TO_FORCED_BET_RATIO = 20;
/** 한 번에 테이블로 가져올 수 있는 최대 금액 = 최소 입장 게임머니 × 이 배수 */
export const MAX_BUYIN_MULTIPLE = 10;

export function buyInRange(minBuyIn: number): { min: number; max: number } {
  return { min: minBuyIn, max: minBuyIn * MAX_BUYIN_MULTIPLE };
}

/** 이 방의 기본 베팅 단위 (홀덤은 빅 블라인드, 7포커는 앤티) */
export function forcedBetUnit(config: Pick<RoomConfig, 'mode' | 'bigBlind' | 'ante'>): number {
  return getGameMode(config.mode).variant === 'holdem' ? config.bigBlind : config.ante;
}

/** 한 번에 걸 수 있는 최대 금액. 제한이 없으면 null */
export function maxBetAmount(config: Pick<RoomConfig, 'mode' | 'bigBlind' | 'ante' | 'maxBetMultiple'>): number | null {
  return config.maxBetMultiple > 0 ? forcedBetUnit(config) * config.maxBetMultiple : null;
}

export function maxBetLabel(multiple: number): string {
  return multiple > 0 ? `${multiple}배` : '제한 없음';
}

export function defaultRoomTitle(hostName: string): string {
  const name = hostName.trim() || '플레이어';
  const title = `${name}의 테이블`;
  return title.length > ROOM_LIMITS.titleMax ? title.slice(0, ROOM_LIMITS.titleMax) : title;
}

export function createDefaultRoomConfig(mode: GameModeId, hostName: string): RoomConfig {
  return {
    title: defaultRoomTitle(hostName),
    mode,
    maxPlayers: 6,
    visibility: 'public',
    password: '',
    minBuyIn: 2_000,
    smallBlind: 10,
    bigBlind: 20,
    ante: 10,
    maxBetMultiple: 0,
    actionSeconds: 20,
    augmentPickSeconds: 15,
  };
}

export type RoomConfigField = keyof RoomConfig;

export interface RoomConfigError {
  field: RoomConfigField;
  message: string;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function validateRoomConfig(config: RoomConfig): RoomConfigError[] {
  const errors: RoomConfigError[] = [];
  const add = (field: RoomConfigField, message: string) => errors.push({ field, message });
  const includes = (list: readonly number[], value: number) => list.includes(value);

  const title = config.title.trim();
  if (title.length < ROOM_LIMITS.titleMin || title.length > ROOM_LIMITS.titleMax) {
    add('title', `방 제목은 ${ROOM_LIMITS.titleMin}~${ROOM_LIMITS.titleMax}자로 입력해 주세요.`);
  } else if (CONTROL_CHARS.test(title)) {
    add('title', '방 제목에 사용할 수 없는 문자가 있습니다.');
  }

  if (!isGameModeId(config.mode)) add('mode', '게임 모드를 선택해 주세요.');

  if (
    !Number.isInteger(config.maxPlayers) ||
    config.maxPlayers < ROOM_LIMITS.minPlayers ||
    config.maxPlayers > ROOM_LIMITS.maxPlayers
  ) {
    add('maxPlayers', `최대 인원은 ${ROOM_LIMITS.minPlayers}~${ROOM_LIMITS.maxPlayers}명입니다.`);
  }

  if (config.visibility !== 'public' && config.visibility !== 'private') {
    add('visibility', '공개 설정을 선택해 주세요.');
  }

  if (config.password !== '') {
    if (config.password.length < ROOM_LIMITS.passwordMin || config.password.length > ROOM_LIMITS.passwordMax) {
      add('password', `비밀번호는 ${ROOM_LIMITS.passwordMin}~${ROOM_LIMITS.passwordMax}자로 입력해 주세요.`);
    } else if (/\s/.test(config.password) || CONTROL_CHARS.test(config.password)) {
      add('password', '비밀번호에는 공백을 사용할 수 없습니다.');
    }
  }

  if (!includes(ROOM_OPTIONS.minBuyIns, config.minBuyIn)) {
    add('minBuyIn', '최소 입장 게임머니를 선택해 주세요.');
  }

  const variant = isGameModeId(config.mode) ? getGameMode(config.mode).variant : null;
  if (variant === 'holdem') {
    const validBlinds = ROOM_OPTIONS.blinds.some(([sb, bb]) => sb === config.smallBlind && bb === config.bigBlind);
    if (!validBlinds) add('bigBlind', '블라인드를 선택해 주세요.');
    else if (config.bigBlind * MIN_BUYIN_TO_FORCED_BET_RATIO > config.minBuyIn) {
      add('bigBlind', `최소 입장 게임머니는 빅 블라인드의 ${MIN_BUYIN_TO_FORCED_BET_RATIO}배 이상이어야 합니다.`);
    }
  } else if (variant === 'seven') {
    if (!includes(ROOM_OPTIONS.antes, config.ante)) add('ante', '앤티를 선택해 주세요.');
    else if (config.ante * MIN_BUYIN_TO_FORCED_BET_RATIO > config.minBuyIn) {
      add('ante', `최소 입장 게임머니는 앤티의 ${MIN_BUYIN_TO_FORCED_BET_RATIO}배 이상이어야 합니다.`);
    }
  }

  if (!includes(ROOM_OPTIONS.maxBetMultiples, config.maxBetMultiple)) {
    add('maxBetMultiple', '최대 베팅을 선택해 주세요.');
  }
  if (!includes(ROOM_OPTIONS.actionSeconds, config.actionSeconds)) {
    add('actionSeconds', '행동 제한시간을 선택해 주세요.');
  }
  if (!includes(ROOM_OPTIONS.augmentPickSeconds, config.augmentPickSeconds)) {
    add('augmentPickSeconds', '증강 선택시간을 선택해 주세요.');
  }

  return errors;
}

/** 저장/전송 직전 정리: 제목 앞뒤 공백 제거 */
export function normalizeRoomConfig(config: RoomConfig): RoomConfig {
  return { ...config, title: config.title.trim() };
}
