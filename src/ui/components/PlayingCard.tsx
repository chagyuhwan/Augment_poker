import type { CSSProperties } from 'react';

export type CardSuit = 's' | 'h' | 'd' | 'c';

const SUIT_GLYPH: Record<CardSuit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED: ReadonlySet<CardSuit> = new Set(['h', 'd']);

export function PlayingCard({
  rank,
  suit,
  faceDown = false,
  size = 'md',
  className,
  style,
}: {
  rank?: string;
  suit?: CardSuit;
  faceDown?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
}) {
  const classes = ['pcard', `pcard--${size}`, className].filter(Boolean);
  if (faceDown || !rank || !suit) {
    classes.push('pcard--back');
    return (
      <div className={classes.join(' ')} style={style} aria-label="뒷면 카드">
        <div className="pcard__back-pattern" />
      </div>
    );
  }
  if (RED.has(suit)) classes.push('pcard--red');
  const glyph = SUIT_GLYPH[suit];
  return (
    <div className={classes.join(' ')} style={style} aria-label={`${rank}${glyph}`}>
      <span className="pcard__corner">
        <span className="pcard__rank">{rank}</span>
        <span className="pcard__suit">{glyph}</span>
      </span>
      <span className="pcard__pip">{glyph}</span>
      <span className="pcard__corner pcard__corner--bottom">
        <span className="pcard__rank">{rank}</span>
        <span className="pcard__suit">{glyph}</span>
      </span>
    </div>
  );
}

/** "As Kh" 같은 표기를 카드 목록으로 바꾼다. 10은 T로 쓴다. */
export function parseCards(text: string): { rank: string; suit: CardSuit }[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ rank: token[0] === 'T' ? '10' : token[0], suit: token[1] as CardSuit }));
}
