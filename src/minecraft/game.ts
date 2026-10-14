import {
  B,
  block,
  blockBox,
  BLOCKS,
  DOOR_OPEN,
  DOOR_UPPER,
  FACE_BOTTOM,
  FACE_DIRS,
  FACE_EAST,
  FACE_NORTH,
  FACE_SOUTH,
  FACE_TOP,
  FACE_WEST,
  IS_SOLID,
  isLeaves,
  oppositeFace,
} from './blocks';
import { CHUNK_SIZE, DAY_LENGTH, REACH_CREATIVE, REACH_SURVIVAL, SECTION_COUNT, TICK_MS } from './constants';
import { blockDrops, canHarvest } from './drops';
import { FallingBlock, ItemEntity, Mob, MOBS, wrapAngle, type MobContext, type MobType, type Particle } from './entity/entities';
import { Entity, raycastBlocks, selectionBox, type BlockHit } from './entity/physics';
import { MAX_AIR, Player, type PlayerInput } from './entity/player';
import { clickSlot, takeOutput, type ItemStack, type Slot } from './inventory';
import { I, item, itemName, maxStack } from './items';
import { consumeIngredients, findRecipe, smeltResult } from './recipes';
import { lightBrightness, Renderer, type MobRender, type RenderFrame } from './render/renderer';
import { Mesher } from './render/mesher';
import { mulberry32 } from './rng';
import { materialOf, sound, type SoundName } from './sound';
import { saveChunk, saveWorldMeta, type Settings, type WorldMeta } from './storage';
import { tile } from './textures/atlas';
import { ChunkState, chunkId, type ChestEntity, type FurnaceEntity } from './world/chunk';
import { BIOME_NAMES } from './world/generator';
import { LEAF_PERSISTENT, World, type ChunkSave } from './world/world';
import type { GL } from './render/glutil';

export type Screen =
  | { kind: 'inventory' }
  | { kind: 'crafting'; x: number; y: number; z: number }
  | { kind: 'furnace'; x: number; y: number; z: number }
  | { kind: 'chest'; x: number; y: number; z: number }
  | { kind: 'pause' }
  | { kind: 'options' }
  | { kind: 'death' };

/** Raw controls, written by touch/keyboard handlers and read every tick/frame. */
export interface Controls {
  forward: number;
  strafe: number;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  /** Primary action held (mine / attack). */
  attack: boolean;
  /** Secondary action held (eat, place repeatedly). */
  use: boolean;
  /** Accumulated look deltas in radians. */
  lookYaw: number;
  lookPitch: number;
}

export interface UiSnapshot {
  version: number;
  inventory: Slot[];
  craft: Slot[];
  craftSize: number;
  result: ItemStack | null;
  cursor: Slot;
  chest: Slot[] | null;
  furnace: { slots: Slot[]; burn: number; cook: number } | null;
  selected: number;
  creative: boolean;
}

export interface HudState {
  health: number;
  food: number;
  air: number;
  showAir: boolean;
  creative: boolean;
  flying: boolean;
  hotbar: Slot[];
  selected: number;
  toast: string | null;
  toastId: number;
  screen: Screen | null;
  loading: number;
  info: string | null;
  deathMessage: string;
  hurt: number;
  /** Fade to black while sleeping (0..1). */
  sleep: number;
}

const DIFFICULTY_DAMAGE = [0, 2, 3, 4];
const BLAST_RESISTANCE: Partial<Record<number, number>> = {
  [B.STONE]: 6,
  [B.COBBLESTONE]: 6,
  [B.STONE_BRICKS]: 6,
  [B.WATER]: 100,
  [B.BEDROCK]: 3600000,
  [B.FURNACE]: 3.5,
  [B.FURNACE_LIT]: 3.5,
};

/** Ties together world, player, entities, rendering and UI state. Runs at 20 ticks per second. */
export class Game {
  readonly world: World;
  readonly player = new Player();
  mobs: Mob[] = [];
  items: ItemEntity[] = [];
  falling: FallingBlock[] = [];
  particles: Particle[] = [];
  renderer: Renderer | null = null;
  private mesher: Mesher;
  readonly controls: Controls = {
    forward: 0,
    strafe: 0,
    jump: false,
    sneak: false,
    sprint: false,
    attack: false,
    use: false,
    lookYaw: 0,
    lookPitch: 0,
  };
  settings: Settings;
  meta: WorldMeta;
  screen: Screen | null = null;
  thirdPerson = false;
  showDebug = false;

  /** Crafting grid of the open screen (4 slots in the inventory, 9 at a crafting table). */
  craftGrid: Slot[] = [null, null, null, null];
  craftSize = 2;
  cursor: Slot = null;

  private accumulator = 0;
  private lastFrame = 0;
  private rng = mulberry32(Date.now() & 0x7fffffff);
  private listeners = new Set<() => void>();
  private hud: HudState;
  private hudDirty = true;
  private uiVersion = 0;
  private snapshot: UiSnapshot | null = null;
  private lastSlotTap = { key: '', time: 0 };
  private toast: string | null = null;
  private toastId = 0;
  private toastTimer = 0;
  private loadedOnce = false;
  private loadingProgress = 0;
  private lastSave = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;

  // interaction state
  target: BlockHit | null = null;
  targetMob: Mob | null = null;
  private breaking: { x: number; y: number; z: number; progress: number } | null = null;
  private breakCooldown = 0;
  private useCooldown = 0;
  private swingTicks = 0;
  private swingPrev = 0;
  private equip = 0;
  private prevEquip = 0;
  private lastHeldId: number | null = null;
  private eatingTicks = 0;
  private hurtCamera = 0;
  private fovFactor = 1;
  private lastJump = false;
  private lastJumpTime = -100;
  private deathMessage = '';
  private isDead = false;
  /** > 0 while sleeping in a bed (counts up to 100 ticks). */
  sleepTicks = 0;
  private cloudOffset = 0;
  private lastStep = 0;

  constructor(meta: WorldMeta, chunks: Map<string, ChunkSave>, settings: Settings) {
    this.meta = meta;
    this.settings = settings;
    this.world = new World(meta.seed, {
      dropItem: (x, y, z, s) => this.dropItem(x, y, z, s, false),
      spawnFallingBlock: (x, y, z, id, m) => {
        const f = new FallingBlock(id, m);
        f.setPos(x + 0.5, y, z + 0.5);
        this.falling.push(f);
      },
      blockBroken: (x, y, z, id) => this.breakParticles(x, y, z, id),
    });
    for (const [key, data] of chunks) {
      const [cx, cz] = key.split(',').map(Number);
      this.world.saved.set(chunkId(cx, cz), data);
    }
    this.world.time = meta.time;
    this.world.onFurnaceChange = (x, y, z) => {
      const s = this.screen;
      if (s?.kind === 'furnace' && s.x === x && s.y === y && s.z === z) this.emit();
    };
    this.mesher = new Mesher({ fancyLeaves: settings.fancyGraphics, smoothLighting: settings.smoothLighting });
    this.player.creative = meta.mode === 'creative';
    this.player.difficulty = settings.difficulty;
    this.player.autoJump = settings.autoJump;
    if (!meta.spawn) meta.spawn = this.world.gen.findSpawn();
    if (meta.player) this.player.load(meta.player);
    else {
      this.player.setPos(meta.spawn.x, meta.spawn.y + 0.5, meta.spawn.z);
      if (this.player.creative) this.player.flying = false;
    }
    this.player.onDamage = () => {
      this.hurtCamera = 10;
      sound.play('hurt', 0.9);
      this.markHud();
    };
    sound.setVolume(settings.soundVolume);
    this.hud = this.buildHud();
  }

  // ------------------------------------------------------------------ UI plumbing

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getHud(): HudState {
    if (this.hudDirty) {
      this.hud = this.buildHud();
      this.hudDirty = false;
    }
    return this.hud;
  }

  /** Version number for container screens (inventory, furnace…); bumps on any change. */
  getUiVersion() {
    return this.uiVersion;
  }

  private markHud() {
    this.hudDirty = true;
  }

  private emit() {
    this.uiVersion++;
    this.hudDirty = true;
    for (const l of this.listeners) l();
  }

  private buildHud(): HudState {
    const p = this.player;
    const headWater = Entity.pointInWater(this.world, p.x, p.eyeY(), p.z);
    let info: string | null = null;
    if (this.settings.showCoords || this.showDebug) {
      const c = this.world.chunkAt(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4);
      const biome = c ? BIOME_NAMES[c.biomes[((Math.floor(p.z) & 15) << 4) | (Math.floor(p.x) & 15)]] : '';
      const day = Math.floor(this.world.time / DAY_LENGTH) + 1;
      const t = this.world.time % DAY_LENGTH;
      const hours = Math.floor((t / 1000 + 6) % 24);
      const minutes = Math.floor(((t % 1000) / 1000) * 60);
      info = `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\nBiom: ${biome}\nTag ${day}, ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}\n${this.fps} FPS`;
      if (this.showDebug) {
        const facing = ['Süden (+Z)', 'Westen (-X)', 'Norden (-Z)', 'Osten (+X)'][Math.round(wrapAngle(p.yaw) / (Math.PI / 2) + 4) % 4];
        info += `\nBlick: ${facing}\nChunks: ${this.world.chunks.size}, Abschnitte: ${this.renderer?.drawnSections ?? 0}\nMobs: ${this.mobs.length}, Items: ${this.items.length}`;
      }
    }
    return {
      health: p.health,
      food: p.food,
      air: p.air,
      showAir: headWater || p.air < MAX_AIR,
      creative: p.creative,
      flying: p.flying,
      hotbar: p.inventory.slots.slice(0, 9).map((s) => (s ? { ...s } : null)),
      selected: p.selected,
      toast: this.toast,
      toastId: this.toastId,
      screen: this.screen,
      loading: this.loadedOnce ? 1 : this.loadingProgress,
      info,
      deathMessage: this.deathMessage,
      hurt: p.hurtTime,
      sleep: this.sleepTicks > 0 ? Math.min(1, this.sleepTicks / 60) : 0,
    };
  }

