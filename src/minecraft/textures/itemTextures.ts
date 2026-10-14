import type { Rng } from '../rng';
import { hex, scale, Tex, TEX, type RGB } from './painter';

type Gen = (rng: Rng) => Tex;

/** Outline + dark + mid + light (+ highlight) colors of a tool material. */
type Material = { o: RGB; d: RGB; m: RGB; l: RGB };

export const TOOL_MATERIALS: Record<string, Material> = {
  wooden: { o: hex(0x3d2c10), d: hex(0x6b511f), m: hex(0x896727), l: hex(0xb08b44) },
  stone: { o: hex(0x2e2e2e), d: hex(0x5c5c5c), m: hex(0x7f7f7f), l: hex(0xa0a0a0) },
  iron: { o: hex(0x353535), d: hex(0x9a9a9a), m: hex(0xd0d0d0), l: hex(0xffffff) },
  golden: { o: hex(0x5a4200), d: hex(0xc89d1f), m: hex(0xf2cf3a), l: hex(0xfffaa0) },
  diamond: { o: hex(0x0e3f42), d: hex(0x1aa0a8), m: hex(0x33ebcb), l: hex(0xb4fdf0) },
};

const STICK_DARK = hex(0x49331b);
const STICK_LIGHT = hex(0x896727);
const STICK_OUTLINE = hex(0x28190a);

type Mask = boolean[];

function emptyMask(): Mask {
  return new Array<boolean>(TEX * TEX).fill(false);
}

function inMask(m: Mask, x: number, y: number) {
  return x >= 0 && y >= 0 && x < TEX && y < TEX && m[y * TEX + x];
}

/** Paints a mask with top-left lighting and a dark outline around it. */
function paintShape(t: Tex, mask: Mask, mat: Material, outline = true) {
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      if (!mask[y * TEX + x]) continue;
      const litEdge = !inMask(mask, x - 1, y) || !inMask(mask, x, y - 1);
      const shadowEdge = !inMask(mask, x + 1, y) || !inMask(mask, x, y + 1);
      t.set(x, y, litEdge && !shadowEdge ? mat.l : shadowEdge && !litEdge ? mat.d : mat.m);
    }
  if (!outline) return;
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      if (mask[y * TEX + x] || t.alpha(x, y) > 0) continue;
      if (inMask(mask, x + 1, y) || inMask(mask, x - 1, y) || inMask(mask, x, y + 1) || inMask(mask, x, y - 1))
        t.set(x, y, mat.o);
    }
}

/** Diagonal stick from bottom-left towards the top-right, ending at (x1, y1). */
function handle(t: Tex, x1: number, y1: number, from = 1) {
  const mask = emptyMask();
  for (let i = from; ; i++) {
    const x = i;
    const y = 15 - i;
    if (x > x1 || y < y1) break;
    mask[y * TEX + x] = true;
  }
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      if (!mask[y * TEX + x]) continue;
      t.set(x, y, STICK_LIGHT);
      if (t.alpha(x + 1, y) === 0 && x + 1 < TEX) t.set(x + 1, y, STICK_DARK);
    }
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < TEX && y < TEX && t.alpha(x, y) > 0;
  const outline: [number, number][] = [];
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x, y - 1) || filled(x + 1, y) || filled(x, y + 1)) outline.push([x, y]);
    }
  for (const [x, y] of outline) t.set(x, y, STICK_OUTLINE);
}

function maskWhere(test: (x: number, y: number) => boolean): Mask {
  const m = emptyMask();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) m[y * TEX + x] = test(x + 0.5, y + 0.5);
  return m;
}

function pickaxe(mat: Material) {
  const t = new Tex();
  handle(t, 10, 5);
  const head = maskWhere((x, y) => {
    const d = Math.hypot(x - 3, y - 13);
    return d > 9.3 && d < 11.6 && x > 1.2 && y < 14.8;
  });
  paintShape(t, head, mat);
  return t;
}

function axe(mat: Material) {
  const t = new Tex();
  handle(t, 11, 4);
  const poly: [number, number][] = [
    [5, 3.5], [8.5, 0.6], [11.2, 2], [12.4, 4.6], [10, 6.4], [8.2, 7.4],
  ];
  const head = maskWhere((x, y) => pointInPoly(x, y, poly));
  paintShape(t, head, mat);
  return t;
}

