const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require('electron');
const path = require('node:path');
const { DEV_SERVER_URL, LOG_FILES_TO_KEEP, STEAM_APP_ID, WINDOW_TITLE } = require('./config.cjs');
const { createLogger } = require('./logger.cjs');
const { createSettingsStore } = require('./settingsStore.cjs');
const { initSteam } = require('./steam.cjs');
const { createWalletStore } = require('./walletStore.cjs');
const { createLanHub } = require('./lanHub.cjs');

const isDev = process.argv.includes('--dev');

// 같은 PC에서 여러 클라이언트를 띄워 멀티플레이를 시험할 때: --instance=2
// 인스턴스마다 userData를 분리해 설정/캐시 잠금이 충돌하지 않게 한다.
const instanceArg = process.argv.find((a) => a.startsWith('--instance='));
const instanceId = instanceArg ? Number(instanceArg.split('=')[1]) || 1 : null;
if (instanceId && instanceId > 1) {
  app.setPath('userData', `${app.getPath('userData')}-instance-${instanceId}`);
}

const logger = createLogger(path.join(app.getPath('userData'), 'logs'), LOG_FILES_TO_KEEP);
const channel = app.isPackaged ? 'release' : 'development';
logger.info(
  `start v${app.getVersion()} ${channel} electron=${process.versions.electron} os=${process.platform}-${process.arch}` +
    `${instanceId ? ` instance=${instanceId}` : ''}`,
);

process.on('uncaughtException', (err) => {
  logger.error(`[main] uncaught exception: ${err?.stack ?? err}`);
  dialog.showErrorBox('오류가 발생했습니다', `게임을 계속 진행할 수 없습니다.\n로그 파일: ${logger.file}`);
  app.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`[main] unhandled rejection: ${reason?.stack ?? reason}`);
});

const steam = initSteam({ appId: STEAM_APP_ID, isPackaged: app.isPackaged, logger });
if (steam.relaunching) app.exit(0);

const settings = createSettingsStore(app.getPath('userData'), logger);
const wallet = createWalletStore({
  userDataDir: app.getPath('userData'),
  accountKey: steam.status.steamId ?? 'local',
  logger,
});
let win = null;
const lan = createLanHub({
  logger,
  getWindow: () => win,
});

function workArea() {
  if (!win) return null;
  const { width, height } = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  return { width, height };
}

function windowState() {
  return { mode: win?.isFullScreen() ? 'fullscreen' : 'windowed', workArea: workArea() };
}

function applyWindowedSize(width, height) {
  const area = workArea();
  const w = area ? Math.min(width, area.width) : width;
  const h = area ? Math.min(height, area.height) : height;
  const [cw, ch] = win.getContentSize();
  if (cw !== w || ch !== h) {
    win.setContentSize(w, h);
    win.center();
  }
}

function createWindow() {
  const prefs = settings.windowPrefs();
  win = new BrowserWindow({
    width: prefs.width,
    height: prefs.height,
    useContentSize: true,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: prefs.fullscreen,
    backgroundColor: '#060807',
    title: WINDOW_TITLE,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('enter-full-screen', () => win.webContents.send('window:mode-changed', 'fullscreen'));
  win.on('leave-full-screen', () => win.webContents.send('window:mode-changed', 'windowed'));
  win.webContents.on('render-process-gone', (_e, details) => {
    logger.error(`[renderer] process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (details.reason !== 'clean-exit') win.webContents.reload();
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => logger.error(`[renderer] load failed: ${code} ${desc}`));

  if (isDev) win.loadURL(DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), channel }));
ipcMain.handle('steam:status', () => steam.status);
ipcMain.handle('settings:load', () => settings.load());
ipcMain.handle('settings:save', (_e, data) => settings.save(data));

ipcMain.handle('wallet:get', () => wallet.get());
ipcMain.handle('wallet:history', () => wallet.history());
ipcMain.handle('wallet:op', (_e, op) => wallet.apply(op));

ipcMain.handle('window:apply', (_e, mode, resolution) => {
  if (!win) return windowState();
  if (mode === 'fullscreen') {
    if (!win.isFullScreen()) win.setFullScreen(true);
  } else {
    const width = Number(resolution?.width) || 1600;
    const height = Number(resolution?.height) || 900;
    if (win.isFullScreen()) {
      // Windows는 전체화면 해제 직후 이전 창 크기를 복원하므로 그 다음에 크기를 적용한다
      win.once('leave-full-screen', () => setTimeout(() => applyWindowedSize(width, height), 150));
      win.setFullScreen(false);
    } else {
      applyWindowedSize(width, height);
    }
  }
  return { mode, workArea: workArea() };
});
ipcMain.handle('window:state', () => windowState());

ipcMain.handle('app:openLogFolder', () => shell.openPath(logger.dir));
ipcMain.on('log:write', (_e, level, message) => {
  const fn = level === 'warn' || level === 'error' ? logger[level] : logger.info;
  fn(`[renderer] ${String(message).slice(0, 4000)}`);
});
ipcMain.handle('app:quit', () => app.quit());

ipcMain.handle('lan:localAddresses', () => lan.localAddresses());
ipcMain.handle('lan:status', () => lan.status());
ipcMain.handle('lan:hostStart', async (_e, opts) => {
  try {
    return await lan.hostStart(opts ?? {});
  } catch (err) {
    logger.error(`[lan] hostStart failed: ${err?.stack ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  }
});
ipcMain.handle('lan:connect', async (_e, opts) => {
  try {
    return await lan.connect(opts);
  } catch (err) {
    logger.error(`[lan] connect failed: ${err?.stack ?? err}`);
    return { ok: false, error: err?.message ?? '호스트에 연결할 수 없습니다.' };
  }
});
ipcMain.handle('lan:send', (_e, peerId, msg) => lan.send(peerId, msg));
ipcMain.handle('lan:broadcast', (_e, msg, exceptPeerId) => lan.broadcast(msg, exceptPeerId ?? null));
ipcMain.handle('lan:shutdown', async () => {
  await lan.shutdown();
  return { ok: true };
});

const multiInstance = instanceId !== null;
if (!multiInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    void lan.shutdown();
    logger.info('quit');
  });
}
