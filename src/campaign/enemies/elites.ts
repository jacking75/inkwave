// 정예·대장 상태기(33번 T042·T045). EnemyBrain의 이동·지각을 쓰고 공격 순서만 다르다.
//   청소반장(1-2): 1초 직선 예고 → 전진 돌진 → 넓은 휘두름 1회(예고 0.9초) → 2초 정비. 벽에 막히면 돌진을 끝내고 정비로
//     넘어간다(즉시 재공격 없음). 체력 50% 지원은 세션의 출현 묶음 support가 한 번만 부른다.
//   통행대장 바리(1-3): 우산 전개(정면 피해 감소) → 느린 전진 → 1초 부채꼴 예고 → 방패 발사 → 3초 후방 노출(약점) →
//     짧은 재정비. 체력 50% 이하에서는 노출이 끝날 때마다 좌우 우회로 쪽으로 자리를 바꿔 번갈아 압박한다.
import * as THREE from 'three';
import type { Actor } from '../../game/actor.js';
import { EnemyBrain } from './brain.js';

const _v = new THREE.Vector3();

export class RollerEliteBrain extends EnemyBrain {
  declare dashYaw: number; declare dashFrom: THREE.Vector3;

  override _windup(p: Actor): void {
    const a = this.a, def = this.def;
    const yaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    this.dashYaw = yaw; this.aimYaw = yaw;
    this.spec = { shape: 'line', origin: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, yaw, length: 9, width: 1.8, duration: def.telegraph * this.world.telegraphMul, damage: def.damage, attacker: a };
    this.world.telegraphs.add(this.spec);
    this.setState('windup');
  }
  override _attack(): void { this.dashFrom = this.a.pos.clone(); this.setState('dash'); }

  override _special(p: Actor | null, dt: number): void {
    const a = this.a, it = a.intent;
    if (this.state === 'dash') {
      // 예고한 직선을 따라 굴리며 전진(방향 고정). 9 m 또는 0.9초, 막히면 바로 끝낸다
      it.move.set(Math.sin(this.dashYaw), 0, Math.cos(this.dashYaw)).multiplyScalar(1.6);
      it.fire = true;
      this.aimYaw = this.dashYaw; this.aimPitch = -0.2;
      const went = a.pos.distanceTo(this.dashFrom);
      if (went >= 8.5 || this.t > 0.9 || (this.t > 0.35 && went < this.t * 2)) {
        // 휘두름 예고(넓은 부채꼴): 최소 0.9초
        const yaw = p ? Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z) : this.dashYaw;
        this.spec = { shape: 'cone', origin: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, yaw, radius: 3.8, halfAngle: 1.05, duration: 0.9 * this.world.telegraphMul, damage: 40, attacker: a };
        this.world.telegraphs.add(this.spec);
        this.aimYaw = yaw;
        this.setState('swing');
      }
      return;
    }
    if (this.state === 'swing') {
      if (this.t >= (this.spec?.duration ?? 0.9)) { it.fire = true; if (this.t >= (this.spec?.duration ?? 0.9) + 0.3) this.setState('recover'); }
      return;
    }
    this.setState('recover');
  }
}

export class UmbrellaCaptainBrain extends EnemyBrain {
  declare phase2: boolean; declare side: number; declare relocating: boolean;

  get shieldUp(): boolean { return this.state !== 'open' && this.state !== 'recover'; }

  override _moveTo(target: THREE.Vector3, dt: number, speed = 1): void {
    // 우산을 편 채 느리게 전진한다
    super._moveTo(target, dt, this.relocating ? speed : speed * 0.55);
  }

  override _attack(): void { this.burst = 0.5; this.setState('attack'); }
  override _attackTick(p: Actor | null, dt: number): void {
    this.a.intent.fire = true;
    if (p) this._aimAt(p, dt, 0.3);
    if (this.t + dt >= this.burst) { this.setState('open'); }
  }

  override _windup(p: Actor): void {
    const a = this.a, def = this.def;
    const yaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    this.aimYaw = yaw;
    this.spec = { shape: 'cone', origin: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, yaw, radius: Math.min(def.range, a.pos.distanceTo(p.pos) + 3), halfAngle: 0.42, duration: def.telegraph * this.world.telegraphMul, damage: def.damage, attacker: a };
    this.world.telegraphs.add(this.spec);
    this.setState('windup');
  }

