// StylePass(35번 R003·R005): 잉크 그림책 룩의 외곽선·종이 결·하프톤과 색 회복을 HDR 선형 공간의 한 패스로 그린다.
// 블룸 앞에 둬서 밝은 잉크가 선 위로 번지지 않는다.
//
// 깊이 출처(renderer.ts가 고른다):
//   'gtao'     GTAO가 켜져 있으면 GTAO가 매 프레임 그리는 자체 깊이 타깃을 읽는다. 컴포저 타깃의 깊이를 읽으면 GTAO의
//              버퍼 교환 뒤 이 패스가 그 타깃에 쓰게 되어 피드백 루프가 된다.
//   'depthTex' GTAO가 없으면 RenderPass가 이번 프레임에 그린 컴포저 타깃의 DepthTexture를 읽는다.
//   'prepass'  깊이 텍스처를 붙일 수 없는 환경이면 절반 해상도 MeshDepthMaterial(RGBA 패킹) 선행 패스이다.
//              scene.overrideMaterial을 쓰므로 partGate 부품(character.js)은 선이 빠질 수 있다.
// 'gtao'·'prepass'는 GTAO 법선 패스·선행 패스가 overrideMaterial이라 같은 partGate 제약을 가진다.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { LookProfile } from './lookProfile.js';

export type LineMode = 'gtao' | 'depthTex' | 'prepass';

// 색 회복 상태이다. worldSat은 구역 채도(0.18 잃음 → 1 복구), 구체는 복구 지점에서 퍼지는 채색 영역이다(t: 0..1 진행).
export interface ColorReturnSphere { x: number; y: number; z: number; r: number; t: number }
export interface ColorReturnState { worldSat: number; spheres: ColorReturnSphere[] }

const MAX_SPHERES = 8;

const StyleShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uWidth: { value: 1 },
    uDepthK: { value: 0.012 },
    uNormalK: { value: 0.3 },
    uFarFade: { value: 60 },
    uInkMix: { value: 0.55 },
    uGrain: { value: 0.035 },
    uHalftone: { value: 0.35 },
    uHalftoneScale: { value: 6 },
    uColorReturn: { value: 0 },          // 0 = 색 회복 끔(대전·메뉴: 전부 채색)
    uWorldSat: { value: 1 },
    uSpheres: { value: Array.from({ length: MAX_SPHERES }, () => new THREE.Vector4()) },
    uSphereN: { value: 0 },
  },
  defines: { PACKED_DEPTH: 0 },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform vec2 uResolution; uniform mat4 uProjInv; uniform mat4 uCamWorld;
    uniform float uWidth; uniform float uDepthK; uniform float uNormalK; uniform float uFarFade; uniform float uInkMix;
    uniform float uGrain; uniform float uHalftone; uniform float uHalftoneScale;
    uniform float uColorReturn; uniform float uWorldSat; uniform vec4 uSpheres[${MAX_SPHERES}]; uniform int uSphereN;
    varying vec2 vUv;

    float rawDepth(vec2 uv) {
    #if PACKED_DEPTH
      return unpackRGBAToDepth(texture2D(tDepth, uv));
    #else
      return texture2D(tDepth, uv).x;
    #endif
    }
    // view-space position (camera looks down -z)
    vec3 viewPos(vec2 uv, float d) {
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float k1080 = uResolution.y / 1080.0;          // pixel scale relative to 1080p
      float dC = rawDepth(vUv);
      bool sky = dC >= 0.99999;

      // ---- outline: inverse depth is linear across the screen on a plane, so its second difference only spikes at
      //      silhouettes and creases. Creases also show as two differing normals built from left/up vs right/down.
      //      Taps: centre + 4 neighbours.
      if (uWidth > 0.0 && !sky) {
        vec2 px = uWidth * k1080 / uResolution;
        vec2 uvL = vUv - vec2(px.x, 0.0), uvR = vUv + vec2(px.x, 0.0), uvD = vUv - vec2(0.0, px.y), uvU = vUv + vec2(0.0, px.y);
        vec3 pC = viewPos(vUv, dC), pL = viewPos(uvL, rawDepth(uvL)), pR = viewPos(uvR, rawDepth(uvR));
        vec3 pD = viewPos(uvD, rawDepth(uvD)), pU = viewPos(uvU, rawDepth(uvU));
        float wC = 1.0 / -pC.z, wL = 1.0 / max(-pL.z, 1e-3), wR = 1.0 / max(-pR.z, 1e-3), wD = 1.0 / max(-pD.z, 1e-3), wU = 1.0 / max(-pU.z, 1e-3);
        float lap = max(abs(wL + wR - 2.0 * wC), abs(wD + wU - 2.0 * wC)) / wC;
        float sil = smoothstep(uDepthK, uDepthK * 2.5, lap);
        vec3 nA = normalize(cross(pC - pL, pU - pC)), nB = normalize(cross(pR - pC, pC - pD));
        float crease = 1.0 - smoothstep(1.0 - uNormalK, 1.0 - uNormalK * 0.6, dot(nA, nB));
        float line = max(sil, crease * 0.75);
        line *= 1.0 - smoothstep(uFarFade * 0.55, uFarFade, -pC.z);
        // line colour: the darkened base mixed with ink black (a line over ink reads as darker ink)
        vec3 lineCol = mix(c.rgb * 0.22, vec3(0.082, 0.071, 0.11), uInkMix);
        c.rgb = mix(c.rgb, lineCol, line * 0.92);
      }

      // ---- colour return: saturation s = max(worldSat, sphere mask, keep strong chroma)
      if (uColorReturn > 0.5) {
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float chroma = (mx - mn) / max(mx, 1e-4);
        float s = max(uWorldSat, smoothstep(0.45, 0.70, chroma));
        if (!sky) {
          vec3 wp = (uCamWorld * vec4(viewPos(vUv, dC), 1.0)).xyz;
          for (int i = 0; i < ${MAX_SPHERES}; i++) {
            if (i >= uSphereN) break;
            float r = uSpheres[i].w;
            s = max(s, 1.0 - smoothstep(r * 0.7, r, distance(wp, uSpheres[i].xyz)));
          }
        }
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = mix(vec3(l), c.rgb, s);
      }

      // ---- halftone: only in shade (linear luma < 0.35), 45-degree dot grid replaces part of the darkness
      vec2 fc = gl_FragCoord.xy / k1080;
      if (uHalftone > 0.0 && !sky) {
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float dark = 1.0 - smoothstep(0.04, 0.35, l);
        if (dark > 0.0) {
          vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * fc / uHalftoneScale;
          float dist = length(fract(q) - 0.5);
          float rad = 0.62 * sqrt(dark);
          float dotMask = 1.0 - smoothstep(rad - 0.08, rad + 0.08, dist);
          c.rgb *= mix(1.0, mix(1.18, 0.62, dotMask), uHalftone * dark);
        }
      }

      // ---- paper grain: 3-octave value noise, brightness +-grain (sky too)
      if (uGrain > 0.0) {
        float n = vnoise(fc * 0.9) * 0.5 + vnoise(fc * 0.23 + 17.0) * 0.3 + vnoise(fc * 0.05 + 41.0) * 0.2;
        c.rgb *= 1.0 + uGrain * (n * 2.0 - 1.0);
      }
      gl_FragColor = c;
    }`,
};

export class StylePass extends ShaderPass {
  declare lineMode: LineMode;
  declare private _camera: THREE.PerspectiveCamera | null;
  declare private _scene: THREE.Scene | null;
  declare private _gtaoDepth: THREE.Texture | null;
  declare private _prepassRT: THREE.WebGLRenderTarget | null;
  declare private _depthMat: THREE.MeshDepthMaterial | null;

  constructor() {
    super(StyleShader);
    this.lineMode = 'depthTex';
    this._camera = null; this._scene = null; this._gtaoDepth = null; this._prepassRT = null; this._depthMat = null;
  }

  // 깊이 출처를 정한다. gtaoDepth는 'gtao'일 때만 쓴다.
  configure(mode: LineMode, scene: THREE.Scene, camera: THREE.PerspectiveCamera, gtaoDepth: THREE.Texture | null = null): void {
    this.lineMode = mode;
    this._scene = scene; this._camera = camera; this._gtaoDepth = gtaoDepth;
    const want = mode === 'prepass' ? 1 : 0;
    if (this.material.defines.PACKED_DEPTH !== want) { this.material.defines.PACKED_DEPTH = want; this.material.needsUpdate = true; }
    if (mode === 'prepass' && !this._prepassRT) {
      this._prepassRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType });
      this._depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    }
  }

  // null = 전부 채색(대전·연습·보스·메뉴). 구체는 최대 8개이다.
  setColorReturn(state: ColorReturnState | null): void {
    const u = this.uniforms;
    u.uColorReturn.value = state ? 1 : 0;
    if (!state) return;
    u.uWorldSat.value = state.worldSat;
    const n = Math.min(MAX_SPHERES, state.spheres.length);
    for (let i = 0; i < n; i++) {
      const s = state.spheres[i];
      (u.uSpheres.value as THREE.Vector4[])[i].set(s.x, s.y, s.z, s.r * s.t);
    }
    u.uSphereN.value = n;
  }

  setProfile(p: LookProfile): void {
    const u = this.uniforms;
    u.uWidth.value = p.outline.width;
    u.uDepthK.value = p.outline.depthK;
    u.uNormalK.value = p.outline.normalK;
    u.uFarFade.value = p.outline.farFade;
    u.uInkMix.value = p.outline.inkMix;
    u.uGrain.value = p.paper.grain;
    u.uHalftone.value = p.paper.halftone;
    u.uHalftoneScale.value = p.paper.halftoneScale;
  }

  override setSize(width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
    this._prepassRT?.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const cam = this._camera, u = this.uniforms;
    if (cam) {
      u.uProjInv.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
    }
    if (this.lineMode === 'gtao') u.tDepth.value = this._gtaoDepth;
    // GTAO가 없으면 RenderPass와 이 패스 사이에 버퍼 교환이 없으므로 readBuffer가 이번 프레임의 장면 타깃이다
    else if (this.lineMode === 'depthTex') u.tDepth.value = readBuffer.depthTexture;
    else if (this._prepassRT && this._depthMat && this._scene && cam) {
      const scene = this._scene, prevOverride = scene.overrideMaterial, prevBg = scene.background;
      const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
      const prevShadowUpdate = renderer.shadowMap.autoUpdate;
      scene.overrideMaterial = this._depthMat; scene.background = null;
      renderer.shadowMap.autoUpdate = false;   // 그림자 맵은 본 패스가 이미 그렸다
      renderer.setRenderTarget(this._prepassRT);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = prevOverride; scene.background = prevBg;
      renderer.shadowMap.autoUpdate = prevShadowUpdate;
      renderer.setClearColor(prevClear, prevAlpha);
      u.tDepth.value = this._prepassRT.texture;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  override dispose(): void {
    this._prepassRT?.dispose();
    this._depthMat?.dispose();
    super.dispose();
  }
}
