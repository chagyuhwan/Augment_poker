import { Outlines } from '@react-three/drei';
import { SceneHtml } from '../SceneHtml';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { useRef } from 'react';
import * as THREE from 'three';
import { AUGMENTS, TIER_LABEL } from '../../practice/game/augments';
import type { Player } from '../../practice/game/types';
import { AVATAR_STYLES, faceCenter, OUTLINE, polar, SEAT, seatAngle, viewIndexOf, type HatKind } from '../layout';
import { COLORS, toon } from '../materials';
import { useFx, useScene, viewOf } from '../sceneContext';

type Transient = { kind: 'bet' | 'allin' | 'check' | 'fold' | 'win' | 'lose' | 'augment'; start: number; end: number };

const STATUS_LABEL: Partial<Record<Player['status'], string>> = {
  waiting: '다음 판 대기',
  leaving: '퇴장 예정',
  busted: '게임머니 소진',
};

export function Avatars() {
  const { state } = useScene();
  const hero = state.players.find((p) => p.id === state.heroId);
  const taken = new Set(state.players.map((p) => p.seat));
  const empty: number[] = [];
  for (let s = 0; s < state.maxSeats; s++) if (!taken.has(s)) empty.push(viewIndexOf(s, hero?.seat ?? 0, state.maxSeats));
  return (
    <>
      {state.players.map((p) => <Avatar key={p.id} player={p} />)}
      {empty.filter((v) => v !== 0).map((v) => (
        <EmptyStool key={`e${v}`} view={v} />
      ))}
    </>
  );
}

