// 캠페인 정의 등록부와 데이터 검증(33번 T021). 임무 실행 전에 정의의 참조·순서·수치 오류를 찾아 실패시킨다.
// 순수 모듈이다(DOM·저장·네트워크 없음). 검사: tests/client/definitions.test.ts.
import type { MissionDefinition, Rect, Vec3 } from './data/types.js';
import { M_1_1, M_1_2, M_1_3 } from './data/missions/ch1.js';
import { M_2_1, M_2_2, M_2_3 } from './data/missions/ch2.js';
import { M_3_1, M_3_2, M_3_3 } from './data/missions/ch3.js';
import { M_4_1, M_4_2, M_4_3 } from './data/missions/ch4.js';
import { M_5_1, M_5_2, M_5_3 } from './data/missions/ch5.js';
import { M_6_1, M_6_2, M_6_3 } from './data/missions/ch6.js';
import { M_7_1, M_7_2, M_7_3 } from './data/missions/ch7.js';
import { ENEMY_ROLES } from './data/enemies.js';
import { MODULES } from './data/modules.js';
import { GRADE_ODDS } from './data/economy.js';
import { DISTRICTS } from './story/districts.js';
import { validateDevices } from './action/devices.js';
import { ALL_RECORDS } from './story/scripts/index.js';

export const MISSIONS: readonly MissionDefinition[] = [M_1_1, M_1_2, M_1_3, M_2_1, M_2_2, M_2_3, M_3_1, M_3_2, M_3_3, M_4_1, M_4_2, M_4_3, M_5_1, M_5_2, M_5_3, M_6_1, M_6_2, M_6_3, M_7_1, M_7_2, M_7_3];
const byId = new Map(MISSIONS.map((m) => [m.id, m]));
export const getMission = (id: string): MissionDefinition | null => byId.get(id) ?? null;
// 항구 지도에 있는 모든 임무 id(아직 구현하지 않은 임무 포함: 해금 대상은 될 수 있지만 출전은 못 한다)
export const ALL_MISSION_IDS: readonly string[] = DISTRICTS.flatMap((d) => d.missions.map((m) => m.id));
export const isImplemented = (id: string): boolean => byId.has(id);

const inRect = (r: Rect, p: Vec3, pad = 0): boolean => p[0] >= r[0] - pad && p[0] <= r[1] + pad && p[2] >= r[2] - pad && p[2] <= r[3] + pad;

