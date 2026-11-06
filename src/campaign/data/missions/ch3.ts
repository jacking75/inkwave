// 3장 켈프라인 터미널 임무(33번 T053~T055, 기획 9·10·11번). 지도 kelpline(낮)은 부두 전체가 35° 돌아가 있다:
// 좌표는 부두 좌표계(x 부두 가로, z 부두 길이 — 지형 파일 layout.js의 local)로 잡고 K()로 월드 좌표로 바꾼다.
// 부두: 트럭 차선 |x| < 6, 4A 블록 x 6~16(2.6 고원), 냉동 랙 x −6~−17, 안벽(에이프런) |x| 16~24, 크레인 착지장 z −7~7.
// y는 바닥 높이 힌트이다(마당 0, 해치 덮개 1.2, 적재 고원·출발 지붕 2.6). 실측은 shots/map/kelpline*.png·json이다.
import type { MissionDefinition, Rect, Vec3 } from '../types.js';

const C = Math.cos((35 * Math.PI) / 180), S_ = Math.sin((35 * Math.PI) / 180);
// 부두 좌표 → 월드 좌표(layout.js toWorld)
const K = (x: number, y: number, z: number): Vec3 => [+(x * C + z * S_).toFixed(2), y, +(-x * S_ + z * C).toFixed(2)];
// 부두 좌표의 직사각형을 덮는 월드 직사각형(돌린 사각형의 외접 사각형)
const KR = (x0: number, x1: number, z0: number, z1: number): Rect => {
  const ps = [K(x0, 0, z0), K(x1, 0, z0), K(x0, 0, z1), K(x1, 0, z1)];
  return [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[2])), Math.max(...ps.map((p) => p[2]))];
};
// 부두 방향(+z)을 바라보는 yaw와 그 반대
const UP = Math.atan2(S_, C), DOWN = UP + Math.PI;

// ---- 3-1 목적지 없는 화물: 트럭 차선 중계기 1(사격병 2·도색병 1) → CP1 → 4A 안벽 중계기 2(감시병이 긴 안벽을 본다,
//      4A 고원 위 옆길과 선택 상자) → CP2 → 크레인 다리 아래 중계기 3(방패·사격 2·도색, 최대 4) → 선박 쪽 서류함
export const M_3_1: MissionDefinition = {
  id: '3-1', chapterId: 3, title: '목적지 없는 화물', mapId: 'kelpline', region: 'kelpline', timeOfDay: 'day', type: 'normal',
  start: { at: K(0, 0, -30), yaw: UP },
  segments: [
    { id: 's1', bounds: KR(-7, 7, -33, -12) },
    { id: 's2', bounds: KR(5, 24, -32, -4) },
    { id: 's3', bounds: KR(-2, 24, -6, 12) },
  ],
  devices: [
    { id: 'relay1', kind: 'terminal', at: K(-3, 0, -24), radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'crate', kind: 'crate', at: K(12.3, 2.6, -20), radius: 1.3, hold: 2 },   // 4A 셋째 줄 컨테이너 위(줄 사이 10 cm 틈을 피한다)
    { id: 'relay2', kind: 'terminal', at: K(20.5, 0, -21), radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'relay3', kind: 'terminal', at: K(12, 0, 2), radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2, clearFirst: 'enc-c' },
    { id: 'papers', kind: 'record', at: K(20, 0, 9), radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-1', kind: 'restore', label: '화물 경로 중계기 복구 0/3 — 파란 컨테이너 교차로', device: 'relay1', requires: [], checkpoint: 'cp1' },
    { id: 'o-2', kind: 'restore', label: '화물 경로 중계기 복구 1/3 — 안벽', device: 'relay2', requires: ['o-1'], comm: 'relay2', checkpoint: 'cp2' },
    { id: 'o-3', kind: 'restore', label: '화물 경로 중계기 복구 2/3 — 크레인 다리 아래', device: 'relay3', requires: ['o-2'], comm: 'tease' },
    { id: 'o-e', kind: 'retrieve', label: '선박 쪽 서류함의 배포 서류 회수', device: 'papers', requires: ['o-3'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: KR(-6, 6, -28, -14), maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'a-g1', role: 'gunner', at: K(3, 0, -18), yaw: DOWN }, { id: 'a-g2', role: 'gunner', at: K(-4, 0, -16), yaw: DOWN },
      { id: 'a-p1', role: 'painter', at: K(0, 0, -20), yaw: DOWN }] }] },
    // 긴 안벽을 내려다보는 감시병(고원 위 옆길은 덜 노출된다)
    { id: 'enc-b', segment: 's2', area: KR(6, 24, -26, -6), requires: ['o-1'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'b-w1', role: 'watcher', at: K(20, 0, -3), yaw: DOWN }] }] },
    // 기둥을 돌며 싸우기: 방패 1·사격 2·도색 1(최대 4), 정리해야 중계기 3을 가동한다
    { id: 'enc-c', segment: 's3', area: KR(4, 23, -5, 10), requires: ['o-2'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'c-sh1', role: 'shield', at: K(10, 0, 6), yaw: DOWN }, { id: 'c-g1', role: 'gunner', at: K(17, 0, 7), yaw: DOWN },
      { id: 'c-g2', role: 'gunner', at: K(7, 0, 9), yaw: DOWN }, { id: 'c-p1', role: 'painter', at: K(15, 0, 3), yaw: DOWN }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: K(0, 0, -27), yaw: UP, resets: ['enc-b', 'enc-c'] },
    { id: 'cp2', at: K(19, 0, -18), yaw: UP, resets: ['enc-c'] },
  ],
  reward: { kind: 'normal', record: 'rec.kelpline.1', unlocks: ['3-2'] },
};

