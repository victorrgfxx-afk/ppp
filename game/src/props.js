/**
 * Toate obiectele de pe strada: stalpi de utilitati cu lampi cobra-head,
 * cabluri in catenara, garduri (lemn / metal / piatra), porti, case,
 * vegetatie si mobilier urban. Totul e construit procedural si
 * comasat pe material, ca sa avem putine draw-call-uri.
 */
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeos, box, cyl, wire, scaleUV } from './geo.js';
import { surfaceY } from './terrain.js';
import { makeRng, clamp } from './noise.js';

export class GeoBag {
  constructor() { this.map = new Map(); }
  add(key, geo) {
    if (!geo) return;
    let a = this.map.get(key);
    if (!a) { a = []; this.map.set(key, a); }
    if (Array.isArray(geo)) { for (const g of geo) if (g) a.push(g); } else a.push(geo);
  }
  /**
   * Contopeste pe material. Cu `tile` > 0 imparte si pe dale de `tile` metri:
   * un mesh urias ar intra in fiecare con de umbra si in orice frustum.
   */
  build(scene, materials, { castShadow = true, receiveShadow = true, tile = 0, aliases = {}, noShadow = [] } = {}) {
    const meshes = [];
    // materialele care difera doar prin culoare devin unul singur, nuantat pe varf
    const tinted = new Set(Object.values(aliases).map((a) => a.base));
    const regroup = new Map();
    for (const [k, arr] of this.map) {
      const a = aliases[k];
      const base = a ? a.base : k;
      if (tinted.has(base)) {
        const tint = a ? a.tint : [1, 1, 1];
        for (const g of arr) {
          const n = g.attributes.position.count, c = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { c[i * 3] = tint[0]; c[i * 3 + 1] = tint[1]; c[i * 3 + 2] = tint[2]; }
          g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        }
      }
      let list = regroup.get(base);
      if (!list) { list = []; regroup.set(base, list); }
      for (const g of arr) list.push(g);
    }
    for (const [k, arr] of regroup) {
      const m = materials[k];
      if (!m || arr.length === 0) continue;
      const groups = new Map();
      for (const g of arr) {
        let key = '0';
        if (tile > 0) {
          if (!g.boundingBox) g.computeBoundingBox();
          const c = g.boundingBox.getCenter(new THREE.Vector3());
          key = Math.floor(c.x / tile) + ',' + Math.floor(c.z / tile);
        }
        let list = groups.get(key);
        if (!list) { list = []; groups.set(key, list); }
        list.push(g);
      }
      for (const list of groups.values()) {
        const mesh = new THREE.Mesh(mergeGeos(list), m);
        mesh.castShadow = castShadow && !noShadow.includes(k);
        mesh.receiveShadow = receiveShadow;
        mesh.name = 'bag_' + k;
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
    this.map.clear();
    return meshes;
  }
}

/* ======================= STALP + LAMPA COBRA-HEAD ======================= */

export function utilityPole(bag, col, x, z, opts = {}) {
  // dir = directia de la stalp spre carosabil; bratul lampii trece peste strada
  const { height = 9.1, withLamp = true, crossArm = true, dir = [1, 0] } = opts;
  const tx = dir[0], tz = dir[1];
  const ax = -tz, az = tx;                              // de-a lungul strazii
  const ryAlong = Math.atan2(ax, az);                   // box cu lungimea pe z-local
  const ryOut = Math.atan2(-tz, tx);                    // box cu lungimea pe x-local
  const y0 = surfaceY(x, z);
  const rnd = makeRng(Math.round((x * 73 + z * 131) * 7) + 3);

  bag.add('poleConcrete', cyl(0.115, 0.165, height, 10, x, y0 + height / 2, z));
  bag.add('poleConcrete', cyl(0.24, 0.26, 0.35, 10, x, y0 + 0.14, z));

  if (crossArm) {
    const yA = y0 + height - 1.15;
    bag.add('metalDark', box(0.09, 0.09, 1.9, x, yA, z, ryAlong));
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const px = x + ax * i * 0.42, pz = z + az * i * 0.42;
      bag.add('metalDark', box(0.05, 0.16, 0.05, px, yA + 0.12, pz, ryAlong));
      bag.add('insulator', cyl(0.055, 0.065, 0.13, 8, px, yA + 0.26, pz));
    }
  }

  let lampPos = null;
  if (withLamp) {
    const yB = y0 + height - 1.9;
    const tipY = y0 + height - 0.55;
    const at = (k, y) => new THREE.Vector3(x + tx * k, y, z + tz * k);
    const curve = new THREE.CatmullRomCurve3([at(0.10, yB), at(0.55, yB + 0.62), at(1.35, yB + 1.18), at(2.25, tipY)]);
    bag.add('metalDark', new THREE.TubeGeometry(curve, 16, 0.045, 6, false));
    bag.add('metalDark', box(0.06, 0.55, 0.06, x + tx * 0.62, yB + 0.30, z + tz * 0.62, ryOut));

    // corp de iluminat cobra-head: carcasa turtita, cu botul usor ridicat
    const lx = x + tx * 2.55, lz = z + tz * 2.55, ly = tipY - 0.05;
    const housing = box(0.72, 0.15, 0.30, 0, 0, 0);
    housing.rotateZ(0.07); housing.rotateY(ryOut); housing.translate(lx, ly, lz);
    bag.add('lampBody', housing);
    const cap = box(0.40, 0.09, 0.26, 0, 0, 0);
    cap.rotateZ(0.07); cap.translate(-0.16, 0.10, 0); cap.rotateY(ryOut); cap.translate(lx, ly, lz);
    bag.add('lampBody', cap);
    const lens = new THREE.PlaneGeometry(0.60, 0.24);
    lens.rotateX(Math.PI / 2); lens.rotateZ(0.07); lens.translate(0, -0.078, 0);
    lens.rotateY(ryOut); lens.translate(lx, ly, lz);
    bag.add('lampLens', lens);
    lampPos = new THREE.Vector3(lx, ly - 0.09, lz);
  }

  if (rnd() < 0.45) bag.add('metalBox', box(0.26, 0.36, 0.18, x - tx * 0.2, y0 + 2.1, z - tz * 0.2, ryOut));
  col.add(x, z, 0.22, 0.22, y0, y0 + height, 0, 'pole');
  return { pos: new THREE.Vector3(x, y0, z), lampPos, height, along: [ax, az], dir: [tx, tz] };
}

/** Fire intre stalpi + bransamente care traverseaza strada (ca in poze). */
export function powerLines(bag, poles, opts = {}) {
  const { drops = [], seed = 17 } = opts;
  const rnd = makeRng(seed);
  for (let i = 0; i < poles.length - 1; i++) {
    const A = poles[i], B = poles[i + 1];
    const span = A.pos.distanceTo(B.pos);
    const sag = clamp(span * 0.022, 0.25, 1.1);
    const yA = A.pos.y + A.height - 1.15 + 0.30;
    const yB = B.pos.y + B.height - 1.15 + 0.30;
    const aA = A.along || [0, 1], aB = B.along || [0, 1];
    const dA = A.dir || [1, 0], dB = B.dir || [1, 0];
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      bag.add('cable', wire(
        new THREE.Vector3(A.pos.x + aA[0] * k * 0.42, yA, A.pos.z + aA[1] * k * 0.42),
        new THREE.Vector3(B.pos.x + aB[0] * k * 0.42, yB, B.pos.z + aB[1] * k * 0.42),
        sag + rnd() * 0.12, 0.021, 12));
    }
    // fir de alimentare al iluminatului public, mai jos
    bag.add('cable', wire(
      new THREE.Vector3(A.pos.x - dA[0] * 0.18, yA - 0.95, A.pos.z - dA[1] * 0.18),
      new THREE.Vector3(B.pos.x - dB[0] * 0.18, yB - 0.95, B.pos.z - dB[1] * 0.18),
      sag * 1.25, 0.018, 12));
    // fire de telecom, grupate si mai lasate
    bag.add('cable', wire(
      new THREE.Vector3(A.pos.x + dA[0] * 0.16, yA - 1.75, A.pos.z + dA[1] * 0.16),
      new THREE.Vector3(B.pos.x + dB[0] * 0.16, yB - 1.75, B.pos.z + dB[1] * 0.16),
      sag * 1.6, 0.026, 12));
  }
  // bransamente catre case (traverseaza carosabilul in diagonala)
  for (const d of drops) {
    const p = poles[d.pole];
    if (!p) continue;
    const yTop = p.pos.y + p.height - 1.15 + 0.2;
    bag.add('cable', wire(
      new THREE.Vector3(p.pos.x, yTop - (d.dy || 1.0), p.pos.z),
      new THREE.Vector3(d.x, d.y, d.z),
      (d.sag != null ? d.sag : 0.55), 0.017, 12));
  }
}

