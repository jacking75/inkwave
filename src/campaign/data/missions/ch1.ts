// 1장 타이드워터 광장 임무 1-1·1-2·1-3(33번 T038~T046, 기획 3·4·5번). 지도 tidewater의 남쪽 시청(-Z) 쪽에서 북쪽으로
// 진행한다. 좌표는 shots/map/tidewater*.png(node .tools/map-dump.js)로 확인한 실제 지형 값이며 y는 바닥 높이 힌트이다
// (광장 -0.2, 산책로 0, 원형 테라스 1.0, 탑 기단 1.1, 회랑 위 길 3.7, 시청 발코니 2.4).
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 1-1 멈춘 시계 아래: 중계기 A → CP → (정면 방패병 | 화단 우회로 + 선택 상자) → 중계기 B 방어 2웨이브 → 탑 아래 출구
export const M_1_1: MissionDefinition = {
  id: '1-1', chapterId: 1, title: '멈춘 시계 아래', mapId: 'tidewater', region: 'tidewater', timeOfDay: 'day', type: 'normal',
  start: { at: [0, 2.4, -40], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, 20, -46, -24] },
    { id: 's2', bounds: [-22, 22, -26, -6] },
    { id: 's3', bounds: [-20, 20, -8, 30] },
  ],
  devices: [
    { id: 'relayA', kind: 'terminal', at: [-12, -0.2, -31], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'crate', kind: 'crate', at: [-16.5, -0.2, -11.5], radius: 1.6, hold: 2 },
    { id: 'relayB', kind: 'terminal', at: [-6, -0.2, 14], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2, clearFirst: 'enc-b' },
    { id: 'exit', kind: 'exit', at: [0, 1.1, -4.4], radius: 1.8, hold: 0.6 },
  ],
  objectives: [
    { id: 'o-a', kind: 'restore', label: '중계기 A 복구 0/2', device: 'relayA', requires: [], comm: 'relayA', checkpoint: 'cp1' },
    { id: 'o-b', kind: 'restore', label: '중계기 B 복구 1/2', device: 'relayB', requires: ['o-a'], comm: 'relayB' },
    { id: 'o-e', kind: 'exit', label: '시계탑 아래 귀환 표식으로', device: 'exit', requires: ['o-b'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-20, 20, -37.5, -24], maxActive: 3, waves: [{ id: 'w1', units: [{ id: 'a-g1', role: 'gunner', at: [-12, -0.2, -25], yaw: S }] }] },
    { id: 'enc-front', segment: 's2', area: [-8, 8, -17, -8], route: 'front', requires: ['o-a'], maxActive: 3, waves: [{ id: 'w1', units: [{ id: 'f-sh1', role: 'shield', at: [0, -0.2, -14], yaw: S }] }] },
    { id: 'enc-side', segment: 's2', area: [-21, -8, -24, -5], route: 'side', requires: ['o-a'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 's-g1', role: 'gunner', at: [-17, -0.2, -17], yaw: S }, { id: 's-g2', role: 'gunner', at: [-13, -0.2, -6], yaw: S }] }] },
    { id: 'enc-b', segment: 's3', area: [-14, 10, 8, 24], requiresActive: 'o-b', maxActive: 3, waves: [
      { id: 'w1', units: [{ id: 'b-g1', role: 'gunner', at: [-11, -0.2, 22], yaw: S }, { id: 'b-g2', role: 'gunner', at: [7, -0.2, 21], yaw: S }] },
      { id: 'w2', gapBefore: 4, units: [{ id: 'b-g3', role: 'gunner', at: [10, -0.2, 10], yaw: W }, { id: 'b-p1', role: 'painter', at: [-14, -0.2, 9], yaw: E }] },
    ] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-8, -0.2, -35], yaw: N, resets: ['enc-front', 'enc-side', 'enc-b'] },
  ],
  reward: { kind: 'normal', firstSet: ['AD01', 'TK01', 'BD01'], record: 'rec.tidewater.1', unlocks: ['1-2'] },
  // 선택 경로 장치(35번 R023): 화단 위로 올리는 분수, 정면 방패병 뒤 잉크통 둘
  actionDevices: [
    { kind: 'fountain', id: 'f1', at: [-12, -0.2, -15.5], land: [-12, 1.0, -12.5] },
    { kind: 'barrel', id: 'b1', at: [3, -0.2, -13] },
    { kind: 'barrel', id: 'b2', at: [-3, -0.2, -13] },
  ],
  hints: {
    'o-a': '바닥을 칠하고 잠수(Shift·LT·잠수 버튼)로 빠르게 이동한다 · 중계기 둘레를 60% 칠한 뒤 원 안에 2초 머문다',
    'o-b': '옆 벽을 칠하면 잠수로 오를 수 있다 · 방패병은 옆이나 뒤로 돌아간다',
    'o-e': '탑 기단의 귀환 표식에 들어간다',
  },
};

