const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Steamworks 파트너 사이트에서 발급받은 App ID로 교체해야 합니다. (480 = Valve 테스트용 Spacewar)
const STEAM_APP_ID = 480;
const DEV_SERVER_URL = 'http://localhost:5173';
const isDev = process.argv.includes('--dev');

let steam = null;
let steamClient = null;

let relaunchingThroughSteam = false;

try {
  steam = require('steamworks.js');
  // 480(테스트용)으로 재실행하면 Spacewar가 켜지므로 실제 App ID일 때만 적용
  if (app.isPackaged && STEAM_APP_ID !== 480 && steam.restartAppIfNecessary(STEAM_APP_ID)) {
    relaunchingThroughSteam = true;
  } else {
    steamClient = steam.init(STEAM_APP_ID);
    steam.electronEnableSteamOverlay();
  }
} catch (err) {
  console.warn('[steam] Steam을 초기화하지 못했습니다. 오프라인 모드로 실행합니다.', err?.message ?? err);
  steamClient = null;
}

if (relaunchingThroughSteam) app.exit(0);

const savePath = () => path.join(app.getPath('userData'), 'save.json');

function readSave() {
  try {
    return JSON.parse(fs.readFileSync(savePath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeSave(data) {
  const file = savePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

let win = null;

function createWindow() {
  const save = readSave();
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 576,
    fullscreen: save?.settings?.fullscreen ?? false,
    backgroundColor: '#0d1117',
    title: '증강 포커',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('enter-full-screen', () => win.webContents.send('fullscreen-changed', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen-changed', false));

  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('steam:info', () => {
  if (!steamClient) return { available: false, playerName: null };
  return { available: true, playerName: steamClient.localplayer.getName() };
});

ipcMain.handle('steam:unlockAchievement', (_e, id) => {
  if (!steamClient) return false;
  try {
    if (steamClient.achievement.isActivated(id)) return true;
    return steamClient.achievement.activate(id);
  } catch {
    return false;
  }
});

ipcMain.handle('save:load', () => readSave());
ipcMain.handle('save:write', (_e, data) => {
  writeSave(data);
  return true;
});

ipcMain.handle('window:setFullscreen', (_e, value) => {
  win?.setFullScreen(Boolean(value));
  return win?.isFullScreen() ?? false;
});
ipcMain.handle('window:isFullscreen', () => win?.isFullScreen() ?? false);
ipcMain.handle('app:quit', () => app.quit());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