/* =============================== VEGETATIE ============================== */

export function tree(bag, col, x, z, kind = 'broadleaf', scale = 1, seed = 1) {
  const rnd = makeRng(seed);
  const y0 = surfaceY(x, z);
  const quad = (key, px, py, pz, sx, sy, rot, tilt) => {
    const g = new THREE.PlaneGeometry(sx, sy);
    g.rotateZ(tilt);
    g.rotateY(rot);
    g.translate(px, py, pz);
    bag.add(key, g);
  };

  if (kind === 'conifer') {
    const H = (4.2 + rnd() * 3.2) * scale;
    bag.add('bark', cyl(0.06 * scale, 0.16 * scale, H * 0.34, 5, x, y0 + H * 0.17, z));
    const layers = Math.round(15 + rnd() * 6);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const y = y0 + H * (0.14 + t * 0.84);
      const r = (1 - t) * (1.0 + rnd() * 0.25) * scale * 0.95 + 0.18;
      const n = 4;
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2 + (k / n) * Math.PI * 2;
        quad('leafDark', x + Math.cos(a) * r * 0.42, y, z + Math.sin(a) * r * 0.42,
          r * 1.22, r * 1.4, a, (rnd() - 0.5) * 0.3);
      }
    }
    col.add(x, z, 0.28 * scale, 0.28 * scale, y0, y0 + H, 0, 'tree');
  } else if (kind === 'bush' || kind === 'hedge') {
    const H = (0.9 + rnd() * 0.7) * scale;
    const R = (0.8 + rnd() * 0.6) * scale;
    const n = kind === 'hedge' ? 14 : 16;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * R * 0.55;
      quad(rnd() < 0.5 ? 'leafDark' : 'leaf',
        x + Math.cos(a) * rr, y0 + H * (0.28 + rnd() * 0.66), z + Math.sin(a) * rr,
        R * 1.05, H * 0.85, a, (rnd() - 0.5) * 0.4);
    }
    col.add(x, z, R * 0.8, R * 0.8, y0, y0 + H, 0, 'bush');
  } else {
    // foioasa: trunchi + 2-3 sarpante + coroana din quad-uri
    const H = (5.5 + rnd() * 4.0) * scale;
    const tr = 0.14 * scale;
    bag.add('bark', cyl(tr * 0.7, tr, H * 0.52, 5, x, y0 + H * 0.26, z));
    const nb = 3;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + rnd();
      const bl = H * (0.28 + rnd() * 0.16);
      const bx = x + Math.cos(a) * bl * 0.45, bz = z + Math.sin(a) * bl * 0.45;
      const g = cyl(tr * 0.3, tr * 0.62, bl, 4);
      g.rotateZ(Math.cos(a) * -0.55);
      g.rotateX(Math.sin(a) * 0.55);
      g.translate((x + bx) / 2, y0 + H * 0.52 + bl * 0.30, (z + bz) / 2);
      bag.add('bark', g);
    }
    const crown = H * 0.5;
    const cy = y0 + H * 0.70;
    const n = Math.round(42 + rnd() * 16);
    const light = rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.5) * crown * 0.82;
      const yy = cy + (rnd() - 0.45) * crown * 0.95;
      const s = crown * (0.4 + rnd() * 0.26);
      quad(light ? 'leafLight' : 'leaf', x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr,
        s, s * (0.8 + rnd() * 0.4), a, (rnd() - 0.5) * 0.7);
    }
    col.add(x, z, tr * 2.2, tr * 2.2, y0, y0 + H, 0, 'tree');
  }
}