function shovel(mat: Material) {
  const t = new Tex();
  handle(t, 9, 6);
  const head = maskWhere((x, y) => {
    const dx = x - 11.2;
    const dy = y - 4.8;
    const along = (dx - dy) / Math.SQRT2;
    const across = (dx + dy) / Math.SQRT2;
    return (along / 3.4) ** 2 + (across / 2.4) ** 2 < 1;
  });
  paintShape(t, head, mat);
  return t;
}

function sword(mat: Material) {
  const t = new Tex();
  handle(t, 3, 12, 1);
  const blade = maskWhere((x, y) => {
    const along = (x - y) / Math.SQRT2;
    const across = Math.abs(x + y - 16) / Math.SQRT2;
    return across < 1.15 && along > -6.5 && along < 9.8;
  });
  const guard = maskWhere((x, y) => {
    const along = (x - y) / Math.SQRT2;
    const across = (x + y - 16) / Math.SQRT2;
    return Math.abs(along + 6.6) < 0.8 && Math.abs(across) < 3.2;
  });
  for (let i = 0; i < blade.length; i++) if (guard[i]) blade[i] = false;
  paintShape(t, blade, mat);
  const guardColors: Material = { o: STICK_OUTLINE, d: hex(0x3b2a12), m: hex(0x5b4524), l: hex(0x7a5d30) };
  paintShape(t, guard, mat === TOOL_MATERIALS.wooden ? guardColors : { ...guardColors, m: mat.d, l: mat.m });
  return t;
}

function hoe(mat: Material) {
  const t = new Tex();
  handle(t, 11, 4);
  const head = maskWhere((x, y) => (y > 1.6 && y < 3.6 && x > 5.5 && x < 12.5) || (x > 10.5 && x < 12.5 && y > 1.6 && y < 5.4));
  paintShape(t, head, mat);
  return t;
}

function pointInPoly(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shaded ellipse "lump" used for food and minerals. */
function blob(
  t: Tex,
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colors: { o: RGB; d: RGB; m: RGB; l: RGB },
  angle = 0,
  jitter = 0.18
) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const mask = maskWhere((x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * ca + dy * sa) / rx;
    const v = (-dx * sa + dy * ca) / ry;
    return u * u + v * v < 1 + (rng() - 0.5) * jitter;
  });
  paintShape(t, mask, colors);
  return mask;
}

function sprinkle(t: Tex, rng: Rng, mask: Mask, color: RGB, chance: number) {
  for (let i = 0; i < mask.length; i++) if (mask[i] && rng() < chance) t.set(i % TEX, Math.floor(i / TEX), color);
}

function stick() {
  const t = new Tex();
  handle(t, 12, 3, 3);
  return t;
}

function coal(rng: Rng, brownish: boolean) {
  const t = new Tex();
  const c = brownish
    ? { o: hex(0x1a120b), d: hex(0x2c2119), m: hex(0x3e3026), l: hex(0x5a4838) }
    : { o: hex(0x101010), d: hex(0x1e1e1e), m: hex(0x2e2e2e), l: hex(0x4c4c4c) };
  const m = blob(t, rng, 8, 8.5, 5.2, 4.4, c, -0.5, 0.35);
  sprinkle(t, rng, m, c.l, 0.08);
  return t;
}

function ingot(colors: Material) {
  const t = new Tex();
  t.sprite(
    [
      '................',
      '................',
      '................',
      '................',
      '.......oooooo...',
      '.....oollllllo..',
      '...oollllllllmo.',
      '.oollllllllmmmo.',
      'olllllllllmmmo..',
      'ommmmmmmmmdddo..',
      'oddddddddddoo...',
      '.ooooooooooo....',
    ],
    { o: colors.o, l: colors.l, m: colors.m, d: colors.d },
    1,
    2
  );
  return t;
}

