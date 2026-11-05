// 캠페인 전투·연출 미리보기(?tune=campaign). 캠페인 세션(33번 T022)이 생기기 전에 R016~R020과 인물 연출(R011~R015)을
// 오프라인 경기(연습·대전·보스)에서 켜고 끄는 수명 관리자이다. 세션이 생기면 같은 부품(TimeScale·CampaignCombat·
// CastDirector·Pong·SpeechLayer·WaveRing)을 세션이 소유한다. 온라인 경기에서는 만들지 않는다.
//
// 대응: 로컬 플레이어 = 캠페인 플레이어, 상대 팀 봇 = 잔향 대원(무기 종류 → 병종, roleOfWeapon), 같은 팀 봇 = 아군.
// 종료(stop) 때 모든 튜닝·봇 반응·외형 훅을 되돌리고 G.campaign을 null로 둔다(다른 모드에 효과가 남지 않는다).
import * as THREE from 'three';
import { G, on } from '../core/ctx.js';
import type { Actor } from '../game/actor.js';
import { TimeScale } from './action/timeScale.js';
import { CampaignCombat } from './action/combat.js';
import { CastDirector } from '../game/cast/castDirector.js';
import { Pong } from '../game/cast/mascot.js';
import { SpeechLayer } from '../game/cast/speech.js';
import { Voice } from '../game/cast/voice.js';
import { WaveRing } from '../ui/waveRing.js';
import { TelegraphDirector, type TelegraphSpec } from './action/telegraph.js';
import { DeviceSet, type DeviceDef } from './action/devices.js';
import { CampaignMusic, type MusicLike } from '../audio/campaignMusic.js';

interface MatchLike { actors: Actor[]; local: Actor | null; attract?: boolean }

// 미리보기 선택 사항(main이 URL에서 읽는다): drill = 예고 공격 연습(R022), devices = 장치 배치(R023)
export interface PreviewOptions { drill?: boolean; devices?: boolean }

const DRILL_EVERY = 3.2;     // s
const DRILL_DAMAGE = 40;

export class CampaignPreview {
  declare time: TimeScale; declare combat: CampaignCombat; declare cast: CastDirector;
  declare pong: Pong; declare speech: SpeechLayer; declare ring: WaveRing;
  declare telegraphs: TelegraphDirector; declare devices: DeviceSet | null; declare drillT: number; declare drillN: number;
  declare opts: PreviewOptions; declare enemies: Actor[]; declare allies: Actor[];
  declare music: CampaignMusic | null; declare offWave: () => unknown;

  constructor(match: MatchLike, scene: THREE.Scene, uiRoot: HTMLElement, opts: PreviewOptions = {}) {
    this.opts = opts; this.enemies = []; this.allies = [];
    this.time = new TimeScale();
    this.combat = new CampaignCombat(this.time, { reduceMotion: () => G.settings?.reduceMotion === true });
    this.pong = new Pong(uiRoot);
    this.cast = new CastDirector(scene, this.pong);
    const voice = new Voice(() => G.audio as { ctx: AudioContext | null; sfxIn?: AudioNode | null } | null, () => G.settings?.koreanVoice !== false);
    this.speech = new SpeechLayer(uiRoot, voice);
    this.ring = new WaveRing();
    const me = match.local;
    for (const a of match.actors) {
      if (a === me) { this.combat.attach(a, 'player'); this.cast.setPlayer(a); }
      else if (me && a.team !== me.team) { this.combat.attach(a, 'enemy'); this.cast.addEnemy(a); this.enemies.push(a); }
      else { this.combat.attach(a, 'ally'); this.allies.push(a); }
    }
    this.music = G.music ? new CampaignMusic(G.music as unknown as MusicLike) : null;
    this.offWave = on('action:wave', (e: { level: 0 | 1 | 2 | 3 }) => this.music?.setLevel(e.level));
    this.telegraphs = new TelegraphDirector(scene, this.combat, () => G.time);
    this.drillT = 2; this.drillN = 0;
    this.devices = opts.devices && me ? new DeviceSet(scene, previewDevices(me), me.team, () => this.combat.player, () => this.enemies) : null;
    this.pong.attach(me);
    G.campaign = { time: this.time, combat: this.combat };
  }

