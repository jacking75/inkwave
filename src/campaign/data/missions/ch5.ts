// 5장 솔트팬 분지 임무(33번 T059~T061, 기획 15·16·17번). 지도 saltpan(낮)은 축 정렬이다: 남쪽(−Z) 소금 창고 회랑(2.4)이
// 출발점, 서쪽(−X) 포장 창고, 가운데 소금 밭(뒤 밭 −0.6, 앞 밭 −0.9, 큰 밭 −1.2, 사이 둑 0), 동쪽(+X) 소금더미(능선 2.4).
// 좌표는 shots/map/saltpan*.png·json의 실측이다. y는 바닥 높이 힌트이다.
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 5-1 소금 밭의 두 흐름: 뒤 밭 첫 펌프 안정화 30초(도색 2·사격 1) → 둑 가운데 CP1 → 소금더미 감시병·도색병 → 앞 밭 둘째
//      펌프 안정화 30초(사격 2 → 도색 1·포격 1) → 가운데 둑 순환 기록함. 선택 상자는 포장 창고 옆 소금더미 뒤.
export const M_5_1: MissionDefinition = {
  id: '5-1', chapterId: 5, title: '소금 밭의 두 흐름', mapId: 'saltpan', region: 'saltpan', timeOfDay: 'day', type: 'normal',
  start: { at: [-2, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-16, 1, -38, -10] },
    { id: 's2', bounds: [-2, 18, -23, -6] },
  ],
  devices: [
    { id: 'pumpW', kind: 'stabilize', at: [-8, -0.6, -25], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'crate', kind: 'crate', at: [-13, 0, -12], radius: 1.3, hold: 2 },
    { id: 'pumpE', kind: 'stabilize', at: [6, -0.9, -14], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'log', kind: 'record', at: [0, 0, -9], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-w', kind: 'restore', label: '펌프 안정화 0/2 — 낮은 소금 밭', device: 'pumpW', requires: [], comm: 'pump1', checkpoint: 'cp1' },
    { id: 'o-e2', kind: 'restore', label: '펌프 안정화 1/2 — 반대편 판자 길', device: 'pumpE', requires: ['o-w'] },
    { id: 'o-r', kind: 'retrieve', label: '중앙 순환 기록 읽기', device: 'log', requires: ['o-e2'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-15, 0, -31, -19], requiresActive: 'o-w', maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'a-p1', role: 'painter', at: [-12, -0.6, -22], yaw: S }, { id: 'a-p2', role: 'painter', at: [-4, -0.6, -28], yaw: W },
      { id: 'a-g1', role: 'gunner', at: [-10, 0, -19], yaw: S }] }] },
    { id: 'enc-c', segment: 's2', area: [-1, 13, -21, -15], requires: ['o-w'], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'c-w1', role: 'watcher', at: [14, 0.9, -20], yaw: W }, { id: 'c-p1', role: 'painter', at: [4, 0, -19], yaw: W }] }] },
    { id: 'enc-b', segment: 's2', area: [0, 12, -18, -8], requiresActive: 'o-e2', maxActive: 5, waves: [
      { id: 'w1', units: [{ id: 'b-g1', role: 'gunner', at: [10, 0, -9], yaw: W }, { id: 'b-g2', role: 'gunner', at: [1, 0, -18], yaw: N }] },
      { id: 'w2', gapBefore: 4, units: [{ id: 'b-p1', role: 'painter', at: [11, 0, -18], yaw: W }, { id: 'b-m1', role: 'mortar', at: [-1, 0, -9], yaw: E }] },
    ] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-2, 0, -19], yaw: N, resets: ['enc-c', 'enc-b'] },
  ],
  reward: { kind: 'normal', record: 'rec.saltpan.1', unlocks: ['5-2'] },
};

