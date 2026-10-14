import { Inventory, type Slot } from '../inventory';
import type { World } from '../world/world';
import { Living } from './entities';
import { Entity } from './physics';

export interface PlayerInput {
  /** -1..1 */
  forward: number;
  /** -1..1, positive = left (Minecraft strafe convention). */
  strafe: number;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
}

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  food: number;
  saturation: number;
  exhaustion: number;
  air: number;
  inventory: Slot[];
  selected: number;
  flying: boolean;
}

export const MAX_AIR = 300;

/** The player: Minecraft movement physics plus health, hunger and air. */
export class Player extends Living {
  food = 20;
  saturation = 5;
  exhaustion = 0;
  air = MAX_AIR;
  foodTimer = 0;
  readonly inventory = new Inventory(36);
  selected = 0;
  creative = false;
  flying = false;
  sprinting = false;
  sneaking = false;
  /** Smoothed eye height for sneaking. */
  eyeHeight = 1.62;
  prevEyeHeight = 1.62;
  /** View bobbing state. */
  walkDist = 0;
  prevWalkDist = 0;
  bob = 0;
  prevBob = 0;
  /** Called when the player takes fall damage etc. (for sounds/UI). */
  onDamage?: (amount: number) => void;
  difficulty = 2;

  constructor() {
    super(0.6, 1.8, 20);
  }

  get alive() {
    return this.health > 0;
  }

  eyeY() {
    return this.y + this.eyeHeight;
  }

  addExhaustion(v: number) {
    if (!this.creative) this.exhaustion = Math.min(40, this.exhaustion + v);
  }

  override damage(amount: number, fromX?: number, fromZ?: number, knockback = 0.4): boolean {
    if (this.creative || this.health <= 0) return false;
    const hit = super.damage(amount, fromX, fromZ, knockback);
    if (hit) {
      this.addExhaustion(0.1);
      this.onDamage?.(amount);
    }
    return hit;
  }

  protected override onLand(distance: number) {
    if (this.creative || this.inWater) return;
    const dmg = Math.ceil(distance - 3);
    if (dmg > 0) this.damage(dmg);
  }

  heal(amount: number) {
    if (this.health > 0) this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** One tick of movement (Minecraft EntityPlayer/EntityLivingBase physics). */
  tickMovement(world: World, input: PlayerInput, eatingSlowdown: boolean) {
    this.savePrev();
    this.prevEyeHeight = this.eyeHeight;
    this.prevWalkDist = this.walkDist;
    this.prevBob = this.bob;
    this.tickTimers();
    this.updateWater(world);

    this.sneaking = input.sneak && !this.flying;
    const canSprint = this.creative || this.food > 6;
    if (input.sprint && input.forward > 0.8 && canSprint && !this.sneaking && !eatingSlowdown) this.sprinting = true;
    if (input.forward <= 0.5 || (this.collidedH && !this.flying) || this.sneaking || !canSprint || eatingSlowdown)
      this.sprinting = false;

    let forward = input.forward * 0.98;
    let strafe = input.strafe * 0.98;
    if (this.sneaking) {
      forward *= 0.3;
      strafe *= 0.3;
    }
    if (eatingSlowdown) {
      forward *= 0.2;
      strafe *= 0.2;
    }

    const startX = this.x;
    const startZ = this.z;

    if (this.flying) {
      if (input.jump) this.vy += 0.15;
      if (input.sneak) this.vy -= 0.15;
      this.moveRelative(strafe, forward, this.sprinting ? 0.1 : 0.05);
      this.move(world, this.vx, this.vy, this.vz);
      this.vx *= 0.91;
      this.vz *= 0.91;
      this.vy *= 0.6;
      if (this.onGround) this.flying = false;
    } else {
      if (input.jump && this.onGround && !this.inWater) {
        this.vy = 0.42;
        if (this.sprinting) {
          this.vx -= Math.sin(this.yaw) * 0.2;
          this.vz += Math.cos(this.yaw) * 0.2;
          this.addExhaustion(0.2);
        } else this.addExhaustion(0.05);
      }
      const speed = 0.1 * (this.sprinting ? 1.3 : 1);
      this.travel(world, strafe, forward, speed, input.jump, this.sprinting ? 0.026 : 0.02, this.sneaking);
    }

    const moved = Math.hypot(this.x - startX, this.z - startZ);
    if (this.inWater) this.addExhaustion(0.015 * moved);
    else if (this.sprinting) this.addExhaustion(0.1 * moved);

    // view bobbing (Minecraft distanceWalkedModified / cameraYaw)
    const target = this.onGround && !this.flying ? Math.min(0.1, moved) : 0;
    this.bob += (target - this.bob) * 0.4;
    this.walkDist += moved * 0.6;

    const eye = this.sneaking ? 1.54 : 1.62;
    this.eyeHeight += (eye - this.eyeHeight) * 0.5;
    this.updateLimbs();
  }

  /** Hunger, regeneration, starvation and drowning (survival only). */
  tickStats(world: World) {
    if (this.creative || this.health <= 0) {
      this.air = MAX_AIR;
      return;
    }
    const peaceful = this.difficulty === 0;
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (!peaceful) this.food = Math.max(0, this.food - 1);
    }
    if (peaceful) {
      if (this.age % 20 === 0) this.heal(1);
      if (this.age % 10 === 0 && this.food < 20) this.food++;
    }
    if (this.food >= 18 && this.health < this.maxHealth) {
      if (++this.foodTimer >= 80) {
        this.heal(1);
        this.addExhaustion(3);
        this.foodTimer = 0;
      }
    } else if (this.food <= 0) {
      if (++this.foodTimer >= 80) {
        const minHealth = this.difficulty >= 3 ? 0 : this.difficulty === 2 ? 1 : 10;
        if (this.health > minHealth) this.damage(1);
        this.foodTimer = 0;
      }
    } else this.foodTimer = 0;

    const headInWater = Entity.pointInWater(world, this.x, this.eyeY(), this.z);
    if (headInWater) {
      this.air--;
      if (this.air <= -20) {
        this.air = 0;
        this.hurtCooldown = 0;
        this.damage(2);
      }
    } else this.air = Math.min(MAX_AIR, this.air + 5);
  }

  eat(hunger: number, saturation: number) {
    this.food = Math.min(20, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + saturation);
  }

  resetStats() {
    this.health = this.maxHealth;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = MAX_AIR;
    this.fireTicks = 0;
    this.hurtTime = 0;
    this.deathTime = 0;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
  }

  toSave(): PlayerSave {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      food: this.food,
      saturation: this.saturation,
      exhaustion: this.exhaustion,
      air: this.air,
      inventory: this.inventory.slots.map((s) => (s ? { ...s } : null)),
      selected: this.selected,
      flying: this.flying,
    };
  }

  load(s: PlayerSave) {
    this.setPos(s.x, s.y, s.z);
    this.yaw = this.prevYaw = s.yaw;
    this.pitch = this.prevPitch = s.pitch;
    this.health = s.health;
    this.food = s.food;
    this.saturation = s.saturation;
    this.exhaustion = s.exhaustion;
    this.air = s.air;
    s.inventory.forEach((slot, i) => {
      if (i < this.inventory.slots.length) this.inventory.slots[i] = slot ? { ...slot } : null;
    });
    this.selected = s.selected;
    this.flying = s.flying;
  }
}
