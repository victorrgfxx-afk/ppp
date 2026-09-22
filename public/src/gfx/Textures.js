/* ============================================================================
   Procedural PBR texture library.

   Everything the world is made of is generated here at boot: albedo, normal and
   roughness maps for gravel, concrete, asphalt, grass, sandwich panel, trapezoid
   roof sheet, corrugated steel, sectional doors, roof tiles, plaster, bark,
   foliage/grass alpha cards, welded wire mesh and licence plates.

   All ground/wall maps are *tileable* (the noise lattices are periodic), and each
   one records `worldSize` — how many metres one repeat covers — so materials can
   compute their own repeat counts from real geometry sizes.
   ========================================================================== */
import * as THREE from 'three';
import { Fbm, Worley, ValueNoise, mulberry32, clamp01, mix } from './Noise.js';

const canvas = (w, h = w) => {
  const c = (typeof OffscreenCanvas !== 'undefined' && !navigator.userAgent.includes('Firefox'))
    ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.width = w; c.height = h;
  return c;
};

function texFrom(source, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(source);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

/** Sobel height -> tangent-space normal map, sampled with wrap so it stays seamless. */
function normalFromHeight(height, size, strength = 2.0) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const H = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = H(x - 1, y - 1), t = H(x, y - 1), tr = H(x + 1, y - 1);
      const l = H(x - 1, y), r = H(x + 1, y);
      const bl = H(x - 1, y + 1), b = H(x, y + 1), br = H(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(values, size) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size); const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = clamp01(values[i]) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Paint one tile: cb(x,y,u,v) -> [r,g,b, height, roughness] in 0..1 */
function paint(size, cb) {
  const c = canvas(size); const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size); const d = img.data;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = cb(x, y, x / size, y / size);
      d[i * 4] = o[0] * 255; d[i * 4 + 1] = o[1] * 255; d[i * 4 + 2] = o[2] * 255; d[i * 4 + 3] = 255;
      height[i] = o[3]; rough[i] = o[4];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { albedo: c, height, rough };
}

function bundle(size, worldSize, painted, normalStrength, aniso) {
  return {
    worldSize,
    map: texFrom(painted.albedo, { srgb: true, aniso }),
    normalMap: texFrom(normalFromHeight(painted.height, size, normalStrength), { aniso }),
    roughnessMap: texFrom(grayCanvas(painted.rough, size), { aniso }),
  };
}

/* ======================= individual generators ============================ */

