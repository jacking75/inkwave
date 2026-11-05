// 목표 실행기(33번 T024). 목표의 잠김·활성·완료와 선행 조건을 ID 사건으로 처리한다. 순수 상태이며(DOM·저장 없음)
// 세계의 사건(장치 가동·적 처치·출현 정리)을 받아 완료를 판정하고, 완료 순간의 후속(통신·체크포인트)을 돌려준다.
// 구간을 물리적으로 건너뛰어도 논리적 선행 조건이 없으면 완료되지 않고, 같은 사건이 두 번 와도 한 번만 처리한다.
// 검사: tests/client/objectives.test.ts.
import type { ObjectiveDef } from './data/types.js';

export type ObjectiveStatus = 'locked' | 'active' | 'complete';
export interface Completion { id: string; comm?: string; checkpoint?: string; optional: boolean }

export class ObjectiveRunner {
  declare defs: readonly ObjectiveDef[];
  declare done: Set<string>;
  declare byId: Map<string, ObjectiveDef>;

  constructor(defs: readonly ObjectiveDef[], restored: Iterable<string> = []) {
    this.defs = defs;
    this.byId = new Map(defs.map((d) => [d.id, d]));
    this.done = new Set([...restored].filter((id) => this.byId.has(id)));
  }

  status(id: string): ObjectiveStatus {
    const d = this.byId.get(id);
    if (!d) return 'locked';
    if (this.done.has(id)) return 'complete';
    return d.requires.every((r) => this.done.has(r)) ? 'active' : 'locked';
  }
  isActive(id: string): boolean { return this.status(id) === 'active'; }

  // 사건 → 완료. 활성인 목표만 완료되며 이미 완료·잠김이면 null(중복·순서 건너뛰기 무시)
  complete(id: string): Completion | null {
    const d = this.byId.get(id);
    if (!d || this.status(id) !== 'active') return null;
    this.done.add(id);
    return { id, comm: d.comm, checkpoint: d.checkpoint, optional: !!d.optional };
  }
  onDevice(deviceId: string): Completion | null {
    const d = this.defs.find((o) => o.device === deviceId && this.status(o.id) === 'active');
    return d ? this.complete(d.id) : null;
  }
  onDefeat(unitId: string): Completion | null {
    const d = this.defs.find((o) => o.kind === 'defeat' && o.target === unitId && this.status(o.id) === 'active');
    return d ? this.complete(d.id) : null;
  }
  onCleared(encounterId: string): Completion | null {
    const d = this.defs.find((o) => o.kind === 'clear' && o.encounter === encounterId && this.status(o.id) === 'active');
    return d ? this.complete(d.id) : null;
  }

  // 지금 해야 하는 필수 목표 하나(정의 순서상 첫 활성)와 완료한 필수 목표 수
  current(): ObjectiveDef | null { return this.defs.find((d) => !d.optional && this.status(d.id) === 'active') ?? null; }
  requiredDone(): number { return this.defs.filter((d) => !d.optional && this.done.has(d.id)).length; }
  requiredTotal(): number { return this.defs.filter((d) => !d.optional).length; }
  allRequiredDone(): boolean { return this.defs.every((d) => d.optional || this.done.has(d.id)); }

  // 잠긴 목표가 왜 잠겼는지: 먼저 끝내야 하는 활성 선행 목표의 안내
  blockedBy(id: string): ObjectiveDef | null {
    const d = this.byId.get(id);
    if (!d || this.status(id) !== 'locked') return null;
    for (const r of d.requires) {
      if (this.done.has(r)) continue;
      return this.status(r) === 'active' ? this.byId.get(r)! : this.blockedBy(r);
    }
    return null;
  }

  snapshot(): string[] { return [...this.done]; }
}
