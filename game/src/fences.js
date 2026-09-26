import * as THREE from 'three';
import { M } from './materials.js';
import { boxGeo, cylGeo, mat, rng, quadGeo } from './util.js';
import { baseHeight } from './config.js';
import { Box } from './collision.js';

// All fence builders work in world coordinates along Z.
// x = street-facing face; dir = +1 (east side, body extends to +X) or -1 (west side).

const TIP = {};
function fleurDeLis(batch, x, y, z, s = 1, simple = false) {
  // cast ornamental spear tip (as on the house fence), gold
  if (!TIP.c) {
    TIP.c = new THREE.ConeGeometry(0.018, 0.11, 5); TIP.c.translate(0, 0.055, 0);
    TIP.b = new THREE.OctahedronGeometry(0.018, 0);
    TIP.p = new THREE.ConeGeometry(0.011, 0.07, 4);
    TIP.x = boxGeo(0.02, 0.012, 0.07);
    TIP.s = new THREE.ConeGeometry(0.014, 0.08, 4); TIP.s.translate(0, 0.04, 0);
  }
  const m = (xx, yy, zz, rx = 0) => new THREE.Matrix4().multiplyMatrices(mat(xx, yy, zz, rx), new THREE.Matrix4().makeScale(s, s, s));
  if (simple) { batch.add(M.gold, TIP.s, m(x, y, z)); return; }
  batch.add(M.gold, TIP.c, m(x, y, z));
  batch.add(M.gold, TIP.b, m(x, y + 0.002, z));
  for (const sg of [-1, 1]) batch.add(M.gold, TIP.p, m(x, y + 0.03 * s, z + sg * 0.026 * s, sg * 0.65));
  batch.add(M.gold, TIP.x, m(x, y + 0.012 * s, z));
}

// Black wrought-iron fence with artificial-ivy screen and wave top rail (the house fence, photo 4).
export function ironIvyFence(batch, world, { x, z0, z1, panels, groundY, dir = 1, ivy = true, lamps = true, spacing = 0.14, simpleTips = false }) {
  const t = 0.25;                           // plinth thickness
  const cx = x + dir * t / 2;               // bar line
  const pTop = groundY + 0.37;
  // plinth with ceramic tiles + cap
  batch.add(M.plinthTile, boxGeo(t, 0.37, z1 - z0, 0.6), mat(cx, groundY + 0.185 - 0.02, (z0 + z1) / 2));
  batch.add(M.plinthTile, boxGeo(t + 0.04, 0.035, z1 - z0 + 0.02, 0.6), mat(cx, pTop, (z0 + z1) / 2));
  world.addAABB(Math.min(x, x + dir * t), Math.max(x, x + dir * t), z0, z1, -5, 2.2, 'fence');
  const pw = (z1 - z0) / panels;
  for (let p = 0; p <= panels; p++) {
    const pz = z0 + p * pw;
    // square post
    batch.add(M.blackMetal, boxGeo(0.09, 1.25, 0.09), mat(cx, pTop + 0.62, pz));
    if (lamps && p > 0) {
      // solar lantern cap (as on the posts in photos 4/5)
      batch.add(M.darkPlastic, boxGeo(0.14, 0.02, 0.14), mat(cx, pTop + 1.26, pz));
      batch.add(M.lampGlass, boxGeo(0.1, 0.1, 0.1), mat(cx, pTop + 1.32, pz));
      batch.add(M.darkPlastic, new THREE.ConeGeometry(0.1, 0.07, 4), mat(cx, pTop + 1.41, pz, 0, Math.PI / 4, 0));
    }
    if (p === panels) break;
    const za = pz + 0.05, zb = pz + pw - 0.05;
    const L = zb - za;
    const wave = (u) => pTop + 0.78 + 0.2 * Math.sin(Math.PI * u);          // top rail height
    // bottom rail
    batch.add(M.blackMetal, boxGeo(0.015, 0.035, L), mat(cx, pTop + 0.1, (za + zb) / 2));
    // wave top rail as short segments
    const segs = 18;
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs, u1 = (i + 1) / segs;
      const ya = wave(u0), yb = wave(u1);
      const zA = za + L * u0, zB = za + L * u1;
      const len = Math.hypot(zB - zA, yb - ya);
      batch.add(M.blackMetal, boxGeo(0.014, 0.04, len + 0.004), mat(cx, (ya + yb) / 2, (zA + zB) / 2, -Math.atan2(yb - ya, zB - zA), 0, 0));
    }
    // ivy screen strip following the wave
    if (ivy) {
      const pos = [], uv = [], idx = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const u = i / n, z = za + L * u, top = wave(u) - 0.01;
        pos.push(cx + dir * 0.012, pTop + 0.08, z, cx + dir * 0.012, top, z);
        const uu = (z - za) / (spacing * 20);
        uv.push(uu, 0, uu, (top - pTop - 0.08) / 0.78);
        if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      batch.add(M.ivy, g);
    }
    // bars (aligned with the bars photographed in the ivy texture), alternating heights
    const nb = Math.floor(L / spacing);
    for (let k = 0; k <= nb; k++) {
      const z = za + k * spacing;
      if (z > zb) break;
      const tall = k % 2 === 0;
      const top = wave((z - za) / L) + (tall ? 0.24 : 0.13);
      const h = top - (pTop + 0.02);
      batch.add(M.blackMetal, boxGeo(0.017, h, 0.017), mat(cx, pTop + 0.02 + h / 2, z));
      fleurDeLis(batch, cx, top, z, tall ? 1.0 : 0.8, simpleTips);
    }
  }
}

