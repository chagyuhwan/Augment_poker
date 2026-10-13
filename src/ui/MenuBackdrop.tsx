import { lazy, Suspense } from 'react';
import { useSettings } from '../app/settingsContext';
import { canUseWebGL } from '../scene3d/webgl';
import { CasinoBackdrop } from './CasinoBackdrop';
import './menu-backdrop.css';

const MenuScene = lazy(() => import('../scene3d/MenuScene').then((m) => ({ default: m.MenuScene })));

/** 메뉴 화면 배경: WebGL이 되면 3D 카지노, 아니면 기존 2D 배경. dim이면 다른 화면용으로 어둡게 깐다 */
export function MenuBackdrop({ dim }: { dim: boolean }) {
  const { settings } = useSettings();
  if (!canUseWebGL()) return <CasinoBackdrop />;
  const fallback = <CasinoBackdrop />;
  return (
    <div className={dim ? 'menu3d is-dim' : 'menu3d'} aria-hidden="true">
      <Suspense fallback={fallback}>
        <MenuScene quality={settings.graphicsQuality} reduceMotion={settings.reduceMotion} fallback={fallback} />
      </Suspense>
      <div className="menu3d__shade" />
    </div>
  );
}
