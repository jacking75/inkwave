// 인물 반응 연출(35번 R011~R015 연결): 전투 사건을 인물의 표정·말풍선·퐁의 얼굴·잔향 연출로 바꾼다.
// 캠페인 세션(개발 중에는 ?tune=campaign 미리보기)이 만들고 dispose()로 끝낸다. 대전·온라인에서는 만들지 않는다.
// 규칙: 반응 표정은 castCharacter.react(0.6초 겹침 규칙), 말풍선은 'cast:say'(speech.ts), 퐁은 Pong.react이다.
// 같은 사건이 잦으면(피격·서지) 일부만 말한다(화면이 대사로 덮이지 않게).
import * as THREE from 'three';
import { G, on, emit } from '../../core/ctx.js';
import type { Actor } from '../actor.js';
import type { Character } from '../character.js';
import { setCast, react, setWaveGlow, blinkMark, setHideHook, playExpr } from './castCharacter.js';
import { EXPR, ECHO_MARK, type EchoTier, type ReactKind } from './cast.js';
import { EchoFx, prepareDissolve } from './echoFx.js';
import type { Pong } from './mascot.js';
import { roleOfWeapon, STAGGER } from '../../campaign/action/stagger.js';

// 말할 확률(반응 표정은 항상)
const SAY_CHANCE: Partial<Record<ReactKind, number>> = { kill: 0.5, hurt: 0.3, surge: 0.3, waveDown: 0.6 };
const LOW_HP = 0.3, LOW_HP_GAP = 8, IDLE_LONG = 10;
const BIG_HURT = 45;
const _p = new THREE.Vector3();

export class CastDirector {
  declare player: Actor | null; declare enemies: Set<Actor>; declare fx: EchoFx; declare pong: Pong | null;
  declare lowHpT: number; declare idleT: number; declare idleSaid: boolean; declare unsubs: Array<() => unknown>;

  constructor(scene: THREE.Scene, pong: Pong | null) {
    this.player = null; this.enemies = new Set(); this.fx = new EchoFx(scene); this.pong = pong;
    this.lowHpT = 0; this.idleT = 0; this.idleSaid = false;
    this.unsubs = [
      on('splatted', (e: { victim: Actor; attacker: Actor | null }) => {
        if (e.attacker === this.player && this.enemies.has(e.victim)) {
          this._react('kill'); this.pong?.react('joy', 1.2);
        }
      }),
      on('damage', (e: { victim: Actor; amount: number }) => {
        if (e.victim !== this.player) return;
        this._react(e.amount >= BIG_HURT ? 'bigHurt' : 'hurt');
        this.pong?.react('surprise', 0.6);
      }),
      on('action:perfectDive', () => { this._react('perfect'); this.pong?.react('wink', 0.8); }),
      on('action:surge', () => this._react('surge')),
      on('action:wave', (e: { level: number; prev: number }) => {
        if (this.player) setWaveGlow(this.player.character, e.level >= 3 ? 1 : 0);
        if (e.level > e.prev) {
          this._react('waveUp');
          if (e.level === 3) { this.pong?.react('joy', 1.4); this._pongSay('퐁! 물결이다!'); }
        } else this._react('waveDown');
      }),
      on('action:objective', () => { this._react('objective'); this.pong?.react('joy', 1.4); }),
      // 피니시(정예·대장 처치, R021): 퐁이 크게 기뻐한다
      on('action:finish', (e: { pongJoy: boolean }) => { if (e.pongJoy) { this.pong?.react('joy', 1.6); this._pongSay('해냈다! 퐁!'); } }),
      on('enemy:stagger', (e: { actor: Actor }) => {
        blinkMark(e.actor.character, STAGGER.duration);
        playExpr(e.actor.character, EXPR.wince, 0.9, STAGGER.duration);
      }),
      on('respawn', (e: { actor: Actor }) => {
        if (this.enemies.has(e.actor) && G.mode === 'match') this.fx.announce(e.actor.pos, this._mark(e.actor));
      }),
    ];
  }

  setPlayer(a: Actor): void { this.player = a; setCast(a.character, 'player'); }

  // 잔향 대원: 무채색 외형·병종 표식·소멸 연출. 컴파일 전에 불러야 소멸 셰이더가 들어간다.
  addEnemy(a: Actor, tier: EchoTier = 'grunt'): void {
    this.enemies.add(a);
    setCast(a.character, tier === 'captain' ? 'captain' : 'echo', { markColor: this._mark(a), tier });
    prepareDissolve(a.character);
    // 쓰러질 때의 숨김만 가로챈다(다른 이유의 숨김은 그대로)
    setHideHook(a.character, (c: Character) => !a.alive && this.fx.dissolve(c));
  }

  update(dt: number): void {
    this.fx.update(dt);
    const p = this.player;
    if (!p || !p.alive) { this.idleT = 0; return; }
    // 저체력: 8초에 한 번
    this.lowHpT = Math.max(0, this.lowHpT - dt);
    if (p.hp / p.tune.hp < LOW_HP && this.lowHpT <= 0) { this.lowHpT = LOW_HP_GAP; this._react('lowHp'); if (this.pong) this._pongSay('히익…!'); }
    // 오래 멈춤: 10초 무입력에 한 번(움직이면 다시)
    const it = p.intent;
    if (Math.hypot(it.move.x, it.move.z) > 0.1 || it.fire || it.jump || it.squid || it.sub) { this.idleT = 0; this.idleSaid = false; }
    else if ((this.idleT += dt) > IDLE_LONG && !this.idleSaid) { this.idleSaid = true; this._react('idleLong'); }
  }

  // 체크포인트 재시작: 종이 조각·데칼·소멸 정리
  clear(): void { this.fx.clear(); }

  dispose(): void {
    for (const u of this.unsubs) u();
    if (this.player) setCast(this.player.character, null);
    for (const a of this.enemies) setHideHook(a.character, null);
    this.fx.dispose();
    this.enemies.clear(); this.player = null;
  }

  _mark(a: Actor): string { return ECHO_MARK[roleOfWeapon(a.weapon.kind)]; }

  _react(kind: ReactKind): void {
    const p = this.player;
    if (!p) return;
    const text = react(p.character, kind, G.time);
    if (!text || Math.random() > (SAY_CHANCE[kind] ?? 1)) return;
    emit('cast:say', { actor: p, text, kind, speaker: 'player' });
  }

  _pongSay(text: string): void {
    const m = this.pong?.mesh;
    if (!m || !m.visible) return;
    emit('cast:say', { pos: _p.copy(m.position).setY(m.position.y + 0.16), text, kind: 'pong', speaker: 'pong' });
  }
}
