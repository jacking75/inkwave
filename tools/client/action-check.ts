// 캠페인 액션·인물 규칙의 행동 검사(35번 R011~R020). 경계에서 실제로 틀리기 쉬운 규칙만 본다:
// 퍼펙트 잠수 창·적 잉크·중복 발동, 서지 이중 입력 경계·쿨다운·적 잉크, 물결 감소 시작·단계 하강·이동 보너스 상한,
// 버팀(poise) 스태거·면역·배율, 히트스톱 병합·리셋, 반응 겹침 규칙, 말풍선 시간·조준점 회피, 튜닝 복원.
// 개발 출력(.web-dev/src, npm run compile)의 순수 모듈을 불러 검사한다. 실패하면 종료 코드 1이다.
//
// usage: npm run compile && node .tools/action-check.js
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const load = async <T>(rel: string): Promise<T> => (await import(pathToFileURL(path.join(root, '.web-dev/src', rel)).href)) as T;

interface PerfectMod { PERFECT: { window: number; sameAttackerCd: number }; isPerfectDive(c: object): boolean }
interface SurgeMod { SURGE: { doubleTap: number; duration: number; distance: number; ink: number }; DoubleTap: new () => { press(now: number): boolean }; canSurge(g: object): boolean; surgeSpeed(t: number): number }
interface WaveGaugeI { points: number; level: number; gain(k: string): number | null; hurt(): number | null; death(): number | null; update(dt: number): number | null; restore(p: number): void }
interface WaveMod { WaveGauge: new () => WaveGaugeI }
interface PoiseI { value: number; staggered: boolean; immuneLeft: number; damageMul(): number; hit(d: number): string | null; update(dt: number): boolean }
interface StaggerMod { Poise: new (role: string, tier?: string) => PoiseI; STAGGER: { duration: number; immunity: number; regenDelay: number } }
interface TimeMod { TimeScale: new () => { hitstop(s: number, sc?: number): boolean; slow(s: number, sc: number): void; step(dt: number): { dt: number; scale: number }; reset(): void } }
interface TuneMod { capMoveBonus(g: number, b: number, w: number): { buff: number; wave: number }; campaignTuning(): { runSpeed: number }; enemyTuning(): { runSpeed: number }; restoreTuning(a: { tune: unknown }): void }
interface CastMod { passReactGate(g: { at: number; weight: number }, now: number, w: number): boolean; pickLine(l: string[], last: string | null, rng: () => number): string }
interface SpeechMod { bubbleMs(t: string): number; avoidCenter(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number): { dx: number; dy: number } }
interface ConfigMod { PLAYER: { runSpeed: number } }
interface StyleMod { resolveStyle(st: object, seed: number): { outfit: number; hair: number; skin: number }; OUTFITS: unknown[]; PRESETS: Array<{ id: string }> }

