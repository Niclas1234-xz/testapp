import type { Slot } from '../inventory';
import { CHUNK_VOLUME, SECTION_COUNT } from '../constants';

export interface FurnaceEntity {
  type: 'furnace';
  input: Slot;
  fuel: Slot;
  output: Slot;
  /** Remaining burn ticks of the current fuel item. */
  burn: number;
  burnTotal: number;
  /** Smelting progress in ticks. */
  cook: number;
}

export interface ChestEntity {
  type: 'chest';
  items: Slot[];
}

export type BlockEntity = FurnaceEntity | ChestEntity;

export const ChunkState = {
  /** Terrain generated, not lit yet. */
  Generated: 1,
  /** Sky and block light computed (needs all 8 neighbours generated). */
  Lit: 2,
} as const;

/** A 16×128×16 column of blocks with light, metadata and per-section mesh dirtiness. */
export class Chunk {
  readonly blocks = new Uint8Array(CHUNK_VOLUME);
  readonly meta = new Uint8Array(CHUNK_VOLUME);
  /** High nibble: sky light, low nibble: block light. */
  readonly light = new Uint8Array(CHUNK_VOLUME);
  /** y + 1 of the highest block that blocks sky light, per column. */
  readonly heightmap = new Uint8Array(256);
  readonly biomes = new Uint8Array(256);
  /** Per-column RGB tints for grass and foliage. */
  readonly grassTint = new Uint8Array(256 * 3);
  readonly foliageTint = new Uint8Array(256 * 3);
  /** 1 = section needs to be (re)meshed. */
  readonly dirty = new Uint8Array(SECTION_COUNT).fill(1);
  /** Player/world changes since generation: block index → id | meta << 8. Saved to disk. */
  readonly mods = new Map<number, number>();
  readonly blockEntities = new Map<number, BlockEntity>();
  state: number = ChunkState.Generated;
  /** Changed since the last save. */
  unsaved = false;
  /** Highest y + 1 that contains any non-air block (meshing/lighting skip the rest). */
  top = 0;

  constructor(
    readonly cx: number,
    readonly cz: number
  ) {}

  markAllDirty() {
    this.dirty.fill(1);
  }
}

export function chunkId(cx: number, cz: number) {
  return cx * 65536 + cz;
}
