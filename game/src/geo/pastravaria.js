import * as THREE from 'three';
import { GEO, heightAt, gridHeight, addHolePoly } from './data.js';
import { M } from '../materials.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain, boxAt, cyl, tube, merged, frame, pairs, road, drape } from './pitigaia.js';

// Photo 64 (the user's Street View screenshot, 2024, 45.1516650 N 25.6953293 E): DN1 (E60) northbound towards Breaza,
// ~320 m north of the Etu station, at the welcome sign of Păstrăvăria Cornu (restaurant & pensiune).
//  * like at the Etu station (etu.js), OSM tags each one-way carriageway with 4 lanes (15 m) and they overlap; the photo
//    has 2 lanes each way with a concrete New Jersey barrier (red reflectors) between them. Measured on the photo (the
//    Street View camera 2.5 m up: a lane spans 3.5 m; its view 48.6° high, from the sign's, the barrier's and the
//    board's sizes and places) and on the aerial imagery (measurements only): 7.4 m between our
//    edge lines, centred on the northbound OSM line; the barrier 4.5 m west of that line, the southbound carriageway
//    1 m west of its own mapped line; a lighter paved shoulder ~3.9 m wide on our right, ~1.5 m on the far side
//  * the big welcome sign (a 2.4 x 4.7 m panel on a 0.3 m stone base, two solar panels and two floodlights on top)
//    ~13 m ahead and ~7 m right of the camera, at the shoulder's edge; a smaller Păstrăvăria board ~47 m ahead; a no-stopping sign at the shoulder's
//    edge; a low dark edging along the field, a row of young trees; dry grass on the verges (autumn); the field on the
//    right is the clearing on the aerial, the verge on the left is grass up to the scrub
//  * text that can't be read on the screenshot (the welcome in other languages, the small board's photos) is generic
// Photo 65 (Street View, November 2023, "the continuation" of photo 64 towards Cornu de Sus; no coordinates): the stretch
// north of the sign where the wood comes down to the road on the right - the aerial has it from ~300 m past the start of
// our way; the camera is put 120 m into the long way north (the exact spot along the ~700 m of wood is not known).
//  * the same cross-section: 7.3 m between the edge lines, the barrier ~0.5 m past the left one, a narrow paved strip and
//    gravel on the right, then scrub; the aerial has the barrier midway between the mapped lines, 7.3 m apart, so each
//    carriageway moves 0.85 m out there (easing in from photo 64's stretch)
//  * the terrain model follows the wood's canopy here: DN1 rose and fell 4-9 m within 100-200 m. The screenshot has it
//    rising gently and evenly up the valley floor, so its long profile becomes the lower convex hull of the model's
//    heights along the axis (eased), from 130 m into our way to 1000 m (700 m into the long way); the ground across the
//    road follows it, the wood's side rising 1.5 m within 45 m, and blends back into the model
//  * scrub along both verges, a white kilometre-type post on the right ~50 m ahead
const IDS = { nb: ['1086246689', '1107424499', '1107424498'], sb: ['1107424501', '1086246690', '319009063'], near: ['1086246689', '1107424501'], outer: ['1107424499', '1086246690', '1107424498', '319009063'] };
const LEVEL = { s0: 130, s1: 998 };      // along our carriageway from the start of its way near the sign (m)
const CAM65 = { s: 418, o: 1.3, yaw: -1.4, pitch: -0.056, fov: 51.5 };  // 120 m into the long way; 0.55 m left of the lane's centre
const POST = { s: 468, o: 6.4 };
const NB = '1086246689', SB = '1107424501';
const W = 8.1;                           // edge lines 0.35 m in (roads.js): 7.4 m between them, as on the photo
const BAR = -4.5, SB_SHIFT = 1.0;        // the barrier's offset from our mapped line; the southbound moved 1 m out
const SH = { nb: 3.85, sb: 1.45 };       // paved shoulders
const CAM = { s: 46.85, o: 2.1, yaw: 2.4, pitch: -0.095, fov: 48.6 };   // right lane's centre, 2.4° right of the road
const SIGN = { s: 60.1, o: 9.1, w: 2.4, h: 4.7, turn: 0 }, BOARD = { s: 90.5, o: 8.4, turn: 15 }, NOSTOP = { s: 105, o: 8.0, turn: 15 };
const UP = [0, 1, 0];

const Wf = (F, s, o) => { const q = F.at(s), [ux, uz] = F.dir(s); return [q.x - uz * o, q.z + ux * o]; };
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
// our carriageway's ways joined into one line (s from the start of the way by the sign)
const chainNB = () => { const C = []; for (const id of IDS.nb) { const r = road(id); if (r) for (const p of pairs(r.p)) { const q = C[C.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) C.push(p); } } return C; };

