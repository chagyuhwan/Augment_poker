import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { useSettings } from '../../app/settingsContext';
import { createPracticeTable, refillBots, type PracticeOptions } from '../../practice/game/botTable';
import { byId, isLive, requestLeave, startHand } from '../../practice/game/engine';
import type { GameState } from '../../practice/game/types';
import { GameScreen } from '../../practice/ui/GameScreen';
import { bridge } from '../../platform/desktopBridge';
import { BOT_DELAY } from '../../settings/settings';
import { fmtMoney } from '../../wallet/useWallet';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface Props {
  options: PracticeOptions;
}

const BUST_RETURN_SECONDS = 10;

export function PracticeScreen({ options }: Props) {
  const nav = useNavigation();
  const { wallet } = useServices();
  const { settings } = useSettings();
  const [game, setGame] = useState<GameState>(() => createPracticeTable(options));
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busted, setBusted] = useState(false);
  const [bustCountdown, setBustCountdown] = useState(BUST_RETURN_SECONDS);
  const gameRef = useRef(game);
  gameRef.current = game;
  /** 계정으로 정산(cashOut)을 마쳤는지. 두 번 정산하지 않는다 */
  const settledRef = useRef(false);
  const lastEventSeq = useRef(0);
  const { tableId } = options;

  const nextHand = useCallback(
    (s: GameState) => startHand(refillBots(s, options)),
    [options],
  );

  const me = byId(game, game.heroId);

  // 테이블 상태를 계정에 기록해 두면 비정상 종료 시 팟에 넣지 않은 칩을 돌려받는다
  useEffect(() => {
    if (!me || settledRef.current || me.status === 'busted') return;
    void wallet.checkpoint(tableId, me.chips, me.totalBet, game.handNumber);
  }, [wallet, tableId, me?.chips, me?.totalBet, me?.status, game.handNumber]);

  // 테이블 이벤트: 정산 로그, 본인 소진
  useEffect(() => {
    const fresh = game.events.filter((e) => e.seq > lastEventSeq.current);
    if (fresh.length === 0) return;
    lastEventSeq.current = fresh[fresh.length - 1].seq;
    for (const e of fresh) {
      if (e.type === 'handSettled') {
        bridge.log('info', `[${tableId}] hand #${e.handNo} settled pot=${e.pot} :: ${e.lines.join(' / ')}`);
      } else if (e.type === 'busted' && e.playerId === game.heroId && !settledRef.current) {
        settledRef.current = true;
        bridge.log('info', `[${tableId}] hero busted at hand #${e.handNo}`);
        void wallet.cashOut(tableId, 0, 'bust');
        setPaused(false);
        setConfirmLeave(false);
        setBusted(true);
      }
    }
  }, [game.events, game.heroId, tableId, wallet]);

  // 화면을 벗어나면(뒤로 가기 등) 남은 칩을 계정으로 돌려준다.
  // StrictMode 개발 모드의 마운트→언마운트→재마운트에서는 정산하지 않도록 한 틱 미룬다.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current || settledRef.current) return;
        settledRef.current = true;
        const r = requestLeave(gameRef.current, gameRef.current.heroId);
        void wallet.cashOut(tableId, r.ok ? (r.chips ?? 0) : 0, 'leave');
      }, 0);
    };
  }, [wallet, tableId]);

  useEffect(() => {
    if (!busted) return;
    if (bustCountdown <= 0) {
      nav.resetToMenu();
      return;
    }
    const t = setTimeout(() => setBustCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [busted, bustCountdown, nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busted) return;
      e.preventDefault();
      e.stopPropagation();
      if (confirmLeave) setConfirmLeave(false);
      else setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busted, confirmLeave]);

  const leave = async () => {
    if (settledRef.current) {
      nav.resetToMenu();
      return;
    }
    const r = requestLeave(gameRef.current, gameRef.current.heroId);
    if (!r.ok) {
      nav.toast(r.error, 'error');
      return;
    }
    settledRef.current = true;
    const chips = r.chips ?? 0;
    setGame(r.state);
    const res = await wallet.cashOut(tableId, chips, 'leave');
    if (res.ok) nav.toast(`테이블에서 ${fmtMoney(chips)} 게임머니를 돌려받았습니다.`, 'success');
    else nav.toast(res.error, 'error');
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
        paused={paused || busted}
        nextHand={nextHand}
        halted={busted || settledRef.current}
        onPause={() => setPaused(true)}
        onLeave={askLeave}
      />
      {paused && !busted && (
        <div className="practice-pause">
          {confirmLeave ? (
            <Modal
              title="테이블 나가기"
              subtitle={
                inHand
                  ? `진행 중인 판은 폴드 처리되며 이미 건 칩은 팟에 남습니다. 남은 ${fmtMoney(me?.chips ?? 0)}을 계정으로 돌려받습니다.`
                  : `테이블의 ${fmtMoney(me?.chips ?? 0)}을 계정으로 돌려받고 메인 메뉴로 갑니다.`
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
                  <Button variant="primary" icon="power" onClick={() => void leave()}>
                    나가기
                  </Button>
                </>
              }
            />
          ) : (
            <Modal
              title="일시 정지"
              subtitle="봇 대전은 오프라인으로 진행됩니다. 나가면 테이블의 게임머니가 계정으로 돌아갑니다."
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
      {busted && <div className="bust-overlay" />}
      {busted && (
        <div className="practice-pause">
          <Modal
            title="게임머니 소진"
            subtitle={`${bustCountdown}초 뒤 메인 메뉴로 이동합니다.`}
            icon="chip"
            width={560}
            onClose={() => nav.resetToMenu()}
            children={
              <svg className="bust-wallet" viewBox="0 0 120 96" aria-hidden="true">
                <rect x="10" y="22" width="100" height="64" rx="12" fill="#7a1f33" stroke="#0e0306" strokeWidth="5" />
                <path d="M10 40 H110" stroke="#0e0306" strokeWidth="4" />
                <rect x="74" y="44" width="36" height="22" rx="8" fill="#5e1b2d" stroke="#0e0306" strokeWidth="4" />
                <circle cx="88" cy="55" r="5" fill="#f2c14e" stroke="#0e0306" strokeWidth="3" />
                <path d="M30 22 C 34 6 52 6 56 22" fill="none" stroke="#0e0306" strokeWidth="4" strokeDasharray="5 5" />
                <path d="M40 60 q6 -6 12 0 M60 60 q6 -6 12 0" fill="none" stroke="#0e0306" strokeWidth="3.5" strokeLinecap="round" transform="translate(-14 4)" />
                <path d="M34 76 q12 -9 24 0" fill="none" stroke="#0e0306" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M100 14 l4 -8 M108 20 l8 -4" stroke="#c4a29c" strokeWidth="3" strokeLinecap="round" />
              </svg>
            }
            footer={
              <>
                <Button variant="ghost" onClick={() => nav.resetToMenu()} sound="close">
                  메인 메뉴
                </Button>
                <Button
                  variant="primary"
                  icon="plus"
                  className="is-attention"
                  onClick={() => {
                    nav.resetToMenu();
                    nav.push({ name: 'wallet' });
                  }}
                >
                  게임머니 충전
                </Button>
              </>
            }
          />
        </div>
      )}
    </>
  );
}
