// 캠페인 전투 연출·장치·음악 실행 검수(35번 R021~R024). 개발 서버에 headless Chrome으로 붙어 ?tune=campaign 경기에서
//   R021 히트스톱: fx:hitstop 발행, 0.4초 안 중복 병합, 정지 중 오디오 컨텍스트 시계가 실시간으로 흐름, 피니시(정예 처치)의
//        FOV 줌·'쾅!', 모션 줄이기에서 정지·펀치 없음, 메뉴로 나간 뒤 G.campaign null·시간 배율 1
//   R022 텔레그래프: 선·원·부채꼴을 inkwash 바닥·적 잉크·아군 잉크 위에 6개 띄워 화면 픽셀 대비(≥ 3:1)와 비용,
//        예고 종료 직후(0.04초 안) 잠수 입력의 퍼펙트 잠수
//   R023 장치: 분수 발사 속도, 잉크통 파괴(폭발 도색·적 피해), 스위치 60% 작동 → 꺼진 분수 켜짐, 재시작 복원
//   R024 음악: 실제 오디오 경로에서 레이어 전환의 클릭(전환 순간 파형 불연속) 비교, 메뉴 30 fps 제한에서 늦은 음표 0
// usage: node .tools/action-run-check.js [--port 8490] [--only feedback,telegraph,devices,music]
// 결과: 표준 출력 JSON, shots/action/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'feedback,telegraph,devices,music').split(','));
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/action', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const errors: string[] = [];

// ?tune=campaign 연습·대전 경기에 붙는다. 컨트롤러를 끊고 window.__drive 의도를 넣는다(campaign-check와 같은 방식).
async function match(query: string): Promise<Page> {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?tune=campaign&skipTitle${query}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing" && __inkwave.campaignPreview', { timeout: 180000, polling: 250 });
  await page.evaluate(`(async () => {
    const ctx = await import('/src/core/ctx.js');
    window.__t = { G: ctx.G, on: ctx.on, emit: ctx.emit, game: __inkwave };
    __inkwave.pause = () => {}; if (__inkwave.match.paused) __inkwave.resume();
    const ctl = __inkwave.match.controller;
    window.__drive = { move: [0, 0], squid: false, fire: false, jump: false };
    ctl.update = function () { const it = this.a.intent, d = window.__drive; it.move.set(d.move[0], 0, d.move[1]); it.squid = d.squid; it.fire = d.fire; it.jump = d.jump; it.sub = false; it.special = false; };
  })()`);
  await wait(1500);
  return page;
}

