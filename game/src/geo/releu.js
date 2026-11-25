import * as THREE from 'three';
import { GEO, heightAt, forestCode } from './data.js';
import { keepClear, keepClearArea } from './trees.js';
import { trackAt, trackPoint } from './drapel.js';
import { addHillBlock, SCENE_SPOT } from './hillwood.js';
import { M } from '../materials.js';

// (V120) The power of the commune of Poiana Câmpina, in the wood on the hill of the cross: the overhead transformer
// station that feeds it (a game's invention - no line is mapped on the hill - built as the real ones are). A PTA 20/0.4 kV
// on a single concrete pole (ST 123, Electrica 2010: its transformer 100 kVA, 845 kg): the 20 kV line ending on its top
// crossarm, the medium-voltage fuses and surge arresters under it, the transformer on its platform, and at a man's
// height the low-voltage distribution box (ST 35-JT, Distribuţie Energie Electrică România 2024):
//  - glass-fibre reinforced polyester (PAFS), IP 54, three compartments each with its own door, recessed, on hinges at
//    three points, opening to 120 degrees (3.6.2); two steel lifting rings on top, the earthing bolt underneath, the
//    GPRS antenna on its side, the intermediate box for the cables at its foot;
//  - the supply compartment: the main switch, a 3-pole withdrawable circuit breaker, 160 A for a 100 kVA transformer
//    (3.6.3, 4.2 g); the metering one: the 3-phase meter behind a glass window; the distribution one: the feeders'
//    MPR fuses (0.4 kV, 250 A), one per phase on each feeder (3.6.5), the single-line diagram in its holder inside the
//    door;
//  - a lamp that lights when any door is opened (3.5 t), fed upstream of the main switch with the box's own services
//    (4.1 f): it stays lit with the switch off;
//  - the public lighting's block (BMPT-IP) on a feeder of its own (4.1 c), here beside the box.
// Its doors stand open (the padlocks off, 3.5 u): the levers - the main switch, the fuses of each phase pulled or put
// back, the public lighting's switch - cut and give back the commune's power (main.js: E). Hidden in the wood ~13 m off
// the dirt track that climbs past the cross into it, the line crossing the track on its way down the hill.

let SPOT = null;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// where: along the track's stretch in the wood, 11-17 m to its side, the wood all round, the ground near level, away from
// the forest scene (hillwood.js) and the skeleton near the track's end
export function prepareReleu() {
  const tr = (GEO.roads || []).find(r => r.id === 'drapel-forest-track');
  if (!tr) return false;
  let L = 0;
  for (let i = 2; i < tr.p.length; i += 2) L += Math.hypot(tr.p[i] - tr.p[i - 2], tr.p[i + 1] - tr.p[i - 1]);
  const wood = (x, z, r) => { if (!forestCode(x, z)) return false; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!forestCode(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; } return true; };
  const slope = (x, z) => Math.hypot(heightAt(x + 3, z) - heightAt(x - 3, z), heightAt(x, z + 3) - heightAt(x, z - 3)) / 6;
  for (let s = L - 40; s > 25 && !SPOT; s -= 3) {
    const tp = trackPoint('drapel-forest-track', s);
    if (!tp) continue;
    const [px, pz] = tp.p, [tx, tz] = tp.t, nx = -tz, nz = tx;
    for (const d of [13, 15, 11, 17]) for (const sd of [1, -1]) {
      if (SPOT) break;
      const x = px + nx * d * sd, z = pz + nz * d * sd;
      if (!wood(x, z, 4) || !wood(x, z, 9) || slope(x, z) > 0.22 || trackAt(x, z) || Math.hypot(x - SCENE_SPOT.x, z - SCENE_SPOT.z) < 40) continue;
      // the line: from the station across the track to the poles beyond (none of them on a track)
      const vx = -nx * sd, vz = -nz * sd, poles = [d + 9, d + 49, d + 89].map(t => [x + vx * t, z + vz * t]);
      if (poles.some(([a, b]) => trackAt(a, b))) continue;
      SPOT = { x, z, vx, vz, poles, s, d };
    }
  }
  if (!SPOT) return false;
  const { x, z, vx, vz, poles } = SPOT, far = poles[poles.length - 1];
  // its clearing (no generated tree within 5 m), the line's corridor (5 m either side of its axis), and the hill's ground
  // cover (brambles, ferns, deadwood, boulders: hillwood.js) kept off the box's front and the poles' feet
  keepClear(x, z, 5);
  const ex = far[0] - x, ez = far[1] - z, l2 = ex * ex + ez * ez;
  const corridor = (m) => (a, b) => { const t = Math.max(0, Math.min(1, ((a - x) * ex + (b - z) * ez) / l2)); return Math.hypot(a - x - ex * t, b - z - ez * t) < m; };
  keepClearArea(Math.min(x, far[0]) - 6, Math.min(z, far[1]) - 6, Math.max(x, far[0]) + 6, Math.max(z, far[1]) + 6, corridor(5));
  addHillBlock(x - 3, x + 3, z - 3, z + 3, (a, b) => Math.hypot(a - x - vx * 0.8, b - z - vz * 0.8) < 2.2);
  for (const [a0, b0] of poles) addHillBlock(a0 - 1, a0 + 1, b0 - 1, b0 + 1, (a, b) => Math.hypot(a - a0, b - b0) < 0.7);
  return true;
}

