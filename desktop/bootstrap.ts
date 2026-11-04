import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopPerformance } from './performance';

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
  const unlisten = await host.onResized(() => { void refresh().catch(report); });
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
    unlisten();
    listeners.clear();
    window.removeEventListener('keydown', keydown, true);
  }, { once: true });
  // 게임과 three.js는 호스트 연결 완료 뒤에만 불러온다.
  const gameUrl = new URL('./src/bundle/main.js', window.location.href).href;
  await import(gameUrl);
}

void boot().catch(report);
