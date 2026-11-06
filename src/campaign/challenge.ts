// 엔딩 뒤 반복 플레이(33번 T068, 2번 11.2절·28번): 도전 임무·무기별 공략 기록·엔딩 해금.
// 순수 모듈이다(DOM·저장 API 없음). 도전은 기존 21개 임무 중 고른 전투에 최대 두 가지 변형(적 조합 추가·목표 순서 변경)을
// 적용한다. 새 보스 패턴·새 지형·무한 레벨·매일 숙제·필수 파밍 입장 제한은 만들지 않는다.
// 보상은 재료(부품)·외형 표식·개인 기록이며 첫 완료 보상(경험치·모듈·해금·기록)을 다시 주지 않는다.
// 검사: tests/client/challenge.test.ts.
import type { EnemyRoleId, MissionDefinition, UnitDef } from './data/types.js';
import type { CampaignSave } from './save.js';

export type ChallengeVariant =
  | { kind: 'addUnit'; role: EnemyRoleId }             // 일반 적 묶음의 첫 웨이브마다 이 병종 한 명을 더한다
  | { kind: 'reorder'; order: readonly string[] };     // 목표 순서를 바꾼다(나열한 목표가 이 순서로 이어진다)

export interface ChallengeDef { id: string; mission: string; title: string; variants: readonly ChallengeVariant[]; mark: string; parts: number }

export const CHALLENGE_LIMIT = { variants: 2 } as const;
export const ENDING_MISSION = '7-3';

// 장마다 하나(일반 임무 n-1). 변형은 2번 11.2절의 예(도색병 추가·중계기 순서 변경, 방패병 지원 조합)를 따른다.
export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'ch.1-1', mission: '1-1', title: '거꾸로 도는 시계', variants: [{ kind: 'reorder', order: ['o-b', 'o-a'] }, { kind: 'addUnit', role: 'painter' }], mark: 'mark.clock', parts: 40 },
  { id: 'ch.2-1', mission: '2-1', title: '닫힌 가판대의 방패', variants: [{ kind: 'addUnit', role: 'shield' }, { kind: 'addUnit', role: 'painter' }], mark: 'mark.stall', parts: 40 },
  { id: 'ch.3-1', mission: '3-1', title: '떨어지는 화물', variants: [{ kind: 'addUnit', role: 'mortar' }], mark: 'mark.cargo', parts: 40 },
  { id: 'ch.4-1', mission: '4-1', title: '끊긴 계류선의 사수', variants: [{ kind: 'addUnit', role: 'watcher' }, { kind: 'addUnit', role: 'gunner' }], mark: 'mark.rope', parts: 40 },
  { id: 'ch.5-1', mission: '5-1', title: '마른 밭의 도색', variants: [{ kind: 'addUnit', role: 'painter' }, { kind: 'addUnit', role: 'mortar' }], mark: 'mark.salt', parts: 40 },
  { id: 'ch.6-1', mission: '6-1', title: '물길의 방패', variants: [{ kind: 'addUnit', role: 'shield' }], mark: 'mark.lock', parts: 40 },
  { id: 'ch.7-1', mission: '7-1', title: '가장 높은 사선', variants: [{ kind: 'addUnit', role: 'gunner' }, { kind: 'addUnit', role: 'shield' }], mark: 'mark.terrace', parts: 40 },
];
export const getChallenge = (id: string): ChallengeDef | null => CHALLENGES.find((c) => c.id === id) ?? null;

// 엔딩·도전 해금: 7-3 첫 완료(저장의 done)에서 파생한다 — 따로 저장하지 않아 두 번 저장될 수 없다
export const endingUnlocked = (s: Pick<CampaignSave, 'done'> | null | undefined): boolean => !!s && s.done.includes(ENDING_MISSION);

export function validateChallenge(c: ChallengeDef, m: MissionDefinition | null): string[] {
  const e: string[] = [];
  if (!m) return [`${c.id}: 임무 ${c.mission} 없음`];
  if (c.variants.length < 1 || c.variants.length > CHALLENGE_LIMIT.variants) e.push(`${c.id}: 변형 ${c.variants.length}개(1~${CHALLENGE_LIMIT.variants})`);
  for (const v of c.variants) if (v.kind === 'reorder') {
    const ids = new Set(m.objectives.map((o) => o.id));
    for (const id of v.order) if (!ids.has(id)) e.push(`${c.id}: 순서 목표 ${id} 없음`);
    if (v.order.length < 2) e.push(`${c.id}: 순서 변경은 목표 둘 이상`);
  }
  if (c.parts <= 0 || c.parts > 100) e.push(`${c.id}: 재료 ${c.parts}`);
  return e;
}

