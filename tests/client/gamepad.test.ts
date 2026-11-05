// 게임패드 세션·매핑(33번 T010~T012): 재연결 유령 발사, 두 패드 선택, 트리거 떨림, 미매핑·보정, API 오류.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadManager, detectBinding, snapshot, validateProfile, loadProfiles, type RawPad, type PadProfile } from '../../src/core/gamepad.js';

function pad(index: number, o: { id?: string; mapping?: string; pressed?: number[]; values?: Record<number, number>; axes?: number[]; n?: number } = {}): RawPad {
  const n = o.n ?? 17;
  const buttons = Array.from({ length: n }, (_, i) => {
    const v = o.values?.[i] ?? (o.pressed?.includes(i) ? 1 : 0);
    return { pressed: o.values?.[i] !== undefined ? v > 0.5 : !!o.pressed?.includes(i), value: v };
  });
  return { index, id: o.id ?? `Xbox 360 Controller #${index}`, mapping: o.mapping ?? 'standard', connected: true, buttons, axes: o.axes ?? [0, 0, 0, 0] };
}
const nav = (...pads: Array<RawPad | null>) => ({ getGamepads: () => pads });

test('RT를 누른 채 끊고 다른 패드를 RT를 누른 채 연결해도 중립 확인 전에는 발사하지 않는다', () => {
  const m = new GamepadManager();
  m.poll(nav(pad(0, { pressed: [0] })));          // A로 깨운다 → 선택
  m.poll(nav(pad(0)));                              // 중립 → 활성
  let v = m.poll(nav(pad(0, { values: { 7: 1 } })));
  assert.equal(v?.buttons[7].pressed, true);
  v = m.poll(nav(null));                            // 해제
  assert.equal(v, null);
  assert.ok(m.takeEvents().includes('disconnected'));
  v = m.poll(nav(null, pad(1, { values: { 7: 1 } })));   // 다른 패드가 RT를 누른 채 등장(새 누름 = 선택)
  assert.equal(v?.buttons[7].pressed, false);
  assert.deepEqual(v?.pressedEdges, []);
  v = m.poll(nav(null, pad(1, { values: { 7: 1 } })));
  assert.equal(v?.buttons[7].pressed, false, '계속 누르고 있어도 중립 전에는 꺼져 있다');
  m.poll(nav(null, pad(1)));
  v = m.poll(nav(null, pad(1, { values: { 7: 1 } })));
  assert.deepEqual(v?.pressedEdges, [7]);
});

test('두 패드가 연결돼도 매 프레임 첫 패드로 바뀌지 않고, 쉬는 패드 대신 새로 누른 패드로만 바뀐다', () => {
  const m = new GamepadManager();
  m.poll(nav(pad(0), pad(1, { pressed: [0] })));
  assert.equal(m.selIndex, 1);
  for (let i = 0; i < 5; i++) m.poll(nav(pad(0, { axes: [0.9, 0, 0, 0] }), pad(1, { pressed: [i % 2 ? 0 : 1] })));
  assert.equal(m.selIndex, 1, '패드 0의 스틱 움직임으로 넘어가지 않는다');
  m.poll(nav(pad(0), pad(1)));
  m.poll(nav(pad(0, { pressed: [3] }), pad(1)));
  assert.equal(m.selIndex, 0);
});

test('트리거 누름 0.30·해제 0.20 히스테리시스: 경계 근처 떨림이 반복 눌림이 되지 않는다', () => {
  const m = new GamepadManager();
  m.poll(nav(pad(0, { pressed: [0] }))); m.poll(nav(pad(0)));
  const seq = [0.29, 0.31, 0.26, 0.22, 0.29, 0.31, 0.19, 0.31];
  let edges = 0;
  for (const v of seq) if (m.poll(nav(pad(0, { values: { 6: v } })))?.pressedEdges.includes(6)) edges++;
  assert.equal(edges, 2);   // 0.31(눌림) … 0.19(뗌) → 0.31(다시 눌림)
});

