// 캠페인 전투 실행기(35번 R016~R020). 핸들링 오버레이·퍼펙트 잠수·잉크 서지·물결 게이지·경직/스태거를 한곳에서
// 실행한다. 판정·수치는 같은 폴더의 순수 모듈(perfectDive·surge·waveGauge·stagger·tuning)이 갖고, 여기는 Actor·이벤트·
// 연출에 연결하는 외부 효과만 둔다.
//
// 수명: 캠페인 세션(33번 T022)이 만들고 dispose()로 끝낸다. 세션 전에는 ?tune=campaign 미리보기가 오프라인 경기
// (연습·대전)에서 만든다(src/campaign/preview.ts). G.campaign이 없으면(대전·온라인) Actor의 훅은 아무것도 하지 않는다.
//
// Actor 훅(src/game/actor.ts): beforeUpdate(스태거 중 의도 0) → squidPressed(서지 감지) → move(서지·넉백 속도)
// → intercept(damage 안: 퍼펙트 잠수·피해 배율) → inkCostMul·specialChargeMul(물결 효과).
import * as THREE from 'three';
import { G, on, emit } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import { PLAYER } from '../../config.js';
import type { TimeScale } from './timeScale.js';
import { PERFECT, isPerfectDive } from './perfectDive.js';
import { SURGE, DoubleTap, canSurge, surgeSpeed } from './surge.js';
import { WaveGauge, waveEffects, type WaveGain, type WaveLevel } from './waveGauge.js';
import { Poise, STAGGER, roleOfWeapon, type EnemyTier } from './stagger.js';
import { CombatFeedback } from './feedback.js';
import { applyTemp, campaignTuning, enemyTuning, restoreTuning, NO_GROWTH, ENEMY_HANDLING, type GrowthMods, type PlayerTuning } from '../tuning.js';

export type CombatRole = 'player' | 'enemy' | 'ally';

// 다른 모듈(HUD·카메라·인물 반응)이 읽는 계약
export interface CampaignRuntime { time: TimeScale; combat: CampaignCombat }

export interface DamageIntercept { amount: number; perfect: boolean; attacker: Actor | null }

// expect: 직전 프레임에 기대한 이동 거리 m, from: 그때의 위치(실제 이동과 비교해 벽 충돌을 안다)
interface Surge { t: number; dir: THREE.Vector3; trailT: number; expect: number; from: THREE.Vector3 }
interface Knock { left: number; v: THREE.Vector3 }
interface Entry { role: CombatRole; poise: Poise | null; exposeLeft: number; knock: Knock | null; reaction?: number }

export interface CombatOptions {
  story?: boolean;                 // 이야기 난이도: 퍼펙트 잠수 창 0.18초
  reduceMotion?: () => boolean;    // 시간 정지·카메라 펀치를 끈다
  growth?: GrowthMods;
}

interface BotWithDiff { diff?: { reaction: number } }

const _v = new THREE.Vector3();

export class CampaignCombat {
  declare time: TimeScale; declare opts: CombatOptions;
  declare wave: WaveGauge; declare entries: Map<Actor, Entry>;
  declare player: Actor | null; declare base: PlayerTuning; declare growth: GrowthMods;
  declare tap: DoubleTap; declare surge: Surge | null; declare surgeCd: number;
  declare buffLeft: number; declare lastPerfect: Map<Actor, number>;
  declare feedback: CombatFeedback;
  declare inputBlocked: boolean;   // 막는 대본·컷신 동안 플레이어 전투 입력을 지운다(R026·R027)
  declare hitRef: { time: number; after: number } | null;   // 텔레그래프 피해 처리 중의 퍼펙트 기준 시각
  declare unsubs: Array<() => unknown>;

  constructor(time: TimeScale, opts: CombatOptions = {}) {
    this.time = time; this.opts = opts;
    this.wave = new WaveGauge(); this.entries = new Map();
    this.player = null; this.growth = opts.growth ?? NO_GROWTH; this.base = campaignTuning(this.growth);
    this.tap = new DoubleTap(); this.surge = null; this.surgeCd = 0;
    this.buffLeft = 0; this.lastPerfect = new Map();
    this.hitRef = null; this.inputBlocked = false;
    this.feedback = new CombatFeedback(time, () => this._calm(), () => ({
      rig: G.rig as { punch?(k: 'kill' | 'elite'): void; kickFov?(d: number, s: number): void } | null,
      rumble: (a, b, ms) => (G.input as { rumble?(a: number, b: number, ms: number): void } | null)?.rumble?.(a, b, ms),
    }));
    this.unsubs = [
      on('damage', (e: { victim: Actor; attacker: Actor | null; amount: number; source: string }) => this._onDamage(e)),
      on('splatted', (e: { victim: Actor; attacker: Actor | null }) => this._onSplatted(e)),
      on('respawn', (e: { actor: Actor }) => { const n = this.entries.get(e.actor); n?.poise?.reset(); if (n) { n.exposeLeft = 0; n.knock = null; } }),
    ];
  }

