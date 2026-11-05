// 캠페인 세션(33번 T022, 4.1절 CampaignSession). 한 임무 시도(runId)의 수명과 실행 상태를 소유한다:
//   준비(정의 검증) → 전투 → (실패 ↔ 체크포인트 재시작) → 결과. 기존 경기(연습형 Match)·플레이어·월드·무기를 재사용하되
//   4대4 자동 스폰·경기 시간·영역 승패를 쓰지 않는다. 세션이 적·장치 표식·HUD·이벤트 구독·도색 스냅숏을 소유하고 dispose()로
//   모두 정리한다. 전역 저장은 직접 덮어쓰지 않고 CampaignStore.commit(순수 변환)만 쓴다.
import * as THREE from 'three';
import { G, on, emit } from '../core/ctx.js';
import { Actor } from '../game/actor.js';
import type { Character } from '../game/character.js';
import { randomStyle } from '../game/character-style.js';
import type { CampaignPreview } from './preview.js';
import type { MissionDefinition, UnitDef, EncounterDef, DeviceDef, CheckpointDef } from './data/types.js';
import { ENEMY_ROLES } from './data/enemies.js';
import { DIFFICULTY, type DifficultyId } from './data/economy.js';
import { validateMission } from './definitions.js';
import { ObjectiveRunner, type Completion } from './objectives.js';
import { newDeviceState, stepDevice, inside, type DeviceState } from './missionDevices.js';
import { Encounters } from './encounters.js';
import { EnemyBrain, type EnemyWorld } from './enemies/brain.js';
import { RollerEliteBrain, UmbrellaCaptainBrain } from './enemies/elites.js';
import { CampaignHud, DeviceMarkers, blockText, type HudFrame } from './view.js';
import { PaintSnapshot } from './paintSnapshot.js';
import { computeStats, damageDealtMul, damageTakenMul, type StatSheet } from './stats.js';
import { equippedCards } from './inventory.js';
import { levelOf } from './growth.js';
import { recordCrate } from './completion.js';
import type { CampaignStore } from './store.js';
import type { CheckpointSnapshot } from './save.js';
import { campaignTuning } from './tuning.js';

export type SessionState = 'loading' | 'combat' | 'failed' | 'results' | 'ended';

export interface MatchLike { actors: Actor[]; local: Actor | null; paused: boolean; state: string; removeActor(a: Actor): void }
export interface SessionHost {
  CharacterClass: typeof Character;
  uiRoot: HTMLElement;
  store: CampaignStore;
  story: { comm(key: string): boolean; playPanels(id: string, onDone?: (skipped: boolean) => void): boolean; holdComms(on: boolean): void } | null;
  storyPanels(missionId: string): Record<string, string>;
  onComplete(s: CampaignSession): void;     // 결과 화면으로
  onFailOpen(s: CampaignSession): void;     // 실패 패널이 열렸다(입력 정리)
  quitToWorkshop(s: CampaignSession): void;
  openGear(s: CampaignSession): void;       // 체크포인트 대기의 장비·특성 정비
  ground(x: number, y: number, z: number): number | null;
}

// 사망 안내: 공격한 병종 → 대응 한 줄(24번 7절)
const ADVICE: Record<string, string> = {
  gunner: '짧은 연사 뒤 0.8초 쉰다 — 기둥으로 시야를 끊고 쉬는 동안 공격한다',
  painter: '퇴로를 칠하는 도색병을 먼저 정리한다',
  shield: '정면은 단단하다 — 방패를 보낸 직후 옆이나 뒤로 돌아간다',
  watcher: '긴 선 예고를 보면 엄폐 뒤로 한 칸 옮긴다',
  mortar: '원 예고가 찍히면 한쪽으로 모아 두고 빠진다',
  rollerElite: '직선 예고를 옆으로 피하고 방향을 바꾸는 동안 뒤를 친다',
  umbrellaCaptain: '방패를 보낸 직후 반대쪽으로 돌아가 등을 노린다',
};

let RUN_SEQ = 0;
const _v = new THREE.Vector3(), _proj = new THREE.Vector3();

