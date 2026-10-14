import { LIGHT_EMISSION, LIGHT_OPACITY } from '../blocks';
import { blockIndex, WORLD_HEIGHT } from '../constants';
import { ChunkState, type Chunk } from './chunk';

/** What the light engine needs from the world. */
export interface LightAccess {
  chunkAt(cx: number, cz: number): Chunk | undefined;
  markDirty(x: number, y: number, z: number): void;
}

const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;

/**
 * Flood-fill light engine (sky light and block light, 0–15) across chunk borders,
 * with incremental add/remove updates like Minecraft.
 */
export class LightEngine {
  private qx: number[] = [];
  private qy: number[] = [];
  private qz: number[] = [];
  private rx: number[] = [];
  private ry: number[] = [];
  private rz: number[] = [];
  private rl: number[] = [];
  private lastCx = 1e9;
  private lastCz = 1e9;
  private lastChunk: Chunk | undefined;

  constructor(private world: LightAccess) {}

  private chunk(x: number, z: number): Chunk | undefined {
    const cx = x >> 4;
    const cz = z >> 4;
    if (cx === this.lastCx && cz === this.lastCz) return this.lastChunk;
    this.lastCx = cx;
    this.lastCz = cz;
    this.lastChunk = this.world.chunkAt(cx, cz);
    return this.lastChunk;
  }

  /** Forget the cached chunk (after unloading chunks). */
  reset() {
    this.lastCx = 1e9;
    this.lastCz = 1e9;
    this.lastChunk = undefined;
  }

  private get(sky: boolean, x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return sky ? 15 : 0;
    if (y < 0) return 0;
    const c = this.chunk(x, z);
    if (!c) return -1;
    const v = c.light[blockIndex(x & 15, y, z & 15)];
    return sky ? v >> 4 : v & 15;
  }

  private set(sky: boolean, x: number, y: number, z: number, level: number) {
    const c = this.chunk(x, z);
    if (!c) return;
    const i = blockIndex(x & 15, y, z & 15);
    const v = c.light[i];
    c.light[i] = sky ? (level << 4) | (v & 15) : (v & 0xf0) | level;
    if (c.state === ChunkState.Lit) this.world.markDirty(x, y, z);
  }

  private opacity(x: number, y: number, z: number): number {
    const c = this.chunk(x, z);
    if (!c) return 15;
    return LIGHT_OPACITY[c.blocks[blockIndex(x & 15, y, z & 15)]];
  }

