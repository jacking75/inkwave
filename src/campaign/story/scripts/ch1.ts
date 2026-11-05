// 1장 「타이드워터 광장」 대본·패널 콘티·기록(35번 R031, 8절). 데이터만 둔다. 줄 길이(2줄×22자)는 validateScripts,
// 패널 형식은 validatePanels가 검사한다. 대사 문장은 8절과 같다(바꾸면 8절과 스테이지 문서 3·4·5번의 대사 절도 고친다).
// 패널 좌표는 장면 기준점(작업장 세트·광장·보스장의 기준 위치) 기준 지역 좌표 m이다(panels.ts).
import type { DialogueScript } from '../dialogue.js';
import type { PanelScene } from '../panels.js';
import type { StoryRecord, ChapterStory } from './types.js';

const S = (id: string, kind: DialogueScript['kind'], blocksInput: boolean, lines: DialogueScript['lines']): DialogueScript => ({ id, kind, blocksInput, lines });

export const CH1_SCRIPTS: DialogueScript[] = [
  // 1-1 멈춘 시계 아래
  S('1-1.intro', 'intro', true, [
    { speaker: 'teal', text: '들려? 광장 수신기는 죽었고 중계기 둘이 남았어.', mood: 'focus', voice: 'radio' },
    { speaker: 'teal', text: '정면은 보고 있지만 옆 벽은 비어 있어.', mood: 'focus', voice: 'radio' },
    { speaker: 'pong', text: '잉크를 칠하면 헤엄칠 수 있대. 해 보자!', mood: 'joy' },
  ]),
  S('1-1.relayA', 'comm', false, [
    { speaker: 'pong', text: '색이… 돌아온다!', mood: 'surprise' },
    { speaker: 'mora', text: '그게 네가 만든 길이야.', mood: 'smile', voice: 'radio' },
  ]),
  S('1-1.firstKill', 'comm', false, [
    { speaker: 'pong', text: '미안해… 근데 저건 사람이 아니래.', mood: 'worry' },
    { speaker: 'teal', text: '잔향이야. 기록이 남긴 동작일 뿐이야.', mood: 'focus', voice: 'radio' },
  ]),
  S('1-1.death', 'death', false, [
    { speaker: 'teal', text: '사격병의 정면 사격이야. 옆 벽은 비어 있어.', mood: 'worry', voice: 'radio' },
    { speaker: 'pong', text: '다시 가자. 이번엔 옆으로!', mood: 'determined' },
  ]),
  S('1-1.relayB', 'comm', false, [
    { speaker: 'teal', text: '광장 수신 복구. 그런데… 명령이 하나 더 들어와.', mood: 'worry', voice: 'radio' },
    { speaker: 'archive', text: '편차 회수. 민간 기록 포함.', voice: 'none' },
  ]),
  S('1-1.outro', 'outro', true, [
    { speaker: 'mora', text: '새 부품보다 네가 만든 길이 먼저였구나.', mood: 'smile' },
    { speaker: 'mora', text: '민간 기록까지 회수한다고? 그건 고장이 아니야.', mood: 'worry' },
    { speaker: 'pong', text: '다음은 시장 쪽 기록이래. 가자!', mood: 'joy' },
  ]),
  // 1-2 지워지는 발자국
  S('1-2.intro', 'intro', true, [
    { speaker: 'teal', text: '두 기록이 고지 위에 있어. 누가 먼저 지우고 있어.', mood: 'focus', voice: 'radio' },
    { speaker: 'teal', text: '청소반장이 돌면 등이 비어. 벽으로 돌아가.', mood: 'focus', voice: 'radio' },
  ]),
  S('1-2.record1', 'record', false, [{ speaker: 'pong', text: '사람 목소리야. 지우면 안 되는 거잖아.', mood: 'worry' }]),
  S('1-2.record2', 'record', false, [{ speaker: 'teal', text: '이름들이야. 조율망은 이걸 오염이라 부르고 있어.', mood: 'worry', voice: 'radio' }]),
  S('1-2.cleanerDown', 'comm', false, [
    { speaker: 'pong', text: '뒤를 잡았어! 봤지?', mood: 'joy' },
    { speaker: 'teal', text: '대장이 중앙 장치를 잠갔어. 다음이 진짜야.', mood: 'determined', voice: 'radio' },
  ]),
  S('1-2.death', 'death', false, [
    { speaker: 'teal', text: '청소반장의 회전 청소야. 돌고 난 뒤 등을 노려.', mood: 'worry', voice: 'radio' },
    { speaker: 'pong', text: '벽으로 돌아가자!', mood: 'determined' },
  ]),
  S('1-2.outro', 'outro', true, [
    { speaker: 'mora', text: '지워지는 건 발자국이 아니라 사람이야.', mood: 'worry' },
    { speaker: 'mora', text: '바리는 우산으로 앞만 막아. 뒤를 봐.', mood: 'determined' },
  ]),
  // 1-3 광장의 통행금지
  S('1-3.entry', 'comm', false, [
    { speaker: 'teal', text: '통행대장 바리. 통행 기록을 초기화하겠대.', mood: 'worry', voice: 'radio' },
    { speaker: 'pong', text: '초기화라니… 우리 발자국도?', mood: 'worry' },
  ]),
  S('1-3.boss', 'boss', false, [{ speaker: 'boss', text: '통행 기록을 초기화한다.', voice: 'vocoder', portrait: 'none' }]),
  S('1-3.phase', 'boss', false, [
    { speaker: 'teal', text: '지나간 자리에 잉크를 남겨. 도색병도 불렀어.', mood: 'focus', voice: 'radio' },
    { speaker: 'pong', text: '길이 더러워져! 먼저 치우자.', mood: 'surprise' },
  ]),
  S('1-3.weak', 'boss', false, [{ speaker: 'pong', text: '등! 등이 열렸어!', mood: 'surprise', cue: { word: '지금!' } }]),
  S('1-3.death', 'death', false, [
    { speaker: 'teal', text: '우산 방패 발사야. 옆으로 돌아 등을 봐.', mood: 'worry', voice: 'radio' },
    { speaker: 'pong', text: '한 번 더! 이번엔 뒤로!', mood: 'determined' },
  ]),
  S('1-3.outro', 'outro', true, [
    { speaker: 'mora', text: '서명 장비는 챙겼어. 시장 수신 기록에 같은 명령 흔적이 있대.', mood: 'focus' },
    { speaker: 'teal', text: '크로스로드가 열렸어. 상인들은 대피했대… 기록만 남기고.', mood: 'worry', voice: 'radio' },
    { speaker: 'pong', text: '2장이다! 근데 잠깐만 쉬고 가면 안 돼?', mood: 'tired' },
  ]),
];

