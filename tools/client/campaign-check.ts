// 캠페인 액션·인물 연출 실행 검수(35번 R011~R020). 개발 서버에 headless Chrome으로 붙어 ?tune=campaign 대전에서
// 실제 Actor 훅(damage·update·이동)을 거쳐 퍼펙트 잠수·서지·물결·스태거·잔향 소멸·퐁·말풍선을 확인하고 스크린숏을 남긴다.
// 마지막에 메뉴로 나가 효과가 남지 않는지(G.campaign null, 새 대전 actor.tune === PLAYER)도 본다.
//
// usage: node .tools/campaign-check.js [--port 8490] [--map tidewater] [--w 1600 --h 900]
// 결과: 표준 출력 JSON(항목별 결과), shots/campaign/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), map = opt('map', 'tidewater');
const W = Number(opt('w', '1600')), H = Number(opt('h', '900'));
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/campaign', { recursive: true });

// 페이지 공용 도우미: G·emit 모듈(게임과 같은 인스턴스), 프레임 대기, 컨트롤러를 스크립트 입력으로 바꾸기
const PRELUDE = `(async () => {
  const ctx = await import('/src/core/ctx.js');
  const game = window.__inkwave;
  const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__t = { G: ctx.G, on: ctx.on, emit: ctx.emit, game, frames, wait };
  // 컨트롤러를 끊고 window.__drive의 의도를 매 프레임 넣는다(키 입력·포인터 잠금 없이 같은 Actor 경로를 탄다)
  // headless에서는 포인터 잠금이 없어 일시 정지될 수 있다: 검수 동안 정지를 막는다
  game.pause = () => {}; if (game.match.paused) game.resume();
  const ctl = game.match.controller;
  window.__drive = { move: [0, 0], squid: false, fire: false, jump: false };
  ctl.update = function () { const it = this.a.intent, d = window.__drive; it.move.set(d.move[0], 0, d.move[1]); it.squid = d.squid; it.fire = d.fire; it.jump = d.jump; it.sub = false; it.special = false; };
  return true;
})()`;

