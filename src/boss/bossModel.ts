// INKWAVE — HULLBREAKER boss model. Public surface (see docs/BOSS.md "Model" + "ART notes"):
//   const m = new BossModel({ ink, weak, quality });  m.root (feet at y = 0, facing +Z), m.ready (Promise)
//   m.update(dt, st) · m.flash(k, weak) · m.getSocket(name, out) · m.hitShapes · m.setInk(c) · m.setWeak(c)
//   m.setPhase(p) · m.trigger(name) · m.dispose() · hooks m.onFoot / m.onImpact / m.onEvent · BossModel.makeCrablet()
// A giant armoured hermit crab living in a rusted 20 ft shipping container. One skeleton (≈100 bones), five skinned
// meshes (steel / chitin / flesh / eyes / junk) + two FX draws; everything procedural (bossModelGeo / bossMats).
import * as THREE from 'three';
import { G } from '../core/ctx.js';
import { buildRig, buildParts, buildCrablet, CONT, HEAD, MC } from './bossModelGeo.js';
import { makeUniforms, makeBossMaterials, makeCrabletMaterial, makeStencilTexture } from './bossMats.js';
import { BossAnimator, C, type BossAnimState } from './bossAnim.js';
import type { Rig } from './bossModelGeo.js';
import type { BossUniforms } from './bossMats.js';
import type { Physics } from '../game/physics.js';
import { BossFX } from './bossModelFx.js';

// 맞는 부위: 소켓 이름, 반지름, 약점 여부
const HIT: Array<[string, number, boolean]> = [
  // socket, radius, weak
  ['shellF', 1.8, false], ['shellR', 1.8, false], ['body', 1.05, false], ['clawL', 0.85, false], ['clawR', 0.55, false],
  ['eyeL', 0.4, true], ['eyeR', 0.4, true], ['belly', 0.8, true], ['crackL', 0.7, true], ['crackR', 0.7, true],
];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function rivalOf(c: THREE.Color) { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return new THREE.Color().setHSL((h.h + 0.5) % 1, Math.max(0.7, h.s), 0.5); }

// 맞는 부위 하나: 소켓·반지름·약점·지금 맞을 수 있는지·월드 위치(c는 pos 별칭)
export interface HitShape { socket: string; r: number; weak: boolean; active: boolean; pos: THREE.Vector3; c: THREE.Vector3 }

