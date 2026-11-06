// 언어 계층(34번 F06): 한국어 기본·영어 선택·복구 규칙, 짝 표의 보간 계약, 그리고 화면 문구 누락(짝 없음)을 잡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { t, tIn, setLocale, getLocale, normalizeLocale, interpolate, hasPair } from '../../src/ui/i18n.js';
import { PAIRS } from '../../src/ui/i18n-pairs.js';

test('언어 값: 없거나 깨진 값은 한국어, 명시적 영어는 유지', () => {
  for (const v of [undefined, null, '', 'fr', 'EN', 3, {}]) assert.equal(normalizeLocale(v), 'ko');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('ko'), 'ko');
});

test('번역: 원문이 한국어든 영어든 현재 언어로, 짝 없는 문구는 원문, 보간', () => {
  setLocale('ko');
  assert.equal(t('작업장으로'), '작업장으로');
  assert.equal(t('RESET TO DEFAULTS'), '기본값으로 되돌리기');
  setLocale('en');
  assert.equal(getLocale(), 'en');
  assert.equal(t('작업장으로'), 'To the Workshop');
  assert.equal(t('RESET TO DEFAULTS'), 'RESET TO DEFAULTS');
  assert.equal(t('짝이 없는 문구'), '짝이 없는 문구');
  assert.equal(t('패드 {n}개 연결 · 버튼을 누르면 시작', { n: 2 }), '2 controller(s) connected · press a button to start');
  setLocale('ko');
  assert.equal(interpolate('{a}/{b}', { a: 1 }), '1/{b}');
  assert.equal(tIn('en', '시작'), 'Start');
});

test('짝 표: 같은 한국어가 다른 영어로 갈라지지 않고, 자리표시자가 양쪽에서 같다', () => {
  const ko = new Map<string, string>();
  const bad: string[] = [];
  for (const [k, e] of PAIRS) {
    if (!k.trim() || !e.trim() || k !== k.trim() || e !== e.trim()) bad.push(`빈 값·앞뒤 공백: ${k} / ${e}`);
    if (ko.has(k) && ko.get(k) !== e) bad.push(`한국어 중복: ${k}`);
    ko.set(k, e);
    const ph = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    if (ph(k) !== ph(e)) bad.push(`자리표시자 불일치: ${k} / ${e}`);
  }
  assert.deepEqual(bad, []);
});

// 소스 전체에서 t('…') 원문과, 메뉴 공통 지점(_btn label·sub, _header, toast, _prompts, 설정 행 label·help·선택지, MENU_DESC)으로
// 들어가는 문구를 모아 짝이 있는지 본다. 짝이 없으면 다른 언어 화면에 원문이 그대로 남는다.
const root = path.resolve(import.meta.dirname ?? '.', '../..');
function files(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) files(p, acc); else if (p.endsWith('.ts')) acc.push(p); }
  return acc;
}
const LIT = String.raw`'((?:[^'\\]|\\.)*)'`;
test('화면 문구 누락 없음: t() 원문과 메뉴 공통 지점의 문구에 모두 짝이 있다', () => {
  const missing = new Set<string>();
  const src = path.join(root, 'src');
  for (const f of files(src)) {
    if (/i18n(-pairs)?\.ts$/.test(f)) continue;   // (설명 주석의 예시는 제외)
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(new RegExp(String.raw`\bt\(\s*` + LIT, 'g'))) if (!hasPair(m[1].replace(/\\'/g, "'"))) missing.add(`${path.relative(root, f)}: ${m[1]}`);
  }
  for (const f of ['src/ui/menus.ts', 'src/ui/campaignScreens.ts']) {
    const s = readFileSync(path.join(root, f), 'utf8');
    const add = (x: string): void => { const v = x.replace(/\\'/g, "'"); if (v && !v.startsWith('iw-') && !hasPair(v)) missing.add(`${f}: ${v}`); };
    const desc = s.match(/const MENU_DESC[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (desc) for (const m of desc[1].matchAll(new RegExp(':\\s*' + LIT, 'g'))) add(m[1]);
    for (const p of [String.raw`\blabel:\s*`, String.raw`\bhelp:\s*`, String.raw`\bsub:\s*`, String.raw`_header\(\s*`, String.raw`\btoast\(\s*`]) for (const m of s.matchAll(new RegExp(p + LIT, 'g'))) add(m[1]);
    for (const pr of s.matchAll(/_prompts\(\[([\s\S]*?)\]\)/g)) for (const m of pr[1].matchAll(new RegExp(String.raw`\[\s*(?:'[^']*'|\[[^\]]*\])\s*,\s*(?:'[^']*'|null)\s*,\s*` + LIT + String.raw`\s*\]`, 'g'))) add(m[1]);
    for (const o of s.matchAll(/options:\s*\[([\s\S]*?)\]\s*,\s*help/g)) for (const m of o[1].matchAll(new RegExp(String.raw`\[\s*(?:'[^']*'|[\d.]+|true|false)\s*,\s*` + LIT + String.raw`\s*\]`, 'g'))) add(m[1]);
  }
  assert.deepEqual([...missing].slice(0, 60), []);
});
