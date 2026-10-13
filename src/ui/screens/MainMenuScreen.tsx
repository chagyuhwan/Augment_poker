import type { CSSProperties } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { GAME_MODES, type GameModeInfo } from '../../core/gameModes';
import { audio } from '../../audio/audioEngine';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { PlayingCard, parseCards } from '../components/PlayingCard';
import { fmtMoney, useWallet } from '../../wallet/useWallet';

const MODE_ART: Record<GameModeInfo['id'], string> = {
  'normal-holdem': 'As Kh',
  'normal-seven': 'Qd Qs 7c Th',
  'augmented-holdem': 'Jh Ts',
  'augmented-seven': 'Ac 9c 9h 4d',
};

function ModeCard({ mode, onSelect }: { mode: GameModeInfo; onSelect: () => void }) {
  const cards = parseCards(MODE_ART[mode.id]);
  return (
    <button
      type="button"
      className={`mode-card mode-card--${mode.variant}${mode.augmented ? ' mode-card--augmented' : ''}`}
      title={mode.description}
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        audio.play('click');
        onSelect();
      }}
    >
      <div className="mode-card__felt" />
      <div className="mode-card__top">
        <span className={mode.augmented ? 'badge badge--augment' : 'badge'}>
          {mode.augmented && <Icon name="spark" size={14} />}
          {mode.augmented ? '증강' : '일반'}
        </span>
        <span className="mode-card__meta">
          <Icon name="users" size={16} />
          2–6인
        </span>
      </div>
      <div className={`mode-card__art mode-card__art--${cards.length}`}>
        {cards.map((c, i) => (
          <PlayingCard
            key={i}
            rank={c.rank}
            suit={c.suit}
            size="lg"
            style={{ '--i': i, '--n': cards.length } as CSSProperties}
          />
        ))}
      </div>
      <div className="mode-card__body">
        <h3 className="mode-card__name">{mode.name}</h3>
      </div>
    </button>
  );
}

interface NavItem {
  icon: IconName;
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}

export function MainMenuScreen() {
  const nav = useNavigation();
  const { appInfo, steam, identity, rooms } = useServices();
  const { account } = useWallet();
  const player = identity.getLocalPlayer();

  const items: NavItem[] = [
    { icon: 'plus', label: '방 만들기', hint: '새 테이블을 열고 친구를 초대합니다', onClick: () => nav.openModal({ name: 'create-room' }), primary: true },
    { icon: 'play', label: '봇 대전', hint: 'AI를 상대로 홀덤을 플레이합니다', onClick: () => nav.openModal({ name: 'practice-setup' }) },
    { icon: 'search', label: '방 찾기', hint: '참가할 수 있는 공개 방 목록', onClick: () => nav.push({ name: 'rooms', mode: 'all' }) },
    { icon: 'chip', label: '게임머니', hint: '보유 금액 확인 · 무료 충전 · 내역', onClick: () => nav.push({ name: 'wallet' }) },
    {
      icon: 'invite',
      label: '친구 초대',
      hint: 'Steam 친구를 내 방으로 초대합니다',
      onClick: () => {
        if (!rooms.getCurrentRoom()) nav.openModal({ name: 'invite-guide' });
        else nav.toast('Steam 초대 창은 9단계에서 연결됩니다.');
      },
    },
    { icon: 'book', label: '게임 규칙', hint: '모드별 규칙과 족보', onClick: () => nav.push({ name: 'rules', tab: 'holdem' }) },
    { icon: 'gear', label: '설정', hint: '화면, 사운드, 게임 설정', onClick: () => nav.push({ name: 'settings' }) },
  ];

  return (
    <div className="screen main-menu">
      <aside className="main-menu__side">
        <div className="logo">
          <div className="logo__mark">
            <span>♠</span>
          </div>
          <div className="logo__text">
            <span className="logo__title">AUGMENTED</span>
            <span className="logo__title logo__title--sub">POKER</span>
          </div>
        </div>

        <nav className="main-nav">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.primary ? 'main-nav__item is-primary' : 'main-nav__item'}
              title={item.hint}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('click');
                item.onClick();
              }}
            >
              <span className="main-nav__icon">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="main-nav__text">
                <span className="main-nav__label">{item.label}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="main-menu__footer">
          <div className="profile">
            <div className="profile__avatar" title={steam.available ? 'Steam 연결됨' : 'Steam 미연결 · 개발 테스트 모드'}>
              {player.displayName.slice(0, 1)}
              <i className={steam.available ? 'status-dot is-online' : 'status-dot'} />
            </div>
            <div className="profile__text">
              <span className="profile__name">{player.displayName}</span>
              <span className="profile__money" title="보유 게임머니">
                <Icon name="chip" size={14} />
                {account ? fmtMoney(account.balance) : '—'}
              </span>
            </div>
          </div>
          <Button variant="ghost" icon="power" onClick={() => nav.openModal({ name: 'confirm-exit' })} sound={null}>
            게임 종료
          </Button>
        </div>
      </aside>

      <main className="main-menu__content">
        <header className="section-head">
          <h1 className="section-head__title">모드 선택</h1>
        </header>

        <div className="mode-grid">
          {GAME_MODES.map((mode) => (
            <ModeCard key={mode.id} mode={mode} onSelect={() => nav.push({ name: 'rooms', mode: mode.id })} />
          ))}
        </div>

        <footer className="main-menu__legal">
          <span>v{appInfo.version}</span>
          <span title="게임머니는 현금·경품·외부 재화로 환전하거나 다른 이용자와 거래할 수 없습니다.">게임머니는 현금 가치가 없습니다</span>
        </footer>
      </main>
    </div>
  );
}
