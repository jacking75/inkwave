// 6장 록게이트 운하 임무(33번 T062~T064, 기획 18·19·20번). 지도 lockgate(해질녘)는 축 정렬이다: 남쪽(−Z) 부두 하역장(2.4)이
// 출발점, 운하가 Z자로 가로지른다(서쪽 갑문 z≈−12, 가운데 대각선 저수로와 무지개다리, 동쪽 갑문 z≈+12). 이쪽 땅은 남쪽과 동쪽
// 갑문까지의 동쪽 측면(하역 둑·갑문 부두 1.3)이다. 저수로는 진짜 물이다(빠지면 실패). 실측은 shots/map/lockgate*.png·json이다.
// 수문·수위는 움직이지 않는다(장식 수문으로 플레이어를 가두는 실패 조건 없음).
import type { MissionDefinition } from '../types.js';

const S = Math.PI, N = 0, E = Math.PI / 2, W = -Math.PI / 2;   // 바라보는 방향: 남(-Z)·북(+Z)·동(+X)·서(-X)

// ---- 6-1 닫힌 물길: 서쪽 운하 옆 제어점 1(감시병·사격병 2) → CP1 → 다리 발치 제어점 2(도색·감시·사격) → CP2 → 동쪽 갑문 부두
//      제어점 3(방패·포격·사격 2, 동시 최대 4) → CP3 → 통신 단말. 제어점 완료와 CP 저장은 같은 목표 완료에서 한 번에 일어난다.
export const M_6_1: MissionDefinition = {
  id: '6-1', chapterId: 6, title: '닫힌 물길', mapId: 'lockgate', region: 'lockgate', timeOfDay: 'dusk', type: 'normal',
  start: { at: [0, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, 4, -34, -16] },
    { id: 's2', bounds: [-2, 16, -24, -4] },
    { id: 's3', bounds: [12, 25, -4, 12] },
  ],
  devices: [
    { id: 'gate1', kind: 'terminal', at: [-14, 0, -20], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'gate2', kind: 'terminal', at: [8, 0, -12], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'crate', kind: 'crate', at: [16, 0.5, -20], radius: 1.3, hold: 2 },   // 옆 창고 경사로
    { id: 'gate3', kind: 'terminal', at: [22, 1.3, 4], radius: 2.2, paintRadius: 3, paintNeed: 0.6, hold: 2 },
    { id: 'comm', kind: 'exit', at: [15, 1.3, 4], radius: 1.8, hold: 2 },
  ],
  objectives: [
    { id: 'o-1', kind: 'restore', label: '운하 제어점 복구 0/3 — 낮은 운하 옆', device: 'gate1', requires: [], checkpoint: 'cp1' },
    { id: 'o-2', kind: 'restore', label: '운하 제어점 복구 1/3 — 다리 발치', device: 'gate2', requires: ['o-1'], comm: 'point2', checkpoint: 'cp2' },
    { id: 'o-3', kind: 'restore', label: '운하 제어점 복구 2/3 — 동쪽 갑문 부두', device: 'gate3', requires: ['o-2'], comm: 'tease', checkpoint: 'cp3' },
    { id: 'o-e', kind: 'exit', label: '복구 명령 전송 — 통신 단말', device: 'comm', requires: ['o-3'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-a', segment: 's1', area: [-20, 4, -30, -16], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'a-w1', role: 'watcher', at: [-2, 2.6, -24], yaw: W }, { id: 'a-g1', role: 'gunner', at: [-10, 0, -22], yaw: S },
      { id: 'a-g2', role: 'gunner', at: [-16, 0, -24], yaw: E }] }] },
    { id: 'enc-b', segment: 's2', area: [-1, 15, -20, -4], requires: ['o-1'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'b-p1', role: 'painter', at: [12, 0, -6], yaw: S }, { id: 'b-w1', role: 'watcher', at: [13, 0, -6], yaw: S },
      { id: 'b-g1', role: 'gunner', at: [4, 0, -10], yaw: S }] }] },
    { id: 'enc-c', segment: 's3', area: [13, 25, -3, 11], requires: ['o-2'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'c-sh1', role: 'shield', at: [18, 1.3, 0], yaw: S }, { id: 'c-m1', role: 'mortar', at: [22, 1.3, 8], yaw: S },
      { id: 'c-g1', role: 'gunner', at: [15, 1.3, 5], yaw: S }, { id: 'c-g2', role: 'gunner', at: [22, 1.3, 1], yaw: W }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [-12, 0, -24], yaw: N, resets: ['enc-b', 'enc-c'] },
    { id: 'cp2', at: [5, 0, -20], yaw: N, resets: ['enc-c'] },
    { id: 'cp3', at: [22, 1.3, 1], yaw: N, resets: [] },
  ],
  reward: { kind: 'normal', record: 'rec.lockgate.1', unlocks: ['6-2'] },
};

