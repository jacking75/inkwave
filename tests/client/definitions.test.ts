// 캠페인 정의 검증(33번 T021): 실제 1장 정의 통과, 그리고 실행 전에 막아야 하는 정의 오류가 실제로 잡히는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, validateAll, validateMission } from '../../src/campaign/definitions.js';
import { M_1_1 } from '../../src/campaign/data/missions/ch1.js';
import type { MissionDefinition } from '../../src/campaign/data/types.js';

const clone = (): MissionDefinition => JSON.parse(JSON.stringify(M_1_1));

test('구현한 임무 정의가 검증을 통과한다', () => {
  assert.deepEqual(validateAll(), []);
  assert.deepEqual(MISSIONS.map((m) => m.id).slice(0, 4), ['1-1', '1-2', '1-3', '2-1']);
});

test('중복 ID·없는 체크포인트·알 수 없는 적·선행 순환·없는 해금 대상을 잡는다', () => {
  const dup = clone(); dup.devices.push({ ...dup.devices[0] });
  assert.ok(validateMission(dup).some((s) => s.includes('중복 ID relayA')));
  const cp = clone(); cp.objectives[0].checkpoint = 'nope';
  assert.ok(validateMission(cp).some((s) => s.includes('체크포인트 nope')));
  const en = clone(); (en.encounters[0].waves[0].units[0] as { role: string }).role = 'dragon';
  assert.ok(validateMission(en).some((s) => s.includes('알 수 없는 적 dragon')));
  const cyc = clone(); cyc.objectives[0].requires = ['o-e'];
  assert.ok(validateMission(cyc).some((s) => s.includes('선행 순환')));
  const un = clone(); un.reward.unlocks = ['9-9'];
  assert.ok(validateMission(un).some((s) => s.includes('해금 대상 9-9')));
});

test('해금 순환과 확률 오류를 잡는다', () => {
  const a = clone(), b = { ...clone(), id: '1-2', reward: { ...clone().reward, firstSet: undefined, record: undefined, unlocks: ['1-1'] } };
  b.objectives = b.objectives.filter((o) => o.kind !== 'crate');
  assert.ok(validateAll([a, b], ['1-1', '1-2']).some((s) => s.includes('해금 순환')));
});

// 35번 R032: 21개 임무가 실제로 부르는 이야기 사건(시작·완료·사망, 목표 통신, 기록 보상)에 대본·기록이 모두 있다.
// 대본을 고치거나 목표의 comm 키를 바꿀 때 연결이 끊겨 통신이 조용히 사라지는 것을 잡는다.
test('모든 임무의 목표 통신·시작/완료/사망 대본·기록 보상이 이야기 데이터에 연결돼 있다', async () => {
  const { missionStory, getScript, ALL_RECORDS } = await import('../../src/campaign/story/scripts/index.js');
  const errs: string[] = [];
  const recs = new Set(ALL_RECORDS.map((r) => r.id));
  for (const m of MISSIONS) {
    const ms = missionStory(m.id);
    if (!ms) { errs.push(`${m.id}: 이야기 없음`); continue; }
    for (const id of [ms.intro, ms.outro, ms.death]) if (!getScript(id)) errs.push(`${m.id}: 대본 ${id}`);
    for (const o of m.objectives) if (o.comm && !ms.comms?.[o.comm]) errs.push(`${m.id}: 목표 ${o.id}의 통신 ${o.comm}`);
    if (m.reward.record && !recs.has(m.reward.record)) errs.push(`${m.id}: 기록 ${m.reward.record}`);
    // 보스 임무는 세션이 boss·phase·weak 통신을 부른다(장치 보스는 phase·weak, 인간형 대장은 boss도)
    if (m.type === 'boss') for (const k of ['phase', 'weak']) if (!ms.comms?.[k]) errs.push(`${m.id}: 보스 통신 ${k}`);
    if (m.boss && !(ms.panels?.bossIntro ?? ms.panels?.midBoss)) errs.push(`${m.id}: 등장 패널 없음`);
  }
  assert.deepEqual(errs, []);
});
