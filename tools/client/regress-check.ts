// 기존 모드 회귀 검수(35번 R034). 개발 서버에 headless Chrome으로 붙어 그림책 룩(기본)에서
//   (2) 대전·구역·보스를 자동 조종(?autopilot)으로 한 판씩 끝까지(결과 화면) 진행하고 콘솔 오류가 없는지,
//   (3) 온라인 ?netmock=1: 항구 대전 → 온라인 → 방 만들기 → 로비 → 시작 → 경기 단계 → 로비 복귀,
//   (4) 캠페인(이야기 임무) 종료 뒤 G.campaign null·actor.tune === PLAYER·색 회복 없음·액션 이벤트 없음,
//   (5) 이전 형식 저장값(inkwave.profile·inkwave.settings, 새 키 없음)으로 부팅해 값이 보존되고 새 키는 기본값인지 본다.
// (1) 원본 룩 화소 비교는 classic-diff.ts·pixel-diff.ts가 한다.
//
// usage: node .tools/regress-check.js [--port 8490] [--only matches,practice,online,campaign,save] [--len 50]
// 결과: 표준 출력 JSON, shots/regress/*.png. 실패 항목이 있으면 종료 코드 1이다.
import puppeteer, { type Page } from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k: string, d: string): string => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const port = opt('port', '8490');
const only = new Set(opt('only', 'matches,practice,online,campaign,save').split(','));
const len = Number(opt('len', '50'));
const executablePath = process.env.CHROME_PATH || [
  `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
].find((p) => p && existsSync(p));
if (!executablePath) throw new Error('CHROME_PATH로 Chrome 실행 파일을 지정해야 한다.');
mkdirSync('shots/regress', { recursive: true });

const results: Record<string, unknown> = {};
let fail = 0;
const ok = (k: string, pass: boolean, v?: unknown): void => { results[k] = { pass, ...(v !== undefined ? { v } : {}) }; if (!pass) fail++; };
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});

async function open(query: string, init?: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(`http://localhost:${port}/?skipTitle${query}`, { waitUntil: 'load', timeout: 180000 });
  return { page, errors };
}

