// Local player controller: common input frame → actor intent + camera yaw/pitch + aim point (stream 4, 33번 T016).
//
// 입력은 main이 매 프레임 만든 공통 프레임(G.frame, core/inputFrame.ts)에서만 읽는다. 원시 패드 인덱스·키 코드와 공통
// 액션을 함께 읽지 않으므로(지도 숫자 키 제외 — 키보드에만 있는 선택 단축키다) 한 누름이 두 번 실행되지 않는다.
//
// Look: mouse is raw (pointer lock, unadjusted movement — no smoothing, no acceleration); a virtual drag carries its own
// gain (frame.lookDelta already in rad). The stick arrives as an angular rate (frame.lookRate: curve, edge boost and a
// tiny low-pass applied in inputFrame.ts) and is multiplied by dt exactly once here. Aim assist (gamepad and virtual
// controls by default; settings.aimAssistMouse opts the mouse in): friction slows the look near an enemy under the
// crosshair, tracking assist carries a fraction of the target's angular motion while you are actively aiming or moving
// — never an auto-snap. Bullet magnetism pulls shots onto the body line of an enemy the crosshair is actually touching.
// 에임 보조·감도는 가상 키의 표시 여부가 아니라 실제 입력 출처(frame.source)로 고른다.
import { t } from '../ui/i18n.js';
import * as THREE from 'three';
import { G, clamp, lerp, angleDiff } from '../core/ctx.js';
import { PLAYER, weaponRange } from '../config.js';
import { Physics, Hit } from './physics.js';
import { emptyActions, type InputFrame } from '../core/inputFrame.js';
import type { SubItem } from './subs.js';
import type { Actor, ActorIntent } from './actor.js';
import type { CameraRig } from './cameraRig.js';
import type { Input } from '../core/input.js';
import type { Minimap } from './minimap.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fwd = new THREE.Vector3(), _c = new THREE.Vector3();
const _hit = new Hit();
const _res = { t: 0, dist: 0 };
const DEG = Math.PI / 180;
const STRIKE_CURSOR = { stick: 320, move: 280, pointer: 0.45 } as const;   // Vortex Strike 지도 커서 속도(px/s, px 배율)

type Beacon = SubItem;   // 점프 비콘(subs.ts의 설치 보조무기)
interface JumpPlan { kind: 'ally' | 'beacon'; target: Actor | Beacon; name: string }
interface Assist { target: Actor | null; yaw: number; pitch: number; has: boolean; strength: number; closeness: number; prevValid: boolean; prevYaw: number; prevPitch: number }
type Intent = ActorIntent & { cheer?: boolean };

// 프레임이 아직 없을 때(첫 프레임 전·도구 페이지) 쓰는 빈 프레임
const BLANK: InputFrame = {
  context: 'menu', source: 'keyboardMouse', move: { x: 0, y: 0 }, moveSource: null, lookDelta: { yaw: 0, pitch: 0 }, lookRate: { yaw: 0, pitch: 0 },
  lookActive: false, cursor: { dx: 0, dy: 0 }, sticks: { lx: 0, ly: 0, rx: 0, ry: 0 }, nav: [], actions: emptyActions(),
};

export class PlayerController {
  declare a: Actor; declare rig: CameraRig; declare input: Input;
  declare mapHeld: boolean; declare onTarget: Actor | object | null; declare inRange: boolean;
  declare enabled: boolean; declare assist: Assist;
  declare jumpQueue: JumpPlan | null;
  declare _strikePull: boolean;

  constructor(actor: Actor, rig: CameraRig, input: Input) {
    this.a = actor; this.rig = rig; this.input = input;
    this.mapHeld = false;
    this.onTarget = null;
    this.inRange = false;
    this.enabled = true;
    this.assist = { target: null, yaw: 0, pitch: 0, has: false, strength: 0, closeness: 0, prevValid: false, prevYaw: 0, prevPitch: 0 };
    // Super Jump planned on the TAB map while splatted: { kind: 'ally' | 'beacon', target, name }. Picking only queues it;
    // it launches (the normal charge + flight) the moment you respawn — see launchQueuedJump(), called on 'respawn'
    this.jumpQueue = null;
    this._strikePull = false;
  }

