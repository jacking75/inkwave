// 잉크 방울 마스코트 「퐁」(35번 R013). 로컬 플레이어의 탱크 위에 앉아 플레이어의 감정을 대신 보여 주고 통신창을 맡는다.
// 메시 하나(물방울 + 얼굴 데칼을 같은 셰이더에서 그림: 드로우콜 +1, 삼각형 600개 이하)이다. 얼굴은 256×256 캔버스의
// 4×2칸 아틀라스(기본·기쁨·놀람·겁·졸림·화남·윙크·눈감음)이며 HUD 통신 초상도 같은 아틀라스를 CSS 스프라이트로 쓴다.
// 위치는 탱크 뼈 기준 (0, 0.14, −0.06)을 2단 스프링(3.5 Hz, ζ 0.35)으로 늦게 따라간다. 점프에서 위로 1.3배 늘어나고
// 착지에서 0.8배로 찌그러지며, 잠수 중에는 0.2초 만에 탱크 안으로 숨는다(스케일 0). 카메라가 0.9 m 안으로 붙으면 사라진다.
// 봇·원격 플레이어에게는 붙이지 않는다. 설정 mascot이 꺼져 있으면 숨는다.
import * as THREE from 'three';
import { G, on } from '../../core/ctx.js';
import type { Actor } from '../actor.js';

export type PongFace = 'normal' | 'joy' | 'surprise' | 'scared' | 'sleepy' | 'angry' | 'wink' | 'closed';
export const PONG_FACES: readonly PongFace[] = ['normal', 'joy', 'surprise', 'scared', 'sleepy', 'angry', 'wink', 'closed'];
export const PONG = {
  radius: 0.08, offset: [0, 0.14, -0.06] as const, hz: 3.5, zeta: 0.35, hideTime: 0.2, nearCam: 0.9,
  jumpStretch: 1.3, landSquash: 0.8, scaredHz: 12, sleepyAfter: 10, lowHp: 0.3,
} as const;

