import { LIGHT_EMISSION, LIGHT_OPACITY } from '../blocks';
import { WORLD_HEIGHT } from '../constants';
import { chunkId, ChunkState, type Chunk } from './chunk';

/** What the light engine needs from the world. */
export interface LightAccess {
  chunks: Map<number, Chunk>;
  markDirty(x: number, y: number, z: number): void;
}

const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;

/** Computes the heightmap (y + 1 of the highest light-blocking block per column). */
export function computeHeightmap(c: Chunk) {
  const { blocks, heightmap } = c;
  for (let i = 0; i < 256; i++) {
    let h = 0;
    for (let y = Math.min(c.top, WORLD_HEIGHT - 1); y >= 0; y--) {
      if (LIGHT_OPACITY[blocks[(y << 8) | i]] > 0) {
        h = y + 1;
        break;
      }
    }
    heightmap[i] = h;
  }
}

/** Growable FIFO of packed positions (x/z relative to an origin, ±512). */
class Queue {
  data = new Int32Array(4096);
  head = 0;
  tail = 0;
  ox = 0;
  oz = 0;

  reset(ox: number, oz: number) {
    this.head = this.tail = 0;
    this.ox = ox;
    this.oz = oz;
  }

  push(x: number, y: number, z: number) {
    if (this.tail >= this.data.length) {
      const next = new Int32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.tail++] = ((x - this.ox + 512) << 17) | ((z - this.oz + 512) << 7) | y;
  }

  get empty() {
    return this.head >= this.tail;
  }

  /** Pops into out[0..2] = x, y, z. */
  pop(out: Int32Array) {
    const v = this.data[this.head++];
    out[0] = (v >>> 17) - 512 + this.ox;
    out[1] = v & 127;
    out[2] = ((v >>> 7) & 1023) - 512 + this.oz;
  }
}

/**
 * Flood-fill light engine (sky light and block light, 0–15) across chunk borders,
 * with incremental add/remove updates like Minecraft.
 */
export class LightEngine {
  private add = new Queue();
  private rem = new Queue();
  private remLevels = new Uint8Array(4096);
  private pos = new Int32Array(3);
  private lastId = NaN;
  private lastChunk: Chunk | undefined;

  constructor(private world: LightAccess) {}

  private chunk(x: number, z: number): Chunk | undefined {
    const id = chunkId(x >> 4, z >> 4);
    if (id === this.lastId) return this.lastChunk;
    this.lastId = id;
    this.lastChunk = this.world.chunks.get(id);
    return this.lastChunk;
  }

  /** Forget the cached chunk (after unloading chunks). */
  reset() {
    this.lastId = NaN;
    this.lastChunk = undefined;
  }

