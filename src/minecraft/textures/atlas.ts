import { BLOCK_TEXTURES } from './blockTextures';
import { ENTITY_TEXTURES, ITEM_TEXTURES } from './itemTextures';
import { seeded, Tex, TEX } from './painter';

/** Tiles per atlas row; the atlas holds ATLAS_TILES² textures of 16×16 pixels. */
export const ATLAS_TILES = 16;
export const ATLAS_SIZE = ATLAS_TILES * TEX;

const GENERATORS = { ...BLOCK_TEXTURES, ...ITEM_TEXTURES, ...ENTITY_TEXTURES };
const NAMES = Object.keys(GENERATORS);

if (NAMES.length > ATLAS_TILES * ATLAS_TILES) {
  throw new Error(`Texture atlas overflow: ${NAMES.length} textures`);
}

const TILE_INDEX: Record<string, number> = {};
NAMES.forEach((name, i) => {
  TILE_INDEX[name] = i;
});

/** Atlas tile index of a texture by name. */
export function tile(name: string): number {
  const i = TILE_INDEX[name];
  if (i === undefined) throw new Error(`Unknown texture "${name}"`);
  return i;
}

let tiles: Tex[] | null = null;

/** All textures, generated once on first use (deterministic per texture name). */
export function getTiles(): Tex[] {
  if (!tiles) tiles = NAMES.map((name) => GENERATORS[name](seeded(name)));
  return tiles;
}

export function getTile(index: number): Tex {
  return getTiles()[index];
}

/** The atlas as RGBA pixels plus its mipmap chain (down to 1×1, as WebGL 1 requires). */
export function buildAtlas(): Uint8Array[] {
  const all = getTiles();
  const base = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  all.forEach((t, i) => {
    const ox = (i % ATLAS_TILES) * TEX;
    const oy = Math.floor(i / ATLAS_TILES) * TEX;
    for (let y = 0; y < TEX; y++) {
      const src = y * TEX * 4;
      const dst = ((oy + y) * ATLAS_SIZE + ox) * 4;
      base.set(t.data.subarray(src, src + TEX * 4), dst);
    }
  });
  const levels = [base];
  let size = ATLAS_SIZE;
  let prev = base;
  while (size > 1) {
    const next = size / 2;
    const out = new Uint8Array(next * next * 4);
    for (let y = 0; y < next; y++) {
      for (let x = 0; x < next; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y * 2 + dy) * size + x * 2 + dx) * 4;
            const al = prev[i + 3];
            r += prev[i] * al;
            g += prev[i + 1] * al;
            b += prev[i + 2] * al;
            a += al;
          }
        const o = (y * next + x) * 4;
        if (a > 0) {
          out[o] = r / a;
          out[o + 1] = g / a;
          out[o + 2] = b / a;
        }
        // Keep cutout textures (leaves) from dissolving at a distance.
        out[o + 3] = Math.min(255, (a / 4) * 1.25);
      }
    }
    levels.push(out);
    prev = out;
    size = next;
  }
  return levels;
}
