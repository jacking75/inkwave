// 캠페인 정의 검증(33번 T021): 실제 1장 정의 통과, 그리고 실행 전에 막아야 하는 정의 오류가 실제로 잡히는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, validateAll, validateMission } from '../../src/campaign/definitions.js';
import { M_1_1 } from '../../src/campaign/data/missions/ch1.js';
import type { MissionDefinition } from '../../src/campaign/data/types.js';

const clone = (): MissionDefinition => JSON.parse(JSON.stringify(M_1_1));

test('1장 세 임무 정의가 검증을 통과한다', () => {
  assert.deepEqual(validateAll(), []);
  assert.deepEqual(MISSIONS.map((m) => m.id), ['1-1', '1-2', '1-3']);
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
