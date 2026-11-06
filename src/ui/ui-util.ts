// INKWAVE UI — tiny DOM / colour / motion helpers shared by menus.js and hud.js.
// Pure DOM; no three.js dependency.

// ---------------------------------------------------------------- DOM
/** h()의 속성: class·style·data·html·text는 특별 처리, on*는 리스너, 나머지는 속성(true → 빈 값, null·false → 생략)이다. */
export interface HProps {
  class?: string; style?: string | Record<string, string | number>; data?: Record<string, string>; html?: string; text?: string;
  [attr: string]: unknown;
}
export type HChild = Node | string | number | null | undefined | false | readonly HChild[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: HProps | null = null, ...kids: HChild[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v as string;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else { const st = v as Record<string, string>; for (const s in st) { if (s.startsWith('--')) el.style.setProperty(s, st[s]); else (el.style as unknown as Record<string, string>)[s] = st[s]; } }
      } else if (k === 'data') { const dv = v as Record<string, string>; for (const d in dv) el.dataset[d] = dv[d]; }
      else if (k === 'html') el.innerHTML = v as string;
      else if (k === 'text') el.textContent = v as string;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v as string);
    }
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el: Element, kids: readonly HChild[]) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendKids(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c as Node);
  }
}
/** Parse an HTML/SVG string into its first element. */
export function frag(markup: unknown) {
  const t = document.createElement('template');
  t.innerHTML = String(markup).trim();
  return t.content.firstElementChild;
}
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Restart a CSS animation on an element by toggling a class across a reflow. */
export function restartAnim(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // eslint-disable-line no-void
  el.classList.add(cls);
}

// ---------------------------------------------------------------- maths
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically-under-damped spring (gives the bouncy overshoot used by the focus cursor etc.). */
export class Spring {
  declare x: number; declare v: number; declare target: number; declare k: number; declare c: number;
  constructor(value = 0, stiffness = 260, damping = 20) {
    this.x = value; this.v = 0; this.target = value; this.k = stiffness; this.c = damping;
  }
  step(dt: number) {
    const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
    const hh = Math.min(dt, 0.1) / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.x) - this.c * this.v;
      this.v += a * hh; this.x += this.v * hh;
    }
    return this.x;
  }
  snap(v = this.target) { this.x = this.target = v; this.v = 0; }
  get settled() { return Math.abs(this.target - this.x) < 0.02 && Math.abs(this.v) < 0.02; }
}

