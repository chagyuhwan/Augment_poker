import { AUGMENTS, TIER_LABEL } from '../game/augments';
import type { GameState, Player } from '../game/types';
import { PlayingCard } from './PlayingCard';

interface Props {
  state: GameState;
  player: Player;
  position: 'bottom' | 'left' | 'top' | 'right';
  onCardClick?: (index: number) => void;
}

export function Seat({ state, player, position, onCardClick }: Props) {
  const isTurn = state.phase === 'betting' && state.currentPlayer === player.id;
  const isWinner = state.phase === 'handOver' && state.result?.winnerIds.includes(player.id);
  const showAll = player.isHuman || (state.phase === 'handOver' && state.result?.showdown && !player.folded);
  const revealedIdx = state.revealed[player.id];
  const augment = player.augment ? AUGMENTS[player.augment] : null;

  const classes = ['seat', position];
  if (isTurn) classes.push('turn');
  if (player.folded) classes.push('folded');
  if (player.out) classes.push('out');
  if (isWinner) classes.push('winner');

  return (
    <div className={classes.join(' ')}>
      <div className="seat-cards">
        {player.hole.map((c, i) => (
          <PlayingCard
            key={i}
            card={c}
            hidden={!showAll && revealedIdx !== i}
            highlight={!player.isHuman && revealedIdx === i && !showAll}
            onClick={onCardClick ? () => onCardClick(i) : undefined}
          />
        ))}
      </div>
      <div className="seat-info">
        <div className="seat-name">
          {player.name}
          {state.dealer === player.id && <span className="dealer-btn">D</span>}
        </div>
        <div className="seat-chips">{player.out ? '탈락' : `${player.chips.toLocaleString()} 칩`}</div>
        {augment && (
          <div className={`seat-augment tier-${augment.tier}`} title={`[${TIER_LABEL[augment.tier]}] ${augment.description}`}>
            {augment.icon} {augment.name}
          </div>
        )}
        {player.lastAction && <div className="seat-action">{player.lastAction}</div>}
      </div>
      {player.bet > 0 && <div className="seat-bet">{player.bet}</div>}
    </div>
  );
}
