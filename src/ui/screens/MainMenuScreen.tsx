import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { audio } from '../../audio/audioEngine';
import { menuGesture } from '../../scene3d/menuFx';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';

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
  const player = identity.getLocalPlayer();

  const left: NavItem[] = [
    { icon: 'plus', label: '방 만들기', hint: '새 테이블을 열고 친구를 초대합니다', onClick: () => nav.openModal({ name: 'create-room' }), primary: true, gesture: 'augment' },
    { icon: 'play', label: '봇 대전', hint: 'AI와 매치 전용 칩으로 한 경기를 즐깁니다', onClick: () => nav.openModal({ name: 'practice-setup' }), gesture: 'bet' },
    { icon: 'spark', label: '증강 도감', hint: '20종 증강의 효과와 등급을 봅니다', onClick: () => nav.push({ name: 'augment-codex' }), gesture: 'augment' },
    { icon: 'search', label: '방 찾기', hint: '참가할 수 있는 공개 방 목록', onClick: () => nav.push({ name: 'rooms', mode: 'all' }), gesture: 'check' },
  ];
  const right: NavItem[] = [
    {
      icon: 'invite',
      label: '친구 초대',
      hint: 'LAN으로 친구를 초대하는 방법',
      onClick: () => {
        if (!rooms.getCurrentRoom()) nav.openModal({ name: 'invite-guide' });
        else nav.toast('대기실에서 IP와 방 코드를 복사해 친구에게 보내세요.');
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
            <span className="profile__money" title="매치마다 칩이 새로 지급됩니다">
              <Icon name="chip" size={14} />
              파티 매치
            </span>
          </div>
        </div>
        <div className="main-menu__legal hub__legal">
          <span>v{appInfo.version}</span>
          <span>매치 칩은 점수용이며 현금 가치가 없습니다</span>
        </div>
        <Button variant="ghost" icon="power" onClick={() => nav.openModal({ name: 'confirm-exit' })} sound={null}>
          게임 종료
        </Button>
      </footer>
    </div>
  );
}
