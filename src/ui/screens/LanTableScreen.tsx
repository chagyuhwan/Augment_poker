import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { useSettings } from '../../app/settingsContext';
import { getGameMode } from '../../core/gameModes';
import { maxBetAmount } from '../../core/roomConfig';
import type { LanStartPayload } from '../../lobby/lanRoomService';
import { fogOfWar } from '../../net/fogOfWar';
import type { LanActionRequest } from '../../net/lanProtocol';
import {
  act,
  byId,
  chooseAugment,
  invokeAugment,
  isLive,
  requestLeave,
  startHand,
} from '../../practice/game/engine';
import { createLanTable } from '../../practice/game/lanTable';
import type { GameState, TableMode } from '../../practice/game/types';
import { GameScreen } from '../../practice/ui/GameScreen';
import { BOT_DELAY } from '../../settings/settings';
import { fmtMoney } from '../../wallet/useWallet';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface Props {
  start: LanStartPayload;
  tableId: string;
}

export function LanTableScreen({ start, tableId }: Props) {
  const nav = useNavigation();
  const { lan, wallet } = useServices();
  const { settings } = useSettings();
  const isHost = start.role === 'host';
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busted, setBusted] = useState(false);
  const settledRef = useRef(false);
  const seqRef = useRef(0);
  const gameRef = useRef<GameState | null>(null);
  const seatByPeerRef = useRef(start.seatByPeer);

  const mode: TableMode = getGameMode(start.room.config.mode).augmented ? 'augmented' : 'normal';

  const [initError, setInitError] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(() => {
    if (!isHost || !lan) return null;
    try {
      const meta = lan.getLanMeta();
      const humans = meta.members.map((m) => ({
        peerId: m.peerId,
        playerId: m.playerId,
        name: m.displayName,
        chips: Math.max(1, start.buyIns[m.playerId] || start.room.config.minBuyIn),
      }));
      // 방장을 humans[0]으로
      humans.sort((a, b) => (a.peerId === 'local' ? -1 : b.peerId === 'local' ? 1 : 0));
      if (humans.length < 1 || humans[0].peerId !== 'local') {
        // 방장이 meta에 없으면 로컬로 강제 삽입
        const host = meta.members.find((m) => m.peerId === 'local');
        if (host) {
          humans.unshift({
            peerId: 'local',
            playerId: host.playerId,
            name: host.displayName,
            chips: Math.max(1, start.buyIns[host.playerId] || start.room.config.minBuyIn),
          });
        }
      }
      const created = createLanTable({
        tableId,
        mode,
        humans,
        maxSeats: start.room.config.maxPlayers,
        smallBlind: start.room.config.smallBlind,
        bigBlind: start.room.config.bigBlind,
        minBuyIn: start.room.config.minBuyIn,
        maxBet: maxBetAmount(start.room.config),
        fillBots: true,
      });
      seatByPeerRef.current = created.seatByPeer;
      return created.state;
    } catch (err) {
      console.error('[LanTable] create failed', err);
      return null;
    }
  });

  useEffect(() => {
    if (isHost && !game && !initError) {
      setInitError('테이블을 만들지 못했습니다. 로비로 돌아가 다시 시작해 주세요.');
    }
  }, [isHost, game, initError]);

  gameRef.current = game;

  const broadcastViews = useCallback(
    (s: GameState) => {
      if (!lan || !isHost) return;
      seqRef.current += 1;
      const seq = seqRef.current;
      const meta = lan.getLanMeta();
      for (const m of meta.members) {
        if (m.peerId === 'local') continue;
        const seatId = seatByPeerRef.current[m.peerId];
        if (seatId === undefined) continue;
        void lan.sendStateView(m.peerId, seq, fogOfWar(s, seatId));
      }
    },
    [lan, isHost],
  );

  // 호스트: 상태 변경 시 브로드캐스트
  useEffect(() => {
    if (!isHost || !game) return;
    broadcastViews(game);
  }, [game, isHost, broadcastViews]);

  // 게스트: 상태 수신
  useEffect(() => {
    if (isHost || !lan) return;
    return lan.onStateView((view) => {
      setGame(view);
    });
  }, [isHost, lan]);

  // 호스트: 원격 액션 적용
  useEffect(() => {
    if (!isHost || !lan) return;
    return lan.onRemoteAction((_from, msg) => {
      const member = lan.getLanMeta().members.find((m) => m.playerId === msg.playerId);
      const sid = member ? seatByPeerRef.current[member.peerId] : undefined;
      if (sid === undefined) {
        void lan.broadcastActionAck(msg.reqId, false, '좌석을 찾을 수 없습니다.');
        return;
      }
      setGame((prev) => {
        if (!prev) return prev;
        const r = applyRemote(prev, sid, msg.request);
        void lan.broadcastActionAck(msg.reqId, r.ok, r.ok ? undefined : r.error);
        return r.ok ? r.state : prev;
      });
    });
  }, [isHost, lan]);

  const nextHand = useCallback((s: GameState) => startHand(s), []);

  // 게스트 액션 전송
  const onRemoteAction = useCallback(
    (request: LanActionRequest) => {
      if (!lan) return;
      const reqId = `a${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      void lan.sendAction(request, reqId);
    },
    [lan],
  );

  // 소진 감지 (호스트·게스트 공통 — 본인 heroId 기준)
  useEffect(() => {
    if (!game || settledRef.current) return;
    const me = byId(game, game.heroId);
    if (me?.status === 'busted') {
      settledRef.current = true;
      void wallet.cashOut(tableId, 0, 'bust');
      setBusted(true);
    }
  }, [game, tableId, wallet]);

  useEffect(() => {
    return () => {
      if (settledRef.current) return;
      settledRef.current = true;
      const s = gameRef.current;
      if (!s) {
        void wallet.cashOut(tableId, 0, 'leave');
        return;
      }
      const r = requestLeave(s, s.heroId);
      void wallet.cashOut(tableId, r.ok ? (r.chips ?? 0) : 0, 'leave');
      void lan?.leaveRoom();
    };
  }, [wallet, tableId, lan]);

  const leave = async () => {
    if (settledRef.current) {
      nav.resetToMenu();
      return;
    }
    const s = gameRef.current;
    if (!s) {
      nav.resetToMenu();
      return;
    }
    const r = requestLeave(s, s.heroId);
    settledRef.current = true;
    if (r.ok && isHost) setGame(r.state);
    const chips = r.ok ? (r.chips ?? 0) : 0;
    await wallet.cashOut(tableId, chips, 'leave');
    await lan?.leaveRoom();
    nav.toast(`테이블에서 ${fmtMoney(chips)}을 돌려받았습니다.`, 'success');
    nav.resetToMenu();
  };

  if (!game) {
    return (
      <div className="screen">
        <Modal
          title={initError ? '시작 실패' : '연결 중'}
          subtitle={initError ?? '방장의 게임 상태를 기다리는 중…'}
          icon="clock"
          width={420}
          onClose={() => void leave()}
          footer={
            <Button variant="primary" onClick={() => void leave()}>
              {initError ? '로비로' : '취소'}
            </Button>
          }
        />
      </div>
    );
  }

  const me = byId(game, game.heroId);
  const inHand = Boolean(me && isLive(me) && (game.phase === 'betting' || game.phase === 'augment'));

  const setGameOnly: Dispatch<SetStateAction<GameState>> = (update) => {
    setGame((prev) => {
      if (!prev) return prev;
      return typeof update === 'function' ? update(prev) : update;
    });
  };

  return (
    <>
      <GameScreen
        state={game}
        setState={setGameOnly}
        botDelay={BOT_DELAY[settings.botSpeed]}
        paused={paused || busted}
        nextHand={nextHand}
        halted={busted || settledRef.current}
        onPause={() => setPaused(true)}
        onLeave={() => {
          setPaused(true);
          setConfirmLeave(true);
        }}
        sync={isHost ? 'local' : 'remote'}
        onRemoteAction={isHost ? undefined : onRemoteAction}
      />
      {paused && !busted && (
        <div className="practice-pause">
          <Modal
            title={confirmLeave ? '테이블 나가기' : '일시 정지'}
            subtitle={
              confirmLeave
                ? inHand
                  ? '진행 중인 판은 폴드 처리됩니다.'
                  : '남은 칩을 계정으로 돌려받습니다.'
                : isHost
                  ? '방장이 일시 정지하면 진행이 멈춥니다.'
                  : '나가면 LAN 연결이 종료됩니다.'
            }
            icon="play"
            width={480}
            onClose={() => {
              setConfirmLeave(false);
              setPaused(false);
            }}
            footer={
              <>
                <Button
                  variant="ghost"
                  icon="power"
                  onClick={() => (confirmLeave ? void leave() : setConfirmLeave(true))}
                >
                  나가기
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmLeave(false);
                    setPaused(false);
                  }}
                >
                  계속하기
                </Button>
              </>
            }
          />
        </div>
      )}
    </>
  );
}

function applyRemote(
  s: GameState,
  seatId: number,
  request: LanActionRequest,
): { ok: true; state: GameState } | { ok: false; error: string } {
  if (request.kind === 'act') return act(s, seatId, request.action, request.actionSeq);
  if (request.kind === 'chooseAugment') return chooseAugment(s, seatId, request.pick, request.replace);
  if (request.kind === 'invokeAugment') return invokeAugment(s, request.id, request.payload, seatId);
  if (request.kind === 'peekForesight') return { ok: true, state: s };
  return { ok: false, error: '알 수 없는 요청' };
}
