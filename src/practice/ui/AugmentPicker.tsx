import { useCallback, useEffect, useRef, useState } from 'react';
import { AUGMENTS, KIND_LABEL, MAX_AUGMENT_SLOTS, TIER_LABEL } from '../game/augments';
import { AUGMENT_PICK_MS, byId } from '../game/engine';
import type { AugmentId, GameState } from '../game/types';

interface Props {
  state: GameState;
  paused: boolean;
  onChoose: (pick: AugmentId | null, replace: AugmentId | null) => void;
  onRerollAll: () => void;
  onRerollSlot: (index: number) => void;
}

const CONFIRM_ANIM_MS = 520;
const KEYS = ['1', '2', '3'] as const;
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

export function AugmentPicker({ state, paused, onChoose, onRerollAll, onRerollSlot }: Props) {
  const round = state.augmentRound!;
  const me = byId(state, state.heroId)!;
  const entry = round.entries[state.heroId];
  const offer = entry?.offer ?? [];
  const owned = me.augments;
  const full = owned.length >= MAX_AUGMENT_SLOTS;

  const [selected, setSelected] = useState<number | null>(null);
  const [replaceStep, setReplaceStep] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [peeking, setPeeking] = useState(false);
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;

  const remainingMs = useRemaining(round.deadline, paused);
  const done = !entry || entry.done;
  const locked = paused || confirming !== null || done;

  const finish = useCallback((index: number, replace: AugmentId | null) => {
    setConfirming(index);
    setPeeking(false);
    // 연출이 제한시간을 넘기면 엔진이 먼저 자동 선택해 버리므로 마감 전에 반드시 보낸다
    const delay = Math.min(CONFIRM_ANIM_MS, Math.max(0, round.deadline - Date.now() - 200));
    setTimeout(() => chooseRef.current(offer[index], replace), delay);
  }, [offer, round.deadline]);

  const confirm = (index: number) => {
    if (locked || !offer[index]) return;
    setSelected(index);
    if (full) setReplaceStep(true);
    else finish(index, null);
  };

  // 제한시간 직전에 고른 카드가 있으면 그걸로 확정한다(없으면 엔진이 시간 초과 시 자동 선택)
  useEffect(() => {
    if (locked || remainingMs > 600 || selected === null || full) return;
    finish(selected, null);
  }, [remainingMs, locked, selected, full, finish]);

  const selectOrConfirm = (index: number) => {
    if (locked) return;
    if (selected === index) confirm(index);
    else {
      setSelected(index);
      setReplaceStep(false);
    }
  };

  const rerollSlot = (index: number) => {
    if (locked || !entry || entry.rerolls <= 0) return;
    if (selected === index) setSelected(null);
    setReplaceStep(false);
    onRerollSlot(index);
  };

  const rerollAll = () => {
    if (locked || !entry || entry.rerolls <= 0) return;
    setSelected(null);
    setReplaceStep(false);
    onRerollAll();
  };

  useEffect(() => {
    if (locked) return;
    const onDown = (e: KeyboardEvent) => {
      const digit = DIGIT_CODES.indexOf(e.code);
      if (digit >= 0) {
        e.preventDefault();
        const idx = digit % 3;
        if (replaceStep) {
          const target = owned[idx];
          if (target && selected !== null) finish(selected, target.id);
          return;
        }
        if (!offer[idx]) return;
        if (e.shiftKey) rerollSlot(idx);
        else selectOrConfirm(idx);
      } else if ((e.code === 'Enter' || e.code === 'Space') && selected !== null && !replaceStep) {
        e.preventDefault();
        confirm(selected);
      } else if (e.code === 'KeyR' && !replaceStep) {
        e.preventDefault();
        rerollAll();
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setPeeking(true);
      } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !replaceStep) {
        e.preventDefault();
        const dir = e.code === 'ArrowLeft' ? -1 : 1;
        setSelected((s) => (s === null ? (dir > 0 ? 0 : offer.length - 1) : (s + dir + offer.length) % offer.length));
      } else if (e.code === 'Backspace' && replaceStep) {
        setReplaceStep(false);
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

  const seconds = Math.ceil(remainingMs / 1000);
  const ratio = remainingMs / AUGMENT_PICK_MS;
  const urgent = seconds <= 5;
  const canReroll = Boolean(entry && entry.rerolls > 0) && !locked && !replaceStep;
  const waitingOthers = Object.entries(round.entries).filter(([id, e]) => !e.done && Number(id) !== state.heroId).length;

  if (done && confirming === null) {
    return (
      <div className="aug-overlay aug-overlay--waiting" role="status" hidden={paused}>
        <div className="aug-overlay__veil" />
        <div className="aug-wait">
          <span className="aug-wait__spinner" aria-hidden="true" />
          <p className="aug-wait__title">{entry ? '선택 완료' : '증강 선택 중'}</p>
          <p className="aug-wait__desc">
            {waitingOthers > 0 ? `다른 플레이어 ${waitingOthers}명이 고르는 중입니다…` : '곧 다음 카드가 공개됩니다…'}
          </p>
          <div className={`aug-timer${urgent ? ' is-urgent' : ''}`}>
            <div className="aug-timer__bar">
              <div className="aug-timer__fill" style={{ transform: `scaleX(${ratio})` }} />
            </div>
            <span className="aug-timer__sec">{seconds}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`aug-overlay${peeking ? ' is-peeking' : ''}${confirming !== null ? ' is-confirming' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="증강 선택"
      hidden={paused}
    >
      <div className="aug-overlay__veil" />
      <div className="aug-stage">
        <header className="aug-stage__head">
          <p className="aug-stage__eyebrow">
            핸드 #{state.handNumber} · 증강 선택 {round.round}/2 · {TIER_LABEL[round.tier]}
          </p>
          <h2 className="aug-stage__title">{replaceStep ? '교체할 증강' : '하나 선택'}</h2>
          {me.folded && <p className="aug-stage__notice">이번 판은 폴드했습니다. 고른 증강은 다음 판부터 효과가 납니다.</p>}
          <div className={`aug-timer${urgent ? ' is-urgent' : ''}`} aria-label={`남은 시간 ${seconds}초`}>
            <div className="aug-timer__bar">
              <div className="aug-timer__fill" style={{ transform: `scaleX(${ratio})` }} />
            </div>
            <span className="aug-timer__sec">{seconds}</span>
          </div>
        </header>

        {replaceStep && selected !== null ? (
          <div className="aug-replace">
            <p className="aug-replace__lead">
              슬롯이 가득 찼습니다. <strong>{AUGMENTS[offer[selected]].name}</strong>을(를) 넣을 자리를 고르거나 받지 않을 수 있습니다.
            </p>
            <div className="aug-replace__row">
              {owned.map((o, i) => {
                const a = AUGMENTS[o.id];
                return (
                  <button key={o.id} type="button" className={`aug-owned tier-${a.tier}`} onClick={() => finish(selected, o.id)}>
                    <kbd>{KEYS[i]}</kbd>
                    <span className="aug-owned__icon">{a.icon}</span>
                    <span className="aug-owned__name">{a.name}</span>
                    <span className="aug-owned__kind">{KIND_LABEL[a.kind]}</span>
                    <span className="aug-owned__swap">이 증강과 교체</span>
                  </button>
                );
              })}
            </div>
            <div className="aug-actions">
              <button type="button" className="aug-peek" onClick={() => setReplaceStep(false)}>
                ← 후보로 돌아가기 <kbd>Backspace</kbd>
              </button>
              <button type="button" className="aug-confirm aug-confirm--ghost" onClick={() => {
                setConfirming(-1);
                setTimeout(() => chooseRef.current(null, null), 200);
              }}>
                받지 않고 기존 증강 유지
              </button>
              <span />
            </div>
          </div>
        ) : (
          <>
            <div className="aug-row">
              {offer.map((id, i) => {
                const a = AUGMENTS[id];
                const isSel = selected === i;
                const anim = confirming === null ? '' : confirming === i ? ' is-chosen' : ' is-dismissed';
                return (
                  <div key={`${i}-${id}`} className={`aug-slot tier-${a.tier}${isSel ? ' is-selected' : ''}${anim}`}>
                    <button
                      type="button"
                      className="aug-card"
                      aria-pressed={isSel}
                      onClick={() => selectOrConfirm(i)}
                      onDoubleClick={() => confirm(i)}
                    >
                      <div className="aug-card__frame" aria-hidden="true" />
                      <div className="aug-card__glow" aria-hidden="true" />
                      <kbd className="aug-card__key">{KEYS[i]}</kbd>
                      <span className="aug-card__kind">{KIND_LABEL[a.kind]}</span>
                      <div className="aug-card__icon-wrap">
                        <span className="aug-card__icon">{a.icon}</span>
                      </div>
                      <div className="aug-card__body">
                        <span className="aug-card__tier">{TIER_LABEL[a.tier]}</span>
                        <h3 className="aug-card__name">{a.name}</h3>
                        <p className="aug-card__desc">{a.description}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="aug-slot-reroll"
                      disabled={!canReroll}
                      onClick={() => rerollSlot(i)}
                      title={entry && entry.rerolls > 0 ? `이 증강만 새로고침 (Shift+${KEYS[i]})` : '새로고침 횟수를 모두 사용했습니다'}
                    >
                      <span className="aug-slot-reroll__icon" aria-hidden="true">
                        ↻
                      </span>
                      <span>{entry?.rerolls ?? 0}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <footer className="aug-actions">
              <button
                type="button"
                className="aug-peek"
                onPointerDown={() => setPeeking(true)}
                onPointerUp={() => setPeeking(false)}
                onPointerLeave={() => setPeeking(false)}
              >
                테이블 보기 <kbd>Tab</kbd>
              </button>
              <button
                type="button"
                className="aug-confirm"
                disabled={selected === null || locked}
                onClick={() => selected !== null && confirm(selected)}
              >
                {selected === null ? '증강을 고르세요' : `${AUGMENTS[offer[selected]].name} ${full ? '선택 · 교체' : '선택'}`}
                <kbd>Enter</kbd>
              </button>
              <button type="button" className="aug-reroll-all" disabled={!canReroll} onClick={rerollAll}>
                ↻ 전체 새로고침 <kbd>R</kbd>
              </button>
            </footer>
          </>
        )}

        <div className="aug-owned-bar" aria-label="보유 증강">
          <span className="aug-owned-bar__label">보유 증강 {owned.length}/{MAX_AUGMENT_SLOTS}</span>
          {Array.from({ length: MAX_AUGMENT_SLOTS }, (_, i) => {
            const o = owned[i];
            if (!o) return <span key={i} className="aug-owned-bar__slot is-empty">빈 슬롯</span>;
            const a = AUGMENTS[o.id];
            return (
              <span key={o.id} className={`aug-owned-bar__slot tier-${a.tier}`} title={a.description}>
                {a.icon} {a.name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