const G = {
  /* --- crushed-stone yard: the surface most of the map is made of --- */
  gravel(size, aniso) {
    const cells = new Worley(28, 11);
    const grit = new Fbm(size / 4, 4, 23);
    const dirt = new Fbm(4, 4, 77);
    const s = 28;
    const p = paint(size, (x, y, u, v) => {
      const w = cells.at(u * s, v * s);
      const pebble = clamp01(1 - w.d1 * 2.3);              // rounded stone body
      const edge = clamp01((w.d2 - w.d1) * 3.2);           // crevice darkening
      const g = grit.at(u * size / 4, v * size / 4);
      const dust = dirt.at(u * 4, v * 4);
      // stone colour: mostly grey river ballast with a few warm/brown ones
      let base = 0.42 + w.id * 0.33;
      const warm = w.id > 0.78 ? 1 : 0;
      // river ballast here is warm limestone, not blue granite — matches the photos
      let r = base * (1.18 + warm * 0.22), gg = base * (1.02 + warm * 0.06), b = base * (0.76 - warm * 0.10);
      const shade = mix(0.55, 1.12, pebble) * mix(0.82, 1.0, edge) * mix(0.9, 1.06, g);
      const dustMix = clamp01(dust * 0.55 + 0.12);         // pale limestone dust between stones
      r = mix(r * shade, 0.735, dustMix * (1 - pebble) * 0.75);
      gg = mix(gg * shade, 0.655, dustMix * (1 - pebble) * 0.75);
      b = mix(b * shade, 0.495, dustMix * (1 - pebble) * 0.75);
      const h = pebble * 0.85 + g * 0.15;
      const ro = mix(0.98, 0.72, pebble * (1 - dustMix));
      return [clamp01(r), clamp01(gg), clamp01(b), h, ro];
    });
    return bundle(size, 3.0, p, 2.6, aniso);
  },

  /* --- poured concrete slab (the pads in photos 2-4 and the driveway) --- */
  concrete(size, aniso) {
    const mottle = new Fbm(6, 5, 5);
    const fine = new Fbm(size / 3, 3, 91);
    const agg = new Worley(60, 33);
    const cracks = new Fbm(8, 4, 44);
    const stain = new Fbm(3, 3, 61);
    const p = paint(size, (x, y, u, v) => {
      const m = mottle.at(u * 6, v * 6);
      const f = fine.at(u * size / 3, v * size / 3);
      const a = agg.at(u * 60, v * 60);
      const cr = 1 - clamp01(Math.abs(cracks.ridged(u * 8, v * 8) - 0.80) * 90); // hairline cracks only
      const st = clamp01(stain.at(u * 3, v * 3) * 1.4 - 0.45);
      let g = 0.475 + (m - 0.5) * 0.15 + (f - 0.5) * 0.06;
      g *= 1 - clamp01(1 - a.d1 * 3.4) * 0.05;   // faint aggregate shadows
      g *= 1 - cr * 0.16;                        // cracks darken
      g = mix(g, g * 0.78, st * 0.55);           // oil / weather staining
      const tint = 1 - st * 0.06;
      const h = 0.5 + (f - 0.5) * 0.5 - cr * 0.35 - clamp01(1 - a.d1 * 3.4) * 0.12;
      const ro = clamp01(0.80 + (m - 0.5) * 0.10 + st * 0.06);
      return [g * 1.045 * tint, g * tint, g * 0.925 * tint, h, ro];
    });
    return bundle(size, 2.5, p, 1.1, aniso);
  },

  /* --- road asphalt for the street along the south boundary --- */
  asphalt(size, aniso) {
    const agg = new Worley(46, 7);
    const grain = new Fbm(size / 3, 3, 17);
    const wear = new Fbm(4, 4, 88);
    const p = paint(size, (x, y, u, v) => {
      const a = agg.at(u * 46, v * 46);
      const gr = grain.at(u * size / 3, v * size / 3);
      const w = wear.at(u * 4, v * 4);
      const stone = clamp01(1 - a.d1 * 3.0);
      let g = 0.085 + stone * (0.06 + a.id * 0.16) + (gr - 0.5) * 0.05 + (w - 0.5) * 0.04;
      const h = stone * 0.7 + gr * 0.3;
      return [g * 1.02, g, g * 1.04, h, clamp01(0.94 - stone * 0.2)];
    });
    return bundle(size, 3.2, p, 1.8, aniso);
  },

  /* --- bare compacted dirt (worn tracks in the yard) --- */
  dirt(size, aniso) {
    const f = new Fbm(6, 5, 12);
    const st = new Worley(34, 19);
    const p = paint(size, (x, y, u, v) => {
      const n = f.at(u * 6, v * 6);
      const s = st.at(u * 34, v * 34);
      const stone = clamp01(1 - s.d1 * 3.6) * (s.id > 0.6 ? 1 : 0.2);
      let r = 0.40 + n * 0.20, g = 0.33 + n * 0.17, b = 0.25 + n * 0.13;
      r = mix(r, 0.52, stone * 0.7); g = mix(g, 0.50, stone * 0.7); b = mix(b, 0.47, stone * 0.7);
      return [r, g, b, n * 0.5 + stone * 0.5, 0.95 - stone * 0.1];
    });
    return bundle(size, 3.0, p, 1.6, aniso);
  },

  /* --- rough grass for the verges and the orchard floor --- */
  grass(size, aniso) {
    const clump = new Fbm(5, 4, 31);
    const blade = new Fbm(size / 2, 2, 63);
    const dry = new Fbm(3, 3, 97);
    const p = paint(size, (x, y, u, v) => {
      const c = clump.at(u * 5, v * 5);
      const bl = blade.at(u * size / 2, v * size / 2);
      const d = clamp01(dry.at(u * 3, v * 3) * 1.6 - 0.55);
      const lum = 0.55 + (c - 0.5) * 0.5 + (bl - 0.5) * 0.45;
      let r = 0.17 + lum * 0.20, g = 0.28 + lum * 0.30, b = 0.10 + lum * 0.11;
      r = mix(r, 0.44, d * 0.7); g = mix(g, 0.40, d * 0.55); b = mix(b, 0.21, d * 0.5);
      return [clamp01(r), clamp01(g), clamp01(b), bl * 0.7 + c * 0.3, 0.92];
    });
    return bundle(size, 2.0, p, 1.5, aniso);
  },

  /* --- sandwich-panel cladding (both workshop buildings).
         The panels on these buildings run VERTICALLY: the joints are upright
         lines about a metre apart, with the fixing screws down them. --- */
  panel(size, aniso) {
    const dirt = new Fbm(4, 4, 41);
    const streak = new Fbm(2, 3, 52);
    const p = paint(size, (x, y, u, v) => {
      // vertical joints every half-tile = every 1 m of wall
      const jx = ((u * 2) % 1);
      const joint = clamp01(1 - Math.min(jx, 1 - jx) * 90);
      // faint micro-ribbing between the joints, as on trapezoidal panel
      const rib = (Math.sin(u * Math.PI * 2 * 24) * 0.5 + 0.5) * 0.045;
      const d = dirt.at(u * 4, v * 4);
      const sk = streak.at(u * 2, v * 2);
      let g = 0.805 + (d - 0.5) * 0.045 + (rib - 0.022);
      g -= joint * 0.13;
      g -= clamp01(v - 0.72) * 0.30 * clamp01(sk * 1.4);   // grime creeping up from the base
      const h = 0.62 - joint * 0.8 + rib * 1.4;
      return [g, g * 1.002, g * 0.99, h, clamp01(0.45 + (d - 0.5) * 0.18 + joint * 0.2)];
    });
    return bundle(size, 2.0, p, 1.5, aniso);
  },

  /* --- trapezoidal roof sheet --- */
  roofSheet(size, aniso) {
    const weather = new Fbm(5, 4, 71);
    const p = paint(size, (x, y, u, v) => {
      const rib = (u * 8) % 1;                       // 8 ribs per tile
      const prof = rib < 0.18 ? rib / 0.18 : rib < 0.34 ? 1 : rib < 0.5 ? (0.5 - rib) / 0.16 : 0;
      const w = weather.at(u * 5, v * 5);
      let g = 0.44 + prof * 0.16 + (w - 0.5) * 0.10;
      return [g * 1.01, g * 1.02, g * 1.05, prof * 0.9 + w * 0.1, clamp01(0.55 + (w - 0.5) * 0.25)];
    });
    return bundle(size, 2.0, p, 2.6, aniso);
  },

  /* --- dark green corrugated steel: the industrial hall to the north --- */
  corrugated(size, aniso) {
    const rust = new Fbm(4, 4, 101);
    const p = paint(size, (x, y, u, v) => {
      const wave = (Math.sin(u * Math.PI * 2 * 10) * 0.5 + 0.5);
      const ru = clamp01(rust.at(u * 4, v * 4) * 1.5 - 0.62) * clamp01(v * 1.6 - 0.2);
      let r = 0.115 + wave * 0.075, g = 0.165 + wave * 0.095, b = 0.145 + wave * 0.08;
      r = mix(r, 0.36, ru); g = mix(g, 0.20, ru); b = mix(b, 0.12, ru);
      return [r, g, b, wave, clamp01(0.52 + ru * 0.4)];
    });
    return bundle(size, 2.0, p, 2.2, aniso);
  },

  /* --- sectional garage door, dark grey, horizontal ribs --- */
  sectionalDoor(size, aniso) {
    const grain = new Fbm(size / 3, 3, 13);
    const dirt = new Fbm(3, 3, 57);
    const p = paint(size, (x, y, u, v) => {
      const seg = (v * 4) % 1;                       // 4 panels per tile
      const groove = clamp01(1 - Math.abs(seg - 0.02) * 46) + clamp01(1 - Math.abs(seg - 0.98) * 46);
      const bevel = Math.sin(seg * Math.PI) * 0.35 + 0.5;
      const gr = grain.at(u * size / 3, v * size / 3);
      const d = dirt.at(u * 3, v * 3);
      let g = 0.135 + bevel * 0.055 + (gr - 0.5) * 0.02 + (d - 0.5) * 0.02;
      g *= 1 - groove * 0.55;
      return [g, g * 1.02, g * 1.06, bevel * 0.7 - groove * 0.7, clamp01(0.38 + (gr - 0.5) * 0.3)];
    });
    return bundle(size, 2.0, p, 2.0, aniso);
  },

  /* --- red ceramic roof tiles for the neighbouring houses --- */
  roofTile(size, aniso) {
    const wear = new Fbm(6, 4, 83);
    const p = paint(size, (x, y, u, v) => {
      const rows = 6, cols = 6;
      const ry = v * rows, row = Math.floor(ry), fy = ry - row;
      const offset = (row % 2) * 0.5;
      const rx = u * cols + offset, fx = rx - Math.floor(rx);
      const capped = Math.sin(fx * Math.PI);                 // barrel profile
      const lip = clamp01(1 - fy * 6);                        // shadow under the row above
      const w = wear.at(u * 6, v * 6);
      let r = 0.40 + capped * 0.22 + (w - 0.5) * 0.10;
      let g = 0.155 + capped * 0.095 + (w - 0.5) * 0.05;
      let b = 0.10 + capped * 0.06 + (w - 0.5) * 0.04;
      const moss = clamp01(w * 1.5 - 0.95);
      r = mix(r, 0.26, moss); g = mix(g, 0.27, moss); b = mix(b, 0.16, moss);
      const shade = 1 - lip * 0.45;
      return [r * shade, g * shade, b * shade, capped * 0.8 - lip * 0.5, 0.82];
    });
    return bundle(size, 2.4, p, 2.4, aniso);
  },

  /* --- painted plaster for house walls --- */
  plaster(size, aniso) {
    const g1 = new Fbm(size / 3, 3, 3);
    const g2 = new Fbm(5, 4, 29);
    const p = paint(size, (x, y, u, v) => {
      const f = g1.at(u * size / 3, v * size / 3);
      const m = g2.at(u * 5, v * 5);
      const lum = 0.645 + (m - 0.5) * 0.10 + (f - 0.5) * 0.05;
      return [lum * 1.06, lum * 0.995, lum * 0.845, f * 0.6 + m * 0.4, clamp01(0.72 + (f - 0.5) * 0.2)];
    });
    return bundle(size, 2.0, p, 1.2, aniso);
  },

  /* --- tree bark --- */
  bark(size, aniso) {
    const rid = new Fbm(6, 5, 67, 0.55);
    const p = paint(size, (x, y, u, v) => {
      const r1 = rid.ridged(u * 10, v * 2.2);
      const n = rid.at(u * 6, v * 6);
      const lum = 0.16 + r1 * 0.26 + (n - 0.5) * 0.08;
      return [lum * 1.22, lum * 1.02, lum * 0.82, r1, clamp01(0.88 - r1 * 0.12)];
    });
    return bundle(size, 1.2, p, 3.0, aniso);
  },

  /* --- painted steel for fence posts, gates, containers --- */
  paintedSteel(size, aniso) {
    const scr = new Fbm(size / 2, 3, 37);
    const ru = new Fbm(5, 4, 73);
    const p = paint(size, (x, y, u, v) => {
      const s = scr.at(u * size / 2, v * size / 2);
      const r = clamp01(ru.at(u * 5, v * 5) * 1.5 - 0.72);
      const lum = 0.55 + (s - 0.5) * 0.10;
      return [mix(lum, 0.42, r), mix(lum, 0.24, r), mix(lum, 0.15, r), s, clamp01(0.42 + r * 0.45)];
    });
    return bundle(size, 1.0, p, 1.0, aniso);
  },
};