function Stool() {
  return (
    <group>
      <mesh position-y={0.27} material={toon(COLORS.woodLight, { flat: true })} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.27, 0.54, 8]} />
        <Outlines thickness={0.02} color={OUTLINE} />
      </mesh>
      {[0.1, 0.44].map((y) => (
        <mesh key={y} position-y={y} rotation-x={Math.PI / 2} material={toon('#59636e', { flat: true })}>
          <torusGeometry args={[0.265, 0.02, 4, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function EmptyStool({ view }: { view: number }) {
  const a = seatAngle(view);
  return (
    <group position={polar(a, SEAT.avatar, 0)} rotation-y={faceCenter(a)}>
      <Stool />
      <SceneHtml position={[0, 0.95, 0]} center zIndexRange={[6, 0]}>
        <div className="seat3d seat3d--empty">빈 자리</div>
      </SceneHtml>
    </group>
  );
}

function Hat({ kind, color }: { kind: HatKind; color: string }) {
  const m = toon(color, { flat: true });
  const dark = toon('#1b2a3a', { flat: true });
  switch (kind) {
    case 'cap':
      return (
        <group position-y={0.2}>
          <mesh material={m} position-y={0.05} castShadow>
            <boxGeometry args={[0.43, 0.12, 0.43]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={m} position={[0, 0, 0.3]}>
            <boxGeometry args={[0.36, 0.035, 0.2]} />
            <Outlines thickness={0.012} color={OUTLINE} />
          </mesh>
        </group>
      );
    case 'straw':
      return (
        <group position-y={0.21}>
          <mesh material={m} castShadow>
            <cylinderGeometry args={[0.42, 0.44, 0.04, 10]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={m} position-y={0.1}>
            <cylinderGeometry args={[0.2, 0.23, 0.18, 8]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={toon(COLORS.coral, { flat: true })} position-y={0.04}>
            <cylinderGeometry args={[0.235, 0.235, 0.05, 8]} />
          </mesh>
        </group>
      );
    case 'bucket':
      return (
        <group position-y={0.22}>
          <mesh material={m} castShadow position-y={0.06}>
            <cylinderGeometry args={[0.2, 0.25, 0.18, 8]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={m} position-y={-0.03}>
            <cylinderGeometry args={[0.3, 0.33, 0.04, 8]} />
            <Outlines thickness={0.012} color={OUTLINE} />
          </mesh>
        </group>
      );
    case 'bandana':
      return (
        <group position-y={0.17}>
          <mesh material={m} castShadow>
            <boxGeometry args={[0.43, 0.1, 0.43]} />
            <Outlines thickness={0.012} color={OUTLINE} />
          </mesh>
          <mesh material={m} position={[0, -0.04, -0.25]} rotation-x={0.6}>
            <boxGeometry args={[0.1, 0.16, 0.05]} />
          </mesh>
        </group>
      );
    case 'beanie':
      return (
        <group position-y={0.19}>
          <mesh material={m} castShadow position-y={0.04}>
            <boxGeometry args={[0.42, 0.16, 0.42]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={toon('#fff7e6', { flat: true })} position-y={0.17}>
            <icosahedronGeometry args={[0.07, 0]} />
            <Outlines thickness={0.01} color={OUTLINE} />
          </mesh>
        </group>
      );
    case 'captain':
      return (
        <group position-y={0.21}>
          <mesh material={toon('#f7f7f2', { flat: true })} castShadow position-y={0.06}>
            <cylinderGeometry args={[0.25, 0.22, 0.14, 10]} />
            <Outlines thickness={0.015} color={OUTLINE} />
          </mesh>
          <mesh material={dark} position-y={-0.01}>
            <cylinderGeometry args={[0.225, 0.225, 0.05, 10]} />
          </mesh>
          <mesh material={dark} position={[0, -0.02, 0.24]}>
            <boxGeometry args={[0.3, 0.03, 0.14]} />
          </mesh>
          <mesh material={toon(COLORS.gold, { emissive: '#ffb300', emissiveIntensity: 0.3 })} position={[0, 0.06, 0.24]}>
            <octahedronGeometry args={[0.04, 0]} />
          </mesh>
        </group>
      );
  }
}

function Avatar({ player }: { player: Player }) {
  const { state, paused, reduceMotion } = useScene();
  const v = viewOf(state, player.id);
  const a = seatAngle(v);
  const isHero = player.id === state.heroId;
  const style = AVATAR_STYLES[player.id % AVATAR_STYLES.length];
  const seed = player.id * 1.7;

  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const cloud = useRef<THREE.Group>(null);
  const transient = useRef<Transient | null>(null);
  const awardAt = useRef(0);

  useFx((e) => {
    const set = (kind: Transient['kind'], extra = 0) => (transient.current = { kind, start: e.at, end: e.at + Math.max(e.dur, 380) + extra });
    if (e.type === 'bet' && e.playerId === player.id) set(e.allIn ? 'allin' : 'bet', e.allIn ? 500 : 0);
    else if (e.type === 'check' && e.playerId === player.id) set('check', 200);
    else if (e.type === 'fold' && e.playerId === player.id) set('fold', 200);
    else if (e.type === 'augment' && e.playerId === player.id) set('augment', 600);
    else if (e.type === 'award') awardAt.current = e.at;
  });

  const skin = toon(style.skin, { flat: true });
  const shirt = toon(style.shirt, { flat: true });
  const pants = toon(style.pants, { flat: true });
  const black = toon('#101820');

  const isTurn = state.phase === 'betting' && state.currentPlayer === player.id;
  const handOver = state.phase === 'handOver';
  const isWinner = handOver && !!state.result?.winnerIds.includes(player.id);
  const lost = handOver && player.inHand && !isWinner && (state.result?.net[player.id] ?? 0) < 0;
  const busted = player.status === 'busted';
  const persistent = busted ? 'busted' : isWinner ? 'win' : lost ? 'lose' : player.folded ? 'folded' : isTurn ? 'think' : player.status === 'waiting' ? 'away' : 'idle';

  useFrame(({ clock }, rawDt) => {
    if (paused) return;
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime + seed;
    const now = performance.now();
    const tr = transient.current && now >= transient.current.start && now <= transient.current.end ? transient.current : null;
    let pose: string = persistent;
    if ((pose === 'win' || pose === 'lose') && now < awardAt.current) pose = 'idle';
    if (tr) pose = tr.kind;
    const k = reduceMotion ? 0.3 : 1;

    // 기본값
    let rootY = 0;
    let torsoX = 0;
    let headX = 0;
    let headZ = Math.sin(t * 0.7) * 0.05 * k;
    let headY = Math.sin(t * 0.43) * 0.12 * k;
    let lX = -1.1;
    let lZ = 0.12;
    let rX = -1.1;
    let rZ = -0.12;
    const breathe = 1 + Math.sin(t * 2.1) * 0.02 * k;

    switch (pose) {
      case 'think':
        rX = -2.5;
        rZ = 0.45;
        headX = 0.12;
        headZ = 0.18 + Math.sin(t * 1.4) * 0.06 * k;
        headY = 0;
        break;
      case 'folded':
        torsoX = -0.12;
        lX = -0.2;
        rX = -0.2;
        headX = 0.12;
        break;
      case 'away':
        torsoX = -0.18;
        lX = -2.9;
        rX = -2.9;
        lZ = -0.6;
        rZ = 0.6;
        headX = -0.25;
        break;
      case 'bet':
        rX = -1.55 + Math.sin(((now - (tr?.start ?? 0)) / 400) * Math.PI) * -0.25;
        torsoX = 0.12;
        break;
      case 'allin':
        lX = -1.6;
        rX = -1.6;
        lZ = -0.15;
        rZ = 0.15;
        torsoX = 0.22;
        rootY = Math.abs(Math.sin(t * 9)) * 0.1 * k;
        headX = -0.1;
        break;
      case 'check':
        rX = -1.15 + Math.max(0, Math.sin(t * 26)) * 0.35;
        break;
      case 'fold':
        rX = -1.9;
        rZ = -0.5;
        torsoX = -0.1;
        headY = -0.3;
        break;
      case 'augment':
        lX = -2.7;
        rX = -2.7;
        lZ = 0.3;
        rZ = -0.3;
        rootY = Math.abs(Math.sin(t * 7)) * 0.08 * k;
        headX = -0.2;
        break;
      case 'win':
        lX = -2.9 + Math.sin(t * 12) * 0.25 * k;
        rX = -2.9 - Math.sin(t * 12) * 0.25 * k;
        lZ = 0.45;
        rZ = -0.45;
        rootY = Math.abs(Math.sin(t * 8)) * 0.16 * k;
        headX = -0.2;
        headY = Math.sin(t * 6) * 0.25 * k;
        break;
      case 'lose':
        torsoX = 0.28;
        headX = 0.5;
        lX = -0.35;
        rX = -0.35;
        headY = Math.sin(t * 1.3) * 0.25 * k;
        break;
      case 'busted':
        torsoX = 0.4;
        headX = 0.6;
        lX = -0.1;
        rX = -0.1;
        rootY = -0.08;
        headY = 0;
        break;
    }

    if (root.current) easing.damp(root.current.position, 'y', rootY, 0.06, dt);
    if (torso.current) {
      easing.damp(torso.current.rotation, 'x', torsoX, 0.12, dt);
      torso.current.scale.y = breathe;
    }
    if (head.current) {
      easing.damp(head.current.rotation, 'x', headX, 0.1, dt);
      easing.damp(head.current.rotation, 'y', headY, 0.15, dt);
      easing.damp(head.current.rotation, 'z', headZ, 0.15, dt);
    }
    if (armL.current) {
      easing.damp(armL.current.rotation, 'x', lX, 0.08, dt);
      easing.damp(armL.current.rotation, 'z', lZ, 0.1, dt);
    }
    if (armR.current) {
      easing.damp(armR.current.rotation, 'x', rX, 0.08, dt);
      easing.damp(armR.current.rotation, 'z', rZ, 0.1, dt);
    }
    if (eyes.current) {
      const blink = (t % 3.7) < 0.12 || pose === 'busted';
      eyes.current.scale.y = blink ? 0.15 : pose === 'win' ? 0.6 : 1;
    }
    if (ring.current) {
      ring.current.visible = isTurn;
      const s = 1 + Math.sin(t * 6) * 0.06;
      ring.current.scale.set(s, s, 1);
      ring.current.rotation.z = t * 0.8;
    }
    if (cloud.current) {
      cloud.current.visible = busted;
      cloud.current.position.y = 2.05 + Math.sin(t * 2) * 0.04;
    }
  });

  const net = handOver ? state.result?.net[player.id] : undefined;
  const status = STATUS_LABEL[player.status];
  const dealer = state.phase !== 'waiting' && player.inHand && state.dealerSeat === player.seat;
  const augments = state.mode === 'augmented' ? player.augments : [];

  return (
    <group position={polar(a, SEAT.avatar, 0)} rotation-y={faceCenter(a)}>
      <Stool />
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03} visible={false}>
        <ringGeometry args={[0.42, 0.52, 20]} />
        <meshBasicMaterial color="#ffd84a" toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <group ref={root}>
        {/* 다리(앉은 자세) */}
        {[-0.12, 0.12].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.6, 0.14]} material={pants} castShadow>
              <boxGeometry args={[0.17, 0.15, 0.4]} />
              <Outlines thickness={0.012} color={OUTLINE} />
            </mesh>
            <mesh position={[x, 0.36, 0.3]} material={pants}>
              <boxGeometry args={[0.15, 0.4, 0.15]} />
              <Outlines thickness={0.012} color={OUTLINE} />
            </mesh>
            <mesh position={[x, 0.15, 0.34]} material={black}>
              <boxGeometry args={[0.17, 0.08, 0.24]} />
            </mesh>
          </group>
        ))}
        <group ref={torso} position-y={0.6}>
          <mesh position-y={0.22} material={shirt} castShadow>
            <boxGeometry args={[0.46, 0.44, 0.3]} />
            <Outlines thickness={0.018} color={OUTLINE} />
          </mesh>
          {/* 팔: 어깨 기준 회전 */}
          {(
            [
              [-0.3, armL],
              [0.3, armR],
            ] as const
          ).map(([x, ref]) => (
            <group key={x} ref={ref} position={[x, 0.4, 0]}>
              <mesh position-y={-0.14} material={shirt} castShadow>
                <boxGeometry args={[0.14, 0.3, 0.14]} />
                <Outlines thickness={0.012} color={OUTLINE} />
              </mesh>
              <mesh position-y={-0.33} material={skin}>
                <boxGeometry args={[0.12, 0.1, 0.12]} />
                <Outlines thickness={0.012} color={OUTLINE} />
              </mesh>
            </group>
          ))}
          <group ref={head} position-y={0.46}>
            <mesh position-y={0.2} material={skin} castShadow>
              <boxGeometry args={[0.4, 0.38, 0.38]} />
              <Outlines thickness={0.02} color={OUTLINE} />
            </mesh>
            <group ref={eyes} position={[0, 0.23, 0.195]}>
              <mesh position-x={-0.085} material={black}>
                <boxGeometry args={[0.055, 0.075, 0.01]} />
              </mesh>
              <mesh position-x={0.085} material={black}>
                <boxGeometry args={[0.055, 0.075, 0.01]} />
              </mesh>
            </group>
            <mesh position={[0, 0.12, 0.195]} material={toon('#c0533f')}>
              <boxGeometry args={[0.1, 0.025, 0.01]} />
            </mesh>
            <mesh position={[-0.13, 0.15, 0.192]} material={toon('#ff9b8a')}>
              <boxGeometry args={[0.06, 0.03, 0.01]} />
            </mesh>
            <mesh position={[0.13, 0.15, 0.192]} material={toon('#ff9b8a')}>
              <boxGeometry args={[0.06, 0.03, 0.01]} />
            </mesh>
            <group position-y={0.2}>
              <Hat kind={style.hat} color={style.hatColor} />
            </group>
          </group>
        </group>
      </group>
      <group ref={cloud} visible={false} position-y={2.05}>
        {[
          [-0.12, 0, 0.13],
          [0.08, 0.03, 0.16],
          [0.22, -0.01, 0.11],
        ].map(([x, y, r], i) => (
          <mesh key={i} position={[x, y, 0]} material={toon('#7d8794', { flat: true })}>
            <icosahedronGeometry args={[r, 0]} />
          </mesh>
        ))}
      </group>
      {/* 본인 정보는 화면 HUD에 있으므로 이름표를 띄우지 않는다 */}
      {!isHero && (
      <SceneHtml position={[0, 1.95, 0]} center zIndexRange={[10, 0]}>
        <div
          className={[
            'seat3d',
            isTurn && 'is-turn',
            player.folded && 'is-folded',
            isWinner && 'is-winner',
            busted && 'is-out',
            player.status === 'waiting' && 'is-waiting',
          ]
            .filter(Boolean)
            .join(' ')}
          data-seat={player.seat}
        >
          {player.lastAction && !handOver && <div className="seat3d__bubble">{player.lastAction}</div>}
          {net !== undefined && net !== 0 && (
            <div className={net > 0 ? 'seat3d__net is-plus' : 'seat3d__net is-minus'}>
              {net > 0 ? '+' : ''}
              {net.toLocaleString()}
            </div>
          )}
          <div className="seat3d__name">
            {dealer && <span className="seat3d__dealer">D</span>}
            {player.name}
          </div>
          <div className="seat3d__chips seat-chips">{player.chips.toLocaleString()}</div>
          {status && <div className="seat3d__status">{status}</div>}
          {!player.connected && <div className="seat3d__status">연결 끊김</div>}
          {augments.length > 0 && (
            <div className="seat3d__augs">
              {augments.map((o) => {
                const def = AUGMENTS[o.id];
                return (
                  <span key={o.id} className={`seat3d__aug tier-${def.tier}`} title={`${def.name} · ${TIER_LABEL[def.tier]}\n${def.description}`}>
                    {def.icon}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </SceneHtml>
      )}
    </group>
  );
}