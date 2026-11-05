// 만화 패널 컷신(35번 R027, 6.1절 PanelShot·PanelScene). 영상 없이 월드 안에 인물을 세우고 카메라 샷을 재생하며,
// 화면에는 종이 프레임·캡션·대사·의성어를 겹친다. 컷신 동안 전투는 멈추고(host.freeze) 입력은 건너뛰기만 받는다.
//
// 좌표: 샷의 위치는 장면 기준점(host.anchor: 위치 + 방향) 기준 지역 좌표 m이다(x 오른쪽, y 위, z 앞). 같은 콘티를 임무마다
// 다른 장소(작업장 세트·광장·보스장)에 놓을 수 있게 한다. 인물의 발은 그 자리 바닥(아래로 쏜 광선)에 붙인다.
// 카메라는 CameraRig.cinematic(arc 0, 샷 fov)을 샷마다 건다. 끝나거나 건너뛰면 host.restore()가 카메라·시간·입력을 되돌린다.
import * as THREE from 'three';
import { G, emit } from '../../core/ctx.js';
import type { Character } from '../../game/character.js';
import { setCast, setStoryPose, playExpr } from '../../game/cast/castCharacter.js';
import type { StoryPose } from '../../game/cast/poses.js';
import { CAST_LOOKS, ECHO_LEADERS, echoSpecOf, type CastId } from '../../game/cast/cast.js';
import { MOOD_EXPR } from './portraitView.js';
import type { Mood } from './dialogue.js';

export type Vec3 = [number, number, number];
export interface PanelActor { id: string; at: Vec3; yaw: number; pose: StoryPose; mood?: Mood }
export interface PanelShot {
  id: string; durationMs: number; frame: 'full' | 'left' | 'right' | 'top' | 'bottom';
  camera: { from: Vec3; to?: Vec3; look: Vec3; fov: number };
  actors: PanelActor[];
  caption?: string; line?: { speaker: string; text: string }; word?: { text: string; at: Vec3 };
  transition: 'cut' | 'wipe' | 'inkSplash';
}
export interface PanelScene { id: string; shots: PanelShot[]; skippable: true; music?: string }

export interface PanelAnchor { pos: THREE.Vector3; yaw: number }

type CharCtor = new (o: { color: THREE.Color; weapon: string; style: Record<string, number>; name: string; isLocal: boolean }) => Character;

export interface PanelHost {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; uiRoot: HTMLElement;
  rig: { cinematic(from: THREE.Vector3, to: THREE.Vector3, lookFrom: THREE.Vector3, lookTo: THREE.Vector3, dur: number, onDone?: () => void, arc?: number, fov?: number | null): void };
  CharacterClass: CharCtor | null;
  playerStyle(): Record<string, number>; playerColor(): string;
  anchor(): PanelAnchor;
  ground?(x: number, y: number, z: number): number | null;   // 바닥 높이
  freeze(on: boolean): void;                                    // 전투 정지·입력 차단
  restore(): void;                                              // 카메라를 플레이어로 되돌린다
  hideWorldActors?(on: boolean): void;                          // 경기 인물을 잠시 숨긴다(같은 자리에 겹치지 않게)
}

// 콘티 검증: 컷 길이·인물 id·대사 길이(2줄×22자는 대본 검증기가 본다)
export function validatePanels(scenes: readonly PanelScene[]): string[] {
  const errs: string[] = [];
  for (const s of scenes) {
    if (!s.shots.length) errs.push(`${s.id}: 컷 없음`);
    for (const sh of s.shots) {
      if (!(sh.durationMs >= 800 && sh.durationMs <= 12000)) errs.push(`${s.id}/${sh.id}: 길이 ${sh.durationMs}ms`);
      for (const a of sh.actors) if (!ACTOR_IDS.has(a.id)) errs.push(`${s.id}/${sh.id}: 인물 ${a.id}`);
    }
  }
  return errs;
}
const ACTOR_IDS = new Set(['player', 'mora', 'teal', 'echo', ...ECHO_LEADERS.map((d) => d.id)]);

// 프레임별 그림 중심(화면 비율). styles/story.css .iw-panels__frame의 inset과 맞춘다
export const FRAME_CENTER: Record<PanelShot['frame'], [number, number]> = { full: [0.5, 0.5], left: [0.285, 0.5], right: [0.715, 0.5], top: [0.5, 0.31], bottom: [0.5, 0.69] };

export function sceneMs(s: PanelScene): number { return s.shots.reduce((t, x) => t + x.durationMs, 0); }

