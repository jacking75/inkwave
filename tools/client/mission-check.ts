// 캠페인 임무 실행 검사(33번 T022~T046). 개발 서버의 실제 게임에서 임무를 열고, 플레이어를 목표로 옮기며 바닥을 칠하고
// 적을 실제 피해 경로(Actor.damage)로 쓰러뜨려 목표·체크포인트·저장·결과를 확인한다. 순간 이동·직접 도색은 "논리 검사"이며
// 사람이 조작하는 완주(33번 14절 U003~U006)를 대신하지 않는다.
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
// 전투 상태까지 기다린다. 기다리는 동안 프롤로그 패널·막는 대본을 넘긴다(넘기지 않으면 패널 진행 속도에 따라 결과가 흔들린다)
async function waitCombat(page: Page, ms = 180000): Promise<void> {
  const t0 = Date.now(), done = '!!(__inkwave.session && __inkwave.session.state === "combat")';
  await page.evaluate(HELPERS);
  while (Date.now() - t0 < ms && !(await ev<boolean>(page, done))) { await ev(page, '__m.skipStory()'); await wait(250); }
  if (!(await ev<boolean>(page, done))) throw new Error('전투 시작 대기 실패: ' + JSON.stringify(await ev(page, '({ menu: __inkwave.menus.current, st: __inkwave.session && __inkwave.session.state, save: !!__inkwave.store.current })')));
  await page.evaluate(HELPERS);
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
// 출현 묶음이 실제로 정리될 때까지(headless는 게임 시간이 느려 벽시계 시간만으로는 출현 전에 끝날 수 있다)
async function clearEncounter(page: Page, x: number, z: number, enc: string, maxSecs = 30): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxSecs * 1000 && (await ev<string>(page, `__inkwave.session.encounters.state('${enc}')`)) !== 'cleared') await clearArea(page, x, z, 0.5);
}

