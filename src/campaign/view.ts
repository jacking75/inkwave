// 캠페인 화면 표시(33번 T025·T036, 24번 8절 화면 우선순위). 3D 장치 표식과 DOM HUD를 갖는다. 게임 규칙은 없다.
//   - 장치: 흰 이중 원(목표) / 별(선택 상자), 진행 호, 가동 가능하면 빛기둥. 완료하면 잉크색으로 채운다.
//   - HUD: 현재 필수 목표 하나 + 완료 체크 + 막힌 이유·도움말, 대장 체력바(노출 남은 시간), 목표 방향 표식,
//     적 머리 위 병종 표식, 체크포인트 알림, 실패 패널. 위험 예고·체력·잉크(기존 HUD)를 가리지 않는 자리에 둔다.
import * as THREE from 'three';
import type { DeviceDef, ObjectiveDef } from './data/types.js';
import type { DeviceState } from './missionDevices.js';
import { BLOCK_TEXT } from './missionDevices.js';

const RING_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// 반지름 1 원판 위: 바깥 원 + 안쪽 원(이중 원) + 진행 호(12시부터 시계 방향). 별 모양은 uStar로.
const RING_FS = `
  uniform float uProgress; uniform float uOn; uniform vec3 uInk; uniform float uDone; uniform float uStar; uniform float uTime;
  varying vec2 vUv;
  float ring(float r, float c, float w) { return smoothstep(w, 0.0, abs(r - c)); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.x, p.y); float t = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
    float outer = ring(r, 0.96, 0.035), inner = ring(r, 0.80, 0.025);
    float arc = step(t, uProgress) * ring(r, 0.88, 0.06);
    float star = 0.0;
    if (uStar > 0.5) { float k = cos(5.0 * a) * 0.5 + 0.5; star = smoothstep(0.02, 0.0, abs(r - mix(0.28, 0.5, k))); }
    vec3 white = vec3(1.0); vec3 col = mix(white, uInk, uDone);
    float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
    float alpha = max(max(outer, inner * (0.6 + 0.4 * uOn * pulse)), max(arc, star)) * (0.35 + 0.65 * max(uOn, uDone));
    alpha = max(alpha, uDone * 0.22 * step(r, 0.95));
    gl_FragColor = vec4(mix(col, uInk, arc), alpha);
  }`;

interface Marker { def: DeviceDef; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; beam: THREE.Mesh }

export class DeviceMarkers {
  declare root: THREE.Group; declare items: Map<string, Marker>; declare cps: Map<string, { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }>;
  constructor(scene: THREE.Scene, defs: readonly DeviceDef[], at: (d: DeviceDef) => THREE.Vector3) {
    this.root = new THREE.Group(); this.root.name = 'campaign-devices';
    this.items = new Map(); this.cps = new Map();
    const beamGeo = new THREE.CylinderGeometry(0.18, 0.32, 7, 10, 1, true);
    for (const d of defs) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uProgress: { value: 0 }, uOn: { value: 0 }, uInk: { value: new THREE.Color(1, 0.55, 0.1) }, uDone: { value: 0 }, uStar: { value: d.kind === 'crate' ? 1 : 0 }, uTime: { value: 0 } },
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      const p = at(d);
      mesh.position.set(p.x, p.y + 0.05, p.z);
      mesh.scale.setScalar(d.radius);
      mesh.renderOrder = 3;
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
      beam.position.set(p.x, p.y + 3.5, p.z);
      beam.visible = false;
      this.root.add(mesh, beam);
      this.items.set(d.id, { def: d, mesh, mat, beam });
    }
    scene.add(this.root);
  }
  // 체크포인트 표식(지도에서도 보이게, 33번 T018): 옅은 청록 원. 활성화된 것은 진하게
  addCheckpoints(list: Array<{ id: string; at: THREE.Vector3 }>): void {
    for (const c of list) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uProgress: { value: 0 }, uOn: { value: 0 }, uInk: { value: new THREE.Color(0.3, 0.85, 0.9) }, uDone: { value: 0 }, uStar: { value: 0 }, uTime: { value: 0 } },
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(c.at.x, c.at.y + 0.05, c.at.z); mesh.scale.setScalar(1.1); mesh.renderOrder = 3;
      this.root.add(mesh);
      this.cps.set(c.id, { mesh, mat });
    }
  }
  setCheckpoint(id: string | null): void { for (const [k, m] of this.cps) m.mat.uniforms.uDone.value = k === id ? 1 : 0.35; }
  // current: 지금 할 필수 목표의 장치 id
  update(states: ReadonlyMap<string, DeviceState>, current: string | null, ink: THREE.Color, time: number, active: (id: string) => boolean): void {
    for (const [id, m] of this.items) {
      const st = states.get(id);
      const u = m.mat.uniforms;
      u.uTime.value = time;
      u.uProgress.value = st?.progress ?? 0;
      u.uDone.value = st?.complete ? 1 : 0;
      (u.uInk.value as THREE.Color).copy(ink);
      const on = !st?.complete && active(id);
      u.uOn.value = on ? 1 : 0;
      m.mesh.visible = on || !!st?.complete || id === current;
      m.beam.visible = id === current && !st?.complete;
    }
  }
  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const m of this.items.values()) { m.mesh.geometry.dispose(); m.mat.dispose(); (m.beam.material as THREE.Material).dispose(); }
    (this.items.values().next().value?.beam.geometry as THREE.BufferGeometry | undefined)?.dispose();
    this.items.clear();
    for (const c of this.cps.values()) { c.mesh.geometry.dispose(); c.mat.dispose(); }
    this.cps.clear();
  }
}