test('비표준 패드는 보정 없이 매핑하지 않고, 보정한 장치에만 적용한다', () => {
  const m = new GamepadManager();
  const raw = (o: object = {}) => pad(0, { id: 'Generic USB Joystick', mapping: '', n: 12, ...o });
  assert.equal(m.poll(nav(raw({ pressed: [2] }))), null);
  assert.equal(m.status, 'unmapped');
  // 축이 뒤집히고 버튼 순서가 다른 패드: 원시 버튼 2 = A, 원시 축 1(반전) = 왼쪽 스틱 세로, 원시 축 5의 +방향 = RT
  const prof: PadProfile = { id: 'Generic USB Joystick', buttons: Array(17).fill(null), axes: [{ index: 0, invert: false }, { index: 1, invert: true }, { index: 2, invert: false }, { index: 3, invert: false }] };
  prof.buttons[0] = { kind: 'button', index: 2 };
  prof.buttons[7] = { kind: 'axis', index: 5, rest: -1, full: 1 };
  m.setProfile(prof);
  m.poll(nav(raw({ axes: [0, 0, 0, 0, 0, -1] })));
  const v = m.poll(nav(raw({ pressed: [2], axes: [0, 0.8, 0, 0, 0, 1] })));
  assert.equal(m.status, 'ready');
  assert.equal(v?.buttons[0].pressed, true);
  assert.equal(v?.buttons[7].pressed, true);
  assert.ok(Math.abs((v?.axes[1] ?? 0) + 0.8) < 1e-9);
  // 같은 보정이 id가 다른 장치에는 적용되지 않는다
  const other = new GamepadManager({ v: 1, profiles: { 'Generic USB Joystick': prof } });
  assert.equal(other.poll(nav(pad(0, { id: 'Other Pad', mapping: '', pressed: [2] }))), null);
  assert.equal(other.status, 'unmapped');
});

test('getGamepads가 없거나 예외(권한 정책)면 unavailable이다', () => {
  const m = new GamepadManager();
  assert.equal(m.poll({}), null);
  assert.equal(m.status, 'unavailable');
  assert.equal(m.poll({ getGamepads: () => { throw new Error('SecurityError'); } }), null);
  assert.equal(m.status, 'unavailable');
});

test('보정 감지: 버튼은 버튼, 트리거 축은 rest→full, 스틱 축 방향 반전과 충돌·누락 표시', () => {
  const base = snapshot(pad(0, { mapping: '', axes: [0, 0, 0, 0, -1, -1] }));
  const b = detectBinding(base, snapshot(pad(0, { mapping: '', pressed: [5], axes: [0, 0, 0, 0, -1, -1] })), 'button');
  assert.deepEqual(b?.src, { kind: 'button', index: 5 });
  const t = detectBinding(base, snapshot(pad(0, { mapping: '', axes: [0, 0, 0, 0, -1, 1] })), 'button');
  assert.deepEqual(t?.src, { kind: 'axis', index: 5, rest: -1, full: 1 });
  const ax = detectBinding(base, snapshot(pad(0, { mapping: '', axes: [0, -0.9, 0, 0, -1, -1] })), 'axis');
  assert.deepEqual(ax?.src, { index: 1, invert: true });
  assert.equal(detectBinding(base, snapshot(pad(0, { mapping: '', pressed: [5], axes: [0, 0, 0, 0, -1, -1] })), 'axis'), null);
  const p: PadProfile = { id: 'x', buttons: Array(17).fill(null), axes: [{ index: 0, invert: false }, { index: 0, invert: false }, null, null] };
  p.buttons[0] = { kind: 'button', index: 1 }; p.buttons[1] = { kind: 'button', index: 1 };
  const r = validateProfile(p);
  assert.ok(r.conflicts.length >= 2);
  assert.ok(r.missing.includes('RT (발사)'));
});

test('저장된 보정 목록이 깨졌으면 비운다', () => {
  assert.deepEqual(loadProfiles('{bad'), { v: 1, profiles: {} });
  assert.deepEqual(loadProfiles(JSON.stringify({ v: 1, profiles: { a: { id: 'b', buttons: [], axes: [] } } })), { v: 1, profiles: {} });
});
