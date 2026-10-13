import * as THREE from 'three';
import { SUIT_SYMBOL, rankLabel } from '../practice/game/cards';
import type { Card } from '../practice/game/types';
import { OUTLINE } from './layout';

const W = 256;
const H = 356;
const cache = new Map<string, THREE.CanvasTexture>();

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function make(key: string, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  cache.set(key, tex);
  return tex;
}

const FONT = "'Black Han Sans', 'Jua', sans-serif";

export function cardFaceTexture(card: Card): THREE.CanvasTexture {
  return make(`f-${card.rank}${card.suit}`, (ctx) => {
    const red = card.suit === 'h' || card.suit === 'd';
    const ink = red ? '#e0413a' : '#1a2733';
    const rank = rankLabel(card.rank);
    const suit = SUIT_SYMBOL[card.suit];

    roundRect(ctx, 6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // 안쪽 따뜻한 그라데이션
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(240,215,170,0.35)');
    roundRect(ctx, 14, 14, W - 28, H - 28, 22);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${rank === '10' ? 64 : 76}px ${FONT}`;
    ctx.fillText(rank, 58, 66);
    ctx.font = `56px ${FONT}`;
    ctx.fillText(suit, 58, 128);

    // 큰 가운데 무늬 (외곽선 + 하이라이트)
    ctx.font = `170px ${FONT}`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(suit, W / 2 + 14, H / 2 + 34);
    ctx.fillText(suit, W / 2 + 14, H / 2 + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `60px ${FONT}`;
    ctx.fillText('•', W / 2 - 14, H / 2 - 10);

    ctx.save();
    ctx.translate(W - 50, H - 58);
    ctx.rotate(Math.PI);
    ctx.fillStyle = ink;
    ctx.font = `${rank === '10' ? 46 : 54}px ${FONT}`;
    ctx.fillText(rank, 0, 0);
    ctx.restore();
  });
}

export function cardBackTexture(): THREE.CanvasTexture {
  return make('back', (ctx) => {
    roundRect(ctx, 6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#7a1f33';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#922a42';
    ctx.lineWidth = 16;
    for (let i = -H; i < W + H; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
    }
    ctx.restore();
    roundRect(ctx, 26, 26, W - 52, H - 52, 18);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f2c14e';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
    ctx.fillStyle = '#f2c14e';
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.font = `76px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', W / 2, H / 2 + 6);

    roundRect(ctx, 6, 6, W - 12, H - 12, 28);
    ctx.lineWidth = 10;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  });
}

/** 펠트 상판 무늬: 가장자리 장식 선과 가운데 로고 */
export function feltTexture(): THREE.CanvasTexture {
  const size = 1024;
  const hit = cache.get('felt');
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 60, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#2a9466');
  g.addColorStop(0.7, '#1c7650');
  g.addColorStop(1, '#125a3b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 잔잔한 섬유 노이즈
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.6)';
  ctx.lineWidth = 8;
  ctx.setLineDash([26, 18]);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 244, 220, 0.25)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 244, 220, 0.16)';
  ctx.font = `120px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♠ ♥ ♣ ♦', size / 2, size / 2 + 250);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set('felt', tex);
  return tex;
}

function tiled(key: string, size: number, repeat: [number, number], draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** 카지노 카펫: 와인색 바탕에 금색 마름모 */
export function carpetTexture(): THREE.CanvasTexture {
  return tiled('carpet', 256, [14, 14], (ctx, s) => {
    ctx.fillStyle = '#4a1222';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.strokeStyle = 'rgba(242, 193, 78, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(s / 2, 14);
    ctx.lineTo(s - 14, s / 2);
    ctx.lineTo(s / 2, s - 14);
    ctx.lineTo(14, s / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#7a1f33';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(242, 193, 78, 0.7)';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 9, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [
      [0, 0],
      [s, 0],
      [0, s],
      [s, s],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** 벨벳 벽지: 와인색 세로 줄무늬와 다마스크 무늬 */
export function wallTexture(): THREE.CanvasTexture {
  return tiled('wall', 256, [16, 2], (ctx, s) => {
    ctx.fillStyle = '#5a1526';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = x % 32 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.025)';
      ctx.fillRect(x, 0, 8, s);
    }
    ctx.strokeStyle = 'rgba(242, 193, 78, 0.28)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const c = s / 2;
    ctx.beginPath();
    ctx.moveTo(c, 40);
    ctx.bezierCurveTo(c + 40, 90, c + 40, 120, c, 150);
    ctx.bezierCurveTo(c - 40, 120, c - 40, 90, c, 40);
    ctx.moveTo(c, 150);
    ctx.bezierCurveTo(c + 50, 140, c + 70, 170, c + 66, 205);
    ctx.moveTo(c, 150);
    ctx.bezierCurveTo(c - 50, 140, c - 70, 170, c - 66, 205);
    ctx.moveTo(c, 150);
    ctx.lineTo(c, 220);
    ctx.stroke();
  });
}

/** 폰트가 늦게 로드되면 캔버스 텍스처를 다시 그리도록 캐시를 비운다 */
export function resetTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
