import { Outlines, Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OUTLINE, type QualityProfile } from '../layout';
import { COLORS, toon } from '../materials';
import { carpetTexture, wallTexture } from '../textures';

const ROOM_R = 13;
const ROOM_H = 8;
export const BG_COLOR = '#14050b';

export function CasinoRoom({ quality }: { quality: QualityProfile }) {
  return (
    <>
      <RoomLights quality={quality} />
      <Shell />
      <PendantLamp position={[0, 3.6, 0]} main />
      <BackTable position={[-7.2, 0, -5.8]} rot={0.4} />
      <BackTable position={[7.4, 0, -5.2]} rot={-0.3} />
      <BackTable position={[0.6, 0, -10.2]} rot={0.1} />
      <SlotRow />
      <Stanchions />
      {quality.post && <Sparkles count={70} scale={[4.5, 2.6, 4.5]} position={[0, 2.3, 0]} size={2.2} speed={0.18} color="#ffd98a" opacity={0.55} />}
    </>
  );
}

function RoomLights({ quality }: { quality: QualityProfile }) {
  const spot = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 1, -0.1);
    return o;
  }, []);
  useFrame(({ clock }) => {
    if (!spot.current) return;
    const t = clock.elapsedTime;
    // 아주 약한 깜빡임(전구 느낌)
    spot.current.intensity = 26 * (1 + Math.sin(t * 13) * 0.008 + Math.sin(t * 2.1) * 0.015);
  });
  return (
    <>
      <hemisphereLight args={['#8a3346', '#12040a', 0.55]} />
      <ambientLight color="#3a1018" intensity={0.35} />
      {/* 카메라 쪽 은은한 보조광: 캐릭터 얼굴이 너무 어둡지 않게 */}
      <directionalLight position={[0, 5, 8]} intensity={0.45} color="#ffd9b0" />
      <primitive object={target} />
      <spotLight
        ref={spot}
        position={[0, 3.45, 0]}
        target={target}
        angle={0.95}
        penumbra={0.55}
        distance={12}
        decay={1.6}
        intensity={26}
        color="#fff0d6"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMap}
        shadow-mapSize-height={quality.shadowMap}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
    </>
  );
}

function Shell() {
  const wall = useMemo(() => {
    const m = new THREE.MeshToonMaterial({ map: wallTexture(), side: THREE.BackSide });
    return m;
  }, []);
  const floor = useMemo(() => new THREE.MeshToonMaterial({ map: carpetTexture() }), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={floor} receiveShadow>
        <circleGeometry args={[ROOM_R + 0.5, 48]} />
      </mesh>
      {/* 테이블 밑 원형 러그 */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow material={toon('#2a0a14')}>
        <circleGeometry args={[3.7, 40]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.014} material={toon(COLORS.gold)}>
        <ringGeometry args={[3.45, 3.58, 40]} />
      </mesh>
      <mesh position-y={ROOM_H / 2} material={wall}>
        <cylinderGeometry args={[ROOM_R, ROOM_R, ROOM_H, 48, 1, true]} />
      </mesh>
      {/* 징두리 판벽 + 금색 난간 */}
      <mesh position-y={0.75} material={toon(COLORS.woodDark, { flat: true })}>
        <cylinderGeometry args={[ROOM_R - 0.06, ROOM_R - 0.06, 1.5, 48, 1, true]} />
      </mesh>
      <mesh position-y={1.52} rotation-x={Math.PI / 2} material={toon(COLORS.gold)}>
        <torusGeometry args={[ROOM_R - 0.1, 0.06, 6, 64]} />
      </mesh>
      <mesh position-y={ROOM_H - 0.4} rotation-x={Math.PI / 2} material={toon(COLORS.gold)}>
        <torusGeometry args={[ROOM_R - 0.1, 0.09, 6, 64]} />
      </mesh>
      <mesh position-y={ROOM_H} rotation-x={Math.PI / 2} material={toon('#12040a')}>
        <circleGeometry args={[ROOM_R + 0.2, 48]} />
      </mesh>
      {/* 기둥 */}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.31;
        return (
          <group key={i} position={[Math.cos(a) * (ROOM_R - 0.45), 0, Math.sin(a) * (ROOM_R - 0.45)]} rotation-y={-a}>
            <mesh position-y={ROOM_H / 2} material={toon('#3a0f1b', { flat: true })}>
              <boxGeometry args={[0.6, ROOM_H, 0.6]} />
            </mesh>
            <mesh position-y={ROOM_H - 0.7} material={toon(COLORS.gold, { flat: true })}>
              <boxGeometry args={[0.78, 0.22, 0.78]} />
            </mesh>
            <mesh position-y={0.15} material={toon(COLORS.gold, { flat: true })}>
              <boxGeometry args={[0.78, 0.3, 0.78]} />
            </mesh>
            {/* 벽등 */}
            <mesh position={[0.36, 2.6, 0]} material={toon('#fff2c4', { emissive: '#ffcf7a', emissiveIntensity: 2.2 })}>
              <sphereGeometry args={[0.11, 10, 8]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function PendantLamp({ position, main = false }: { position: THREE.Vector3Tuple; main?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.6) * 0.012;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.45 + 1) * 0.01;
  });
  const shade = useMemo(() => toon('#1d5a3c', { flat: true }), []);
  const s = main ? 1 : 0.7;
  return (
    <group ref={ref} position={position}>
      <mesh position-y={(ROOM_H - position[1]) / 2} material={toon('#0e0306')}>
        <cylinderGeometry args={[0.02, 0.02, ROOM_H - position[1], 6]} />
      </mesh>
      <group scale={s}>
        <mesh material={shade} castShadow={false}>
          <cylinderGeometry args={[0.32, 1.05, 0.5, 12, 1, true]} />
          <Outlines thickness={0.03} color={OUTLINE} />
        </mesh>
        <mesh position-y={0.25} material={shade}>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 12]} />
        </mesh>
        <mesh position-y={-0.25} rotation-x={Math.PI / 2} material={toon(COLORS.gold)}>
          <torusGeometry args={[1.05, 0.045, 6, 24]} />
        </mesh>
        <mesh position-y={-0.08} material={toon('#fff6d6', { emissive: '#ffd27a', emissiveIntensity: 3 })}>
          <sphereGeometry args={[0.17, 12, 10]} />
        </mesh>
        {/* 안쪽 면(밝은 노란빛) */}
        <mesh>
          <cylinderGeometry args={[0.3, 1.02, 0.48, 12, 1, true]} />
          <meshBasicMaterial color="#ffd98a" side={THREE.BackSide} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function BackTable({ position, rot }: { position: THREE.Vector3Tuple; rot: number }) {
  return (
    <group position={position} rotation-y={rot}>
      <mesh position-y={0.92} material={toon('#5a2414', { flat: true })}>
        <cylinderGeometry args={[1.7, 1.62, 0.18, 12]} />
        <Outlines thickness={0.03} color={OUTLINE} />
      </mesh>
      <mesh position-y={1.02} material={toon('#17613f')}>
        <cylinderGeometry args={[1.45, 1.45, 0.03, 24]} />
      </mesh>
      <mesh position-y={0.45} material={toon('#3a160b', { flat: true })}>
        <cylinderGeometry args={[0.45, 0.55, 0.9, 8]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 2.1, 0.3, Math.sin(a) * 2.1]} material={toon('#7a1f33', { flat: true })}>
            <cylinderGeometry args={[0.24, 0.26, 0.6, 8]} />
          </mesh>
        );
      })}
      <PendantLamp position={[0, 3.3, 0]} />
      <pointLight position={[0, 2.6, 0]} intensity={9} distance={5} decay={1.5} color="#ffd9a0" />
    </group>
  );
}

