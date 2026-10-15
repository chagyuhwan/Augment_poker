export type Suit = 's' | 'h' | 'd' | 'c';

/**
 * 카드 인스턴스. id는 고유하고, rank·suit는 증강으로 중복될 수 있다.
 * 기본 덱에서 나온 카드는 isGenerated=false, 증강 복제/생성은 true.
 */
export interface Card {
  id: number;
  rank: number; // 2..14 (14 = A)
  suit: Suit;
  isGenerated?: boolean;
  isModified?: boolean;
  originalId?: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** waiting: 2명 미만이라 대기 · betting: 베팅 · augment: 증강 선택(베팅/딜링 정지) · handOver: 정산 결과 표시 */
export type Phase = 'waiting' | 'betting' | 'augment' | 'handOver';

export type TableMode = 'normal' | 'augmented';

/**
 * active: 착석(다음 판 참가 대상) · waiting: 판 진행 중에 들어와 다음 판부터 참가
 * leaving: 퇴장 요청, 판이 끝나면 제거 · busted: 정산 후 게임머니 0, 다음 판 전에 제거
 */
export type PlayerStatus = 'active' | 'waiting' | 'leaving' | 'busted';

export type AugmentTier = 'silver' | 'gold' | 'prismatic';

/** 신규 증강 20종 */
export type AugmentId =
  | 'aceStamp'
  | 'clone'
  | 'suitUnify'
  | 'rankNudge'
  | 'fateSwap'
  | 'handFlip'
  | 'boardFlip'
  | 'redeal'
  | 'mindRead'
  | 'foresight'
  | 'forceReveal'
  | 'auraPeek'
  | 'raiseSeal'
  | 'actLast'
  | 'raiseCap'
  | 'pressure'
  | 'augShield'
  | 'augSeal'
  | 'copyPower'
  | 'rerollFate';

export interface OwnedAugment {
  id: AugmentId;
  /** 일회용·1회 발동형 사용 여부 */
  used: boolean;
  /** 능력 복제로 얻은 복사본이면 true */
  isCopy?: boolean;
}

export interface Player {
  /** 테이블 안에서 바뀌지 않는 플레이어 번호 */
  id: number;
  /** 0~5 좌석 번호. players 배열은 항상 좌석 순으로 정렬한다 */
  seat: number;
  name: string;
  isHuman: boolean;
  /** 팟에 넣지 않은 테이블 칩 */
  chips: number;
  hole: Card[];
  bet: number;
  totalBet: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  status: PlayerStatus;
  connected: boolean;
  disconnectedAt: number | null;
  /** 이번 핸드에서만 유지. 판이 끝나면 비운다 */
  augments: OwnedAugment[];
  lastAction: string | null;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number };

export interface HandResult {
  showdown: boolean;
  lines: string[];
  winnerIds: number[];
  pot: number;
  net: Record<number, number>;
}

export interface AugmentPickEntry {
  offer: AugmentId[];
  /** 이번 선택에서 운명 재추첨을 이미 썼는지 */
  rerolled: boolean;
  done: boolean;
}

export interface AugmentRound {
  round: 1 | 2;
  tier: AugmentTier;
  deadline: number;
  entries: Record<number, AugmentPickEntry>;
}

/** 이번 핸드에만 살아있는 증강 부작용 */
export interface HandEffects {
  /** 다음(또는 지정) 스트리트에서 레이즈 금지인 플레이어 */
  raiseBannedUntil: Record<number, Street | 'done'>;
  /** 레이즈 1회 제한이 걸린 스트리트 */
  raiseCapStreet: Street | null;
  /** 해당 스트리트에서 이미 쓴 레이즈 횟수(전체) */
  raisesUnderCap: number;
  /** 다음 베팅 구간에서 마지막으로 행동할 플레이어 */
  actLastId: number | null;
  actLastStreet: Street | null;
  /** 심리 압박: 레이즈 시 지정한 상대가 콜하면 카드 공개 */
  pressure: { ownerId: number; targetId: number; armed: boolean; fired: boolean } | null;
  /** 봉인된 증강: 대상 → 증강 id, until 스트리트 종료 후 해제 */
  sealed: { targetId: number; augmentId: AugmentId; untilStreet: Street }[];
  /** 본인에게만 보이는 엿본 카드 (로컬 hero 기준 표시) */
  privatePeeks: { viewerId: number; targetId: number; cardId: number; rank: number; suit: Suit }[];
  /** 다음 카드 예지 (viewer → 카드 스냅샷) */
  foresight: Record<number, { rank: number; suit: Suit }>;
  /** 패의 기운 결과 문구 */
  auraHints: Record<number, string>;
  /** 강제 공개: 전원이 해당 플레이어 홀카드를 봄 */
  forceRevealed: number[];
  /** 증강 방패 남은 횟수(보유 중이면 1, 사용 후 0) — OwnedAugment.used로도 추적 */
  shieldUsed: Record<number, boolean>;
}

export type TableEvent =
  | { seq: number; type: 'handStarted'; handNo: number }
  | { seq: number; type: 'handSettled'; handNo: number; pot: number; lines: string[] }
  | { seq: number; type: 'busted'; playerId: number; handNo: number }
  | { seq: number; type: 'joined'; playerId: number }
  | { seq: number; type: 'left'; playerId: number; chips: number; reason: 'leave' | 'disconnect' }
  | { seq: number; type: 'augmentUsed'; playerId: number; augmentId: AugmentId; blocked?: boolean }
  | { seq: number; type: 'augmentPicked'; playerId: number; augmentId: AugmentId };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type TableEventInput = DistributiveOmit<TableEvent, 'seq'>;

export interface GameState {
  tableId: string;
  mode: TableMode;
  heroId: number;
  maxSeats: number;
  nextPlayerId: number;
  /** 다음 카드 인스턴스 id */
  nextCardId: number;
  players: Player[];
  deck: Card[];
  community: Card[];
  dealerSeat: number;
  street: Street;
  phase: Phase;
  currentPlayer: number;
  currentBet: number;
  minRaise: number;
  raisesThisStreet: number;
  lastAggressor: number | null;
  sb: number;
  bb: number;
  maxBet: number | null;
  handNumber: number;
  actionSeq: number;
  log: string[];
  augmentRound: AugmentRound | null;
  augmentRoundsDone: number;
  runout: boolean;
  /** 투시·강제공개 등으로 공개된 홀카드(플레이어 id → 카드 인덱스 목록). 빈 배열이면 전체 */
  revealed: Record<number, number[]>;
  effects: HandEffects;
  result: HandResult | null;
  events: TableEvent[];
  eventSeq: number;
  /** 레거시 칩 보존 검사용(신규 증강은 칩을 민팅하지 않음) */
  minted: number;
}
