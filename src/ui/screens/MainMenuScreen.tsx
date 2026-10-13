import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { audio } from '../../audio/audioEngine';
import { menuGesture } from '../../scene3d/menuFx';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { fmtMoney, useWallet } from '../../wallet/useWallet';

interface NavItem {
  icon: IconName;
  label: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
  gesture: Parameters<typeof menuGesture>[0];
}

function HubButton({ item, index }: { item: NavItem; index: number }) {
  return (
    <button
      type="button"
      className={item.primary ? 'main-nav__item hub-btn is-primary' : 'main-nav__item hub-btn'}
      style={{ animationDelay: `${index * 60}ms` }}
      title={item.hint}
      onMouseEnter={() => {
        audio.play('hover');
        menuGesture(item.gesture);
      }}
      onClick={() => {
        audio.play('click');
        item.onClick();
      }}
    >
      <span className="main-nav__icon">
        <Icon name={item.icon} size={26} />
      </span>
      <span className="main-nav__text">
        <span className="main-nav__label">{item.label}</span>
      </span>
    </button>
  );
}

export function MainMenuScreen() {
  const nav = useNavigation();
  const { appInfo, steam, identity, rooms } = useServices();
  const { account } = useWallet();
  const player = identity.getLocalPlayer();

  const left: NavItem[] = [
    { icon: 'plus', label: '방 만들기', hint: '새 테이블을 열고 친구를 초대합니다', onClick: () => nav.openModal({ name: 'create-room' }), primary: true, gesture: 'augment' },
    { icon: 'play', label: '봇 대전', hint: 'AI를 상대로 홀덤을 플레이합니다', onClick: () => nav.openModal({ name: 'practice-setup' }), gesture: 'bet' },
    { icon: 'search', label: '방 찾기', hint: '참가할 수 있는 공개 방 목록', onClick: () => nav.push({ name: 'rooms', mode: 'all' }), gesture: 'check' },
  ];
  const right: NavItem[] = [
    { icon: 'chip', label: '게임머니', hint: '보유 금액 확인 · 무료 충전 · 내역', onClick: () => nav.push({ name: 'wallet' }), gesture: 'bet' },
    {
      icon: 'invite',
      label: '친구 초대',
      hint: 'Steam 친구를 내 방으로 초대합니다',
      onClick: () => {
        if (!rooms.getCurrentRoom()) nav.openModal({ name: 'invite-guide' });
        else nav.toast('Steam 초대 창은 9단계에서 연결됩니다.');
      },
      gesture: 'check',
    },
    { icon: 'book', label: '게임 규칙', hint: '모드별 규칙과 족보', onClick: () => nav.push({ name: 'rules', tab: 'holdem' }), gesture: 'check' },
    { icon: 'gear', label: '설정', hint: '화면, 사운드, 게임 설정', onClick: () => nav.push({ name: 'settings' }), gesture: 'check' },
  ];

  return (
    <div className="screen main-menu main-menu--hub">
      <header className="hub__top">
        <div className="logo">
          <div className="logo__mark">
            <span>♠</span>
          </div>
          <div className="logo__text">
            <span className="logo__title">AUGMENTED</span>
            <span className="logo__title logo__title--sub">POKER</span>
          </div>
        </div>
      </header>

      <nav className="main-nav hub__nav">
        <div className="hub__col hub__col--left">
          {left.map((item, i) => (
            <HubButton key={item.label} item={item} index={i} />
          ))}
        </div>
        <div className="hub__col hub__col--right">
          {right.map((item, i) => (
            <HubButton key={item.label} item={item} index={i + left.length} />
          ))}
        </div>
      </nav>

      <footer className="hub__bottom">
        <div className="profile hub__profile">
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
        <div className="main-menu__legal hub__legal">
          <span>v{appInfo.version}</span>
          <span title="게임머니는 현금·경품·외부 재화로 환전하거나 다른 이용자와 거래할 수 없습니다.">게임머니는 현금 가치가 없습니다</span>
        </div>
        <Button variant="ghost" icon="power" onClick={() => nav.openModal({ name: 'confirm-exit' })} sound={null}>
          게임 종료
        </Button>
      </footer>
    </div>
  );
}
