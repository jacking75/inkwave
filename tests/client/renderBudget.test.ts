// 렌더 픽셀 총량 상한(34번 F02): DPR만 막으면 4K 창을 그대로 그린다. 큰 창에서도 프리셋의 픽셀 총량을 넘지 않고,
// 작은 창에서는 기존 DPR 상한 그대로인지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, effectivePixelRatio } from '../../src/config.js';

test('큰 창은 픽셀 총량 상한까지만, 작은 창은 DPR·프리셋 상한 그대로', () => {
  for (const [id, q] of Object.entries(QUALITY)) {
    for (const [w, h, dpr] of [[3840, 2160, 1], [2560, 1440, 2], [1920, 1080, 1.5], [1280, 720, 1], [800, 600, 3]] as const) {
      const pr = effectivePixelRatio(dpr, q, w, h);
      assert.ok(w * h * pr * pr <= q.maxPixels * 1.0001, `${id} ${w}x${h}@${dpr}: ${pr}`);
      assert.ok(pr <= Math.min(dpr, q.pixelRatio) + 1e-9, `${id} DPR 상한`);
    }
  }
  assert.equal(effectivePixelRatio(1, QUALITY.medium, 1280, 720), 1);
  assert.equal(effectivePixelRatio(0, QUALITY.low, 640, 360), 0.75);
});
