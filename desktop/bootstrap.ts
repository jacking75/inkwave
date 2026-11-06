import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { desktopPerformance } from './performance';
import { WINDOW_KEY, parseWindowState, fitToMonitor, linkPolicy, type WindowState } from './windowState';

type FullscreenListener = (on: boolean) => void;
interface NativeBridge {
  platform: string;
  performance: typeof desktopPerformance;
  isFullScreen(): boolean;
  setFullScreen(on: boolean): void;
  onFullScreenChange(listener: FullscreenListener): () => void;
}
declare global {
  interface Window { inkwaveNative?: NativeBridge }
}

function report(error: unknown): void {
  console.error(error);
  const element = document.getElementById('boot-error');
  if (element) {
    element.textContent = `데스크톱 연결 오류가 발생했다. ${error instanceof Error ? error.message : String(error)}`;
    element.style.display = 'block';
  }
}

async function boot(): Promise<void> {
  if (!isTauri()) throw new Error('Tauri 호스트에서 실행해야 한다.');
  const host = getCurrentWindow();
  let fullscreen = await host.isFullscreen();
  const listeners = new Set<FullscreenListener>();
  // 기존 게임의 동기 조회 계약은 실제 호스트 상태의 캐시로 유지한다.
  let requests = Promise.resolve();
  async function refresh(): Promise<void> {
    const actual = await host.isFullscreen();
    if (actual === fullscreen) return;
    fullscreen = actual;
    for (const listener of listeners) listener(actual);
  }
  function setFullscreen(on: boolean): void {
    requests = requests.then(async () => {
      await host.setFullscreen(on);
      await refresh();
    }).catch(report);
  }
  window.inkwaveNative = {
    platform: 'tauri',
    performance: desktopPerformance,
    isFullScreen: () => fullscreen,
    setFullScreen: setFullscreen,
    onFullScreenChange: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  // 창 상태(34번 F01-C): 지난 크기·위치·최대화를 지금 모니터 안으로 맞춰 되살리고, 바뀌면(0.5초 모아서)·닫기 전에 저장한다.
  // OS가 실제로 승인한 상태(innerSize·outerPosition·isMaximized)를 읽어 저장한다. 전체 화면은 다음 실행에 다시 켜지 않는다(창 모드 시작).
  const readState = async (): Promise<WindowState> => {
    const k = await host.scaleFactor();
    const size = (await host.innerSize()).toLogical(k), pos = (await host.outerPosition()).toLogical(k);
    return { w: Math.round(size.width), h: Math.round(size.height), x: Math.round(pos.x), y: Math.round(pos.y), maximized: await host.isMaximized(), fullscreen };
  };
  let saveT = 0;
  const saveState = async (): Promise<void> => {
    if (await host.isMinimized()) return;   // 최소화 중의 크기·위치는 남기지 않는다
    try { localStorage.setItem(WINDOW_KEY, JSON.stringify(await readState())); } catch { /* 저장 불가: 다음 실행은 기본 창 */ }
  };
  const queueSave = (): void => { clearTimeout(saveT); saveT = window.setTimeout(() => { void saveState().catch(report); }, 500); };
  try {
    let prev: WindowState | null = null;
    try { prev = parseWindowState(localStorage.getItem(WINDOW_KEY)); } catch { prev = null; }
    const mon = await currentMonitor();
    if (prev && mon) {
      const k = mon.scaleFactor;
      const box = { x: mon.position.x / k, y: mon.position.y / k, w: mon.size.width / k, h: mon.size.height / k };
      const fit = fitToMonitor(prev, box);
      await host.setSize(new LogicalSize(fit.w, fit.h));
      await host.setPosition(new LogicalPosition(fit.x, fit.y));
      if (fit.maximized) await host.maximize();
    }
  } catch (e) { console.warn('[desktop] 창 상태 복원 실패 — 기본 창으로 시작', e); }
  const unlisten = await host.onResized(() => { void refresh().catch(report); queueSave(); });
  const unlistenMove = await host.onMoved(() => queueSave());
  const unlistenClose = await host.onCloseRequested(async () => { clearTimeout(saveT); await saveState().catch(() => undefined); });
  // 외부 링크: 허용 목록만 시스템 브라우저로, 나머지는 막는다(WebView가 외부 페이지로 이동하지 않게)
  const onClick = (event: MouseEvent): void => {
    const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const policy = linkPolicy(a.href, window.location.href);
    if (policy === 'internal') return;
    event.preventDefault();
    if (policy === 'open') void openUrl(a.href).catch(report);
    else console.warn('[desktop] 허용되지 않은 외부 링크를 막았다:', a.href);
  };
  document.addEventListener('click', onClick, true);
  const nativeOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
    const href = url ? String(url) : '';
    const policy = linkPolicy(href, window.location.href);
    if (policy === 'internal') return nativeOpen(url, target, features);
    if (policy === 'open') void openUrl(href).catch(report);
    else console.warn('[desktop] 허용되지 않은 외부 링크를 막았다:', href);
    return null;
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.code !== 'F11') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) {
      requests = requests.then(async () => {
        await host.setFullscreen(!(await host.isFullscreen()));
        await refresh();
      }).catch(report);
    }
  };
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('pagehide', () => {
    unlisten(); unlistenMove(); unlistenClose();
    document.removeEventListener('click', onClick, true);
    listeners.clear();
    window.removeEventListener('keydown', keydown, true);
  }, { once: true });
  // 게임과 three.js는 호스트 연결 완료 뒤에만 불러온다.
  const gameUrl = new URL('./src/bundle/main.js', window.location.href).href;
  await import(gameUrl);
}

void boot().catch(report);