// ---- 6-2 두 문지기: 다리 거리 경계 사격병 2 정리 → CP(정예 앞) → 동쪽 갑문 부두의 쌍문지기(방패 360·감시 300, 경계는 겹치지만
//      구간 밖으로 쫓지 않는다. 한 명이 남으면 남은 정예가 자리를 한 번 옮긴다) → 관제실 입구 잠금 단말. 순서와 무관하게 같은 보상.
export const M_6_2: MissionDefinition = {
  id: '6-2', chapterId: 6, title: '두 문지기', mapId: 'lockgate', region: 'lockgate', timeOfDay: 'dusk', type: 'elite',
  start: { at: [10, 0, -28], yaw: N },
  segments: [
    { id: 's1', bounds: [-2, 16, -30, -4] },
    { id: 's2', bounds: [12, 25, -4, 12] },
  ],
  devices: [
    { id: 'crate', kind: 'crate', at: [16, 0.5, -20], radius: 1.3, hold: 2 },
    { id: 'lock', kind: 'terminal', at: [15, 1.3, 4], radius: 2.0, paintRadius: 2.6, paintNeed: 0.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-entry', kind: 'clear', label: '관제 창고 외벽의 잔향 정리', encounter: 'enc-entry', requires: [], checkpoint: 'cp1' },
    { id: 'o-twins', kind: 'clear', label: '쌍문지기 제압 — 벽돌 엄폐로 시야를 나눈다', encounter: 'enc-twins', requires: ['o-entry'], comm: 'midBossDown' },
    { id: 'o-e', kind: 'restore', label: '관제실 입구 잠금 단말 켜기', device: 'lock', requires: ['o-twins'] },
    { id: 'o-x', kind: 'crate', label: '선택 상자', device: 'crate', requires: [], optional: true },
  ],
  encounters: [
    { id: 'enc-entry', segment: 's1', area: [-2, 16, -26, -8], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'e-g1', role: 'gunner', at: [5, 0, -20], yaw: S }, { id: 'e-g2', role: 'gunner', at: [0, 0, -14], yaw: S }] }] },
    { id: 'enc-twins', segment: 's2', area: [13, 25, -3, 11], requires: ['o-entry'], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'twinS', role: 'shieldElite', at: [18, 1.3, 0], yaw: S, alt: [22, 1.3, 1], hp: 360 },
      { id: 'twinW', role: 'watcherElite', at: [22, 1.3, 8], yaw: S, alt: [15, 1.3, 5], hp: 300 }] }] },
  ],
  checkpoints: [
    { id: 'cp1', at: [8, 0, -12], yaw: N, resets: ['enc-twins'] },
  ],
  reward: { kind: 'normal', record: 'rec.lockgate.2', unlocks: ['6-3'] },
};

// ---- 6-3 역류의 관제실: 도착형 CP(본전투 직전) → 남쪽 마당의 수문 조율기(배전탑 오르골 장치 재사용, 핵 2800). 서쪽 제어점 A
//      안정화 30초(광선) → 동쪽 제어점 B 안정화 30초(+ 원형) → 둘 다 끝나면 핵 계속 노출 → 핵 뒤 중앙 통신함. 보스 안 CP 없음.
export const M_6_3: MissionDefinition = {
  id: '6-3', chapterId: 6, title: '역류의 관제실', mapId: 'lockgate', region: 'lockgate', timeOfDay: 'dusk', type: 'boss',
  start: { at: [0, 0, -33], yaw: N },
  segments: [
    { id: 's1', bounds: [-20, 16, -34, -6] },
  ],
  devices: [
    { id: 'ctrlA', kind: 'stabilize', at: [-14, 0, -20], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'ctrlB', kind: 'stabilize', at: [8, 0, -12], radius: 2.4, paintRadius: 3, paintNeed: 0.6, duration: 30 },
    { id: 'box', kind: 'record', at: [4, 0, -10], radius: 1.6, hold: 2 },
  ],
  objectives: [
    { id: 'o-a', kind: 'restore', label: '외곽 제어점 안정화 0/2 — 서쪽', device: 'ctrlA', requires: [] },
    { id: 'o-b', kind: 'restore', label: '외곽 제어점 안정화 1/2 — 동쪽', device: 'ctrlB', requires: ['o-a'] },
    { id: 'o-boss', kind: 'defeat', label: '수문 조율기 핵 파괴', target: 'regulator', requires: ['o-b'] },
    { id: 'o-e', kind: 'retrieve', label: '핵 뒤 중앙 통신함 확인', device: 'box', requires: ['o-boss'] },
  ],
  encounters: [
    { id: 'enc-boss', segment: 's1', area: [-18, 14, -26, -8], maxActive: 4, waves: [{ id: 'w1', units: [
      { id: 'regulator', role: 'orgelCore', at: [0, 0, -14], yaw: S, hp: 2800, name: '수문 조율기' }] }] },
  ],
  checkpoints: [
    { id: 'cp-boss', at: [0, 0, -30], yaw: N, resets: ['enc-boss'], area: [-4, 4, -32, -28], after: [] },
  ],
  reward: { kind: 'boss', signature: 'SG06', unlocks: ['7-1'] },
  boss: { id: 'regulator', name: '수문 조율기', unit: 'regulator', transmitters: ['o-a', 'o-b'] },
};
