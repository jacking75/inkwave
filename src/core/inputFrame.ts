// 공통 입력 프레임(33번 T009, 32번 3절). 키보드·마우스, 가상 키, 게임패드를 한 프레임에 한 번 공통 액션으로 바꾼다.
//
// 계약:
//   - 액션마다 held·pressed·released. 한 프레임보다 짧은 탭(down/up이 프레임 사이에 모두 일어남)도 그 프레임에
//     held=true·pressed=true로 한 번 전달하고 다음 프레임에 released가 된다. 여러 장치가 같은 액션을 눌러도 한 번이다.
//   - 이동은 장치 하나를 고른다(가장 최근에 의미 있게 움직인 장치, 중립이면 다음 장치). 장치들을 더하지 않고 길이 1로 자른다.
//     move.x = 오른쪽 +, move.y = 전진 +.
//   - 시점: 포인터 이동량은 감도로 각도 변화(lookDelta, rad), 스틱은 각속도(lookRate, rad/s). 소비자가 lookRate에 dt를
//     한 번 곱한다. 지도·조준 커서는 cursor(px)·sticks를 쓰고 같은 입력으로 카메라를 돌리지 않는다.
//   - 컨텍스트가 바뀐 프레임에 눌려 있던 액션은 뗄 때까지 막는다(메뉴 확인을 누른 채 전투로 넘어가 점프하지 않는다).
//   - 메뉴 탐색은 방향키·왼쪽 스틱을 실제 dt로 반복한다(최초 지연 뒤 일정 간격).
// 이 파일은 DOM에 의존하지 않는다. 검사: tests/client/inputFrame.test.ts.
import type { InputContext, InputSource } from './inputPolicy.js';
import type { PadView } from './gamepad.js';
import { radialStick, type StickOut } from './input.js';

export const ACTIONS = ['fire', 'squid', 'jump', 'sub', 'special', 'map', 'pause', 'cheer', 'confirm', 'cancel', 'alt', 'tabPrev', 'tabNext', 'dUp', 'dDown', 'dLeft', 'dRight'] as const;
export type ActionName = typeof ACTIONS[number];
export interface ActionState { held: boolean; pressed: boolean; released: boolean }
export type NavDir = 'up' | 'down' | 'left' | 'right';

// 한 장치의 이번 프레임 샘플. level = 지금 누르고 있다, down = 지난 프레임 이후 눌림이 있었다(이미 뗐을 수도 있다).
export interface ActionSample { level: boolean; down: boolean }
export interface DeviceSample {
  source: InputSource;
  move: { x: number; y: number };
  look: { dx: number; dy: number; kind: 'lock' | 'drag' };   // 포인터 이동량(px)
  stickL: { x: number; y: number };                         // 데드존 적용 후(패드만)
  stickR: { x: number; y: number };
  actions: Partial<Record<ActionName, ActionSample>>;
  acted: boolean;                                           // 의미 있는 조작이 있었다(입력 출처 전환용)
}
export interface LookSettings { mouse: number; touch: number; pad: number; invertY: boolean; touchInvertY: boolean }

export interface InputFrame {
  context: InputContext;
  source: InputSource;
  move: { x: number; y: number };
  moveSource: InputSource | null;
  lookDelta: { yaw: number; pitch: number };
  lookRate: { yaw: number; pitch: number };
  lookActive: boolean;
  cursor: { dx: number; dy: number };          // 포인터 이동량 합(px): 지도·조준 커서
  sticks: { lx: number; ly: number; rx: number; ry: number };
  nav: NavDir[];                               // 이번 프레임의 메뉴 방향 입력(반복 포함)
  actions: Record<ActionName, ActionState>;
}

export const LOOK = {
  mouseGain: 0.0021,      // rad/px (포인터 잠금, 1:1 원시 이동)
  dragGain: 0.0052,       // rad/px (화면에 묶인 드래그: 터치·PC 가상 시점) — config TOUCH.lookSens와 같은 값
  padYaw: 3.6, padPitch: 2.4,   // rad/s (최대 기울임, 감도 1)
  edgeBoost: 0.55,
} as const;
export const NAV_REPEAT = { first: 0.36, every: 0.13, stick: 0.6 } as const;
const MOVE_ACTIVE = 0.2, MOVE_NEUTRAL = 0.05;

// fine near the centre, fast at the edge (continuous, slope-matched at the knee) — player.js의 기존 곡선
export function lookCurve(m: number): number { return m < 0.75 ? 0.62 * Math.pow(m / 0.75, 1.6) : 0.62 + ((m - 0.75) / 0.25) * 0.38; }

