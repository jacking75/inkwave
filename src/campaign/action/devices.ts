// 레벨 액션 장치(35번 R023): 잉크 분수·잉크통·잉크 스위치. 지형을 바꾸지 않고 수직·폭발·전환의 액션을 더한다.
// 모든 장치는 "기본 이동으로 도달 가능"한 주 경로를 대신하지 않는 선택 경로에만 둔다(배치 데이터의 책임, 33번 T023).
//
// 규칙(7절 R023):
//   분수: 반지름 0.9 m 원판을 밟으면 수직 9.5 m/s(수평 속도 유지), 0.6초 재가동. 배치의 land 지점을 미리 칠해 둔다.
//   잉크통: HP 60, 파괴 시 반지름 2.4 m 아군 잉크 폭발 + 적 피해 70. 임무당 최대 6개, 재시작 시 복원.
//   스위치: 반지름 1.2 m 원판을 아군 잉크로 60% 이상 칠하면 1회 작동. 연결된 분수를 켠다(문·수위·지형 이동 없음).
// 잉크통 피해: 이 저장소의 탄은 레벨 블록만 맞히므로(동적 물체 판정 없음) 잉크통은 플레이어 사격 방향의 광선 판정,
// 근처 폭탄 폭발, 롤러·붓 접촉으로 피해를 받는다. 1회 피해량은 BARREL.hit 표이다.
//
// 순수 계산: fountainLaunch·switchCoverage·barrelHitByRay. 실행: DeviceSet(메시·이벤트·물리 질의).
import * as THREE from 'three';
import { G, on, emit } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';

export const FOUNTAIN = { radius: 0.9, launch: 9.5, rearm: 0.6, footTol: 0.6, landRadius: 1.6 } as const;
export const BARREL = {
  hp: 60, blast: 2.4, damage: 70, maxPerMission: 6, radius: 0.36, height: 0.9,
  hit: { shot: 12, charger: 45, roll: 6, bomb: 60 },
} as const;
export const SWITCH = { radius: 1.2, need: 0.6, samples: 25 } as const;

export interface FountainDef { kind: 'fountain'; id: string; at: [number, number, number]; land?: [number, number, number]; startsOff?: boolean }
export interface BarrelDef { kind: 'barrel'; id: string; at: [number, number, number] }
export interface SwitchDef { kind: 'switch'; id: string; at: [number, number, number]; enables: string[] }
export type DeviceDef = FountainDef | BarrelDef | SwitchDef;

// 분수 발사: 위로 launch, 수평은 그대로
export function fountainLaunch(vel: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: vel.x, y: FOUNTAIN.launch, z: vel.z };
}

// 스위치 덮임 비율: 표본 팀 목록(0 없음, 1.. 팀+1) 중 team+1의 비율
export function switchCoverage(samples: readonly number[], team: number): number {
  if (!samples.length) return 0;
  let n = 0;
  for (const t of samples) if (t === team + 1) n++;
  return n / samples.length;
}

// 사격 광선(원점·단위 방향·사거리)이 원통 잉크통에 닿는지(수평 원 + 높이)
export function barrelHitByRay(o: THREE.Vector3, d: THREE.Vector3, range: number, at: THREE.Vector3): boolean {
  const ox = o.x - at.x, oz = o.z - at.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return false;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - BARREL.radius * BARREL.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > range) return false;
  const y = o.y + d.y * t;
  return y >= at.y - 0.05 && y <= at.y + BARREL.height + 0.05;
}

// 잉크통 수는 임무당 6개를 넘지 않는다(배치 검증)
export function validateDevices(defs: readonly DeviceDef[]): string[] {
  const errs: string[] = [];
  const barrels = defs.filter((d) => d.kind === 'barrel').length;
  if (barrels > BARREL.maxPerMission) errs.push(`잉크통 ${barrels}개 > ${BARREL.maxPerMission}`);
  const ids = new Set<string>();
  for (const d of defs) { if (ids.has(d.id)) errs.push(`중복 id ${d.id}`); ids.add(d.id); }
  for (const d of defs) if (d.kind === 'switch') for (const e of d.enables) if (!defs.some((x) => x.id === e && x.kind === 'fountain')) errs.push(`스위치 ${d.id}의 대상 ${e} 없음`);
  return errs;
}

