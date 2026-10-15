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
  lanLocalAddresses(): Promise<string[]>;
  lanStatus(): Promise<{
    role: 'idle' | 'host' | 'guest';
    port: number;
    addresses: string[];
    peerCount: number;
    connected: boolean;
  }>;
  lanHostStart(opts?: { port?: number }): Promise<
    | { ok: true; port: number; addresses: string[]; role: 'host' }
    | { ok: false; error: string }
  >;
  lanConnect(opts: { host: string; port?: number }): Promise<
    | { ok: true; port: number; host: string; role: 'guest' }
    | { ok: false; error: string }
  >;
  lanSend(peerId: string, msg: unknown): Promise<boolean>;
  lanBroadcast(msg: unknown, exceptPeerId?: string | null): Promise<number>;
  lanShutdown(): Promise<{ ok: true }>;
  onLanMessage(listener: (payload: { from: string; msg: unknown }) => void): () => void;
  onLanPeer(listener: (payload: { type: 'connected' | 'disconnected'; peerId: string }) => void): () => void;
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

  async lanLocalAddresses(): Promise<string[]> {
    if (desktop) return desktop.lanLocalAddresses();
    return [];
  },

  async lanStatus() {
    if (desktop) return desktop.lanStatus();
    return { role: 'idle' as const, port: 17845, addresses: [], peerCount: 0, connected: false };
  },

  async lanHostStart(opts?: { port?: number }) {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (!api?.lanHostStart) {
      return {
        ok: false as const,
        error: 'LAN API가 없습니다. Electron을 재시작해 주세요.',
      };
    }
    try {
      return await api.lanHostStart(opts);
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async lanConnect(opts: { host: string; port?: number }) {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (!api?.lanConnect) {
      return { ok: false as const, error: 'LAN API가 없습니다. Electron을 재시작해 주세요.' };
    }
    try {
      return await api.lanConnect(opts);
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async lanSend(peerId: string, msg: unknown) {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (!api?.lanSend) return false;
    return api.lanSend(peerId, msg);
  },

  async lanBroadcast(msg: unknown, exceptPeerId?: string | null) {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (!api?.lanBroadcast) return 0;
    return api.lanBroadcast(msg, exceptPeerId);
  },

  async lanShutdown() {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (api?.lanShutdown) return api.lanShutdown();
    return { ok: true as const };
  },

  onLanMessage(listener: (payload: { from: string; msg: unknown }) => void): () => void {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (api?.onLanMessage) return api.onLanMessage(listener);
    return () => {};
  },

  onLanPeer(listener: (payload: { type: 'connected' | 'disconnected'; peerId: string }) => void): () => void {
    const api = typeof window !== 'undefined' ? window.desktop : desktop;
    if (api?.onLanPeer) return api.onLanPeer(listener);
    return () => {};
  },
};
