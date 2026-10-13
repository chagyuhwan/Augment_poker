import { ACHIEVEMENTS } from '../game/achievements';

interface Props {
  unlocked: string[];
  onClose: () => void;
}

export function AchievementsPanel({ unlocked, onClose }: Props) {
  return (
    <div className="overlay">
      <div className="panel achievements">
        <h2>
          업적 ({unlocked.length}/{ACHIEVEMENTS.length})
        </h2>
        <div className="achievement-list">
          {ACHIEVEMENTS.map((a) => {
            const done = unlocked.includes(a.id);
            return (
              <div key={a.id} className={`achievement ${done ? 'done' : ''}`}>
                <div className="achievement-icon">{done ? '🏆' : '🔒'}</div>
                <div>
                  <div className="achievement-name">{a.name}</div>
                  <div className="achievement-desc">{a.description}</div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn raise" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