  private showToast(text: string) {
    this.toast = text;
    this.toastId++;
    this.toastTimer = 40;
    this.markHud();
  }

  // ------------------------------------------------------------------ setup

  attachGL(gl: GL) {
    this.renderer = new Renderer(gl);
    for (const c of this.world.chunks.values()) c.markAllDirty();
  }

  detachGL() {
    this.renderer?.dispose();
    this.renderer = null;
  }

  applySettings(s: Settings) {
    const remesh = s.fancyGraphics !== this.settings.fancyGraphics || s.smoothLighting !== this.settings.smoothLighting;
    this.settings = s;
    this.player.difficulty = s.difficulty;
    this.player.autoJump = s.autoJump;
    sound.setVolume(s.soundVolume);
    this.mesher.options = { fancyLeaves: s.fancyGraphics, smoothLighting: s.smoothLighting };
    if (s.difficulty === 0) this.mobs = this.mobs.filter((m) => !m.info.hostile);
    if (remesh) for (const c of this.world.chunks.values()) c.markAllDirty();
    this.emit();
  }

  setGameMode(mode: 'survival' | 'creative') {
    this.meta.mode = mode;
    this.player.creative = mode === 'creative';
    if (!this.player.creative) this.player.flying = false;
    this.player.fallDistance = 0;
    this.showToast(mode === 'creative' ? 'Spielmodus: Kreativ' : 'Spielmodus: Überleben');
    this.emit();
  }

  // ------------------------------------------------------------------ main loop

  /** Called every animation frame with a timestamp in ms. */
  frame(now: number, width: number, height: number) {
    if (this.lastFrame === 0) this.lastFrame = now;
    let dt = now - this.lastFrame;
    this.lastFrame = now;
    if (dt > 250) dt = 250;

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (this.settings.showCoords || this.showDebug) this.markHud();
    }

    const paused = this.screen?.kind === 'pause' || this.screen?.kind === 'options';
    // Mouse/touch look applies every frame for responsiveness.
    if (!this.screen || this.screen.kind === 'death') this.applyLook();
    else {
      this.controls.lookYaw = 0;
      this.controls.lookPitch = 0;
    }

    const frameStart = Date.now();
    this.updateChunks(frameStart);

    if (!paused && this.loadedOnce) {
      this.accumulator += dt;
      let ticks = 0;
      while (this.accumulator >= TICK_MS && ticks < 5) {
        this.tick();
        this.accumulator -= TICK_MS;
        ticks++;
      }
      if (ticks === 5) this.accumulator = 0;
    }

    this.meshChunks(frameStart);

    if (this.renderer && width > 0 && height > 0) {
      const alpha = paused ? 1 : Math.min(1, this.accumulator / TICK_MS);
      this.renderer.render(this.buildFrame(alpha, width, height));
    }

    if (this.hudDirty) {
      for (const l of this.listeners) l();
    }