export class CampaignSession {
  declare host: SessionHost; declare mission: MissionDefinition; declare runId: string; declare difficulty: DifficultyId;
  declare state: SessionState; declare m: MatchLike; declare preview: CampaignPreview;
  declare objectives: ObjectiveRunner; declare devices: Map<string, DeviceState>; declare encounters: Encounters<Actor>;
  declare markers: DeviceMarkers | null; declare hud: CampaignHud; declare snap: PaintSnapshot;
  declare cp: CheckpointSnapshot; declare cpDef: CheckpointDef | null;
  declare crateOpened: boolean; declare crateResult: string | null;
  declare stats: StatSheet; declare world: EnemyWorld;
  declare hitThisFrame: boolean; declare paintT: number; declare paintCache: Map<string, number>;
  declare lastInkT: number; declare failT: number; declare lastAttacker: string | null;
  declare unsubs: Array<() => unknown>; declare once: Set<string>; declare removeQ: Array<{ a: Actor; t: number }>;
  declare elapsed: number;

  constructor(host: SessionHost, mission: MissionDefinition, opts: { difficulty: DifficultyId; resume?: CheckpointSnapshot | null }) {
    const errs = validateMission(mission);
    if (errs.length) throw new Error(`캠페인 정의 오류: ${errs.join('; ')}`);   // 실행 전에 실패(33번 T021)
    this.host = host; this.mission = mission; this.difficulty = opts.difficulty;
    this.runId = opts.resume?.runId ?? `${mission.id}:${Date.now().toString(36)}:${(++RUN_SEQ).toString(36)}`;
    this.state = 'loading';
    this.cp = opts.resume ?? { missionId: mission.id, runId: this.runId, checkpointId: null, done: [], devices: [], cleared: [], dead: [], special: 0, at: 0 };
    this.cpDef = this.cp.checkpointId ? mission.checkpoints.find((c) => c.id === this.cp.checkpointId) ?? null : null;
    this.crateOpened = this.cp.devices.includes('crate'); this.crateResult = null;
    this.hitThisFrame = false; this.paintT = 0; this.paintCache = new Map(); this.lastInkT = -99; this.failT = 0; this.lastAttacker = null;
    this.unsubs = []; this.once = new Set(); this.removeQ = []; this.elapsed = 0;
    this.markers = null;
  }

  get player(): Actor | null { return this.m?.local ?? null; }

  // 경기(연습형, 플레이어만)가 만들어진 직후. 늦게 끝난 로딩이 끝난 세션에 붙지 않게 호출자가 runId를 확인한다.
  // 경기·전투 부품을 붙인다(예열용 적을 만들기 전에도 부른다)
  prepare(match: MatchLike, preview: CampaignPreview): void {
    const m = this.mission;
    this.m = match; this.preview = preview;
    const story = this.difficulty === 'story';
    preview.combat.opts.story = story;
    preview.telegraphs.story = story;
    this.world = {
      player: () => this.player,
      telegraphs: preview.telegraphs,
      telegraphMul: DIFFICULTY[this.difficulty].telegraph,
      bounds: (id) => m.segments.find((s) => s.id === id)?.bounds ?? null,
      onState: (b, s) => this._brainState(b, s),
    };
  }

