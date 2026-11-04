// 물결 게이지 HUD(35번 R019): 스페셜 게이지 구슬 둘레의 3칸 물결 링이다. hud.js의 스페셜 게이지 요소(hud.sp) 안에
// 겹쳐 그려 hud.js를 고치지 않는다. 칸은 단계(0~3)만큼 켜지고, 바깥 얇은 호가 다음 단계까지의 진행을 보여 준다.
// 단계가 바뀌면 같은 프레임에 클래스를 바꾼다(0.2초 안 표시 조건). DOM은 한 번 만들고 속성만 바꾼다.
import { levelStart, WAVE, type WaveLevel } from '../campaign/action/waveGauge.js';

const NS = 'http://www.w3.org/2000/svg';
const R = 58, R2 = 66, GAP = 0.06;   // viewBox 0..100 기준 반지름(구슬 반지름 50 바깥)

function arc(r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(50 + r * Math.sin(a)).toFixed(2)} ${(50 - r * Math.cos(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

export class WaveRing {
  declare el: HTMLDivElement; declare segs: SVGPathElement[]; declare fill: SVGPathElement; declare lv: HTMLSpanElement;
  declare level: number; declare host: HTMLElement | null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'iw-wave';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    this.segs = [];
    // 아래쪽(스페셜 아이콘 자리)을 비운 위쪽 240°를 3칸으로 나눈다
    const start = -Math.PI * 2 / 3, span = Math.PI * 4 / 3;
    for (let i = 0; i < 3; i++) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'iw-wave__seg');
      p.setAttribute('d', arc(R, start + (span / 3) * i + GAP, start + (span / 3) * (i + 1) - GAP));
      svg.appendChild(p); this.segs.push(p);
    }
    this.fill = document.createElementNS(NS, 'path');
    this.fill.setAttribute('class', 'iw-wave__fill');
    svg.appendChild(this.fill);
    this.lv = document.createElement('span');
    this.lv.className = 'iw-wave__lv';
    this.el.append(svg, this.lv);
    this.level = -1; this.host = null;
    this.el.style.opacity = '0';
  }

  // host = hud.sp(스페셜 게이지). 크기는 host의 상자를 따른다.
  attach(host: HTMLElement | null | undefined): void {
    if (!host || this.host === host) return;
    this.host = host;
    const svg = this.el.firstChild as SVGSVGElement;
    svg.style.cssText = 'left:-16%;top:-16%;width:132%;height:132%';
    this.el.style.cssText = 'position:absolute;inset:0;width:auto;height:auto;opacity:0';
    this.lv.style.cssText = 'left:-26%;top:50%';   // 구슬 왼쪽(화면 위 가장자리에 잘리지 않게)
    host.appendChild(this.el);
  }

  set(level: WaveLevel, points: number, color: string): void {
    this.el.style.opacity = '1';
    this.el.style.setProperty('--wave-col', color);
    if (level !== this.level) {
      for (let i = 0; i < 3; i++) this.segs[i].classList.toggle('is-on', i < level);
      this.lv.textContent = level > 0 ? `물결 ${level}` : '';
      this.el.classList.remove('is-pop'); void this.el.offsetWidth; this.el.classList.add('is-pop');
      this.level = level;
    }
    // 다음 단계까지 진행(3단계면 숨김)
    if (level >= 3) { this.fill.setAttribute('d', ''); return; }
    const lo = levelStart(level), hi = WAVE.thresholds[level as 0 | 1 | 2];
    const k = Math.max(0, Math.min(1, (points - lo) / (hi - lo)));
    const start = -Math.PI * 2 / 3, span = Math.PI * 4 / 3;
    const a0 = start + (span / 3) * level + GAP;
    this.fill.setAttribute('d', k > 0.01 ? arc(R2, a0, a0 + (span / 3 - 2 * GAP) * k) : '');
  }

  hide(): void { this.el.style.opacity = '0'; this.level = -1; }
  dispose(): void { this.el.remove(); this.host = null; }
}
