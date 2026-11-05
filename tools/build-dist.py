# Assemble dist/: the game files plus only the three.js addons the game imports (and their deps).
# src/ comes from the compiled dev output (.web-dev/src: npm run compile — .ts transpiled, .js verbatim), never the raw sources.
# Everything is assembled in .dist-staging/ first and swapped into dist/ only when the whole assembly succeeded, so a
# failed build never leaves a half-written dist/ that looks like a fresh result. dist/build.json stamps the swap.
import re, os, shutil, glob, json, datetime, sys
root = 'vendor/three/jsm'
keep = {'.vercel', 'vercel.json'}
SRC = '.web-dev/src'
STAGE = '.dist-staging'
status = '.web-dev/__dev/status.json'
if not os.path.isfile(os.path.join(SRC, 'main.js')): raise SystemExit('build-dist: run `npm run compile` first (.web-dev/src missing)')
# the compiled output must come from a passing type check (npm run compile exits 1 otherwise, but a stale .web-dev from
# a failed watch run would still be on disk)
try:
    if not json.load(open(status, encoding='utf-8')).get('ok'): raise SystemExit('build-dist: last compile failed (.web-dev/__dev/status.json) — fix the type errors first')
except FileNotFoundError: raise SystemExit('build-dist: .web-dev/__dev/status.json missing — run `npm run compile`')
if os.path.isdir(STAGE): shutil.rmtree(STAGE)
os.makedirs(STAGE)
need = set()
for f in glob.glob(SRC + '/**/*.js', recursive=True):
    need |= {m for m in re.findall(r"three/addons/([A-Za-z0-9_./-]+\.js)", open(f, encoding='utf-8').read())}
need, seen = list(need), set()
while need:
    f = need.pop()
    if f in seen: continue
    seen.add(f)
    p = os.path.join(root, f)
    if not os.path.isfile(p): raise SystemExit(f'build-dist: three addon not found: {f}')
    for m in re.findall(r"from\s+['\"](\.[^'\"]+)['\"]", open(p, encoding='utf-8').read()):
        need.append(os.path.normpath(os.path.join(os.path.dirname(f), m)))
for f in seen:
    d = os.path.join(STAGE, 'vendor/three/jsm', f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy(os.path.join(root, f), d)
os.makedirs(STAGE + '/vendor/three/build', exist_ok=True)
for f in ['three.module.js', 'three.core.js']: shutil.copy('vendor/three/build/' + f, STAGE + '/vendor/three/build/' + f)
shutil.copytree(SRC, STAGE + '/src')
for d in ['styles', 'assets', 'songs']: shutil.copytree(d, STAGE + '/' + d)
shutil.copy('index.html', STAGE + '/index.html')
# Device diagnostics that ship. These two are the only pages under tools/ that are self-contained — styles and script
# inline, no sibling assets — so copying the file alone is a complete page. That matters because a phone has no console
# to attach: perf-lab is how its real limits, its frame cost and any silently unlinked shader get read off the device,
# and gpu-probe is the fallback that needs nothing but a WebGL context. Everything else in tools/ pairs an .html with
# an .js and is a desktop tool. Both resolve assets relative to their own depth, which is preserved here.
os.makedirs(STAGE + '/tools', exist_ok=True)
for f in ['perf-lab.html', 'gpu-probe.html']: shutil.copy('tools/' + f, STAGE + '/tools/' + f)
# no TypeScript sources may ship: the browser runs the compiled .js only
leaked = [p for p in glob.glob(STAGE + '/src/**/*.ts', recursive=True)]
if leaked: raise SystemExit(f'build-dist: .ts sources in output: {leaked[:3]}')
json.dump({'builtAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'addons': len(seen)}, open(STAGE + '/build.json', 'w', encoding='utf-8'))
# swap: clear dist/ (keeping deploy config) and move the staged tree in
if os.path.isdir('dist'):
    for n in os.listdir('dist'):
        if n in keep: continue
        p = os.path.join('dist', n)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
else:
    os.makedirs('dist')
for n in os.listdir(STAGE): shutil.move(os.path.join(STAGE, n), os.path.join('dist', n))
os.rmdir(STAGE)
print('dist ready:', len(seen), 'addon files + 2 diagnostics')
