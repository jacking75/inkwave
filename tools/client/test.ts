// 클라이언트 행동 검사 실행기(33번 T005). tests/client/**/*.test.ts를 esbuild로 하나씩 묶어(.tools/tests/) node:test로 돌린다.
// 검사 파일은 src/의 순수 모듈(.ts)을 그대로 import한다. 타입 검사는 npm run typecheck(tsconfig.tests.json)가 맡는다.
//
// usage: node .tools/test.js [이름 일부 ...]
//   인자가 있으면 경로에 그 문자열이 들어간 검사 파일만 돈다. 실패하면 종료 코드 1이다.
// 경로는 셸을 거치지 않고 인자 배열로 넘기므로 공백이 든 경로도 그대로 전달된다.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'tests', 'client');
const outDir = path.join(root, '.tools', 'tests');
const filters = process.argv.slice(2);

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.test.ts')) acc.push(p);
  }
  return acc;
}

const files = walk(testDir).filter((f) => !filters.length || filters.some((k) => f.includes(k))).sort();
if (!files.length) { console.error(filters.length ? `일치하는 검사 파일이 없다: ${filters.join(', ')}` : 'tests/client에 검사 파일이 없다.'); process.exit(1); }

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const outs: string[] = [];
for (const f of files) {
  const rel = path.relative(testDir, f).replace(/\.ts$/, '.mjs');
  const out = path.join(outDir, rel);
  try {
    // three 등 node_modules 패키지는 묶지 않고 실행 때 해석한다
    buildSync({ entryPoints: [f], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: 'inline', logLevel: 'silent' });
  } catch (e) {
    console.error(`묶기 실패: ${path.relative(root, f)}\n${(e as Error).message}`);
    process.exit(1);
  }
  outs.push(out);
}
const r = spawnSync(process.execPath, ['--enable-source-maps', '--test', '--test-reporter=spec', ...outs], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
