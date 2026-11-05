// 적 공격 텔레그래프 표준(35번 R022): 선·원·부채꼴 세 형태의 바닥 예고와 예고가 끝난 순간의 피해 판정이다.
// 세 신호를 함께 쓴다: 먹색 테두리 + 경고 노랑 띠(형태), 안쪽 채움 진행률(남은 시간), 마지막 0.3초 6 Hz 점멸(지금 피하라).
// 색은 팀 팔레트와 분리된 #ffd21a + 먹색 #15121c이며 색각 설정과 무관하게 같다(채도가 높아 색 회복 패스도 남긴다).
//
// 구성: 순수 계산(telegraphFrame·inShape·minTelegraph) → TelegraphLayer(데칼 그리기, 데칼 1개 = 드로우콜 1개)
// → TelegraphDirector(공격 수명·피해 적용). 적 행동 상태기(33번 T026)·보스(T045)는 director.add()로 공격을 건다.
// 피해는 예고 종료 TELEGRAPH.perfectAfter초 뒤에 적용하고, 퍼펙트 잠수 기준은 예고 종료 시각 [-window, +0.04]이다.
import * as THREE from 'three';
import type { Actor } from '../../game/actor.js';

export type TelegraphShape = 'line' | 'circle' | 'cone';

export const TELEGRAPH = {
  minTime: { normal: 0.9, story: 1.1 },   // s: 최소 예고 시간(2번 7.3절)
  blinkLast: 0.3, blinkHz: 6,
  perfectAfter: 0.04,                     // s: 예고 종료 뒤 퍼펙트 잠수 허용
  color: '#ffd21a', edge: '#15121c',
  band: 0.16, keyline: 0.07,              // m: 노랑 띠·먹색 테두리 폭
  lift: 0.03,
  maxLive: 8,
} as const;

export interface TelegraphSpec {
  shape: TelegraphShape;
  origin: { x: number; y: number; z: number };   // 원: 중심, 선·부채꼴: 시작점
  yaw?: number;                                  // 선·부채꼴 방향(atan2(dx, dz))
  length?: number; width?: number;               // 선
  radius?: number;                               // 원·부채꼴
  halfAngle?: number;                            // 부채꼴 rad
  duration: number;                              // s(minTelegraph로 하한을 건다)
  damage: number;
  attacker: Actor | null;
}

// 난이도별 최소 예고 시간을 지킨다(공격 정의가 더 짧게 적어도 늘린다)
export function minTelegraph(duration: number, story: boolean): number {
  return Math.max(duration, story ? TELEGRAPH.minTime.story : TELEGRAPH.minTime.normal);
}

// 경과 t의 표시 상태: 채움 진행률 0..1, 점멸(마지막 0.3초에 6 Hz: 1/12초마다 꺼짐·켜짐)
export function telegraphFrame(t: number, duration: number): { fill: number; blinkOn: boolean } {
  const fill = Math.min(1, Math.max(0, t / duration));
  const into = t - (duration - TELEGRAPH.blinkLast);
  const blinkOn = into < 0 || Math.floor(into * TELEGRAPH.blinkHz * 2) % 2 === 1;
  return { fill, blinkOn };
}

type ShapeQuery = Pick<TelegraphSpec, 'shape' | 'origin' | 'yaw' | 'length' | 'width' | 'radius' | 'halfAngle'>;

// 수평 판정(높이는 보지 않는다: 예고는 바닥 위 공간 전체이다)
export function inShape(s: ShapeQuery, x: number, z: number): boolean {
  const dx = x - s.origin.x, dz = z - s.origin.z;
  if (s.shape === 'circle') return Math.hypot(dx, dz) <= (s.radius ?? 1);
  const yaw = s.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
  if (s.shape === 'line') return along >= 0 && along <= (s.length ?? 1) && Math.abs(side) <= (s.width ?? 1) / 2;
  const r = Math.hypot(dx, dz);
  if (r > (s.radius ?? 1)) return false;
  if (r < 1e-6) return true;
  return Math.acos(Math.max(-1, Math.min(1, along / r))) <= (s.halfAngle ?? 0.5);
}

