import { tile } from './textures/atlas';

/** Block ids (stored as bytes in chunks). */
export const B = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  OAK_PLANKS: 5,
  OAK_SAPLING: 6,
  BEDROCK: 7,
  WATER: 8,
  SAND: 9,
  GRAVEL: 10,
  GOLD_ORE: 11,
  IRON_ORE: 12,
  COAL_ORE: 13,
  OAK_LOG: 14,
  OAK_LEAVES: 15,
  GLASS: 16,
  DIAMOND_ORE: 17,
  CRAFTING_TABLE: 18,
  FURNACE: 19,
  FURNACE_LIT: 20,
  TORCH: 21,
  CHEST: 22,
  SNOW: 23,
  ICE: 24,
  CACTUS: 25,
  SANDSTONE: 26,
  TALL_GRASS: 27,
  DANDELION: 28,
  POPPY: 29,
  WHITE_WOOL: 30,
  BIRCH_LOG: 31,
  BIRCH_LEAVES: 32,
  BIRCH_PLANKS: 33,
  SPRUCE_LOG: 34,
  SPRUCE_LEAVES: 35,
  SPRUCE_PLANKS: 36,
  FARMLAND: 37,
  WHEAT: 38,
  STONE_BRICKS: 39,
  DEAD_BUSH: 40,
  BIRCH_SAPLING: 41,
  SPRUCE_SAPLING: 42,
} as const;

/** Face order used everywhere: +X (east), -X (west), +Y (top), -Y (bottom), +Z (south), -Z (north). */
export const FACE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const FACE_EAST = 0;
export const FACE_WEST = 1;
export const FACE_TOP = 2;
export const FACE_BOTTOM = 3;
export const FACE_SOUTH = 4;
export const FACE_NORTH = 5;

export function oppositeFace(face: number) {
  return face ^ 1;
}

export type Shape = 'none' | 'cube' | 'box' | 'cross' | 'torch' | 'liquid' | 'crop';
export type RenderLayer = 'opaque' | 'cutout' | 'translucent';
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword';
export type Tint = 'grass' | 'foliage' | 'birch' | 'spruce' | null;

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  shape: Shape;
  layer: RenderLayer;
  /** Has a collision box. */
  solid: boolean;
  /** Full opaque cube: hides neighbour faces and casts ambient occlusion. */
  opaque: boolean;
  lightOpacity: number;
  lightEmission: number;
  /** Seconds-ish Minecraft hardness; -1 = unbreakable. */
  hardness: number;
  tool: ToolType | null;
  /** Minimum tool tier to get drops: -1 none needed, 0 wood, 1 stone, 2 iron, 3 diamond. */
  harvestLevel: number;
  /** Can be replaced by placing another block into it (grass, water, snow). */
  replaceable: boolean;
  tint: Tint;
  slipperiness: number;
  /** Atlas tile per face (see FACE_* order). Facing blocks rotate their front via meta. */
  faces: number[];
  /** Block needs a block below it (plants, torches handled separately). */
  needsSupport: boolean;
  /** Whether it can be picked up as an item (and shows in creative). */
  hasItem: boolean;
  /** Front face set from the player's direction when placed (furnace, chest…). */
  facing: boolean;
  /** Bounds [x0, y0, z0, x1, y1, z1] of 'box' shaped blocks (cactus, chest, snow layer…). */
  box: readonly number[];
}

type BlockInit = Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'faces'>> & {
  name: string;
  /** One texture for all faces, or [side, top, bottom], or { side, top, bottom, front }. */
  tex: string | [string, string, string] | { side: string; top: string; bottom: string; front?: string };
};

export const BLOCKS: BlockDef[] = [];
const FULL_BOX = [0, 0, 0, 1, 1, 1] as const;
const px = (n: number) => n / 16;

function define(key: keyof typeof B, init: BlockInit) {
  const id = B[key];
  let side: string;
  let top: string;
  let bottom: string;
  let front: string | undefined;
  if (typeof init.tex === 'string') side = top = bottom = init.tex;
  else if (Array.isArray(init.tex)) [side, top, bottom] = init.tex;
  else ({ side, top, bottom, front } = init.tex);
  const faces = [tile(side), tile(side), tile(top), tile(bottom), tile(front ?? side), tile(side)];
  const shape = init.shape ?? 'cube';
  const opaque = init.opaque ?? shape === 'cube';
  BLOCKS[id] = {
    id,
    key: key.toLowerCase(),
    name: init.name,
    shape,
    layer: init.layer ?? 'opaque',
    solid: init.solid ?? (shape === 'cube' || shape === 'box'),
    opaque,
    lightOpacity: init.lightOpacity ?? (opaque ? 15 : 0),
    lightEmission: init.lightEmission ?? 0,
    hardness: init.hardness ?? 1,
    tool: init.tool ?? null,
    harvestLevel: init.harvestLevel ?? -1,
    replaceable: init.replaceable ?? false,
    tint: init.tint ?? null,
    slipperiness: init.slipperiness ?? 0.6,
    faces,
    needsSupport: init.needsSupport ?? false,
    hasItem: init.hasItem ?? true,
    facing: init.facing ?? false,
    box: init.box ?? FULL_BOX,
  };
}

