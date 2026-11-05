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
