import type { Rng } from '../rng';
import { gray, hex, mix, paletteFill, scale, Tex, TEX, tileNoise, voronoi, type RGB } from './painter';

type Gen = (rng: Rng) => Tex;

const STONE: RGB[] = [hex(0x686868), hex(0x747474), hex(0x7f7f7f), hex(0x8a8a8a), hex(0x969696)];
const DIRT: RGB[] = [hex(0x593d29), hex(0x6c4c32), hex(0x79553a), hex(0x866043), hex(0x96704d)];

function stone(rng: Rng) {
  const n = tileNoise(rng, 4);
  const n2 = tileNoise(rng, 8);
  return paletteFill(new Tex(), STONE, (x, y) => n[y * TEX + x] * 0.45 + n2[y * TEX + x] * 0.3 + rng() * 0.3);
}

function dirt(rng: Rng) {
  const t = paletteFill(new Tex(), DIRT, () => 0.15 + rng() * 0.8);
  for (let i = 0; i < 6; i++) t.set(Math.floor(rng() * TEX), Math.floor(rng() * TEX), hex(0x8b8b8b));
  return t;
}

/** Grayscale grass top; tinted per biome in the shader. */
function grassTop(rng: Rng) {
  const n = tileNoise(rng, 8);
  return paletteFill(
    new Tex(),
    [gray(150), gray(166), gray(180), gray(194), gray(210), gray(226)],
    (x, y) => n[y * TEX + x] * 0.35 + rng() * 0.65
  );
}

const GRASS_SIDE_GREEN: RGB[] = [hex(0x5d8c33), hex(0x679c39), hex(0x72ac40), hex(0x7fbc47)];

function grassSide(rng: Rng, snowy: boolean) {
  const t = dirt(rng);
  const cover = snowy
    ? [hex(0xdfeeee), hex(0xeaf5f5), hex(0xf5fbfb), hex(0xffffff)]
    : GRASS_SIDE_GREEN;
  for (let x = 0; x < TEX; x++) {
    const depth = 3 + (rng() < 0.5 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) t.set(x, y, cover[Math.floor(rng() * cover.length)]);
  }
  return t;
}

function cobblestone(rng: Rng) {
  const { cell, edge } = voronoi(rng, 11);
  const shades = Array.from({ length: 11 }, () => 0.82 + rng() * 0.3);
  const t = new Tex();
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      if (edge[i] < 1.1) t.set(x, y, rng() < 0.5 ? hex(0x4f4f4f) : hex(0x5c5c5c));
      else {
        const base = 124 * shades[cell[i]] + (rng() - 0.5) * 18 + Math.min(edge[i], 4) * 4;
        t.set(x, y, gray(base));
      }
    }
  }
  return t;
}

function logSide(rng: Rng, base: RGB, dark: RGB, light: RGB) {
  const t = new Tex();
  const col: number[] = [];
  for (let x = 0; x < TEX; x++) col.push(rng());
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const v = col[x] * 0.7 + rng() * 0.3;
      t.set(x, y, v < 0.3 ? dark : v > 0.78 ? light : base);
    }
  }
  return t;
}

function logTop(rng: Rng, bark: RGB, ringA: RGB, ringB: RGB) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) {
        t.set(x, y, scale(bark, 0.9 + rng() * 0.2));
        continue;
      }
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(d) % 2 === 0;
      t.set(x, y, scale(ring ? ringA : ringB, 0.95 + rng() * 0.1));
    }
  }
  return t;
}

function planks(rng: Rng, base: RGB) {
  const t = new Tex();
  const dark = scale(base, 0.72);
  const light = scale(base, 1.08);
  const seams = [3, 11, 7, 13];
  for (let y = 0; y < TEX; y++) {
    const board = Math.floor(y / 4);
    for (let x = 0; x < TEX; x++) {
      let c = rng() < 0.18 ? scale(base, 0.9) : rng() < 0.12 ? light : base;
      if (y % 4 === 3) c = dark;
      else if (x === seams[board]) c = scale(base, 0.78);
      t.set(x, y, c);
    }
  }
  return t;
}