// 패널 콘티(8.1·8.3·8.4절). 기준점: 프롤로그·에필로그 = 작업장(플레이어 자리), 청소반장·보스 = 보스장 중앙
export const CH1_PANELS: PanelScene[] = [
  {
    id: 'ch1.prologue', skippable: true, music: 'workshop',
    shots: [
      { id: 'p1', durationMs: 6000, frame: 'full', transition: 'cut',
        camera: { from: [3.2, 2.2, 6.5], to: [2.4, 2.0, 5.6], look: [-0.6, 1.0, 0], fov: 42 },
        actors: [{ id: 'mora', at: [-1.6, 0, 0.6], yaw: 0.9, pose: 'work', mood: 'focus' }, { id: 'player', at: [0.6, 0, 0], yaw: -0.4, pose: 'idle' }],
        caption: '폭풍이 지나간 아침, 항구는 색을 잃었다.' },
      { id: 'p2', durationMs: 6500, frame: 'left', transition: 'wipe',
        camera: { from: [-0.4, 1.5, 2.6], look: [-1.6, 1.25, 0.6], fov: 32 },
        actors: [{ id: 'mora', at: [-1.6, 0, 0.6], yaw: 1.2, pose: 'point', mood: 'focus' }],
        line: { speaker: '모라', text: '광장 중계기 두 개야. 잉크를 넣으면 깨어날 거야.' } },
      { id: 'p3', durationMs: 5500, frame: 'right', transition: 'wipe',
        camera: { from: [0.9, 1.45, 2.4], look: [0.6, 1.2, 0], fov: 32 },
        actors: [{ id: 'player', at: [0.6, 0, 0], yaw: 0.2, pose: 'salute', mood: 'determined' }],
        line: { speaker: '퐁', text: '첫 임무! 떨리지? 나도 떨려!' } },
      { id: 'p4', durationMs: 6000, frame: 'full', transition: 'inkSplash',
        camera: { from: [0.4, 1.7, -2.6], to: [0.4, 1.9, -3.4], look: [0.4, 1.3, 8], fov: 46 },
        actors: [{ id: 'player', at: [0.4, 0, 0], yaw: 0, pose: 'idle' }],
        caption: '1장 — 멈춘 시계 아래' },
    ],
  },
  {
    id: '1-2.cleaner', skippable: true,
    shots: [
      { id: 'c1', durationMs: 4200, frame: 'full', transition: 'cut',
        camera: { from: [2.5, 1.6, 5.5], look: [0, 1.0, 0], fov: 38 },
        actors: [{ id: 'sweeper', at: [0, 0, 0], yaw: 0.3, pose: 'work' }],
        caption: '청소반장 — 바닥을 지우는 동작만 남았다.', word: { text: '쿠궁', at: [0.6, 1.6, 0] } },
    ],
  },
  {
    id: '1-3.bossIntro', skippable: true,
    shots: [
      { id: 'b1', durationMs: 3600, frame: 'full', transition: 'cut',
        camera: { from: [4.5, 2.6, -9], to: [3.5, 2.2, -7.5], look: [0, 1.2, 0], fov: 40 },
        actors: [{ id: 'bari', at: [0, 0, 0], yaw: Math.PI, pose: 'idle', mood: 'determined' }],
        caption: '통행대장 바리' },
      { id: 'b2', durationMs: 2600, frame: 'right', transition: 'wipe',
        camera: { from: [0.9, 1.3, -1.8], look: [0.2, 1.1, 0], fov: 30 },
        actors: [{ id: 'bari', at: [0, 0, 0], yaw: Math.PI, pose: 'point', mood: 'determined' }],
        word: { text: '철컥', at: [0.4, 1.4, -0.6] } },
      { id: 'b3', durationMs: 3400, frame: 'full', transition: 'cut',
        camera: { from: [0.6, 1.8, -10.5], look: [0, 1.2, 0], fov: 50 },
        actors: [{ id: 'player', at: [0.3, 0, -8.5], yaw: 0, pose: 'idle' }, { id: 'bari', at: [0, 0, 0], yaw: Math.PI, pose: 'idle' }],
        line: { speaker: '바리', text: '통행 기록을 초기화한다.' } },
    ],
  },
  {
    id: 'ch1.epilogue', skippable: true, music: 'workshop',
    shots: [
      { id: 'e1', durationMs: 4200, frame: 'full', transition: 'cut',
        camera: { from: [3, 1.8, 6], look: [0, 1.0, 0], fov: 40 },
        actors: [{ id: 'bari', at: [0, 0, 0], yaw: 0.4, pose: 'kneel' }],
        caption: '이동 금지 표식이 귀환 표식으로 바뀌었다.' },
      { id: 'e2', durationMs: 4200, frame: 'left', transition: 'inkSplash',
        camera: { from: [0, 2.0, -6], to: [0, 3.0, -6.5], look: [0, 6, 8], fov: 44 },
        actors: [{ id: 'player', at: [0, 0, -4], yaw: 0, pose: 'wave', mood: 'joy' }],
        caption: '광장의 시계가 다시 움직였다.' },
      { id: 'e3', durationMs: 5200, frame: 'right', transition: 'wipe',
        camera: { from: [0.2, 1.6, 3.2], look: [-0.8, 1.2, 0], fov: 36 },
        actors: [{ id: 'mora', at: [-1.2, 0, 0.4], yaw: 0.8, pose: 'work', mood: 'smile' }, { id: 'teal', at: [1.4, 0, 0.2], yaw: -0.6, pose: 'listen', mood: 'focus' }],
        line: { speaker: '모라', text: '돌아오면 작업장은 열려 있을 거야.' } },
      { id: 'e4', durationMs: 4400, frame: 'full', transition: 'inkSplash',
        camera: { from: [0, 2.2, 5], look: [0, 1.0, 0], fov: 46 },
        actors: [{ id: 'player', at: [0, 0, 0], yaw: Math.PI, pose: 'salute', mood: 'determined' }],
        caption: '2장 — 크로스로드 시장' },
    ],
  },
];

