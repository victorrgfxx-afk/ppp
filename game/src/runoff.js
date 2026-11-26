import * as THREE from 'three';
import { RAIN, HASH_GLSL } from './rain.js';

// The water that runs off everything in a downpour, worked out on the GPU over the rain's height-map box around the
// camera (rain.js RainOcclusion: 96 m, 512 texels of ~19 cm). On the solid surfaces seen from above (the ground, the
// roads and kerbs, the roofs, the car roofs; not the leaves) it finds:
// - where water stands: the hollows, filled to their spill level (Planchon & Darboux 2001), at most a few cm deep;
// - where it runs and how much: every cell's rain (by how open it is to the sky and how much of it soaks in) passed on
//   to the lower neighbours in proportion to the slope (multiple flow directions, Quinn 1991 / Freeman 1991), summed
//   cell by cell downhill, a few cells a frame (it settles in a couple of seconds and follows as it changes);
// - how deep and fast it runs: Manning's formula for a sheet or a gutter stream on its slope.
// - how wide: a stream's surface stands level across the gutter, so it spreads over whatever lies lower around it.
// Where it falls off the eaves comes back to the CPU now and then (EaveStreams: the streams pouring off the roofs; and
// the sound of the water running at your feet).
// (V125) The water the surfaces show is worked out on the same grid as water, not as a still picture: a shallow-water
// model that keeps its volume (below: the rain on each cell, what the ground soaks up, how it runs and where it
// gathers - in a long storm the hollows, the kerbs' gutters and the dips fill as deep as they are, 30 cm and more),
// with what it carries (silt and clay: how turbid it is). The surfaces read its depth and flow (RAIN.uFlow, rain.js:
// a film, the streams' ripples and foam); where it stands or runs deeper than ~5 mm, its surface is drawn at its own
// level (floodwater.js), over what it covers.

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// the eight neighbours: texel offset, distance (cells) and the contour length across the flow (Quinn: 1/2 and 0.354)
const NB = /* glsl */`
const vec2 NO[8] = vec2[8](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(-1.0, -1.0));
const float ND[8] = float[8](1.0, 1.0, 1.0, 1.0, 1.41421, 1.41421, 1.41421, 1.41421);
const float NK[8] = float[8](0.5, 0.5, 0.5, 0.5, 0.354, 0.354, 0.354, 0.354);
bool onEdge(vec2 uv) { return any(lessThan(uv, uTexel * 1.5)) || any(greaterThan(uv, 1.0 - uTexel * 1.5)); }
`;

// what stands more than ~35 cm over the ground; then that eroded (MORPH, uMode 0) and grown back (uMode 1) by 2 cells:
// whatever is thinner than ~40 cm (a fence, a pole, a trunk, a railing) is gone, a house or a car stays as it was. The
// water runs on under and through a fence; it runs off a roof or a car roof and round a house.
const RAISED_FRAG = /* glsl */`
uniform sampler2D uSolid, uLow;
varying vec2 vUv;
void main() { gl_FragColor = vec4(step(0.35, texture2D(uSolid, vUv).r - texture2D(uLow, vec2(vUv.x, 1.0 - vUv.y)).r), 0.0, 0.0, 1.0); }`;
const MORPH_FRAG = /* glsl */`
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uMode;
varying vec2 vUv;
void main() {
  float m = uMode < 0.5 ? 1.0 : 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    float v = texture2D(uSrc, vUv + vec2(float(i), float(j)) * uTexel).r;
    m = uMode < 0.5 ? min(m, v) : max(m, v);
  }
  gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
}`;

// (V125) the hollows too small for the map's ~19 cm: a road's ruts, sags and patched pits, a lawn's dips - as much as
// they hold over the area as EPA SWMM's depression storage has it (5.2 manual, table A.5, after ASCE 1992: 1.3-2.5 mm
// on paved surfaces, 2.5-5 mm on lawns), in patches of a metre or two: the road's in the very pattern its puddles were
// drawn with before (rain.js), so the water now stands where they were. uDep: their depth at the deepest, on a road and
// on the ground (m): 5 and 4.8 cm, so that filled to their brims on a 1.5 % fall (a priority-flood fill, Barnes et al.
// 2014) they hold 1.84 and 3.8 mm - on a road then 1/8 of it under 3 mm of water or more, 1/13 under a centimetre
const DEP_GLSL = /* glsl */`
uniform vec2 uDep;
${HASH_GLSL}
float microDep(vec2 p, float road) {
  float n = rainNoise(p * 0.45) * 0.65 + rainNoise(p * 1.7 + 5.3) * 0.35;
  float g = rainNoise(p * 0.8 + 11.0) * 0.6 + rainNoise(p * 3.1 + 2.0) * 0.4;
  return mix(uDep.y * smoothstep(0.5, 0.72, g), uDep.x * smoothstep(0.5, 0.72, n), road);
}`;
// the surface (height over the simulation's own reference: small numbers keep the hair-thin slope across a flat
// exact), how much of the rain there runs off, the deepest it may stand
const STATIC_FRAG = /* glsl */`
uniform sampler2D uSolid, uTop, uLow, uRoad, uThick;
uniform vec2 uTexel;
uniform float uRef, uCapT;
uniform vec4 uBox;
varying vec2 vUv;
${DEP_GLSL}
float surf(vec2 uv) {
  float sol = texture2D(uSolid, uv).r, low = texture2D(uLow, vec2(uv.x, 1.0 - uv.y)).r;
  return sol - low > 0.35 && texture2D(uThick, uv).r < 0.5 ? low : sol;
}
void main() {
  float sol = surf(vUv), top = texture2D(uTop, vUv).r, low = texture2D(uLow, vec2(vUv.x, 1.0 - vUv.y)).r;
  float road = texture2D(uRoad, vUv).r;
  // a crack a single texel wide (a seam between two meshes, a gap the map sees through) is no gully
  float ex = min(surf(vUv + vec2(uTexel.x, 0.0)), surf(vUv - vec2(uTexel.x, 0.0))), ez = min(surf(vUv + vec2(0.0, uTexel.y)), surf(vUv - vec2(0.0, uTexel.y)));
  sol = max(sol, min(max(ex, ez), sol + 0.3));
  // open to the sky, or under a crown (some falls through, more drips off it)
  float open = top - sol < 0.6 ? 1.0 : 0.45;
  // a roof, a car, a wall top: all of it runs off; a road or a pavement nearly all; the ground in a downpour about a
  // quarter (the soil and the grass take in most of it)
  float raised = smoothstep(0.8, 1.6, sol - low);   // (what is left standing: a roof, a car)
  float coef = mix(mix(0.25, 0.92, road), 1.0, raised);
  float cap = mix(uCapT, 0.008, raised);              // (V125: the hollows as full as the storm has filled them so far)
  // (V125: and the small ones too: new ground starts with them as full)
  if (raised < 0.5) sol -= microDep(uBox.xy + vec2(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0) * uBox.z, road);
  gl_FragColor = vec4(sol + uRef, open * coef, cap, raised);
}`;

