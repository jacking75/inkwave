// 2장 크로스로드 시장 임무(33번 T050~T052, 기획 6·7·8번). 지도 crossmarket(해질녘)의 남쪽 곡물거래소(-Z)에서 북쪽
// 시장홀로 진행한다. 좌표는 shots/map/crossmarket*.png·json(node .tools/map-dump.js --map crossmarket)으로 확인한 실제
// 지형 값이며 y는 바닥 높이 힌트이다(시장 거리 0, 보도 0.15, 시장홀 바닥 0.1, 지붕 테라스 2.6, 퍼레이드 1.2).
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 2-1 비어 있는 가판대: 기록 A(섬 가판대) → CP1 → (정면 방패병 | 지붕 덮인 시장 통로 + 선택 상자 → 외곽 사격병)
//      → 홀 모퉁이 도착 CP2 → 기록 B(경계 3명) → 시장홀 앞 통신 표식
export const M_2_1: MissionDefinition = {
  id: '2-1', chapterId: 2, title: '비어 있는 가판대', mapId: 'crossmarket', region: 'crossmarket', timeOfDay: 'dusk', type: 'normal',
  start: { at: [0, 0, -30], yaw: N },
  segments: [
    { id: 's1', bounds: [-6, 8, -37, -19] },
    { id: 's2', bounds: [-6, 23, -23, -10] },
    { id: 's3', bounds: [-2, 18, -13, 2] },
  ],
  devices: [
    { id: 'recA', kind: 'record', at: [3.6, 0.1, -25], radius: 1.8, hold: 2, guards: ['a-g1', 'a-g2'] },
    { id: 'crate', kind: 'crate', at: [8, 0, -19.5], radius: 1.3, hold: 2 },
    { id: 'recB', kind: 'record', at: [9, 0, -6], radius: 1.8, hold: 2, guards: ['b-p1', 'b-g1', 'b-g2'] },
    { id: 'exit', kind: 'exit', at: [0.5, 0.1, -4], radius: 1.8, hold: 2 },
  ],
  objectives: [
    { id: 'o-ra', kind: 'retrieve', label: '거래 기록 회수 0/2 — 왼쪽 가판대', device: 'recA', requires: [], comm: 'firstBox', checkpoint: 'cp1' },
    { id: 'o-rb', kind: 'retrieve', label: '거래 기록 회수 1/2 — 시장홀 옆 기록함', device: 'recB', requires: ['o-ra'] },
    { id: 'o-e', kind: 'exit', label: '시장홀 앞 통신 표식으로', device: 'exit', requires: ['o-rb'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-6, 8, -33, -19], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'a-g1', role: 'gunner', at: [-2.5, 0, -21], yaw: S }, { id: 'a-g2', role: 'gunner', at: [5, 0.15, -20.5], yaw: S }] }] },
    // 갈림길: 고른 경로의 묶음만 발동한다
    { id: 'enc-front', segment: 's2', area: [-4, 5.5, -19, -14], route: 'front', requires: ['o-ra'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'f-sh1', role: 'shield', at: [1, 0, -16], yaw: S }] }] },
    { id: 'enc-side', segment: 's2', area: [6, 22, -22, -10], route: 'side', requires: ['o-ra'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 's-g1', role: 'gunner', at: [12.75, 2.6, -17], yaw: S }, { id: 's-g2', role: 'gunner', at: [21.5, 1.2, -13], yaw: W }] }] },
    // 기록함의 작은 방어전: 도색병 1·사격병 2, 추가 웨이브 없음
    { id: 'enc-b', segment: 's3', area: [3, 16, -10, 0], requires: ['o-ra'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'b-p1', role: 'painter', at: [12, 0, -4], yaw: W }, { id: 'b-g1', role: 'gunner', at: [8, 0, -8], yaw: S }, { id: 'b-g2', role: 'gunner', at: [13, 0, -8.5], yaw: W }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [2, 0, -28], yaw: N, resets: ['enc-front', 'enc-side', 'enc-b'] },
    // 두 갈래가 홀 모퉁이에서 만나는 띠에 들어오면 저장(기록 B 방어전 직전)
    { id: 'cp2', at: [1, 0, -11.5], yaw: E, resets: ['enc-b'], area: [-4, 21, -12.5, -10.5], after: ['o-ra'] },
  ],
  reward: { kind: 'normal', record: 'rec.crossmarket.1', unlocks: ['2-2'] },
};

