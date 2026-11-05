// 비표준 패드 보정 마법사(33번 T012). 선택된 원시 패드를 단계별로 읽어 PadProfile을 만든다.
// 각 단계: 기준 상태(중립)를 잡고 → 가장 크게 바뀐 버튼·축을 기록 → 손을 떼어 중립으로 돌아오면 다음 단계.
// 선택 항목은 건너뛸 수 있고, 패드가 끊기면 즉시 중단한다(화면에서 빠져나올 수 있다). 저장은 호출자가 한다.
// DOM에 의존하지 않는다. 검사: tests/client/gamepad.test.ts(감지), 이 흐름은 tests/client/padBinder.test.ts.
import { BIND_STEPS, STD_AXES, STD_BUTTONS, detectBinding, snapshot, validateProfile, type AxisSource, type PadProfile, type PadSource, type RawPad, type RawSnapshot } from './gamepad.js';

export type BinderState = 'waitNeutral' | 'listen' | 'release' | 'done' | 'aborted';

function nearBase(base: RawSnapshot, now: RawSnapshot): boolean {
  for (let i = 0; i < now.buttons.length; i++) if ((now.buttons[i] ?? 0) - (base.buttons[i] ?? 0) > 0.3) return false;
  for (let i = 0; i < now.axes.length; i++) if (Math.abs((now.axes[i] ?? 0) - (base.axes[i] ?? 0)) > 0.3) return false;
  return true;
}

export class PadBinder {
  declare id: string; declare index: number;
  declare step: number; declare state: BinderState;
  declare base: RawSnapshot | null;
  declare profile: PadProfile;
  declare reason: string;

  constructor(raw: RawPad) {
    this.id = raw.id; this.index = raw.index;
    this.step = 0; this.state = 'waitNeutral';
    this.base = null;
    this.profile = { id: raw.id, buttons: new Array<PadSource | null>(STD_BUTTONS).fill(null), axes: new Array<AxisSource | null>(STD_AXES).fill(null) };
    this.reason = '';
  }

  get current() { return BIND_STEPS[this.step] ?? null; }

  // 한 프레임. raw = 지금 선택된 원시 패드(없으면 null).
  update(raw: RawPad | null): BinderState {
    if (this.state === 'done' || this.state === 'aborted') return this.state;
    if (!raw || raw.index !== this.index || raw.id !== this.id) { this.state = 'aborted'; this.reason = 'disconnected'; return this.state; }
    const now = snapshot(raw);
    if (this.state === 'waitNeutral') {
      // 처음 상태를 기준으로 잡되, 버튼이 눌려 있으면 뗄 때까지 기다린다(트리거 축의 쉬는 값 -1 등은 그대로 기준이 된다)
      if (now.buttons.some((v) => v > 0.3)) return this.state;
      this.base = now; this.state = 'listen';
      return this.state;
    }
    const base = this.base!;
    if (this.state === 'release') {
      if (nearBase(base, now)) { this.state = 'listen'; this._advance(); }
      return this.state;
    }
    const st = this.current!;
    const hit = detectBinding(base, now, st.kind);
    if (!hit) return this.state;
    if (st.kind === 'axis') this.profile.axes[st.std] = hit.src as AxisSource;
    else this.profile.buttons[st.std] = hit.src as PadSource;
    this.state = 'release';
    return this.state;
  }

  skip(): boolean {
    const st = this.current;
    if (!st || st.required || this.state === 'done' || this.state === 'aborted') return false;
    this._advance();
    return true;
  }

  restart(): void { const keepId = this.id, idx = this.index; Object.assign(this, new PadBinder({ id: keepId, index: idx, mapping: '', connected: true, buttons: [], axes: [] })); }
  cancel(): void { if (this.state !== 'done') { this.state = 'aborted'; this.reason = 'cancelled'; } }

  _advance(): void {
    this.step++;
    if (this.step >= BIND_STEPS.length) this.state = 'done';
  }

  // 완료 결과: 필수 누락·충돌이 없을 때만 저장 가능한 프로필이다.
  result(): { profile: PadProfile | null; missing: string[]; conflicts: string[] } {
    const v = validateProfile(this.profile);
    return { profile: this.state === 'done' && !v.missing.length && !v.conflicts.length ? this.profile : null, ...v };
  }
}
