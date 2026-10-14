import { B } from '../blocks';
import { randInt, type Rng } from '../rng';

export type TreeKind = 'oak' | 'birch' | 'spruce';

/** Writes one block of a tree; `force` is used for the trunk (may replace leaves). */
export type TreeSetter = (x: number, y: number, z: number, id: number, force: boolean) => void;

/** Minecraft-style tree shapes, shared by world generation and sapling growth. */
export function buildTree(kind: TreeKind, x: number, y: number, z: number, rng: Rng, set: TreeSetter) {
  if (kind === 'spruce') {
    const height = 7 + randInt(rng, 0, 3);
    const radii = [0, 1, 1, 2, 1, 2, 2, 1, 2, 2];
    for (let i = 0; i <= height - 2; i++) {
      const yy = y + height - i;
      const r = Math.min(radii[i] ?? 2, 2);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue;
          set(x + dx, yy, z + dz, B.SPRUCE_LEAVES, false);
        }
    }
    set(x, y + height + 1, z, B.SPRUCE_LEAVES, false);
    for (let i = 0; i < height; i++) set(x, y + i, z, B.SPRUCE_LOG, true);
    set(x, y - 1, z, B.DIRT, true);
    return;
  }
  const birch = kind === 'birch';
  const height = (birch ? 5 : 4) + randInt(rng, 0, 2);
  const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
  const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
  for (let yy = y + height - 3; yy <= y + height; yy++) {
    const k = yy - (y + height);
    const r = 1 - Math.trunc(k / 2);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (rng() < 0.5 || k === 0)) continue;
        set(x + dx, yy, z + dz, leaves, false);
      }
  }
  for (let i = 0; i < height; i++) set(x, y + i, z, log, true);
  set(x, y - 1, z, B.DIRT, true);
}

/** Height of the trunk including leaves on top, used for space checks. */
export function maxTreeHeight(kind: TreeKind) {
  return kind === 'spruce' ? 12 : 8;
}
