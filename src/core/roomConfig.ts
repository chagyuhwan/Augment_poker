import { getGameMode, isGameModeId, type GameModeId } from './gameModes';
import {
  DEFAULT_ACTION_SECONDS,
  DEFAULT_AUGMENT_PICK_SECONDS,
  DEFAULT_MATCH_BB,
  DEFAULT_MATCH_HANDS,
  DEFAULT_MATCH_SB,
  DEFAULT_STARTING_CHIPS,
  MATCH_HAND_OPTIONS,
  type MatchHandCount,
} from './matchRules';

export type RoomVisibility = 'public' | 'private';

export interface RoomConfig {
  title: string;
  mode: GameModeId;
  maxPlayers: number;
  visibility: RoomVisibility;
  /** 빈 문자열이면 비밀번호 없음 */
  password: string;
  /** 매치 시작 칩(모든 플레이어 동일). 계정 지갑과 무관 */
  startingChips: number;
  /** 경기 핸드 수 */
  matchHands: MatchHandCount;
  /** 기본 블라인드(홀덤). 경기 중 스케줄로 증가 */
  smallBlind: number;
  bigBlind: number;
  /** 기본 앤티(7포커) */
  ante: number;
  /** 한 번에 걸 수 있는 최대 = 빅블라인드×배수. 0=노리밋 */
  maxBetMultiple: number;
  actionSeconds: number;
  augmentPickSeconds: number;
  /**
   * @deprecated 매치 전용 칩으로 대체. startingChips와 동기화 유지(구 세이브/테스트 호환)
   */
  minBuyIn: number;
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
  startingChips: [500, 1_000, 1_500, 2_000, 3_000],
  matchHands: MATCH_HAND_OPTIONS,
  blinds: [
    [5, 10],
    [10, 20],
    [25, 50],
    [50, 100],
  ] as ReadonlyArray<readonly [number, number]>,
  antes: [5, 10, 25, 50, 100],
  maxBetMultiples: [0, 50, 100],
  actionSeconds: [10, 15, 20, 30],
  augmentPickSeconds: [10, 12, 15, 20],
  /** @deprecated */
  minBuyIns: [500, 1_000, 1_500, 2_000, 3_000],
} as const;

export function forcedBetUnit(config: Pick<RoomConfig, 'mode' | 'bigBlind' | 'ante'>): number {
  return getGameMode(config.mode).variant === 'holdem' ? config.bigBlind : config.ante;
}

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
    startingChips: DEFAULT_STARTING_CHIPS,
    matchHands: DEFAULT_MATCH_HANDS,
    minBuyIn: DEFAULT_STARTING_CHIPS,
    smallBlind: DEFAULT_MATCH_SB,
    bigBlind: DEFAULT_MATCH_BB,
    ante: 10,
    maxBetMultiple: 0,
    actionSeconds: DEFAULT_ACTION_SECONDS,
    augmentPickSeconds: DEFAULT_AUGMENT_PICK_SECONDS,
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

  if (!includes(ROOM_OPTIONS.startingChips, config.startingChips)) {
    add('startingChips', '시작 칩을 선택해 주세요.');
  }
  if (!MATCH_HAND_OPTIONS.includes(config.matchHands as MatchHandCount)) {
    add('matchHands', '경기 길이를 선택해 주세요.');
  }

  const variant = isGameModeId(config.mode) ? getGameMode(config.mode).variant : null;
  if (variant === 'holdem') {
    const validBlinds = ROOM_OPTIONS.blinds.some(([sb, bb]) => sb === config.smallBlind && bb === config.bigBlind);
    if (!validBlinds) add('bigBlind', '시작 블라인드를 선택해 주세요.');
  } else if (variant === 'seven') {
    if (!includes(ROOM_OPTIONS.antes, config.ante)) add('ante', '앤티를 선택해 주세요.');
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

/** 저장/전송 직전 정리 */
export function normalizeRoomConfig(config: RoomConfig): RoomConfig {
  const startingChips = config.startingChips || config.minBuyIn || DEFAULT_STARTING_CHIPS;
  return {
    ...config,
    title: config.title.trim(),
    startingChips,
    minBuyIn: startingChips,
    matchHands: (MATCH_HAND_OPTIONS.includes(config.matchHands as MatchHandCount)
      ? config.matchHands
      : DEFAULT_MATCH_HANDS) as MatchHandCount,
  };
}

/** @deprecated buyInRange — 매치 칩은 전원 동일 */
export function buyInRange(startingChips: number): { min: number; max: number } {
  return { min: startingChips, max: startingChips };
}
