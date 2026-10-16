import { useMemo, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { GAME_MODES, getGameMode, type GameModeId } from '../../core/gameModes';
import {
  createDefaultRoomConfig,
  maxBetAmount,
  maxBetLabel,
  normalizeRoomConfig,
  ROOM_LIMITS,
  ROOM_OPTIONS,
  validateRoomConfig,
  type RoomConfig,
  type RoomConfigField,
  type RoomVisibility,
} from '../../core/roomConfig';
import { Button } from '../components/Button';
import { Field, Segmented, TextInput, Toggle } from '../components/Controls';
import { Modal } from '../components/Modal';

const fmt = (n: number) => n.toLocaleString('ko-KR');

export function CreateRoomModal({ initialMode }: { initialMode?: GameModeId }) {
  const nav = useNavigation();
  const { identity, rooms, lan } = useServices();
  const [config, setConfig] = useState<RoomConfig>(() =>
    createDefaultRoomConfig(initialMode ?? 'normal-holdem', identity.getLocalPlayer().displayName),
  );
  const [usePassword, setUsePassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const mode = getGameMode(config.mode);
  const maxBet = maxBetAmount(config);
  const effective = useMemo(() => ({ ...config, password: usePassword ? config.password : '' }), [config, usePassword]);
  const errors = useMemo(() => validateRoomConfig(effective), [effective]);
  const passwordMissing = usePassword && config.password === '';
  const errorFor = (field: RoomConfigField) =>
    submitted ? (errors.find((e) => e.field === field)?.message ?? null) : null;

  const set = <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) =>
    setConfig((c) => {
      const next = { ...c, [key]: value };
      if (key === 'startingChips') next.minBuyIn = value as number;
      return next;
    });

  const submit = async () => {
    setSubmitted(true);
    if (errors.length > 0 || passwordMissing || busy) return;
    if (!rooms.available && !lan) {
      nav.openModal({
        name: 'message',
        title: '방을 만들 수 없습니다',
        body: rooms.unavailableReason ?? 'LAN 방 서비스가 없습니다. Electron을 재시작해 주세요.',
        tone: 'danger',
      });
      return;
    }
    setBusy(true);
    const result = await (lan ?? rooms).createRoom(normalizeRoomConfig(effective));
    setBusy(false);
    if (result.ok) {
      nav.closeModal();
      nav.push({ name: 'lobby' });
      return;
    }
    nav.openModal({ name: 'message', title: '방을 만들 수 없습니다', body: result.message, tone: 'danger' });
  };

  return (
    <Modal
      title="방 만들기"
      subtitle="매치 전용 칩으로 친구와 한 경기를 즐깁니다. 칩이 0이어도 복구되며, 정해진 핸드가 끝나면 순위가 결정됩니다."
      icon="plus"
      width={1040}
      onClose={nav.closeModal}
      footer={
        <>
          <span className="modal__footer-note">
            {submitted && (errors.length > 0 || passwordMissing) ? '입력 내용을 확인해 주세요.' : ''}
          </span>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={() => void submit()}>
            {busy ? '만드는 중…' : '방 만들기'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-col">
          <Field
            label="방 제목"
            aside={`${config.title.trim().length} / ${ROOM_LIMITS.titleMax}`}
            error={errorFor('title')}
          >
            <TextInput
              value={config.title}
              onChange={(v) => set('title', v)}
              maxLength={ROOM_LIMITS.titleMax}
              autoFocus
              invalid={Boolean(errorFor('title'))}
              onEnter={() => void submit()}
            />
          </Field>

          <Field label="게임 모드" hint={mode.description}>
            <div className="mode-picker">
              {GAME_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={m.id === config.mode ? 'mode-picker__item is-active' : 'mode-picker__item'}
                  onClick={() => set('mode', m.id)}
                >
                  <span className={m.augmented ? 'badge badge--augment' : 'badge'}>{m.augmented ? '증강' : '일반'}</span>
                  <span className="mode-picker__name">{m.variant === 'holdem' ? '텍사스 홀덤' : '7포커'}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="최대 인원" error={errorFor('maxPlayers')}>
            <Segmented
              options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: `${n}명` }))}
              value={config.maxPlayers}
              onChange={(v) => set('maxPlayers', v)}
            />
          </Field>

          <Field
            label="공개 설정"
            hint={
              config.visibility === 'public'
                ? '방 찾기 목록에 표시됩니다.'
                : '목록에 표시되지 않으며, 방 코드를 받은 사람만 참가할 수 있습니다.'
            }
          >
            <Segmented<RoomVisibility>
              options={[
                { value: 'public', label: '공개 방' },
                { value: 'private', label: '비공개 방' },
              ]}
              value={config.visibility}
              onChange={(v) => set('visibility', v)}
            />
          </Field>

          <Field
            label="비밀번호"
            aside={<Toggle checked={usePassword} onChange={setUsePassword} label={usePassword ? '사용' : '사용 안 함'} />}
            error={submitted && passwordMissing ? '비밀번호를 입력해 주세요.' : errorFor('password')}
            hint={`${ROOM_LIMITS.passwordMin}~${ROOM_LIMITS.passwordMax}자, 공백 없이`}
          >
            <TextInput
              type="password"
              value={usePassword ? config.password : ''}
              onChange={(v) => set('password', v)}
              placeholder={usePassword ? '비밀번호 입력' : '비밀번호 없음'}
              maxLength={ROOM_LIMITS.passwordMax}
              invalid={submitted && (passwordMissing || Boolean(errorFor('password')))}
              className={usePassword ? undefined : 'is-disabled'}
            />
          </Field>
        </div>

        <div className="form-col">
          <Field
            label="경기 길이"
            hint="모두 진행하면 순이익으로 순위를 매깁니다."
            error={errorFor('matchHands')}
          >
            <Segmented
              options={ROOM_OPTIONS.matchHands.map((n) => ({ value: n, label: `${n}핸드` }))}
              value={config.matchHands}
              onChange={(v) => set('matchHands', v)}
            />
          </Field>

          <Field
            label="시작 칩"
            hint="전원 동일. 칩이 0이 되면 다음 핸드에 같은 금액이 복구됩니다(점수 보너스 아님)."
            error={errorFor('startingChips')}
          >
            <Segmented
              options={ROOM_OPTIONS.startingChips.map((n) => ({ value: n, label: fmt(n) }))}
              value={config.startingChips}
              onChange={(v) => set('startingChips', v)}
            />
          </Field>

          {mode.variant === 'holdem' ? (
            <Field label="시작 블라인드" hint="경기가 진행될수록 블라인드가 늘어납니다." error={errorFor('bigBlind')}>
              <Segmented
                options={ROOM_OPTIONS.blinds.map(([sb, bb]) => ({ value: bb, label: `${fmt(sb)} / ${fmt(bb)}` }))}
                value={config.bigBlind}
                onChange={(bb) => setConfig((c) => ({ ...c, bigBlind: bb, smallBlind: bb / 2 }))}
              />
            </Field>
          ) : (
            <Field label="앤티" error={errorFor('ante')}>
              <Segmented
                options={ROOM_OPTIONS.antes.map((n) => ({ value: n, label: fmt(n) }))}
                value={config.ante}
                onChange={(v) => set('ante', v)}
              />
            </Field>
          )}

          <Field
            label="최대 베팅"
            hint={
              maxBet === null
                ? '보유 칩까지 자유롭게 베팅합니다(노리밋).'
                : `한 번에 ${fmt(maxBet)}까지. 부족하면 올인.`
            }
            error={errorFor('maxBetMultiple')}
          >
            <Segmented
              options={ROOM_OPTIONS.maxBetMultiples.map((n) => ({ value: n, label: maxBetLabel(n) }))}
              value={config.maxBetMultiple}
              onChange={(v) => set('maxBetMultiple', v)}
            />
          </Field>

          <Field label="행동 제한시간" error={errorFor('actionSeconds')}>
            <Segmented
              options={ROOM_OPTIONS.actionSeconds.map((n) => ({ value: n, label: `${n}초` }))}
              value={config.actionSeconds}
              onChange={(v) => set('actionSeconds', v)}
            />
          </Field>

          {mode.augmented && (
            <Field label="증강 선택시간" error={errorFor('augmentPickSeconds')}>
              <Segmented
                options={ROOM_OPTIONS.augmentPickSeconds.map((n) => ({ value: n, label: `${n}초` }))}
                value={config.augmentPickSeconds}
                onChange={(v) => set('augmentPickSeconds', v)}
              />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
