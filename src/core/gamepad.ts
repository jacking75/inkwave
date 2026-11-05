// 게임패드 세션·매핑(33번 T010~T012, 32번 4절). Xbox 360 배치를 기준으로 한 W3C 표준 레이아웃 뷰를 만든다.
//
// - 세션: navigator.getGamepads() 폴링으로 패드 하나를 고른다. 버튼을 눌러 처음 깨운 패드를 고르고, 끊기거나 다른 패드가
//   새로 버튼을 누를 때(현재 패드가 아무것도 누르지 않은 상태)만 바꾼다. 매 프레임 첫 패드로 갈아타거나 두 패드를 합치지 않는다.
// - 중립 확인: 선택·재연결·교체·releaseAll 뒤에는 모든 버튼·트리거가 떨어지고 스틱이 데드존 안에 들어올 때까지 뷰가 중립이다.
//   이미 누른 RT·A가 자동 발사나 메뉴 확인으로 들어가지 않는다.
// - 매핑: mapping === 'standard'면 그대로, 아니면 장치 id별 사용자 보정(PadProfile)이 있어야 한다. 원시 인덱스를 Xbox
//   배치로 추정하는 대체 경로는 없다(미매핑 패드는 view가 null이고 상태가 'unmapped'이다).
// - 트리거(6·7)는 누름 0.30 / 해제 0.20 히스테리시스로 버튼 상태를 정하고, 아날로그 값은 그대로 둔다.
// 이 파일은 DOM에 의존하지 않는다(navigator 비슷한 객체를 받는다). 검사: tests/client/gamepad.test.ts.

export const STD_BUTTONS = 17;   // 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Back · 9 Start · 10 LS · 11 RS · 12~15 방향키 · 16 Guide
export const STD_AXES = 4;       // 0·1 왼쪽 스틱, 2·3 오른쪽 스틱
export const PAD = {
  triggerPress: 0.30, triggerRelease: 0.20,   // 32번 4.2절 초기값(실제 패드로 조정)
  stickActive: 0.35,                          // 이 이상 기울여야 "실제 조작"(입력 출처 전환·가상 키 접기)
  neutral: 0.2,                               // 중립 확인 반경
} as const;

export type PadStatus = 'unavailable' | 'awaitingGesture' | 'unmapped' | 'ready';
export interface RawButton { pressed: boolean; value: number }
export interface RawPad {
  index: number; id: string; mapping: string; connected: boolean;
  buttons: ReadonlyArray<RawButton>; axes: ReadonlyArray<number>;
  vibrationActuator?: GamepadHapticActuatorLike | null;
}
export interface GamepadHapticActuatorLike { playEffect?(type: string, params: object): Promise<unknown> | unknown }
export interface NavigatorLike { getGamepads?(): ReadonlyArray<RawPad | null> }

export interface PadButtonView { pressed: boolean; value: number }
export interface PadView {
  index: number; id: string;
  buttons: PadButtonView[];      // 표준 17개
  axes: number[];                // 표준 4개(원시값, 데드존은 소비자가 적용)
  pressedEdges: number[];        // 이번 폴링에서 새로 눌린 표준 버튼
  active: boolean;               // 이번 프레임에 의미 있는 조작이 있었다
}

// 비표준 패드의 사용자 보정: 표준 버튼·축 각각의 원천이다.
export type PadSource =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; rest: number; full: number };   // 값 = (v - rest) / (full - rest)를 0..1로
export interface AxisSource { index: number; invert: boolean }
export interface PadProfile { id: string; buttons: Array<PadSource | null>; axes: Array<AxisSource | null> }
export interface ProfileStore { v: 1; profiles: Record<string, PadProfile> }
export type PadEvent = 'connected' | 'disconnected' | 'switched' | 'unmapped' | 'ready';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function sourceValue(p: RawPad, s: PadSource | null): number {
  if (!s) return 0;
  if (s.kind === 'button') return p.buttons[s.index]?.value ?? (p.buttons[s.index]?.pressed ? 1 : 0);
  const v = p.axes[s.index] ?? 0, span = s.full - s.rest;
  return Math.abs(span) < 1e-3 ? 0 : clamp01((v - s.rest) / span);
}

