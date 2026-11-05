// 캠페인 적 행동 상태기(33번 T026·T042·T045, 24번 5절). 기존 대전 봇(BotBrain)이 아니라 병종 규칙으로 움직인다:
//   경계(자리) → 발견 → 접근(구간 안, leash까지) → 예고 → 공격 → 재정비 → … , 시야를 잃으면 마지막 위치 탐색 → 자리로 복귀.
// 공격은 예고(바닥 텔레그래프) 뒤에만 시작하고, 재정비 중에는 예고 없이 반격하지 않는다. 길을 잃으면(진행 없음 2.5초)
// 자기 자리 근처 이동 그래프 노드로 안전하게 되돌린다. 보이지 않는 뒤에서 즉시 쏘지 않는다(발견 반응 지연).
// Actor에 a.bot으로 붙고 Match.update가 경기 중에만 update(dt)를 부른다. 스태거 중의 의도는 CampaignCombat이 지운다.
import * as THREE from 'three';
import { G, clamp, angleDiff } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import type { Rect, UnitDef } from '../data/types.js';
import { ENEMY_ROLES, type EnemyRoleDef } from '../data/enemies.js';
import type { TelegraphDirector, TelegraphSpec } from '../action/telegraph.js';

export type BrainState = 'guard' | 'chase' | 'windup' | 'attack' | 'recover' | 'search' | 'return' | 'dash' | 'swing' | 'open';

export interface EnemyWorld {
  player(): Actor | null;
  telegraphs: TelegraphDirector;
  telegraphMul: number;               // 난이도별 예고 시간 배율(이야기 > 1)
  bounds(segment: string): Rect | null;
  // 대장·정예의 체력 경계 지원과 상태 알림(세션이 받는다)
  onState?(e: EnemyBrain, s: BrainState): void;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3();
const REACT = 0.45;          // s: 처음 발견하고 행동하기까지(보이지 않는 곳에서 즉시 쏘지 않는다)
const LOST = 2.0;            // s: 시야를 잃은 뒤 마지막 위치를 찾는 시간
const STUCK = 2.5;

export class EnemyBrain {
  declare a: Actor; declare unit: UnitDef; declare def: EnemyRoleDef; declare world: EnemyWorld; declare segment: string;
  declare state: BrainState; declare t: number;
  declare post: THREE.Vector3; declare postYaw: number;
  declare seenT: number; declare lostT: number; declare last: THREE.Vector3; declare sees: boolean;
  declare path: number[] | null; declare pi: number; declare repath: number; declare goal: THREE.Vector3;
  declare stuckT: number; declare lastPos: THREE.Vector3;
  declare aimYaw: number; declare aimPitch: number;
  declare burst: number; declare spec: TelegraphSpec | null;
  declare cycle: number;   // 공격 회차(대장 페이즈 측면 전환)

  constructor(a: Actor, unit: UnitDef, segment: string, world: EnemyWorld) {
    this.a = a; this.unit = unit; this.def = ENEMY_ROLES[unit.role]; this.world = world; this.segment = segment;
    this.post = new THREE.Vector3(unit.at[0], unit.at[1], unit.at[2]); this.postYaw = unit.yaw ?? 0;
    this.state = 'guard'; this.t = 0;
    this.seenT = 0; this.lostT = 0; this.last = new THREE.Vector3(); this.sees = false;
    this.path = null; this.pi = 0; this.repath = 0; this.goal = new THREE.Vector3();
    this.stuckT = 0; this.lastPos = new THREE.Vector3().copy(a.pos);
    this.aimYaw = this.postYaw; this.aimPitch = 0;
    this.burst = 0; this.spec = null; this.cycle = 0;
  }

  // 체크포인트 재시작·스폰 직후
  reset(): void { this.state = 'guard'; this.t = 0; this.seenT = 0; this.lostT = 0; this.path = null; this.spec = null; this.burst = 0; this.stuckT = 0; }

  setState(s: BrainState): void { if (this.state !== s) { this.state = s; this.t = 0; this.world.onState?.(this, s); } }

  update(dt: number): void {
    const a = this.a, it = a.intent;
    it.move.set(0, 0, 0); it.fire = false; it.jump = false; it.squid = false; it.sub = false; it.special = false;
    if (!a.alive) return;
    this.t += dt;
    const p = this.world.player();
    this._perceive(p, dt);
    this._think(p, dt);
    // 조준(사람형: 목표 쪽으로 부드럽게)
    a.aimYaw = this.aimYaw; a.aimPitch = this.aimPitch;
    const d = 30, cp = Math.cos(this.aimPitch);
    a.aimPoint.set(a.pos.x + Math.sin(this.aimYaw) * cp * d, a.pos.y + 1.1 + Math.sin(this.aimPitch) * d, a.pos.z + Math.cos(this.aimYaw) * cp * d);
  }