let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++; else { failed++; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

const [P, S, W, ST, T, TU, C, SP, CFG, LOOK] = await Promise.all([
  load<PerfectMod>('campaign/action/perfectDive.js'), load<SurgeMod>('campaign/action/surge.js'), load<WaveMod>('campaign/action/waveGauge.js'),
  load<StaggerMod>('campaign/action/stagger.js'), load<TimeMod>('campaign/action/timeScale.js'), load<TuneMod>('campaign/tuning.js'),
  load<CastMod>('game/cast/cast.js'), load<SpeechMod>('game/cast/speech.js'), load<ConfigMod>('config.js'), load<StyleMod>('game/character-style.js'),
]);

// ---- R017 퍼펙트 잠수: 창 안/밖, 적 잉크, 같은 공격자 1초, 환경 피해
{
  const base = { now: 10, window: P.PERFECT.window, source: 'weapon', hasAttacker: true, onEnemyInk: false, alive: true, specialActive: false, lastPerfectVsAttacker: -Infinity };
  check('perfect: 창 안 입력은 무효화', P.isPerfectDive({ ...base, squidPressedAt: 10 - P.PERFECT.window + 0.005 }));
  check('perfect: 창 밖 입력은 피해를 막지 않음', !P.isPerfectDive({ ...base, squidPressedAt: 10 - P.PERFECT.window - 0.01 }));
  check('perfect: 적 잉크 위에서는 발동하지 않음', !P.isPerfectDive({ ...base, squidPressedAt: 9.95, onEnemyInk: true }));
  check('perfect: 같은 공격자에게 1초 안 재발동 금지', !P.isPerfectDive({ ...base, squidPressedAt: 9.95, lastPerfectVsAttacker: 9.2 }));
  check('perfect: 1초가 지나면 다시 가능', P.isPerfectDive({ ...base, squidPressedAt: 9.95, lastPerfectVsAttacker: 8.9 }));
  check('perfect: 환경 피해(적 잉크 도트)는 대상 아님', !P.isPerfectDive({ ...base, squidPressedAt: 9.95, source: 'ink' }));
}

// ---- R018 잉크 서지: 이중 입력 0.27/0.29초, 쿨다운·적 잉크 거부, 이동 거리
{
  const a = new S.DoubleTap(); a.press(1); check('surge: 0.27초 두 번째 입력은 발동', a.press(1.27));
  const b = new S.DoubleTap(); b.press(1); check('surge: 0.29초 두 번째 입력은 무시', !b.press(1.29));
  const c = new S.DoubleTap(); c.press(1); c.press(1.2); check('surge: 발동 직후 세 번째 입력은 새 쌍의 첫 입력', !c.press(1.3));
  const g = { ink: 50, cooldownLeft: 0, onEnemyInk: false, onOwnInkOrSquid: true, alive: true, busy: false };
  check('surge: 조건 충족 시 가능', S.canSurge(g));
  check('surge: 쿨다운 중 무시', !S.canSurge({ ...g, cooldownLeft: 0.3 }));
  check('surge: 적 잉크 위 거부', !S.canSurge({ ...g, onEnemyInk: true }));
  check('surge: 잉크 부족 거부', !S.canSurge({ ...g, ink: S.SURGE.ink - 0.1 }));
  let d = 0; const h = 1 / 2000;
  for (let t = 0; t < S.SURGE.duration; t += h) d += S.surgeSpeed(t) * h;
  check('surge: 0.22초 이동 거리 5.5 m', near(d, S.SURGE.distance, 0.02), d.toFixed(3));
}

// ---- R019 물결 게이지: 감소 시작 시점, 피격 단계 하강 값, 상한, 복원 50%
{
  const w = new W.WaveGauge();
  w.gain('kill'); w.gain('kill'); w.gain('kill'); w.gain('kill');   // 100점 → 1단계
  check('wave: 100점에서 1단계', w.level === 1 && w.points === 100);
  w.update(3.9); check('wave: 4초 전에는 줄지 않음', w.points === 100);
  w.update(0.6); check('wave: 4초 후 초당 6점 감소', near(w.points, 100 - 6 * 0.5, 1e-6), String(w.points));
  const x = new W.WaveGauge();
  for (let i = 0; i < 9; i++) x.gain('kill');   // 225점 → 2단계
  x.hurt(); check('wave: 피격 시 한 단계 아래의 시작값(100)', x.level === 1 && x.points === 100);
  x.death(); check('wave: 사망 시 0', x.points === 0 && x.level === 0);
  const y = new W.WaveGauge(); for (let i = 0; i < 20; i++) y.gain('elite');
  check('wave: 300점 상한', y.points === 300 && y.level === 3);
  y.restore(300); check('wave: 체크포인트 복원 50%', y.points === 150 && y.level === 1);
  const cap = TU.capMoveBonus(0.10, 0.08, 0.12);
  check('wave: 이동 보너스 합산 22% 상한(게이지 먼저 깎음)', near(0.10 + cap.buff + cap.wave, 0.22) && near(cap.buff, 0.08) && near(cap.wave, 0.04));
}

// ---- R020 버팀·스태거: 슈터 2발 스태거, 면역, 배율, 회복
{
  const p = new ST.Poise('gunner');
  check('stagger: 사격병은 슈터 1발로 스태거 없음', p.hit(36) === null);
  check('stagger: 사격병은 슈터 2발에 스태거', p.hit(36) === 'stagger' && p.staggered);
  check('stagger: 스태거 중 받는 피해 1.3배', near(p.damageMul(), 1.3));
  p.update(ST.STAGGER.duration + 0.01);
  check('stagger: 끝나면 면역·가득 참', !p.staggered && p.immuneLeft > 2.9 && p.value === 40);
  check('stagger: 면역 중에는 버팀이 줄지 않음(무한 경직 방지)', p.hit(500) === null && p.value === 40);
  const r = new ST.Poise('gunner'); r.hit(36);
  const v0 = r.value; r.update(ST.STAGGER.regenDelay * 0.9); const v1 = r.value; r.update(0.5);
  check('stagger: 회복은 지연 뒤에만', v1 === v0 && r.value > v0);
  check('stagger: 대장 버팀 ×4', new ST.Poise('shield', 'captain').value === 320);
}

// ---- 시간 배율(R017이 쓰는 R021 부품): 0.4초 안 병합, 히트스톱 뒤 느린 시간, 리셋
{
  const t = new T.TimeScale();
  check('time: 첫 히트스톱 시작', t.hitstop(0.1));
  t.step(0.05);
  check('time: 0.4초 안 두 번째 요청은 새로 시작하지 않음', !t.hitstop(0.08));
  t.slow(0.35, 0.45);
  const s1 = t.step(0.02).scale;
  check('time: 히트스톱 중 배율 0.05(0이 아님)', near(s1, 0.05));
  t.step(0.05); const s2 = t.step(0.02).scale;
  check('time: 히트스톱 뒤 느린 시간', s2 < 0.6 && s2 > 0.4, String(s2));
  t.reset(); check('time: 리셋 후 배율 1', t.step(0.016).scale === 1);
}

// ---- R016 튜닝: 캠페인 값, 적 0.9배, 세션 종료 시 PLAYER 복원
{
  check('tune: 캠페인 달리기 6.4', near(TU.campaignTuning().runSpeed, 6.4));
  check('tune: 적 이동 0.9배', near(TU.enemyTuning().runSpeed, CFG.PLAYER.runSpeed * 0.9));
  const a = { tune: TU.campaignTuning() as unknown }; TU.restoreTuning(a);
  check('tune: 종료 후 actor.tune === PLAYER', a.tune === CFG.PLAYER);
}

// ---- R011·R012 반응·말풍선
{
  const g = { at: -99, weight: 0 };
  check('react: 첫 반응 통과', C.passReactGate(g, 1.0, 0.5));
  check('react: 0.6초 안 더 약한 반응은 무시', !C.passReactGate(g, 1.3, 0.4));
  check('react: 0.6초 안 더 센 반응은 재생', C.passReactGate(g, 1.4, 0.9));
  check('react: 0.6초 뒤에는 약해도 재생', C.passReactGate(g, 2.1, 0.1));
  const lines = ['a', 'b', 'c'];
  let rep = false; let last: string | null = null;
  for (let i = 0; i < 200; i++) { const l = C.pickLine(lines, last, Math.random); if (l === last) rep = true; last = l; }
  check('react: 직전 문장을 반복하지 않음', !rep);
  check('speech: 표시 시간 = 글자×60+700 ms', SP.bubbleMs('좋아!') === 3 * 60 + 700);
  check('speech: 최대 2.6초', SP.bubbleMs('가'.repeat(80)) === 2600);
  const m = SP.avoidCenter(900, 480, 1000, 530, 960, 540, 120);
  const x0 = 900 + m.dx, y0 = 480 + m.dy, nx = Math.max(x0, Math.min(960, x0 + 100)), ny = Math.max(y0, Math.min(540, y0 + 50));
  check('speech: 중앙 반지름 120 px 밖으로 밀림', Math.hypot(nx - 960, ny - 540) >= 120, `${m.dx.toFixed(1)},${m.dy.toFixed(1)}`);
  const z = SP.avoidCenter(0, 0, 100, 40, 960, 540, 120);
  check('speech: 멀리 있는 말풍선은 그대로', z.dx === 0 && z.dy === 0);
}

// ---- R014 외형 표: 의상을 끝에 더해도 이름 시드로 파생된 저장 외형이 바뀌지 않음(이전 10벌 기준 공식과 같음)
{
  let diff = 0;
  for (let seed = 0; seed < 5000; seed++) {
    const r = LOOK.resolveStyle({}, seed);
    const old = ((Math.round((r.hair + r.skin + (seed >> 6)) % 10) % 10) + 10) % 10;
    if (r.outfit !== old) diff++;
  }
  check('look: 시드 파생 의상 색인 불변(5000개)', diff === 0, String(diff));
  check('look: 프리셋·의상은 끝에 추가', LOOK.PRESETS.slice(-3).map((p) => p.id).join() === 'tide,pebble,coral-jr' && LOOK.OUTFITS.length === 12);
}

console.log(`action-check: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
