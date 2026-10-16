import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/audioEngine';
import type { Card } from '../../practice/game/types';
import type { FxEvent } from '../fxBus';
import { CAM_LOOK, CAM_POS, CARD_H, CARD_W, communityPos, DECK_POS, MUCK_POS, polar, SEAT, seatAngle, TABLE_Y, type Vec3 } from '../layout';
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
  scale?: number;
  hideFace?: boolean;
}

/** 패 확대 위치: 기본 카메라에서 시선 방향으로 2.6 떨어진 곳, 카메라를 향하도록 기울임 */
const ZOOM_DIST = 2.6;
const camDir = new THREE.Vector3(CAM_LOOK[0] - CAM_POS[0], CAM_LOOK[1] - CAM_POS[1], CAM_LOOK[2] - CAM_POS[2]).normalize();
const ZOOM_POS: Vec3 = [CAM_POS[0] + camDir.x * ZOOM_DIST, CAM_POS[1] + camDir.y * ZOOM_DIST - 0.12, CAM_POS[2] + camDir.z * ZOOM_DIST];
const ZOOM_TILT = Math.PI / 2 - Math.atan2(-camDir.y, -camDir.z);

const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
const glowGeo = new THREE.PlaneGeometry(CARD_W + 0.08, CARD_H + 0.08);

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

export function Cards() {
  const { state, bus, speed, zoomHand } = useScene();
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

    let mucked = 0;
    for (const p of state.players) {
      if (!p.inHand) continue;
      const muckOrder = p.folded ? mucked++ : 0;
      const v = viewOf(state, p.id);
      const a = seatAngle(v);
      const isHero = p.id === state.heroId;
      p.hole.forEach((card, idx) => {
        const key = `h${state.handNumber}-${p.id}-${idx}`;
        const order = deal ? deal.order.findIndex((o) => o.playerId === p.id && o.idx === idx) : -1;
        const appearAt = deal && order >= 0 ? deal.at + order * FX_MS.dealCard * speed : seen(key, now);
        const n = p.hole.length;
        const off = idx - (n - 1) / 2;
        if (p.folded) {
          const layer = muckOrder * n + idx;
          out.push({
            key,
            card,
            faceUp: false,
            pos: [
              MUCK_POS[0] + (hash(key) - 0.5) * 0.06,
              MUCK_POS[1] + layer * 0.004,
              MUCK_POS[2] + (hash(key + 'z') - 0.5) * 0.06,
            ],
            tilt: 0,
            yaw: 0.35 + (hash(key + 'y') - 0.5) * 0.3,
            appearAt,
            highlight: false,
            hero: isHero,
            index: idx,
          });
          return;
        }
        if (isHero) {
          if (zoomHand) {
            // 카메라 바로 앞으로 당겨 크게 본다
            out.push({
              key,
              card,
              faceUp: true,
              pos: [ZOOM_POS[0] + off * 0.62, ZOOM_POS[1] - Math.abs(off) * 0.03, ZOOM_POS[2]],
              tilt: ZOOM_TILT,
              yaw: -off * 0.06,
              appearAt,
              highlight: winners.has(p.id) && showdown,
              hero: true,
              index: idx,
              scale: 1.85,
            });
            return;
          }
          // 내 캐릭터가 얼굴 앞에 들고 있는 패(카메라 쪽으로 기울임)
          const base = polar(a, SEAT.heroHeld, TABLE_Y + 0.62);
          out.push({
            key,
            card,
            faceUp: true,
            pos: [base[0] + off * 0.54, base[1] - Math.abs(off) * 0.03, base[2]],
            tilt: 0.78,
            yaw: -off * 0.1,
            appearAt,
            highlight: winners.has(p.id) && showdown,
            hero: true,
            index: idx,
            scale: 1.55,
          });
          return;
        }
        const tx = -Math.sin(a);
        const tz = Math.cos(a);
        const revealed = (state.revealed[p.id] ?? []).includes(idx) || state.effects.forceRevealed.includes(p.id);
        if (!showdown && !revealed) {
          // 캐릭터가 가슴 앞에 들고 있는 패: 앞면은 캐릭터 쪽, 뒷면이 테이블 쪽을 본다
          const held = polar(a, SEAT.held, TABLE_Y + 0.14);
          out.push({
            key,
            card,
            faceUp: false,
            pos: [held[0] + tx * off * 0.13, held[1] - Math.abs(off) * 0.02, held[2] + tz * off * 0.13],
            tilt: Math.PI / 2 + 0.35,
            yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + off * 0.18,
            appearAt,
            highlight: false,
            hero: false,
            index: idx,
            hideFace: true,
          });
          return;
        }
        const base = polar(a, SEAT.cards, TABLE_Y + 0.008 + idx * 0.004);
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
      // 쇼다운 결과와 보드가 어긋나지 않게, 핸드 종료 시 공용카드는 즉시 공개
      const scheduled = st ? st.at + (i - st.from) * FX_MS.streetCard * speed : seen(key, now);
      const appearAt = showdown ? Math.min(scheduled, now) : scheduled;
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
  }, [state, bus, speed, tick, zoomHand]);

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

  // 남이 들고 있는 패는 앞면 자리에도 뒷면을 그려 어느 각도에서도 숫자가 보이지 않게 한다
  const front = useMemo(() => {
    const map = spec.hideFace ? cardBackTexture() : cardFaceTexture(spec.card);
    return new THREE.MeshToonMaterial({ map, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, gradientMap: toonGradient(), alphaTest: 0.5, side: THREE.FrontSide });
  }, [spec.card, spec.hideFace]);
  const back = useMemo(
    () => new THREE.MeshToonMaterial({ map: cardBackTexture(), gradientMap: toonGradient(), alphaTest: 0.5, side: THREE.FrontSide }),
    [],
  );

  // Suspense 재노출 등으로 다시 실행될 때 이미 나간 카드를 덱으로 되돌려 숨기지 않는다
  useLayoutEffect(() => {
    if (!group.current || started.current) return;
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
    const sc = spec.scale ?? 1;
    easing.damp3(g.scale, [sc, sc, sc], 0.15, step);
    // 확대한 패는 조명 밖에 있으므로 스스로 밝힌다
    easing.damp(front, 'emissiveIntensity', sc > 1.5 ? 0.5 : 0, 0.15, step);
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