/* ============================ alpha cards ================================= */

/** Foliage card: a dense cluster of small leaves on a transparent background. */
function foliageCard(size, seed = 5, hue = 0) {
  const c = canvas(size); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rnd = mulberry32(seed);
  // two passes: a dark under-layer, then lit leaves on top, so the card reads
  // as a volume rather than a flat sticker
  for (let pass = 0; pass < 2; pass++) {
    const leaves = Math.round(size * (pass === 0 ? 1.1 : 1.5));
    for (let i = 0; i < leaves; i++) {
      // gaussian-ish clustering towards the centre keeps the silhouette organic
      const rr = Math.pow(rnd(), 0.65) * 0.5;
      const ang = rnd() * Math.PI * 2;
      const cx = size * (0.5 + Math.cos(ang) * rr);
      const cy = size * (0.5 + Math.sin(ang) * rr * 0.96);
      const edge = rr * 2;
      if (rnd() < edge * edge * 0.55) continue;
      const len = size * (0.022 + rnd() * 0.028) * (pass === 0 ? 1.25 : 1);
      const wid = len * (0.42 + rnd() * 0.26);
      const rot = rnd() * Math.PI * 2;
      // shading: darker towards the core (self-occlusion), lighter at the rim
      const lit = pass === 0 ? 0.34 + rnd() * 0.16 : (0.52 + rnd() * 0.48) * (0.72 + edge * 0.34);
      const r = Math.round((70 + hue * 48) * lit);
      const g = Math.round((84 + rnd() * 28) * lit);
      const b = Math.round((30 + rnd() * 14) * lit);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath(); ctx.ellipse(0, 0, wid, len, 0, 0, Math.PI * 2); ctx.fill();
      if (pass === 1 && len > size * 0.03) {
        ctx.strokeStyle = `rgba(${r + 18},${g + 24},${b + 10},.6)`;
        ctx.lineWidth = Math.max(0.6, size / 700);
        ctx.beginPath(); ctx.moveTo(0, -len * 0.9); ctx.lineTo(0, len * 0.9); ctx.stroke();
      }
      ctx.restore();
    }
  }
  return c;
}

