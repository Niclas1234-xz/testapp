import { B, BLOCKS, faceTile, IS_OPAQUE, isLeaves, LIGHT_OPACITY } from '../blocks';
import { SECTION_SIZE, WORLD_HEIGHT } from '../constants';
import { TINT_COLORS } from '../icons';
import { ATLAS_TILES } from '../textures/atlas';
import type { Chunk } from '../world/chunk';
import type { World } from '../world/world';

/**
 * Vertex layout (16 bytes):
 *  int16  x, y, z    position relative to the section origin × POS_SCALE
 *  uint16 u, v       atlas coordinates in 1/16 pixel
 *  uint8  sky, block light × 16, shade (face shading × AO, 0–255)
 *  uint8  r, g, b    tint
 */
export const VERTEX_BYTES = 16;
export const POS_SCALE = 256;
export const UV_SCALE = 16;
export const MAX_QUADS = 16384;

export interface MeshData {
  bytes: Uint8Array;
  quads: number;
}

export interface SectionMeshData {
  opaque: MeshData;
  translucent: MeshData;
}

const SHAPE_NONE = 0;
const SHAPE_CUBE = 1;
const SHAPE_BOX = 2;
const SHAPE_CROSS = 3;
const SHAPE_TORCH = 4;
const SHAPE_LIQUID = 5;
const SHAPE_CROP = 6;

const SHAPE = new Uint8Array(256);
const TRANSLUCENT = new Uint8Array(256);
for (const b of BLOCKS) {
  SHAPE[b.id] = { none: SHAPE_NONE, cube: SHAPE_CUBE, box: SHAPE_BOX, cross: SHAPE_CROSS, torch: SHAPE_TORCH, liquid: SHAPE_LIQUID, crop: SHAPE_CROP }[b.shape];
  TRANSLUCENT[b.id] = b.layer === 'translucent' ? 1 : 0;
}

// Face corner positions in CCW order seen from outside (see FACE_DIRS order: +X, -X, +Y, -Y, +Z, -Z).
const FACE_CORNERS: number[][][] = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** Minecraft-like directional face shading. */
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
const AO_CURVE = [0.48, 0.66, 0.83, 1.0];

/** Texture u/v (0..1) for a local position on a face. */
function faceUV(face: number, x: number, y: number, z: number): [number, number] {
  switch (face) {
    case 0:
      return [1 - z, 1 - y];
    case 1:
      return [z, 1 - y];
    case 2:
      return [x, z];
    case 3:
      return [x, 1 - z];
    case 4:
      return [x, 1 - y];
    default:
      return [1 - x, 1 - y];
  }
}

const P = 18; // padded size
const P2 = P * P;
const pIndex = (x: number, y: number, z: number) => ((y + 1) * P + (z + 1)) * P + (x + 1);

/** Padded-index offsets: face normal, and per face corner the two side cells + the diagonal (for AO). */
const FRONT_DELTA = new Int32Array(6);
const AO_A = new Int32Array(24);
const AO_B = new Int32Array(24);
const AO_C = new Int32Array(24);
/** Texture u/v per face corner of a full cube. */
const CUBE_U = new Float32Array(24);
const CUBE_V = new Float32Array(24);
for (let f = 0; f < 6; f++) {
  const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][f];
  FRONT_DELTA[f] = n[1] * P2 + n[2] * P + n[0];
  for (let k = 0; k < 4; k++) {
    const [cx, cy, cz] = FACE_CORNERS[f][k];
    const tx = cx ? 1 : -1;
    const ty = cy ? 1 : -1;
    const tz = cz ? 1 : -1;
    let s1: number;
    let s2: number;
    if (n[0] !== 0) {
      s1 = ty * P2;
      s2 = tz * P;
    } else if (n[1] !== 0) {
      s1 = tx;
      s2 = tz * P;
    } else {
      s1 = tx;
      s2 = ty * P2;
    }
    AO_A[f * 4 + k] = s1;
    AO_B[f * 4 + k] = s2;
    AO_C[f * 4 + k] = s1 + s2;
    const [u, v] = faceUV(f, cx, cy, cz);
    CUBE_U[f * 4 + k] = u;
    CUBE_V[f * 4 + k] = v;
  }
}

