import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { PlayerSave } from './entity/player';
import type { ChunkSave } from './world/world';

/** Synchronous key-value storage: localStorage on the web, one file per key on iOS/Android. */
interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

const webKV: KV = {
  get: (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch (e) {
      console.warn('Speichern fehlgeschlagen', e);
    }
  },
  remove: (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      // ignore
    }
  },
  keys: (prefix) => {
    const out: string[] = [];
    try {
      const ls = globalThis.localStorage;
      if (!ls) return out;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(prefix)) out.push(k);
      }
    } catch {
      // ignore
    }
    return out;
  },
};

function fileKV(): KV {
  const root = new Directory(Paths.document, 'minecraft');
  const ensure = () => {
    if (!root.exists) root.create({ intermediates: true, idempotent: true });
  };
  const fileName = (key: string) => `${encodeURIComponent(key)}.txt`;
  return {
    get: (k) => {
      try {
        const f = new File(root, fileName(k));
        return f.exists ? f.textSync() : null;
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        ensure();
        const f = new File(root, fileName(k));
        if (!f.exists) f.create();
        f.write(v);
      } catch (e) {
        console.warn('Speichern fehlgeschlagen', e);
      }
    },
    remove: (k) => {
      try {
        const f = new File(root, fileName(k));
        if (f.exists) f.delete();
      } catch {
        // ignore
      }
    },
    keys: (prefix) => {
      try {
        if (!root.exists) return [];
        return root
          .list()
          .filter((e): e is File => e instanceof File)
          .map((f) => decodeURIComponent(f.name.replace(/\.txt$/, '')))
          .filter((k) => k.startsWith(prefix));
      } catch {
        return [];
      }
    },
  };
}

let kv: KV | null = null;
function store(): KV {
  if (!kv) kv = Platform.OS === 'web' ? webKV : fileKV();
  return kv;
}

export type GameMode = 'survival' | 'creative';

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  mode: GameMode;
  created: number;
  lastPlayed: number;
  time: number;
  spawn: { x: number; y: number; z: number } | null;
  player: PlayerSave | null;
  version: 1;
}

const PREFIX = 'mc:';
const metaKey = (id: string) => `${PREFIX}world:${id}:meta`;
const chunkPrefix = (id: string) => `${PREFIX}world:${id}:chunk:`;

export function listWorlds(): WorldMeta[] {
  const out: WorldMeta[] = [];
  for (const k of store().keys(`${PREFIX}world:`)) {
    if (!k.endsWith(':meta')) continue;
    const raw = store().get(k);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as WorldMeta);
    } catch {
      // skip broken entries
    }
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

export function loadWorldMeta(id: string): WorldMeta | null {
  const raw = store().get(metaKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorldMeta;
  } catch {
    return null;
  }
}

export function saveWorldMeta(meta: WorldMeta) {
  store().set(metaKey(meta.id), JSON.stringify(meta));
}

export function createWorld(name: string, seed: number, mode: GameMode): WorldMeta {
  const now = Date.now();
  const meta: WorldMeta = {
    id: `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    seed,
    mode,
    created: now,
    lastPlayed: now,
    time: 0,
    spawn: null,
    player: null,
    version: 1,
  };
  saveWorldMeta(meta);
  return meta;
}

export function deleteWorld(id: string) {
  for (const k of store().keys(chunkPrefix(id))) store().remove(k);
  store().remove(metaKey(id));
}

/** All saved chunk diffs of a world, keyed by "cx,cz". */
export function loadChunks(id: string): Map<string, ChunkSave> {
  const out = new Map<string, ChunkSave>();
  const prefix = chunkPrefix(id);
  for (const k of store().keys(prefix)) {
    const raw = store().get(k);
    if (!raw) continue;
    try {
      out.set(k.slice(prefix.length), JSON.parse(raw) as ChunkSave);
    } catch {
      // skip
    }
  }
  return out;
}

export function saveChunk(id: string, cx: number, cz: number, data: ChunkSave) {
  store().set(`${chunkPrefix(id)}${cx},${cz}`, JSON.stringify(data));
}

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  fancyGraphics: boolean;
  smoothLighting: boolean;
  clouds: boolean;
  viewBobbing: boolean;
  showCoords: boolean;
  /** 0 peaceful, 1 easy, 2 normal, 3 hard */
  difficulty: number;
  /** 0 = moody … 1 = bright */
  gamma: number;
  invertY: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: Platform.OS === 'web' ? 6 : 4,
  fov: 70,
  sensitivity: 1,
  fancyGraphics: true,
  smoothLighting: true,
  clouds: true,
  viewBobbing: true,
  showCoords: false,
  difficulty: 2,
  gamma: 0.5,
  invertY: false,
};

export function loadSettings(): Settings {
  const raw = store().get(`${PREFIX}settings`);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  store().set(`${PREFIX}settings`, JSON.stringify(s));
}