// the state carried over when the box moves (whole texels): the water level and the flow; new ground starts full to its
// cap and drains
const SHIFT_FRAG = /* glsl */`
uniform sampler2D uA, uB;
uniform vec2 uShift;               // (uv offset of this texel in the old box)
uniform float uFresh, uRebase;     // (uRebase: how much the reference has been raised)
varying vec2 vUv;
void main() {
  vec4 a = texture2D(uA, vUv);
  vec2 o = vUv + uShift;
  if (uFresh < 0.5 && all(greaterThan(o, vec2(0.0))) && all(lessThan(o, vec2(1.0)))) {
    vec4 b = texture2D(uB, o);
    gl_FragColor = vec4(max(b.r - uRebase, a.r), b.g, b.b, b.a);
  } else gl_FragColor = vec4(a.r + a.b, 0.0, 0.0, 0.0);
}`;

// the hollows fill to their spill level: the level comes down to the lowest neighbour's (plus a hair: the water still
// finds its way out across a flat) but never below the surface; the box's edge lets everything out
const FILL_FRAG = /* glsl */`
uniform sampler2D uA, uB;
uniform vec2 uTexel;
varying vec2 vUv;
${NB}
void main() {
  vec4 a = texture2D(uA, vUv), b = texture2D(uB, vUv);
  float m = b.r;
  for (int i = 0; i < 8; i++) m = min(m, texture2D(uB, vUv + NO[i] * uTexel).r + 2e-5 * ND[i]);
  float W = onEdge(vUv) ? a.r : max(a.r, min(m, a.r + a.b));
  gl_FragColor = vec4(W, b.g, b.b, b.a);
}`;

// how the water leaving a cell is shared out: the sum of (contour x slope)^1.1 over its lower neighbours
const SPLIT_FRAG = /* glsl */`
uniform sampler2D uB;
uniform vec2 uTexel;
uniform float uL;
varying vec2 vUv;
${NB}
void main() {
  vec4 b = texture2D(uB, vUv);
  float S = 0.0;
  for (int i = 0; i < 8; i++) { float d = b.r - texture2D(uB, vUv + NO[i] * uTexel).r; if (d > 0.0) S += pow(NK[i] * d / (ND[i] * uL), 1.1); }
  gl_FragColor = vec4(b.r, S, b.b, b.a);
}`;

// the flow (m3/s) through each cell: its own rain plus its share of every higher neighbour's
const FLOW_FRAG = /* glsl */`
uniform sampler2D uA, uB;
uniform vec2 uTexel;
uniform float uL, uRate;
varying vec2 vUv;
${NB}
void main() {
  vec4 a = texture2D(uA, vUv), b = texture2D(uB, vUv);
  float Q = uRate * a.g * uL * uL;
  for (int i = 0; i < 8; i++) {
    vec4 n = texture2D(uB, vUv + NO[i] * uTexel);
    float d = n.r - b.r;
    if (d > 0.0 && n.g > 0.0) Q += n.b * pow(NK[i] * d / (ND[i] * uL), 1.1) / n.g;
  }
  gl_FragColor = vec4(b.r, b.g, Q, 0.0);
}`;

// ------------------------------------------------------------------ (V125) the water that gathers
// A shallow-water model on the same grid (~19 cm cells) that keeps the water's volume to the drop: LISFLOOD-FP's local
// inertial form (Bates, Horritt & Fewtrell 2010) with de Almeida et al.'s (2012) weighting, which keeps it steady on
// smooth surfaces (Ozdemir et al. 2013, HESS 17:4015, eq. 4; Shaw et al. 2021, GMD 14:3577, eq. 19). On every face
// between two cells the flow per metre of width
//   q' = [theta q + (1 - theta)/2 (q_before + q_after) - g h_f dt (eta_2 - eta_1) / dx] / [1 + g dt n^2 |q| / h_f^(7/3)]
//   h_f = max(eta_1, eta_2) - max(z_1, z_2)   (eta: the water's surface, z: the ground's)
// no cell gives away more than it holds (its outflows scaled down together), and each depth follows what goes in and
// out of it. Manning's n for sheet flow (EPA SWMM 5.2 manual, table A.6): asphalt 0.013, short grass 0.15, roofs 0.012.
// The rain on every cell as open to the sky; the ground soaks up what it can along Horton's curve, in the form that
// follows what it has taken in (f = f0 - k F, down to fc): a moist loam lawn f0 = 51 mm/h (3 in/h for dry loam, x2
// under dense grass, /3 moist: SWMM), fc = 3.3 mm/h (loam's saturated conductivity, Rawls et al. 1983), k = 4 /h
// (SWMM: 2-7). Asphalt, roofs and cars take nothing. A storm's rain (40-80 mm/h) gathers in the hollows and along the
// kerbs - the deeper the longer it lasts -, runs down the slopes and over the brims of the full hollows; after it the
// ground drinks what it can and the puddles dry - sped up, in minutes (real ones last hours). The water runs under a
// car (it stands on its wheels: their boxes) and through a fence, round a house, a kerb, a step.
// Checked against a CPU copy of the scheme (hydro/ref.mjs): the volume kept to 3e-10, the sheet on a 2 % and a 10 %
// road and on grass at its Manning depth (kinematic wave) within 1 %, a hollow filled to its lip and spilling over.
const FLOOD_STATIC_FRAG = /* glsl */`
uniform sampler2D uSolid, uTop, uLow, uRoad, uThick;
uniform vec4 uBox;                   // the box: centre x, z, half size; and the heights' offset (uRef)
${DEP_GLSL}
uniform vec4 uCars[16];              // the cars here: x, z, heading, 1 (their boxes: uCarSize, half width and length)
uniform vec2 uCarSize[16];
varying vec2 vUv;
bool underCar(vec2 p) {
  for (int i = 0; i < 16; i++) {
    vec4 c = uCars[i];
    if (c.w < 0.5) continue;
    vec2 d = p - c.xy, cs = vec2(cos(c.z), sin(c.z));
    vec2 q = abs(vec2(dot(d, vec2(cs.x, -cs.y)), dot(d, cs.yx))) - uCarSize[i] - 0.1;
    if (max(q.x, q.y) < 0.0) return true;
  }
  return false;
}
void main() {
  float sol = texture2D(uSolid, vUv).r, low = texture2D(uLow, vec2(vUv.x, 1.0 - vUv.y)).r, top = texture2D(uTop, vUv).r;
  float road = texture2D(uRoad, vUv).r, up = sol - low;
  vec2 wp = uBox.xy + vec2(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0) * uBox.z;
  // what the water meets: the ground under whatever is thinner than ~40 cm (a fence, a pole: it runs through) and under
  // a car; a kerb, a step, a wall, a house it goes round
  bool through = up > 0.35 && (texture2D(uThick, vUv).r < 0.5 || underCar(wp));
  float z = through ? low : sol;
  float roof = through ? 0.0 : smoothstep(0.8, 1.6, up);
  // open to the sky (a car's or a fence's rain comes down beside it), or under a crown: some falls through
  float open = through || top - z < 0.6 ? 1.0 : 0.45;
  float soil = (1.0 - road) * (1.0 - roof);
  float n = mix(mix(0.15, 0.013, road), 0.012, roof);
  if (roof < 0.5) z -= microDep(wp, road);
  gl_FragColor = vec4(z + uBox.w, open, soil, n);
}`;

