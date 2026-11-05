// 입력 체계 실행 검사(33번 T006~T019). 개발 서버에 headless Chrome으로 붙어 실제 게임 경로(main._inputFrame → 공통
// 프레임 → PlayerController → Actor)를 키보드·마우스·가짜 게임패드(navigator.getGamepads 대체)·에뮬레이션 터치로 구동한다.
// 가짜 패드·에뮬레이션 터치는 "상태 처리 검증"이며 실제 Xbox 계열 패드·모바일 실기기 합격을 대신하지 않는다.
//
// usage: node .tools/input-check.js [--port 8490] [--only input,policy,pad,pcvirtual,map,focus,menu,touch]
// 결과: 표준 출력 JSON(항목별 pass), shots/input/*.png. 실패가 있으면 종료 코드 1이다.
import puppeteer, { type Page, KnownDevices } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'input,policy,kbm,pad,weapons,pcvirtual,map,focus,menu,padmap,touch').split(','));
const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/input', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 가짜 패드: window.__pads[i] = { id, mapping, b: {idx: value}, ax: [..] } 를 Gamepad 비슷한 객체로 돌려준다
const FAKE_PADS = `(() => {
  window.__pads = [];
  const mk = (p, i) => p && ({ index: i, id: p.id, mapping: p.mapping ?? 'standard', connected: true, timestamp: performance.now(),
    axes: (p.ax || [0, 0, 0, 0]).slice(), buttons: Array.from({ length: p.n || 17 }, (_, k) => { const v = (p.b && p.b[k]) || 0; return { pressed: v > 0.5, touched: v > 0, value: v }; }) });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map(mk) });
})();`;

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});