// Green chain-link fence on a stone retaining wall with concrete coping (north neighbour, photos 1/2).
export function stoneWallChainFence(batch, world, { x, z0, z1, groundY, dir = 1, wallH = 0.5 }) {
  const t = 0.3;
  const cx = x + dir * t / 2;
  const L = z1 - z0;
  // stone face (photo texture) + top/back
  const face = quadGeo(L, wallH, 0, 0, L / 2.2, 1);
  batch.add(M.stoneWall, face, mat(x, groundY + wallH / 2, (z0 + z1) / 2, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
  batch.add(M.stuccoGray, boxGeo(t - 0.02, wallH, L, 1), mat(cx + dir * 0.01, groundY + wallH / 2, (z0 + z1) / 2), { noCast: true });
  batch.add(M.curb, boxGeo(t + 0.06, 0.08, L + 0.04, 0.5), mat(cx, groundY + wallH + 0.04, (z0 + z1) / 2));
  const top = groundY + wallH + 0.08;
  world.addAABB(Math.min(x, x + dir * t), Math.max(x, x + dir * t), z0, z1, -5, 2.2, 'fence');
  const postStep = 2.45;
  const n = Math.max(1, Math.round(L / postStep));
  const step = L / n;
  const fh = 1.18;
  for (let i = 0; i <= n; i++) {
    const z = z0 + i * step;
    batch.add(M.greenMetal, cylGeo(0.03, 0.03, fh + 0.08, 8), mat(cx, top + (fh + 0.08) / 2, z));
    batch.add(M.greenMetal, new THREE.SphereGeometry(0.042, 8, 6), mat(cx, top + fh + 0.1, z));
    if (i === n) break;
    const za = z + 0.03, zb = z + step - 0.03, ll = zb - za;
    // mesh panel
    const g = quadGeo(ll, fh - 0.06, 0, 0, ll / 0.25, (fh - 0.06) / 0.25);
    batch.add(M.chain, g, mat(cx, top + (fh - 0.06) / 2 + 0.02, (za + zb) / 2, 0, Math.PI / 2, 0), { noCast: false });
    // tension wires + decorative loop border along the top (as in photo 2)
    for (const yy of [0.04, fh * 0.5, fh - 0.04]) batch.add(M.galv, cylGeo(0.004, 0.004, ll, 3), mat(cx, top + yy, (za + zb) / 2, Math.PI / 2, 0, 0));
    const wpts = [];
    for (let k = 0; k <= Math.floor(ll / 0.08); k++) wpts.push(new THREE.Vector3(cx, top + fh - 0.02 + (k % 2 ? 0.05 : 0), za + k * 0.08));
    if (wpts.length > 2) batch.add(M.galv, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts), wpts.length * 2, 0.004, 3, false));
  }
}

