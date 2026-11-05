// 항구 지도의 지역·임무 카드 데이터(35번 R029, 2번 5절 임무 표·9.3절 서명 모듈·12절 화면). 데이터와 순수 계산만 둔다.
// 지역 id는 기존 스테이지 id이고 썸네일은 assets/stages/<id>-<time>-sm.webp이다. 실제 3D 지형은 쓰지 않는다.
import type { DistrictId } from './scripts/types.js';

export interface MissionCard { id: string; title: string; goal: string; kind: 'mission' | 'mid' | 'boss'; reward: string; recordId?: string }
export interface DistrictDef {
  id: DistrictId; chapter: number; name: string; time: 'day' | 'dusk'; reward: string; signature: string;
  at: [x: number, y: number];   // 종이 지도 위 위치(%): 두 줄 지그재그(장 순서), 지도 최소 폭 960 px에서 카드가 겹치지 않는다
  missions: [MissionCard, MissionCard, MissionCard];
}

export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'tidewater', chapter: 1, name: '타이드워터 광장', time: 'day', reward: '목표 작업·기초 생존', signature: '복구자의 표식', at: [11, 70], missions: [
    { id: '1-1', title: '멈춘 시계 아래', goal: '중계기 2개에 잉크를 공급한다', kind: 'mission', reward: '기본 모듈 확정', recordId: 'rec.tidewater.1' },
    { id: '1-2', title: '지워지는 발자국', goal: '기록 2개를 회수하고 고지를 통과한다', kind: 'mid', reward: '청소반장 · 첫 기록', recordId: 'rec.tidewater.2' },
    { id: '1-3', title: '광장의 통행금지', goal: '대장의 방패를 돌아 약점을 노린다', kind: 'boss', reward: '통행대장 바리 · 서명 모듈' },
  ] },
  { id: 'crossmarket', chapter: 2, name: '크로스로드 시장', time: 'dusk', reward: '장치 공격·약점', signature: '회수반 렌즈', at: [24, 28], missions: [
    { id: '2-1', title: '비어 있는 가판대', goal: '기록 보관함 3개 중 2개를 회수한다', kind: 'mission', reward: '브러시·우산·쌍권총 해금', recordId: 'rec.crossmarket.1' },
    { id: '2-2', title: '유리 지붕의 감시자', goal: '사선을 피해 측면 높은 길을 잡는다', kind: 'mid', reward: '유리눈 감시자', recordId: 'rec.crossmarket.2' },
    { id: '2-3', title: '시장의 마지막 방송', goal: '송신기를 차례로 끄고 중심부를 친다', kind: 'boss', reward: '배전탑 오르골 · 서명 모듈' },
  ] },
  { id: 'kelpline', chapter: 3, name: '켈프라인 터미널', time: 'day', reward: '보스 기절 공략', signature: '파쇄 결정', at: [37, 70], missions: [
    { id: '3-1', title: '목적지 없는 화물', goal: '중계기 3개를 차례로 복구한다', kind: 'mission', reward: '블래스터·활·버킷 해금', recordId: 'rec.kelpline.1' },
    { id: '3-2', title: '적재 구역 봉쇄', goal: '안전 통로를 만들고 기록을 회수한다', kind: 'mid', reward: '적재장 포수', recordId: 'rec.kelpline.2' },
    { id: '3-3', title: '껍질 속의 명령', goal: '돌진을 벽에 부딪게 하고 장비를 부순다', kind: 'boss', reward: '하역왕 HULLBREAKER · 서명 모듈' },
  ] },
  { id: 'halyard', chapter: 4, name: '할야드 마리나', time: 'dusk', reward: '잠수·재정비', signature: '계류 밸브', at: [50, 28], missions: [
    { id: '4-1', title: '끊어진 계류선', goal: '중계점을 따라가며 두 번 방어한다', kind: 'mission', reward: '스피너·검·미츠 해금', recordId: 'rec.halyard.1' },
    { id: '4-2', title: '돌아오지 않은 작업반', goal: '난간과 선박 엄폐로 장비를 회수한다', kind: 'mid', reward: '계류 수문장', recordId: 'rec.halyard.2' },
    { id: '4-3', title: '등대 없는 항로', goal: '번갈아 열리는 사선을 피해 대장을 무너뜨린다', kind: 'boss', reward: '계류장 스큐 · 서명 모듈' },
  ] },
  { id: 'saltpan', chapter: 5, name: '솔트팬 분지', time: 'day', reward: '도색·스페셜 운용', signature: '풍차축', at: [63, 70], missions: [
    { id: '5-1', title: '소금 밭의 두 흐름', goal: '두 펌프를 순서대로 가동한다', kind: 'mission', reward: '혼합 순환의 원리', recordId: 'rec.saltpan.1' },
    { id: '5-2', title: '마르는 길', goal: '회복 공간을 만들며 적 잉크 지대를 건넌다', kind: 'mid', reward: '염전 청소조', recordId: 'rec.saltpan.2' },
    { id: '5-3', title: '바람이 멈춘 펌프', goal: '살수 장치를 부숴 안전 구역을 만든다', kind: 'boss', reward: '풍차장 솔트 · 서명 모듈' },
  ] },
  { id: 'lockgate', chapter: 6, name: '록게이트 운하', time: 'dusk', reward: '이동·보조 무기 연계', signature: '수문 도체', at: [76, 28], missions: [
    { id: '6-1', title: '닫힌 물길', goal: '고정 제어점 3개를 차례로 복구한다', kind: 'mission', reward: '수문 통신 일부', recordId: 'rec.lockgate.1' },
    { id: '6-2', title: '두 문지기', goal: '방패·원거리 정예를 떼어 공략한다', kind: 'mid', reward: '쌍문지기', recordId: 'rec.lockgate.2' },
    { id: '6-3', title: '역류의 관제실', goal: '구역을 차례로 잡고 제어핵을 부순다', kind: 'boss', reward: '수문 조율기 · 서명 모듈' },
  ] },
  { id: 'terraces', chapter: 7, name: '테라스 고지대', time: 'dusk', reward: '약점 공략·위험 감수', signature: '물결의 기억', at: [89, 70], missions: [
    { id: '7-1', title: '가장 높은 우회로', goal: '계단과 벽으로 사선을 돌아 중계점을 잇는다', kind: 'mission', reward: '지역 통신 응답', recordId: 'rec.terraces.1' },
    { id: '7-2', title: '남은 신호', goal: '혼합 병종 웨이브를 돌파한다', kind: 'mid', reward: '잔향 지휘관', recordId: 'rec.terraces.2' },
    { id: '7-3', title: '되찾는 물결', goal: '통제 고리를 끊고 마지막 공격을 버틴다', kind: 'boss', reward: '파도껍질 · 엔딩' },
  ] },
];