// 원시 패드 → 표준 버튼 값·축(뷰의 재료). 매핑할 수 없으면 null이다.
export function mapPad(p: RawPad, profile: PadProfile | null): { values: number[]; digital: boolean[]; axes: number[] } | null {
  const values = new Array<number>(STD_BUTTONS).fill(0), digital = new Array<boolean>(STD_BUTTONS).fill(false), axes = new Array<number>(STD_AXES).fill(0);
  if (p.mapping === 'standard' && !profile) {
    for (let i = 0; i < STD_BUTTONS; i++) { const b = p.buttons[i]; values[i] = b ? b.value : 0; digital[i] = !!b?.pressed; }
    for (let i = 0; i < STD_AXES; i++) axes[i] = p.axes[i] ?? 0;
    return { values, digital, axes };
  }
  if (!profile || profile.id !== p.id) return null;
  for (let i = 0; i < STD_BUTTONS; i++) {
    const s = profile.buttons[i] ?? null;
    values[i] = sourceValue(p, s);
    digital[i] = s?.kind === 'button' ? !!p.buttons[s.index]?.pressed : values[i] > 0.5;
  }
  for (let i = 0; i < STD_AXES; i++) { const a = profile.axes[i]; axes[i] = a ? (p.axes[a.index] ?? 0) * (a.invert ? -1 : 1) : 0; }
  return { values, digital, axes };
}

// 원시 패드에 "지금 누르고 있는 것"이 있는가(선택·깨우기 판정). 매핑 전이라 버튼만 본다.
function rawPressing(p: RawPad): boolean {
  for (const b of p.buttons) if (b?.pressed) return true;
  return false;
}

export class GamepadManager {
  declare status: PadStatus;
  declare selIndex: number; declare selId: string;
  declare armed: boolean;                 // 중립 확인을 마쳤다
  declare prev: boolean[];                // 이전 프레임의 표준 버튼 상태(히스테리시스 적용 후)
  declare rawPrev: Map<number, boolean>;  // 패드 index → 지난 폴링에 버튼을 누르고 있었나(새 누름 판정)
  declare profiles: ProfileStore;
  declare events: PadEvent[];
  declare raw: RawPad | null;
  declare known: Set<string>;             // 연결된 적 있는 패드(연결 안내)

  constructor(profiles: ProfileStore = { v: 1, profiles: {} }) {
    this.status = 'awaitingGesture';
    this.selIndex = -1; this.selId = '';
    this.armed = false;
    this.prev = new Array<boolean>(STD_BUTTONS).fill(false);
    this.rawPrev = new Map();
    this.profiles = profiles;
    this.events = [];
    this.raw = null;
    this.known = new Set();
  }

  // 선택 패드의 이전 상태를 버리고 중립을 다시 요구한다(해제·교체·releaseAll).
  requireNeutral(): void { this.armed = false; this.prev.fill(false); }

  _drop(ev: PadEvent): void {
    this.selIndex = -1; this.selId = ''; this.raw = null;
    this.requireNeutral();
    this.events.push(ev);
  }

  _select(p: RawPad, ev: PadEvent): void {
    const had = this.selIndex >= 0;
    this.selIndex = p.index; this.selId = p.id; this.raw = p;
    this.requireNeutral();
    this.events.push(had ? 'switched' : ev);
  }

  profileFor(p: RawPad): PadProfile | null {
    const pr = this.profiles.profiles[p.id];
    return pr && pr.id === p.id ? pr : null;
  }