// ------------------------------------------------------------------------------------------------ 실행
interface Fountain { def: FountainDef; mesh: THREE.Group; pos: THREE.Vector3; on: boolean; rearm: number; pulse: number }
interface Barrel { def: BarrelDef; mesh: THREE.Group; pos: THREE.Vector3; hp: number; alive: boolean }
interface Switch { def: SwitchDef; mesh: THREE.Group; pos: THREE.Vector3; done: boolean; cover: number; pollT: number; ring: THREE.Mesh }

// 체크포인트 스냅샷(33번 T028에 넣는다): 장치 상태만, 직렬화 가능
export interface DeviceSnapshot { barrels: Record<string, number>; switches: Record<string, boolean>; fountains: Record<string, boolean> }

const INK = '#15121c';
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

export class DeviceSet {
  declare scene: THREE.Scene; declare group: THREE.Group; declare team: number;
  declare fountains: Fountain[]; declare barrels: Barrel[]; declare switches: Switch[];
  declare start: DeviceSnapshot; declare unsubs: Array<() => unknown>;
  declare player: () => Actor | null; declare enemies: () => readonly Actor[];

  constructor(scene: THREE.Scene, defs: readonly DeviceDef[], team: number, player: () => Actor | null, enemies: () => readonly Actor[]) {
    const errs = validateDevices(defs);
    if (errs.length) throw new Error('[devices] ' + errs.join('; '));
    this.scene = scene; this.team = team; this.player = player; this.enemies = enemies;
    this.group = new THREE.Group(); this.group.name = 'campaign-devices';
    scene.add(this.group);
    this.fountains = []; this.barrels = []; this.switches = [];
    const color = new THREE.Color(G.teamHex?.[team] ?? '#ff8a14');
    for (const d of defs) {
      const pos = new THREE.Vector3(...d.at);
      if (d.kind === 'fountain') {
        const mesh = fountainMesh(color); mesh.position.copy(pos); this.group.add(mesh);
        this.fountains.push({ def: d, mesh, pos, on: !d.startsOff, rearm: 0, pulse: 0 });
        if (d.land) G.paint?.splat(_v.set(d.land[0], d.land[1] + 0.3, d.land[2]), FOUNTAIN.landRadius, team, { seed: 7 });
      } else if (d.kind === 'barrel') {
        const mesh = barrelMesh(color); mesh.position.copy(pos); this.group.add(mesh);
        this.barrels.push({ def: d, mesh, pos, hp: BARREL.hp, alive: true });
      } else {
        const { group: mesh, ring } = switchMesh(color); mesh.position.copy(pos); this.group.add(mesh);
        this.switches.push({ def: d, mesh, pos, done: false, cover: 0, pollT: 0, ring });
      }
    }
    for (const f of this.fountains) this._showFountain(f);
    this.start = this.snapshot();
    this.unsubs = [
      on('weapon:fire', (e: { actor: Actor; muzzle: THREE.Vector3; dir: THREE.Vector3; charge?: number }) => this._onFire(e)),
      on('bomb:explode', (e: { pos: THREE.Vector3; team: number; radius: number }) => {
        if (e.team !== this.team) return;
        for (const b of this.barrels) if (b.alive && b.pos.distanceTo(e.pos) <= e.radius + BARREL.radius) this._hurt(b, BARREL.hit.bomb);
      }),
      on('weapon:impact', (e: { pos: THREE.Vector3; team: number; kind: string; radius: number }) => {
        if (e.team !== this.team || e.kind !== 'roll') return;
        for (const b of this.barrels) if (b.alive && Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z) <= e.radius + BARREL.radius + 0.1) this._hurt(b, BARREL.hit.roll);
      }),
    ];
  }

  update(dt: number): void {
    const p = this.player();
    for (const f of this.fountains) {
      f.rearm = Math.max(0, f.rearm - dt);
      f.pulse = Math.max(0, f.pulse - dt * 3);
      const jet = f.mesh.userData.jet as THREE.Mesh;
      jet.scale.set(1, 0.2 + f.pulse * 4, 1); (jet.material as THREE.MeshBasicMaterial).opacity = f.on ? 0.35 + f.pulse * 0.5 : 0;
      if (!p || !p.alive || !f.on || f.rearm > 0) continue;
      const dx = p.pos.x - f.pos.x, dz = p.pos.z - f.pos.z, dy = p.pos.y - f.pos.y;
      if (Math.hypot(dx, dz) > FOUNTAIN.radius || dy < -0.2 || dy > FOUNTAIN.footTol || p.vel.y > 1) continue;
      const v = fountainLaunch(p.vel);
      p.vel.set(v.x, v.y, v.z); p.grounded = false;
      f.rearm = FOUNTAIN.rearm; f.pulse = 1;
      G.audio?.play('swim_splash', { volume: 0.9 });
      emit('fx:word', { text: '퐁!', pos: _v.copy(f.pos).setY(f.pos.y + 1.2), kind: 'cue', color: G.teamHex[this.team] });
      emit('device:fountain', { id: f.def.id, actor: p });
    }
    for (const s of this.switches) {
      if (s.done) continue;
      if ((s.pollT -= dt) > 0) continue;
      s.pollT = 0.25;
      s.cover = switchCoverage(this._sampleDisc(s.pos, SWITCH.radius), this.team);
      (s.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + s.cover * 0.65;
      s.ring.scale.setScalar(0.3 + 0.7 * Math.min(1, s.cover / SWITCH.need));
      if (s.cover >= SWITCH.need) this._activate(s);
    }
  }

  // 원판 위 격자 표본의 바닥 잉크 팀(위에서 아래로 광선)
  _sampleDisc(c: THREE.Vector3, r: number): number[] {
    const out: number[] = [], ph = G.physics, paint = G.paint;
    if (!ph || !paint) return out;
    const n = Math.round(Math.sqrt(SWITCH.samples));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -r + (2 * r * (i + 0.5)) / n, z = -r + (2 * r * (j + 0.5)) / n;
      if (x * x + z * z > r * r) continue;
      const h = ph.raycast(_o.set(c.x + x, c.y + 1.2, c.z + z), DOWN, 2.5);
      out.push(h.hit && h.face >= 0 ? paint.sample(h.face, h.u, h.v) : 0);
    }
    return out;
  }

  _activate(s: Switch): void {
    s.done = true;
    for (const id of s.def.enables) { const f = this.fountains.find((x) => x.def.id === id); if (f) { f.on = true; this._showFountain(f); } }
    G.audio?.play('ui_confirm', { volume: 0.8 });
    emit('fx:word', { text: '딸깍!', pos: _v.copy(s.pos).setY(s.pos.y + 1.0), kind: 'cue', color: G.teamHex[this.team] });
    emit('device:switch', { id: s.def.id, enables: s.def.enables.slice() });
  }

  _onFire(e: { actor: Actor; muzzle: THREE.Vector3; dir: THREE.Vector3; charge?: number }): void {
    const p = this.player();
    if (!p || e.actor !== p) return;
    const range = 6 + (p.weapon?.stats?.range ?? 0.5) * 22;   // 무기 표의 사거리 등급(0~1) → 대략 m(차저 28 m)
    _d.copy(e.dir).normalize();
    const dmg = p.weapon?.kind === 'charger' ? BARREL.hit.charger * Math.max(0.3, e.charge ?? 1) : BARREL.hit.shot;
    // 앞을 가리는 벽이 있으면 맞지 않는다
    for (const b of this.barrels) {
      if (!b.alive || !barrelHitByRay(e.muzzle, _d, range, b.pos)) continue;
      const wall = G.physics?.raycast(e.muzzle, _d, e.muzzle.distanceTo(b.pos), undefined, true);
      if (wall?.hit && wall.dist < e.muzzle.distanceTo(b.pos) - 0.6) continue;
      this._hurt(b, dmg);
      break;
    }
  }

  _hurt(b: Barrel, amount: number): void {
    if (!b.alive) return;
    b.hp -= amount;
    b.mesh.scale.setScalar(1.06);
    setTimeout(() => b.mesh.scale.setScalar(1), 60);
    if (b.hp <= 0) this._explode(b);
  }

  _explode(b: Barrel): void {
    b.alive = false; b.hp = 0; b.mesh.visible = false;
    const c = _v.copy(b.pos).setY(b.pos.y + 0.4);
    const area = G.paint?.splat(c, BARREL.blast, this.team, { seed: Math.random() });
    const p = this.player();
    if (p && area) p.addTurf(area);
    for (const e of this.enemies()) {
      if (e.alive && e.pos.distanceTo(c) <= BARREL.blast) e.damage(BARREL.damage, p, 'barrel');
    }
    G.fx?.burst?.(c.clone(), new THREE.Vector3(0, 1, 0), new THREE.Color(G.teamHex[this.team]), { count: 30, speed: 7, size: 0.16 });
    G.audio?.play('bomb_explode', { pos: c.clone(), volume: 1 });
    emit('shake', { pos: c.clone(), amount: 0.5 });
    emit('fx:word', { text: '펑!', pos: c.clone().setY(c.y + 0.8), kind: 'bomb', color: G.teamHex[this.team] });
    emit('device:barrel', { id: b.def.id, pos: c.clone() });
  }

  _showFountain(f: Fountain): void {
    const disk = f.mesh.userData.disk as THREE.Mesh;
    (disk.material as THREE.MeshStandardMaterial).emissiveIntensity = f.on ? 0.6 : 0;
    (disk.material as THREE.MeshStandardMaterial).color.set(f.on ? G.teamHex[this.team] : '#5d5a66');
  }

  snapshot(): DeviceSnapshot {
    const s: DeviceSnapshot = { barrels: {}, switches: {}, fountains: {} };
    for (const b of this.barrels) s.barrels[b.def.id] = b.alive ? b.hp : 0;
    for (const w of this.switches) s.switches[w.def.id] = w.done;
    for (const f of this.fountains) s.fountains[f.def.id] = f.on;
    return s;
  }

  // 체크포인트 재시작: 스냅샷(없으면 임무 시작 상태)으로 되돌린다
  restore(s: DeviceSnapshot = this.start): void {
    for (const b of this.barrels) { const hp = s.barrels[b.def.id] ?? BARREL.hp; b.hp = hp; b.alive = hp > 0; b.mesh.visible = b.alive; b.mesh.scale.setScalar(1); }
    for (const w of this.switches) { w.done = !!s.switches[w.def.id]; w.cover = 0; w.pollT = 0; }
    for (const f of this.fountains) { f.on = s.fountains[f.def.id] ?? !f.def.startsOff; f.rearm = 0; f.pulse = 0; this._showFountain(f); }
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); }
    });
  }
}

