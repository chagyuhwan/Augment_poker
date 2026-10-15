import { createContext, useContext, type ReactNode } from 'react';
import { LanRoomService } from '../lobby/lanRoomService';
import { UnavailableRoomService } from '../lobby/unavailableRoomService';
import type { IPlayerIdentityService, IRoomService } from '../net/types';
import { bridge, type AppInfo, type SteamStatus } from '../platform/desktopBridge';
import { PlayerIdentityService } from '../steam/identity';
import type { IWalletService } from '../wallet/types';
import { createWalletService } from '../wallet/walletService';

export interface AppServices {
  appInfo: AppInfo;
  steam: SteamStatus;
  identity: IPlayerIdentityService;
  rooms: IRoomService;
  /** LAN일 때만 채워짐 */
  lan: LanRoomService | null;
  wallet: IWalletService;
}

export async function createServices(): Promise<AppServices> {
  const [appInfo, steam] = await Promise.all([bridge.appInfo(), bridge.steamStatus()]);
  const identity = new PlayerIdentityService(steam);
  const player = identity.getLocalPlayer();
  // preload의 window.desktop 또는 appInfo로 Electron 여부 판별 (모듈 로드 시점 캐시보다 신뢰)
  const desktop = appInfo.isDesktop || bridge.isDesktop;
  bridge.log(
    'info',
    `renderer ready: v${appInfo.version} ${appInfo.channel}, desktop=${desktop}, steam=${steam.available ? `on(${steam.appId})` : `off(${steam.error})`}`,
  );
  const lan = desktop ? new LanRoomService(player.playerId, player.displayName) : null;
  return {
    appInfo: { ...appInfo, isDesktop: desktop },
    steam,
    identity,
    rooms:
      lan ??
      new UnavailableRoomService(
        'LAN 대전은 Electron 앱에서만 사용할 수 있습니다. 메뉴에서 게임을 다시 실행해 주세요 (npm run electron:dev).',
      ),
    lan,
    wallet: createWalletService(),
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('useServices must be used inside ServicesProvider');
  return value;
}
