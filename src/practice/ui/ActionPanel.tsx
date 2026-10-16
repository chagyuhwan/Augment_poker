import { useEffect, useState } from 'react';
import { byId, legalActions, potSize } from '../game/engine';
import type { GameState, PlayerAction } from '../game/types';

interface Props {
  state: GameState;
  paused: boolean;
  /** seq: 버튼을 누를 때 본 actionSeq. 엔진이 중복·지연 요청을 거른다 */
  onAction: (action: PlayerAction, seq: number) => void;
}

export function ActionPanel({ state, paused, onAction }: Props) {
  const me = byId(state, state.heroId);
  const myTurn = Boolean(me) && state.phase === 'betting' && state.currentPlayer === state.heroId;
  const legal = me ? legalActions(state, me) : null;
  const minTotal = legal?.minRaiseTo ?? 0;
  const maxTotal = legal?.maxRaiseTo ?? 0;
  const pot = potSize(state);
  const seq = state.actionSeq;

  const [raiseTo, setRaiseTo] = useState(minTotal);
  useEffect(() => setRaiseTo(minTotal), [minTotal, myTurn]);

  const send = (a: PlayerAction) => onAction(a, seq);
  const call = () => send(legal?.canCheck ? { type: 'check' } : { type: 'call' });

  useEffect(() => {
    if (!myTurn || paused || !legal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyF') send({ type: 'fold' });
      else if (e.code === 'KeyC') call();
      else if (e.code === 'KeyR' && legal.canRaise) send({ type: 'raise', amount: raiseTo });
      else if (e.code === 'KeyA' && legal.canRaise) send({ type: 'raise', amount: maxTotal });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!myTurn || !me || !legal) {
    let text = '';
    if (me?.status === 'waiting') text = '다음 판부터 참가합니다.';
    else if (state.phase === 'betting') text = me?.folded ? '폴드했습니다. 판이 끝나길 기다리는 중…' : '상대 차례…';
    return text ? <div className="action-panel waiting">{text}</div> : <div className="action-panel waiting" />;
  }

  const clamp = (v: number) => Math.max(minTotal, Math.min(maxTotal, v));
  const presets = [
    { label: '½ 팟', value: state.currentBet + Math.floor(pot / 2) },
    { label: '팟', value: state.currentBet + pot },
  ];
  const isAllIn = (to: number) => to >= legal.allInTo;
  const capped = state.maxBet !== null && maxTotal < legal.allInTo;
  const callLabel = legal.canCheck
    ? '체크'
    : legal.toCall >= me.chips
      ? `올인 콜 ${me.chips.toLocaleString()}`
      : `콜 ${legal.toCall.toLocaleString()}`;
  const raiseLabel = isAllIn(raiseTo)
    ? `올인 ${raiseTo.toLocaleString()}`
    : `${state.currentBet === 0 ? '베팅' : '레이즈'} ${raiseTo.toLocaleString()}`;

  return (
    <div className="action-panel action-panel--controls">
      <div className="action-panel__row action-panel__row--primary">
        <button type="button" className="pbtn fold" onClick={() => send({ type: 'fold' })}>
          폴드 <span className="key-hint">F</span>
        </button>
        <button type="button" className="pbtn call" onClick={call}>
          {callLabel} <span className="key-hint">C</span>
        </button>
      </div>
      {legal.canRaise && (
        <div className="raise-box">
          <div className="raise-box__amount">{raiseTo.toLocaleString()}</div>
          <input
            type="range"
            min={minTotal}
            max={maxTotal}
            step={Math.max(1, state.bb / 2)}
            value={raiseTo}
            onChange={(e) => setRaiseTo(clamp(Number(e.target.value)))}
            aria-label="레이즈 금액"
          />
          <div className="raise-presets">
            {presets.map((p) => (
              <button key={p.label} type="button" className="pbtn tiny" onClick={() => setRaiseTo(clamp(p.value))}>
                {p.label}
              </button>
            ))}
            <button type="button" className="pbtn tiny pbtn--danger" onClick={() => setRaiseTo(maxTotal)}>
              {capped ? '최대' : '올인'} <span className="key-hint">A</span>
            </button>
          </div>
          <button type="button" className="pbtn raise" onClick={() => send({ type: 'raise', amount: raiseTo })}>
            {raiseLabel} <span className="key-hint">R</span>
          </button>
        </div>
      )}
    </div>
  );
}
