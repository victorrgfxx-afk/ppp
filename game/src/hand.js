import * as THREE from 'three';
import { buildGrip, bendGrip, gripWrist, gripWristBar } from './handgeo.js';
import { buildArm } from './armgeo.js';

// The driver's hands and arms as meshes (driver.js): the right hand sculpted round a straight bar by handgeo.js, the
// right arm by armgeo.js, in a worker (handworker.js), the hand once per rim thickness (one for every car), so the game
// never stops for them; where there is no worker, a few milliseconds a frame. The hands laid on each rim (its radius)
// when asked; the left hand and arm are the right ones mirrored. A hand can also be made in a pose of its own (a
// pistol's grip: handgeo.js), kept apart from the wheel's.
const bars = new Map(), pending = new Map(), rims = new Map();
let worker, failed = false, armRaw = null, armGeos = null;
const tk = (tube, pose) => tube.toFixed(4) + (pose ? '|' + JSON.stringify(pose) : '');
function done(b) {
  if (b.kind === 'arm') { armRaw = b; pending.delete('arm'); return; }
  bars.set(b.key, b); pending.delete(b.key);
}
function post(job) {
  if (!worker && !failed) {
    try {
      worker = new Worker(new URL('./handworker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => done(e.data);
      worker.onerror = (e) => { e.preventDefault?.(); failed = true; worker.terminate(); worker = null; for (const job of pending.values()) here(job); };
    } catch (e) { failed = true; worker = null; }
  }
  if (worker) worker.postMessage(job); else here(job);
}
// (no worker: the sculpture a few milliseconds at a time between frames)
const slow = [];
function here(job) {
  const it = job.kind === 'arm' ? buildArm() : buildGrip(job.tube, job.pose);
  slow.push({ it, kind: job.kind, key: job.key });
  if (slow.length > 1) return;
  const slice = () => {
    const t0 = performance.now();
    while (slow.length && performance.now() - t0 < 6) { const r = slow[0].it.next(); if (r.done) { r.value.kind = slow[0].kind; r.value.key = slow[0].key; done(r.value); slow.shift(); } }
    if (slow.length) setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
}
// start making the hands for a rim's thickness, or a bar's in a pose (nothing if they are made or on the way)
export function prepareHands(tube, pose) {
  const k = tk(tube, pose);
  if (bars.has(k) || pending.has(k)) return;
  const job = { kind: 'hand', tube, pose, key: k };
  pending.set(k, job);
  post(job);
}
// start making the arms (nothing if they are made or on the way)
export function prepareArms() {
  if (armRaw || pending.has('arm')) return;
  const job = { kind: 'arm' };
  pending.set('arm', job);
  post(job);
}
// the arms, { right, left: BufferGeometry, skinned to armgeo.js's five bones }, if they are made (else null)
export function gripArms() {
  if (armGeos || !armRaw) return armGeos;
  const b = armRaw, n = b.pos.length / 3, pl = new Float32Array(b.pos), nl = new Float32Array(b.nrm), il = b.idx.slice();
  for (let v = 0; v < n; v++) { pl[3 * v + 2] = -pl[3 * v + 2]; nl[3 * v + 2] = -nl[3 * v + 2]; }
  for (let t = 0; t < il.length; t += 3) { const s = il[t + 1]; il[t + 1] = il[t + 2]; il[t + 2] = s; }
  const geo = (p, q, ix) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(q, 3));
    g.setAttribute('color', new THREE.BufferAttribute(b.col, 3)); g.setAttribute('aCloth', new THREE.BufferAttribute(b.cloth, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(b.sw, 4));
    g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere();
    g.userData.shared = true;                 // (kept for the next car: driver.js)
    return g;
  };
  return (armGeos = { right: geo(b.pos, b.nrm, b.idx), left: geo(pl, nl, il) });
}
// where each forearm meets its hand, the forearm's direction there the hand was made for, and the back of the wrist, in
// the wheel's frame: [right, left]
export function handWrists(R, tube) {
  const { at, dir, back } = gripWrist(R, tube), v = (a, i) => new THREE.Vector3(i ? -a[0] : a[0], a[1], a[2]);
  return [0, 1].map(i => ({ at: v(at, i), dir: v(dir, i), back: v(back, i) }));
}
// the hands on a rim, { right, left: BufferGeometry }, if they are made (else null: prepareHands)
export function gripHands(R, tube) {
  const key = R.toFixed(4) + '/' + tk(tube);
  if (rims.has(key)) return rims.get(key);
  const b = bars.get(tk(tube));
  if (!b) return null;
  const { pos, nrm } = bendGrip(b, R), n = pos.length / 3;
  const pl = new Float32Array(pos), nl = new Float32Array(nrm), il = b.idx.slice();
  for (let v = 0; v < n; v++) { pl[3 * v] = -pl[3 * v]; nl[3 * v] = -nl[3 * v]; }
  for (let t = 0; t < il.length; t += 3) { const s = il[t + 1]; il[t + 1] = il[t + 2]; il[t + 2] = s; }
  const geo = (p, q, ix) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(q, 3));
    g.setAttribute('color', new THREE.BufferAttribute(b.col, 3)); g.setAttribute('aGloss', new THREE.BufferAttribute(b.gloss, 1));
    g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere();
    g.userData.shared = true;                 // (kept for the next car: driver.js)
    return g;
  };
  const h = { right: geo(pos, nrm, b.idx), left: geo(pl, nl, il) };
  rims.set(key, h);
  return h;
}