/** Grayscale leaves (tinted per biome); `opaque` fills the holes for the fast graphics mode. */
function leaves(rng: Rng, opaque: boolean) {
  const t = new Tex();
  const n = tileNoise(rng, 8);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const v = n[y * TEX + x] * 0.4 + rng() * 0.6;
      if (v < 0.26) {
        if (opaque) t.set(x, y, gray(48));
        else t.clear(x, y);
      } else t.set(x, y, gray(110 + v * 130));
    }
  }
  return t;
}

function sand(rng: Rng, palette: RGB[]) {
  return paletteFill(new Tex(), palette, () => rng());
}

function gravel(rng: Rng) {
  const { cell, edge } = voronoi(rng, 18);
  const colors = [hex(0x9a908e), hex(0x7f7774), hex(0x8b8483), hex(0x6a625f), hex(0xaaa29f), hex(0x857b6f)];
  const pick = Array.from({ length: 18 }, () => colors[Math.floor(rng() * colors.length)]);
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      t.set(x, y, edge[i] < 0.8 ? hex(0x5a5250) : scale(pick[cell[i]], 0.92 + rng() * 0.16));
    }
  return t;
}

function bedrock(rng: Rng) {
  const n = tileNoise(rng, 4);
  return paletteFill(
    new Tex(),
    [hex(0x1f1f1f), hex(0x333333), hex(0x4d4d4d), hex(0x5f5f5f), hex(0x7a7a7a)],
    (x, y) => n[y * TEX + x] * 0.4 + rng() * 0.6
  );
}

function ore(rng: Rng, colors: RGB[]) {
  const t = stone(rng);
  const clusters = 5;
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + Math.floor(rng() * 12);
    const cy = 2 + Math.floor(rng() * 12);
    const size = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < size; i++) {
      const x = cx + Math.floor(rng() * 3) - 1;
      const y = cy + Math.floor(rng() * 3) - 1;
      t.set(x, y, colors[Math.floor(rng() * colors.length)]);
    }
  }
  return t;
}

function glass() {
  const t = new Tex();
  const frame = hex(0xdcecef);
  const shade = hex(0xa9c7cc);
  for (let i = 0; i < TEX; i++) {
    t.set(i, 0, frame);
    t.set(0, i, frame);
    t.set(i, 15, shade);
    t.set(15, i, shade);
  }
  const streaks: [number, number][] = [
    [3, 3], [4, 2], [2, 4], [11, 9], [12, 8], [10, 10], [9, 11], [5, 5], [13, 7],
  ];
  for (const [x, y] of streaks) t.set(x, y, hex(0xffffff), 200);
  return t;
}

function craftingTop(rng: Rng) {
  const t = planks(rng, hex(0xa2824e));
  const frame = hex(0x6b5230);
  for (let i = 0; i < TEX; i++) {
    t.set(i, 0, frame);
    t.set(0, i, frame);
    t.set(i, 15, frame);
    t.set(15, i, frame);
  }
  for (let i = 2; i < 14; i++) {
    t.set(i, 2, hex(0x8a6d40));
    t.set(2, i, hex(0x8a6d40));
    t.set(i, 13, hex(0x5b4528));
    t.set(13, i, hex(0x5b4528));
  }
  return t;
}

function craftingSide(rng: Rng, front: boolean) {
  const t = planks(rng, hex(0xa2824e));
  const top = hex(0x6b5230);
  for (let x = 0; x < TEX; x++) {
    t.set(x, 0, top);
    t.set(x, 1, hex(0x86683d));
    t.set(x, 2, top);
  }
  const iron = hex(0xb8b8b8);
  const ironDark = hex(0x7a7a7a);
  const handle = hex(0x5b3f1d);
  if (front) {
    // hammer and saw
    for (let y = 4; y < 12; y++) t.set(4, y, handle);
    for (let x = 2; x < 7; x++) {
      t.set(x, 4, iron);
      t.set(x, 5, ironDark);
    }
    for (let y = 4; y < 13; y++) {
      t.set(10, y, iron);
      t.set(11, y, y % 2 === 0 ? ironDark : iron);
    }
    t.set(10, 3, handle);
    t.set(11, 3, handle);
  } else {
    // shears and pliers
    for (let i = 0; i < 6; i++) {
      t.set(3 + i, 5 + i, iron);
      t.set(8 - i, 5 + i, ironDark);
    }
    for (let y = 4; y < 12; y++) t.set(12, y, handle);
    t.set(11, 4, iron);
    t.set(13, 4, iron);
  }
  return t;
}

