// 귀여운 비율 검수(35번 R010): character-lab에서 머리 뼈 스케일을 걸고 12종 무기 사격 자세(옆)와 모자·머리 조합(앞)을
// 찍는다. 랩은 Character를 노출하지 않으므로 같은 모듈의 prototype.update를 감싸 머리 스케일을 매 프레임 건다
// (게임은 src/game/cast/proportion.ts가 생성 직후 한 번 건다 — 포즈 적용이 머리 scale을 쓰지 않으므로 결과는 같다).
//
// usage: node .tools/head-check.js [--port 8490] [--scale 1.16] [--tag cute]
// 결과: shots/head/<tag>-w-<weapon>.png, shots/head/<tag>-s-<hat>-<hair>.png
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490'), scale = Number(opt('scale', '1.16')), tag = opt('tag', 'cute');
const WEAPONS = ['shooter', 'twins', 'brolly', 'blaster', 'spinner', 'charger', 'bow', 'roller', 'brush', 'blade', 'mitts', 'bucket'];

const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');

mkdirSync('shots/head', { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 900, height: 900, deviceScaleFactor: 1 } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://localhost:${port}/tools/character-lab.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.lab && typeof window.lab.go === "function"', { timeout: 120000 });
  await page.evaluate(`import('/src/game/character.js').then(({ Character }) => {
    const u = Character.prototype.update;
    Character.prototype.update = function (...a) { if (this.bones && this.bones.head) this.bones.head.scale.setScalar(${scale}); return u.apply(this, a); };
  })`);
  // 랩 UI 패널을 가려 캐릭터만 보이게 한다
  await page.addStyleTag({ content: 'body > div:not(:has(canvas)) { display: none !important; }' });
  for (const w of WEAPONS) {
    const o = { weapon: w, autoFire: true, chargeRamp: w === 'charger' || w === 'spinner' || w === 'bow', t: 0.9, cam: 'side', state: { firing: true, aimPitch: 0.1 } };
    await page.evaluate(`window.lab.go(${JSON.stringify(o)})`);
    await page.screenshot({ path: `shots/head/${tag}-w-${w}.png` });
  }
  // 잠수·벽타기·점프(자세 전환이 머리 스케일과 충돌하지 않는지)
  const poses: Array<[string, object]> = [
    ['squid', { form: 'squid', cam: 'side', t: 0.8 }], ['swim', { form: 'swim', cam: 'side', t: 0.8 }],
    ['climb', { form: 'climb', cam: 'side', t: 0.8 }], ['jump', { jumpAt: 0.3, t: 0.55, cam: 'side' }],
    ['land', { jumpAt: 0.2, t: 1.1, cam: 'side' }], ['dodge', { weapon: 'twins', trig: 'dodge', t: 0.15, cam: 'front' }],
  ];
  for (const [n, o] of poses) {
    await page.evaluate(`window.lab.go(${JSON.stringify(o)})`);
    await page.screenshot({ path: `shots/head/${tag}-p-${n}.png` });
  }
  for (let hat = 0; hat < 4; hat++) for (let hair = 0; hair < 8; hair++) {
    await page.evaluate(`window.lab.go(${JSON.stringify({ style: { hat, hair }, cam: 'front', t: 0.5 })})`);
    await page.screenshot({ path: `shots/head/${tag}-s-${hat}-${hair}.png` });
  }
  console.log('head-check done', tag, scale);
} finally {
  await browser.close();
}
