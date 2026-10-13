// UI 스모크 테스트: vite 개발 서버(npm run dev)를 띄운 상태에서
//   npx electron scripts/ui-smoke.cjs
// 오프스크린 창으로 여러 해상도에서 메뉴 흐름을 클릭하며 검증하고 스크린샷을 남긴다.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL = process.env.AP_URL || 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', 'test-results', 'ui');
const SIZES = [
  [1920, 1080],
  [1920, 1200],
  [2560, 1080],
];

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ap-ui-smoke-')));
app.disableHardwareAcceleration();
// 해상도마다 창을 닫았다 새로 열므로 마지막 창이 닫혀도 종료하지 않는다
app.on('window-all-closed', () => {});

const HELPERS = `
  window.__t = {
    q: (sel) => document.querySelector(sel),
    qa: (sel) => [...document.querySelectorAll(sel)],
    text: (sel) => document.querySelector(sel)?.textContent ?? null,
    click(text, scope = document) {
      const el = [...scope.querySelectorAll('button')].find((b) => b.textContent.trim().includes(text) && !b.disabled);
      if (!el) throw new Error('button not found: ' + text);
      el.click();
    },
    clickLast(text) {
      const all = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim().includes(text) && !b.disabled);
      if (!all.length) throw new Error('button not found: ' + text);
      all[all.length - 1].click();
    },
    esc() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
    type(sel, value) {
      const input = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
  };
  true;
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win, label, fn) {
  try {
    const result = await win.webContents.executeJavaScript(`(async () => { const t = window.__t; ${fn} })()`);
    if (result !== true) throw new Error(`check returned ${JSON.stringify(result)}`);
    console.log(`  PASS ${label}`);
    return true;
  } catch (err) {
    console.log(`  FAIL ${label}: ${err.message}`);
    return false;
  }
}

async function shot(win, dir, name) {
  await sleep(450);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
}

async function testSize(width, height, full) {
  const dir = path.join(OUT, `${width}x${height}`);
  fs.mkdirSync(dir, { recursive: true });
  // 창은 모니터 크기를 넘을 수 없으므로 1600×900 이내 창에 목표 뷰포트를 축소 에뮬레이션한다.
  const scale = Math.min(1, 1600 / width, 900 / height);
  const win = new BrowserWindow({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    useContentSize: true,
    show: false,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(30);
  const emulate = () =>
    win.webContents.enableDeviceEmulation({
      screenPosition: 'desktop',
      screenSize: { width, height },
      viewPosition: { x: 0, y: 0 },
      viewSize: { width, height },
      deviceScaleFactor: 1,
      scale,
    });
  win.webContents.on('did-finish-load', emulate);
  for (let attempt = 1; ; attempt++) {
    try {
      await win.loadURL(URL);
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(500);
    }
  }
  await sleep(1200);
  await win.webContents.executeJavaScript(HELPERS);
  console.log(`\n[${width}x${height}]`);

  const results = [];
  const step = async (label, code, screenshot) => {
    results.push(await run(win, label, code));
    await sleep(380);
    if (screenshot) await shot(win, dir, screenshot);
  };

  await step(
    `뷰포트 ${width}x${height}`,
    `return window.innerWidth === ${width} && window.innerHeight === ${height} || [window.innerWidth, window.innerHeight];`,
  );
  await step('메인 메뉴 표시', `return !!t.q('.main-menu') && t.qa('.mode-card').length === 4;`, 'main-menu');

  if (full) {
    const money = (sel) => `Number((t.text('${sel}') ?? '').replace(/[^0-9]/g, ''))`;
    // 본인 차례면 콜/체크하고, 증강 선택창이 뜨면 cond를 검사한다. cond가 true면 멈춘다.
    const playUntil = (cond, ms) => `
      const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      const end = Date.now() + ${ms};
      while (Date.now() < end) {
        if (${cond}) return true;
        const call = t.q('.action-panel .pbtn.call');
        if (call) call.click();
        await new Promise(r => setTimeout(r, 150));
      }
      return 'timeout';`;

    await step('메인 메뉴 잔액 표시 (기본 지급 100,000)', `return ${money('.profile__money')} === 100000;`);
    await step(
      '게임머니 화면: 잔액·무료충전 조건·내역',
      `t.click('게임머니', t.q('.main-nav')); await new Promise(r => setTimeout(r, 300));
       const btn = [...document.querySelectorAll('.free-charge button')][0];
       return ${money('.wallet-balance__amount')} === 100000 && btn.disabled && (t.text('.free-charge__reason') ?? '').includes('미만')
         && t.qa('.ledger__row').length === 1 && t.text('.ledger__type') === '기본 지급';`,
      'wallet',
    );
    await step('게임머니 화면 ESC', `t.esc(); await new Promise(r => setTimeout(r, 80)); return !!t.q('.main-menu');`);

    await step('봇 대전 설정 열기', `t.click('봇 대전'); await new Promise(r => setTimeout(r, 120)); return t.text('.modal__title') === '봇 대전' && t.q('.modal').textContent.includes('증강 홀덤');`, 'practice-setup');
    await step(
      '6,000 바이인 → 테이블 (빈자리 2개)',
      `t.clickLast('가지고 입장');
       // 3D 테이블은 이름표가 캔버스 렌더 뒤에 붙으므로 잠시 기다린다
       const seats = () => t.q('.game3d')
         ? t.qa('.seat3d--empty').length === 2 && t.qa('.seat3d:not(.seat3d--empty)').length === 3
         : t.qa('.seat').length === 6 && t.qa('.seat--empty').length === 2;
       const end = Date.now() + 6000;
       while (Date.now() < end && !seats()) await new Promise(r => setTimeout(r, 200));
       return !!t.q('.practice.game-screen') && seats()
         && ${money('.seat.bottom .seat-chips, .hero-panel .seat-chips')} > 0 || [!!t.q('.game3d'), t.qa('.seat3d').length, t.qa('.seat').length];`,
      'practice-table',
    );
    await step(
      '프리플랍 베팅 후 증강 선택 1/2',
      `${playUntil(`t.q('.aug-slot') && (t.text('.aug-stage__eyebrow') ?? '').includes('1/2')`, 40000)}`,
      'practice-augment',
    );
    await step(
      '증강: 선택 → 교체 단계 없이 확정, 보유 슬롯에 표시',
      `const name = () => t.qa('.aug-card__name').map(e => e.textContent);
       window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true })); await new Promise(r => setTimeout(r, 80));
       const picked = name()[1];
       window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); await new Promise(r => setTimeout(r, 900));
       return !t.q('.aug-slot') && t.qa('.my-augments .my-augment:not(.is-empty)').some(e => e.textContent.includes(picked));`,
    );
    await step(
      '턴 베팅 후 증강 선택 2/2 (새 판이면 1/2 다시 선택)',
      `${playUntil(`(() => {
         if (!t.q('.aug-slot')) {
           if (t.q('.aug-replace')) t.click('받지 않고');
           return false;
         }
         if ((t.text('.aug-stage__eyebrow') ?? '').includes('2/2')) return true;
         key('Digit1'); key('Enter');
         return false;
       })()`, 90000)}`,
      'practice-augment-2',
    );
    await step(
      '2번째 증강 확정',
      `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', bubbles: true })); await new Promise(r => setTimeout(r, 80));
       window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); await new Promise(r => setTimeout(r, 120));
       if (t.q('.aug-replace')) { t.qa('.aug-owned')[0].click(); }
       await new Promise(r => setTimeout(r, 900)); return !t.q('.aug-slot') && !t.q('.aug-replace');`,
    );
    await step(
      '판 정산 → 결과와 자동 다음 판 카운트다운',
      `${playUntil(`!!t.q('.result-panel') || !t.q('.seat.bottom, .hero-panel')`, 40000)}`,
      'practice-result',
    );
    await step(
      '정산 후 자동으로 다음 판 시작 (게임 종료 없음)',
      `if (!t.q('.seat.bottom, .hero-panel')) return 'hero gone';
       const hand = () => Number(((t.text('.topbar-info, .hud-chip--title') ?? '').match(/#(\\d+)/) ?? [])[1] ?? 0);
       const h0 = hand(); const end = Date.now() + 12000;
       while (Date.now() < end) { if (hand() > h0) return true; await new Promise(r => setTimeout(r, 200)); }
       return [h0, hand()];`,
    );
    await step(
      'ESC 일시정지 메뉴에 다시 시작 없음',
      `t.esc(); await new Promise(r => setTimeout(r, 120));
       const s = t.q('.practice-pause')?.textContent ?? ''; return s.includes('테이블 나가기') && !s.includes('다시 시작');`,
    );
    await step(
      '테이블 나가기 → 남은 칩이 계정으로 돌아옴',
      `t.click('테이블 나가기', t.q('.practice-pause')); await new Promise(r => setTimeout(r, 120));
       const chips = ${money('.seat.bottom .seat-chips, .hero-panel .seat-chips')};
       t.clickLast('나가기'); await new Promise(r => setTimeout(r, 600));
       const bal = ${money('.profile__money')};
       return !!t.q('.main-menu') && bal === 94000 + chips || [chips, bal];`,
      'main-after-leave',
    );
    await step(
      '내역에 입장·정산 기록',
      `t.click('게임머니', t.q('.main-nav')); await new Promise(r => setTimeout(r, 300));
       const types = t.qa('.ledger__type').map(e => e.textContent);
       const ok = types[0] === '테이블 정산' && types[1] === '테이블 입장';
       t.esc(); await new Promise(r => setTimeout(r, 80)); return ok || types;`,
    );
    await step(
      '2,000 바이인 후 매 판 올인 → 소진 시 자동 퇴장 모달',
      `window.__bal0 = ${money('.profile__money')};
       t.click('봇 대전'); await new Promise(r => setTimeout(r, 150));
       t.clickLast('2,000'); t.click('빠르게'); await new Promise(r => setTimeout(r, 80));
       t.clickLast('가지고 입장'); await new Promise(r => setTimeout(r, 400));
       const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
       const end = Date.now() + 240000;
       while (Date.now() < end) {
         if ((t.text('.practice-pause .modal__title') ?? '').includes('소진')) return true;
         if (t.q('.aug-replace')) t.click('받지 않고');
         else if (t.q('.aug-slot')) key('Digit1');
         const raise = t.q('.action-panel .pbtn.raise');
         if (raise) { key('KeyA'); await new Promise(r => setTimeout(r, 60)); t.q('.action-panel .pbtn.raise')?.click(); }
         else t.q('.action-panel .pbtn.call')?.click();
         await new Promise(r => setTimeout(r, 120));
       }
       return 'timeout';`,
      'practice-busted',
    );
    await step(
      '소진 모달 → 게임머니 충전 화면, 테이블 금액 반환 없음',
      `t.clickLast('게임머니 충전'); await new Promise(r => setTimeout(r, 400));
       const bal = ${money('.wallet-balance__amount')};
       return !!t.q('.wallet') && bal === window.__bal0 - 2000 && t.text('.ledger__type') === '테이블 정산' || [window.__bal0, bal];`,
    );
    await step(
      '무료 충전: 잔액이 기준 미만이면 버튼 활성 → 충전·횟수 차감·내역',
      `const k = 'augmented-poker-wallet-dev'; const d = JSON.parse(localStorage.getItem(k)); d.balance = 1200; localStorage.setItem(k, JSON.stringify(d));
       location.reload(); return true;`,
    );
    await sleep(1500);
    await win.webContents.executeJavaScript(HELPERS);
    await step(
      '무료 충전 실행',
      `t.click('게임머니', t.q('.main-nav')); await new Promise(r => setTimeout(r, 300));
       const btn = t.q('.free-charge button'); if (btn.disabled) return 'disabled';
       btn.click(); await new Promise(r => setTimeout(r, 1400));
       const bal = ${money('.wallet-balance__amount')};
       const ok = bal === 51200 && t.q('.free-charge__count strong').textContent === '2' && t.text('.ledger__type') === '무료 충전'
         && t.q('.free-charge button').disabled;
       return ok || [bal, t.q('.free-charge__count strong').textContent, t.text('.ledger__type')];`,
      'wallet-charged',
    );
    await step('충전 화면 ESC', `t.esc(); await new Promise(r => setTimeout(r, 80)); return !!t.q('.main-menu');`);
  }

  await step('방 찾기 이동', `t.click('방 찾기'); return true;`);
  await step(
    '방 서비스 미연결 안내',
    `return !!t.q('.room-browser') && (t.text('.empty-state') ?? '').includes('연결되어 있지 않습니다');`,
    'room-browser',
  );
  await step('ESC로 메인 복귀', `t.esc(); return true;`);
  await step('메인 메뉴 복귀 확인', `return !!t.q('.main-menu');`);

  await step('증강 7포커 카드 → 필터된 방 목록', `t.click('증강 7포커'); return true;`);
  await step(
    '필터가 증강 7포커로 설정됨',
    `return t.text('.segmented__item.is-active') === '증강 7포커';`,
  );

  await step('방 만들기 모달 열기', `t.click('방 만들기'); return true;`);
  await step(
    '모드가 증강 7포커로 전달되고 앤티/증강 선택시간 표시',
    `const m = t.q('.modal'); const s = m.textContent;
     return t.text('.mode-picker__item.is-active').includes('증강') && t.text('.mode-picker__item.is-active').includes('7포커')
       && s.includes('앤티') && !s.includes('블라인드 (') && s.includes('증강 선택시간');`,
    'create-room',
  );

  if (!full) {
    await step(
      '모달과 방 목록을 ESC로 닫기',
      `t.esc(); await new Promise(r => setTimeout(r, 50)); t.esc(); await new Promise(r => setTimeout(r, 50)); return !!t.q('.main-menu');`,
    );
  }

  if (full) {
    await step('제목을 비우고 제출하면 오류', `t.type('.modal input', ' '); t.clickLast('방 만들기'); return true;`);
    await step('제목 오류 표시', `return (t.text('.field__error') ?? '').includes('방 제목은');`, 'create-room-error');
    await step('홀덤으로 바꾸면 블라인드 표시', `t.click('텍사스 홀덤', t.q('.mode-picker')); await new Promise(r => setTimeout(r, 50)); return t.q('.modal').textContent.includes('블라인드 (');`);
    await step(
      '정상 입력 후 제출 → 미연결 메시지',
      `t.type('.modal input', '테스트 방'); t.clickLast('방 만들기'); await new Promise(r => setTimeout(r, 200));
       return t.qa('.modal').length === 2 && t.qa('.modal')[1].textContent.includes('방을 만들 수 없습니다');`,
      'create-room-unavailable',
    );
    await step('ESC 두 번으로 모달 닫기', `t.esc(); await new Promise(r => setTimeout(r, 50)); t.esc(); await new Promise(r => setTimeout(r, 50)); return t.qa('.modal').length === 0 && !!t.q('.room-browser');`);

    await step('방 코드 입장: 잘못된 코드', `t.click('방 코드로 입장'); await new Promise(r => setTimeout(r, 50)); t.type('.modal input', 'ab0'); t.clickLast('입장'); await new Promise(r => setTimeout(r, 50)); return (t.text('.field__error') ?? '').includes('6자리');`);
    await step('방 코드 입장: 형식 맞으면 미연결 오류', `t.type('.modal input', 'k7p2qx'); t.clickLast('입장'); await new Promise(r => setTimeout(r, 100)); return t.q('.input--code input').value === 'K7P2QX' && (t.text('.field__error') ?? '').includes('연결되지');`, 'join-code');
    await step('메인 복귀', `t.esc(); await new Promise(r => setTimeout(r, 50)); t.esc(); return true;`);

    await step('친구 초대 → 안내 모달', `t.click('친구 초대'); await new Promise(r => setTimeout(r, 50)); return (t.text('.modal__title') ?? '').includes('먼저 방에');`, 'invite-guide');
    await step('안내 모달에서 방 만들기', `t.clickLast('방 만들기'); await new Promise(r => setTimeout(r, 50)); return t.qa('.modal').length === 1 && t.text('.modal__title') === '방 만들기';`);
    await step('모달 닫기', `t.esc(); await new Promise(r => setTimeout(r, 50)); return t.qa('.modal').length === 0;`);

    await step('게임 규칙 → 족보 탭', `t.click('게임 규칙'); await new Promise(r => setTimeout(r, 50)); t.click('족보', t.q('.side-tabs')); await new Promise(r => setTimeout(r, 50)); return t.qa('.hand-rank').length === 10;`, 'rules-hands');
    await step('7포커 규칙 탭', `t.click('한국식 7포커', t.q('.side-tabs')); await new Promise(r => setTimeout(r, 50)); return t.text('.rules__title').includes('7포커');`, 'rules-seven');
    await step('규칙에서 ESC', `t.esc(); await new Promise(r => setTimeout(r, 50)); return !!t.q('.main-menu');`);
  }

  await step('설정 열기', `t.click('설정'); await new Promise(r => setTimeout(r, 50)); return !!t.q('.settings');`, 'settings');
  if (full) {
    await step(
      'UI 크기 크게 → 논리 해상도 축소',
      `const before = parseFloat(t.q('.stage').style.width); t.click('크게'); await new Promise(r => setTimeout(r, 100));
       const after = parseFloat(t.q('.stage').style.width); return after < before;`,
      'settings-large',
    );
    await step('UI 크기 보통 복원', `t.click('보통'); return true;`);
    await step(
      '설정 저장 (브라우저 모드: localStorage)',
      `await new Promise(r => setTimeout(r, 500)); const s = JSON.parse(localStorage.getItem('augmented-poker-settings')); return s.uiScale === 'normal' && s.version === 2;`,
    );
    await step(
      '효과음 볼륨 슬라이더 변경 저장',
      `const input = t.qa('.slider input')[2]; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
       setter.call(input, '35'); input.dispatchEvent(new Event('input', { bubbles: true }));
       await new Promise(r => setTimeout(r, 500)); return JSON.parse(localStorage.getItem('augmented-poker-settings')).sfxVolume === 35;`,
    );
    await step('설정 유지: 새로고침 후에도 35', `location.reload(); return true;`);
    await sleep(1500);
    await win.webContents.executeJavaScript(HELPERS);
    await step('새로고침 후 값 확인', `t.click('설정'); await new Promise(r => setTimeout(r, 100)); return t.qa('.slider__value')[2].textContent === '35';`);
  }
  await step('설정에서 ESC', `t.esc(); await new Promise(r => setTimeout(r, 50)); return !!t.q('.main-menu');`);
  await step('메인에서 ESC → 종료 확인', `t.esc(); await new Promise(r => setTimeout(r, 50)); return (t.text('.modal__title') ?? '').includes('종료');`, 'confirm-exit');
  await step('종료 취소', `t.click('취소'); await new Promise(r => setTimeout(r, 50)); return t.qa('.modal').length === 0;`);

  win.destroy();
  return results;
}

app.whenReady().then(async () => {
  try {
    let all = [];
    for (const [i, [w, h]] of SIZES.entries()) all = all.concat(await testSize(w, h, i === 0));
    const failed = all.filter((r) => !r).length;
    console.log(`\n${all.length - failed}/${all.length} passed. screenshots: ${OUT}`);
    app.exit(failed ? 1 : 0);
  } catch (err) {
    console.log(`\nABORTED: ${err?.stack ?? err}`);
    app.exit(2);
  }
});
