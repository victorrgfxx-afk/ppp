import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, forestCode, inPoly, polyDist } from './data.js';
import { M, addWind } from '../materials.js';
import { canvas, tex } from './pitigaia.js';
import { valueNoise2 } from './trees.js';
import { hillOpen, HILL_BOX, trackAt, trackPoint, drapelSpots } from './drapel.js';

// The wood and the meadows of the hill of the cross (photos 24 and 60) up close.
// - The meadows (the open ground traced from the aerial): dense grass, a short sward of green and drying blades and the
//   taller hay with its seed heads (the photo: late summer, knee-high, yellowing on the knolls), meadow flowers (yarrow,
//   St John's wort, knapweed); trodden short by the cross, the flagpole and the parked car; bare in the tracks' ruts,
//   a grassy hump between them.
// - The wood (broadleaved: beech, hornbeam, oak): the floor under last year's leaves, twigs and branches, fern clumps in
//   the shade, sparse grass rising to a grassy, bramble-grown edge.
// - Deadwood where a wood like this has it: fallen trunks, more in the old stands and on the steeper slopes
//   (windthrow: some with their root plate torn out of the ground), mossy on top, broken branch stubs.
// - Boulders where the ground is steep (the flysch sandstone of the Subcarpathian hills crops out on the slopes),
//   mossy, some in small outcrops; a few on the steepest banks of the meadow.
// - An easter egg deep in the wood, past the end of the track that climbs from the cross: a skeleton by a fallen
//   trunk, skulls lined up on a boulder.
// The ground cover is generated around the player in 16 m tiles (hash-seeded, the same each time) and only on this hill.

const HB = HILL_BOX, TS = 16;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function hash(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function grad(x, z) { return [(heightAt(x + 2, z) - heightAt(x - 2, z)) / 4, (heightAt(x, z + 2) - heightAt(x, z - 2)) / 4]; }
// the wood's ground: its stands, and the cells cleared of generated trees for a fallen trunk or a boulder (their floor stays)
const CLEARED = new Set();
function wood(x, z) {
  if (forestCode(x, z)) return true;
  const F = GEO.forest; return CLEARED.has(Math.round((z + F.ext) / F.step) * F.n + Math.round((x + F.ext) / F.step));
}
// 0 deep in the wood .. 1 at its edge
function forestEdge(x, z) {
  let e = 0;
  for (const [d, w] of [[4, 1], [9, 0.55]]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!wood(x + a * d, z + b * d)) e = Math.max(e, w);
  return e;
}

// ------------------------------------------------------------------ what may grow where
// 1 m raster over the hill: roads (their width + 0.6 m), buildings (+1.2 m), the cross's slab, the flagpole, the car
let BL = null, SP = null, EGG = null;
function blockRaster() {
  const x0 = HB.x0, z0 = HB.z0, W = Math.ceil(HB.x1 - x0) + 1, H = Math.ceil(HB.z1 - z0) + 1, R = new Uint8Array(W * H);
  const fill = (ax0, ax1, az0, az1, fn) => {
    for (let j = Math.max(0, Math.floor(az0 - z0)); j <= Math.min(H - 1, Math.ceil(az1 - z0)); j++)
      for (let i = Math.max(0, Math.floor(ax0 - x0)); i <= Math.min(W - 1, Math.ceil(ax1 - x0)); i++) if (!R[j * W + i] && fn(x0 + i, z0 + j)) R[j * W + i] = 1;
  };
  for (const r of GEO.roads || []) {
    if (r.own || r.tu) continue;
    const hw = r.w / 2 + 0.6;
    for (let k = 0; k + 3 < r.p.length; k += 2) {
      const ax = r.p[k], az = r.p[k + 1], bx = r.p[k + 2], bz = r.p[k + 3];
      if (Math.max(ax, bx) < x0 - hw || Math.min(ax, bx) > HB.x1 + hw || Math.max(az, bz) < z0 - hw || Math.min(az, bz) > HB.z1 + hw) continue;
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      fill(Math.min(ax, bx) - hw, Math.max(ax, bx) + hw, Math.min(az, bz) - hw, Math.max(az, bz) + hw,
        (x, z) => { const t = clamp01(((x - ax) * ex + (z - az) * ez) / l2); return Math.hypot(x - ax - ex * t, z - az - ez * t) <= hw; });
    }
  }
  for (const b of GEO.buildings || []) {
    const P = []; let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) { P.push([b.p[i], b.p[i + 1]]); bx0 = Math.min(bx0, b.p[i]); bx1 = Math.max(bx1, b.p[i]); bz0 = Math.min(bz0, b.p[i + 1]); bz1 = Math.max(bz1, b.p[i + 1]); }
    if (bx1 < x0 || bx0 > HB.x1 || bz1 < z0 || bz0 > HB.z1) continue;
    fill(bx0 - 1.2, bx1 + 1.2, bz0 - 1.2, bz1 + 1.2, (x, z) => inPoly(P, x, z) || polyDist(P, x, z) < 1.2);
  }
  if (SP) {
    const [cx, cz] = [SP.cross.x, SP.cross.z];
    fill(cx - 5, cx + 5, cz - 5, cz + 5, (x, z) => Math.hypot(x - cx, z - cz) < 4.8);
    fill(SP.pole[0] - 1, SP.pole[0] + 1, SP.pole[1] - 1, SP.pole[1] + 1, (x, z) => Math.hypot(x - SP.pole[0], z - SP.pole[1]) < 0.7);
    const [ax, az] = SP.car, [hx, hz] = SP.h;
    fill(ax - 3, ax + 3, az - 3, az + 3, (x, z) => { const dx = x - ax, dz = z - az; return Math.abs(dx * hx + dz * hz) < 2.4 && Math.abs(dx * hz - dz * hx) < 1.05; });
  }
  return { x0, z0, W, H, R };
}
const blocked = (x, z) => { const i = Math.round(x - BL.x0), j = Math.round(z - BL.z0); return i < 0 || j < 0 || i >= BL.W || j >= BL.H || BL.R[j * BL.W + i] === 1; };
// trodden short: by the cross, around the flagpole and the parked car (the photo's foreground)
function trodden(x, z) {
  if (!SP) return false;
  return Math.hypot(x - SP.cross.x, z - SP.cross.z) < 9 || Math.hypot(x - SP.pole[0], z - SP.pole[1]) < 9 || Math.hypot(x - SP.cam[0], z - SP.cam[1]) < 9;
}
// the ground at (x, z): null (nothing grows), or { forest, edge, tk (plant scale over a track: 0 in the ruts) }
function site(x, z) {
  if (x < HB.x0 || x > HB.x1 || z < HB.z0 || z > HB.z1 || blocked(x, z)) return null;
  if (EGG && Math.hypot(x - EGG.x, z - EGG.z) < EGG.clear) return null;
  const f = wood(x, z);
  if (!f && hillOpen(x, z) + 0.35 * (valueNoise2(x, z, 6, 41) - 0.5) < 0.5) return null;
  let tk = 1, onTrack = false;
  const t = trackAt(x, z);
  if (t && t.d < 2) { const a = Math.abs(t.o); onTrack = a < 1.6; tk = a < 0.42 ? 0.55 : a < 1.1 ? 0 : a < 1.6 ? 0.5 : 1; }
  return { forest: !!f, edge: f ? forestEdge(x, z) : 0, tk, onTrack };
}

