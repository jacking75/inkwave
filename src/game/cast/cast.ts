// 등장인물 정의(35번 3.2절 시트): 표정 프로필·사건 반응 대사(R011)와 외형(R014)·목소리(R012) 값이다.
// 데이터와 순수 계산만 둔다. 캐릭터에 적용하는 코드는 castCharacter.ts, 말풍선·목소리는 speech.ts·voice.ts이다.
import type { EnemyRole } from '../../campaign/action/stagger.js';

// 표정 벡터: character.js의 X_* 상수와 같은 채널 순서 [BROW, BROWY, EYE, MCURVE, MWIDTH, MOPEN, MTILT, SQUINT]이다.
// character.js가 이 표를 모르므로(모듈 비공개 상수) 쓰는 표정만 같은 값으로 옮겨 둔다.
export const EXPR = {
  focus: [-0.38, -0.25, -0.08, -0.5, -0.18, 0, 0, 0.25],
  grin: [-0.2, 0, -0.05, 0.3, 0.12, 0.22, 0, 0.2],
  wince: [0.85, 0.1, -0.62, -1.9, -0.1, 0.42, 0.18, 0.7],
  worry: [0.62, 0.45, 0.08, -1.1, -0.28, 0.1, 0, 0],
  determ: [-0.45, -0.1, -0.06, 0.2, 0.05, 0.05, 0.16, 0.2],
  surprise: [0.25, 0.9, 0.18, -0.75, -0.42, 0.55, 0, 0],
  tired: [0.5, -0.1, -0.2, -0.9, -0.2, 0.22, 0, 0.1],
  joy: [0.1, 0.7, -0.12, 0.25, 0.12, 0.72, 0, 0.35],
  pout: [0.75, -0.3, -0.45, -1.65, -0.35, 0, 0.12, 0.2],
  browFlash: [-0.1, 0.85, 0.1, 0.25, 0.05, 0.04, 0, 0],
  oof: [0.7, 0.35, 0.1, -1.3, -0.3, 0.55, -0.1, 0.35],
  lipPress: [-0.12, -0.08, 0, -0.45, -0.32, 0, 0, 0.06],
  smirk: [-0.08, 0.12, -0.04, 0.35, 0.06, 0, 0.42, 0.12],
  hmm: [0.2, 0.15, 0, -0.25, -0.22, 0.05, -0.2, 0],
  softSmile: [-0.05, 0.18, -0.06, 0.45, 0.1, 0.06, 0, 0.22],
} as const satisfies Record<string, readonly number[]>;
export type ExprVector = readonly number[];

export type IdleKind = 'lipPress' | 'smirk' | 'hmm' | 'softSmile' | 'browFlash';
export type ReactKind = 'kill' | 'eliteKill' | 'hurt' | 'bigHurt' | 'perfect' | 'surge' | 'objective' | 'lowHp' | 'idleLong' | 'waveUp' | 'waveDown';
export interface Reaction { vector: ExprVector; weight: number; hold: number; say?: readonly string[]; blush?: number }

export interface ExpressionProfile {
  idle: Partial<Record<IdleKind, number>>;                       // 유휴 미세 표정 발생 가중치(0 = 없음)
  base: { vector: ExprVector; weight: number; blush?: number } | null;   // 항상 섞이는 기본 표정
  react: Partial<Record<ReactKind, Reaction>>;
  blinkRate: number;                                            // 분당(0 = 깜박이지 않음)
  headTilt?: number;                                            // 고개 기울임 rad(틸)
}

export type CastId = 'player' | 'mora' | 'teal' | 'echo' | 'captain';
export type VoiceKind = 'squeak' | 'low' | 'radio' | 'vocoder' | 'none';
export interface VoiceSpec { kind: VoiceKind; f0: number; syllable: [number, number]; formants: [[number, number], [number, number]] }

// 3.2절 시트의 목소리. 음절 길이 ms 범위, 포먼트 [중심 Hz, Q] 두 개
export const VOICES: Record<CastId | 'pong', VoiceSpec> = {
  player: { kind: 'squeak', f0: 300, syllable: [70, 100], formants: [[900, 6], [2300, 8]] },
  mora: { kind: 'low', f0: 190, syllable: [90, 110], formants: [[650, 5], [1700, 7]] },
  teal: { kind: 'radio', f0: 420, syllable: [70, 95], formants: [[1100, 6], [2700, 9]] },
  pong: { kind: 'squeak', f0: 560, syllable: [70, 80], formants: [[1300, 7], [3200, 9]] },
  echo: { kind: 'none', f0: 0, syllable: [70, 70], formants: [[1000, 4], [2000, 4]] },
  captain: { kind: 'vocoder', f0: 110, syllable: [100, 110], formants: [[500, 4], [1400, 6]] },
};