export const CH1_RECORDS: StoryRecord[] = [
  { id: 'rec.tidewater.1', district: 'tidewater', mission: '1-1', title: '광장의 첫 방송', image: '시계탑 소품',
    body: '오늘부터 광장 시계탑에서 아침 방송을 시작합니다. 날씨, 배 시간, 그리고 잃어버린 물건 찾기. 작은 항구지만 목소리는 크게.',
    note: '시계 태엽은 모라네 가게에서 감았음.' },
  { id: 'rec.tidewater.2', district: 'tidewater', mission: '1-2', title: '돌아온 사람들의 명단', image: '게시판 소품',
    body: '폭풍 다음 날의 귀환 확인 명단이다. 이름 열두 개와 "미확인 3"이 적혀 있다. 아래에 다른 필체로 "미확인은 대피소. 전부 무사."가 덧붙었지만 그 줄만 조율망의 회수 표식이 찍혀 있다.' },
];

// 장면 순서(세션이 읽는다): 임무별 시작·완료·사망 대본과 패널
export const CH1: ChapterStory = {
  chapter: 1,
  prologue: 'ch1.prologue', epilogue: 'ch1.epilogue',
  missions: {
    '1-1': { intro: '1-1.intro', outro: '1-1.outro', death: '1-1.death', comms: { relayA: '1-1.relayA', firstKill: '1-1.firstKill', relayB: '1-1.relayB' } },
    '1-2': { intro: '1-2.intro', outro: '1-2.outro', death: '1-2.death', panels: { midBoss: '1-2.cleaner' }, comms: { record1: '1-2.record1', record2: '1-2.record2', midBossDown: '1-2.cleanerDown' } },
    '1-3': { intro: '1-3.entry', outro: '1-3.outro', death: '1-3.death', panels: { bossIntro: '1-3.bossIntro' }, comms: { boss: '1-3.boss', phase: '1-3.phase', weak: '1-3.weak' } },
  },
  scripts: CH1_SCRIPTS, panels: CH1_PANELS, records: CH1_RECORDS,
};
