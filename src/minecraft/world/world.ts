import {
  B,
  block,
  FACE_DIRS,
  IS_OPAQUE,
  IS_SOLID,
  isLeaves,
  isLog,
  LIGHT_EMISSION,
  LIGHT_OPACITY,
} from '../blocks';
import { blockIndex, CHUNK_SIZE, SECTION_SIZE, WORLD_HEIGHT } from '../constants';
import { blockDrops, leafDrops } from '../drops';
import type { ItemStack, Slot } from '../inventory';
import { maxStack } from '../items';
import { fuelTicks, SMELT_TIME, smeltResult } from '../recipes';
import { hash4, mulberry32, type Rng } from '../rng';
import { Chunk, chunkId, ChunkState, type BlockEntity, type FurnaceEntity } from './chunk';
import { TerrainGenerator } from './generator';
import { computeHeightmap, LightEngine } from './lighting';
import { buildTree, type TreeKind } from './trees';

export interface WorldHooks {
  dropItem(x: number, y: number, z: number, stack: ItemStack): void;
  spawnFallingBlock(x: number, y: number, z: number, id: number, meta: number): void;
  /** Block broken by the world (plants losing support, leaves decaying) – for particles. */
  blockBroken?(x: number, y: number, z: number, id: number): void;
}

export interface ChunkSave {
  /** Flattened [blockIndex, id | meta << 8] pairs. */
  m: number[];
  be?: [number, BlockEntity][];
}

/** Leaves placed by the player never decay. */
export const LEAF_PERSISTENT = 4;

const HORIZONTAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function fluidReplaceable(id: number) {
  if (id === B.AIR) return true;
  const def = block(id);
  return def.shape === 'cross' || def.shape === 'crop' || def.shape === 'torch' || id === B.SNOW;
}

/** Block storage, chunk lifecycle, lighting and all world-side block behaviour. */
export class World {
  readonly chunks = new Map<number, Chunk>();
  readonly gen: TerrainGenerator;
  readonly light: LightEngine;
  /** Total ticks since world creation; day time is time % 24000. */
  time = 0;
  /** Saved chunk changes for chunks that are not loaded. */
  readonly saved = new Map<number, ChunkSave>();
  private scheduled = new Map<string, { x: number; y: number; z: number; at: number }>();
  private furnaces = new Map<string, { x: number; y: number; z: number }>();
  readonly rng: Rng;
  /** Called when furnace contents change (to refresh an open furnace UI). */
  onFurnaceChange?: (x: number, y: number, z: number) => void;

  constructor(
    readonly seed: number,
    public hooks: WorldHooks
  ) {
    this.gen = new TerrainGenerator(seed);
    this.light = new LightEngine({
      chunks: this.chunks,
      markDirty: (x, y, z) => this.markDirty(x, y, z),
    });
    this.rng = mulberry32(hash4(seed, 42, 4242));
  }

  chunkAt(cx: number, cz: number) {
    return this.chunks.get(chunkId(cx, cz));
  }

  // ---------------------------------------------------------------- chunk lifecycle

  generateChunk(cx: number, cz: number): Chunk {
    const c = new Chunk(cx, cz);
    this.gen.generate(c);
    const save = this.saved.get(chunkId(cx, cz));
    if (save) {
      for (let i = 0; i < save.m.length; i += 2) {
        const idx = save.m[i];
        const v = save.m[i + 1];
        c.blocks[idx] = v & 255;
        c.meta[idx] = v >> 8;
        c.mods.set(idx, v);
        const y = idx >> 8;
        if (y + 1 > c.top && (v & 255) !== B.AIR) c.top = y + 1;
      }
      for (const [idx, be] of save.be ?? []) {
        c.blockEntities.set(idx, be);
        if (be.type === 'furnace') {
          const p = this.posOf(c, idx);
          this.furnaces.set(`${p.x},${p.y},${p.z}`, p);
        }
      }
    }
    computeHeightmap(c);
    this.chunks.set(chunkId(cx, cz), c);
    return c;
  }

  /** Lights a chunk once all 8 neighbours exist. Returns true if it is lit now. */
  tryLight(c: Chunk): boolean {
    if (c.state === ChunkState.Lit) return true;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (!this.chunkAt(c.cx + dx, c.cz + dz)) return false;
    this.light.lightChunk(c);
    c.state = ChunkState.Lit;
    c.markAllDirty();
    return true;
  }

