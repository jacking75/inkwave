// 4장 할야드 마리나 임무(33번 T056~T058, 기획 12·13·14번). 지도 halyard(해질녘)는 축 정렬이다: 남쪽(−Z) 클럽하우스 지붕이
// 출발점, 서쪽(−X) 긴 부두와 하우스보트 계류장, 가운데 급유 부두, 동쪽(+X) 예인선이 올라앉은 보트야드, 가운데 가로로
// 정박한 카페리(갑판 1.3, z −5~5). 덱 사이는 물이다(빠지면 실패). 좌표는 shots/map/halyard*.png·json의 실측이다.
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 4-1 끊어진 계류선: 사무소 앞 부두 사격병 2 → 서쪽 긴 부두 계류 중계기 A 안정화 30초(사격 2 → 도색 1·사격 1) → CP1
//      → 가운데 급유 부두의 감시병·방패병(카페리 선실이 시야를 끊는다) → 예인선 옆 도착형 CP2 → 보트야드 계류 중계기 B
//      안정화 30초(도색 1·사격 1 → 사격 1, 동시 최대 4) → 카페리 앞 정비 단말. 선택 상자는 클럽하우스 서쪽 창고 외벽.
export const M_4_1: MissionDefinition = {
  id: '4-1', chapterId: 4, title: '끊어진 계류선', mapId: 'halyard', region: 'halyard', timeOfDay: 'dusk', type: 'normal',
  start: { at: [0, 0, -32], yaw: N },
  segments: [
    { id: 's1', bounds: [-25, 3, -42, -8] },
    { id: 's2', bounds: [-7, 14, -27, -3] },
    { id: 's3', bounds: [6, 23, -27, -5] },
  ],
  devices: [
    { id: 'moorA', kind: 'stabilize', at: [-22, 0, -18], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'crate', kind: 'crate', at: [-24, 0, -40], radius: 1.3, hold: 2 },
    { id: 'moorB', kind: 'stabilize', at: [20, 0, -11], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'term', kind: 'terminal', at: [12, 0, -7], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-a', kind: 'restore', label: '계류 중계기 안정화 0/2 — 첫 계류 말뚝', device: 'moorA', requires: [], comm: 'defend1', checkpoint: 'cp1' },
    { id: 'o-b', kind: 'restore', label: '계류 중계기 안정화 1/2 — 카페리 쪽', device: 'moorB', requires: ['o-a'] },
    { id: 'o-e', kind: 'restore', label: '카페리 앞 정비 단말 열기', device: 'term', requires: ['o-b'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    // 부두의 폭을 읽다: 상자 뒤 사격병 2
    { id: 'enc-entry', segment: 's1', area: [-25, 3, -34, -24], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'e-g1', role: 'gunner', at: [-4, 0, -26], yaw: S }, { id: 'e-g2', role: 'gunner', at: [-16, 0, -25.5], yaw: E }] }] },
    // 첫 번째 계류점: 안정화 중에만 두 웨이브(원 안에 들어온 적은 누적을 멈춘다)
    { id: 'enc-a', segment: 's1', area: [-25, -19, -26, -10], requiresActive: 'o-a', maxActive: 4, waves: [
      { id: 'w1', units: [{ id: 'a-g1', role: 'gunner', at: [-22, 0, -10], yaw: S }, { id: 'a-g2', role: 'gunner', at: [-21, 0, -27], yaw: N }] },
      { id: 'w2', gapBefore: 4, units: [{ id: 'a-p1', role: 'painter', at: [-22, 0, -9], yaw: S }, { id: 'a-g3', role: 'gunner', at: [-22, 0, -30], yaw: N }] },
    ] },
    // 선실을 사이에 둔 전투: 카페리 갑판 감시병 + 급유 부두 방패병
    { id: 'enc-c', segment: 's2', area: [-7, 3, -24, -6], requires: ['o-a'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'c-w1', role: 'watcher', at: [-1, 1.3, -3.5], yaw: S }, { id: 'c-sh1', role: 'shield', at: [-2, 0, -14], yaw: S }] }] },
    // 두 번째 계류점: 두 묶음, 동시 최대 4
    { id: 'enc-b', segment: 's3', area: [8, 23, -16, -5], requiresActive: 'o-b', maxActive: 4, waves: [
      { id: 'w1', units: [{ id: 'b-p1', role: 'painter', at: [21, 0, -15], yaw: N }, { id: 'b-g1', role: 'gunner', at: [10, 0, -8], yaw: E }] },
      { id: 'w2', gapBefore: 3, units: [{ id: 'b-g2', role: 'gunner', at: [21, 0, -20], yaw: N }] },
    ] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-22, 0, -26], yaw: N, resets: ['enc-c', 'enc-b'] },
    // 예인선 옆: 보트야드로 들어서면 저장
    { id: 'cp2', at: [10, 0, -24], yaw: N, resets: ['enc-b'], area: [8, 13, -26, -20], after: ['o-a'] },
  ],
  reward: { kind: 'normal', record: 'rec.halyard.1', unlocks: ['4-2'] },
};