const empty = (): ActionState => ({ held: false, pressed: false, released: false });
export function emptyActions(): Record<ActionName, ActionState> {
  const o = {} as Record<ActionName, ActionState>;
  for (const a of ACTIONS) o[a] = empty();
  return o;
}

export class InputFrameBuilder {
  declare prev: Record<ActionName, boolean>;
  declare blocked: Set<ActionName>;
  declare context: InputContext | null;
  declare moveSource: InputSource | null;
  declare source: InputSource;
  declare padLook: { x: number; y: number }; declare edgeT: number;
  declare navT: Record<NavDir, number>;        // 방향별 다음 반복까지 남은 시간(<0 = 떼어짐)
  declare frame: InputFrame;

  constructor(source: InputSource = 'keyboardMouse') {
    this.prev = {} as Record<ActionName, boolean>;
    for (const a of ACTIONS) this.prev[a] = false;
    this.blocked = new Set();
    this.context = null;
    this.moveSource = null;
    this.source = source;
    this.padLook = { x: 0, y: 0 }; this.edgeT = 0;
    this.navT = { up: -1, down: -1, left: -1, right: -1 };
    this.frame = this._blank('menu');
  }

  _blank(context: InputContext): InputFrame {
    return {
      context, source: this.source, move: { x: 0, y: 0 }, moveSource: null,
      lookDelta: { yaw: 0, pitch: 0 }, lookRate: { yaw: 0, pitch: 0 }, lookActive: false,
      cursor: { dx: 0, dy: 0 }, sticks: { lx: 0, ly: 0, rx: 0, ry: 0 }, nav: [], actions: emptyActions(),
    };
  }

  // 모든 유지 상태를 지운다(포커스 이탈·패드 해제·일시 정지). 지금 눌린 액션은 뗄 때까지 막는다.
  reset(): void {
    for (const a of ACTIONS) { if (this.prev[a]) this.blocked.add(a); this.prev[a] = false; }
    this.moveSource = null;
    this.padLook.x = this.padLook.y = 0; this.edgeT = 0;
    this.navT = { up: -1, down: -1, left: -1, right: -1 };
  }

  build(context: InputContext, dt: number, samples: DeviceSample[], look: LookSettings): InputFrame {
    const f = this._blank(context);
    // ---- 입력 출처
    let acted: InputSource | null = null;
    for (const s of samples) if (s.acted) { if (s.source === this.source) { acted = s.source; break; } acted ??= s.source; }
    if (acted) this.source = acted;
    f.source = this.source;

    // ---- 액션 에지
    const switched = this.context !== null && this.context !== context;
    this.context = context;
    for (const a of ACTIONS) {
      let level = false, down = false;
      for (const s of samples) { const v = s.actions[a]; if (v) { level ||= v.level; down ||= v.down; } }
      const eff = level || down;
      if (switched && eff && a !== 'map') this.blocked.add(a);
      if (this.blocked.has(a)) {
        if (!level) this.blocked.delete(a);   // 뗀 뒤 다음 누름부터 받는다
        this.prev[a] = false;
        continue;
      }
      const st = f.actions[a];
      st.held = eff; st.pressed = eff && !this.prev[a]; st.released = !eff && this.prev[a];
      this.prev[a] = eff;
    }

    // ---- 이동: 장치 하나
    const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);
    const cur = this.moveSource ? samples.find((s) => s.source === this.moveSource) : undefined;
    let pick = cur && len(cur.move) > MOVE_NEUTRAL ? cur : undefined;
    if (!pick) pick = samples.find((s) => len(s.move) > MOVE_ACTIVE) ?? samples.find((s) => len(s.move) > MOVE_NEUTRAL);
    this.moveSource = pick ? pick.source : null;
    if (pick) {
      const l = len(pick.move), k = l > 1 ? 1 / l : 1;
      f.move.x = pick.move.x * k; f.move.y = pick.move.y * k;
    }
    f.moveSource = this.moveSource;

