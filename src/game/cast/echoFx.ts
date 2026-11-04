// 잔향 대원의 출현·소멸 연출(35번 R015). 적을 "지워진 기록"으로 느끼게 한다.
//   출현 예고 announce(): 바닥에 먹색 다이아몬드가 1.0초 동안 네 변을 따라 그려지고, 종이 조각 12장이 모여 몸이 된다.
//     캠페인 출현 예산(33번 T026)이 실제 출현 1초 전에 부른다. 세션 전 미리보기는 부활 낙하와 함께 재생한다.
//   소멸 dissolve(): 피부·옷·머리·눈 재질의 uIwDissolve 0→1(0.45초, 화면 고정 45° 하프톤 점으로 녹음) + 종이 조각 20장.
//     잉크 폭발은 기존 splat 효과가 낸다. 소멸이 끝나면 캐릭터를 실제로 숨긴다.
// 종이 조각은 InstancedMesh 하나(최대 400장)이다. clear()는 체크포인트 재시작 때 조각·데칼·소멸을 즉시 정리한다.
import * as THREE from 'three';
import type { Character } from '../character.js';
import { hideNow } from './castCharacter.js';

export const ECHO_FX = {
  announce: 1.0, gatherScraps: 12, dissolve: 0.45, burstScraps: 20, maxScraps: 400, maxDecals: 8, decalSize: 1.6,
} as const;

interface Scrap { live: boolean; p: THREE.Vector3; v: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; t: number; dur: number; gather: boolean; s: number }
interface Decal { mesh: THREE.Mesh; u: { uProg: { value: number }; uColor: { value: THREE.Color }; uAlpha: { value: number } }; t: number; live: boolean; onDone: (() => void) | null }
interface Dissolve { c: Character; u: { value: number }; t: number }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const DISSOLVE = new WeakMap<Character, { value: number }>();

