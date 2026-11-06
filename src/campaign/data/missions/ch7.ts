// 7장 테라스 하이츠 임무(33번 T065~T067, 기획 21·22·23번). 지도 terraces는 언덕 마을이다: 이쪽 언덕(남서)이 H0 광장(0)에서
// H1(1.2)·H2(2.4)·H3(3.6)·H4(4.8, 출발 테라스)까지 곡선 테라스로 오르고, 가운데 피아체타(0)로 이어진다. 기존 해질녘 배경을 쓰고
// 새벽은 이야기 표현으로만 처리한다. 좌표는 shots/map/terraces*.png·json의 실측이다.
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 7-1 가장 높은 우회로: 언덕 아래 골목 → H1 첫 계단 중간 테라스 중계기 1(감시·사격 2·도색) → CP1 → H2 중계기 2(정면만 막는
//      방패병, 옆 계단으로 돌아간다) → CP2(돔 옆 H2) → H3 중계기 3(감시·도색·사격 2, 동시 4) → H4 가장 높은 통신대.
//      모든 높이는 계단으로 걸어 오를 수 있다(벽오르기는 선택). 높은 목표는 HUD 방향 표식이 가리킨다.
export const M_7_1: MissionDefinition = {
  id: '7-1', chapterId: 7, title: '가장 높은 우회로', mapId: 'terraces', region: 'terraces', timeOfDay: 'dusk', type: 'normal',
  start: { at: [-10, 0, -10], yaw: S },
  segments: [
    { id: 's1', bounds: [-22, -4, -26, -8] },
    { id: 's2', bounds: [-12, 6, -26, -14] },
    { id: 's3', bounds: [-14, 6, -38, -24] },
  ],
  devices: [
    { id: 'relay1', kind: 'terminal', at: [-15, 1.2, -21], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
    { id: 'crate', kind: 'crate', at: [-5, 1.3, -14], radius: 1.3, hold: 2 },
    { id: 'relay2', kind: 'terminal', at: [0, 2.4, -20], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
    { id: 'relay3', kind: 'terminal', at: [-4, 3.6, -30], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2, clearFirst: 'enc-c' },
    { id: 'tower', kind: 'exit', at: [-12, 4.8, -33], radius: 1.8, hold: 2 },
  ],
  objectives: [
    { id: 'o-1', kind: 'restore', label: '높이가 다른 중계기 연결 0/3 — 첫 계단 중간', device: 'relay1', requires: [], checkpoint: 'cp1' },
    { id: 'o-2', kind: 'restore', label: '높이가 다른 중계기 연결 1/3 — 위쪽 계단', device: 'relay2', requires: ['o-1'], comm: 'echo', checkpoint: 'cp2' },
    { id: 'o-3', kind: 'restore', label: '높이가 다른 중계기 연결 2/3 — 돔 옆 광장 위', device: 'relay3', requires: ['o-2'] },
    { id: 'o-e', kind: 'exit', label: '가장 높은 고정 통신대로', device: 'tower', requires: ['o-3'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-22, -4, -24, -8], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'a-w1', role: 'watcher', at: [-10, 2.4, -17], yaw: S }, { id: 'a-g1', role: 'gunner', at: [-18, 0, -9], yaw: E },
      { id: 'a-g2', role: 'gunner', at: [-16, 1.2, -23], yaw: N }, { id: 'a-p1', role: 'painter', at: [-14, 0, -8], yaw: E }] }] },
    { id: 'enc-b', segment: 's2', area: [-6, 6, -24, -16], requires: ['o-1'], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'b-sh1', role: 'shield', at: [0, 2.4, -22], yaw: N }] }] },
    { id: 'enc-c', segment: 's3', area: [-10, 6, -36, -26], requires: ['o-2'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'c-w1', role: 'watcher', at: [-8, 4.8, -28], yaw: E }, { id: 'c-p1', role: 'painter', at: [-4, 3.6, -32], yaw: N },
      { id: 'c-g1', role: 'gunner', at: [-2, 3.6, -34], yaw: N }, { id: 'c-g2', role: 'gunner', at: [3, 2.9, -26], yaw: W }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-16, 1.2, -23], yaw: E, resets: ['enc-b', 'enc-c'] },
    { id: 'cp2', at: [-10, 2.4, -17], yaw: E, resets: ['enc-c'] },
  ],
  reward: { kind: 'normal', record: 'rec.terraces.1', unlocks: ['7-2'] },
};

