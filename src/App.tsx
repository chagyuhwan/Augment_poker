import { useEffect, useRef, useState } from 'react';
import { decideBotAction } from './game/ai';
import { AUGMENTS, TIER_LABEL } from './game/augments';
import {
  applyAction,
  canSeeNextCard,
  canUseFateTwist,
  canUseMulligan,
  chooseAugment,
  createGame,
  mulliganCard,
  peekNextCard,
  potSize,
  rerollAugments,
  startHand,
  twistFate,
} from './game/engine';
import { ActionPanel } from './components/ActionPanel';
import { AugmentPicker } from './components/AugmentPicker';
import { PlayingCard } from './components/PlayingCard';
import { Seat } from './components/Seat';

const BOT_DELAY_MS = 800;
const POSITIONS = ['bottom', 'left', 'top', 'right'] as const;

export default function App() {
  const [state, setState] = useState(createGame);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.phase !== 'betting') return;
    if (state.players[state.currentPlayer]?.isHuman) return;
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.phase !== 'betting' || s.players[s.currentPlayer].isHuman) return s;
        return applyAction(s, decideBotAction(s));
      });
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [state.log.length]);

  const me = state.players[0];
  const myAugment = me.augment ? AUGMENTS[me.augment] : null;
  const mulliganReady = canUseMulligan(state);
  const nextCard = canSeeNextCard(state) ? peekNextCard(state) : null;

  return (
    <div className="app">
      <header className="topbar">
        <h1>증강 포커</h1>
        <div className="topbar-info">
          핸드 #{state.handNumber} · 블라인드 {state.sb}/{state.bb} · 새로고침 {state.rerolls}회
        </div>
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
                onCardClick={p.isHuman && mulliganReady ? (idx) => setState((s) => mulliganCard(s, idx)) : undefined}
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
                  <button className="btn tiny" onClick={() => setState((s) => twistFate(s))}>
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
                <button className="btn raise" onClick={() => setState((s) => startHand(s))}>
                  다음 핸드 ▶
                </button>
              </div>
            ) : (
              <ActionPanel state={state} onAction={(a) => setState((s) => applyAction(s, a))} />
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

      {state.phase === 'augment' && (
        <AugmentPicker
          state={state}
          onChoose={(id) => setState((s) => chooseAugment(s, id))}
          onReroll={() => setState((s) => rerollAugments(s))}
        />
      )}

      {state.phase === 'gameOver' && (
        <div className="overlay">
          <div className="augment-picker">
            <h2>{me.out || me.chips <= 0 ? '💀 파산했습니다' : '🏆 최종 승리!'}</h2>
            <p>{state.handNumber}핸드 진행 · 최종 칩 {me.chips.toLocaleString()}</p>
            <button className="btn raise" onClick={() => setState(createGame())}>
              다시 시작
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
