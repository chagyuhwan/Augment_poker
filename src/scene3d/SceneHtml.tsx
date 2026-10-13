import { Html } from '@react-three/drei';
import type { ComponentProps } from 'react';
import { useScene } from './sceneContext';

/** 3D 위치를 따라가는 DOM 라벨. React가 관리하지 않는 전용 레이어에 붙여 화면을 떠날 때 DOM 정리 충돌을 막는다 */
export function SceneHtml(props: ComponentProps<typeof Html>) {
  const { htmlLayer } = useScene();
  return <Html {...props} portal={htmlLayer} />;
}
