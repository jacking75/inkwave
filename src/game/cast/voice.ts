// 절차 합성 "찍찍 목소리"(35번 R012). 실제 녹음 없이 글자마다 짧은 포먼트 음절을 낸다.
// 음절: 톱니파 두 개(±8 cent) → 대역 통과 포먼트 2개 → 음량 포락선이다(audio.js의 vox()와 같은 구조를 여기서 만든다:
// audio.js는 이전 전 JavaScript라 손대지 않는다). 음절 길이 70~110 ms(인물별), 미세 피치 ±4%, 쉼표·마침표에서 90 ms 쉰다.
// 출력은 효과음 입력(sfxIn)에 −9 dB 버스로 섞여 효과음 볼륨 설정을 따르고 효과음 믹스를 덮지 않는다.
// 설정 koreanVoice가 꺼져 있으면 아무것도 내지 않는다. 대화 시스템(R026)의 초상 자막도 이 speak()를 쓴다.
import type { VoiceSpec } from './cast.js';

export const VOICE_BUS_DB = -9;
export const PAUSE_MS = 90, SPACE_MS = 40, MAX_SYLLABLES = 16;

// 글자열 → 음절 계획(순수): 각 항목은 { 소리 여부, 길이 ms }이다.
export interface Syllable { sound: boolean; ms: number }
export function planSyllables(text: string, spec: VoiceSpec, rng: () => number): Syllable[] {
  const out: Syllable[] = [];
  let n = 0;
  for (const ch of text) {
    if (/[,.…!?~—]/.test(ch)) { out.push({ sound: false, ms: PAUSE_MS }); continue; }
    if (/\s/.test(ch)) { out.push({ sound: false, ms: SPACE_MS }); continue; }
    if (n >= MAX_SYLLABLES) continue;
    n++;
    const [a, b] = spec.syllable;
    out.push({ sound: true, ms: a + (b - a) * rng() });
  }
  return out;
}

interface AudioLike { ctx: AudioContext | null; sfxIn?: AudioNode | null }

export class Voice {
  declare audio: () => AudioLike | null | undefined;
  declare enabled: () => boolean;
  declare bus: GainNode | null;

  constructor(audio: () => AudioLike | null | undefined, enabled: () => boolean) {
    this.audio = audio; this.enabled = enabled; this.bus = null;
  }

  // 반환: 말하는 시간 s(소리를 내지 않았으면 0)
  speak(text: string, spec: VoiceSpec): number {
    const A = this.audio();
    const ctx = A?.ctx;
    if (!ctx || !A?.sfxIn || spec.kind === 'none' || !this.enabled() || ctx.state !== 'running') return 0;
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = Math.pow(10, VOICE_BUS_DB / 20); this.bus.connect(A.sfxIn); }
    const plan = planSyllables(text, spec, Math.random);
    let t = ctx.currentTime + 0.02;
    const t0 = t;
    let i = 0;
    for (const s of plan) {
      if (s.sound) this._syllable(ctx, spec, t, s.ms / 1000, i++);
      t += s.ms / 1000;
    }
    return t - t0;
  }

  _syllable(ctx: AudioContext, spec: VoiceSpec, t: number, dur: number, i: number): void {
    const bus = this.bus!;
    // 문장 안의 억양: 첫 음절이 조금 높고 끝으로 갈수록 내려간다 + 미세 피치 ±4%
    const f = spec.f0 * (1 + (Math.random() * 2 - 1) * 0.04) * (i === 0 ? 1.06 : 1 - Math.min(0.08, i * 0.008));
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(spec.kind === 'vocoder' ? 0.5 : 0.7, t + Math.min(0.012, dur * 0.2));
    env.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.18);
    let out: AudioNode = bus;
    if (spec.kind === 'radio') {   // 틸: 무전 대역(300~3400 Hz)
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
      hp.connect(lp); lp.connect(bus); out = hp;
    }
    env.connect(out);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    for (const [fc, q] of spec.formants) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fc; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 1.4;
      mix.connect(bp); bp.connect(g); g.connect(env);
    }
    const type: OscillatorType = spec.kind === 'vocoder' ? 'square' : 'sawtooth';
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (spec.kind === 'squeak' ? 1.12 : 0.97), t + dur);   // 찍찍: 끝이 살짝 올라간다
      o.connect(mix); o.start(t); o.stop(t + dur + 0.08);
    }
  }
}