// ------------------------------------------------------------------ textures (canvas, generated once)
function grassTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(7);
  g.clearRect(0, 0, W, H);
  const blade = (x, h, lean, w, c0, c1, tip) => {
    const grd = g.createLinearGradient(0, H, 0, H - h); grd.addColorStop(0, c0); grd.addColorStop(0.55, c1); grd.addColorStop(1, tip);
    g.fillStyle = grd; g.beginPath(); g.moveTo(x - w, H);
    g.quadraticCurveTo(x - w * 0.5 + lean * 0.35, H - h * 0.55, x + lean, H - h);
    g.quadraticCurveTo(x + w * 0.5 + lean * 0.35, H - h * 0.55, x + w, H); g.closePath(); g.fill();
  };
  for (let i = 0; i < 170; i++) blade(4 + R() * (W - 8), 45 + R() * 85, (R() - 0.5) * 50, 2 + R() * 2.2, '#22371a', '#3b5826', '#5d7d34');   // the sward
  for (let i = 0; i < 120; i++) {
    const dry = R() < 0.42, h = 115 + R() * 135;
    blade(6 + R() * (W - 12), h, (R() - 0.5) * 70, 1.8 + R() * 2.2, dry ? '#46502a' : '#29441b', dry ? '#8d8748' : '#557a2e', dry ? '#cdbd86' : '#88a24a');
  }
  for (let i = 0; i < 34; i++) {                                                     // stems with their panicles
    const x = 10 + R() * (W - 20), top = H - (175 + R() * 76), lean = (R() - 0.5) * 30;
    g.strokeStyle = R() < 0.5 ? '#8f8a52' : '#6f7d3c'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + lean * 0.4, (H + top) / 2, x + lean, top); g.stroke();
    for (let k = 0; k < 9; k++) {
      g.fillStyle = R() < 0.5 ? '#b9a978' : '#9d8d60';
      g.beginPath(); g.ellipse(x + lean + (R() - 0.5) * 8, top + k * 2.6, 1.6, 3.4, (R() - 0.5) * 0.8, 0, Math.PI * 2); g.fill();
    }
  }
  const t = tex(c); t.premultiplyAlpha = false; return t;
}
function flowerTexture() {
  const W = 128, c = canvas(W, W), g = c.getContext('2d'), R = rng(11);
  g.clearRect(0, 0, W, W);
  for (let i = 0; i < 9; i++) {
    const x = 10 + R() * (W - 20), top = 20 + R() * 50, kind = i % 3;
    g.strokeStyle = '#4f6a2c'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, W); g.lineTo(x + (R() - 0.5) * 10, top); g.stroke();
    for (let k = 0; k < 4; k++) { g.fillStyle = '#4a6a2a'; g.beginPath(); g.ellipse(x + (R() - 0.5) * 8, top + 30 + k * 14, 5, 1.6, R(), 0, Math.PI * 2); g.fill(); }
    if (kind === 0) for (let k = 0; k < 40; k++) { g.fillStyle = R() < 0.8 ? '#f1eee2' : '#d8d2bd'; g.beginPath(); g.arc(x + (R() - 0.5) * 16, top + (R() - 0.5) * 5, 1.6, 0, Math.PI * 2); g.fill(); }   // yarrow
    else if (kind === 1) for (let k = 0; k < 7; k++) { g.fillStyle = '#e8c52c'; g.beginPath(); g.arc(x + (R() - 0.5) * 14, top + (R() - 0.5) * 12, 2.6, 0, Math.PI * 2); g.fill(); }   // St John's wort
    else { g.fillStyle = '#8b4f9c'; g.beginPath(); g.arc(x, top, 4.5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#5a4a2a'; g.beginPath(); g.arc(x, top + 4, 3, 0, Math.PI * 2); g.fill(); }  // knapweed
  }
  const t = tex(c); t.premultiplyAlpha = false; return t;
}
function litterTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d'), R = rng(13);
  g.clearRect(0, 0, W, W);
  const cols = ['#5a4230', '#664a34', '#72563c', '#4e3a2a', '#7a5e40', '#46342a', '#624e3a', '#3e3024', '#6e5842', '#564a3a'];
  const rim = (a) => 100 + 18 * Math.sin(a * 5 + 1.3) + 7 * Math.sin(a * 11);
  g.fillStyle = '#46362a'; g.beginPath();                                         // the packed core stays opaque far off
  for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2, r = rim(a) - 22; g.lineTo(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r); }
  g.fill();
  for (let i = 0; i < 1500; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 124;
    if (r > rim(a)) continue;
    const x = W / 2 + Math.cos(a) * r, y = W / 2 + Math.sin(a) * r, L = 11 + R() * 13, oak = R() < 0.3;
    g.save(); g.translate(x, y); g.rotate(R() * Math.PI * 2);
    g.fillStyle = cols[Math.floor(R() * cols.length)];
    g.beginPath();
    if (oak) { for (let k = 0; k < 5; k++) g.ellipse(-L / 2 + (k + 0.5) * L / 5, (k % 2 ? 1 : -1) * L * 0.08, L * 0.13, L * 0.2, 0, 0, Math.PI * 2); }
    else g.ellipse(0, 0, L / 2, L * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(45,28,14,0.55)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
    g.restore();
  }
  for (let i = 0; i < 16; i++) {                                                     // twigs and beech-nut husks
    const x = 40 + R() * 176, y = 40 + R() * 176, a = R() * Math.PI;
    g.strokeStyle = '#3e2e20'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke();
    g.fillStyle = '#4a3422'; g.beginPath(); g.arc(x + 20 * R(), y + 20 * R(), 2.5, 0, Math.PI * 2); g.fill();
  }
  const t = tex(c); t.premultiplyAlpha = false; return t;
}
function fernTexture() {
  const W = 64, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(17);
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#4c5a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
  for (let y = H - 14; y > 8; y -= 7) {
    const t = 1 - y / H, L = 27 * Math.pow(1 - t, 0.6) * (t < 0.12 ? t / 0.12 : 1) + 3;
    for (const s of [-1, 1]) {
      g.fillStyle = R() < 0.5 ? '#4f7f30' : '#62963c';
      g.save(); g.translate(W / 2, y); g.rotate(s * (Math.PI / 2 - 0.45));
      g.beginPath(); g.ellipse(0, -L / 2, 3.2, L / 2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  const t = tex(c); t.premultiplyAlpha = false; return t;
}
function brambleTexture() {
  const W = 256, c = canvas(W, W), g = c.getContext('2d'), R = rng(19);
  g.clearRect(0, 0, W, W);
  for (let i = 0; i < 9; i++) {
    const x0 = 20 + R() * 216, x1 = x0 + (R() - 0.5) * 180, top = 40 + R() * 90;
    g.strokeStyle = '#6b3b35'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, W); g.quadraticCurveTo((x0 + x1) / 2, top - 40, x1, top + 70); g.stroke();
    for (let k = 0; k < 9; k++) {
      const t = k / 9, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (x0 + x1) / 2 + t * t * x1, y = (1 - t) * (1 - t) * W + 2 * (1 - t) * t * (top - 40) + t * t * (top + 70);
      for (let l = 0; l < 3; l++) {
        g.fillStyle = ['#2d4a24', '#3a5a2a', '#4a6a30'][Math.floor(R() * 3)];
        g.save(); g.translate(x, y); g.rotate(l * 2.1 + R()); g.beginPath(); g.ellipse(0, -9, 5.5, 9, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
      if (R() < 0.18) { g.fillStyle = R() < 0.6 ? '#1a0f1f' : '#7a1a22'; g.beginPath(); g.arc(x + 6, y + 4, 3.2, 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = tex(c); t.premultiplyAlpha = false; return t;
}
function rockTexture() {
  const W = 128, c = canvas(W, W), g = c.getContext('2d', { willReadFrequently: true }), R = rng(23);
  g.fillStyle = '#9a9488'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 260; i++) { const v = 120 + R() * 60 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 16},0.35)`; g.beginPath(); g.arc(R() * W, R() * W, 2 + R() * 9, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(60,56,50,0.55)'; g.lineWidth = 1; g.beginPath(); let x = R() * W, y = R() * W; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = R() < 0.6 ? 'rgba(190,196,160,0.7)' : 'rgba(150,160,120,0.6)'; g.beginPath(); g.arc(R() * W, R() * W, 1 + R() * 3.5, 0, Math.PI * 2); g.fill(); }   // lichen
  const d = g.getImageData(0, 0, W, W), a = d.data; for (let i = 0; i < a.length; i += 4) { const n = (R() - 0.5) * 24; a[i] += n; a[i + 1] += n; a[i + 2] += n; } g.putImageData(d, 0, 0);
  return tex(c, { repeat: true });
}
function woodEndTexture() {
  const W = 64, c = canvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#b89a72'; g.fillRect(0, 0, W, W);
  for (let r = 3; r < 31; r += 2.2) { g.strokeStyle = `rgba(110,80,50,${0.25 + (r % 4) * 0.05})`; g.lineWidth = 1; g.beginPath(); g.arc(32 + Math.sin(r) * 0.8, 32, r, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(60,40,24,0.7)'; g.lineWidth = 1.2; for (const a of [0.4, 2.1, 4.0]) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); g.stroke(); }
  g.strokeStyle = '#4a3624'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 30.5, 0, Math.PI * 2); g.stroke();
  return tex(c);
}

// ------------------------------------------------------------------ plant geometries (shared by all tiles)
// three crossed vertical cards, w x 1 m, normals up (lit like a sward, not like panels)
function starGeo(w = 1) {
  const qs = [];
  for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) {
    const g = new THREE.PlaneGeometry(w, 1); g.translate(0, 0.47, 0); g.rotateY(a); qs.push(g);
  }
  const g = mergeGeometries(qs), n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// a fern clump: 8 arching fronds, 1 m long
function fernGeo() {
  const pos = [], uv = [], nrm = [], idx = [], R = rng(29);
  for (let f = 0; f < 8; f++) {
    const a = f / 8 * Math.PI * 2 + R() * 0.4, rise = 0.6 + R() * 0.3, w = 0.19 + R() * 0.05, base = pos.length / 3;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, r = t * (0.75 + R() * 0.1), y = Math.sin(t * Math.PI * 0.8) * rise * 0.75 + (t > 0.8 ? -(t - 0.8) * 0.4 : 0), ww = w * (1 - t * 0.5);
      pos.push(dx * r - px * ww, y, dz * r - pz * ww, dx * r + px * ww, y, dz * r + pz * ww);
      uv.push(0, t, 1, t); nrm.push(0, 1, 0, 0, 1, 0);
      if (k < 5) { const b = base + k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
// a fallen branch, 1 m along +x, with two twigs
function branchGeo() {
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  const stick = (a, b, r0, r1) => {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize())); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    parts.push(g);
  };
  stick([-0.5, 0.03, 0], [0.5, 0.02, 0.03], 0.03, 0.012);
  stick([-0.1, 0.03, 0.01], [0.2, 0.06, 0.22], 0.012, 0.005);
  stick([0.2, 0.025, 0.02], [0.45, 0.05, -0.16], 0.01, 0.004);
  return mergeGeometries(parts);
}

// ------------------------------------------------------------------ the ground cover around the player
const QUAL = { 'Scăzută': { d: 0.4, rn: 14, rf: 30, rv: 45 }, 'Medie': { d: 0.65, rn: 20, rf: 42, rv: 70 }, 'Înaltă': { d: 1, rn: 26, rf: 55, rv: 110 }, 'Ultra': { d: 1.35, rn: 32, rf: 70, rv: 140 } };

export function buildHillwood(scene, world, quality) {
  if (!GEO.forestBits || !BL) return { update() {}, count: () => 0 };
  const Q = QUAL[quality.label] ?? QUAL['Înaltă'];
  const plant = (map, amp, freq, extra = {}) => addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, ...extra }), amp, freq);
  const Mt = {
    grass: plant(grassTexture(), 0.2, 1.7), flower: plant(flowerTexture(), 0.16, 1.5), fern: plant(fernTexture(), 0.05, 1.1),
    bramble: plant(brambleTexture(), 0.03, 1.2),
    litter: new THREE.MeshStandardMaterial({ map: litterTexture(), alphaTest: 0.35, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    branch: M.bark,
  };
  const G = { grass: starGeo(1), flower: starGeo(0.6), fern: fernGeo(), bramble: starGeo(1.4), litter: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), branch: branchGeo() };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3(), col = new THREE.Color();
  const tiles = new Map();
  let live = 0, last = null;
  // lv 0: near (the sward, flowers, twigs), 1: far (the hay, the wood's floor), 2: the farthest ring (big, sparse hay)
  const buildTile = (ti, tj, lv) => {
    const near = lv === 0, vfar = lv === 2;
    const x0 = ti * TS, z0 = tj * TS, R = rng(Math.imul(ti, 73856093) ^ Math.imul(tj, 19349663));
    const L = { grass: [], flower: [], fern: [], bramble: [], litter: [], branch: [] };
    // a coarse look first: nothing grows on this tile at all?
    let any = false;
    for (let a = 0; a < 4 && !any; a++) for (let b = 0; b < 4 && !any; b++) if (site(x0 + 2 + a * 4, z0 + 2 + b * 4)) any = true;
    if (any) {
      const area = TS * TS;
      // grass: the sward and the hay on the meadows, sparse tufts in the wood rising to its edge
      const nG = Math.round(area * (near ? 8.5 : vfar ? 0.4 : 1.25) * Q.d);
      for (let k = 0; k < nG; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R(), r2 = R(), r3 = R();
        if (!s || !s.tk) continue;
        let h, w, c;
        if (!s.forest) {
          const patch = 0.75 + 0.5 * valueNoise2(x, z, 9, 5), dry = valueNoise2(x, z, 14, 77);
          const tall = !near || (r1 < 0.3 && s.tk === 1 && !trodden(x, z));
          if (tall) { h = (0.55 + 0.4 * r2) * patch * (near ? 1 : 1.12); w = h * (near ? 1.0 : vfar ? 2.2 : 1.35); }
          else { h = (0.24 + 0.18 * r2) * s.tk; w = 0.95 + 0.4 * r3; }
          c = [0.8 + 0.28 * dry, 0.9 + 0.08 * dry, 0.62 + 0.1 * dry];
          if (near && trodden(x, z)) {                                                // trodden: half as thick, short, straw-dry
            if (r3 < 0.5) continue;
            h *= 0.65; c = [1.05, 0.96, 0.7];
          }
        } else {
          if (vfar || r1 > (near ? 0.05 + 0.4 * s.edge : 0.3 * Math.max(0, s.edge - 0.5)) * 1.2) continue;
          h = (0.25 + 0.22 * r2) * s.tk; w = 0.8; c = [0.62, 0.78, 0.5];
        }
        const v = 0.88 + 0.24 * r3;
        L.grass.push({ x, z, ry: r3 * 6.283, s: [w, h, w], c: [c[0] * v, c[1] * v, c[2] * v] });
      }
      // meadow flowers, in patches
      if (near) for (let k = 0, n = Math.round(area * 0.09 * Q.d); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || s.forest || s.onTrack || trodden(x, z) || valueNoise2(x, z, 12, 91) < 0.55) continue;
        const h = 0.4 + 0.3 * r1; L.flower.push({ x, z, ry: r1 * 6.283, s: [h, h, h], c: [1, 1, 1] });
      }
      // the wood's floor: leaf litter all over, twigs and branches, ferns in the shade, brambles at the edge
      if (!vfar) for (let k = 0, n = Math.round(area * 0.5); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R(), r2 = R();
        if (!s || !s.forest || s.onTrack || r1 > 1 - 0.45 * s.edge * s.edge) continue;
        const sz = 2.0 + 1.4 * r2, v = 0.62 + 0.26 * r1;
        L.litter.push({ x, z, ry: r2 * 6.283, s: [sz, 1, sz], c: [v, v * 0.97, v * 0.92], flat: true });
      }
      if (near) for (let k = 0, n = Math.round(area * 0.05); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || !s.forest || s.onTrack) continue;
        const sc = 0.5 + 1.6 * r1 * r1; L.branch.push({ x, z, ry: R() * 6.283, s: [sc, sc, sc], c: [0.8, 0.78, 0.74], flat: true, lift: 0.01 });
      }
      if (!vfar) for (let k = 0, n = Math.round(area * (near ? 0.2 : 0.1) * Q.d); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || !s.forest || s.onTrack) continue;
        const patch = valueNoise2(x, z, 11, 19);
        if (r1 > clamp01((patch - 0.45) * 2.5) * (0.35 + 0.65 * (1 - s.edge))) continue;
        const sc = 0.75 + 0.5 * R(), g = 0.85 + 0.25 * R(); L.fern.push({ x, z, ry: R() * 6.283, s: [sc, sc, sc], c: [0.9 * g, g, 0.85 * g] });
      }
      if (!vfar) for (let k = 0, n = Math.round(area * 0.14 * Q.d); k < n; k++) {
        const x = x0 + R() * TS, z = z0 + R() * TS, s = site(x, z), r1 = R();
        if (!s || s.onTrack || trodden(x, z)) continue;
        const nearWood = s.forest ? s.edge >= 0.55 : (wood(x + 5, z) || wood(x - 5, z) || wood(x, z + 5) || wood(x, z - 5));
        if (!nearWood || r1 > 0.55) continue;
        const h = 0.6 + 0.6 * R(), w = h * (1.1 + 0.5 * R()); L.bramble.push({ x, z, ry: R() * 6.283, s: [w, h, w], c: [1, 1, 1] });
      }
    }
    const grp = new THREE.Group();
    let n = 0;
    for (const key of Object.keys(L)) {
      const list = L[key]; if (!list.length) continue;
      const im = new THREE.InstancedMesh(G[key], Mt[key], list.length);
      list.forEach((e, i) => {
        const y = heightAt(e.x, e.z);
        qy.setFromAxisAngle(up, e.ry);
        if (e.flat) {                                                                 // lying on the slope
          const [gx, gz] = grad(e.x, e.z); nv.set(-gx, 1, -gz).normalize(); q.setFromUnitVectors(up, nv).multiply(qy);
          p.set(e.x, y + (e.lift ?? 0.025), e.z);
        } else { q.copy(qy); p.set(e.x, y - 0.02, e.z); }
        im.setMatrixAt(i, m4.compose(p, q, sv.set(...e.s)));
        im.setColorAt(i, col.setRGB(e.c[0], e.c[1], e.c[2]));
      });
      im.computeBoundingSphere();
      im.receiveShadow = true; im.castShadow = key === 'branch'; im.userData.noAO = true;
      grp.add(im); n += list.length;
    }
    grp.userData.ueSkip = 'hillwood';            // streamed around the player: not part of the Unreal export
    scene.add(grp);
    live += n;
    return { grp, lv, n, cx: x0 + TS / 2, cz: z0 + TS / 2 };
  };
  const drop = (t) => { scene.remove(t.grp); t.grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); live -= t.n; };
  return {
    count: () => live,
    update(cam) {
      const RF = Q.rv, RN = Q.rn;
      if (cam.x < HB.x0 - RF || cam.x > HB.x1 + RF || cam.z < HB.z0 - RF || cam.z > HB.z1 + RF) {
        for (const t of tiles.values()) drop(t); tiles.clear(); last = null; return;
      }
      const jump = !last || Math.hypot(cam.x - last.x, cam.z - last.z) > 30;          // a teleport (photo views, respawn)
      last = { x: cam.x, z: cam.z };
      const t0 = performance.now(), budget = jump ? 1e9 : 10;
      const ci = Math.floor(cam.x / TS), cj = Math.floor(cam.z / TS), K = Math.ceil(RF / TS) + 1;
      for (let dj = -K; dj <= K; dj++) for (let di = -K; di <= K; di++) {
        const ti = ci + di, tj = cj + dj, cx = (ti + 0.5) * TS, cz = (tj + 0.5) * TS, d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > RF + TS * 0.7) continue;
        const lv = d < RN + TS * 0.7 ? 0 : d < Q.rf + TS * 0.7 ? 1 : 2, key = ti + ',' + tj, old = tiles.get(key);
        if (old && old.lv === lv) continue;
        if (performance.now() - t0 > budget) continue;
        if (old) drop(old);
        tiles.set(key, buildTile(ti, tj, lv));
      }
      for (const [key, t] of tiles) if (Math.hypot(t.cx - cam.x, t.cz - cam.z) > RF + TS * 1.5) { drop(t); tiles.delete(key); }
    },
  };
}

// ------------------------------------------------------------------ deadwood, boulders and the easter egg (static)
let MS = null;
function staticMats() {
  if (MS) return MS;
  const log = M.bark.clone(); log.vertexColors = true; log.color = new THREE.Color(0xd2c8ba);
  const soil = M.soil ? M.soil.clone() : new THREE.MeshStandardMaterial({ color: 0x6a5846, roughness: 1 }); soil.vertexColors = true;
  MS = {
    log, soil,
    end: new THREE.MeshStandardMaterial({ map: woodEndTexture(), roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.93 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd9d0bb, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 1 }),
  };
  return MS;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UP = V3(0, 1, 0);
function cyl(a, b, r0, r1, seg = 8, open = false) {
  const d = b.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r1, r0, L, seg, Math.max(1, Math.round(L / 1.5)), open);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function ellipsoid(c, rx, ry, rz, seg = 10) { const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2)); g.scale(rx, ry, rz); g.translate(c.x, c.y, c.z); return g; }
// vertex colours: mossy where the surface faces up
function mossy(g, base, moss, k = 0.45, seed = 1) {
  const n = g.attributes.normal, pp = g.attributes.position, c = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const w = clamp01((n.getY(i) - k) / 0.35) * (0.55 + 0.45 * valueNoise2(pp.getX(i) * 3, pp.getZ(i) * 3, 1, seed));
    for (let e = 0; e < 3; e++) c[i * 3 + e] = base[e] * (1 - w) + moss[e] * w;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// clear the forest raster (no generated trees through a trunk or a boulder)
function clearForest(x, z, r) {
  const F = GEO.forest, B = GEO.forestBits;
  for (let j = Math.floor((z - r + F.ext) / F.step); j <= Math.ceil((z + r + F.ext) / F.step); j++) for (let i = Math.floor((x - r + F.ext) / F.step); i <= Math.ceil((x + r + F.ext) / F.step); i++) {
    if (i < 0 || j < 0 || i >= F.n || j >= F.n || Math.hypot(-F.ext + i * F.step - x, -F.ext + j * F.step - z) > r) continue;
    const k = j * F.n + i;
    if ((B[k >> 2] >> ((k & 3) << 1)) & 3) { CLEARED.add(k); B[k >> 2] &= ~(3 << ((k & 3) << 1)); }
  }
}
function fallenTrunk(B, world, Mt, x, z, ux, uz, L, r, R, rootPlate) {
  const ax = x - ux * L / 2, az = z - uz * L / 2, bx = x + ux * L / 2, bz = z + uz * L / 2, rt = r * 0.55;
  // resting on the ground: the straight trunk lifted until it is at most 40% sunk anywhere along it
  let lift = -Infinity;
  const ya = heightAt(ax, az), yb = heightAt(bx, bz);
  for (let k = 0; k <= 8; k++) { const t = k / 8, rr = r + (rt - r) * t; lift = Math.max(lift, heightAt(ax + (bx - ax) * t, az + (bz - az) * t) + rr * 0.6 - (ya + (yb - ya) * t)); }
  const A = V3(ax, ya + lift, az), Bv = V3(bx, yb + lift + (rt - r) * 0.1, bz);
  B.geo(Mt.log, mossy(cyl(A, Bv, r, rt, 10, true), [0.82, 0.78, 0.72], [0.42, 0.52, 0.26], 0.3, 7), null, null, { vcol: true });
  const dir = Bv.clone().sub(A).normalize();
  const end = (c, rr, n) => { const g = new THREE.CircleGeometry(rr, 10); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), n)); g.translate(c.x, c.y, c.z); B.geo(Mt.end, g); };
  end(Bv, rt, dir);
  // broken branch stubs
  for (let k = 0; k < 2 + Math.floor(R() * 3); k++) {
    const t = 0.35 + R() * 0.6, c = A.clone().lerp(Bv, t), a = R() * Math.PI * 2, s = V3(-uz * Math.cos(a), Math.abs(Math.sin(a)) + 0.3, ux * Math.cos(a)).normalize();
    const rb = r * (0.2 + 0.15 * R()), len = 0.5 + R() * 1.4;
    B.geo(Mt.log, mossy(cyl(c, c.clone().addScaledVector(s, len), rb, rb * 0.5, 6), [0.82, 0.78, 0.72], [0.42, 0.52, 0.26], 0.5, 9), null, null, { vcol: true });
  }
  let y0 = Math.min(ya, yb) - 1, y1 = Math.max(A.y, Bv.y) + r;
  if (rootPlate) {
    // windthrow: the root plate torn up at the base, soil and roots, standing on edge
    const pr = r * 4.2 + 0.4, pc = A.clone().addScaledVector(dir, -0.2); pc.y = heightAt(pc.x, pc.z) + pr * 0.6;
    const g = new THREE.CylinderGeometry(1, 1, 1, 22, 1, false), pp = g.attributes.position, so = R() * 20;
    for (let i = 0; i < pp.count; i++) {                                              // a ragged lens of soil and roots
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), rr = Math.hypot(x, z), an = Math.atan2(z, x);
      const f = pr * (0.72 + 0.45 * valueNoise2(an * 1.7 + so, 0.5, 1, 31));
      pp.setXYZ(i, x * f, y * (0.4 + 0.5 * (1 - rr * 0.75)) * (0.8 + 0.4 * valueNoise2(x * 3 + so, z * 3, 1, 33)), z * f);
    }
    g.computeVertexNormals();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir)); g.translate(pc.x, pc.y, pc.z);
    const cc = new Float32Array(pp.count * 3);
    for (let i = 0; i < pp.count; i++) { const v = 0.42 + 0.34 * valueNoise2(pp.getX(i) * 1.5, pp.getY(i) * 1.5 + pp.getZ(i), 1, 5); cc.set([v, v * 0.88, v * 0.74], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    B.geo(Mt.soil, g, null, null, { vcol: true });
    const side = V3(-uz, 0, ux);
    for (let k = 0; k < 14; k++) {                                                    // torn roots sticking out, bent
      const an = k / 14 * Math.PI * 2 + R() * 0.3, rr = pr * (0.55 + 0.4 * R());
      const s0 = side.clone().multiplyScalar(Math.cos(an) * rr).add(V3(0, Math.sin(an) * rr, 0)).add(pc).addScaledVector(dir, -0.15);
      const out = V3(0, 0, 0).addScaledVector(side, Math.cos(an)).add(V3(0, Math.sin(an), 0)).addScaledVector(dir, -0.6 - R() * 0.8).normalize();
      const len = 0.6 + R() * 1.1, m = s0.clone().addScaledVector(out, len * 0.55).add(V3(0, (R() - 0.5) * 0.3, 0)), e = m.clone().addScaledVector(out, len * 0.45).add(V3(0, -0.15 - R() * 0.3, 0));
      const rr0 = 0.035 + R() * 0.05;
      B.geo(Mt.log, cyl(s0, m, rr0, rr0 * 0.6, 5)); B.geo(Mt.log, cyl(m, e, rr0 * 0.6, rr0 * 0.25, 5));
    }
    world.addStatic(new world.Box(pc.x, pc.z, 0.35, pr * 0.9, Math.atan2(-uz, ux), pc.y - pr, pc.y + pr, 'rootplate'));
    y1 = Math.max(y1, pc.y + pr);
  }
  world.addStatic(new world.Box(x, z, L / 2, r * 0.95, Math.atan2(-uz, ux), y0, Math.max(A.y, Bv.y) + r, 'log'));
  for (let t = -L / 2; t <= L / 2; t += 2.5) clearForest(x + ux * t, z + uz * t, 2.2);     // a corridor along the trunk
}
const ROCK_SHAPES = [];
function rockShape(k, detail = 2) {
  const key = k * 3 + detail;
  if (ROCK_SHAPES[key]) return ROCK_SHAPES[key];
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, R = rng(100 + k);
  const o = [R() * 50, R() * 50, R() * 50];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = valueNoise2(x * 1.3 + o[0], z * 1.3 + y * 0.7 + o[1], 1, k) * 0.34 + valueNoise2(x * 3.1 + o[2], y * 3.1 + z, 1, k + 9) * 0.12;
    const f = 0.8 + n, flat = y > 0.35 ? 0.85 : 1;                                   // a flatter, weathered top
    p.setXYZ(i, x * f, y * f * 0.62 * flat, z * f * (0.85 + 0.2 * (k % 3) / 2));
  }
  g.computeVertexNormals();
  return (ROCK_SHAPES[key] = g);
}
function boulder(B, world, Mt, x, z, s, R, opts = {}) {
  const g = rockShape(Math.floor(R() * 6), s < 0.8 ? 1 : 2).clone(), sy = s * (0.8 + 0.4 * R());   // small ones coarser
  g.scale(s * (0.9 + 0.3 * R()), sy, s * (0.8 + 0.4 * R()));
  g.rotateY(R() * Math.PI * 2);
  const [gx, gz] = grad(x, z), y = heightAt(x, z) - sy * 0.62 * (opts.sink ?? 0.32);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, V3(-gx * 0.6, 1, -gz * 0.6).normalize()));
  g.translate(x, y, z);
  const t = 0.9 + 0.15 * R();
  B.geo(Mt.rock, mossy(g, [0.6 * t, 0.57 * t, 0.52 * t], [0.28, 0.38, 0.17], 0.5, 13), null, null, { vcol: true });
  if (s > 0.45) world.addStatic(new world.Box(x, z, s * 0.8, s * 0.8, 0, y - 1, y + sy * 0.62 * 1.1, 'rock'));
  if (s > 1.1) clearForest(x, z, s + 1);
  g.computeBoundingBox();
  return g.boundingBox.max.y;
}

// the skull: local X = the face's direction, Y = the top of the head, Z = to its left; placed by a matrix
function skull(B, Mt, mtx) {
  const bone = [], dark = [];
  bone.push(ellipsoid(V3(-0.015, 0.02, 0), 0.1, 0.085, 0.076, 14));                   // the cranium
  bone.push(ellipsoid(V3(0.062, -0.038, 0), 0.046, 0.055, 0.058, 10));                // the face
  for (const s of [-1, 1]) {
    dark.push(ellipsoid(V3(0.099, -0.008, s * 0.03), 0.014, 0.021, 0.02, 8));         // the orbits
    bone.push(ellipsoid(V3(0.07, -0.045, s * 0.054), 0.022, 0.014, 0.014, 6));        // cheekbones
  }
  dark.push(ellipsoid(V3(0.108, -0.048, 0), 0.008, 0.017, 0.009, 6));                 // the nose
  for (let k = -3; k <= 3; k++) { const a = k * 0.28, g = new THREE.BoxGeometry(0.007, 0.012, 0.008); g.translate(0.094 + 0.012 * Math.cos(a) - 0.012, -0.085, 0.03 * Math.sin(a) * 1.2); bone.push(g); }
  const jaw = [V3(-0.02, -0.07, 0.048), V3(0.0, -0.11, 0.046), V3(0.06, -0.122, 0.036), V3(0.092, -0.112, 0)];
  for (const s of [-1, 1]) for (let k = 0; k < jaw.length - 1; k++) { const a = jaw[k].clone(), b = jaw[k + 1].clone(); a.z *= s; b.z *= s; bone.push(cyl(a, b, 0.011, 0.011, 6)); }
  for (const g of bone) { g.applyMatrix4(mtx); B.geo(Mt.bone, g); }
  for (const g of dark) { g.applyMatrix4(mtx); B.geo(Mt.dark, g, null, null, { noCast: true }); }
}
// the skeleton, lying on its back: local X towards the head, Y up, Z to its left; the pelvis at the origin
function skeleton(B, Mt, mtx, R) {
  const bone = [];
  const b = (a, c, r0, r1 = r0, knob = true) => { bone.push(cyl(a, c, r0, r1, 6)); if (knob) { bone.push(ellipsoid(a, r0 * 1.6, r0 * 1.4, r0 * 1.6, 6)); bone.push(ellipsoid(c, r1 * 1.6, r1 * 1.4, r1 * 1.6, 6)); } };
  for (let k = 0; k < 17; k++) { const x = 0.04 + k * 0.037; bone.push(ellipsoid(V3(x, 0.035 + 0.01 * Math.sin(k * 0.4), 0), 0.014, 0.02, 0.022, 6)); }   // the spine
  for (let i = 0; i < 10; i++) {                                                     // the ribs, fallen in a little
    const x = 0.58 - i * 0.03, w = 0.1 + 0.05 * Math.sin((i + 2) / 12 * Math.PI), sink = 0.7 + 0.3 * R();
    for (const s of [-1, 1]) {
      const P = [V3(x, 0.045, s * 0.015), V3(x - 0.02, 0.04, s * w), V3(x - 0.05, 0.1 * sink, s * (w * 0.9)), V3(x - 0.075, 0.14 * sink, s * 0.03)];
      for (let k = 0; k < 3; k++) b(P[k], P[k + 1], 0.0075, 0.0075, false);
    }
  }
  bone.push(ellipsoid(V3(0.46, 0.12, 0), 0.08, 0.01, 0.02, 6));                       // the sternum
  for (const s of [-1, 1]) {
    b(V3(0.6, 0.08, s * 0.03), V3(0.62, 0.075, s * 0.17), 0.009);                     // clavicles
    bone.push(ellipsoid(V3(-0.02, 0.055, s * 0.09), 0.08, 0.03, 0.065, 8));            // the hip bones
    b(V3(0.6, 0.045, s * 0.19), V3(0.31, 0.04, s * 0.23), 0.017, 0.014);             // humerus
  }
  bone.push(ellipsoid(V3(0.0, 0.035, 0), 0.05, 0.025, 0.04, 8));                       // sacrum
  // the forearms and hands (the right one dragged aside, as animals do)
  const arm = (el, wr, s) => {
    b(el, wr, 0.011, 0.01); b(el.clone().add(V3(0, 0, s * 0.02)), wr.clone().add(V3(0, 0, s * 0.02)), 0.009, 0.008, false);
    const dir = wr.clone().sub(el).normalize();
    for (let f = 0; f < 5; f++) { const side = V3(-dir.z, 0, dir.x).multiplyScalar((f - 2) * 0.012); b(wr.clone().add(side), wr.clone().add(side).addScaledVector(dir, 0.07 + 0.02 * (f % 2)), 0.004, 0.003, false); }
  };
  arm(V3(0.31, 0.04, 0.23), V3(0.07, 0.035, 0.26), 1);
  arm(V3(0.31, 0.04, -0.23), V3(0.14, 0.03, -0.43), -1);
  // the legs, the left knee fallen out
  const leg = (hip, knee, ankle, s) => {
    b(hip, knee, 0.023, 0.02); bone.push(ellipsoid(knee.clone().add(V3(0, 0.02, 0)), 0.02, 0.012, 0.018, 6));
    b(knee, ankle, 0.019, 0.015); b(knee.clone().add(V3(0, 0, s * 0.03)), ankle.clone().add(V3(0, 0, s * 0.03)), 0.008, 0.007, false);
    for (let f = 0; f < 5; f++) b(ankle.clone().add(V3(-0.02, 0, (f - 2) * 0.014)), ankle.clone().add(V3(-0.17 + 0.02 * Math.abs(f - 2), -0.005, s * 0.02 + (f - 2) * 0.02)), 0.006, 0.004, false);
  };
  leg(V3(-0.04, 0.05, 0.1), V3(-0.45, 0.05, 0.22), V3(-0.86, 0.04, 0.2), 1);
  leg(V3(-0.04, 0.05, -0.1), V3(-0.48, 0.05, -0.13), V3(-0.9, 0.04, -0.14), -1);
  for (const g of bone) { g.applyMatrix4(mtx); B.geo(Mt.bone, g); }
  // its skull, face up, the top of the head away from the body, turned a little aside
  const sk = new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(1, 0, 0.25).normalize(), V3(0.25, 0, -1).normalize()).setPosition(0.8, 0.075, 0.02);
  skull(B, Mt, mtx.clone().multiply(sk));
}

export function buildHillwoodStatic(B, world) {
  if (!GEO.forestBits) return null;
  SP = drapelSpots();
  BL = blockRaster();
  const Mt = staticMats();
  B.cullFor.set(Mt.log, 500); B.cullFor.set(Mt.soil, 500); B.cullFor.set(Mt.end, 300); B.cullFor.set(Mt.rock, 700); B.cullFor.set(Mt.bone, 600); B.cullFor.set(Mt.dark, 600);
  // the easter egg's place: in the wood, off the track that climbs from the cross, 8 m before its end
  const tr = GEO.roads.find(r => r.id === 'drapel-forest-track');
  let egg = null;
  if (tr) {
    const L = (() => { let s = 0; for (let i = 2; i < tr.p.length; i += 2) s += Math.hypot(tr.p[i] - tr.p[i - 2], tr.p[i + 1] - tr.p[i - 1]); return s; })();
    const tp = trackPoint('drapel-forest-track', L - 8);
    if (tp) {
      const [px, pz] = tp.p, [tx, tz] = tp.t, nx = -tz, nz = tx;
      for (let d = 12; d <= 26 && !egg; d += 2) for (const s of [1, -1]) {
        const x = px + nx * d * s + tx * 4, z = pz + nz * d * s + tz * 4, [gx, gz] = grad(x, z);
        if (wood(x, z) && Math.hypot(gx, gz) < 0.2 && !(trackAt(x, z)?.d < 7) && !blocked(x, z)) { egg = { x, z, ux: tx, uz: tz }; break; }
      }
      if (!egg) egg = { x: px + nx * 14 + tx * 4, z: pz + nz * 14 + tz * 4, ux: tx, uz: tz };
    }
  }
  if (egg) EGG = { x: egg.x, z: egg.z, clear: 2.6 };
  const R = rng(2024);
  let nLogs = 0, nRocks = 0;
  const eggNear = (x, z, r) => egg && Math.hypot(x - egg.x, z - egg.z) < r;
  // fallen trunks: a 28 m grid over the wood, likelier in the old stands and on the slopes
  for (let j = Math.floor(HB.z0 / 28); j <= Math.floor(HB.z1 / 28); j++) for (let i = Math.floor(HB.x0 / 28); i <= Math.floor(HB.x1 / 28); i++) {
    const x = (i + 0.2 + 0.6 * hash(i, j, 1)) * 28, z = (j + 0.2 + 0.6 * hash(i, j, 2)) * 28;
    if (!wood(x, z) || forestEdge(x, z) > 0.6 || blocked(x, z) || trackAt(x, z)?.d < 6 || eggNear(x, z, 12)) continue;
    const [gx, gz] = grad(x, z), sl = Math.hypot(gx, gz), age = valueNoise2(x, z, 110, 9);
    if (hash(i, j, 3) > 0.14 + 0.22 * age + 0.3 * clamp01((sl - 0.12) / 0.2)) continue;
    // they fall downhill mostly (windthrow), across the contour on flat ground
    let a = sl > 0.08 ? Math.atan2(-gz, -gx) + (hash(i, j, 4) - 0.5) * 1.4 : hash(i, j, 4) * Math.PI * 2;
    const L = (6 + 8 * hash(i, j, 5)) * (0.7 + 0.5 * age), r = (0.14 + 0.14 * hash(i, j, 6)) * (0.8 + 0.5 * age);
    let ux = Math.cos(a), uz = Math.sin(a);
    // both ends on the wood's ground, clear of the tracks and roads
    const ok = (s) => { const px = x + ux * s * L / 2, pz = z + uz * s * L / 2; return wood(px, pz) && !blocked(px, pz) && !(trackAt(px, pz)?.d < 4); };
    if (!ok(1) || !ok(-1)) { a += Math.PI / 2; ux = Math.cos(a); uz = Math.sin(a); if (!ok(1) || !ok(-1)) continue; }
    fallenTrunk(B, world, Mt, x, z, ux, uz, L, r, R, r > 0.2 && hash(i, j, 7) < 0.5);
    nLogs++;
  }
  // boulders: where the ground is steep (outcrops of the flysch sandstone), a few anywhere in the wood, a few on the
  // steepest banks of the meadow (not in the photo's foreground)
  for (let j = Math.floor(HB.z0 / 13); j <= Math.floor(HB.z1 / 13); j++) for (let i = Math.floor(HB.x0 / 13); i <= Math.floor(HB.x1 / 13); i++) {
    const x = (i + 0.15 + 0.7 * hash(i, j, 11)) * 13, z = (j + 0.15 + 0.7 * hash(i, j, 12)) * 13;
    if (blocked(x, z) || trackAt(x, z)?.d < 3.5 || eggNear(x, z, 6)) continue;
    const f = wood(x, z), [gx, gz] = grad(x, z), deg = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
    let p = 0.03 + 0.5 * clamp01((deg - 12) / 9);
    if (!f) { if (hillOpen(x, z) < 0.5 || deg < 15 || (SP && Math.hypot(x - SP.cam[0], z - SP.cam[1]) < 150)) continue; p *= 0.35; }
    if (hash(i, j, 13) > p) continue;
    const n = deg > 17 && hash(i, j, 14) < 0.5 ? 2 + Math.floor(hash(i, j, 15) * 3) : 1;
    for (let k = 0; k < n; k++) {
      const s = (0.35 + 1.1 * hash(i, j, 20 + k) ** 1.6) * (1 + 0.4 * clamp01((deg - 14) / 8));
      const bx = x + (k ? (hash(i, j, 30 + k) - 0.5) * 5 : 0), bz = z + (k ? (hash(i, j, 40 + k) - 0.5) * 5 : 0);
      if (!blocked(bx, bz)) { boulder(B, world, Mt, bx, bz, s, R); nRocks++; }
    }
  }
  // the easter egg: the skeleton by a fallen beech, skulls on a boulder
  if (egg) {
    const { x, z, ux, uz } = egg, vx = -uz, vz = ux, y = heightAt(x, z), [gx, gz] = grad(x, z);
    clearForest(x, z, 7);
    fallenTrunk(B, world, Mt, x + vx * 1.5, z + vz * 1.5, ux, uz, 11, 0.3, R, true);
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, V3(-gx, 1, -gz).normalize());
    const body = new THREE.Matrix4().compose(V3(x - vx * 0.3, y + 0.005, z - vz * 0.3), tilt.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-uz, ux))), V3(1, 1, 1));
    skeleton(B, Mt, body, R);
    const rx = x - ux * 2.6 - vx * 1.8, rz = z - uz * 2.6 - vz * 1.8, top = boulder(B, world, Mt, rx, rz, 0.75, rng(7), { sink: 0.25 });
    for (let k = -1; k <= 1; k++) {                                                    // three skulls on the boulder, facing the path
      const sx = rx + vx * k * 0.24, sz = rz + vz * k * 0.24, face = V3(-vx, 0, -vz).applyAxisAngle(UP, k * 0.25);
      skull(B, Mt, new THREE.Matrix4().makeBasis(face, UP, face.clone().cross(UP)).setPosition(sx, top - 0.03 + 0.085, sz));      // right-handed: not mirrored
    }
    for (const [o, t] of [[3.2, 0.5], [3.9, -0.4]]) {                               // and two more in the leaves by the trunk's end
      const sx = x + ux * o + vx * (1.5 + t), sz = z + uz * o + vz * (1.5 + t), face = V3(ux, 0.4, uz).normalize().applyAxisAngle(UP, t * 2);
      const upv = V3(0, 1, 0).applyAxisAngle(face.clone().cross(UP).normalize(), 0.5);
      upv.addScaledVector(face, -upv.dot(face)).normalize();                          // orthonormal, right-handed
      skull(B, Mt, new THREE.Matrix4().makeBasis(face, upv, face.clone().cross(upv)).setPosition(sx, heightAt(sx, sz) + 0.06, sz));
    }
  }
  return { type: 'hillwood', name: 'Pădurea de pe dealul crucii', logs: nLogs, rocks: nRocks, egg: egg ? { x: egg.x, z: egg.z, r: 7, ux: egg.ux, uz: egg.uz } : null, bbox: null };
}