  update(dt: number): void {
    const a = this.a, rig = this.rig, s = G.settings ?? ({} as NonNullable<typeof G.settings>);
    const f = G.frame ?? BLANK, A = f.actions;
    const it = a.intent as Intent;
    if (!this.enabled) {
      it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false;
      this.assist.has = false;
      // splatted in a live round: the TAB map still opens, to plan the Super Jump you'll take on respawn
      const m = G.match;
      const planning = !!(m && !a.alive && m.state === 'playing' && !m.paused);
      this.mapHeld = planning && A.map.held;
      if (planning) { this._checkQueue(); if (this.mapHeld) this._mapKeys(true, f); }
      else if (!m || m.state !== 'playing') this.jumpQueue = null;
      return;
    }
    // Pad and virtual controls take the full-strength assist; the mouse only when aimAssistMouse opts in (gentler).
    const assisted = f.source === 'gamepad' || f.source === 'virtual';
    const as = this._assistTarget(assisted ? (s.aimAssist ?? 1) : (s.aimAssistMouse ? 0.5 : 0));
    const friction = as ? lerp(1, 0.58, as.closeness * as.strength) : 1;
    const fr = assisted || s.aimAssistMouse ? friction : 1;
    // Vortex Strike targeting: pointer / sticks / move drive a cursor over the (opened) stage map, fire launches
    const spx = a.specialActive;
    if (spx && spx.id === 'strike' && spx.aiming) {
      const mm = (G.game as { minimap?: Minimap } | null)?.minimap;
      const k = STRIKE_CURSOR.pointer * (s.sensitivity ?? 1);
      const cx = f.cursor.dx * k + (f.sticks.rx * STRIKE_CURSOR.stick + f.move.x * STRIKE_CURSOR.move) * dt;
      const cy = f.cursor.dy * k + (f.sticks.ry * STRIKE_CURSOR.stick - f.move.y * STRIKE_CURSOR.move) * dt;
      G.specials!.aimMove(a, cx, cy, mm);
      // launch on a fresh press (a trigger still held from shooting when the special started doesn't count)
      const pull = A.fire.held;
      if (spx.t < 0.05) this._strikePull = pull;
      if (pull && !this._strikePull) G.specials!.aimConfirm(a);
      this._strikePull = pull;
      it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false;
      this.mapHeld = false;
      return;
    }
    // while the map diorama is up the pointer / right stick steer the map cursor (diorama.js), not your camera
    const mapUp = f.context === 'map' || (rig.mapK ?? 0) > 0.05 || A.map.held;
    let lookActive = false;
    if (!mapUp) {
      if (f.lookDelta.yaw || f.lookDelta.pitch) { rig.yaw += f.lookDelta.yaw * fr; rig.pitch += f.lookDelta.pitch * fr; lookActive = true; }
      if (f.lookRate.yaw || f.lookRate.pitch) { rig.yaw += f.lookRate.yaw * fr * dt; rig.pitch += f.lookRate.pitch * fr * dt; lookActive = true; }
      if (f.lookActive) lookActive = true;
    }
    // ---- move (camera relative): one device, length ≤ 1 (inputFrame.ts)
    const mx = f.move.x, mz = f.move.y;
    const ml = Math.hypot(mx, mz);
    // tracking assist: carry a share of the target's angular motion while the player is engaging (look or move input)
    if (as && as.prevValid && (lookActive || ml > 0.2 || it.fire)) {
      const share = 0.42 * as.strength * as.closeness;
      rig.yaw += angleDiff(as.prevYaw, as.yaw) * share;
      rig.pitch += (as.pitch - as.prevPitch) * share * 0.7;
    }
    rig.pitch = clamp(rig.pitch, -1.05, 1.15);
    a.aimYaw = rig.yaw;
    a.aimPitch = rig.pitch;
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
    // forward = (sy, 0, cy); right = (-cy, 0, sy)
    it.move.set(sy * mz - cy * mx, 0, cy * mz + sy * mx);

    it.jump = A.jump.held;
    it.squid = A.squid.held;
    it.fire = A.fire.held;
    it.sub = A.sub.held;
    it.special = A.special.held;
    this.mapHeld = A.map.held;   // (컨텍스트 'map'은 이 값과 닫히는 연출에서 나온다: 여기서 다시 읽으면 닫히지 않는다)
    // "Yeah!" signal (C / d-pad up / virtual button outside the map): cheers on a teammate's Cheer Orb
    if (A.cheer.pressed && !this.mapHeld) it.cheer = true;
    // the TAB map is a targeting UI (clicking a teammate beacon super jumps) — never fire or throw through it
    if (this.mapHeld) { it.fire = false; it.sub = false; }
    // super jump: while the map is open, 1-3 (or d-pad left/up/right) jumps to that teammate, 4 / d-pad down to spawn
    if (this.mapHeld && a.canSuperJump()) this._mapKeys(false, f);

    // ---- aim point from the camera centre ray
    this.computeAim();
  }

