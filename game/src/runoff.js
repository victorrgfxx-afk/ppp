import * as THREE from 'three';
import { RAIN } from './rain.js';

// The water that runs off everything in a downpour, worked out on the GPU over the rain's height-map box around the
// camera (rain.js RainOcclusion: 96 m, 512 texels of ~19 cm). On the solid surfaces seen from above (the ground, the
// roads and kerbs, the roofs, the car roofs; not the leaves) it finds:
// - where water stands: the hollows, filled to their spill level (Planchon & Darboux 2001), at most a few cm deep;
// - where it runs and how much: every cell's rain (by how open it is to the sky and how much of it soaks in) passed on
//   to the lower neighbours in proportion to the slope (multiple flow directions, Quinn 1991 / Freeman 1991), summed
//   cell by cell downhill, a few cells a frame (it settles in a couple of seconds and follows as it changes);
// - how deep and fast it runs: Manning's formula for a sheet or a gutter stream on its slope.
// - how wide: a stream's surface stands level across the gutter, so it spreads over whatever lies lower around it.
// The surfaces read the result (RAIN.uFlow, rain.js): standing and running water with its ripples and foam carried
// along, turbid off the road and muddy off the bare ground. Where it falls off the eaves comes back to the CPU now and
// then (EaveStreams: the streams pouring off the roofs; and the sound of the water running at your feet).

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