const plant = { shape: 'cross', layer: 'cutout', hardness: 0, needsSupport: true } as const;
const leaves = { layer: 'cutout', opaque: false, lightOpacity: 1, hardness: 0.2, tool: 'hoe', solid: true } as const;

define('AIR', { name: 'Luft', tex: 'stone', shape: 'none', solid: false, opaque: false, hasItem: false, replaceable: true, hardness: 0 });
define('STONE', { name: 'Stein', tex: 'stone', hardness: 1.5, tool: 'pickaxe', harvestLevel: 0 });
define('GRASS', { name: 'Grasblock', tex: ['grass_side', 'grass_top', 'dirt'], hardness: 0.6, tool: 'shovel', tint: 'grass' });
define('DIRT', { name: 'Erde', tex: 'dirt', hardness: 0.5, tool: 'shovel' });
define('COBBLESTONE', { name: 'Bruchstein', tex: 'cobblestone', hardness: 2, tool: 'pickaxe', harvestLevel: 0 });
define('OAK_PLANKS', { name: 'Eichenholzbretter', tex: 'oak_planks', hardness: 2, tool: 'axe' });
define('OAK_SAPLING', { name: 'Eichensetzling', tex: 'oak_sapling', ...plant });
define('BEDROCK', { name: 'Grundgestein', tex: 'bedrock', hardness: -1 });
define('WATER', {
  name: 'Wasser',
  tex: 'water',
  shape: 'liquid',
  layer: 'translucent',
  solid: false,
  opaque: false,
  lightOpacity: 2,
  hardness: -1,
  replaceable: true,
  hasItem: false,
});
define('SAND', { name: 'Sand', tex: 'sand', hardness: 0.5, tool: 'shovel' });
define('GRAVEL', { name: 'Kies', tex: 'gravel', hardness: 0.6, tool: 'shovel' });
define('GOLD_ORE', { name: 'Golderz', tex: 'gold_ore', hardness: 3, tool: 'pickaxe', harvestLevel: 2 });
define('IRON_ORE', { name: 'Eisenerz', tex: 'iron_ore', hardness: 3, tool: 'pickaxe', harvestLevel: 1 });
define('COAL_ORE', { name: 'Steinkohle', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', harvestLevel: 0 });
define('OAK_LOG', { name: 'Eichenstamm', tex: ['oak_log', 'oak_log_top', 'oak_log_top'], hardness: 2, tool: 'axe' });
define('OAK_LEAVES', { name: 'Eichenlaub', tex: 'oak_leaves', tint: 'foliage', ...leaves });
define('GLASS', { name: 'Glas', tex: 'glass', layer: 'cutout', opaque: false, lightOpacity: 0, hardness: 0.3 });
define('DIAMOND_ORE', { name: 'Diamanterz', tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', harvestLevel: 2 });
define('CRAFTING_TABLE', {
  name: 'Werkbank',
  tex: { side: 'crafting_table_side', top: 'crafting_table_top', bottom: 'oak_planks', front: 'crafting_table_front' },
  hardness: 2.5,
  tool: 'axe',
  facing: true,
});
define('FURNACE', {
  name: 'Ofen',
  tex: { side: 'furnace_side', top: 'furnace_top', bottom: 'furnace_top', front: 'furnace_front' },
  hardness: 3.5,
  tool: 'pickaxe',
  harvestLevel: 0,
  facing: true,
});
define('FURNACE_LIT', {
  name: 'Ofen',
  tex: { side: 'furnace_side', top: 'furnace_top', bottom: 'furnace_top', front: 'furnace_front_lit' },
  hardness: 3.5,
  tool: 'pickaxe',
  harvestLevel: 0,
  facing: true,
  lightEmission: 13,
  hasItem: false,
});
define('TORCH', {
  name: 'Fackel',
  tex: 'torch',
  shape: 'torch',
  layer: 'cutout',
  solid: false,
  hardness: 0,
  lightEmission: 14,
});
define('CHEST', {
  name: 'Truhe',
  tex: { side: 'chest_side', top: 'chest_top', bottom: 'chest_top', front: 'chest_front' },
  hardness: 2.5,
  tool: 'axe',
  facing: true,
  shape: 'box',
  box: [px(1), 0, px(1), px(15), px(14), px(15)],
});
define('SNOW', {
  name: 'Schnee',
  tex: 'snow',
  shape: 'box',
  box: [0, 0, 0, 1, px(2), 1],
  solid: false,
  hardness: 0.1,
  tool: 'shovel',
  harvestLevel: 0,
  replaceable: true,
  needsSupport: true,
});
define('ICE', {
  name: 'Eis',
  tex: 'ice',
  layer: 'translucent',
  opaque: false,
  lightOpacity: 2,
  hardness: 0.5,
  tool: 'pickaxe',
  slipperiness: 0.98,
});
define('CACTUS', {
  name: 'Kaktus',
  tex: ['cactus_side', 'cactus_top', 'cactus_top'],
  shape: 'box',
  box: [px(1), 0, px(1), px(15), 1, px(15)],
  layer: 'cutout',
  hardness: 0.4,
  needsSupport: true,
});
define('SANDSTONE', { name: 'Sandstein', tex: ['sandstone_side', 'sandstone_top', 'sandstone_top'], hardness: 0.8, tool: 'pickaxe', harvestLevel: 0 });
define('TALL_GRASS', { name: 'Gras', tex: 'tall_grass', tint: 'grass', replaceable: true, hasItem: false, ...plant });
define('DANDELION', { name: 'Löwenzahn', tex: 'dandelion', ...plant });
define('POPPY', { name: 'Mohn', tex: 'poppy', ...plant });
define('WHITE_WOOL', { name: 'Weiße Wolle', tex: 'white_wool', hardness: 0.8 });
define('BIRCH_LOG', { name: 'Birkenstamm', tex: ['birch_log', 'birch_log_top', 'birch_log_top'], hardness: 2, tool: 'axe' });
define('BIRCH_LEAVES', { name: 'Birkenlaub', tex: 'birch_leaves', tint: 'birch', ...leaves });
define('BIRCH_PLANKS', { name: 'Birkenholzbretter', tex: 'birch_planks', hardness: 2, tool: 'axe' });
define('SPRUCE_LOG', { name: 'Fichtenstamm', tex: ['spruce_log', 'spruce_log_top', 'spruce_log_top'], hardness: 2, tool: 'axe' });
define('SPRUCE_LEAVES', { name: 'Fichtennadeln', tex: 'spruce_leaves', tint: 'spruce', ...leaves });
define('SPRUCE_PLANKS', { name: 'Fichtenholzbretter', tex: 'spruce_planks', hardness: 2, tool: 'axe' });
define('FARMLAND', {
  name: 'Ackerboden',
  tex: ['dirt', 'farmland', 'dirt'],
  shape: 'box',
  box: [0, 0, 0, 1, px(15), 1],
  lightOpacity: 15,
  hardness: 0.6,
  tool: 'shovel',
  hasItem: false,
});
define('WHEAT', { name: 'Weizen', tex: 'wheat_7', shape: 'crop', layer: 'cutout', hardness: 0, needsSupport: true, solid: false, hasItem: false });
define('STONE_BRICKS', { name: 'Steinziegel', tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', harvestLevel: 0 });
define('DEAD_BUSH', { name: 'Toter Busch', tex: 'dead_bush', replaceable: true, ...plant });
define('BIRCH_SAPLING', { name: 'Birkensetzling', tex: 'birch_sapling', ...plant });
define('SPRUCE_SAPLING', { name: 'Fichtensetzling', tex: 'spruce_sapling', ...plant });

export const BLOCK_COUNT = BLOCKS.length;

/** Fast lookup tables for hot loops (meshing, lighting, physics). */
export const IS_OPAQUE = new Uint8Array(256);
export const IS_SOLID = new Uint8Array(256);
export const LIGHT_OPACITY = new Uint8Array(256);
export const LIGHT_EMISSION = new Uint8Array(256);
for (const b of BLOCKS) {
  IS_OPAQUE[b.id] = b.opaque ? 1 : 0;
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  LIGHT_OPACITY[b.id] = b.lightOpacity;
  LIGHT_EMISSION[b.id] = b.lightEmission;
}

export function block(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[0];
}

export const WHEAT_TILES = Array.from({ length: 8 }, (_, i) => tile(`wheat_${i}`));
export const DESTROY_TILES = Array.from({ length: 10 }, (_, i) => tile(`destroy_${i}`));

const FAST_LEAVES: Record<number, number> = {
  [B.OAK_LEAVES]: tile('oak_leaves_opaque'),
  [B.BIRCH_LEAVES]: tile('birch_leaves_opaque'),
  [B.SPRUCE_LEAVES]: tile('spruce_leaves_opaque'),
};

/**
 * Atlas tile for a face of a block, honouring meta (front direction for facing blocks,
 * growth stage for wheat) and the snowy grass variant.
 */
export function faceTile(id: number, face: number, meta: number, snowAbove = false, fancyLeaves = true): number {
  const def = BLOCKS[id];
  if (id === B.WHEAT) return WHEAT_TILES[meta & 7];
  if (!fancyLeaves && FAST_LEAVES[id] !== undefined) return FAST_LEAVES[id];
  if (def.facing && face !== 2 && face !== 3) {
    // faces[4] holds the front texture; meta stores which face is the front.
    return face === (meta & 7) ? def.faces[4] : def.faces[0];
  }
  if (id === B.GRASS && snowAbove && face !== 2 && face !== 3) return tile('grass_side_snowy');
  return def.faces[face];
}

export function isLeaves(id: number) {
  return id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES;
}

export function isLog(id: number) {
  return id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG;
}

export function isSapling(id: number) {
  return id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING;
}

export function isPlant(id: number) {
  const s = BLOCKS[id]?.shape;
  return s === 'cross' || s === 'crop';
}

/** Blocks plants can grow on. */
export function isSoil(id: number) {
  return id === B.GRASS || id === B.DIRT || id === B.FARMLAND;
}