// the state carried over when the box moves (whole texels); a cell new to the box starts as the hollows have been
// filling (counted up from -60: see FLOOD_UPDATE)
const FLOOD_SHIFT_FRAG = /* glsl */`
uniform sampler2D uD;
uniform vec2 uShift;
uniform float uFresh, uRebase;
varying vec2 vUv;
void main() {
  vec2 o = vUv + uShift;
  if (uFresh < 0.5 && all(greaterThan(o, vec2(0.0))) && all(lessThan(o, vec2(1.0)))) gl_FragColor = texture2D(uD, o);
  else gl_FragColor = vec4(0.0, 0.0, 0.0, -60.0);
}`;

// the flows through each cell's +x and +y faces
const FLOOD_FLUX_FRAG = /* glsl */`
uniform sampler2D uD, uZ;
uniform vec2 uTexel;
uniform float uL, uDt, uTheta;
varying vec2 vUv;
float face(float h1, float z1, float h2, float z2, float q, float qa, float qb, float n) {
  float e1 = z1 + h1, e2 = z2 + h2, hf = max(e1, e2) - max(z1, z2);
  if (hf < 1e-6) return 0.0;
  float qw = uTheta * q + (1.0 - uTheta) * 0.5 * (qa + qb);
  return (qw - 9.81 * hf * uDt * (e2 - e1) / uL) / (1.0 + 9.81 * uDt * n * n * abs(q) / pow(hf, 2.3333));
}
void main() {
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  vec4 s = texture2D(uD, vUv), z = texture2D(uZ, vUv);
  vec4 sx = texture2D(uD, vUv + ex), zx = texture2D(uZ, vUv + ex), sy = texture2D(uD, vUv + ey), zy = texture2D(uZ, vUv + ey);
  float qx = face(s.r, z.r, sx.r, zx.r, s.g, texture2D(uD, vUv - ex).g, sx.g, 0.5 * (z.a + zx.a));
  float qy = face(s.r, z.r, sy.r, zy.r, s.b, texture2D(uD, vUv - ey).b, sy.b, 0.5 * (z.a + zy.a));
  if (vUv.x > 1.0 - uTexel.x) qx = 0.0;                // (nothing across the box's edge: its rim drains)
  if (vUv.y > 1.0 - uTexel.y) qy = 0.0;
  gl_FragColor = vec4(qx, qy, 0.0, 0.0);
}`;

// how much of what would leave a cell it can give: what it holds over what would go out of it (1 if it holds enough)
const FLOOD_LIMIT_FRAG = /* glsl */`
uniform sampler2D uD, uQ;
uniform vec2 uTexel;
uniform float uL, uDt;
varying vec2 vUv;
void main() {
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  vec4 q = texture2D(uQ, vUv);
  float qw = vUv.x < uTexel.x ? 0.0 : texture2D(uQ, vUv - ex).r, qs = vUv.y < uTexel.y ? 0.0 : texture2D(uQ, vUv - ey).g;
  float o = (max(q.r, 0.0) + max(q.g, 0.0) + max(-qw, 0.0) + max(-qs, 0.0)) * uDt / uL, h = texture2D(uD, vUv).r;
  gl_FragColor = vec4(q.rg, o > h ? h / o : 1.0, 0.0);
}`;

// the depths: what flows in and out (each face's flow scaled by the cell it leaves), the rain, what the ground soaks up,
// what dries; the box's rim lets it all out. A cell new to the box: for its first second, the hollows as full as the
// storm has filled them so far (the still model's levels, rain.js-free: uA ground, uB level, at most uCapT deep)
const FLOOD_UPDATE_FRAG = /* glsl */`
uniform sampler2D uD, uZ, uQK, uA, uB;
uniform vec2 uTexel;
uniform float uL, uDt, uRain, uF0, uFc, uKh, uDry, uFeAvg;
varying vec2 vUv;
void main() {
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  vec4 s = texture2D(uD, vUv), z = texture2D(uZ, vUv), c = texture2D(uQK, vUv);
  vec4 cx = texture2D(uQK, vUv + ex), cy = texture2D(uQK, vUv + ey), cw = texture2D(uQK, vUv - ex), cs = texture2D(uQK, vUv - ey);
  float qx = c.r * (c.r > 0.0 ? c.b : cx.b), qy = c.g * (c.g > 0.0 ? c.b : cy.b);
  float qw = vUv.x < uTexel.x ? 0.0 : cw.r * (cw.r > 0.0 ? cw.b : c.b), qs = vUv.y < uTexel.y ? 0.0 : cs.g * (cs.g > 0.0 ? cs.b : c.b);
  float h = s.r + uDt / uL * (qw - qx + qs - qy) + uRain * z.g * uDt, F = s.a;
  if (F < 0.0) {
    vec4 a = texture2D(uA, vUv), b = texture2D(uB, vUv);
    h = clamp(b.r - a.r - 0.003, 0.0, a.b); qx = 0.0; qy = 0.0;
    F = F + 1.0 >= 0.0 ? uFeAvg : F + 1.0;
  } else if (z.b > 0.0) {
    float f = max(uFc, uF0 - uKh * F), inf = min(h, f * uDt) * z.b;
    h -= inf; F += max(0.0, inf - uFc * uDt * z.b);
  }
  h = max(0.0, h - uDry * uDt);
  if (any(lessThan(vUv, uTexel * 2.0)) || any(greaterThan(vUv, 1.0 - uTexel * 2.0))) h *= 0.8;
  gl_FragColor = vec4(h, qx, qy, F);
}`;

