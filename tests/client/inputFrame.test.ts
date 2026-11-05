// 공통 입력 프레임(33번 T009): 탭 손실·중복 발사·장치 합산·컨텍스트 관통·프레임률 의존 회전·메뉴 반복.
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputFrameBuilder, type DeviceSample, type ActionName, type LookSettings } from '../../src/core/inputFrame.js';
import type { InputSource } from '../../src/core/inputPolicy.js';

const LOOK: LookSettings = { mouse: 1, touch: 1, pad: 1, invertY: false, touchInvertY: false };
function sample(source: InputSource, o: { move?: [number, number]; act?: Partial<Record<ActionName, [level: boolean, down: boolean]>>; stickR?: [number, number]; stickL?: [number, number]; acted?: boolean } = {}): DeviceSample {
  const actions: DeviceSample['actions'] = {};
  for (const [k, v] of Object.entries(o.act ?? {})) actions[k as ActionName] = { level: v[0], down: v[1] };
  return {
    source, move: { x: o.move?.[0] ?? 0, y: o.move?.[1] ?? 0 }, look: { dx: 0, dy: 0, kind: 'lock' },
    stickL: { x: o.stickL?.[0] ?? 0, y: o.stickL?.[1] ?? 0 }, stickR: { x: o.stickR?.[0] ?? 0, y: o.stickR?.[1] ?? 0 },
    actions, acted: o.acted ?? false,
  };
}

test('프레임 사이의 짧은 탭은 pressed 한 번, 다음 프레임 released 한 번', () => {
  const b = new InputFrameBuilder();
  const f1 = b.build('gameplay', 1 / 60, [sample('virtual', { act: { jump: [false, true] } })], LOOK);
  assert.deepEqual(f1.actions.jump, { held: true, pressed: true, released: false });
  const f2 = b.build('gameplay', 1 / 60, [sample('virtual')], LOOK);
  assert.deepEqual(f2.actions.jump, { held: false, pressed: false, released: true });
  const f3 = b.build('gameplay', 1 / 60, [sample('virtual')], LOOK);
  assert.equal(f3.actions.jump.released, false);
});

test('두 장치가 같은 프레임에 발사해도 pressed는 한 번이고 유지 중 다시 눌림이 나지 않는다', () => {
  const b = new InputFrameBuilder();
  let presses = 0, releases = 0;
  const frames: DeviceSample[][] = [
    [sample('gamepad', { act: { fire: [true, true] } }), sample('keyboardMouse', { act: { fire: [true, true] } })],
    [sample('gamepad', { act: { fire: [true, false] } }), sample('keyboardMouse', { act: { fire: [false, false] } })],
    [sample('gamepad', { act: { fire: [true, false] } }), sample('virtual', { act: { fire: [false, true] } })],   // 다른 장치의 탭: 이미 유지 중
    [sample('gamepad', { act: { fire: [false, false] } })],
  ];
  for (const s of frames) { const f = b.build('gameplay', 1 / 60, s, LOOK); if (f.actions.fire.pressed) presses++; if (f.actions.fire.released) releases++; }
  assert.equal(presses, 1);
  assert.equal(releases, 1);
});

test('이동은 장치를 더하지 않고 하나를 고르며 길이 1 이하이다', () => {
  const b = new InputFrameBuilder();
  const f = b.build('gameplay', 1 / 60, [sample('gamepad', { move: [0, 1] }), sample('keyboardMouse', { move: [1, 1] })], LOOK);
  assert.ok(Math.hypot(f.move.x, f.move.y) <= 1 + 1e-9);
  assert.equal(f.moveSource, 'gamepad');
  // 고른 장치가 계속 움직이는 동안 다른 장치로 넘어가지 않는다
  const g = b.build('gameplay', 1 / 60, [sample('gamepad', { move: [0, 0.5] }), sample('keyboardMouse', { move: [1, 0] })], LOOK);
  assert.equal(g.moveSource, 'gamepad');
  assert.deepEqual(g.move, { x: 0, y: 0.5 });
  // 고른 장치가 중립이 되면 움직이는 장치로 바뀐다
  const h = b.build('gameplay', 1 / 60, [sample('gamepad'), sample('keyboardMouse', { move: [1, 0] })], LOOK);
  assert.equal(h.moveSource, 'keyboardMouse');
});

