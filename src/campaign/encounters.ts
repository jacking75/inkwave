// 출현 묶음 실행기(33번 T026). 발동 영역·선행 목표를 만족하면 웨이브를 순서대로 내보낸다.
//   - 출현 표식(바닥 원)을 최소 1초 먼저 보여 준 뒤 적을 만든다(화면 밖 즉시 사격 없음).
//   - 동시 활성 상한을 지키고, 쓰러진 일반 적은 다시 나오지 않는다(무한 재소환 없음).
//   - 정예·대장의 체력 경계 지원은 경계마다 한 번만 부른다.
//   - 선택 경로(route)는 그 경로의 영역에 들어간 묶음만 발동한다.
// 세계 효과(적 Actor 생성·제거·예고 표식)는 host가 한다. 이 모듈은 상태와 순서만 갖는다.
import type { EncounterDef, MissionDefinition, UnitDef } from './data/types.js';

export type EncounterState = 'idle' | 'active' | 'cleared';
export interface EncounterHost<A> {
  spawn(unit: UnitDef, enc: EncounterDef): A;
  despawn(actor: A): void;
  marker(unit: UnitDef): void;               // 출현 표식(1초 예고)
  hpFrac(actor: A): number;                  // 0..1
  alive(actor: A): boolean;
  objectiveDone(id: string): boolean;
  objectiveActive(id: string): boolean;
}
export const SPAWN_MARK = 1.0;               // s

interface Pending { unit: UnitDef; t: number }
interface Run<A> { def: EncounterDef; state: EncounterState; wave: number; gap: number; pending: Pending[]; live: Map<string, A>; support: Set<string> }

export class Encounters<A> {
  declare host: EncounterHost<A>; declare runs: Map<string, Run<A>>; declare dead: Set<string>;
  declare onCleared: ((id: string) => void) | null; declare onDeath: ((unitId: string, encId: string) => void) | null;

  constructor(m: MissionDefinition, host: EncounterHost<A>, restored: { cleared?: string[]; dead?: string[] } = {}) {
    this.host = host;
    this.dead = new Set(restored.dead ?? []);
    this.runs = new Map(m.encounters.map((d) => [d.id, { def: d, state: (restored.cleared ?? []).includes(d.id) ? 'cleared' : 'idle', wave: 0, gap: 0, pending: [], live: new Map(), support: new Set() } as Run<A>]));
    this.onCleared = null; this.onDeath = null;
  }

  state(id: string): EncounterState { return this.runs.get(id)?.state ?? 'idle'; }
  cleared(): string[] { return [...this.runs.values()].filter((r) => r.state === 'cleared').map((r) => r.def.id); }
  activeCount(): number { let n = 0; for (const r of this.runs.values()) n += r.live.size + r.pending.length; return n; }
  liveActors(): A[] { const out: A[] = []; for (const r of this.runs.values()) for (const a of r.live.values()) out.push(a); return out; }
  unitActor(unitId: string): A | null { for (const r of this.runs.values()) { const a = r.live.get(unitId); if (a) return a; } return null; }
  unitOf(actor: A): { unit: string; enc: string } | null { for (const r of this.runs.values()) for (const [u, a] of r.live) if (a === actor) return { unit: u, enc: r.def.id }; return null; }

  _ready(d: EncounterDef): boolean {
    if ((d.requires ?? []).some((r) => !this.host.objectiveDone(r))) return false;
    if (d.requiresActive && !this.host.objectiveActive(d.requiresActive)) return false;
    return true;
  }

  update(dt: number, player: { x: number; z: number } | null): void {
    for (const r of this.runs.values()) {
      const d = r.def;
      if (r.state === 'idle') {
        if (!player || !this._ready(d)) continue;
        const [x0, x1, z0, z1] = d.area;
        if (player.x < x0 || player.x > x1 || player.z < z0 || player.z > z1) continue;
        r.state = 'active'; r.wave = 0; r.gap = 0;
        this._queueWave(r);
        continue;
      }
      if (r.state !== 'active') continue;
      // 출현 표식이 끝난 적을 만든다
      for (let i = r.pending.length - 1; i >= 0; i--) {
        const p = r.pending[i];
        p.t -= dt;
        if (p.t > 0) continue;
        r.pending.splice(i, 1);
        r.live.set(p.unit.id, this.host.spawn(p.unit, d));
      }
      // 체력 경계 지원(한 번씩)
      for (const s of d.support ?? []) {
        if (r.support.has(s.unit.id)) continue;
        const lead = r.live.get(d.waves[0].units[0].id);   // 정예·대장 = 첫 웨이브의 첫 유닛
        if (lead && this.host.alive(lead) && this.host.hpFrac(lead) <= s.hpBelow) { r.support.add(s.unit.id); this._queue(r, s.unit); }
      }
      if (r.live.size || r.pending.length) continue;
      // 웨이브 정리 → 다음 웨이브(쉬는 시간) 또는 묶음 정리
      if (r.wave + 1 < d.waves.length) {
        r.gap += dt;
        if (r.gap >= (d.waves[r.wave + 1].gapBefore ?? 0)) { r.wave++; r.gap = 0; this._queueWave(r); }
      } else {
        r.state = 'cleared';
        this.onCleared?.(d.id);
      }
    }
  }

  _queueWave(r: Run<A>): void { for (const u of r.def.waves[r.wave].units) if (!this.dead.has(u.id)) this._queue(r, u); }
  _queue(r: Run<A>, u: UnitDef): void {
    if (r.live.size + r.pending.length >= r.def.maxActive) return;   // 동시 상한
    r.pending.push({ unit: u, t: SPAWN_MARK });
    this.host.marker(u);
  }

  // 적이 쓰러졌다: 기록하고 목록에서 뺀다(다시 나오지 않는다)
  killed(actor: A): { unit: string; enc: string } | null {
    const who = this.unitOf(actor);
    if (!who) return null;
    this.runs.get(who.enc)!.live.delete(who.unit);
    this.dead.add(who.unit);
    this.onDeath?.(who.unit, who.enc);
    return who;
  }

  // 체크포인트 재시작: 지정한 묶음을 처음 상태로(살아 있는 적·대기 출현 제거, 그 묶음의 처치 기록 삭제)
  reset(ids: readonly string[]): void {
    for (const id of ids) {
      const r = this.runs.get(id);
      if (!r) continue;
      for (const a of r.live.values()) this.host.despawn(a);
      r.live.clear(); r.pending = []; r.state = 'idle'; r.wave = 0; r.gap = 0; r.support.clear();
      for (const w of r.def.waves) for (const u of w.units) this.dead.delete(u.id);
      for (const s of r.def.support ?? []) this.dead.delete(s.unit.id);
    }
  }
  // 묶음에 남은 적을 모두 거둔다(보스 처치 뒤 지원 중지, 세션 종료)
  // 정예·보스가 쓰러져 묶음을 멈춘다: 남은 지원·적을 치우고 정리 완료로 알린다(정리형 목표도 완료된다, 6-2)
  stop(id: string): void { const r = this.runs.get(id); if (!r) return; for (const a of r.live.values()) this.host.despawn(a); r.live.clear(); r.pending = []; if (r.state === 'active') { r.state = 'cleared'; this.onCleared?.(id); } }
  disposeAll(): void { for (const r of this.runs.values()) { for (const a of r.live.values()) this.host.despawn(a); r.live.clear(); r.pending = []; } }
}
