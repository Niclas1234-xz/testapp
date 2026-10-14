import { B, BLOCKS, block } from '../blocks';
import { I } from '../items';
import { canMerge, type ItemStack } from '../inventory';
import type { Rng } from '../rng';
import type { World } from '../world/world';
import { Entity } from './physics';

export type MobType = 'pig' | 'cow' | 'sheep' | 'zombie' | 'creeper';

export interface MobInfo {
  name: string;
  health: number;
  width: number;
  height: number;
  /** Movement speed attribute (Minecraft units). */
  speed: number;
  hostile: boolean;
  drops: (rng: Rng) => ItemStack[];
}

const stack = (id: number, count: number): ItemStack[] => (count > 0 ? [{ id, count, damage: 0 }] : []);
const range = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export const MOBS: Record<MobType, MobInfo> = {
  pig: { name: 'Schwein', health: 10, width: 0.9, height: 0.9, speed: 0.25, hostile: false, drops: (r) => stack(I.PORKCHOP, range(r, 1, 3)) },
  cow: {
    name: 'Kuh',
    health: 10,
    width: 0.9,
    height: 1.4,
    speed: 0.2,
    hostile: false,
    drops: (r) => [...stack(I.BEEF, range(r, 1, 3)), ...stack(I.LEATHER, range(r, 0, 2))],
  },
  sheep: {
    name: 'Schaf',
    health: 8,
    width: 0.9,
    height: 1.3,
    speed: 0.23,
    hostile: false,
    drops: (r) => [...stack(B.WHITE_WOOL, 1), ...stack(I.MUTTON, range(r, 1, 2))],
  },
  zombie: { name: 'Zombie', health: 20, width: 0.6, height: 1.95, speed: 0.23, hostile: true, drops: (r) => stack(I.ROTTEN_FLESH, range(r, 0, 2)) },
  creeper: { name: 'Creeper', health: 20, width: 0.6, height: 1.7, speed: 0.25, hostile: true, drops: (r) => stack(I.GUNPOWDER, range(r, 0, 2)) },
};

/** What a mob can see/do in the world. */
export interface MobContext {
  world: World;
  rng: Rng;
  player: { x: number; y: number; z: number; alive: boolean; targetable: boolean };
  /** True during the day when the sky is bright. */
  isDay: boolean;
  difficultyDamage: number;
  attackPlayer(mob: Mob, damage: number): void;
  explode(mob: Mob, power: number): void;
}

/** Base for living entities: health, damage flash, knockback, gravity and swimming. */
export class Living extends Entity {
  health: number;
  maxHealth: number;
  hurtTime = 0;
  hurtCooldown = 0;
  deathTime = 0;
  limbSwing = 0;
  limbAmount = 0;
  prevLimbAmount = 0;
  bodyYaw = 0;
  headYaw = 0;
  headPitch = 0;
  fireTicks = 0;
  swingTime = 0;

  constructor(width: number, height: number, health: number) {
    super(width, height);
    this.health = health;
    this.maxHealth = health;
  }

  /** Returns true if damage was applied. */
  damage(amount: number, fromX?: number, fromZ?: number, knockback = 0.4): boolean {
    if (this.health <= 0 || this.hurtCooldown > 0) return false;
    this.health -= amount;
    this.hurtTime = 10;
    this.hurtCooldown = 10;
    if (fromX !== undefined && fromZ !== undefined && knockback > 0) {
      const dx = this.x - fromX;
      const dz = this.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      this.vx = this.vx / 2 + (dx / d) * knockback;
      this.vz = this.vz / 2 + (dz / d) * knockback;
      this.vy = Math.min(0.4, this.vy / 2 + 0.4);
    }
    return true;
  }

  protected override onLand(distance: number) {
    const dmg = Math.ceil(distance - 3);
    if (dmg > 0) this.damage(dmg);
  }

  /** Living physics step: water, gravity and friction (Minecraft moveEntityWithHeading). */
  travel(world: World, strafe: number, forward: number, speed: number, jumping: boolean, airAccel = 0.02, sneaking = false) {
    if (this.inWater) {
      this.moveRelative(strafe, forward, 0.02);
      this.move(world, this.vx, this.vy, this.vz);
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.vz *= 0.8;
      this.vy -= 0.02;
      if (jumping) this.vy += 0.04;
      if (this.collidedH && jumping) this.vy = 0.3;
      return;
    }
    // Ladders: limit speed and fall, climb when pushing against them (Minecraft isOnLadder).
    const onLadder = world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) === B.LADDER;
    if (onLadder) {
      this.vx = Math.max(-0.15, Math.min(0.15, this.vx));
      this.vz = Math.max(-0.15, Math.min(0.15, this.vz));
      this.fallDistance = 0;
      this.vy = Math.max(this.vy, -0.15);
      if (sneaking && this.vy < 0) this.vy = 0;
    }
    let slip = 0.91;
    if (this.onGround) {
      const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z));
      slip = (BLOCKS[below]?.slipperiness ?? 0.6) * 0.91;
    }
    const accel = this.onGround ? speed * (0.16277136 / (slip * slip * slip)) : airAccel;
    this.moveRelative(strafe, forward, accel);
    this.move(world, this.vx, this.vy, this.vz, sneaking);
    if (onLadder && (this.collidedH || jumping)) this.vy = 0.2;
    this.vy -= 0.08;
    this.vy *= 0.98;
    this.vx *= slip;
    this.vz *= slip;
  }

  updateLimbs() {
    this.prevLimbAmount = this.limbAmount;
    const moved = Math.min(1, Math.hypot(this.x - this.prevX, this.z - this.prevZ) * 4);
    this.limbAmount += (moved - this.limbAmount) * 0.4;
    this.limbSwing += this.limbAmount;
  }

  tickTimers() {
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.hurtCooldown > 0) this.hurtCooldown--;
    if (this.swingTime > 0) this.swingTime--;
  }
}

