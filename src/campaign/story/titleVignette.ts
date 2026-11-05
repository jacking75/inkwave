// 타이틀 비네트의 색 회복 곡선(35번 R025). 작업장 세트가 먹빛(채도 0.18)에서 시작해 플레이어 자리부터 색이 퍼지고,
// 다 돌아온 뒤 잠깐 머물렀다가 다시 바래는 10초 루프이다. 순수 계산이며 쇼케이스가 Renderer.setOverlayColorReturn에 넣는다.
import type { ColorReturnState } from '../../style/stylePass.js';

export const TITLE_LOOP = { period: 10, lostSat: 0.18, spreadFrom: 1.5, spreadTo: 6.5, fadeFrom: 8.6, radius: 26 } as const;

// t: 비네트 경과 s, at: 퍼지기 시작하는 자리(플레이어 발밑)
export function titleColorReturn(t: number, at: { x: number; y: number; z: number }): ColorReturnState {
  const L = TITLE_LOOP, u = ((t % L.period) + L.period) % L.period;
  const grow = Math.min(1, Math.max(0, (u - L.spreadFrom) / (L.spreadTo - L.spreadFrom)));
  // 루프 끝 1.4초 동안 다시 바랜다(구체를 줄이고 바탕 채도는 그대로 잃은 색)
  const fade = u > L.fadeFrom ? 1 - (u - L.fadeFrom) / (L.period - L.fadeFrom) : 1;
  const k = grow * fade, e = k * k * (3 - 2 * k);
  return { worldSat: L.lostSat, spheres: e > 0.001 ? [{ x: at.x, y: at.y + 1, z: at.z, r: Math.max(0.01, e * L.radius), t: 1 }] : [] };
}