// what the surfaces read (RAIN.uFlow): R the depth (m), GB the velocity (m/s, world x / z), A the ground under it
// (relative to the occlusion maps' height, as rain.js has it)
const FLOOD_OUT_FRAG = /* glsl */`
uniform sampler2D uD, uZ;
uniform vec2 uTexel;
uniform float uRef;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uD, vUv), z = texture2D(uZ, vUv);
  float qw = texture2D(uD, vUv - vec2(uTexel.x, 0.0)).g, qs = texture2D(uD, vUv - vec2(0.0, uTexel.y)).b;
  vec2 v = 0.5 * vec2(s.g + qw, s.b + qs) / max(s.r, 0.002);
  float sp = length(v);
  if (sp > 3.0) v *= 3.0 / sp;
  gl_FragColor = vec4(s.r, v.x, -v.y, z.r - uRef);
}`;

// (V125) what the water carries (floodwater.js: how turbid it is): fine silt and clay, g/m3 - carried along with the
// water through every face exactly as FLOOD_UPDATE moves it (from the cell it leaves), taken up from the surface it
// stands or runs on by the drops' impacts and by the flow, settling out at their Stokes speeds, w = g (rho_s - rho) d^2 /
// (18 mu): 2.3e-4 m/s for 16 um silt (a 5 cm puddle clears of it in a few minutes), 3.6e-6 m/s for 2 um clay (it stays
// cloudy for hours). The surfaces' wash-off: a road's or a yard's ~100 g/m3 (the median urban runoff of the EPA's
// NURP, 1983: 100 mg/l of suspended solids), a roof's a fifth of that, the soil's (lawns, gardens, a field) ~0.7 kg/m3
// - the silt's share at its balance with settling, the clay's building up while it rains (estimates in those ranges).
// Where the water soaks in or dries, what it carried stays behind (the puddle that is left is the muddier).
const FLOOD_SED_FRAG = /* glsl */`
uniform sampler2D uDo, uDn, uQK, uC, uZ;
uniform vec2 uTexel, uWs, uEr;       // (the settling speeds, m/s; how fast each is taken up: what settles at the balance, m/s)
uniform float uL, uDt, uRain;
varying vec2 vUv;
// silt and clay (g/m3) the surface gives the water: a roof (n 0.012), a road or a yard, the soil
vec2 cref(vec4 z) { return mix(z.a < 0.0125 ? vec2(14.0, 6.0) : vec2(70.0, 30.0), vec2(500.0, 200.0), z.b); }
void main() {
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  vec4 so = texture2D(uDo, vUv), sn = texture2D(uDn, vUv), z = texture2D(uZ, vUv);
  if (so.a < 0.0) { gl_FragColor = vec4(cref(z), 0.0, 0.0); return; }   // (a cell new to the box: as the storm has made it)
  vec2 C0 = texture2D(uC, vUv).rg;
  if (any(lessThan(vUv, uTexel * 2.0)) || any(greaterThan(vUv, 1.0 - uTexel * 2.0))) { gl_FragColor = vec4(C0, 0.0, 0.0); return; }
  vec4 c = texture2D(uQK, vUv), cx = texture2D(uQK, vUv + ex), cy = texture2D(uQK, vUv + ey), cw = texture2D(uQK, vUv - ex), cs = texture2D(uQK, vUv - ey);
  float qx = c.r * (c.r > 0.0 ? c.b : cx.b), qy = c.g * (c.g > 0.0 ? c.b : cy.b);
  float qw = vUv.x < uTexel.x ? 0.0 : cw.r * (cw.r > 0.0 ? cw.b : c.b), qs = vUv.y < uTexel.y ? 0.0 : cs.g * (cs.g > 0.0 ? cs.b : c.b);
  vec2 Cx = texture2D(uC, vUv + ex).rg, Cy = texture2D(uC, vUv + ey).rg, Cw = texture2D(uC, vUv - ex).rg, Cs = texture2D(uC, vUv - ey).rg;
  vec2 m = C0 * so.r + uDt / uL * ((qw > 0.0 ? Cw : C0) * qw - (qx > 0.0 ? C0 : Cx) * qx + (qs > 0.0 ? Cs : C0) * qs - (qy > 0.0 ? C0 : Cy) * qy);
  if (so.r > 1e-5) {
    // taken up (a downpour's impacts, ~40 mm/h a full share; or the flow, ~0.3 m/s), and settling out
    float sp = length(vec2(qx + qw, qy + qs)) * 0.5 / max(so.r, 0.002);
    float act = min(2.0, max(uRain * z.g / 1.1e-5, sp / 0.3));
    m += (act * cref(z) * uEr - C0 * uWs) * uDt;
  }
  m = max(m, vec2(0.0));
  gl_FragColor = vec4(sn.r > 1e-5 ? min(m / sn.r, vec2(2e4)) : vec2(0.0), 0.0, 0.0);
}`;