  begin(match: MatchLike, preview: CampaignPreview): void {
    const m = this.mission;
    if (this.m !== match || this.preview !== preview) this.prepare(match, preview);
    this.objectives = new ObjectiveRunner(m.objectives, this.cp.done);
    this.devices = new Map(m.devices.map((d) => { const st = newDeviceState(d); if (this.cp.devices.includes(d.id)) { st.complete = true; st.progress = 1; } return [d.id, st]; }));
    this.encounters = new Encounters<Actor>(m, {
      spawn: (u, enc) => this._spawn(u, enc),
      despawn: (a) => this._despawn(a),
      marker: (u) => { const p = this._ground(u.at); preview.telegraphs.add({ shape: 'circle', origin: { x: p.x, y: p.y, z: p.z }, radius: 1.0, duration: 1.0, damage: 0, attacker: null }); },
      hpFrac: (a) => a.hp / a.tune.hp, alive: (a) => a.alive,
      objectiveDone: (id) => this.objectives.status(id) === 'complete',
      objectiveActive: (id) => this.objectives.isActive(id),
    }, { cleared: this.cp.cleared, dead: this.cp.dead });
    this.encounters.onCleared = (id) => this._handle(this.objectives.onCleared(id));
    this.hud = new CampaignHud(this.host.uiRoot);
    this.hud.setTemporary(this.host.store.temporary);
    this.markers = new DeviceMarkers(G.scene!, m.devices, (d) => this._ground(d.at));
    this.markers.addCheckpoints(m.checkpoints.map((c) => ({ id: c.id, at: this._ground(c.at) })));
    this.markers.setCheckpoint(this.cp.checkpointId);
    this.snap = new PaintSnapshot(G.paint);
    // 전투 보정: 성장·장비·특성·난이도
    this._applyStats();
    preview.combat.hooks = {
      playerTaken: (amount, attacker) => {
        const p = this.player;
        if (attacker && attacker.team !== p?.team) this.hitThisFrame = true;
        if (attacker) this.lastAttacker = (attacker.bot as EnemyBrain | undefined)?.unit?.role ?? null;
        const onObj = !!p && m.devices.some((d) => this.objectives.isActive(this._objOf(d.id) ?? '') && inside(d, p.pos));
        return amount * DIFFICULTY[this.difficulty].enemyDamage * damageTakenMul(this.stats, { onObjective: onObj, justLeftInk: G.time - this.lastInkT < 2 });
      },
      enemyTaken: (victim, amount, attacker) => this._enemyTaken(victim, amount, attacker),
      poiseTaken: (victim, attacker) => !this._shieldFront(victim, attacker),
      // 방패·감시·포격병과 정예·대장의 피해는 예고 형태가 판정한다. 같은 공격의 무기 탄환은 동작일 뿐이다(이중 피해 없음)
      harmless: (attacker, source) => source !== 'telegraph' && ((attacker?.bot as EnemyBrain | undefined)?.def?.damage ?? 0) > 0,
      inkMul: (a) => (a.intent.sub ? this.stats.subInkMul : this.stats.mainInkMul),
      specialMul: () => this.stats.specialChargeMul,
    };
    this.unsubs.push(
      on('splatted', (e: { victim: Actor; attacker: Actor | null }) => this._splatted(e.victim, e.attacker)),
    );
    // 캠페인에는 아군·기지 점프가 없다(지도에서 존재하지 않는 대상으로 뛰지 않는다, 33번 T018)
    const pl = this.player;
    if (pl) (pl as unknown as { superJump: () => boolean }).superJump = () => false;
    // 시작 위치(또는 체크포인트) → 재시작 기준 스냅숏
    this._placePlayer();
    this.snap.capture();
    this.state = 'combat';
    // 진행 중 표시(새로고침 후 이어하기): 시작이면 checkpointId null
    void this.host.store.commit((s) => ({ ...s, inProgress: { ...this.cp, at: Date.now() } }));
  }

  _objOf(deviceId: string): string | null { return this.mission.objectives.find((o) => o.device === deviceId)?.id ?? null; }

  _ground(at: readonly [number, number, number]): THREE.Vector3 {
    const y = this.host.ground(at[0], at[1] + 2.5, at[2]);
    return new THREE.Vector3(at[0], y ?? at[1], at[2]);
  }

  _placePlayer(): void {
    const a = this.player;
    if (!a) return;
    const at = this.cpDef ? this.cpDef.at : this.mission.start.at, yaw = this.cpDef ? this.cpDef.yaw : this.mission.start.yaw;
    a.spawnAt(this._ground(at), yaw);
    a.invuln = 0.6;
    a.hp = a.tune.hp; a.ink = a.tune.inkMax;
    a.special = Math.min(a.specialCost(), this.cp.special);
    G.rig?.follow?.(a, true);
    if (G.rig) { (G.rig as { yaw: number; pitch: number }).yaw = yaw; (G.rig as { yaw: number; pitch: number }).pitch = -0.12; }
  }