// ---- 5-2 마르는 길: 동쪽 뒤 밭 연결점 1(경계 사격병 2) → CP1 → 앞 밭 연결점 2(도색병·포격병) → 펌프 기단 CP2 → 큰 밭의 염전
//      청소조와 살수 장치 2개(번갈아 칠한다, 끄면 그 구역 재도색이 멈추고 정예가 2초 정비) → 정예 뒤 안전 연결 단말.
//      선택 상자는 밭 가장자리 창고길. 살수 구역(반지름 3.4 m)은 CP2에서 8 m 이상 떨어져 CP 둘레 회복 바닥을 덮지 않는다.
export const M_5_2: MissionDefinition = {
  id: '5-2', chapterId: 5, title: '마르는 길', mapId: 'saltpan', region: 'saltpan', timeOfDay: 'day', type: 'elite',
  start: { at: [-2, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-28, 12, -36, -8] },
    { id: 's2', bounds: [-16, 12, -9, 8] },
  ],
  devices: [
    { id: 'link1', kind: 'terminal', at: [6, -0.6, -26], radius: 2.0, paintRadius: 2.5, paintNeed: 0.6, hold: 2 },
    { id: 'crate', kind: 'crate', at: [-26, 0, -14], radius: 1.3, hold: 2 },
    { id: 'link2', kind: 'terminal', at: [6, -0.9, -14], radius: 2.0, paintRadius: 2.5, paintNeed: 0.6, hold: 2 },
    { id: 'safe', kind: 'terminal', at: [-14, 0, 4], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-l1', kind: 'restore', label: '안전 연결점 확보 0/2 — 첫 소금더미', device: 'link1', requires: [], checkpoint: 'cp1' },
    { id: 'o-l2', kind: 'restore', label: '안전 연결점 확보 1/2 — 앞 밭', device: 'link2', requires: ['o-l1'], checkpoint: 'cp2' },
    { id: 'o-boss', kind: 'defeat', label: '염전 청소조 제압(살수 장치를 먼저 끄면 안전 공간이 생긴다)', target: 'scrub', requires: ['o-l2'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'restore', label: '정예 뒤 안전 연결 단말 가동', device: 'safe', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [0, 12, -31, -20], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'a-g1', role: 'gunner', at: [10, 0, -22], yaw: W }, { id: 'a-g2', role: 'gunner', at: [3, 0, -31], yaw: N }] }] },
    { id: 'enc-b', segment: 's1', area: [0, 12, -19, -10], requires: ['o-l1'], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'b-p1', role: 'painter', at: [10, 0, -10], yaw: S }, { id: 'b-m1', role: 'mortar', at: [-1, 0, -12], yaw: E }] }] },
    { id: 'enc-boss', segment: 's2', area: [-10, 10, -7, 6], requires: ['o-l2'], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'scrub', role: 'painterElite', at: [6, -1.2, -3], yaw: S },
      { id: 'spr1', role: 'sprinkler', at: [-6, -1.2, -1], yaw: N }, { id: 'spr2', role: 'sprinkler', at: [8, -1.2, 1], yaw: N }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [4, 0, -20], yaw: N, resets: ['enc-b', 'enc-boss'] },
    { id: 'cp2', at: [0, 0, -9], yaw: N, resets: ['enc-boss'] },
  ],
  reward: { kind: 'normal', record: 'rec.saltpan.2', unlocks: ['5-3'] },
};

// ---- 5-3 바람이 멈춘 펌프: 둑 도착형 보스장 앞 CP → 큰 밭 펌프 기단의 풍차장 솔트 + 좌·우 살수 장치. 장치 하나를 끄고 그 자리
//      원(반지름 2.8 m)을 60% 이상 칠한 채 6초 → 솔트 4초 과열(약점). 절반 체력에 쓴 원을 한 번 다시 연다. 장치 둘을 다 끄고 원도
//      다 쓰면 12초마다 정비 빈틈. → 순환 설계 단말. 선택 상자는 없다.
export const M_5_3: MissionDefinition = {
  id: '5-3', chapterId: 5, title: '바람이 멈춘 펌프', mapId: 'saltpan', region: 'saltpan', timeOfDay: 'day', type: 'boss',
  start: { at: [-2, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, 20, -34, 9] },
  ],
  devices: [
    { id: 'design', kind: 'terminal', at: [-14, 0, 6], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-boss', kind: 'defeat', label: '풍차장 솔트 제압 — 살수 장치를 끄고 안전 원을 칠하면 과열된다', target: 'salt', requires: [] },
    { id: 'o-e', kind: 'restore', label: '순환 설계 단말 복구', device: 'design', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-boss', segment: 's1', area: [-18, 18, -12, 8], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'salt', role: 'saltBoss', at: [0, -1.2, -6], yaw: S },
      { id: 'sprL', role: 'sprinkler', at: [-14, 0, -1], yaw: N }, { id: 'sprR', role: 'sprinkler', at: [16, 0, -3], yaw: N }] }] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: [0, 0, -17], yaw: N, resets: ['enc-boss'], area: [-4, 4, -19, -15], after: [] },
  ],
  reward: { kind: 'boss', signature: 'SG05', unlocks: ['6-1'] },
  boss: { id: 'salt', name: '풍차장 솔트', unit: 'salt',
    safeZones: { zones: [{ sprinkler: 'sprL', at: [-14, 0, -1], radius: 2.8 }, { sprinkler: 'sprR', at: [16, 0, -3], radius: 2.8 }], safe: 6, heat: 4, every: 12 } },
};
