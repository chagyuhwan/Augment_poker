import type { LedgerEntry, WalletOp, WalletResult } from '../../electron/walletCore.mjs';
import type { Resolution, WindowMode } from '../settings/settings';
import type { WalletSnapshot } from '../wallet/types';

export type BuildChannel = 'development' | 'release';

export interface AppInfo {
  version: string;
  channel: BuildChannel;
  isDesktop: boolean;
}

export interface SteamStatus {
  available: boolean;
  appId: number | null;
  steamId: string | null;
  playerName: string | null;
  /** Steam을 쓸 수 없을 때의 이유 */
  error: string | null;
}

export interface WindowState {
  mode: WindowMode;
  workArea: Resolution | null;
}

export type LogLevel = 'info' | 'warn' | 'error';

/** electron/preload.cjs가 노출하는 API */
interface DesktopApi {
  appInfo(): Promise<{ version: string; channel: BuildChannel }>;
  steamStatus(): Promise<SteamStatus>;
  loadSettings(): Promise<unknown>;
  saveSettings(data: unknown): Promise<boolean>;
  applyWindow(mode: WindowMode, resolution: Resolution): Promise<WindowState>;
  windowState(): Promise<WindowState>;
  onWindowModeChanged(listener: (mode: WindowMode) => void): () => void;
  walletGet(): Promise<WalletSnapshot>;
  walletHistory(): Promise<LedgerEntry[]>;
  walletOp(op: WalletOp): Promise<WalletResult | { ok: false; error: string; account: null }>;
  openLogFolder(): Promise<void>;
  log(level: LogLevel, message: string): void;
  quit(): Promise<void>;
}

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export const desktop = typeof window !== 'undefined' ? window.desktop : undefined;
const BROWSER_SETTINGS_KEY = 'augmented-poker-settings';

/** Electron 밖(vite dev 브라우저)에서도 UI 개발이 가능하도록 같은 API를 대체 구현한다. */
export const bridge = {
  isDesktop: Boolean(desktop),

  async appInfo(): Promise<AppInfo> {
    if (desktop) return { ...(await desktop.appInfo()), isDesktop: true };
    return { version: __APP_VERSION__, channel: 'development', isDesktop: false };
  },

  async steamStatus(): Promise<SteamStatus> {
    if (desktop) return desktop.steamStatus();
    return {
      available: false,
      appId: null,
      steamId: null,
      playerName: null,
      error: '브라우저 개발 모드에서는 Steam을 사용할 수 없습니다.',
    };
  },

  async loadSettings(): Promise<unknown> {
    if (desktop) return desktop.loadSettings();
    try {
      const raw = localStorage.getItem(BROWSER_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveSettings(data: unknown): Promise<void> {
    if (desktop) {
      await desktop.saveSettings(data);
      return;
    }
    localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(data));
  },

  async applyWindow(mode: WindowMode, resolution: Resolution): Promise<WindowState> {
    if (desktop) return desktop.applyWindow(mode, resolution);
    if (mode === 'fullscreen' && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (mode === 'windowed' && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
    return { mode, workArea: null };
  },

  async windowState(): Promise<WindowState> {
    if (desktop) return desktop.windowState();
    return { mode: document.fullscreenElement ? 'fullscreen' : 'windowed', workArea: null };
  },

  onWindowModeChanged(listener: (mode: WindowMode) => void): () => void {
    if (desktop) return desktop.onWindowModeChanged(listener);
    const handler = () => listener(document.fullscreenElement ? 'fullscreen' : 'windowed');
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  },

  async openLogFolder(): Promise<void> {
    await desktop?.openLogFolder();
  },

  log(level: LogLevel, message: string): void {
    if (desktop) desktop.log(level, message);
    else console[level](message);
  },

  async quit(): Promise<void> {
    if (desktop) await desktop.quit();
    else window.close();
  },
};
