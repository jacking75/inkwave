// 입력 정책·설정 이전(33번 T007·T008): 가상 키 표시와 성능 분류의 분리, 구버전·깨진 설정의 한 번 이전.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateInputSettings, virtualVisible, virtualEnabled, INPUT_DEFAULTS, resetVirtualLayout, type PolicyState } from '../../src/core/inputPolicy.js';

const base: PolicyState = { hardware: 'desktop', mode: 'auto', padStatus: 'awaitingGesture', source: 'keyboardMouse', pointerLocked: false, context: 'gameplay', portrait: false, focused: true };

test('구버전 touchControls는 한 번만 옮기고 두 번째 실행은 사용자 값을 덮어쓰지 않는다', () => {
  assert.equal(migrateInputSettings({ touchControls: 'on' }).input.virtualControls, 'always');
  assert.equal(migrateInputSettings({ touchControls: 'off' }).input.virtualControls, 'auto');
  assert.equal(migrateInputSettings({ touchControls: 'auto' }).input.virtualControls, 'auto');
  const first = migrateInputSettings({ touchControls: 'off', quality: 'low' });
  assert.equal(first.changed, true);
  const saved = { ...first.input, virtualControls: 'always' as const };   // 사용자가 새 화면에서 바꿨다
  const second = migrateInputSettings({ ...saved, touchControls: 'off' });
  assert.equal(second.changed, false);
  assert.equal(second.input.virtualControls, 'always');
});

test('값 누락·범위 초과·문자열·깨진 객체는 안전한 기본값과 범위로 복구한다', () => {
  for (const bad of [null, 'garbage', [1, 2], 42]) assert.deepEqual(migrateInputSettings(bad).input, INPUT_DEFAULTS);
  const r = migrateInputSettings({ inputVersion: 2, virtualControls: 'sometimes', vcSize: 99, vcOpacity: -1, vcOffsetX: 'NaN', touchSensitivity: '1.5' });
  assert.equal(r.input.virtualControls, 'auto');
  assert.equal(r.input.vcSize, 1.5);
  assert.equal(r.input.vcOpacity, 0.3);
  assert.equal(r.input.vcOffsetX, 0);
  assert.equal(r.input.touchSensitivity, 1.5);
  assert.equal(r.changed, true);
});

test('미래 버전 설정은 버전을 낮추지 않는다', () => {
  const r = migrateInputSettings({ inputVersion: 9, virtualControls: 'always' });
  assert.equal(r.input.inputVersion, 9);
  assert.equal(r.input.virtualControls, 'always');
});

test('가상 키: 패드로 실제 조작할 때만 접고, 미매핑 패드·PC 무잠금은 보이고, 잠금 중 PC는 접는다', () => {
  assert.equal(virtualVisible(base), true);
  assert.equal(virtualVisible({ ...base, padStatus: 'ready', source: 'gamepad' }), false);
  assert.equal(virtualVisible({ ...base, padStatus: 'ready', source: 'virtual' }), true);
  assert.equal(virtualVisible({ ...base, padStatus: 'unmapped', source: 'gamepad' }), true);
  assert.equal(virtualVisible({ ...base, pointerLocked: true }), false);
  assert.equal(virtualVisible({ ...base, hardware: 'mobile', pointerLocked: true }), true);
  assert.equal(virtualVisible({ ...base, mode: 'always', padStatus: 'ready', source: 'gamepad' }), true);
});

test('가상 키 입력은 전투·지도 컨텍스트, 가로, 포커스에서만 받는다', () => {
  assert.equal(virtualEnabled(base), true);
  for (const c of ['menu', 'textEntry'] as const) assert.equal(virtualEnabled({ ...base, context: c }), false);
  assert.equal(virtualEnabled({ ...base, portrait: true }), false);
  assert.equal(virtualEnabled({ ...base, focused: false }), false);
});

test('배치 초기화는 크기·불투명도·위치만 되돌린다', () => {
  const s = { ...INPUT_DEFAULTS, vcSize: 1.4, vcOffsetX: 200, virtualControls: 'always' as const, touchSensitivity: 2 };
  const r = resetVirtualLayout(s);
  assert.equal(r.vcSize, 1); assert.equal(r.vcOffsetX, 0);
  assert.equal(r.virtualControls, 'always'); assert.equal(r.touchSensitivity, 2);
});