// ---- 1-2 지워지는 발자국: 기록 1(정자 뒤) → CP → 회랑 위 기록 2 → CP → 청소반장 → 통신함
export const M_1_2: MissionDefinition = {
  id: '1-2', chapterId: 1, title: '지워지는 발자국', mapId: 'tidewater', region: 'tidewater', timeOfDay: 'day', type: 'elite',
  start: { at: [-14, -0.2, -28], yaw: E },
  segments: [
    { id: 's1', bounds: [-25, 6, -38, -2] },
    { id: 's2', bounds: [5, 26, -40, -6] },
    { id: 's3', bounds: [2, 24, -8, 26] },
  ],
  devices: [
    { id: 'rec1', kind: 'record', at: [-4.5, -0.2, -15], radius: 1.8, hold: 2, guards: ['w-p1', 'w-g1'] },
    { id: 'rec2', kind: 'record', at: [20.6, 3.7, -27], radius: 1.6, hold: 2, guards: ['h-g1', 'h-g2'] },
    { id: 'crate', kind: 'crate', at: [12.5, 0.8, -17.5], radius: 1.3, hold: 2 },
    { id: 'exit', kind: 'exit', at: [9, -0.2, 17], radius: 1.8, hold: 2 },
  ],
  objectives: [
    { id: 'o-r1', kind: 'retrieve', label: '기록 회수 0/2 — 정자 뒤 기록함', device: 'rec1', requires: [], comm: 'record1', checkpoint: 'cp1' },
    { id: 'o-r2', kind: 'retrieve', label: '기록 회수 1/2 — 회랑 위 기록함', device: 'rec2', requires: ['o-r1'], comm: 'record2', checkpoint: 'cp2' },
    { id: 'o-boss', kind: 'defeat', label: '청소반장 제압', target: 'elite', requires: ['o-r2'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'exit', label: '통신함 열기 — 2초 머무른다', device: 'exit', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-walk', segment: 's1', area: [-25, 6, -38, -6], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'w-p1', role: 'painter', at: [3, -0.2, -28], yaw: W }, { id: 'w-g1', role: 'gunner', at: [-5, 1.0, -5.5], yaw: S }] }] },
    { id: 'enc-high', segment: 's2', area: [8, 26, -36, -8], requires: ['o-r1'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'h-g1', role: 'gunner', at: [21, 3.7, -21], yaw: W }, { id: 'h-g2', role: 'gunner', at: [20.4, 3.7, -33], yaw: W }] }] },
    { id: 'enc-elite', segment: 's3', area: [4, 24, -6, 24], requires: ['o-r2'], maxActive: 3, waves: [{ id: 'w1', units: [{ id: 'elite', role: 'rollerElite', at: [12, -0.2, 14], yaw: S }] }],
      support: [{ unit: { id: 'e-p1', role: 'painter', at: [17, -0.2, 20], yaw: W }, hpBelow: 0.5 }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-6, -0.2, -19], yaw: E, resets: ['enc-high', 'enc-elite'] },
    { id: 'cp2', at: [14, -0.2, -9], yaw: N, resets: ['enc-elite'] },
  ],
  reward: { kind: 'normal', record: 'rec.tidewater.2', unlocks: ['1-3'] },
  // 선택 경로 장치(35번 R023): 출발점 스위치가 화단 분수를 켜고, 청소반장 구역에 잉크통 둘
  actionDevices: [
    { kind: 'switch', id: 's1', at: [-11, -0.2, -31], enables: ['f2'] },
    { kind: 'fountain', id: 'f2', at: [-9.5, -0.2, -28], land: [-8.5, 1.0, -25.5], startsOff: true },
    { kind: 'barrel', id: 'b3', at: [15, -0.2, 16] },
    { kind: 'barrel', id: 'b4', at: [9, -0.2, 20] },
  ],
};

// ---- 1-3 광장의 통행금지: 진입 사격병 2 정리 → CP(보스 앞) → 통행대장 바리 → 중앙 단말
export const M_1_3: MissionDefinition = {
  id: '1-3', chapterId: 1, title: '광장의 통행금지', mapId: 'tidewater', region: 'tidewater', timeOfDay: 'day', type: 'boss',
  start: { at: [-4, -0.2, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, 20, -38, -16] },
    { id: 's2', bounds: [-19, 19, -20, -2] },
  ],
  devices: [
    { id: 'core', kind: 'terminal', at: [0, 1.1, -4.4], radius: 1.8, paintRadius: 2.5, paintNeed: 0, hold: 2 },
  ],
  objectives: [
    { id: 'o-entry', kind: 'clear', label: '진입로의 잔향 정리', encounter: 'enc-entry', requires: [], checkpoint: 'cp-boss' },
    { id: 'o-boss', kind: 'defeat', label: '통행대장 바리 제압', target: 'bari', requires: ['o-entry'] },
    { id: 'o-core', kind: 'restore', label: '중앙 통신 장치 정상화', device: 'core', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-entry', segment: 's1', area: [-20, 20, -37, -16], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'n-g1', role: 'gunner', at: [-7, -0.2, -20], yaw: S }, { id: 'n-g2', role: 'gunner', at: [7, -0.2, -20], yaw: S }] }] },
    { id: 'enc-boss', segment: 's2', area: [-19, 19, -18, -2], requires: ['o-entry'], maxActive: 3, waves: [{ id: 'w1', units: [{ id: 'bari', role: 'umbrellaCaptain', at: [0, -0.2, -14.5], yaw: S }] }],
      support: [
        { unit: { id: 'x-p1', role: 'painter', at: [-15, -0.2, -6], yaw: E }, hpBelow: 0.5 },
        { unit: { id: 'x-p2', role: 'painter', at: [15, -0.2, -6], yaw: W }, hpBelow: 0.25 },
      ] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: [-5, -0.2, -27], yaw: N, resets: ['enc-boss'] },
  ],
  reward: { kind: 'boss', signature: 'SG01', unlocks: ['2-1'] },
  boss: { id: 'bari', name: '통행대장 바리', unit: 'bari' },
};