// ------------------------------------------------------------------ before the roads and the terrain's trees
export function preparePastravaria() {
  const nb = road(NB), sb = road(SB);
  if (!nb || !sb) return false;
  for (const id of [...IDS.nb, ...IDS.sb]) { const r = road(id); if (r) r.w = W; }
  for (const id of IDS.near) { const r = road(id); if (r) r.noShoulder = true; }   // the paved shoulders are drawn here
  for (const id of IDS.outer) { const r = road(id); if (r) r.outerShoulder = true; }  // gravel on the outside only (roads.js)
  // each carriageway moved out (to its right, away from the other) by k(s), s along its way
  const shiftRight = (r, k) => {
    const F = frame(pairs(r.p)), Q = [], n = Math.ceil(F.L / 4);
    for (let i = 0; i <= n; i++) { const s = F.L * i / n, q = F.at(s), [ux, uz] = F.dir(s), d = k(s, F.L); Q.push([q.x - uz * d, q.z + ux * d]); }
    r.p = Q.flat();
  };
  const ease = (a, b, t) => smooth(a, b, t);
  // photo 64's stretch: the southbound 1 m out (from 25 m past its south end); north of it both 0.85 m out
  shiftRight(sb, (s, L) => SB_SHIFT * ease(0, 25, L - s));                               // it runs south: its end is at the sign's south
  const r1 = road('1086246690'), r2 = road('1107424499'), r3 = road('1107424498'), r4 = road('319009063');
  if (r1) shiftRight(r1, (s, L) => 0.85 + 0.15 * s / L);                                  // north end first: 0.85 -> 1.0 at the sign's stretch
  if (r2) shiftRight(r2, (s, L) => 0.85 * ease(0, L, s));
  if (r3) shiftRight(r3, (s, L) => 0.85 * (1 - ease(LEVEL.s1 - 298 + 20, LEVEL.s1 - 298 + 80, s)));
  if (r4) shiftRight(r4, (s, L) => 0.85 * ease(L - (LEVEL.s1 - 298 + 80), L - (LEVEL.s1 - 298 + 20), s));
  // no forest on the verges (grass up to the scrub on the left; the verge, the sign and the field on the right)
  const FN = frame(pairs(nb.p)), E = [], Wv = [];
  for (let s = 18; s <= FN.L; s += 5) E.push(Wf(FN, s, 8.2));
  for (let s = FN.L; s >= 18; s -= 5) E.push(Wf(FN, s, 80));
  addHolePoly(E, { noFences: true, scatter: false });   // keeps the tree row added below
  for (let s = 0; s <= FN.L; s += 5) Wv.push(Wf(FN, s, -14.6));
  for (let s = FN.L; s >= 0; s -= 5) Wv.push(Wf(FN, s, -30));
  addHolePoly(Wv, { noFences: true });
  // the young trees along the field and the bushes by its edging (hornbeam-like, ~13 m; low edge broadleaves: the
  // scattered-tree list has no far model for the 'shrub' type)
  const T = GEO.trees;
  if (T) {
    const add = [[...Wf(FN, 82, 14.2), 1, 1.1], [...Wf(FN, 91, 15.0), 1, 0.95], [...Wf(FN, 101, 15.9), 1, 1.05], [...Wf(FN, 112, 18.5), 12, 0.9],
      [...Wf(FN, 128, 21), 12, 1.0], [...Wf(FN, 140, 34), 12, 0.85], [...Wf(FN, 95, 55), 12, 0.8], [...Wf(FN, 150, 62), 12, 0.9],
      [...Wf(FN, 70, 13.6), 12, 0.32], [...Wf(FN, 80, 14.3), 12, 0.38], [...Wf(FN, 91, 14.9), 12, 0.3], [...Wf(FN, 104, 16.2), 12, 0.4]];
    const n = T.n + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), sc = new Float32Array(n);
    x.set(T.x); z.set(T.z); t.set(T.t); sc.set(T.s);
    add.forEach(([ax, az, at, as], k) => { x[T.n + k] = ax; z[T.n + k] = az; t[T.n + k] = at; sc[T.n + k] = as; });
    GEO.trees = { n, x, z, t, s: sc };
  }
  // ---- photo 65: the long profile and the ground across the road (the terrain grid's own nodes, before it is meshed)
  const FC = frame(chainNB()), s0 = LEVEL.s0, s1 = Math.min(FC.L, LEVEL.s1);
  {
    const pts = [];
    for (let s = s0; s < s1 + 5; s += 10) { const ss = Math.min(s, s1), q = FC.at(ss); pts.push([ss, gridHeight(GEO, q.x, q.z)]); if (ss >= s1) break; }
    const hull = [];                                                            // lower convex hull (monotone chain)
    for (const p of pts) { while (hull.length >= 2) { const [o, a] = [hull[hull.length - 2], hull[hull.length - 1]]; if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) <= 0) hull.pop(); else break; } hull.push(p); }
    const hullAt = (s) => { for (let i = 0; i < hull.length - 1; i++) if (s <= hull[i + 1][0]) return hull[i][1] + (hull[i + 1][1] - hull[i][1]) * (s - hull[i][0]) / (hull[i + 1][0] - hull[i][0]); return hull[hull.length - 1][1]; };
    const prof = (s) => { let a = 0, n = 0; for (let d = -30; d <= 30; d += 5) { a += hullAt(Math.max(s0, Math.min(s1, s + d))); n++; } return a / n; };
    const { n, ext, step, H } = GEO, H0 = Float32Array.from(H);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let s = s0; s <= s1; s += 10) { const q = FC.at(s); x0 = Math.min(x0, q.x - 80); x1 = Math.max(x1, q.x + 80); z0 = Math.min(z0, q.z - 80); z1 = Math.max(z1, q.z + 80); }
    const i0 = Math.max(0, Math.floor((x0 + ext) / step)), i1 = Math.min(n - 1, Math.ceil((x1 + ext) / step)), j0 = Math.max(0, Math.floor((z0 + ext) / step)), j1 = Math.min(n - 1, Math.ceil((z1 + ext) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -ext + i * step, z = -ext + j * step, q = FC.local(x, z);
      if (!q || q.s <= s0 || q.s >= s1 || q.d > 80) continue;
      const o = q.o, g = H0[j * n + i], p = prof(q.s);
      const tgt = o > 9 ? p + 1.5 * smooth(9, 45, o) : p;                     // the wood's side rises a little
      const wO = o > 9 ? 1 - smooth(45, 75, o) : o < -15 ? 1 - smooth(15, 40, -o) : 1;
      const wS = smooth(s0, s0 + 40, q.s) * (1 - smooth(s1 - 40, s1, q.s));
      H[j * n + i] = g + (tgt - g) * wO * wS;
    }
  }
  // scrub along both verges of the wooded stretch (low edge broadleaves), and a few taller trees among it
  if (GEO.trees) {
    let seed = 65; const R = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const add = [];
    for (let s = 330; s < Math.min(s1 + 150, FC.L); s += 3.5 + R() * 3) {
      add.push([...Wf(FC, s, 6.6 + R() * 2.2), 12, 0.28 + R() * 0.22]);
      if (R() < 0.35) add.push([...Wf(FC, s + R() * 3, 9.5 + R() * 4), 12, 0.7 + R() * 0.4]);
      add.push([...Wf(FC, s + R() * 2, -(15.6 + R() * 2.5)), 12, 0.3 + R() * 0.25]);
      if (R() < 0.3) add.push([...Wf(FC, s + R() * 3, -(18.5 + R() * 4)), 12, 0.75 + R() * 0.4]);
    }
    const T = GEO.trees, n = T.n + add.length, x = new Float32Array(n), z = new Float32Array(n), t = new Uint8Array(n), sc = new Float32Array(n);
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
  const R = (() => { let s = 64; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  const GREEN = '#2b4a37', CREAM = '#ece8d6';
  const arcText = (g, txt, cx, cy, r, a0, a1, font) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = txt.length;
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / n; g.save(); g.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.rotate(a); g.fillText(txt[i], 0, 0); g.restore(); }
  };
  const trout = (g, cx, cy, s) => {
    g.save(); g.translate(cx, cy); g.scale(s, s); g.strokeStyle = '#f4f2ea'; g.lineWidth = 3 / s; g.fillStyle = 'rgba(0,0,0,0)';
    g.beginPath(); g.moveTo(-40, 0); g.bezierCurveTo(-20, -18, 20, -20, 38, -4); g.bezierCurveTo(22, 10, -18, 12, -40, 0); g.stroke();   // body
    g.beginPath(); g.moveTo(-40, 0); g.lineTo(-56, -12); g.lineTo(-52, 0); g.lineTo(-56, 12); g.closePath(); g.stroke();                  // tail
    g.beginPath(); g.arc(28, -5, 2.2, 0, 7); g.fillStyle = '#f4f2ea'; g.fill();                                                           // eye
    g.beginPath(); g.moveTo(-10, -13); g.quadraticCurveTo(0, -24, 10, -15); g.stroke();                                                    // fin
    for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(-20 + k * 7, -2 + (k % 2) * 3, 1.4, 0, 7); g.fill(); }                          // spots
    g.beginPath(); g.ellipse(0, 4, 62, 26, -0.08, 0.2, Math.PI * 1.1); g.stroke();                                                      // the swirl
    g.restore();
  };
  // the welcome sign, 1 px = 1 cm (2.4 x 4.7 m); its bands in the screenshot's proportions: pines on cream (0-16%),
  // the name in an arc and CORNU, the trout (27-43%), "restaurant & pensiune", the welcome (50-62%), six lines of
  // small print (63-75%), the folk-motif band (78-100%)
  const CW = 240, CH = 470, C = CW / 2, ws = canvas(CW, CH), g = ws.getContext('2d');
  g.fillStyle = GREEN; g.fillRect(0, 0, CW, CH);
  g.fillStyle = CREAM; g.fillRect(0, 0, CW, 76);
  for (let x = -4; x < CW + 4; x += 9 + R() * 5) { const h = 30 + R() * 38, w = 10 + R() * 5; g.fillStyle = R() < 0.5 ? '#2f5a3e' : '#24472f'; g.beginPath(); g.moveTo(x, 76); g.lineTo(x + w / 2, 76 - h); g.lineTo(x + w, 76); g.fill(); }
  g.fillStyle = '#f4f2ea'; arcText(g, 'PĂSTRĂVĂRIA', C, 196, 104, -0.72, 0.72, 'bold 25px Georgia, "Times New Roman", serif');
  g.font = 'bold 13px Georgia, serif'; g.textAlign = 'center'; g.fillText('★ CORNU ★', C, 118);
  trout(g, C, 164, 1.45);
  g.font = 'bold 12px Arial, Helvetica, sans-serif'; g.fillStyle = '#e8c55a'; g.fillText('restaurant & pensiune', C, 214);
  g.fillStyle = 'rgba(236,232,214,0.9)'; g.fillRect(8, 222, CW - 16, 4);
  g.fillStyle = '#f4f2ea'; g.font = 'bold 30px Arial, Helvetica, sans-serif'; g.fillText('Bine ați venit', C, 254);
  g.font = 'bold 36px Arial, Helvetica, sans-serif'; g.fillText('Welcome', C, 290);
  g.fillStyle = 'rgba(244,242,234,0.85)';
  for (let k = 0; k < 6; k++) for (let x = 12 + R() * 6; x < CW - 20;) { const w = 14 + R() * 34; g.fillRect(x, 304 + k * 9.5, Math.min(w, CW - 14 - x), 4); x += w + 6; }   // the welcome in other languages (not legible)
  g.fillStyle = 'rgba(236,232,214,0.9)'; g.fillRect(8, 362, CW - 16, 3);
  g.fillStyle = '#1f3a2a'; g.fillRect(0, 368, CW, CH - 368);
  for (let row = 0; row < 3; row++) for (let x = 0; x < CW; x += 24) {                  // the folk-motif band
    const y = 386 + row * 30; g.fillStyle = row === 1 ? '#d9b44a' : '#b7a04a';
    g.beginPath(); g.moveTo(x + 12, y - 10); g.lineTo(x + 22, y); g.lineTo(x + 12, y + 10); g.lineTo(x + 2, y); g.fill();
    g.fillStyle = '#1f3a2a'; g.fillRect(x + 10, y - 2, 4, 4);
  }
  g.strokeStyle = '#f4f2ea'; g.lineWidth = 4; g.strokeRect(2, 2, CW - 4, CH - 4);
  grain(g, CW, CH, 8, R);
  // the smaller board (2.4 x 3.0 m): the logo over three pictures
  const bd = canvas(240, 300), b = bd.getContext('2d');
  b.fillStyle = GREEN; b.fillRect(0, 0, 240, 300);
  b.fillStyle = '#f4f2ea'; arcText(b, 'PĂSTRĂVĂRIA', 120, 118, 84, -0.68, 0.68, 'bold 18px Georgia, serif');
  b.font = 'bold 11px Georgia, serif'; b.textAlign = 'center'; b.fillText('★ CORNU ★', 120, 54);
  trout(b, 120, 92, 0.8);
  b.font = 'bold 11px Arial, sans-serif'; b.fillStyle = '#e8c55a'; b.fillText('restaurant & pensiune', 120, 138);
  [['#7d8f5a', '#c9b98a'], ['#b8a78a', '#8a4a32'], ['#5b7a8e', '#d9d4c2']].forEach(([c1, c2], k) => {
    const x = 12 + k * 74; b.fillStyle = '#f4f2ea'; b.fillRect(x - 2, 188, 70, 92);
    const gr = b.createLinearGradient(0, 190, 0, 278); gr.addColorStop(0, c1); gr.addColorStop(1, c2); b.fillStyle = gr; b.fillRect(x, 190, 66, 88);
  });
  b.strokeStyle = '#f4f2ea'; b.lineWidth = 4; b.strokeRect(2, 2, 236, 296);
  grain(b, 240, 300, 8, R);
  // no stopping: blue disc, red ring and cross
  const ns = canvas(128, 128), n = ns.getContext('2d');
  n.clearRect(0, 0, 128, 128); n.fillStyle = '#c7303a'; n.beginPath(); n.arc(64, 64, 63, 0, 7); n.fill();
  n.fillStyle = '#2459a6'; n.beginPath(); n.arc(64, 64, 50, 0, 7); n.fill();
  n.save(); n.beginPath(); n.arc(64, 64, 50, 0, 7); n.clip(); n.strokeStyle = '#c7303a'; n.lineWidth = 12;
  n.beginPath(); n.moveTo(20, 20); n.lineTo(108, 108); n.moveTo(108, 20); n.lineTo(20, 108); n.stroke(); n.restore();
  // the shoulder: lighter, older asphalt
  const face = (c, o = {}) => std({ map: tex(c), roughness: 0.55, transparent: false, alphaTest: o.alpha ? 0.5 : 0 });
  // dry autumn grass: straw with greener and darker tufts
  const dg = canvas(128, 128), d = dg.getContext('2d');
  d.fillStyle = '#b3a36a'; d.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 900; k++) { const c = ['#cdbd84', '#9c8f58', '#8e9a5c', '#d8c996', '#7f7448'][k % 5]; d.fillStyle = c; d.fillRect(R() * 128, R() * 128, 1 + R() * 2, 2 + R() * 5); }
  grain(d, 128, 128, 14, R);
  const dry = std({ map: tex(dg, { repeat: true }), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  MT = {
    shoulder: Object.assign(M.asphalt.clone(), { color: new THREE.Color(0xf2efe8), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }),
    concrete: M.concrete, dry, sign: face(ws), board: face(bd), nostop: face(ns, { alpha: true }),
    stone: std({ color: 0x9d988e, roughness: 0.9 }), green: std({ color: 0x2b4a37, roughness: 0.6 }),
    back: std({ color: 0x8e9296, roughness: 0.6, metalness: 0.5 }), galv: M.galv,
    reflector: std({ color: 0xc81e1e, roughness: 0.3, emissive: new THREE.Color(0x3a0505) }),
    solar: std({ color: 0x1c2a44, roughness: 0.25, metalness: 0.6 }), lamp: std({ color: 0x222426, roughness: 0.5, metalness: 0.5 }),
    edging: std({ color: 0x26282a, roughness: 0.8 }),
    post: std({ color: 0xf0efe8, roughness: 0.7 }), cap: std({ color: 0xc23a2e, roughness: 0.6 }),
  };
  return MT;
}

// ------------------------------------------------------------------ build
export function buildPastravaria(B, world) {
  const nb = road(NB), sb = road(SB);
  if (!nb || !sb) return null;
  const Mt = mats();
  const A = { shoulder: new Acc(), barrier: new Acc(), dry: new Acc(), sign: new Acc(), board: new Acc(), nostop: new Acc() };
  const G = { reflector: [], stone: [], green: [], back: [], galv: [], solar: [], lamp: [], edging: [], post: [], cap: [] };
  const box = (x, z, hx, hz, rot, y0, y1, tag) => world.addStatic(new world.Box(x, z, hx, hz, rot, y0, y1, tag));
  const FN = frame(pairs(nb.p)), FS = frame(pairs(sb.p));

  // ---- paved shoulders: from the carriageway's edge (its ribbon's level) down onto the ground at the outer edge
  const shoulder = (F, o0, o1, s0, s1) => {
    const sgn = Math.sign(o0), steps = [0, 0.33, 0.66, 1];
    for (let s = s0; s < s1 - 1e-6; s += 2) {
      const sa = s, sb2 = Math.min(s1, s + 2), ya = heightAt(F.at(sa).x, F.at(sa).z), yb = heightAt(F.at(sb2).x, F.at(sb2).z);
      const P = (ss, t, yAx) => { const o = o0 + (o1 - o0) * t, [x, z] = Wf(F, ss, o), [xi, zi] = Wf(F, ss, o0); return [x, heightAt(x, z) + 0.035 + (yAx - heightAt(xi, zi)) * (1 - t), z]; };
      for (let k = 0; k < steps.length - 1; k++) {
        const t0 = steps[k], t1 = steps[k + 1];
        A.shoulder.quad(P(sa, t0, ya), P(sb2, t0, yb), P(sb2, t1, yb), P(sa, t1, ya), UP, [sa / 3, (o0 + (o1 - o0) * t0) / 3 * sgn, sb2 / 3, (o0 + (o1 - o0) * t0) / 3 * sgn, sb2 / 3, (o0 + (o1 - o0) * t1) / 3 * sgn, sa / 3, (o0 + (o1 - o0) * t1) / 3 * sgn]);
      }
    }
  };
  shoulder(FN, W / 2, W / 2 + SH.nb, 0, FN.L);
  shoulder(FS, W / 2, W / 2 + SH.sb, 0, FS.L);   // the southbound runs south: its right is the west

  // ---- the New Jersey barrier with red reflectors, midway between the carriageways' lines, 1080 m from our way's start
  {
    const nP = [], sP = [];
    for (const id of IDS.nb) { const r = road(id); if (r) for (const p of pairs(r.p)) { const q = nP[nP.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.01) nP.push(p); } }
    for (const id of IDS.sb) { const r = road(id); if (r) { sP.push(...pairs(r.p)); sP.push(null); } }
    const segs = []; { let prev = null; for (const p of sP) { if (p && prev) segs.push([prev, p]); prev = p; } }
    const mid = [];
    let acc0 = 0;
    for (let i = 0; i < nP.length - 1 && acc0 < 1080; i++) {
      const [ax, az] = nP[i], [bx, bz] = nP[i + 1], l = Math.hypot(bx - ax, bz - az), k = Math.ceil(l / 3);
      for (let j = 0; j < k && acc0 < 1080; j++, acc0 += l / k) {
        const q = [ax + (bx - ax) * j / k, az + (bz - az) * j / k];
        let best = null;
        for (const [[px, pz], [qx, qz]] of segs) { const dx = qx - px, dz = qz - pz, t = Math.max(0, Math.min(1, ((q[0] - px) * dx + (q[1] - pz) * dz) / (dx * dx + dz * dz))), x = px + dx * t, z = pz + dz * t, d = Math.hypot(q[0] - x, q[1] - z); if (!best || d < best[2]) best = [x, z, d]; }
        if (best && best[2] < 16) mid.push([(q[0] + best[0]) / 2, (q[1] + best[1]) / 2]);
      }
    }
    const prof = [[-0.3, 0], [-0.26, 0.08], [-0.1, 0.33], [-0.08, 0.86], [0.08, 0.86], [0.1, 0.33], [0.26, 0.08], [0.3, 0]];
    let acc = 0;
    for (let i = 0; i < mid.length - 1; i++) {
      const [ax, az] = mid[i], [bx, bz] = mid[i + 1], l = Math.hypot(bx - ax, bz - az); if (l < 0.2) continue;
      const nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let k = 0; k < prof.length - 1; k++) {
        const P = [[ax, az, prof[k]], [bx, bz, prof[k]], [bx, bz, prof[k + 1]], [ax, az, prof[k + 1]]].map(([x, z, [dq, h]]) => [x + nx * dq, heightAt(x, z) + h + 0.03, z + nz * dq]);
        const m = (prof[k][0] + prof[k + 1][0]) / 2;
        A.barrier.quad(P[0], P[1], P[2], P[3], [nx * Math.sign(m || 1) * 0.8, 0.5, nz * Math.sign(m || 1) * 0.8], [acc / 2.2, prof[k][1], (acc + l) / 2.2, prof[k][1], (acc + l) / 2.2, prof[k + 1][1], acc / 2.2, prof[k + 1][1]]);
      }
      if (Math.floor((acc + l) / 4) > Math.floor(acc / 4)) for (const sd of [-1, 1]) { const x = ax + nx * sd * 0.1, z = az + nz * sd * 0.1; boxAt(G.reflector, x, heightAt(ax, az) + 0.7, z, 0.12, 0.1, 0.03, -Math.atan2(bz - az, bx - ax)); }
      box((ax + bx) / 2, (az + bz) / 2, l / 2 + 0.1, 0.32, Math.atan2(-(bz - az), bx - ax), heightAt(ax, az) - 0.5, heightAt(ax, az) + 0.9, 'barrier');
      acc += l;
    }
  }

  // ---- dry autumn grass on the verges: ours up to the field's edging, the field, and the far verge
  const band = (F, o0, o1, s0, s1, step = 5) => { const P = []; for (let s = s0; s <= s1; s += step) P.push(Wf(F, s, o0)); for (let s = s1; s >= s0; s -= step) P.push(Wf(F, s, o1)); return P; };
  drape(A.dry, band(FN, W / 2 + SH.nb, 40, 20, 125), 0.02, 2, 3);
  drape(A.dry, band(FN, -(4.5 + 0.3 + 0.15 + W + SH.sb), -22.5, 0, Math.min(FN.L, 160)), 0.02, 2, 3);

  // ---- the welcome sign: a stone base, the panel with a white frame, two solar panels and two floodlights on top;
  //      it faces the oncoming traffic (its width on the photo: ~1.95 m seen 31° off its axis)
  const signAt = (spec) => {
    const [x, z] = Wf(FN, spec.s, spec.o), [ux, uz] = FN.dir(spec.s), rt = [-uz, ux];   // along, right
    const a = (spec.turn ?? 15) * Math.PI / 180, fx = -ux * Math.cos(a) - rt[0] * Math.sin(a), fz = -uz * Math.cos(a) - rt[1] * Math.sin(a);   // its face
    const nx = fz, nz = -fx;   // the viewer's right, looking at the face
    return { x, z, y: heightAt(x, z), fx, fz, nx, nz, rot: -Math.atan2(nz, nx) };
  };
  {
    const S = signAt(SIGN), w = SIGN.w, h = SIGN.h, y0 = S.y + 0.3;
    const P = (u, v, d = 0) => [S.x + S.nx * u + S.fx * d, y0 + v, S.z + S.nz * u + S.fz * d];
    boxAt(G.stone, S.x - S.fx * 0.1, S.y + 0.05, S.z - S.fz * 0.1, w + 0.25, 0.5, 0.7, S.rot);
    A.sign.quad(P(-w / 2, 0, 0.06), P(w / 2, 0, 0.06), P(w / 2, h, 0.06), P(-w / 2, h, 0.06), [S.fx, 0, S.fz], [0, 0, 1, 0, 1, 1, 0, 1]);
    boxAt(G.green, S.x - S.fx * 0.12, y0 + h / 2, S.z - S.fz * 0.12, w + 0.06, h + 0.06, 0.34, S.rot);
    for (const sd of [-1, 1]) {
      // solar panels on short masts at the top, tilted south-ish; floodlights on arms reaching out over the face
      const mb = P(sd * 0.55, h, -0.1), mt = P(sd * 0.55, h + 0.35, -0.1);
      tube(G.galv, mb, mt, 0.03, 6);
      const c = P(sd * 0.55, h + 0.55, -0.05), g1 = new THREE.BoxGeometry(0.4, 0.7, 0.04);
      g1.rotateX(-0.35); g1.rotateY(Math.atan2(S.fx, S.fz)); g1.translate(c[0], c[1], c[2]); G.solar.push(g1);
      const a0 = P(sd * 0.9, h + 0.05, 0), a1 = P(sd * 0.95, h + 0.2, 0.45);
      tube(G.lamp, a0, a1, 0.02, 5);
      boxAt(G.lamp, a1[0], a1[1], a1[2], 0.3, 0.12, 0.22, S.rot);
    }
    box(S.x - S.fx * 0.1, S.z - S.fz * 0.1, w / 2 + 0.15, 0.45, Math.atan2(-S.nz, S.nx), S.y - 0.2, y0 + h, 'billboard');
  }
  // ---- the smaller board on two posts, and the no-stopping sign at the shoulder's edge
  {
    const S = signAt(BOARD), w = 2.2, h = 2.9, y0 = S.y + 0.7;
    const P = (u, v, d = 0) => [S.x + S.nx * u + S.fx * d, y0 + v, S.z + S.nz * u + S.fz * d];
    A.board.quad(P(-w / 2, 0, 0.03), P(w / 2, 0, 0.03), P(w / 2, h, 0.03), P(-w / 2, h, 0.03), [S.fx, 0, S.fz], [0, 0, 1, 0, 1, 1, 0, 1]);
    boxAt(G.back, S.x - S.fx * 0.02, y0 + h / 2, S.z - S.fz * 0.02, w, h, 0.04, S.rot);
    for (const sd of [-1, 1]) { const p = P(sd * 0.9, 0, -0.08); cyl(G.galv, p[0], S.y - 0.2, p[2], y0 - S.y + h + 0.1, 0.05); }
    box(S.x, S.z, 1.2, 0.15, Math.atan2(-S.nz, S.nx), S.y, y0 + h, 'sign');
    const N = signAt(NOSTOP), ny = N.y + 2.1;
    cyl(G.galv, N.x, N.y - 0.2, N.z, 2.5, 0.03);
    A.nostop.quad([N.x - N.nx * 0.35 + N.fx * 0.04, ny - 0.35, N.z - N.nz * 0.35 + N.fz * 0.04], [N.x + N.nx * 0.35 + N.fx * 0.04, ny - 0.35, N.z + N.nz * 0.35 + N.fz * 0.04], [N.x + N.nx * 0.35 + N.fx * 0.04, ny + 0.35, N.z + N.nz * 0.35 + N.fz * 0.04], [N.x - N.nx * 0.35 + N.fx * 0.04, ny + 0.35, N.z - N.nz * 0.35 + N.fz * 0.04], [N.fx, 0, N.fz], [0, 0, 1, 0, 1, 1, 0, 1]);
    const d = new THREE.CylinderGeometry(0.35, 0.35, 0.02, 20); d.rotateX(Math.PI / 2); d.rotateY(Math.atan2(N.fx, N.fz)); d.translate(N.x, ny, N.z); G.back.push(d);
    box(N.x, N.z, 0.05, 0.05, 0, N.y, N.y + 2.5, 'sign');
  }
  // ---- the field's low dark edging along the verge
  for (let s = 62; s < 101; s += 3) {
    const a = Wf(FN, s, 12.8 + (s - 62) * 0.092), b = Wf(FN, s + 3, 12.8 + (s + 3 - 62) * 0.092), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    boxAt(G.edging, cx, heightAt(cx, cz) + 0.12, cz, l, 0.36, 0.12, -Math.atan2(b[1] - a[1], b[0] - a[0]));
  }

  // ---- photo 65: dry grass on the verges of the wooded stretch, and the white kilometre-type post with a red cap
  const FC = frame(chainNB());
  for (let s = 300; s < Math.min(FC.L, LEVEL.s1 + 150); s += 6) {             // in 6 m pieces (one long thin polygon triangulates badly)
    drape(A.dry, band(FC, 5.0, 12, s, s + 6, 6), 0.02, 2, 3);
    drape(A.dry, band(FC, -13.9, -20, s, s + 6, 6), 0.02, 2, 3);
  }
  {
    const [px, pz] = Wf(FC, POST.s, POST.o), py = heightAt(px, pz), [ux, uz] = FC.dir(POST.s);
    boxAt(G.post, px, py + 0.3, pz, 0.24, 0.8, 0.18, -Math.atan2(uz, ux));
    boxAt(G.cap, px, py + 0.74, pz, 0.26, 0.14, 0.2, -Math.atan2(uz, ux));
    box(px, pz, 0.14, 0.11, Math.atan2(-uz, ux), py - 0.1, py + 0.8, 'post');
  }

  // ---- flush
  A.shoulder.flush(B, Mt.shoulder, null, { noCast: true }); A.barrier.flush(B, Mt.concrete); A.dry.flush(B, Mt.dry, null, { noCast: true });
  A.sign.flush(B, Mt.sign); A.board.flush(B, Mt.board); A.nostop.flush(B, Mt.nostop);
  for (const k of Object.keys(G)) if (G[k].length) B.geo(Mt[k], merged(G[k]));

  // photo 64's view: the Street View camera in our right lane
  const [cx, cz] = Wf(FN, CAM.s, CAM.o), [ux, uz] = FN.dir(CAM.s), a = CAM.yaw * Math.PI / 180;
  const dx = ux * Math.cos(a) - uz * Math.sin(a), dz = uz * Math.cos(a) + ux * Math.sin(a);   // turned towards the right
  // photo 65's: our left lane's side of the right lane, in the wood
  const [ex, ez] = Wf(FC, CAM65.s, CAM65.o), [vx, vz] = FC.dir(CAM65.s), b = CAM65.yaw * Math.PI / 180;
  const ddx = vx * Math.cos(b) - vz * Math.sin(b), ddz = vz * Math.cos(b) + vx * Math.sin(b);
  return { type: 'pastravaria', name: 'DN1 · Păstrăvăria Cornu', view: { from: [cx, cz], to: [cx + dx * 60, cz + dz * 60], pitch: CAM.pitch, fov: CAM.fov },
    view65: { from: [ex, ez], to: [ex + ddx * 60, ez + ddz * 60], pitch: CAM65.pitch, fov: CAM65.fov } };
}
