// 인물 프로필을 캐릭터에 적용한다(35번 R011 표정 프로필·R014 잔향 외형·R019 물결 발광).
// character.js를 고치지 않고 main이 넘기는 CharacterClass를 감싼다(withCast). 프로필이 없는 캐릭터(대전 봇·로비 등)는
// 기존 동작 그대로이다. 프로필이 있으면:
//   · 유휴 미세 표정: character.js의 무작위 유휴 표정을 멈추고(mxT 유지) 프로필 가중치로 고른 표정을 같은 _mxPlay로 재생한다.
//   · 기본 표정: _mxPlay 슬롯 하나를 긴 유지 시간으로 차지한다(더 센 표정에 밀려나면 다음 프레임에 다시 넣는다).
//   · 깜박임: character.js가 다음 깜박임을 예약한 순간 간격을 (기본 14회/분 ÷ 프로필 빈도)배 한다. 0이면 깜박이지 않는다.
//   · 반응: react(kind)가 표정을 재생하고 말풍선 문장을 돌려준다(0.6초 안의 겹침은 가중치 큰 것만).
import * as THREE from 'three';
import type { Character } from '../character.js';
import {
  PROFILES, EXPR, ECHO, pickIdle, pickLine, passReactGate,
  type CastId, type ExpressionProfile, type IdleKind, type ReactKind, type EchoSpec, type ExprVector, type ReactGate,
} from './cast.js';

type CharacterOptions = ConstructorParameters<typeof Character>[0];
// _mxPlay 슬롯과 호출 형식(character.js: E = [sneer, pucker, blush] 추가 채널)
interface MxSlot { X: unknown }
type MxPlay = (X: ExprVector, w: number, a?: number, h?: number, d?: number, bras?: number, E?: number[] | null) => void;
const play = (c: Character, ...args: Parameters<MxPlay>): void => (c._mxPlay as unknown as MxPlay).apply(c, args);

interface CastState {
  id: CastId; profile: ExpressionProfile;
  gate: ReactGate; lastLine: string | null; lastIdle: IdleKind | null; idleT: number; prevBlinkNext: number;
  echo: EchoSpec | null; mark: THREE.Mesh | null; markBlink: number;
  waveGlow: number;                                   // 0..1 물결 3단계 머리카락 발광
  onHide: ((c: Character) => boolean) | null;         // 숨김을 가로채 연출(잔향 소멸) 뒤 숨긴다
}

const STATE = new WeakMap<Character, CastState>();
const BASE_BLINK = 14;     // character.js 기본 깜박임(분당 약 12~15회)
const ECHO_GREY = new THREE.Color(ECHO.hairGrey);
const _c = new THREE.Color();

export function castOf(c: Character): CastState | undefined { return STATE.get(c); }

// 인물 프로필을 붙인다(null = 떼고 기존 동작). 잔향이면 외형도 바꾼다(되돌리지 않는다: 잔향 캐릭터는 그대로 버려진다).
export function setCast(c: Character, id: CastId | null, echo: EchoSpec | null = null): void {
  if (!id) { STATE.delete(c); return; }
  const prev = STATE.get(c);
  const st: CastState = {
    id, profile: PROFILES[id], gate: { at: -99, weight: 0 }, lastLine: null, lastIdle: null,
    idleT: 1 + c.rng() * 2, prevBlinkNext: c.bl.next, echo: echo ?? prev?.echo ?? null, mark: prev?.mark ?? null, markBlink: 0,
    waveGlow: 0, onHide: prev?.onHide ?? null,
  };
  STATE.set(c, st);
  if (st.echo && !prev?.echo) applyEchoLook(c, st);
}

// 사건 반응: 표정을 재생하고 말할 문장(없으면 null)을 돌려준다.
export function react(c: Character, kind: ReactKind, now: number): string | null {
  const st = STATE.get(c);
  const r = st?.profile.react[kind];
  if (!st || !r || !passReactGate(st.gate, now, r.weight)) return null;
  play(c, r.vector, r.weight, 0.08, r.hold, 0.4, 0, r.blush ? [0, 0, r.blush / r.weight] : null);
  if (!r.say || !r.say.length) return null;
  st.lastLine = pickLine(r.say, st.lastLine, c.rng);
  return st.lastLine;
}

export function setWaveGlow(c: Character, k: number): void { const st = STATE.get(c); if (st) st.waveGlow = k; }
export function blinkMark(c: Character, seconds: number): void { const st = STATE.get(c); if (st) st.markBlink = seconds; }
export function setHideHook(c: Character, fn: ((c: Character) => boolean) | null): void { const st = STATE.get(c); if (st) st.onHide = fn; }

// ---------------------------------------------------------------- 잔향 외형(R014)
function grey(col: THREE.Color): void { const y = col.r * 0.3 + col.g * 0.59 + col.b * 0.11; col.setRGB(y, y, y); }

