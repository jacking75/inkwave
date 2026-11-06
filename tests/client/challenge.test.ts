// 엔딩 뒤 반복 플레이(33번 T068): 도전 변형이 실행 가능한 임무 정의를 만들고, 도전 보상이 첫 완료 보상을 다시 주지 않으며
// 같은 완료를 두 번 처리하지 않는지, 엔딩 해금이 7-3 첫 완료에서만 생기는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, applyChallenge, completeChallenge, endingUnlocked, validateChallenge, CHALLENGE_LIMIT } from '../../src/campaign/challenge.js';
import { getMission, validateMission, MISSIONS } from '../../src/campaign/definitions.js';
import { completeMission } from '../../src/campaign/completion.js';
import { decodeSave, newSave, type CampaignSave } from '../../src/campaign/save.js';

const ended = (): CampaignSave => ({ ...newSave(1), done: MISSIONS.map((m) => m.id), unlocked: MISSIONS.map((m) => m.id) });

test('도전 정의: 변형 1~2개, 적용한 임무가 정의 검증을 통과하고 선택 상자·첫 보상이 빠진다', () => {
  for (const c of CHALLENGES) {
    const m = getMission(c.mission);
    assert.deepEqual(validateChallenge(c, m), [], c.id);
    assert.ok(c.variants.length <= CHALLENGE_LIMIT.variants);
    const a = applyChallenge(m!, c);
    assert.deepEqual(validateMission(a), [], c.id);
    assert.ok(!a.objectives.some((o) => o.kind === 'crate'), c.id);
    assert.equal(a.reward.record, undefined);
    const added = c.variants.filter((v) => v.kind === 'addUnit').length;
    if (added) assert.ok(a.encounters.some((e) => e.waves[0].units.length > m!.encounters.find((x) => x.id === e.id)!.waves[0].units.length), c.id);
  }
});

test('목표 순서 변경(1-1): B → A 다음에 출구, 원본은 그대로', () => {
  const src = getMission('1-1')!;
  const a = applyChallenge(src, CHALLENGES.find((c) => c.id === 'ch.1-1')!);
  const req = (id: string) => a.objectives.find((o) => o.id === id)!.requires;
  assert.deepEqual(req('o-b'), []);
  assert.deepEqual(req('o-a'), ['o-b']);
  assert.ok(a.objectives.filter((o) => o.requires.includes('o-a') && o.id !== 'o-x').length >= 1);
  assert.ok(!a.objectives.some((o) => o.id !== 'o-a' && o.requires.includes('o-b') && o.id !== 'o-x'));
  assert.deepEqual(src.objectives.find((o) => o.id === 'o-b')!.requires, ['o-a']);
});

test('도전 완료: 엔딩 전 거절, 부품·표식·최고 기록만, 같은 처리 ID 재처리 없음, 표식은 처음 한 번', () => {
  const c = CHALLENGES[0];
  assert.ok('reject' in completeChallenge(newSave(1), { completionId: 'x', challenge: c, ms: 1000 }));
  const s0 = ended();
  const r1 = completeChallenge(s0, { completionId: 'run1', challenge: c, ms: 90_000, weapon: 'roller' });
  assert.ok('save' in r1);
  const s1 = r1.save;
  assert.equal(s1.inventory.parts, s0.inventory.parts + c.parts);
  assert.deepEqual(s1.marks, [c.mark]);
  assert.equal(s1.xp, s0.xp); assert.deepEqual(s1.records, s0.records); assert.equal(s1.inventory.cards.length, 0);
  assert.deepEqual(s1.weaponLog.roller, [c.mission]);
  const again = completeChallenge(s1, { completionId: 'run1', challenge: c, ms: 90_000 });
  assert.ok('save' in again && again.repeated && again.save === s1);
  const r2 = completeChallenge(s1, { completionId: 'run2', challenge: c, ms: 120_000 });
  assert.ok('save' in r2);
  assert.equal(r2.save.challenges[c.id].clears, 2);
  assert.equal(r2.save.challenges[c.id].bestMs, 90_000);
  assert.deepEqual(r2.save.marks, [c.mark]);
  assert.equal(r2.result.mark, null);
});

test('엔딩 해금은 7-3 첫 완료에서만, 반복 완료는 첫 보상·기록을 다시 주지 않는다', () => {
  const m = getMission('7-3')!;
  const base: CampaignSave = { ...newSave(1), unlocked: MISSIONS.map((x) => x.id), done: MISSIONS.filter((x) => x.id !== '7-3').map((x) => x.id) };
  assert.equal(endingUnlocked(base), false);
  const a = completeMission(base, { completionId: 'c1', runId: 'r1', mission: m, crateOpened: false, weapon: 'charger' });
  assert.ok('save' in a);
  assert.equal(endingUnlocked(a.save), true);
  assert.deepEqual(a.save.weaponLog.charger, ['7-3']);
  const sigs = a.save.inventory.cards.filter((c) => c.defId === m.reward.signature).length;
  const b = completeMission(a.save, { completionId: 'c2', runId: 'r2', mission: m, crateOpened: false, weapon: 'charger' });
  assert.ok('save' in b);
  assert.equal(b.save.inventory.cards.filter((c) => c.defId === m.reward.signature).length + b.save.inventory.pending.filter((c) => c.defId === m.reward.signature).length, sigs);
  assert.deepEqual(b.save.weaponLog.charger, ['7-3']);
  // 상자를 열지 않은 반복 완료는 미수집 기록을 완료 처리하지 않는다
  const n = getMission('1-1')!;
  const c = completeMission({ ...newSave(1), done: ['1-1'] }, { completionId: 'c3', runId: 'r3', mission: n, crateOpened: false });
  assert.ok('save' in c && !c.save.records.includes(n.reward.record!));
});

test('형식 2 저장은 도전·표식·공략 기록 기본값으로 이전된다', () => {
  const v2 = { ...newSave(1), schemaVersion: 2 } as Record<string, unknown>;
  delete v2.challenges; delete v2.marks; delete v2.weaponLog; delete v2.endingSeen;
  const d = decodeSave(JSON.stringify(v2));
  assert.ok('value' in d);
  assert.deepEqual(d.value.challenges, {}); assert.deepEqual(d.value.marks, []); assert.deepEqual(d.value.weaponLog, {}); assert.equal(d.value.endingSeen, false);
});
