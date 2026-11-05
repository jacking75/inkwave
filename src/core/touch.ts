// 화면 가상 키(33번 T006·T013~T015, 32번 5절). 손가락(멀티터치)과 PC의 마우스·펜이 같은 버튼을 누른다.
//
// 게임과의 연결: 별도 장치가 아니라 Input의 가상 상태(input.touch.*)에 쓴다. 시점 드래그는 touch.ldx/ldy(CSS px),
// 이동은 touch.mx/mz, 버튼은 touchDown/touchUp(한 프레임보다 짧은 탭은 Input._latched가 보존한다).
//
// 지키는 규칙:
//   * 리스너는 window 한 층이며 좌표로 버튼을 판정한다. 버튼 위에서 시작해 밖으로 미끄러져도 역할이 유지된다.
//     setPointerCapture는 쓰지 않는다(메뉴 입력을 빼앗는다). pointercancel·lostpointercapture는 해제로 처리한다.
//   * pointerId별 역할: 이동·시점·발사(시점 겸용)·버튼. 같은 버튼을 두 손가락이 누르면 참조 수로 관리해 한 손가락을
//     떼도 다른 손가락의 누름이 남는다.
//   * 손가락(touch): 왼쪽 영역 어디든 닿은 곳이 이동 스틱의 원점, 떼면 정지. 오른쪽 영역 드래그는 시점이다.
//   * 마우스·펜(PC): 단일 포인터로 이동과 사격을 함께 하도록 고정 방향 패드를 쓴다. 방향을 클릭하면 그 방향을 유지하고
//     (화면에 표시) 가운데를 누르면 멈춘다. 그 뒤 오른쪽 영역 드래그로 조준, 발사 버튼을 누른 채 끌면 쏘면서 조준한다.
//     메뉴·포커스 이탈·장치 전환(releaseAll)은 방향 유지를 취소한다.
//   * 화면 가장자리(제스처 내비게이션)와 안전 영역(노치)을 피한다. 배치 계산 결과 하나를 그리기와 판정 양쪽에 쓴다.
import { TOUCH } from '../config.js';
import type { Input, TouchButton } from './input.js';

// Left share of the screen that owns the movement stick (touch). The rest is look / fire / buttons.
const MOVE_ZONE = 0.44;
// PC 방향 패드: 반지름 안쪽 이 비율 이하는 정지 버튼이다
const DPAD_STOP = 0.32;

export type VirtualName = TouchButton | 'map' | 'pause';
interface LayoutDef { name: VirtualName; label: string; x: number; y: number; r: number; cls?: string; top?: boolean }

// Button layout, anchored to the bottom-right corner (the right thumb's natural arc). x/y are distances from the
// right / bottom edge in units of the step `u`, r is the radius in the same units, so the whole cluster scales
// together. +x = left, +y = up. Tuned on device — these are the numbers to move.
const LAYOUT: LayoutDef[] = [
  { name: 'fire', label: '', x: 1.50, y: 1.50, r: 1.50, cls: 'is-fire' },
  { name: 'jump', label: '점프', x: 4.55, y: 1.20, r: 1.05 },
  { name: 'squid', label: '잠수', x: 4.55, y: 3.40, r: 1.05 },
  { name: 'sub', label: '보조', x: 1.50, y: 4.35, r: 1.05 },
  { name: 'special', label: 'SP', x: 4.20, y: 5.30, r: 1.05 },
];
// Top-right row: not thumb-arc controls, so they sit on their own line. `top: true` anchors them to the top edge.
const TOP_LAYOUT: LayoutDef[] = [
  { name: 'map', label: '지도', x: 1.10, y: 1.10, r: 0.90, cls: 'is-small', top: true },
  { name: 'cheer', label: '응원', x: 2.95, y: 1.10, r: 0.90, cls: 'is-small', top: true },
  { name: 'pause', label: 'II', x: 4.80, y: 1.10, r: 0.90, cls: 'is-small', top: true },
];

// Buttons whose press must also reach the game as a one-frame key edge (the controller reads those via wasPressed).
const EDGE_CODES: Partial<Record<VirtualName, string>> = { cheer: 'KeyC' };
// Controls that are NOT levels: `map` is a latch (nobody has a thumb free to hold it while dragging) and `pause` is a
// one-shot. Every other button is hold-to-use.
const NOT_LEVEL = new Set<VirtualName>(['map', 'pause']);

