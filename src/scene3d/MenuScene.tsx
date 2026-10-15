import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { createTable } from '../practice/game/engine';
import type { Card } from '../practice/game/types';
import type { GraphicsQuality } from '../settings/settings';
import { Avatar } from './avatars/Avatar';
import { BG_COLOR, CasinoRoom } from './environment/CasinoRoom';
import { CARD_H, CARD_W, QUALITY, TABLE_Y, type Vec3 } from './layout';
import { toonGradient } from './materials';
import { menuFx } from './menuFx';
import { SceneContext, type SceneData } from './sceneContext';
import { ChipStack } from './table/Chips';
import { TableBody } from './table/WoodTable';
import { cardBackTexture, cardFaceTexture } from './textures';
import { useFontsReady } from './useFontsReady';

interface Props {
  quality: GraphicsQuality;
  reduceMotion: boolean;
}

const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);

function FlatCard({ card, position, yaw = 0 }: { card: Card; position: Vec3; yaw?: number }) {
  const m = useMemo(
    () => ({
      front: new THREE.MeshToonMaterial({ map: cardFaceTexture(card), gradientMap: toonGradient(), alphaTest: 0.5 }),
      back: new THREE.MeshToonMaterial({ map: cardBackTexture(), gradientMap: toonGradient(), alphaTest: 0.5 }),
    }),
    [card],
  );
  // 뒷면이 위로 오게 엎어 둔다
  return (
    <group position={position} rotation={[0, yaw, Math.PI]}>
      <mesh geometry={cardGeo} material={m.front} rotation-x={-Math.PI / 2} position-y={0.002} />
      <mesh geometry={cardGeo} material={m.back} rotation-x={Math.PI / 2} position-y={-0.002} castShadow />
    </group>
  );
}

/** 내 자리 앞에 엎어 둔 두 장과 칩 더미 */
function SeatDressing() {
  return (
    <group>
      <FlatCard card={{ id: 9001, rank: 14, suit: 's' }} position={[-0.16, TABLE_Y + 0.008, 1.32]} yaw={0.12} />
      <FlatCard card={{ id: 9002, rank: 13, suit: 's' }} position={[0.16, TABLE_Y + 0.012, 1.34]} yaw={-0.1} />
      <ChipStack amount={2600} bb={20} position={[0.78, TABLE_Y, 1.22]} />
      <ChipStack amount={940} bb={20} position={[-0.8, TABLE_Y, 1.2]} />
    </group>
  );
}

/** 딜러 자리(테이블 맞은편)에서 내 캐릭터를 정면으로 본다 */
const CAM_BASE = new THREE.Vector3(0, 3.15, -1.1);
const LOOK_BASE = new THREE.Vector3(0, 1.15, 2.7);

function MenuCamera({ still }: { still: boolean }) {
  const camera = useThree((s) => s.camera);
  const mouse = useRef({ x: 0, y: 0 });
  const pos = useRef(CAM_BASE.clone());
  useEffect(() => {
    // 캔버스가 UI 뒤에 있어 포인터 이벤트를 못 받으므로 창 전체에서 읽는다
    const onMove = (e: PointerEvent) => {
      mouse.current.x = e.clientX / window.innerWidth - 0.5;
      mouse.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = still ? 0 : 1;
    const t = clock.elapsedTime;
    // 카메라가 -z 쪽에서 +z를 보므로 화면 오른쪽이 -x
    const target = new THREE.Vector3(
      CAM_BASE.x - mouse.current.x * 0.8 * k + Math.sin(t * 0.11) * 0.35 * k,
      CAM_BASE.y - mouse.current.y * 0.3 * k + Math.sin(t * 0.17) * 0.06 * k,
      CAM_BASE.z,
    );
    pos.current.lerp(target, 1 - Math.exp(-dt * 1.8));
    camera.position.copy(pos.current);
    camera.lookAt(LOOK_BASE);
  });
  return null;
}

class MenuBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[MenuScene] 3D 배경 실패, 2D 배경으로 전환', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 메인 화면 3D 배경: 게임 테이블과 같은 방에 내 캐릭터 혼자 앉아 있다 */
export function MenuScene({ quality, reduceMotion, fallback }: Props & { fallback: ReactNode }) {
  const fontsReady = useFontsReady();
  const q = QUALITY[quality];
  const htmlLayer = useMemo(() => ({ current: document.createElement('div') }), []);
  const ctx = useMemo<SceneData>(() => {
    const state = createTable({
      tableId: 'menu',
      mode: 'normal',
      hero: { name: '나', isHuman: true, chips: 1 },
      others: [],
      smallBlind: 10,
      bigBlind: 20,
      maxBet: null,
    });
    // 대기 중 플레이어는 '폴드' 자세라서 평소 자세로 앉힌다
    for (const p of state.players) p.folded = false;
    return { state, bus: menuFx, speed: 1, reduceMotion, paused: false, busyUntil: { current: 0 }, htmlLayer };
  }, [reduceMotion, htmlLayer]);
  const hero = ctx.state.players[0];

  if (!fontsReady) return <>{fallback}</>;
  return (
    <MenuBoundary fallback={fallback}>
      <Canvas
        className="menu3d__canvas"
        shadows={q.shadows}
        dpr={q.dpr}
        gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
        camera={{ position: CAM_BASE.toArray(), fov: 40, near: 0.1, far: 60 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <fog attach="fog" args={[BG_COLOR, 9, 24]} />
        <SceneContext.Provider value={ctx}>
          <Suspense fallback={null}>
            {/* 슬롯머신과 다른 테이블이 캐릭터 뒤로 오도록 방을 반대로 돌린다 */}
            <group rotation-y={Math.PI}>
              <CasinoRoom quality={q} />
            </group>
            <TableBody />
            <SeatDressing />
            {/* 메인 화면에서는 상체가 보이도록 테이블 쪽으로 당겨 조금 높여 앉힌다 */}
            <group position={[0, 0.36, -0.28]}>{hero && <Avatar player={hero} />}</group>
            <MenuCamera still={reduceMotion} />
            {q.post && (
              <EffectComposer multisampling={0}>
                <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.7} mipmapBlur />
                <Vignette offset={0.3} darkness={0.7} />
                <SMAA />
              </EffectComposer>
            )}
          </Suspense>
        </SceneContext.Provider>
      </Canvas>
    </MenuBoundary>
  );
}
