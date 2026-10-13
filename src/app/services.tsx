import { createContext, useContext, type ReactNode } from 'react';
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
  wallet: IWalletService;
}

export async function createServices(): Promise<AppServices> {
  const [appInfo, steam] = await Promise.all([bridge.appInfo(), bridge.steamStatus()]);
  bridge.log(
    'info',
    `renderer ready: v${appInfo.version} ${appInfo.channel}, steam=${steam.available ? `on(${steam.appId})` : `off(${steam.error})`}`,
  );
  return {
    appInfo,
    steam,
    identity: new PlayerIdentityService(steam),
    // 임시: 2단계에서 Steam 로비 기반 방 서비스로 교체
    rooms: new UnavailableRoomService('온라인 방 서비스가 아직 연결되지 않았습니다. (개발 2단계에서 Steam 로비 연결 예정)'),
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
