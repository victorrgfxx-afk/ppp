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
  Z_MIN: -205, Z_MAX: 135,  // playable area along the street
  LOT_DEPTH: 34,            // lots are 34 m deep on each side
};

// Road/terrain base elevation along the street. Flat in the photographed part,
// rising gently at both ends (as seen at the far end of photo 1).
export function baseHeight(z) {
  let h = 0;
  const n = Math.max(0, -38 - z);
  h += 0.072 * (n - 12 * (1 - Math.exp(-n / 12)));
  const s = Math.max(0, z - 34);
  h += 0.045 * (s - 12 * (1 - Math.exp(-s / 12)));
  return h;
}

export const QUALITY = {
  low:    { label: 'Scăzută',  pixelRatio: 1.0,  shadowMap: 1024, shadowBox: 28, ao: false, bloom: false, grass: 0.35, shadowRadius: 1.5, smaa: true },
  medium: { label: 'Medie',    pixelRatio: 1.0,  shadowMap: 2048, shadowBox: 40, ao: false, bloom: true,  grass: 0.6,  shadowRadius: 2.5, smaa: true },
  high:   { label: 'Înaltă',   pixelRatio: 1.25, shadowMap: 4096, shadowBox: 45, ao: true,  bloom: true,  grass: 1.0,  shadowRadius: 2.5, smaa: true },
  ultra:  { label: 'Ultra',    pixelRatio: 2.0,  shadowMap: 4096, shadowBox: 55, ao: true,  bloom: true,  grass: 1.4,  shadowRadius: 3.0, smaa: true },
};

export function defaultQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}