// ---------------------------------------------------------------- colour
/** toHex가 받는 색: '#rrggbb'·'#rgb'·0xRRGGBB·THREE.Color 비슷한 것({r,g,b} 0..1 또는 getHexString()) */
export type ColorLike = string | number | { getHexString(): string } | { r: number; g: number; b: number } | null | undefined;
/** Accepts '#rrggbb', '#rgb', 0xRRGGBB, THREE.Color-like ({r,g,b} 0..1 or getHexString()). */
export function toHex(c: ColorLike, fallback = '#ff8a14'): string {
  if (c == null) return fallback;
  if (typeof c === 'string') {
    if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c.slice(0, 7);
    return c;
  }
  if (typeof c === 'number') return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  if ('getHexString' in c && typeof c.getHexString === 'function') return '#' + c.getHexString();
  if ('r' in c && typeof c.r === 'number') return rgbToHex(c.r * 255, c.g * 255, c.b * 255);
  return fallback;
}
export function hexToRgb(hex: ColorLike): [number, number, number] {
  let s = toHex(hex).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const f = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function mix(a: ColorLike, b: ColorLike, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
/** t < 0 darkens toward ink-black, t > 0 lightens toward white. */
export const shade = (hex: ColorLike, t: number) => (t < 0 ? mix(hex, '#120e1c', -t) : mix(hex, '#ffffff', t));
export function luminance(hex: ColorLike) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Text colour to put on top of a fill (black on light inks, white on dark ones). */
export const inkOn = (hex: ColorLike) => (luminance(hex) > 0.36 ? '#15121c' : '#ffffff');
export function rgba(hex: ColorLike, a: number) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

/** Writes --name, --name-rgb, --name-dark, --name-deep, --name-light, --name-ink onto an element. */
export function colorVars(el: HTMLElement, name: string, color: ColorLike) {
  const hex = toHex(color);
  const s = el.style;
  s.setProperty(`--${name}`, hex);
  s.setProperty(`--${name}-rgb`, hexToRgb(hex).join(','));
  s.setProperty(`--${name}-dark`, shade(hex, -0.32));
  s.setProperty(`--${name}-deep`, shade(hex, -0.62));
  s.setProperty(`--${name}-light`, shade(hex, 0.45));
  s.setProperty(`--${name}-ink`, inkOn(hex));
  return hex;
}

// ---------------------------------------------------------------- shapes
const f1 = (v: number) => Math.round(v * 10) / 10;
/** Smooth closed curve through points (Catmull-Rom → cubic Bézier) as an SVG path string. */
export function closedCurve(pts: number[][], tension = 1) {
  const n = pts.length;
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${f1(c1x)} ${f1(c1y)} ${f1(c2x)} ${f1(c2y)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + 'Z';
}
/** Organic wobbly blob. */
export function blobPath(cx: number, cy: number, r: number, { points = 9, wobble = 0.16, seed = 1, sx = 1, sy = 1 } = {}) {
  const R = rng(seed);
  const pts: number[][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + (R() - 0.5) * (Math.PI / points) * 0.8;
    const rr = r * (1 + (R() * 2 - 1) * wobble);
    pts.push([cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr * sy]);
  }
  return closedCurve(pts);
}
/** Ink splat: lumpy core with rounded, bulb-tipped arms + satellite droplets. Returns { core, drops:[{x,y,r}] }. */
export function splatShape(cx: number, cy: number, r: number, { arms = 9, seed = 7, armLen = 0.42, drops = 6 } = {}) {
  const R = rng(seed);
  const TAU = Math.PI * 2, step = TAU / arms;
  const P = (a: number, d: number) => [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  const pts: number[][] = [];
  const armDirs: Array<[number, number]> = [];
  const rot = R() * TAU;
  for (let i = 0; i < arms; i++) {
    const a0 = rot + i * step + (R() - 0.5) * step * 0.25;
    pts.push(P(a0, r * (0.8 + R() * 0.1)));                       // valley
    const big = R() < 0.62;
    const L = big ? r * (1 + armLen * (0.55 + R() * 0.75)) : r * (0.98 + R() * 0.1);
    const am = a0 + step * (0.45 + (R() - 0.5) * 0.2);
    armDirs.push([am, L]);
    if (big) {
      const neck = step * (0.12 + R() * 0.05), bulb = step * (0.2 + R() * 0.08);
      pts.push(P(am - neck, r * 0.98 + (L - r) * 0.35));           // neck
      pts.push(P(am - bulb * 0.9, L * 0.96));                       // bulb side
      pts.push(P(am, L * 1.02));                                    // tip
      pts.push(P(am + bulb * 0.9, L * 0.96));
      pts.push(P(am + neck, r * 0.98 + (L - r) * 0.35));
    } else {
      pts.push(P(am, L));
    }
  }
  const ds: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < drops; i++) {
    const [am, L] = armDirs[Math.floor(R() * armDirs.length)];
    const a = am + (R() - 0.5) * step * 0.5;
    const d = Math.max(L, r * 1.1) + r * (0.22 + R() * 0.45);
    ds.push({ x: f1(cx + Math.cos(a) * d), y: f1(cy + Math.sin(a) * d), r: f1(r * (0.06 + R() * 0.1)) });
  }
  return { core: closedCurve(pts, 1), drops: ds };
}
/** SVG markup for a splat filled with `cls` (css class) or explicit fill. */
/** splatSVG 선택: 무늬 씨앗, CSS 클래스 또는 직접 채우기, 보기 상자·반지름·팔·물방울, svg에 덧붙일 속성 */
export interface SplatOpts { seed?: number; cls?: string; fill?: string | null; viewBox?: number; r?: number; arms?: number; drops?: number; extra?: string }
export function splatSVG({ seed = 7, cls = 'iw-fa', fill = null, viewBox = 200, r = 58, arms = 9, drops = 7, extra = '' }: SplatOpts = {}) {
  const c = viewBox / 2;
  const s = splatShape(c, c, r, { seed, arms, drops });
  const fa = fill ? `fill="${fill}"` : `class="${cls}"`;
  return `<svg viewBox="0 0 ${viewBox} ${viewBox}" aria-hidden="true" ${extra}><path ${fa} d="${s.core}"/>${s.drops
    .map((d) => `<circle ${fa} cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('')}</svg>`;
}

// ---------------------------------------------------------------- text
export function fmtTime(s: number) {
  const t = Math.max(0, Math.ceil(s - 1e-6));
  const m = Math.floor(t / 60), ss = t % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** Normalises a percentage that may be supplied as 0..1 or 0..100. */
export function pct(a: number | string, b: number | string) {
  const both = [a, b].map((v) => +v || 0);
  if (both[0] <= 1.0001 && both[1] <= 1.0001) return both.map((v) => v * 100);
  return both;
}

// ---------------------------------------------------------------- misc
export const now = () => performance.now() / 1000;
export function safeCall<A extends unknown[], R>(fn: ((...args: A) => R) | null | undefined, ...args: A): R | undefined { try { return fn?.(...args); } catch (e) { console.error('[ui]', e); return undefined; } }
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
