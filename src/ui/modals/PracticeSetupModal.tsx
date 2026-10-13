import { useMemo, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { useSettings } from '../../app/settingsContext';
import { buyInRange, maxBetLabel, MIN_BUYIN_TO_FORCED_BET_RATIO, ROOM_OPTIONS } from '../../core/roomConfig';
import type { TableMode } from '../../practice/game/types';
import type { BotSpeed } from '../../settings/settings';
import { fmtMoney, useWallet } from '../../wallet/useWallet';
import { newTableId } from '../../wallet/walletService';
import { Button } from '../components/Button';
import { Field, Segmented } from '../components/Controls';
import { Modal } from '../components/Modal';

const BUYIN_MULTIPLES = [1, 2, 3, 5, 10];

export function PracticeSetupModal() {
  const nav = useNavigation();
  const { identity } = useServices();
  const { settings, update } = useSettings();
  const { account, snapshot, wallet } = useWallet();
  const [mode, setMode] = useState<TableMode>('augmented');
  const [botCount, setBotCount] = useState(3);
  const [bigBlind, setBigBlind] = useState(20);
  const [minBuyIn, setMinBuyIn] = useState(2000);
  const [maxBetMultiple, setMaxBetMultiple] = useState(0);
  const [buyInChoice, setBuyInChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const balance = account?.balance ?? 0;
  const validMinBuyIns = ROOM_OPTIONS.minBuyIns.filter((n) => n >= bigBlind * MIN_BUYIN_TO_FORCED_BET_RATIO);
  const effectiveMinBuyIn = validMinBuyIns.includes(minBuyIn as (typeof ROOM_OPTIONS.minBuyIns)[number])
    ? minBuyIn
    : validMinBuyIns[0];
  const range = buyInRange(effectiveMinBuyIn);
  const buyInOptions = useMemo(
    () => BUYIN_MULTIPLES.map((m) => effectiveMinBuyIn * m).filter((n) => n <= range.max && n <= balance),
    [effectiveMinBuyIn, range.max, balance],
  );
  const buyIn = buyInChoice !== null && buyInOptions.includes(buyInChoice) ? buyInChoice : (buyInOptions[Math.min(2, buyInOptions.length - 1)] ?? 0);
  const insufficient = account !== null && balance < effectiveMinBuyIn;

  const start = async () => {
    if (busy || insufficient || buyIn <= 0) return;
    setBusy(true);
    const tableId = newTableId('bot');
    const r = await wallet.buyIn(tableId, buyIn, `봇 대전 (${mode === 'augmented' ? '증강' : '일반'} 홀덤)`);
    setBusy(false);
    if (!r.ok) {
      nav.toast(r.error, 'error');
      return;
    }
    nav.closeModal();
    nav.push({
      name: 'practice',
      options: {
        tableId,
        mode,
        playerName: identity.getLocalPlayer().displayName,
        buyIn,
        botCount,
        smallBlind: bigBlind / 2,
        bigBlind,
        minBuyIn: effectiveMinBuyIn,
        maxBet: maxBetMultiple > 0 ? bigBlind * maxBetMultiple : null,
      },
    });
  };

  return (
    <Modal
      title="봇 대전"
      subtitle="계정 게임머니를 테이블로 가져가 AI와 홀덤을 플레이합니다. 나가면 남은 금액을 돌려받습니다."
      icon="play"
      width={940}
      onClose={nav.closeModal}
      footer={
        <>
          <span className={insufficient || (snapshot && !snapshot.available) ? 'modal__footer-note' : 'modal__footer-note is-info'}>
            보유 {account ? fmtMoney(balance) : '—'}
            {snapshot && !snapshot.available ? ` · ${snapshot.error}` : ''}
          </span>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          {insufficient ? (
            <Button
              variant="primary"
              icon="chip"
              onClick={() => {
                nav.closeModal();
                nav.push({ name: 'wallet' });
              }}
            >
              게임머니 충전
            </Button>
          ) : (
            <Button variant="primary" icon="play" disabled={busy || !account || buyIn <= 0} onClick={() => void start()}>
              {busy ? '입장 중…' : `${fmtMoney(buyIn)} 가지고 입장`}
            </Button>
          )}
        </>
      }
    >
      <div className="form-grid form-grid--single">
        <Field
          label="게임 모드"
          hint={
            mode === 'augmented'
              ? '1번째·3번째 베팅 구간이 끝나면 증강 3개 중 1개를 고릅니다. 증강은 판이 바뀌어도 쌓입니다.'
              : '증강 없이 일반 텍사스 홀덤 규칙으로 진행합니다.'
          }
        >
          <Segmented<TableMode>
            options={[
              { value: 'normal', label: '일반 홀덤' },
              { value: 'augmented', label: '증강 홀덤' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Field>
        <Field label="봇 수" hint={`최대 ${botCount + 1}명. 봇이 소진되어 나가면 빈자리에 새 봇이 들어옵니다.`}>
          <Segmented
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}명` }))}
            value={botCount}
            onChange={setBotCount}
          />
        </Field>
        <Field label="블라인드 (스몰 / 빅)" hint="최소 베팅은 빅 블라인드입니다. 블라인드는 오르지 않습니다.">
          <Segmented
            options={ROOM_OPTIONS.blinds.map(([sb, bb]) => ({ value: bb, label: `${fmtMoney(sb)} / ${fmtMoney(bb)}` }))}
            value={bigBlind}
            onChange={setBigBlind}
          />
        </Field>
        <Field label="최소 입장 게임머니" hint={`빅 블라인드의 ${MIN_BUYIN_TO_FORCED_BET_RATIO}배 이상만 고를 수 있습니다.`}>
          <Segmented
            options={validMinBuyIns.map((n) => ({ value: n, label: fmtMoney(n) }))}
            value={effectiveMinBuyIn}
            onChange={setMinBuyIn}
          />
        </Field>
        <Field label="최대 베팅" hint={maxBetMultiple > 0 ? `한 번에 ${fmtMoney(bigBlind * maxBetMultiple)}까지 올릴 수 있습니다.` : '보유한 칩까지 자유롭게 베팅합니다.'}>
          <Segmented
            options={ROOM_OPTIONS.maxBetMultiples.map((n) => ({ value: n, label: maxBetLabel(n) }))}
            value={maxBetMultiple}
            onChange={setMaxBetMultiple}
          />
        </Field>
        <Field
          label="가져갈 게임머니"
          hint={
            insufficient
              ? `보유 게임머니가 최소 입장 금액 ${fmtMoney(effectiveMinBuyIn)}보다 적습니다. 충전 후 입장해 주세요.`
              : `${fmtMoney(range.min)} ~ ${fmtMoney(Math.min(range.max, balance))} 사이에서 고릅니다.`
          }
        >
          {buyInOptions.length > 0 ? (
            <Segmented options={buyInOptions.map((n) => ({ value: n, label: fmtMoney(n) }))} value={buyIn} onChange={setBuyInChoice} />
          ) : (
            <span className="field__hint">—</span>
          )}
        </Field>
        <Field label="봇 속도" hint="설정에도 저장됩니다.">
          <Segmented<BotSpeed>
            options={[
              { value: 'slow', label: '느리게' },
              { value: 'normal', label: '보통' },
              { value: 'fast', label: '빠르게' },
            ]}
            value={settings.botSpeed}
            onChange={(botSpeed) => update({ botSpeed })}
          />
        </Field>
      </div>
    </Modal>
  );
}
