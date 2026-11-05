// 입력 장치 정책(33번 T007·T008, 32번 2절). 기기 성능 분류와 입력 UI 상태를 서로 독립된 값으로 둔다.
//
//   hardwareProfile        실제 기기의 성능 분류(화질·메모리 배율·안전 영역). 입력 장치나 가상 키 표시로 바뀌지 않는다.
//   padStatus              gamepad.ts의 세션 상태.
//   activeInputSource      최근 "의미 있는" 조작을 한 장치(데드존 밖 축·실제 버튼·포인터 조작). 미세 드리프트로 바뀌지 않는다.
//   virtualVisible         가상 키를 화면에 그리는가(패드 사용 가능 여부와 자동/항상 설정).
//   virtualEnabled         지금 전투 가상 키가 입력을 받아도 되는가(전투 컨텍스트·세로 화면·포커스).
//   context                gameplay | map | menu | textEntry — 이 프레임 입력의 소비 대상.
// DOM에 의존하지 않는 순수 모듈이다. 검사: tests/client/inputPolicy.test.ts.
import type { PadStatus } from './gamepad.js';

export type HardwareProfile = 'desktop' | 'mobile';
export type VirtualMode = 'auto' | 'always';
export type InputSource = 'gamepad' | 'virtual' | 'keyboardMouse';
export type InputContext = 'gameplay' | 'map' | 'menu' | 'textEntry';

// 주 포인터가 손가락인 기기만 모바일 성능 분류이다. 터치스크린 노트북은 pointer: fine이라 데스크톱으로 남는다.
export function detectHardware(env: { coarse: boolean; touchPoints: number }): HardwareProfile {
  return env.coarse && env.touchPoints > 0 ? 'mobile' : 'desktop';
}

export interface PolicyState {
  hardware: HardwareProfile;
  mode: VirtualMode;
  padStatus: PadStatus;
  source: InputSource;
  pointerLocked: boolean;
  context: InputContext;
  portrait: boolean;
  focused: boolean;
}

// 가상 키 표시: "항상"이면 늘, 자동이면 인식된 패드로 실제 조작 중일 때만 접는다. 데스크톱에서 포인터 잠금으로
// 키보드·마우스를 쓰는 동안은 커서가 없어 누를 수 없으므로 그리지 않는다(잠금이 풀리면 바로 다시 보인다).
export function virtualVisible(s: PolicyState): boolean {
  if (s.mode === 'always') return true;
  if (s.padStatus === 'ready' && s.source === 'gamepad') return false;
  if (s.hardware === 'desktop' && s.pointerLocked) return false;
  return true;
}

// 가상 키 입력 허용: 보이는 상태에서 전투(또는 지도) 컨텍스트, 가로 화면, 포커스가 있을 때만.
export function virtualEnabled(s: PolicyState): boolean {
  return virtualVisible(s) && (s.context === 'gameplay' || s.context === 'map') && !s.portrait && s.focused;
}

// 입력 출처 갱신: 이번 프레임에 의미 있는 조작을 한 장치들 중 하나로 바꾼다. 아무도 없으면 유지한다(드리프트 무시).
// 여러 장치가 동시에 조작했으면 현재 출처를 유지한다(같은 프레임의 겹침으로 안내가 깜박이지 않게).
export function nextSource(cur: InputSource, acted: Partial<Record<InputSource, boolean>>): InputSource {
  if (acted[cur]) return cur;
  for (const k of ['gamepad', 'virtual', 'keyboardMouse'] as const) if (acted[k]) return k;
  return cur;
}

// ---- 입력 설정 이전(T008) -------------------------------------------------------------------------------------------
export const INPUT_SETTINGS_VERSION = 2;
export const VC_LIMITS = {
  size: [0.7, 1.5] as const,       // 가상 키 크기 배율
  opacity: [0.3, 1] as const,
  offset: [-240, 240] as const,    // 버튼 묶음 위치 이동(CSS px). 레이아웃이 화면 안으로 다시 넣는다
  sens: [0.2, 3] as const,
};
export interface InputSettings {
  inputVersion: number;
  virtualControls: VirtualMode;
  vcSize: number; vcOpacity: number; vcOffsetX: number; vcOffsetY: number;
  touchSensitivity: number; padSensitivity: number; sensitivity: number;
}
export const INPUT_DEFAULTS: InputSettings = {
  inputVersion: INPUT_SETTINGS_VERSION,
  virtualControls: 'auto', vcSize: 1, vcOpacity: 0.85, vcOffsetX: 0, vcOffsetY: 0,
  touchSensitivity: 1, padSensitivity: 1, sensitivity: 1,
};

const num = (v: unknown, [lo, hi]: readonly [number, number], d: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// 저장된 설정 객체(깨졌거나 구버전일 수 있다) → 입력 설정. 구버전(inputVersion 없음)만 touchControls를 한 번 옮긴다:
// 'on' → 'always', 'auto'·'off' → 'auto'(패드가 없으면 가상 키가 기본 조작이다). 새 버전 값은 범위만 검사하고 덮어쓰지 않는다.
// changed = 저장을 다시 써야 하는가(이전·복구가 일어났다).
export function migrateInputSettings(stored: unknown): { input: InputSettings; changed: boolean } {
  const s = (stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) as Record<string, unknown>;
  const out: InputSettings = { ...INPUT_DEFAULTS };
  let changed = false;
  const ver = typeof s.inputVersion === 'number' ? s.inputVersion : 0;
  if (ver < INPUT_SETTINGS_VERSION) {
    out.virtualControls = s.touchControls === 'on' ? 'always' : 'auto';
    changed = true;
  } else if (ver > INPUT_SETTINGS_VERSION) {
    // 미래 버전: 이해하는 필드만 범위 검사로 읽고 버전 표기는 낮추지 않는다(다음 실행에서 되돌리지 않게)
    out.inputVersion = ver;
    out.virtualControls = s.virtualControls === 'always' ? 'always' : 'auto';
  } else {
    out.virtualControls = s.virtualControls === 'always' ? 'always' : 'auto';
    if (s.virtualControls !== out.virtualControls) changed = true;
  }
  const fields: Array<[keyof InputSettings, readonly [number, number]]> = [
    ['vcSize', VC_LIMITS.size], ['vcOpacity', VC_LIMITS.opacity], ['vcOffsetX', VC_LIMITS.offset], ['vcOffsetY', VC_LIMITS.offset],
    ['touchSensitivity', VC_LIMITS.sens], ['padSensitivity', VC_LIMITS.sens], ['sensitivity', VC_LIMITS.sens],
  ];
  for (const [k, lim] of fields) {
    const v = num(s[k], lim, INPUT_DEFAULTS[k] as number);
    if (s[k] !== v) changed = true;
    (out[k] as number) = v;
  }
  return { input: out, changed };
}

// 가상 키 배치만 초기값으로(화면 밖으로 옮긴 버튼 복구)
export function resetVirtualLayout(s: InputSettings): InputSettings {
  return { ...s, vcSize: INPUT_DEFAULTS.vcSize, vcOpacity: INPUT_DEFAULTS.vcOpacity, vcOffsetX: 0, vcOffsetY: 0 };
}
