import { useEffect, useState, type ReactNode } from 'react';

export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;

function computeScale() {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
}

/** 1600x900 기준으로 그린 화면을 창 크기에 맞춰 비율 유지하며 확대/축소 */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(computeScale);

  useEffect(() => {
    const onResize = () => setScale(computeScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="stage-viewport">
      <div
        className="stage"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
