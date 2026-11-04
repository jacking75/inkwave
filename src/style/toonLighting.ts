// 툰 램프 조명 주입(35번 R004): 직접광의 dotNL을 3단 램프로 바꿔 바닥·벽·소품·캐릭터를 무광 3단 음영으로 그린다.
// 잉크 층(inkShading.ts)은 IW_INK_LAYER를 정의하므로 잉크 덮임 정도(gInk)만큼 원래의 매끈한 dotNL로 되돌아가
// 젖은 광택·메니스커스·물결이 그대로 남는다("잉크만 젖어 있다").
//
// three.js는 프로그램 캐시 키에 청크 본문을 넣지 않으므로 이 패치는 렌더러가 셰이더를 만들기 전에 한 번만 적용하며,
// 룩 설정의 툰 부분은 다시 시작 후 적용이다. 청크 구성이 다르면 경고만 하고 건너뛴다(renderer.ts의 그림자 패치와 같다).
import * as THREE from 'three';
import type { LookProfile } from './lookProfile.js';

const PHYSICAL_LINE = 'vec3 irradiance = dotNL * directLight.color;';
let applied = false;

const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

function rampGlsl(t: LookProfile['toon']): string {
  const [b0, b1, b2] = t.bands, [e0, e1] = t.edges, s = t.soft;
  return /* glsl */`
float iwToon( float x ) {
  float a = smoothstep( ${f(e0 - s)}, ${f(e0 + s)}, x );
  float b = smoothstep( ${f(e1 - s)}, ${f(e1 + s)}, x );
  float t = mix( mix( ${f(b0)}, ${f(b1)}, a ), ${f(b2)}, b );
  #ifdef IW_INK_LAYER
    t = mix( t, x, gInk );   // ink keeps the smooth original lighting
  #endif
  return t;
}
`;
}

// 램프는 직접광의 확산(diffuse) 항에만 쓴다. 정반사(GGX)는 원래 dotNL을 유지한다: 램프의 바닥값(뒷면 0.08)이 정반사로
// 들어가면 dotNL → 0에서 커지는 가시성 항 때문에 뒷면이 하얗게 타오른다.
const PATCHES = {
  lights_physical_pars_fragment: 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
  lights_lambert_pars_fragment: 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
} as const;

// 반환값: 실제로 패치했는지. 이미 적용했거나 청크가 바뀌었으면 false이다.
export function applyToonLighting(profile: LookProfile): boolean {
  if (applied || profile.id !== 'storybook') return false;
  const C = THREE.ShaderChunk;
  const names = Object.keys(PATCHES) as Array<keyof typeof PATCHES>;
  if (!names.every((n) => C[n].split(PHYSICAL_LINE).length === 2 && C[n].split(PATCHES[n]).length === 2)) {
    console.warn('[inkwave] lighting chunk layout changed; keeping smooth lighting');
    return false;
  }
  const ramp = rampGlsl(profile.toon);
  for (const n of names) {
    C[n] = ramp + C[n]
      .replace(PHYSICAL_LINE, `${PHYSICAL_LINE}\n\tvec3 iwDiffuseIrr = iwToon( dotNL ) * directLight.color;`)
      .replace(PATCHES[n], PATCHES[n].replace('irradiance *', 'iwDiffuseIrr *'));
  }
  applied = true;
  return true;
}

export function toonApplied(): boolean { return applied; }
