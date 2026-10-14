import { block, faceTile, FACE_EAST, FACE_SOUTH, type Tint } from './blocks';
import { item } from './items';
import { pngDataUri } from './png';
import { getTile } from './textures/atlas';
import { hex, type RGB } from './textures/painter';

export const TINT_COLORS: Record<Exclude<Tint, null>, RGB> = {
  grass: hex(0x91bd59),
  foliage: hex(0x77ab2f),
  birch: hex(0x80a755),
  spruce: hex(0x619961),
};

const ICON = 32;
const cache = new Map<number, string>();

function sample(tileIndex: number, u: number, v: number): [number, number, number, number] {
  const t = getTile(tileIndex);
  const x = Math.min(15, Math.max(0, Math.floor(u * 16)));
  const y = Math.min(15, Math.max(0, Math.floor(v * 16)));
  const i = (y * 16 + x) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
}

/** Renders an isometric block icon (like the Minecraft inventory) into 32×32 RGBA pixels. */
function cubeIcon(blockId: number): Uint8Array {
  const def = block(blockId);
  const out = new Uint8Array(ICON * ICON * 4);
  const [, y0, , , y1] = def.box;
  const h = y1 - y0;
  const drop = (1 - y1) * 15;
  const tint = def.tint ? TINT_COLORS[def.tint] : null;
  const front = def.facing ? FACE_SOUTH : 0;
  const faces = [
    // top
    { o: [1, 8.5 + drop], u: [15, -7.5], v: [15, 7.5], tile: faceTile(blockId, 2, front), shade: 1, v0: 0, vs: 1, tinted: true },
    // left = south (front)
    { o: [1, 8.5 + drop], u: [15, 7.5], v: [0, 15 * h], tile: faceTile(blockId, FACE_SOUTH, front), shade: 0.8, v0: 1 - y1, vs: h, tinted: blockId !== 2 },
    // right = east
    { o: [16, 16 + drop], u: [15, -7.5], v: [0, 15 * h], tile: faceTile(blockId, FACE_EAST, front), shade: 0.6, v0: 1 - y1, vs: h, tinted: blockId !== 2 },
  ];
  for (let py = 0; py < ICON; py++) {
    for (let px = 0; px < ICON; px++) {
      const x = px + 0.5;
      const y = py + 0.5;
      for (const f of faces) {
        const det = f.u[0] * f.v[1] - f.u[1] * f.v[0];
        const dx = x - f.o[0];
        const dy = y - f.o[1];
        const u = (dx * f.v[1] - dy * f.v[0]) / det;
        const v = (f.u[0] * dy - f.u[1] * dx) / det;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const [r, g, b, a] = sample(f.tile, u, f.v0 + v * f.vs);
        if (a < 128) continue;
        const tr = tint && f.tinted ? tint : null;
        const i = (py * ICON + px) * 4;
        out[i] = (tr ? (r * tr[0]) / 255 : r) * f.shade;
        out[i + 1] = (tr ? (g * tr[1]) / 255 : g) * f.shade;
        out[i + 2] = (tr ? (b * tr[2]) / 255 : b) * f.shade;
        out[i + 3] = 255;
        break;
      }
    }
  }
  return out;
}

function flatIcon(tileIndex: number, tint: RGB | null): Uint8Array {
  const out = new Uint8Array(ICON * ICON * 4);
  for (let py = 0; py < ICON; py++)
    for (let px = 0; px < ICON; px++) {
      const [r, g, b, a] = sample(tileIndex, px / ICON, py / ICON);
      const i = (py * ICON + px) * 4;
      out[i] = tint ? (r * tint[0]) / 255 : r;
      out[i + 1] = tint ? (g * tint[1]) / 255 : g;
      out[i + 2] = tint ? (b * tint[2]) / 255 : b;
      out[i + 3] = a;
    }
  return out;
}

/** Data URI of an item's inventory icon (cached). */
export function itemIcon(id: number): string {
  const cached = cache.get(id);
  if (cached) return cached;
  const def = item(id);
  let pixels: Uint8Array;
  if (!def) pixels = new Uint8Array(ICON * ICON * 4);
  else if (def.cubeIcon && def.places !== undefined) pixels = cubeIcon(def.places);
  else {
    const b = def.places !== undefined && def.id < 256 ? block(def.places) : null;
    pixels = flatIcon(def.texture, b?.tint ? TINT_COLORS[b.tint] : null);
  }
  const uri = pngDataUri(pixels, ICON, ICON, 2);
  cache.set(id, uri);
  return uri;
}