type AiState = 'idle' | 'wander' | 'panic' | 'chase';

export class Mob extends Living {
  readonly info: MobInfo;
  ai: AiState = 'idle';
  aiTimer = 0;
  targetX = 0;
  targetZ = 0;
  attackCooldown = 0;
  /** Creeper fuse ticks (0..30). */
  fuse = 0;
  prevFuse = 0;
  persistent = false;

  constructor(readonly type: MobType) {
    const info = MOBS[type];
    super(info.width, info.height, info.health);
    this.info = info;
  }

  override damage(amount: number, fromX?: number, fromZ?: number, knockback = 0.4): boolean {
    const hit = super.damage(amount, fromX, fromZ, knockback);
    if (hit && !this.info.hostile) {
      this.ai = 'panic';
      this.aiTimer = 60 + Math.floor(Math.random() * 40);
    }
    return hit;
  }

  tick(ctx: MobContext) {
    this.savePrev();
    this.age++;
    this.tickTimers();
    if (this.health <= 0) {
      this.deathTime++;
      this.vx *= 0.6;
      this.vz *= 0.6;
      this.travel(ctx.world, 0, 0, 0, false);
      if (this.deathTime >= 20) this.dead = true;
      return;
    }
    if (this.attackCooldown > 0) this.attackCooldown--;
    this.updateWater(ctx.world);

    let forward = 0;
    let speedMod = 1;
    let jump = this.inWater && this.rngJump(ctx.rng);
    const p = ctx.player;
    const dxp = p.x - this.x;
    const dzp = p.z - this.z;
    const distP = Math.hypot(dxp, p.y - this.y, dzp);

    if (this.info.hostile) {
      if (p.alive && p.targetable && distP < 24) {
        this.ai = 'chase';
      } else if (this.ai === 'chase') {
        this.ai = 'idle';
        this.aiTimer = 40;
      }
    }

    switch (this.ai) {
      case 'idle':
        if (--this.aiTimer <= 0) {
          if (ctx.rng() < 0.5) {
            this.ai = 'wander';
            const a = ctx.rng() * Math.PI * 2;
            const r = 3 + ctx.rng() * 8;
            this.targetX = this.x + Math.cos(a) * r;
            this.targetZ = this.z + Math.sin(a) * r;
            this.aiTimer = 160;
          } else this.aiTimer = 40 + Math.floor(ctx.rng() * 120);
        }
        break;
      case 'wander': {
        const dx = this.targetX - this.x;
        const dz = this.targetZ - this.z;
        if (Math.hypot(dx, dz) < 0.6 || --this.aiTimer <= 0) {
          this.ai = 'idle';
          this.aiTimer = 40 + Math.floor(ctx.rng() * 120);
          break;
        }
        this.faceTowards(dx, dz, 0.2);
        forward = 1;
        speedMod = 1;
        break;
      }
      case 'panic':
        if (--this.aiTimer <= 0) {
          this.ai = 'idle';
          this.aiTimer = 20;
          break;
        }
        if (this.aiTimer % 20 === 0 || this.collidedH) {
          const a = ctx.rng() * Math.PI * 2;
          this.targetX = this.x + Math.cos(a) * 8;
          this.targetZ = this.z + Math.sin(a) * 8;
        }
        this.faceTowards(this.targetX - this.x, this.targetZ - this.z, 0.5);
        forward = 1;
        speedMod = 1.25 / 1;
        break;
      case 'chase':
        this.faceTowards(dxp, dzp, 0.35);
        forward = 1;
        if (this.type === 'creeper') {
          this.prevFuse = this.fuse;
          if (distP < 3 || (this.fuse > 0 && distP < 7)) {
            this.fuse++;
            forward = 0;
            if (this.fuse >= 30) {
              ctx.explode(this, 3);
              this.dead = true;
              return;
            }
          } else this.fuse = Math.max(0, this.fuse - 1);
        } else if (this.type === 'zombie') {
          const reach = this.width * 2 * (this.width * 2) + 0.6;
          const horiz = dxp * dxp + dzp * dzp;
          if (horiz < reach + 0.5 && Math.abs(p.y - this.y) < 1.5 && this.attackCooldown === 0) {
            this.attackCooldown = 20;
            this.swingTime = 6;
            ctx.attackPlayer(this, ctx.difficultyDamage);
          }
        }
        break;
    }

    if (forward !== 0 && this.collidedH && this.onGround) jump = true;
    if (jump && this.onGround) this.vy = 0.42;

    // Look at the player when close.
    const lookAt = this.ai === 'chase' || (distP < 6 && !this.info.hostile);
    const targetHead = lookAt ? Math.atan2(-dxp, dzp) : this.yaw;
    this.headYaw = wrapAngle(lerpAngle(this.headYaw, targetHead, 0.3) - this.yaw) + this.yaw;
    this.headPitch = lookAt ? -Math.atan2(p.y + 1.5 - (this.y + this.height * 0.85), Math.hypot(dxp, dzp)) : this.headPitch * 0.9;
    this.headYaw = clampAngle(this.headYaw, this.yaw, 1.2);
    this.bodyYaw = lerpAngle(this.bodyYaw, this.yaw, 0.3);

    const s = this.info.speed * speedMod;
    this.travel(ctx.world, 0, forward * s, s, jump);
    this.updateLimbs();

    // Zombies burn in sunlight.
    if (this.type === 'zombie' && ctx.isDay && !this.inWater) {
      const l = ctx.world.getLight(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z));
      if (l >> 4 >= 15 && ctx.rng() < 0.03) this.fireTicks = 160;
    }
    if (this.inWater) this.fireTicks = 0;
    if (this.fireTicks > 0) {
      this.fireTicks--;
      if (this.fireTicks % 20 === 0) this.damage(1);
    }
  }

  private rngJump(rng: Rng) {
    return rng() < 0.8;
  }

  private faceTowards(dx: number, dz: number, rate: number) {
    const target = Math.atan2(-dx, dz);
    this.yaw = lerpAngle(this.yaw, target, rate);
  }
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a: number, b: number, t: number) {
  return a + wrapAngle(b - a) * t;
}

