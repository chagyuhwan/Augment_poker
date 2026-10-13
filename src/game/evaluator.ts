import type { Card, Suit } from './types';

export interface EvalOptions {
  flushLen?: number;
  straightLen?: number;
}

export interface HandValue {
  score: number[]; // [카테고리, 타이브레이커...]
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

/** 5장 이상의 카드에서 최고 족보를 계산. 증강에 따라 4장 플러시/스트레이트를 허용. */
export function evaluate(cards: Card[], opts: EvalOptions = {}): HandValue {
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

  // 스트레이트 플러시
  let bestSF = 0;
  const sfLen = Math.max(flushLen, straightLen);
  for (const ranks of bySuit.values()) {
    if (ranks.length < sfLen) continue;
    bestSF = Math.max(bestSF, findStraightHigh(new Set(ranks), sfLen));
  }
  if (bestSF) return make([8, bestSF]);

  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const sortedRanks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const kickers = (exclude: number[], n: number) => {
    const out: number[] = [];
    for (const r of sortedRanks) {
      if (exclude.includes(r)) continue;
      if (out.length >= n) break;
      out.push(r);
    }
    return out;
  };

  // 포카드
  if (groups[0].count >= 4) {
    return make([7, groups[0].rank, ...kickers([groups[0].rank], 1)]);
  }

  // 풀하우스
  if (groups[0].count >= 3) {
    const pair = groups.slice(1).find((g) => g.count >= 2);
    if (pair) return make([6, groups[0].rank, pair.rank]);
  }

  // 플러시
  let bestFlush: number[] | null = null;
  for (const ranks of bySuit.values()) {
    if (ranks.length < flushLen) continue;
    const top = [...ranks].sort((a, b) => b - a).slice(0, 5);
    if (!bestFlush || compareScore(top, bestFlush) > 0) bestFlush = top;
  }
  if (bestFlush) return make([5, ...bestFlush]);

  // 스트레이트
  const straightHigh = findStraightHigh(new Set(sortedRanks), straightLen);
  if (straightHigh) return make([4, straightHigh]);

  // 트리플
  if (groups[0].count === 3) {
    return make([3, groups[0].rank, ...kickers([groups[0].rank], 2)]);
  }

  // 투페어 / 원페어
  if (groups[0].count === 2) {
    if (groups[1]?.count === 2) {
      const p1 = groups[0].rank;
      const p2 = groups[1].rank;
      return make([2, p1, p2, ...kickers([p1, p2], 1)]);
    }
    return make([1, groups[0].rank, ...kickers([groups[0].rank], 3)]);
  }

  return make([0, ...sortedRanks.slice(0, 5)]);
}
