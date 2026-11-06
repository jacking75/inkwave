// 캠페인 작업장 화면(33번 T032~T035·T037): 모듈 장비(보관함·대기함·비교·잠금·분해), 특성 배분·무료 재배분, 난이도·저장 관리,
// 캠페인 일시 정지. 모든 변경은 api.commit(순수 변환)으로 한 번에 저장하고, 저장이 끝난 뒤에 화면을 갱신한다
// (실패하면 성공 안내 대신 실패를 알린다). 메뉴의 공용 부품(Menus의 _btn·_bind·_header 등)을 MenuKit으로 받는다.
import { t } from './i18n.js';
import { h } from './ui-util.js';

import { MODULES, STAT_LABEL, type Slot } from '../campaign/data/modules.js';
import { TRAITS, TRAIT_LINES, TRAIT_MAX_RANK, type TraitLine } from '../campaign/data/traits.js';
import { SALVAGE, INVENTORY_SLOTS, CRAFT, UPGRADE_UNLOCK_CHAPTER } from '../campaign/data/economy.js';
import { BASIC_IDS } from '../campaign/data/modules.js';
import { craftBasic, craftSignature, upgradeCard, transferUpgrade, upgradeCost, upgradeTier, unlockedDesigns, designSource, type CraftOutcome } from '../campaign/craft.js';
import { cardLines, equip, salvage, setLock, claimPending, isEquipped, findCard, type ModuleCard } from '../campaign/inventory.js';
import { computeStats, type StatSheet } from '../campaign/stats.js';
import { invest, canInvest, levelOf, pointsAt, spentTotal, LEVEL_XP, type TraitAlloc } from '../campaign/growth.js';
import type { CampaignSave } from '../campaign/save.js';
import type { StoreError } from '../platform/storage.js';

export interface CampaignUiApi {
  save(): CampaignSave | null;
  commit(op: (s: CampaignSave) => CampaignSave | { reject: StoreError; reason?: string }): Promise<{ ok: boolean; error?: StoreError; reason?: string }>;
  errorText(e: StoreError): string;
  inMission(): boolean;               // 임무 중(체크포인트 대기) — 변경은 다음 재시작부터
  retry(): void; abandon(): void; resume(): void;
  exportSave(): Promise<string | null>;
  importSave(json: string): Promise<{ ok: boolean; error?: StoreError; reason?: string }>;
  newGame(difficulty: 'story' | 'normal'): Promise<{ ok: boolean; error?: StoreError; reason?: string }>;
  temporary(): boolean;
  weaponLock(id: string): string | null;   // 캠페인에서 아직 못 쓰는 주 무기의 이유(33번 T049), 쓸 수 있으면 null
}

type HEl = HTMLElement & { _show?: () => void };
export interface MenuKit {
  _btn(o: { id: string; label: string; sub?: string; icon?: string; cls?: string; accept: () => void; sound?: string | null; tilt?: number }): HTMLButtonElement;
  _bind(el: HTMLElement, o: { id?: string; accept?: () => void; adjust?: (d: number) => void }): HTMLElement;
  _header(title: string, o?: { back?: boolean; sub?: string | null }): HTMLElement;
  _prompts(items: Array<[string | string[], string | null, string]>): HTMLDivElement;
  _setFocus(el: HTMLElement | null, o?: { snap?: boolean }): void;
  _sfx(name: string, v?: number): void;
  _go(name: string): void;
  show(name: string | null, o?: object): void;
  toast(text: string, o?: { kind?: string; ms?: number }): unknown;
  _openModal(o: { title: string; text?: string; danger?: boolean; buttons: Array<{ label: string; cls?: string; accept: () => void; sound?: string | null }> }): void;
  _closeModal(silent?: boolean): void;
  _stack: string[];
  current: string | null;
  _focus: HTMLElement | null;
}
interface ScreenLike { el: HTMLElement; initial?: () => HTMLElement | null; onFocus?: (el: HTMLElement) => void; onBack?: () => void; wrap?: boolean; destroy?: () => void; onNav?: (dir: string) => boolean; onKey?: (e: KeyboardEvent) => boolean }

