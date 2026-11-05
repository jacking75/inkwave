// 보상·추첨·저장·성장 규칙(33번 T029~T034): 중복 지급, 저장 실패 재시도, 보장 경계, 상자 재추첨, 레벨 경계·상한, 특성 복제,
// 분해 연타·잠금·장착, 깨진·미래 저장.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMission, recordCrate } from '../../src/campaign/completion.js';
import { newSave, decodeSave, validateImport, type CampaignSave } from '../../src/campaign/save.js';
import { MemoryStorage } from '../../src/platform/storage.js';
import { newAttempt, rollSource, pityAfter, rollGrade } from '../../src/campaign/loot.js';
import { applyXp, LEVEL_XP, XP_CAP, invest, canInvest, levelOf, pointsAt, sanitizeTraits } from '../../src/campaign/growth.js';
import { salvage, setLock, equip, addCards, makeCard, EMPTY_INVENTORY } from '../../src/campaign/inventory.js';
import { computeStats, damageTakenMul, damageDealtMul } from '../../src/campaign/stats.js';
import { M_1_1, M_1_2, M_1_3 } from '../../src/campaign/data/missions/ch1.js';

const unlockAll = (s: CampaignSave): CampaignSave => ({ ...s, unlocked: ['1-1', '1-2', '1-3'] });

test('1-1 첫 완료: 경험치 600·부품 60·기본 세트 3개(무작위 완료 모듈 없음)·1-2 해금, 반복은 120·40·무작위 1', () => {
  const s0 = newSave(0);
  const r = completeMission(s0, { completionId: 'c1', runId: 'r1', mission: M_1_1, crateOpened: false });
  assert.ok('save' in r);
  assert.equal(r.record.xp.granted, 600); assert.equal(r.record.parts, 60);
  assert.deepEqual(r.record.modules.map((m) => m.defId), ['AD01', 'TK01', 'BD01']);
  assert.deepEqual(r.save.unlocked, ['1-1', '1-2']);
  assert.equal(r.save.pity, 0, '기본 세트는 보장 횟수를 바꾸지 않는다');
  const r2 = completeMission(r.save, { completionId: 'c2', runId: 'r2', mission: M_1_1, crateOpened: false });
  assert.ok('save' in r2);
  assert.equal(r2.record.xp.granted, 120); assert.equal(r2.record.parts, 40); assert.equal(r2.record.modules.length, 1);
  assert.equal(r2.record.unlocks.length, 0);
});

test('같은 완료 ID를 두 번 처리해도 한 번만 지급한다(연타·재시도·결과 재열기)', () => {
  const s0 = newSave(0);
  const a = completeMission(s0, { completionId: 'c1', runId: 'r1', mission: M_1_1, crateOpened: true });
  assert.ok('save' in a);
  const b = completeMission(a.save, { completionId: 'c1', runId: 'r1', mission: M_1_1, crateOpened: true });
  assert.ok('save' in b && b.repeated);
  assert.equal(b.save, a.save);
  assert.equal(a.record.parts, 70, '첫 완료 60 + 상자 10');
  assert.deepEqual(a.save.records, ['rec.tidewater.1']);
});

test('저장 실패 뒤 같은 ID로 재시도하면 정확히 한 번 반영되고, 실패 동안 기존 저장은 그대로이다', async () => {
  const store = new MemoryStorage(decodeSave);
  const c = await store.commit(null, () => newSave(0));
  assert.ok(c.ok);
  store.failNext = 'quota';
  const op = (s: CampaignSave | null) => { const r = completeMission(s!, { completionId: 'x', runId: 'r', mission: M_1_1, crateOpened: false }); return 'save' in r ? r.save : { reject: r.reject }; };
  const f = await store.commit(1, op);
  assert.equal(f.ok, false);
  const still = await store.load();
  assert.ok(still.ok && still.value?.xp === 0 && still.value.revision === 1);
  const ok = await store.commit(1, op);
  assert.ok(ok.ok && ok.value.xp === 600 && ok.value.revision === 2);
  const again = await store.commit(1, op);       // 오래된 화면(revision 1)의 두 번째 시도: 거절
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.error, 'conflict');
});

test('다른 탭이 더 새 시도를 시작했으면 완료를 거절한다', () => {
  const s = { ...newSave(0), inProgress: { missionId: '1-1', runId: 'newer', checkpointId: null, done: [], devices: [], cleared: [], dead: [], special: 0, at: 0 } };
  const r = completeMission(s, { completionId: 'c', runId: 'older', mission: M_1_1, crateOpened: false });
  assert.ok('reject' in r);
});

