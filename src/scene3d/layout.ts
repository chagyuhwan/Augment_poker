import type { GraphicsQuality } from '../settings/settings';

/** 테이블 좌표계: 원점이 테이블 중앙, 상판 높이 TABLE_Y. 카메라는 +z 쪽(본인 자리 뒤)에서 바라본다. */
export const TABLE_Y = 1.0;
export const TABLE_RADIUS = 2.15;
export const FELT_RADIUS = 1.85;

/** 화면 기준 시계 방향 좌석 각도(도). 0번이 본인(카메라 쪽) */
const SEAT_ANGLES = [90, 150, 210, 270, 330, 30];

export type Vec3 = [number, number, number];

export function seatAngle(viewIndex: number): number {
  return (SEAT_ANGLES[viewIndex % 6] * Math.PI) / 180;
}

/** 본인 좌석이 항상 0번 위치(앞쪽)에 오도록 좌석 번호를 화면 위치로 바꾼다 */
export function viewIndexOf(seat: number, heroSeat: number, maxSeats: number): number {
  return (seat - heroSeat + maxSeats) % maxSeats;
}

export function polar(angle: number, r: number, y: number): Vec3 {
  return [Math.cos(angle) * r, y, Math.sin(angle) * r];
}

/** 좌석이 테이블 중앙을 바라보는 y축 회전 */
export function faceCenter(angle: number): number {
  return -angle - Math.PI / 2;
}

/** 게임 테이블 기본 카메라 */
export const CAM_POS: Vec3 = [0, 6.4, 7.0];
export const CAM_LOOK: Vec3 = [0, 0.85, -0.5];

export const SEAT = {
  avatar: 2.75,
  stack: 1.62,
  cards: 1.52,
  bet: 1.22,
  heroCards: 1.42,
  /** 손에 든 패(캐릭터 바로 앞) */
  held: 2.36,
  heroHeld: 2.12,
  /** 본인 베팅은 카드 앞(중앙 쪽)에 둔다 */
  heroBet: 0.55,
};

export const DECK_POS: Vec3 = [0.66, TABLE_Y + 0.02, -1.05];
export const POT_POS: Vec3 = [0, TABLE_Y, -0.58];
/** 폴드한 패를 모아 두는 자리(덱 바로 앞) */
export const MUCK_POS: Vec3 = [0.66, TABLE_Y + 0.01, -0.5];
export const COMMUNITY_Z = 0.05;
export const CARD_W = 0.36;
export const CARD_H = 0.5;

export function communityPos(i: number): Vec3 {
  return [(i - 2) * (CARD_W + 0.07), TABLE_Y + 0.006, COMMUNITY_Z];
}

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMap: number;
  post: boolean;
  oceanSegments: number;
  antialias: boolean;
}

export const QUALITY: Record<GraphicsQuality, QualityProfile> = {
  low: { dpr: [0.75, 1], shadows: false, shadowMap: 512, post: false, oceanSegments: 48, antialias: false },
  medium: { dpr: [1, 1.5], shadows: true, shadowMap: 1024, post: false, oceanSegments: 96, antialias: true },
  high: { dpr: [1, 2], shadows: true, shadowMap: 2048, post: true, oceanSegments: 140, antialias: false },
};

/** 캐릭터 색 조합. 플레이어 id로 고른다 */
export const AVATAR_STYLES = [
  { skin: '#f2c49b', shirt: '#ff6b5b', pants: '#2d4a6b', hat: 'cap', hatColor: '#ffc93c' },
  { skin: '#d9a273', shirt: '#4cc3ee', pants: '#5a3a22', hat: 'straw', hatColor: '#f5d8a0' },
  { skin: '#8d5a3b', shirt: '#5fd38a', pants: '#24384f', hat: 'bucket', hatColor: '#2d6a8a' },
  { skin: '#f5d0b0', shirt: '#c79bff', pants: '#3b2a52', hat: 'bandana', hatColor: '#e04a3c' },
  { skin: '#e8b48a', shirt: '#ffb347', pants: '#2f3b45', hat: 'beanie', hatColor: '#3ed6b5' },
  { skin: '#b97c55', shirt: '#f2f2f2', pants: '#1f6f8b', hat: 'captain', hatColor: '#1b2a3a' },
] as const;

export type HatKind = (typeof AVATAR_STYLES)[number]['hat'];

export const OUTLINE = '#08151f';
