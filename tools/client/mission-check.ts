// 캠페인 임무 실행 검사(33번 T022~T046). 개발 서버의 실제 게임에서 임무를 열고, 플레이어를 목표로 옮기며 바닥을 칠하고
// 적을 실제 피해 경로(Actor.damage)로 쓰러뜨려 목표·체크포인트·저장·결과를 확인한다. 순간 이동·직접 도색은 "논리 검사"이며
// 사람이 조작하는 완주(T040·T043·T047)를 대신하지 않는다.
//
// usage: node .tools/mission-check.js [--port 8490] [--mission 1-1] [--fresh] [--shots]
// 결과: 표준 출력 JSON, shots/mission/*.png. 실패가 있으면 종료 코드 1이다.
import puppeteer, { type Page, KnownDevices } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), only = opt('mission', '1-1,1-2,1-3').split(',');
const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/mission', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `(() => {
  const g = window.__inkwave, G = window.__G;
  const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const S = () => g.session;
  // 대화·패널 건너뛰기(막는 대본이 있으면 입력이 막힌다)
  const skipStory = () => { try { const st = g.story; if (st) { st.panels.playing && st.panels.skip && st.panels.skip(); if (st.layer.runner.busy) { st.layer.runner.clear(); } } } catch (e) {} };
  const tp = (x, y, z) => { const a = G.local; const s = S(); const yy = s._ground([x, y, z]).y; a.pos.set(x, yy, z); a.vel.set(0, 0, 0); a.invuln = 999; };
  const paintAt = (x, z, r) => { const s = S(); const p = s._ground([x, 3, z]); const THREE = p.constructor; for (const k of [0.35, 0.75]) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; G.paint.splat(new THREE(p.x + Math.cos(a) * r * k, p.y + 0.3, p.z + Math.sin(a) * r * k), 1.4, 0, { seed: i }); } G.paint.splat(new THREE(p.x, p.y + 0.3, p.z), 2.2, 0, { seed: 99 }); G.paint.flush(0); };
  const paintOf = (id) => { const s = S(); const d = s.mission.devices.find((x) => x.id === id); return s._floorPaint(d, 0); };
  const kill = (a) => { let n = 0; while (a.alive && n++ < 200) a.damage(50, G.local, 'weapon'); };
  const killAll = () => { for (const a of S().encounters.liveActors()) kill(a); };
  const state = () => { const s = S(); if (!s) return null; return { st: s.state, cur: s.objectives.current() && s.objectives.current().id, done: s.objectives.snapshot(), cp: s.cp.checkpointId, live: s.encounters.liveActors().map((a) => a.bot && a.bot.unit.id), enc: Object.fromEntries([...s.encounters.runs].map(([k, r]) => [k, r.state])), hud: document.querySelector('.iw-camp__label')?.textContent, block: document.querySelector('.iw-camp__block')?.textContent, alive: G.local && G.local.alive }; };
  g.pause = () => {};   // headless: 포커스·포인터 잠금 변화로 멈추지 않게
  window.__m = { g, G, frames, S, skipStory, tp, paintAt, paintOf, kill, killAll, state };
  return true;
})()`;

const browser = await puppeteer.launch({
  executablePath, headless: true, protocolTimeout: 600000,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});

async function openFresh(): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String((e as Error).stack || e).split(/\r?\n/).slice(0, 4).join(' | ')));
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  // 새 저장으로 시작
  await page.evaluate(`new Promise((r) => { const q = indexedDB.deleteDatabase('inkwave-campaign'); q.onsuccess = q.onerror = q.onblocked = () => r(0); })`);
  await page.evaluate(`(async () => { const g = window.__inkwave; g.store.port.close(); g.store.current = null; await g.store.init(); })()`);
  await page.evaluate(HELPERS);
  return { page, errors };
}
const ev = <T>(page: Page, js: string): Promise<T> => page.evaluate(js) as Promise<T>;
const st = (page: Page) => ev<Record<string, unknown> & { st: string; cur: string | null; done: string[]; cp: string | null; live: string[]; enc: Record<string, string>; alive: boolean }>(page, '__m.state()');
async function start(page: Page, id: string, resume = false): Promise<void> {
  await page.evaluate(`__inkwave.startCampaign('${id}', { prologue: false, resume: ${resume} })`);
  await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat" && __inkwave.match && __inkwave.match.state === "playing"', { timeout: 180000, polling: 200 });
  await page.evaluate(HELPERS);
  for (let i = 0; i < 10; i++) { await ev(page, '__m.skipStory()'); await ev(page, '__m.frames(5)'); }
}
async function pass(page: Page, ms: number): Promise<void> { const t0 = Date.now(); while (Date.now() - t0 < ms) { await ev(page, '__m.skipStory()'); await ev(page, '__m.frames(6)'); } }
// 장치를 칠하고 원 안에 머문다
async function operate(page: Page, x: number, z: number, secs = 2.6): Promise<void> {
  await ev(page, `__m.tp(${x}, 3, ${z})`); await ev(page, `__m.paintAt(${x}, ${z}, 3)`);
  // 게임 시간(세션 경과)으로 잰다: headless 프레임률이 낮아도 실제로 secs초를 머문다
  const EL = '(__inkwave.session ? __inkwave.session.elapsed : 1e9)';
  const e0 = await ev<number>(page, EL), t0 = Date.now();
  while (Date.now() - t0 < 40000 && (await ev<number>(page, EL)) - e0 < secs) { await ev(page, `(__inkwave.session && __m.tp(${x}, 3, ${z}), 0)`); await ev(page, '__m.frames(4)'); }
}
async function clearArea(page: Page, x: number, z: number, secs = 3): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) { await ev(page, `(__m.tp(${x}, 3, ${z}), __m.killAll(), 0)`); await ev(page, '__m.skipStory()'); await ev(page, '__m.frames(4)'); }
}

try {
  // ------------------------------------------------------------------------------------------------ 1-1
  if (only.includes('1-1')) {
    const { page, errors } = await openFresh();
    await start(page, '1-1');
    const s0 = await st(page);
    ok('1-1 시작: 전투·현재 목표 o-a·HUD 목표', s0.st === 'combat' && s0.cur === 'o-a' && String(s0.hud).includes('중계기 A'), s0);
    await page.screenshot({ path: 'shots/mission/1-1-start.png' });
    // B를 먼저 밟아도 완료되지 않는다(순서 건너뛰기)
    await operate(page, -6, 14, 2.6);
    const skip = await st(page);
    ok('T024 1-1: A 전에 B 가동 불가', !skip.done.includes('o-b') && skip.enc['enc-b'] === 'idle', skip);
    // A: 경계 사격병을 정리하고 칠한 뒤 2초
    await clearArea(page, -12, -27, 2.5);
    await operate(page, -12, -31, 2.8);
    const a = await st(page);
    const dbgA = await ev(page, `({ paint: __m.paintOf('relayA'), dev: __inkwave.session.devices.get('relayA'), pos: [__m.G.local.pos.x, __m.G.local.pos.y, __m.G.local.pos.z] })`);
    ok('T025 1-1: A 복구 → CP1', a.done.includes('o-a') && a.cp === 'cp1', { a, dbgA });
    const saved = await ev<{ cp: string | null; mission: string | null }>(page, '({ cp: __inkwave.store.current.inProgress && __inkwave.store.current.inProgress.checkpointId, mission: __inkwave.store.current.inProgress && __inkwave.store.current.inProgress.missionId })');
    ok('T028·T029 1-1: CP1이 저장의 진행 중 기록에 남음', saved.cp === 'cp1' && saved.mission === '1-1', saved);
    // 선택 상자(우회로): 사격병 2명 정리 후 상자
    await clearArea(page, -15, -12, 3);
    await operate(page, -16.5, -11.5, 2.6);
    const c = await st(page);
    ok('T025 1-1: 선택 상자 회수', c.done.includes('o-x'), c);
    // 사망 → 실패 패널 → 체크포인트 재시작: A는 유지, 현재 구간 적 복원
    await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
    await pass(page, 2200);
    const failed = await ev<{ st: string; panel: boolean }>(page, '({ st: __inkwave.session.state, panel: !!document.querySelector(".iw-camp__fail") })');
    await page.screenshot({ path: 'shots/mission/1-1-fail.png' });
    await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
    const r = await st(page);
    ok('T028 1-1: 사망 → 실패 패널 → CP1 재시작(A 유지, 상자 유지, 플레이어 생존)', failed.st === 'failed' && failed.panel && r.st === 'combat' && r.done.includes('o-a') && r.done.includes('o-x') && r.alive, { failed, r });
    // B: 방어 웨이브 2개를 정리해야 가동
    await operate(page, -6, 14, 1.5);
    for (let i = 0; i < 4; i++) await clearArea(page, -6, 14, 2.5);
    await operate(page, -6, 14, 2.8);
    const b = await st(page);
    ok('T025 1-1: B 방어 2웨이브 정리 뒤 복구', b.done.includes('o-b') && b.enc['enc-b'] === 'cleared', b);
    await operate(page, 0, -4.4, 1.5);
    await pass(page, 1500);
    const end = await ev<{ st: string | null; menu: string | null }>(page, '({ st: __inkwave.session && __inkwave.session.state, menu: __inkwave.menus.current })');
    ok('T030 1-1: 출구 → 결과 화면', end.menu === 'storyResults' || end.st === 'results', end);
    await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
    await page.screenshot({ path: 'shots/mission/1-1-results.png' });
    const save = await ev<{ xp: number; done: string[]; unlocked: string[]; cards: string[]; parts: number; records: string[]; inProgress: unknown }>(page, '(() => { const s = __inkwave.store.current; return { xp: s.xp, done: s.done, unlocked: s.unlocked, cards: s.inventory.cards.map((c) => c.defId), parts: s.inventory.parts, records: s.records, inProgress: s.inProgress }; })()');
    ok('T030·T039 1-1 첫 완료 저장: 600 경험치·60+10 부품·기본 세트+상자 모듈·1-2 해금·기록', save.xp === 600 && save.parts === 70 && save.done.includes('1-1') && save.unlocked.includes('1-2') && ['AD01', 'TK01', 'BD01'].every((x) => save.cards.includes(x)) && save.cards.length === 4 && save.records.includes('rec.tidewater.1') && !save.inProgress, save);
    // 결과 화면 새로고침 → 다시 저장해도 중복 지급 없음(같은 완료 ID)
    const again = await ev<{ xp: number; n: number }>(page, `(async () => { const g = __inkwave, s = g.store.current; const id = s.lastResult; const rec = s.processed[id]; const { completeMission } = await import('/src/campaign/completion.js'); const { getMission } = await import('/src/campaign/definitions.js'); await g.store.commit((cur) => { const o = completeMission(cur, { completionId: id, runId: rec.runId, mission: getMission('1-1'), crateOpened: true }); return 'save' in o ? o.save : { reject: o.reject }; }); return { xp: g.store.current.xp, n: g.store.current.inventory.cards.length }; })()`);
    ok('T030 1-1: 같은 완료 ID 재처리 → 중복 지급 없음', again.xp === 600 && again.n === 4, again);
    ok('1-1 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }
  // 1-2·1-3: 앞 임무를 끝낸 저장이 필요하다 — 저장에 해금만 넣어 시작한다(앞 임무의 실제 완료는 1-1 항목이 검사)
  const unlockTo = async (page: Page, ids: string[]) => ev(page, `__inkwave.store.commit((s) => ({ ...s, unlocked: ${JSON.stringify(['1-1', ...ids])} }))`);
  const hurtTo = (page: Page, unit: string, frac: number) => ev<number>(page, `(() => { const a = __inkwave.session.encounters.unitActor('${unit}'); if (!a) return -1; let n = 0; while (a.alive && a.hp / a.tune.hp > ${frac} && n++ < 400) a.damage(20, __m.G.local, 'weapon'); return a.hp / a.tune.hp; })()`);
  async function waitUnit(page: Page, unit: string, x: number, z: number, ms = 15000): Promise<boolean> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { await ev(page, `(__m.tp(${x}, 3, ${z}), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); if (await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('${unit}')`)) return true; }
    return false;
  }

  // ------------------------------------------------------------------------------------------------ 작업장·장비·특성·일시 정지(T032~T037)
  if (only.includes('ui')) {
    const { page, errors } = await openFresh();
    await page.evaluate(`window.__pads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map((q, i) => q && ({ index: i, id: 'Xbox 360 Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: !!(q.b && q.b[k]), value: q.b && q.b[k] ? 1 : 0 })) })) })`);
    const pad = async (b: number) => { await ev(page, `window.__pads[0] = { b: { ${b}: 1 } }`); await ev(page, '__m.frames(3)'); await ev(page, 'window.__pads[0] = { b: {} }'); await ev(page, '__m.frames(4)'); };
    await ev(page, 'window.__pads[0] = { b: { 0: 1 } }'); await ev(page, '__m.frames(3)'); await ev(page, 'window.__pads[0] = { b: {} }'); await ev(page, '__m.frames(3)');
    // 1-1을 마친 저장(기본 세트 3장 + 레벨 3)
    await ev(page, `(async () => { const g = __inkwave; await g.store.newGame(Date.now(), 'normal'); const { completeMission } = await import('/src/campaign/completion.js'); const { getMission } = await import('/src/campaign/definitions.js');
      await g.store.commit((s) => { const o = completeMission(s, { completionId: 'ui-1', runId: 'ui', mission: getMission('1-1'), crateOpened: true }); return o.save; }); })()`);
    const focusId = (id: string) => ev(page, `(() => { const m = __inkwave.menus; const el = m.el.querySelector('[data-id="${id}"]'); if (el) m._setFocus(el, { snap: true }); return !!el; })()`);
    await ev(page, `__inkwave.menus.show('workshop')`); await ev(page, '__m.frames(30)');
    await focusId('modules'); await pad(0); await ev(page, '__m.frames(30)');
    const onGear = await ev<string>(page, '__inkwave.menus.current');
    await page.screenshot({ path: 'shots/mission/ui-gear.png' });
    // 첫 카드(어댑터 AD01 또는 상자 모듈)에 A = 장착
    const first = await ev<string | null>(page, `(() => { const c = __inkwave.menus.el.querySelector('.iw-cg__card'); if (!c) return null; __inkwave.menus._setFocus(c, { snap: true }); return c.dataset.id; })()`);
    await pad(0); await ev(page, '__m.frames(20)');
    const eq = await ev<Record<string, string>>(page, '__inkwave.store.current.inventory.equipped');
    // 패드 X = 동작 창 → 잠금
    await pad(2); await ev(page, '__m.frames(20)');
    const modal = await ev<boolean>(page, '!!document.querySelector(".iw-modal")');
    await ev(page, `(() => { const m = __inkwave.menus; const b = [...m.el.querySelectorAll('.iw-modal button')].find((x) => /잠금/.test(x.textContent)); m._setFocus(b, { snap: true }); })()`); await pad(0); await ev(page, '__m.frames(20)');
    const locked = await ev<boolean>(page, `(() => { const s = __inkwave.store.current; return s.inventory.cards.some((c) => c.locked); })()`);
    ok('T032·T035 모듈 장비(패드): A 장착·X 동작 창·잠금이 저장에 반영', onGear === 'campGear' && !!first && Object.keys(eq).length >= 1 && modal && locked, { onGear, first, eq, modal, locked });
    await pad(1); await ev(page, '__m.frames(30)');
    await focusId('perks'); await pad(0); await ev(page, '__m.frames(30)');
    const t1 = await ev<boolean>(page, `(() => { const b = __inkwave.menus.el.querySelector('[data-id="t-mob1"]'); __inkwave.menus._setFocus(b, { snap: true }); return !!b; })()`);
    await pad(0); await ev(page, '__m.frames(20)');
    const tr = await ev<Record<string, number>>(page, '__inkwave.store.current.traits');
    await page.screenshot({ path: 'shots/mission/ui-traits.png' });
    await pad(0); await ev(page, '__m.frames(20)');   // 레벨 3 = 1점: 두 번째 투자는 거절
    const tr2 = await ev<Record<string, number>>(page, '__inkwave.store.current.traits');
    ok('T034 특성(패드): 1점 투자·점수 부족 거절(복제 없음)', t1 && tr.mob1 === 1 && tr2.mob1 === 1, { tr, tr2 });
    await pad(1); await ev(page, '__m.frames(30)');
    // 출전: 1-2(해금됨) → 장비·특성 적용
    await ev(page, `__inkwave.startCampaign('1-2', { prologue: false })`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 200 });
    await page.evaluate(HELPERS);
    const applied = await ev<{ hp: number; inkMax: number; sheet: number; swim: number; base: number }>(page, `(() => { const s = __inkwave.session, a = __m.G.local; return { hp: a.tune.hp, inkMax: a.tune.inkMax, sheet: s.stats.inkMax, swim: s.stats.swimMul, base: (await0 = 0) }; })()`.replace('(await0 = 0)', '0'));
    ok('T033 장비·특성 적용값이 캠페인 플레이어 튜닝과 같다(레벨 3 체력 102)', applied.hp === 102 && Math.abs(applied.inkMax - applied.sheet) < 1e-9, applied);
    // 일시 정지(Start) → 캠페인 일시 정지 메뉴 → B 재개
    for (let i = 0; i < 6; i++) { await ev(page, '__m.skipStory()'); await ev(page, '__m.frames(5)'); }
    await ev(page, `__inkwave.pause = Object.getPrototypeOf(__inkwave).pause.bind(__inkwave)`);
    await pad(9); await ev(page, '__m.frames(20)');
    const paused = await ev<{ cur: string | null; retry: boolean }>(page, `({ cur: __inkwave.menus.current, retry: !!__inkwave.menus.el.querySelector('[data-id="retry"]') })`);
    await page.screenshot({ path: 'shots/mission/ui-pause.png' });
    await pad(1); await ev(page, '__m.frames(20)');
    const resumed = await ev<{ cur: string | null; paused: boolean }>(page, `({ cur: __inkwave.menus.current, paused: __inkwave.match.paused })`);
    ok('T035 캠페인 일시 정지(패드 Start) → 체크포인트·장비 메뉴, B 재개', paused.cur === 'pause' && paused.retry && resumed.cur === null && !resumed.paused, { paused, resumed });
    // 작업장으로 → 연습: 캠페인 효과가 남지 않는다
    await ev(page, `__inkwave.quitToMenu('main')`); await ev(page, '__m.frames(10)');
    await ev(page, `__inkwave.startPractice({ mapId: 'tidewater' })`);
    await page.waitForFunction('__inkwave.match && __inkwave.match.state === "playing" && !__inkwave.match.attract', { timeout: 180000, polling: 200 });
    const clean = await ev<{ tune: boolean; hp: number; camp: boolean; hud: number; session: boolean; enemies: number }>(page, `(async () => { const { PLAYER } = await import('/src/config.js'); const a = window.__G.local; return { tune: a.tune === PLAYER, hp: a.hp, camp: !!window.__G.campaign, hud: document.querySelectorAll('.iw-camp').length, session: !!__inkwave.session, enemies: __inkwave.match.actors.filter((x) => x.team === 1).length }; })()`);
    ok('T022·T027·T034 캠페인 종료 뒤 연습: 튜닝·체력 기본값, 캠페인 HUD·적·세션 없음', clean.tune && clean.hp === 100 && !clean.camp && clean.hud === 0 && !clean.session && clean.enemies === 0, clean);
    ok('UI 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 세션 수명(T022·T028·T029)
  if (only.includes('life')) {
    const { page, errors } = await openFresh();
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    // 로딩 중 취소·재시작 반복: 늦게 끝난 로딩이 끝난 세션에 붙지 않고 캐릭터·HUD가 겹치지 않는다
    await ev(page, `(() => { void __inkwave.startCampaign('1-1', {}); })()`);
    await ev(page, '__m.frames(2)');
    await ev(page, `(async () => { await __inkwave.quitToMenu('workshop'); })()`);
    await ev(page, `(() => { void __inkwave.startCampaign('1-1', {}); })()`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 200 });
    await page.evaluate(HELPERS);
    await ev(page, `__inkwave.quitToMenu('workshop')`);
    await start(page, '1-1');
    const one = await ev<{ huds: number; locals: number; enemies: number; markers: number }>(page, `({ huds: document.querySelectorAll('.iw-camp').length, locals: __inkwave.match.actors.filter((a) => a.isLocal).length, enemies: __inkwave.match.actors.filter((a) => a.team === 1).length, markers: window.__G.scene.children.filter((c) => c.name === 'campaign-devices').length })`);
    ok('T022 시작 중 취소·재시작·작업장 반복 뒤 HUD 1·플레이어 1·장치 표식 1·적 0(시작 구역 밖)', one.huds === 1 && one.locals === 1 && one.markers === 1, one);
    // 체크포인트 뒤 도색 → 재시작: CPU 격자·GPU 아틀라스가 체크포인트 때와 같다, 연속 재시작에 탄환·예고·대기 출현이 남지 않는다
    await clearArea(page, -12, -27, 2); await operate(page, -12, -31, 2.8);
    const px = async () => ev<number[]>(page, `(() => { const P = window.__G.paint, r = P.renderer, rt = P.rt, out = new Uint8Array(64 * 64 * 4); r.readRenderTargetPixels(rt, 0, 0, 64, 64, out); let s = 0; for (let i = 0; i < out.length; i += 97) s = (s * 31 + out[i]) >>> 0; return [s, P.counts[0], P.counts[1]]; })()`);
    await ev(page, `__inkwave.session.snap.capture()`);
    const before = await px();
    for (let i = 0; i < 8; i++) await ev(page, `__m.paintAt(${-14 + i * 3}, ${-20 + i}, 3)`);
    const dirty = await px();
    for (let i = 0; i < 3; i++) { await ev(page, '__inkwave.session.retryCheckpoint()'); await ev(page, '__m.frames(3)'); }
    const after = await px();
    const left = await ev<{ proj: number; tel: number; pend: number; grid: boolean }>(page, `({ proj: window.__G.projectiles.list.length, tel: __inkwave.campaignPreview.telegraphs.live.length, pend: [...__inkwave.session.encounters.runs.values()].reduce((n, r) => n + r.pending.length, 0), grid: __inkwave.session.snap.matches() })`);
    ok('T028 도색 복원: 판정 격자·팀 칸 수·아틀라스 표본이 체크포인트 때와 같다', JSON.stringify(after) === JSON.stringify(before) && JSON.stringify(dirty) !== JSON.stringify(before) && left.grid, { before, dirty, after });
    ok('T028 연속 재시작 뒤 남은 탄환·예고·대기 출현 없음', left.proj === 0 && left.tel === 0 && left.pend === 0, left);
    // 새로고침 → 이어하기: 진행 중 CP1에서 다시 시작(A 완료 유지)
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate(HELPERS);
    await ev(page, `(() => { void __inkwave.api.startStory(); })()`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 200 });
    await page.evaluate(HELPERS);
    const resumed = await st(page);
    ok('T029 새로고침 후 이어하기: 진행 중 CP1·A 완료 복구', resumed.cp === 'cp1' && resumed.done.includes('o-a'), resumed);
    ok('수명 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 적 행동(T026)
  // 실제 상태기를 돌린다: 플레이어(무적)를 사격병 시야에 두고 상태 전이를 기록 → 예고 없는 공격·짧은 정비가 없는가,
  // 플레이어가 구간 밖으로 사라지면 탐색 뒤 자리로 돌아가는가, 끼이면 자리 근처로 복구되는가.
  if (only.includes('ai')) {
    const { page, errors } = await openFresh();
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await unlockTo(page, ['1-2', '1-3']);
    await start(page, '1-3');
    await ev(page, `(() => { window.__log = []; const s = __inkwave.session; const orig = s.world.onState; s.world.onState = (b, st) => { window.__log.push([b.unit.id, st, +window.__G.time.toFixed(2), b.def.rest]); orig && orig(b, st); }; })()`);
    // 진입 사격병 둘의 시야(정자 남쪽)에 서 있는다
    const t0 = Date.now();
    while (Date.now() - t0 < 16000) { await ev(page, '(__m.tp(0, 3, -27), __m.skipStory(), 0)'); await ev(page, '__m.frames(5)'); }
    const log = await ev<Array<[string, string, number, number]>>(page, 'window.__log');
    const bad: string[] = []; let attacks = 0;
    const by = new Map<string, Array<[string, number, number]>>();
    for (const [u, s, t, rest] of log) { if (!by.has(u)) by.set(u, []); by.get(u)!.push([s, t, rest]); }
    for (const [u, seq] of by) for (let i = 0; i < seq.length; i++) {
      if (seq[i][0] === 'attack') { attacks++; if (seq[i - 1]?.[0] !== 'windup') bad.push(`${u} 예고 없는 공격 @${seq[i][1]}`); else if (seq[i][1] - seq[i - 1][1] < 0.89) bad.push(`${u} 예고 ${(seq[i][1] - seq[i - 1][1]).toFixed(2)}초`); }
      if (seq[i][0] === 'recover' && seq[i + 1] && seq[i + 1][1] - seq[i][1] < seq[i][2] - 0.05) bad.push(`${u} 정비 ${(seq[i + 1][1] - seq[i][1]).toFixed(2)}초 < ${seq[i][2]}`);
    }
    ok('T026 적 행동: 모든 공격 앞에 0.9초 이상 예고, 공격 뒤 정비 시간 준수', attacks >= 2 && bad.length === 0, { attacks, bad: bad.slice(0, 6), n: log.length });
    // 플레이어가 구간 밖(멀리)으로 사라지면 탐색 → 자리 복귀
    const t1 = Date.now();
    while (Date.now() - t1 < 9000) { await ev(page, '(__m.tp(-14, 3, 22), 0)'); await ev(page, '__m.frames(5)'); }
    const back = await ev<Array<{ id: string; st: string; d: number }>>(page, `__inkwave.session.encounters.liveActors().map((a) => ({ id: a.bot.unit.id, st: a.bot.state, d: +a.pos.distanceTo(a.bot.post).toFixed(2) }))`);
    ok('T026 시야를 잃으면 자리로 돌아가 경계(무한 추적 없음)', back.length > 0 && back.every((b) => (b.st === 'guard' || b.st === 'return') && b.d < 6), back);
    // 끼임: 한 적을 벽 안쪽 좁은 곳으로 옮기고 이동 의도가 있는데 못 움직이게 → 자리 근처 그래프 노드로 복구
    const stuck = await ev<{ before: number; after: number }>(page, `(async () => { const a = __inkwave.session.encounters.liveActors()[0]; if (!a) return { before: -1, after: -1 }; const b = a.bot; b.setState('return'); a.pos.set(9.5, -0.2, -28); const before = a.pos.distanceTo(b.post); const orig = a.update.bind(a); a.update = (dt) => { const p = a.pos.clone(); orig(dt); if (b.state === 'return') a.pos.copy(p); }; await new Promise((r) => setTimeout(r, 4500)); a.update = orig; return { before: +before.toFixed(2), after: +a.pos.distanceTo(b.post).toFixed(2) }; })()`);
    ok('T026 끼인 적은 진행 없음 2.5초 뒤 자기 자리 근처로 안전 복구(같은 개체, 재소환 없음)', stuck.before > 3 && stuck.after < 3, stuck);
    ok('적 행동 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 화면 겹침(T036, 모바일 에뮬레이션)
  if (only.includes('mobile')) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.emulate(KnownDevices['Pixel 5 landscape']);
    await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
    await page.goto(`http://localhost:${port}/?skipTitle`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate(`new Promise((r) => { const q = indexedDB.deleteDatabase('inkwave-campaign'); q.onsuccess = q.onerror = q.onblocked = () => r(0); })`);
    await page.evaluate(`(async () => { const g = window.__inkwave; g.store.port.close(); g.store.current = null; await g.store.init(); await g.store.newGame(Date.now(), 'normal'); await g.store.commit((s) => ({ ...s, unlocked: ['1-1', '1-2', '1-3'] })); })()`);
    await page.evaluate(HELPERS);
    await start(page, '1-3');
    await clearArea(page, 0, -26, 4);
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) { await ev(page, '(__m.tp(-9, 3, -15), __m.skipStory(), 0)'); await ev(page, '__m.frames(5)'); }
    await ev(page, `__inkwave.story.comm('phase')`);
    await ev(page, '__m.frames(40)');
    await page.screenshot({ path: 'shots/mission/mobile-boss.png' });
    // 겹침 판정: 대장 체력바·목표 줄·대사 상자 사각형이 가상 키 버튼 원과 겹치지 않는다
    const ov = await ev<{ hits: string[]; boss: boolean; obj: boolean }>(page, `(() => {
      const rect = (sel) => { const e = document.querySelector(sel); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
      const boxes = { boss: rect('.iw-camp__boss.is-on'), obj: rect('.iw-camp__obj'), talk: rect('.iw-talk.is-on, .iw-dlg.is-on, .iw-story__box.is-on') };
      const hits = [];
      for (const b of __inkwave.touch.geom.buttons) for (const [k, r] of Object.entries(boxes)) {
        if (!r) continue;
        const cx = Math.max(r.left, Math.min(b.cx, r.right)), cy = Math.max(r.top, Math.min(b.cy, r.bottom));
        if (Math.hypot(cx - b.cx, cy - b.cy) < b.r - 2) hits.push(k + '×' + b.name);
      }
      return { hits, boss: !!boxes.boss, obj: !!boxes.obj };
    })()`);
    ok('T036 모바일: 대장 체력바·목표 줄·대사가 가상 키와 겹치지 않는다', ov.boss && ov.obj && ov.hits.length === 0, ov);
    ok('모바일 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 대화 중 중단(T036)
  if (only.includes('talk')) {
    const { page, errors } = await openFresh();
    await page.evaluate(`window.__pads = [{ b: {} }]; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map((q, i) => q && ({ index: i, id: 'Xbox 360 Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: !!(q.b && q.b[k]), value: q.b && q.b[k] ? 1 : 0 })) })) })`);
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await page.evaluate(`__inkwave.startCampaign('1-1', { prologue: false })`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 200 });
    await page.evaluate(HELPERS);
    await ev(page, `__inkwave.pause = Object.getPrototypeOf(__inkwave).pause.bind(__inkwave)`);
    await ev(page, `window.__pads[0] = { b: { 0: 1 } }`); await ev(page, '__m.frames(3)'); await ev(page, `window.__pads[0] = { b: {} }`); await ev(page, '__m.frames(3)');
    // 막는 대본 재생 중(입장 대사가 끝났으면 기록판 다시 읽기로 연다)
    await ev(page, `(() => { const st = __inkwave.story; if (!st.layer.runner.busy) st.replay('1-1.intro'); })()`); await ev(page, '__m.frames(10)');
    const talking = await ev<boolean>(page, '__inkwave.story.layer.runner.busy');
    // 1) 창 크기 변경
    await page.setViewport({ width: 900, height: 560 }); await ev(page, '__m.frames(10)');
    await page.setViewport({ width: 1280, height: 720 }); await ev(page, '__m.frames(10)');
    const stillTalking = await ev<boolean>(page, '__inkwave.story.layer.runner.busy');
    // 2) 지도 키(패드 Back): 대화 중에는 메뉴 컨텍스트 → 지도가 열리지 않는다
    await ev(page, `window.__pads[0] = { b: { 8: 1 } }`); await ev(page, '__m.frames(20)');
    const map = await ev<boolean>(page, '!!(__inkwave.match.controller && __inkwave.match.controller.mapHeld)');
    await ev(page, `window.__pads[0] = { b: {} }`); await ev(page, '__m.frames(5)');
    // 3) 대화 중 패드 해제 → 로컬 경기 정지, 재개 후 대화 계속(진행 막힘 없음)
    await ev(page, 'window.__pads = []'); await ev(page, '__m.frames(10)');
    const paused = await ev<{ paused: boolean; menu: string | null }>(page, '({ paused: __inkwave.match.paused, menu: __inkwave.menus.current })');
    await ev(page, '__inkwave.resume()'); await ev(page, '__m.frames(10)');
    // 4) 일시 정지 → 재개
    await ev(page, '__inkwave.pause()'); await ev(page, '__m.frames(5)'); const p2 = await ev<string | null>(page, '__inkwave.menus.current'); await ev(page, '__inkwave.resume()'); await ev(page, '__m.frames(5)');
    // 대화를 끝까지 넘긴다(키보드 Enter) → 목표 진행 가능
    for (let i = 0; i < 30 && await ev<boolean>(page, '__inkwave.story.layer.runner.busy'); i++) { await page.keyboard.press('Enter'); await ev(page, '__m.frames(8)'); }
    const done = await ev<{ busy: boolean; st: string }>(page, '({ busy: __inkwave.story.layer.runner.busy, st: __inkwave.session.state })');
    ok('T036 대화 중 창 크기 변경·지도 키·패드 해제(정지)·일시 정지 뒤에도 대화가 이어지고 끝나며 임무가 계속된다', talking && stillTalking && !map && paused.paused && p2 === 'pause' && !done.busy && done.st === 'combat', { talking, stillTalking, map, paused, p2, done });
    ok('대화 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 주행(T038·T041·T044)
  // 실제 입력 경로(가짜 표준 패드 왼쪽 스틱·A 점프 → 공통 프레임 → PlayerController → Actor 물리)로 플레이어를 이동 그래프의
  // 경로를 따라 걷게 해, 시작 장비·기본 이동만으로 각 목표·선택 상자·체크포인트에 실제로 닿는지 본다. 적은 멈춰 둔다(지형 검사).
  // 사람의 조작감·완주(T040·T043·T047)를 대신하지 않는다.
  if (only.includes('walk')) {
    const { page, errors } = await openFresh();
    await page.evaluate(`window.__pads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map((q, i) => q && ({ index: i, id: 'Xbox 360 Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: q.ax || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: !!(q.b && q.b[k]), value: q.b && q.b[k] ? 1 : 0 })) })) })`);
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await unlockTo(page, ['1-2', '1-3']);
    const ROUTES: Record<string, string[]> = {
      '1-1': ['relayA', 'cp1', 'crate', 'relayB', 'exit'],
      '1-2': ['rec1', 'cp1', 'crate', 'rec2', 'cp2', 'exit'],
      '1-3': ['cp-boss', 'core'],
    };
    for (const id of ['1-1', '1-2', '1-3']) {
      await start(page, id);
      await ev(page, `window.__pads[0] = { b: { 0: 1 } }`); await ev(page, '__m.frames(3)'); await ev(page, `window.__pads[0] = { b: {} }`); await ev(page, '__m.frames(3)');
      const legs: Array<{ to: string; ok: boolean; secs: number; left: number }> = [];   // (실패하면 위치·특수 간선을 함께 남긴다)
      for (const to of ROUTES[id]) {
        const r = await ev<{ ok: boolean; secs: number; left: number }>(page, `(async () => {
          const THREE = await import('three');
          const g = __inkwave, G = window.__G, s = g.session, m = s.mission, a = G.local, nav = G.nav;
          const d = m.devices.find((x) => x.id === '${to}') || m.checkpoints.find((x) => x.id === '${to}');
          const tgt = s._ground(d.at), rad = (d.radius || 1.2) * 0.8;
          for (const e of g.match.actors) if (e.team === 1 && e.bot) e.bot.update = () => { e.intent.move.set(0, 0, 0); e.intent.fire = false; };
          const t0 = G.time; let path = null, pi = 1, replan = 0, lastP = a.pos.clone(), stuckT = 0, jumpT = 0;
          while (G.time - t0 < 45) {
            a.invuln = 999; window.__m.skipStory();
            for (const e of g.match.actors) if (e.team === 1 && e.bot && e.bot.update.length === 1 && !e.__frozen) { e.__frozen = 1; e.bot.update = () => { e.intent.move.set(0, 0, 0); e.intent.fire = false; }; }
            if (Math.hypot(a.pos.x - tgt.x, a.pos.z - tgt.z) < rad && Math.abs(a.pos.y - tgt.y) < 1) { window.__pads[0] = { b: {} }; return { ok: true, secs: +(G.time - t0).toFixed(1), left: 0 }; }
            replan -= 1 / 60;
            if (!path || replan <= 0) { const s0 = nav.nearest(a.pos, 1.2), g0 = nav.nearest(tgt, 1.5); path = nav.path(s0, g0, 0, 20000, true); pi = 1; replan = 1.5; }
            let wx = tgt.x, wz = tgt.z, wy = tgt.y;
            if (path) { while (pi < path.length && Math.hypot(nav.nodes[path[pi]].x - a.pos.x, nav.nodes[path[pi]].z - a.pos.z) < 0.6) pi++; if (pi < path.length) { const n = nav.nodes[path[pi]]; wx = n.x; wz = n.z; wy = n.y; } }
            const dx = wx - a.pos.x, dz = wz - a.pos.z, L = Math.hypot(dx, dz) || 1;
            const yaw = g.rig.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
            const ux = dx / L, uz = dz / L, mz = ux * sy + uz * cy, mx = -ux * cy + uz * sy;
            if (a.pos.distanceTo(lastP) < 0.02) stuckT += 1 / 60; else stuckT = 0;
            lastP.copy(a.pos);
            const jump = (wy > a.pos.y + 0.35 || stuckT > 0.4) && jumpT <= 0;
            if (jump) jumpT = 0.6; jumpT -= 1 / 60;
            window.__pads[0] = { ax: [mx, -mz, 0, 0], b: jump ? { 0: 1 } : {} };
            await new Promise((r) => requestAnimationFrame(r));
          }
          window.__pads[0] = { b: {} };
          const s1 = nav.nearest(a.pos, 1.2), g1 = nav.nearest(tgt, 1.5), pp = nav.path(s1, g1, 0, 20000) || [];
          const edges = []; for (let i = 1; i < pp.length; i++) { const t = nav.edgeType(pp[i - 1], pp[i]); if (t !== 'walk') { const n = nav.nodes[pp[i]]; edges.push(t + '@' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ',' + n.z.toFixed(1)); } }
          return { ok: false, secs: 45, left: +Math.hypot(a.pos.x - tgt.x, a.pos.z - tgt.z).toFixed(2), at: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(1)), edges: edges.slice(0, 8), noClimb: !!nav.path(s1, g1, 0, 20000, true) };
        })()`);
        legs.push({ to, ...r });
        if (!r.ok) break;
        await ev(page, '__m.frames(10)');
      }
      ok(`T038·T041·T044 ${id} 주행: 기본 이동(걷기·점프)만으로 모든 목표·선택 상자·체크포인트에 실제로 닿는다`, legs.length === ROUTES[id].length && legs.every((l) => l.ok), legs);
      await page.screenshot({ path: `shots/mission/walk-${id}.png` });
      await ev(page, `__inkwave.quitToMenu('workshop')`);
    }
    ok('주행 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 저장 거부(T029)
  if (only.includes('denied')) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument(`Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } }); try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
    await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    const r = await ev<{ temp: boolean; err: string | null }>(page, '({ temp: __inkwave.store.temporary, err: __inkwave.store.loadError })');
    await ev(page, `(() => { void __inkwave.startCampaign('1-1', {}); })()`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat"', { timeout: 180000, polling: 200 });
    const toast = await ev<string>(page, `[...document.querySelectorAll('.iw-toast, .iw-camp__temp')].map((t) => t.textContent).join(' | ')`);
    ok('T029 IndexedDB 거부: 명시적 임시 플레이 안내(저장 성공으로 숨기지 않음)', r.temp && r.err === 'unavailable' && /임시/.test(toast), { r, toast });
    ok('저장 거부 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 배치(T023·T038·T041·T044)
  // 모든 배치 지점이 실제 바닥 위이고(아래 광선이 1.2 m 안에서 닿음) 시작점에서 이동 그래프로 닿는가(걷기·점프·벽오르기)
  if (only.includes('layout')) {
    const { page, errors } = await openFresh();
    for (const id of ['1-1', '1-2', '1-3']) {
      const r = await ev<{ bad: string[]; n: number }>(page, `(async () => {
        const { getMission } = await import('/src/campaign/definitions.js');
        const THREE = await import('three');
        const g = __inkwave, G = window.__G, m = getMission('${id}');
        if (g.mapDef.id !== m.mapId) { await g.startPractice({ mapId: m.mapId }); }
        const nav = G.nav, bad = [];
        const ground = (p) => { const h = G.physics.raycast(new THREE.Vector3(p[0], p[1] + 2.5, p[2]), new THREE.Vector3(0, -1, 0), 12); return h.hit ? p[1] + 2.5 - h.dist : null; };
        const pts = [['start', m.start.at], ...m.devices.map((d) => ['dev:' + d.id, d.at]), ...m.checkpoints.map((c) => ['cp:' + c.id, c.at]), ...m.encounters.flatMap((e) => e.waves.flatMap((w) => w.units.map((u) => ['unit:' + u.id, u.at])))];
        const s0 = nav.nearest(new THREE.Vector3(m.start.at[0], ground(m.start.at) ?? m.start.at[1], m.start.at[2]), 1.5);
        for (const [name, p] of pts) {
          const y = ground(p);
          if (y === null || Math.abs(y - p[1]) > 1.2) { bad.push(name + ' 바닥 ' + y); continue; }
          const n = nav.nearest(new THREE.Vector3(p[0], y, p[2]), 1.5);
          if (n < 0) { bad.push(name + ' 이동 그래프 밖'); continue; }
          if (!name.startsWith('unit:') && !nav.path(s0, n, 0, 20000)) bad.push(name + ' 시작점에서 도달 불가');
        }
        return { bad, n: pts.length };
      })()`);
      ok(`T023 ${id} 배치: 모든 지점이 바닥 위·이동 그래프 안·시작점에서 도달 가능`, r.bad.length === 0, r);
    }
    ok('배치 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 1-2
  if (only.includes('1-2')) {
    const { page, errors } = await openFresh();
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await unlockTo(page, ['1-2']);
    await start(page, '1-2');
    const s0 = await st(page);
    ok('1-2 시작: 기록 1 목표', s0.cur === 'o-r1', s0);
    // 경계 적이 남아 있으면 회수 불가
    await operate(page, -4.5, -15, 2.5);
    const guarded = await st(page);
    ok('T025 1-2: 경계 적이 남아 있으면 기록 회수 안 됨', !guarded.done.includes('o-r1'), guarded);
    await clearArea(page, -4.5, -15, 3);
    await operate(page, -4.5, -15, 2.8);
    const r1 = await st(page);
    ok('T041 1-2: 기록 1 → CP1', r1.done.includes('o-r1') && r1.cp === 'cp1', r1);
    // 다음 구간(정예 구역)을 먼저 밟아도 정예가 나오지 않는다
    await operate(page, 12, 10, 1.5);
    const early = await st(page);
    ok('T041 1-2: 기록 2 전에는 정예 구역이 잠겨 있다', early.enc['enc-elite'] === 'idle', early);
    await clearArea(page, 18, -20, 2); await clearArea(page, 20.6, -27, 3);
    await operate(page, 20.6, -27, 2.8);
    const r2 = await st(page);
    ok('T041 1-2: 회랑 위 기록 2 → CP2', r2.done.includes('o-r2') && r2.cp === 'cp2', r2);
    const spawned = await waitUnit(page, 'elite', 12, 6);
    ok('T042 1-2: 정예 등장', spawned);
    await page.screenshot({ path: 'shots/mission/1-2-elite.png' });
    const half = await hurtTo(page, 'elite', 0.45);
    await pass(page, 2500);
    const sup1 = await ev<string[]>(page, '__inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id)');
    await hurtTo(page, 'elite', 0.2); await pass(page, 2500);
    const sup2 = await ev<string[]>(page, '__inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id)');
    ok('T042 1-2: 체력 50%에서 도색병 지원 한 번만', half <= 0.5 && sup1.includes('e-p1') && sup2.filter((u) => u === 'e-p1').length <= 1 && !sup2.some((u) => u !== 'elite' && u !== 'e-p1'), { half, sup1, sup2 });
    // 정예전에서 쓰러지면 두 기록은 유지되고 정예만 처음부터
    await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
    await pass(page, 2200);
    await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
    const re = await st(page);
    ok('T043 1-2: 정예전 재시작 — 기록 2개 유지, 정예 구역 처음 상태', re.done.includes('o-r1') && re.done.includes('o-r2') && re.cp === 'cp2' && re.enc['enc-elite'] === 'idle' && re.live.length === 0, re);
    await waitUnit(page, 'elite', 12, 6);
    await clearArea(page, 12, 10, 4);
    const down = await st(page);
    ok('T043 1-2: 정예 처치 → 통신함 목표', down.done.includes('o-boss') && down.cur === 'o-e', down);
    await operate(page, 9, 17, 2.8);
    await pass(page, 1500);
    await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
    const save = await ev<{ xp: number; done: string[]; unlocked: string[]; parts: number; n: number }>(page, '(() => { const s = __inkwave.store.current; return { xp: s.xp, done: s.done, unlocked: s.unlocked, parts: s.inventory.parts, n: s.inventory.cards.length }; })()');
    ok('T043 1-2 첫 완료: 600 경험치·60 부품·무작위 모듈 1·1-3 해금(정예 처치 경험치 없음)', save.xp === 600 && save.parts === 60 && save.n === 1 && save.unlocked.includes('1-3') && save.done.includes('1-2'), save);
    ok('1-2 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ------------------------------------------------------------------------------------------------ 1-3
  if (only.includes('1-3')) {
    const { page, errors } = await openFresh();
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await unlockTo(page, ['1-2', '1-3']);
    await start(page, '1-3');
    // 단말을 먼저 찾아가도 보스 전에는 완료되지 않는다
    await operate(page, 0, -4.4, 2.5);
    const early = await st(page);
    ok('T044 1-3: 중앙 단말을 먼저 밟아도 완료 안 됨', !early.done.includes('o-core') && early.enc['enc-boss'] === 'idle', early);
    await clearArea(page, 0, -26, 4);
    const entry = await st(page);
    ok('T044 1-3: 진입 사격병 정리 → 보스 앞 CP', entry.done.includes('o-entry') && entry.cp === 'cp-boss', entry);
    const boss = await waitUnit(page, 'bari', 0, -16);
    ok('T045 1-3: 통행대장 바리 등장', boss);
    await pass(page, 3000);
    await page.screenshot({ path: 'shots/mission/1-3-boss.png' });
    // 정면(방패)과 후방(약점) 피해 비교: 같은 공격 20
    const sides = await ev<{ front: number; back: number }>(page, `(() => { const s = __inkwave.session, a = s.encounters.unitActor('bari'), b = a.bot; const p = __m.G.local; const y = a.yaw;
      const f = new p.pos.constructor(a.pos.x + Math.sin(y) * 4, a.pos.y, a.pos.z + Math.cos(y) * 4), k = new p.pos.constructor(a.pos.x - Math.sin(y) * 4, a.pos.y, a.pos.z - Math.cos(y) * 4);
      b.state = 'chase'; p.pos.copy(f); const front = s._enemyTaken(a, 20, p); p.pos.copy(k); const back = s._enemyTaken(a, 20, p); return { front, back }; })()`);
    ok('T045 1-3: 정면은 효율이 낮고(일반 공격도 들어감) 후방은 약점 배율', sides.front > 0 && sides.front < 10 && sides.back >= 29, sides);
    await hurtTo(page, 'bari', 0.45); await pass(page, 2500);
    const ph = await ev<{ p2: boolean; live: string[] }>(page, `(() => { const s = __inkwave.session, a = s.encounters.unitActor('bari'); return { p2: !!a.bot.phase2, live: s.encounters.liveActors().map((x) => x.bot.unit.id), frac: a.hp / a.tune.hp, cls: a.bot.constructor.name, once: [...s.once], st: s.state, enc: s.encounters.state('enc-boss') }; })()`);
    await hurtTo(page, 'bari', 0.2); await pass(page, 2500);
    const ph2 = await ev<string[]>(page, '__inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id)');
    ok('T045 1-3: 50% 페이즈 전환·도색병 지원 1, 25%에 지원 2(두 번만)', ph.p2 && ph.live.includes('x-p1') && ph2.includes('x-p2'), { ph, ph2 });
    // 보스전 사망 → 보스 앞 CP에서 대장·지원이 처음 상태로
    await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
    await pass(page, 2200);
    await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
    const re = await st(page);
    const tel = await ev<number>(page, '__inkwave.campaignPreview.telegraphs.live.length');
    ok('T046 1-3: 보스 앞 CP 재도전 — 대장·지원·단말 일관 복원, 남은 예고 없음', re.cp === 'cp-boss' && re.enc['enc-boss'] === 'idle' && re.live.length === 0 && !re.done.includes('o-boss') && tel === 0, { re, tel });
    await waitUnit(page, 'bari', 0, -16);
    await clearArea(page, 0, -16, 4);
    const down = await st(page);
    ok('T045 1-3: 보스 처치 → 공격·지원 정지, 중앙 단말 목표', down.done.includes('o-boss') && down.live.length === 0 && down.cur === 'o-core', down);
    await operate(page, 0, -4.4, 2.8);
    await pass(page, 1500);
    await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
    await page.screenshot({ path: 'shots/mission/1-3-results.png' });
    const save = await ev<{ xp: number; parts: number; cores: number; cards: Array<{ defId: string; grade: string }>; unlocked: string[]; pity: number }>(page, '(() => { const s = __inkwave.store.current; return { xp: s.xp, parts: s.inventory.parts, cores: s.inventory.cores, cards: s.inventory.cards.map((c) => ({ defId: c.defId, grade: c.grade })), unlocked: s.unlocked, pity: s.pity }; })()');
    const sig = save.cards.filter((c) => c.defId === 'SG01').length;
    const rnd = save.cards.find((c) => c.defId !== 'SG01' || save.cards.length === 1);
    ok('T046 1-3 첫 완료: 600·80·무작위 1·공명핵 1·확정 SG01·2-1(시장) 해금, 확정 서명은 보장 횟수 제외', save.xp === 600 && save.parts === 80 && save.cores === 1 && save.cards.length === 2 && sig >= 1 && save.unlocked.includes('2-1') && save.pity === (rnd && rnd.grade === 'special' ? 0 : 1), save);
    ok('1-3 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }
} catch (e) { ok('실행 오류', false, String((e as Error).stack || e)); }
await browser.close().catch(() => {});
console.log(JSON.stringify(results, null, 2));
console.log(`mission-check: ${Object.keys(results).length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
