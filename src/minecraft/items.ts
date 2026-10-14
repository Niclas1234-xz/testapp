import { B, BLOCKS, type ToolType } from './blocks';
import { tile } from './textures/atlas';

/** Item ids below 256 are block items (same id as the block); real items start at 256. */
export const I = {
  STICK: 256,
  COAL: 257,
  CHARCOAL: 258,
  IRON_INGOT: 259,
  GOLD_INGOT: 260,
  DIAMOND: 261,
  APPLE: 262,
  PORKCHOP: 263,
  COOKED_PORKCHOP: 264,
  BEEF: 265,
  COOKED_BEEF: 266,
  MUTTON: 267,
  COOKED_MUTTON: 268,
  ROTTEN_FLESH: 269,
  BREAD: 270,
  WHEAT: 271,
  WHEAT_SEEDS: 272,
  FLINT: 273,
  GUNPOWDER: 274,
  LEATHER: 275,
  BUCKET: 276,
  WATER_BUCKET: 277,
  // Tools: 300 + tier * 5 + kind
} as const;

export const TOOL_TIERS = ['wooden', 'stone', 'iron', 'golden', 'diamond'] as const;
export const TOOL_KINDS = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'] as const;
export type ToolTier = (typeof TOOL_TIERS)[number];
export type ToolKind = (typeof TOOL_KINDS)[number];

export const ARMOR_TIERS = ['leather', 'iron', 'golden', 'diamond'] as const;
export const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export type ArmorTier = (typeof ARMOR_TIERS)[number];
export type ArmorPiece = (typeof ARMOR_PIECES)[number];

export function armorId(tier: ArmorTier, piece: ArmorPiece) {
  return 340 + ARMOR_TIERS.indexOf(tier) * 4 + ARMOR_PIECES.indexOf(piece);
}

/** Armor points per piece (helmet, chestplate, leggings, boots) and durability multiplier, as in Minecraft. */
const ARMOR_STATS: Record<ArmorTier, { points: number[]; durability: number; names: string[] }> = {
  leather: { points: [1, 3, 2, 1], durability: 5, names: ['Lederkappe', 'Lederjacke', 'Lederhose', 'Lederstiefel'] },
  iron: { points: [2, 6, 5, 2], durability: 15, names: ['Eisenhelm', 'Eisenharnisch', 'Eisenbeinschutz', 'Eisenstiefel'] },
  golden: { points: [2, 5, 3, 1], durability: 7, names: ['Goldhelm', 'Goldharnisch', 'Goldbeinschutz', 'Goldstiefel'] },
  diamond: { points: [3, 8, 6, 3], durability: 33, names: ['Diamanthelm', 'Diamantharnisch', 'Diamantbeinschutz', 'Diamantstiefel'] },
};
const ARMOR_BASE_DURABILITY = [11, 16, 15, 13];

export function toolId(tier: ToolTier, kind: ToolKind) {
  return 300 + TOOL_TIERS.indexOf(tier) * 5 + TOOL_KINDS.indexOf(kind);
}

const TIER_STATS: Record<ToolTier, { level: number; speed: number; durability: number; damage: number; name: string }> = {
  wooden: { level: 0, speed: 2, durability: 59, damage: 0, name: 'Holz' },
  stone: { level: 1, speed: 4, durability: 131, damage: 1, name: 'Stein' },
  iron: { level: 2, speed: 6, durability: 250, damage: 2, name: 'Eisen' },
  golden: { level: 0, speed: 12, durability: 32, damage: 0, name: 'Gold' },
  diamond: { level: 3, speed: 8, durability: 1561, damage: 3, name: 'Diamant' },
};

const KIND_INFO: Record<ToolKind, { name: string; baseDamage: number }> = {
  pickaxe: { name: 'spitzhacke', baseDamage: 2 },
  axe: { name: 'axt', baseDamage: 3 },
  shovel: { name: 'schaufel', baseDamage: 1 },
  sword: { name: 'schwert', baseDamage: 4 },
  hoe: { name: 'hacke', baseDamage: 1 },
};

