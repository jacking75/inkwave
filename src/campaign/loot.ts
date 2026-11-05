// 추첨·보장·상자 중복 방지(33번 T031, 28번 4·6절). 무작위 결과는 시드·추첨 순번·출처 ID로 고정한다.
//   - 같은 미완료 임무 시도의 같은 상자는 몇 번을 다시 열어도(실패·새로고침·체크포인트) 같은 결과이며 보장 횟수를 다시 늘리지 않는다.
//   - 등급 70/25/5, 9회 연속 특제가 없으면 다음 추첨은 특제. 상자를 연 순서대로 계산하고 완료 모듈은 마지막이다.
//   - 1-1 기본 세트·보스 확정 서명은 보장 횟수를 늘리거나 초기화하지 않는다.
// 순수 모듈이다. 검사: tests/client/loot.test.ts.
import { GRADE_ODDS, PITY_LIMIT, type Grade } from './data/economy.js';
import { BASIC_IDS, MODULES, REGION_POOL, REGION_SIGNATURE, type StatLine } from './data/modules.js';
import type { RegionId } from './data/types.js';

// 결정적 32비트 해시 → [0,1). 같은 (seed, key)는 늘 같은 값이다.
export function hashUnit(seed: number, key: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; }
  return (h >>> 0) / 4294967296;
}

// 미확정 모듈(아직 저장되지 않은 추첨 결과)
export interface RolledModule { source: string; defId: string; grade: Grade; sub: StatLine | null }

// 미완료 임무 시도의 추첨 기록(저장에 둔다: 포기해도 재추첨 방지에 남는다)
export interface AttemptLoot {
  missionId: string;
  seed: number;
  pityStart: number;                         // 이 시도를 시작할 때의 연속 미획득 횟수(확정 상태)
  rolls: Array<{ source: string; result: RolledModule }>;   // 연 순서대로
}

export function newAttempt(missionId: string, seed: number, pity: number): AttemptLoot {
  return { missionId, seed: seed >>> 0, pityStart: pity, rolls: [] };
}

// 지금까지 연 결과를 반영한 연속 미획득 횟수(미확정)
export function pityAfter(at: AttemptLoot): number {
  let p = at.pityStart;
  for (const r of at.rolls) p = r.result.grade === 'special' ? 0 : p + 1;
  return p;
}

// 등급 하나(보장 포함)
export function rollGrade(u: number, pity: number): Grade {
  if (pity >= PITY_LIMIT) return 'special';
  let acc = 0;
  for (const [g, p] of GRADE_ODDS) { acc += p; if (u < acc) return g; }
  return 'common';
}

// 한 번의 무작위 모듈 추첨(출처 ID 단위로 결정적). 이미 같은 출처를 열었다면 그 결과를 돌려주고 기록을 늘리지 않는다.
export function rollSource(at: AttemptLoot, source: string, region: RegionId): RolledModule {
  const had = at.rolls.find((r) => r.source === source);
  if (had) return had.result;
  const k = `${at.missionId}|${source}|${at.rolls.length}`;
  const grade = rollGrade(hashUnit(at.seed, k + '|g'), pityAfter(at));
  let defId: string;
  if (grade === 'special') defId = REGION_SIGNATURE[region];
  else defId = BASIC_IDS[Math.floor(hashUnit(at.seed, k + '|d') * BASIC_IDS.length) % BASIC_IDS.length];
  let sub: StatLine | null = null;
  if (grade !== 'common') {
    const base = MODULES[defId].base.key;
    const pool = REGION_POOL[region].filter((s) => s.key !== base);   // 기본 옵션과 같은 항목은 고르지 않는다
    sub = pool.length ? { ...pool[Math.floor(hashUnit(at.seed, k + '|s') * pool.length) % pool.length] } : null;
  }
  const result: RolledModule = { source, defId, grade, sub };
  at.rolls.push({ source, result });
  return result;
}

// 보스 첫 완료 확정 서명(보장 횟수와 무관)
export function signatureCard(sigId: string): RolledModule {
  const d = MODULES[sigId];
  return { source: 'signature', defId: sigId, grade: 'special', sub: d.signature ? { ...d.signature.recommended } : null };
}
// 1-1 첫 완료 기본 세트(일반 +0, 보장 횟수와 무관)
export function basicCard(defId: string): RolledModule { return { source: 'firstSet', defId, grade: 'common', sub: null }; }
