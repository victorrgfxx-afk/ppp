import * as THREE from 'three';
import { buildGrip, bendGrip, gripWrist } from './handgeo.js';

// The driver's hands as meshes (driver.js): the right hand sculpted round a straight bar by handgeo.js in a worker
// (handworker.js), once per rim thickness (one for every car), so the game never stops for it; where there is no worker,
// a few milliseconds a frame. Laid on each rim (its radius) when asked; the left hand is the right one mirrored across
// the wheel's upright.
const bars = new Map(), pending = new Set(), rims = new Map();
let worker, failed = false;
const tk = (tube) => tube.toFixed(4);
function done(b) { bars.set(tk(b.tube), b); pending.delete(tk(b.tube)); }
// (no worker: the sculpture a few milliseconds at a time between frames)
const slow = [];
function here(tube) {
  slow.push(buildGrip(tube));
  if (slow.length > 1) return;
  const slice = () => {
    const t0 = performance.now();
    while (slow.length && performance.now() - t0 < 6) { const r = slow[0].next(); if (r.done) { done(r.value); slow.shift(); } }
    if (slow.length) setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
}
// start making the hands for a rim's thickness (nothing if they are made or on the way)
export function prepareHands(tube) {
  const k = tk(tube);
  if (bars.has(k) || pending.has(k)) return;
  pending.add(k);
  if (!worker && !failed) {
    try {
      worker = new Worker(new URL('./handworker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => done(e.data);
      worker.onerror = (e) => { e.preventDefault?.(); failed = true; worker.terminate(); worker = null; for (const p of pending) here(+p); };
    } catch (e) { failed = true; worker = null; }
  }
  if (worker) worker.postMessage(tube); else here(tube);
}
// where each forearm meets its hand (inside the sleeve) and the forearm's direction there the hand was made for, in the
// wheel's frame: [right, left]
export function handWrists(R, tube) {
  const { at, dir } = gripWrist(R, tube);
  return [0, 1].map(i => ({ at: new THREE.Vector3(i ? -at[0] : at[0], at[1], at[2]), dir: new THREE.Vector3(i ? -dir[0] : dir[0], dir[1], dir[2]) }));
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
    return g;
  };
  const h = { right: geo(pos, nrm, b.idx), left: geo(pl, nl, il) };
  rims.set(key, h);
  return h;
}

// the skin: a little sheen at grazing light (the light the skin scatters back out near its edges), the nails glossy
export function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, sheen: 0.45, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.62, 0.26, 0.17), specularIntensity: 0.65 });
  m.userData.noWet = true; m.envMapIntensity = 0.55;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGloss; varying float vGloss;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGloss = aGloss;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGloss;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, vGloss);');
  };
  m.customProgramCacheKey = () => 'handskin';
  return m;
}
