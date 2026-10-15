import { useEffect } from 'react';
import { UI_SCALE_FACTOR } from '../settings/settings';
import { AugmentCodexScreen } from '../ui/screens/AugmentCodexScreen';
import { LanTableScreen } from '../ui/screens/LanTableScreen';
import { LobbyScreen } from '../ui/screens/LobbyScreen';
import { MainMenuScreen } from '../ui/screens/MainMenuScreen';
import { PracticeScreen } from '../ui/screens/PracticeScreen';
import { RoomBrowserScreen } from '../ui/screens/RoomBrowserScreen';
import { RulesScreen } from '../ui/screens/RulesScreen';
import { SettingsScreen } from '../ui/screens/SettingsScreen';
import { WalletScreen } from '../ui/screens/WalletScreen';
import { CreateRoomModal } from '../ui/modals/CreateRoomModal';
import { PracticeSetupModal } from '../ui/modals/PracticeSetupModal';
import {
  ConfirmExitModal,
  InviteGuideModal,
  JoinCodeModal,
  MessageModal,
  RoomPasswordModal,
} from '../ui/modals/SimpleModals';
import { MenuBackdrop } from '../ui/MenuBackdrop';
import { Stage } from '../ui/Stage';
import { NavigationProvider, useNavigation, type ModalRoute, type ScreenRoute } from './navigation';
import { useSettings } from './settingsContext';

function renderScreen(route: ScreenRoute) {
  switch (route.name) {
    case 'menu':
      return <MainMenuScreen />;
    case 'rooms':
      return <RoomBrowserScreen initialMode={route.mode} />;
    case 'rules':
      return <RulesScreen initialTab={route.tab} />;
    case 'augment-codex':
      return <AugmentCodexScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'practice':
      return <PracticeScreen options={route.options} />;
    case 'wallet':
      return <WalletScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'lan-table':
      return <LanTableScreen start={route.start} tableId={route.tableId} />;
  }
}

function renderModal(route: ModalRoute) {
  switch (route.name) {
    case 'create-room':
      return <CreateRoomModal initialMode={route.mode} />;
    case 'join-code':
      return <JoinCodeModal />;
    case 'room-password':
      return <RoomPasswordModal room={route.room} />;
    case 'invite-guide':
      return <InviteGuideModal />;
    case 'practice-setup':
      return <PracticeSetupModal />;
    case 'confirm-exit':
      return <ConfirmExitModal />;
    case 'message':
      return <MessageModal title={route.title} body={route.body} tone={route.tone} />;
  }
}

function Shell() {
  const nav = useNavigation();
  const { settings, update } = useSettings();
  const inPractice = nav.screen.name === 'practice' || nav.screen.name === 'lan-table';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inPractice && nav.modals.length === 0) return; // PracticeScreen이 일시정지 처리
        e.preventDefault();
        nav.back();
      } else if (e.key === 'F11') {
        e.preventDefault();
        update({ windowMode: settings.windowMode === 'fullscreen' ? 'windowed' : 'fullscreen' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, settings.windowMode, update, inPractice]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings.reduceMotion]);

  return (
    <Stage uiFactor={UI_SCALE_FACTOR[settings.uiScale]}>
      {!inPractice && <MenuBackdrop dim={nav.screen.name !== 'menu'} />}
      <div className={inPractice ? 'screen-host screen-host--flat' : 'screen-host'} key={nav.screenKey}>
        {renderScreen(nav.screen)}
      </div>
      {nav.modals.map((m, i) => (
        <div key={i} className="modal-layer">
          {renderModal(m)}
        </div>
      ))}
      <div className="toast-host">
        {nav.toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Stage>
  );
}

export function App() {
  return (
    <NavigationProvider>
      <Shell />
    </NavigationProvider>
  );
}
