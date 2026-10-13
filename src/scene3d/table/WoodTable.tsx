import { Outlines } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLORS, toon, toonGradient } from '../materials';
import { DECK_POS, FELT_RADIUS, OUTLINE, polar, seatAngle, TABLE_RADIUS, TABLE_Y } from '../layout';
import { useScene, viewOf } from '../sceneContext';
import { cardBackTexture, feltTexture } from '../textures';

export function WoodTable() {
  return (
    <group>
      <TableBody />
      <DealerButton />
    </group>
  );
}

/** 게임 상태 없이 그릴 수 있는 테이블 본체와 덱 */
export function TableBody() {
  const feltMats = useMemo(() => {
    const side = toon('#1f7a52', { flat: true });
    const top = new THREE.MeshToonMaterial({ map: feltTexture(), gradientMap: toonGradient() });
    return [side, top, side];
  }, []);
  const rim = toon(COLORS.wood, { flat: true });
  const rimDark = toon(COLORS.woodDark, { flat: true });
  const metal = toon('#59636e', { flat: true });

  return (
    <group>
      {/* 상판 테두리 */}
      <mesh position-y={TABLE_Y - 0.13} material={rim} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS - 0.08, 0.2, 24]} />
        <Outlines thickness={0.035} color={OUTLINE} />
      </mesh>
      <mesh position-y={TABLE_Y - 0.24} material={rimDark}>
        <cylinderGeometry args={[TABLE_RADIUS - 0.1, TABLE_RADIUS - 0.3, 0.08, 12]} />
      </mesh>
      {/* 펠트 */}
      <mesh position-y={TABLE_Y - 0.02} material={feltMats} receiveShadow>
        <cylinderGeometry args={[FELT_RADIUS, FELT_RADIUS, 0.03, 48]} />
      </mesh>
      {/* 가죽 패딩 레일 + 금색 띠 */}
      <mesh position-y={TABLE_Y + 0.05} rotation-x={Math.PI / 2} material={toon(COLORS.leather)} castShadow receiveShadow>
        <torusGeometry args={[TABLE_RADIUS - 0.15, 0.14, 10, 48]} />
        <Outlines thickness={0.02} color={OUTLINE} />
      </mesh>
      <mesh position-y={TABLE_Y + 0.012} rotation-x={Math.PI / 2} material={toon(COLORS.gold)}>
        <torusGeometry args={[FELT_RADIUS + 0.02, 0.022, 6, 64]} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <mesh key={i} position={polar(a, TABLE_RADIUS - 0.15, TABLE_Y + 0.17)} material={toon(COLORS.gold, { flat: true })}>
            <sphereGeometry args={[0.018, 6, 4]} />
          </mesh>
        );
      })}
      {/* 술통 받침 */}
      <mesh position-y={0.46} material={toon(COLORS.woodLight, { flat: true })} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.7, 0.92, 10]} />
        <Outlines thickness={0.03} color={OUTLINE} />
      </mesh>
      {[0.18, 0.74].map((y) => (
        <mesh key={y} position-y={y} rotation-x={Math.PI / 2} material={metal}>
          <torusGeometry args={[0.69, 0.035, 4, 12]} />
        </mesh>
      ))}
      <Deck />
    </group>
  );
}

function Deck() {
  const back = useMemo(() => new THREE.MeshToonMaterial({ map: cardBackTexture(), gradientMap: toonGradient() }), []);
  const edge = toon('#fff4dc', { flat: true });
  const mats = useMemo(() => [edge, edge, back, edge, edge, edge], [back, edge]);
  return (
    <mesh position={[DECK_POS[0], DECK_POS[1] + 0.05, DECK_POS[2]]} rotation-y={0.35} material={mats} castShadow>
      <boxGeometry args={[0.36, 0.1, 0.5]} />
      <Outlines thickness={0.015} color={OUTLINE} />
    </mesh>
  );
}

function DealerButton() {
  const { state } = useScene();
  const ref = useRef<THREE.Group>(null);
  const dealer = state.players.find((p) => p.seat === state.dealerSeat && p.inHand);
  const target = useMemo(() => {
    if (!dealer) return null;
    const v = viewOf(state, dealer.id);
    const a = seatAngle(v) + (v === 0 ? 0.7 : 0.42);
    return new THREE.Vector3(...polar(a, 1.42, TABLE_Y + 0.025));
  }, [dealer, state]);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.font = "72px 'Black Han Sans', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D', 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const mats = useMemo(() => {
    const side = toon('#e9e2d0', { flat: true });
    const top = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
    return [side, top, side];
  }, [tex]);
  useFrame((_, dt) => {
    if (!ref.current || !target) return;
    ref.current.position.lerp(target, Math.min(1, dt * 6));
  });
  if (!target) return null;
  return (
    <group ref={ref} position={target}>
      <mesh material={mats} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.05, 20]} />
      </mesh>
    </group>
  );
}
