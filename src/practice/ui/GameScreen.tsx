import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { decideBotAction } from '../game/ai';
import { AUGMENTS, KIND_LABEL, MAX_AUGMENT_SLOTS, TIER_LABEL } from '../game/augments';
import {
  act,
  byId,
  canSeeNextCard,
  canUseFateTwist,
  canUseMulligan,
  chooseAugment,
  extendAugmentDeadline,
  type EngineResult,
  mulliganCard,
  peekNextCard,
  potSize,
  rerollAugmentSlot,
  rerollAugments,
  tickTimeouts,
  twistFate,
} from '../game/engine';
import type { AugmentId, GameState } from '../game/types';
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

/** 카드를 나눠 줄 때 발동하므로 얻은 판에는 효과가 없는 증강 */
const DEAL_TIME_AUGMENTS = new Set<AugmentId>(['clairvoyance', 'tax', 'thirdHand']);

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
  /** 본인이 소진되어 테이블을 떠나야 하면 true. 자동 진행을 멈춘다 */
  halted: boolean;
  onPause: () => void;
  onLeave: () => void;
}

export function GameScreen({ state, setState, botDelay, paused, nextHand, halted, onPause, onLeave }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pausedAt = useRef<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [zoomHand, setZoomHand] = useState(false);
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

  useEffect(() => {
    if (!errorRef.current) return;
    setFlash(errorRef.current);
    errorRef.current = null;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  });

  // 봇 차례
  useEffect(() => {
    if (paused || state.phase !== 'betting') return;
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
  }, [state, paused, botDelay]);

  // 테이블에 있는 동안 카지노 배경음
  useEffect(() => {
    audio.setAmbience(true);
    return () => audio.setAmbience(false);
  }, []);

  // 증강 선택 제한시간 / 재접속 유예
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => update((s) => tickTimeouts(s)), 250);
    return () => clearInterval(t);
  }, [paused]);

  // 일시정지한 시간만큼 증강 제한시간을 늘린다
  useEffect(() => {
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
  }, [paused]);

  // 판이 끝나면 잠시 결과를 보여 주고 자동으로 다음 판
  useEffect(() => {
    if (state.phase !== 'handOver' || halted) {
      setNextAt(null);
      return;
    }
    setNextAt(Date.now() + NEXT_HAND_MS + busyLeft());
  }, [state.phase, state.handNumber, halted]);

  useEffect(() => {
    if (nextAt === null || paused) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= nextAt) {
        setNextAt(null);
        update(nextHand);
      }
    }, 200);
    return () => clearInterval(t);
  }, [nextAt, paused, nextHand]);

  // 혼자 남으면 다른 플레이어가 앉을 때까지 대기
  useEffect(() => {
    if (state.phase !== 'waiting' || paused || halted) return;
    const t = setTimeout(() => update(nextHand), WAITING_RETRY_MS);
    return () => clearTimeout(t);
  }, [state, paused, halted, nextHand]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.log.length]);

  useEffect(() => {
    if (paused || state.phase !== 'handOver' || halted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setNextAt(null);
        update(nextHand);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, paused, halted, nextHand]);

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
  const mulliganReady = canUseMulligan(state);
  const nextCard = canSeeNextCard(state) ? peekNextCard(state) : null;
  const bySeat = new Map(state.players.map((p) => [p.seat, p]));
  const nextIn = nextAt === null ? null : Math.max(0, Math.ceil((nextAt - now) / 1000));
  const waitingFor = state.players.filter((p) => p.status !== 'busted' && p.status !== 'leaving').length;

  const onHeroCard = mulliganReady ? (idx: number) => update((s) => mulliganCard(s, idx)) : undefined;

  const augmentSlots = augmented && me && (
    <div className="my-augments">
      {Array.from({ length: MAX_AUGMENT_SLOTS }, (_, i) => {
        const o = me.augments[i];
        if (!o) return <div key={`slot-${i}`} className="my-augment is-empty" title="빈 증강 슬롯" />;
        const a = AUGMENTS[o.id];
        const pending = o.acquiredHand === state.handNumber && DEAL_TIME_AUGMENTS.has(o.id);
        return (
          <div
            key={o.id}
            className={`my-augment tier-${a.tier}${pending ? ' is-pending' : ''}`}
            title={`${a.name} · ${TIER_LABEL[a.tier]} · ${KIND_LABEL[a.kind]}${pending ? ' · 다음 판부터' : ''}\n${a.description}`}
          >
            <span className="my-augment-icon">{a.icon}</span>
            <span className="my-augment-title">{a.name}</span>
            {o.id === 'mulligan' && mulliganReady && <span className="hint">카드 클릭</span>}
            {o.id === 'fateTwist' && canUseFateTwist(state) && (
              <button type="button" className="pbtn tiny" onClick={() => update((s) => twistFate(s))}>
                버리기
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const resultOrActions =
    state.phase === 'handOver' && state.result ? (
      <div className="result-panel">
        {state.result.lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {!halted && (
          <button
            type="button"
            className="pbtn raise"
            onClick={() => {
              setNextAt(null);
              update(nextHand);
            }}
          >
            다음 판 {nextIn !== null ? `${nextIn}초` : ''} <span className="key-hint">Space</span>
          </button>
        )}
      </div>
    ) : (
      <ActionPanel state={state} paused={paused} onAction={(a, seq) => run((s) => act(s, s.heroId, a, seq))} />
    );

  const augmentPicker = state.phase === 'augment' && state.augmentRound && (
    <AugmentPicker
      key={`${state.handNumber}-${state.augmentRound.round}`}
      state={state}
      paused={paused}
      onChoose={(pick, replace) => run((s) => chooseAugment(s, s.heroId, pick, replace))}
      onRerollAll={() => run((s) => rerollAugments(s, s.heroId))}
      onRerollSlot={(i) => run((s) => rerollAugmentSlot(s, s.heroId, i))}
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
            {state.handNumber > 0 ? `#${state.handNumber}` : '대기'}
          </div>
          <div className="hud-chip" title={state.maxBet !== null ? `최대 베팅 ${state.maxBet.toLocaleString()}` : '노리밋'}>
            {state.sb.toLocaleString()}/{state.bb.toLocaleString()}
          </div>
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
          {nextCard && (
            <div className="hud-pill hud-pill--aug">
              🔮 다음 카드 <PlayingCard card={nextCard} small />
            </div>
          )}
          {state.phase === 'waiting' && <div className="hud-pill">{waitingFor < 2 ? '플레이어 기다리는 중…' : '곧 시작합니다…'}</div>}
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
                {state.phase !== 'waiting' && me.inHand && state.dealerSeat === me.seat && <span className="seat3d__dealer">D</span>}
                {me.name}
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
          {state.handNumber > 0 ? `핸드 #${state.handNumber}` : '대기 중'} · 블라인드 {state.sb.toLocaleString()}/{state.bb.toLocaleString()}
          {state.maxBet !== null ? ` · 최대 베팅 ${state.maxBet.toLocaleString()}` : ''} · {state.players.length}/{state.maxSeats}명 · 오프라인
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
          {nextCard && (
            <div className="next-card">
              🔮 다음 카드 <PlayingCard card={nextCard} small />
            </div>
          )}
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
