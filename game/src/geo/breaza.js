import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHolePoly, addFineZone } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, blobs, boxAt, cyl, tube, catenary, merged, frame, pairs, road, drape } from './pitigaia.js';

// Photo 63 (the user's phone photo from a car, 45.1435469 N 25.6988803 E): the DJ101R coming off Podul Vadului splits onto
// DN1 at the Breaza town limit. The bridge's road ends at a fork (the end of OSM way 1545446280): the branch to DN1
// (148233510, one way, STOP at DN1) keeps right, the one from DN1 (148506882) comes in on its left, with painted
// hatching between them up to a kerbed island (black and white kerbs) carrying the town's monument - "BREAZA" in big
// letters on a green steel A-frame over a stone plinth, a green triangle on top and three flags (EU, Romania and a pale
// one; its form from the Street View shots the user sent, April 2022); pines stand behind it by DN1. The ramp
// down from DN1 (14189846) passes on the far left by the grass triangle with the Lac Verde golf billboard; on the right,
// the grass between our branch and the link to DN1 south (16077393) has the rusty lamp post with the "BREAZA" town sign
// and a notice; at the STOP, the "Ploiești / Brașov" plates on a double lamp post and the "no animal-drawn carts" sign.
//   camera: 2 m before the fork in the right lane (the bridge's railings are behind it, none in the frame), 1.25 m up,
//   heading 63.6°, level; bearings from the photo (a 26 mm-equivalent phone lens: 53° across its 1932 px width): the
//   monument 1.0° right of the centre, the STOP 7.6° right (at its OSM node), the billboard 14.2° left, BREAZA 18.4°
//   right; sizes put the billboard at ~34 m (2.4 m wide), BREAZA at ~31 m (a 1.3 m plate); the monument stands ~34 m
//   out (the dark patch on the aerial), just past the nose of the island at the end of ~30 m of hatching, 3.0 m tall.
//   the incoming branch: the aerial has it ~2 m north-west of its OSM line in the middle; bowed there, the monument
//   falls on the island's axis, as in the photo.
const IDS = { stub: '1545446280', IN: '148506882', OUT: '148233510', RAMP: '14189846', LINK: '16077393', GRAVEL: '303232125', DN1: '1138000005' };
const HW = 2.25;                                          // the branches' half width (4.5 m in OSM)
const IN_BOW = 2.2;
const CAM = { back: 2, o: 1.6, bearing: 63.6, eye: 1.25 };
const TIP_S = 29.5;                                       // the island's nose along our branch (the hatching runs ~30 m, photo 63)
const RAYS = { billboard: [-14.2, 34], breaza: [18.4, 31], stop: [7.6], monument: [1.0, 33.7] };   // degrees from the heading, metres
const UP = [0, 1, 0];

