// 캠페인 저장 포트(33번 T029·T030, 4.1절 StoragePort). 웹은 IndexedDB의 전용 DB를 쓰고, 검사·저장 불가 환경은 메모리 구현을 쓴다.
// 한 번의 commit은 하나의 readwrite 트랜잭션 안에서 최신 값과 revision을 읽고, 기대 revision이 다르면 거절하며,
// 그렇지 않으면 순수 변환(op)을 적용해 새 값 + 직전 정상 백업을 함께 쓴다. 트랜잭션 안에서 네트워크·타이머·UI를 기다리지 않는다.
// complete 이후에만 성공을 돌려준다. 모바일 셸을 고를 때 이 포트의 다른 구현(C# 호스트 등)을 둘 수 있다.

export type StoreError = 'unavailable' | 'blocked' | 'conflict' | 'quota' | 'corrupt' | 'future' | 'rejected' | 'failed';
export interface Revisioned { revision: number }
export type CommitOp<T> = (current: T | null) => T | { reject: StoreError; reason?: string };
export type CommitResult<T> = { ok: true; value: T } | { ok: false; error: StoreError; reason?: string };
export type LoadResult<T> = { ok: true; value: T | null; raw: unknown; backupUsed?: boolean } | { ok: false; error: StoreError; reason?: string };

export interface StoragePort<T extends Revisioned> {
  load(): Promise<LoadResult<T>>;
  commit(expectedRevision: number | null, op: CommitOp<T>): Promise<CommitResult<T>>;
  exportRaw(): Promise<string | null>;
  close(): void;
}

// 저장 값의 해석(스키마 이전·검증). 실패 사유를 돌려주며 원본은 지우지 않는다.
export type Decoder<T> = (raw: unknown) => { value: T } | { error: StoreError; reason?: string };

const isReject = <T>(x: T | { reject: StoreError }): x is { reject: StoreError; reason?: string } => !!x && typeof x === 'object' && 'reject' in (x as object);

// ---- 메모리 구현(검사·IndexedDB 거부 시 임시 플레이) -----------------------------------------------------------
export class MemoryStorage<T extends Revisioned> implements StoragePort<T> {
  declare cur: unknown; declare backup: unknown; declare decode: Decoder<T>;
  declare failNext: StoreError | null;     // 검사용: 다음 commit을 이 오류로 실패시킨다
  constructor(decode: Decoder<T>, initial: unknown = null) { this.decode = decode; this.cur = initial; this.backup = null; this.failNext = null; }
  async load(): Promise<LoadResult<T>> {
    if (this.cur == null) return { ok: true, value: null, raw: null };
    const d = this.decode(this.cur);
    if ('value' in d) return { ok: true, value: d.value, raw: this.cur };
    if (d.error === 'corrupt' && this.backup != null) { const b = this.decode(this.backup); if ('value' in b) return { ok: true, value: b.value, raw: this.cur, backupUsed: true }; }
    return { ok: false, error: d.error, reason: d.reason };
  }
  async commit(expected: number | null, op: CommitOp<T>): Promise<CommitResult<T>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const now = loaded.value;
    if ((now?.revision ?? null) !== expected) return { ok: false, error: 'conflict', reason: `revision ${now?.revision ?? 'none'} ≠ ${expected}` };
    const next = op(now);
    if (isReject(next)) return { ok: false, error: next.reject, reason: next.reason };
    if (this.failNext) { const e = this.failNext; this.failNext = null; return { ok: false, error: e }; }   // 쓰기 실패: 기존 값 보존
    const out = { ...next, revision: (now?.revision ?? 0) + 1 } as T;
    this.backup = this.cur;
    this.cur = JSON.parse(JSON.stringify(out));
    return { ok: true, value: out };
  }
  async exportRaw(): Promise<string | null> { return this.cur == null ? null : JSON.stringify(this.cur); }
  close(): void { /* nothing */ }
}

// ---- IndexedDB 구현 -------------------------------------------------------------------------------------------
const STORE = 'kv', KEY = 'save', BACKUP = 'backup';

export class IndexedDbStorage<T extends Revisioned> implements StoragePort<T> {
  declare name: string; declare decode: Decoder<T>; declare db: IDBDatabase | null; declare opening: Promise<IDBDatabase> | null;
  declare onVersionChange: (() => void) | null;
  constructor(name: string, decode: Decoder<T>) { this.name = name; this.decode = decode; this.db = null; this.opening = null; this.onVersionChange = null; }