  // 참가자 등록: 플레이어는 캠페인 핸들링, 적은 느린 이동·반응 지연 +0.1초와 버팀(poise)을 받는다.
  attach(a: Actor, role: CombatRole, tier: EnemyTier = 'grunt'): void {
    const entry: Entry = { role, poise: null, exposeLeft: 0, knock: null };
    if (role === 'player') {
      this.player = a;
      a.tune = { ...this.base };
    } else if (role === 'enemy') {
      a.tune = enemyTuning();
      entry.poise = new Poise(roleOfWeapon(a.weapon.kind), tier);
      const bot = a.bot as BotWithDiff | undefined;
      if (bot?.diff) { entry.reaction = bot.diff.reaction; bot.diff = { ...bot.diff, reaction: bot.diff.reaction + ENEMY_HANDLING.reactionAdd }; }
    }
    this.entries.set(a, entry);
  }

  // 세션 종료: 모든 튜닝을 PLAYER로, 봇 반응을 원래대로 되돌리고 구독을 끊는다(다른 모드에 효과가 남지 않는다).
  dispose(): void {
    for (const [a, n] of this.entries) {
      restoreTuning(a);
      const bot = a.bot as BotWithDiff | undefined;
      if (n.reaction !== undefined && bot?.diff) bot.diff = { ...bot.diff, reaction: n.reaction };
    }
    this.entries.clear(); this.player = null; this.surge = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    G.rig?.setWaveLevel?.(0);
  }

  entry(a: Actor): Entry | undefined { return this.entries.get(a); }
  tierOf(a: Actor): EnemyTier | null { return this.entries.get(a)?.poise?.tier ?? null; }
  isStaggered(a: Actor): boolean { return !!this.entries.get(a)?.poise?.staggered; }
  isExposed(a: Actor): boolean { const n = this.entries.get(a); return !!n && (n.exposeLeft > 0 || (n.poise?.exposeLeft ?? 0) > 0); }

  // ---------------------------------------------------------------- 프레임(main이 시뮬레이션 dt로 부른다)
  update(dt: number): void {
    const prev = this.wave.update(dt);
    if (prev !== null) this._waveChanged(prev);
    this.surgeCd = Math.max(0, this.surgeCd - dt);
    this.buffLeft = Math.max(0, this.buffLeft - dt);
    for (const [a, n] of this.entries) {
      n.exposeLeft = Math.max(0, n.exposeLeft - dt);
      if (n.poise && n.poise.update(dt)) emit('enemy:staggerEnd', { actor: a });
    }
    const p = this.player;
    if (p) {
      const fx = waveEffects(this.wave.level);
      const b = this.buffLeft > 0;
      applyTemp(p.tune, this.base, this.growth, { wave: fx.move, buffRun: b ? PERFECT.buffRun : 0, buffSwim: b ? PERFECT.buffSwim : 0 });
    }
  }

  // ---------------------------------------------------------------- Actor 훅
  // 스태거 중인 적은 아무 의도도 내지 않는다(봇 두뇌가 이번 프레임에 쓴 의도를 지운다). 대본·컷신 중의 플레이어도 같다.
  beforeUpdate(a: Actor): void {
    if (!this.isStaggered(a) && !(this.inputBlocked && a === this.player)) return;
    const it = a.intent;
    it.move.set(0, 0, 0); it.jump = false; it.squid = false; it.fire = false; it.sub = false; it.special = false;
  }

