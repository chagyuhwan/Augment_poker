import { SceneHtml } from '../SceneHtml';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { AugmentTier } from '../../practice/game/types';
import type { FxEvent } from '../fxBus';
import { polar, SEAT, seatAngle, TABLE_Y, type Vec3 } from '../layout';
import { useFx, useScene, viewOf, stackPoint } from '../sceneContext';

interface Burst {
  id: number;
  at: number;
  pos: Vec3;
  big: boolean;
}
interface Pillar {
  id: number;
  at: number;
  dur: number;
  pos: Vec3;
  tier: AugmentTier;
}
interface Popup {
  id: number;
  delay: number;
  pos: Vec3;
  text: string;
  kind: 'plus' | 'minus' | 'allin' | 'augment' | 'tier-silver' | 'tier-gold' | 'tier-prismatic';
}

let fxId = 1;

/** 화면 위치(본인은 앞쪽 카드 근처, 봇은 캐릭터 위치) */
function actorPoint(state: ReturnType<typeof useScene>['state'], playerId: number, y: number): Vec3 {
  const v = viewOf(state, playerId);
  return polar(seatAngle(v), v === 0 ? SEAT.heroCards + 0.1 : SEAT.avatar, y);
}

export function Effects() {
  const { state, reduceMotion } = useScene();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);

  useFx((e: FxEvent) => {
    const s = stateRef.current;
    const now = performance.now();
    if (e.type === 'award') {
      const b: Burst[] = [];
      const p: Popup[] = [];
      for (const w of e.winners) {
        const hero = w.playerId === s.heroId;
        if (!reduceMotion) b.push({ id: fxId++, at: e.at + 250, pos: hero ? actorPoint(s, w.playerId, TABLE_Y + 0.3) : stackPoint(s, w.playerId), big: hero });
        if (w.amount > 0) p.push({ id: fxId++, delay: e.at + 400 - now, pos: actorPoint(s, w.playerId, TABLE_Y + 1.15), text: `+${w.amount.toLocaleString()}`, kind: 'plus' });
      }
      setBursts((x) => [...x, ...b]);
      setPopups((x) => [...x, ...p]);
    } else if (e.type === 'augment') {
      const pos = actorPoint(s, e.playerId, 0);
      setPillars((x) => [...x, { id: fxId++, at: e.at, dur: Math.max(900, e.dur + 400), pos, tier: e.tier }]);
      setPopups((x) => [...x, { id: fxId++, delay: e.at - now, pos: [pos[0], TABLE_Y + 1.35, pos[2]], text: e.name, kind: `tier-${e.tier}` }]);
    } else if (e.type === 'bet' && e.allIn) {
      setPopups((x) => [...x, { id: fxId++, delay: e.at - now, pos: actorPoint(s, e.playerId, TABLE_Y + 1.3), text: '올인!', kind: 'allin' }]);
    }
  });

  return (
    <>
      {bursts.map((b) => (
        <CoinBurst key={b.id} burst={b} onDone={() => setBursts((x) => x.filter((y) => y.id !== b.id))} />
      ))}
      {pillars.map((p) => (
        <LightPillar key={p.id} pillar={p} onDone={() => setPillars((x) => x.filter((y) => y.id !== p.id))} />
      ))}
      {popups.map((p) => (
        <SceneHtml key={p.id} position={p.pos} center zIndexRange={[12, 0]}>
          <div
            className={`fx-pop fx-pop--${p.kind}`}
            style={{ animationDelay: `${Math.max(0, p.delay)}ms` }}
            onAnimationEnd={() => setPopups((x) => x.filter((y) => y.id !== p.id))}
          >
            {p.text}
          </div>
        </SceneHtml>
      ))}
    </>
  );
}

const CONFETTI = ['#ff6b5b', '#ffc93c', '#2ec4d6', '#5fd38a', '#c79bff', '#fff7e6'];
const coinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.018, 12);
const confettiGeo = new THREE.PlaneGeometry(0.06, 0.035);
const coinMat = new THREE.MeshToonMaterial({ color: '#ffc93c', emissive: new THREE.Color('#8a5a00'), emissiveIntensity: 0.4 });
const confettiMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
}

const tmpO = new THREE.Object3D();

