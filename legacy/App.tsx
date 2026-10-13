import { useCallback, useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, checkHandAchievements, type AchievementDef } from './game/achievements';
import { createGame, potSize } from './game/engine';
import type { GameState } from './game/types';
import { AchievementsPanel } from './components/AchievementsPanel';
import { GameScreen } from './components/GameScreen';
import { MainMenu } from './components/MainMenu';
import { SettingsPanel } from './components/SettingsPanel';
import { Stage } from './components/Stage';
import {
  BOT_DELAY,
  getPlayerName,
  loadSave,
  onFullscreenChanged,
  quitGame,
  setFullscreen,
  unlockSteamAchievement,
  writeSave,
  type SaveData,
  type Settings,
} from './platform';

type Overlay = 'pause' | 'settings' | 'achievements';

export default function App() {
  const [save, setSave] = useState<SaveData | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [toasts, setToasts] = useState<AchievementDef[]>([]);
  const processedHand = useRef<string | null>(null);

  const topOverlay = overlays[overlays.length - 1];
  const openOverlay = (o: Overlay) => setOverlays((list) => [...list, o]);
  const closeOverlay = () => setOverlays((list) => list.slice(0, -1));

  useEffect(() => {
    loadSave().then((data) => {
      // 오프라인에서 달성한 업적도 Steam에 반영
      for (const id of data.achievements) unlockSteamAchievement(id);
      setSave(data);
    });
    getPlayerName().then(setPlayerName);
  }, []);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
    if (save) void writeSave(save);
  }, [save]);

  useEffect(
    () =>
      onFullscreenChanged((value) =>
        setSave((s) => (s && s.settings.fullscreen !== value ? { ...s, settings: { ...s.settings, fullscreen: value } } : s)),
      ),
    [],
  );

  const changeSettings = useCallback((patch: Partial<Settings>) => {
    if (patch.fullscreen !== undefined) void setFullscreen(patch.fullscreen);
    setSave((s) => (s ? { ...s, settings: { ...s.settings, ...patch } } : s));
  }, []);

  const unlock = useCallback((ids: string[]) => {
    const current = saveRef.current;
    if (!current) return;
    const fresh = ids.filter((id) => !current.achievements.includes(id));
    if (fresh.length === 0) return;
    for (const id of fresh) unlockSteamAchievement(id);
    const defs = fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean) as AchievementDef[];
    setToasts((t) => [...t, ...defs]);
    saveRef.current = { ...current, achievements: [...current.achievements, ...fresh] };
    setSave((s) => (s ? { ...s, achievements: [...new Set([...s.achievements, ...fresh])] } : s));
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  // 핸드/게임 종료 시 통계와 업적 처리
  useEffect(() => {
    if (!game) return;
    const key = `${game.handNumber}:${game.phase}`;
    if (processedHand.current === key) return;

    if (game.phase === 'handOver') {
      processedHand.current = key;
      const pot = potSize(game);
      const won = game.result?.winnerIds.includes(0) ?? false;
      setSave((s) =>
        s
          ? {
              ...s,
              stats: {
                ...s.stats,
                handsPlayed: s.stats.handsPlayed + 1,
                handsWon: s.stats.handsWon + (won ? 1 : 0),
                biggestPot: won ? Math.max(s.stats.biggestPot, pot) : s.stats.biggestPot,
              },
            }
          : s,
      );
      unlock(checkHandAchievements(game, pot));
    } else if (game.phase === 'gameOver') {
      processedHand.current = key;
      const me = game.players[0];
      if (!me.out && me.chips > 0) {
        setSave((s) => (s ? { ...s, stats: { ...s.stats, gamesWon: s.stats.gamesWon + 1 } } : s));
        unlock(['ACH_WIN_GAME']);
      }
    }
  }, [game, unlock]);

  const newGame = () => {
    processedHand.current = null;
    setGame(createGame());
    setOverlays([]);
    setSave((s) => (s ? { ...s, stats: { ...s.stats, gamesPlayed: s.stats.gamesPlayed + 1 } } : s));
  };

  const exitToMenu = () => {
    setGame(null);
    setOverlays([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F11') {
        e.preventDefault();
        if (save) changeSettings({ fullscreen: !save.settings.fullscreen });
      } else if (e.code === 'Escape') {
        if (overlays.length > 0) closeOverlay();
        else if (game) openOverlay('pause');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlays, game, save, changeSettings]);

  if (!save) {
    return (
      <Stage>
        <div className="loading">불러오는 중...</div>
      </Stage>
    );
  }

  return (
    <Stage>
      {game ? (
        <GameScreen
          state={game}
          setState={setGame}
          botDelay={BOT_DELAY[save.settings.botSpeed]}
          paused={overlays.length > 0}
          onPause={() => openOverlay('pause')}
          onExitToMenu={exitToMenu}
          onRestart={newGame}
        />
      ) : (
        <MainMenu
          playerName={playerName}
          stats={save.stats}
          onNewGame={newGame}
          onSettings={() => openOverlay('settings')}
          onAchievements={() => openOverlay('achievements')}
          onQuit={quitGame}
        />
      )}

      {topOverlay === 'pause' && (
        <div className="overlay">
          <div className="panel pause">
            <h2>일시 정지</h2>
            <div className="menu-buttons">
              <button className="menu-btn primary" onClick={closeOverlay}>
                계속하기
              </button>
              <button className="menu-btn" onClick={() => openOverlay('settings')}>
                설정
              </button>
              <button className="menu-btn" onClick={exitToMenu}>
                메인 메뉴로
              </button>
            </div>
          </div>
        </div>
      )}
      {topOverlay === 'settings' && (
        <SettingsPanel settings={save.settings} onChange={changeSettings} onClose={closeOverlay} />
      )}
      {topOverlay === 'achievements' && <AchievementsPanel unlocked={save.achievements} onClose={closeOverlay} />}

      {toasts[0] && (
        <div className="toast" key={toasts[0].id}>
          <div className="toast-icon">🏆</div>
          <div>
            <div className="toast-title">업적 달성: {toasts[0].name}</div>
            <div className="toast-desc">{toasts[0].description}</div>
          </div>
        </div>
      )}
    </Stage>
  );
}