  // 잠수 키 상승 에지(플레이어만): 두 번째 에지가 SURGE.doubleTap 안이면 서지를 시도한다.
  squidPressed(a: Actor): void {
    if (a !== this.player || !this.tap.press(G.time)) return;
    const gate = {
      ink: a.ink, cooldownLeft: this.surgeCd, alive: a.alive, busy: !!a.specialActive || !!a.superJumpState || a.climbing,
      onEnemyInk: a.grounded && a.groundTeam === 2, onOwnInkOrSquid: (a.grounded && a.groundTeam === 1) || a.form === 'squid',
    };
    if (!canSurge(gate)) return;
    const mv = a.intent.move;
    const dir = Math.hypot(mv.x, mv.z) > 0.1 ? new THREE.Vector3(mv.x, 0, mv.z).normalize() : new THREE.Vector3(Math.sin(a.aimYaw), 0, Math.cos(a.aimYaw));
    a.ink -= SURGE.ink;
    this.surgeCd = SURGE.cooldown;
    this.surge = { t: 0, dir, trailT: 0, expect: 0, from: a.pos.clone() };
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    a.character.trigger('dodge', { x: dir.x * cy - dir.z * sy, z: dir.x * sy + dir.z * cy, t: SURGE.duration });
    if (!this._calm()) G.rig?.kickSurge?.(SURGE.duration + 0.1);
    G.audio?.play('swim_splash', { volume: 0.8 });
    emit('fx:word', { text: '촥!', pos: _v.copy(a.pos).setY(a.pos.y + 1.2), kind: 'surge', color: G.teamHex[a.team] });
    emit('action:surge', { actor: a, dir: dir.clone(), pos: a.pos.clone() });
  }

  // 수평 속도: 서지가 진행 중이면 서지가 갖고, 넉백은 그 위에 더한다. _horizontal 뒤에 부른다.
  move(a: Actor, dt: number): void {
    const s = a === this.player ? this.surge : null;
    if (s) {
      // 벽에 막힘(직전 프레임 실제 이동이 기대의 절반 미만) · 점프(수평 속도를 유지한 채 끝남) · 시간 끝.
      // 속도가 아니라 위치로 본다: _horizontal의 감속이 서지 속도를 매 프레임 먼저 깎기 때문이다.
      const moved = Math.hypot(a.pos.x - s.from.x, a.pos.z - s.from.z);
      const blocked = s.t > 0 && moved < s.expect * SURGE.wallStop;
      const jumped = !a.grounded && a.vel.y > 0.5;
      if (blocked || jumped || s.t >= SURGE.duration || !a.alive) { this.surge = null; }
      else {
        const v = surgeSpeed(s.t);
        a.vel.x = s.dir.x * v; a.vel.z = s.dir.z * v;
        s.expect = v * dt; s.from.copy(a.pos); s.t += dt; s.trailT -= dt;
        if (s.trailT <= 0) {
          s.trailT = SURGE.trailEvery;
          const area = G.paint!.splat(_v.copy(a.pos).setY(a.pos.y + 0.2), SURGE.trailRadius, a.team, { seed: Math.random() });
          a.addTurf(area, SURGE.trailSpecialK);
        }
      }
    }
    // 넉백은 속도 모델(가감속)에 먹히지 않도록 위치로 민다. 이어지는 충돌 해소가 벽 밖으로 밀어낸다.
    const k = this.entries.get(a)?.knock;
    if (k && k.left > 0) { const t = Math.min(dt, k.left); a.pos.x += k.v.x * t; a.pos.z += k.v.z * t; k.left -= dt; }
  }

  // damage() 안: 퍼펙트 잠수면 그 공격을 무효화한다. 적이 받는 피해에는 노출·스태거 배율을 곱한다.
  intercept(victim: Actor, amount: number, attacker: Actor | null, source: string): DamageIntercept {
    const now = G.time;
    if (victim === this.player) {
      if (this.surge && this.surge.t < SURGE.invuln) return { amount: 0, perfect: false, attacker };
      const perfect = isPerfectDive({
        now, squidPressedAt: victim._squidPressT, window: this.opts.story ? PERFECT.windowStory : PERFECT.window, source,
        hasAttacker: !!attacker, onEnemyInk: victim.grounded && victim.groundTeam === 2, alive: victim.alive,
        specialActive: !!victim.specialActive, lastPerfectVsAttacker: attacker ? this.lastPerfect.get(attacker) ?? -Infinity : -Infinity,
        refTime: this.hitRef?.time, after: this.hitRef?.after,
      });
      if (perfect && attacker) { this._perfect(victim, attacker, source); return { amount: 0, perfect: true, attacker }; }
      return { amount, perfect: false, attacker };
    }
    const n = this.entries.get(victim);
    if (n && n.role === 'enemy') {
      if (n.exposeLeft > 0) amount *= PERFECT.exposeMul;
      if (n.poise) amount *= n.poise.damageMul();
    }
    return { amount, perfect: false, attacker };
  }

  // 예고(텔레그래프)가 끝난 공격의 피해: 퍼펙트 잠수 기준을 예고 종료 시각으로 두고 damage()를 부른다(R022)
  telegraphHit(victim: Actor, amount: number, attacker: Actor | null, endAt: number, after: number): boolean {
    this.hitRef = { time: endAt, after };
    try { return victim.damage(amount, attacker, 'telegraph'); } finally { this.hitRef = null; }
  }

