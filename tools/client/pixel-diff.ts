// 렌더러 화소 비교(35번 R003 "classic = 원본 화소 동일"). 경기 화면은 봇·비동기 로딩·시간 셰이더 때문에 결정적이지 않으므로
// 같은 고정 장면(조명·그림자·여러 재질)을 각 빌드의 Renderer(src/core/renderer.js)로 한 번 그려 화소를 비교한다.
//
// usage: node .tools/pixel-diff.js --a http://localhost:8491 --b http://localhost:8490 [--look-b classic] [--look-a classic] [--quality medium]
// 출력: 두 화소 배열의 차이(다른 화소 수, 최대 채널 차)와 shots/look/pixdiff-{a,b}.png
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const A = opt('a', 'http://localhost:8491'), B = opt('b', 'http://localhost:8490');
const lookA = opt('look-a', 'classic'), lookB = opt('look-b', 'classic');
const W = 960, H = 540;
// high은 GTAO의 무작위 잡음 텍스처 때문에 같은 빌드끼리도 화소가 다르다. 결정적 비교는 medium(GTAO 없음)으로 한다.
const quality = opt('quality', 'medium');

const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

// 페이지 안: 빈 문서에 import map을 넣고 그 빌드의 three·Renderer로 고정 장면을 그린 뒤 RGBA를 base64로 돌려준다.
const RENDER = (look: string): string => `(async () => {
  const THREE = await import('three');
  const { Renderer } = await import('/src/core/renderer.js');
  const div = document.createElement('div'); div.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(div);
  const R = new Renderer(div, { quality: '${quality}', shadows: true, bloom: true, look: '${look}', touchControls: 'off' });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fd8f0);
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 500); cam.position.set(6, 5, 9); cam.lookAt(0, 0.8, 0);
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.2); sun.position.set(8, 12, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun, new THREE.HemisphereLight(0xb4d0ff, 0xdcc3a0, 0.6));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const mats = [new THREE.MeshStandardMaterial({ color: 0xff8a14, roughness: 0.4 }), new THREE.MeshPhysicalMaterial({ color: 0x2f5bff, roughness: 0.2, clearcoat: 1 }), new THREE.MeshLambertMaterial({ color: 0x18d48c })];
  const geos = [new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.SphereGeometry(0.9, 48, 24), new THREE.TorusKnotGeometry(0.6, 0.22, 128, 16)];
  geos.forEach((g, i) => { const m = new THREE.Mesh(g, mats[i]); m.position.set(-2.4 + i * 2.4, 1.0, 0); m.castShadow = m.receiveShadow = true; scene.add(m); });
  R.setScene(scene, cam);
  R.render();
  const gl = R.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return { w, h, data: btoa(s), png: R.renderer.domElement.toDataURL('image/png'), passes: R.composer.passes.map((p) => p.constructor.name) };
})()`;

interface Shot { w: number; h: number; data: string; png: string; passes: string[] }

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
async function grab(base: string, look: string): Promise<Shot> {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', base, String(e)));
  // 같은 출처의 빈 문서(404 본문)에 import map을 넣는다. 게임 부팅은 하지 않는다.
  await page.goto(`${base}/__pixel_diff_blank__`, { waitUntil: 'load' });
  await page.setContent('<!doctype html><html><head><script type="importmap">{ "imports": { "three": "./vendor/three/build/three.module.js", "three/addons/": "./vendor/three/jsm/" } }</script></head><body style="margin:0"></body></html>');
  const shot = await page.evaluate(RENDER(look)) as Shot;
  await page.close();
  return shot;
}
try {
  mkdirSync('shots/look', { recursive: true });
  const a = await grab(A, lookA), b = await grab(B, lookB);
  writeFileSync('shots/look/pixdiff-a.png', Buffer.from(a.png.split(',')[1], 'base64'));
  writeFileSync('shots/look/pixdiff-b.png', Buffer.from(b.png.split(',')[1], 'base64'));
  const pa = Buffer.from(a.data, 'base64'), pb = Buffer.from(b.data, 'base64');
  let diff = 0, maxd = 0;
  if (pa.length === pb.length) for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d) { diff++; if (d > maxd) maxd = d; }
  }
  console.log(JSON.stringify({ a: { base: A, look: lookA, size: `${a.w}x${a.h}`, passes: a.passes }, b: { base: B, look: lookB, size: `${b.w}x${b.h}`, passes: b.passes }, sameSize: pa.length === pb.length, diffPixels: diff, maxChannelDiff: maxd }));
} finally {
  await browser.close();
}
