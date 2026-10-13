import { createFxBus, type FxEvent } from './fxBus';

/** 메인 화면 캐릭터 몸짓용 버스. 메뉴 UI(일반 번들)와 3D 배경(지연 로드) 사이를 잇는다 */
export const menuFx = createFxBus();

/** 메인 화면에 앉은 내 캐릭터의 플레이어 id (createTable의 본인) */
export const MENU_HERO_ID = 0;

let seq = 0;

export function menuGesture(kind: 'check' | 'bet' | 'augment') {
  const base = { id: ++seq, at: performance.now(), dur: kind === 'augment' ? 700 : 450 };
  const e: FxEvent =
    kind === 'bet'
      ? { ...base, type: 'bet', playerId: MENU_HERO_ID, amount: 0, allIn: false }
      : kind === 'augment'
        ? { ...base, type: 'augment', playerId: MENU_HERO_ID, tier: 'silver', name: '' }
        : { ...base, type: 'check', playerId: MENU_HERO_ID };
  menuFx.emit(e);
}
