// 문서 상대 링크 검수(AGENTS.md "Markdown은 실제 상대 링크를 쓰고 링크를 검수한다", 34번 V01). 저장소의 Markdown에서
// [글](상대경로#앵커) 링크의 파일이 실제로 있는지 본다(앵커·외부 URL·메일은 건너뛴다). 생성물·의존성 폴더는 보지 않는다.
// usage: node .tools/doc-links.js
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SKIP = new Set(['node_modules', '.git', '.claude', '.web-dev', '.tools', '.desktop-dist', '.desktop-tools', 'dist', 'target', 'vendor', 'build']);
const files: string[] = [];
const walk = (d: string): void => { for (const f of readdirSync(d)) { if (SKIP.has(f)) continue; const p = path.join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else if (p.endsWith('.md')) files.push(p); } };
walk(root);
const bad: string[] = [];
let n = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');   // 코드 블록 안은 링크가 아니다
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(href)) continue;
    n++;
    const target = decodeURIComponent(href.split('#')[0]);
    if (!target) continue;
    if (!existsSync(path.resolve(path.dirname(f), target))) bad.push(`${path.relative(root, f)} → ${href}`);
  }
}
console.log(JSON.stringify({ files: files.length, links: n, broken: bad.length, bad: bad.slice(0, 50) }, null, 1));
process.exit(bad.length ? 1 : 0);