// ---- 7-2 남은 신호: 피아체타 서쪽 골목 전투(사격·도색·사격) → 광장 고정 제어점 30초 방어(혼합 웨이브 둘) → CP1 → 지휘관 구역 앞
//      도착형 CP2 → 잔향 지휘관(통 두 개 → 3초 정비, 70% 사격병 2·35% 도색병 1 각 한 번, 지원 중 다음 포격 지연, 남은 호출 수
//      안내) → 지휘관 뒤 원본 기록. 원본 기록은 임무 완료 저장 때 확정된다.
export const M_7_2: MissionDefinition = {
  id: '7-2', chapterId: 7, title: '남은 신호', mapId: 'terraces', region: 'terraces', timeOfDay: 'dusk', type: 'elite',
  start: { at: [-10, 0, -10], yaw: E },
  segments: [
    { id: 's1', bounds: [-22, 4, -14, -4] },
    { id: 's2', bounds: [-2, 20, -12, 8] },
  ],
  devices: [
    { id: 'hold', kind: 'stabilize', at: [12, 0, -6], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'crate', kind: 'crate', at: [-5, 1.3, -14], radius: 1.3, hold: 2 },   // 외곽 계단
    { id: 'origin', kind: 'record', at: [18, 0, 2], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-a', kind: 'clear', label: '좁은 골목의 잔향 정리', encounter: 'enc-a', requires: [] },
    { id: 'o-def', kind: 'restore', label: '고정 제어점 방어 — 30초', device: 'hold', requires: ['o-a'], checkpoint: 'cp1' },
    { id: 'o-boss', kind: 'defeat', label: '잔향 지휘관 제압', target: 'cmd', requires: ['o-def'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'retrieve', label: '지휘관 뒤 원본 기록 회수', device: 'origin', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-20, 2, -14, -4], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'a-g1', role: 'gunner', at: [-14, 0, -8], yaw: E }, { id: 'a-p1', role: 'painter', at: [2, 0, -10], yaw: W },
      { id: 'a-g2', role: 'gunner', at: [-18, 0, -9], yaw: E }] }] },
    { id: 'enc-def', segment: 's2', area: [4, 20, -12, 4], requiresActive: 'o-def', maxActive: 5, waves: [
      { id: 'w1', units: [{ id: 'd-g1', role: 'gunner', at: [18, 0, 0], yaw: W }, { id: 'd-g2', role: 'gunner', at: [2, 0, -10], yaw: E }, { id: 'd-p1', role: 'painter', at: [14, 0, 4], yaw: S }] },
      { id: 'w2', gapBefore: 4, units: [{ id: 'd-sh1', role: 'shield', at: [18, 0, -2], yaw: W }, { id: 'd-m1', role: 'mortar', at: [8, 0, 6], yaw: S }] },
    ] },
    { id: 'enc-cmd', segment: 's2', area: [12, 20, -4, 8], requires: ['o-def'], maxActive: 5, waves: [{ id: 'w1', units: [
      { id: 'cmd', role: 'commander', at: [14, 0, 4], yaw: S }] }],
      support: [
        { unit: { id: 'x-g1', role: 'gunner', at: [18, 0, 0], yaw: W }, hpBelow: 0.7 },
        { unit: { id: 'x-g2', role: 'gunner', at: [8, 0, 6], yaw: S }, hpBelow: 0.7 },
        { unit: { id: 'x-p1', role: 'painter', at: [18, 0, -2], yaw: W }, hpBelow: 0.35 },
      ] },
  ],
  checkpoints: [
    { id: 'cp1', at: [12, 0, -6], yaw: N, resets: ['enc-cmd'] },
    { id: 'cp2', at: [10, 0, -2], yaw: E, resets: ['enc-cmd'], area: [8, 11, -4, 0], after: ['o-def'] },
  ],
  reward: { kind: 'normal', record: 'rec.terraces.2', unlocks: ['7-3'] },
};