test('보장 8·9 경계: 연속 미획득 9회면 다음은 특제, 중간 특제는 0으로', () => {
  assert.equal(rollGrade(0.5, 8), 'common');
  assert.equal(rollGrade(0.99, 8), 'special', '보장 전에도 5% 구간이면 특제');
  assert.equal(rollGrade(0.01, 9), 'special');
  const at = newAttempt('1-2', 7, 8);
  // 상자 하나를 열면 미확정 9 → 완료 모듈이 특제로 보장되고 확정 0
  const first = rollSource(at, 'crate', 'tidewater');
  if (first.grade === 'special') assert.equal(pityAfter(at), 0);
  else {
    assert.equal(pityAfter(at), 9);
    assert.equal(rollSource(at, 'completion', 'tidewater').grade, 'special');
    assert.equal(pityAfter(at), 0);
  }
});

test('상자 ID를 다시 열어도(재시작·새로고침·포기) 결과가 같고 보장 횟수가 늘지 않는다', () => {
  let s = unlockAll(newSave(0));
  const a = recordCrate(s, '1-2', 'run-1', 'tidewater'); s = a.save;
  const b = recordCrate(s, '1-2', 'run-1', 'tidewater');
  assert.deepEqual(b.result, a.result);
  assert.equal(b.save.attempts['1-2'].rolls.length, 1);
  // 포기 후 다른 runId로 다시 와도 같은 시도 기록을 쓴다
  const c = recordCrate(b.save, '1-2', 'run-2', 'tidewater');
  assert.deepEqual(c.result, a.result);
});

test('보스 첫 완료: 600·80·무작위 1·공명핵 1·확정 SG01, 확정 서명은 보장 횟수에서 제외', () => {
  const s = { ...unlockAll(newSave(0)), pity: 3 };
  const r = completeMission(s, { completionId: 'b', runId: 'r', mission: M_1_3, crateOpened: false });
  assert.ok('save' in r);
  assert.equal(r.record.xp.granted, 600); assert.equal(r.record.parts, 80); assert.equal(r.record.cores, 1);
  assert.equal(r.record.modules.length, 2);
  assert.equal(r.record.modules[1].defId, 'SG01');
  assert.deepEqual(r.record.modules[1].sub, { key: 'inkMax', value: 3 });
  const rnd = r.record.modules[0];
  assert.equal(r.save.pity, rnd.grade === 'special' ? 0 : 4);
  assert.ok(r.save.unlocked.includes('2-1'));
});

test('1-2: 정예 처치 자체로 경험치가 늘지 않고 첫 완료 600·60, 상자는 별도', () => {
  const r = completeMission(unlockAll(newSave(0)), { completionId: 'e', runId: 'r', mission: M_1_2, crateOpened: true });
  assert.ok('save' in r);
  assert.equal(r.record.xp.granted, 600); assert.equal(r.record.parts, 70); assert.equal(r.record.modules.length, 2);
});

test('레벨: 경계 전후·여러 레벨 한 번에·20 상한·첫 완료 21개의 12,600과 상한 12,350', () => {
  assert.equal(levelOf(199), 1); assert.equal(levelOf(200), 2); assert.equal(levelOf(449), 2); assert.equal(levelOf(450), 3);
  assert.equal(LEVEL_XP[20], 12350); assert.equal(XP_CAP, 12350);
  const multi = applyXp(0, 1500);   // 1 → 6: 짝수 2·4·6 → 3점
  assert.equal(multi.toLevel, 6); assert.equal(multi.pointsAdded, 3);
  let xp = 0, pts = 0, over = 0;
  for (let i = 0; i < 21; i++) { const r = applyXp(xp, 600); xp = r.xp; pts += r.pointsAdded; over += r.overCap; }
  assert.equal(xp, 12350); assert.equal(pts, 10); assert.equal(over, 250);
});

test('특성: 점수 부족·잠긴 효과 거절, 반복 배분으로 점수가 복제되지 않음, 저장 조작은 비움', () => {
  let a = {};
  assert.equal(canInvest(a, 'mob2', 5), 'locked');
  for (let i = 0; i < 2; i++) a = invest(a, 'mob1', 5).alloc;
  assert.equal(invest(a, 'mob1', 5).denied, 'max');
  a = invest(a, 'mob2', 5).alloc; a = invest(a, 'mob2', 5).alloc;
  a = invest(a, 'mob3', 5).alloc;
  assert.equal(invest(a, 'sup1', 5).denied, 'points');
  assert.deepEqual(sanitizeTraits({ mob3: 2 }, 10), {}, '선행 없이 3단 효과만 있는 저장은 비운다');
  assert.equal(pointsAt(levelOf(12350)), 10);
});

