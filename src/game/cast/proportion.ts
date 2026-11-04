// 귀여운 비율 프리셋(35번 R010): 뼈 위치(docs/RIG.md 휴지 자세)를 옮기지 않고 머리 뼈의 스케일만 키운다.
// 머리 자식(머리카락·모자·눈·귀·턱·볼)은 함께 커진다. 눈 뼈의 Y 스케일은 깜박임 드라이버라 건드리지 않는다.
// 리그는 생성 때 한 번 만들고 LOD 단계가 같은 Skeleton을 쓰므로 생성 직후 한 번 설정하면 유지된다. character.js의
// 포즈 적용은 머리 뼈의 quaternion만 쓰고 scale은 쓰지 않는다. 충돌 치수(PLAYER.height·radius)는 바꾸지 않는다.
import type * as THREE from 'three';
// 형식만 가져온다: character.js는 main이 동적 import(스텁 대체 가능)하므로 정적 의존을 만들지 않는다.
import type { Character } from '../character.js';

export interface ProportionPreset { headScale: number }

// 머리 지름 약 0.42 m, 약 3.2등신이다. 1.25 이상은 사격 자세에서 무기와 겹친다.
export const CUTE: ProportionPreset = { headScale: 1.16 };

// character.js의 bones는 이름 → Bone 표이다(JS 추론으로는 {}라 여기서 표 형태로 읽는다).
export interface RiggedCharacter { bones?: object }

export function applyProportion(c: RiggedCharacter, p: ProportionPreset): void {
  const head = (c.bones as Record<string, THREE.Bone | undefined> | undefined)?.head;
  if (head) head.scale.setScalar(p.headScale);
}

type CharacterOptions = ConstructorParameters<typeof Character>[0];

// 모든 캐릭터 생성 경로(경기 Actor·쇼케이스·로비)는 main이 넘기는 CharacterClass를 쓰므로 그 클래스를 감싸 적용한다.
// headScale()은 생성 시점의 룩을 읽는다(룩 전환은 이후 생성되는 캐릭터부터 적용된다).
export function withProportion(Base: typeof Character, headScale: () => number): typeof Character {
  return class ProportionedCharacter extends Base {
    constructor(opts?: CharacterOptions) {
      super(opts);
      const s = headScale();
      if (s !== 1) applyProportion(this, { headScale: s });
    }
  };
}
