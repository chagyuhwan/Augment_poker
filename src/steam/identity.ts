import type { IPlayerIdentityService, PlayerIdentity } from '../net/types';
import type { SteamStatus } from '../platform/desktopBridge';

const OFFLINE_ID_KEY = 'augmented-poker-offline-id';

function offlinePlayerId(): string {
  let id = localStorage.getItem(OFFLINE_ID_KEY);
  if (!id) {
    id = `offline-${crypto.randomUUID()}`;
    localStorage.setItem(OFFLINE_ID_KEY, id);
  }
  return id;
}

/** Steam이 있으면 Steam 계정, 없으면 이 PC에 저장된 개발용 오프라인 ID를 쓴다. */
export class PlayerIdentityService implements IPlayerIdentityService {
  private readonly player: PlayerIdentity;

  constructor(steam: SteamStatus) {
    this.player =
      steam.available && steam.steamId
        ? { playerId: `steam-${steam.steamId}`, displayName: steam.playerName ?? 'Steam 플레이어', provider: 'steam' }
        : { playerId: offlinePlayerId(), displayName: '개발 플레이어', provider: 'offline' };
  }

  getLocalPlayer(): PlayerIdentity {
    return this.player;
  }
}
