import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio } from '../audio/audioEngine';
import { bridge, type WindowState } from '../platform/desktopBridge';
import { DEFAULT_SETTINGS, sanitizeSettings, type GameSettings } from '../settings/settings';

interface SettingsValue {
  settings: GameSettings;
  windowState: WindowState;
  update(patch: Partial<GameSettings>): void;
  reset(): void;
}

const SettingsContext = createContext<SettingsValue | null>(null);
const SAVE_DELAY_MS = 300;

export async function loadInitialSettings(): Promise<GameSettings> {
  return sanitizeSettings(await bridge.loadSettings());
}

export function SettingsProvider({ initial, children }: { initial: GameSettings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const [windowState, setWindowState] = useState<WindowState>({ mode: initial.windowMode, workArea: null });
  const saveTimer = useRef<number | null>(null);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
  }, [settings.masterVolume, settings.musicVolume, settings.sfxVolume]);

  useEffect(() => {
    let cancelled = false;
    bridge.applyWindow(settings.windowMode, settings.resolution).then((state) => {
      if (!cancelled) setWindowState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.windowMode, settings.resolution]);

  // F11이나 OS 조작으로 전체화면이 바뀌면 설정에도 반영
  useEffect(
    () =>
      bridge.onWindowModeChanged((mode) => {
        setSettings((s) => (s.windowMode === mode ? s : { ...s, windowMode: mode }));
      }),
    [],
  );

  const persist = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void bridge.saveSettings(latest.current);
    }, SAVE_DELAY_MS);
  }, []);

  useEffect(() => {
    if (settings !== initial) persist();
  }, [settings, initial, persist]);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        void bridge.saveSettings(latest.current);
      }
    },
    [],
  );

  const update = useCallback((patch: Partial<GameSettings>) => {
    setSettings((s) => sanitizeSettings({ ...s, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setSettings((s) => ({ ...DEFAULT_SETTINGS, resolution: s.resolution, windowMode: s.windowMode }));
  }, []);

  const value = useMemo(() => ({ settings, windowState, update, reset }), [settings, windowState, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
