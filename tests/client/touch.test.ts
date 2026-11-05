// 가상 키 포인터 처리(33번 T013·T014·T015): 다중 포인터 역할, 취소 해제, 같은 버튼 참조 수, PC 방향 유지·정지,
// 비활성 층 무시, 배치가 화면·안전 영역 밖으로 나가지 않음. 실기기 멀티터치 합격을 대신하지 않는다(상태 처리 검증).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls, computeLayout, type PointerLike } from '../../src/core/touch.js';
import type { Input } from '../../src/core/input.js';

function fakeInput() {
  const touch = { active: true, fingers: 0, mx: 0, mz: 0, ldx: 0, ldy: 0, map: false, fire: false, sub: false, squid: false, jump: false, special: false, cheer: false };
  const log: string[] = [];
  const inp = {
    touch, lastDevice: 'kbm', _latched: {} as Record<string, boolean>,
    touchDown(n: keyof typeof touch) { (touch as Record<string, unknown>)[n] = true; log.push('down:' + n); },
    touchUp(n: keyof typeof touch) { (touch as Record<string, unknown>)[n] = false; log.push('up:' + n); },
    touchMapToggle() { touch.map = !touch.map; },
    pressCode(c: string) { log.push('code:' + c); },
    onPause: () => log.push('pause'),
  };
  return { inp: inp as unknown as Input, touch, log };
}
const W = 1280, H = 720;
function controls(pcPad = false) {
  const f = fakeInput();
  const tc = new TouchControls(f.inp, { pcPad });
  tc.layout(W, H);
  tc.enabled = true;
  return { tc, ...f };
}
const P = (id: number, x: number, y: number, type = 'touch'): PointerLike => ({ pointerId: id, pointerType: type, clientX: x, clientY: y });
const btn = (tc: TouchControls, name: string) => tc.geom.buttons.find((b) => b.name === name)!;

test('이동 + 시점 + 발사를 세 손가락이 동시에 쓰고, 각 손가락을 떼면 자기 역할만 풀린다', () => {
  const { tc, touch } = controls();
  tc._down(P(1, 200, 500));                 // 왼쪽: 이동
  tc._move(P(1, 200, 300));                 // 위로 = 전진
  const f = btn(tc, 'fire');
  tc._down(P(2, f.cx, f.cy));               // 발사(겸 시점)
  tc._down(P(3, 800, 300));                 // 오른쪽 빈 곳: 시점은 이미 발사 손가락이 가졌다 → 무시
  tc._move(P(2, f.cx - 30, f.cy));
  assert.ok(touch.mz > 0.5);
  assert.equal(touch.fire, true);
  assert.equal(touch.ldx, -30);
  tc._up(P(1, 200, 300));
  assert.equal(touch.mz, 0);
  assert.equal(touch.fire, true, '이동 손가락을 떼도 발사는 유지');
  tc._up(P(2, f.cx - 30, f.cy));
  assert.equal(touch.fire, false);
  assert.equal(tc.roles.size, 0);
});

test('pointercancel(OS 제스처)도 해제이며 버튼 밖으로 미끄러져도 역할이 유지된다', () => {
  const { tc, touch } = controls();
  const j = btn(tc, 'squid');
  tc._down(P(5, j.cx, j.cy));
  tc._move(P(5, j.cx + 300, j.cy - 200));
  assert.equal(touch.squid, true);
  tc._up(P(5, j.cx + 300, j.cy - 200));      // pointercancel 경로
  assert.equal(touch.squid, false);
});

test('같은 버튼을 두 손가락이 누르면 한 손가락을 떼도 눌림이 남는다', () => {
  const { tc, touch, log } = controls();
  const j = btn(tc, 'jump');
  tc._down(P(1, j.cx, j.cy)); tc._down(P(2, j.cx + 3, j.cy));
  tc._up(P(1, j.cx, j.cy));
  assert.equal(touch.jump, true);
  tc._up(P(2, j.cx + 3, j.cy));
  assert.equal(touch.jump, false);
  assert.equal(log.filter((l) => l === 'down:jump').length, 1, '두 번째 손가락은 새 누름을 만들지 않는다');
});

test('PC 마우스: 방향을 클릭하면 떼어도 유지되고 가운데를 누르면 멈추며, releaseAll이 유지를 취소한다', () => {
  const { tc, touch } = controls(true);
  const d = tc.geom.dpad;
  tc._down(P(1, d.cx, d.cy - d.r * 0.8, 'mouse'));   // 위 = 전진
  tc._up(P(1, d.cx, d.cy - d.r * 0.8, 'mouse'));
  assert.ok(touch.mz > 0.9);
  // 방향 유지 중 같은 마우스로 오른쪽 영역 드래그 = 조준(이동 유지)
  tc._down(P(1, 900, 300, 'mouse')); tc._move(P(1, 940, 300, 'mouse')); tc._up(P(1, 940, 300, 'mouse'));
  assert.equal(touch.ldx, 40);
  assert.ok(touch.mz > 0.9);
  tc._down(P(1, d.cx, d.cy, 'mouse')); tc._up(P(1, d.cx, d.cy, 'mouse'));
  assert.equal(touch.mz, 0);
  tc._down(P(1, d.cx + d.r * 0.8, d.cy, 'mouse'));
  assert.ok(touch.mx > 0.9);
  tc.releaseAll();
  assert.equal(touch.mx, 0);
  assert.equal(tc.dir, null);
});

test('펜 한 개는 이동과 시점을 동시에 차지하지 않는다', () => {
  const { tc } = controls(true);
  const d = tc.geom.dpad;
  tc._down(P(7, d.cx + d.r * 0.8, d.cy, 'pen'));
  tc._down(P(7, 900, 300, 'pen'));          // 같은 포인터의 두 번째 down은 역할을 덮어쓴다(동시 소유 없음)
  assert.equal(tc.roles.size, 1);
});

test('입력을 받지 않는 층(메뉴·세로)에서는 아무 버튼도 눌리지 않는다', () => {
  const { tc, touch } = controls();
  tc.enabled = false;
  const f = btn(tc, 'fire');
  tc._down(P(1, f.cx, f.cy));
  assert.equal(touch.fire, false);
  assert.equal(tc.roles.size, 0);
});

test('배치: 크기 최소/최대·과도한 위치 이동·노치 안전 영역에서도 모든 버튼이 화면 안이다', () => {
  for (const [w, h] of [[568, 320], [1280, 720], [2560, 1080]]) {
    for (const cfg of [{ size: 0.7, opacity: 1, offsetX: -240, offsetY: -240 }, { size: 1.5, opacity: 1, offsetX: 240, offsetY: 240 }]) {
      const g = computeLayout(w, h, { top: 0, right: 44, bottom: 21, left: 44 }, cfg);
      for (const b of [...g.buttons, g.dpad]) {
        assert.ok(b.cx - b.r >= 44 - 1e-6 && b.cx + b.r <= w - 44 + 1e-6, `${w}x${h} x ${b.cx}`);
        assert.ok(b.cy - b.r >= -1e-6 && b.cy + b.r <= h - 21 + 1e-6, `${w}x${h} y ${b.cy}`);
      }
      assert.ok(Math.min(...g.buttons.map((b) => b.r)) * 2 >= 30, '가장 작은 버튼도 30 px 이상');
    }
  }
});