// 2장 이후 임무의 공통 검수 계획(아래 generic). 임무 고유 검사는 extra에 둔다.
const CH5 = ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3'];
const PLANS: Record<string, Plan> = {
  '2-1': { prev: ['1-2', '1-3', '2-1'], walk: ['recA', 'cp1', 'crate', 'cp2', 'recB', 'exit'], route: { take: 'enc-front', other: 'enc-side' } },
  '2-2': { prev: ['1-2', '1-3', '2-1', '2-2'], walk: ['relayA', 'cp1', 'relayB', 'cp2', 'unit:glass', 'crate', 'box'], before: { 'o-boss': glassEye } },
  '3-1': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1'], walk: ['relay1', 'cp1', 'crate', 'relay2', 'cp2', 'relay3', 'papers'], before: { 'o-3': relayKept } },
  '3-2': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2'], walk: ['cp1', 'crate', 'cp2', 'unit:porter', 'seal'], before: { 'o-boss': porter } },
  '3-3': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3'], walk: ['cp-boss', 'gear'], before: { 'o-boss': hullSolo } },
  '4-1': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1'], walk: ['moorA', 'cp1', 'crate', 'cp2', 'moorB', 'term'], before: { 'o-a': moorHold }, extra: allWeapons },
  '4-2': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2'], walk: ['kit1', 'kit2', 'cp1', 'crate', 'cp2', 'unit:gate', 'log'], before: { 'o-boss': gatekeeper } },
  '4-3': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3'], walk: ['cp-boss', 'beaconA', 'beaconX', 'unit:skew', 'helm'], before: { 'o-x': skewMoved, 'o-boss': skewLate }, ownDeath: true },
  '5-1': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1'], walk: ['pumpW', 'cp1', 'crate', 'pumpE', 'log'], before: { 'o-e2': pumpsSeparate }, skipCrate: true },
  '5-2': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2'], walk: ['link1', 'cp1', 'crate', 'link2', 'cp2', 'unit:spr1', 'unit:scrub', 'safe'], before: { 'o-boss': sprinklers } },
  '5-3': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3'], walk: ['cp-boss', 'unit:sprL', 'unit:salt', 'unit:sprR', 'design'], before: { 'o-boss': saltSafe }, ownDeath: true },
  '6-1': { prev: [...CH5, '6-1'], walk: ['gate1', 'cp1', 'gate2', 'cp2', 'crate', 'gate3', 'cp3', 'comm'], before: { 'o-e': canalFall } },
  '6-2': { prev: [...CH5, '6-1', '6-2'], walk: ['cp1', 'crate', 'unit:twinS', 'unit:twinW', 'lock'], before: { 'o-twins': twins } },
  '6-3': { prev: [...CH5, '6-1', '6-2', '6-3'], walk: ['cp-boss', 'ctrlA', 'ctrlB', 'unit:regulator', 'box'], before: { 'o-boss': regulator }, ownDeath: true },
  '7-1': { prev: [...CH5, '6-1', '6-2', '6-3', '7-1'], walk: ['relay1', 'cp1', 'crate', 'relay2', 'cp2', 'relay3', 'tower'], before: { 'o-3': highRelay } },
  '7-2': { prev: [...CH5, '6-1', '6-2', '6-3', '7-1', '7-2'], walk: ['hold', 'cp1', 'cp2', 'unit:cmd', 'origin', 'crate'], before: { 'o-boss': commander } },
  '7-3': { prev: [...CH5, '6-1', '6-2', '6-3', '7-1', '7-2', '7-3'], walk: ['cp-final', 'ring2', 'ring1', 'ring3', 'core'], before: { 'o-r1': waveRing1, 'o-r2': waveTo(0.33), 'o-r3': waveRing3 }, ownDeath: true },
  '2-3': { prev: ['1-2', '1-3', '2-1', '2-2', '2-3'], walk: ['cp-boss', 'txL', 'txC', 'txR', 'unit:orgel', 'log'], before: { 'o-t1': orgelClosed, 'o-t2': orgelOpenRetry, 'o-boss': orgelAllOff } },
};
// 3-1: 앞서 복구한 중계기 둘레를 적 잉크로 덮어도 복구가 풀리지 않는다(뒤로 돌아가 지킬 필요 없음)
async function relayKept(page: Page): Promise<void> {
  const r = await ev<{ done: string[]; c1: boolean; c2: boolean; paint: number }>(page, `(() => { const s = __inkwave.session, G = window.__G, THREE = G.local.pos.constructor;
    for (const id of ['relay1', 'relay2']) { const d = s.mission.devices.find((x) => x.id === id), p = s._ground(d.at); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; G.paint.splat(new THREE(p.x + Math.cos(a) * 2, p.y + 0.3, p.z + Math.sin(a) * 2), 1.6, 1, { seed: i }); } G.paint.splat(new THREE(p.x, p.y + 0.3, p.z), 2.4, 1, { seed: 77 }); }
    G.paint.flush(0);
    return { done: s.objectives.snapshot(), c1: s.devices.get('relay1').complete, c2: s.devices.get('relay2').complete, paint: s._floorPaint(s.mission.devices[0], 0) }; })()`);
  await pass(page, 1500);
  const after = await st(page);
  ok('T053 3-1: 복구한 중계기 1·2를 적 잉크로 덮어도 복구 유지(적이 빼앗지 않음)', r.c1 && r.c2 && after.done.includes('o-1') && after.done.includes('o-2'), { r, after });
  // 안벽 밖 바다로 떨어지면 → 실패 → 최근 CP(cp2)에서 현재 구간만 재시작
  await ev(page, `(() => { const C = Math.cos(35 * Math.PI / 180), S = Math.sin(35 * Math.PI / 180), x = 28, z = -15, a = __m.G.local; a.invuln = 0; a.pos.set(x * C + z * S, 0.5, -x * S + z * C); a.vel.set(0, 0, 0); })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && (await ev<string>(page, '__inkwave.session.state')) === 'combat') await pass(page, 300);
  const fell = await ev<{ st: string; by: string | null }>(page, '({ st: __inkwave.session.state, by: __inkwave.session.lastAttacker })');
  await pass(page, 1800);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  ok('T053 3-1: 바다 낙하 → 실패 → 최근 CP2에서 재시작(중계기 1·2 유지, 현재 구간 적만 처음 상태)', fell.st === 'failed' && re.cp === 'cp2' && re.done.includes('o-1') && re.done.includes('o-2') && re.enc['enc-c'] === 'idle' && re.alive, { fell, re });
}
// 3-2 적재장 포수: 통 두 개(0.6초 시간차, 각각 그때 플레이어 자리, 1초 예고)·3초 장전 중 접근해도 공격 없음·
// 절반 체력 지원 1회·정예 재도전에서 지원·낙하 예고·기록 상태 복원
const KELP = '(() => { const c = Math.cos(35 * Math.PI / 180), s = Math.sin(35 * Math.PI / 180); return (x, z) => [x * c + z * s, -x * s + z * c]; })()';
async function porter(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('porter')`))) { await ev(page, `(() => { const k = ${KELP}, w = k(-10, -16); __m.tp(w[0], 3, w[1]); __m.skipStory(); return 0; })()`); await ev(page, '__m.frames(4)'); }
  const r = await ev<{ drops: Array<{ t: number; at: number[]; me: number[]; dur: number }>; quiet: number; near: boolean }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('porter'), b = e.bot, tl = s.preview.telegraphs, G = window.__G, k = ${KELP};
    const drops = [], seen = new Set(); const t0 = G.time; let i = 0, lastEnd = 0, quiet = 0, near = false;
    while (G.time - t0 < 14) {
      const w = near ? k(-9.5, -19) : k(-4 + Math.sin(i++ * 0.15) * 1.6, -14); __m.tp(w[0], 3, w[1]); __m.skipStory();
      for (const l of tl.live) if (l.spec.attacker === e && !seen.has(l.spec)) { seen.add(l.spec); drops.push({ t: +(G.time - t0).toFixed(2), at: [l.spec.origin.x, l.spec.origin.z].map((v) => +v.toFixed(2)), me: [G.local.pos.x, G.local.pos.z].map((v) => +v.toFixed(2)), dur: l.spec.duration }); }
      if (drops.length === 2 && b.state === 'recover' && !near) { near = true; lastEnd = G.time; }
      if (near && drops.length === 2) quiet = G.time - lastEnd;
      if (drops.length >= 3) break;
      await __m.frames(1); }
    return { drops, quiet: +quiet.toFixed(2), near }; })()`);
  const d = r.drops, gap = d.length >= 2 ? d[1].t - d[0].t : 0;
  const onMe = (x: { at: number[]; me: number[] }) => Math.hypot(x.at[0] - x.me[0], x.at[1] - x.me[1]) < 0.4;
  ok('T054 3-2 포수: 1초 예고 통 두 개(0.6초 시간차·각각 그때 플레이어 자리), 장전 중 가까이 가도 즉시 공격 없음(약 3초)', d.length >= 2 && d[0].dur >= 0.9 && gap > 0.45 && gap < 0.8 && onMe(d[0]) && onMe(d[1]) && r.near && r.quiet >= 2.9, r);
  // 절반 체력 → 지원 사격병 1명(한 번만)
  await ev(page, `(() => { const a = __inkwave.session.encounters.unitActor('porter'); let n = 0; while (a.hp / a.tune.hp > 0.45 && n++ < 400) a.damage(20, __m.G.local, 'weapon'); })()`);
  await pass(page, 2500);
  const sup1 = await ev<string[]>(page, '__inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id)');
  await ev(page, `(() => { const a = __inkwave.session.encounters.unitActor('porter'); let n = 0; while (a.hp / a.tune.hp > 0.2 && n++ < 400) a.damage(20, __m.G.local, 'weapon'); })()`);
  await pass(page, 2500);
  const sup2 = await ev<string[]>(page, '__inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id)');
  ok('T054 3-2 포수: 절반 체력 지원 사격병 1회(더 맞아도 추가 소환 없음)', sup1.filter((x) => x === 'x-g1').length === 1 && sup2.filter((x) => x.startsWith('x-')).length <= 1, { sup1, sup2 });
  // 정예 재도전: 지원·낙하 예고·기록 상태 복원
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await ev<{ cp: string; enc: string; live: string[]; tel: number; done: string[]; seal: boolean; sup: boolean }>(page, '(() => { const s = __inkwave.session; const r = s.encounters.runs.get("enc-boss"); return { cp: s.cp.checkpointId, enc: s.encounters.state("enc-boss"), live: s.encounters.liveActors().map((a) => a.bot.unit.id), tel: s.preview.telegraphs.live.length, done: s.objectives.snapshot(), seal: s.devices.get("seal").complete, sup: r.support.size > 0 }; })()');
  ok('T054 3-2: 포수전 사망 → 전투 직전 CP2, 포수·지원 호출·낙하 예고·봉쇄 기록 처음 상태', re.cp === 'cp2' && re.enc === 'idle' && re.live.length === 0 && re.tel === 0 && !re.done.includes('o-boss') && !re.seal && !re.sup, re);
}
// 3-3 솔로 HULLBREAKER: 단계별 허용 기술(1 강타·통 / 2 + 돌진 / 3 + 소형 게, 광선·회전 없음), 돌진 벽 충돌 기절과 근접 높이의
// 배 약점, 소형 게 동시 3·전체 6 이하, 보스전 사망 → 체력·소환 횟수 초기화, 보스 모드 체력 공식·두뇌 불변
const HULL_STAND = '13.76, 3, -4.75';   // 부두 좌표 (14, 4): 보스 영역 안 안벽(물에 떨어지지 않는 고정 관전 자리)
async function hullSolo(page: Page, m: MissionJson): Promise<void> {
  const g = m.boss!.giant!;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000 && !(await ev<boolean>(page, '!!(window.__G.boss && window.__G.boss.visible && window.__G.boss.anim === 0)'))) { await ev(page, `(__m.tp(${g.at[0]}, 3, ${g.at[2] - 6}), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); }
  const info = await ev<{ hp: number; brain: string; modeHp: number }>(page, `(async () => { const b = window.__G.boss; const B = await import('/src/boss/boss.js'); return { hp: b.maxHp, brain: b.brain.constructor.name, modeHp: B.BOSS.hpPerUnit }; })()`);
  ok('T055 3-3: 솔로 HULLBREAKER 체력 18,000·솔로 두뇌(보스 모드 체력 공식 18,000×인원은 그대로)', info.hp === 18000 && info.brain === 'SoloHullBrain' && info.modeHp === 18000, info);
  // 단계별 기술: 단계마다 일정 시간 관찰(포효 무적이 끝날 때까지 기다린 뒤)
  const watch = (secs: number, frac: number) => ev<{ phase: number; moves: string[]; crabMax: number; crabTotal: number }>(page, `(async () => { const b = window.__G.boss, G = window.__G;
    let n = 0; while (b.hp / b.maxHp > ${frac} && n++ < 400) { if (b.invuln) { await __m.frames(10); continue; } b.applyDamage(G.local, 300, false, null); }
    const moves = new Set(); let crabMax = 0; const t0 = G.time;
    while (G.time - t0 < ${secs}) { __m.tp(${HULL_STAND}); __m.skipStory(); if (b.move) moves.add(b.move.id);
      crabMax = Math.max(crabMax, [...b.crabs.values()].filter((c) => !c.dead).length); await __m.frames(3); }
    return { phase: b.phase, moves: [...moves], crabMax, crabTotal: b.brain.crabSpawned }; })()`);
  const p1 = await watch(14, 1);
  ok('T055 3-3 1단계: 강타·통 낙하만', p1.phase === 1 && p1.moves.length > 0 && p1.moves.every((x) => ['slam', 'barrage'].includes(x)), p1);
  const p2 = await watch(16, 0.6);
  ok('T055 3-3 2단계: 강타·통·돌진(광선·회전·소형 게 없음)', p2.phase === 2 && p2.moves.every((x) => ['slam', 'barrage', 'charge'].includes(x)), p2);
  // 돌진 강제 → 벽 충돌 기절 동안 배 약점이 근접 높이로 내려오고, 플레이어가 몸통에 끼지 않는다
  const st = await ev<{ charged: boolean; stun: number; belly: boolean; bellyH: number; alive: boolean; seq: string[] }>(page, `(async () => { const b = window.__G.boss, G = window.__G;
    let charged = false, stun = 0, s0 = 0, belly = false, bellyH = 99; const t0 = G.time; const seq = [];
    for (let k = 0; k < 10 && !stun; k++) { if (!b.move) { b.pos.x = b.home.x; b.pos.z = b.home.z; b.brain.plan = null; } b.brain.force = 'charge'; const t1 = G.time;
      seq.push('lane:' + JSON.stringify(b.brain._lane(b.yaw)));
      while (G.time - t1 < 9) { __m.tp(${HULL_STAND}); __m.skipStory();
        const tag = (b.brain.plan ? 'P' + b.brain.plan.id : '') + (b.move ? 'M' + b.move.id : '') + (b.brain.force ? 'F' : ''); if (tag !== seq[seq.length - 1]) seq.push(tag);
        if (b.move && b.move.id === 'charge') charged = true;
        if (b.stunned) { if (!s0) s0 = G.time; stun = G.time - s0; const h = b.model.hitShapes.find((x) => x.socket === 'belly'); if (h.active) { belly = true; bellyH = Math.min(bellyH, h.pos.y - b.pos.y); } }
        if (stun && !b.stunned) break; await __m.frames(3); } }
    return { charged, stun: +stun.toFixed(1), belly, bellyH: +bellyH.toFixed(2), alive: G.local.alive, seq: seq.slice(0, 30) }; })()`);
  ok('T055 3-3: 돌진 뒤 기절(2단계 기본 3.7초, 배 약점 활성·근접 높이 1.6 m 이하)', st.charged && st.stun >= 3 && st.belly && st.bellyH <= 1.6 && st.alive, st);
  const p3 = await watch(24, 0.3);
  ok('T055 3-3 3단계: 소형 게 동시 3 이하·전체 6 이하, 광선·회전 없음', p3.phase === 3 && p3.moves.every((x) => ['slam', 'barrage', 'charge', 'crablets'].includes(x)) && p3.crabMax <= 3 && p3.crabTotal <= 6, p3);
  // 보스전 사망 → 체력·소환 횟수 초기화(다시 들어가면 새로 선다)
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const gone = await ev<{ boss: boolean; cp: string }>(page, '({ boss: !!window.__G.boss, cp: __inkwave.session.cp.checkpointId })');
  const t2 = Date.now();
  while (Date.now() - t2 < 30000 && !(await ev<boolean>(page, '!!(window.__G.boss && window.__G.boss.visible)'))) { await ev(page, `(__m.tp(${g.at[0]}, 3, ${g.at[2] - 6}), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); }
  const fresh = await ev<{ hp: number; max: number; phase: number; crabs: number; spawned: number }>(page, '(() => { const b = window.__G.boss; return { hp: b.hp, max: b.maxHp, phase: b.phase, crabs: b.crabs.size, spawned: b.brain.crabSpawned }; })()');
  ok('T055 3-3: 보스전 사망 → 보스 앞 CP, 보스 치움 → 재입장 시 체력·단계·소환 횟수 처음 상태', !gone.boss && gone.cp === 'cp-boss' && fresh.hp === fresh.max && fresh.phase === 1 && fresh.crabs === 0 && fresh.spawned === 0, { gone, fresh });
}
// 4-1: 안정화 원을 벗어나면 누적만 멈추고(줄지 않음) 사망 때만 지정 상태(여기서는 임무 시작)로 돌아간다
async function moorHold(page: Page): Promise<void> {
  const acc = () => ev<number>(page, `+__inkwave.session.devices.get('moorA').accum.toFixed(2)`);
  await ev(page, `__m.paintAt(-22, -18, 3)`);
  const EL = '__inkwave.session.elapsed';
  const stay = async (x: number, z: number, secs: number) => { const e0 = await ev<number>(page, EL), t0 = Date.now(); while (Date.now() - t0 < 30000 && (await ev<number>(page, EL)) - e0 < secs) { await ev(page, `(__m.tp(${x}, 3, ${z}), __m.killAll(), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); } };
  await stay(-22, -18, 4);
  const a1 = await acc();
  await stay(-22, -24, 3);
  const a2 = await acc();
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const a3 = await acc();
  ok('T056 4-1: 안정화 원 이탈은 누적만 멈춤(줄지 않음), 사망 재시작에서만 처음 상태', a1 > 2 && Math.abs(a2 - a1) < 0.05 && a3 === 0, { a1, a2, a3 });
}
// 4-1 완료: 주 무기 12종 모두 캠페인에서 해금(검사 저장은 앞 임무를 해금만 했으므로 실제 진행에 있을 2-1·3-1 완료를 더해 계산)
async function allWeapons(page: Page): Promise<void> {
  await pass(page, 1500);
  // 완료 저장이 확정된 뒤에 읽는다(결과 화면 전 완료 대본을 넘기는 시간만큼 늦을 수 있다)
  await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
  const r = await ev<{ n: number; list: string[]; profile: unknown }>(page, `(async () => { const c = await import('/src/campaign/craft.js'); const cur = __inkwave.store.current; const s = { ...cur, done: [...new Set([...cur.done, '2-1', '3-1'])] }; const l = c.unlockedWeapons(s); return { n: new Set(l).size, list: l, profile: __inkwave.settings && __inkwave.settings.weapon }; })()`);
  ok('T056 4-1 완료: 캠페인 주 무기 12종 해금(캠페인 저장 기준)', r.n === 12, r);
}
// 4-2 계류 수문장: 1초 부채꼴 예고 → 방패 발사 → 3초 노출(측면·후방 약점), 정면은 감소, 절반 체력 위치 변경 1회, 정예 앞 CP 재시작
async function gatekeeper(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('gate')`))) { await ev(page, '(__m.tp(-9, 3, -4.2), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const cyc = await ev<{ tele: Array<{ shape: string; dur: number }>; open: number; side: number; front: number }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('gate'), b = e.bot, tl = s.preview.telegraphs, G = window.__G;
    const tele = [], seen = new Set(); let open = 0, o0 = 0, side = 0, front = 0; const t0 = G.time;
    while (G.time - t0 < 16) { __m.tp(-9, 3, -4.2); __m.skipStory();
      for (const l of tl.live) if (l.spec.attacker === e && !seen.has(l.spec)) { seen.add(l.spec); tele.push({ shape: l.spec.shape, dur: l.spec.duration }); }
      if (b.state === 'open') { if (!o0) o0 = G.time; open = G.time - o0;
        if (!side) { const p = G.local, y = e.yaw, sv = p.pos.clone(); p.pos.set(e.pos.x - Math.cos(y) * 3, e.pos.y, e.pos.z + Math.sin(y) * 3); side = s._enemyTaken(e, 20, p); p.pos.copy(sv); } }
      else if (o0) break;
      await __m.frames(1); }
    const p = G.local, y = e.yaw, sv = p.pos.clone(); b.state = 'chase'; p.pos.set(e.pos.x + Math.sin(y) * 4, e.pos.y, e.pos.z + Math.cos(y) * 4); front = s._enemyTaken(e, 20, p); p.pos.copy(sv);
    return { tele, open: +open.toFixed(2), side: +side.toFixed(1), front: +front.toFixed(1) }; })()`);
  ok('T057 4-2 수문장: 1초 부채꼴 예고 → 방패 발사 → 약 3초 노출(측면 약점 배율), 방패 정면은 감소', cyc.tele.length >= 1 && cyc.tele[0].shape === 'cone' && cyc.tele[0].dur >= 0.9 && cyc.open >= 2.8 && cyc.side >= 29 && cyc.front < 10, cyc);
  await ev(page, `(() => { const a = __inkwave.session.encounters.unitActor('gate'); let n = 0; while (a.hp / a.tune.hp > 0.45 && n++ < 400) a.damage(20, __m.G.local, 'weapon'); })()`);
  const mv = await ev<{ moved: boolean; post: number[]; again: boolean }>(page, `(async () => { const e = __inkwave.session.encounters.unitActor('gate'), b = e.bot, G = window.__G; let t0 = G.time;
    while (G.time - t0 < 16 && !b.moved) { __m.tp(-9, 3, -4.2); __m.skipStory(); await __m.frames(2); }
    const post = [b.post.x, b.post.z]; const moved = !!b.moved; let n = 0; while (e.hp / e.tune.hp > 0.2 && n++ < 400) e.damage(20, G.local, 'weapon');
    let again = false; t0 = G.time; while (G.time - t0 < 10) { __m.tp(-9, 3, -4.2); __m.skipStory(); if (Math.hypot(b.post.x - post[0], b.post.z - post[1]) > 0.5) again = true; await __m.frames(2); }
    return { moved, post, again }; })()`);
  ok('T057 4-2 수문장: 절반 체력 뒤 노출이 끝나면 한 번만 자리 이동(반복 없음)', mv.moved && Math.hypot(mv.post[0] + 14, mv.post[1] - 3) < 0.5 && !mv.again, mv);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  ok('T057 4-2: 정예전 사망 → 정예 앞 CP2(장비 2개 유지, 수문장 처음 상태)', re.cp === 'cp2' && re.done.includes('o-k1') && re.done.includes('o-k2') && re.enc['enc-boss'] === 'idle', re);
}
// 4-3 스큐: 서쪽 거점에서 두 발·3초 정비 → 중계점 A 복구 뒤 동쪽 거점으로 / 30% 이하 정비마다 거점 왕복(예고·정비 유지) / 사망 → 거점·중계점·체력 초기화
const SKEW = `const s = __inkwave.session, e = s.encounters.unitActor('skew'), b = e && e.bot, tl = s.preview.telegraphs, G = window.__G;`;
async function skewMoved(page: Page): Promise<void> {
  const r = await ev<{ post: number[]; relocating: boolean }>(page, `(() => { ${SKEW} return { post: [b.post.x, b.post.z], relocating: b.relocating }; })()`);
  ok('T058 4-3 스큐: 중계점 A 복구 → 동쪽 거점으로 이동', Math.hypot(r.post[0] - 14, r.post[1] + 2) < 0.5, r);
}
async function skewLate(page: Page): Promise<void> {
  const r = await ev<{ specs: number; moves: number; restGap: number; posts: number[][] }>(page, `(async () => { ${SKEW}
    let n = 0; while (e.hp / e.tune.hp > 0.28 && n++ < 400) e.damage(20, G.local, 'weapon');
    const seen = new Set(), posts = []; let specs = 0, moves = 0, last = [b.post.x, b.post.z], lastSpec = 0, restGap = 99; const t0 = G.time;
    while (G.time - t0 < 30 && moves < 2) { __m.tp(0, 3, -12); __m.skipStory();
      for (const l of tl.live) if (l.spec.attacker === e && !seen.has(l.spec)) { seen.add(l.spec); specs++; lastSpec = G.time; }
      if (Math.hypot(b.post.x - last[0], b.post.z - last[1]) > 0.5) { moves++; last = [b.post.x, b.post.z]; posts.push(last.map((v) => +v.toFixed(1))); }
      await __m.frames(2); }
    return { specs, moves, restGap, posts }; })()`);
  ok('T058 4-3 스큐: 30% 이하에서 정비가 끝날 때마다 거점 왕복(새 거점에서 다시 예고)', r.moves >= 2 && r.specs >= 2, r);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  ok('T058 4-3: 보스전 사망 → 보스장 앞 CP, 중계점·거점·체력 함께 초기화', re.cp === 'cp-boss' && !re.done.includes('o-a') && !re.done.includes('o-x') && re.enc['enc-boss'] !== 'cleared', re);
  // 다시 중계점 둘을 복구한다(이후 공통 검수가 스큐를 처치한다)
  for (const [id, x, z] of [['beaconA', -22, -12], ['beaconX', 20, -11]] as const) { await operate(page, x, z, 2.8); void id; }
  const again = await st(page);
  ok('T058 4-3: 재도전에서 중계점 둘 다시 복구', again.done.includes('o-a') && again.done.includes('o-x'), again);
}
// 5-1: 첫 펌프는 완료 상태로 남고(다시 잠기지 않음) 둘째 펌프 누적은 0에서 따로 시작한다
async function pumpsSeparate(page: Page): Promise<void> {
  await ev(page, '__m.paintAt(6, -14, 3)');
  const EL = '__inkwave.session.elapsed', e0 = await ev<number>(page, EL), t0 = Date.now();
  while (Date.now() - t0 < 30000 && (await ev<number>(page, EL)) - e0 < 3) { await ev(page, '(__m.tp(6, 3, -14), __m.killAll(), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const r = await ev<{ w: boolean; wProg: number; e: number; done: string[] }>(page, `(() => { const s = __inkwave.session; const w = s.devices.get('pumpW'), e = s.devices.get('pumpE'); return { w: w.complete, wProg: w.progress, e: +e.accum.toFixed(2), done: s.objectives.snapshot() }; })()`);
  ok('T059 5-1: 첫 펌프 완료 유지(다시 잠기지 않음)·둘째 펌프 누적은 따로(3초 머문 만큼만)', r.w && r.wProg === 1 && r.e > 1.5 && r.e < 5 && r.done.includes('o-w'), r);
}
// 5-2 살수 장치: 둘레를 적 잉크로 다시 칠함 → 끄면 그 구역 재도색이 멈추고(다른 장치는 계속) 정예는 2초 정비 →
// 둘 다 꺼도 정예의 일반 공격은 남음(무적 없음) → 정예전 사망 → 연결점 유지·장치·정예·도색 함께 복원
async function sprinklers(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('spr2')`))) { await ev(page, '(__m.tp(0, 3, -6), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const r = await ev<{ before1: number; after1: number; after2: number; elite: string[]; tele: number; alive: boolean }>(page, `(async () => { const s = __inkwave.session, G = window.__G;
    const zone = (x, z) => s._floorPaint({ at: [x, -1.2, z], paintRadius: 2.6, radius: 2.6, paintNeed: 0.6, kind: 'terminal', id: 'z' }, 1);
    const wipe = (x, z) => { __m.paintAt(x, z, 3); };
    const wait = async (secs) => { const t0 = G.time; while (G.time - t0 < secs) { __m.tp(0, 3, -6); __m.skipStory(); await __m.frames(3); } };
    const e1 = s.encounters.unitActor('spr1'), elite = s.encounters.unitActor('scrub');
    wipe(-6, -1); wipe(8, 1); await wait(4.5);
    const before1 = zone(-6, -1);
    // 장치 1을 끈다 → 정예 2초 정비
    const st = []; let n = 0; while (e1.alive && n++ < 200) e1.damage(50, G.local, 'weapon');
    st.push(elite.bot.state);
    wipe(-6, -1); wipe(8, 1); await wait(7);
    const after1 = zone(-6, -1), after2 = zone(8, 1);
    // 장치 2도 끈다 → 정예는 계속 공격(예고가 나온다)
    const e2 = s.encounters.unitActor('spr2'); n = 0; while (e2 && e2.alive && n++ < 200) e2.damage(50, G.local, 'weapon');
    const tl = s.preview.telegraphs, seen = new Set(); let tele = 0; const t1 = G.time;
    while (G.time - t1 < 10 && !tele) { __m.tp(elite.pos.x + 6, 3, elite.pos.z - 4); __m.skipStory(); for (const l of tl.live) if (l.spec.attacker === elite && !seen.has(l.spec)) { seen.add(l.spec); tele++; } await __m.frames(2); }
    return { before1: +before1.toFixed(2), after1: +after1.toFixed(2), after2: +after2.toFixed(2), elite: st, tele, alive: elite.alive }; })()`);
  ok('T060 5-2 살수 장치: 둘레 재도색 → 끄면 그 구역만 멈춤(다른 장치는 계속), 정예 2초 정비, 둘 다 꺼도 정예 공격 유지', r.before1 > 0.25 && r.after1 < 0.05 && r.after2 > 0.25 && r.elite[0] === 'recover' && r.tele >= 1 && r.alive, r);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const t2 = Date.now();
  while (Date.now() - t2 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('spr1')`))) { await ev(page, '(__m.tp(0, 3, -6), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const re = await ev<{ cp: string; done: string[]; live: string[]; hp: number }>(page, `(() => { const s = __inkwave.session, e = s.encounters.unitActor('scrub'); return { cp: s.cp.checkpointId, done: s.objectives.snapshot(), live: s.encounters.liveActors().map((a) => a.bot.unit.id), hp: e ? e.hp / e.tune.hp : -1 }; })()`);
  ok('T060 5-2: 정예전 사망 → CP2(연결점 유지), 장치 2개·정예 처음 상태', re.cp === 'cp2' && re.done.includes('o-l1') && re.done.includes('o-l2') && ['scrub', 'spr1', 'spr2'].every((x) => re.live.includes(x)) && re.hp === 1, re);
}
// 5-3 솔트: 장치 끄기 → 안전 원 60% 6초 → 4초 과열(예고 없음·약점), 60% 아래면 누적 멈춤(줄지 않음), 절반 체력에 원 다시 열림,
// 장치·원을 다 쓰면 12초 안에 정비 빈틈, 사망 → 장치·누적·체력 초기화
async function saltSafe(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('sprR')`))) { await ev(page, '(__m.tp(0, 3, -12), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const r = await ev<Record<string, unknown>>(page, `(async () => { const s = __inkwave.session, G = window.__G, salt = s.encounters.unitActor('salt'), b = salt.bot, tl = s.preview.telegraphs, S = s.safe, THREE = G.local.pos.constructor;
    const kill = (id) => { const a = s.encounters.unitActor(id); let n = 0; while (a && a.alive && n++ < 200) a.damage(50, G.local, 'weapon'); };
    const until = async (cond, secs, x, z) => { const t0 = G.time; while (G.time - t0 < secs && !cond()) { __m.tp(x, 3, z); __m.skipStory(); await __m.frames(2); } return +(G.time - t0).toFixed(2); };
    kill('sprL'); __m.paintAt(-14, -1, 3);
    const t1 = await until(() => b.overheated, 12, -14, 2.5);
    const seen = new Set(); let tele = 0; const t2 = G.time; while (G.time - t2 < 3.5) { __m.tp(-14, 3, 2.5); for (const l of tl.live) if (l.spec.attacker === salt && !seen.has(l.spec)) { seen.add(l.spec); tele++; } await __m.frames(2); }
    const p = G.local, sv = p.pos.clone(); p.pos.set(salt.pos.x + 4, salt.pos.y, salt.pos.z); const hot = s._enemyTaken(salt, 20, p); p.pos.copy(sv);
    // 둘째 원: 칠한 뒤 2초 누적 → 적 잉크로 덮어 60% 아래 → 2초 동안 누적 그대로
    kill('sprR'); __m.paintAt(16, -3, 3);
    await until(() => (S.acc[1] || 0) > 2, 8, 16, 0.5);
    const a1 = S.acc[1]; const c = s._ground([16, 0, -3]);
    for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; for (const k of [0.4, 0.9]) G.paint.splat(new THREE(c.x + Math.cos(an) * 2.8 * k, c.y + 0.3, c.z + Math.sin(an) * 2.8 * k), 1.5, 1, { seed: i }); } G.paint.splat(new THREE(c.x, c.y + 0.3, c.z), 2.6, 1, { seed: 5 }); G.paint.flush(0);
    await until(() => false, 2, 16, 0.5);
    const a2 = S.acc[1];
    // 절반 체력 → 원 다시 열림
    let n = 0; while (salt.hp / salt.tune.hp > 0.45 && n++ < 400) { b.state = 'chase'; salt.damage(20, G.local, 'weapon'); }
    await until(() => S.rearmed, 3, 16, 0.5);
    const rearmed = S.rearmed && S.used.every((u) => !u);
    // 원 둘 다 써서 주기 정비로: 두 원을 칠하고 차례로 과열을 끝낸다
    for (const [x, z, i] of [[-14, -1, 0], [16, -3, 1]]) { __m.paintAt(x, z, 3); await until(() => S.used[i] && !b.overheated, 20, x, z + 3.5); }
    const tp = await until(() => b.overheated, 14, 0, -14);
    return { t1, tele, hot: +hot.toFixed(1), a1: +a1.toFixed(2), a2: +a2.toFixed(2), rearmed, periodic: tp, used: S.used }; })()`);
  ok('T061 5-3 솔트: 장치를 끄고 원을 칠하면 6초 뒤 4초 과열(예고 없음·약점 배율), 60% 아래면 누적이 멈추고 줄지 않음, 절반 체력 원 다시 열림, 다 쓰면 12초 안 정비 빈틈', (r.t1 as number) >= 5.5 && (r.t1 as number) < 9 && r.tele === 0 && (r.hot as number) >= 29 && Math.abs((r.a2 as number) - (r.a1 as number)) < 0.3 && r.rearmed === true && (r.periodic as number) < 13.5, r);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const t3 = Date.now();
  while (Date.now() - t3 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('sprR')`))) { await ev(page, '(__m.tp(0, 3, -12), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const re = await ev<{ cp: string; live: string[]; hp: number; safe: unknown }>(page, `(() => { const s = __inkwave.session, e = s.encounters.unitActor('salt'); return { cp: s.cp.checkpointId, live: s.encounters.liveActors().map((a) => a.bot.unit.id), hp: e ? e.hp / e.tune.hp : -1, safe: s.safe }; })()`);
  const sf = re.safe as { acc: number[]; used: boolean[]; rearmed: boolean };
  ok('T061 5-3: 보스전 사망 → 보스장 앞 CP, 장치 2개·누적·체력 초기화', re.cp === 'cp-boss' && ['salt', 'sprL', 'sprR'].every((x) => re.live.includes(x)) && re.hp === 1 && !sf.rearmed && !sf.used.some(Boolean) && !sf.acc.some((x) => x > 0), re);
}
// 6-1: 저수로에 떨어지면 최근 제어점의 CP3에서, 제어점 진행과 CP가 같은 상태로 복원된다
async function canalFall(page: Page): Promise<void> {
  const before = await ev<{ cp: string; done: string[] }>(page, '({ cp: __inkwave.session.cp.checkpointId, done: __inkwave.session.cp.done })');
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.pos.set(-3, 0.6, -4); a.vel.set(0, 0, 0); })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && (await ev<string>(page, '__inkwave.session.state')) === 'combat') await pass(page, 300);
  const fell = await ev<string>(page, '__inkwave.session.state');
  await pass(page, 1800);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  const devs = await ev<string[]>(page, `[...__inkwave.session.devices.entries()].filter(([, d]) => d.complete).map(([k]) => k)`);
  ok('T062 6-1: 저수로 낙하 → CP3에서 재시작, 제어점 3개 완료와 CP 진행이 같은 상태', fell === 'failed' && re.cp === 'cp3' && before.cp === 'cp3' && ['o-1', 'o-2', 'o-3'].every((x) => re.done.includes(x)) && ['gate1', 'gate2', 'gate3'].every((x) => devs.includes(x)), { fell, before, re, devs });
}
// 6-2 쌍문지기: 방패를 먼저 쓰러뜨려도 감시는 그대로 싸우고(묶음이 멈추지 않음) 자리를 한 번만 옮긴다, 정예전 사망 → 둘 다 복원
async function twins(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!(__inkwave.session.encounters.unitActor('twinW') && __inkwave.session.encounters.unitActor('twinS'))`))) { await ev(page, '(__m.tp(16, 3, 0), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const dbg = await ev<unknown>(page, `({ live: __inkwave.session.encounters.liveActors().map((a) => a.bot.unit.id), dead: [...__inkwave.session.encounters.dead], st: __inkwave.session.encounters.state('enc-twins') })`);
  if (!(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('twinS')`))) { ok('T063 6-2: 두 정예 출현', false, dbg); return; }
  const hp = await ev<number[]>(page, `['twinS', 'twinW'].map((id) => __inkwave.session.encounters.unitActor(id).tune.hp)`);
  const r = await ev<{ alive: boolean; enc: string; moved: boolean; post: number[]; again: boolean }>(page, `(async () => { const s = __inkwave.session, G = window.__G, a = s.encounters.unitActor('twinS'), w = s.encounters.unitActor('twinW'), b = w.bot;
    let n = 0; while (a.alive && n++ < 200) a.damage(50, G.local, 'weapon');
    let t0 = G.time; while (G.time - t0 < 1) { __m.tp(16, 3, 0); await __m.frames(2); }
    const moved = !!b.moved, post = [b.post.x, b.post.z]; n = 0; while (w.hp / w.tune.hp > 0.3 && n++ < 400) w.damage(20, G.local, 'weapon');
    let again = false; t0 = G.time; while (G.time - t0 < 8) { __m.tp(16, 3, 0); __m.skipStory(); if (Math.hypot(b.post.x - post[0], b.post.z - post[1]) > 0.5) again = true; await __m.frames(2); }
    return { alive: w.alive, enc: s.encounters.state('enc-twins'), moved, post, again }; })()`);
  ok('T063 6-2: 방패 360·감시 300, 한 명이 쓰러져도 묶음은 계속(남은 정예 생존), 남은 정예는 한 번만 자리 이동', hp[0] === 360 && hp[1] === 300 && r.alive && r.enc === 'active' && r.moved && Math.hypot(r.post[0] - 15, r.post[1] - 5) < 0.5 && !r.again, { hp, r });
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const t1 = Date.now();
  while (Date.now() - t1 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('twinW')`))) { await ev(page, '(__m.tp(16, 3, 0), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const re = await ev<{ cp: string; live: string[]; dead: string[] }>(page, `(() => { const s = __inkwave.session; return { cp: s.cp.checkpointId, live: s.encounters.liveActors().map((a) => a.bot.unit.id), dead: [...s.encounters.dead] }; })()`);
  ok('T063 6-2: 정예전 사망 → 정예 앞 CP에서 두 정예 함께 복원', re.cp === 'cp1' && re.live.includes('twinS') && re.live.includes('twinW') && !re.dead.includes('twinS'), re);
}
// 6-3 수문 조율기: 핵 2800·A 뒤 8초 노출·둘 다 끝나면 계속 노출, 사망 → A·B·핵 함께 초기화
async function regulator(page: Page, m: MissionJson): Promise<void> {
  const r = await ev<{ hp: number; name: string; allAt: number; phase: number; always: boolean }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('regulator'), b = e.bot, G = window.__G;
    let always = true; const t0 = G.time; while (G.time - t0 < 10) { __m.tp(0, 3, -24); __m.skipStory(); if (!b.exposed) always = false; await __m.frames(3); }
    return { hp: e.tune.hp, name: e.name, allAt: b.allAt, phase: b.phase, always }; })()`);
  ok('T064 6-3 조율기: 핵 2800·이름 수문 조율기, 두 제어점 뒤 계속 노출(재가동 요구 없음)', r.hp === 2800 && r.name === '수문 조율기' && r.allAt === 2 && r.phase === 2 && r.always, r);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  ok('T064 6-3: 보스전 사망 → 본전투 직전 CP, A·B·핵 함께 초기화', re.cp === 'cp-boss' && !re.done.includes('o-a') && !re.done.includes('o-b') && re.enc['enc-boss'] !== 'cleared', re);
  // 다시 A·B 안정화(이후 공통 검수가 핵을 부순다)
  for (const id of ['ctrlA', 'ctrlB']) {
    const d = m.devices.find((x) => x.id === id)!;
    await ev(page, `__m.paintAt(${d.at[0]}, ${d.at[2]}, 3)`);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && !(await ev<boolean>(page, `__inkwave.session.devices.get('${id}').complete`))) { await ev(page, `(__m.tp(${d.at[0]}, 3, ${d.at[2]}), __m.killAll(), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); }
  }
  const again = await st(page);
  ok('T064 6-3: 재도전에서 A·B 다시 안정화', again.done.includes('o-a') && again.done.includes('o-b'), again);
}
// 7-1: 높은 목표의 화면 방향 표식이 화면 안에 있다(아래 층에서 등을 돌려도), 다른 층 도색은 중계기 도색률에 들어가지 않는다
async function highRelay(page: Page): Promise<void> {
  await ev(page, `(() => { __m.tp(-10, 3, -10); __inkwave.rig.yaw = Math.PI; return 0; })()`); await pass(page, 600);
  const pin = await ev<{ on: boolean; inView: boolean; text: string }>(page, `(() => { const el = document.querySelector('.iw-camp__pin'); const r = el.getBoundingClientRect(); return { on: el.classList.contains('is-on'), inView: r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight, text: el.textContent }; })()`);
  ok('T065 7-1: 높은 중계기 방향 표식이 화면 안(아래 광장에서 등을 돌려도)', pin.on && pin.inView && /m$/.test(pin.text), pin);
}
// 7-2 지휘관: 70% 사격병 2·35% 도색병 1(각 한 번, 남은 호출 안내), 지원이 살아 있는 동안 다음 포격 지연, 지휘관 전 사망은 방어 반복 없음, 원본 기록 미확정
async function commander(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('cmd')`))) { await ev(page, '(__m.tp(15, 3, 0), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  const r = await ev<Record<string, unknown>>(page, `(async () => { const s = __inkwave.session, G = window.__G, e = s.encounters.unitActor('cmd'), b = e.bot, tl = s.preview.telegraphs;
    const toasts = []; const T = document.querySelector('.iw-camp__toast'); const ob = new MutationObserver(() => { if (T && T.textContent) toasts.push(T.textContent); }); if (T) ob.observe(T, { childList: true, characterData: true, subtree: true });
    let n = 0; while (e.hp / e.tune.hp > 0.65 && n++ < 400) e.damage(10, G.local, 'weapon');
    let t0 = G.time; while (G.time - t0 < 3) { __m.tp(15, 3, 0); __m.skipStory(); await __m.frames(2); }
    const live1 = s.encounters.liveActors().map((a) => a.bot.unit.id);
    // 지원이 살아 있는 동안 정비가 끝나지 않는다(다음 포격 지연): 8초 동안 지휘관 새 예고 수
    const seen = new Set(); let tele = 0; t0 = G.time; while (G.time - t0 < 8) { __m.tp(15, 3, 0); __m.skipStory(); for (const l of tl.live) if (l.spec.attacker === e && !seen.has(l.spec)) { seen.add(l.spec); tele++; } await __m.frames(2); }
    const sup = b.supportsAlive;
    for (const id of ['x-g1', 'x-g2']) { const a = s.encounters.unitActor(id); let k = 0; while (a && a.alive && k++ < 200) a.damage(50, G.local, 'weapon'); }
    n = 0; while (e.hp / e.tune.hp > 0.3 && n++ < 400) e.damage(10, G.local, 'weapon');
    t0 = G.time; while (G.time - t0 < 3) { __m.tp(15, 3, 0); __m.skipStory(); await __m.frames(2); }
    const live2 = s.encounters.liveActors().map((a) => a.bot.unit.id);
    n = 0; while (e.hp / e.tune.hp > 0.1 && n++ < 400) e.damage(10, G.local, 'weapon');
    t0 = G.time; while (G.time - t0 < 3) { __m.tp(15, 3, 0); __m.skipStory(); await __m.frames(2); }
    const called = s.encounters.runs.get('enc-cmd').support.size; ob.disconnect();
    return { live1, live2, tele, sup, called, toasts: [...new Set(toasts)], recSaved: __inkwave.store.current.records.includes('rec.terraces.2') }; })()`);
  const l1 = r.live1 as string[], l2 = r.live2 as string[];
  ok('T066 7-2 지휘관: 70% 사격병 2·35% 도색병 1(호출 3회로 끝), 남은 호출 안내, 지원 중 포격 지연', l1.includes('x-g1') && l1.includes('x-g2') && !l1.includes('x-p1') && l2.includes('x-p1') && r.called === 3 && (r.sup as number) >= 1 && (r.tele as number) === 0 && (r.toasts as string[]).some((t) => t.includes('남은 호출')), r);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await st(page);
  const sv = await ev<{ inProg: string[]; recs: string[] }>(page, '({ inProg: __inkwave.store.current.inProgress.done, recs: __inkwave.store.current.records })');
  ok('T066 7-2: 지휘관전 사망 → 방어 반복 없음(제어점 완료 유지), 지원 호출 처음 상태, 원본 기록은 완료 전 미확정', ['cp1', 'cp2'].includes(String(re.cp)) && re.done.includes('o-def') && re.enc['enc-def'] !== 'active' && re.enc['enc-cmd'] === 'idle' && !sv.recs.includes('rec.terraces.2') && !re.done.includes('o-e'), { re, sv });
}
// 7-3 파도껍질: 체력 22,000·최종 구성, 고리는 경계 전에는 잠김·경계 아래로 체력이 내려가지 않음, 고리를 끊으면 3초 정비,
// 단계별 기술(2 광선·소형 게, 3 회전) 한 번에 한 기술, 결전 사망 → 결전만 재시작(보스·고리 초기화)
const WAVE_JS = `const s = __inkwave.session, b = window.__G.boss, G = window.__G;`;
async function waveUp(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 40000 && !(await ev<boolean>(page, '!!(window.__G.boss && window.__G.boss.visible && window.__G.boss.anim === 0)'))) { await ev(page, '(__m.tp(-6, 3, -6), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
}
const hitTo = (frac: number) => `(async () => { ${WAVE_JS} let n = 0; while (b.hp > Math.max(1, ${frac} * b.maxHp) + 0.5 && n++ < 600) { if (b.invuln) { __m.tp(-6, 3, -6); await __m.frames(8); continue; } b.applyDamage(G.local, 400, false, null); } const t0 = G.time; while (G.time - t0 < 1.5) { __m.tp(-6, 3, -6); __m.skipStory(); await __m.frames(3); } return { hp: +(b.hp / b.maxHp).toFixed(3), phase: b.phase }; })()`;
function waveTo(frac: number): (page: Page) => Promise<void> { return async (page) => { await waveUp(page); const r = await ev<{ hp: number; phase: number }>(page, hitTo(frac));
  const big = await ev<{ alive: boolean; hp: number }>(page, `(() => { ${WAVE_JS} b.invuln = false; b.applyDamage(G.local, 99999, true, null); return { alive: !b.dead, hp: b.hp }; })()`);
  ok(`T067 7-3: 체력 ${frac * 100}% 경계에서 멈춤(고리를 끊기 전에는 한 번에 99,999 피해에도 그 아래로 내려가지 않음)`, Math.abs(r.hp - Math.max(frac, 1 / 22000)) < 0.01 && big.alive && big.hp >= Math.max(1, frac * 22000) - 0.5, { r, big }); }; }
async function waveRing1(page: Page): Promise<void> {
  await waveUp(page);
  const info = await ev<{ hp: number; brain: string; moves: string[] }>(page, `(async () => { ${WAVE_JS} const moves = new Set(); const t0 = G.time; while (G.time - t0 < 12) { __m.tp(-6, 3, -6); __m.skipStory(); if (b.move) moves.add(b.move.id); await __m.frames(3); } return { hp: b.maxHp, brain: b.brain.constructor.name, moves: [...moves] }; })()`);
  ok('T067 7-3: 파도껍질 22,000·1단계 강타·통·돌진만', info.hp === 22000 && info.moves.every((x) => ['slam', 'barrage', 'charge'].includes(x)), info);
  await operate(page, -19.8, 1.8, 2.6);
  const early = await st(page);
  const r1 = await ev<{ hp: number; phase: number }>(page, hitTo(0.66));
  ok('T067 7-3: 고리 1은 66% 전에는 잠김, 66% 경계에서 체력이 멈춤', !early.done.includes('o-r1') && Math.abs(r1.hp - 0.66) < 0.01, { early, r1 });
  await operate(page, -19.8, 1.8, 2.6);
  const cut = await ev<{ done: string[]; cool: number }>(page, `(() => { ${WAVE_JS} return { done: s.objectives.snapshot(), cool: b.brain.cool }; })()`);
  const p2 = await ev<{ moves: string[]; phase: number; overlap: number }>(page, `(async () => { ${WAVE_JS} const moves = new Set(); const t0 = G.time; while (G.time - t0 < 20) { __m.tp(-6, 3, -6); __m.skipStory(); if (b.move) moves.add(b.move.id); await __m.frames(3); } return { moves: [...moves], phase: b.phase }; })()`);
  ok('T067 7-3: 고리 1 끊기 → 3초 정비, 2단계 기술은 강타·통·돌진·광선·소형 게(회전 없음)', cut.done.includes('o-r1') && cut.cool >= 2 && p2.phase === 2 && p2.moves.every((x) => ['slam', 'barrage', 'charge', 'sweep', 'crablets'].includes(x)), { cut, p2 });
  // 결전 사망 → 결전만 재시작: 보스·고리 처음 상태
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  await waveUp(page);
  const re = await ev<{ cp: string; done: string[]; hp: number; ring: boolean }>(page, `(() => { ${WAVE_JS} return { cp: s.cp.checkpointId, done: s.objectives.snapshot(), hp: b.hp / b.maxHp, ring: s.devices.get('ring1').complete }; })()`);
  ok('T067 7-3: 결전 사망 → 최종 CP, 파도껍질 체력·고리 처음 상태', re.cp === 'cp-final' && !re.done.includes('o-r1') && re.hp === 1 && !re.ring, re);
  await ev(page, hitTo(0.66));
}
// 3단계(고리 2를 끊은 뒤, 체력 33% 아래): 회전(frenzy)이 실제로 나오고 한 번에 한 기술만 쓴다
async function waveRing3(page: Page): Promise<void> {
  await waveUp(page);
  const p3 = await ev<{ phase: number; moves: string[]; frenzyAt: number | null; overlap: number }>(page, `(async () => { ${WAVE_JS} const moves = new Set(); let frenzyAt = null, overlap = 0, last = null; const t0 = G.time;
    while (G.time - t0 < 35 && frenzyAt === null) { __m.tp(-6, 3, -6); __m.skipStory(); const mv = b.move && b.move.id; if (mv) { moves.add(mv); if (mv === 'frenzy') frenzyAt = +(G.time - t0).toFixed(1); } if (b.moves && b.moves.length > 1) overlap++; await __m.frames(3); }
    return { phase: b.phase, moves: [...moves], frenzyAt, overlap }; })()`);
  ok('T067 7-3: 3단계에서 회전이 실제로 나온다(한 번에 한 기술)', p3.phase >= 3 && p3.frenzyAt !== null && p3.overlap === 0, p3);
  await waveTo(0)(page);
}
// 2-3 배전탑 오르골: 닫힌 핵 피해 0·첫 단계 광선만·공격 겹침 없음 / 송신기 뒤 8초 노출·노출 중에도 마지막 송신기 전 처치 불가 /
// 본전투 사망 → 보스 앞 CP에서 송신기·핵 체력 함께 복원 / 셋 다 끄면 계속 노출(무적 반복 없음)
const ORGEL_JS = `const s = __inkwave.session, e = s.encounters.unitActor('orgel'), b = e && e.bot, tl = s.preview.telegraphs, G = window.__G;`;
async function orgelSpawn(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('orgel')`))) { await ev(page, '(__m.tp(0, 3, -5), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
}
async function orgelClosed(page: Page): Promise<void> {
  await orgelSpawn(page);
  const r = await ev<{ hit: number; hp: number; kinds: string[]; overlap: number; exposed: boolean }>(page, `(async () => { ${ORGEL_JS}
    const hp0 = e.hp; e.damage(80, G.local, 'weapon'); const hit = hp0 - e.hp;
    const seen = new Set(), kinds = []; let overlap = 0; const t0 = G.time;
    while (G.time - t0 < 7) { __m.tp(-1, 3, -5); __m.skipStory(); const mine = tl.live.filter((l) => l.spec.attacker === e); overlap = Math.max(overlap, mine.length); for (const l of mine) if (!seen.has(l.spec)) { seen.add(l.spec); kinds.push(l.spec.shape); } await __m.frames(2); }
    return { hit, hp: e.hp, kinds, overlap, exposed: b.exposed }; })()`);
  await page.screenshot({ path: 'shots/mission/2-3-orgel.png' });
  ok('T052 2-3 오르골: 닫힌 핵 피해 0, 첫 단계는 직선 광선만, 동시에 두 공격 없음', r.hit === 0 && !r.exposed && r.kinds.length >= 1 && r.kinds.every((k) => k === 'line') && r.overlap <= 1, r);
}
async function orgelOpenRetry(page: Page, m: MissionJson): Promise<void> {
  const r = await ev<{ exposed: boolean; phase: number; hp: number; closedAfter: boolean; t: number; left: number }>(page, `(async () => { ${ORGEL_JS}
    const exposed = b.exposed, phase = b.phase, left = +(b.openUntil - G.time).toFixed(2); let n = 0; while (n++ < 200) e.damage(80, G.local, 'weapon');
    const hp = e.hp; const t0 = G.time; while (G.time - t0 < 8.6 && b.exposed) { __m.tp(-1, 3, -5); __m.skipStory(); await __m.frames(3); }
    return { exposed, phase, hp, closedAfter: !b.exposed, t: +(G.time - t0).toFixed(1), left }; })()`);
  // left: 확인 시점에 남은 노출(송신기 완료 직후부터 8초 — 검사의 앞 단계가 쓴 시간만큼 줄어 있다)
  ok('T052 2-3 오르골: 송신기 1 정지 → 핵 노출(8초 뒤 닫힘), 마지막 송신기 전에는 처치되지 않음', r.exposed && r.phase === 1 && r.hp >= 1 && r.closedAfter && r.left <= 8 && r.left > 4 && Math.abs(r.t - r.left) < 0.6, r);
  // 본전투 사망 → 보스 앞 CP: 송신기·핵 체력 함께 복원
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  await orgelSpawn(page);
  const re = await ev<{ cp: string; done: string[]; hp: number; max: number; phase: number; dev: boolean }>(page, `(() => { ${ORGEL_JS} return { cp: s.cp.checkpointId, done: s.objectives.snapshot(), hp: e.hp, max: e.tune.hp, phase: b.phase, dev: s.devices.get('txL').complete }; })()`);
  ok('T052 2-3: 본전투 사망 → 보스 앞 CP에서 송신기·핵 체력 함께 복원', re.cp === 'cp-boss' && !re.done.includes('o-t1') && re.hp === re.max && re.phase === 0 && !re.dev, re);
  // 송신기 1을 다시 끈다
  const d = m.devices.find((x) => x.id === 'txL')!;
  await operate(page, d.at[0], d.at[2], 2.8);
  const again = await st(page);
  ok('T052 2-3: 재도전에서 송신기 1 다시 정지', again.done.includes('o-t1'), again);
}
async function orgelAllOff(page: Page): Promise<void> {
  const r = await ev<{ phase: number; always: boolean; kinds: string[]; overlap: number }>(page, `(async () => { ${ORGEL_JS}
    let always = true, overlap = 0; const seen = new Set(), kinds = []; const t0 = G.time;
    while (G.time - t0 < 12) { __m.tp(-1, 3, -5); __m.skipStory(); if (!b.exposed) always = false; const mine = tl.live.filter((l) => l.spec.attacker === e); overlap = Math.max(overlap, mine.length); for (const l of mine) if (!seen.has(l.spec)) { seen.add(l.spec); kinds.push(l.spec.shape); } await __m.frames(3); }
    return { phase: b.phase, always, kinds, overlap }; })()`);
  ok('T052 2-3 오르골: 세 송신기 정지 뒤 핵이 계속 노출(무적 반복 없음), 광선·원형 교대·겹침 없음', r.phase === 3 && r.always && r.kinds.includes('line') && r.kinds.includes('circle') && r.overlap <= 1, r);
}
// 2-2 유리눈 감시자: 엄폐 뒤 조준 없음, 두 발(두 번째는 새 방향)·2.5초 정비 중 예고 없음, 절반 체력 위치 변경 1회, 정예 앞 CP 재시작
async function glassEye(page: Page): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('glass')`))) { await ev(page, '(__m.tp(12.75, 3, -12), __m.skipStory(), 0)'); await ev(page, '__m.frames(4)'); }
  // 테라스 몸체 아래(사선 막힘)에서 4초: 감시자의 예고가 없어야 한다
  const hidden = await ev<{ n: number; sees: boolean }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('glass'), tl = s.preview.telegraphs, G = window.__G; const t0 = G.time; const seen = new Set();
    while (G.time - t0 < 4) { __m.tp(12.75, 0, -12); __m.skipStory(); for (const l of tl.live) if (l.spec.attacker === e) seen.add(l.spec); await __m.frames(2); }
    return { n: seen.size, sees: e.bot.sees }; })()`);
  ok('T051 2-2 감시자: 지붕 몸체 뒤(사선 막힘)에서는 조준하지 않음(엄폐 관통 없음)', hidden.n === 0 && !hidden.sees, hidden);
  // 같은 높이(테라스 위)에서 노출: 두 발과 정비를 잰다. 첫 예고가 끝나면 옆으로 옮겨 두 번째 방향이 달라지는지 본다
  const cyc = await ev<{ specs: Array<{ t: number; yaw: number; dur: number; dmg: number }>; states: Array<[string, number]> }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('glass'), b = e.bot, tl = s.preview.telegraphs, G = window.__G;
    const specs = [], seen = new Set(), states = []; let last = b.state; const t0 = G.time; let px = 11.2, pz = -19;
    while (G.time - t0 < 16 && specs.length < 3) { __m.tp(px, 3, pz); __m.skipStory();
      for (const l of tl.live) if (l.spec.attacker === e && !seen.has(l.spec)) { seen.add(l.spec); specs.push({ t: +(G.time - t0).toFixed(2), yaw: +l.spec.yaw.toFixed(3), dur: l.spec.duration, dmg: l.spec.damage }); if (specs.length === 1) { px = 14.3; pz = -20.5; } }
      if (b.state !== last) { last = b.state; states.push([last, +(G.time - t0).toFixed(2)]); }
      await __m.frames(1); }
    return { specs, states }; })()`);
  const sp = cyc.specs, gap12 = sp.length >= 2 ? sp[1].t - sp[0].t : 0, gap23 = sp.length >= 3 ? sp[2].t - sp[1].t : 99;
  const rec = cyc.states.find((x) => x[0] === 'recover');
  ok('T051 2-2 감시자: 1초 직선 예고 두 발(두 번째는 새 방향, 예고 중 추적 없음) 뒤 2.5초 정비 중 예고 없음', sp.length >= 2 && sp[0].dur >= 0.9 && sp[0].dmg > 0 && Math.abs(sp[1].yaw - sp[0].yaw) > 0.05 && gap12 < 2.2 && gap23 >= sp[1].dur + 2.4 && !!rec, { cyc, gap12, gap23 });
  // 절반 이하 → 정비 뒤 북쪽 끝으로 한 번 이동, 더 맞아도 다시 옮기지 않는다
  await ev(page, `(() => { const a = __inkwave.session.encounters.unitActor('glass'); let n = 0; while (a.hp / a.tune.hp > 0.45 && n++ < 400) a.damage(20, __m.G.local, 'weapon'); })()`);
  const mv = await ev<{ moved: boolean; at: number[]; again: boolean }>(page, `(async () => { const s = __inkwave.session, e = s.encounters.unitActor('glass'), b = e.bot, G = window.__G; let t0 = G.time;
    const states = []; let last = '';
    while (G.time - t0 < 14 && !(b.moved && !b.relocating)) { __m.tp(11.2, 3, -21); __m.skipStory(); const k = b.state + (b.relocating ? '*' : '') + (s.preview.combat.isStaggered(e) ? '!' : ''); if (k !== last) { last = k; states.push(k + '@' + (G.time - t0).toFixed(1)); } await __m.frames(2); }
    const at = [e.pos.x, e.pos.y, e.pos.z].map((v) => +v.toFixed(1)), moved = !!b.moved;
    let n = 0; while (e.hp / e.tune.hp > 0.25 && n++ < 400) e.damage(20, __m.G.local, 'weapon');
    let again = false; t0 = G.time; while (G.time - t0 < 8) { __m.tp(11.2, 3, -21); __m.skipStory(); if (b.relocating) again = true; await __m.frames(2); }
    return { moved, at, again, states }; })()`);
  ok('T051 2-2 감시자: 절반 체력에서 사격 위치 한 번 변경(반복 발동 없음)', mv.moved && Math.hypot(mv.at[0] - 12.75, mv.at[2] + 16.8) < 2 && !mv.again, mv);
  // 지붕에서 떨어져(사망) 재도전 → 정예 앞 CP2, 감시자 처음 상태
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2200);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
  const re = await ev<{ cp: string; enc: string; pos: number[] }>(page, '(() => { const s = __inkwave.session, p = __m.G.local.pos; return { cp: s.cp.checkpointId, enc: s.encounters.state("enc-glass"), pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)) }; })()');
  ok('T051 2-2: 정예전 사망 → 정예 앞 CP2에서 재시작(지붕 길을 처음부터 오르지 않음), 감시자 처음 상태', re.cp === 'cp2' && re.enc === 'idle' && Math.hypot(re.pos[0] - 12.75, re.pos[2] + 8) < 1.5, re);
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
    await waitCombat(page);
    await ev(page, `__inkwave.quitToMenu('workshop')`);
    await start(page, '1-1');
    const one = await ev<{ huds: number; locals: number; enemies: number; markers: number }>(page, `({ huds: document.querySelectorAll('.iw-camp').length, locals: __inkwave.match.actors.filter((a) => a.isLocal).length, enemies: __inkwave.match.actors.filter((a) => a.team === 1).length, markers: window.__G.scene.children.filter((c) => c.name === 'campaign-devices').length })`);
    ok('T022 시작 중 취소·재시작·작업장 반복 뒤 HUD 1·플레이어 1·장치 표식 1·적 0(시작 구역 밖)', one.huds === 1 && one.locals === 1 && one.markers === 1, one);
    // 체크포인트 뒤 도색 → 재시작: CPU 격자·GPU 아틀라스가 체크포인트 때와 같다, 연속 재시작에 탄환·예고·대기 출현이 남지 않는다
    await clearEncounter(page, -12, -27, 'enc-a'); await operate(page, -12, -31, 2.8);
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
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 }).catch(async (e) => {
      throw new Error(String(e).slice(0, 80) + ' ' + JSON.stringify(await ev(page, '({ ig: !!window.__inkwave, menu: window.__inkwave && __inkwave.menus && __inkwave.menus.current, url: location.href, vis: [...document.querySelectorAll("body *")].filter((x) => x.offsetParent && x.children.length === 0 && x.textContent.trim()).slice(0, 12).map((x) => x.className + ":" + x.textContent.trim().slice(0, 30)) })').catch((x) => String(x))));
    });
    await page.evaluate(HELPERS);
    // 저장 읽기(IndexedDB)는 비동기이다: 이어하기 판단 전에 불러오기가 끝나야 한다(사람은 메뉴를 보고 누른다)
    await page.waitForFunction('__inkwave.store.current', { timeout: 30000, polling: 100 }).catch(() => {});
    const loaded = await ev<{ cur: boolean; mission: string | null }>(page, '({ cur: !!__inkwave.store.current, mission: __inkwave.store.current && __inkwave.store.current.inProgress ? __inkwave.store.current.inProgress.missionId : null })');
    await ev(page, `(() => { void __inkwave.api.startStory(); })()`);
    await waitCombat(page);
    const resumed = await st(page);
    ok('T029 새로고침 후 이어하기: 진행 중 CP1·A 완료 복구', loaded.mission === '1-1' && resumed.cp === 'cp1' && resumed.done.includes('o-a'), { loaded, resumed });
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
  // 사람의 조작감·완주(33번 14절 U003~U006)를 대신하지 않는다.
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
      // 레벨 액션 장치(35번 R023)는 선택 경로다: 장치를 모두 치운 채로 걷는다(장치 없이 완주 가능)
      const hadDevices = await ev<number>(page, `(() => { const s = __inkwave.session, A = s.action; if (!A) return 0; const n = A.fountains.length + A.barrels.length + A.switches.length; if (s.preview.devices === A) s.preview.devices = null; A.dispose(); s.action = null; return n; })()`);
      if (id !== '1-3') ok(`R023 ${id} 주행: 액션 장치(${hadDevices}개)를 치운 상태로 시작`, hadDevices > 0, hadDevices);
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
  // ------------------------------------------------------------------------------------------------ 액션 실측(35번 R017~R020)
  // 1-3 광장(출현 묶음 정지)에 병종을 하나씩 세워 실제 상태기·예고·탄환으로 공격하게 한다. 잠수 입력은 가짜 표준 패드 LT의
  // 실제 입력 경로이다(사격병의 즉발 탄환만 도착 시각을 미리 알 수 없어 잠수 시각을 피해 직전에 기록한다). 1-2는 전 구간을
  // 피해 없이(무적) 자동 조준 사격으로 교전해 물결 단계를 잰다. 1-1은 자기 잉크 위 LT 두 번으로 서지 거리를 잰다.
  if (only.includes('act')) {
    const { page, errors } = await openFresh();
    await page.evaluate(`window.__pads = [{ b: {} }]; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map((q, i) => q && ({ index: i, id: 'Xbox 360 Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: q.ax || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: !!(q.b && q.b[k]), value: q.b && q.b[k] ? 1 : 0 })) })) })`);
    await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
    await unlockTo(page, ['1-2', '1-3']);
    await start(page, '1-3');
    await ev(page, `window.__pads[0] = { b: { 0: 1 } }`); await ev(page, '__m.frames(3)'); await ev(page, `window.__pads[0] = { b: {} }`); await ev(page, '__m.frames(3)');
    await ev(page, `(() => {
      const g = __inkwave, s = g.session, G = window.__G;
      // 진입 사격병 등 임무 적을 거두고 출현을 멈춘다. 시험 자리는 자기 잉크로 칠해 둔다(적 잉크 위는 퍼펙트 대상이 아니다)
      for (const id of [...s.encounters.runs.keys()]) s.encounters.stop(id);
      s.encounters.update = () => {};
      __m.paintAt(0, -28, 3); __m.paintAt(0, -26, 3);
      // 시험 병종: 출현 묶음 밖에서 세션의 실제 생성 경로(_spawn)로 만든다
      window.__act = {
        spawn(role, x, z, yaw) { const u = { id: 'T-' + role + '-' + Math.random().toString(36).slice(2, 6), role, at: [x, 3, z], yaw }; return s._spawn(u, { id: 'enc-test', segment: 'none', area: [0, 0, 0, 0], maxActive: 3, waves: [] }); },
        drop(a) { s._despawn(a); },
        face(t) { const L = G.local, dx = t.pos.x - L.pos.x, dz = t.pos.z - L.pos.z, dy = t.pos.y + 0.7 - (L.pos.y + 1.1); g.rig.yaw = Math.atan2(dx, dz); g.rig.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
      };
    })()`);

    // R017: 네 공격 × (창 안 → 피해 0·발동 1, 창 밖 → 정상 피해)
    const dive = async (role: string, inWindow: boolean) => ev<Record<string, unknown>>(page, `(async () => {
      const g = __inkwave, G = window.__G, L = G.local, A = window.__act, tel = g.campaignPreview.telegraphs;
      const { on: sub } = await import('/src/core/ctx.js');
      __m.tp(0, 3, -28); __m.paintAt(0, -28, 3); L.invuln = 0; L.hp = L.tune.hp; L.ink = L.tune.inkMax;
      const E = A.spawn('${role}', 0, -20, Math.PI);
      let perfect = 0, dmg = 0, pressAt = -1, endAt = -1, hitAt = -1;
      const offs = [];
      offs.push(sub('action:perfectDive', (e) => { if (e.attacker === E) perfect++; }));
      offs.push(sub('damage', (e) => { if (e.victim === L && e.attacker === E) { dmg += e.amount; if (hitAt < 0) hitAt = G.time; } }));
      // 사격병: 탄환이 닿는 순간 잠수 시각을 기록한다(창 안 0.05초 전 / 창 밖 0.5초 전)
      const orig = L.damage;
      if ('${role}' === 'gunner') L.damage = function (amt, att, src) { if (att === E && pressAt < 0) { pressAt = G.time; L._squidPressT = G.time - (${inWindow} ? 0.05 : 0.5); } return orig.call(this, amt, att, src); };
      const t0 = G.time; let held = 0;
      let fr = 0;
      while (G.time - t0 < 14 && hitAt < 0 && perfect === 0) {
        L.hp = L.tune.hp; A.face(E);
        if (++fr % 8 === 0 && '${role}' === 'gunner') __m.paintAt(0, -28, 2);   // 빗나간 탄의 적 잉크가 시험 자리를 덮지 않게
        const l = tel.live.find((x) => x.spec.attacker === E);
        if (l && '${role}' !== 'gunner') {
          endAt = l.endAt;
          const at = ${inWindow} ? l.endAt - 0.09 : l.endAt - 0.6;
          if (pressAt < 0 && G.time >= at) { pressAt = G.time; held = 3; }
        }
        window.__pads[0] = { b: held > 0 ? { 6: 1 } : {} };
        if (held > 0) held--;
        await new Promise((r) => requestAnimationFrame(r));
      }
      // 남은 연사 탄환·예고 피해까지 받는다(같은 공격이 끝날 때까지 쓰러지지 않게 체력만 채운다)
      const t1 = G.time; while (G.time - t1 < 1.2) { L.hp = L.tune.hp; await new Promise((r) => requestAnimationFrame(r)); }
      window.__pads[0] = { b: {} };
      L.damage = orig; for (const o of offs) o(); A.drop(E); L.hp = L.tune.hp;
      return { role: '${role}', inWindow: ${inWindow}, perfect, dmg: +dmg.toFixed(1), st: g.session.state, ground: L.groundTeam, lead: endAt > 0 ? +(endAt - L._squidPressT).toFixed(3) : null, waited: +(G.time - t0).toFixed(1) };
    })()`);
    const R17: Record<string, unknown>[] = [];
    for (const role of ['gunner', 'shield', 'watcher', 'mortar']) for (const w of [true, false]) { R17.push(await dive(role, w)); await ev(page, '__m.frames(30)'); }
    const r17in = R17.filter((r) => r.inWindow), r17out = R17.filter((r) => !r.inWindow);
    ok('R017 네 공격(사격병 연사·방패병 발사·감시병 저격·포격병 낙하): 창 안 잠수 → 피해 0·발동', r17in.every((r) => r.perfect === 1 && r.dmg === 0), r17in);
    ok('R017 네 공격: 창 밖 잠수 → 정상 피해·발동 없음', r17out.every((r) => r.perfect === 0 && (r.dmg as number) > 0), r17out);

    // R020: 방패병 정면 사격만으로는 스태거가 나지 않는다(우산을 든 상태), 같은 사격을 뒤에서 하면 난다
    const shieldFire = async (side: number) => ev<Record<string, unknown>>(page, `(async () => {
      const G = window.__G, L = G.local, A = window.__act;
      const { on: sub } = await import('/src/core/ctx.js');
      const E = A.spawn('shield', 0, -20, Math.PI);
      E.bot.update = () => { E.intent.move.set(0, 0, 0); E.intent.fire = false; };   // 우산을 든 경계 상태로 고정(자세·방향 유지)
      E.tune = { ...E.tune, hp: 1e6 }; E.hp = 1e6;
      let stag = 0, hits = 0; const offs = [sub('enemy:stagger', (e) => { if (e.actor === E) stag++; }), sub('damage', (e) => { if (e.victim === E && e.attacker === L) hits++; })];
      const ang = E.yaw + ${side} * Math.PI / 2;
      const px = E.pos.x + Math.sin(ang) * 6, pz = E.pos.z + Math.cos(ang) * 6;
      const t0 = G.time;
      let fr = 0;
      while (G.time - t0 < 5) { __m.tp(px, 3, pz); L.ink = L.tune.inkMax; A.face(E); window.__pads[0] = { b: ++fr % 20 ? { 7: 1 } : {} }; await new Promise((r) => requestAnimationFrame(r)); }
      window.__pads[0] = { b: {} };
      for (const o of offs) o(); A.drop(E);
      return { side: ${side}, hits, stag, st: __inkwave.session.state, alive: L.alive };
    })()`);
    const front = await shieldFire(0), back = await shieldFire(2);
    ok('R020 방패병: 정면 사격 5초에 스태거 없음(명중은 있음), 뒤에서 같은 사격은 스태거', (front.hits as number) >= 10 && front.stag === 0 && (back.stag as number) >= 1, { front, back });

    // R020: 대장의 스태거 노출 플래그를 약점 판정이 읽는다(정면이어도 노출 중에는 약점 배율)
    const capt = await ev<Record<string, number | boolean>>(page, `(() => {
      const g = __inkwave, s = g.session, G = window.__G, L = G.local, A = window.__act;
      const E = A.spawn('umbrellaCaptain', 0, -20, Math.PI);
      E.bot.update = () => { E.intent.move.set(0, 0, 0); E.intent.fire = false; };
      __m.tp(0, 3, -26);
      const c = g.campaignPreview.combat, n = c.entry(E);
      const before = s._enemyTaken(E, 20, L);
      n.poise.hit(1e6);
      const exposed = c.isExposed(E), during = s._enemyTaken(E, 20, L);
      A.drop(E);
      return { before: +before.toFixed(2), during: +during.toFixed(2), exposed };
    })()`);
    ok('R020 대장: 스태거 노출 중 정면 피해에 약점 배율(노출 플래그 사용)', capt.exposed === true && (capt.during as number) >= (capt.before as number) * 1.45, capt);
    ok('액션(1-3) 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await ev(page, `__inkwave.quitToMenu('workshop')`);

    // R019: 1-2 전 구간을 피해 없이 교전 — 물결 점수 경제를 잰다. 조준 대신 슈터 연사 속도(0.1초마다 36 피해)로 실제
    // damage() 경로를 부르고(명중·처치·스태거·정예 획득은 실제 리스너), 목표는 실제로 칠하고 머문다. 빗나감이 없는 상한이며
    // 구간 사이 이동 시간은 walk 주행 실측만큼 둔다.
    await start(page, '1-2');
    const wave = await ev<Record<string, unknown>>(page, `(async () => {
      const g = __inkwave, s = g.session, G = window.__G, L = G.local, c = g.campaignPreview.combat;
      const step = () => new Promise((r) => requestAnimationFrame(r));
      let combat = 0, maxL = 0, firstL3 = -1; const log = [];
      const note = () => { const lv = c.wave.level; if (lv > maxL) { maxL = lv; log.push([lv, +combat.toFixed(1), Math.round(c.wave.points)]); } if (lv === 3 && firstL3 < 0) firstL3 = combat; };
      const fight = async (gx, gz, enc, secs) => {
        const t0 = G.time; let next = G.time;
        while (G.time - t0 < secs && s.encounters.state(enc) !== 'cleared') {
          window.__m.skipStory(); __m.tp(gx, 3, gz);
          const e = s.encounters.liveActors().find((a) => a.alive);
          if (e) { while (G.time >= next && e.alive) { e.damage(36, L, 'weapon'); next += 0.1; } }
          else next = G.time;
          const t1 = G.time; await step(); if (e) combat += G.time - t1;
          note();
        }
      };
      const hold = async (x, z, secs) => { const t0 = G.time; while (G.time - t0 < secs) { __m.tp(x, 3, z); __m.paintAt(x, z, 2); await step(); note(); } };
      // 구간 사이 이동: walk 주행의 실측(기록 1 → 상자·기록 2 약 7초, 기록 2 → CP2·정예 구역 약 6초) 동안 획득 없이 보낸다
      const idle = async (secs) => { const t0 = G.time; while (G.time - t0 < secs) { await step(); note(); } };
      await fight(-4.5, -15, 'enc-walk', 25); await hold(-4.5, -15, 2.6);    // 기록 1
      await idle(7);
      await fight(20.6, -27, 'enc-high', 25); await hold(20.6, -27, 2.6);    // 고지 기록 2
      await idle(6);
      await fight(12, 8, 'enc-elite', 40);                                   // 청소반장
      return { maxL, firstL3: firstL3 < 0 ? null : +firstL3.toFixed(1), combat: +combat.toFixed(1), log, done: s.objectives.snapshot(), points: Math.round(c.wave.points) };
    })()`);
    ok('R019 1-2: 피해 없이 25초 이내 교전으로 물결 3단계 달성', wave.firstL3 !== null && (wave.firstL3 as number) <= 25, wave);
    await ev(page, `__inkwave.quitToMenu('workshop')`);

    // R018: 1-1 광장에서 자기 잉크 위 LT 두 번(실제 입력) → 서지 거리. 걷기 주행(walk)은 서지 없이 모든 목표에 닿는다.
    await start(page, '1-1');
    const surge = await ev<Record<string, unknown>>(page, `(async () => {
      const g = __inkwave, G = window.__G, L = G.local, c = g.campaignPreview.combat;
      const { on: sub } = await import('/src/core/ctx.js');
      const step = () => new Promise((r) => requestAnimationFrame(r));
      __m.tp(-8, 3, -35); L.invuln = 999; L.ink = L.tune.inkMax; g.rig.yaw = 0; g.rig.pitch = 0;
      for (let i = 0; i < 6; i++) __m.paintAt(-8, -35 + i * 1.6, 2);
      for (let i = 0; i < 10; i++) await step();
      let from = null, n = 0; const off = sub('action:surge', (e) => { n++; if (!from) from = e.pos.clone(); });
      const press = async (k) => { for (let i = 0; i < k; i++) { window.__pads[0] = { ax: [0, -1, 0, 0], b: { 6: 1 } }; await step(); } };
      const free = async (k) => { for (let i = 0; i < k; i++) { window.__pads[0] = { ax: [0, -1, 0, 0], b: {} }; await step(); } };
      await press(2); await free(3); await press(1);
      let seen = false, k = 0; while (k++ < 120) { if (c.surge) seen = true; if (seen && !c.surge) break; await step(); }
      window.__pads[0] = { b: {} }; off();
      return { n, d: from ? +Math.hypot(L.pos.x - from.x, L.pos.z - from.z).toFixed(2) : -1 };
    })()`);
    ok('R018 1-1: 실제 LT 이중 입력 서지 1회·거리 약 5.5 m(최대 간격 계약)', surge.n === 1 && (surge.d as number) > 4.6 && (surge.d as number) < 6.2, surge);
    ok('액션(1-2·1-1) 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }
  // ------------------------------------------------------------------------------------------------ 35번 R005·R015·R023(색 회복·잔향 연출·액션 장치)
  if (only.includes('r35')) await r35();
  if (only.includes('cam')) await camCheck();
  if (only.includes('deny')) await denyCheck();
  if (only.includes('ch1story')) await ch1Story();
  if (only.includes('endgame')) await endgame();
  // ------------------------------------------------------------------------------------------------ 2장 이후 임무 공통 검수
  for (const id of only) if (PLANS[id]) await generic(id, PLANS[id]);
} catch (e) { ok('실행 오류', false, String((e as Error).stack || e)); }

// 33번 10절 공통 검수(2장 이후): 배치(바닥·이동 그래프·도달), 기본 이동 주행, 순서 건너뛰기, 갈림길 단독 발동, 목표 순서대로
// 경계 적 정리·가동, 목표형·도착형 CP와 저장, CP 사망 → 재도전(앞 목표 유지·현재 구간 복원), 완료 저장·다음 해금·무기 해금,
// 종료 뒤 자원 해제. 임무 고유 검사는 plan.extra이다. 순간 이동·직접 피해는 논리 검사이며 사람의 완주(14절)를 대신하지 않는다.
interface Plan {
  prev: string[];                                    // 저장에 넣을 해금(앞 임무 실제 완료는 각 임무 검사가 확인)
  walk: string[];                                    // 주행 순서(장치·CP id)
  route?: { take: string; other: string };           // 갈림길: take 묶음 영역에 들어가면 other는 발동하지 않는다
  before?: Record<string, (page: Page, m: MissionJson) => Promise<void>>;   // 그 목표를 처리하기 직전의 고유 검사
  skipCrate?: boolean;                               // 선택 상자를 열지 않고 완료(미회수가 출구를 막지 않는지)
  ownDeath?: boolean;                                // 공통 사망 검사 대신 임무 고유 검사(before)가 사망·재도전을 확인한다
  extra?: (page: Page, m: MissionJson) => Promise<void>;
}
type V3 = [number, number, number];
interface MissionJson {
  id: string; type: string; start: { at: V3 };
  devices: Array<{ id: string; kind: string; at: V3; radius: number; guards?: string[]; clearFirst?: string; duration?: number }>;
  objectives: Array<{ id: string; kind: string; label: string; device?: string; target?: string; encounter?: string; requires: string[]; optional?: boolean; checkpoint?: string; comm?: string }>;
  encounters: Array<{ id: string; area: [number, number, number, number]; waves: Array<{ units: Array<{ id: string; at: V3 }> }> }>;
  checkpoints: Array<{ id: string; at: V3; resets: string[]; area?: [number, number, number, number]; after?: string[] }>;
  reward: { unlocks: string[]; record?: string };
  boss?: { unit: string; giant?: { at: V3; area: [number, number, number, number] } };
}
// 같은 저장(IndexedDB)을 유지한 채 새로 연다(새로고침·이어하기)
async function openKeep(): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String((e as Error).stack || e).split(/\r?\n/).slice(0, 4).join(' | ')));
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main" && __inkwave.store && __inkwave.store.current', { timeout: 180000, polling: 250 });
  await page.evaluate(HELPERS);
  return { page, errors };
}

// 35번 R005 색 회복·R015 잔향 출현/소멸·R023 레벨 액션 장치를 실제 1-1·1-2 세션에서 확인한다
function r35State(): string { return `(() => { const s = __inkwave.session, c = s.color, A = s.action, fx = s.preview.cast.fx;
  return { sat: c ? +c.worldSat.toFixed(3) : null, spheres: c ? c.spheres.map((p) => ({ r: p.r, t: +p.t.toFixed(2) })) : null,
    rc: __inkwave.R._colorReturn ? +__inkwave.R._colorReturn.worldSat.toFixed(3) : null,
    dev: A ? A.snapshot() : null, scraps: fx.liveScraps, decals: fx.decals.filter((d) => d.live).length, cp: s.cp.checkpointId }; })()`; }
interface R35State { sat: number | null; spheres: Array<{ r: number; t: number }> | null; rc: number | null; dev: { barrels: Record<string, number>; switches: Record<string, boolean>; fountains: Record<string, boolean> } | null; scraps: number; decals: number; cp: string | null }
async function r35(): Promise<void> {
  const { page, errors } = await openFresh();
  await ev(page, `(async () => { const { on } = await import('/src/core/ctx.js'); window.__ev35 = []; for (const k of ['color:restore', 'device:fountain']) on(k, (e) => window.__ev35.push([k, e.r ?? e.id])); })()`);
  await start(page, '1-1');
  const s0 = await ev<R35State>(page, r35State());
  ok('R005 1-1 시작: 지역 채도 0.18(먹빛)·렌더러 색 회복 적용·구체 없음', s0.sat === 0.18 && s0.rc === 0.18 && s0.spheres!.length === 0, s0);
  ok('R023 1-1: 분수 1·잉크통 2 배치(1-2와 합쳐 분수 2·잉크통 4·스위치 1)', !!s0.dev && Object.keys(s0.dev.fountains).length === 1 && Object.keys(s0.dev.barrels).length === 2, s0.dev);
  // R015: 출현 1초 전 예고는 EchoFx.announce(바닥 다이아몬드 + 모여드는 종이 조각)
  await ev(page, `(() => { const fx = __inkwave.session.preview.cast.fx; fx.__n = 0; const o = fx.announce.bind(fx); fx.announce = (...a) => { fx.__n++; return o(...a); }; })()`);
  // 잉크통 b1을 CP 전에 터뜨린다(체크포인트에 파괴 상태가 남아야 한다)
  await ev(page, `(() => { const A = __inkwave.session.action, b = A.barrels.find((x) => x.def.id === 'b1'); A._hurt(b, 999); })()`);
  const t0 = Date.now(); let ann = { n: 0, decal: 0, live: 0 };
  while (Date.now() - t0 < 20000) {
    await ev(page, '(__m.tp(-12, 3, -27), __m.skipStory(), 0)'); await ev(page, '__m.frames(2)');
    ann = await ev<{ n: number; decal: number; live: number }>(page, '(() => { const s = __inkwave.session, fx = s.preview.cast.fx; return { n: fx.__n, decal: Math.max(fx.decals.filter((d) => d.live).length, 0), live: s.encounters.liveActors().length }; })()');
    if (ann.n > 0 && ann.decal > 0) break;
  }
  ok('R015 1-1: 적 출현 예고가 EchoFx.announce(바닥 다이아몬드·종이 조각)로 나온다', ann.n > 0 && ann.decal > 0, ann);
  await clearArea(page, -12, -27, 2.5);
  await operate(page, -12, -31, 2.8);
  await pass(page, 2800);   // 구체가 다 퍼질 때까지(2.5초)
  const sA = await ev<R35State>(page, r35State());
  const evA = await ev<Array<[string, number]>>(page, 'window.__ev35.slice()');
  const cpSave = await ev<{ color: { worldSat: number; spheres: unknown[] } | null; dev: { barrels: Record<string, number> } | null }>(page, '(() => { const p = __inkwave.store.current.inProgress; return { color: p && p.color || null, dev: p && p.actionDevices || null }; })()');
  ok('R005 1-1 중계기 A 복구: 반지름 14 m 구체가 2.5초 동안 퍼지고 color:restore 발행', sA.cp === 'cp1' && sA.spheres!.length === 1 && sA.spheres![0].r === 14 && sA.spheres![0].t === 1 && evA.some((e) => e[0] === 'color:restore' && e[1] === 14), { sA, evA });
  ok('R005·R023 CP1 저장: 진행 중 기록에 색 회복 구체·액션 장치 상태(b1 파괴)', !!cpSave.color && cpSave.color.spheres.length === 1 && cpSave.color.worldSat === 0.18 && !!cpSave.dev && cpSave.dev.barrels.b1 === 0 && cpSave.dev.barrels.b2 > 0, cpSave);
  // CP 뒤 b2 파괴, 진행 중인 출현 예고·소멸 조각을 남긴 채 사망 → 재시작
  await ev(page, `(() => { const A = __inkwave.session.action, b = A.barrels.find((x) => x.def.id === 'b2'); A._hurt(b, 999); })()`);
  await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(page, 2000);
  const before = await ev<{ scraps: number; decals: number }>(page, `(() => { const s = __inkwave.session, fx = s.preview.cast.fx, p = __m.G.local.pos; fx.announce(p.clone(), '#ffd23a'); fx.announce(p.clone().setX(p.x + 2), '#ffd23a'); fx.update(0.2); return { scraps: fx.liveScraps, decals: fx.decals.filter((d) => d.live).length }; })()`);
  await ev(page, '__inkwave.session.retryCheckpoint()'); await ev(page, '__m.frames(3)');
  const sR = await ev<R35State>(page, r35State());
  ok('R015 체크포인트 재시작: 남은 종이 조각·바닥 데칼 0', before.scraps > 0 && before.decals > 0 && sR.scraps === 0 && sR.decals === 0, { before, sR });
  ok('R005 체크포인트 재시작: 구간 시작의 색 회복 구체(다 퍼진 14 m)·지역 채도 복원', sR.sat === 0.18 && sR.spheres!.length === 1 && sR.spheres![0].r === 14 && sR.spheres![0].t === 1, sR);
  ok('R023 체크포인트 재시작: CP 때 상태로(b1 파괴 유지, CP 뒤 파괴한 b2 복원)', !!sR.dev && sR.dev.barrels.b1 === 0 && sR.dev.barrels.b2 === 60, sR.dev);
  // R015: 동시 5명 소멸의 연출 갱신 비용(세션의 실제 적 생성 경로로 사격병 5명을 세우고 한 프레임에 쓰러뜨린다)
  const diss = await ev<{ base: number; during: number; peak: number; scraps: number; frameBase: number; frameDuring: number }>(page, `(async () => {
    const s = __inkwave.session, G = window.__G, fx = s.preview.cast.fx, me = G.local, enc = s.mission.encounters[0];
    const xs = [], fr = []; let last = performance.now();
    const o = fx.update.bind(fx); fx.update = (dt) => { const t = performance.now(); o(dt); xs.push(performance.now() - t); };
    const tick = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); fr.push(t - last); last = t; } };
    const a5 = []; for (let i = 0; i < 5; i++) a5.push(s._spawn({ id: 'r15-' + i, role: 'gunner', at: [me.pos.x + 3 + i, me.pos.y + 1, me.pos.z + 3] }, enc));
    for (const a of a5) a.bot.update = () => { a.intent.move.set(0, 0, 0); a.intent.fire = false; };
    await tick(30); xs.length = 0; fr.length = 0; await tick(40);
    const base = xs.reduce((p, v) => p + v, 0) / xs.length, fb = fr.slice().sort((p, q) => p - q)[fr.length >> 1];
    xs.length = 0; fr.length = 0;
    for (const a of a5) a.damage(9999, me, 'weapon');
    let peak = 0; const t0 = G.time;
    while (G.time - t0 < 0.5) { await tick(1); peak = Math.max(peak, fx.liveScraps); }
    const during = xs.reduce((p, v) => p + v, 0) / xs.length, fd = fr.slice().sort((p, q) => p - q)[fr.length >> 1];
    fx.update = o; for (const a of a5) s._despawn(a);
    return { base: +base.toFixed(4), during: +during.toFixed(4), peak: +Math.max(...xs).toFixed(3), scraps: peak, frameBase: +fb.toFixed(2), frameDuring: +fd.toFixed(2) };
  })()`);
  ok('R015 동시 5명 소멸: 연출 갱신 증가 0.5 ms 이하(조각 생성 확인)', diss.scraps >= 50 && diss.during - diss.base <= 0.5, diss);
  // 새로고침·이어하기: 저장의 진행 중 기록에서 같은 색 회복·장치 상태가 돌아온다
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(800);
  await page.close();
  const k = await openKeep();
  await ev(k.page, `(async () => { const { on } = await import('/src/core/ctx.js'); window.__ev35 = []; for (const x of ['color:restore', 'device:fountain']) on(x, (e) => window.__ev35.push([x, e.r ?? e.id])); })()`);
  await start(k.page, '1-1', true);
  const sC = await ev<R35State>(k.page, r35State());
  ok('R005·R023 새로고침 뒤 이어하기: CP1의 색 회복 구체·지역 채도·잉크통 상태 복원', sC.cp === 'cp1' && sC.sat === 0.18 && sC.spheres!.length === 1 && sC.spheres![0].r === 14 && !!sC.dev && sC.dev.barrels.b1 === 0 && sC.dev.barrels.b2 === 60, sC);
  // 1-1 완료: 지역 전체로 색이 번지고(120 m) 저장의 지역 채도 0.45
  await operate(k.page, -6, 14, 1.5);
  for (let i = 0; i < 4; i++) await clearArea(k.page, -6, 14, 2.5);
  await operate(k.page, -6, 14, 2.8);
  await operate(k.page, 0, -4.4, 1.5);
  await pass(k.page, 1500);
  await k.page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
  const fin = await ev<{ ev: Array<[string, number]>; sat: number | undefined; done: string[] }>(k.page, '({ ev: window.__ev35.slice(), sat: __inkwave.store.current.colorReturn.tidewater, done: __inkwave.store.current.done })');
  ok('R005 1-1 완료: 지역 전체 구체(120 m) 발행·저장 지역 채도 0.45', fin.done.includes('1-1') && fin.ev.some((e) => e[0] === 'color:restore' && e[1] === 120) && fin.sat === 0.45, fin);
  // 1-2: 지역 채도 0.45로 시작, 스위치가 분수를 켜고 분수가 플레이어를 띄운다. 재시작하면 처음 상태
  await ev(k.page, `__inkwave.quitToMenu('workshop')`); await wait(800);
  await start(k.page, '1-2');
  const t1 = await ev<R35State>(k.page, r35State());
  ok('R005 1-2 시작: 저장된 지역 채도 0.45·구체 없음', t1.sat === 0.45 && t1.rc === 0.45 && t1.spheres!.length === 0, t1);
  ok('R023 1-2: 스위치 1·분수 1(꺼짐)·잉크통 2', !!t1.dev && Object.keys(t1.dev.switches).length === 1 && t1.dev.fountains.f2 === false && Object.keys(t1.dev.barrels).length === 2, t1.dev);
  const sw = await ev<{ at: number[] }>(k.page, `(() => { const s = __inkwave.session.action.switches[0]; return { at: [s.pos.x, s.pos.y, s.pos.z] }; })()`);
  await ev(k.page, `__m.paintAt(${sw.at[0]}, ${sw.at[2]}, 1.6)`); await pass(k.page, 800);
  const on1 = await ev<R35State>(k.page, r35State());
  const f2 = await ev<number[]>(k.page, `(() => { const f = __inkwave.session.action.fountains.find((x) => x.def.id === 'f2'); return [f.pos.x, f.pos.y, f.pos.z, f.def.land[1]]; })()`);
  const jump = await ev<{ fired: boolean; apex: number; base: number; land: number }>(k.page, `(async () => { const G = window.__G, a = G.local; a.pos.set(${f2[0]}, ${f2[1]} + 0.05, ${f2[2]}); a.vel.set(0, 0, 0); a.invuln = 999; let apex = a.pos.y; const t0 = G.time;
    while (G.time - t0 < 1.4) { __m.skipStory(); await __m.frames(1); apex = Math.max(apex, a.pos.y); }
    return { fired: window.__ev35.some((e) => e[0] === 'device:fountain' && e[1] === 'f2'), apex: +apex.toFixed(2), base: ${f2[1]}, land: ${f2[3]} }; })()`);
  ok('R023 1-2: 출발점 스위치를 60% 칠하면 꺼진 분수가 켜지고, 분수가 플레이어를 화단(착지 지점) 높이 위로 띄운다', !!on1.dev && on1.dev.switches.s1 && on1.dev.fountains.f2 && jump.fired && jump.apex > jump.land + 0.5, { dev: on1.dev, jump });
  await ev(k.page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
  await pass(k.page, 2000);
  await ev(k.page, '__inkwave.session.retryCheckpoint()'); await ev(k.page, '__m.frames(3)');
  const t2 = await ev<R35State>(k.page, r35State());
  ok('R023 1-2 CP 전 재시작: 스위치·분수가 임무 시작 상태로', t2.cp === null && !!t2.dev && !t2.dev.switches.s1 && !t2.dev.fountains.f2, t2.dev);
  // 대전·연습에는 색 회복이 없다(채도가 빠지지 않는다)
  await ev(k.page, `__inkwave.quitToMenu('main')`); await wait(800);
  await ev(k.page, `__inkwave.startPractice({ mapId: 'tidewater' })`); await wait(1500);
  const prac = await ev<{ rc: unknown; color: unknown }>(k.page, '({ rc: __inkwave.R._colorReturn, color: __inkwave.colorReturn })');
  ok('R005 캠페인 뒤 연습 경기: 색 회복 없음(전부 채색)', prac.rc === null && prac.color === null, prac);
  ok('R35 콘솔 오류 없음', errors.length === 0 && k.errors.length === 0, [...errors, ...k.errors].slice(0, 5));
  await k.page.close();
}

// 35번 R009 액션 카메라: 벽 가까이에서 서지(앞·옆)·처치 펀치, 보스·정예 등장 컷에서 렌즈가 벽 너머에 머물지 않는가.
// 매 프레임 "바라보는 점(따라가기는 피벗) → 렌즈" 선분을 지형 광선으로 재서 막힌 깊이를 기록한다.
// 따라가기 붐은 빠르게 다가오는 장애물을 몇 프레임 늦게 따라갈 수 있다(설계 한계 1.6 m, cameraRig 주석)
// — 그래서 기준은 "0.3 m 넘게 막힌 상태가 0.25초 넘게 이어지지 않음, 최대 1.6 m"와 프로필 없는 기존 붐 대비 악화 없음이다.
function clipJs(): string { return `window.__clip = (() => { const G = window.__G, rig = __inkwave.rig, V = G.local.pos.constructor, a = new V(), d = new V();
  return (look) => { const cam = rig.camera.position; a.copy(look || rig.pivot); d.copy(cam).sub(a); const len = d.length(); if (len < 1e-3) return 0; d.multiplyScalar(1 / len); const h = G.physics.raycast(a.clone(), d.clone(), len, undefined, true); return h.hit ? len - h.dist : 0; }; })()`; }
interface ClipStat { max: number; run: number; over: number; n: number }
async function camCheck(): Promise<void> {
  const { page, errors } = await openFresh();
  await start(page, '1-1');
  await ev(page, clipJs());
  const prof = await ev<{ dist: number; shoulder: number } | null>(page, '__inkwave.rig.profile && { dist: __inkwave.rig.profile.dist, shoulder: __inkwave.rig.profile.shoulder }');
  ok('R009 캠페인 임무에서 액션 카메라 프로필 적용(dist 4.2·어깨 0.35)', !!prof && prof.dist === 4.2 && prof.shoulder === 0.35, prof);
  // 벽 가까운 자리: 이동 그래프 노드 중 머리 높이 수평 광선이 0.8~2.5 m 안에서 벽에 닿는 곳(시드 고정 표본)
  const spots = await ev<Array<{ x: number; y: number; z: number; wx: number; wz: number }>>(page, `(() => { const G = window.__G, nav = G.nav, V = G.local.pos.constructor, out = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const s = __inkwave.session, segs = s.mission.segments;
    for (let k = 0; k < 4000 && out.length < 10; k++) { const n = nav.nodes[Math.floor(rnd() * nav.nodes.length)]; if (!n) continue;
      if (!segs.some((g) => n.x >= g.bounds[0] && n.x <= g.bounds[1] && n.z >= g.bounds[2] && n.z <= g.bounds[3])) continue;
      if (out.some((o) => Math.hypot(o.x - n.x, o.z - n.z) < 6)) continue;
      for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2, dir = new V(Math.sin(an), 0, Math.cos(an)); const h = G.physics.raycast(new V(n.x, n.y + 1.8, n.z), dir, 2.5, undefined, true);
        if (h.hit && h.dist > 0.8 && Math.abs(h.normal.y) < 0.3) { const up = G.physics.raycast(new V(n.x, n.y + 0.3, n.z), new V(0, 1, 0), 3.2, undefined, true); if (up.hit) break; out.push({ x: n.x, y: n.y, z: n.z, wx: dir.x, wz: dir.z }); break; } } }
    return out; })()`);
  ok('R009 검사 자리: 1-1 구간 안 벽 앞 10곳', spots.length >= 8, spots.length);
  // 한 자리에서: 카메라가 벽 쪽(플레이어 뒤)에 오게 서서 (1) 앞 서지 (2) 옆 서지 (3) 처치 펀치 세 번
  const run = (profile: boolean) => ev<{ surge: ClipStat; side: ClipStat; punch: ClipStat; surges: number; why: unknown[]; revived: number }>(page, `(async () => {
    const G = window.__G, g = __inkwave, rig = g.rig, a = G.local, s = g.session, P = s.preview, spots = ${JSON.stringify(spots)};
    rig.setProfile(${profile ? 'window.__savedProfile' : 'null'});
    for (const e of g.match.actors) if (e.team === 1 && e.bot) e.bot.update = () => { e.intent.move.set(0, 0, 0); e.intent.fire = false; };
    const acc = () => ({ max: 0, run: 0, over: 0, n: 0, cur: 0 });
    const R = { surge: acc(), side: acc(), punch: acc() }; let surges = 0; const why = [];
    const watch = async (st, secs) => { const t0 = G.time; let last = G.time; while (G.time - t0 < secs) { a.invuln = 999; __m.skipStory(); await new Promise((r) => requestAnimationFrame(r)); const dt = G.time - last; last = G.time; const p = window.__clip(); st.n++; st.max = Math.max(st.max, p); if (p > 0.3) { st.over++; st.cur += dt; st.run = Math.max(st.run, st.cur); } else st.cur = 0; } };
    let revived = 0;
    const alive = async () => { if (a.alive && s.state === 'combat') return; revived++; if (s.state === 'failed') s.retryCheckpoint(); for (let i = 0; i < 30 && !(a.alive && s.state === 'combat'); i++) await new Promise((r) => requestAnimationFrame(r)); };
    const place = async (sp) => { await alive(); a.invuln = 999; a.pos.set(sp.x, sp.y + 0.05, sp.z); a.vel.set(0, 0, 0); rig.yaw = Math.atan2(-sp.wx, -sp.wz); rig.pitch = -0.15; a.ink = 100;
      __m.paintAt(sp.x, sp.z, 2.5); rig.follow(a, true); for (let i = 0; i < 25; i++) { a.pos.set(sp.x, sp.y + 0.05, sp.z); a.vel.set(0, 0, 0); await new Promise((r) => requestAnimationFrame(r)); }
      for (let i = 0; i < 40 && !(a.grounded && a.groundTeam === 1); i++) await new Promise((r) => requestAnimationFrame(r)); };
    const surge = (side) => { P.combat.surgeCd = 0; a.ink = 100; if (side) a.intent.move.set(Math.cos(rig.yaw), 0, -Math.sin(rig.yaw)); const n0 = P.combat.surge; P.combat.tap.reset(); P.combat.squidPressed(a); P.combat.squidPressed(a); if (P.combat.surge && P.combat.surge !== n0) surges++; else if (why.length < 4) why.push({ g: a.grounded, gt: a.groundTeam, form: a.form, climb: a.climbing, ink: a.ink, cd: P.combat.surgeCd, alive: a.alive, pl: P.combat.player === a, s: !!P.combat.surge }); };
    for (const sp of spots) {
      await place(sp); surge(false); await watch(R.surge, 1.0);
      await place(sp); surge(true); await watch(R.side, 1.0);
      await place(sp); for (let i = 0; i < 3; i++) { rig.punch(i === 2 ? 'elite' : 'kill'); await watch(R.punch, 0.25); }
    }
    for (const k of Object.keys(R)) { R[k].max = +R[k].max.toFixed(2); R[k].run = +R[k].run.toFixed(3); delete R[k].cur; }
    return { ...R, surges, why, revived };
  })()`);
  await ev(page, 'window.__savedProfile = __inkwave.rig.profile');
  const withP = await run(true);
  const base = await run(false);
  await ev(page, '__inkwave.rig.setProfile(window.__savedProfile)');
  const good = (c: ClipStat, b: ClipStat) => c.run <= 0.25 && c.max <= 1.6 && c.over <= b.over + Math.max(3, b.over * 0.25);
  ok('R009 벽 앞 서지(앞·옆): 렌즈가 0.3 m 넘게 벽 너머에 0.25초 넘게 머물지 않고 기존 붐보다 나빠지지 않음', withP.surges >= spots.length * 2 - 2 && good(withP.surge, base.surge) && good(withP.side, base.side), { withP, base });
  ok('R009 벽 앞 처치 펀치(처치·정예): 같은 기준', good(withP.punch, base.punch) && withP.punch.max <= 0.6, { punch: withP.punch, base: base.punch });
  // reduceMotion이면 킥·펀치 0
  const calm = await ev<{ trauma: number; kick: number; fovKick: number }>(page, `(async () => { const G = window.__G, rig = __inkwave.rig; G.settings.reduceMotion = true; rig.trauma = 0; rig._traumaIn = 0; rig.kickS.reset(0); rig.punch('elite'); rig.kickSurge(0.3); await __m.frames(3); const r = { trauma: rig.trauma + rig._traumaIn, kick: Math.abs(rig.kickS.x), fovKick: rig.surgeKickT }; G.settings.reduceMotion = false; return r; })()`);
  ok('R009 움직임 줄이기: 펀치·서지 킥 0', calm.trauma === 0 && calm.kick === 0 && calm.fovKick === 0, calm);
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(600);
  if (process.env.CAM_QUICK) { await page.close(); return; }
  // 보스·정예 등장 컷: 임무마다 보스 앞 체크포인트와 그 둘레 세 자리를 기준점으로 컷을 실제 재생하며 잰다
  await ev(page, `__inkwave.store.commit((s) => ({ ...s, unlocked: ${JSON.stringify(['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '6-1', '6-2', '6-3', '7-1', '7-2', '7-3'])} }))`);
  const cuts: Record<string, unknown> = {}; let worst = 0, worstRun = 0, raw = 0;
  for (const id of ['1-2', '1-3', '2-2', '2-3', '3-2', '3-3', '4-2', '4-3', '5-2', '5-3', '6-2', '6-3', '7-2', '7-3']) {
    await start(page, id);
    await ev(page, clipJs());
    const r = await ev<{ pid: string | null; max: number; run: number; raw: number; n: number }>(page, `(async () => {
      const G = window.__G, g = __inkwave, s = g.session, a = G.local, rig = g.rig, m = s.mission;
      const panels = s.host.storyPanels(m.id), pid = panels.bossIntro ?? panels.midBoss; if (!pid) return { pid: null, max: 0, run: 0, raw: 0, n: 0 };
      for (const e of g.match.actors) if (e.team === 1 && e.bot) e.bot.update = () => { e.intent.move.set(0, 0, 0); e.intent.fire = false; };
      const cp = m.checkpoints[m.checkpoints.length - 1], c = s._ground(cp.at);
      const V = a.pos.constructor, anchors = [[c.x, c.z, cp.yaw]];
      for (let i = 0; i < 3; i++) { const an = cp.yaw + (i - 1) * 1.2, x = c.x + Math.sin(an) * 6, z = c.z + Math.cos(an) * 6; const n = G.nav.nearest(new V(x, c.y, z), 3); if (n >= 0) { const q = G.nav.nodes[n]; anchors.push([q.x, q.z, an]); } }
      let max = 0, run = 0, raw = 0, n = 0;
      // 가드 전 깊이(raw): 바라보는 점 → 컷이 요청한 렌즈 위치
      const pth = () => rig.path;
      for (const [x, z, yaw] of anchors) {
        const gy = s._ground([x, 3, z]).y; a.pos.set(x, gy + 0.05, z); a.vel.set(0, 0, 0); a.yaw = yaw; await __m.frames(2);
        g.story.playPanels(pid); let cur = 0, last = G.time;
        while (g.story.panels.playing) { await new Promise((r) => requestAnimationFrame(r)); const p = pth(); if (!p || rig.mode !== 'path') continue;
          const k = Math.min(1, p.t / p.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const look = new V().lerpVectors(p.lookFrom, p.lookTo, e), want = new V().lerpVectors(p.from, p.to, e); want.y += Math.sin(e * Math.PI) * p.arc;
          const d = want.clone().sub(look), L = d.length(); if (L > 1e-3) { const h = G.physics.raycast(look.clone(), d.multiplyScalar(1 / L), L, undefined, true); if (h.hit) raw = Math.max(raw, L - h.dist); }
          const pen = window.__clip(look), dt = G.time - last; last = G.time; n++; max = Math.max(max, pen); if (pen > 0.3) { cur += Math.max(dt, 1 / 60); run = Math.max(run, cur); } else cur = 0; }
      }
      return { pid, max: +max.toFixed(2), run: +run.toFixed(3), raw: +raw.toFixed(2), n };
    })()`);
    cuts[id] = r; worst = Math.max(worst, r.max); worstRun = Math.max(worstRun, r.run); raw = Math.max(raw, r.raw);
    await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(500);
  }
  ok('R009 보스·정예 등장 컷(14개 임무 × 기준점 4곳): 렌즈가 벽 너머에 머물지 않음(가드 후 막힘 0.3 m 이하)', worst <= 0.3, { worst, worstRun, rawBeforeGuard: raw, cuts });
  ok('R009 카메라 검사 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
  await page.close();
}

// 1-1을 A → B → 출구로 끝낸다(상자·사망 없이)
async function finish11(page: Page): Promise<void> {
  await clearArea(page, -12, -27, 2.5);
  await operate(page, -12, -31, 2.8);
  await operate(page, -6, 14, 1.5);
  for (let i = 0; i < 4; i++) await clearArea(page, -6, 14, 2.5);
  await operate(page, -6, 14, 2.8);
  await operate(page, 0, -4.4, 1.5);
  await pass(page, 1500);
}
// 35번 R030: 저장소가 쓰기를 거부하면(IndexedDB put이 QuotaExceededError로 실패해 트랜잭션이 중단) 결과 화면의 보상이
// 미확정으로 남고 저장은 바뀌지 않는다. 쓰기가 돌아온 뒤 "다시 저장"을 누르면 한 번만 확정된다. 반복 완료는 첫 완료 연출이 없다.
async function denyCheck(): Promise<void> {
  const { page, errors } = await openFresh();
  await ev(page, `(() => { const put = IDBObjectStore.prototype.put; window.__deny = false; IDBObjectStore.prototype.put = function (...a) { if (window.__deny) throw new DOMException('저장 공간 거부(검사)', 'QuotaExceededError'); return put.apply(this, a); }; })()`);
  await start(page, '1-1');
  await ev(page, 'window.__deny = true');
  await finish11(page);
  await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "fail"', { timeout: 90000, polling: 200 }).catch(() => {});
  const failed = await ev<{ saved: string | null; retry: boolean; first: boolean; focus: boolean; done: string[]; xp: number; rev: number }>(page, `(() => { const el = document.querySelector('.iw-sres'), r = el && el.querySelector('.iw-sres__retry'), s = __inkwave.store.current;
    return { saved: el && el.dataset.saved, retry: !!r && !r.classList.contains('is-off'), first: !!el && el.classList.contains('is-first'), focus: document.activeElement === r || (__inkwave.menus._focus === r), done: s.done, xp: s.xp, rev: s.revision }; })()`);
  await page.screenshot({ path: 'shots/mission/deny-unconfirmed.png' });
  ok('R030 저장 쓰기 거부: 보상 미확정·다시 저장 버튼(포커스)·저장 그대로(완료·경험치 없음)', failed.saved === 'fail' && failed.retry && failed.first && !failed.done.includes('1-1') && failed.xp === 0, failed);
  // 거부 중 다시 저장 → 여전히 미확정
  await ev(page, `document.querySelector('.iw-sres__retry').click()`); await wait(800);
  const still = await ev<{ saved: string | null; xp: number }>(page, `({ saved: document.querySelector('.iw-sres').dataset.saved, xp: __inkwave.store.current.xp })`);
  ok('R030 거부가 계속되면 다시 저장해도 미확정', still.saved === 'fail' && still.xp === 0, still);
  // 쓰기 복구 → 다시 저장 → 확정(한 번만)
  await ev(page, 'window.__deny = false');
  await ev(page, `document.querySelector('.iw-sres__retry').click()`);
  await page.waitForFunction('document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 30000, polling: 200 }).catch(() => {});
  const okd = await ev<{ saved: string | null; retry: boolean; done: string[]; xp: number; parts: number }>(page, `(() => { const el = document.querySelector('.iw-sres'), s = __inkwave.store.current; return { saved: el.dataset.saved, retry: !el.querySelector('.iw-sres__retry').classList.contains('is-off'), done: s.done, xp: s.xp, parts: s.inventory.parts }; })()`);
  await page.screenshot({ path: 'shots/mission/deny-confirmed.png' });
  ok('R030 쓰기 복구 뒤 다시 저장 → 확정(완료·경험치 600 한 번)·버튼 사라짐', okd.saved === 'ok' && !okd.retry && okd.done.includes('1-1') && okd.xp === 600, okd);
  await page.close();
  // 새로고침해도 확정이 남는다
  const k = await openKeep();
  const kept = await ev<{ done: string[]; xp: number }>(k.page, '({ done: __inkwave.store.current.done, xp: __inkwave.store.current.xp })');
  ok('R030 새로고침 뒤에도 확정 유지(중복 지급 없음)', kept.done.includes('1-1') && kept.xp === 600, kept);
  // 반복 완료: 첫 완료 연출(색 회복·첫 완료 표시) 없음, 첫 보상 재지급 없음
  await start(k.page, '1-1');
  await finish11(k.page);
  await k.page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 90000, polling: 200 }).catch(() => {});
  const rep = await ev<{ first: boolean; xp: number; recFirst: boolean; mods: number; clears: number }>(k.page, `(() => { const el = document.querySelector('.iw-sres'), s = __inkwave.store.current, r = s.processed[s.lastResult]; return { first: el.classList.contains('is-first'), xp: s.xp, recFirst: r.first, mods: r.modules.length, clears: s.clears['1-1'] }; })()`);
  ok('R030 반복 완료: 첫 완료 연출 없음·두 번째 완료로 저장(첫 세트 대신 무작위 모듈 1개)', !rep.first && rep.clears === 2 && !rep.recFirst && rep.mods === 1 && rep.xp > 600, rep);
  const real = [...errors, ...k.errors].filter((e) => !/QuotaExceeded|저장 공간 거부/.test(e));
  ok('R030 콘솔 오류 없음(검사가 일부러 낸 저장 거부 예외 제외)', real.length === 0, real.slice(0, 5));
  await k.page.close();
}

// 35번 R031: 1장 세 임무를 진행하며 대사·패널·통신·기록이 의도한 사건에 나오는지(순서) 본다. 대본은 건너뛰기(skip)로
// 넘기되 큐를 비우지 않는다(통신이 사라지지 않게). 기록 2개는 완료 보상으로 저장된다. 마지막에 모든 1장 대본을 다시 읽고 건너뛴다.
async function ch1Story(): Promise<void> {
  const { page, errors } = await openFresh();
  const NEXT = `(() => { const st = __inkwave.story; if (!st) return; if (st.panels.playing) { st.panels.skip(); return; } if (st.layer.runner.cur) st.layer.runner.skip(); })`;
  const hook = async (): Promise<void> => { await page.evaluate(HELPERS); await ev(page, `(window.__m.skipStory = ${NEXT}, 0)`); };
  await ev(page, `(async () => { const { on } = await import('/src/core/ctx.js'); window.__sq = [];
    on('story:line', (e) => { if (e.index === 0) window.__sq.push('L:' + e.scriptId); });
    on('story:panel', (e) => { const k = 'P:' + e.sceneId; if (window.__sq[window.__sq.length - 1] !== k) window.__sq.push(k); }); })()`);
  const seq = (): Promise<string[]> => ev<string[]>(page, 'window.__sq.slice()');
  const mark = async (): Promise<number> => (await seq()).length;
  const since = async (n: number): Promise<string[]> => (await seq()).slice(n);
  const begin = async (id: string): Promise<void> => {
    await page.evaluate(`__inkwave.startCampaign('${id}', { prologue: false })`);
    await page.waitForFunction('__inkwave.session && __inkwave.session.state === "combat" && __inkwave.match && __inkwave.match.state === "playing"', { timeout: 180000, polling: 200 });
    await hook(); await pass(page, 1500);
  };
  const die = async (): Promise<void> => { await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`); await pass(page, 2200); await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 800); };
  const results = async (): Promise<void> => { await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 120000, polling: 300 }).catch(() => {}); };
  const waitBoss = async (unit: string, x: number, z: number): Promise<void> => {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('${unit}')`))) { await ev(page, `(__m.tp(${x}, 3, ${z}), 0)`); await pass(page, 300); }
  };
  // ---- 1-1
  let n = await mark();
  await begin('1-1');
  const a0 = await since(n);
  ok('R031 1-1 시작: 시작 대본(통신 15초)', a0[0] === 'L:1-1.intro', a0);
  n = await mark();
  const t0 = Date.now(); let kill = false;
  while (Date.now() - t0 < 20000 && !kill) { await ev(page, '(__m.tp(-12, 3, -27), 0)'); await pass(page, 300); kill = await ev<boolean>(page, `(() => { const e = __inkwave.session.encounters.liveActors().find((x) => x.alive); if (!e) return false; e.damage(9999, __m.G.local, 'weapon'); return true; })()`); }
  await pass(page, 1200);
  const a1 = await since(n);
  ok('R031 1-1 첫 처치 → 퐁·틸 통신(잔향 설명)', a1.includes('L:1-1.firstKill') && !a1.includes('L:1-1.relayA'), a1);
  n = await mark();
  await clearArea(page, -12, -27, 2.5); await operate(page, -12, -31, 2.8); await pass(page, 1200);
  const a2 = await since(n);
  ok('R031 1-1 중계기 A 복구 → 통신(색이 돌아온다)', a2.includes('L:1-1.relayA'), a2);
  const openCrate = async (): Promise<void> => { const c = await ev<number[]>(page, '(() => { const d = __inkwave.session.mission.devices.find((x) => x.kind === "crate"); return [d.at[0] + 0.8, d.at[2]]; })()'); await clearArea(page, c[0], c[1], 3); await operate(page, c[0], c[1], 2.8); await pass(page, 600); };   // 원 안쪽 0.8 m(정확한 상자 자리는 지형에 걸려 밀려난다)
  await openCrate();   // 선택 상자: 이 장의 기록이 들어 있다(8.5절, 선택 수집)
  n = await mark();
  await die();
  const a3 = await since(n);
  ok('R031 1-1 첫 사망 → 사망 대본', a3[0] === 'L:1-1.death', a3);
  n = await mark();
  await operate(page, -6, 14, 1.5); for (let i = 0; i < 4; i++) await clearArea(page, -6, 14, 2.5); await operate(page, -6, 14, 2.8); await pass(page, 1200);
  const a4 = await since(n);
  ok('R031 1-1 중계기 B 복구 → 통신(명령이 하나 더)', a4.includes('L:1-1.relayB'), a4);
  n = await mark();
  await operate(page, 0, -4.4, 1.5); await pass(page, 1500); await results();
  const a5 = await since(n);
  const rec1 = await ev<string[]>(page, '__inkwave.store.current.records.slice()');
  ok('R031 1-1 완료 → 완료 대본, 기록 「광장의 첫 방송」 저장', a5.includes('L:1-1.outro') && rec1.includes('rec.tidewater.1'), { a5, rec1 });
  // ---- 1-2
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(800);
  n = await mark();
  await begin('1-2');
  const b0 = await since(n);
  ok('R031 1-2 시작 대본', b0[0] === 'L:1-2.intro', b0);
  n = await mark();
  await clearArea(page, -4.5, -15, 3); await operate(page, -4.5, -15, 2.8); await pass(page, 1200);
  const b1 = await since(n);
  ok('R031 1-2 기록 1 회수 → 퐁 대사', b1.includes('L:1-2.record1'), b1);
  await openCrate();
  const crate2 = await ev<{ opened: boolean; done: string[]; pos: number[] }>(page, '({ opened: __inkwave.session.crateOpened, done: __inkwave.session.objectives.snapshot(), pos: [__m.G.local.pos.x, __m.G.local.pos.y, __m.G.local.pos.z] })');
  n = await mark();
  await clearArea(page, 18, -20, 2); await clearArea(page, 20.6, -27, 3); await operate(page, 20.6, -27, 2.8); await pass(page, 1200);
  const b2 = await since(n);
  ok('R031 1-2 기록 2 회수 → 틸 대사', b2.includes('L:1-2.record2'), b2);
  n = await mark();
  await waitBoss('elite', 12, 6); await pass(page, 1500);
  const b3 = await since(n);
  ok('R031 1-2 청소반장 등장 → 패널 1컷', b3.includes('P:1-2.cleaner'), b3);
  n = await mark();
  await clearArea(page, 12, 10, 4); await pass(page, 1200);
  const b4 = await since(n);
  ok('R031 1-2 청소반장 처치 → 통신(다음이 진짜야)', b4.includes('L:1-2.cleanerDown'), b4);
  n = await mark();
  await operate(page, 9, 17, 2.8); await pass(page, 1500); await results();
  const b5 = await since(n);
  const rec2 = await ev<string[]>(page, '__inkwave.store.current.records.slice()');
  ok('R031 1-2 완료 → 완료 대본, 기록 「돌아온 사람들의 명단」 저장', b5.includes('L:1-2.outro') && rec2.includes('rec.tidewater.2'), { b5, rec2, crate2 });
  // ---- 1-3
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(800);
  n = await mark();
  await begin('1-3');
  const c0 = await since(n);
  ok('R031 1-3 입장 통신', c0[0] === 'L:1-3.entry', c0);
  n = await mark();
  await clearArea(page, 0, -26, 4); await waitBoss('bari', 0, -16); await pass(page, 1500);
  const c1 = await since(n);
  ok('R031 1-3 보스 등장 → 패널 3컷 + 보코더 한마디', c1.includes('P:1-3.bossIntro') && c1.includes('L:1-3.boss'), c1);
  n = await mark();
  await ev(page, `(() => { const a = __inkwave.session.encounters.unitActor('bari'); let k = 0; while (a.alive && a.hp / a.tune.hp > 0.45 && k++ < 400) a.damage(20, __m.G.local, 'weapon'); })()`); await pass(page, 1500);
  const c2 = await since(n);
  ok('R031 1-3 체력 50% 페이즈 → 통신', c2.includes('L:1-3.phase'), c2);
  n = await mark();
  await ev(page, `__inkwave.session.encounters.unitActor('bari').bot.setState('open')`); await pass(page, 1000);
  const c3 = await since(n);
  // 약점 통신은 대장이 처음 방패를 열 때 한 번(페이즈 구간에서 스스로 열었으면 그때 나온다)
  const opened = await ev<boolean>(page, `__inkwave.session.once.has('weak')`);
  ok('R031 1-3 방패 발사 뒤 약점 노출 → 퐁 "등이 열렸어"(한 번)', opened && [...c2, ...c3].filter((x) => x === 'L:1-3.weak').length === 1, { c2, c3 });
  n = await mark();
  await die();
  const c4 = await since(n);
  ok('R031 1-3 첫 사망 → 사망 대본', c4[0] === 'L:1-3.death', c4);
  n = await mark();
  await waitBoss('bari', 0, -16); await clearArea(page, 0, -16, 4); await operate(page, 0, -4.4, 2.8); await pass(page, 1500); await results();
  const c5 = await since(n);
  ok('R031 1-3 첫 완료 → 1장 에필로그 패널 4컷 → 완료 대본', c5.includes('P:ch1.epilogue') && c5.includes('L:1-3.outro') && c5.indexOf('P:ch1.epilogue') < c5.indexOf('L:1-3.outro'), c5);
  // ---- 모든 1장 대본: 다시 읽기(기록판) → 건너뛰기 → 읽은 기록
  const all = await ev<{ ids: string[]; bad: string[]; read: string[] }>(page, `(async () => { const { CH1 } = await import('/src/campaign/story/scripts/ch1.js'); const st = __inkwave.story, bad = [];
    for (const s of CH1.scripts) { st.layer.runner.clear(); if (!st.replay(s.id)) { bad.push(s.id + ' 재생'); continue; } await new Promise((r) => setTimeout(r, 50)); if (!st.layer.runner.cur || st.layer.runner.cur.script.id !== s.id) { bad.push(s.id + ' 시작'); continue; } st.layer.runner.skip(); if (st.layer.runner.cur && st.layer.runner.cur.script.id === s.id) bad.push(s.id + ' 건너뛰기'); }
    await __inkwave.store.busy; await new Promise((r) => setTimeout(r, 300)); await __inkwave.store.busy;
    return { ids: CH1.scripts.map((s) => s.id), bad, read: __inkwave.api.storyRead() }; })()`);
  ok('R031 1장 대본 전부(다시 읽기·건너뛰기·읽은 기록)', all.bad.length === 0 && all.ids.every((id) => all.read.includes(id)), { bad: all.bad, missing: all.ids.filter((id) => !all.read.includes(id)) });
  ok('R031 콘솔 오류 없음', errors.length === 0, errors.slice(0, 5));
  await page.close();
}