export interface ToolInfo {
  type: ToolType;
  tier: ToolTier;
  level: number;
  speed: number;
  durability: number;
  damage: number;
}

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  maxStack: number;
  /** Atlas tile used for the flat icon / 3D item sprite. */
  texture: number;
  /** Block this item places, if any. */
  places?: number;
  /** Rendered as a little cube (icons, held item, drops). */
  cubeIcon: boolean;
  tool?: ToolInfo;
  food?: { hunger: number; saturation: number };
  /** Burn time in a furnace, in ticks. */
  fuel?: number;
  /** slot: 0 helmet, 1 chestplate, 2 leggings, 3 boots */
  armor?: { slot: number; points: number; durability: number };
}

export const ITEMS = new Map<number, ItemDef>();

function addItem(def: Omit<ItemDef, 'cubeIcon' | 'maxStack'> & Partial<Pick<ItemDef, 'cubeIcon' | 'maxStack'>>) {
  ITEMS.set(def.id, { maxStack: 64, cubeIcon: false, ...def });
}

const FLAT_BLOCK_ICONS = new Set<number>([
  B.OAK_SAPLING,
  B.BIRCH_SAPLING,
  B.SPRUCE_SAPLING,
  B.TORCH,
  B.TALL_GRASS,
  B.DANDELION,
  B.POPPY,
  B.DEAD_BUSH,
  B.OAK_DOOR,
  B.LADDER,
]);

const BLOCK_FUEL: Partial<Record<number, number>> = {
  [B.OAK_PLANKS]: 300,
  [B.BIRCH_PLANKS]: 300,
  [B.SPRUCE_PLANKS]: 300,
  [B.OAK_LOG]: 300,
  [B.BIRCH_LOG]: 300,
  [B.SPRUCE_LOG]: 300,
  [B.CRAFTING_TABLE]: 300,
  [B.CHEST]: 300,
  [B.OAK_SAPLING]: 100,
  [B.BIRCH_SAPLING]: 100,
  [B.SPRUCE_SAPLING]: 100,
  [B.OAK_DOOR]: 200,
  [B.LADDER]: 300,
};

for (const b of BLOCKS) {
  if (!b.hasItem) continue;
  addItem({
    id: b.id,
    key: b.key,
    name: b.name,
    texture: b.id === B.OAK_DOOR ? tile('door_item') : b.faces[FLAT_BLOCK_ICONS.has(b.id) ? 0 : 2],
    places: b.id,
    cubeIcon: !FLAT_BLOCK_ICONS.has(b.id),
    fuel: BLOCK_FUEL[b.id],
  });
}

