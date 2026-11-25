import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { prepareHands, barHands, gloveMaterial } from './hand.js';
import { handSkeleton } from './handgeo.js';

// (V121) A cigar (Tab): taken out of your case (there is always another), cut, toasted and lit by hand with a lighter,
// smoked, burning down as it really does, its smoke on the air round you.
//
// The cigar: a robusto, 5 in x 50 ring gauge (127 x 19.8 mm), a medium-brown wrapper laid on in a spiral, a plain band
// (no maker's), the cap cut off by a guillotine as you take it out. Smoked at a puff a minute it lasts about an hour
// (Holt's: 45-50 min for a robusto, retailers 45-60): a draw takes ~0.6 mm off it a second, the smoulder between draws
// ~0.6 mm a minute. With no accelerants in its leaf it goes out a couple of minutes after the last puff (Holt's,
// Davidoff's "a puff a minute"): light it again. Its ash grows on the foot and falls off when it is long (~2-3 cm) or
// when you jolt it; the last inch (the nub) is thrown away - Tab takes another.
//
// Lighting it as the guides say: toast the foot over the flame without touching it, turning the cigar, until it is
// charred and glowing at its rim (hold the left button: the lighter comes up under it), then draw on it with the flame
// still at the foot (both buttons) - two or three draws and it is lit.
//
// The smoke, in the world's air (it stays behind when you walk on, the wind takes it):
//  - from the foot, the sidestream: fresh, its particles ~0.27 um across - about blue light's wavelength, so it scatters
//    blue (Rayleigh) and looks blue-grey; a thin column rising off the hot coal (~0.3 m/s, slowing as it mixes), smooth
//    for its first few centimetres, then curling and breaking up, spreading as it goes;
//  - from your mouth after a draw (you hold the smoke a moment, cigars are not inhaled), the mainstream: its particles
//    grown in the damp mouth, white-grey (they scatter every colour: Mie), blown out as a jet that slows in half a second
//    and opens into a cloud;
//  - the wind at your head (the trees' wind, B, brought down to ~1.7 m by the logarithmic profile, less in the lee of a
//    wall or among trees) carries both, with the eddies of air near the ground (turbulence ~35 % of the wind there); a
//    plume bends over in a wind of a metre a second; walking, it trails behind you, a little of it dragged along in
//    your wake;
//  - lit as smoke is: by the sky, glowing when the sun is behind it (it scatters forwards), in your torch's beam, red
//    near the coal at night.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export const CIG = {
  L: 0.127, R: 0.00992,                     // (5 in, ring gauge 50: 50/64 in)
  BAND: [0.016, 0.034],                     // (the band, measured from the head)
  CUT: 0.0025,                              // (the cap's slice taken off)
  NUB: 0.028,                               // (thrown away at ~1 in)
  PUFF: 0.0006,                             // (m a second while drawing)
  IDLE: 0.0006 / 60,                        // (m a second smouldering at full heat)
  OUT_T: 70,                                // (its heat's fall, s: out ~2.5 min after a draw)
  ASH: [0.018, 0.03],                       // (the ash falls between these lengths)
};
const VM_FOV = 55;                          // (the hands' own lens, as the guns': weapon.js)
const LIGHTER_R = 0.0105;                   // (the lighter's body as a bar in the left hand)

