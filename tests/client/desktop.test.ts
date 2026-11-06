// 데스크톱 창 상태·외부 링크 규칙(34번 F01-C): 깨진 저장은 기본 창, 모니터가 바뀌어도 창이 화면 안·최소 크기 이상,
// 허용 목록 밖 외부 주소·위험한 스킴은 열지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWindowState, fitToMonitor, linkPolicy, MIN_WINDOW } from '../../desktop/windowState.js';

test('창 상태: 깨진 값은 null, 작은 모니터로 옮겨도 화면 안·최소 크기 이상', () => {
  for (const raw of [null, '', '{', '{"w":"a"}', '[]', '{"w":1000,"h":700,"x":0}']) assert.equal(parseWindowState(raw), null);
  const s = parseWindowState('{"w":2400,"h":1500,"x":3000,"y":-200,"maximized":true}')!;
  const f = fitToMonitor(s, { x: 0, y: 0, w: 1366, h: 768 });
  assert.ok(f.w <= 1366 && f.h <= 768 && f.w >= MIN_WINDOW.w && f.h >= MIN_WINDOW.h);
  assert.ok(f.x >= 0 && f.x + f.w <= 1366 && f.y >= 0 && f.y + f.h <= 768);
  assert.equal(f.maximized, true);
});

test('외부 링크: 같은 출처는 안쪽, 허용 목록만 열기, 나머지·위험 스킴은 막기', () => {
  const page = 'http://tauri.localhost/desktop.html';
  assert.equal(linkPolicy('/src/main.js', page), 'internal');
  assert.equal(linkPolicy('https://github.com/jaydendavisnc/inkwave/issues', page), 'open');
  assert.equal(linkPolicy('https://inkwave-aah.pages.dev', page), 'open');
  assert.equal(linkPolicy('https://github.com/jaydendavisnc/inkwave-evil', page), 'block');
  assert.equal(linkPolicy('https://example.com', page), 'block');
  assert.equal(linkPolicy('javascript:alert(1)', page), 'block');
  assert.equal(linkPolicy('file:///C:/Windows', page), 'block');
});
