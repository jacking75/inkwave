// 캠페인 정의 데이터의 형식(33번 T021, 4.1절 MissionDefinition). 읽기 전용 정의이며 실행 중 상태(세션·목표 진행·
// 저장)는 다른 모듈이 갖는다. 좌표는 지도 월드 좌표(m)이고 y는 바닥 높이 힌트이다(배치 때 아래로 쏜 광선으로 보정).

export type Vec3 = readonly [number, number, number];
// [minX, maxX, minZ, maxZ] — 구간·발동 영역(수평)
export type Rect = readonly [number, number, number, number];

export type RegionId = 'tidewater' | 'crossmarket' | 'kelpline' | 'halyard' | 'saltpan' | 'lockgate' | 'terraces';
export type EnemyRoleId = 'gunner' | 'painter' | 'shield' | 'watcher' | 'mortar' | 'rollerElite' | 'umbrellaCaptain';

export interface SegmentDef {
  id: string;
  bounds: Rect;                 // 이 구간의 적이 쫓아오는 최대 범위(밖으로 무제한 추적하지 않는다)
}

export interface UnitDef {
  id: string;
  role: EnemyRoleId;
  at: Vec3;
  yaw?: number;                 // 처음 보는 방향(rad, atan2(dx, dz))
}
export interface WaveDef {
  id: string;
  units: UnitDef[];
  gapBefore?: number;           // 앞 웨이브를 정리한 뒤 이 웨이브까지의 쉬는 시간(s)
}
// 출현 묶음: 발동 조건을 만족하면 웨이브를 순서대로 내보낸다. 일반 적은 쓰러지면 다시 나오지 않는다.
export interface EncounterDef {
  id: string;
  segment: string;
  area: Rect;                   // 플레이어가 이 영역에 들어오면 발동
  requires?: string[];          // 이 목표들이 완료(또는 활성)돼 있어야 발동
  requiresActive?: string;      // 이 목표가 활성(진행 중)일 때만 발동
  route?: string;               // 선택 경로 이름(같은 갈림길의 다른 경로는 따로 발동한다)
  maxActive: number;            // 동시 활성 상한(1장 인간형 최대 3)
  waves: WaveDef[];
  // 정예·대장의 체력 경계 지원(한 번씩만): 대장 체력 비율이 hpBelow 이하가 되면 unit을 부른다
  support?: Array<{ unit: UnitDef; hpBelow: number }>;
}

export type DeviceKind = 'terminal' | 'stabilize' | 'record' | 'exit' | 'crate';
export interface DeviceDef {
  id: string;
  kind: DeviceKind;
  at: Vec3;
  radius: number;               // 가동 원 반지름(m)
  paintRadius?: number;         // 단말: 도색률을 재는 바닥 원 반지름(m)
  paintNeed?: number;           // 단말: 필요한 유효 도색률(기본 0.6)
  hold?: number;                // 머물러야 하는 시간(s, 기본 2)
  duration?: number;            // 안정화: 누적 시간(s, 기본 45 — 임무가 30·6초 등을 정하면 그 값)
  guards?: string[];            // 회수 전에 정리해야 하는 지정 경계 적(유닛 id)
  clearFirst?: string;          // 이 출현 묶음을 모두 정리해야 가동할 수 있다(방어형 단말)
}

export type ObjectiveKind = 'restore' | 'retrieve' | 'defeat' | 'clear' | 'exit' | 'crate';
export interface ObjectiveDef {
  id: string;
  kind: ObjectiveKind;
  label: string;                // HUD에 보일 현재 목표 한 줄
  device?: string;              // restore·retrieve·exit·crate
  target?: string;              // defeat: 유닛 id
  encounter?: string;           // clear: 이 출현 묶음을 모두 정리
  requires: string[];           // 선행 목표(논리 순서). 구간을 물리적으로 건너뛰어도 이것이 없으면 완료되지 않는다
  optional?: boolean;           // 선택 목표(선택 상자)
  comm?: string;                // 완료 때 부르는 이야기 통신 키(storyDirector.comm)
  checkpoint?: string;          // 완료 때 활성화하는 체크포인트
}

export interface CheckpointDef {
  id: string;
  at: Vec3;
  yaw: number;
  // 이 체크포인트에서 재도전할 때 다시 시작하는 출현 묶음(현재 구간)
  resets: string[];
}

// 보상 정의(26·28번). 수치는 data/economy.ts가 한 곳에서 정한다.
export interface MissionReward {
  kind: 'normal' | 'boss';
  firstSet?: string[];          // 1-1: 첫 완료 때 무작위 모듈 대신 주는 기본 설계 세트
  signature?: string;           // 보스 첫 완료 확정 서명
  record?: string;              // 선택 상자의 선택 기록 id
  unlocks: string[];            // 첫 완료 때 해금하는 임무 id
}

export interface BossDef {
  id: string;
  name: string;
  unit: string;                 // 보스 유닛 id(출현 묶음 안)
}

export interface MissionDefinition {
  id: string;                   // '1-1'
  chapterId: number;
  title: string;
  mapId: string;
  region: RegionId;
  timeOfDay: 'day' | 'dusk';
  type: 'normal' | 'elite' | 'boss';
  start: { at: Vec3; yaw: number };
  segments: SegmentDef[];
  devices: DeviceDef[];
  objectives: ObjectiveDef[];
  encounters: EncounterDef[];
  checkpoints: CheckpointDef[];
  reward: MissionReward;
  boss?: BossDef;
  hints?: Record<string, string>; // 목표 id → 단계별 기본 조작 도움말(1-1)
}
