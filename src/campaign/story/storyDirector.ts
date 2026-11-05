// 이야기 진행기(35번 R025~R031 연결). 대화 화면(StoryLayer)·패널(PanelPlayer)·읽은 기록(StoryLog)을 소유하고
// 메뉴의 "이야기 시작 / 이어하기"와 임무 경기를 잇는다.
//
// 현재 범위(33번 캠페인 세션 T022·목표 실행기 T024·스테이지 T038 이전): 임무 경기는 그 지역 스테이지의 연습 경기 +
// 캠페인 전투 미리보기(CampaignPreview)이다. 목표(중계기·기록·보스)가 없으므로 이야기 사건은 시작 대본, 첫 처치,
// 첫 사망만 실제 경기 사건에 묶이고 나머지(중계기 복구·보스 페이즈 등)는 목표 실행기가 comm(key)로 부른다.
// 저장: 읽은 대본·기록 id는 inkwave.storylog(v1)에 둔다. 캠페인 저장(T029)이 생기면 그 dialogueLog·records로 옮긴다.
import type * as THREE from 'three';
import { on } from '../../core/ctx.js';
import type { Actor } from '../../game/actor.js';
import { StoryLayer } from './dialogueView.js';
import { PanelPlayer, type PanelHost, type PanelAnchor } from './panels.js';
import { getScript, getPanels, missionStory } from './scripts/index.js';
import { DISTRICTS, type HarborProgress } from './districts.js';
import type { PortraitSource } from './portraitView.js';
import type { Voice } from '../../game/cast/voice.js';
import type { Pong } from '../../game/cast/mascot.js';

export const STORY_LOG_KEY = 'inkwave.storylog';
export const CAMPAIGN_SAVE_KEY = 'inkwave.campaign.v1';

export interface StoryLogData { v: 1; read: string[]; records: string[] }

// 읽은 대본·기록(기록판 다시 읽기). localStorage가 막혀도 세션 안에서는 동작한다.
export class StoryLog {
  declare data: StoryLogData; declare store: Storage | null;
  constructor(store: Storage | null) {
    this.store = store;
    this.data = { v: 1, read: [], records: [] };
    try {
      const raw = store?.getItem(STORY_LOG_KEY);
      const p = raw ? JSON.parse(raw) as Partial<StoryLogData> : null;
      if (p && p.v === 1 && Array.isArray(p.read)) this.data = { v: 1, read: p.read.filter((x) => typeof x === 'string'), records: Array.isArray(p.records) ? p.records.filter((x) => typeof x === 'string') : [] };
    } catch { /* 깨진 값은 버리고 새로 시작 */ }
  }
  has(id: string): boolean { return this.data.read.includes(id); }
  markRead(id: string): void { if (!this.has(id)) { this.data.read.push(id); this._save(); } }
  addRecord(id: string): void { if (!this.data.records.includes(id)) { this.data.records.push(id); this._save(); } }
  get started(): boolean { return this.data.read.length > 0; }
  _save(): void { try { this.store?.setItem(STORY_LOG_KEY, JSON.stringify(this.data)); } catch { /* 저장 불가: 세션 안에서만 */ } }
}

// "이어하기" 표시 조건: 캠페인 저장(T029) 또는 이야기 기록이 있으면
export function hasStorySave(store: Storage | null): boolean {
  try { return !!store?.getItem(CAMPAIGN_SAVE_KEY) || !!new StoryLog(store).started; } catch { return false; }
}

interface MatchView { local: Actor | null; actors: Actor[] }
interface PreviewView {
  time: { hold(on: boolean): void };
  combat: { inputBlocked: boolean };
  pong: Pong;
}

export interface StoryHost extends PortraitSource {
  uiRoot: HTMLElement;
  overlays: Set<(r: THREE.WebGLRenderer) => void>;
  scene(): THREE.Scene; camera(): THREE.PerspectiveCamera;
  rig: PanelHost['rig'] & { follow(a: Actor, snap?: boolean): void };
  match(): MatchView | null;
  preview(): PreviewView | null;
  ground(x: number, y: number, z: number): number | null;
  voice: Voice | null;
  store: Storage | null;
  hud?(visible: boolean): void;   // 패널 동안 전투 HUD를 숨긴다
  // 임무 경기를 연다(지역 스테이지의 연습 경기 + 캠페인 미리보기)
  startMissionMatch(mapId: string): Promise<void>;
}

export class StoryDirector {
  declare host: StoryHost; declare layer: StoryLayer; declare panels: PanelPlayer; declare log: StoryLog;
  declare mission: string | null; declare firstKill: boolean; declare firstDeath: boolean; declare unsubs: Array<() => unknown>;
  declare holds: { dialogue: boolean; panel: boolean };

