import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { audio } from '../../audio/audioEngine';
import { getGameMode } from '../../core/gameModes';
import { LAN_DEFAULT_PORT } from '../../net/lanProtocol';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';

const fmt = (n: number) => n.toLocaleString('ko-KR');

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LobbyScreen() {
  const nav = useNavigation();
  const { rooms, lan, identity } = useServices();
  const [, setTick] = useState(0);
  const [starting, setStarting] = useState(false);
  const [tableId] = useState(() => `lan-${Date.now().toString(36)}`);
  const leaving = useRef(false);

  const room = rooms.getCurrentRoom();
  const meta = lan?.getLanMeta();
  const isHost = meta?.role === 'host';
  const me = meta?.members.find((m) => m.playerId === meta.localPlayerId);
  const mode = room ? getGameMode(room.config.mode) : null;

  const leave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await rooms.leaveRoom();
    } finally {
      nav.resetToMenu();
    }
  }, [rooms, nav]);

  useEffect(() => {
    if (!lan) {
      if (!leaving.current) {
        leaving.current = true;
        nav.toast('LAN 서비스를 사용할 수 없습니다.', 'error');
        nav.resetToMenu();
      }
      return;
    }
    // 매치 칩은 방 설정 startingChips로 전원 동일 — 지갑 바이인 없음
    void lan.setLocalBuyIn(room?.config.startingChips ?? room?.config.minBuyIn ?? 1000);
    const unsub = lan.onCurrentRoomChanged(() => setTick((n) => n + 1));
    const unsubStart = lan.onMatchStart((payload) => {
      if (payload.role === 'guest') {
        nav.push({ name: 'lan-table', start: payload, tableId });
      }
    });
    return () => {
      unsub();
      unsubStart();
    };
  }, [lan, nav, tableId, room?.config.startingChips, room?.config.minBuyIn]);

  if (!room || !lan || !meta) {
    return (
      <div className="screen lobby">
        <ScreenHeader title="대기실" subtitle="방에 연결하는 중…" />
      </div>
    );
  }

  const chips = room.config.startingChips || room.config.minBuyIn;
  const hands = room.config.matchHands ?? 8;
  const primaryIp = meta.addresses[0] ?? '127.0.0.1';
  const joinHint = `${primaryIp} · ${meta.code}`;
  const readyCount = meta.members.filter((m) => m.isReady || m.isHost).length;
  const canStart = isHost && meta.members.length >= 2 && readyCount >= 2;

  const toggleReady = () => {
    audio.play('click');
    lan.setReady(!(me?.isReady ?? false));
  };

  const start = async () => {
    if (!isHost || starting || !canStart) return;
    setStarting(true);
    try {
      const seatByPeer: Record<string, number> = {};
      meta.members.forEach((m, i) => {
        seatByPeer[m.peerId] = i;
      });
      const r = await lan.beginMatch(tableId, seatByPeer);
      if (!r.ok) {
        nav.toast(r.message, 'error');
        return;
      }
      nav.push({ name: 'lan-table', start: r.value, tableId });
    } catch (err) {
      nav.toast(err instanceof Error ? err.message : '게임을 시작하지 못했습니다.', 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="screen lobby">
      <ScreenHeader
        title={room.config.title}
        subtitle={`${mode?.shortName ?? ''} · ${hands}핸드 · 시작칩 ${fmt(chips)} · 블라인드 ${room.config.smallBlind}/${room.config.bigBlind}`}
        actions={
          <Button variant="ghost" icon="power" onClick={() => void leave()}>
            방 나가기
          </Button>
        }
      />

      <div className="lobby__layout">
        <section className="lobby__panel">
          <h2 className="lobby__title">
            플레이어 {meta.members.length}/{room.config.maxPlayers}
          </h2>
          <ul className="lobby__members">
            {meta.members.map((m) => (
              <li key={m.playerId} className={m.playerId === meta.localPlayerId ? 'lobby__member is-me' : 'lobby__member'}>
                <span className="lobby__member-name">
                  {m.displayName}
                  {m.isHost ? ' · 방장' : ''}
                </span>
                <span className={m.isReady || m.isHost ? 'lobby__ready is-on' : 'lobby__ready'}>
                  {m.isReady || m.isHost ? '준비' : '대기'}
                </span>
                <span className="lobby__buyin">{fmt(chips)}</span>
              </li>
            ))}
          </ul>
          <p className="lobby__hint">
            전원 동일 시작 칩 {fmt(chips)}. 칩이 0이어도 다음 핸드에 복구되며, {hands}핸드 후 순이익으로 순위를 가립니다.
            {meta.members.length < room.config.maxPlayers ? ' 빈자리는 시작 시 봇으로 채울 수 있습니다.' : ''}
          </p>
        </section>

        <section className="lobby__panel lobby__invite">
          <h2 className="lobby__title">친구 초대 (LAN)</h2>
          <p className="lobby__lead">
            같은 Wi‑Fi 친구에게 호스트 IP와 방 코드를 알려 주세요. 같은 PC에서는 IP에 <code>127.0.0.1</code>을 쓰면 됩니다.
          </p>
          <div className="lobby__code-row">
            <div>
              <span className="lobby__label">방 코드</span>
              <span className="lobby__code">{meta.code}</span>
            </div>
            <div>
              <span className="lobby__label">포트</span>
              <span className="lobby__code">{LAN_DEFAULT_PORT}</span>
            </div>
          </div>
          <div className="lobby__ips">
            <span className="lobby__label">호스트 주소</span>
            <ul>
              <li>
                <code>127.0.0.1</code> <span className="lobby__muted">(같은 PC)</span>
              </li>
              {meta.addresses.map((ip) => (
                <li key={ip}>
                  <code>{ip}</code>
                </li>
              ))}
              {meta.addresses.length === 0 && (
                <li className="lobby__muted">LAN IP를 찾지 못했습니다. 방화벽·Wi‑Fi를 확인하세요.</li>
              )}
            </ul>
          </div>
          <div className="lobby__actions">
            <Button
              icon="invite"
              onClick={() => {
                void copyText(joinHint).then((ok) =>
                  nav.toast(ok ? 'IP와 코드를 복사했습니다.' : joinHint, ok ? 'success' : 'default'),
                );
              }}
            >
              IP·코드 복사
            </Button>
            {!isHost && (
              <Button variant={me?.isReady ? 'secondary' : 'primary'} onClick={toggleReady}>
                {me?.isReady ? '준비 취소' : '준비'}
              </Button>
            )}
            {isHost && (
              <Button variant="primary" icon="play" disabled={starting || !canStart} onClick={() => void start()}>
                {starting ? '시작 중…' : meta.members.length < 2 ? '최소 2명 필요' : !canStart ? '준비 대기' : '게임 시작'}
              </Button>
            )}
          </div>
          <p className="lobby__muted">플레이어: {identity.getLocalPlayer().displayName}</p>
        </section>
      </div>
    </div>
  );
}
