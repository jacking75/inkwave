// 의성어·히트 텍스트 월드 라벨(35번 R008). 타격을 그림책 방식으로 보여 준다.
//
// 계약: 누구든 emit('fx:word', { text, pos, kind })로 라벨을 띄운다(pos는 월드 좌표, 복사해서 보관한다).
// 이 모듈은 기존 전투 이벤트 중 로컬 플레이어와 관련된 것만 단어로 바꿔 'fx:word'로 다시 낸다(봇끼리의 교전은
// 화면을 덮지 않게 뺀다). 캠페인 액션(스태거·퍼펙트 잠수·서지)은 해당 모듈이 직접 'fx:word'를 낸다.
//
// DOM은 노드 8개를 미리 만들어 재사용하고 transform·opacity만 바꾼다(레이아웃 없음). 그림책 룩에서만 켜진다.
import * as THREE from 'three';
import { G, on, emit } from '../core/ctx.js';
import { lookId } from './lookProfile.js';

export type WordKind = 'kill' | 'eliteKill' | 'stagger' | 'perfect' | 'surge' | 'bomb' | 'hurt' | 'cue';
export interface WordEvent { text: string; pos: THREE.Vector3 | { x: number; y: number; z: number }; kind: WordKind; color?: string }

// 단어 표(35번 R008)
export const WORDS: Record<Exclude<WordKind, 'cue'>, string> = {
  kill: '촤악!', eliteKill: '쾅!', stagger: '퍽!', perfect: '슈웅—', surge: '촥!', bomb: '펑!', hurt: '앗!',
};

const MAX = 8;
const LIFE = 0.55;          // s
const POP = 0.12;           // 등장 0.4 → 1.15 → 1
const RISE = 18;            // 퇴장 때 위로 이동 px
const SAME_WORD_GAP = 0.3;  // 같은 단어가 이 안에 다시 오면 0.8배로 작게
const BOMB_NEAR = 14;       // 로컬 플레이어 반경 m 안의 폭발만

interface Slot { el: HTMLDivElement; pos: THREE.Vector3; t: number; live: boolean; scale: number }

// 등장 곡선(순수 계산): 경과 s → 크기 배율·불투명도·위로 이동 px
export function wordFrame(t: number, reduceMotion: boolean): { s: number; a: number; dy: number } {
  const out = Math.max(0, (t - (LIFE - 0.22)) / 0.22);   // 마지막 0.22 s 퇴장
  if (reduceMotion) return { s: 1, a: Math.min(1, t / 0.08) * (1 - out), dy: 0 };
  let s: number;
  if (t < POP * 0.6) s = 0.4 + (1.15 - 0.4) * (t / (POP * 0.6));
  else if (t < POP) s = 1.15 - 0.15 * ((t - POP * 0.6) / (POP * 0.4));
  else s = 1;
  return { s, a: 1 - out, dy: -RISE * out };
}