  _open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        if (typeof indexedDB === 'undefined') { reject(new StoreFailure('unavailable', 'IndexedDB 없음')); return; }
        req = indexedDB.open(this.name, 1);
      } catch (e) { reject(new StoreFailure('unavailable', String(e))); return; }
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      // 다른 탭이 옛 버전 연결을 잡고 있어 업그레이드가 막혔다: 그 탭을 닫거나 새로고침하라고 알린다
      req.onblocked = () => reject(new StoreFailure('blocked', '다른 탭이 저장소를 사용 중'));
      req.onerror = () => reject(new StoreFailure('unavailable', String(req.error)));
      req.onsuccess = () => {
        const db = req.result;
        // 다른 탭이 새 버전을 열려 하면 연결을 닫아 막지 않는다(다시 열 때 안내)
        db.onversionchange = () => { db.close(); this.db = null; this.onVersionChange?.(); };
        this.db = db; resolve(db);
      };
    }).finally(() => { this.opening = null; });
    return this.opening;
  }

  async load(): Promise<LoadResult<T>> {
    try {
      const db = await this._open();
      const [cur, bak] = await new Promise<[unknown, unknown]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
        const a = st.get(KEY), b = st.get(BACKUP);
        tx.oncomplete = () => resolve([a.result ?? null, b.result ?? null]);
        tx.onerror = () => reject(new StoreFailure('failed', String(tx.error)));
      });
      if (cur == null) return { ok: true, value: null, raw: null };
      const d = this.decode(cur);
      if ('value' in d) return { ok: true, value: d.value, raw: cur };
      if (d.error === 'corrupt' && bak != null) { const b = this.decode(bak); if ('value' in b) return { ok: true, value: b.value, raw: cur, backupUsed: true }; }
      return { ok: false, error: d.error, reason: d.reason };
    } catch (e) { return fail(e); }
  }

  async commit(expected: number | null, op: CommitOp<T>): Promise<CommitResult<T>> {
    let db: IDBDatabase;
    try { db = await this._open(); } catch (e) { return fail(e); }
    return new Promise<CommitResult<T>>((resolve) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(STORE, 'readwrite'); } catch (e) { resolve(fail(e)); return; }
      const st = tx.objectStore(STORE);
      let result: CommitResult<T> | null = null;
      const getReq = st.get(KEY);
      getReq.onsuccess = () => {
        const raw = getReq.result ?? null;
        let now: T | null = null;
        if (raw != null) {
          const d = this.decode(raw);
          if (!('value' in d)) { result = { ok: false, error: d.error, reason: d.reason }; tx.abort(); return; }
          now = d.value;
        }
        if ((now?.revision ?? null) !== expected) { result = { ok: false, error: 'conflict', reason: `revision ${now?.revision ?? 'none'} ≠ ${expected}` }; tx.abort(); return; }
        const next = op(now);
        if (isReject(next)) { result = { ok: false, error: next.reject, reason: next.reason }; tx.abort(); return; }
        const out = { ...next, revision: (now?.revision ?? 0) + 1 } as T;
        try {
          if (raw != null) st.put(raw, BACKUP);   // 직전 정상 값을 같은 트랜잭션에서 백업
          st.put(out, KEY);
        } catch (e) {
          // put이 바로 던지면(복제 불가·용량 등) 백업만 커밋되지 않게 트랜잭션을 되돌리고 실패로 알린다
          const name = (e as DOMException)?.name;
          result = { ok: false, error: name === 'QuotaExceededError' ? 'quota' : 'failed', reason: String(e) };
          try { tx.abort(); } catch { /* 이미 끝난 트랜잭션 */ }
          return;
        }
        result = { ok: true, value: out };
      };
      tx.oncomplete = () => resolve(result ?? { ok: false, error: 'failed' });
      tx.onabort = () => resolve(result && !result.ok ? result : { ok: false, error: tx.error?.name === 'QuotaExceededError' ? 'quota' : 'failed', reason: String(tx.error ?? '') });
      tx.onerror = () => { /* onabort가 따라온다 */ };
    });
  }

  async exportRaw(): Promise<string | null> {
    try {
      const db = await this._open();
      const v = await new Promise<unknown>((resolve, reject) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(KEY); tx.oncomplete = () => resolve(r.result ?? null); tx.onerror = () => reject(tx.error); });
      return v == null ? null : JSON.stringify(v);
    } catch { return null; }
  }
  close(): void { this.db?.close(); this.db = null; }
}

class StoreFailure extends Error { declare code: StoreError; constructor(code: StoreError, msg: string) { super(msg); this.code = code; } }
function fail<T>(e: unknown): { ok: false; error: StoreError; reason?: string } & CommitResult<T> {
  if (e instanceof StoreFailure) return { ok: false, error: e.code, reason: e.message };
  const name = (e as { name?: string })?.name;
  return { ok: false, error: name === 'QuotaExceededError' ? 'quota' : name === 'SecurityError' || name === 'InvalidStateError' ? 'unavailable' : 'failed', reason: String(e) };
}

export const STORE_ERROR_TEXT: Record<StoreError, string> = {
  unavailable: '이 브라우저에서는 캠페인을 저장할 수 없다(시크릿 창·저장 차단). 이번 실행에만 임시로 플레이한다.',
  blocked: '다른 탭이 저장소를 사용 중이다. 다른 INKWAVE 탭을 닫고 새로고침한다.',
  conflict: '다른 탭이나 이전 화면이 저장을 먼저 바꿨다. 새로고침해 최신 상태로 계속한다.',
  quota: '저장 공간이 부족하다. 공간을 비운 뒤 다시 저장한다.',
  corrupt: '저장 데이터가 손상됐다. 원본은 보존했다.',
  future: '더 새로운 버전의 저장이다. 게임을 최신으로 갱신한다(저장은 바꾸지 않았다).',
  rejected: '저장 조건이 맞지 않아 반영하지 않았다.',
  failed: '저장에 실패했다. 다시 저장한다.',
};
