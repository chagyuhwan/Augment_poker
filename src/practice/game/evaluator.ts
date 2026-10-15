import type { Card, Suit } from './types';

export interface EvalOptions {
  /** 레거시 호환. 신규 증강은 쓰지 않음 */
  flushLen?: number;
  straightLen?: number;
}

export interface HandValue {
  score: number[];
  name: string;
}

const CATEGORY_NAMES = [
  '하이카드',
  '원페어',
  '투페어',
  '트리플',
  '스트레이트',
  '플러시',
  '풀하우스',
  '포카드',
  '스트레이트 플러시',
];

/** 서로 다른 연속 숫자만 센다(중복 숫자는 Set으로 제거). A는 14 또는 1(휠) */
function findStraightHigh(ranks: Set<number>, len: number): number {
  const has = (r: number) => ranks.has(r) || (r === 1 && ranks.has(14));
  for (let high = 14; high >= len; high--) {
    let ok = true;
    for (let r = high; r > high - len; r--) {
      if (!has(r)) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  return 0;
}

export function compareScore(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** n장 중 k장 조합 (홀덤 베스트 5장용) */
function eachCombo<T>(arr: T[], k: number, fn: (pick: T[]) => void) {
  const n = arr.length;
  if (k <= 0 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  const pick = Array<T>(k);
  for (;;) {
    for (let i = 0; i < k; i++) pick[i] = arr[idx[i]];
    fn(pick);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * 정확히 주어진 카드만으로 족보를 매긴다 (보통 5장).
 * - 동일 숫자 5장 이상 → 포카드(파이브카드 없음)
 * - 플러시+풀하우스 동시 → 풀하우스
 * - 스트레이트는 서로 다른 연속 숫자 필요
 */
function evaluateExact(cards: Card[], opts: EvalOptions): HandValue {
  const flushLen = opts.flushLen ?? 5;
  const straightLen = opts.straightLen ?? 5;

  const bySuit = new Map<Suit, number[]>();
  const counts = new Map<number, number>();
  for (const c of cards) {
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
    bySuit.get(c.suit)!.push(c.rank);
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }

  const make = (score: number[]): HandValue => {
    let name = CATEGORY_NAMES[score[0]];
    if (score[0] === 8 && score[1] === 14) name = '로열 스트레이트 플러시';
    return { score, name };
  };

  let bestSF = 0;
  const sfLen = Math.max(flushLen, straightLen);
  for (const ranks of bySuit.values()) {
    if (new Set(ranks).size < sfLen) continue;
    bestSF = Math.max(bestSF, findStraightHigh(new Set(ranks), sfLen));
  }
  if (bestSF) return make([8, bestSF]);

  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const uniqueDesc = [...counts.keys()].sort((a, b) => b - a);
  const kickers = (exclude: number[], n: number) => {
    const out: number[] = [];
    for (const r of uniqueDesc) {
      if (exclude.includes(r)) continue;
      out.push(r);
      if (out.length >= n) break;
    }
    while (out.length < n) out.push(0);
    return out;
  };

  if (groups[0]?.count >= 4) {
    return make([7, groups[0].rank, ...kickers([groups[0].rank], 1)]);
  }

  if (groups[0]?.count >= 3) {
    const pair = groups.slice(1).find((g) => g.count >= 2);
    if (pair) return make([6, groups[0].rank, pair.rank]);
  }

  let bestFlush: number[] | null = null;
  for (const ranks of bySuit.values()) {
    if (ranks.length < flushLen) continue;
    const top = [...ranks].sort((a, b) => b - a).slice(0, 5);
    if (!bestFlush || compareScore(top, bestFlush) > 0) bestFlush = top;
  }
  if (bestFlush) return make([5, ...bestFlush]);

  const straightHigh = findStraightHigh(new Set(uniqueDesc), straightLen);
  if (straightHigh) return make([4, straightHigh]);

  if (groups[0]?.count === 3) {
    return make([3, groups[0].rank, ...kickers([groups[0].rank], 2)]);
  }

  if (groups[0]?.count === 2) {
    if (groups[1]?.count === 2) {
      const p1 = groups[0].rank;
      const p2 = groups[1].rank;
      return make([2, p1, p2, ...kickers([p1, p2], 1)]);
    }
    return make([1, groups[0].rank, ...kickers([groups[0].rank], 3)]);
  }

  return make([0, ...uniqueDesc.slice(0, 5)]);
}

/**
 * 홀덤 규칙: 보유 카드 중 최고의 5장 족보.
 * 2홀+5보드(또는 증강으로 더 많은 카드)에서 5장 조합을 모두 비교한다.
 */
export function evaluate(cards: Card[], opts: EvalOptions = {}): HandValue {
  if (cards.length === 0) return { score: [0, 0, 0, 0, 0, 0], name: '하이카드' };
  if (cards.length <= 5) return evaluateExact(cards, opts);

  let best: HandValue | null = null;
  eachCombo(cards, 5, (five) => {
    const v = evaluateExact(five, opts);
    if (!best || compareScore(v.score, best.score) > 0) best = v;
  });
  return best!;
}
