import { useState } from 'react';
import type { RulesTab } from '../../app/navigation';
import { audio } from '../../audio/audioEngine';
import { PlayingCard, parseCards } from '../components/PlayingCard';
import { ScreenHeader } from '../components/ScreenHeader';
import { HAND_RANKS, RULES_PAGES } from '../content/rules';

export function RulesScreen({ initialTab }: { initialTab: RulesTab }) {
  const [tab, setTab] = useState<RulesTab>(initialTab);
  const page = RULES_PAGES.find((p) => p.tab === tab) ?? RULES_PAGES[0];

  return (
    <div className="screen rules">
      <ScreenHeader title="게임 규칙" subtitle="모드별 진행 방식과 족보를 확인하세요." />
      <div className="rules__layout">
        <nav className="side-tabs">
          {RULES_PAGES.map((p) => (
            <button
              key={p.tab}
              type="button"
              className={p.tab === tab ? 'side-tabs__item is-active' : 'side-tabs__item'}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('click');
                setTab(p.tab);
              }}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <article className="rules__content" key={page.tab}>
          <h2 className="rules__title">{page.title}</h2>
          <p className="rules__lead">{page.lead}</p>

          {page.tab === 'hands' && (
            <ol className="hand-ranks">
              {HAND_RANKS.map((h, i) => (
                <li key={h.name} className="hand-rank">
                  <span className="hand-rank__no">{i + 1}</span>
                  <div className="hand-rank__text">
                    <span className="hand-rank__name">{h.name}</span>
                    <span className="hand-rank__desc">{h.desc}</span>
                  </div>
                  <div className="hand-rank__cards">
                    {parseCards(h.cards).map((c, j) => (
                      <PlayingCard key={j} rank={c.rank} suit={c.suit} size="xs" />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {page.sections.map((section) => (
            <section key={section.heading} className="rules__section">
              <h3>{section.heading}</h3>
              {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
              {section.steps && (
                <ol className="rules__steps">
                  {section.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {section.bullets && (
                <ul className="rules__bullets">
                  {section.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