function clampAngle(a: number, center: number, max: number) {
  const d = wrapAngle(a - center);
  return center + Math.max(-max, Math.min(max, d));
}

/** A dropped item stack lying in the world. */
export class ItemEntity extends Entity {
  pickupDelay = 10;
  readonly hover: number;

  constructor(public stack: ItemStack) {
    super(0.25, 0.25);
    this.hover = Math.random() * Math.PI * 2;
    this.stepHeight = 0;
  }

  tick(world: World) {
    this.savePrev();
    this.age++;
    if (this.pickupDelay > 0) this.pickupDelay--;
    this.updateWater(world);
    if (this.inWater) {
      this.vy += this.vy < 0.06 ? 0.0015 * 8 : 0;
      this.vx *= 0.99;
      this.vz *= 0.99;
    } else this.vy -= 0.04;
    this.move(world, this.vx, this.vy, this.vz);
    const f = this.onGround ? 0.6 * 0.98 : 0.98;
    this.vx *= f;
    this.vz *= f;
    this.vy *= 0.98;
    if (this.onGround) this.vy *= -0.5;
    if (this.age >= 6000) this.dead = true;
  }

  tryMerge(other: ItemEntity) {
    if (other === this || other.dead || this.dead) return;
    if (!canMerge(this.stack, other.stack)) return;
    if (Math.abs(other.x - this.x) > 0.5 || Math.abs(other.y - this.y) > 0.5 || Math.abs(other.z - this.z) > 0.5) return;
    const max = 64;
    if (this.stack.count + other.stack.count > max) return;
    this.stack.count += other.stack.count;
    this.pickupDelay = Math.max(this.pickupDelay, other.pickupDelay);
    other.dead = true;
  }
}

/** Sand/gravel falling as an entity until it lands. */
export class FallingBlock extends Entity {
  constructor(
    public blockId: number,
    public meta: number
  ) {
    super(0.98, 0.98);
    this.stepHeight = 0;
  }

  /** Returns the item to drop if the block could not be placed. */
  tick(world: World): ItemStack | null {
    this.savePrev();
    this.age++;
    this.vy -= 0.04;
    this.move(world, this.vx, this.vy, this.vz);
    this.vx *= 0.98;
    this.vy *= 0.98;
    this.vz *= 0.98;
    if (this.onGround || this.age > 600) {
      this.dead = true;
      const bx = Math.floor(this.x);
      const by = Math.floor(this.y + 0.01);
      const bz = Math.floor(this.z);
      const cur = world.getBlock(bx, by, bz);
      if (cur === B.AIR || cur === B.WATER || block(cur).replaceable) {
        if (cur !== B.AIR && cur !== B.WATER) world.breakBlock(bx, by, bz, null, true);
        world.setBlock(bx, by, bz, this.blockId, this.meta);
        return null;
      }
      return { id: this.blockId, count: 1, damage: 0 };
    }
    return null;
  }
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  tile: number;
  u: number;
  v: number;
  uvSize: number;
  gravity: number;
  /** Fixed brightness multiplier (smoke) or -1 to use world light. */
  brightness: number;
}
