import { useEffect, useMemo, useState } from 'react';
import { audio } from '../../audio/audioEngine';
import { AUGMENTS, KIND_LABEL, TIER_LABEL, type Augment, type AugmentKind } from '../../practice/game/augments';
import type { AugmentId, AugmentTier } from '../../practice/game/types';
import { ScreenHeader } from '../components/ScreenHeader';

type TierFilter = 'all' | AugmentTier;
type KindFilter = 'all' | AugmentKind;

const TIER_ORDER: Record<AugmentTier, number> = { prismatic: 0, gold: 1, silver: 2 };
const ALL = Object.values(AUGMENTS).sort(
  (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name, 'ko'),
);

const TIER_FILTERS: { id: TierFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'prismatic', label: '프리즘' },
  { id: 'gold', label: '골드' },
  { id: 'silver', label: '실버' },
];

const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '모든 종류' },
  { id: 'oneShot', label: '일회용' },
  { id: 'persistent', label: '지속형' },
  { id: 'special', label: '특수' },
];

function noteFor(a: Augment): string | null {
  const bits: string[] = [];
  if (a.onlyRound1) bits.push('1차 선택에서만 등장');
  if (a.copyable === false && a.kind !== 'special') bits.push('복제 불가');
  if (a.copyable) bits.push('능력 복제 가능');
  if (!a.botUsable) bits.push('봇은 사용 안 함');
  return bits.length ? bits.join(' · ') : null;
}

export function AugmentCodexScreen() {
  const [tier, setTier] = useState<TierFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [selectedId, setSelectedId] = useState<AugmentId>(ALL[0].id);

  const list = useMemo(
    () => ALL.filter((a) => (tier === 'all' || a.tier === tier) && (kind === 'all' || a.kind === kind)),
    [tier, kind],
  );

  useEffect(() => {
    if (list.length && !list.some((a) => a.id === selectedId)) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const selected = AUGMENTS[selectedId] ?? list[0] ?? ALL[0];

  return (
    <div className="screen codex">
      <ScreenHeader
        title="증강 도감"
        subtitle="한 판에 최대 2개. 판이 끝나면 초기화됩니다. 총 20종."
      />

      <div className="codex__toolbar">
        <div className="codex__filters" role="tablist" aria-label="등급">
          {TIER_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={tier === f.id}
              className={`codex__chip${tier === f.id ? ' is-active' : ''}${f.id !== 'all' ? ` tier-${f.id}` : ''}`}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('click');
                setTier(f.id);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="codex__filters" role="tablist" aria-label="종류">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={kind === f.id}
              className={kind === f.id ? 'codex__chip is-active' : 'codex__chip'}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('click');
                setKind(f.id);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="codex__count">{list.length}종</span>
      </div>

      <div className="codex__layout">
        <div className="codex__grid" role="list">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              role="listitem"
              className={`codex-card tier-${a.tier}${selected.id === a.id ? ' is-selected' : ''}`}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('click');
                setSelectedId(a.id);
              }}
            >
              <span className="codex-card__icon">{a.icon}</span>
              <span className="codex-card__body">
                <span className="codex-card__name">{a.name}</span>
                <span className="codex-card__meta">
                  {TIER_LABEL[a.tier]} · {KIND_LABEL[a.kind]}
                </span>
              </span>
            </button>
          ))}
          {list.length === 0 && <p className="codex__empty">해당 조건의 증강이 없습니다.</p>}
        </div>

        <aside className={`codex__detail tier-${selected.tier}`}>
          <div className="codex__detail-icon">{selected.icon}</div>
          <h2 className="codex__detail-name">{selected.name}</h2>
          <div className="codex__detail-badges">
            <span className={`codex__badge tier-${selected.tier}`}>{TIER_LABEL[selected.tier]}</span>
            <span className="codex__badge">{KIND_LABEL[selected.kind]}</span>
          </div>
          <p className="codex__detail-desc">{selected.description}</p>
          {noteFor(selected) && <p className="codex__detail-note">{noteFor(selected)}</p>}
        </aside>
      </div>
    </div>
  );
}