  // TAB-map number keys / d-pad: 1–3 teammates, 4 base, 5–9 + 0 team jump beacons (oldest first, as the map lists
  // them). Alive: jump now. Splatted (queue = true): plan the jump for the respawn instead — it never launches early.
  _mapKeys(queue: boolean, f: InputFrame): void {
    const a = this.a, inp = this.input, A = f.actions;
    const allies = G.actors.filter((o) => o.team === a.team && o !== a);
    const pick = (kind: 'ally' | 'base' | 'beacon', target: Actor | Beacon | null | undefined) => {
      if (queue) { this.queueJump(kind, target ?? null); return; }
      if (kind === 'ally') { const t = target as Actor | undefined; if (t && t.alive && !t.superJumpState) a.superJump(t); }
      else if (kind === 'base') a.superJump(G.level!.spawnPads[a.team].clone());
      else G.subs!.jumpToBeacon(a, target as Beacon | null | undefined);
    };
    if (inp.wasPressed('Digit1') || A.dLeft.pressed) pick('ally', allies[0]);
    if (inp.wasPressed('Digit2') || A.dUp.pressed) pick('ally', allies[1]);
    if (inp.wasPressed('Digit3') || A.dRight.pressed) pick('ally', allies[2]);
    if (inp.wasPressed('Digit4') || A.dDown.pressed) pick('base', null);
    if (G.subs) {
      const bs = (G.subs.beaconsFor(a.team) as Beacon[]).sort((x, y) => x.born - y.born);
      for (let k = 0; k < Math.min(6, bs.length); k++) if (inp.wasPressed('Digit' + ((k + 5) % 10))) pick('beacon', bs[k]);
    }
  }

  // ---- Super Jump planned while splatted -------------------------------------------------------------------------
  // Queue (or change) the jump for the respawn. kind 'base' clears the plan: you drop in at base anyway. A splatted
  // teammate can't be picked (they come back at base); one mid Super Jump can (you land where they come down).
  // Returns true when the pick was taken. Never jumps: the actor is splatted.
  queueJump(kind: 'ally' | 'base' | 'beacon', target: Actor | Beacon | null): boolean {
    const a = this.a;
    if (a.alive) return false;
    let q: JumpPlan | null = null;
    if (kind === 'ally') { const t = target as Actor | null; if (t && t.team === a.team && t !== a && t.alive) q = { kind, target: t, name: t.name }; }
    else if (kind === 'beacon') { const b = target as Beacon | null; if (b && b.state === 'beacon' && b.team === a.team) q = { kind, target: b, name: b.owner === a ? 'Your beacon' : t('{name}의 비콘', { name: b.owner?.name || t('팀') }) }; }
    if (kind === 'base') {
      const had = !!this.jumpQueue;
      this.jumpQueue = null;
      G.audio?.play(had ? 'ui_back' : 'ui_click', { volume: 0.5 });
      return true;
    }
    if (!q) { G.audio?.play('ui_error', { volume: 0.5 }); return false; }
    const same = this.jumpQueue && this.jumpQueue.target === q.target;
    this.jumpQueue = q;
    G.audio?.play('ui_confirm', { volume: same ? 0.35 : 0.6 });
    return true;
  }

  // is the planned target still there? (teammate alive, beacon standing)
  _queueGone(q: JumpPlan | null): string | null {
    if (!q) return null;
    if (q.kind === 'ally') return (q.target as Actor).alive ? null : t('{name}이(가) 당했다', { name: q.name });
    return (q.target as Beacon).state === 'beacon' ? null : 'The jump beacon is gone';
  }

  // while splatted: a planned target that goes down is dropped straight away (so you can pick again)
  _checkQueue(): void {
    const why = this._queueGone(this.jumpQueue);
    if (!why) return;
    this.jumpQueue = null;
    (G.hud as { jumpNote?(t: string): void } | null)?.jumpNote?.(t('{why} — 슈퍼 점프 취소', { why: t(why) }));
    G.audio?.play('ui_error', { volume: 0.45 });
  }

  // On respawn (main's 'respawn' handler): launch the planned jump through the normal Super Jump (charge + flight).
  // A target that's gone by now cancels it with a short note. Returns true if a jump started.
  launchQueuedJump(): boolean {
    const q = this.jumpQueue, a = this.a;
    if (!q || !a.alive) return false;   // (still splatted: the plan stays)
    this.jumpQueue = null;
    const why = this._queueGone(q);
    let ok = false;
    if (!why) ok = q.kind === 'beacon' ? !!G.subs?.jumpToBeacon(a, q.target as Beacon) : a.superJump(q.target as Actor);
    if (!ok) { (G.hud as { jumpNote?(t: string): void } | null)?.jumpNote?.(t('{why} — 슈퍼 점프 취소', { why: t(why || 'Can’t Super Jump right now') })); G.audio?.play('ui_error', { volume: 0.45 }); }
    return ok;
  }

