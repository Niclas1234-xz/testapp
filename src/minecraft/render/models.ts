import { B, block, faceTile, FACE_SOUTH } from '../blocks';
import { TINT_COLORS } from '../icons';
import { item } from '../items';
import { ATLAS_TILES, getTile, tile } from '../textures/atlas';

/** CPU-side mesh: triangles with position (3), uv (2), shade (1). */
export interface MeshSource {
  data: Float32Array;
  vertices: number;
}

export const FLOATS_PER_VERTEX = 6;

const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];

class MeshWriter {
  private out: number[] = [];

  /** Quad from 4 corners (CCW from outside) with uv corners. */
  quad(p: number[][], uv: number[][], shade: number) {
    for (const k of [0, 1, 2, 0, 2, 3]) this.out.push(p[k][0], p[k][1], p[k][2], uv[k][0], uv[k][1], shade);
  }

  done(): MeshSource {
    return { data: new Float32Array(this.out), vertices: this.out.length / FLOATS_PER_VERTEX };
  }
}

/** UV rectangle (0..1 in atlas) of a tile, optionally a sub-rectangle in pixels. */
export function tileUV(tileIndex: number, px0 = 0, py0 = 0, px1 = 16, py1 = 16) {
  const s = 1 / (ATLAS_TILES * 16);
  const tx = (tileIndex % ATLAS_TILES) * 16;
  const ty = Math.floor(tileIndex / ATLAS_TILES) * 16;
  const e = 0.01;
  return { u0: (tx + px0 + e) * s, v0: (ty + py0 + e) * s, u1: (tx + px1 - e) * s, v1: (ty + py1 - e) * s };
}

/**
 * Axis-aligned box with one tile per face (+X, -X, +Y, -Y, +Z, -Z). `crop` gives the box's
 * vertical extent in block space so partial blocks (chest, snow) show the matching texture rows.
 */
function box(w: MeshWriter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tiles: number[], crop?: [number, number]) {
  const faces: number[][][] = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
  ];
  faces.forEach((p, f) => {
    const side = f !== 2 && f !== 3;
    const t = crop && side ? tileUV(tiles[f], 0, (1 - crop[1]) * 16, 16, (1 - crop[0]) * 16) : tileUV(tiles[f]);
    const uv = [
      [t.u0, t.v1],
      [t.u1, t.v1],
      [t.u1, t.v0],
      [t.u0, t.v0],
    ];
    w.quad(p, uv, FACE_SHADE[f]);
  });
}

/** A block as a cube (or its box) centered on the origin with size 1 (for drops, held items, falling blocks). */
export function blockMesh(blockId: number): MeshSource {
  const def = block(blockId);
  const w = new MeshWriter();
  const meta = def.facing ? FACE_SOUTH : 0;
  const tiles = [0, 1, 2, 3, 4, 5].map((f) => (blockId === B.GRASS && f === 2 ? tile('grass_top_item') : faceTile(blockId, f, meta)));
  const [x0, y0, z0, x1, y1, z1] = def.box;
  box(w, x0 - 0.5, y0 - 0.5, z0 - 0.5, x1 - 0.5, y1 - 0.5, z1 - 0.5, tiles, def.shape === 'box' ? [y0, y1] : undefined);
  return w.done();
}

/**
 * Item sprite extruded to 1/16 thickness, like Minecraft's 3D item models.
 * Spans -0.5..0.5 in x/y, centered on z = 0.
 */
export function spriteMesh(tileIndex: number): MeshSource {
  const w = new MeshWriter();
  const tex = getTile(tileIndex);
  const d = 1 / 32;
  const s = 1 / 16;
  const t = tileUV(tileIndex);
  // front (+Z) and back (-Z)
  w.quad(
    [
      [-0.5, -0.5, d],
      [0.5, -0.5, d],
      [0.5, 0.5, d],
      [-0.5, 0.5, d],
    ],
    [
      [t.u0, t.v1],
      [t.u1, t.v1],
      [t.u1, t.v0],
      [t.u0, t.v0],
    ],
    1
  );
  w.quad(
    [
      [0.5, -0.5, -d],
      [-0.5, -0.5, -d],
      [-0.5, 0.5, -d],
      [0.5, 0.5, -d],
    ],
    [
      [t.u1, t.v1],
      [t.u0, t.v1],
      [t.u0, t.v0],
      [t.u1, t.v0],
    ],
    0.8
  );
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && tex.alpha(x, y) > 127;
  for (let py = 0; py < 16; py++)
    for (let px = 0; px < 16; px++) {
      if (!solid(px, py)) continue;
      const x0 = -0.5 + px * s;
      const x1 = x0 + s;
      const y1 = 0.5 - py * s;
      const y0 = y1 - s;
      const uv = tileUV(tileIndex, px + 0.3, py + 0.3, px + 0.7, py + 0.7);
      const c = [
        [uv.u0, uv.v1],
        [uv.u1, uv.v1],
        [uv.u1, uv.v0],
        [uv.u0, uv.v0],
      ];
      if (!solid(px + 1, py)) w.quad([[x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d]], c, 0.6);
      if (!solid(px - 1, py)) w.quad([[x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d]], c, 0.6);
      if (!solid(px, py - 1)) w.quad([[x0, y1, d], [x1, y1, d], [x1, y1, -d], [x0, y1, -d]], c, 1);
      if (!solid(px, py + 1)) w.quad([[x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d]], c, 0.5);
    }
  return w.done();
}

