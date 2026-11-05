// 2장 「크로스로드 시장 / 해질녘」(35번 R032, 2번 4.3절·25번). 대피한 상인들의 거래 기록을 회수하며
// 조율망이 사람을 보호하는 대신 흔적을 지우고 있음을 알게 된다. 보스: 배전탑 오르골(인간형이 아닌 제어 장치).
import { buildChapter } from './build.js';

export const CH2 = buildChapter({
  chapter: 2, district: 'crossmarket',
  midBoss: { name: '유리눈 감시자', caption: '긴 사선 하나로 시장을 내려다본다.', word: '번쩍', actor: 'glass-eye' },
  boss: { name: '배전탑 오르골', say: null, word: '딩—', actor: null },
  missions: [
    { id: '2-1',
      intro: [['teal', '골목에 기록 보관함이 셋 있어. 둘만 가져와도 돼.', 'focus'], ['pong', '상인들은 어디 갔을까…', 'worry']],
      outro: [['mora', '영수증까지 회수했다고? 가게를 통째로 지운 셈이야.', 'worry'], ['teal', '새 장비 계열이 풀렸어. 브러시랑 우산이야.', 'smile']],
      death: [['teal', '가판대 뒤 사격병이야. 위 통로는 비어 있어.', 'worry'], ['pong', '다시! 이번엔 위로!', 'determined']],
      comms: { firstBox: [['pong', '빈 가게 영수증이야. 이름이 적혀 있어.', 'worry']], allBoxes: [['teal', '셋 다 찾았네. 하나는 덤이야.', 'joy']] } },
    { id: '2-2',
      intro: [['teal', '유리 지붕 위에서 누가 사선을 긋고 있어.', 'focus'], ['teal', '정면 말고 측면 높은 길을 먼저 잡아.', 'focus']],
      outro: [['mora', '감시자가 지키던 건 시장이 아니라 지우는 순서였어.', 'worry'], ['pong', '방송탑이 아직 울려. 무서워…', 'worry']],
      death: [['teal', '감시자의 긴 사선이야. 기둥 뒤로 끊어서 가.', 'worry'], ['pong', '한 칸씩 숨어서 가자!', 'determined']],
      comms: { midBossDown: [['pong', '눈을 감겼어! 이제 안 보여!', 'joy'], ['teal', '방송탑이 시장 이름을 하나씩 지우고 있어.', 'worry']] } },
    { id: '2-3',
      intro: [['teal', '송신기가 켜진 것부터 차례로 꺼야 해.', 'focus'], ['pong', '종소리가 가게 이름을 지운대…', 'worry']],
      outro: [['teal', '명령 배포 기록이야. 화물 터미널로 이어져.', 'focus'], ['mora', '가게 이름이 다시 떠. 사람들이 돌아올 자리야.', 'smile'], ['pong', '3장이다! 배 타고 가?', 'joy']],
      death: [['teal', '오르골 파형 공격이야. 꺼진 송신기 뒤가 안전해.', 'worry'], ['pong', '켜진 것부터 끄자!', 'determined']],
      comms: { phase: [['teal', '핵이 드러났어. 지금 아래를 노려.', 'determined']], weak: [['pong', '가운데! 가운데가 열렸어!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.crossmarket.1', mission: '2-1', title: '빈 가게의 영수증', image: '가판대 소품',
      body: '생선 두 마리, 레몬 한 망, 외상. 영수증 뒤에 "폭풍 지나면 갚을게요"라고 적혀 있다. 가게 주인은 대피소 명단에 있지만 영수증의 이름 칸만 회수 표식으로 덮였다.' },
    { id: 'rec.crossmarket.2', mission: '2-2', title: '유리 지붕의 점검표', image: '점검 표지판',
      body: '유리 지붕 점검표이다. "금 간 판 3장, 교체 예정"까지는 사람 글씨이고, 그 아래 "감시 범위 확대, 편차 회수"는 조율망이 찍은 글자이다. 점검원 이름은 지워졌다.' },
  ],
});
