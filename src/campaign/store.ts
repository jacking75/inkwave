// 캠페인 저장 상태 관리(33번 T029). StoragePort 위에서 마지막 확정 저장(current)을 들고 있고, 모든 변경은
// commit(op) 하나로만 한다(기대 revision = current.revision). 실패하면 current를 바꾸지 않고 오류를 돌려준다(성공으로 숨기지 않는다).
// IndexedDB를 쓸 수 없으면 메모리 저장으로 임시 플레이를 하고 그 사실을 temporary로 알린다.
import { IndexedDbStorage, MemoryStorage, type CommitResult, type StoragePort, type StoreError } from '../platform/storage.js';
import { decodeSave, newSave, SAVE_DB, validateImport, type CampaignSave } from './save.js';

export class CampaignStore {
  declare port: StoragePort<CampaignSave>; declare current: CampaignSave | null;
  declare temporary: boolean; declare loadError: StoreError | null; declare backupUsed: boolean;
  declare busy: Promise<unknown>;
  declare listeners: Set<(s: CampaignSave | null) => void>;

  constructor(port?: StoragePort<CampaignSave>) {
    this.port = port ?? new IndexedDbStorage<CampaignSave>(SAVE_DB, decodeSave);
    this.current = null; this.temporary = false; this.loadError = null; this.backupUsed = false;
    this.busy = Promise.resolve(); this.listeners = new Set();
  }

  async init(): Promise<void> {
    const r = await this.port.load();
    if (r.ok) { this.current = r.value; this.backupUsed = !!r.backupUsed; this.loadError = null; return; }
    this.loadError = r.error;
    if (r.error === 'unavailable') { this.port = new MemoryStorage(decodeSave); this.temporary = true; }
    // corrupt·future: 원본을 보존하고 진행을 막는다(새 게임을 만들어도 덮어쓰지 않는다 — newGame이 확인을 요구)
  }

  get hasSave(): boolean { return !!this.current; }
  on(fn: (s: CampaignSave | null) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // 변경 하나. 동시에 두 개를 보내지 않도록 순서대로 처리한다(같은 화면의 연타도 두 번째는 최신 revision으로 다시 계산된다)
  commit(op: (s: CampaignSave) => CampaignSave | { reject: StoreError; reason?: string }): Promise<CommitResult<CampaignSave>> {
    const run = async (): Promise<CommitResult<CampaignSave>> => {
      const base = this.current;
      if (!base) return { ok: false, error: 'rejected', reason: '저장 없음' };
      const r = await this.port.commit(base.revision, (cur) => (cur ? op(cur) : { reject: 'rejected' as const }));
      if (r.ok) { this.current = r.value; for (const l of this.listeners) l(this.current); }
      else if (r.error === 'conflict') { const re = await this.port.load(); if (re.ok && re.value) { this.current = re.value; for (const l of this.listeners) l(this.current); } }
      return r;
    };
    const p = this.busy.then(run, run);
    this.busy = p.catch(() => undefined);
    return p;
  }

  // 새 게임: 기존 저장이 있으면 덮어쓰지 않는다(호출자가 확인 후 overwrite=true)
  async newGame(now: number, difficulty: CampaignSave['difficulty'], overwrite = false): Promise<CommitResult<CampaignSave>> {
    if (this.loadError === 'corrupt' || this.loadError === 'future') return { ok: false, error: this.loadError, reason: '기존 저장 보존' };
    if (this.current && !overwrite) return { ok: false, error: 'rejected', reason: '기존 저장 있음' };
    const expected = this.current?.revision ?? null;
    const r = await this.port.commit(expected, () => ({ ...newSave(now, difficulty), revision: expected ?? 0 }));
    if (r.ok) { this.current = r.value; for (const l of this.listeners) l(this.current); }
    return r;
  }

  async exportJson(): Promise<string | null> { return this.port.exportRaw(); }
  // 가져오기: 검사 실패면 아무것도 쓰지 않는다
  async importJson(json: string): Promise<CommitResult<CampaignSave>> {
    const v = validateImport(json);
    if ('error' in v) return { ok: false, error: v.error, reason: v.reason };
    const expected = this.current?.revision ?? null;
    const r = await this.port.commit(expected, () => ({ ...v.save, revision: expected ?? 0 }));
    if (r.ok) { this.current = r.value; this.loadError = null; for (const l of this.listeners) l(this.current); }
    return r;
  }
}