// 33번 T068·T067: 7-3 첫 완료 → 엔딩(패널 5컷·아카이브, 건너뛰기) → SG07·엔딩 해금 한 번만 저장 → 새로고침 뒤 유지 →
// 반복 완료에 엔딩·첫 보상 없음 → 엔딩 다시 보기(지도 색 회복) → 도전 출전(변형 적용·완료 보상) → 완료 임무 재진입 → 기록 14개·공략 기록.
// 7-3의 실제 결전 진행은 generic 7-3이 검사하고, 여기서는 세션 완료(_finish)부터의 이야기·저장 흐름을 본다.
async function endgame(): Promise<void> {
  const all = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1', '3-2', '3-3', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '6-1', '6-2', '6-3', '7-1', '7-2', '7-3'];
  const { page, errors } = await openFresh();
  await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
  await ev(page, `__inkwave.store.commit((s) => ({ ...s, unlocked: ${JSON.stringify(all)}, done: ${JSON.stringify(all.slice(0, 20))} }))`);
  await ev(page, `(async () => { const { on } = await import('/src/core/ctx.js'); window.__sq = [];
    on('story:line', (e) => { if (e.index === 0) window.__sq.push('L:' + e.scriptId); });
    on('story:panel', (e) => { const k = 'P:' + e.sceneId; if (window.__sq[window.__sq.length - 1] !== k) window.__sq.push(k); }); })()`);
  const NEXT = `(window.__m.skipStory = () => { const st = __inkwave.story; if (!st) return; if (st.panels.playing) { st.panels.skip(); return; } if (st.layer.runner.cur) st.layer.runner.skip(); }, 0)`;
  const finishNow = async (p: Page): Promise<void> => {
    await ev(p, '__inkwave.session._finish()');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000 && !(await ev<boolean>(p, '!!(document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok")'))) { await ev(p, '(window.__m && window.__m.skipStory(), 0)'); await wait(400); }
  };
  const sg = `(() => { const s = __inkwave.store.current; return [...s.inventory.cards, ...s.inventory.pending].filter((c) => c.defId === 'SG07').length; })()`;
  await start(page, '7-3'); await ev(page, NEXT); await ev(page, 'window.__sq = []');
  await finishNow(page);
  const sq1 = await ev<string[]>(page, 'window.__sq.slice()');
  const sv1 = await ev<{ done: boolean; seen: boolean; sg: number; sigs: string[] }>(page, `({ done: __inkwave.store.current.done.includes('7-3'), seen: __inkwave.store.current.endingSeen, sg: ${sg}, sigs: __inkwave.store.current.signatures })`);
  ok('T068 7-3 첫 완료 → 완료 대본 → 엔딩 패널(5컷, 건너뛰기) → 아카이브 "귀환 확인"', sq1.includes('L:7-3.outro') && sq1.includes('P:ending.return') && sq1.includes('L:ending.archive') && sq1.indexOf('P:ending.return') < sq1.indexOf('L:ending.archive'), sq1);
  ok('T067·T068 7-3 첫 완료 저장: SG07 1개·엔딩 해금(7-3 완료)·엔딩 본 표시', sv1.done && sv1.seen && sv1.sg === 1 && sv1.sigs.includes('SG07'), sv1);
  await page.close();
  // 새로고침: 엔딩·도전 해금 유지
  const k = await openKeep();
  const ex = await ev<{ ending: boolean; challenges: Array<{ id: string; locked: boolean }>; weapons: unknown[] } | null>(k.page, '__inkwave.api.campaignExtras()');
  ok('T068 새로고침 뒤 엔딩·도전 해금 유지(무기 12종 공략 기록 목록)', !!ex && ex.ending && ex.challenges.length === 7 && ex.challenges.every((c) => !c.locked) && ex.weapons.length === 12, ex && { ending: ex.ending, n: ex.challenges.length, w: ex.weapons.length });
  // 반복 완료: 엔딩·첫 보상 다시 없음
  await ev(k.page, `(async () => { const { on } = await import('/src/core/ctx.js'); window.__sq = []; on('story:line', (e) => { if (e.index === 0) window.__sq.push('L:' + e.scriptId); }); on('story:panel', (e) => { const q = 'P:' + e.sceneId; if (window.__sq[window.__sq.length - 1] !== q) window.__sq.push(q); }); })()`);
  await start(k.page, '7-3'); await ev(k.page, NEXT); await ev(k.page, 'window.__sq = []');
  await finishNow(k.page);
  const sq2 = await ev<string[]>(k.page, 'window.__sq.slice()');
  // 반복 완료의 무작위 추첨은 특제(= 지역 서명 SG07)가 나올 수 있다(설계된 재획득). 확정 서명(source 'signature')·첫 보상은 다시 없어야 한다
  const sv2 = await ev<{ sg: number; clears: number; first: boolean; recFirst: boolean; guaranteed: number; sources: string[] }>(k.page, `(() => { const s = __inkwave.store.current, r = s.processed[s.lastResult]; return { sg: ${sg}, clears: s.clears['7-3'], first: document.querySelector('.iw-sres').classList.contains('is-first'), recFirst: r.first, guaranteed: r.modules.filter((m) => m.source === 'signature').length, sources: r.modules.map((m) => m.source + ':' + m.defId) }; })()`);
  ok('T067·T068 7-3 반복 완료: 엔딩 다시 안 나옴·확정 SG07·첫 보상 재지급 없음·첫 완료 연출 없음', !sq2.includes('P:ending.return') && sv2.guaranteed === 0 && !sv2.recFirst && sv2.clears === 2 && !sv2.first, { sq2, sv2 });
  // 엔딩 다시 보기: 지도에서 7개 지역이 차례로 색을 되찾고 아카이브 통신
  await ev(k.page, 'window.__sq = []');
  await ev(k.page, '__inkwave.api.replayEnding()');
  await k.page.waitForFunction('document.querySelector(".iw-harbor") && document.querySelector(".iw-harbor").dataset.revealed === "1"', { timeout: 20000, polling: 200 }).catch(() => {});
  await wait(600);
  const rv = await ev<{ revealed: boolean; sats: string[]; sq: string[] }>(k.page, `({ revealed: document.querySelector('.iw-harbor')?.dataset.revealed === '1', sats: [...document.querySelectorAll('.iw-harbor__card')].map((c) => c.style.getPropertyValue('--sat')), sq: window.__sq.slice() })`);
  await k.page.screenshot({ path: 'shots/mission/ending-map.png' });
  ok('T068 엔딩 다시 보기: 7개 지역 색 회복(채도 1) + 아카이브 통신', rv.revealed && rv.sats.length === 7 && rv.sats.every((v) => v === '1.00') && rv.sq.includes('L:ending.archive'), rv);
  await ev(k.page, '__inkwave.story.layer.runner.clear()');
  // 도전 출전(1-1 거꾸로 도는 시계: B → A, 도색병 추가): 실제 진행
  await ev(k.page, `__inkwave.api.startChallenge('ch.1-1')`);
  await waitCombat(k.page);
  const ch0 = await ev<{ ch: string | null; first: string | null; crate: boolean; units: number; xp: number; parts: number }>(k.page, `(() => { const s = __inkwave.session; return { ch: s.challenge, first: s.objectives.current() && s.objectives.current().id, crate: s.mission.objectives.some((o) => o.kind === 'crate'), units: s.mission.encounters.find((e) => e.id === 'enc-a').waves[0].units.length, xp: __inkwave.store.current.xp, parts: __inkwave.store.current.inventory.parts }; })()`);
  ok('T068 도전 1-1: 변형 적용(첫 목표 B·도색병 추가·상자 없음)', ch0.ch === 'ch.1-1' && ch0.first === 'o-b' && !ch0.crate && ch0.units === 2, ch0);
  await operate(k.page, -6, 14, 1.5); for (let i = 0; i < 4; i++) await clearArea(k.page, -6, 14, 2.5); await operate(k.page, -6, 14, 2.8);
  await clearArea(k.page, -12, -27, 2.5); await operate(k.page, -12, -31, 2.8);
  await operate(k.page, 0, -4.4, 1.5); await pass(k.page, 1500);
  await k.page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
  const ch1 = await ev<{ rec: { clears: number; bestMs: number } | null; marks: string[]; xp: number; parts: number; inProg: unknown; log: Record<string, string[]> }>(k.page, `(() => { const s = __inkwave.store.current; return { rec: s.challenges['ch.1-1'] || null, marks: s.marks, xp: s.xp, parts: s.inventory.parts, inProg: s.inProgress, log: s.weaponLog }; })()`);
  ok('T068 도전 완료: 부품 +40·외형 표식·개인 기록, 경험치 그대로, 진행 중 기록 없음', !!ch1.rec && ch1.rec.clears === 1 && ch1.rec.bestMs > 0 && ch1.marks.includes('mark.clock') && ch1.xp === ch0.xp && ch1.parts === ch0.parts + 40 && !ch1.inProg && Object.values(ch1.log).some((l) => l.includes('1-1')), ch1);
  // 완료 임무 재진입(일반)
  await ev(k.page, `__inkwave.quitToMenu('workshop')`); await wait(600);
  await start(k.page, '2-1');
  const re = await ev<{ st: string; ch: string | null }>(k.page, '({ st: __inkwave.session.state, ch: __inkwave.session.challenge })');
  ok('T068 완료 임무 재진입(2-1, 일반)', re.st === 'combat' && re.ch === null, re);
  await ev(k.page, `__inkwave.quitToMenu('workshop')`); await wait(600);
  // 기록 14개 수집 목록·미수집 기록은 미완료(테스트 저장은 상자 기록 없음)
  const recs = await ev<{ n: number; found: number }>(k.page, '(() => { const r = __inkwave.api.storyRecords(); return { n: r.length, found: r.filter((x) => x.found).length }; })()');
  ok('T068 선택 기록 14개 목록, 상자를 열지 않은 기록은 미수집으로 남음', recs.n === 14 && recs.found === 0, recs);
  ok('T068 콘솔 오류 없음', errors.length === 0 && k.errors.length === 0, [...errors, ...k.errors].slice(0, 5));
  await k.page.close();
}

