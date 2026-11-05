// 퍼펙트 잠수(저스트 회피, 35번 R017)의 판정과 수치이다. 순수 계산이며 효과(시간·잉크·게이지·연출)는 combat.ts가 건다.
// 새 버튼은 없다: 적 공격이 닿기 직전 window초 안에 잠수 키를 "새로" 눌렀으면 그 공격을 무효화한다.
// 기준 시각: 예고(텔레그래프, R022)가 있는 공격은 예고 종료 시각 ref 기준 [ref - window, ref + after]이고(after 0.04),
// 예고 없는 공격(봇의 즉발 사격)은 피해가 도착한 시각 기준 [now - window, now]이다.

export const PERFECT = {
  window: 0.14, windowStory: 0.18,     // s: 입력 창(일반·이야기 난이도)
  sameAttackerCd: 1.0,                 // s: 같은 공격자에게 재발동 금지
  hitstop: 0.10, hitstopScale: 0.05, slow: 0.35, slowScale: 0.45,
  ink: 15, special: 12,
  expose: 1.5, exposeMul: 1.25,        // 공격자 노출 s, 노출 중 받는 피해 배율
  buffT: 2.0, buffSwim: 0.15, buffRun: 0.08,
  fovKick: -4,
  burstFlight: 0.35,                   // s: 연사 끝 뒤에도 날아오는 탄환을 같은 공격으로 본다
} as const;

// 연사(사격·도색병의 attack 상태)는 한 공격이다: 첫 탄을 퍼펙트로 피했으면 남은 연사 시간 + 탄 비행 여유 동안 그 공격자의
// 피해를 무효로 한다(보상은 다시 주지 않는다). 같은 공격자 재발동 금지 시간을 넘지 않는다. 연사 중이 아니면 0이다.
export function burstGrace(attacking: boolean, burstLeft: number): number {
  return attacking ? Math.min(PERFECT.sameAttackerCd, Math.max(0, burstLeft) + PERFECT.burstFlight) : 0;
}

// 환경 피해(물·낙하·적 잉크 도트)는 대상이 아니다.
const ENVIRONMENT = new Set(['ink', 'water', 'fall']);

export interface PerfectCheck {
  now: number;
  squidPressedAt: number;     // 마지막 잠수 키 상승 에지 시각(없으면 -1 이하)
  window: number;
  source: string;
  hasAttacker: boolean;
  onEnemyInk: boolean;        // 서 있는 바닥이 적 잉크
  alive: boolean;
  specialActive: boolean;     // 스페셜 변신 중
  lastPerfectVsAttacker: number;   // 같은 공격자에게 마지막으로 발동한 시각(없으면 -Infinity)
  refTime?: number;           // 예고 종료 시각(텔레그래프 공격). 없으면 now
  after?: number;             // ref 뒤로 허용하는 s(텔레그래프 0.04)
}

export function isPerfectDive(c: PerfectCheck): boolean {
  if (!c.alive || c.specialActive || !c.hasAttacker || ENVIRONMENT.has(c.source)) return false;
  if (c.onEnemyInk) return false;
  if (c.now - c.lastPerfectVsAttacker < PERFECT.sameAttackerCd) return false;
  if (c.squidPressedAt < 0 || c.squidPressedAt > c.now) return false;
  const since = (c.refTime ?? c.now) - c.squidPressedAt;
  return since >= -(c.after ?? 0) && since <= c.window;
}
