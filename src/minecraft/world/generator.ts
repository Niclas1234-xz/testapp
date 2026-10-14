import { B } from '../blocks';
import { blockIndex, CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { Perlin } from '../noise';
import { hash4, mulberry32, randInt, type Rng } from '../rng';
import type { Chunk } from './chunk';
import { buildTree, type TreeKind } from './trees';

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  BIRCH_FOREST: 4,
  DESERT: 5,
  SNOWY_TAIGA: 6,
  MOUNTAINS: 7,
  FROZEN_OCEAN: 8,
  SNOWY_BEACH: 9,
} as const;

export const BIOME_NAMES = [
  'Ozean',
  'Strand',
  'Ebene',
  'Wald',
  'Birkenwald',
  'Wüste',
  'Verschneite Taiga',
  'Berge',
  'Vereister Ozean',
  'Verschneiter Strand',
];

export interface Column {
  height: number;
  biome: number;
  temperature: number;
  humidity: number;
  /** Cave entrances may break through the surface here (no trees). */
  entrance: boolean;
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Deterministic terrain generator. Everything is a pure function of the seed and position. */
export class TerrainGenerator {
  private continental: Perlin;
  private mountain: Perlin;
  private hills: Perlin;
  private detail: Perlin;
  private ridge: Perlin;
  private temperature: Perlin;
  private humidity: Perlin;
  private caveA: Perlin;
  private caveB: Perlin;
  private caveC: Perlin;
  private entrance: Perlin;

  constructor(readonly seed: number) {
    const s = (n: number) => hash4(seed, n, 0x5eed);
    this.continental = new Perlin(s(1));
    this.mountain = new Perlin(s(2));
    this.hills = new Perlin(s(3));
    this.detail = new Perlin(s(4));
    this.ridge = new Perlin(s(5));
    this.temperature = new Perlin(s(6));
    this.humidity = new Perlin(s(7));
    this.caveA = new Perlin(s(8));
    this.caveB = new Perlin(s(9));
    this.caveC = new Perlin(s(10));
    this.entrance = new Perlin(s(11));
  }

  column(x: number, z: number): Column {
    const cont = this.continental.fbm2(x / 700, z / 700, 4) * 1.6;
    const mount = this.mountain.fbm2(x / 320, z / 320, 3) * 1.6;
    const hill = this.hills.fbm2(x / 110, z / 110, 4) * 1.5;
    const detail = this.detail.fbm2(x / 28, z / 28, 2);
    const temperature = this.temperature.fbm2(x / 800, z / 800, 3) * 1.7;
    const humidity = this.humidity.fbm2(x / 640, z / 640, 3) * 1.7;

    let base: number;
    if (cont < -0.3) base = 38 + (cont + 1) * 22;
    else if (cont < -0.08) base = 53.4 + ((cont + 0.3) / 0.22) * 10.6;
    else base = 64 + (cont + 0.08) * 16;
    const land = smoothstep(-0.12, 0.12, cont);
    const mountainness = smoothstep(0.15, 0.55, mount) * land;
    const amp = 3 + land * (5 + mountainness * 22);
    let h = base + hill * amp + detail * 2.2;
    const r = 1 - Math.abs(this.ridge.noise2(x / 140, z / 140) * 1.4);
    h += mountainness * Math.max(0, r) ** 2 * 42;
    const height = Math.max(4, Math.min(WORLD_HEIGHT - 8, Math.floor(h)));

    const cold = temperature - Math.max(0, height - 80) / 40;
    let biome: number;
    if (height < SEA_LEVEL - 1) biome = cold < -0.35 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    else if (height <= SEA_LEVEL + 1 && cont < -0.04) biome = cold < -0.35 ? BIOME.SNOWY_BEACH : BIOME.BEACH;
    else if (mountainness > 0.45 && height > 84) biome = BIOME.MOUNTAINS;
    else if (temperature > 0.32 && humidity < 0.1) biome = BIOME.DESERT;
    else if (cold < -0.3) biome = BIOME.SNOWY_TAIGA;
    else if (humidity > 0.18) biome = temperature < 0.02 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    else biome = BIOME.PLAINS;

    const entrance = this.entrance.noise2(x / 45, z / 45) > 0.32;
    return { height, biome, temperature, humidity, entrance };
  }