export class BossModel {
  quality: string;
  root: THREE.Group;
  onFoot: ((i: number, pos: THREE.Vector3, s: number) => void) | null = null;
  onImpact: ((socket: string, pos: THREE.Vector3, s: number) => void) | null = null;
  onEvent: ((name: string, data: Record<string, unknown>) => void) | null = null;
  phase = 1;
  physics: Physics | null = null;
  rig: Rig;
  tris: number;
  U: BossUniforms;
  _stencil: THREE.Texture | null;
  mats: ReturnType<typeof makeBossMaterials>;
  skeleton: THREE.Skeleton;
  meshes: THREE.SkinnedMesh[] = [];
  _sock: Record<string, { bone: THREE.Bone; off: THREE.Vector3 }> = {};
  _vents: Array<{ bone: THREE.Bone; off: THREE.Vector3 }>;
  hitShapes: HitShape[];
  anim: BossAnimator;
  fx: BossFX;
  _flash = 0; _weakFlash = 0; _lastFlashT = -9; _t = 0;
  _crack = 0; _enrage = 0; _ventAcc = 0;
  _st: BossAnimState | null = null;
  ready: Promise<BossModel>;
  constructor({ ink = null, weak = null, quality = 'high' }: { ink?: THREE.ColorRepresentation | null; weak?: THREE.ColorRepresentation | null; quality?: string } = {}) {
    this.quality = quality;
    this.root = new THREE.Group(); this.root.name = 'HULLBREAKER';
    const inkC = ink ? new THREE.Color(ink) : G.teamColors?.[1] ? G.teamColors[1].clone() : new THREE.Color('#2f5bff');
    const weakC = weak ? new THREE.Color(weak) : G.teamColors?.[0] ? G.teamColors[0].clone() : rivalOf(inkC);
    // ---- rig + geometry
    this.rig = buildRig();
    const parts = buildParts(this.rig, quality);
    this.tris = parts.tris;
    this.U = makeUniforms();
    this.U.uContInv.value.copy(MC).invert();
    const st = makeStencilTexture(); this.U.uStencil.value = st.tex; this._stencil = st.tex;
    this.mats = makeBossMaterials(this.U);
    this.skeleton = new THREE.Skeleton(this.rig.bones);
    this.root.add(this.rig.by.base);
    this.root.updateMatrixWorld(true);
    const shadowOK = quality !== 'low';
    for (const k of ['steel', 'cara', 'flesh', 'eye', 'junk']) {
      const b = parts.buckets[k as keyof typeof parts.buckets]; if (!b.nv) continue;
      const mesh = new THREE.SkinnedMesh(b.geometry(), this.mats[k as keyof typeof this.mats]);
      mesh.name = 'hullbreaker:' + k;
      mesh.castShadow = shadowOK && k !== 'eye'; mesh.receiveShadow = true;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.6, 0), 8.6);
      this.root.add(mesh);
      mesh.bind(this.skeleton);
      this.meshes.push(mesh);
    }
    // ---- sockets (bone + bone-local offset)
    for (const [name, [bone, p]] of Object.entries(parts.sockets)) this._sock[name] = { bone: this.rig.by[bone], off: p.clone().sub(this.rig.rest[bone]) };
    this._sock.shellF = { bone: this.rig.by.shell, off: new THREE.Vector3(0, 0.05, 1.5).applyMatrix4(new THREE.Matrix4().makeRotationX(CONT.pitch)).add(CONT.pos).sub(this.rig.rest.shell) };
    this._sock.shellR = { bone: this.rig.by.shell, off: new THREE.Vector3(0, 0.1, -1.55).applyMatrix4(new THREE.Matrix4().makeRotationX(CONT.pitch)).add(CONT.pos).sub(this.rig.rest.shell) };
    this._sock.body = { bone: this.rig.by.head, off: new THREE.Vector3(0, 2.2, 2.3).sub(this.rig.rest.head) };
    this._vents = parts.vents.map(([bone, p]) => ({ bone: this.rig.by[bone], off: p.clone().sub(this.rig.rest[bone]) }));
    this.hitShapes = HIT.map(([socket, r, weak]) => { const pos = new THREE.Vector3(); return { socket, r, weak, active: !weak || socket.startsWith('eye'), pos, c: pos }; });
    // ---- animation + fx
    this.anim = new BossAnimator(this, this.rig);
    this.fx = new BossFX({ quality, ink: inkC });
    this.root.add(this.fx.group);
    // ---- state
    this.setInk(inkC); this.setWeak(weakC);
    this.ready = st.ready.then(() => this);
    this.update(0, { speed: 0, turn: 0, move: null, moveT: 0, movePhase: null, phase: 1, stunned: false, hurt: 0, dead: false, aim: null });
    this.anim.prevPhase = 0; this.phase = 0;     // the first real update adopts st.phase without a roar
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, st: BossAnimState = {}) {
    this._t += dt; this._st = st;
    if (!this.physics && G.physics) this.physics = G.physics;
    if (st.phase && st.phase !== this.phase) this.setPhase(st.phase);
    // suppress st.hurt flinch right after a flash() (flash already flinched)
    if (st.hurt && this._t - this._lastFlashT < 0.12) { this.anim.prevHurt = st.hurt; }
    this.anim.update(dt, st);
    const P = this.anim.P, U = this.U, A = this.anim;
    // ---- material drive
    this._flash = Math.max(0, this._flash - dt * 7); this._weakFlash = Math.max(0, this._weakFlash - dt * 4);
    this._crack += ((this.phase >= 2 ? 1 : 0) - this._crack) * Math.min(1, dt * 1.2);
    this._enrage += ((this.phase >= 3 && !st.dead ? 1 : 0) - this._enrage) * Math.min(1, dt * 1.5);
    U.uTime.value = this._t;
    U.uFlash.value = this._flash; U.uWeakFlash.value = this._weakFlash;
    U.uCrack.value = this._crack * (st.dead ? Math.max(0, 1 - A.deadT * 0.3) : 1);
    U.uOpen.value = Math.max(0, Math.min(1.2, A.sp.tear.x)) * (st.dead ? Math.max(0, 1 - A.deadT * 0.25) : 1);
    U.uEnrage.value = this._enrage;
    U.uGlowL.value = Math.max(0, P[C.glowL]);
    U.uCannon.value = Math.max(0, Math.min(1.2, P[C.cannon]));
    U.uBelly.value = Math.max(0, Math.min(1, P[C.belly]));
    U.uHeat.value = this._enrage;
    const dead = !!st.dead;
    U.uEyeMode.value = dead && A.deadT > 1.6 ? 2 : (A.key === 'stun' && A.clipT > 0.3) ? 1 : 0;
    U.uEyeSpin.value += dt * (U.uEyeMode.value === 1 ? 1 : 0);
    U.uEyeGlow.value = dead ? Math.max(0.35, 1 - A.deadT * 0.3) : 1 + 0.35 * this._enrage;
    U.uLamp.value = dead ? 0 : 1;
    // ---- hit shapes
    const below = P[C.by] < -2.2;
    for (const h of this.hitShapes) {
      this.getSocket(h.socket, h.pos);
      if (h.socket === 'belly') h.active = !dead && !below && (!!st.stunned || this.phase >= 3 || P[C.belly] > 0.5);
      else if (h.socket === 'crackL' || h.socket === 'crackR') h.active = !dead && !below && A.sp.tear.x > 0.5;
      else h.active = !dead && !below;
    }
    // ---- fx: steam vents (phase 3 + channel), nozzle steam
    const steam = Math.max(P[C.steam], 0);
    if (steam > 0.01 && !below) {
      this._ventAcc += dt * 9 * steam;
      while (this._ventAcc >= 1) {
        this._ventAcc -= 1;
        const v = this._vents[(Math.random() * this._vents.length) | 0];
        _v.copy(v.off).applyMatrix4(v.bone.matrixWorld);
        this.fx.steamPuff(_v, 1, _v2.set(0, 1, 0), 1.2, 1.0, 1.5);
      }
    }
    if (A.key === 'sweep:rec' && A.cross(0.02)) { this.getSocket('cannon', _v); this.fx.steamPuff(_v, 8, _v2.set(0, 0.3, 1).transformDirection(this.root.matrixWorld), 2.5, 0.8, 1.2); }
    this.fx.update(dt);
  }

  // hooks (called by the animator on exact frames); the Vector3 passed out is reused
  _emitFoot(i: number, pos: THREE.Vector3, s: number) { if (this.onFoot) this.onFoot(i, pos, s); if (this.onEvent) this.onEvent('step', { leg: i, pos, strength: s }); }
  _emitImpact(socket: string, s: number) {
    const p = this.getSocket(socket, _v);
    const gy = this.root.matrixWorld.elements[13];
    if (socket === 'clawL') { p.y = gy + 0.05; this.fx.ink(p, 26, _v2.set(0, 1, 0), 7, 0.9, 0.2, gy); }
    if (socket === 'mouth') this.fx.ink(p, 14, _v2.set(0, 0.6, 1).transformDirection(this.root.matrixWorld), 5, 0.9, 0.16, gy);
    if (socket === 'body') this.fx.ink(p.setY(gy + 0.2), 30, _v2.set(0, 1, 0), 6, 1.0, 0.2, gy);
    if (this.onImpact) this.onImpact(socket, p, s);
  }
  _emitEvent(name: string, socket: string, data?: unknown) {
    const p = this.getSocket(socket, _v);
    const gy = this.root.matrixWorld.elements[13];
    if (name === 'burst') { _v.setFromMatrixPosition(this.root.matrixWorld); _v.y += 0.3; this.fx.ink(_v, 90, _v2.set(0, 1, 0), 13, 0.75, 0.3, gy, 2.6); this.fx.steamPuff(_v, 14, _v2.set(0, 1, 0), 4, 2.5, 2.0); }
    if (name === 'geyser') this.fx.geyser(p, 3.6);
    if (name === 'hatch') { this.fx.ink(p, 5, _v2.set(0, 1, 0), 5, 0.5, 0.14, gy); this.fx.steamPuff(p, 2, _v2.set(0, 1, 0), 2, 0.9, 0.9); }
    if (name === 'roar' && this.phase >= 3) this.fx.steamPuff(p, 10, _v2.set(0, 0.5, 1).transformDirection(this.root.matrixWorld), 3, 1.2, 1.3);
    if (this.onEvent) this.onEvent(name, { socket, pos: p, data });
  }

  // ---------------------------------------------------------------- API
  flash(k = 1, weak = false) {
    if (weak) this._weakFlash = Math.max(this._weakFlash, k); else this._flash = Math.max(this._flash, k * 0.6);
    if (this._t - this._lastFlashT > 0.09) this.anim.flinch(Math.min(1, 0.3 + k * 0.7) * (weak ? 1.2 : 1));
    this._lastFlashT = this._t;
  }
  getSocket(name: string, out = new THREE.Vector3()) {
    const s = this._sock[name];
    if (!s) return out.setFromMatrixPosition(this.root.matrixWorld);
    return out.copy(s.off).applyMatrix4(s.bone.matrixWorld);
  }
  setInk(color: THREE.ColorRepresentation) { this.U.uInk.value.set(color); this.fx?.setInk(this.U.uInk.value); }
  setWeak(color: THREE.ColorRepresentation) { this.U.uWeak.value.set(color); }
  setPhase(p: number) { this.phase = p; }
  /** one-shots: 'intro' | 'roar' | 'hurt' */
  trigger(name: string) { this.anim.trigger(name); }
  get sockets() { return Object.keys(this._sock); }
  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    for (const mt of Object.values(this.mats)) mt.dispose();
    this._stencil?.dispose(); this.skeleton.dispose(); this.fx.dispose();
    this.root.removeFromParent();
  }

  /** the minion: small container-lid crab. { root, ready, update(dt, st), pop(), setInk, dispose } */
  static makeCrablet(opts: { ink?: THREE.ColorRepresentation | null; weak?: THREE.ColorRepresentation | null; quality?: string } = {}) { return new Crablet(opts); }
}

