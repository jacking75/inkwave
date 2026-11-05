// 시간 배율·히트스톱(35번 6.1절 TimeScale). 캠페인 세션만 가지며 main의 _loop가 매 프레임 step(rawDt)로 dt를 얻는다.
// 순수 상태이다(DOM·오디오·네트워크 의존 없음). 오디오 컨텍스트 시간은 건드리지 않는다(캠페인은 오프라인).
//
// 히트스톱은 배율 0이 아니라 0.05이다: 시뮬레이션이 아주 느리게라도 진행해야 입력 에지가 유실되지 않는다.
// 히트스톱이 진행 중이면 느린 시간(slow)은 기다렸다가 히트스톱이 끝난 뒤 흐른다(퍼펙트 잠수: 멈춤 → 느림).
export const HITSTOP_GAP = 0.4;        // s: 이 안의 히트스톱 요청은 새로 시작하지 않고 더 긴 쪽만 남긴다
export const HITSTOP_SCALE = 0.05;

export interface TimeStep { dt: number; rawDt: number; scale: number }

export class TimeScale {
  declare scale: number;
  declare clock: number;          // 실시간 누적(rawDt 합)
  declare stopLeft: number; declare stopScale: number; declare lastStopAt: number;
  declare slowLeft: number; declare slowScale: number; declare slowEase: number;
  declare held: boolean;          // 컷신(R027): 시뮬레이션 정지(배율 0). 입력은 건너뛰기만 받으므로 에지 유실이 문제 되지 않는다

  constructor() { this.reset(); this.clock = 0; }

  // 시간 정지(아주 느리게)이다. 직전 히트스톱 시작 후 HITSTOP_GAP 안이면 남은 시간을 더 긴 쪽으로만 바꾼다.
  // 반환: 새 히트스톱이 시작됐으면 true(연출을 붙일지 호출자가 판단한다).
  hitstop(seconds: number, scale = HITSTOP_SCALE): boolean {
    if (!(seconds > 0)) return false;
    if (this.clock - this.lastStopAt < HITSTOP_GAP) {
      this.stopLeft = Math.max(this.stopLeft, seconds - (this.clock - this.lastStopAt));
      return false;
    }
    this.lastStopAt = this.clock;
    this.stopLeft = seconds; this.stopScale = scale;
    return true;
  }

  // 느린 시간이다. 진행 중인 느린 시간보다 길면 바꾼다. ease s 동안 끝에서 1로 돌아온다.
  slow(seconds: number, scale: number, ease = 0.1): void {
    if (!(seconds > 0)) return;
    if (seconds <= this.slowLeft && scale >= this.slowScale) return;
    this.slowLeft = seconds; this.slowScale = scale; this.slowEase = Math.max(0.001, Math.min(ease, seconds));
  }

  // 컷신 동안 시뮬레이션을 멈춘다(카메라·인물·UI는 rawDt로 돈다)
  hold(on: boolean): void { this.held = on; }

  step(rawDt: number): TimeStep {
    this.clock += rawDt;
    let scale = 1;
    if (this.held) scale = 0;
    else if (this.stopLeft > 0) {
      scale = this.stopScale;
      this.stopLeft = Math.max(0, this.stopLeft - rawDt);
    } else if (this.slowLeft > 0) {
      const k = Math.min(1, this.slowLeft / this.slowEase);       // 마지막 ease 구간에서 1로 복귀
      scale = 1 + (this.slowScale - 1) * k;
      this.slowLeft = Math.max(0, this.slowLeft - rawDt);
    }
    this.scale = scale;
    return { dt: rawDt * scale, rawDt, scale };
  }

  // 세션 종료·일시 정지·포커스 이탈: 즉시 배율 1이다.
  reset(): void {
    this.scale = 1; this.held = false;
    this.stopLeft = 0; this.stopScale = HITSTOP_SCALE; this.lastStopAt = -Infinity;
    this.slowLeft = 0; this.slowScale = 1; this.slowEase = 0.1;
  }
}
