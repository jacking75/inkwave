// 캠페인 액션·인물·이야기 규칙의 행동 검사(35번 R011~R026·R029). 경계에서 실제로 틀리기 쉬운 규칙만 본다:
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
interface FeedbackMod { planFeedback(k: string, calm: boolean): { hitstop: number; punch: string | null; fovKick: number; word: unknown; rumble: unknown; pongJoy: boolean }; finishOf(t: string | null): string }
interface TelegraphMod { TELEGRAPH: { perfectAfter: number; blinkLast: number }; telegraphFrame(t: number, d: number): { fill: number; blinkOn: boolean }; minTelegraph(d: number, story: boolean): number; inShape(s: object, x: number, z: number): boolean }
interface DevicesMod { switchCoverage(s: number[], team: number): number; validateDevices(d: object[]): string[]; barrelHitByRay(o: object, d: object, r: number, at: object): boolean }
interface MusicMod { nextBoundary(t0: number, beat: number, now: number, beats?: number): number; layerMask(l: number): Record<string, number>; WAVE_LAYERS: Record<number, string[]> }
interface DialogueMod { wrapLine(t: string): string[] | null; lineMs(l: object): number; DialogueRunner: new (h?: object) => { play(s: object): void; hold(on: boolean): void; skip(): void; update(dt: number): void; queue: unknown[]; cur: { script: { id: string }; index: number } | null } }
interface DistrictMod { DISTRICTS: Array<{ missions: Array<{ id: string }> }>; districtUnlocked(d: object, p: object): boolean; missionUnlocked(d: object, i: number, p: object): boolean; nextMission(p: object): { index: number; district: { chapter: number } } }
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

// ---- R021 피드백 패키지: 모션 줄이기면 정지·펀치·FOV 0이고 의성어·진동은 남는다, 대장·정예는 피니시
{
  const FB = await load<FeedbackMod>('campaign/action/feedback.js');
  const e = FB.planFeedback('elite', false), c = FB.planFeedback('elite', true);
  check('feedback: 피니시 0.16초·FOV -8·쾅·진동·퐁', e.hitstop === 0.16 && e.fovKick === -8 && !!e.word && !!e.rumble && e.pongJoy);
  check('feedback: 모션 줄이기 = 정지·펀치·FOV 없음, 의성어·진동 유지', c.hitstop === 0 && c.punch === null && c.fovKick === 0 && !!c.word && !!c.rumble);
  check('feedback: 대장도 피니시, 일반은 처치', FB.finishOf('captain') === 'elite' && FB.finishOf('grunt') === 'kill' && FB.finishOf(null) === 'kill');
  const t = new T.TimeScale() as unknown as { hold(on: boolean): void; step(dt: number): { dt: number }; reset(): void };
  t.hold(true); const held = t.step(0.016).dt; t.reset();
  check('time: 컷신 정지(배율 0)는 세션 리셋으로 풀린다', held === 0 && t.step(0.016).dt === 0.016);
}

// ---- R022 텔레그래프: 최소 예고 시간, 마지막 0.3초 점멸, 형태 판정, 퍼펙트 창 [-window, +0.04]
{
  const TG = await load<TelegraphMod>('campaign/action/telegraph.js');
  check('telegraph: 최소 예고 0.9/1.1초', TG.minTelegraph(0.5, false) === 0.9 && TG.minTelegraph(0.5, true) === 1.1 && TG.minTelegraph(1.4, false) === 1.4);
  check('telegraph: 마지막 0.3초 전에는 점멸 없음', TG.telegraphFrame(0.69, 1).blinkOn && TG.telegraphFrame(0.5, 1).fill === 0.5);
  const offs: boolean[] = [];
  for (let t = 0.705; t < 1; t += 1 / 24) offs.push(TG.telegraphFrame(t, 1).blinkOn);
  check('telegraph: 마지막 0.3초 6 Hz 점멸(꺼짐·켜짐 반복)', offs.includes(true) && offs.filter((x) => !x).length >= 3, offs.map((x) => (x ? 1 : 0)).join(''));
  const line = { shape: 'line', origin: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, length: 10, width: 2 };
  check('telegraph: 선(옆으로 향함) 안/밖', TG.inShape(line, 5, 0.9) && !TG.inShape(line, 5, 1.1) && !TG.inShape(line, -0.5, 0));
  const cone = { shape: 'cone', origin: { x: 0, y: 0, z: 0 }, yaw: 0, radius: 6, halfAngle: 0.5 };
  check('telegraph: 부채꼴 각도 경계', TG.inShape(cone, Math.sin(0.45) * 4, Math.cos(0.45) * 4) && !TG.inShape(cone, Math.sin(0.55) * 4, Math.cos(0.55) * 4) && !TG.inShape(cone, 0, 6.1));
  const base = { window: P.PERFECT.window, source: 'telegraph', hasAttacker: true, onEnemyInk: false, alive: true, specialActive: false, lastPerfectVsAttacker: -Infinity, refTime: 10, after: TG.TELEGRAPH.perfectAfter };
  check('perfect: 예고 종료 뒤 0.04초 안 입력도 무효화', P.isPerfectDive({ ...base, now: 10.04, squidPressedAt: 10.035 }));
  check('perfect: 예고 종료 0.14초 전 입력까지', P.isPerfectDive({ ...base, now: 10.04, squidPressedAt: 10 - P.PERFECT.window + 0.005 }) && !P.isPerfectDive({ ...base, now: 10.04, squidPressedAt: 10 - P.PERFECT.window - 0.01 }));
  check('perfect: 피해 판정 시각보다 늦은 입력은 무시', !P.isPerfectDive({ ...base, now: 10.04, squidPressedAt: 10.05 }));
}

