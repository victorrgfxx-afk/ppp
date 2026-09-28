import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, gridHeight, addHole, addHolePoly, addFineZone, inPoly, polyDist } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { heightToNormalCanvas } from '../textures.js';

// Strada Nicolae Grigorescu (DJ100E) in Câmpina, right after the Prahova bridge, from the user's Street View
// screenshots (photos 33-35, 45.1293068 N 25.7207781 E): the junction with Strada Plevnei, the sports ground
// (a small football pitch and three pairs of tennis courts, the middle pair under a white air dome: OSM ways
// 183279523-183279526), the "Seva Parc" gate and Parcul Curiacul by Lacul Curiacul. Layout from OSM and aerial
// imagery (used only for measurements).
//   * the 25-30 m DEM smears the terraces of the sports ground into a 6-7 m slope across each court: every court is
//     levelled at the mean of its corners, with a white retaining wall under a green windscreen fence and chain link
//   * lattice floodlight masts at the court corners, clay courts with nets, artificial turf with small goals
//   * a sidewalk with a kerb on the south side, concrete poles with the low-voltage lines, street lamps
//   * the grass triangle between the two roads with a backhoe loader and the brown tourist sign (photo 33)
//   * Seva Parc: white gate with tree-branch leaves under an arched sign, a row of tall thujas (photo 34)
//   * Parcul Curiacul: lawn, decorative metal fence along the sidewalk, columnar thujas, globe lamps, benches,
//     a green litter bin at the kerb (photo 35); its own trees stay
const ROAD_ID = '19752596';
const PITCHES = [
  { id: '183279526', kind: 'soccer', p: [[-944.2, 133.7], [-956.9, 152.0], [-988.2, 130.6], [-975.4, 111.6]] },
  { id: '183279525', kind: 'tennis', p: [[-959.5, 157.1], [-979.7, 188.3], [-1008.3, 169.8], [-988.1, 138.7]] },
  { id: '183279524', kind: 'dome', p: [[-979.4, 191.1], [-1008.1, 172.6], [-1029.2, 205.3], [-1000.6, 223.8]] },
  { id: '183279523', kind: 'tennis', p: [[-1002.9, 228.9], [-1030.1, 208.7], [-1052.8, 239.2], [-1025.7, 259.4]] },
];
// grass triangle between Strada Nicolae Grigorescu, Strada Plevnei and the football pitch
const TRIANGLE = [[-909.0, 96.0], [-943.0, 135.5], [-976.5, 111.0], [-975.0, 104.2], [-923.9, 97.7]];
// Seva Parc: yard and car park in front of the building (OSM 971140530, 971140267), park (1257806043)
const YARD = [[-1031.9, 263.1], [-1043.9, 252.0], [-1058.8, 268.2], [-1071.4, 256.6], [-1094.9, 282.1], [-1070.2, 304.8]];
const PARKING2 = [[-1075.6, 302.2], [-1092.1, 288.6], [-1102.2, 300.7], [-1085.7, 314.3]];
const PARK = [[-1071.1, 316.5], [-1082.5, 333.5], [-1093.0, 351.0], [-1103.7, 370.2], [-1111.6, 387.8], [-1121.0, 415.1], [-1124.1, 425.6], [-1128.4, 440.2], [-1140.0, 481.6], [-1149.4, 514.9], [-1159.7, 551.1], [-1184.3, 543.6], [-1191.0, 525.4], [-1183.6, 501.8], [-1179.4, 478.7], [-1152.5, 438.4], [-1142.1, 417.6], [-1115.7, 364.4], [-1101.4, 335.3], [-1080.5, 308.8]];
const GATE = { seg: 9, t: 0.37 };                 // on the road polyline (aerial imagery)
const SIDE = { road: 3.75, walk: 5.95, kerb: 0.15, fence: 6.1 };

const UP = [0, 1, 0];
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function ctex(w, h, draw, repeat = false, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ road frame
function roadFrame() {
  const r = (GEO.roads || []).find(q => q.id === ROAD_ID);
  if (!r) return null;
  const P = [];
  for (let i = 0; i < r.p.length; i += 2) P.push([r.p[i], r.p[i + 1]]);
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  // point, tangent and (south) normal at distance s along the road
  const at = (s) => {
    let i = 0;
    while (i < P.length - 2 && S[i + 1] < s) i++;
    const l = S[i + 1] - S[i] || 1, t = (s - S[i]) / l;
    const ux = (P[i + 1][0] - P[i][0]) / l, uz = (P[i + 1][1] - P[i][1]) / l;
    return { x: P[i][0] + (P[i + 1][0] - P[i][0]) * t, z: P[i][1] + (P[i + 1][1] - P[i][1]) * t, ux, uz, nx: -uz, nz: ux };
  };
  const W = (s, o) => { const q = at(s); return [q.x + q.nx * o, q.z + q.nz * o]; };
  // distance along and signed offset of a point (nearest segment)
  const local = (x, z) => {
    let best = null;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l)));
      const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) best = { d, s: S[i] + t * l, o: ((x - ax) * -dz + (z - az) * dx) / l };
    }
    return best;
  };
  return { r, P, S, at, W, local, L: S[S.length - 1] };
}

// ------------------------------------------------------------------ courts: frames, levels, fence lines
let COURTS = null;
function courts(rf) {
  if (COURTS) return COURTS;
  COURTS = PITCHES.map((pt) => {
    const p = pt.p, cx = p.reduce((a, q) => a + q[0], 0) / 4, cz = p.reduce((a, q) => a + q[1], 0) / 4;
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]], e3 = [p[3][0] - p[0][0], p[3][1] - p[0][1]];
    const L1 = Math.hypot(...e1), L3 = Math.hypot(...e3);
    const u = L1 >= L3 ? [e1[0] / L1, e1[1] / L1] : [e3[0] / L3, e3[1] / L3], v = [-u[1], u[0]];
    let a = 0, b = 0;
    for (const q of p) { a = Math.max(a, Math.abs((q[0] - cx) * u[0] + (q[1] - cz) * u[1])); b = Math.max(b, Math.abs((q[0] - cx) * v[0] + (q[1] - cz) * v[1])); }
    // terrace level: between the mean and the lowest corner (the white wall of the football pitch is only ~2 m above
    // the road at the junction on photo 33, the DEM mean would put it 3 m higher)
    const hs = p.map(q => heightAt(q[0], q[1])), L = (hs.reduce((s, h) => s + h, 0) / 4 + Math.min(...hs)) / 2;
    return { ...pt, cx, cz, u, v, a, b, L };
  });
  // fence line per side: 1.5 m around the court, half the gap to a neighbouring court, >= 6.1 m from the road axis
  for (const c of COURTS) {
    c.m = {};
    for (const [key, du, dv] of [['u+', 1, 0], ['u-', -1, 0], ['v+', 0, 1], ['v-', 0, -1]]) {
      const side = (m) => {
        const pts = [];
        for (const t of [-1, -0.5, 0, 0.5, 1]) {
          const lu = du ? du * (c.a + m) : t * c.a, lv = dv ? dv * (c.b + m) : t * c.b;
          pts.push([c.cx + c.u[0] * lu + c.v[0] * lv, c.cz + c.u[1] * lu + c.v[1] * lv]);
        }
        return pts;
      };
      let m = 1.5;
      for (const o of COURTS) {
        if (o === c) continue;
        const gap = Math.min(...side(0).map(([x, z]) => inPoly(o.p, x, z) ? 0 : polyDist(o.p, x, z)));
        if (gap < 4) m = Math.min(m, gap / 2 - 0.05);
      }
      const dRoad = Math.min(...side(0).map(([x, z]) => rf.local(x, z).d));
      if (dRoad < 12) m = Math.min(m, dRoad - SIDE.fence);
      c.m[key] = m;
    }
    c.u0 = -c.a - c.m['u-']; c.u1 = c.a + c.m['u+']; c.v0 = -c.b - c.m['v-']; c.v1 = c.b + c.m['v+'];
    c.W = (lu, lv) => [c.cx + c.u[0] * lu + c.v[0] * lv, c.cz + c.u[1] * lu + c.v[1] * lv];
    c.loc = (x, z) => [(x - c.cx) * c.u[0] + (z - c.cz) * c.u[1], (x - c.cx) * c.v[0] + (z - c.cz) * c.v[1]];
    c.inside = (x, z, m = 0) => { const [lu, lv] = c.loc(x, z); return lu >= c.u0 - m && lu <= c.u1 + m && lv >= c.v0 - m && lv <= c.v1 + m; };
    c.dist = (x, z) => { const [lu, lv] = c.loc(x, z); return Math.hypot(Math.max(0, c.u0 - lu, lu - c.u1), Math.max(0, c.v0 - lv, lv - c.v1)); };
  }
  return COURTS;
}

