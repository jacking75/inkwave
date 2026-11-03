import { cp, mkdir, readFile, writeFile, readdir, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.desktop-dist');
// 생성물 폴더만 지우며 심볼릭 링크·junction을 통한 다른 경로 삭제를 차단한다.
if (path.dirname(output) !== root || path.basename(output) !== '.desktop-dist') throw new Error('잘못된 출력 경로이다.');
const existing = await lstat(output).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (existing?.isSymbolicLink()) throw new Error('출력 폴더가 링크이면 준비를 중단한다.');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'desktop'), { recursive: true });
for (const folder of ['src', 'styles', 'assets', 'songs', 'vendor']) {
  await cp(path.join(root, folder), path.join(output, folder), { recursive: true, dereference: false });
}
const source = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = '<script type="module" src="./src/main.js"></script>';
if (source.split(entry).length !== 2) throw new Error('게임 진입점이 변경돼 호스트 연결을 중단한다.');
await writeFile(path.join(output, 'index.html'), source.replace(entry, '<script type="module" src="./desktop/bootstrap.js"></script>'));
await cp(path.join(root, 'desktop/desktop.html'), path.join(output, 'desktop.html'));
await cp(path.join(root, 'desktop/launcher.css'), path.join(output, 'desktop/launcher.css'));
await build({
  absWorkingDir: root,
  entryPoints: ['desktop/bootstrap.ts', 'desktop/launcher.ts'],
  outdir: path.join(output, 'desktop'),
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
});
// 기존 manifest가 없을 때만 출력 폴더에서 만든다. ffmpeg나 게임을 실행하지 않는다.
const manifestPath = path.join(output, 'songs/manifest.json');
const manifest = await lstat(manifestPath).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (!manifest) {
  const tracks: Record<string, { url: string; title: string; gainDb: number }[]> = {};
  for (const [id, folder] of Object.entries({ battle: 'in game', battle_final: 'now or never', menu: 'lobby' })) {
    const files = await readdir(path.join(output, 'songs', folder)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return [] as string[];
    });
    tracks[id] = files.filter((file) => /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(file)).sort().map((file) => ({
      url: ['songs', folder, file].map(encodeURIComponent).join('/'),
      title: file.replace(/\.[^.]+$/, ''), gainDb: 0,
    }));
  }
  await writeFile(manifestPath, JSON.stringify({ tracks }, null, 2));
}
console.log('Tauri 웹 산출물 준비 완료: .desktop-dist (앱 기동 없음)');
