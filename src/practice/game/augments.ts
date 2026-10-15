import type { AugmentId, AugmentTier } from './types';

/** persistent: 현재 판에서 유지(1회 발동형 포함) · oneShot: 사용 시 소모 · special: 선택 화면 전용 */
export type AugmentKind = 'persistent' | 'oneShot' | 'special';

export type AugmentTarget =
  | 'none'
  | 'selfHole'
  | 'selfHoleMulti'
  | 'selfHoleSuit'
  | 'selfHoleDelta'
  | 'opponent'
  | 'opponentSwap'
  | 'opponentHand'
  | 'board'
  | 'sealAugment'
  | 'copyPower';

export interface Augment {
  id: AugmentId;
  name: string;
  icon: string;
  tier: AugmentTier;
  kind: AugmentKind;
  description: string;
  /** 봇이 자동으로 받아 쓸 수 있는지 */
  botUsable: boolean;
  /** 사용 시 필요한 대상 */
  target: AugmentTarget;
  /** 첫 증강 선택(라운드 1) 후보에만 등장 */
  onlyRound1?: boolean;
  /** 능력 복제 가능 여부 */
  copyable?: boolean;
}

/** 한 판에 보유할 수 있는 최대 개수(=선택 횟수) */
export const MAX_AUGMENT_SLOTS = 2;