  /** Fills a chunk column with terrain, caves, ores and decorations. */
  generate(chunk: Chunk) {
    const { cx, cz } = chunk;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const blocks = chunk.blocks;
    const cols: Column[] = new Array(256);
    const rng = mulberry32(hash4(this.seed, cx, cz, 1));

    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const col = this.column(x0 + x, z0 + z);
        cols[z * 16 + x] = col;
        chunk.biomes[z * 16 + x] = col.biome;
        writeTints(chunk, x, z, col);
        this.fillColumn(blocks, x, z, col, rng);
      }
    }

    this.carveCaves(chunk, cols);
    this.placeOres(chunk, rng);
    this.decorate(chunk, cols);

    let top = 0;
    for (let y = WORLD_HEIGHT - 1; y >= 0 && top === 0; y--) {
      for (let i = 0; i < 256; i++) {
        if (blocks[(y << 8) | i] !== B.AIR) {
          top = y + 1;
          break;
        }
      }
    }
    chunk.top = top;
  }

  private fillColumn(blocks: Uint8Array, x: number, z: number, col: Column, rng: Rng) {
    const { height, biome } = col;
    let top: number = B.GRASS;
    let filler: number = B.DIRT;
    let fillerDepth = 3 + (rng() < 0.5 ? 1 : 0);
    let deep: number = B.STONE;
    switch (biome) {
      case BIOME.DESERT:
        top = B.SAND;
        filler = B.SAND;
        deep = B.SANDSTONE;
        fillerDepth = 4;
        break;
      case BIOME.BEACH:
      case BIOME.SNOWY_BEACH:
        top = B.SAND;
        filler = B.SAND;
        deep = B.SANDSTONE;
        break;
      case BIOME.OCEAN:
      case BIOME.FROZEN_OCEAN:
        top = height >= SEA_LEVEL - 7 ? B.SAND : rng() < 0.6 ? B.GRAVEL : B.DIRT;
        filler = top === B.SAND ? B.SAND : B.DIRT;
        break;
      case BIOME.MOUNTAINS:
        if (height > 92) {
          top = B.STONE;
          filler = B.STONE;
        }
        break;
    }
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const i = blockIndex(x, y, z);
      if (y === 0 || (y < 4 && rng() < 0.75 - y * 0.22)) blocks[i] = B.BEDROCK;
      else if (y < height - fillerDepth) blocks[i] = B.STONE;
      else if (y < height) blocks[i] = deep === B.SANDSTONE && y < height - 2 ? B.SANDSTONE : filler;
      else if (y === height) blocks[i] = top;
      else if (y <= SEA_LEVEL) blocks[i] = B.WATER;
      else break;
    }
    if (height < SEA_LEVEL && (biome === BIOME.FROZEN_OCEAN || col.temperature < -0.45))
      blocks[blockIndex(x, SEA_LEVEL, z)] = B.ICE;
    const snowy = biome === BIOME.SNOWY_TAIGA || biome === BIOME.SNOWY_BEACH || (biome === BIOME.MOUNTAINS && height > 98);
    if (snowy && height >= SEA_LEVEL && height + 1 < WORLD_HEIGHT) blocks[blockIndex(x, height + 1, z)] = B.SNOW;
  }

  /** Noise caves: "spaghetti" tunnels (intersection of two noise surfaces) plus caverns, sampled on a coarse grid. */
  private carveCaves(chunk: Chunk, cols: Column[]) {
    const gx = 5;
    const gy = WORLD_HEIGHT / 4 + 1;
    const grid = new Float32Array(gx * gx * gy);
    const x0 = chunk.cx * 16;
    const z0 = chunk.cz * 16;
    for (let iz = 0; iz < gx; iz++)
      for (let ix = 0; ix < gx; ix++)
        for (let iy = 0; iy < gy; iy++) {
          const wx = x0 + ix * 4;
          const wy = iy * 4;
          const wz = z0 + iz * 4;
          const a = this.caveA.noise3(wx / 40, wy / 26, wz / 40);
          const b = this.caveB.noise3(wx / 40, wy / 26, wz / 40);
          // 1 = solid; carve where value < 0.
          let v = Math.max(Math.abs(a), Math.abs(b)) - 0.075;
          if (wy < 52) {
            const c = this.caveC.noise3(wx / 70, wy / 32, wz / 70);
            v = Math.min(v, 0.62 - c - (52 - wy) / 400);
          }
          grid[(iz * gx + ix) * gy + iy] = v;
        }
    const blocks = chunk.blocks;
    for (let z = 0; z < 16; z++) {
      const iz = z >> 2;
      const fz = (z & 3) / 4;
      for (let x = 0; x < 16; x++) {
        const ix = x >> 2;
        const fx = (x & 3) / 4;
        const col = cols[z * 16 + x];
        const underwater = col.height < SEA_LEVEL;
        const maxY = underwater ? col.height - 5 : col.entrance ? col.height : col.height - 4;
        for (let y = 5; y <= maxY; y++) {
          const iy = y >> 2;
          const fy = (y & 3) / 4;
          const g = (ix2: number, iy2: number, iz2: number) => grid[(iz2 * gx + ix2) * gy + iy2];
          const c00 = g(ix, iy, iz) + (g(ix + 1, iy, iz) - g(ix, iy, iz)) * fx;
          const c10 = g(ix, iy + 1, iz) + (g(ix + 1, iy + 1, iz) - g(ix, iy + 1, iz)) * fx;
          const c01 = g(ix, iy, iz + 1) + (g(ix + 1, iy, iz + 1) - g(ix, iy, iz + 1)) * fx;
          const c11 = g(ix, iy + 1, iz + 1) + (g(ix + 1, iy + 1, iz + 1) - g(ix, iy + 1, iz + 1)) * fx;
          const c0 = c00 + (c10 - c00) * fy;
          const c1 = c01 + (c11 - c01) * fy;
          const v = c0 + (c1 - c0) * fz;
          if (v >= 0) continue;
          const i = blockIndex(x, y, z);
          const id = blocks[i];
          if (id === B.BEDROCK || id === B.WATER || id === B.ICE) continue;
          blocks[i] = B.AIR;
        }
        // No floating snow over cave entrances.
        const below = blockIndex(x, col.height, z);
        if (blocks[below] === B.AIR && blocks[blockIndex(x, col.height + 1, z)] === B.SNOW)
          blocks[blockIndex(x, col.height + 1, z)] = B.AIR;
      }
    }
  }

  private placeOres(chunk: Chunk, rng: Rng) {
    const veins: [number, number, number, number, number][] = [
      // block, attempts, size, minY, maxY
      [B.COAL_ORE, 20, 16, 5, 110],
      [B.IRON_ORE, 18, 8, 5, 64],
      [B.GOLD_ORE, 2, 8, 5, 32],
      [B.DIAMOND_ORE, 1, 7, 5, 16],
      [B.GRAVEL, 6, 24, 5, 100],
      [B.DIRT, 8, 24, 5, 100],
    ];
    for (const [id, attempts, size, minY, maxY] of veins) {
      for (let a = 0; a < attempts; a++) {
        const sx = rng() * 16;
        const sy = minY + rng() * (maxY - minY);
        const sz = rng() * 16;
        const angle = rng() * Math.PI;
        const len = size / 8;
        const ax = sx + Math.sin(angle) * len;
        const bx = sx - Math.sin(angle) * len;
        const az = sz + Math.cos(angle) * len;
        const bz = sz - Math.cos(angle) * len;
        const ay = sy + rng() * 3 - 2;
        const by = sy + rng() * 3 - 2;
        for (let i = 0; i < size; i++) {
          const t = i / size;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const pz = az + (bz - az) * t;
          const r = ((Math.sin(t * Math.PI) + 1) * rng() * size) / 32 + 0.5;
          for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++)
            for (let y = Math.floor(py - r); y <= Math.floor(py + r); y++)
              for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z++) {
                if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= WORLD_HEIGHT) continue;
                const dx = (x + 0.5 - px) / r;
                const dy = (y + 0.5 - py) / r;
                const dz = (z + 0.5 - pz) / r;
                if (dx * dx + dy * dy + dz * dz >= 1) continue;
                const k = blockIndex(x, y, z);
                if (chunk.blocks[k] === B.STONE) chunk.blocks[k] = id;
              }
        }
      }
    }
  }

  /** Trees can overhang chunk borders, so trees from neighbour chunks are evaluated too. */
  private decorate(chunk: Chunk, cols: Column[]) {
    const { cx, cz } = chunk;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        for (const tree of this.treesIn(cx + dx, cz + dz)) this.placeTree(chunk, tree);
      }
    this.placePlants(chunk, cols);
  }

  private treesIn(cx: number, cz: number) {
    const rng = mulberry32(hash4(this.seed, cx, cz, 2));
    const center = this.column(cx * 16 + 8, cz * 16 + 8);
    let attempts = 0;
    switch (center.biome) {
      case BIOME.FOREST:
        attempts = 9;
        break;
      case BIOME.BIRCH_FOREST:
        attempts = 8;
        break;
      case BIOME.SNOWY_TAIGA:
        attempts = 6;
        break;
      case BIOME.MOUNTAINS:
        attempts = 1;
        break;
      case BIOME.PLAINS:
        attempts = rng() < 0.3 ? 1 : 0;
        break;
    }
    const trees: { x: number; y: number; z: number; kind: TreeKind; seed: number }[] = [];
    for (let i = 0; i < attempts; i++) {
      const x = cx * 16 + Math.floor(rng() * 16);
      const z = cz * 16 + Math.floor(rng() * 16);
      const seed = Math.floor(rng() * 1e9);
      const col = this.column(x, z);
      if (col.entrance || col.height < SEA_LEVEL || col.height > WORLD_HEIGHT - 16) continue;
      if (col.biome === BIOME.DESERT || col.biome === BIOME.BEACH || col.biome === BIOME.SNOWY_BEACH) continue;
      if (col.biome === BIOME.OCEAN || col.biome === BIOME.FROZEN_OCEAN) continue;
      if (col.biome === BIOME.MOUNTAINS && col.height > 92) continue;
      let kind: TreeKind = 'oak';
      if (col.biome === BIOME.SNOWY_TAIGA || col.biome === BIOME.MOUNTAINS) kind = 'spruce';
      else if (col.biome === BIOME.BIRCH_FOREST) kind = (seed & 7) === 0 ? 'oak' : 'birch';
      else if (col.biome === BIOME.FOREST && seed % 5 === 0) kind = 'birch';
      trees.push({ x, y: col.height + 1, z, kind, seed });
    }
    return trees;
  }

  private placeTree(chunk: Chunk, t: { x: number; y: number; z: number; kind: TreeKind; seed: number }) {
    const ox = chunk.cx * 16;
    const oz = chunk.cz * 16;
    buildTree(t.kind, t.x, t.y, t.z, mulberry32(t.seed), (wx, wy, wz, id, force) => {
      const x = wx - ox;
      const z = wz - oz;
      if (x < 0 || x > 15 || z < 0 || z > 15 || wy < 1 || wy >= WORLD_HEIGHT) return;
      const i = blockIndex(x, wy, z);
      const cur = chunk.blocks[i];
      if (force || cur === B.AIR || cur === B.SNOW || cur === B.TALL_GRASS) chunk.blocks[i] = id;
    });
  }

  private placePlants(chunk: Chunk, cols: Column[]) {
    const rng = mulberry32(hash4(this.seed, chunk.cx, chunk.cz, 3));
    const blocks = chunk.blocks;
    const center = cols[8 * 16 + 8].biome;
    let grass = 0;
    let flowers = 0;
    let cacti = 0;
    let bushes = 0;
    switch (center) {
      case BIOME.PLAINS:
        grass = 48;
        flowers = 5;
        break;
      case BIOME.FOREST:
      case BIOME.BIRCH_FOREST:
        grass = 18;
        flowers = 3;
        break;
      case BIOME.SNOWY_TAIGA:
        grass = 4;
        break;
      case BIOME.MOUNTAINS:
        grass = 8;
        flowers = 1;
        break;
      case BIOME.DESERT:
        cacti = 3;
        bushes = 2;
        break;
    }
    const surface = (x: number, z: number) => {
      for (let y = WORLD_HEIGHT - 2; y > 0; y--) {
        const id = blocks[blockIndex(x, y, z)];
        if (id !== B.AIR && id !== B.SNOW) return y;
      }
      return -1;
    };
    const tryPlace = (id: number, on: number[]) => {
      const x = Math.floor(rng() * 16);
      const z = Math.floor(rng() * 16);
      const y = surface(x, z);
      if (y < 1 || y + 3 >= WORLD_HEIGHT) return;
      if (!on.includes(blocks[blockIndex(x, y, z)])) return;
      if (blocks[blockIndex(x, y + 1, z)] !== B.AIR) return;
      blocks[blockIndex(x, y + 1, z)] = id;
      if (id === B.CACTUS) {
        const h = randInt(rng, 1, 3);
        for (let i = 1; i < h; i++) {
          if (blocks[blockIndex(x, y + 1 + i, z)] !== B.AIR) break;
          blocks[blockIndex(x, y + 1 + i, z)] = B.CACTUS;
        }
      }
    };
    for (let i = 0; i < grass; i++) tryPlace(B.TALL_GRASS, [B.GRASS]);
    for (let i = 0; i < flowers; i++) tryPlace(rng() < 0.6 ? B.DANDELION : B.POPPY, [B.GRASS]);
    for (let i = 0; i < cacti; i++) {
      const x = 1 + Math.floor(rng() * 14);
      const z = 1 + Math.floor(rng() * 14);
      const y = surface(x, z);
      if (y < 1) continue;
      // Cacti need free space around them.
      const free = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].every(([dx, dz]) => blocks[blockIndex(x + dx, y + 1, z + dz)] === B.AIR);
      if (free && blocks[blockIndex(x, y, z)] === B.SAND && blocks[blockIndex(x, y + 1, z)] === B.AIR) {
        const h = randInt(rng, 1, 3);
        for (let k = 1; k <= h; k++) blocks[blockIndex(x, y + k, z)] = B.CACTUS;
      }
    }
    for (let i = 0; i < bushes; i++) tryPlace(B.DEAD_BUSH, [B.SAND]);
  }

  /** Finds a dry spawn point near the origin. */
  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 4000; r += 16) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos((a / 8) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 8) * Math.PI * 2) * r);
        const col = this.column(x, z);
        if (col.height >= SEA_LEVEL + 1 && col.biome !== BIOME.MOUNTAINS && !col.entrance)
          return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
        if (r === 0) break;
      }
    }
    return { x: 0.5, y: 100, z: 0.5 };
  }
}

