import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/audioEngine';
import type { Card } from '../../practice/game/types';
import type { FxEvent } from '../fxBus';
import { CARD_H, CARD_W, communityPos, DECK_POS, polar, SEAT, seatAngle, TABLE_Y, type Vec3 } from '../layout';
import { toonGradient } from '../materials';
import { useFx, useScene, viewOf } from '../sceneContext';
import { cardBackTexture, cardFaceTexture } from '../textures';
import { FX_MS } from '../useTableDirector';

interface CardSpec {
  key: string;
  card: Card;
  faceUp: boolean;
  pos: Vec3;
  tilt: number;
  yaw: number;
  appearAt: number;
  highlight: boolean;
  hero: boolean;
  index: number;
}

const MUCK: Vec3 = [0.55, TABLE_Y + 0.01, -0.42];
const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
const glowGeo = new THREE.PlaneGeometry(CARD_W + 0.08, CARD_H + 0.08);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

export function Cards() {
  const { state, bus, speed } = useScene();
  const [tick, setTick] = useState(0);
  useFx((e) => {
    if (e.type === 'deal' || e.type === 'street') setTick((t) => t + 1);
  });
  // 연출 이벤트는 렌더 뒤에 들어오므로 처음 보는 카드는 잠깐 기다린다. 처음 화면에 있던 카드는 바로 보인다
  const firstSeen = useRef(new Map<string, number>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const seen = (key: string, now: number) => {
    let t = firstSeen.current.get(key);
    if (t === undefined) {
      t = mounted.current ? now + 260 : now;
      firstSeen.current.set(key, t);
    }
    return t;
  };
  const specs = useMemo(() => {
    const recent = bus.recent();
    const deal = [...recent].reverse().find((e): e is Extract<FxEvent, { type: 'deal' }> => e.type === 'deal' && e.handNo === state.handNumber);
    const streets = recent.filter((e): e is Extract<FxEvent, { type: 'street' }> => e.type === 'street');
    const now = performance.now();
    const out: CardSpec[] = [];
    const showdown = state.phase === 'handOver' && !!state.result?.showdown;
    const winners = new Set(state.phase === 'handOver' ? (state.result?.winnerIds ?? []) : []);

    for (const p of state.players) {
      if (!p.inHand) continue;
      const v = viewOf(state, p.id);
      const a = seatAngle(v);
      const isHero = p.id === state.heroId;
      p.hole.forEach((card, idx) => {
        const key = `h${state.handNumber}-${p.id}-${idx}`;
        const order = deal ? deal.order.findIndex((o) => o.playerId === p.id && o.idx === idx) : -1;
        const appearAt = deal && order >= 0 ? deal.at + order * FX_MS.dealCard * speed : seen(key, now);
        const n = p.hole.length;
        const off = idx - (n - 1) / 2;
        const muckJitter = hash(key);
        if (p.folded) {
          out.push({
            key,
            card,
            faceUp: false,
            pos: [MUCK[0] + (muckJitter - 0.5) * 0.3, MUCK[1] + idx * 0.004 + muckJitter * 0.01, MUCK[2] + (hash(key + 'z') - 0.5) * 0.25],
            tilt: 0,
            yaw: muckJitter * 6,
            appearAt,
            highlight: false,
            hero: isHero,
            index: idx,
          });
          return;
        }
        if (isHero) {
          const base = polar(a, SEAT.heroCards, TABLE_Y + 0.2);
          out.push({
            key,
            card,
            faceUp: true,
            pos: [base[0] + off * 0.54, base[1] + Math.abs(off) * -0.02, base[2] + Math.abs(off) * 0.02],
            tilt: 0.78,
            yaw: -off * 0.08,
            appearAt,
            highlight: winners.has(p.id) && showdown,
            hero: true,
            index: idx,
          });
          return;
        }
        const base = polar(a, SEAT.cards, TABLE_Y + 0.008 + idx * 0.004);
        const tx = -Math.sin(a);
        const tz = Math.cos(a);
        const revealed = state.revealed[p.id] === idx;
        out.push({
          key,
          card,
          faceUp: (showdown && !p.folded) || revealed,
          pos: [base[0] + tx * off * 0.24, base[1] + (revealed && !showdown ? 0.12 : 0), base[2] + tz * off * 0.24],
          tilt: revealed && !showdown ? 0.5 : 0,
          yaw: Math.PI / 2 - a + off * 0.12,
          appearAt,
          highlight: (winners.has(p.id) && showdown) || (revealed && !showdown),
          hero: false,
          index: idx,
        });
      });
    }

    state.community.forEach((card, i) => {
      const st = [...streets].reverse().find((e) => i >= e.from && i < e.from + e.count);
      const key = `c${state.handNumber}-${i}`;
      const appearAt = st ? st.at + (i - st.from) * FX_MS.streetCard * speed : seen(key, now);
      out.push({
        key,
        card,
        faceUp: true,
        pos: communityPos(i),
        tilt: 0,
        yaw: 0,
        appearAt,
        highlight: false,
        hero: false,
        index: i,
      });
    });
    return out;
  }, [state, bus, speed, tick]);

  return (
    <>
      {specs.map((s) => (
        <Card3D key={s.key} spec={s} />
      ))}
    </>
  );
}

const tmp = new THREE.Vector3();

function Card3D({ spec }: { spec: CardSpec }) {
  const { paused, reduceMotion, onHeroCard } = useScene();
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const started = useRef(false);
  const [hover, setHover] = useState(false);
  const clickable = spec.hero && !!onHeroCard;

  const front = useMemo(
    () => new THREE.MeshToonMaterial({ map: cardFaceTexture(spec.card), gradientMap: toonGradient(), alphaTest: 0.5, side: THREE.FrontSide }),
    [spec.card],
  );
  const back = useMemo(
    () => new THREE.MeshToonMaterial({ map: cardBackTexture(), gradientMap: toonGradient(), alphaTest: 0.5, side: THREE.FrontSide }),
    [],
  );

  useLayoutEffect(() => {
    if (!group.current) return;
    group.current.rotation.order = 'YXZ';
    group.current.position.set(...DECK_POS);
    group.current.rotation.set(0, 0.35, Math.PI);
    group.current.visible = false;
  }, []);

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g || paused) return;
    if (!started.current) {
      if (performance.now() < spec.appearAt) return;
      started.current = true;
      g.visible = true;
      if (spec.key.startsWith('h')) audio.play('cardDeal');
    }
    tmp.set(...spec.pos);
    if (clickable && hover) tmp.y += 0.08;
    const dist = g.position.distanceTo(tmp);
    tmp.y += Math.min(reduceMotion ? 0.1 : 0.55, dist * 0.42);
    const step = Math.min(dt, 0.05);
    easing.damp3(g.position, tmp, 0.11, step);
    easing.dampE(g.rotation, [spec.tilt, spec.yaw, spec.faceUp ? 0 : Math.PI], 0.13, step);
    const sc = spec.hero && !spec.key.includes('-muck') && spec.faceUp ? 1.4 : 1;
    easing.damp3(g.scale, [sc, sc, sc], 0.15, step);
    if (glow.current) {
      const m = glow.current.material as THREE.MeshBasicMaterial;
      const on = spec.highlight || clickable;
      m.opacity = on ? 0.55 + Math.sin(clock.elapsedTime * 5) * 0.25 : 0;
      glow.current.visible = on;
    }
  });

  return (
    <group
      ref={group}
      onPointerOver={clickable ? (e) => (e.stopPropagation(), setHover(true)) : undefined}
      onPointerOut={clickable ? () => setHover(false) : undefined}
      onClick={clickable ? (e) => (e.stopPropagation(), onHeroCard?.(spec.index)) : undefined}
    >
      <mesh geometry={geo} material={front} rotation-x={-Math.PI / 2} position-y={0.002} castShadow />
      <mesh geometry={geo} material={back} rotation-x={Math.PI / 2} position-y={-0.002} />
      <mesh ref={glow} geometry={glowGeo} rotation-x={-Math.PI / 2} position-y={-0.004} visible={false}>
        <meshBasicMaterial color={clickable ? '#c0c7d1' : '#ffd84a'} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