const R = (vector: ExprVector, weight: number, hold: number, say?: readonly string[], blush?: number): Reaction => ({ vector, weight, hold, say, blush });

export const PROFILES: Record<CastId, ExpressionProfile> = {
  // 말이 적고 행동으로 답한다. 반응 대사는 짧은 감탄사이다.
  player: {
    idle: { softSmile: 3, browFlash: 2, lipPress: 1, smirk: 1, hmm: 1 },
    base: { vector: EXPR.softSmile, weight: 0.3, blush: 0.15 },
    blinkRate: 14,
    react: {
      kill: R(EXPR.grin, 0.8, 0.5, ['좋아!', '하나!', '됐다!']),
      eliteKill: R(EXPR.joy, 0.9, 0.8, ['해냈다!', '쓰러졌어!', '휴, 큰 놈!'], 0.4),
      hurt: R(EXPR.wince, 0.55, 0.2, ['윽!', '앗!', '아야!']),
      bigHurt: R(EXPR.oof, 0.9, 0.35, ['으악!', '아파!', '크윽!']),
      perfect: R(EXPR.smirk, 0.95, 0.6, ['어림없지!', '휙!', '봤어?']),
      surge: R(EXPR.determ, 0.7, 0.3, ['간다!', '슝!', '비켜!']),
      objective: R(EXPR.joy, 0.8, 0.9, ['됐다!', '불이 들어왔어!', '한 칸 더!'], 0.3),
      lowHp: R(EXPR.worry, 0.8, 1.2, ['위험해…', '잠깐 숨자', '아슬아슬…']),
      idleLong: R(EXPR.tired, 0.6, 1.5, ['…가 볼까?', '조용하네', '다음은 어디지?']),
      waveUp: R(EXPR.determ, 0.75, 0.6, ['물결을 탔어!', '이 기세로!', '더 빠르게!']),
      waveDown: R(EXPR.pout, 0.6, 0.6, ['아깝다', '다시 타자', '흐름이…']),
    },
  },
  // 실무적이고 짧게 말한다. 기쁨도 입을 다문 채 고개만 끄덕인다.
  mora: {
    idle: { lipPress: 3, hmm: 2, browFlash: 1 },
    base: { vector: EXPR.lipPress, weight: 0.25 },
    blinkRate: 12,
    react: {
      kill: R(EXPR.determ, 0.7, 0.6, ['정리.', '하나 끝.', '좋아, 다음.']),
      eliteKill: R(EXPR.smirk, 0.8, 0.8, ['큰 거 하나 갔다.', '잘했어.', '버텼네.']),
      hurt: R(EXPR.focus, 0.6, 0.3, ['조심해.', '버텨.', '엄폐해.']),
      bigHurt: R(EXPR.worry, 0.7, 0.5, ['물러서!', '무리하지 마.', '괜찮아?']),
      perfect: R(EXPR.browFlash, 0.7, 0.4, ['…제법인데.', '그 타이밍이야.', '좋은 눈.']),
      surge: R(EXPR.lipPress, 0.5, 0.3, ['빠르네.', '길 냈다.', '그대로 가.']),
      objective: R(EXPR.smirk, 0.6, 0.9, ['연결됐다.', '하나 살렸어.', '다음 구역.']),
      lowHp: R(EXPR.worry, 0.6, 1.0, ['잉크에 숨어.', '빠져.', '회복부터.']),
      idleLong: R(EXPR.hmm, 0.6, 1.2, ['움직여.', '시간 없어.', '다음 구역.']),
      waveUp: R(EXPR.determ, 0.5, 0.5, ['그 흐름 유지해.', '좋아.', '계속.']),
      waveDown: R(EXPR.lipPress, 0.6, 0.5, ['다시.', '흐트러졌어.', '숨 고르고.']),
    },
  },
  // 신호를 읽어 주는 사람이다. 정답 대신 관찰을 말한다. 늘 고개를 조금 기울인다.
  teal: {
    idle: { hmm: 2, browFlash: 2, smirk: 1 },
    base: { vector: EXPR.focus, weight: 0.3 },
    blinkRate: 16, headTilt: 0.08,
    react: {
      kill: R(EXPR.surprise, 0.5, 0.4, ['신호 하나 꺼졌어.', '방금 반응 사라졌어.', '깨끗해.']),
      eliteKill: R(EXPR.joy, 0.7, 0.7, ['큰 신호가 꺼졌어!', '와, 조용해졌다.', '대형 반응 소멸!']),
      hurt: R(EXPR.worry, 0.6, 0.3, ['맥박 튀었어.', '피격 신호!', '괜찮아?']),
      bigHurt: R(EXPR.surprise, 0.9, 0.5, ['방금 크게 맞았어!', '신호가 흔들려!', '위험 수치!']),
      perfect: R(EXPR.joy, 0.8, 0.5, ['지금 봤어? 완벽해.', '파형이 딱 겹쳤어.', '정확히 그 순간!']),
      surge: R(EXPR.browFlash, 0.6, 0.3, ['속도 급상승.', '파동이 길어졌어.', '빨라!']),
      objective: R(EXPR.joy, 0.8, 0.8, ['신호 복구 확인!', '주파수 맞았어.', '불이 들어와!'], 0.25),
      lowHp: R(EXPR.worry, 0.8, 1.0, ['신호 약해지고 있어.', '쉬어 가.', '잉크 속으로!']),
      idleLong: R(EXPR.hmm, 0.6, 1.2, ['저쪽에 잡음이 있어.', '…들려?', '신호가 조용해.']),
      waveUp: R(EXPR.smirk, 0.6, 0.5, ['리듬이 올라가.', '파형 증폭 중.', '좋은 흐름이야.']),
      waveDown: R(EXPR.worry, 0.5, 0.5, ['리듬 끊겼어.', '파형 하강.', '다시 맞춰 보자.']),
    },
  },
  // 잔향 대원: 무표정, 깜박임 없음, 말 없음
  echo: { idle: {}, base: null, blinkRate: 0, react: {} },
  // 대장: X_DETERM 고정, 하나의 문장만 반복(25번 7.1절 — 대사는 대본이 갖는다)
  captain: { idle: {}, base: { vector: EXPR.determ, weight: 0.7 }, blinkRate: 6, react: {} },
};

