// 임무 장치 규칙(33번 T025, 24번 4절): 복구 단말·안정화·기록 회수·출구·선택 상자. 순수 계산이며 입력(플레이어 위치·
// 직접 피격·같은 높이 바닥의 유효 도색률·원 안의 적·경계 적 생존·선행 출현 정리·목표 활성)을 받아 상태를 갱신한다.
//   단말: 유효 도색률 ≥ paintNeed(기본 60%) 그리고 원 안에 hold(기본 2)초. 원 밖으로 나가거나 직접 피격되면 가동 시간만
//         다시 시작한다(칠한 면적은 유지). 완료 뒤에는 적이 다시 칠해도 취소되지 않는다.
//   안정화: 도색률 충족·플레이어가 원 안·적이 원 밖일 때 누적. 멈춰도 누적이 줄지 않는다. 임무별 duration이 기본 45초를 대신한다.
//   회수: 지정 경계 적을 모두 정리한 뒤 hold초. 출구: 선행 목표가 모두 끝나야(활성) hold초. 상자: 범위 유지 hold초.
// 별도 전투 키는 없다. 다른 층(높이 차 > FLOOR_TOL)에서는 진행하지 않는다. 검사: tests/client/missionDevices.test.ts.
import type { DeviceDef } from './data/types.js';

export const DEVICE = { paintNeed: 0.6, hold: 2, stabilize: 45, floorTol: 1.0 } as const;

export type DeviceBlock = 'locked' | 'clearFirst' | 'guards' | 'paint' | 'away' | 'enemy' | null;
export interface DeviceState {
  id: string;
  hold: number;            // 현재 시도의 머문 시간(s)
  accum: number;           // 안정화 누적(s)
  complete: boolean;
  block: DeviceBlock;      // 지금 진행하지 못하는 이유(HUD 안내)
  progress: number;        // 0..1 표시용
}
export interface DeviceInput {
  player: { x: number; y: number; z: number } | null;   // 쓰러졌으면 null
  hit: boolean;             // 이번 프레임 직접 피격
  paint: number;            // 같은 높이 바닥의 유효(자기 잉크) 도색률 0..1
  enemiesInside: number;
  guardsAlive: number;
  clearFirstDone: boolean;
  active: boolean;          // 이 장치의 목표가 활성인가(선행 완료)
}

export function newDeviceState(def: DeviceDef): DeviceState {
  return { id: def.id, hold: 0, accum: 0, complete: false, block: 'locked', progress: 0 };
}

export function inside(def: DeviceDef, p: { x: number; y: number; z: number } | null): boolean {
  if (!p) return false;
  return Math.hypot(p.x - def.at[0], p.z - def.at[2]) <= def.radius && Math.abs(p.y - def.at[1]) <= DEVICE.floorTol;
}

// 한 프레임. 이번 프레임에 완료되면 true
export function stepDevice(def: DeviceDef, st: DeviceState, inp: DeviceInput, dt: number): boolean {
  if (st.complete) { st.block = null; st.progress = 1; return false; }
  const hold = def.hold ?? DEVICE.hold;
  const needPaint = def.kind === 'terminal' || def.kind === 'stabilize' ? (def.paintNeed ?? DEVICE.paintNeed) : 0;
  let block: DeviceBlock = null;
  if (!inp.active) block = 'locked';
  else if (def.clearFirst && !inp.clearFirstDone) block = 'clearFirst';
  else if (def.kind === 'record' && inp.guardsAlive > 0) block = 'guards';
  else if (inp.paint < needPaint) block = 'paint';
  else if (!inside(def, inp.player)) block = 'away';
  else if (def.kind === 'stabilize' && inp.enemiesInside > 0) block = 'enemy';
  st.block = block;
  if (def.kind === 'stabilize') {
    const dur = def.duration ?? DEVICE.stabilize;
    if (!block && !inp.hit) st.accum = Math.min(dur, st.accum + dt);   // 멈춰도 누적은 줄지 않는다
    st.progress = st.accum / dur;
    if (st.accum >= dur) { st.complete = true; st.block = null; return true; }
    return false;
  }
  if (block || inp.hit) st.hold = 0;                 // 이탈·피격: 가동 시간만 다시
  else st.hold += dt;
  st.progress = Math.min(1, st.hold / hold);
  if (st.hold >= hold) { st.complete = true; st.block = null; st.progress = 1; return true; }
  return false;
}

export const BLOCK_TEXT: Record<Exclude<DeviceBlock, null>, string> = {
  locked: '먼저 앞의 목표를 끝낸다',
  clearFirst: '주변의 잔향을 모두 정리한다',
  guards: '지정된 경계 잔향을 정리한다',
  paint: '둘레 바닥을 더 칠한다',
  away: '원 안에 머문다',
  enemy: '원 안의 잔향을 밀어낸다',
};