const SLOTS: Array<[Slot, string]> = [['adapter', '어댑터'], ['tank', '탱크'], ['badge', '표식']];
const GRADE: Record<string, string> = { common: '일반', precise: '정밀', special: '특제' };
const pct = (v: number) => `${Math.round(v * 100) / 100}`;

function cardTitle(c: ModuleCard): string { return `${MODULES[c.defId].name}${c.plus ? ` +${c.plus}` : ''}`; }
function linesEl(c: ModuleCard | null): HTMLElement {
  if (!c) return h('p', { class: 'iw-cg__none' }, '비어 있음');
  return h('ul', { class: 'iw-cg__lines' }, ...cardLines(c).map((l) => h('li', { class: l.key === 'dmgTaken' ? 'is-bad' : '' }, STAT_LABEL[l.key](l.value))));
}
function statsEl(st: StatSheet): HTMLElement {
  const row = (k: string, v: string, capped = false) => h('div', { class: 'iw-cg__stat' + (capped ? ' is-capped' : '') }, h('span', null, k), h('b', null, v));
  return h('div', { class: 'iw-cg__stats' },
    row('체력', pct(st.hpMax)), row('잉크', pct(st.inkMax)),
    row('달리기', `+${pct((st.runMul - 1) * 100)}%`, st.capped.includes('run')), row('잠수', `+${pct((st.swimMul - 1) * 100)}%`, st.capped.includes('swim')),
    row('주 무기 잉크', `-${pct((1 - st.mainInkMul) * 100)}%`, st.capped.includes('mainInk')), row('약점 피해', `+${pct(st.weakBonus * 100)}%`),
    row('목표 중 피해', `-${pct(st.objectiveGuard)}%`), ...(st.dmgTaken ? [row('받는 피해', `+${pct(st.dmgTaken)}%`)] : []));
}

function upgradeText(s: CampaignSave, c: ModuleCard): string {
  const cost = upgradeCost(c);
  if (cost === null) return '최대 +3';
  if (upgradeTier(s) <= c.plus) return t('+{n}은 {ch}장 보스 뒤', { n: c.plus + 1, ch: UPGRADE_UNLOCK_CHAPTER[c.plus] });
  return t('+{n} 부품 {cost}', { n: c.plus + 1, cost });
}

