import type { Card, Suit } from './types';

export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function rankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  if (rank === 10) return '10';
  return String(rank);
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

/** 상태의 nextCardId를 올려 가며 카드를 만든다 */
export function makeCard(
  state: { nextCardId: number },
  rank: number,
  suit: Suit,
  opts: { isGenerated?: boolean; isModified?: boolean; originalId?: number } = {},
): Card {
  const id = state.nextCardId++;
  return {
    id,
    rank,
    suit,
    isGenerated: opts.isGenerated,
    isModified: opts.isModified,
    originalId: opts.originalId,
  };
}

export function fullDeck(state: { nextCardId: number }): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push(makeCard(state, rank, suit));
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 인스턴스 id가 같으면 같은 물리 카드 */
export function sameInstance(a: Card, b: Card): boolean {
  return a.id === b.id;
}

/** 숫자·무늬만 비교 (족보·표시용) */
export function sameFace(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** @deprecated sameFace 사용. 구 코드 호환 */
export function sameCard(a: Card, b: Card): boolean {
  return sameFace(a, b);
}

export function cloneCard(state: { nextCardId: number }, src: Card): Card {
  return makeCard(state, src.rank, src.suit, {
    isGenerated: true,
    originalId: src.id,
  });
}
