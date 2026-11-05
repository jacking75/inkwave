// 출현 묶음(33번 T026): 선택 경로의 적만 활성, 쓰러진 일반 적 재출현 없음, 동시 상한, 웨이브 간격, 체력 경계 지원 한 번,
// 체크포인트 재시작 후 다시 처음 상태.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Encounters, SPAWN_MARK, type EncounterHost } from '../../src/campaign/encounters.js';
import { M_1_1, M_1_2 } from '../../src/campaign/data/missions/ch1.js';

interface Fake { id: string; hp: number; alive: boolean }
function host(done: Set<string>, active: Set<string> = new Set()) {
  const spawned: Fake[] = [];
  const h: EncounterHost<Fake> = {
    spawn: (u) => { const a = { id: u.id, hp: 1, alive: true }; spawned.push(a); return a; },
    despawn: (a) => { a.alive = false; },
    marker: () => {},
    hpFrac: (a) => a.hp, alive: (a) => a.alive,
    objectiveDone: (id) => done.has(id), objectiveActive: (id) => active.has(id),
  };
  return { h, spawned };
}
const tick = (e: Encounters<Fake>, p: { x: number; z: number } | null, secs: number) => { for (let t = 0; t < secs; t += 0.1) e.update(0.1, p); };

test('선택 경로: 들어간 쪽 묶음만 발동하고 다른 경로는 잠든다', () => {
  const { h, spawned } = host(new Set(['o-a']));
  const e = new Encounters(M_1_1, h, { cleared: ['enc-a'] });
  tick(e, { x: -15, z: -12 }, SPAWN_MARK + 0.2);   // 화단 우회로
  assert.equal(e.state('enc-side'), 'active');
  assert.equal(e.state('enc-front'), 'idle');
  assert.deepEqual(spawned.map((s) => s.id).sort(), ['s-g1', 's-g2']);
});

test('선행 목표 전에는 발동하지 않고, 쓰러진 적은 다시 나오지 않으며 웨이브는 쉬는 시간 뒤 나온다', () => {
  const done = new Set<string>(), active = new Set<string>();
  const { h, spawned } = host(done, active);
  const e = new Encounters(M_1_1, h);
  tick(e, { x: 0, z: 15 }, 2);
  assert.equal(e.state('enc-b'), 'idle', 'B 목표가 활성이 아니면 방어 웨이브 없음');
  active.add('o-b');
  tick(e, { x: 0, z: 15 }, SPAWN_MARK + 0.2);
  assert.equal(spawned.length, 2);
  for (const a of e.liveActors()) e.killed(a);
  tick(e, { x: 0, z: 15 }, 3);
  assert.equal(spawned.length, 2, '4초 쉬는 시간 전에는 다음 웨이브 없음');
  tick(e, { x: 0, z: 15 }, 1.2 + SPAWN_MARK + 0.2);
  assert.equal(spawned.length, 4);
  for (const a of e.liveActors()) e.killed(a);
  tick(e, { x: 0, z: 15 }, 6);
  assert.equal(e.state('enc-b'), 'cleared');
  assert.equal(spawned.length, 4, '정리 뒤 추가 출현 없음');
});

test('정예 체력 50% 지원은 한 번만, 재시작하면 처음부터', () => {
  const { h, spawned } = host(new Set(['o-r1', 'o-r2']));
  const e = new Encounters(M_1_2, h, { cleared: ['enc-walk', 'enc-high'] });
  tick(e, { x: 12, z: 5 }, SPAWN_MARK + 0.2);
  const elite = e.unitActor('elite')!;
  elite.hp = 0.4;
  tick(e, { x: 12, z: 5 }, SPAWN_MARK + 0.2);
  tick(e, { x: 12, z: 5 }, 3);
  assert.deepEqual(spawned.map((s) => s.id), ['elite', 'e-p1']);
  e.reset(['enc-elite']);
  assert.equal(elite.alive, false);
  assert.equal(e.state('enc-elite'), 'idle');
  tick(e, { x: 12, z: 5 }, SPAWN_MARK + 0.2);
  assert.equal(spawned.filter((s) => s.id === 'elite').length, 2);
});