// ------------------------------------------------------------------ ground: terraces (before the terrain is built)
// Called before buildTerrain: levels the near-grid nodes under each court (its fence line + 3 m) at the court's level
// minus 0.25 m (the surfaces are drawn on top), blending back to the DEM over 8 m; the roads keep their heights.
export function prepareGrigorescu() {
  const rf = roadFrame();
  if (!rf || !GEO.H) return false;
  const C = courts(rf);
  const { n, ext, step, H } = GEO;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of C) for (const q of c.p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  const pad = 16;
  const roads = GEO.roads.filter(r => { for (let i = 0; i < r.p.length; i += 2) if (r.p[i] > x0 - 40 && r.p[i] < x1 + 40 && r.p[i + 1] > z0 - 40 && r.p[i + 1] < z1 + 40) return true; return false; });
  const nearRoad = (x, z) => {
    for (const r of roads) {
      const p = r.p;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < r.w / 2 + 2.8) return true;
      }
    }
    return false;
  };
  // the road's own profile: the DEM puts a 2.6 m step into the first 12 m after the junction (a ~50 % grade where the
  // Street View car of photo 33 stood); smoothed over +-16 m, the cross-section shape of the grid is kept
  {
    const raw = [], S0 = -20, S1 = 230;
    for (let s = S0; s <= S1; s++) { const [x, z] = rf.W(s, 0); raw.push(gridHeight(GEO, x, z)); }
    const rawAt = (s) => { const f = Math.max(0, Math.min(raw.length - 1.001, s - S0)), i = Math.floor(f); return raw[i] + (raw[i + 1] - raw[i]) * (f - i); };
    const sm = (s) => { let a = 0, k = 0; for (let d = -16; d <= 16; d++) { a += rawAt(s + d); k++; } return a / k; };
    const hw = rf.r.w / 2;
    const ri0 = Math.max(0, Math.floor((Math.min(...rf.P.slice(0, 14).map(p => p[0])) - 20 + ext) / step)), ri1 = Math.min(n - 1, Math.ceil((Math.max(...rf.P.slice(0, 14).map(p => p[0])) + 20 + ext) / step));
    const rj0 = Math.max(0, Math.floor((Math.min(...rf.P.slice(0, 14).map(p => p[1])) - 20 + ext) / step)), rj1 = Math.min(n - 1, Math.ceil((Math.max(...rf.P.slice(0, 14).map(p => p[1])) + 20 + ext) / step));
    const corr = [];
    for (let j = rj0; j <= rj1; j++) for (let i = ri0; i <= ri1; i++) {
      const x = -ext + i * step, z = -ext + j * step, l = rf.local(x, z);
      if (!l || l.s > 215 || l.d > hw + 9) continue;
      const wd = l.d <= hw + 3 ? 1 : 1 - (l.d - hw - 3) / 6, ws = l.s < 200 ? 1 : 1 - (l.s - 200) / 15;
      corr.push([j * n + i, (sm(l.s) - rawAt(l.s)) * wd * ws]);
    }
    for (const [k, d] of corr) H[k] += d;
  }
  const i0 = Math.max(0, Math.floor((x0 - pad + ext) / step)), i1 = Math.min(n - 1, Math.ceil((x1 + pad + ext) / step));
  const j0 = Math.max(0, Math.floor((z0 - pad + ext) / step)), j1 = Math.min(n - 1, Math.ceil((z1 + pad + ext) / step));
  const edits = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -ext + i * step, z = -ext + j * step;
    if (nearRoad(x, z)) continue;
    let lv = Infinity, dn = Infinity, ln = 0;
    for (const c of C) {
      const d = c.dist(x, z);
      if (d <= 3) lv = Math.min(lv, c.L);
      if (d < dn) { dn = d; ln = c.L; }
    }
    const k = j * n + i;
    if (lv < Infinity) edits.push([k, lv - 0.25]);
    else if (dn < 11) { const t = (dn - 3) / 8, s = t * t * (3 - 2 * t); edits.push([k, (ln - 0.25) * (1 - s) + H[k] * s]); }
  }
  for (const [k, h] of edits) H[k] = h;
  // the 5 m grid cannot step: around the courts the terrain is rebuilt at 1 m, level under each fence line (+1.2 m,
  // clear of the road), the levelled grid elsewhere
  const pick = (x, z) => {
    let best = null;
    for (const c of C) if (c.inside(x, z, 1.2) && (!best || c.inside(x, z) && !best.inside(x, z) || (c.inside(x, z) === best.inside(x, z) && c.L < best.L))) best = c;
    return best;
  };
  addFineZone({ x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8, test: (x, z) => C.some(c => c.inside(x, z, 5)),
    h: (x, z) => { const c = pick(x, z); return c && rf.local(x, z).d > SIDE.road + 0.45 ? c.L - 0.03 : gridHeight(GEO, x, z); } });
  return edits.length;
}

