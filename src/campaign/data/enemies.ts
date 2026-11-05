// 캠페인 적 병종 정의(24번 5절, 1-2·1-3 기획 6절). 기존 캐릭터·무기를 재사용하고 행동은 enemies/brain.ts의 상태기가 한다.
// 수치는 첫 플레이 시작값이며 실측으로 조정한다.
import type { EnemyRoleId } from './types.js';
import type { EnemyTier } from '../action/stagger.js';

export interface EnemyRoleDef {
  role: EnemyRoleId;
  name: string;
  weapon: string;              // 기존 무기 id(config WEAPONS)
  hp: number;
  tier: EnemyTier;
  sight: number;               // m: 발견 거리
  range: number;               // m: 공격을 시작하는 거리
  leash: number;               // m: 자기 자리에서 이 이상 쫓지 않는다(구간 경계와 함께)
  telegraph: number;           // s: 공격 전 예고(최소 0.9, 이야기 난이도에서 늘어난다)
  burst: [number, number];     // 한 번 공격의 발사 시간(s) 범위
  rest: number;                // s: 공격 뒤 쉬는 시간(최소 0.8)
  damage: number;              // 예고형 공격의 피해(선·부채꼴·원 판정)
  mark: string;                // 머리 위 병종 표식
}

export const ENEMY_ROLES: Record<EnemyRoleId, EnemyRoleDef> = {
  gunner: { role: 'gunner', name: '사격병', weapon: 'shooter', hp: 100, tier: 'grunt', sight: 22, range: 14, leash: 14, telegraph: 0.9, burst: [0.45, 0.8], rest: 1.0, damage: 0, mark: '■' },
  painter: { role: 'painter', name: '도색병', weapon: 'roller', hp: 120, tier: 'grunt', sight: 20, range: 4, leash: 16, telegraph: 0.9, burst: [1.2, 1.8], rest: 1.2, damage: 0, mark: '▬' },
  shield: { role: 'shield', name: '방패병', weapon: 'brolly', hp: 130, tier: 'grunt', sight: 20, range: 9, leash: 10, telegraph: 1.0, burst: [0.5, 0.5], rest: 3.0, damage: 35, mark: '◆' },
  watcher: { role: 'watcher', name: '감시병', weapon: 'charger', hp: 90, tier: 'grunt', sight: 30, range: 26, leash: 6, telegraph: 0.9, burst: [0.1, 0.1], rest: 2.5, damage: 60, mark: '▲' },
  mortar: { role: 'mortar', name: '포격병', weapon: 'bucket', hp: 110, tier: 'grunt', sight: 24, range: 18, leash: 8, telegraph: 1.1, burst: [0.1, 0.1], rest: 2.0, damage: 40, mark: '●' },
  rollerElite: { role: 'rollerElite', name: '청소반장', weapon: 'roller', hp: 420, tier: 'elite', sight: 30, range: 14, leash: 30, telegraph: 1.0, burst: [0.9, 0.9], rest: 2.0, damage: 45, mark: '★' },
  umbrellaCaptain: { role: 'umbrellaCaptain', name: '통행대장 바리', weapon: 'brolly', hp: 1800, tier: 'captain', sight: 40, range: 16, leash: 40, telegraph: 1.0, burst: [0.5, 0.5], rest: 3.0, damage: 40, mark: '♛' },
};

// 동시 활성 인간형 상한(24번 5절): 1장 3, 2~4장 4, 5~7장 5
export function humanCap(chapter: number): number { return chapter <= 1 ? 3 : chapter <= 4 ? 4 : 5; }
