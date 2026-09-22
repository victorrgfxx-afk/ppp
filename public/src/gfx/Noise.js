/* Seeded, *tileable* procedural noise used by the texture generators.
   Every function is periodic over `period` lattice cells so the resulting
   textures repeat seamlessly when tiled across the ground. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

/** Periodic value noise on a `period x period` lattice. */
export class ValueNoise {
  constructor(period = 8, seed = 1) {
    this.p = period;
    const rnd = mulberry32(seed);
    this.g = new Float32Array(period * period);
    for (let i = 0; i < this.g.length; i++) this.g[i] = rnd();
  }
  at(x, y) {
    const p = this.p;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const g = this.g;
    const v00 = g[y0 * p + x0], v10 = g[y0 * p + x1];
    const v01 = g[y1 * p + x0], v11 = g[y1 * p + x1];
    const u = smooth(xf), v = smooth(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  }
}

/** Tileable fBm: octave i uses a lattice of period*2^i so the sum stays periodic. */
export class Fbm {
  constructor(period = 8, octaves = 5, seed = 1, gain = 0.5, lacunarity = 2) {
    this.period = period; this.octaves = octaves; this.gain = gain; this.lac = lacunarity;
    this.layers = [];
    let per = period;
    for (let i = 0; i < octaves; i++) {
      this.layers.push(new ValueNoise(Math.max(2, Math.round(per)), seed + i * 7919));
      per *= lacunarity;
    }
  }
  at(x, y) {
    let amp = 1, sum = 0, norm = 0, f = 1;
    for (let i = 0; i < this.octaves; i++) {
      sum += this.layers[i].at(x * f, y * f) * amp;
      norm += amp;
      amp *= this.gain; f *= this.lac;
    }
    return sum / norm;
  }
  /** Ridged variant — good for cracks and scratches. */
  ridged(x, y) {
    let amp = 1, sum = 0, norm = 0, f = 1;
    for (let i = 0; i < this.octaves; i++) {
      sum += (1 - Math.abs(this.layers[i].at(x * f, y * f) * 2 - 1)) * amp;
      norm += amp; amp *= this.gain; f *= this.lac;
    }
    return sum / norm;
  }
}

/** Periodic Worley (cellular) noise. Returns {d1,d2,id} — pebbles, cracks, cells. */
export class Worley {
  constructor(period = 8, seed = 1) {
    this.p = period;
    const rnd = mulberry32(seed);
    this.px = new Float32Array(period * period);
    this.py = new Float32Array(period * period);
    this.id = new Float32Array(period * period);
    for (let i = 0; i < this.px.length; i++) {
      this.px[i] = rnd(); this.py[i] = rnd(); this.id[i] = rnd();
    }
  }
  at(x, y) {
    const p = this.p;
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
        const k = wy * p + wx;
        const fx = cx + this.px[k], fy = cy + this.py[k];
        const dx = fx - x, dy = fy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = this.id[k]; }
        else if (d < d2) { d2 = d; }
      }
    }
    return { d1, d2, id };
  }
}

export const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
export const mix = (a, b, t) => a + (b - a) * t;
export { smooth, lerp };