/* ============================ MOBILIER URBAN ============================ */

export function manhole(bag, x, z) {
  const y = surfaceY(x, z);
  bag.add('metalDark', cyl(0.33, 0.33, 0.05, 16, x, y + 0.004, z));
  bag.add('concrete', cyl(0.40, 0.40, 0.04, 16, x, y - 0.006, z));
}

export function drainGrate(bag, x, z, ry = 0) {
  const y = surfaceY(x, z);
  bag.add('concrete', box(0.52, 0.10, 0.44, x, y - 0.03, z, ry));
  for (let i = 0; i < 5; i++) {
    bag.add('metalDark', box(0.44, 0.05, 0.035, x, y + 0.012, z + (i - 2) * 0.075, ry));
  }
}


/** Firida de bransament montata pe zid, cu usita metalica. */
export function wallBox(bag, x, z, y = 1.25, ry = 0, w = 0.40, h = 0.52) {
  const y0 = surfaceY(x, z);
  bag.add('meterCabinet', box(w, h, 0.17, x, y0 + y, z, ry));
  bag.add('metalBox', box(w - 0.07, h - 0.07, 0.03, x, y0 + y, z + 0.10, ry));
  bag.add('metalDark', box(0.05, 0.05, 0.04, x + w * 0.3, y0 + y, z + 0.13, ry));
}