    // ---- 시점·커서
    for (const s of samples) {
      if (!s.look.dx && !s.look.dy) continue;
      f.cursor.dx += s.look.dx; f.cursor.dy += s.look.dy;
      const drag = s.look.kind === 'drag';
      const g = drag ? LOOK.dragGain * look.touch : LOOK.mouseGain * look.mouse;
      const inv = (drag ? look.touchInvertY : look.invertY) ? -1 : 1;
      f.lookDelta.yaw -= s.look.dx * g;
      f.lookDelta.pitch -= s.look.dy * g * inv;
      f.lookActive = true;
    }
    let rx = 0, ry = 0, lx = 0, ly = 0;
    for (const s of samples) { rx += s.stickR.x; ry += s.stickR.y; lx += s.stickL.x; ly += s.stickL.y; }
    f.sticks = { lx, ly, rx, ry };
    // 스틱 각속도: 곡선 + 가장자리 가속 + 짧은 저역 통과(프레임률과 무관한 지수 감쇠)
    const mag = Math.min(1, Math.hypot(rx, ry));
    if (mag > 0.93) this.edgeT = Math.min(0.5, this.edgeT + dt); else this.edgeT = Math.max(0, this.edgeT - dt * 3);
    const boost = 1 + LOOK.edgeBoost * Math.min(1, Math.max(0, (this.edgeT - 0.16) / 0.3));
    const c = mag > 0 ? lookCurve(mag) / mag : 0;
    const k = 1 - Math.exp(-60 * dt);
    this.padLook.x += (rx * c - this.padLook.x) * k; this.padLook.y += (ry * c - this.padLook.y) * k;
    if (mag > 0) f.lookActive = true;
    f.lookRate.yaw = -this.padLook.x * LOOK.padYaw * look.pad * boost;
    f.lookRate.pitch = -this.padLook.y * LOOK.padPitch * look.pad * (look.invertY ? -1 : 1);

    // ---- 메뉴 방향(반복)
    const want: Record<NavDir, boolean> = {
      up: f.actions.dUp.held || ly < -NAV_REPEAT.stick, down: f.actions.dDown.held || ly > NAV_REPEAT.stick,
      left: f.actions.dLeft.held || lx < -NAV_REPEAT.stick, right: f.actions.dRight.held || lx > NAV_REPEAT.stick,
    };
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      if (!want[d]) { this.navT[d] = -1; continue; }
      if (this.navT[d] < 0) { f.nav.push(d); this.navT[d] = NAV_REPEAT.first; continue; }
      this.navT[d] -= dt;
      if (this.navT[d] <= 0) { f.nav.push(d); this.navT[d] += NAV_REPEAT.every; if (this.navT[d] <= 0) this.navT[d] = NAV_REPEAT.every; }
    }
    // 스틱 대각선이 두 방향을 한꺼번에 반복하지 않게 큰 축 하나만 남긴다(방향키는 그대로)
    if (f.nav.length > 1 && !(f.actions.dUp.held || f.actions.dDown.held || f.actions.dLeft.held || f.actions.dRight.held)) {
      const vert = Math.abs(ly) >= Math.abs(lx);
      f.nav = f.nav.filter((d) => (vert ? d === 'up' || d === 'down' : d === 'left' || d === 'right'));
    }
    this.frame = f;
    return f;
  }
}

// ---- 장치 샘플러 -----------------------------------------------------------------------------------------------------
const A = (level: boolean, down = false): ActionSample => ({ level, down });

// 키보드·마우스. 메뉴·텍스트 입력 컨텍스트는 DOM(menus.handleKey)이 처리하므로 여기서는 전투·지도만 만든다.
export interface KeyboardLike {
  down(code: string): boolean; wasPressed(code: string): boolean;
  mouse: { dx: number; dy: number; left: boolean; right: boolean; leftPressed: boolean; rightPressed: boolean };
  _plock: boolean;
}
export function sampleKeyboard(inp: KeyboardLike, context: InputContext): DeviceSample {
  const s: DeviceSample = { source: 'keyboardMouse', move: { x: 0, y: 0 }, look: { dx: 0, dy: 0, kind: 'lock' }, stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, actions: {}, acted: false };
  if (context !== 'gameplay' && context !== 'map') return s;
  const k = (...codes: string[]) => codes.some((c) => inp.down(c));
  const p = (...codes: string[]) => codes.some((c) => inp.wasPressed(c));
  if (inp._plock) { s.look.dx = inp.mouse.dx; s.look.dy = inp.mouse.dy; }
  const m = inp.mouse, locked = inp._plock;
  s.actions.map = A(k('Tab', 'KeyM'), p('Tab', 'KeyM'));
  if (context === 'map') {
    // 지도: 커서(포인터 이동)·확인(클릭)·닫기(지도 키를 뗌)만. 이동·사격은 전달하지 않는다
    s.actions.confirm = A(locked && m.left, locked && m.leftPressed);
    s.acted = !!(s.look.dx || s.look.dy) || Object.values(s.actions).some((a) => a?.down);
    return s;
  }
  if (k('KeyW', 'ArrowUp')) s.move.y += 1;
  if (k('KeyS', 'ArrowDown')) s.move.y -= 1;
  if (k('KeyA', 'ArrowLeft')) s.move.x -= 1;
  if (k('KeyD', 'ArrowRight')) s.move.x += 1;
  s.actions.jump = A(k('Space'), p('Space'));
  s.actions.squid = A(k('ShiftLeft', 'ShiftRight'), p('ShiftLeft', 'ShiftRight'));
  s.actions.fire = A(locked && m.left, locked && m.leftPressed);
  s.actions.sub = A((locked && m.right) || k('KeyE'), (locked && m.rightPressed) || p('KeyE'));
  s.actions.special = A(k('KeyF', 'KeyQ'), p('KeyF', 'KeyQ'));
  s.actions.cheer = A(k('KeyC'), p('KeyC'));
  s.acted = s.move.x !== 0 || s.move.y !== 0 || !!(s.look.dx || s.look.dy) || Object.values(s.actions).some((a) => a?.down);
  return s;
}

