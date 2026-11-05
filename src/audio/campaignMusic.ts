// 적응형 음악 레이어(35번 R024). 캠페인 전투 곡 「되찾는 물결」(tide_returns, 128 BPM, D 도리안)과 작업장 곡
// 「작업장의 오후」(workshop, 느린 3/4)를 기존 합성 엔진(music.js)에 등록하고, 물결 단계(action:wave)에 따라 레이어를 켠다.
//
// 레이어 4개: 0 베이스+패드 / 1 +드럼 / 2 +리드 플럭(아르페지오·벨 리드) / 3 +코러스(화음 리드·키 스탭·크래시)이다.
// 전환은 다음 2박 경계에서 20 ms 선형 페이드이다(클릭 노이즈 방지). 스케줄은 music.js의 워커 타이머가 하므로
// 화면 프레임 제한(메뉴 30 fps)과 무관하다. music.js는 고치지 않고 곡 등록(SONGS)과 재생 중 Player의 그룹 게인만 쓴다.
//
// 3/4 곡: 엔진의 마디는 16스텝(4/4)이라 3/4 네 마디(48스텝)를 엔진 마디 세 개에 나눠 적는다. 화음 칸은 4스텝 단위이므로
// 3/4 마디 경계(0·12·24·36스텝)가 칸 경계와 맞는다.
import { SONGS } from './music.js';

export type WaveLevel = 0 | 1 | 2 | 3;
export const LAYER_FADE = 0.02;          // s
export const LAYER_BEATS = 2;            // 전환 경계(박)
const GROUPS = ['kick', 'snare', 'hats', 'bass', 'chords', 'pad', 'arp', 'lead', 'lead2', 'fx'] as const;
type Group = typeof GROUPS[number];

export const WAVE_LAYERS: Record<WaveLevel, readonly Group[]> = {
  0: ['bass', 'pad'],
  1: ['bass', 'pad', 'kick', 'snare', 'hats'],
  2: ['bass', 'pad', 'kick', 'snare', 'hats', 'arp', 'lead'],
  3: ['bass', 'pad', 'kick', 'snare', 'hats', 'arp', 'lead', 'lead2', 'chords', 'fx'],
};

// 단계 → 그룹별 켬(1)/끔(0)
export function layerMask(level: WaveLevel): Record<Group, 0 | 1> {
  const on = new Set<Group>(WAVE_LAYERS[level]);
  return Object.fromEntries(GROUPS.map((g) => [g, on.has(g) ? 1 : 0])) as Record<Group, 0 | 1>;
}

// now 이후의 첫 beats박 경계(곡 시작 t0 기준). 이미 경계 위면 그 시각이다.
export function nextBoundary(t0: number, beat: number, now: number, beats = LAYER_BEATS): number {
  const span = beat * beats;
  return t0 + Math.max(0, Math.ceil((now - t0) / span - 1e-9)) * span;
}

// ------------------------------------------------------------------------------------------------ 곡
const TIDE_A_LEAD =
  'D5/2 F5/2 A5/4 G5/2 F5/2 E5/2 D5/2 | B4/2 D5/2 G5/4 F5/2 D5/2 B4/4 | C5/2 E5/2 A5/3 G5/1 E5/4 C5/4 | E5/4 G5/4 B5/6 r/2 | ' +
  'D5/2 F5/2 A5/4 C6/2 B5/2 A5/2 F5/2 | G5/3 F5/1 D5/2 B4/2 D5/4 G5/4 | A5/2 C6/2 E6/4 D6/2 C6/2 A5/4 | G5/4 E5/4 D5/8';
const TIDE_B_LEAD =
  'A5/4 C6/4 F6/4 E6/4 | D6/3 B5/3 G5/2 E5/4 G5/4 | F5/2 A5/2 D6/4 C6/2 A5/2 F5/4 | G5/6 F5/2 D5/4 B4/4 | ' +
  'A5/4 C6/4 F6/4 A6/4 | G6/3 E6/3 B5/2 G5/4 E5/4 | F5/2 A5/2 D6/2 F6/2 E6/4 D6/4 | C#6/4 A5/4 E5/4 A5/4';