async function open(query = '', mobile = false): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  if (mobile) await page.emulate(KnownDevices['Pixel 5 landscape'] ?? KnownDevices['Pixel 5']);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(FAKE_PADS);
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle${query}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  return { page, errors };
}
// 연습 경기를 열고 플레이 상태까지 기다린다
async function practice(page: Page): Promise<void> {
  await page.evaluate('__inkwave.startPractice({ mapId: "tidewater" })');
  await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing" && __inkwave.match.local && __inkwave.match.local.alive', { timeout: 180000, polling: 200 });
  await wait(600);
}
const frames = (page: Page, n: number) => page.evaluate(`new Promise((r) => { let k = 0; const f = () => (++k >= ${n} ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
const setPad = (page: Page, i: number, p: object | null) => page.evaluate(`window.__pads[${i}] = ${JSON.stringify(p)}`);
const X360 = (b: Record<number, number> = {}, ax = [0, 0, 0, 0]) => ({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard', b, ax });
interface GameState {
  paused: boolean; menu: string | null; fire: boolean; squid: boolean; jump: boolean; sub: boolean; special: boolean; mapHeld: boolean;
  yaw: number; pos: [number, number] | null; ctx: string; src: string; pad: string; vcLive: boolean; quality: string; memK: number; hw: boolean; world: string;
}
const st = (page: Page) => page.evaluate(`(() => { const g = __inkwave, m = g.match, a = m && m.local, it = a && a.intent; return {
  paused: !!(m && m.paused), menu: g.menus.current, fire: !!(it && it.fire), squid: !!(it && it.squid), jump: !!(it && it.jump), sub: !!(it && it.sub), special: !!(it && it.special),
  mapHeld: !!(m && m.controller && m.controller.mapHeld), yaw: g.rig.yaw, pos: a ? [a.pos.x, a.pos.z] : null, ctx: g.policy.context, src: g.policy.source, pad: g.policy.padStatus,
  vcLive: document.querySelector('.iw-touch').classList.contains('is-live'), quality: g.settings.quality, memK: g.memK, hw: g.hwMobile, world: g.worldKey }; })()`) as Promise<GameState>;

try {
  // ---------------------------------------------------------------- T006: 입력 객체 재생성·해제 후 한 누름 = 한 번
  if (only.has('input')) {
    const { page, errors } = await open();
    const r = await page.evaluate(`(async () => {
      const { Input } = await import('/src/core/input.js');
      const c = document.getElementById('game-canvas');
      const a = new Input(c); a.dispose();
      const b = new Input(c); let n = 0; b.onKey = () => { n++; return false; };
      let game = 0; const prev = __inkwave.input.onKey; __inkwave.input.onKey = (e, r) => { game++; return prev(e, r); };
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyJ', key: 'j' }));
      const res = { disposedGot: a.pressed.size + a.keys.size, liveGot: b.pressed.has('KeyJ') ? 1 : 0, onKeyCalls: n, gameCalls: game };
      b.dispose(); __inkwave.input.onKey = prev; return res; })()`);
    ok('T006 해제한 Input은 이벤트를 받지 않고 새 Input은 한 번만 받는다', JSON.stringify(r) === JSON.stringify({ disposedGot: 0, liveGot: 1, onKeyCalls: 1, gameCalls: 1 }), r);
    ok('T006 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T007: 가상 키 표시가 화질·메모리·월드를 바꾸지 않는다
  if (only.has('policy')) {
    const { page, errors } = await open();
    await practice(page);
    const before = await st(page);
    await page.evaluate(`__inkwave.api.setSettings({ virtualControls: 'always' })`);
    await frames(page, 10);
    const after = await st(page);
    ok('T007 PC에서 가상 키를 켜도 화질·memK·월드·성능 분류 불변', after.vcLive === true && after.quality === before.quality && after.memK === before.memK && after.world === before.world && after.hw === false, { before, after });
    // 패드를 연결해 실제 조작해도 화질·분류는 그대로이고, 자동 모드면 가상 키가 접힌다
    await page.evaluate(`__inkwave.api.setSettings({ virtualControls: 'auto' })`);
    await setPad(page, 0, X360({ 0: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    await setPad(page, 0, X360({}, [0, -1, 0, 0])); await frames(page, 6);
    const padOn = await st(page);
    ok('T007 패드 조작 시 가상 키 접힘·화질 불변', padOn.vcLive === false && padOn.src === 'gamepad' && padOn.quality === before.quality && padOn.memK === before.memK, padOn);
    await setPad(page, 0, X360({}, [0.1, 0.08, 0.05, 0.1])); await frames(page, 10);
    const drift = await st(page);
    ok('T010 작은 드리프트는 입력 출처를 바꾸지 않는다', drift.src === 'gamepad', drift.src);
    ok('T007 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T006: 키보드·마우스 기본 동작(포인터 잠금 경로)
  if (only.has('kbm')) {
    const { page, errors } = await open();
    await page.keyboard.press('ArrowDown'); await frames(page, 2);                       // 키보드 사용자
    await practice(page);
    const p0 = (await st(page)).pos!;
    await page.keyboard.down('KeyW'); await wait(600);
    const moving = await st(page);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('Space'); await frames(page, 3); const jump = await st(page); await page.keyboard.up('Space');
    await page.keyboard.down('ShiftLeft'); await frames(page, 3); const squid = await st(page); await page.keyboard.up('ShiftLeft');
    await page.mouse.down(); await frames(page, 3); const fire = await st(page); await page.mouse.up(); await frames(page, 3);
    const y0 = (await st(page)).yaw; await page.mouse.move(800, 360, { steps: 5 }); await frames(page, 3); const y1 = (await st(page)).yaw;
    const lockNow = await page.evaluate('__inkwave.input._plock') as boolean;
    ok('T006 키보드 W 이동·Space 점프·Shift 잠수', Math.hypot(moving.pos![0] - p0[0], moving.pos![1] - p0[1]) > 1.5 && jump.jump && squid.squid, { moved: Math.hypot(moving.pos![0] - p0[0], moving.pos![1] - p0[1]), jump: jump.jump, squid: squid.squid });
    ok('T006 포인터 잠금 마우스 클릭 발사·마우스 시점, 잠금 중 가상 키 접힘', lockNow && fire.fire && Math.abs(y1 - y0) > 0.05 && fire.vcLive === false, { lock: lockNow, fire: fire.fire, dyaw: y1 - y0, vc: fire.vcLive });
    ok('T006 키보드 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T016: 무기 실행기 입력 의미(연사·충전 해제·롤러 유지·보조·스페셜)
  if (only.has('weapons')) {
    const { page, errors } = await open();
    const wake = async () => { await setPad(page, 0, X360({ 0: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 4); };
    const runFor = async (weapon: string) => { await page.evaluate(`__inkwave.api.setLoadout({ weapon: '${weapon}' })`); await practice(page); await wake(); };
    const W = (e: string) => page.evaluate(`(() => { const a = __inkwave.match.local, w = a.weaponRunner; return ${e}; })()`);
    await runFor('shooter');
    const ink0 = await W('a.ink') as number;
    await setPad(page, 0, X360({ 7: 1 })); await wait(700);
    const ink1 = await W('a.ink') as number;
    await setPad(page, 0, X360()); await frames(page, 6);
    const ink2 = await W('a.ink') as number; await wait(300); const ink3 = await W('a.ink') as number;
    ok('T016 슈터: RT 유지 = 연사, 떼면 멈춤', ink0 - ink1 > 3 && ink3 >= ink2 - 0.01, { used: ink0 - ink1, after: ink3 - ink2 });
    await page.evaluate('__inkwave.quitToMenu()');
    await runFor('charger');
    await setPad(page, 0, X360({ 7: 1 })); await wait(900);
    const ch = await W('({ c: w.charge, charging: w.charging, ink: a.ink })') as { c: number; charging: boolean; ink: number };
    await setPad(page, 0, X360()); await frames(page, 4);
    const rel = await W('({ c: w.charge, charging: w.charging, ink: a.ink })') as { c: number; charging: boolean; ink: number };
    await wait(400); const later = await W('a.ink') as number;
    ok('T016 차저: 유지 = 충전, 떼면 한 발(잉크 한 번 소모)·충전 해제', ch.charging && ch.c > 0.5 && !rel.charging && ch.ink - rel.ink > 1 && later >= rel.ink - 0.01, { ch, rel, later });
    await page.evaluate('__inkwave.quitToMenu()');
    await runFor('roller');
    await setPad(page, 0, X360({ 7: 1 })); await wait(900);
    const rolling = await W('w.rolling') as boolean;
    await setPad(page, 0, X360()); await wait(400);
    const stopped = await W('w.rolling') as boolean;
    ok('T016 롤러: 유지 = 굴리기, 떼면 멈춤', rolling && !stopped, { rolling, stopped });
    // 보조(RB): 누를 때마다 폭탄 하나
    const b0 = await page.evaluate('(__inkwave.match.local.ink = 100, window.__G.projectiles.bombs.length + window.__G.subs.items.length)') as number;
    await setPad(page, 0, X360({ 5: 1 })); await frames(page, 6); await setPad(page, 0, X360()); await wait(250);
    const b1 = await page.evaluate('window.__G.projectiles.bombs.length + window.__G.subs.items.length') as number;
    // 스페셜(Y): 게이지를 채우고 한 번
    await page.evaluate('(() => { const a = __inkwave.match.local; a.special = a.specialCost(); })()');
    await setPad(page, 0, X360({ 3: 1 })); await frames(page, 6); await setPad(page, 0, X360()); await frames(page, 4);
    const sp = await W('!!a.specialActive') as boolean;
    ok('T016 RB 보조 무기 한 개·Y 스페셜 발동', b1 - b0 === 1 && sp, { bombs: b1 - b0, special: sp });
    ok('T016 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T010·T011: 패드 선택·매핑·해제·재연결·정지
  if (only.has('pad')) {
    const { page, errors } = await open();
    await practice(page);
    await setPad(page, 0, X360({ 7: 1 })); await frames(page, 4);                      // RT를 누른 채 깨움
    const woke = await st(page);
    ok('T010 깨운 버튼(RT)은 중립 확인 전 발사하지 않는다', woke.fire === false && woke.pad === 'ready', woke);
    await setPad(page, 0, X360()); await frames(page, 3);
    const press = async (b: Record<number, number>, ax?: number[]) => { await setPad(page, 0, X360(b, ax)); await frames(page, 4); const s = await st(page); await setPad(page, 0, X360()); await frames(page, 4); return s; };
    const rt = await press({ 7: 1 }), lt = await press({ 6: 1 }), a = await press({ 0: 1 }), rb = await press({ 5: 1 }), y = await press({ 3: 1 });
    ok('T011 RT 발사·LT 잠수·A 점프·RB 보조·Y 스페셜', rt.fire && lt.squid && a.jump && rb.sub && y.special, { rt: rt.fire, lt: lt.squid, a: a.jump, rb: rb.sub, y: y.special });
    const y0 = (await st(page)).yaw;
    await setPad(page, 0, X360({}, [0, 0, 1, 0])); await frames(page, 20); await setPad(page, 0, X360()); await frames(page, 3);
    const p0 = (await st(page)).pos!;
    await setPad(page, 0, X360({}, [0, -1, 0, 0])); await wait(700); await setPad(page, 0, X360()); await frames(page, 3);
    const after = await st(page);
    ok('T011 오른쪽 스틱 시점·왼쪽 스틱 이동', Math.abs(after.yaw - y0) > 0.3 && Math.hypot(after.pos![0] - p0[0], after.pos![1] - p0[1]) > 1.5, { dyaw: after.yaw - y0, moved: Math.hypot(after.pos![0] - p0[0], after.pos![1] - p0[1]) });
    // 트리거 경계 떨림
    let edges = 0; let prev = false;
    for (const v of [0.29, 0.31, 0.26, 0.22, 0.29, 0.31, 0.19, 0.31, 0]) { await setPad(page, 0, X360({ 7: v })); await frames(page, 2); const f = (await st(page)).fire; if (f && !prev) edges++; prev = f; }
    ok('T011 트리거 0.30/0.20 히스테리시스로 경계 떨림이 발사 2회', edges === 2, edges);
    // Start = 정지, 메뉴에서 Start = 재개
    await press({ 9: 1 });
    const paused = await st(page);
    await press({ 9: 1 });
    const resumed = await st(page);
    ok('T011 Start 정지 → Start 재개', paused.paused && paused.menu === 'pause' && !resumed.paused && resumed.menu === null, { paused: paused.menu, resumed: resumed.menu });
    // RT를 누른 채 해제 → 정지·입력 중립, 다른 패드가 RT를 누른 채 연결 → 재개 후에도 중립 전에는 발사 없음
    await setPad(page, 0, X360({ 7: 1 })); await frames(page, 4);
    await setPad(page, 0, null); await frames(page, 4);
    const lost = await st(page);
    ok('T010·T019 RT 유지 중 해제: 정지·발사 해제·가상 키 대기', lost.paused && lost.fire === false && lost.pad !== 'ready', lost);
    await page.evaluate(`window.__pads[1] = ${JSON.stringify({ ...X360({ 7: 1 }), id: 'Wireless Controller (STANDARD GAMEPAD)' })}`); await frames(page, 4);
    await page.evaluate('__inkwave.resume()'); await frames(page, 6);
    const re = await st(page);
    ok('T010 다른 패드가 RT를 누른 채 연결·재개: 자동 발사 없음', re.fire === false && !re.paused, re);
    await page.evaluate(`window.__pads[1].b = {}`); await frames(page, 3); await page.evaluate(`window.__pads[1].b = { 7: 1 }`); await frames(page, 4);
    ok('T010 중립 뒤 새 패드 RT 발사', (await st(page)).fire === true);
    await page.evaluate(`window.__pads[1].b = {}`); await frames(page, 3);
    // 비표준 패드: 매핑 없이 가상 키 유지
    await page.evaluate(`window.__pads = [null, null, { id: 'USB Joystick 0810:0001', mapping: '', n: 12, b: {}, ax: [0, 0, 0, 0, 0, 0] }]`); await frames(page, 6);
    await page.evaluate('__inkwave.resume()'); await frames(page, 3);
    await page.evaluate(`window.__pads[2].b = { 2: 1 }`); await frames(page, 6);
    const odd = await st(page);
    ok('T012 비표준 패드는 unmapped·가상 키 유지·원시 인덱스로 조작 안 함', odd.pad === 'unmapped' && odd.vcLive === true && odd.jump === false, odd);
    await page.screenshot({ path: 'shots/input/pad-unmapped.png' });
    ok('T010·T011 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T014: PC 마우스만으로 방향 유지 → 조준·발사 → 정지
  if (only.has('pcvirtual')) {
    const { page, errors } = await open();
    await page.mouse.click(20, 20);                                                    // 메뉴를 마우스로 쓴 사람(잠금 없음)
    await practice(page);
    await frames(page, 45);                                                            // HUD 자리를 잰 뒤의 배치
    const s0 = await st(page);
    const g = await page.evaluate(`(() => { const t = __inkwave.touch; return { dpad: t.geom.dpad, fire: t.geom.buttons.find((b) => b.name === 'fire') }; })()`) as { dpad: { cx: number; cy: number; r: number }; fire: { cx: number; cy: number } };
    ok('T014 PC에 패드가 없으면 가상 키(방향 패드 포함)가 보인다', s0.vcLive === true && s0.hw === false, s0);
    await page.screenshot({ path: 'shots/input/pc-virtual.png' });
    await page.mouse.click(g.dpad.cx, g.dpad.cy - g.dpad.r * 0.8);                      // 위 방향 유지
    const p0 = (await st(page)).pos!;
    await wait(800);
    const p1 = (await st(page)).pos!;
    // 오른쪽 영역 드래그로 조준(이동 유지)
    const y0 = (await st(page)).yaw;
    await page.mouse.move(900, 300); await page.mouse.down(); await page.mouse.move(1000, 300, { steps: 6 }); await page.mouse.up();
    await frames(page, 3);
    const y1 = (await st(page)).yaw;
    // 발사 버튼 누른 채
    await page.mouse.move(g.fire.cx, g.fire.cy); await page.mouse.down(); await frames(page, 4);
    const firing = await st(page);
    const legacy = await page.evaluate('__inkwave.input._plock') as boolean;
    await page.mouse.up(); await frames(page, 3);
    const stopFire = await st(page);
    await page.mouse.click(g.dpad.cx, g.dpad.cy);                                      // 가운데 = 정지
    await wait(500);
    const q0 = (await st(page)).pos!; await wait(500); const q1 = (await st(page)).pos!;
    ok('T014 방향 클릭 유지로 이동', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 2, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    ok('T014 이동 유지 중 드래그로 조준', Math.abs(y1 - y0) > 0.2, y1 - y0);
    ok('T014 발사 버튼 클릭 = 발사(포인터 잠금·캔버스 사격 경로 없음)', firing.fire === true && legacy === false && stopFire.fire === false, { firing: firing.fire, stop: stopFire.fire });
    ok('T014 가운데 클릭으로 즉시 정지', Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) < 0.2, Math.hypot(q1[0] - q0[0], q1[1] - q0[1]));
    // 메뉴(정지)로 들어가면 방향 유지가 풀린다
    await page.mouse.click(g.dpad.cx + g.dpad.r * 0.8, g.dpad.cy); await frames(page, 3);
    await page.evaluate('__inkwave.pause()'); await frames(page, 3); await page.evaluate('__inkwave.resume()'); await frames(page, 6);
    const z0 = (await st(page)).pos!; await wait(500); const z1 = (await st(page)).pos!;
    ok('T014 메뉴 진입이 방향 유지를 취소', Math.hypot(z1[0] - z0[0], z1[1] - z0[1]) < 0.2, Math.hypot(z1[0] - z0[0], z1[1] - z0[1]));
    ok('T014 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T018: 지도는 카메라를 돌리지 않고 고착 없이 닫힌다
  if (only.has('map')) {
    const { page, errors } = await open();
    await practice(page);
    await setPad(page, 0, X360({ 0: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    await setPad(page, 0, X360({ 6: 1 })); await frames(page, 4);                       // 잠수 유지
    await setPad(page, 0, X360({ 6: 1, 8: 1 })); await frames(page, 30);                // 지도 열기(Back 유지)
    const y0 = (await st(page)).yaw;
    await setPad(page, 0, X360({ 6: 1, 8: 1 }, [0, 0, 1, 0])); await frames(page, 30);   // 지도에서 오른쪽 스틱 = 커서
    const inMap = await st(page);
    await setPad(page, 0, X360({ 6: 1 })); await frames(page, 40);                       // 지도 닫기, LT는 계속 누름
    const closed = await st(page);
    await setPad(page, 0, X360()); await frames(page, 4);
    const rel = await st(page);
    ok('T018 지도 컨텍스트에서 스틱이 카메라를 돌리지 않는다', inMap.ctx === 'map' && Math.abs(inMap.yaw - y0) < 1e-6 && inMap.squid === false, inMap);
    ok('T018 지도를 닫아도 잠수가 저절로 이어지지 않고(다시 눌러야) 떼면 중립', closed.ctx === 'gameplay' && closed.squid === false && rel.squid === false && rel.fire === false, { closed, rel });
    ok('T018 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T019: 포커스 이탈·복귀
  if (only.has('focus')) {
    const { page, errors } = await open();
    await practice(page);
    await setPad(page, 0, X360({ 0: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    await setPad(page, 0, X360({ 7: 1 })); await frames(page, 4);
    const firing = (await st(page)).fire;
    // 탭 숨김(포커스 이탈)을 흉내 낸다: document.hidden = true + visibilitychange
    await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`); await frames(page, 4);
    await page.evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
    const blurred = await st(page);
    await page.evaluate('__inkwave.resume()'); await frames(page, 6);
    const back = await st(page);
    ok('T019 발사 중 포커스 이탈 → 정지·중립, 재개 뒤에도 누른 채인 RT로 자동 발사 안 함', firing && blurred.paused && !blurred.fire && !back.fire && !back.paused, { firing, blurred: blurred.paused, back: back.fire });
    await setPad(page, 0, X360()); await frames(page, 3); await setPad(page, 0, X360({ 7: 1 })); await frames(page, 3);
    ok('T019 다시 누르면 발사', (await st(page)).fire === true);
    ok('T019 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T017: 메뉴 패드 탐색·확인 관통 없음·텍스트 입력
  if (only.has('menu')) {
    const { page, errors } = await open();
    await setPad(page, 0, X360({ 0: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    const f0 = await page.evaluate('document.querySelector(".is-focus, [data-focus]")?.textContent || __inkwave.menus._focus?.textContent || ""');
    await setPad(page, 0, X360({ 13: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    const f1 = await page.evaluate('__inkwave.menus._focus?.textContent || ""');
    ok('T017 방향키 아래로 메뉴 포커스 이동', f0 !== f1, { f0, f1 });
    // B = 뒤로: 설정 화면에 들어갔다가 B로 나온다
    await page.evaluate(`__inkwave.menus._go('settings')`); await frames(page, 20);
    await setPad(page, 0, X360({ 1: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 20);
    const afterB = await page.evaluate('__inkwave.menus.current');
    ok('T011·T017 B = 뒤로(설정 → 메인)', afterB === 'main', afterB);
    // 텍스트 입력 중에는 패드 방향이 메뉴를 움직이지 않는다(문자는 입력란으로)
    await page.evaluate(`(() => { const i = document.createElement('input'); i.id = '__t'; __inkwave.menus.el.appendChild(i); i.focus(); })()`); await frames(page, 2);
    const fa = await page.evaluate('__inkwave.menus._focus?.textContent || ""');
    await setPad(page, 0, X360({ 13: 1 })); await frames(page, 3); await setPad(page, 0, X360()); await frames(page, 3);
    await page.keyboard.type('ab');
    const tx = await page.evaluate(`({ ctx: __inkwave.policy.context, focus: __inkwave.menus._focus?.textContent || '', val: document.getElementById('__t').value })`) as { ctx: string; focus: string; val: string };
    await page.evaluate(`document.getElementById('__t').remove()`);
    ok('T017 텍스트 입력 컨텍스트: 패드 탐색 없음·문자 입력됨', tx.ctx === 'textEntry' && tx.focus === fa && tx.val === 'ab', tx);
    // 확인을 누른 채 전투가 시작돼도 점프로 새지 않는다
    await page.evaluate(`window.__log = []; (function f() { const g = __inkwave, m = g.match, fr = window.__G.frame; const l = [g.policy.context, m && m.attract, m && m.state, fr && fr.actions.jump.held, g.frames.blocked.has('jump'), g.menus.current, g.input.pads.armed, g.input.pads.status, !!(g.input.pad && g.input.pad.buttons[0].pressed), g.frames.context].join(','); if (window.__log[window.__log.length - 1] !== l) window.__log.push(l); requestAnimationFrame(f); })()`);
    // A를 누른 채(메뉴 컨텍스트) 연습을 시작한다: 같은 누름이 로딩을 건너 전투 컨텍스트에 남아 있다
    await page.evaluate(`window.__pads[0] = ${JSON.stringify(X360({ 0: 1 }))}; void __inkwave.startPractice({ mapId: 'tidewater' })`);
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing" && __inkwave.match.local', { timeout: 180000, polling: 100 });
    let jumped = false;
    for (let i = 0; i < 20; i++) { await frames(page, 2); if ((await st(page)).jump) jumped = true; }
    ok('T017 메뉴에서 누른 A가 전투 점프로 관통하지 않는다', jumped === false, jumped ? await page.evaluate('window.__log.slice(0, 40)') : undefined);
    await setPad(page, 0, X360()); await frames(page, 3);
    ok('T017 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T012: 매핑 창 — 보정 진행, 끊기면 창이 닫힌다
  if (only.has('padmap')) {
    const { page, errors } = await open();
    const ODD = (b: Record<number, number> = {}, ax = [0, 0, 0, 0, -1, -1]) => ({ id: 'USB Joystick 0810:0001', mapping: '', n: 12, b, ax });
    await setPad(page, 0, ODD({ 2: 1 })); await frames(page, 3); await setPad(page, 0, ODD()); await frames(page, 3);
    await page.evaluate(`__inkwave.menus._go('settings')`); await frames(page, 20);
    await page.evaluate('__inkwave.menus._padMapModal()'); await frames(page, 6);
    const t0 = await page.evaluate(`document.querySelector('.iw-modal__text')?.textContent`);
    await setPad(page, 0, ODD({}, [1, 0, 0, 0, -1, -1])); await frames(page, 6); await setPad(page, 0, ODD()); await frames(page, 6);
    const t1 = await page.evaluate(`document.querySelector('.iw-modal__text')?.textContent`);
    await setPad(page, 0, null); await wait(400);
    const open2 = await page.evaluate(`!!document.querySelector('.iw-modal:not(.is-leaving)')`);
    const menuAfter = await page.evaluate('__inkwave.menus.current');
    ok('T012 매핑 창: 단계가 진행되고 패드가 끊기면 창이 닫혀 빠져나올 수 있다', /1\/18/.test(String(t0)) && /2\/18/.test(String(t1)) && !open2 && menuAfter === 'settings', { t0, t1, open2, menuAfter });
    // 전체 단계를 마치면 보정이 저장되고 비표준 패드가 ready가 된다
    await setPad(page, 0, ODD({ 2: 1 })); await frames(page, 3); await setPad(page, 0, ODD()); await frames(page, 3);
    await page.evaluate('__inkwave.menus._padMapModal()'); await frames(page, 6);
    const PRESS: Record<string, { b?: number; ax?: number[] }> = { 'axis:0': { ax: [1, 0, 0, 0, -1, -1] }, 'axis:1': { ax: [0, 1, 0, 0, -1, -1] }, 'axis:2': { ax: [0, 0, 1, 0, -1, -1] }, 'axis:3': { ax: [0, 0, 0, 1, -1, -1] }, 'button:7': { ax: [0, 0, 0, 0, -1, 1] }, 'button:6': { ax: [0, 0, 0, 0, 1, -1] } };
    for (let k = 0; k < 18; k++) {
      const step = await page.evaluate('(() => { const b = __inkwave.padBinder; return b && b.current ? { kind: b.current.kind, std: b.current.std, req: b.current.required } : null; })()') as { kind: string; std: number; req: boolean } | null;
      if (!step) break;
      if (!step.req) { await page.evaluate('__inkwave.padBinder.skip()'); await frames(page, 2); continue; }
      const p = PRESS[`${step.kind}:${step.std}`] ?? { b: step.std };   // 이 패드의 버튼 번호는 표준과 같고 축·트리거만 다르다
      await setPad(page, 0, ODD(p.b !== undefined ? { [p.b]: 1 } : {}, p.ax)); await frames(page, 4); await setPad(page, 0, ODD()); await frames(page, 4);
    }
    await wait(300);
    const saved = await page.evaluate(`({ prof: !!(JSON.parse(localStorage.getItem('inkwave.padProfiles') || '{}').profiles || {})['USB Joystick 0810:0001'], status: __inkwave.input.pads.status })`) as { prof: boolean; status: string };
    ok('T012 보정 저장 후 비표준 패드가 ready', saved.prof && saved.status === 'ready', saved);
    ok('T012 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }

  // ---------------------------------------------------------------- T013(에뮬레이션): 모바일 멀티터치 이동+시점+발사
  if (only.has('touch')) {
    const { page, errors } = await open('', true);
    await practice(page);
    await frames(page, 45);
    const s0 = await st(page);
    const g = await page.evaluate(`(() => { const t = __inkwave.touch; return { fire: t.geom.buttons.find((b) => b.name === 'fire'), w: innerWidth, h: innerHeight }; })()`) as { fire: { cx: number; cy: number }; w: number; h: number };
    // 합성 PointerEvent(pointerType touch)를 window에 보낸다: 가상 키의 실제 처리 경로(캡처 단계 리스너)를 그대로 탄다
    const E = (type: string, id: number, x: number, y: number) => page.evaluate(`window.dispatchEvent(new PointerEvent('${type}', { pointerId: ${id}, pointerType: 'touch', isPrimary: ${id === 1}, clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true }))`);
    const mv: [number, number] = [g.w * 0.2, g.h * 0.7];
    await E('pointerdown', 1, mv[0], mv[1]);
    await E('pointermove', 1, mv[0], mv[1] - 80);
    await E('pointerdown', 2, g.fire.cx, g.fire.cy);
    await frames(page, 4);
    const both = await st(page);
    const p0 = both.pos!; const y0 = both.yaw;
    await E('pointermove', 2, g.fire.cx - 60, g.fire.cy);
    await wait(500);
    const mid = await st(page);
    await E('pointercancel', 2, g.fire.cx - 60, g.fire.cy);     // OS 제스처 취소
    await frames(page, 3);
    const one = await st(page);
    const stillMoving = await page.evaluate('__inkwave.input.touch.mz') as number;
    await E('pointerup', 1, mv[0], mv[1] - 80);
    await frames(page, 3);
    const none = await st(page);
    ok('T013(에뮬레이션) 모바일 분류·가상 키 표시', s0.hw === true && s0.vcLive === true, s0);
    ok('T013(에뮬레이션) 이동 손가락 + 발사·조준 손가락 동시', both.fire === true && Math.hypot(mid.pos![0] - p0[0], mid.pos![1] - p0[1]) > 0.5 && Math.abs(mid.yaw - y0) > 0.05, { fire: both.fire, moved: Math.hypot(mid.pos![0] - p0[0], mid.pos![1] - p0[1]), dyaw: mid.yaw - y0 });
    ok('T013(에뮬레이션) 발사 손가락 취소 → 발사만 풀리고 이동 유지, 모두 떼면 중립', one.fire === false && stillMoving > 0.2 && none.fire === false && (await page.evaluate('__inkwave.input.touch.mz')) === 0, { one: one.fire, stillMoving, none: none.fire });
    await page.screenshot({ path: 'shots/input/mobile-virtual.png' });
    await page.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true, deviceScaleFactor: 2.75 }); await frames(page, 6);
    const port = await st(page);
    ok('T019(에뮬레이션) 세로로 돌리면 로컬 경기 정지·가상 키 입력 중지', port.paused && !port.vcLive, { paused: port.paused, vc: port.vcLive });
    ok('T013 콘솔 오류 없음', errors.length === 0, errors.slice(0, 3));
    await page.close();
  }
} catch (e) {
  ok('실행 오류', false, String((e as Error).stack || e));
}
await browser.close().catch(() => {});
console.log(JSON.stringify(results, null, 2));
console.log(`input-check: ${Object.keys(results).length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