// (V125) for the surface drawn on the water (floodwater.js): at every second cell (its vertices), the water's level -
// its own where it stands at least 3 mm deep; else a neighbour's (within two cells) where the ground here is no lower
// than that (a bank: the surface runs on in under it, and the bank hides it); else this cell's own film, the surface
// fading out towards it (lower ground: the end of a stream, the far side of a wall); out of sight where no water is near.
// R the level (over the occlusion maps' height), G 1 where drawn, B the surface's share there, A the depth here
const FLOOD_LEVEL_FRAG = /* glsl */`
uniform sampler2D uD, uZ;
uniform float uRef, uN;
uniform vec4 uBox;
varying vec2 vUv;
${DEP_GLSL}
// the ground as it is drawn (without the small hollows), and whether the water there is on a roof (not drawn: its
// own surfaces show it)
float drawnZ(ivec2 p, vec4 z) {
  vec2 wp = uBox.xy + vec2((float(p.x) + 0.5) / uN * 2.0 - 1.0, 1.0 - (float(p.y) + 0.5) / uN * 2.0) * uBox.z;
  return z.a < 0.0125 ? z.r : z.r + microDep(wp, clamp((0.15 - z.a) / 0.137, 0.0, 1.0));
}
void main() {
  ivec2 c = ivec2(floor(vUv * uN * 0.5)) * 2, M = ivec2(int(uN) - 1);
  float h0 = texelFetch(uD, c, 0).r;
  vec4 Z0 = texelFetch(uZ, c, 0);
  float z0 = Z0.r, zd = drawnZ(c, Z0);
  if (h0 >= 0.003 && Z0.a >= 0.0125) { gl_FragColor = vec4(max(z0 + h0, zd + 0.003) - uRef, 1.0, 1.0, h0); return; }
  float e = -1e9;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 p = clamp(c + ivec2(i, j), ivec2(0), M);
    float h = texelFetch(uD, p, 0).r;
    vec4 Zp = texelFetch(uZ, p, 0);
    if (h >= 0.003 && Zp.a >= 0.0125) e = max(e, max(Zp.r + h, drawnZ(p, Zp) + 0.003));
  }
  if (e < -1e8) gl_FragColor = vec4(z0 - 1.0 - uRef, 0.0, 0.0, h0);
  else if (zd >= e - 0.006) gl_FragColor = vec4(e - uRef, 1.0, 1.0, h0);
  else gl_FragColor = vec4(max(z0 + h0, zd + 0.003) - uRef, 1.0, 0.0, h0);
}`;

const fq =(frag, u) => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false }));

export class Runoff {
  constructor(occ) {
    this.occ = occ;
    const n = occ.size, L = 2 * occ.half / n;
    this.size = n; this.L = L;
    const rt = (type, filter) => new THREE.WebGLRenderTarget(n, n, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, generateMipmaps: false, depthBuffer: false });
    this.A = rt(THREE.FloatType, THREE.NearestFilter);
    this.B = [rt(THREE.FloatType, THREE.NearestFilter), rt(THREE.FloatType, THREE.NearestFilter)];
    this.out = rt(THREE.HalfFloatType, THREE.LinearFilter);
    // (V125) the water that gathers: the ground it meets (Z), its state (D: depth, the flows through the +x / +y faces,
    // what the ground has soaked up), the faces' new flows (QA) and the same with each cell's share it may give (QK)
    this.Z = rt(THREE.FloatType, THREE.NearestFilter);
    this.D = [rt(THREE.FloatType, THREE.NearestFilter), rt(THREE.FloatType, THREE.NearestFilter)]; this.dc = 0;
    this.QA = rt(THREE.FloatType, THREE.NearestFilter); this.QK = rt(THREE.FloatType, THREE.NearestFilter);
    // (what it carries: silt, clay; and the level its surface is drawn at, every second cell: floodwater.js)
    this.C = [rt(THREE.FloatType, THREE.NearestFilter), rt(THREE.FloatType, THREE.NearestFilter)]; this.cc = 0;
    this.level = new THREE.WebGLRenderTarget(n / 2, n / 2, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
    this.cars ={ pos: Array.from({ length: 16 }, () => new THREE.Vector4()), size: Array.from({ length: 16 }, () => new THREE.Vector2()) };
    this.M = [rt(THREE.HalfFloatType, THREE.NearestFilter), rt(THREE.HalfFloatType, THREE.NearestFilter)];   // (the raised mask)
    this.ref = null;                 // (the heights' reference)
    const texel = new THREE.Vector2(1 / n, 1 / n);
    this.dep = { value: new THREE.Vector2(0.05, 0.048) };   // (the small hollows' depth on a road, on the ground: DEP_GLSL)
    this.u = {
      st: { uSolid: { value: null }, uTop: { value: null }, uLow: { value: null }, uRoad: { value: null }, uThick: { value: null }, uTexel: { value: texel }, uRef: { value: 0 }, uCapT: { value: 0.02 }, uBox: { value: new THREE.Vector4() }, uDep: this.dep },
      rz: { uSolid: { value: null }, uLow: { value: null } },
      mo: { uSrc: { value: null }, uTexel: { value: texel }, uMode: { value: 0 } },
      sh: { uA: { value: null }, uB: { value: null }, uShift: { value: new THREE.Vector2() }, uFresh: { value: 1 }, uRebase: { value: 0 } },
      fill: { uA: { value: null }, uB: { value: null }, uTexel: { value: texel } },
      split: { uB: { value: null }, uTexel: { value: texel }, uL: { value: L } },
      flow: { uA: { value: null }, uB: { value: null }, uTexel: { value: texel }, uL: { value: L }, uRate: { value: 0 } },
      fst: { uSolid: { value: null }, uTop: { value: null }, uLow: { value: null }, uRoad: { value: null }, uThick: { value: null }, uBox: { value: new THREE.Vector4() }, uCars: { value: this.cars.pos }, uCarSize: { value: this.cars.size }, uDep: this.dep },
      fsh: { uD: { value: null }, uShift: { value: new THREE.Vector2() }, uFresh: { value: 1 }, uRebase: { value: 0 } },
      ffx: { uD: { value: null }, uZ: { value: this.Z.texture }, uTexel: { value: texel }, uL: { value: L }, uDt: { value: 0.03 }, uTheta: { value: 0.8 } },
      flim: { uD: { value: null }, uQ: { value: this.QA.texture }, uTexel: { value: texel }, uL: { value: L }, uDt: { value: 0.03 } },
      fup: { uD: { value: null }, uZ: { value: this.Z.texture }, uQK: { value: this.QK.texture }, uA: { value: this.A.texture }, uB: { value: null }, uTexel: { value: texel }, uL: { value: L }, uDt: { value: 0.03 },
        uRain: { value: 0 }, uF0: { value: 51 / 3.6e6 }, uFc: { value: 3.3 / 3.6e6 }, uKh: { value: 4 / 3600 }, uDry: { value: 0 }, uFeAvg: { value: 0 } },
      fout: { uD: { value: null }, uZ: { value: this.Z.texture }, uTexel: { value: texel }, uRef: { value: 0 } },
      csh: { uD: { value: null }, uShift: { value: new THREE.Vector2() }, uFresh: { value: 1 }, uRebase: { value: 0 } },
      sed: { uDo: { value: null }, uDn: { value: null }, uQK: { value: this.QK.texture }, uC: { value: null }, uZ: { value: this.Z.texture }, uTexel: { value: texel }, uL: { value: L }, uDt: { value: 0.03 }, uRain: { value: 0 },
        uWs: { value: new THREE.Vector2(2.3e-4, 3.6e-6) }, uEr: { value: new THREE.Vector2(2.3e-4, 2.1e-5) } },
      lev: { uD: { value: null }, uZ: { value: this.Z.texture }, uRef: { value: 0 }, uN: { value: n }, uBox: { value: new THREE.Vector4() }, uDep: this.dep },
    };
    this.q = { st: fq(STATIC_FRAG, this.u.st), rz: fq(RAISED_FRAG, this.u.rz), mo: fq(MORPH_FRAG, this.u.mo), sh: fq(SHIFT_FRAG, this.u.sh), fill: fq(FILL_FRAG, this.u.fill), split: fq(SPLIT_FRAG, this.u.split), flow: fq(FLOW_FRAG, this.u.flow),
      fst: fq(FLOOD_STATIC_FRAG, this.u.fst), fsh: fq(FLOOD_SHIFT_FRAG, this.u.fsh), ffx: fq(FLOOD_FLUX_FRAG, this.u.ffx), flim: fq(FLOOD_LIMIT_FRAG, this.u.flim), fup: fq(FLOOD_UPDATE_FRAG, this.u.fup), fout: fq(FLOOD_OUT_FRAG, this.u.fout),
      csh: fq(FLOOD_SHIFT_FRAG, this.u.csh), sed: fq(FLOOD_SED_FRAG, this.u.sed), lev: fq(FLOOD_LEVEL_FRAG, this.u.lev) };
    for (const m of Object.values(this.q)) m.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.box = null;                 // (the box the state is on: centre x, z)
    this.on = false;
    this.cur = 0;
    RAIN.uFlow.value = this.out.texture;
  }

