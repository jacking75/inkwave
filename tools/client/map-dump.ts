// 지도 높이·이동 그래프 덤프(33번 T023 배치 작업용). 개발 서버에서 연습 경기를 열어 물리 블록을 위에서 내려 쏜 높이와
// 이동 그래프(nav) 노드를 위에서 본 그림(PNG)으로 남긴다. 캠페인 배치 좌표를 정할 때와 배치 검수 그림에 쓴다.
//
// usage: node .tools/map-dump.js [--port 8490] [--map tidewater] [--mission 1-1] [--px 8]
//   --mission: 그 임무의 배치(시작·목표·CP·적·구역)를 겹쳐 그린다.
// 결과: shots/map/<map>[-<mission>].png
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), map = opt('map', 'tidewater'), mission = opt('mission', ''), PX = Number(opt('px', '8'));
const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/map', { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 600000, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await page.evaluate(`__inkwave.startPractice({ mapId: '${map}' })`);
  await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
  const png = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const G = window.__G, PX = ${PX};
    const b = G.level.bounds || { minX: -30, maxX: 30, minZ: -50, maxZ: 50 };
    const x0 = Math.floor(b.minX) - 2, x1 = Math.ceil(b.maxX) + 2, z0 = Math.floor(b.minZ) - 2, z1 = Math.ceil(b.maxZ) + 2, S = 0.5;
    const W = Math.round((x1 - x0) / S), H = Math.round((z1 - z0) / S);
    const c = document.createElement('canvas'); c.width = W * PX / 2 + 60; c.height = H * PX / 2 + 40;
    const g = c.getContext('2d'); g.fillStyle = '#123'; g.fillRect(0, 0, c.width, c.height);
    const o = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0);
    const X = (x) => 40 + (x - x0) / S * PX / 2, Z = (z) => 20 + (z - z0) / S * PX / 2;
    for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
      const x = x0 + (i + 0.5) * S, z = z0 + (j + 0.5) * S;
      o.set(x, 30, z);
      const h = G.physics.raycast(o, d, 40);
      if (!h.hit) continue;
      const y = 30 - h.dist;
      if (y < -1.5) { g.fillStyle = '#1c3d5a'; }
      else { const t = Math.max(0, Math.min(1, (y + 0.5) / 6)); g.fillStyle = 'hsl(' + (120 - t * 120) + ',55%,' + (35 + t * 30) + '%)'; }
      g.fillRect(X(x - S / 2), Z(z - S / 2), PX / 2, PX / 2);
    }
    // 이동 그래프 노드
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const n of G.nav.nodes) g.fillRect(X(n.x) - 1, Z(n.z) - 1, 2, 2);
    // 5 m 격자와 좌표
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.fillStyle = '#fff'; g.font = '11px sans-serif';
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) { g.beginPath(); g.moveTo(X(x), Z(z0)); g.lineTo(X(x), Z(z1)); g.stroke(); g.fillText(String(x), X(x) - 6, 14); }
    for (let z = Math.ceil(z0 / 5) * 5; z <= z1; z += 5) { g.beginPath(); g.moveTo(X(x0), Z(z)); g.lineTo(X(x1), Z(z)); g.stroke(); g.fillText(String(z), 2, Z(z) + 4); }
    // 임무 배치 겹쳐 그리기
    const mid = ${JSON.stringify(mission)};
    if (mid) {
      const defs = await import('/src/campaign/definitions.js');
      const m = defs.getMission(mid);
      const dot = (p, col, r, label) => { g.fillStyle = col; g.beginPath(); g.arc(X(p[0]), Z(p[2]), r, 0, 7); g.fill(); if (label) { g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText(label, X(p[0]) + r + 2, Z(p[2]) + 4); } };
      for (const s of m.segments) { if (!s.bounds) continue; g.strokeStyle = 'rgba(255,255,0,.6)'; g.strokeRect(X(s.bounds[0]), Z(s.bounds[2]), X(s.bounds[1]) - X(s.bounds[0]), Z(s.bounds[3]) - Z(s.bounds[2])); g.fillStyle = '#ff0'; g.fillText(s.id, X(s.bounds[0]) + 3, Z(s.bounds[2]) + 12); }
      dot(m.start.at, '#0f0', 6, 'S');
      for (const d of m.devices) dot(d.at, d.kind === 'crate' ? '#fd0' : '#0ff', 6, d.id);
      for (const cp of m.checkpoints) dot(cp.at, '#f0f', 5, cp.id);
      for (const e of m.encounters) for (const w of e.waves) for (const u of w.units) dot(u.at, '#f44', 4, u.role[0]);
    }
    // 높이 격자(1 m)·이동 그래프 노드: 배치 좌표를 수치로 고를 때 쓴다(shots/map/<map>.json)
    const grid = [];
    for (let z = Math.ceil(z0); z <= z1; z++) { const row = []; for (let x = Math.ceil(x0); x <= x1; x++) { o.set(x, 30, z); const h = G.physics.raycast(o, d, 40); row.push(h.hit ? Math.round((30 - h.dist) * 10) / 10 : null); } grid.push(row); }
    window.__dumpJson = JSON.stringify({ x0: Math.ceil(x0), z0: Math.ceil(z0), grid, nav: G.nav.nodes.map((n) => [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10, Math.round(n.z * 10) / 10]) });
    return c.toDataURL('image/png').split(',')[1];
  })()`) as string;
  writeFileSync(`shots/map/${map}.json`, await page.evaluate('window.__dumpJson') as string);
  const out = `shots/map/${map}${mission ? '-' + mission : ''}.png`;
  writeFileSync(out, Buffer.from(png, 'base64'));
  console.log(out);
} finally { await browser.close().catch(() => {}); }