  /** A chunk can be meshed when it and its neighbours are lit. */
  isMeshable(c: Chunk) {
    if (c.state !== ChunkState.Lit) return false;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.chunkAt(c.cx + dx, c.cz + dz);
        if (!n || n.state !== ChunkState.Lit) return false;
      }
    return true;
  }

  serializeChunk(c: Chunk): ChunkSave | null {
    if (c.mods.size === 0 && c.blockEntities.size === 0) return null;
    const m: number[] = [];
    for (const [idx, v] of c.mods) m.push(idx, v);
    const save: ChunkSave = { m };
    if (c.blockEntities.size > 0) save.be = [...c.blockEntities.entries()];
    return save;
  }

  /** Stores the chunk's changes in `saved` (returns true if anything changed). */
  storeChunk(c: Chunk): boolean {
    if (!c.unsaved) return false;
    const s = this.serializeChunk(c);
    if (s) this.saved.set(chunkId(c.cx, c.cz), s);
    c.unsaved = false;
    return true;
  }

  unloadChunk(c: Chunk) {
    this.storeChunk(c);
    for (const [idx, be] of c.blockEntities) {
      if (be.type === 'furnace') {
        const p = this.posOf(c, idx);
        this.furnaces.delete(`${p.x},${p.y},${p.z}`);
      }
    }
    this.chunks.delete(chunkId(c.cx, c.cz));
    this.light.reset();
  }

  private posOf(c: Chunk, idx: number) {
    return { x: c.cx * 16 + (idx & 15), y: idx >> 8, z: c.cz * 16 + ((idx >> 4) & 15) };
  }

  // ---------------------------------------------------------------- access

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return B.AIR;
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    return c ? c.blocks[blockIndex(x & 15, y, z & 15)] : B.AIR;
  }

  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    return c ? c.meta[blockIndex(x & 15, y, z & 15)] : 0;
  }

  /** Packed light: sky << 4 | block. */
  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    return c ? c.light[blockIndex(x & 15, y, z & 15)] : 0xf0;
  }

  isLoaded(x: number, z: number) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    return !!c && c.state === ChunkState.Lit;
  }

  /** Effective light 0–15 given the current sky darkness (0 at noon … 11 at night). */
  lightLevel(x: number, y: number, z: number, skyDarken: number) {
    const l = this.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return Math.max((l >> 4) - skyDarken, l & 15);
  }

  /** Top-most non-air block y at a column (or -1). */
  surfaceY(x: number, z: number) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (!c) return -1;
    for (let y = Math.min(c.top, WORLD_HEIGHT - 1); y >= 0; y--) {
      const id = c.blocks[blockIndex(x & 15, y, z & 15)];
      if (id !== B.AIR) return y;
    }
    return -1;
  }

  markDirty(x: number, y: number, z: number) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (!c) return;
    const s = Math.floor(y / SECTION_SIZE);
    c.dirty[s] = 1;
    const ly = y % SECTION_SIZE;
    if (ly === 0 && s > 0) c.dirty[s - 1] = 1;
    if (ly === SECTION_SIZE - 1 && s < c.dirty.length - 1) c.dirty[s + 1] = 1;
    const lx = x & 15;
    const lz = z & 15;
    if (lx === 0) this.markSection(x - 1, y, z);
    if (lx === 15) this.markSection(x + 1, y, z);
    if (lz === 0) this.markSection(x, y, z - 1);
    if (lz === 15) this.markSection(x, y, z + 1);
    if ((lx === 0 || lx === 15) && (lz === 0 || lz === 15)) this.markSection(x + (lx === 0 ? -1 : 1), y, z + (lz === 0 ? -1 : 1));
  }

  private markSection(x: number, y: number, z: number) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (!c) return;
    const s = Math.floor(y / SECTION_SIZE);
    c.dirty[s] = 1;
    const ly = y % SECTION_SIZE;
    if (ly === 0 && s > 0) c.dirty[s - 1] = 1;
    if (ly === SECTION_SIZE - 1 && s < c.dirty.length - 1) c.dirty[s + 1] = 1;
  }

  /**
   * Changes a block, updating light, meshes, the save diff and (if notify) neighbour
   * behaviour like water flow, falling sand and plants losing support.
   */
  setBlock(x: number, y: number, z: number, id: number, meta = 0, notify = true): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (!c) return false;
    const i = blockIndex(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    if (id !== B.AIR && y + 1 > c.top) c.top = y + 1;
    c.mods.set(i, id | (meta << 8));
    c.unsaved = true;

    const keepEntity = (old === B.FURNACE || old === B.FURNACE_LIT) && (id === B.FURNACE || id === B.FURNACE_LIT);
    if (old !== id && !keepEntity && c.blockEntities.has(i)) {
      c.blockEntities.delete(i);
      this.furnaces.delete(`${x},${y},${z}`);
    }

    if (LIGHT_OPACITY[old] !== LIGHT_OPACITY[id] || LIGHT_EMISSION[old] !== LIGHT_EMISSION[id])
      this.light.blockChanged(x, y, z, old, id);
    this.markDirty(x, y, z);

    if (notify) {
      this.updateBlock(x, y, z);
      for (const [dx, dy, dz] of FACE_DIRS) this.updateBlock(x + dx, y + dy, z + dz);
      if (isLog(old) && !isLog(id)) this.scheduleLeafChecks(x, y, z);
    }
    return true;
  }

  getBlockEntity(x: number, y: number, z: number): BlockEntity | undefined {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    return c?.blockEntities.get(blockIndex(x & 15, y, z & 15));
  }

  setBlockEntity(x: number, y: number, z: number, be: BlockEntity) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (!c) return;
    c.blockEntities.set(blockIndex(x & 15, y, z & 15), be);
    c.unsaved = true;
    if (be.type === 'furnace') this.furnaces.set(`${x},${y},${z}`, { x, y, z });
  }

  /** Mark a block entity's chunk as changed (contents edited through the UI). */
  touchBlockEntity(x: number, z: number) {
    const c = this.chunks.get(chunkId(x >> 4, z >> 4));
    if (c) c.unsaved = true;
  }

  /** Removes a block, dropping its items (and container contents) if `drops`. */
  breakBlock(x: number, y: number, z: number, tool: ItemStack | null, drops: boolean) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    const meta = this.getMeta(x, y, z);
    const be = this.getBlockEntity(x, y, z);
    if (be) {
      const contents: Slot[] = be.type === 'chest' ? be.items : [be.input, be.fuel, be.output];
      for (const s of contents) if (s) this.hooks.dropItem(x + 0.5, y + 0.5, z + 0.5, { ...s });
    }
    // Ice melts into water unless it floats over air.
    const below = this.getBlock(x, y - 1, z);
    const becomes = id === B.ICE && below !== B.AIR ? B.WATER : B.AIR;
    this.setBlock(x, y, z, becomes, 0);
    if (drops) for (const s of blockDrops(id, meta, tool, this.rng)) this.hooks.dropItem(x + 0.5, y + 0.25, z + 0.5, s);
  }

  /** Breaks a block because of the world (support lost, water…). Always drops. */
  private popBlock(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    this.hooks.blockBroken?.(x, y, z, id);
    this.breakBlock(x, y, z, null, true);
  }

  // ---------------------------------------------------------------- block behaviour

  private scheduleTick(x: number, y: number, z: number, delay: number) {
    const key = `${x},${y},${z}`;
    if (!this.scheduled.has(key)) this.scheduled.set(key, { x, y, z, at: this.time + delay });
  }

  /** Called on a block when it or a neighbour changed. */
  updateBlock(x: number, y: number, z: number) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    switch (id) {
      case B.WATER:
        this.scheduleTick(x, y, z, 5);
        return;
      case B.SAND:
      case B.GRAVEL:
        if (this.canFallInto(x, y - 1, z)) this.scheduleTick(x, y, z, 2);
        return;
      case B.TORCH: {
        const [dx, dy, dz] = FACE_DIRS[this.getMeta(x, y, z) % 6];
        if (!this.isSturdy(this.getBlock(x + dx, y + dy, z + dz))) this.popBlock(x, y, z);
        return;
      }
      case B.SNOW:
        if (!IS_OPAQUE[this.getBlock(x, y - 1, z)]) this.setBlock(x, y, z, B.AIR);
        return;
      case B.CACTUS: {
        const below = this.getBlock(x, y - 1, z);
        const sideBlocked = HORIZONTAL.some(([dx, dz]) => IS_SOLID[this.getBlock(x + dx, y, z + dz)]);
        if ((below !== B.SAND && below !== B.CACTUS) || sideBlocked) this.popBlock(x, y, z);
        return;
      }
      case B.FARMLAND:
        if (IS_OPAQUE[this.getBlock(x, y + 1, z)]) this.setBlock(x, y, z, B.DIRT);
        return;
      case B.WHEAT:
        if (this.getBlock(x, y - 1, z) !== B.FARMLAND) this.popBlock(x, y, z);
        return;
      case B.DEAD_BUSH: {
        const below = this.getBlock(x, y - 1, z);
        if (below !== B.SAND && below !== B.DIRT && below !== B.GRASS) this.popBlock(x, y, z);
        return;
      }
    }
    const def = block(id);
    if (def.shape === 'cross') {
      const below = this.getBlock(x, y - 1, z);
      if (below !== B.GRASS && below !== B.DIRT && below !== B.FARMLAND) this.popBlock(x, y, z);
    }
  }

  /** Full solid face a torch can attach to. */
  isSturdy(id: number) {
    const def = block(id);
    return def.solid && def.shape === 'cube' && !isLeaves(id);
  }

  canFallInto(x: number, y: number, z: number) {
    if (y < 0) return false;
    const id = this.getBlock(x, y, z);
    return id === B.AIR || id === B.WATER || (block(id).replaceable && !IS_SOLID[id]);
  }

  private scheduledTick(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    if (id === B.WATER) this.fluidTick(x, y, z);
    else if ((id === B.SAND || id === B.GRAVEL) && this.canFallInto(x, y - 1, z)) {
      const meta = this.getMeta(x, y, z);
      this.setBlock(x, y, z, B.AIR);
      this.hooks.spawnFallingBlock(x, y, z, id, meta);
    } else if (isLeaves(id) && !(this.getMeta(x, y, z) & LEAF_PERSISTENT)) {
      if (!this.leafSupported(x, y, z)) {
        this.hooks.blockBroken?.(x, y, z, id);
        this.setBlock(x, y, z, B.AIR);
        for (const s of leafDrops(id, this.rng)) this.hooks.dropItem(x + 0.5, y + 0.5, z + 0.5, s);
      }
    }
  }

  /** Water: meta 0 = source, 1–7 = flowing (distance), 8 = falling. */
  private fluidTick(x: number, y: number, z: number) {
    let meta = this.getMeta(x, y, z);
    const isSource = meta === 0;
    if (!isSource) {
      let next: number;
      if (this.getBlock(x, y + 1, z) === B.WATER) next = 8;
      else {
        let min = 8;
        let sources = 0;
        for (const [dx, dz] of HORIZONTAL) {
          if (this.getBlock(x + dx, y, z + dz) !== B.WATER) continue;
          const m = this.getMeta(x + dx, y, z + dz);
          if (m === 0) sources++;
          const level = m >= 8 ? 0 : m;
          if (level < min) min = level;
        }
        const below = this.getBlock(x, y - 1, z);
        if (sources >= 2 && (IS_SOLID[below] || (below === B.WATER && this.getMeta(x, y - 1, z) === 0))) next = 0;
        else next = min + 1 >= 8 ? -1 : min + 1;
      }
      if (next === -1) {
        this.setBlock(x, y, z, B.AIR);
        return;
      }
      if (next !== meta) {
        this.setBlock(x, y, z, B.WATER, next);
        meta = next;
      }
    }
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && fluidReplaceable(below)) {
      this.flowInto(x, y - 1, z, 8);
      return;
    }
    const blockedBelow = below !== B.WATER;
    if (meta === 0 || blockedBelow) {
      const next = meta >= 8 ? 1 : meta + 1;
      if (next > 7) return;
      for (const [dx, dz] of HORIZONTAL) {
        const n = this.getBlock(x + dx, y, z + dz);
        if (fluidReplaceable(n)) this.flowInto(x + dx, y, z + dz, next);
      }
    }
  }

  private flowInto(x: number, y: number, z: number, meta: number) {
    const id = this.getBlock(x, y, z);
    if (id !== B.AIR && id !== B.WATER) this.popBlock(x, y, z);
    this.setBlock(x, y, z, B.WATER, meta);
  }

  /** Leaves stay while a log is reachable within 5 steps through leaves. */
  private leafSupported(x: number, y: number, z: number) {
    const seen = new Set<string>();
    let frontier = [[x, y, z]];
    for (let d = 0; d < 5; d++) {
      const next: number[][] = [];
      for (const [px, py, pz] of frontier) {
        for (const [dx, dy, dz] of FACE_DIRS) {
          const nx = px + dx;
          const ny = py + dy;
          const nz = pz + dz;
          const k = `${nx},${ny},${nz}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const id = this.getBlock(nx, ny, nz);
          if (isLog(id)) return true;
          if (isLeaves(id)) next.push([nx, ny, nz]);
        }
      }
      frontier = next;
    }
    return false;
  }

  private scheduleLeafChecks(x: number, y: number, z: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++) {
          const id = this.getBlock(x + dx, y + dy, z + dz);
          if (isLeaves(id) && !(this.getMeta(x + dx, y + dy, z + dz) & LEAF_PERSISTENT))
            this.scheduleTick(x + dx, y + dy, z + dz, 20 + Math.floor(this.rng() * 160));
        }
  }

  /** Grows a sapling into a tree if there is room. */
  growTree(x: number, y: number, z: number, kind: TreeKind) {
    const height = kind === 'spruce' ? 11 : 7;
    for (let dy = 1; dy <= height; dy++) {
      const id = this.getBlock(x, y + dy, z);
      if (id !== B.AIR && !isLeaves(id) || y + dy >= WORLD_HEIGHT) return false;
    }
    this.setBlock(x, y, z, B.AIR, 0, false);
    buildTree(kind, x, y, z, this.rng, (bx, by, bz, id, force) => {
      const cur = this.getBlock(bx, by, bz);
      if (force || cur === B.AIR || cur === B.SNOW || cur === B.TALL_GRASS) this.setBlock(bx, by, bz, id, 0, false);
    });
    return true;
  }

  // ---------------------------------------------------------------- ticking

  /** One game tick (1/20 s): scheduled ticks, random ticks near the player and furnaces. */
  tick(px: number, pz: number, randomTickChunks: number, skyDarken: number) {
    this.time++;
    if (this.scheduled.size > 0) {
      const due: { x: number; y: number; z: number }[] = [];
      for (const [key, s] of this.scheduled) {
        if (s.at <= this.time) {
          due.push(s);
          this.scheduled.delete(key);
          if (due.length >= 400) break;
        }
      }
      for (const s of due) this.scheduledTick(s.x, s.y, s.z);
    }

    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let dz = -randomTickChunks; dz <= randomTickChunks; dz++)
      for (let dx = -randomTickChunks; dx <= randomTickChunks; dx++) {
        const c = this.chunkAt(pcx + dx, pcz + dz);
        if (!c || c.state !== ChunkState.Lit) continue;
        const sections = Math.ceil(c.top / SECTION_SIZE);
        for (let s = 0; s < sections; s++) {
          for (let k = 0; k < 3; k++) {
            const r = (this.rng() * 4096) | 0;
            const lx = r & 15;
            const lz = (r >> 4) & 15;
            const ly = s * SECTION_SIZE + (r >> 8);
            const id = c.blocks[blockIndex(lx, ly, lz)];
            if (id === B.AIR || id === B.STONE || id === B.DIRT || id === B.WATER) continue;
            this.randomTick(c.cx * 16 + lx, ly, c.cz * 16 + lz, id, skyDarken);
          }
        }
      }

    for (const f of this.furnaces.values()) {
      const be = this.getBlockEntity(f.x, f.y, f.z);
      if (be?.type === 'furnace') this.tickFurnace(f.x, f.y, f.z, be);
    }
  }

  private randomTick(x: number, y: number, z: number, id: number, skyDarken: number) {
    const lightAbove = () => {
      const l = this.getLight(x, y + 1, z);
      return Math.max((l >> 4) - skyDarken, l & 15);
    };
    const blockLight = this.getLight(x, y, z) & 15;
    switch (id) {
      case B.GRASS: {
        const above = this.getBlock(x, y + 1, z);
        if (LIGHT_OPACITY[above] > 2 && lightAbove() < 4) {
          this.setBlock(x, y, z, B.DIRT);
          return;
        }
        if (lightAbove() >= 9) {
          for (let i = 0; i < 4; i++) {
            const tx = x + Math.floor(this.rng() * 3) - 1;
            const ty = y + Math.floor(this.rng() * 5) - 3;
            const tz = z + Math.floor(this.rng() * 3) - 1;
            if (this.getBlock(tx, ty, tz) !== B.DIRT) continue;
            const a = this.getBlock(tx, ty + 1, tz);
            const l = this.getLight(tx, ty + 1, tz);
            if (LIGHT_OPACITY[a] <= 2 && Math.max((l >> 4) - skyDarken, l & 15) >= 4) this.setBlock(tx, ty, tz, B.GRASS);
          }
        }
        return;
      }
      case B.OAK_SAPLING:
      case B.BIRCH_SAPLING:
      case B.SPRUCE_SAPLING:
        if (lightAbove() >= 9 && this.rng() < 1 / 7) {
          const kind: TreeKind = id === B.BIRCH_SAPLING ? 'birch' : id === B.SPRUCE_SAPLING ? 'spruce' : 'oak';
          this.growTree(x, y, z, kind);
        }
        return;
      case B.WHEAT: {
        const stage = this.getMeta(x, y, z) & 7;
        if (stage < 7 && lightAbove() >= 9 && this.rng() < 0.35) this.setBlock(x, y, z, B.WHEAT, stage + 1);
        return;
      }
      case B.FARMLAND: {
        if (this.getBlock(x, y + 1, z) !== B.AIR) return;
        let wet = false;
        for (let dz = -4; dz <= 4 && !wet; dz++)
          for (let dx = -4; dx <= 4 && !wet; dx++)
            for (let dy = 0; dy <= 1 && !wet; dy++) if (this.getBlock(x + dx, y + dy, z + dz) === B.WATER) wet = true;
        if (!wet && this.rng() < 0.25) this.setBlock(x, y, z, B.DIRT);
        return;
      }
      case B.CACTUS: {
        if (this.getBlock(x, y + 1, z) !== B.AIR) return;
        let h = 1;
        while (this.getBlock(x, y - h, z) === B.CACTUS) h++;
        if (h >= 3) return;
        const age = this.getMeta(x, y, z);
        if (age >= 15) {
          this.setBlock(x, y, z, B.CACTUS, 0, false);
          this.setBlock(x, y + 1, z, B.CACTUS);
        } else this.setBlock(x, y, z, B.CACTUS, age + 1, false);
        return;
      }
      case B.ICE:
        if (blockLight > 11) this.setBlock(x, y, z, B.WATER);
        return;
      case B.SNOW:
        if (blockLight > 11) this.setBlock(x, y, z, B.AIR);
        return;
    }
    if (isLeaves(id) && !(this.getMeta(x, y, z) & LEAF_PERSISTENT)) this.scheduleTick(x, y, z, 1);
  }

  private tickFurnace(x: number, y: number, z: number, f: FurnaceEntity) {
    const wasBurning = f.burn > 0;
    let changed = false;
    if (f.burn > 0) f.burn--;
    const result = f.input ? smeltResult(f.input.id) : null;
    const canSmelt =
      result !== null && (!f.output || (f.output.id === result && f.output.count < maxStack(result)));
    if (f.burn === 0 && canSmelt && f.fuel && fuelTicks(f.fuel.id) > 0) {
      f.burn = f.burnTotal = fuelTicks(f.fuel.id);
      f.fuel.count--;
      if (f.fuel.count <= 0) f.fuel = null;
      changed = true;
    }
    if (f.burn > 0 && canSmelt && result !== null) {
      f.cook++;
      if (f.cook >= SMELT_TIME) {
        f.cook = 0;
        if (f.output) f.output.count++;
        else f.output = { id: result, count: 1, damage: 0 };
        if (f.input) {
          f.input.count--;
          if (f.input.count <= 0) f.input = null;
        }
        changed = true;
      }
    } else if (f.cook > 0) f.cook = Math.max(0, f.cook - 2);
    const burning = f.burn > 0;
    if (burning !== wasBurning) {
      this.setBlock(x, y, z, burning ? B.FURNACE_LIT : B.FURNACE, this.getMeta(x, y, z), false);
      changed = true;
    }
    if (changed) this.touchBlockEntity(x, z);
    this.onFurnaceChange?.(x, y, z);
  }
}