const GRASS_CORNERS = [
  [0x80, 0xb4, 0x97],
  [0x6a, 0xb0, 0x6a],
  [0xbf, 0xb7, 0x55],
  [0x59, 0xc9, 0x3c],
];
const FOLIAGE_CORNERS = [
  [0x60, 0xa1, 0x7b],
  [0x4a, 0x9a, 0x5a],
  [0xae, 0xa4, 0x2a],
  [0x30, 0xbb, 0x0b],
];

/** Biome colours like Minecraft's colormaps: bilinear between cold/warm and dry/wet corners. */
function writeTints(chunk: Chunk, x: number, z: number, col: Column) {
  const t = Math.min(1, Math.max(0, (col.temperature - Math.max(0, col.height - 80) / 40 + 0.55) / 1.1));
  const h = Math.min(1, Math.max(0, (col.humidity + 0.55) / 1.1));
  const i = (z * 16 + x) * 3;
  for (let c = 0; c < 3; c++) {
    const g = (GRASS_CORNERS[0][c] * (1 - h) + GRASS_CORNERS[1][c] * h) * (1 - t) + (GRASS_CORNERS[2][c] * (1 - h) + GRASS_CORNERS[3][c] * h) * t;
    const f = (FOLIAGE_CORNERS[0][c] * (1 - h) + FOLIAGE_CORNERS[1][c] * h) * (1 - t) + (FOLIAGE_CORNERS[2][c] * (1 - h) + FOLIAGE_CORNERS[3][c] * h) * t;
    chunk.grassTint[i + c] = g;
    chunk.foliageTint[i + c] = f;
  }
}
