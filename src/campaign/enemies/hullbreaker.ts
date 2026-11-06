// 캠페인 솔로 HULLBREAKER(3-3 껍질 속의 명령, 33번 T055·기획 11번 6절). 기존 보스(src/boss/*.js)의 모델·동작·위험 판정을
// 그대로 쓰고, 기술 선택과 소형 게 출현만 이 하위 클래스가 제한한다(보스 모드의 BossBrain·체력 공식은 바꾸지 않는다).
//   1단계(100~66%): 강타·통 낙하 / 2단계(66~33%): + 돌진(벽 충돌 뒤 기절, 배 약점이 내려온다) /
//   3단계(33% 이하): + 소형 게(동시 최대 3, 임무 전체 최대 6). 광선(sweep)·회전(frenzy)은 쓰지 않는다.
// 단계 간격은 기존 PACE(3단계가 조금 빠르다)를 따른다. 체력은 솔로 18,000 × 난이도 배율이다.
import { G, emit } from '../../core/ctx.js';
import { Boss } from '../../boss/boss.js';
import { BossBrain } from '../../boss/bossBrain.js';
import type { Match } from '../../game/match.js';

export const SOLO_HULL = {
  hp: 18000,
  moves: { 1: ['slam', 'barrage'], 2: ['slam', 'barrage', 'charge'], 3: ['slam', 'barrage', 'charge', 'crablets'] } as Record<number, string[]>,
  // 7-3 파도껍질: 1 강타·통·돌진 / 2 + 광선·소형 게 / 3 + 회전(공격 간격은 기존 PACE)
  final: { 1: ['slam', 'barrage', 'charge'], 2: ['slam', 'barrage', 'charge', 'sweep', 'crablets'], 3: ['slam', 'barrage', 'charge', 'sweep', 'crablets', 'frenzy'] } as Record<number, string[]>,
  crabAlive: 3,
  crabTotal: 6,
};

type ChooseTarget = Parameters<BossBrain['_choose']>[0];

export class SoloHullBrain extends BossBrain {
  declare crabSpawned: number; declare profile: Record<number, string[]>;
  constructor(boss: Boss, profile: Record<number, string[]> = SOLO_HULL.moves) { super(boss); this.crabSpawned = 0; this.profile = profile; }

  override _choose(t: ChooseTarget): ReturnType<BossBrain['_choose']> {
    const allow = this.profile[Math.min(3, Math.max(1, this.b.phase))];
    for (let i = 0; i < 8; i++) {
      const p = super._choose(t);
      if (!allow.includes(p.id)) continue;
      if (p.id === 'crablets' && this.crabSpawned >= SOLO_HULL.crabTotal) continue;
      return p;
    }
    this.force = 'barrage';
    return super._choose(t);
  }

  override _spawnCrabs(n: number): void {
    const alive = [...this.b.crabs.values()].filter((c: { dead?: boolean }) => !c.dead).length;
    const k = Math.max(0, Math.min(n, SOLO_HULL.crabAlive - alive, SOLO_HULL.crabTotal - this.crabSpawned));
    this.crabSpawned += k;
    if (k > 0) super._spawnCrabs(k);
  }
}

const DIFF: Record<string, string> = { story: 'easy', normal: 'normal', hard: 'hard' };

// 캠페인 세션이 부른다(세션은 경기를 좁힌 형식으로 갖고 실제 객체는 Match이다). 지정 자리에 세우고 G.boss로 등록한다(무기·특수의 보스 판정이 G.boss를 본다). 정리는 disposeGiant.
export function spawnSoloHull(match: unknown, o: { difficulty: string; at: readonly [number, number, number]; yaw: number; hpMul?: number; hp?: number; profile?: 'kelp' | 'final' }): Boss {
  const b = new Boss(match as Match, { maxHp: Math.round((o.hp ?? SOLO_HULL.hp) * (o.hpMul ?? 1)), difficulty: DIFF[o.difficulty] ?? 'normal', sim: true });
  b.brain = new SoloHullBrain(b, o.profile === 'final' ? SOLO_HULL.final : SOLO_HULL.moves);
  const y = b.nav.floorAt(o.at[0], o.at[2]);
  b.pos.set(o.at[0], Number.isFinite(y) ? y : o.at[1], o.at[2]);
  b.yaw = o.yaw; b.home = { x: o.at[0], z: o.at[2] };
  b.model.root.position.copy(b.pos); b.model.root.rotation.y = b.yaw;
  // 체력 하한(7-3 제어 고리): 한 번의 큰 피해도 하한 아래로 내리지 못한다(하한 0이면 제한 없음). 피해 적용 지점에서 막아야
  // 프레임 사이의 큰 한 방으로 고리를 끊기 전에 쓰러지는 진행 막힘이 없다.
  const apply = b.applyDamage.bind(b);
  const floored = b as Boss & { floorHp: number };
  floored.floorHp = 0;
  b.applyDamage = (atk: unknown, d: number, weak: boolean, point: unknown) => apply(atk, Math.min(d, Math.max(0, b.hp - floored.floorHp)), weak, point);
  G.boss = b;
  emit('boss:spawn', { boss: b });
  return b;
}

export function setGiantFloor(b: Boss, hp: number): void { (b as Boss & { floorHp: number }).floorHp = hp; }

export function disposeGiant(b: Boss | null): void {
  if (!b) return;
  b.dispose();
  if (G.boss === b) G.boss = null;
}