  /** Initial lighting of a freshly generated chunk; light may spill into (generated) neighbours. */
  lightChunk(chunk: Chunk) {
    const ox = chunk.cx * 16;
    const oz = chunk.cz * 16;
    const { blocks, light, heightmap } = chunk;
    // Sky light straight down each column.
    for (let i = 0; i < 256; i++) {
      let level = 15;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const k = (y << 8) | i;
        const op = LIGHT_OPACITY[blocks[k]];
        if (op >= 15) level = 0;
        else if (op > 0) level = level > op ? level - op : 0;
        if (level === 0) break;
        if (level > light[k] >> 4) light[k] = (level << 4) | (light[k] & 15);
      }
    }
    // Light spreads sideways where a neighbouring column is taller (overhangs, cliffs, trees).
    const q = this.add;
    q.reset(ox, oz);
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        const h = heightmap[(z << 4) | x];
        let maxN = h;
        for (let d = 0; d < 6; d++) {
          if (d === 2 || d === 3) continue;
          const nx = x + DX[d];
          const nz = z + DZ[d];
          let nh: number;
          if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16) nh = heightmap[(nz << 4) | nx];
          else {
            const c = this.chunk(ox + nx, oz + nz);
            nh = c ? c.heightmap[((nz & 15) << 4) | (nx & 15)] : 0;
          }
          if (nh > maxN) maxN = nh;
        }
        for (let y = h; y < maxN && y < WORLD_HEIGHT; y++) {
          if (light[(y << 8) | (z << 4) | x] >> 4 > 1) q.push(ox + x, y, oz + z);
        }
      }
    this.propagate(true);

    q.reset(ox, oz);
    for (let y = 0; y < Math.min(chunk.top + 1, WORLD_HEIGHT); y++)
      for (let i = 0; i < 256; i++) {
        const k = (y << 8) | i;
        const em = LIGHT_EMISSION[blocks[k]];
        if (em > 0) {
          light[k] = (light[k] & 0xf0) | em;
          q.push(ox + (i & 15), y, oz + (i >> 4));
        }
      }
    this.propagate(false);
  }

  private propagate(sky: boolean) {
    const q = this.add;
    const p = this.pos;
    const shift = sky ? 4 : 0;
    while (!q.empty) {
      q.pop(p);
      const x = p[0];
      const y = p[1];
      const z = p[2];
      const c = this.chunk(x, z);
      if (!c) continue;
      const level = (c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] >> shift) & 15;
      if (level <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const ny = y + DY[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nx = x + DX[d];
        const nz = z + DZ[d];
        const nc = DY[d] !== 0 ? c : this.chunk(nx, nz);
        if (!nc) continue;
        const k = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const op = LIGHT_OPACITY[nc.blocks[k]];
        if (op >= 15) continue;
        const next = sky && d === DOWN && level === 15 && op === 0 ? 15 : level - (op > 1 ? op : 1);
        const v = nc.light[k];
        const cur = (v >> shift) & 15;
        if (next > cur) {
          nc.light[k] = sky ? (next << 4) | (v & 15) : (v & 0xf0) | next;
          if (nc.state === ChunkState.Lit) this.world.markDirty(nx, ny, nz);
          q.push(nx, ny, nz);
        }
      }
    }
  }

  private getLevel(sky: boolean, x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return sky ? 15 : 0;
    if (y < 0) return 0;
    const c = this.chunk(x, z);
    if (!c) return -1;
    const v = c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
    return sky ? v >> 4 : v & 15;
  }

  private setLevel(sky: boolean, x: number, y: number, z: number, level: number) {
    const c = this.chunk(x, z);
    if (!c) return;
    const k = (y << 8) | ((z & 15) << 4) | (x & 15);
    const v = c.light[k];
    c.light[k] = sky ? (level << 4) | (v & 15) : (v & 0xf0) | level;
    if (c.state === ChunkState.Lit) this.world.markDirty(x, y, z);
  }

  private remove(sky: boolean, x: number, y: number, z: number) {
    const start = this.getLevel(sky, x, y, z);
    if (start <= 0) return;
    this.setLevel(sky, x, y, z, 0);
    const r = this.rem;
    r.reset(x, z);
    r.push(x, y, z);
    this.remLevels[0] = start;
    const p = this.pos;
    while (!r.empty) {
      const level = this.remLevels[r.head];
      r.pop(p);
      const cx = p[0];
      const cy = p[1];
      const cz = p[2];
      for (let d = 0; d < 6; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        const nz = cz + DZ[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nl = this.getLevel(sky, nx, ny, nz);
        if (nl <= 0) continue;
        if (nl < level || (sky && d === DOWN && level === 15 && nl === 15)) {
          this.setLevel(sky, nx, ny, nz, 0);
          if (r.tail >= this.remLevels.length) {
            const next = new Uint8Array(this.remLevels.length * 2);
            next.set(this.remLevels);
            this.remLevels = next;
          }
          this.remLevels[r.tail] = nl;
          r.push(nx, ny, nz);
        } else {
          this.add.push(nx, ny, nz);
        }
      }
    }
  }

  /** Incremental update after a block changed from oldId to newId at (x, y, z). */
  blockChanged(x: number, y: number, z: number, oldId: number, newId: number) {
    const c = this.chunk(x, z);
    if (!c) return;
    const oldOp = LIGHT_OPACITY[oldId];
    const newOp = LIGHT_OPACITY[newId];
    const newEm = LIGHT_EMISSION[newId];
    const oldEm = LIGHT_EMISSION[oldId];

    // Heightmap (kept up to date even before the chunk is lit).
    const hi = ((z & 15) << 4) | (x & 15);
    if (newOp > 0 && y + 1 > c.heightmap[hi]) c.heightmap[hi] = y + 1;
    else if (newOp === 0 && y + 1 === c.heightmap[hi]) {
      let h = y;
      while (h > 0 && LIGHT_OPACITY[c.blocks[((h - 1) << 8) | hi]] === 0) h--;
      c.heightmap[hi] = h;
    }
    if (c.state !== ChunkState.Lit) return;

    // Block light.
    this.add.reset(x, z);
    if (oldEm > 0 || newOp > oldOp) this.remove(false, x, y, z);
    if (newEm > 0) {
      this.setLevel(false, x, y, z, Math.max(newEm, this.getLevel(false, x, y, z)));
      this.add.push(x, y, z);
    }
    if (newOp < oldOp || oldEm > newEm) this.pushNeighbours(x, y, z);
    this.propagate(false);

    // Sky light.
    this.add.reset(x, z);
    if (newOp > oldOp) this.remove(true, x, y, z);
    if (newOp < oldOp) {
      if (y === WORLD_HEIGHT - 1) {
        this.setLevel(true, x, y, z, 15);
        this.add.push(x, y, z);
      }
      this.pushNeighbours(x, y, z);
    }
    this.propagate(true);
  }

  private pushNeighbours(x: number, y: number, z: number) {
    for (let d = 0; d < 6; d++) {
      const ny = y + DY[d];
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      if (this.chunk(x + DX[d], z + DZ[d])) this.add.push(x + DX[d], ny, z + DZ[d]);
    }
  }
}
