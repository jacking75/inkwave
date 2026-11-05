// 목표 실행기·장치 규칙(33번 T024·T025): 순서 건너뛰기, 중복 사건, 완료 뒤 재가동, 필수 누락 시 출구, 도색률·높이·피격·적 진입·
// 완료 취소 없음, 임무별 시간 예외.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectiveRunner } from '../../src/campaign/objectives.js';
import { stepDevice, newDeviceState, type DeviceInput } from '../../src/campaign/missionDevices.js';
import { M_1_1 } from '../../src/campaign/data/missions/ch1.js';
import type { DeviceDef } from '../../src/campaign/data/types.js';

test('B를 A보다 먼저 건드리면 완료되지 않고, 같은 사건 두 번·완료 뒤 재가동은 무시한다', () => {
  const r = new ObjectiveRunner(M_1_1.objectives);
  assert.equal(r.onDevice('relayB'), null);
  assert.equal(r.status('o-b'), 'locked');
  assert.equal(r.blockedBy('o-b')?.id, 'o-a');
  const a = r.onDevice('relayA');
  assert.deepEqual(a, { id: 'o-a', comm: 'relayA', checkpoint: 'cp1', optional: false });
  assert.equal(r.onDevice('relayA'), null);
  assert.equal(r.onDevice('relayB')?.id, 'o-b');
  assert.equal(r.onDevice('relayB'), null);
  assert.equal(r.current()?.id, 'o-e');
});

test('필수 목표가 남아 있으면 출구가 완료되지 않고 현재 목표를 알려 준다', () => {
  const r = new ObjectiveRunner(M_1_1.objectives, ['o-a']);
  assert.equal(r.onDevice('exit'), null);
  assert.equal(r.blockedBy('o-e')?.id, 'o-b');
  assert.equal(r.current()?.label.includes('중계기 B'), true);
  assert.equal(r.allRequiredDone(), false);
  r.onDevice('relayB'); r.onDevice('exit');
  assert.equal(r.allRequiredDone(), true);
});

test('같은 적의 처치 사건 두 번은 한 번만 완료한다', () => {
  const r = new ObjectiveRunner([{ id: 'k', kind: 'defeat', label: '', target: 'boss', requires: [] }]);
  assert.ok(r.onDefeat('boss'));
  assert.equal(r.onDefeat('boss'), null);
});

const term: DeviceDef = { id: 't', kind: 'terminal', at: [0, 0, 0], radius: 2, paintNeed: 0.6, hold: 2 };
const inp = (o: Partial<DeviceInput> = {}): DeviceInput => ({ player: { x: 0, y: 0, z: 0 }, hit: false, paint: 1, enemiesInside: 0, guardsAlive: 0, clearFirstDone: true, active: true, ...o });
const run = (def: DeviceDef, s: ReturnType<typeof newDeviceState>, i: DeviceInput, secs: number) => { let done = false; for (let t = 0; t < secs; t += 0.1) done = stepDevice(def, s, i, 0.1) || done; return done; };

test('단말: 다른 층·원 밖·도색 부족·직접 피격은 진행하지 않거나 가동 시간만 초기화한다', () => {
  const s = newDeviceState(term);
  assert.equal(run(term, s, inp({ player: { x: 0, y: 3.7, z: 0 } }), 3), false);   // 다른 층
  assert.equal(s.block, 'away');
  assert.equal(run(term, s, inp({ paint: 0.5 }), 3), false);
  assert.equal(s.block, 'paint');
  run(term, s, inp(), 1.5);
  stepDevice(term, s, inp({ hit: true }), 0.1);
  assert.equal(s.hold, 0, '피격은 가동 시간만 초기화');
  assert.equal(run(term, s, inp(), 2.1), true);
  // 완료 뒤 적이 재도색해도 취소되지 않는다
  stepDevice(term, s, inp({ paint: 0, player: null }), 0.1);
  assert.equal(s.complete, true);
});

test('안정화: 적 진입·이탈 때 멈추되 누적은 줄지 않고, 임무별 6초가 기본 45초를 대신한다', () => {
  const st: DeviceDef = { id: 's', kind: 'stabilize', at: [0, 0, 0], radius: 3, duration: 6 };
  const s = newDeviceState(st);
  run(st, s, inp(), 3);
  const mid = s.accum;
  run(st, s, inp({ enemiesInside: 1 }), 2);
  assert.equal(s.accum, mid);
  assert.equal(s.block, 'enemy');
  run(st, s, inp({ player: { x: 9, y: 0, z: 0 } }), 2);
  assert.equal(s.accum, mid);
  assert.equal(run(st, s, inp(), 3.2), true);
});

test('회수: 지정 경계 적이 남아 있으면 진행하지 않는다', () => {
  const rec: DeviceDef = { id: 'r', kind: 'record', at: [0, 0, 0], radius: 2, guards: ['a'] };
  const s = newDeviceState(rec);
  assert.equal(run(rec, s, inp({ guardsAlive: 1 }), 3), false);
  assert.equal(s.block, 'guards');
  assert.equal(run(rec, s, inp(), 2.1), true);
});
