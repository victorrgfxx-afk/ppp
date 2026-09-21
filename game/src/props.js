/**
 * Toate obiectele de pe strada: stalpi de utilitati cu lampi cobra-head,
 * cabluri in catenara, garduri (lemn / metal / piatra), porti, case,
 * vegetatie si mobilier urban. Totul e construit procedural si
 * comasat pe material, ca sa avem putine draw-call-uri.
 */
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeos, box, cyl, wire, scaleUV, worldUV } from './geo.js';
import { surfaceY } from './terrain.js';
import { makeRng, lerp, clamp } from './noise.js';

export class GeoBag {
  constructor() { this.map = new Map(); }
  add(key, geo) {
    if (!geo) return;
    let a = this.map.get(key);
    if (!a) { a = []; this.map.set(key, a); }
    if (Array.isArray(geo)) { for (const g of geo) if (g) a.push(g); } else a.push(geo);
  }
  build(scene, materials, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [k, arr] of this.map) {
      const m = materials[k];
      if (!m || arr.length === 0) continue;
      const mesh = new THREE.Mesh(mergeGeos(arr), m);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.name = 'bag_' + k;
      scene.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

/* ======================= STALP + LAMPA COBRA-HEAD ======================= */

export function utilityPole(bag, col, x, z, opts = {}) {
  const {
    height = 9.1, armSide = 1, withLamp = true, crossArm = true, ry = 0,
  } = opts;
  const y0 = surfaceY(x, z);
  const rnd = makeRng(Math.round((x * 73 + z * 131) * 7) + 3);

  // stalp tronconic de beton
  bag.add('poleConcrete', cyl(0.115, 0.165, height, 10, x, y0 + height / 2, z));
  bag.add('poleConcrete', cyl(0.24, 0.26, 0.35, 10, x, y0 + 0.14, z));   // soclu

  // consola orizontala cu izolatori
  if (crossArm) {
    const yA = y0 + height - 1.15;
    bag.add('metalDark', box(0.09, 0.09, 1.9, x, yA, z, ry));
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      bag.add('metalDark', box(0.05, 0.16, 0.05, x, yA + 0.12, z + i * 0.42, ry));
      bag.add('insulator', cyl(0.055, 0.065, 0.13, 8, x, yA + 0.26, z + i * 0.42));
    }
  }

  let lampPos = null;
  if (withLamp) {
    // brat curbat catre mijlocul carosabilului
    const yB = y0 + height - 1.9;
    const tipX = x - armSide * 2.25;
    const tipY = y0 + height - 0.55;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x - armSide * 0.10, yB, z),
      new THREE.Vector3(x - armSide * 0.55, yB + 0.62, z),
      new THREE.Vector3(x - armSide * 1.35, yB + 1.18, z),
      new THREE.Vector3(tipX, tipY, z),
    ]);
    bag.add('metalDark', new THREE.TubeGeometry(curve, 16, 0.045, 6, false));
    bag.add('metalDark', box(0.06, 0.55, 0.06, x - armSide * 0.62, yB + 0.30, z));

    // corp de iluminat: carcasa turtita, usor inclinata
    const lx = tipX - armSide * 0.30, ly = tipY - 0.05;
    const housing = box(0.72, 0.15, 0.30, 0, 0, 0);
    housing.rotateZ(armSide * 0.07);
    housing.translate(lx, ly, z);
    bag.add('lampBody', housing);
    const cap = box(0.40, 0.09, 0.26, 0, 0, 0);
    cap.rotateZ(armSide * 0.07);
    cap.translate(lx + armSide * 0.16, ly + 0.10, z);
    bag.add('lampBody', cap);

    // lentila (emisiva)
    const lens = new THREE.PlaneGeometry(0.60, 0.24);
    lens.rotateX(Math.PI / 2);
    lens.rotateZ(armSide * 0.07);
    lens.translate(lx, ly - 0.078, z);
    bag.add('lampLens', lens);

    lampPos = new THREE.Vector3(lx, ly - 0.09, z);
  }

  // cutie de bransament pe stalp
  if (rnd() < 0.45) {
    bag.add('metalBox', box(0.26, 0.36, 0.18, x + 0.20, y0 + 2.1, z, 0));
  }
  col.add(x, z, 0.22, 0.22, y0, y0 + height, 0, 'pole');
  return { pos: new THREE.Vector3(x, y0, z), lampPos, height };
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
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      bag.add('cable', wire(
        new THREE.Vector3(A.pos.x, yA, A.pos.z + k * 0.42),
        new THREE.Vector3(B.pos.x, yB, B.pos.z + k * 0.42),
        sag + rnd() * 0.12, 0.021, 12));
    }
    // fir de alimentare al iluminatului public, mai jos
    bag.add('cable', wire(
      new THREE.Vector3(A.pos.x - 0.18, yA - 0.95, A.pos.z),
      new THREE.Vector3(B.pos.x - 0.18, yB - 0.95, B.pos.z),
      sag * 1.25, 0.018, 12));
    // fire de telecom, grupate si mai lasate
    bag.add('cable', wire(
      new THREE.Vector3(A.pos.x + 0.16, yA - 1.75, A.pos.z),
      new THREE.Vector3(B.pos.x + 0.16, yB - 1.75, B.pos.z),
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

/* ================================ GARDURI =============================== */

/**
 * Construieste un gard de-a lungul unei axe.
 * axis 'z' -> gardul e la x=c, intre from..to pe Z.
 */
export function fenceRun(bag, col, cfg) {
  const { axis = 'z', c = 0, from = 0, to = -20, style = 'wood', gaps = [], seed = 1 } = cfg;
  const rnd = makeRng(seed);
  const dir = to > from ? 1 : -1;
  const len = Math.abs(to - from);
  const at = (s) => (axis === 'z' ? { x: c, z: from + dir * s } : { x: from + dir * s, z: c });
  const inGap = (s) => gaps.some(([a, b]) => s >= a && s <= b);
  const rot = axis === 'z' ? 0 : Math.PI / 2;

  const step = style === 'stone' ? 3.0 : style === 'metal' ? 2.5 : 2.0;
  const nSeg = Math.max(1, Math.round(len / step));
  const segLen = len / nSeg;

  for (let i = 0; i < nSeg; i++) {
    const s0 = i * segLen, s1 = s0 + segLen, sm = (s0 + s1) / 2;
    if (inGap(sm)) continue;
    const p = at(sm);
    const y0 = surfaceY(p.x, p.z);
    const L = segLen;

    if (style === 'wood') {
      // soclu de beton + panou de scanduri (relieful vine din normal map)
      addOriented(bag, 'concrete', 0.16, 0.24, L, p.x, y0 + 0.12, p.z, rot, 0, 1.0);
      const H = 1.52 + rnd() * 0.10;
      addOriented(bag, 'wood', 0.055, H, L, p.x, y0 + 0.24 + H / 2, p.z, rot, 0, 1.35);
      addOriented(bag, 'woodDark', 0.075, 0.075, L, p.x, y0 + 0.24 + H + 0.05, p.z, rot, 0, 1.0);
      // stalpi de lemn intre panouri
      addOriented(bag, 'woodDark', 0.11, H + 0.34, 0.11, p.x, y0 + 0.10 + (H + 0.34) / 2,
        p.z - (axis === 'z' ? L / 2 : 0), rot, axis === 'x' ? -L / 2 : 0, 0.6);
      col.add(p.x, p.z, axis === 'z' ? 0.12 : L / 2, axis === 'z' ? L / 2 : 0.12, y0, y0 + 1.9, 0, 'fence');
    } else if (style === 'metal') {
      addOriented(bag, 'concrete', 0.20, 0.50, L, p.x, y0 + 0.25, p.z, rot, 0, 1.0);
      const H = 1.32;
      addOriented(bag, 'metalPaint', 0.05, 0.05, L, p.x, y0 + 0.58, p.z, rot);
      addOriented(bag, 'metalPaint', 0.05, 0.05, L, p.x, y0 + 0.50 + H, p.z, rot);
      const nB = Math.floor(L / 0.135);
      for (let k = 0; k < nB; k++) {
        const o = (k + 0.5) * (L / nB) - L / 2;
        addOriented(bag, 'metalPaint', 0.022, H, 0.022, p.x, y0 + 0.50 + H / 2, p.z + (axis === 'z' ? o : 0), rot, axis === 'x' ? o : 0);
      }
      addOriented(bag, 'metalPaint', 0.085, H + 0.62, 0.085, p.x, y0 + (H + 0.62) / 2,
        p.z - (axis === 'z' ? L / 2 : 0), rot, axis === 'x' ? -L / 2 : 0);
      col.add(p.x, p.z, axis === 'z' ? 0.12 : L / 2, axis === 'z' ? L / 2 : 0.12, y0, y0 + 1.9, 0, 'fence');
    } else if (style === 'stone') {
      addOriented(bag, 'stone', 0.28, 1.02, L, p.x, y0 + 0.51, p.z, rot, 0, 0.85);
      addOriented(bag, 'concrete', 0.34, 0.07, L, p.x, y0 + 1.09, p.z, rot, 0, 1.0);
      // stalpi de caramida
      addOriented(bag, 'brickPillar', 0.36, 1.58, 0.36, p.x, y0 + 0.79, p.z - (axis === 'z' ? L / 2 : 0), rot, axis === 'x' ? -L / 2 : 0, 0.55);
      addOriented(bag, 'concrete', 0.46, 0.09, 0.46, p.x, y0 + 1.66, p.z - (axis === 'z' ? L / 2 : 0), rot, axis === 'x' ? -L / 2 : 0, 1.0);
      col.add(p.x, p.z, axis === 'z' ? 0.20 : L / 2, axis === 'z' ? L / 2 : 0.20, y0, y0 + 1.7, 0, 'fence');
    } else if (style === 'hedgeWall') {
      addOriented(bag, 'concrete', 0.22, 0.55, L, p.x, y0 + 0.27, p.z, rot, 0, 1.0);
      col.add(p.x, p.z, axis === 'z' ? 0.16 : L / 2, axis === 'z' ? L / 2 : 0.16, y0, y0 + 0.6, 0, 'fence');
    }
  }
}

function addOriented(bag, key, thick, h, len, x, y, z, rot, offAlongX = 0, tile = 0) {
  // rot 0 -> gardul merge pe Z (grosime pe X); rot PI/2 -> merge pe X
  const g = rot === 0 ? box(thick, h, len, x, y, z) : box(len, h, thick, x + offAlongX, y, z);
  if (tile > 0) scaleUV(g, len / tile, h / tile);
  bag.add(key, g);
}

/* ================================ PORTI ================================= */

export function gate(bag, col, x, z, width = 3.2, axis = 'z', style = 'metal', hue = 'teal') {
  const y0 = surfaceY(x, z);
  const H = 1.72;
  const rot = axis === 'z' ? 0 : Math.PI / 2;
  const key = style === 'wood' ? 'wood' : (hue === 'teal' ? 'metalTeal' : 'metalPaint');
  // stalpii portii
  addOriented(bag, 'concrete', 0.30, H + 0.35, 0.30, x, y0 + (H + 0.35) / 2, z + (axis === 'z' ? width / 2 : 0), rot, axis === 'x' ? width / 2 : 0);
  addOriented(bag, 'concrete', 0.30, H + 0.35, 0.30, x, y0 + (H + 0.35) / 2, z - (axis === 'z' ? width / 2 : 0), rot, axis === 'x' ? -width / 2 : 0);
  // cadru + umplutura
  addOriented(bag, key, 0.07, 0.10, width, x, y0 + H - 0.05, z, rot);
  addOriented(bag, key, 0.07, 0.10, width, x, y0 + 0.14, z, rot);
  if (style === 'wood') {
    addOriented(bag, 'wood', 0.05, H - 0.24, width - 0.04, x, y0 + H / 2 + 0.03, z, rot, 0, 1.35);
  } else {
    addOriented(bag, key, 0.045, H - 0.22, width - 0.06, x, y0 + H / 2 + 0.02, z, rot);
    const n = Math.floor(width / 0.22);
    for (let k = 0; k < n; k++) {
      const o = (k + 0.5) * (width / n) - width / 2;
      addOriented(bag, key, 0.06, H - 0.3, 0.035, x, y0 + H / 2 + 0.02, z + (axis === 'z' ? o : 0), rot, axis === 'x' ? o : 0);
    }
  }
  col.add(x, z, axis === 'z' ? 0.16 : width / 2, axis === 'z' ? width / 2 : 0.16, y0, y0 + H, 0, 'gate');
}

/* ================================= CASE ================================= */

export function house(bag, col, cfg) {
  const {
    x, z, ry = 0, w = 9, d = 8, storeys = 1, wall = 'stucco', roof = 'roof',
    roofPitch = 0.42, litChance = 0.35, seed = 5, garage = false, porch = false,
  } = cfg;
  const rnd = makeRng(seed);
  const y0 = surfaceY(x, z);
  const sh = storeys === 2 ? 5.4 : 2.95;
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const L = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

  // soclu + corp
  bag.add('stone', box(w + 0.16, 0.45, d + 0.16, x, y0 + 0.22, z, ry));
  bag.add(wall, scaleUV(box(w, sh, d, x, y0 + 0.4 + sh / 2, z, ry), w / 3, sh / 3));

  // acoperis in doua ape
  const rh = (d / 2) * roofPitch + 0.55;
  const over = 0.42;
  const slope = Math.atan2(rh, d / 2 + over);
  const slopeLen = Math.hypot(rh, d / 2 + over);
  for (const s of [1, -1]) {
    const g = new THREE.PlaneGeometry(w + over * 2, slopeLen);
    scaleUV(g, (w + over * 2) / 1.6, slopeLen / 1.4);
    g.rotateX(-Math.PI / 2);
    g.rotateX(s * slope);
    g.rotateY(ry);
    const cz = s * (d / 4 + over / 2);
    const p = L(0, cz);
    g.translate(p.x, y0 + 0.4 + sh + rh / 2 - 0.02, p.z);
    bag.add(roof, g);
  }
  // fronton
  for (const s of [1, -1]) {
    const tri = new THREE.BufferGeometry();
    const hw = w / 2;
    const verts = new Float32Array([-hw, 0, 0, hw, 0, 0, 0, rh, 0]);
    tri.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, w / 3, 0, w / 6, rh / 3]), 2));
    if (s < 0) tri.rotateY(Math.PI);
    tri.rotateY(ry);
    const p = L(0, s * d / 2);
    tri.translate(p.x, y0 + 0.4 + sh, p.z);
    bag.add(wall, tri);
  }
  // streasina
  bag.add('woodDark', box(w + over * 2 + 0.1, 0.12, 0.14, x, y0 + 0.4 + sh + 0.02, z, ry));

  // ferestre pe fatada dinspre strada (-Z local)
  const wins = [];
  const nW = Math.max(2, Math.floor(w / 2.6));
  for (let st = 0; st < storeys; st++) {
    for (let i = 0; i < nW; i++) {
      const lx = (i + 0.5) * (w / nW) - w / 2;
      const ly = y0 + 0.4 + 1.15 + st * 2.7;
      const p = L(lx, -d / 2 - 0.06);
      const lit = rnd() < litChance;
      const g = new THREE.PlaneGeometry(1.15, 1.35);
      g.rotateY(ry + Math.PI);
      g.translate(p.x, ly, p.z);
      bag.add(lit ? 'windowOn' : 'windowOff', g);
      if (lit) wins.push({ x: p.x, y: ly, z: p.z, ry });
      bag.add('windowFrame', box(1.30, 0.09, 0.10, p.x, ly + 0.74, p.z, ry));
      bag.add('windowFrame', box(1.30, 0.07, 0.12, p.x, ly - 0.72, p.z, ry));
    }
  }
  // usa
  {
    const p = L(w / 2 - 1.1, -d / 2 - 0.05);
    bag.add('woodDark', box(0.95, 2.1, 0.09, p.x, y0 + 0.4 + 1.05, p.z, ry));
  }
  if (porch) {
    const p = L(0, -d / 2 - 1.3);
    bag.add('concrete', box(w * 0.7, 0.2, 2.4, p.x, y0 + 0.42, p.z, ry));
    for (const s of [-1, 1]) {
      const q = L(s * w * 0.28, -d / 2 - 2.35);
      bag.add('stucco', cyl(0.13, 0.15, 2.7, 8, q.x, y0 + 0.5 + 1.35, q.z));
    }
    const g = new THREE.PlaneGeometry(w * 0.74, 2.6);
    g.rotateX(-Math.PI / 2);
    g.rotateX(0.18);
    g.rotateY(ry);
    const r = L(0, -d / 2 - 1.3);
    bag.add('roofDark', g.translate(r.x, y0 + 3.0, r.z));
  }
  if (garage) {
    const p = L(-w / 2 - 2.6, d / 6);
    bag.add('stuccoWhite', box(5.2, 2.6, 5.4, p.x, y0 + 0.4 + 1.3, p.z, ry));
    const g2 = new THREE.PlaneGeometry(5.4, 5.7);
    g2.rotateX(-Math.PI / 2); g2.rotateX(0.12); g2.rotateY(ry);
    bag.add('roofDark', g2.translate(p.x, y0 + 3.15, p.z));
    const q = L(-w / 2 - 2.6, d / 6 - 2.75);
    bag.add('metalBox', box(3.1, 2.2, 0.12, q.x, y0 + 0.4 + 1.1, q.z, ry));
  }
  // burlan
  for (const s of [-1, 1]) {
    const p = L(s * (w / 2 - 0.2), -d / 2 - 0.12);
    bag.add('metalBox', cyl(0.06, 0.06, sh + 0.4, 6, p.x, y0 + (sh + 0.4) / 2, p.z));
  }

  const hx = Math.abs(w / 2 * cos) + Math.abs(d / 2 * sin);
  const hz = Math.abs(w / 2 * sin) + Math.abs(d / 2 * cos);
  col.add(x, z, hx, hz, y0, y0 + sh + rh, 0, 'house');
  return { windows: wins };
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
    bag.add('bark', cyl(0.06 * scale, 0.16 * scale, H * 0.34, 6, x, y0 + H * 0.17, z));
    const layers = Math.round(20 + rnd() * 8);
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
    bag.add('bark', cyl(tr * 0.7, tr, H * 0.52, 7, x, y0 + H * 0.26, z));
    const nb = 3;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + rnd();
      const bl = H * (0.28 + rnd() * 0.16);
      const bx = x + Math.cos(a) * bl * 0.45, bz = z + Math.sin(a) * bl * 0.45;
      const g = cyl(tr * 0.3, tr * 0.62, bl, 5);
      g.rotateZ(Math.cos(a) * -0.55);
      g.rotateX(Math.sin(a) * 0.55);
      g.translate((x + bx) / 2, y0 + H * 0.52 + bl * 0.30, (z + bz) / 2);
      bag.add('bark', g);
    }
    const crown = H * 0.5;
    const cy = y0 + H * 0.70;
    const n = Math.round(62 + rnd() * 26);
    const light = rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.5) * crown * 0.82;
      const yy = cy + (rnd() - 0.45) * crown * 0.95;
      const s = crown * (0.32 + rnd() * 0.24);
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

/** Podet de beton peste sant, in dreptul portilor (exact ca in prima poza). */
export function culvertSlab(bag, col, x, z, w = 3.4, depth = 1.6, axis = 'z') {
  const y = surfaceY(x, z);
  if (axis === 'z') bag.add('concrete', box(depth, 0.18, w, x, y + 0.09, z));
  else bag.add('concrete', box(w, 0.18, depth, x, y + 0.09, z));
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
