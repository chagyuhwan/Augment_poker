import { useEffect, useRef, type CSSProperties } from 'react';
import './casino-backdrop.css';

const d = (v: number) => ({ ['--d' as string]: v }) as CSSProperties;

const BOKEH = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 53) % 100,
  y: 18 + ((i * 37) % 60),
  s: 14 + ((i * 29) % 46),
  delay: -((i * 1.7) % 9),
  dur: 7 + ((i * 13) % 8),
  gold: i % 3 !== 0,
}));

const CHIPS = [
  { x: 8, delay: 0, dur: 16, color: '#d0435a', s: 1 },
  { x: 22, delay: -6, dur: 19, color: '#f2c14e', s: 0.8 },
  { x: 48, delay: -11, dur: 21, color: '#1f2a36', s: 0.9 },
  { x: 71, delay: -3, dur: 17, color: '#3dbb6e', s: 0.75 },
  { x: 88, delay: -9, dur: 20, color: '#3a8fd6', s: 1.05 },
];

/** 메뉴 화면 뒤 카지노 실내 배경. 레이어마다 깊이(--d)가 달라 마우스를 따라 패럴랙스로 움직인다. */
export function CasinoBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      el.style.setProperty('--px', x.toFixed(4));
      el.style.setProperty('--py', y.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="casino-bg" ref={ref} aria-hidden="true">
      <div className="casino-bg__wall layer" style={d(0.12)}>
        <svg className="casino-bg__damask" width="100%" height="100%">
          <defs>
            <pattern id="damask" width="120" height="150" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="#f2c14e" strokeWidth="2.2" strokeLinecap="round" opacity="0.5">
                <path d="M60 18 C 78 40 78 58 60 75 C 42 58 42 40 60 18 Z" />
                <path d="M60 75 C 84 70 98 84 96 104 C 82 92 72 90 60 98" />
                <path d="M60 75 C 36 70 22 84 24 104 C 38 92 48 90 60 98" />
                <path d="M60 98 L 60 130" />
                <circle cx="60" cy="48" r="5" />
                <path d="M0 0 C 14 18 14 30 0 42 M120 0 C 106 18 106 30 120 42" />
                <path d="M0 150 C 14 132 14 120 0 108 M120 150 C 106 132 106 120 120 108" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#damask)" />
        </svg>
        <div className="casino-bg__pillars">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="casino-bg__glow layer" style={d(0.2)} />

      <div className="casino-bg__lamps layer" style={d(0.35)}>
        {[18, 50, 82].map((x, i) => (
          <div key={x} className="lamp" style={{ left: `${x}%`, animationDelay: `${-i * 1.3}s` }}>
            <div className="lamp__cord" />
            <svg className="lamp__shade" viewBox="0 0 160 90">
              <path d="M40 8 L120 8 L156 70 L4 70 Z" fill="#1d5a3c" stroke="#0e0306" strokeWidth="6" strokeLinejoin="round" />
              <path d="M44 16 L116 16" stroke="#3f9a6a" strokeWidth="6" strokeLinecap="round" />
              <rect x="0" y="66" width="160" height="12" rx="6" fill="#f2c14e" stroke="#0e0306" strokeWidth="5" />
              <ellipse cx="80" cy="82" rx="30" ry="8" fill="#fff4c2" />
            </svg>
            <div className="lamp__cone" />
          </div>
        ))}
      </div>

      <div className="casino-bg__bokeh layer" style={d(0.55)}>
        {BOKEH.map((b, i) => (
          <i
            key={i}
            className={b.gold ? 'is-gold' : 'is-ruby'}
            style={
              {
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: b.s,
                height: b.s,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.dur}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="casino-bg__chips layer" style={d(0.8)}>
        {CHIPS.map((c, i) => (
          <svg
            key={i}
            className="float-chip"
            viewBox="0 0 64 64"
            style={{ left: `${c.x}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, scale: String(c.s) } as CSSProperties}
          >
            <circle cx="32" cy="32" r="28" fill={c.color} stroke="#0e0306" strokeWidth="5" />
            <circle cx="32" cy="32" r="18" fill="none" stroke="#fbefd9" strokeWidth="4" strokeDasharray="7 6" />
            <circle cx="32" cy="32" r="10" fill="#fbefd9" opacity="0.9" />
          </svg>
        ))}
      </div>

      <div className="casino-bg__wainscot">
        <div className="casino-bg__rail" />
        <div className="casino-bg__panels">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
      <div className="casino-bg__vignette" />
    </div>
  );
}
