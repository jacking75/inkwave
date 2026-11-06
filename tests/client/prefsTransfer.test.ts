// 설정·프로필 옮기기(34번 F01-D): 다른 게임 파일·더 새 형식·깨진 JSON은 거절, 모르는 키·틀린 타입은 버리고 알려진 값만 받는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPrefs, parsePrefs } from '../../src/platform/prefsTransfer.js';

const SD = { quality: 'low', fov: 82, invertY: false, locale: 'ko' };
const PD = { name: 'Player', weapon: 'shooter', wins: 0 };

test('내보낸 파일을 다시 가져오면 같은 값', () => {
  const r = parsePrefs(exportPrefs({ quality: 'high', fov: 90, invertY: true, locale: 'en' }, { name: 'Ink', weapon: 'roller', wins: 3, style: { hair: 2 } }, new Date(0)), SD, PD);
  assert.ok(!('error' in r));
  assert.deepEqual(r.settings, { quality: 'high', fov: 90, invertY: true, locale: 'en' });
  assert.deepEqual(r.profile, { name: 'Ink', weapon: 'roller', wins: 3, style: { hair: 2 } });
});

test('깨진 JSON·다른 파일·새 형식은 거절, 모르는 키·틀린 타입·긴 이름은 정리', () => {
  for (const j of ['{', '[]', '{"kind":"x"}', '{"kind":"inkwave.prefs","v":99,"settings":{},"profile":{}}']) assert.ok('error' in parsePrefs(j, SD, PD), j);
  const r = parsePrefs(JSON.stringify({ kind: 'inkwave.prefs', v: 1, settings: { quality: 3, fov: Infinity, hack: 1, locale: 'en' }, profile: { name: 'x'.repeat(40), wins: '9', style: { hair: 1, evil: 'a' } } }), SD, PD);
  assert.ok(!('error' in r));
  assert.deepEqual(r.settings, { locale: 'en' });
  assert.equal((r.profile.name as string).length, 16);
  assert.deepEqual(r.profile.style, { hair: 1 });
  assert.ok(r.dropped.includes('settings.hack') && r.dropped.includes('settings.quality') && r.dropped.includes('profile.wins'));
});
