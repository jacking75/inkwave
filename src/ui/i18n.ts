// 언어 계층(34번 F06). 한국어가 기본이고 영어를 고를 수 있다.
//   - 화면 문구는 원문(한국어 또는 기존 영어)을 그대로 t()로 감싼다: t('작업장으로'), t('Settings'). 짝 표(PAIRS, ./i18n-pairs.ts)의
//     [한국어, 영어] 쌍으로 현재 언어 문구를 찾는다. 짝이 없는 원문은 그대로 보인다 — 정적 검사(tests/client/i18n.test.ts)가 소스의 모든
//     t('…') 원문에 짝이 있는지 확인하므로 실행 중 누락은 동적 문자열뿐이며, 그때 한국어 원문이면 한국어로 남는다.
//     변수는 {이름}으로 보간한다: t('남은 호출 {n}', { n: 2 }).
//   - 설정 값은 'ko' | 'en' 둘뿐이며 없거나 깨졌거나 지원하지 않는 값은 'ko'로 복구한다(OS·브라우저가 영어여도 처음은 한국어).
//   - 언어를 바꾸면 구독자(onLocale)가 화면을 다시 그린다. DOM 전체를 훑어 바꾸는 방식(MutationObserver)이나 프레임마다 다시
//     번역하지 않는다. 사용자 이름·채팅·방 코드·저장 ID·제품명(INKWAVE)·버튼 표기(A/B/X/Y)는 번역하지 않는다.
// 순수 모듈이다(문서 lang 적용만 applyLocaleToDocument가 한다). 검사: tests/client/i18n.test.ts.
import { PAIRS, EN_ALIASES } from './i18n-pairs.js';

// 원문 → [한국어, 영어]
const BY = new Map<string, readonly [string, string]>();
for (const p of PAIRS) { BY.set(p[0], p); if (!BY.has(p[1])) BY.set(p[1], p); }
// 같은 한국어의 다른 영어 표기: 그 영어 원문은 영어일 때 원문 그대로, 한국어일 때 그 한국어
for (const [en, ko] of EN_ALIASES) if (!BY.has(en)) BY.set(en, [ko, en]);
export const hasPair = (src: string): boolean => BY.has(src);

export type Locale = 'ko' | 'en';
export const LOCALES: readonly Locale[] = ['ko', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko';

export function normalizeLocale(v: unknown): Locale { return v === 'en' || v === 'ko' ? v : DEFAULT_LOCALE; }

let cur: Locale = DEFAULT_LOCALE;
const subs = new Set<(l: Locale) => void>();

export const getLocale = (): Locale => cur;
export function setLocale(l: unknown): Locale {
  const n = normalizeLocale(l);
  if (n === cur) return cur;
  cur = n;
  for (const f of subs) f(cur);
  return cur;
}
export function onLocale(fn: (l: Locale) => void): () => void { subs.add(fn); return () => subs.delete(fn); }

export type Vars = Readonly<Record<string, string | number>>;
export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// 번역: 원문 → 현재 언어(짝이 없으면 원문 그대로)
export function t(src: string, vars?: Vars): string { return tIn(cur, src, vars); }
// 특정 언어로(설정 화면의 "언어 / Language"처럼 두 언어를 함께 보일 때)
export function tIn(l: Locale, src: string, vars?: Vars): string {
  const p = BY.get(src);
  return interpolate(p ? p[l === 'en' ? 1 : 0] : src, vars);
}

// 문서 언어(접근성·글꼴 선택). 브라우저가 아닌 곳(검사)에서는 아무것도 하지 않는다
export function applyLocaleToDocument(l: Locale = cur): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = l;
  document.documentElement.dataset.locale = l;
}