// ---- 모듈 장비 ------------------------------------------------------------------------------------------------------
export function gearScreen(M: MenuKit, api: CampaignUiApi): ScreenLike {
  let slot: Slot = 'adapter';
  let sel: string | null = null;
  let busy = false;
  const head = M._header('모듈 장비', { sub: api.inMission() ? '체크포인트 대기 — 바꾼 장비는 다시 시작할 때 적용된다' : '세 슬롯 · 보관함 · 대기함' });
  const tabs = h('div', { class: 'iw-cg__tabs' });
  const list = h('div', { class: 'iw-cg__list' });
  const cmp = h('div', { class: 'iw-cg__cmp' });
  const side = h('div', { class: 'iw-cg__side' });
  const el = h('div', { class: 'iw-screen iw-cg' }, head, h('div', { class: 'iw-cg__cols' }, h('div', { class: 'iw-cg__left' }, tabs, list), cmp, side),
    M._prompts([['Enter', 'A', '장착'], ['U', 'X', '강화·이전'], ['L', 'X', '잠금'], ['Del', 'Y', '분해'], ['Esc', 'B', 'Back']]));
  const run = async (label: string, op: (s: CampaignSave) => CampaignSave | { reject: StoreError; reason?: string }): Promise<void> => {
    if (busy) return;   // 연타: 처리 중에는 다음 요청을 받지 않는다(저장도 revision으로 한 번 더 막는다)
    busy = true;
    const r = await api.commit(op);
    busy = false;
    if (!r.ok) { M.toast(t('{label} 실패 — {why}', { label: t(label), why: t(r.reason ?? api.errorText(r.error!)) }), { kind: 'error', ms: 4200 }); return; }
    M._sfx('ui_confirm'); render();
  };
  const act = {
    equip: (uid: string) => run('장착', (s) => { const inv = equip(s.inventory, uid); return inv ? { ...s, inventory: inv } : { reject: 'rejected', reason: '없는 카드' }; }),
    lock: (uid: string) => run('잠금', (s) => { const c = findCard(s.inventory, uid); const inv = c ? setLock(s.inventory, uid, !c.locked) : null; return inv ? { ...s, inventory: inv } : { reject: 'rejected', reason: '없는 카드' }; }),
    salvage: (uid: string) => {
      const s = api.save(); const c = s ? findCard(s.inventory, uid) : null;
      if (!s || !c) return;
      if (c.locked || isEquipped(s.inventory, uid)) { M.toast('장착·잠금 카드는 분해할 수 없다', { kind: 'error' }); return; }
      const go = () => run('분해', (cur) => { const r = salvage(cur.inventory, [uid]); return r.removed.length ? { ...cur, inventory: r.inv } : { reject: 'rejected', reason: '이미 분해했다' }; });
      if (c.plus > 0) { M._openModal({ title: '강화 단계가 사라진다', text: t('{card}의 +{n}는 분해하면 돌려받지 못한다. 먼저 같은 슬롯으로 강화를 옮길 수 있다.', { card: cardTitle(c), n: c.plus }), danger: true, buttons: [{ label: '취소', accept: () => M._closeModal() }, { label: '분해', cls: 'iw-btn--danger', accept: () => { M._closeModal(true); void go(); } }] }); return; }
      void go();
    },
    upgrade: (uid: string) => run('강화', (s) => upgradeCard(s, uid)),
    transfer: (from: string, to: string) => run('강화 이전', (s) => transferUpgrade(s, from, to)),
    claim: (uid: string) => run('대기함 받기', (s) => { const inv = claimPending(s.inventory, uid); return inv ? { ...s, inventory: inv } : { reject: 'rejected', reason: '보관함이 가득 찼다' }; }),
  };
  // 강화 이전: 같은 슬롯의 다른 카드를 고르는 창(출처 → 대상, 26번 8절 5)
  const pickTransfer = (uid: string): void => {
    const s = api.save(); const c = s ? findCard(s.inventory, uid) : null;
    if (!s || !c) return;
    const others = s.inventory.cards.filter((x) => x.uid !== uid && MODULES[x.defId].slot === MODULES[c.defId].slot);
    if (!c.plus) { M.toast('옮길 강화 단계가 없다', { kind: 'error' }); return; }
    if (!others.length) { M.toast('같은 슬롯의 다른 카드가 없다', { kind: 'error' }); return; }
    M._openModal({ title: t('{card}의 +{n}를 옮긴다', { card: cardTitle(c), n: c.plus }), text: '원본은 +0이 된다. 대상이 같거나 높은 단계면 옮기지 않는다.', buttons: [
      ...others.slice(0, 6).map((o) => ({ label: `→ ${cardTitle(o)} (${GRADE[o.grade]})`, accept: () => { M._closeModal(true); void act.transfer(uid, o.uid); } })),
      { label: '취소', accept: () => M._closeModal() },
    ] });
  };
  function render(): void {
    const s = api.save();
    if (!s) { list.replaceChildren(h('p', null, '캠페인 저장이 없다')); return; }
    const inv = s.inventory;
    const level = levelOf(s.xp);
    tabs.replaceChildren(...SLOTS.map(([id, label]) => {
      const eq = inv.equipped[id] ? findCard(inv, inv.equipped[id]!) : null;
      const b = h('button', { class: 'iw-cg__tab' + (slot === id ? ' is-on' : '') }, h('small', null, label), h('b', null, eq ? cardTitle(eq) : '비어 있음'));
      M._bind(b, { id: 'slot-' + id, accept: () => { slot = id; sel = null; render(); } });
      return b;
    }));
    const cards = inv.cards.filter((c) => MODULES[c.defId].slot === slot);
    const items: HTMLElement[] = cards.map((c) => {
      const b = h('button', { class: `iw-cg__card g-${c.grade}${isEquipped(inv, c.uid) ? ' is-eq' : ''}${c.locked ? ' is-lock' : ''}${sel === c.uid ? ' is-sel' : ''}` },
        h('small', null, `${GRADE[c.grade]}${c.locked ? ' · 잠금' : ''}${isEquipped(inv, c.uid) ? ' · 장착' : ''}`), h('b', null, cardTitle(c)), h('span', null, MODULES[c.defId].use)) as HEl;
      M._bind(b, { id: 'card-' + c.uid, accept: () => { void act.equip(c.uid); } });
      b._show = () => { sel = c.uid; showCmp(s, c); };
      (b as HTMLElement & { _uid?: string })._uid = c.uid;
      return b;
    });
    const pend = inv.pending.map((c) => { const b = h('button', { class: `iw-cg__card is-pending g-${c.grade}` }, h('small', null, '대기함'), h('b', null, cardTitle(c))); M._bind(b, { id: 'pend-' + c.uid, accept: () => { void act.claim(c.uid); } }); return b; });
    list.replaceChildren(...(items.length ? items : [h('p', { class: 'iw-cg__none' }, '이 슬롯의 모듈이 없다')]), ...(pend.length ? [h('h4', null, t('대기함 {n}', { n: inv.pending.length })), ...pend] : []));
    side.replaceChildren(
      h('div', { class: 'iw-cg__lv' }, h('b', null, `Lv ${level}`), h('span', null, `${s.xp} / ${LEVEL_XP[Math.min(20, level + 1)] ?? s.xp} XP`)),
      h('div', { class: 'iw-cg__mat' }, t('부품 {p} · 공명핵 {c} · 보관 {n}/{max}', { p: inv.parts, c: inv.cores, n: inv.cards.length, max: INVENTORY_SLOTS })),
      h('h4', null, '적용 능력치'), statsEl(computeStats(level, eqCards(s), s.traits)));
    const cur = sel && findCard(inv, sel) ? findCard(inv, sel)! : (inv.equipped[slot] ? findCard(inv, inv.equipped[slot]!) : null) ?? null;
    showCmp(s, cur);
  }
  function eqCards(s: CampaignSave): ModuleCard[] { return SLOTS.map(([id]) => s.inventory.equipped[id]).filter((u): u is string => !!u).map((u) => findCard(s.inventory, u)).filter((c): c is ModuleCard => !!c); }
  function showCmp(s: CampaignSave, c: ModuleCard | null): void {
    const eqUid = s.inventory.equipped[slot];
    const eq = eqUid ? findCard(s.inventory, eqUid) ?? null : null;
    const level = levelOf(s.xp);
    // 교체했을 때의 적용값(상한 적용)
    const after = c ? computeStats(level, [...eqCards(s).filter((x) => MODULES[x.defId].slot !== slot), c], s.traits) : null;
    cmp.replaceChildren(
      h('div', { class: 'iw-cg__pair' }, h('div', null, h('small', null, '지금 장착'), h('b', null, eq ? cardTitle(eq) : '없음'), linesEl(eq)), h('div', null, h('small', null, '선택'), h('b', null, c ? cardTitle(c) : '—'), linesEl(c))),
      after ? h('div', null, h('h4', null, '바꾸면(상한 적용)'), statsEl(after)) : h('span'),
      c ? h('p', { class: 'iw-cg__hint' }, t(c.plus ? '분해: 부품 {p} · +{n} 소실 · 강화: {up}' : '분해: 부품 {p} · 강화: {up}', { p: SALVAGE[c.grade], n: c.plus, up: upgradeText(s, c) })) : h('span'));
  }
  render();
  return {
    el, wrap: true,
    initial: () => (list.querySelector('.iw-cg__card') as HTMLElement | null) ?? (tabs.firstElementChild as HTMLElement | null),
    onFocus: (f) => (f as HEl)._show?.(),
    onBack: () => { if (M._stack.length > 1) M.show(M._stack[M._stack.length - 2], { pop: true, back: true }); else M.show(api.inMission() ? null : 'workshop', { back: true }); },
    // 패드 X·Y: 고른 카드의 동작 창(장착·잠금·분해). 키보드 L = 잠금, Delete = 분해
    onNav: (dir) => {
      if (dir !== 'alt') return false;
      const uid = (M._focus as HTMLElement & { _uid?: string } | null)?._uid;
      if (!uid) return true;
      const c = findCard(api.save()!.inventory, uid);
      if (!c) return true;
      M._openModal({ title: cardTitle(c), text: MODULES[c.defId].use, buttons: [
        { label: '장착', accept: () => { M._closeModal(true); void act.equip(uid); } },
        { label: c.locked ? '잠금 풀기' : '잠금', accept: () => { M._closeModal(true); void act.lock(uid); } },
        { label: t('강화 — {up}', { up: upgradeText(api.save()!, c) }), accept: () => { M._closeModal(true); void act.upgrade(uid); } },
        { label: '강화 이전', accept: () => { M._closeModal(true); pickTransfer(uid); } },
        { label: '분해', cls: 'iw-btn--danger', accept: () => { M._closeModal(true); act.salvage(uid); } },
        { label: '닫기', accept: () => M._closeModal() },
      ] });
      return true;
    },
    onKey: (e) => {
      const uid = (M._focus as HTMLElement & { _uid?: string } | null)?._uid;
      if (!uid) return false;
      if (e.code === 'KeyL') { void act.lock(uid); return true; }
      if (e.code === 'KeyU') { void act.upgrade(uid); return true; }
      if (e.code === 'KeyT') { pickTransfer(uid); return true; }
      if (e.code === 'Delete' || e.code === 'Backspace' && e.shiftKey) { act.salvage(uid); return true; }
      return false;
    },
  };
}

