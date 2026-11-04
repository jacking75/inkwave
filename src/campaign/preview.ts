// 캠페인 전투·연출 미리보기(?tune=campaign). 캠페인 세션(33번 T022)이 생기기 전에 R016~R020과 인물 연출(R011~R015)을
// 오프라인 경기(연습·대전·보스)에서 켜고 끄는 수명 관리자이다. 세션이 생기면 같은 부품(TimeScale·CampaignCombat·
// CastDirector·Pong·SpeechLayer·WaveRing)을 세션이 소유한다. 온라인 경기에서는 만들지 않는다.
//
// 대응: 로컬 플레이어 = 캠페인 플레이어, 상대 팀 봇 = 잔향 대원(무기 종류 → 병종, roleOfWeapon), 같은 팀 봇 = 아군.
// 종료(stop) 때 모든 튜닝·봇 반응·외형 훅을 되돌리고 G.campaign을 null로 둔다(다른 모드에 효과가 남지 않는다).
import type * as THREE from 'three';
import { G } from '../core/ctx.js';
import type { Actor } from '../game/actor.js';
import { TimeScale } from './action/timeScale.js';
import { CampaignCombat } from './action/combat.js';
import { CastDirector } from '../game/cast/castDirector.js';
import { Pong } from '../game/cast/mascot.js';
import { SpeechLayer } from '../game/cast/speech.js';
import { Voice } from '../game/cast/voice.js';
import { WaveRing } from '../ui/waveRing.js';

interface MatchLike { actors: Actor[]; local: Actor | null; attract?: boolean }

export class CampaignPreview {
  declare time: TimeScale; declare combat: CampaignCombat; declare cast: CastDirector;
  declare pong: Pong; declare speech: SpeechLayer; declare ring: WaveRing;

  constructor(match: MatchLike, scene: THREE.Scene, uiRoot: HTMLElement) {
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
      else if (me && a.team !== me.team) { this.combat.attach(a, 'enemy'); this.cast.addEnemy(a); }
      else this.combat.attach(a, 'ally');
    }
    this.pong.attach(me);
    G.campaign = { time: this.time, combat: this.combat };
  }

  // 시뮬레이션 dt(시간 배율 적용)로 부른다. rawDt는 UI(말풍선·HUD)용이다.
  update(dt: number, rawDt: number, camera: THREE.Camera | null, paused: boolean): void {
    if (!paused) { this.combat.update(dt); this.cast.update(dt); this.pong.update(dt, camera); }
    this.speech.update(rawDt, camera);
    const p = this.combat.player;
    const hud = G.hud as { sp?: HTMLElement } | null;
    if (p && hud?.sp) { this.ring.attach(hud.sp); this.ring.set(this.combat.wave.level, this.combat.wave.points, G.teamHex[p.team]); }
  }

  // 일시 정지·포커스 이탈: 시간 배율을 바로 1로
  pause(): void { this.time.reset(); }
  // 체크포인트 재시작(연습 초기화): 조각·말풍선을 지우고 게이지를 비운다
  restart(): void { this.time.reset(); this.cast.clear(); this.speech.clear(); this.combat.wave.reset(); }

  stop(): void {
    this.combat.dispose(); this.time.reset(); this.cast.dispose(); this.pong.dispose(); this.speech.dispose(); this.ring.dispose();
    if (G.campaign?.combat === this.combat) G.campaign = null;
  }
}
