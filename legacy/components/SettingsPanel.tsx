import type { BotSpeed, Settings } from '../platform';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const SPEEDS: { value: BotSpeed; label: string }[] = [
  { value: 'slow', label: '느림' },
  { value: 'normal', label: '보통' },
  { value: 'fast', label: '빠름' },
];

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="overlay">
      <div className="panel settings">
        <h2>설정</h2>

        <div className="setting-row">
          <span>화면 모드</span>
          <div className="segmented">
            <button className={!settings.fullscreen ? 'active' : ''} onClick={() => onChange({ fullscreen: false })}>
              창 모드
            </button>
            <button className={settings.fullscreen ? 'active' : ''} onClick={() => onChange({ fullscreen: true })}>
              전체 화면
            </button>
          </div>
        </div>

        <div className="setting-row">
          <span>상대 행동 속도</span>
          <div className="segmented">
            {SPEEDS.map((s) => (
              <button
                key={s.value}
                className={settings.botSpeed === s.value ? 'active' : ''}
                onClick={() => onChange({ botSpeed: s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-help">
          단축키: F 폴드 · C 체크/콜 · R 레이즈 · A 올인 · 1/2/3 증강 선택 · Space 다음 핸드 · ESC 메뉴
        </div>

        <button className="btn raise" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