  // 한 프레임 폴링. 선택 패드의 표준 뷰(중립 확인 전에는 전부 0) 또는 null을 돌려준다.
  poll(nav: NavigatorLike | null): PadView | null {
    let list: ReadonlyArray<RawPad | null>;
    try {
      if (!nav || typeof nav.getGamepads !== 'function') { this.status = 'unavailable'; if (this.selIndex >= 0) this._drop('disconnected'); return null; }
      list = nav.getGamepads() ?? [];
    } catch {
      // 권한 정책(SecurityError) 등: 패드를 쓸 수 없는 상태로 처리하고 가상 키를 쓴다
      this.status = 'unavailable'; if (this.selIndex >= 0) this._drop('disconnected'); return null;
    }
    const pads: RawPad[] = [];
    for (const p of list) if (p && p.connected) pads.push(p);
    for (const p of pads) if (!this.known.has(p.id + '#' + p.index)) { this.known.add(p.id + '#' + p.index); this.events.push('connected'); }

    // 선택 패드가 사라졌거나 같은 자리에 다른 장치가 들어왔다
    let cur = this.selIndex >= 0 ? pads.find((p) => p.index === this.selIndex) ?? null : null;
    if (this.selIndex >= 0 && (!cur || cur.id !== this.selId)) {
      this.known.delete(this.selId + '#' + this.selIndex);
      this._drop('disconnected');
      cur = null;
    }
    // 새로 버튼을 누른 패드(지난 폴링에는 누르지 않았다)
    let woke: RawPad | null = null;
    for (const p of pads) {
      const now = rawPressing(p), was = this.rawPrev.get(p.index) ?? false;
      if (now && !was && !woke && p !== cur) woke = p;
      this.rawPrev.set(p.index, now);
    }
    for (const k of [...this.rawPrev.keys()]) if (!pads.some((p) => p.index === k)) this.rawPrev.delete(k);
    if (!cur && woke) cur = (this._select(woke, 'ready'), woke);
    else if (cur && woke && !rawPressing(cur)) cur = (this._select(woke, 'switched'), woke);
    this.raw = cur;

    if (!cur) { this.status = 'awaitingGesture'; return null; }
    const m = mapPad(cur, this.profileFor(cur));
    if (!m) {
      if (this.status !== 'unmapped') this.events.push('unmapped');
      this.status = 'unmapped';
      this.requireNeutral();
      return null;
    }
    this.status = 'ready';

    // 트리거 히스테리시스 → 표준 버튼 상태
    const digital = m.digital.slice();
    for (const i of [6, 7]) {
      const v = m.values[i];
      digital[i] = this.prev[i] ? v > PAD.triggerRelease : v >= PAD.triggerPress;
    }
    // 중립 확인
    if (!this.armed) {
      const anyHeld = digital.some(Boolean) || m.values[6] > PAD.triggerRelease || m.values[7] > PAD.triggerRelease;
      const stickOut = Math.hypot(m.axes[0], m.axes[1]) > PAD.neutral || Math.hypot(m.axes[2], m.axes[3]) > PAD.neutral;
      if (anyHeld || stickOut) {
        this.prev.fill(false);
        return { index: cur.index, id: cur.id, buttons: neutralButtons(), axes: [0, 0, 0, 0], pressedEdges: [], active: false };
      }
      this.armed = true;
    }
    const edges: number[] = [];
    const buttons: PadButtonView[] = new Array(STD_BUTTONS);
    let active = false;
    for (let i = 0; i < STD_BUTTONS; i++) {
      const on = digital[i];
      if (on && !this.prev[i]) edges.push(i);
      if (on) active = true;
      this.prev[i] = on;
      buttons[i] = { pressed: on, value: i === 6 || i === 7 ? m.values[i] : (on ? Math.max(m.values[i], 1) : m.values[i]) };
    }
    if (Math.hypot(m.axes[0], m.axes[1]) > PAD.stickActive || Math.hypot(m.axes[2], m.axes[3]) > PAD.stickActive) active = true;
    return { index: cur.index, id: cur.id, buttons, axes: m.axes, pressedEdges: edges, active };
  }

  takeEvents(): PadEvent[] { const e = this.events; this.events = []; return e; }
  actuator(): GamepadHapticActuatorLike | null { return this.raw?.vibrationActuator ?? null; }

  setProfile(p: PadProfile): void { this.profiles.profiles[p.id] = p; this.requireNeutral(); }
  clearProfile(id: string): void { delete this.profiles.profiles[id]; this.requireNeutral(); }
}

function neutralButtons(): PadButtonView[] {
  const b: PadButtonView[] = new Array(STD_BUTTONS);
  for (let i = 0; i < STD_BUTTONS; i++) b[i] = { pressed: false, value: 0 };
  return b;
}

// ---- 사용자 보정(T012) ---------------------------------------------------------------------------------------------
// 보정 순서: 필수(스틱 4축·A·B·RT·LT·RB·Y·Back·Start) 다음 선택(X·LB·스틱 누름·방향키). 선택 항목은 건너뛸 수 있다.
export interface BindStep { std: number; kind: 'axis' | 'button'; label: string; required: boolean }
export const BIND_STEPS: BindStep[] = [
  { std: 0, kind: 'axis', label: '왼쪽 스틱을 오른쪽으로', required: true },
  { std: 1, kind: 'axis', label: '왼쪽 스틱을 아래로', required: true },
  { std: 2, kind: 'axis', label: '오른쪽 스틱을 오른쪽으로', required: true },
  { std: 3, kind: 'axis', label: '오른쪽 스틱을 아래로', required: true },
  { std: 0, kind: 'button', label: 'A (점프·확인)', required: true },
  { std: 1, kind: 'button', label: 'B (취소)', required: true },
  { std: 7, kind: 'button', label: 'RT (발사)', required: true },
  { std: 6, kind: 'button', label: 'LT (잠수)', required: true },
  { std: 5, kind: 'button', label: 'RB (보조 무기)', required: true },
  { std: 3, kind: 'button', label: 'Y (스페셜)', required: true },
  { std: 8, kind: 'button', label: 'Back (지도)', required: true },
  { std: 9, kind: 'button', label: 'Start (일시 정지)', required: true },
  { std: 2, kind: 'button', label: 'X', required: false },
  { std: 4, kind: 'button', label: 'LB (이전 탭)', required: false },
  { std: 12, kind: 'button', label: '방향키 위', required: false },
  { std: 13, kind: 'button', label: '방향키 아래', required: false },
  { std: 14, kind: 'button', label: '방향키 왼쪽', required: false },
  { std: 15, kind: 'button', label: '방향키 오른쪽', required: false },
];