function diamond() {
  const t = new Tex();
  t.sprite(
    [
      '................',
      '................',
      '.....oooooo.....',
      '....owwllllo....',
      '...owllllmmmo...',
      '..oooooooooooo..',
      '..owlllllmmmdo..',
      '...owllllmmdo...',
      '....olllmmdo....',
      '.....ollmdo.....',
      '......olmo......',
      '.......oo.......',
    ],
    { o: hex(0x0e3f42), w: hex(0xd8fffa), l: hex(0x4aedd9), m: hex(0x2bc7c0), d: hex(0x1a8f92) },
    0,
    2
  );
  return t;
}

function apple(rng: Rng) {
  const t = new Tex();
  blob(t, rng, 8, 9.5, 5.3, 5, { o: hex(0x4a0a08), d: hex(0x9e1410), m: hex(0xd2201a), l: hex(0xff6a5a) }, 0, 0.05);
  t.set(8, 3, hex(0x5a3a1a));
  t.set(8, 4, hex(0x5a3a1a));
  t.set(9, 3, hex(0x3d8f1f));
  t.set(10, 2, hex(0x3d8f1f));
  t.set(10, 3, hex(0x56b02c));
  t.set(5, 8, hex(0xffffff));
  return t;
}

function meat(rng: Rng, meatC: Material, fat: RGB) {
  const t = new Tex();
  const m = blob(t, rng, 8, 8.5, 6, 4.2, meatC, -0.45, 0.12);
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const x = i % TEX;
    const y = Math.floor(i / TEX);
    const edge = !inMask(m, x + 1, y + 1) || !inMask(m, x + 1, y);
    if (edge) t.set(x, y, fat);
  }
  sprinkle(t, rng, m, meatC.l, 0.07);
  return t;
}

function bread(rng: Rng) {
  const t = new Tex();
  const m = blob(t, rng, 8, 9, 6.6, 3.4, { o: hex(0x3d2307), d: hex(0x8a5a1c), m: hex(0xb57a2c), l: hex(0xd6a050) }, -0.35, 0.08);
  for (let i = 0; i < 3; i++) {
    const x = 5 + i * 3;
    t.set(x, 8 - i, hex(0xe8c27a));
    t.set(x + 1, 7 - i, hex(0xe8c27a));
  }
  void m;
  return t;
}

function wheatItem(rng: Rng) {
  const t = new Tex();
  const stalk = hex(0x9a7a2a);
  const grain = [hex(0xd8b04a), hex(0xc69a2e), hex(0xeed27a)];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < 12; i++) {
      const x = 2 + s + Math.floor(i * 0.65);
      const y = 14 - i;
      t.set(x, y, i > 5 ? grain[Math.floor(rng() * 3)] : stalk);
      if (i > 5 && i % 2 === 0) t.set(x - 1, y, grain[Math.floor(rng() * 3)]);
    }
  }
  return t;
}

function seeds(rng: Rng) {
  const t = new Tex();
  const pos: [number, number][] = [[4, 9], [7, 6], [10, 9], [6, 11], [9, 12], [11, 6], [5, 5]];
  for (const [x, y] of pos) {
    t.set(x, y, hex(0x3f7f1f));
    t.set(x + 1, y, hex(0x6aa834));
    t.set(x, y + 1, hex(0x2f5f17));
    if (rng() < 0.5) t.set(x + 1, y + 1, hex(0x4f8f27));
  }
  return t;
}

function flint(rng: Rng) {
  const t = new Tex();
  blob(t, rng, 8, 8, 4, 5.6, { o: hex(0x111111), d: hex(0x2a2a2a), m: hex(0x404040), l: hex(0x6a6a6a) }, 0.5, 0.3);
  return t;
}

function gunpowder(rng: Rng) {
  const t = new Tex();
  const m = blob(t, rng, 8, 10, 6, 3.4, { o: hex(0x262626), d: hex(0x4a4a4a), m: hex(0x666666), l: hex(0x8a8a8a) }, 0, 0.6);
  sprinkle(t, rng, m, hex(0x2c2c2c), 0.25);
  sprinkle(t, rng, m, hex(0xa0a0a0), 0.1);
  return t;
}

