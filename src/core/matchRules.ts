/** 매치(한 경기) 전용 칩·핸드·블라인드 규칙. 계정 지갑과 무관하다. */

export const MATCH_HAND_OPTIONS = [6, 8, 12, 16] as const;
export type MatchHandCount = (typeof MATCH_HAND_OPTIONS)[number];

export const DEFAULT_MATCH_HANDS: MatchHandCount = 8;
export const DEFAULT_STARTING_CHIPS = 1_000;
export const DEFAULT_MATCH_SB = 10;
export const DEFAULT_MATCH_BB = 20;
export const DEFAULT_ACTION_SECONDS = 15;
export const DEFAULT_AUGMENT_PICK_SECONDS = 12;

/** 블라인드 배수: 경기 진행률에 따라 1 → 1.5 → 2 → 3 */
const BLIND_MULTS = [1, 1.5, 2, 3] as const;

export function blindMultiplier(handNumber: number, matchHands: number): number {
  if (matchHands <= 1) return BLIND_MULTS[0];
  const progress = (handNumber - 1) / Math.max(1, matchHands - 1);
  if (progress < 0.25) return BLIND_MULTS[0];
  if (progress < 0.5) return BLIND_MULTS[1];
  if (progress < 0.75) return BLIND_MULTS[2];
  return BLIND_MULTS[3];
}

export function blindsForHand(
  handNumber: number,
  matchHands: number,
  baseSb: number,
  baseBb: number,
): { sb: number; bb: number } {
  const m = blindMultiplier(handNumber, matchHands);
  const sb = Math.max(1, Math.round(baseSb * m));
  const bb = Math.max(sb * 2, Math.round(baseBb * m));
  return { sb, bb };
}

/** 다음 블라인드가 오르는 핸드 번호(없으면 null) */
export function nextBlindIncreaseHand(handNumber: number, matchHands: number): number | null {
  const cur = blindMultiplier(handNumber, matchHands);
  for (let h = handNumber + 1; h <= matchHands; h++) {
    if (blindMultiplier(h, matchHands) > cur) return h;
  }
  return null;
}

export function netChipScore(chips: number, chipGranted: number): number {
  return chips - chipGranted;
}

export interface MatchStanding {
  playerId: number;
  name: string;
  chips: number;
  chipGranted: number;
  chipRefills: number;
  netScore: number;
  handsWon: number;
  potWon: number;
  rank: number;
  dnf: boolean;
}

export function rankMatchPlayers(
  players: Array<{
    id: number;
    name: string;
    chips: number;
    chipGranted: number;
    chipRefills: number;
    handsWon: number;
    potWon: number;
    dnf?: boolean;
  }>,
): MatchStanding[] {
  const sorted = [...players].sort((a, b) => {
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    const na = netChipScore(a.chips, a.chipGranted);
    const nb = netChipScore(b.chips, b.chipGranted);
    if (nb !== na) return nb - na;
    return b.chips - a.chips;
  });
  let rank = 1;
  return sorted.map((p, i) => {
    const net = netChipScore(p.chips, p.chipGranted);
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevNet = netChipScore(prev.chips, prev.chipGranted);
      const same = !!prev.dnf === !!p.dnf && prevNet === net && prev.chips === p.chips;
      if (!same) rank = i + 1;
    }
    return {
      playerId: p.id,
      name: p.name,
      chips: p.chips,
      chipGranted: p.chipGranted,
      chipRefills: p.chipRefills,
      netScore: net,
      handsWon: p.handsWon,
      potWon: p.potWon,
      rank,
      dnf: !!p.dnf,
    };
  });
}