// ---- 반응 선택(순수)
// 같은 인물에게 0.6초 안에 반응이 겹치면 가중치가 큰 것만 재생한다.
export const REACT_GAP = 0.6;
export interface ReactGate { at: number; weight: number }
export function passReactGate(gate: ReactGate, now: number, weight: number): boolean {
  if (now - gate.at < REACT_GAP && weight <= gate.weight) return false;
  gate.at = now; gate.weight = weight;
  return true;
}
// 직전 문장을 반복하지 않는 고르기(rng ∈ [0,1))
export function pickLine(lines: readonly string[], last: string | null, rng: () => number): string {
  if (lines.length === 1) return lines[0];
  const pool = lines.filter((l) => l !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
// 유휴 미세 표정 가중 추첨(직전과 같은 종류는 피한다). 가중치가 모두 0이면 null
export function pickIdle(idle: Partial<Record<IdleKind, number>>, last: IdleKind | null, rng: () => number): IdleKind | null {
  const kinds = (Object.keys(idle) as IdleKind[]).filter((k) => (idle[k] ?? 0) > 0 && (k !== last || Object.keys(idle).length === 1));
  const total = kinds.reduce((s, k) => s + (idle[k] ?? 0), 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (const k of kinds) { r -= idle[k] ?? 0; if (r < 0) return k; }
  return kinds[kinds.length - 1];
}

// ---- 외형(R014). 스타일 색인은 character-style.ts 표의 값이다(APPEND-ONLY: 의상·프리셋은 표 끝에 추가했다).
// 새 모자 'goggles'·'headset'은 1장 전에 지오메트리를 만들지 않아 3.2절 대체안(모라 bucket 3, 틸 beanie 2)을 쓴다.
export const OUTFIT_OVERALLS = 10, OUTFIT_HOODIE_VEST = 11;
export interface CastLook { style: { hair: number; skin: number; outfit: number; eyes: number; hat: number; brows: number }; color: string }
export const CAST_LOOKS: Record<'mora' | 'teal', CastLook> = {
  mora: { style: { hair: 6, skin: 6, outfit: OUTFIT_OVERALLS, eyes: 5, hat: 3, brows: 1 }, color: '#7d8f3a' },   // 올리브 묶은 머리
  teal: { style: { hair: 3, skin: 4, outfit: OUTFIT_HOODIE_VEST, eyes: 1, hat: 2, brows: 0 }, color: '#1fb3a6' },  // 짧은 청록 촉수
};

// 잔향 대원(R014): 피부·옷 채도 0, 머리카락 회색 반투명(알파 0.75), 고글 중앙의 병종 색 발광 다이아몬드
export type EchoTier = 'grunt' | 'elite' | 'captain';
// accent: 대장의 색 하나(완장·어깨띠·망토)를 기존 옷 색 슬롯으로 대신한다(3.2절)
export interface EchoSpec { markColor: string; tier: EchoTier; accent?: { slot: 'uStrap' | 'uShirt'; color: string } }
export const ECHO = { skin: '#cdcbc6', hairGrey: '#9a9da4', hairAlpha: 0.75, markSize: { grunt: 0.06, elite: 0.075, captain: 0.09 } } as const;
// 병종 표식 색(24번 병종 구분과 같은 계열). 경고 노랑(#ffd21a)은 텔레그래프 전용이라 쓰지 않는다.
export const ECHO_MARK: Record<EnemyRole, string> = {
  gunner: '#ff5a4f', watcher: '#4fd0ff', mortar: '#ff9a2e', painter: '#c86bff', shield: '#7dff8a',
};

// 잔향 대장·정예(3.2절 "대장 7인", 25번 7절, 각 스테이지 문서). 인간형 스테이지 보스 3명은 tier 'captain'에 병종 소품
// (기존 무기 모델)과 색 하나, 지역 중간보스 7명은 tier 'elite'이다. 2·6장 장치 보스와 거대 소라게는 인간형이 아니라 없다.
// 공격·체력은 각 스테이지 문서와 33번 T042·T045 등이 갖는다. 여기는 외형과 반복 대사만이다.
export interface EchoLeaderDef {
  id: string; name: string; chapter: number; tier: 'elite' | 'captain'; role: EnemyRole; weapon: string;
  accent?: EchoSpec['accent']; line?: string;
}
export const ECHO_LEADERS: readonly EchoLeaderDef[] = [
  { id: 'sweeper', name: '청소반장', chapter: 1, tier: 'elite', role: 'painter', weapon: 'roller' },
  { id: 'bari', name: '통행대장 바리', chapter: 1, tier: 'captain', role: 'shield', weapon: 'brolly', accent: { slot: 'uStrap', color: '#e23b2e' }, line: '통행 기록을 초기화한다.' },
  { id: 'glass-eye', name: '유리눈 감시자', chapter: 2, tier: 'elite', role: 'watcher', weapon: 'charger' },
  { id: 'loader', name: '적재장 포수', chapter: 3, tier: 'elite', role: 'mortar', weapon: 'blaster' },
  { id: 'warden', name: '계류 수문장', chapter: 4, tier: 'elite', role: 'shield', weapon: 'brolly' },
  { id: 'skew', name: '계류장 스큐', chapter: 4, tier: 'captain', role: 'watcher', weapon: 'charger', accent: { slot: 'uStrap', color: '#ffc23a' }, line: '미등록 항로를 폐쇄한다.' },
  { id: 'salt-crew', name: '염전 청소조', chapter: 5, tier: 'elite', role: 'painter', weapon: 'brush' },
  { id: 'salt', name: '풍차장 솔트', chapter: 5, tier: 'captain', role: 'painter', weapon: 'spinner', accent: { slot: 'uShirt', color: '#f4f2ec' }, line: '혼합 흐름을 차단한다.' },
  { id: 'twin-gate', name: '쌍문지기', chapter: 6, tier: 'elite', role: 'shield', weapon: 'brolly' },
  { id: 'commander', name: '잔향 지휘관', chapter: 7, tier: 'elite', role: 'mortar', weapon: 'blaster' },
];
export function echoSpecOf(def: EchoLeaderDef): EchoSpec { return { markColor: ECHO_MARK[def.role], tier: def.tier, accent: def.accent }; }