export const AUGMENTS: Record<AugmentId, Augment> = {
  aceStamp: {
    id: 'aceStamp',
    name: '에이스 각인',
    icon: '🂡',
    tier: 'gold',
    kind: 'oneShot',
    description: '비공개 카드 한 장의 숫자를 A로 바꿉니다. 무늬는 유지되며 동일 A가 이미 있어도 허용됩니다.',
    botUsable: true,
    target: 'selfHole',
    copyable: false,
  },
  clone: {
    id: 'clone',
    name: '복제술',
    icon: '⧉',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '비공개 카드 한 장과 완전히 같은 카드를 추가로 만들어 손에 넣습니다.',
    botUsable: true,
    target: 'selfHole',
    copyable: false,
  },
  suitUnify: {
    id: 'suitUnify',
    name: '무늬 통일',
    icon: '🎨',
    tier: 'gold',
    kind: 'oneShot',
    description: '비공개 카드 최대 2장의 무늬를 원하는 하나로 바꿉니다. 숫자는 유지됩니다.',
    botUsable: true,
    target: 'selfHoleSuit',
    copyable: false,
  },
  rankNudge: {
    id: 'rankNudge',
    name: '숫자 교정',
    icon: '↕',
    tier: 'silver',
    kind: 'persistent',
    description: '비공개 카드 한 장의 숫자를 한 단계 높이거나 낮춥니다. A↔2 순환은 불가. 현재 판 1회.',
    botUsable: true,
    target: 'selfHoleDelta',
    copyable: true,
  },
  fateSwap: {
    id: 'fateSwap',
    name: '운명의 교환',
    icon: '⇄',
    tier: 'gold',
    kind: 'oneShot',
    description: '상대 한 명과 비공개 카드 한 장씩을 교환합니다. 상대 카드는 무작위로 정해집니다.',
    botUsable: true,
    target: 'opponentSwap',
    copyable: false,
  },
  handFlip: {
    id: 'handFlip',
    name: '패 뒤집기',
    icon: '🃏',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '첫 증강 직후에만 사용. 상대와 비공개 손패 전체를 바꾸고, 받은 패 중 한 장을 전원에게 공개합니다.',
    botUsable: true,
    target: 'opponentHand',
    onlyRound1: true,
    copyable: false,
  },
  boardFlip: {
    id: 'boardFlip',
    name: '판 뒤집기',
    icon: '🌀',
    tier: 'gold',
    kind: 'oneShot',
    description: '홀덤: 공개된 공용 카드 한 장을 새 카드로 바꿉니다. 교체된 카드는 전원에게 보입니다.',
    botUsable: true,
    target: 'board',
    copyable: false,
  },
  redeal: {
    id: 'redeal',
    name: '운명 재배분',
    icon: '🔄',
    tier: 'silver',
    kind: 'persistent',
    description: '비공개 카드 한 장을 버리고 덱에서 새 카드를 받습니다. 현재 판 1회.',
    botUsable: true,
    target: 'selfHole',
    copyable: true,
  },
  mindRead: {
    id: 'mindRead',
    name: '독심술',
    icon: '👁️',
    tier: 'silver',
    kind: 'persistent',
    description: '상대 한 명의 무작위 비공개 카드 한 장을 본인만 확인합니다. 현재 판 1회.',
    botUsable: false,
    target: 'opponent',
    copyable: true,
  },
  foresight: {
    id: 'foresight',
    name: '미래 예지',
    icon: '🔮',
    tier: 'gold',
    kind: 'persistent',
    description: '다음에 공개될 공용 카드 한 장을 미리 봅니다. 지급 순서는 바뀌지 않습니다. 현재 판 1회.',
    botUsable: false,
    target: 'none',
    copyable: true,
  },
  forceReveal: {
    id: 'forceReveal',
    name: '강제 공개',
    icon: '📢',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '상대의 현재 비공개 카드 전체를 모든 플레이어에게 공개합니다. 소유권은 바뀌지 않습니다.',
    botUsable: true,
    target: 'opponent',
    copyable: false,
  },
  auraPeek: {
    id: 'auraPeek',
    name: '패의 기운',
    icon: '✨',
    tier: 'silver',
    kind: 'persistent',
    description: '상대 비공개 패에 페어가 있는지, J 이상 카드가 있는지만 알려 줍니다. 현재 판 1회.',
    botUsable: false,
    target: 'opponent',
    copyable: true,
  },
  raiseSeal: {
    id: 'raiseSeal',
    name: '레이즈 봉인',
    icon: '🔒',
    tier: 'gold',
    kind: 'oneShot',
    description: '상대 한 명은 다음 베팅 구간에서 새 베팅/레이즈를 할 수 없습니다. 체크·콜·폴드는 가능합니다.',
    botUsable: true,
    target: 'opponent',
    copyable: false,
  },
  actLast: {
    id: 'actLast',
    name: '순서 조작',
    icon: '⏩',
    tier: 'silver',
    kind: 'oneShot',
    description: '다음 베팅 구간에서 자신이 마지막으로 행동합니다. 딜러/블라인드 위치는 그대로입니다.',
    botUsable: true,
    target: 'none',
    copyable: false,
  },
  raiseCap: {
    id: 'raiseCap',
    name: '레이즈 제한',
    icon: '1️⃣',
    tier: 'silver',
    kind: 'oneShot',
    description: '다음 베팅 구간에서 모든 플레이어의 레이즈가 1회로 제한됩니다.',
    botUsable: true,
    target: 'none',
    copyable: false,
  },
  pressure: {
    id: 'pressure',
    name: '심리 압박',
    icon: '😠',
    tier: 'gold',
    kind: 'persistent',
    description: '레이즈할 때 상대를 지정합니다. 그 상대가 콜하면 비공개 카드 한 장이 본인에게 공개됩니다. 판당 1회.',
    botUsable: false,
    target: 'opponent',
    copyable: true,
  },
  augShield: {
    id: 'augShield',
    name: '증강 방패',
    icon: '🛡️',
    tier: 'prismatic',
    kind: 'persistent',
    description: '자신을 향한 공격형 증강 하나를 막습니다. 막으면 소모됩니다.',
    botUsable: true,
    target: 'none',
    copyable: true,
  },
  augSeal: {
    id: 'augSeal',
    name: '증강 봉인',
    icon: '⛔',
    tier: 'gold',
    kind: 'oneShot',
    description: '상대가 가진 증강 하나를 다음 베팅 구간 종료까지 쓸 수 없게 합니다.',
    botUsable: true,
    target: 'sealAugment',
    copyable: false,
  },
  copyPower: {
    id: 'copyPower',
    name: '능력 복제',
    icon: '🧬',
    tier: 'prismatic',
    kind: 'oneShot',
    description: '상대의 지속형 증강 하나를 복제해 현재 판에서 한 번 씁니다. 복제·재추첨은 복제할 수 없습니다.',
    botUsable: true,
    target: 'copyPower',
    copyable: false,
  },
  rerollFate: {
    id: 'rerollFate',
    name: '운명 재추첨',
    icon: '🎲',
    tier: 'silver',
    kind: 'special',
    description: '선택하면 새 후보 3개가 나옵니다. 이 기회에서 다시 재추첨은 등장하지 않으며, 최종 선택 하나만 보유합니다.',
    botUsable: true,
    target: 'none',
    copyable: false,
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
  special: '특수',
};

const TIER_WEIGHTS: [AugmentTier, number][] = [
  ['silver', 0.5],
  ['gold', 0.35],
  ['prismatic', 0.15],
];

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

function pool(
  tier: AugmentTier,
  exclude: readonly AugmentId[],
  botOnly: boolean,
  round: 1 | 2,
  allowReroll: boolean,
): AugmentId[] {
  return Object.values(AUGMENTS)
    .filter((a) => {
      if (a.tier !== tier) return false;
      if (exclude.includes(a.id)) return false;
      if (botOnly && !a.botUsable) return false;
      if (a.onlyRound1 && round !== 1) return false;
      if (a.id === 'rerollFate' && !allowReroll) return false;
      return true;
    })
    .map((a) => a.id);
}

/**
 * 증강 후보를 뽑는다. exclude(이미 보유)는 제외.
 * allowReroll=false면 운명 재추첨을 넣지 않는다.
 */
export function rollOffer(
  tier: AugmentTier,
  exclude: readonly AugmentId[] = [],
  count = 3,
  botOnly = false,
  rng: () => number = Math.random,
  round: 1 | 2 = 1,
  allowReroll = true,
): AugmentId[] {
  const out = pickRandom(pool(tier, exclude, botOnly, round, allowReroll), count, rng);
  for (const t of FALLBACK[tier]) {
    if (out.length >= count) break;
    out.push(...pickRandom(pool(t, [...exclude, ...out], botOnly, round, allowReroll), count - out.length, rng));
  }
  return out;
}

export function rollReplacement(
  tier: AugmentTier,
  exclude: readonly AugmentId[],
  botOnly = false,
  rng: () => number = Math.random,
  round: 1 | 2 = 1,
  allowReroll = true,
): AugmentId | null {
  return rollOffer(tier, exclude, 1, botOnly, rng, round, allowReroll)[0] ?? null;
}

/** 상대를 직접 겨냥하는 공격형 증강 (방패로 막을 수 있음) */
export const OFFENSIVE_AUGMENTS: readonly AugmentId[] = [
  'fateSwap',
  'handFlip',
  'forceReveal',
  'mindRead',
  'auraPeek',
  'raiseSeal',
  'augSeal',
  'copyPower',
  'pressure',
];

export function isOffensive(id: AugmentId): boolean {
  return OFFENSIVE_AUGMENTS.includes(id);
}

export function emptyEffects(): import('./types').HandEffects {
  return {
    raiseBannedUntil: {},
    raiseCapStreet: null,
    raisesUnderCap: 0,
    actLastId: null,
    actLastStreet: null,
    pressure: null,
    sealed: [],
    privatePeeks: [],
    foresight: {},
    auraHints: {},
    forceRevealed: [],
    shieldUsed: {},
  };
}