// the surface (height over the simulation's own reference: small numbers keep the hair-thin slope across a flat
// exact), how much of the rain there runs off, the deepest it may stand
const STATIC_FRAG = /* glsl */`
uniform sampler2D uSolid, uTop, uLow, uRoad, uThick;
uniform vec2 uTexel;
uniform float uRef;
varying vec2 vUv;
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
  float cap = mix(mix(0.02, 0.025, road), 0.008, raised);
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

// what the surfaces read: R the depth (m), GB the velocity (m/s, world x / z), A the surface it runs on (relative height
// as the occlusion maps: only what lies there gets it)
const OUT_FRAG = /* glsl */`
uniform sampler2D uA, uB;
uniform vec2 uTexel;
uniform float uL, uFill, uRef;
varying vec2 vUv;
${NB}
void main() {
  vec4 a = texture2D(uA, vUv), b = texture2D(uB, vUv);
  float pond = clamp(b.r - a.r - 0.003, 0.0, a.b) * uFill;      // (less the hair-thin slope left across a flat)
  // where it runs: the slope down to the lower neighbours, the direction weighted like the flow
  vec2 dir = vec2(0.0); float sl = 0.0;
  for (int i = 0; i < 8; i++) {
    float d = b.r - texture2D(uB, vUv + NO[i] * uTexel).r;
    if (d > 0.0) { float s = d / (ND[i] * uL); sl = max(sl, s); dir += vec2(NO[i].x, -NO[i].y) / ND[i] * pow(NK[i] * s, 1.1); }
  }
  dir = length(dir) > 0.0 ? normalize(dir) : vec2(0.0);
  // Manning (n ~0.015 on asphalt and concrete, ~0.035 on the ground) for the unit discharge across the cell
  float q = b.b / uL, n = mix(0.035, 0.015, smoothstep(0.5, 0.85, a.g + a.a));
  float hf = q > 0.0 ? pow(q * n / sqrt(clamp(sl, 0.004, 1.0)), 0.6) : 0.0;
  float h = max(pond, hf) + 0.3 * min(pond, hf);
  float v = min(q / max(h, 2e-4), 3.0) * (1.0 - smoothstep(0.004, 0.02, pond) * 0.7);
  gl_FragColor = vec4(h, dir * v, a.r - uRef);
}`;

// a stream does not stay one cell wide: its surface stands level across the gutter, so it spreads over whatever lies
// lower than that surface around it (~1 m onto a road with a 2 % cross slope against the kerb, hardly at all up a
// steep bank), never deeper there than the stream itself. Worked out as the highest water surface within ±5 cells,
// less 1 cm a metre, along x (SPREAD, uDir x) then along z (uDir z, uFinal); the velocity comes with it, slower.
const SPREAD_FRAG = /* glsl */`
uniform sampler2D uSrc, uRaw;
uniform vec2 uDir;
uniform float uL, uFinal;
varying vec2 vUv;
void main() {
  vec4 r = texture2D(uRaw, vUv);
  vec4 best = uFinal < 0.5 ? vec4(r.a + r.r, r.r, r.gb) : texture2D(uSrc, vUv);
  for (int i = -5; i <= 5; i++) {
    if (i == 0) continue;
    vec4 c;                                                                       // (surface, depth of its stream, velocity)
    if (uFinal < 0.5) { vec4 n = texture2D(uRaw, vUv + uDir * float(i)); c = vec4(n.a + n.r, n.r, n.gb); }
    else c = texture2D(uSrc, vUv + uDir * float(i));
    float w = c.x - 0.01 * abs(float(i)) * uL;
    if (c.y > 0.003 && w > best.x) best = vec4(w, c.y, c.zw * (1.0 - 0.12 * abs(float(i))));
  }
  if (uFinal < 0.5) { gl_FragColor = best; return; }
  float d = clamp(best.x - r.a, 0.0, best.y);
  gl_FragColor = d > r.r ? vec4(d, best.zw, r.a) : r;
}`;

const fq = (frag, u) => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false }));

export class Runoff {
  constructor(occ) {
    this.occ = occ;
    const n = occ.size, L = 2 * occ.half / n;
    this.size = n; this.L = L;
    const rt = (type, filter) => new THREE.WebGLRenderTarget(n, n, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, generateMipmaps: false, depthBuffer: false });
    this.A = rt(THREE.FloatType, THREE.NearestFilter);
    this.B = [rt(THREE.FloatType, THREE.NearestFilter), rt(THREE.FloatType, THREE.NearestFilter)];
    this.out = rt(THREE.HalfFloatType, THREE.LinearFilter);
    this.raw = rt(THREE.HalfFloatType, THREE.NearestFilter); this.tmp = rt(THREE.HalfFloatType, THREE.NearestFilter);
    this.M = [rt(THREE.HalfFloatType, THREE.NearestFilter), rt(THREE.HalfFloatType, THREE.NearestFilter)];   // (the raised mask)
    this.ref = null;                 // (the heights' reference)
    const texel = new THREE.Vector2(1 / n, 1 / n);
    this.u = {
      st: { uSolid: { value: null }, uTop: { value: null }, uLow: { value: null }, uRoad: { value: null }, uThick: { value: null }, uTexel: { value: texel }, uRef: { value: 0 } },
      rz: { uSolid: { value: null }, uLow: { value: null } },
      mo: { uSrc: { value: null }, uTexel: { value: texel }, uMode: { value: 0 } },
      sh: { uA: { value: null }, uB: { value: null }, uShift: { value: new THREE.Vector2() }, uFresh: { value: 1 }, uRebase: { value: 0 } },
      fill: { uA: { value: null }, uB: { value: null }, uTexel: { value: texel } },
      split: { uB: { value: null }, uTexel: { value: texel }, uL: { value: L } },
      flow: { uA: { value: null }, uB: { value: null }, uTexel: { value: texel }, uL: { value: L }, uRate: { value: 0 } },
      out: { uA: { value: null }, uB: { value: null }, uTexel: { value: texel }, uL: { value: L }, uFill: { value: 0 }, uRef: { value: 0 } },
      sp: { uSrc: { value: null }, uRaw: { value: null }, uDir: { value: new THREE.Vector2() }, uL: { value: L }, uFinal: { value: 0 } },
    };
    this.q = { st: fq(STATIC_FRAG, this.u.st), rz: fq(RAISED_FRAG, this.u.rz), mo: fq(MORPH_FRAG, this.u.mo), sh: fq(SHIFT_FRAG, this.u.sh), fill: fq(FILL_FRAG, this.u.fill), split: fq(SPLIT_FRAG, this.u.split), flow: fq(FLOW_FRAG, this.u.flow), out: fq(OUT_FRAG, this.u.out), sp: fq(SPREAD_FRAG, this.u.sp) };
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
    st.uRef.value = box.w - this.ref;
    this._pass(renderer, this.q.st, this.A);
    const sh = this.u.sh;
    sh.uA.value = this.A.texture; sh.uB.value = this.B[this.cur].texture;
    sh.uFresh.value = fresh ? 1 : 0; sh.uRebase.value = rebase;
    if (!fresh) sh.uShift.value.set((box.x - this.box.x) / (2 * occ.half), -(box.y - this.box.y) / (2 * occ.half));
    this._pass(renderer, this.q.sh, this._swap());
    this.box = { x: box.x, y: box.y };
    this.on = true;
    renderer.setRenderTarget(rt0);
    RAIN.uFlowBox.value.set(box.x, box.y, occ.half, 1);
  }

  // rate: the rain (m/s of water); fill: how full the hollows are (0..1); iterations of the fill and of the flow
  step(renderer, rate, fill, nFill = 2, nFlow = 3) {
    if (!this.on) return;
    const rt0 = renderer.getRenderTarget();
    const u = this.u, A = this.A.texture;
    for (let i = 0; i < nFill; i++) { u.fill.uA.value = A; u.fill.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.fill, this._swap()); }
    u.split.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.split, this._swap());
    u.flow.uRate.value = rate;
    for (let i = 0; i < nFlow; i++) { u.flow.uA.value = A; u.flow.uB.value = this.B[this.cur].texture; this._pass(renderer, this.q.flow, this._swap()); }
    u.out.uA.value = A; u.out.uB.value = this.B[this.cur].texture; u.out.uFill.value = fill; u.out.uRef.value = RAIN.uOccBox.value.w - this.ref;
    this._pass(renderer, this.q.out, this.raw);
    const sp = u.sp, t = 1 / this.size;
    sp.uRaw.value = this.raw.texture; sp.uSrc.value = this.raw.texture; sp.uDir.value.set(t, 0); sp.uFinal.value = 0;
    this._pass(renderer, this.q.sp, this.tmp);
    sp.uSrc.value = this.tmp.texture; sp.uDir.value.set(0, t); sp.uFinal.value = 1;
    this._pass(renderer, this.q.sp, this.out);
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