async function shot(page: Page, name: string): Promise<void> { await page.screenshot({ path: `shots/campaign/${name}.png` }); }

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown) => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?tune=campaign&autostart=300&map=${map}&skipTitle`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
  await page.evaluate(PRELUDE);

  // 퐁 근접(경기 시작 직후 스폰의 빈 공간): 옆에서 보고 퐁이 카메라 쪽으로 몸을 돌린다(대화 때와 같은 동작)
  await page.evaluate(`(async () => { const { G, game, wait, emit } = __t; await wait(1500); const L = G.local, m = G.scene.getObjectByName('pong');
    const V = L.pos.constructor, f = new V(Math.sin(L.yaw), 0, Math.cos(L.yaw)), r = new V(f.z, 0, -f.x);
    const at = m.position.clone(), from = at.clone().addScaledVector(f, -0.15).addScaledVector(r, 1.15).setY(at.y + 0.18);
    game.campaignPreview.pong.faceCamera = true;
    game.rig.cinematic(from, from, at, at, 5);
    game.campaignPreview.pong.react('joy', 3); emit('cast:say', { pos: at.clone().setY(at.y + 0.16), text: '퐁!', kind: 'pong', speaker: 'pong' });
    await wait(700); })()`);
  await shot(page, 'pong-close');
  await page.evaluate(`(() => { __t.game.campaignPreview.pong.faceCamera = false; __t.game.rig.follow(__t.G.local, true); })()`);
  // ---- R016 튜닝
  const tune = await page.evaluate(`(() => { const { G } = __t; const L = G.local, E = G.actors.find((a) => a.team !== L.team);
    return { campaign: !!G.campaign, run: L.tune.runSpeed, swim: L.tune.swimSpeed, enemyRun: E.tune.runSpeed, globalRun: 6.0 }; })()`) as { campaign: boolean; run: number; swim: number; enemyRun: number };
  ok('R016 캠페인 튜닝 적용', tune.campaign && tune.run === 6.4 && tune.swim === 12.6 && Math.abs(tune.enemyRun - 5.4) < 1e-9, tune);

  // ---- R017 퍼펙트 잠수: 실제 damage() 경로
  const perfect = await page.evaluate(`(async () => { const { G, on, frames } = __t; const L = G.local, E = G.actors.find((a) => a.team !== L.team && a.alive);
    let ev = 0; const off = on('action:perfectDive', () => ev++);
    L.invuln = 0; L.hp = 100; L.grounded = true; L.groundTeam = 0;
    L._squidPressT = G.time - 0.05; const r1 = L.damage(40, E, 'weapon'); const hp1 = L.hp;
    await frames(2); const scale = G.campaign.time.scale;
    L._squidPressT = G.time - 0.5; L.damage(20, E, 'weapon'); const hp2 = L.hp;                    // 창 밖
    L.hp = 100; const E2 = G.actors.find((a) => a.team !== L.team && a !== E) || E;
    L.groundTeam = 2; L._squidPressT = G.time - 0.05; L.damage(20, E2, 'weapon'); const hp3 = L.hp;  // 적 잉크 위
    L.groundTeam = 0; L.hp = 100; L._squidPressT = G.time - 0.05; L.damage(20, E, 'weapon'); const hp4 = L.hp;  // 같은 공격자 1초 안
    off(); return { r1, hp1, ev, scale, hp2, hp3, hp4, exposed: G.campaign.combat.isExposed(E) }; })()`) as Record<string, number | boolean>;
  ok('R017 창 안 입력 피해 0·히트스톱', perfect.hp1 === 100 && perfect.ev === 1 && (perfect.scale as number) < 1 && perfect.exposed === true, perfect);
  ok('R017 창 밖·적 잉크·중복은 정상 피해', perfect.hp2 === 80 && perfect.hp3 === 80 && perfect.hp4 === 80, perfect);

  // ---- R018 잉크 서지: 자기 잉크 위에서 잠수 키 두 번(0.1초 간격) → 약 5.5 m 돌진
  const surge = await page.evaluate(`(async () => { const { G, frames, wait } = __t; const L = G.local;
    L.invuln = 0; L.hp = 100; L.ink = 100;
    for (let i = 0; i < 6; i++) G.paint.splat(L.pos.clone().setY(L.pos.y + 0.3).addScaledVector(new L.pos.constructor(Math.sin(L.aimYaw), 0, Math.cos(L.aimYaw)), i * 1.6), 2.2, L.team, { seed: i });
    await frames(10);
    let n = 0; const off = __t.on('action:surge', () => n++);
    const c = G.campaign.combat; const ink0 = L.ink;
    __drive.squid = true; await frames(2); __drive.squid = false; await wait(100); __drive.squid = true; await frames(1);
    // 서지 시작(combat.surge 생김)부터 끝(사라짐)까지의 수평 이동만 잰다
    let p0 = null, k = 0; while (k++ < 120) { if (c.surge && !p0) p0 = L.pos.clone(); if (p0 && !c.surge) break; await frames(1); }
    const d = p0 ? Math.hypot(L.pos.x - p0.x, L.pos.z - p0.z) : -1; __drive.squid = false; off();
    // 쿨다운 중 다시 이중 입력 → 무시
    __drive.squid = true; await frames(2); __drive.squid = false; await wait(60); __drive.squid = true; await frames(2); __drive.squid = false;
    return { n, d, inkUsed: ink0 - L.ink, groundTeam: L.groundTeam }; })()`) as { n: number; d: number; inkUsed: number };
  ok('R018 이중 입력 서지 발동·거리(5.5 m, 프레임 경계 오차 포함)', surge.n === 1 && surge.d > 4.6 && surge.d < 6.2, surge);
  await shot(page, 'surge');

  // ---- R020 스태거: 사격병(슈터)에게 슈터 2발 → 스태거, 스태거 중 의도 0
  const stag = await page.evaluate(`(async () => { const { G, on, frames } = __t; const L = G.local;
    const E = G.actors.find((a) => a.team !== L.team && a.alive);
    // 병종을 사격병으로 고정한다(경기마다 봇 무기가 달라 결과가 흔들리지 않게). 노출(퍼펙트 잠수 검사)도 지운다.
    const { Poise } = await import('/src/campaign/action/stagger.js');
    const en = G.campaign.combat.entry(E); en.poise = new Poise('gunner'); en.exposeLeft = 0;
    E.invuln = 0; E.hp = 1000; let n = 0; const off = on('enemy:stagger', () => n++);
    const p0 = E.pos.clone();
    E.damage(36, L, 'weapon'); const s1 = G.campaign.combat.isStaggered(E);
    E.damage(36, L, 'weapon'); const s2 = G.campaign.combat.isStaggered(E);
    await frames(3); const moveLen = Math.hypot(E.intent.move.x, E.intent.move.z), fire = E.intent.fire;
    const hpA = E.hp; E.damage(10, L, 'weapon'); const mul = (hpA - E.hp) / 10;
    const kb = Math.hypot(E.pos.x - p0.x, E.pos.z - p0.z);
    off(); E.hp = 100; return { kind: E.weapon.kind, s1, s2, n, moveLen, fire, mul, kb }; })()`) as Record<string, number | boolean | string>;
  ok('R020 슈터 2발 스태거·의도 0·배율', stag.s1 === false && stag.s2 === true && stag.n === 1 && stag.moveLen === 0 && stag.fire === false, stag);
  await shot(page, 'stagger');

  // ---- R019 물결: 처치 4회 → 1단계 HUD 링, 피격 → 하강
  const wave = await page.evaluate(`(async () => { const { G, frames } = __t; const L = G.local, c = G.campaign.combat;
    c.buffLeft = 0;   // 퍼펙트 잠수 버프(이동 +8%)를 빼고 물결 효과만 본다
    for (let i = 0; i < 9; i++) c._gain('kill');
    await frames(2); const ring = document.querySelector('.iw-wave'); const on = ring ? ring.querySelectorAll('.iw-wave__seg.is-on').length : -1;
    const lv = c.wave.level, run = L.tune.runSpeed, paused = G.match.paused, state = G.match.state;
    L.invuln = 0; L._squidPressT = -9; L.damage(5, null, 'weapon'); await frames(2);
    const on2 = ring ? ring.querySelectorAll('.iw-wave__seg.is-on').length : -1, lv2 = c.wave.level;
    for (let i = 0; i < 12; i++) c._gain('kill'); await frames(3);
    return { lv, on, run, paused, state, lv2, on2, lv3: c.wave.level, glow: c.waveGlow(L), run3: L.tune.runSpeed }; })()`) as Record<string, number | boolean>;
  ok('R019 단계·HUD·속도', wave.lv === 2 && wave.on === 2 && Math.abs((wave.run as number) - 6.4 * 1.08) < 1e-6 && wave.lv2 === 1 && wave.on2 === 1 && wave.lv3 === 3 && wave.glow === true, wave);
  await shot(page, 'wave3');

  // ---- R013 퐁 / R012 말풍선
  const pong = await page.evaluate(`(async () => { const { G, emit, frames } = __t; const L = G.local;
    const m = G.scene.getObjectByName('pong'); const tris = m ? m.geometry.index.count / 3 : -1;
    emit('cast:say', { actor: L, text: '좋아, 가 보자!', kind: 'kill', speaker: 'player' });
    await frames(4);
    const b = [...document.querySelectorAll('.iw-bubble')].find((x) => x.style.display === 'block');
    const r = b ? b.getBoundingClientRect() : null;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const near = r ? Math.hypot(Math.max(r.left, Math.min(cx, r.right)) - cx, Math.max(r.top, Math.min(cy, r.bottom)) - cy) : -1;
    return { pong: !!m, visible: m && m.visible, tris, bubble: !!b, centerDist: near }; })()`) as Record<string, number | boolean>;
  ok('R013 퐁 메시·삼각형 ≤ 600', pong.pong === true && (pong.tris as number) > 0 && (pong.tris as number) <= 600, pong);
  ok('R012 말풍선 표시·중앙 120px 밖', pong.bubble === true && (pong.centerDist as number) >= 119, pong);
  // 목소리: 효과음 입력에 −9 dB 버스로 섞인다(오디오 컨텍스트가 돌 때만 소리를 낸다)
  const voice = await page.evaluate(`(async () => { const { G, game } = __t; G.audio.init(); await G.audio.ctx.resume();
    const { VOICES } = await import('/src/game/cast/cast.js'); const v = game.campaignPreview.speech.voice;
    const dur = v.speak('좋아, 가 보자!', VOICES.player);
    return { state: G.audio.ctx.state, dur, busDb: v.bus ? 20 * Math.log10(v.bus.gain.value) : null }; })()`) as { dur: number; busDb: number | null };
  ok('R012 찍찍 목소리 −9 dB 버스', voice.dur > 0 && voice.busDb !== null && Math.abs(voice.busDb + 9) < 0.01, voice);
  // 퐁: 메시 하나·그림자 없음(드로우콜 +1), 카메라가 0.9 m 안으로 붙으면 숨는다(벽에 밀린 붐)
  const pongCam = await page.evaluate(`(async () => { const { G, game, frames } = __t; const p = game.campaignPreview.pong, m = p.mesh;
    let meshes = 0; m.traverse((o) => { if (o.isMesh) meshes++; });
    await frames(2); const far = m.visible;
    const cam = G.camera.clone(); cam.position.copy(m.position).add({ x: 0.2, y: 0.1, z: 0.25 }); cam.updateMatrixWorld();
    p.update(0.016, cam); const near = m.visible;
    await frames(2); return { meshes, castShadow: m.castShadow, far, near, nearAfter: m.visible }; })()`) as Record<string, unknown>;
  const comm = await page.evaluate(`(async () => { const { emit, frames } = __t; emit('cast:say', { pos: __t.G.local.pos.clone(), text: '퐁!', kind: 'pong', speaker: 'pong' }); await frames(3);
    const el = document.querySelector('.iw-comm'), face = document.querySelector('.iw-comm__face');
    return { on: !!el && el.classList.contains('is-on'), sprite: !!face && face.style.backgroundImage.startsWith('url('), pos: face && face.style.backgroundPosition }; })()`) as Record<string, unknown>;
  ok('R013 HUD 통신 초상(퐁 얼굴 스프라이트)', comm.on === true && comm.sprite === true, comm);
  await shot(page, 'comm');
  ok('R013 퐁 드로우콜 +1·근접 카메라 숨김', pongCam.meshes === 1 && pongCam.castShadow === false && pongCam.far === true && pongCam.near === false && pongCam.nearAfter === true, pongCam);
  await shot(page, 'bubble-pong');

  // ---- 화면 검수: 잔향 대원을 10 m 앞에 세우고(두뇌를 잠시 뗌) 플레이어 뒤 카메라로 찍는다(퐁·잔향 구분)
  const placed = await page.evaluate(`(async () => { const { G, frames, wait } = __t; await wait(2500); const L = G.local;
    const E = G.actors.find((a) => a.team !== L.team && a.alive) || G.actors.find((a) => a.team !== L.team), A = G.actors.find((a) => a.team === L.team && a !== L);
    if (!E.alive) E.respawn();
    window.__shotBots = [E, A].filter(Boolean).map((a) => [a, a.bot]);
    for (const [a] of window.__shotBots) a.bot = null;
    // 스폰 장벽(상대 스폰 반경에는 못 들어감)을 피해 맵 가운데 쪽 빈 바닥으로 모두 옮긴다
    const gy = (x, z) => G.level.groundHeight(x, z, 40);
    const spot = (x, z) => { const y = gy(x, z); return Number.isFinite(y) ? [x, y, z] : null; };
    // 아군 스폰 → 상대 스폰 직선 위에서 10 m 간격의 평평한 두 지점을 찾는다
    const P0 = G.level.spawnPads[L.team], P1 = G.level.spawnPads[1 - L.team];
    const dx = P1.x - P0.x, dz = P1.z - P0.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    // 시야가 트이고(los) 높이가 비슷하며 아군 스폰 장벽 밖인 10 m 간격 두 지점
    const V = L.pos.constructor, R = G.level.spawnBarrier + 1.5;
    let base = null;
    for (let t = 0.15; t < 0.6 && !base; t += 0.05) {
      const p = spot(P0.x + dx * t, P0.z + dz * t); if (!p) continue;
      for (let k = 0; k < 16 && !base; k++) {
        const a = (k / 16) * Math.PI * 2, vx = Math.sin(a), vz = Math.cos(a), q = spot(p[0] + vx * 10, p[2] + vz * 10);
        if (!q || Math.abs(p[1] - q[1]) > 0.3 || Math.hypot(q[0] - P0.x, q[2] - P0.z) < R) continue;
        if (!G.physics.los(new V(p[0], p[1] + 1.2, p[2]), new V(q[0], q[1] + 1.2, q[2]))) continue;
        base = [p, q, vx, vz];
      }
    }
    if (!base) return 'no flat spot';
    const [p, q, ux2, uz2] = base;
    L.pos.set(p[0], p[1], p[2]); L.vel.set(0, 0, 0); L.yaw = L.aimYaw = Math.atan2(ux2, uz2); L.aimPitch = -0.05;
    const place = (a, side) => { a.pos.set(q[0] + uz2 * side, q[1], q[2] - ux2 * side); a.vel.set(0, 0, 0); a.yaw = L.yaw + Math.PI; a.intent.move.set(0, 0, 0); a.intent.fire = false; a.invuln = 99; };
    place(E, 1.2); if (A) place(A, -1.2);
    await wait(900); return { L: L.pos.toArray().map((v) => +v.toFixed(1)), E: E.pos.toArray().map((v) => +v.toFixed(1)) }; })()`);
  results.echoShot = placed;
  await shot(page, 'echo-10m');
  await page.evaluate(`(() => { for (const [a, b] of window.__shotBots) { a.bot = b; a.invuln = 0; } })()`);

  // ---- R014·R015 잔향 외형·소멸: 적 5명 동시 소멸 프레임 시간
  const echo = await page.evaluate(`(async () => { const { G, game, frames, wait } = __t; const L = G.local;
    const es = G.actors.filter((a) => a.team !== L.team && a.alive).slice(0, 5);
    const mark = es[0] && es[0].character.root.getObjectByName('echo-mark');
    // CPU: 연출 갱신(fx.update) 시간과 프레임 시뮬레이션+렌더 CPU(main perf, 지수 평균)
    const fx = game.campaignPreview.cast.fx, upd = fx.update.bind(fx); const fxMs = [];
    fx.update = (dt) => { const t = performance.now(); upd(dt); fxMs.push(performance.now() - t); };
    // 프레임 CPU: main._frame 한 번의 실행 시간(시뮬레이션·렌더 명령·HUD)을 프레임마다 재서 중앙값을 비교한다
    const fr = game._frame.bind(game); let frameMs = [];
    game._frame = (dt) => { const t = performance.now(); fr(dt); frameMs.push(performance.now() - t); };
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    await frames(40); frameMs = []; await frames(27); const base = med(frameMs); fxMs.length = 0; frameMs = [];
    for (const e of es) { e.invuln = 0; e.damage(9999, L, 'weapon'); }
    await frames(27); const during = med(frameMs);
    game._frame = fr;
    const fxMax = Math.max(...fxMs), fxAvg = fxMs.reduce((a, b) => a + b, 0) / fxMs.length;
    const scrapsMid = G.scene.getObjectByName('echo-scraps').count;
    const vis = es.map((e) => e.character.root.visible);
    await wait(700);
    fx.update = upd;
    return { n: es.length, mark: !!mark, base, during, fxMax, fxAvg, scrapsMid, visAfter: es.map((e) => e.character.root.visible), visMid: vis }; })()`) as Record<string, unknown>;
  ok('R014 잔향 표식', echo.mark === true, echo);
  ok('R015 소멸 후 숨김', Array.isArray(echo.visAfter) && (echo.visAfter as boolean[]).every((v) => v === false), echo);
  results['R015 동시 소멸 CPU ms(프레임 중앙값 전/중, fx.update 평균/최대)'] = [echo.base, echo.during, echo.fxAvg, echo.fxMax];
  // 판정은 연출 갱신(fx.update) 평균으로 한다. headless의 프레임 중앙값은 실행마다 ±1 ms 흔들려(같은 조건 반복 측정)
  // 참고값으로만 남긴다. GPU(소멸 셰이더 discard) 비용은 여기서 재지 않는다.
  ok('R015 동시 소멸 연출 갱신 평균 0.5 ms 이하', (echo.fxAvg as number) <= 0.5, [echo.base, echo.during, echo.fxAvg]);

  // 체크포인트 재시작 대응: 연습 초기화와 같은 restart()가 조각을 지운다
  const clear = await page.evaluate(`(async () => { const { G, game, wait, frames } = __t;
    const L = G.local; game.campaignPreview.cast.fx.announce(L.pos, '#ff5a4f'); game.campaignPreview.cast.fx.dissolve(G.actors.find((a) => a.team !== L.team).character);
    await frames(5); const before = G.scene.getObjectByName('echo-scraps').count;
    game.campaignPreview.restart(); await frames(2); return { before, after: G.scene.getObjectByName('echo-scraps').count }; })()`) as { before: number; after: number };
  ok('R015 재시작 시 조각 0', clear.after === 0, clear);

  // ---- 메뉴로 나간 뒤 효과가 남지 않음 + 새 대전은 기본 튜닝(G.campaign이 null이면 Actor 훅 없음)
  const after = await page.evaluate(`(async () => { const { G, game, wait } = __t; await game.quitToMenu(); await wait(500);
    return { campaign: G.campaign ?? null, pong: !!G.scene.getObjectByName('pong'), bubbles: document.querySelectorAll('.iw-speech').length, rig: game.rig.waveLevel }; })()`) as Record<string, unknown>;
  ok('세션 종료 후 G.campaign null·퐁·말풍선 정리', after.campaign === null && after.pong === false && after.bubbles === 0, after);
  // ---- R016: 연습 모드에서 토글 유무의 실제 최고 달리기 속도, 토글 없는 대전의 actor.tune === PLAYER
  const runTop = async (q: string) => {
    await page.goto(`http://localhost:${port}/?${q}&skipTitle`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate('__inkwave.startPractice()');
    await page.waitForFunction('__inkwave.match && __inkwave.match.practice && __inkwave.match.state === "playing" && __inkwave.match.local', { timeout: 180000, polling: 250 });
    await page.evaluate(PRELUDE);
    return page.evaluate(`(async () => { const { G, frames, wait } = __t; const L = G.local; await wait(800);
      // 맵 가운데 쪽으로 2초 달려 최고 수평 속도를 잰다(무기: 기본 슈터)
      const P = G.level.spawnPads, dx = P[1].x - P[0].x, dz = P[1].z - P[0].z, d = Math.hypot(dx, dz);
      __drive.move = [dx / d, dz / d]; let top = 0;
      for (let i = 0; i < 120; i++) { await frames(1); top = Math.max(top, Math.hypot(L.vel.x, L.vel.z)); }
      __drive.move = [0, 0];
      return { top, tune: L.tune.runSpeed, campaign: !!G.campaign, weapon: L.weaponId }; })()`);
  };
  const withTune = await runTop('tune=campaign') as { top: number; tune: number; campaign: boolean };
  const without = await runTop('x=1') as { top: number; tune: number; campaign: boolean };
  ok('R016 연습 모드 토글 체감 비교(최고 달리기 속도)', withTune.campaign && !without.campaign && withTune.top > without.top * 1.04, { withTune, without });
  await page.goto(`http://localhost:${port}/?autostart=300&map=${map}&skipTitle`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
  const plain = await page.evaluate(`(async () => { const { G } = await import('/src/core/ctx.js'); const { PLAYER } = await import('/src/config.js');
    return { campaign: G.campaign ?? null, allPlayer: G.actors.every((a) => a.tune === PLAYER), n: G.actors.length, pong: !!G.scene.getObjectByName('pong') }; })()`) as Record<string, unknown>;
  ok('R016 토글 없는 대전: actor.tune === PLAYER·G.campaign null', plain.campaign === null && plain.allPlayer === true && plain.pong === false, plain);
  results.errors = errors.slice(0, 10);
  if (errors.length) fail++;
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
if (fail) { console.error(`campaign-check: ${fail} failed`); process.exit(1); }