  override _special(p: Actor | null, dt: number): void {
    if (this.state === 'open') {
      // 방패를 보낸 뒤 3초: 제자리, 천천히만 돈다(후방 약점이 열려 있다)
      if (p) this._aimAt(p, dt, 0.15);
      if (this.t >= 3) {
        this.cycle++;
        if (this.phase2) {
          // 좌우 우회로를 번갈아 압박: 다음 공격 전에 자리를 옮긴다
          this.side = this.side === 1 ? -1 : 1;
          this.post.set(7 * this.side, this.post.y, this.post.z);
          this.relocating = true;
        }
        this.setState('recover');
      }
      return;
    }
    this.setState('recover');
  }

  override _think(p: Actor | null, dt: number): void {
    if (this.relocating && this.state !== 'open') {
      _v.copy(this.post);
      this._moveTo(_v, dt);
      if (this.a.pos.distanceTo(_v) < 1.5 || this.t > 4) { this.relocating = false; this.setState('chase'); }
      return;
    }
    super._think(p, dt);
  }

  enterPhase2(): void { if (!this.phase2) { this.phase2 = true; this.side = this.a.pos.x >= 0 ? 1 : -1; } }
}

// 유리눈 감시자(2-2, 기획 7번 6절): 1초 직선 예고 → 발사 → 두 번째 직선 예고(그때 플레이어 위치로 새로 조준, 예고 중에는
// 추적하지 않는다) → 발사 → 2.5초 정비(예고 없이 반격하지 않는다). 시야가 막히면 조준을 시작하지 않는다(엄폐 관통 없음).
// 체력 절반 이하가 되면 정비가 끝난 뒤 unit.alt로 사격 위치를 한 번만 옮긴다(규칙은 그대로).
export class WatcherEliteBrain extends EnemyBrain {
  declare shots: number; declare moved: boolean; declare relocating: boolean; declare half: boolean;

  override _windup(p: Actor): void {
    const a = this.a, def = this.def;
    const yaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    this.aimYaw = yaw;
    this.spec = { shape: 'line', origin: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, yaw, length: a.pos.distanceTo(p.pos) + 5, width: 0.9, duration: def.telegraph * this.world.telegraphMul, damage: def.damage, attacker: a };
    this.world.telegraphs.add(this.spec);
    this.setState('windup');
  }
  override _attack(p: Actor | null): void { this.shots = (this.shots ?? 0) + 1; super._attack(p); }
  // 짝 정예가 쓰러졌을 때(6-2): 아직 옮기지 않았으면 한 번 옮긴다
  relocateOnce(): void {
    if (this.moved || !this.unit.alt) return;
    this.moved = true; this.relocating = true;
    this.post.set(this.unit.alt[0], this.unit.alt[1], this.unit.alt[2]);
    if (this.spec) this.world.telegraphs.cancelBy(this.a);
    this.setState('return');
  }
  override _moveTo(target: THREE.Vector3, dt: number, speed = 1): void { super._moveTo(target, dt, this.relocating ? speed * 1.2 : speed); }

  override _think(p: Actor | null, dt: number): void {
    const a = this.a;
    if (this.relocating) {
      this._moveTo(this.post, dt);
      if (a.pos.distanceTo(this.post) < 1.2 || this.t > 6) { this.relocating = false; this.setState('guard'); }
      return;
    }
    // 첫 발 뒤: 시야가 있으면 곧바로 두 번째 조준(새 방향), 없으면 정비로
    if (this.state === 'attack' && this.t >= this.burst && this.shots === 1) {
      if (p && p.alive && this.sees) { this._windup(p); return; }
      this.setState('recover');
    }
    if (this.state === 'recover') this.shots = 0;
    // 절반 이하에 한 번이라도 닿으면 기억한다(자연 회복으로 경계를 다시 넘어도 이동은 한 번 일어난다)
    if (a.hp / a.tune.hp <= 0.5) this.half = true;
    // 그 뒤 정비가 끝나는 순간 한 번만 위치를 옮긴다
    if (this.state === 'recover' && this.t + dt >= this.def.rest && !this.moved && this.half && this.unit.alt) {
      this.moved = true; this.relocating = true;
      this.post.set(this.unit.alt[0], this.unit.alt[1], this.unit.alt[2]);
      this.setState('return');
      return;
    }
    super._think(p, dt);
  }
}

