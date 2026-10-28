import { rng } from './util.js';

// The bark of the trees, each species as it looks at breast height, made as a relief first (a height field: plates,
// fissures, scales, lenticels) and coloured from it, so the light falls into its cracks the way it does on a trunk:
//  * the normal map from that relief (not from the colour's brightness), its depth as the species' (oak ~2 cm, beech
//    almost none);
//  * the colour darkened where the relief is deep (the light hardly reaches a fissure's bottom), the plates' tops
//    weathered greyer, the lichens on them (grey-green, whitish crusts with dark rims on the smooth barks);
//  * one tile is 0.55 m round the stem and 1.2 m along it (broadgen.js, trees.js keep that scale), 512 x 1024 px:
//    ~1 mm a pixel (256 x 512 at the lowest setting: they are drawn at start, ~0.3 s each on a phone's CPU), every
//    pattern periodic both ways (no seam round the trunk or up it).
// Species (as in the woods round Câmpina; the mosses and the green algae on the north side and at the foot are drawn by
// the bark's shader, materials.js mossy):
//  * beech (Fagus sylvatica): smooth silvery grey, mottled, crusts of whitish lichen with dark rims, fine horizontal
//    wrinkles, the dark chevrons ("eyes") over shed branches;
//  * hornbeam (Carpinus betulus): smooth darker grey with a net of paler silvery streaks running up the fluted stem;
//  * sessile oak (Quercus petraea): thick grey bark split into long plates by deep brown fissures, the plates broken
//    across, lichen on their tops;
//  * black locust (Robinia pseudoacacia): a deep net of interlacing corky ridges, grey-brown on top, orange-brown in the
//    furrows;
//  * birch: chalk white, dark horizontal lenticels, papery strips peeling (pinkish under), dark rough diamonds;
//  * Norway spruce (Picea abies): thin rounded scales, red-brown where fresh, grey where weathered;
//  * black pine (Pinus nigra): dark grey to black, deeply fissured into long plates whose flaky surfaces are lighter;
//  * the generic bark (yard and riverside trees: walnut, willow, poplar, fruit trees): grey-brown, shallow interlacing
//    furrows.

