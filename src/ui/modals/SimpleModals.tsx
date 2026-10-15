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
      nav.push({ name: 'lobby' });
    } else setError(result.message);
  };
  return { busy, error, setError, run };
}

export function JoinCodeModal() {
  const nav = useNavigation();
  const { rooms } = useServices();
  const [code, setCode] = useState('');
  const [host, setHost] = useState('127.0.0.1');
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useJoinHandler();
  const normalized = normalizeRoomCode(code);

  const submit = () => {
    if (!isValidRoomCode(normalized)) {
      setError(`방 코드는 영문과 숫자 ${ROOM_CODE_LENGTH}자리입니다.`);
      return;
    }
    if (!host.trim()) {
      setError('호스트 IP를 입력하세요. 같은 PC면 127.0.0.1');
      return;
    }
    void run(() => rooms.joinByCode(normalized, password || undefined, host.trim()));
  };

  return (
    <Modal
      title="방 코드로 입장"
      subtitle="같은 Wi‑Fi의 방장 IP와 방 코드를 입력하세요. 같은 PC 테스트는 127.0.0.1"
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
      <Field label="호스트 IP" hint="방 찾기·대기실에 표시된 주소를 그대로 입력">
        <TextInput
          value={host}
          onChange={(v) => {
            setHost(v);
            setError(null);
          }}
          placeholder="127.0.0.1"
          autoFocus
          invalid={Boolean(error)}
          onEnter={submit}
        />
      </Field>
      <Field label="방 코드" error={error}>
        <TextInput
          value={normalized}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          placeholder="예: K7P2QX"
          maxLength={ROOM_CODE_LENGTH + 2}
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
      title="LAN으로 친구 초대"
      subtitle="방 만들기 후 대기실에서 IP와 방 코드를 복사해 친구에게 보내세요. 친구는 ‘방 코드로 입장’에서 입력합니다. (같은 Wi‑Fi · Steam P2P는 이후 예정)"
      icon="invite"
      width={600}
      onClose={nav.closeModal}
      footer={
        <>
          <Button variant="ghost" onClick={nav.closeModal} sound="close">
            닫기
          </Button>
          <Button icon="key" onClick={() => go(() => nav.openModal({ name: 'join-code' }))}>
            코드로 입장
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
