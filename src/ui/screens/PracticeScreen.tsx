import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useSettings } from '../../app/settingsContext';
import { createPracticeTable, refillBots, type PracticeOptions } from '../../practice/game/botTable';
import { byId, isLive, rematch, requestLeave, startHand } from '../../practice/game/engine';
import type { GameState } from '../../practice/game/types';
import { GameScreen } from '../../practice/ui/GameScreen';
import { bridge } from '../../platform/desktopBridge';
import { BOT_DELAY } from '../../settings/settings';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface Props {
  options: PracticeOptions;
}

export function PracticeScreen({ options }: Props) {
  const nav = useNavigation();
  const { settings } = useSettings();
  const [game, setGame] = useState<GameState>(() => createPracticeTable(options));
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const leftRef = useRef(false);
  const lastEventSeq = useRef(0);
  const { tableId } = options;

  const nextHand = useCallback((s: GameState) => startHand(refillBots(s, options)), [options]);

  const onRematch = useCallback(() => {
    setGame((s) => rematch(s));
  }, []);

  const me = byId(game, game.heroId);

  useEffect(() => {
    const fresh = game.events.filter((e) => e.seq > lastEventSeq.current);
    if (fresh.length === 0) return;
    lastEventSeq.current = fresh[fresh.length - 1].seq;
    for (const e of fresh) {
      if (e.type === 'handSettled') {
        bridge.log('info', `[${tableId}] hand #${e.handNo} settled pot=${e.pot}`);
      } else if (e.type === 'chipRefill' && e.playerId === game.heroId) {
        nav.toast(`칩 ${e.amount.toLocaleString()}이 복구되었습니다. 다음 핸드에 참가합니다.`, 'success');
      } else if (e.type === 'busted' && e.playerId === game.heroId) {
        const last = game.handNumber >= game.matchHands;
        nav.toast(
          last
            ? '칩이 소진되었습니다. 매치가 종료됩니다.'
            : '칩이 소진되었습니다. 다음 핸드에 자동으로 복구됩니다.',
          'default',
        );
      } else if (e.type === 'matchEnded') {
        bridge.log('info', `[${tableId}] match ended at hand #${e.handNo}`);
      }
    }
  }, [game.events, game.heroId, game.handNumber, game.matchHands, tableId, nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (confirmLeave) setConfirmLeave(false);
      else setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmLeave]);

  const leave = () => {
    if (leftRef.current) {
      nav.resetToMenu();
      return;
    }
    const r = requestLeave(gameRef.current, gameRef.current.heroId);
    if (!r.ok) {
      nav.toast(r.error, 'error');
      return;
    }
    leftRef.current = true;
    setGame(r.state);
    nav.resetToMenu();
  };

  const inHand = Boolean(me && isLive(me) && (game.phase === 'betting' || game.phase === 'augment'));
  const askLeave = () => {
    setPaused(true);
    setConfirmLeave(true);
  };

  return (
    <>
      <GameScreen
        state={game}
        setState={setGame}
        botDelay={BOT_DELAY[settings.botSpeed]}
        paused={paused}
        nextHand={nextHand}
        halted={false}
        onPause={() => setPaused(true)}
        onLeave={askLeave}
        onRematch={onRematch}
      />
      {paused && (
        <div className="practice-pause">
          {confirmLeave ? (
            <Modal
              title="테이블 나가기"
              subtitle={
                inHand
                  ? '진행 중인 핸드는 폴드 처리되며 이미 건 칩은 팟에 남습니다. 중도 퇴장(DNF)으로 기록됩니다.'
                  : '매치를 포기하고 메인 메뉴로 돌아갑니다.'
              }
              icon="power"
              width={520}
              onClose={() => {
                setConfirmLeave(false);
                setPaused(false);
              }}
              footer={
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmLeave(false);
                      setPaused(false);
                    }}
                    sound="close"
                  >
                    계속 플레이
                  </Button>
                  <Button variant="primary" icon="power" onClick={leave}>
                    나가기
                  </Button>
                </>
              }
            />
          ) : (
            <Modal
              title="일시 정지"
              subtitle="봇 대전은 오프라인으로 진행됩니다. 나가도 계정 지갑에는 영향을 주지 않습니다."
              icon="play"
              width={480}
              onClose={() => setPaused(false)}
              footer={
                <>
                  <Button variant="ghost" icon="power" onClick={() => setConfirmLeave(true)}>
                    테이블 나가기
                  </Button>
                  <Button variant="primary" onClick={() => setPaused(false)}>
                    계속하기
                  </Button>
                </>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
