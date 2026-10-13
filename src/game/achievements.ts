import { AUGMENTS, evalOptionsFor } from './augments';
import { evaluate } from './evaluator';
import type { GameState } from './types';

/** Steamworks 파트너 사이트에 같은 API 이름으로 등록해야 합니다. */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ACH_FIRST_POT', name: '첫 승리', description: '처음으로 팟을 가져가세요.' },
  { id: 'ACH_WIN_GAME', name: '테이블의 지배자', description: '모든 상대를 파산시키고 게임에서 승리하세요.' },
  { id: 'ACH_PRISMATIC_WIN', name: '프리즘의 힘', description: '프리즘 증강을 가진 채로 팟을 가져가세요.' },
  { id: 'ACH_AUGMENTED_HAND', name: '규칙 파괴자', description: '증강 덕분에 완성된 족보로 쇼다운에서 승리하세요.' },
  { id: 'ACH_ROYAL_FLUSH', name: '로열 로드', description: '로열 스트레이트 플러시로 승리하세요.' },
  { id: 'ACH_BIG_POT', name: '하이 롤러', description: '한 핸드에서 2000칩 이상의 팟을 가져가세요.' },
];

/** 핸드가 끝난 직후 상태를 보고 새로 달성한 업적 id 목록을 반환 */
export function checkHandAchievements(s: GameState, pot: number): string[] {
  const out: string[] = [];
  const me = s.players[0];
  if (s.phase !== 'handOver' || !s.result?.winnerIds.includes(me.id)) return out;

  out.push('ACH_FIRST_POT');
  if (me.augment && AUGMENTS[me.augment].tier === 'prismatic') out.push('ACH_PRISMATIC_WIN');
  if (pot >= 2000) out.push('ACH_BIG_POT');

  if (s.result.showdown) {
    const cards = [...me.hole, ...s.community];
    const augmented = evaluate(cards, evalOptionsFor(me.augment));
    const normal = evaluate(cards.slice(0, 2).concat(s.community));
    if (augmented.name === '로열 스트레이트 플러시') out.push('ACH_ROYAL_FLUSH');
    if (augmented.score[0] > normal.score[0]) out.push('ACH_AUGMENTED_HAND');
  }
  return out;
}