// ------------------------------------------------------------------------------------------------ crablet
const _cq = new THREE.Quaternion(), _ce = new THREE.Euler(0, 0, 0, 'YXZ');
export class Crablet {
  root: THREE.Group;
  R: ReturnType<typeof buildCrablet>;
  tris: number;
  U: BossUniforms;
  mat: ReturnType<typeof makeCrabletMaterial>;
  skel: THREE.Skeleton;
  mesh: THREE.SkinnedMesh;
  t = 0; phi = Math.random(); popped = false; popT = -1;
  fx: BossFX | null = null;
  seed = Math.random() * 10;
  ready: Promise<Crablet>;
  constructor({ ink = null, weak = null, quality = 'high' }: { ink?: THREE.ColorRepresentation | null; weak?: THREE.ColorRepresentation | null; quality?: string } = {}) {
    this.root = new THREE.Group(); this.root.name = 'crablet';
    const inkC = ink ? new THREE.Color(ink) : G.teamColors?.[1] ? G.teamColors[1].clone() : new THREE.Color('#2f5bff');
    const weakC = weak ? new THREE.Color(weak) : G.teamColors?.[0] ? G.teamColors[0].clone() : rivalOf(inkC);
    const R = buildCrablet(quality);
    this.R = R; this.tris = R.tris;
    this.U = makeUniforms(); this.U.uInk.value.copy(inkC); this.U.uWeak.value.copy(weakC);
    this.mat = makeCrabletMaterial(this.U);
    this.skel = new THREE.Skeleton(R.bones);
    this.root.add(R.by.base); this.root.updateMatrixWorld(true);
    this.mesh = new THREE.SkinnedMesh(R.geo, this.mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 0.9);
    this.root.add(this.mesh); this.mesh.bind(this.skel);
    this.ready = Promise.resolve(this);
    this.update(0, {});
  }
  update(dt: number, st: BossAnimState = {}) {
    this.t += dt;
    const by = this.R.by, t = this.t;
    if (st.dead && !this.popped) this.pop();
    const sp = Math.min(1, (st.speed || 0) / 3);
    this.phi += dt * (1.2 + (st.speed || 0) * 2.4);
    const ph = this.phi * Math.PI * 2;
    // tumble in (first 0.55 s): a roll and a squash on landing
    const tum = Math.max(0, 1 - t / 0.55);
    const land = t > 0.5 && t < 0.8 ? Math.sin(((t - 0.5) / 0.3) * Math.PI) : 0;
    _ce.set(tum * tum * 6.0, 0, tum * 2.5 + Math.sin(ph * 2) * 0.06 * sp, 'YXZ');
    by.body.quaternion.setFromEuler(_ce);
    by.body.position.set(0, 0.26 + Math.abs(Math.sin(ph)) * 0.035 * sp + Math.sin(t * 3 + this.seed) * 0.008 - land * 0.05 + tum * 0.2, 0);
    by.body.scale.set(1 + land * 0.12, 1 - land * 0.15, 1 + land * 0.12);
    by.lid.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -0.05 * Math.abs(Math.sin(ph * 2)) * sp - land * 0.1);
    // legs: alternating tripods
    const legs = this.R.legs;
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i], grp = (i % 2) ^ (i >= 3 ? 1 : 0), a = ph + grp * Math.PI;
      _ce.set(0, Math.sin(a) * 0.45 * sp, L.side * (Math.max(0, Math.cos(a)) * 0.5 * sp + tum * 0.9), 'YXZ');
      by[L.name].quaternion.setFromEuler(_ce);
    }
    // claws snap, eyes wobble
    const snap = Math.max(0, Math.sin(t * 5 + this.seed)) ** 6;
    by.clawL.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -0.3 * snap - 0.15 * Math.sin(ph) * sp);
    by.clawR.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -0.3 * Math.max(0, Math.sin(t * 5 + this.seed + 1.7)) ** 6 + 0.15 * Math.sin(ph) * sp);
    by.eyeL.quaternion.setFromAxisAngle(_v.set(0, 0, 1), Math.sin(t * 7 + this.seed) * 0.15);
    by.eyeR.quaternion.setFromAxisAngle(_v.set(0, 0, 1), Math.sin(t * 7.3 + this.seed + 1) * 0.15);
    // pop: swell + flash, then burst into ink
    if (this.popT >= 0) {
      this.popT += dt;
      const u = Math.min(1, this.popT / 0.14);
      this.mesh.scale.setScalar(1 + 0.45 * u * u);
      this.U.uFlash.value = u;
      if (this.popT >= 0.14 && this.mesh.visible) {
        this.mesh.visible = false;
        this.fx = new BossFX({ quality: 'low', ink: this.U.uInk.value });
        this.root.add(this.fx.group);
        _v.set(0, 0.3, 0).applyMatrix4(this.root.matrixWorld);
        this.fx.ink(_v, 26, _v2.set(0, 1, 0), 4.2, 1.0, 0.09, this.root.matrixWorld.elements[13], 1.2);
      }
    } else this.U.uFlash.value = Math.max(0, this.U.uFlash.value - dt * 6);
    if (this.fx) this.fx.update(dt);
    this.U.uTime.value = t;
  }
  hit() { this.U.uFlash.value = 1; }
  pop() { if (this.popped) return; this.popped = true; this.popT = 0; }
  setInk(c: THREE.ColorRepresentation) { this.U.uInk.value.set(c); }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.skel.dispose(); this.fx?.dispose(); this.root.removeFromParent(); }
}
