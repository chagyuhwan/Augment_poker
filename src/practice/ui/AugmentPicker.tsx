import { useCallback, useEffect, useRef, useState } from 'react';
import { AUGMENTS, KIND_LABEL, MAX_AUGMENT_SLOTS, TIER_LABEL } from '../game/augments';
import { byId } from '../game/engine';
import type { AugmentId, GameState } from '../game/types';

interface Props {
  state: GameState;
  paused: boolean;
  onChoose: (pick: AugmentId | null, replace: AugmentId | null) => void;
}

const CONFIRM_ANIM_MS = 520;
const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];

function useRemaining(deadline: number, paused: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [paused]);
  return Math.max(0, deadline - now);
}

export function AugmentPicker({ state, paused, onChoose }: Props) {
  const round = state.augmentRound!;
  const me = byId(state, state.heroId)!;
  const entry = round.entries[state.heroId];
  const offer = entry?.offer ?? [];
  const owned = me.augments;

  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [peeking, setPeeking] = useState(false);
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;

  const remainingMs = useRemaining(round.deadline, paused);
  const done = !entry || entry.done;
  const locked = paused || confirming !== null || done;
  const sec = Math.ceil(remainingMs / 1000);
  const urgent = sec <= 5;

  const finish = useCallback(
    (index: number) => {
      setConfirming(index);
      setPeeking(false);
      const delay = Math.min(CONFIRM_ANIM_MS, Math.max(0, round.deadline - Date.now() - 200));
      setTimeout(() => chooseRef.current(offer[index], null), delay);
    },
    [offer, round.deadline],
  );

  const confirm = (index: number) => {
    if (locked || !offer[index]) return;
    setSelected(index);
    finish(index);
  };

  useEffect(() => {
    if (locked || remainingMs > 600 || selected === null) return;
    finish(selected);
  }, [remainingMs, locked, selected, finish]);

  const selectOrConfirm = (index: number) => {
    if (locked) return;
    if (selected === index) confirm(index);
    else setSelected(index);
  };

  useEffect(() => {
    if (locked) return;
    const onDown = (e: KeyboardEvent) => {
      const digit = DIGIT_CODES.indexOf(e.code);
      if (digit >= 0) {
        e.preventDefault();
        const idx = digit % 3;
        if (!offer[idx]) return;
        selectOrConfirm(idx);
      } else if ((e.code === 'Enter' || e.code === 'Space') && selected !== null) {
        e.preventDefault();
        confirm(selected);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setPeeking(true);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        setSelected((s) =>
          s === null ? (dir > 0 ? 0 : offer.length - 1) : (s + dir + offer.length) % offer.length,
        );
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setPeeking(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  });

  if (done) {
    return (
      <div className={`aug-overlay${peeking ? ' is-peeking' : ''}`}>
        <div className="aug-overlay__veil" />
        <div className="aug-wait">
          <p className="aug-stage__wait">다른 플레이어 선택 대기…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`aug-overlay${peeking ? ' is-peeking' : ''}${confirming !== null ? ' is-confirming' : ''}`}>
      <div className="aug-overlay__veil" />
      <div className="aug-stage">
        <div className="aug-stage__head">
          <p className="aug-stage__eyebrow">
            핸드 #{state.handNumber} · 증강 선택 {round.round}/2 · {TIER_LABEL[round.tier]}
          </p>
          <h2 className="aug-stage__title">하나 선택</h2>
          <div className={`aug-timer${urgent ? ' is-urgent' : ''}`}>
            <div className="aug-timer__bar">
              <div className="aug-timer__fill" style={{ transform: `scaleX(${Math.max(0.02, remainingMs / 15_000)})` }} />
            </div>
            <span className="aug-timer__sec">{sec}</span>
          </div>
        </div>

        <div className="aug-row">
          {offer.map((id, i) => {
            const a = AUGMENTS[id];
            if (!a) return null;
            const isSel = selected === i;
            const isConf = confirming === i;
            const dismissed = confirming !== null && confirming !== i;
            return (
              <div
                key={`${id}-${i}-${entry?.rerolled ? 'r' : '0'}`}
                className={`aug-slot tier-${a.tier}${isSel ? ' is-selected' : ''}${isConf ? ' is-chosen' : ''}${dismissed ? ' is-dismissed' : ''}`}
              >
                <button
                  type="button"
                  className="aug-card"
                  disabled={locked}
                  onClick={() => selectOrConfirm(i)}
                  onDoubleClick={() => confirm(i)}
                >
                  <span className="aug-card__key">{i + 1}</span>
                  <span className="aug-card__glow" aria-hidden />
                  <span className="aug-card__frame" aria-hidden />
                  <span className="aug-card__icon-wrap">
                    <span className="aug-card__icon">{a.icon}</span>
                  </span>
                  <span className="aug-card__body">
                    <span className="aug-card__tier">
                      {KIND_LABEL[a.kind]} · {TIER_LABEL[a.tier]}
                    </span>
                    <span className="aug-card__name">{a.name}</span>
                    <span className="aug-card__desc">{a.description}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="aug-actions">
          <button
            type="button"
            className="aug-peek pbtn"
            onPointerDown={() => setPeeking(true)}
            onPointerUp={() => setPeeking(false)}
            onPointerLeave={() => setPeeking(false)}
          >
            테이블 보기 <kbd>Tab</kbd>
          </button>
          <button
            type="button"
            className="aug-confirm pbtn raise"
            disabled={selected === null || locked}
            onClick={() => selected !== null && confirm(selected)}
          >
            {offer[selected ?? -1] === 'rerollFate' ? '재추첨' : '증강 고르기'} <kbd>Enter</kbd>
          </button>
        </div>

        <div className="aug-owned-bar">
          <span className="aug-owned-bar__label">
            보유 {owned.length}/{MAX_AUGMENT_SLOTS}
            {entry?.rerolled ? ' · 재추첨함' : ''}
          </span>
          {Array.from({ length: MAX_AUGMENT_SLOTS }, (_, i) => {
            const o = owned[i];
            if (!o) return <span key={i} className="aug-owned-bar__slot is-empty" title="빈 슬롯" />;
            const a = AUGMENTS[o.id];
            return (
              <span key={o.id} className={`aug-owned-bar__slot tier-${a.tier}`} title={`${a.name}\n${a.description}`}>
                {a.icon} {a.name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
