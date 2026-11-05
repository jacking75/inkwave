// 패드 보정 마법사(33번 T012): 전체 흐름으로 만든 프로필이 실제 매핑에 쓰이는지, 끊김 중단, 필수 항목 건너뛰기 거절.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PadBinder } from '../../src/core/padBinder.js';
import { BIND_STEPS, mapPad, type RawPad } from '../../src/core/gamepad.js';

// 원시 배치가 뒤섞인 패드: 축 0·1 왼쪽(세로 반전), 축 3·2 오른쪽, 트리거는 축 4·5(-1 → 1), 버튼은 역순
const ID = 'Odd Pad';
function raw(o: { b?: number; ax?: Record<number, number> } = {}): RawPad {
  const axes = [0, 0, 0, 0, -1, -1];
  for (const [k, v] of Object.entries(o.ax ?? {})) axes[+k] = v;
  return { index: 0, id: ID, mapping: '', connected: true, axes, buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: i === o.b, value: i === o.b ? 1 : 0 })) };
}
// 표준 단계 → 이 패드에서 누를 원천
const PRESS: Record<string, { b?: number; ax?: Record<number, number> }> = {
  'axis:0': { ax: { 0: 1 } }, 'axis:1': { ax: { 1: -1 } }, 'axis:2': { ax: { 3: 1 } }, 'axis:3': { ax: { 2: 1 } },
  'button:7': { ax: { 5: 1 } }, 'button:6': { ax: { 4: 1 } },
};
const btnRaw = (std: number) => 11 - std;

test('보정 전체 흐름: 만든 프로필로 A·RT·뒤집힌 세로 축이 표준으로 읽힌다', () => {
  const b = new PadBinder(raw());
  b.update(raw());
  let guard = 0;
  while (b.state !== 'done' && guard++ < 200) {
    const st = b.current!;
    if (!st.required && st.std >= 12) { b.skip(); continue; }
    const press = PRESS[`${st.kind}:${st.std}`] ?? { b: btnRaw(st.std) };
    b.update(raw(press));
    b.update(raw());
  }
  const r = b.result();
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.conflicts, []);
  assert.ok(r.profile);
  const m = mapPad(raw({ b: btnRaw(0), ax: { 1: -0.7, 5: 1 } }), r.profile);
  assert.equal(m?.digital[0], true);
  assert.ok((m?.values[7] ?? 0) > 0.99);
  assert.ok(Math.abs((m?.axes[1] ?? 0) - 0.7) < 1e-9, '위로 민 세로 축이 표준에서는 아래 +로 바뀌어 0.7');
});

test('보정 중 패드가 끊기면 중단되고, 필수 항목은 건너뛸 수 없다', () => {
  const b = new PadBinder(raw());
  b.update(raw());
  assert.equal(b.skip(), false);
  assert.equal(BIND_STEPS[b.step].required, true);
  assert.equal(b.update(null), 'aborted');
  assert.equal(b.reason, 'disconnected');
  assert.equal(b.result().profile, null);
});

test('누른 채 시작하면 뗄 때까지 기준을 잡지 않는다', () => {
  const b = new PadBinder(raw());
  assert.equal(b.update(raw({ b: 3 })), 'waitNeutral');
  assert.equal(b.update(raw()), 'listen');
});