export const TIDE_RETURNS = {
  name: '되찾는 물결', bpm: 128, swing: 0.08, key: 'D dorian', pump: 0.15,
  inst: { bass: 'funk', chords: 'keys', lead: 'bell', lead2: 'soft', arp: 'pluck' }, keysLo: 57, bassLo: 28,
  mix: { kick: 0.55, snare: 0.42, hats: 0.18, bass: 0.4, chords: 0.22, pad: 0.16, arp: 0.14, lead: 0.26, lead2: 0.12, fx: 0.2 },
  sections: {
    intro: { bars: 2, chords: ['Dm7', 'G7'], pad: true, bass: 'R-------R-------', riser: 1 },
    A: {
      bars: 8, chords: ['Dm7', 'G7', 'Am7', 'Cmaj7'], lead: TIDE_A_LEAD, pad: true,
      drums: { k: 'X...x...X...x...', s: '....X.......X...', h: 'x.c.x.c.x.c.x.c.' },
      bass: 'R-.R.5-.R-.O.5.n',
      arp: { rate: 2, pattern: 'updown', oct: 2, lo: 62 },
      stabs: 'x..x..x...x..x..',
    },
    B: {
      bars: 8, crash: true, harmony: true, chords: ['Fmaj7', 'Em7', 'Dm7', 'G7', 'Fmaj7', 'Em7', 'Dm7', 'A7'], lead: TIDE_B_LEAD, pad: true,
      drums: { k: 'X..x..x.X...x...', s: '....X.......X..g', h: 'x.o.x.c.x.o.x.cc' },
      fills: { s: '....X.......X.xx' },
      bass: 'R.RO.R5.R.RO.53n',
      arp: { rate: 2, pattern: 'up', oct: 2, lo: 62 },
      stabs: 'x..x..x...x..x..',
    },
  },
  order: ['intro', 'A', 'B'], loopFrom: 1,
  // 엔진의 강도 곡선(LAYERS)은 쓰지 않는다: 강도 1에서 모든 그룹이 1이고 레이어는 이 모듈이 게인으로 정한다
  layers: {},
};

// 3/4: 엔진 마디 3개 = 3/4 네 마디. 화음 칸 4스텝.
const W_CHORDS = [
  'Fmaj7 Fmaj7 Fmaj7 Dm7', 'Dm7 Dm7 Gm7 Gm7', 'Gm7 C7 C7 C7',
  'Fmaj7 Fmaj7 Fmaj7 Am7', 'Am7 Am7 Bbmaj7 Bbmaj7', 'Bbmaj7 C7 C7 C7',
];
const W_LEAD = 'A4/8 C5/4 F5/8 E5/4 D5/12 C5/4 D5/4 E5/4 F5/8 A5/4 G5/8 E5/4 D5/8 F5/4 E5/12';
export const WORKSHOP = {
  name: '작업장의 오후', bpm: 84, swing: 0.1, key: 'F major (3/4)', pump: 0,
  inst: { bass: 'funk', chords: 'keys', lead: 'soft', arp: 'pluck' }, keysLo: 55, bassLo: 29,
  mix: { kick: 0.3, snare: 0.2, hats: 0.12, bass: 0.34, chords: 0.2, pad: 0.12, lead: 0.24, arp: 0.08 },
  sections: {
    A: {
      bars: 12, chords: W_CHORDS, lead: W_LEAD, pad: true,
      drums: {
        k: ['X...........X...', '........X.......', '....X...........'],
        sh: ['x...c...c...x...', 'c...c...x...c...', 'c...x...c...c...'],
      },
      bass: ['R---5---3---R---', '5---3---R---5---', '3---R---5---3---'],
    },
  },
  order: ['A'], loopFrom: 0,
};

let registered = false;
export function registerCampaignSongs(): void {
  if (registered) return;
  registered = true;
  const songs = SONGS as unknown as Record<string, unknown>;
  songs.tide_returns = TIDE_RETURNS;
  songs.workshop = WORKSHOP;
}

