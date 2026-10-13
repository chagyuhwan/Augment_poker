const fs = require('node:fs');
const path = require('node:path');

/**
 * 설정 파일을 원자적으로 저장한다. 값 검증은 렌더러의 sanitizeSettings가 담당하고,
 * 메인은 창을 만들 때 필요한 화면 값만 최소한으로 확인한다.
 */
function createSettingsStore(userDataDir, logger) {
  const file = path.join(userDataDir, 'settings.json');

  const load = () => {
    try {
      // 메모장 등으로 직접 수정하면 BOM이 붙을 수 있다
      return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn(`[settings] load failed, using defaults: ${err.message}`);
      return null;
    }
  };

  const save = (data) => {
    if (!data || typeof data !== 'object') return false;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
      fs.renameSync(`${file}.tmp`, file);
      return true;
    } catch (err) {
      logger.error(`[settings] save failed: ${err.message}`);
      return false;
    }
  };

  const windowPrefs = () => {
    const s = load();
    const fullscreen = s?.windowMode !== 'windowed';
    const w = s?.resolution?.width;
    const h = s?.resolution?.height;
    const valid = Number.isInteger(w) && Number.isInteger(h) && w >= 1280 && h >= 720;
    return { fullscreen, width: valid ? w : 1600, height: valid ? h : 900 };
  };

  return { file, load, save, windowPrefs };
}

module.exports = { createSettingsStore };