// ------------------------------------------------------------------------------------------------ 메시(절차 생성)
function fountainMesh(color: THREE.Color): THREE.Group {
  const g = new THREE.Group(); g.name = 'fountain';
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(FOUNTAIN.radius + 0.08, FOUNTAIN.radius + 0.14, 0.14, 28), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.7 }));
  rim.position.y = 0.07;
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(FOUNTAIN.radius, FOUNTAIN.radius, 0.05, 28), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.15 }));
  disk.position.y = 0.15;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  jet.geometry.translate(0, 0.5, 0); jet.position.y = 0.16;
  g.add(rim, disk, jet);
  g.userData.disk = disk; g.userData.jet = jet;
  return g;
}

function barrelMesh(color: THREE.Color): THREE.Group {
  const g = new THREE.Group(); g.name = 'ink-barrel';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(BARREL.radius, BARREL.radius, BARREL.height, 20), new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.55 }));
  body.position.y = BARREL.height / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(BARREL.radius + 0.012, BARREL.radius + 0.012, 0.26, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.2 }));
  band.position.y = BARREL.height * 0.55;
  for (const y of [0.1, BARREL.height - 0.1]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(BARREL.radius + 0.01, 0.022, 6, 24), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6 }));
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; g.add(hoop);
  }
  body.castShadow = true;
  g.add(body, band);
  return g;
}

function switchMesh(color: THREE.Color): { group: THREE.Group; ring: THREE.Mesh } {
  const g = new THREE.Group(); g.name = 'ink-switch';
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(SWITCH.radius + 0.1, SWITCH.radius + 0.16, 0.06, 32), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.8, transparent: true, opacity: 0.5 }));
  plate.position.y = 0.03;
  const ring = new THREE.Mesh(new THREE.RingGeometry(SWITCH.radius - 0.12, SWITCH.radius, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 10), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.7 }));
  post.position.set(SWITCH.radius + 0.25, 0.6, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
  lamp.position.set(SWITCH.radius + 0.25, 1.25, 0);
  g.add(plate, ring, post, lamp);
  return { group: g, ring };
}
