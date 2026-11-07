// 이야기 구조 실행 검수(35번 R025~R031). 개발 서버에 headless Chrome으로 붙어 다음을 실제 화면으로 확인하고 스크린숏을 남긴다.
//   메뉴: 이야기 우선 순서·이어하기 표시 조건·항구 대전 하위 메뉴(대전·온라인 진입 경로)
//   이야기 시작: 첫 실행 라커 경유 → 1장 프롤로그 패널(4컷) → 1-1 시작 대본(막는 대본) → 전투
//   패널: 컷 진행·건너뛰기 뒤 카메라(follow)·시간 배율(hold 해제)·입력 차단 복귀
//   대화: 모든 줄에서 건너뛰기, 진행 키, 초상 렌더 비용, 1-1 시작 대본 길이
//   항구 지도: 키보드 이동·360 px 폭 가로 스크롤, 기록판, 이야기 결과(저장 실패 → 미확정 → 재시도 확정)
//
// usage: node .tools/story-check.js [--port 8490] [--only menu,story,panels,dialogue,dlog,hub,harbor,results,en(기본 목록 밖)]
// 결과: 표준 출력 JSON, shots/story/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'menu,story,panels,dialogue,dlog,hub,harbor,results').split(','));
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/story', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const shot = (page: Page, name: string): Promise<unknown> => page.screenshot({ path: `shots/story/${name}.png` });

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const errors: string[] = [];
// fakePad: 표준 매핑 가짜 패드 하나(window.__padState.buttons[i] = true로 누른다)
// initLog: 페이지 스크립트보다 먼저 넣을 이야기 기록(StoryLog는 부팅 때 한 번 읽는다)
async function open(query: string, clear: boolean, fakePad = false, viewport?: Parameters<Page['setViewport']>[0], initLog?: string): Promise<Page> {
  const page = await browser.newPage();
  if (initLog) await page.evaluateOnNewDocument(`localStorage.setItem('inkwave.storylog', ${JSON.stringify(initLog)})`);
  if (viewport) await page.setViewport(viewport);
  if (fakePad) await page.evaluateOnNewDocument(`(() => {
    window.__padState = { buttons: Array(17).fill(false) };
    const pad = { id: 'fake standard pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      get buttons() { return window.__padState.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })); } };
    navigator.getGamepads = () => [pad, null, null, null];
  })()`);
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?skipTitle${query}`, { waitUntil: 'load', timeout: 180000 });
  if (clear) { await page.evaluate('localStorage.removeItem("inkwave.storylog"); localStorage.removeItem("inkwave.campaign.v1")'); await page.reload({ waitUntil: 'load' }); }
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await wait(800);
  return page;
}
const menuIds = (page: Page): Promise<string[]> => page.evaluate('[...document.querySelectorAll(".iw-main__menu [data-id]")].map((b) => b.dataset.id)') as Promise<string[]>;
const focusId = (page: Page): Promise<string | null> => page.evaluate('__inkwave.menus._focus && __inkwave.menus._focus.dataset.id') as Promise<string | null>;
const key = async (page: Page, code: string): Promise<void> => { await page.keyboard.press(code as never); await wait(220); };
// 누른 채 두 프레임, 뗀 채 두 프레임(저프레임 headless에서 고정 120 ms는 패드 폴링 사이에 묻힐 수 있다)
const frames2 = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';
const pad = async (page: Page, i: number): Promise<void> => { await page.evaluate(`__padState.buttons[${i}] = true; ${frames2}`); await wait(60); await page.evaluate(`__padState.buttons[${i}] = false; ${frames2}`); await wait(150); };

try {
  // ---------------------------------------------------------------- 메뉴 순서·이어하기·항구 대전
  if (only.has('menu')) {
    const page = await open('', true);
    const fresh = await menuIds(page);
    ok('menu.fresh.order', JSON.stringify(fresh) === JSON.stringify(['story', 'arena', 'locker', 'settings']), fresh);
    ok('menu.fresh.focus', (await focusId(page)) === 'story', await focusId(page));
    await shot(page, 'menu-fresh');
    await page.evaluate('localStorage.setItem("inkwave.storylog", JSON.stringify({ v: 1, read: ["1-1.intro"], records: [] }))');
    await page.evaluate('__inkwave.menus.show("title"); __inkwave.menus.show("main", { force: true })');
    // 타이틀 → 메인은 와이프 전환이라 새 메인이 늦게 붙는다: 고정 대기 대신 새 화면을 기다린다
    await page.waitForFunction('__inkwave.menus.current === "main" && !__inkwave.menus.wipe.busy && document.querySelectorAll(".iw-main__menu [data-id]").length > 0', { timeout: 8000, polling: 100 }).catch(() => undefined);
    await wait(600);
    // (메인이 다시 그려지는 동안 목록이 잠깐 비므로 항목이 붙을 때까지 기다린다)
    await page.waitForFunction('document.querySelectorAll(".iw-main__menu [data-id]").length >= 5', { timeout: 8000, polling: 100 }).catch(() => undefined);
    const saved = await menuIds(page);
    ok('menu.save.order', JSON.stringify(saved) === JSON.stringify(['continue', 'story', 'arena', 'locker', 'settings']), saved);
    ok('menu.save.focus', (await focusId(page)) === 'continue', await focusId(page));
    await shot(page, 'menu-continue');
    // 항구 대전 → 기존 PLAY(mode)·ONLINE·LOADOUT·HOW TO PLAY·CREDITS, PLAY → mode 화면, 뒤로 → 항구 대전 → 메인
    await page.evaluate('__inkwave.menus._go("arena")'); await wait(500);
    const arena = await menuIds(page);
    ok('arena.items', JSON.stringify(arena) === JSON.stringify(['play', 'online', 'loadout', 'howto', 'credits']), arena);
    await shot(page, 'arena');
    await key(page, 'Enter'); await wait(400);
    ok('arena.play→mode', (await page.evaluate('__inkwave.menus.current')) === 'mode');
    await key(page, 'Escape'); await wait(400);
    ok('mode.back→arena', (await page.evaluate('__inkwave.menus.current')) === 'arena');
    await key(page, 'ArrowDown'); await key(page, 'Enter'); await wait(800);
    ok('arena.online', (await page.evaluate('__inkwave.menus.current')) === 'online');
    await key(page, 'Escape'); await wait(500); await key(page, 'Escape'); await wait(500);
    ok('arena.back→main', (await page.evaluate('__inkwave.menus.current')) === 'main', await page.evaluate('__inkwave.menus.current'));
    await page.close();
  }

  // ---------------------------------------------------------------- 이야기 시작: 라커 경유 → 프롤로그 → 1-1 시작 대본
  if (only.has('story') || only.has('panels') || only.has('dialogue')) {
    const page = await open('', true);
    await page.evaluate(`(() => { window.__ev = []; import('/src/core/ctx.js').then((c) => { window.__ctx = c; for (const n of ['story:panel', 'story:panelEnd', 'story:line', 'story:end']) c.on(n, (e) => __ev.push([n, e.sceneId || e.scriptId, e.shotId ?? e.index ?? e.skipped, performance.now()])); }); })()`);
    await wait(300);
    await key(page, 'Enter');   // 이야기 시작(첫 실행) → 라커
    await wait(700);
    ok('story.firstRun→locker', (await page.evaluate('__inkwave.menus.current')) === 'locker');
    await key(page, 'Escape');  // 라커에서 나가면 이야기가 시작된다
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.story.panels.playing', { timeout: 180000, polling: 200 });
    await wait(1200);
    const held = await page.evaluate('({ hold: __inkwave.campaignPreview.time.held, block: __inkwave.campaignPreview.combat.inputBlocked, rig: __inkwave.rig.mode, map: __inkwave.mapDef.id })') as { hold: boolean; block: boolean; rig: string; map: string };
    ok('panel.freeze', held.hold && held.block && held.rig === 'path', held);
    await shot(page, 'prologue-1');
    if (only.has('panels') || only.has('story')) {
      // 컷 진행: 1컷 6초 뒤 2컷
      await wait(5600); await shot(page, 'prologue-2');
      await wait(6500); await shot(page, 'prologue-3');
      await wait(5500); await shot(page, 'prologue-4');
      const shots = await page.evaluate('__ev.filter((e) => e[0] === "story:panel").map((e) => e[2])') as string[];
      ok('panel.prologue.4shots', JSON.stringify(shots.slice(0, 4)) === '["p1","p2","p3","p4"]', shots);
    }
    // 끝나면(또는 건너뛰면) 시작 대본이 이어진다
    await page.waitForFunction('!__inkwave.story.panels.playing', { timeout: 30000, polling: 100 });
    await wait(300);
    const after = await page.evaluate('({ hold: __inkwave.campaignPreview.time.held, rig: __inkwave.rig.mode, line: __inkwave.story.layer.runner.cur && __inkwave.story.layer.runner.cur.script.id, block: __inkwave.campaignPreview.combat.inputBlocked })') as { hold: boolean; rig: string; line: string | null; block: boolean };
    ok('panel.end.restore', !after.hold && after.rig === 'follow', after);
    ok('dialogue.intro.starts', after.line === '1-1.intro' && after.block, after);
    await wait(900); await shot(page, 'intro-line1');
    // 진행 키: 타이핑 중이면 전체 표시 → 다음 줄
    const t0 = await page.evaluate('performance.now()') as number;
    await page.waitForFunction('!__inkwave.story.layer.runner.cur', { timeout: 25000, polling: 100 });
    const introMs = (await page.evaluate('performance.now()') as number) - t0 + 900;
    ok('dialogue.intro.under20s', introMs < 20000, Math.round(introMs));
    ok('dialogue.unblock', !(await page.evaluate('__inkwave.campaignPreview.combat.inputBlocked')));
    // 모든 줄에서 건너뛰기: 각 줄 i에서 Tab
    const skipRes: Array<{ at: number; ended: boolean; skipped: boolean }> = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate('__inkwave.story.replay("1-1.intro")');
      for (let k = 0; k < i; k++) { await page.evaluate('__inkwave.story.layer.runner.advance(); __inkwave.story.layer.runner.advance()'); }
      const at = await page.evaluate('__inkwave.story.layer.runner.cur.index') as number;
      await key(page, 'Tab');
      const st = await page.evaluate('({ cur: !!__inkwave.story.layer.runner.cur, last: __ev.filter((e) => e[0] === "story:end").slice(-1)[0] })') as { cur: boolean; last: [string, string, boolean] };
      skipRes.push({ at, ended: !st.cur, skipped: !!st.last && st.last[2] === true });
    }
    ok('dialogue.skip.everyLine', skipRes.every((r, i) => r.at === i && r.ended && r.skipped), skipRes);
    // 진행 키(Enter): 타이핑 중 → 전체, 다시 → 다음 줄
    await page.evaluate('__inkwave.story.replay("1-1.intro")'); await wait(100);
    const typed0 = await page.evaluate('__inkwave.story.layer.runner.cur.shown') as number;
    await key(page, 'Enter');
    const full = await page.evaluate('({ shown: __inkwave.story.layer.runner.cur.shown, idx: __inkwave.story.layer.runner.cur.index })') as { shown: number; idx: number };
    await key(page, 'Enter');
    const idx2 = await page.evaluate('__inkwave.story.layer.runner.cur && __inkwave.story.layer.runner.cur.index');
    ok('dialogue.advance', full.idx === 0 && full.shown > typed0 && idx2 === 1, { typed0, full, idx2 });
    // 초상 렌더 비용: 2초 동안 PortraitView.render CPU 시간 평균
    // 첫 0.5초(셰이더·타깃 준비)를 빼고 4초 동안 프레임마다 PortraitView.render의 CPU 시간
    const pcost = await page.evaluate(`new Promise((res) => { const p = __inkwave.story.layer.portrait, xs = []; const t = performance.now(); const f = () => { const e = performance.now() - t; if (p.visible && e > 500) xs.push(p.lastMs); if (e < 4500) requestAnimationFrame(f); else { const s = xs.slice().sort((a, b) => a - b); res({ n: xs.length, avg: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), median: s[s.length >> 1], max: Math.max(0, ...xs) }); } }; requestAnimationFrame(f); })`) as { n: number; avg: number; median: number; max: number };
    ok('portrait.cpu', pcost.n > 20 && pcost.avg <= 0.6, pcost);
    // 초상 GPU 시간(EXT_disjoint_timer_query_webgl2): PortraitView.render 하나를 쿼리로 감싸 2초 동안 평균(인물을 다시 그리는 프레임 포함)
    const pgpu = await page.evaluate(`(async () => { const p = __inkwave.story.layer.portrait, gl = __inkwave.R.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return { ext: false };
      __inkwave.story.replay('1-1.intro');
      const qs = [], o = p.render.bind(p); p.render = (r) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); o(r); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); };
      await new Promise((r) => setTimeout(r, 2500)); p.render = o;
      await new Promise((r) => setTimeout(r, 300));
      const ms = []; for (const q of qs) { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
      const s = ms.slice().sort((a, b) => a - b);
      return { ext: true, n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length), p95: s[Math.floor(s.length * 0.95)] ?? 0 }; })()`) as { ext: boolean; n?: number; avg?: number; p95?: number };
    ok('portrait.gpu', !pgpu.ext || ((pgpu.n ?? 0) > 20 && (pgpu.avg ?? 9) <= 0.6), pgpu);
    await shot(page, 'portrait');
    await page.evaluate('__inkwave.story.layer.runner.skip()');
    // 첫 처치 통신: 적을 쓰러뜨리면 1-1.firstKill
    // 1-1 시작점(발코니)에는 적이 없다: 중계기 A 구역에 들어가 경계 사격병이 나오면 쓰러뜨린다
    await page.evaluate(`(() => { const s = __inkwave.session, me = __ctx.G.local, p = s._ground([-12, 3, -27]); me.pos.set(p.x, p.y, p.z); me.vel.set(0, 0, 0); me.invuln = 999; })()`);
    await page.waitForFunction('__ctx.G.match.actors.some((a) => a.team !== __ctx.G.local.team && a.alive)', { timeout: 60000, polling: 100 });
    await page.evaluate(`(() => { const G = __ctx.G, me = G.local; const e = G.match.actors.find((a) => a.team !== me.team && a.alive); e.damage(999, me, 'weapon'); })()`);
    await wait(400);
    ok('story.firstKill.comm', (await page.evaluate('__inkwave.story.layer.runner.cur && __inkwave.story.layer.runner.cur.script.id')) === '1-1.firstKill');
    await wait(500); await shot(page, 'comm-firstkill');
    // 패널 건너뛰기 뒤 복귀: 보스 등장 3컷을 재생하고 1초 뒤 아무 키
    await page.evaluate('__inkwave.story.layer.runner.clear(); __inkwave.story.playPanels("1-3.bossIntro")');
    await wait(1200); await shot(page, 'boss-intro');
    await key(page, 'KeyX'); await wait(300);
    const back = await page.evaluate('({ playing: __inkwave.story.panels.playing, hold: __inkwave.campaignPreview.time.held, rig: __inkwave.rig.mode, block: __inkwave.campaignPreview.combat.inputBlocked, scale: __inkwave.campaignPreview.time.scale, vis: __ctx.G.local.character.root.visible })');
    ok('panel.skip.restore', JSON.stringify(back) === JSON.stringify({ playing: false, hold: false, rig: 'follow', block: false, scale: 1, vis: true }), back);
    // 1장 에필로그 4컷
    await page.evaluate('__inkwave.story.playPanels("ch1.epilogue")'); await wait(1500); await shot(page, 'epilogue-1');
    await wait(4200); await shot(page, 'epilogue-2');
    await wait(4200); await shot(page, 'epilogue-3');
    await wait(5200); await shot(page, 'epilogue-4');
    await page.waitForFunction('!__inkwave.story.panels.playing', { timeout: 30000, polling: 100 });
    const ep = await page.evaluate('__ev.filter((e) => e[0] === "story:panel" && e[1] === "ch1.epilogue").map((e) => e[2])');
    ok('panel.epilogue.4shots', JSON.stringify(ep) === '["e1","e2","e3","e4"]', ep);
    // 메뉴로 나가면 이야기 상태가 남지 않는다
    await page.evaluate('__inkwave.quitToMenu()'); await wait(1500);
    const clean = await page.evaluate('({ campaign: __ctx.G.campaign, mission: __inkwave.story.mission, dlg: !!__inkwave.story.layer.runner.cur })');
    ok('story.quit.clean', JSON.stringify(clean) === JSON.stringify({ campaign: null, mission: null, dlg: false }), clean);
    await page.close();
  }

  // ---------------------------------------------------------------- 작업장·항구 지도·기록판
  // 패드는 가짜 Gamepad(navigator.getGamepads 대체, 표준 매핑)로 누른다: main의 pollPad → _padMenus 경로를 그대로 탄다.
  // ---------------------------------------------------------------- 읽은 대본 기록 = 캠페인 저장 dialogueLog(35번 R026)
  if (only.has('dlog')) {
    // 캠페인 저장이 없을 때 읽은 대본(임시 inkwave.storylog)이 있고, 새 게임이 생기면 저장으로 옮겨진다
    const page = await open('', true, false, undefined, JSON.stringify({ v: 1, read: ['1-1.intro'], records: [] }));
    await page.evaluate(`new Promise((r) => { __inkwave.store.port.close && __inkwave.store.port.close(); const q = indexedDB.deleteDatabase('inkwave-campaign'); q.onsuccess = q.onerror = q.onblocked = () => r(0); })`);
    await page.evaluate(`(async () => { const g = __inkwave; g.store.current = null; await g.store.init(); await g.store.newGame(Date.now(), 'normal'); await g.store.busy; await new Promise((r) => setTimeout(r, 300)); await g.store.busy; })()`);
    const mig = await page.evaluate('__inkwave.store.current.dialogueLog.slice()') as string[];
    ok('dlog.migrate', mig.includes('1-1.intro'), mig);
    // 기록판 다시 읽기를 끝까지 넘기면 그 대본이 캠페인 저장에 남는다
    await page.evaluate('__inkwave.story.replay("1-2.intro")'); await wait(200);
    await page.evaluate('__inkwave.story.layer.runner.skip()'); await wait(400);
    await page.evaluate('__inkwave.store.busy');
    const after = await page.evaluate('__inkwave.store.current.dialogueLog.slice()') as string[];
    ok('dlog.read→save', after.includes('1-2.intro'), after);
    await page.close();
    // 새로고침: 임시 기록을 지워도 캠페인 저장에서 읽은 대본(기록판)이 복원된다
    const p2 = await open('', false);
    await p2.evaluate('localStorage.removeItem("inkwave.storylog")'); await p2.reload({ waitUntil: 'load' });
    await p2.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main" && __inkwave.store.current', { timeout: 180000, polling: 250 });
    const read = await p2.evaluate('__inkwave.api.storyRead ? __inkwave.api.storyRead() : null') as string[] | null;
    const fromLog = await p2.evaluate('__inkwave.story.log.data.read.slice()') as string[];
    ok('dlog.reload', !!read && read.includes('1-1.intro') && read.includes('1-2.intro') && fromLog.includes('1-2.intro'), { read, fromLog });
    await p2.close();
  }

  // ---------------------------------------------------------------- 작업장 허브(35번 R028): 로딩·시선 글라이드·색 회복·진입
  if (only.has('hub')) {
    // 로딩: 새 페이지(세트 캐시 없음)마다 한 번씩. 기존 로비 세트(온라인 허브) 대비 작업장(모라·틸·소품) 준비 시간
    const READY = (cast: boolean) => `(async () => { const sc = __inkwave.showcase, t0 = performance.now();
      if (${cast}) sc.showWorkshop(null, null, null, { sat: 0.18 }); else sc.showHub(null, null, null);
      while (performance.now() - t0 < 30000) { await new Promise((r) => requestAnimationFrame(r)); const L = sc.lob, W = sc._ws;
        const setOk = !!(L && L.set && L.k > 0.99); const castOk = !${cast} || (!!W && W.chars.size === 2 && [...W.chars.values()].every((c) => c.root.visible) && W.props.size === 2);
        if (setOk && castOk) return performance.now() - t0; }
      return -1; })()`;
    const loads: { hub: number[]; ws: number[] } = { hub: [], ws: [] };
    for (let i = 0; i < 3; i++) {
      for (const cast of [false, true]) {
        const p = await open('', false);
        loads[cast ? 'ws' : 'hub'].push(Math.round(await p.evaluate(READY(cast)) as number));
        await p.close();
      }
    }
    const med = (a: number[]): number => a.slice().sort((x, y) => x - y)[a.length >> 1];
    ok('hub.load.within1s', loads.hub.every((v) => v > 0) && loads.ws.every((v) => v > 0) && med(loads.ws) - med(loads.hub) <= 1000, { ...loads, medHub: med(loads.hub), medWs: med(loads.ws) });
    // 시선 글라이드: 고른 인물·소품 쪽으로 카메라가 돌아간다(몸체는 세트 자리)
    const page = await open('', false);
    await page.evaluate(READY(true));
    const glide = await page.evaluate(`(async () => { const sc = __inkwave.showcase, W = sc._ws, cam = sc.lob.cam, V = cam.position.constructor;
      const ang = (o) => { const f = new V(0, 0, -1).applyQuaternion(cam.quaternion); const d = new V(o.x, o.y + 0.9, o.z).sub(cam.position).normalize(); return Math.acos(Math.min(1, f.dot(d))) * 180 / Math.PI; };
      const tgt = { mora: W.chars.get('mora').root.position, teal: W.chars.get('teal').root.position, board: W.props.get('board').position, rack: W.props.get('rack').position };
      const out = {}; const pos0 = cam.position.clone();
      for (const k of Object.keys(tgt)) { sc.workshopFocus(null); await new Promise((r) => setTimeout(r, 1200)); const before = ang(tgt[k]); sc.workshopFocus(k); await new Promise((r) => setTimeout(r, 1200)); out[k] = { before: +before.toFixed(1), after: +ang(tgt[k]).toFixed(1) }; }
      return { out, moved: +cam.position.distanceTo(pos0).toFixed(3) }; })()`) as { out: Record<string, { before: number; after: number }>; moved: number };
    ok('hub.glide', Object.values(glide.out).every((g) => g.after < g.before - 2) && glide.moved < 0.05, glide);
    // 색 회복: 1-1 전(0.18)에는 작업장 둘레만 채색, 광장 복구(1.0)면 전부 채색, 작업장을 떠나면 해제
    const col = await page.evaluate(`(async () => { const sc = __inkwave.showcase, R = __inkwave.R; const snap = () => { const c = R._overlayColorReturn; return c ? { sat: c.worldSat, n: c.spheres.length } : null; };
      sc.showWorkshop(null, null, null, { sat: 0.18 }); await new Promise((r) => setTimeout(r, 300)); const lost = snap();
      sc.showWorkshop(null, null, null, { sat: 1 }); await new Promise((r) => setTimeout(r, 300)); const full = snap();
      sc.showHub(null, null, null); await new Promise((r) => setTimeout(r, 300)); const hub = snap();
      return { lost, full, hub }; })()`) as { lost: { sat: number; n: number } | null; full: { sat: number; n: number } | null; hub: unknown };
    ok('hub.color', !!col.lost && col.lost.sat === 0.18 && col.lost.n === 1 && !!col.full && col.full.sat === 1 && col.full.n === 0 && col.hub === null, col);
    await shot(page, 'hub-workshop');
    // 메뉴 항목 → 시선 대상, 임무·장비·특성·기록 진입
    await page.evaluate(`(async () => { const g = __inkwave; if (!g.store.current) await g.store.newGame(Date.now(), 'normal'); g.menus.show('workshop'); })()`);
    await wait(1200);
    const map = await page.evaluate(`(async () => { const m = __inkwave.menus, sc = __inkwave.showcase, out = {};
      for (const b of document.querySelectorAll('.iw-ws .iw-main__menu [data-id]')) { m._setFocus(b); await new Promise((r) => setTimeout(r, 60)); out[b.dataset.id] = sc._ws.focus; }
      return out; })()`) as Record<string, string | null>;
    ok('hub.focusMap', map.mission === 'teal' && map.gear === 'rack' && map.modules === 'rack' && map.craft === 'mora' && map.perks === 'mora' && map.records === 'board', map);
    const enter: Record<string, string | null> = {};
    for (const [id, want] of [['mission', 'harbor'], ['gear', 'loadout'], ['perks', 'campTraits'], ['records', 'records']] as const) {
      await page.evaluate(`__inkwave.menus.show('workshop')`); await wait(700);
      await page.evaluate(`(() => { const b = document.querySelector('.iw-ws .iw-main__menu [data-id="${id}"]'); __inkwave.menus._setFocus(b); })()`); await wait(100);
      await key(page, 'Enter'); await wait(700);
      enter[id] = await page.evaluate('__inkwave.menus.current') as string | null;
      if (enter[id] !== want) enter[id] = `${enter[id]} (기대 ${want})`;
    }
    ok('hub.enter', enter.mission === 'harbor' && enter.gear === 'loadout' && enter.perks === 'campTraits' && enter.records === 'records', enter);
    await page.close();
  }

  // ---------------------------------------------------------------- 가벼운 시작 화면(34번 F02)
  if (only.has('lite')) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(`try { if (!sessionStorage.getItem('lite-init')) { sessionStorage.setItem('lite-init', '1'); localStorage.clear(); } } catch {}`);
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?novc`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('document.querySelector(".iw-title .iw-lite")', { timeout: 60000, polling: 200 });
    await wait(1500);
    const dom = await page.evaluate(`({ canvas: !!document.querySelector('#app canvas'), lite: document.body.classList.contains('iw-boot-lite'), title: !!document.querySelector('.iw-title'), on: document.querySelector('.iw-lite__chip.is-on')?.dataset.q, renderer: !!(window.__G && window.__G.renderer), pads: document.querySelector('.iw-lite__pads')?.textContent })`) as Record<string, unknown>;
    ok('lite.domFirst', dom.title === true && dom.lite === true && dom.canvas === false && dom.renderer === false && dom.on === 'low' && typeof dom.pads === 'string', dom);
    await shot(page, 'lite-title');
    await page.click('.iw-lite__chip[data-q="medium"]'); await wait(200);
    const saved = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('inkwave.settings') || '{}'); return { q: s.quality, chosen: s.qualityChosen, note: document.querySelector('.iw-lite__note').textContent }; })()`) as { q: string; chosen: boolean; note: string };
    ok('lite.quality.saved', saved.q === 'medium' && saved.chosen === true && /저장했다/.test(saved.note), saved);
    // 언어: English를 고르면 타이틀이 영어로 다시 그려지고 문서 lang이 바뀐다. 한국어로 되돌린다
    await page.click('.iw-lite__chip[data-l="en"]'); await wait(400);
    const en = await page.evaluate(`({ start: document.querySelector('.iw-lite__start')?.textContent, lang: document.documentElement.lang, saved: JSON.parse(localStorage.getItem('inkwave.settings') || '{}').locale })`) as { start: string; lang: string; saved: string };
    await page.click('.iw-lite__chip[data-l="ko"]'); await wait(400);
    const ko = await page.evaluate(`({ start: document.querySelector('.iw-lite__start')?.textContent, lang: document.documentElement.lang })`) as { start: string; lang: string };
    ok('lite.locale', en.start === 'Start' && en.lang === 'en' && en.saved === 'en' && ko.start === '시작' && ko.lang === 'ko', { en, ko });
    await page.click('.iw-lite__start');
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await wait(3500);
    const after = await page.evaluate(`({ q: __inkwave.settings.quality, rq: __inkwave.R.q.msaa, match: __inkwave.match, still: document.body.classList.contains('iw-static-menu'), lob: !!(__inkwave.showcase.lob), cap: __inkwave.settings.fpsCap, pr: __inkwave.R.renderer.getPixelRatio(), w: innerWidth, h: innerHeight, maxPx: __inkwave.R.q.maxPixels })`) as Record<string, unknown>;
    ok('lite.afterStart', after.q === 'medium' && after.match === null && after.still === true && after.lob === false && after.cap === 60, after);
    ok('lite.pixelCap', (after.w as number) * (after.h as number) * (after.pr as number) ** 2 <= (after.maxPx as number) * 1.001, after);
    // 컨텍스트 손실: DOM 안내 + 다시 불러오기, 복구되면 닫힘(자동 재시작 반복 없음)
    const lost = await page.evaluate(`(async () => { const gl = __inkwave.R.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { ext: false }; ext.loseContext(); await new Promise((r) => setTimeout(r, 500)); const on = !!document.getElementById('iw-ctxlost'); const btn = document.querySelector('#iw-ctxlost button')?.textContent; ext.restoreContext(); await new Promise((r) => setTimeout(r, 800)); return { ext: true, on, btn, off: !document.getElementById('iw-ctxlost') }; })()`) as { ext: boolean; on?: boolean; btn?: string; off?: boolean };
    ok('lite.contextLost', !lost.ext || (lost.on === true && lost.btn === '다시 불러오기' && lost.off === true), lost);
    await page.close();
  }

  if (only.has('harbor')) {
    const LOG = JSON.stringify({ v: 1, read: ['1-1.intro', '1-1.firstKill'], records: ['rec.tidewater.1'] });
    const page = await open('', false, true, undefined, LOG);
    await page.evaluate('__inkwave.menus.show("main", { force: true })'); await wait(400);
    await page.evaluate('__inkwave.menus._go("workshop")');
    await page.waitForFunction('__inkwave.showcase.fullFrame && __inkwave.showcase._ws && __inkwave.showcase._ws.chars.size === 2', { timeout: 60000, polling: 250 }).then(() => ok('workshop.set', true), () => ok('workshop.set', false));
    await wait(1200);
    ok('workshop.items', JSON.stringify(await menuIds(page)) === JSON.stringify(['mission', 'gear', 'modules', 'craft', 'perks', 'manage', 'records']), await menuIds(page));
    await shot(page, 'workshop');
    await key(page, 'ArrowDown'); await wait(800); await shot(page, 'workshop-gear');
    await key(page, 'ArrowUp');
    await key(page, 'Enter'); await wait(700);
    ok('harbor.open', (await page.evaluate('__inkwave.menus.current')) === 'harbor');
    ok('harbor.focus.next', (await focusId(page)) === 'm-1-1', await focusId(page));
    await key(page, 'ArrowDown');
    const f2 = await focusId(page);
    ok('harbor.kbd.move', f2 !== 'm-1-1' && !!f2, f2);
    await shot(page, 'harbor');
    // 잠긴 임무는 시작하지 않는다
    await page.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"m-1-2\\"]"))');
    await key(page, 'Enter');
    ok('harbor.locked', (await page.evaluate('__inkwave.menus.current')) === 'harbor');
    // 패드: 처음 보는 패드의 첫 누름은 활성화 몸짓이라 소비하지 않는다(32번 4.2절). 1-1은 지도 맨 아래라 위로 갔다가
    // 아래로 돌아오고 A로 1-1 시작
    await page.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"m-1-1\\"]"))');
    await pad(page, 0);
    const p0 = await focusId(page);
    await pad(page, 12);
    const pf = await focusId(page);
    await pad(page, 13);
    const pb = await focusId(page);
    ok('harbor.pad.move', p0 === 'm-1-1' && pf !== 'm-1-1' && pb === 'm-1-1', { p0, pf, pb });
    await pad(page, 0);
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.story.mission === "1-1"', { timeout: 120000, polling: 250 }).then(() => ok('harbor.pad.start', true), () => ok('harbor.pad.start', false));
    await page.evaluate('__inkwave.quitToMenu()'); await wait(1500);
    // 기록판
    await page.evaluate('__inkwave.menus._go("records")'); await wait(600);
    // 읽은 대본(1-1 시작부터 2개 이상) + 기록 전부(찾지 못한 것은 ???). 엔딩 뒤 항목(도전·공략)은 이 저장에서 열리지 않는다
    const rec = await page.evaluate('({ s: document.querySelectorAll(".iw-rec__item[data-id^=\\"s-\\"]").length, r: document.querySelectorAll(".iw-rec__item[data-id^=\\"r-\\"]").length, want: __inkwave.menus.api.storyRecords().length, body: document.querySelector(".iw-rec__body").textContent.slice(0, 40) })') as { s: number; r: number; want: number; body: string };
    ok('records.list', rec.s >= 2 && rec.r === rec.want && rec.want > 0 && rec.body.length > 0, rec);
    await shot(page, 'records');
    await page.close();
    // 360 px 터치 화면: 지도가 가로로 스크롤되고(포커스 이동·손가락 끌기), 탭으로 임무를 고른다
    const mob = await open('', false, false, { width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, LOG);
    await mob.evaluate('__inkwave.menus._go("harbor")'); await wait(900);
    const sc = await mob.evaluate('(() => { const s = document.querySelector(".iw-harbor__scroll"); return { sw: s.scrollWidth, cw: s.clientWidth, x0: s.scrollLeft, docW: document.documentElement.scrollWidth }; })()') as { sw: number; cw: number; x0: number; docW: number };
    await mob.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"m-7-3\\"]"))');
    // 부드러운 스크롤은 저프레임 headless에서 늦게 끝난다: 고정 대기 대신 움직일 때까지(최대 6초) 기다린다
    await mob.waitForFunction(`document.querySelector(".iw-harbor__scroll").scrollLeft > ${sc.x0 + 100}`, { timeout: 6000, polling: 100 }).catch(() => undefined);
    const x1 = await mob.evaluate('document.querySelector(".iw-harbor__scroll").scrollLeft') as number;
    ok('harbor.360.scroll', sc.sw > sc.cw && x1 > sc.x0 + 100 && sc.docW <= 360, { ...sc, x1 });
    await shot(mob, 'harbor-360');
    await mob.evaluate('document.querySelector(".iw-harbor__scroll").scrollLeft = 0'); await wait(200);
    // 손가락 끌기(왼쪽으로 200 px) → 스크롤
    const box = await mob.evaluate('(() => { const r = document.querySelector(".iw-harbor__scroll").getBoundingClientRect(); return { x: r.x + r.width * 0.8, y: r.y + r.height * 0.5 }; })()') as { x: number; y: number };
    const cdp = await mob.createCDPSession();
    const touch = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] } as never);
    await touch('touchStart', box.x, box.y);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', box.x - i * 25, box.y); await wait(16); }
    await touch('touchEnd', 0, 0); await wait(500);
    const x2 = await mob.evaluate('document.querySelector(".iw-harbor__scroll").scrollLeft') as number;
    ok('harbor.touch.drag', x2 > 60, x2);
    await mob.evaluate('document.querySelector(".iw-harbor__scroll").scrollLeft = 0'); await wait(200);
    const tap = await mob.evaluate('(() => { const b = document.querySelector("[data-id=\\"m-1-1\\"]").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()') as { x: number; y: number };
    await mob.touchscreen.tap(tap.x, tap.y);
    await mob.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.story.mission === "1-1"', { timeout: 120000, polling: 250 }).then(() => ok('harbor.touch.start', true), () => ok('harbor.touch.start', false));
    await mob.close();
  }

  // ---------------------------------------------------------------- 이야기 결과: 저장 실패 → 미확정 → 재시도 확정, 반복 완료
  if (only.has('results')) {
    const page = await open('', false);
    const demo = (first: boolean) => `({ mission: '1-1', title: '멈춘 시계 아래', district: 'tidewater', firstClear: ${first},
      rewards: [{ name: '복구자 모듈', kind: '모듈' }, { name: '잉크 부품 ×3', kind: '재료' }], xp: { from: 20, to: 70, max: 100 },
      line: { speaker: 'mora', text: '새 부품보다 네가 만든 길이 먼저였구나.' }, next: { id: '1-2', title: '지워지는 발자국' },
      commit: () => { window.__saveN = (window.__saveN || 0) + 1; return Promise.resolve(window.__saveN > 1); } })`;
    await page.evaluate(`window.__saveN = 0; __inkwave.menus.showStoryResults(${demo(true)})`);
    await wait(1200); await shot(page, 'results-1-color');
    await wait(2600);
    const s1 = await page.evaluate('({ saved: [...document.querySelectorAll(".iw-sres")].pop().dataset.saved, retry: ![...document.querySelectorAll(".iw-sres__retry")].pop().hidden, n: __saveN })');
    ok('results.fail.unconfirmed', JSON.stringify(s1) === JSON.stringify({ saved: 'fail', retry: true, n: 1 }), s1);
    await shot(page, 'results-2-fail');
    await page.click('.iw-sres__retry'); await wait(1800);
    const s2 = await page.evaluate('({ saved: [...document.querySelectorAll(".iw-sres")].pop().dataset.saved, step: [...document.querySelectorAll(".iw-sres")].pop().dataset.step, n: __saveN })');
    ok('results.retry.confirmed', JSON.stringify(s2) === JSON.stringify({ saved: 'ok', step: '5', n: 2 }), s2);
    await shot(page, 'results-3-ok');
    // 반복 완료: 색 회복·첫 완료 표시가 다시 나오지 않는다
    await page.evaluate(`window.__saveN = 1; __inkwave.menus.showStoryResults(${demo(false)})`);
    await wait(300);
    const s3 = await page.evaluate('({ first: [...document.querySelectorAll(".iw-sres")].pop().classList.contains("is-first"), em: !![...document.querySelectorAll(".iw-sres")].pop().querySelector(".iw-sres__title em"), step: [...document.querySelectorAll(".iw-sres")].pop().dataset.step })') as { first: boolean; em: boolean; step: string };
    ok('results.repeat.noFirst', !s3.first && !s3.em, s3);
    await page.close();
  }
  // 34번 F06: 영어 선택 상태에서 메뉴·캠페인 화면을 돌며 보이는 글자에 한글이 남지 않는지 본다(언어 이름 행은 제외)
  if (only.has('en')) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(`try { if (!sessionStorage.getItem('en-init')) { sessionStorage.setItem('en-init', '1'); localStorage.clear(); localStorage.setItem('inkwave.settings', JSON.stringify({ locale: 'en' })); } } catch {}`);
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?skipTitle`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await wait(800);
    const hangul = (): Promise<string[]> => page.evaluate(`(() => {
      const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const keep = new Set(['한국어', '언어 / Language', 'Language / 언어']);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = n.textContent.trim(); const el = n.parentElement;
        if (!s || !/[가-힣]/.test(s) || keep.has(s) || !el || el.closest('script,style,[hidden]')) continue;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        out.add(s.slice(0, 80));
      }
      return [...out];
    })()`) as Promise<string[]>;
    const seen: Record<string, string[]> = {};
    for (const name of ['main', 'arena', 'harbor', 'records', 'workshop', 'campGear', 'campTraits', 'campManage', 'campCraft', 'mode', 'setup', 'locker', 'settings', 'howto', 'credits', 'online']) {
      try { await page.evaluate(`__inkwave.menus.show(${JSON.stringify(name)}, { instant: true })`); } catch (e) { seen[name] = ['(열기 실패) ' + String(e).slice(0, 80)]; continue; }
      await wait(900);
      const left = await hangul();
      if (left.length) seen[name] = left;
      await shot(page, 'en-' + name);
    }
    await page.evaluate(`__inkwave.menus.showStoryResults({ mission: '1-1', title: '멈춘 시계 아래', district: 'tidewater', firstClear: true,
      rewards: [{ name: '+3', kind: '부품' }, { name: '+40', kind: '경험치' }], xp: { from: 20, to: 70, max: 100 }, line: { speaker: 'mora', text: '새 부품보다 네가 만든 길이 먼저였구나.' },
      next: { id: '1-2', title: '지워지는 발자국' }, commit: () => Promise.resolve(true) })`);
    await wait(1200);
    const res = await hangul(); if (res.length) seen.storyResults = res;
    await shot(page, 'en-storyResults');
    ok('en.noHangul', Object.keys(seen).length === 0, seen);
    // 1-1 시작: 프롤로그 패널 → 시작 대본 → 전투 HUD
    await page.evaluate('__inkwave.menus.show("main", { instant: true })'); await wait(800);
    const play: Record<string, string[]> = {};
    await key(page, 'Enter'); await wait(800);
    if ((await page.evaluate('__inkwave.menus.current')) === 'locker') await key(page, 'Escape');
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.story.panels.playing', { timeout: 180000, polling: 200 });
    await wait(1500);
    let left = await hangul(); if (left.length) play.panel = left;
    await shot(page, 'en-panel');
    await page.waitForFunction('!__inkwave.story.panels.playing', { timeout: 40000, polling: 100 });
    await wait(1600);
    left = await hangul(); if (left.length) play.dialogue = left;
    await shot(page, 'en-dialogue');
    await page.waitForFunction('!__inkwave.story.layer.runner.cur', { timeout: 30000, polling: 100 });
    await wait(2500);
    left = await hangul(); if (left.length) play.hud = left;
    await shot(page, 'en-hud');
    ok('en.play.noHangul', Object.keys(play).length === 0, play);
    await page.close();
  }
} finally {
  await browser.close();
}
ok('errors', errors.length === 0, errors.slice(0, 8));
console.log(JSON.stringify(results, null, 1));
if (fail) process.exit(1);