// Vertical-board wooden fence (maroon stained) with metal or wooden posts (photos 1 & 5).
export function picketFence(batch, world, { x, z0, z1, groundY, dir = 1, h = 1.6, postMat = null, base = true, rounded = true, seed = 1 }) {
  const r = rng(seed);
  const cx = x + dir * 0.05;
  const L = z1 - z0;
  if (base) batch.add(M.curb, boxGeo(0.16, 0.18, L, 0.5), mat(x + dir * 0.08, groundY + 0.07, (z0 + z1) / 2));
  const y0 = groundY + (base ? 0.16 : 0.04);
  world.addAABB(Math.min(x, x + dir * 0.2), Math.max(x, x + dir * 0.2), z0, z1, -5, 2.2, 'fence');
  const bw = 0.09, gap = 0.022;
  const n = Math.floor(L / (bw + gap));
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * (bw + gap);
    const hh = h - (rounded ? 0.04 : 0) + (r() - 0.5) * 0.015;
    batch.add(M.picket, boxGeo(0.018, hh, bw, 0.2, 1.6), mat(cx, y0 + hh / 2, z));
    if (rounded) {
      const cap = new THREE.CylinderGeometry(bw / 2, bw / 2, 0.018, 4, 1, false, 0, Math.PI);
      batch.add(M.picket, cap, mat(cx, y0 + hh, z, 0, 0, Math.PI / 2));
    }
  }
  // rails behind the boards
  for (const yy of [0.3, h - 0.3]) batch.add(M.picket, boxGeo(0.04, 0.08, L), mat(cx + dir * 0.035, y0 + yy, (z0 + z1) / 2));
  // posts
  const pm = postMat ?? M.picket;
  for (let z = z0; z <= z1 + 0.01; z += 2.4) {
    batch.add(pm, boxGeo(0.07, h + 0.05, 0.07), mat(cx + dir * 0.07, y0 + (h + 0.05) / 2 - 0.02, Math.min(z, z1)));
  }
}

// Light teal corrugated-metal panel fence (far left in photo 1)
export function panelFence(batch, world, { x, z0, z1, groundY, dir = 1, h = 1.5, m = M.tealPanel }) {
  const L = z1 - z0;
  const cx = x + dir * 0.04;
  batch.add(M.concrete, boxGeo(0.2, 0.3, L, 0.6), mat(x + dir * 0.1, groundY + 0.1, (z0 + z1) / 2));
  const n = Math.max(1, Math.round(L / 2));
  for (let i = 0; i < n; i++) {
    const za = z0 + i * L / n + 0.04, zb = z0 + (i + 1) * L / n - 0.04;
    const g = new THREE.BoxGeometry(0.02, h, zb - za, 1, 1, 24);
    // corrugation
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + Math.sin(p.getZ(k) * 40) * 0.008);
    g.computeVertexNormals();
    batch.add(m, g, mat(cx, groundY + 0.25 + h / 2, (za + zb) / 2));
    batch.add(M.blackMetal, boxGeo(0.06, h + 0.3, 0.06), mat(cx + dir * 0.03, groundY + 0.25 + h / 2, za - 0.04));
  }
  world.addAABB(Math.min(x, x + dir * 0.2), Math.max(x, x + dir * 0.2), z0, z1, -5, 2.2, 'fence');
}

