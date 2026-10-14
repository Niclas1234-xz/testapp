import { mulberry32 } from './rng';

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
]);

/** Classic improved Perlin noise (2D and 3D), seeded. Output roughly in [-1, 1]. */
export class Perlin {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2(x: number, y: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const perm = this.perm;
    const pm = this.permMod12;
    const aa = pm[X + perm[Y]] * 3;
    const ab = pm[X + perm[Y + 1]] * 3;
    const ba = pm[X + 1 + perm[Y]] * 3;
    const bb = pm[X + 1 + perm[Y + 1]] * 3;
    const g = GRAD3;
    const n00 = g[aa] * xf + g[aa + 1] * yf;
    const n10 = g[ba] * (xf - 1) + g[ba + 1] * yf;
    const n01 = g[ab] * xf + g[ab + 1] * (yf - 1);
    const n11 = g[bb] * (xf - 1) + g[bb + 1] * (yf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0);
  }

  noise3(x: number, y: number, z: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const p = this.perm;
    const pm = this.permMod12;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    const g = GRAD3;
    const dot = (hashIndex: number, dx: number, dy: number, dz: number) => {
      const gi = pm[hashIndex] * 3;
      return g[gi] * dx + g[gi + 1] * dy + g[gi + 2] * dz;
    };
    const x1 = lerp(u, dot(AA, xf, yf, zf), dot(BA, xf - 1, yf, zf));
    const x2 = lerp(u, dot(AB, xf, yf - 1, zf), dot(BB, xf - 1, yf - 1, zf));
    const y1 = lerp(v, x1, x2);
    const x3 = lerp(u, dot(AA + 1, xf, yf, zf - 1), dot(BA + 1, xf - 1, yf, zf - 1));
    const x4 = lerp(u, dot(AB + 1, xf, yf - 1, zf - 1), dot(BB + 1, xf - 1, yf - 1, zf - 1));
    const y2 = lerp(v, x3, x4);
    return lerp(w, y1, y2);
  }

  /** Fractal sum of 2D octaves, normalized to roughly [-1, 1]. */
  fbm2(x: number, y: number, octaves: number, persistence = 0.5, lacunarity = 2) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq + i * 31.7, y * freq - i * 17.3) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves: number, persistence = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * freq + i * 19.1, y * freq, z * freq - i * 7.7) * amp;
      norm += amp;
      amp *= persistence;
      freq *= 2;
    }
    return sum / norm;
  }
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number) {
  return a + t * (b - a);
}
