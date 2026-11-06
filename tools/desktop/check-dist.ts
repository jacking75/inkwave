// 데스크톱 산출물 검수(34번 F01-D·F01-E). 앱을 띄우지 않고 .desktop-dist만 읽어 확인한다:
//   진입점(index.html → desktop/bootstrap.js, desktop.html → desktop/launcher.js)과 게임 묶음(src/bundle/main.js)이 있다
//   three import map 경로·한글 글꼴(woff2)·라이선스 파일이 있다(오프라인 시작·외부 글꼴 다운로드 없음)
//   음원 manifest의 모든 url이 인코딩된 상대 경로이고 실제 파일이 있다
//   CSP가 로컬 자산·blob 음원과 허용된 통신만 연다
// usage: node .desktop-tools/check-dist.js   (npm run desktop:prepare 뒤)
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, '.desktop-dist');
const problems: string[] = [];
const exists = async (p: string): Promise<boolean> => stat(p).then(() => true, () => false);
const need = async (rel: string, why: string): Promise<void> => { if (!(await exists(path.join(dist, rel)))) problems.push(`${why}: ${rel} 없음`); };

const index = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!index.includes('./desktop/bootstrap.js')) problems.push('index.html이 호스트 bootstrap을 부르지 않는다');
if (index.includes('./src/main.js')) problems.push('index.html에 원본 게임 진입점이 남아 있다');
await need('desktop/bootstrap.js', '호스트 연결');
await need('desktop.html', '시작 화면');
await need('desktop/launcher.js', '시작 화면 스크립트');
await need('src/bundle/main.js', '게임 묶음');
// import map의 three 경로
for (const m of index.matchAll(/"(three[^"]*)"\s*:\s*"([^"]+)"/g)) await need(m[2].replace(/^\.\//, ''), `import map ${m[1]}`);
// 글꼴: index.html이 preload하는 woff2와 assets/fonts의 라이선스
for (const m of index.matchAll(/href="\.\/(assets\/fonts\/[^"]+\.woff2)"/g)) await need(m[1], '글꼴');
const fonts = await readdir(path.join(dist, 'assets/fonts')).catch(() => [] as string[]);
if (!fonts.some((f) => /^LICENSE-/i.test(f))) problems.push('글꼴 라이선스 파일이 없다');
if (!fonts.some((f) => /\.woff2$/i.test(f))) problems.push('오프라인 글꼴(woff2)이 없다');
if (/fonts\.googleapis|fonts\.gstatic/.test(index)) problems.push('외부 글꼴 다운로드에 의존한다');
// 음원 manifest
let tracks = 0;
try {
  const man = JSON.parse(await readFile(path.join(dist, 'songs/manifest.json'), 'utf8')) as { tracks: Record<string, Array<{ url: string }>> };
  for (const list of Object.values(man.tracks)) for (const t of list) {
    tracks++;
    if (/^[a-z]+:/i.test(t.url) || t.url.startsWith('/')) { problems.push(`음원 url이 상대 경로가 아니다: ${t.url}`); continue; }
    if (/[ #?]/.test(t.url)) problems.push(`음원 url이 인코딩되지 않았다: ${t.url}`);
    await need(t.url.split('/').map(decodeURIComponent).join('/'), '음원');
  }
} catch (e) { problems.push(`songs/manifest.json을 읽지 못했다: ${(e as Error).message}`); }
// CSP
const conf = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as { app: { security: { csp: string } } };
const csp = conf.app.security.csp;
for (const d of ["default-src 'self'", "media-src 'self' blob:", "object-src 'none'", "font-src 'self'"]) if (!csp.includes(d)) problems.push(`CSP에 ${d} 없음`);
if (/\bhttps?:\/\/\*/.test(csp) || /connect-src[^;]*\*/.test(csp)) problems.push('CSP connect-src가 모든 주소를 연다');

console.log(JSON.stringify({ ok: problems.length === 0, tracks, fonts: fonts.length, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
