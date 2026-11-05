// Global game context + tiny event bus. Modules read shared systems off G lazily (G.paint, G.physics, ...).
import type * as THREE from 'three';
import type { DEFAULT_SETTINGS, QUALITY } from '../config.js';
import type { Renderer } from './renderer.js';
import type { Input } from './input.js';
import type { TouchControls } from './touch.js';
import type { InputFrame } from './inputFrame.js';
import type { Level } from '../world/level.js';
import type { PaintSystem } from '../world/paint.js';
import type { Environment } from '../world/environment.js';
import type { Physics } from '../game/physics.js';
import type { NavGraph } from '../game/nav.js';
import type { Match } from '../game/match.js';
import type { Actor } from '../game/actor.js';
import type { Projectiles } from '../game/weapons.js';
import type { SubSystem } from '../game/subs.js';
import type { SpecialSystem } from '../game/specials.js';
import type { CameraRig } from '../game/cameraRig.js';
import type { FX } from '../fx/fx.js';
import type { ScreenFX } from '../fx/screenfx.js';
import type { AudioEngine } from '../audio/audio.js';
import type { MusicEngine } from '../audio/music.js';
import type { HUD } from '../ui/hud.js';
import type { Menus } from '../ui/menus.js';
import type { Boss } from '../boss/boss.js';
import type { NetSession } from '../net/session.js';
import type { MockNet } from '../net/mock.js';
import type { NetMatch } from '../net/netmatch.js';
import type { CampaignRuntime } from '../campaign/action/combat.js';

// 저장된 설정(localStorage 'inkwave.settings')이다. 기본값 밖의 키는 이전 판 마이그레이션·호스트가 더한 값이다.
export type Settings = typeof DEFAULT_SETTINGS & { fovMode?: string; fullscreen?: boolean; timeOfDay?: string; [key: string]: unknown };

export interface GameContext {
  renderer: THREE.WebGLRenderer | null; scene: THREE.Scene | null; camera: THREE.PerspectiveCamera | null;
  settings: Settings | null; quality: (typeof QUALITY)[keyof typeof QUALITY] | null;
  level: Level | null; paint: PaintSystem | null; physics: Physics | null; fx: FX | null; env: Environment | null;
  audio: AudioEngine | null; music: MusicEngine | null; hud: HUD | null; menus: Menus | null; input: Input | null;
  match: Match | null; actors: Actor[]; local: Actor | null; projectiles: Projectiles | null;
  teamColors: [THREE.Color | null, THREE.Color | null];  // THREE.Color (linear) per team
  teamHex: [string, string];
  time: number;
  mode: 'boot' | 'menu' | 'match';
  // main.js·하위 시스템이 부팅 중 채운다.
  subs?: SubSystem | null; specials?: SpecialSystem | null; nav?: NavGraph | null; rig?: CameraRig | null;
  post?: Renderer | null; touch?: TouchControls | null;
  frame?: InputFrame | null;   // 이번 프레임의 공통 입력(33번 T009). main이 프레임 처음에 만든다
  screenfx?: ScreenFX | null; boss?: Boss | null;
  net?: NetSession | MockNet | null; netm?: NetMatch | null;
  game?: unknown; deathMarks?: unknown[];
  // 캠페인 세션(개발 중에는 ?tune=campaign 미리보기)만 갖는다. 대전·온라인은 null이다(35번 R016~R021).
  campaign?: CampaignRuntime | null;
}

export const G: GameContext = {
  renderer: null, scene: null, camera: null,
  settings: null, quality: null,
  level: null, paint: null, physics: null, fx: null, env: null,
  audio: null, music: null, hud: null, menus: null, input: null,
  match: null, actors: [], local: null, projectiles: null,
  teamColors: [null, null],      // THREE.Color (linear) per team
  teamHex: ['#ff8a14', '#2f5bff'],
  time: 0,
  mode: 'boot',                  // 'boot' | 'menu' | 'match'
};

type Listener = (payload: any) => void;   // 이벤트마다 페이로드가 다르다(docs/EVENTS.md). 구독자가 자기 형태로 받는다.
const listeners = new Map<string, Set<Listener>>();
export function on(name: string, fn: Listener): () => boolean | undefined {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(fn);
  return () => listeners.get(name)?.delete(fn);
}
export function emit(name: string, payload?: unknown): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of set) fn(payload);
}

// ---- small math helpers shared by core modules ----
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angleDiff(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
export function dampAngle(a: number, b: number, lambda: number, dt: number): number { return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)); }

// Deterministic hash → [0,1)
export function hash1(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }

// Seeded RNG (mulberry32)
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