  // Best enemy near the crosshair for aim assist (angular cone scaled so it covers ~a body width at any range).
  _assistTarget(strength: number): Assist | null {
    const as = this.assist;
    const a = this.a, cam = G.camera;
    if (!(strength > 0) || !cam) { as.has = false; as.target = null; return null; }
    const fwd = cam.getWorldDirection(_fwd);
    const maxR = Math.min(32, (weaponRange(a.weapon) ?? 0) * 1.15 + 2);
    let best: Actor | null = null, bestScore = Infinity, bYaw = 0, bPitch = 0, bClose = 0;
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive || e.anim.form === 'swim' || e.invuln > 0) continue;
      _c.set(e.pos.x, e.pos.y + (e.smoothY || 0) + (e.form === 'squid' ? 0.3 : 0.95), e.pos.z);
      _v.copy(_c).sub(cam.position);
      const d = _v.length();
      if (d > maxR + 4 || d < 0.5) continue;
      if (a.pos.distanceTo(e.pos) > maxR) continue;
      _v.multiplyScalar(1 / d);
      const ang = Math.acos(clamp(_v.dot(fwd), -1, 1));
      const cone = clamp(Math.atan2(1.0, d), 2.5 * DEG, 10 * DEG);
      if (ang > cone) continue;
      if (!G.physics!.los(cam.position, _c)) continue;
      const score = ang / cone + d * 0.01;
      if (score < bestScore) { bestScore = score; best = e; bYaw = Math.atan2(_v.x, _v.z); bPitch = Math.asin(clamp(_v.y, -1, 1)); bClose = 1 - ang / cone; }
    }
    if (!best) { as.has = false; as.target = null; return null; }
    as.prevValid = as.has && as.target === best;
    as.prevYaw = as.yaw; as.prevPitch = as.pitch;
    as.target = best; as.yaw = bYaw; as.pitch = bPitch; as.closeness = clamp(bClose * 1.3, 0, 1); as.strength = strength; as.has = true;
    return as;
  }

  computeAim(): void {
    // the gameplay view — while the map diorama is up the rendered camera is overhead, aim stays with the player
    const a = this.a, cam = G.rig?.gameCam || G.camera!;
    const fwd = cam.getWorldDirection(_fwd);
    // start the ray level with the player so geometry between camera and player is ignored
    _v.copy(a.pos); _v.y += 1.3;
    const along = Math.max(0, _v.sub(cam.position).dot(fwd));
    const start = _v2.copy(cam.position).addScaledVector(fwd, along);
    const hit = G.physics!.raycast(start, fwd, 70, _hit, true);
    const dist = hit.hit ? hit.dist : 70;
    a.aimPoint.copy(start).addScaledVector(fwd, dist);
    // enemy under the crosshair? (visual body, generous by 0.2 m)
    this.onTarget = null;
    let best = dist;
    const reach = Math.min(dist, 34);
    const end = _v.copy(start).addScaledVector(fwd, reach);
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      if (e.anim.form === 'swim') continue;
      _c.set(e.pos.x, e.pos.y + (e.smoothY || 0), e.pos.z);
      Physics.segmentCapsuleDist(start, end, _c, PLAYER.radius, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);
      if (_res.dist < PLAYER.radius + 0.2) {
        const d = _res.t * reach;
        if (d < best) { best = d; this.onTarget = e; }
      }
    }
    // boss mode: the crosshair stops on HULLBREAKER's shell (lobs land on it, the reticle lights up)
    if (G.boss) {
      const bd = G.boss.rayDist(start, fwd, best);
      if (bd > 0 && bd < best) { this.onTarget = G.boss; a.aimPoint.copy(start).addScaledVector(fwd, bd); }
    }
    if (this.onTarget && this.onTarget !== G.boss) {
      // bullet magnetism: converge on the enemy's body axis at the height the crosshair crosses it
      const e = this.onTarget as Actor;
      const h = e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height;
      const py = start.y + fwd.y * best;
      const baseY = e.pos.y + (e.smoothY || 0);
      a.aimPoint.set(e.pos.x, clamp(py, baseY + 0.2, baseY + h - 0.12), e.pos.z);
    }
    // is the crosshair point inside the weapon's effective range? (HUD reticle state)
    this.inRange = a.aimPoint.distanceTo(a.pos) <= (weaponRange(a.weapon) ?? 0) + 0.5;
  }
}
