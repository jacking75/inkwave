// 물결(Wave) 게이지(35번 R019). 공격적으로 이어 가는 플레이에 속도로 보상한다. 순수 상태이다.
// 명중·처치·목표·퍼펙트 잠수로 0~300점을 쌓고 100·200·300에서 1~3단계이다. 피해를 받으면 한 단계 내려가 그 단계의
// 시작값으로 돌아가고, 사망하면 0이다. 마지막 획득 후 decayAfter초가 지나면 초당 decayPerS점씩 준다.
// 체크포인트 복원 시 저장값의 50%이다(restore).
export const WAVE = {
  thresholds: [100, 200, 300], gain: { hit: 4, kill: 25, elite: 60, objective: 40, perfect: 30 }, decayAfter: 4, decayPerS: 6,
} as const;
export type WaveLevel = 0 | 1 | 2 | 3;
export type WaveGain = keyof typeof WAVE.gain;
export interface WaveState { points: number; level: WaveLevel; sinceGain: number }

// 단계 효과: 이동·잠수 속도 보너스, 스페셜 충전 배율, 잉크 소모 배율, 머리카락 발광
export interface WaveEffects { move: number; specialMul: number; inkMul: number; glow: boolean }
const EFFECTS: readonly WaveEffects[] = [
  { move: 0, specialMul: 1, inkMul: 1, glow: false },
  { move: 0.04, specialMul: 1, inkMul: 1, glow: false },
  { move: 0.08, specialMul: 1.15, inkMul: 1, glow: false },
  { move: 0.12, specialMul: 1.15, inkMul: 0.9, glow: true },
];
export function waveEffects(level: WaveLevel): WaveEffects { return EFFECTS[level]; }

const MAX = WAVE.thresholds[WAVE.thresholds.length - 1];
export function levelOf(points: number): WaveLevel {
  let l = 0;
  for (const t of WAVE.thresholds) if (points >= t) l++;
  return l as WaveLevel;
}
// 단계 L의 시작 점수(0단계는 0)
export function levelStart(level: WaveLevel): number { return level === 0 ? 0 : WAVE.thresholds[level - 1]; }

export class WaveGauge implements WaveState {
  declare points: number; declare level: WaveLevel; declare sinceGain: number;
  constructor() { this.points = 0; this.level = 0; this.sinceGain = 0; }

  // 반환: 단계가 바뀌었으면 이전 단계, 아니면 null
  gain(kind: WaveGain): WaveLevel | null { this.sinceGain = 0; return this._set(this.points + WAVE.gain[kind]); }
  // 피해: 한 단계 아래의 시작값으로 돌아간다(0단계에서는 0)
  hurt(): WaveLevel | null { return this._set(this.level > 0 ? levelStart((this.level - 1) as WaveLevel) : 0); }
  death(): WaveLevel | null { this.sinceGain = 0; return this._set(0); }
  update(dt: number): WaveLevel | null {
    this.sinceGain += dt;
    if (this.sinceGain <= WAVE.decayAfter || this.points <= 0) return null;
    const over = Math.min(dt, this.sinceGain - WAVE.decayAfter);
    return this._set(this.points - WAVE.decayPerS * over);
  }
  snapshot(): number { return this.points; }
  restore(saved: number): void { this.sinceGain = 0; this._set(Math.max(0, saved) * 0.5); }
  reset(): void { this.points = 0; this.level = 0; this.sinceGain = 0; }

  _set(points: number): WaveLevel | null {
    this.points = Math.max(0, Math.min(MAX, points));
    const prev = this.level;
    this.level = levelOf(this.points);
    return this.level !== prev ? prev : null;
  }
}