// ------------------------------------------------------------------ textures (canvas)
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// the danger plate: white, the red lightning arrow, PERICOL DE MOARTE
const dangerTex = () => canvasTex(128, 160, (x, w, h) => {
  x.fillStyle = '#f1efe8'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#b81c1c'; x.lineWidth = 5; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = '#b81c1c'; x.beginPath();
  x.moveTo(74, 14); x.lineTo(42, 70); x.lineTo(62, 70); x.lineTo(46, 112); x.lineTo(88, 56); x.lineTo(68, 56); x.lineTo(90, 14); x.closePath(); x.fill();
  x.fillStyle = '#111'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center';
  x.fillText('PERICOL', 64, 134); x.fillText('DE MOARTE', 64, 151);
});
// the station's plate
const plateTex = () => canvasTex(256, 96, (x, w, h) => {
  x.fillStyle = '#e9e7df'; x.fillRect(0, 0, w, h); x.strokeStyle = '#222'; x.lineWidth = 4; x.strokeRect(3, 3, w - 6, h - 6);
  x.fillStyle = '#151515'; x.textAlign = 'center'; x.font = 'bold 30px sans-serif'; x.fillText('PTA 20/0,4 kV', 128, 40);
  x.font = 'bold 22px sans-serif'; x.fillText('100 kVA · POIANA CÂMPINA', 128, 76);
});
// a label for a control
const labelTex = (t, bg = '#f2f2ec', fg = '#111') => canvasTex(128, 48, (x, w, h) => {
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, h / 2 + 2);
});
// the single-line diagram in the distribution door's holder
const diagramTex = () => canvasTex(192, 256, (x, w, h) => {
  x.fillStyle = '#f6f4ec'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#1b1b1b'; x.fillStyle = '#1b1b1b'; x.lineWidth = 2; x.font = '11px sans-serif';
  x.fillText('SCHEMA MONOFILARĂ CD 1-3', 18, 18);
  x.beginPath(); x.arc(96, 46, 14, 0, Math.PI * 2); x.moveTo(110, 60); x.arc(96, 64, 14, 0, Math.PI * 2); x.stroke();
  x.fillText('20/0,4 kV 100 kVA', 118, 58);
  x.beginPath(); x.moveTo(96, 78); x.lineTo(96, 112); x.moveTo(88, 98); x.lineTo(104, 92); x.stroke();
  x.fillText('IG 160 A', 108, 100);
  x.beginPath(); x.moveTo(30, 120); x.lineTo(162, 120); x.stroke();
  for (const [u, t] of [[44, 'P1'], [80, 'P2'], [116, 'P3'], [152, 'IP']]) {
    x.beginPath(); x.moveTo(u, 120); x.lineTo(u, 200); x.stroke(); x.strokeRect(u - 5, 140, 10, 22);
    x.fillText(t, u - 8, 218);
  }
  x.fillText('MPR 250 A / fază', 40, 244);
});
// the meter's display behind its window
const meterTex = () => canvasTex(128, 96, (x, w, h) => {
  x.fillStyle = '#2b2e2c'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#98a48c'; x.fillRect(14, 16, 100, 34);
  x.fillStyle = '#1d231b'; x.font = 'bold 24px monospace'; x.fillText('048213', 20, 42);
  x.fillStyle = '#d8d8d0'; x.font = '10px sans-serif'; x.fillText('3x230/400 V  5(6) A', 14, 70); x.fillText('kWh', 92, 62);
});

