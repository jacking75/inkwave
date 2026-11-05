// 4장 「할야드 마리나 / 해질녘」(35번 R032). 모라가 비상 회수 명령을 넓힌 사실을 고백한다(25번 4.2절: 4-2 완료).
// 고백은 공격 없는 정비 갑판에서 전한다(25번 8절). 보스: 계류장 스큐(긴 차저, 등대 노랑 어깨띠).
import { buildChapter } from './build.js';

export const CH4 = buildChapter({
  chapter: 4, district: 'halyard',
  midBoss: { name: '계류 수문장', caption: '부두 문을 닫는 동작만 반복한다.', word: '쾅', actor: 'warden' },
  boss: { name: '계류장 스큐', say: '미등록 항로를 폐쇄한다.', word: '찌잉', actor: 'skew' },
  missions: [
    { id: '4-1',
      intro: [['teal', '부두 중계점을 따라가. 짧은 방어가 두 번 있어.', 'focus'], ['pong', '배들이 다 묶여 있어.', 'worry']],
      outro: [['teal', '스피너·검·미츠까지 풀렸어. 이제 다 고를 수 있어.', 'smile'], ['mora', '…할야드는 내가 일하던 곳이야.', 'tired']],
      death: [['teal', '부두 끝 사격병 둘이야. 배 그늘로 붙어.', 'worry'], ['pong', '배 뒤로 숨자!', 'determined']],
      comms: { defend1: [['teal', '첫 방어 끝. 다음 중계점까지 숨 돌려.', 'smile']] } },
    { id: '4-2',
      intro: [['teal', '작업반 장비를 찾아야 해. 물에 빠지지 않게.', 'focus'], ['mora', '…거기 내 이름이 있을 거야.', 'tired']],
      outro: [['mora', '빨리 구하고 싶었어. 돌아갈 기록까지 지울 줄은 몰랐어.', 'tired'], ['teal', '작업반 귀환 통신이야. 다들 살아 있어.', 'smile'], ['pong', '모라… 그래도 같이 고치자.', 'worry']],
      death: [['teal', '수문장의 닫기 공격이야. 난간 위로 피해.', 'worry'], ['pong', '난간! 난간으로!', 'determined']],
      comms: { midBossDown: [['pong', '문이 열렸어!', 'joy'], ['teal', '정비 갑판이야. 여긴 공격이 없어.', 'focus']] } },
    { id: '4-3',
      intro: [['teal', '사선이 번갈아 열려. 가까운 정비 지점부터 잡아.', 'focus'], ['mora', '이번엔 내가 길을 알려 줄게.', 'determined']],
      outro: [['mora', '강제 초기화 말고 다른 방법이 있어. 염전으로 가.', 'determined'], ['teal', '부두 안내등이 켜졌어.', 'smile'], ['pong', '등대 없이도 길이 보여!', 'joy']],
      death: [['teal', '스큐의 긴 사선이야. 번갈아 쉬는 틈을 봐.', 'worry'], ['pong', '사선이 쉬면 달리자!', 'determined']],
      comms: { phase: [['teal', '스큐가 자리를 옮겨. 가까운 정비 지점을 막아.', 'focus']], weak: [['pong', '충전 끝났어! 지금!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.halyard.1', mission: '4-1', title: '끊어지지 않은 계류선', image: '계류 말뚝',
      body: '폭풍 기록이다. "3번 계류선 유지. 끊으면 배가 떠내려감." 그 아래 회수 명령이 "모든 계류선 해제"로 덮어썼지만 3번 말뚝의 밧줄은 아직 단단히 묶여 있다.' },
    { id: 'rec.halyard.2', mission: '4-2', title: '귀환한 작업반', image: '작업반 사물함',
      body: '작업반 다섯 명의 귀환 서명이다. 전부 폭풍 다음 날 돌아왔다. 서명 칸 옆에 "모라 반장께 — 다들 무사해요. 걱정 마세요."라는 쪽지가 끼워져 있었다.' },
  ],
});