const anim = (): Record<string, unknown> & { time: number } => ({ time: 0, speed: 0, localMove: { x: 0, z: 0 }, grounded: true, vy: 0, aimPitch: 0, firing: false, charge: 0, rolling: false, form: 'kid', wallNormal: new THREE.Vector3(0, 0, 1), ink: 1, lowInk: false, special: 0, invuln: false });

export class PanelPlayer {
  declare host: PanelHost; declare scene: PanelScene | null; declare index: number; declare t: number;
  declare el: HTMLDivElement; declare frame: HTMLDivElement; declare caption: HTMLDivElement; declare line: HTMLDivElement;
  declare word: HTMLDivElement; declare splash: HTMLDivElement;
  declare chars: Map<string, Character>; declare anim: Record<string, unknown> & { time: number };
  declare onDone: ((skipped: boolean) => void) | null; declare anchor: PanelAnchor | null;
  declare offKey: () => void; declare startedAt: number;

  constructor(host: PanelHost) {
    this.host = host; this.scene = null; this.index = -1; this.t = 0; this.chars = new Map(); this.anim = anim();
    this.onDone = null; this.anchor = null; this.startedAt = 0;
    const div = (c: string): HTMLDivElement => { const d = document.createElement('div'); d.className = c; return d; };
    this.el = div('iw-panels'); this.el.hidden = true;
    this.frame = div('iw-panels__frame');
    this.caption = div('iw-panels__caption'); this.line = div('iw-panels__line'); this.word = div('iw-panels__word');
    this.splash = div('iw-panels__splash');
    const top = div('iw-panels__bar iw-panels__bar--t'), bot = div('iw-panels__bar iw-panels__bar--b');
    const skip = div('iw-panels__skip'); skip.textContent = '건너뛰기: 아무 키 · 탭';
    this.el.append(this.frame, top, bot, this.line, this.caption, this.word, this.splash, skip);
    host.uiRoot.appendChild(this.el);
    this.el.addEventListener('pointerdown', () => this.skip());
    const key = (e: KeyboardEvent): void => { if (this.scene && !e.repeat && performance.now() - this.startedAt > 350) { e.preventDefault(); this.skip(); } };
    window.addEventListener('keydown', key, true);
    this.offKey = () => window.removeEventListener('keydown', key, true);
  }

  get playing(): boolean { return !!this.scene; }

  play(scene: PanelScene, onDone?: (skipped: boolean) => void): void {
    if (this.scene) this._end(true);
    this.scene = scene; this.onDone = onDone ?? null; this.anchor = this.host.anchor();
    this.startedAt = performance.now();
    this.host.freeze(true); this.host.hideWorldActors?.(true);
    this.el.hidden = false;
    this._shot(0);
  }

  skip(): void { if (this.scene && performance.now() - this.startedAt > 350) this._end(true); }
  // 즉시 끝냄(임무 종료·메뉴로 나감)
  stop(): void { if (this.scene) this._end(true); }

  // 지역 좌표 → 월드
  _w(v: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
    const a = this.anchor!, c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    // 앞(+z) = (sin yaw, cos yaw), 오른쪽(+x) = (cos yaw, -sin yaw)
    return out.set(a.pos.x + v[0] * c + v[2] * s, a.pos.y + v[1], a.pos.z - v[0] * s + v[2] * c);
  }

  _shot(i: number): void {
    const sc = this.scene!;
    if (i >= sc.shots.length) { this._end(false); return; }
    const sh = sc.shots[i];
    this.index = i; this.t = 0;
    emit('story:panel', { sceneId: sc.id, shotId: sh.id });
    this.frame.dataset.frame = sh.frame;
    this.caption.textContent = sh.caption ?? '';
    this.line.textContent = sh.line ? `${sh.line.speaker ? sh.line.speaker + ' — ' : ''}${sh.line.text}` : '';
    this.word.textContent = '';
    if (i > 0 && sh.transition !== 'cut') {
      this.splash.className = 'iw-panels__splash' + (sh.transition === 'wipe' ? ' iw-panels__splash--wipe' : '');
      void this.splash.offsetWidth;
      this.splash.classList.add('is-go');
    }
    // 인물: 이번 컷에 나오는 사람만 보인다
    const used = new Set<string>();
    for (const a of sh.actors) {
      const c = this._char(a.id);
      if (!c) continue;
      used.add(a.id);
      const p = this._w(a.at);
      const gy = this.host.ground?.(p.x, p.y + 2, p.z);
      if (gy !== null && gy !== undefined) p.y = gy;
      c.root.position.copy(p);
      c.root.rotation.y = this.anchor!.yaw + a.yaw;
      c.root.visible = true;
      setStoryPose(c, a.pose);
      const X = a.mood ? MOOD_EXPR[a.mood] : null;
      if (X) playExpr(c, X, 0.9, sh.durationMs / 1000 + 0.5);
    }
    for (const [id, c] of this.chars) if (!used.has(id)) c.root.visible = false;
    // 반쪽 프레임: 바라보는 점이 프레임 가운데에 오도록 화면 중심을 옮긴다(styles/story.css의 프레임 위치와 같은 비율)
    const fc = FRAME_CENTER[sh.frame], C = this.host.camera, W = innerWidth, H = innerHeight;
    if (fc[0] !== 0.5 || fc[1] !== 0.5) C.setViewOffset(W, H, (0.5 - fc[0]) * W, (0.5 - fc[1]) * H, W, H); else C.clearViewOffset();
    const cam = sh.camera, from = this._w(cam.from), to = this._w(cam.to ?? cam.from), look = this._w(cam.look);
    this.host.rig.cinematic(from, to, look, look, sh.durationMs / 1000, undefined, 0, cam.fov);
  }