// game direction of a compass bearing (+x = 312°, +z = 42°)
const dirOf = (deg) => { const b = deg * Math.PI / 180, e = Math.sin(b), n = Math.cos(b); return [-0.743 * e + 0.669 * n, 0.669 * e + 0.743 * n]; };
const Wf = (F, s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// ------------------------------------------------------------------ the layout (after the incoming branch is bowed)
let LAY = null;
function layout() {
  if (LAY) return LAY;
  const stub = road(IDS.stub), inn = road(IDS.IN), out = road(IDS.OUT), ramp = road(IDS.RAMP), link = road(IDS.LINK);
  if (!stub || !inn || !out || !ramp || !link) return (LAY = false);
  const FO = frame(pairs(out.p)), FI = frame(pairs(inn.p).reverse()), FR = frame(pairs(ramp.p).reverse()), FL = frame(pairs(link.p)), FS = frame(pairs(stub.p));
  // the camera
  const [cx, cz] = Wf(FS, FS.L - CAM.back, CAM.o), ray = (deg, d) => { const [dx, dz] = dirOf(CAM.bearing + deg); return [cx + dx * d, cz + dz * d]; };
  // the strip between our branch's left edge and the incoming branch's right edge, every 0.5 m along ours
  const rows = [];
  for (let s = 0; s <= FO.L + 1e-6; s += 0.5) {
    const eo = Wf(FO, s, -HW), q = FI.local(eo[0], eo[1]);
    if (!q) continue;
    rows.push({ s, eo, ei: Wf(FI, q.s, HW), si: q.s, g: q.o - HW });
  }
  const iTip = rows.findIndex(r => r.s >= TIP_S && r.g >= 2), iEnd = iTip < 0 ? -1 : rows.length - 1 - [...rows].reverse().findIndex(r => r.g >= 2);
  const mid = (r) => [(r.eo[0] + r.ei[0]) / 2, (r.eo[1] + r.ei[1]) / 2];
  // the STOP at its OSM node (on our branch's axis): the sign at the right edge
  const qs = FO.local(1405.39, 147.18), sStop = qs ? qs.s : FO.L - 7;
  LAY = { FO, FI, FR, FL, FS, cam: [cx, cz], ray, rows, iTip, iEnd, mid, sStop, stub };
  return LAY;
}

// ------------------------------------------------------------------ before the terrain
export function prepareBreaza() {
  const inn = road(IDS.IN), ramp = road(IDS.RAMP), link = road(IDS.LINK);
  if (!inn || !ramp || !link || !road(IDS.OUT) || !road(IDS.stub)) return false;
  // the incoming branch bowed ~2.2 m north-west in the middle (its ends stay on the fork and on DN1)
  const FI0 = frame(pairs(inn.p).reverse());
  {
    const P = FI0.P, L = FI0.L, Q = [P[0]];
    for (let s = 2; s < L - 1; s += 2) { const q = FI0.at(s), [ux, uz] = FI0.dir(s), k = IN_BOW * Math.sin(Math.PI * s / L); Q.push([q.x + uz * k, q.z - ux * k]); }
    Q.push(P[P.length - 1]);
    inn.p = Q.reverse().flat();
  }
  // the two branches have kerbs and the hatching at their sides, no gravel shoulders (roads.js)
  inn.noShoulder = true; road(IDS.OUT).noShoulder = true;
  // nor has DN1 by the triangle (a kerb at its edge in Street View; the median on its other side)
  if (road(IDS.DN1)) road(IDS.DN1).noShoulder = true;
  const Y = layout();
  if (!Y) return false;
  const { FR, FL, FI, FO } = Y;
  // the ground at the fork: build_geo.py levelled beds along the OSM lines, so the bowed branch's inner half and the
  // hatching sat on a hump (up to 0.45 m over its axis). Now every road keeps its bed level across its width (the bowed
  // branch its old line's), and between two neighbours - the hatching and island, the billboard's triangle (ramp),
  // BREAZA's grass (link) - the ground runs straight from one bed to the other; outside, it blends in over 3 m
  //   the beds' long profiles are the grid along each axis averaged over +-8 m (the 5 m grid leaves 0.3 m steps and a 1 m
  //   dip there), held at the fork and at DN1; the ramp and the link go back to the grid 35-50 m out
  {
    const profile = (F, fade) => {
      const n = Math.ceil(F.L / 2) + 1, ys = [];
      for (let k = 0; k < n; k++) { const q = F.at(Math.min(k * 2, F.L)); ys.push(gridHeight(GEO, q.x, q.z)); }
      const sm = ys.map((_, k) => { let a = 0, w = 0; for (let j = Math.max(0, k - 4); j <= Math.min(n - 1, k + 4); j++) { a += ys[j]; w++; } return a / w; });
      sm[0] = ys[0]; sm[n - 1] = ys[n - 1];
      for (let k = 1; k < Math.min(4, n - 1); k++) sm[k] = ys[0] + (sm[k] - ys[0]) * k / 4;      // eased off the fork's height
      return (s, x, z) => {
        const f = Math.max(0, Math.min(n - 1.0001, s / 2)), i = Math.floor(f), y = sm[i] + (sm[i + 1] - sm[i]) * (f - i);
        return fade ? y + (gridHeight(GEO, x, z) - y) * smooth(35, 50, s) : y;
      };
    };
    const pI = profile(FI0, false), pO = profile(FO, false), pR = profile(FR, true), pL = profile(FL, true), J0 = FO.P[0];
    // the gravel road leaving the fork southwards (the aerial's pale apron by the bridge's end): its bed levelled too, and
    // its ribbon 2 cm under the asphalt near the fork, so the asphalt covers it cleanly where they overlap
    const grav = road(IDS.GRAVEL), FG = grav ? frame(pairs(grav.p)) : null, pG = FG ? profile(FG, true) : null;
    if (grav) grav.dy = (x, z) => 0.035 - 0.02 * (1 - smooth(8, 14, Math.hypot(x - J0[0], z - J0[1])));
    const yOf = (P, F, q) => { const c = F.at(Math.min(q.s, F.L)); return P(q.s * (P === pI ? FI0.L / FI.L : 1), c.x, c.z); };
    // e: a bed's half width, 0.3 m past its asphalt's; where two beds overlap, a point on one asphalt only (in the other's
    // margin) takes that road's bed, so the neighbour's never stands through it
    const across = (d1, y1, e1, d2, y2, e2) => {
      if (d1 < e1 && d2 < e2) return d1 >= e1 - 0.3 && d2 < e2 - 0.3 ? y2 : d2 >= e2 - 0.3 && d1 < e1 - 0.3 ? y1 : (y1 + y2) / 2;
      if (d1 < e1) return y1;
      if (d2 < e2) return y2;
      return y1 + (y2 - y1) * (d1 - e1) / ((d1 - e1) + (d2 - e2));
    };
    const e = HW + 0.3, e2 = 2.3;
    // within 12 m of the fork the four roads share one level (their asphalt overlaps there), parting by 40 m (sooner, the
    // ramp dropped 1 m in 6 m right by the bowed branch and its bank stood through the ramp's asphalt)
    const shared = (x, z) => (yOf(pI, FI, FI.local(x, z)) + yOf(pO, FO, FO.local(x, z)) + yOf(pR, FR, FR.local(x, z)) + yOf(pL, FL, FL.local(x, z))) / 4;
    const level = (x, z) => {
      const g = gridHeight(GEO, x, z), qi = FI.local(x, z), qo = FO.local(x, z), qr = FR.local(x, z), ql = FL.local(x, z);
      if (!qi || !qo || !qr || !ql) return g;
      let yi = yOf(pI, FI, qi), yo = yOf(pO, FO, qo), yr = yOf(pR, FR, qr), yl = yOf(pL, FL, ql);
      const w = smooth(12, 40, Math.hypot(x - J0[0], z - J0[1])), yc = (yi + yo + yr + yl) / 4;
      yi = yc + (yi - yc) * w; yo = yc + (yo - yc) * w; yr = yc + (yr - yc) * w; yl = yc + (yl - yc) * w;
      // the gravel road's bed from its axis point, level across its width like its ribbon
      const qg = FG && FG.local(x, z);
      let yg = 0;
      if (qg) { const c = FG.at(Math.min(qg.s, FG.L)), ycg = shared(c.x, c.z); yg = ycg + (yOf(pG, FG, qg) - ycg) * smooth(12, 40, Math.hypot(c.x - J0[0], c.z - J0[1])); }
      if (qi.o > 0 && qo.o < 0) return across(qi.d, yi, e, qo.d, yo, e);                        // hatching, island
      if (qi.o < 0 && qr.o > 0 && qi.d < 30 && qr.s < 45) return across(qi.d, yi, e, qr.d, yr, e2);   // the triangle
      if (qo.o > 0 && ql.o < 0 && qo.d < 30 && ql.s < 45) return across(qo.d, yo, e, ql.d, yl, e2);   // BREAZA's grass
      // outside: the nearest road's bed across its width, blending into the ground over 3 m
      const beds = [[qi.d, yi, e], [qo.d, yo, e], [qr.d, yr, e2], [ql.d, yl, e2]];
      if (qg) beds.push([qg.d, yg, 3.3]);
      const near = beds.sort((a, b) => (a[0] - a[2]) - (b[0] - b[2]))[0];
      return g + (near[1] - g) * (1 - smooth(near[2], near[2] + 3, near[0]));
    };
    const Z = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const F of [FI, FO]) for (const [x, z] of F.P) { Z.x0 = Math.min(Z.x0, x - 30); Z.x1 = Math.max(Z.x1, x + 30); Z.z0 = Math.min(Z.z0, z - 30); Z.z1 = Math.max(Z.z1, z + 30); }
    const mw = Math.ceil(Z.x1 - Z.x0) + 1, mh = Math.ceil(Z.z1 - Z.z0) + 1, up = new Uint8Array(mw * mh), mask = new Uint8Array(mw * mh);
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) { const x = Z.x0 + i, z = Z.z0 + j; if (Math.abs(level(x, z) - gridHeight(GEO, x, z)) > 0.01) up[j * mw + i] = 1; }
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) if (up[j * mw + i]) for (let v = Math.max(0, j - 4); v <= Math.min(mh - 1, j + 4); v++) for (let u = Math.max(0, i - 4); u <= Math.min(mw - 1, i + 4); u++) mask[v * mw + u] = 1;
    addFineZone({ ...Z, test: (x, z) => { const i = Math.round(x - Z.x0), j = Math.round(z - Z.z0); return i >= 0 && j >= 0 && i < mw && j < mh && mask[j * mw + i] === 1; }, h: level });
  }
  // no trees, generated lot fences or village poles on the islands, the grass either side and the field by the link
  // (open ground in the photo; the billboard's triangle is grass right up to DN1 in Street View); the wood west of the
  // ramp stays
  const H = [];
  for (let s = 0; s < FR.L - 2; s += 4) H.push(Wf(FR, s, 2.6));
  H.push([1470, 164.5], [1435, 157], [1414, 155], [1406, 152], [1384, 151]);   // back along DN1's axis
  for (let s = 55; s >= 0; s -= 5) H.push(Wf(FL, s, 14));
  H.push([1433, 105]);
  addHolePoly(H, { noFences: true });
  // pines: the big ones behind the monument, across DN1 (bearings 54-70 degrees in the photo; ~11-12 m tall, so 70-90 m
  // away; the dark crowns there on the aerial). None in the triangle's corner by DN1: Street View has grass there
  const T = GEO.trees, ray = Y.ray;
  if (T) {
    const add = [[...ray(-9.5, 72), 15, 1.35], [...ray(-7.0, 80), 15, 1.45], [...ray(-5.0, 74), 15, 1.3], [...ray(-3.8, 86), 15, 1.5], [...ray(6.5, 80), 15, 1.4],
      [...ray(-2.2, 76), 15, 1.5], [...ray(0.4, 82), 15, 1.6], [...ray(2.8, 74), 15, 1.45], [...ray(4.6, 88), 15, 1.55], [...ray(-0.8, 92), 15, 1.4]];
    const n = T.n + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), sc = new Float32Array(n);
    x.set(T.x); z.set(T.z); t.set(T.t); sc.set(T.s);
    add.forEach(([ax, az, at, as], k) => { x[T.n + k] = ax; z[T.n + k] = az; t[T.n + k] = at; sc[T.n + k] = as; });
    GEO.trees = { n, x, z, t, s: sc };
  }
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const R = (() => { let s = 63; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  // the golf billboard (text as legible in the photo; the word before "de ÎNCÂNTARE" is not)
  const bb = canvas(256, 470), bg = bb.getContext('2d');
  bg.fillStyle = '#ebe5d3'; bg.fillRect(0, 0, 256, 470);
  bg.fillStyle = '#3d4a2c'; bg.beginPath(); bg.arc(58, 52, 30, 0, 7); bg.fill(); bg.fillRect(55, 70, 6, 30);
  bg.fillStyle = '#ebe5d3'; for (let k = 0; k < 14; k++) { bg.beginPath(); bg.arc(40 + R() * 36, 34 + R() * 36, 2 + R() * 3, 0, 7); bg.fill(); }
  bg.fillStyle = '#3d4a2c'; bg.font = 'bold 12px Georgia, serif'; bg.textAlign = 'center'; bg.fillText('LACVERDE', 58, 118);
  bg.fillStyle = '#2d2a26'; bg.textAlign = 'center';
  bg.font = 'bold 21px Georgia, serif'; bg.fillText('Primul teren', 172, 42); bg.fillText('privat de', 172, 66);
  bg.font = 'bold 26px Georgia, serif'; bg.fillStyle = '#6f6a5c'; bg.fillText('GOLF', 172, 96);
  bg.fillStyle = '#2d2a26'; bg.font = 'bold 20px Georgia, serif'; bg.fillText('din România', 172, 122);
  bg.font = 'bold 24px Arial, Helvetica, sans-serif'; bg.fillText('0754 093 291', 128, 158);
  bg.fillStyle = '#4e7a4a'; bg.fillRect(8, 176, 240, 44);
  bg.fillStyle = '#f3f0e6'; bg.font = 'bold 40px Arial, Helvetica, sans-serif'; bg.textAlign = 'left'; bg.fillText('24', 16, 214);
  bg.font = 'bold 20px Arial, Helvetica, sans-serif'; bg.fillText('de ÎNCÂNTARE', 78, 211);
  // the picture: pale sky, a line of trees, the fairway, a golfer and a bag
  const sky = bg.createLinearGradient(0, 226, 0, 300); sky.addColorStop(0, '#e2e4d8'); sky.addColorStop(1, '#cfd6c0'); bg.fillStyle = sky; bg.fillRect(0, 226, 256, 80);
  blobs(bg, 0, 280, 256, 40, 40, 6, 16, ['rgba(62,84,52,0.9)', 'rgba(84,104,66,0.85)', 'rgba(46,64,42,0.9)'], R);
  const gr = bg.createLinearGradient(0, 310, 0, 470); gr.addColorStop(0, '#8fa56f'); gr.addColorStop(1, '#6f8a52'); bg.fillStyle = gr; bg.fillRect(0, 312, 256, 158);
  bg.fillStyle = '#2f3236'; bg.fillRect(78, 318, 10, 40); bg.beginPath(); bg.arc(83, 312, 7, 0, 7); bg.fill(); bg.fillRect(80, 358, 4, 40); bg.fillRect(86, 358, 4, 40);
  bg.strokeStyle = '#2f3236'; bg.lineWidth = 2; bg.beginPath(); bg.moveTo(88, 326); bg.lineTo(112, 300); bg.stroke();
  bg.fillStyle = '#3b3d40'; bg.fillRect(150, 404, 26, 34); bg.fillStyle = '#e6e2d6'; bg.fillRect(146, 396, 34, 10);
  grain(bg, 256, 470, 10, R);
  // stones of the pillar and the rockery
  const st = canvas(128, 128), sg = st.getContext('2d');
  sg.fillStyle = '#4c4842'; sg.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128;) { const h = 5 + R() * 7 | 0; for (let x = -R() * 20; x < 128;) { const w = 14 + R() * 30, c = 118 + R() * 70 | 0, t = R() * 14 | 0; sg.fillStyle = `rgb(${c + t},${c - 4},${c - 12 - t})`; sg.fillRect(x + 1, y + 1, w - 2, h - 1); x += w; } y += h; }
  grain(sg, 128, 128, 18, R);
  // the monument's letters (Street View, 2022): "BREAZA" in white block capitals towards our branch, a taller green set
  // on the far side; and its green corrugated triangle
  const letters = (col) => {
    const c = canvas(1024, 256), g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 256); g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = 'bold 240px "Arial Black", Arial, Helvetica, sans-serif';
    const m = g.measureText('BREAZA'), bw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, bh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const sx = 1016 / bw, sy = 250 / bh;                       // the glyphs fill the canvas: the quad is the letters' box
    g.setTransform(sx, 0, 0, sy, 4 + sx * m.actualBoundingBoxLeft, 3 + sy * m.actualBoundingBoxAscent); g.fillText('BREAZA', 0, 0);
    return c;
  };
  const cor = canvas(64, 64), cg0 = cor.getContext('2d');
  for (let x = 0; x < 64; x++) { const t = 0.5 + 0.5 * Math.sin(x / 64 * Math.PI * 2 * 8); cg0.fillStyle = `rgb(${38 + t * 22 | 0},${112 + t * 36 | 0},${52 + t * 20 | 0})`; cg0.fillRect(x, 0, 1, 64); }
  grain(cg0, 64, 64, 10, R);
  // kerbs painted black and white, 1 m each (the islands and the billboard's triangle, photos and Street View)
  const kp = canvas(64, 16), kg = kp.getContext('2d');
  kg.fillStyle = '#dedbd2'; kg.fillRect(0, 0, 32, 16); kg.fillStyle = '#2e2e2c'; kg.fillRect(32, 0, 32, 16);
  for (let k = 0; k < 40; k++) { kg.fillStyle = k % 2 ? 'rgba(150,146,136,0.5)' : 'rgba(120,118,110,0.45)'; kg.fillRect(R() * 64, R() * 16, 1 + R() * 3, 1 + R() * 2); }
  grain(kg, 64, 16, 14, R);
  const kerbTex = tex(kp, { repeat: true }); kerbTex.repeat.set(0.5, 1);
  const flagEU = canvas(96, 64), fe = flagEU.getContext('2d');
  fe.fillStyle = '#1f3f99'; fe.fillRect(0, 0, 96, 64); fe.fillStyle = '#f5cd2f';
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; fe.beginPath(); fe.arc(48 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 2.6, 0, 7); fe.fill(); }
  const flagRO = canvas(96, 64), fr = flagRO.getContext('2d');
  [['#1f3f8f', 0], ['#f2cf1c', 32], ['#cf2a2a', 64]].forEach(([c, x]) => { fr.fillStyle = c; fr.fillRect(x, 0, 32, 64); });
  const flagP = canvas(96, 64), fp = flagP.getContext('2d');
  fp.fillStyle = '#c9c8c0'; fp.fillRect(0, 0, 96, 64); fp.fillStyle = 'rgba(70,74,86,0.6)'; fp.fillRect(34, 14, 28, 36); fp.fillStyle = 'rgba(160,60,56,0.5)'; fp.fillRect(40, 20, 16, 24);
  // signs
  const stop = canvas(128, 128), sp = stop.getContext('2d');
  const oct = (g, r, c) => { g.fillStyle = c; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.fill(); };
  sp.clearRect(0, 0, 128, 128); oct(sp, 63, '#f4f2ee'); oct(sp, 58, '#c7303a');
  sp.fillStyle = '#f4f2ee'; sp.font = 'bold 34px Arial, Helvetica, sans-serif'; sp.textAlign = 'center'; sp.textBaseline = 'middle'; sp.fillText('STOP', 64, 66);
  const plate = (txt, right) => {
    const c = canvas(160, 40), g = c.getContext('2d'); g.clearRect(0, 0, 160, 40); g.fillStyle = '#2459a6';
    g.beginPath(); if (right) { g.moveTo(2, 2); g.lineTo(140, 2); g.lineTo(158, 20); g.lineTo(140, 38); g.lineTo(2, 38); } else { g.moveTo(20, 2); g.lineTo(158, 2); g.lineTo(158, 38); g.lineTo(20, 38); g.lineTo(2, 20); } g.fill();
    g.fillStyle = '#f2f4f6'; g.font = 'bold 22px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, right ? 72 : 88, 21);
    return c;
  };
  const town = canvas(192, 64), tg = town.getContext('2d');
  tg.fillStyle = '#f1efe8'; tg.fillRect(0, 0, 192, 64); tg.strokeStyle = '#7a2a24'; tg.lineWidth = 5; tg.strokeRect(4, 4, 184, 56);   // a thin red border (photo 63)
  tg.fillStyle = '#1b1b1b'; tg.font = 'bold 40px Arial, Helvetica, sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.fillText('BREAZA', 96, 34);
  const note = canvas(64, 80), ng = note.getContext('2d');
  ng.fillStyle = '#e9e4da'; ng.fillRect(0, 0, 64, 80); ng.strokeStyle = '#8e7a6c'; ng.lineWidth = 2; ng.strokeRect(2, 2, 60, 76);
  ng.fillStyle = 'rgba(170,70,60,0.7)'; for (let k = 0; k < 8; k++) ng.fillRect(8, 10 + k * 8, 48 - (k % 3) * 8, 3);
  const cart = canvas(128, 128), cg = cart.getContext('2d');
  cg.clearRect(0, 0, 128, 128); cg.fillStyle = '#c7303a'; cg.beginPath(); cg.arc(64, 64, 63, 0, 7); cg.fill(); cg.fillStyle = '#f4f2ee'; cg.beginPath(); cg.arc(64, 64, 50, 0, 7); cg.fill();
  cg.fillStyle = '#161616'; cg.fillRect(30, 60, 40, 12); cg.beginPath(); cg.arc(46, 78, 9, 0, 7); cg.fill();          // the cart
  cg.fillRect(70, 52, 20, 12); cg.fillRect(86, 40, 6, 16); cg.fillRect(74, 64, 4, 18); cg.fillRect(86, 64, 4, 18);      // the horse
  const cplate = canvas(64, 48), cpg = cplate.getContext('2d');
  cpg.fillStyle = '#f1efe8'; cpg.fillRect(0, 0, 64, 48); cpg.strokeStyle = '#1b1b1b'; cpg.lineWidth = 2; cpg.strokeRect(2, 2, 60, 44);
  cpg.fillStyle = '#333'; for (let k = 0; k < 3; k++) cpg.fillRect(9, 12 + k * 10, 46 - k * 6, 4);
  const face = (c, o = {}) => std({ map: tex(c), roughness: 0.45, transparent: !!o.alpha, alphaTest: o.alpha ? 0.5 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
  const dryGrass = M.grassGround ? M.grassGround.clone() : std({ color: 0x8d8a5a });
  dryGrass.color = new THREE.Color(0xb8ac7c); dryGrass.polygonOffset = true; dryGrass.polygonOffsetFactor = -1; dryGrass.polygonOffsetUnits = -2;
  MT = {
    fill: Object.assign(M.asphalt.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    mark: Object.assign(M.marking.clone(), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    kerb: M.curb ?? M.concrete, kerbP: std({ map: kerbTex, roughness: 0.85 }), top: dryGrass,
    billboard: face(bb), frame: std({ color: 0x4a4640, roughness: 0.7, metalness: 0.3 }),
    stone: std({ map: tex(st, { repeat: true }), roughness: 0.95 }),
    green: std({ color: 0x2c7a3a, roughness: 0.55, metalness: 0.35 }),
    lettersW: std({ map: tex(letters('#f2f1ec')), alphaTest: 0.5, roughness: 0.6 }),
    lettersG: std({ map: tex(letters('#2f8a3e')), alphaTest: 0.5, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }),
    tri: std({ map: tex(cor), roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    flagEU: face(flagEU, { double: true }), flagRO: face(flagRO, { double: true }), flagP: face(flagP, { double: true }),
    stop: face(stop, { alpha: true }), ploiesti: face(plate('Ploiești', true), { alpha: true }), brasov: face(plate('Brașov', false), { alpha: true }),
    town: face(town), note: face(note), cart: face(cart, { alpha: true }), cplate: face(cplate),
    back: std({ color: 0x8e9296, roughness: 0.6, metalness: 0.5 }), galv: M.galv,
    rust: std({ color: 0x7d5a42, roughness: 0.8, metalness: 0.35 }), lamp: std({ color: 0x3a3d40, roughness: 0.5, metalness: 0.5 }),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildBreaza(B, world) {
  const Y = layout();
  if (!Y) return null;
  const Mt = mats();
  const { FO, FI, FR, FL, rows, iTip, iEnd, mid, sStop, ray, cam } = Y;
  const A = { fill: new Acc(), mark: new Acc(), kerb: new Acc(), kerbP: new Acc(), top: new Acc(), billboard: new Acc(), stone: new Acc(), lettersW: new Acc(), lettersG: new Acc(), tri: new Acc(), flagEU: new Acc(), flagRO: new Acc(), flagP: new Acc(), stop: new Acc(), ploiesti: new Acc(), brasov: new Acc(), town: new Acc(), note: new Acc(), cart: new Acc(), cplate: new Acc() };
  const G = { stone: [], green: [], frame: [], back: [], galv: [], rust: [], lamp: [] };
  const Yat = (x, z) => heightAt(x, z);
  const box = (x, z, hx, hz, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hx, hz, rot, y0, y1, tag));

  // ---- the hatched gore between the branches, up to the island: the bridge's solid centre line runs on to the fork and
  //      opens there into the gore's two edge lines (a wedge over the lanes' shared asphalt until they are 1 m apart, then
  //      along the branches' inner edges), asphalt between them, 0.5 m stripes every 2.5 m slanting forwards
  if (iTip > 0) {
    const FS = Y.FS, J = Wf(FS, FS.L, 0), i1 = Math.max(1, rows.findIndex(r => r.g >= 1)), S1 = rows[i1].s;
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const EO = [], EI = [];
    for (let k = 0; k <= iTip; k++) {
      const r = rows[k];
      if (k < i1) { EO.push(lerp(J, rows[i1].eo, r.s / S1)); EI.push(lerp(J, rows[i1].ei, r.s / S1)); } else { EO.push(r.eo); EI.push(r.ei); }
    }
    const surf = (x, z) => {
      let y = heightAt(x, z) + 0.03;
      for (const F of [FI, FO]) { const q = F.local(x, z); if (q && q.d <= HW + 0.05) { const c = F.at(q.s); y = Math.max(y, heightAt(c.x, c.z) + 0.036); } }
      return y;
    };
    const markY = (x, z) => surf(x, z) + 0.012;
    const inward = (P, Q, k, d) => { const dx = Q[k][0] - P[k][0], dz = Q[k][1] - P[k][1], l = Math.hypot(dx, dz) || 1; return [P[k][0] + dx / l * d, P[k][1] + dz / l * d]; };
    drapeFn(A.fill, [...EO.slice(1), ...[...EI.slice(1)].reverse()], surf, 1, 3);
    const line = (pts) => { for (let k = 0; k < pts.length - 1; k++) drapeFn(A.mark, [pts[k][0], pts[k + 1][0], pts[k + 1][1], pts[k][1]], markY, 2, 1); };
    line([0, FS.L].map(s => [Wf(FS, s, -0.1), Wf(FS, s, 0.1)]));
    const w = (k) => Math.min(0.2, Math.hypot(EO[k][0] - EI[k][0], EO[k][1] - EI[k][1]) / 2);
    line(EO.map((p, k) => k === 0 ? [Wf(FS, FS.L, 0.1), J] : [p, inward(EO, EI, k, w(k))]));
    line(EI.map((p, k) => k === 0 ? [J, Wf(FS, FS.L, -0.1)] : [p, inward(EI, EO, k, w(k))]));
    for (let k = 6; k < EO.length - 4; k += 5) {
      if (Math.hypot(EO[k][0] - EI[k][0], EO[k][1] - EI[k][1]) < 0.9) continue;
      drapeFn(A.mark, [inward(EO, EI, k, 0.2), inward(EO, EI, k + 1, 0.2), inward(EI, EO, Math.min(EI.length - 1, k + 4), 0.2), inward(EI, EO, k + 3, 0.2)], markY, 2, 1);
    }
  }

  // ---- the island: kerbed all round, dry grass on top
  if (iTip >= 0 && iEnd > iTip) {
    const I = rows.slice(iTip, iEnd + 1), ring = [...I.map(r => r.eo), ...[...I].reverse().map(r => r.ei)];
    const inset = (p, q) => { const cx = q[0], cz = q[1], dx = cx - p[0], dz = cz - p[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 0.15, p[1] + dz / l * 0.15]; };
    const c = mid(I[Math.floor(I.length / 2)]);
    drape(A.top, ring.map(p => inset(p, c)), 0.15, 1, 2);
    kerbRing(A.kerbP, ring, c);
  }

  // ---- kerbs of the grass either side: the billboard's triangle (ramp / incoming branch; painted like the island's) and
  //      BREAZA's (ours / link)
  kerbBetween(A.kerbP, FI, -HW, FR, 2.0, 1.0, 45);
  //      and the triangle's side along DN1 (its 15 m carriageway's south-west edge), where it is clear of the two branches
  {
    const dn = road(IDS.DN1);
    if (dn) {
      // the longest run of edge points inside the triangle: right of the ramp, left of the incoming branch, clear of both
      const FD = frame(pairs(dn.p));
      let run = [], best = [];
      for (let s = 0; s <= FD.L + 1; s += 1) {
        const p = s <= FD.L ? Wf(FD, s, dn.w / 2) : null, qr = p && FR.local(p[0], p[1]), qi = p && FI.local(p[0], p[1]);
        if (p && qr.o > 2.0 + 1.0 && qi.o < -HW - 1.0) { run.push(s); continue; }
        if (run.length > best.length) best = run;
        run = [];
      }
      if (best.length > 1) kerbRun(A.kerbP, best.map(s => Wf(FD, s, dn.w / 2)), best.map(s => Wf(FD, s, dn.w / 2 + 1)));
    }
  }
  kerbBetween(A.kerb, FO, HW, FL, -2.0, 1.0, FO.L - 1);

  // ---- the monument (photo 63; its form from Street View, 2022): "BREAZA" on a green steel A-frame over a stone plinth,
  //      just past the island's nose. The plinth is a wedge of stone slabs, 0.71 m at the back sloping to 0.15 m at the
  //      front; the frame's plane runs at 50° with the white letters towards our branch and a taller green set towards the
  //      incoming one (photo 63 sees the green side ~15° off edge-on), the legs meeting at the top over a green corrugated
  //      triangle, three flags leaning out of it. Sizes from photo 63 (1° = 0.59 m there): the plinth 0.71 m high and
  //      ~1 m deep, the top 2.9 m, the legs ~2 m apart; the rest in Street View's proportions to those (the white letters
  //      0.84-1.58 m and 2.5 m wide, the triangle from 1.96 m)
  {
    const [mx, mz] = ray(RAYS.monument[0], RAYS.monument[1]), [ax, az] = dirOf(50), [nx, nz] = dirOf(140);   // along the frame, its front
    const rot = -Math.atan2(az, ax), L = 1.2, D = 0.5, hB = 0.71, hF = 0.15, T = 0.8, H = 2.9;               // stone tiles 0.8 m
    const P = (u, w) => [mx + ax * u + nx * w, mz + az * u + nz * w];
    const hs = [[-L, -D], [L, -D], [L, D], [-L, D]].map(([u, w]) => Yat(...P(u, w)));
    const y = Math.max(...hs) + 0.15, yb = Math.min(...hs) - 0.05;
    const V = (u, w, h) => { const [x, z] = P(u, w); return [x, h, z]; };
    const F = (u, h, w = 0) => V(u, w, y + h);
    // the plinth: sloping top, front, back and the two trapezoid ends
    A.stone.quad(F(-L, hB, -D), F(L, hB, -D), F(L, hF, D), F(-L, hF, D), UP, [0, 0, 2 * L / T, 0, 2 * L / T, 1.2 / T, 0, 1.2 / T]);
    A.stone.quad(V(-L, D, yb), V(L, D, yb), F(L, hF, D), F(-L, hF, D), [nx, 0, nz], [0, 0, 2 * L / T, 0, 2 * L / T, (y + hF - yb) / T, 0, (y + hF - yb) / T]);
    A.stone.quad(V(-L, -D, yb), V(L, -D, yb), F(L, hB, -D), F(-L, hB, -D), [-nx, 0, -nz], [0, 0, 2 * L / T, 0, 2 * L / T, (y + hB - yb) / T, 0, (y + hB - yb) / T]);
    for (const sd of [-1, 1]) A.stone.quad(V(sd * L, -D, yb), V(sd * L, D, yb), F(sd * L, hF, D), F(sd * L, hB, -D), [ax * sd, 0, az * sd], [0, 0, 2 * D / T, 0, 2 * D / T, (y + hF - yb) / T, 0, (y + hB - yb) / T]);
    box(mx, mz, L, D, rot, yb - 0.2, y + H, 'monument');
    // the A-frame on the plinth, its legs 2 m apart meeting at the top, the triangle between them over 1.96 m; the
    // letters' bars either side
    const hm = (hB + hF) / 2 - 0.05, h3 = 1.96, tb = 1.0 * (H - h3) / (H - hm);
    for (const sd of [-1, 1]) tube(G.green, F(1.0 * sd, hm), F(0, H), 0.045);
    for (const [w, h0, h1] of [[0.12, 0.84, 1.58], [-0.12, 0.88, 1.75]]) for (const h of [h0, h1]) tube(G.green, F(-1.5, h, w), F(1.5, h, w), 0.022, 5);
    A.tri.quad(F(-tb, h3), F(tb, h3), F(0, H), F(0, H), [nx, 0, nz], [0, 0, 1, 0, 0.5, 1, 0.5, 1]);
    // the letters: s = 1 reads from the front, -1 from the back
    const letters = (acc, w, W, H, h0, sgn) => acc.quad(F(-W / 2 * sgn, h0, w), F(W / 2 * sgn, h0, w), F(W / 2 * sgn, h0 + H, w), F(-W / 2 * sgn, h0 + H, w), [nx * sgn, 0, nz * sgn], [0, 0, 1, 0, 1, 1, 0, 1]);
    letters(A.lettersW, 0.13, 2.5, 0.74, 0.84, 1);
    letters(A.lettersG, -0.13, 2.8, 0.87, 0.88, -1);
    // three flags on poles tied to the frame's top: the EU flag highest and the tricolour lean east (right in photo 63, over
    // the island's far end in Street View), the pale one north-west
    const E = [0.766, 0.643], NW = [0.26, -0.97];
    [['flagEU', [0.15, 1.9], E, 0.35, 2.88, 100], ['flagRO', [0.2, 1.8], E, 0.45, 2.47, 110], ['flagP', [-0.15, 1.8], NW, 0.35, 2.62, 300]].forEach(([key, [u0, h0], [du, dw], k, h, bearing]) => {
      const top = F(u0 + du * k, h, dw * k), [dx, dz] = dirOf(bearing), fw = key === 'flagP' ? 0.55 : 0.7, fh = key === 'flagP' ? 0.6 : 0.46;
      tube(G.galv, F(u0, h0), [top[0], top[1] + 0.12, top[2]], 0.018, 5);
      A[key].quad([top[0], top[1] - fh, top[2]], [top[0] + dx * fw, top[1] - fh - 0.06, top[2] + dz * fw], [top[0] + dx * fw, top[1] - 0.04, top[2] + dz * fw], top, [dz, 0, -dx], [0, 0, 1, 0, 1, 1, 0, 1]);
    });
  }

  // ---- the golf billboard in the grass triangle, facing the fork; a lamp on an arm over it
  {
    const [x, z] = ray(RAYS.billboard[0], RAYS.billboard[1]), [dx, dz] = [cam[0] - x, cam[1] - z], l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l, nx = -fz, nz = fx;
    const y = Yat(x, z), w = 2.4, h = 4.3, b = 0.05;
    A.billboard.quad([x - nx * w / 2, y + b, z - nz * w / 2], [x + nx * w / 2, y + b, z + nz * w / 2], [x + nx * w / 2, y + b + h, z + nz * w / 2], [x - nx * w / 2, y + b + h, z - nz * w / 2], [fx, 0, fz], [1, 0, 0, 0, 0, 1, 1, 1]);   // (u from the viewer's left)
    boxAt(G.frame, x - fx * 0.05, y + b + h / 2, z - fz * 0.05, 0.06, h + 0.1, w + 0.1, -Math.atan2(fz, fx));
    for (const sd of [-1, 1]) cyl(G.frame, x - fx * 0.15 + nx * (w / 2 - 0.2) * sd, y - 0.3, z - fz * 0.15 + nz * (w / 2 - 0.2) * sd, h + 0.6, 0.05);
    tube(G.frame, [x - fx * 0.15, y + h + 0.3, z - fz * 0.15], [x + fx * 0.6, y + h + 0.75, z + fz * 0.6], 0.025);
    boxAt(G.lamp, x + fx * 0.65, y + h + 0.7, z + fz * 0.65, 0.3, 0.08, 0.2, -Math.atan2(fz, fx));
    box(x - fx * 0.1, z - fz * 0.1, w / 2, 0.12, Math.atan2(-fx, -fz), y - 0.3, y + h + 0.3, 'billboard');   // long side across (-fz, fx)
  }

  // ---- the rusty lamp post with the notice and BREAZA, and the double lamp post at the STOP with the direction plates
  const wires = [];
  let top1 = null, top2 = null;
  {
    const [x, z] = ray(RAYS.breaza[0], RAYS.breaza[1]), y = Yat(x, z), H = 9.2;
    cyl(G.rust, x, y - 0.3, z, H + 0.3, 0.075, 0.06);
    const [fx, fz] = [cam[0] - x, cam[1] - z], l = Math.hypot(fx, fz), ux = fx / l, uz = fz / l, nx = -uz, nz = ux, rot = -Math.atan2(uz, ux);
    const plateQ = (acc, w, h, yc, off = 0.07) => { const cx = x + ux * off, cz = z + uz * off; acc.quad([cx - nx * w / 2, yc - h / 2, cz - nz * w / 2], [cx + nx * w / 2, yc - h / 2, cz + nz * w / 2], [cx + nx * w / 2, yc + h / 2, cz + nz * w / 2], [cx - nx * w / 2, yc + h / 2, cz - nz * w / 2], [ux, 0, uz], [1, 0, 0, 0, 0, 1, 1, 1]); boxAt(G.back, cx - ux * 0.015, yc, cz - uz * 0.015, 0.02, h, w, rot); };
    plateQ(A.town, 1.3, 0.44, y + 2.55);
    plateQ(A.note, 0.48, 0.6, y + 3.75);
    // the lamp: an arm towards our branch
    const [ox, oz] = Wf(FO, FO.local(x, z).s, 0), ax = ox - x, az = oz - z, al = Math.hypot(ax, az) || 1;
    tube(G.rust, [x, y + H - 0.2, z], [x + ax / al * 1.6, y + H + 0.1, z + az / al * 1.6], 0.035);
    boxAt(G.lamp, x + ax / al * 1.8, y + H + 0.05, z + az / al * 1.8, 0.55, 0.12, 0.25, -Math.atan2(az, ax));
    box(x, z, 0.12, 0.12, 0, y, y + H, 'pole');
    top1 = [x, y + H - 0.4, z];
  }
  {
    const qs = sStop, [sx, sz] = Wf(FO, qs, HW + 0.7), sy = Yat(sx, sz), [ux, uz] = FO.dir(qs), fx = -ux, fz = -uz, nx = -fz, nz = fx, rot = -Math.atan2(fz, fx);
    const signQ = (acc, cx, cz, w, h, yc, backMat = G.back) => { acc.quad([cx - nx * w / 2, yc - h / 2, cz - nz * w / 2], [cx + nx * w / 2, yc - h / 2, cz + nz * w / 2], [cx + nx * w / 2, yc + h / 2, cz + nz * w / 2], [cx - nx * w / 2, yc + h / 2, cz - nz * w / 2], [fx, 0, fz], [1, 0, 0, 0, 0, 1, 1, 1]); boxAt(backMat, cx - fx * 0.012, yc, cz - fz * 0.012, 0.015, h * 0.96, w * 0.96, rot); };
    // STOP on its own post
    cyl(G.galv, sx, sy - 0.2, sz, 2.3, 0.03);
    signQ(A.stop, sx + fx * 0.04, sz + fz * 0.04, 0.7, 0.7, sy + 1.85);
    box(sx, sz, 0.05, 0.05, 0, sy, sy + 2.3, 'sign');
    // the double lamp post 0.5 m further right, the plates on it
    const [lx, lz] = Wf(FO, qs + 0.3, HW + 1.25), ly = Yat(lx, lz), H = 8.2;
    cyl(G.galv, lx, ly - 0.3, lz, H + 0.3, 0.075, 0.055);
    for (const sd of [-1, 1]) { const ex = lx + (nx * sd * 0.9 + fx * 0.2), ez = lz + (nz * sd * 0.9 + fz * 0.2); tube(G.galv, [lx, ly + H - 0.4, lz], [ex, ly + H + 0.2, ez], 0.03); boxAt(G.lamp, ex, ly + H + 0.15, ez, 0.5, 0.1, 0.22, rot); }
    signQ(A.ploiesti, lx + fx * 0.08, lz + fz * 0.08, 1.05, 0.26, ly + 2.75);
    signQ(A.brasov, lx + fx * 0.08, lz + fz * 0.08, 1.05, 0.26, ly + 2.45);
    box(lx, lz, 0.12, 0.12, 0, ly, ly + H, 'pole');
    top2 = [lx, ly + H - 0.5, lz];
    // the "no animal-drawn carts" sign with its plate, 1.6 m further right
    const [cx, cz] = Wf(FO, qs + 0.6, HW + 2.9), cy = Yat(cx, cz);
    cyl(G.galv, cx, cy - 0.2, cz, 2.6, 0.03);
    signQ(A.cart, cx + fx * 0.04, cz + fz * 0.04, 0.6, 0.6, cy + 2.2);
    signQ(A.cplate, cx + fx * 0.04, cz + fz * 0.04, 0.45, 0.32, cy + 1.7);
    box(cx, cz, 0.05, 0.05, 0, cy, cy + 2.6, 'sign');
  }
  if (top1 && top2) catenary(wires, top1, top2, 0.9, 14);

  // ---- flush
  const flat = { noCast: true };
  for (const [k, o] of [['fill', flat], ['mark', flat], ['kerb', {}], ['kerbP', {}], ['top', flat], ['billboard', {}], ['stone', {}], ['lettersW', {}], ['lettersG', {}], ['tri', {}], ['flagEU', {}], ['flagRO', {}], ['flagP', {}], ['stop', {}], ['ploiesti', {}], ['brasov', {}], ['town', {}], ['note', {}], ['cart', {}], ['cplate', {}]]) A[k].flush(B, Mt[k], null, o);
  for (const k of Object.keys(G)) if (G[k].length) B.geo(Mt[k], merged(G[k]));

  // photo 63's view
  const [tx, tz] = dirOf(CAM.bearing);
  return { type: 'breaza', name: 'DN1 · intrarea în Breaza', wires, view: { from: cam, to: [cam[0] + tx * 40, cam[1] + tz * 40], eye: CAM.eye } };
}

// a draped polygon like pitigaia's drape(), its height from yFn(x, z)
function drapeFn(acc, P, yFn, maxEdge = 1, tile = 3) {
  const faces = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
  const emit = (a, b, c) => {
    const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (l > maxEdge) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return;
    }
    const V = [a, b, c].map(([x, z]) => [x, yFn(x, z), z]);
    acc.quad(V[0], V[1], V[2], V[0], UP, [a[0] / tile, a[1] / tile, b[0] / tile, b[1] / tile, c[0] / tile, c[1] / tile, a[0] / tile, a[1] / tile]);
  };
  for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
}
// kerb along a closed ring (faces outwards from c), 0.15 m high
function kerbRing(acc, ring, c) {
  let u = 0;                                                     // along the kerb, m (the paint's 1 m blocks run on)
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length], ya = heightAt(a[0], a[1]), yb = heightAt(b[0], b[1]);
    const mx = (a[0] + b[0]) / 2 - c[0], mz = (a[1] + b[1]) / 2 - c[1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l; if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const uv = [u, 0, u + l, 0, u + l, 0.15, u, 0.15]; u += l;
    acc.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + 0.15, b[1]], [a[0], ya + 0.15, a[1]], [nx, 0, nz], uv);
    const ia = [a[0] - nx * 0.15, a[1] - nz * 0.15], ib = [b[0] - nx * 0.15, b[1] - nz * 0.15];
    acc.quad([a[0], ya + 0.15, a[1]], [b[0], yb + 0.15, b[1]], [ib[0], yb + 0.15, ib[1]], [ia[0], ya + 0.15, ia[1]], UP, uv);
  }
}
// kerbs on both sides of the grass between two roads (edge oA of FA, edge oB of FB), where they are > gmin apart
function kerbBetween(acc, FA, oA, FB, oB, gmin, sMax) {
  const ea = [], eb = [];
  for (let s = 0; s <= Math.min(sMax, FA.L) + 1e-6; s += 1) {
    const p = Wf(FA, s, oA), q = FB.local(p[0], p[1]);
    if (!q || Math.abs(q.o) - Math.abs(oB) < gmin) continue;
    ea.push(p); eb.push(Wf(FB, q.s, oB));
  }
  if (ea.length < 2) return;
  // each kerb faces away from the grass (towards its own road): reference points on the other kerb are on the grass side
  kerbRun(acc, ea, eb); kerbRun(acc, eb, ea);
}
// a kerb along P facing away from the reference points (on the grass side)
function kerbRun(acc, P, sgnRef) {
  let u = 0;
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1], ya = heightAt(a[0], a[1]), yb = heightAt(b[0], b[1]), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l; const r = sgnRef[k]; if (nx * (a[0] - r[0]) + nz * (a[1] - r[1]) < 0) { nx = -nx; nz = -nz; }   // faces the road
    const uv = [u, 0, u + l, 0, u + l, 0.15, u, 0.15]; u += l;
    acc.quad([a[0], ya, a[1]], [b[0], yb, b[1]], [b[0], yb + 0.15, b[1]], [a[0], ya + 0.15, a[1]], [nx, 0, nz], uv);
    const ia = [a[0] - nx * 0.15, a[1] - nz * 0.15], ib = [b[0] - nx * 0.15, b[1] - nz * 0.15];
    acc.quad([a[0], ya + 0.15, a[1]], [b[0], yb + 0.15, b[1]], [ib[0], yb + 0.15, ib[1]], [ia[0], ya + 0.15, ia[1]], UP, uv);
  }
}
