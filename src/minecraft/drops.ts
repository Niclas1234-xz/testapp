import { B, block } from './blocks';
import { I, item } from './items';
import type { ItemStack } from './inventory';
import type { Rng } from './rng';

/** Whether the held item can harvest a block (otherwise it drops nothing, e.g. stone by hand). */
export function canHarvest(blockId: number, tool: ItemStack | null): boolean {
  const def = block(blockId);
  if (def.harvestLevel < 0) return true;
  const info = tool ? item(tool.id)?.tool : undefined;
  return !!info && info.type === def.tool && info.level >= def.harvestLevel;
}

/** Items dropped when a block is broken (survival). */
export function blockDrops(id: number, meta: number, tool: ItemStack | null, rng: Rng, ignoreTool = false): ItemStack[] {
  if (!ignoreTool && !canHarvest(id, tool)) return [];
  const one = (itemId: number, count = 1): ItemStack[] => (count > 0 ? [{ id: itemId, count, damage: 0 }] : []);
  switch (id) {
    case B.STONE:
      return one(B.COBBLESTONE);
    case B.GRASS:
    case B.FARMLAND:
      return one(B.DIRT);
    case B.COAL_ORE:
      return one(I.COAL);
    case B.DIAMOND_ORE:
      return one(I.DIAMOND);
    case B.GRAVEL:
      return rng() < 0.1 ? one(I.FLINT) : one(B.GRAVEL);
    case B.OAK_LEAVES:
    case B.BIRCH_LEAVES:
    case B.SPRUCE_LEAVES:
      return leafDrops(id, rng);
    case B.TALL_GRASS:
      return rng() < 0.125 ? one(I.WHEAT_SEEDS) : [];
    case B.GLASS:
    case B.ICE:
    case B.SNOW:
    case B.WATER:
    case B.AIR:
    case B.BEDROCK:
      return [];
    case B.FURNACE_LIT:
      return one(B.FURNACE);
    case B.DEAD_BUSH:
      return one(I.STICK, Math.floor(rng() * 3));
    case B.WHEAT: {
      if ((meta & 7) < 7) return one(I.WHEAT_SEEDS);
      let seeds = 1;
      for (let i = 0; i < 3; i++) if (rng() < 0.57) seeds++;
      return [...one(I.WHEAT), ...one(I.WHEAT_SEEDS, seeds)];
    }
    default:
      return block(id).hasItem ? one(id) : [];
  }
}

/** Leaves drop saplings (5 %) and oak leaves sometimes apples (0.5 %). */
export function leafDrops(id: number, rng: Rng): ItemStack[] {
  const out: ItemStack[] = [];
  const sapling = id === B.BIRCH_LEAVES ? B.BIRCH_SAPLING : id === B.SPRUCE_LEAVES ? B.SPRUCE_SAPLING : B.OAK_SAPLING;
  if (rng() < 0.05) out.push({ id: sapling, count: 1, damage: 0 });
  if (id === B.OAK_LEAVES && rng() < 0.005) out.push({ id: I.APPLE, count: 1, damage: 0 });
  return out;
}