function leather(rng: Rng) {
  const t = new Tex();
  t.sprite(
    [
      '................',
      '...oo......oo...',
      '..ollo....ollo..',
      '..ollloooolllo..',
      '...olllllllmo...',
      '...ollllllmmo...',
      '..olllllllmmmo..',
      '..ollllllmmmmo..',
      '..olllllmmmmmo..',
      '...ollllmmmmo...',
      '...olllmmmmmo...',
      '..ollmmmmmmmdo..',
      '..olo.oooo.odo..',
      '...o........o...',
    ],
    { o: hex(0x3b1d0c), l: hex(0xa0522a), m: hex(0x8a4420), d: hex(0x6a3214) },
    0,
    1
  );
  void rng;
  return t;
}

function bucket(withWater: boolean) {
  const t = new Tex();
  t.sprite(
    [
      '................',
      '................',
      '................',
      '...oooooooooo...',
      '..owwwwwwwwwwo..',
      '..omllllllllmo..',
      '..oommmmmmmmoo..',
      '...olmmmmmmdo...',
      '...olmmmmmmdo...',
      '...olmmmmmmdo...',
      '....olmmmmdo....',
      '....olmmmmdo....',
      '.....oooooo.....',
    ],
    {
      o: hex(0x2f2f2f),
      w: withWater ? hex(0x4f86f0) : hex(0x5a5a5a),
      l: withWater ? hex(0x3366d6) : hex(0xffffff),
      m: hex(0xc6c6c6),
      d: hex(0x8a8a8a),
    },
    0,
    1
  );
  return t;
}

function rottenFlesh(rng: Rng) {
  const t = new Tex();
  const m = blob(t, rng, 8, 8.5, 5.8, 4.6, { o: hex(0x2a1a0a), d: hex(0x6b4a1f), m: hex(0x8a6a2a), l: hex(0xa88a3a) }, 0.6, 0.4);
  sprinkle(t, rng, m, hex(0x5a7a2a), 0.25);
  sprinkle(t, rng, m, hex(0xc04a3a), 0.08);
  return t;
}

const RAW_PORK: Material = { o: hex(0x5a1a1a), d: hex(0xc85a6a), m: hex(0xf0909a), l: hex(0xffb8c0) };
const COOKED: Material = { o: hex(0x2a1608), d: hex(0x6a3a1a), m: hex(0x9a5a2a), l: hex(0xc08040) };
const RAW_BEEF: Material = { o: hex(0x3a0808), d: hex(0x9a1a1a), m: hex(0xc82a2a), l: hex(0xe85a5a) };
const RAW_MUTTON: Material = { o: hex(0x3a0808), d: hex(0xa83a3a), m: hex(0xd25a5a), l: hex(0xf08a8a) };

export const ITEM_TEXTURES: Record<string, Gen> = {
  stick,
  coal: (r) => coal(r, false),
  charcoal: (r) => coal(r, true),
  iron_ingot: () => ingot({ o: hex(0x353535), d: hex(0x8a8a8a), m: hex(0xc6c6c6), l: hex(0xf2f2f2) }),
  gold_ingot: () => ingot({ o: hex(0x5a4200), d: hex(0xb8860b), m: hex(0xf2cf3a), l: hex(0xfffaa0) }),
  diamond,
  apple,
  porkchop: (r) => meat(r, RAW_PORK, hex(0xfff0f0)),
  cooked_porkchop: (r) => meat(r, COOKED, hex(0xe0b080)),
  beef: (r) => meat(r, RAW_BEEF, hex(0xf8e8e8)),
  cooked_beef: (r) => meat(r, { ...COOKED, m: hex(0x7a4520) }, hex(0xb07040)),
  mutton: (r) => meat(r, RAW_MUTTON, hex(0xfff8f0)),
  cooked_mutton: (r) => meat(r, { ...COOKED, m: hex(0x8a5025) }, hex(0xd0a070)),
  rotten_flesh: rottenFlesh,
  bread,
  wheat: wheatItem,
  wheat_seeds: seeds,
  flint,
  gunpowder,
  leather,
  bucket: () => bucket(false),
  water_bucket: () => bucket(true),
  ...Object.fromEntries(
    Object.entries(TOOL_MATERIALS).flatMap(([name, mat]) => [
      [`${name}_pickaxe`, () => pickaxe(mat)],
      [`${name}_axe`, () => axe(mat)],
      [`${name}_shovel`, () => shovel(mat)],
      [`${name}_sword`, () => sword(mat)],
      [`${name}_hoe`, () => hoe(mat)],
    ])
  ),
};