// ---- 얼굴 아틀라스(256×256, 4열×2행, 칸 64×128). 칸 안에 64×64 설계를 세로 2배로 그려 정사각형으로 붙였을 때 맞는다.
function drawFace(g: CanvasRenderingContext2D, face: PongFace): void {
  const eye = (x: number, y: number, rx: number, ry: number, pupil = true, py = 0) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    if (pupil) { g.fillStyle = '#15121c'; g.beginPath(); g.ellipse(x, y + py, rx * 0.55, ry * 0.6, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - rx * 0.25, y + py - ry * 0.25, rx * 0.18, 0, Math.PI * 2); g.fill(); }
  };
  const lid = (x: number, y: number, w: number, up: boolean) => { g.strokeStyle = '#15121c'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, w, up ? Math.PI * 1.1 : Math.PI * 0.1, up ? Math.PI * 1.9 : Math.PI * 0.9); g.stroke(); };
  const mouth = (d: (g: CanvasRenderingContext2D) => void) => { g.strokeStyle = '#15121c'; g.fillStyle = '#3a1020'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); d(g); };
  switch (face) {
    case 'normal': eye(22, 30, 7, 9); eye(42, 30, 7, 9); mouth((c) => { c.arc(32, 41, 4, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }); break;
    case 'joy': lid(22, 32, 6, true); lid(42, 32, 6, true); mouth((c) => { c.arc(32, 40, 6, 0, Math.PI); c.closePath(); c.fill(); c.stroke(); }); break;
    case 'surprise': eye(22, 29, 8, 10, true, -1); eye(42, 29, 8, 10, true, -1); mouth((c) => { c.ellipse(32, 44, 3.5, 4.5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }); break;
    case 'scared': eye(22, 30, 7, 9, true, 2); eye(42, 30, 7, 9, true, 2); mouth((c) => { c.moveTo(25, 45); c.lineTo(29, 42); c.lineTo(32, 45); c.lineTo(35, 42); c.lineTo(39, 45); c.stroke(); }); break;
    case 'sleepy': lid(22, 30, 6, false); lid(42, 30, 6, false); mouth((c) => { c.ellipse(32, 43, 2.5, 3, 0, 0, Math.PI * 2); c.fill(); }); g.fillStyle = '#ffffff'; g.font = '700 11px sans-serif'; g.fillText('z', 50, 16); break;
    case 'angry': eye(22, 31, 7, 8); eye(42, 31, 7, 8); g.strokeStyle = '#15121c'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 19); g.lineTo(28, 24); g.moveTo(50, 19); g.lineTo(36, 24); g.stroke(); mouth((c) => { c.arc(32, 46, 4, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }); break;
    case 'wink': eye(22, 30, 7, 9); lid(42, 32, 6, true); mouth((c) => { c.arc(32, 40, 5, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }); break;
    case 'closed': lid(22, 30, 6, false); lid(42, 30, 6, false); mouth((c) => { c.arc(32, 41, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }); break;
  }
}
let _atlas: { canvas: HTMLCanvasElement; url: string } | null = null;
export function pongAtlas(): { canvas: HTMLCanvasElement; url: string } {
  if (_atlas) return _atlas;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const g = canvas.getContext('2d')!;
  PONG_FACES.forEach((f, i) => { g.save(); g.translate((i % 4) * 64, Math.floor(i / 4) * 128); g.scale(1, 2); drawFace(g, f); g.restore(); });
  _atlas = { canvas, url: canvas.toDataURL('image/png') };
  return _atlas;
}
// CSS 스프라이트 위치(background-size 400% 200%)
export function faceSpritePos(face: PongFace): string {
  const i = PONG_FACES.indexOf(face);
  return `${((i % 4) / 3) * 100}% ${Math.floor(i / 4) * 100}%`;
}

// ---- 물방울 지오메트리: 구를 위로 갈수록 좁히고 끝을 늘려 꼭지를 만든다(18×12 분할, 삼각형 약 400개)
function dropGeometry(r: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, 18, 12);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = y / r;                               // -1 아래 … 1 꼭대기
    if (u > 0) { const k = 1 - 0.62 * Math.pow(u, 1.6); x *= k; z *= k; y *= 1 + 0.45 * Math.pow(u, 2.2); }
    else { y *= 0.86; }                           // 바닥은 조금 납작
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function pongMaterial(color: THREE.Color, atlas: THREE.Texture, cell: THREE.Vector4): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color: color.clone(), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenRoughness: 0.3, name: 'iw-pong' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPongFace = { value: atlas }; sh.uniforms.uPongCell = { value: cell };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPongP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPongP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uPongFace; uniform vec4 uPongCell; varying vec3 vPongP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 fu = vPongP.xy / ${(PONG.radius * 1.5).toFixed(3)} + vec2(0.5, 0.42);
        if (vPongP.z > 0.0 && fu.x > 0.0 && fu.x < 1.0 && fu.y > 0.0 && fu.y < 1.0) {
          vec4 f = texture2D(uPongFace, uPongCell.xy + fu * uPongCell.zw);
          diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb, f.a);
        }
      }`);
  };
  m.customProgramCacheKey = () => 'iw-pong';
  return m;
}

// 2단 스프링(감쇠 진동, 세분 적분으로 프레임률 무관)
class Spring2 {
  declare a: THREE.Vector3; declare va: THREE.Vector3; declare b: THREE.Vector3; declare vb: THREE.Vector3;
  constructor() { this.a = new THREE.Vector3(); this.va = new THREE.Vector3(); this.b = new THREE.Vector3(); this.vb = new THREE.Vector3(); }
  reset(p: THREE.Vector3): void { this.a.copy(p); this.b.copy(p); this.va.set(0, 0, 0); this.vb.set(0, 0, 0); }
  step(target: THREE.Vector3, dt: number): THREE.Vector3 {
    const w = Math.PI * 2 * PONG.hz, z = PONG.zeta;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.va.addScaledVector(_t.copy(target).sub(this.a), w * w * h).multiplyScalar(1 / (1 + 2 * z * w * h));
      this.a.addScaledVector(this.va, h);
      this.vb.addScaledVector(_t.copy(this.a).sub(this.b), w * w * h).multiplyScalar(1 / (1 + 2 * z * w * h));
      this.b.addScaledVector(this.vb, h);
    }
    return this.b;
  }
}
const _t = new THREE.Vector3(), _v = new THREE.Vector3(), _cam = new THREE.Vector3();
const _off = new THREE.Vector3(PONG.offset[0], PONG.offset[1], PONG.offset[2]);

interface Mood { face: PongFace; left: number }

export class Pong {
  declare offstage: boolean;   // 패널 컷신 동안 숨긴다(패널이 자기 인물을 세운다, R027)
  declare mesh: THREE.Mesh; declare mat: THREE.MeshPhysicalMaterial; declare cell: THREE.Vector4; declare tex: THREE.CanvasTexture;
  declare actor: Actor | null; declare spring: Spring2; declare face: PongFace; declare mood: Mood | null;
  declare faceCamera: boolean;   // 대화 중에는 카메라 쪽으로 몸을 돌린다(3.3절, R026 대화가 켠다)
  declare hide: number; declare sy: number; declare syV: number; declare idleT: number; declare t: number;
  declare portrait: HTMLDivElement; declare portraitFace: HTMLDivElement; declare portraitLeft: number;
  declare unsubs: Array<() => unknown>;

  constructor(uiRoot: HTMLElement) {
    this.offstage = false;
    const atlas = pongAtlas();
    this.tex = new THREE.CanvasTexture(atlas.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.cell = new THREE.Vector4(0, 0.5, 0.25, 0.5);
    this.mat = pongMaterial(new THREE.Color('#ffffff'), this.tex, this.cell);
    this.mesh = new THREE.Mesh(dropGeometry(PONG.radius), this.mat);
    this.mesh.name = 'pong'; this.mesh.castShadow = false; this.mesh.visible = false;   // 그림자 패스를 더하지 않는다(드로우콜 +1)
    this.actor = null; this.spring = new Spring2(); this.face = 'normal'; this.mood = null;
    this.faceCamera = false; this.hide = 0; this.sy = 1; this.syV = 0; this.idleT = 0; this.t = 0;
    this.portrait = document.createElement('div'); this.portrait.className = 'iw-comm';
    this.portraitFace = document.createElement('div'); this.portraitFace.className = 'iw-comm__face';
    this.portraitFace.style.backgroundImage = `url(${atlas.url})`;
    this.portrait.appendChild(this.portraitFace);
    uiRoot.appendChild(this.portrait);
    this.portraitLeft = 0;
    this._setFace('normal');
    this.unsubs = [
      on('actor:land', (e: { actor: Actor; speed: number }) => { if (e.actor === this.actor && e.speed > 3) this.syV -= Math.min(6, e.speed * 0.6); }),
      on('cast:say', (e: { speaker?: string; text: string }) => { if (e.speaker === 'pong') this.showPortrait(Math.min(2.6, [...e.text].length * 0.06 + 0.7)); }),
    ];
  }

  // 로컬 플레이어에게 붙인다(null = 뗀다)
  attach(a: Actor | null): void {
    this.actor = a; this.mood = null; this.idleT = 0;
    if (a) {
      this.mat.color.copy(a.color);
      if (!this.mesh.parent) G.scene?.add(this.mesh);
      this.spring.reset(this._target(a, _v));
    } else this.mesh.removeFromParent();
    this.mesh.visible = !!a;
  }

  // 반응: 처치 → 기쁨, 피격 → 놀람, 퍼펙트 잠수 → 윙크 등(저체력·졸림은 update가 상태로 판단)
  react(face: PongFace, seconds: number): void { this.mood = { face, left: seconds }; }

  showPortrait(seconds: number): void { this.portraitLeft = seconds; this.portrait.classList.add('is-on'); }

  update(dt: number, camera: THREE.Camera | null): void {
    this.t += dt;
    if (this.portraitLeft > 0) { this.portraitLeft -= dt; if (this.portraitLeft <= 0) this.portrait.classList.remove('is-on'); }
    const a = this.actor;
    if (!a) return;
    const on = G.settings?.mascot !== false && a.alive;
    // 무입력 시간(졸림)
    const it = a.intent;
    if (Math.hypot(it.move.x, it.move.z) > 0.1 || it.fire || it.jump || it.squid || it.sub) this.idleT = 0; else this.idleT += dt;
    // 표정: 일시 반응 > 저체력(겁) > 졸림 > 기본
    if (this.mood) { this.mood.left -= dt; if (this.mood.left <= 0) this.mood = null; }
    const lowHp = a.hp / a.tune.hp < PONG.lowHp;
    const face: PongFace = this.mood ? this.mood.face : lowHp ? 'scared' : this.idleT > PONG.sleepyAfter ? 'sleepy' : 'normal';
    this._setFace(face);
    // 잠수(오징어·수영·벽타기) 중에는 탱크 안으로 숨는다
    const dive = a.form === 'squid' || a.climbing;
    this.hide = Math.max(0, Math.min(1, this.hide + (dive || !on ? dt : -dt) / PONG.hideTime));
    // 위치: 탱크 뼈 기준 오프셋을 2단 스프링으로
    const p = this.spring.step(this._target(a, _v), dt);
    this.mesh.position.copy(p);
    if (lowHp && face === 'scared') this.mesh.position.x += Math.sin(this.t * Math.PI * 2 * PONG.scaredHz) * 0.006;
    let yaw = a.yaw;
    if (this.faceCamera && camera) { camera.getWorldPosition(_cam); yaw = Math.atan2(_cam.x - p.x, _cam.z - p.z); }
    this.mesh.rotation.set(0, yaw, 0);
    // 늘림·찌그러짐: 점프 상승 중 1.3배, 착지 충격은 syV 충격으로 0.8배 근처까지
    const want = !a.grounded && a.vel.y > 2 ? PONG.jumpStretch : 1;
    const w = 18, z = 0.45;
    this.syV += ((want - this.sy) * w * w - 2 * z * w * this.syV) * dt;
    this.sy = Math.max(PONG.landSquash, Math.min(1.35, this.sy + this.syV * dt));
    // 카메라에 너무 가까우면(벽에 밀린 붐) 화면을 가리지 않게 줄인다
    let near = 1;
    if (camera) { camera.getWorldPosition(_cam); near = Math.max(0, Math.min(1, (_cam.distanceTo(p) - PONG.nearCam) / 0.3)); }
    const s = (1 - this.hide) * near;
    this.mesh.scale.set(s / Math.sqrt(this.sy), s * this.sy, s / Math.sqrt(this.sy));
    this.mesh.visible = s > 0.01 && !this.offstage;
  }

  _target(a: Actor, out: THREE.Vector3): THREE.Vector3 {
    const tank = (a.character.xb as Record<string, THREE.Object3D | undefined> | undefined)?.tank;
    if (tank) return tank.localToWorld(out.copy(_off));
    return out.set(a.pos.x, a.pos.y + 1.0, a.pos.z);
  }

  _setFace(face: PongFace): void {
    if (face === this.face && this.portraitFace.style.backgroundPosition) return;
    this.face = face;
    const i = PONG_FACES.indexOf(face);
    // 텍스처는 flipY(기본)라 v가 위에서 아래로 뒤집힌다: 0행(위) → v 0.5..1
    this.cell.set((i % 4) * 0.25, Math.floor(i / 4) === 0 ? 0.5 : 0, 0.25, 0.5);
    this.portraitFace.style.backgroundPosition = faceSpritePos(face);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose();
    this.portrait.remove();
  }
}
