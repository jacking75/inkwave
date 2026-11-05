// 이야기 포즈(35번 R027): 만화 패널·작업장(R028)에서 인물이 취하는 자세이다. character.js의 춤(setDance)을 늘리지 않고
// 캐릭터 갱신 뒤 몇몇 뼈의 지역 회전을 덮어쓴다(castCharacter.ts의 갱신 훅이 부른다). 뼈 휴지 회전은 모두 단위이고
// 팔은 아래(-Y)로, 정면은 +Z이다(docs/RIG.md). 좌우 대칭 규칙: X 회전은 부호 유지, Y·Z는 부호를 뒤집는다.
// 각 값은 [X, Y, Z] 오일러(rad)이고 'wave'·'work'는 시간에 따라 조금 움직인다.
import * as THREE from 'three';

export type StoryPose = 'idle' | 'point' | 'salute' | 'shock' | 'kneel' | 'wave' | 'work' | 'listen';
type Euler3 = [number, number, number];
interface PoseDef { bones: Partial<Record<string, Euler3>>; hipsDrop?: number; anim?: (t: number) => Partial<Record<string, Euler3>> }

const mirror = (e: Euler3): Euler3 => [e[0], -e[1], -e[2]];

export const POSES: Record<Exclude<StoryPose, 'idle'>, PoseDef> = {
  point: { bones: { uArmR: [-1.45, 0, -0.12], fArmR: [-0.12, 0, 0], handR: [0, 0, 0], head: [0.05, -0.15, 0] } },
  salute: { bones: { uArmR: [-0.55, 0, -1.25], fArmR: [0, 0, 2.15], handR: [0, 0.3, 0.2], head: [-0.05, 0, 0] } },
  shock: { bones: { uArmR: [-0.6, 0, -0.55], uArmL: mirror([-0.6, 0, -0.55]), fArmR: [-1.4, 0, 0], fArmL: [-1.4, 0, 0], spine: [-0.14, 0, 0], head: [-0.12, 0, 0] } },
  kneel: {
    hipsDrop: 0.26,
    bones: { thighL: [-1.45, 0, 0.05], shinL: [1.45, 0, 0], footL: [0, 0, 0], thighR: [-0.2, 0, -0.05], shinR: [1.7, 0, 0], footR: [0.6, 0, 0], spine: [0.12, 0, 0], uArmR: [-0.5, 0, -0.1], fArmR: [-0.6, 0, 0] },
  },
  wave: {
    bones: { uArmR: [-0.2, 0, -2.45], head: [0, -0.1, 0.06] },
    anim: (t) => ({ fArmR: [0, 0, 0.35 + 0.45 * Math.sin(t * 9)] }),
  },
  work: {
    bones: { uArmR: [-0.75, 0, -0.08], uArmL: mirror([-0.75, 0, -0.08]), fArmL: [-0.95, 0, 0], spine: [0.22, 0, 0], chest: [0.08, 0, 0], head: [0.32, 0, 0] },
    anim: (t) => ({ fArmR: [-0.85 - 0.22 * Math.max(0, Math.sin(t * 6)), 0, 0] }),
  },
  listen: { bones: { uArmR: [-0.35, 0, -2.1], fArmR: [0, 0, 2.3], handR: [0, 0, 0.3], head: [0.06, 0, 0.2], neck: [0, 0, 0.06] } },
};

const _e = new THREE.Euler(), _q = new THREE.Quaternion();

// 갱신 뒤 덮어쓰기. bones = c.bones(이름 → Bone), t = 포즈 경과 s
export function applyPose(bones: Record<string, THREE.Bone | undefined>, pose: StoryPose, t: number): void {
  if (pose === 'idle') return;
  const def = POSES[pose];
  const set = (name: string, e: Euler3): void => { const b = bones[name]; if (b) b.quaternion.copy(_q.setFromEuler(_e.set(e[0], e[1], e[2], 'XYZ'))); };
  for (const [n, e] of Object.entries(def.bones)) if (e) set(n, e);
  if (def.anim) for (const [n, e] of Object.entries(def.anim(t))) if (e) set(n, e);
  if (def.hipsDrop) { const h = bones.hips; if (h) h.position.y -= def.hipsDrop; }
}
