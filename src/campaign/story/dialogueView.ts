// 대화 화면(35번 R026): DialogueRunner에 자막 상자(DOM)·통신 초상(PortraitView)·찍찍 목소리·건너뛰기 입력을 붙인다.
// 자막 상자는 초상 오른쪽 아래(좌하단)에 두 줄로 놓고, 막는 대본(intro·outro 등)에서만 진행·건너뛰기 안내를 보인다.
//
// 입력(막는 대본일 때만): 진행 = Enter·Space·F·클릭·탭·패드 A, 건너뛰기 = Tab·Backspace·건너뛰기 버튼·패드 B/Start.
// 전투 중 통신(comm)은 입력을 받지 않고 시간이 되면 넘어간다.
import { DialogueRunner, SPEAKER_NAME, type DialogueHooks, type DialogueLine, type DialogueScript, type DialogueState } from './dialogue.js';
import { PortraitView, type PortraitSource } from './portraitView.js';
import type { Voice } from '../../game/cast/voice.js';
import { VOICES, type CastId } from '../../game/cast/cast.js';
import type { Pong, PongFace } from '../../game/cast/mascot.js';
import type * as THREE from 'three';
import { G } from '../../core/ctx.js';

export interface StoryLayerOptions {
  voice?: Voice | null;
  pong?: () => Pong | null;
  onRead?(scriptId: string): void;
  onBlock?(blocked: boolean): void;
  onEnd?(script: DialogueScript, skipped: boolean): void;
  overlays?: Set<(r: THREE.WebGLRenderer) => void>;
}

const MOOD_PONG: Record<string, PongFace> = { joy: 'joy', smile: 'joy', surprise: 'surprise', worry: 'scared', tired: 'sleepy', pout: 'angry', determined: 'wink', focus: 'normal', neutral: 'normal' };

export class StoryLayer {
  declare runner: DialogueRunner; declare portrait: PortraitView; declare opts: StoryLayerOptions;
  declare box: HTMLDivElement; declare nameEl: HTMLDivElement; declare textEl: HTMLDivElement; declare hint: HTMLDivElement;
  declare skipBtn: HTMLButtonElement; declare offKey: () => void;

  constructor(uiRoot: HTMLElement, src: PortraitSource, opts: StoryLayerOptions = {}) {
    this.opts = opts;
    this.portrait = new PortraitView(uiRoot, src);
    opts.overlays?.add(this.portrait.draw);
    this.box = document.createElement('div'); this.box.className = 'iw-dlg';
    this.nameEl = document.createElement('div'); this.nameEl.className = 'iw-dlg__name';
    this.textEl = document.createElement('div'); this.textEl.className = 'iw-dlg__text';
    this.hint = document.createElement('div'); this.hint.className = 'iw-dlg__hint'; this.hint.textContent = '진행 Enter · 건너뛰기 Tab';
    this.skipBtn = document.createElement('button'); this.skipBtn.className = 'iw-dlg__skip'; this.skipBtn.type = 'button'; this.skipBtn.textContent = '건너뛰기 ▶▶';
    this.box.append(this.nameEl, this.textEl, this.hint, this.skipBtn);
    uiRoot.appendChild(this.box);
    const hooks: DialogueHooks = {
      onLine: (st, line) => this._line(st, line),
      onType: (st) => this._type(st),
      onEnd: (s, skipped) => { if (!this.runner.cur) this._hide(); opts.onEnd?.(s, skipped); },
      onRead: (id) => opts.onRead?.(id),
      onBlock: (b) => { this.box.classList.toggle('is-blocking', b); opts.onBlock?.(b); },
    };
    this.runner = new DialogueRunner(hooks);
    this.box.addEventListener('pointerdown', (e) => { if (e.target === this.skipBtn) return; if (this._blocking()) this.runner.advance(); });
    this.skipBtn.addEventListener('click', () => this.runner.skip());
    const key = (e: KeyboardEvent): void => {
      if (!this._blocking() || e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); this.runner.advance(); }
      else if (e.code === 'Tab' || e.code === 'Backspace') { e.preventDefault(); this.runner.skip(); }
    };
    window.addEventListener('keydown', key, true);
    this.offKey = () => window.removeEventListener('keydown', key, true);
  }

  play(script: DialogueScript): void { this.runner.play(script); }

  _blocking(): boolean { return !!this.runner.cur?.script.blocksInput; }

  _line(st: DialogueState, line: DialogueLine): void {
    const sp = line.speaker;
    this.box.classList.add('is-on');
    document.body.classList.add('iw-talking');   // 통신 초상이 미니맵 자리를 쓴다(styles/story.css)
    this.box.dataset.speaker = sp;
    this.box.dataset.kind = st.script.kind;
    const name = SPEAKER_NAME[sp] ?? sp;
    this.nameEl.textContent = name; this.nameEl.hidden = !name;
    if (line.portrait !== 'none' && sp !== 'narrator') this.portrait.show(sp, line.mood, name);
    else this.portrait.hide();
    if (sp === 'pong') this.opts.pong?.()?.react(MOOD_PONG[line.mood ?? 'neutral'] ?? 'normal', 1.2);
    const v = line.voice ?? (sp === 'archive' || sp === 'narrator' ? 'none' : undefined);
    const spec = VOICES[(sp in VOICES ? sp : 'player') as CastId | 'pong'];
    if (v !== 'none' && this.opts.voice && spec) this.opts.voice.speak(line.text, spec);
    this.portrait.setTalking(true);
  }

  _type(st: DialogueState): void {
    let left = st.shown;
    const out: string[] = [];
    for (const l of st.lines) { const cs = [...l]; out.push(cs.slice(0, Math.max(0, left)).join('')); left -= cs.length; }
    this.textEl.textContent = out.filter((l, i) => i === 0 || l).join('\n');
    const done = st.shown >= [...st.lines.join('')].length;
    this.box.classList.toggle('is-done', done);
    if (done) this.portrait.setTalking(false);
  }

  _hide(): void { this.box.classList.remove('is-on', 'is-done', 'is-blocking'); this.portrait.hide(); document.body.classList.remove('iw-talking'); }

  // 실시간 dt
  update(dt: number): void {
    this._pollPad();
    this.runner.update(dt);
    this.portrait.update(dt);
  }

  // 패드 확인·취소는 공통 입력 프레임에서 읽는다(막는 대본 동안 main의 입력 컨텍스트가 menu이다, 33번 T017).
  // 대본을 연 버튼은 컨텍스트 전환 때 뗄 때까지 막히므로 첫 줄을 넘기지 않는다.
  _pollPad(): void {
    const f = G.frame;
    if (!f || !this._blocking() || f.source !== 'gamepad') return;
    if (f.actions.confirm.pressed) this.runner.advance();
    if (f.actions.cancel.pressed || f.actions.pause.pressed) this.runner.skip();
  }

  dispose(): void {
    this.runner.clear();
    this.offKey();
    this.opts.overlays?.delete(this.portrait.draw);
    this.portrait.dispose();
    this.box.remove();
    document.body.classList.remove('iw-talking');
  }
}
