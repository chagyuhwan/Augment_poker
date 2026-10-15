import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { audio } from '../audio/audioEngine';
import type { GameModeId } from '../core/gameModes';
import type { RoomListing, RoomModeFilter } from '../net/types';
import type { LanStartPayload } from '../lobby/lanRoomService';
import type { PracticeOptions } from '../practice/game/botTable';

export type RulesTab = 'holdem' | 'seven' | 'augment' | 'hands' | 'chips';

export type ScreenRoute =
  | { name: 'menu' }
  | { name: 'rooms'; mode: RoomModeFilter }
  | { name: 'rules'; tab: RulesTab }
  | { name: 'augment-codex' }
  | { name: 'settings' }
  | { name: 'wallet' }
  | { name: 'practice'; options: PracticeOptions }
  | { name: 'lobby' }
  | { name: 'lan-table'; start: LanStartPayload; tableId: string };

export type ModalRoute =
  | { name: 'create-room'; mode?: GameModeId }
  | { name: 'join-code' }
  | { name: 'room-password'; room: RoomListing }
  | { name: 'invite-guide' }
  | { name: 'practice-setup' }
  | { name: 'confirm-exit' }
  | { name: 'message'; title: string; body: string; tone?: 'default' | 'danger' };

export interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error' | 'success';
}

interface NavigationValue {
  screen: ScreenRoute;
  screenKey: number;
  depth: number;
  modals: ModalRoute[];
  toasts: Toast[];
  push(route: ScreenRoute): void;
  pop(): void;
  resetToMenu(): void;
  openModal(route: ModalRoute): void;
  closeModal(): void;
  /** ESC: 모달 닫기 → 이전 화면 → 메인 메뉴에서는 종료 확인 */
  back(): void;
  toast(message: string, tone?: Toast['tone']): void;
}

const NavigationContext = createContext<NavigationValue | null>(null);

interface StackEntry {
  key: number;
  route: ScreenRoute;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const nextKey = useRef(1);
  const [stack, setStack] = useState<StackEntry[]>([{ key: 0, route: { name: 'menu' } }]);
  const [modals, setModals] = useState<ModalRoute[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((route: ScreenRoute) => {
    setStack((s) => [...s, { key: nextKey.current++, route }]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const resetToMenu = useCallback(() => {
    setModals([]);
    setStack((s) => s.slice(0, 1));
  }, []);

  const openModal = useCallback((route: ModalRoute) => {
    audio.play(route.name === 'message' && route.tone === 'danger' ? 'error' : 'open');
    setModals((m) => [...m, route]);
  }, []);

  const closeModal = useCallback(() => {
    audio.play('close');
    setModals((m) => m.slice(0, -1));
  }, []);

  const lastToast = useRef<{ message: string; at: number }>({ message: '', at: 0 });
  const toast = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const now = Date.now();
    // 2초 안 같은 문구 반복 차단 (StrictMode·이펙트 재실행)
    if (lastToast.current.message === message && now - lastToast.current.at < 2000) return;
    lastToast.current = { message, at: now };
    const id = nextKey.current++;
    if (tone === 'error') audio.play('error');
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const stateRef = useRef({ stack, modals });
  stateRef.current = { stack, modals };

  const back = useCallback(() => {
    const { stack: s, modals: m } = stateRef.current;
    if (m.length > 0) closeModal();
    else if (s.length > 1) {
      audio.play('close');
      pop();
    } else openModal({ name: 'confirm-exit' });
  }, [closeModal, openModal, pop]);

  const top = stack[stack.length - 1];
  const value = useMemo<NavigationValue>(
    () => ({
      screen: top.route,
      screenKey: top.key,
      depth: stack.length,
      modals,
      toasts,
      push,
      pop,
      resetToMenu,
      openModal,
      closeModal,
      back,
      toast,
    }),
    [top, stack.length, modals, toasts, push, pop, resetToMenu, openModal, closeModal, back, toast],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside NavigationProvider');
  return value;
}
