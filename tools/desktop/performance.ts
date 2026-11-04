// PC 브라우저에서 실제 게임 프레임을 측정한다. 임시 프로필만 사용한다.
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!executablePath) throw new Error('CHROME_PATH로 Chromium 실행 파일을 지정해야 한다.');
const native = process.argv.includes('--native');
const browser = native ? await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null }) : await puppeteer.launch({ executablePath, headless: false,
  defaultViewport: { width: process.argv.includes('--large') ? 1920 : 960, height: process.argv.includes('--large') ? 1080 : 640, deviceScaleFactor: 1 },
  args: ['--window-size=1000,740', '--autoplay-policy=no-user-gesture-required',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
try {
  const page = native ? (await browser.pages())[0] : await browser.newPage();
  await page.bringToFront();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  if (process.argv.includes('--bundle') && !native) {
    const html = (await readFile('.desktop-dist/index.html', 'utf8')).replace('./desktop/bootstrap.js', './src/bundle/main.js');
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.isNavigationRequest()) void request.respond({ status: 200, contentType: 'text/html', body: html });
      else void request.continue();
    });
  }
  if (process.argv.includes('--safe') && !native) {
    const policy = await transform(await readFile('desktop/performance.ts', 'utf8'), { loader: 'ts', format: 'iife', globalName: 'desktopPolicy' });
    const previous = process.argv.includes('--previous') ? 'desktopPolicy.desktopPerformance.warmCharacterVariants = true; desktopPolicy.desktopPerformance.shouldWarmShowcase = () => true;' : '';
    await page.evaluateOnNewDocument(policy.code + previous + `\nObject.assign(window, { inkwaveNative: {
      performance: desktopPolicy.desktopPerformance, isFullScreen: () => false,
      onFullScreenChange: () => () => {}, setFullScreen: () => {}
    } });`);
  }
  const url = native ? new URL('./index.html?quality=low&nofullscreen&autostart=600&autopilot', page.url()).href : process.argv[2] || 'http://localhost:8490/?quality=low&nofullscreen&autostart=600&autopilot';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__inkwave?.match?.state === "playing"', { timeout: 120000 });
  const readyMs = await page.evaluate(() => performance.now());
  console.log('전투 진입(ms)', readyMs);
  if (process.argv.includes('--safe')) {
    const valid = await page.evaluate(`(() => {
      const p = window.inkwaveNative.performance;
      const stored = { shadows: true, fpsCap: 30, shadowsChosen: true };
      const before = JSON.stringify(stored), chosen = { ...stored };
      p.configureSettings(chosen, stored);
      const defaults = { shadows: true, fpsCap: 0 };
      p.configureSettings(defaults, null);
      return JSON.stringify(stored) === before && chosen.shadows === true && chosen.fpsCap === 30
        && defaults.shadows === false && defaults.fpsCap === 60
        && p.frameCap(60, true) === 30 && p.frameCap(30, false) === 30 && p.frameCap(60, false) === 60;
    })()`);
    if (valid !== true) throw new Error('저장 설정 보존 또는 프레임 제한 계약이 깨졌다.');
    console.log('설정 보존·프레임 제한 계약 통과');
  }
  // 기존 디버그 계약은 JavaScript 게임이 소유한다. 측정기는 구조를 읽기만 한다.
  const report = await page.evaluate(async () => {
    const w = window as unknown as { __inkwave: {
      bootMs: number; bootMarks: unknown; _frameN: number; perf: Record<string, number>;
      settings: { shadows: boolean }; R: { renderer: { getContext(): WebGL2RenderingContext; info: { memory: unknown } } };
    } };
    const g = w.__inkwave;
    const gl = g.R.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    async function sample() {
      const intervals: number[] = [];
      const totals: Record<string, number> = {};
      const start = performance.now();
      let last = start, frame = g._frameN;
      while (performance.now() - start < 12000) {
        await Promise.race([new Promise(requestAnimationFrame), new Promise(r => setTimeout(r, 500))]);
        if (g._frameN === frame) continue;
        const now = performance.now();
        intervals.push(now - last); last = now; frame = g._frameN;
        for (const key of ['sim', 'render', 'tail', 'calls', 'tris']) totals[key] = (totals[key] || 0) + g.perf[key];
      }
      intervals.sort((a, b) => a - b);
      if (!intervals.length || document.hidden) throw new Error('페이지가 비활성 상태라 성능을 측정할 수 없다.');
      return { fps: intervals.length * 1000 / (performance.now() - start),
        p50: intervals[Math.floor(intervals.length * .5)], p95: intervals[Math.floor(intervals.length * .95)],
        worst: intervals.at(-1), over50ms: intervals.filter(v => v > 50).length,
        cpu: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / intervals.length])),
        memory: g.R.renderer.info.memory };
    }
    await new Promise(r => setTimeout(r, 5000));
    const baseline = await sample();
    return { stages: performance.getEntriesByType('mark').map(m => [m.name, m.startTime]),
      elapsedMs: performance.now(), renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      viewport: [innerWidth, innerHeight, devicePixelRatio], bootMs: g.bootMs, bootMarks: g.bootMarks, baseline };
  });
  console.log(JSON.stringify({ readyMs, ...report }, null, 2));
  if (process.argv.includes('--regression')) {
    const deferred = await page.evaluate(`({
      heroTiers: window.__G.actors.filter(a => a.character.lodSets?.[0]).length,
      studioWarm: window.__inkwave.showcase._warmState || null
    })`);
    console.log('선행 준비 상태', JSON.stringify(deferred));
    const menu = await page.evaluate(`(async () => {
      await window.__inkwave.quitToMenu();
      return { noMatch: window.__inkwave.match === null, actors: window.__G.actors.length };
    })()`) as { noMatch: boolean; actors: number };
    console.log('메뉴 복귀', JSON.stringify(menu));
    if (!menu.noMatch || menu.actors !== 0) throw new Error('메뉴 자동 전투가 복구됐다.');
    for (const mode of ['practice', 'zones', 'boss']) {
      await page.evaluate(`window.__inkwave.startMatch({ practice: ${mode === 'practice'}, mode: '${mode}', mapId: 'tidewater' })`);
      await page.waitForFunction('window.__inkwave.match.state === "playing"', { timeout: 60000 });
      const state = await page.evaluate(`({ mode: window.__inkwave.match.mode, practice: !!window.__inkwave.match.practice, actors: window.__G.actors.length })`) as { mode: string; practice: boolean; actors: number };
      console.log('모드 회귀', JSON.stringify(state));
      if (state.practice !== (mode === 'practice') || state.mode !== (mode === 'practice' ? 'turf' : mode)) throw new Error('요청한 모드가 시작되지 않았다.');
    }
    await page.evaluate(`(async () => {
      await window.__inkwave.quitToMenu();
      window.__inkwave.menus.show('loadout');
    })()`);
    await page.waitForFunction('window.__inkwave.showcase._warmState === "done" && window.__inkwave.showcase.chars.length > 0', { timeout: 60000 });
    console.log('장비 화면 지연 준비 통과');
  }
  console.log(JSON.stringify({ errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { if (native) browser.disconnect(); else await browser.close(); }