/** 9×9 HUD sprites (hearts, hunger, air bubbles). */
const HUD_SPRITES: Record<string, { rows: string[]; palette: Record<string, number> }> = {
  heart: {
    rows: ['.OO...OO.', 'OrrO.OrrO', 'OrwrOrrrO', 'OrrrrrrrO', '.OrrrrrO.', '..OrrrO..', '...OrO...', '....O....'],
    palette: { O: 0x1a0000, r: 0xd41616, w: 0xffc0c0 },
  },
  heart_half: {
    rows: ['.OO...OO.', 'OrrO.OkkO', 'OrwrOkkkO', 'OrrrrkkkO', '.OrrrkkO.', '..OrrkO..', '...OrO...', '....O....'],
    palette: { O: 0x1a0000, r: 0xd41616, w: 0xffc0c0, k: 0x3a0a0a },
  },
  heart_empty: {
    rows: ['.OO...OO.', 'OkkO.OkkO', 'OkkkOkkkO', 'OkkkkkkkO', '.OkkkkkO.', '..OkkkO..', '...OkO...', '....O....'],
    palette: { O: 0x1a0000, k: 0x3a0a0a },
  },
  food: {
    rows: ['....OOO..', '...ObbbO.', '..ObblbbO', '..ObbbbbO', '..OObbbO.', '.OwOOOO..', 'OwwO.....', 'OwO......', '.O.......'],
    palette: { O: 0x2a1000, b: 0xb5652a, l: 0xe0a060, w: 0xf0e8d8 },
  },
  food_half: {
    rows: ['....OOO..', '...ObbbO.', '..ObblbbO', '..ObbkkkO', '..OObkkO.', '.OkOOOO..', 'OkkO.....', 'OkO......', '.O.......'],
    palette: { O: 0x2a1000, b: 0xb5652a, l: 0xe0a060, k: 0x3a2410 },
  },
  food_empty: {
    rows: ['....OOO..', '...OkkkO.', '..OkkkkkO', '..OkkkkkO', '..OOkkkO.', '.OkOOOO..', 'OkkO.....', 'OkO......', '.O.......'],
    palette: { O: 0x2a1000, k: 0x3a2410 },
  },
  armor: {
    rows: ['OOO...OOO', 'OwlO.OllO', 'OllOOOllO', 'OlllllllO', '.OlllllO.', '.OlllllO.', '.OlllllO.', '.OOOOOOO.'],
    palette: { O: 0x1f1f1f, l: 0xc6c6c6, w: 0xffffff },
  },
  armor_half: {
    rows: ['OOO...OOO', 'OwlO.OkkO', 'OllOOOkkO', 'OllllkkkO', '.OlllkkO.', '.OlllkkO.', '.OlllkkO.', '.OOOOOOO.'],
    palette: { O: 0x1f1f1f, l: 0xc6c6c6, w: 0xffffff, k: 0x4a4a4a },
  },
  armor_empty: {
    rows: ['OOO...OOO', 'OkkO.OkkO', 'OkkOOOkkO', 'OkkkkkkkO', '.OkkkkkO.', '.OkkkkkO.', '.OkkkkkO.', '.OOOOOOO.'],
    palette: { O: 0x1f1f1f, k: 0x4a4a4a },
  },
  bubble: {
    rows: ['..OOOOO..', '.OwwbbbO.', 'OwwbbbbbO', 'OwbbbbbbO', 'ObbbbbbbO', 'ObbbbbbbO', '.ObbbbbO.', '..OOOOO..'],
    palette: { O: 0x1a3a8a, w: 0xffffff, b: 0x4a8af0 },
  },
};

const hudCache = new Map<string, string>();

export function hudIcon(name: keyof typeof HUD_SPRITES): string {
  const cached = hudCache.get(name);
  if (cached) return cached;
  const { rows, palette } = HUD_SPRITES[name];
  const px = new Uint8Array(9 * 9 * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (c === undefined) continue;
      const i = (y * 9 + x) * 4;
      px[i] = (c >> 16) & 255;
      px[i + 1] = (c >> 8) & 255;
      px[i + 2] = c & 255;
      px[i + 3] = 255;
    }
  });
  const uri = pngDataUri(px, 9, 9, 6);
  hudCache.set(name, uri);
  return uri;
}

/** Darkened tileable texture for menu backgrounds (like the dirt screens). */
export function backgroundTexture(tileIndex: number, brightness: number): string {
  const key = `bg:${tileIndex}:${brightness}`;
  const cached = hudCache.get(key);
  if (cached) return cached;
  const t = getTile(tileIndex);
  const px = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    px[i * 4] = t.data[i * 4] * brightness;
    px[i * 4 + 1] = t.data[i * 4 + 1] * brightness;
    px[i * 4 + 2] = t.data[i * 4 + 2] * brightness;
    px[i * 4 + 3] = 255;
  }
  const uri = pngDataUri(px, 16, 16, 4);
  hudCache.set(key, uri);
  return uri;
}

const LOGO_FONT: Record<string, string[]> = {
  M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
  I: ['XXX', '.X.', '.X.', '.X.', '.X.', '.X.', 'XXX'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  F: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'X....'],
  T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
};

/** Stone-textured pixel logo with a 3D shadow, like the classic title screen. */
export function logoImage(text: string, stoneTile: number): { uri: string; width: number; height: number } {
  const cell = 4;
  const depth = 2;
  const letters = text.split('').map((ch) => LOGO_FONT[ch] ?? LOGO_FONT.I);
  const cols = letters.reduce((s, l) => s + l[0].length + 1, -1);
  const w = cols * cell + depth * cell;
  const h = 7 * cell + depth * cell;
  const px = new Uint8Array(w * h * 4);
  const stone = getTile(stoneTile);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  const filled: [number, number][] = [];
  let ox = 0;
  for (const l of letters) {
    l.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') filled.push([ox + x, y]);
    });
    ox += l[0].length + 1;
  }
  // Extruded shadow first, then the stone face on top.
  for (let d = depth * cell; d >= 1; d--)
    for (const [fx, fy] of filled)
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) put(fx * cell + x + d, fy * cell + y + d, 40, 40, 40);
  for (const [fx, fy] of filled)
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const gx = fx * cell + x;
        const gy = fy * cell + y;
        const si = ((gy % 16) * 16 + (gx % 16)) * 4;
        const edge = y === 0 || x === 0 ? 1.25 : 1;
        put(gx, gy, Math.min(255, stone.data[si] * edge), Math.min(255, stone.data[si + 1] * edge), Math.min(255, stone.data[si + 2] * edge));
      }
  return { uri: pngDataUri(px, w, h, 3), width: w * 3, height: h * 3 };
}