// ---- 7-3 되찾는 물결: 상부 광장 정비 표식(도착형 CP) → 피아체타 서쪽의 파도껍질(거대 소라게 재사용, 솔로 22,000).
//      체력 66%·33%에서 제어 고리 1·2가 열리고(끊기 전에는 그 아래로 내려가지 않는다), 끊으면 보스가 3초 정비. 남은 체력을 다
//      깎으면 고리 3이 열리고 끊는 순간 쓰러진다(안전한 종료 연출) → 보스 후방 중앙 통제핵. 고리는 바닥 높이의 밝은 이중 원·번호.
//      전투장은 보스 이동 격자의 보스 영역(월드 x −21.3~2.8, z −11.3~43.3)과 기본 출현점(−11.75, 1.75)이다(기획의 켈프라인 대안은
//      쓰지 않았다 — 실측 돌진 직선 7~8 m).
export const M_7_3: MissionDefinition = {
  id: '7-3', chapterId: 7, title: '되찾는 물결', mapId: 'terraces', region: 'terraces', timeOfDay: 'dusk', type: 'boss',
  start: { at: [2, 0, -10], yaw: W },
  segments: [
    { id: 's1', bounds: [-22, 4, -12, 44] },
  ],
  devices: [
    { id: 'ring1', kind: 'record', at: [-19.8, 0, 1.8], radius: 2.0, hold: 2 },
    { id: 'ring2', kind: 'record', at: [-2.8, 0, -7.3], radius: 2.0, hold: 2 },
    { id: 'ring3', kind: 'record', at: [-15.8, 0, 19.3], radius: 2.0, hold: 2 },
    { id: 'core', kind: 'terminal', at: [-13.8, 0, 28.8], radius: 2.0, paintRadius: 2.6, paintNeed: 0, hold: 2 },
  ],
  objectives: [
    { id: 'o-r1', kind: 'retrieve', label: '제어 고리 ① 끊기 — 체력 66%에서 열린다', device: 'ring1', requires: [] },
    { id: 'o-r2', kind: 'retrieve', label: '제어 고리 ② 끊기 — 체력 33%에서 열린다', device: 'ring2', requires: ['o-r1'] },
    { id: 'o-r3', kind: 'retrieve', label: '제어 고리 ③ 끊기 — 남은 체력을 깎으면 열린다', device: 'ring3', requires: ['o-r2'] },
    { id: 'o-boss', kind: 'defeat', label: '파도껍질 무력화', target: 'wave', requires: ['o-r3'] },
    { id: 'o-core', kind: 'restore', label: '최종 통제핵 정지 — 복구 명령 전송', device: 'core', requires: ['o-boss'] },
  ],
  encounters: [],
  checkpoints: [
    { id: 'cp-final', at: [2, 0, -10], yaw: W, resets: [], area: [0, 4, -12, -8], after: [] },
  ],
  reward: { kind: 'boss', signature: 'SG07', unlocks: [] },
  boss: { id: 'wave', name: '파도껍질', unit: 'wave', giant: { at: [-11.75, 0, 1.75], yaw: -3.14, area: [-21.3, 2.8, -11.3, 43.3], hp: 22000, profile: 'final', from: 'o-r1',
    rings: [{ device: 'ring1', at: 0.66 }, { device: 'ring2', at: 0.33 }, { device: 'ring3', at: 0 }] } },
};