// ------------------------------------------------------------------------------------------------ 그리기
// 평면 1×1을 형태의 경계 상자(uExtent, 중심 uCenter, m)로 늘려 그린다(빈 칸을 칠하지 않아 채움 비용을 줄인다).
// vP = 로컬 평면 좌표(m): x = 옆, y = 진행 방향.
const VERT = /* glsl */`
  uniform vec2 uExtent; uniform vec2 uCenter;
  varying vec2 vP;
  void main() { vP = position.xy * uExtent + uCenter; gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 0.0, 1.0); }`;
// uShape 0 선(uSize.x 길이, y 폭), 1 원(x 반지름), 2 부채꼴(x 반지름, y 반각)
const FRAG = /* glsl */`
  uniform int uShape; uniform vec4 uSize; uniform float uFill; uniform float uBlink;
  uniform vec3 uYellow; uniform vec3 uInk; uniform float uBand; uniform float uKey;
  varying vec2 vP;
  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    float d; float prog;
    if (uShape == 0) {
      d = sdBox(vP - vec2(0.0, uSize.x * 0.5), vec2(uSize.y * 0.5, uSize.x * 0.5));
      prog = vP.y / uSize.x;
    } else if (uShape == 1) {
      d = length(vP) - uSize.x;
      prog = length(vP) / uSize.x;
    } else {
      float r = length(vP), a = atan(abs(vP.x), vP.y);
      d = max(r - uSize.x, (a - uSize.y) * max(r, 0.3));
      prog = r / uSize.x;
    }
    float aa = max(fwidth(d), 0.004) * 1.2;
    // 경계 안쪽 uBand: 노랑 띠, 그 바깥·안쪽 uKey: 먹색 테두리
    float bandD = abs(d + uBand * 0.5) - uBand * 0.5;          // 띠 안 < 0
    float band = 1.0 - smoothstep(-aa, 0.0, bandD);
    float key = 1.0 - smoothstep(uKey - aa, uKey, bandD);       // 띠 + 테두리 폭
    float inside = 1.0 - smoothstep(-aa, 0.0, d);
    float filled = inside * (1.0 - smoothstep(uFill - 0.01, uFill, prog));
    float a = max(inside * 0.18, filled * 0.45);
    vec3 col = uYellow;
    if (key > 0.0) { col = mix(uInk, uYellow, band); a = max(a, key); }
    a *= mix(0.3, 1.0, uBlink);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

export interface Decal { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; live: boolean }

const _qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _qy = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class TelegraphLayer {
  declare scene: THREE.Scene; declare pool: Decal[]; declare geo: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene) { this.scene = scene; this.pool = []; this.geo = new THREE.PlaneGeometry(1, 1); }

  _take(): Decal {
    let d = this.pool.find((p) => !p.live);
    if (!d) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        uniforms: {
          uExtent: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() },
          uShape: { value: 0 }, uSize: { value: new THREE.Vector4() }, uFill: { value: 0 }, uBlink: { value: 1 },
          uYellow: { value: new THREE.Color(TELEGRAPH.color) }, uInk: { value: new THREE.Color(TELEGRAPH.edge) },
          uBand: { value: TELEGRAPH.band }, uKey: { value: TELEGRAPH.keyline },
        },
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.name = 'telegraph'; mesh.renderOrder = 3; mesh.frustumCulled = false;
      // GTAO 법선·깊이 패스와 외곽선 깊이 선행 패스(scene.overrideMaterial)에는 그리지 않는다(zoneMarks와 같은 관문):
      // 투명한 바닥 표시가 외곽선·AO를 만들지 않게 하고 그 패스의 비용을 더하지 않는다
      mesh.onBeforeRender = (_r, scene, _c, geometry) => { geometry.drawRange.count = scene.overrideMaterial ? 0 : Infinity; };
      this.scene.add(mesh);
      d = { mesh, live: false };
      this.pool.push(d);
    }
    d.live = true; d.mesh.visible = true;
    return d;
  }

  show(s: TelegraphSpec): Decal {
    const d = this._take(), m = d.mesh, u = m.material.uniforms;
    // 평면(XY)을 바닥에 눕히고(로컬 +y → 월드 -z) yaw + π만큼 돌려 로컬 +y가 진행 방향이 되게 한다
    m.quaternion.copy(_qy.setFromAxisAngle(_up, (s.yaw ?? 0) + Math.PI)).multiply(_qx);
    m.position.set(s.origin.x, s.origin.y + TELEGRAPH.lift, s.origin.z);
    const pad = TELEGRAPH.keyline + 0.05;   // 테두리가 경계 밖으로 나가는 폭 + 안티에일리어싱 여유
    if (s.shape === 'circle') {
      const R = s.radius ?? 1;
      u.uShape.value = 1; u.uSize.value.set(R, 0, 0, 0);
      u.uExtent.value.set(2 * (R + pad), 2 * (R + pad)); u.uCenter.value.set(0, 0);
    } else if (s.shape === 'line') {
      const L = s.length ?? 1, W = s.width ?? 1;
      u.uShape.value = 0; u.uSize.value.set(L, W, 0, 0);
      u.uExtent.value.set(W + 2 * pad, L + 2 * pad); u.uCenter.value.set(0, L / 2);
    } else {
      const R = s.radius ?? 1, a = s.halfAngle ?? 0.5;
      u.uShape.value = 2; u.uSize.value.set(R, a, 0, 0);
      const hw = (a >= Math.PI / 2 ? R : R * Math.sin(a)) + pad, y0 = (a > Math.PI / 2 ? R * Math.cos(a) : 0) - pad, y1 = R + pad;
      u.uExtent.value.set(2 * hw, y1 - y0); u.uCenter.value.set(0, (y0 + y1) / 2);
    }
    m.scale.set(1, 1, 1);
    u.uFill.value = 0; u.uBlink.value = 1;
    return d;
  }

  set(d: Decal, fill: number, blinkOn: boolean): void {
    const u = d.mesh.material.uniforms;
    u.uFill.value = fill; u.uBlink.value = blinkOn ? 1 : 0;
  }

  hide(d: Decal): void { d.live = false; d.mesh.visible = false; }
  liveCount(): number { let n = 0; for (const p of this.pool) if (p.live) n++; return n; }

  dispose(): void {
    for (const d of this.pool) { this.scene.remove(d.mesh); d.mesh.material.dispose(); }
    this.pool = []; this.geo.dispose();
  }
}

// ------------------------------------------------------------------------------------------------ 실행
export interface TelegraphHitSink {
  // 예고 종료 피해(퍼펙트 잠수 기준 시각 포함). CampaignCombat.telegraphHit
  telegraphHit(victim: Actor, amount: number, attacker: Actor | null, endAt: number, after: number): boolean;
}

interface Live { spec: TelegraphSpec; t: number; decal: Decal; endAt: number }

export class TelegraphDirector {
  declare layer: TelegraphLayer; declare live: Live[]; declare sink: TelegraphHitSink; declare story: boolean;
  declare clock: number; declare now: () => number;

  // now: 퍼펙트 잠수 판정과 같은 시계(G.time)
  constructor(scene: THREE.Scene, sink: TelegraphHitSink, now: () => number, story = false) {
    this.layer = new TelegraphLayer(scene); this.live = []; this.sink = sink; this.story = story; this.clock = 0; this.now = now;
  }

  // 공격 하나를 예고한다. 동시 상한을 넘으면 거절한다(무한 누적 금지).
  add(spec: TelegraphSpec): boolean {
    if (this.live.length >= TELEGRAPH.maxLive) return false;
    const s = { ...spec, duration: minTelegraph(spec.duration, this.story) };
    this.live.push({ spec: s, t: 0, decal: this.layer.show(s), endAt: this.now() + s.duration });
    return true;
  }

  // targets: 피해를 받을 수 있는 대상(캠페인 플레이어·아군)
  update(dt: number, targets: readonly Actor[]): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.t += dt;
      const f = telegraphFrame(l.t, l.spec.duration);
      this.layer.set(l.decal, f.fill, f.blinkOn);
      if (l.t < l.spec.duration + TELEGRAPH.perfectAfter) continue;
      if (l.spec.damage > 0) for (const a of targets) {
        if (a.alive && inShape(l.spec, a.pos.x, a.pos.z)) this.sink.telegraphHit(a, l.spec.damage, l.spec.attacker, l.endAt, TELEGRAPH.perfectAfter);
      }
      this.layer.hide(l.decal); this.live.splice(i, 1);
    }
  }

  clear(): void { for (const l of this.live) this.layer.hide(l.decal); this.live = []; }
  dispose(): void { this.clear(); this.layer.dispose(); }
}