    if (now - this.lastSave > 60000 && this.loadedOnce) {
      this.lastSave = now;
      this.save();
    }
  }

  private applyLook() {
    const c = this.controls;
    const p = this.player;
    if (c.lookYaw !== 0 || c.lookPitch !== 0) {
      p.yaw = wrapAngle(p.yaw + c.lookYaw);
      p.prevYaw = wrapAngle(p.prevYaw + c.lookYaw);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch + c.lookPitch));
      p.prevPitch = p.pitch;
      c.lookYaw = 0;
      c.lookPitch = 0;
    }
  }

  // ------------------------------------------------------------------ chunks

  private updateChunks(frameStart: number) {
    const p = this.player;
    const pcx = Math.floor(p.x / CHUNK_SIZE);
    const pcz = Math.floor(p.z / CHUNK_SIZE);
    const r = this.settings.renderDistance;
    const genR = r + 2;
    const budget = this.loadedOnce ? 6 : 40;

    // Generate missing chunks, nearest first.
    const missing: [number, number, number][] = [];
    for (let dz = -genR; dz <= genR; dz++)
      for (let dx = -genR; dx <= genR; dx++) {
        if (!this.world.chunkAt(pcx + dx, pcz + dz)) missing.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    missing.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of missing) {
      if (Date.now() - frameStart > budget) break;
      this.world.generateChunk(cx, cz);
    }

    // Light chunks whose neighbours exist.
    const unlit: [number, number, number][] = [];
    for (let dz = -(r + 1); dz <= r + 1; dz++)
      for (let dx = -(r + 1); dx <= r + 1; dx++) {
        const c = this.world.chunkAt(pcx + dx, pcz + dz);
        if (c && c.state !== ChunkState.Lit) unlit.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    unlit.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of unlit) {
      if (Date.now() - frameStart > budget * 1.6) break;
      const c = this.world.chunkAt(cx, cz);
      if (c) this.world.tryLight(c);
    }

    // Unload far chunks.
    const unloadR = genR + 2;
    for (const c of [...this.world.chunks.values()]) {
      if (Math.abs(c.cx - pcx) > unloadR || Math.abs(c.cz - pcz) > unloadR) {
        if (this.world.storeChunk(c)) {
          const s = this.world.saved.get(chunkId(c.cx, c.cz));
          if (s) saveChunk(this.meta.id, c.cx, c.cz, s);
        }
        this.renderer?.removeChunk(c.cx, c.cz);
        this.world.unloadChunk(c);
      }
    }

    if (!this.loadedOnce) {
      // Spawn area ready = the 3×3 chunks around the player are lit and meshed.
      let ready = 0;
      let total = 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          total++;
          const c = this.world.chunkAt(pcx + dx, pcz + dz);
          if (c && this.world.isMeshable(c) && !c.dirty.some((d) => d === 1)) ready++;
        }
      const generated = this.world.chunks.size / ((genR * 2 + 1) * (genR * 2 + 1));
      this.loadingProgress = Math.min(0.99, generated * 0.6 + (ready / total) * 0.4);
      this.markHud();
      if (ready === total) {
        this.loadedOnce = true;
        this.onSpawnReady();
      }
    }
  }

  private meshChunks(frameStart: number) {
    if (!this.renderer) return;
    const p = this.player;
    const pcx = Math.floor(p.x / CHUNK_SIZE);
    const pcz = Math.floor(p.z / CHUNK_SIZE);
    const r = this.settings.renderDistance;
    const budget = this.loadedOnce ? 10 : 40;
    const list: [number, number, number][] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const c = this.world.chunkAt(pcx + dx, pcz + dz);
        if (c && c.state === ChunkState.Lit && c.dirty.some((d) => d === 1)) list.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    list.sort((a, b) => a[2] - b[2]);
    // Mesh section by section within the frame budget (at least one per frame).
    let meshed = 0;
    for (const [cx, cz] of list) {
      const c = this.world.chunkAt(cx, cz);
      if (!c || !this.world.isMeshable(c)) continue;
      for (let sy = 0; sy < SECTION_COUNT; sy++) {
        if (!c.dirty[sy]) continue;
        if (meshed > 0 && Date.now() - frameStart > budget) return;
        c.dirty[sy] = 0;
        this.renderer.uploadSection(cx, cz, sy, this.mesher.build(this.world, c, sy));
        meshed++;
      }
    }
  }

  private onSpawnReady() {
    const p = this.player;
    if (!this.meta.player) {
      // Put the player on the ground at the spawn point.
      const sx = Math.floor(p.x);
      const sz = Math.floor(p.z);
      let y = this.world.surfaceY(sx, sz);
      while (y > 0 && !IS_SOLID[this.world.getBlock(sx, y, sz)]) y--;
      p.setPos(p.x, y + 1, p.z);
      this.meta.spawn = { x: p.x, y: y + 1, z: p.z };
    }
    this.save();
    this.emit();
  }

  // ------------------------------------------------------------------ ticking

  private dayInfo() {
    const t = this.world.time % DAY_LENGTH;
    let f = t / DAY_LENGTH - 0.25;
    if (f < 0) f += 1;
    const base = f;
    f = 1 - (Math.cos(f * Math.PI) + 1) / 2;
    const celestial = base + (f - base) / 3;
    const daylight = Math.min(1, Math.max(0, Math.cos(celestial * Math.PI * 2) * 2 + 0.5));
    return { celestial, daylight, skyDarken: Math.round((1 - daylight) * 11) };
  }

  private tick() {
    const p = this.player;
    const day = this.dayInfo();
    this.world.tick(p.x, p.z, Math.min(4, this.settings.renderDistance), day.skyDarken);

    const dead = this.isDead;
    const c = this.controls;
    if (this.sleepTicks > 0) {
      this.sleepTicks++;
      this.markHud();
      if (c.forward !== 0 || c.strafe !== 0 || c.jump) this.sleepTicks = 0;
      else if (this.sleepTicks >= 100) {
        // Wake up at the next morning.
        this.world.time += DAY_LENGTH - (this.world.time % DAY_LENGTH);
        this.sleepTicks = 0;
        this.mobs = this.mobs.filter((m) => !m.info.hostile);
      }
    }
    const input: PlayerInput = dead || this.screen || this.sleepTicks > 0
      ? { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false }
      : { forward: c.forward, strafe: c.strafe, jump: c.jump, sneak: c.sneak, sprint: c.sprint };

    // Double-tap jump toggles flying in creative.
    if (input.jump && !this.lastJump && p.creative) {
      if (this.world.time - this.lastJumpTime < 7) {
        p.flying = !p.flying;
        this.lastJumpTime = -100;
        this.markHud();
      } else this.lastJumpTime = this.world.time;
    }
    this.lastJump = input.jump;

    const prevHealth = p.health;
    const prevFood = p.food;
    const prevAir = p.air;
    // Wait for the terrain under the player (e.g. after respawning far away) before simulating.
    const loaded = this.world.isLoaded(Math.floor(p.x), Math.floor(p.z));
    if (!dead && !loaded) {
      p.savePrev();
      p.vx = p.vy = p.vz = 0;
    } else if (!dead) {
      const eating = this.eatingTicks > 0;
      const wasOnGround = p.onGround;
      const wasInWater = p.inWater;
      const fall = p.fallDistance;
      const fallSpeed = p.vy;
      p.tickMovement(this.world, input, eating);
      this.movementSounds(wasOnGround, wasInWater, fall, fallSpeed);
      p.tickStats(this.world);
      if (p.y < -64) {
        p.hurtCooldown = 0;
        p.damage(4);
      }
      this.tickInteraction();
      this.tickCactus();
    } else {
      p.savePrev();
      p.deathTime++;
    }
    if (p.health !== prevHealth || p.food !== prevFood || p.air !== prevAir) this.markHud();

    this.tickEntities(day);
    if (this.world.time % 20 === 0) this.spawnMobs(day);
    if (!this.isDead && p.health <= 0) {
      this.isDead = true;
      this.onDeath();
    }

    if (this.hurtCamera > 0) this.hurtCamera--;
    if (this.toastTimer > 0 && --this.toastTimer === 0) {
      this.toast = null;
      this.markHud();
    }
    this.prevEquip = this.equip;
    const held = this.heldStack();
    const heldId = held ? held.id : null;
    if (heldId !== this.lastHeldId) {
      this.equip = 1;
      this.lastHeldId = heldId;
    }
    this.equip = Math.max(0, this.equip - 0.25);
    this.swingPrev = this.swingTicks;
    if (this.swingTicks > 0) this.swingTicks--;
    this.cloudOffset += 0.03;
  }

  /** Footsteps, landing and splash sounds. */
  private movementSounds(wasOnGround: boolean, wasInWater: boolean, fall: number, fallSpeed: number) {
    const p = this.player;
    const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
    if (p.onGround && !wasOnGround && fall > 1.5 && below !== B.AIR) sound.play(`step_${materialOf(below)}`, 0.5, 0.75);
    if (p.inWater && !wasInWater && fallSpeed < -0.15) sound.play('splash', 0.5, 0.9 + this.rng() * 0.2);
    if (p.onGround && !p.sneaking && !p.inWater && below !== B.AIR) {
      const step = Math.floor(p.walkDist);
      if (step > this.lastStep) sound.play(`step_${materialOf(below)}`, 0.18, 0.9 + this.rng() * 0.2);
      this.lastStep = step;
    } else this.lastStep = Math.floor(p.walkDist);
  }

  /** Plays a sound at a world position (fades out over 16 blocks, like Minecraft). */
  private playAt(name: SoundName, x: number, y: number, z: number, volume = 1, pitch = 1, range = 16) {
    const p = this.player;
    const d = Math.hypot(x - p.x, y - p.eyeY(), z - p.z);
    const v = volume * Math.max(0, 1 - d / (range * Math.max(1, volume)));
    if (v > 0.01) sound.play(name, v, pitch);
  }

  private onDeath() {
    const p = this.player;
    this.deathMessage = p.y < -64 ? 'Du bist aus der Welt gefallen' : p.air <= 0 ? 'Du bist ertrunken' : 'Du bist gestorben!';
    // Drop the whole inventory.
    for (let i = 0; i < p.inventory.slots.length; i++) {
      const s = p.inventory.slots[i];
      if (s) this.dropItem(p.x, p.y + 1, p.z, s, true, true);
      p.inventory.slots[i] = null;
    }
    this.closeScreen();
    this.screen = { kind: 'death' };
    this.breaking = null;
    this.emit();
  }

  respawn() {
    const p = this.player;
    const s = this.meta.spawn ?? this.world.gen.findSpawn();
    p.resetStats();
    p.setPos(s.x, s.y + 0.2, s.z);
    p.flying = false;
    this.isDead = false;
    this.sleepTicks = 0;
    this.screen = null;
    this.emit();
  }

  private tickCactus() {
    const p = this.player;
    const b = p.box();
    for (let x = Math.floor(b[0] - 0.01); x <= Math.floor(b[3] + 0.01); x++)
      for (let y = Math.floor(b[1]); y <= Math.floor(b[4]); y++)
        for (let z = Math.floor(b[2] - 0.01); z <= Math.floor(b[5] + 0.01); z++)
          if (this.world.getBlock(x, y, z) === B.CACTUS) {
            p.damage(1, x + 0.5, z + 0.5, 0);
            return;
          }
  }

  private tickEntities(day: { daylight: number; skyDarken: number }) {
    const p = this.player;
    const ctx: MobContext = {
      world: this.world,
      rng: this.rng,
      player: { x: p.x, y: p.y, z: p.z, alive: p.health > 0, targetable: !p.creative },
      isDay: day.daylight > 0.6,
      difficultyDamage: DIFFICULTY_DAMAGE[this.settings.difficulty],
      attackPlayer: (mob, dmg) => {
        if (p.damage(dmg, mob.x, mob.z)) this.markHud();
      },
      explode: (mob, power) => this.explode(mob.x, mob.y + mob.height / 2, mob.z, power),
    };
    for (const m of this.mobs) {
      if (!this.world.isLoaded(Math.floor(m.x), Math.floor(m.z))) continue;
      const wasAlive = m.health > 0;
      m.tick(ctx);
      if (wasAlive && m.health <= 0) this.onMobDeath(m);
      if (m.type === 'creeper' && m.fuse === 1 && m.prevFuse === 0) this.playAt('fuse', m.x, m.y + 1, m.z, 1, 0.5);
      else if (m.health > 0 && m.type !== 'creeper' && this.rng() < 1 / 320) this.playAt(m.type, m.x, m.y + 1, m.z, 0.7, 0.9 + this.rng() * 0.2);
    }
    this.mobs = this.mobs.filter((m) => !m.dead);

    for (const it of this.items) {
      if (!this.world.isLoaded(Math.floor(it.x), Math.floor(it.z))) continue;
      it.tick(this.world);
      if (it.age % 10 === 0) for (const o of this.items) it.tryMerge(o);
      // pickup
      if (p.health > 0 && it.pickupDelay === 0 && !it.dead) {
        const b = p.box();
        if (it.x > b[0] - 1 && it.x < b[3] + 1 && it.y > b[1] - 0.5 && it.y < b[4] + 0.5 && it.z > b[2] - 1 && it.z < b[5] + 1) {
          const left = p.inventory.add(it.stack);
          if (left < it.stack.count) {
            sound.play('pop', 0.25, 1.4 + this.rng() * 0.6);
            this.emit();
            if (left === 0) it.dead = true;
            else it.stack.count = left;
          }
        }
      }
    }
    this.items = this.items.filter((i) => !i.dead);

    for (const f of this.falling) {
      const drop = f.tick(this.world);
      if (drop) this.dropItem(f.x, f.y + 0.5, f.z, drop, false);
    }
    this.falling = this.falling.filter((f) => !f.dead);

    for (const pt of this.particles) {
      pt.life++;
      pt.vy -= pt.gravity;
      const nx = pt.x + pt.vx;
      const ny = pt.y + pt.vy;
      const nz = pt.z + pt.vz;
      if (IS_SOLID[this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        pt.vx *= 0.3;
        pt.vz *= 0.3;
        pt.vy = 0;
      } else {
        pt.x = nx;
        pt.y = ny;
        pt.z = nz;
      }
      pt.vx *= 0.98;
      pt.vy *= 0.98;
      pt.vz *= 0.98;
    }
    this.particles = this.particles.filter((pt) => pt.life < pt.maxLife);
  }

  private onMobDeath(m: Mob) {
    for (const s of m.info.drops(this.rng)) this.dropItem(m.x, m.y + 0.5, m.z, s, false);
    for (let i = 0; i < 12; i++) this.spawnSmoke(m.x + (this.rng() - 0.5) * m.width, m.y + this.rng() * m.height, m.z + (this.rng() - 0.5) * m.width, 0.8);
  }

  private spawnMobs(day: { daylight: number; skyDarken: number }) {
    const p = this.player;
    const r = this.settings.renderDistance * 16;
    // despawn
    this.mobs = this.mobs.filter((m) => {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (m.info.hostile) return d < 128 && !(d > 32 && this.rng() < 0.025);
      return d < r + 24;
    });
    const passive = this.mobs.filter((m) => !m.info.hostile).length;
    const hostile = this.mobs.length - passive;

    if (passive < 10 && this.rng() < 0.3) {
      const pos = this.randomSpawnPos(20, Math.min(48, r));
      if (pos && this.world.getBlock(pos.x, pos.y - 1, pos.z) === B.GRASS) {
        const l = this.world.getLight(pos.x, pos.y, pos.z);
        if (l >> 4 >= 9) {
          const types: MobType[] = ['pig', 'cow', 'sheep'];
          const type = types[Math.floor(this.rng() * types.length)];
          const n = 2 + Math.floor(this.rng() * 3);
          for (let i = 0; i < n; i++) this.trySpawn(type, pos.x + Math.floor(this.rng() * 5) - 2, pos.z + Math.floor(this.rng() * 5) - 2);
        }
      }
    }

    if (this.settings.difficulty > 0 && hostile < 14) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = this.rng() * Math.PI * 2;
        const d = 24 + this.rng() * Math.min(40, r - 8);
        const x = Math.floor(p.x + Math.cos(a) * d);
        const z = Math.floor(p.z + Math.sin(a) * d);
        if (!this.world.isLoaded(x, z)) continue;
        const top = this.world.surfaceY(x, z);
        if (top < 1) continue;
        const y = this.rng() < 0.5 ? top + 1 : 5 + Math.floor(this.rng() * Math.max(1, top - 5));
        if (!this.canSpawnAt(x, y, z, 1.95)) continue;
        const l = this.world.getLight(x, y, z);
        const level = Math.max((l >> 4) - day.skyDarken, l & 15);
        if (level > 7 || (l & 15) > 0) continue;
        this.trySpawn(this.rng() < 0.7 ? 'zombie' : 'creeper', x, z, y);
        break;
      }
    }
  }

  private randomSpawnPos(minD: number, maxD: number) {
    const p = this.player;
    const a = this.rng() * Math.PI * 2;
    const d = minD + this.rng() * Math.max(1, maxD - minD);
    const x = Math.floor(p.x + Math.cos(a) * d);
    const z = Math.floor(p.z + Math.sin(a) * d);
    if (!this.world.isLoaded(x, z)) return null;
    const y = this.world.surfaceY(x, z);
    if (y < 1) return null;
    return { x, y: y + 1, z };
  }

  private canSpawnAt(x: number, y: number, z: number, height: number) {
    if (!IS_SOLID[this.world.getBlock(x, y - 1, z)] || isLeaves(this.world.getBlock(x, y - 1, z))) return false;
    for (let dy = 0; dy < Math.ceil(height); dy++) {
      const id = this.world.getBlock(x, y + dy, z);
      if (IS_SOLID[id] || id === B.WATER) return false;
    }
    return true;
  }

  private trySpawn(type: MobType, x: number, z: number, y?: number) {
    if (!this.world.isLoaded(x, z)) return;
    const sy = y ?? this.world.surfaceY(x, z) + 1;
    if (!this.canSpawnAt(x, sy, z, MOBS[type].height)) return;
    const m = new Mob(type);
    m.setPos(x + 0.5, sy, z + 0.5);
    m.yaw = m.bodyYaw = m.headYaw = this.rng() * Math.PI * 2;
    m.aiTimer = Math.floor(this.rng() * 100);
    this.mobs.push(m);
  }

  // ------------------------------------------------------------------ interaction

  heldStack(): ItemStack | null {
    return this.player.inventory.slots[this.player.selected];
  }

  private reach() {
    return this.player.creative ? REACH_CREATIVE : REACH_SURVIVAL;
  }

  private lookDir(): [number, number, number] {
    const p = this.player;
    return [-Math.sin(p.yaw) * Math.cos(p.pitch), -Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch)];
  }

  private updateTarget() {
    const p = this.player;
    if (p.health <= 0) {
      this.target = null;
      this.targetMob = null;
      return;
    }
    const [dx, dy, dz] = this.lookDir();
    const ex = p.x;
    const ey = p.eyeY();
    const ez = p.z;
    const held = this.heldStack();
    const liquids = held?.id === I.BUCKET;
    this.target = raycastBlocks(this.world, ex, ey, ez, dx, dy, dz, this.reach(), liquids);
    let best = this.target ? this.target.distance : this.reach();
    this.targetMob = null;
    for (const m of this.mobs) {
      if (m.health <= 0) continue;
      const b = m.box();
      const hit = rayBoxWorld(ex, ey, ez, dx, dy, dz, [b[0] - 0.1, b[1] - 0.1, b[2] - 0.1, b[3] + 0.1, b[4] + 0.1, b[5] + 0.1]);
      if (hit !== null && hit < best && hit <= 3.5 + (p.creative ? 1.5 : 0)) {
        best = hit;
        this.targetMob = m;
      }
    }
    if (this.targetMob) this.target = null;
  }

  /** Per-tick mining / eating / repeated placing while buttons are held. */
  private tickInteraction() {
    const p = this.player;
    this.updateTarget();
    if (this.breakCooldown > 0) this.breakCooldown--;
    if (this.useCooldown > 0) this.useCooldown--;
    const c = this.controls;
    const held = this.heldStack();
    const food = held ? item(held.id)?.food : undefined;

    // Eating (hold use with food).
    if (c.use && food && (p.food < 20 || p.creative) && !this.screen) {
      this.eatingTicks++;
      if (this.eatingTicks % 4 === 0 && held) {
        this.eatParticles(held.id);
        if (this.eatingTicks > 6) sound.play('eat', 0.5, 0.8 + this.rng() * 0.4);
      }
      if (this.eatingTicks >= 32) {
        sound.play('burp', 0.5, 0.9 + this.rng() * 0.1);
        p.eat(food.hunger, food.saturation);
        if (!p.creative && held) this.consumeHeld(1);
        this.eatingTicks = 0;
        this.markHud();
        this.emit();
      }
    } else this.eatingTicks = 0;

    if (c.attack && !this.screen && this.eatingTicks === 0) {
      if (this.targetMob) {
        this.breaking = null;
      } else if (this.target) {
        const t = this.target;
        const id = this.world.getBlock(t.x, t.y, t.z);
        if (!this.breaking || this.breaking.x !== t.x || this.breaking.y !== t.y || this.breaking.z !== t.z) {
          this.breaking = { x: t.x, y: t.y, z: t.z, progress: 0 };
        }
        if (this.breakCooldown === 0) {
          this.swing();
          if (p.creative) {
            this.breakBlock(t.x, t.y, t.z, id, false);
            this.breakCooldown = 5;
          } else {
            this.breaking.progress += this.breakSpeed(id);
            if (this.world.time % 4 === 0) {
              this.hitParticles(t);
              this.playAt(`step_${materialOf(id)}`, t.x + 0.5, t.y + 0.5, t.z + 0.5, 0.25, 0.5);
            }
            if (this.breaking.progress >= 1) {
              this.breakBlock(t.x, t.y, t.z, id, true);
              this.breaking = null;
              this.breakCooldown = 5;
            }
          }
        }
      } else this.breaking = null;
    } else this.breaking = null;

    // Holding "use" repeats placing every 4 ticks like Minecraft.
    if (c.use && !food && this.useCooldown === 0 && !this.screen) {
      this.useItem(false);
      this.useCooldown = 4;
    }
  }

  /** Starts an arm swing (6 ticks) unless one is still in its first half. */
  private swing() {
    if (this.swingTicks < 3) this.swingTicks = 6;
  }

  /** Minecraft block breaking speed per tick. */
  private breakSpeed(id: number) {
    const def = block(id);
    if (def.hardness < 0) return 0;
    if (def.hardness === 0) return 1;
    const held = this.heldStack();
    const tool = held ? item(held.id)?.tool : undefined;
    let speed = tool && tool.type === def.tool ? tool.speed : 1;
    if (tool?.type === 'sword' && isLeaves(id)) speed = 1.5;
    const p = this.player;
    if (Entity.pointInWater(this.world, p.x, p.eyeY(), p.z)) speed /= 5;
    if (!p.onGround && !p.flying) speed /= 5;
    return speed / def.hardness / (canHarvest(id, held) ? 30 : 100);
  }

  private breakBlock(x: number, y: number, z: number, id: number, survival: boolean) {
    const held = this.heldStack();
    this.breakParticles(x, y, z, id);
    this.playAt(`dig_${materialOf(id)}`, x + 0.5, y + 0.5, z + 0.5, 1, 0.8 + this.rng() * 0.1);
    this.world.breakBlock(x, y, z, survival ? held : null, survival);
    if (survival) {
      this.player.addExhaustion(0.005);
      if (held && item(held.id)?.tool && block(id).hardness > 0) this.damageHeld(1);
    }
  }

  private damageHeld(amount: number) {
    const p = this.player;
    const s = p.inventory.slots[p.selected];
    if (!s || p.creative) return;
    const tool = item(s.id)?.tool;
    if (!tool) return;
    s.damage += amount;
    if (s.damage >= tool.durability) {
      p.inventory.slots[p.selected] = null;
      this.breakParticles(p.x, p.eyeY() - 0.5, p.z, -1, item(s.id)?.texture);
      this.showToast(`${itemName(s.id)} ist zerbrochen`);
    }
    this.emit();
  }

  private consumeHeld(n: number) {
    const p = this.player;
    const s = p.inventory.slots[p.selected];
    if (!s || p.creative) return;
    s.count -= n;
    if (s.count <= 0) p.inventory.slots[p.selected] = null;
    this.emit();
  }

  /** Primary action pressed once (tap / left click): attack a mob or start mining. */
  attack() {
    if (this.screen || this.player.health <= 0) return;
    this.updateTarget();
    this.swing();
    const m = this.targetMob;
    if (!m) return;
    const p = this.player;
    const held = this.heldStack();
    const tool = held ? item(held.id)?.tool : undefined;
    let dmg = tool ? tool.damage : 1;
    const crit = p.fallDistance > 0 && !p.onGround && !p.inWater;
    if (crit) dmg *= 1.5;
    const kb = 0.4 + (p.sprinting ? 0.5 : 0);
    if (m.damage(dmg, p.x, p.z, kb)) {
      this.playAt('hit', m.x, m.y + 1, m.z, 0.8, 0.9 + this.rng() * 0.2);
      if (m.type !== 'creeper') this.playAt(m.type, m.x, m.y + 1, m.z, 0.8, 1.3);
      p.addExhaustion(0.1);
      if (tool) this.damageHeld(tool.type === 'sword' ? 1 : 2);
      if (crit) for (let i = 0; i < 8; i++) this.spawnSmoke(m.x, m.y + m.height * 0.7, m.z, 0.5);
      if (p.sprinting) p.sprinting = false;
    }
  }

  /** Secondary action (tap / right click): open containers, place blocks, use items. */
  useItem(fromTap = true) {
    if (this.screen || this.player.health <= 0) return;
    const p = this.player;
    this.updateTarget();
    const t = this.target;
    const held = this.heldStack();
    const def = held ? item(held.id) : undefined;

    if (t && !p.sneaking) {
      const id = this.world.getBlock(t.x, t.y, t.z);
      if (id === B.CRAFTING_TABLE) return this.openScreen({ kind: 'crafting', x: t.x, y: t.y, z: t.z });
      if (id === B.FURNACE || id === B.FURNACE_LIT) {
        if (!this.world.getBlockEntity(t.x, t.y, t.z))
          this.world.setBlockEntity(t.x, t.y, t.z, { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnTotal: 0, cook: 0 });
        return this.openScreen({ kind: 'furnace', x: t.x, y: t.y, z: t.z });
      }
      if (id === B.BED) return this.trySleep(t.x, t.y, t.z);
      if (id === B.OAK_DOOR) return this.toggleDoor(t.x, t.y, t.z);
      if (id === B.CHEST) {
        if (!this.world.getBlockEntity(t.x, t.y, t.z))
          this.world.setBlockEntity(t.x, t.y, t.z, { type: 'chest', items: new Array<Slot>(27).fill(null) });
        return this.openScreen({ kind: 'chest', x: t.x, y: t.y, z: t.z });
      }
    }
    if (!held || !def) return;

    // Buckets
    if (held.id === I.BUCKET && t && this.world.getBlock(t.x, t.y, t.z) === B.WATER && this.world.getMeta(t.x, t.y, t.z) === 0) {
      this.world.setBlock(t.x, t.y, t.z, B.AIR);
      this.swing();
      if (!p.creative) {
        this.consumeHeld(1);
        const left = p.inventory.add({ id: I.WATER_BUCKET, count: 1, damage: 0 });
        if (left > 0) this.dropItem(p.x, p.eyeY(), p.z, { id: I.WATER_BUCKET, count: 1, damage: 0 }, true);
      }
      this.emit();
      return;
    }
    if (!t) return;

    // Hoe tills grass/dirt.
    if (def.tool?.type === 'hoe') {
      const id = this.world.getBlock(t.x, t.y, t.z);
      if ((id === B.GRASS || id === B.DIRT) && t.face !== FACE_BOTTOM && this.world.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
        this.world.setBlock(t.x, t.y, t.z, B.FARMLAND);
        this.swing();
        this.damageHeld(1);
      }
      return;
    }

    let placeId: number | undefined = def.places;
    let placeMeta = 0;
    if (held.id === I.WATER_BUCKET) placeId = B.WATER;
    if (placeId === undefined) return;

    // Where to place: into replaceable target blocks, otherwise next to the hit face.
    const targetId = this.world.getBlock(t.x, t.y, t.z);
    let x = t.x;
    let y = t.y;
    let z = t.z;
    let face = t.face;
    if (!block(targetId).replaceable || targetId === placeId) {
      const [dx, dy, dz] = FACE_DIRS[t.face];
      x += dx;
      y += dy;
      z += dz;
    } else face = FACE_TOP;
    if (y < 0 || y >= 128) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== B.AIR && !block(existing).replaceable) return;
    if (existing === B.WATER && placeId === B.WATER) return;

    const pdef = block(placeId);
    const below = this.world.getBlock(x, y - 1, z);
    switch (placeId) {
      case B.OAK_DOOR: {
        const above = this.world.getBlock(x, y + 1, z);
        if (y + 1 >= 128 || (above !== B.AIR && !block(above).replaceable) || !this.world.isSturdy(below)) return;
        const lx = -Math.sin(p.yaw);
        const lz = Math.cos(p.yaw);
        const edge = Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 3 : 1) : lz > 0 ? 0 : 2;
        const box = blockBox(B.OAK_DOOR, edge);
        if (this.boxBlocked(x, y, z, box) || this.boxBlocked(x, y + 1, z, box)) return;
        this.world.setBlock(x, y, z, B.OAK_DOOR, edge, false);
        this.world.setBlock(x, y + 1, z, B.OAK_DOOR, edge | DOOR_UPPER, false);
        this.playAt('dig_wood', x + 0.5, y + 1, z + 0.5, 0.8, 0.8);
        this.swing();
        if (!p.creative) this.consumeHeld(1);
        return;
      }
      case B.LADDER: {
        if (face === FACE_TOP || face === FACE_BOTTOM) return;
        const support = oppositeFace(face);
        const [sx, sy, sz] = FACE_DIRS[support];
        if (!this.world.isSturdy(this.world.getBlock(x + sx, y + sy, z + sz))) return;
        placeMeta = support;
        break;
      }
      case B.TORCH: {
        if (face === FACE_BOTTOM) return;
        const support = oppositeFace(face);
        const [sx, sy, sz] = FACE_DIRS[support];
        if (!this.world.isSturdy(this.world.getBlock(x + sx, y + sy, z + sz))) {
          if (!this.world.isSturdy(below)) return;
          placeMeta = FACE_BOTTOM;
        } else placeMeta = support;
        break;
      }
      case B.WHEAT:
        if (below !== B.FARMLAND) return;
        break;
      case B.CACTUS:
        if (below !== B.SAND && below !== B.CACTUS) return;
        break;
      case B.DEAD_BUSH:
        if (below !== B.SAND) return;
        break;
      case B.SNOW:
        if (!BLOCKS[below].opaque) return;
        break;
      default:
        if (pdef.shape === 'cross' && below !== B.GRASS && below !== B.DIRT && below !== B.FARMLAND) return;
    }
    if (pdef.facing) {
      // The front faces the player (opposite of the horizontal look direction).
      const lx = -Math.sin(p.yaw);
      const lz = Math.cos(p.yaw);
      if (Math.abs(lx) > Math.abs(lz)) placeMeta = lx > 0 ? FACE_WEST : FACE_EAST;
      else placeMeta = lz > 0 ? FACE_NORTH : FACE_SOUTH;
    }
    if (isLeaves(placeId)) placeMeta = LEAF_PERSISTENT;
    if (pdef.solid && this.boxBlocked(x, y, z, pdef.box)) return;

    this.world.setBlock(x, y, z, placeId, placeMeta);
    this.playAt(placeId === B.WATER ? 'splash' : `dig_${materialOf(placeId)}`, x + 0.5, y + 0.5, z + 0.5, 0.8, 0.8);
    this.swing();
    if (!fromTap) this.useCooldown = 4;
    if (!p.creative) {
      if (held.id === I.WATER_BUCKET) {
        p.inventory.slots[p.selected] = { id: I.BUCKET, count: 1, damage: 0 };
        this.emit();
      } else this.consumeHeld(1);
    }
  }

  private toggleDoor(x: number, y: number, z: number) {
    const w = this.world;
    const lowerY = w.getMeta(x, y, z) & DOOR_UPPER ? y - 1 : y;
    const meta = w.getMeta(x, lowerY, z) ^ DOOR_OPEN;
    w.setBlock(x, lowerY, z, B.OAK_DOOR, meta, false);
    w.setBlock(x, lowerY + 1, z, B.OAK_DOOR, meta | DOOR_UPPER, false);
    this.playAt('door', x + 0.5, lowerY + 1, z + 0.5, 0.9, 0.9 + this.rng() * 0.2);
    this.swing();
  }

  /** Sleeping skips the night and sets the spawn point, like Minecraft. */
  private trySleep(x: number, y: number, z: number) {
    const p = this.player;
    if (this.dayInfo().daylight > 0.45) {
      this.showToast('Du kannst nur nachts schlafen');
      return;
    }
    if (this.mobs.some((m) => m.info.hostile && m.health > 0 && Math.abs(m.x - x) < 8 && Math.abs(m.z - z) < 8 && Math.abs(m.y - y) < 5)) {
      this.showToast('Du kannst jetzt nicht schlafen, es sind Monster in der Nähe');
      return;
    }
    this.meta.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5 };
    p.setPos(x + 0.5, y + 0.5625, z + 0.5);
    p.vx = p.vy = p.vz = 0;
    this.sleepTicks = 1;
    this.showToast('Einstiegspunkt gesetzt');
  }

  private boxBlocked(x: number, y: number, z: number, bb: readonly number[]) {
    const test = (e: Entity) => {
      const b = e.box();
      return b[3] > x + bb[0] && b[0] < x + bb[3] && b[4] > y + bb[1] && b[1] < y + bb[4] && b[5] > z + bb[2] && b[2] < z + bb[5];
    };
    if (this.player.health > 0 && test(this.player)) return true;
    return this.mobs.some((m) => m.health > 0 && test(m));
  }

  /** Use button pressed: act once now, then repeat every 4 ticks while held. */
  pressUse() {
    this.controls.use = true;
    const held = this.heldStack();
    if (held && item(held.id)?.food) return;
    this.useItem(true);
    this.useCooldown = 5;
  }

  /** Attack button pressed: hit the targeted mob right away (mining continues per tick). */
  pressAttack() {
    this.controls.attack = true;
    this.attack();
  }

  /** Short tap on touch screens: attack a targeted mob, otherwise use/place. */
  tap() {
    this.updateTarget();
    if (this.targetMob) this.attack();
    else this.useItem(true);
  }

  getUiSnapshot(): UiSnapshot {
    if (this.snapshot && this.snapshot.version === this.uiVersion) return this.snapshot;
    const copy = (arr: Slot[]) => arr.map((s) => (s ? { ...s } : null));
    const be = this.containerEntity();
    this.snapshot = {
      version: this.uiVersion,
      inventory: copy(this.player.inventory.slots),
      craft: copy(this.craftGrid),
      craftSize: this.craftSize,
      result: this.craftResult(),
      cursor: this.cursor ? { ...this.cursor } : null,
      chest: be?.type === 'chest' ? copy(be.items) : null,
      furnace:
        be?.type === 'furnace'
          ? {
              slots: copy([be.input, be.fuel, be.output]),
              burn: be.burnTotal > 0 ? be.burn / be.burnTotal : 0,
              cook: be.cook / 200,
            }
          : null,
      selected: this.player.selected,
      creative: this.player.creative,
    };
    return this.snapshot;
  }

  /** Middle click: select (or in creative, get) the targeted block. */
  pickBlock() {
    const t = this.target;
    if (!t) return;
    let id = this.world.getBlock(t.x, t.y, t.z);
    if (id === B.FURNACE_LIT) id = B.FURNACE;
    if (!item(id)) return;
    const p = this.player;
    const inv = p.inventory.slots;
    const idx = inv.findIndex((s, i) => i < 9 && s?.id === id);
    if (idx >= 0) p.selected = idx;
    else if (p.creative) inv[p.selected] = { id, count: maxStack(id), damage: 0 };
    this.emit();
  }

  selectSlot(i: number) {
    if (i === this.player.selected) return;
    this.player.selected = ((i % 9) + 9) % 9;
    const s = this.heldStack();
    if (s) this.showToast(itemName(s.id));
    this.eatingTicks = 0;
    this.emit();
  }

  /** Throws the held item (Q). */
  dropHeld(all: boolean) {
    const p = this.player;
    const s = p.inventory.slots[p.selected];
    if (!s || p.health <= 0) return;
    const n = all ? s.count : 1;
    const thrown = { ...s, count: n };
    s.count -= n;
    if (s.count <= 0) p.inventory.slots[p.selected] = null;
    this.dropItem(p.x, p.eyeY() - 0.3, p.z, thrown, true);
    this.emit();
  }

  dropItem(x: number, y: number, z: number, s: ItemStack, thrown: boolean, scatter = false) {
    const e = new ItemEntity({ ...s });
    e.setPos(x, y, z);
    if (thrown && !scatter) {
      const [dx, dy, dz] = this.lookDir();
      e.vx = dx * 0.3;
      e.vy = dy * 0.3 + 0.1;
      e.vz = dz * 0.3;
      e.pickupDelay = 40;
    } else {
      e.vx = (this.rng() - 0.5) * (scatter ? 0.5 : 0.2);
      e.vy = 0.2;
      e.vz = (this.rng() - 0.5) * (scatter ? 0.5 : 0.2);
    }
    this.items.push(e);
  }

  private explode(x: number, y: number, z: number, power: number) {
    const world = this.world;
    this.playAt('explode', x, y, z, 4, 0.8 + this.rng() * 0.2, 16);
    const destroyed = new Set<string>();
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 16; j++)
        for (let k = 0; k < 16; k++) {
          if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
          let dx = i / 15 * 2 - 1;
          let dy = j / 15 * 2 - 1;
          let dz = k / 15 * 2 - 1;
          const len = Math.hypot(dx, dy, dz);
          dx /= len;
          dy /= len;
          dz /= len;
          let intensity = power * (0.7 + this.rng() * 0.6);
          let px = x;
          let py = y;
          let pz = z;
          while (intensity > 0) {
            const bx = Math.floor(px);
            const by = Math.floor(py);
            const bz = Math.floor(pz);
            const id = world.getBlock(bx, by, bz);
            if (id !== B.AIR) {
              const res = BLAST_RESISTANCE[id] ?? Math.max(0, block(id).hardness);
              intensity -= (res + 0.3) * 0.3;
              if (intensity > 0 && id !== B.WATER && by >= 0) destroyed.add(`${bx},${by},${bz}`);
            }
            px += dx * 0.3;
            py += dy * 0.3;
            pz += dz * 0.3;
            intensity -= 0.225;
          }
        }
    for (const key of destroyed) {
      const [bx, by, bz] = key.split(',').map(Number);
      const id = world.getBlock(bx, by, bz);
      if (id === B.AIR || id === B.BEDROCK) continue;
      const meta = world.getMeta(bx, by, bz);
      const be = world.getBlockEntity(bx, by, bz);
      if (be) world.breakBlock(bx, by, bz, null, true);
      else {
        world.setBlock(bx, by, bz, B.AIR);
        if (this.rng() < 1 / power)
          for (const s of blockDrops(id, meta, null, this.rng, true)) this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, s, false);
      }
    }
    for (let i = 0; i < 40; i++) this.spawnSmoke(x + (this.rng() - 0.5) * power * 2, y + (this.rng() - 0.5) * power * 2, z + (this.rng() - 0.5) * power * 2, 2);

    const damageEntity = (e: Entity, hurt: (dmg: number) => void) => {
      const d = Math.hypot(e.x - x, e.y + e.height / 2 - y, e.z - z) / (power * 2);
      if (d > 1) return;
      const impact = 1 - d;
      const dmg = Math.floor(((impact * impact + impact) / 2) * 7 * power * 2 + 1);
      hurt(dmg);
      const len = Math.hypot(e.x - x, e.y - y, e.z - z) || 1;
      e.vx += ((e.x - x) / len) * impact;
      e.vy += ((e.y - y) / len) * impact * 0.6 + 0.2;
      e.vz += ((e.z - z) / len) * impact;
    };
    const p = this.player;
    damageEntity(p, (dmg) => {
      p.hurtCooldown = 0;
      p.damage(dmg);
    });
    for (const m of this.mobs)
      damageEntity(m, (dmg) => {
        m.hurtCooldown = 0;
        if (m.damage(dmg) && m.health <= 0) this.onMobDeath(m);
      });
    for (const it of this.items) if (Math.hypot(it.x - x, it.y - y, it.z - z) < power) it.dead = true;
    this.markHud();
  }

  // ------------------------------------------------------------------ particles

  private breakParticles(x: number, y: number, z: number, id: number, tileOverride?: number) {
    const t = tileOverride ?? particleTile(id);
    if (id === B.AIR || id === B.WATER) return;
    const n = 4;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++) {
          if (this.particles.length > 600) return;
          const px = x + (i + 0.5) / n;
          const py = y + (j + 0.5) / n;
          const pz = z + (k + 0.5) / n;
          this.particles.push({
            x: px,
            y: py,
            z: pz,
            vx: (px - x - 0.5) * 0.15 + (this.rng() - 0.5) * 0.05,
            vy: (py - y - 0.5) * 0.15 + 0.1 + this.rng() * 0.05,
            vz: (pz - z - 0.5) * 0.15 + (this.rng() - 0.5) * 0.05,
            life: 0,
            maxLife: 8 + Math.floor(this.rng() * 18),
            size: 0.1 + this.rng() * 0.08,
            tile: t,
            u: Math.floor(this.rng() * 12),
            v: Math.floor(this.rng() * 12),
            uvSize: 4,
            gravity: 0.04,
            brightness: -1,
          });
        }
  }

  private hitParticles(t: BlockHit) {
    const id = this.world.getBlock(t.x, t.y, t.z);
    const tl = particleTile(id, t.face);
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: t.px + (this.rng() - 0.5) * 0.3,
        y: t.py + (this.rng() - 0.5) * 0.3,
        z: t.pz + (this.rng() - 0.5) * 0.3,
        vx: (this.rng() - 0.5) * 0.08,
        vy: 0.05 + this.rng() * 0.05,
        vz: (this.rng() - 0.5) * 0.08,
        life: 0,
        maxLife: 8 + Math.floor(this.rng() * 8),
        size: 0.08,
        tile: tl,
        u: Math.floor(this.rng() * 12),
        v: Math.floor(this.rng() * 12),
        uvSize: 4,
        gravity: 0.04,
        brightness: -1,
      });
    }
  }

  private eatParticles(itemId: number) {
    const p = this.player;
    const [dx, , dz] = this.lookDir();
    const tl = item(itemId)?.texture ?? 0;
    for (let i = 0; i < 3; i++)
      this.particles.push({
        x: p.x + dx * 0.4,
        y: p.eyeY() - 0.25,
        z: p.z + dz * 0.4,
        vx: (this.rng() - 0.5) * 0.1,
        vy: 0.08,
        vz: (this.rng() - 0.5) * 0.1,
        life: 0,
        maxLife: 10,
        size: 0.08,
        tile: tl,
        u: 4 + Math.floor(this.rng() * 8),
        v: 4 + Math.floor(this.rng() * 8),
        uvSize: 3,
        gravity: 0.04,
        brightness: -1,
      });
  }

  private spawnSmoke(x: number, y: number, z: number, size: number) {
    if (this.particles.length > 700) return;
    this.particles.push({
      x,
      y,
      z,
      vx: (this.rng() - 0.5) * 0.05,
      vy: 0.02 + this.rng() * 0.03,
      vz: (this.rng() - 0.5) * 0.05,
      life: 0,
      maxLife: 20 + Math.floor(this.rng() * 20),
      size: 0.2 * size + this.rng() * 0.2,
      tile: tile('smoke'),
      u: 0,
      v: 0,
      uvSize: 16,
      gravity: -0.002,
      brightness: 0.9,
    });
  }

  // ------------------------------------------------------------------ screens & containers

  openScreen(s: Screen) {
    this.controls.attack = false;
    this.controls.use = false;
    this.breaking = null;
    if (s.kind === 'inventory') {
      this.craftSize = 2;
      this.craftGrid = [null, null, null, null];
    } else if (s.kind === 'crafting') {
      this.craftSize = 3;
      this.craftGrid = new Array<Slot>(9).fill(null);
    }
    this.screen = s;
    this.emit();
  }

  /** Closes the open screen; crafting grid and cursor items go back to the inventory. */
  closeScreen() {
    const p = this.player;
    const back = [...this.craftGrid, this.cursor];
    for (const s of back) {
      if (!s) continue;
      const left = p.inventory.add(s);
      if (left > 0) this.dropItem(p.x, p.eyeY() - 0.3, p.z, { ...s, count: left }, true);
    }
    this.craftGrid = this.craftGrid.map(() => null);
    this.cursor = null;
    if (this.screen?.kind === 'chest' || this.screen?.kind === 'furnace') this.world.touchBlockEntity(this.screen.x, this.screen.z);
    this.screen = null;
    this.emit();
  }

  pause() {
    if (this.screen) return;
    this.controls.attack = false;
    this.controls.use = false;
    this.screen = { kind: 'pause' };
    this.save();
    this.emit();
  }

  setScreen(s: Screen | null) {
    this.screen = s;
    this.emit();
  }

  containerEntity(): FurnaceEntity | ChestEntity | null {
    const s = this.screen;
    if (!s || (s.kind !== 'furnace' && s.kind !== 'chest')) return null;
    const be = this.world.getBlockEntity(s.x, s.y, s.z);
    return be ?? null;
  }

  craftResult(): ItemStack | null {
    return findRecipe(this.craftGrid, this.craftSize);
  }

  /** Slot interaction from the UI. */
  clickSlot(container: 'inv' | 'craft' | 'chest' | 'furnace', index: number, right: boolean) {
    let slots: Slot[] | null = null;
    if (container === 'inv') slots = this.player.inventory.slots;
    else if (container === 'craft') slots = this.craftGrid;
    else {
      const be = this.containerEntity();
      if (be?.type === 'chest' && container === 'chest') slots = be.items;
      if (be?.type === 'furnace' && container === 'furnace') {
        // furnace: 0 input, 1 fuel, 2 output (take only)
        const arr: Slot[] = [be.input, be.fuel, be.output];
        if (index === 2) {
          if (be.output) {
            const r = takeOutput(be.output, this.cursor);
            if (r.taken) {
              this.cursor = r.cursor;
              be.output = null;
            }
          }
        } else {
          this.cursor = clickSlot(arr, index, this.cursor, right);
          be.input = arr[0];
          be.fuel = arr[1];
        }
        if (this.screen?.kind === 'furnace') this.world.touchBlockEntity(this.screen.x, this.screen.z);
        this.emit();
        return;
      }
    }
    if (!slots) return;
    this.cursor = clickSlot(slots, index, this.cursor, right);
    const s = this.screen;
    if (s && (s.kind === 'chest' || s.kind === 'furnace')) this.world.touchBlockEntity(s.x, s.z);
    this.emit();
  }

  /** Tap on a slot: click, or quick-move on shift-click / double tap. */
  slotTap(container: 'inv' | 'craft' | 'chest' | 'furnace', index: number, shift: boolean) {
    const key = `${container}:${index}`;
    const now = Date.now();
    if (shift && !this.cursor) {
      this.quickMove(container, index);
      return;
    }
    if (this.lastSlotTap.key === key && now - this.lastSlotTap.time < 300) {
      if (this.cursor) this.clickSlot(container, index, false);
      this.quickMove(container, index);
      this.lastSlotTap = { key: '', time: 0 };
      return;
    }
    this.lastSlotTap = { key, time: now };
    this.clickSlot(container, index, false);
  }

  // ---- control input (called by touch/keyboard handlers)

  setMovement(forward: number, strafe: number, sprint: boolean) {
    this.controls.forward = forward;
    this.controls.strafe = strafe;
    this.controls.sprint = sprint;
  }

  setJump(on: boolean) {
    this.controls.jump = on;
  }

  setSneak(on: boolean) {
    this.controls.sneak = on;
  }

  addLook(yaw: number, pitch: number) {
    this.controls.lookYaw += yaw;
    this.controls.lookPitch += pitch;
  }

  /** Touch hold started: eat when holding food, otherwise mine/attack. */
  startHold() {
    const held = this.heldStack();
    if (held && item(held.id)?.food) this.controls.use = true;
    else this.pressAttack();
  }

  releaseActions() {
    this.controls.attack = false;
    this.controls.use = false;
  }

  toggleThirdPerson() {
    this.thirdPerson = !this.thirdPerson;
  }

  /** Takes the crafting result (all = shift-click crafts as many as possible into the inventory). */
  takeCraftResult(all: boolean) {
    let result = this.craftResult();
    if (!result) return;
    if (!all) {
      const r = takeOutput(result, this.cursor);
      if (!r.taken) return;
      this.cursor = r.cursor;
      consumeIngredients(this.craftGrid);
    } else {
      let guard = 0;
      while (result && guard++ < 64) {
        const left = this.player.inventory.add(result);
        if (left > 0) {
          this.dropItem(this.player.x, this.player.eyeY() - 0.3, this.player.z, { ...result, count: left }, true);
        }
        consumeIngredients(this.craftGrid);
        result = this.craftResult();
      }
    }
    this.emit();
  }

  /** Quick-move a stack between hotbar/inventory or into/out of a container (shift-click). */
  quickMove(container: 'inv' | 'chest' | 'furnace' | 'craft', index: number) {
    const p = this.player;
    const be = this.containerEntity();
    if (container === 'inv') {
      const s = p.inventory.slots[index];
      if (!s) return;
      if (be?.type === 'chest') {
        p.inventory.slots[index] = null;
        const left = addTo(be.items, s);
        if (left > 0) p.inventory.slots[index] = { ...s, count: left };
      } else if (be?.type === 'furnace') {
        const slotKey = smeltResult(s.id) !== null ? 'input' : (item(s.id)?.fuel ?? 0) > 0 ? 'fuel' : null;
        if (!slotKey) return;
        p.inventory.slots[index] = null;
        const cur = be[slotKey];
        if (!cur) be[slotKey] = s;
        else if (cur.id === s.id && cur.count < maxStack(s.id)) {
          const n = Math.min(s.count, maxStack(s.id) - cur.count);
          cur.count += n;
          if (s.count - n > 0) p.inventory.slots[index] = { ...s, count: s.count - n };
        } else p.inventory.slots[index] = s;
      } else {
        // hotbar <-> main inventory
        p.inventory.slots[index] = null;
        const range = index < 9 ? [9, 36] : [0, 9];
        const left = addTo(p.inventory.slots, s, range[0], range[1]);
        if (left > 0) p.inventory.slots[index] = { ...s, count: left };
      }
    } else {
      let src: Slot = null;
      if (container === 'chest' && be?.type === 'chest') {
        src = be.items[index];
        be.items[index] = null;
      } else if (container === 'furnace' && be?.type === 'furnace') {
        const key = (['input', 'fuel', 'output'] as const)[index];
        src = be[key];
        be[key] = null;
      } else if (container === 'craft') {
        src = this.craftGrid[index];
        this.craftGrid[index] = null;
      }
      if (!src) return;
      const left = p.inventory.add(src);
      if (left > 0) {
        const back = { ...src, count: left };
        if (container === 'chest' && be?.type === 'chest') be.items[index] = back;
        else if (container === 'furnace' && be?.type === 'furnace') be[(['input', 'fuel', 'output'] as const)[index]] = back;
        else if (container === 'craft') this.craftGrid[index] = back;
      }
    }
    const s = this.screen;
    if (s && (s.kind === 'chest' || s.kind === 'furnace')) this.world.touchBlockEntity(s.x, s.z);
    this.emit();
  }

  /** Drops the cursor stack (click outside the window). */
  dropCursor(all: boolean) {
    if (!this.cursor) return;
    const n = all ? this.cursor.count : 1;
    const p = this.player;
    this.dropItem(p.x, p.eyeY() - 0.3, p.z, { ...this.cursor, count: n }, true);
    this.cursor.count -= n;
    if (this.cursor.count <= 0) this.cursor = null;
    this.emit();
  }

  /** Creative inventory: put an item into the selected hotbar slot. */
  creativePick(id: number, toCursor: boolean) {
    const s = { id, count: maxStack(id), damage: 0 };
    if (toCursor) this.cursor = s;
    else this.player.inventory.slots[this.player.selected] = s;
    this.emit();
  }

  creativeClearSlot(index: number) {
    this.player.inventory.slots[index] = null;
    this.emit();
  }

  // ------------------------------------------------------------------ saving

  save() {
    const w = this.world;
    for (const c of w.chunks.values()) {
      if (w.storeChunk(c)) {
        const s = w.saved.get(chunkId(c.cx, c.cz));
        if (s) saveChunk(this.meta.id, c.cx, c.cz, s);
      }
    }
    this.meta.time = w.time;
    this.meta.lastPlayed = Date.now();
    if (this.loadedOnce) this.meta.player = this.player.toSave();
    saveWorldMeta(this.meta);
  }

  // ------------------------------------------------------------------ render frame

  private lightAt(x: number, y: number, z: number, skyDarken: number): [number, number, number] {
    const l = this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    const sky = lightBrightness(Math.max(0, (l >> 4) - skyDarken), this.settings.gamma);
    const blk = lightBrightness(l & 15, this.settings.gamma);
    return [Math.max(sky, blk), Math.max(sky, blk * 0.93), Math.max(sky, blk * 0.82)];
  }

  private buildFrame(alpha: number, width: number, height: number): RenderFrame {
    const p = this.player;
    const day = this.dayInfo();
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const px = lerp(p.prevX, p.x);
    const py = lerp(p.prevY, p.y);
    const pz = lerp(p.prevZ, p.z);
    const eye = lerp(p.prevEyeHeight, p.eyeHeight);
    let camX = px;
    let camY = py + eye;
    let camZ = pz;
    if (p.health <= 0) camY = py + 0.3;

    if (this.thirdPerson) {
      const [dx, dy, dz] = this.lookDir();
      let dist = 4;
      const hit = raycastBlocks(this.world, camX, camY, camZ, -dx, -dy, -dz, 4);
      if (hit) dist = Math.max(0.5, hit.distance - 0.2);
      camX -= dx * dist;
      camY -= dy * dist;
      camZ -= dz * dist;
    }

    // FOV changes when sprinting/flying like Minecraft.
    const targetFov = (p.sprinting ? 1.15 : 1) * (p.flying ? 1.1 : 1);
    this.fovFactor += (targetFov - this.fovFactor) * 0.2;
    const underwater = Entity.pointInWater(this.world, camX, camY, camZ);
    const fov = this.settings.fov * this.fovFactor * (underwater ? 0.9 : 1);

    const walk = lerp(p.prevWalkDist, p.walkDist);
    const bob = this.settings.viewBobbing && !this.thirdPerson ? lerp(p.prevBob, p.bob) : 0;
    const hurtF = this.hurtCamera > 0 ? (this.hurtCamera - alpha) / 10 : 0;
    const roll = hurtF > 0 ? -Math.sin(hurtF * hurtF * hurtF * hurtF * Math.PI) * 0.24 : 0;

    const mobs: MobRender[] = [];
    for (const m of this.mobs) {
      const mx = lerp(m.prevX, m.x);
      const my = lerp(m.prevY, m.y);
      const mz = lerp(m.prevZ, m.z);
      if (Math.hypot(mx - px, mz - pz) > this.settings.renderDistance * 16) continue;
      const fuse = m.type === 'creeper' ? lerp(m.prevFuse, m.fuse) / 30 : 0;
      const sc = 1 + fuse * 0.12 * (1 + Math.sin(fuse * 30) * 0.3);
      mobs.push({
        model: m.type,
        x: mx,
        y: my,
        z: mz,
        bodyYaw: m.bodyYaw,
        headYaw: m.headYaw - m.bodyYaw,
        headPitch: m.headPitch,
        limbSwing: m.limbSwing,
        limbAmount: lerp(m.prevLimbAmount, m.limbAmount),
        swing: m.swingTime / 6,
        light: this.lightAt(mx, my + m.height * 0.6, mz, day.skyDarken),
        hurt: m.hurtTime > 0 || m.health <= 0 ? 1 : 0,
        flash: fuse > 0 && Math.floor(fuse * 10) % 2 === 0 ? fuse : 0,
        burning: m.fireTicks > 0,
        death: m.health <= 0 ? (m.deathTime + alpha) / 20 : 0,
        scale: sc,
        armsForward: m.type === 'zombie',
      });
    }
    if (this.thirdPerson && p.health > 0) {
      mobs.push({
        model: 'player',
        x: px,
        y: py - (p.sneaking ? 0.1 : 0),
        z: pz,
        bodyYaw: p.yaw,
        headYaw: 0,
        headPitch: p.pitch,
        limbSwing: p.limbSwing,
        limbAmount: lerp(p.prevLimbAmount, p.limbAmount),
        swing: this.swingTicks / 6,
        light: this.lightAt(px, py + 1, pz, day.skyDarken),
        hurt: p.hurtTime > 0 ? 1 : 0,
        flash: 0,
        burning: false,
        death: 0,
        scale: 0.9375,
        armsForward: false,
      });
    }

    const items = [];
    for (const it of this.items) {
      const ix = lerp(it.prevX, it.x);
      const iy = lerp(it.prevY, it.y);
      const iz = lerp(it.prevZ, it.z);
      if (Math.hypot(ix - px, iz - pz) > 48) continue;
      const age = it.age + alpha;
      items.push({
        x: ix,
        y: iy + Math.sin(age / 10 + it.hover) * 0.1 + 0.1,
        z: iz,
        itemId: it.stack.id,
        spin: age / 20 + it.hover,
        light: this.lightAt(ix, iy + 0.2, iz, day.skyDarken),
        full: false,
      });
    }
    for (const f of this.falling) {
      const fx = lerp(f.prevX, f.x);
      const fy = lerp(f.prevY, f.y);
      const fz = lerp(f.prevZ, f.z);
      items.push({ x: fx, y: fy, z: fz, itemId: f.blockId, spin: 0, light: this.lightAt(fx, fy + 0.5, fz, day.skyDarken), full: true });
    }

    const particles = this.particles.map((pt) => {
      const b = this.lightAt(pt.x, pt.y, pt.z, day.skyDarken)[0] * (pt.brightness >= 0 ? pt.brightness : 1);
      return { x: pt.x, y: pt.y, z: pt.z, size: pt.size * (pt.gravity < 0 ? 1 + pt.life / pt.maxLife : 1), tile: pt.tile, u: pt.u, v: pt.v, uvSize: pt.uvSize, brightness: b };
    });

    const t = this.target;
    const selection = t && !this.screen ? { x: t.x, y: t.y, z: t.z, box: selectionBox(this.world, t.x, t.y, t.z, this.world.getBlock(t.x, t.y, t.z), true) ?? [0, 0, 0, 1, 1, 1] } : null;
    const breaking = this.breaking && this.breaking.progress > 0 ? { x: this.breaking.x, y: this.breaking.y, z: this.breaking.z, stage: Math.min(9, Math.floor(this.breaking.progress * 10)) } : null;

    const held = this.heldStack();
    const swing = this.swingTicks > 0 ? 1 - (lerp(this.swingPrev, this.swingTicks) / 6) : 0;
    const hand =
      this.thirdPerson || p.health <= 0
        ? null
        : {
            itemId: held ? held.id : null,
            swing: swing >= 1 ? 0 : swing,
            equip: lerp(this.prevEquip, this.equip),
            light: this.lightAt(px, py + eye, pz, day.skyDarken),
            eating: this.eatingTicks > 0 ? Math.min(1, this.eatingTicks / 6) + this.eatingTicks / 100 : 0,
          };

    return {
      width,
      height,
      camera: {
        x: camX,
        y: camY,
        z: camZ,
        yaw: p.yaw,
        pitch: p.pitch,
        fov,
        roll,
        bobX: Math.sin(walk * Math.PI) * bob * 0.5,
        bobY: -Math.abs(Math.cos(walk * Math.PI) * bob),
      },
      celestial: day.celestial,
      skyDarken: day.skyDarken,
      daylight: day.daylight,
      renderDistance: this.settings.renderDistance,
      underwater,
      gamma: this.settings.gamma,
      clouds: this.settings.clouds,
      cloudOffset: this.cloudOffset,
      selection,
      breaking,
      mobs,
      items,
      particles,
      hand,
      fancy: this.settings.fancyGraphics,
    };
  }
}

