// 캠페인 핸들링 오버레이(35번 R016). 캠페인에서만 플레이어를 더 빠르고 가볍게 만든다. 전역 PLAYER는 바꾸지 않는다.
// Actor는 수치를 actor.tune에서 읽는다(기본은 PLAYER 그 자체). 캠페인 세션이 시작될 때 덮어쓴 복사본을 넣고 끝날 때
// PLAYER로 되돌린다(restoreTuning). 순수 계산이다(DOM·저장·네트워크 의존 없음).
//
// 합산 순서: PLAYER → 캠페인 오버레이 → 성장(33번 T027·T033의 배율) → 일시 효과(물결 단계·퍼펙트 잠수 버프)이다.
// 일시 효과의 이동 보너스는 성장 보너스와 합쳐 MOVE_BONUS_CAP을 넘지 않도록 물결 쪽부터 깎는다(2번 8.3절 공통 상한).
import { PLAYER } from '../config.js';

export type PlayerTuning = typeof PLAYER;

// 4절 표의 초기값이다. 실측 후 조정한다.
export const CAMPAIGN_HANDLING = {
  runSpeed: 6.4, swimSpeed: 12.6, jumpVel: 8.8, swimJumpVel: 9.8, emergeDelay: 0.05, regenDelay: 1.0, regenRate: 28,
  inkRefillSwim: 52, runAccel: 77, swimAccel: 70, hardLandTime: 0.12,
} as const satisfies Partial<PlayerTuning>;

// 캠페인 적: 이동 0.9배, 반응 지연 +0.1초(24번의 예고·휴지 규칙과 함께 "읽고 피하고 되받아치는" 리듬)
export const ENEMY_HANDLING = { moveMul: 0.9, reactionAdd: 0.1 } as const;

// 이동 보너스 합산 상한(성장 + 일시 효과). 성장 상한(+10%)은 성장 계산이 따로 지킨다.
export const MOVE_BONUS_CAP = 0.22;

// 성장(T027·T033)이 넘기는 배율이다. 세션 전에는 전부 0이다.
export interface GrowthMods { move: number; swim: number }
export const NO_GROWTH: GrowthMods = { move: 0, swim: 0 };

// 매 프레임 바뀌는 일시 효과이다. wave = 물결 단계 이동 보너스, buffRun/buffSwim = 퍼펙트 잠수 버프.
export interface TempMods { wave: number; buffRun: number; buffSwim: number }

// 이동 보너스 합산: 성장 + 버프 + 물결을 상한 안에 넣는다. 넘치면 물결 → 버프 순서로 깎는다.
export function capMoveBonus(growth: number, buff: number, wave: number, cap = MOVE_BONUS_CAP): { buff: number; wave: number } {
  const room = Math.max(0, cap - growth);
  const w = Math.max(0, Math.min(wave, room - Math.min(buff, room)));
  const b = Math.max(0, Math.min(buff, room - w));
  return { buff: b, wave: w };
}

// 캠페인 플레이어의 기본 튜닝(오버레이 + 성장)이다. 매 프레임 일시 효과는 applyTemp로 이 값 위에 얹는다.
export function campaignTuning(growth: GrowthMods = NO_GROWTH): PlayerTuning {
  const t: PlayerTuning = { ...PLAYER, ...CAMPAIGN_HANDLING };
  t.runSpeed *= 1 + growth.move;
  t.swimSpeed *= 1 + growth.swim;
  return t;
}

// 캠페인 적의 튜닝이다(이동만 느리다).
export function enemyTuning(): PlayerTuning {
  const m = ENEMY_HANDLING.moveMul;
  return { ...PLAYER, runSpeed: PLAYER.runSpeed * m, swimSpeed: PLAYER.swimSpeed * m, squidDrySpeed: PLAYER.squidDrySpeed * m };
}

// base(세션 시작 때 만든 값)에 일시 효과를 얹어 out에 쓴다. out은 actor.tune 객체이며 매 프레임 같은 객체를 고쳐 쓴다.
export function applyTemp(out: PlayerTuning, base: PlayerTuning, growth: GrowthMods, mods: TempMods): void {
  const run = capMoveBonus(growth.move, mods.buffRun, mods.wave);
  const swim = capMoveBonus(growth.swim, mods.buffSwim, mods.wave);
  out.runSpeed = base.runSpeed * (1 + run.buff + run.wave);
  out.swimSpeed = base.swimSpeed * (1 + swim.buff + swim.wave);
}

// 세션 종료: 전역 PLAYER로 되돌린다(캠페인 효과가 다른 모드에 남지 않는다).
export function restoreTuning(actor: { tune: PlayerTuning }): void { actor.tune = PLAYER; }

// 무기의 달리기 속도(weapons.js가 PLAYER.runSpeed 기준으로 돌려준다)를 이 튜닝 기준으로 바꾸는 배율이다.
export function runScale(t: PlayerTuning): number { return t.runSpeed / PLAYER.runSpeed; }