  constructor(host: StoryHost) {
    this.host = host;
    this.log = new StoryLog(host.store);
    this.mission = null; this.firstKill = false; this.firstDeath = false;
    this.holds = { dialogue: false, panel: false };
    this.layer = new StoryLayer(host.uiRoot, host, {
      voice: host.voice, overlays: host.overlays,
      pong: () => host.preview()?.pong ?? null,
      onRead: (id) => this.log.markRead(id),
      onBlock: (b) => { this.holds.dialogue = b; this._applyHolds(); },
    });
    const self = this;
    const panelHost: PanelHost = {
      get scene() { return host.scene(); }, get camera() { return host.camera(); }, uiRoot: host.uiRoot, rig: host.rig,
      get CharacterClass() { return host.CharacterClass; },
      playerStyle: () => host.playerStyle(), playerColor: () => host.playerColor(),
      anchor: () => self._anchor(), ground: (x, y, z) => host.ground(x, y, z),
      freeze: (on) => { self.holds.panel = on; self._applyHolds(); },
      restore: () => { const l = host.match()?.local; if (l) host.rig.follow(l, true); },
      hideWorldActors: (on) => { for (const a of host.match()?.actors ?? []) a.character.root.visible = !on && a.alive; host.hud?.(!on); const pg = host.preview()?.pong; if (pg) pg.offstage = on; },
    };
    this.panels = new PanelPlayer(panelHost);
    this.unsubs = [
      on('splatted', (e: { victim: Actor; attacker: Actor | null }) => {
        const m = host.match(), me = m?.local;
        if (!this.mission || !me) return;
        if (e.attacker === me && e.victim.team !== me.team && !this.firstKill) { this.firstKill = true; this.comm('firstKill'); }
        if (e.victim === me && !this.firstDeath) {
          this.firstDeath = true;
          const s = getScript(missionStory(this.mission)?.death ?? '');
          if (s) this.layer.play(s);
        }
      }),
    ];
  }

  // 시뮬레이션 정지·입력 차단: 막는 대본 또는 패널이 있으면
  _applyHolds(): void {
    const p = this.host.preview();
    if (!p) return;
    p.time.hold(this.holds.panel);
    p.combat.inputBlocked = this.holds.panel || this.holds.dialogue;
  }

  _anchor(): PanelAnchor {
    const l = this.host.match()?.local;
    if (l) return { pos: l.pos.clone(), yaw: l.yaw };
    const cam = this.host.camera();
    return { pos: cam.position.clone().setY(0), yaw: 0 };
  }

  get playing(): boolean { return this.panels.playing || this.layer.runner.busy; }

  // 이어하기 지도용 진행(T029 전: 완료 임무 없음, 색 회복은 시작값)
  progress(): HarborProgress { return { done: [], colorReturn: {}, records: this.log.data.records.slice() }; }

  // 메뉴 "이야기 시작": 1장 프롤로그 → 1-1. fresh=false(이어하기·지도 선택)면 프롤로그 없이 그 임무로
  async start(missionId = '1-1', withPrologue = true): Promise<void> {
    const d = DISTRICTS.find((x) => x.missions.some((m) => m.id === missionId)) ?? DISTRICTS[0];
    await this.host.startMissionMatch(d.id);   // 이전 경기 정리(endMission)가 먼저 끝난 뒤 임무를 건다
    this.mission = missionId; this.firstKill = false; this.firstDeath = false;
    this._applyHolds();
    const ms = missionStory(missionId);
    const intro = (): void => { const s = ms ? getScript(ms.intro) : null; if (s) this.layer.play(s); };
    const pro = withPrologue && d.chapter === 1 && missionId === '1-1' ? getPanels('ch1.prologue') : null;
    if (pro) this.panels.play(pro, () => intro());
    else intro();
  }

  // 목표 실행기(33번 T024)·보스(T045)가 부른다: 그 임무의 comms[key] 대본
  comm(key: string): boolean {
    const ms = this.mission ? missionStory(this.mission) : null;
    const id = ms?.comms?.[key];
    const s = id ? getScript(id) : null;
    if (s) this.layer.play(s);
    return !!s;
  }

  // 보스 예고 동안 comm 보류
  holdComms(on: boolean): void { this.layer.runner.hold(on); }

  // 기록판 다시 읽기(작업장): 대본 하나를 재생
  replay(scriptId: string): boolean { const s = getScript(scriptId); if (s) this.layer.play({ ...s, blocksInput: true }); return !!s; }
  playPanels(id: string, onDone?: (skipped: boolean) => void): boolean { const p = getPanels(id); if (p) this.panels.play(p, onDone); return !!p; }

  // 임무 경기가 끝나거나 메뉴로 나갈 때
  endMission(): void {
    this.mission = null;
    this.layer.runner.clear();
    this.panels.stop();
    this.holds = { dialogue: false, panel: false };
  }

  // 실시간 dt
  update(dt: number): void { this.layer.update(dt); this.panels.update(dt); }

  dispose(): void { for (const u of this.unsubs) u(); this.layer.dispose(); this.panels.dispose(); }
}