  _pass(renderer, mesh, target) {
    this.scene.add(mesh);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
    this.scene.remove(mesh);
  }

  _swap() { this.cur ^= 1; return this.B[this.cur]; }

  // the occlusion maps have just been made again (rain.js RainOcclusion.update returned true)
  refresh(renderer) {
    const occ = this.occ, S = occ.snow, box = RAIN.uOccBox.value;
    if (!S) return;
    const rt0 = renderer.getRenderTarget();
    const fresh = !this.box || !this.on;
    // (a new reference when the ground here is 20 m off it: the carried levels are moved with it)
    let rebase = 0;
    if (fresh || this.ref === null) this.ref = box.w;
    else if (Math.abs(box.w - this.ref) > 20) { rebase = box.w - this.ref; this.ref = box.w; }
    const rz = this.u.rz, mo = this.u.mo;
    rz.uSolid.value = S.solid.texture; rz.uLow.value = S.low.texture;
    this._pass(renderer, this.q.rz, this.M[0]);
    mo.uSrc.value = this.M[0].texture; mo.uMode.value = 0; this._pass(renderer, this.q.mo, this.M[1]);
    mo.uSrc.value = this.M[1].texture; mo.uMode.value = 1; this._pass(renderer, this.q.mo, this.M[0]);
    const st = this.u.st;
    st.uSolid.value = S.solid.texture; st.uTop.value = occ.rt.texture; st.uLow.value = S.low.texture; st.uRoad.value = S.roadTex; st.uThick.value = this.M[0].texture;
    st.uRef.value = box.w - this.ref; st.uBox.value.set(box.x, box.y, occ.half, 0);
    this._pass(renderer, this.q.st, this.A);
    const sh = this.u.sh;
    sh.uA.value = this.A.texture; sh.uB.value = this.B[this.cur].texture;
    sh.uFresh.value = fresh ? 1 : 0; sh.uRebase.value = rebase;
    if (!fresh) sh.uShift.value.set((box.x - this.box.x) / (2 * occ.half), -(box.y - this.box.y) / (2 * occ.half));
    this._pass(renderer, this.q.sh, this._swap());
    // (V125) the water that gathers: the ground it meets, the cars it runs under; its state carried over
    const fs = this.u.fst;
    fs.uSolid.value = S.solid.texture; fs.uTop.value = occ.rt.texture; fs.uLow.value = S.low.texture; fs.uRoad.value = S.roadTex; fs.uThick.value = this.M[0].texture;
    fs.uBox.value.set(box.x, box.y, occ.half, box.w - this.ref);
    this._pass(renderer, this.q.fst, this.Z);
    const fh = this.u.fsh;
    fh.uD.value = this.D[this.dc].texture; fh.uFresh.value = fresh ? 1 : 0; fh.uShift.value.copy(sh.uShift.value);
    this.dc ^= 1; this._pass(renderer, this.q.fsh, this.D[this.dc]);
    const cs = this.u.csh;          // (what it carries, alike: a new cell takes up its surface's in its first second)
    cs.uD.value = this.C[this.cc].texture; cs.uFresh.value = fh.uFresh.value; cs.uShift.value.copy(sh.uShift.value);
    this.cc ^= 1; this._pass(renderer, this.q.csh, this.C[this.cc]);
    this.box = { x: box.x, y: box.y };
    this.on = true;
    renderer.setRenderTarget(rt0);
    RAIN.uFlowBox.value.set(box.x, box.y, occ.half, 1);
  }

  // the cars near you (main.js): the water runs under them (they stand on their wheels), not round them
  setCars(list) {
    const P = this.cars.pos, Z = this.cars.size;
    for (let i = 0; i < 16; i++) { const v = list[i]; if (v) { P[i].set(v.x, v.z, v.h, 1); Z[i].set(v.car.half.w, v.car.half.l); } else P[i].w = 0; }
  }

