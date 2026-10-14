import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { B, isLeaves, isLog } from './blocks';
import { mulberry32 } from './rng';

/**
 * Procedurally synthesized game sounds (no audio files from the original game).
 * Web: WebAudio buffers with pitch variation. iOS/Android: expo-audio players over generated WAVs.
 */

const RATE = 22050;

export type Material = 'stone' | 'wood' | 'gravel' | 'grass' | 'sand' | 'glass' | 'cloth' | 'snow';

export type SoundName =
  | `dig_${Material}`
  | `step_${Material}`
  | 'hurt'
  | 'hit'
  | 'eat'
  | 'burp'
  | 'pop'
  | 'explode'
  | 'fuse'
  | 'splash'
  | 'door'
  | 'click'
  | 'pig'
  | 'cow'
  | 'sheep'
  | 'zombie';

export function materialOf(id: number): Material {
  if (isLog(id) || isPlanks(id) || id === B.CRAFTING_TABLE || id === B.CHEST || id === B.OAK_DOOR || id === B.LADDER || id === B.BED)
    return 'wood';
  if (id === B.GRASS || isLeaves(id) || id === B.TALL_GRASS || id === B.DANDELION || id === B.POPPY || id === B.WHEAT || id === B.CACTUS)
    return 'grass';
  if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING || id === B.DEAD_BUSH) return 'grass';
  if (id === B.DIRT || id === B.GRAVEL || id === B.FARMLAND) return 'gravel';
  if (id === B.SAND) return 'sand';
  if (id === B.GLASS || id === B.ICE) return 'glass';
  if (id === B.WHITE_WOOL) return 'cloth';
  if (id === B.SNOW) return 'snow';
  return 'stone';
}

function isPlanks(id: number) {
  return id === B.OAK_PLANKS || id === B.BIRCH_PLANKS || id === B.SPRUCE_PLANKS;
}

// ------------------------------------------------------------------ synthesis helpers

function buffer(seconds: number) {
  return new Float32Array(Math.max(1, Math.round(seconds * RATE)));
}

function lowpass(x: Float32Array, cutoff: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = y;
  }
  return x;
}

function highpass(x: Float32Array, cutoff: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i] - y);
    x[i] = x[i] - y;
  }
  return x;
}

/** RBJ band-pass biquad (formants, resonances). */
function bandpass(x: Float32Array, freq: number, q: number) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w);
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 - b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
}

function noise(x: Float32Array, rng: () => number, amp = 1) {
  for (let i = 0; i < x.length; i++) x[i] += (rng() * 2 - 1) * amp;
  return x;
}

/** Attack/exponential-decay envelope. */
function envelope(x: Float32Array, attack: number, decay: number, start = 0) {
  const s = Math.round(start * RATE);
  for (let i = 0; i < x.length; i++) {
    const t = (i - s) / RATE;
    const e = t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    x[i] *= e;
  }
  return x;
}

function normalize(x: Float32Array, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  // short fade-out against clicks
  const fade = Math.min(x.length, Math.round(0.01 * RATE));
  for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  return x;
}

function mix(...parts: Float32Array[]) {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

/** Oscillator with a frequency function (Hz over time) and waveform. */
function tone(seconds: number, freq: (t: number) => number, wave: 'sine' | 'saw' | 'square' = 'sine', amp = 1) {
  const x = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    phase += freq(t) / RATE;
    const p = phase % 1;
    const v = wave === 'sine' ? Math.sin(p * Math.PI * 2) : wave === 'saw' ? p * 2 - 1 : p < 0.5 ? 1 : -1;
    x[i] = v * amp;
  }
  return x;
}

function grains(x: Float32Array, rng: () => number, count: number, length: number) {
  const mask = new Float32Array(x.length);
  for (let g = 0; g < count; g++) {
    const at = Math.floor(rng() * x.length * 0.8);
    const len = Math.round(length * RATE * (0.5 + rng()));
    for (let i = 0; i < len && at + i < x.length; i++) mask[at + i] += Math.sin((i / len) * Math.PI) * (0.5 + rng() * 0.5);
  }
  for (let i = 0; i < x.length; i++) x[i] *= mask[i];
  return x;
}