// 가상 키(input.touch). 이동 스틱·방향 패드, 시점 드래그, 버튼(짧은 탭은 latched로 보존). 지도는 토글 래치이다.
export interface VirtualLike {
  touch: { active: boolean; mx: number; mz: number; ldx: number; ldy: number; map: boolean; fire: boolean; sub: boolean; squid: boolean; jump: boolean; special: boolean; cheer: boolean };
  _latched: Partial<Record<'fire' | 'sub' | 'squid' | 'jump' | 'special' | 'cheer', boolean>>;
}
export function sampleVirtual(inp: VirtualLike, context: InputContext): DeviceSample {
  const s: DeviceSample = { source: 'virtual', move: { x: 0, y: 0 }, look: { dx: 0, dy: 0, kind: 'drag' }, stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, actions: {}, acted: false };
  const t = inp.touch;
  if (!t.active || (context !== 'gameplay' && context !== 'map')) return s;
  s.look.dx = t.ldx; s.look.dy = t.ldy;
  s.actions.map = A(t.map);
  if (context === 'map') {
    s.actions.confirm = A(t.fire, !!inp._latched.fire);   // 발사 버튼 탭 = 지도 핀 선택
  } else {
    s.move.x = t.mx; s.move.y = t.mz;
    for (const n of ['fire', 'sub', 'squid', 'jump', 'special', 'cheer'] as const) s.actions[n] = A(t[n], !!inp._latched[n]);
  }
  s.acted = Math.hypot(t.mx, t.mz) > MOVE_ACTIVE || !!(t.ldx || t.ldy) || Object.values(inp._latched).some(Boolean);
  return s;
}

// 표준 패드 뷰 → 컨텍스트별 액션. 전투: A 점프, LT 잠수, RT 발사, RB 보조, Y·RS 스페셜, Back 지도, Start 정지, 방향키 위 응원.
// 메뉴: A 확인, B 취소, X·Y 보조, LB·RB 탭, Start 정지(재개). B와 LB는 전투에 새 필수 행동을 넣지 않는다.
const _st: StickOut = { x: 0, y: 0, mag: 0 };
export function samplePad(view: PadView | null, context: InputContext): DeviceSample {
  const s: DeviceSample = { source: 'gamepad', move: { x: 0, y: 0 }, look: { dx: 0, dy: 0, kind: 'lock' }, stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, actions: {}, acted: false };
  if (!view) return s;
  const b = (i: number) => !!view.buttons[i]?.pressed;
  const e = (i: number) => view.pressedEdges.includes(i);
  const B = (...ix: number[]) => A(ix.some(b), ix.some(e));
  radialStick(view.axes[0] ?? 0, view.axes[1] ?? 0, _st, 0.14, 0.95); s.stickL = { x: _st.x, y: _st.y };
  radialStick(view.axes[2] ?? 0, view.axes[3] ?? 0, _st, 0.11, 0.96); s.stickR = { x: _st.x, y: _st.y };
  s.actions.dUp = B(12); s.actions.dDown = B(13); s.actions.dLeft = B(14); s.actions.dRight = B(15);
  s.actions.pause = B(9);
  if (context === 'gameplay') {
    s.move.x = s.stickL.x; s.move.y = -s.stickL.y;       // 표준 세로 축은 아래가 +: 전진 +로 뒤집는다
    s.actions.jump = B(0); s.actions.squid = B(6); s.actions.fire = B(7); s.actions.sub = B(5);
    s.actions.special = B(3, 11); s.actions.map = B(8); s.actions.cheer = B(12);
  } else if (context === 'map') {
    s.actions.map = B(8); s.actions.confirm = B(0); s.actions.cancel = B(1);
  } else {
    s.actions.confirm = B(0); s.actions.cancel = B(1); s.actions.alt = B(2, 3);
    s.actions.tabPrev = B(4); s.actions.tabNext = B(5);   // 메뉴·막는 대화에서는 지도를 열지 않는다
  }
  s.acted = view.active;
  return s;
}
