import type { AugmentId, AugmentTier } from './types';
import type { EvalOptions } from './evaluator';

/** persistent: 테이블에서 나가기 전까지 유지 · oneShot: 발동하면 슬롯에서 사라짐 */
export type AugmentKind = 'persistent' | 'oneShot';

export interface Augment {
  id: AugmentId;
  name: string;
  icon: string;
  tier: AugmentTier;
  kind: AugmentKind;
  description: string;
  /** 봇이 받을 수 있는 증강인지 (능동 사용형/플레이어 전용 효과는 제외) */
  botUsable: boolean;
}

export const MAX_AUGMENT_SLOTS = 3;

export const AUGMENTS: Record<AugmentId, Augment> = {
  interest: {
    id: 'interest',
    name: '이자 수익',
    icon: '💰',
    tier: 'silver',
    kind: 'persistent',
    description: '판에서 승리하면 순이익의 30%를 보너스로 받습니다.',
    botUsable: true,
  },
  luckyCoin: {
    id: 'luckyCoin',
    name: '행운의 동전',
    icon: '🪙',
    tier: 'silver',
    kind: 'persistent',
    description: '쇼다운에서 무승부가 나면 팟을 독식합니다.',
    botUsable: true,
  },
  retreat: {
    id: 'retreat',
    name: '전략적 후퇴',
    icon: '🏳️',
    tier: 'silver',
    kind: 'persistent',
    description: '폴드하면 그 판에 건 칩의 50%를 돌려받습니다.',
    botUsable: true,
  },
  intimidate: {
    id: 'intimidate',
    name: '위압',
    icon: '😠',
    tier: 'silver',
    kind: 'persistent',
    description: '당신이 베팅/레이즈하면 상대가 훨씬 쉽게 폴드합니다.',
    botUsable: false,
  },
  mulligan: {
    id: 'mulligan',
    name: '멀리건',
    icon: '🔄',
    tier: 'silver',
    kind: 'oneShot',
    description: '리버 전에 내 핸드 카드 한 장을 덱의 카드로 교체합니다. 사용하면 사라집니다.',
    botUsable: false,
  },
  clairvoyance: {
    id: 'clairvoyance',
    name: '투시',
    icon: '👁️',
    tier: 'gold',
    kind: 'oneShot',
    description: '다음 판에 카드를 받을 때 모든 상대의 핸드 카드 한 장씩을 엿봅니다. 발동하면 사라집니다.',
    botUsable: false,
  },
  foresight: {
    id: 'foresight',
    name: '예지',
    icon: '🔮',
    tier: 'gold',
    kind: 'persistent',
    description: '다음에 공개될 커뮤니티 카드를 미리 봅니다.',
    botUsable: false,
  },
  insurance: {
    id: 'insurance',
    name: '보험',
    icon: '🛡️',
    tier: 'gold',
    kind: 'persistent',
    description: '쇼다운에서 패배하면 그 판에 건 칩의 50%를 돌려받습니다.',
    botUsable: true,
  },
  suitBender: {
    id: 'suitBender',
    name: '색채 조작',
    icon: '🎨',
    tier: 'gold',
    kind: 'persistent',
    description: '같은 무늬 4장만으로도 플러시가 인정됩니다.',
    botUsable: true,
  },
  shortcut: {
    id: 'shortcut',
    name: '지름길',
    icon: '🛤️',
    tier: 'gold',
    kind: 'persistent',
    description: '연속된 4장만으로도 스트레이트가 인정됩니다.',
    botUsable: true,
  },
  tax: {
    id: 'tax',
    name: '징수',
    icon: '🏦',
    tier: 'gold',
    kind: 'oneShot',
    description: '다음 판 시작 시 모든 상대에게서 빅 블라인드만큼 칩을 걷어옵니다. 발동하면 사라집니다.',
    botUsable: true,
  },
  thirdHand: {
    id: 'thirdHand',
    name: '세 번째 손',
    icon: '🖐️',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '다음 판에 핸드 카드를 3장 받아 8장 중 최고의 5장으로 족보를 만듭니다. 발동하면 사라집니다.',
    botUsable: true,
  },
  fateTwist: {
    id: 'fateTwist',
    name: '운명 조작',
    icon: '🌀',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '다음 커뮤니티 카드를 미리 보고, 한 번 그 카드를 버리게 할 수 있습니다. 버리면 사라집니다.',
    botUsable: false,
  },
  jackpot: {
    id: 'jackpot',
    name: '잭팟',
    icon: '🎰',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '판에서 승리하면 순이익을 2배로 받습니다. 발동하면 사라집니다.',
    botUsable: true,
  },
  rainbow: {
    id: 'rainbow',
    name: '무지개 손',
    icon: '🌈',
    tier: 'prismatic',
    kind: 'persistent',
    description: '4장 플러시와 4장 스트레이트가 모두 인정됩니다.',
    botUsable: true,
  },
};

