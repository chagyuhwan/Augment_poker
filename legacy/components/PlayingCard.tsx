import { SUIT_SYMBOL, rankLabel } from '../game/cards';
import type { Card } from '../game/types';

interface Props {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, hidden, small, highlight, onClick }: Props) {
  const classes = ['card'];
  if (small) classes.push('small');
  if (highlight) classes.push('highlight');
  if (onClick) classes.push('clickable');

  if (!card || hidden) {
    classes.push('back');
    return <div className={classes.join(' ')} onClick={onClick} />;
  }

  const red = card.suit === 'h' || card.suit === 'd';
  if (red) classes.push('red');
  return (
    <div className={classes.join(' ')} onClick={onClick}>
      <span className="rank">{rankLabel(card.rank)}</span>
      <span className="suit">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}
