import { useEffect, useState } from 'react';
import { resetTextureCache } from './textures';

let ready = false;
let pending: Promise<void> | null = null;

function loadFonts(): Promise<void> {
  if (!pending) {
    const fonts = document.fonts;
    pending = Promise.race([
      Promise.all([fonts.load("72px 'Black Han Sans'"), fonts.load("20px 'Jua'")]),
      new Promise((r) => setTimeout(r, 1500)),
    ])
      .catch(() => undefined)
      .then(() => {
        // 폰트 없이 그려진 캔버스 텍스처를 한 번만 버린다
        resetTextureCache();
        ready = true;
      });
  }
  return pending;
}

/** 캔버스 텍스처에 쓰는 폰트가 준비될 때까지 기다린다 */
export function useFontsReady() {
  const [ok, setOk] = useState(ready);
  useEffect(() => {
    if (ok) return;
    let alive = true;
    void loadFonts().then(() => alive && setOk(true));
    return () => {
      alive = false;
    };
  }, [ok]);
  return ok;
}