// ------------------------------------------------------------------------------------------------ 실행
// music.js의 엔진·Player 중 이 모듈이 쓰는 부분
interface PlayerLike { id: string; t0: number; song: { bpm: number }; groups: Record<string, GainNode>; mix: Record<string, number>; disposed: boolean }
export interface MusicLike {
  ctx: BaseAudioContext | null; current: unknown;
  remap: ((t: string) => string | undefined) | null;
  play(track: string | null, opts?: { fade?: number }): void;
  now(): number;
}

export const CAMPAIGN_TRACK = 'tide_returns';

export class CampaignMusic {
  declare music: MusicLike; declare level: WaveLevel;
  declare gains: Partial<Record<Group, number>>; declare pending: Partial<Record<Group, { at: number; from: number }>>;
  declare remap: ((t: string) => string | undefined) & { _campaign?: boolean };
  declare player: PlayerLike | null;

  constructor(music: MusicLike) {
    registerCampaignSongs();
    this.music = music; this.level = 0; this.gains = {}; this.pending = {}; this.player = null;
    // 대전 흐름이 요청하는 'battle'·'battle_final'을 캠페인 곡으로 바꾼다(보스 디렉터가 먼저 잡았으면 양보)
    this.remap = Object.assign((t: string) => (t === 'battle' || t === 'battle_final' ? CAMPAIGN_TRACK : undefined), { _campaign: true });
    if (!music.remap) music.remap = this.remap;
  }

  // 재생 중인 캠페인 곡 Player(곡이 바뀌었으면 새로 잡고 현재 단계 게인을 즉시 적용한다)
  _player(): PlayerLike | null {
    const cur = this.music.current as PlayerLike | null;
    if (!cur || cur.id !== CAMPAIGN_TRACK || cur.disposed || !cur.groups) { this.player = null; return null; }
    if (cur !== this.player) {
      this.player = cur; this.gains = {}; this.pending = {};
      const mask = layerMask(this.level), now = this.music.now();
      for (const g of GROUPS) {
        const p = cur.groups[g]?.gain; if (!p) continue;
        const v = (cur.mix[g] ?? 0) * mask[g];
        p.cancelScheduledValues(now); p.setValueAtTime(v, now);
        this.gains[g] = v;
      }
    }
    return cur;
  }

  // 매 프레임: 곡이 새로 시작됐으면 현재 단계를 바로 건다
  tick(): void { this._player(); }

  start(fade = 1): void { this.music.play(CAMPAIGN_TRACK, { fade }); this._player(); }

  // 물결 단계 변화: 다음 2박 경계에서 20 ms 페이드로 레이어를 켜고 끈다. 반환: 적용 시각(재생 중이 아니면 null)
  setLevel(level: WaveLevel): number | null {
    this.level = level;
    const pl = this._player();
    if (!pl) return null;
    const ctxNow = this.music.now(), beat = 60 / pl.song.bpm;
    const at = nextBoundary(pl.t0, beat, ctxNow + 0.03);
    const mask = layerMask(level);
    for (const g of GROUPS) {
      const p = pl.groups[g]?.gain; if (!p) continue;
      const to = (pl.mix[g] ?? 0) * mask[g];
      const pend = this.pending[g];
      // 같은 경계에 이미 예약한 전환이 있으면 그 전환의 시작값에서 다시 잡는다
      const from = pend && pend.at >= at - 1e-6 ? pend.from : (this.gains[g] ?? to);
      if (Math.abs(from - to) < 1e-6 && !(pend && pend.at >= at - 1e-6)) { this.gains[g] = to; continue; }
      p.cancelScheduledValues(at); p.setValueAtTime(from, at); p.linearRampToValueAtTime(to, at + LAYER_FADE);
      this.pending[g] = { at, from }; this.gains[g] = to;
    }
    return at;
  }

  dispose(fade = 1): void {
    if (this.music.remap === this.remap) this.music.remap = null;
    const cur = this.music.current as PlayerLike | null;
    if (cur && cur.id === CAMPAIGN_TRACK) this.music.play(null, { fade });
    this.player = null;
  }
}