test('능력치 합산: 이동 +10% 상한, 피해 감소 20% 상한, 추가 피해 계수 1.35 상한, 강화 배율과 불이익', () => {
  const card = (defId: string, plus = 0, sub: { key: 'swimSpeed'; value: number } | null = null) => ({ uid: defId + plus, defId, grade: 'special' as const, sub, plus, locked: false, from: '' });
  const s = computeStats(20, [card('BD01', 3, { key: 'swimSpeed', value: 2 }), card('SG07', 3)], { mob1: 2 });
  assert.ok(Math.abs(s.raw.swimSpeed! - (3.9 + 2.6 + 4)) < 1e-9);
  assert.equal(s.swimMul, 1.10);
  assert.ok(s.capped.includes('swim'));
  assert.ok(Math.abs(s.raw.dmgTaken! - 6.5) < 1e-9, 'SG07 +3 불이익 6.5%');
  assert.equal(s.hpMax, 119); assert.equal(s.inkMax, 109.5);
  const guard = computeStats(1, [card('SG01', 3), card('BD04', 3)], { mob3: 2 });
  assert.equal(damageTakenMul(guard, { onObjective: true, justLeftInk: true }), 0.8);
  const hit = computeStats(1, [card('SG07', 3), card('AD02', 3), card('SG02', 3), card('SG03', 3)], { sup1: 2, sup2: 2, sup3: 2 });
  assert.ok(Math.abs(damageDealtMul(hit, { weak: true }) - 1.216) < 1e-9, '약점만: 10.4 + 5.2 + 6 = 21.6%');
  assert.equal(damageDealtMul(hit, { weak: true, device: true, stunnedBoss: true }), 1.35, '합 58%여도 계수 1.35 상한');
});

test('분해: 장착·잠금 제외, 같은 uid 연타는 한 번만 부품 지급, 보관함이 차면 대기함', () => {
  let inv = addCards(EMPTY_INVENTORY, [0, 1, 2].map((i) => makeCard({ source: 's', defId: i === 0 ? 'AD01' : 'TK01', grade: 'precise', sub: null }, 'u' + i, '1-1')));
  inv = equip(inv, 'u0')!; inv = setLock(inv, 'u1', true)!;
  const r = salvage(inv, ['u0', 'u1', 'u2', 'u2']);
  assert.deepEqual(r.removed, ['u2']); assert.equal(r.gained, 10);
  const r2 = salvage(r.inv, ['u2']);
  assert.equal(r2.gained, 0);
  const full = addCards(EMPTY_INVENTORY, Array.from({ length: 62 }, (_, i) => makeCard({ source: 's', defId: 'SG01', grade: 'special', sub: null }, 'x' + i, '1-3')));
  assert.equal(full.cards.length, 60); assert.equal(full.pending.length, 2);
});

test('깨진 JSON·미래 버전·중복 카드 ID는 거절하고 정상 저장은 그대로 읽힌다', () => {
  assert.deepEqual('error' in validateImport('{oops') && validateImport('{oops'), { error: 'corrupt', reason: 'JSON' });
  const fut = { ...newSave(0), schemaVersion: 99 };
  const d = decodeSave(fut); assert.ok('error' in d && d.error === 'future');
  const s = newSave(0);
  s.inventory = { ...s.inventory, cards: [makeCard({ source: 'a', defId: 'AD01', grade: 'common', sub: null }, 'a', ''), makeCard({ source: 'a', defId: 'AD01', grade: 'common', sub: null }, 'a', '')] };
  const dup = decodeSave(JSON.parse(JSON.stringify(s))); assert.ok('error' in dup);
  const ok = decodeSave(JSON.parse(JSON.stringify(newSave(5)))); assert.ok('value' in ok);
});

test('저장이 깨졌으면 마지막 정상 백업으로 읽고 원본은 지우지 않는다', async () => {
  const store = new MemoryStorage(decodeSave);
  await store.commit(null, () => newSave(0));
  await store.commit(1, (s) => ({ ...s!, xp: 300 }));
  store.cur = '{broken';
  const r = await store.load();
  assert.ok(r.ok && r.backupUsed && r.value?.xp === 0);
  assert.equal(store.cur, '{broken');
});

test('난이도(이야기·일반)는 같은 첫 완료에서 경험치·확정 보상·해금이 같다', () => {
  const run = (d: 'story' | 'normal') => { const r = completeMission({ ...newSave(0, d) }, { completionId: 'd', runId: 'same', mission: M_1_1, crateOpened: false }); return 'record' in r ? { xp: r.record.xp, parts: r.record.parts, mods: r.record.modules.map((m) => m.defId), unlocks: r.record.unlocks } : null; };
  assert.deepEqual(run('story'), run('normal'));
});
