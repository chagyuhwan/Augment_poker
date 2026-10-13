import { isDesktop, type Stats } from '../platform';

interface Props {
  playerName: string | null;
  stats: Stats;
  onNewGame: () => void;
  onSettings: () => void;
  onAchievements: () => void;
  onQuit: () => void;
}

export function MainMenu({ playerName, stats, onNewGame, onSettings, onAchievements, onQuit }: Props) {
  const winRate = stats.handsPlayed ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : 0;
  return (
    <div className="main-menu">
      <div className="menu-title">
        <div className="menu-logo">증강 포커</div>
        <div className="menu-sub">AUGMENT POKER</div>
        {playerName && <div className="menu-player">환영합니다, {playerName}님</div>}
      </div>

      <div className="menu-buttons">
        <button className="menu-btn primary" onClick={onNewGame}>
          새 게임
        </button>
        <button className="menu-btn" onClick={onAchievements}>
          업적
        </button>
        <button className="menu-btn" onClick={onSettings}>
          설정
        </button>
        {isDesktop && (
          <button className="menu-btn" onClick={onQuit}>
            게임 종료
          </button>
        )}
      </div>

      <div className="menu-stats">
        <span>게임 {stats.gamesPlayed}판</span>
        <span>우승 {stats.gamesWon}회</span>
        <span>핸드 승률 {winRate}%</span>
        <span>최대 팟 {stats.biggestPot.toLocaleString()}</span>
      </div>
    </div>
  );
}