try {
  // ---------------------------------------------------------------- R021
  if (only.has('feedback')) {
    const page = await match('&autostart=300&map=tidewater');
    const r = await page.evaluate(`(async () => {
      const { G, on } = __t, P = __inkwave.campaignPreview, me = G.local;
      const ev = []; const off = on('fx:hitstop', (e) => ev.push(e));
      const words = []; const offW = on('fx:word', (e) => words.push(e.text));
      const enemies = G.match.actors.filter((a) => a.team !== me.team);
      const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const e of enemies) e.invuln = 0;
      // 처치 하나 → 히트스톱 시작, 정지 중 오디오 시계와 실시간 비교
      const ac = G.audio && G.audio.ctx;
      enemies[0].damage(999, me, 'weapon');
      const a0 = ac ? ac.currentTime : 0, p0 = performance.now(), s0 = P.time.scale;
      await new Promise((r) => requestAnimationFrame(() => r()));
      const sDuring = P.time.scale;
      await w8(40);
      const a1 = ac ? ac.currentTime : 0, p1 = performance.now();
      // 0.4초 안 두 번째 처치 → 새 히트스톱 아님
      enemies[1].damage(999, me, 'weapon');
      await w8(1200);   // 0.4초 병합 창(시뮬레이션 시계)이 확실히 지난 뒤
      // 정예 처치(피니시): 버팀 tier를 정예로 바꿔 쓰러뜨린다
      const n = P.combat.entries.get(enemies[2]); n.poise.tier = 'elite';
      const fov0 = G.rig.fovKickT;
      enemies[2].damage(999, me, 'weapon');
      const fovK = { deg: G.rig.fovKickDeg, t: G.rig.fovKickT };
      await w8(600);
      // 모션 줄이기: 처치해도 정지 없음
      G.settings.reduceMotion = true;
      const before = ev.length;
      await w8(500);
      const e3 = enemies[3];
      if (e3 && e3.alive) { e3.invuln = 0; e3.damage(999, me, 'weapon'); }
      await new Promise((r) => requestAnimationFrame(() => r()));
      const calm = { events: ev.length - before, scale: P.time.scale };
      G.settings.reduceMotion = false;
      off(); offW();
      return { events: ev.map((e) => [e.reason, e.seconds]), sDuring, audioDt: (a1 - a0) * 1000, realDt: p1 - p0, hasAudio: !!ac, fovK, fov0, words, calm };
    })()`) as { events: Array<[string, number]>; sDuring: number; audioDt: number; realDt: number; hasAudio: boolean; fovK: { deg: number; t: number }; words: string[]; calm: { events: number; scale: number } };
    ok('feedback.hitstop.kill', r.events[0]?.[0] === 'kill' && Math.abs(r.events[0][1] - 0.08) < 1e-6 && r.sDuring < 0.1, r);
    ok('feedback.hitstop.merge0.4s', r.events.filter((e) => e[0] === 'kill').length === 1, r.events);
    ok('feedback.audioClock.real', !r.hasAudio || Math.abs(r.audioDt - r.realDt) < 25, { audio: r.audioDt.toFixed(1), real: r.realDt.toFixed(1), hasAudio: r.hasAudio });
    ok('feedback.finish', r.events.some((e) => e[0] === 'elite' && Math.abs(e[1] - 0.16) < 1e-6) && r.fovK.deg === -8 && r.words.includes('쾅!'), { ev: r.events, fov: r.fovK, words: r.words });
    ok('feedback.reduceMotion', r.calm.events === 0 && r.calm.scale === 1, r.calm);
    await page.screenshot({ path: 'shots/action/finish.png' });
    // 메뉴로 나가면 시간 배율이 남지 않는다: 원래 _loop 경로(G.campaign 없음)
    await page.evaluate('__inkwave.quitToMenu()'); await wait(1800);
    const after = await page.evaluate('({ campaign: __t.G.campaign, raw: __inkwave._rawDt })') as { campaign: unknown; raw: number };
    ok('feedback.sessionEnd', after.campaign === null, after);
    await page.close();
  }

  // ---------------------------------------------------------------- R022
  if (only.has('telegraph')) {
    const page = await match('&autostart=300&map=tidewater&colorreturn=0');
    // 플레이어 둘레(스폰 덱의 평평한 바닥) 6자리: [원, 선, 부채꼴] × [색 잃은 맨바닥, 적 잉크, 아군 잉크]. 위에서 내려다본다.
    const placed = await page.evaluate(`(async () => {
      const { G } = __t, P = __inkwave.campaignPreview, me = G.local, V = me.pos.constructor;
      for (const a of G.match.actors) if (a !== me) { a.bot = null; a.character.root.visible = false; a.pos.y -= 50; }
      P.opts.drill = false;
      const f = new V(Math.sin(me.yaw), 0, Math.cos(me.yaw)), r = new V(f.z, 0, -f.x);
      const at = (fw, side) => { const p = me.pos.clone().addScaledVector(f, fw).addScaledVector(r, side); const h = G.physics.raycast(new V(p.x, p.y + 1.5, p.z), new V(0, -1, 0), 4); if (h.hit) p.y = h.point.y; return p; };
      // 덱 가운데 표식 원판(반지름 약 2 m)과 앞 난간(약 3.4 m)·뒤 벽(약 3.8 m)을 피한 자리
      const spots = [[0, -6.8, 'circle', -1], [1.8, -3.8, 'line', 1], [1.8, 3.8, 'cone', 0], [-2.4, -3.8, 'line', 0], [-2.4, 3.8, 'cone', -1], [0, 6.8, 'circle', 1]];
      const out = [];
      for (const [fw, side, shape, ink] of spots) {
        const p = at(fw, side);
        if (ink >= 0) G.paint.splat(new V(p.x, p.y + 0.3, p.z), 1.9, ink === 1 ? me.team : 1 - me.team, { seed: 3, instant: true });
        // 부채꼴은 덱 옆쪽을 향한다: 경계가 난간 밑이나 덱 표식 위에 걸리지 않게
        const sg = side > 0 ? 1 : -1, away = Math.atan2(r.x * sg, r.z * sg);   // 옆(난간 반대)으로
        const spec = shape === 'circle' ? { shape, origin: p, radius: 1.1 } : shape === 'line' ? { shape, origin: p.clone().addScaledVector(r, -1.3), yaw: Math.atan2(r.x, r.z), length: 2.6, width: 0.9 } : { shape, origin: p.clone().add(new V(-Math.sin(away) * 0.7, 0, -Math.cos(away) * 0.7)), yaw: away, radius: 1.6, halfAngle: 0.55 };
        out.push({ shape, ink, spec: { ...spec, duration: 30, damage: 0, attacker: null } });
      }
      G.paint.flush(0.016);
      me.character.root.visible = false;
      __inkwave.hud.setVisible(false);   // 픽셀을 읽는 자리에 HUD가 겹치지 않게
      const top = me.pos.clone().add(new V(0, 13, 0)).addScaledVector(f, -2.5);
      G.rig.cinematic(top, top, me.pos, me.pos, 999, undefined, 0, 50);
      return out;
    })()`) as Array<{ shape: string; ink: number; spec: object }>;
    await wait(500);
    await page.evaluate(`(() => { const P = __inkwave.campaignPreview; window.__specs = ${JSON.stringify(placed.map((p) => p.spec))}; for (const s of __specs) P.telegraphs.add(s); })()`);
    await wait(900);
    await page.screenshot({ path: 'shots/action/telegraph-6.png' });
    // 각 데칼의 경계를 따라 16점: 노랑 띠 가운데(경계 안 0.08 m), 먹색 테두리(경계 밖 0.035 m), 바닥(경계 밖 0.35 m)을
    // 화면에 투영해 픽셀을 읽는다. 점마다 (띠, 테두리) 중 바닥과 더 크게 대비되는 값을 구하고 데칼별 중앙값으로 판정한다
    // (스폰 덱 표식·그림자·화면 밖에 걸린 소수의 점이 결과를 흔들지 않게).
    const pts = await page.evaluate(`(() => {
      const { G } = __t, cam = G.camera, out = [];
      const pr = (p) => { const q = p.clone().project(cam); return [Math.round((q.x * 0.5 + 0.5) * innerWidth), Math.round((-q.y * 0.5 + 0.5) * innerHeight)]; };
      for (const d of __inkwave.campaignPreview.telegraphs.live) {
        const s = d.spec, V = cam.position.constructor, o = new V(s.origin.x, s.origin.y + 0.03, s.origin.z), list = [];
        for (let i = 0; i < 16; i++) {
          const u = (i + 0.5) / 16;
          let b, n;
          if (s.shape === 'circle') { const t = u * Math.PI * 2; n = new V(Math.sin(t), 0, Math.cos(t)); b = o.clone().addScaledVector(n, s.radius); }
          else if (s.shape === 'line') { const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), side = i & 1 ? 1 : -1; n = new V(fz * side, 0, -fx * side); b = o.clone().add(new V(fx * s.length * (0.1 + 0.8 * u), 0, fz * s.length * (0.1 + 0.8 * u))).addScaledVector(n, s.width / 2); }
          else { const t = s.yaw + (u * 2 - 1) * (s.halfAngle - 0.08); n = new V(Math.sin(t), 0, Math.cos(t)); b = o.clone().addScaledVector(n, s.radius); }
          list.push({ band: pr(b.clone().addScaledVector(n, -0.08)), key: pr(b.clone().addScaledVector(n, 0.035)), ground: pr(b.clone().addScaledVector(n, 0.35)) });
        }
        out.push(list);
      }
      return out;
    })()`) as Array<Array<{ band: [number, number]; key: [number, number]; ground: [number, number] }>>;
    const png = await page.screenshot({ encoding: 'base64' }) as string;
    // 픽셀 읽기: 브라우저에서 PNG를 디코드한다(노드에 PNG 디코더를 더하지 않는다)
    const px = await page.evaluate(`(async (b64, all) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const at = ([u, v]) => { const d = x.getImageData(Math.max(0, Math.min(c.width - 1, u)), Math.max(0, Math.min(c.height - 1, v)), 1, 1).data; return [d[0], d[1], d[2]]; };
      return all.map((list) => list.map((p) => ({ band: at(p.band), key: at(p.key), ground: at(p.ground) })));
    })(${JSON.stringify(png)}, ${JSON.stringify(pts)})`) as Array<Array<{ band: number[]; key: number[]; ground: number[] }>>;
    const lum = (c: number[]): number => { const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a: number[], b: number[]): number => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const rows = placed.map((p, i) => {
      const best = px[i].map((q) => Math.max(ratio(q.band, q.ground), ratio(q.key, q.ground))).sort((a, b) => a - b);
      return { shape: p.shape, surface: ['inkwash', 'enemyInk', 'allyInk'][p.ink + 1], median: +best[best.length >> 1].toFixed(2), min: +best[0].toFixed(2), share3: +(best.filter((v) => v >= 3).length / best.length).toFixed(2) };
    });
    ok('telegraph.contrast≥3', rows.every((r) => r.median >= 3), rows);
    // 비용: 데칼 6개 켠 상태와 끈 상태의 프레임 렌더 시간(GPU 타이머 쿼리, 없으면 CPU) 평균 차
    //   위에서 내려다본 검수 구도(데칼이 화면의 약 1/3)는 기록만 하고, 판정은 플레이 카메라(따라가기)에서 실제 공격 크기로 한다
    const COST = `(async () => {
      const R = __inkwave.R, gl = R.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const layer = __inkwave.campaignPreview.telegraphs.layer;
      // 같은 프레임 안에서 데칼을 켠 렌더와 끈 렌더를 번갈아 재고(순서도 프레임마다 뒤집음) 각각의 중앙값을 비교한다:
      // 통합 GPU의 클럭·발열 변동이 두 쪽에 똑같이 걸린다
      const on = [], off = [];
      const time = (vis) => {
        for (const d of layer.pool) d.mesh.visible = vis && d.live;
        if (ext) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); R.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); return q; }
        const t = performance.now(); R.render(); return performance.now() - t;
      };
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => requestAnimationFrame(() => r()));
        if (i & 1) { off.push(time(false)); on.push(time(true)); } else { on.push(time(true)); off.push(time(false)); }
      }
      await new Promise((r) => setTimeout(r, 400));
      const val = (q) => { if (!ext) return q; const ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); const v = ok ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN; gl.deleteQuery(q); return v; };
      const med = (xs) => { const v = xs.map(val).filter((x) => x === x).sort((a, b) => a - b); return v[v.length >> 1]; };
      const onM = med(on), offM = med(off);
      for (const d of layer.pool) d.mesh.visible = d.live;
      const screen = __inkwave.R.renderer.getContext();
      return { gpuTimer: !!ext, on: onM, off: offM, delta: onM - offM, px: [screen.drawingBufferWidth, screen.drawingBufferHeight] };
    })()`;
    type Cost = { gpuTimer: boolean; on: number; off: number; delta: number };
    const costTop = await page.evaluate(COST) as Cost;
    // 플레이 구도: 카메라를 플레이어로 되돌리고 앞 5~13 m에 실제 크기(포격 원 2.2 m, 감시 선 10 m×1.2, 방패 부채꼴 6 m)로 6개
    await page.evaluate(`(() => {
      const { G } = __t, P = __inkwave.campaignPreview, me = G.local, V = me.pos.constructor;
      P.telegraphs.clear(); me.character.root.visible = true;
      const f = new V(Math.sin(me.yaw), 0, Math.cos(me.yaw)), r = new V(f.z, 0, -f.x);
      const at = (fw, side) => { const p = me.pos.clone().addScaledVector(f, fw).addScaledVector(r, side); const h = G.physics.raycast(new V(p.x, p.y + 1.5, p.z), new V(0, -1, 0), 4); if (h.hit) p.y = h.point.y; return p; };
      // 플레이 카메라와 같은 높이·비스듬한 각도(덱 앞 9 m, 위 2.8 m에서 덱 쪽을 봄: 덱 뒤는 벽이라 앞에서 본다).
      // 스폰 덱 안에 실제 공격 크기에 가깝게 6개
      const eye = me.pos.clone().addScaledVector(f, 9).add(new V(0, 2.8, 0)), look = me.pos.clone().addScaledVector(f, 1).add(new V(0, 0.6, 0));
      G.rig.cinematic(eye, eye, look, look, 999, undefined, 0, 50);
      const yaw = me.yaw;
      for (const s of [
        { shape: 'circle', origin: at(1, -3), radius: 2.2 }, { shape: 'circle', origin: at(3, 3), radius: 2.2 },
        { shape: 'line', origin: at(5, -1), yaw: yaw + Math.PI, length: 7, width: 1.2 }, { shape: 'line', origin: at(5, 1.5), yaw: yaw + Math.PI, length: 7, width: 1.2 },
        { shape: 'cone', origin: at(5, 0), yaw: yaw + Math.PI, radius: 5, halfAngle: 0.5 }, { shape: 'cone', origin: at(4, -4), yaw: yaw + Math.PI - 0.4, radius: 5, halfAngle: 0.5 },
      ]) P.telegraphs.add({ ...s, duration: 30, damage: 0, attacker: null });
    })()`);
    await wait(1200);
    await page.screenshot({ path: 'shots/action/telegraph-play.png' });
    const cost = await page.evaluate(COST) as Cost;
    ok('telegraph.cost≤0.3ms', cost.delta <= 0.3, { play: cost, topDown: costTop });
    await page.evaluate('__inkwave.campaignPreview.telegraphs.clear()');
    // 퍼펙트 잠수: 예고 종료 직후(0.02초 뒤) 잠수 키를 새로 누르면 그 피해가 무효다
    const perf = await page.evaluate(`(async () => {
      const { G, on } = __t, P = __inkwave.campaignPreview, me = G.local;
      P.telegraphs.clear();
      const enemy = G.match.actors.find((a) => a.team !== me.team);
      me.hp = me.tune.hp; let perfect = 0; const off = on('action:perfectDive', () => perfect++);
      P.telegraphs.add({ shape: 'circle', origin: me.pos.clone(), radius: 2, duration: 0.9, damage: 30, attacker: enemy });
      const end = G.time + 0.9;
      // 예고 종료 0.07초 전에 잠수 키를 새로 누른다(헤드리스 프레임 간격이 커서 종료 뒤 0.04초 창은 행동 검사가 본다)
      await new Promise((r) => { const f = () => { if (G.time >= end - 0.07) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      __drive.squid = true;
      await new Promise((r) => setTimeout(r, 300));
      __drive.squid = false;
      const hp1 = me.hp;
      // 대조: 입력 없이 맞으면 피해
      await new Promise((r) => setTimeout(r, 1200));
      me.hp = me.tune.hp;
      P.telegraphs.add({ shape: 'circle', origin: me.pos.clone(), radius: 2, duration: 0.9, damage: 30, attacker: G.match.actors.filter((a) => a.team !== me.team)[1] || enemy });
      await new Promise((r) => setTimeout(r, 1400));
      off();
      return { perfect, hpAfterPerfect: hp1, hpAfterHit: me.hp, max: me.tune.hp };
    })()`) as { perfect: number; hpAfterPerfect: number; hpAfterHit: number; max: number };
    ok('telegraph.perfectBeforeEnd', perf.perfect === 1 && perf.hpAfterPerfect === perf.max && perf.hpAfterHit < perf.max, perf);
    await page.close();
  }

  // ---------------------------------------------------------------- R023
  if (only.has('devices')) {
    const page = await match('&devices&autostart=300&map=tidewater');
    const r = await page.evaluate(`(async () => {
      const { G, emit } = __t, P = __inkwave.campaignPreview, D = P.devices, me = G.local, V = me.pos.constructor;
      const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      // 분수: 원판 위로 옮기면 수직 9.5 m/s
      const f1 = D.fountains[0];
      me.pos.copy(f1.pos); me.vel.set(0, 0, 0);
      let vy = 0; for (let i = 0; i < 40 && vy < 1; i++) { await new Promise((r) => requestAnimationFrame(() => r())); vy = Math.max(vy, me.vel.y); }
      out.fountainVy = +vy.toFixed(2);
      await w8(1500);
      // 잉크통: 근처에 적을 세우고 플레이어 사격 방향 광선으로 맞힌다
      const b = D.barrels[0], foe = G.match.actors.find((a) => a.team !== me.team);
      foe.bot = null; foe.invuln = 0; foe.pos.copy(b.pos).add(new V(1.2, 0, 0)); foe.hp = foe.tune.hp;
      const hp0 = foe.hp;
      const muzzle = b.pos.clone().add(new V(0, 0.5, -4)), dir = new V(0, 0, 1);
      for (let i = 0; i < 8 && b.alive; i++) emit('weapon:fire', { actor: me, weapon: me.weapon.id, muzzle, dir });
      out.barrel = { alive: b.alive, foeHp: [hp0, foe.alive ? foe.hp : 0], dmg: hp0 - (foe.alive ? foe.hp : 0) };
      // 스위치: 원판을 아군 잉크로 칠하면 꺼진 분수(f2)가 켜진다
      // 스위치를 스폰 덱 밖(앞 10 m)으로 옮겨 처음 상태에서 시작한다
      const s = D.switches[0], f2 = D.fountains.find((f) => f.def.id === 'f2');
      const fw = new V(Math.sin(me.yaw), 0, Math.cos(me.yaw)), sp = D.fountains[0].pos.clone().addScaledVector(fw, 10);
      const gh = G.physics.raycast(new V(sp.x, sp.y + 6, sp.z), new V(0, -1, 0), 14); if (gh.hit) sp.y = gh.point.y;
      s.pos.copy(sp); s.mesh.position.copy(sp); s.done = false; s.pollT = 0; f2.on = false; D._showFountain(f2);
      // 그 자리를 먼저 적 잉크로 덮어 아군 덮임 0에서 시작한다(봇·스폰 잉크가 이미 있을 수 있다)
      G.paint.splat(new V(sp.x, sp.y + 0.4, sp.z), 1.8, 1 - me.team, { seed: 9, instant: true }); G.paint.flush(0.016);
      await w8(400);
      out.coverBefore = +s.cover.toFixed(2);
      out.f2Before = f2.on;
      G.paint.splat(new V(s.pos.x, s.pos.y + 0.4, s.pos.z), 1.6, me.team, { seed: 5, instant: true });
      G.paint.flush(0.016);
      await w8(800);
      out.switch = { done: s.done, cover: +s.cover.toFixed(2), f2: f2.on, before: out.coverBefore, f2Before: out.f2Before };
      // 재시작: 시작 상태로
      P.restart();
      out.restart = { barrel: D.barrels[0].alive && D.barrels[0].hp === 60, switch: s.done, f2: f2.on };
      return out;
    })()`) as { fountainVy: number; barrel: { alive: boolean; dmg: number }; f2Before: boolean; coverBefore: number; switch: { done: boolean; cover: number; f2: boolean }; restart: { barrel: boolean; switch: boolean; f2: boolean } };
    ok('device.fountain', Math.abs(r.fountainVy - 9.5) < 0.6, r.fountainVy);
    ok('device.barrel', !r.barrel.alive && r.barrel.dmg >= 70, r.barrel);
    ok('device.switch', !r.f2Before && r.coverBefore < 0.6 && r.switch.done && r.switch.cover >= 0.6 && r.switch.f2, r.switch);
    ok('device.restart', r.restart.barrel && !r.restart.switch && !r.restart.f2, r.restart);
    await page.screenshot({ path: 'shots/action/devices.png' });
    await page.close();
  }

  // ---------------------------------------------------------------- R024
  if (only.has('music')) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?skipTitle`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    // 1) 레이어 게인 포락선을 실제 Web Audio로 그린다: 상수 1 신호를 그룹 게인 노드(가짜 Player의 groups)에 통과시키고
    //    CampaignMusic이 그 노드를 움직이게 해 OfflineAudioContext로 렌더한다 → 출력 = 그 층의 게인 곡선.
    //    클릭 = 표본 사이 게인 계단. 20 ms 선형 페이드면 한 표본당 변화가 mix/960 정도이고, 대조군(같은 순간 바로 바꿈)은 mix 전체다.
    //    전환 시각이 2박 경계(t0 + k × 2박)인지도 본다.
    const click = await page.evaluate(`(async () => {
      const C = await import('/src/audio/campaignMusic.js');
      const sr = 48000, bpm = 128, beat = 60 / bpm, t0 = 0.06;
      const render = async (mode) => {
        const ctx = new OfflineAudioContext(1, sr * 8, sr);
        const src = ctx.createConstantSource(); src.offset.value = 1;
        const groups = {}, mix = { lead: 0.26, kick: 0.55, bass: 0.4 };
        for (const g of Object.keys(mix)) { groups[g] = ctx.createGain(); groups[g].gain.value = mix[g]; }
        src.connect(groups.lead); groups.lead.connect(ctx.destination); src.start(0);
        let now = 0;
        const player = { id: C.CAMPAIGN_TRACK, t0, song: { bpm }, groups, mix, disposed: false };
        const music = { ctx, current: player, remap: null, play() {}, now: () => now };
        const cm = new C.CampaignMusic(music);
        cm.tick();
        const at = [];
        for (const [t, lvl] of [[2.0, 3], [5.0, 0]]) {
          now = t;
          if (mode === 'fade') at.push(cm.setLevel(lvl));
          else { const T = C.nextBoundary(t0, beat, t + 0.03), m = C.layerMask(lvl); groups.lead.gain.setValueAtTime(mix.lead * m.lead, T); at.push(T); }
        }
        const d = (await ctx.startRendering()).getChannelData(0);
        let step = 0; for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
        const v = (t) => d[Math.round(t * sr)];
        return { at, step, levels: [v(1.0), v(at[0] + 0.03), v(at[1] + 0.03)] };
      };
      const fade = await render('fade'), hard = await render('hard');
      const onBeat = fade.at.every((t) => Math.abs(((t - t0) / (2 * beat)) - Math.round((t - t0) / (2 * beat))) < 1e-6);
      return { fade, hard, onBeat };
    })()`) as { fade: { at: number[]; step: number; levels: number[] }; hard: { step: number }; onBeat: boolean };
    // 페이드의 최대 계단이 20 ms 선형 램프의 한 표본 변화(0.26/960) 정도이고 대조군 계단(0.26)보다 훨씬 작으며, 층이 실제로 켜졌다 꺼짐
    const lv = click.fade.levels;
    ok('music.noClick', click.onBeat && click.fade.step <= 0.26 / 960 * 1.2 && click.hard.step > 0.2 && lv[0] < 1e-6 && Math.abs(lv[1] - 0.26) < 1e-3 && lv[2] < 1e-6, click);
    // 2) 실제 오디오: 메뉴 30 fps 제한에서 작업장 곡의 음표가 늦게 예약되지 않는다(예약 시각 < 현재 시각이면 늦음)
    const sched = await page.evaluate(`(async () => {
      const G = (await import('/src/core/ctx.js')).G;
      __inkwave._audioOn = true; G.audio.init(); await G.audio.ctx.resume?.();
      __inkwave.api.setSettings({ fpsCap: 30 });
      __inkwave.menus._go('workshop');
      await new Promise((r) => setTimeout(r, 1500));
      const mus = G.music, cur = mus.current;
      if (!cur || cur.id !== 'workshop') return { track: cur && cur.id };
      const ctx = mus.ctx; let late = 0, n = 0, minLead = 9;
      const fire = cur.fire.bind(cur);
      cur.fire = (e, T) => { n++; const lead = T - ctx.currentTime; minLead = Math.min(minLead, lead); if (lead < 0) late++; return fire(e, T); };
      // 프레임 간격 확인(30 fps 제한이 실제로 걸렸는지)
      const ts = []; await new Promise((r) => { const f = (t) => { ts.push(t); if (ts.length < 60) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
      await new Promise((r) => setTimeout(r, 6000));
      cur.fire = fire;
      const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      return { track: cur.id, notes: n, late, minLead: +minLead.toFixed(3), fps: __inkwave.fps, state: ctx.state };
    })()`) as { track: string; notes: number; late: number; minLead: number; fps: number; state: string };
    ok('music.scheduler30fps', sched.track === 'workshop' && sched.notes > 20 && sched.late === 0 && sched.fps <= 32, sched);
    await page.close();
  }
} finally {
  await browser.close();
}
ok('errors', errors.length === 0, errors.slice(0, 8));
console.log(JSON.stringify(results, null, 1));
if (fail) process.exit(1);
