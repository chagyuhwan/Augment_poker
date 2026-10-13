// Steamworks 파트너 사이트에서 발급받은 App ID를 STEAM_APP_ID에 넣는다.
// 발급 전까지는 Valve 공용 테스트 앱(480, Spacewar)으로 개발한다. 임의의 실제 ID를 넣지 말 것.
const TEST_APP_ID = 480;

const envAppId = Number(process.env.AP_STEAM_APP_ID);

module.exports = {
  TEST_APP_ID,
  STEAM_APP_ID: Number.isInteger(envAppId) && envAppId > 0 ? envAppId : TEST_APP_ID,
  DEV_SERVER_URL: 'http://localhost:5173',
  LOG_FILES_TO_KEEP: 10,
  WINDOW_TITLE: 'AUGMENTED POKER',
};