// ---- 4-2 돌아오지 않은 작업반: 긴 부두 첫 장비(경계 사격병 2) → 하우스보트 갑판 둘째 장비(도색병·사격병) → CP1 → 급유 부두
//      건널판 도착형 CP2 → 카페리 서쪽 차량 갑판의 계류 수문장(선실 북쪽 복도로 돌아 뒤를 잡는다, 절반 체력에 한 번 자리
//      이동) → 통로 뒤 작업반 귀환 기록. 선택 상자는 정비 창고 옆 서쪽 우회 길. 호위 구간은 없다.
export const M_4_2: MissionDefinition = {
  id: '4-2', chapterId: 4, title: '돌아오지 않은 작업반', mapId: 'halyard', region: 'halyard', timeOfDay: 'dusk', type: 'elite',
  start: { at: [-20, 0, -34], yaw: N },
  segments: [
    { id: 's1', bounds: [-25, -8, -36, -8] },
    { id: 's2', bounds: [-20, 4, -11, 6] },
  ],
  devices: [
    { id: 'kit1', kind: 'record', at: [-22, 0, -17], radius: 1.6, hold: 2, guards: ['a-g1', 'a-g2'] },
    { id: 'kit2', kind: 'record', at: [-12, 0.8, -16], radius: 1.6, hold: 2, guards: ['b-p1', 'b-g1'] },
    { id: 'crate', kind: 'crate', at: [-24, 0, -33], radius: 1.3, hold: 2 },
    { id: 'log', kind: 'record', at: [-15, 1.3, 2], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-k1', kind: 'retrieve', label: '정비 장비 회수 0/2 — 긴 부두 상판', device: 'kit1', requires: [] },
    { id: 'o-k2', kind: 'retrieve', label: '정비 장비 회수 1/2 — 하우스보트 갑판', device: 'kit2', requires: ['o-k1'], checkpoint: 'cp1' },
    { id: 'o-boss', kind: 'defeat', label: '계류 수문장 제압', target: 'gate', requires: ['o-k2'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'retrieve', label: '통로 뒤 작업반 귀환 기록 회수', device: 'log', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-25, -19, -30, -10], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'a-g1', role: 'gunner', at: [-22, 0, -24], yaw: N }, { id: 'a-g2', role: 'gunner', at: [-21, 0, -10], yaw: S }] }] },
    { id: 'enc-b', segment: 's1', area: [-21, -9, -24, -13], requires: ['o-k1'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'b-p1', role: 'painter', at: [-12, 0.7, -20], yaw: S }, { id: 'b-g1', role: 'gunner', at: [-10, 0.8, -17], yaw: W }] }] },
    { id: 'enc-boss', segment: 's2', area: [-20, -4, -6, 6], requires: ['o-k2'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'gate', role: 'shieldElite', at: [-14, 1.3, -3], yaw: E, alt: [-14, 1.3, 3] }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-21, 0, -14], yaw: N, resets: ['enc-boss'] },
    // 정예 앞 데크: 급유 부두에서 카페리로 오르는 건널판 앞
    { id: 'cp2', at: [-3, 0, -10], yaw: N, resets: ['enc-boss'], area: [-6, 2, -11, -8], after: ['o-k2'] },
  ],
  reward: { kind: 'normal', record: 'rec.halyard.2', unlocks: ['4-3'] },
};

// ---- 4-3 등대 없는 항로: 급유 부두 도착형 CP(보스장 앞) → 서쪽 중계점 A(서쪽 사선을 끊는다) → 동쪽 중계점 X(안전 통로) →
//      계류장 스큐(서쪽 차량 갑판 거점 → 중계점 복구·절반 체력에 동쪽 거점, 30% 이하 거점 왕복) → 항로 제어 단말.
//      카페리 선체는 고정 엄폐이다(움직이지 않는다).
export const M_4_3: MissionDefinition = {
  id: '4-3', chapterId: 4, title: '등대 없는 항로', mapId: 'halyard', region: 'halyard', timeOfDay: 'dusk', type: 'boss',
  start: { at: [0, 0, -32], yaw: N },
  segments: [
    { id: 's1', bounds: [-25, 23, -34, 6] },
  ],
  devices: [
    { id: 'beaconA', kind: 'terminal', at: [-22, 0, -12], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'beaconX', kind: 'terminal', at: [20, 0, -11], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'helm', kind: 'terminal', at: [0, 0, -12], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-a', kind: 'restore', label: '엄폐 중계점 확보 0/2 — 서쪽', device: 'beaconA', requires: [] },
    { id: 'o-x', kind: 'restore', label: '엄폐 중계점 확보 1/2 — 동쪽 안전 통로', device: 'beaconX', requires: ['o-a'] },
    { id: 'o-boss', kind: 'defeat', label: '계류장 스큐 제압', target: 'skew', requires: ['o-x'] },
    { id: 'o-e', kind: 'restore', label: '항로 제어 단말 복구', device: 'helm', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-boss', segment: 's1', area: [-25, 23, -28, 6], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'skew', role: 'skew', at: [-14.5, 1.3, -2.5], yaw: S, alt: [14, 1.3, -2] }] }] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: [0, 0, -30], yaw: N, resets: ['enc-boss'], area: [-6, 6, -31, -29], after: [] },
  ],
  reward: { kind: 'boss', signature: 'SG04', unlocks: ['5-1'] },
  boss: { id: 'skew', name: '계류장 스큐', unit: 'skew', relocateOn: ['o-a', 'o-x'] },
};
