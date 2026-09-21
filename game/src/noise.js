/**
 * Zgomot procedural determinist (value-noise tileabil + fBm) folosit
 * pentru generarea tuturor texturilor PBR din joc. Fara assete externe.
 */

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return function rand() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

export function hash2i(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise tileabil pe `period` celule (texturile se repeta fara cusatura). */
export function vnoise(x, y, period, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const p = period | 0;
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash2i(x0, y0, seed), b = hash2i(x1, y0, seed);
  const c = hash2i(x0, y1, seed), d = hash2i(x1, y1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, opts = {}) {
  const { octaves = 4, period = 8, seed = 0, gain = 0.5, lac = 2 } = opts;
  let amp = 1, sum = 0, norm = 0, f = 1, p = period;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, Math.max(1, Math.round(p)), seed + o * 131);
    norm += amp;
    amp *= gain; f *= lac; p *= lac;
  }
  return sum / norm;
}

/** fBm cu creste ascutite - bun pentru crapaturi/fisuri in asfalt. */
export function ridged(x, y, opts = {}) {
  const { octaves = 4, period = 8, seed = 0 } = opts;
  let amp = 1, sum = 0, norm = 0, f = 1, p = period;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, Math.max(1, Math.round(p)), seed + o * 977) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5; f *= 2; p *= 2;
  }
  return sum / norm;
}

/** Converteste un camp de inaltime (Float32Array) in normal map RGBA, cu wrap. */
export function heightToNormal(height, w, h, strength = 2.0) {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x, y) => height[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
