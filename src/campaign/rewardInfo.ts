// 임무 선택 화면의 보상 안내(33번 T049, 28번 2·3절). 추첨(loot.ts)과 같은 데이터(REGION_POOL·REGION_SIGNATURE·COMPLETION)에서
// 만들므로 화면에 보이는 후보와 실제 추첨 후보가 어긋나지 않는다. 순수 모듈이다. 검사: tests/client/craft.test.ts.
import { COMPLETION, DESIGN_UNLOCK, UPGRADE_UNLOCK_MISSION, WEAPON_UNLOCK } from './data/economy.js';
import { MODULES, REGION_POOL, REGION_SIGNATURE, STAT_LABEL, type StatLine } from './data/modules.js';
import type { RegionId } from './data/types.js';
import { WEAPONS } from '../config.js';

export interface RewardInfo {
  kind: 'normal' | 'boss';
  first: boolean;               // 아직 첫 완료 전이면 첫 완료 보상을 보여 준다
  xp: number; parts: number; cores: number;
  pool: StatLine[];             // 정밀·특제 보조 옵션 후보
  signature: string;            // 특제 추첨 결과(지역 서명)
  confirmedSignature: boolean;  // 보스 첫 완료의 확정 서명
  crate: boolean;               // 선택 상자(일반 임무만)
  unlocks: string[];            // 첫 완료의 무기·설계·강화 해금 안내
}

export function rewardInfo(missionId: string, region: RegionId, kind: 'normal' | 'boss', done: readonly string[]): RewardInfo {
  const first = !done.includes(missionId);
  const R = COMPLETION[kind];
  const unlocks: string[] = [];
  if (first) {
    for (const w of WEAPON_UNLOCK[missionId] ?? []) unlocks.push(`무기 ${(WEAPONS as Record<string, { name: string }>)[w]?.name ?? w}`);
    for (const d of DESIGN_UNLOCK[missionId] ?? []) unlocks.push(`설계 ${MODULES[d].name}`);
    const up = (UPGRADE_UNLOCK_MISSION as readonly string[]).indexOf(missionId);
    if (up >= 0) unlocks.push(`강화 +${up + 1}`);
  }
  return {
    kind, first, xp: R.xp + (first ? R.xpFirst : 0), parts: R.parts + (first ? R.partsFirst : 0), cores: R.core,
    pool: REGION_POOL[region].map((s) => ({ ...s })), signature: REGION_SIGNATURE[region],
    confirmedSignature: first && kind === 'boss', crate: kind === 'normal', unlocks,
  };
}

export function rewardInfoText(r: RewardInfo): string {
  const sig = MODULES[r.signature].name;
  return [
    `${r.first ? '첫 완료' : '반복'}: 경험치 ${r.xp} · 부품 ${r.parts}${r.cores ? ` · 공명핵 ${r.cores}` : ''} · 무작위 모듈 1${r.confirmedSignature ? ` · 서명 「${sig}」 확정` : ''}`,
    `추첨 보조 옵션: ${r.pool.map((s) => STAT_LABEL[s.key](s.value)).join(' / ')} · 특제: ${sig}${r.crate ? ' · 선택 상자 1' : ''}`,
    ...(r.unlocks.length ? [`첫 완료 해금: ${r.unlocks.join(' · ')}`] : []),
  ].join('\n');
}
