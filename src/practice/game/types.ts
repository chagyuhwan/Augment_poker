export type Suit = 's' | 'h' | 'd' | 'c';

export interface Card {
  rank: number; // 2..14 (14 = A)
  suit: Suit;
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

export type AugmentId =
  | 'interest'
  | 'luckyCoin'
  | 'retreat'
  | 'intimidate'
  | 'mulligan'
  | 'clairvoyance'
  | 'foresight'
  | 'insurance'
  | 'suitBender'
  | 'shortcut'
  | 'tax'
  | 'thirdHand'
  | 'fateTwist'
  | 'jackpot'
  | 'rainbow';

export interface OwnedAugment {
  id: AugmentId;
  /** 획득한 핸드 번호. 카드를 나눠 줄 때 적용되는 효과는 다음 판부터 */
  acquiredHand: number;
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
  bet: number; // 이번 스트리트에 건 칩
  totalBet: number; // 이번 핸드 전체에 건 칩
  /** 이번 핸드에 카드를 받았는지 */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  status: PlayerStatus;
  connected: boolean;
  disconnectedAt: number | null;
  augments: OwnedAugment[];
  lastAction: string | null;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }; // amount = 레이즈 후 이번 스트리트 총 베팅액

export interface HandResult {
  showdown: boolean;
  lines: string[];
  winnerIds: number[];
  pot: number;
  /** 플레이어별 이번 판 순이익 (+ 획득 / - 손실) */
  net: Record<number, number>;
}

export interface AugmentPickEntry {
  offer: AugmentId[];
  rerolls: number;
  done: boolean;
}

export interface AugmentRound {
  round: 1 | 2;
  tier: AugmentTier;
  deadline: number;
  entries: Record<number, AugmentPickEntry>;
}

export type TableEvent =
  | { seq: number; type: 'handStarted'; handNo: number }
  | { seq: number; type: 'handSettled'; handNo: number; pot: number; lines: string[] }
  | { seq: number; type: 'busted'; playerId: number; handNo: number }
  | { seq: number; type: 'joined'; playerId: number }
  | { seq: number; type: 'left'; playerId: number; chips: number; reason: 'leave' | 'disconnect' };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type TableEventInput = DistributiveOmit<TableEvent, 'seq'>;

export interface GameState {
  tableId: string;
  mode: TableMode;
  /** 이 화면을 보는 플레이어 */
  heroId: number;
  maxSeats: number;
  nextPlayerId: number;
  players: Player[];
  deck: Card[];
  community: Card[];
  dealerSeat: number;
  street: Street;
  phase: Phase;
  /** 차례인 플레이어 id, 없으면 -1 */
  currentPlayer: number;
  currentBet: number;
  minRaise: number;
  raisesThisStreet: number;
  lastAggressor: number | null;
  sb: number;
  bb: number;
  /** 한 번에 올릴 수 있는 최대 금액. null이면 노리밋 */
  maxBet: number | null;
  handNumber: number;
  /** 상태가 바뀔 때마다 증가. 액션 요청에 실어 보내 중복/지연 요청을 거른다 */
  actionSeq: number;
  log: string[];
  augmentRound: AugmentRound | null;
  /** 이번 핸드에 끝난 증강 선택 횟수 (0~2) */
  augmentRoundsDone: number;
  /** 모두 올인해 남은 카드를 자동으로 까는 중 */
  runout: boolean;
  revealed: Record<number, number>; // 투시: 플레이어 id -> 공개된 카드 인덱스
  result: HandResult | null;
  events: TableEvent[];
  eventSeq: number;
  /** 증강 보너스/환급으로 새로 생긴 칩 누계 (칩 보존 검사용) */
  minted: number;
}