// ---- 제작(33번 T048, 26번 7절): 기본 설계(해금한 것만 부품 40)·얻은 서명 재제작(부품 80·공명핵 1) ----------------------------
export function craftScreen(M: MenuKit, api: CampaignUiApi): ScreenLike {
  let busy = false;
  const head = M._header('모듈 제작', { sub: t('기본 설계 부품 {a} · 서명 재제작 부품 {b}·공명핵 {c}', { a: CRAFT.basic, b: CRAFT.signatureParts, c: CRAFT.signatureCores }) });
  const list = h('div', { class: 'iw-cg__list' });
  const side = h('div', { class: 'iw-cg__side' });
  const el = h('div', { class: 'iw-screen iw-cg' }, head, h('div', { class: 'iw-cg__cols' }, h('div', { class: 'iw-cg__left' }, list), side),
    M._prompts([['Enter', 'A', '제작'], ['Esc', 'B', 'Back']]));
  const make = async (label: string, op: (s: CampaignSave) => CraftOutcome): Promise<void> => {
    if (busy) return;   // 연타: 처리 중에는 다음 요청을 받지 않는다(저장도 revision으로 한 번 더 막는다)
    busy = true;
    const r = await api.commit(op);
    busy = false;
    if (!r.ok) { M.toast(t('{label} 실패 — {why}', { label: t(label), why: t(r.reason ?? api.errorText(r.error!)) }), { kind: 'error', ms: 4200 }); return; }
    M._sfx('ui_confirm'); M.toast(t('{label} 완료 — 모듈 장비에서 장착한다', { label: t(label) })); render();
  };
  function render(): void {
    const s = api.save();
    if (!s) { list.replaceChildren(h('p', null, '캠페인 저장이 없다')); return; }
    const open = unlockedDesigns(s);
    const items: HTMLElement[] = [h('h4', null, '기본 설계')];
    for (const id of BASIC_IDS) {
      const d = MODULES[id], ok = open.includes(id);
      const b = h('button', { class: `iw-cg__card g-common${ok ? '' : ' is-unavail'}` },
        h('small', null, ok ? t('{slot} · 부품 {n}', { slot: t(SLOTS.find(([k]) => k === d.slot)![1]), n: CRAFT.basic }) : t('{slot} · {src} 완료 뒤', { slot: t(SLOTS.find(([k]) => k === d.slot)![1]), src: designSource(id) ?? '' })), h('b', null, d.name), h('span', null, STAT_LABEL[d.base.key](d.base.value)));
      M._bind(b, { id: 'craft-' + id, accept: () => { void make(d.name + ' 제작', (cur) => craftBasic(cur, id)); } });
      items.push(b);
    }
    items.push(h('h4', null, '서명 재제작'));
    for (const d of Object.values(MODULES).filter((x) => x.signature)) {
      const ok = s.signatures.includes(d.id);
      const b = h('button', { class: `iw-cg__card g-special${ok ? '' : ' is-unavail'}` },
        h('small', null, ok ? t('추천 보조 옵션 확정 · 부품 {a}·공명핵 {b}', { a: CRAFT.signatureParts, b: CRAFT.signatureCores }) : '아직 얻지 못한 서명'), h('b', null, ok ? d.name : '???'), h('span', null, ok ? d.use : '해당 지역 보스를 쓰러뜨리면 얻는다'));
      M._bind(b, { id: 'sig-' + d.id, accept: () => { void make(d.name + ' 재제작', (cur) => craftSignature(cur, d.id)); } });
      items.push(b);
    }
    list.replaceChildren(...items);
    side.replaceChildren(h('div', { class: 'iw-cg__mat' }, t('부품 {p} · 공명핵 {c} · 보관 {n}/{max}', { p: s.inventory.parts, c: s.inventory.cores, n: s.inventory.cards.length, max: INVENTORY_SLOTS })),
      h('p', { class: 'iw-cg__hint' }, t('강화 가능 단계: +{n} · 보관함이 차면 제작한 모듈은 대기함으로 간다', { n: upgradeTier(s) })));
  }
  render();
  return { el, wrap: true, initial: () => list.querySelector('button') as HTMLElement | null, onBack: () => M.show('workshop', { back: true }) };
}