/** Bloc de beton lasat pe acostament (apare in prima fotografie). */
export function concreteBlock(bag, col, x, z, ry = 0) {
  const y0 = surfaceY(x, z);
  bag.add('concrete', scaleUV(box(0.62, 0.30, 0.44, x, y0 + 0.15, z, ry), 0.6, 0.3));
  col.add(x, z, 0.33, 0.24, y0, y0 + 0.30, ry, 'prop');
}

export function meterBox(bag, col, x, z, ry = 0) {
  const y = surfaceY(x, z);
  bag.add('concrete', box(0.46, 0.55, 0.40, x, y + 0.26, z, ry));
  bag.add('metalBox', box(0.40, 0.34, 0.03, x, y + 0.34, z + 0.21, ry));
}

export function trashBin(bag, col, x, z, ry = 0) {
  const y = surfaceY(x, z);
  bag.add('binBody', box(0.58, 0.88, 0.72, x, y + 0.50, z, ry));
  bag.add('binLid', box(0.60, 0.07, 0.74, x, y + 0.965, z, ry));
  bag.add('metalDark', cyl(0.09, 0.09, 0.07, 8, x - 0.22, y + 0.07, z + 0.26, Math.PI / 2));
  bag.add('metalDark', cyl(0.09, 0.09, 0.07, 8, x + 0.22, y + 0.07, z + 0.26, Math.PI / 2));
  col.add(x, z, 0.3, 0.37, y, y + 1.0, ry, 'prop');
}

export function mailbox(bag, x, z, ry = 0) {
  const y = surfaceY(x, z);
  bag.add('metalPaint', box(0.26, 0.34, 0.16, x, y + 1.15, z, ry));
  bag.add('metalDark', cyl(0.03, 0.03, 1.0, 6, x, y + 0.5, z));
}