let W = 512, H = 1024;
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// periodic value noise: px x py cells over the tile
function noise2(seed) {
  const R = rng(seed), P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = R();
  return (u, v, px, py) => {
    const x = u * px, y = v * py, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = P[(y0 & 255) * 256 + (x0 & 255)], b = P[(y0 & 255) * 256 + (x1 & 255)], c = P[(y1 & 255) * 256 + (x0 & 255)], d = P[(y1 & 255) * 256 + (x1 & 255)];
    const s = fx * fx * (3 - 2 * fx), t = fy * fy * (3 - 2 * fy);
    return a + (b - a) * s + (c - a) * t + (a - b - c + d) * s * t;
  };
}
function fbm2(seed, oct = 4) {
  const ns = Array.from({ length: oct }, (_, i) => noise2(seed + i * 101));
  return (u, v, px, py) => { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * ns[i](u, v, px << i, py << i); n += a; a *= 0.5; } return s / n; };
}
// periodic Voronoi on a jittered cx x cy grid: f1, f2 (metres, the tile 0.55 x 1.2 m) and the nearest cell's index
function voronoi(seed, cx, cy, jit = 0.9) {
  const R = rng(seed), J = new Float32Array(cx * cy * 2);
  for (let i = 0; i < J.length; i++) J[i] = 0.5 + (R() - 0.5) * jit;
  const sx = 0.55 / cx, sy = 1.2 / cy, out = [0, 0, 0];
  return (u, v) => {
    const gx = u * cx, gy = v * cy, ix = Math.floor(gx), iy = Math.floor(gy);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ci = (((ix + i) % cx) + cx) % cx, cj = (((iy + j) % cy) + cy) % cy, k = cj * cx + ci;
      const dx = (ix + i + J[k * 2] - gx) * sx, dy = (iy + j + J[k * 2 + 1] - gy) * sy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  };
}
const hash = (k, s) => { let h = Math.imul(k ^ (s * 2654435761), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// fn(u, v, out): out = [height 0..1, r, g, b (0..1, sRGB)]; depth: the relief's depth (m); cavity: how much a deep
// spot darkens
let toNormal = null;
function make(fn, depth, cavity) {
  const Hf = new Float32Array(W * H), c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), o = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    fn(x / W, y / H, o);
    const i = y * W + x, h = o[0], ao = 1 - cavity * (1 - h) * (1 - h);
    Hf[i] = h;
    img.data[i * 4] = Math.min(255, o[1] * ao * 255); img.data[i * 4 + 1] = Math.min(255, o[2] * ao * 255); img.data[i * 4 + 2] = Math.min(255, o[3] * ao * 255); img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // (the normal map's slope: the height's step over two pixels in metres - the relief's true steepness)
  return { map: c, normal: toNormal(Hf, W, H, depth / (0.55 / W) * 0.5) };
}
const mix = (o, r, g, b, k) => { o[1] += (r - o[1]) * k; o[2] += (g - o[2]) * k; o[3] += (b - o[3]) * k; };

// tex(canvas, opts): textures.js's; heightToNormal(H, w, h, strength): its tangent-space normal map from a height field;
// half: at half the resolution
export function genBarkTextures(TEX, tex, heightToNormal, half = false) {
  toNormal = heightToNormal;
  W = half ? 256 : 512; H = W * 2;
  const put = (key, { map, normal }) => { TEX[key] = tex(map); TEX[key + 'N'] = tex(normal, { srgb: false }); };
  // ---- beech: smooth, silvery grey, softly mottled, lichen crusts with dark rims, wrinkles, the branch scars' chevrons
  {
    const m = fbm2(11, 4), mm = fbm2(12, 3), lA = fbm2(13, 4), lB = fbm2(14, 4), wr = noise2(15), sc = rng(16);
    const scars = Array.from({ length: 2 }, () => [0.15 + sc() * 0.7, 0.1 + sc() * 0.8, 0.03 + sc() * 0.025]);
    put('barkBeech', make((u, v, o) => {
      const n = m(u, v, 8, 6), b = mm(u, v, 32, 40);
      let h = 0.6 + 0.12 * n + 0.04 * b;
      o[1] = 0.55 + 0.1 * n + 0.04 * b; o[2] = o[1] + 0.006; o[3] = o[1] - 0.02;
      // crustose lichens: paler patches, a faint darker line round them
      const a = lA(u, v, 16, 14), edge = sm(0.62, 0.64, a) - sm(0.64, 0.67, a), patch = sm(0.64, 0.68, a);
      mix(o, 0.68, 0.69, 0.66, patch * 0.32); mix(o, 0.3, 0.3, 0.28, edge * 0.3); h += patch * 0.02 - edge * 0.02;
      const g = sm(0.62, 0.74, lB(u, v, 10, 9)); mix(o, 0.5, 0.55, 0.42, g * 0.28);
      // fine horizontal wrinkles (stretch marks of the growing stem)
      const w = wr(u, v, 18, 240), wk = sm(0.8, 0.9, w) * sm(0.45, 0.6, m(u, v, 24, 8));
      mix(o, 0.33, 0.33, 0.31, wk * 0.35); h -= wk * 0.08;
      for (const [cx, cy, s] of scars) {
        let dx = u - cx; dx -= Math.round(dx); let dy = v - cy; dy -= Math.round(dy);
        const X = dx * 0.55, Y = dy * 1.2, arc = Math.abs(Y - 0.6 * X * X / s + 0.2 * s), on = Math.abs(X) < s * 1.6 ? sm(0.006, 0.0, arc) : 0;
        mix(o, 0.24, 0.24, 0.22, on * 0.6); h -= on * 0.15;
      }
      o[0] = Math.min(1, Math.max(0, h));
    }, 0.004, 0.3));
  }
  // ---- hornbeam: smooth steel grey, fine paler streaks running up the stem in a loose net
  {
    const wa = fbm2(21, 3), m = fbm2(22, 4), lA = fbm2(23, 4), st = noise2(24), st2 = noise2(25);
    put('barkHornbeam', make((u, v, o) => {
      const warp = wa(u, v, 4, 2) * 2.2, f = u * 16 + warp, s = Math.abs(Math.sin(Math.PI * f)), n = m(u, v, 12, 10);
      const net = sm(0.9, 0.99, s) * sm(0.42, 0.62, st(u, v, 16, 5)) + 0.5 * sm(0.93, 0.995, Math.abs(Math.sin(Math.PI * (u * 9 - warp * 0.7)))) * sm(0.5, 0.7, st2(u, v, 9, 4));
      o[1] = 0.45 + 0.09 * n; o[2] = o[1] + 0.006; o[3] = o[1] - 0.008;
      mix(o, 0.66, 0.67, 0.64, Math.min(1, net) * 0.45);
      const l = sm(0.66, 0.72, lA(u, v, 12, 10)); mix(o, 0.6, 0.61, 0.58, l * 0.25);
      o[0] = 0.55 + 0.08 * n + 0.06 * Math.min(1, net);
    }, 0.004, 0.3));
  }
  // ---- sessile oak: long narrow plates that split and join (two sets of fissures at a slant, crossing), parted by
  // deep brown fissures, broken across here and there by thin cracks, lichen on their tops
  {
    const wa = fbm2(32, 4), wb = fbm2(36, 4), fine = fbm2(33, 4), lA = fbm2(34, 4), cr = noise2(35), cm = noise2(38), fib = noise2(37);
    put('barkOak', make((u, v, o) => {
      const a = 1.2 * wa(u, v, 5, 2), b = 1.2 * wb(u, v, 5, 2);
      const n1 = Math.abs(Math.sin(Math.PI * (u * 9 + v + a))), n2 = Math.abs(Math.sin(Math.PI * (u * 9 - v + b)));
      const s = Math.min(n1, n2) * 0.75 + n1 * n2 * 0.25;
      const fiss = sm(0.08, 0.5, s), plate = Math.sqrt(sm(0.2, 0.7, s));
      // thin cracks across the plates
      const cl = Math.abs(Math.sin(Math.PI * (v * 9 + 0.7 * cr(u, v, 9, 3)))), across = sm(0.07, 0.0, cl) * sm(0.55, 0.7, cm(u, v, 18, 6)) * plate;
      const n = fine(u, v, 48, 60), fb = fib(u, v, 120, 10);
      const h = 0.04 + 0.8 * fiss * (1 - 0.7 * across) + 0.08 * n * plate + 0.04 * (fb - 0.5) * plate;
      o[1] = 0.36 + 0.15 * plate + 0.07 * n; o[2] = o[1] - 0.01; o[3] = o[1] - 0.035;
      mix(o, 0.11, 0.075, 0.05, (1 - fiss) * 0.9);                              // (the fissures' bottoms: brown)
      mix(o, 0.15, 0.11, 0.08, across * 0.6);
      const l = sm(0.6, 0.68, lA(u, v, 10, 10)) * plate; mix(o, 0.5, 0.54, 0.43, l * 0.45);
      o[0] = Math.min(1, Math.max(0, h));
    }, 0.022, 0.7));
  }
  // ---- black locust: a deep net of interlacing corky ridges, grey-brown on top, orange-brown in the furrows
  {
    const wa = fbm2(41, 3), wb = fbm2(42, 3), fine = fbm2(43, 4), fib = noise2(44);
    put('barkRobinia', make((u, v, o) => {
      const a = wa(u, v, 6, 4) * 1.4, b = wb(u, v, 6, 4) * 1.4;
      const n1 = Math.abs(Math.sin(Math.PI * (u * 6 + v * 2 + a))), n2 = Math.abs(Math.sin(Math.PI * (u * 6 - v * 2 + b)));
      const ridge = Math.pow(Math.min(n1, n2), 0.6), n = fine(u, v, 40, 50), fb = fib(u, v, 160, 12);
      o[1] = 0.24 + 0.24 * ridge + 0.06 * n; o[2] = 0.2 + 0.23 * ridge + 0.05 * n; o[3] = 0.16 + 0.21 * ridge + 0.05 * n;
      mix(o, 0.36, 0.19, 0.09, (1 - ridge) * 0.6);
      o[0] = Math.min(1, Math.max(0, 0.05 + 0.85 * ridge + 0.07 * (fb - 0.5) * ridge + 0.04 * n));
    }, 0.026, 0.7));
  }
  // ---- birch: chalk white, dark horizontal lenticels, papery strips peeling (pinkish under), dark rough patches
  {
    const m = fbm2(51, 4), dia = fbm2(52, 4), len = noise2(53), len2 = noise2(55), pe = fbm2(54, 3);
    put('barkBirch', make((u, v, o) => {
      const n = m(u, v, 16, 20);
      o[1] = 0.84 + 0.06 * n; o[2] = 0.83 + 0.06 * n; o[3] = 0.79 + 0.05 * n;
      let h = 0.7 + 0.05 * n;
      // lenticels: short dark dashes across the stem, a few longer
      const L = Math.max(sm(0.8, 0.86, len(u, v, 26, 300)) * sm(0.42, 0.58, m(u, v, 44, 14)), 0.8 * sm(0.86, 0.9, len2(u, v, 10, 220)) * sm(0.5, 0.62, m(u, v, 20, 9)));
      mix(o, 0.14, 0.11, 0.1, L * 0.85); h -= L * 0.2;
      const p = pe(u, v, 4, 18), peel = sm(0.68, 0.71, p) - sm(0.71, 0.78, p); mix(o, 0.78, 0.62, 0.54, peel * 0.5); h += peel * 0.1;
      // the dark rough patches (round the old branch bases), small and ragged
      const dd = dia(u, v, 10, 6), d = sm(0.72, 0.77, dd) * (0.7 + 0.3 * sm(0.4, 0.6, m(u, v, 60, 60))); mix(o, 0.16, 0.14, 0.13, d * 0.88); h -= d * (0.25 + 0.2 * n);
      o[0] = Math.min(1, Math.max(0, h));
    }, 0.006, 0.4));
  }
  // ---- Norway spruce: thin rounded scales lying over each other, red-brown where fresh, grey where weathered
  {
    const vo = voronoi(61, 22, 40, 0.95), fine = fbm2(62, 3), m = fbm2(63, 3);
    put('barkSpruce', make((u, v, o) => {
      const [f1, f2, id] = vo(u, v), e = f2 - f1, n = fine(u, v, 64, 80), w = hash(id, 7), g = sm(0.4, 0.72, m(u, v, 6, 8));
      const rim = sm(0.0, 0.005, e);
      o[1] = 0.34 + 0.08 * w + 0.05 * n; o[2] = 0.26 + 0.06 * w + 0.04 * n; o[3] = 0.21 + 0.05 * w + 0.03 * n;
      mix(o, 0.42, 0.4, 0.37, g * (0.55 + 0.35 * w));                           // (weathered grey)
      mix(o, 0.15, 0.11, 0.09, (1 - rim) * 0.28);                               // (the gaps between the scales)
      o[0] = Math.min(1, Math.max(0, 0.3 + 0.5 * rim * (0.75 + 0.25 * w) + 0.1 * n));
    }, 0.006, 0.5));
  }
  // ---- black pine: long dark plates between deep fissures that split and join, their flaky surfaces lighter grey
  {
    const wa = fbm2(72, 4), wb = fbm2(75, 4), fl = voronoi(73, 26, 44, 0.95), fine = fbm2(74, 3), cr = noise2(76), cm = noise2(78), tn = fbm2(77, 3);
    put('barkPine', make((u, v, o) => {
      const a = 1.2 * wa(u, v, 4, 2), b = 1.2 * wb(u, v, 4, 2);
      const n1 = Math.abs(Math.sin(Math.PI * (u * 6 + v + a))), n2 = Math.abs(Math.sin(Math.PI * (u * 6 - v + b)));
      const s = Math.min(n1, n2) * 0.75 + n1 * n2 * 0.25;
      const fiss = sm(0.1, 0.5, s), plate = Math.sqrt(sm(0.22, 0.7, s));
      const cl = Math.abs(Math.sin(Math.PI * (v * 6 + 0.7 * cr(u, v, 6, 3)))), across = sm(0.08, 0.0, cl) * sm(0.5, 0.65, cm(u, v, 12, 5)) * plate;
      const [g1, g2, fid] = fl(u, v), flake = sm(0.0, 0.003, g2 - g1), n = fine(u, v, 48, 64), ft = hash(fid, 13), t = tn(u, v, 6, 4);
      o[1] = 0.26 + 0.08 * t + 0.14 * flake * ft * plate + 0.05 * n; o[2] = o[1] - 0.015; o[3] = o[1] - 0.03;
      mix(o, 0.05, 0.045, 0.04, (1 - fiss) * 0.92);
      mix(o, 0.1, 0.09, 0.08, across * 0.6);
      o[0] = Math.min(1, Math.max(0, 0.05 + 0.78 * fiss * (1 - 0.6 * across) + 0.06 * flake * plate + 0.05 * n));
    }, 0.026, 0.7));
  }
  // ---- the generic bark: grey-brown, shallow interlacing furrows
  {
    const wa = fbm2(81, 3), wb = fbm2(82, 3), fine = fbm2(83, 4);
    put('bark', make((u, v, o) => {
      const a = wa(u, v, 5, 4) * 1.3, b = wb(u, v, 5, 4) * 1.3;
      const n1 = Math.abs(Math.sin(Math.PI * (u * 8 + v * 2 + a))), n2 = Math.abs(Math.sin(Math.PI * (u * 8 - v * 2 + b)));      // (v x an integer: it tiles up the stem)
      const ridge = Math.pow(Math.max(n1, n2) * 0.5 + Math.min(n1, n2) * 0.5, 0.7), n = fine(u, v, 32, 48);
      o[1] = 0.27 + 0.15 * ridge + 0.07 * n; o[2] = o[1] * 0.88; o[3] = o[1] * 0.78;
      o[0] = Math.min(1, Math.max(0, 0.2 + 0.65 * ridge + 0.1 * n));
    }, 0.012, 0.5));
  }
}
