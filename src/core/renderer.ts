// Renderer + post stack (MSAA HDR target → optional GTAO → bloom → grade/vignette → output).
// Apple GPUs (ANGLE's Metal backend): multisampled half-float targets cost ~30 ms/frame at 1920×1200 on an M1 Pro,
// so there the HDR target is single-sampled and edges are smoothed by SMAA after output, and GTAO runs at half res.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { DEFAULT_SETTINGS, rendererQuality } from '../config.js';
import { G } from './ctx.js';
import { shouldUseTouch } from './touch.js';
import { resolveLook, type LookProfile } from '../style/lookProfile.js';
import { applyToonLighting } from '../style/toonLighting.js';
import { StylePass, type ColorReturnState, type LineMode } from '../style/stylePass.js';

// 렌더러가 읽는 설정 필드이다(전체 설정은 config.js의 DEFAULT_SETTINGS).
export type RendererSettings = typeof DEFAULT_SETTINGS & { shadows?: boolean; bloom?: boolean };

// ?lines=prepass|depthTex 로 외곽선 깊이 경로를 강제한다(검증용). 없으면 자동 선택이다.
const LINE_OVERRIDE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lines') : null;
type Quality = ReturnType<typeof rendererQuality>;
// 환경 테마가 권하는 색 보정(environment.js THEMES[*].grade)이다.
interface ThemeGrade {
  uSat?: number; uVib?: number; uContrast?: number; uLift?: number; uVignette?: number; uExposure?: number;
  uShadowTint?: [number, number, number]; uHighTint?: [number, number, number]; bloom?: [number, number, number];
}
type GradeKey = 'uSat' | 'uVib' | 'uContrast' | 'uLift' | 'uVignette' | 'uExposure';

