import { SceneHtml } from '../SceneHtml';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/audioEngine';
import { potSize } from '../../practice/game/engine';
import type { GameState } from '../../practice/game/types';
import type { FxEvent } from '../fxBus';
import { POT_POS, TABLE_Y, type Vec3 } from '../layout';
import { CHIP_COLORS, toonGradient } from '../materials';
import { betPoint, stackPoint, useFx, useScene } from '../sceneContext';

const CHIP_R = 0.075;
const CHIP_H = 0.024;
const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 18);

let chipMats: THREE.Material[] | null = null;
function chipMaterials(): THREE.Material[] {
  if (chipMats) return chipMats;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 16);
  ctx.fillStyle = '#7d7d7d';
  for (let i = 0; i < 6; i++) ctx.fillRect(i * 21 + 4, 0, 9, 16);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, 128, 2);
  ctx.fillRect(0, 14, 128, 2);
  const side = new THREE.CanvasTexture(c);
  side.colorSpace = THREE.SRGBColorSpace;
  const t = document.createElement('canvas');
  t.width = t.height = 64;
  const tc = t.getContext('2d')!;
  tc.fillStyle = '#ffffff';
  tc.fillRect(0, 0, 64, 64);
  tc.strokeStyle = '#8a8a8a';
  tc.lineWidth = 5;
  tc.setLineDash([7, 6]);
  tc.beginPath();
  tc.arc(32, 32, 22, 0, Math.PI * 2);
  tc.stroke();
  tc.setLineDash([]);
  tc.strokeStyle = '#2a2a2a';
  tc.lineWidth = 4;
  tc.beginPath();
  tc.arc(32, 32, 30, 0, Math.PI * 2);
  tc.stroke();
  const top = new THREE.CanvasTexture(t);
  top.colorSpace = THREE.SRGBColorSpace;
  chipMats = [
    new THREE.MeshToonMaterial({ map: side, gradientMap: toonGradient() }),
    new THREE.MeshToonMaterial({ map: top, gradientMap: toonGradient() }),
    new THREE.MeshToonMaterial({ map: top, gradientMap: toonGradient() }),
  ];
  return chipMats;
}

/** 금액을 칩 더미로: 빅 블라인드 기준 액면, 최대 30개 */
function breakdown(amount: number, bb: number): number[] {
  if (amount <= 0) return [];
  const denoms = [500, 100, 25, 5, 1].map((m) => m * bb);
  const out: number[] = [];
  let rest = amount;
  denoms.forEach((d, i) => {
    let n = Math.floor(rest / d);
    rest -= n * d;
    n = Math.min(n, 9);
    for (let k = 0; k < n; k++) out.push(4 - i);
  });
  if (rest > 0 || out.length === 0) out.push(0);
  return out.slice(0, 30);
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

export function ChipStack({ amount, position, bb, columns = 3 }: { amount: number; position: Vec3; bb: number; columns?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const chips = useMemo(() => breakdown(amount, bb), [amount, bb]);
  const pop = useRef(0);
  const prev = useRef(amount);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const perCol = Math.ceil(chips.length / columns);
    chips.forEach((denom, i) => {
      const col = Math.floor(i / Math.max(1, perCol));
      const row = i % Math.max(1, perCol);
      const ang = col * 2.1;
      const r = col === 0 ? 0 : CHIP_R * 2.05;
      const jitter = ((i * 37) % 10) / 10 - 0.5;
      tmpP.set(Math.cos(ang) * r + jitter * 0.008, CHIP_H / 2 + row * CHIP_H * 1.02, Math.sin(ang) * r + jitter * 0.006);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.7);
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i, tmpM);
      m.setColorAt(i, tmpC.set(CHIP_COLORS[denom + 1] ?? CHIP_COLORS[0]));
    });
    m.count = chips.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    if (amount !== prev.current) pop.current = 1;
    prev.current = amount;
  }, [chips, columns, amount]);

  useFrame((_, dt) => {
    if (!group.current) return;
    pop.current = Math.max(0, pop.current - dt * 4);
    const s = 1 + Math.sin(pop.current * Math.PI) * 0.18;
    group.current.scale.set(s, 1 + Math.sin(pop.current * Math.PI) * 0.25, s);
  });

  return (
    <group ref={group} position={position}>
      <instancedMesh ref={ref} args={[chipGeo, chipMaterials(), 40]} castShadow receiveShadow />
    </group>
  );
}

// ── 화면에 보이는 칩 수치 (연출이 끝난 뒤 갱신) ──
interface Shown {
  bets: Record<number, number>;
  stacks: Record<number, number>;
  pot: number;
}

function snapshot(s: GameState): Shown {
  const bets: Record<number, number> = {};
  const stacks: Record<number, number> = {};
  for (const p of s.players) {
    bets[p.id] = p.bet;
    stacks[p.id] = p.chips;
  }
  return { bets, stacks, pot: potSize(s) - s.players.reduce((a, p) => a + p.bet, 0) };
}