try {
  // ---------------------------------------------------------------- (2) 대전·구역·보스 한 판씩
  if (only.has('matches')) {
    for (const [mode, map] of [['turf', 'tidewater'], ['zones', 'kelpline'], ['boss', 'tidewater']] as const) {
      const { page, errors } = await open(`&autostart=${len}&mode=${mode}&map=${map}&autopilot`);
      const t0 = Date.now();
      await page.waitForFunction('window.__inkwave && __inkwave.match && !__inkwave.match.attract', { timeout: 180000, polling: 500 });
      // 결과 화면까지(보스전은 길이가 설정값이라 시간 제한 안에 끝나지 않으면 남은 시간을 줄여 끝낸다)
      let natural = true;
      // 구역 쟁탈은 경기 길이가 고정 5분 + 연장(최대 ZONES.overtimeMax)이라 요청 길이를 쓰지 않는다. 헤드리스는 프레임이 느려
      // 시뮬레이션 시간이 실시간보다 늦게 가므로 넉넉히 기다린다
      const limit = mode === 'zones' ? 720 : len + 150;
      const reached = await page.waitForFunction('__inkwave.menus && __inkwave.menus.current === "results"', { timeout: limit * 1000, polling: 1000 }).then(() => true, () => false);
      if (!reached) { natural = false; await page.evaluate('__inkwave.debug.endMatch(0.5)'); }
      const done = reached || await page.waitForFunction('__inkwave.menus && __inkwave.menus.current === "results"', { timeout: 120000, polling: 1000 }).then(() => true, () => false);
      const info = await page.evaluate('({ mode: __inkwave.match && __inkwave.match.mode, state: __inkwave.match && __inkwave.match.state, look: __inkwave.settings.look, style: !!__inkwave.R.style, campaign: !!(window.__G && window.__G.campaign) })') as Record<string, unknown>;
      await page.screenshot({ path: `shots/regress/${mode}-results.png` });
      ok(`match.${mode}`, done && info.mode === mode && info.look === 'storybook' && info.style === true && info.campaign === false && errors.length === 0, { ...info, natural, seconds: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 5) });
      await page.close();
    }
  }

  // ---------------------------------------------------------------- (2') 연습: 항구 대전 → LOADOUT → 연습 버튼(메뉴 경로)
  if (only.has('practice')) {
    const { page, errors } = await open('');
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate('__inkwave.menus._go("arena")'); await wait(500);
    await page.keyboard.press('ArrowDown'); await wait(200); await page.keyboard.press('ArrowDown'); await wait(200);
    const onLoadoutBtn = await page.evaluate('__inkwave.menus._focus && __inkwave.menus._focus.dataset.id');
    await page.keyboard.press('Enter'); await wait(1200);
    const onLoadout = await page.evaluate('__inkwave.menus.current');
    await page.evaluate('__inkwave.menus._setFocus(document.querySelector("[data-id=\\"practice\\"]"))'); await wait(200);
    await page.keyboard.press('Enter');
    const started = await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.practice && __inkwave.match.state === "playing"', { timeout: 180000, polling: 500 }).then(() => true, () => false);
    await wait(2000);
    const st = await page.evaluate('({ campaign: !!window.__G.campaign, preview: !!__inkwave.campaignPreview, foes: __inkwave.match.actors.length })');
    await page.screenshot({ path: 'shots/regress/practice.png' });
    ok('practice.menuPath', onLoadoutBtn === 'loadout' && onLoadout === 'loadout' && started && JSON.stringify(st) === JSON.stringify({ campaign: false, preview: false, foes: 1 }) && errors.length === 0, { onLoadoutBtn, onLoadout, started, st, errors: errors.slice(0, 5) });
    await page.close();
  }

  // ---------------------------------------------------------------- (3) 온라인 netmock: 로비 진입·경기 시작·로비 복귀
  if (only.has('online')) {
    const { page, errors } = await open('&netmock=1&mockauto=0');
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate('__inkwave.menus._go("arena")'); await wait(400);
    await page.evaluate('__inkwave.menus._go("online")'); await wait(1500);
    const onOnline = await page.evaluate('__inkwave.menus.current');
    await page.keyboard.press('Enter');   // 방 만들기(첫 포커스)
    const lobby = await page.waitForFunction('__inkwave.menus.current === "lobby" && window.__G.net && window.__G.net.state === "lobby"', { timeout: 30000, polling: 250 }).then(() => true, () => false);
    await wait(2500);
    await page.screenshot({ path: 'shots/regress/online-lobby.png' });
    // 혼자인 방의 방장: 시작 → starting → match
    await page.evaluate('window.__G.net.start()');
    const match = await page.waitForFunction('window.__G.net.state === "match"', { timeout: 30000, polling: 250 }).then(() => true, () => false);
    await page.screenshot({ path: 'shots/regress/online-match.png' });
    const during = await page.evaluate('({ mode: window.__G.mode, screen: __inkwave.menus.current, match: !!(__inkwave.match && !__inkwave.match.attract) })');
    await page.evaluate('window.__G.net.mock.endMatch()');
    const back = await page.waitForFunction('window.__G.net.state === "lobby"', { timeout: 30000, polling: 250 }).then(() => true, () => false);
    ok('online.netmock', onOnline === 'online' && lobby && match && back && errors.length === 0, { onOnline, lobby, match, during, back, errors: errors.slice(0, 5) });
    await page.close();
  }

  // ---------------------------------------------------------------- (4) 이야기 임무 → 메뉴 → 일반 대전: 캠페인 효과가 남지 않는다
  if (only.has('campaign')) {
    const { page, errors } = await open('');
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    await page.evaluate('__inkwave.story.start("1-1", false)');
    await page.waitForFunction('__inkwave.campaignPreview && window.__G.campaign', { timeout: 180000, polling: 250 });
    await wait(1500);
    const inStory = await page.evaluate('({ campaign: !!window.__G.campaign, tuned: window.__G.local.tune !== undefined })') as { campaign: boolean; tuned: boolean };
    await page.evaluate('__inkwave.quitToMenu()'); await wait(1500);
    await page.evaluate(`(async () => {
      const ctx = await import('/src/core/ctx.js'); window.__acts = 0;
      for (const n of ['action:perfectDive', 'action:surge', 'action:wave', 'action:finish', 'enemy:stagger', 'fx:hitstop', 'story:line', 'cast:say']) ctx.on(n, () => window.__acts++);
      __inkwave.api.startMatch({ mapId: 'tidewater', mode: 'turf', duration: 60, difficulty: 'normal' });
    })()`);
    await page.waitForFunction('__inkwave.match && !__inkwave.match.attract && __inkwave.match.state === "playing"', { timeout: 180000, polling: 250 });
    // 처치·피격을 일으켜 본다
    const after = await page.evaluate(`(async () => {
      const G = window.__G, me = G.local, cfg = await import('/src/config.js');
      const foes = G.match.actors.filter((a) => a.team !== me.team);
      for (const f of foes.slice(0, 2)) { f.invuln = 0; f.damage(999, me, 'weapon'); }
      me.invuln = 0; me.damage(20, foes[2] || null, 'weapon');
      await new Promise((r) => setTimeout(r, 1500));
      return { campaign: G.campaign, allDefault: G.match.actors.every((a) => a.tune === cfg.PLAYER), colorReturn: __inkwave.R._colorReturn, preview: __inkwave.campaignPreview, actions: window.__acts, rigProfile: __inkwave.rig.profile };
    })()`);
    ok('campaign.cleanup', JSON.stringify(after) === JSON.stringify({ campaign: null, allDefault: true, colorReturn: null, preview: null, actions: 0, rigProfile: null }) && inStory.campaign && errors.length === 0, { inStory, after, errors: errors.slice(0, 5) });
    await page.close();
  }

  // ---------------------------------------------------------------- (5) 이전 형식 저장값
  if (only.has('save')) {
    // 리디자인 전(cf5ad23) 기본 설정의 모양: look·halftone·speechBubbles·mascot·reduceMotion·koreanVoice·outlineWidth 키가 없다.
    // (fov는 원본 빌드도 부팅 때 82로 되돌리므로 비교에서 뺀다: 원본·현재 빌드에서 같은 이전 결과를 확인했다)
    const oldSettings = { quality: 'medium', master: 0.6, music: 0.3, sfx: 0.7, sensitivity: 1.4, invertY: true, difficulty: 'hard', matchLength: 90, lastStage: 'kelpline', colorblind: true };
    const oldProfile = { name: 'OldTimer', xp: 1234, level: 4, wins: 7, matches: 12, weapon: 'roller', style: { hair: 2, skin: 3, outfit: 4, eyes: 1, hat: 1, brows: 0 } };
    const init = `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('inkwave.settings', ${JSON.stringify(JSON.stringify(oldSettings))}); localStorage.setItem('inkwave.profile', ${JSON.stringify(JSON.stringify(oldProfile))}); }`;
    const { page, errors } = await open('', init);
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    const r = await page.evaluate(`(() => {
      const s = __inkwave.settings, p = __inkwave.profile, old = ${JSON.stringify(oldSettings)}, op = ${JSON.stringify(oldProfile)};
      const kept = Object.keys(old).every((k) => JSON.stringify(s[k]) === JSON.stringify(old[k]));
      const keptP = ['name', 'xp', 'level', 'wins', 'matches', 'weapon'].every((k) => p[k] === op[k]) && JSON.stringify(p.style) === JSON.stringify(op.style);
      const fresh = { look: s.look, halftone: s.halftone, speechBubbles: s.speechBubbles, mascot: s.mascot, reduceMotion: s.reduceMotion, koreanVoice: s.koreanVoice, outlineWidth: s.outlineWidth };
      return { kept, keptP, fresh, continue: [...document.querySelectorAll('.iw-main__menu [data-id]')].map((b) => b.dataset.id) };
    })()`) as { kept: boolean; keptP: boolean; fresh: Record<string, unknown>; continue: string[] };
    // 저장 후 다시 읽어도 같은지(새 키가 붙어 저장되고 이전 키는 그대로)
    await page.evaluate('__inkwave.api.setSettings({ sfx: 0.65 })');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__inkwave && __inkwave.menus && __inkwave.menus.current === "main"', { timeout: 180000, polling: 250 });
    const r2 = await page.evaluate('({ sfx: __inkwave.settings.sfx, look: __inkwave.settings.look, diff: __inkwave.settings.difficulty, name: __inkwave.profile.name })');
    const fr = r.fresh;
    ok('save.compat', r.kept && r.keptP && fr.look === 'storybook' && fr.reduceMotion === false && fr.mascot !== false && fr.speechBubbles !== false && JSON.stringify(r.continue) === JSON.stringify(['story', 'arena', 'locker', 'settings']) && JSON.stringify(r2) === JSON.stringify({ sfx: 0.65, look: 'storybook', diff: 'hard', name: 'OldTimer' }) && errors.length === 0, { r, r2, errors: errors.slice(0, 5) });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
if (fail) process.exit(1);