  inkCostMul(a: Actor): number { return a === this.player ? waveEffects(this.wave.level).inkMul : 1; }
  specialChargeMul(a: Actor): number { return a === this.player ? waveEffects(this.wave.level).specialMul : 1; }
  waveGlow(a: Actor): boolean { return a === this.player && waveEffects(this.wave.level).glow; }

  // 목표 완료(33번 T024 목표 실행기가 부른다)
  objective(): void { this._gain('objective'); emit('action:objective', { actor: this.player }); }

  // ---------------------------------------------------------------- 내부
  _calm(): boolean { return !!this.opts.reduceMotion?.(); }

  _perfect(p: Actor, attacker: Actor, source: string): void {
    this.lastPerfect.set(attacker, G.time);
    if (!this._calm()) { this.feedback.hitstop(PERFECT.hitstop, 'perfect', PERFECT.hitstopScale); this.time.slow(PERFECT.slow, PERFECT.slowScale); }
    p.ink = Math.min(p.tune.inkMax, p.ink + PERFECT.ink);
    if (!p.specialActive) {
      const was = p.specialReady();
      p.special = Math.min(p.specialCost(), p.special + PERFECT.special);
      if (!was && p.specialReady()) emit('special:ready', { actor: p });
    }
    const n = this.entries.get(attacker);
    if (n) n.exposeLeft = PERFECT.expose;
    this.buffLeft = PERFECT.buffT;
    this._gain('perfect');
    if (!this._calm()) G.rig?.kickFov?.(PERFECT.fovKick, PERFECT.slow);
    G.audio?.play('squid_in', { volume: 1 });
    emit('fx:word', { text: '슈웅—', pos: _v.copy(p.pos).setY(p.pos.y + 1.3), kind: 'perfect', color: G.teamHex[p.team] });
    emit('action:perfectDive', { actor: p, attacker, source });
  }

  _gain(kind: WaveGain): void {
    const prev = this.wave.gain(kind);
    if (prev !== null) this._waveChanged(prev);
  }

  _waveChanged(prev: WaveLevel): void {
    const level = this.wave.level;
    G.rig?.setWaveLevel?.(level);
    emit('action:wave', { actor: this.player, level, prev, points: this.wave.points });
  }

  _onDamage(e: { victim: Actor; attacker: Actor | null; amount: number; source: string }): void {
    const p = this.player;
    if (!p) return;
    if (e.victim === p) {
      const prev = this.wave.hurt();
      if (prev !== null) this._waveChanged(prev);
      return;
    }
    const n = this.entries.get(e.victim);
    if (!n || n.role !== 'enemy' || e.attacker !== p) return;
    this._gain('hit');
    // 넉백: 공격자 → 피해자 방향으로 0.25 m(방패병 0.1 m)를 0.12초에 걸쳐
    const v = e.victim, dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    const dist = n.poise ? n.poise.knockback() : STAGGER.knockback;
    n.knock = { left: STAGGER.knockbackTime, v: new THREE.Vector3((dx / d) * dist / STAGGER.knockbackTime, 0, (dz / d) * dist / STAGGER.knockbackTime) };
    if (n.poise && n.poise.hit(e.amount) === 'stagger') {
      const exposeWeak = n.poise.tier !== 'grunt';
      // 몸이 크게 흔들린다(character.js의 누적 피격 비틀거림을 끌어낸다)
      const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
      const lx = -(dx / d) * cy + (dz / d) * sy, lz = -(dx / d) * sy - (dz / d) * cy;
      v.character.trigger('hit', { x: lx, z: lz, amp: 1.6 });
      v.character.trigger('hit', { x: lx, z: lz, amp: 1.6 });
      emit('fx:word', { text: '퍽!', pos: _v.copy(v.pos).setY(v.pos.y + 1.4), kind: 'stagger', color: G.teamHex[p.team] });
      emit('enemy:stagger', { actor: v, by: p, exposeWeak });
    }
  }

  _onSplatted(e: { victim: Actor; attacker: Actor | null }): void {
    const p = this.player;
    if (!p) return;
    if (e.victim === p) { const prev = this.wave.death(); if (prev !== null) this._waveChanged(prev); this.surge = null; return; }
    const n = this.entries.get(e.victim);
    if (n?.role === 'enemy' && e.attacker === p) {
      this._gain(n.poise && n.poise.tier !== 'grunt' ? 'elite' : 'kill');
      this.feedback.kill(e.victim, n.poise?.tier ?? null);
    }
  }
}

// 기본 PLAYER와 같은지(세션 밖 검사용)
export function isDefaultTuning(a: { tune: PlayerTuning }): boolean { return a.tune === PLAYER; }