// ------------------------------------------------------------------ materials and textures
let MT = null;
function mats() {
  if (MT) return MT;
  const courtTex = (kind) => ctex(512, 512, (g, w, h) => {
    if (kind === 'soccer') {
      for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? '#3f7a34' : '#468a3a'; g.fillRect(0, k * h / 12, w, h / 12); }
    } else { g.fillStyle = '#b4583a'; g.fillRect(0, 0, w, h); }
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const r = (Math.random() - 0.5) * 18; img.data[i] += r; img.data[i + 1] += r; img.data[i + 2] += r; }
    g.putImageData(img, 0, 0);
  });
  const chain = ctex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,74,70,1)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }, true);
  const fabric = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#1f4a33'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)'; g.fillRect(0, y, w, 1); }
  }, true);
  const foliage = (() => {
    // dense scale-leaf sprays: overlapping clumps, darker in the gaps
    const S = 256, Hh = new Float32Array(S * S);
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 900; k++) {
      const cx = rnd() * S, cy = rnd() * S, r = 4 + rnd() * 9, a = 0.5 + rnd() * 0.5;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r * 0.7; dx <= r * 0.7; dx++) {
        const d = (dx * dx) / (r * r * 0.49) + (dy * dy) / (r * r);
        if (d > 1) continue;
        const X = ((Math.round(cx + dx) % S) + S) % S, Y = ((Math.round(cy + dy) % S) + S) % S;
        Hh[Y * S + X] = Math.max(Hh[Y * S + X], a * Math.sqrt(1 - d));
      }
    }
    const map = ctex(S, S, (g) => {
      const img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) { const v = Hh[i]; img.data[i * 4] = 16 + 46 * v; img.data[i * 4 + 1] = 30 + 78 * v; img.data[i * 4 + 2] = 16 + 30 * v; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, true);
    const nrm = new THREE.CanvasTexture(heightToNormalCanvas(Hh, S, S, 4));
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping; nrm.colorSpace = THREE.NoColorSpace;
    return { map, nrm };
  })();
  // decorative park fence: rectangles within rectangles between two rails (photo 35)
  const meander = ctex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#8f9a93'; g.lineWidth = 6; g.lineCap = 'square';
    g.beginPath(); g.moveTo(0, 6); g.lineTo(w, 6); g.moveTo(0, h - 6); g.lineTo(w, h - 6); g.stroke();
    g.lineWidth = 5;
    for (const x0 of [0, w / 2]) {
      g.strokeRect(x0 + 18, 26, w / 2 - 36, h - 52);
      g.strokeRect(x0 + 40, 44, w / 4 - 30, h - 88);
      g.beginPath(); g.moveTo(x0 + w / 4 + 10, 26); g.lineTo(x0 + w / 4 + 10, h - 26); g.moveTo(x0 + w / 4 + 10, h / 2); g.lineTo(x0 + w / 2 - 18, h / 2); g.stroke();
      g.beginPath(); g.moveTo(x0 + 2, 6); g.lineTo(x0 + 2, h - 6); g.stroke();
    }
  }, true);
  // Seva Parc gate leaves: white branches fanning out from the bottom middle, under an arched top rail
  const branches = ctex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#f4f4f2'; g.lineCap = 'round';
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const br = (x, y, a, l, wd, d) => {
      const x2 = x + Math.cos(a) * l, y2 = y - Math.sin(a) * l;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.2) * l * 0.5, y - Math.sin(a + 0.2) * l * 0.5, x2, y2); g.stroke();
      if (d < 4) for (const s of [-1, 1]) br(x2, y2, a + s * (0.25 + rnd() * 0.3), l * (0.62 + rnd() * 0.2), wd * 0.68, d + 1);
    };
    for (let k = 0; k < 7; k++) br(w / 2, h - 4, Math.PI * (0.15 + 0.7 * k / 6), h * 0.36, 7, 0);
    g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  });
  const sevaSign = ctex(512, 96, (g, w, h) => {
    g.fillStyle = '#1d2a24'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8e8e2'; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#f2f2ee'; g.font = 'bold 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SEVA PARC', w / 2, h / 2 + 3);
  });
  // brown tourist sign (photo 33; its text is not readable on the screenshot: the two museums of Câmpina)
  const brown = (line1, line2) => ctex(256, 72, (g, w, h) => {
    g.fillStyle = '#6a3a1e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f1ece4'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#f1ece4';
    g.beginPath(); g.moveTo(24, 14); g.lineTo(36, 30); g.lineTo(28, 30); g.lineTo(28, 58); g.lineTo(20, 58); g.lineTo(20, 30); g.lineTo(12, 30); g.closePath(); g.fill();
    g.fillRect(w - 44, 26, 32, 4); g.beginPath(); g.moveTo(w - 46, 26); g.lineTo(w - 28, 14); g.lineTo(w - 10, 26); g.fill();
    for (let k = 0; k < 4; k++) g.fillRect(w - 42 + k * 8, 32, 4, 20);
    g.fillRect(w - 46, 54, 36, 4);
    g.font = 'bold 15px Arial'; g.textBaseline = 'middle'; g.fillText(line1, 46, 26); g.fillText(line2, 46, 48);
  });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MT = {
    soccer: std({ map: courtTex('soccer'), roughness: 0.9 }),
    clay: std({ map: courtTex('clay'), roughness: 0.95 }),
    lines: std({ color: 0xf2f2ee, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    wall: std({ map: M.concrete.map, normalMap: M.concrete.normalMap, color: 0xf3f2ee, roughness: 0.85 }),
    fabric: std({ map: fabric, roughness: 0.9, side: THREE.DoubleSide }),
    chain: std({ map: chain, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 }),
    post: std({ color: 0x1f3a2c, roughness: 0.55, metalness: 0.4 }),
    net: std({ color: 0x151515, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.9 }),
    dome: std({ color: 0xf1f1ec, roughness: 0.75, side: THREE.DoubleSide }),
    mast: std({ color: 0xa4aaae, roughness: 0.45, metalness: 0.7 }),
    lamp: std({ color: 0x2c2f33, roughness: 0.5, metalness: 0.5 }),
    walk: std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, color: 0xc9c7c2, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }),
    kerb: M.concrete,
    pave: std({ map: M.asphalt.map, normalMap: M.asphalt.normalMap, color: 0xd6d4cf, roughness: 0.93, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    thuja: std({ map: foliage.map, normalMap: foliage.nrm, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 }),
    meander: std({ map: meander, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.45, color: 0xc9d2cc }),
    parkPost: std({ color: 0x6f7a73, roughness: 0.5, metalness: 0.5 }),
    branches: std({ map: branches, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3 }),
    white: std({ color: 0xf0f0ec, roughness: 0.4, metalness: 0.3 }),
    sevaSign: std({ map: sevaSign, roughness: 0.5, side: THREE.DoubleSide }),
    darkFence: std({ color: 0x23262a, roughness: 0.5, metalness: 0.5 }),
    globe: std({ color: 0xf4f2ea, roughness: 0.25, emissive: 0x2a2822 }),
    parkLamp: std({ color: 0x2a3b33, roughness: 0.5, metalness: 0.5 }),
    wood: M.wood, galv: M.galv, pole: M.concretePole, glass: M.lampGlass, black: M.blackMetal,
    bin: std({ color: 0x2d6b3c, roughness: 0.5, metalness: 0.2 }),
    yellow: std({ color: 0xe5ad17, roughness: 0.45, metalness: 0.25 }),
    tyre: std({ color: 0x151515, roughness: 0.9 }),
    cabGlass: std({ color: 0x1b2226, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 }),
    signA: std({ map: brown('Muzeul Memorial', 'Nicolae Grigorescu'), roughness: 0.5 }),
    signB: std({ map: brown('Muzeul Memorial', 'B. P. Hasdeu'), roughness: 0.5 }),
  };
  return MT;
}

// small geometry helpers ------------------------------------------------------------
function boxAt(list, cx, cy, cz, sx, sy, sz, rotY = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(rotY); g.translate(cx, cy, cz); list.push(g);
}
function cyl(list, x, y0, z, h, r0, r1 = r0, seg = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y0 + h / 2, z); list.push(g);
}
function tube(list, p, q, r, seg = 6) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); list.push(g);
}
const merged = (list) => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
function catenary(out, p, q, sag, n = 8) {
  let prev = p;
  for (let k = 1; k <= n; k++) {
    const t = k / n, c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t];
    out.push(prev[0], prev[1], prev[2], c[0], c[1], c[2]); prev = c;
  }
}
// vertical quad between ground points a, b from yb to yt (per end), facing hint
function vquad(acc, a, b, ya0, ya1, yb0, yb1, hint, uv) {
  acc.quad([a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]], hint, uv);
}
// polygon draped on the terrain: triangulated, split until edges are < maxEdge
function drape(acc, P, lift, maxEdge = 3, tile = 3) {
  const contour = P.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const emit = (a, b, c) => {
    const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (l > maxEdge) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca); return;
    }
    const V = [a, b, c].map(([x, z]) => [x, heightAt(x, z) + lift, z]);
    acc.quad(V[0], V[1], V[2], V[0], UP, [a[0] / tile, a[1] / tile, b[0] / tile, b[1] / tile, c[0] / tile, c[1] / tile, a[0] / tile, a[1] / tile]);
  };
  for (const [i, j, k] of faces) emit(P[i], P[j], P[k]);
}
// columnar thuja ('Smaragd'): widest at ~40 % of the height, narrowing to a pointed top, bumpy outline
function thuja(list, x, y, z, H, R, seed) {
  const pts = [], NV = 16;
  for (let k = 0; k <= NV; k++) {
    const t = k / NV, r = R * (0.78 + 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.8);
    pts.push(new THREE.Vector2(Math.max(0.015, t === 0 ? r * 0.7 : r), t * H));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), h = p.getY(i);
    const f = 1 + 0.13 * Math.sin(seed * 3.1 + h * 2.7 + a * 3) + 0.08 * Math.sin(seed + h * 6.3 - a * 5) + 0.05 * Math.sin(h * 11 + a * 7 + seed);
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * H / 1.2);
  g.translate(x, y - 0.1, z); list.push(g);
}
// lattice floodlight mast: triangular section, zigzag lacing, two floodlights aimed at (ax, az)
function mast(list, heads, x, y, z, H, ax, az) {
  const r = 0.32, P = (k, h) => [x + r * Math.cos(k * 2.094), y + h, z + r * Math.sin(k * 2.094)];
  for (let k = 0; k < 3; k++) tube(list, P(k, 0), P(k, H), 0.035, 5);
  for (let h = 0, s = 0; h < H - 0.1; h += 0.7, s++) for (let k = 0; k < 3; k++) tube(list, P(k, h), P((k + 1) % 3, h + 0.7), 0.014, 4);
  boxAt(list, x, y + H + 0.05, z, 1.6, 0.08, 0.5, -Math.atan2(az - z, ax - x));
  const a = Math.atan2(az - z, ax - x);
  for (const s of [-0.5, 0.5]) {
    const hx = x + Math.cos(a) * 0.3 - Math.sin(a) * s, hz = z + Math.sin(a) * 0.3 + Math.cos(a) * s;
    const g = new THREE.BoxGeometry(0.5, 0.42, 0.5); g.rotateZ(0.5); g.rotateY(-a); g.translate(hx, y + H + 0.35, hz); heads.push(g);
  }
}