export interface RawSnapshot { buttons: number[]; axes: number[] }
export function snapshot(p: RawPad): RawSnapshot { return { buttons: p.buttons.map((b) => (b ? (b.pressed ? Math.max(b.value, 1) : b.value) : 0)), axes: p.axes.slice() }; }

// 기준 상태에서 가장 크게 바뀐 원천을 찾는다. 축 단계는 축만, 버튼 단계는 버튼 또는 축(트리거·방향 hat)을 받는다.
export function detectBinding(base: RawSnapshot, now: RawSnapshot, kind: 'axis' | 'button'): { src: PadSource | AxisSource; kind: 'axis' | 'button' } | null {
  let best: { d: number; axis: boolean; i: number } | null = null;
  for (let i = 0; i < now.axes.length; i++) {
    const d = Math.abs((now.axes[i] ?? 0) - (base.axes[i] ?? 0));
    if (d > 0.6 && (!best || d > best.d)) best = { d, axis: true, i };
  }
  if (kind === 'button') for (let i = 0; i < now.buttons.length; i++) {
    const d = (now.buttons[i] ?? 0) - (base.buttons[i] ?? 0);
    if (d > 0.5 && (!best || d + 0.5 > best.d)) best = { d: d + 0.5, axis: false, i };   // 버튼이 같은 크기의 축 흔들림보다 우선
  }
  if (!best) return null;
  if (kind === 'axis') {
    if (!best.axis) return null;
    // 안내 방향(오른쪽·아래)으로 움직였을 때 +가 되도록 반전 여부를 정한다
    return { kind: 'axis', src: { index: best.i, invert: (now.axes[best.i] ?? 0) < (base.axes[best.i] ?? 0) } };
  }
  return best.axis
    ? { kind: 'button', src: { kind: 'axis', index: best.i, rest: base.axes[best.i] ?? 0, full: now.axes[best.i] ?? 0 } }
    : { kind: 'button', src: { kind: 'button', index: best.i } };
}

// 보정 결과 검사: 필수 누락과 같은 원천을 두 표준 입력에 쓴 충돌을 알려 준다.
export function validateProfile(p: PadProfile): { missing: string[]; conflicts: string[] } {
  const missing: string[] = [], conflicts: string[] = [];
  const used = new Map<string, string>();      // 원천 키 → 처음 쓴 단계
  const stickAxes = new Map<number, string>(); // 스틱으로 쓴 축 → 단계
  for (const s of BIND_STEPS) {
    const src = s.kind === 'axis' ? p.axes[s.std] : p.buttons[s.std];
    if (!src) { if (s.required) missing.push(s.label); continue; }
    let key: string;
    if (s.kind === 'axis') { const a = src as AxisSource; key = `a${a.index}`; const k = stickAxes.get(a.index); if (k) conflicts.push(`${k} ↔ ${s.label}`); stickAxes.set(a.index, s.label); }
    else {
      const b = src as PadSource;
      if (b.kind === 'button') key = `b${b.index}`;
      else { key = `a${b.index}:${Math.sign(b.full - b.rest)}`; const k = stickAxes.get(b.index); if (k) conflicts.push(`${k} ↔ ${s.label}`); }
    }
    const prev = used.get(key);
    if (prev && s.kind === 'button') conflicts.push(`${prev} ↔ ${s.label}`);
    used.set(key, s.label);
  }
  return { missing, conflicts };
}

export const PROFILE_KEY = 'inkwave.padProfiles';
export function loadProfiles(raw: string | null): ProfileStore {
  try {
    const p = raw ? JSON.parse(raw) as Partial<ProfileStore> : null;
    if (!p || p.v !== 1 || typeof p.profiles !== 'object' || !p.profiles) return { v: 1, profiles: {} };
    const out: ProfileStore = { v: 1, profiles: {} };
    for (const [id, pr] of Object.entries(p.profiles)) {
      if (pr && pr.id === id && Array.isArray(pr.buttons) && Array.isArray(pr.axes)) out.profiles[id] = { id, buttons: pr.buttons.slice(0, STD_BUTTONS), axes: pr.axes.slice(0, STD_AXES) };
    }
    return out;
  } catch { return { v: 1, profiles: {} }; }
}
