// Level: turns a map layout (oriented boxes) into collision blocks, paintable faces and render geometry.
import * as THREE from 'three';
import { PATTERN } from './maps.js';
import type { LayoutPiece, StageLayout, StageBounds } from './layoutTypes.js';

// 배치 조각의 표면·충돌 속성(스테이지 데이터가 붙인다)
export interface MuralTag { id: number; n: number[] }
export interface PieceSurface {
  paint?: boolean; grate?: boolean; rail?: boolean; solid?: boolean; hidden?: boolean; roof?: boolean; perch?: boolean; noNav?: boolean;
  color?: string; pattern?: number; tag?: string; mural?: MuralTag[]; noPaint?: number[][]; bevel?: number; thin?: boolean; thickness?: number;
}
export type PieceDef = LayoutPiece & PieceSurface;
// 소품 충돌 상자: {min,max} 또는 돌린 상자 {obox, center, size, rotY}
export interface ExtraCollider { obox?: boolean; min?: number[]; max?: number[]; center?: number[]; size?: number[]; rotY?: number; roof?: boolean; rail?: boolean; perch?: boolean }
// 아틀라스 자리(도색: w·h 포함, 조명: x·y·ppm·pad)
export interface AtlasSlot { x: number; y: number; ppm: number; pad: number; w?: number; h?: number }

