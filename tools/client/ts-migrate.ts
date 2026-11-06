// 기존 JavaScript 모듈의 TypeScript 이전 도우미(33번 T069~T071). 이름만 바꾸지 않도록 TypeScript 언어 서비스의 공식 코드 수정을
// 반복 적용한 뒤 남은 오류와 `any`를 보고한다. 남은 오류는 사람이(에이전트가) 직접 고친다.
//   1) git mv x.js → x.ts(이력 보존)
//   2) 언어 서비스(tsconfig.json, strict)로 이전한 파일의 진단을 받아 일괄 수정(fixId)을 반복한다:
//        fixMissingMember  — this.x = … 로 생기는 속성을 클래스에 선언(대입에서 추론한 타입). 기존 관례대로 `declare x: T;`로 바꾼다
//                            (ESNext 클래스 필드는 super() 뒤 undefined로 다시 정의되므로 declare여야 동작이 같다)
//        inferFromUsage    — 매개변수·변수 타입을 사용처에서 추론
//   3) 남은 진단(코드별 개수)과 파일별 `any` 수를 출력한다.
// usage: node .tools/ts-migrate.js [--no-move] [--passes 6] <src/파일.js ...>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const noMove = args.includes('--no-move');
const pi = args.indexOf('--passes');
const passes = pi >= 0 ? Number(args[pi + 1]) : 6;
const inputs = args.filter((a, i) => !a.startsWith('--') && !(pi >= 0 && i === pi + 1));
const root = process.cwd();
const FIX_IDS = ['fixMissingMember', 'inferFromUsage'];

// 1) 이름 바꾸기
const targets: string[] = [];
for (const f of inputs) {
  const abs = path.resolve(root, f);
  const ts2 = abs.replace(/\.js$/, '.ts');
  if (abs.endsWith('.js') && existsSync(abs)) {
    if (!noMove) execFileSync('git', ['mv', path.relative(root, abs), path.relative(root, ts2)], { cwd: root });
    targets.push(noMove ? abs : ts2);
  } else if (existsSync(ts2)) targets.push(ts2);
}
if (!targets.length) { console.error('대상 파일이 없다'); process.exit(1); }
const norm = (p: string): string => path.resolve(p).replace(/\\/g, '/').toLowerCase();
const targetSet = new Set(targets.map(norm));

// 2) 언어 서비스
const cfgPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')!;
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, path.dirname(cfgPath));
const versions = new Map<string, number>();
const texts = new Map<string, string>();
const read = (f: string): string | undefined => { const k = norm(f); if (texts.has(k)) return texts.get(k); const t = ts.sys.readFile(f); if (t !== undefined) texts.set(k, t); return t; };
let fileNames = cfg.fileNames.filter((f) => !/\.js$/.test(f) || !targetSet.has(norm(f.replace(/\.js$/, '.ts'))));
for (const t of targets) if (!fileNames.some((f) => norm(f) === norm(t))) fileNames.push(t);
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => fileNames,
  getScriptVersion: (f) => String(versions.get(norm(f)) ?? 0),
  getScriptSnapshot: (f) => { const t = read(f); return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t); },
  getCurrentDirectory: () => root,
  getCompilationSettings: () => ({ ...cfg.options, noEmit: true }),
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists, readFile: read, readDirectory: ts.sys.readDirectory, directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const fmt: ts.FormatCodeSettings = { ...ts.getDefaultFormatCodeSettings(), indentSize: 2, tabSize: 2, convertTabsToSpaces: true, semicolons: ts.SemicolonPreference.Insert };
const prefs: ts.UserPreferences = { quotePreference: 'single', includeInlayParameterNameHints: 'none' };

function apply(changes: readonly ts.FileTextChanges[], id: string): number {
  let n = 0;
  for (const fc of changes) {
    if (!targetSet.has(norm(fc.fileName))) continue;   // 이전 대상 파일만 고친다
    let text = read(fc.fileName)!;
    const sorted = [...fc.textChanges].sort((a, b) => b.span.start - a.span.start);
    for (const c of sorted) {
      let nt = c.newText;
      // 사용처 추론은 깨끗한 결과만 받는다: any·인라인 객체 타입·60자 넘는 타입은 버리고 사람이 타입을 단다(광범위한 any 금지)
      if (id === 'inferFromUsage' && (/\bany\b/.test(nt) || /[{}]/.test(nt) || nt.length > 60)) continue;
      // 클래스 속성 선언은 declare로(동작 보존)
      if (id === 'fixMissingMember') nt = nt.replace(/^(\s*)(?!declare\b|readonly\b|private\b|static\b|public\b)([A-Za-z_$][\w$]*)(\??): ([^;\n]+);/gm, '$1declare $2$3: $4;');
      if (args.includes('--debug') && /any/.test(nt)) console.log('[debug]', id, JSON.stringify(nt).slice(0, 120));
      text = text.slice(0, c.span.start) + nt + text.slice(c.span.start + c.span.length);
      n++;
    }
    texts.set(norm(fc.fileName), text);
    versions.set(norm(fc.fileName), (versions.get(norm(fc.fileName)) ?? 0) + 1);
  }
  return n;
}

for (let p = 0; p < passes; p++) {
  let changed = 0;
  for (const f of targets) {
    for (const id of FIX_IDS) {
      try {
        const r = ls.getCombinedCodeFix({ type: 'file', fileName: f }, id, fmt, prefs);
        changed += apply(r.changes, id);
      } catch (e) { console.warn(`[ts-migrate] ${path.relative(root, f)} ${id}: ${(e as Error).message.split('\n')[0]}`); }
    }
  }
  console.log(`[ts-migrate] 단계 ${p + 1}: 변경 ${changed}`);
  if (!changed) break;
}
for (const f of targets) writeFileSync(f, read(f)!);

// 3) 보고
const report: Record<string, { errors: number; any: number; codes: Record<number, number> }> = {};
const showErr = args.includes('--errors');
for (const f of targets) {
  const d = [...ls.getSyntacticDiagnostics(f), ...ls.getSemanticDiagnostics(f)];
  const codes: Record<number, number> = {};
  for (const x of d) codes[x.code] = (codes[x.code] ?? 0) + 1;
  const anyN = (read(f)!.match(/\bany\b/g) ?? []).length;
  report[path.relative(root, f)] = { errors: d.length, any: anyN, codes };
  if (showErr) for (const x of d.slice(0, 400)) { const lc = x.file ? x.file.getLineAndCharacterOfPosition(x.start ?? 0) : { line: 0, character: 0 }; console.log(`${path.relative(root, f)}:${lc.line + 1}:${lc.character + 1} TS${x.code} ${ts.flattenDiagnosticMessageText(x.messageText, ' ').slice(0, 160)}`); }
}
console.log(JSON.stringify(report, null, 1));