/** Textures for mobs, the player, sky and particles. */
function skin(rng: Rng, base: RGB, spread = 0.12) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) t.set(x, y, scale(base, 1 - spread / 2 + rng() * spread));
  return t;
}

function eyes(t: Tex, y: number, white: RGB, pupil: RGB, left = 3, right = 10) {
  t.set(left, y, white);
  t.set(left + 1, y, pupil);
  t.set(left + 2, y, pupil);
  t.set(right, y, pupil);
  t.set(right + 1, y, pupil);
  t.set(right + 2, y, white);
  t.set(left, y + 1, white);
  t.set(left + 1, y + 1, pupil);
  t.set(left + 2, y + 1, pupil);
  t.set(right, y + 1, pupil);
  t.set(right + 1, y + 1, pupil);
  t.set(right + 2, y + 1, white);
}

function creeperSkin(rng: Rng) {
  const t = new Tex();
  const c = [hex(0x0da82e), hex(0x4fc046), hex(0x2e8a2a), hex(0x7ad468), hex(0xa8e0a0), hex(0x1a6a1a)];
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) t.set(x, y, c[Math.floor(rng() * c.length)]);
  return t;
}

function creeperFace(rng: Rng) {
  const t = creeperSkin(rng);
  const black = hex(0x0a0a0a);
  const dark = hex(0x1a2a1a);
  for (let y = 4; y < 8; y++)
    for (let x = 2; x < 6; x++) {
      t.set(x, y, black);
      t.set(x + 8, y, black);
    }
  for (let y = 8; y < 12; y++) for (let x = 6; x < 10; x++) t.set(x, y, black);
  for (let y = 10; y < 15; y++) {
    t.set(4, y, dark);
    t.set(5, y, black);
    t.set(10, y, black);
    t.set(11, y, dark);
  }
  return t;
}

function steveFace(rng: Rng, zombie: boolean) {
  const skinC = zombie ? hex(0x5a8a3e) : hex(0xb4846c);
  const t = skin(rng, skinC, 0.1);
  const hair = zombie ? hex(0x3f6a2a) : hex(0x2f1f0f);
  for (let y = 0; y < 4; y++) for (let x = 0; x < TEX; x++) t.set(x, y, scale(hair, 0.9 + rng() * 0.2));
  t.set(0, 4, hair);
  t.set(15, 4, hair);
  t.set(0, 5, hair);
  t.set(15, 5, hair);
  if (zombie) {
    for (let x = 3; x < 6; x++) {
      t.set(x, 8, hex(0x0f1f0a));
      t.set(x, 9, hex(0x0f1f0a));
    }
    for (let x = 10; x < 13; x++) {
      t.set(x, 8, hex(0x0f1f0a));
      t.set(x, 9, hex(0x0f1f0a));
    }
    for (let x = 6; x < 10; x++) t.set(x, 12, hex(0x2f4a1f));
  } else {
    eyes(t, 8, hex(0xffffff), hex(0x523d89), 2, 11);
    for (let x = 6; x < 10; x++) t.set(x, 12, hex(0x6a4030));
    for (let x = 4; x < 12; x++) t.set(x, 13, hex(0x8a5a40));
    t.set(7, 10, hex(0x9a6a50));
    t.set(8, 10, hex(0x9a6a50));
  }
  return t;
}

function pigFace(rng: Rng) {
  const t = skin(rng, hex(0xf0a0a0), 0.08);
  eyes(t, 6, hex(0xffffff), hex(0x101010), 1, 12);
  return t;
}

function snout(rng: Rng) {
  const t = skin(rng, hex(0xe88a96), 0.06);
  for (let y = 5; y < 11; y++) {
    t.set(4, y, hex(0x9a4a5a));
    t.set(5, y, hex(0x9a4a5a));
    t.set(10, y, hex(0x9a4a5a));
    t.set(11, y, hex(0x9a4a5a));
  }
  return t;
}