// the hands round a straight bar (a pistol's grip, glock.js), { right, left: BufferGeometry } in the bar's frame (the
// left the right mirrored across x), if they are made (else null: prepareHands with the same pose)
const straight = new Map();
export function barHands(tube, pose) {
  const k = tk(tube, pose);
  if (straight.has(k)) return straight.get(k);
  const b = bars.get(k);
  if (!b) return null;
  const n = b.pos.length / 3, pl = new Float32Array(b.pos), nl = new Float32Array(b.nrm), il = b.idx.slice();
  for (let v = 0; v < n; v++) { pl[3 * v] = -pl[3 * v]; nl[3 * v] = -nl[3 * v]; }
  for (let t = 0; t < il.length; t += 3) { const s = il[t + 1]; il[t + 1] = il[t + 2]; il[t + 2] = s; }
  const geo = (p, q, ix) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(q, 3));
    g.setAttribute('color', new THREE.BufferAttribute(b.col, 3)); g.setAttribute('aGloss', new THREE.BufferAttribute(b.gloss, 1));
    g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere();
    return g;
  };
  const h = { right: geo(new Float32Array(b.pos), new Float32Array(b.nrm), b.idx), left: geo(pl, nl, il) };
  straight.set(k, h);
  return h;
}
// where each forearm meets its hand on a straight bar, its direction there and the back of the wrist (the bar's frame):
// [right, left]
export function barWrists(tube, pose) {
  const { at, dir, back } = gripWristBar(tube, pose), v = (a, i) => new THREE.Vector3(i ? -a[0] : a[0], a[1], a[2]);
  return [0, 1].map(i => ({ at: v(at, i), dir: v(dir, i), back: v(back, i) }));
}

// the skin: a little sheen at grazing light (the light the skin scatters back out near its edges), the nails glossy; the
// arms' (cloth: true) with the T-shirt's knit matt
// (cuff: the arms' only - a glove's cuff over the forearm's last part toward the wrist, where its last twist bone
// (armgeo.js: the forearm's four, the wrist's the last) holds it: the pistol's gloves)
// (value noise for the glove's knit: glove and cuff)
const GLN = `
float glN(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 h = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453), k = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 a = mix(h, k, f.z); vec2 b = mix(a.xz, a.yw, f.x); return mix(b.x, b.y, f.y);
}`;
export function skinMaterial(cloth = false, cuff = false) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, sheen: 0.45, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.62, 0.26, 0.17), specularIntensity: 0.65 });
  m.userData.noWet = true; m.envMapIntensity = 0.55;
  m.onBeforeCompile = (sh) => {
    const a = cloth ? 'aCloth' : 'aGloss', r = cloth ? '0.92' : '0.2';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute float ${a}; varying float vGloss;${cuff ? ' varying float vCuff; varying vec3 vGlP;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGloss = ${a};${cuff ? '\nvCuff = dot(vec4(equal(skinIndex, vec4(4.0))), skinWeight); vGlP = position;' : ''}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vGloss;${cuff ? ' varying float vCuff; varying vec3 vGlP;' + GLN : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${r}, vGloss);`);
    if (cuff) sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float gC = smoothstep(0.1, 0.22, vCuff), gKnit = glN(vGlP * 600.0) * 0.6 + glN(vGlP * 1500.0) * 0.4;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.021, 0.022, 0.024) * (0.85 + 0.3 * gKnit), gC);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.88 - 0.1 * gKnit, gC);')
      // (the fabric's sheen the glove's: grey, not the skin's warm one)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.sheenColor = mix(material.sheenColor, vec3(0.08, 0.08, 0.09), gC);');
  };
  m.customProgramCacheKey = () => (cloth ? 'armskin' : 'handskin') + (cuff ? 'cuff' : '');
  return m;
}

// a tactical glove over the hand (the pistol's hands: weapon.js): black synthetic fabric, matt, with a fine knit; thin
// rubber pads over the knuckles (where the hand's own colours mark them, handgeo.js: redder and darker there), its
// creases darker; the fingertips covered (no nails); the cuff over the wrist (the hand's forearm stub)
export function gloveMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, sheen: 0.5, sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0.16, 0.16, 0.18), specularIntensity: 0.4 });
  m.userData.noWet = true; m.envMapIntensity = 0.5;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlP;' + GLN)
      .replace('#include <color_fragment>', `#include <color_fragment>
  // (the hand's colours: the knuckles redder and darker than the skin, the folds darker still)
  float gL = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)), gR = vColor.g / max(vColor.r, 1e-3);
  float gPad = smoothstep(0.47, 0.43, gR) * smoothstep(0.12, 0.2, gL), gCrease = smoothstep(0.2, 0.1, gL);
  float gKnit = glN(vGlP * 600.0) * 0.6 + glN(vGlP * 1500.0) * 0.4;
  diffuseColor.rgb = mix(vec3(0.021, 0.022, 0.024) * (0.85 + 0.3 * gKnit), vec3(0.05, 0.05, 0.052), gPad) * (1.0 - 0.45 * gCrease);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(0.88 - 0.1 * gKnit, 0.5, gPad);`);
  };
  m.customProgramCacheKey = () => 'glove';
  return m;
}
