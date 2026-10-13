let webglChecked: boolean | null = null;

/** WebGL을 쓸 수 없으면 2D 테이블로 대체한다 */
export function canUseWebGL(): boolean {
  if (webglChecked !== null) return webglChecked;
  try {
    const c = document.createElement('canvas');
    webglChecked = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}
