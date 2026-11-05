// 리디자인 통합 성능 측정(35번 R033). 1-2 고지 전투가 아직 없으므로(33번 T041) 같은 부하의 대리 장면을 쓴다:
// 이야기 임무 체험(1-1, 타이드워터 스폰) + 잔향 대원 3명 중 1명 정예 + 잉크통 폭발 + 말풍선 3개 + 예고 공격 연습(?drill).
// 60초 동안 프레임마다:
//   · 프레임 간격(rAF), 렌더 GPU 시간(짝수 프레임: Renderer.render 전체), StylePass GPU 시간(홀수 프레임: 그 패스만)
//   · CPU: 의성어 라벨(SfxWords.update)·말풍선(SpeechLayer.update)·퐁(Pong.update)·텔레그래프(TelegraphDirector.update)
// GPU 시간은 EXT_disjoint_timer_query_webgl2로 잰다(한 프레임에 쿼리 하나만 열 수 있어 번갈아 잰다).
// 결과는 측정표(JSON)이며 판정은 하지 않는다(기준 PC·실제 1-2 장면이 아니므로 R033 완료 근거가 아니다).
//
// usage: node .tools/perf-check.js [--port 8490] [--seconds 60] [--w 1920 --h 1080] [--quality high]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), seconds = Number(opt('seconds', '60'));
const W = Number(opt('w', '1920')), H = Number(opt('h', '1080')), quality = opt('quality', 'high');
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/perf', { recursive: true });

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(`localStorage.setItem('inkwave.settings', JSON.stringify({ quality: ${JSON.stringify(quality)}, qualityChosen: true, fpsCap: 0 }));`);
  await page.goto(`http://localhost:${port}/?skipTitle&devices&drill`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await page.evaluate('__inkwave.story.start("1-1", false)');
  await page.waitForFunction('__inkwave.campaignPreview && __inkwave.match && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
  await page.evaluate('__inkwave.story.layer.runner.clear()');
  const r = await page.evaluate(`(async () => {
    const g = __inkwave, G = window.__G, P = g.campaignPreview, R = g.R, gl = R.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    g.pause = () => {}; if (g.match.paused) g.resume();
    // 부하: 정예 1명, 말풍선 3개(5초마다), 20초에 잉크통 폭발
    const ctx = await import('/src/core/ctx.js');
    const foes = G.match.actors.filter((a) => a.team !== G.local.team);
    const ent = P.combat.entries.get(foes[0]); if (ent && ent.poise) ent.poise.tier = 'elite';
    const say = () => { for (const a of [G.local, ...foes.slice(0, 2)]) ctx.emit('cast:say', { actor: a, text: '잉크 길을 따라 가자!', kind: 'test', speaker: 'player' }); };
    // CPU 계측 감싸기
    const cpu = { words: [], speech: [], pong: [], telegraph: [] };
    const wrap = (obj, key, bucket) => { const f = obj[key].bind(obj); obj[key] = (...a) => { const t = performance.now(); const v = f(...a); cpu[bucket].push(performance.now() - t); return v; }; };
    wrap(g.words, 'update', 'words'); wrap(P.speech, 'update', 'speech'); wrap(P.pong, 'update', 'pong'); wrap(P.telegraphs, 'update', 'telegraph');
    // GPU: 짝수 프레임 전체 렌더, 홀수 프레임 StylePass만
    const qFull = [], qStyle = []; let frameN = 0;
    if (ext) {
      const rr = R.render.bind(R);
      R.render = () => { if (frameN & 1) return rr(); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); rr(); gl.endQuery(ext.TIME_ELAPSED_EXT); qFull.push(q); };
      if (R.style) { const sr = R.style.render.bind(R.style); R.style.render = (...a) => { if (!(frameN & 1)) return sr(...a); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); sr(...a); gl.endQuery(ext.TIME_ELAPSED_EXT); qStyle.push(q); }; }
    }
    const gaps = []; let last = performance.now(), t0 = last, nextSay = 0, boom = false;
    await new Promise((res) => {
      const f = (t) => {
        frameN++; gaps.push(t - last); last = t;
        const e = (t - t0) / 1000;
        if (e > nextSay) { nextSay += 5; say(); }
        if (!boom && e > 20 && P.devices) { boom = true; const b = P.devices.barrels[0], V = b.pos.constructor; for (let i = 0; i < 8 && b.alive; i++) ctx.emit('weapon:fire', { actor: G.local, weapon: G.local.weapon.id, muzzle: b.pos.clone().add(new V(0, 0.5, -4)), dir: new V(0, 0, 1) }); }
        // 플레이어가 조금씩 움직이며 쏘게(자동 조종 없이 화면이 정지하지 않도록 카메라를 돌린다)
        G.local.intent.fire = (frameN % 40) < 20;
        if (e < ${seconds}) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    await new Promise((r) => setTimeout(r, 500));
    const val = (q) => { const ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); const v = ok ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : NaN; gl.deleteQuery(q); return v; };
    const stat = (xs) => { const v = xs.filter((x) => x === x).sort((a, b) => a - b); if (!v.length) return null; return { n: v.length, median: +v[v.length >> 1].toFixed(3), p95: +v[Math.floor(v.length * 0.95)].toFixed(3), mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) }; };
    const glr = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: glr ? gl.getParameter(glr.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), size: [gl.drawingBufferWidth, gl.drawingBufferHeight], dynScale: R.dynScale, lineMode: R.lineMode,
      frameMs: stat(gaps.slice(30)), renderGpuMs: stat(qFull.map(val)), stylePassGpuMs: stat(qStyle.map(val)),
      cpuMs: { words: stat(cpu.words), speech: stat(cpu.speech), pong: stat(cpu.pong), telegraph: stat(cpu.telegraph) },
      events: { barrel: boom, liveTelegraphs: P.telegraphs.live.length },
    };
  })()`);
  await page.screenshot({ path: 'shots/perf/scene.png' });
  console.log(JSON.stringify({ ...(r as object), errors: errors.slice(0, 5) }, null, 1));
} finally {
  await browser.close();
}