/** Growable vertex buffer for one render layer. */
class MeshBuilder {
  buf = new ArrayBuffer(4096 * 4 * VERTEX_BYTES);
  i16 = new Int16Array(this.buf);
  u8 = new Uint8Array(this.buf);
  quads = 0;

  reset() {
    this.quads = 0;
  }

  private ensure() {
    if ((this.quads + 1) * 4 * VERTEX_BYTES <= this.buf.byteLength) return;
    const next = new ArrayBuffer(this.buf.byteLength * 2);
    new Uint8Array(next).set(this.u8);
    this.buf = next;
    this.i16 = new Int16Array(next);
    this.u8 = new Uint8Array(next);
  }

  /** Adds a quad; arrays hold 4 corners each. */
  quad(
    px: ArrayLike<number>,
    py: ArrayLike<number>,
    pz: ArrayLike<number>,
    pu: ArrayLike<number>,
    pv: ArrayLike<number>,
    sky: ArrayLike<number>,
    blk: ArrayLike<number>,
    shade: ArrayLike<number>,
    r: number,
    g: number,
    b: number,
    flip: boolean
  ) {
    this.ensure();
    const base = this.quads * 4;
    for (let k = 0; k < 4; k++) {
      const c = flip ? (k + 1) & 3 : k;
      const v = base + k;
      const o16 = v * 8;
      this.i16[o16] = Math.round(px[c] * POS_SCALE);
      this.i16[o16 + 1] = Math.round(py[c] * POS_SCALE);
      this.i16[o16 + 2] = Math.round(pz[c] * POS_SCALE);
      this.i16[o16 + 3] = pu[c];
      this.i16[o16 + 4] = pv[c];
      const o8 = v * VERTEX_BYTES + 10;
      this.u8[o8] = sky[c];
      this.u8[o8 + 1] = blk[c];
      this.u8[o8 + 2] = shade[c];
      this.u8[o8 + 3] = r;
      this.u8[o8 + 4] = g;
      this.u8[o8 + 5] = b;
    }
    this.quads++;
  }

  result(): MeshData {
    return { bytes: this.u8.slice(0, this.quads * 4 * VERTEX_BYTES), quads: this.quads };
  }
}

export interface MeshOptions {
  fancyLeaves: boolean;
  smoothLighting: boolean;
}

/** Builds the vertex data for one 16³ section of a chunk. */
export class Mesher {
  private ids = new Uint8Array(P * P * P);
  private metas = new Uint8Array(P * P * P);
  private lights = new Uint8Array(P * P * P);
  private opaqueB = new MeshBuilder();
  private transB = new MeshBuilder();
  // scratch corner arrays
  private px = new Float32Array(4);
  private py = new Float32Array(4);
  private pz = new Float32Array(4);
  private pu = new Uint16Array(4);
  private pv = new Uint16Array(4);
  private sky = new Uint8Array(4);
  private blk = new Uint8Array(4);
  private shade = new Uint8Array(4);
  private ao = new Uint8Array(4);

  constructor(public options: MeshOptions) {}

  private gather(world: World, chunk: Chunk, sy: number) {
    const ids = this.ids;
    const metas = this.metas;
    const lights = this.lights;
    const ox = chunk.cx * 16;
    const oz = chunk.cz * 16;
    const y0 = sy * SECTION_SIZE;
    for (let lz = -1; lz <= 16; lz++)
      for (let lx = -1; lx <= 16; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const c = lx >= 0 && lx < 16 && lz >= 0 && lz < 16 ? chunk : world.chunkAt(wx >> 4, wz >> 4);
        const ci = ((wz & 15) << 4) | (wx & 15);
        let p = pIndex(lx, -1, lz);
        for (let ly = -1; ly <= 16; ly++, p += P2) {
          const y = y0 + ly;
          if (!c || y < 0) {
            ids[p] = y < 0 ? B.BEDROCK : B.AIR;
            metas[p] = 0;
            lights[p] = y < 0 ? 0 : 0xf0;
          } else if (y >= WORLD_HEIGHT) {
            ids[p] = B.AIR;
            metas[p] = 0;
            lights[p] = 0xf0;
          } else {
            const i = (y << 8) | ci;
            ids[p] = c.blocks[i];
            metas[p] = c.meta[i];
            lights[p] = c.light[i];
          }
        }
      }
  }

