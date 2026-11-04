// 경직·넉백·스태거(35번 R020)의 수치와 적 한 명의 버팀(poise) 상태이다. 순수 상태이며 행동 정지·연출은 combat.ts가 한다.
// 피해의 60%가 poise 피해이고 0이 되면 0.7초 스태거(행동 불가, 받는 피해 1.3배)이다. 스태거가 끝나면 poise가 가득
// 차고 3초 면역이다(면역 중에는 poise가 줄지 않아 "무한 경직"이 없다). 정예·대장은 스태거 때 약점이 2초 노출된다.
// 회복: 마지막 poise 피해 후 regenDelay초가 지나면 초당 최대치의 regenPerS 비율로 찬다(2번·24번에 값이 없어 이 문서의 초기값).
export type EnemyRole = 'gunner' | 'watcher' | 'mortar' | 'painter' | 'shield';
export type EnemyTier = 'grunt' | 'elite' | 'captain';

export const STAGGER = {
  poise: { gunner: 40, watcher: 35, mortar: 55, painter: 60, shield: 80 } as Record<EnemyRole, number>,
  tierMul: { grunt: 1, elite: 2.5, captain: 4 } as Record<EnemyTier, number>,
  poiseShare: 0.6, duration: 0.7, damageMul: 1.3, immunity: 3.0, weakExpose: 2.0,
  knockback: 0.25, knockbackShield: 0.1, knockbackTime: 0.12,
  regenDelay: 1.0, regenPerS: 0.5,
} as const;

// 기존 무기 종류 → 캠페인 병종(33번 T026 전에는 대전 봇을 이 표로 병종에 대응시켜 미리 본다)
export function roleOfWeapon(kind: string): EnemyRole {
  switch (kind) {
    case 'charger': case 'bow': return 'watcher';
    case 'blaster': case 'bucket': return 'mortar';
    case 'roller': case 'brush': return 'painter';
    case 'brolly': return 'shield';
    default: return 'gunner';
  }
}

export type StaggerEvent = 'stagger' | null;

export class Poise {
  declare max: number; declare value: number; declare tier: EnemyTier; declare role: EnemyRole;
  declare staggerLeft: number; declare immuneLeft: number; declare sinceHit: number; declare exposeLeft: number;

  constructor(role: EnemyRole, tier: EnemyTier = 'grunt') {
    this.role = role; this.tier = tier;
    this.max = STAGGER.poise[role] * STAGGER.tierMul[tier];
    this.value = this.max; this.staggerLeft = 0; this.immuneLeft = 0; this.sinceHit = 99; this.exposeLeft = 0;
  }

  get staggered(): boolean { return this.staggerLeft > 0; }
  // 받는 피해 배율(스태거 중 1.3배)
  damageMul(): number { return this.staggered ? STAGGER.damageMul : 1; }
  knockback(): number { return this.role === 'shield' ? STAGGER.knockbackShield : STAGGER.knockback; }

  // 실제로 들어간 피해(배율 적용 후)를 받는다. 이번 피해로 스태거가 시작되면 'stagger'
  hit(damage: number): StaggerEvent {
    if (this.staggered || this.immuneLeft > 0 || !(damage > 0)) return null;
    this.sinceHit = 0;
    this.value -= damage * STAGGER.poiseShare;
    if (this.value > 0) return null;
    this.value = 0;
    this.staggerLeft = STAGGER.duration;
    if (this.tier !== 'grunt') this.exposeLeft = STAGGER.weakExpose;
    return 'stagger';
  }

  // 반환: 이번 프레임에 스태거가 끝났으면 true
  update(dt: number): boolean {
    this.exposeLeft = Math.max(0, this.exposeLeft - dt);
    if (this.staggerLeft > 0) {
      this.staggerLeft -= dt;
      if (this.staggerLeft > 0) return false;
      this.staggerLeft = 0; this.value = this.max; this.immuneLeft = STAGGER.immunity;
      return true;
    }
    this.immuneLeft = Math.max(0, this.immuneLeft - dt);
    this.sinceHit += dt;
    if (this.sinceHit > STAGGER.regenDelay) this.value = Math.min(this.max, this.value + this.max * STAGGER.regenPerS * dt);
    return false;
  }

  reset(): void { this.value = this.max; this.staggerLeft = 0; this.immuneLeft = 0; this.sinceHit = 99; this.exposeLeft = 0; }
}