// ------------------------------------------------------------------ textures (canvas)
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function hash(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s = 1) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i + s * 101, j), b = hash(i + 1 + s * 101, j), c = hash(i + s * 101, j + 1), d = hash(i + 1 + s * 101, j + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
// the wrapper leaf: around the cigar (u) and along it (v, 0 at the head); its seam spiralling, the veins slanting off it,
// the leaf's mottle, a little oil
const wrapperTex = () => canvasTex(512, 512, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = i / w, v = j / h, k = (j * w + i) * 4;
    const sp = (u * 1 + v * 3.2) % 1, seam = Math.exp(-((sp - 0.5) ** 2) / 0.00004);
    const veinA = Math.abs(Math.sin((u * 7 - v * 15) * Math.PI + vnoise(u * 9, v * 9) * 2.5));
    const vein = Math.exp(-(veinA * veinA) / 0.0025) * 0.55;
    const mott = vnoise(u * 18, v * 40, 2) * 0.6 + vnoise(u * 60, v * 120, 3) * 0.4;
    const base = 0.78 + 0.28 * mott - 0.22 * seam + 0.18 * vein;
    img.data[k] = 112 * base; img.data[k + 1] = 70 * base; img.data[k + 2] = 42 * base; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
});
// the band: a deep red ring with gold edges and a plain gold lozenge (no name on it)
const bandTex = () => canvasTex(512, 64, (x, w, h) => {
  x.fillStyle = '#6e0f12'; x.fillRect(0, 0, w, h);
  const gold = x.createLinearGradient(0, 0, 0, h); gold.addColorStop(0, '#f3d27a'); gold.addColorStop(0.5, '#b8862e'); gold.addColorStop(1, '#f0cf78');
  x.fillStyle = gold; x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
  x.fillRect(0, 11, w, 2); x.fillRect(0, h - 13, w, 2);
  for (let i = 0; i < 2; i++) {
    const cx = (i + 0.25) * w / 2;
    x.beginPath(); x.moveTo(cx, 15); x.lineTo(cx + 26, h / 2); x.lineTo(cx, h - 15); x.lineTo(cx - 26, h / 2); x.closePath(); x.fill();
    x.fillStyle = '#6e0f12'; x.beginPath(); x.arc(cx, h / 2, 7, 0, Math.PI * 2); x.fill(); x.fillStyle = gold;
  }
});
// the foot: the filler's leaves folded in (a whorl of brown), toasted to black (b) - the char's alligator cracks
function footTex(char) {
  return canvasTex(128, 128, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i - w / 2) / (w / 2), dy = (j - h / 2) / (h / 2), r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), k = (j * w + i) * 4;
      const swirl = 0.5 + 0.5 * Math.sin(a * 3 + r * 22 + vnoise(dx * 6, dy * 6) * 4), n = vnoise(dx * 30, dy * 30, 5);
      let c = [92 + 40 * swirl * n, 58 + 26 * swirl * n, 34 + 14 * swirl];
      if (char) { const cr = Math.abs(vnoise(dx * 14, dy * 14, 9) - 0.5) < 0.04 ? 1 : 0; c = [18 + 10 * n + 40 * cr, 15 + 7 * n + 10 * cr, 13 + 5 * n]; }
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  });
}
// the coal's glow (emissive): its cracks and rim, hotter in the middle of a draw
const emberTex = () => canvasTex(128, 128, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (i - w / 2) / (w / 2), dy = (j - h / 2) / (h / 2), r = Math.hypot(dx, dy), k = (j * w + i) * 4;
    const n = vnoise(dx * 9, dy * 9, 7) * 0.6 + vnoise(dx * 23, dy * 23, 8) * 0.4;
    const g = Math.max(0, n - 0.35) * 2.2 * (0.6 + 0.4 * ss(0.4, 1, r));
    img.data[k] = 255 * Math.min(1, g * 1.2); img.data[k + 1] = 255 * Math.min(1, g * 0.42); img.data[k + 2] = 255 * Math.min(1, g * 0.12); img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
});
// the ash: pale grey, in the rings it leaves at each draw, flaked
const ashTex = () => canvasTex(128, 256, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = i / w, v = j / h, k = (j * w + i) * 4;
    const ring = 0.5 + 0.5 * Math.sin(v * 70 + vnoise(u * 8, v * 8, 4) * 3), fl = vnoise(u * 40, v * 60, 6);
    const g = 140 + 55 * fl + 30 * ring - 60 * (Math.abs(fl - 0.5) < 0.05 ? 1 : 0);
    img.data[k] = g; img.data[k + 1] = g * 0.99; img.data[k + 2] = g * 0.96; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
});
// a wisp of smoke for the particles: soft, torn inside (finer than the campfire's)
const puffTex = () => {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    let f = 0, a = 0.5, s = 5 / n;
    for (let o = 0; o < 4; o++) { f += a * vnoise(x * s + o * 17, y * s + o * 31, 11 + o); s *= 2.2; a *= 0.5; }
    const v = Math.max(0, 1 - r) ** 1.6 * Math.max(0, f * 1.8 - 0.42);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, 255 * v * 1.6);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); return t;
};
// the lighter's flame: a soft flame, blue at its root, yellow-orange above
const flameTex = () => canvasTex(64, 128, (x, w, h) => {
  const img = x.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = (i - w / 2) / (w / 2), v = 1 - j / h, k = (j * w + i) * 4;
    const wid = 0.55 * Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 0.7 * (1 - 0.4 * v);
    const a = ss(wid, wid * 0.4, Math.abs(u)) * ss(0, 0.06, v) * (1 - ss(0.82, 1, v));
    const blue = 1 - ss(0.1, 0.28, v), core = ss(wid * 0.55, 0, Math.abs(u)) * ss(0.25, 0.45, v) * (1 - ss(0.7, 0.9, v));
    const r = 255 * (1 - blue * 0.8), gg = 200 * (1 - blue * 0.6) + 40 * core, b = 120 * blue + 60 * core;
    img.data[k] = r; img.data[k + 1] = Math.min(255, gg); img.data[k + 2] = Math.min(255, b); img.data[k + 3] = 255 * a;
  }
  x.putImageData(img, 0, 0);
});

// ------------------------------------------------------------------ the smoke's particles (billboards, in the world)
const SMOKE_V = /* glsl */`
attribute vec3 iPos;
attribute vec4 iData;          // size (m), opacity, kind (0 from the foot, 1 breathed out, 2 toasting) + its age (0-0.9), seed
uniform vec3 uCam, uSunDir, uSunCol, uAmb, uTorchPos, uTorchDir;
uniform float uTime, uTorch;
uniform vec4 uEmber;
varying vec2 vUv;
varying float vA, vK, vKind;
varying vec3 vCol;
void main() {
  float kind = floor(iData.z);
  vKind = kind;
  vK = fract(iData.z) / 0.9;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float ang = iData.w * 6.2832 + uTime * (iData.w - 0.5) * 0.5;
  vec2 cs = vec2(cos(ang), sin(ang));
  vec2 q = vec2(position.x * cs.x - position.y * cs.y, position.x * cs.y + position.y * cs.x);
  vec3 wp = iPos + (right * q.x + up * q.y) * iData.x;
  vUv = position.xy + 0.5;
  // its colour: the sidestream's blue-grey (fresh, fine), the breath's white-grey; lit by the sky, by the sun mostly
  // forward (Henyey-Greenstein, g 0.6: the smoke glows with the sun behind it), the torch's cone and the coal's red
  vec3 base = kind > 0.5 && kind < 1.5 ? vec3(0.84, 0.84, 0.83) : kind > 1.5 ? vec3(0.5, 0.5, 0.52) : vec3(0.56, 0.63, 0.76);
  vec3 V = normalize(iPos - uCam);
  float c = dot(V, uSunDir), g = 0.6, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
  vCol = base * (uAmb + uSunCol * (0.08 + 0.4 * ph));
  vec3 dT = iPos - uTorchPos;
  float dl = length(dT), cone = smoothstep(0.86, 0.97, dot(dT / max(dl, 1e-3), uTorchDir));
  vCol += base * uTorch * cone / (0.5 + dl * dl);
  float de = length(iPos - uEmber.xyz);
  vCol += vec3(1.0, 0.42, 0.14) * uEmber.w * 0.0025 / (0.0004 + de * de);
  // (no blot over the lens as you walk through it)
  vA = iData.y * smoothstep(0.05, 0.28, length(iPos - uCam));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SMOKE_F = /* glsl */`
