import * as THREE from 'three';
import { GEO, heightAt, addHolePoly } from './data.js';
import { Acc } from './bridge.js';
import { M } from '../materials.js';
import { normalFromCanvas } from '../textures.js';
import { rng } from '../util.js';
import { canvas, tex, grain, blobs, boxAt, cyl, drape, merged } from './pitigaia.js';

// Strada Gării by the station's old water tower, from the user's photos 51-53 (45.13282 N 25.71127 E, from a car
// heading north-west, then turning left into the yard):
//  * 51: the street with cars parked on both sides, the wooden water tower and the stucco substation on the left,
//    the gravel strip with painted kerb blocks and the big blue spruce on the right
//  * 52: the substation (two grey steel double doors, vent holes, overhanging slab roof) behind the corrugated sheet
//    fence, the tower (octagonal timber tank house on a brick shaft) behind it, the perforated sheet fence
//  * 53: the gravel yard, the three-storey building with red brick and cream bands, the no-entry sign, the precast
//    concrete panel fence
// None of these buildings is in OSM: footprints measured on Bing aerial imagery (z19, measurements only), refined with
// the distances and bearings read in the ultra-wide photos (substation ~5 m from photo 52's camera, the tower's tank
// house ~15 m, the striped facade ~18 m long); heights and details from the photos. The frame is the game's (+x north-west, +z north-east); here the street runs along x.
const ANNEX = { x0: -97.2, x1: -92.2, z0: -116.3, z1: -111.8, h: 3.5 };
const TOWER = { x: -93.8, z: -124.2, rb: 3.3, rw: 4.6, hb: 7.6, hw: 7.0 };
const SHED = { x0: -109.5, x1: -99.5, z0: -127.5, z1: -119.5, h: 3.8 };
const STRIPED = { x0: -81.5, x1: -69, z0: -141, z1: -123, floors: 3, fh: 3.1 };
const YARD = [[-92.3, -111.3], [-86.3, -111.3], [-86.3, -115.2], [-66, -115.2], [-66, -122.6], [-81.3, -122.6], [-81.3, -141], [-87.2, -141], [-87.2, -121], [-92.1, -116.5]];
const ROAD = '16947615', HW = 2.8;
const UP = [0, 1, 0];
const T_SPRUCE = 2, T_BUSH = 12, T_LOMBARDY = 13;        // trees.js TYPES (12: edge broadleaf, branched to the ground)

// before the terrain: no generated lot fences or village poles where the fronts are rebuilt
export function prepareCastel() {
  const zones = [[[-125, -110.6], [-50, -110.6], [-50, -140], [-125, -140]], [[-126, -106], [-55, -106], [-55, -99], [-126, -99]]];
  for (const Z of zones) addHolePoly(Z, { noFences: true, scatter: false });
  const inZ = (x, z) => zones.some(Z => x > Z[0][0] && x < Z[1][0] && z < Z[0][1] && z > Z[2][1]);
  GEO.fences = (GEO.fences || []).filter(f => !inZ(f[1], f[2]) && !inZ(f[f.length - 2], f[f.length - 1]));
  for (const run of GEO.poles || []) run.p = run.p.filter(p => !(p[0] > -112 && p[0] < -55 && p[1] < -110 && p[1] > -140));
  return true;
}

