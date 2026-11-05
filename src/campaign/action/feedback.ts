// 전투 피드백 패키지(35번 R021): 처치·정예 처치(피니시)·보스 페이즈 전환의 시간 정지·카메라 펀치·FOV 줌·패드 진동·
// 의성어·퐁 기쁨을 한곳에서 정한다. planFeedback은 순수 계산이고 CombatFeedback이 TimeScale·카메라·입력·이벤트에 적용한다.
//
// 규칙(4절 표): 처치 0.08초, 정예·대장 처치 0.16초, 보스 페이즈 전환 0.25초 정지. 히트스톱 0.4초 중복 제한은 TimeScale이
// 갖는다(병합된 요청은 연출을 다시 붙이지 않는다). "모션 줄이기"면 시간 정지·카메라 펀치·FOV 줌을 끄고 의성어·진동만 남긴다.
import * as THREE from 'three';
import { G, emit } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import type { TimeScale } from './timeScale.js';
import type { EnemyTier } from './stagger.js';

export type FinishKind = 'kill' | 'elite' | 'phase';

export interface FeedbackPlan {
  hitstop: number;                         // s (0 = 없음)
  punch: 'kill' | 'elite' | null;          // cameraRig.punch
  fovKick: number; fovKickT: number;       // 도(음수 = 좁힘), s
  word: { text: string; kind: 'eliteKill' } | null;   // 일반 처치 단어는 sfxWords가 낸다
  rumble: [strong: number, weak: number, ms: number] | null;
  pongJoy: boolean;
}

export const FEEDBACK = {
  kill: { hitstop: 0.08, rumble: [0.25, 0.3, 70] as [number, number, number] },
  elite: { hitstop: 0.16, fov: -8, fovT: 0.35, word: '쾅!', rumble: [0.8, 0.4, 180] as [number, number, number] },
  phase: { hitstop: 0.25, rumble: [0.6, 0.5, 220] as [number, number, number] },
} as const;

export function finishOf(tier: EnemyTier | null | undefined): FinishKind { return tier === 'elite' || tier === 'captain' ? 'elite' : 'kill'; }

export function planFeedback(kind: FinishKind, reduceMotion: boolean): FeedbackPlan {
  const calm = reduceMotion;
  if (kind === 'elite') {
    const f = FEEDBACK.elite;
    return { hitstop: calm ? 0 : f.hitstop, punch: calm ? null : 'elite', fovKick: calm ? 0 : f.fov, fovKickT: f.fovT,
      word: { text: f.word, kind: 'eliteKill' }, rumble: f.rumble, pongJoy: true };
  }
  if (kind === 'phase') {
    return { hitstop: calm ? 0 : FEEDBACK.phase.hitstop, punch: calm ? null : 'elite', fovKick: 0, fovKickT: 0, word: null, rumble: FEEDBACK.phase.rumble, pongJoy: false };
  }
  return { hitstop: calm ? 0 : FEEDBACK.kill.hitstop, punch: calm ? null : 'kill', fovKick: 0, fovKickT: 0, word: null, rumble: FEEDBACK.kill.rumble, pongJoy: false };
}

// 효과를 받는 쪽(카메라·입력). 테스트·세션이 바꿔 끼울 수 있게 G에서 직접 읽지 않고 주입한다.
export interface FeedbackSinks {
  rig?: { punch?(k: 'kill' | 'elite'): void; kickFov?(deg: number, s: number): void } | null;
  rumble?(strong: number, weak: number, ms: number): void;
}

const _p = new THREE.Vector3();

export class CombatFeedback {
  declare time: TimeScale; declare reduceMotion: () => boolean; declare sinks: () => FeedbackSinks;

  constructor(time: TimeScale, reduceMotion: () => boolean, sinks: () => FeedbackSinks) {
    this.time = time; this.reduceMotion = reduceMotion; this.sinks = sinks;
  }

  // 시간 정지 요청 하나: 새로 시작했을 때만 fx:hitstop을 낸다(0.4초 안의 병합은 조용히 길이만 늘린다)
  hitstop(seconds: number, reason: string, scale?: number): boolean {
    if (!(seconds > 0)) return false;
    const started = this.time.hitstop(seconds, scale);
    if (started) emit('fx:hitstop', { seconds, scale: this.time.stopScale, reason });
    return started;
  }

  // 처치(플레이어가 적을 쓰러뜨림): 대장·정예면 피니시이다
  kill(victim: Actor, tier: EnemyTier | null): void { this._apply(finishOf(tier), victim.pos); }
  // 보스 페이즈 전환(33번 T045가 부른다)
  phase(at: THREE.Vector3 | null = null): void { this._apply('phase', at); }

  _apply(kind: FinishKind, at: THREE.Vector3 | null): void {
    const plan = planFeedback(kind, this.reduceMotion());
    const s = this.sinks();
    // 병합된 히트스톱(0.4초 안의 연속 처치)에는 카메라 펀치를 다시 붙이지 않는다: 화면이 계속 흔들리지 않게
    const fresh = plan.hitstop > 0 ? this.hitstop(plan.hitstop, kind) : true;
    if (plan.punch && fresh) s.rig?.punch?.(plan.punch);
    if (plan.fovKick) s.rig?.kickFov?.(plan.fovKick, plan.fovKickT);
    if (plan.rumble) s.rumble?.(plan.rumble[0], plan.rumble[1], plan.rumble[2]);
    if (plan.word && at) emit('fx:word', { text: plan.word.text, pos: _p.copy(at).setY(at.y + 1.5), kind: plan.word.kind, color: G.local ? G.teamHex[G.local.team] : undefined });
    emit('action:finish', { kind, pos: at ? at.clone() : null, pongJoy: plan.pongJoy });
  }
}