  // 성장·장비·특성 → 캠페인 플레이어 튜닝 복사본(전역 PLAYER는 그대로)
  _applyStats(): void {
    const s = this.host.store.current;
    const level = s ? levelOf(s.xp) : 1;
    this.stats = computeStats(level, s ? equippedCards(s.inventory) : [], s?.traits ?? {});
    const c = this.preview.combat, st = this.stats;
    c.growth = { move: st.runMul - 1, swim: st.swimMul - 1 };
    const b = campaignTuning(c.growth);
    b.hp = st.hpMax; b.inkMax = st.inkMax;
    b.regenRate *= st.regenMul; b.regenRateSwim *= st.regenMul;
    b.inkRefillSwim *= st.swimRefillMul * st.refillMul; b.inkRefillKid *= st.refillMul;
    b.inkRefillDelay = Math.max(0.2, b.inkRefillDelay - st.refillDelay);
    c.base = b;
    const p = this.player;
    if (p) p.tune = { ...b };
  }

  // ---- 적
  _spawn(u: UnitDef, enc: EncounterDef): Actor {
    const def = ENEMY_ROLES[u.role];
    const a = new Actor({ team: 1, slot: this.m.actors.length, weapon: def.weapon, isBot: true, name: def.name, style: randomStyle(), CharacterClass: this.host.CharacterClass });
    G.scene!.add(a.character.root);
    this.preview.combat.attach(a, 'enemy', def.tier);
    a.tune = { ...a.tune, hp: def.hp, respawnTime: 1e9 };
    a.spawnAt(this._ground(u.at), u.yaw ?? 0);
    a.invuln = 0; a.hp = def.hp;
    const brain = u.role === 'rollerElite' ? new RollerEliteBrain(a, u, enc.segment, this.world) : u.role === 'umbrellaCaptain' ? new UmbrellaCaptainBrain(a, u, enc.segment, this.world) : new EnemyBrain(a, u, enc.segment, this.world);
    a.bot = brain as unknown as Actor['bot'];
    this.m.actors.push(a); G.actors = this.m.actors;
    this.preview.cast.addEnemy(a, def.tier);
    this.preview.enemies.push(a);
    if (def.tier !== 'grunt') emit('campaign:boss', { actor: a, name: def.name });
    return a;
  }
  _despawn(a: Actor): void {
    this.preview.telegraphs.cancelBy(a);
    const i = this.m.actors.indexOf(a);
    if (i >= 0) this.m.actors.splice(i, 1);
    const j = this.preview.enemies.indexOf(a);
    if (j >= 0) this.preview.enemies.splice(j, 1);
    G.scene!.remove(a.character.root);
    a.weaponRunner.reset(); (a.character as { dispose?(): void }).dispose?.();
    G.actors = this.m.actors;
  }

  _brainState(b: EnemyBrain, s: string): void {
    if (b instanceof UmbrellaCaptainBrain && s === 'open' && !this.once.has('weak')) { this.once.add('weak'); this.host.story?.comm('weak'); }
  }

  // 공격자가 적의 정면 쪽에 있는 정도(1 = 정면, -1 = 등 뒤)
  _facing(victim: Actor, attacker: Actor): number {
    const fx = Math.sin(victim.yaw), fz = Math.cos(victim.yaw);
    const dx = attacker.pos.x - victim.pos.x, dz = attacker.pos.z - victim.pos.z, d = Math.hypot(dx, dz) || 1;
    return (dx * fx + dz * fz) / d;
  }
  // 우산을 든 방패병·대장의 정면 공격: 피해가 줄고 버팀(스태거)도 깎지 못한다(35번 R020, 정면 사격만으로는 스태거 없음)
  _shieldFront(victim: Actor, attacker: Actor | null): boolean {
    const b = victim.bot as EnemyBrain | undefined;
    if (!b || !attacker) return false;
    const role = b.def.role;
    const shieldUp = role === 'umbrellaCaptain' ? (b as UmbrellaCaptainBrain).shieldUp : role === 'shield' ? b.state !== 'recover' : false;
    return shieldUp && this._facing(victim, attacker) > 0.35;
  }