export class SfxWords {
  declare el: HTMLDivElement;
  declare slots: Slot[];
  declare lastAt: Map<string, number>;
  declare clock: number;
  declare private _off: Array<() => unknown>;
  declare private _raf: number;
  declare private _prev: number;
  declare private _v: THREE.Vector3;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'iw-words';
    root.appendChild(this.el);
    this.slots = Array.from({ length: MAX }, () => {
      const el = document.createElement('div');
      el.className = 'iw-word';
      el.style.opacity = '0';
      this.el.appendChild(el);
      return { el, pos: new THREE.Vector3(), t: 0, live: false, scale: 1 };
    });
    this.lastAt = new Map();
    this.clock = 0;
    this._v = new THREE.Vector3();
    this._off = [
      on('fx:word', (e: WordEvent) => this.show(e)),
      // 내가 쓰러뜨렸을 때
      on('hit', (e: { attacker?: { isLocal?: boolean } | null; victim?: { pos: THREE.Vector3; team: number } | null; killed?: boolean }) => {
        if (!e.killed || !e.attacker?.isLocal || !e.victim) return;
        emit('fx:word', { text: WORDS.kill, pos: headPos(e.victim.pos), kind: 'kill', color: G.teamHex[0] });
      }),
      // 내가 맞았을 때
      on('damage', (e: { victim?: { isLocal?: boolean; pos: THREE.Vector3 } | null; attacker?: unknown; amount?: number }) => {
        if (!e.victim?.isLocal || !e.attacker || !(e.amount && e.amount > 0)) return;
        emit('fx:word', { text: WORDS.hurt, pos: headPos(e.victim.pos), kind: 'hurt', color: G.teamHex[1] });
      }),
      on('bomb:explode', (e: { pos?: THREE.Vector3; team?: number }) => {
        const me = G.local;
        if (!e.pos || !me || me.pos.distanceTo(e.pos) > BOMB_NEAR) return;
        emit('fx:word', { text: WORDS.bomb, pos: e.pos.clone().setY(e.pos.y + 0.6), kind: 'bomb', color: G.teamHex[e.team === 1 ? 1 : 0] });
      }),
    ];
    this._prev = performance.now();
    const tick = (now: number): void => { this._raf = requestAnimationFrame(tick); this.update(Math.min(0.1, (now - this._prev) / 1000)); this._prev = now; };
    this._raf = requestAnimationFrame(tick);
  }

  get enabled(): boolean { return lookId(G.settings) === 'storybook'; }
  get reduceMotion(): boolean { return G.settings?.reduceMotion === true; }

  show(e: WordEvent): void {
    if (!this.enabled || !e || !e.text || !e.pos) return;
    const last = this.lastAt.get(e.text);
    const small = last !== undefined && this.clock - last < SAME_WORD_GAP;
    this.lastAt.set(e.text, this.clock);
    // 빈 칸이 없으면 가장 오래된 라벨을 쓴다
    let slot = this.slots.find((s) => !s.live);
    if (!slot) slot = this.slots.reduce((a, b) => (a.t > b.t ? a : b));
    slot.live = true; slot.t = 0; slot.scale = small ? 0.8 : 1;
    slot.pos.set(e.pos.x, e.pos.y, e.pos.z);
    const el = slot.el;
    el.textContent = e.text;
    el.className = 'iw-word' + (e.kind === 'eliteKill' ? ' iw-word--big' : e.kind === 'hurt' ? ' iw-word--small' : e.kind === 'cue' ? ' iw-word--warn' : '');
    el.style.setProperty('--word-shadow', e.color || G.teamHex[0]);
  }

  update(dt: number): void {
    this.clock += dt;
    const cam = G.camera, reduce = this.reduceMotion;
    // #ui-root는 화면 전체(position: fixed; inset: 0)이다. clientWidth를 읽으면 HUD 전체의 강제 레이아웃이 생긴다.
    const w = innerWidth, h = innerHeight;
    for (const s of this.slots) {
      if (!s.live) continue;
      s.t += dt;
      if (s.t >= LIFE || !cam || !this.enabled) { s.live = false; s.el.style.opacity = '0'; continue; }
      const p = this._v.copy(s.pos).project(cam);
      // 카메라 뒤(또는 화면 밖 멀리)는 그리지 않는다
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.3 || Math.abs(p.y) > 1.3) { s.el.style.opacity = '0'; continue; }
      const f = wordFrame(s.t, reduce);
      const x = (p.x * 0.5 + 0.5) * w, y = (0.5 - p.y * 0.5) * h + f.dy;
      s.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(f.s * s.scale).toFixed(3)})`;
      s.el.style.opacity = f.a.toFixed(3);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this._raf);
    for (const off of this._off) off();
    this.el.remove();
  }
}

const headPos = (feet: THREE.Vector3): THREE.Vector3 => feet.clone().setY(feet.y + 1.55);