function material(m: Material, step: boolean, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const len = step ? 0.12 : 0.22;
  switch (m) {
    case 'stone': {
      const x = noise(buffer(len), rng);
      highpass(x, 700);
      lowpass(x, 3800);
      grains(x, rng, step ? 3 : 7, 0.012);
      return normalize(envelope(x, 0.002, step ? 0.03 : 0.06));
    }
    case 'wood': {
      const n = lowpass(noise(buffer(len), rng), 1400);
      const knock = mix(tone(len, () => 170 + seed % 30, 'sine', 1.4), tone(len, () => 340, 'sine', 0.5));
      return normalize(envelope(mix(n, envelope(knock, 0.002, 0.04)), 0.002, step ? 0.035 : 0.07));
    }
    case 'gravel': {
      const x = lowpass(noise(buffer(len), rng), 2600);
      grains(x, rng, step ? 5 : 12, 0.015);
      return normalize(envelope(x, 0.004, step ? 0.05 : 0.09));
    }
    case 'grass': {
      const x = noise(buffer(len), rng);
      highpass(x, 1400);
      lowpass(x, 7000);
      grains(x, rng, step ? 6 : 14, 0.02);
      return normalize(envelope(x, 0.012, step ? 0.05 : 0.09), 0.7);
    }
    case 'sand': {
      const x = noise(buffer(len), rng);
      highpass(x, 900);
      lowpass(x, 3500);
      grains(x, rng, step ? 8 : 16, 0.02);
      return normalize(envelope(x, 0.015, step ? 0.06 : 0.1), 0.6);
    }
    case 'snow': {
      const x = lowpass(noise(buffer(len), rng), 1800);
      grains(x, rng, step ? 6 : 12, 0.02);
      return normalize(envelope(x, 0.02, step ? 0.06 : 0.1), 0.6);
    }
    case 'cloth': {
      const x = lowpass(noise(buffer(len), rng), 900);
      return normalize(envelope(x, 0.02, step ? 0.04 : 0.08), 0.5);
    }
    case 'glass': {
      if (step) return material('stone', true, seed);
      const parts = [envelope(highpass(noise(buffer(0.4), rng), 2500), 0.001, 0.05)];
      for (let i = 0; i < 9; i++) {
        const f = 2200 + rng() * 3800;
        const at = rng() * 0.12;
        const t = tone(0.4, () => f, 'sine', 0.3 + rng() * 0.4);
        parts.push(envelope(t, 0.001, 0.05 + rng() * 0.08, at));
      }
      return normalize(mix(...parts));
    }
  }
}

