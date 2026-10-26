import * as THREE from 'three';
import { buildGrip, bendGrip, gripWrist } from './handgeo.js';
import { buildArm } from './armgeo.js';

// The driver's hands and arms as meshes (driver.js): the right hand sculpted round a straight bar by handgeo.js, the
// right arm by armgeo.js, in a worker (handworker.js), the hand once per rim thickness (one for every car), so the game
// never stops for them; where there is no worker, a few milliseconds a frame. The hands laid on each rim (its radius)
// when asked; the left hand and arm are the right ones mirrored.
const bars = new Map(), pending = new Set(), rims = new Map();
let worker, failed = false, armRaw = null, armGeos = null;
const tk = (tube) => tube.toFixed(4);
function done(b) {
  if (b.kind === 'arm') { armRaw = b; pending.delete('arm'); return; }
  bars.set(tk(b.tube), b); pending.delete(tk(b.tube));
}
function post(job) {
  if (!worker && !failed) {
    try {
      worker = new Worker(new URL('./handworker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => done(e.data);
      worker.onerror = (e) => { e.preventDefault?.(); failed = true; worker.terminate(); worker = null; for (const p of pending) here(p === 'arm' ? { kind: 'arm' } : { kind: 'hand', tube: +p }); };
    } catch (e) { failed = true; worker = null; }
  }
  if (worker) worker.postMessage(job); else here(job);
}
// (no worker: the sculpture a few milliseconds at a time between frames)
const slow = [];
function here(job) {
  const it = job.kind === 'arm' ? buildArm() : buildGrip(job.tube);
  slow.push({ it, kind: job.kind });
  if (slow.length > 1) return;
  const slice = () => {
    const t0 = performance.now();
    while (slow.length && performance.now() - t0 < 6) { const r = slow[0].it.next(); if (r.done) { r.value.kind = slow[0].kind; done(r.value); slow.shift(); } }
    if (slow.length) setTimeout(slice, 0);
  };
  setTimeout(slice, 0);
}
// start making the hands for a rim's thickness (nothing if they are made or on the way)
export function prepareHands(tube) {
  const k = tk(tube);
  if (bars.has(k) || pending.has(k)) return;
  pending.add(k);
  post({ kind: 'hand', tube });
}
// start making the arms (nothing if they are made or on the way)
export function prepareArms() {
  if (armRaw || pending.has('arm')) return;
  pending.add('arm');
  post({ kind: 'arm' });
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

// the skin: a little sheen at grazing light (the light the skin scatters back out near its edges), the nails glossy; the
// arms' (cloth: true) with the T-shirt's knit matt
export function skinMaterial(cloth = false) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, sheen: 0.45, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0.62, 0.26, 0.17), specularIntensity: 0.65 });
  m.userData.noWet = true; m.envMapIntensity = 0.55;
  m.onBeforeCompile = (sh) => {
    const a = cloth ? 'aCloth' : 'aGloss', r = cloth ? '0.92' : '0.2';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute float ${a}; varying float vGloss;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGloss = ${a};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGloss;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${r}, vGloss);`);
  };
  m.customProgramCacheKey = () => cloth ? 'armskin' : 'handskin';
  return m;
}