function smoothStone(rng: Rng, frame: boolean) {
  const t = paletteFill(new Tex(), [hex(0x8f8f8f), hex(0x999999), hex(0xa3a3a3)], () => rng());
  if (frame) {
    for (let i = 0; i < TEX; i++) {
      t.set(i, 0, hex(0x6b6b6b));
      t.set(0, i, hex(0x6b6b6b));
      t.set(i, 15, hex(0x5a5a5a));
      t.set(15, i, hex(0x5a5a5a));
    }
  }
  return t;
}

function furnaceFront(rng: Rng, lit: boolean) {
  const t = smoothStone(rng, true);
  for (let x = 3; x < 13; x++) {
    t.set(x, 3, hex(0x5a5a5a));
    t.set(x, 5, hex(0x5a5a5a));
  }
  for (let y = 8; y < 14; y++) {
    for (let x = 3; x < 13; x++) {
      const border = y === 8 || x === 3 || x === 12 || y === 13;
      if (border) t.set(x, y, hex(0x4a4a4a));
      else if (lit) {
        const v = rng();
        const hot = y >= 11;
        t.set(x, y, hot ? (v < 0.5 ? hex(0xffd34a) : hex(0xff9b1e)) : v < 0.4 ? hex(0xe0601a) : hex(0x2b2b2b));
      } else t.set(x, y, y === 12 ? hex(0x3a3a3a) : hex(0x1b1b1b));
    }
  }
  return t;
}

function torch() {
  const t = new Tex();
  const stick = hex(0x8a6a3a);
  const stickDark = hex(0x5d4321);
  for (let y = 8; y < 16; y++) {
    t.set(7, y, stick);
    t.set(8, y, stickDark);
  }
  t.set(7, 6, hex(0xfff8c8));
  t.set(8, 6, hex(0xffd64a));
  t.set(7, 7, hex(0xffb43a));
  t.set(8, 7, hex(0xff8a1e));
  return t;
}

function chest(rng: Rng, face: 'front' | 'side' | 'top') {
  const t = new Tex();
  const wood = [hex(0x9c6a2e), hex(0xa77634), hex(0x8f5f27)];
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, wood[Math.floor(rng() * 3)]);
  const frame = hex(0x3e2a12);
  for (let i = 0; i < TEX; i++) {
    t.set(i, 0, frame);
    t.set(0, i, frame);
    t.set(i, 15, frame);
    t.set(15, i, frame);
  }
  if (face !== 'top') for (let x = 0; x < TEX; x++) t.set(x, 5, frame);
  if (face === 'front') {
    for (let y = 3; y < 8; y++) for (let x = 7; x < 9; x++) t.set(x, y, hex(0xc9c9c9));
    t.set(7, 7, hex(0x7f7f7f));
    t.set(8, 7, hex(0x7f7f7f));
  }
  return t;
}

function cactusSide(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const stripe = x % 4 === 1;
      t.set(x, y, stripe ? hex(0x2a8a35) : rng() < 0.3 ? hex(0x0f5f1b) : hex(0x146d22));
    }
  }
  for (let i = 0; i < 10; i++) t.set(Math.floor(rng() * 16), Math.floor(rng() * 16), hex(0xd6d6a8));
  return t;
}

function cactusTop(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      t.set(x, y, d > 6 ? hex(0x0f5f1b) : d % 2 < 1 ? hex(0x2a8a35) : hex(0x5ba04f));
      if (rng() < 0.05) t.set(x, y, hex(0x146d22));
    }
  return t;
}

const SANDSTONE: RGB[] = [hex(0xd2c48f), hex(0xd9cc9a), hex(0xe0d4a6), hex(0xcabd87)];

function sandstoneSide(rng: Rng) {
  const t = sand(rng, SANDSTONE);
  for (let x = 0; x < TEX; x++) {
    t.set(x, 0, hex(0xe6dbb0));
    t.set(x, 3, hex(0xc4b47c));
    t.set(x, 11, hex(0xc4b47c));
    t.set(x, 12, hex(0xbfae76));
    t.set(x, 13, hex(0xb8a66e));
    t.set(x, 14, hex(0xbfae76));
    t.set(x, 15, hex(0xaf9d65));
  }
  return t;
}

