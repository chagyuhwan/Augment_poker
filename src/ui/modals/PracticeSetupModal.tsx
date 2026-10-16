import { useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { useSettings } from '../../app/settingsContext';
import { DEFAULT_MATCH_HANDS, DEFAULT_STARTING_CHIPS } from '../../core/matchRules';
import { maxBetLabel, ROOM_OPTIONS } from '../../core/roomConfig';
import type { TableMode } from '../../practice/game/types';
import type { BotSpeed } from '../../settings/settings';
import { Button } from '../components/Button';
import { Field, Segmented } from '../components/Controls';
import { Modal } from '../components/Modal';

const fmt = (n: number) => n.toLocaleString('ko-KR');

export function PracticeSetupModal() {
  const nav = useNavigation();
  const { identity } = useServices();
  const { settings, update } = useSettings();
  const [mode, setMode] = useState<TableMode>('augmented');
  const [botCount, setBotCount] = useState(3);
  const [bigBlind, setBigBlind] = useState(20);
  const [startingChips, setStartingChips] = useState(DEFAULT_STARTING_CHIPS);
  const [matchHands, setMatchHands] = useState(DEFAULT_MATCH_HANDS);
  const [maxBetMultiple, setMaxBetMultiple] = useState(0);

  const start = () => {
    const tableId = `bot-${Date.now().toString(36)}`;
    nav.closeModal();
    nav.push({
      name: 'practice',
      options: {
        tableId,
        mode,
        playerName: identity.getLocalPlayer().displayName,
        buyIn: startingChips,
        botCount,
        smallBlind: bigBlind / 2,
        bigBlind,
        minBuyIn: startingChips,
        startingChips,
        matchHands,
        maxBet: maxBetMultiple > 0 ? bigBlind * maxBetMultiple : null,
      },
    });
  };

  return (
    <Modal
      title="봇 대전"
      subtitle="매치 전용 칩으로 AI와 한 경기를 즐깁니다. 칩이 0이어도 다음 핸드에 복구되며, 정해진 핸드가 끝나면 순위로 승패를 가립니다."
      icon="play"
      width={940}
      onClose={nav.closeModal}
      footer={
        <>
          <span className="modal__footer-note is-info">
            {matchHands}핸드 · 시작칩 {fmt(startingChips)} · 블라인드 {fmt(bigBlind / 2)}/{fmt(bigBlind)}
          </span>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          <Button variant="primary" icon="play" onClick={start}>
            경기 시작
          </Button>
        </>
      }
    >
      <div className="form-grid form-grid--single">
        <Field
          label="게임 모드"
          hint={
            mode === 'augmented'
              ? '1·3번째 베팅 구간 후 증강 3개 중 1개를 고릅니다. 증강은 핸드가 끝나면 사라집니다.'
              : '증강 없이 일반 텍사스 홀덤으로 진행합니다.'
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
        <Field label="봇 수" hint={`최대 ${botCount + 1}명 테이블`}>
          <Segmented
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}명` }))}
            value={botCount}
            onChange={setBotCount}
          />
        </Field>
        <Field label="경기 길이" hint="모두 진행하면 순이익으로 순위를 매깁니다.">
          <Segmented
            options={ROOM_OPTIONS.matchHands.map((n) => ({ value: n, label: `${n}핸드` }))}
            value={matchHands}
            onChange={setMatchHands}
          />
        </Field>
        <Field label="시작 칩" hint="전원 동일. 칩이 0이면 다음 핸드에 같은 금액이 복구됩니다.">
          <Segmented
            options={ROOM_OPTIONS.startingChips.map((n) => ({ value: n, label: fmt(n) }))}
            value={startingChips}
            onChange={setStartingChips}
          />
        </Field>
        <Field label="시작 블라인드" hint="경기가 진행될수록 블라인드가 늘어납니다.">
          <Segmented
            options={ROOM_OPTIONS.blinds.map(([sb, bb]) => ({ value: bb, label: `${fmt(sb)} / ${fmt(bb)}` }))}
            value={bigBlind}
            onChange={setBigBlind}
          />
        </Field>
        <Field
          label="최대 베팅"
          hint={maxBetMultiple > 0 ? `한 번에 ${fmt(bigBlind * maxBetMultiple)}까지.` : '보유 칩까지 자유롭게 베팅합니다.'}
        >
          <Segmented
            options={ROOM_OPTIONS.maxBetMultiples.map((n) => ({ value: n, label: maxBetLabel(n) }))}
            value={maxBetMultiple}
            onChange={setMaxBetMultiple}
          />
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