/** Mesh for any item: cube for block items, extruded sprite otherwise. */
export function itemMesh(itemId: number): { mesh: MeshSource; cube: boolean; tint: number[] | null } {
  const def = item(itemId);
  if (!def) return { mesh: spriteMesh(tile('stick')), cube: false, tint: null };
  if (def.cubeIcon && def.places !== undefined) {
    const b = block(def.places);
    const tint = b.tint && b.id !== B.GRASS ? [...TINT_COLORS[b.tint]] : null;
    return { mesh: blockMesh(def.places), cube: true, tint };
  }
  const b = def.places !== undefined && def.id < 256 ? block(def.places) : null;
  return { mesh: spriteMesh(def.texture), cube: false, tint: b?.tint ? [...TINT_COLORS[b.tint]] : null };
}

// ------------------------------------------------------------------ mob models

export interface ModelPart {
  name: string;
  /** Rotation pivot in pixels (1/16 block), relative to the entity's feet. */
  pivot: [number, number, number];
  /** Box corners in pixels relative to the pivot. */
  from: [number, number, number];
  to: [number, number, number];
  mesh: MeshSource;
}

export interface Model {
  parts: ModelPart[];
}

function part(name: string, pivot: [number, number, number], from: [number, number, number], to: [number, number, number], tiles: number[]): ModelPart {
  const w = new MeshWriter();
  const s = 1 / 16;
  box(w, from[0] * s, from[1] * s, from[2] * s, to[0] * s, to[1] * s, to[2] * s, tiles);
  return { name, pivot, from, to, mesh: w.done() };
}

/** Tiles for a box: front face (+Z) gets `front`, others `side`; optional top. */
function tiles6(side: string, front?: string, top?: string): number[] {
  const s = tile(side);
  const f = front ? tile(front) : s;
  const t = top ? tile(top) : s;
  return [s, s, t, s, f, s];
}

function humanoid(prefix: 'steve' | 'zombie'): Model {
  return {
    parts: [
      part('head', [0, 24, 0], [-4, 0, -4], [4, 8, 4], tiles6(`${prefix}_head`, `${prefix}_face`, `${prefix}_head`)),
      part('body', [0, 24, 0], [-4, -12, -2], [4, 0, 2], tiles6(`${prefix}_shirt`)),
      part('rightArm', [-6, 22, 0], [-2, -10, -2], [2, 2, 2], tiles6(`${prefix}_skin`)),
      part('leftArm', [6, 22, 0], [-2, -10, -2], [2, 2, 2], tiles6(`${prefix}_skin`)),
      part('rightLeg', [-2, 12, 0], [-2, -12, -2], [2, 0, 2], tiles6(`${prefix}_pants`)),
      part('leftLeg', [2, 12, 0], [-2, -12, -2], [2, 0, 2], tiles6(`${prefix}_pants`)),
    ],
  };
}

let models: Record<string, Model> | null = null;

