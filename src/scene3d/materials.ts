import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3단 셀 셰이딩 그라데이션 (밝음 / 중간 / 그늘) */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** 같은 색 재질은 공유한다. flat은 로우폴리 부품 표시용(툰 재질은 면 단위 음영을 따로 지원하지 않는다) */
export function toon(color: string, opts: { flat?: boolean; emissive?: string; emissiveIntensity?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: opts.emissiveIntensity ?? 1 } : {}),
  });
  cache.set(key, m);
  return m;
}

export const COLORS = {
  sand: '#f3d29a',
  sandDark: '#e2b877',
  wood: '#7a3420',
  woodDark: '#4a1d10',
  woodLight: '#94472a',
  leather: '#4a1020',
  leaf: '#5fd38a',
  leafDark: '#3aa86a',
  rock: '#8f9aa6',
  rockDark: '#6f7a86',
  gold: '#ffc93c',
  coral: '#ff6b5b',
};

export const CHIP_COLORS = ['#f4f1ea', '#ff6b5b', '#3a8fd6', '#3dbb6e', '#1f2a36', '#c79bff', '#ffc93c'];
