// 룩 프로필(35번 R002): 그림책 룩의 모든 수치를 한곳에 두고 설정·플랫폼·품질 등급으로 적용값을 정한다.
// 순수 계산이다(DOM·렌더러에 의존하지 않는다). StylePass·툰 램프·비율 프리셋이 이 결과만 읽는다.
import { QUALITY, type LookId, type QualityId, type QualityPreset } from '../config.js';

export interface LookProfile {
  id: LookId;
  // px(기준 1080p), 깊이·법선 민감도, 소멸 거리 m, 바탕색 혼합 0..1. width 0 = 선 없음
  outline: { width: number; depthK: number; normalK: number; farFade: number; inkMix: number };
  // 종이 결 밝기 폭, 하프톤 대체 비율, 하프톤 격자 px(기준 1080p). 0 = 끔
  paper: { grain: number; halftone: number; halftoneScale: number };
  // 밝기 3단, 경계 dotNL 2개, 경계 폭, 환경광(PMREM) 배율. 툰 램프는 부팅 시 패치라 다시 시작 후 적용이다
  toon: { bands: [number, number, number]; edges: [number, number]; soft: number; envScale: number };
  // 잃은 색의 채도, 복구 구체가 퍼지는 시간 s, 동시 구체 수
  colorReturn: { lostSat: number; restoreFadeS: number; maxSpheres: 8 };
  // 머리 뼈 스케일(R010). 뼈 위치·충돌 치수는 바꾸지 않는다
  headScale: number;
}

// 프로필이 읽는 설정 필드이다. 저장값이 깨졌을 수 있으므로 모두 선택 필드로 받는다.
export interface LookSettings {
  look?: unknown; halftone?: unknown; outlineWidth?: unknown; colorblind?: unknown; quality?: unknown;
}

const STORYBOOK: LookProfile = {
  id: 'storybook',
  outline: { width: 1, depthK: 0.012, normalK: 0.3, farFade: 60, inkMix: 0.55 },
  paper: { grain: 0.035, halftone: 0.35, halftoneScale: 6 },
  toon: { bands: [0.08, 0.55, 1.0], edges: [0.18, 0.55], soft: 0.04, envScale: 0.7 },
  colorReturn: { lostSat: 0.18, restoreFadeS: 2.5, maxSpheres: 8 },
  headScale: 1.16,
};

// 원본 룩: 모든 효과가 0이고 색 회복·툰 램프·비율 변경이 없다.
const CLASSIC: LookProfile = {
  id: 'classic',
  outline: { ...STORYBOOK.outline, width: 0 },
  paper: { grain: 0, halftone: 0, halftoneScale: STORYBOOK.paper.halftoneScale },
  toon: { ...STORYBOOK.toon, envScale: 1 },
  colorReturn: { lostSat: 1, restoreFadeS: STORYBOOK.colorReturn.restoreFadeS, maxSpheres: 8 },
  headScale: 1,
};

// 색각 설정이 켜져 있으면 잃은 색을 덜 뺀다(R005).
const LOST_SAT_COLORBLIND = 0.35;
const OUTLINE_WIDTHS = [0.8, 1, 1.3] as const;

export function lookId(settings: LookSettings | null | undefined): LookId {
  return settings?.look === 'classic' ? 'classic' : 'storybook';
}

function qualityOf(settings: LookSettings | null | undefined): QualityPreset {
  const id = settings?.quality;
  return typeof id === 'string' && id in QUALITY ? QUALITY[id as QualityId] : QUALITY.high;
}

// 터치 기기·외곽선을 끈 등급은 하프톤 0, 선 두께 1.0 고정이다.
export function resolveLook(settings: LookSettings | null | undefined, touch: boolean): LookProfile {
  if (lookId(settings) === 'classic') return CLASSIC;
  const q = qualityOf(settings);
  const lowTier = touch || !q.halftone;
  const pick = OUTLINE_WIDTHS.find((w) => w === settings?.outlineWidth) ?? 1;
  return {
    ...STORYBOOK,
    outline: { ...STORYBOOK.outline, width: !q.lines ? 0 : lowTier ? 1 : pick },
    paper: { ...STORYBOOK.paper, halftone: lowTier || settings?.halftone === false ? 0 : STORYBOOK.paper.halftone },
    colorReturn: { ...STORYBOOK.colorReturn, lostSat: settings?.colorblind === true ? LOST_SAT_COLORBLIND : STORYBOOK.colorReturn.lostSat },
  };
}