addItem({ id: I.STICK, key: 'stick', name: 'Stock', texture: tile('stick'), fuel: 100 });
addItem({ id: I.COAL, key: 'coal', name: 'Kohle', texture: tile('coal'), fuel: 1600 });
addItem({ id: I.CHARCOAL, key: 'charcoal', name: 'Holzkohle', texture: tile('charcoal'), fuel: 1600 });
addItem({ id: I.IRON_INGOT, key: 'iron_ingot', name: 'Eisenbarren', texture: tile('iron_ingot') });
addItem({ id: I.GOLD_INGOT, key: 'gold_ingot', name: 'Goldbarren', texture: tile('gold_ingot') });
addItem({ id: I.DIAMOND, key: 'diamond', name: 'Diamant', texture: tile('diamond') });
addItem({ id: I.APPLE, key: 'apple', name: 'Apfel', texture: tile('apple'), food: { hunger: 4, saturation: 2.4 } });
addItem({ id: I.PORKCHOP, key: 'porkchop', name: 'Rohes Schweinefleisch', texture: tile('porkchop'), food: { hunger: 3, saturation: 1.8 } });
addItem({ id: I.COOKED_PORKCHOP, key: 'cooked_porkchop', name: 'Gebratenes Schweinefleisch', texture: tile('cooked_porkchop'), food: { hunger: 8, saturation: 12.8 } });
addItem({ id: I.BEEF, key: 'beef', name: 'Rohes Rindfleisch', texture: tile('beef'), food: { hunger: 3, saturation: 1.8 } });
addItem({ id: I.COOKED_BEEF, key: 'cooked_beef', name: 'Steak', texture: tile('cooked_beef'), food: { hunger: 8, saturation: 12.8 } });
addItem({ id: I.MUTTON, key: 'mutton', name: 'Rohes Hammelfleisch', texture: tile('mutton'), food: { hunger: 2, saturation: 1.2 } });
addItem({ id: I.COOKED_MUTTON, key: 'cooked_mutton', name: 'Gebratenes Hammelfleisch', texture: tile('cooked_mutton'), food: { hunger: 6, saturation: 9.6 } });
addItem({ id: I.ROTTEN_FLESH, key: 'rotten_flesh', name: 'Verrottetes Fleisch', texture: tile('rotten_flesh'), food: { hunger: 4, saturation: 0.8 } });
addItem({ id: I.BREAD, key: 'bread', name: 'Brot', texture: tile('bread'), food: { hunger: 5, saturation: 6 } });
addItem({ id: I.WHEAT, key: 'wheat', name: 'Weizen', texture: tile('wheat') });
addItem({ id: I.WHEAT_SEEDS, key: 'wheat_seeds', name: 'Weizenkörner', texture: tile('wheat_seeds'), places: B.WHEAT });
addItem({ id: I.FLINT, key: 'flint', name: 'Feuerstein', texture: tile('flint') });
addItem({ id: I.GUNPOWDER, key: 'gunpowder', name: 'Schwarzpulver', texture: tile('gunpowder') });
addItem({ id: I.LEATHER, key: 'leather', name: 'Leder', texture: tile('leather') });
addItem({ id: I.BUCKET, key: 'bucket', name: 'Eimer', texture: tile('bucket'), maxStack: 16 });
addItem({ id: I.WATER_BUCKET, key: 'water_bucket', name: 'Wassereimer', texture: tile('water_bucket'), maxStack: 1 });

for (const tier of ARMOR_TIERS) {
  ARMOR_PIECES.forEach((piece, slot) => {
    const stats = ARMOR_STATS[tier];
    addItem({
      id: armorId(tier, piece),
      key: `${tier}_${piece}`,
      name: stats.names[slot],
      texture: tile(`${tier}_${piece}`),
      maxStack: 1,
      armor: { slot, points: stats.points[slot], durability: ARMOR_BASE_DURABILITY[slot] * stats.durability },
    });
  });
}

for (const tier of TOOL_TIERS) {
  for (const kind of TOOL_KINDS) {
    const stats = TIER_STATS[tier];
    const info = KIND_INFO[kind];
    addItem({
      id: toolId(tier, kind),
      key: `${tier}_${kind}`,
      name: `${stats.name}${info.name}`,
      texture: tile(`${tier}_${kind}`),
      maxStack: 1,
      fuel: tier === 'wooden' ? 200 : undefined,
      tool: {
        type: kind,
        tier,
        level: stats.level,
        speed: stats.speed,
        durability: stats.durability,
        damage: info.baseDamage + stats.damage,
      },
    });
  }
}

export function item(id: number): ItemDef | undefined {
  return ITEMS.get(id);
}

export function itemName(id: number) {
  return ITEMS.get(id)?.name ?? '?';
}

export function maxStack(id: number) {
  return ITEMS.get(id)?.maxStack ?? 64;
}

/** Items shown in the creative inventory, in display order. */
export function creativeItems(): number[] {
  const blocks = [...ITEMS.values()].filter((d) => d.id < 256).map((d) => d.id);
  const items = [...ITEMS.values()].filter((d) => d.id >= 256).map((d) => d.id);
  return [...blocks, ...items];
}
