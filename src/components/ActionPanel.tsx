import { useEffect, useState } from 'react';
import { potSize } from '../game/engine';
import type { GameState, PlayerAction } from '../game/types';

interface Props {
  state: GameState;
  paused: boolean;
  onAction: (action: PlayerAction) => void;
}

export function ActionPanel({ state, paused, onAction }: Props) {
  const me = state.players[0];
  const myTurn = state.phase === 'betting' && state.currentPlayer === 0;
  const toCall = Math.max(0, state.currentBet - me.bet);
  const maxTotal = me.bet + me.chips;
  const minTotal = Math.min(state.currentBet + state.minRaise, maxTotal);
  const canRaise = maxTotal > state.currentBet;
  const pot = potSize(state);

  const [raiseTo, setRaiseTo] = useState(minTotal);
  useEffect(() => setRaiseTo(minTotal), [minTotal, myTurn]);

  useEffect(() => {
    if (!myTurn || paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyF') onAction({ type: 'fold' });
      else if (e.code === 'KeyC') onAction({ type: 'call' });
      else if (e.code === 'KeyR' && canRaise) onAction({ type: 'raise', amount: raiseTo });
      else if (e.code === 'KeyA' && canRaise) onAction({ type: 'raise', amount: maxTotal });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, paused, canRaise, raiseTo, maxTotal, onAction]);

  if (!myTurn) {
    return <div className="action-panel waiting">{state.phase === 'betting' ? '상대 차례...' : ''}</div>;
  }

  const presets = [
    { label: '½ 팟', value: state.currentBet + Math.floor(pot / 2) },
    { label: '팟', value: state.currentBet + pot },
  ];

  return (
    <div className="action-panel">
      <button className="btn fold" onClick={() => onAction({ type: 'fold' })}>
        폴드 <span className="key-hint">F</span>
      </button>
      <button className="btn call" onClick={() => onAction({ type: 'call' })}>
        {toCall === 0 ? '체크' : toCall >= me.chips ? `올인 콜 ${me.chips}` : `콜 ${toCall}`}{' '}
        <span className="key-hint">C</span>
      </button>
      {canRaise && (
        <div className="raise-box">
          <input
            type="range"
            min={minTotal}
            max={maxTotal}
            step={1}
            value={raiseTo}
            onChange={(e) => setRaiseTo(Number(e.target.value))}
          />
          <div className="raise-presets">
            {presets.map((p) => (
              <button
                key={p.label}
                className="btn tiny"
                onClick={() => setRaiseTo(Math.max(minTotal, Math.min(maxTotal, p.value)))}
              >
                {p.label}
              </button>
            ))}
            <button className="btn tiny" onClick={() => setRaiseTo(maxTotal)}>
              올인 <span className="key-hint">A</span>
            </button>
          </div>
          <button className="btn raise" onClick={() => onAction({ type: 'raise', amount: raiseTo })}>
            {raiseTo >= maxTotal ? `올인 ${maxTotal}` : `${state.currentBet === 0 ? '베팅' : '레이즈'} ${raiseTo}`}{' '}
            <span className="key-hint">R</span>
          </button>
        </div>
      )}
    </div>
  );
}