  // ---- 지각
  _perceive(p: Actor | null, dt: number): void {
    const a = this.a;
    let vis = false;
    if (p && p.alive) {
      const dist = a.pos.distanceTo(p.pos);
      // 자기 잉크에 잠수해 멀리 있는 플레이어는 보이지 않는다(가까우면 들킨다)
      const hidden = p.anim.form === 'swim' && dist > 6;
      if (dist <= this.def.sight && !hidden && this._inLeash(p.pos, 2)) {
        _e.set(a.pos.x, a.pos.y + 1.4, a.pos.z); _w.set(p.pos.x, p.pos.y + 0.9, p.pos.z);
        vis = !!G.physics?.los(_e, _w);
      }
    }
    if (vis) { this.seenT += dt; this.lostT = 0; this.last.copy(p!.pos); }
    else { this.lostT += dt; if (this.lostT > 0.3) this.seenT = Math.max(0, this.seenT - dt); }
    this.sees = vis && this.seenT >= REACT;
  }

  _inLeash(pos: THREE.Vector3, pad = 0): boolean {
    const r = this.world.bounds(this.segment);
    const inRect = !r || (pos.x >= r[0] - pad && pos.x <= r[1] + pad && pos.z >= r[2] - pad && pos.z <= r[3] + pad);
    return inRect && pos.distanceTo(this.post) <= this.def.leash + this.def.range + pad;
  }

  // ---- 상태기(병종별 차이는 공격 정의로)
  _think(p: Actor | null, dt: number): void {
    const a = this.a, def = this.def;
    const dist = p ? a.pos.distanceTo(p.pos) : Infinity;
    switch (this.state) {
      case 'guard':
        this._face(this.postYaw, dt);
        if (a.pos.distanceTo(this.post) > 1.5) this._moveTo(this.post, dt);
        if (this.sees) this.setState('chase');
        break;
      case 'chase':
        if (!this.sees) { if (this.lostT > 0.4) this.setState('search'); break; }
        this._aimAt(p!, dt);
        if (dist <= def.range && this.t > 0.2) { this._windup(p!); break; }
        if (this._inLeash(p!.pos)) this._moveTo(p!.pos, dt);
        break;
      case 'windup':
        // 예고 동안 공격 방향은 고정(피할 수 있게), 발사 방향만 천천히 따라간다
        if (p) this._aimAt(p, dt, 0.35);
        if (this.t >= (this.spec?.duration ?? def.telegraph)) this._attack(p);
        break;
      case 'attack':
        this._attackTick(p, dt);
        if (this.t >= this.burst) this.setState('recover');
        break;
      case 'recover':
        if (this.t >= def.rest) this.setState(this.sees ? 'chase' : 'search');
        break;
      case 'search':
        if (this.sees) { this.setState('chase'); break; }
        this._moveTo(this.last, dt);
        if (this.t > LOST || a.pos.distanceTo(this.last) < 1) this.setState('return');
        break;
      case 'return':
        if (this.sees) { this.setState('chase'); break; }
        this._moveTo(this.post, dt);
        if (a.pos.distanceTo(this.post) < 1.2) this.setState('guard');
        break;
      default:
        this._special(p, dt);
    }
    this._unstick(dt);
  }

  // 예고 시작(병종별 형태). 사격·도색 병종은 경고선만(피해는 실제 탄환), 방패·감시·포격은 예고 형태가 피해 판정이다.
  _windup(p: Actor): void {
    const a = this.a, def = this.def;
    const dur = def.telegraph * this.world.telegraphMul;
    const yaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    const o = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
    const d = a.pos.distanceTo(p.pos);
    let spec: TelegraphSpec;
    switch (def.role) {
      case 'shield': spec = { shape: 'cone', origin: o, yaw, radius: Math.min(def.range + 1, d + 2), halfAngle: 0.38, duration: dur, damage: def.damage, attacker: a }; break;
      case 'watcher': spec = { shape: 'line', origin: o, yaw, length: d + 4, width: 0.9, duration: dur, damage: def.damage, attacker: a }; break;
      case 'mortar': spec = { shape: 'circle', origin: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, radius: 2.2, duration: dur, damage: def.damage, attacker: a }; break;
      default: spec = { shape: 'line', origin: o, yaw, length: Math.min(def.range + 2, d + 2), width: 0.7, duration: dur, damage: 0, attacker: a };
    }
    this.spec = spec;
    this.aimYaw = yaw;
    this.world.telegraphs.add(spec);
    this.setState('windup');
  }

