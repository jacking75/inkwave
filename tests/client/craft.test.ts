// 제작·강화·강화 이전(33번 T048): 재료 부족, 해금 전 강화, 다른 슬롯·같은 카드·잠금 이전 거절, 이전이 단계를 복제하지 않음,
// 서명 재제작 조건, 해금 재계산이 재지급하지 않음, 연타(같은 커밋 두 번)와 저장 실패 뒤 재시도.
import test from 'node:test';
import assert from 'node:assert/strict';
import { craftBasic, craftSignature, upgradeCard, transferUpgrade, upgradeTier, unlockedDesigns, unlockedWeapons, type CraftOutcome } from '../../src/campaign/craft.js';
import { newSave, decodeSave, type CampaignSave } from '../../src/campaign/save.js';
import { cardLines, makeCard } from '../../src/campaign/inventory.js';
import { signatureCard } from '../../src/campaign/loot.js';
import { MemoryStorage } from '../../src/platform/storage.js';
import { rewardInfo } from '../../src/campaign/rewardInfo.js';
import { newAttempt, rollSource } from '../../src/campaign/loot.js';
import { completeMission } from '../../src/campaign/completion.js';
import { REGION_SIGNATURE } from '../../src/campaign/data/modules.js';
import type { MissionDefinition, RegionId } from '../../src/campaign/data/types.js';

const ok = (r: CraftOutcome): CampaignSave => { if ('reject' in r) throw new Error(r.reason); return r; };
const why = (r: CraftOutcome): string => ('reject' in r ? r.reason : '');
const card = (uid: string, defId: string, plus = 0, locked = false) => ({ ...makeCard({ source: 't', defId, grade: 'common', sub: null }, uid, 't'), plus, locked });
const withCards = (s: CampaignSave, cards: ReturnType<typeof card>[], parts = 1000, cores = 5): CampaignSave =>
  ({ ...s, inventory: { ...s.inventory, cards, parts, cores }, uidSeq: 100 });

test('기본 설계 제작: 해금한 설계만, 부품 40 차감, 부족하면 거절하고 저장을 바꾸지 않는다', () => {
  const s = withCards(newSave(0), [], 39);
  assert.match(why(craftBasic(s, 'AD01')), /부품이 부족/);
  assert.match(why(craftBasic({ ...s, inventory: { ...s.inventory, parts: 100 } }, 'AD03')), /2-1 첫 완료/);
  const a = ok(craftBasic({ ...s, inventory: { ...s.inventory, parts: 100 } }, 'AD01'));
  assert.equal(a.inventory.parts, 60);
  assert.equal(a.inventory.cards.length, 1);
  assert.equal(a.inventory.cards[0].grade, 'common');
  assert.equal(a.pity, s.pity, '제작은 보장 횟수와 무관하다');
  // 2-1 완료 뒤 AD03이 열린다. 해금은 완료 목록에서 계산하므로 다시 계산해도 재료·카드가 늘지 않는다
  const after = { ...a, done: ['1-1', '1-2', '1-3', '2-1'] };
  assert.ok(unlockedDesigns(after).includes('AD03'));
  assert.deepEqual(unlockedDesigns(after), unlockedDesigns(after));
  assert.equal(after.inventory.cards.length, 1);
  assert.deepEqual(unlockedWeapons(after).slice(3), ['twins', 'brush', 'brolly']);
});

test('서명 재제작: 얻은 적 있는 서명만, 부품 80·공명핵 1, 추천 보조 옵션이 붙은 특제', () => {
  const s = withCards(newSave(0), [], 200, 1);
  assert.match(why(craftSignature(s, 'SG01')), /한 번 얻은/);
  const got = { ...s, signatures: ['SG01'] };
  const r = ok(craftSignature(got, 'SG01'));
  assert.equal(r.inventory.parts, 120); assert.equal(r.inventory.cores, 0);
  assert.deepEqual(r.inventory.cards[0].sub, { key: 'inkMax', value: 3 });
  assert.equal(r.inventory.cards[0].grade, 'special');
  assert.match(why(craftSignature(r, 'SG01')), /재료가 부족/);
  // v1 저장(signatures 없음)은 보관함의 서명 카드에서 복원한다
  const v1 = JSON.parse(JSON.stringify({ ...withCards(newSave(0), [{ ...makeCard(signatureCard('SG02'), 'u1', '2-3') }]), schemaVersion: 1 }));
  delete v1.signatures;
  const d = decodeSave(v1);
  assert.ok('value' in d && d.value.signatures.includes('SG02'));
});

test('강화: 2·4·6장 보스 완료로 단계가 열리고 비용 50/90/140, +3 위로는 없다', () => {
  let s = withCards(newSave(0), [card('a', 'AD02')], 280);
  assert.match(why(upgradeCard(s, 'a')), /2장 보스 완료 뒤/);
  s = { ...s, done: ['2-3'] };
  assert.equal(upgradeTier(s), 1);
  s = ok(upgradeCard(s, 'a'));
  assert.equal(s.inventory.parts, 230);
  assert.match(why(upgradeCard(s, 'a')), /4장 보스 완료 뒤/);
  s = { ...s, done: ['2-3', '4-3', '6-3'] };
  s = ok(upgradeCard(s, 'a')); s = ok(upgradeCard(s, 'a'));
  assert.equal(s.inventory.parts, 0, '50 + 90 + 140 = 280');
  assert.equal(s.inventory.cards[0].plus, 3);
  assert.match(why(upgradeCard({ ...s, inventory: { ...s.inventory, parts: 999 } }, 'a')), /이미 \+3/);
  // 6장만 완료하고 4장을 건너뛴 저장은 +2 이상을 열지 않는다(앞 단계부터)
  assert.equal(upgradeTier({ ...s, done: ['6-3'] }), 0);
});