// ------------------------------------------------------------------ build
export function buildGrigorescu(B, world) {
  const rf = roadFrame();
  if (!rf) return null;
  const Mt = mats(), C = courts(rf);
  const A = { wall: new Acc(), fabric: new Acc(), chain: new Acc(), soccer: new Acc(), clay: new Acc(), lines: new Acc(), net: new Acc(), dome: new Acc(), walk: new Acc(), kerb: new Acc(), pave: new Acc(), meander: new Acc(), branches: new Acc(), sevaSign: new Acc() };
  const G = { post: [], mast: [], heads: [], thuja: [], galv: [], pole: [], glass: [], dark: [], parkPost: [], white: [], globe: [], parkLamp: [], wood: [], black: [], bin: [], yellow: [], tyre: [], cabGlass: [], signA: [], signB: [], lampHead: [] };
  const wires = [];
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));

  // ---- trees out, lawns in
  for (const c of C) addHole([c.cx, c.cz], (c.u1 - c.u0) / 2 + 3, (c.v1 - c.v0) / 2 + 3, c.u[0], c.u[1], { lawn: true, noFences: true });
  addHolePoly(TRIANGLE, { lawn: true, noFences: true });
  addHolePoly(YARD, { noFences: true });
  addHolePoly(PARKING2, { noFences: true });
  addHolePoly(PARK, { lawn: true, scatter: false, noFences: true });
  // sidewalk strip and the verge on the other side: no forest trees on them
  for (let s = 0; s < Math.min(rf.L, 600); s += 10) {
    const q = rf.at(s + 5);
    addHole([q.x + q.nx * 5.2, q.z + q.nz * 5.2], 5.5, 2.4, q.ux, q.uz, { noFences: s > 6 });
    addHole([q.x - q.nx * 5.4, q.z - q.nz * 5.4], 5.5, 1.8, q.ux, q.uz, { noFences: s > 6 });
  }

  // ---- courts
  for (const c of C) {
    const lv = c.L, F = (lu, lv2) => c.W(lu, lv2);
    const corners = [[c.u0, c.v0], [c.u1, c.v0], [c.u1, c.v1], [c.u0, c.v1]];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    if (c.kind !== 'dome') {
      const surf = c.kind === 'soccer' ? A.soccer : A.clay;
      const P3 = corners.map(([a, b]) => { const [x, z] = F(a, b); return [x, lv + 0.02, z]; });
      surf.quad(P3[0], P3[1], P3[2], P3[3], UP, uvs);
      // lines (5 cm): helper draws a strip in court coordinates
      const line = (a0, b0, a1, b1, w = 0.05) => {
        const dl = Math.hypot(a1 - a0, b1 - b0) || 1, na = -(b1 - b0) / dl * w / 2, nb = (a1 - a0) / dl * w / 2;
        const Q = [[a0 + na, b0 + nb], [a1 + na, b1 + nb], [a1 - na, b1 - nb], [a0 - na, b0 - nb]].map(([a, b]) => { const [x, z] = F(a, b); return [x, lv + 0.035, z]; });
        A.lines.quad(Q[0], Q[1], Q[2], Q[3], UP);
      };
      const rect = (a0, b0, a1, b1, w) => { line(a0, b0, a1, b0, w); line(a1, b0, a1, b1, w); line(a1, b1, a0, b1, w); line(a0, b1, a0, b0, w); };
      if (c.kind === 'soccer') {
        const ha = c.a - 1.2, hb = c.b - 1.2;
        rect(-ha, -hb, ha, hb, 0.1); line(0, -hb, 0, hb, 0.1);
        for (let k = 0; k < 24; k++) line(3 * Math.cos(k / 24 * 6.2832), 3 * Math.sin(k / 24 * 6.2832), 3 * Math.cos((k + 1) / 24 * 6.2832), 3 * Math.sin((k + 1) / 24 * 6.2832), 0.1);
        for (const s of [-1, 1]) {
          rect(s * ha, -5, s * (ha - 5), 5, 0.1);
          // small goals (3 x 2 m)
          const gp = [];
          for (const e of [-1.5, 1.5]) { const [x, z] = F(s * (ha + 0.05), e); cyl(gp, x, lv, z, 2, 0.05); }
          const [xa, za] = F(s * (ha + 0.05), -1.5), [xb, zb] = F(s * (ha + 0.05), 1.5);
          tube(gp, [xa, lv + 2, za], [xb, lv + 2, zb], 0.05);
          for (const g of gp) G.white.push(g);
          const nq = [F(s * ha, -1.5), F(s * (ha + 1.2), -1.5), F(s * (ha + 1.2), 1.5), F(s * ha, 1.5)];
          A.net.quad([nq[1][0], lv, nq[1][1]], [nq[2][0], lv, nq[2][1]], [nq[2][0], lv + 1.6, nq[2][1]], [nq[1][0], lv + 1.6, nq[1][1]], [c.u[0] * s, 0, c.u[1] * s]);
        }
      } else {
        // two courts side by side along v; doubles 23.77 x 10.97, singles 8.23
        for (const cb of [-c.b / 2, c.b / 2]) {
          rect(-11.885, cb - 5.485, 11.885, cb + 5.485, 0.05);
          line(-11.885, cb - 4.115, 11.885, cb - 4.115); line(-11.885, cb + 4.115, 11.885, cb + 4.115);
          line(-6.4, cb - 4.115, -6.4, cb + 4.115); line(6.4, cb - 4.115, 6.4, cb + 4.115); line(-6.4, cb, 6.4, cb);
          // net: posts 0.914 m off the doubles lines, 1.07 m high, 0.914 m in the middle
          const [pa, qa] = F(0, cb - 6.4), [pb, qb] = F(0, cb + 6.4);
          cyl(G.post, pa, lv, qa, 1.07, 0.04); cyl(G.post, pb, lv, qb, 1.07, 0.04);
          A.net.quad([pa, lv + 0.05, qa], [pb, lv + 0.05, qb], [pb, lv + 1.07, qb], [pa, lv + 1.07, qa], [c.u[0], 0, c.u[1]]);
          tube(G.white, [pa, lv + 1.07, qa], [(pa + pb) / 2, lv + 0.93, (qa + qb) / 2], 0.03, 4);
          tube(G.white, [(pa + pb) / 2, lv + 0.93, (qa + qb) / 2], [pb, lv + 1.07, qb], 0.03, 4);
        }
      }
    }
    // base wall (white retaining wall) around the fence line, green windscreen and chain link above it
    const top = c.kind === 'dome' ? 0.6 : 1.0, fab = 3.0, H = c.kind === 'soccer' ? 6.0 : 4.6;
    for (let k = 0; k < 4; k++) {
      const [a0, b0] = corners[k], [a1, b1] = corners[(k + 1) % 4];
      const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / 3));
      const nOut = [c.u[0] * (a0 === a1 ? Math.sign(a0) : 0) + c.v[0] * (b0 === b1 ? Math.sign(b0) : 0), 0, c.u[1] * (a0 === a1 ? Math.sign(a0) : 0) + c.v[1] * (b0 === b1 ? Math.sign(b0) : 0)];
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = F(a0 + (a1 - a0) * t0, b0 + (b1 - b0) * t0), p1 = F(a0 + (a1 - a0) * t1, b0 + (b1 - b0) * t1);
        const g0 = Math.min(heightAt(p0[0], p0[1]), heightAt(p0[0] + nOut[0] * 1.6, p0[1] + nOut[2] * 1.6), lv) - 0.4;
        const g1 = Math.min(heightAt(p1[0], p1[1]), heightAt(p1[0] + nOut[0] * 1.6, p1[1] + nOut[2] * 1.6), lv) - 0.4;
        const w = 0.12, dx = nOut[0] * w, dz = nOut[2] * w;
        const po0 = [p0[0] + dx, p0[1] + dz], po1 = [p1[0] + dx, p1[1] + dz], pi0 = [p0[0] - dx, p0[1] - dz], pi1 = [p1[0] - dx, p1[1] - dz];
        const s0 = (i * len / n) / 2.2, s1 = ((i + 1) * len / n) / 2.2;
        vquad(A.wall, po0, po1, g0, lv + top, g1, lv + top, nOut, [s0, g0 / 2.2, s1, g1 / 2.2, s1, (lv + top) / 2.2, s0, (lv + top) / 2.2]);
        vquad(A.wall, pi0, pi1, lv - 0.3, lv + top, lv - 0.3, lv + top, [-nOut[0], 0, -nOut[2]]);
        A.wall.quad([po0[0], lv + top, po0[1]], [po1[0], lv + top, po1[1]], [pi1[0], lv + top, pi1[1]], [pi0[0], lv + top, pi0[1]], UP);
        if (c.kind !== 'dome') {
          const fu = [s0 * 2.2 / 1.5, s1 * 2.2 / 1.5];
          vquad(A.fabric, p0, p1, lv + top, lv + fab, lv + top, lv + fab, nOut, [fu[0], 0, fu[1], 0, fu[1], 1, fu[0], 1]);
          vquad(A.chain, p0, p1, lv + fab, lv + H, lv + fab, lv + H, nOut, [len * t0 / 0.12, 0, len * t1 / 0.12, 0, len * t1 / 0.12, (H - fab) / 0.12, len * t0 / 0.12, (H - fab) / 0.12]);
          cyl(G.post, p0[0], lv + top, p0[1], H - top + 0.05, 0.045);
          tube(G.post, [p0[0], lv + H, p0[1]], [p1[0], lv + H, p1[1]], 0.03, 5);
        }
      }
      const m0 = F(a0, b0), m1 = F(a1, b1);
      box((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, len / 2, 0.15, Math.atan2(-(m1[1] - m0[1]), m1[0] - m0[0]), Math.min(lv, heightAt((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2)) - 1, lv + (c.kind === 'dome' ? 12 : H), 'fence');
    }
    if (c.kind === 'dome') {
      // air dome: squircle footprint, ellipsoidal section, 11 m high
      const a = (c.u1 - c.u0) / 2 - 0.2, b = (c.v1 - c.v0) / 2 - 0.2, uc = (c.u0 + c.u1) / 2, vc = (c.v0 + c.v1) / 2, Hd = 11, NR = 10, NT = 48;
      const V = (ri, ti) => {
        const r = Math.sin((ri / NR) * Math.PI / 2), th = ti / NT * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        const lu = uc + a * r * Math.sign(cs) * Math.pow(Math.abs(cs), 0.5), lv2 = vc + b * r * Math.sign(sn) * Math.pow(Math.abs(sn), 0.5);
        const [x, z] = F(lu, lv2); return [x, lv + Hd * Math.sqrt(Math.max(0, 1 - r * r)) * (1 - 0.04 * Math.cos(th * 8) * r), z];
      };
      const cDome = F(uc, vc);
      for (let ri = 0; ri < NR; ri++) for (let ti = 0; ti < NT; ti++) {
        const p = [V(ri, ti), V(ri + 1, ti), V(ri + 1, ti + 1), V(ri, ti + 1)];
        const mx = (p[0][0] + p[2][0]) / 2 - cDome[0], mz = (p[0][2] + p[2][2]) / 2 - cDome[1];
        A.dome.quad(p[0], p[1], p[2], p[3], [mx, 6, mz]);
      }
    } else {
      // floodlight masts at the corners, aimed at the middle
      for (const [a, b] of corners) {
        const [x, z] = F(a - Math.sign(a) * 1.3, b - Math.sign(b) * 1.3), [mx, mz] = F(0, 0);
        mast(G.mast, G.heads, x, lv, z, c.kind === 'soccer' ? 13 : 11, mx, mz);
        box(x, z, 0.4, 0.4, 0, lv - 1, lv + 14, 'mast');
      }
    }
  }
  // walkable court surfaces (the terrain under them is 0.25 m lower)
  const courtAt = (x, z) => { for (const c of C) if (c.inside(x, z)) return c.L + 0.02; return null; };

  // ---- sidewalk (south side) with a kerb, a kerb on the north side; skipped at the junction and the entrances
  const gateS = rf.S[GATE.seg] + (rf.S[GATE.seg + 1] - rf.S[GATE.seg]) * GATE.t;
  const parkEntry = rf.S[12];
  const walkEnd = Math.min(rf.L, rf.S[22] + 2);
  const gaps = [[gateS - 2.9, gateS + 2.9], [parkEntry - 5.2, parkEntry + 5.2]];
  const onWalk = (s) => s > 9 && s < walkEnd && !gaps.some(([a, b]) => s > a && s < b);
  const yRoad = (s, o) => { const [x, z] = rf.W(s, o); return heightAt(x, z) + 0.035; };
  let runs = [], cur = null;
  for (let s = 9; s <= walkEnd; s += 2) {
    if (onWalk(s + 1)) { if (!cur) { cur = [s]; runs.push(cur); } cur.push(s + 2); } else cur = null;
  }
  runs = runs.map(r => [r[0], r[r.length - 1]]);
  for (const [sa, sb] of runs) {
    for (let s = sa; s < sb - 1e-6; s += 2) {
      const s1 = Math.min(sb, s + 2);
      const ya = yRoad(s, SIDE.road) + SIDE.kerb, yb = yRoad(s1, SIDE.road) + SIDE.kerb;
      const a0 = rf.W(s, SIDE.road), b0 = rf.W(s1, SIDE.road), a1 = rf.W(s, SIDE.walk), b1 = rf.W(s1, SIDE.walk);
      A.walk.quad([a0[0], ya, a0[1]], [b0[0], yb, b0[1]], [b1[0], yb, b1[1]], [a1[0], ya, a1[1]], UP, [s / 3, 0, s1 / 3, 0, s1 / 3, 0.73, s / 3, 0.73]);
      const q = rf.at(s + 1), nIn = [-q.nx, 0, -q.nz], nOut = [q.nx, 0, q.nz];
      vquad(A.kerb, a0, b0, ya - SIDE.kerb - 0.05, ya, yb - SIDE.kerb - 0.05, yb, nIn, [s / 2.2, 0, s1 / 2.2, 0, s1 / 2.2, 0.1, s / 2.2, 0.1]);
      const ga = Math.min(heightAt(a1[0], a1[1]), ya) - 0.3, gb = Math.min(heightAt(b1[0], b1[1]), yb) - 0.3;
      vquad(A.kerb, a1, b1, ga, ya, gb, yb, nOut, [s / 2.2, ga / 2.2, s1 / 2.2, gb / 2.2, s1 / 2.2, ya / 2.2, s / 2.2, yb / 2.2]);
    }
    for (const s of [sa, sb]) {
      const q = rf.at(s), a0 = rf.W(s, SIDE.road), a1 = rf.W(s, SIDE.walk), y = yRoad(s, SIDE.road) + SIDE.kerb;
      vquad(A.kerb, a0, a1, y - 0.2, y, y - 0.2, y, [s === sa ? -q.ux : q.ux, 0, s === sa ? -q.uz : q.uz]);
    }
  }
  // north kerb along the verge and the low concrete wall at the foot of the wooded slope (photos 34, 35)
  for (let s = 12; s < walkEnd; s += 2) {
    const s1 = Math.min(walkEnd, s + 2), q = rf.at(s + 1);
    const a0 = rf.W(s, -SIDE.road), b0 = rf.W(s1, -SIDE.road), ya = yRoad(s, -SIDE.road), yb = yRoad(s1, -SIDE.road);
    const a1 = rf.W(s, -SIDE.road - 0.15), b1 = rf.W(s1, -SIDE.road - 0.15);
    vquad(A.kerb, a0, b0, ya - 0.1, ya + 0.12, yb - 0.1, yb + 0.12, [q.nx, 0, q.nz]);
    A.kerb.quad([a0[0], ya + 0.12, a0[1]], [b0[0], yb + 0.12, b0[1]], [b1[0], yb + 0.12, b1[1]], [a1[0], ya + 0.12, a1[1]], UP);
    if (s > rf.S[5]) {
      const w0 = rf.W(s, -6.2), w1 = rf.W(s1, -6.2), g0 = heightAt(w0[0], w0[1]), g1 = heightAt(w1[0], w1[1]);
      vquad(A.kerb, w0, w1, g0 - 0.3, g0 + 0.45, g1 - 0.3, g1 + 0.45, [q.nx, 0, q.nz], [s / 2.2, 0, s1 / 2.2, 0, s1 / 2.2, 0.35, s / 2.2, 0.35]);
      const v0 = rf.W(s, -6.45), v1 = rf.W(s1, -6.45);
      A.kerb.quad([w0[0], g0 + 0.45, w0[1]], [w1[0], g1 + 0.45, w1[1]], [v1[0], g1 + 0.45, v1[1]], [v0[0], g0 + 0.45, v0[1]], UP);
    }
  }
  // walkable sidewalk
  const walkAt = (x, z) => {
    const l = rf.local(x, z);
    if (!l || l.o < SIDE.road || l.o > SIDE.walk || !onWalk(l.s)) return null;
    return yRoad(l.s, SIDE.road) + SIDE.kerb;
  };

  // ---- concrete poles with the low-voltage lines (south edge), street lamps
  const polesAt = [];
  for (let s = 22; s < walkEnd - 5; s += 34) {
    let ss = s;
    if (gaps.some(([a, b]) => ss > a - 1.5 && ss < b + 1.5)) ss += 8;
    const [x, z] = rf.W(ss, SIDE.walk - 0.3), y = heightAt(x, z);
    cyl(G.pole, x, y - 0.5, z, 10.5, 0.17, 0.11, 8);
    const q = rf.at(ss), top = y + 9.4;
    tube(G.galv, [x - q.ux * 0.55, top, z - q.uz * 0.55], [x + q.ux * 0.55, top, z + q.uz * 0.55], 0.04);
    polesAt.push([[x - q.ux * 0.5, top + 0.05, z - q.uz * 0.5], [x + q.ux * 0.5, top + 0.05, z + q.uz * 0.5], [x - q.nx * 0.2, top + 0.7, z - q.nz * 0.2], [x, top - 0.6, z]]);
    box(x, z, 0.2, 0.2, 0, y - 1, y + 10, 'pole');
  }
  for (let k = 0; k < polesAt.length - 1; k++) for (let w = 0; w < 4; w++) catenary(wires, polesAt[k][w], polesAt[k + 1][w], 0.45);
  const lamp = (s, o) => {
    const [x, z] = rf.W(s, o), y = heightAt(x, z), q = rf.at(s), sg = o > 0 ? -1 : 1;
    cyl(G.galv, x, y, z, 8.6, 0.12, 0.07, 10);
    const P = (dq, h) => [x + q.nx * sg * dq, y + h, z + q.nz * sg * dq];
    let prev = P(0, 8.55);
    for (let k = 1; k <= 5; k++) { const f = Math.PI / 2 * k / 5, p = P(0.8 - 0.8 * Math.cos(f), 8.55 + 0.8 * Math.sin(f)); tube(G.galv, prev, p, 0.04); prev = p; }
    const end = P(1.9, 9.45); tube(G.galv, prev, end, 0.04);
    const hd = new THREE.BoxGeometry(0.62, 0.12, 0.26); hd.rotateY(-Math.atan2(q.nz * sg, q.nx * sg)); hd.translate(...P(2.15, 9.43)); G.lampHead.push(hd);
    box(x, z, 0.15, 0.15, 0, y - 1, y + 9, 'pole');
  };
  for (let s = 14; s < rf.S[5]; s += 30) lamp(s, -SIDE.road - 0.8);                        // photo 33: on the hillside
  for (let s = rf.S[5] + 12; s < walkEnd - 5; s += 34) if (!gaps.some(([a, b]) => s > a - 2 && s < b + 2)) lamp(s, SIDE.walk - 0.45);

  // ---- grass triangle (photo 33): backhoe loader, brown tourist sign; the silver car is parked by main.js
  const soc = C.find(c => c.kind === 'soccer');
  let car = null, sign = null, backhoe = null;
  if (soc) {
    // the pitch's long axis is across the road: the long side facing the junction borders the grass triangle
    const J = rf.W(0, 0), dJ = (p) => Math.hypot(p[0] - J[0], p[1] - J[1]);
    const vT = dJ(soc.W(0, soc.v0)) < dJ(soc.W(0, soc.v1)) ? soc.v0 : soc.v1, sv = Math.sign(vT);
    const uR = rf.local(...soc.W(soc.u0, 0)).d < rf.local(...soc.W(soc.u1, 0)).d ? soc.u0 : soc.u1, su = Math.sign(uR);
    // dv: out from the triangle-side wall, du: along the wall from its road end
    const at = (dv, du) => soc.W(uR - su * du, vT + sv * dv);
    const dir = (du, dv) => [soc.u[0] * du + soc.v[0] * dv, soc.u[1] * du + soc.v[1] * dv];
    // backhoe: 9 m out on the grass, parallel to the wall, loader bucket away from the road (photo 33)
    const [bx, bz] = at(9, 15), by = heightAt(bx, bz), fwd = dir(-su, 0);
    backhoe = { x: bx, z: bz, y: by };
    buildBackhoe(G, bx, by, bz, Math.atan2(-fwd[1], fwd[0]));
    box(bx, bz, 3.0, 1.3, Math.atan2(-fwd[1], fwd[0]), by - 1, by + 3.6, 'backhoe');
    // brown tourist sign facing the triangle, 3.5 m in front of the wall
    const [sx, sz] = at(3.8, 9), sy = heightAt(sx, sz), fo = dir(0, sv), along = dir(1, 0);
    sign = { x: sx, z: sz };
    for (const e of [-0.55, 0.55]) cyl(G.black, sx + along[0] * e, sy - 0.3, sz + along[1] * e, 2.75, 0.035);
    const panel = (list, y0) => { const g = new THREE.BoxGeometry(1.3, 0.36, 0.03); g.rotateY(-Math.atan2(along[1], along[0])); g.translate(sx + fo[0] * 0.04, y0, sz + fo[1] * 0.04); list.push(g); };
    panel(G.signA, sy + 2.2); panel(G.signB, sy + 1.8);
    box(sx, sz, 0.7, 0.1, Math.atan2(-along[1], along[0]), sy - 1, sy + 2.5, 'sign');
    // silver car on the gravel strip along the white wall, nose towards the road
    const [cx, cz] = at(2.3, 6.5), nose = dir(su, 0);
    car = { x: cx, z: cz, h: Math.atan2(-nose[0], -nose[1]) };
    drape(A.pave, [at(0.2, 1.5), at(0.2, 2 * soc.a + 1), at(4.3, 2 * soc.a + 1), at(4.3, 1.5)], 0.05, 3);
  }

  // ---- Seva Parc (photo 34): gate with the arched sign, side panel, dark fence and tall thujas to the west,
  // a row of small thujas along the car park to the east; yard and car parks paved
  {
    const q = rf.at(gateS), o = SIDE.fence + 0.25, gy = yRoad(gateS, SIDE.walk);
    const P = (ds, dq, h) => { const [x, z] = rf.W(gateS + ds, o + dq); return [x, gy + h, z]; };
    const nIn = [-q.nx, 0, -q.nz];
    for (const ds of [-2.75, 2.75]) { const p = P(ds, 0, 0); cyl(G.white, p[0], gy - 0.2, p[2], 4.45, 0.085); box(p[0], p[2], 0.12, 0.12, 0, gy - 1, gy + 4.5, 'gate'); }
    // arched sign between the posts
    const N = 16;
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N, arc = (t) => 3.95 + 0.75 * Math.sin(Math.PI * t);
      const a = P(-2.75 + 5.5 * t0, 0, 0), b = P(-2.75 + 5.5 * t1, 0, 0);
      // seen from the road +u is on the left: the text runs against u
      vquad(A.sevaSign, [a[0], a[2]], [b[0], b[2]], gy + arc(t0) - 0.24, gy + arc(t0) + 0.24, gy + arc(t1) - 0.24, gy + arc(t1) + 0.24, nIn, [1 - t0, 0, 1 - t1, 0, 1 - t1, 1, 1 - t0, 1]);
      tube(G.white, P(-2.75 + 5.5 * t0, 0.03, arc(t0) - 0.27), P(-2.75 + 5.5 * t1, 0.03, arc(t1) - 0.27), 0.025, 4);
    }
    // two leaves (closed) and the fixed side panel, arched tops
    const leaf = (d0, d1, h0, h1) => {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, ht = (t) => h0 + (h1 - h0) * Math.sin(Math.PI * t);
        const a = P(d0 + (d1 - d0) * t0, 0, 0), b = P(d0 + (d1 - d0) * t1, 0, 0);
        vquad(A.branches, [a[0], a[2]], [b[0], b[2]], gy + 0.08, gy + ht(t0), gy + 0.08, gy + ht(t1), nIn, [t0, 0, t1, 0, t1, ht(t1) / h1, t0, ht(t0) / h1]);
      }
    };
    leaf(-2.66, -0.02, 1.9, 2.25); leaf(0.02, 2.66, 1.9, 2.25); leaf(-4.35, -2.85, 1.55, 1.8);
    { const p = P(-4.45, 0, 0); cyl(G.white, p[0], gy - 0.1, p[2], 1.95, 0.05); }
    { const [gx, , gz] = P(0, 0, 0); box(gx, gz, 2.7, 0.08, Math.atan2(-q.uz, q.ux), gy - 1, gy + 2.3, 'gate'); }
    // dark bar fence and tall thujas to the west, small thujas to the east
    for (let ds = -4.6; ds > -30; ds -= 2.4) {
      const a = P(ds, 0, 0), b = P(Math.max(-30, ds - 2.4), 0, 0);
      tube(G.dark, [a[0], a[1] + 1.55, a[2]], [b[0], b[1] + 1.55, b[2]], 0.025, 4);
      tube(G.dark, [a[0], a[1] + 0.15, a[2]], [b[0], b[1] + 0.15, b[2]], 0.02, 4);
      for (let k = 0; k < 16; k++) { const t = k / 16, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t; cyl(G.dark, x, gy + 0.1, z, 1.5, 0.012, 0.012, 4); }
      box((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, 1.2, 0.06, Math.atan2(-(b[2] - a[2]), b[0] - a[0]), gy - 1, gy + 1.7, 'fence');
    }
    for (let ds = -3.8, k = 0; ds > -29; ds -= 1.35, k++) {
      const [x, z] = rf.W(gateS + ds, o + 1.1 + 0.3 * hash(k, 3)), y = heightAt(x, z);
      thuja(G.thuja, x, Math.max(y, gy - 0.5), z, 5.0 + 1.8 * hash(k, 1), 0.62 + 0.12 * hash(k, 2), k);
    }
    for (let ds = 4.5, k = 0; ds < 30; ds += 3.1, k++) {
      const [x, z] = rf.W(gateS + ds, o + 0.6), y = heightAt(x, z);
      thuja(G.thuja, x, y, z, 2.2 + 0.6 * hash(k, 5), 0.45, k + 40);
    }
    drape(A.pave, YARD, 0.06, 3);
    drape(A.pave, PARKING2, 0.06, 3);
  }

  // ---- Parcul Curiacul (photo 35): decorative fence behind the sidewalk, thujas, globe lamps, benches, bin
  {
    const s0 = parkEntry + 6, s1 = rf.S[22] - 1;
    for (let s = s0; s < s1; s += 2) {
      const e = Math.min(s1, s + 2), a = rf.W(s, SIDE.fence + 0.1), b = rf.W(e, SIDE.fence + 0.1);
      const ya = yRoad(s, SIDE.walk) + 0.02, yb = yRoad(e, SIDE.walk) + 0.02, q = rf.at(s + 1);
      vquad(A.meander, a, b, ya, ya + 0.82, yb, yb + 0.82, [-q.nx, 0, -q.nz], [0, 0, 1, 0, 1, 1, 0, 1]);
      cyl(G.parkPost, a[0], ya - 0.1, a[1], 0.95, 0.03, 0.03, 6);
      box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1.0, 0.05, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), ya - 1, ya + 0.85, 'fence');
    }
    // thujas on the lawn, clear of the path and the lake
    let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 18; tries++) {
      const s = rf.S[14] + rnd() * (rf.S[22] - rf.S[14] - 6), o = 9 + rnd() * 26, [x, z] = rf.W(s, o);
      if (!inPoly(PARK, x, z) || polyDist(PARK, x, z) < 4) continue;
      const path = GEO.roads.find(r => r.id === '971140269');
      if (path) { let d = Infinity; for (let i = 0; i < path.p.length - 2; i += 2) { const ax = path.p[i], az = path.p[i + 1], dx = path.p[i + 2] - ax, dz = path.p[i + 3] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz)); } if (d < 3) continue; }
      thuja(G.thuja, x, heightAt(x, z), z, 2.6 + 1.6 * rnd(), 0.42 + 0.16 * rnd(), placed + 80);
      placed++;
    }
    // globe lamps and benches along the promenade (OSM footway 971140269)
    const path = GEO.roads.find(r => r.id === '971140269');
    if (path) {
      const pts = []; for (let i = 0; i < path.p.length; i += 2) pts.push([path.p[i], path.p[i + 1]]);
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
        for (let d = (22 - acc % 22) % 22; d < l; d += 22) {
          const px = ax + ux * d, pz = az + uz * d;
          const side = inPoly(PARK, px - uz * 1.6, pz + ux * 1.6) ? 1 : -1;
          const lx = px - uz * 1.4 * side, lz = pz + ux * 1.4 * side, y = heightAt(lx, lz);
          cyl(G.parkLamp, lx, y, lz, 3.4, 0.07, 0.05, 8);
          const gl = new THREE.SphereGeometry(0.22, 12, 8); gl.translate(lx, y + 3.62, lz); G.globe.push(gl);
          box(lx, lz, 0.12, 0.12, 0, y - 1, y + 3.5, 'pole');
          // a bench every other lamp, facing the path
          if (Math.round((acc + d) / 22) % 2 === 0) {
            const bx2 = px - uz * 1.5 * side + ux * 5, bz2 = pz + ux * 1.5 * side + uz * 5, by2 = heightAt(bx2, bz2), rot = Math.atan2(ux, uz);
            for (const e of [-0.7, 0.7]) boxAt(G.black, bx2 + ux * e, by2 + 0.22, bz2 + uz * e, 0.06, 0.44, 0.45, rot);
            for (let k = 0; k < 3; k++) boxAt(G.wood, bx2 + (-uz * side) * (k * 0.13 - 0.13), by2 + 0.45, bz2 + (ux * side) * (k * 0.13 - 0.13), 1.7, 0.04, 0.11, rot + Math.PI / 2);
            boxAt(G.wood, bx2 + (-uz * side) * 0.26, by2 + 0.72, bz2 + (ux * side) * 0.26, 1.7, 0.3, 0.04, rot + Math.PI / 2);
            box(bx2, bz2, 0.9, 0.3, Math.atan2(-uz, ux), by2 - 1, by2 + 0.9, 'bench');
          }
        }
        acc += l;
      }
    }
    // green litter bin on a post at the kerb (photo 35)
    const [bx, bz] = rf.W(rf.S[17] + 6, SIDE.road + 0.45), by = yRoad(rf.S[17] + 6, SIDE.road) + SIDE.kerb;
    cyl(G.bin, bx, by + 0.45, bz, 0.62, 0.2, 0.22, 12);
    cyl(G.galv, bx, by, bz, 1.2, 0.035);
    box(bx, bz, 0.25, 0.25, 0, by - 1, by + 1.2, 'bin');
  }

  // ---- flush
  A.soccer.flush(B, Mt.soccer); A.clay.flush(B, Mt.clay); A.lines.flush(B, Mt.lines, null, { noCast: true });
  A.net.flush(B, Mt.net, null, { noCast: true }); A.dome.flush(B, Mt.dome);
  A.wall.flush(B, Mt.wall); A.fabric.flush(B, Mt.fabric); A.chain.flush(B, Mt.chain, null, { noCast: true });
  A.walk.flush(B, Mt.walk, null, { noCast: true }); A.kerb.flush(B, Mt.kerb); A.pave.flush(B, Mt.pave, null, { noCast: true });
  A.meander.flush(B, Mt.meander, null, { noCast: true }); A.branches.flush(B, Mt.branches); A.sevaSign.flush(B, Mt.sevaSign);
  const put = (key, mat, opts) => { if (G[key].length) B.geo(mat, merged(G[key]), null, null, opts); };
  put('post', Mt.post); put('mast', Mt.mast); put('heads', Mt.lamp); put('thuja', Mt.thuja); put('galv', Mt.galv); put('pole', Mt.pole);
  put('dark', Mt.darkFence); put('parkPost', Mt.parkPost); put('white', Mt.white); put('globe', Mt.globe, { noCast: true }); put('parkLamp', Mt.parkLamp);
  put('wood', Mt.wood); put('black', Mt.black); put('bin', Mt.bin); put('yellow', Mt.yellow); put('tyre', Mt.tyre); put('cabGlass', Mt.cabGlass, { noCast: true });
  put('signA', Mt.signA); put('signB', Mt.signB); put('lampHead', Mt.white);

  const surface = (x, z) => courtAt(x, z) ?? walkAt(x, z);
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of rf.P.slice(0, 24)) { bb.x0 = Math.min(bb.x0, p[0] - 60); bb.x1 = Math.max(bb.x1, p[0] + 60); bb.z0 = Math.min(bb.z0, p[1] - 60); bb.z1 = Math.max(bb.z1, p[1] + 60); }
  return { type: 'grigorescu', name: 'Strada Nicolae Grigorescu', W: rf.W, at: rf.at, S: rf.S, gateS, surface, bbox: bb, wires, car, sign, backhoe, courts: C.map(c => ({ kind: c.kind, x: c.cx, z: c.cz, L: c.L, inside: c.inside })) };
}

