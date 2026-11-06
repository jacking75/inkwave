// 캠페인 정의 데이터의 형식(33번 T021, 4.1절 MissionDefinition). 읽기 전용 정의이며 실행 중 상태(세션·목표 진행·
// 저장)는 다른 모듈이 갖는다. 좌표는 지도 월드 좌표(m)이고 y는 바닥 높이 힌트이다(배치 때 아래로 쏜 광선으로 보정).

export type Vec3 = readonly [number, number, number];
// [minX, maxX, minZ, maxZ] — 구간·발동 영역(수평)
export type Rect = readonly [number, number, number, number];

export type RegionId = 'tidewater' | 'crossmarket' | 'kelpline' | 'halyard' | 'saltpan' | 'lockgate' | 'terraces';
export type EnemyRoleId = 'gunner' | 'painter' | 'shield' | 'watcher' | 'mortar' | 'rollerElite' | 'umbrellaCaptain' | 'watcherElite' | 'orgelCore' | 'mortarElite' | 'shieldElite' | 'skew' | 'sprinkler' | 'painterElite' | 'saltBoss' | 'commander';

export interface SegmentDef {
  id: string;
  bounds: Rect;                 // 이 구간의 적이 쫓아오는 최대 범위(밖으로 무제한 추적하지 않는다)
}

export interface UnitDef {
  id: string;
  role: EnemyRoleId;
  at: Vec3;
  yaw?: number;                 // 처음 보는 방향(rad, atan2(dx, dz))
  alt?: Vec3;                   // 정예: 체력 절반 이하(또는 짝 정예가 쓰러졌을 때) 한 번 옮기는 위치
  hp?: number;                  // 병종 기본 체력 대신(6-2 쌍문지기 360·300, 6-3 조율기 핵 2800)
  name?: string;                // 병종 이름 대신 보일 이름(6-3 수문 조율기)
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
  // 도착형 체크포인트: after 목표를 모두 끝낸 뒤 플레이어가 area에 들어오면 켠다(목록 순서상 뒤의 CP만, 되돌아가도 앞 CP로 바꾸지 않는다)
  area?: Rect;
  after?: string[];
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
  transmitters?: string[];      // 고정 장치 보스(2-3): 끌 때마다 핵을 여는 송신기 목표 id(순서대로 단계가 오른다)
  // 거대 보스(3-3·7-3, 기존 HULLBREAKER 재사용): 출현 묶음 밖의 개체다. unit은 처치 목표의 대상 id로만 쓴다.
  // 처치 목표가 활성이고 플레이어가 area에 들어오면 at에 세운다. hpMul은 솔로 기본 체력(18,000)에 곱한다.
  giant?: {
    at: Vec3; yaw: number; area: Rect; hpMul?: number;
    hp?: number;                // 솔로 기본 체력 대신(7-3 22,000)
    profile?: 'kelp' | 'final'; // 기술 구성: 3-3(강타·통 → +돌진 → +소형 게) / 7-3(+광선·소형 게 → +회전)
    from?: string;              // 이 목표가 활성이 되면 세운다(기본: 처치 목표)
    // 제어 고리(7-3): 보스 체력이 at(비율)에 닿으면 그 고리(장치)를 열고, 끊기 전에는 체력이 그 아래로 내려가지 않는다.
    // 고리를 끊으면 보스가 짧게 정비한다. 마지막 고리(at 0)를 끊으면 보스가 쓰러진다(안전한 종료 연출).
    rings?: Array<{ device: string; at: number }>;
  };
  relocateOn?: string[];        // 거점 보스(4-3): 이 목표가 끝날 때마다 다른 거점으로 옮긴다
  // 안전 원 보스(5-3): 살수 장치(sprinkler 유닛)를 끄면 그 자리 원(반지름 radius)이 열리고, 60% 이상 칠한 채 safe초를 누적하면
  // 보스가 heat초 과열 정비에 든다. 원마다 한 번, 보스 절반 체력에 쓴 원을 한 번 다시 연다. 장치를 모두 끄고 원도 다 쓰면
  // every초마다 정비 빈틈이 생긴다(끝없는 가동 반복 없음).
  safeZones?: { zones: Array<{ sprinkler: string; at: Vec3; radius: number }>; safe: number; heat: number; every: number };
}

// 레벨 액션 장치(35번 R023): 분수·잉크통·스위치. 선택 경로에만 둔다(장치 없이도 완주할 수 있어야 한다)
export type { DeviceDef as ActionDeviceDef } from '../action/devices.js';
import type { DeviceDef as ActionDeviceDef } from '../action/devices.js';

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
  actionDevices?: ActionDeviceDef[];
}