function CoinBurst({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  const coins = useRef<THREE.InstancedMesh>(null);
  const confetti = useRef<THREE.InstancedMesh>(null);
  const nCoins = burst.big ? 28 : 14;
  const nConf = burst.big ? 70 : 30;
  const done = useRef(false);
  const parts = useMemo(() => {
    const mk = (n: number, speed: number) =>
      Array.from({ length: n }, () => {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.5 + Math.random() * 0.7);
        return {
          p: new THREE.Vector3(...burst.pos),
          v: new THREE.Vector3(Math.cos(a) * s * 0.5, speed * (1.1 + Math.random() * 0.9), Math.sin(a) * s * 0.5),
          r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        } satisfies Particle;
      });
    return { coins: mk(nCoins, 2.4), conf: mk(nConf, 2.9) };
  }, [burst, nCoins, nConf]);

  useLayoutEffect(() => {
    const c = confetti.current;
    if (!c) return;
    const col = new THREE.Color();
    for (let i = 0; i < nConf; i++) c.setColorAt(i, col.set(CONFETTI[i % CONFETTI.length]));
    if (c.instanceColor) c.instanceColor.needsUpdate = true;
  }, [nConf]);

  useFrame((_, rawDt) => {
    if (done.current) return;
    const now = performance.now();
    const age = (now - burst.at) / 1000;
    const vis = age >= 0;
    if (coins.current) coins.current.visible = vis;
    if (confetti.current) confetti.current.visible = vis;
    if (!vis) return;
    if (age > 2.4) {
      done.current = true;
      onDone();
      return;
    }
    const dt = Math.min(rawDt, 0.05);
    const step = (list: Particle[], mesh: THREE.InstancedMesh | null, drag: number, floor: number) => {
      if (!mesh) return;
      list.forEach((q, i) => {
        q.v.y -= 6.5 * dt;
        q.v.multiplyScalar(1 - drag * dt);
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < floor) {
          q.p.y = floor;
          q.v.y *= -0.35;
          q.v.x *= 0.6;
          q.v.z *= 0.6;
        }
        q.r.x += q.w.x * dt;
        q.r.y += q.w.y * dt;
        q.r.z += q.w.z * dt;
        const fade = age > 1.8 ? Math.max(0.001, 1 - (age - 1.8) / 0.6) : 1;
        tmpO.position.copy(q.p);
        tmpO.rotation.copy(q.r);
        tmpO.scale.setScalar(fade);
        tmpO.updateMatrix();
        mesh.setMatrixAt(i, tmpO.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    step(parts.coins, coins.current, 0.4, TABLE_Y + 0.01);
    step(parts.conf, confetti.current, 2.6, TABLE_Y + 0.005);
  });

  return (
    <>
      <instancedMesh ref={coins} args={[coinGeo, coinMat, nCoins]} visible={false} frustumCulled={false} castShadow />
      <instancedMesh ref={confetti} args={[confettiGeo, confettiMat, nConf]} visible={false} frustumCulled={false} />
    </>
  );
}

const TIER_COLOR: Record<AugmentTier, string> = { silver: '#d6e2f0', gold: '#ffc93c', prismatic: '#ff7ad9' };
const pillarGeo = new THREE.CylinderGeometry(0.42, 0.55, 5, 20, 1, true);
pillarGeo.translate(0, 2.5, 0);

function LightPillar({ pillar, onDone }: { pillar: Pillar; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Points>(null);
  const done = useRef(false);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(TIER_COLOR[pillar.tier]) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uRainbow: { value: pillar.tier === 'prismatic' ? 1 : 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uRainbow;
          varying vec2 vUv;
          vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
          void main() {
            float fade = pow(1.0 - vUv.y, 1.6);
            float stripes = 0.75 + 0.25 * sin(vUv.x * 40.0 + uTime * 6.0);
            vec3 c = mix(uColor, hue(vUv.y * 0.8 + uTime * 0.3 + vUv.x), uRainbow);
            gl_FragColor = vec4(c * 1.6, fade * stripes * uAlpha);
          }
        `,
      }),
    [pillar.tier],
  );
  const sparkGeo = useMemo(() => {
    const n = 60;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.15 + Math.random() * 0.45;
      arr.set([Math.cos(a) * r, Math.random() * 3, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame(({ clock }, dt) => {
    if (done.current) return;
    const t = (performance.now() - pillar.at) / pillar.dur;
    const m = ref.current;
    if (!m) return;
    m.visible = t >= 0;
    if (sparks.current) sparks.current.visible = t >= 0;
    if (t < 0) return;
    if (t > 1) {
      done.current = true;
      onDone();
      return;
    }
    const a = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
    mat.uniforms.uAlpha.value = a * 0.85;
    mat.uniforms.uTime.value = clock.elapsedTime;
    m.scale.set(0.6 + a * 0.4, 0.3 + Math.min(1, t * 4) * 0.7, 0.6 + a * 0.4);
    if (sparks.current) {
      const pos = sparkGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (1.2 + (i % 5) * 0.3);
        if (y > 3.2) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      (sparks.current.material as THREE.PointsMaterial).opacity = a;
    }
  });

  return (
    <group position={pillar.pos}>
      <mesh ref={ref} geometry={pillarGeo} material={mat} visible={false} />
      <points ref={sparks} geometry={sparkGeo} visible={false}>
        <pointsMaterial color={TIER_COLOR[pillar.tier]} size={0.07} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </group>
  );
}