// ---- 특성 -----------------------------------------------------------------------------------------------------------
export function traitsScreen(M: MenuKit, api: CampaignUiApi): ScreenLike {
  let busy = false;
  const cols = h('div', { class: 'iw-ct__cols' });
  const info = h('div', { class: 'iw-ct__info' });
  const el = h('div', { class: 'iw-screen iw-ct' }, M._header('특성', { sub: api.inMission() ? '체크포인트 대기 — 다시 시작할 때 적용된다' : '기동 · 제압 · 순환 · 무료 재배분' }), info, cols,
    M._prompts([['Enter', 'A', '1점 투자'], ['R', 'X', '전부 되돌리기(무료)'], ['Esc', 'B', 'Back']]));
  const run = async (op: (s: CampaignSave) => CampaignSave | { reject: StoreError; reason?: string }): Promise<void> => {
    if (busy) return;
    busy = true; const r = await api.commit(op); busy = false;
    if (!r.ok) { M.toast(r.reason ?? api.errorText(r.error!), { kind: 'error' }); return; }
    M._sfx('ui_confirm'); render();
  };
  const DENY: Record<string, string> = { points: '남은 특성점이 없다', locked: '같은 계열에 먼저 점수를 써야 열린다', max: '이미 최대 단계이다', unknown: '없는 특성' };
  function render(): void {
    const s = api.save();
    if (!s) return;
    const earned = pointsAt(levelOf(s.xp)), spent = spentTotal(s.traits);
    info.textContent = t('특성점 {a} / {b} (Lv {lv}, 짝수 레벨마다 1점)', { a: earned - spent, b: earned, lv: levelOf(s.xp) });
    cols.replaceChildren(...(Object.keys(TRAIT_LINES) as TraitLine[]).map((line) => h('div', { class: 'iw-ct__col' }, h('h4', null, TRAIT_LINES[line]),
      ...TRAITS.filter((t) => t.line === line).map((t) => {
        const rank = s.traits[t.id] ?? 0, deny = canInvest(s.traits, t.id, earned);
        const b = h('button', { class: `iw-ct__t${rank ? ' is-on' : ''}${deny === 'locked' ? ' is-locked' : ''}` }, h('b', null, `${t.name} ${rank}/${TRAIT_MAX_RANK}`), h('span', null, t.desc(t.perRank * Math.max(1, rank))));
        M._bind(b, { id: 't-' + t.id, accept: () => { const d = canInvest(api.save()!.traits, t.id, earned); if (d) { M.toast(DENY[d], { kind: 'error' }); return; } void run((cur) => { const r = invest(cur.traits, t.id, pointsAt(levelOf(cur.xp))); return r.denied ? { reject: 'rejected', reason: DENY[r.denied] } : { ...cur, traits: r.alloc }; }); } });
        return b;
      }))));
  }
  const respec = (): void => { void run((cur) => ({ ...cur, traits: {} as TraitAlloc })).then(() => M.toast('특성을 모두 되돌렸다(무료)', { kind: 'good' })); };
  render();
  return {
    el, wrap: true, initial: () => cols.querySelector('.iw-ct__t') as HTMLElement | null,
    onBack: () => { if (M._stack.length > 1) M.show(M._stack[M._stack.length - 2], { pop: true, back: true }); else M.show(api.inMission() ? null : 'workshop', { back: true }); },
    onNav: (dir) => { if (dir !== 'alt') return false; respec(); return true; },
    onKey: (e) => { if (e.code !== 'KeyR') return false; respec(); return true; },
  };
}

