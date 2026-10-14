import { mulberry32, type Rng } from '../rng';

export type RGB = readonly [number, number, number];

export const TEX = 16;

/** A 16×16 RGBA pixel texture. */
export class Tex {
  readonly data = new Uint8ClampedArray(TEX * TEX * 4);

  set(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || y < 0 || x >= TEX || y >= TEX) return;
    const i = (y * TEX + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  get(x: number, y: number): RGB {
    const i = (((y + TEX) % TEX) * TEX + ((x + TEX) % TEX)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  alpha(x: number, y: number) {
    return this.data[(((y + TEX) % TEX) * TEX + ((x + TEX) % TEX)) * 4 + 3];
  }

  clear(x: number, y: number) {
    this.data[(y * TEX + x) * 4 + 3] = 0;
  }

  fill(c: RGB, a = 255) {
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) this.set(x, y, c, a);
    return this;
  }

  copy() {
    const t = new Tex();
    t.data.set(this.data);
    return t;
  }

  /** Draws a 16-row string sprite; each char maps to a color in the palette ('.' = untouched). */
  sprite(rows: readonly string[], palette: Record<string, RGB | null>, ox = 0, oy = 0) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const c = palette[ch];
        if (c === undefined) continue;
        if (c === null) this.clear(x + ox, y + oy);
        else this.set(x + ox, y + oy, c);
      }
    }
    return this;
  }
}

export function hex(v: number): RGB {
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function scale(c: RGB, f: number): RGB {
  return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    clamp255(a[0] + (b[0] - a[0]) * t),
    clamp255(a[1] + (b[1] - a[1]) * t),
    clamp255(a[2] + (b[2] - a[2]) * t),
  ];
}

export function gray(v: number): RGB {
  const c = clamp255(v);
  return [c, c, c];
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Tileable value noise on a 16×16 tile with the given cell count per side. Returns 0..1. */
export function tileNoise(rng: Rng, cells: number) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(TEX * TEX);
  const step = TEX / cells;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const gx = x / step;
      const gy = y / step;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = smooth(gx - x0);
      const fy = smooth(gy - y0);
      const at = (ix: number, iy: number) => grid[((iy % cells) * cells + (ix % cells)) | 0];
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out[y * TEX + x] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
  }
  return out;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Picks palette entries per pixel using a value 0..1 (e.g. noise mixed with randomness). */
export function paletteFill(t: Tex, palette: readonly RGB[], value: (x: number, y: number) => number) {
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const v = Math.min(0.9999, Math.max(0, value(x, y)));
      t.set(x, y, palette[Math.floor(v * palette.length)]);
    }
  }
  return t;
}

/** Tileable Voronoi: returns per pixel the cell id and the distance-to-edge (0 = on an edge). */
export function voronoi(rng: Rng, points: number) {
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < points; i++) {
    px.push(rng() * TEX);
    py.push(rng() * TEX);
  }
  const cell = new Uint8Array(TEX * TEX);
  const edge = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let best = Infinity;
      let second = Infinity;
      let bestId = 0;
      for (let i = 0; i < points; i++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const dx = x + 0.5 - (px[i] + ox * TEX);
            const dy = y + 0.5 - (py[i] + oy * TEX);
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) {
              second = best;
              best = d;
              bestId = i;
            } else if (d < second) {
              second = d;
            }
          }
        }
      }
      cell[y * TEX + x] = bestId;
      edge[y * TEX + x] = second - best;
    }
  }
  return { cell, edge };
}

export function seeded(name: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return mulberry32(h >>> 0);
}
