// 설정·대전 프로필 옮기기(34번 F01-D). Electron 앱·다른 브라우저의 localStorage는 새 WebView로 자동으로 오지 않는다.
// 그래서 검증된 내보내기·가져오기만 제공한다: 알려진 키와 같은 타입의 값만 받고, 나머지는 버린다. 원본(내보낸 쪽)은 지우지 않는다.
// 순수 모듈이다(저장·파일 접근은 호출자). 검사: tests/client/prefsTransfer.test.ts.
export const PREFS_KIND = 'inkwave.prefs';
export const PREFS_VERSION = 1;

export interface PrefsFile { kind: typeof PREFS_KIND; v: number; at: string; settings: Record<string, unknown>; profile: Record<string, unknown> }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function exportPrefs(settings: Record<string, unknown>, profile: Record<string, unknown>, now: Date): string {
  const file: PrefsFile = { kind: PREFS_KIND, v: PREFS_VERSION, at: now.toISOString(), settings: { ...settings }, profile: { ...profile } };
  return JSON.stringify(file, null, 1);
}

// 기본값과 같은 키·같은 타입의 값만 받는다(숫자는 유한값만). 객체 값(예: profile.style)은 숫자 값만 남긴다.
function pick(src: unknown, defaults: Readonly<Record<string, unknown>>, extra: readonly string[] = []): { value: Record<string, unknown>; dropped: string[] } {
  const value: Record<string, unknown> = {}, dropped: string[] = [];
  if (!isObj(src)) return { value, dropped: ['(객체가 아님)'] };
  for (const [k, v] of Object.entries(src)) {
    const d = k in defaults ? defaults[k] : extra.includes(k) ? undefined : Symbol('none');
    if (typeof d === 'symbol') { dropped.push(k); continue; }
    if (d === undefined) {
      if (v === null || typeof v === 'string') value[k] = v;
      else if (isObj(v)) value[k] = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x)));
      else dropped.push(k);
      continue;
    }
    if (typeof d === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === typeof d) value[k] = v;
    else dropped.push(k);
  }
  return { value, dropped };
}

export type PrefsImport = { settings: Record<string, unknown>; profile: Record<string, unknown>; dropped: string[] } | { error: string };
export function parsePrefs(json: string, settingDefaults: Readonly<Record<string, unknown>>, profileDefaults: Readonly<Record<string, unknown>>): PrefsImport {
  let x: unknown;
  try { x = JSON.parse(json); } catch { return { error: 'JSON이 아니다' }; }
  if (!isObj(x) || x.kind !== PREFS_KIND) return { error: 'INKWAVE 설정 파일이 아니다' };
  if (typeof x.v !== 'number' || x.v > PREFS_VERSION) return { error: '더 새로운 형식이다' };
  const s = pick(x.settings, settingDefaults), p = pick(x.profile, profileDefaults, ['style', 'sub', 'special']);
  if (typeof p.value.name === 'string') p.value.name = (p.value.name as string).slice(0, 16);
  return { settings: s.value, profile: p.value, dropped: [...s.dropped.map((k) => 'settings.' + k), ...p.dropped.map((k) => 'profile.' + k)] };
}