// 충돌·도색 블록(돌린 상자): axes는 로컬 x·y·z 축, faces는 ±x·±y·±z 면 번호(없으면 -1)
export interface Block {
  id: number; center: THREE.Vector3; half: THREE.Vector3; axes: THREE.Vector3[]; aabbMin: THREE.Vector3; aabbMax: THREE.Vector3;
  paint: boolean; solid: boolean; color: THREE.Color; pattern: number; tag: string | null; mural: MuralTag[] | null; noPaint: number[][] | null;
  grate: boolean; roof: boolean; perch: boolean; noNav: boolean; rail: boolean; hidden: boolean; bevel: number | undefined;
  faces: number[]; aligned: boolean; render?: boolean;
}
// 칠할 수 있는 면: origin에서 u·v 방향으로 su×sv m, n은 바깥 법선
export interface Face {
  id: number; block: number; n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; origin: THREE.Vector3; su: number; sv: number;
  wall: boolean; turf: boolean; ceiling: boolean; paintable: boolean; pattern: number; color: THREE.Color; groundedBottom: boolean;
  atlas: AtlasSlot | null; grid: number; nu: number; nv: number; cu: number; cv: number; mural: number; light?: AtlasSlot | null;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Level {
  layout: StageLayout;
  extra: ExtraCollider[];
  bounds: StageBounds;
  spawnPads: THREE.Vector3[];
  spawnBarrier: number;
  blocks: Block[] = [];
  faces: Face[] = [];
  hasRails = false;
  _stamp = 1;
  hashCell = 4; hx0 = 0; hz0 = 0; hw = 0; hd = 0;
  hash: number[][] = [];
  blockStamp = new Uint32Array(0);
  _qtmp: number[] = [];
  _qtmp2: number[] = [];
  lightSize = 0;
  lightUsed = 0;
  layoutHash = '';
  renderTris = 0;
  // extra: collision-only boxes from set dressing ({min,max}, or {obox, center, size, rotY} for a turned prop; optional
  // roof / rail / perch flags) — solid, un-inkable, never rendered (the prop mesh is)
  constructor(layout: StageLayout, extra: ExtraCollider[] = []) {
    this.extra = extra;
    this.layout = layout;
    this.bounds = layout.bounds;
    this.spawnPads = layout.spawnPads.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.spawnBarrier = layout.spawnBarrier;
    this._build();
  }

  // ---------------------------------------------------------------- blocks
  _build() {
    const L = this.layout;
    const defs: PieceDef[] = [...L.single, ...L.half, ...L.half.map(mirrorDef),
      ...this.extra.map((c) => (c.obox
        ? { kind: 'obox' as const, center: c.center!, size: c.size!, rotY: c.rotY || 0, paint: false, hidden: true, color: '#888888', roof: !!c.roof, rail: !!c.rail, perch: !!c.perch }
        : { kind: 'box' as const, min: c.min!, max: c.max!, paint: false, hidden: true, color: '#888888', roof: !!c.roof, rail: !!c.rail, perch: !!c.perch }))];
    for (const d of defs) this._addBlock(d);
    this.hasRails = this.blocks.some((b) => b.rail);   // (actors only run the railing foot check where there are rails)
    this._buildHash();
    for (const b of this.blocks) this._buildFaces(b);
  }

  _addBlock(d: PieceDef) {
    const b: Block = {
      id: this.blocks.length,
      center: new THREE.Vector3(),
      half: new THREE.Vector3(),
      axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
      aabbMin: new THREE.Vector3(), aabbMax: new THREE.Vector3(),
      paint: d.paint !== false && !d.grate && !d.rail, solid: d.solid !== false,
      color: new THREE.Color(d.color || '#dddddd'),
      pattern: d.pattern ?? PATTERN.plain,
      tag: d.tag || null,
      mural: d.mural || null,
      noPaint: d.noPaint || null,
      grate: !!d.grate || !!d.rail, // walkable for kids, squids + ink + shots pass through, never inkable
      roof: !!d.roof,              // off-limits top (roofs, crane legs …): never inkable, anyone landing on it slides off
      perch: !!d.perch,            // a top you can stand on (overhead steel reached by a super jump) but never ink
      noNav: !!d.noNav,            // no route runs along its top (narrow walls a bot would only fall off)
      // rail: railings / fences — kids can't walk through (but can hop up and stand on top), shots + ink + squids pass.
      // Collision-only (the railing you see is a prop): a grate block that is never drawn or inked
      rail: !!d.rail,
      hidden: !!d.hidden || !!d.rail, // collision-only (prop colliders, rails)
      bevel: d.bevel,
      faces: [-1, -1, -1, -1, -1, -1],
      aligned: true,
    };
    if (d.kind === 'box') {
      b.center.set((d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2);
      b.half.set((d.max[0] - d.min[0]) / 2, (d.max[1] - d.min[1]) / 2, (d.max[2] - d.min[2]) / 2);
    } else if (d.kind === 'obox') {
      // box turned about the vertical axis by rotY degrees (a stage laid out at an angle, turned props)
      const a = (d.rotY * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      b.center.set(d.center[0], d.center[1], d.center[2]);
      b.half.set(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2);
      b.axes = [new THREE.Vector3(c, 0, -s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(s, 0, c)];
      b.aligned = false;
    } else {
      // Ramp: a thick tilted slab whose top surface runs from low → high and whose underside reaches the floor.
      const L0 = new THREE.Vector3(d.low[0], d.low[1], d.low[2]), H0 = new THREE.Vector3(d.high[0], d.high[1], d.high[2]);
      const s = H0.clone().sub(L0); const len = s.length(); s.normalize();
      const flat = new THREE.Vector3(s.x, 0, s.z).normalize();
      const side = new THREE.Vector3().crossVectors(UP, flat).normalize();
      const n = new THREE.Vector3().crossVectors(s, side).normalize();
      if (n.y < 0) { n.negate(); side.negate(); }
      const cosT = n.y;
      const rise = H0.y - L0.y;
      // thin: a free-spanning plank/gangway (keeps its own thickness instead of reaching down to the floor)
      const thick = d.thin ? d.thickness! : Math.max(d.thickness!, rise * cosT + 0.35);
      const ext = 0.6; // extend under the floor at the low end
      const a = L0.clone().addScaledVector(s, -ext);
      const topMid = a.clone().add(H0).multiplyScalar(0.5);
      b.center.copy(topMid).addScaledVector(n, -thick / 2);
      b.half.set(d.width / 2, thick / 2, (len + ext) / 2);
      b.axes = [side, n, s];
      b.aligned = false;
      // keep right-handed: side x n should equal s
      const chk = new THREE.Vector3().crossVectors(side, n);
      if (chk.dot(s) < 0) b.axes[0].negate();
    }
    // AABB
    b.aabbMin.set(Infinity, Infinity, Infinity); b.aabbMax.set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      _v.copy(b.center)
        .addScaledVector(b.axes[0], (i & 1 ? 1 : -1) * b.half.x)
        .addScaledVector(b.axes[1], (i & 2 ? 1 : -1) * b.half.y)
        .addScaledVector(b.axes[2], (i & 4 ? 1 : -1) * b.half.z);
      b.aabbMin.min(_v); b.aabbMax.max(_v);
    }
    this.blocks.push(b);
  }

  // 2D spatial hash over XZ for broadphase
  _buildHash() {
    const cs = this.hashCell;
    const bx = this.bounds;
    this.hx0 = bx.minX - 8; this.hz0 = bx.minZ - 8;
    this.hw = Math.ceil((bx.maxX - bx.minX + 16) / cs);
    this.hd = Math.ceil((bx.maxZ - bx.minZ + 16) / cs);
    this.hash = Array.from({ length: this.hw * this.hd }, (): number[] => []);
    this.blockStamp = new Uint32Array(this.blocks.length);
    for (const b of this.blocks) {
      const x0 = this._hxi(b.aabbMin.x), x1 = this._hxi(b.aabbMax.x);
      const z0 = this._hzi(b.aabbMin.z), z1 = this._hzi(b.aabbMax.z);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.hash[z * this.hw + x].push(b.id);
    }
  }
  _hxi(x: number) { return Math.max(0, Math.min(this.hw - 1, Math.floor((x - this.hx0) / this.hashCell))); }
  _hzi(z: number) { return Math.max(0, Math.min(this.hd - 1, Math.floor((z - this.hz0) / this.hashCell))); }

  // Unique block ids whose hash cells overlap the XZ rectangle.
  queryBlocks(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]) {
    out.length = 0;
    const st = ++this._stamp;
    const x0 = this._hxi(minX), x1 = this._hxi(maxX), z0 = this._hzi(minZ), z1 = this._hzi(maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const cell = this.hash[z * this.hw + x];
      for (let i = 0; i < cell.length; i++) {
        const id = cell[i];
        if (this.blockStamp[id] !== st) { this.blockStamp[id] = st; out.push(id); }
      }
    }
    return out;
  }

  pointInBlock(b: Block, p: THREE.Vector3Like, pad = 0) {
    _v2.copy(p).sub(b.center);
    return Math.abs(_v2.dot(b.axes[0])) < b.half.x + pad &&
      Math.abs(_v2.dot(b.axes[1])) < b.half.y + pad &&
      Math.abs(_v2.dot(b.axes[2])) < b.half.z + pad;
  }

  pointInside(p: THREE.Vector3, pad = 0, exclude = -1) {
    const ids = this.queryBlocks(p.x - 0.01, p.z - 0.01, p.x + 0.01, p.z + 0.01, this._qtmp);
    for (const id of ids) {
      if (id === exclude) continue;
      const b = this.blocks[id];
      if (!b.solid) continue;
      if (this.pointInBlock(b, p, pad)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- faces
  _buildFaces(b: Block) {
    if (b.hidden) return;
    const ax = b.axes, h = [b.half.x, b.half.y, b.half.z];
    for (let k = 0; k < 3; k++) {
      for (const sign of [1, -1]) {
        const n = ax[k].clone().multiplyScalar(sign);
        if (n.y < -0.5) {
          // underside: only keep if it floats well above the floor (overhangs)
          const lowest = b.center.y - h[1];
          if (lowest < 0.5) continue;
        }
        const others = [0, 1, 2].filter((i) => i !== k);
        let ui, vi;
        if (Math.abs(n.y) < 0.5) {
          // wall: v = the in-plane axis most aligned with world up
          vi = Math.abs(ax[others[0]].y) > Math.abs(ax[others[1]].y) ? others[0] : others[1];
          ui = others[0] === vi ? others[1] : others[0];
        } else {
          ui = Math.abs(ax[others[0]].x) >= Math.abs(ax[others[1]].x) ? others[0] : others[1];
          vi = others[0] === ui ? others[1] : others[0];
        }
        const v = ax[vi].clone();
        if (Math.abs(n.y) < 0.5) { if (v.y < 0) v.negate(); } else if (v.z < 0 && Math.abs(v.z) > 0.3) v.negate();
        const u = new THREE.Vector3().crossVectors(v, n); // u x v = n
        const su = 2 * h[ui], sv = 2 * h[vi];
        const origin = b.center.clone().addScaledVector(n, h[k]).addScaledVector(u, -su / 2).addScaledVector(v, -sv / 2);
        const face: Face = {
          id: this.faces.length, block: b.id, n, u, v, origin, su, sv,
          wall: Math.abs(n.y) < 0.3, turf: n.y > 0.7, ceiling: n.y < -0.5,
          paintable: b.paint && n.y > -0.5,
          pattern: b.pattern, color: b.color,
          groundedBottom: false,
          atlas: null, grid: -1, nu: 0, nv: 0, cu: 0, cv: 0, mural: -1,
        };
        if (this._faceHidden(face)) continue;
        face.mural = -1;
        if (b.mural) for (const m of b.mural) if (n.x * m.n[0] + n.y * m.n[1] + n.z * m.n[2] > 0.9) face.mural = m.id;
        if (b.noPaint) for (const m of b.noPaint) if (n.x * m[0] + n.y * m[1] + n.z * m[2] > 0.9) face.paintable = false;
        if ((b.roof || b.perch) && n.y > 0.5) face.paintable = false;
        if (face.wall) {
          _v.copy(origin).addScaledVector(u, su / 2).addScaledVector(v, -0.06).addScaledVector(n, 0.06);
          face.groundedBottom = this.pointInside(_v, 0, b.id) || _v.y < 0.02;
        }
        b.faces[k * 2 + (sign > 0 ? 0 : 1)] = face.id;
        this.faces.push(face);
      }
    }
  }

  // A face is hidden when every sample point just outside it lies inside another solid block.
  _faceHidden(f: Face) {
    const nu = Math.max(2, Math.ceil(f.su / 1.25)), nv = Math.max(2, Math.ceil(f.sv / 1.25));
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const uu = Math.min(f.su - 0.05, Math.max(0.05, (i / nu) * f.su));
        const vv = Math.min(f.sv - 0.05, Math.max(0.05, (j / nv) * f.sv));
        _v.copy(f.origin).addScaledVector(f.u, uu).addScaledVector(f.v, vv).addScaledVector(f.n, 0.03);
        if (!this.pointInside(_v, 0, f.block)) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- baked-lighting atlas
  // Deterministic shelf layout of every rendered face at a fixed density, independent of the paint atlas/quality.
  layoutLightmap(ppm = 5, size = 1024, pad = 2) {
    const faces = this.faces.filter((f) => !this.blocks[f.block].grate);
    const rects = faces.map((f) => ({ f, w: Math.ceil(f.su * ppm) + pad * 2, h: Math.ceil(f.sv * ppm) + pad * 2 }));
    rects.sort((a, b) => b.h - a.h || b.w - a.w || a.f.id - b.f.id);
    let x = 0, y = 0, rowH = 0;
    for (const r of rects) {
      if (x + r.w > size) { x = 0; y += rowH; rowH = 0; }
      r.f.light = { x, y, ppm, pad };
      x += r.w; rowH = Math.max(rowH, r.h);
    }
    this.lightSize = size;
    this.lightUsed = y + rowH;
    // checksum so a stale bake is never applied to a changed layout
    let h = 2166136261;
    for (const f of this.faces) for (const v of [f.origin.x, f.origin.y, f.origin.z, f.su, f.sv]) { h ^= Math.round(v * 100); h = Math.imul(h, 16777619) >>> 0; }
    this.layoutHash = (h >>> 0).toString(16);
    return this.lightUsed <= size;
  }

  // ---------------------------------------------------------------- render geometry
  // Every block renders as a rounded box: exposed edges get a real bevel (quarter-round strips + octant corners),
  // edges flush against other geometry stay sharp so floors never show grooves. Bevel vertices map into their face's
  // paint atlas (the 8-texel padding holds extrapolated ink), so ink wraps smoothly over the rounded edges.
  // Requires faces to have been laid out in the paint atlas (face.atlas = {x, y, ppm, pad}) — non-paintable faces render too.
  buildGeometry(atlasSize: number, filter = (b: Block) => !b.grate) {
    const B: Record<'pos' | 'nor' | 'col' | 'puv' | 'luv' | 'fuv' | 'fdat' | 'fflag' | 'ftan' | 'idx', number[]> = { pos: [], nor: [], col: [], puv: [], luv: [], fuv: [], fdat: [], fflag: [], ftan: [], idx: [] };
    const LS = this.lightSize || 1;
    const lin = new THREE.Color();
    const P = new THREE.Vector3(), Nn = new THREE.Vector3(), E = new THREE.Vector3(), Q = new THREE.Vector3();
    const faceOf = (b: Block, k: number, s: number) => b.faces[k * 2 + (s > 0 ? 0 : 1)];
    const self = this;
    function vert(f: Face, p: THREE.Vector3, n: THREE.Vector3) {
      const i = B.pos.length / 3;
      B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
      lin.copy(f.color); B.col.push(lin.r, lin.g, lin.b);
      Q.copy(p).sub(f.origin);
      const cu = Q.dot(f.u), cv = Q.dot(f.v);
      if (f.atlas) B.puv.push((f.atlas.x + f.atlas.pad + cu * f.atlas.ppm) / atlasSize, (f.atlas.y + f.atlas.pad + cv * f.atlas.ppm) / atlasSize);
      else B.puv.push(0, 0);
      if (f.light) B.luv.push((f.light.x + f.light.pad + cu * f.light.ppm) / LS, (f.light.y + f.light.pad + cv * f.light.ppm) / LS);
      else B.luv.push(-1, -1);
      B.fuv.push(cu, cv);
      B.fdat.push(f.pattern, f.atlas ? 1 : 0, f.su, f.sv);
      B.fflag.push(f.wall ? 1 : 0, f.groundedBottom ? 1 : 0, f.mural);
      B.ftan.push(f.u.x, f.u.y, f.u.z);
      return i;
    }
    // triangle with winding chosen so it faces along `n`
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
    function tri(i0: number, i1: number, i2: number, n: THREE.Vector3) {
      const pp = B.pos;
      _a.set(pp[i1 * 3] - pp[i0 * 3], pp[i1 * 3 + 1] - pp[i0 * 3 + 1], pp[i1 * 3 + 2] - pp[i0 * 3 + 2]);
      _b.set(pp[i2 * 3] - pp[i0 * 3], pp[i2 * 3 + 1] - pp[i0 * 3 + 1], pp[i2 * 3 + 2] - pp[i0 * 3 + 2]);
      _c.crossVectors(_a, _b);
      if (_c.dot(n) >= 0) B.idx.push(i0, i1, i2); else B.idx.push(i0, i2, i1);
    }
    for (const b of this.blocks) {
      if ((!b.solid && !b.render) || !filter(b)) continue;
      const ax = b.axes, h = [b.half.x, b.half.y, b.half.z];
      const minH = Math.min(h[0], h[1], h[2]);
      // bevel scales with the block: chunky rounded edges on big structures, finer on crates/ramps/rails
      const bev = Math.min(b.bevel ?? Math.max(0.04, Math.min(0.13, minH * 0.14)), minH * 0.45);
      // exposed-edge test (both faces rendered and nothing solid hugging the edge)
      const edgeCache = new Map<string, boolean>();
      const bevelled = (k1: number, s1: number, k2: number, s2: number) => {
        if (bev < 0.01) return false;
        const key = k1 < k2 ? `${k1}${s1}${k2}${s2}` : `${k2}${s2}${k1}${s1}`;
        const hit = edgeCache.get(key); if (hit !== undefined) return hit;
        let ok = faceOf(b, k1, s1) >= 0 && faceOf(b, k2, s2) >= 0;
        if (ok) {
          const k3 = 3 - k1 - k2;
          for (let t = -1; t <= 1; t += 0.25) {
            E.copy(b.center).addScaledVector(ax[k1], s1 * h[k1]).addScaledVector(ax[k2], s2 * h[k2]).addScaledVector(ax[k3], t * h[k3] * 0.98);
            Q.copy(E).addScaledVector(ax[k1], s1 * 0.04).addScaledVector(ax[k2], s2 * 0.04);
            if (self.pointInside(Q, 0, b.id)) { ok = false; break; }
          }
        }
        edgeCache.set(key, ok);
        return ok;
      };
      // --- faces (inset where the edge is bevelled)
      for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
        const fid = faceOf(b, k, s);
        if (fid < 0) continue;
        const f = this.faces[fid];
        const [i, j] = [0, 1, 2].filter((a) => a !== k);
        const ip = bevelled(k, s, i, 1) ? bev : 0, im = bevelled(k, s, i, -1) ? bev : 0;
        const jp = bevelled(k, s, j, 1) ? bev : 0, jm = bevelled(k, s, j, -1) ? bev : 0;
        const cf = E.copy(b.center).addScaledVector(ax[k], s * h[k]).clone();
        const corner = (si: number, sj: number) => {
          const di = si > 0 ? h[i] - ip : -(h[i] - im), dj = sj > 0 ? h[j] - jp : -(h[j] - jm);
          return vert(f, P.copy(cf).addScaledVector(ax[i], di).addScaledVector(ax[j], dj), f.n);
        };
        const v0 = corner(-1, -1), v1 = corner(1, -1), v2 = corner(1, 1), v3 = corner(-1, 1);
        tri(v0, v1, v2, f.n); tri(v0, v2, v3, f.n);
      }
      if (bev < 0.01) continue;
      // --- edge strips
      const SEG = 2; // per half (4 segments per quarter-round)
      for (let k1 = 0; k1 < 3; k1++) for (let k2 = k1 + 1; k2 < 3; k2++) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
        if (!bevelled(k1, s1, k2, s2)) continue;
        const k3 = 3 - k1 - k2;
        const fa = this.faces[faceOf(b, k1, s1)], fb = this.faces[faceOf(b, k2, s2)];
        const nA = ax[k1].clone().multiplyScalar(s1), nB = ax[k2].clone().multiplyScalar(s2);
        const endCut = (s3: number) => faceOf(b, k3, s3) >= 0 && bevelled(k3, s3, k1, s1) && bevelled(k3, s3, k2, s2) ? bev : 0;
        const t0 = -h[k3] + endCut(-1), t1 = h[k3] - endCut(1);
        const base = E.copy(b.center).addScaledVector(nA, h[k1] - bev).addScaledVector(nB, h[k2] - bev).clone();
        for (const half of [0, 1]) {
          const f = half ? fb : fa;
          const rows: Array<[number, number, THREE.Vector3]> = [];
          for (let q = 0; q <= SEG; q++) {
            const th = (Math.PI / 4) * (half + q / SEG);
            Nn.copy(nA).multiplyScalar(Math.cos(th)).addScaledVector(nB, Math.sin(th));
            const r0 = vert(f, P.copy(base).addScaledVector(ax[k3], t0).addScaledVector(Nn, bev), Nn);
            const r1 = vert(f, P.copy(base).addScaledVector(ax[k3], t1).addScaledVector(Nn, bev), Nn);
            rows.push([r0, r1, Nn.clone()]);
          }
          for (let q = 0; q < SEG; q++) {
            const [a0, a1, na] = rows[q], [b0, b1] = rows[q + 1];
            tri(a0, a1, b1, na); tri(a0, b1, b0, na);
          }
        }
      }
      // --- rounded corners (octant patches) where all three edges are bevelled
      const NC = 3;
      for (const s0 of [1, -1]) for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
        const sg = [s0, s1, s2];
        if (!(bevelled(0, s0, 1, s1) && bevelled(0, s0, 2, s2) && bevelled(1, s1, 2, s2))) continue;
        const n0 = ax[0].clone().multiplyScalar(s0), n1 = ax[1].clone().multiplyScalar(s1), n2 = ax[2].clone().multiplyScalar(s2);
        const c = E.copy(b.center).addScaledVector(n0, h[0] - bev).addScaledVector(n1, h[1] - bev).addScaledVector(n2, h[2] - bev).clone();
        // map the whole patch to the most "up" face (usually the top) so its ink matches what you see from above
        let best = 0, bd = -2;
        [n0, n1, n2].forEach((nn, a) => { if (nn.y > bd) { bd = nn.y; best = a; } });
        const f = this.faces[faceOf(b, best, sg[best])];
        const ids: number[][] = [];
        for (let a = 0; a <= NC; a++) { ids.push([]); for (let bb = 0; bb <= NC - a; bb++) {
          const cc = NC - a - bb;
          Nn.set(0, 0, 0).addScaledVector(n0, a).addScaledVector(n1, bb).addScaledVector(n2, cc).normalize();
          ids[a].push(vert(f, P.copy(c).addScaledVector(Nn, bev), Nn));
        } }
        const mid = n0.clone().add(n1).add(n2).normalize();
        for (let a = 0; a < NC; a++) for (let bb = 0; bb < NC - a; bb++) {
          tri(ids[a][bb], ids[a + 1][bb], ids[a][bb + 1], mid);
          if (bb < NC - a - 1) tri(ids[a + 1][bb], ids[a + 1][bb + 1], ids[a][bb + 1], mid);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(B.puv, 2));
    g.setAttribute('lightUv', new THREE.Float32BufferAttribute(B.luv, 2));
    g.setAttribute('faceUv', new THREE.Float32BufferAttribute(B.fuv, 2));
    g.setAttribute('faceData', new THREE.Float32BufferAttribute(B.fdat, 4));
    g.setAttribute('faceFlags', new THREE.Float32BufferAttribute(B.fflag, 3));
    g.setAttribute('faceTan', new THREE.Float32BufferAttribute(B.ftan, 3));
    g.setIndex(B.idx);
    g.computeBoundingSphere();
    this.renderTris = B.idx.length / 3;
    return g;
  }

  // Highest walkable surface under (x,z) below yMax (used by nav + spawns). Returns y or -Infinity.
  // skipGrates: what a squid would land on (squids drop straight through grates)
  groundHeight(x: number, z: number, yMax = 50, skipGrates = false) {
    let best = -Infinity;
    const ids = this.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, this._qtmp2);
    for (const id of ids) {
      const b = this.blocks[id];
      if (!b.solid || (skipGrates && b.grate)) continue;
      // intersect vertical line with the block's top face plane
      const n = b.axes[1];
      if (n.y < 0.5) continue;
      const top = _v.copy(b.center).addScaledVector(n, b.half.y);
      // plane: n·(p - top) = 0 → y = top.y - (n.x (x-top.x) + n.z (z-top.z)) / n.y
      const y = top.y - (n.x * (x - top.x) + n.z * (z - top.z)) / n.y;
      _v2.set(x, y - 0.01, z);
      if (y <= yMax && y > best && this.pointInBlock(b, _v2, 0.001)) best = y;
    }
    return best;
  }
}

function mirrorDef(d: PieceDef): PieceDef {
  const mural = d.mural ? d.mural.map((m) => ({ ...m, n: [-m.n[0], m.n[1], -m.n[2]] })) : undefined;
  const noPaint = d.noPaint ? d.noPaint.map((m: number[]) => [-m[0], m[1], -m[2]]) : undefined;
  if (d.kind === 'box') {
    return { ...d, mural, noPaint, min: [-d.max[0], d.min[1], -d.max[2]], max: [-d.min[0], d.max[1], -d.min[2]] };
  }
  if (d.kind === 'obox') return { ...d, mural, noPaint, center: [-d.center[0], d.center[1], -d.center[2]] };
  return { ...d, mural, noPaint, low: [-d.low[0], d.low[1], -d.low[2]], high: [-d.high[0], d.high[1], -d.high[2]] };
}
