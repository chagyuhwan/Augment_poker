import { AUGMENTS, evalOptionsFor } from './augments';
import { hasActive, hero } from './engine';
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
  { id: 'ACH_MARATHON', name: '끝나지 않는 테이블', description: '한 테이블에서 50판을 플레이하세요.' },
  { id: 'ACH_PRISMATIC_WIN', name: '프리즘의 힘', description: '프리즘 증강을 가진 채로 팟을 가져가세요.' },
  { id: 'ACH_AUGMENTED_HAND', name: '규칙 파괴자', description: '증강 덕분에 완성된 족보로 쇼다운에서 승리하세요.' },
  { id: 'ACH_ROYAL_FLUSH', name: '로열 로드', description: '로열 스트레이트 플러시로 승리하세요.' },
  { id: 'ACH_BIG_POT', name: '하이 롤러', description: '한 핸드에서 2000칩 이상의 팟을 가져가세요.' },
];

/** 핸드가 끝난 직후 상태를 보고 새로 달성한 업적 id 목록을 반환 */
export function checkHandAchievements(s: GameState): string[] {
  const out: string[] = [];
  const me = hero(s);
  if (!me || s.phase !== 'handOver' || !s.result) return out;
  if (s.handNumber >= 50) out.push('ACH_MARATHON');
  if (!s.result.winnerIds.includes(me.id)) return out;

  out.push('ACH_FIRST_POT');
  if (me.augments.some((a) => AUGMENTS[a.id].tier === 'prismatic')) out.push('ACH_PRISMATIC_WIN');
  if (s.result.pot >= 2000) out.push('ACH_BIG_POT');

  if (s.result.showdown) {
    const cards = [...me.hole, ...s.community];
    const active = me.augments.filter((a) => hasActive(s, me, a.id)).map((a) => a.id);
    const augmented = evaluate(cards, evalOptionsFor(active));
    const normal = evaluate(cards);
    if (augmented.name === '로열 스트레이트 플러시') out.push('ACH_ROYAL_FLUSH');
    if (augmented.score[0] > normal.score[0]) out.push('ACH_AUGMENTED_HAND');
  }
  return out;
}
