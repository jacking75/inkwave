// 이야기 데이터 묶음(35번 R031·R032): 1~7장 + 엔딩의 대본·패널·기록을 한곳에서 찾는다.
import type { DialogueScript } from '../dialogue.js';
import type { PanelScene } from '../panels.js';
import type { ChapterStory, StoryRecord } from './types.js';
import { CH1 } from './ch1.js';
import { CH2 } from './ch2.js';
import { CH3 } from './ch3.js';
import { CH4 } from './ch4.js';
import { CH5 } from './ch5.js';
import { CH6 } from './ch6.js';
import { CH7 } from './ch7.js';
import { ENDING_SCRIPTS, ENDING_PANELS } from './ending.js';

export const CHAPTERS: readonly ChapterStory[] = [CH1, CH2, CH3, CH4, CH5, CH6, CH7];
export const ALL_SCRIPTS: readonly DialogueScript[] = [...CHAPTERS.flatMap((c) => c.scripts), ...ENDING_SCRIPTS];
export const ALL_PANELS: readonly PanelScene[] = [...CHAPTERS.flatMap((c) => c.panels), ...ENDING_PANELS];
export const ALL_RECORDS: readonly StoryRecord[] = CHAPTERS.flatMap((c) => c.records);

const scriptById = new Map(ALL_SCRIPTS.map((s) => [s.id, s]));
const panelById = new Map(ALL_PANELS.map((s) => [s.id, s]));
export const getScript = (id: string): DialogueScript | null => scriptById.get(id) ?? null;
export const getPanels = (id: string): PanelScene | null => panelById.get(id) ?? null;
export function missionStory(missionId: string) {
  for (const c of CHAPTERS) { const m = c.missions[missionId]; if (m) return m; }
  return null;
}

// 연결 검사: 장면 순서가 가리키는 id가 모두 있는지(대본 줄 길이는 validateScripts)
export function validateLinks(): string[] {
  const errs: string[] = [];
  for (const c of CHAPTERS) {
    if (c.prologue && !panelById.has(c.prologue)) errs.push(`${c.chapter}장 프롤로그 ${c.prologue}`);
    if (c.epilogue && !panelById.has(c.epilogue)) errs.push(`${c.chapter}장 에필로그 ${c.epilogue}`);
    for (const [mid, m] of Object.entries(c.missions)) {
      for (const id of [m.intro, m.outro, m.death, ...Object.values(m.comms ?? {})]) if (!scriptById.has(id)) errs.push(`${mid}: 대본 ${id}`);
      for (const id of Object.values(m.panels ?? {})) if (!panelById.has(id)) errs.push(`${mid}: 패널 ${id}`);
    }
    if (c.records.length !== 2) errs.push(`${c.chapter}장 기록 ${c.records.length}개`);
  }
  return errs;
}