function plantBlades(rng: Rng) {
  const t = new Tex();
  for (let b = 0; b < 11; b++) {
    let x = 1 + Math.floor(rng() * 14);
    const h = 5 + Math.floor(rng() * 10);
    const lean = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < h; i++) {
      if (i > 3 && rng() < 0.2) x += lean;
      t.set(x, 15 - i, gray(140 + rng() * 100));
    }
  }
  return t;
}

function flower(petal: RGB, petalDark: RGB, center: RGB) {
  const t = new Tex();
  const stem = hex(0x3f8f1f);
  for (let y = 9; y < 16; y++) t.set(8, y, stem);
  t.set(7, 12, stem);
  t.set(6, 11, hex(0x4fa82a));
  t.set(9, 13, stem);
  t.set(10, 12, hex(0x4fa82a));
  t.sprite(
    ['......pp......', '.....pPPp.....', '....pPcPPp....', '....pPPPPp....', '.....pPPp.....', '......pp......'],
    { p: petalDark, P: petal, c: center },
    1,
    4
  );
  return t;
}

function deadBush(rng: Rng) {
  const t = new Tex();
  const c = [hex(0x6b4a24), hex(0x8a6232), hex(0x553a1a)];
  const branch = (x: number, y: number, dx: number, len: number) => {
    for (let i = 0; i < len; i++) {
      t.set(x, y, c[Math.floor(rng() * 3)]);
      y--;
      if (i % 2 === 1) x += dx;
    }
  };
  branch(8, 15, 0, 6);
  branch(8, 11, -1, 6);
  branch(8, 11, 1, 6);
  branch(7, 13, -1, 5);
  branch(9, 12, 1, 5);
  branch(6, 8, 1, 3);
  return t;
}

function sapling(rng: Rng, leaf: RGB, trunk: RGB) {
  const t = new Tex();
  for (let y = 9; y < 16; y++) t.set(7, y, trunk);
  t.set(8, 12, trunk);
  for (let y = 1; y < 11; y++)
    for (let x = 2; x < 14; x++) {
      const dx = (x - 7.5) / 5.5;
      const dy = (y - 5.5) / 4.8;
      if (dx * dx + dy * dy < 1 && rng() < 0.82) t.set(x, y, scale(leaf, 0.75 + rng() * 0.45));
    }
  return t;
}

function wool(rng: Rng, base: RGB) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const pattern = (x + y * 2) % 4 === 0 ? 0.93 : 1;
      t.set(x, y, scale(base, pattern * (0.96 + rng() * 0.06)));
    }
  return t;
}

function birchSide(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) t.set(x, y, rng() < 0.25 ? hex(0xc8c7c0) : hex(0xdcdbd4));
  for (let m = 0; m < 7; m++) {
    const y = Math.floor(rng() * 16);
    const x0 = Math.floor(rng() * 14);
    const len = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < len; i++) t.set((x0 + i) % 16, y, rng() < 0.5 ? hex(0x2c2c26) : hex(0x46463e));
  }
  return t;
}

function farmland(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const furrow = y % 4 === 0 || y % 4 === 3;
      const base = furrow ? hex(0x3e2a17) : hex(0x5a3b20);
      t.set(x, y, scale(base, 0.88 + rng() * 0.24));
    }
  return t;
}

function wheat(rng: Rng, stage: number) {
  const t = new Tex();
  const height = 2 + Math.round((stage / 7) * 12);
  const ripe = stage / 7;
  const stalk = mix(hex(0x2f8f17), hex(0xb08a2e), ripe);
  const grain = mix(hex(0x5ab02a), hex(0xd8b04a), ripe);
  for (const x of [1, 3, 5, 8, 10, 12, 14]) {
    const h = Math.max(1, height - Math.floor(rng() * 3));
    for (let i = 0; i < h; i++) {
      const y = 15 - i;
      const top = i >= h - Math.max(1, Math.round(h * 0.35));
      t.set(x, y, top && stage >= 4 ? scale(grain, 0.85 + rng() * 0.3) : scale(stalk, 0.85 + rng() * 0.3));
      if (top && stage >= 6 && i % 2 === 0) t.set(x + 1, y, scale(grain, 0.8));
    }
  }
  return t;
}

