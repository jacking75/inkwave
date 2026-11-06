// 특성(27번 4절): 기동·제압·순환 세 계열 × 효과 3개 × 2단계. 두 번째 효과는 같은 계열 2점, 세 번째는 4점 투자 뒤 열린다.
import { t } from '../../ui/i18n.js';
import type { StatKey } from './modules.js';

export type TraitLine = 'mobility' | 'suppress' | 'cycle';
export interface TraitDef { id: string; line: TraitLine; tierIndex: 0 | 1 | 2; name: string; key: StatKey | 'refillDelay' | 'exitGuard'; perRank: number; desc: (total: number) => string }

export const TRAIT_LINES: Record<TraitLine, string> = { mobility: '기동', suppress: '제압', cycle: '순환' };
export const TRAITS: TraitDef[] = [
  { id: 'mob1', line: 'mobility', tierIndex: 0, name: '잠수 추진', key: 'swimSpeed', perRank: 2, desc: (v) => t('잠수 속도 +{v}%', { v }) },
  { id: 'mob2', line: 'mobility', tierIndex: 1, name: '빠른 재정비', key: 'refillDelay', perRank: 0.05, desc: (v) => t('보충 시작 지연 -{v}초', { v: v.toFixed(2) }) },
  { id: 'mob3', line: 'mobility', tierIndex: 2, name: '이탈 보호', key: 'exitGuard', perRank: 4, desc: (v) => t('아군 잉크에서 나온 뒤 2초간 피해 -{v}%', { v }) },
  { id: 'sup1', line: 'suppress', tierIndex: 0, name: '약점 관찰', key: 'weak', perRank: 3, desc: (v) => t('약점 피해 +{v}%', { v }) },
  { id: 'sup2', line: 'suppress', tierIndex: 1, name: '장치 해체', key: 'device', perRank: 4, desc: (v) => t('장치 피해 +{v}%', { v }) },
  { id: 'sup3', line: 'suppress', tierIndex: 2, name: '빈틈 집중', key: 'stunBoss', perRank: 4, desc: (v) => t('기절한 보스 피해 +{v}%', { v }) },
  { id: 'cyc1', line: 'cycle', tierIndex: 0, name: '넓은 연결', key: 'paintWidth', perRank: 2, desc: (v) => t('기본 도색 폭 +{v}%', { v }) },
  { id: 'cyc2', line: 'cycle', tierIndex: 1, name: '잉크 여과', key: 'swimRefill', perRank: 3, desc: (v) => t('잠수 보충 속도 +{v}%', { v }) },
  { id: 'cyc3', line: 'cycle', tierIndex: 2, name: '흐름 축적', key: 'specialCharge', perRank: 3, desc: (v) => t('유효 도색 스페셜 충전 +{v}%', { v }) },
];
export const TRAIT_MAX_RANK = 2;
export const TRAIT_UNLOCK = [0, 2, 4] as const;   // tierIndex별로 같은 계열에 먼저 투자해야 하는 점수
