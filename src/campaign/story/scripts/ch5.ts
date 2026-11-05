// 5장 「솔트팬 분지 / 낮」(35번 R032). 서로 다른 잉크가 섞여야 정화 설비가 작동한다는 원리를 되찾는다(25번 4.2절: 5-1 완료).
// 보스: 풍차장 솔트(스피너, 소금 흰 망토). "혼합 흐름을 차단한다."
import { buildChapter } from './build.js';

export const CH5 = buildChapter({
  chapter: 5, district: 'saltpan',
  midBoss: { name: '염전 청소조', caption: '마른 길을 넓히는 동작만 남았다.', word: '쏴아', actor: 'salt-crew' },
  boss: { name: '풍차장 솔트', say: '혼합 흐름을 차단한다.', word: '쉬익', actor: 'salt' },
  missions: [
    { id: '5-1',
      intro: [['teal', '펌프 둘을 순서대로 켜. 칠한 곳은 지점마다 남아.', 'focus'], ['mora', '두 흐름이 섞이는 걸 봐 둬.', 'focus']],
      outro: [['mora', '한 색으로 만드는 게 정화는 아니었어.', 'smile'], ['teal', '원래 순환 설계야. 섞여야 돌아가.', 'joy']],
      death: [['teal', '펌프 옆 도색병이야. 먼저 처리해.', 'worry'], ['pong', '칠하는 애부터!', 'determined']],
      comms: { pump1: [['pong', '물이 돌기 시작했어!', 'joy']] } },
    { id: '5-2',
      intro: [['teal', '적 잉크 지대가 넓어. 쉴 자리를 만들며 가.', 'focus'], ['pong', '발이 끈적거려…', 'tired']],
      outro: [['teal', '청소조가 지우던 건 다른 색의 길이었어.', 'worry'], ['mora', '대체 복구 명령을 만들 수 있을 것 같아.', 'determined']],
      death: [['teal', '도색병이 바닥을 덮었어. 먼저 칠해서 쉴 곳을 만들어.', 'worry'], ['pong', '쉴 곳부터!', 'determined']],
      comms: { midBossDown: [['pong', '마른 길이 멈췄어!', 'joy']] } },
    { id: '5-3',
      intro: [['teal', '살수 장치를 부숴서 안전한 땅을 만들어.', 'focus'], ['pong', '풍차가 안 돌아…', 'worry']],
      outro: [['mora', '대체 복구 명령이야. 이제 운하만 열면 돼.', 'determined'], ['teal', '풍차가 다시 돌아. 순환이 이어졌어.', 'smile'], ['pong', '바람 냄새가 달라!', 'joy']],
      death: [['teal', '솔트의 연속 사격이야. 살수 장치부터 끊어.', 'worry'], ['pong', '물뿌리개부터!', 'determined']],
      comms: { phase: [['teal', '살수가 멈췄어. 지금 안전 구역을 넓혀.', 'focus']], weak: [['pong', '과열됐어! 지금!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.saltpan.1', mission: '5-1', title: '섞이는 물의 설계도', image: '펌프 도면',
      body: '정화 설비 원본 설계도이다. 두 펌프의 물길이 가운데에서 만난다. 여백에 "한 쪽만 돌리면 소금이 굳는다. 반드시 섞을 것."이라는 설계자의 메모가 있다.' },
    { id: 'rec.saltpan.2', mission: '5-2', title: '돌아갈 자리', image: '염전 오두막',
      body: '염전 오두막 문에 걸린 팻말이다. "잠깐 피했다가 돌아옴. 소금은 그대로 둘 것." 조율망이 "미등록 거주지"로 표시했지만 팻말의 글씨는 지워지지 않았다.' },
  ],
});
