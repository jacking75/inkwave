// 웹 개발 경로(33번 T003)이다. src/의 .ts는 타입 검사(tsc --noEmit) 통과 후에만 esbuild로 변환하고, 기존 .js는
// 줄 번호를 지키려고 그대로 복사한다. 출력 .web-dev/는 index.html·assets·styles·vendor·songs·tools와 저장소의 상대
// 구조가 같다(정적 폴더는 junction이라 자산 변경이 바로 보인다).
//
// usage: node .tools/dev.js [port=8490] [--once] [--no-watch]
//   기본       최초 검사·조립 → 서버 → 변경 감시(tsc -w)·재조립. 새로고침으로 반영한다.
//   --no-watch 한 번 조립하고 서버만 띄운다.
//   --once     한 번 조립하고 끝낸다(서버 없음). 검사 실패면 종료 코드 1이며 출력을 바꾸지 않는다.
// 검사가 실패하면 직전 성공 출력이 남지만 .web-dev/__dev/status.json이 실패를 기록하고 페이지가 붉은 상자로 알린다.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, watch, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.web-dev');
const outSrc = path.join(out, 'src');
const srcDir = path.join(root, 'src');
const LINKED = ['assets', 'styles', 'vendor', 'songs', 'tools'];
const ENTRY = '<script type="module" src="./src/main.js"></script>';

const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a)) ?? '8490';
const once = args.includes('--once');
const watchMode = !once && !args.includes('--no-watch');

interface Status { ok: boolean; at: string; errors: string[] }

function guardOutput(): void {
  // 생성물 폴더만 다루며 링크를 통한 다른 경로 삭제를 막는다.
  if (path.dirname(out) !== root || path.basename(out) !== '.web-dev') throw new Error('잘못된 출력 경로이다.');
  if (existsSync(out) && lstatSync(out).isSymbolicLink()) throw new Error('.web-dev가 링크이면 중단한다.');
  mkdirSync(path.join(out, '__dev'), { recursive: true });
  mkdirSync(outSrc, { recursive: true });
  if (lstatSync(outSrc).isSymbolicLink()) throw new Error('.web-dev/src가 링크이면 중단한다.');
  for (const name of LINKED) {
    const link = path.join(out, name), target = path.join(root, name);
    if (!existsSync(target)) mkdirSync(target, { recursive: true });
    if (!existsSync(link)) symlinkSync(target, link, 'junction');
  }
}

function writeStatus(s: Status): void {
  writeFileSync(path.join(out, '__dev', 'status.json'), JSON.stringify(s, null, 2));
}

