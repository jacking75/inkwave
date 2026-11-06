// 캠페인 저장 형식·이전·검증(33번 T029, 4.1절 CampaignSave). 기존 inkwave.profile·설정과 분리한 IndexedDB 전용 저장이다.
// 스키마 버전(형식)과 콘텐츠 버전(임무 데이터)을 구분한다. 변환에 실패하면 원본을 지우지 않고 오류를 돌려준다.
// 순수 모듈이다(저장 접근은 platform/storage.ts). 검사: tests/client/save.test.ts.
import type { Decoder, StoreError } from '../platform/storage.js';
import { EMPTY_INVENTORY, type Inventory, type ModuleCard } from './inventory.js';
import type { AttemptLoot, RolledModule } from './loot.js';
import { sanitizeTraits, levelOf, pointsAt, XP_CAP, type TraitAlloc } from './growth.js';
import { MODULES, STAT_LABEL, type StatKey } from './data/modules.js';
import type { DifficultyId } from './data/economy.js';
import { INVENTORY_SLOTS } from './data/economy.js';
import type { ColorReturnSnapshot } from './colorReturn.js';
import type { ChallengeRecord } from './challenge.js';

export const SCHEMA_VERSION = 3;   // 2: signatures·colorReturn·dialogueLog(33번 T048, 35번 R005·R026), 3: challenges·marks·weaponLog·endingSeen(33번 T068)
export const CONTENT_VERSION = 1;
export const SAVE_DB = 'inkwave-campaign';

// 진행 중 임무의 체크포인트(33번 T028, 4.1절 CheckpointSnapshot) — 살아 있는 객체·GPU 텍스처는 넣지 않는다
export interface CheckpointSnapshot {
  missionId: string; runId: string; checkpointId: string | null;   // null = 임무 시작
  done: string[];              // 완료 목표
  devices: string[];           // 완료 장치
  cleared: string[];           // 정리한 출현 묶음
  dead: string[];              // 쓰러진 일반 적(다시 나오지 않는다)
  special: number;             // 구간 시작 스페셜
  at: number;                  // 저장 시각(ms)
  color?: ColorReturnSnapshot; // 구간 시작의 색 회복 구체(35번 R005 colorSpheres)
  actionDevices?: unknown;     // 레벨 액션 장치 상태(35번 R023, action/devices.ts가 해석한다)
}
export interface CompletionRecord {
  completionId: string; runId: string; missionId: string; clear: number; first: boolean;
  xp: { granted: number; applied: number; overCap: number; fromLevel: number; toLevel: number; pointsAdded: number };
  parts: number; cores: number;
  modules: Array<RolledModule & { uid: string; toPending: boolean }>;
  unlocks: string[]; record: string | null; pityAfter: number;
}
export interface CampaignSave {
  schemaVersion: number; contentVersion: number; revision: number;
  createdAt: number;
  difficulty: DifficultyId;
  unlocked: string[];          // 출전 가능한 임무
  done: string[];              // 첫 완료한 임무
  clears: Record<string, number>;
  xp: number; traits: TraitAlloc;
  inventory: Inventory;
  pity: number;                // 확정된 연속 특제 미획득 횟수
  uidSeq: number;
  records: string[];           // 찾은 선택 기록
  signatures: string[];        // 한 번이라도 얻은 서명(재제작 해금, 33번 T048)
  colorReturn: Record<string, number>;   // 지역 채도 0..1(35번 R005)
  dialogueLog: string[];       // 읽은 대본 id(기록판 다시 읽기, 35번 R026)
  challenges: Record<string, ChallengeRecord>;   // 도전 임무 기록(33번 T068)
  marks: string[];             // 도전 첫 완료로 얻은 외형 표식
  weaponLog: Record<string, string[]>;   // 무기별 공략 기록: 그 무기로 끝낸 임무 id
  endingSeen: boolean;         // 엔딩을 한 번 봤다(건너뛰어도 true, 해금은 done의 7-3에서 파생)
  attempts: Record<string, AttemptLoot>;   // 미완료 임무의 추첨 기록(포기해도 남는다)
  inProgress: CheckpointSnapshot | null;
  processed: Record<string, CompletionRecord>;   // 처리한 완료 ID(최근 PROCESSED_KEEP개)
  lastResult: string | null;   // 결과 화면을 다시 열 때 보여 줄 완료 ID
}
export const PROCESSED_KEEP = 40;

