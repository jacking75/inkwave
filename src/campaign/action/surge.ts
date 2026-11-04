// 잉크 서지(이중 입력 대시, 35번 R018)의 감지·조건·속도 곡선이다. 순수 계산이며 이동·도색·연출은 combat.ts가 한다.
// 잠수 키의 상승 에지 두 번이 DOUBLE_TAP초 안에 있으면 두 번째 에지에서 발동한다(세 번째 연타는 새 쌍의 첫 에지).
//
// 거리: 4절 표의 "0.22초 동안 5.5 m"를 계약으로 한다. 속도 곡선 v(t) = peak·(1 - (t/T)²)의 이동 거리는 peak·T·2/3이므로
// peak = 5.5 / (0.22 · 2/3) = 37.5 m/s이다(R018 본문의 25 m/s는 이 곡선에서 3.7 m라 표와 맞지 않아 표를 따른다).
export const SURGE = {
  doubleTap: 0.28,      // s
  duration: 0.22, distance: 5.5,
  invuln: 0.16, ink: 12, cooldown: 0.9,
  trailEvery: 0.05, trailRadius: 0.3, trailSpecialK: 0.5,
  wallStop: 0.5,        // 프레임 실제 수평 이동이 기대의 이 비율 아래면 벽에 막힌 것으로 보고 끝낸다(벽타기로 이어짐)
} as const;
export const SURGE_PEAK = SURGE.distance / (SURGE.duration * (2 / 3));

// 경과 t(s)의 속도 m/s(감속 곡선 1 - u²)
export function surgeSpeed(t: number): number {
  const u = t / SURGE.duration;
  return u >= 1 ? 0 : SURGE_PEAK * (1 - u * u);
}

// 이중 입력 감지기: press(now)가 true면 서지 발동 시도이다.
export class DoubleTap {
  declare last: number;
  constructor() { this.last = -Infinity; }
  press(now: number, gap: number = SURGE.doubleTap): boolean {
    if (now - this.last <= gap) { this.last = -Infinity; return true; }
    this.last = now;
    return false;
  }
  reset(): void { this.last = -Infinity; }
}

export interface SurgeGate { ink: number; cooldownLeft: number; onEnemyInk: boolean; onOwnInkOrSquid: boolean; alive: boolean; busy: boolean }
// 발동 조건: 잉크 12 이상, 재사용 대기 끝, 적 잉크가 아님, 자기 잉크 위 또는 잠수(오징어) 중, 스페셜·슈퍼 점프 중 아님
export function canSurge(g: SurgeGate): boolean {
  return g.alive && !g.busy && g.cooldownLeft <= 0 && g.ink >= SURGE.ink && !g.onEnemyInk && g.onOwnInkOrSquid;
}