async function generic(id: string, plan: Plan): Promise<void> {
  const { page, errors } = await openFresh();
  await ev(page, `__inkwave.store.newGame(Date.now(), 'normal')`);
  await ev(page, `__inkwave.store.commit((s) => ({ ...s, unlocked: ${JSON.stringify(['1-1', ...plan.prev])} }))`);
  const m = await ev<MissionJson>(page, `import('/src/campaign/definitions.js').then((d) => JSON.parse(JSON.stringify(d.getMission('${id}'))))`);
  const dev = (k: string) => m.devices.find((d) => d.id === k)!;
  const unitAt = (u: string): V3 => { for (const e of m.encounters) for (const w of e.waves) for (const x of w.units) if (x.id === u) return x.at; return m.start.at; };
  // 1) 배치
  const lay = await ev<{ bad: string[] }>(page, `(async () => {
    const THREE = await import('three');
    const g = __inkwave, G = window.__G, m = ${JSON.stringify(m)};
    await g.startPractice({ mapId: (await import('/src/campaign/definitions.js')).getMission('${id}').mapId });
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
    return { bad };
  })()`);
  ok(`${id} 배치: 모든 지점이 바닥 위·이동 그래프 안·시작점에서 도달 가능`, lay.bad.length === 0, lay);
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(500);
  // 2) 주행(가짜 표준 패드, 걷기·점프만): 모든 목표·선택 상자·CP에 실제로 닿는다
  await page.evaluate(`window.__pads = []; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__pads.map((q, i) => q && ({ index: i, id: 'Xbox 360 Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: q.ax || [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: !!(q.b && q.b[k]), value: q.b && q.b[k] ? 1 : 0 })) })) })`);
  await start(page, id);
  await ev(page, `window.__pads[0] = { b: { 0: 1 } }`); await ev(page, '__m.frames(3)'); await ev(page, `window.__pads[0] = { b: {} }`); await ev(page, '__m.frames(3)');
  const legs: Array<Record<string, unknown>> = [];
  for (const to of plan.walk) {
    const r = await ev<{ ok: boolean }>(page, `(async () => {
      const g = __inkwave, G = window.__G, s = g.session, m = s.mission, a = G.local, nav = G.nav;
      const units = m.encounters.flatMap((e) => e.waves.flatMap((w) => w.units));
      const d = m.devices.find((x) => x.id === '${to}') || m.checkpoints.find((x) => x.id === '${to}') || units.find((u) => 'unit:' + u.id === '${to}');
      const tgt = s._ground(d.at), rad = (d.radius || 1.5) * 0.8;
      const t0 = G.time; let path = null, pi = 1, replan = 0, lastP = a.pos.clone(), stuckT = 0, jumpT = 0;
      while (G.time - t0 < 60) {
        a.invuln = 999; window.__m.skipStory();
        for (const e of g.match.actors) if (e.team === 1 && e.bot && !e.__frozen) { e.__frozen = 1; e.bot.update = () => { e.intent.move.set(0, 0, 0); e.intent.fire = false; }; }
        if (G.boss && !G.boss.__frozen) { G.boss.__frozen = 1; G.boss.brain.update = () => {}; G.boss.visible = false; }   // 주행 검사: 거대 보스는 멈추고 몸으로 밀지 않는다
        if (Math.hypot(a.pos.x - tgt.x, a.pos.z - tgt.z) < rad && Math.abs(a.pos.y - tgt.y) < 1) { window.__pads[0] = { b: {} }; return { ok: true, secs: +(G.time - t0).toFixed(1) }; }
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
      return { ok: false, left: +Math.hypot(a.pos.x - tgt.x, a.pos.z - tgt.z).toFixed(2), at: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(1)) };
    })()`);
    legs.push({ to, ...r });
    if (!r.ok) break;
    await ev(page, '__m.frames(10)');
  }
  ok(`${id} 주행: 기본 이동(걷기·점프)만으로 모든 목표·선택 상자·CP에 실제로 닿는다`, legs.length === plan.walk.length && legs.every((l) => l.ok), legs);
  await page.screenshot({ path: `shots/mission/walk-${id}.png` });
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(500);
  // 3) 논리 진행 — 이야기 사건(35번 R032)도 기록한다: 대본은 건너뛰기(skip)로 넘기되 큐는 비우지 않는다(통신이 사라지지 않게)
  await ev(page, `(async () => { if (window.__sqOn) return; window.__sqOn = 1; const { on } = await import('/src/core/ctx.js'); window.__sq = [];
    on('story:line', (e) => { if (e.index === 0) window.__sq.push('L:' + e.scriptId); });
    on('story:panel', (e) => { const k = 'P:' + e.sceneId; if (window.__sq[window.__sq.length - 1] !== k) window.__sq.push(k); }); })()`);
  await ev(page, 'window.__sq = []');
  await start(page, id);
  await ev(page, `(window.__m.skipStory = () => { const st = __inkwave.story; if (!st) return; if (st.panels.playing) { st.panels.skip(); return; } if (st.layer.runner.cur) st.layer.runner.skip(); }, 0)`);
  const req = m.objectives.filter((o) => !o.optional);
  const s0 = await st(page);
  ok(`${id} 시작: 전투·첫 목표 ${req[0].id}·HUD 목표`, s0.st === 'combat' && s0.cur === req[0].id && String(s0.hud).length > 0, s0);
  const last = [...req].reverse().find((o) => o.device);
  if (last && last !== req[0]) { const d = dev(last.device!); await operate(page, d.at[0], d.at[2], 2.6); const sk = await st(page); ok(`${id} 순서: ${last.id}를 먼저 가동해도 완료 안 됨`, !sk.done.includes(last.id), sk); }
  const deadAll = (ids: string[]) => ev<boolean>(page, `${JSON.stringify(ids)}.every((u) => __inkwave.session.encounters.dead.has(u))`);
  let diedOnce = false, routeDone = false;
  const crate = plan.skipCrate ? undefined : m.objectives.find((o) => o.kind === 'crate');
  for (const o of req) {
    // 도착형 CP
    for (const c of m.checkpoints) {
      const cur = await st(page);
      if (!c.area || !(c.after ?? []).every((x) => cur.done.includes(x)) || cur.cp === c.id || m.checkpoints.findIndex((x) => x.id === cur.cp) >= m.checkpoints.indexOf(c)) continue;
      await ev(page, `__m.tp(${c.at[0]}, 3, ${c.at[2]})`); await pass(page, 900);
      const r = await st(page);
      const saved = await ev<string | null>(page, '__inkwave.store.current.inProgress && __inkwave.store.current.inProgress.checkpointId');
      ok(`${id} 도착형 ${c.id}: 영역에 들어가면 켜지고 저장된다`, r.cp === c.id && saved === c.id, { r, saved });
    }
    // 갈림길: 고른 경로만 발동
    if (plan.route && !routeDone) {
      const take = m.encounters.find((e) => e.id === plan.route!.take)!;
      const reqs = (take as unknown as { requires?: string[] }).requires ?? [];
      const cur = await st(page);
      if (reqs.every((x) => cur.done.includes(x))) {
        routeDone = true;
        const cx = (take.area[0] + take.area[1]) / 2, cz = (take.area[2] + take.area[3]) / 2;
        await ev(page, `__m.tp(${cx}, 3, ${cz})`); await pass(page, 1500);
        const r = await st(page);
        ok(`${id} 갈림길: ${plan.route.take} 경로만 발동(${plan.route.other} 대기)`, r.enc[plan.route.take] !== 'idle' && r.enc[plan.route.other] === 'idle', r);
        await clearEncounter(page, cx, cz, plan.route.take, 30);
      }
    }
    if (plan.before?.[o.id]) await plan.before[o.id](page, m);
    if (o.kind === 'defeat' && m.boss?.giant && o.target === m.boss.unit) {
      // 거대 보스: 전투장에 들어가 나타나게 한 뒤 실제 피해 경로(applyDamage)로 쓰러뜨린다(포효 중 무적은 기다린다)
      const g = m.boss.giant, t0 = Date.now();
      while (Date.now() - t0 < 30000 && !(await ev<boolean>(page, '!!(window.__G.boss && window.__G.boss.visible)'))) { await ev(page, `(__m.tp(${g.at[0]}, 3, ${g.at[2] - 6}), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); }
      const t1 = Date.now();
      while (Date.now() - t1 < 90000 && !(await ev<boolean>(page, '!window.__G.boss || window.__G.boss.dead'))) { await ev(page, `(() => { const b = window.__G.boss; __m.tp(${g.at[0]}, 3, ${g.at[2] - 7}); __m.skipStory(); b.applyDamage(__m.G.local, 900, false, null); return 0; })()`); await ev(page, '__m.frames(6)'); }
    } else if (o.kind === 'defeat') {
      const at = unitAt(o.target!);
      const t0 = Date.now();
      while (Date.now() - t0 < 15000 && !(await ev<boolean>(page, `!!__inkwave.session.encounters.unitActor('${o.target}')`))) { await ev(page, `(__m.tp(${at[0]}, 3, ${at[2]}), __m.skipStory(), 0)`); await ev(page, '__m.frames(4)'); }
      await clearArea(page, at[0], at[2], 3);
    } else if (o.kind === 'clear') {
      const e = m.encounters.find((x) => x.id === o.encounter)!;
      await clearEncounter(page, (e.area[0] + e.area[1]) / 2, (e.area[2] + e.area[3]) / 2, e.id, 40);
    } else {
      const d = dev(o.device!);
      if (d.guards?.length) { const t0 = Date.now(); while (Date.now() - t0 < 40000 && !(await deadAll(d.guards))) await clearArea(page, d.at[0], d.at[2], 0.6); }
      if (d.clearFirst) { await operate(page, d.at[0], d.at[2], 1.2); await clearEncounter(page, d.at[0], d.at[2], d.clearFirst, 40); }
      if (d.kind === 'stabilize') {
        // 안정화: 원 안에 머물며(칠한 뒤) 다가오는 적을 정리한다 — 누적이 끝날 때까지(게임 시간)
        await ev(page, `__m.paintAt(${d.at[0]}, ${d.at[2]}, 3)`);
        const t0 = Date.now();
        while (Date.now() - t0 < 240000 && !(await ev<boolean>(page, `!!(__inkwave.session && __inkwave.session.devices.get('${d.id}').complete)`))) { await ev(page, `(__inkwave.session && (__m.tp(${d.at[0]}, 3, ${d.at[2]}), __m.killAll(), __m.skipStory()), 0)`); await ev(page, '__m.frames(4)'); }
      } else await operate(page, d.at[0], d.at[2], 2.8);
    }
    await pass(page, 400);
    const r = await st(page);
    if (!r || r.st !== 'combat') { ok(`${id} ${o.id} 완료 → 결과`, (r && r.st === 'results') || (await ev<string>(page, '__inkwave.menus.current')) === 'storyResults', r); break; }
    ok(`${id} ${o.id} 완료(${o.label})`, r.done.includes(o.id), r);
    if (o.checkpoint) {
      const saved = await ev<string | null>(page, '__inkwave.store.current.inProgress && __inkwave.store.current.inProgress.checkpointId');
      ok(`${id} ${o.id} → ${o.checkpoint} 저장`, r.cp === o.checkpoint && saved === o.checkpoint, { r, saved });
    }
    if (crate && o === req[0]) {
      const d = dev(crate.device!);
      await clearArea(page, d.at[0], d.at[2], 1.5); await operate(page, d.at[0], d.at[2], 2.6);
      const c = await st(page);
      ok(`${id} 선택 상자 회수(필수 진행과 별개)`, c.done.includes(crate.id), c);
    }
    // 첫 CP 뒤 한 번: 사망 → 실패 패널 → CP 재도전(앞 목표·상자 유지, 플레이어 생존, 남은 예고 없음)
    if (r.cp && !diedOnce && !plan.ownDeath) {
      diedOnce = true;
      await ev(page, `(() => { const a = __m.G.local; a.invuln = 0; a.splat(null, 'weapon'); })()`);
      await pass(page, 2200);
      const failed = await ev<{ st: string; panel: boolean }>(page, '({ st: __inkwave.session.state, panel: !!document.querySelector(".iw-camp__fail") })');
      await ev(page, '__inkwave.session.retryCheckpoint()'); await pass(page, 600);
      const re = await st(page);
      const tel = await ev<number>(page, '__inkwave.campaignPreview.telegraphs.live.length');
      const resets = m.checkpoints.find((c) => c.id === r.cp)!.resets;
      ok(`${id} ${r.cp} 사망 → 실패 패널 → 재도전(앞 목표 유지·생존·남은 예고 없음·지나지 않은 구간 적 미발동)`, failed.st === 'failed' && failed.panel && re.st === 'combat' && r.done.every((x) => re.done.includes(x)) && re.cp === r.cp && re.alive && tel === 0 && resets.every((e) => re.enc[e] === 'idle'), { failed, re, tel });
      if (plan.route) routeDone = false;   // 재도전으로 갈림길 묶음이 처음 상태다
    }
  }
  if (plan.extra) await plan.extra(page, m);
  await pass(page, 1500);
  await page.waitForFunction('document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 60000, polling: 200 }).catch(() => {});
  await page.screenshot({ path: `shots/mission/${id}-results.png` });
  // 이야기 사건(35번 R032): 시작 대본이 처음, 목표 통신은 그 목표 뒤, 사망 대본(죽었으면), 정예·보스 등장 패널, 완료 대본(첫 완료면 장 에필로그 뒤)
  {
    const sq = await ev<string[]>(page, 'window.__sq.slice()');
    const ms = await ev<{ intro: string; outro: string; death: string; comms: Record<string, string>; panels: Record<string, string> } | null>(page, `import('/src/campaign/story/scripts/index.js').then((x) => { const v = x.missionStory('${id}'); return v && JSON.parse(JSON.stringify({ ...v, comms: v.comms || {}, panels: v.panels || {} })); })`);
    const miss: string[] = [];
    if (!ms) miss.push('이야기 없음');
    else {
      if (sq[0] !== 'L:' + ms.intro) miss.push('처음이 시작 대본이 아님: ' + sq[0]);
      for (const o of m.objectives) if (o.comm && !o.optional && !sq.includes('L:' + ms.comms[o.comm])) miss.push(`목표 ${o.id} 통신 ${ms.comms[o.comm]}`);
      if (diedOnce && !sq.includes('L:' + ms.death)) miss.push('사망 대본');
      const pid = ms.panels.bossIntro ?? ms.panels.midBoss;
      if (pid && !sq.includes('P:' + pid)) miss.push('등장 패널 ' + pid);
      if (!sq.includes('L:' + ms.outro)) miss.push('완료 대본');
    }
    ok(`R032 ${id} 이야기 사건: 시작·목표 통신·사망·등장 패널·완료 대본이 실제 진행 중에 나온다`, miss.length === 0, { miss, sq });
  }
  const save = await ev<{ xp: number; done: string[]; unlocked: string[]; records: string[]; inProgress: unknown; weapons: string[]; want: string[]; sigs: string[]; tier: number; wantTier: number }>(page, `(async () => { const s = __inkwave.store.current; const c = await import('/src/campaign/craft.js'); const e = await import('/src/campaign/data/economy.js'); return { xp: s.xp, done: s.done, unlocked: s.unlocked, records: s.records, inProgress: s.inProgress, weapons: c.unlockedWeapons(s), want: e.WEAPON_UNLOCK['${id}'] || [], sigs: s.signatures, tier: c.upgradeTier({ ...s, done: [...new Set([...s.done, ...e.UPGRADE_UNLOCK_MISSION.slice(0, Math.max(0, e.UPGRADE_UNLOCK_MISSION.indexOf('${id}')))])] }), wantTier: e.UPGRADE_UNLOCK_MISSION.indexOf('${id}') + 1 }; })()`);
  // 강화 단계: 검사 저장은 앞 임무를 해금만 했으므로 앞 장 보스 완료(실제 진행에 있는 것)를 더해 계산한다
  const sig = (m.reward as { signature?: string }).signature;
  ok(`${id} 첫 완료 저장: 완료·다음 해금(${m.reward.unlocks.join(',')})·선택 기록·무기 해금·서명·강화 단계·진행 중 기록 비움`, save.xp > 0 && save.done.includes(id) && m.reward.unlocks.every((u) => save.unlocked.includes(u)) && (!m.reward.record || plan.skipCrate || save.records.includes(m.reward.record)) && save.want.every((w) => save.weapons.includes(w)) && (!sig || save.sigs.includes(sig)) && save.tier >= save.wantTier && !save.inProgress, save);
  await ev(page, `__inkwave.quitToMenu('workshop')`); await wait(800);
  // 작업장 배경 경기(attract)의 봇은 캠페인 적이 아니다: 캠페인 적(EnemyBrain의 unit)이 남았는지 센다
  const rel = await ev<{ session: boolean; preview: boolean; foes: number; boss: boolean }>(page, '({ session: !!__inkwave.session, preview: !!__inkwave.campaignPreview, foes: __inkwave.match ? __inkwave.match.actors.filter((a) => a.bot && a.bot.unit).length : 0, boss: !!window.__G.boss })');
  ok(`${id} 종료 뒤 자원 해제(세션·미리보기·캠페인 적·거대 보스 없음)`, !rel.session && !rel.preview && rel.foes === 0 && !rel.boss, rel);
  ok(`${id} 콘솔 오류 없음`, errors.length === 0, errors.slice(0, 5));
  await page.close();
}
await browser.close().catch(() => {});
console.log(JSON.stringify(results, null, 2));
console.log(`mission-check: ${Object.keys(results).length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
