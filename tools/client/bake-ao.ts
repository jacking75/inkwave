// 맵 배치의 앰비언트 오클루전 라이트맵 굽기 → assets/lightmaps/<배치>.png(+ .json 배치 해시).
// 34번 F01-F: Electron 창에서 돌던 build/bake-ao.cjs를 headless Chrome + 개발 서버로 옮겼다(계산 식·출력 형식 동일).
// 실제 게임 안에서 돈다 — 소품이 레벨에 충돌체를 넘겨 배치 해시가 게임이 만드는 것과 같고, 게임의 물리 광선으로 텍셀마다 쏜다.
// 톤 곡선(출하 tidewater 굽기에 맞춤): max(0.65, 1 − 0.9 · occ^1.1), occ = 거리 가중 적중.
//
// usage: npm run bake -- [배치 id …]   (예: saltpan lockgate, 'saltpan.zones'는 구역전 변형) — 먼저 `npm run dev`(포트 8490)
//        [--port 8490]. 배치를 주지 않으면 모든 맵의 기본 배치를 굽는다.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const port = portAt >= 0 ? args[portAt + 1] : '8490';
const layouts = args.filter((a, i) => (portAt < 0 || (i !== portAt && i !== portAt + 1)) && /^[a-z0-9_-]+(\.[a-z]+)?$/i.test(a));
const OUT = path.join('assets', 'lightmaps');
const OPTS = { ppm: 8, size: 2048, rays: 96, dist: 3.5, floor: 0.65, strength: 0.9, gamma: 1.1 };
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

// 8비트 회색조 PNG(색 형식 0) — 출하된 굽기와 같은 형식
function grayPNG(size: number, pixels: Buffer): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer): number => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8;
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) { raw[y * (size + 1)] = 0; pixels.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 페이지 안에서 돈다. { hash, used, png: size×size 회색 바이트의 base64(0행 = 그림 위쪽) }
const PAGE_BAKE = (o: typeof OPTS): string => `(async () => {
  const THREE = await import('/vendor/three/build/three.module.js'); const { Hit } = await import('/src/game/physics.js');
  const O = ${JSON.stringify(o)}, L = __G.level, P = __G.physics, S = O.size;
  if (!L.layoutLightmap(O.ppm, S)) throw new Error('lightmap atlas does not fit ' + S + ' at ' + O.ppm + ' ppm (used ' + L.lightUsed + ')');
  const img = new Uint8Array(S * S).fill(255);
  const dirs = [];
  for (let k = 0; k < O.rays; k++) { let b = k, rv = 0, f = 0.5; while (b) { if (b & 1) rv += f; b >>= 1; f *= 0.5; }
    const u1 = (k + 0.5) / O.rays, r = Math.sqrt(u1), ph = 2 * Math.PI * rv; dirs.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u1)]); }
  const hit = new Hit(), p = new THREE.Vector3(), d = new THREE.Vector3();
  const faces = L.faces.filter((f) => f.light);
  let done = 0, lastLog = performance.now();
  for (const f of faces) {
    const blk = L.blocks[f.block], pad = f.light.pad;
    const w = Math.ceil(f.su * O.ppm) + pad * 2, h = Math.ceil(f.sv * O.ppm) + pad * 2;
    const val = new Float32Array(w * h).fill(1);
    if (!blk.hidden && f.n.y > -0.5) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const cu = Math.min(f.su - 0.01, Math.max(0.01, (i - pad + 0.5) / O.ppm)), cv = Math.min(f.sv - 0.01, Math.max(0.01, (j - pad + 0.5) / O.ppm));
        p.copy(f.origin).addScaledVector(f.u, cu).addScaledVector(f.v, cv).addScaledVector(f.n, 0.03);
        if (L.pointInside(p, 0.01)) { val[j * w + i] = O.floor; continue; }
        const rot = (((f.id * 73856093) ^ (i * 19349663) ^ (j * 83492791)) >>> 0) / 4294967296 * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
        let occ = 0;
        for (const [a0, b0, c] of dirs) {
          d.set(0, 0, 0).addScaledVector(f.u, a0 * cr - b0 * sr).addScaledVector(f.v, a0 * sr + b0 * cr).addScaledVector(f.n, c);
          P.raycast(p, d, O.dist, hit, true);
          if (hit.hit) occ += 1 - hit.dist / O.dist;
        }
        val[j * w + i] = Math.max(O.floor, 1 - O.strength * Math.pow(occ / O.rays, O.gamma));
      }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < w && y < h) { s += val[y * w + x]; n++; } }
      const X = f.light.x + i, Y = S - 1 - (f.light.y + j);
      if (X < S && Y >= 0) img[Y * S + X] = Math.round((s / n) * 255);
    }
    done++;
    if (performance.now() - lastLog > 3000) { lastLog = performance.now(); console.log('[bake] ' + Math.round(done / faces.length * 100) + '%'); await new Promise((r) => setTimeout(r)); }
  }
  let bin = ''; for (let i = 0; i < img.length; i += 0x8000) bin += String.fromCharCode.apply(null, img.subarray(i, i + 0x8000));
  return { hash: L.layoutHash, used: L.lightUsed, png: btoa(bin) };
})()`;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 3600000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.text().startsWith('[bake]')) console.log('  ' + m.text()); });
  await page.goto(`http://localhost:${port}/?skipTitle`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('!!window.__inkwave?.api', { timeout: 180000, polling: 250 });
  const js = <T>(c: string): Promise<T> => page.evaluate(c) as Promise<T>;
  const maps = await js<Array<{ id: string; layout: string }>>(`import('/src/config.js').then((m) => m.MAPS.map((x) => ({ id: x.id, layout: x.layout || x.id })))`);
  const todo = layouts.length ? layouts : [...new Set(maps.map((m) => m.layout))];
  for (const id of todo) {
    const [base, mode = 'turf'] = id.split('.');
    const map = maps.find((m) => m.layout === base);
    if (!map) { console.error(`[bake] no map uses layout "${id}"`); process.exitCode = 1; continue; }
    console.log(`[bake] ${id}: building world…`);
    await js(`window.__inkwave.api.startMatch({ mapId: '${map.id}', duration: 180, mode: '${mode}' })`);
    const wk = await js<string | null>('window.__inkwave.worldKey || null');
    if (wk && wk !== id) { console.error(`[bake] ${id}: this stage has no ${mode} variant (built ${wk}) — nothing to bake`); await js('window.__inkwave.quitToMenu()'); await wait(1200); continue; }
    await page.waitForFunction(`window.__inkwave.match?.state === 'intro' || window.__inkwave.match?.state === 'playing'`, { timeout: 120000, polling: 250 });
    await js('window.__inkwave.debug.freeze()');
    const t0 = Date.now();
    const r = await js<{ hash: string; used: number; png: string }>(PAGE_BAKE(OPTS));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, `${id}.png`), grayPNG(OPTS.size, Buffer.from(r.png, 'base64')));
    writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, hash: r.hash, size: OPTS.size, ppm: OPTS.ppm, rays: OPTS.rays, dist: OPTS.dist }));
    console.log(`[bake] ${id}: done in ${((Date.now() - t0) / 1000).toFixed(1)} s (hash ${r.hash}, ${r.used}/${OPTS.size} rows used)`);
    await js('window.__inkwave.debug.unfreeze(); window.__inkwave.quitToMenu()');
    await wait(1200);
  }
} catch (e) {
  console.error('[bake] failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