// ---- R023 장치: 스위치 60%, 잉크통 상한·연결 검사, 원통 광선 판정
{
  const DV = await load<DevicesMod>('campaign/action/devices.js');
  const s60 = [1, 1, 1, 1, 1, 1, 0, 2, 2, 0], s50 = [1, 1, 1, 1, 1, 0, 0, 2, 2, 0];
  check('device: 스위치는 아군 60% 이상에서 작동(적 잉크는 세지 않음)', DV.switchCoverage(s60, 0) >= 0.6 && DV.switchCoverage(s50, 0) < 0.6 && DV.switchCoverage(s60, 1) === 0.2);
  const b = (i: number) => ({ kind: 'barrel', id: 'b' + i, at: [0, 0, i] });
  check('device: 잉크통 6개까지 허용, 7개는 거부', DV.validateDevices([0, 1, 2, 3, 4, 5].map(b)).length === 0 && DV.validateDevices([0, 1, 2, 3, 4, 5, 6].map(b)).length === 1);
  check('device: 스위치가 없는 분수를 가리키면 거부', DV.validateDevices([{ kind: 'switch', id: 's', at: [0, 0, 0], enables: ['f9'] }]).length === 1);
  const V = (x: number, y: number, z: number) => ({ x, y, z });
  check('device: 잉크통 광선 판정(높이 포함)', DV.barrelHitByRay(V(0, 0.5, -5), V(0, 0, 1), 10, V(0, 0, 0)) && !DV.barrelHitByRay(V(0, 1.4, -5), V(0, 0, 1), 10, V(0, 0, 0)) && !DV.barrelHitByRay(V(0, 0.5, -5), V(0, 0, 1), 4, V(0, 0, 0)));
}

// ---- R024 음악 레이어: 2박 경계, 단계가 오를수록 레이어가 줄지 않음
{
  const MU = await load<MusicMod>('audio/campaignMusic.js');
  const beat = 60 / 128;
  check('music: 다음 2박 경계', near(MU.nextBoundary(1, beat, 1.01), 1 + 2 * beat) && near(MU.nextBoundary(1, beat, 1 + 2 * beat), 1 + 2 * beat));
  let mono = true;
  for (let l = 1; l <= 3; l++) for (const g of MU.WAVE_LAYERS[l - 1]) if (!MU.layerMask(l)[g]) mono = false;
  check('music: 단계가 오르면 기존 레이어 유지', mono && MU.layerMask(0).bass === 1 && MU.layerMask(0).kick === 0 && MU.layerMask(3).fx === 1);
}

// ---- R026 대화: 2줄×22자 줄바꿈 한계, 줄 시간, comm 보류·재개와 끼어들기
{
  const DL = await load<DialogueMod>('campaign/story/dialogue.js');
  check('dialogue: 22자 안은 한 줄', JSON.stringify(DL.wrapLine('가'.repeat(22))) === JSON.stringify(['가'.repeat(22)]));
  check('dialogue: 공백 없는 23자는 오류', DL.wrapLine('가'.repeat(23)) === null);
  check('dialogue: 3줄이 되면 오류', DL.wrapLine(Array(4).fill('가'.repeat(15)).join(' ')) === null);
  check('dialogue: 줄 시간 최소 1.2초', DL.lineMs({ speaker: 'pong', text: '퐁!' }) === 1200 && DL.lineMs({ speaker: 't', text: '가'.repeat(20) }) === 20 * 70 + 600);
  const r = new DL.DialogueRunner();
  const comm = (id: string) => ({ id, kind: 'comm', blocksInput: false, lines: [{ speaker: 'teal', text: '하나' }, { speaker: 'teal', text: '둘' }] });
  r.hold(true); r.play(comm('c1')); r.update(0.1);
  check('dialogue: 보스 예고 중 comm은 보류', !r.cur && r.queue.length === 1);
  r.hold(false);
  check('dialogue: 예고가 끝나면 재개', r.cur?.script.id === 'c1');
  r.update(2);   // 둘째 줄로
  r.hold(true);
  check('dialogue: 재생 중 보류되면 끊긴 줄부터 다시', !r.cur && (r.queue[0] as { lines: unknown[] }).lines.length === 1);
  r.hold(false); r.skip();
  r.play(comm('c2'));
  r.play({ id: 'i1', kind: 'intro', blocksInput: true, lines: [{ speaker: 'mora', text: '막는 대본' }] });
  check('dialogue: 막는 대본은 comm에 끼어들고 comm은 큐 앞으로', r.cur?.script.id === 'i1' && (r.queue[0] as { id: string }).id === 'c2');
  r.skip();
  check('dialogue: 끼어든 대본이 끝나면 comm 재개', r.cur?.script.id === 'c2');
}

// ---- R029 항구 지도: 지역·임무 해금 순서
{
  const DS = await load<DistrictMod>('campaign/story/districts.js');
  const none = { done: [], colorReturn: {}, records: [] };
  const [d1, d2] = DS.DISTRICTS;
  check('harbor: 처음엔 1-1만', DS.missionUnlocked(d1, 0, none) && !DS.missionUnlocked(d1, 1, none) && !DS.districtUnlocked(d2, none));
  const after13 = { ...none, done: ['1-1', '1-2', '1-3'] };
  check('harbor: 1-3 완료 뒤 2장 열림', DS.districtUnlocked(d2, after13) && DS.missionUnlocked(d2, 0, after13) && DS.nextMission(after13).district.chapter === 2);
  check('harbor: 지역 순서를 건너뛸 수 없음', !DS.districtUnlocked(DS.DISTRICTS[2], { ...none, done: ['1-3'] }));
}

console.log(`action-check: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
