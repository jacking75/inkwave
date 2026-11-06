// 대화 실행기(35번 R026, 6.1절 계약). 대본(DialogueScript)을 한 줄씩 재생하고 타이핑·건너뛰기·입력 차단·큐 보류·
// 읽은 대본 기록을 처리한다. DOM·렌더·저장 API에 의존하지 않는다: 화면은 DialogueView(dialogueView.ts), 초상은
// PortraitView(portraitView.ts), 기록 저장은 onRead 콜백(캠페인 저장 dialogueLog, 33번 T029)이 맡는다.
//
// 규칙: 자막은 초당 28자로 타이핑되고, 진행 키(탭·발사·확인)는 타이핑 중이면 줄 전체를 보이고 다 보였으면 다음 줄로 간다.
// 건너뛰기 키는 대본 전체를 끝낸다(모든 줄에서). 줄 시간 = durationMs ?? 글자 수 × 70 ms + 600(최소 1200)이고
// 시간이 다 되면 다음 줄로 넘어간다(cue.wait === 'tap'이면 진행 키를 기다린다).
// 큐: comm(전투 중 통신)은 보스 예고가 진행 중이면(hold) 보류했다가 풀리면 재생한다. intro·outro·boss·death·hub·record는
// 보류 없이 바로 끼어든다(진행 중인 comm은 큐 앞으로 되돌아간다). blocksInput인 대본 동안 전투 입력을 막는다.
import { t, getLocale } from '../../ui/i18n.js';
import { emit } from '../../core/ctx.js';

export type Mood = 'neutral' | 'smile' | 'worry' | 'determined' | 'surprise' | 'tired' | 'joy' | 'pout' | 'focus';
export type Speaker = 'player' | 'mora' | 'teal' | 'archive' | 'pong' | 'boss' | 'narrator' | string;
export type VoiceTag = 'squeak' | 'low' | 'radio' | 'vocoder' | 'none';

export interface DialogueLine {
  speaker: Speaker;
  text: string;                       // 한국어, 최대 2줄 × 22자(\n으로 줄을 나눌 수 있다)
  mood?: Mood; portrait?: 'left' | 'right' | 'none'; voice?: VoiceTag;
  durationMs?: number;
  cue?: { camera?: 'wide' | 'npc' | 'player' | 'target'; sfx?: string; word?: string; wait?: 'tap' };
}
export type ScriptKind = 'intro' | 'outro' | 'comm' | 'record' | 'boss' | 'death' | 'hub';
export interface DialogueScript { id: string; kind: ScriptKind; lines: DialogueLine[]; blocksInput: boolean }

export const DIALOGUE = { cps: 28, msPerChar: 70, baseMs: 600, minMs: 1200, maxLines: 2, maxChars: 22, maxCharsEn: 44 } as const;   // (영어는 글자 폭이 좁아 한 줄 44자, 34번 F06)

// 화자 표시 이름
export const SPEAKER_NAME: Record<string, string> = {
  player: '나', mora: '모라', teal: '틸', archive: '아카이브', pong: '퐁', boss: '', narrator: '',
};

const chars = (s: string): number => [...s].length;

// 줄 시간(ms)
export function lineMs(l: DialogueLine): number {
  return l.durationMs ?? Math.max(DIALOGUE.minMs, chars(l.text.replace(/\n/g, '')) * DIALOGUE.msPerChar + DIALOGUE.baseMs);
}

// 자동 줄바꿈: \n이 있으면 그대로, 없으면 22자 안에서 가장 늦은 공백으로 나눈다. 결과가 2줄을 넘거나 줄이 22자를
// 넘으면 null(대본 오류)이다.
export function wrapLine(text: string, max: number = DIALOGUE.maxChars): string[] | null {
  const parts = text.split('\n');
  const out: string[] = [];
  for (const p of parts) {
    let rest = p.trim();
    while (chars(rest) > max) {
      const head = [...rest].slice(0, max + 1).join('');
      const cut = head.lastIndexOf(' ');
      if (cut <= 0) return null;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut + 1).trim();
    }
    out.push(rest);
  }
  return out.length <= DIALOGUE.maxLines && out.every((l) => chars(l) <= max) ? out : null;
}

// 대본 검증기(R031·R032 데이터가 통과해야 한다): 줄 길이·빈 줄·id 중복
export function validateScripts(scripts: readonly DialogueScript[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const s of scripts) {
    if (ids.has(s.id)) errs.push(`${s.id}: id 중복`);
    ids.add(s.id);
    if (!s.lines.length) errs.push(`${s.id}: 줄 없음`);
    s.lines.forEach((l, i) => {
      if (!l.text.trim()) errs.push(`${s.id}#${i}: 빈 줄`);
      else if (!wrapLine(l.text)) errs.push(`${s.id}#${i}: 2줄×22자 초과 "${l.text}"`);
    });
  }
  return errs;
}

