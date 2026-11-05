// 임무용 도색의 구간 시작 상태(33번 T028). CPU 판정 격자(Uint8)와 GPU 아틀라스(렌더 타깃)를 함께 떠 두었다가
// 체크포인트 재시작에서 둘 다 되돌린다 — 표시와 판정이 어긋나지 않는다. 비용: 아틀라스 크기의 렌더 타깃 1장(2048²면 16 MB,
// 4096²면 64 MB)과 격자 사본. 세션이 끝나면 dispose()로 놓는다. paint.js 내부 필드를 좁은 형식으로만 쓴다.
import * as THREE from 'three';

interface PaintLike {
  renderer: THREE.WebGLRenderer; rt: THREE.WebGLRenderTarget; size: number;
  grid: Uint8Array; counts: [number, number]; quads: number; growing?: unknown[]; _floods?: unknown[]; version: number;
  flush(dt?: number): void;
}

const COPY_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COPY_FS = 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }';

export class PaintSnapshot {
  declare p: PaintLike; declare rt: THREE.WebGLRenderTarget | null; declare grid: Uint8Array | null; declare counts: [number, number];
  declare quad: THREE.Mesh; declare scene: THREE.Scene; declare cam: THREE.OrthographicCamera; declare mat: THREE.ShaderMaterial;

  constructor(paint: unknown) {
    this.p = paint as PaintLike;
    this.rt = null; this.grid = null; this.counts = [0, 0];
    this.mat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: COPY_VS, fragmentShader: COPY_FS, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _blit(src: THREE.Texture, dst: THREE.WebGLRenderTarget): void {
    const r = this.p.renderer, prev = r.getRenderTarget();
    this.mat.uniforms.tSrc.value = src;
    r.setRenderTarget(dst); r.render(this.scene, this.cam); r.setRenderTarget(prev);
    this.mat.uniforms.tSrc.value = null;
  }

  // 지금 상태를 뜬다(대기 중인 얼룩을 먼저 그린다)
  capture(): void {
    const p = this.p;
    p.flush(0);
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(p.rt.width, p.rt.height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this._blit(p.rt.texture, this.rt);
    this.grid = p.grid.slice();
    this.counts = [p.counts[0], p.counts[1]];
  }
  get has(): boolean { return !!this.grid; }

  // 뜬 상태로 되돌린다(판정 격자·팀별 칸 수·아틀라스)
  restore(): boolean {
    const p = this.p;
    if (!this.rt || !this.grid) return false;
    p.quads = 0;
    if (p.growing) p.growing.length = 0;
    if (p._floods) p._floods.length = 0;
    p.grid.set(this.grid);
    p.counts[0] = this.counts[0]; p.counts[1] = this.counts[1];
    this._blit(this.rt.texture, p.rt);
    p.version++;
    return true;
  }

  // 판정 격자 비교(검사용): 같으면 true
  matches(): boolean { const g = this.p.grid; if (!this.grid || g.length !== this.grid.length) return false; for (let i = 0; i < g.length; i++) if (g[i] !== this.grid[i]) return false; return true; }

  dispose(): void { this.rt?.dispose(); this.rt = null; this.grid = null; this.quad.geometry.dispose(); this.mat.dispose(); }
}
