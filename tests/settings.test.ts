import { describe, expect, it } from 'vitest';
import { availableResolutions, DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings/settings';

describe('sanitizeSettings', () => {
  it('없거나 손상된 데이터는 기본값이 된다', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ windowMode: 'tiny', uiScale: 3, animationSpeed: null })).toEqual(DEFAULT_SETTINGS);
  });

  it('유효한 값은 유지한다', () => {
    const s = sanitizeSettings({
      windowMode: 'windowed',
      resolution: { width: 1680, height: 1050 },
      masterVolume: 10,
      musicVolume: 0,
      sfxVolume: 100,
      animationSpeed: 'fast',
      uiScale: 'large',
      chatNotifications: false,
      botSpeed: 'fast',
    });
    expect(s).toMatchObject({
      windowMode: 'windowed',
      resolution: { width: 1680, height: 1050 },
      masterVolume: 10,
      musicVolume: 0,
      sfxVolume: 100,
      animationSpeed: 'fast',
      uiScale: 'large',
      chatNotifications: false,
      language: 'ko',
      botSpeed: 'fast',
    });
  });

  it('볼륨을 0~100 정수로 맞춘다', () => {
    const s = sanitizeSettings({ masterVolume: 150, musicVolume: -5, sfxVolume: 33.6 });
    expect([s.masterVolume, s.musicVolume, s.sfxVolume]).toEqual([100, 0, 34]);
    expect(sanitizeSettings({ masterVolume: Number.NaN }).masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });

  it('너무 작거나 정수가 아닌 해상도는 기본값으로', () => {
    expect(sanitizeSettings({ resolution: { width: 800, height: 600 } }).resolution).toEqual(DEFAULT_SETTINGS.resolution);
    expect(sanitizeSettings({ resolution: { width: 1600.5, height: 900 } }).resolution).toEqual(
      DEFAULT_SETTINGS.resolution,
    );
  });

  it('버전 1 파일은 버전 2로 올리고 새 항목은 기본값, 기존 값은 유지', () => {
    const s = sanitizeSettings({ version: 1, uiScale: 'small', botSpeed: 'slow' });
    expect(s.version).toBe(2);
    expect(s).toMatchObject({ uiScale: 'small', botSpeed: 'slow', graphicsQuality: 'high', reduceMotion: false });
  });

  it('그래픽 품질과 연출 줄이기 값 검증', () => {
    expect(sanitizeSettings({ graphicsQuality: 'low', reduceMotion: true })).toMatchObject({ graphicsQuality: 'low', reduceMotion: true });
    expect(sanitizeSettings({ graphicsQuality: 'ultra', reduceMotion: 'yes' })).toMatchObject({ graphicsQuality: 'high', reduceMotion: false });
  });

  it('지원하지 않는 언어는 한국어로', () => {
    expect(sanitizeSettings({ language: 'en' }).language).toBe('ko');
  });
});

describe('availableResolutions', () => {
  it('작업 영역에 들어가는 크기만 남긴다', () => {
    const list = availableResolutions({ width: 1920, height: 1040 }, { width: 1600, height: 900 });
    expect(list.every((r) => r.width <= 1920 && r.height <= 1040)).toBe(true);
    expect(list.some((r) => r.width === 1920 && r.height === 1080)).toBe(false);
  });

  it('현재 값은 목록에 없어도 포함한다', () => {
    const list = availableResolutions({ width: 1366, height: 728 }, { width: 1920, height: 1080 });
    expect(list.some((r) => r.width === 1920 && r.height === 1080)).toBe(true);
  });

  it('작업 영역을 모르면 전체 프리셋', () => {
    expect(availableResolutions(null, DEFAULT_SETTINGS.resolution).length).toBeGreaterThanOrEqual(10);
  });
});
