export type BotSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  fullscreen: boolean;
  botSpeed: BotSpeed;
}

export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  stats: Stats;
  achievements: string[];
}

interface DesktopBridge {
  steamInfo(): Promise<{ available: boolean; playerName: string | null }>;
  unlockAchievement(id: string): Promise<boolean>;
  loadSave(): Promise<SaveData | null>;
  writeSave(data: SaveData): Promise<boolean>;
  setFullscreen(value: boolean): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  onFullscreenChanged(cb: (value: boolean) => void): () => void;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

const desktop = window.desktop;
const LOCAL_KEY = 'augment-poker-save';

export const isDesktop = Boolean(desktop);

export const BOT_DELAY: Record<BotSpeed, number> = { slow: 1300, normal: 800, fast: 350 };

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: { fullscreen: false, botSpeed: 'normal' },
    stats: { gamesPlayed: 0, gamesWon: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
    achievements: [],
  };
}

function normalize(data: Partial<SaveData> | null): SaveData {
  const base = defaultSave();
  if (!data) return base;
  return {
    version: 1,
    settings: { ...base.settings, ...data.settings },
    stats: { ...base.stats, ...data.stats },
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
  };
}

export async function loadSave(): Promise<SaveData> {
  try {
    if (desktop) return normalize(await desktop.loadSave());
    const raw = localStorage.getItem(LOCAL_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSave();
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  if (desktop) await desktop.writeSave(data);
  else localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export async function getPlayerName(): Promise<string | null> {
  if (!desktop) return null;
  const info = await desktop.steamInfo();
  return info.available ? info.playerName : null;
}

export function unlockSteamAchievement(id: string) {
  void desktop?.unlockAchievement(id);
}

export async function setFullscreen(value: boolean): Promise<boolean> {
  if (desktop) return desktop.setFullscreen(value);
  if (value) await document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  return value;
}

export function onFullscreenChanged(cb: (value: boolean) => void): () => void {
  if (desktop) return desktop.onFullscreenChanged(cb);
  const handler = () => cb(Boolean(document.fullscreenElement));
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}

export function quitGame() {
  if (desktop) void desktop.quit();
  else window.close();
}