function writeIndex(): void {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  if (html.split(ENTRY).length !== 2) throw new Error('index.html의 게임 진입점이 바뀌어 개발 경로 연결을 중단한다.');
  // 타입 검사 실패 시 직전 출력이 실행 중임을 화면에 알린다(개발 출력에만 들어간다).
  const probe = `<script>fetch('./__dev/status.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){if(s.ok)return;`
    + `var b=document.getElementById('boot-error');if(!b)return;b.style.display='block';b.style.whiteSpace='pre-wrap';`
    + `b.textContent='[dev] 타입 검사 실패: 이전 성공 출력이 실행 중이다 ('+s.at+')\\n\\n'+s.errors.join('\\n')}).catch(function(){})</script>\n`;
  writeFileSync(path.join(out, 'index.html'), html.replace(ENTRY, probe + ENTRY));
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

// src → .web-dev/src. 바뀐 파일만 다시 쓰고 원본이 사라진 출력은 지운다.
function sync(): number {
  const want = new Map<string, string>();   // 출력 상대 경로 → 원본 절대 경로
  for (const file of walk(srcDir)) {
    if (file.endsWith('.d.ts')) continue;
    const rel = path.relative(srcDir, file);
    const dest = rel.endsWith('.ts') ? rel.slice(0, -3) + '.js' : rel;
    const prev = want.get(dest);
    if (prev) throw new Error(`같은 출력 경로를 두 원본이 만든다: ${path.relative(root, prev)}, ${path.relative(root, file)}`);
    want.set(dest, file);
  }
  let written = 0;
  for (const [dest, file] of want) {
    const target = path.join(outSrc, dest);
    if (existsSync(target) && statSync(target).mtimeMs >= statSync(file).mtimeMs) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    if (file.endsWith('.ts')) {
      const code = transformSync(readFileSync(file, 'utf8'), {
        loader: 'ts', format: 'esm', target: 'esnext', sourcemap: 'inline', sourcefile: path.relative(path.dirname(target), file).replaceAll('\\', '/'),
      }).code;
      writeFileSync(target, code);
    } else copyFileSync(file, target);
    written++;
  }
  for (const file of walk(outSrc)) {
    if (!want.has(path.relative(outSrc, file))) { rmSync(file); written++; }
  }
  return written;
}

const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function assemble(errors: string[]): boolean {
  if (errors.length) {
    writeStatus({ ok: false, at: new Date().toISOString(), errors });
    console.error(`[dev] 타입 검사 실패 ${errors.length}줄 — 출력은 직전 성공 상태로 남는다`);
    return false;
  }
  writeIndex();
  const n = sync();
  writeStatus({ ok: true, at: new Date().toISOString(), errors: [] });
  console.log(`[dev] 조립 완료 (${n}개 파일 갱신)`);
  return true;
}

function checkOnce(): string[] {
  const r = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.json', '--pretty', 'false'], { cwd: root, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status === 0) return [];
  const lines = `${r.stdout}${r.stderr}`.split(/\r?\n/).filter(Boolean);
  return lines.length ? lines : [`tsc 종료 코드 ${r.status}`];
}

function findPython(): string {
  const candidates = [process.env.PYTHON, 'python3', 'python', 'py'].filter((c): c is string => !!c);
  for (const c of candidates) {
    const p = spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' });
    if (!p.error && p.status === 0 && p.stdout.trim() === '1') return c;
  }
  throw new Error('Python을 찾지 못했다. PYTHON 환경 변수로 지정한다.');
}

guardOutput();
const ok = assemble(checkOnce());
if (once) process.exit(ok ? 0 : 1);
if (!ok) { console.error('[dev] 최초 검사가 실패해 서버를 띄우지 않는다.'); process.exit(1); }

const children: ChildProcess[] = [];
const server = spawn(findPython(), [path.join(root, 'tools', 'serve.py'), port, '--dir', out], { cwd: root, stdio: 'inherit' });
children.push(server);

if (watchMode) {
  // tsc -w가 검사를 맡는다. 한 회차의 진단을 모았다가 "Found N errors" 줄에서 조립하거나 실패를 기록한다.
  const tsc = spawn(process.execPath, [tscBin, '-p', 'tsconfig.json', '-w', '--preserveWatchOutput', '--pretty', 'false'], { cwd: root });
  children.push(tsc);
  let pending: string[] = [];
  let first = true;
  let buf = '';
  tsc.stdout?.setEncoding('utf8');
  tsc.stdout?.on('data', (chunk: string) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.replace(/^\[?[\d:\sAPMapm.-]+\]?\s*-\s*/, '');
      const m = /Found (\d+) errors?\./.exec(line);
      if (m) {
        // 첫 회차는 위에서 이미 조립했다.
        if (!first || Number(m[1]) > 0) {
          try { assemble(Number(m[1]) > 0 ? pending : []); } catch (e) { console.error('[dev]', (e as Error).message); }
        }
        first = false; pending = [];
      } else if (/error TS\d+/.test(line)) pending.push(line);
    }
  });
  tsc.stderr?.pipe(process.stderr);
  // index.html은 tsc가 보지 않으므로 따로 감시한다.
  watch(path.join(root, 'index.html'), () => { try { writeIndex(); } catch (e) { console.error('[dev]', (e as Error).message); } });
}

const stop = (): void => { for (const c of children) if (!c.killed) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => { console.error(`[dev] 서버 종료 (${code})`); stop(); });
