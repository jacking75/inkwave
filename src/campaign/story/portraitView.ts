// 통신 초상 뷰(35번 R026). 화면 좌하단 220×220 px(CSS)에 화자 한 명을 그린다: 캐릭터 1명 + 2점 조명(키·림) + 종이색 배경.
// 메인 컴포저가 그린 뒤 같은 캔버스의 시저 영역에만 바로 그린다(Renderer.overlays). StylePass는 거치지 않으므로
// 툰 램프 패치만 받고, 림 라이트로 "그림책 삽화" 윤곽을 만든다. 화자가 바뀔 때만 캐릭터를 만든다(인물별 캐시).
//
// 퐁·아카이브는 3D 인물이 아니다: 퐁은 마스코트의 통신 얼굴(DOM), 아카이브는 단말 아이콘(DOM)으로 같은 틀에 보인다.
import * as THREE from 'three';
import type { Character } from '../../game/character.js';
import { setCast, playExpr } from '../../game/cast/castCharacter.js';
import { CAST_LOOKS, EXPR, ECHO_LEADERS, echoSpecOf, type CastId, type ExprVector } from '../../game/cast/cast.js';
import type { Mood, Speaker } from './dialogue.js';

// redrawEvery: 인물은 3프레임에 한 번 렌더 타깃에 그리고 매 프레임은 그 결과를 시저 영역에 붙인다(R026 비용 0.6 ms 예산)
export const PORTRAIT = { size: 220, margin: 18, bottom: 18, paper: '#efe5d0', fov: 20, redrawEvery: 3 } as const;

// 기분 → 표정 벡터(cast.ts EXPR). neutral은 표정 없음
export const MOOD_EXPR: Record<Mood, ExprVector | null> = {
  neutral: null, smile: EXPR.softSmile, worry: EXPR.worry, determined: EXPR.determ, surprise: EXPR.surprise,
  tired: EXPR.tired, joy: EXPR.joy, pout: EXPR.pout, focus: EXPR.focus,
};
const TALK: ExprVector = [0, 0.05, 0, 0, 0.05, 0.55, 0, 0];

type CharCtor = new (o: { color: THREE.Color; weapon: string; style: Record<string, number>; name: string; isLocal: boolean }) => Character;
interface AnimLike { time: number; [k: string]: unknown }

export interface PortraitSource {
  CharacterClass: CharCtor | null;
  playerStyle(): Record<string, number>;
  playerColor(): string;
}

const anim = (): AnimLike => ({ time: 0, speed: 0, localMove: { x: 0, z: 0 }, grounded: true, vy: 0, aimPitch: 0, firing: false, charge: 0, rolling: false, form: 'kid', wallNormal: new THREE.Vector3(0, 0, 1), ink: 1, lowInk: false, special: 0, invuln: false });

const _vp = new THREE.Vector4(), _sc = new THREE.Vector4();
interface FrameRect { x: number; y: number; w: number; h: number; cw: number; ch: number }