// Is the PRIMARY pointer a finger? A touchscreen laptop reports maxTouchPoints > 0 but `pointer: fine`.
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0;
}

export interface Insets { top: number; right: number; bottom: number; left: number }
export interface VirtualConfig { size: number; opacity: number; offsetX: number; offsetY: number }
export interface BtnGeom { name: VirtualName; cx: number; cy: number; r: number }
// HUD가 차지한 모서리(px): topRight = 오른쪽 위 스페셜 게이지의 왼쪽 끝까지 폭, bottomLeft = 왼쪽 아래 미니맵의 오른쪽 끝까지 폭
export interface Reserve { topRight: number; bottomLeft: number }
export interface Geometry { w: number; h: number; u: number; stickR: number; buttons: BtnGeom[]; dpad: { cx: number; cy: number; r: number }; portrait: boolean }

// 배치 계산(순수). 크기 배율·위치 이동을 적용한 뒤 모든 버튼을 안전 영역 + 가장자리 여백 안으로 되돌린다
// (설정으로 화면 밖에 둔 버튼도 늘 누를 수 있다).
export function computeLayout(w: number, h: number, ins: Insets, cfg: VirtualConfig, reserve: Reserve = { topRight: 0, bottomLeft: 0 }): Geometry {
  const base = Math.max(TOUCH.minStep, Math.min(TOUCH.maxStep, Math.min(w, h) * TOUCH.stepFrac));
  const u = Math.max(TOUCH.minStep * 0.8, base * cfg.size);
  const m = Math.max(u * TOUCH.edgeSteps, TOUCH.edgeMin);
  const L = ins.left + m, R = w - ins.right - m, T = ins.top + m, B = h - ins.bottom - m;
  const fit = (cx: number, cy: number, r: number): [number, number] => [
    Math.min(Math.max(cx, L + r), Math.max(L + r, R - r)),
    Math.min(Math.max(cy, T + r), Math.max(T + r, B - r)),
  ];
  const buttons: BtnGeom[] = [];
  for (const b of [...LAYOUT, ...TOP_LAYOUT]) {
    const r = b.r * u;
    // 아래 묶음만 위치 이동을 받는다(위 줄은 HUD와 겹치지 않게 제자리)
    // 위 줄은 스페셜 게이지 왼쪽에서 시작한다(HUD를 가리지 않는다)
    const cx0 = b.top ? R - Math.max(0, reserve.topRight + u * 0.5 - ins.right - m) - b.x * u : R - b.x * u - cfg.offsetX;
    const cy0 = b.top ? T + b.y * u : B - b.y * u - cfg.offsetY;
    const [cx, cy] = fit(cx0, cy0, r);
    buttons.push({ name: b.name, cx, cy, r });
  }
  const stickR = u * TOUCH.stickR;
  const dr = stickR * 0.55;
  // PC 방향 패드는 미니맵 오른쪽에 둔다
  const [dx, dy] = fit(Math.max(L, reserve.bottomLeft + u * 0.6) + dr + cfg.offsetX, B - dr - cfg.offsetY, dr);
  return { w, h, u, stickR, buttons, dpad: { cx: dx, cy: dy, r: dr }, portrait: h > w };
}

type Role = 'move' | 'dpad' | 'look' | 'fire' | `btn:${VirtualName}`;
export interface PointerLike { pointerId: number; pointerType: string; clientX: number; clientY: number; preventDefault?(): void }

export class TouchControls {
  declare input: Input;
  declare roles: Map<number, Role>;
  declare look: { id: number | null; x: number; y: number };
  declare move: { id: number | null; ox: number; oy: number; x: number; y: number };
  declare held: Map<VirtualName, number>;     // 버튼 → 누르고 있는 포인터 수
  declare dir: { x: number; y: number } | null; // PC 방향 유지(null = 정지)
  declare geom: Geometry;
  declare cfg: VirtualConfig;
  declare enabled: boolean;                   // 입력을 받는가(정책: 전투·지도 컨텍스트, 가로, 포커스)
  declare visible: boolean;                   // 그리는가(정책)
  declare pcPad: boolean;                     // 마우스·펜용 고정 방향 패드를 보인다(데스크톱)
  declare portrait: boolean;
  declare el: HTMLDivElement | null; declare rotateEl: HTMLDivElement | null; declare stick: HTMLDivElement | null;
  declare knob: HTMLElement | null; declare dpadEl: HTMLDivElement | null; declare dpadKnob: HTMLElement | null;
  declare btnEls: Map<VirtualName, HTMLDivElement>;
  declare _armed: boolean;
  declare _resvN: number; declare _resv: Reserve;
  declare _h: Record<string, EventListener>;
  declare insets: () => Insets;
  declare reserve: () => Reserve;