// 적재장 포수(3-2, 기획 10번 6절): 1초 원형 예고 두 개를 시간차(0.6초)로 플레이어가 있던 자리에 떨어뜨린다(피해 시점 =
// 각 예고가 끝나는 순간). 던진 뒤 3초 장전(정비) 동안 가까이 와도 다른 공격으로 취소하지 않는다. 절반 체력의 사격병
// 지원은 세션의 출현 묶음 support가 한 번만 부른다.
export const MORTAR_ELITE = { second: 0.6, radius: 2.3 };
export class MortarEliteBrain extends EnemyBrain {
  declare dropT: number; declare dropped: number;

  override _windup(p: Actor): void {
    const a = this.a, def = this.def;
    this.aimYaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    this.spec = { shape: 'circle', origin: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, radius: MORTAR_ELITE.radius, duration: def.telegraph * this.world.telegraphMul, damage: def.damage, attacker: a };
    this.world.telegraphs.add(this.spec);
    this.dropped = 1;
    this.setState('windup');
  }
  override _think(p: Actor | null, dt: number): void {
    // 두 번째 통: 첫 예고 0.6초 뒤 그때 플레이어가 있던 자리(예고 중에는 따라가지 않는다)
    if (this.state === 'windup' && this.dropped === 1 && this.t >= MORTAR_ELITE.second) {
      this.dropped = 2;
      if (p && p.alive) this.world.telegraphs.add({ shape: 'circle', origin: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, radius: MORTAR_ELITE.radius, duration: this.def.telegraph * this.world.telegraphMul, damage: this.def.damage, attacker: this.a });
    }
    // 두 번째 통의 예고가 끝날 때까지 던지는 자세를 유지한 뒤 장전(정비)
    if (this.state === 'windup' && this.t >= MORTAR_ELITE.second + (this.spec?.duration ?? this.def.telegraph)) { this._attack(p); return; }
    if (this.state === 'windup') { if (p) this._aimAt(p, dt, 0.35); return; }
    super._think(p, dt);
  }
}

// 계류 수문장(4-2, 기획 13번 6절): 통행대장과 같은 방패 규칙(느린 전진 → 1초 부채꼴 예고 → 방패 발사 → 3초 측면·후방 노출)을
// 쓰되 좌우 번갈아 압박은 하지 않는다. 절반 체력에 한 번 닿은 뒤 노출이 끝날 때 unit.alt로 한 번만 자리를 옮긴다.
export class ShieldEliteBrain extends UmbrellaCaptainBrain {
  declare half: boolean; declare moved: boolean;
  override _think(p: Actor | null, dt: number): void {
    if (this.a.hp / this.a.tune.hp <= 0.5) this.half = true;
    super._think(p, dt);
  }
  override _special(p: Actor | null, dt: number): void {
    if (this.state === 'open') {
      if (p) this._aimAt(p, dt, 0.15);
      if (this.t >= 3) {
        this.cycle++;
        if (this.half && !this.moved && this.unit.alt) { this.moved = true; this.post.set(this.unit.alt[0], this.unit.alt[1], this.unit.alt[2]); this.relocating = true; }
        this.setState('recover');
      }
      return;
    }
    this.setState('recover');
  }
  override enterPhase2(): void { /* 수문장은 좌우 번갈아 압박이 없다(위치 변경은 _special이 한 번) */ }
  // 짝 정예가 쓰러졌을 때(6-2): 아직 옮기지 않았으면 한 번 옮긴다
  relocateOnce(): void {
    if (this.moved || !this.unit.alt) return;
    this.moved = true; this.relocating = true;
    this.post.set(this.unit.alt[0], this.unit.alt[1], this.unit.alt[2]);
    if (this.spec) this.world.telegraphs.cancelBy(this.a);
    this.setState('recover');
  }
}