function cowHide(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const patch = Math.sin(x * 0.7 + rng() * 0.6) * Math.cos(y * 0.6 + 1.3) > 0.35;
      t.set(x, y, patch ? scale(hex(0xe8e8e8), 0.92 + rng() * 0.1) : scale(hex(0x45301e), 0.9 + rng() * 0.2));
    }
  return t;
}

function cowFace(rng: Rng) {
  const t = skin(rng, hex(0x45301e), 0.15);
  for (let y = 0; y < 8; y++) for (let x = 5; x < 11; x++) t.set(x, y, scale(hex(0xe8e8e8), 0.95 + rng() * 0.08));
  eyes(t, 6, hex(0xffffff), hex(0x101010), 1, 12);
  for (let y = 11; y < 16; y++) for (let x = 3; x < 13; x++) t.set(x, y, scale(hex(0xb8a898), 0.95 + rng() * 0.1));
  t.set(5, 13, hex(0x2a2a2a));
  t.set(10, 13, hex(0x2a2a2a));
  return t;
}

function sheepFace(rng: Rng) {
  const t = skin(rng, hex(0xd8c0a8), 0.08);
  for (let y = 0; y < 3; y++) for (let x = 0; x < TEX; x++) t.set(x, y, scale(hex(0xeaeded), 0.95 + rng() * 0.08));
  eyes(t, 6, hex(0xffffff), hex(0x101010), 2, 11);
  for (let x = 6; x < 10; x++) t.set(x, 11, hex(0xc8a0a0));
  return t;
}

function shirt(rng: Rng, color: RGB) {
  const t = skin(rng, color, 0.1);
  for (let x = 5; x < 11; x++) t.set(x, 0, scale(color, 0.8));
  return t;
}

function sun() {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d < 4) t.set(x, y, hex(0xfffff0));
      else if (d < 5) t.set(x, y, hex(0xfff3a0));
      else if (d < 6) t.set(x, y, hex(0xffd860), 160);
      else if (d < 7) t.set(x, y, hex(0xffb030), 70);
    }
  return t;
}

function moon(rng: Rng) {
  const t = new Tex();
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 12; x++) t.set(x, y, rng() < 0.2 ? hex(0x9a9aa8) : hex(0xd8d8e0));
  t.set(6, 6, hex(0x8a8a98));
  t.set(7, 6, hex(0x8a8a98));
  t.set(9, 9, hex(0x8a8a98));
  t.set(5, 9, hex(0xa0a0ac));
  return t;
}

function smoke(rng: Rng) {
  const t = new Tex();
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 7 && rng() < 0.9) t.set(x, y, scale(hex(0xd0d0d0), 0.8 + rng() * 0.25));
    }
  return t;
}

export const ENTITY_TEXTURES: Record<string, Gen> = {
  steve_face: (r) => steveFace(r, false),
  steve_head: (r) => skin(r, hex(0x2f1f0f), 0.2),
  steve_skin: (r) => skin(r, hex(0xb4846c), 0.08),
  steve_shirt: (r) => shirt(r, hex(0x00a8a8)),
  steve_pants: (r) => skin(r, hex(0x3b3a99), 0.12),
  zombie_face: (r) => steveFace(r, true),
  zombie_head: (r) => skin(r, hex(0x3f6a2a), 0.2),
  zombie_skin: (r) => skin(r, hex(0x5a8a3e), 0.12),
  zombie_shirt: (r) => shirt(r, hex(0x2a9a9a)),
  zombie_pants: (r) => skin(r, hex(0x46407a), 0.12),
  creeper_skin: creeperSkin,
  creeper_face: creeperFace,
  pig_skin: (r) => skin(r, hex(0xf0a0a0), 0.1),
  pig_face: pigFace,
  pig_snout: snout,
  cow_hide: cowHide,
  cow_face: cowFace,
  cow_horn: (r) => skin(r, hex(0xd8d0c0), 0.08),
  sheep_face: sheepFace,
  sheep_skin: (r) => skin(r, hex(0xd8c0a8), 0.08),
  sun,
  moon,
  smoke,
};
