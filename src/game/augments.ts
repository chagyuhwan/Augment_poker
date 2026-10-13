import type { AugmentId, AugmentTier } from './types';
import type { EvalOptions } from './evaluator';

export interface Augment {
  id: AugmentId;
  name: string;
  icon: string;
  tier: AugmentTier;
  description: string;
  /** 봇이 받을 수 있는 증강인지 (능동 사용형/플레이어 전용 효과는 제외) */
  botUsable: boolean;
}

export const AUGMENTS: Record<AugmentId, Augment> = {
  interest: {
    id: 'interest',
    name: '이자 수익',
    icon: '💰',
    tier: 'silver',
    description: '이번 핸드에서 승리하면 순이익의 30%를 보너스로 받습니다.',
    botUsable: true,
  },
  luckyCoin: {
    id: 'luckyCoin',
    name: '행운의 동전',
    icon: '🪙',
    tier: 'silver',
    description: '쇼다운에서 무승부가 나면 팟을 독식합니다.',
    botUsable: true,
  },
  retreat: {
    id: 'retreat',
    name: '전략적 후퇴',
    icon: '🏳️',
    tier: 'silver',
    description: '폴드하면 이번 핸드에 건 칩의 50%를 돌려받습니다.',
    botUsable: true,
  },
  intimidate: {
    id: 'intimidate',
    name: '위압',
    icon: '😠',
    tier: 'silver',
    description: '당신이 베팅/레이즈하면 상대가 훨씬 쉽게 폴드합니다.',
    botUsable: false,
  },
  mulligan: {
    id: 'mulligan',
    name: '멀리건',
    icon: '🔄',
    tier: 'silver',
    description: '리버 전까지 한 번, 내 핸드 카드 한 장을 덱의 카드로 교체합니다.',
    botUsable: false,
  },
  clairvoyance: {
    id: 'clairvoyance',
    name: '투시',
    icon: '👁️',
    tier: 'gold',
    description: '모든 상대의 핸드 카드 한 장씩을 엿봅니다.',
    botUsable: false,
  },
  foresight: {
    id: 'foresight',
    name: '예지',
    icon: '🔮',
    tier: 'gold',
    description: '다음에 공개될 커뮤니티 카드를 미리 봅니다.',
    botUsable: false,
  },
  insurance: {
    id: 'insurance',
    name: '보험',
    icon: '🛡️',
    tier: 'gold',
    description: '쇼다운에서 패배하면 이번 핸드에 건 칩의 50%를 돌려받습니다.',
    botUsable: true,
  },
  suitBender: {
    id: 'suitBender',
    name: '색채 조작',
    icon: '🎨',
    tier: 'gold',
    description: '같은 무늬 4장만으로도 플러시가 인정됩니다.',
    botUsable: true,
  },
  shortcut: {
    id: 'shortcut',
    name: '지름길',
    icon: '🛤️',
    tier: 'gold',
    description: '연속된 4장만으로도 스트레이트가 인정됩니다.',
    botUsable: true,
  },
  tax: {
    id: 'tax',
    name: '징수',
    icon: '🏦',
    tier: 'gold',
    description: '핸드 시작 시 모든 상대에게서 빅 블라인드만큼 칩을 걷어옵니다.',
    botUsable: true,
  },
  thirdHand: {
    id: 'thirdHand',
    name: '세 번째 손',
    icon: '🖐️',
    tier: 'prismatic',
    description: '핸드 카드를 3장 받습니다. 8장 중 최고의 5장으로 족보를 만듭니다.',
    botUsable: true,
  },
  fateTwist: {
    id: 'fateTwist',
    name: '운명 조작',
    icon: '🌀',
    tier: 'prismatic',
    description: '다음 커뮤니티 카드를 미리 보고, 한 번 그 카드를 버리게 할 수 있습니다.',
    botUsable: false,
  },
  jackpot: {
    id: 'jackpot',
    name: '잭팟',
    icon: '🎰',
    tier: 'prismatic',
    description: '이번 핸드에서 승리하면 순이익을 2배로 받습니다.',
    botUsable: true,
  },
  rainbow: {
    id: 'rainbow',
    name: '무지개 손',
    icon: '🌈',
    tier: 'prismatic',
    description: '4장 플러시와 4장 스트레이트가 모두 인정됩니다.',
    botUsable: true,
  },
};

export const TIER_LABEL: Record<AugmentTier, string> = {
  silver: '실버',
  gold: '골드',
  prismatic: '프리즘',
};

const TIER_WEIGHTS: [AugmentTier, number][] = [
  ['silver', 0.5],
  ['gold', 0.35],
  ['prismatic', 0.15],
];

export function rollTier(): AugmentTier {
  let r = Math.random();
  for (const [tier, w] of TIER_WEIGHTS) {
    if (r < w) return tier;
    r -= w;
  }
  return 'silver';
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length) {
    out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  }
  return out;
}

export function rollOffer(tier: AugmentTier, count = 3): AugmentId[] {
  const pool = Object.values(AUGMENTS).filter((a) => a.tier === tier);
  return pickRandom(pool, count).map((a) => a.id);
}

export function rollBotAugment(): AugmentId {
  const tier = rollTier();
  const pool = Object.values(AUGMENTS).filter((a) => a.tier === tier && a.botUsable);
  return pickRandom(pool, 1)[0].id;
}

export function evalOptionsFor(augment: AugmentId | null): EvalOptions {
  switch (augment) {
    case 'suitBender':
      return { flushLen: 4 };
    case 'shortcut':
      return { straightLen: 4 };
    case 'rainbow':
      return { flushLen: 4, straightLen: 4 };
    default:
      return {};
  }
}
