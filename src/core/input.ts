// Keyboard + mouse (pointer lock) + gamepad + on-screen virtual controls (src/core/touch.ts).
// Produces a unified per-frame snapshot. The virtual layer writes into `mouse.*` rather than being a parallel device:
// the map UIs (src/ui/diorama.js, src/ui/hud.js) steer their cursors off `mouse.dx/dy` + `locked`, and routing virtual
// look through the same fields keeps those paths working on a phone untouched.
// Gamepad: the selected pad session lives in src/core/gamepad.ts (33번 T010~T012). `pad` here is that session's
// NORMALISED standard-layout view (or null), so every legacy reader (padButton / padAxis / padStick) sees the Xbox
// layout and never a raw, unmapped index.
// Every DOM listener is owned by this object and removed by dispose() (33번 T006): making a second Input after
// disposing the first must not deliver one key press twice.
import { G } from './ctx.js';
import { GamepadManager, type PadView } from './gamepad.js';

// keys whose browser default (focus moves, page scroll) must never fire while the game has the mouse
const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote']);

export type LastDevice = 'kbm' | 'pad' | 'virtual' | 'pointer';   // pointer = 잠금 없는 마우스·펜·손가락(메뉴 클릭)
export type TouchButton = 'fire' | 'sub' | 'squid' | 'jump' | 'special' | 'cheer';

export interface MouseState { dx: number; dy: number; left: boolean; right: boolean; leftPressed: boolean; rightPressed: boolean }
// Virtual-control device state, owned by src/core/touch.ts. `active` = the virtual layer is in charge of look / buttons
// for this session (stays put); `fingers` counts live pointers so the map cursor does not blink off between taps.
export interface TouchState {
  active: boolean; fingers: number; mx: number; mz: number; map: boolean;
  ldx: number; ldy: number;   // virtual look drag this frame (CSS px), kept apart from the pointer-lock mouse.dx/dy
  fire: boolean; sub: boolean; squid: boolean; jump: boolean; special: boolean; cheer: boolean;
}
export interface StickOut { x: number; y: number; mag: number }

type Listener = [target: EventTarget, type: string, fn: EventListener, opts?: boolean | AddEventListenerOptions];

export class Input {
  declare canvas: HTMLCanvasElement;
  declare keys: Set<string>; declare pressed: Set<string>;
  declare mouse: MouseState;
  declare _plock: boolean; declare enabled: boolean;
  declare pads: GamepadManager;
  declare pad: PadView | null; declare padPressed: Set<number>;
  declare lastDevice: LastDevice;
  declare touch: TouchState;
  declare _latched: Partial<Record<TouchButton, boolean>>;
  declare _touchPrev: { left: boolean; right: boolean };
  declare onKey: ((e: KeyboardEvent, repeat: boolean) => boolean | undefined) | null;
  declare onPause: (() => void) | null;
  declare onUnlock: (() => void) | null;
  declare onRelease: ((reason: string) => void) | null;
  declare _rumbleUntil: number; declare _rumbleMag: number;
  declare _listeners: Listener[];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();       // keys pressed this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    // Real pointer-lock state. Read `locked` (the getter) to ask "does the game own the cursor?"; read `_plock` to ask
    // "is the browser delivering pointer-lock deltas?". The two are the same thing on desktop and MUST differ on a
    // phone: Android Chrome synthesizes compatibility mouse events (mousemove/mousedown) after every tap, so a handler
    // that guards on the virtual `locked` would turn each tap into a phantom shot and a jolt of bogus camera motion.
    this._plock = false;
    this.enabled = true;
    this.pads = new GamepadManager();
    this.pad = null;
    this.padPressed = new Set();
    this.lastDevice = 'kbm';
    this.touch = { active: false, fingers: 0, mx: 0, mz: 0, ldx: 0, ldy: 0, fire: false, sub: false, squid: false, jump: false, special: false, cheer: false, map: false };
    this._latched = {};             // buttons asserted at any point since the last endFrame()
    this._touchPrev = { left: false, right: false };
    this.onKey = null;              // (e) => bool consumed  (menus)
    this.onPause = null;            // () => void, the virtual pause button (never synthesizes Escape: see touch.ts)
    this.onUnlock = null;
    this.onRelease = null;          // releaseAll(reason) observers (virtual layer, controller) — one reset path
    this._rumbleUntil = 0; this._rumbleMag = 0;
    this._listeners = [];