uniform sampler2D uTex;
varying vec2 vUv;
varying float vA, vK, vKind;
varying vec3 vCol;
void main() {
  // (young: a smooth thread off the coal; older, torn into wisps)
  vec2 c = vUv - 0.5;
  float smoothA = exp(-dot(c, c) * 18.0) * (1.0 - smoothstep(0.4, 0.5, length(c)));
  // (the breath is torn into billows almost at once)
  float a = mix(smoothA * 0.8, texture2D(uTex, vUv).a, vKind > 0.5 && vKind < 1.5 ? smoothstep(0.0, 0.08, vK) : smoothstep(0.04, 0.3, vK)) * vA;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol, a);
}`;

// ------------------------------------------------------------------ the cigar
export class Cigar {
  constructor(scene, audio) {
    this.audio = audio;
    this.raised = false;                 // in your hand before you (or down at your side)
    this.k = 0;                          // (how far up: 0 down, 1 before you)
    this.has = false;                    // (a cigar out of the case)
    this.cut = false; this.toast = 0; this.heat = 0; this.lit = false; this.burnt = 0; this.ash = 0;
    this.drawK = 0; this.lightK = 0; this.mouth = 0; this.hold = 0; this.exhale = 0; this.exhaleN = 0;
    this.ashAt = CIG.ASH[0] + Math.random() * (CIG.ASH[1] - CIG.ASH[0]);
    this.spin = 0; this.t = 0; this.wasOut = false; this.finished = false; this.lastDraw = -99;
    this.flameOn = false;
    // ---- the viewmodel (its own lens, as the guns')
    const vm = this.vm = new THREE.Group(); vm.name = 'cigar'; vm.matrixAutoUpdate = false; vm.visible = false;
    scene.add(vm);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      wrap: std({ map: wrapperTex(), roughness: 0.62, metalness: 0 }),
      band: std({ map: bandTex(), roughness: 0.35, metalness: 0.25 }),
      foot: std({ map: footTex(false), roughness: 0.9 }),
      char: footTex(true), raw: null,
      ember: std({ map: footTex(true), emissiveMap: emberTex(), emissive: new THREE.Color(1, 0.45, 0.12), emissiveIntensity: 0, roughness: 0.95 }),
      ash: std({ map: ashTex(), roughness: 0.98, color: 0xd8d6d2 }),
      metal: std({ color: 0x9aa0a6, roughness: 0.32, metalness: 0.9 }),
      dark: std({ color: 0x1c1d1f, roughness: 0.5, metalness: 0.4 }),
    };
    this.mat.raw = this.mat.foot.map;
    this.cutU = { value: 0 }; this.burnU = { value: CIG.L };
    for (const m of Object.values(this.mat)) if (m?.isMaterial) m.userData.noWet = true;
    // the cigar along +z (0 at the head, CIG.L at the foot), round its axis
    const cig = this.cig = new THREE.Group(); cig.matrixAutoUpdate = false; vm.add(cig);
    const prof = [];
    const R = CIG.R, L = CIG.L;
    // (the head's shoulder rounded into the cap, then straight; a lathe about y, turned onto z)
    for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; prof.push(new THREE.Vector2(R * Math.sin(a) * 0.98 + 0.0002, -R * 0.55 * Math.cos(a) + R * 0.55)); }
    prof.push(new THREE.Vector2(R, L));
    const body = new THREE.LatheGeometry(prof, 40);
    body.rotateX(Math.PI / 2);                                                   // (y -> z: the head at z 0)
    // the wrapper's map: u round, v along (metres x 6: the leaf's scale)
    const uv = body.attributes.uv, pos = body.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), pos.getZ(i) * 6);
    this.mat.wrap.onBeforeCompile = (sh) => {
      sh.uniforms.uCut = this.cutU; sh.uniforms.uBurn = this.burnU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vZ = position.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vZ;\nuniform float uCut, uBurn;')
        .replace('void main() {', 'void main() {\n  if (vZ < uCut || vZ > uBurn) discard;')
        // (the wrapper darkens and browns toward the burn line: toasted by the coal's heat)
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, 0.25, smoothstep(uBurn - 0.006, uBurn, vZ));');
    };
    this.mat.wrap.customProgramCacheKey = () => 'cigarWrap';
    this.body = new THREE.Mesh(body, this.mat.wrap); cig.add(this.body);
    const band = new THREE.CylinderGeometry(R * 1.012, R * 1.012, CIG.BAND[1] - CIG.BAND[0], 40, 1, true);
    band.rotateX(Math.PI / 2); band.translate(0, 0, (CIG.BAND[0] + CIG.BAND[1]) / 2);
    this.band = new THREE.Mesh(band, this.mat.band); cig.add(this.band);
    this.mat.band.onBeforeCompile = (sh) => {
      sh.uniforms.uBurn = this.burnU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vZ = position.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vZ;\nuniform float uBurn;').replace('void main() {', 'void main() {\n  if (vZ > uBurn) discard;');
    };
    this.mat.band.customProgramCacheKey = () => 'cigarBand';
    // the cut at the head (the filler showing), the foot's face (raw leaf, toasted, glowing), the ash
    const disc = (r) => new THREE.CircleGeometry(r, 32);
    this.capCut = new THREE.Mesh(disc(R * 0.84), this.mat.foot); this.capCut.rotation.y = Math.PI; cig.add(this.capCut);
    this.face = new THREE.Mesh(disc(R * 0.995), this.mat.ember); cig.add(this.face);
    const ash = new THREE.CylinderGeometry(R * 0.94, R * 0.97, 1, 32, 1, false);
    ash.rotateX(Math.PI / 2); ash.translate(0, 0, 0.5);
    this.ashM = new THREE.Mesh(ash, this.mat.ash); cig.add(this.ashM);
    // (the coal seen from the side: a glowing ring between the wrapper and the ash, brightest in a draw)
    const ring = new THREE.CylinderGeometry(R * 0.995, R * 0.985, 0.0022, 32, 1, true); ring.rotateX(Math.PI / 2);
    this.ring = new THREE.Mesh(ring, this.mat.ember); cig.add(this.ring);
    for (const o of [this.body, this.band, this.capCut, this.face, this.ashM, this.ring]) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; }
    // ---- the lighter: a soft-flame butane lighter (no name), its flame
    const lighter = this.lighter = new THREE.Group(); lighter.matrixAutoUpdate = false; vm.add(lighter);
    const bodyL = new RoundedBoxGeometry(0.024, 0.062, 0.013, 3, 0.004); bodyL.translate(0, -0.012, 0);
    lighter.add(new THREE.Mesh(bodyL, this.mat.metal));
    const top = new RoundedBoxGeometry(0.024, 0.012, 0.013, 2, 0.003); top.translate(0, 0.025, 0);
    lighter.add(new THREE.Mesh(top, this.mat.dark));
    const noz = new THREE.CylinderGeometry(0.0022, 0.0028, 0.005, 12); noz.translate(0.004, 0.0335, 0);
    lighter.add(new THREE.Mesh(noz, this.mat.metal));
    const btn = new RoundedBoxGeometry(0.012, 0.004, 0.009, 2, 0.0015); btn.translate(-0.005, 0.0325, 0);
    lighter.add(new THREE.Mesh(btn, this.mat.dark));
    this.flame = new THREE.Mesh(new THREE.PlaneGeometry(0.011, 0.03), new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(3.2, 2.6, 2.0) }));
    this.flame.geometry.translate(0, 0.015, 0); this.flame.position.set(0.004, 0.036, 0); this.flame.visible = false;
    lighter.add(this.flame);
    for (const o of lighter.children) { o.castShadow = false; o.frustumCulled = false; }
    this.LIGHTER_TOP = 0.036;
    // ---- the hands: the right one holding the cigar between the index and middle fingers, the left round the lighter
    this.handMat = gloveMaterial();
    this.pose = {
      glove: true, gam: 0.55,
      fingers: [{ bend: [0.18, 0.32, 0.22], splay: 0.24 }, { bend: [0.24, 0.42, 0.26], splay: -0.2 }, { bend: [1.05, 1.35, 0.95], splay: 0.02 }, { bend: [1.15, 1.35, 0.95], splay: 0.08 }],
    };
    this.R_TUBE = 0.03;
    this.lpose = { glove: true };
    prepareHands(this.R_TUBE, this.pose); prepareHands(LIGHTER_R, this.lpose);
    this.hands = null;
    this.inHand = this.gripFrame();
    // ---- the smoke
    const N = this.N = 1400;
    this.p = new Float32Array(N * 3); this.d = new Float32Array(N * 12);    // (age, life, s0, s1, a0, kind, seed, jx, jy, jz, g, alive)
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.iData.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iData', this.iData);
    geo.instanceCount = 0;
    this.U = { uTex: { value: puffTex() }, uCam: { value: V3() }, uSunDir: { value: V3(0, 1, 0) }, uSunCol: { value: V3() }, uAmb: { value: V3(0.6, 0.62, 0.66) },
      uTorchPos: { value: V3() }, uTorchDir: { value: V3(0, 0, -1) }, uTorch: { value: 0 }, uTime: { value: 0 }, uEmber: { value: new THREE.Vector4() } };
    this.smoke = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: SMOKE_V, fragmentShader: SMOKE_F, transparent: true, depthWrite: false }));
    this.smoke.frustumCulled = false; this.smoke.userData.noAO = true;
    this.fx = new THREE.Group(); this.fx.add(this.smoke);
    this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.live = [];
    this.emitSide = 0; this.emitMouth = 0; this.emitToast = 0;
    // ---- the ash that falls, the nubs thrown away (in the world)
    this.bits = [];
    this.world = new THREE.Group(); scene.add(this.world);
    this.ember = V3(); this.mouthP = V3(); this.lastEmber = V3(); this.hasEmber = false;
  }

  // the cigar's frame in the right hand's (the bar's frame of handgeo.js): between the index and middle fingers, a
  // little below their middle joints, across the hand (along the palm's normal), the head on the palm's side
  gripFrame() {
    const sk = handSkeleton(this.R_TUBE, this.pose), A = (v) => V3(...v);
    const fi = sk.fingers[0].map(A), fm = sk.fingers[1].map(A);
    const pi = fi[0].clone().lerp(fi[1], 0.72), pm = fm[0].clone().lerp(fm[1], 0.72);
    const c = pi.clone().add(pm).multiplyScalar(0.5);
    const along = fi[1].clone().sub(fi[0]).add(fm[1].clone().sub(fm[0])).normalize(), gap = pm.clone().sub(pi).normalize();
    let ax = along.clone().cross(gap).normalize();
    if (ax.dot(A(sk.D)) < 0) ax.negate();                                     // (the foot out of the back of the hand)
    const z = ax, y = along.clone().sub(z.clone().multiplyScalar(along.dot(z))).normalize(), x = y.clone().cross(z);
    const head = c.clone().addScaledVector(z, -0.034);
    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(head);
  }

  // Tab: out of the case and up before you / down at your side; a finished one thrown away and another taken
  toggle() {
    if (!this.has || this.finished) {
      if (this.finished) this.drop();
      this.fresh();
      this.raised = true;
      return 'new';
    }
    this.raised = !this.raised;
    return this.raised ? 'up' : 'down';
  }
  fresh() {
    Object.assign(this, { has: true, cut: true, toast: 0, heat: 0, lit: false, burnt: 0, ash: 0, finished: false, mouth: 0, exhale: 0, wasOut: false });
    this.ashAt = CIG.ASH[0] + Math.random() * (CIG.ASH[1] - CIG.ASH[0]);
    this.audio?.cigarCut?.();
  }
  get length() { return CIG.L - CIG.CUT - this.burnt; }
  // (minutes left at a puff a minute, the smoulder between)
  get minutes() { return Math.max(0, (this.length - CIG.NUB) / (CIG.PUFF * 2 + CIG.IDLE * 60 * 0.8)); }

  // ---- every frame (before the camera's last placement: draw() puts it in your hands)
  update(dt, ctx) {
    this.t += dt;
    const { input, player, camera } = ctx;
    const can = ctx.foot && this.has;
    // the levers: the lighter (left button), a draw (right button) - with it up before you
    const up = can && this.raised;
    const wantLight = up && !this.finished && input.down('Mouse0');
    const wantDraw = up && !this.finished && input.down('Mouse2');
    this.k = damp(this.k, up ? 1 : 0, 7, dt);
    this.lightK = damp(this.lightK, wantLight ? 1 : 0, 6, dt);
    this.drawK = damp(this.drawK, wantDraw ? 1 : 0, 5.5, dt);
    const flame = wantLight && this.lightK > 0.85;
    if (flame !== this.flameOn) { this.flameOn = flame; this.audio?.lighter?.(flame); }
    // the wind at the foot of the cigar: rain and a gale make it harder to keep lit
    const rain = ctx.rain ?? 0, windH = Math.hypot(ctx.wind.x, ctx.wind.y);
    // ---- toasting, lighting, burning, going out
    const drawing = this.drawK > 0.8 && wantDraw;
    if (this.has && !this.finished) {
      if (flame) {
        this.toast = Math.min(1.2, this.toast + dt / 3.5 * (1 - 0.5 * ss(4, 12, windH)));
        this.spin += dt * 2.2;                                                  // (turned over the flame)
        if (!this.lit) {
          this.heat = Math.max(this.heat, 0.1 * Math.min(1, this.toast));
          // drawn on, toasted, with the flame at its foot: it takes, in two or three draws
          if (drawing && this.toast >= 1) { this.heat += dt * 0.42; if (this.heat > 0.5) { this.lit = true; this.wasOut = false; this.lastDraw = this.t; } }
        }
      }
      if (this.lit) {
        if (drawing) { this.heat = damp(this.heat, 1.45, 2.2, dt); this.lastDraw = this.t; }
        else this.heat -= dt * this.heat / CIG.OUT_T * (1 + 3 * rain) * (this.heat > 1 ? 4 : 1);
        if (this.heat < 0.12) { this.lit = false; this.wasOut = true; this.toast = Math.min(this.toast, 0.6); }
        // (wind: more air at the coal, it smoulders a little faster)
        const rate = CIG.IDLE * (0.35 + 0.65 * Math.min(1, this.heat)) * (1 + 0.04 * Math.min(windH, 10)) + (drawing ? CIG.PUFF : 0);
        this.burnt += rate * dt;
        this.ash += rate * dt * 0.95;
        if (drawing) this.mouth = Math.min(1.6, this.mouth + dt * 0.75);
      } else if (!flame) this.heat = Math.max(0, this.heat - dt * 0.05);
      if (this.length <= CIG.NUB) {
        this.finished = true; this.lit = false; this.heat = 0.05;
        ctx.hud?.toast('Trabucul s-a terminat: Tab îl aruncă și scoți altul din cutie (sunt destule)', 6);
      }
    }
    // ---- the ash: too long, or jolted off (a jump's landing, running)
    if (this.ash > this.ashAt || (this.ash > 0.008 && ((player?.landShake ?? 0) > 0.02 || (player?.running && Math.random() < dt * 0.3)))) this.dropAsh(camera);
    // ---- your breath: held a moment after the draw, then blown out
    if (!wantDraw && this.mouth > 0.05 && this.exhale <= 0) { this.hold += dt; if (this.hold > 1.0) { this.exhale = 1.3; this.exhaleN = this.mouth; this.mouth = 0; this.hold = 0; this.audio?.exhale?.(this.exhaleN); } }
    if (wantDraw && this.lit && this.drawK > 0.8 && Math.random() < dt * 3) this.audio?.cigarDraw?.(this.heat);
    if (this.exhale > 0) this.exhale -= dt;
    this.vm.visible = this.k > 0.02 && ctx.foot && !ctx.bodycam;
    this.ctxWind = ctx.wind; this.ctxCam = camera; this.player = player; this.light = ctx.light; this.onFoot = !!ctx.foot;
  }

  // ---- the viewmodel's place (after the camera's last move), the smoke's step
  draw(camera, dt, env) {
    camera.updateMatrixWorld();
    const k = Math.tan(camera.fov * Math.PI / 360) / Math.tan(VM_FOV * Math.PI / 360);
    this.vm.matrix.copy(camera.matrixWorld).multiply(_sc.makeScale(k, k, 1));
    this.vm.matrixWorldNeedsUpdate = true;
    this.limbs();
    // the cigar's place before you: at rest (lower right, the foot ahead and to the left), at your lips for a draw
    const p = this.player, bob = (p?.bobAmt ?? 0), ph = p?.bobPhase ?? 0;
    const restP = _a.set(0.1 + Math.cos(ph) * 0.004 * bob, -0.108 - Math.sin(ph) ** 2 * 0.007 * bob + Math.sin(this.t * 1.3) * 0.0015, -0.3);
    // (rolled about the cigar so the forearm goes down out of the frame: the hand held up before you)
    const restQ = _q1.setFromUnitVectors(_z.set(0, 0, 1), _b.set(-0.6, 0.2, -0.77).normalize()).multiply(_q3.setFromAxisAngle(_z.set(0, 0, 1), 4.85));
    // (at your lips, nearly level: its foot and the coal just inside the bottom of the view - as games show it)
    const puffP = _c.set(0.008, -0.062, -0.05), puffQ = _q2.setFromUnitVectors(_z.set(0, 0, 1), _b.set(0.04, -0.07, -0.997).normalize()).multiply(_q4.setFromAxisAngle(_z.set(0, 0, 1), 2.65));
    const down = _d.set(0.24, -0.55, -0.12);
    const kd = smoothK(this.drawK), ku = smoothK(this.k);
    _pos.copy(restP).lerp(puffP, kd).lerp(down, 1 - ku);
    _q.copy(restQ).slerp(puffQ, kd);
    // the cigar's frame in the view; the hand round it (its grip inverted)
    _m1.compose(_pos, _q, _one);
    if (this.hands) { this.hands[0].matrix.multiplyMatrices(_m1, _inv.copy(this.inHand).invert()); this.hands[0].matrixWorldNeedsUpdate = true; }
    // (turned between the fingers over the flame: the cigar rolls, the hand stays)
    this.cig.matrix.multiplyMatrices(_m1, _sc.makeRotationZ(this.spin));
    this.cig.matrixWorldNeedsUpdate = true;
    // the burn: the wrapper ends at the coal, the face and the ash after it
    const L = CIG.L, burnZ = L - this.burnt, R = CIG.R;
    this.cutU.value = CIG.CUT * 0.6; this.burnU.value = burnZ;
    this.capCut.position.set(0, 0, CIG.CUT); this.capCut.updateMatrix();
    this.face.position.set(0, 0, burnZ); this.face.updateMatrix();
    this.ring.position.set(0, 0, burnZ + 0.0011); this.ring.updateMatrix(); this.ring.visible = this.lit || this.heat > 0.05;
    const lit = this.lit, tst = Math.min(1, this.toast);
    this.face.material.map = tst > 0.35 || this.burnt > 0 ? this.mat.char : this.mat.raw;
    const glow = lit ? (0.55 + 0.45 * Math.min(1, this.heat)) * (1 + 1.6 * ss(0.9, 1.4, this.heat)) * (0.88 + 0.12 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3)) : this.flameOn ? 0.25 * tst : Math.max(0, this.heat - 0.02) * 2;
    this.face.material.emissiveIntensity = 3.2 * glow;
    this.ashM.visible = this.ash > 0.0008;
    this.ashM.scale.set(1, 1, Math.max(0.001, this.ash)); this.ashM.position.set(0, 0, burnZ); this.ashM.updateMatrix();
    // (the ash's own end: glowing at its root while lit)
    this.face.position.z = burnZ + 0.0004;
    // the lighter: up under the foot when held, its flame bent by the wind
    const lk = smoothK(this.lightK);
    this.lighter.visible = lk > 0.02;
    if (this.lighter.visible) {
      _e.set(0, 0, burnZ + this.ash * 0).applyMatrix4(this.cig.matrix);              // (the foot in the view)
      _f.copy(_e).add(_g.set(0, -0.016 - this.LIGHTER_TOP, 0.004));
      _h.set(-0.12, -0.32, -0.2);
      _pos.copy(_h).lerp(_f, lk);
      _q.setFromAxisAngle(_g.set(0, 1, 0), -0.69);                                // (the left forearm down and to the left, out of the frame)
      this.lighter.matrix.compose(_pos, _q, _one); this.lighter.matrixWorldNeedsUpdate = true;
      if (this.hands) { this.hands[1].matrix.multiplyMatrices(this.lighter.matrix, this.lighterInHand); this.hands[1].matrixWorldNeedsUpdate = true; this.hands[1].visible = true; }
      this.flame.visible = this.flameOn;
      if (this.flameOn) {
        const w = this.ctxWind ?? _w0, fl = 0.85 + 0.15 * Math.sin(this.t * 31) * Math.sin(this.t * 17.3);
        this.flame.scale.set(1, fl, 1);
        // (turned to the eye about its upright, leaned over by the wind across the view)
        _g.set(w.x, 0, w.y).transformDirection(_inv.copy(this.ctxCam.matrixWorldInverse));
        this.flame.rotation.set(0, 0, clamp(-_g.x * 0.12, -0.9, 0.9));
        this.flame.updateMatrix();
      }
    } else if (this.hands) this.hands[1].visible = false;
    // ---- the coal and your mouth in the world (where the smoke comes from)
    _e.set(0, 0, burnZ + this.ash + 0.002).applyMatrix4(this.cig.matrix).applyMatrix4(this.vm.matrix);
    if (!this.vm.visible && this.player) {
      // (down at your side: the coal by your right hip)
      const yaw = this.player.yaw, pp = this.player.pos;
      _e.set(pp.x + Math.cos(yaw) * 0.28 - Math.sin(yaw) * 0.12, pp.y + 0.95, pp.z - Math.sin(yaw) * 0.28 - Math.cos(yaw) * 0.12);
    }
    if (!this.hasEmber) { this.lastEmber.copy(_e); this.hasEmber = true; }
    this.ember.copy(_e);
    this.mouthP.set(0, -0.08, -0.06).applyMatrix4(camera.matrixWorld);
    this.stepSmoke(dt, camera, env);
  }

  limbs() {
    if (this.hands) return;
    const h0 = barHands(this.R_TUBE, this.pose), h1 = barHands(LIGHTER_R, this.lpose);
    if (!h0 || !h1) return;
    this.hands = [h0.right, h1.left].map(g => { const m = new THREE.Mesh(g, this.handMat); m.matrixAutoUpdate = false; m.frustumCulled = false; this.vm.add(m); return m; });
    // the lighter in the left hand: its body along the bar (+y), its top above the index finger
    const sk = handSkeleton(LIGHTER_R, this.lpose);
    let top = -1; for (const f of sk.fingers) for (const j of f) top = Math.max(top, j[1]);
    // (the left hand is the right mirrored in x: the lighter's frame in it, then inverted for the hand's from the lighter's)
    const inHand = new THREE.Matrix4().makeTranslation(0, top + 0.022 - 0.031, 0);   // (its top ~2 cm over the index finger)
    this.lighterInHand = inHand.invert();
  }

  // ---- the ash falls off: a crumbling grey cylinder down to the ground
  dropAsh(camera) {
    if (this.ash < 0.003) return;
    const len = this.ash;
    this.ash = 0;
    this.ashAt = CIG.ASH[0] + Math.random() * (CIG.ASH[1] - CIG.ASH[0]);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(CIG.R * 0.94, CIG.R * 0.97, len, 16), this.mat.ash);
    m.position.copy(this.ember);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.world.add(m);
    this.bits.push({ m, v: V3((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3), w: V3(Math.random() * 6, Math.random() * 6, Math.random() * 6), age: 0, rest: false, ash: true });
    // (a puff of it as it breaks)
    for (let i = 0; i < 6; i++) this.spawn(this.ember, 2, 0.01, 0.06, 0.25, 1.5, 0, 0, 0);
  }
  // the nub thrown down
  drop() {
    if (!this.has) return;
    const g = new THREE.CylinderGeometry(CIG.R, CIG.R, CIG.NUB, 20); g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, this.mat.wrap.clone());
    m.material.onBeforeCompile = () => {}; m.material.customProgramCacheKey = () => 'nub';
    m.position.copy(this.ember);
    this.world.add(m);
    this.bits.push({ m, v: V3((Math.random() - 0.5) * 1.2, 0.8, (Math.random() - 0.5) * 1.2), w: V3(Math.random() * 9, Math.random() * 9, Math.random() * 9), age: 0, rest: false, ash: false });
    this.has = false;
  }

  // a particle: kind 0 the foot's, 1 breathed out, 2 toasting / crumbling
  spawn(at, kind, s0, s1, a0, life, jx, jy, jz, age0 = 0) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.p[i * 3] = at.x + (Math.random() - 0.5) * 0.003; this.p[i * 3 + 1] = at.y; this.p[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.003;
    const d = this.d, o = i * 12;
    d[o] = age0; d[o + 1] = life * (0.8 + 0.4 * Math.random()); d[o + 2] = s0; d[o + 3] = s1 * (0.7 + 0.6 * Math.random()); d[o + 4] = a0;
    d[o + 5] = kind; d[o + 6] = Math.random(); d[o + 7] = jx; d[o + 8] = jy; d[o + 9] = jz; d[o + 10] = 0; d[o + 11] = 1;
    this.live.push(i);
  }

  stepSmoke(dt, camera, env) {
    this.U.uTime.value = this.t;
    const w = this.ctxWind ?? _w0, U = Math.hypot(w.x, w.y);
    // ---- the sources
    const lit = this.lit && this.has && this.onFoot;
    if (lit) {
      // the foot: a steady thin stream, thicker just after a draw (the coal fanned), less while drawing (air pulled in)
      const after = Math.exp(-(this.t - this.lastDraw) / 3), drawing = this.drawK > 0.8;
      // (in a wind the same smoke is stretched along a longer streak: as many more puffs to keep it whole, wider at
      // once - mixed straight away - and its life the same distance downwind)
      this.emitSide += dt * Math.min(300, (drawing ? 8 : 16 + 22 * Math.min(1, this.heat) + 18 * after) * (1 + 2 * U));
      // (spread over the frame: each where the coal was then, carried on by the air since - one unbroken thread)
      const nNew = Math.floor(this.emitSide), Uc = Math.min(U, 6);
      this.emitSide -= nNew;
      for (let j = 0; j < nNew; j++) {
        const f = (j + 0.5) / nNew, back = f * dt;
        _sp.copy(this.ember).lerp(this.lastEmber, f); _sp.x += w.x * back; _sp.z += w.y * back; _sp.y += 0.3 * back;
        this.spawn(_sp, 0, 0.0045 + 0.009 * Uc, 0.11 + 0.02 * Uc, 0.32, 5 / (1 + 0.12 * U), 0, 0, 0, back);
      }
    }
    if (this.flameOn && this.has && !this.finished && this.onFoot) {
      this.emitToast += dt * 9;
      while (this.emitToast >= 1) { this.emitToast -= 1; this.spawn(this.ember, 2, 0.006, 0.08, 0.22, 3.5, 0, 0, 0); }
    }
    if (this.exhale > 0) {
      // the breath: out of your lips forward and a little down, ~1.5 m/s, thinning as you run out
      const f = this.exhale / 1.3;
      this.emitMouth += dt * 90 * this.exhaleN * f;
      _fw.set(0, -0.16, -1).normalize().transformDirection(camera.matrixWorld);
      while (this.emitMouth >= 1) {
        this.emitMouth -= 1;
        const sp = 1.2 + 0.6 * Math.random();
        this.spawn(this.mouthP, 1, 0.03, 0.5, 0.34 * Math.min(1, this.exhaleN), 4.5 / (1 + 0.1 * U), _fw.x * sp + (Math.random() - 0.5) * 0.25, _fw.y * sp + (Math.random() - 0.5) * 0.2, _fw.z * sp + (Math.random() - 0.5) * 0.25);
      }
    }
    // ---- the air: the wind at your head, its eddies, the rise of the warm smoke, the jet of the breath, your wake
    const pv = this.player?.vel ?? _w0, head = camera.position, t = this.t;
    const I = 0.35, turbA = 0.04 + I * U;
    const p = this.p, d = this.d, iP = this.iPos.array, iD = this.iData.array;
    let n = 0;
    for (let li = this.live.length - 1; li >= 0; li--) {
      const i = this.live[li], o = i * 12;
      d[o] += dt;
      const age = d[o], life = d[o + 1], kind = d[o + 5], seed = d[o + 6];
      if (age >= life) { this.free.push(i); this.live[li] = this.live[this.live.length - 1]; this.live.pop(); continue; }
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      // (smooth for its first ~0.2 s - a few cm - then the eddies take it)
      const lam = ss(0.12, 0.7, age) * (kind === 1 ? 1 : 1);
      const s7 = seed * 7.3, A = turbA * lam;
      const tx = Math.sin(y * 9.1 + t * 2.3 + s7) + 0.6 * Math.sin(z * 17 - t * 3.1 + s7 * 2.1) + 0.35 * Math.sin(x * 31 + t * 4.7);
      const ty = Math.sin(z * 8.3 + t * 1.9 + s7 * 1.7) + 0.6 * Math.sin(x * 15 + t * 2.8 + s7 * 0.6) + 0.35 * Math.sin(y * 29 - t * 5.1);
      const tz = Math.sin(x * 10.7 - t * 2.1 + s7 * 2.9) + 0.6 * Math.sin(y * 13 + t * 3.4 + s7 * 1.3) + 0.35 * Math.sin(z * 27 + t * 4.3);
      // the plume's rise: ~0.3 m/s off the coal, slowing as it mixes; the breath barely warmer than the air
      const buoy = kind === 1 ? 0.06 * Math.exp(-age / 2) : (kind === 2 ? 0.22 : 0.32) * Math.exp(-age / 1.6) + 0.02;
      const jk = Math.exp(-age / 0.42);
      // (your wake: near you, walking, a little of the air goes along with you)
      const hx = x - head.x, hy = y - head.y + 0.4, hz = z - head.z, hd = Math.sqrt(hx * hx + hy * hy + hz * hz);
      const wake = hd < 0.8 ? 0.32 * (1 - hd / 0.8) : 0;
      let vx = w.x + A * tx * 0.6 + d[o + 7] * jk + pv.x * wake;
      let vy = buoy + A * ty * 0.45 + d[o + 8] * jk + (pv.y ?? 0) * wake;
      let vz = w.y + A * tz * 0.6 + d[o + 9] * jk + pv.z * wake;
      // (still air: a slow wander)
      vx += 0.012 * Math.sin(t * 0.7 + seed * 11); vz += 0.012 * Math.cos(t * 0.6 + seed * 13);
      let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      const gy = env?.ground ? env.ground(nx, nz) + 0.03 : -1e9;
      if (ny < gy) ny = gy;
      p[i * 3] = nx; p[i * 3 + 1] = ny; p[i * 3 + 2] = nz;
      // its size and thinning: it spreads (faster in a wind's eddies), its smoke spread over more air
      const s0 = d[o + 2], s1 = d[o + 3], grow = (kind === 1 ? 1.1 : 0.42) * (1 + 0.15 * U);
      const s = s0 + (s1 - s0) * (1 - Math.exp(-age * grow));
      const k = age / life;
      // (a column's smoke seen across: as thin as it is wide - the same smoke over a wider path)
      const a = d[o + 4] * ss(0, 0.06, age) * (1 - k) ** 1.4 * Math.pow(s0 / s, kind === 1 ? 0.45 : 0.75) / (1 + 0.05 * U);
      iP[n * 3] = nx; iP[n * 3 + 1] = ny; iP[n * 3 + 2] = nz;
      iD[n * 4] = s; iD[n * 4 + 1] = a; iD[n * 4 + 2] = kind + 0.9 * Math.min(0.999, k); iD[n * 4 + 3] = seed;
      n++;
    }
    this.smoke.geometry.instanceCount = n;
    this.lastEmber.copy(this.ember);
    this.iPos.needsUpdate = true; this.iData.needsUpdate = true;
    this.iPos.addUpdateRange?.(0, n * 3); this.iData.addUpdateRange?.(0, n * 4);
    // the light on it
    const L = env?.light;
    if (L) {
      this.U.uCam.value.copy(camera.position);
      this.U.uSunDir.value.copy(L.sunDir); this.U.uSunCol.value.copy(L.sunCol); this.U.uAmb.value.copy(L.amb);
      this.U.uTorch.value = L.torch ?? 0; if (L.torchPos) this.U.uTorchPos.value.copy(L.torchPos); if (L.torchDir) this.U.uTorchDir.value.copy(L.torchDir);
    }
    const glowE = this.lit ? this.face.material.emissiveIntensity / 3.2 * (L?.night ?? 0) : 0;
    this.U.uEmber.value.set(this.ember.x, this.ember.y, this.ember.z, glowE);
    // ---- the ash and the nubs falling
    for (let bi = this.bits.length - 1; bi >= 0; bi--) {
      const b = this.bits[bi];
      b.age += dt;
      if (!b.rest) {
        b.v.y -= 9.81 * dt; b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += b.w.x * dt; b.m.rotation.y += b.w.y * dt; b.m.rotation.z += b.w.z * dt;
        const gy = env?.ground ? env.ground(b.m.position.x, b.m.position.z) : -1e9;
        if (b.m.position.y < gy + CIG.R) {
          b.m.position.y = gy + CIG.R;
          if (b.ash) { b.m.scale.set(1.3, 0.35, 1.3); b.m.rotation.set(0, b.m.rotation.y, 0); b.rest = true; for (let i = 0; i < 4; i++) this.spawn(b.m.position, 2, 0.01, 0.05, 0.18, 1.2, 0, 0, 0); }
          else if (Math.abs(b.v.y) < 0.6) { b.rest = true; b.m.rotation.set(0, b.m.rotation.y, 0); } else { b.v.y *= -0.3; b.v.x *= 0.5; b.v.z *= 0.5; b.w.multiplyScalar(0.4); }
        }
      }
      // (the ash scattered and gone in a minute; a nub lies there a few minutes)
      if (b.age > (b.ash ? 60 : 300) || b.m.position.distanceTo(camera.position) > 300) { this.world.remove(b.m); b.m.geometry.dispose(); if (!b.ash) b.m.material.dispose(); this.bits.splice(bi, 1); }
    }
  }

  // what to tell the player (main.js: the prompt; the status line)
  get prompt() {
    if (!this.has) return '';
    if (this.finished) return 'Tab — arunci mucul și scoți alt trabuc';
    if (!this.raised) return '';
    if (!this.lit) {
      if (this.toast < 1) return this.wasOut ? 'S-a stins: ține clic stânga — îl reaprinzi cu bricheta (Tab îl lasă jos)' : 'Ține clic stânga — prăjești vârful la flacără, rotindu-l (Tab îl lasă jos)';
      return 'Ține clic stânga (flacăra) și clic dreapta (tragi) — îl aprinzi în 2–3 fumuri';
    }
    return 'Clic dreapta — tragi un fum · Tab — îl lași jos (arde mai departe)';
  }
  get status() {
    if (!this.has) return '';
    const mm = Math.round(this.length * 1000);
    return 'Trabuc · ' + mm + ' mm' + (this.finished ? ' · terminat' : this.lit ? ' · aprins · ~' + Math.max(1, Math.round(this.minutes)) + ' min la un fum pe minut' : this.wasOut ? ' · stins' : this.toast >= 1 ? ' · prăjit' : '');
  }
}
const smoothK = (k) => k * k * (3 - 2 * k);
const _sc = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _sp = V3(), _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _g = V3(), _h = V3(), _z = V3(), _pos = V3(), _fw = V3(), _one = V3(1, 1, 1);
const _q = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _w0 = { x: 0, y: 0, z: 0 };
