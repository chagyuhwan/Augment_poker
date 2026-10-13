// 화면 확인용 스크린샷: vite 개발 서버를 띄운 상태에서
//   npx electron scripts/shot.cjs <장면...>
// 장면: menu, setup, table, wallet, settings, rooms, rules
// 결과: test-results/shots/<장면>.png. WebGL을 위해 하드웨어 가속을 켠다(AP_SOFTWARE=1이면 끔).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL = process.env.AP_URL || 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', 'test-results', 'shots');
const W = 1920;
const H = 1080;
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ap-shot-')));
if (process.env.AP_SOFTWARE) app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRELUDE = `
  window.__s = {
    q: (s) => document.querySelector(s),
    click(text) {
      const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim().includes(text) && !x.disabled).pop();
      if (!b) throw new Error('missing button ' + text);
      b.click();
    },
    key(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); },
    esc() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
  };
  true;`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const scale = Math.min(1, 1600 / W, 900 / H);
  const win = new BrowserWindow({
    width: Math.round(W * scale),
    height: Math.round(H * scale),
    useContentSize: true,
    show: false,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[console]', message);
  });
  win.webContents.on('did-finish-load', () =>
    win.webContents.enableDeviceEmulation({
      screenPosition: 'desktop',
      screenSize: { width: W, height: H },
      viewPosition: { x: 0, y: 0 },
      viewSize: { width: W, height: H },
      deviceScaleFactor: 1,
      scale,
    }),
  );
  await win.loadURL(URL);
  await sleep(1800);
  const js = (code) => win.webContents.executeJavaScript(`(async () => { const s = window.__s; ${code} })()`);
  await win.webContents.executeJavaScript(PRELUDE);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log('saved', file);
  };

  const scenes = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.cjs'));
  for (const scene of scenes.length ? scenes : ['menu']) {
    if (scene === 'menu') {
      await sleep(600);
      await shot('menu');
    } else if (scene === 'setup') {
      await js(`s.click('봇 대전'); return true;`);
      await sleep(700);
      await shot('setup');
      await js(`s.esc(); return true;`);
      await sleep(300);
    } else if (scene === 'table') {
      await js(`s.click('봇 대전'); await new Promise(r => setTimeout(r, 300)); s.click('가지고 입장'); return true;`);
      for (const [t, name] of [[1500, 'table-deal'], [3000, 'table-play'], [5000, 'table-later']]) {
        await sleep(t);
        await shot(name);
        // 내 차례면 콜해서 진행
        const called = await js(`const c = document.querySelector('.action-panel .pbtn.call, .action-panel .act-btn--call'); c && c.click(); return !!c;`);
        if (called && name === 'table-deal') {
          await sleep(900);
          await shot('table-hero-bet');
        }
      }
      const end = Date.now() + 40000;
      let picked = false;
      while (Date.now() < end) {
        const st = await js(`
          if (document.querySelector('.aug-slot')) return 'aug';
          if (document.querySelector('.result-panel')) return 'result';
          const c = document.querySelector('.action-panel .pbtn.call, .action-panel .act-btn--call'); c && c.click(); return 'play';`);
        if (st === 'aug' && !picked) {
          await sleep(900);
          await shot('table-augment');
          await js(`s.key('Digit2'); await new Promise(r => setTimeout(r, 120)); s.key('Enter'); return true;`);
          await sleep(500);
          await shot('table-augment-pick');
          picked = true;
          await sleep(3500);
          await shot('table-mid');        } else if (st === 'aug') {
          await js(`s.key('Digit1'); await new Promise(r => setTimeout(r, 120)); s.key('Enter'); return true;`);
        } else if (st === 'result') {
          await sleep(900);
          await shot('table-result');
          break;
        }
        await sleep(250);
      }
      await js(`s.esc(); return true;`);
      await sleep(400);
      await shot('table-pause');
      await js(`s.click('테이블 나가기'); await new Promise(r => setTimeout(r, 300)); s.click('나가기'); return true;`);
      await sleep(900);
    } else if (scene === 'fps') {
      await js(`s.click('봇 대전'); await new Promise(r => setTimeout(r, 300)); s.click('가지고 입장'); return true;`);
      await sleep(4000);
      const fps = await js(`
        const t0 = performance.now(); let n = 0; const times = [];
        let last = t0;
        await new Promise((done) => {
          const f = (t) => { n++; times.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else done(); };
          requestAnimationFrame(f);
        });
        times.sort((a, b) => a - b);
        const p95 = times[Math.floor(times.length * 0.95)];
        return { fps: Math.round(n / ((performance.now() - t0) / 1000)), p95FrameMs: Math.round(p95 * 10) / 10, has3d: !!document.querySelector('.game3d canvas') };`);
      console.log('FPS', JSON.stringify(fps));
      await js(`s.esc(); await new Promise(r => setTimeout(r, 300)); s.click('테이블 나가기'); await new Promise(r => setTimeout(r, 300)); s.click('나가기'); return true;`);
      await sleep(900);
    } else if (scene === 'wallet') {
      await js(`s.click('게임머니'); return true;`);
      await sleep(900);
      await shot('wallet');
      await js(`s.esc(); return true;`);
      await sleep(300);
    } else if (scene === 'settings') {
      await js(`s.click('설정'); return true;`);
      await sleep(900);
      await shot('settings');
      await js(`s.esc(); return true;`);
      await sleep(300);
    } else if (scene === 'rooms') {
      await js(`s.click('방 찾기'); return true;`);
      await sleep(900);
      await shot('rooms');
      await js(`s.click('방 만들기'); return true;`);
      await sleep(700);
      await shot('create-room');
      await js(`s.esc(); await new Promise(r => setTimeout(r, 100)); s.esc(); return true;`);
      await sleep(300);
    } else if (scene === 'rules') {
      await js(`s.click('게임 규칙'); return true;`);
      await sleep(900);
      await shot('rules');
      await js(`s.esc(); return true;`);
      await sleep(300);
    }
  }
  win.destroy();
}

app.whenReady().then(async () => {
  try {
    await main();
    app.exit(0);
  } catch (err) {
    console.error('FAIL', err?.stack ?? err);
    app.exit(1);
  }
});
