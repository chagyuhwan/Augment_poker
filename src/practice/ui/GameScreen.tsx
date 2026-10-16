import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { decideBotAction } from '../game/ai';
import { AUGMENTS, KIND_LABEL, MAX_AUGMENT_SLOTS, TIER_LABEL } from '../game/augments';
import { netChipScore, nextBlindIncreaseHand } from '../../core/matchRules';
import {
  act,
  byId,
  canUseAugment,
  chooseAugment,
  extendAugmentDeadline,
  getMatchStandings,
  type EngineResult,
  invokeAugment,
  peekForesight,
  potSize,
  tickTimeouts,
  type AugmentPayload,
} from '../game/engine';
import type { AugmentId, GameState, Suit } from '../game/types';
import type { LanActionRequest } from '../../net/lanProtocol';
import { useSettings } from '../../app/settingsContext';
import { audio } from '../../audio/audioEngine';
import { canUseWebGL } from '../../scene3d/webgl';
import { useTableDirector } from '../../scene3d/useTableDirector';
import { ANIMATION_SPEED_FACTOR } from '../../settings/settings';
import '../game3d.css';
import { ActionPanel } from './ActionPanel';
import { AugmentPicker } from './AugmentPicker';
import { PlayingCard } from './PlayingCard';
import { EmptySeat, Seat } from './Seat';

/** 시계 방향 배치. 본인 좌석이 항상 bottom */
const POSITIONS = ['bottom', 'left', 'top-left', 'top', 'top-right', 'right'];

const TableScene = lazy(() => import('../../scene3d/TableScene').then((m) => ({ default: m.TableScene })));

export const NEXT_HAND_MS = 4_000;
const WAITING_RETRY_MS = 1_500;

interface Props {
  state: GameState;
  setState: Dispatch<SetStateAction<GameState>>;
  botDelay: number;
  paused: boolean;
  /** 판이 끝난 뒤 다음 판을 준비(빈자리 채우기 + 시작)한 상태를 돌려준다 */
  nextHand: (s: GameState) => GameState;
  /** 매치 종료 등으로 자동 진행을 멈출 때 true */
  halted: boolean;
  onPause: () => void;
  onLeave: () => void;
  /** 매치 종료 후 재대전(방장/로컬만) */
  onRematch?: () => void;
  /** remote: 엔진은 호스트. 봇·타임아웃·다음 판은 돌리지 않고 액션만 전송 */
  sync?: 'local' | 'remote';
  onRemoteAction?: (request: LanActionRequest) => void;
}

