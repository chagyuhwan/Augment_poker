export type Suit = 's' | 'h' | 'd' | 'c';

export interface Card {
  rank: number; // 2..14 (14 = A)
  suit: Suit;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type Phase = 'augment' | 'betting' | 'handOver' | 'gameOver';

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

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  chips: number;
  hole: Card[];
  bet: number; // 이번 스트리트에 건 칩
  totalBet: number; // 이번 핸드 전체에 건 칩
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  out: boolean; // 칩이 없어 탈락
  augment: AugmentId | null;
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
}

export interface GameState {
  players: Player[];
  deck: Card[];
  community: Card[];
  dealer: number;
  street: Street;
  phase: Phase;
  currentPlayer: number;
  currentBet: number;
  minRaise: number;
  raisesThisStreet: number;
  lastAggressor: number | null;
  sb: number;
  bb: number;
  handNumber: number;
  log: string[];
  augmentOffer: AugmentId[];
  offerTier: AugmentTier;
  rerolls: number;
  revealed: Record<number, number>; // 투시: 플레이어 id -> 공개된 카드 인덱스
  mulliganUsed: boolean;
  fateUsed: boolean;
  result: HandResult | null;
}