test('강화 이전: 같은 슬롯만, 원본 +0·대상에 한 번만, 대상이 같거나 높으면·잠금·같은 카드면 거절', () => {
  const s = withCards(newSave(0), [card('a', 'AD02', 2), card('b', 'SG03'), card('t', 'TK01'), card('c', 'AD01', 3), card('L', 'AD04', 2, true)]);
  const r = ok(transferUpgrade(s, 'a', 'b'));
  const plus = Object.fromEntries(r.inventory.cards.map((c) => [c.uid, c.plus]));
  assert.equal(plus.a, 0); assert.equal(plus.b, 2);
  assert.equal(r.inventory.parts, s.inventory.parts, '이전은 무료이고 재료를 돌려주지 않는다');
  // 연타: 같은 이전을 최신 저장에 다시 적용해도 단계가 늘거나 복제되지 않는다
  assert.match(why(transferUpgrade(r, 'a', 'b')), /옮길 강화 단계가 없다/);
  assert.match(why(transferUpgrade(s, 'a', 't')), /같은 슬롯/);
  assert.match(why(transferUpgrade(s, 'a', 'a')), /같은 카드/);
  assert.match(why(transferUpgrade(s, 'a', 'c')), /이미 \+3/);
  assert.match(why(transferUpgrade(s, 'L', 'b')), /잠근 카드/);
});

test('강화 배율: SG07의 불이익도 배율을 받고 SG06은 효과 값만 커진다', () => {
  const sg07 = cardLines({ ...card('x', 'SG07', 3) });
  assert.ok(Math.abs(sg07.find((l) => l.key === 'dmgTaken')!.value - 6.5) < 1e-9);
  assert.ok(Math.abs(sg07.find((l) => l.key === 'weak')!.value - 10.4) < 1e-9);
  const sg06 = cardLines({ ...card('y', 'SG06', 3) });
  assert.equal(sg06.length, 1);
  assert.ok(Math.abs(sg06[0].value - 7.8) < 1e-9);
});

test('T049 임무 선택 화면의 풀 = 실제 추첨 후보(7개 지역, 시드 400개)', () => {
  for (const region of Object.keys(REGION_SIGNATURE) as RegionId[]) {
    const info = rewardInfo('x-1', region, 'normal', []);
    const pool = new Set(info.pool.map((s) => `${s.key}:${s.value}`));
    const subs = new Set<string>(), specials = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const at = newAttempt('x-1', seed, seed % 10);
      for (const src of ['crate', 'completion']) {
        const r = rollSource(at, src, region);
        if (r.sub) subs.add(`${r.sub.key}:${r.sub.value}`);
        if (r.grade === 'special') specials.add(r.defId);
      }
    }
    for (const s of subs) assert.ok(pool.has(s), `${region}: 화면에 없는 보조 옵션 ${s}`);
    assert.deepEqual([...specials], [info.signature], `${region}: 특제 = 지역 서명`);
  }
});

test('T049 해금: 보스 첫 완료 서명은 보장 횟수를 바꾸지 않고, 반복 완료는 해금·첫 보상을 다시 주지 않는다', () => {
  const boss: MissionDefinition = { id: '2-3', chapterId: 2, title: 't', mapId: 'crossmarket', region: 'crossmarket', timeOfDay: 'dusk', type: 'boss', start: { at: [0, 0, 0], yaw: 0 }, segments: [], devices: [], objectives: [], encounters: [], checkpoints: [], reward: { kind: 'boss', signature: 'SG02', unlocks: ['3-1'] } };
  const s0 = { ...newSave(0), unlocked: ['1-1', '2-3'], pity: 4 };
  const a = completeMission(s0, { completionId: 'b1', runId: 'r1', mission: boss, crateOpened: false });
  assert.ok('save' in a);
  const sig = a.record.modules.find((m) => m.source === 'signature');
  assert.equal(sig?.defId, 'SG02');
  const rolled = a.record.modules.find((m) => m.source === 'completion')!;
  assert.equal(a.save.pity, rolled.grade === 'special' ? 0 : 5, '확정 서명은 보장 횟수에 들어가지 않는다');
  assert.deepEqual(a.save.signatures, ['SG02']);
  assert.equal(upgradeTier(a.save), 1);
  assert.deepEqual(a.save.unlocked, ['1-1', '2-3', '3-1']);
  const b = completeMission(a.save, { completionId: 'b2', runId: 'r2', mission: boss, crateOpened: false });
  assert.ok('save' in b);
  assert.equal(b.record.modules.some((m) => m.source === 'signature'), false);
  assert.deepEqual(b.record.unlocks, []);
  assert.equal(b.record.xp.granted, 180);
  assert.equal(rewardInfo('2-3', 'crossmarket', 'boss', b.save.done).confirmedSignature, false);
});

test('저장 실패 뒤 재시도: 강화는 정확히 한 번 반영된다', async () => {
  const store = new MemoryStorage(decodeSave);
  const base = { ...withCards(newSave(0), [card('a', 'AD02')], 100), done: ['2-3'] };
  const c = await store.commit(null, () => base);
  assert.ok(c.ok);
  const op = (cur: CampaignSave | null) => { const r = upgradeCard(cur!, 'a'); return 'reject' in r ? { reject: r.reject, reason: r.reason } : r; };
  store.failNext = 'quota';
  assert.equal((await store.commit(1, op)).ok, false);
  const r = await store.commit(1, op);
  assert.ok(r.ok && r.value.inventory.parts === 50 && r.value.inventory.cards[0].plus === 1);
});