function synth(name: SoundName): Float32Array {
  const rng = mulberry32(name.length * 7919 + name.charCodeAt(0) * 31 + name.charCodeAt(name.length - 1));
  if (name.startsWith('dig_')) return material(name.slice(4) as Material, false, 11 + name.length);
  if (name.startsWith('step_')) return material(name.slice(5) as Material, true, 23 + name.length);
  switch (name) {
    case 'hurt': {
      const voice = tone(0.28, (t) => 230 - t * 300, 'saw', 1);
      bandpass(voice, 700, 1.2);
      return normalize(envelope(mix(voice, lowpass(noise(buffer(0.28), rng, 0.3), 1500)), 0.01, 0.09));
    }
    case 'hit': {
      const x = lowpass(noise(buffer(0.15), rng), 900);
      return normalize(envelope(mix(x, tone(0.15, () => 110, 'sine', 1.5)), 0.002, 0.035));
    }
    case 'eat': {
      const parts = [0, 0.09, 0.18].map((at) => envelope(highpass(noise(buffer(0.3), rng), 1200), 0.003, 0.025, at));
      return normalize(mix(...parts), 0.7);
    }
    case 'burp': {
      const v = tone(0.4, (t) => 95 + Math.sin(t * 40) * 12, 'saw', 1);
      lowpass(v, 600);
      return normalize(envelope(mix(v, lowpass(noise(buffer(0.4), rng, 0.4), 700)), 0.03, 0.15), 0.8);
    }
    case 'pop':
      return normalize(envelope(tone(0.12, (t) => 500 + t * 6000, 'sine'), 0.002, 0.03), 0.6);
    case 'explode': {
      const x = buffer(1.8);
      let brown = 0;
      for (let i = 0; i < x.length; i++) {
        brown = (brown + (rng() * 2 - 1) * 0.08) * 0.995;
        x[i] = brown;
      }
      lowpass(x, 420);
      const crack = envelope(lowpass(noise(buffer(0.3), rng), 2500), 0.001, 0.04);
      return normalize(envelope(mix(x, crack), 0.004, 0.45));
    }
    case 'fuse': {
      const x = highpass(noise(buffer(1.2), rng), 2800);
      for (let i = 0; i < x.length; i++) x[i] *= Math.min(1, i / (0.05 * RATE)) * (1 - i / x.length * 0.4);
      return normalize(x, 0.5);
    }
    case 'splash': {
      const x = lowpass(noise(buffer(0.6), rng), 2600);
      grains(x, rng, 18, 0.03);
      return normalize(envelope(x, 0.01, 0.18), 0.7);
    }
    case 'door': {
      const a = envelope(mix(lowpass(noise(buffer(0.3), rng), 900), tone(0.3, () => 120, 'sine', 1.2)), 0.002, 0.05);
      const b = envelope(mix(lowpass(noise(buffer(0.3), rng), 1200), tone(0.3, () => 160, 'sine', 0.8)), 0.002, 0.04, 0.08);
      return normalize(mix(a, b));
    }
    case 'click':
      return normalize(envelope(highpass(noise(buffer(0.05), rng), 1500), 0.001, 0.01), 0.5);
    case 'pig': {
      const grunt = (at: number) => {
        const v = tone(0.45, (t) => 190 + Math.sin(t * 60) * 25, 'saw', 1);
        bandpass(v, 900, 2);
        return envelope(v, 0.02, 0.05, at);
      };
      return normalize(mix(grunt(0), grunt(0.17)), 0.8);
    }
    case 'cow': {
      const v = tone(1.0, (t) => 118 - t * 25 + Math.sin(t * 30) * 3, 'saw', 1);
      lowpass(v, 650);
      bandpass(v, 420, 1.5);
      for (let i = 0; i < v.length; i++) {
        const t = i / RATE;
        v[i] *= Math.min(1, t / 0.12) * Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
      }
      return normalize(v, 0.8);
    }
    case 'sheep': {
      const v = tone(0.7, (t) => 320 + Math.sin(t * 50) * 18, 'saw', 1);
      bandpass(v, 1100, 1.5);
      for (let i = 0; i < v.length; i++) {
        const t = i / RATE;
        v[i] *= (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 9)) * Math.min(1, t / 0.05) * Math.max(0, 1 - Math.max(0, t - 0.4) / 0.3);
      }
      return normalize(v, 0.7);
    }
    case 'zombie': {
      const v = tone(1.0, (t) => 85 + Math.sin(t * 9) * 8, 'saw', 1);
      const x = mix(v, noise(buffer(1.0), rng, 0.35));
      lowpass(x, 520);
      for (let i = 0; i < x.length; i++) {
        const t = i / RATE;
        x[i] *= (0.7 + 0.3 * Math.sin(t * 2 * Math.PI * 13)) * Math.min(1, t / 0.15) * Math.max(0, 1 - Math.max(0, t - 0.6) / 0.4);
      }
      return normalize(x, 0.8);
    }
  }
  return buffer(0.05);
}