// ------------------------------------------------------------------ materials
let MT = null;
function mats() {
  if (MT) return MT;
  const R = rng(5213);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // rough cream render, stained low down and under the slab
  const stucco = canvas(512, 512), sg = stucco.getContext('2d');
  sg.fillStyle = '#d9c9a4'; sg.fillRect(0, 0, 512, 512);
  blobs(sg, 0, 0, 512, 512, 90, 10, 70, ['rgba(120,105,80,0.10)', 'rgba(240,230,205,0.14)', 'rgba(90,85,70,0.08)'], R);
  for (let i = 0; i < 14000; i++) { const t = R(); sg.fillStyle = t < 0.5 ? 'rgba(90,80,60,0.13)' : 'rgba(250,240,220,0.16)'; sg.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
  { const g = sg.createLinearGradient(0, 380, 0, 512); g.addColorStop(0, 'rgba(70,65,55,0)'); g.addColorStop(1, 'rgba(70,65,55,0.35)'); sg.fillStyle = g; sg.fillRect(0, 380, 512, 132); }
  grain(sg, 512, 512, 10, R);
  // weathered lapped boards of the tank house: pale grey-green paint, peeling
  const boards = canvas(512, 512), bg = boards.getContext('2d');
  for (let y = 0; y < 512; y += 32) {
    const t = 168 + R() * 22; bg.fillStyle = `rgb(${t - 8},${t + 4},${t - 4})`; bg.fillRect(0, y, 512, 32);
    bg.fillStyle = 'rgba(40,45,40,0.55)'; bg.fillRect(0, y + 29, 512, 3);
    bg.fillStyle = 'rgba(255,255,250,0.18)'; bg.fillRect(0, y, 512, 3);
    for (let k = 0; k < 6; k++) { bg.fillStyle = `rgba(${90 + R() * 30},${80 + R() * 20},${60},0.35)`; bg.fillRect(R() * 512, y + 4 + R() * 20, 10 + R() * 60, 2 + R() * 6); }
  }
  for (let x = 0; x < 512; x += 128 + R() * 60) { bg.fillStyle = 'rgba(40,45,40,0.35)'; bg.fillRect(x, 0, 2, 512); }
  grain(bg, 512, 512, 14, R);
  // red brick
  const brick = canvas(256, 256), kg = brick.getContext('2d');
  kg.fillStyle = '#b9a996'; kg.fillRect(0, 0, 256, 256);
  for (let y = 0, r = 0; y < 256; y += 16, r++) for (let x = (r % 2) * -16; x < 256; x += 32) { const t = R(); kg.fillStyle = `rgb(${140 + t * 40},${58 + t * 22},${42 + t * 14})`; kg.fillRect(x + 1, y + 1, 30, 14); }
  blobs(kg, 0, 0, 256, 256, 30, 8, 40, ['rgba(60,40,30,0.15)', 'rgba(220,210,190,0.1)'], R); grain(kg, 256, 256, 10, R);
  // striped facade bay (3 m wide, 3.1 m per floor): cream render with red brick bands, a white window
  const bay = (top) => {
    const c = canvas(256, 256), g = c.getContext('2d');
    if (top) g.drawImage(brick, 0, 0);
    else for (let y = 0; y < 256; y += 32) { g.fillStyle = '#e4dcc8'; g.fillRect(0, y, 256, 16); g.drawImage(brick, 0, y + 16, 256, 16, 0, y + 16, 256, 16); }
    if (top) {                                                                      // small square grilles up top
      for (const x of [96, 144]) { g.fillStyle = '#2b2622'; g.fillRect(x, 70, 30, 30); g.strokeStyle = '#8a7d70'; g.lineWidth = 2; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + k * 7.5, 70); g.lineTo(x + k * 7.5, 100); g.stroke(); g.beginPath(); g.moveTo(x, 70 + k * 7.5); g.lineTo(x + 30, 70 + k * 7.5); g.stroke(); } }
    } else {
      g.fillStyle = '#f2f2ee'; g.fillRect(80, 60, 96, 130); g.fillStyle = '#39434a'; g.fillRect(88, 68, 36, 114); g.fillRect(132, 68, 36, 114);
      g.fillStyle = 'rgba(200,220,235,0.35)'; g.fillRect(90, 70, 12, 60); g.fillRect(134, 70, 12, 60);
      g.fillStyle = '#d8d2c4'; g.fillRect(74, 190, 108, 8);
    }
    grain(g, 256, 256, 8, R); return c;
  };
  // corrugated grey sheet, perforated galvanised strips, precast concrete panel
  const sheet = canvas(128, 128), hg = sheet.getContext('2d');
  for (let x = 0; x < 128; x++) { const t = 150 + 40 * Math.sin(x / 128 * Math.PI * 16); hg.fillStyle = `rgb(${t},${t + 3},${t + 6})`; hg.fillRect(x, 0, 1, 128); }
  blobs(hg, 0, 0, 128, 128, 16, 6, 26, ['rgba(90,80,70,0.14)', 'rgba(235,235,235,0.12)'], R);
  const perf = canvas(256, 256), pg = perf.getContext('2d');
  pg.fillStyle = '#b8bec3'; pg.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) { pg.fillStyle = 'rgba(60,65,70,0.5)'; pg.fillRect(x, 0, 3, 256); pg.fillStyle = 'rgba(255,255,255,0.25)'; pg.fillRect(x + 3, 0, 2, 256); }
  for (let x = 0; x < 256; x += 64) for (let y = 12; y < 256; y += 26) for (const dx of [20, 44]) { pg.clearRect(0, 0, 0, 0); pg.save(); pg.globalCompositeOperation = 'destination-out'; pg.beginPath(); pg.arc(x + dx, y + (dx === 44 ? 13 : 0), 7, 0, 7); pg.fill(); pg.restore(); }
  grain(pg, 256, 256, 10, R);
  const panel = canvas(256, 128), cg = panel.getContext('2d');
  cg.fillStyle = '#b3afa6'; cg.fillRect(0, 0, 256, 128);
  for (const [x, y, w, h] of [[10, 10, 110, 50], [136, 10, 110, 50], [10, 68, 110, 50], [136, 68, 110, 50]]) { cg.fillStyle = 'rgba(70,68,62,0.35)'; cg.fillRect(x, y, w, 3); cg.fillRect(x, y, 3, h); cg.fillStyle = 'rgba(240,238,230,0.35)'; cg.fillRect(x, y + h - 3, w, 3); cg.fillRect(x + w - 3, y, 3, h); }
  blobs(cg, 0, 0, 256, 128, 26, 6, 30, ['rgba(80,78,70,0.16)', 'rgba(120,120,90,0.12)'], R); grain(cg, 256, 128, 14, R);
  // steel double door of the substation with a round warning plate
  const door = canvas(128, 192), dg = door.getContext('2d');
  dg.fillStyle = '#a9aeb2'; dg.fillRect(0, 0, 128, 192); dg.fillStyle = 'rgba(40,45,50,0.6)'; dg.fillRect(63, 0, 2, 192); dg.fillRect(0, 0, 128, 3); dg.fillRect(0, 189, 128, 3); dg.fillRect(0, 0, 3, 192); dg.fillRect(125, 0, 3, 192);
  for (const x of [30, 94]) { dg.fillStyle = '#e8e8e4'; dg.beginPath(); dg.arc(x, 44, 12, 0, 7); dg.fill(); dg.strokeStyle = '#555'; dg.lineWidth = 1.5; dg.stroke(); }
  dg.fillStyle = '#3a3d40'; dg.fillRect(70, 96, 10, 3);
  blobs(dg, 0, 0, 128, 192, 12, 6, 30, ['rgba(110,90,70,0.15)', 'rgba(240,240,240,0.12)'], R); grain(dg, 128, 192, 10, R);
  const noEntry = canvas(128, 128), ng = noEntry.getContext('2d');
  ng.clearRect(0, 0, 128, 128); ng.fillStyle = '#c8202a'; ng.beginPath(); ng.arc(64, 64, 62, 0, 7); ng.fill(); ng.fillStyle = '#fff'; ng.fillRect(18, 54, 92, 20);
  const cut = (map, o = {}) => std({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, ...o });
  MT = {
    stucco: std({ map: tex(stucco, { repeat: true }), normalMap: tex(normalFromCanvas(stucco, 1.5, 512), { repeat: true, srgb: false }), roughness: 0.95 }),
    slab: std({ color: 0x8d8a82, roughness: 0.95, map: M.concrete.map }),
    boards: std({ map: tex(boards, { repeat: true }), normalMap: tex(normalFromCanvas(boards, 2.5, 512), { repeat: true, srgb: false }), roughness: 0.9 }),
    brick: std({ map: tex(brick, { repeat: true }), normalMap: tex(normalFromCanvas(brick, 2, 256), { repeat: true, srgb: false }), roughness: 0.92 }),
    bay: std({ map: tex(bay(false), { repeat: true }), roughness: 0.85 }),
    bayTop: std({ map: tex(bay(true), { repeat: true }), roughness: 0.9 }),
    cornice: std({ color: 0xe6dfcf, roughness: 0.85 }),
    roofGrey: std({ color: 0x7d8286, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
    roofBrown: std({ color: 0x6a3f2c, roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide }),
    sheet: std({ map: tex(sheet, { repeat: true }), roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
    perf: cut(tex(perf, { repeat: true }), { metalness: 0.55, roughness: 0.45 }),
    panel: std({ map: tex(panel, { repeat: true }), roughness: 0.95, side: THREE.DoubleSide }),
    door: std({ map: tex(door), roughness: 0.5, metalness: 0.5 }),
    dark: std({ color: 0x1d1f21, roughness: 0.8 }),
    gravel: Object.assign(std({ map: M.gravel.map, normalMap: M.gravel.normalMap, roughness: 1, color: 0xc9c3b6 }), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    block: std({ color: 0xcfcdc6, roughness: 0.9, map: M.concrete.map }),
    noEntry: cut(tex(noEntry), { roughness: 0.5 }),
    signBack: std({ color: 0x8d9296, roughness: 0.5, metalness: 0.6 }),
    white: std({ color: 0xeeeeea, roughness: 0.6 }),
    ac: std({ color: 0xe3e3df, roughness: 0.5, metalness: 0.2 }),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildCastel(B, world) {
  const Mt = mats();
  const A = { stucco: new Acc(), slab: new Acc(), boards: new Acc(), brick: new Acc(), bay: new Acc(), bayTop: new Acc(), cornice: new Acc(), roofGrey: new Acc(), roofBrown: new Acc(), sheet: new Acc(), perf: new Acc(), panel: new Acc(), door: new Acc(), dark: new Acc(), gravel: new Acc(), noEntry: new Acc(), signBack: new Acc(), white: new Acc() };
  const G = { galv: [], block: [], white: [], ac: [], dark: [], concrete: [] };
  const box = (x, z, hw, hd, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hw, hd, rot, y0, y1, tag));
  const Y = (x, z) => heightAt(x, z);
  const R = rng(3310);
  const cars = [], treeAdd = [], treeDel = [];
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (x, z, r = 0) => { bb.x0 = Math.min(bb.x0, x - r); bb.x1 = Math.max(bb.x1, x + r); bb.z0 = Math.min(bb.z0, z - r); bb.z1 = Math.max(bb.z1, z + r); };
  // a vertical wall quad from a to b (x, z), y0..y1 at a and b; its normal points to the right of a->b
  const wall = (acc, a, b, ya0, ya1, yb0, yb1, uv) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    acc.quad([a[0], ya0, a[1]], [b[0], yb0, b[1]], [b[0], yb1, b[1]], [a[0], ya1, a[1]], [dz / L, 0, -dx / L], uv);
  };
  // box building walls around a rectangle (counter-clockwise from above so the normals point out), texture in metres
  const rectWalls = (acc, x0, x1, z0, z1, y0, y1, su = 1, sv = 1) => {
    const C = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
    for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]); wall(acc, b, a, y0, y1, y0, y1, [0, y0 / sv, L / su, y0 / sv, L / su, y1 / sv, 0, y1 / sv]); }
  };
  const hipRoof = (acc, x0, x1, z0, z1, y, rise, ov) => {
    const a = [x0 - ov, z0 - ov], b = [x1 + ov, z0 - ov], c = [x1 + ov, z1 + ov], d = [x0 - ov, z1 + ov];
    const along = (x1 - x0) >= (z1 - z0), h = Math.min(x1 - x0, z1 - z0) / 2 + ov;
    const r1 = along ? [x0 - ov + h, (z0 + z1) / 2] : [(x0 + x1) / 2, z0 - ov + h], r2 = along ? [x1 + ov - h, (z0 + z1) / 2] : [(x0 + x1) / 2, z1 + ov - h];
    const P = (p, yy) => [p[0], yy, p[1]], yr = y + rise;
    const tri = (p, q, r) => acc.quad(p, q, r, r, UP, [0, 0, 1, 0, 0.5, 1, 0.5, 1]);
    if (along) { acc.quad(P(a, y), P(b, y), P(r2, yr), P(r1, yr), UP); acc.quad(P(c, y), P(d, y), P(r1, yr), P(r2, yr), UP); tri(P(d, y), P(a, y), P(r1, yr)); tri(P(b, y), P(c, y), P(r2, yr)); }
    else { acc.quad(P(b, y), P(c, y), P(r2, yr), P(r1, yr), UP); acc.quad(P(d, y), P(a, y), P(r1, yr), P(r2, yr), UP); tri(P(a, y), P(b, y), P(r1, yr)); tri(P(c, y), P(d, y), P(r2, yr)); }
  };
  const fenceRun = (acc, pts, h, uvW, posts, postH, tag = 'fence', y0 = 0) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2)), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let k = 0; k < n; k++) {
        const p = [a[0] + ux * L * k / n, a[1] + uz * L * k / n], q = [a[0] + ux * L * (k + 1) / n, a[1] + uz * L * (k + 1) / n], yp = Y(...p) + y0, yq = Y(...q) + y0, l = L / n;
        wall(acc, p, q, yp, yp + h, yq, yq + h, [0, 0, l / uvW, 0, l / uvW, 1, 0, 1]);
        if (posts) boxAt(posts, p[0], yp + postH / 2 - 0.25, p[1], 0.12, postH + 0.5, 0.12, -Math.atan2(uz, ux));
        box((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, l / 2, 0.08, Math.atan2(-uz, ux), yp - 1, yp + h, tag);
        grow(p[0], p[1], 1);
      }
      if (posts && i === pts.length - 2) boxAt(posts, b[0], Y(...b) + postH / 2 - 0.25, b[1], 0.12, postH + 0.5, 0.12, -Math.atan2(uz, ux));
    }
  };

  // ============================================================== the substation (photos 51-53)
  {
    const { x0, x1, z0, z1, h } = ANNEX, y = Y((x0 + x1) / 2, (z0 + z1) / 2);
    rectWalls(A.stucco, x0, x1, z0, z1, y - 0.3, y + h, 3, 3);
    // the concrete slab roof: thick overhanging edge, a very flat pyramid on top, moss along the rim
    const ov = 0.45, t = 0.24, ys = y + h;
    rectWalls(A.slab, x0 - ov, x1 + ov, z0 - ov, z1 + ov, ys, ys + t, 1, 1);
    A.slab.quad([x0 - ov, ys, z0 - ov], [x1 + ov, ys, z0 - ov], [x1 + ov, ys, z1 + ov], [x0 - ov, ys, z1 + ov], [0, -1, 0]);
    hipRoof(A.slab, x0, x1, z0, z1, ys + t, 0.3, ov);
    // two steel double doors on the street side (z1), the vent grids near the top on the street and south-east faces
    for (const cx of [-96.0, -93.4]) {
      const a = [cx - 0.65, z1 + 0.02], b = [cx + 0.65, z1 + 0.02];
      wall(A.door, b, a, y + 0.1, y + 2.35, y + 0.1, y + 2.35, [1, 0, 0, 0, 0, 1, 1, 1]);
    }
    const vents = (face, c0, n) => {                                                   // 2 rows of n small square holes
      for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) {
        const u = c0 + k * 0.2, yy = y + h - 0.55 - r * 0.2;
        if (face === 'ne') wall(A.dark, [u + 0.1, z1 + 0.015], [u, z1 + 0.015], yy, yy + 0.1, yy, yy + 0.1);
        else wall(A.dark, [x0 - 0.015, u + 0.1], [x0 - 0.015, u], yy, yy + 0.1, yy, yy + 0.1);
      }
    };
    vents('ne', -96.7, 4); vents('ne', -94.2, 4);
    vents('se', -115.6, 4); vents('se', -113.7, 4);
    box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, y - 1, y + h + 0.6, 'house');
    grow(x0, z0, 1); grow(x1, z1, 1);
  }

  // ============================================================== the water tower: brick shaft, timber tank house
  {
    const { x, z, rb, rw, hb, hw } = TOWER, y = Y(x, z), N = 8, a0 = Math.PI / 8;
    const ring = (r, k) => [x + Math.cos(a0 + k / N * Math.PI * 2) * r, z + Math.sin(a0 + k / N * Math.PI * 2) * r];
    const side = (r) => 2 * r * Math.sin(Math.PI / N);
    for (let k = 0; k < N; k++) {
      const p = ring(rb, k), q = ring(rb, k + 1), sb = side(rb), pw = ring(rw, k), qw = ring(rw, k + 1), sw = side(rw);
      wall(A.brick, p, q, y - 0.3, y + hb, y - 0.3, y + hb, [0, 0, sb / 1.1, 0, sb / 1.1, (hb + 0.3) / 1.1, 0, (hb + 0.3) / 1.1]);
      // arched openings (dark), two tiers on alternate faces
      if (k % 2 === 0) for (const [yb, ht] of [[1.2, 2.3], [4.4, 2.0]]) {
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ux = (q[0] - p[0]) / sb, uz = (q[1] - p[1]) / sb, nx = uz, nz = -ux;   // outward normal
        const o = (s, dy) => [m[0] + ux * s + nx * 0.02, y + yb + dy, m[1] + uz * s + nz * 0.02];
        const w = 0.5, pts = [];
        for (let i = 0; i <= 8; i++) { const t = Math.PI * i / 8; pts.push([Math.cos(t) * w, ht + Math.sin(t) * w]); }
        A.dark.quad(o(-w, 0), o(w, 0), o(w, ht), o(-w, ht), [nx, 0, nz]);
        for (let i = 0; i < 8; i++) { const P1 = o(pts[i][0], pts[i][1]), P2 = o(pts[i + 1][0], pts[i + 1][1]), C = o(0, ht); A.dark.quad(C, P1, P2, P2, [nx, 0, nz]); }
      }
      // cornice band, the sloping soffit out to the tank house, the tank house boards
      wall(A.cornice, p, q, y + hb, y + hb + 0.3, y + hb, y + hb + 0.3, [0, 0, 1, 0, 1, 1, 0, 1]);
      const r2 = rb + 0.25, p2 = ring(r2, k), q2 = ring(r2, k + 1);
      A.cornice.quad([p2[0], y + hb + 0.3, p2[1]], [q2[0], y + hb + 0.3, q2[1]], [qw[0], y + hb + 0.9, qw[1]], [pw[0], y + hb + 0.9, pw[1]], [0, -1, 0]);
      const yt = y + hb + 0.9, yu = yt + hw;
      wall(A.boards, pw, qw, yt, yu, yt, yu, [0, 0, sw / 3, 0, sw / 3, hw / 3, 0, hw / 3]);
      // roof: eaves out to rw + 0.6, a low octagonal pyramid
      const pe = ring(rw + 0.6, k), qe = ring(rw + 0.6, k + 1), apex = [x, yu + 1.9, z];
      A.roofGrey.quad([pe[0], yu - 0.15, pe[1]], [qe[0], yu - 0.15, qe[1]], apex, apex, UP);
      A.roofGrey.quad([pw[0], yu - 0.15, pw[1]], [qw[0], yu - 0.15, qw[1]], [qe[0], yu - 0.15, qe[1]], [pe[0], yu - 0.15, pe[1]], [0, -1, 0]);
      wall(A.dark, pe, qe, yu - 0.35, yu - 0.15, yu - 0.35, yu - 0.15);                    // gutter
    }
    // a hatch and two small windows in the tank house
    for (const [k, yy, w, hh] of [[1, 2.6, 0.9, 0.7], [3, 3.8, 0.6, 0.5], [6, 3.2, 1.0, 0.45]]) {
      const p = ring(rw + 0.02, k), q = ring(rw + 0.02, k + 1), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], L = side(rw), ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, yb = y + hb + 0.9 + yy;
      wall(A.dark, [m[0] - ux * w / 2, m[1] - uz * w / 2], [m[0] + ux * w / 2, m[1] + uz * w / 2], yb, yb + hh, yb, yb + hh);
    }
    cyl(G.galv, x + rw * 0.93, y + 1, z + rw * 0.38, hb + hw - 0.4, 0.05);             // downpipe
    for (let k = 0; k < N; k++) { const p = ring(rb, k + 0.5); box(p[0], p[1], side(rb) / 2, 0.3, -(a0 + (k + 0.5) / N * Math.PI * 2) + Math.PI / 2, y - 1, y + hb + hw + 2, 'house'); }
    box(x, z, rb * 0.8, rb * 0.8, 0, y - 1, y + hb, 'house');
    grow(x, z, rw + 1);
    treeDel.push((tx, tz) => Math.hypot(tx - x, tz - z) < rw + 2);
  }

  // ============================================================== the brick shed next to the tower (aerial: brown roof)
  {
    const { x0, x1, z0, z1, h } = SHED, y = Y((x0 + x1) / 2, (z0 + z1) / 2);
    rectWalls(A.brick, x0, x1, z0, z1, y - 0.3, y + h, 1.1, 1.1);
    hipRoof(A.roofBrown, x0, x1, z0, z1, y + h, 1.6, 0.4);
    box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, y - 1, y + h + 1.6, 'house');
    grow(x0, z0, 1); grow(x1, z1, 1);
  }

  // ============================================================== fences, the yard, the no-entry sign
  // corrugated grey sheet along the street south-east of the substation, back to the shed (photo 52)
  fenceRun(A.sheet, [[-97.3, -111.25], [-109.6, -111.25], [-109.6, -119.4]], 2.0, 1.4, G.galv, 2.0);
  { const y = Y(-99.2, -111.2); boxAt(G.white, -99.2, y + 1.45, -111.18, 0.26, 0.34, 0.06); }       // a small white box on it
  // perforated galvanised strips from the substation's corner past the tower (photo 53)
  fenceRun(A.perf, [[-92.3, -116.4], [-87.4, -121], [-87.4, -131]], 2.1, 2.0, G.galv, 2.2);
  { const y = Y(-88.4, -120.1); A.white.quad([-88.9, y + 1.1, -119.4], [-88.0, y + 1.1, -120.3], [-88.0, y + 1.65, -120.3], [-88.9, y + 1.65, -119.4], [0.7, 0, 0.7]); }   // a small white plate on it
  // gravel yard behind the entrance, precast concrete panel fence along the street north-west of it (photo 53)
  drape(A.gravel, YARD, 0.03, 2, 3);
  fenceRun(A.panel, [[-86.3, -115.2], [-50.2, -115.2]], 2.0, 2.0, G.concrete, 2.1);
  {
    const x = -83.8, z = -114.9, y = Y(x, z), fx = -0.9, fz = 0.44, fl = Math.hypot(fx, fz), nx = fx / fl, nz = fz / fl, px = -nz * 0.32, pz = nx * 0.32;
    cyl(G.galv, x, y - 0.3, z, 2.6, 0.035);
    A.noEntry.quad([x + nx * 0.05 + px, y + 1.95, z + nz * 0.05 + pz], [x + nx * 0.05 - px, y + 1.95, z + nz * 0.05 - pz], [x + nx * 0.05 - px, y + 2.59, z + nz * 0.05 - pz], [x + nx * 0.05 + px, y + 2.59, z + nz * 0.05 + pz], [nx, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1]);
    A.signBack.quad([x + nx * 0.04 - px, y + 1.95, z + nz * 0.04 - pz], [x + nx * 0.04 + px, y + 1.95, z + nz * 0.04 + pz], [x + nx * 0.04 + px, y + 2.59, z + nz * 0.04 + pz], [x + nx * 0.04 - px, y + 2.59, z + nz * 0.04 - pz], [-nx, 0, -nz]);
    box(x, z, 0.06, 0.06, 0, y - 1, y + 2.6, 'sign');
  }
  treeDel.push((x, z) => x > -92.5 && x < -59 && z < -111 && z > -142);

  // ============================================================== the three-storey striped building (photo 53)
  {
    const { x0, x1, z0, z1, floors, fh } = STRIPED, y = Y((x0 + x1) / 2, (z0 + z1) / 2), ye = y + 0.5 + floors * fh;
    rectWalls(A.cornice, x0, x1, z0, z1, y - 0.3, y + 0.5, 1, 1);                          // plinth
    const C = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
    for (let i = 0; i < 4; i++) {
      const a = C[(i + 1) % 4], b = C[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nb = Math.max(1, Math.round(L / 3));
      for (let f = 0; f < floors; f++) {
        const y0 = y + 0.5 + f * fh, y1 = y0 + fh;
        wall(f === floors - 1 ? A.bayTop : A.bay, a, b, y0, y1, y0, y1, [0, 0, nb, 0, nb, 1, 0, 1]);
        wall(A.cornice, a, b, y1 - 0.12, y1 + 0.02, y1 - 0.12, y1 + 0.02);
      }
    }
    // door with a grille on the south-east face by its north-east end, air conditioners, the roof
    { const zc = z1 - 1.8; wall(A.dark, [x0 - 0.02, zc + 0.7], [x0 - 0.02, zc - 0.7], y + 0.5, y + 2.7, y + 0.5, y + 2.7); for (let k = 0; k < 9; k++) boxAt(G.galv, x0 - 0.06, y + 1.6, zc - 0.64 + k * 0.16, 0.03, 2.2, 0.03); }
    for (const [zc, f] of [[z1 - 4.8, 1], [z1 - 7.8, 1], [z1 - 4.8, 0], [z1 - 11.5, 1]]) boxAt(G.ac, x0 - 0.2, y + 0.5 + f * fh + 2.0, zc, 0.3, 0.55, 0.8);
    hipRoof(A.roofBrown, x0, x1, z0, z1, ye, 2.2, 0.6);
    for (const zc of [z0 + 0.3, z1 - 0.3]) cyl(G.dark, x0 - 0.15, y, zc, ye - y, 0.05);         // downpipes
    box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, y - 1, ye + 2.2, 'house');
    grow(x0, z0, 1); grow(x1, z1, 1);
    treeDel.push((tx, tz) => tx > x0 - 2 && tx < x1 + 2 && tz > z0 - 2 && tz < z1 + 2);
  }

  // ============================================================== north-east side: gravel parking, painted blocks
  {
    // the street's centre line (OSM) under x: its north-east edge bounds the strip
    const rd = (GEO.roads || []).find(r => r.id === ROAD), P = [];
    if (rd) for (let i = 0; i < rd.p.length; i += 2) P.push([rd.p[i], rd.p[i + 1]]);
    const cz = (x) => { for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + (bz - az) * (x - ax) / (bx - ax); } return -108; };
    const edge = (x) => cz(x) + HW + 0.1, park = [];
    for (let x = -125; x <= -86; x += 3) park.push([x, edge(x)]);
    park.push([-86, -100.8], [-125, -100.2]);
    drape(A.gravel, park, 0.03, 2, 3);
    for (let x = -124.5; x < -86; x += 1.6) { const z = edge(x) + 0.2, y = Y(x, z); boxAt(G.block, x, y + 0.08, z, 0.42, 0.2, 0.24); }
    treeDel.push((x, z) => x > -126 && x < -85 && z > edge(x) - 0.5 && z < -100);
    for (const [x, z] of park) grow(x, z, 1);
  }

  // ============================================================== trees
  treeAdd.push([-89.2, -127.4, T_SPRUCE, 1.15]);                       // behind the perforated fence (photo 53)
  treeAdd.push([-83, -119.2, 1, 0.75], [-78.5, -119.8, 1, 0.85]);       // hornbeams in the yard (photos 52-53)
  treeDel.push((x, z) => x > -123 && x < -86 && z > -100 && z < -80);  // the grass north-east of the parking: only the spruce (photo 51)
  treeAdd.push([-97.5, -87.5, T_SPRUCE, 0.95]);                         // the big blue spruce on the right (photo 51)
  treeAdd.push([-111.2, -113.6, T_LOMBARDY, 0.72]);                     // the tall thin tree before the tower (photo 51)
  for (const [x, z, s] of [[-115.4, -111.9, 0.5], [-118.2, -112.2, 0.46], [-112.6, -113.2, 0.4], [-120.6, -112.6, 0.4], [-105.5, -112.6, 0.28]]) treeAdd.push([x, z, T_BUSH, s]);   // the dense bushes on the left (photo 51)
  treeDel.push((x, z) => x > -112 && x < -97 && z < -111 && z > -128);
  const T = GEO.trees;
  if (T) {
    const keep = []; for (let i = 0; i < T.n; i++) if (!treeDel.some(f => f(T.x[i], T.z[i]))) keep.push(i);
    const n = keep.length + treeAdd.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), s = new Float32Array(n);
    keep.forEach((i, k) => { x[k] = T.x[i]; z[k] = T.z[i]; t[k] = T.t[i]; s[k] = T.s[i]; });
    treeAdd.forEach(([ax, az, at, as], k) => { const j = keep.length + k; x[j] = ax; z[j] = az; t[j] = at; s[j] = as; });
    GEO.trees = { n, x, z, t, s };
  }

  // ============================================================== parked cars (photos 51-53)
  // forward = (-sin h, -cos h): h = pi/2 faces south-east (-x), -pi/2 north-west
  const SE = Math.PI / 2, NW = -Math.PI / 2, ANG = Math.atan2(-0.87, -0.5);
  for (const [x, z, h, model, paint] of [
    [-113.6, -110.0, SE, 'corsa', 0x5a1f2a], [-106.2, -110.1, SE, 'hatch', 0x1f3f7a],                 // left, photo 51
    [-80.5, -112.6, SE, 'sedan', 0x1e1f22], [-72.5, -112.6, SE, 'sedan', 0xb5b8bb], [-64, -112.6, SE, 'suv', 0xeeeeea],   // photo 52, on the verge by the concrete fence
    [-113.8, -102.6, ANG, 'sedan', 0x15171a], [-107.6, -102.6, ANG, 'p508', 0x1d2a44], [-97.6, -102.9, ANG, 'hatch', 0x2458b8],   // right, photo 51
    [-82.9, -126.2, 0, 'sedan', 0x202225],                                                              // at the striped building, photo 53
  ]) cars.push({ x, z, h, model, paint });

  // ---- flush
  const put = (acc, mat, opts) => acc.flush(B, mat, null, opts);
  for (const k of Object.keys(A)) put(A[k], Mt[k], k === 'gravel' ? { noCast: true } : k === 'perf' || k === 'noEntry' ? { noAO: true } : undefined);
  const geo = (list, mat) => { if (list.length) B.geo(mat, merged(list)); };
  geo(G.galv, M.galv); geo(G.block, Mt.block); geo(G.white, Mt.white); geo(G.ac, Mt.ac); geo(G.dark, Mt.dark); geo(G.concrete, M.concretePole);

  return {
    type: 'castel', name: 'Strada Gării — castelul de apă al gării', cars, bbox: bb,
    views: {
      a: { from: [-120, -105.6], to: [-70, -108.3] },              // photo 51: north-west along the street
      b: { from: [-100.5, -107.5], to: [-84.32, -119.26] },        // photo 52: ~5 m from the substation's corner, its corner ~16 deg left
      c: { from: [-90.5, -111.6], to: [-84.99, -130.83] },         // photo 53: in the yard's mouth, turning left
    },
  };
}
