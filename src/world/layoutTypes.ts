// 스테이지 배치 계약(33번 T069): stages/*/layout.js가 만들고 Level·Decor·지도 썸네일·모드 변형이 읽는 형식이다.
// 데이터는 각 스테이지 파일이 갖고, 여기는 공유 타입만 둔다(실행 코드 없음).
// 좌표: [x, y, z] / [x, z]. 스테이지 데이터(아직 JavaScript)가 배열 리터럴이라 튜플 대신 number[]로 받는다
export type Vec3Tuple = number[];
export type Vec2Tuple = number[];

// 모드 변형 표식(variants.ts): 'zones' 전용 또는 'zones' 제외
export interface ModeTagged { onlyIn?: string; notIn?: string }

// 배치 조각: 축 정렬 상자(box) · 회전 상자(obox) · 경사(ramp). 표면·도색 정보는 조각마다 다르므로 열어 둔다.
export interface BoxPiece extends ModeTagged { kind: 'box'; min: Vec3Tuple; max: Vec3Tuple; oct?: number[]; rail?: boolean; grate?: boolean; [extra: string]: unknown }
export interface OBoxPiece extends ModeTagged { kind: 'obox'; center: Vec3Tuple; size: Vec3Tuple; rotY: number; oct?: number[]; rail?: boolean; grate?: boolean; [extra: string]: unknown }
export interface RampPiece extends ModeTagged { kind: 'ramp'; low: Vec3Tuple; high: Vec3Tuple; width: number; thickness?: number; rail?: boolean; grate?: boolean; [extra: string]: unknown }
export type LayoutPiece = BoxPiece | OBoxPiece | RampPiece;

export interface StageBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface StageDecor { lamps: Vec2Tuple[]; palms: Vec2Tuple[]; flags: Vec3Tuple[] }

// 지도 레이아웃 목록(maps.ts MAP_LAYOUTS)의 항목: 구역 쟁탈 구역(zones-data.js)이 붙을 수 있다
export interface StageLayout {
  id: string;
  water?: string;
  bounds: StageBounds;
  spawnPads: Vec3Tuple[];
  spawnBarrier: number;
  intro?: { from: number[]; lookFrom: number[]; toBack: number };
  single: LayoutPiece[];      // 그대로 한 번
  half: LayoutPiece[];        // 원점 대칭으로 두 번
  decor: StageDecor;
  zones?: unknown;
}
