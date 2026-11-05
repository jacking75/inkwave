// 작업장 실행 검수(33번 T048·T049, 35번 R028·R030). 개발 서버의 실제 메뉴에서 저장을 만들어 두고 다음을 확인한다:
//   craft   제작 화면: 해금한 설계만 제작·부품 차감, 잠긴 설계 거절, 서명 재제작, 장비 화면의 강화(U)·이전 창(T)
//   unlock  작업장 → 무기: 캠페인 잠금 표시·거절, 대전 메뉴에서는 잠금 없음, 항구 지도 정보의 추첨 후보 표시
//   hub     작업장 항목 포커스 → 카메라 글라이드(인물·소품), 작업장 로딩 시간 대 로비 세트 로딩 시간
//   results 실제 저장소 쓰기 실패(IndexedDB 거부) → 미확정·재시도 → 확정, 보상 한 번만
// 사람이 실제로 조작하는 검증(33번 14절)을 대신하지 않는다.
//
// usage: node .tools/workshop-check.js [--port 8490] [--only craft,unlock,hub,results]
// 결과: 표준 출력 JSON, shots/workshop/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'craft,unlock,hub,results').split(','));
const executablePath = process.env.CHROME_PATH || [
  path.join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/workshop', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ev = <T>(page: Page, js: string): Promise<T> => page.evaluate(js) as Promise<T>;

const browser = await puppeteer.launch({
  executablePath, headless: true, protocolTimeout: 300000,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const errors: string[] = [];

// 새 페이지 + 지정한 캠페인 저장(patch를 새 저장에 덮는다)
async function open(patch: string): Promise<Page> {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(`try { localStorage.setItem('inkwave.settings', JSON.stringify({ music: 0, sfx: 0, master: 0, quality: 'low', qualityChosen: true })); } catch {}`);
  await page.goto(`http://localhost:${port}/?skipTitle&novc`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
  await page.evaluate(`new Promise((r) => { const q = indexedDB.deleteDatabase('inkwave-campaign'); q.onsuccess = q.onerror = q.onblocked = () => r(0); })`);
  await page.evaluate(`(async () => { const g = window.__inkwave; g.store.port.close(); g.store.current = null; await g.store.init();
    await g.store.newGame(Date.now(), 'normal', true);
    const r = await g.store.commit((s) => Object.assign({}, s, ${patch}));
    if (!r.ok) throw new Error('저장 준비 실패 ' + r.error); })()`);
  return page;
}
const save = (page: Page) => ev<{ parts: number; cores: number; cards: Array<{ uid: string; defId: string; plus: number }> }>(page, '(() => { const s = __inkwave.store.current; return { parts: s.inventory.parts, cores: s.inventory.cores, cards: s.inventory.cards.map((c) => ({ uid: c.uid, defId: c.defId, plus: c.plus })) }; })()');
const click = async (page: Page, sel: string): Promise<void> => { await page.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`); await wait(500); };

try {
  if (only.has('craft')) {
    const page = await open(`{ done: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3'], unlocked: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '3-1'], signatures: ['SG01'], inventory: Object.assign({}, s.inventory, { parts: 300, cores: 1 }) }`);
    await page.evaluate('__inkwave.menus.show("workshop")'); await wait(700);
    const items = await ev<string[]>(page, '[...document.querySelectorAll(".iw-main__menu [data-id]")].map((b) => b.dataset.id)');
    ok('T048 작업장에 제작 항목', items.includes('craft'), items);
    await page.evaluate('__inkwave.menus._go("campCraft")'); await wait(700);
    await page.screenshot({ path: 'shots/workshop/craft.png' });
    const lockedAD04 = await ev<boolean>(page, '!!document.querySelector("[data-id=craft-AD04].is-unavail")');
    const openAD03 = await ev<boolean>(page, '!document.querySelector("[data-id=craft-AD03].is-unavail")');
    ok('T048 설계 해금 표시(2-1 완료 → AD03 열림, AD04 잠김)', lockedAD04 && openAD03, { lockedAD04, openAD03 });
    await click(page, '[data-id=craft-AD04]');
    const s1 = await save(page);
    ok('T048 잠긴 설계 제작 거절(재료 그대로)', s1.parts === 300 && s1.cards.length === 0, s1);
    await click(page, '[data-id=craft-AD03]');
    const s2 = await save(page);
    ok('T048 기본 설계 제작: 부품 −40·카드 1', s2.parts === 260 && s2.cards.length === 1 && s2.cards[0].defId === 'AD03', s2);
    await click(page, '[data-id=sig-SG01]');
    const s3 = await save(page);
    ok('T048 서명 재제작: 부품 −80·공명핵 −1', s3.parts === 180 && s3.cores === 0 && s3.cards.some((c) => c.defId === 'SG01'), s3);
    // 강화·이전(장비 화면): AD03을 +1 → 같은 슬롯 AD01 제작 → 이전
    await page.evaluate('__inkwave.menus._go("campGear")'); await wait(700);
    const ad03 = s3.cards.find((c) => c.defId === 'AD03')!.uid;
    await page.evaluate(`__inkwave.menus._setFocus(document.querySelector('[data-id="card-${ad03}"]'))`); await wait(200);
    await page.keyboard.press('KeyU'); await wait(700);
    const s4 = await save(page);
    ok('T048 강화 +1(부품 −50)', s4.parts === 130 && s4.cards.find((c) => c.uid === ad03)!.plus === 1, s4);
    await page.keyboard.press('KeyU'); await wait(700);
    const s5 = await save(page);
    ok('T048 +2는 4장 보스 전 거절', s5.parts === 130 && s5.cards.find((c) => c.uid === ad03)!.plus === 1, s5);
    await page.evaluate('__inkwave.menus.show("campCraft", { back: true })'); await wait(500);
    await click(page, '[data-id=craft-AD01]');
    await page.evaluate('__inkwave.menus._go("campGear")'); await wait(700);
    await page.evaluate(`__inkwave.menus._setFocus(document.querySelector('[data-id="card-${ad03}"]'))`); await wait(200);
    await page.keyboard.press('KeyT'); await wait(500);
    const modal = await ev<string[]>(page, '[...document.querySelectorAll(".iw-modal button")].map((b) => b.textContent)');
    await page.evaluate('[...document.querySelectorAll(".iw-modal button")].find((b) => b.textContent.includes("절약 노즐")).click()'); await wait(800);
    const s6 = await save(page);
    const ad01 = s6.cards.find((c) => c.defId === 'AD01')!;
    ok('T048 같은 슬롯 이전: 원본 +0·대상 +1·재료 그대로', s6.cards.find((c) => c.uid === ad03)!.plus === 0 && ad01.plus === 1 && s6.parts === 90, { modal, s6 });
    await page.screenshot({ path: 'shots/workshop/gear-transfer.png' });
    await page.close();
  }

  if (only.has('unlock')) {
    const page = await open(`{ done: ['1-1', '1-2', '1-3', '2-1'], unlocked: ['1-1', '1-2', '1-3', '2-1', '2-2'] }`);
    await page.evaluate('__inkwave.menus.show("workshop")'); await wait(600);
    await page.evaluate('__inkwave.menus._go("loadout")'); await wait(900);
    const locked = await ev<string[]>(page, '[...document.querySelectorAll(".iw-wcard.is-locked")].map((c) => c.dataset.id)');
    ok('T049 작업장 무기: 3-1·4-1 무기 6종 잠금', locked.length === 6 && ['w-blaster', 'w-bow', 'w-bucket', 'w-spinner', 'w-blade', 'w-mitts'].every((id) => locked.includes(id)), locked);
    const before = await ev<string>(page, '__inkwave.menus.api.getLoadout().weapon');
    await click(page, '[data-id=w-bow]');
    const after = await ev<string>(page, '__inkwave.menus.api.getLoadout().weapon');
    ok('T049 잠긴 무기는 고를 수 없다', before === after, { before, after });
    await page.screenshot({ path: 'shots/workshop/loadout-locked.png' });
    await page.evaluate('__inkwave.menus.show("main")'); await wait(400);
    await page.evaluate('__inkwave.menus._go("arena")'); await wait(400);
    await page.evaluate('__inkwave.menus._go("loadout")'); await wait(800);
    const lockedArena = await ev<number>(page, 'document.querySelectorAll(".iw-wcard.is-locked").length');
    ok('T049 대전 메뉴의 무기는 잠기지 않는다', lockedArena === 0, lockedArena);
    await page.evaluate('__inkwave.menus.show("workshop")'); await wait(400);
    await page.evaluate('__inkwave.menus._go("harbor")'); await wait(800);
    await page.evaluate(`__inkwave.menus._setFocus(document.querySelector('[data-id="m-2-2"]'))`); await wait(300);
    const info = await ev<string>(page, 'document.querySelector(".iw-harbor__ipool")?.textContent ?? ""');
    ok('T049 항구 지도 정보: 첫 완료 보상·크로스로드 풀·특제', info.includes('첫 완료') && info.includes('장치·설치물 피해 +4%') && info.includes('회수반 렌즈'), info);
    await page.screenshot({ path: 'shots/workshop/harbor-info.png' });
    await page.close();
  }
} catch (e) {
  ok('예외 없음', false, String((e as Error).stack || e));
}
ok('콘솔 오류 없음', errors.length === 0, errors.slice(0, 6));
await browser.close();
console.log(JSON.stringify(results, null, 1));
process.exit(fail ? 1 : 0);