// ---- 3-2 적재 구역 봉쇄: 트럭 차선 포격 구역(포격병·사격병·도색병) 정리 → CP1 → 차선 중간 도착형 CP2 → 냉동 랙 위
//      적재장 포수(절반 체력 사격병 지원 1회, 랙 중간 끝 계단이 낮은 접근로) → 포수 뒤 봉쇄 기록함. 선택 상자는 4A 쪽 안벽.
export const M_3_2: MissionDefinition = {
  id: '3-2', chapterId: 3, title: '적재 구역 봉쇄', mapId: 'kelpline', region: 'kelpline', timeOfDay: 'day', type: 'elite',
  start: { at: K(-3, 0, -31), yaw: UP },
  segments: [
    { id: 's1', bounds: KR(-7, 24, -33, -12) },
    { id: 's2', bounds: KR(-17, 0, -30, -5) },
  ],
  devices: [
    { id: 'crate', kind: 'crate', at: K(17.2, 1.2, -26), radius: 1.3, hold: 2 },   // 안벽 해치 덮개 위(1.2)
    { id: 'seal', kind: 'record', at: K(-11, 2.6, -26.5), radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-path', kind: 'clear', label: '화물 통로 확보 — 포격 구역의 잔향 정리', encounter: 'enc-a', requires: [], checkpoint: 'cp1' },
    { id: 'o-boss', kind: 'defeat', label: '적재장 포수 제압', target: 'porter', requires: ['o-path'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'retrieve', label: '포수 뒤 봉쇄 기록 회수', device: 'seal', requires: ['o-boss'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    // 첫 번째 낙하 원: 포격병 1·사격병 1·도색병 1
    { id: 'enc-a', segment: 's1', area: KR(-6, 6, -28, -14), maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'a-m1', role: 'mortar', at: K(-3, 0, -18), yaw: DOWN }, { id: 'a-g1', role: 'gunner', at: K(4, 0, -17), yaw: DOWN },
      { id: 'a-p1', role: 'painter', at: K(1, 0, -16), yaw: DOWN }] }] },
    { id: 'enc-boss', segment: 's2', area: KR(-16, -7, -27, -14), requires: ['o-path'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'porter', role: 'mortarElite', at: K(-11, 2.6, -21), yaw: UP }] }],
      support: [{ unit: { id: 'x-g1', role: 'gunner', at: K(-3, 0, -16), yaw: DOWN }, hpBelow: 0.5 }] },
  ],
  checkpoints: [
    { id: 'cp1', at: K(0, 0, -24), yaw: UP, resets: ['enc-boss'] },
    // 포수 전투 직전: 차선 중간(랙 몸체가 사선을 가린다)
    { id: 'cp2', at: K(1, 0, -9), yaw: DOWN, resets: ['enc-boss'], area: KR(-2, 4, -11, -7), after: ['o-path'] },
  ],
  reward: { kind: 'normal', record: 'rec.kelpline.2', unlocks: ['3-3'] },
};

// ---- 3-3 껍질 속의 명령: 차선 진입 사격병 정리 → 보스 앞 CP → 4A 쪽 크레인 다리 둘레 안벽의 하역왕 HULLBREAKER(솔로 18,000,
//      강타·통 낙하 → + 돌진·벽 충돌 기절 → + 소형 게 최대 3, 광선·회전 없음) → 쓰러진 껍질 옆 통제 장비. 선택 상자는 없다.
//      전투장은 보스 이동 격자(BossNav)의 보스 영역(월드 x −2.3~27.3, z −22.8~1.3)이고 출현점은 기존 보스 모드의 기본 출현점이다
//      (크레인 착지장·트럭 차선은 몸통이 설 자리가 없어 돌진 직선이 나오지 않았다 — 검사 기록 참고).
export const M_3_3: MissionDefinition = {
  id: '3-3', chapterId: 3, title: '껍질 속의 명령', mapId: 'kelpline', region: 'kelpline', timeOfDay: 'day', type: 'boss',
  start: { at: K(0, 0, -30), yaw: UP },
  segments: [
    { id: 's1', bounds: KR(-7, 7, -33, -14) },
    { id: 's2', bounds: [-3, 28, -24, 3] },
  ],
  devices: [
    { id: 'gear', kind: 'record', at: K(20, 0, 2), radius: 1.8, hold: 2 },
  ],
  objectives: [
    { id: 'o-entry', kind: 'clear', label: '정비 구역의 잔향 정리', encounter: 'enc-entry', requires: [], checkpoint: 'cp-boss' },
    { id: 'o-boss', kind: 'defeat', label: '하역왕 HULLBREAKER의 통제 장비 파괴', target: 'hull', requires: ['o-entry'] },
    { id: 'o-e', kind: 'retrieve', label: '쓰러진 껍질 옆 통제 장비 확인', device: 'gear', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-entry', segment: 's1', area: KR(-6, 6, -28, -14), maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'n-g1', role: 'gunner', at: K(-3, 0, -19), yaw: DOWN }, { id: 'n-g2', role: 'gunner', at: K(3, 0, -17), yaw: DOWN }] }] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: K(0, 0, -26), yaw: UP, resets: [] },   // 전투장 영역(외접 사각형) 밖
  ],
  reward: { kind: 'boss', signature: 'SG03', unlocks: ['4-1'] },
  boss: { id: 'hull', name: '하역왕 HULLBREAKER', unit: 'hull', giant: { at: [20.25, 0, -14.25], yaw: -2.01, area: [-2.3, 27.3, -22.8, 1.3] } },
};
