import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '../../app/navigation';
import { useServices } from '../../app/services';
import { GAME_MODES, getGameMode } from '../../core/gameModes';
import { filterRooms, JOIN_BLOCK_LABEL, joinBlockReason } from '../../net/roomFilter';
import type { RoomListing, RoomModeFilter } from '../../net/types';
import { fmtMoney, useWallet } from '../../wallet/useWallet';
import { Button, IconButton } from '../components/Button';
import { Segmented, TextInput, Toggle } from '../components/Controls';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

const AUTO_REFRESH_MS = 15_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; rooms: RoomListing[]; updatedAt: Date }
  | { status: 'error'; message: string; offline: boolean };

const MODE_FILTERS: { value: RoomModeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  ...GAME_MODES.map((m) => ({ value: m.id as RoomModeFilter, label: m.shortName })),
];

function RoomRow({
  room,
  balance,
  onJoin,
}: {
  room: RoomListing;
  balance: number | null;
  onJoin: (room: RoomListing) => void;
}) {
  const mode = getGameMode(room.mode);
  const blocked = joinBlockReason(room, balance);
  return (
    <div className={blocked ? 'room-row is-blocked' : 'room-row'}>
      <div className="room-row__title">
        {room.hasPassword && <Icon name="lock" size={16} className="room-row__lock" />}
        <span>{room.title}</span>
      </div>
      <div>
        <span className={mode.augmented ? 'badge badge--augment' : 'badge'}>{mode.shortName}</span>
        <span className="room-row__buyin">최소 {fmtMoney(room.minBuyIn)}</span>
      </div>
      <div className="room-row__players">
        <span className="pips">
          {Array.from({ length: room.maxPlayers }, (_, i) => (
            <i key={i} className={i < room.currentPlayers ? 'pip is-filled' : 'pip'} />
          ))}
        </span>
        {room.currentPlayers} / {room.maxPlayers}
      </div>
      <div>
        <span className={room.state === 'playing' ? 'state-chip is-playing' : 'state-chip'}>
          {room.state === 'playing' ? '게임 중' : '대기 중'}
        </span>
      </div>
      <div className="room-row__host">{room.hostName}</div>
      <div className="room-row__action">
        <Button
          variant={blocked ? 'ghost' : 'primary'}
          size="sm"
          disabled={blocked === 'full'}
          title={blocked ? JOIN_BLOCK_LABEL[blocked] : undefined}
          onClick={() => onJoin(room)}
        >
          {blocked === 'full' ? '가득 참' : blocked === 'money' ? '충전 필요' : room.state === 'playing' ? '다음 판 참가' : '참가'}
        </Button>
      </div>
    </div>
  );
}

