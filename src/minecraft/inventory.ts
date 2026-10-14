import { item, maxStack } from './items';

export interface ItemStack {
  id: number;
  count: number;
  /** Used durability (tools only). */
  damage: number;
}

export type Slot = ItemStack | null;

export function stack(id: number, count = 1, damage = 0): ItemStack {
  return { id, count, damage };
}

export function cloneStack(s: Slot): Slot {
  return s ? { ...s } : null;
}

export function canMerge(a: ItemStack, b: ItemStack) {
  return a.id === b.id && a.damage === b.damage && maxStack(a.id) > 1;
}

/** Player inventory: slots 0–8 are the hotbar, 9–35 the main inventory. */
export class Inventory {
  slots: Slot[];

  constructor(size: number) {
    this.slots = new Array<Slot>(size).fill(null);
  }

  /** Adds as much as fits (existing stacks first, then hotbar, then main). Returns the leftover count. */
  add(s: ItemStack): number {
    let left = s.count;
    const max = maxStack(s.id);
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const slot = this.slots[i];
      if (slot && canMerge(slot, s) && slot.count < max) {
        const n = Math.min(left, max - slot.count);
        slot.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, max);
        this.slots[i] = { id: s.id, count: n, damage: s.damage };
        left -= n;
      }
    }
    return left;
  }

  count(id: number) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  clear() {
    this.slots.fill(null);
  }
}

/**
 * Minecraft-style slot click. Left click picks up / places / merges / swaps whole stacks;
 * right click picks up half or places a single item. Returns the new cursor stack.
 */
export function clickSlot(slots: Slot[], index: number, cursor: Slot, right: boolean): Slot {
  const slot = slots[index];
  if (!cursor) {
    if (!slot) return null;
    if (right) {
      const take = Math.ceil(slot.count / 2);
      slot.count -= take;
      if (slot.count <= 0) slots[index] = null;
      return { ...slot, count: take };
    }
    slots[index] = null;
    return slot;
  }
  const max = maxStack(cursor.id);
  if (!slot) {
    if (right) {
      slots[index] = { ...cursor, count: 1 };
      return cursor.count > 1 ? { ...cursor, count: cursor.count - 1 } : null;
    }
    slots[index] = cursor;
    return null;
  }
  if (canMerge(slot, cursor)) {
    if (slot.count >= max) return cursor;
    const n = right ? 1 : Math.min(cursor.count, max - slot.count);
    slot.count += n;
    const rest = cursor.count - n;
    return rest > 0 ? { ...cursor, count: rest } : null;
  }
  slots[index] = cursor;
  return slot;
}

/** Taking from an output slot (crafting result, furnace output): never places items. */
export function takeOutput(output: ItemStack, cursor: Slot): { cursor: Slot; taken: boolean } {
  if (!cursor) return { cursor: { ...output }, taken: true };
  if (canMerge(cursor, output) && cursor.count + output.count <= maxStack(cursor.id)) {
    return { cursor: { ...cursor, count: cursor.count + output.count }, taken: true };
  }
  return { cursor, taken: false };
}

export function durabilityOf(s: ItemStack) {
  return item(s.id)?.tool?.durability ?? 0;
}