/** Pachet de fire de iarba (instantiat) de-a lungul acostamentelor. */
export function grassTufts(scene, material, spots) {
  const g1 = new THREE.PlaneGeometry(0.42, 0.34);
  g1.translate(0, 0.17, 0);
  const g2 = g1.clone();
  g2.rotateY(Math.PI / 2);
  const geo = mergeGeos([g1, g2]);
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    e.set(0, sp.r, 0);
    q.setFromEuler(e);
    v.set(sp.x, surfaceY(sp.x, sp.z) - 0.02, sp.z);
    s.set(sp.s, sp.s * (0.8 + sp.v * 0.6), sp.s);
    m.compose(v, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}


/* ================== GARD / POARTA PE ORICE DIRECTIE ==================== */

/** Un panou de gard intre (x0,z0) si (x1,z1), in oricare dintre stilurile din poze. */
export function fencePanel(bag, col, x0, z0, x1, z1, style, rnd) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.4) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ry = Math.atan2(-dz, dx), yaw = Math.atan2(dz, dx);
  const y0 = Math.min(surfaceY(x0, z0), surfaceY(x1, z1), surfaceY(cx, cz));
  const B = (key, w, h, d, y, tile = 0, ox = 0) => {
    const g = box(w, h, d, cx + (dx / L) * ox, y, cz + (dz / L) * ox, ry);
    if (tile > 0) scaleUV(g, w / tile, h / tile);
    bag.add(key, g);
  };
  if (style === 'wood') {
    B('concrete', L, 0.26, 0.16, y0 + 0.10, 1.0);
    const H = 1.50 + rnd() * 0.12;
    B('wood', L, H, 0.055, y0 + 0.23 + H / 2, 1.35);
    B('woodDark', L, 0.075, 0.075, y0 + 0.28 + H, 1.0);
    B('woodDark', 0.11, H + 0.34, 0.11, y0 + 0.08 + (H + 0.34) / 2, 0.6, -L / 2);
  } else if (style === 'metal') {
    B('concrete', L, 0.52, 0.20, y0 + 0.23, 1.0);
    const H = 1.32;
    B('metalPaint', L, 0.05, 0.05, y0 + 0.58);
    B('metalPaint', L, 0.05, 0.05, y0 + 0.50 + H);
    // sipcile: un singur quad cu textura cu transparenta (in loc de ~18 cutii)
    const pk = new THREE.PlaneGeometry(L, H);
    const uv = pk.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (L / 0.54));
    pk.rotateY(ry); pk.translate(cx, y0 + 0.50 + H / 2, cz);
    bag.add('pickets', pk);
    B('metalPaint', 0.085, H + 0.64, 0.085, y0 + (H + 0.64) / 2, 0, -L / 2);
  } else {
    B('stone', L, 1.04, 0.28, y0 + 0.50, 0.85);
    B('concrete', L, 0.07, 0.34, y0 + 1.05, 1.0);
    B('brickPillar', 0.36, 1.60, 0.36, y0 + 0.78, 0.55, -L / 2);
    B('concrete', 0.46, 0.09, 0.46, y0 + 1.63, 1.0, -L / 2);
  }
  col.add(cx, cz, L / 2, 0.13, y0, y0 + 1.9, yaw, 'fence');
}

export function gatePanel(bag, col, x0, z0, x1, z1, style, hue, postStyle = 'concrete') {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ry = Math.atan2(-dz, dx), yaw = Math.atan2(dz, dx);
  const y0 = Math.min(surfaceY(x0, z0), surfaceY(x1, z1));
  const H = 1.72;
  const key = style === 'wood' ? 'wood' : (hue === 'teal' ? 'metalTeal' : 'metalPaint');
  for (const e of [-1, 1]) {
    const px = cx + (dx / L) * e * L / 2, pz = cz + (dz / L) * e * L / 2;
    if (postStyle === 'stone') {
      bag.add('brickPillar', scaleUV(box(0.36, 1.85, 0.36, px, y0 + 0.92, pz, ry), 0.66, 3.3));
      bag.add('concrete', box(0.46, 0.09, 0.46, px, y0 + 1.89, pz, ry));
    } else bag.add('concrete', scaleUV(box(0.30, H + 0.35, 0.30, px, y0 + (H + 0.35) / 2, pz, ry), 0.3, 2));
  }
  bag.add(key, box(L - 0.3, 0.10, 0.07, cx, y0 + H - 0.05, cz, ry));
  bag.add(key, box(L - 0.3, 0.10, 0.07, cx, y0 + 0.14, cz, ry));
  if (style === 'wood') bag.add('wood', scaleUV(box(L - 0.34, H - 0.24, 0.05, cx, y0 + H / 2 + 0.03, cz, ry), (L - 0.34) / 1.35, (H - 0.24) / 1.35));
  else {
    bag.add(key, box(L - 0.36, H - 0.22, 0.045, cx, y0 + H / 2 + 0.02, cz, ry));
    const n = Math.floor(L / 0.22);
    for (let k = 0; k < n; k++) {
      const o = (k + 0.5) * ((L - 0.3) / n) - (L - 0.3) / 2;
      bag.add(key, box(0.035, H - 0.3, 0.06, cx + (dx / L) * o, y0 + H / 2 + 0.02, cz + (dz / L) * o, ry));
    }
  }
  col.add(cx, cz, L / 2, 0.16, y0, y0 + H, yaw, 'gate');
}

