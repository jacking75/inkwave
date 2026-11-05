// 장비 모듈 정의(26번 3~5절): 세 슬롯, 기본 설계 12종, 지역 서명 7종, 지역별 보조 옵션 풀. 수치는 +0 값(%)이다.
// 실행 중 획득한 카드(개별 ID·등급·강화·잠금)는 inventory.ts가 갖는다. 이 파일은 정의만 둔다.
import type { RegionId } from './types.js';

export type Slot = 'adapter' | 'tank' | 'badge';
// 효과 종류. 값은 %이며 감소 효과도 양수로 적고 의미는 종류가 정한다(mainInk 3 = 주 무기 잉크 소모 -3%).
export type StatKey =
  | 'mainInk' | 'subInk' | 'weak' | 'device' | 'stunBoss' | 'inkMax' | 'swimRefill' | 'refill' | 'specialCharge'
  | 'swimSpeed' | 'runSpeed' | 'regen' | 'objectiveGuard' | 'enemyInkCharge' | 'dmgTaken' | 'subSwimBurst' | 'paintWidth';
export interface StatLine { key: StatKey; value: number }

export interface ModuleDef {
  id: string; slot: Slot; name: string; use: string;
  base: StatLine;                 // 기본 옵션(일반·정밀) 또는 서명 효과(특제)
  extra?: StatLine;               // 서명의 두 번째 효과(SG07 불이익)
  signature?: { region: RegionId; recommended: StatLine };   // 첫 확정 카드의 보조 옵션
}

export const MODULES: Record<string, ModuleDef> = {
  AD01: { id: 'AD01', slot: 'adapter', name: '절약 노즐', base: { key: 'mainInk', value: 3 }, use: '연사·도색 뒤 탱크가 비는 시간을 늦춘다' },
  AD02: { id: 'AD02', slot: 'adapter', name: '정밀 조준판', base: { key: 'weak', value: 4 }, use: '대장의 후방·낮은 배를 노린다' },
  AD03: { id: 'AD03', slot: 'adapter', name: '차단 접점', base: { key: 'device', value: 6 }, use: '장치가 많은 임무에 적합하다' },
  AD04: { id: 'AD04', slot: 'adapter', name: '빈틈 증폭기', base: { key: 'stunBoss', value: 4 }, use: '기절한 보스에 화력을 모은다' },
  TK01: { id: 'TK01', slot: 'tank', name: '예비 저장조', base: { key: 'inkMax', value: 5 }, use: '목표까지 길을 한 번 더 이어 칠한다' },
  TK02: { id: 'TK02', slot: 'tank', name: '급속 여과기', base: { key: 'swimRefill', value: 5 }, use: '잠수 재정비를 빠르게 한다' },
  TK03: { id: 'TK03', slot: 'tank', name: '분기 밸브', base: { key: 'subInk', value: 5 }, use: '보조 무기 뒤에도 주 무기 여유를 남긴다' },
  TK04: { id: 'TK04', slot: 'tank', name: '순환 촉매', base: { key: 'specialCharge', value: 4 }, use: '적 도색병이 있는 구역에서 스페셜을 준비한다' },
  BD01: { id: 'BD01', slot: 'badge', name: '잠행 표식', base: { key: 'swimSpeed', value: 3 }, use: '우회로를 바꾸어 타며 공격 방향을 바꾼다' },
  BD02: { id: 'BD02', slot: 'badge', name: '경량 표식', base: { key: 'runSpeed', value: 3 }, use: '칠하지 않은 짧은 구간을 건넌다' },
  BD03: { id: 'BD03', slot: 'badge', name: '회복 표식', base: { key: 'regen', value: 5 }, use: '피격 뒤 엄폐에서 다음 공격을 준비한다' },
  BD04: { id: 'BD04', slot: 'badge', name: '현장 표식', base: { key: 'objectiveGuard', value: 5 }, use: '가동 원을 지키되 큰 예고는 피한다' },
  SG01: { id: 'SG01', slot: 'badge', name: '복구자의 표식', base: { key: 'objectiveGuard', value: 8 }, use: '짧은 위험을 감수하고 가동을 마칠지 판단한다', signature: { region: 'tidewater', recommended: { key: 'inkMax', value: 3 } } },
  SG02: { id: 'SG02', slot: 'adapter', name: '회수반 렌즈', base: { key: 'device', value: 8 }, use: '공간을 바꾸는 장치를 먼저 처리한다', signature: { region: 'crossmarket', recommended: { key: 'weak', value: 2 } } },
  SG03: { id: 'SG03', slot: 'adapter', name: '파쇄 결정', base: { key: 'stunBoss', value: 8 }, use: '기절 창에 스페셜과 사격을 모은다', signature: { region: 'kelpline', recommended: { key: 'mainInk', value: 2 } } },
  SG04: { id: 'SG04', slot: 'tank', name: '계류 밸브', base: { key: 'swimRefill', value: 8 }, use: '회피 뒤 짧게 잠수하고 다시 싸운다', signature: { region: 'halyard', recommended: { key: 'swimSpeed', value: 2 } } },
  SG05: { id: 'SG05', slot: 'tank', name: '풍차축', base: { key: 'enemyInkCharge', value: 8 }, use: '위협이 되는 적 잉크를 정리한다', signature: { region: 'saltpan', recommended: { key: 'inkMax', value: 3 } } },
  SG06: { id: 'SG06', slot: 'badge', name: '수문 도체', base: { key: 'subSwimBurst', value: 6 }, use: '보조 무기 뒤 공격·후퇴 위치를 바꾼다', signature: { region: 'lockgate', recommended: { key: 'subInk', value: 2 } } },
  SG07: { id: 'SG07', slot: 'adapter', name: '물결의 기억', base: { key: 'weak', value: 8 }, extra: { key: 'dmgTaken', value: 5 }, use: '잘 피하는 숙련자가 약점 공략을 밀어붙인다', signature: { region: 'terraces', recommended: { key: 'refill', value: 3 } } },
};
export const BASIC_IDS = ['AD01', 'AD02', 'AD03', 'AD04', 'TK01', 'TK02', 'TK03', 'TK04', 'BD01', 'BD02', 'BD03', 'BD04'] as const;
export const REGION_SIGNATURE: Record<RegionId, string> = {
  tidewater: 'SG01', crossmarket: 'SG02', kelpline: 'SG03', halyard: 'SG04', saltpan: 'SG05', lockgate: 'SG06', terraces: 'SG07',
};
// 정밀·특제의 보조 옵션 풀(+0 고정값). 기본 옵션과 같은 항목은 고르지 않는다.
export const REGION_POOL: Record<RegionId, StatLine[]> = {
  tidewater: [{ key: 'inkMax', value: 3 }, { key: 'regen', value: 3 }, { key: 'objectiveGuard', value: 3 }],
  crossmarket: [{ key: 'device', value: 4 }, { key: 'weak', value: 2 }, { key: 'mainInk', value: 2 }],
  kelpline: [{ key: 'stunBoss', value: 4 }, { key: 'weak', value: 2 }, { key: 'mainInk', value: 2 }],
  halyard: [{ key: 'swimRefill', value: 3 }, { key: 'swimSpeed', value: 2 }, { key: 'subInk', value: 2 }],
  saltpan: [{ key: 'specialCharge', value: 3 }, { key: 'inkMax', value: 3 }, { key: 'mainInk', value: 2 }],
  lockgate: [{ key: 'subInk', value: 2 }, { key: 'swimSpeed', value: 2 }, { key: 'objectiveGuard', value: 3 }],
  terraces: [{ key: 'weak', value: 2 }, { key: 'swimRefill', value: 3 }, { key: 'runSpeed', value: 2 }],
};
// 강화 배율(+0~+3). SG06의 지속·간격은 강화로 변하지 않는다(값 6%만 배율을 받는다)
export const UPGRADE_MUL = [1, 1.1, 1.2, 1.3] as const;
export const SG06_TIMING = { duration: 4, interval: 10 } as const;

