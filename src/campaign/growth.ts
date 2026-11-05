// 레벨·특성점·특성 배분(33번 T033·T034, 27번 2·4절). 순수 계산이다. 검사: tests/client/growth.test.ts.
import { LEVEL_CAP, xpToNext } from './data/economy.js';
import { TRAITS, TRAIT_MAX_RANK, TRAIT_UNLOCK, type TraitLine } from './data/traits.js';

// 레벨 L 도달 누적 경험치(1 → 0, 2 → 200, … 20 → 12,350)
export const LEVEL_XP: readonly number[] = (() => {
  const t = [0, 0];
  for (let L = 1; L < LEVEL_CAP; L++) t.push(t[L] + xpToNext(L));
  return t;   // index = 레벨
})();
export const XP_CAP = LEVEL_XP[LEVEL_CAP];

export function levelOf(xp: number): number {
  let L = 1;
  while (L < LEVEL_CAP && xp >= LEVEL_XP[L + 1]) L++;
  return L;
}
// 누적 특성점: 짝수 레벨마다 1점(레벨 2 → 1, 20 → 10)
export const pointsAt = (level: number): number => Math.floor(level / 2);

export interface XpResult {
  granted: number;        // 보상으로 지급한 경험치(결과 카드의 "지급")
  applied: number;        // 상한 때문에 실제 레벨에 적용된 양
  overCap: number;        // 상한을 넘어 사라진 양(재료로 바꾸지 않는다)
  fromLevel: number; toLevel: number;
  pointsAdded: number;    // 새로 통과한 모든 짝수 레벨의 점수 합
  xp: number;             // 적용 후 누적 경험치
}
export function applyXp(xp: number, granted: number): XpResult {
  const before = Math.min(XP_CAP, Math.max(0, xp));
  const after = Math.min(XP_CAP, before + Math.max(0, granted));
  const fromLevel = levelOf(before), toLevel = levelOf(after);
  return { granted, applied: after - before, overCap: Math.max(0, granted) - (after - before), fromLevel, toLevel, pointsAdded: pointsAt(toLevel) - pointsAt(fromLevel), xp: after };
}

// ---- 특성 배분 -------------------------------------------------------------------------------------------------
export type TraitAlloc = Record<string, number>;   // 특성 id → 0..2

export function spentIn(alloc: TraitAlloc, line: TraitLine): number {
  return TRAITS.filter((t) => t.line === line).reduce((s, t) => s + (alloc[t.id] ?? 0), 0);
}
export function spentTotal(alloc: TraitAlloc): number { return Object.values(alloc).reduce((s, v) => s + (v | 0), 0); }

export type TraitDenied = 'unknown' | 'max' | 'points' | 'locked';
// 한 점 투자 가능 여부(earned = 레벨로 얻은 누적 점수)
export function canInvest(alloc: TraitAlloc, id: string, earned: number): TraitDenied | null {
  const t = TRAITS.find((x) => x.id === id);
  if (!t) return 'unknown';
  if ((alloc[id] ?? 0) >= TRAIT_MAX_RANK) return 'max';
  if (spentTotal(alloc) >= earned) return 'points';
  // 같은 계열의 다른 효과에 먼저 TRAIT_UNLOCK점(2·4)을 써야 열린다
  if (spentIn(alloc, t.line) - (alloc[id] ?? 0) < TRAIT_UNLOCK[t.tierIndex]) return 'locked';
  return null;
}
export function invest(alloc: TraitAlloc, id: string, earned: number): { alloc: TraitAlloc; denied: TraitDenied | null } {
  const d = canInvest(alloc, id, earned);
  if (d) return { alloc, denied: d };
  return { alloc: { ...alloc, [id]: (alloc[id] ?? 0) + 1 }, denied: null };
}
// 무료 재배분: 전부 되돌린다(점수는 레벨에서 다시 계산되므로 복제되지 않는다)
export function resetTraits(): TraitAlloc { return {}; }

// 저장에서 읽은 배분이 규칙을 지키는지(조작·구버전 방어): 어기면 비운다
export function sanitizeTraits(alloc: unknown, earned: number): TraitAlloc {
  if (!alloc || typeof alloc !== 'object') return {};
  let out: TraitAlloc = {};
  // 계열별로 tierIndex 순서대로 다시 투자해 선행 조건을 확인한다
  const want = alloc as Record<string, unknown>;
  for (const t of [...TRAITS].sort((a, b) => a.tierIndex - b.tierIndex)) {
    const n = Math.max(0, Math.min(TRAIT_MAX_RANK, Number(want[t.id]) | 0));
    for (let i = 0; i < n; i++) { const r = invest(out, t.id, earned); if (r.denied) return {}; out = r.alloc; }
  }
  return out;
}
