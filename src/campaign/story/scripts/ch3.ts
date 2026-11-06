// 3장 「켈프라인 터미널 / 낮」(35번 R032). 화물과 생물을 정화 대상으로 분류한 현장을 발견한다.
// 보스: 하역왕 HULLBREAKER(대사 없음, 집게·발소리·금속음). 3-3 완료에서 모라가 정비반 표식을 알아본다(25번 4.2절).
import { buildChapter } from './build.js';

export const CH3 = buildChapter({
  chapter: 3, district: 'kelpline',
  midBoss: { name: '적재장 포수', caption: '높은 크레인에서 떨어뜨리는 동작만 남았다.', word: '쿵', actor: 'loader' },
  boss: { name: '하역왕 HULLBREAKER', say: null, word: '끼긱', actor: null },
  missions: [
    { id: '3-1',
      intro: [['teal', '컨테이너 사이 중계기 셋이야. 다 지킬 필요는 없어.', 'focus'], ['pong', '화물에 목적지가 없어…', 'worry']],
      outro: [['teal', '운송장 목적지가 전부 "회수"야. 사람이 쓴 게 아니야.', 'worry'], ['mora', '블래스터랑 활, 버킷도 정비해 뒀어.', 'smile']],
      death: [['teal', '컨테이너 위 포격이야. 예고 원을 보고 옆으로.', 'worry'], ['pong', '노란 동그라미! 피하자!', 'determined']],
      comms: { relay2: [['teal', '둘째 중계기 연결. 앞만 보면 돼.', 'smile']],
        // 거대 보스의 배경 예고(3-1에서는 공격하지 않는다)
        tease: [['teal', '바다 쪽 큰 그림자 봤어? 아직은 지나가기만 해.', 'worry'], ['pong', '껍데기가 집채만 해…', 'surprise']] } },
    { id: '3-2',
      intro: [['teal', '안전 통로를 칠해 두고 낙하 구역 기록을 가져와.', 'focus'], ['pong', '아래가 바다야. 조심!', 'worry']],
      outro: [['teal', '정화 대상 목록에 생물이 있어. 소라게야.', 'worry'], ['mora', '…그 껍질 장비, 어디서 본 것 같아.', 'worry']],
      death: [['teal', '포수의 낙하 공격이야. 칠한 길로만 움직여.', 'worry'], ['pong', '길부터 칠하자!', 'determined']],
      comms: { midBossDown: [['pong', '포수가 멈췄어!', 'joy'], ['teal', '저 너머에 큰 발소리가 들려.', 'worry']] } },
    { id: '3-3',
      intro: [['teal', '돌진 뒤 벽에 부딪히면 껍질 장비가 드러나.', 'focus'], ['pong', '저렇게 큰 게를 어떻게…', 'surprise']],
      outro: [['mora', '저 표식… 우리 정비반 것이야.', 'worry'], ['teal', '장비만 부쉈어. 게는 바다로 돌아갔어.', 'smile'], ['pong', '모라, 괜찮아?', 'worry']],
      death: [['teal', '강타 다음 돌진이야. 벽 옆으로 비켜 서.', 'worry'], ['pong', '벽에 박게 만들자!', 'determined']],
      comms: { phase: [['teal', '통제 고리가 하나 끊겼어. 계속 벽으로 유도해.', 'determined']], weak: [['pong', '배 밑! 장비가 보여!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.kelpline.1', mission: '3-1', title: '목적지 없는 운송장', image: '컨테이너 표지',
      body: '운송장 서른 장의 목적지가 모두 "회수"로 바뀌어 있다. 맨 아래 한 장만 원래 글씨가 남았다. "켈프라인 → 할야드 정비반, 껍질 보호대 수리 의뢰."' },
    { id: 'rec.kelpline.2', mission: '3-2', title: '정화 대상 목록의 생물', image: '경고 표지판',
      body: '정화 대상 목록 맨 끝에 "대형 갑각류 1, 작업 장비로 재분류"가 있다. 옆에 누군가 연필로 "얘 이름은 껍데기 할멈. 해마다 같은 부두에 옴."이라고 적었다.' },
  ],
});
