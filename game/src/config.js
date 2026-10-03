// Global world constants (meters). Street runs along Z (north = -Z), X is across (east = +X).
// Measured from the reference photos (camera height 1.5 m, iPhone main lens) and rounded.

export const W = {
  ROAD_HALF: 2.05,          // asphalt is ~4.1 m wide
  LINE_L: -1.78,            // west dashed edge line (center)
  LINE_R: 1.6,              // east dashed edge line (center)
  LINE_W: 0.12,
  DASH: 1.5, GAP: 1.6,
  PAVER_X1: 2.55,           // east gutter pavers 2.05..2.55
  CURB_X1: 2.7,             // curb 2.55..2.70
  CURB_H: 0.13,
  EAST_FENCE: 3.7,          // face of east fences / stone walls
  WEST_FENCE: -3.3,         // face of west fences
  Z_MIN: -1440, Z_MAX: 1440, // playable area: the whole mapped square (+-1.5 km)
  X_MIN: -1440, X_MAX: 1440,
  LOT_DEPTH: 34,            // lots are 34 m deep on each side
};

// Road/terrain base elevation along the street: the real long profile of Strada Gării
// (EU-DEM, cut & fill like the road), level in the photographed stretch.
let PROFILE = null;
export function setProfile(fn) { PROFILE = fn; }
export function baseHeight(z) {
  if (PROFILE) return PROFILE(z);
  let h = 0;
  const n = Math.max(0, -38 - z);
  h += 0.072 * (n - 12 * (1 - Math.exp(-n / 12)));
  const s = Math.max(0, z - 34);
  h += 0.045 * (s - 12 * (1 - Math.exp(-s / 12)));
  return h;
}

// cascades: the far sun shadow maps after the near one (half size and depth in m; bias in shadow depth units over
// depth + 300 m, i.e. -0.0002 ~ 16 cm; `every`: re-rendered every n frames)
export const QUALITY = {
  low:    { label: 'Scăzută',  pixelRatio: 1.0,  shadowMap: 1024, shadowBox: 28, ao: false, bloom: false, grass: 0.35, shadowRadius: 1.5, smaa: true, cascades: [] },
  medium: { label: 'Medie',    pixelRatio: 1.0,  shadowMap: 2048, shadowBox: 40, ao: false, bloom: true,  grass: 0.6,  shadowRadius: 2.5, smaa: true,
    cascades: [{ half: 200, map: 2048, depth: 500, bias: -0.0002, normalBias: 0.25, radius: 1, every: 4 }] },
  high:   { label: 'Înaltă',   pixelRatio: 1.25, shadowMap: 4096, shadowBox: 45, ao: true,  bloom: true,  grass: 1.0,  shadowRadius: 2.5, smaa: true,
    cascades: [{ half: 260, map: 4096, depth: 500, bias: -0.0002, normalBias: 0.18, radius: 1.5, every: 3 }] },
  ultra:  { label: 'Ultra',    pixelRatio: 2.0,  shadowMap: 4096, shadowBox: 55, ao: true,  bloom: true,  grass: 1.4,  shadowRadius: 3.0, smaa: true,
    cascades: [{ half: 150, map: 4096, depth: 400, bias: -0.00015, normalBias: 0.1, radius: 2, every: 2 },
               { half: 600, map: 4096, depth: 700, bias: -0.0002, normalBias: 0.35, radius: 1, every: 4 }] },
};

export function defaultQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}
