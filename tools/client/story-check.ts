// 이야기 구조 실행 검수(35번 R025~R031). 개발 서버에 headless Chrome으로 붙어 다음을 실제 화면으로 확인하고 스크린숏을 남긴다.
//   메뉴: 이야기 우선 순서·이어하기 표시 조건·항구 대전 하위 메뉴(대전·온라인 진입 경로)
//   이야기 시작: 첫 실행 라커 경유 → 1장 프롤로그 패널(4컷) → 1-1 시작 대본(막는 대본) → 전투
//   패널: 컷 진행·건너뛰기 뒤 카메라(follow)·시간 배율(hold 해제)·입력 차단 복귀
//   대화: 모든 줄에서 건너뛰기, 진행 키, 초상 렌더 비용, 1-1 시작 대본 길이
//   항구 지도: 키보드 이동·360 px 폭 가로 스크롤, 기록판, 이야기 결과(저장 실패 → 미확정 → 재시도 확정)
//
// usage: node .tools/story-check.js [--port 8490] [--only menu,story,panels,dialogue,harbor,results]
// 결과: 표준 출력 JSON, shots/story/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'menu,story,panels,dialogue,harbor,results').split(','));
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
const pad = async (page: Page, i: number): Promise<void> => { await page.evaluate(`__padState.buttons[${i}] = true`); await wait(120); await page.evaluate(`__padState.buttons[${i}] = false`); await wait(250); };

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
    await wait(600);
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
    await shot(page, 'portrait');
    await page.evaluate('__inkwave.story.layer.runner.skip()');
    // 첫 처치 통신: 적을 쓰러뜨리면 1-1.firstKill
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
  if (only.has('harbor')) {
    const LOG = JSON.stringify({ v: 1, read: ['1-1.intro', '1-1.firstKill'], records: ['rec.tidewater.1'] });
    const page = await open('', false, true, undefined, LOG);
    await page.evaluate('__inkwave.menus.show("main", { force: true })'); await wait(400);
    await page.evaluate('__inkwave.menus._go("workshop")');
    await page.waitForFunction('__inkwave.showcase.fullFrame && __inkwave.showcase._ws && __inkwave.showcase._ws.chars.size === 2', { timeout: 60000, polling: 250 }).then(() => ok('workshop.set', true), () => ok('workshop.set', false));
    await wait(1200);
    ok('workshop.items', JSON.stringify(await menuIds(page)) === JSON.stringify(['mission', 'gear', 'perks', 'records']), await menuIds(page));
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
    // 패드: 아래·위로 움직이고 A로 1-1 시작
    await page.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"m-1-1\\"]"))');
    await pad(page, 13);
    const pf = await focusId(page);
    await pad(page, 12);
    const pb = await focusId(page);
    ok('harbor.pad.move', pf !== 'm-1-1' && pb === 'm-1-1', { pf, pb });
    await pad(page, 0);
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.story.mission === "1-1"', { timeout: 120000, polling: 250 }).then(() => ok('harbor.pad.start', true), () => ok('harbor.pad.start', false));
    await page.evaluate('__inkwave.quitToMenu()'); await wait(1500);
    // 기록판
    await page.evaluate('__inkwave.menus._go("records")'); await wait(600);
    const rec = await page.evaluate('({ items: document.querySelectorAll(".iw-rec__item").length, body: document.querySelector(".iw-rec__body").textContent.slice(0, 40) })') as { items: number; body: string };
    ok('records.list', rec.items === 2 + 14 && rec.body.length > 0, rec);
    await shot(page, 'records');
    await page.close();
    // 360 px 터치 화면: 지도가 가로로 스크롤되고(포커스 이동·손가락 끌기), 탭으로 임무를 고른다
    const mob = await open('', false, false, { width: 360, height: 740, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, LOG);
    await mob.evaluate('__inkwave.menus._go("harbor")'); await wait(900);
    const sc = await mob.evaluate('(() => { const s = document.querySelector(".iw-harbor__scroll"); return { sw: s.scrollWidth, cw: s.clientWidth, x0: s.scrollLeft, docW: document.documentElement.scrollWidth }; })()') as { sw: number; cw: number; x0: number; docW: number };
    await mob.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"m-7-3\\"]"))'); await wait(900);
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
} finally {
  await browser.close();
}
ok('errors', errors.length === 0, errors.slice(0, 8));
console.log(JSON.stringify(results, null, 1));
if (fail) process.exit(1);
