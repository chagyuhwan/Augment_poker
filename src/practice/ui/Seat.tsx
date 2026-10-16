import { AUGMENTS, KIND_LABEL, TIER_LABEL } from '../game/augments';
import type { GameState, Player } from '../game/types';
import { PlayingCard } from './PlayingCard';

interface Props {
  state: GameState;
  player: Player;
  position: string;
  onCardClick?: (index: number) => void;
}

const STATUS_LABEL: Partial<Record<Player['status'], string>> = {
  waiting: '다음 판 참가 대기',
  leaving: '퇴장 예정',
  busted: '칩 소진 · 복구 대기',
};

export function Seat({ state, player, position, onCardClick }: Props) {
  const isHero = player.id === state.heroId;
  const isTurn = state.phase === 'betting' && state.currentPlayer === player.id;
  const isWinner = state.phase === 'handOver' && state.result?.winnerIds.includes(player.id);
  const showAll = isHero || (state.phase === 'handOver' && state.result?.showdown && player.inHand && !player.folded);
  const revealedIdx = state.revealed[player.id] ?? [];
  const forceAll = state.effects.forceRevealed.includes(player.id);
  const statusLabel = STATUS_LABEL[player.status];
  const net = state.phase === 'handOver' ? state.result?.net[player.id] : undefined;

  const classes = ['seat', position];
  if (isTurn) classes.push('turn');
  if (player.folded) classes.push('folded');
  if (player.status === 'busted') classes.push('out');
  if (player.status === 'waiting') classes.push('is-waiting');
  if (isWinner) classes.push('winner');

  return (
    <div className={classes.join(' ')} data-seat={player.seat}>
      <div className="seat-cards">
        {player.inHand &&
          player.hole.map((c, i) => {
            const face = showAll || forceAll || revealedIdx.includes(i);
            return (
              <PlayingCard
                key={c.id}
                card={c}
                hidden={!face}
                highlight={!isHero && revealedIdx.includes(i) && !showAll}
                onClick={onCardClick ? () => onCardClick(i) : undefined}
              />
            );
          })}
      </div>
      <div className="seat-info">
        <div className="seat-name">
          {player.name}
          {state.phase !== 'waiting' && player.inHand && state.dealerSeat === player.seat && <span className="dealer-btn">D</span>}
        </div>
        <div className="seat-chips">{player.chips.toLocaleString()}</div>
        {statusLabel && <div className="seat-status">{statusLabel}</div>}
        {!player.connected && <div className="seat-status">연결 끊김</div>}
        {state.mode === 'augmented' && player.augments.length > 0 && (
          <div className="seat-augments">
            {player.augments.map((o) => {
              const a = AUGMENTS[o.id];
              return (
                <span
                  key={o.id}
                  className={`seat-augment tier-${a.tier}`}
                  title={`${a.name} · ${TIER_LABEL[a.tier]} · ${KIND_LABEL[a.kind]}\n${a.description}`}
                >
                  {a.icon}
                </span>
              );
            })}
          </div>
        )}
        {net !== undefined && net !== 0 ? (
          <div className={net > 0 ? 'seat-net is-plus' : 'seat-net is-minus'}>
            {net > 0 ? '+' : ''}
            {net.toLocaleString()}
          </div>
        ) : (
          player.lastAction && <div className="seat-action">{player.lastAction}</div>
        )}
      </div>
      {player.bet > 0 && <div className="seat-bet">{player.bet.toLocaleString()}</div>}
    </div>
  );
}

export function EmptySeat({ position }: { position: string }) {
  return (
    <div className={`seat seat--empty ${position}`}>
      <div className="seat-info">빈 자리</div>
    </div>
  );
}