export function scriptMs(s: DialogueScript): number { return s.lines.reduce((t, l) => t + lineMs(l), 0); }

// ------------------------------------------------------------------------------------------------ 실행기
export interface DialogueState { script: DialogueScript; index: number; shown: number; t: number; lines: string[] }

export interface DialogueHooks {
  onLine?(st: DialogueState, line: DialogueLine): void;         // 새 줄 시작(초상·목소리·말풍선)
  onType?(st: DialogueState): void;                             // 보이는 글자 수 변화
  onEnd?(script: DialogueScript, skipped: boolean): void;
  onRead?(scriptId: string): void;                              // 끝까지 보거나 건너뛴 대본(기록판·저장)
  onBlock?(blocked: boolean): void;                             // 전투 입력 차단 상태 변화
}

export class DialogueRunner {
  declare cur: DialogueState | null; declare queue: DialogueScript[]; declare hooks: DialogueHooks;
  declare held: boolean; declare blocked: boolean;

  constructor(hooks: DialogueHooks = {}) { this.cur = null; this.queue = []; this.hooks = hooks; this.held = false; this.blocked = false; }

  get busy(): boolean { return !!this.cur; }

  // 재생 요청. comm은 큐에 들어가고(보류 중이면 기다린다), 나머지는 바로 끼어든다.
  play(script: DialogueScript): void {
    if (script.kind === 'comm') {
      this.queue.push(script);
      if (!this.cur) this._next();
      return;
    }
    if (this.cur) {
      const c = this.cur.script;
      if (c.kind === 'comm') this.queue.unshift({ ...c, lines: c.lines.slice(this.cur.index) });   // 남은 줄을 나중에
      else this._finish(true, false);
    }
    this._start(script);
  }

  // 보스 예고 등: true인 동안 comm을 시작하지 않는다(진행 중인 comm은 현재 줄까지 보이고 멈춘다)
  hold(on: boolean): void {
    this.held = on;
    if (on && this.cur?.script.kind === 'comm') {
      const c = this.cur;
      this.queue.unshift({ ...c.script, lines: c.script.lines.slice(c.index) });   // 끊긴 줄부터 다시
      this._close();
    }
    if (!on && !this.cur) this._next();
  }

  // 진행 키: 타이핑 중이면 전부 보이고, 다 보였으면 다음 줄
  advance(): void {
    const c = this.cur;
    if (!c) return;
    const total = chars(c.lines.join(''));
    if (c.shown < total) { c.shown = total; this.hooks.onType?.(c); return; }
    this._line(c.index + 1);
  }

  // 건너뛰기: 대본 전체를 끝낸다
  skip(): void { if (this.cur) this._finish(true); }

  // 실시간 dt(s)
  update(dt: number): void {
    const c = this.cur;
    if (!c) { if (!this.held && this.queue.length) this._next(); return; }
    c.t += dt;
    const total = chars(c.lines.join(''));
    const shown = Math.min(total, Math.floor(c.t * DIALOGUE.cps));
    if (shown !== c.shown && c.shown < total) { c.shown = shown; this.hooks.onType?.(c); }
    const line = c.script.lines[c.index];
    if (line.cue?.wait === 'tap') return;
    if (c.t * 1000 >= lineMs(line) && c.shown >= total) this._line(c.index + 1);
  }

  clear(): void { this.queue = []; if (this.cur) this._finish(true); }

  _next(): void {
    if (this.held) return;
    const s = this.queue.shift();
    if (s) this._start(s);
  }

  _start(s: DialogueScript): void {
    this.cur = { script: s, index: -1, shown: 0, t: 0, lines: [] };
    this._setBlock(s.blocksInput);
    this._line(0);
  }

  _line(i: number): void {
    const c = this.cur!;
    if (i >= c.script.lines.length) { this._finish(false); return; }
    const line = c.script.lines[i];
    // 34번 F06: 현재 언어로 바꾼 뒤 나눈다(영어는 한 줄이 길어 줄 폭을 넓힌다)
    const text = t(line.text);
    c.index = i; c.t = 0; c.shown = 0; c.lines = wrapLine(text, getLocale() === 'en' ? DIALOGUE.maxCharsEn : DIALOGUE.maxChars) ?? [text];
    emit('story:line', { scriptId: c.script.id, index: i, line });
    this.hooks.onLine?.(c, line);
    this.hooks.onType?.(c);
  }

  _finish(skipped: boolean, next = true): void {
    const s = this.cur!.script;
    this._close();
    this.hooks.onRead?.(s.id);
    emit('story:end', { scriptId: s.id, skipped });
    this.hooks.onEnd?.(s, skipped);
    if (next && !this.cur) this._next();
  }

  _close(): void { this.cur = null; this._setBlock(false); }

  _setBlock(b: boolean): void {
    if (b === this.blocked) return;
    this.blocked = b;
    this.hooks.onBlock?.(b);
  }
}