export class PortraitView {
  declare src: PortraitSource; declare scene: THREE.Scene; declare camera: THREE.PerspectiveCamera;
  declare frame: HTMLDivElement; declare nameEl: HTMLDivElement; declare iconEl: HTMLDivElement;
  declare chars: Map<string, Character>; declare cur: Character | null; declare speaker: Speaker | null;
  declare anim: AnimLike; declare talkT: number; declare talking: boolean; declare visible: boolean;
  declare lastMs: number; declare rect: FrameRect | null;
  declare draw: (r: THREE.WebGLRenderer) => void;
  declare rt: THREE.WebGLRenderTarget | null; declare frameN: number; declare dirty: boolean;
  declare blit: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.MeshBasicMaterial };

  constructor(uiRoot: HTMLElement, src: PortraitSource) {
    this.src = src;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PORTRAIT.paper);
    const hemi = new THREE.HemisphereLight('#fff6e6', '#8a7f72', 1.1);
    const key = new THREE.DirectionalLight('#fff1dc', 2.2); key.position.set(-1.2, 2.2, 2.4);
    const rim = new THREE.DirectionalLight('#cfe6ff', 2.6); rim.position.set(1.6, 1.4, -2.2);
    this.scene.add(hemi, key, rim);
    this.camera = new THREE.PerspectiveCamera(PORTRAIT.fov, 1, 0.05, 20);
    this.frame = document.createElement('div'); this.frame.className = 'iw-commport';
    this.nameEl = document.createElement('div'); this.nameEl.className = 'iw-commport__name';
    this.iconEl = document.createElement('div'); this.iconEl.className = 'iw-commport__icon';
    this.frame.append(this.iconEl, this.nameEl);
    uiRoot.appendChild(this.frame);
    this.chars = new Map(); this.cur = null; this.speaker = null;
    this.anim = anim(); this.talkT = 0; this.talking = false; this.visible = false; this.lastMs = 0; this.rect = null;
    this.draw = (r) => this.render(r);
    this.rt = null; this.frameN = 0; this.dirty = true;
    const mat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    const bs = new THREE.Scene(); bs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.blit = { scene: bs, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  // 화자를 보인다. name은 표시 이름(빈 문자열이면 이름표 숨김)
  show(speaker: Speaker, mood: Mood | undefined, name: string): void {
    this.visible = true;
    this.frame.classList.add('is-on');
    this.frame.dataset.speaker = speaker;
    this.nameEl.textContent = name; this.nameEl.hidden = !name;
    const flat = speaker === 'archive' || speaker === 'pong' || speaker === 'narrator';
    this.iconEl.hidden = !flat;
    this.iconEl.textContent = speaker === 'archive' ? '▣' : speaker === 'pong' ? '●' : '';
    if (flat) { this._setChar(null); this.speaker = speaker; return; }
    if (speaker !== this.speaker || !this.cur) this._setChar(this._char(speaker));
    this.speaker = speaker;
    const X = mood ? MOOD_EXPR[mood] : null;
    if (this.cur && X) playExpr(this.cur, X, 0.85, 60);
  }

  hide(): void { this.visible = false; this.frame.classList.remove('is-on'); this.talking = false; }
  setTalking(on: boolean): void { this.talking = on; }

  update(dt: number): void {
    const c = this.cur;
    if (!this.visible || !c) return;
    this.anim.time += dt;
    // 말하는 동안 입을 짧게 여닫는다(0.11초마다)
    if (this.talking && (this.talkT -= dt) <= 0) { this.talkT = 0.11; playExpr(c, TALK, 0.45 + Math.random() * 0.4, 0.05); }
    (c as unknown as { update(dt: number, s: AnimLike): void }).update(dt, this.anim);
  }

  _char(speaker: Speaker): Character | null {
    const hit = this.chars.get(speaker);
    if (hit) return hit;
    const C = this.src.CharacterClass;
    if (!C) return null;
    let style: Record<string, number>, color: string, cast: CastId = 'player';
    if (speaker === 'mora' || speaker === 'teal') { style = { ...CAST_LOOKS[speaker].style }; color = CAST_LOOKS[speaker].color; cast = speaker; }
    else if (speaker === 'boss') { style = { hair: 4, skin: 2, outfit: 0, eyes: 0, hat: 0, brows: 1 }; color = '#9a9da4'; cast = 'captain'; }
    else { style = this.src.playerStyle(); color = this.src.playerColor(); }
    const c = new C({ color: new THREE.Color(color), weapon: 'shooter', style, name: 'portrait-' + speaker, isLocal: false });
    if (cast === 'captain') setCast(c, 'captain', echoSpecOf(ECHO_LEADERS.find((d) => d.id === 'bari') ?? ECHO_LEADERS[0]));
    else setCast(c, cast);
    (c as unknown as { setDance(n: string): void }).setDance('menu_idle');
    (c as unknown as { weaponHidden: boolean }).weaponHidden = true;
    this.chars.set(speaker, c);
    return c;
  }

  _setChar(c: Character | null): void {
    if (this.cur === c) return;
    this.dirty = true;
    if (this.cur) this.scene.remove(this.cur.root);
    this.cur = c;
    if (!c) return;
    this.scene.add(c.root);
    c.root.rotation.y = -0.35;
    // 머리를 화면 위쪽 2/3에 둔다(정면 3/4 시점)
    for (let i = 0; i < 6; i++) { this.anim.time += 1 / 30; (c as unknown as { update(dt: number, s: AnimLike): void }).update(1 / 30, this.anim); }
    const head = new THREE.Vector3();
    c.getHeadPosition(head);
    const span = 0.74, dist = span / 2 / Math.tan((PORTRAIT.fov * Math.PI) / 360);
    this.camera.position.set(head.x + 0.1, head.y - 0.02, head.z + dist);
    this.camera.lookAt(head.x, head.y - 0.12, head.z);
    this.camera.updateProjectionMatrix();
  }

  // 틀 위치(CSS px, 캔버스 왼쪽 아래 기준). 창 크기가 바뀔 때만 다시 잰다.
  _rect(canvas: HTMLCanvasElement): FrameRect {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (this.rect && this.rect.cw === cw && this.rect.ch === ch) return this.rect;
    const cr = canvas.getBoundingClientRect(), fr = this.frame.getBoundingClientRect();
    const r = { x: fr.left - cr.left + 6, y: cr.bottom - fr.bottom + 6, w: fr.width - 12, h: fr.height - 12, cw, ch };
    this.rect = r;
    return r;
  }

  render(r: THREE.WebGLRenderer): void {
    if (!this.visible || !this.cur) return;
    const t0 = performance.now();
    const rc = this._rect(r.domElement);
    if (rc.w <= 4) return;
    const prevAuto = r.autoClear, prevTarget = r.getRenderTarget();
    r.getViewport(_vp); r.getScissor(_sc);
    const scOn = r.getScissorTest(), pr = r.getPixelRatio();
    const W = Math.max(8, Math.round(rc.w * pr)), H = Math.max(8, Math.round(rc.h * pr));
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
      this.blit.mat.map = this.rt.texture; this.blit.mat.needsUpdate = true;
      this.dirty = true;
    }
    r.autoClear = false;
    // 인물: 2프레임에 한 번(바뀌었으면 즉시) 렌더 타깃에
    if (this.dirty || ++this.frameN % PORTRAIT.redrawEvery === 0) {
      this.dirty = false;
      this.camera.aspect = rc.w / rc.h; this.camera.updateProjectionMatrix();
      r.setRenderTarget(this.rt);
      r.setScissorTest(false);
      r.clear(true, true, false);
      const sh = r.shadowMap.enabled; r.shadowMap.enabled = false;
      r.render(this.scene, this.camera);
      r.shadowMap.enabled = sh;
    }
    // 매 프레임: 화면 좌하단 시저 영역에 붙인다
    r.setRenderTarget(null);
    r.setViewport(rc.x, rc.y, rc.w, rc.h); r.setScissor(rc.x, rc.y, rc.w, rc.h); r.setScissorTest(true);
    r.render(this.blit.scene, this.blit.cam);
    r.setScissorTest(scOn); r.setScissor(_sc); r.setViewport(_vp);
    r.setRenderTarget(prevTarget); r.autoClear = prevAuto;
    this.lastMs = performance.now() - t0;
  }

  // 창 크기 변화(틀 위치 다시 재기)
  invalidate(): void { this.rect = null; }

  dispose(): void {
    this.frame.remove();
    this.rt?.dispose(); this.blit.mat.dispose();
    for (const c of this.chars.values()) { this.scene.remove(c.root); (c as unknown as { dispose?(): void }).dispose?.(); }
    this.chars.clear(); this.cur = null;
  }
}
