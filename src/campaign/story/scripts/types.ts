// 장별 이야기 데이터의 형식(35번 R031·R032). 대본(DialogueScript)·패널(PanelScene)·기록을 id로 잇는다.
import type { DialogueScript } from '../dialogue.js';
import type { PanelScene } from '../panels.js';

export type DistrictId = 'tidewater' | 'crossmarket' | 'kelpline' | 'halyard' | 'saltpan' | 'lockgate' | 'terraces';

// 선택 기록(25번 9절: 지역마다 2개, 본문 80~150자, 기존 소품 이미지 한 장)
export interface StoryRecord { id: string; district: DistrictId; mission: string; title: string; body: string; image: string; note?: string }

// 임무 하나의 대본 연결. comms의 키는 목표 실행기(33번 T024)·보스(T045)가 부르는 사건 이름이다.
export interface MissionStory {
  intro: string; outro: string; death: string;
  comms?: Record<string, string>;
  panels?: Record<string, string>;
}

export interface ChapterStory {
  chapter: number;
  prologue?: string; epilogue?: string;
  missions: Record<string, MissionStory>;
  scripts: DialogueScript[]; panels: PanelScene[]; records: StoryRecord[];
}