// 계류장 스큐(4-3, 기획 14번 6절): 유리눈 감시자의 두 발 사선(새 방향 조준·예고 중 추적 없음)과 3초 정비. 서쪽 거점에서
// 시작해 중계점 복구(세션이 relocate) 또는 절반 체력에 동쪽 거점(unit.alt)으로 옮긴다. 30% 이하에서는 정비가 끝날 때마다
// 두 거점을 빠르게 오간다(새 거점에서 다시 예고부터, 정비 창은 그대로).
export class SkewBrain extends WatcherEliteBrain {
  declare late: boolean;
  override _moveTo(target: THREE.Vector3, dt: number, speed = 1): void { super._moveTo(target, dt, this.late && this.relocating ? speed * 1.5 : speed); }
  // 다른 거점으로 옮긴다(정비 중이면 정비가 끝난 뒤 옮긴다)
  relocate(): void {
    const alt = this.unit.alt, home = this.unit.at;
    if (!alt) return;
    // 지금 자리가 동쪽(alt)이면 서쪽(처음 자리)으로, 아니면 동쪽으로(절반 체력 이동이 먼저 일어났어도 맞다)
    const atAlt = Math.hypot(this.post.x - alt[0], this.post.z - alt[2]) < 0.5;
    const to = atAlt ? home : alt;
    this.moved = true; this.relocating = true;
    this.post.set(to[0], to[1], to[2]);
    this.setState('return');
  }
  override _think(p: Actor | null, dt: number): void {
    const f = this.a.hp / this.a.tune.hp;
    if (f <= 0.3) this.late = true;
    // 후반: 정비가 끝나는 순간마다 거점을 바꾼다
    if (this.late && !this.relocating && this.state === 'recover' && this.t + dt >= this.def.rest) { this.relocate(); return; }
    super._think(p, dt);
  }
}

// 풍차장 솔트(5-3, 기획 17번 6절): 스피너 대장. 1초 직선 예고(피해 판정) → 1.2초 연사 동작 → 2초 정비. 세션이 안전 원 조건을
// 채우면 overheat(4)로 과열 정비(open)에 들어간다: 공격하지 않고 약점 배율을 받는다. 과열 중에는 예고 없이 반격하지 않는다.
export class SaltBrain extends EnemyBrain {
  declare heat: number;
  get overheated(): boolean { return this.state === 'open'; }
  overheat(secs: number): void { this.heat = secs; if (this.spec) this.world.telegraphs.cancelBy(this.a); this.spec = null; this.setState('open'); }
  override _windup(p: Actor): void {
    const a = this.a, def = this.def;
    const yaw = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
    this.aimYaw = yaw;
    this.spec = { shape: 'line', origin: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, yaw, length: Math.min(def.range + 4, a.pos.distanceTo(p.pos) + 6), width: 1.4, duration: def.telegraph * this.world.telegraphMul, damage: def.damage, attacker: a };
    this.world.telegraphs.add(this.spec);
    this.setState('windup');
  }
  override _special(_p: Actor | null, _dt: number): void {
    if (this.state === 'open') { this.a.intent.fire = false; if (this.t >= (this.heat ?? 4)) this.setState('recover'); return; }
    this.setState('recover');
  }
}

// 잔향 지휘관(7-2, 기획 22번 6절): 적재장 포수의 통 두 개 → 3초 정비. 지원(체력 70% 사격병 2·35% 도색병 1, 각 한 번)이 살아
// 있는 동안에는 정비를 끝내지 않아 다음 강한 포격을 늦춘다(동시 위협 제한). supportsAlive는 세션이 매 프레임 넣는다.
export class CommanderBrain extends MortarEliteBrain {
  declare supportsAlive: number;
  override _think(p: Actor | null, dt: number): void {
    if (this.state === 'recover' && (this.supportsAlive ?? 0) > 0 && this.t + dt >= this.def.rest) { this.t = this.def.rest - dt - 0.01; return; }
    super._think(p, dt);
  }
  // 지원이 살아 있으면 새 포격을 시작하지 않고 정비로 돌아간다(이미 시작한 예고는 끝까지 간다)
  override _windup(p: Actor): void { if ((this.supportsAlive ?? 0) > 0) { this.setState('recover'); return; } super._windup(p); }
}
