// 데스크톱 창 상태·외부 링크 규칙(34번 F01-C). 순수 계산이다(Tauri API 없음). 검사: tests/client/desktop.test.ts.
export interface WindowState { w: number; h: number; x: number; y: number; maximized: boolean; fullscreen: boolean }
export interface MonitorBox { x: number; y: number; w: number; h: number }
export const WINDOW_KEY = 'inkwave.window';
export const MIN_WINDOW = { w: 800, h: 560 } as const;

// 저장 값 검증: 깨졌거나 숫자가 아니면 null(기본 창으로 시작)
export function parseWindowState(raw: string | null): WindowState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WindowState>;
    const n = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
    if (!n(v.w) || !n(v.h) || !n(v.x) || !n(v.y)) return null;
    return { w: v.w, h: v.h, x: v.x, y: v.y, maximized: v.maximized === true, fullscreen: v.fullscreen === true };
  } catch { return null; }
}

// 지금 모니터 안으로 맞춘다(모니터를 떼었거나 해상도가 줄어도 창이 화면 밖에 남지 않게). 최소 크기는 지킨다.
export function fitToMonitor(s: WindowState, m: MonitorBox): WindowState {
  const w = Math.max(MIN_WINDOW.w, Math.min(s.w, m.w)), h = Math.max(MIN_WINDOW.h, Math.min(s.h, m.h));
  const x = Math.min(Math.max(s.x, m.x), m.x + Math.max(0, m.w - w));
  const y = Math.min(Math.max(s.y, m.y), m.y + Math.max(0, m.h - h));
  return { ...s, w, h, x, y };
}

// 외부 링크: http(s)만, 허용 목록의 앞부분과 같을 때만 시스템 브라우저로 연다. 나머지는 WebView 안에서도 열지 않는다.
export const ALLOWED_LINKS: readonly string[] = ['https://github.com/jaydendavisnc/inkwave', 'https://inkwave-aah.pages.dev'];
export function linkPolicy(href: string, pageOrigin: string): 'internal' | 'open' | 'block' {
  let u: URL;
  try { u = new URL(href, pageOrigin); } catch { return 'block'; }
  if (u.origin === new URL(pageOrigin).origin) return 'internal';
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'block';
  return ALLOWED_LINKS.some((a) => u.href === a || u.href.startsWith(a + '/') || u.href.startsWith(a + '?') || u.href.startsWith(a + '#')) ? 'open' : 'block';
}