// backhoe loader (photo 33), ~5.7 m long: yellow body, cab, loader bucket in front, backhoe arm resting on its bucket
function buildBackhoe(G, x, y, z, rot) {
  const T = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
  const add = (key, g) => { g.applyMatrix4(T); G[key].push(g); };
  const b = (key, sx, sy, sz, cx, cy, cz, rz = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(cx, cy, cz); add(key, g); };
  // local: +x = front (loader), z = side
  b('yellow', 3.3, 0.75, 1.7, 0.1, 1.2, 0);                         // chassis
  b('yellow', 1.5, 0.75, 1.3, 1.25, 1.85, 0);                       // engine hood
  b('black', 1.55, 0.08, 1.75, -0.45, 3.35, 0);                      // cab roof
  for (const [cx, cz] of [[-1.15, 0.8], [0.25, 0.8], [-1.15, -0.8], [0.25, -0.8]]) b('black', 0.07, 1.8, 0.07, cx, 2.45, cz);
  b('cabGlass', 1.35, 1.7, 1.55, -0.45, 2.45, 0);
  b('yellow', 0.45, 0.3, 0.3, -0.45, 1.7, 0.55);
  for (const [cx, r, w] of [[-1.05, 0.72, 0.55], [1.25, 0.52, 0.42]]) for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(r, r, w, 18); g.rotateX(Math.PI / 2); g.translate(cx, r, s * 1.02); add('tyre', g);
    const hub = new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 12); hub.rotateX(Math.PI / 2); hub.translate(cx, r, s * 1.02); add('yellow', hub);
  }
  // loader arms and bucket on the ground in front
  for (const s of [-0.85, 0.85]) b('yellow', 2.2, 0.18, 0.14, 2.1, 1.1, s, -0.42);
  b('yellow', 0.9, 0.6, 2.3, 3.25, 0.32, 0);
  // backhoe: stabilisers, boom up and back, dipper down to the bucket on the grass
  for (const s of [-1, 1]) b('yellow', 0.18, 1.2, 0.18, -1.75, 0.6, s * 1.05, 0.1 * s);
  const boom = new THREE.BoxGeometry(2.4, 0.28, 0.24); boom.rotateZ(-1.0); boom.translate(-2.35, 2.15, 0); add('yellow', boom);
  const dip = new THREE.BoxGeometry(2.1, 0.22, 0.2); dip.rotateZ(1.35); dip.translate(-3.05, 1.35, 0); add('yellow', dip);
  b('black', 0.5, 0.45, 0.6, -3.15, 0.25, 0);
}
