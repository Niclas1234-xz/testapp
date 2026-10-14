import { B, BLOCKS, FACE_DIRS } from '../blocks';
import type { World } from '../world/world';

/** Axis-aligned bounding box as [minX, minY, minZ, maxX, maxY, maxZ]. */
export type Box = [number, number, number, number, number, number];

/** Collision boxes of all solid blocks intersecting the box, flattened (6 numbers each). */
export function collisionBoxes(world: World, b: Box, out: number[]) {
  out.length = 0;
  const x0 = Math.floor(b[0]);
  const y0 = Math.floor(b[1]) - 1;
  const z0 = Math.floor(b[2]);
  const x1 = Math.floor(b[3]);
  const y1 = Math.floor(b[4]);
  const z1 = Math.floor(b[5]);
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      // Unloaded chunks act as solid walls so nothing falls out of the world.
      if (!world.isLoaded(x, z)) {
        out.push(x, y0, z, x + 1, y1 + 1, z + 1);
        continue;
      }
      for (let y = y0; y <= y1; y++) {
        if (y < 0) {
          continue;
        }
        const id = world.getBlock(x, y, z);
        const def = BLOCKS[id];
        if (!def.solid) continue;
        const bb = def.box;
        out.push(x + bb[0], y + bb[1], z + bb[2], x + bb[3], y + bb[4], z + bb[5]);
      }
    }
  return out;
}

function clipY(boxes: number[], b: Box, dy: number) {
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 3] <= b[0] || boxes[i] >= b[3] || boxes[i + 5] <= b[2] || boxes[i + 2] >= b[5]) continue;
    if (dy > 0 && b[4] <= boxes[i + 1]) dy = Math.min(dy, boxes[i + 1] - b[4]);
    else if (dy < 0 && b[1] >= boxes[i + 4]) dy = Math.max(dy, boxes[i + 4] - b[1]);
  }
  return dy;
}

function clipX(boxes: number[], b: Box, dx: number) {
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 4] <= b[1] || boxes[i + 1] >= b[4] || boxes[i + 5] <= b[2] || boxes[i + 2] >= b[5]) continue;
    if (dx > 0 && b[3] <= boxes[i]) dx = Math.min(dx, boxes[i] - b[3]);
    else if (dx < 0 && b[0] >= boxes[i + 3]) dx = Math.max(dx, boxes[i + 3] - b[0]);
  }
  return dx;
}

function clipZ(boxes: number[], b: Box, dz: number) {
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 3] <= b[0] || boxes[i] >= b[3] || boxes[i + 4] <= b[1] || boxes[i + 1] >= b[4]) continue;
    if (dz > 0 && b[5] <= boxes[i + 2]) dz = Math.min(dz, boxes[i + 2] - b[5]);
    else if (dz < 0 && b[2] >= boxes[i + 5]) dz = Math.max(dz, boxes[i + 5] - b[2]);
  }
  return dz;
}

function offset(b: Box, dx: number, dy: number, dz: number) {
  b[0] += dx;
  b[1] += dy;
  b[2] += dz;
  b[3] += dx;
  b[4] += dy;
  b[5] += dz;
}

const scratch: number[] = [];

/** Base class with Minecraft's collision/movement code (moveEntity). Units: blocks, ticks. */
export class Entity {
  x = 0;
  y = 0;
  z = 0;
  prevX = 0;
  prevY = 0;
  prevZ = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  prevYaw = 0;
  prevPitch = 0;
  onGround = false;
  collidedH = false;
  inWater = false;
  fallDistance = 0;
  stepHeight = 0.6;
  age = 0;
  dead = false;

  constructor(
    public width: number,
    public height: number
  ) {}

  box(): Box {
    const h = this.width / 2;
    return [this.x - h, this.y, this.z - h, this.x + h, this.y + this.height, this.z + h];
  }

  setPos(x: number, y: number, z: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.z = this.prevZ = z;
  }

