import type { Card, GameState, Player } from '../practice/game/types';

const HIDDEN: Card = { id: -1, rank: 0, suit: 's' };

function maskHole(p: Player, viewerId: number, s: GameState): Card[] {
  if (p.id === viewerId) return p.hole.map((c) => ({ ...c }));
  const showdown = s.phase === 'handOver' && Boolean(s.result?.showdown) && !p.folded;
  const force = s.effects.forceRevealed.includes(p.id);
  const revealedIdx = s.revealed[p.id];
  const revealAll = revealedIdx && revealedIdx.length === 0;
  return p.hole.map((c, i) => {
    const face =
      showdown ||
      force ||
      revealAll ||
      (revealedIdx?.includes(i) ?? false) ||
      s.effects.privatePeeks.some((pk) => pk.viewerId === viewerId && pk.targetId === p.id && pk.cardId === c.id);
    if (face) {
      const peek = s.effects.privatePeeks.find(
        (pk) => pk.viewerId === viewerId && pk.targetId === p.id && pk.cardId === c.id,
      );
      if (peek && !showdown && !force && !revealAll && !(revealedIdx?.includes(i) ?? false)) {
        return { id: c.id, rank: peek.rank, suit: peek.suit, isGenerated: c.isGenerated, isModified: c.isModified };
      }
      return { ...c };
    }
    return { ...HIDDEN, id: c.id };
  });
}

/**
 * 수신자(viewerSeatId) 기준으로 손패·덱·타인 전용 정보를 가린 상태를 만든다.
 * heroId는 수신자 자신으로 맞춘다.
 */
export function fogOfWar(state: GameState, viewerSeatId: number): GameState {
  const peeks = state.effects.privatePeeks
    .filter((p) => p.viewerId === viewerSeatId)
    .map((p) => ({ ...p }));
  const foresight: GameState['effects']['foresight'] = {};
  if (state.effects.foresight[viewerSeatId]) {
    foresight[viewerSeatId] = { ...state.effects.foresight[viewerSeatId] };
  }
  const auraHints: GameState['effects']['auraHints'] = {};
  if (state.effects.auraHints[viewerSeatId]) {
    auraHints[viewerSeatId] = state.effects.auraHints[viewerSeatId];
  }

  return {
    ...state,
    heroId: viewerSeatId,
    deck: state.deck.map((c) => ({ ...HIDDEN, id: c.id })),
    community: state.community.map((c) => ({ ...c })),
    players: state.players.map((p) => ({
      ...p,
      hole: maskHole(p, viewerSeatId, state),
      augments: p.augments.map((a) => ({ ...a })),
    })),
    log: [...state.log],
    events: [...state.events],
    revealed: { ...state.revealed },
    effects: {
      ...state.effects,
      raiseBannedUntil: { ...state.effects.raiseBannedUntil },
      sealed: state.effects.sealed.map((x) => ({ ...x })),
      privatePeeks: peeks,
      foresight,
      auraHints,
      forceRevealed: [...state.effects.forceRevealed],
      shieldUsed: { ...state.effects.shieldUsed },
      pressure: state.effects.pressure ? { ...state.effects.pressure } : null,
    },
    result: state.result
      ? {
          ...state.result,
          lines: [...state.result.lines],
          winnerIds: [...state.result.winnerIds],
          net: { ...state.result.net },
        }
      : null,
    augmentRound: state.augmentRound
      ? {
          ...state.augmentRound,
          entries: Object.fromEntries(
            Object.entries(state.augmentRound.entries).map(([id, e]) => [
              id,
              { ...e, offer: [...e.offer] },
            ]),
          ),
        }
      : null,
  };
}