  _char(id: string): Character | null {
    const hit = this.chars.get(id);
    if (hit) return hit;
    const C = this.host.CharacterClass;
    if (!C) return null;
    // 인물: 플레이어·모라·틸, 잔향 대장·정예(ECHO_LEADERS의 id), 'echo' = 이름 없는 잔향 대원
    const leader = ECHO_LEADERS.find((d) => d.id === id) ?? null;
    let style: Record<string, number>, color: string, cast: CastId = 'player';
    if (id === 'mora' || id === 'teal') { style = { ...CAST_LOOKS[id].style }; color = CAST_LOOKS[id].color; cast = id; }
    else if (leader || id === 'echo') { style = { hair: 4, skin: 2, outfit: 0, eyes: 0, hat: 0, brows: 1 }; color = '#9a9da4'; cast = leader?.tier === 'captain' ? 'captain' : 'echo'; }
    else { style = this.host.playerStyle(); color = this.host.playerColor(); }
    const c = new C({ color: new THREE.Color(color), weapon: leader?.weapon ?? 'shooter', style, name: 'panel-' + id, isLocal: false });
    if (cast === 'captain' || cast === 'echo') setCast(c, cast, leader ? echoSpecOf(leader) : { markColor: '#ffd21a', tier: 'grunt' });
    else setCast(c, cast);
    (c as unknown as { setDance(n: string): void }).setDance('menu_idle');
    if (!leader) (c as unknown as { weaponHidden: boolean }).weaponHidden = true;   // 대장·정예는 병종 소품(무기)을 든다
    this.host.scene.add(c.root);
    this.chars.set(id, c);
    return c;
  }

  // 실시간 dt(시뮬레이션이 멈춰도 돈다)
  update(dt: number): void {
    const sc = this.scene;
    if (!sc) return;
    this.host.freeze(true);   // 일시 정지·포커스 이탈의 시간 리셋에도 정지를 유지한다
    this._pollPad();
    if (!this.scene) return;
    this.t += dt;
    this.anim.time += dt;
    for (const c of this.chars.values()) if (c.root.visible) (c as unknown as { update(dt: number, s: unknown): void }).update(dt, this.anim);
    const sh = sc.shots[this.index];
    if (sh.word && this.t > 0.25 && !this.word.textContent) {
      const p = this._w(sh.word.at).project(this.host.camera);
      this.word.style.left = `${(p.x * 0.5 + 0.5) * 100}%`; this.word.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      this.word.textContent = sh.word.text;
    }
    if (this.t * 1000 >= sh.durationMs) this._shot(this.index + 1);
  }

  // 패드 아무 버튼(확인·취소·정지) = 건너뛰기. 공통 입력 프레임에서 읽는다(33번 T017).
  _pollPad(): void {
    const A = G.frame?.actions;
    if (A && (A.confirm.pressed || A.cancel.pressed || A.pause.pressed)) this.skip();
  }

  _end(skipped: boolean): void {
    const sc = this.scene;
    if (!sc) return;
    this.scene = null; this.index = -1;
    this.el.hidden = true;
    this.host.camera.clearViewOffset();
    for (const c of this.chars.values()) { c.root.visible = false; setStoryPose(c, 'idle'); }
    this.host.hideWorldActors?.(false);
    this.host.freeze(false);
    this.host.restore();
    emit('story:panelEnd', { sceneId: sc.id, skipped });
    const cb = this.onDone; this.onDone = null;
    cb?.(skipped);
  }

  dispose(): void {
    if (this.scene) this._end(true);
    this.offKey();
    for (const c of this.chars.values()) { this.host.scene.remove(c.root); (c as unknown as { dispose?(): void }).dispose?.(); }
    this.chars.clear();
    this.el.remove();
  }
}