export function newSave(now: number, difficulty: DifficultyId = 'normal'): CampaignSave {
  return {
    schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION, revision: 0, createdAt: now, difficulty,
    unlocked: ['1-1'], done: [], clears: {}, xp: 0, traits: {}, inventory: { ...EMPTY_INVENTORY },
    pity: 0, uidSeq: 1, records: [], signatures: [], colorReturn: {}, dialogueLog: [], challenges: {}, marks: [], weaponLog: {}, endingSeen: false, attempts: {}, inProgress: null, processed: {}, lastResult: null,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

function card(x: unknown): ModuleCard | null {
  if (!isObj(x) || typeof x.uid !== 'string' || typeof x.defId !== 'string' || !MODULES[x.defId]) return null;
  if (x.grade !== 'common' && x.grade !== 'precise' && x.grade !== 'special') return null;
  const plus = num(x.plus, 0, 3);
  if (plus === null) return null;
  const sub = isObj(x.sub) && typeof x.sub.key === 'string' && x.sub.key in STAT_LABEL && typeof x.sub.value === 'number' ? { key: x.sub.key as StatKey, value: x.sub.value } : null;
  return { uid: x.uid, defId: x.defId, grade: x.grade, sub, plus, locked: !!x.locked, from: typeof x.from === 'string' ? x.from : '' };
}

// 저장 값(또는 가져오기 JSON)을 검증·이전한다. 깨졌으면 corrupt, 더 새로운 스키마면 future.
export const decodeSave: Decoder<CampaignSave> = (raw) => {
  let x = raw;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { return { error: 'corrupt', reason: 'JSON' }; } }
  if (!isObj(x)) return { error: 'corrupt', reason: '객체가 아님' };
  const sv = x.schemaVersion;
  if (typeof sv !== 'number') return { error: 'corrupt', reason: 'schemaVersion 없음' };
  if (sv > SCHEMA_VERSION) return { error: 'future', reason: `schema ${sv}` };
  const rev = num(x.revision, 0, Number.MAX_SAFE_INTEGER);
  const xp = num(x.xp, 0, 1e9);
  if (rev === null || xp === null) return { error: 'corrupt', reason: 'revision/xp' };
  const inv = isObj(x.inventory) ? x.inventory : null;
  if (!inv) return { error: 'corrupt', reason: 'inventory' };
  const cards = Array.isArray(inv.cards) ? inv.cards.map(card) : [];
  const pend = Array.isArray(inv.pending) ? inv.pending.map(card) : [];
  if (cards.some((c) => !c) || pend.some((c) => !c)) return { error: 'corrupt', reason: '카드' };
  const all = [...cards, ...pend] as ModuleCard[];
  if (new Set(all.map((c) => c.uid)).size !== all.length) return { error: 'corrupt', reason: '중복 카드 ID' };
  if (cards.length > INVENTORY_SLOTS) return { error: 'corrupt', reason: '보관함 초과' };
  const equipped: Inventory['equipped'] = {};
  if (isObj(inv.equipped)) for (const s of ['adapter', 'tank', 'badge'] as const) {
    const u = inv.equipped[s];
    if (typeof u === 'string') { const c = (cards as ModuleCard[]).find((k) => k.uid === u); if (c && MODULES[c.defId].slot === s) equipped[s] = u; }
  }
  const parts = num(inv.parts, 0, 1e9), cores = num(inv.cores, 0, 1e6);
  if (parts === null || cores === null) return { error: 'corrupt', reason: '재료' };
  const level = levelOf(Math.min(XP_CAP, xp));
  const save: CampaignSave = {
    schemaVersion: SCHEMA_VERSION, contentVersion: typeof x.contentVersion === 'number' ? x.contentVersion : CONTENT_VERSION,
    revision: rev, createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0,
    difficulty: x.difficulty === 'story' ? 'story' : 'normal',
    unlocked: strs(x.unlocked).length ? strs(x.unlocked) : ['1-1'], done: strs(x.done),
    clears: isObj(x.clears) ? Object.fromEntries(Object.entries(x.clears).filter(([, v]) => typeof v === 'number' && v >= 0)) as Record<string, number> : {},
    xp: Math.min(XP_CAP, xp), traits: sanitizeTraits(x.traits, pointsAt(level)),
    inventory: { cards: cards as ModuleCard[], pending: pend as ModuleCard[], equipped, parts, cores },
    pity: num(x.pity, 0, 9) ?? 0, uidSeq: Math.max(num(x.uidSeq, 1, 1e12) ?? 1, all.length + 1),
    records: strs(x.records),
    // v1 저장: 보관함의 서명 카드에서 복원한다
    signatures: [...new Set([...strs(x.signatures).filter((id) => MODULES[id]?.signature), ...all.filter((c) => MODULES[c.defId].signature).map((c) => c.defId)])],
    colorReturn: isObj(x.colorReturn) ? Object.fromEntries(Object.entries(x.colorReturn).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 1)) as Record<string, number> : {},
    dialogueLog: [...new Set(strs(x.dialogueLog))],
    challenges: isObj(x.challenges) ? Object.fromEntries(Object.entries(x.challenges).filter(([, v]) => isObj(v) && typeof v.clears === 'number' && typeof v.bestMs === 'number').map(([k, v]) => [k, { clears: (v as ChallengeRecord).clears, bestMs: (v as ChallengeRecord).bestMs, last: isObj((v as ChallengeRecord).last) ? (v as ChallengeRecord).last : null }])) : {},
    marks: [...new Set(strs(x.marks))],
    weaponLog: isObj(x.weaponLog) ? Object.fromEntries(Object.entries(x.weaponLog).map(([k, v]) => [k, [...new Set(strs(v))]])) : {},
    endingSeen: x.endingSeen === true,
    attempts: isObj(x.attempts) ? (x.attempts as Record<string, AttemptLoot>) : {},
    inProgress: isObj(x.inProgress) && typeof x.inProgress.missionId === 'string' ? (x.inProgress as unknown as CheckpointSnapshot) : null,
    processed: isObj(x.processed) ? (x.processed as Record<string, CompletionRecord>) : {},
    lastResult: typeof x.lastResult === 'string' ? x.lastResult : null,
  };
  return { value: save };
};

// 수동 가져오기: 검사를 통과해야 하고, 실패하면 기존 정상 저장을 건드리지 않는다(호출자가 commit하지 않는다)
export function validateImport(json: string): { save: CampaignSave } | { error: StoreError; reason?: string } {
  const d = decodeSave(json);
  return 'value' in d ? { save: d.value } : d;
}
export const exportFileName = (now: Date): string => `inkwave-campaign-${now.toISOString().slice(0, 10)}.json`;
