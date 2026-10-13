import { useEffect, useState, type ReactNode } from 'react';

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

function computeLayout(uiFactor: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT) * uiFactor;
  return { scale, width: w / scale, height: h / scale };
}

/**
 * 1920×1080 기준으로 배율을 정하되, 화면 비율이 다르면(16:10, 21:9) 검은 띠 대신
 * 논리 크기를 늘려 레이아웃이 남는 공간을 채우게 한다.
 * uiFactor가 클수록 논리 크기가 작아져 UI가 크게 보인다.
 */
export function Stage({ uiFactor, children }: { uiFactor: number; children: ReactNode }) {
  const [layout, setLayout] = useState(() => computeLayout(uiFactor));

  useEffect(() => {
    const onResize = () => setLayout(computeLayout(uiFactor));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [uiFactor]);

  return (
    <div className="stage-viewport">
      <div
        className="stage"
        style={{ width: layout.width, height: layout.height, transform: `scale(${layout.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
