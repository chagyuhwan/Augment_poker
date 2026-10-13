const { TEST_APP_ID } = require('./config.cjs');

/**
 * Steam을 초기화한다. 실패해도 예외를 던지지 않고 개발 테스트 모드 상태를 돌려준다.
 * electronEnableSteamOverlay는 app ready 이전에 호출해야 하므로 메인 진입 직후 실행한다.
 */
function initSteam({ appId, isPackaged, logger }) {
  const status = { available: false, appId: null, steamId: null, playerName: null, error: null };
  let steamworks;
  try {
    steamworks = require('steamworks.js');
  } catch (err) {
    status.error = 'Steam 모듈을 불러오지 못했습니다.';
    logger.error(`[steam] require failed: ${err?.stack ?? err}`);
    return { client: null, status, relaunching: false };
  }

  try {
    // 테스트 앱(480)으로 재실행하면 Spacewar가 켜지므로 실제 App ID일 때만 Steam을 통해 재실행한다.
    if (isPackaged && appId !== TEST_APP_ID && steamworks.restartAppIfNecessary(appId)) {
      logger.info('[steam] relaunching through Steam client');
      return { client: null, status, relaunching: true };
    }
    const client = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    const id = client.localplayer.getSteamId();
    status.available = true;
    status.appId = appId;
    status.steamId = id.steamId64.toString();
    status.playerName = client.localplayer.getName();
    logger.info(`[steam] initialized app=${appId} user=${status.steamId}`);
    return { client, status, relaunching: false };
  } catch (err) {
    status.error = 'Steam 클라이언트가 실행 중이 아니거나 초기화에 실패했습니다.';
    logger.warn(`[steam] init failed, running in development test mode: ${err?.message ?? err}`);
    return { client: null, status, relaunching: false };
  }
}

module.exports = { initSteam };