  // 플레이어가 적에게 주는 피해: 방패 정면 감소, 후방·노출 약점, 기절 보스
  _enemyTaken(victim: Actor, amount: number, attacker: Actor | null): number {
    const b = victim.bot as EnemyBrain | undefined;
    if (!b || !attacker || attacker !== this.player) return amount;
    const role = b.def.role;
    const facing = this._facing(victim, attacker);
    if (this._shieldFront(victim, attacker)) amount *= 0.35;   // 정면은 효율이 낮지만 일반 공격으로도 들어간다
    const exposed = this.preview.combat.isExposed(victim) || (role === 'umbrellaCaptain' && b.state === 'open');
    const weak = (role === 'umbrellaCaptain' || role === 'rollerElite' || role === 'shield') && (facing < -0.3 || exposed);
    if (weak) amount *= 1.5;
    const stunned = role === 'umbrellaCaptain' && this.preview.combat.isStaggered(victim);
    return amount * damageDealtMul(this.stats, { weak, stunnedBoss: stunned });
  }

  _splatted(victim: Actor, attacker: Actor | null): void {
    if (victim === this.player) {
      victim.respawnTimer = 1e9;   // 캠페인은 자동 부활 대신 체크포인트 재도전
      if (this.state === 'combat') { this.state = 'failed'; this.failT = 1.2; this.lastAttacker = (attacker?.bot as EnemyBrain | undefined)?.unit?.role ?? this.lastAttacker; }
      return;
    }
    const who = this.encounters.killed(victim);
    if (!who) return;
    victim.respawnTimer = 1e9;
    this.preview.telegraphs.cancelBy(victim);
    this.removeQ.push({ a: victim, t: 1.6 });
    this._handle(this.objectives.onDefeat(who.unit));
    // 보스를 쓰러뜨리면 공격과 지원 출현을 모두 멈춘다
    const boss = this.mission.boss;
    if (boss && who.unit === boss.unit) { this.encounters.stop(who.enc); }
    if (this.mission.type === 'elite' && ENEMY_ROLES[(victim.bot as EnemyBrain).def.role].tier !== 'grunt') this.encounters.stop(who.enc);
  }

  // 목표 완료의 후속: 통신·체크포인트·물결 게이지
  _handle(c: Completion | null): void {
    if (!c) return;
    this.preview.combat.objective();
    if (c.comm) this.host.story?.comm(c.comm);
    if (c.checkpoint) this._activateCheckpoint(c.checkpoint);
    if (!c.optional && this.objectives.allRequiredDone()) this._finish();
  }

  _activateCheckpoint(id: string): void {
    const def = this.mission.checkpoints.find((c) => c.id === id);
    if (!def) return;
    this.cpDef = def;
    const p = this.player;
    this.cp = {
      missionId: this.mission.id, runId: this.runId, checkpointId: id,
      done: this.objectives.snapshot(), devices: [...this.devices.values()].filter((d) => d.complete).map((d) => d.id),
      cleared: this.encounters.cleared(), dead: [...this.encounters.dead], special: p ? p.special : 0, at: Date.now(),
    };
    this.snap.capture();
    this.markers?.setCheckpoint(id);
    this.hud.toast('체크포인트');
    void this.host.store.commit((s) => ({ ...s, inProgress: this.cp }));
  }

  _finish(): void {
    if (this.state !== 'combat') return;
    this.state = 'results';
    this.encounters.disposeAll();
    this.preview.telegraphs.clear();
    this.host.onComplete(this);
  }