// ---- DOM HUD -----------------------------------------------------------------------------------------------------
const h = (tag: string, cls: string, text = ''): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

export interface HudFrame {
  objective: ObjectiveDef | null;
  done: number; total: number;
  block: string | null;              // 막힌 이유(장치) 또는 선행 목표 안내
  hint: string | null;
  crate: 'none' | 'open' | 'got';
  boss: { name: string; hp: number; exposed: number } | null;
  target: { x: number; y: number; onScreen: boolean; dist: number } | null;   // 목표 표식(화면 좌표)
  marks: Array<{ x: number; y: number; text: string; elite: boolean }>;
  pending: number;                   // 미확정 모듈 수
}

export class CampaignHud {
  declare el: HTMLElement; declare obj: HTMLElement; declare objLabel: HTMLElement; declare objCount: HTMLElement; declare objBlock: HTMLElement;
  declare objHint: HTMLElement; declare crate: HTMLElement; declare boss: HTMLElement; declare bossName: HTMLElement; declare bossFill: HTMLElement; declare bossTag: HTMLElement;
  declare pin: HTMLElement; declare marks: HTMLElement[]; declare marksEl: HTMLElement; declare toastEl: HTMLElement; declare toastT: number;
  declare fail: HTMLElement | null; declare last: Record<string, string>;

  constructor(parent: HTMLElement) {
    this.el = h('div', 'iw-camp');
    this.obj = h('div', 'iw-camp__obj');
    this.objCount = h('span', 'iw-camp__count'); this.objLabel = h('b', 'iw-camp__label');
    this.objBlock = h('div', 'iw-camp__block'); this.objHint = h('div', 'iw-camp__hint');
    const row = h('div', 'iw-camp__row'); row.append(this.objCount, this.objLabel);
    this.crate = h('div', 'iw-camp__crate');
    this.obj.append(row, this.objBlock, this.objHint, this.crate);
    this.boss = h('div', 'iw-camp__boss'); this.bossName = h('b', ''); const bar = h('div', 'iw-camp__bar'); this.bossFill = h('i', ''); bar.append(this.bossFill); this.bossTag = h('span', 'iw-camp__exposed');
    this.boss.append(this.bossName, bar, this.bossTag);
    this.pin = h('div', 'iw-camp__pin', '◇');
    this.marksEl = h('div', 'iw-camp__marks'); this.marks = [];
    this.toastEl = h('div', 'iw-camp__toast'); this.toastT = 0;
    this.el.append(this.obj, this.boss, this.pin, this.marksEl, this.toastEl);
    parent.appendChild(this.el);
    this.fail = null; this.last = {};
  }