// ------------------------------------------------------------------ the station
export function buildReleu(B, world) {
  if (!SPOT) return null;
  const { x, z, vx, vz, poles } = SPOT, y = heightAt(x, z);
  const rot = Math.atan2(vx, vz);                                     // (local z: towards the track; collision.js Box)
  const W = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  const put = (mat, g, opt) => { g.applyMatrix4(W); B.geo(mat, g, null, null, opt); };
  const box = (mat, w, h, d, px, py, pz, ry = 0, opt) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(px, py, pz); put(mat, g, opt); };
  const cyl = (mat, r0, r1, h, px, py, pz, seg = 10, rx = 0, rz = 0) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(px, py, pz); put(mat, g); };
  const W3 = (u, h, v) => V3(u, h, v).applyMatrix4(W);
  const rod = (mat, a, b, r, seg = 6) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); put(mat, g); };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // (the concrete in metres round and up a pole: not one picture stretched over its 12 m - it read as wood grain)
  const metric = (g, r, h) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r / 1.5, uv.getY(i) * h / 1.5); return g; };
  const Mt = {
    tank: std({ color: 0x7c8489, roughness: 0.5, metalness: 0.45 }),                  // (the transformer's grey paint)
    pafs: std({ color: 0xc4c7c3, roughness: 0.62 }),                                  // (polyester, light grey)
    inside: std({ color: 0xd9dbd6, roughness: 0.7 }),
    panel: std({ color: 0x9aa09d, roughness: 0.5, metalness: 0.5 }),                  // (the mounting plates, galvanised)
    copper: std({ color: 0xb8734a, roughness: 0.35, metalness: 0.9 }),
    black: std({ color: 0x151617, roughness: 0.55 }),
    bakelite: std({ color: 0x232322, roughness: 0.45 }),
    brownIns: std({ color: 0x6b3a22, roughness: 0.3 }),                              // (the arresters' brown porcelain)
    danger: std({ map: dangerTex(), roughness: 0.55 }),
    plate: std({ map: plateTex(), roughness: 0.55 }),
    diagram: std({ map: diagramTex(), roughness: 0.9 }),
    meter: std({ map: meterTex(), roughness: 0.4 }),
    glass: std({ color: 0xcfd8da, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false }),
    lamp: std({ color: 0xfff6e8, emissive: 0xffd9a0, emissiveIntensity: 2.2, roughness: 0.3 }),
  };
  for (const k of ['inside', 'panel', 'copper', 'black', 'bakelite', 'diagram', 'meter', 'lamp', 'glass']) Mt[k].userData.noWet = true;

  // the pole: centrifuged concrete, ~12 m out of the ground, 0.42 m across at the foot to 0.22 at the top
  { const g = metric(new THREE.CylinderGeometry(0.11, 0.21, 12.2, 14), 0.16, 12.2); g.translate(0, 6.1 - 0.1, 0); put(M.concretePole, g); }
  // the 20 kV line ends on its top crossarm (strain insulators, the conductors pulled towards the track)
  box(M.galv, 2.1, 0.09, 0.09, 0, 11.4, 0.13);
  const ends = [];
  for (const u of [-0.85, 0, 0.85]) {
    // (a chain of two caps, along the line)
    for (let k = 0; k < 3; k++) cyl(M.ceramicWhite, 0.075, 0.075, 0.04, u, 11.4, 0.25 + k * 0.09, 12, Math.PI / 2);
    cyl(M.galv, 0.012, 0.012, 0.3, u, 11.4, 0.33, 6, Math.PI / 2);
    ends.push(W3(u, 11.4, 0.5));
  }
  // under it, the MV fuses (the cut-outs, tilted) and the surge arresters (brown) on their crossarm, the drops to them
  // and on down to the transformer's bushings
  box(M.galv, 1.9, 0.08, 0.08, 0, 9.7, 0.14);
  const fuseTop = [], fuseLow = [], bush = [];
  for (const u of [-0.75, 0, 0.75]) {
    cyl(M.ceramicWhite, 0.045, 0.05, 0.36, u, 9.98, 0.2, 10);
    cyl(M.galv, 0.028, 0.028, 0.46, u, 9.98, 0.29, 8, 0, 0.32);
    fuseTop.push(W3(u - 0.07, 10.2, 0.29)); fuseLow.push(W3(u + 0.07, 9.76, 0.29));
    cyl(Mt.brownIns, 0.04, 0.045, 0.3, u + 0.22, 9.92, 0.12, 10);
  }
  // the transformer (100 kVA, ~845 kg) on its platform: hermetically sealed (no conservator: the tank's corrugated
  // sides take the oil's expansion), the fins on its two sides, the MV bushings on its cover and the LV ones behind them,
  // the rating plate on its front
  box(M.galv, 1.3, 0.08, 1.0, 0, 4.9, 0.5);
  box(M.galv, 0.08, 0.08, 0.95, -0.5, 4.8, 0.47); box(M.galv, 0.08, 0.08, 0.95, 0.5, 4.8, 0.47);
  { const g = new THREE.BoxGeometry(0.08, 0.9, 0.08); g.rotateX(0.75); g.translate(0, 4.45, 0.42); put(M.galv, g); }
  box(Mt.tank, 0.72, 0.95, 0.58, 0, 5.42, 0.6);
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) box(Mt.tank, 0.13, 0.78, 0.014, s * 0.425, 5.4, 0.35 + k * 0.0625);
  box(Mt.tank, 0.76, 0.05, 0.62, 0, 5.92, 0.6);
  for (const u of [-0.22, 0, 0.22]) { cyl(M.ceramicWhite, 0.035, 0.05, 0.3, u, 6.1, 0.75, 10); bush.push(W3(u, 6.25, 0.75)); }
  for (const u of [-0.21, -0.07, 0.07, 0.21]) cyl(M.ceramicWhite, 0.02, 0.026, 0.13, u, 6.01, 0.45, 8);
  box(Mt.plate, 0.18, 0.1, 0.005, 0.18, 5.3, 0.893);
  // the LV cable up the pole from the box to the transformer's LV bushings, the feeders' cables out of the box's foot
  // into the ground; the earthing conductor down the back of the pole
  rod(Mt.black, V3(0.15, 2.0, 0.17), V3(0.15, 6.06, 0.17), 0.024, 8);
  rod(Mt.black, V3(0.15, 6.06, 0.17), V3(0.07, 6.1, 0.45), 0.022, 8);
  for (const u of [-0.24, -0.08, 0.08, 0.24]) cyl(Mt.black, 0.016, 0.016, 0.95, u, 0.28, 0.32, 8);
  rod(M.galv, V3(-0.156, -0.1, -0.156), V3(-0.1, 9.6, -0.1), 0.008);
  // the box (CD 1-3): 0.9 x 1.15 x 0.32 m, its foot 0.85 m over the ground; three compartments: supply (top left), metering
  // (top right), distribution (below), the intermediate box for the cables under it
  const BX = { u0: -0.45, u1: 0.45, y0: 0.85, y1: 2.0, v0: 0.2, v1: 0.52 }, mid = 1.47;
  const v1 = BX.v1, t = 0.02;
  box(Mt.pafs, 0.9, 1.15, t, 0, (BX.y0 + BX.y1) / 2, BX.v0 + t / 2);                       // (back)
  box(Mt.pafs, t, 1.15, 0.32, BX.u0 + t / 2, (BX.y0 + BX.y1) / 2, (BX.v0 + v1) / 2);        // (sides)
  box(Mt.pafs, t, 1.15, 0.32, BX.u1 - t / 2, (BX.y0 + BX.y1) / 2, (BX.v0 + v1) / 2);
  box(Mt.pafs, 0.94, 0.04, 0.36, 0, BX.y1 + 0.02, (BX.v0 + v1) / 2);                       // (the top, with its drip edge)
  box(Mt.pafs, 0.9, t, 0.32, 0, BX.y0 + t / 2, (BX.v0 + v1) / 2);                           // (bottom)
  box(Mt.pafs, 0.86, t, 0.3, 0, mid, (BX.v0 + v1) / 2);                                     // (the partitions)
  box(Mt.pafs, t, 2.0 - mid, 0.3, 0.02, (mid + BX.y1) / 2, (BX.v0 + v1) / 2);
  box(Mt.inside, 0.86, 1.11, 0.004, 0, (BX.y0 + BX.y1) / 2, BX.v0 + t + 0.003);
  // its frame on the pole: the three clamps
  for (const h of [1.0, 1.45, 1.9]) box(M.galv, 0.5, 0.04, 0.04, 0, h, 0.19);
  for (const u of [-0.3, 0.3]) { const g = new THREE.TorusGeometry(0.03, 0.007, 6, 12); g.translate(u, BX.y1 + 0.07, (BX.v0 + v1) / 2); put(M.galv, g); }
  box(Mt.pafs, 0.6, 0.18, 0.26, 0, BX.y0 - 0.1, (BX.v0 + v1) / 2);                          // (the intermediate box)
  cyl(M.galv, 0.009, 0.009, 0.04, 0.36, BX.y0 - 0.03, v1 - 0.04, 6);                       // (the earthing bolt)
  cyl(Mt.black, 0.006, 0.01, 0.22, BX.u1 + 0.03, BX.y1 + 0.02, 0.36, 6);                   // (the GPRS antenna)
  // ventilation slots on the sides
  for (let k = 0; k < 5; k++) for (const u of [BX.u0 - 0.002, BX.u1 + 0.002]) box(Mt.black, 0.003, 0.012, 0.14, u, BX.y1 - 0.12 - k * 0.03, 0.36);
  // the doors: supply and distribution open to 120 degrees on their left hinges, the metering one shut (its window)
  const door = (u0, y0, w, h, open, inner) => {
    const g = new THREE.BoxGeometry(w, h, 0.018); g.translate(w / 2, 0, 0.009); g.rotateY(open); g.translate(u0, y0 + h / 2, v1); put(Mt.pafs, g);
    if (inner) { const p = new THREE.PlaneGeometry(w * 0.6, h * 0.5); p.rotateY(Math.PI); p.translate(w / 2, 0, -0.002); p.rotateY(open); p.translate(u0, y0 + h / 2, v1); put(inner, p); }
    // (the hinges)
    for (const k of [0.1, 0.5, 0.9]) box(M.galv, 0.02, 0.05, 0.03, u0 - 0.004, y0 + h * k, v1 + 0.005);
  };
  const OPEN = -120 * Math.PI / 180;
  door(BX.u0, mid, 0.46, BX.y1 - mid, OPEN, null);
  door(BX.u0, BX.y0, 0.9, mid - BX.y0, OPEN, Mt.diagram);
  { // the metering door, shut: its frame and window
    const u0 = 0.02, w = 0.43, h = BX.y1 - mid;
    box(Mt.pafs, w, 0.12, 0.018, u0 + w / 2, mid + 0.06, v1 + 0.009); box(Mt.pafs, w, 0.2, 0.018, u0 + w / 2, BX.y1 - 0.1, v1 + 0.009);
    box(Mt.pafs, 0.1, h - 0.32, 0.018, u0 + 0.05, mid + 0.12 + (h - 0.32) / 2, v1 + 0.009); box(Mt.pafs, 0.1, h - 0.32, 0.018, u0 + w - 0.05, mid + 0.12 + (h - 0.32) / 2, v1 + 0.009);
    const g = new THREE.PlaneGeometry(w - 0.2, h - 0.32); g.translate(u0 + w / 2, mid + 0.12 + (h - 0.32) / 2, v1 + 0.012); put(Mt.glass, g, { noCast: true });
    const mtr = new THREE.PlaneGeometry(0.17, 0.13); mtr.translate(u0 + w / 2, mid + 0.25, BX.v0 + 0.14); put(Mt.meter, mtr);
    box(Mt.bakelite, 0.19, 0.27, 0.11, u0 + w / 2, mid + 0.22, BX.v0 + 0.08);
  }
  // supply compartment: the copper bars from the LV cable, the main breaker's body on its plate
  box(Mt.panel, 0.38, 0.46, 0.01, -0.22, mid + 0.26, BX.v0 + 0.03);
  box(Mt.bakelite, 0.21, 0.24, 0.12, -0.22, mid + 0.25, BX.v0 + 0.1);
  for (const u of [-0.29, -0.22, -0.15]) box(Mt.copper, 0.018, 0.12, 0.006, u, mid + 0.43, BX.v0 + 0.05);
  // distribution compartment: the main bars across, the fuse bases (3 feeders + the public lighting's, a phase each row)
  box(Mt.panel, 0.84, 0.56, 0.01, 0, (BX.y0 + mid) / 2, BX.v0 + 0.03);
  const ROW = { L1: mid - 0.13, L2: mid - 0.26, L3: mid - 0.39 }, COLS = [-0.3, -0.12, 0.06];
  for (const [ph, hy] of Object.entries(ROW)) {
    box(Mt.copper, 0.8, 0.02, 0.006, 0, hy + 0.07, BX.v0 + 0.05);
    for (const u of COLS) { box(Mt.bakelite, 0.085, 0.07, 0.045, u, hy, BX.v0 + 0.06); box(M.galv, 0.012, 0.03, 0.02, u - 0.03, hy, BX.v0 + 0.09); box(M.galv, 0.012, 0.03, 0.02, u + 0.03, hy, BX.v0 + 0.09); }
  }
  for (const u of [-0.3, -0.12, 0.06]) box(Mt.copper, 0.03, 0.16, 0.006, u, BX.y0 + 0.1, BX.v0 + 0.05);
  box(Mt.copper, 0.6, 0.025, 0.008, -0.05, BX.y0 + 0.07, BX.v0 + 0.06);                    // (the neutral bar)
  // the lamp in the box's roof
  box(Mt.lamp, 0.12, 0.025, 0.05, 0.22, mid - 0.04, BX.v0 + 0.16);
  // the public lighting's block (BMPT-IP) on the pole's right, its door open: the contactor, the photocell's switch
  const IP = { u: 0.68, y: 1.25, v: 0.24 };
  box(Mt.pafs, 0.32, 0.46, 0.2, IP.u, IP.y, IP.v);
  { const g = new THREE.BoxGeometry(0.32, 0.46, 0.016); g.translate(-0.16, 0, 0.008); g.rotateY(-OPEN); g.translate(IP.u + 0.16, IP.y, IP.v + 0.1); put(Mt.pafs, g); }
  box(Mt.inside, 0.28, 0.42, 0.004, IP.u, IP.y, IP.v + 0.101);
  box(Mt.bakelite, 0.1, 0.12, 0.07, IP.u - 0.06, IP.y + 0.1, IP.v + 0.13);
  for (const h of [-0.14, 0.14]) box(M.galv, 0.42, 0.04, 0.04, 0.34, IP.y + h, 0.12);
  cyl(M.galv, 0.03, 0.03, 0.05, IP.u + 0.04, IP.y + 0.42, IP.v, 10);                        // (the photocell on top)
  // the plates: the danger plate on the pole and on the box's door, the station's plate
  { const g = new THREE.PlaneGeometry(0.2, 0.25); g.translate(0, 2.75, 0.215); put(Mt.danger, g); }
  { const g = new THREE.PlaneGeometry(0.2, 0.25); g.translate(0, 7.6, 0.17); put(Mt.danger, g); }
  { const g = new THREE.PlaneGeometry(0.34, 0.13); g.translate(0, 3.15, 0.205); put(Mt.plate, g); }

  // ---- the moving parts: the main breaker's handle and its indicator, the fuses of each phase, the lighting's switch
  const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.copy(W); grp.matrixWorldNeedsUpdate = true;
  const mesh = (g, m, px, py, pz) => { const o = new THREE.Mesh(g, m); o.position.set(px, py, pz); o.castShadow = false; o.receiveShadow = true; grp.add(o); return o; };
  const lbl = (t, w, h, px, py, pz, bg, fg) => mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: labelTex(t, bg, fg), roughness: 0.7 }), px, py, pz);
  const handleP = new THREE.Group(); handleP.position.set(-0.22, mid + 0.26, BX.v0 + 0.165); grp.add(handleP);
  { const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.028), Mt.black); h.position.set(0, 0.035, 0.012); handleP.add(h); }
  const ind = mesh(new THREE.PlaneGeometry(0.035, 0.018), new THREE.MeshStandardMaterial({ color: 0xc2221c, roughness: 0.5 }), -0.22, mid + 0.16, BX.v0 + 0.161);
  lbl('IG 160 A', 0.09, 0.034, -0.22, mid + 0.345, BX.v0 + 0.161);
  const fuses = { L1: [], L2: [], L3: [] };
  const fuseG = new THREE.BoxGeometry(0.075, 0.05, 0.04), fuseM = std({ color: 0xe4ddc8, roughness: 0.55 });
  for (const [ph, hy] of Object.entries(ROW)) {
    for (const u of COLS) fuses[ph].push(mesh(fuseG, fuseM, u, hy, BX.v0 + 0.105));
    lbl(ph, 0.05, 0.03, 0.22, hy, BX.v0 + 0.05);
  }
  const IPH = new THREE.Group(); IPH.position.set(IP.u + 0.05, IP.y - 0.06, IP.v + 0.12); grp.add(IPH);
  { const h = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), std({ color: 0x1d4e9e, roughness: 0.45 })); h.position.set(0, 0.04, 0.012); IPH.add(h); }
  lbl('IP', 0.05, 0.03, IP.u + 0.05, IP.y - 0.15, IP.v + 0.102);
  const state = { L1: true, L2: true, L3: true, IG: true, IP: true };
  const set = (k, on) => {
    state[k] = on;
    if (k === 'IG') { handleP.rotation.x = on ? 0 : Math.PI * 0.62; ind.material.color.setHex(on ? 0xc2221c : 0x1f8a3a); }
    else if (k === 'IP') IPH.rotation.x = on ? 0 : Math.PI * 0.6;
    // (a phase's fuses pulled: laid on the box's floor, in a row)
    else for (const [i, f] of fuses[k].entries()) { f.position.set(on ? COLS[i] : -0.36 + i * 0.09, on ? ROW[k] : BX.y0 + 0.045, on ? BX.v0 + 0.105 : 0.42 + ['L1', 'L2', 'L3'].indexOf(k) * 0.03); f.rotation.z = on ? 0 : Math.PI / 2; }
  };
  // (each fuse's grip, where the insulated handle takes it)
  for (const list of Object.values(fuses)) for (const f of list) { const gr = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.03), Mt.black); gr.position.set(0, 0.025, 0.025); f.add(gr); }
  // where you take hold of each (world): E on the one you look at (main.js)
  const pt = (p) => ({ a: p, b: p });
  const controls = [
    { key: 'IG', ...pt(W3(-0.22, mid + 0.29, BX.v0 + 0.18)), r: 0.08 },
    ...['L1', 'L2', 'L3'].map(k => ({ key: k, a: W3(-0.33, ROW[k], BX.v0 + 0.12), b: W3(0.09, ROW[k], BX.v0 + 0.12), r: 0.055 })),
    { key: 'IP', ...pt(W3(IP.u + 0.05, IP.y - 0.02, IP.v + 0.13)), r: 0.08 },
  ];
  // in your way: the pole, the box, the lighting's block, the transformer's platform out of reach; the other poles
  world.addStatic(new world.Box(x, z, 0.22, 0.22, rot, y - 1, y + 12.2, 'pole'));
  { const c = W3(0, 0, (BX.v0 + v1) / 2); world.addStatic(new world.Box(c.x, c.z, 0.47, 0.17, rot, y + 0.7, y + 2.05, 'releu')); }
  { const c = W3(IP.u, 0, IP.v); world.addStatic(new world.Box(c.x, c.z, 0.17, 0.11, rot, y + 1.0, y + 1.5, 'releu')); }
  // the line: across the track and on down the hill, three spans of ~40 m on concrete poles (their crossarms across it)
  const wires = [];
  const cat = (a, b, sag) => { for (let k = 0; k < 10; k++) { const f0 = k / 10, f1 = (k + 1) / 10; wires.push(a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0 - sag * 4 * f0 * (1 - f0), a.z + (b.z - a.z) * f0, a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1 - sag * 4 * f1 * (1 - f1), a.z + (b.z - a.z) * f1); } };
  const ux = Math.cos(rot), uz = -Math.sin(rot);
  let prev = ends;
  for (const [i, [px, pz]] of poles.entries()) {
    const py = heightAt(px, pz), T = new THREE.Matrix4().makeRotationY(rot).setPosition(px, py, pz);
    const g = metric(new THREE.CylinderGeometry(0.1, 0.19, 11.8, 12), 0.145, 11.8); g.translate(0, 5.8, 0); g.applyMatrix4(T); B.geo(M.concretePole, g);
    const a = new THREE.BoxGeometry(2.0, 0.08, 0.08); a.translate(0, 10.9, 0); a.applyMatrix4(T); B.geo(M.galv, a);
    const tips = [];
    for (const u of [-0.85, 0, 0.85]) {
      const ins = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10); ins.translate(u, 11.05 + (u === 0 ? 0.3 : 0), 0); ins.applyMatrix4(T); B.geo(M.ceramicWhite, ins);
      if (u === 0) { const p = new THREE.BoxGeometry(0.06, 0.32, 0.06); p.translate(0, 11.04, 0); p.applyMatrix4(T); B.geo(M.galv, p); }
      tips.push(V3(px + ux * u, py + 11.18 + (u === 0 ? 0.3 : 0), pz + uz * u));
    }
    for (let k = 0; k < 3; k++) cat(prev[k], tips[k], i === 0 ? 0.35 : 0.9);
    prev = tips;
    world.addStatic(new world.Box(px, pz, 0.2, 0.2, rot, py - 1, py + 12, 'pole'));
  }
  // the drops: from the line's ends to the fuses, from them to the arresters and to the transformer's bushings
  for (let k = 0; k < 3; k++) {
    cat(ends[k], fuseTop[k], 0.02);
    cat(fuseLow[k], bush[k], 0.05);
  }
  return {
    type: 'releu', name: 'Postul de transformare', x, z, y, groups: [grp], wires, controls, state, set,
    // the hum: the transformer's core (main.js: audio)
    hum: W3(0, 5.4, 0.55), box: W3(0, 1.45, 0.5),
    glow: { lamp: Mt.lamp, inside: [Mt.inside, Mt.panel, Mt.diagram] }, mats: Mt,
    animate() {},
  };
}