export function GameScreen({
  state,
  setState,
  botDelay,
  paused,
  nextHand,
  halted,
  onPause,
  onLeave,
  onRematch,
  sync = 'local',
  onRemoteAction,
}: Props) {
  const remote = sync === 'remote';
  const logRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pausedAt = useRef<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [zoomHand, setZoomHand] = useState(false);
  /** 사용 대기 중인 증강 (대상/카드 선택) */
  const [pendingAug, setPendingAug] = useState<AugmentId | null>(null);
  const pendingSuit: Suit = 's';
  const { settings } = useSettings();
  const use3d = canUseWebGL();
  const speed = ANIMATION_SPEED_FACTOR[settings.animationSpeed] * (settings.reduceMotion ? 0.6 : 1);
  const director = useTableDirector(state, speed, paused);
  /** 진행 중인 화면 연출이 끝날 때까지 남은 시간(ms) */
  const busyLeft = () => (use3d ? Math.max(0, director.busyUntil.current - performance.now()) : 0);

  const run = (fn: (s: GameState) => EngineResult) =>
    setState((s) => {
      const r = fn(s);
      if (!r.ok) errorRef.current = r.error;
      return r.ok ? r.state : s;
    });
  const update = (fn: (s: GameState) => GameState) => setState(fn);
  const remoteOrRun = (request: LanActionRequest, fn: (s: GameState) => EngineResult) => {
    if (remote && onRemoteAction) {
      onRemoteAction(request);
      return;
    }
    run(fn);
  };

  useEffect(() => {
    if (!errorRef.current) return;
    setFlash(errorRef.current);
    errorRef.current = null;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  });

  // 봇 차례
  useEffect(() => {
    if (remote || paused || state.phase !== 'betting') return;
    const cur = byId(state, state.currentPlayer);
    if (!cur || cur.isHuman) return;
    const timer = setTimeout(() => {
      run((s) => {
        const p = byId(s, s.currentPlayer);
        if (s.phase !== 'betting' || !p || p.isHuman) return { ok: true, state: s };
        return act(s, p.id, decideBotAction(s), s.actionSeq);
      });
    }, Math.max(botDelay, busyLeft() + 150));
    return () => clearTimeout(timer);
  }, [state, paused, botDelay, remote]);

  // 테이블에 있는 동안 카지노 배경음
  useEffect(() => {
    audio.setAmbience(true);
    return () => audio.setAmbience(false);
  }, []);

  // 증강 선택 제한시간 / 재접속 유예
  useEffect(() => {
    if (remote || paused) return;
    const t = setInterval(() => update((s) => tickTimeouts(s)), 250);
    return () => clearInterval(t);
  }, [paused, remote]);

  // 일시정지한 시간만큼 증강 제한시간을 늘린다
  useEffect(() => {
    if (remote) return;
    if (paused) {
      pausedAt.current = Date.now();
      return;
    }
    if (pausedAt.current !== null) {
      const ms = Date.now() - pausedAt.current;
      pausedAt.current = null;
      update((s) => extendAugmentDeadline(s, ms));
      setNextAt((t) => (t === null ? t : t + ms));
    }
  }, [paused, remote]);

  // 핸드가 끝나면 잠시 결과를 보여 주고 자동으로 다음 핸드(마지막이면 matchOver)
  useEffect(() => {
    if (remote || halted || state.phase !== 'handOver') {
      if (remote || state.phase !== 'handOver' || halted) setNextAt(null);
      return;
    }
    setNextAt(Date.now() + NEXT_HAND_MS + busyLeft());
  }, [state.phase, state.handNumber, halted, remote]);

  useEffect(() => {
    if (remote || nextAt === null || paused) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= nextAt) {
        setNextAt(null);
        update(nextHand);
      }
    }, 200);
    return () => clearInterval(t);
  }, [nextAt, paused, nextHand, remote]);

  // 혼자 남으면 다른 플레이어가 앉을 때까지 대기
  useEffect(() => {
    if (remote || state.phase !== 'waiting' || paused || halted) return;
    const t = setTimeout(() => update(nextHand), WAITING_RETRY_MS);
    return () => clearTimeout(t);
  }, [state, paused, halted, nextHand, remote]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.log.length]);

  useEffect(() => {
    if (remote || paused || state.phase !== 'handOver' || halted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setNextAt(null);
        update(nextHand);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, paused, halted, nextHand, remote]);

  // Q를 누르고 있는 동안 내 패를 화면 앞으로 크게 당긴다
  useEffect(() => {
    if (paused) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ' && !e.repeat) setZoomHand(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') setZoomHand(false);
    };
    const reset = () => setZoomHand(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      setZoomHand(false);
    };
  }, [paused]);

  const me = byId(state, state.heroId);
  const heroSeat = me?.seat ?? 0;
  const canZoom = !!me && me.inHand && !me.folded && me.hole.length > 0;
  const augmented = state.mode === 'augmented';
  const foresight = peekForesight(state);
  const bySeat = new Map(state.players.map((p) => [p.seat, p]));
  const nextIn = nextAt === null ? null : Math.max(0, Math.ceil((nextAt - now) / 1000));
  const waitingFor = state.players.filter((p) => p.status !== 'leaving').length;
  const matchHands = state.matchHands || 8;
  const nextBlindAt = nextBlindIncreaseHand(Math.max(1, state.handNumber), matchHands);
  const heroNetMatch = me ? netChipScore(me.chips, me.chipGranted) : 0;
  const standings = state.phase === 'matchOver' ? getMatchStandings(state) : null;
  const brokePending =
    me && me.chips === 0 && state.phase === 'handOver' && state.handNumber < matchHands;

  const applyAug = (id: AugmentId, payload: AugmentPayload) => {
    remoteOrRun({ kind: 'invokeAugment', id, payload }, (s) => invokeAugment(s, id, payload));
    setPendingAug(null);
  };

  const onHeroCard =
    pendingAug && me
      ? (idx: number) => {
          const def = AUGMENTS[pendingAug];
          if (def.target === 'selfHole') applyAug(pendingAug, { type: 'hole', index: idx });
          else if (def.target === 'selfHoleDelta') applyAug(pendingAug, { type: 'rankNudge', index: idx, delta: 1 });
          else if (def.target === 'selfHoleSuit') applyAug(pendingAug, { type: 'suitUnify', indices: [idx], suit: pendingSuit });
          else if (def.target === 'opponentSwap') {
            const opp = state.players.find((p) => p.id !== me.id && p.inHand && !p.folded);
            if (opp) applyAug(pendingAug, { type: 'swap', targetId: opp.id, myIndex: idx });
          }
        }
      : undefined;

  const augmentSlots = augmented && me && (
    <div className="my-augments">
      {Array.from({ length: MAX_AUGMENT_SLOTS }, (_, i) => {
        const o = me.augments[i];
        if (!o) return <div key={`slot-${i}`} className="my-augment is-empty" title="빈 증강 슬롯" />;
        const a = AUGMENTS[o.id];
        if (!a) return <div key={`slot-${i}`} className="my-augment is-empty" title="알 수 없는 증강" />;
        const usable = canUseAugment(state, me.id, o.id);
        return (
          <div
            key={`${o.id}-${i}`}
            className={`my-augment tier-${a.tier}${o.used ? ' is-pending' : ''}${pendingAug === o.id ? ' is-pending' : ''}${usable.ok ? ' is-usable' : ''}`}
            title={`${a.name} · ${TIER_LABEL[a.tier]} · ${KIND_LABEL[a.kind]}\n${a.description}${usable.ok ? '' : `\n(${usable.reason})`}`}
          >
            <span className="my-augment-icon">{a.icon}</span>
            <span className="my-augment-text">
              <span className="my-augment-title">{a.name}</span>
              <span className="my-augment-desc">{a.description}</span>
            </span>
            {usable.ok && a.target === 'none' && (
              <button type="button" className="pbtn tiny" onClick={() => applyAug(o.id, { type: 'none' })}>
                사용
              </button>
            )}
            {usable.ok && a.target !== 'none' && a.target !== 'opponent' && a.target !== 'opponentHand' && a.target !== 'board' && (
              <button type="button" className="pbtn tiny" onClick={() => setPendingAug(pendingAug === o.id ? null : o.id)}>
                {pendingAug === o.id ? '취소' : '카드 선택'}
              </button>
            )}
            {usable.ok && (a.target === 'opponent' || a.target === 'opponentHand' || a.target === 'board') && (
              <button
                type="button"
                className="pbtn tiny"
                onClick={() => {
                  if (a.target === 'board' && state.community.length) {
                    applyAug(o.id, { type: 'board', index: 0 });
                    return;
                  }
                  const opp = state.players.find((p) => p.id !== me.id && p.inHand && !p.folded);
                  if (!opp) return;
                  if (a.target === 'opponentHand') applyAug(o.id, { type: 'handFlip', targetId: opp.id });
                  else applyAug(o.id, { type: 'target', playerId: opp.id });
                }}
              >
                사용
              </button>
            )}
          </div>
        );
      })}
      {pendingAug && <span className="hint">내 패를 클릭하세요</span>}
      {foresight && (
        <div className="hud-pill hud-pill--aug">
          🔮 예지 <PlayingCard card={{ id: -1, rank: foresight.rank, suit: foresight.suit }} small />
        </div>
      )}
      {state.effects.auraHints[me.id] && <div className="hud-pill">{state.effects.auraHints[me.id]}</div>}
      {state.effects.privatePeeks
        .filter((p) => p.viewerId === me.id)
        .map((p) => (
          <div key={p.cardId} className="hud-pill hud-pill--aug">
            👁️ 엿봄 <PlayingCard card={{ id: p.cardId, rank: p.rank, suit: p.suit }} small />
          </div>
        ))}
    </div>
  );

  const matchOverPanel =
    state.phase === 'matchOver' && standings ? (
      <div className="result-panel match-over-panel">
        <div className="match-over-panel__title">🏁 매치 종료 · 최종 순위</div>
        <ol className="match-standings">
          {standings.map((row) => (
            <li key={row.playerId} className={row.rank === 1 && !row.dnf ? 'is-first' : row.dnf ? 'is-dnf' : ''}>
              <span className="match-standings__rank">{row.dnf ? 'DNF' : `${row.rank}위`}</span>
              <span className="match-standings__name">{row.name}</span>
              <span className="match-standings__net">
                {row.netScore >= 0 ? '+' : ''}
                {row.netScore.toLocaleString()}
              </span>
              <span className="match-standings__meta">
                칩 {row.chips.toLocaleString()} · 복구 {row.chipRefills}회 · 승 {row.handsWon}
              </span>
            </li>
          ))}
        </ol>
        <div className="match-over-panel__actions">
          {onRematch && !remote && (
            <button type="button" className="pbtn raise" onClick={onRematch}>
              재대전
            </button>
          )}
          {!onRematch && remote && <div className="hint">방장이 재대전을 시작할 수 있습니다.</div>}
          <button type="button" className="pbtn" onClick={onLeave}>
            나가기
          </button>
        </div>
      </div>
    ) : null;

  const resultOrActions = matchOverPanel ? (
    matchOverPanel
  ) : state.phase === 'handOver' && state.result ? (
    <div className="result-panel">
      {state.result.lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {brokePending && <div className="hint">칩이 소진되었습니다. 다음 핸드에 자동 복구됩니다.</div>}
      {!halted && !remote && (
        <button
          type="button"
          className="pbtn raise"
          onClick={() => {
            setNextAt(null);
            update(nextHand);
          }}
        >
          {state.handNumber >= matchHands ? '결과 보기' : '다음 핸드'} {nextIn !== null ? `${nextIn}초` : ''}{' '}
          <span className="key-hint">Space</span>
        </button>
      )}
      {remote && state.phase === 'handOver' && <div className="hint">방장이 다음 핸드를 진행합니다…</div>}
    </div>
  ) : (
    <ActionPanel
      state={state}
      paused={paused}
      onAction={(a, seq) =>
        remoteOrRun({ kind: 'act', action: a, actionSeq: seq }, (s) => act(s, s.heroId, a, seq))
      }
    />
  );

  const augmentPicker = state.phase === 'augment' && state.augmentRound && (
    <AugmentPicker
      key={`${state.handNumber}-${state.augmentRound.round}`}
      state={state}
      paused={paused}
      onChoose={(pick, replace) =>
        remoteOrRun({ kind: 'chooseAugment', pick, replace }, (s) => chooseAugment(s, s.heroId, pick, replace))
      }
    />
  );

  const table2d = (
    <div className="table">
      {Array.from({ length: state.maxSeats }, (_, seat) => {
        const position = POSITIONS[(seat - heroSeat + state.maxSeats) % state.maxSeats];
        const p = bySeat.get(seat);
        if (!p) return <EmptySeat key={`empty-${seat}`} position={position} />;
        const isHero = p.id === state.heroId;
        return <Seat key={p.id} state={state} player={p} position={position} onCardClick={isHero ? onHeroCard : undefined} />;
      })}
      <div className="board">
        <div className="pot">팟 {potSize(state).toLocaleString()}</div>
        <div className="community">
          {Array.from({ length: 5 }, (_, i) => (
            <PlayingCard key={i} card={state.community[i]} hidden={!state.community[i]} />
          ))}
        </div>
      </div>
    </div>
  );

  if (use3d) {
    const heroNet = state.phase === 'handOver' && me ? state.result?.net[me.id] : undefined;
    const heroTurn = state.phase === 'betting' && state.currentPlayer === state.heroId;
    return (
      <div className="practice game-screen game3d">
        <Suspense fallback={<div className="scene3d scene3d--loading" />}>
          <TableScene
            state={state}
            bus={director.bus}
            busyUntil={director.busyUntil}
            speed={speed}
            paused={paused}
            reduceMotion={settings.reduceMotion}
            quality={settings.graphicsQuality}
            onHeroCard={onHeroCard}
            zoomHand={zoomHand && canZoom}
            fallback={<div className="game3d__fallback">{table2d}</div>}
          />
        </Suspense>

        <header className="hud-top">
          <div className="hud-chip hud-chip--title">
            <span className={augmented ? 'hud-mode is-aug' : 'hud-mode'}>{augmented ? '증강' : '일반'}</span>
            {state.handNumber > 0 ? `${state.handNumber}/${matchHands}` : `0/${matchHands}`}
          </div>
          <div
            className="hud-chip"
            title={
              nextBlindAt
                ? `다음 블라인드 증가: ${nextBlindAt}핸드`
                : state.maxBet !== null
                  ? `최대 베팅 ${state.maxBet.toLocaleString()}`
                  : '노리밋'
            }
          >
            {state.sb.toLocaleString()}/{state.bb.toLocaleString()}
            {nextBlindAt ? ` · ↑${nextBlindAt}` : ''}
          </div>
          {me && (
            <div
              className="hud-chip"
              title={`누적 지급 ${me.chipGranted.toLocaleString()} · 복구 ${me.chipRefills}회`}
            >
              순이익 {heroNetMatch >= 0 ? '+' : ''}
              {heroNetMatch.toLocaleString()}
            </div>
          )}
          <div className="hud-top__spacer" />
          <button type="button" className={logOpen ? 'hud-btn is-on' : 'hud-btn'} onClick={() => setLogOpen((v) => !v)}>
            기록
          </button>
          <button type="button" className="hud-btn" onClick={onLeave}>
            나가기
          </button>
          <button type="button" className="hud-btn" onClick={onPause} title="ESC">
            메뉴
          </button>
        </header>

        <div className="hud-center">
          {state.phase === 'waiting' && <div className="hud-pill">{waitingFor < 2 ? '플레이어 기다리는 중…' : '곧 시작합니다…'}</div>}
          {state.phase === 'matchOver' && <div className="hud-pill">매치 종료</div>}
          {brokePending && <div className="hud-pill">다음 핸드에 칩 자동 복구</div>}
          {state.phase === 'betting' && state.handNumber > 0 && (
            <div className="hud-pill hud-pill--street">
              <span className="hud-pill__street">
                {state.street === 'preflop' ? '프리플랍' : state.street === 'flop' ? '플랍' : state.street === 'turn' ? '턴' : '리버'}
              </span>
              <span className="hud-pill__pot">팟 {potSize(state).toLocaleString()}</span>
              {me && state.currentPlayer === me.id && <span className="hud-pill__turn">내 차례</span>}
            </div>
          )}
        </div>

        {logOpen && (
          <aside className="hud-log" ref={logRef}>
            {state.log.map((line, i) => (
              <div key={i} className={line.startsWith('━━') ? 'log-hand' : ''}>
                {line}
              </div>
            ))}
          </aside>
        )}

        <footer className="hud-bottom">
          {me && (
            <div className={['hero-panel', heroTurn && 'is-turn', me.folded && 'is-folded'].filter(Boolean).join(' ')}>
              <div className="hero-panel__name">
                {state.phase !== 'waiting' && me.inHand && state.dealerSeat === me.seat && (
                  <span className="seat3d__badge seat3d__badge--d">D</span>
                )}
                {me.name}
                {me.allIn && !me.folded && <span className="seat3d__badge seat3d__badge--allin">ALL IN</span>}
              </div>
              <div className="hero-panel__chips seat-chips">{me.chips.toLocaleString()}</div>
              {heroNet !== undefined && heroNet !== 0 && (
                <div className={heroNet > 0 ? 'seat3d__net is-plus' : 'seat3d__net is-minus'}>
                  {heroNet > 0 ? '+' : ''}
                  {heroNet.toLocaleString()}
                </div>
              )}
              {canZoom && (
                <button
                  type="button"
                  className={zoomHand ? 'hud-btn hand-zoom is-on' : 'hud-btn hand-zoom'}
                  title="누르고 있는 동안 내 패를 크게 봅니다"
                  onPointerDown={() => setZoomHand(true)}
                  onPointerUp={() => setZoomHand(false)}
                  onPointerLeave={() => setZoomHand(false)}
                >
                  패 크게 <span className="key-hint">Q</span>
                </button>
              )}
            </div>
          )}
          <div className="hud-bottom__main">
            {augmentSlots}
            {flash && <div className="action-flash">{flash}</div>}
            {resultOrActions}
          </div>
        </footer>

        {augmentPicker}
      </div>
    );
  }

  return (
    <div className="practice game-screen">
        <header className="topbar">
        <h1>봇 대전 · {augmented ? '증강 홀덤' : '일반 홀덤'}</h1>
        <div className="topbar-info">
          {state.handNumber > 0 ? `핸드 ${state.handNumber}/${matchHands}` : `대기 · ${matchHands}핸드`} · 블라인드{' '}
          {state.sb.toLocaleString()}/{state.bb.toLocaleString()}
          {me ? ` · 순이익 ${heroNetMatch >= 0 ? '+' : ''}${heroNetMatch.toLocaleString()}` : ''}
          {state.maxBet !== null ? ` · 최대 베팅 ${state.maxBet.toLocaleString()}` : ''} · {state.players.length}/{state.maxSeats}명
        </div>
        <button type="button" className="pbtn tiny" onClick={onLeave}>
          테이블 나가기
        </button>
        <button type="button" className="pbtn tiny" onClick={onPause}>
          메뉴 (ESC)
        </button>
      </header>

      <main className="layout">
        <section className="table-area">
          {table2d}
          {state.phase === 'waiting' && (
            <div className="table-waiting">{waitingFor < 2 ? '다른 플레이어를 기다리는 중…' : '곧 다음 판을 시작합니다…'}</div>
          )}
          <div className="bottom-bar">
            {augmentSlots}
            {flash && <div className="action-flash">{flash}</div>}
            {resultOrActions}
          </div>
        </section>

        <aside className="log" ref={logRef}>
          {state.log.map((line, i) => (
            <div key={i} className={line.startsWith('━━') ? 'log-hand' : ''}>
              {line}
            </div>
          ))}
        </aside>
      </main>

      {augmentPicker}
    </div>
  );
}
