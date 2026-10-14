/**
 * Minimal PNG encoder (uncompressed deflate blocks) for generated pixel art.
 * Used to turn procedural textures into data URIs for item icons in the UI.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Encodes RGBA pixels as PNG bytes, optionally upscaled with nearest-neighbour. */
export function encodePng(rgba: ArrayLike<number>, width: number, height: number, upscale = 1): Uint8Array {
  const w = width * upscale;
  const h = height * upscale;
  const rowLen = w * 4 + 1;
  const raw = new Uint8Array(rowLen * h);
  for (let sy = 0; sy < height; sy++) {
    // Build one upscaled row, then repeat it `upscale` times (filter byte 0 = none).
    const first = sy * upscale * rowLen;
    let d = first + 1;
    for (let sx = 0; sx < width; sx++) {
      const s = (sy * width + sx) * 4;
      const r = rgba[s];
      const g = rgba[s + 1];
      const b = rgba[s + 2];
      const a = rgba[s + 3];
      for (let k = 0; k < upscale; k++) {
        raw[d] = r;
        raw[d + 1] = g;
        raw[d + 2] = b;
        raw[d + 3] = a;
        d += 4;
      }
    }
    for (let k = 1; k < upscale; k++) raw.copyWithin(first + k * rowLen, first, first + rowLen);
  }

  // zlib stream with stored (uncompressed) deflate blocks.
  const maxBlock = 65535;
  const blocks = Math.ceil(raw.length / maxBlock) || 1;
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let p = 0;
  zlib[p++] = 0x78;
  zlib[p++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * maxBlock;
    const len = Math.min(maxBlock, raw.length - start);
    zlib[p++] = b === blocks - 1 ? 1 : 0;
    zlib[p++] = len & 0xff;
    zlib[p++] = (len >>> 8) & 0xff;
    zlib[p++] = ~len & 0xff;
    zlib[p++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), p);
    p += len;
  }
  let a = 1;
  let bsum = 0;
  // Adler-32 with the modulo deferred over blocks (zlib's NMAX).
  for (let start = 0; start < raw.length; start += 5552) {
    const end = Math.min(raw.length, start + 5552);
    for (let i = start; i < end; i++) {
      a += raw[i];
      bsum += a;
    }
    a %= 65521;
    bsum %= 65521;
  }
  const adler = ((bsum << 16) | a) >>> 0;
  zlib[p++] = (adler >>> 24) & 0xff;
  zlib[p++] = (adler >>> 16) & 0xff;
  zlib[p++] = (adler >>> 8) & 0xff;
  zlib[p++] = adler & 0xff;

  const chunks: [string, Uint8Array][] = [
    ['IHDR', ihdr(w, h)],
    ['IDAT', zlib.subarray(0, p)],
    ['IEND', new Uint8Array(0)],
  ];
  const total = 8 + chunks.reduce((s, [, d]) => s + 12 + d.length, 0);
  const out = new Uint8Array(total);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  let o = 8;
  for (const [type, data] of chunks) {
    writeU32(out, o, data.length);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = type.charCodeAt(i);
    out.set(data, o + 8);
    writeU32(out, o + 8 + data.length, crc32(out, o + 4, o + 8 + data.length));
    o += 12 + data.length;
  }
  return out;
}

function ihdr(w: number, h: number) {
  const d = new Uint8Array(13);
  writeU32(d, 0, w);
  writeU32(d, 4, h);
  d[8] = 8; // bit depth
  d[9] = 6; // RGBA
  return d;
}

function writeU32(buf: Uint8Array, offset: number, v: number) {
  buf[offset] = (v >>> 24) & 0xff;
  buf[offset + 1] = (v >>> 16) & 0xff;
  buf[offset + 2] = (v >>> 8) & 0xff;
  buf[offset + 3] = v & 0xff;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array) {
  // Native btoa (browsers, Hermes) is much faster than building the string in JS.
  const nativeBtoa = (globalThis as { btoa?: (s: string) => string }).btoa;
  if (typeof nativeBtoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[]);
    return nativeBtoa(bin);
  }
  // Fallback: two base64 characters per 12 bits via a lookup table.
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(PAIRS[n >> 12] + PAIRS[n & 4095]);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    parts.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==');
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=');
  }
  return parts.join('');
}

const PAIRS: string[] = [];
for (let n = 0; n < 4096; n++) PAIRS.push(B64[n >> 6] + B64[n & 63]);

export function pngDataUri(rgba: ArrayLike<number>, width: number, height: number, upscale = 1) {
  return `data:image/png;base64,${base64(encodePng(rgba, width, height, upscale))}`;
}