export function RoomBrowserScreen({ initialMode }: { initialMode: RoomModeFilter }) {
  const nav = useNavigation();
  const { rooms } = useServices();
  const [mode, setMode] = useState<RoomModeFilter>(initialMode);
  const [joinableOnly, setJoinableOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const requestId = useRef(0);
  const { account } = useWallet();
  const balance = account?.balance ?? null;

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    const result = await rooms.listRooms();
    if (id !== requestId.current) return;
    if (result.ok) setState({ status: 'ready', rooms: result.value, updatedAt: new Date() });
    else setState({ status: 'error', message: result.message, offline: result.code === 'not-connected' });
  }, [rooms]);

  useEffect(() => {
    void refresh();
    if (!rooms.available) return;
    // 사라진 방이나 인원 변화를 반영하기 위해 주기적으로 갱신
    const timer = window.setInterval(() => void refresh(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh, rooms.available]);

  const visible = useMemo(
    () => (state.status === 'ready' ? filterRooms(state.rooms, { mode, joinableOnly, search }, balance) : []),
    [state, mode, joinableOnly, search, balance],
  );

  const join = (room: RoomListing) => {
    const blocked = joinBlockReason(room, balance);
    if (blocked === 'money') {
      nav.toast(`${JOIN_BLOCK_LABEL.money}. 최소 ${fmtMoney(room.minBuyIn)}이 필요합니다.`, 'error');
      nav.push({ name: 'wallet' });
      return;
    }
    if (blocked) {
      nav.toast(JOIN_BLOCK_LABEL[blocked], 'error');
      return;
    }
    if (room.hasPassword) {
      nav.openModal({ name: 'room-password', room });
      return;
    }
    void rooms.joinRoom(room.id).then((result) => {
      if (!result.ok) {
        nav.toast(result.message, 'error');
        if (result.code === 'not-found' || result.code === 'full' || result.code === 'in-progress') void refresh();
      }
    });
  };

  return (
    <div className="screen room-browser">
      <ScreenHeader
        title="방 찾기"
        subtitle="참가할 수 있는 공개 방 목록입니다. 비공개 방은 방 코드로 입장하세요."
        actions={
          <>
            <Button icon="key" onClick={() => nav.openModal({ name: 'join-code' })}>
              방 코드로 입장
            </Button>
            <Button
              variant="primary"
              icon="plus"
              onClick={() => nav.openModal({ name: 'create-room', mode: mode === 'all' ? undefined : mode })}
            >
              방 만들기
            </Button>
          </>
        }
      />

      <div className="room-toolbar">
        <Segmented options={MODE_FILTERS} value={mode} onChange={setMode} ariaLabel="게임 모드 필터" />
        <div className="room-toolbar__right">
          <Toggle checked={joinableOnly} onChange={setJoinableOnly} label="참가 가능한 방만" />
          <TextInput
            value={search}
            onChange={setSearch}
            placeholder="방 제목 검색"
            icon="search"
            maxLength={24}
            className="room-toolbar__search"
          />
          <IconButton
            icon="refresh"
            label="새로고침"
            onClick={() => void refresh()}
            className={state.status === 'loading' ? 'is-spinning' : undefined}
          />
        </div>
      </div>

      <div className="room-table">
        <div className="room-table__head">
          <span>방 제목</span>
          <span>모드</span>
          <span>인원</span>
          <span>상태</span>
          <span>방장</span>
          <span />
        </div>

        <div className="room-table__body">
          {state.status === 'loading' && (
            <div className="empty-state">
              <div className="spinner" />
              <p className="empty-state__title">방 목록을 불러오는 중…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <Icon name={state.offline ? 'info' : 'close'} size={30} />
              </span>
              <p className="empty-state__title">
                {state.offline ? '공개 방 목록은 Steam 로비 연결 후 제공됩니다' : '방 목록을 불러오지 못했습니다'}
              </p>
              <p className="empty-state__desc">
                {state.offline
                  ? '지금은 LAN으로 플레이하세요. 방을 만들거나, 방장 IP·코드로 입장할 수 있습니다.'
                  : state.message}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button icon="key" onClick={() => nav.openModal({ name: 'join-code' })}>
                  코드로 입장
                </Button>
                <Button variant="primary" icon="plus" onClick={() => nav.openModal({ name: 'create-room' })}>
                  방 만들기
                </Button>
              </div>
            </div>
          )}

          {state.status === 'ready' && visible.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <Icon name="search" size={30} />
              </span>
              <p className="empty-state__title">
                {state.rooms.length === 0 ? '공개 LAN 목록은 없습니다' : '조건에 맞는 방이 없습니다'}
              </p>
              <p className="empty-state__desc">방을 만들거나, 친구에게 받은 IP·방 코드로 입장하세요.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button icon="key" onClick={() => nav.openModal({ name: 'join-code' })}>
                  코드로 입장
                </Button>
                <Button variant="primary" icon="plus" onClick={() => nav.openModal({ name: 'create-room' })}>
                  방 만들기
                </Button>
              </div>
            </div>
          )}

          {state.status === 'ready' && visible.map((room) => <RoomRow key={room.id} room={room} balance={balance} onJoin={join} />)}
        </div>

        {state.status === 'ready' && (
          <div className="room-table__foot">
            {visible.length}개 표시 · 마지막 갱신 {state.updatedAt.toLocaleTimeString('ko-KR')} · {AUTO_REFRESH_MS / 1000}초마다 자동 갱신
          </div>
        )}
      </div>
    </div>
  );
}
