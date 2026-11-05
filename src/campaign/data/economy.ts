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
export const UPGRADE_UNLOCK_MISSION = ['2-3', '4-3', '6-3'] as const;   // 위 장 보스 임무(첫 완료가 해금)
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

// 기본 설계 제작 해금(26번 7절): 시작 지역 4개 설계는 처음부터, 나머지 8개는 각 지역 첫 임무의 첫 완료로 연다.
// 26·28번은 지역별 설계 목록을 정하지 않아 지역 성격(28번 3절)에 맞춰 배정했다(33번 T048 근거 참고).
export const START_DESIGNS = ['AD01', 'TK01', 'BD01', 'BD04'] as const;
export const DESIGN_UNLOCK: Readonly<Record<string, readonly string[]>> = {
  '2-1': ['AD03', 'AD02'],   // 크로스로드: 장치·약점
  '3-1': ['AD04', 'TK04'],   // 켈프라인: 기절 창·스페셜 순환
  '4-1': ['TK02', 'TK03'],   // 할야드: 잠수 보충·보조 무기
  '5-1': ['BD03'],           // 솔트팬: 재정비
  '6-1': ['BD02'],           // 록게이트: 이동
};

// 주 무기 해금(2번 5·6절): 기본 3종, 2·3·4장 진입 임무의 첫 완료가 각각 3종을 확정 해금한다(무작위 아님)
export const START_WEAPONS = ['shooter', 'roller', 'charger'] as const;
export const WEAPON_UNLOCK: Readonly<Record<string, readonly string[]>> = {
  '2-1': ['twins', 'brush', 'brolly'],
  '3-1': ['blaster', 'bow', 'bucket'],
  '4-1': ['spinner', 'blade', 'mitts'],
};