// 임무 정의에 변형을 적용한 새 정의(원본은 바꾸지 않는다). 선택 상자는 뺀다(도전 보상은 재료·표식·기록만).
export function applyChallenge(src: MissionDefinition, c: ChallengeDef): MissionDefinition {
  const m: MissionDefinition = JSON.parse(JSON.stringify(src));
  const crates = new Set(m.objectives.filter((o) => o.kind === 'crate').map((o) => o.id));
  const crateDevs = new Set(m.objectives.filter((o) => o.kind === 'crate').map((o) => o.device));
  m.objectives = m.objectives.filter((o) => !crates.has(o.id)).map((o) => ({ ...o, requires: o.requires.filter((r) => !crates.has(r)) }));
  m.devices = m.devices.filter((d) => !crateDevs.has(d.id));
  m.reward = { ...m.reward, firstSet: undefined, record: undefined };
  for (const v of c.variants) {
    if (v.kind === 'addUnit') {
      for (const enc of m.encounters) {
        const w = enc.waves[0], lead = w?.units[0];
        if (!lead || isLeader(lead.role) || enc.support?.length) continue;   // 정예·대장 묶음은 그대로(새 보스 패턴 없음)
        const n = w.units.filter((u) => u.id.startsWith(`${enc.id}-x`)).length;
        const u: UnitDef = { id: `${enc.id}-x${n + 1}`, role: v.role, at: [lead.at[0] + 1.2, lead.at[1], lead.at[2] + 0.6], ...(lead.yaw !== undefined ? { yaw: lead.yaw } : {}) };
        w.units = [...w.units, u];
        enc.maxActive = Math.max(enc.maxActive, w.units.length);   // 도전은 동시 압박을 한 명 늘린다
      }
    } else {
      const order = v.order, set = new Set(order);
      const ext = [...new Set(m.objectives.filter((o) => set.has(o.id)).flatMap((o) => o.requires.filter((r) => !set.has(r))))];
      const last = order[order.length - 1];
      m.objectives = m.objectives.map((o) => {
        const i = order.indexOf(o.id);
        if (i === 0) return { ...o, requires: ext };
        if (i > 0) return { ...o, requires: [order[i - 1]] };
        return o.requires.some((r) => set.has(r)) ? { ...o, requires: [...new Set(o.requires.map((r) => (set.has(r) ? last : r)))] } : o;
      });
      // 목록 순서도 새 순서로(HUD가 앞 목표부터 보여 준다)
      const pos = m.objectives.map((o) => o.id).filter((id) => set.has(id)).map((id) => m.objectives.findIndex((o) => o.id === id)).sort((a, b) => a - b);
      const byId = new Map(m.objectives.map((o) => [o.id, o]));
      const next = m.objectives.slice();
      pos.forEach((p, k) => { next[p] = byId.get(order[k])!; });
      m.objectives = next;
    }
  }
  return m;
}
const isLeader = (r: EnemyRoleId): boolean => !['gunner', 'painter', 'shield', 'watcher', 'mortar', 'sprinkler'].includes(r);

// 무기별 공략 기록: 그 무기로 끝낸 임무 id(중복 없이)
export function logWeapon(log: Readonly<Record<string, string[]>>, weapon: string | null | undefined, missionId: string): Record<string, string[]> {
  if (!weapon) return { ...log };
  const cur = log[weapon] ?? [];
  return cur.includes(missionId) ? { ...log } : { ...log, [weapon]: [...cur, missionId] };
}

export interface ChallengeResult { completionId: string; challenge: string; parts: number; mark: string | null; ms: number; best: number; clears: number }
export type ChallengeOutcome = { save: CampaignSave; result: ChallengeResult; repeated: boolean } | { reject: 'rejected'; reason: string };

// 도전 기록(저장 challenges[id]): 완료 횟수·개인 최고 기록·마지막 결과(같은 처리 ID 재시도는 그대로 돌려준다)
export interface ChallengeRecord { clears: number; bestMs: number; last: ChallengeResult | null }

// 도전 완료의 단일 저장 처리(T030과 같은 처리 ID 규칙). 첫 완료 보상·해금·기록·모듈은 주지 않는다.
export function completeChallenge(save: CampaignSave, inp: { completionId: string; challenge: ChallengeDef; ms: number; weapon?: string | null }): ChallengeOutcome {
  const c = inp.challenge;
  const old = save.challenges[c.id];
  if (old?.last?.completionId === inp.completionId) return { save, result: old.last, repeated: true };
  if (!endingUnlocked(save)) return { reject: 'rejected', reason: '엔딩 뒤에 열린다' };
  const clears = (old?.clears ?? 0) + 1;
  const best = Math.min(old?.bestMs ?? Infinity, Math.max(0, Math.round(inp.ms)));
  const mark = save.marks.includes(c.mark) ? null : c.mark;
  const result: ChallengeResult = { completionId: inp.completionId, challenge: c.id, parts: c.parts, mark, ms: Math.round(inp.ms), best, clears };
  return {
    save: {
      ...save,
      inventory: { ...save.inventory, parts: save.inventory.parts + c.parts },
      challenges: { ...save.challenges, [c.id]: { clears, bestMs: best, last: result } },
      marks: mark ? [...save.marks, mark] : save.marks,
      weaponLog: logWeapon(save.weaponLog, inp.weapon, c.mission),
    },
    result, repeated: false,
  };
}