function stoneBricks(rng: Rng) {
  const t = paletteFill(new Tex(), [hex(0x767676), hex(0x7d7d7d), hex(0x858585)], () => rng());
  const mortar = hex(0x4f4f4f);
  const hi = hex(0x939393);
  for (let x = 0; x < TEX; x++) {
    t.set(x, 7, mortar);
    t.set(x, 15, mortar);
    t.set(x, 0, hi);
    t.set(x, 8, hi);
  }
  for (let y = 0; y < 7; y++) {
    t.set(15, y, mortar);
    t.set(0, y, hi);
  }
  for (let y = 8; y < 15; y++) {
    t.set(7, y, mortar);
    t.set(8, y, hi);
  }
  return t;
}

function water(rng: Rng) {
  const t = new Tex();
  const n = tileNoise(rng, 4);
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const wave = Math.sin((x + y * 0.5 + n[y * TEX + x] * 6) * 0.9) * 0.5 + 0.5;
      const c = mix(hex(0x2f5fd0), hex(0x4f86f0), wave * 0.8 + rng() * 0.2);
      t.set(x, y, c, 175);
    }
  return t;
}

function ice(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) t.set(x, y, rng() < 0.2 ? hex(0x9ebdf7) : hex(0x84a8f2), 200);
  for (let i = 0; i < 4; i++) {
    const x0 = Math.floor(rng() * 12);
    const y0 = Math.floor(rng() * 12);
    for (let k = 0; k < 4; k++) t.set(x0 + k, y0 + k, hex(0xd8e6ff), 220);
  }
  return t;
}

function snow(rng: Rng) {
  return paletteFill(new Tex(), [hex(0xe4f0f0), hex(0xeef7f7), hex(0xf8fcfc), hex(0xffffff)], () => rng());
}

/** Crack overlays for block breaking, multiplied onto the block (white = unchanged). */
function crackStages(): Gen[] {
  const rng = seededLocal(7331);
  const order: number[] = [];
  const seen = new Set<number>();
  const walkers: { x: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) walkers.push({ x: 8, y: 8 });
  for (let step = 0; step < 200 && order.length < 150; step++) {
    for (const w of walkers) {
      const dir = Math.floor(rng() * 8);
      const dx = [1, 1, 0, -1, -1, -1, 0, 1][dir];
      const dy = [0, 1, 1, 1, 0, -1, -1, -1][dir];
      w.x = Math.max(0, Math.min(15, w.x + dx));
      w.y = Math.max(0, Math.min(15, w.y + dy));
      const key = w.y * 16 + w.x;
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  const stages: Gen[] = [];
  for (let s = 0; s < 10; s++) {
    const count = Math.round(((s + 1) / 10) * order.length);
    stages.push(() => {
      const t = new Tex().fill(gray(255));
      for (let i = 0; i < count; i++) {
        const k = order[i];
        t.set(k % 16, Math.floor(k / 16), gray(i % 3 === 0 ? 60 : 90));
      }
      return t;
    });
  }
  return stages;
}

function tinted(t: Tex, color: number) {
  const c = hex(color);
  for (let i = 0; i < 256; i++) {
    t.data[i * 4] = (t.data[i * 4] * c[0]) / 255;
    t.data[i * 4 + 1] = (t.data[i * 4 + 1] * c[1]) / 255;
    t.data[i * 4 + 2] = (t.data[i * 4 + 2] * c[2]) / 255;
  }
  return t;
}

function bedTop(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const pillow = y < 5 && x > 1 && x < 14;
      const edge = x === 0 || x === 15;
      if (pillow) t.set(x, y, scale(hex(0xeeeeee), 0.92 + rng() * 0.08));
      else if (edge) t.set(x, y, hex(0x7a1f1f));
      else t.set(x, y, scale(hex(0xa62b2b), (y + x) % 5 === 0 ? 0.88 : 0.97 + rng() * 0.06));
    }
  return t;
}

function bedSide(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      if (y < 7) t.clear(x, y);
      else if (y < 11) t.set(x, y, scale(hex(0xa62b2b), 0.9 + rng() * 0.1));
      else if (y < 13 || x < 3 || x > 12) t.set(x, y, scale(hex(0x9c7a46), 0.85 + rng() * 0.15));
      else t.clear(x, y);
    }
  return t;
}

function seededLocal(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
}

const crack = crackStages();

