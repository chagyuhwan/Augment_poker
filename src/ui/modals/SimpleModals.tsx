import { useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { getGameMode } from '../../core/gameModes';
import { ROOM_LIMITS } from '../../core/roomConfig';
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '../../core/roomCode';
import type { Result, RoomListing, RoomSnapshot } from '../../net/types';
import { bridge } from '../../platform/desktopBridge';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Controls';
import { Modal } from '../components/Modal';

function useJoinHandler() {
  const nav = useNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<Result<RoomSnapshot>>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      nav.closeModal();
      // 대기실 화면은 2단계에서 연결
    } else setError(result.message);
  };
  return { busy, error, setError, run };
}

export function JoinCodeModal() {
  const nav = useNavigation();
  const { rooms } = useServices();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useJoinHandler();
  const normalized = normalizeRoomCode(code);

  const submit = () => {
    if (!isValidRoomCode(normalized)) {
      setError(`방 코드는 영문과 숫자 ${ROOM_CODE_LENGTH}자리입니다.`);
      return;
    }
    void run(() => rooms.joinByCode(normalized, password || undefined));
  };

  return (
    <Modal
      title="방 코드로 입장"
      subtitle="방장에게 받은 코드를 입력하세요."
      icon="key"
      width={560}
      onClose={nav.closeModal}
      footer={
        <>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          <Button variant="primary" disabled={busy || normalized.length === 0} onClick={submit}>
            {busy ? '입장 중…' : '입장'}
          </Button>
        </>
      }
    >
      <Field label="방 코드" error={error}>
        <TextInput
          value={normalized}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          placeholder="예: K7P2QX"
          maxLength={ROOM_CODE_LENGTH + 2}
          autoFocus
          className="input--code"
          invalid={Boolean(error)}
          onEnter={submit}
        />
      </Field>
      <Field label="비밀번호" hint="비밀번호가 있는 방이면 입력하세요.">
        <TextInput
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="선택 입력"
          maxLength={ROOM_LIMITS.passwordMax}
          onEnter={submit}
        />
      </Field>
    </Modal>
  );
}

export function RoomPasswordModal({ room }: { room: RoomListing }) {
  const nav = useNavigation();
  const { rooms } = useServices();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useJoinHandler();
  const submit = () => {
    if (password === '') return;
    void run(() => rooms.joinRoom(room.id, password));
  };

  return (
    <Modal
      title="비밀번호 입력"
      subtitle={`${room.title} · ${getGameMode(room.mode).shortName}`}
      icon="lock"
      width={520}
      onClose={nav.closeModal}
      footer={
        <>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          <Button variant="primary" disabled={busy || password === ''} onClick={submit}>
            {busy ? '입장 중…' : '입장'}
          </Button>
        </>
      }
    >
      <Field label="비밀번호" error={error}>
        <TextInput
          type="password"
          value={password}
          onChange={setPassword}
          maxLength={ROOM_LIMITS.passwordMax}
          autoFocus
          invalid={Boolean(error)}
          onEnter={submit}
        />
      </Field>
    </Modal>
  );
}

export function InviteGuideModal() {
  const nav = useNavigation();
  const go = (next: () => void) => {
    nav.closeModal();
    next();
  };
  return (
    <Modal
      title="먼저 방에 들어가 주세요"
      subtitle="친구 초대는 방에 들어가 있을 때 Steam 친구 목록에서 보낼 수 있습니다."
      icon="invite"
      width={600}
      onClose={nav.closeModal}
      footer={
        <>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            닫기
          </Button>
          <Button icon="search" onClick={() => go(() => nav.push({ name: 'rooms', mode: 'all' }))}>
            방 찾기
          </Button>
          <Button variant="primary" icon="plus" onClick={() => go(() => nav.openModal({ name: 'create-room' }))}>
            방 만들기
          </Button>
        </>
      }
    />
  );
}

export function ConfirmExitModal() {
  const nav = useNavigation();
  return (
    <Modal
      title="게임을 종료할까요?"
      subtitle="설정은 이미 자동으로 저장되어 있습니다."
      icon="power"
      width={520}
      tone="danger"
      onClose={nav.closeModal}
      footer={
        <>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            취소
          </Button>
          <Button variant="danger" icon="power" onClick={() => void bridge.quit()}>
            게임 종료
          </Button>
        </>
      }
    />
  );
}

export function MessageModal({ title, body, tone }: { title: string; body: string; tone?: 'default' | 'danger' }) {
  const nav = useNavigation();
  return (
    <Modal
      title={title}
      icon={tone === 'danger' ? 'info' : 'check'}
      width={560}
      tone={tone}
      onClose={nav.closeModal}
      footer={
        <Button variant="primary" onClick={nav.closeModal} sound="close">
          확인
        </Button>
      }
    >
      <p className="modal__text">{body}</p>
    </Modal>
  );
}