export const TIER_LABEL: Record<AugmentTier, string> = {
  silver: '실버',
  gold: '골드',
  prismatic: '프리즘',
};

export const KIND_LABEL: Record<AugmentKind, string> = {
  persistent: '지속형',
  oneShot: '일회용',
};

const TIER_WEIGHTS: [AugmentTier, number][] = [
  ['silver', 0.5],
  ['gold', 0.35],
  ['prismatic', 0.15],
];

/** 후보가 모자랄 때 채워 넣을 등급 순서 */
const FALLBACK: Record<AugmentTier, AugmentTier[]> = {
  silver: ['gold', 'prismatic'],
  gold: ['silver', 'prismatic'],
  prismatic: ['gold', 'silver'],
};

export function rollTier(rng: () => number = Math.random): AugmentTier {
  let r = rng();
  for (const [tier, w] of TIER_WEIGHTS) {
    if (r < w) return tier;
    r -= w;
  }
  return 'silver';
}

function pickRandom<T>(arr: T[], n: number, rng: () => number): T[] {
  const a = [...arr];
  const out: T[] = [];
  while (out.length < n && a.length) {
    out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
  }
  return out;
}

function pool(tier: AugmentTier, exclude: readonly AugmentId[], botOnly: boolean): AugmentId[] {
  return Object.values(AUGMENTS)
    .filter((a) => a.tier === tier && !exclude.includes(a.id) && (!botOnly || a.botUsable))
    .map((a) => a.id);
}

/**
 * 증강 후보를 뽑는다. exclude(이미 보유/제시 중)는 제외해 중복 보유를 막는다.
 * 해당 등급 후보가 모자라면 가까운 등급에서 채운다.
 */
export function rollOffer(
  tier: AugmentTier,
  exclude: readonly AugmentId[] = [],
  count = 3,
  botOnly = false,
  rng: () => number = Math.random,
): AugmentId[] {
  const out = pickRandom(pool(tier, exclude, botOnly), count, rng);
  for (const t of FALLBACK[tier]) {
    if (out.length >= count) break;
    out.push(...pickRandom(pool(t, [...exclude, ...out], botOnly), count - out.length, rng));
  }
  return out;
}

/** 같은 등급에서 exclude와 겹치지 않는 하나를 뽑는다. 없으면 가까운 등급에서, 그래도 없으면 null */
export function rollReplacement(
  tier: AugmentTier,
  exclude: readonly AugmentId[],
  botOnly = false,
  rng: () => number = Math.random,
): AugmentId | null {
  return rollOffer(tier, exclude, 1, botOnly, rng)[0] ?? null;
}

/** 족보 판정에 영향을 주는 증강들을 합친 옵션 */
export function evalOptionsFor(active: readonly AugmentId[]): EvalOptions {
  const opts: EvalOptions = {};
  if (active.includes('suitBender') || active.includes('rainbow')) opts.flushLen = 4;
  if (active.includes('shortcut') || active.includes('rainbow')) opts.straightLen = 4;
  return opts;
}