  // ---- 체크포인트 재시작(실패·일시 정지 메뉴): 현재 구간의 적·장치·도색을 함께 되돌리고 이전 구간 완료는 유지한다
  retryCheckpoint(): void {
    if (this.state === 'results' || this.state === 'ended') return;
    this.hud.hideFail();
    G.projectiles?.clear(); G.subs?.clear(); G.specials?.clear(); (G.fx as { clear?(): void } | null)?.clear?.();
    this.preview.telegraphs.clear(); this.preview.restart();
    for (const q of this.removeQ) this._despawn(q.a);
    this.removeQ = [];
    // 출현: 체크포인트 때 정리되지 않은 묶음은 모두 처음 상태로
    this.encounters.reset(this.mission.encounters.filter((e) => !this.cp.cleared.includes(e.id)).map((e) => e.id));
    this.encounters.dead = new Set(this.cp.dead);
    this.objectives = new ObjectiveRunner(this.mission.objectives, this.cp.done);
    for (const [id, st] of this.devices) { const done = this.cp.devices.includes(id); Object.assign(st, newDeviceState(this.mission.devices.find((d) => d.id === id)!), { complete: done, progress: done ? 1 : 0 }); }
    this.crateOpened = this.cp.devices.includes('crate');
    if (!this.snap.restore()) G.paint?.clear();
    this._applyStats();   // 대기 중에 바꾼 장비·특성·난이도는 재시작에서 적용(전투 도중 토글로 적을 다시 만들지 않는다)
    const diff = this.host.store.current?.difficulty;
    if (diff && diff !== this.difficulty) {
      this.difficulty = diff;
      this.preview.combat.opts.story = diff === 'story'; this.preview.telegraphs.story = diff === 'story';
      this.world.telegraphMul = DIFFICULTY[diff].telegraph;
    }
    const a = this.player;
    if (a) { a.alive = true; a.respawnTimer = 0; a.character.setVisible(true); }
    this._placePlayer();
    this.once.delete('fail');
    this.state = 'combat';
    emit('campaign:retry', { session: this });
  }

  abandon(): void {
    // 미확정 보상은 버리고 추첨 기록(attempts)은 남긴다
    void this.host.store.commit((s) => ({ ...s, inProgress: null }));
    this.host.quitToWorkshop(this);
  }

  // ---- 프레임(시뮬레이션 dt). rawDt는 HUD용
  update(dt: number, rawDt: number, paused: boolean): void {
    if (this.state === 'ended' || this.state === 'loading') return;   // begin() 전(로딩·예열 중)에는 아무것도 하지 않는다
    const p = this.player;
    for (let i = this.removeQ.length - 1; i >= 0; i--) { const q = this.removeQ[i]; q.t -= dt; if (q.t <= 0) { this._despawn(q.a); this.removeQ.splice(i, 1); } }
    if (this.state === 'failed') {
      this.failT -= rawDt;
      if (this.failT <= 0 && !this.once.has('fail')) { this.once.add('fail'); this._openFail(); }
    }
    if (!paused && this.state === 'combat' && p) {
      this.elapsed += dt;
      if (p.anim.form === 'swim') this.lastInkT = G.time;   // 자기 잉크에서 나온 뒤 2초(이탈 보호 특성)
      this.encounters.update(dt, p.alive ? { x: p.pos.x, z: p.pos.z } : null);
      this._bossEvents();
      this._devices(dt, p);
    }
    this.hitThisFrame = false;
    // 위험 예고가 떠 있는 동안 긴 통신을 미룬다(24번 8절)
    this.host.story?.holdComms(this.preview.telegraphs.live.some((l) => l.spec.damage > 0));
    this._hud(rawDt);
  }

  _bossEvents(): void {
    // 정예·대장 등장 패널(한 번), 대장 체력 50% 페이즈
    const enc = this.mission.encounters.find((e) => e.support?.length);
    if (!enc) return;
    const lead = this.encounters.unitActor(enc.waves[0].units[0].id);
    const panels = this.host.storyPanels(this.mission.id);
    if (this.encounters.state(enc.id) === 'active' && !this.once.has('intro')) {
      this.once.add('intro');
      const pid = panels.bossIntro ?? panels.midBoss;
      if (pid) this.host.story?.playPanels(pid);
      if (this.mission.type === 'boss') this.host.story?.comm('boss');
    }
    if (lead && lead.alive && lead.bot instanceof UmbrellaCaptainBrain && lead.hp / lead.tune.hp <= 0.5 && !this.once.has('phase')) {
      this.once.add('phase'); lead.bot.enterPhase2(); this.host.story?.comm('phase');
    }
  }

