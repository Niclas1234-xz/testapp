/** Blocks per chunk side (x and z). */
export const CHUNK_SIZE = 16;
/** World height in blocks (y = 0 … WORLD_HEIGHT - 1). */
export const WORLD_HEIGHT = 128;
/** Height of a render section; a chunk column is split into WORLD_HEIGHT / SECTION_SIZE sections. */
export const SECTION_SIZE = 16;
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_SIZE;
export const SEA_LEVEL = 62;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

/** Game ticks per second, like Minecraft. */
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Length of a full day in ticks (20 minutes). */
export const DAY_LENGTH = 24000;

export const REACH_SURVIVAL = 4.5;
export const REACH_CREATIVE = 5;

/** Index of a block inside a chunk column: x fastest, then z, then y. */
export function blockIndex(x: number, y: number, z: number) {
  return (y << 8) | (z << 4) | x;
}

export function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`;
}
