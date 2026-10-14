import { B } from './blocks';
import { I, item, toolId, type ToolTier } from './items';
import type { ItemStack, Slot } from './inventory';

type Ingredient = number | readonly number[];

const PLANKS = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS] as const;
const COALS = [I.COAL, I.CHARCOAL] as const;

interface ShapedRecipe {
  kind: 'shaped';
  pattern: string[];
  keys: Record<string, Ingredient>;
  result: ItemStack;
}

interface ShapelessRecipe {
  kind: 'shapeless';
  ingredients: Ingredient[];
  result: ItemStack;
}

type Recipe = ShapedRecipe | ShapelessRecipe;

const RECIPES: Recipe[] = [];

function shaped(pattern: string[], keys: Record<string, Ingredient>, id: number, count = 1) {
  RECIPES.push({ kind: 'shaped', pattern, keys, result: { id, count, damage: 0 } });
}

function shapeless(ingredients: Ingredient[], id: number, count = 1) {
  RECIPES.push({ kind: 'shapeless', ingredients, result: { id, count, damage: 0 } });
}

shapeless([B.OAK_LOG], B.OAK_PLANKS, 4);
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['#', '#'], { '#': PLANKS }, I.STICK, 4);
shaped(['##', '##'], { '#': PLANKS }, B.CRAFTING_TABLE);
shaped(['###', '# #', '###'], { '#': B.COBBLESTONE }, B.FURNACE);
shaped(['###', '# #', '###'], { '#': PLANKS }, B.CHEST);
shaped(['c', 's'], { c: COALS, s: I.STICK }, B.TORCH, 4);
shaped(['###'], { '#': I.WHEAT }, I.BREAD);
shaped(['##', '##'], { '#': B.SAND }, B.SANDSTONE);
shaped(['##', '##'], { '#': B.STONE }, B.STONE_BRICKS, 4);
shaped(['# #', ' # '], { '#': I.IRON_INGOT }, I.BUCKET);
shaped(['WWW', 'PPP'], { W: B.WHITE_WOOL, P: PLANKS }, B.BED);

const TOOL_MATERIAL: Record<ToolTier, Ingredient> = {
  wooden: PLANKS,
  stone: B.COBBLESTONE,
  iron: I.IRON_INGOT,
  golden: I.GOLD_INGOT,
  diamond: I.DIAMOND,
};

for (const [tier, material] of Object.entries(TOOL_MATERIAL) as [ToolTier, Ingredient][]) {
  const keys = { M: material, S: I.STICK };
  shaped(['MMM', ' S ', ' S '], keys, toolId(tier, 'pickaxe'));
  shaped(['MM', 'MS', ' S'], keys, toolId(tier, 'axe'));
  shaped(['M', 'S', 'S'], keys, toolId(tier, 'shovel'));
  shaped(['M', 'M', 'S'], keys, toolId(tier, 'sword'));
  shaped(['MM', ' S', ' S'], keys, toolId(tier, 'hoe'));
}

function matches(ing: Ingredient | undefined, s: Slot) {
  if (ing === undefined) return s === null;
  if (!s) return false;
  return typeof ing === 'number' ? s.id === ing : ing.includes(s.id);
}

/** Finds the crafting result for a square grid (size 2 or 3). */
export function findRecipe(grid: Slot[], size: number): ItemStack | null {
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  const filled: ItemStack[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const s = grid[y * size + x];
      if (!s) continue;
      filled.push(s);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (filled.length === 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const at = (x: number, y: number) => grid[(minY + y) * size + minX + x];

  for (const r of RECIPES) {
    if (r.kind === 'shapeless') {
      if (r.ingredients.length !== filled.length) continue;
      const left = [...filled];
      const ok = r.ingredients.every((ing) => {
        const i = left.findIndex((s) => matches(ing, s));
        if (i < 0) return false;
        left.splice(i, 1);
        return true;
      });
      if (ok) return { ...r.result };
      continue;
    }
    const ph = r.pattern.length;
    const pw = Math.max(...r.pattern.map((row) => row.length));
    if (pw !== w || ph !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++)
        for (let x = 0; x < w && ok; x++) {
          const ch = r.pattern[y][mirror ? w - 1 - x : x] ?? ' ';
          const ing = ch === ' ' ? undefined : r.keys[ch];
          if (!matches(ing, at(x, y))) ok = false;
        }
      if (ok) return { ...r.result };
    }
  }
  return null;
}

/** Removes one item from every filled crafting slot (after taking the result). */
export function consumeIngredients(grid: Slot[]) {
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    s.count -= 1;
    if (s.count <= 0) grid[i] = null;
  }
}

const SMELTING: Record<number, number> = {
  [B.IRON_ORE]: I.IRON_INGOT,
  [B.GOLD_ORE]: I.GOLD_INGOT,
  [B.SAND]: B.GLASS,
  [B.COBBLESTONE]: B.STONE,
  [B.OAK_LOG]: I.CHARCOAL,
  [B.BIRCH_LOG]: I.CHARCOAL,
  [B.SPRUCE_LOG]: I.CHARCOAL,
  [I.PORKCHOP]: I.COOKED_PORKCHOP,
  [I.BEEF]: I.COOKED_BEEF,
  [I.MUTTON]: I.COOKED_MUTTON,
  [B.COAL_ORE]: I.COAL,
  [B.DIAMOND_ORE]: I.DIAMOND,
};

export function smeltResult(id: number): number | null {
  return SMELTING[id] ?? null;
}

export function fuelTicks(id: number): number {
  return item(id)?.fuel ?? 0;
}

/** Ticks to smelt one item. */
export const SMELT_TIME = 200;
