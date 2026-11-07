// 전체 캠페인 계산 완주(33번 T072): 새 저장에서 21개 임무를 해금 순서대로 한 번씩 첫 완료하며 상자를 모두 회수한다.
// 진행 차단(다음 임무 미해금)·기록 14개·서명 7개·레벨 상한·강화 단계·무기 해금·엔딩 해금·반복 지급 없음을 기획 표와 대조한다.
// 실제 플레이(전투·이동)는 mission-check와 33번 14절 사람 검증이 맡는다 — 여기서는 보상·저장 계산만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeMission, recordCrate } from '../../src/campaign/completion.js';
import { newSave, validateImport, type CampaignSave } from '../../src/campaign/save.js';
import { MISSIONS } from '../../src/campaign/definitions.js';
import { MODULES } from '../../src/campaign/data/modules.js';
import { LEVEL_CAP, START_WEAPONS, WEAPON_UNLOCK, UPGRADE_UNLOCK_MISSION } from '../../src/campaign/data/economy.js';
import { levelOf } from '../../src/campaign/growth.js';
import { unlockedWeapons, upgradeTier } from '../../src/campaign/craft.js';
import { endingUnlocked } from '../../src/campaign/challenge.js';

const hasCrate = (m: (typeof MISSIONS)[number]): boolean => m.objectives.some((o) => o.kind === 'crate');

function playThrough(): { save: CampaignSave; order: string[] } {
  let s = newSave(0);
  const order: string[] = [];
  for (let guard = 0; guard < MISSIONS.length; guard++) {
    // 해금됐지만 아직 안 한 임무 중 정의 순서 첫 번째(사람이 지도에서 고르는 순서와 무관하게 막힘이 없는지 본다)
    const m = MISSIONS.find((x) => s.unlocked.includes(x.id) && !s.done.includes(x.id));
    if (!m) break;
    const runId = 'run-' + m.id;
    if (hasCrate(m)) s = recordCrate(s, m.id, runId, m.region).save;
    const r = completeMission(s, { completionId: 'c-' + m.id, runId, mission: m, crateOpened: hasCrate(m) });
    assert.ok('save' in r, `${m.id}: ${'reason' in r ? r.reason : ''}`);
    s = r.save; order.push(m.id);
    // 저장 왕복이 진행을 잃지 않는다
    const back = validateImport(JSON.stringify(s));
    assert.ok('save' in back && JSON.stringify(back.save) === JSON.stringify(s), `${m.id}: 저장 왕복`);
  }
  return { save: s, order };
}

test('새 저장 → 21개 임무 첫 완료: 막힘 없이 엔딩까지, 기록 14·서명 7·레벨 상한·강화 +3·무기 전부', () => {
  const { save: s, order } = playThrough();
  assert.equal(order.length, 21, `막힌 지점: ${order.join(' ')}`);
  assert.deepEqual([...order].sort(), MISSIONS.map((m) => m.id).sort());
  assert.ok(endingUnlocked(s));
  const crates = MISSIONS.filter(hasCrate);
  assert.equal(crates.length, 14, '선택 상자 14개');
  assert.equal(s.records.length, 14, '기록 14개');
  assert.equal(new Set(s.records).size, 14);
  const sigAll = Object.values(MODULES).filter((d) => d.signature).map((d) => d.id);
  assert.equal(sigAll.length, 7);
  assert.deepEqual([...s.signatures].sort(), [...sigAll].sort(), '보스 7개 첫 완료로 서명 7개');
  assert.equal(levelOf(s.xp), LEVEL_CAP);
  assert.equal(upgradeTier(s), UPGRADE_UNLOCK_MISSION.length);
  const want = new Set([...START_WEAPONS, ...Object.values(WEAPON_UNLOCK).flat()]);
  assert.deepEqual(new Set(unlockedWeapons(s)), want);
});

test('완주 뒤 같은 임무를 다시 완료해도 첫 보상·기록·서명·해금이 다시 나오지 않는다', () => {
  const { save: s0 } = playThrough();
  let s = s0;
  for (const m of MISSIONS) {
    const runId = 'again-' + m.id;
    if (hasCrate(m)) s = recordCrate(s, m.id, runId, m.region).save;
    const r = completeMission(s, { completionId: 'c2-' + m.id, runId, mission: m, crateOpened: hasCrate(m) });
    assert.ok('save' in r);
    assert.equal(r.record.unlocks.length, 0, m.id);
    assert.equal(r.record.first, false, m.id);
    s = r.save;
  }
  assert.equal(s.records.length, 14);
  assert.equal(s.signatures.length, 7);
  assert.deepEqual(s.unlocked, s0.unlocked);
});
