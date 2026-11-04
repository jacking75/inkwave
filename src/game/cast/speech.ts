// 월드 말풍선(35번 R012). 인물의 머리 위 0.25 m 지점을 매 프레임 투영해 DOM 말풍선을 띄운다.
// 동시 최대 6개(넘치면 가장 오래된 것을 치운다), 표시 시간 = 글자 수 × 60 ms + 700 ms(최대 2.6초), 꼬리는 화면 중심 쪽이다.
// 조준점을 가리지 않도록 말풍선 상자가 화면 중앙 반지름 120 px 원과 겹치면 바깥으로 민다.
// 노드는 미리 만들어 재사용하고 transform·opacity만 바꾼다. 크기는 표시할 때 한 번만 잰다(매 프레임 레이아웃 없음).
// 계약: emit('cast:say', { actor, text, kind, speaker? })를 받으면 그 actor 머리 위에 띄운다(설정 speechBubbles).
import * as THREE from 'three';
import { G, on } from '../../core/ctx.js';
import type { Voice } from './voice.js';
import { VOICES, type CastId } from './cast.js';

export const BUBBLE = { max: 6, msPerChar: 60, baseMs: 700, maxMs: 2600, aboveHead: 0.25, headTop: 1.62, avoidR: 120 } as const;
export function bubbleMs(text: string): number { return Math.min(BUBBLE.maxMs, [...text].length * BUBBLE.msPerChar + BUBBLE.baseMs); }

// 화면 중앙 원(반지름 r)을 피하는 이동량(순수): 상자 [x0,y0,x1,y1]과 중심 (cx,cy)
export function avoidCenter(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number): { dx: number; dy: number } {
  const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1));
  const ddx = nx - cx, ddy = ny - cy, d = Math.hypot(ddx, ddy);
  if (d >= r) return { dx: 0, dy: 0 };
  // 상자 중심이 원 중심에서 멀어지는 방향(겹친 상자 안에 중심이 있으면 위로)
  let ux = (x0 + x1) / 2 - cx, uy = (y0 + y1) / 2 - cy;
  const ul = Math.hypot(ux, uy);
  if (ul < 1e-3) { ux = 0; uy = -1; } else { ux /= ul; uy /= ul; }
  // 이동 후 가장 가까운 점이 원 밖에 오도록 충분히 민다(반복 2회로 수렴)
  let k = r - d + 1;
  for (let i = 0; i < 2; i++) {
    const ax0 = x0 + ux * k, ay0 = y0 + uy * k, ax1 = x1 + ux * k, ay1 = y1 + uy * k;
    const mx = Math.max(ax0, Math.min(cx, ax1)), my = Math.max(ay0, Math.min(cy, ay1));
    const m = Math.hypot(mx - cx, my - cy);
    if (m >= r) break;
    k += r - m + 1;
  }
  return { dx: ux * k, dy: uy * k };
}

export interface SayTarget { pos: THREE.Vector3; smoothY?: number; alive?: boolean }
interface Bubble { el: HTMLDivElement; text: HTMLSpanElement; target: SayTarget | null; anchor: THREE.Vector3; left: number; life: number; w: number; h: number; live: boolean; born: number }

const _p = new THREE.Vector3();

export class SpeechLayer {
  declare root: HTMLDivElement; declare pool: Bubble[]; declare voice: Voice | null; declare seq: number;
  declare unsub: () => unknown;

  constructor(parent: HTMLElement, voice: Voice | null) {
    this.root = document.createElement('div');
    this.root.className = 'iw-speech';
    parent.appendChild(this.root);
    this.voice = voice; this.seq = 0;
    this.pool = [];
    for (let i = 0; i < BUBBLE.max; i++) {
      const el = document.createElement('div');
      el.className = 'iw-bubble';
      const text = document.createElement('span');
      el.appendChild(text);
      this.root.appendChild(el);
      this.pool.push({ el, text, target: null, anchor: new THREE.Vector3(), left: 0, life: 1, w: 0, h: 0, live: false, born: 0 });
    }
    this.unsub = on('cast:say', (e: { actor?: SayTarget | null; pos?: THREE.Vector3; text: string; speaker?: CastId | 'pong' }) => {
      if (e.actor || e.pos) this.say(e.actor ?? null, e.text, e.speaker ?? 'player', e.pos);
    });
  }

  // 말풍선을 띄우고 목소리를 낸다. target이 없으면 pos 고정 지점이다.
  say(target: SayTarget | null, text: string, speaker: CastId | 'pong' = 'player', pos?: THREE.Vector3): void {
    this.voice?.speak(text, VOICES[speaker]);
    if (G.settings?.speechBubbles === false || !text) return;
    let b = this.pool.find((x) => !x.live);
    if (!b) b = this.pool.reduce((a, x) => (x.born < a.born ? x : a));
    b.target = target; if (pos) b.anchor.copy(pos);
    b.text.textContent = text;
    b.el.dataset.speaker = speaker;
    b.life = bubbleMs(text) / 1000; b.left = b.life; b.live = true; b.born = ++this.seq;
    b.el.style.display = 'block';
    b.w = b.el.offsetWidth; b.h = b.el.offsetHeight;   // 표시할 때 한 번만 잰다
  }

  update(dt: number, camera: THREE.Camera | null): void {
    if (!camera) return;
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
    for (const b of this.pool) {
      if (!b.live) continue;
      b.left -= dt;
      const t = b.target;
      if (b.left <= 0 || (t && t.alive === false)) { b.live = false; b.el.style.display = 'none'; continue; }
      if (t) _p.set(t.pos.x, t.pos.y + (t.smoothY ?? 0) + BUBBLE.headTop + BUBBLE.aboveHead, t.pos.z); else _p.copy(b.anchor);
      _p.project(camera);
      if (_p.z > 1 || _p.z < -1) { b.el.style.opacity = '0'; continue; }
      const sx = (_p.x * 0.5 + 0.5) * W, sy = (-_p.y * 0.5 + 0.5) * H;
      // 꼬리 끝이 (sx, sy)에 오도록 상자는 위에 놓고, 꼬리는 화면 중심 쪽으로 기운다
      const side = sx < cx ? 1 : -1;
      let x0 = sx - b.w * (side > 0 ? 0.3 : 0.7), y0 = sy - b.h - 12;
      const mv = avoidCenter(x0, y0, x0 + b.w, y0 + b.h, cx, cy, BUBBLE.avoidR);
      x0 = Math.max(8, Math.min(W - b.w - 8, x0 + mv.dx)); y0 = Math.max(8, Math.min(H - b.h - 8, y0 + mv.dy));
      const age = b.life - b.left;
      const a = Math.min(1, age / 0.12) * Math.min(1, b.left / 0.25);
      const s = G.settings?.reduceMotion ? 1 : age < 0.12 ? 0.85 + 0.15 * (age / 0.12) : 1;
      b.el.style.opacity = a.toFixed(3);
      b.el.style.transform = `translate3d(${x0.toFixed(1)}px, ${y0.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      b.el.classList.toggle('iw-bubble--tail-r', side < 0);
    }
  }

  clear(): void { for (const b of this.pool) { b.live = false; b.el.style.display = 'none'; } }
  dispose(): void { this.unsub(); this.root.remove(); }
}
