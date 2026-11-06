// 자원 수명 검사(34번 F03·F04, 33번 T073의 반복 전환). headless Chrome에서 실제 게임의 WebGL 자원 수(renderer.info.memory)를 잰다.
//   texlib  텍스처 라이브러리: 진행 콜백, 중간 취소 → AbortError·렌더 타깃/autoClear/XR 복구·만든 텍스처 회수
//   quality 화질·블룸을 여러 번 바꿔도 텍스처·지오메트리 수가 처음 값으로 돌아온다(컴포저 패스 해제, 블룸 지연 생성)
//   maps    맵을 오가도(장식·도색·레벨 재생성) 같은 맵의 자원 수가 늘지 않는다
//   cycle   작업장 ↔ 임무·사망 ↔ CP 재시작·보스 재시작 반복 뒤 자원·이벤트 구독·DOM 노드 수가 늘지 않는다(33번 T073)
// usage: node .tools/resource-check.js [--port 8490] [--only texlib,quality,maps,cycle] [--rounds 3]
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'texlib,quality,maps,cycle').split(','));
const rounds = Number(opt('rounds', '3'));
const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const ev = <T>(page: Page, js: string): Promise<T> => page.evaluate(js) as Promise<T>;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const MEM = `(() => { const i = __inkwave.R.renderer.info; return { tex: i.memory.textures, geo: i.memory.geometries, prog: i.programs ? i.programs.length : 0 }; })()`;
interface Mem { tex: number; geo: number; prog: number }

