// 2~7장 대본을 짧은 표기에서 ChapterStory로 만든다(35번 R032). 1장(ch1.ts)은 8절 콘티를 그대로 적었고,
// 2~7장은 같은 구조(임무별 시작·완료·사망 + 통신, 중간보스 1컷, 보스 등장 3컷, 기록 2개)를 이 도우미로 만든다.
// 보스 등장 3컷은 25번 8절 규칙(넓은 구도 → 공격에 쓰는 부분 근접 → 플레이어 뒤 시점 복귀)이다.
import type { DialogueLine, DialogueScript, Mood } from '../dialogue.js';
import type { PanelScene } from '../panels.js';
import type { ChapterStory, DistrictId, MissionStory, StoryRecord } from './types.js';

// [화자, 문장, 기분?]
export type L = [speaker: string, text: string, mood?: Mood];
const line = ([speaker, text, mood]: L): DialogueLine => ({
  speaker, text, mood,
  voice: speaker === 'teal' ? 'radio' : speaker === 'archive' ? 'none' : speaker === 'boss' ? 'vocoder' : undefined,
  portrait: speaker === 'boss' ? 'none' : undefined,
});

export interface MissionText { id: string; intro: L[]; outro: L[]; death: L[]; comms?: Record<string, L[]> }
export interface ChapterText {
  chapter: number; district: DistrictId;
  midBoss: { name: string; caption: string; word: string; actor: string };   // actor: ECHO_LEADERS id
  boss: { name: string; say: string | null; word: string; actor: string | null };   // null = 인간형이 아닌 보스(장치·소라게)
  missions: [MissionText, MissionText, MissionText];
  records: [Omit<StoryRecord, 'district'>, Omit<StoryRecord, 'district'>];
}

export function buildChapter(c: ChapterText): ChapterStory {
  const scripts: DialogueScript[] = [];
  const missions: Record<string, MissionStory> = {};
  for (const m of c.missions) {
    scripts.push({ id: `${m.id}.intro`, kind: 'intro', blocksInput: true, lines: m.intro.map(line) });
    scripts.push({ id: `${m.id}.outro`, kind: 'outro', blocksInput: true, lines: m.outro.map(line) });
    scripts.push({ id: `${m.id}.death`, kind: 'death', blocksInput: false, lines: m.death.map(line) });
    const comms: Record<string, string> = {};
    for (const [k, ls] of Object.entries(m.comms ?? {})) {
      const id = `${m.id}.${k}`;
      scripts.push({ id, kind: k === 'boss' || k === 'phase' || k === 'weak' ? 'boss' : k.startsWith('record') ? 'record' : 'comm', blocksInput: false, lines: ls.map(line) });
      comms[k] = id;
    }
    missions[m.id] = { intro: `${m.id}.intro`, outro: `${m.id}.outro`, death: `${m.id}.death`, comms };
  }
  const [, m2, m3] = c.missions;
  const midId = `${m2.id}.midBoss`, bossId = `${m3.id}.bossIntro`;
  missions[m2.id].panels = { midBoss: midId };
  missions[m3.id].panels = { bossIntro: bossId };
  if (c.boss.say) {
    scripts.push({ id: `${m3.id}.boss`, kind: 'boss', blocksInput: false, lines: [line(['boss', c.boss.say])] });
    missions[m3.id].comms = { ...missions[m3.id].comms, boss: `${m3.id}.boss` };
  }
  const bossActor = c.boss.actor;
  const panels: PanelScene[] = [
    { id: midId, skippable: true, shots: [{
      id: 'm1', durationMs: 4200, frame: 'full', transition: 'cut',
      camera: { from: [2.5, 1.6, 5.5], look: [0, 1.0, 0], fov: 38 },
      actors: [{ id: c.midBoss.actor, at: [0, 0, 0], yaw: 0.3, pose: 'work' }],
      caption: `${c.midBoss.name} — ${c.midBoss.caption}`, word: { text: c.midBoss.word, at: [0.6, 1.6, 0] },
    }] },
    { id: bossId, skippable: true, shots: [
      { id: 'b1', durationMs: 3600, frame: 'full', transition: 'cut',
        camera: { from: [4.5, 2.8, -9.5], to: [3.5, 2.4, -8], look: [0, 1.4, 0], fov: 42 },
        actors: bossActor ? [{ id: bossActor, at: [0, 0, 0], yaw: Math.PI, pose: 'idle', mood: 'determined' }] : [],
        caption: c.boss.name },
      { id: 'b2', durationMs: 2600, frame: 'right', transition: 'wipe',
        camera: { from: [0.9, 1.3, -1.8], look: [0.2, 1.1, 0], fov: 30 },
        actors: bossActor ? [{ id: bossActor, at: [0, 0, 0], yaw: Math.PI, pose: 'point', mood: 'determined' }] : [],
        word: { text: c.boss.word, at: [0.4, 1.4, -0.6] } },
      { id: 'b3', durationMs: 3200, frame: 'full', transition: 'cut',
        camera: { from: [0.6, 1.8, -10.5], look: [0, 1.2, 0], fov: 50 },
        actors: [{ id: 'player', at: [0.3, 0, -8.5], yaw: 0, pose: 'idle' }, ...(bossActor ? [{ id: bossActor, at: [0, 0, 0] as [number, number, number], yaw: Math.PI, pose: 'idle' as const }] : [])],
        line: c.boss.say ? { speaker: c.boss.name, text: c.boss.say } : undefined },
    ] },
  ];
  return {
    chapter: c.chapter, missions, scripts, panels,
    records: c.records.map((r) => ({ ...r, district: c.district })),
  };
}