/* ===================== CLADIRI DIN AMPRENTE OSM ======================== */

function pipXZ(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function wallQuad(ax, az, bx, bz, ya, yb, nx, nz, u0, u1, v0, v1) {
  const g = new THREE.BufferGeometry();
  const P = [ax, ya, az, bx, ya, bz, bx, yb, bz, ax, yb, az];
  // ordinea triunghiurilor aleasa dupa normala dorita (spre exterior)
  const flip = (-(bz - az)) * nx + (bx - ax) * nz < 0;
  const I = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
  g.setIndex(I);
  return g;
}

function tri3(a, b, c, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function quad3(a, b, c, d, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/**
 * Cladire ridicata exact pe amprenta OSM: soclu + pereti pe conturul real,
 * acoperis in doua ape pe dreptunghiul minim, ferestre pe fiecare perete,
 * usa si placuta cu numarul pe fatada dinspre strada.
 */
export function osmBuilding(bag, col, b, opts) {
  const { toward = [0, 1], rnd, wall = 'stucco', roof = 'roof', plates = null, litChance = 0.28 } = opts;
  const pts = b.pts;
  const n = pts.length;
  const kind = b.kind || 'yes';
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; area += a[0] * c[1] - c[0] * a[1]; }
  area = Math.abs(area) / 2;
  const isGarage = kind === 'garage' || kind === 'garages' || kind === 'shed' || (kind === 'yes' && area < 26);
  const levels = b.levels || (isGarage ? 1 : 1);
  const wallH = isGarage ? 2.35 : (levels >= 2 ? 5.5 : 2.95);

  let gMin = Infinity, gMax = -Infinity;
  for (const p of pts) { const y = surfaceY(p[0], p[1]); gMin = Math.min(gMin, y); gMax = Math.max(gMax, y); }
  const floor = gMax + (isGarage ? 0.12 : 0.34);
  const top = floor + wallH;

  // normalele exterioare, testate direct (merge si pe contururi neconvexe)
  const edges = [];
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % n];
    const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    let nx = dz / L, nz = -dx / L;
    const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
    if (pipXZ(mx + nx * 0.15, mz + nz * 0.15, pts)) { nx = -nx; nz = -nz; }
    edges.push({ a, c, L, nx, nz, u0: perim });
    perim += L;
  }

  // fatada: peretele care priveste cel mai bine spre strada (acolo sta placuta)
  let frontEdge = null, bestDot = -2;
  for (const e of edges) {
    const d = e.nx * toward[0] + e.nz * toward[1];
    if (e.L > 2.4 && d > bestDot) { bestDot = d; frontEdge = e; }
  }
  // usa: la casele de la strada intrarea e din curte, pe o latura, nu in trotuar
  let doorEdge = frontEdge;
  if (opts.nearStreet) {
    let bs = 2;
    for (const e of edges) {
      const d = Math.abs(e.nx * toward[0] + e.nz * toward[1]);
      if (e.L > 2.4 && e !== frontEdge && d < bs) { bs = d; doorEdge = e; }
    }
  }

  for (const e of edges) {
    const { a, c, L, nx, nz, u0 } = e;
    bag.add('stone', wallQuad(a[0], a[1], c[0], c[1], gMin - 0.3, floor, nx, nz, u0 / 1.2, (u0 + L) / 1.2, 0, (floor - gMin + 0.3) / 1.2));
    bag.add(isGarage ? 'stuccoWhite' : wall, wallQuad(a[0], a[1], c[0], c[1], floor, top, nx, nz, u0 / 3, (u0 + L) / 3, 0, wallH / 3));
    // brau sub streasina
    if (!isGarage) bag.add('windowFrame', wallQuad(a[0] + nx * 0.02, a[1] + nz * 0.02, c[0] + nx * 0.02, c[1] + nz * 0.02, top - 0.16, top, nx, nz, 0, 1, 0, 1));
    if (isGarage) {
      if (e === doorEdge) {
        const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L, w = Math.min(2.6, L - 0.6);
        const m = [(a[0] + c[0]) / 2 + nx * 0.04, (a[1] + c[1]) / 2 + nz * 0.04];
        bag.add('metalBox', wallQuad(m[0] - ux * w / 2, m[1] - uz * w / 2, m[0] + ux * w / 2, m[1] + uz * w / 2, floor, floor + 2.05, nx, nz, 0, 1, 0, 1));
      }
      continue;
    }
    // ferestre
    const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L;
    const count = L < 2.2 ? 0 : Math.max(1, Math.floor((L - 0.8) / 2.6));
    for (let lv = 0; lv < Math.min(levels, 2); lv++) {
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        if (e === doorEdge && lv === 0 && t > 0.62) continue;         // locul usii
        const cx = a[0] + (c[0] - a[0]) * t + nx * 0.035, cz = a[1] + (c[1] - a[1]) * t + nz * 0.035;
        const yb = floor + 0.92 + lv * 2.65;
        const lit = rnd() < litChance;
        bag.add(lit ? 'windowOn' : 'windowOff', wallQuad(cx - ux * 0.55, cz - uz * 0.55, cx + ux * 0.55, cz + uz * 0.55, yb, yb + 1.3, nx, nz, 0, 1, 0, 1));
        bag.add('windowFrame', wallQuad(cx - ux * 0.64 + nx * 0.02, cz - uz * 0.64 + nz * 0.02, cx + ux * 0.64 + nx * 0.02, cz + uz * 0.64 + nz * 0.02, yb - 0.09, yb - 0.02, nx, nz, 0, 1, 0, 1));
      }
    }
    if (e === doorEdge) {
      const t = 0.8, dxw = 0.48;
      const cx = a[0] + (c[0] - a[0]) * t + nx * 0.04, cz = a[1] + (c[1] - a[1]) * t + nz * 0.04;
      bag.add('woodDark', wallQuad(cx - ux * dxw, cz - uz * dxw, cx + ux * dxw, cz + uz * dxw, floor, floor + 2.1, nx, nz, 0, 1, 0, 1));
      bag.add('concrete', box(1.3, 0.16, 0.55, cx + nx * 0.28, floor - 0.09, cz + nz * 0.28, Math.atan2(-uz, ux)));
    }
    if (e === frontEdge && plates && b.nr && plates.uv[b.nr]) {
      // placuta cu numarul, pe fatada dinspre strada, langa colt
      const [u0p, v0p, u1p, v1p] = plates.uv[b.nr];
      const t = e === doorEdge ? 0.62 : 0.9;
      const px = a[0] + (c[0] - a[0]) * t + nx * 0.035, pz = a[1] + (c[1] - a[1]) * t + nz * 0.035;
      const ph = 0.19, pw = ph * plates.aspect;
      bag.add('plates', wallQuad(px - ux * pw / 2, pz - uz * pw / 2, px + ux * pw / 2, pz + uz * pw / 2, floor + 1.95, floor + 1.95 + ph, nx, nz, u0p, u1p, v0p, v1p));
    }
  }

  // acoperisul, pe dreptunghiul minim (OBB) al amprentei
  const [ocx, ocz, ow, od, oang] = b.obb;
  const long = ow >= od;
  const Lr = long ? ow : od, Sr = long ? od : ow;
  const rAng = long ? oang : oang + Math.PI / 2;
  const ex = Math.cos(rAng), ez = Math.sin(rAng);           // pe lungul coamei
  const px = -ez, pz = ex;                                   // peste coama
  const P = (l, s, y) => [ocx + ex * l + px * s, y, ocz + ez * l + pz * s];
  if (isGarage) {
    const o = 0.12, h0 = top + 0.02, h1 = top + 0.18;
    bag.add('roofDark', quad3(P(-Lr / 2 - o, -Sr / 2 - o, h0), P(Lr / 2 + o, -Sr / 2 - o, h0), P(Lr / 2 + o, Sr / 2 + o, h1), P(-Lr / 2 - o, Sr / 2 + o, h1), [0, 0, Lr / 1.6, 0, Lr / 1.6, Sr / 1.4, 0, Sr / 1.4]));
  } else {
    const pitch = Math.tan((28 + rnd() * 10) * Math.PI / 180);
    const over = 0.45, overE = 0.35;
    const rise = (Sr / 2) * pitch;
    const eaveY = top - over * pitch;
    const L2 = Lr / 2 + overE, S2 = Sr / 2 + over;
    const slope = Math.hypot(S2, rise + over * pitch);
    for (const sgn of [-1, 1]) {
      const a = P(-L2, 0, top + rise), c = P(L2, 0, top + rise);
      const d = P(L2, sgn * S2, eaveY), f = P(-L2, sgn * S2, eaveY);
      const q = sgn > 0 ? quad3(a, c, d, f, [0, slope / 1.4, (2 * L2) / 1.6, slope / 1.4, (2 * L2) / 1.6, 0, 0, 0])
                        : quad3(c, a, f, d, [0, slope / 1.4, (2 * L2) / 1.6, slope / 1.4, (2 * L2) / 1.6, 0, 0, 0]);
      bag.add(roof, q);
      bag.add('woodDark', box(0.06, 0.18, 2 * L2, ...P(0, sgn * S2, eaveY - 0.06), Math.atan2(ex, ez)));
    }
    for (const e of [-1, 1]) {
      const A = P(e * Lr / 2, -Sr / 2, top), C = P(e * Lr / 2, Sr / 2, top), R = P(e * Lr / 2, 0, top + rise);
      bag.add(wall, e > 0 ? tri3(A, C, R, [0, 0, Sr / 3, 0, Sr / 6, rise / 3]) : tri3(C, A, R, [0, 0, Sr / 3, 0, Sr / 6, rise / 3]));
    }
    // cos de fum pe unele case
    if (rnd() < 0.55) {
      const cp = P(Lr * (rnd() - 0.5) * 0.5, Sr * 0.18, top + rise * 0.6);
      bag.add('brick', scaleUV(box(0.45, 1.3, 0.45, cp[0], cp[1] + 0.35, cp[2], Math.atan2(ex, ez)), 0.4, 1.2));
    }
  }

  // coliziuni pe fiecare perete (exact si pentru contururi in L)
  for (const e of edges) {
    const mx = (e.a[0] + e.c[0]) / 2, mz = (e.a[1] + e.c[1]) / 2;
    col.add(mx - e.nx * 0.15, mz - e.nz * 0.15, e.L / 2 + 0.12, 0.2, gMin - 0.3, top + 1.5, Math.atan2(e.c[1] - e.a[1], e.c[0] - e.a[0]), 'house');
  }
  return { top, floor, kind: isGarage ? 'garage' : 'house', area };
}