  // 시뮬레이션 dt(시간 배율 적용)로 부른다. rawDt는 UI(말풍선·HUD)용이다.
  update(dt: number, rawDt: number, camera: THREE.Camera | null, paused: boolean): void {
    this.music?.tick();
    if (!paused) {
      this.combat.update(dt); this.cast.update(dt); this.pong.update(dt, camera);
      const p = this.combat.player;
      this.telegraphs.update(dt, p ? [p, ...this.allies] : this.allies);
      this.devices?.update(dt);
      if (this.opts.drill && p?.alive && (this.drillT -= dt) <= 0) { this.drillT = DRILL_EVERY; this._drill(p); }
    }
    this.speech.update(rawDt, camera);
    const p = this.combat.player;
    const hud = G.hud as { sp?: HTMLElement } | null;
    if (p && hud?.sp) { this.ring.attach(hud.sp); this.ring.set(this.combat.wave.level, this.combat.wave.points, G.teamHex[p.team]); }
  }

  // 일시 정지·포커스 이탈: 시간 배율을 바로 1로
  pause(): void { this.time.reset(); }
  // 체크포인트 재시작(연습 초기화): 조각·말풍선을 지우고 게이지를 비운다
  restart(): void { this.music?.setLevel(0); this.time.reset(); this.cast.clear(); this.speech.clear(); this.combat.wave.reset(); this.telegraphs.clear(); this.devices?.restore(); }

  // 예고 공격 연습(미리보기 전용, 33번 T026의 적 행동이 대신한다)
  _drill(p: Actor): void {
  // 가장 가까운 살아 있는 적이 원(포격)·선(감시 사격)·부채꼴(방패 발사)을 차례로 예고한다
  let best: Actor | null = null, bd = Infinity;
  for (const e of this.enemies) { if (!e.alive) continue; const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
  const kind = (['circle', 'line', 'cone'] as const)[this.drillN++ % 3];
  const at = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  let spec: TelegraphSpec;
  if (kind === 'circle' || !best || bd > 18) spec = { shape: 'circle', origin: at, radius: 2.2, duration: 1.0, damage: DRILL_DAMAGE, attacker: best };
  else {
    const yaw = Math.atan2(p.pos.x - best.pos.x, p.pos.z - best.pos.z), o = { x: best.pos.x, y: p.pos.y, z: best.pos.z };
    spec = kind === 'line'
      ? { shape: 'line', origin: o, yaw, length: bd + 3, width: 1.2, duration: 1.0, damage: DRILL_DAMAGE, attacker: best }
      : { shape: 'cone', origin: o, yaw, radius: bd + 2, halfAngle: 0.42, duration: 1.1, damage: DRILL_DAMAGE, attacker: best };
  }
  this.telegraphs.add(spec);
  }

  stop(): void {
    this.telegraphs.dispose(); this.devices?.dispose(); this.devices = null;
    this.offWave(); this.music?.dispose(0.6); this.music = null;
    this.combat.dispose(); this.time.reset(); this.cast.dispose(); this.pong.dispose(); this.speech.dispose(); this.ring.dispose();
    if (G.campaign?.combat === this.combat) G.campaign = null;
  }
}

// 연습 경기의 플레이어 둘레에 분수 2·잉크통 4·스위치 1(스위치가 둘째 분수를 켠다). 바닥 높이는 아래로 쏜 광선으로 찾는다.
function previewDevices(me: Actor): DeviceDef[] {
  const yaw = me.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const ground = (f: number, r: number): [number, number, number] => {
    const x = me.pos.x + fx * f + rx * r, z = me.pos.z + fz * f + rz * r;
    const h = G.physics?.raycast(new THREE.Vector3(x, me.pos.y + 4, z), new THREE.Vector3(0, -1, 0), 10);
    return [x, h?.hit ? h.point.y : me.pos.y, z];
  };
  return [
    { kind: 'fountain', id: 'f1', at: ground(4, 0), land: ground(4, 0) },
    { kind: 'fountain', id: 'f2', at: ground(4, -5), startsOff: true },
    { kind: 'switch', id: 's1', at: ground(1, -4), enables: ['f2'] },
    { kind: 'barrel', id: 'b1', at: ground(7, 2) }, { kind: 'barrel', id: 'b2', at: ground(7, 3) },
    { kind: 'barrel', id: 'b3', at: ground(9, -1) }, { kind: 'barrel', id: 'b4', at: ground(10, 2.5) },
  ];
}
