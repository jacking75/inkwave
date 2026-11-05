// 원본 룩 회귀 화면 비교(35번 R034 (1)). 원본 커밋 빌드(--a)와 현재 빌드(--b, settings.look = 'classic')에서 같은 연습 경기
// 장면을 결정적으로 그려 화소를 비교한다. 결정적으로 만드는 방법: medium 화질(GTAO 잡음 없음)·고정 해상도, 인물·HUD 숨김,
// 디버그 정지(debug.freeze) 뒤 카메라 고정, 장면의 모든 시간 유니폼(uTime)과 G.time을 같은 값으로 맞추고 debug.step으로 한 장.
// 방법이 결정적인지 같은 빌드를 두 번(--a와 --a) 비교한 대조군 값을 함께 낸다.
//
// usage: node .tools/classic-diff.js --a http://localhost:8491 --b http://localhost:8490 [--map tidewater] [--control] [--repeats 4]
// 출력: JSON(차이 화소 수·최대 채널 차, 대조군), shots/look/classic-{a,b}.png
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const A = opt('a', 'http://localhost:8491'), B = opt('b', 'http://localhost:8490'), map = opt('map', 'tidewater');
const W = 1280, H = 720;
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

const SETTINGS = JSON.stringify({ quality: 'medium', look: 'classic', shadows: true, bloom: true, fpsCap: 0, touchControls: 'off', qualityChosen: true, shadowsChosen: true, music: 0, sfx: 0, master: 0 });

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});

interface Grab { png: string; data: string; w: number; h: number; dyn: number }

async function grab(base: string): Promise<Grab> {
  const page: Page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', base, String(e)));
  await page.evaluateOnNewDocument(`localStorage.setItem('inkwave.settings', ${JSON.stringify(SETTINGS)}); localStorage.setItem('inkwave.profile', JSON.stringify({ name: 'Diff', style: { hair: 0, skin: 1 }, weapon: 'shooter' }));`);
  await page.goto(`${base}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await page.evaluate(`__inkwave.startPractice({ mapId: ${JSON.stringify(map)} })`);
  await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
  await new Promise((r) => setTimeout(r, 2500));
  const out = await page.evaluate(`(async () => {
    const g = __inkwave, G = window.__G || (await import('/src/core/ctx.js')).G;
    g.debug.freeze();
    g.menus && g.menus.show(null);
    if (g.hud) g.hud.setVisible(false);
    for (const a of G.match.actors) a.character.root.visible = false;
    // 동적 해상도를 1로 고정(빌드마다 측정이 달라 크기가 다를 수 있다)
    if (g.R.setDynamicScale) g.R.setDynamicScale(1);
    // 카메라: 스폰 덱 위 고정 시점
    const pad = G.level.spawnPads[0], V = G.camera.position.constructor;
    // 스폰 덱과 무대 가운데 사이 높이 30 m에서 무대 반대편 쪽을 비스듬히 내려다본다(건물·바닥·물·하늘이 함께 들어온다)
    const from = new V(pad.x * 0.55, pad.y + 30, pad.z * 0.55), look = new V(-pad.x * 0.35, 0, -pad.z * 0.35);
    g.rig.cinematic(from, from, look, look, 9999);
    // 시간 유니폼을 모두 같은 값으로
    const T = 12.5;
    G.time = T;
    G.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const u of [m.uniforms, m.userData && m.userData.uniforms, m.userData && m.userData.shader && m.userData.shader.uniforms]) if (u && u.uTime) u.uTime.value = T; });
    g.debug.step(16.7);
    G.time = T;
    G.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const u of [m.uniforms, m.userData && m.userData.uniforms, m.userData && m.userData.shader && m.userData.shader.uniforms]) if (u && u.uTime) u.uTime.value = T; });
    g.R.render();
    const gl = g.R.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
    return { w, h, data: btoa(s), png: g.R.renderer.domElement.toDataURL('image/png'), dyn: g.R.dynScale || 1 };
  })()`) as Grab;
  await page.close();
  return out;
}

function diff(a: Grab, b: Grab): { sameSize: boolean; diffPixels: number; maxChannelDiff: number; share: number } {
  const pa = Buffer.from(a.data, 'base64'), pb = Buffer.from(b.data, 'base64');
  let n = 0, m = 0;
  if (pa.length === pb.length) for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d) { n++; if (d > m) m = d; }
  }
  return { sameSize: pa.length === pb.length, diffPixels: n, maxChannelDiff: m, share: +(n / (pa.length / 4)).toFixed(6) };
}

try {
  mkdirSync('shots/look', { recursive: true });
  const a = await grab(A), b = await grab(B);
  writeFileSync('shots/look/classic-a.png', Buffer.from(a.png.split(',')[1], 'base64'));
  writeFileSync('shots/look/classic-b.png', Buffer.from(b.png.split(',')[1], 'base64'));
  const res: Record<string, unknown> = { size: [`${a.w}x${a.h}`, `${b.w}x${b.h}`], originalVsCurrent: diff(a, b) };
  if (args.includes('--control')) {
    const a2 = await grab(A), b2 = await grab(B);
    res.controlOriginal = diff(a, a2); res.controlCurrent = diff(b, b2);
    // 반복 촬영을 더 해 불안정 화소(움직이는 배·물결·장식)를 넓게 잡는다(--repeats, 기본 2 = 위 한 번씩)
    const reps = Math.max(2, Number(opt('repeats', '2')));
    const extraA: Grab[] = [], extraB: Grab[] = [];
    for (let r = 2; r < reps; r++) { extraA.push(await grab(A)); extraB.push(await grab(B)); }
    // 설명되지 않는 차이: 두 빌드 사이에서 다르지만 각 빌드의 반복 촬영에서는 안정한 화소(움직이는 장식·하늘 잡음이 아닌 차이)
    const pa = Buffer.from(a.data, 'base64'), pa2 = Buffer.from(a2.data, 'base64'), pb = Buffer.from(b.data, 'base64'), pb2 = Buffer.from(b2.data, 'base64');
    const same = (x: Buffer, y: Buffer, i: number) => x[i] === y[i] && x[i + 1] === y[i + 1] && x[i + 2] === y[i + 2];
    let unexplained = 0;
    const where: number[][] = [];
    if (pa.length === pb.length && pa.length === pa2.length && pb.length === pb2.length) for (let i = 0; i < pa.length; i += 4) if (!same(pa, pb, i) && same(pa, pa2, i) && same(pb, pb2, i) && extraA.every((g) => same(pa, Buffer.from(g.data, 'base64'), i)) && extraB.every((g) => same(pb, Buffer.from(g.data, 'base64'), i))) {
      unexplained++;
      if (where.length < 24) { const k = i / 4; where.push([k % a.w, a.h - 1 - Math.floor(k / a.w), Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]))]); }
    }
    res.unexplainedPixels = unexplained;
    res.unexplainedAt = where;   // [x, y(위에서), 최대 채널 차]
  }
  console.log(JSON.stringify(res));
} finally {
  await browser.close();
}
