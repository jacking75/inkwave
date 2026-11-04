// 그림책 룩 검수 도구(35번 R003~R006·R010). 개발 서버(npm run dev)에 headless Chrome으로 붙어 스테이지별 스크린숏과
// StylePass GPU 시간(EXT_disjoint_timer_query_webgl2)을 기록한다. 화면 판단은 사람이 스크린숏으로 한다.
//
// usage: node .tools/look-check.js [--port 8490] [--look classic] [--maps tidewater,kelpline] [--query "theme=inkwash"] [--tag name]
//                                  [--w 1920 --h 1080] [--settle 6000] [--eval "js"] [--shot-eval]
// 결과: shots/look/<tag>-<map>.png 와 표준 출력의 JSON 한 줄씩(map, lineMode, gpu ms 중앙값·95%, fps, 콘솔 오류 수)
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const W = Number(opt('w', '1920')), H = Number(opt('h', '1080'));
const maps = opt('maps', 'tidewater,kelpline,halyard,saltpan,crossmarket,lockgate,terraces').split(',');
const query = opt('query', '');
const tag = opt('tag', 'storybook');
const settle = Number(opt('settle', '6000'));
const extraEval = opt('eval', '');
const look = opt('look', '');   // 'classic' | 'storybook': 저장 설정에 미리 넣는다

const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

// 페이지 안에서 실행한다: StylePass.render를 타이머 쿼리로 감싸 3초간 GPU 시간을 모은다.
const GPU_PROBE = `(async () => {
  const R = window.__inkwave && window.__inkwave.R; if (!R) return { error: 'no renderer' };
  const gl = R.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const out = { lineMode: R.lineMode, look: R.look && R.look.id, ext: !!ext, fps: window.__inkwave.fps };
  if (!ext || !R.style) return out;
  const sp = R.style, orig = sp.render, qs = [];
  sp.render = function (...a) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); orig.apply(this, a); gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q); };
  await new Promise((r) => setTimeout(r, 3000));
  sp.render = orig;
  await new Promise((r) => setTimeout(r, 600));
  const ms = qs.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null).filter((x) => x !== null).sort((a, b) => a - b);
  return Object.assign(out, { n: ms.length, median: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], fps: window.__inkwave.fps });
})()`;

mkdirSync('shots/look', { recursive: true });
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
try {
  for (const map of maps) {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    if (look) await page.evaluateOnNewDocument((l: string) => { localStorage.setItem('inkwave.settings', JSON.stringify({ look: l })); }, look);
    const q = new URLSearchParams(query);
    q.set('map', map); q.set('autostart', '120'); q.set('autopilot', ''); q.set('shadercheck', '');
    await page.goto(`http://localhost:${port}/?${q.toString()}`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
    await new Promise((r) => setTimeout(r, settle));
    if (extraEval) {
      // eval 구간의 브라우저 레이아웃·스타일 재계산 시간(Chrome 성능 지표, 초 누적)을 함께 잰다
      const m0 = await page.metrics();
      const res = await page.evaluate(extraEval);
      const m1 = await page.metrics();
      const d = (k: 'LayoutDuration' | 'RecalcStyleDuration'): number => +(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000).toFixed(2);
      console.log(JSON.stringify({ map, eval: res ?? null, layoutMs: d('LayoutDuration'), recalcStyleMs: d('RecalcStyleDuration') }));
      if (args.includes('--shot-eval')) await page.screenshot({ path: `shots/look/${tag}-${map}-eval.png` });
    }
    const gpu = await page.evaluate(GPU_PROBE);
    await page.screenshot({ path: `shots/look/${tag}-${map}.png` });
    console.log(JSON.stringify({ map, tag, ...(gpu as object), errors: errors.length, firstError: errors[0]?.slice(0, 200) }));
    await page.close();
  }
} finally {
  await browser.close();
}