test('메뉴에서 누른 채 전투로 넘어간 버튼은 뗀 뒤 다시 눌러야 동작한다', () => {
  const b = new InputFrameBuilder();
  const m = b.build('menu', 1 / 60, [sample('gamepad', { act: { confirm: [true, true] } })], LOOK);
  assert.equal(m.actions.confirm.pressed, true);
  const g1 = b.build('gameplay', 1 / 60, [sample('gamepad', { act: { jump: [true, false] } })], LOOK);
  assert.equal(g1.actions.jump.held, false);
  const g2 = b.build('gameplay', 1 / 60, [sample('gamepad', { act: { jump: [true, false] } })], LOOK);
  assert.equal(g2.actions.jump.held, false);
  b.build('gameplay', 1 / 60, [sample('gamepad', { act: { jump: [false, false] } })], LOOK);
  const g4 = b.build('gameplay', 1 / 60, [sample('gamepad', { act: { jump: [true, true] } })], LOOK);
  assert.equal(g4.actions.jump.pressed, true);
});

test('reset() 뒤에는 눌려 있던 발사가 다시 누를 때까지 나오지 않는다(포커스 복귀 자동 발사 방지)', () => {
  const b = new InputFrameBuilder();
  b.build('gameplay', 1 / 60, [sample('gamepad', { act: { fire: [true, true] } })], LOOK);
  b.reset();
  const f = b.build('gameplay', 1 / 60, [sample('gamepad', { act: { fire: [true, false] } })], LOOK);
  assert.equal(f.actions.fire.held, false);
});

test('스틱 시점 회전량은 30·60·120fps에서 같다(dt를 한 번만 곱한다)', () => {
  const turn = (fps: number) => {
    const b = new InputFrameBuilder('gamepad');
    let yaw = 0;
    const dt = 1 / fps;
    for (let i = 0; i < fps; i++) { const f = b.build('gameplay', dt, [sample('gamepad', { stickR: [1, 0] })], LOOK); yaw += f.lookRate.yaw * dt; }
    return yaw;
  };
  const a = turn(30), b = turn(60), c = turn(120);
  for (const v of [a, c]) assert.ok(Math.abs(v - b) / Math.abs(b) < 0.04, `${a} ${b} ${c}`);
});

test('메뉴 방향 반복 횟수는 프레임률과 무관하다', () => {
  const count = (fps: number) => {
    const b = new InputFrameBuilder('gamepad');
    let n = 0;
    for (let i = 0; i < fps; i++) n += b.build('menu', 1 / fps, [sample('gamepad', { act: { dDown: [true, i === 0] } })], LOOK).nav.length;
    return n;
  };
  const n30 = count(30), n60 = count(60), n120 = count(120);
  assert.ok(Math.abs(n30 - n60) <= 1 && Math.abs(n120 - n60) <= 1, `${n30} ${n60} ${n120}`);
  assert.ok(n60 >= 4 && n60 <= 7, `1초 유지 → 최초 1회 + 반복 ${n60}`);
});

test('입력 출처는 의미 있는 조작으로만 바뀌고 겹치면 현재 출처를 유지한다', () => {
  const b = new InputFrameBuilder('keyboardMouse');
  assert.equal(b.build('gameplay', 1 / 60, [sample('gamepad'), sample('keyboardMouse')], LOOK).source, 'keyboardMouse');
  assert.equal(b.build('gameplay', 1 / 60, [sample('gamepad', { acted: true })], LOOK).source, 'gamepad');
  assert.equal(b.build('gameplay', 1 / 60, [sample('gamepad', { acted: true }), sample('virtual', { acted: true })], LOOK).source, 'gamepad');
});
