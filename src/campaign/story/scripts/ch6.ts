// 6장 「록게이트 운하 / 해질녘」(35번 R032). 조율망이 최종 초기화를 준비하고, 수문별 통신선을 되살린다.
// 보스: 수문 조율기(무표정한 상태 파형의 제어 장치). 실제 수위·지형은 움직이지 않는다.
import { buildChapter } from './build.js';

export const CH6 = buildChapter({
  chapter: 6, district: 'lockgate',
  midBoss: { name: '쌍문지기', caption: '방패와 긴 총이 한 문을 지킨다.', word: '척', actor: 'twin-gate' },
  boss: { name: '수문 조율기', say: null, word: '삐—', actor: null },
  missions: [
    { id: '6-1',
      intro: [['teal', '고정 제어점 셋을 차례로 복구해. 물은 안 움직여.', 'focus'], ['archive', '최종 초기화 준비. 진행률 12.', 'neutral']],
      outro: [['teal', '수문 통신 일부가 살아났어.', 'smile'], ['mora', '초기화 전에 운하를 열어야 해.', 'determined']],
      death: [['teal', '제어점 옆 포격이야. 예고 원 밖으로.', 'worry'], ['pong', '원 밖으로!', 'determined']],
      comms: { point2: [['archive', '최종 초기화 준비. 진행률 41.', 'neutral']] } },
    { id: '6-2',
      intro: [['teal', '방패 정예랑 원거리 정예야. 둘을 떼어 놔.', 'focus'], ['pong', '둘이 같이 오면 무서워…', 'worry']],
      outro: [['teal', '둘로 나눈 열쇠야. 원래 수문지기의 우회선이 있었어.', 'focus'], ['mora', '안전 절차가 봉쇄 절차가 됐네.', 'worry']],
      death: [['teal', '방패 뒤에서 원거리가 쏴. 먼저 갈라 놔.', 'worry'], ['pong', '떼어 놓고 하나씩!', 'determined']],
      comms: { midBossDown: [['pong', '둘 다 멈췄어!', 'joy']] } },
    { id: '6-3',
      intro: [['teal', '구역 하나를 잡고 다음으로. 마지막은 제어핵이야.', 'focus'], ['archive', '최종 초기화 준비. 진행률 88.', 'neutral']],
      outro: [['teal', '중앙 통신선이 열렸어. 테라스까지 이어져.', 'joy'], ['mora', '이번에는 전부 지우라는 명령을 보내지 않을 거야.', 'determined'], ['pong', '마지막이다. 같이 가!', 'determined']],
      death: [['teal', '조율기의 이중 확인 공격이야. 제어점 순서를 지켜.', 'worry'], ['pong', '순서대로!', 'determined']],
      comms: { phase: [['teal', '제어점 둘을 돌려 썼어. 핵이 드러나.', 'determined']], weak: [['pong', '핵! 핵이 열렸어!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.lockgate.1', mission: '6-1', title: '수문 관리자의 우회선', image: '제어함',
      body: '수문 관리자가 손으로 그린 배선도이다. "정전되면 2번에서 3번으로 우회. 사람 먼저 내보내고 닫을 것." 조율망은 이 우회선을 "미승인 회로"로 차단했다.' },
    { id: 'rec.lockgate.2', mission: '6-2', title: '둘로 나눈 열쇠', image: '열쇠 보관함',
      body: '수문 열쇠를 둘로 나눠 두 사람이 나눠 가졌다는 기록이다. "한 사람이 실수해도 닫히지 않게." 조율망은 같은 규칙을 "둘 다 확인 전에는 열지 않음"으로 바꿨다.' },
  ],
});
