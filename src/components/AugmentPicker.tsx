import { AUGMENTS, TIER_LABEL } from '../game/augments';
import type { AugmentId, GameState } from '../game/types';

interface Props {
  state: GameState;
  onChoose: (id: AugmentId) => void;
  onReroll: () => void;
}

export function AugmentPicker({ state, onChoose, onReroll }: Props) {
  return (
    <div className="overlay">
      <div className={`augment-picker tier-${state.offerTier}`}>
        <h2>
          핸드 #{state.handNumber} · <span className="tier-name">{TIER_LABEL[state.offerTier]}</span> 증강 선택
        </h2>
        <div className="augment-options">
          {state.augmentOffer.map((id) => {
            const a = AUGMENTS[id];
            return (
              <button key={id} className={`augment-card tier-${a.tier}`} onClick={() => onChoose(id)}>
                <div className="augment-icon">{a.icon}</div>
                <div className="augment-name">{a.name}</div>
                <div className="augment-desc">{a.description}</div>
              </button>
            );
          })}
        </div>
        <button className="reroll" disabled={state.rerolls <= 0} onClick={onReroll}>
          🎲 새로고침 (남은 횟수 {state.rerolls})
        </button>
      </div>
    </div>
  );
}
