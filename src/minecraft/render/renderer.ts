import { DESTROY_TILES } from '../blocks';
import { SECTION_SIZE } from '../constants';
import { mulberry32 } from '../rng';
import { ATLAS_SIZE, buildAtlas, tile } from '../textures/atlas';
import { createBuffer, createProgram, type GL, type Program } from './glutil';
import {
  boxInFrustum,
  frustumPlanes,
  identity,
  mat4,
  multiply,
  perspective,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  translate,
  viewRotation,
  type Mat4,
} from './mat4';
import { MAX_QUADS, POS_SCALE, quadIndices, UV_SCALE, VERTEX_BYTES, type SectionMeshData } from './mesher';
import { FLOATS_PER_VERTEX, getModels, itemMesh, blockMesh, quadMesh, starMesh, tileUV, type MeshSource } from './models';

const CHUNK_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute vec3 aLight;
attribute vec3 aTint;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform vec2 uUVScale;
uniform float uSkyDarken;
uniform vec3 uSkyColor;
uniform float uGamma;
uniform vec2 uFog;
varying vec2 vUV;
varying vec3 vColor;
varying float vFog;
float curve(float l) {
  float f = l / 15.0;
  float b = f / (3.0 - 2.0 * f);
  b = mix(b, 1.0 - pow(1.0 - b, 4.0), uGamma);
  return 0.04 + 0.96 * b;
}
void main() {
  vec3 p = aPos * ${(1 / POS_SCALE).toFixed(8)} + uOffset;
  gl_Position = uViewProj * vec4(p, 1.0);
  vUV = aUV * uUVScale;
  float sky = max(aLight.x / 16.0 - uSkyDarken, 0.0);
  float blk = aLight.y / 16.0;
  vec3 light = max(vec3(curve(sky)) * uSkyColor, vec3(curve(blk)) * vec3(1.0, 0.93, 0.82));
  vColor = light * (aLight.z / 255.0) * (aTint / 255.0);
  vFog = clamp((length(p) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
}`;

const CHUNK_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uFogColor;
uniform float uAlphaTest;
varying vec2 vUV;
varying vec3 vColor;
varying float vFog;
void main() {
  vec4 c = texture2D(uTex, vUV);
  if (c.a < uAlphaTest) discard;
  gl_FragColor = vec4(mix(c.rgb * vColor, uFogColor, vFog), c.a);
}`;

const ENTITY_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aShade;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec2 uUVOffset;
uniform vec2 uFog;
varying vec2 vUV;
varying float vShade;
varying vec3 vPos;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * p;
  vUV = aUV + uUVOffset;
  vShade = aShade;
  vPos = p.xyz;
}`;

const ENTITY_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
uniform vec4 uOverlay;
uniform float uAlpha;
uniform float uAlphaTest;
uniform vec3 uFogColor;
uniform vec2 uFog;
varying vec2 vUV;
varying float vShade;
varying vec3 vPos;
void main() {
  vec4 c = texture2D(uTex, vUV);
  if (c.a < uAlphaTest) discard;
  vec3 col = mix(c.rgb, uOverlay.rgb, uOverlay.a) * uLight * vShade;
  float fog = clamp((length(vPos) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, fog), c.a * uAlpha);
}`;

const COLOR_VS = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
varying vec4 vColor;
varying vec3 vPos;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * p;
  vColor = aColor;
  vPos = p.xyz;
}`;

const COLOR_FS = `
precision mediump float;
uniform vec3 uFogColor;
uniform vec2 uFog;
varying vec4 vColor;
varying vec3 vPos;
void main() {
  float fog = clamp((length(vPos) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(vColor.rgb, uFogColor, fog), vColor.a);
}`;

export interface CameraState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Camera roll (hurt tilt) in radians. */
  roll: number;
  /** View bobbing offsets. */
  bobX: number;
  bobY: number;
}

export interface MobRender {
  model: string;
  x: number;
  y: number;
  z: number;
  bodyYaw: number;
  headYaw: number;
  headPitch: number;
  limbSwing: number;
  limbAmount: number;
  /** 0..1 attack swing for arms. */
  swing: number;
  light: [number, number, number];
  /** Red hurt flash 0..1, white creeper flash 0..1, fire tint. */
  hurt: number;
  flash: number;
  burning: boolean;
  /** Death tilt 0..1. */
  death: number;
  scale: number;
  /** Zombies hold their arms forward. */
  armsForward: boolean;
}

export interface ItemRender {
  x: number;
  y: number;
  z: number;
  itemId: number;
  /** Rotation angle in radians. */
  spin: number;
  light: [number, number, number];
  /** Falling blocks render full size. */
  full: boolean;
}

export interface ParticleRender {
  x: number;
  y: number;
  z: number;
  size: number;
  tile: number;
  /** Sub-rectangle of the tile in pixels. */
  u: number;
  v: number;
  uvSize: number;
  brightness: number;
}

export interface HandRender {
  itemId: number | null;
  /** Swing progress 0..1 (0 = idle). */
  swing: number;
  /** 0 = fully raised, 1 = lowered (switching items). */
  equip: number;
  light: [number, number, number];
  /** Eating animation 0..1. */
  eating: number;
}

export interface RenderFrame {
  width: number;
  height: number;
  camera: CameraState;
  /** Celestial angle 0..1 (0 = noon... like Minecraft's calculateCelestialAngle). */
  celestial: number;
  /** Subtract from sky light (0 day … 11 night). */
  skyDarken: number;
  /** Sky brightness 0..1. */
  daylight: number;
  renderDistance: number;
  underwater: boolean;
  gamma: number;
  clouds: boolean;
  cloudOffset: number;
  selection: { x: number; y: number; z: number; box: readonly number[] } | null;
  breaking: { x: number; y: number; z: number; stage: number } | null;
  mobs: MobRender[];
  items: ItemRender[];
  particles: ParticleRender[];
  hand: HandRender | null;
  fancy: boolean;
}

interface GpuMesh {
  buffer: WebGLBuffer;
  vertices: number;
}

interface SectionGpu {
  cx: number;
  cz: number;
  sy: number;
  opaque: { buffer: WebGLBuffer; quads: number } | null;
  translucent: { buffer: WebGLBuffer; quads: number } | null;
}

function sectionKey(cx: number, cz: number, sy: number) {
  return (cx * 65536 + cz) * 16 + sy;
}

/** Brightness curve shared with the shaders. */
export function lightBrightness(level: number, gamma: number) {
  const f = level / 15;
  let b = f / (3 - 2 * f);
  b = b + (1 - Math.pow(1 - b, 4) - b) * gamma;
  return 0.04 + 0.96 * b;
}

/** Renders the voxel world, sky, entities and first-person hand with WebGL 1. */
export class Renderer {
  private chunkProg: Program;
  private entityProg: Program;
  private colorProg: Program;
  private atlas: WebGLTexture;
  private cloudTex: WebGLTexture;
  private indexBuffer: WebGLBuffer;
  private sections = new Map<number, SectionGpu>();
  private meshCache = new Map<string, GpuMesh>();
  private proj = mat4();
  private view = mat4();
  private viewProj = mat4();
  private model = mat4();
  private planes = new Float32Array(24);
  private dynamicBuffer: WebGLBuffer;
  private dynamicCapacity = 0;
  private colorBuffer: WebGLBuffer;
  private fogColor: [number, number, number] = [0.7, 0.8, 1];
  private fogRange: [number, number] = [0, 1];
  /** Sections drawn last frame (debug). */
  drawnSections = 0;

  constructor(private gl: GL) {
    this.chunkProg = createProgram(
      gl,
      CHUNK_VS,
      CHUNK_FS,
      ['aPos', 'aUV', 'aLight', 'aTint'],
      ['uViewProj', 'uOffset', 'uUVScale', 'uSkyDarken', 'uSkyColor', 'uGamma', 'uFog', 'uTex', 'uFogColor', 'uAlphaTest']
    );
    this.entityProg = createProgram(
      gl,
      ENTITY_VS,
      ENTITY_FS,
      ['aPos', 'aUV', 'aShade'],
      ['uViewProj', 'uModel', 'uUVOffset', 'uFog', 'uTex', 'uLight', 'uOverlay', 'uAlpha', 'uAlphaTest', 'uFogColor']
    );
    this.colorProg = createProgram(gl, COLOR_VS, COLOR_FS, ['aPos', 'aColor'], ['uViewProj', 'uModel', 'uFog', 'uFogColor']);

    this.atlas = this.createAtlas();
    this.cloudTex = this.createClouds();
    this.indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, quadIndices(), gl.STATIC_DRAW);
    this.dynamicBuffer = gl.createBuffer() as WebGLBuffer;
    this.colorBuffer = gl.createBuffer() as WebGLBuffer;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private createAtlas() {
    const gl = this.gl;
    const tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const levels = buildAtlas();
    let size = ATLAS_SIZE;
    levels.forEach((data, level) => {
      gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      size = Math.max(1, size >> 1);
    });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Minecraft-like blocky cloud map (one texel = 12 blocks). */
  private createClouds() {
    const gl = this.gl;
    const size = 64;
    const rng = mulberry32(1234);
    const cells = new Float32Array(size * size);
    for (let i = 0; i < cells.length; i++) cells[i] = rng();
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        // smooth the noise a bit for cloud-shaped blobs
        let v = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) v += cells[((y + dy + size) % size) * size + ((x + dx + size) % size)];
        v /= 25;
        const on = v > 0.53;
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = on ? 255 : 0;
      }
    const tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  // ------------------------------------------------------------------ chunk meshes

  uploadSection(cx: number, cz: number, sy: number, data: SectionMeshData) {
    const gl = this.gl;
    const key = sectionKey(cx, cz, sy);
    const old = this.sections.get(key);
    if (old) this.freeSection(old);
    const make = (m: { bytes: Uint8Array; quads: number }) =>
      m.quads > 0 ? { buffer: createBuffer(gl, gl.ARRAY_BUFFER, m.bytes, gl.STATIC_DRAW), quads: m.quads } : null;
    const s: SectionGpu = { cx, cz, sy, opaque: make(data.opaque), translucent: make(data.translucent) };
    if (s.opaque || s.translucent) this.sections.set(key, s);
    else this.sections.delete(key);
  }

  private freeSection(s: SectionGpu) {
    if (s.opaque) this.gl.deleteBuffer(s.opaque.buffer);
    if (s.translucent) this.gl.deleteBuffer(s.translucent.buffer);
  }

  removeChunk(cx: number, cz: number) {
    for (let sy = 0; sy < 16; sy++) {
      const key = sectionKey(cx, cz, sy);
      const s = this.sections.get(key);
      if (s) {
        this.freeSection(s);
        this.sections.delete(key);
      }
    }
  }

  hasChunk(cx: number, cz: number) {
    for (let sy = 0; sy < 16; sy++) if (this.sections.has(sectionKey(cx, cz, sy))) return true;
    return false;
  }

  clearAll() {
    for (const s of this.sections.values()) this.freeSection(s);
    this.sections.clear();
  }

  dispose() {
    this.clearAll();
    for (const m of this.meshCache.values()) this.gl.deleteBuffer(m.buffer);
    this.meshCache.clear();
  }

  private bindChunkAttribs(byteOffset: number) {
    const gl = this.gl;
    const a = this.chunkProg.attribs;
    gl.vertexAttribPointer(a.aPos, 3, gl.SHORT, false, VERTEX_BYTES, byteOffset);
    gl.vertexAttribPointer(a.aUV, 2, gl.UNSIGNED_SHORT, false, VERTEX_BYTES, byteOffset + 6);
    gl.vertexAttribPointer(a.aLight, 3, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, byteOffset + 10);
    gl.vertexAttribPointer(a.aTint, 3, gl.UNSIGNED_BYTE, false, VERTEX_BYTES, byteOffset + 13);
  }

  private drawSectionMesh(m: { buffer: WebGLBuffer; quads: number }) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
    for (let start = 0; start < m.quads; start += MAX_QUADS) {
      const count = Math.min(MAX_QUADS, m.quads - start);
      this.bindChunkAttribs(start * 4 * VERTEX_BYTES);
      gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_SHORT, 0);
    }
  }

  // ------------------------------------------------------------------ generic meshes

  private gpuMesh(key: string, build: () => MeshSource): GpuMesh {
    let m = this.meshCache.get(key);
    if (!m) {
      const src = build();
      m = { buffer: createBuffer(this.gl, this.gl.ARRAY_BUFFER, src.data, this.gl.STATIC_DRAW), vertices: src.vertices };
      this.meshCache.set(key, m);
    }
    return m;
  }

  private useEntityProgram(viewProj: Mat4) {
    const gl = this.gl;
    const p = this.entityProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
    gl.uniform2f(p.uniforms.uUVOffset, 0, 0);
    gl.uniform2f(p.uniforms.uFog, this.fogRange[0], this.fogRange[1]);
    gl.uniform3f(p.uniforms.uFogColor, this.fogColor[0], this.fogColor[1], this.fogColor[2]);
    gl.uniform1i(p.uniforms.uTex, 0);
    gl.uniform4f(p.uniforms.uOverlay, 0, 0, 0, 0);
    gl.uniform1f(p.uniforms.uAlpha, 1);
    gl.uniform1f(p.uniforms.uAlphaTest, 0.5);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
  }

  private drawEntityMesh(m: GpuMesh, model: Mat4, light: readonly number[], overlay?: readonly number[]) {
    const gl = this.gl;
    const p = this.entityProg;
    gl.uniformMatrix4fv(p.uniforms.uModel, false, model);
    gl.uniform3f(p.uniforms.uLight, light[0], light[1], light[2]);
    if (overlay) gl.uniform4f(p.uniforms.uOverlay, overlay[0], overlay[1], overlay[2], overlay[3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.drawArrays(gl.TRIANGLES, 0, m.vertices);
    if (overlay) gl.uniform4f(p.uniforms.uOverlay, 0, 0, 0, 0);
  }

  private drawColor(data: Float32Array, mode: number, model: Mat4, viewProj: Mat4, fog: boolean) {
    const gl = this.gl;
    const p = this.colorProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(p.uniforms.uModel, false, model);
    gl.uniform2f(p.uniforms.uFog, fog ? this.fogRange[0] : 1e6, fog ? this.fogRange[1] : 1e6 + 1);
    gl.uniform3f(p.uniforms.uFogColor, this.fogColor[0], this.fogColor[1], this.fogColor[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(mode, 0, data.length / 7);
  }

  // ------------------------------------------------------------------ frame

  render(f: RenderFrame) {
    const gl = this.gl;
    const cam = f.camera;
    gl.viewport(0, 0, f.width, f.height);

    const dist = f.renderDistance * 16;
    const sky = skyColors(f.celestial, f.daylight);
    if (f.underwater) {
      this.fogColor = [0.05 * f.daylight + 0.02, 0.12 * f.daylight + 0.03, 0.42 * f.daylight + 0.06];
      this.fogRange = [-4, 24];
    } else {
      this.fogColor = sky.fog;
      this.fogRange = [dist * 0.55, dist * 0.95];
    }

    perspective(this.proj, (cam.fov * Math.PI) / 180, f.width / Math.max(1, f.height), 0.05, Math.max(256, dist * 1.5));
    identity(this.view);
    rotateZ(this.view, cam.roll);
    translate(this.view, cam.bobX, cam.bobY, 0);
    const rot = viewRotation(mat4(), cam.yaw, cam.pitch);
    multiply(this.view, this.view, rot);
    multiply(this.viewProj, this.proj, this.view);
    frustumPlanes(this.viewProj, this.planes);

    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    if (!f.underwater) this.renderSky(f, sky);

    // ---- opaque world
    const camSx = Math.floor(cam.x / 16);
    const camSz = Math.floor(cam.z / 16);
    const visible: { s: SectionGpu; d: number }[] = [];
    for (const s of this.sections.values()) {
      const dx = s.cx - camSx;
      const dz = s.cz - camSz;
      if (Math.abs(dx) > f.renderDistance || Math.abs(dz) > f.renderDistance) continue;
      const x0 = s.cx * 16 - cam.x;
      const y0 = s.sy * SECTION_SIZE - cam.y;
      const z0 = s.cz * 16 - cam.z;
      if (!boxInFrustum(this.planes, x0, y0, z0, x0 + 16, y0 + 16, z0 + 16)) continue;
      const cxm = x0 + 8;
      const cym = y0 + 8;
      const czm = z0 + 8;
      visible.push({ s, d: cxm * cxm + cym * cym + czm * czm });
    }
    visible.sort((a, b) => a.d - b.d);
    this.drawnSections = visible.length;

    const cp = this.chunkProg;
    gl.useProgram(cp.program);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniformMatrix4fv(cp.uniforms.uViewProj, false, this.viewProj);
    gl.uniform2f(cp.uniforms.uUVScale, 1 / (ATLAS_SIZE * UV_SCALE), 1 / (ATLAS_SIZE * UV_SCALE));
    gl.uniform1f(cp.uniforms.uSkyDarken, f.skyDarken);
    gl.uniform3f(cp.uniforms.uSkyColor, sky.lightTint[0], sky.lightTint[1], sky.lightTint[2]);
    gl.uniform1f(cp.uniforms.uGamma, f.gamma);
    gl.uniform2f(cp.uniforms.uFog, this.fogRange[0], this.fogRange[1]);
    gl.uniform3f(cp.uniforms.uFogColor, this.fogColor[0], this.fogColor[1], this.fogColor[2]);
    gl.uniform1i(cp.uniforms.uTex, 0);
    gl.uniform1f(cp.uniforms.uAlphaTest, 0.5);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.disable(gl.BLEND);
    for (const { s } of visible) {
      if (!s.opaque) continue;
      gl.uniform3f(cp.uniforms.uOffset, s.cx * 16 - cam.x, s.sy * SECTION_SIZE - cam.y, s.cz * 16 - cam.z);
      this.drawSectionMesh(s.opaque);
    }

    // ---- entities
    this.useEntityProgram(this.viewProj);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    for (const m of f.mobs) this.renderMob(m, cam);
    for (const it of f.items) this.renderItem(it, cam);
    this.renderParticles(f, cam);

    // ---- breaking overlay + selection
    if (f.breaking) this.renderCracks(f.breaking, cam);

    // ---- clouds
    if (f.clouds && !f.underwater) this.renderClouds(f, cam, sky);

    // ---- translucent world (water, ice), back to front
    gl.useProgram(cp.program);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.uniform1f(cp.uniforms.uAlphaTest, 0.01);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    for (let i = visible.length - 1; i >= 0; i--) {
      const s = visible[i].s;
      if (!s.translucent) continue;
      gl.uniform3f(cp.uniforms.uOffset, s.cx * 16 - cam.x, s.sy * SECTION_SIZE - cam.y, s.cz * 16 - cam.z);
      this.drawSectionMesh(s.translucent);
    }
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    if (f.selection) this.renderSelection(f.selection, cam);

    // ---- first person hand
    if (f.hand) this.renderHand(f, f.hand);

    if (f.underwater) this.renderOverlay([0.1, 0.2, 0.6, 0.25]);
    gl.disableVertexAttribArray(3);
  }

  private renderSky(f: RenderFrame, sky: SkyColors) {
    const gl = this.gl;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    // Sky plane above the camera, fogged towards the horizon (like Minecraft).
    const [r, g, b] = sky.sky;
    const s = 400;
    const y = 16;
    const plane = new Float32Array([
      -s, y, -s, r, g, b, 1,
      s, y, -s, r, g, b, 1,
      s, y, s, r, g, b, 1,
      -s, y, -s, r, g, b, 1,
      s, y, s, r, g, b, 1,
      -s, y, s, r, g, b, 1,
    ]);
    const saved = this.fogRange;
    this.fogRange = [0, 160];
    identity(this.model);
    this.drawColor(plane, gl.TRIANGLES, this.model, this.viewProj, true);
    // Dark void below the horizon, only when the camera is below sea level (like Minecraft).
    const v = sky.void;
    const lower = new Float32Array([
      -s, -24, -s, v[0], v[1], v[2], 1,
      -s, -24, s, v[0], v[1], v[2], 1,
      s, -24, s, v[0], v[1], v[2], 1,
      -s, -24, -s, v[0], v[1], v[2], 1,
      s, -24, s, v[0], v[1], v[2], 1,
      s, -24, -s, v[0], v[1], v[2], 1,
    ]);
    if (f.camera.y < 63) this.drawColor(lower, gl.TRIANGLES, this.model, this.viewProj, true);
    this.fogRange = saved;

    // Sunrise/sunset glow.
    if (sky.sunset) {
      const [sr, sg, sb, sa] = sky.sunset;
      const dir = Math.sin(f.celestial * Math.PI * 2) < 0 ? -1 : 1;
      const fan: number[] = [];
      const cx = 100 * dir;
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = ((i + 1) / 16) * Math.PI * 2;
        fan.push(cx, 0, 0, sr, sg, sb, sa);
        fan.push(cx * 0.6, Math.cos(a0) * 40 * sa, Math.sin(a0) * 120, sr, sg, sb, 0);
        fan.push(cx * 0.6, Math.cos(a1) * 40 * sa, Math.sin(a1) * 120, sr, sg, sb, 0);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.drawColor(new Float32Array(fan), gl.TRIANGLES, this.model, this.viewProj, false);
    }

    // Sun, moon and stars rotate with the celestial angle around the X axis.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.useEntityProgram(this.viewProj);
    gl.uniform2f(this.entityProg.uniforms.uFog, 1e6, 1e6 + 1);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.01);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    const angle = f.celestial * Math.PI * 2;
    if (sky.stars > 0) {
      const stars = this.gpuMesh('stars', () => starMesh());
      identity(this.model);
      rotateY(this.model, -Math.PI / 2);
      rotateX(this.model, angle);
      gl.uniform1f(this.entityProg.uniforms.uAlpha, sky.stars);
      this.drawEntityMesh(stars, this.model, [1, 1, 1]);
      gl.uniform1f(this.entityProg.uniforms.uAlpha, 1);
    }
    const sun = this.gpuMesh('sun', () => quadMesh(tile('sun'), 30));
    identity(this.model);
    rotateY(this.model, -Math.PI / 2);
    rotateX(this.model, angle);
    translate(this.model, 0, 100, 0);
    rotateX(this.model, -Math.PI / 2);
    this.drawEntityMesh(sun, this.model, [1, 1, 1]);
    const moon = this.gpuMesh('moon', () => quadMesh(tile('moon'), 20));
    identity(this.model);
    rotateY(this.model, -Math.PI / 2);
    rotateX(this.model, angle);
    translate(this.model, 0, -100, 0);
    rotateX(this.model, Math.PI / 2);
    this.drawEntityMesh(moon, this.model, [1, 1, 1]);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.5);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
  }

  private renderClouds(f: RenderFrame, cam: CameraState, sky: SkyColors) {
    const gl = this.gl;
    const cell = 12;
    const size = 64 * cell;
    const half = size;
    const height = 140 - cam.y;
    // UVs follow world position so the clouds stay fixed in the world while drifting.
    const u0 = (cam.x + f.cloudOffset - half) / size;
    const v0 = (cam.z - half) / size;
    const u1 = u0 + (2 * half) / size;
    const v1 = v0 + (2 * half) / size;
    const data = new Float32Array([
      -half, height, half, u0, v1, 1,
      half, height, half, u1, v1, 1,
      half, height, -half, u1, v0, 1,
      -half, height, half, u0, v1, 1,
      half, height, -half, u1, v0, 1,
      -half, height, -half, u0, v0, 1,
    ]);
    this.useEntityProgram(this.viewProj);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.enable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.entityProg.uniforms.uAlpha, 0.8);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.1);
    gl.uniform2f(this.entityProg.uniforms.uFog, f.renderDistance * 16 * 0.8, f.renderDistance * 16 * 2.2);
    identity(this.model);
    this.uploadDynamic(data);
    gl.uniformMatrix4fv(this.entityProg.uniforms.uModel, false, this.model);
    gl.uniform3f(this.entityProg.uniforms.uLight, sky.cloud[0], sky.cloud[1], sky.cloud[2]);
    this.drawDynamic(6);
    gl.uniform1f(this.entityProg.uniforms.uAlpha, 1);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.5);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
  }

  private uploadDynamic(data: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    if (data.byteLength > this.dynamicCapacity) {
      this.dynamicCapacity = data.byteLength * 2;
      // Allocate with a zeroed array (some native GL bindings lack the size-only overload).
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.dynamicCapacity / 4), gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  private drawDynamic(vertices: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicBuffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
  }

  private renderMob(m: MobRender, cam: CameraState) {
    const model = getModels()[m.model];
    if (!model) return;
    const base = mat4();
    translate(base, m.x - cam.x, m.y - cam.y, m.z - cam.z);
    rotateY(base, -m.bodyYaw);
    if (m.death > 0) rotateZ(base, (Math.min(1, m.death) * Math.PI) / 2);
    scale(base, m.scale, m.scale, m.scale);
    const overlay = m.hurt > 0 ? [1, 0, 0, 0.45 * m.hurt] : m.flash > 0 ? [1, 1, 1, 0.6 * m.flash] : m.burning ? [1, 0.55, 0.1, 0.3] : undefined;
    const swing = Math.cos(m.limbSwing * 0.6662) * 1.4 * m.limbAmount;
    for (const p of model.parts) {
      const mm = mat4();
      mm.set(base);
      translate(mm, p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
      switch (p.name) {
        case 'head':
        case 'snout':
        case 'horn0':
        case 'horn1':
          rotateY(mm, -m.headYaw);
          rotateX(mm, m.headPitch);
          break;
        case 'rightLeg':
        case 'leg0':
        case 'leg3':
          rotateX(mm, swing);
          break;
        case 'leftLeg':
        case 'leg1':
        case 'leg2':
          rotateX(mm, -swing);
          break;
        case 'rightArm':
          if (m.armsForward) rotateX(mm, -Math.PI / 2 + Math.sin(m.swing * Math.PI) * 0.4);
          else rotateX(mm, -swing - Math.sin(m.swing * Math.PI) * 1.2);
          break;
        case 'leftArm':
          if (m.armsForward) rotateX(mm, -Math.PI / 2 + Math.sin(m.swing * Math.PI) * 0.4);
          else rotateX(mm, swing);
          break;
      }
      const gm = this.gpuMesh(`${m.model}:${p.name}`, () => p.mesh);
      this.drawEntityMesh(gm, mm, m.light, overlay);
    }
  }

  private renderItem(it: ItemRender, cam: CameraState) {
    const info = itemMesh(it.itemId);
    const gm = this.gpuMesh(`item:${it.itemId}`, () => (it.full ? blockMesh(it.itemId) : info.mesh));
    const m = mat4();
    translate(m, it.x - cam.x, it.y - cam.y, it.z - cam.z);
    if (it.full) {
      translate(m, 0, 0.5, 0);
    } else {
      rotateY(m, it.spin);
      const s = info.cube ? 0.25 : 0.4;
      translate(m, 0, s / 2, 0);
      scale(m, s, s, s);
    }
    const tint = info.tint;
    const light = tint ? [it.light[0] * (tint[0] / 255), it.light[1] * (tint[1] / 255), it.light[2] * (tint[2] / 255)] : it.light;
    this.gl.disable(this.gl.CULL_FACE);
    this.drawEntityMesh(gm, m, light);
    this.gl.enable(this.gl.CULL_FACE);
  }

  private renderParticles(f: RenderFrame, cam: CameraState) {
    if (f.particles.length === 0) return;
    const gl = this.gl;
    // camera right/up vectors for billboards
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const rx = -cy;
    const rz = -sy;
    const ux = -sy * sp;
    const uy = cp;
    const uz = cy * sp;
    const data = new Float32Array(f.particles.length * 6 * FLOATS_PER_VERTEX);
    let o = 0;
    for (const p of f.particles) {
      const t = tileUV(p.tile, p.u, p.v, p.u + p.uvSize, p.v + p.uvSize);
      const h = p.size / 2;
      const px = p.x - cam.x;
      const py = p.y - cam.y;
      const pz = p.z - cam.z;
      const corners = [
        [-h, -h, t.u0, t.v1],
        [h, -h, t.u1, t.v1],
        [h, h, t.u1, t.v0],
        [-h, h, t.u0, t.v0],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [a, b, u, v] = corners[k];
        data[o++] = px + rx * a + ux * b;
        data[o++] = py + uy * b;
        data[o++] = pz + rz * a + uz * b;
        data[o++] = u;
        data[o++] = v;
        data[o++] = p.brightness;
      }
    }
    identity(this.model);
    gl.uniformMatrix4fv(this.entityProg.uniforms.uModel, false, this.model);
    gl.uniform3f(this.entityProg.uniforms.uLight, 1, 1, 1);
    gl.disable(gl.CULL_FACE);
    this.uploadDynamic(data);
    this.drawDynamic(f.particles.length * 6);
    gl.enable(gl.CULL_FACE);
  }

  private renderCracks(b: { x: number; y: number; z: number; stage: number }, cam: CameraState) {
    const gl = this.gl;
    const gm = this.gpuMesh(`crack:${b.stage}`, () => {
      const t = DESTROY_TILES[Math.max(0, Math.min(9, b.stage))];
      return quadCube(t);
    });
    const m = mat4();
    translate(m, b.x + 0.5 - cam.x, b.y + 0.5 - cam.y, b.z + 0.5 - cam.z);
    scale(m, 1.002, 1.002, 1.002);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -1);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.01);
    this.drawEntityMesh(gm, m, [1, 1, 1]);
    gl.uniform1f(this.entityProg.uniforms.uAlphaTest, 0.5);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  private renderSelection(sel: { x: number; y: number; z: number; box: readonly number[] }, cam: CameraState) {
    const gl = this.gl;
    const e = 0.002;
    const [bx0, by0, bz0, bx1, by1, bz1] = sel.box;
    const x0 = sel.x + bx0 - e - cam.x;
    const y0 = sel.y + by0 - e - cam.y;
    const z0 = sel.z + bz0 - e - cam.z;
    const x1 = sel.x + bx1 + e - cam.x;
    const y1 = sel.y + by1 + e - cam.y;
    const z1 = sel.z + bz1 + e - cam.z;
    const c = [0, 0, 0, 0.45];
    const pts = [
      [x0, y0, z0, x1, y0, z0], [x1, y0, z0, x1, y0, z1], [x1, y0, z1, x0, y0, z1], [x0, y0, z1, x0, y0, z0],
      [x0, y1, z0, x1, y1, z0], [x1, y1, z0, x1, y1, z1], [x1, y1, z1, x0, y1, z1], [x0, y1, z1, x0, y1, z0],
      [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x1, y0, z1, x1, y1, z1], [x0, y0, z1, x0, y1, z1],
    ];
    const data: number[] = [];
    for (const [ax, ay, az, bx, by, bz] of pts) data.push(ax, ay, az, ...c, bx, by, bz, ...c);
    identity(this.model);
    gl.enable(gl.BLEND);
    this.drawColor(new Float32Array(data), gl.LINES, this.model, this.viewProj, false);
    gl.disable(gl.BLEND);
  }

  private renderHand(f: RenderFrame, hand: HandRender) {
    const gl = this.gl;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const proj = perspective(mat4(), (70 * Math.PI) / 180, f.width / Math.max(1, f.height), 0.01, 10);
    this.useEntityProgram(proj);
    gl.uniform2f(this.entityProg.uniforms.uFog, 1e6, 1e6 + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    const swing = hand.swing;
    const sq = Math.sin(swing * swing * Math.PI);
    const sr = Math.sin(Math.sqrt(swing) * Math.PI);
    const m = mat4();
    const bob = f.camera;
    translate(m, -bob.bobX * 0.5, -bob.bobY * 0.5, 0);
    if (hand.itemId === null) {
      // Bare right arm reaching in from the bottom right, like Minecraft's first-person arm.
      translate(m, 0.72 - sr * 0.3, -0.8 - hand.equip * 0.6 + Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.12, -0.4 - sq * 0.25);
      rotateY(m, 0.45 + sr * 0.3);
      rotateX(m, 2.15 - sq * 0.6);
      rotateY(m, 0.6);
      const arm = getModels().arm.parts[0];
      const gm = this.gpuMesh('arm', () => arm.mesh);
      this.drawEntityMesh(gm, m, hand.light);
      return;
    }
    const info = itemMesh(hand.itemId);
    const gm = this.gpuMesh(`item:${hand.itemId}`, () => info.mesh);
    const eatBob = hand.eating > 0 ? Math.abs(Math.cos(hand.eating * 40)) * 0.06 : 0;
    translate(
      m,
      0.56 - sr * 0.4 - hand.eating * 0.4,
      -0.52 - hand.equip * 0.6 + Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2 + eatBob + hand.eating * 0.25,
      -0.72 - sq * 0.2
    );
    rotateY(m, -sr * 0.35);
    rotateX(m, -sq * 1.4);
    if (info.cube) {
      translate(m, 0.12, 0.12, -0.1);
      rotateX(m, 0.3);
      rotateY(m, 0.78);
      scale(m, 0.3, 0.3, 0.3);
    } else {
      rotateY(m, -1.25);
      rotateZ(m, 0.45);
      translate(m, 0, 0.1, 0);
      scale(m, 0.68, 0.68, 0.68);
    }
    const tint = info.tint;
    const light = tint ? [hand.light[0] * (tint[0] / 255), hand.light[1] * (tint[1] / 255), hand.light[2] * (tint[2] / 255)] : hand.light;
    gl.disable(gl.CULL_FACE);
    this.drawEntityMesh(gm, m, light);
    gl.enable(gl.CULL_FACE);
  }

  /** Full-screen color overlay (e.g. underwater tint). */
  private renderOverlay(color: number[]) {
    const gl = this.gl;
    const [r, g, b, a] = color;
    const data = new Float32Array([
      -1, -1, 0, r, g, b, a,
      1, -1, 0, r, g, b, a,
      1, 1, 0, r, g, b, a,
      -1, -1, 0, r, g, b, a,
      1, 1, 0, r, g, b, a,
      -1, 1, 0, r, g, b, a,
    ]);
    identity(this.model);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    this.drawColor(data, gl.TRIANGLES, this.model, this.model, false);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
}

/** Cube of 6 quads with one tile on all faces, centered at the origin. */
function quadCube(tileIndex: number): MeshSource {
  const t = tileUV(tileIndex);
  const out: number[] = [];
  const faces: number[][][] = [
    [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
    [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]],
    [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
    [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
    [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
    [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
  ];
  const uv = [
    [t.u0, t.v1],
    [t.u1, t.v1],
    [t.u1, t.v0],
    [t.u0, t.v0],
  ];
  for (const p of faces) for (const k of [0, 1, 2, 0, 2, 3]) out.push(p[k][0], p[k][1], p[k][2], uv[k][0], uv[k][1], 1);
  return { data: new Float32Array(out), vertices: out.length / FLOATS_PER_VERTEX };
}

interface SkyColors {
  sky: [number, number, number];
  fog: [number, number, number];
  void: [number, number, number];
  cloud: [number, number, number];
  lightTint: [number, number, number];
  sunset: [number, number, number, number] | null;
  stars: number;
}

/** Sky, fog and sunset colors for the time of day (after Minecraft's WorldProvider). */
function skyColors(celestial: number, daylight: number): SkyColors {
  const day: [number, number, number] = [0.47, 0.65, 1.0];
  const sky: [number, number, number] = [day[0] * daylight, day[1] * daylight, day[2] * daylight];
  const fogDay: [number, number, number] = [0.75, 0.85, 1.0];
  const fog: [number, number, number] = [
    fogDay[0] * (daylight * 0.94 + 0.06),
    fogDay[1] * (daylight * 0.94 + 0.06),
    fogDay[2] * (daylight * 0.91 + 0.09),
  ];
  let sunset: [number, number, number, number] | null = null;
  const c = Math.cos(celestial * Math.PI * 2);
  if (c >= -0.4 && c <= 0.4) {
    const f = c / 0.4 * 0.5 + 0.5;
    let a = 1 - (1 - Math.sin(f * Math.PI)) * 0.99;
    a *= a;
    sunset = [f * 0.3 + 0.7, f * f * 0.7 + 0.2, 0.2, a];
    // blend the fog towards the sunset
    fog[0] = fog[0] * (1 - a * 0.4) + sunset[0] * a * 0.4;
    fog[1] = fog[1] * (1 - a * 0.4) + sunset[1] * a * 0.4;
    fog[2] = fog[2] * (1 - a * 0.4) + sunset[2] * a * 0.4;
  }
  const night = 1 - daylight;
  return {
    sky,
    fog,
    void: [sky[0] * 0.2 + 0.02, sky[1] * 0.2 + 0.02, sky[2] * 0.6 + 0.04],
    cloud: [daylight * 0.9 + 0.1, daylight * 0.9 + 0.1, daylight * 0.85 + 0.15],
    lightTint: [1 - night * 0.25, 1 - night * 0.2, 1],
    sunset,
    stars: Math.max(0, night * 1.2 - 0.25),
  };
}