/** 연출 타이밍에 맞춰 칩 더미 수치를 늦게 바꾼다. 대기 중인 연출이 없으면 상태와 맞춘다 */
function useShown(): Shown {
  const { state, busyUntil } = useScene();
  const latest = useRef(state);
  latest.current = state;
  const [shown, setShown] = useState(() => snapshot(state));
  const timers = useRef<number[]>([]);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, ms)));
  };

  useFx((e: FxEvent) => {
    const now = performance.now();
    const start = e.at - now;
    const end = e.at + e.dur - now;
    if (e.type === 'bet') {
      later(end - 60, () =>
        setShown((s) => {
          const p = latest.current.players.find((x) => x.id === e.playerId);
          return p ? { ...s, bets: { ...s.bets, [p.id]: Math.max(s.bets[p.id] ?? 0, 0) + e.amount }, stacks: { ...s.stacks, [p.id]: p.chips } } : s;
        }),
      );
    } else if (e.type === 'collect') {
      later(start, () =>
        setShown((s) => {
          const bets = { ...s.bets };
          for (const f of e.from) bets[f.playerId] = 0;
          return { ...s, bets };
        }),
      );
      later(end - 40, () => setShown((s) => ({ ...s, pot: s.pot + e.from.reduce((a, f) => a + f.amount, 0) })));
    } else if (e.type === 'award') {
      later(start + 250, () => setShown((s) => ({ ...s, pot: 0 })));
      later(start + 700, () => setShown(snapshot(latest.current)));
    }
  });

  // 대기 중인 연출이 끝나면 상태와 동기화 (중간 합류·누락 보정)
  useEffect(() => {
    let t = 0;
    const check = () => {
      const wait = busyUntil.current - performance.now() + 120;
      if (wait > 0) t = window.setTimeout(check, wait);
      else setShown(snapshot(latest.current));
    };
    t = window.setTimeout(check, 40);
    return () => window.clearTimeout(t);
  }, [state, busyUntil]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  return shown;
}

export function TableChips() {
  const { state } = useScene();
  const shown = useShown();
  const potLabel = shown.pot + Object.values(shown.bets).reduce((a, b) => a + b, 0);
  return (
    <>
      {state.players.map((p) => {
        if (p.status === 'busted') return null;
        const stack = shown.stacks[p.id] ?? p.chips;
        const bet = shown.bets[p.id] ?? 0;
        return (
          <group key={p.id}>
            {stack > 0 && <ChipStack amount={stack} position={stackPoint(state, p.id)} bb={state.bb} />}
            {bet > 0 && <ChipStack amount={bet} position={betPoint(state, p.id)} bb={state.bb} columns={2} />}
          </group>
        );
      })}
      {shown.pot > 0 && <ChipStack amount={shown.pot} position={POT_POS} bb={state.bb} columns={4} />}
      {potLabel > 0 && (
        <SceneHtml position={[POT_POS[0] - 0.42, TABLE_Y + 0.12, POT_POS[2]]} center zIndexRange={[8, 0]} className="pot-tag-wrap">
          <div className="pot-tag">
            <span className="pot-tag__label">팟</span>
            <span className="pot-tag__amount">{potLabel.toLocaleString()}</span>
          </div>
        </SceneHtml>
      )}
      <ChipFliers />
    </>
  );
}

// ── 날아가는 칩 ──
interface Flight {
  id: number;
  from: Vec3;
  to: Vec3;
  at: number;
  dur: number;
  count: number;
  sound: boolean;
}

let flightId = 1;

function ChipFliers() {
  const { state } = useScene();
  const [flights, setFlights] = useState<Flight[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useFx((e) => {
    const s = stateRef.current;
    const add: Flight[] = [];
    if (e.type === 'bet') {
      add.push({ id: flightId++, from: stackPoint(s, e.playerId), to: betPoint(s, e.playerId), at: e.at, dur: e.dur, count: e.allIn ? 7 : 4, sound: false });
    } else if (e.type === 'collect') {
      for (const f of e.from) add.push({ id: flightId++, from: betPoint(s, f.playerId), to: POT_POS, at: e.at, dur: e.dur, count: 4, sound: false });
    } else if (e.type === 'award') {
      for (const w of e.winners) {
        add.push({ id: flightId++, from: POT_POS, to: stackPoint(s, w.playerId), at: e.at + 200, dur: Math.min(900, e.dur * 0.55), count: 9, sound: true });
      }
    }
    if (add.length) setFlights((f) => [...f, ...add]);
  });

  const done = (id: number) => setFlights((f) => f.filter((x) => x.id !== id));
  return (
    <>
      {flights.map((f) => (
        <ChipFlight key={f.id} flight={f} onDone={() => done(f.id)} />
      ))}
    </>
  );
}

function ChipFlight({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const finished = useRef(false);
  const landed = useRef(false);
  const mats = chipMaterials();
  const colors = useMemo(() => Array.from({ length: flight.count }, (_, i) => CHIP_COLORS[(flight.id + i) % CHIP_COLORS.length]), [flight]);
  const perChip = useMemo(
    () => colors.map((c) => mats.map((m) => Object.assign((m as THREE.MeshToonMaterial).clone(), { color: new THREE.Color(c) }))),
    [colors, mats],
  );
  useFrame(() => {
    if (finished.current) return;
    const now = performance.now();
    let allDone = true;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const start = flight.at + i * 35;
      const t = (now - start) / flight.dur;
      if (t < 0) {
        m.visible = false;
        allDone = false;
        return;
      }
      if (t >= 1) {
        m.visible = false;
        return;
      }
      allDone = false;
      m.visible = true;
      const k = 1 - (1 - t) * (1 - t);
      const x = flight.from[0] + (flight.to[0] - flight.from[0]) * k;
      const z = flight.from[2] + (flight.to[2] - flight.from[2]) * k;
      const y = flight.from[1] + (flight.to[1] - flight.from[1]) * k + Math.sin(t * Math.PI) * 0.45 + 0.03;
      m.position.set(x, y, z);
      m.rotation.set(t * 9 + i, t * 4, t * 6);
    });
    if (!landed.current && now > flight.at + flight.dur * 0.85) {
      landed.current = true;
      audio.play(flight.sound ? 'coin' : 'chip');
    }
    if (allDone && now > flight.at) {
      finished.current = true;
      onDone();
    }
  });
  return (
    <>
      {colors.map((_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={chipGeo} material={perChip[i]} visible={false} castShadow />
      ))}
    </>
  );
}