  _devices(dt: number, p: Actor): void {
    this.paintT -= dt;
    const refresh = this.paintT <= 0;
    if (refresh) this.paintT = 0.25;
    const alive = p.alive ? p.pos : null;
    for (const d of this.mission.devices) {
      const st = this.devices.get(d.id)!;
      if (st.complete) continue;
      const objId = this._objOf(d.id);
      const active = objId ? this.objectives.isActive(objId) : true;
      if (refresh && (d.kind === 'terminal' || d.kind === 'stabilize')) this.paintCache.set(d.id, this._floorPaint(d, p.team));
      const enemiesInside = d.kind === 'stabilize' ? this.encounters.liveActors().filter((e) => e.alive && inside(d, e.pos)).length : 0;
      const guardsAlive = (d.guards ?? []).filter((g) => !this.encounters.dead.has(g)).length;
      const done = stepDevice(d, st, {
        player: alive, hit: this.hitThisFrame, paint: this.paintCache.get(d.id) ?? 0, enemiesInside, guardsAlive,
        clearFirstDone: !d.clearFirst || this.encounters.state(d.clearFirst) === 'cleared', active,
      }, dt);
      if (!done) continue;
      emit('campaign:device', { id: d.id, kind: d.kind });
      G.audio?.play?.('ui_confirm', { volume: 0.9 });
      if (d.kind === 'crate') this._crate();
      this._handle(this.objectives.onDevice(d.id));
    }
  }