// ---- 2-2 유리 지붕의 감시자: 어물 골목 중계기 A(베란다 감시병) → CP1 → 계단 쪽 중계기 B(사격병 2) → 테라스 계단 아래 도착 CP2
//      → 지붕 테라스의 유리눈 감시자(절반 체력에서 북쪽 끝으로 한 번 이동) → 전차 정류장 송신함 기록. 선택 상자는 퍼레이드 위.
export const M_2_2: MissionDefinition = {
  id: '2-2', chapterId: 2, title: '유리 지붕의 감시자', mapId: 'crossmarket', region: 'crossmarket', timeOfDay: 'dusk', type: 'elite',
  start: { at: [-16.5, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, -3, -37, -12] },
    { id: 's2', bounds: [-6, 8, -22, -6] },
    { id: 's3', bounds: [8, 25, -31, -6] },
    { id: 's4', bounds: [8, 22, -8, 10] },
  ],
  devices: [
    { id: 'relayA', kind: 'terminal', at: [-16.5, 0, -22.5], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'relayB', kind: 'terminal', at: [-1.5, 0, -13], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2, clearFirst: 'enc-b' },
    { id: 'crate', kind: 'crate', at: [22, 1.2, -24], radius: 1.3, hold: 2 },
    { id: 'box', kind: 'record', at: [16, 0.3, 5.5], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-a', kind: 'restore', label: '외곽 중계기 복구 0/2 — 차양 기둥 뒤', device: 'relayA', requires: [], checkpoint: 'cp1' },
    { id: 'o-b', kind: 'restore', label: '외곽 중계기 복구 1/2 — 계단 쪽', device: 'relayB', requires: ['o-a'] },
    { id: 'o-boss', kind: 'defeat', label: '유리눈 감시자 제압', target: 'glass', requires: ['o-b'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'retrieve', label: '전차 정류장 송신함의 통신 기록 회수', device: 'box', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    // 첫 사선: 베란다 위 감시병(0.9초 조준) + 가까운 길의 사격병
    { id: 'enc-a', segment: 's1', area: [-20, -3, -30, -12], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'a-w1', role: 'watcher', at: [-4.9, 2.6, -21], yaw: W }, { id: 'a-g1', role: 'gunner', at: [-9, 0, -19], yaw: W }] }] },
    // 높이를 바꾸는 벽: 사격병 2(중계기 B 방어형 — 정리해야 가동)
    { id: 'enc-b', segment: 's2', area: [-6, 8, -20, -8], requires: ['o-a'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'b-g1', role: 'gunner', at: [2, 0, -17], yaw: S }, { id: 'b-g2', role: 'gunner', at: [4.5, 0, -10], yaw: W }] }] },
    // 두 발 뒤의 빈틈: 정예 1, 지원 없음
    { id: 'enc-glass', segment: 's3', area: [9.5, 16, -29, -11], requires: ['o-b'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'glass', role: 'watcherElite', at: [12.75, 2.6, -24.5], yaw: N, alt: [12.75, 2.6, -16.8] }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-15, 0, -26], yaw: N, resets: ['enc-b', 'enc-glass'] },
    // 정예 앞: 테라스 북쪽 계단 아래(지붕 몸체가 사선을 가린다). 지붕에서 떨어져도 여기서 다시 시작한다
    { id: 'cp2', at: [12.75, 0, -8], yaw: S, resets: ['enc-glass'], area: [9, 17, -10, -6], after: ['o-b'] },
  ],
  reward: { kind: 'normal', record: 'rec.crossmarket.2', unlocks: ['2-3'] },
};

// ---- 2-3 시장의 마지막 방송: 홀 앞 진입 사격병 정리 → 보스 앞 CP → 시장홀 안 배전탑 오르골. 송신기 좌 → 중 → 우를 차례로
//      칠하고 가동(끌 때마다 중심핵 8초 노출, 셋 다 끄면 계속 노출) → 중심핵 파괴 → 탑 뒤 배포 기록. 홀 안 좌표는 전차 선로
//      좌표계(u 선로 방향, v 가로)에서 잡았다: 탑 (u 0, v 4.2), 송신기 (−6.5, 4) · (0, −4.3) · (6.5, 4).
const ORGEL_YAW = Math.atan2(0.5145, -0.8575);   // 탑이 전차(−v) 쪽을 본다
export const M_2_3: MissionDefinition = {
  id: '2-3', chapterId: 2, title: '시장의 마지막 방송', mapId: 'crossmarket', region: 'crossmarket', timeOfDay: 'dusk', type: 'boss',
  start: { at: [2, 0, -15], yaw: N },
  segments: [
    { id: 's1', bounds: [-5, 12, -19, -7] },
    { id: 's2', bounds: [-11, 11, -8, 10] },
  ],
  devices: [
    { id: 'txL', kind: 'terminal', at: [-7.6, 0.1, 0.1], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
    { id: 'txC', kind: 'terminal', at: [2.2, 0.1, -3.7], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
    { id: 'txR', kind: 'terminal', at: [3.5, 0.1, 6.8], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
    { id: 'log', kind: 'record', at: [-3.3, 0.1, 5.5], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-entry', kind: 'clear', label: '시장홀 앞 잔향 정리', encounter: 'enc-entry', requires: [], checkpoint: 'cp-boss' },
    { id: 'o-t1', kind: 'restore', label: '송신기 정지 0/3 — 왼쪽 받침대', device: 'txL', requires: ['o-entry'] },
    { id: 'o-t2', kind: 'restore', label: '송신기 정지 1/3 — 전차 앞 받침대', device: 'txC', requires: ['o-t1'] },
    { id: 'o-t3', kind: 'restore', label: '송신기 정지 2/3 — 오른쪽 받침대', device: 'txR', requires: ['o-t2'] },
    { id: 'o-boss', kind: 'defeat', label: '배전탑 오르골 중심핵 파괴', target: 'orgel', requires: ['o-t3'] },
    { id: 'o-e', kind: 'retrieve', label: '탑 뒤 배포 기록 회수', device: 'log', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-entry', segment: 's1', area: [-5, 12, -19, -7], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'n-g1', role: 'gunner', at: [-1, 0, -10], yaw: S }, { id: 'n-g2', role: 'gunner', at: [6, 0, -9], yaw: S }] }] },
    // 첫 단계는 광선 하나 + 사격병 1명(기획 B)
    { id: 'enc-boss', segment: 's2', area: [-9, 9, -6.5, 9], requires: ['o-entry'], maxActive: 3, waves: [{ id: 'w1', units: [
      { id: 'orgel', role: 'orgelCore', at: [-2.2, 0.1, 3.6], yaw: ORGEL_YAW }, { id: 'x-g1', role: 'gunner', at: [4, 0.1, -4.1], yaw: W }] }] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: [2, 0, -12], yaw: N, resets: ['enc-boss'] },
  ],
  reward: { kind: 'boss', signature: 'SG02', unlocks: ['3-1'] },
  boss: { id: 'orgel', name: '배전탑 오르골', unit: 'orgel', transmitters: ['o-t1', 'o-t2', 'o-t3'] },
};