// 재질에 화면 고정 하프톤 소멸을 넣는다(컴파일 전 한 번). 기존 onBeforeCompile을 먼저 실행하고 프로그램 키를 구분한다.
function patchDissolve(m: THREE.Material, u: { value: number }): void {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uIwDissolve = u;
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform float uIwDissolve;
void main() {
  if (uIwDissolve > 0.0) {
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 6.0;
    if (length(fract(q) - 0.5) * 1.4142 > 1.0 - uIwDissolve * 1.08) discard;
  }`);
  };
  m.customProgramCacheKey = () => prevKey() + '|iwDissolve';
  m.needsUpdate = true;
}

export function prepareDissolve(c: Character): void {
  if (DISSOLVE.has(c)) return;
  const u = { value: 0 };
  for (const k of ['skin', 'cloth', 'hair', 'eye'] as const) { const m = (c.mats as Record<string, THREE.Material | undefined>)[k]; if (m) patchDissolve(m, u); }
  DISSOLVE.set(c, u);
}

const DECAL_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 다이아몬드(|x|+|y| = 0.42) 테두리를 둘레 진행률만큼 그린다. 안쪽은 먹색 옅은 채움.
const DECAL_FS = `uniform float uProg; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = abs(p.x) + abs(p.y);
  float edge = 1.0 - smoothstep(0.012, 0.03, abs(d - 0.42));
  float ang = atan(p.y, p.x) / 6.28318 + 0.5;          // 0..1 둘레 위치
  float line = edge * step(ang, uProg);
  float fill = (1.0 - smoothstep(0.38, 0.42, d)) * 0.28 * uProg;
  vec3 col = mix(vec3(0.082, 0.071, 0.11), uColor, line * 0.35);
  float a = max(line, fill) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

export class EchoFx {
  declare scene: THREE.Scene; declare inst: THREE.InstancedMesh; declare scraps: Scrap[];
  declare decals: Decal[]; declare dissolves: Dissolve[];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const geo = new THREE.PlaneGeometry(0.075, 0.055);
    const mat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.95, side: THREE.DoubleSide });
    this.inst = new THREE.InstancedMesh(geo, mat, ECHO_FX.maxScraps);
    this.inst.count = 0; this.inst.frustumCulled = false; this.inst.name = 'echo-scraps';
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.inst);
    this.scraps = [];
    for (let i = 0; i < ECHO_FX.maxScraps; i++) this.scraps.push({ live: false, p: new THREE.Vector3(), v: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), t: 0, dur: 1, gather: false, s: 1 });
    this.decals = [];
    for (let i = 0; i < ECHO_FX.maxDecals; i++) {
      const u = { uProg: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ECHO_FX.decalSize, ECHO_FX.decalSize),
        new THREE.ShaderMaterial({ uniforms: u, vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; m.name = 'echo-decal';
      scene.add(m);
      this.decals.push({ mesh: m, u, t: 0, live: false, onDone: null });
    }
    this.dissolves = [];
  }

  // 출현 예고: 바닥 다이아몬드 + 모여드는 종이 조각. onDone은 announce초 뒤에 부른다.
  announce(pos: THREE.Vector3, markColor: string, onDone: (() => void) | null = null): void {
    const d = this.decals.find((x) => !x.live) ?? this.decals.reduce((a, x) => (x.t > a.t ? x : a));
    d.live = true; d.t = 0; d.onDone = onDone;
    d.u.uColor.value.set(markColor); d.u.uProg.value = 0; d.u.uAlpha.value = 1;
    d.mesh.position.set(pos.x, pos.y + 0.03, pos.z); d.mesh.visible = true;
    for (let i = 0; i < ECHO_FX.gatherScraps; i++) {
      const a = (i / ECHO_FX.gatherScraps) * Math.PI * 2 + Math.random() * 0.4, r = 1.2 + Math.random() * 0.6;
      const s = this._take(); if (!s) break;
      s.gather = true; s.t = 0; s.dur = ECHO_FX.announce * (0.75 + Math.random() * 0.25);
      s.from.set(pos.x + Math.cos(a) * r, pos.y + 0.3 + Math.random() * 1.2, pos.z + Math.sin(a) * r);
      s.to.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y + 0.4 + Math.random() * 0.8, pos.z + (Math.random() - 0.5) * 0.3);
      s.p.copy(s.from); s.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4); s.s = 1;
    }
  }

  // 소멸: 캐릭터를 하프톤으로 녹이고 종이 조각을 흩뿌린다. 반환 true = 숨김을 맡았다(castCharacter의 숨김 훅)
  dissolve(c: Character): boolean {
    const u = DISSOLVE.get(c);
    if (!u || this.dissolves.some((x) => x.c === c)) return !!u;
    u.value = 0.001;
    this.dissolves.push({ c, u, t: 0 });
    const p = c.root.position;
    for (let i = 0; i < ECHO_FX.burstScraps; i++) {
      const s = this._take(); if (!s) break;
      s.gather = false; s.t = 0; s.dur = 0.7 + Math.random() * 0.6; s.s = 1;
      s.p.set(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.3 + Math.random() * 1.1, p.z + (Math.random() - 0.5) * 0.5);
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
      s.v.set(Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp);
      s.spin.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
    }
    return true;
  }

  update(dt: number): void {
    for (const d of this.decals) {
      if (!d.live) continue;
      d.t += dt;
      const k = d.t / ECHO_FX.announce;
      d.u.uProg.value = Math.min(1, k * 1.05);
      d.u.uAlpha.value = k < 1 ? 1 : Math.max(0, 1 - (k - 1) * 3);
      if (k >= 1 && d.onDone) { const f = d.onDone; d.onDone = null; f(); }
      if (k >= 1.35) { d.live = false; d.mesh.visible = false; }
    }
    for (let i = this.dissolves.length - 1; i >= 0; i--) {
      const x = this.dissolves[i];
      x.t += dt;
      x.u.value = Math.min(1, x.t / ECHO_FX.dissolve);
      if (x.t >= ECHO_FX.dissolve) { this._finish(x); this.dissolves.splice(i, 1); }
    }
    let n = 0;
    for (const s of this.scraps) {
      if (!s.live) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.live = false; continue; }
      if (s.gather) { const e = k * k * (3 - 2 * k); s.p.lerpVectors(s.from, s.to, e); s.s = 1 - Math.max(0, (k - 0.8) / 0.2); }
      else { s.v.y -= 6 * dt; s.v.multiplyScalar(Math.exp(-2.2 * dt)); s.p.addScaledVector(s.v, dt); s.s = 1 - Math.max(0, (k - 0.6) / 0.4); }
      s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
      _m.compose(s.p, _q.setFromEuler(s.rot), _s.setScalar(Math.max(0.001, s.s)));
      this.inst.setMatrixAt(n++, _m);
    }
    this.inst.count = n;
    if (n) this.inst.instanceMatrix.needsUpdate = true;
  }

  get liveScraps(): number { return this.inst.count; }

  // 체크포인트 재시작·세션 종료: 남은 조각·데칼을 지우고 진행 중인 소멸은 바로 끝낸다.
  clear(): void {
    for (const s of this.scraps) s.live = false;
    this.inst.count = 0;
    for (const d of this.decals) { d.live = false; d.mesh.visible = false; d.onDone = null; }
    for (const x of this.dissolves) this._finish(x);
    this.dissolves.length = 0;
  }

  dispose(): void {
    this.clear();
    this.inst.removeFromParent(); this.inst.geometry.dispose(); (this.inst.material as THREE.Material).dispose();
    for (const d of this.decals) { d.mesh.removeFromParent(); d.mesh.geometry.dispose(); (d.mesh.material as THREE.Material).dispose(); }
  }

  _finish(x: Dissolve): void { hideNow(x.c); x.u.value = 0; }   // 다음 부활에서는 온전히 보인다

  _take(): Scrap | null {
    const s = this.scraps.find((x) => !x.live);
    if (s) s.live = true;
    return s ?? null;
  }
}
