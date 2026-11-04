// 표정 검수(35번 R011·R014): 라커의 ?castcheck 패널로 플레이어·모라·틸에게 같은 사건을 걸고 얼굴을 찍는다.
// 같은 사건에서 인물마다 다른 표정·대사가 나오는지, 모라·틸의 외형(의상·모자 대체안)과 새 프리셋 3종을 사람이 본다.
//
// usage: node .tools/cast-check.js [--port 8490] [--events kill,hurt,perfect]
// 결과: shots/cast/<인물>-<사건>.png, shots/cast/preset-<id>.png, 표준 출력 JSON(사건별 대사)
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const events = opt('events', 'kill,hurt,perfect,lowHp').split(',');
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/cast', { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const out: Record<string, unknown> = {};
const errors: string[] = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?castcheck&skipTitle`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await page.evaluate('__inkwave.menus._go("locker")');
  await page.waitForSelector('.iw-castcheck button', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  // 얼굴이 크게 보이도록 받침대 카메라 앞만 찍는다(라커 화면 오른쪽)
  const clip = { x: 640, y: 40, width: 640, height: 520 };
  for (const cast of ['player', 'mora', 'teal']) {
    await page.click(`.iw-castcheck [data-cast="${cast}"]`);
    await new Promise((r) => setTimeout(r, 2600));   // 외형 교체 애니메이션
    for (const ev of events) {
      await page.click(`.iw-castcheck [data-react="${ev}"]`);
      await new Promise((r) => setTimeout(r, 350));   // 반응 표정의 유지 구간
      out[`${cast}:${ev}`] = await page.evaluate('document.querySelector(".iw-castcheck__line").textContent');
      await page.screenshot({ path: `shots/cast/${cast}-${ev}.png`, clip });
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  // 새 프리셋 3종: 표의 스타일로 받침대를 바꿔 찍는다(저장 프로필은 건드리지 않는다)
  const presets = await page.evaluate(`import('/src/game/character-style.js').then((m) => m.PRESETS.slice(-3).map((p) => ({ id: p.id, style: p.style })))`) as Array<{ id: string; style: object }>;
  for (const p of presets) {
    await page.evaluate(`__inkwave.showcase.castCheck(null); __inkwave.showcase.showLocker(${JSON.stringify(p.style)}, null)`);
    await new Promise((r) => setTimeout(r, 2600));
    await page.screenshot({ path: `shots/cast/preset-${p.id}.png`, clip });
  }
  out.presets = presets.map((p) => p.id);
  // 잔향 대장(바리): 무채색 + 빨간 완장(끈 색 슬롯) + 이마 표식, 대장 무기(우산)
  await page.evaluate(`__inkwave.showcase.castCheck(null); __inkwave.showcase.showLocker({ hair: 4, skin: 2, outfit: 0, eyes: 0, hat: 0, brows: 1 }, null, 'brolly')`);
  await new Promise((r) => setTimeout(r, 2600));
  await page.evaluate(`import('/src/game/cast/cast.js').then((m) => { const d = m.ECHO_LEADERS.find((x) => x.id === 'bari'); __inkwave.showcase.castCheck('captain', null, m.echoSpecOf(d)); })`);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: 'shots/cast/captain-bari.png', clip });
  // 라커에서 새 프리셋을 입으면 프로필에 저장되고 새로고침 뒤에도 그대로인지(저장·복원)
  await page.evaluate('__inkwave.showcase.castCheck(null)');
  const tile = await page.evaluateHandle(`[...document.querySelectorAll('.iw-ltile')].find((t) => /Coral Jr\./.test(t.textContent || ''))`);
  const el = tile.asElement() as import('puppeteer-core').ElementHandle<Element> | null;
  if (el) { await el.click(); await new Promise((r) => setTimeout(r, 400)); }
  const saved = await page.evaluate(`JSON.parse(localStorage.getItem('inkwave.profile') || '{}').style || null`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__inkwave && __inkwave.profile', { timeout: 180000, polling: 250 });
  const restored = await page.evaluate('__inkwave.profile.style || null');
  out.presetSave = { tileFound: !!el, saved, restored, same: JSON.stringify(saved) === JSON.stringify(restored) };
} finally {
  await browser.close();
}
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
if (errors.length) process.exit(1);