  /** Initial lighting of a freshly generated chunk; light may spill into (generated) neighbours. */
  lightChunk(chunk: Chunk) {
    const ox = chunk.cx * 16;
    const oz = chunk.cz * 16;
    const { blocks, light, heightmap } = chunk;
    let maxHeight = 0;
    for (let z = 0; z < 16; z++)
      for (let x = 0; x < 16; x++) {
        let level = 15;
        let hm = 0;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const i = blockIndex(x, y, z);
          const op = LIGHT_OPACITY[blocks[i]];
          if (op > 0 && hm === 0) hm = y + 1;
          if (op >= 15) level = 0;
          else if (op > 0) level = Math.max(0, level - op);
          if (level > light[i] >> 4) light[i] = (level << 4) | (light[i] & 15);
          if (level === 0 && hm > 0) break;
        }
        heightmap[z * 16 + x] = hm;
        if (hm > maxHeight) maxHeight = hm;
      }
    // Seed the flood fill with every lit cell that can spread sideways or down. Border
    // columns are checked up to the top, since neighbours may have higher overhangs.
    for (let y = 0; y < WORLD_HEIGHT; y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const border = x === 0 || z === 0 || x === 15 || z === 15;
          if (y > maxHeight && !border) continue;
          const i = blockIndex(x, y, z);
          const s = light[i] >> 4;
          if (s > 1) {
            const wx = ox + x;
            const wz = oz + z;
            // Only cells next to darker transparent neighbours need to spread.
            for (let d = 0; d < 6; d++) {
              const n = this.get(true, wx + DX[d], y + DY[d], wz + DZ[d]);
              if (n >= 0 && n < s - 1 && y + DY[d] >= 0 && y + DY[d] < WORLD_HEIGHT && this.opacity(wx + DX[d], y + DY[d], wz + DZ[d]) < 15) {
                this.push(wx, y, wz);
                break;
              }
            }
          }
        }
    this.propagate(true);
    for (let y = 0; y < Math.min(chunk.top + 1, WORLD_HEIGHT); y++)
      for (let z = 0; z < 16; z++)
        for (let x = 0; x < 16; x++) {
          const i = blockIndex(x, y, z);
          const em = LIGHT_EMISSION[blocks[i]];
          if (em > 0) {
            light[i] = (light[i] & 0xf0) | em;
            this.push(ox + x, y, oz + z);
          }
        }
    this.propagate(false);
    // Pull light in from neighbours that were lit before this chunk existed.
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let i = 0; i < 16; i++) {
        this.pullFrom(ox - 1, y, oz + i);
        this.pullFrom(ox + 16, y, oz + i);
        this.pullFrom(ox + i, y, oz - 1);
        this.pullFrom(ox + i, y, oz + 16);
      }
    }
    this.propagate(true);
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let i = 0; i < 16; i++) {
        this.pullFromBlock(ox - 1, y, oz + i);
        this.pullFromBlock(ox + 16, y, oz + i);
        this.pullFromBlock(ox + i, y, oz - 1);
        this.pullFromBlock(ox + i, y, oz + 16);
      }
    }
    this.propagate(false);
  }

  private pullFrom(x: number, y: number, z: number) {
    const c = this.chunk(x, z);
    if (!c || c.state !== ChunkState.Lit) return;
    if (c.light[blockIndex(x & 15, y, z & 15)] >> 4 > 1) this.push(x, y, z);
  }

  private pullFromBlock(x: number, y: number, z: number) {
    const c = this.chunk(x, z);
    if (!c || c.state !== ChunkState.Lit) return;
    if ((c.light[blockIndex(x & 15, y, z & 15)] & 15) > 1) this.push(x, y, z);
  }

  private push(x: number, y: number, z: number) {
    this.qx.push(x);
    this.qy.push(y);
    this.qz.push(z);
  }

  private propagate(sky: boolean) {
    const { qx, qy, qz } = this;
    let head = 0;
    while (head < qx.length) {
      const x = qx[head];
      const y = qy[head];
      const z = qz[head];
      head++;
      const level = this.get(sky, x, y, z);
      if (level <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        const nz = z + DZ[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const cur = this.get(sky, nx, ny, nz);
        if (cur < 0) continue;
        const op = this.opacity(nx, ny, nz);
        if (op >= 15) continue;
        const next = sky && d === DOWN && level === 15 && op === 0 ? 15 : level - Math.max(1, op);
        if (next > cur) {
          this.set(sky, nx, ny, nz, next);
          qx.push(nx);
          qy.push(ny);
          qz.push(nz);
        }
      }
      if (head > 4096 && head * 2 > qx.length) {
        qx.splice(0, head);
        qy.splice(0, head);
        qz.splice(0, head);
        head = 0;
      }
    }
    qx.length = 0;
    qy.length = 0;
    qz.length = 0;
  }

  private remove(sky: boolean, x: number, y: number, z: number) {
    const start = this.get(sky, x, y, z);
    if (start <= 0) return;
    this.set(sky, x, y, z, 0);
    const { rx, ry, rz, rl } = this;
    rx.push(x);
    ry.push(y);
    rz.push(z);
    rl.push(start);
    let head = 0;
    while (head < rx.length) {
      const cx = rx[head];
      const cy = ry[head];
      const cz = rz[head];
      const level = rl[head];
      head++;
      for (let d = 0; d < 6; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        const nz = cz + DZ[d];
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nl = this.get(sky, nx, ny, nz);
        if (nl <= 0) continue;
        if (nl < level || (sky && d === DOWN && level === 15 && nl === 15)) {
          this.set(sky, nx, ny, nz, 0);
          rx.push(nx);
          ry.push(ny);
          rz.push(nz);
          rl.push(nl);
        } else {
          this.push(nx, ny, nz);
        }
      }
    }
    rx.length = 0;
    ry.length = 0;
    rz.length = 0;
    rl.length = 0;
  }

  /** Incremental update after a block changed from oldId to newId at (x, y, z). */
  blockChanged(x: number, y: number, z: number, oldId: number, newId: number) {
    const c = this.chunk(x, z);
    if (!c || c.state !== ChunkState.Lit) return;
    const oldOp = LIGHT_OPACITY[oldId];
    const newOp = LIGHT_OPACITY[newId];
    const newEm = LIGHT_EMISSION[newId];
    const oldEm = LIGHT_EMISSION[oldId];

    // Heightmap.
    const hi = (z & 15) * 16 + (x & 15);
    if (newOp > 0 && y + 1 > c.heightmap[hi]) c.heightmap[hi] = y + 1;
    else if (newOp === 0 && y + 1 === c.heightmap[hi]) {
      let h = y;
      while (h > 0 && LIGHT_OPACITY[c.blocks[blockIndex(x & 15, h - 1, z & 15)]] === 0) h--;
      c.heightmap[hi] = h;
    }

    // Block light.
    if (oldEm > 0 || newOp > oldOp) this.remove(false, x, y, z);
    if (newEm > 0) {
      this.set(false, x, y, z, Math.max(newEm, this.get(false, x, y, z)));
      this.push(x, y, z);
    }
    if (newOp < oldOp || oldEm > newEm) for (let d = 0; d < 6; d++) this.pushIfValid(x + DX[d], y + DY[d], z + DZ[d]);
    this.propagate(false);

    // Sky light.
    if (newOp > oldOp) this.remove(true, x, y, z);
    if (newOp < oldOp) {
      if (y === WORLD_HEIGHT - 1) {
        this.set(true, x, y, z, 15);
        this.push(x, y, z);
      }
      for (let d = 0; d < 6; d++) this.pushIfValid(x + DX[d], y + DY[d], z + DZ[d]);
    }
    this.propagate(true);
  }

  private pushIfValid(x: number, y: number, z: number) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    if (this.chunk(x, z)) this.push(x, y, z);
  }
}
