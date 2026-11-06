// 임무 완료 보상의 단일 저장 처리(33번 T030, 28번 2·4·6절). completeMission()은 저장 트랜잭션 안에서 부르는 순수 변환이다:
//   - 이미 처리한 완료 ID면 저장을 바꾸지 않고 기록된 결과를 돌려준다(완료 이벤트 두 번·결과 버튼 연타·재시도·새로고침).
//   - 다른 탭이 더 새 시도를 시작했으면(진행 중 runId가 다르면) 거절한다.
//   - 그렇지 않으면 경험치·부품·공명핵·모듈(상자 → 완료 순서)·첫 보상·해금·기록·보장 횟수를 한 번에 새 저장에 넣는다.
// 검사: tests/client/completion.test.ts.
import { COMPLETION } from './data/economy.js';
import { MODULES } from './data/modules.js';
import { districtSatAfter } from './colorReturn.js';
import type { MissionDefinition } from './data/types.js';
import { applyXp } from './growth.js';
import { addCards, makeCard, type ModuleCard } from './inventory.js';
import { basicCard, newAttempt, pityAfter, rollSource, signatureCard, type AttemptLoot, type RolledModule } from './loot.js';
import { PROCESSED_KEEP, type CampaignSave, type CompletionRecord } from './save.js';
import { logWeapon } from './challenge.js';

export interface CompletionInput {
  completionId: string;     // 완료 회차의 처리 ID(같은 결과 재시도는 같은 ID)
  runId: string;
  mission: MissionDefinition;
  crateOpened: boolean;     // 이번 시도에서 선택 상자를 회수했다
  weapon?: string | null;   // 출전 무기(무기별 공략 기록, 33번 T068)
}
export type CompletionOutcome = { save: CampaignSave; record: CompletionRecord; repeated: boolean } | { reject: 'rejected'; reason: string };

// 진행 중 시도의 추첨 기록(없으면 새로 만든다 — 시드는 runId에서 결정)
export function attemptFor(save: CampaignSave, missionId: string, runId: string): AttemptLoot {
  return save.attempts[missionId] ?? newAttempt(missionId, seedOf(runId), save.pity);
}
export function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function completeMission(save: CampaignSave, inp: CompletionInput): CompletionOutcome {
  const done = save.processed[inp.completionId];
  if (done) return { save, record: done, repeated: true };
  const m = inp.mission;
  if (save.inProgress && save.inProgress.missionId === m.id && save.inProgress.runId !== inp.runId) return { reject: 'rejected', reason: '다른 탭에서 더 새로운 시도가 진행 중이다' };
  if (!save.unlocked.includes(m.id)) return { reject: 'rejected', reason: `${m.id} 미해금` };
  const first = !save.done.includes(m.id);
  const R = COMPLETION[m.reward.kind];
  const xpGrant = R.xp + (first ? R.xpFirst : 0);
  const xp = applyXp(save.xp, xpGrant);
  let parts = R.parts + (first ? R.partsFirst : 0);
  const cores = R.core;
  // 모듈: 상자(연 순서) → 완료. 1-1 첫 완료는 무작위 완료 모듈 대신 기본 세트. 보스 첫 완료는 확정 서명(보장 무관)
  const at: AttemptLoot = JSON.parse(JSON.stringify(attemptFor(save, m.id, inp.runId)));
  if (!inp.crateOpened) at.rolls = at.rolls.filter((r) => r.source !== 'crate');   // 이번에 받지 않은 상자는 보장 횟수에 넣지 않는다
  const rolled: RolledModule[] = [];
  if (inp.crateOpened) { rolled.push(rollSource(at, 'crate', m.region)); parts += COMPLETION.crate.parts; }
  if (first && m.reward.firstSet) for (const id of m.reward.firstSet) rolled.push(basicCard(id));
  else rolled.push(rollSource(at, 'completion', m.region));
  if (first && m.reward.signature) rolled.push(signatureCard(m.reward.signature));
  const pity = pityAfter(at);
  let seq = save.uidSeq;
  const cards: ModuleCard[] = rolled.map((r) => makeCard(r, `m${seq++}`, m.id));
  const inv = addCards({ ...save.inventory, parts: save.inventory.parts + parts, cores: save.inventory.cores + cores }, cards);
  const pendingIds = new Set(inv.pending.map((c) => c.uid));
  const clear = (save.clears[m.id] ?? 0) + 1;
  const unlocks = first ? m.reward.unlocks.filter((u) => !save.unlocked.includes(u)) : [];
  const record = inp.crateOpened && m.reward.record && !save.records.includes(m.reward.record) ? m.reward.record : null;
  const rec: CompletionRecord = {
    completionId: inp.completionId, runId: inp.runId, missionId: m.id, clear, first,
    xp: { granted: xp.granted, applied: xp.applied, overCap: xp.overCap, fromLevel: xp.fromLevel, toLevel: xp.toLevel, pointsAdded: xp.pointsAdded },
    parts, cores, modules: rolled.map((r, i) => ({ ...r, uid: cards[i].uid, toPending: pendingIds.has(cards[i].uid) })),
    unlocks, record, pityAfter: pity,
  };
  const attempts = { ...save.attempts }; delete attempts[m.id];
  const processed = { ...save.processed, [inp.completionId]: rec };
  const keys = Object.keys(processed);
  if (keys.length > PROCESSED_KEEP) for (const k of keys.slice(0, keys.length - PROCESSED_KEEP)) delete processed[k];
  const newSigs = rolled.filter((r) => MODULES[r.defId].signature && !save.signatures.includes(r.defId)).map((r) => r.defId);
  const doneList = first ? [...save.done, m.id] : save.done;
  // 색 회복: 이 지역의 첫 완료 임무 수에 따른 채도(줄지 않는다)
  const regionDone = doneList.filter((id) => id.split('-')[0] === m.id.split('-')[0]).length;
  const sat = Math.max(save.colorReturn[m.region] ?? 0, districtSatAfter(regionDone));
  const next: CampaignSave = {
    ...save,
    signatures: newSigs.length ? [...save.signatures, ...new Set(newSigs)] : save.signatures,
    colorReturn: { ...save.colorReturn, [m.region]: sat },
    xp: xp.xp, pity, uidSeq: seq, inventory: inv,
    done: doneList,
    clears: { ...save.clears, [m.id]: clear },
    unlocked: [...save.unlocked, ...unlocks],
    records: record ? [...save.records, record] : save.records,
    weaponLog: logWeapon(save.weaponLog, inp.weapon, m.id),
    attempts, inProgress: null, processed, lastResult: inp.completionId,
  };
  return { save: next, record: rec, repeated: false };
}

// 상자를 열었을 때(완료 전): 미확정 추첨을 시도 기록에 남긴다(새로고침·재시작·포기 뒤에도 같은 결과, 보장 횟수 재증가 없음)
export function recordCrate(save: CampaignSave, missionId: string, runId: string, region: MissionDefinition['region']): { save: CampaignSave; result: RolledModule } {
  const at: AttemptLoot = JSON.parse(JSON.stringify(attemptFor(save, missionId, runId)));
  const result = rollSource(at, 'crate', region);
  return { save: { ...save, attempts: { ...save.attempts, [missionId]: at } }, result };
}