export const BLOCK_TEXTURES: Record<string, Gen> = {
  stone,
  dirt,
  grass_top: grassTop,
  // Pre-tinted copies for items and break particles.
  grass_top_item: (r) => tinted(grassTop(r), 0x91bd59),
  tall_grass_tinted: (r) => tinted(plantBlades(r), 0x91bd59),
  oak_leaves_tinted: (r) => tinted(leaves(r, false), 0x77ab2f),
  birch_leaves_tinted: (r) => tinted(leaves(r, false), 0x80a755),
  spruce_leaves_tinted: (r) => tinted(leaves(r, false), 0x619961),
  grass_side: (r) => grassSide(r, false),
  grass_side_snowy: (r) => grassSide(r, true),
  cobblestone,
  oak_log: (r) => logSide(r, hex(0x6b5232), hex(0x4c3a22), hex(0x7d6340)),
  oak_log_top: (r) => logTop(r, hex(0x6b5232), hex(0xb08d57), hex(0x9a7746)),
  oak_planks: (r) => planks(r, hex(0xa2824e)),
  oak_leaves: (r) => leaves(r, false),
  oak_leaves_opaque: (r) => leaves(r, true),
  birch_log: birchSide,
  birch_log_top: (r) => logTop(r, hex(0xd8d7d0), hex(0xd6c18a), hex(0xc4ad75)),
  birch_planks: (r) => planks(r, hex(0xc4b07b)),
  birch_leaves: (r) => leaves(r, false),
  birch_leaves_opaque: (r) => leaves(r, true),
  spruce_log: (r) => logSide(r, hex(0x3d2913), hex(0x2a1c0c), hex(0x4f3720)),
  spruce_log_top: (r) => logTop(r, hex(0x3d2913), hex(0x7a5a33), hex(0x684a28)),
  spruce_planks: (r) => planks(r, hex(0x735532)),
  spruce_leaves: (r) => leaves(r, false),
  spruce_leaves_opaque: (r) => leaves(r, true),
  sand: (r) => sand(r, [hex(0xd6c999), hex(0xdbcfa3), hex(0xe3d9b0), hex(0xcfc28f)]),
  gravel,
  bedrock,
  coal_ore: (r) => ore(r, [hex(0x1f1f1f), hex(0x2f2f2f), hex(0x3b3b3b)]),
  iron_ore: (r) => ore(r, [hex(0xd8af93), hex(0xc69476), hex(0xe4c0a8)]),
  gold_ore: (r) => ore(r, [hex(0xfcee4b), hex(0xe6c228), hex(0xfff7a0)]),
  diamond_ore: (r) => ore(r, [hex(0x5decf5), hex(0x2ccbd6), hex(0xb8fbff)]),
  glass,
  crafting_table_top: craftingTop,
  crafting_table_side: (r) => craftingSide(r, false),
  crafting_table_front: (r) => craftingSide(r, true),
  furnace_front: (r) => furnaceFront(r, false),
  furnace_front_lit: (r) => furnaceFront(r, true),
  furnace_side: (r) => smoothStone(r, true),
  furnace_top: (r) => smoothStone(r, false),
  torch,
  chest_front: (r) => chest(r, 'front'),
  chest_side: (r) => chest(r, 'side'),
  chest_top: (r) => chest(r, 'top'),
  snow,
  ice,
  cactus_side: cactusSide,
  cactus_top: cactusTop,
  sandstone_top: (r) => sand(r, SANDSTONE),
  sandstone_side: sandstoneSide,
  tall_grass: plantBlades,
  dandelion: () => flower(hex(0xffec4f), hex(0xd8b51e), hex(0xf5a623)),
  poppy: () => flower(hex(0xe02a1c), hex(0xa8160d), hex(0x2b2b14)),
  dead_bush: deadBush,
  oak_sapling: (r) => sapling(r, hex(0x4f9a2a), hex(0x6b5232)),
  birch_sapling: (r) => sapling(r, hex(0x7fa755), hex(0xd8d7d0)),
  spruce_sapling: (r) => sapling(r, hex(0x3d6b3d), hex(0x3d2913)),
  white_wool: (r) => wool(r, hex(0xeaeded)),
  farmland: farmland,
  stone_bricks: stoneBricks,
  bed_top: bedTop,
  bed_side: bedSide,
  water,
  ...Object.fromEntries(Array.from({ length: 8 }, (_, s) => [`wheat_${s}`, (r: Rng) => wheat(r, s)])),
  ...Object.fromEntries(crack.map((g, i) => [`destroy_${i}`, g])),
};