  // 같은 높이 바닥(turf 면)의 유효 도색률: 장치 둘레 원 안 칸 중 자기 잉크 비율
  _floorPaint(d: DeviceDef, team: number): number {
    const need = d.paintNeed ?? 0.6;
    if (need <= 0) return 1;
    const P = G.paint as unknown as { level: { queryBlocks(a: number, b: number, c: number, e: number, out: number[]): number[]; blocks: Array<{ faces: number[] }>; faces: Array<{ turf: boolean; atlas: unknown; origin: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; cu: number; cv: number; nu: number; nv: number; grid: number }> }; grid: Uint8Array; dead: Uint8Array } | null;
    if (!P) return 0;
    const at = this._ground(d.at), r = d.paintRadius ?? d.radius + 0.8, own = team + 1;
    let n = 0, mine = 0;
    const ids = P.level.queryBlocks(at.x - r, at.z - r, at.x + r, at.z + r, []);
    for (const bid of ids) for (const fid of P.level.blocks[bid].faces) {
      if (fid < 0) continue;
      const f = P.level.faces[fid];
      if (!f.turf || !f.atlas || Math.abs(f.origin.y - at.y) > 0.6) continue;   // 같은 층 바닥만
      _v.set(at.x, at.y, at.z).sub(f.origin);
      const lu = _v.dot(f.u), lv = _v.dot(f.v);
      const i0 = Math.max(0, Math.floor((lu - r) / f.cu)), i1 = Math.min(f.nu - 1, Math.floor((lu + r) / f.cu));
      const j0 = Math.max(0, Math.floor((lv - r) / f.cv)), j1 = Math.min(f.nv - 1, Math.floor((lv + r) / f.cv));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const du = (i + 0.5) * f.cu - lu, dv = (j + 0.5) * f.cv - lv;
        if (du * du + dv * dv > r * r) continue;
        const k = f.grid + j * f.nu + i;
        if (P.dead[k]) continue;
        n++; if (P.grid[k] === own) mine++;
      }
    }
    return n ? mine / n : 0;
  }

  _crate(): void {
    this.crateOpened = true;
    const m = this.mission;
    // 회수한 선택 상자는 체크포인트 재시작·새로고침 뒤에도 회수한 상태로 남는다(같은 상자를 두 번 얻지 않는다)
    const crateObj = m.objectives.find((o) => o.kind === 'crate');
    const dev = m.devices.find((d) => d.kind === 'crate');
    if (crateObj && !this.cp.done.includes(crateObj.id)) this.cp = { ...this.cp, done: [...this.cp.done, crateObj.id] };
    if (dev && !this.cp.devices.includes(dev.id)) this.cp = { ...this.cp, devices: [...this.cp.devices, dev.id] };
    const snap = this.cp;
    void this.host.store.commit((s) => { const r = recordCrate(s, m.id, this.runId, m.region); this.crateResult = r.result.defId; return { ...r.save, inProgress: snap }; })
      .then((r) => { if (!r.ok) this.hud.toast('상자 기록 저장 실패 — 완료 때 다시 저장한다', 3); });
    this.hud.toast('★ 선택 상자 회수');
  }

  _openFail(): void {
    const role = this.lastAttacker;
    const name = role ? ENEMY_ROLES[role as keyof typeof ENEMY_ROLES]?.name ?? '잔향' : '잔향';
    this.host.onFailOpen(this);
    this.hud.showFail(`${name}의 공격`, ADVICE[role ?? ''] ?? '엄폐 뒤에서 잉크를 채우고 다시 접근한다', [
      { label: '체크포인트에서 다시', primary: true, run: () => this.retryCheckpoint() },
      { label: '장비·특성 정비', run: () => this.host.openGear(this) },
      { label: '작업장으로', run: () => this.abandon() },
    ]);
  }

  _hud(rawDt: number): void {
    const p = this.player, cam = G.camera;
    const cur = this.objectives.current();
    let block: string | null = null;
    if (cur?.device) block = blockText(this.devices.get(cur.device)?.block ?? null);
    const crate = this.mission.devices.find((d) => d.kind === 'crate');
    const boss = this.mission.boss ?? (this.mission.type === 'elite' ? { name: ENEMY_ROLES.rollerElite.name, unit: 'elite' } : null);
    const bossA = boss ? this.encounters.unitActor(boss.unit) : null;
    let target: HudFrame['target'] = null;
    const devId = cur?.device ?? null;
    if (devId && p && cam) {
      const d = this.mission.devices.find((x) => x.id === devId)!;
      const g = this._ground(d.at);
      _proj.set(g.x, g.y + 1.6, g.z).project(cam);
      const W = innerWidth, H = innerHeight, behind = _proj.z > 1;
      let x = (_proj.x * 0.5 + 0.5) * W, y = (-_proj.y * 0.5 + 0.5) * H;
      const onScreen = !behind && x > 40 && x < W - 40 && y > 40 && y < H - 40;
      if (!onScreen) { let dx = x - W / 2, dy = y - H / 2; if (behind) { dx = -dx; dy = -dy; } const a = Math.atan2(dy, dx); const k = Math.min((W / 2 - 60) / Math.max(1e-3, Math.abs(Math.cos(a))), (H / 2 - 60) / Math.max(1e-3, Math.abs(Math.sin(a)))); x = W / 2 + Math.cos(a) * k; y = H / 2 + Math.sin(a) * k; }
      target = { x, y, onScreen, dist: p.pos.distanceTo(g) };
    }
    const bb = bossA?.bot as EnemyBrain | undefined;
    const exposedLeft = bb && bb.state === 'open' ? Math.max(0, 3 - bb.t) : 0;
    this.hud.update({
      objective: cur, done: this.objectives.requiredDone(), total: this.objectives.requiredTotal(), block,
      hint: cur ? this.mission.hints?.[cur.id] ?? null : null,
      crate: !crate ? 'none' : this.crateOpened ? 'got' : 'open',
      boss: bossA && bossA.alive ? { name: boss!.name, hp: bossA.hp / bossA.tune.hp, exposed: exposedLeft } : null,
      target, marks: [], pending: this.crateOpened ? 1 : 0,
    }, rawDt);
    this.markers?.update(this.devices, devId, G.teamColors[0] ?? new THREE.Color(1, 0.55, 0.1), G.time, (id) => { const o = this._objOf(id); return o ? this.objectives.isActive(o) : true; });
  }

  setHudVisible(on: boolean): void { this.hud.setVisible(on); }

  dispose(): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.encounters?.disposeAll();
    for (const q of this.removeQ) this._despawn(q.a);
    this.removeQ = [];
    this.markers?.dispose(); this.markers = null;
    this.hud?.dispose();
    this.snap?.dispose();
    if (this.preview) this.preview.combat.hooks = {};
    const pl = this.player;
    if (pl && Object.prototype.hasOwnProperty.call(pl, 'superJump')) delete (pl as unknown as { superJump?: unknown }).superJump;
    this.host.story?.holdComms(false);
  }
}
