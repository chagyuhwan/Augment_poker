import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { decideBotAction } from '../game/ai';
import { AUGMENTS, TIER_LABEL } from '../game/augments';
import {
  applyAction,
  canSeeNextCard,
  canUseFateTwist,
  canUseMulligan,
  chooseAugment,
  mulliganCard,
  peekNextCard,
  potSize,
  rerollAugments,
  startHand,
  twistFate,
} from '../game/engine';
import type { GameState } from '../game/types';
import { ActionPanel } from './ActionPanel';
import { AugmentPicker } from './AugmentPicker';
import { PlayingCard } from './PlayingCard';
import { Seat } from './Seat';

const POSITIONS = ['bottom', 'left', 'top', 'right'] as const;

interface Props {
  state: GameState;
  setState: Dispatch<SetStateAction<GameState | null>>;
  botDelay: number;
  paused: boolean;
  onPause: () => void;
  onExitToMenu: () => void;
  onRestart: () => void;
}

export function GameScreen({ state, setState, botDelay, paused, onPause, onExitToMenu, onRestart }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const update = (fn: (s: GameState) => GameState) => setState((s) => (s ? fn(s) : s));

  useEffect(() => {
    if (paused || state.phase !== 'betting') return;
    if (state.players[state.currentPlayer]?.isHuman) return;
    const timer = setTimeout(() => {
      update((s) => {
        if (s.phase !== 'betting' || s.players[s.currentPlayer].isHuman) return s;
        return applyAction(s, decideBotAction(s));
      });
    }, botDelay);
    return () => clearTimeout(timer);
  }, [state, paused, botDelay]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.log.length]);

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (state.phase === 'handOver' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        update(startHand);
      } else if (state.phase === 'augment') {
        const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (idx >= 0 && state.augmentOffer[idx]) update((s) => chooseAugment(s, s.augmentOffer[idx]));
        if (e.code === 'KeyR') update(rerollAugments);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, state.augmentOffer, paused]);

  const me = state.players[0];
  const myAugment = me.augment ? AUGMENTS[me.augment] : null;
  const mulliganReady = canUseMulligan(state);
  const nextCard = canSeeNextCard(state) ? peekNextCard(state) : null;

  return (
    <div className="game-screen">
      <header className="topbar">
        <h1>증강 포커</h1>
        <div className="topbar-info">
          핸드 #{state.handNumber} · 블라인드 {state.sb}/{state.bb} · 새로고침 {state.rerolls}회
        </div>
        <button className="btn tiny" onClick={onPause}>
          ☰ 메뉴 (ESC)
        </button>
      </header>

      <main className="layout">
        <section className="table-area">
          <div className="table">
            {state.players.map((p, i) => (
              <Seat
                key={p.id}
                state={state}
                player={p}
                position={POSITIONS[i]}
                onCardClick={p.isHuman && mulliganReady ? (idx) => update((s) => mulliganCard(s, idx)) : undefined}
              />
            ))}

            <div className="board">
              <div className="pot">팟 {potSize(state).toLocaleString()}</div>
              <div className="community">
                {Array.from({ length: 5 }, (_, i) => (
                  <PlayingCard key={i} card={state.community[i]} hidden={!state.community[i]} />
                ))}
              </div>
              {nextCard && (
                <div className="next-card">
                  🔮 다음 카드 <PlayingCard card={nextCard} small />
                </div>
              )}
            </div>
          </div>

          <div className="bottom-bar">
            {myAugment && (
              <div className={`my-augment tier-${myAugment.tier}`}>
                <span className="my-augment-title">
                  {myAugment.icon} [{TIER_LABEL[myAugment.tier]}] {myAugment.name}
                </span>
                <span className="my-augment-desc">{myAugment.description}</span>
                {mulliganReady && <span className="hint">👉 교체할 내 카드를 클릭하세요</span>}
                {canUseFateTwist(state) && (
                  <button className="btn tiny" onClick={() => update(twistFate)}>
                    🌀 다음 카드 버리기
                  </button>
                )}
              </div>
            )}
            {state.phase === 'handOver' && state.result ? (
              <div className="result-panel">
                {state.result.lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
                <button className="btn raise" onClick={() => update(startHand)}>
                  다음 핸드 ▶ <span className="key-hint">Space</span>
                </button>
              </div>
            ) : (
              <ActionPanel state={state} paused={paused} onAction={(a) => update((s) => applyAction(s, a))} />
            )}
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

      {state.phase === 'augment' && !paused && (
        <AugmentPicker
          state={state}
          onChoose={(id) => update((s) => chooseAugment(s, id))}
          onReroll={() => update(rerollAugments)}
        />
      )}

      {state.phase === 'gameOver' && !paused && (
        <div className="overlay">
          <div className="panel">
            <h2>{me.out || me.chips <= 0 ? '💀 파산했습니다' : '🏆 최종 승리!'}</h2>
            <p>
              {state.handNumber}핸드 진행 · 최종 칩 {me.chips.toLocaleString()}
            </p>
            <div className="panel-buttons">
              <button className="btn raise" onClick={onRestart}>
                다시 시작
              </button>
              <button className="btn" onClick={onExitToMenu}>
                메인 메뉴
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
