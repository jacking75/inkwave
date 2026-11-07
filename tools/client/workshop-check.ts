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
  if (only.has('hub')) {
    // 로딩 시간: 새 페이지에서 로비 세트(온라인 허브)와 작업장(같은 세트 + 모라·틸)의 내용이 준비되기까지
    const loadTime = async (screen: 'online' | 'workshop'): Promise<number> => {
      const page = await open('{}');
      const ms = await ev<number>(page, `(async () => {
        const g = __inkwave, t0 = performance.now();
        g.menus.show(${JSON.stringify(screen)});
        const ready = () => { const L = g.showcase.lob; if (!L || !L.set) return false; /* 페이드 L.k는 프레임 수로 오른다: headless 저프레임에서 시간 비교를 흐리므로 내용 준비만 잰다 */ if (${JSON.stringify(screen)} !== 'workshop') return true; const W = g.showcase._ws; return !!W && W.chars.size === 2 && [...W.chars.values()].every((c) => c.root.visible); };
        while (!ready()) { if (performance.now() - t0 > 60000) return -1; await new Promise((r) => requestAnimationFrame(r)); }
        return performance.now() - t0;
      })()`);
      await page.close();
      return ms;
    };
    const tLobby = await loadTime('online'), tWs = await loadTime('workshop');
    ok('R028 작업장 로딩 ≤ 로비 세트 + 1초', tWs > 0 && tLobby > 0 && tWs <= tLobby + 1000, { lobbyMs: Math.round(tLobby), workshopMs: Math.round(tWs) });
    // 글라이드: 장비(모라) → 임무(틸)로 포커스를 옮기면 시선이 그 인물 쪽으로 옮겨 가고 카메라 몸체는 제자리이다
    const page = await open(`{ done: ['1-1'], unlocked: ['1-1', '1-2'] }`);
    await page.evaluate('__inkwave.menus.show("workshop")');
    await page.waitForFunction('__inkwave.showcase._ws && __inkwave.showcase._ws.chars.size === 2', { timeout: 60000, polling: 200 });
    const aim = async (id: string, who: string): Promise<{ who: string; fk: number; dMora: number; dTeal: number; camPos: number[] }> => {
      await page.evaluate(`__inkwave.menus._setFocus(document.querySelector('[data-id="${id}"]'))`);
      // 글라이드는 프레임 dt로 수렴한다: 저프레임 headless에서는 고정 대기 대신 대상이 바뀌고 수렴할 때까지 기다린 뒤 조금 더 둔다
      await page.waitForFunction(`__inkwave.showcase._ws.focus === '${who}' && __inkwave.showcase._ws.fk > 0.9`, { timeout: 15000, polling: 100 }).catch(() => undefined);
      await wait(1500);
      return ev(page, `(() => { const sc = __inkwave.showcase, L = sc.lob, W = sc._ws, cam = L.cam, V = cam.position.constructor;
        const dir = new V(0, 0, -1).applyQuaternion(cam.quaternion);
        const off = (c) => { const p = c.root.position.clone(); p.y += 0.9; const v = p.sub(cam.position); const along = v.dot(dir); return Math.sqrt(Math.max(0, v.lengthSq() - along * along)); };
        return { who: W.focus, fk: +W.fk.toFixed(3), dMora: +off(W.chars.get('mora')).toFixed(3), dTeal: +off(W.chars.get('teal')).toFixed(3), camPos: cam.position.toArray().map((x) => +x.toFixed(3)) }; })()`);
    };
    const gMora = await aim('craft', 'mora'), gTeal = await aim('mission', 'teal');   // (제작·특성 → 모라, 무기·모듈 → 장비대)
    ok('R028 포커스 인물 쪽으로 글라이드(시선 축과 인물 거리 감소)', gMora.who === 'mora' && gTeal.who === 'teal' && gMora.fk > 0.9 && gMora.dMora < gTeal.dMora && gTeal.dTeal < gMora.dTeal, { gMora, gTeal });
    ok('R028 카메라 몸체는 세트 자리 그대로', JSON.stringify(gMora.camPos) === JSON.stringify(gTeal.camPos), [gMora.camPos, gTeal.camPos]);
    await page.screenshot({ path: 'shots/workshop/hub-teal.png' });
    // 진입: 임무·장비·특성·기록
    const go = async (id: string): Promise<string> => { await page.evaluate('__inkwave.menus.show("workshop")'); await wait(500); await page.evaluate(`document.querySelector('[data-id="${id}"]').click()`); await wait(700); return ev<string>(page, '__inkwave.menus.current'); };
    const dest = { mission: await go('mission'), modules: await go('modules'), perks: await go('perks'), records: await go('records'), craft: await go('craft') };
    ok('R028 임무·장비·특성·기록·제작 진입', JSON.stringify(dest) === JSON.stringify({ mission: 'harbor', modules: 'campGear', perks: 'campTraits', records: 'records', craft: 'campCraft' }), dest);
    await page.close();
  }

  if (only.has('results')) {
    // 실제 저장소 쓰기 거부: IndexedDB put이 한 번 QuotaExceededError를 던진다 → 미확정·재시도 → 확정, 보상은 한 번만
    const page = await open(`{}`);
    await page.evaluate(`(() => { const put = IDBObjectStore.prototype.put; let n = 0; window.__failPut = 1;
      IDBObjectStore.prototype.put = function (...a) { if (window.__failPut > 0 && a[1] === 'save') { window.__failPut--; n++; throw new DOMException('quota', 'QuotaExceededError'); } return put.apply(this, a); }; })()`);
    const before = await ev<{ xp: number; parts: number; rev: number }>(page, '({ xp: __inkwave.store.current.xp, parts: __inkwave.store.current.inventory.parts, rev: __inkwave.store.current.revision })');
    await page.evaluate(`(async () => { const g = __inkwave, defs = await import('/src/campaign/definitions.js');
      g.store.current.inProgress = null;
      void g._campaignResults({ mission: defs.getMission('1-1'), runId: 'wscheck-run', crateOpened: false }); })()`);
    await page.waitForFunction('__inkwave.menus.current === "storyResults" && document.querySelector(".iw-sres") && document.querySelector(".iw-sres").dataset.saved === "fail"', { timeout: 60000, polling: 200 });
    const s1 = await ev<{ saved: string; retry: boolean; xp: number }>(page, '({ saved: document.querySelector(".iw-sres").dataset.saved, retry: !document.querySelector(".iw-sres__retry").classList.contains("is-off"), xp: __inkwave.store.current.xp })');
    ok('R030 실제 저장 실패 → 미확정·재시도·저장 변화 없음', s1.saved === 'fail' && s1.retry && s1.xp === before.xp, s1);
    await page.screenshot({ path: 'shots/workshop/results-fail.png' });
    await page.evaluate('document.querySelector(".iw-sres__retry").click()');
    await page.waitForFunction('document.querySelector(".iw-sres").dataset.saved === "ok"', { timeout: 30000, polling: 200 });
    await page.evaluate('document.querySelector(".iw-sres__retry").click()');   // 숨은 버튼을 한 번 더 눌러도(연타) 두 번 지급하지 않는다
    await wait(800);
    const s2 = await ev<{ xp: number; parts: number; rev: number; done: string[] }>(page, '({ xp: __inkwave.store.current.xp, parts: __inkwave.store.current.inventory.parts, rev: __inkwave.store.current.revision, done: __inkwave.store.current.done })');
    ok('R030 재시도 → 확정, 보상 한 번(경험치 +600·부품 +60)', s2.xp === before.xp + 600 && s2.parts === before.parts + 60 && s2.done.includes('1-1'), { before, s2 });
    await page.screenshot({ path: 'shots/workshop/results-ok.png' });
    await page.close();
  }
} catch (e) {
  ok('예외 없음', false, String((e as Error).stack || e));
}
ok('콘솔 오류 없음', errors.length === 0, errors.slice(0, 6));
await browser.close();
console.log(JSON.stringify(results, null, 1));
process.exit(fail ? 1 : 0);