const PARTICLE_TILES: Partial<Record<number, string>> = {
  [B.GRASS]: 'dirt',
  [B.TALL_GRASS]: 'tall_grass_tinted',
  [B.OAK_LEAVES]: 'oak_leaves_tinted',
  [B.BIRCH_LEAVES]: 'birch_leaves_tinted',
  [B.SPRUCE_LEAVES]: 'spruce_leaves_tinted',
};

/** Texture for break/hit particles (tinted blocks use pre-tinted copies). */
function particleTile(id: number, face = 2): number {
  const name = PARTICLE_TILES[id];
  if (name) return tile(name);
  if (id < 0) return 0;
  const def = block(id);
  return def.faces[def.shape === 'cube' || def.shape === 'box' ? face : 0];
}

function addTo(slots: Slot[], s: ItemStack, from = 0, to = slots.length): number {
  let left = s.count;
  const max = maxStack(s.id);
  for (let i = from; i < to && left > 0; i++) {
    const t = slots[i];
    if (t && t.id === s.id && t.damage === s.damage && t.count < max) {
      const n = Math.min(left, max - t.count);
      t.count += n;
      left -= n;
    }
  }
  for (let i = from; i < to && left > 0; i++) {
    if (!slots[i]) {
      const n = Math.min(left, max);
      slots[i] = { ...s, count: n };
      left -= n;
    }
  }
  return left;
}

function rayBoxWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: number[]): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b[a] || o[a] > b[a + 3]) return null;
      continue;
    }
    let t1 = (b[a] - o[a]) / d[a];
    let t2 = (b[a + 3] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

