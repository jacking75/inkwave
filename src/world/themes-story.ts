// 이야기용 환경 테마(35번 R006): 색을 잃은 항구 `inkwash`(P1)와 7장 새벽 `dawn`(P2).
// environment.js의 THEMES 표 끝에 추가만 한다(기존 day·sunset·golden 수치는 그대로). environment.js는 main이 동적
// import하므로 정적 의존을 만들지 않고, 부팅 때 Environment.THEMES를 넘겨받아 등록한다.
// 선택 경로: 캠페인 세션(또는 ?theme=inkwash)이 테마 ID를 main의 스테이지 구성에 넘긴다(mapTheme의 시간대 표를 대신함).

// 테마 한 벌의 형태이다(environment.js THEMES 주석 참조). 여기서 바꾸는 키만 타입을 둔다.
export interface ThemeDef {
  sunAz: number; sunEl: number;
  zenith: string; skyMid: string; horizon: string;
  cloudLit: string; cloudShade: string;
  seaDeep: string; seaShallow: string; seaCrest: string;
  night: number;
  grade: { uSat?: number; uVib?: number; uContrast?: number; uVignette?: number; [k: string]: unknown };
  marina: Record<string, unknown>;
  [k: string]: unknown;
}

export const STORY_THEMES = ['inkwash', 'dawn'] as const;
export type StoryThemeId = (typeof STORY_THEMES)[number];

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (v: number[]): string => '#' + v.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
// 구름 대비를 k배로: 그늘색을 밝은 면 쪽으로 끌어당긴다
const cloudContrast = (lit: string, shade: string, k: number): string => {
  const a = hex(lit), b = hex(shade);
  return toHex(a.map((x, i) => x + (b[i] - x) * k));
};

export function makeInkwash(day: ThemeDef): ThemeDef {
  const t = structuredClone(day);
  Object.assign(t, {
    zenith: '#6f7f94', skyMid: '#9aa6b5', horizon: '#d9dde3',
    seaDeep: '#2e3d4c', seaShallow: '#5f7483', seaCrest: '#9fb0bb',
    cloudShade: cloudContrast(day.cloudLit, day.cloudShade, 0.6),
  });
  // 하늘은 색 회복(R005)의 월드 채도와 별도로 테마에서도 낮춰 "흐린 날"을 만든다
  t.grade = { ...day.grade, uSat: 0.92, uVib: 0.0, uContrast: 1.04, uVignette: 0.3 };
  t.marina = { ...day.marina, channel: '#34464e', shade: '#0d1418' };
  return t;
}

export function makeDawn(sunset: ThemeDef): ThemeDef {
  const t = structuredClone(sunset);
  Object.assign(t, { sunAz: 118, sunEl: 9, horizon: '#ffc9a3', zenith: '#2a3c7a', night: 0.6 });
  t.marina = { ...sunset.marina };   // 모든 지역(할야드 포함)에서 동작하도록 marina 블록을 채운다
  return t;
}

// 이미 있는 키는 덮어쓰지 않는다. themes는 environment.js의 THEMES 표(JS 추론 타입이라 여기서 ThemeDef 표로 읽는다).
export function registerStoryThemes(table: object): void {
  const themes = table as Record<string, ThemeDef | undefined>;
  if (!themes.inkwash && themes.day) themes.inkwash = makeInkwash(themes.day);
  if (!themes.dawn && themes.sunset) themes.dawn = makeDawn(themes.sunset);
}

export const isStoryTheme = (id: unknown): id is StoryThemeId => (STORY_THEMES as readonly unknown[]).includes(id);