const ALL: SoundName[] = [
  ...(['stone', 'wood', 'gravel', 'grass', 'sand', 'glass', 'cloth', 'snow'] as const).flatMap(
    (m) => [`dig_${m}`, `step_${m}`] as SoundName[]
  ),
  'hurt',
  'hit',
  'eat',
  'burp',
  'pop',
  'explode',
  'fuse',
  'splash',
  'door',
  'click',
  'pig',
  'cow',
  'sheep',
  'zombie',
];

function wav(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return out;
}

interface Backend {
  play(name: SoundName, volume: number, pitch: number): void;
}

type WebAudioContext = {
  state: string;
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  createBuffer(channels: number, length: number, rate: number): { copyToChannel(data: Float32Array, ch: number): void };
  createBufferSource(): {
    buffer: unknown;
    playbackRate: { value: number };
    connect(n: unknown): void;
    start(): void;
  };
  createGain(): { gain: { value: number }; connect(n: unknown): void };
};

function webBackend(): Backend | null {
  const Ctor = (globalThis as unknown as { AudioContext?: new () => WebAudioContext; webkitAudioContext?: new () => WebAudioContext })
    .AudioContext ?? (globalThis as unknown as { webkitAudioContext?: new () => WebAudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const buffers = new Map<SoundName, ReturnType<WebAudioContext['createBuffer']>>();
  const get = (name: SoundName) => {
    let b = buffers.get(name);
    if (!b) {
      const data = synth(name);
      b = ctx.createBuffer(1, data.length, RATE);
      b.copyToChannel(data, 0);
      buffers.set(name, b);
    }
    return b;
  };
  // Browsers only start audio after a user gesture.
  const unlock = () => {
    if (ctx.state !== 'running') void ctx.resume();
  };
  globalThis.addEventListener?.('pointerdown', unlock);
  globalThis.addEventListener?.('keydown', unlock);
  globalThis.addEventListener?.('touchstart', unlock);
  return {
    play(name, volume, pitch) {
      if (ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = get(name);
      src.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    },
  };
}

function nativeBackend(): Backend {
  const pools = new Map<SoundName, { players: AudioPlayer[]; next: number }>();
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  const pool = (name: SoundName) => {
    let p = pools.get(name);
    if (!p) {
      const file = new File(Paths.cache, `mc-sound-v1-${name}.wav`);
      if (!file.exists) {
        file.create({ overwrite: true });
        file.write(wav(synth(name)));
      }
      const size = name.startsWith('step_') || name.startsWith('dig_') || name === 'pop' ? 2 : 1;
      p = { players: Array.from({ length: size }, () => createAudioPlayer({ uri: file.uri })), next: 0 };
      pools.set(name, p);
    }
    return p;
  };
  return {
    play(name, volume) {
      const p = pool(name);
      const player = p.players[p.next];
      p.next = (p.next + 1) % p.players.length;
      player.volume = volume;
      void player.seekTo(0).catch(() => {});
      player.play();
    },
  };
}

let backend: Backend | null | undefined;
let masterVolume = 1;

export const sound = {
  setVolume(v: number) {
    masterVolume = v;
  },
  /** Plays a sound (volume 0..1, pitch ~0.5..2; pitch is only applied on the web). */
  play(name: SoundName, volume = 1, pitch = 1) {
    if (masterVolume <= 0 || volume <= 0.01) return;
    try {
      if (backend === undefined) backend = Platform.OS === 'web' ? webBackend() : nativeBackend();
      backend?.play(name, Math.min(1, volume * masterVolume), pitch);
    } catch {
      backend = null;
    }
  },
  /** Creates the audio backend early (on the web this arms the unlock-on-first-input listeners). */
  init() {
    try {
      if (backend === undefined) backend = Platform.OS === 'web' ? webBackend() : nativeBackend();
    } catch {
      backend = null;
    }
  },
  all: ALL,
  synth,
  wav,
};
