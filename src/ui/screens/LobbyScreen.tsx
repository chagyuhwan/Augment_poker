import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { audio } from '../../audio/audioEngine';
import { getGameMode } from '../../core/gameModes';
import { buyInRange } from '../../core/roomConfig';
import { LAN_DEFAULT_PORT } from '../../net/lanProtocol';
import { ensureFundsForBuyIn } from '../../wallet/ensureFunds';
import { newTableId } from '../../wallet/walletService';
import { fmtMoney, useWallet } from '../../wallet/useWallet';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';

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
  const { rooms, lan, wallet, identity } = useServices();
  const { account, refresh } = useWallet();
  const [, setTick] = useState(0);
  const [buyingIn, setBuyingIn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [boughtIn, setBoughtIn] = useState(false);
  const [tableId] = useState(() => newTableId('lan'));
  const leaving = useRef(false);
  const buyInDone = useRef(false);
  const navRef = useRef(nav);
  const walletRef = useRef(wallet);
  const lanRef = useRef(lan);
  navRef.current = nav;
  walletRef.current = wallet;
  lanRef.current = lan;

  const room = rooms.getCurrentRoom();
  const meta = lan?.getLanMeta();
  const isHost = meta?.role === 'host';
  const me = meta?.members.find((m) => m.playerId === meta.localPlayerId);
  const mode = room ? getGameMode(room.config.mode) : null;
  const roomId = room?.id ?? null;
  const minBuyIn = room?.config.minBuyIn ?? 0;

  const leave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      if (boughtIn) {
        const chips = me?.buyIn ?? minBuyIn;
        await wallet.cashOut(tableId, chips, 'leave');
        setBoughtIn(false);
      }
      await rooms.leaveRoom();
    } finally {
      nav.resetToMenu();
    }
  }, [boughtIn, me?.buyIn, minBuyIn, wallet, tableId, rooms, nav]);

  useEffect(() => {
    if (!lan) {
      if (!leaving.current) {
        leaving.current = true;
        nav.toast('LAN 서비스를 사용할 수 없습니다.', 'error');
        nav.resetToMenu();
      }
      return;
    }
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
  }, [lan, nav, tableId]);

  // 바이인 1회만. leave/refresh deps로 취소되지 않게 ref 사용
  useEffect(() => {
    if (!lan || !roomId || !minBuyIn || boughtIn || buyInDone.current || leaving.current) return;
    buyInDone.current = true;
    setBuyingIn(true);
    const title = rooms.getCurrentRoom()?.config.title ?? 'LAN';
    void (async () => {
      try {
        const funds = await ensureFundsForBuyIn(walletRef.current, minBuyIn, tableId);
        if (leaving.current) return;
        if (!funds.ok) {
          navRef.current.toast(funds.error, 'error');
          leaving.current = true;
          await rooms.leaveRoom();
          navRef.current.resetToMenu();
          navRef.current.push({ name: 'wallet' });
          return;
        }
        let r = await walletRef.current.buyIn(tableId, minBuyIn, `LAN · ${title}`);
        if (leaving.current) {
          if (r.ok) await walletRef.current.cashOut(tableId, minBuyIn, 'leave');
          return;
        }
        if (!r.ok) {
          const snap = await walletRef.current.snapshot();
          const seated = snap.account?.tables.some((t) => t.tableId === tableId);
          if (!seated) {
            navRef.current.toast(r.error, 'error');
            leaving.current = true;
            await rooms.leaveRoom();
            navRef.current.resetToMenu();
            return;
          }
        }
        await lanRef.current?.setLocalBuyIn(minBuyIn);
        await refresh();
        setBoughtIn(true);
      } catch (err) {
        buyInDone.current = false;
        navRef.current.toast(err instanceof Error ? err.message : '바이인에 실패했습니다.', 'error');
      } finally {
        setBuyingIn(false);
      }
    })();
  }, [lan, roomId, minBuyIn, boughtIn, tableId, rooms, refresh]);

  if (!room || !lan || !meta) {
    return (
      <div className="screen lobby">
        <ScreenHeader title="대기실" subtitle="방에 연결하는 중…" />
      </div>
    );
  }

  const primaryIp = meta.addresses[0] ?? '127.0.0.1';
  const joinHint = `${primaryIp} · ${meta.code}`;
  const range = buyInRange(room.config.minBuyIn);

  const toggleReady = () => {
    audio.play('click');
    lan.setReady(!(me?.isReady ?? false));
  };

  const start = async () => {
    if (!isHost || starting || buyingIn || !boughtIn) return;
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
        subtitle={`${mode?.shortName ?? ''} · 최소 ${fmtMoney(room.config.minBuyIn)} · 블라인드 ${room.config.smallBlind}/${room.config.bigBlind}`}
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
                <span className={m.isReady ? 'lobby__ready is-on' : 'lobby__ready'}>{m.isReady ? '준비' : '대기'}</span>
                <span className="lobby__buyin">{fmtMoney(m.buyIn > 0 ? m.buyIn : room.config.minBuyIn)}</span>
              </li>
            ))}
          </ul>
          <p className="lobby__hint">
            {buyingIn
              ? '테이블 칩을 가져오는 중…'
              : `빈자리는 시작 시 봇으로 채웁니다. 가져간 금액 ${fmtMoney(me?.buyIn || (boughtIn ? room.config.minBuyIn : 0))}`}
            {account ? ` · 계정 잔액 ${fmtMoney(account.balance)}` : ''}
            {` · 가능 ${fmtMoney(range.min)}~${fmtMoney(range.max)}`}
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
              <Button
                variant={me?.isReady ? 'secondary' : 'primary'}
                onClick={toggleReady}
                disabled={!boughtIn || buyingIn}
              >
                {me?.isReady ? '준비 취소' : '준비'}
              </Button>
            )}
            {isHost && (
              <Button
                variant="primary"
                icon="play"
                disabled={starting || buyingIn || !boughtIn}
                onClick={() => void start()}
              >
                {buyingIn ? '칩 준비 중…' : starting ? '시작 중…' : !boughtIn ? '입장 처리 중…' : '게임 시작'}
              </Button>
            )}
          </div>
          <p className="lobby__muted">플레이어: {identity.getLocalPlayer().displayName}</p>
        </section>
      </div>
    </div>
  );
}
