// 살수 장치(5-2·5-3, 33번 T060·T061, 기획 16·17번). 잔향 쪽이 세워 둔 낮은 장치로, 정해진 주기마다 자기 둘레 구역을 적 잉크로
// 다시 칠한다. Actor(팀 1)로 두어 기존 무기 판정·피해·처치 경로를 그대로 쓰고(모든 무기가 닿는 낮은 높이), 사람 모델은 숨기고
// 기둥·회전 노즐 장식을 그린다(장식은 충돌체가 없다). 쓰러지면 그 구역의 재도색이 멈춘다(출현 묶음이 치운다).
// 두 장치는 phase(0~1)로 시점을 엇갈려 번갈아 칠한다. 이동·공격은 하지 않는다(피해 없음).
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import type { UnitDef } from '../data/types.js';
import { EnemyBrain, type EnemyWorld } from './brain.js';

export const SPRINKLER = { every: 3.2, radius: 3.4, splat: 1.5, ring: 7 };

export class SprinklerBrain extends EnemyBrain {
  declare anchor: THREE.Vector3 | null; declare next: number; declare group: THREE.Group; declare head: THREE.Object3D; declare sprays: number;
  declare paused: boolean;   // 5-3: 보스가 정비(과열) 중이거나 바깥에서 멈추게 할 때
  constructor(a: Actor, unit: UnitDef, segment: string, world: EnemyWorld) {
    super(a, unit, segment, world);
    this.anchor = null; this.sprays = 0; this.paused = false;
    // 두 번째 장치는 반 주기 늦게(번갈아 칠한다)
    this.next = /2$/.test(unit.id) ? SPRINKLER.every / 2 + 0.8 : 0.8;
    a.character.setVisible(false);
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x5b6670, roughness: 0.5, metalness: 0.6 });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Mesh => { const m = new THREE.Mesh(geo, steel); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 12), 0, 0.15, 0);
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), 0, 0.75, 0);
    const head = new THREE.Group(); head.position.y = 1.2;
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), steel); arm.position.x = s * 0.45; head.add(arm); }
    g.add(head);
    G.scene!.add(g);
    this.group = g; this.head = head;
  }

  override update(dt: number): void {
    const a = this.a, it = a.intent;
    it.move.set(0, 0, 0); it.fire = false; it.jump = false; it.squid = false; it.sub = false; it.special = false;
    if (!this.anchor) { this.anchor = a.pos.clone(); this.group.position.copy(this.anchor); }
    a.pos.copy(this.anchor); a.vel.set(0, 0, 0); a.damageFromInk = 1e9;   // 고정 장치: 밀리지 않고 바닥 잉크 깎기도 받지 않는다
    if (!a.alive) return;
    this.head.rotation.y += dt * (this.paused ? 0.3 : 3);
    if (this.paused) return;
    this.next -= dt;
    if (this.next <= 0) { this.next = SPRINKLER.every; this.spray(); }
  }

  // 자기 둘레 구역을 잔향 잉크로 다시 칠한다
  spray(): void {
    const c = this.anchor ?? this.a.pos, P = G.paint as { splat(p: THREE.Vector3, r: number, team: number, o?: object): void } | null;
    if (!P) return;
    this.sprays++;
    const v = new THREE.Vector3();
    for (let i = 0; i < SPRINKLER.ring; i++) {
      const ang = (i / SPRINKLER.ring) * Math.PI * 2 + this.sprays * 0.4;
      for (const k of [0.45, 0.9]) P.splat(v.set(c.x + Math.cos(ang) * SPRINKLER.radius * k, c.y + 0.3, c.z + Math.sin(ang) * SPRINKLER.radius * k), SPRINKLER.splat, this.a.team, { seed: i + this.sprays * 13 });
    }
  }

  dispose(): void {
    G.scene?.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}
