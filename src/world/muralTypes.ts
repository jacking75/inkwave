// 벽화·바닥 표식 계약(33번 T069). murals.js가 2048×2048 캔버스의 스테이지 영역(R)을 각 스테이지의 drawMurals에 넘기고,
// drawMurals는 그린 영역마다 배치 정보(place: 월드 m 범위, fx: 효과 세기)를 돌려준다. 실행 코드 없음.
export type Ctx2D = CanvasRenderingContext2D;
export interface MuralRect { x: number; y: number; w: number; h: number }
// 바닥 판(Alpha 월드 m): 표식을 이 범위에 맞춰 그린다
export interface Slab { minX: number; maxX: number; minZ: number; maxZ: number }
export interface MuralKit {
  font(px: number): string; fontB(px: number): string;
  NAVY: string; CORAL: string; TEAL: string; MUSTARD: string; CREAM: string; SKY: string;
  squid(g: Ctx2D, x: number, y: number, s: number, color: string, eye?: string): void;
  blob(g: Ctx2D, x: number, y: number, r: number, seed: number, color: string): void;
}
export interface MuralPlacement extends MuralRect { id: number; place?: number[]; m?: number[]; fx?: number[]; [extra: string]: unknown }
export type DrawStageMurals = (g: Ctx2D, R: MuralRect, kit: MuralKit) => MuralPlacement[];
// 글자 그리기 선택지(스테이지 벽화 도우미들이 공유하는 이름)
export interface TextOpts { weight?: number; spacing?: number; family?: string; align?: CanvasTextAlign; rot?: number; [extra: string]: unknown }
// 마모 효과 선택지
export interface WearOpts { flecks?: number; fleck?: number[]; scuffs?: number; scuff?: number[]; seed?: number; [extra: string]: unknown }
