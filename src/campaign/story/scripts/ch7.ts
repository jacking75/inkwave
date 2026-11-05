// 7장 「테라스 고지대 / 새벽을 앞둔 해질녘」(35번 R032). 앞선 지역의 응답이 이어지고 최종 통제 장치를 끊는다.
// 보스: 파도껍질(다시 통제된 HULLBREAKER). 7-2에서 누락된 종료 조건이 주민 귀환 확인이었음을 보여 준다(25번 6절).
import { buildChapter } from './build.js';

export const CH7 = buildChapter({
  chapter: 7, district: 'terraces',
  midBoss: { name: '잔향 지휘관', caption: '모든 병종의 신호를 한꺼번에 낸다.', word: '삐빅', actor: 'commander' },
  boss: { name: '파도껍질', say: null, word: '콰르릉', actor: null },
  missions: [
    { id: '7-1',
      intro: [['teal', '계단과 벽으로 사선을 돌아. 중계점 셋을 이어.', 'focus'], ['pong', '높다… 아래가 다 보여.', 'surprise']],
      outro: [['teal', '시장, 부두, 염전에서 응답이 왔어.', 'joy'], ['mora', '다들 기다리고 있었구나.', 'smile']],
      death: [['teal', '고지대 사격병이야. 벽을 타고 올라가.', 'worry'], ['pong', '벽으로 올라가자!', 'determined']],
      comms: { echo: [['teal', '크로스로드 상인들이야. "가게 문 열어 둘게."', 'smile']] } },
    { id: '7-2',
      intro: [['teal', '마지막 복구 기록이야. 섞인 병종이 몰려와.', 'focus'], ['archive', '종료 조건 누락. 검색 중.', 'neutral']],
      outro: [['archive', '누락된 종료 조건: 주민 귀환 확인.', 'neutral'], ['teal', '처음부터 그거였어. 돌아왔는지 묻기만 하면 됐어.', 'worry'], ['mora', '이번엔 제대로 된 명령을 보내자.', 'determined']],
      death: [['teal', '지휘관이 병종을 섞어 보내. 방패부터 갈라.', 'worry'], ['pong', '한 줄씩 끊자!', 'determined']],
      comms: { midBossDown: [['pong', '지휘관이 조용해졌어!', 'joy']] } },
    { id: '7-3',
      intro: [['teal', '통제 고리를 페이즈마다 끊어. 마지막 공격을 버텨.', 'focus'], ['mora', '이번에는 전부 지우라는 명령을 보내지 않을 거야.', 'determined'], ['pong', '같이 끝내자!', 'determined']],
      outro: [['archive', '귀환 확인. 비상 회수 종료.', 'neutral'], ['teal', '항구 전체가 응답해. 색이 돌아오고 있어.', 'joy'], ['mora', '돌아오면 작업장은 열려 있을 거야.', 'smile']],
      death: [['teal', '파도껍질의 고리 공격이야. 고리 사이로 피해.', 'worry'], ['pong', '아직이야. 다시!', 'determined']],
      comms: { phase: [['teal', '고리 하나 끊었어. 앞선 지역 신호가 돕고 있어.', 'determined']], weak: [['pong', '마지막 고리! 지금!', 'surprise']] } },
  ],
  records: [
    { id: 'rec.terraces.1', mission: '7-1', title: '벽에 남긴 안내', image: '벽화 표지',
      body: '고지대 벽에 분필로 쓴 안내이다. "아래 길 막히면 계단 세 번째에서 오른쪽 벽으로." 지워졌다 다시 쓴 흔적이 네 번 겹쳐 있다. 누군가 계속 길을 알려 주고 있었다.' },
    { id: 'rec.terraces.2', mission: '7-2', title: '누락된 중지 조건', image: '중계기 단말',
      body: '비상 회수 명령의 원래 초안이다. 마지막 줄 "주민 귀환이 확인되면 회수를 멈춘다"에 취소선이 그어져 있다. 옆에 모라의 글씨로 "나중에 다시 넣기"가 적혀 있다.' },
  ],
});
