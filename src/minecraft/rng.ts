/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof mulberry32>;

/** Deterministic integer hash of up to four integers. */
export function hash4(a: number, b: number, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= Math.imul(c | 0, 0xc2b2ae35) ^ Math.imul(d | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Turns an arbitrary seed string into a 32-bit integer seed (numeric strings are used as-is). */
export function seedFromString(text: string) {
  const trimmed = text.trim();
  if (trimmed === '') return Math.floor(Math.random() * 2147483647);
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed) | 0;
  let h = 0;
  for (let i = 0; i < trimmed.length; i++) h = (Math.imul(31, h) + trimmed.charCodeAt(i)) | 0;
  return h;
}

export function randInt(rng: Rng, min: number, maxInclusive: number) {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}
