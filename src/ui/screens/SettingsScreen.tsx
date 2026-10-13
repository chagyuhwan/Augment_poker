import type { ReactNode } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { useSettings } from '../../app/settingsContext';
import { audio } from '../../audio/audioEngine';
import { bridge } from '../../platform/desktopBridge';
import {
  availableResolutions,
  type AnimationSpeed,
  type BotSpeed,
  type GraphicsQuality,
  type UiScale,
  type WindowMode,
} from '../../settings/settings';
import { Button } from '../components/Button';
import { Segmented, Slider, Toggle } from '../components/Controls';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h2 className="settings-card__title">
        <Icon name={icon} size={20} />
        {title}
      </h2>
      <div className="settings-card__rows">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

export function SettingsScreen() {
  const nav = useNavigation();
  const { appInfo } = useServices();
  const { settings, windowState, update, reset } = useSettings();
  const resolutions = availableResolutions(windowState.workArea, settings.resolution);
  const windowed = settings.windowMode === 'windowed';

  return (
    <div className="screen settings">
      <ScreenHeader
        title="설정"
        subtitle="변경 사항은 바로 적용되고 자동으로 저장됩니다."
        actions={
          <Button
            icon="refresh"
            title="화면 설정(창 모드, 창 크기)은 유지됩니다"
            onClick={() => {
              reset();
              nav.toast('기본값으로 복원했습니다. (화면 설정 제외)', 'success');
            }}
          >
            기본값으로 복원
          </Button>
        }
      />

      <div className="settings__grid">
        <Section icon="monitor" title="화면">
          <Row label="화면 모드">
            <Segmented<WindowMode>
              options={[
                { value: 'fullscreen', label: '전체화면' },
                { value: 'windowed', label: '창 모드' },
              ]}
              value={settings.windowMode}
              onChange={(windowMode) => update({ windowMode })}
            />
          </Row>
          <Row label="창 크기" hint={windowed ? '창 모드에서 사용할 해상도' : '창 모드에서만 적용됩니다'}>
            <div className="res-grid">
              {resolutions.map((r) => {
                const active = r.width === settings.resolution.width && r.height === settings.resolution.height;
                return (
                  <button
                    key={`${r.width}x${r.height}`}
                    type="button"
                    className={active ? 'res-grid__item is-active' : 'res-grid__item'}
                    disabled={!windowed}
                    onClick={() => {
                      audio.play('click');
                      update({ resolution: r });
                    }}
                  >
                    {r.width}×{r.height}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="UI 크기" hint="글자와 버튼 크기를 조절합니다">
            <Segmented<UiScale>
              options={[
                { value: 'small', label: '작게' },
                { value: 'normal', label: '보통' },
                { value: 'large', label: '크게' },
              ]}
              value={settings.uiScale}
              onChange={(uiScale) => update({ uiScale })}
            />
          </Row>
          <Row label="그래픽 품질" hint="낮추면 그림자와 빛 번짐 효과를 줄여 가볍게 실행됩니다">
            <Segmented<GraphicsQuality>
              options={[
                { value: 'low', label: '낮음' },
                { value: 'medium', label: '중간' },
                { value: 'high', label: '높음' },
              ]}
              value={settings.graphicsQuality}
              onChange={(graphicsQuality) => update({ graphicsQuality })}
            />
          </Row>
          <Row label="움직임 줄이기" hint="카메라 흔들림과 반복 애니메이션을 줄입니다">
            <Toggle checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
          </Row>
        </Section>

        <Section icon="volume" title="사운드">
          <Row label="마스터 볼륨">
            <Slider
              ariaLabel="마스터 볼륨"
              value={settings.masterVolume}
              onChange={(masterVolume) => update({ masterVolume })}
              onCommit={() => audio.play('confirm')}
            />
          </Row>
          <Row label="배경음" hint="테이블의 카지노 분위기 소리">
            <Slider
              ariaLabel="배경음악 볼륨"
              value={settings.musicVolume}
              onChange={(musicVolume) => update({ musicVolume })}
            />
          </Row>
          <Row label="효과음">
            <Slider
              ariaLabel="효과음 볼륨"
              value={settings.sfxVolume}
              onChange={(sfxVolume) => update({ sfxVolume })}
              onCommit={() => audio.play('confirm')}
            />
          </Row>
        </Section>

        <Section icon="chip" title="게임">
          <Row label="카드 애니메이션 속도">
            <Segmented<AnimationSpeed>
              options={[
                { value: 'slow', label: '느리게' },
                { value: 'normal', label: '보통' },
                { value: 'fast', label: '빠르게' },
              ]}
              value={settings.animationSpeed}
              onChange={(animationSpeed) => update({ animationSpeed })}
            />
          </Row>
          <Row label="봇 속도" hint="봇 대전에서 AI가 행동하기까지 기다리는 시간">
            <Segmented<BotSpeed>
              options={[
                { value: 'slow', label: '느리게' },
                { value: 'normal', label: '보통' },
                { value: 'fast', label: '빠르게' },
              ]}
              value={settings.botSpeed}
              onChange={(botSpeed) => update({ botSpeed })}
            />
          </Row>
          <Row label="채팅 알림" hint="새 채팅 메시지가 오면 소리와 표시로 알립니다">
            <Toggle checked={settings.chatNotifications} onChange={(chatNotifications) => update({ chatNotifications })} />
          </Row>
          <Row label="언어">
            <Segmented options={[{ value: 'ko', label: '한국어' }]} value={settings.language} onChange={() => {}} />
          </Row>
        </Section>

        <Section icon="info" title="정보">
          <Row label="게임 규칙" hint="모드별 규칙과 족보">
            <Button icon="book" onClick={() => nav.push({ name: 'rules', tab: 'holdem' })}>
              규칙 보기
            </Button>
          </Row>
          <Row label="로그 폴더" hint="오류 보고 시 이 폴더의 로그 파일을 첨부해 주세요">
            <Button icon="folder" disabled={!appInfo.isDesktop} onClick={() => void bridge.openLogFolder()}>
              열기
            </Button>
          </Row>
          <Row label="버전">
            <span className="settings-row__value">
              v{appInfo.version} · {appInfo.channel === 'release' ? '출시 빌드' : '개발 빌드'}
            </span>
          </Row>
        </Section>
      </div>
    </div>
  );
}
