import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigation } from '../../app/navigation';
import { audio } from '../../audio/audioEngine';
import type { LedgerEntry, LedgerType } from '../../wallet/types';
import { fmtMoney, useWallet } from '../../wallet/useWallet';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

const TYPE_LABEL: Record<LedgerType, string> = {
  grant: '기본 지급',
  buyIn: '테이블 입장',
  cashOut: '테이블 정산',
  freeCharge: '무료 충전',
  recovery: '복구 정산',
};

const fmtTime = (t: number) =>
  new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 금액이 바뀌면 이전 값에서 새 값까지 숫자를 굴려 보여 준다. 처음 불러온 값은 바로 보여 준다 */
function useRolling(value: number | null) {
  const [shown, setShown] = useState(value ?? 0);
  const [rolling, setRolling] = useState(false);
  const from = useRef(value);
  useEffect(() => {
    if (value === null) return;
    const start = from.current;
    if (start === null) {
      from.current = value;
      setShown(value);
      return;
    }
    if (start === value) return;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    setRolling(true);
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (value - start) * e);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setRolling(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return { shown, rolling };
}

const COINS = Array.from({ length: 26 }, (_, i) => ({
  left: 4 + ((i * 37) % 92),
  dur: 1.1 + ((i * 7) % 6) / 10,
  delay: ((i * 13) % 10) / 14,
  dx: ((i * 29) % 80) - 40,
  rot: 360 + ((i * 53) % 540),
}));

function CoinRain() {
  return (
    <div className="coin-rain" aria-hidden="true">
      {COINS.map((c, i) => (
        <i
          key={i}
          className="coin-rain__coin"
          style={
            {
              left: `${c.left}%`,
              '--dur': `${c.dur}s`,
              '--delay': `${c.delay}s`,
              '--dx': `${c.dx}px`,
              '--rot': `${c.rot}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function WalletScreen() {
  const nav = useNavigation();
  const { snapshot, account, wallet } = useWallet();
  const [history, setHistory] = useState<LedgerEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [rain, setRain] = useState(0);
  const balance = useRolling(account?.balance ?? null);

  useEffect(() => {
    if (!rain) return;
    const t = setTimeout(() => setRain(0), 2600);
    return () => clearTimeout(t);
  }, [rain]);

  useEffect(() => {
    void wallet.history().then(setHistory);
  }, [wallet, account?.balance]);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    const r = await wallet.claimFreeCharge();
    setBusy(false);
    if (r.ok) {
      audio.play('confirm');
      [0, 180, 360, 560, 800].forEach((d) => setTimeout(() => audio.play('coin'), d));
      setRain(Date.now());
      nav.toast(`${fmtMoney(account?.freeCharge.amount ?? 0)} 게임머니를 충전했습니다.`, 'success');
    } else {
      nav.toast(r.error, 'error');
    }
  };

  const free = account?.freeCharge;

  return (
    <div className="screen wallet">
      <ScreenHeader title="게임머니" subtitle="모든 게임 모드에서 같은 게임머니를 사용합니다. 게임을 꺼도 유지됩니다." />

      <div className="wallet__grid">
        <section className="settings-card wallet-card">
          <h2 className="settings-card__title">
            <Icon name="chip" size={20} />
            보유 게임머니
          </h2>

          {!snapshot ? (
            <div className="wallet-card__loading">불러오는 중…</div>
          ) : !snapshot.available || !account ? (
            <div className="wallet-card__error">
              <p>{snapshot.error ?? '게임머니 정보를 불러오지 못했습니다.'}</p>
            </div>
          ) : (
            <>
              <div className="wallet-balance">
                <span className={balance.rolling ? 'wallet-balance__amount is-rolling' : 'wallet-balance__amount'}>{fmtMoney(balance.shown)}</span>
                <span className="wallet-balance__unit">게임머니</span>
              </div>
              {account.tableTotal > 0 && (
                <p className="wallet-card__note">테이블에 가져간 금액 {fmtMoney(account.tableTotal)} (퇴장하면 돌아옵니다)</p>
              )}
              {!wallet.persistent && (
                <p className="wallet-card__warn">브라우저 개발 모드입니다. 이 잔액은 개발용이며 게임 앱의 계정 잔액과 별개입니다.</p>
              )}
              {snapshot.recovered.length > 0 && (
                <p className="wallet-card__note">
                  비정상 종료된 테이블에서 {fmtMoney(snapshot.recovered.reduce((a, r) => a + r.amount, 0))}을 돌려받았습니다.
                </p>
              )}

              <div className="free-charge">
                <div className="free-charge__head">
                  <span className="free-charge__title">무료 충전</span>
                  <span className="free-charge__count">
                    오늘 남은 횟수 <strong>{free!.remaining}</strong> / {free!.dailyLimit}
                  </span>
                </div>
                <ul className="free-charge__rules">
                  <li>
                    보유 게임머니(테이블 금액 포함)가 {fmtMoney(free!.threshold)} 미만일 때 {fmtMoney(free!.amount)}씩 충전됩니다.
                  </li>
                  <li>하루 {free!.dailyLimit}회까지 가능하며 매일 자정에 초기화됩니다.</li>
                </ul>
                <Button variant="primary" icon="plus" disabled={!free!.eligible || busy} onClick={() => void claim()}>
                  {busy ? '충전 중…' : `${fmtMoney(free!.amount)} 무료 충전`}
                </Button>
                {!free!.eligible && free!.reason && <p className="free-charge__reason">{free!.reason}</p>}
              </div>
            </>
          )}
        </section>

        <section className="settings-card wallet-card">
          <h2 className="settings-card__title">
            <Icon name="clock" size={20} />
            게임머니 내역
          </h2>
          <div className="ledger">
            {history === null && <div className="wallet-card__loading">불러오는 중…</div>}
            {history?.length === 0 && <div className="wallet-card__loading">내역이 없습니다.</div>}
            {history?.slice(0, 60).map((e, i) => (
              <div key={e.id} className="ledger__row" style={{ '--row': Math.min(i, 15) } as CSSProperties}>
                <span className="ledger__type">{TYPE_LABEL[e.type]}</span>
                <span className="ledger__note">{e.note}</span>
                <span className="ledger__time">{fmtTime(e.at)}</span>
                <span className={e.amount >= 0 ? 'ledger__amount is-plus' : 'ledger__amount is-minus'}>
                  {e.amount >= 0 ? '+' : ''}
                  {fmtMoney(e.amount)}
                </span>
                <span className="ledger__balance">{fmtMoney(e.balance)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="wallet__legal">
        게임머니는 게임 안에서만 쓰는 재화로 현금 가치가 없으며, 현금·경품·외부 재화로 환전하거나 다른 이용자와 거래·선물할 수 없습니다.
      </footer>
      {rain > 0 && <CoinRain key={rain} />}
    </div>
  );
}