// ---- 캠페인 관리(난이도·저장) --------------------------------------------------------------------------------------
export function manageScreen(M: MenuKit, api: CampaignUiApi): ScreenLike {
  const s = api.save();
  const diff = s?.difficulty ?? 'normal';
  const items = [
    M._btn({ id: 'diff', label: t('난이도: {d}', { d: t(diff === 'story' ? '이야기' : '일반') }), sub: '이야기 = 적 피해 -25%·예고 시간 증가 · 보상·해금은 같다', cls: 'iw-btn--menu', accept: () => {
      const next = (api.save()?.difficulty ?? 'normal') === 'story' ? 'normal' : 'story';
      void api.commit((cur) => ({ ...cur, difficulty: next })).then((r) => { if (r.ok) { M.toast(t(api.inMission() ? '난이도: {d} — 다음 재시작부터' : '난이도: {d}', { d: t(next === 'story' ? '이야기' : '일반') }), { kind: 'good' }); M.show('campManage', { force: true }); } else M.toast(api.errorText(r.error!), { kind: 'error' }); });
    } }),
    M._btn({ id: 'export', label: '저장 내보내기', sub: '파일(JSON)로 받는다 — 다른 브라우저·기기로 옮길 때', cls: 'iw-btn--menu', accept: () => {
      void api.exportSave().then((json) => {
        if (!json) { M.toast('내보낼 저장이 없다', { kind: 'error' }); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `inkwave-campaign-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        M.toast('저장을 내보냈다', { kind: 'good' });
      });
    } }),
    M._btn({ id: 'import', label: '저장 가져오기', sub: '검사를 통과한 파일만 · 실패하면 지금 저장을 그대로 둔다', cls: 'iw-btn--menu', accept: () => {
      if (api.inMission()) { M.toast('임무 중에는 가져올 수 없다', { kind: 'error' }); return; }
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => { const f = inp.files?.[0]; if (!f) return; void f.text().then((t) => api.importSave(t)).then((r) => M.toast(r.ok ? '저장을 가져왔다' : t('가져오기 실패 — {why}', { why: t(r.reason ?? api.errorText(r.error!)) }), { kind: r.ok ? 'good' : 'error', ms: 4200 })); };
      inp.click();
    } }),
    M._btn({ id: 'new', label: '새 게임', sub: '지금 저장을 덮어쓴다(먼저 내보내기를 권한다)', cls: 'iw-btn--menu iw-btn--danger', accept: () => {
      if (api.inMission()) { M.toast('임무 중에는 새 게임을 시작할 수 없다', { kind: 'error' }); return; }
      M._openModal({ title: '새 게임', text: '지금 캠페인 진행·장비·성장이 모두 지워진다.', danger: true, buttons: [
        { label: '취소', accept: () => M._closeModal() },
        { label: '이야기 난이도로', accept: () => { M._closeModal(true); void api.newGame('story').then((r) => M.toast(r.ok ? '새 게임(이야기)' : api.errorText(r.error!), { kind: r.ok ? 'good' : 'error' })); } },
        { label: '일반 난이도로', cls: 'iw-btn--danger', accept: () => { M._closeModal(true); void api.newGame('normal').then((r) => M.toast(r.ok ? '새 게임(일반)' : api.errorText(r.error!), { kind: r.ok ? 'good' : 'error' })); } },
      ] });
    } }),
  ];
  const el = h('div', { class: 'iw-screen iw-main iw-cm' }, M._header('캠페인 관리', { sub: api.temporary() ? '⚠ 저장할 수 없는 환경 — 임시 플레이 중' : '난이도 · 저장 내보내기/가져오기' }),
    h('nav', { class: 'iw-main__menu' }, items), M._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));
  return { el, wrap: true, initial: () => items[0] };
}

// ---- 캠페인 일시 정지 ----------------------------------------------------------------------------------------------
export function pauseScreen(M: MenuKit, api: CampaignUiApi): ScreenLike {
  const items = [
    M._btn({ id: 'resume', label: '재개', cls: 'iw-btn--menu iw-btn--primary', accept: () => api.resume(), sound: null }),
    M._btn({ id: 'retry', label: '체크포인트에서 다시', sub: '현재 구간의 적·장치·도색을 처음 상태로', cls: 'iw-btn--menu', accept: () => { M.show(null); api.retry(); } }),
    M._btn({ id: 'gear', label: '모듈 장비', cls: 'iw-btn--menu', accept: () => M._go('campGear') }),
    M._btn({ id: 'traits', label: '특성', cls: 'iw-btn--menu', accept: () => M._go('campTraits') }),
    M._btn({ id: 'manage', label: '난이도', sub: '다음 재시작부터 적용', cls: 'iw-btn--menu', accept: () => M._go('campManage') }),
    M._btn({ id: 'settings', label: '설정', cls: 'iw-btn--menu', accept: () => M._go('settings') }),
    M._btn({ id: 'quit', label: '작업장으로', sub: '이번 시도의 미확정 보상은 사라진다', cls: 'iw-btn--menu iw-btn--danger', accept: () => {
      M._openModal({ title: '작업장으로 돌아갈까?', text: '확정되지 않은 보상은 사라진다. 상자 추첨 결과는 다음 시도에도 같다.', danger: true, buttons: [
        { label: '계속하기', accept: () => M._closeModal() },
        { label: '작업장으로', cls: 'iw-btn--danger', accept: () => { M._closeModal(true); api.abandon(); } },
      ] });
    } }),
  ];
  const el = h('div', { class: 'iw-screen iw-pause' }, h('div', { class: 'iw-pause__dim' }),
    h('div', { class: 'iw-pause__col' }, h('div', { class: 'iw-pause__title' }, h('span', { class: 'iw-display' }, '잠시 멈춤')), h('nav', { class: 'iw-pause__menu' }, items)),
    M._prompts([['Enter', 'A', 'Select'], ['Esc', 'Start', '재개']]));
  return { el, wrap: true, initial: () => items[0], onBack: () => api.resume() };
}