export function getModels(): Record<string, Model> {
  if (models) return models;
  models = {
    player: humanoid('steve'),
    zombie: humanoid('zombie'),
    creeper: {
      parts: [
        part('head', [0, 18, 0], [-4, 0, -4], [4, 8, 4], tiles6('creeper_skin', 'creeper_face')),
        part('body', [0, 18, 0], [-4, -12, -2], [4, 0, 2], tiles6('creeper_skin')),
        part('leg0', [-2, 6, 4], [-2, -6, -2], [2, 0, 2], tiles6('creeper_skin')),
        part('leg1', [2, 6, 4], [-2, -6, -2], [2, 0, 2], tiles6('creeper_skin')),
        part('leg2', [-2, 6, -4], [-2, -6, -2], [2, 0, 2], tiles6('creeper_skin')),
        part('leg3', [2, 6, -4], [-2, -6, -2], [2, 0, 2], tiles6('creeper_skin')),
      ],
    },
    pig: {
      parts: [
        part('body', [0, 10, 0], [-5, -4, -8], [5, 4, 8], tiles6('pig_skin')),
        part('head', [0, 12, 8], [-4, -4, 0], [4, 4, 8], tiles6('pig_skin', 'pig_face')),
        part('snout', [0, 12, 8], [-2, -3, 8], [2, 0, 9], tiles6('pig_skin', 'pig_snout')),
        part('leg0', [-3, 6, 5], [-2, -6, -2], [2, 0, 2], tiles6('pig_skin')),
        part('leg1', [3, 6, 5], [-2, -6, -2], [2, 0, 2], tiles6('pig_skin')),
        part('leg2', [-3, 6, -5], [-2, -6, -2], [2, 0, 2], tiles6('pig_skin')),
        part('leg3', [3, 6, -5], [-2, -6, -2], [2, 0, 2], tiles6('pig_skin')),
      ],
    },
    cow: {
      parts: [
        part('body', [0, 15, 0], [-6, -5, -9], [6, 5, 9], tiles6('cow_hide')),
        part('head', [0, 18, 9], [-4, -4, 0], [4, 4, 6], tiles6('cow_hide', 'cow_face')),
        part('horn0', [0, 18, 9], [-5, 2, 1], [-4, 5, 2], tiles6('cow_horn')),
        part('horn1', [0, 18, 9], [4, 2, 1], [5, 5, 2], tiles6('cow_horn')),
        part('leg0', [-4, 12, 6], [-2, -12, -2], [2, 0, 2], tiles6('cow_hide')),
        part('leg1', [4, 12, 6], [-2, -12, -2], [2, 0, 2], tiles6('cow_hide')),
        part('leg2', [-4, 12, -6], [-2, -12, -2], [2, 0, 2], tiles6('cow_hide')),
        part('leg3', [4, 12, -6], [-2, -12, -2], [2, 0, 2], tiles6('cow_hide')),
      ],
    },
    sheep: {
      parts: [
        part('body', [0, 14, 0], [-5, -5, -8], [5, 5, 8], tiles6('white_wool')),
        part('head', [0, 17, 8], [-3, -3, 0], [3, 3, 7], tiles6('sheep_skin', 'sheep_face', 'white_wool')),
        part('leg0', [-3, 12, 5], [-2, -12, -2], [2, 0, 2], tiles6('sheep_skin')),
        part('leg1', [3, 12, 5], [-2, -12, -2], [2, 0, 2], tiles6('sheep_skin')),
        part('leg2', [-3, 12, -5], [-2, -12, -2], [2, 0, 2], tiles6('sheep_skin')),
        part('leg3', [3, 12, -5], [-2, -12, -2], [2, 0, 2], tiles6('sheep_skin')),
      ],
    },
    // First-person arm (Steve's skin).
    arm: { parts: [part('arm', [0, 0, 0], [-2, -12, -2], [2, 0, 2], tiles6('steve_skin'))] },
  };
  return models;
}

/** Unit quad facing +Z (for sun, moon, particles, clouds), uv = full tile. */
export function quadMesh(tileIndex: number, size = 1): MeshSource {
  const w = new MeshWriter();
  const h = size / 2;
  const t = tileUV(tileIndex);
  w.quad(
    [
      [-h, -h, 0],
      [h, -h, 0],
      [h, h, 0],
      [-h, h, 0],
    ],
    [
      [t.u0, t.v1],
      [t.u1, t.v1],
      [t.u1, t.v0],
      [t.u0, t.v0],
    ],
    1
  );
  return w.done();
}

/** Random star quads on a sphere of radius 100 (uv points at a white texel of the sun). */
export function starMesh(seed = 10842): MeshSource {
  const w = new MeshWriter();
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const t = tileUV(tile('sun'), 7, 7, 8, 8);
  const uv = [
    [t.u0, t.v1],
    [t.u1, t.v1],
    [t.u1, t.v0],
    [t.u0, t.v0],
  ];
  for (let i = 0; i < 1100; i++) {
    let x = rnd() * 2 - 1;
    let y = rnd() * 2 - 1;
    let z = rnd() * 2 - 1;
    const len = Math.hypot(x, y, z);
    if (len < 0.01 || len > 1) continue;
    x /= len;
    y /= len;
    z /= len;
    const size = 0.15 + rnd() * 0.12;
    // tangent basis
    const ax = Math.abs(y) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let tx = cross(ax, [x, y, z]);
    const tl = Math.hypot(tx[0], tx[1], tx[2]);
    tx = tx.map((v) => (v / tl) * size);
    const by = cross([x, y, z], tx);
    const c = [x * 100, y * 100, z * 100];
    const p = [
      [c[0] - tx[0] - by[0], c[1] - tx[1] - by[1], c[2] - tx[2] - by[2]],
      [c[0] + tx[0] - by[0], c[1] + tx[1] - by[1], c[2] + tx[2] - by[2]],
      [c[0] + tx[0] + by[0], c[1] + tx[1] + by[1], c[2] + tx[2] + by[2]],
      [c[0] - tx[0] + by[0], c[1] - tx[1] + by[1], c[2] - tx[2] + by[2]],
    ];
    w.quad(p, uv, 0.6 + rnd() * 0.4);
  }
  return w.done();
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