  _attack(_p: Actor | null): void {
    const [lo, hi] = this.def.burst;
    this.burst = lo + Math.random() * (hi - lo);
    this.setState('attack');
  }

  // 공격 중: 사격·도색은 무기를 실제로 쏜다(탄환 피해), 방패·감시·포격은 무기 동작만(피해는 예고 판정)
  _attackTick(p: Actor | null, dt: number): void {
    const it = this.a.intent;
    if (p && (this.def.role === 'gunner' || this.def.role === 'painter')) {
      this._aimAt(p, dt, 0.6);
      if (this.def.role === 'painter') it.move.set(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw)).multiplyScalar(0.7);
    }
    it.fire = true;
  }

  // 정예·대장이 덮어쓴다
  _special(_p: Actor | null, _dt: number): void { this.setState('recover'); }

  // ---- 이동·조준 도우미
  _face(yaw: number, dt: number): void { this.aimYaw += angleDiff(this.aimYaw, yaw) * Math.min(1, dt * 4); this.aimPitch *= 0.9; }
  _aimAt(p: Actor, dt: number, rate = 1): void {
    const a = this.a;
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z, dy = p.pos.y + 0.6 - (a.pos.y + 1.1);
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const k = Math.min(1, dt * 6 * rate);
    this.aimYaw += angleDiff(this.aimYaw, yaw) * k;
    this.aimPitch += (clamp(pitch, -0.9, 0.9) - this.aimPitch) * k;
  }

  _moveTo(target: THREE.Vector3, dt: number, speed = 1): void {
    const a = this.a, nav = G.nav;
    this.repath -= dt;
    if (nav && (this.repath <= 0 || !this.path || this.goal.distanceTo(target) > 2)) {
      this.repath = 0.7; this.goal.copy(target);
      const s = nav.nearest(a.pos, 1.2), g = nav.nearest(target, 2.5);
      this.path = s >= 0 && g >= 0 ? nav.path(s, g, a.team, 3000, true) : null;
      this.pi = 1;
    }
    let tx = target.x, tz = target.z, ty = target.y;
    if (this.path && nav) {
      while (this.pi < this.path.length) {
        const n = nav.nodes[this.path[this.pi]];
        if (Math.hypot(n.x - a.pos.x, n.z - a.pos.z) < 0.7) this.pi++; else break;
      }
      if (this.pi < this.path.length) { const n = nav.nodes[this.path[this.pi]]; tx = n.x; tz = n.z; ty = n.y; }
    }
    _v.set(tx - a.pos.x, 0, tz - a.pos.z);
    const L = _v.length();
    if (L < 0.3) return;
    _v.multiplyScalar(speed / L);
    a.intent.move.copy(_v);
    if (ty > a.pos.y + 0.55 && a.grounded) a.intent.jump = true;   // 단을 오른다
    if (this.state !== 'windup' && this.state !== 'attack' && !this.sees) this._face(Math.atan2(_v.x, _v.z), dt);
  }

  // 길을 잃어 제자리이면 자기 자리 근처의 안전한 이동 그래프 노드로 되돌린다(무한 재소환 없음: 같은 개체를 옮긴다)
  _unstick(dt: number): void {
    const a = this.a, moving = a.intent.move.lengthSq() > 0.01;
    if (!moving || this.state === 'attack' || this.state === 'windup') { this.stuckT = 0; this.lastPos.copy(a.pos); return; }
    if (a.pos.distanceTo(this.lastPos) > 0.6) { this.stuckT = 0; this.lastPos.copy(a.pos); return; }
    this.stuckT += dt;
    if (this.stuckT < STUCK) return;
    this.stuckT = 0;
    const nav = G.nav, id = nav ? nav.nearest(this.post, 2.5) : -1;
    if (nav && id >= 0) { const n = nav.nodes[id]; a.pos.set(n.x, n.y, n.z); a.vel.set(0, 0, 0); }
    else a.pos.copy(this.post);
    this.path = null; this.lastPos.copy(a.pos);
    this.setState('return');
  }
}