export const STAT_LABEL: Record<StatKey, (v: number) => string> = {
  mainInk: (v) => `주 무기 잉크 소모 -${fmt(v)}%`, subInk: (v) => `보조 무기 잉크 소모 -${fmt(v)}%`,
  weak: (v) => `약점 피해 +${fmt(v)}%`, device: (v) => `장치·설치물 피해 +${fmt(v)}%`, stunBoss: (v) => `기절한 보스 피해 +${fmt(v)}%`,
  inkMax: (v) => `최대 잉크 +${fmt(v)}%`, swimRefill: (v) => `잠수 잉크 보충 +${fmt(v)}%`, refill: (v) => `잉크 보충 +${fmt(v)}%`,
  specialCharge: (v) => `유효 도색 스페셜 충전 +${fmt(v)}%`, swimSpeed: (v) => `잠수 이동 +${fmt(v)}%`, runSpeed: (v) => `달리기 +${fmt(v)}%`,
  regen: (v) => `자동 체력 재생 +${fmt(v)}%`, objectiveGuard: (v) => `목표 진행 중 받는 피해 -${fmt(v)}%`,
  enemyInkCharge: (v) => `적 잉크를 바꾼 면적 충전 +${fmt(v)}%`, dmgTaken: (v) => `받는 피해 +${fmt(v)}%`,
  subSwimBurst: (v) => `보조 무기 뒤 4초 잠수 +${fmt(v)}% (10초 간격)`,
  paintWidth: (v) => `기본 도색 폭 +${fmt(v)}%`,
};
function fmt(v: number): string { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
