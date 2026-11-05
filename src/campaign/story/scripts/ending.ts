// 엔딩(35번 R032): 7개 지역의 색이 차례로 돌아오는 지도 연출(항구 지도 화면이 colorReturn을 차례로 채운다) →
// 작업장 귀환 패널 5컷 → 아카이브의 "귀환 확인. 비상 회수 종료."이다. 패널 기준점은 작업장(플레이어 자리)이다.
import type { DialogueScript } from '../dialogue.js';
import type { PanelScene } from '../panels.js';

// 지도 연출 순서(지역 하나당 ENDING_MAP.stepMs)
export const ENDING_MAP = { order: ['tidewater', 'crossmarket', 'kelpline', 'halyard', 'saltpan', 'lockgate', 'terraces'] as const, stepMs: 900 };

export const ENDING_SCRIPTS: DialogueScript[] = [
  { id: 'ending.archive', kind: 'outro', blocksInput: true, lines: [
    { speaker: 'archive', text: '귀환 확인. 비상 회수 종료.', voice: 'none', durationMs: 3200 },
    { speaker: 'teal', text: '모든 지역이 응답했어. 돌아온 사람, 하나도 빠짐없이.', mood: 'joy', voice: 'radio' },
    { speaker: 'mora', text: '이번엔 아무것도 지우지 않았어.', mood: 'smile' },
    { speaker: 'pong', text: '…집에 가자!', mood: 'joy' },
  ] },
];

export const ENDING_PANELS: PanelScene[] = [
  { id: 'ending.return', skippable: true, music: 'workshop', shots: [
    { id: 'r1', durationMs: 4800, frame: 'full', transition: 'inkSplash',
      camera: { from: [0, 2.6, 8], to: [0, 2.2, 6.5], look: [0, 1.0, 0], fov: 46 },
      actors: [{ id: 'player', at: [0, 0, 1.5], yaw: Math.PI, pose: 'idle' }],
      caption: '새벽, 항구의 모든 색이 돌아왔다.' },
    { id: 'r2', durationMs: 4600, frame: 'left', transition: 'wipe',
      camera: { from: [-0.4, 1.5, 2.6], look: [-1.4, 1.2, 0.6], fov: 32 },
      actors: [{ id: 'mora', at: [-1.4, 0, 0.6], yaw: 1.0, pose: 'wave', mood: 'joy' }],
      line: { speaker: '모라', text: '어서 와. 작업장은 열려 있어.' } },
    { id: 'r3', durationMs: 4600, frame: 'right', transition: 'wipe',
      camera: { from: [1.6, 1.5, 2.6], look: [1.4, 1.2, 0.4], fov: 32 },
      actors: [{ id: 'teal', at: [1.4, 0, 0.4], yaw: -0.9, pose: 'listen', mood: 'smile' }],
      line: { speaker: '틸', text: '시장도 부두도 염전도, 다 응답해.' } },
    { id: 'r4', durationMs: 4400, frame: 'full', transition: 'cut',
      camera: { from: [0.2, 1.7, 4.2], look: [0, 1.1, 0.6], fov: 40 },
      actors: [{ id: 'mora', at: [-1.2, 0, 0.6], yaw: 0.8, pose: 'idle', mood: 'smile' }, { id: 'teal', at: [1.2, 0, 0.5], yaw: -0.8, pose: 'idle', mood: 'smile' }, { id: 'player', at: [0, 0, 1.4], yaw: Math.PI, pose: 'salute', mood: 'joy' }],
      line: { speaker: '퐁', text: '우리가 해냈어!' } },
    { id: 'r5', durationMs: 5200, frame: 'full', transition: 'inkSplash',
      camera: { from: [0, 3.2, 9], to: [0, 3.8, 11], look: [0, 1.4, 0], fov: 48 },
      actors: [{ id: 'mora', at: [-1.2, 0, 0.6], yaw: 0.8, pose: 'wave' }, { id: 'teal', at: [1.2, 0, 0.5], yaw: -0.8, pose: 'wave' }, { id: 'player', at: [0, 0, 1.4], yaw: Math.PI, pose: 'wave' }],
      caption: '되찾는 물결 — 끝' },
  ] },
];