    this._on(window, 'keydown', (ev) => {
      const e = ev as KeyboardEvent;
      // ⌘-combos (⌘Q quit, ⌘H hide, ⌘M minimise, ⌘W close …) belong to macOS: never read them as game / menu keys
      // (the menus mapped ⌘Q to "previous tab" and swallowed it). macOS also sends no keyup for a key released while
      // ⌘ is held, so tracking them would leave the key stuck down.
      if (e.metaKey) return;
      // the menus call preventDefault themselves when needed (text fields must still receive keystrokes)
      // auto-repeat must be swallowed too: holding TAB for the map used to let the repeats move browser focus off the
      // canvas → pointer lock dropped → the round paused ("opening the map opens the menu")
      if (e.repeat) {
        if (e.code === 'Tab' || (this._plock && GAME_KEYS.has(e.code))) e.preventDefault();
        if (this.onKey) this.onKey(e, true);
        return;
      }
      this.lastDevice = 'kbm';
      if (this.onKey && this.onKey(e, false)) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (GAME_KEYS.has(e.code) && this._plock) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
    });
    this._on(window, 'keyup', (ev) => { this.keys.delete((ev as KeyboardEvent).code); });
    // A backgrounded tab must not come back with a button still held down (the release event went to the OS, not us).
    this._on(window, 'blur', () => this.releaseAll('blur'));
    this._on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll('hidden'); });
    this._on(window, 'mousemove', (ev) => {
      const e = ev as MouseEvent;
      if (!this._plock) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
      this.lastDevice = 'kbm';
    });
    this._on(window, 'mousedown', (ev) => {
      const e = ev as MouseEvent;
      if (!this._plock) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    this._on(window, 'mouseup', (ev) => {
      const e = ev as MouseEvent;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    // 잠금 없이 메뉴를 클릭한 포인터 사용자(가상 키 층은 캡처 단계에서 먼저 'virtual'로 기록한다)
    this._on(window, 'pointerdown', () => { if (!this._plock && this.lastDevice === 'kbm') this.lastDevice = 'pointer'; });
    this._on(window, 'contextmenu', (e) => e.preventDefault());
    this._on(document, 'pointerlockchange', () => {
      this._plock = document.pointerLockElement === this.canvas;
      if (!this._plock) { this.mouse.left = this.mouse.right = false; this.onUnlock?.(); }
      else this.lastDevice = 'kbm';
    });
  }

  _on(target: EventTarget, type: string, fn: EventListener, opts?: boolean | AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  // Remove every listener this object added (module re-creation must not double events).
  dispose(): void {
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
    this.releaseAll('dispose');
  }

  // Does the game own the cursor? True under real pointer lock, and true for the whole session while the virtual layer
  // is in charge — that is what lets the map cursors in diorama.js / hud.js run on a phone without knowing about touch.
  get locked(): boolean { return this._plock || this.touch.active; }

  // Drop every held level: keys, mouse, virtual buttons, the map latch, pad edges and the pad's "wait for neutral".
  // Wired to blur / visibilitychange and called by the game for menu / pause / orientation / pad loss (33번 T019) — a
  // latched fire button on a screen you cannot see is exactly the bug that fires a shot the moment you come back.
  releaseAll(reason = 'reset'): void {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.left = this.mouse.right = false;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.mouse.dx = this.mouse.dy = 0;
    const t = this.touch;
    t.fire = t.sub = t.squid = t.jump = t.special = t.cheer = false;
    t.mx = t.mz = 0; t.ldx = t.ldy = 0;
    t.map = false;
    this._touchPrev.left = this._touchPrev.right = false;
    this._latched = {};
    this.padPressed.clear();
    this.pads.requireNeutral();
    this.onRelease?.(reason);
  }

  // ---- virtual device API (called by src/core/touch.ts) ----------------------------------------------------------
  // Levels are set/cleared here so `_latched` can preserve a tap shorter than one frame. Without the latch a quick
  // tap whose down and up both land between two frames reads as `false` by the time the game looks: the map tap would
  // work (it uses the edge) while the gameplay action silently did nothing.
  // Turning the layer off (a pad took over, the layer hid) drops only the virtual levels: keys and the pad stay live.
  setTouchMode(on: boolean): void {
    if (this.touch.active === on) return;
    this.touch.active = on;
    if (!on) this.clearVirtual();
  }
  clearVirtual(): void {
    const t = this.touch;
    t.fire = t.sub = t.squid = t.jump = t.special = t.cheer = false;
    t.mx = t.mz = 0; t.ldx = t.ldy = 0; t.map = false; t.fingers = 0;
    this._touchPrev.left = this._touchPrev.right = false;
    this._latched = {};
  }
  touchDown(name: TouchButton): void { this.touch[name] = true; this._latched[name] = true; this.lastDevice = 'virtual'; }
  touchUp(name: TouchButton): void { this.touch[name] = false; }
  touchHeld(name: TouchButton): boolean { return !!(this.touch[name] || this._latched[name]); }
  touchMapToggle(): void { this.touch.map = !this.touch.map; this.lastDevice = 'virtual'; }
  // Synthesized one-frame codes for the actions the controller reads as key edges (cheer). Levels must never go
  // through here — a synthesized `KeyM` would open and close the map inside a single frame.
  pressCode(code: string): void { this.keys.add(code); this.pressed.add(code); }
  releaseCode(code: string): void { this.keys.delete(code); }

  requestLock(): void {
    if (this._plock) return;
    try {
      const p = (this.canvas.requestPointerLock as (o?: object) => Promise<void> | void)({ unadjustedMovement: true });
      // some platforms reject unadjustedMovement: fall back to a plain request
      if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock() as Promise<void> | void; if (q && q.catch) q.catch(() => {}); } catch { /* ignore */ } });
    } catch { /* not allowed without a gesture */ }
  }
  exitLock(): void { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }

  // Poll the selected pad (gamepad.ts owns selection, neutral gating and the mapping) and expose its standard view.
  pollPad(): void {
    const view = this.pads.poll(typeof navigator !== 'undefined' ? navigator : null);
    this.pad = view;
    this.padPressed.clear();
    if (!view) return;
    for (const i of view.pressedEdges) this.padPressed.add(i);
    if (view.active) this.lastDevice = 'pad';
  }

  // Apply the virtual layer's buttons to the mouse fields the rest of the game already reads, once per frame alongside
  // pollPad(). The edges are derived here (level now vs level last frame) rather than taken from the raw pointer
  // events, so a tap that both starts and ends between two frames still produces exactly one `leftPressed`.
  pollTouch(): void {
    const t = this.touch;
    if (!t.active) return;
    const left = this.touchHeld('fire'), right = this.touchHeld('sub');
    this.mouse.leftPressed = this.mouse.leftPressed || (left && !this._touchPrev.left);
    this.mouse.rightPressed = this.mouse.rightPressed || (right && !this._touchPrev.right);
    this._touchPrev.left = left; this._touchPrev.right = right;
    // pointer lock owns the mouse buttons while it is held; otherwise the virtual buttons do. Without the lock the
    // virtual look drag is also folded into mouse.dx/dy for the legacy map-cursor readers (hud.js, diorama.js) — the
    // common frame reads mouse.dx only under the lock and touch.ldx separately, so nothing is counted twice.
    if (!this._plock) { this.mouse.left = left; this.mouse.right = right; this.mouse.dx += t.ldx; this.mouse.dy += t.ldy; }
    else { this.mouse.left = this.mouse.left || left; this.mouse.right = this.mouse.right || right; }
  }

  padButton(i: number): boolean { return !!(this.pad && this.pad.buttons[i] && this.pad.buttons[i].pressed); }
  padValue(i: number): number { return this.pad && this.pad.buttons[i] ? this.pad.buttons[i].value : 0; }
  padAxis(i: number): number {
    if (!this.pad) return 0;
    const v = this.pad.axes[i] || 0;
    const dz = 0.14;
    return Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz);
  }

  // Stick with a RADIAL dead zone (no axis snapping on diagonals), an outer dead zone (full deflection is reachable
  // on worn sticks) and an optional response exponent applied to the magnitude only (direction is preserved).
  padStick(ix: number, iy: number, out: StickOut, dz = 0.12, outer = 0.96, expo = 1): StickOut {
    out.x = 0; out.y = 0; out.mag = 0;
    if (!this.pad) return out;
    return radialStick(this.pad.axes[ix] || 0, this.pad.axes[iy] || 0, out, dz, outer, expo);
  }

  // Dual-rumble pulse. strong = low-frequency motor, weak = high-frequency motor (0..1), ms = duration.
  // A pulse only pre-empts a running one if it is at least as strong, so rapid fire never becomes a constant buzz.
  rumble(strong: number, weak: number, ms = 60): void {
    if (!this.pad || this.lastDevice !== 'pad') return;
    const k = (G.settings as { rumble?: number } | null)?.rumble ?? 1;
    if (!(k > 0)) return;
    const act = this.pads.actuator();
    if (!act || !act.playEffect) return;
    const now = performance.now();
    const mag = Math.max(strong, weak) * k;
    if (now < this._rumbleUntil && mag < this._rumbleMag * 0.95) return;
    this._rumbleUntil = now + ms; this._rumbleMag = mag;
    try {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: Math.round(ms), strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) });
      if (p instanceof Promise) p.catch(() => {});
    } catch { /* unsupported */ }
  }

  // Call once at the very end of each frame.
  endFrame(): void {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0;
    this.mouse.leftPressed = false; this.mouse.rightPressed = false;
    this.touch.ldx = 0; this.touch.ldy = 0;
    this._latched = {};   // a tap lives exactly one frame, never two
  }
}

// Radial dead zone + outer dead zone + magnitude-only response exponent. Pure (also used by gamepad mapping tests).
export function radialStick(x: number, y: number, out: StickOut, dz = 0.12, outer = 0.96, expo = 1): StickOut {
  out.x = 0; out.y = 0; out.mag = 0;
  const m = Math.hypot(x, y);
  if (m <= dz) return out;
  const k = Math.min(1, (m - dz) / (outer - dz));
  const c = expo === 1 ? k : Math.pow(k, expo);
  out.x = (x / m) * c; out.y = (y / m) * c; out.mag = c;
  return out;
}
