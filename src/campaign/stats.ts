// 캠페인 능력치 합산(33번 T027·T033, 27번 6절). 기본값 + 레벨 + 장착 카드 + 특성 → 적용값과 상한. 순수 계산이며
// 대전용 전역 상수(PLAYER·WEAPONS)를 바꾸지 않는다. 세션이 이 결과를 캠페인 플레이어의 튜닝 복사본·전투 훅에만 넣는다.
// 검사: tests/client/growth.test.ts.
import { GROWTH_CAP, LEVEL_STEP } from './data/economy.js';
import type { StatKey } from './data/modules.js';
import { TRAITS } from './data/traits.js';
import { cardLines, type ModuleCard } from './inventory.js';
import type { TraitAlloc } from './growth.js';

export interface StatSheet {
  // 표시 합계(상한 전, %) — 카드·특성에 적힌 값을 그대로 더한 것
  raw: Partial<Record<StatKey | 'refillDelay' | 'exitGuard', number>>;
  // 적용값
  hpMax: number; inkMax: number;            // 기본 100 기준 가산
  runMul: number; swimMul: number;          // 1 + min(합계, 10%)
  mainInkMul: number; subInkMul: number;    // 1 - min(합계, 15%)
  swimRefillMul: number; refillMul: number; regenMul: number; specialChargeMul: number; enemyInkChargeMul: number; paintWidthMul: number;
  weakBonus: number; deviceBonus: number; stunBossBonus: number;   // 추가 피해 비율(최종 계수는 damageMul로 1.35 상한)
  objectiveGuard: number; exitGuard: number; dmgTaken: number;    // %
  refillDelay: number;                      // s 감소
  subSwimBurst: number;                     // % (SG06)
  capped: Array<'run' | 'swim' | 'mainInk' | 'subInk'>;
}

export function computeStats(level: number, cards: readonly ModuleCard[], traits: TraitAlloc, base = { hp: 100, ink: 100 }): StatSheet {
  const raw: StatSheet['raw'] = {};
  const add = (k: keyof StatSheet['raw'], v: number) => { raw[k] = (raw[k] ?? 0) + v; };
  for (const c of cards) for (const l of cardLines(c)) add(l.key, l.value);
  for (const t of TRAITS) { const n = traits[t.id] ?? 0; if (n > 0) add(t.key, t.perRank * n); }
  const r = (k: keyof StatSheet['raw']) => raw[k] ?? 0;
  const capped: StatSheet['capped'] = [];
  const cap = (v: number, c: number, tag: StatSheet['capped'][number]) => { if (v > c) { capped.push(tag); return c; } return v; };
  const L = Math.max(1, level) - 1;
  return {
    raw,
    // 레벨·장비 용량 보정은 기본값 기준으로 더한다(곱셈 중첩 없음)
    hpMax: base.hp * (1 + (LEVEL_STEP.hp * L) / 100),
    inkMax: base.ink * (1 + (LEVEL_STEP.ink * L + r('inkMax')) / 100),
    runMul: 1 + cap(r('runSpeed'), GROWTH_CAP.move, 'run') / 100,
    swimMul: 1 + cap(r('swimSpeed'), GROWTH_CAP.move, 'swim') / 100,
    mainInkMul: 1 - cap(r('mainInk'), GROWTH_CAP.inkSave, 'mainInk') / 100,
    subInkMul: 1 - cap(r('subInk'), GROWTH_CAP.inkSave, 'subInk') / 100,
    swimRefillMul: 1 + r('swimRefill') / 100, refillMul: 1 + r('refill') / 100, regenMul: 1 + r('regen') / 100,
    specialChargeMul: 1 + r('specialCharge') / 100, enemyInkChargeMul: 1 + r('enemyInkCharge') / 100, paintWidthMul: 1 + r('paintWidth') / 100,
    weakBonus: r('weak') / 100, deviceBonus: r('device') / 100, stunBossBonus: r('stunBoss') / 100,
    objectiveGuard: r('objectiveGuard'), exitGuard: r('exitGuard'), dmgTaken: r('dmgTaken'),
    refillDelay: r('refillDelay'),
    subSwimBurst: r('subSwimBurst'),
    capped,
  };
}

// 플레이어가 주는 피해 계수: 무기 기본 피해·약점 판정 뒤 추가 계수(현재 성립하는 보너스 합)를 1.35로 제한
export function damageDealtMul(s: StatSheet, tags: { weak?: boolean; device?: boolean; stunnedBoss?: boolean }): number {
  const bonus = (tags.weak ? s.weakBonus : 0) + (tags.device ? s.deviceBonus : 0) + (tags.stunnedBoss ? s.stunBossBonus : 0);
  return Math.min(GROWTH_CAP.damageMul, 1 + bonus);
}
// 플레이어가 받는 피해 계수: 현재 성립하는 감소와 불이익을 합산해 최대 20% 감소(불이익이 크면 증가)
export function damageTakenMul(s: StatSheet, ctx: { onObjective?: boolean; justLeftInk?: boolean }): number {
  const reduce = (ctx.onObjective ? s.objectiveGuard : 0) + (ctx.justLeftInk ? s.exitGuard : 0) - s.dmgTaken;
  return 1 - Math.min(GROWTH_CAP.damageReduce, reduce) / 100;
}