const BLOOM: [number, number, number] = [0.28, 0.45, 2.4];   // default bloom: strength, radius, HDR threshold

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.08 },
    uVib: { value: 0.12 },                               // extra saturation for muted colours only (ink never clips)
    uContrast: { value: 1.07 },                          // log-space contrast around mid grey
    uShadowTint: { value: new THREE.Vector3(0.975, 0.99, 1.035) },
    uHighTint: { value: new THREE.Vector3(1.025, 1.0, 0.972) },
    uLift: { value: 0.0 },
    uExposure: { value: 1.0 },                           // per-theme exposure (the renderer's own exposure stays fixed: the lobby set shares it)
    uVignette: { value: 0.22 },
    uHurt: { value: 0 },
    uHurtColor: { value: new THREE.Color(1, 0.2, 0.3) },
    uFlash: { value: 0 },
    uAspect: { value: 1.7 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uVignette; uniform float uHurt; uniform vec3 uHurtColor; uniform float uFlash; uniform float uAspect;
    uniform float uVib; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uLift; uniform float uExposure;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      float v = smoothstep(0.55, 1.25, r);
      c.rgb *= 1.0 - uVignette * v;
      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
      c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
      c.rgb += uFlash;
      gl_FragColor = c;
    }`,
};

// r186's PCF filter uses a 5-tap rotated Vogel disk with per-pixel noise, which reads as grainy stipple on every soft
// shadow edge. Swap it for a noise-free 3×3 grid of hardware-compared (bilinear) taps: smooth and temporally stable.
(function patchShadowFilter() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) { console.warn('[inkwave] shadow chunk layout changed; keeping stock PCF'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `vec2 ts = texelSize * max( shadowRadius * 0.55, 0.6 );
				float s9 = 0.0;
				for ( int sx = -1; sx <= 1; sx ++ ) for ( int sy = -1; sy <= 1; sy ++ ) s9 += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * ts, shadowCoord.z ) );
				shadow = s9 * ( 1.0 / 9.0 );`);
})();

function isAppleGPU(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /Apple/i.test(name) && !/Intel|AMD|Radeon|NVIDIA/i.test(name);
}

export class Renderer {
  declare renderer: THREE.WebGLRenderer;
  declare appleGPU: boolean;
  declare container: HTMLElement;
  declare scene: THREE.Scene | null;
  declare camera: THREE.PerspectiveCamera | null;
  declare settings: RendererSettings;
  declare touch: boolean;
  declare q: Quality;
  declare _w: number;
  declare _h: number;
  declare composer: EffectComposer;
  declare dynScale: number;
  declare noMSAA: boolean;
  declare samples: number;
  declare renderPass: RenderPass;
  declare gtao: GTAOPass | null;
  declare bloom: UnrealBloomPass;
  declare grade: ShaderPass;
  declare _gradeSrc: ThemeGrade | null;
  declare extraPass: ShaderPass | undefined;
  declare look: LookProfile;
  declare style: StylePass | null;
  declare lineMode: LineMode | null;   // 외곽선 깊이 출처(StylePass 주석). 그림책 룩이 아니면 null
  declare _depthTexOk: boolean;        // 컴포저 타깃에 DepthTexture를 붙일 수 있는지(첫 확인 뒤 고정)
  declare _colorReturn: ColorReturnState | null;
  declare _overlayStyle: StylePass | null;          // 쇼케이스(로비 세트·받침대·결과) 층에 쓰는 StylePass
  declare _overlayRT: THREE.WebGLRenderTarget | null;

  constructor(container: HTMLElement, settings: RendererSettings) {
    // 툰 램프는 셰이더를 하나라도 만들기 전에 청크를 패치해야 한다(다시 시작 후 적용)
    applyToonLighting(resolveLook(settings, shouldUseTouch(settings)));
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    // Shader status checks make every compile synchronous (the main thread waits on the GPU process for the link
    // result): a mid-game compile then stalls input, netcode and all. Players run without them; ?shadercheck (the
    // smoke test and dev tools) turns them back on so a broken shader still fails loudly.
    r.debug.checkShaderErrors = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shadercheck');
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.info.autoReset = false;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x9fd8f0, 1);
    container.appendChild(r.domElement);
    this.appleGPU = isAppleGPU(r.getContext());
    r.domElement.id = 'game-canvas';
    this.container = container;
    this.scene = null; this.camera = null;
    this.settings = settings;
    this.touch = shouldUseTouch(settings);
    this.q = rendererQuality(settings, this.touch);
    this.look = resolveLook(settings, this.touch);
    this.style = null; this.lineMode = null; this._depthTexOk = LINE_OVERRIDE !== 'prepass'; this._colorReturn = null;
    this._overlayStyle = null; this._overlayRT = null;
    this._w = 0; this._h = 0;
  }

  setScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene; this.camera = camera;
    this._buildComposer();
  }

  // setScene() 뒤에만 불린다(applySettings·setExtraPass도 장면이 있을 때만 다시 만든다).
  _buildComposer(): void {
    const r = this.renderer, q = this.q, scene = this.scene!, camera = this.camera!;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    this.style?.dispose();
    this.dynScale = this.dynScale || 1;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * this.dynScale;
    r.setPixelRatio(pr);
    const w = window.innerWidth, h = window.innerHeight;
    r.setSize(w, h);
    // MSAA is skipped where it costs the most. On Apple GPUs a multisampled half-float target is brutally slow; on a
    // touch device it is the most bandwidth-hungry object in the frame and a phone has the least bandwidth to give.
    // The trade is worth making because MSAA charges every frame for an edge-smoothing benefit that a single
    // full-screen SMAA pass (added below) delivers for a fraction of the cost.
    this.noMSAA = this.appleGPU || this.touch;
    this.samples = this.noMSAA ? 0 : q.msaa || 0;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.samples });
    // 그림책 룩: GTAO가 없으면 StylePass가 장면 타깃의 깊이를 읽는다(clone()한 두 번째 타깃도 자기 DepthTexture를 가진다)
    const storybook = this.look.id === 'storybook';
    const depthTex = storybook && !q.ao && this._depthTexOk;
    if (depthTex) rt.depthTexture = new THREE.DepthTexture(w * pr, h * pr);
    const comp = (this.composer = new EffectComposer(r, rt));
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    this.renderPass = new RenderPass(scene, camera);
    comp.addPass(this.renderPass);
    this.gtao = null;
    if (q.ao) {
      const ao = (this.gtao = new GTAOPass(scene, camera, w, h));
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.8;   // never crush to black: fully enclosed spots (tunnel mouths, under the overpass) keep 20 % of their light
      // contact AO: a metre-scale radius so crates, planters and pillar feet sit on the deck (it multiplies the lit
      // frame, so it stays short-range — no dirty halos on sunlit walls)
      ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.6, thickness: 1.0, scale: 1.5, samples: 12, distanceFallOff: 1.0 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      if (this.appleGPU) { const set = ao.setSize.bind(ao); ao.setSize = (sw: number, sh: number) => set(Math.ceil(sw / 2), Math.ceil(sh / 2)); }
      comp.addPass(ao);
    }
    this.style = null; this.lineMode = null;
    if (storybook) {
      const sp = (this.style = new StylePass());
      this.lineMode = this.gtao ? 'gtao' : depthTex ? 'depthTex' : 'prepass';
      sp.configure(this.lineMode, scene, camera, this.gtao ? this.gtao.depthTexture : null);
      sp.setProfile(this.look);
      sp.setColorReturn(this._colorReturn);
      comp.addPass(sp);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), ...BLOOM);
    this.bloom.enabled = !!(q.bloom && this.settings.bloom);
    comp.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this._gradeSrc = null;   // (re)apply the theme grade + bloom to the new passes
    comp.addPass(this.grade);
    // optional screen-FX pass (src/fx/screenfx.js) — runs in HDR linear space before tone mapping/output
    if (this.extraPass) comp.addPass(this.extraPass);
    comp.addPass(new OutputPass());
    // SMAA stands in for MSAA where MSAA was skipped; it runs on the tone-mapped sRGB image
    if (q.msaa && !this.samples) comp.addPass(new SMAAPass());
    r.shadowMap.enabled = this.settings.shadows !== false;
    this._w = w; this._h = h;
    this.grade.uniforms.uAspect.value = w / h;
    if (depthTex && !this._depthTexComplete(rt)) { this._depthTexOk = false; this._buildComposer(); }
  }

  // 깊이 텍스처를 붙인 (멀티샘플) 타깃이 완전한 프레임버퍼인지 확인한다. 불완전하면 선행 패스 경로로 다시 만든다.
  _depthTexComplete(rt: THREE.WebGLRenderTarget): boolean {
    const r = this.renderer, gl = r.getContext(), prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    r.setRenderTarget(prev);
    if (!ok) console.warn('[inkwave] depth texture target incomplete — outlines use the depth prepass');
    return ok;
  }

  // 쇼케이스처럼 컴포저 밖에서 그린 HDR 층에도 같은 룩(외곽선·종이·하프톤)을 입힌다(35번 R002: 메뉴·로비 세트도 같은 프로필).
  // src는 DepthTexture가 붙은 타깃이어야 하며 결과는 src와 같은 크기의 단일 샘플 HDR 텍스처이다. 그림책 룩이 아니거나
  // 깊이가 없으면 src.texture를 그대로 돌려준다. 색 회복은 걸지 않는다(메뉴는 언제나 전부 채색).
  stylize(src: THREE.WebGLRenderTarget, scene: THREE.Scene, camera: THREE.PerspectiveCamera): THREE.Texture {
    if (this.look.id !== 'storybook' || !src.depthTexture) return src.texture;
    const sp = this._overlayStyle || (this._overlayStyle = new StylePass());
    sp.configure('depthTex', scene, camera);
    sp.setProfile(this.look);
    let rt = this._overlayRT;
    if (!rt) rt = this._overlayRT = new THREE.WebGLRenderTarget(src.width, src.height, { type: THREE.HalfFloatType });
    else if (rt.width !== src.width || rt.height !== src.height) rt.setSize(src.width, src.height);
    sp.setSize(src.width, src.height);
    const prev = this.renderer.getRenderTarget();
    sp.render(this.renderer, rt, src, 0, false);
    this.renderer.setRenderTarget(prev);
    return rt.texture;
  }

  // 색 회복 상태(R005). null = 전부 채색이며 대전·연습·보스·메뉴는 언제나 null이다.
  setColorReturn(state: ColorReturnState | null): void {
    this._colorReturn = state;
    this.style?.setColorReturn(state);
  }

  // Install (or replace) the screen-FX post pass; kept across quality/setting rebuilds.
  setExtraPass(pass: ShaderPass): void {
    this.extraPass = pass;
    if (this.scene) this._buildComposer();
  }

  applySettings(settings: RendererSettings): void {
    const prevQ = this.q, prevLook = this.look;
    this.settings = settings;
    this.touch = shouldUseTouch(settings);
    this.q = rendererQuality(settings, this.touch);
    this.look = resolveLook(settings, this.touch);
    // 룩 전환(그림책 ↔ 원본)은 패스 구성이 바뀌므로 다시 만들고, 같은 룩의 수치 변경은 StylePass에 바로 넣는다
    if (prevLook.id !== this.look.id && prevQ === this.q) this._buildComposer();
    else this.style?.setProfile(this.look);
    const shadowChanged = this.renderer.shadowMap.enabled !== (settings.shadows !== false);
    if (prevQ !== this.q || shadowChanged) {
      if (prevQ !== this.q) this.dynScale = 1;
      this._buildComposer();
      this.scene?.traverse((o) => { const mat = (o as THREE.Mesh).material; if (mat) { const m = Array.isArray(mat) ? mat : [mat]; m.forEach((mm) => (mm.needsUpdate = true)); } });
    }
    if (this.bloom) this.bloom.enabled = !!(this.q.bloom && settings.bloom);
  }

  // Lowest dynamic scale: never below 0.75 of CSS-pixel density, so Retina screens (preset density > 1) can give
  // more back.
  //
  // Touch devices get no reduction at all, because on them the trade is close to pure loss: this scene is
  // vertex-bound, not fill-bound, so quadrupling the pixel count (0.5 -> 1.0) measured only 42 -> 39 fps, while the
  // halved density is immediately visible as blur on a 3x screen. Reducing resolution bought ~3 frames and cost the
  // whole image.
  dynFloor(): number {
    if (this.touch) return 1;
    const base = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    return Math.max(0.5, Math.min(0.75, 0.75 / base));
  }

  // Dynamic resolution (never on ultra): scale the render density between dynFloor() and 1 of the quality preset.
  setDynamicScale(s: number): void {
    s = Math.max(this.dynFloor(), Math.min(1, s));
    if (Math.abs(s - this.dynScale) < 0.01) return;
    this.dynScale = s;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio) * s;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this._w, this._h);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.gtao?.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  render(): void {
    this.resize();
    // colour grade recommended by the environment theme (day / dusk)
    const gr: ThemeGrade | null = (G.env && G.env.grade) || null;
    if (gr && gr !== this._gradeSrc && this.grade) {
      this._gradeSrc = gr;
      const u = this.grade.uniforms;
      for (const k of ['uSat', 'uVib', 'uContrast', 'uLift', 'uVignette', 'uExposure'] as GradeKey[]) u[k].value = gr[k] ?? GradeShader.uniforms[k].value;
      u.uShadowTint.value.set(...(gr.uShadowTint || [0.975, 0.99, 1.035]));
      u.uHighTint.value.set(...(gr.uHighTint || [1.025, 1.0, 0.972]));
      // bloom per theme: [strength, radius, threshold] — dusk lets lamps / lit windows bloom, daylight keeps it to the sun
      const bl = gr.bloom || BLOOM;
      this.bloom.strength = bl[0]; this.bloom.radius = bl[1]; this.bloom.threshold = bl[2];
    }
    // 그림책 룩은 환경광(PMREM)을 낮춘다: 반사가 툰 음영을 흐리게 하므로. 테마가 정한 값은 그대로 두고 이 렌더에만 곱한다
    const scene = this.scene, envScale = this.look.toon.envScale;
    if (scene && envScale !== 1) {
      const ei = scene.environmentIntensity;
      scene.environmentIntensity = ei * envScale;
      this.composer.render();
      scene.environmentIntensity = ei;
    } else this.composer.render();
  }
}
