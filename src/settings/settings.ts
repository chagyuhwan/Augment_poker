export type WindowMode = 'fullscreen' | 'windowed';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type UiScale = 'small' | 'normal' | 'large';
export type Language = 'ko';
export type BotSpeed = 'slow' | 'normal' | 'fast';
/** 3D 테이블 품질. low: 그림자·후처리 없음, medium: 그림자, high: 그림자 + 후처리(블룸·비네트·SMAA) */
export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface Resolution {
  width: number;
  height: number;
}

export const SETTINGS_VERSION = 2;

export interface GameSettings {
  /** 1 → 2: graphicsQuality, reduceMotion 추가 (이전 파일은 기본값으로 채운다) */
  version: typeof SETTINGS_VERSION;
  windowMode: WindowMode;
  /** 창 모드일 때의 창 크기 */
  resolution: Resolution;
  /** 0~100 */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  animationSpeed: AnimationSpeed;
  uiScale: UiScale;
  language: Language;
  chatNotifications: boolean;
  /** 봇 대전에서 AI가 행동하기까지 기다리는 속도 */
  botSpeed: BotSpeed;
  graphicsQuality: GraphicsQuality;
  /** 화면 흔들림·튀는 연출을 최소화 */
  reduceMotion: boolean;
}

export const BOT_DELAY: Record<BotSpeed, number> = { slow: 1300, normal: 800, fast: 350 };

export const RESOLUTION_PRESETS: readonly Resolution[] = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1920, height: 1080 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
];

export const MIN_WINDOW: Resolution = { width: 1280, height: 720 };

export const ANIMATION_SPEED_FACTOR: Record<AnimationSpeed, number> = { slow: 1.5, normal: 1, fast: 0.6 };
export const UI_SCALE_FACTOR: Record<UiScale, number> = { small: 0.9, normal: 1, large: 1.1 };

export const DEFAULT_SETTINGS: GameSettings = {
  version: SETTINGS_VERSION,
  windowMode: 'fullscreen',
  // 1080p 모니터의 작업 영역(작업 표시줄 제외)에도 들어가는 크기
  resolution: { width: 1600, height: 900 },
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 80,
  animationSpeed: 'normal',
  uiScale: 'normal',
  language: 'ko',
  chatNotifications: true,
  botSpeed: 'normal',
  graphicsQuality: 'high',
  reduceMotion: false,
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function volume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function resolution(value: unknown): Resolution {
  const r = value as Partial<Resolution> | null;
  const w = r?.width;
  const h = r?.height;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h)) {
    return { ...DEFAULT_SETTINGS.resolution };
  }
  if (w < MIN_WINDOW.width || h < MIN_WINDOW.height || w > 7680 || h > 4320) {
    return { ...DEFAULT_SETTINGS.resolution };
  }
  return { width: w, height: h };
}

/** 저장 파일이 손상되었거나 이전 버전이어도 항상 유효한 설정을 돌려준다. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    version: SETTINGS_VERSION,
    windowMode: pick(s.windowMode, ['fullscreen', 'windowed'], d.windowMode),
    resolution: resolution(s.resolution),
    masterVolume: volume(s.masterVolume, d.masterVolume),
    musicVolume: volume(s.musicVolume, d.musicVolume),
    sfxVolume: volume(s.sfxVolume, d.sfxVolume),
    animationSpeed: pick(s.animationSpeed, ['slow', 'normal', 'fast'], d.animationSpeed),
    uiScale: pick(s.uiScale, ['small', 'normal', 'large'], d.uiScale),
    language: 'ko',
    chatNotifications: typeof s.chatNotifications === 'boolean' ? s.chatNotifications : d.chatNotifications,
    botSpeed: pick(s.botSpeed, ['slow', 'normal', 'fast'], d.botSpeed),
    graphicsQuality: pick(s.graphicsQuality, ['low', 'medium', 'high'], d.graphicsQuality),
    reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : d.reduceMotion,
  };
}

/** 모니터 작업 영역에 들어가는 창 크기 프리셋만 남긴다. 현재 값은 목록에 없더라도 유지한다. */
export function availableResolutions(workArea: Resolution | null, current: Resolution): Resolution[] {
  const fits = (r: Resolution) => !workArea || (r.width <= workArea.width && r.height <= workArea.height);
  const list = RESOLUTION_PRESETS.filter(fits);
  if (!list.some((r) => r.width === current.width && r.height === current.height)) list.push(current);
  return list.sort((a, b) => a.width * a.height - b.width * b.height || a.width - b.width);
}