  constructor(input: Input, opts: { pcPad?: boolean; config?: VirtualConfig; insets?: () => Insets; reserve?: () => Reserve } = {}) {
    this.input = input;
    this.roles = new Map();
    this.look = { id: null, x: 0, y: 0 };
    this.move = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.held = new Map();
    this.dir = null;
    this.cfg = opts.config ?? { size: 1, opacity: 0.85, offsetX: 0, offsetY: 0 };
    this.insets = opts.insets ?? (() => ({ top: 0, right: 0, bottom: 0, left: 0 }));
    this.reserve = opts.reserve ?? (() => ({ topRight: 0, bottomLeft: 0 }));
    this.enabled = false; this.visible = false;
    this.pcPad = !!opts.pcPad;
    this.portrait = false;
    this.el = this.rotateEl = this.stick = this.dpadEl = null;
    this.knob = this.dpadKnob = null;
    this.btnEls = new Map();
    this._armed = false;
    this._resvN = 0; this._resv = { topRight: -1, bottomLeft: -1 };
    this._h = {};
    this.geom = computeLayout(1280, 720, { top: 0, right: 0, bottom: 0, left: 0 }, this.cfg);
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------
  mount(parent: HTMLElement): HTMLDivElement {
    const el = (this.el = document.createElement('div'));
    el.className = 'iw-touch';
    for (const b of [...LAYOUT, ...TOP_LAYOUT]) {
      const d = document.createElement('div');
      d.className = 'iw-touch__btn' + (b.cls ? ' ' + b.cls : '');
      if (b.label) d.textContent = b.label;
      el.appendChild(d);
      this.btnEls.set(b.name, d);
    }
    const stick = (this.stick = document.createElement('div'));
    stick.className = 'iw-touch__stick';
    stick.innerHTML = '<i></i>';
    el.appendChild(stick);
    this.knob = stick.firstChild as HTMLElement;
    // PC 방향 패드: 늘 같은 자리. 가운데 = 정지
    const dp = (this.dpadEl = document.createElement('div'));
    dp.className = 'iw-touch__dpad';
    dp.innerHTML = '<i></i><b>정지</b>';
    el.appendChild(dp);
    this.dpadKnob = dp.firstChild as HTMLElement;
    parent.appendChild(el);
    // Portrait gate: CSS shows this only when the viewport is taller than it is wide (styles/touch.css). Mounted as a
    // SIBLING of the control layer so it can paint over the menus too.
    const rotate = (this.rotateEl = document.createElement('div'));
    rotate.className = 'iw-touch-rotate';
    rotate.innerHTML = '<div><i>▭</i><b>기기를 가로로 돌려 주세요</b><span>INKWAVE는 가로 화면으로 플레이한다.</span></div>';
    parent.appendChild(rotate);
    this._bind();
    this.layout();
    return el;
  }

  dispose(): void {
    this.releaseAll();
    this.el?.remove(); this.rotateEl?.remove();
    for (const [k, fn] of Object.entries(this._h)) {
      const [type, where] = k.split('@');
      const t: EventTarget | undefined = where === 'vv' ? (globalThis.visualViewport ?? undefined) : window;
      t?.removeEventListener(type, fn, where === 'cap');
    }
    this._h = {};
  }

  _bind(): void {
    const add = (type: string, fn: EventListener, where: 'cap' | 'win' | 'vv' = 'cap') => {
      const t: EventTarget | undefined = where === 'vv' ? (globalThis.visualViewport ?? undefined) : window;
      if (!t) return;
      t.addEventListener(type, fn, where === 'cap');
      this._h[`${type}@${where}`] = fn;
    };
    add('pointerdown', (e) => this._down(e as PointerEvent));
    add('pointermove', (e) => this._move(e as PointerEvent));
    add('pointerup', (e) => this._up(e as PointerEvent));
    add('pointercancel', (e) => this._up(e as PointerEvent));
    add('lostpointercapture', (e) => this._up(e as PointerEvent));
    // 크기·주소창·회전이 바뀌면 손가락 아래에서 영역이 움직이므로 진행 중인 제스처를 취소하고 다시 배치한다
    add('resize', () => { this.releaseAll(); this.layout(); }, 'win');
    add('orientationchange', () => { this.releaseAll(); this.layout(); }, 'win');
    add('resize', () => { this.releaseAll(); this.layout(); }, 'vv');
  }

  // ---- geometry --------------------------------------------------------------------------------------------------
  setConfig(cfg: VirtualConfig): void { this.cfg = { ...cfg }; this.layout(); }

  layout(w = innerWidth, h = innerHeight): void {
    this._resv = this.reserve();
    this.geom = computeLayout(w, h, this.insets(), this.cfg, this._resv);
    this.portrait = this.geom.portrait;
    if (this.el) this.el.style.setProperty('--vc-opacity', String(this.cfg.opacity));
    for (const b of this.geom.buttons) {
      const d = this.btnEls.get(b.name);
      if (!d) continue;
      d.style.width = d.style.height = `${(b.r * 2).toFixed(1)}px`;
      d.style.transform = `translate3d(${(b.cx - b.r).toFixed(1)}px,${(b.cy - b.r).toFixed(1)}px,0)`;
    }
    if (this.dpadEl) {
      const d = this.geom.dpad;
      this.dpadEl.classList.toggle('is-pc', this.pcPad);
      this.dpadEl.style.width = this.dpadEl.style.height = `${(d.r * 2).toFixed(1)}px`;
      this.dpadEl.style.transform = `translate3d(${(d.cx - d.r).toFixed(1)}px,${(d.cy - d.r).toFixed(1)}px,0)`;
      this._showDir();
    }
    if (this.move.id === null) this._hideStick();
    // 다른 화면 요소(대사 상자 등)가 가상 키 자리를 비우도록 차지 폭을 알린다: 아래 버튼 묶음의 왼쪽 끝, PC 방향 패드의 오른쪽 끝
    if (typeof document !== 'undefined') {
      const low = this.geom.buttons.filter((b) => b.cy > this.geom.h * 0.45);
      const right = low.length ? Math.max(0, this.geom.w - Math.min(...low.map((b) => b.cx - b.r)) + 10) : 0;
      const d = this.geom.dpad, left = this.pcPad ? d.cx + d.r + 10 : 0;
      const st = document.documentElement.style;
      const top = this.geom.buttons.filter((b) => b.cy <= this.geom.h * 0.45);
      const topW = top.length ? Math.max(0, this.geom.w - Math.min(...top.map((b) => b.cx - b.r)) + 10) : 0;
      st.setProperty('--vc-right', `${right.toFixed(0)}px`); st.setProperty('--vc-left', `${left.toFixed(0)}px`); st.setProperty('--vc-top', `${topW.toFixed(0)}px`);
    }
  }

  _btnAt(x: number, y: number): BtnGeom | null {
    for (const b of this.geom.buttons) if (Math.hypot(x - b.cx, y - b.cy) <= b.r) return b;
    return null;
  }
  _inDpad(x: number, y: number): boolean { const d = this.geom.dpad; return this.pcPad && Math.hypot(x - d.cx, y - d.cy) <= d.r * 1.15; }

  // ---- pointer handling ------------------------------------------------------------------------------------------
  _down(e: PointerLike): void {
    // The controls are untouchable unless the layer is live — a hidden control that still fires is how a tap lands
    // on a button nobody can see.
    if (!this.enabled || this.portrait) return;
    const finger = e.pointerType === 'touch';
    const b = this._btnAt(e.clientX, e.clientY);
    if (b) {
      const role: Role = b.name === 'fire' ? 'fire' : `btn:${b.name}`;
      this.roles.set(e.pointerId, role);
      if (b.name === 'fire' && this.look.id === null) { this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; }
      this._press(b.name);
      e.preventDefault?.();                                      // also suppresses the synthesized mouse events
      return;
    }
    if (!finger && this._inDpad(e.clientX, e.clientY)) {
      this.roles.set(e.pointerId, 'dpad');
      this._dpadAt(e.clientX, e.clientY);
      e.preventDefault?.();
      return;
    }
    const inLeft = e.clientX < this.geom.w * MOVE_ZONE && e.clientY > this.geom.h * TOUCH.topGuard;
    if (finger && inLeft && this.move.id === null) {
      this.roles.set(e.pointerId, 'move');
      this.move.id = e.pointerId; this.move.ox = e.clientX; this.move.oy = e.clientY; this.move.x = this.move.y = 0;
      this._showStick(e.clientX, e.clientY, e.clientX, e.clientY);
      this.input.lastDevice = 'virtual';
    } else if ((finger ? !inLeft : true) && this.look.id === null) {
      this.roles.set(e.pointerId, 'look');
      this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY;
    } else { e.preventDefault?.(); return; }                    // an axis is already owned: this pointer is inert
    e.preventDefault?.();
  }

  _move(e: PointerLike): void {
    const role = this.roles.get(e.pointerId);
    if (role === undefined) return;
    if (role === 'look' || role === 'fire') {
      if (this.look.id !== e.pointerId) return;
      const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      if (dx || dy) this.input.lastDevice = 'virtual';
      this.input.touch.ldx += dx; this.input.touch.ldy += dy;
      this.look.x = e.clientX; this.look.y = e.clientY;
      return;
    }
    if (role === 'dpad') { this._dpadAt(e.clientX, e.clientY); return; }
    if (role === 'move') {
      const dx = e.clientX - this.move.ox, dy = e.clientY - this.move.oy;
      const m = Math.hypot(dx, dy), r = this.geom.stickR;
      const k = m > r ? r / m : 1;                               // clamp to the rim; no runaway past the edge
      this.move.x = (dx / r) * k; this.move.y = (dy / r) * k;
      this.input.touch.mx = this.move.x;
      this.input.touch.mz = -this.move.y;                        // screen-up is forward
      this._showStick(this.move.ox, this.move.oy, this.move.ox + dx * k, this.move.oy + dy * k);
    }
  }

  _up(e: PointerLike): void {
    const role = this.roles.get(e.pointerId);
    if (role === undefined) return;
    this.roles.delete(e.pointerId);
    if (role === 'move') {
      this.move.id = null;
      this.input.touch.mx = 0; this.input.touch.mz = 0;
      this._hideStick();
    } else if (role === 'look' || role === 'fire') {
      if (this.look.id === e.pointerId) this.look.id = null;
      if (role === 'fire') this._release('fire');                // pointercancel lands here too, and is a release
    } else if (role.startsWith('btn:')) {
      this._release(role.slice(4) as VirtualName);
    }
    // 'dpad': 방향은 떼어도 유지한다(PC 방향 유지). 가운데를 눌러야 멈춘다
    this.input.touch.fingers = this.roles.size;
  }

  // PC 방향 패드: 가운데는 정지, 바깥은 그 방향(길이 1)을 유지
  _dpadAt(x: number, y: number): void {
    const d = this.geom.dpad, dx = x - d.cx, dy = y - d.cy, m = Math.hypot(dx, dy);
    if (m <= d.r * DPAD_STOP) this.dir = null;
    else this.dir = { x: dx / m, y: dy / m };
    this._applyDir();
    this.input.lastDevice = 'virtual';
  }
  _applyDir(): void {
    if (this.move.id !== null) return;                          // 손가락 스틱이 우선
    this.input.touch.mx = this.dir ? this.dir.x : 0;
    this.input.touch.mz = this.dir ? -this.dir.y : 0;
    this._showDir();
  }
  _showDir(): void {
    if (!this.dpadEl || !this.dpadKnob) return;
    const r = this.geom.dpad.r * 0.62, d = this.dir;
    this.dpadEl.classList.toggle('is-held', !!d);
    this.dpadKnob.style.transform = `translate3d(${d ? (d.x * r).toFixed(1) : 0}px,${d ? (d.y * r).toFixed(1) : 0}px,0)`;
  }

  // Press side effects with reference counting: two pointers on one button keep it held until both lift.
  _press(name: VirtualName): void {
    this.input.touch.fingers = this.roles.size;
    this.input.lastDevice = 'virtual';
    const n = (this.held.get(name) ?? 0) + 1;
    this.held.set(name, n);
    this.btnEls.get(name)?.classList.add('is-down');
    if (n > 1) return;                                           // already held by another pointer
    switch (name) {
      case 'map': this.input.touchMapToggle(); this._syncMap(); break;
      case 'pause': this.input.onPause?.(); break;
      default: {
        this.input.touchDown(name);
        const code = EDGE_CODES[name];
        if (code) this.input.pressCode(code);
      }
    }
  }
  _release(name: VirtualName): void {
    const n = (this.held.get(name) ?? 0) - 1;
    if (n > 0) { this.held.set(name, n); return; }
    this.held.delete(name);
    this.btnEls.get(name)?.classList.remove('is-down');
    if (!NOT_LEVEL.has(name)) this.input.touchUp(name as TouchButton);   // a latch/one-shot only changes on press
  }

  // 지도 버튼은 토글이다. 열린 동안 "닫기"로 바꿔 명시적으로 닫을 수 있음을 보인다(33번 T018)
  _syncMap(): void {
    const el = this.btnEls.get('map');
    if (!el) return;
    el.classList.toggle('is-on', !!this.input.touch.map);
    el.textContent = this.input.touch.map ? '닫기' : '지도';
  }

  // Drop every gesture, every held control and the PC direction hold. Called whenever the layer is invalidated:
  // menu opened, orientation changed, match ended, app backgrounded, another device took over.
  releaseAll(): void {
    for (const d of this.btnEls.values()) d.classList.remove('is-down');
    for (const name of this.held.keys()) if (!NOT_LEVEL.has(name)) this.input.touchUp(name as TouchButton);
    this.held.clear();
    this.roles.clear();
    this.move.id = null; this.look.id = null;
    this.dir = null;
    const t = this.input.touch;
    t.mx = 0; t.mz = 0; t.fingers = 0; t.fire = false;
    this._hideStick(); this._showDir();
  }

  // Force the map latch off — a menu opening must not leave it latched, or it springs back open when the menu closes.
  clearMap(): void { this.input.touch.map = false; this._syncMap(); }

  _showStick(ox: number, oy: number, kx: number, ky: number): void {
    const st = this.stick, r = this.geom.stickR;
    if (!st || !this.knob) return;
    st.classList.add('is-on');
    st.style.width = st.style.height = `${(r * 2).toFixed(1)}px`;
    st.style.transform = `translate3d(${(ox - r).toFixed(1)}px,${(oy - r).toFixed(1)}px,0)`;
    this.knob.style.transform = `translate3d(${(kx - ox).toFixed(1)}px,${(ky - oy).toFixed(1)}px,0)`;
  }
  _hideStick(): void { this.stick?.classList.remove('is-on'); }

  // ---- per-frame -------------------------------------------------------------------------------------------------
  // main이 정책(inputPolicy)으로 계산한 표시·입력 허용을 넘긴다. armedGate = 세로 화면 안내를 띄울 화면이 아래에 있다.
  update(state: { visible: boolean; enabled: boolean; armedGate: boolean; pcPad: boolean }): void {
    if (state.armedGate !== this._armed) { this._armed = state.armedGate; this.rotateEl?.classList.toggle('is-armed', state.armedGate); }
    if (state.pcPad !== this.pcPad) { this.pcPad = state.pcPad; this.dpadEl?.classList.toggle('is-pc', state.pcPad); }
    const enabled = state.enabled && !this.portrait;
    if (state.visible !== this.visible) { this.visible = state.visible; this.el?.classList.toggle('is-shown', state.visible); }
    // HUD(스페셜 게이지·미니맵)의 자리는 경기 중에 정해진다: 살아 있는 동안 가끔 다시 재고 바뀌면 다시 배치한다
    if (enabled && ++this._resvN >= 20) {
      this._resvN = 0;
      const r = this.reserve();
      if (Math.abs(r.topRight - this._resv.topRight) > 2 || Math.abs(r.bottomLeft - this._resv.bottomLeft) > 2) this.layout();
    }
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (typeof document !== 'undefined') document.body.classList.toggle('iw-vc-live', enabled);
    if (enabled) this.layout();
    this.el?.classList.toggle('is-live', enabled);
    this.releaseAll();
    if (!enabled) this.clearMap();     // otherwise the map latch survives and springs open on the next match
  }
}

// CSS env(safe-area-inset-*)를 JS 배치에서도 쓰려고 읽는다(그리기와 판정이 같은 값을 쓴다).
export function readSafeArea(): Insets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  let probe = document.getElementById('iw-safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'iw-safe-probe';
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}