  // o: { rate: the still model's rain (m/s of water, its catchment's), rain: the rain on each cell now (m/s), dt: the
  // time to step (s), capT: how deep the hollows have filled so far (m: new cells start so), dry: how fast the puddles
  // dry now (m/s), feAvg: what the open ground has soaked up so far (m) }; iterations of the still model's fill and flow
  step(renderer, o, nFill = 2, nFlow = 3) {
    if (!this.on) return;
    const rt0 = renderer.getRenderTarget();
    const u = this.u, A = this.A.texture;
    // the still model (its levels: where new cells start; its flows: the streams off the eaves, the brook's sound)
    u.st.uCapT.value = o.capT;
    for (let i = 0; i < nFill; i++) { u.fill.uA.value = A; u.fill.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.fill, this._swap()); }
    u.split.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.split, this._swap());
    u.flow.uRate.value = o.rate;
    for (let i = 0; i < nFlow; i++) { u.flow.uA.value = A; u.flow.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.flow, this._swap()); }
    // (V125) the water that gathers: steps of at most 0.04 s (alpha dx / sqrt(g h) with alpha 0.7 allows them up to
    // ~1 m deep), three passes each
    const n = Math.min(4, Math.ceil(o.dt / 0.04 - 1e-6));
    const dt = n > 0 ? o.dt / n : 0;
    const fu = u.fup;
    fu.uB.value = this.B[this.cur].texture; fu.uRain.value = o.rain; fu.uDry.value = o.dry; fu.uFeAvg.value = o.feAvg;
    u.ffx.uDt.value = u.flim.uDt.value = fu.uDt.value = u.sed.uDt.value = dt;
    u.sed.uRain.value = o.rain;
    for (let k = 0; k < n; k++) {
      const D = this.D[this.dc].texture;
      u.ffx.uD.value = D; this._pass(renderer, this.q.ffx, this.QA);
      u.flim.uD.value = D; this._pass(renderer, this.q.flim, this.QK);
      fu.uD.value = D; this.dc ^= 1; this._pass(renderer, this.q.fup, this.D[this.dc]);
      const s = u.sed;                // (what it carries goes the same way)
      s.uDo.value = D; s.uDn.value = this.D[this.dc].texture; s.uC.value = this.C[this.cc].texture;
      this.cc ^= 1; this._pass(renderer, this.q.sed, this.C[this.cc]);
    }
    u.fout.uD.value = this.D[this.dc].texture; u.fout.uRef.value = RAIN.uOccBox.value.w - this.ref;
    this._pass(renderer, this.q.fout, this.out);
    u.lev.uD.value = this.D[this.dc].texture; u.lev.uRef.value = u.fout.uRef.value; u.lev.uBox.value.copy(u.fst.uBox.value);
    this._pass(renderer, this.q.lev, this.level);
    renderer.setRenderTarget(rt0);
  }

  off() { this.on = false; RAIN.uFlowBox.value.w = 0; }
}

// ------------------------------------------------------------------ the water pouring off the eaves
// Where the water runs off an edge and falls a metre or more (the eaves, a car roof, a wall top): per block of 4x4
// cells the flow that goes over (m3/s), how far it falls, where along the block (packed) and from what height.
const EDGE_FRAG = /* glsl */`
uniform sampler2D uB;
uniform vec2 uTexel;
uniform float uL;
varying vec2 vUv;
${NB}
void main() {
  vec2 base = floor(vUv / (4.0 * uTexel)) * 4.0;
  float F = 0.0, H = 0.0, Y = 0.0; vec2 P = vec2(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec2 c = vec2(float(i), float(j)), uv = (base + c + 0.5) * uTexel;
    vec4 b = texture2D(uB, uv);
    if (b.b <= 0.0 || b.g <= 0.0) continue;
    for (int k = 0; k < 8; k++) {
      float d = b.r - texture2D(uB, uv + NO[k] * uTexel).r;
      if (d > 0.8) { float q = b.b * pow(NK[k] * d / (ND[k] * uL), 1.1) / b.g; F += q; H += q * d; Y += q * b.r; P += q * (c + 0.5 + NO[k] * 0.45); }
    }
  }
  if (F <= 0.0) { gl_FragColor = vec4(0.0); return; }
  P = clamp(P / F, 0.0, 3.98);
  gl_FragColor = vec4(F, H / F, floor(P.x * 64.0) * 256.0 + floor(P.y * 64.0), Y / F);
}`;

// a falling stream: a thread of water from the edge that breaks up into drops as it falls and is blown downwind (it is
// drawn added on, like the rain: a thread of water shows the bright sky); and where it lands, a splash
const STREAM_VERT = /* glsl */`
attribute vec2 corner;                 // x: -1..1 across, y: 0 (the edge) .. 1 (the ground)
attribute vec4 aTop;                   // the edge: x, y, z; w: how far it falls
attribute vec2 aFlow;                  // x: the flow (m3/s), y: a seed
uniform vec3 uCam;
uniform vec2 uWind;
uniform float uTime;
varying vec2 vC;
varying float vA, vS, vLen;
void main() {
  vC = corner; vS = aFlow.y; vLen = aTop.w;
  float d = corner.y * aTop.w;
  // the wind carries it off as it falls (the stream takes on the wind's speed over ~a third of a second)
  float tf = sqrt(2.0 * d / 9.81);
  vec2 off = uWind * tf * tf * 0.15;
  vec3 p = vec3(aTop.x + off.x, aTop.y - d, aTop.z + off.y);
  vec3 toCam = uCam - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float w = clamp(sqrt(aFlow.x) * 2.2, 0.006, 0.03) * (1.0 + 0.6 * corner.y) + dist * 0.0009;   // (at least ~1 px)
  gl_Position = projectionMatrix * viewMatrix * vec4(p + side * corner.x * w, 1.0);
  vA = (1.0 - smoothstep(28.0, 42.0, dist)) * smoothstep(0.4, 1.2, dist) * clamp(aFlow.x * 2.0e4, 0.25, 1.0);
}`;
const STREAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uTime;
varying vec2 vC;
varying float vA, vS, vLen;
float h1(float x) { return fract(sin(x * 91.7 + vS * 311.0) * 43758.5); }
void main() {
  // a continuous thread at the top that necks and breaks into drops ~a metre down; the drops race down at ~4-8 m/s
  float y = vC.y * vLen, sp = 4.0 + 3.0 * vC.y;
  float s = y * 5.0 - uTime * sp * 5.0 / max(vLen, 0.5) * vLen;
  float drop = smoothstep(0.55, 0.0, abs(fract(s) - 0.5) * 2.0 - 0.15 * h1(floor(s)));
  float k = mix(1.0, drop, smoothstep(0.15, 0.9, y));
  float a = vA * k * (1.0 - abs(vC.x)) * (0.55 + 0.45 * h1(floor(s * 0.5) + 3.0));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + 0.5 * k), min(a, 1.0));
}`;
const LAND_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aTop;
attribute vec2 aFlow;
uniform vec3 uCam;
uniform vec2 uWind;
uniform float uTime;
varying vec2 vC;
varying float vA, vPh;
void main() {
  vC = corner;
  float d = aTop.w, tf = sqrt(2.0 * d / 9.81);
  vec2 off = uWind * tf * tf * 0.15;
  vec3 c = vec3(aTop.x + off.x, aTop.y - d + 0.02, aTop.z + off.y);
  vec3 toCam = uCam - c;
  float dist = length(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vPh = fract(uTime * 3.0 + aFlow.y * 7.0);
  float s = (0.08 + 0.12 * vPh) * clamp(sqrt(aFlow.x) * 40.0, 0.6, 2.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(c + right * corner.x * s + vec3(0.0, 1.0, 0.0) * (corner.y * 0.5 + 0.5) * s * 0.9, 1.0);
  vA = (1.0 - smoothstep(25.0, 38.0, dist)) * clamp(aFlow.x * 2.0e4, 0.3, 1.0);
}`;
const LAND_FRAG = /* glsl */`
uniform vec3 uColor;
varying vec2 vC;
varying float vA, vPh;
void main() {
  vec2 q = vec2(vC.x, vC.y * 0.5 + 0.5);
  float rim = (1.0 - smoothstep(0.0, 0.3, abs(length(vec2(q.x, q.y * 1.4)) - 0.45 - 0.35 * vPh))) * (1.0 - smoothstep(0.25, 0.95, q.y));
  float a = vA * (1.0 - vPh) * rim * 0.6;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 1.0));
}`;