  build(world: World, chunk: Chunk, sy: number): SectionMeshData {
    this.opaqueB.reset();
    this.transB.reset();
    const y0 = sy * SECTION_SIZE;
    if (y0 >= chunk.top) return { opaque: this.opaqueB.result(), translucent: this.transB.result() };
    this.gather(world, chunk, sy);
    const ids = this.ids;
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 16; z++) {
        const row = pIndex(0, y, z);
        for (let x = 0; x < 16; x++) {
          const id = ids[row + x];
          if (id === B.AIR) continue;
          switch (SHAPE[id]) {
            case SHAPE_CUBE: {
              // Fast path: blocks buried on all sides produce no faces.
              const p = row + x;
              if (
                IS_OPAQUE[ids[p + 1]] &&
                IS_OPAQUE[ids[p - 1]] &&
                IS_OPAQUE[ids[p + P]] &&
                IS_OPAQUE[ids[p - P]] &&
                IS_OPAQUE[ids[p + P2]] &&
                IS_OPAQUE[ids[p - P2]]
              )
                break;
              this.cube(chunk, x, y, z, id);
              break;
            }
            case SHAPE_BOX:
              this.box(chunk, x, y, z, id);
              break;
            case SHAPE_CROSS:
              this.cross(chunk, x, y, z, id);
              break;
            case SHAPE_CROP:
              this.crop(x, y, z, id);
              break;
            case SHAPE_TORCH:
              this.torch(x, y, z, id);
              break;
            case SHAPE_LIQUID:
              this.liquid(x, y, z);
              break;
          }
        }
      }
    return { opaque: this.opaqueB.result(), translucent: this.transB.result() };
  }

  private tr = 255;
  private tg = 255;
  private tb = 255;

  /** Sets this.tr/tg/tb to the biome tint of a face. */
  private tint(chunk: Chunk, id: number, face: number, x: number, z: number) {
    const t = BLOCKS[id].tint;
    if (!t || (id === B.GRASS && face !== 2)) {
      this.tr = this.tg = this.tb = 255;
    } else if (t === 'grass' || t === 'foliage') {
      const arr = t === 'grass' ? chunk.grassTint : chunk.foliageTint;
      const i = (z * 16 + x) * 3;
      this.tr = arr[i];
      this.tg = arr[i + 1];
      this.tb = arr[i + 2];
    } else {
      const c = TINT_COLORS[t];
      this.tr = c[0];
      this.tg = c[1];
      this.tb = c[2];
    }
  }

  private faceVisible(id: number, nid: number): boolean {
    if (IS_OPAQUE[nid]) return false;
    if (nid === id) {
      if (isLeaves(id)) return this.options.fancyLeaves;
      return false;
    }
    return true;
  }

  private setUV(tileIndex: number, k: number, u: number, v: number) {
    const tx = (tileIndex % ATLAS_TILES) * 16 * UV_SCALE;
    const ty = Math.floor(tileIndex / ATLAS_TILES) * 16 * UV_SCALE;
    const span = 16 * UV_SCALE;
    this.pu[k] = Math.min(tx + span - 1, Math.max(tx + 1, Math.round(tx + u * span)));
    this.pv[k] = Math.min(ty + span - 1, Math.max(ty + 1, Math.round(ty + v * span)));
  }

  /** Smooth light + ambient occlusion for corner k of a face; f = padded index of the front cell. */
  private cornerLight(face: number, k: number, f: number) {
    const ids = this.ids;
    const lights = this.lights;
    const j = face * 4 + k;
    const a = f + AO_A[j];
    const b = f + AO_B[j];
    const c = f + AO_C[j];
    const oa = IS_OPAQUE[ids[a]];
    const ob = IS_OPAQUE[ids[b]];
    const oc = IS_OPAQUE[ids[c]];
    this.ao[k] = oa && ob ? 0 : 3 - oa - ob - oc;
    const lf = lights[f];
    if (!this.options.smoothLighting) {
      this.sky[k] = (lf >> 4) * 16;
      this.blk[k] = (lf & 15) * 16;
      return;
    }
    let sky = lf >> 4;
    let blk = lf & 15;
    let count = 1;
    if (!oa) {
      sky += lights[a] >> 4;
      blk += lights[a] & 15;
      count++;
    }
    if (!ob) {
      sky += lights[b] >> 4;
      blk += lights[b] & 15;
      count++;
    }
    if (!oc && !(oa && ob)) {
      sky += lights[c] >> 4;
      blk += lights[c] & 15;
      count++;
    }
    this.sky[k] = ((sky * 16) / count + 0.5) | 0;
    this.blk[k] = ((blk * 16) / count + 0.5) | 0;
  }

  private cube(chunk: Chunk, x: number, y: number, z: number, id: number) {
    const ids = this.ids;
    const p = pIndex(x, y, z);
    const meta = this.metas[p];
    const snowAbove = id === B.GRASS && ids[p + P2] === B.SNOW;
    const builder = TRANSLUCENT[id] ? this.transB : this.opaqueB;
    const span = 16 * UV_SCALE;
    for (let face = 0; face < 6; face++) {
      const f = p + FRONT_DELTA[face];
      if (!this.faceVisible(id, ids[f])) continue;
      const tileIndex = faceTile(id, face, meta, snowAbove, this.options.fancyLeaves);
      const tx = (tileIndex % ATLAS_TILES) * span;
      const ty = Math.floor(tileIndex / ATLAS_TILES) * span;
      const corners = FACE_CORNERS[face];
      const shadeF = FACE_SHADE[face] * 255;
      for (let k = 0; k < 4; k++) {
        const corner = corners[k];
        this.px[k] = x + corner[0];
        this.py[k] = y + corner[1];
        this.pz[k] = z + corner[2];
        const j = face * 4 + k;
        this.pu[k] = CUBE_U[j] ? tx + span - 1 : tx + 1;
        this.pv[k] = CUBE_V[j] ? ty + span - 1 : ty + 1;
        this.cornerLight(face, k, f);
        this.shade[k] = (shadeF * AO_CURVE[this.ao[k]] + 0.5) | 0;
      }
      this.tint(chunk, id, face, x, z);
      const flip = this.ao[0] + this.ao[2] < this.ao[1] + this.ao[3];
      builder.quad(this.px, this.py, this.pz, this.pu, this.pv, this.sky, this.blk, this.shade, this.tr, this.tg, this.tb, flip);
    }
  }

  private box(chunk: Chunk, x: number, y: number, z: number, id: number) {
    const def = BLOCKS[id];
    const [x0, y0, z0, x1, y1, z1] = def.box;
    const ids = this.ids;
    const meta = this.metas[pIndex(x, y, z)];
    const builder = TRANSLUCENT[id] ? this.transB : this.opaqueB;
    const bounds = [x1, x0, y1, y0, z1, z0];
    const touches = [x1 >= 1, x0 <= 0, y1 >= 1, y0 <= 0, z1 >= 1, z0 <= 0];
    for (let face = 0; face < 6; face++) {
      const n = NORMALS[face];
      const fx = x + n[0];
      const fy = y + n[1];
      const fz = z + n[2];
      const nid = ids[pIndex(fx, fy, fz)];
      if (touches[face] && (IS_OPAQUE[nid] || (nid === id && id !== B.CHEST))) continue;
      // Cactus side faces are inset, but the cactus stacked above hides the top/bottom.
      const tileIndex = faceTile(id, face, meta);
      const corners = FACE_CORNERS[face];
      // Inset faces take light from their own cell, unless the block itself blocks light (farmland).
      const lf = touches[face] || LIGHT_OPACITY[id] >= 15 ? pIndex(fx, fy, fz) : pIndex(x, y, z);
      for (let k = 0; k < 4; k++) {
        const [cx, cy, cz] = corners[k];
        const lx = face <= 1 ? bounds[face] : cx ? x1 : x0;
        const ly = face === 2 || face === 3 ? bounds[face] : cy ? y1 : y0;
        const lz = face >= 4 ? bounds[face] : cz ? z1 : z0;
        this.px[k] = x + lx;
        this.py[k] = y + ly;
        this.pz[k] = z + lz;
        const [u, v] = faceUV(face, lx, ly, lz);
        this.setUV(tileIndex, k, u, v);
        this.cornerLight(face, k, lf);
        this.shade[k] = Math.round(FACE_SHADE[face] * AO_CURVE[this.ao[k]] * 255);
      }
      this.tint(chunk, id, face, x, z);
      builder.quad(this.px, this.py, this.pz, this.pu, this.pv, this.sky, this.blk, this.shade, this.tr, this.tg, this.tb, false);
    }
  }

  /** Light of the block's own cell, for plants, torches and liquids. */
  private ownLight(x: number, y: number, z: number) {
    const l = this.lights[pIndex(x, y, z)];
    const sky = (l >> 4) * 16;
    const blk = (l & 15) * 16;
    for (let k = 0; k < 4; k++) {
      this.sky[k] = sky;
      this.blk[k] = blk;
    }
  }

  /** Double-sided quad from 4 positions; u from corner index, v top/bottom. */
  private plantQuad(tileIndex: number, pts: number[][], r: number, g: number, b: number, shade: number) {
    const uvs = [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 4; k++) {
        const src = side === 0 ? k : 3 - k;
        this.px[k] = pts[src][0];
        this.py[k] = pts[src][1];
        this.pz[k] = pts[src][2];
        this.setUV(tileIndex, k, uvs[src][0], uvs[src][1]);
        this.shade[k] = shade;
      }
      this.opaqueB.quad(this.px, this.py, this.pz, this.pu, this.pv, this.sky, this.blk, this.shade, r, g, b, false);
    }
  }

  private cross(chunk: Chunk, x: number, y: number, z: number, id: number) {
    this.ownLight(x, y, z);
    const tileIndex = BLOCKS[id].faces[0];
    this.tint(chunk, id, 2, x, z);
    const r = this.tr;
    const g = this.tg;
    const b = this.tb;
    const a = 0.15;
    const c = 0.85;
    // Small per-position jitter like Minecraft's random plant offsets.
    const h = ((x * 3129871) ^ (z * 116129781) ^ (y * 7)) & 0xff;
    const ox = id === B.TALL_GRASS ? ((h & 15) / 15 - 0.5) * 0.3 : 0;
    const oz = id === B.TALL_GRASS ? (((h >> 4) & 15) / 15 - 0.5) * 0.3 : 0;
    this.plantQuad(
      tileIndex,
      [
        [x + a + ox, y, z + a + oz],
        [x + c + ox, y, z + c + oz],
        [x + c + ox, y + 1, z + c + oz],
        [x + a + ox, y + 1, z + a + oz],
      ],
      r,
      g,
      b,
      220
    );
    this.plantQuad(
      tileIndex,
      [
        [x + a + ox, y, z + c + oz],
        [x + c + ox, y, z + a + oz],
        [x + c + ox, y + 1, z + a + oz],
        [x + a + ox, y + 1, z + c + oz],
      ],
      r,
      g,
      b,
      220
    );
  }

  private crop(x: number, y: number, z: number, id: number) {
    this.ownLight(x, y, z);
    const tileIndex = faceTile(id, 0, this.metas[pIndex(x, y, z)]);
    const yb = y - 1 / 16;
    const yt = y + 15 / 16;
    for (const off of [0.25, 0.75]) {
      this.plantQuad(tileIndex, [[x, yb, z + off], [x + 1, yb, z + off], [x + 1, yt, z + off], [x, yt, z + off]], 255, 255, 255, 220);
      this.plantQuad(tileIndex, [[x + off, yb, z + 1], [x + off, yb, z], [x + off, yt, z], [x + off, yt, z + 1]], 255, 255, 255, 220);
    }
  }

  private torch(x: number, y: number, z: number, id: number) {
    this.ownLight(x, y, z);
    const meta = this.metas[pIndex(x, y, z)] % 6;
    const tileIndex = BLOCKS[id].faces[0];
    const s = 1 / 16;
    const x0 = 7 * s;
    const x1 = 9 * s;
    const top = 10 * s;
    // Wall torches lean away from the wall they are attached to.
    const wall = meta !== 3 && meta !== 2;
    const dir = NORMALS[meta];
    const transform = (lx: number, ly: number, lz: number): [number, number, number] => {
      if (!wall) return [x + lx, y + ly, z + lz];
      const lean = 0.3125 - ly * 0.4;
      return [x + lx + dir[0] * lean, y + ly + 3 * s, z + lz + dir[2] * lean];
    };
    for (let face = 0; face < 6; face++) {
      if (face === 3) continue;
      const corners = FACE_CORNERS[face];
      for (let k = 0; k < 4; k++) {
        const [cx, cy, cz] = corners[k];
        const lx = cx ? x1 : x0;
        const ly = face === 2 ? top : cy ? top : 0;
        const lz = cz ? x1 : x0;
        const [wx, wy, wz] = transform(lx, ly, lz);
        this.px[k] = wx;
        this.py[k] = wy;
        this.pz[k] = wz;
        // Sides show the stick column (u 7–9, v 6–16), the top shows the flame.
        let u: number;
        let v: number;
        if (face === 2) {
          u = lx;
          v = (cz ? 8 : 6) * s;
        } else {
          [u, v] = faceUV(face, lx, ly, lz);
        }
        this.setUV(tileIndex, k, u, v);
        this.shade[k] = 255;
      }
      this.opaqueB.quad(this.px, this.py, this.pz, this.pu, this.pv, this.sky, this.blk, this.shade, 255, 255, 255, false);
    }
  }

  private waterHeight(x: number, y: number, z: number): number {
    const p = pIndex(x, y, z);
    if (this.ids[p] !== B.WATER) return -1;
    if (this.ids[pIndex(x, y + 1, z)] === B.WATER) return 1;
    const m = this.metas[p];
    const level = m >= 8 ? 0 : m;
    return 1 - (level + 1) / 9;
  }

  private cornerHeight(x: number, y: number, z: number, cx: number, cz: number): number {
    let sum = 0;
    let weight = 0;
    for (let dz = cz - 1; dz <= cz; dz++)
      for (let dx = cx - 1; dx <= cx; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (this.ids[pIndex(nx, y + 1, nz)] === B.WATER) return 1;
        const h = this.waterHeight(nx, y, nz);
        if (h >= 0) {
          const w = this.metas[pIndex(nx, y, nz)] === 0 ? 10 : 1;
          sum += h * w;
          weight += w;
        } else if (!BLOCKS[this.ids[pIndex(nx, y, nz)]].solid) {
          weight += 1;
        }
      }
    return weight > 0 ? sum / weight : 0;
  }

  private liquid(x: number, y: number, z: number) {
    const ids = this.ids;
    const tileIndex = BLOCKS[B.WATER].faces[0];
    const above = ids[pIndex(x, y + 1, z)];
    const full = above === B.WATER;
    const h00 = full ? 1 : this.cornerHeight(x, y, z, 0, 0);
    const h10 = full ? 1 : this.cornerHeight(x, y, z, 1, 0);
    const h01 = full ? 1 : this.cornerHeight(x, y, z, 0, 1);
    const h11 = full ? 1 : this.cornerHeight(x, y, z, 1, 1);
    const heightAt = (cx: number, cz: number) => (cx ? (cz ? h11 : h10) : cz ? h01 : h00);
    this.ownLight(x, y, z);
    for (let face = 0; face < 6; face++) {
      const n = NORMALS[face];
      const nid = ids[pIndex(x + n[0], y + n[1], z + n[2])];
      if (nid === B.WATER || IS_OPAQUE[nid]) continue;
      if (face === 2 && full) continue;
      if (face !== 2 && face !== 3 && nid === B.ICE) continue;
      // light from the neighbour the face looks at
      const l = this.lights[pIndex(x + n[0], y + n[1], z + n[2])];
      const ls = Math.max(l >> 4, this.lights[pIndex(x, y, z)] >> 4) * 16;
      const lb = Math.max(l & 15, this.lights[pIndex(x, y, z)] & 15) * 16;
      const corners = FACE_CORNERS[face];
      for (let k = 0; k < 4; k++) {
        const [cx, cy, cz] = corners[k];
        const ly = cy ? heightAt(cx, cz) : 0;
        this.px[k] = x + cx;
        this.py[k] = y + ly;
        this.pz[k] = z + cz;
        const [u, v] = faceUV(face, cx, ly, cz);
        this.setUV(tileIndex, k, u, v);
        this.sky[k] = ls;
        this.blk[k] = lb;
        this.shade[k] = Math.round(FACE_SHADE[face] * 255);
      }
      this.transB.quad(this.px, this.py, this.pz, this.pu, this.pv, this.sky, this.blk, this.shade, 255, 255, 255, false);
    }
  }
}

/** Shared index buffer contents for quads (two triangles each). */
export function quadIndices(maxQuads = MAX_QUADS): Uint16Array {
  const idx = new Uint16Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q++) {
    const v = q * 4;
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  return idx;
}