/** Grass tuft card. */
function grassCard(size) {
  const c = canvas(size, size); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rnd = mulberry32(404);
  for (let i = 0; i < 26; i++) {
    const x = size * (0.08 + rnd() * 0.84);
    const h = size * (0.45 + rnd() * 0.5);
    const bend = (rnd() - 0.5) * size * 0.32;
    const w = size * (0.012 + rnd() * 0.015);
    const l = 0.5 + rnd() * 0.5;
    const grd = ctx.createLinearGradient(x, size, x, size - h);
    grd.addColorStop(0, `rgba(${Math.round(30 * l)},${Math.round(54 * l)},${Math.round(16 * l)},1)`);
    grd.addColorStop(1, `rgba(${Math.round(92 * l)},${Math.round(124 * l)},${Math.round(40 * l)},1)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x - w, size);
    ctx.quadraticCurveTo(x + bend * 0.4, size - h * 0.6, x + bend, size - h);
    ctx.quadraticCurveTo(x + bend * 0.4 + w, size - h * 0.6, x + w, size);
    ctx.fill();
  }
  return c;
}

/** Galvanised welded wire mesh, alpha-cut. One tile = 0.5 m of fence. */
function wireMeshCard(size) {
  const c = canvas(size); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const n = 5, step = size / n, w = Math.max(2, size / 90);
  ctx.strokeStyle = '#b9c0c6'; ctx.lineWidth = w; ctx.lineCap = 'round';
  for (let i = 0; i <= n; i++) {
    const p = i * step;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = w * 0.35;
  for (let i = 0; i <= n; i++) {
    const p = i * step - w * 0.25;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
  }
  return c;
}

/* =========================== licence plates =============================== */

/** Romanian / Moldovan style plate. `country`: 'RO' (blue EU band) or 'MD'. */
export function plateTexture(text, country = 'RO') {
  const W = 512, H = 110;
  const c = canvas(W, H); const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f3f0'; ctx.fillRect(0, 0, W, H);
  // weathering
  const rnd = mulberry32(text.length * 977);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`;
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  const band = 62;
  if (country === 'RO') {
    ctx.fillStyle = '#0b3fa8'; ctx.fillRect(0, 0, band, H);
    ctx.fillStyle = '#ffcc00';
    const cx = band / 2, cy = 34, rr = 15;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr, 2.1, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('RO', cx, H - 16);
  } else {
    // Moldovan plates carry a small tricolour block on the right
    const bw = 46;
    ctx.fillStyle = '#0046ae'; ctx.fillRect(W - bw, 0, bw / 3, H);
    ctx.fillStyle = '#ffd200'; ctx.fillRect(W - bw + bw / 3, 0, bw / 3, H);
    ctx.fillStyle = '#cc092f'; ctx.fillRect(W - bw + 2 * bw / 3, 0, bw / 3, H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('MD', W - bw / 2, H - 14);
  }
  ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const left = country === 'RO' ? band : 8;
  const right = country === 'RO' ? W - 8 : W - 52;
  ctx.font = 'bold 74px "Arial Narrow", Arial, sans-serif';
  ctx.fillText(text, (left + right) / 2, H / 2 + 4);
  ctx.strokeStyle = 'rgba(40,40,40,.65)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

/** Simple sign/placard texture (shop name, warning plates, the "40" on the backhoe). */
export function signTexture(lines, opts = {}) {
  const { bg = '#ffffff', fg = '#101418', w = 512, h = 256, font = 'bold', border = null, round = 0 } = opts;
  const c = canvas(w, h); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  if (round > 0) {
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, w, h, round) : ctx.rect(0, 0, w, h); ctx.fill();
  } else ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = Math.max(4, w / 40); ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const size = Math.min(h / (arr.length + 0.6), w / (Math.max(...arr.map(s => s.length)) * 0.62));
  ctx.font = `${font} ${Math.floor(size)}px Arial, sans-serif`;
  arr.forEach((s, i) => ctx.fillText(s, w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 1.12));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

/* ============================== library =================================== */

export class TextureLibrary {
  constructor({ size = 512, aniso = 8 } = {}) {
    this.size = size; this.aniso = aniso; this.cache = new Map();
  }
  has(n) { return this.cache.has(n); }
  get(n) {
    if (!this.cache.has(n)) this._build(n);
    return this.cache.get(n);
  }
  _build(n) {
    if (G[n]) { this.cache.set(n, G[n](this.size, this.aniso)); return; }
    throw new Error('unknown texture: ' + n);
  }
  /** Pre-generate everything, yielding between items so the loading bar animates. */
  async build(onProgress = () => {}) {
    const names = Object.keys(G);
    const extra = ['foliage', 'foliageDry', 'grassCard', 'wireMesh'];
    const total = names.length + extra.length;
    let i = 0;
    for (const n of names) {
      this._build(n);
      onProgress(++i / total, n);
      await new Promise(r => setTimeout(r, 0));
    }
    const fo = texFrom(foliageCard(this.size >= 512 ? 512 : 256, 5, 0), { srgb: true, aniso: this.aniso });
    fo.wrapS = fo.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set('foliage', { map: fo });
    onProgress(++i / total, 'foliage'); await new Promise(r => setTimeout(r, 0));

    const fd = texFrom(foliageCard(this.size >= 512 ? 512 : 256, 19, 0.5), { srgb: true, aniso: this.aniso });
    fd.wrapS = fd.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set('foliageDry', { map: fd });
    onProgress(++i / total, 'foliageDry'); await new Promise(r => setTimeout(r, 0));

    const gc = texFrom(grassCard(256), { srgb: true, aniso: this.aniso });
    gc.wrapS = gc.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set('grassCard', { map: gc });
    onProgress(++i / total, 'grassCard'); await new Promise(r => setTimeout(r, 0));

    this.cache.set('wireMesh', { map: texFrom(wireMeshCard(256), { srgb: true, aniso: this.aniso }), worldSize: 0.5 });
    onProgress(++i / total, 'wireMesh');
  }
  dispose() {
    for (const v of this.cache.values()) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) v[k]?.dispose?.();
    }
    this.cache.clear();
  }
}