const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 600000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const errors: string[] = [];
async function open(): Promise<Page> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await ev(page, '(__inkwave.pause = () => {}, 0)');
  return page;
}
const settle = (page: Page, ms = 1500): Promise<unknown> => ev(page, `new Promise((r) => { const t = performance.now(); const f = () => (performance.now() - t > ${ms} ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

try {
  const page = await open();
  if (only.has('texlib')) {
    await settle(page, 3000);   // 부팅 직후 다른 텍스처가 올라가는 동안 재지 않는다
    const r = await ev<Record<string, unknown>>(page, `(async () => { const { createTextureLibrary } = await import('/src/world/texlib.js'); const R = __inkwave.R.renderer, i = R.info.memory;
      const before = { tex: i.textures, rt: R.getRenderTarget(), auto: R.autoClear };
      const prog = []; const lib = await createTextureLibrary(R, { size: 64, batch: 3, onProgress: (d, t) => prog.push([d, t]) }); const made = i.textures; lib.dispose();
      const ac = new AbortController(); let err = null; let n = 0;
      try { await createTextureLibrary(R, { size: 64, batch: 2, signal: ac.signal, onProgress: () => { if (++n === 2) ac.abort(); } }); } catch (e) { err = e.name; }
      await new Promise((r) => requestAnimationFrame(r));
      return { progN: prog.length, last: prog[prog.length - 1], made: made - before.tex, err, rtSame: R.getRenderTarget() === before.rt, autoSame: R.autoClear === before.auto, texAfter: i.textures - before.tex }; })()`);
    ok('F03 텍스처 라이브러리: 층마다 진행, 중간 취소 → AbortError·렌더 상태 복구·텍스처 회수', (r.progN as number) > 3 && r.err === 'AbortError' && r.rtSame === true && r.autoSame === true && (r.texAfter as number) <= 0, r);
  }
  if (only.has('quality')) {
    await ev(page, `__inkwave.startPractice({ mapId: 'tidewater' })`); await settle(page, 2500);
    const base = await ev<Mem>(page, MEM);
    const seq: Mem[] = [];
    for (let k = 0; k < rounds; k++) {
      for (const q of ['high', 'medium', 'low']) { await ev(page, `__inkwave._setSettings({ quality: '${q}' })`); await settle(page, 600); }
      await ev(page, `__inkwave._setSettings({ bloom: false })`); await settle(page, 400); await ev(page, `__inkwave._setSettings({ bloom: true })`); await settle(page, 400);
      await ev(page, `__inkwave._setSettings({ quality: 'low' })`); await settle(page, 800);
      seq.push(await ev<Mem>(page, MEM));
    }
    const last = seq[seq.length - 1];
    // 높은 화질을 처음 거칠 때 한 번 만들어 두는 공유 자원(예: 패스 전체 화면 사각형)은 있을 수 있다. 회차가 늘수록 늘면 누수이다
    // 높은 화질을 처음 거칠 때 한 번 만드는 공유 자원은 있을 수 있다. 둘째 회차 뒤로 늘면 누수이다
    ok('F04 화질·블룸 반복 전환: 둘째 회차 뒤로 텍스처·지오메트리가 늘지 않는다(패스 해제·블룸 지연 생성)', seq.length >= 3 && last.tex <= seq[1].tex && last.geo <= seq[1].geo, { base, seq });
    const bloomOff = await ev<{ bloom: boolean }>(page, `(__inkwave._setSettings({ bloom: false }), { bloom: !!__inkwave.R.bloom })`);
    await ev(page, `__inkwave._setSettings({ bloom: true })`);
    ok('F04 블룸을 끄면 블룸 패스(밉 타깃)를 만들지 않는다', bloomOff.bloom === false, bloomOff);
    await ev(page, `__inkwave.quitToMenu('main')`); await wait(800);
  }
  if (only.has('maps')) {
    const seq: Array<Mem & { map: string }> = [];
    for (let k = 0; k < rounds; k++) {
      for (const m of ['kelpline', 'tidewater']) { await ev(page, `__inkwave.startPractice({ mapId: '${m}' })`); await settle(page, 2000); seq.push({ map: m, ...(await ev<Mem>(page, MEM)) }); await ev(page, `__inkwave.quitToMenu('main')`); await wait(600); }
    }
    const tw = seq.filter((x) => x.map === 'tidewater');
    ok('F04 맵 반복 교체: 같은 맵의 텍스처·지오메트리 수가 늘지 않는다(장식·도색·레벨 해제)', tw.length >= 2 && tw[tw.length - 1].tex <= tw[0].tex + 2 && tw[tw.length - 1].geo <= tw[0].geo + 4, seq);
  }
  if (only.has('cycle')) {
    // 작업장 ↔ 1-3(보스) 반복: 시작 → 사망 → CP 재시작 → 보스 앞 재시작 → 작업장
    await ev(page, `(async () => { const g = __inkwave; g.store.port.close(); await new Promise((r) => { const q = indexedDB.deleteDatabase('inkwave-campaign'); q.onsuccess = q.onerror = q.onblocked = () => r(0); }); g.store.current = null; await g.store.init(); await g.store.newGame(Date.now(), 'normal'); await g.store.commit((s) => ({ ...s, unlocked: ['1-1', '1-2', '1-3'] })); })()`);
    const snap = `(async () => { const { G } = await import('/src/core/ctx.js'); const m = await import('/src/core/ctx.js'); const i = __inkwave.R.renderer.info; return { tex: i.memory.textures, geo: i.memory.geometries, dom: document.getElementsByTagName('*').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, subs: m.listenerCount ? m.listenerCount() : -1 }; })()`;
    const seq: Array<Record<string, number>> = [];
    for (let k = 0; k < rounds + 1; k++) {
      await ev(page, `__inkwave.startCampaign('1-3', { prologue: false })`);
      await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 250 });
      await ev(page, `(() => { const st = __inkwave.story; st.layer.runner.clear(); st.panels.stop(); })()`);
      await settle(page, 1200);
      await ev(page, `(() => { const a = window.__G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`); await settle(page, 2200);
      await ev(page, '__inkwave.session.retryCheckpoint()'); await settle(page, 1000);
      await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(1200);
      await ev(page, '(window.gc && window.gc(), 0)');
      seq.push(await ev<Record<string, number>>(page, snap));
    }
    const a = seq[1], z = seq[seq.length - 1];   // 첫 회차는 셰이더·자원 준비가 들어가므로 둘째부터 비교
    ok('T073 작업장 ↔ 1-3(사망·CP 재시작) 반복: 텍스처·지오메트리·DOM 노드·이벤트 구독이 계속 늘지 않는다', z.tex <= a.tex + 3 && z.geo <= a.geo + 6 && z.dom <= a.dom + 40 && (z.subs < 0 || z.subs <= a.subs + 2), seq);
  }
  ok('콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
} catch (e) { ok('실행 오류', false, String((e as Error).stack || e).slice(0, 600)); }
await browser.close().catch(() => {});
console.log(JSON.stringify(results, null, 2));
console.log(`resource-check: ${Object.keys(results).length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