  _set(k: string, el: HTMLElement, v: string): void { if (this.last[k] !== v) { this.last[k] = v; el.textContent = v; } }

  update(f: HudFrame, dt: number): void {
    this._set('label', this.objLabel, f.objective ? f.objective.label : '임무 완료');
    this._set('count', this.objCount, `${f.done}/${f.total}`);
    this._set('block', this.objBlock, f.block ?? '');
    this._set('hint', this.objHint, f.hint ?? '');
    this._set('crate', this.crate, f.crate === 'open' ? '☆ 선택 상자가 있다' : f.crate === 'got' ? `★ 선택 상자 회수 · 미확정 모듈 ${f.pending}` : '');
    this.boss.classList.toggle('is-on', !!f.boss);
    if (f.boss) {
      this._set('bossName', this.bossName, f.boss.name);
      this.bossFill.style.width = `${Math.max(0, Math.min(1, f.boss.hp)) * 100}%`;
      this._set('bossTag', this.bossTag, f.boss.exposed > 0 ? `약점 노출 ${f.boss.exposed.toFixed(1)}초` : '');
    }
    const t = f.target;
    this.pin.classList.toggle('is-on', !!t);
    if (t) {
      this.pin.style.transform = `translate3d(${t.x.toFixed(0)}px,${t.y.toFixed(0)}px,0)`;
      this._set('pin', this.pin, `◇ ${Math.round(t.dist)}m`);
    }
    while (this.marks.length < f.marks.length) { const m = h('span', 'iw-camp__mark'); this.marksEl.appendChild(m); this.marks.push(m); }
    this.marks.forEach((m, i) => {
      const k = f.marks[i];
      m.style.display = k ? '' : 'none';
      if (!k) return;
      m.style.transform = `translate3d(${k.x.toFixed(0)}px,${k.y.toFixed(0)}px,0)`;
      if (m.textContent !== k.text) m.textContent = k.text;
      m.classList.toggle('is-elite', k.elite);
    });
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('is-on'); }
  }

  // 저장할 수 없는 환경: 목표 줄 아래에 계속 표시한다(토스트가 사라져도 알 수 있게, 33번 T029)
  setTemporary(on: boolean): void {
    let el = this.obj.querySelector('.iw-camp__temp') as HTMLElement | null;
    if (on && !el) { el = h('div', 'iw-camp__temp', '⚠ 임시 플레이 — 이 브라우저에서는 진행이 저장되지 않는다'); this.obj.appendChild(el); }
    if (!on) el?.remove();
  }
  toast(text: string, secs = 2.4): void { this.toastEl.textContent = text; this.toastEl.classList.add('is-on'); this.toastT = secs; }
  setVisible(on: boolean): void { this.el.classList.toggle('is-hidden', !on); }

  // 실패 패널: 공격 이름과 대응 한 줄, 재시도·장비 정비·작업장(타이머로 재촉하지 않는다)
  showFail(cause: string, advice: string, actions: Array<{ label: string; run: () => void; primary?: boolean }>): HTMLButtonElement[] {
    this.hideFail();
    const p = h('div', 'iw-camp__fail');
    p.append(h('div', 'iw-camp__failt', '쓰러졌다'), h('div', 'iw-camp__failc', cause), h('div', 'iw-camp__faila', advice));
    const nav = h('div', 'iw-camp__failn');
    const btns = actions.map((a) => { const b = document.createElement('button'); b.className = 'iw-camp__btn' + (a.primary ? ' is-primary' : ''); b.textContent = a.label; b.addEventListener('click', () => a.run()); nav.appendChild(b); return b; });
    p.append(nav);
    this.el.appendChild(p);
    this.fail = p;
    return btns;
  }
  hideFail(): void { this.fail?.remove(); this.fail = null; }

  dispose(): void { this.el.remove(); }
}

export function blockText(b: DeviceState['block']): string | null { return b && b !== 'away' ? BLOCK_TEXT[b] : null; }