// 진행 상태(캠페인 저장의 일부, 33번 T029가 소유한다). 지도는 이 값만 읽는다.
export interface HarborProgress { done: readonly string[]; colorReturn: Readonly<Record<string, number>>; records: readonly string[] }
export const NO_PROGRESS: HarborProgress = { done: [], colorReturn: {}, records: [] };

// 지역 해금: 1장은 처음부터, 그 뒤는 앞 지역의 3번째 임무 완료 뒤(2번 5절)
export function districtUnlocked(d: DistrictDef, p: HarborProgress): boolean {
  if (d.chapter === 1) return true;
  const prev = DISTRICTS.find((x) => x.chapter === d.chapter - 1);
  return !!prev && p.done.includes(prev.missions[2].id);
}

// 임무 해금: 지역 안에서 앞 임무 완료 뒤. 완료한 임무는 다시 고를 수 있다.
export function missionUnlocked(d: DistrictDef, i: number, p: HarborProgress): boolean {
  if (!districtUnlocked(d, p)) return false;
  return i === 0 || p.done.includes(d.missions[i - 1].id);
}

// 지역 카드 채도(0..1): 저장된 colorReturn 값, 없으면 잃은 색 0.18
export function districtSat(d: DistrictDef, p: HarborProgress): number {
  const v = p.colorReturn[d.id];
  return typeof v === 'number' && v >= 0 ? Math.min(1, v) : 0.18;
}

// 다음에 할 임무(지도를 열 때의 첫 포커스)
export function nextMission(p: HarborProgress): { district: DistrictDef; index: number } {
  for (const d of DISTRICTS) for (let i = 0; i < 3; i++) if (missionUnlocked(d, i, p) && !p.done.includes(d.missions[i].id)) return { district: d, index: i };
  return { district: DISTRICTS[DISTRICTS.length - 1], index: 2 };
}