function applyEchoLook(c: Character, st: CastState): void {
  const u = c.u as Record<string, { value: unknown }>;
  for (const k of ['uShirt', 'uShorts', 'uShoe', 'uSole', 'uSock', 'uStrap', 'uIris', 'uIris2']) {
    const v = u[k]?.value;
    if (v instanceof THREE.Color) grey(v);
  }
  const acc = st.echo?.accent;
  if (acc) { const v = u[acc.slot]?.value; if (v instanceof THREE.Color) v.set(acc.color); }   // 대장의 색 하나
  const skin = c.mats.skin as THREE.MeshPhysicalMaterial;
  skin.color.set(ECHO.skin);   // 종이 인형: 원래 피부색과 무관한 밝은 무채색(어두운 피부가 먹빛 덩어리로 보이지 않게)
  grey(skin.sheenColor);
  const hair = c.mats.hair as THREE.Material;
  hair.transparent = true; hair.opacity = ECHO.hairAlpha; hair.needsUpdate = true;
  c.setColor(ECHO_GREY);   // 머리카락·탱크 잉크는 팀색 채널을 쓰므로 회색으로(무기 탄의 색은 Actor 팀색 그대로)
  // 고글 중앙(이마)의 병종 색 발광 다이아몬드
  const head = (c.bones as Record<string, THREE.Bone | undefined>).head;
  if (head && !st.mark && st.echo) {
    const s = ECHO.markSize[st.echo.tier];
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(st.echo.markColor), emissiveIntensity: 1.6, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
    m.scale.set(s * 0.75, s, s * 0.35);
    m.position.set(0, 0.255, 0.165);
    m.name = 'echo-mark';
    head.add(m);
    st.mark = m;
  }
}

// ---------------------------------------------------------------- 프레임
function tick(c: Character, st: CastState, dt: number): void {
  const p = st.profile;
  c.mxT = 99;   // character.js의 무작위 유휴 표정을 멈춘다(프로필 추첨이 대신한다)
  st.idleT -= dt;
  if (st.idleT <= 0) {
    st.idleT = (c.inWorld ? 4 : 2.6) + c.rng() * 4;
    const calm = c.kidForm && !c.moving && c.wAim < 0.2;
    const k = calm && c.lifeLv >= 2 ? pickIdle(p.idle, st.lastIdle, c.rng) : null;
    if (k) {
      st.lastIdle = k;
      const sd = c.rng() < 0.5 ? 1 : -1, hold = 0.35 + c.rng() * 0.9;
      const X: ExprVector = EXPR[k];
      if (k === 'smirk' || k === 'hmm') play(c, X, 0.8 * sd, 0.18, hold, 0.5);
      else if (k === 'browFlash') play(c, X, 0.25, 0.2, hold, 0.5, 0.55 * sd);
      else play(c, X, 0.7, 0.16, hold + (k === 'softSmile' ? 0.6 : 0), 0.5);
    }
  }
  const b = p.base;
  if (b && !(c.mx as MxSlot[]).some((m) => m.X === b.vector)) play(c, b.vector, b.weight, 0.4, 1e9, 0.5, 0, b.blush ? [0, 0, b.blush / b.weight] : null);
  // 깜박임 빈도: character.js가 새 간격을 예약한 프레임에만 비율을 곱한다
  if (p.blinkRate <= 0) c.bl.next = 1e9;
  else if (c.bl.next > st.prevBlinkNext + 1e-3) c.bl.next *= BASE_BLINK / p.blinkRate;
  st.prevBlinkNext = c.bl.next;
  if (p.headTilt) (c.bones as Record<string, THREE.Bone | undefined>).head?.rotateZ(p.headTilt);
  if (st.mark) {
    st.markBlink = Math.max(0, st.markBlink - dt);
    const mat = st.mark.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = st.markBlink > 0 ? (Math.sin(c.t * Math.PI * 2 * 8) > 0 ? 3 : 0.3) : 1.6;
  }
}

// 모든 캐릭터 생성 경로가 쓰는 CharacterClass를 감싼다(withProportion과 같은 방식).
export function withCast(Base: typeof Character): typeof Character {
  return class CastCharacter extends Base {
    constructor(opts?: CharacterOptions) { super(opts); }
    override update(dt: number, s: Parameters<Character['update']>[1]) {
      const r = super.update(dt, s);
      const st = STATE.get(this);
      if (st) tick(this, st, dt);
      return r;
    }
    override setColor(color: Parameters<Character['setColor']>[0]) {
      const st = STATE.get(this);
      return super.setColor(st?.echo ? ECHO_GREY : color);
    }
    override setVisible(v: boolean) {
      const st = STATE.get(this);
      if (!v && st?.onHide?.(this)) return;
      return super.setVisible(v);
    }
    override _updateMaterials(dt: number, s: Parameters<Character['_updateMaterials']>[1]) {
      const r = super._updateMaterials(dt, s);
      const st = STATE.get(this);
      if (st && st.waveGlow > 0) {
        const pul = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * 2.4);
        (this.u.uGlow.value as THREE.Color).add(_c.copy(this.color).multiplyScalar(st.waveGlow * (0.3 + 0.35 * pul)));
      }
      return r;
    }
  };
}

// 실제 숨김(onHide가 가로챈 뒤 연출을 마치고 부른다)
export function hideNow(c: Character): void {
  const st = STATE.get(c), h = st?.onHide ?? null;
  if (st) st.onHide = null;
  c.setVisible(false);
  if (st) st.onHide = h;
}

// 프로필과 무관하게 표정 하나를 재생한다(잔향의 스태거 X_WINCE처럼 연출이 직접 거는 표정)
export function playExpr(c: Character, vector: ExprVector, weight: number, hold: number): void { play(c, vector, weight, 0.05, hold, 0.3); }
