// 모듈 카드·보관함·대기함·장착·잠금·분해(33번 T032, 26번 2·7절, 28번 7절). 순수 계산이며 새 상태를 돌려준다.
// 저장은 save.ts의 단일 커밋(기대 revision)으로만 반영한다 — 연타·두 탭이 같은 아이템을 두 번 분해하지 못한다.
// 검사: tests/client/inventory.test.ts.
import { INVENTORY_SLOTS, SALVAGE, type Grade } from './data/economy.js';
import { MODULES, UPGRADE_MUL, type Slot, type StatLine } from './data/modules.js';
import type { RolledModule } from './loot.js';

export interface ModuleCard {
  uid: string;            // 개별 획득 ID(같은 이름 다른 옵션을 구분한다)
  defId: string; grade: Grade; sub: StatLine | null;
  plus: number;           // +0~+3
  locked: boolean;
  from: string;           // 획득 임무 id
}
export interface Inventory {
  cards: ModuleCard[];                         // 보관함(최대 INVENTORY_SLOTS)
  pending: ModuleCard[];                       // 결과 대기함(보관함이 차면 여기로, 자동 분해 없음)
  equipped: Partial<Record<Slot, string>>;     // 슬롯 → uid
  parts: number; cores: number;
}
export const EMPTY_INVENTORY: Inventory = { cards: [], pending: [], equipped: {}, parts: 0, cores: 0 };

export function makeCard(r: RolledModule, uid: string, from: string): ModuleCard {
  return { uid, defId: r.defId, grade: r.grade, sub: r.sub ? { ...r.sub } : null, plus: 0, locked: false, from };
}

// 보관함에 넣고 넘치면 대기함으로
export function addCards(inv: Inventory, cards: ModuleCard[]): Inventory {
  const room = Math.max(0, INVENTORY_SLOTS - inv.cards.length);
  return { ...inv, cards: [...inv.cards, ...cards.slice(0, room)], pending: [...inv.pending, ...cards.slice(room)] };
}
export function claimPending(inv: Inventory, uid: string): Inventory | null {
  const c = inv.pending.find((x) => x.uid === uid);
  if (!c || inv.cards.length >= INVENTORY_SLOTS) return null;
  return { ...inv, cards: [...inv.cards, c], pending: inv.pending.filter((x) => x !== c) };
}

export const slotOf = (c: ModuleCard): Slot => MODULES[c.defId].slot;
export const findCard = (inv: Inventory, uid: string): ModuleCard | undefined => inv.cards.find((c) => c.uid === uid);
export const isEquipped = (inv: Inventory, uid: string): boolean => Object.values(inv.equipped).includes(uid);

export function equip(inv: Inventory, uid: string): Inventory | null {
  const c = findCard(inv, uid);
  if (!c) return null;
  return { ...inv, equipped: { ...inv.equipped, [slotOf(c)]: uid } };
}
export function unequip(inv: Inventory, slot: Slot): Inventory { const e = { ...inv.equipped }; delete e[slot]; return { ...inv, equipped: e }; }
export function setLock(inv: Inventory, uid: string, locked: boolean): Inventory | null {
  if (!findCard(inv, uid)) return null;
  return { ...inv, cards: inv.cards.map((c) => (c.uid === uid ? { ...c, locked } : c)) };
}

// 분해: 장착·잠금 카드는 건너뛴다. 없는 uid(이미 분해됨)는 무시한다.
export function salvage(inv: Inventory, uids: readonly string[]): { inv: Inventory; gained: number; removed: string[]; skipped: string[] } {
  const want = new Set(uids), removed: string[] = [], skipped: string[] = [];
  let gained = 0;
  const keep = inv.cards.filter((c) => {
    if (!want.has(c.uid)) return true;
    if (c.locked || isEquipped(inv, c.uid)) { skipped.push(c.uid); return true; }
    gained += SALVAGE[c.grade]; removed.push(c.uid);
    return false;
  });
  return { inv: { ...inv, cards: keep, parts: inv.parts + gained }, gained, removed, skipped };
}

// 카드의 실제 효과(강화 배율 적용)
export function cardLines(c: ModuleCard): StatLine[] {
  const d = MODULES[c.defId], k = UPGRADE_MUL[Math.max(0, Math.min(3, c.plus))];
  const out: StatLine[] = [{ key: d.base.key, value: d.base.value * k }];
  if (d.extra) out.push({ key: d.extra.key, value: d.extra.value * k });   // 불이익도 강화 배율을 받는다(SG07)
  if (c.sub) out.push({ key: c.sub.key, value: c.sub.value * k });
  return out;
}
export function equippedCards(inv: Inventory): ModuleCard[] {
  return (['adapter', 'tank', 'badge'] as const).map((s) => inv.equipped[s]).filter((u): u is string => !!u).map((u) => findCard(inv, u)).filter((c): c is ModuleCard => !!c);
}
