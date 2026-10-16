import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { GameState } from '../practice/game/types';
import type { GraphicsQuality } from '../settings/settings';
import { Avatars } from './avatars/Avatar';
import { BG_COLOR, CasinoRoom } from './environment/CasinoRoom';
import { Effects } from './fx/Effects';
import type { FxBus } from './fxBus';
import { CAM_LOOK as CAM_LOOK_V, CAM_POS as CAM_POS_V, QUALITY } from './layout';
import { SceneContext, useFx, useScene, type SceneData } from './sceneContext';
import { Cards } from './table/Cards';
import { TableChips } from './table/Chips';
import { WoodTable } from './table/WoodTable';
import { useFontsReady } from './useFontsReady';

interface Props {
  state: GameState;
  bus: FxBus;
  busyUntil: { current: number };
  speed: number;
  paused: boolean;
  reduceMotion: boolean;
  quality: GraphicsQuality;
  onHeroCard?: (index: number) => void;
  zoomHand?: boolean;
}

const CAM_POS = new THREE.Vector3(...CAM_POS_V);
const CAM_LOOK = new THREE.Vector3(...CAM_LOOK_V);

function CameraRig() {
  const { reduceMotion, paused } = useScene();
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);
  const shake = useRef(0);
  const zoomUntil = useRef(0);
  const look = useRef(CAM_LOOK.clone());
  const pos = useRef(CAM_POS.clone());

  useFx((e) => {
    const delay = Math.max(0, e.at - performance.now());
    if (e.type === 'bet' && e.allIn) setTimeout(() => (shake.current = 1), delay);
    if (e.type === 'showdown') {
      setTimeout(() => (zoomUntil.current = performance.now() + 2600), delay);
    }
  });

  useFrame(({ clock }, rawDt) => {
    if (paused) return;
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    const k = reduceMotion ? 0 : 1;
    const zoom = performance.now() < zoomUntil.current ? 1 : 0;
    const target = new THREE.Vector3(
      CAM_POS.x + pointer.x * 0.35 * k + Math.sin(t * 0.25) * 0.12 * k,
      CAM_POS.y + pointer.y * 0.15 * k + Math.sin(t * 0.31) * 0.05 * k - zoom * 0.35,
      CAM_POS.z - zoom * 1.1,
    );
    pos.current.lerp(target, 1 - Math.exp(-dt * 2.4));
    camera.position.copy(pos.current);
    if (shake.current > 0 && k) {
      const s = shake.current * 0.06;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      shake.current = Math.max(0, shake.current - dt * 2.2);
    }
    look.current.lerp(new THREE.Vector3(CAM_LOOK.x, CAM_LOOK.y - zoom * 0.05, CAM_LOOK.z - zoom * 0.2), 1 - Math.exp(-dt * 3));
    camera.lookAt(look.current);
  });
  return null;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[TableScene] 3D 렌더링 실패, 2D 테이블로 전환', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function TableScene({ fallback, ...props }: Props & { fallback: ReactNode }) {
  const fontsReady = useFontsReady();
  const q = QUALITY[props.quality];
  const htmlLayer = useMemo(() => {
    const el = document.createElement('div');
    el.className = 'scene3d__html';
    return { current: el };
  }, []);
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!fontsReady) return;
    const wrap = wrapRef.current;
    const layer = htmlLayer.current;
    if (!wrap) return;
    wrap.appendChild(layer);
    return () => {
      layer.remove();
    };
  }, [htmlLayer, fontsReady]);
  useLayoutEffect(() => {
    htmlLayer.current.classList.toggle('is-dim', !!props.zoomHand);
  }, [htmlLayer, props.zoomHand]);
  const ctx = useMemo<SceneData>(
    () => ({
      state: props.state,
      bus: props.bus,
      speed: props.speed,
      reduceMotion: props.reduceMotion,
      paused: props.paused,
      busyUntil: props.busyUntil,
      htmlLayer,
      onHeroCard: props.onHeroCard,
      zoomHand: props.zoomHand,
    }),
    [props.state, props.bus, props.speed, props.reduceMotion, props.paused, props.busyUntil, props.onHeroCard, props.zoomHand, htmlLayer],
  );
  if (!fontsReady) return <div className="scene3d scene3d--loading" />;
  return (
    <SceneBoundary fallback={fallback}>
      <div className="scene3d" ref={wrapRef}>
        <Canvas
          shadows={q.shadows}
          dpr={q.dpr}
          gl={{ antialias: q.antialias, powerPreference: 'high-performance' }}
          camera={{ position: CAM_POS.toArray(), fov: 40, near: 0.1, far: 50 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.98;
            // three r186에서 PCFSoftShadowMap이 제거되어 PCF로 고정한다
            gl.shadowMap.type = THREE.PCFShadowMap;
          }}
        >
          <color attach="background" args={[BG_COLOR]} />
          {/* 가까운 포그로 배경·주변 오브젝트 존재감을 줄이고 테이블로 시선 집중 */}
          <fog attach="fog" args={[BG_COLOR, 7.5, 18]} />
          <SceneContext.Provider value={ctx}>
            <Suspense fallback={null}>
              <CasinoRoom quality={q} />
              <WoodTable />
              <Cards />
              <TableChips />
              <Avatars />
              <Effects />
              <CameraRig />
              {q.post && (
                <EffectComposer multisampling={0}>
                  <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.25} intensity={0.45} mipmapBlur />
                  <Vignette offset={0.22} darkness={0.85} />
                  <SMAA />
                </EffectComposer>
              )}
            </Suspense>
          </SceneContext.Provider>
        </Canvas>
      </div>
    </SceneBoundary>
  );
}