/* ============================ CALE FERATA ============================== */

export function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    out.push([pts[i][0] - tz * d, pts[i][1] + tx * d]);
  }
  return out;
}

/** Stalp de catenara: stalp metalic + consola peste linie. */
export function catenaryMast(bag, col, x, z, dirX, dirZ) {
  const y0 = surfaceY(x, z);
  bag.add('metalGalv', box(0.22, 7.6, 0.22, x, y0 + 3.8, z, Math.atan2(-dirZ, dirX)));
  const tipX = x + dirX * 3.3, tipZ = z + dirZ * 3.3;
  bag.add('metalGalv', box(3.4, 0.07, 0.07, (x + tipX) / 2, y0 + 7.1, (z + tipZ) / 2, Math.atan2(-dirZ, dirX)));
  bag.add('metalGalv', box(3.4, 0.05, 0.05, (x + tipX) / 2, y0 + 6.5, (z + tipZ) / 2, Math.atan2(-dirZ, dirX)));
  bag.add('insulator', cyl(0.05, 0.05, 0.4, 6, tipX, y0 + 6.2, tipZ));
  col.add(x, z, 0.2, 0.2, y0, y0 + 7.6, 0, 'pole');
  return new THREE.Vector3(tipX, y0 + 5.8, tipZ);
}
