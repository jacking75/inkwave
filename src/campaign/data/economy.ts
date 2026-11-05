// 보상·성장·경제 수치(27·28번, 26번 6~7절)를 한 곳에 둔다. UI·전투·저장은 이 값을 읽고 중복해서 적지 않는다.

// 임무 완료 보상(28번 2절)
export const COMPLETION = {
  normal: { xp: 120, xpFirst: 480, parts: 40, partsFirst: 20, core: 0 },
  boss: { xp: 180, xpFirst: 420, parts: 60, partsFirst: 20, core: 1 },
  crate: { parts: 10 },
} as const;

// 등급 추첨(28번 4절)
export type Grade = 'common' | 'precise' | 'special';
export const GRADE_ODDS: ReadonlyArray<[Grade, number]> = [['common', 0.70], ['precise', 0.25], ['special', 0.05]];
export const PITY_LIMIT = 9;   // 9회 연속 특제가 없으면 다음 추첨은 특제

// 분해·제작·강화(26번 6~7절)
export const SALVAGE: Record<Grade, number> = { common: 5, precise: 10, special: 20 };
export const CRAFT = { basic: 40, signatureParts: 80, signatureCores: 1 } as const;
export const UPGRADE_COST = [50, 90, 140] as const;          // +1, +2, +3 단계 비용
export const UPGRADE_UNLOCK_CHAPTER = [2, 4, 6] as const;    // +1·+2·+3을 여는 장 보스
export const INVENTORY_SLOTS = 60;

// 성장(27번 2·4·6절)
export const LEVEL_CAP = 20;
export const xpToNext = (level: number): number => 150 + 50 * level;
export const LEVEL_STEP = { hp: 1, ink: 0.5 } as const;      // 레벨마다 기본 대비 %
export const GROWTH_CAP = {
  damageMul: 1.35,      // 성장에 따른 추가 피해 계수 상한
  damageReduce: 20,     // % 최대 감소
  move: 10,             // % 달리기·잠수 각각
  inkSave: 15,          // % 주 무기·보조 무기 각각
} as const;

// 난이도(37번 태스크·24번): 이야기는 적 피해 -25%, 예고 시간 증가. 목표·보상·해금은 같다.
export const DIFFICULTY = {
  story: { enemyDamage: 0.75, telegraph: 1.25 },
  normal: { enemyDamage: 1, telegraph: 1 },
} as const;
export type DifficultyId = keyof typeof DIFFICULTY;
