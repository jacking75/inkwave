// 색 회복 상태(35번 R005). "색을 잃은 항구"를 화면으로 보여 주고 복구 행동을 보상한다.
// 순수 상태이다(DOM·렌더러·저장 API에 의존하지 않는다). 렌더러는 state()만 받아 StylePass에 넣고, 캠페인 세션이
// 임무 진입(enter)·복구(restore)·체크포인트(snapshot/restoreSnapshot)·저장(districtSat)을 호출한다.
// 대전·연습·보스 모드는 이 객체를 만들지 않는다(렌더러의 색 회복은 null = 전부 채색).
import type { ColorReturnSphere, ColorReturnState } from '../style/stylePass.js';

// 구역 채도: 장 시작 0.18 → 첫 임무 완료 0.45 → 둘째 0.7 → 셋째 1.0(2~7장도 같은 패턴)
export const DISTRICT_STEPS = [0.18, 0.45, 0.7, 1.0] as const;
export const RESTORE_RADIUS = { relay: 14, district: 120 } as const;

export function districtSatAfter(missionsDone: number): number {
  return DISTRICT_STEPS[Math.max(0, Math.min(DISTRICT_STEPS.length - 1, Math.floor(missionsDone)))];
}

// 저장 형식 inkwave.campaign.v1의 colorReturn 필드: { [districtId]: 0..1 }
export type ColorReturnSave = Record<string, number>;

// 체크포인트 스냅샷에 넣는 값(33번 T028의 colorSpheres). 살아 있는 객체 참조 없이 직렬화 가능하다.
export interface ColorReturnSnapshot { worldSat: number; spheres: ColorReturnSphere[] }

export interface ColorReturnConfig { lostSat: number; restoreFadeS: number; maxSpheres: number }

export class ColorReturn {
  declare cfg: ColorReturnConfig;
  declare worldSat: number;
  declare spheres: ColorReturnSphere[];

  constructor(cfg: ColorReturnConfig) {
    this.cfg = cfg;
    this.worldSat = cfg.lostSat;
    this.spheres = [];
  }

  // 임무 진입: 저장된 구역 채도로 시작하고 이전 임무의 구체는 버린다(이미 구역 채도에 합산됐다).
  enter(districtSat: number): void {
    this.worldSat = clamp01(Math.max(this.cfg.lostSat, districtSat));
    this.spheres = [];
  }

  // 복구 순간: 반지름 r까지 restoreFadeS 동안 커지는 구체를 더한다. 가득 차면 가장 오래된 다 퍼진 구체를 뺀다.
  restore(x: number, y: number, z: number, r: number): void {
    if (this.spheres.length >= this.cfg.maxSpheres) {
      const i = this.spheres.findIndex((s) => s.t >= 1);
      this.spheres.splice(i >= 0 ? i : 0, 1);
    }
    this.spheres.push({ x, y, z, r, t: 0 });
  }

  update(dt: number): void {
    const k = this.cfg.restoreFadeS > 0 ? dt / this.cfg.restoreFadeS : 1;
    for (const s of this.spheres) if (s.t < 1) s.t = Math.min(1, s.t + k);
  }

  state(): ColorReturnState { return { worldSat: this.worldSat, spheres: this.spheres }; }

  // 체크포인트: 진행 중인 구체도 다 퍼진 상태로 기록한다(재시작 화면에 반쯤 퍼진 원이 남지 않게).
  snapshot(): ColorReturnSnapshot {
    return { worldSat: this.worldSat, spheres: this.spheres.map((s) => ({ ...s, t: 1 })) };
  }

  restoreSnapshot(s: ColorReturnSnapshot): void {
    this.worldSat = clamp01(Math.max(this.cfg.lostSat, s.worldSat));
    this.spheres = s.spheres.slice(0, this.cfg.maxSpheres).map((p) => ({ ...p }));
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
