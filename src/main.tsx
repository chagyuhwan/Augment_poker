import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/700.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/jua/400.css';
import '@fontsource/black-han-sans/400.css';
import { App } from './app/App';
import { createServices, ServicesProvider } from './app/services';
import { loadInitialSettings, SettingsProvider } from './app/settingsContext';
import { bridge } from './platform/desktopBridge';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/screens.css';
import './practice/practice.css';
import './ui/styles/cartoon.css';

window.addEventListener('error', (e) => bridge.log('error', `renderer error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => bridge.log('error', `unhandled rejection: ${String(e.reason)}`));

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const [services, settings] = await Promise.all([createServices(), loadInitialSettings()]);
    root.render(
      <StrictMode>
        <ServicesProvider services={services}>
          <SettingsProvider initial={settings}>
            <App />
          </SettingsProvider>
        </ServicesProvider>
      </StrictMode>,
    );
  } catch (err) {
    bridge.log('error', `boot failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    root.render(
      <div className="boot-error">
        <h1>게임을 시작하지 못했습니다</h1>
        <p>로그 폴더의 최신 로그 파일을 첨부해 문의해 주세요.</p>
      </div>,
    );
  }
}

void boot();
