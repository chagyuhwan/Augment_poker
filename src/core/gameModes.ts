export type GameModeId = 'normal-holdem' | 'normal-seven' | 'augmented-holdem' | 'augmented-seven';

export type PokerVariant = 'holdem' | 'seven';

export interface GameModeInfo {
  id: GameModeId;
  variant: PokerVariant;
  augmented: boolean;
  name: string;
  shortName: string;
  englishName: string;
  description: string;
}

export const GAME_MODES: readonly GameModeInfo[] = [
  {
    id: 'normal-holdem',
    variant: 'holdem',
    augmented: false,
    name: '일반 텍사스 홀덤',
    shortName: '일반 홀덤',
    englishName: "Texas Hold'em",
    description: '개인 카드 2장과 공용 카드 5장으로 최고의 5장을 만드는 정통 노리밋 홀덤.',
  },
  {
    id: 'normal-seven',
    variant: 'seven',
    augmented: false,
    name: '일반 7포커',
    shortName: '일반 7포커',
    englishName: 'Seven Card Poker',
    description: '3장으로 시작해 공개 카드를 쌓아 가는 한국식 세븐포커. 상대의 공개 패를 읽는 심리전.',
  },
  {
    id: 'augmented-holdem',
    variant: 'holdem',
    augmented: true,
    name: '증강 텍사스 홀덤',
    shortName: '증강 홀덤',
    englishName: "Augmented Hold'em",
    description: '베팅 구간마다 증강 3개 중 하나를 골라 능력을 쌓는 홀덤. 정보와 조작이 승부를 가른다.',
  },
  {
    id: 'augmented-seven',
    variant: 'seven',
    augmented: true,
    name: '증강 7포커',
    shortName: '증강 7포커',
    englishName: 'Augmented Seven',
    description: '한국식 7포커에 증강 드래프트를 더한 모드. 공개 카드와 능력이 얽히는 깊은 수 싸움.',
  },
];

const MODE_BY_ID = new Map(GAME_MODES.map((m) => [m.id, m]));

export function isGameModeId(value: unknown): value is GameModeId {
  return typeof value === 'string' && MODE_BY_ID.has(value as GameModeId);
}

export function getGameMode(id: GameModeId): GameModeInfo {
  const mode = MODE_BY_ID.get(id);
  if (!mode) throw new Error(`Unknown game mode: ${id}`);
  return mode;
}
