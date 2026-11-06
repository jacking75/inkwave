// 배전탑 오르골(2-3 고정 장치 보스, 33번 T052·기획 8번 6절). 움직이지 않는 탑과 낮은 중심핵이다. 중심핵은 Actor(팀 1)로
// 두어 기존 무기 판정·피해·처치 경로를 그대로 쓰고, 사람 모델은 숨기고 탑 장식을 대신 그린다(장식은 충돌체가 없다).
//   - 단계(phase) = 끈 송신기 수(세션이 목표 상태에서 매 프레임 넣는다). 0: 직선 광선만, 1: 광선·원형 교대,
//     2: 좌·우 방출점 광선을 번갈아 + 원형, 3(모두 끔): 광선·원형, 핵은 계속 노출(장기 무적 반복 없음).
//   - 송신기를 하나 끌 때마다 핵이 8초 열린다(open). 닫혀 있는 동안 핵 피해는 0이다(세션 _enemyTaken).
//   - 공격 간격이 예고 시간보다 길어 두 공격이 겹치지 않는다(안전 통로가 남는다). 재정비 없이 즉시 반격하지 않는다.
// 수치는 첫 플레이 시작값이다(핵 체력은 data/enemies.ts).
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import type { UnitDef } from '../data/types.js';
import { EnemyBrain, type EnemyWorld } from './brain.js';

export const ORGEL = {
  expose: 8,                                   // s: 송신기 하나를 끈 뒤 핵 노출
  beam: { dur: 1.0, length: 30, width: 1.2, damage: 35 },
  circle: { dur: 1.1, radius: 2.4, damage: 30 },
  gap: [3.2, 2.9, 2.5, 3.2],                   // s: 단계별 공격 간격(예고보다 길다)
  first: 1.6,                                  // s: 등장 뒤 첫 예고까지
  reach: 40,                                   // m: 이 안의 플레이어만 노린다
};
type Attack = 'beam' | 'beamL' | 'beamR' | 'circle';
const PATTERN: Attack[][] = [['beam'], ['beam', 'circle'], ['beamL', 'circle', 'beamR', 'circle'], ['beam', 'circle']];

export class OrgelBrain extends EnemyBrain {
  declare allAt: number;   // 송신기 수(모두 끄면 계속 노출) — 세션이 넣는다(2-3: 3, 6-3: 2)
  declare phase: number; declare openUntil: number; declare next: number; declare step: number;
  declare anchor: THREE.Vector3 | null; declare group: THREE.Group; declare coreMat: THREE.MeshStandardMaterial; declare shell: THREE.Mesh;

  constructor(a: Actor, unit: UnitDef, segment: string, world: EnemyWorld) {
    super(a, unit, segment, world);
    this.allAt = 3; this.phase = 0; this.openUntil = -1; this.next = ORGEL.first; this.step = 0; this.anchor = null;
    a.character.setVisible(false);
    this._build();
  }

  get exposed(): boolean { return this.phase >= this.allAt || G.time < this.openUntil; }
  open(secs = ORGEL.expose): void { this.openUntil = Math.max(this.openUntil, G.time + secs); }

  override reset(): void { super.reset(); this.next = ORGEL.first; this.step = 0; }

  override update(dt: number): void {
    const a = this.a, it = a.intent;
    it.move.set(0, 0, 0); it.fire = false; it.jump = false; it.squid = false; it.sub = false; it.special = false;
    if (!this.anchor) { this.anchor = a.pos.clone(); this.group.position.copy(this.anchor); }
    // 고정 장치: 넉백·중력으로 밀리지 않고, 바닥 잉크의 깎기 피해(Actor 내부, 누적 상한까지)를 받지 않는다(상한을 다 쓴 것으로 둔다)
    a.pos.copy(this.anchor); a.vel.set(0, 0, 0); a.damageFromInk = 1e9;
    const open = this.exposed;
    this.coreMat.emissiveIntensity = open ? 1.4 + 0.5 * Math.sin(G.time * 9) : 0.12;
    this.shell.visible = !open;
    if (!a.alive) return;
    this.t += dt;
    this.next -= dt;
    const p = this.world.player();
    if (this.next <= 0 && p && p.alive && a.pos.distanceTo(p.pos) <= ORGEL.reach) {
      this._fire(p);
      this.next = ORGEL.gap[this.phase >= this.allAt ? 3 : Math.min(this.phase, 2)];
    }
  }

  _emitter(kind: Attack): THREE.Vector3 {
    const o = this.anchor ?? this.a.pos, side = kind === 'beamL' ? -1 : kind === 'beamR' ? 1 : 0;
    // 좌·우 방출점은 탑 옆 2.2 m(탑이 바라보는 방향의 수직)
    const y = this.postYaw;
    return new THREE.Vector3(o.x + Math.cos(y) * 2.2 * side, o.y, o.z - Math.sin(y) * 2.2 * side);
  }

  _fire(p: Actor): void {
    const list = PATTERN[this.phase >= this.allAt ? 3 : Math.min(this.phase, 2)], kind = list[this.step++ % list.length];
    const mul = this.world.telegraphMul, a = this.a;
    if (kind === 'circle') {
      this.spec = { shape: 'circle', origin: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, radius: ORGEL.circle.radius, duration: ORGEL.circle.dur * mul, damage: ORGEL.circle.damage, attacker: a };
    } else {
      const e = this._emitter(kind), yaw = Math.atan2(p.pos.x - e.x, p.pos.z - e.z);
      this.spec = { shape: 'line', origin: { x: e.x, y: e.y, z: e.z }, yaw, length: ORGEL.beam.length, width: ORGEL.beam.width, duration: ORGEL.beam.dur * mul, damage: ORGEL.beam.damage, attacker: a };
    }
    this.world.telegraphs.add(this.spec);
  }

  // 탑: 받침·기둥·관·종(방출점) + 낮은 중심핵(닫히면 철망 껍질)
  _build(): void {
    const g = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x3c4a52, roughness: 0.6, metalness: 0.5 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.4, metalness: 0.7 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(2.6, 0.35, 2.6), iron, 0, 0.18, 0);
    for (const [x, z] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) add(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 8), iron, x, 2.3, z);
    add(new THREE.BoxGeometry(2.3, 0.25, 2.3), brass, 0, 4.4, 0);
    add(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10), brass, 0, 5.3, 0);
    for (const s of [-1, 1]) { const horn = add(new THREE.ConeGeometry(0.45, 1.1, 10, 1, true), brass, s * 1.6, 4.9, 0); horn.rotation.z = s * Math.PI / 2.6; }
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xff9a2a, emissiveIntensity: 0.12, roughness: 0.3 });
    add(new THREE.SphereGeometry(0.55, 18, 12), this.coreMat, 0, 0.95, 0);
    this.shell = add(new THREE.SphereGeometry(0.72, 10, 6), new THREE.MeshStandardMaterial({ color: 0x2a3036, wireframe: true }), 0, 0.95, 0);
    g.rotation.y = this.postYaw;
    G.scene!.add(g);
    this.group = g;
  }

  dispose(): void {
    G.scene?.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}