const _ev = new THREE.Vector3();
export class EaveStreams {
  constructor(scene, runoff, n = 360) {
    this.runoff = runoff; this.n = n;
    const B = runoff.size / 4;
    this.rt = new THREE.WebGLRenderTarget(B, B, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
    this.buf = new Float32Array(B * B * 4);
    this.edge = fq(EDGE_FRAG, { uB: { value: null }, uTexel: { value: new THREE.Vector2(1 / runoff.size, 1 / runoff.size) }, uL: { value: runoff.L } });
    this.edge.frustumCulled = false;
    this.wait = 0; this.pending = false; this.list = [];
    this.near = new Float32Array(8 * 8 * 4); this.brook = 0; this.pour = 0;     // (for the sound: audio.js)
    this.aTop = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aTop.setUsage(THREE.DynamicDrawUsage);
    this.aFlow = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); this.aFlow.setUsage(THREE.DynamicDrawUsage);
    this.u = { uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uTime: { value: 0 }, uColor: { value: new THREE.Color() } };
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'rain'; this.group.visible = false;
    // the stream: a ribbon of 10 rows down its fall
    const sc = [], si = [];
    for (let r = 0; r <= 10; r++) sc.push(-1, r / 10, 1, r / 10);
    for (let r = 0; r < 10; r++) { const a = r * 2; si.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const mk = (corners, idx, vs, fs, blending) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(corners.length / 2 * 3), 3));
      g.setIndex(idx);
      g.setAttribute('aTop', this.aTop); g.setAttribute('aFlow', this.aFlow);
      g.instanceCount = 0;
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: this.u, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending }));
      m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 5;
      this.group.add(m);
      return g;
    };
    this.gStream = mk(sc, si, STREAM_VERT, STREAM_FRAG, THREE.AdditiveBlending);
    this.gLand = mk([-1, -1, 1, -1, 1, 1, -1, 1], [0, 1, 2, 0, 2, 3], LAND_VERT, LAND_FRAG, THREE.NormalBlending);
    scene.add(this.group);
  }

  // every ~0.6 s the edges are found again and read back (asynchronously: no stall); the nearest streams are drawn
  update(renderer, camera, dt, t, wind, light) {
    const ro = this.runoff;
    this.group.visible = ro.on && this.list.length > 0;
    this.u.uCam.value.copy(camera.position); this.u.uWind.value.copy(wind); this.u.uTime.value = t;
    this.u.uColor.value.setScalar(0.24 * light);
    if (!ro.on) { this.list.length = 0; this.brook = this.pour = 0; return; }
    if ((this.wait -= dt) > 0 || this.pending || !renderer.readRenderTargetPixelsAsync) return;
    this.wait = 0.6;
    this.edge.material.uniforms.uB.value = ro.B[ro.cur].texture;
    const rt0 = renderer.getRenderTarget();
    ro._pass(renderer, this.edge, this.rt);
    renderer.setRenderTarget(rt0);
    const box = { x: ro.box.x, y: ro.box.y }, half = ro.occ.half, n = this.rt.width, cell = ro.L;
    this.pending = true;
    // the water running at your feet (the 8x8 cells around: ~1.5 m): its flow, for the sound
    const ci = Math.round((camera.position.x - box.x + half) / cell) - 4, cj = Math.round((box.y + half - camera.position.z) / cell) - 4;
    if (ci >= 0 && cj >= 0 && ci + 8 <= ro.size && cj + 8 <= ro.size) {
      renderer.readRenderTargetPixelsAsync(ro.B[ro.cur], ci, cj, 8, 8, this.near).then(() => {
        let q = 0;
        for (let i = 2; i < this.near.length; i += 4) q = Math.max(q, this.near[i]);
        this.brook = Math.max(0, Math.min(1, Math.log10(Math.max(q, 1e-9) / 2e-5) / 2.5));
      }).catch(() => {});
    } else this.brook = 0;
    renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, n, n, this.buf).then(() => {
      this.pending = false;
      const b = this.buf, out = [], cx = camera.position.x, cz = camera.position.z;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const k = (y * n + x) * 4, F = b[k];
        if (!(F > 8e-6) || b[k + 1] < 1.9) continue;     // (off the eaves: not off a car roof, its body bulges out below it)
        const pk = b[k + 2], px = Math.floor(pk / 256) / 64, py = (pk % 256) / 64;
        const wx = box.x - half + (x * 4 + px) * cell, wz = box.y + half - (y * 4 + py) * cell;
        const d2 = (wx - cx) ** 2 + (wz - cz) ** 2;
        if (d2 < 42 * 42) out.push([d2, wx, b[k + 3] + ro.ref, wz, b[k + 1], F]);
      }
      out.sort((p, q) => p[0] - q[0]);
      this.list = out.slice(0, this.n);
      this.pour = Math.min(1, this.list.reduce((a, e) => a + e[5] * 2e3 / (1 + e[0]), 0));
      const T = this.aTop.array, Fl = this.aFlow.array;
      this.list.forEach((e, i) => { T[i * 4] = e[1]; T[i * 4 + 1] = e[2]; T[i * 4 + 2] = e[3]; T[i * 4 + 3] = e[4]; Fl[i * 2] = e[5]; Fl[i * 2 + 1] = (Math.abs(e[1] * 7.31 + e[3] * 3.17) % 1); });
      this.aTop.needsUpdate = true; this.aFlow.needsUpdate = true;
      this.gStream.instanceCount = this.gLand.instanceCount = this.list.length;
    }).catch(() => { this.pending = false; });
  }
}