// Plain welded-mesh fence (side/back boundaries).
export function meshFence(batch, world, { ax, az, bx, bz, groundY, h = 1.4 }) {
  const L = Math.hypot(bx - ax, bz - az);
  const ang = Math.atan2(bx - ax, bz - az);
  const n = Math.max(1, Math.round(L / 2.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    batch.add(M.greenMetal, cylGeo(0.025, 0.025, h, 6), mat(ax + (bx - ax) * t, groundY + h / 2, az + (bz - az) * t));
  }
  batch.add(M.chain, quadGeo(L, h - 0.1, 0, 0, L / 0.25, (h - 0.1) / 0.25), mat((ax + bx) / 2, groundY + h / 2, (az + bz) / 2, 0, ang + Math.PI / 2, 0));
  const hw = Math.abs(bx - ax) / 2 + 0.05, hd = Math.abs(bz - az) / 2 + 0.05;
  world.addAABB((ax + bx) / 2 - hw, (ax + bx) / 2 + hw, (az + bz) / 2 - hd, (az + bz) / 2 + hd, -5, 2.2, 'fence');
}

// Solid black metal fence (no ivy) with gate, for variety
export function blackBarFence(batch, world, { x, z0, z1, groundY, dir = 1, h = 1.5 }) {
  ironIvyFence(batch, world, { x, z0, z1, panels: Math.max(1, Math.round((z1 - z0) / 2.4)), groundY, dir, ivy: false, lamps: false, spacing: 0.12 });
  void h;
}

// Stucco wall fence with a tiled cap
export function wallFence(batch, world, { x, z0, z1, groundY, dir = 1, h = 1.7, m = M.stuccoCream }) {
  const L = z1 - z0;
  batch.add(m, boxGeo(0.22, h, L, 1.5), mat(x + dir * 0.11, groundY + h / 2, (z0 + z1) / 2));
  batch.add(M.roofTiles, boxGeo(0.34, 0.06, L + 0.1, 1), mat(x + dir * 0.11, groundY + h + 0.03, (z0 + z1) / 2));
  world.addAABB(Math.min(x, x + dir * 0.22), Math.max(x, x + dir * 0.22), z0, z1, -5, 3, 'fence');
}

export function fenceGate(batch, world, { x, z0, z1, groundY, dir = 1, open = 0, style = 'black' }) {
  // A simple swing gate; open = angle (radians) swinging into the yard
  const w = z1 - z0;
  const hinge = z1;
  const cx = x + dir * 0.12;
  const m = (lx, ly, lz) => new THREE.Matrix4().multiplyMatrices(mat(cx, groundY, hinge, 0, -dir * open, 0), mat(lx, ly, lz));
  const frame = style === 'black' ? M.blackMetal : M.picket;
  batch.add(frame, boxGeo(0.04, 0.04, w), m(0, 0.12, -w / 2));
  batch.add(frame, boxGeo(0.04, 0.04, w), m(0, 1.55, -w / 2));
  batch.add(frame, boxGeo(0.04, 1.45, 0.04), m(0, 0.84, -w + 0.02));
  batch.add(frame, boxGeo(0.04, 1.45, 0.04), m(0, 0.84, -0.02));
  if (style === 'black') {
    const cloth = quadGeo(w - 0.08, 1.05, 0, 0, 1, 1);
    batch.add(M.shadeCloth, cloth, m(0.01, 0.9, -w / 2).multiply(mat(0, 0, 0, 0, Math.PI / 2, 0)));
    for (let k = 0; k < Math.floor(w / 0.1); k++) {
      const pz = -0.06 - k * 0.1;
      batch.add(M.blackMetal, boxGeo(0.012, 0.16, 0.012), m(0, 1.63, pz));
      const wp = new THREE.Vector3().applyMatrix4(m(0, 1.71, pz));
      fleurDeLis(batch, wp.x, wp.y, wp.z, 0.6);
    }
    for (let k = 0; k < Math.floor(w / 0.08); k++) batch.add(M.blackMetal, boxGeo(0.01, 0.2, 0.01), m(0, 0.24, -0.04 - k * 0.08).multiply(mat(0, 0, 0, 0.6, 0, 0)));
  } else {
    for (let k = 0; k < Math.floor(w / 0.11); k++) batch.add(M.picket, boxGeo(0.018, 1.5, 0.09), m(0.02, 0.85, -0.06 - k * 0.11));
  }
  const c = new THREE.Vector3().applyMatrix4(m(0, 0, -w / 2));
  const b = world.addStatic(new Box(c.x, c.z, 0.05, w / 2, -dir * open, -5, 2, 'gate'));
  return b;
}

// Gray textured-plaster wall with a protruding stone ledge at the base and a red tile cap
// (the fence across the street, photo 8). Built along Z between z0..z1 at face x.
export function plasterWall(batch, world, { x, z0, z1, groundY, dir = -1, h = 1.75, ledge = true }) {
  const L = z1 - z0, t = 0.3, cx = x + dir * t / 2, zc = (z0 + z1) / 2;
  batch.add(M.wallPlaster, boxGeo(t, h, L, 1.2), mat(cx, groundY + h / 2, zc));
  // tile coping, slightly overhanging, in two slopes
  for (const sg of [-1, 1]) {
    batch.add(M.roofTiles, boxGeo(0.22, 0.04, L + 0.06, 0.5), mat(cx + sg * 0.09, groundY + h + 0.035, zc, 0, 0, sg * 0.28));
  }
  if (ledge) {
    const lw = 0.26, lh = 0.42;
    batch.add(M.stoneCladding, boxGeo(lw, lh, L - 0.1, 1.2), mat(x - dir * lw / 2 + dir * 0.02, groundY + lh / 2, zc));
    batch.add(M.concrete, boxGeo(lw + 0.03, 0.04, L - 0.06, 0.6), mat(x - dir * lw / 2 + dir * 0.02, groundY + lh + 0.02, zc));
  }
  world.addAABB(Math.min(x - dir * (ledge ? 0.28 : 0), x + dir * t), Math.max(x - dir * (ledge ? 0.28 : 0), x + dir * t), z0, z1, -5, 3, 'fence');
}

// Wooden board gate (double car gate or pedestrian door) with a gabled top.
export function boardGate(batch, world, { x, z0, z1, groundY, dir = -1, h = 2.05, peak = 0.28, board = 0.13, number = null, handle = false }) {
  const L = z1 - z0, zc = (z0 + z1) / 2, cx = x + dir * 0.1;
  const n = Math.max(2, Math.round(L / board));
  const bw = L / n;
  for (let i = 0; i < n; i++) {
    const z = z0 + (i + 0.5) * bw;
    const u = Math.abs(z - zc) / (L / 2);
    const hh = h + peak * (1 - u);
    batch.add(M.gateBoards, boxGeo(0.035, hh, bw - 0.008, 0.25, 1.9), mat(cx, groundY + 0.05 + hh / 2, z));
  }
  // top trim following the gable
  const half = L / 2, len = Math.hypot(half, peak), ang = Math.atan2(peak, half);
  for (const sg of [-1, 1]) batch.add(M.woodDark, boxGeo(0.05, 0.05, len), mat(cx, groundY + 0.05 + h + peak / 2 + 0.02, zc + sg * half / 2, sg * ang, 0, 0));
  // frame rails on the inner side
  for (const yy of [0.35, h - 0.3]) batch.add(M.woodDark, boxGeo(0.05, 0.1, L - 0.1), mat(cx + dir * 0.04, groundY + yy, zc));
  if (number) {
    batch.add(M[number], new THREE.PlaneGeometry(0.16, 0.12), mat(cx - dir * 0.022, groundY + h - 0.05, zc, 0, dir < 0 ? Math.PI / 2 : -Math.PI / 2, 0));
  }
  if (handle) {
    batch.add(M.whitePVC, boxGeo(0.03, 0.03, 0.14), mat(cx - dir * 0.04, groundY + 1.0, z1 - 0.14));
    batch.add(M.whitePVC, boxGeo(0.03, 0.12, 0.03), mat(cx - dir * 0.04, groundY + 0.95, z1 - 0.08));
  }
  world.addAABB(Math.min(x, x + dir * 0.2), Math.max(x, x + dir * 0.2), z0, z1, -5, 3, 'gate');
}