// 한 임무의 정의 오류 목록(빈 배열 = 통과). known = 해금 대상으로 허용하는 임무 id
export function validateMission(m: MissionDefinition, known: readonly string[] = ALL_MISSION_IDS): string[] {
  const e: string[] = [];
  const P = (s: string) => e.push(`${m.id}: ${s}`);
  // 1) ID 중복(종류가 달라도 한 임무 안에서는 하나의 이름공간)
  const seen = new Map<string, string>();
  const add = (kind: string, id: string) => { const was = seen.get(id); if (was) P(`중복 ID ${id} (${was}, ${kind})`); else seen.set(id, kind); };
  for (const s of m.segments) add('segment', s.id);
  for (const d of m.devices) add('device', d.id);
  for (const o of m.objectives) add('objective', o.id);
  for (const c of m.checkpoints) add('checkpoint', c.id);
  const units = new Map<string, string>();   // unit id → encounter id
  for (const en of m.encounters) {
    add('encounter', en.id);
    for (const w of en.waves) for (const u of w.units) { add('unit', u.id); units.set(u.id, en.id); }
    for (const s of en.support ?? []) { add('unit', s.unit.id); units.set(s.unit.id, en.id); }
  }
  const segs = new Map(m.segments.map((s) => [s.id, s]));
  const devs = new Map(m.devices.map((d) => [d.id, d]));
  const objs = new Map(m.objectives.map((o) => [o.id, o]));
  const encs = new Map(m.encounters.map((x) => [x.id, x]));
  const cps = new Map(m.checkpoints.map((c) => [c.id, c]));
  // 2) 참조
  for (const o of m.objectives) {
    for (const r of o.requires) if (!objs.has(r)) P(`목표 ${o.id}의 선행 ${r} 없음`);
    if (['restore', 'retrieve', 'exit', 'crate'].includes(o.kind) && (!o.device || !devs.has(o.device))) P(`목표 ${o.id}의 장치 ${o.device ?? '(없음)'} 없음`);
    const giantTarget = !!m.boss?.giant && o.target === m.boss.unit;
    if (o.kind === 'defeat' && (!o.target || (!units.has(o.target) && !giantTarget))) P(`목표 ${o.id}의 대상 ${o.target ?? '(없음)'} 없음`);
    if (o.kind === 'clear' && (!o.encounter || !encs.has(o.encounter))) P(`목표 ${o.id}의 출현 ${o.encounter ?? '(없음)'} 없음`);
    if (o.checkpoint && !cps.has(o.checkpoint)) P(`목표 ${o.id}의 체크포인트 ${o.checkpoint} 없음`);
    if (o.optional && m.objectives.some((x) => x.requires.includes(o.id))) P(`선택 목표 ${o.id}를 다른 목표가 선행으로 요구`);
  }
  for (const d of m.devices) {
    for (const g of d.guards ?? []) if (!units.has(g)) P(`장치 ${d.id}의 경계 적 ${g} 없음`);
    if (d.clearFirst && !encs.has(d.clearFirst)) P(`장치 ${d.id}의 선행 출현 ${d.clearFirst} 없음`);
    if (!(d.radius > 0)) P(`장치 ${d.id} 반지름`);
    if (d.paintNeed !== undefined && (d.paintNeed < 0 || d.paintNeed > 1)) P(`장치 ${d.id} 도색률 ${d.paintNeed}`);
    if (!m.segments.some((s) => inRect(s.bounds, d.at, 1))) P(`장치 ${d.id}가 어느 구간에도 없음`);
  }
  for (const en of m.encounters) {
    const seg = segs.get(en.segment);
    if (!seg) P(`출현 ${en.id}의 구간 ${en.segment} 없음`);
    for (const r of en.requires ?? []) if (!objs.has(r)) P(`출현 ${en.id}의 선행 ${r} 없음`);
    if (en.requiresActive && !objs.has(en.requiresActive)) P(`출현 ${en.id}의 활성 조건 ${en.requiresActive} 없음`);
    if (!(en.maxActive > 0)) P(`출현 ${en.id} 동시 상한`);
    if (!en.waves.length) P(`출현 ${en.id}에 웨이브 없음`);
    for (const w of en.waves) {
      if (!w.units.length) P(`출현 ${en.id}/${w.id}에 적 없음`);
      if (w.units.length > en.maxActive) P(`출현 ${en.id}/${w.id}가 동시 상한 ${en.maxActive}를 넘음`);
      for (const u of w.units) {
        if (!ENEMY_ROLES[u.role]) P(`알 수 없는 적 ${u.role} (${u.id})`);
        if (seg && !inRect(seg.bounds, u.at, 1)) P(`적 ${u.id}가 구간 ${seg.id} 밖`);
      }
    }
    for (const s of en.support ?? []) {
      if (!ENEMY_ROLES[s.unit.role]) P(`알 수 없는 지원 적 ${s.unit.role}`);
      if (!(s.hpBelow > 0 && s.hpBelow < 1)) P(`지원 ${s.unit.id} 체력 경계 ${s.hpBelow}`);
    }
  }
  for (const c of m.checkpoints) {
    for (const r of c.resets) if (!encs.has(r)) P(`체크포인트 ${c.id}의 출현 ${r} 없음`);
    for (const r of c.after ?? []) if (!objs.has(r)) P(`체크포인트 ${c.id}의 선행 ${r} 없음`);
    if (c.area && !inRect(c.area, c.at, 0.5)) P(`도착형 체크포인트 ${c.id}의 위치가 영역 밖`);
    if (!c.area && !m.objectives.some((o) => o.checkpoint === c.id)) P(`체크포인트 ${c.id}를 켜는 목표·도착 영역 없음`);
  }
  // 3) 선행 순환
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string, path: string[]): void => {
    const st = state.get(id);
    if (st === 2) return;
    if (st === 1) { P(`선행 순환 ${[...path, id].join(' → ')}`); return; }
    state.set(id, 1);
    for (const r of objs.get(id)?.requires ?? []) visit(r, [...path, id]);
    state.set(id, 2);
  };
  for (const o of m.objectives) visit(o.id, []);
  // 필수 목표가 하나 이상, 마지막 필수 목표는 출구·단말류
  if (!m.objectives.some((o) => !o.optional)) P('필수 목표 없음');
  if (m.boss && !m.boss.giant && !units.has(m.boss.unit)) P(`보스 유닛 ${m.boss.unit} 없음`);
  if (m.boss?.giant && units.has(m.boss.unit)) P(`거대 보스 ${m.boss.unit}가 출현 묶음에도 있음`);
  for (const t of m.boss?.transmitters ?? []) if (objs.get(t)?.kind !== 'restore') P(`송신기 목표 ${t}가 복구 목표가 아님`);
  for (const t of m.boss?.relocateOn ?? []) if (!objs.has(t)) P(`거점 이동 목표 ${t} 없음`);
  for (const z of m.boss?.safeZones?.zones ?? []) if (!units.has(z.sprinkler)) P(`안전 원의 살수 장치 ${z.sprinkler} 없음`);
  for (const r of m.boss?.giant?.rings ?? []) { if (!devs.has(r.device)) P(`제어 고리 장치 ${r.device} 없음`); if (!(r.at >= 0 && r.at < 1)) P(`제어 고리 ${r.device} 경계 ${r.at}`); }
  if (m.boss?.giant?.from && !objs.has(m.boss.giant.from)) P(`거대 보스 시작 목표 ${m.boss.giant.from} 없음`);
  // 3.5) 레벨 액션 장치(분수·잉크통·스위치): 잉크통 상한·연결·위치
  if (m.actionDevices) {
    for (const x of validateDevices(m.actionDevices)) P(`액션 장치: ${x}`);
    for (const d of m.actionDevices) if (!m.segments.some((s) => inRect(s.bounds, d.at, 1))) P(`액션 장치 ${d.id}가 어느 구간에도 없음`);
  }
  // 4) 보상
  const rw = m.reward;
  for (const id of rw.firstSet ?? []) if (!MODULES[id] || MODULES[id].signature) P(`첫 세트 모듈 ${id}가 기본 설계가 아님`);
  if (rw.signature && !MODULES[rw.signature]?.signature) P(`서명 ${rw.signature} 없음`);
  if (rw.kind === 'boss' && !rw.signature) P('보스 임무에 확정 서명 없음');
  if (rw.record && !ALL_RECORDS.some((r) => r.id === rw.record)) P(`선택 기록 ${rw.record} 없음`);
  if (rw.record && !m.objectives.some((o) => o.kind === 'crate')) P('선택 기록이 있는데 선택 상자 없음');
  for (const u of rw.unlocks) { if (!known.includes(u)) P(`해금 대상 ${u} 없음`); if (u === m.id) P('자기 자신을 해금'); }
  return e;
}

// 전체 정의 검사: 각 임무 + 해금 순환 + 추첨 확률 합계
export function validateAll(missions: readonly MissionDefinition[] = MISSIONS, known: readonly string[] = ALL_MISSION_IDS): string[] {
  const e: string[] = [];
  const ids = new Set<string>();
  for (const m of missions) { if (ids.has(m.id)) e.push(`임무 ID 중복 ${m.id}`); ids.add(m.id); e.push(...validateMission(m, known)); }
  // 해금 그래프 순환(같은 임무로 돌아오는 해금)
  const next = new Map(missions.map((m) => [m.id, m.reward.unlocks]));
  for (const m of missions) {
    const stack = [...m.reward.unlocks], seen = new Set<string>();
    while (stack.length) { const x = stack.pop()!; if (x === m.id) { e.push(`해금 순환 ${m.id}`); break; } if (seen.has(x)) continue; seen.add(x); stack.push(...(next.get(x) ?? [])); }
  }
  const sum = GRADE_ODDS.reduce((s, [, p]) => s + p, 0);
  if (Math.abs(sum - 1) > 1e-9) e.push(`등급 확률 합계 ${sum}`);
  return e;
}
