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
  rematch,
  requestLeave,
  startHand,
} from '../../practice/game/engine';
import { createLanTable } from '../../practice/game/lanTable';
import type { GameState, TableMode } from '../../practice/game/types';
import { GameScreen } from '../../practice/ui/GameScreen';
import { BOT_DELAY } from '../../settings/settings';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface Props {
  start: LanStartPayload;
  tableId: string;
}

export function LanTableScreen({ start, tableId }: Props) {
  const nav = useNavigation();
  const { lan } = useServices();
  const { settings } = useSettings();
  const isHost = start.role === 'host';
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leftRef = useRef(false);
  const seqRef = useRef(0);
  const gameRef = useRef<GameState | null>(null);
  const seatByPeerRef = useRef(start.seatByPeer);
  const lastEventSeq = useRef(0);

  const mode: TableMode = getGameMode(start.room.config.mode).augmented ? 'augmented' : 'normal';
  const startingChips = start.room.config.startingChips || start.room.config.minBuyIn;

  const [initError, setInitError] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(() => {
    if (!isHost || !lan) return null;
    try {
      const meta = lan.getLanMeta();
      const humans = meta.members.map((m) => ({
        peerId: m.peerId,
        playerId: m.playerId,
        name: m.displayName,
        chips: startingChips,
      }));
      humans.sort((a, b) => (a.peerId === 'local' ? -1 : b.peerId === 'local' ? 1 : 0));
      if (humans.length < 1 || humans[0].peerId !== 'local') {
        const host = meta.members.find((m) => m.peerId === 'local');
        if (host) {
          humans.unshift({
            peerId: 'local',
            playerId: host.playerId,
            name: host.displayName,
            chips: startingChips,
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
        startingChips,
        matchHands: start.room.config.matchHands,
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

  useEffect(() => {
    if (!isHost || !game) return;
    broadcastViews(game);
  }, [game, isHost, broadcastViews]);

  useEffect(() => {
    if (isHost || !lan) return;
    return lan.onStateView((view) => {
      setGame(view);
    });
  }, [isHost, lan]);

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

  const onRematch = useCallback(() => {
    if (!isHost) return;
    setGame((s) => (s ? rematch(s) : s));
  }, [isHost]);

  const onRemoteAction = useCallback(
    (request: LanActionRequest) => {
      if (!lan) return;
      const reqId = `a${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      void lan.sendAction(request, reqId);
    },
    [lan],
  );

  useEffect(() => {
    if (!game) return;
    const fresh = game.events.filter((e) => e.seq > lastEventSeq.current);
    if (fresh.length === 0) return;
    lastEventSeq.current = fresh[fresh.length - 1].seq;
    for (const e of fresh) {
      if (e.type === 'chipRefill' && e.playerId === game.heroId) {
        nav.toast(`칩 ${e.amount.toLocaleString()}이 복구되었습니다.`, 'success');
      } else if (e.type === 'busted' && e.playerId === game.heroId) {
        const last = game.handNumber >= game.matchHands;
        nav.toast(
          last ? '칩이 소진되었습니다. 매치가 종료됩니다.' : '칩이 소진되었습니다. 다음 핸드에 자동 복구됩니다.',
          'default',
        );
      }
    }
  }, [game, nav]);

  useEffect(() => {
    return () => {
      if (leftRef.current) return;
      leftRef.current = true;
      void lan?.leaveRoom();
    };
  }, [lan]);

  const leave = async () => {
    if (leftRef.current) {
      nav.resetToMenu();
      return;
    }
    const s = gameRef.current;
    leftRef.current = true;
    if (s && isHost) {
      const r = requestLeave(s, s.heroId);
      if (r.ok) setGame(r.state);
    }
    await lan?.leaveRoom();
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
        paused={paused}
        nextHand={nextHand}
        halted={false}
        onPause={() => setPaused(true)}
        onLeave={() => {
          setPaused(true);
          setConfirmLeave(true);
        }}
        onRematch={isHost ? onRematch : undefined}
        sync={isHost ? 'local' : 'remote'}
        onRemoteAction={isHost ? undefined : onRemoteAction}
      />
      {paused && (
        <div className="practice-pause">
          <Modal
            title={confirmLeave ? '테이블 나가기' : '일시 정지'}
            subtitle={
              confirmLeave
                ? inHand
                  ? '진행 중인 핸드는 폴드 처리되며 중도 퇴장(DNF)으로 기록됩니다.'
                  : '방에서 나가고 메인 메뉴로 돌아갑니다.'
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
