// 제작·강화·동일 슬롯 강화 이전(33번 T048, 26번 6·7절). 저장 트랜잭션 안에서 부르는 순수 변환이다:
//   - 기본 설계 제작: 부품 40, 해금한 설계만(시작 4개 + 지역 첫 임무 완료). 결과는 일반 +0, 보관함이 차면 대기함이다.
//   - 서명 재제작: 한 번 얻은 서명만, 부품 80·공명핵 1, 추천 보조 옵션이 붙은 특제 +0(보장 횟수와 무관).
//   - 강화: +1/+2/+3은 2·4·6장 보스 첫 완료로 열리고 단계 비용 50/90/140이다.
//   - 이전: 같은 슬롯의 다른 카드로 단계를 옮기고 원본은 +0이 된다. 대상 단계가 같거나 높으면 거절한다(복제·환급 없음).
// 해금은 저장의 완료 목록에서 매번 계산한다(다시 계산해도 재료·장비를 재지급하지 않는다). 검사: tests/client/craft.test.ts.
import { CRAFT, DESIGN_UNLOCK, START_DESIGNS, START_WEAPONS, UPGRADE_COST, UPGRADE_UNLOCK_CHAPTER, UPGRADE_UNLOCK_MISSION, WEAPON_UNLOCK } from './data/economy.js';
import { BASIC_IDS, MODULES } from './data/modules.js';
import { addCards, findCard, makeCard, slotOf, type ModuleCard } from './inventory.js';
import { basicCard, signatureCard } from './loot.js';
import type { CampaignSave } from './save.js';

export type CraftReject = { reject: 'rejected'; reason: string };
export type CraftOutcome = CampaignSave | CraftReject;
const no = (reason: string): CraftReject => ({ reject: 'rejected', reason });

// 제작할 수 있는 기본 설계(BASIC_IDS 순서)
export function unlockedDesigns(save: CampaignSave): string[] {
  const open = new Set<string>(START_DESIGNS);
  for (const [mid, ids] of Object.entries(DESIGN_UNLOCK)) if (save.done.includes(mid)) for (const id of ids) open.add(id);
  return BASIC_IDS.filter((id) => open.has(id));
}
// 설계를 여는 임무(잠긴 설계의 안내용, 시작 설계는 null)
export function designSource(defId: string): string | null {
  for (const [mid, ids] of Object.entries(DESIGN_UNLOCK)) if (ids.includes(defId)) return mid;
  return null;
}
// 캠페인에서 고를 수 있는 주 무기(대전 프로필의 무기 목록과 무관)
export function unlockedWeapons(save: CampaignSave | null): string[] {
  const out: string[] = [...START_WEAPONS];
  if (save) for (const [mid, ids] of Object.entries(WEAPON_UNLOCK)) if (save.done.includes(mid)) out.push(...ids);
  return out;
}
export function weaponSource(weapon: string): string | null {
  for (const [mid, ids] of Object.entries(WEAPON_UNLOCK)) if (ids.includes(weapon)) return mid;
  return null;
}
// 지금 강화할 수 있는 최고 단계(0~3)
export function upgradeTier(save: CampaignSave): number {
  let t = 0;
  for (let i = 0; i < UPGRADE_UNLOCK_MISSION.length; i++) if (save.done.includes(UPGRADE_UNLOCK_MISSION[i])) t = i + 1; else break;
  return t;
}

function grant(save: CampaignSave, card: ModuleCard, parts: number, cores: number): CampaignSave {
  const inv = addCards({ ...save.inventory, parts: save.inventory.parts - parts, cores: save.inventory.cores - cores }, [card]);
  return { ...save, inventory: inv, uidSeq: save.uidSeq + 1 };
}

export function craftBasic(save: CampaignSave, defId: string): CraftOutcome {
  const d = MODULES[defId];
  if (!d || d.signature) return no('기본 설계가 아니다');
  if (!unlockedDesigns(save).includes(defId)) { const src = designSource(defId); return no(src ? `${src} 첫 완료 뒤 제작할 수 있다` : '아직 해금하지 않은 설계이다'); }
  if (save.inventory.parts < CRAFT.basic) return no(`부품이 부족하다 (${save.inventory.parts}/${CRAFT.basic})`);
  return grant(save, makeCard(basicCard(defId), `m${save.uidSeq}`, 'craft'), CRAFT.basic, 0);
}

export function craftSignature(save: CampaignSave, sigId: string): CraftOutcome {
  if (!MODULES[sigId]?.signature) return no('서명 모듈이 아니다');
  if (!save.signatures.includes(sigId)) return no('한 번 얻은 서명만 다시 만들 수 있다');
  if (save.inventory.parts < CRAFT.signatureParts || save.inventory.cores < CRAFT.signatureCores) return no(`재료가 부족하다 (부품 ${save.inventory.parts}/${CRAFT.signatureParts} · 공명핵 ${save.inventory.cores}/${CRAFT.signatureCores})`);
  const r = { ...signatureCard(sigId), source: 'craft' };
  return grant(save, makeCard(r, `m${save.uidSeq}`, 'craft'), CRAFT.signatureParts, CRAFT.signatureCores);
}

export function upgradeCost(card: ModuleCard): number | null { return card.plus >= 3 ? null : UPGRADE_COST[card.plus]; }

export function upgradeCard(save: CampaignSave, uid: string): CraftOutcome {
  const c = findCard(save.inventory, uid);
  if (!c) return no('보관함에 없는 카드이다');
  if (c.plus >= 3) return no('이미 +3이다');
  const next = c.plus + 1;
  if (upgradeTier(save) < next) return no(`+${next} 강화는 ${UPGRADE_UNLOCK_CHAPTER[next - 1]}장 보스 완료 뒤 열린다`);
  const cost = UPGRADE_COST[c.plus];
  if (save.inventory.parts < cost) return no(`부품이 부족하다 (${save.inventory.parts}/${cost})`);
  return { ...save, inventory: { ...save.inventory, parts: save.inventory.parts - cost, cards: save.inventory.cards.map((x) => (x.uid === uid ? { ...x, plus: next } : x)) } };
}

// 같은 슬롯의 강화 이전: from의 단계를 to로 옮기고 from은 +0. 대상 단계가 같거나 높으면 덮어쓰지 않는다
export function transferUpgrade(save: CampaignSave, fromUid: string, toUid: string): CraftOutcome {
  if (fromUid === toUid) return no('같은 카드로는 옮길 수 없다');
  const a = findCard(save.inventory, fromUid), b = findCard(save.inventory, toUid);
  if (!a || !b) return no('보관함에 없는 카드이다');
  if (slotOf(a) !== slotOf(b)) return no('같은 슬롯끼리만 옮길 수 있다');
  if (a.plus <= 0) return no('옮길 강화 단계가 없다');
  if (a.locked) return no('잠근 카드의 강화는 옮기지 않는다 — 잠금을 먼저 푼다');
  if (b.plus >= a.plus) return no(`대상이 이미 +${b.plus}이다 — 낮은 단계로 덮어쓰지 않는다`);
  return { ...save, inventory: { ...save.inventory, cards: save.inventory.cards.map((x) => (x.uid === toUid ? { ...x, plus: a.plus } : x.uid === fromUid ? { ...x, plus: 0 } : x)) } };
}