const SLOT_COLORS = ['#ff4d6d', '#ffd84a', '#4dd6ff', '#9b6bff', '#5fe0a0'];

function SlotRow() {
  const screens = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    screens.current.forEach((m, i) => {
      if (!m) return;
      const k = 0.6 + 0.4 * Math.max(0, Math.sin(t * (1.3 + i * 0.37) + i));
      m.color.set(SLOT_COLORS[(i + Math.floor(t / 2.5)) % SLOT_COLORS.length]).multiplyScalar(k * 1.6);
    });
  });
  const angles = [-2.25, -2.05, -1.85, -1.29, -1.09, -0.89];
  return (
    <>
      {angles.map((a, i) => (
        <group key={i} position={[Math.cos(a) * (ROOM_R - 1.4), 0, Math.sin(a) * (ROOM_R - 1.4)]} rotation-y={-a - Math.PI / 2}>
          <mesh position-y={0.95} material={toon('#2a0a14', { flat: true })}>
            <boxGeometry args={[0.9, 1.9, 0.7]} />
            <Outlines thickness={0.025} color={OUTLINE} />
          </mesh>
          <mesh position={[0, 1.95, 0]} material={toon(COLORS.gold, { flat: true })}>
            <boxGeometry args={[0.95, 0.18, 0.75]} />
          </mesh>
          <mesh position={[0, 1.25, 0.36]}>
            <planeGeometry args={[0.68, 0.5]} />
            <meshBasicMaterial ref={(m) => void (screens.current[i] = m!)} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.75, 0.37]} material={toon('#f2c14e', { emissive: '#ff9a2a', emissiveIntensity: 0.8 })}>
            <boxGeometry args={[0.5, 0.1, 0.04]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Stanchions() {
  const posts: THREE.Vector3Tuple[] = [
    [-4.6, 0, 2.2],
    [-5.1, 0, -0.6],
    [-4.4, 0, -3.3],
    [4.6, 0, 2.2],
    [5.1, 0, -0.6],
    [4.4, 0, -3.3],
  ];
  const ropes = useMemo(() => {
    const out: THREE.TubeGeometry[] = [];
    for (let i = 0; i < posts.length; i++) {
      if (i === 2) continue;
      const a = new THREE.Vector3(posts[i][0], 0.95, posts[i][2]);
      const b = new THREE.Vector3(posts[(i + 1) % posts.length][0], 0.95, posts[(i + 1) % posts.length][2]);
      if (a.distanceTo(b) > 4) continue;
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.32;
      out.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.035, 6));
    }
    return out;
    // posts는 상수
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {posts.map((p, i) => (
        <group key={i} position={p}>
          <mesh position-y={0.5} material={toon(COLORS.gold, { flat: true })} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 1, 8]} />
          </mesh>
          <mesh position-y={0.04} material={toon(COLORS.gold, { flat: true })}>
            <cylinderGeometry args={[0.18, 0.2, 0.08, 10]} />
          </mesh>
          <mesh position-y={1.02} material={toon(COLORS.gold, { flat: true })}>
            <sphereGeometry args={[0.07, 8, 6]} />
          </mesh>
        </group>
      ))}
      {ropes.map((g, i) => (
        <mesh key={i} geometry={g} material={toon('#a3243c')} />
      ))}
    </>
  );
}