  savePrev() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
  }

  /** Called when landing with the fall distance (for fall damage). */
  protected onLand(_distance: number) {}

  /** Minecraft moveEntity: clip Y, X, Z against block boxes, with auto step-up and sneak edge protection. */
  move(world: World, dx: number, dy: number, dz: number, sneaking = false) {
    let b = this.box();
    if (sneaking && this.onGround) {
      const step = 0.05;
      const free = (ox: number, oz: number) => {
        const t: Box = [b[0] + ox, b[1] - 1, b[2] + oz, b[3] + ox, b[4] - 1, b[5] + oz];
        collisionBoxes(world, t, scratch);
        for (let i = 0; i < scratch.length; i += 6) {
          if (scratch[i + 3] > t[0] && scratch[i] < t[3] && scratch[i + 4] > t[1] && scratch[i + 1] < t[4] && scratch[i + 5] > t[2] && scratch[i + 2] < t[5])
            return false;
        }
        return true;
      };
      while (dx !== 0 && free(dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      while (dz !== 0 && free(0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      while (dx !== 0 && dz !== 0 && free(dx, dz)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
    }
    const ox = dx;
    const oy = dy;
    const oz = dz;
    const expanded: Box = [
      Math.min(b[0], b[0] + dx),
      Math.min(b[1], b[1] + dy),
      Math.min(b[2], b[2] + dz),
      Math.max(b[3], b[3] + dx),
      Math.max(b[4], b[4] + dy),
      Math.max(b[5], b[5] + dz),
    ];
    const boxes = collisionBoxes(world, expanded, []);
    const start: Box = [...b];
    dy = clipY(boxes, b, dy);
    offset(b, 0, dy, 0);
    dx = clipX(boxes, b, dx);
    offset(b, dx, 0, 0);
    dz = clipZ(boxes, b, dz);
    offset(b, 0, 0, dz);

    const wasOnGround = this.onGround || (oy !== dy && oy < 0);
    if (this.stepHeight > 0 && wasOnGround && (ox !== dx || oz !== dz)) {
      const sb: Box = [...start];
      const stepBoxes = collisionBoxes(
        world,
        [
          Math.min(sb[0], sb[0] + ox),
          sb[1],
          Math.min(sb[2], sb[2] + oz),
          Math.max(sb[3], sb[3] + ox),
          sb[4] + this.stepHeight,
          Math.max(sb[5], sb[5] + oz),
        ],
        []
      );
      let sy = clipY(stepBoxes, sb, this.stepHeight);
      offset(sb, 0, sy, 0);
      const sx = clipX(stepBoxes, sb, ox);
      offset(sb, sx, 0, 0);
      const sz = clipZ(stepBoxes, sb, oz);
      offset(sb, 0, 0, sz);
      const down = clipY(stepBoxes, sb, -sy);
      offset(sb, 0, down, 0);
      sy += down;
      if (sx * sx + sz * sz > dx * dx + dz * dz) {
        b = sb;
        dx = sx;
        dz = sz;
        dy = sy;
      }
    }

    this.x = (b[0] + b[3]) / 2;
    this.y = b[1];
    this.z = (b[2] + b[5]) / 2;
    this.collidedH = ox !== dx || oz !== dz;
    const landed = oy !== dy && oy < 0;
    if (ox !== dx) this.vx = 0;
    if (oz !== dz) this.vz = 0;
    if (oy !== dy) this.vy = 0;
    if (landed) {
      if (this.fallDistance > 0) this.onLand(this.fallDistance);
      this.fallDistance = 0;
    } else if (dy < 0) this.fallDistance -= dy;
    this.onGround = landed;
  }

  /** Updates inWater (box contracted like Minecraft) and resets fall distance in water. */
  updateWater(world: World) {
    const b = this.box();
    const x0 = Math.floor(b[0] + 0.001);
    const x1 = Math.floor(b[3] - 0.001);
    const y0 = Math.floor(b[1] + 0.4);
    const y1 = Math.floor(b[4] - 0.4);
    const z0 = Math.floor(b[2] + 0.001);
    const z1 = Math.floor(b[5] - 0.001);
    let water = false;
    for (let x = x0; x <= x1 && !water; x++)
      for (let y = y0; y <= y1 && !water; y++)
        for (let z = z0; z <= z1 && !water; z++) if (world.getBlock(x, y, z) === B.WATER) water = true;
    this.inWater = water;
    if (water) this.fallDistance = 0;
  }

  /** Whether the point is inside a water block below its surface. */
  static pointInWater(world: World, x: number, y: number, z: number) {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    if (world.getBlock(bx, by, bz) !== B.WATER) return false;
    if (world.getBlock(bx, by + 1, bz) === B.WATER) return true;
    const m = world.getMeta(bx, by, bz);
    const level = m >= 8 ? 0 : m;
    return y < by + 1 - (level + 1) / 9 + 0.1;
  }

  /** Accelerate in the facing direction (Minecraft moveFlying / moveRelative). */
  moveRelative(strafe: number, forward: number, accel: number) {
    let d = strafe * strafe + forward * forward;
    if (d < 1e-4) return;
    d = Math.sqrt(d);
    if (d < 1) d = 1;
    d = accel / d;
    strafe *= d;
    forward *= d;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // yaw 0 faces +Z; strafe positive = to the left (west when facing south), like Minecraft.
    this.vx += strafe * c - forward * s;
    this.vz += forward * c + strafe * s;
  }

  distanceTo(e: { x: number; y: number; z: number }) {
    return Math.hypot(this.x - e.x, this.y - e.y, this.z - e.z);
  }
}

/** Ray hit against blocks. */
export interface BlockHit {
  x: number;
  y: number;
  z: number;
  face: number;
  /** Hit point. */
  px: number;
  py: number;
  pz: number;
  distance: number;
}

/** Selection box of a block in block-local coordinates (null = not targetable). */
export function selectionBox(world: World, x: number, y: number, z: number, id: number, liquids: boolean): readonly number[] | null {
  const def = BLOCKS[id];
  switch (def.shape) {
    case 'none':
      return null;
    case 'liquid':
      if (!liquids || world.getMeta(x, y, z) !== 0) return null;
      return [0, 0, 0, 1, 8 / 9, 1];
    case 'cross':
      return id === B.TALL_GRASS || id === B.DEAD_BUSH ? [0.1, 0, 0.1, 0.9, 0.8, 0.9] : [0.3, 0, 0.3, 0.7, 0.6, 0.7];
    case 'crop':
      return [0, 0, 0, 1, 0.125 + (world.getMeta(x, y, z) & 7) * 0.11, 1];
    case 'torch': {
      const m = world.getMeta(x, y, z) % 6;
      if (m === 3 || m === 2) return [0.4, 0, 0.4, 0.6, 0.6, 0.6];
      const [dx, , dz] = FACE_DIRS[m];
      const cx = 0.5 + dx * 0.35;
      const cz = 0.5 + dz * 0.35;
      return [cx - 0.15, 0.2, cz - 0.15, cx + 0.15, 0.8, cz + 0.15];
    }
    default:
      return def.box;
  }
}

/** Ray vs. box (slab method). Returns [t, face] or null. */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: readonly number[]
): [number, number] | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let face = -1;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b[a] || o[a] > b[a + 3]) return null;
      continue;
    }
    let t1 = (b[a] - o[a]) / d[a];
    let t2 = (b[a + 3] - o[a]) / d[a];
    // face entered: min side → negative axis face
    let f1 = a * 2 + 1;
    if (a === 1) f1 = 3;
    if (a === 2) f1 = 5;
    let f2 = a === 0 ? 0 : a === 1 ? 2 : 4;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      [f1, f2] = [f2, f1];
    }
    if (t1 > tmin) {
      tmin = t1;
      face = f1;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return [Math.max(0, tmin), face];
}

/** Voxel ray cast (Amanatides & Woo) honouring partial selection boxes. */
export function raycastBlocks(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  liquids = false
): BlockHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx);
  const tDeltaY = Math.abs(1 / dy);
  const tDeltaZ = Math.abs(1 / dz);
  let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : (ox - x) * tDeltaX;
  let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : (oy - y) * tDeltaY;
  let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : (oz - z) * tDeltaZ;
  for (let i = 0; i < 64; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR) {
      const sel = selectionBox(world, x, y, z, id, liquids);
      if (sel) {
        const hit = rayBox(ox - x, oy - y, oz - z, dx, dy, dz, sel);
        if (hit && hit[0] <= maxDist) {
          const t = hit[0];
          return { x, y, z, face: hit[1], px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t, distance: t };
        }
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDist) break;
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDist) break;
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      if (tMaxZ > maxDist) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return null;
}
