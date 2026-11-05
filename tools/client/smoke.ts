// 웹 실행 스모크(33번 T004·T005). POSIX 전용 tools/smoke.sh를 Windows에서도 같은 판정으로 돌린다.
// 정적 서버를 직접 띄울 수 있어(--dir) 저장소 루트가 아닌 dist/ 산출물도 따로 연다.
//
// usage: node .tools/smoke.js [--port 8490] [--dir dist] [--secs 8]
//   --dir 가 있으면 그 폴더를 tools/serve.py로 --port에 띄우고 끝나면 내린다. 없으면 이미 떠 있는 서버(npm run dev)에 붙는다.
// 판정: 자동 조종 경기가 playing 상태로 --secs초 진행되고, 콘솔 오류·페이지 오류·모듈/자산 404(허용 목록 제외)가 없어야 한다.
// 종료 코드: 0 통과, 1 실패.
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), dir = opt('dir', ''), secs = Number(opt('secs', '8'));
// 선택 파일(사용자 음원 목록)·오류 비콘·파비콘은 없어도 정상이다
const ALLOWED_404 = [/\/songs\/manifest\.json/, /\/__inkwave_error\//, /favicon\.ico/];

const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!executablePath) { console.error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.'); process.exit(1); }

function python(): string {
  for (const c of [process.env.PYTHON, 'python3', 'python', 'py'].filter((x): x is string => !!x)) {
    const p = spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' });
    if (!p.error && p.status === 0 && p.stdout.trim() === '1') return c;
  }
  throw new Error('Python을 찾지 못했다. PYTHON 환경 변수로 지정한다.');
}

let server: ChildProcess | null = null;
if (dir) {
  const abs = path.resolve(root, dir);
  if (!existsSync(path.join(abs, 'index.html'))) { console.error(`${dir}/index.html이 없다. npm run build를 먼저 실행한다.`); process.exit(1); }
  server = spawn(python(), [path.join(root, 'tools', 'serve.py'), port, '--dir', abs], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
}

const errors: string[] = [], missing: string[] = [];
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
let result: unknown = null;
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400 && !ALLOWED_404.some((re) => re.test(r.url()))) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(`http://localhost:${port}/?autostart=60&autopilot&shadercheck`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.match && __inkwave.match.state === "playing" && __inkwave.match.local', { timeout: 180000, polling: 250 });
  await new Promise((r) => setTimeout(r, secs * 1000));
  result = await page.evaluate('({ state: __inkwave.match.state, t: +__inkwave.match.time.toFixed(1), fps: __inkwave.fps, turf: __inkwave.match.actors.map((a) => Math.round(a.stats.turf)) })');
} catch (e) { errors.push(`smoke: ${(e as Error).message}`); }
await browser.close().catch(() => {});
server?.kill();

const pass = !!result && (result as { state: string }).state === 'playing' && !errors.length && !missing.length;
console.log(JSON.stringify({ pass, port, dir: dir || '(dev server)', result, errors: errors.slice(0, 10), missing: missing.slice(0, 20) }, null, 2));
process.exit(pass ? 0 : 1);
