/**
 * Masini procedurale. Caroseria e obtinuta prin extrudarea siluetei
 * laterale (cu pasajele de roata decupate in profil), apoi deformata
 * pentru tumblehome si rotunjirea botului/spatelui - de aici silueta
 * credibila, nu "cutii stivuite".
 */
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeos, box, cyl, smoothNormals } from './geo.js';
import { smoothstep, makeRng, clamp } from './noise.js';

/* Siluete (z: fata = negativ). Toate cotele sunt in metri, reale. */
export const CAR_TYPES = {
  sedan: {   // berlina compacta premium, ~4,52 m, ampatament 2,76
    L: 4.52, W: 1.82, wb: 2.76, wr: 0.335, tw: 0.225, sill: 0.30, archR: 0.45,
    prof: [
      [-2.26, 0.42], [-2.27, 0.62], [-2.18, 0.76], [-1.96, 0.82], [-1.05, 0.92],
      [-0.34, 1.34], [0.55, 1.41], [1.22, 1.16], [1.86, 1.02], [2.16, 0.88],
      [2.24, 0.60], [2.22, 0.42],
    ],
    glass: [[-0.98, 0.98], [-0.36, 1.30], [0.52, 1.37], [1.16, 1.12], [1.16, 0.98]],
    tumble: 0.13, taper: 0.17,
  },
  wagon: {   // break, ~4,66 m, hayon aproape vertical
    L: 4.66, W: 1.81, wb: 2.68, wr: 0.335, tw: 0.225, sill: 0.30, archR: 0.45,
    prof: [
      [-2.33, 0.42], [-2.34, 0.62], [-2.25, 0.78], [-2.02, 0.84], [-1.08, 0.93],
      [-0.40, 1.35], [0.62, 1.47], [1.72, 1.48], [2.12, 1.44], [2.27, 1.08],
      [2.32, 0.70], [2.30, 0.42],
    ],
    glass: [[-1.00, 0.97], [-0.42, 1.31], [1.68, 1.43], [2.06, 1.30], [2.06, 0.97]],
    tumble: 0.12, taper: 0.15,
  },
  hatch: {   // hatchback compact, ~4,11 m, bot scurt dar nu de furgoneta
    L: 4.11, W: 1.75, wb: 2.61, wr: 0.315, tw: 0.215, sill: 0.31, archR: 0.43,
    prof: [
      [-2.05, 0.40], [-2.06, 0.62], [-1.98, 0.78], [-1.80, 0.83], [-0.95, 0.94],
      [-0.20, 1.38], [0.72, 1.44], [1.30, 1.40], [1.62, 1.10], [1.78, 0.78],
      [1.82, 0.58], [1.80, 0.40],
    ],
    glass: [[-0.88, 0.98], [-0.22, 1.34], [1.20, 1.40], [1.58, 1.14], [1.58, 0.98]],
    tumble: 0.12, taper: 0.17,
  },
  suv: {     // SUV compact, ~4,40 m, garda la sol mai mare
    L: 4.40, W: 1.86, wb: 2.64, wr: 0.375, tw: 0.245, sill: 0.42, archR: 0.50,
    prof: [
      [-2.20, 0.52], [-2.21, 0.80], [-2.12, 0.98], [-1.92, 1.04], [-1.02, 1.14],
      [-0.42, 1.52], [0.62, 1.64], [1.52, 1.64], [1.88, 1.56], [2.04, 1.16],
      [2.12, 0.82], [2.10, 0.52],
    ],
    glass: [[-0.96, 1.18], [-0.44, 1.48], [1.48, 1.58], [1.82, 1.44], [1.82, 1.18]],
    tumble: 0.11, taper: 0.15,
  },
};

export const CAR_COLORS = [
  { name: 'negru',        c: 0x14161a, m: 0.05, r: 0.34 },
  { name: 'gri grafit',   c: 0x3a3f47, m: 0.35, r: 0.32 },
  { name: 'argintiu',     c: 0xa3a8ae, m: 0.4, r: 0.3 },
  { name: 'alb',          c: 0xbdbab4, m: 0.04, r: 0.34 },
  { name: 'albastru',     c: 0x1e3352, m: 0.28, r: 0.30 },
  { name: 'rosu inchis',  c: 0x64181d, m: 0.12, r: 0.32 },
  { name: 'bej',          c: 0xa89b8c, m: 0.22, r: 0.36 },
  { name: 'verde inchis', c: 0x22423a, m: 0.20, r: 0.32 },
];

const BODY_BEVEL = 0.065;                              // cu cat iese tabla peste profilul lateral

function bodyGeometry(t) {
  const { L, W, prof, sill, archR, wb, tumble, taper } = t;
  const shape = new THREE.Shape();
  shape.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) shape.lineTo(prof[i][0], prof[i][1]);
  // marginea inferioara, de la spate spre fata, cu pasajele decupate
  const zr = wb / 2, zf = -wb / 2;
  shape.lineTo(zr + archR, sill);
  shape.absarc(zr, sill, archR, 0, Math.PI, false);
  shape.lineTo(zf + archR, sill);
  shape.absarc(zf, sill, archR, 0, Math.PI, false);
  shape.lineTo(prof[0][0], prof[0][1]);

  // ATENTIE: cu bevel, geometria se intinde de la -bevelThickness la
  // depth + bevelThickness, deci latimea totala e depth + 2*BT. Extrudam mai
  // subtire, ca latimea finala sa fie exact W (altfel geamurile raman in tabla).
  const BT = 0.05;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: W - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BODY_BEVEL,
    bevelSegments: 3, curveSegments: 14,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(W / 2 - BT, 0, 0);

  // deformari: streasina acoperisului (tumblehome) + rotunjirea botului/spatelui
  const pos = g.attributes.position;
  const roofY = Math.max(...prof.map((p) => p[1]));
  const beltY = sill + 0.55;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = smoothstep(beltY, roofY, y) * tumble;
    const tz = smoothstep(0.55, 1.0, Math.abs(z) / (L / 2)) * taper;
    const s = (1 - th) * (1 - tz);
    pos.setX(i, x * s);
    if (y > roofY - 0.25) pos.setY(i, y - Math.pow(Math.abs(x) / (W / 2), 2) * 0.035);
  }
  pos.needsUpdate = true;
  // tabla e o suprafata lina: netezim normalele, dar pastram muchiile reale
  smoothNormals(g, 52);
  return g;
}

function glassGeometry(t) {
  const { W, glass, prof, sill, tumble } = t;
  const out = [];
  const roofY = Math.max(...prof.map((p) => p[1]));
  const beltY = sill + 0.55;
  // Geamul lateral trebuie sa urmeze inclinarea tablei (tumblehome), altfel
  // ramane ingropat in caroserie si nu se vede deloc.
  const surfaceX = (y) => (W / 2) * (1 - smoothstep(beltY, roofY, y) * tumble) + 0.013;

  for (const sgn of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(glass[0][0], glass[0][1]);
    for (let i = 1; i < glass.length; i++) shape.lineTo(glass[i][0], glass[i][1]);
    const g = new THREE.ShapeGeometry(shape, 10);
    // ShapeGeometry e in planul XY: x = coordonata pe lungime, y = inaltime
    const pos = g.attributes.position;
    const n = pos.count;
    const np = new Float32Array(n * 3);
    const nn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const lz = pos.getX(i), ly = pos.getY(i);
      np[i * 3] = sgn * surfaceX(ly);
      np[i * 3 + 1] = ly;
      np[i * 3 + 2] = lz;
      nn[i * 3] = sgn; nn[i * 3 + 1] = 0; nn[i * 3 + 2] = 0;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(np, 3));
    gg.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    gg.setAttribute('uv', g.attributes.uv);
    const idx = g.index ? Array.from(g.index.array) : null;
    if (idx) {
      if (sgn < 0) for (let i = 0; i < idx.length; i += 3) { const t0 = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t0; }
      gg.setIndex(idx);
    }
    g.dispose();
    out.push(gg);
  }

  // parbriz + luneta. Linia geamului din profil e cu ~5 cm in interiorul tablei:
  // planele se scot in afara pe normala, altfel din fata/spate masina n-are sticla.
  // distanta pe normala pana la tabla (profilul lateral, ca poligon inchis)
  const toBody = (pz, py, nz, ny) => {
    let best = 0;
    for (let i = 0; i < prof.length; i++) {
      const [az, ay] = prof[i], [bz, by] = prof[(i + 1) % prof.length];
      const ez = bz - az, ey = by - ay, den = nz * ey - ny * ez;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((az - pz) * ey - (ay - py) * ez) / den;
      const u = ((az - pz) * ny - (ay - py) * nz) / den;
      if (t > 0 && u >= 0 && u <= 1 && (best === 0 || t < best)) best = t;
    }
    return best;
  };
  const pane = (A, B, w) => {
    const dz = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dz, dy);
    const nz = -dy / len, ny = dz / len;                // normala spre exterior (in planul z-y)
    let off = 0;
    for (const k of [0.1, 0.5, 0.9]) off = Math.max(off, toBody(A[0] + dz * k, A[1] + dy * k, nz, ny));
    off += BODY_BEVEL + 0.012;                          // tabla e extrudata cu bevel peste profil
    const g = new THREE.PlaneGeometry(w, len * 1.02);
    // axa y a planului pe directia segmentului, fata (+z local) spre exterior
    g.rotateX(Math.atan2(dz, dy) + Math.PI);
    g.translate(0, (A[1] + B[1]) / 2 + ny * off, (A[0] + B[0]) / 2 + nz * off);
    return g;
  };
  out.push(pane(glass[0], glass[1], W * 0.74));
  out.push(pane(glass[glass.length - 3], glass[glass.length - 2], W * 0.70));
  return mergeGeos(out);
}

function wheelGeometry(r, w) {
  const parts = [];
  const tire = new THREE.CylinderGeometry(r, r, w, 22, 1, false);
  tire.rotateZ(Math.PI / 2);
  parts.push(tire);
  return { tire: mergeGeos(parts), rim: rimGeometry(r, w) };
}

function rimGeometry(r, w) {
  const parts = [];
  const rr = r * 0.66;
  const disc = new THREE.CylinderGeometry(rr, rr, w * 0.42, 18, 1, false);
  disc.rotateZ(Math.PI / 2);
  disc.translate(w * 0.20, 0, 0);
  parts.push(disc);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sp = new THREE.BoxGeometry(w * 0.16, rr * 0.92, rr * 0.30);
    sp.translate(0, rr * 0.42, 0);
    sp.rotateX(a);
    sp.translate(w * 0.30, 0, 0);
    parts.push(sp);
  }
  const hub = new THREE.CylinderGeometry(rr * 0.24, rr * 0.24, w * 0.22, 10);
  hub.rotateZ(Math.PI / 2);
  hub.translate(w * 0.36, 0, 0);
  parts.push(hub);
  return mergeGeos(parts);
}

/** Placuta de inmatriculare romaneasca. */
export function plateTexture(text = 'B 42 CLD') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 58;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e9e4';
  ctx.fillRect(0, 0, 256, 58);
  ctx.fillStyle = '#12327a';
  ctx.fillRect(0, 0, 26, 58);
  ctx.fillStyle = '#f2c500';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(13 + Math.cos(a) * 7, 20 + Math.sin(a) * 7, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RO', 13, 50);
  ctx.fillStyle = '#16181c';
  ctx.font = 'bold 38px "Arial Narrow", Arial, sans-serif';
  ctx.fillText(text, 142, 44);
  ctx.strokeStyle = '#2a2c30';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 253, 55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const sharedGeoCache = new Map();
const MAT = {};
const PAINT = new Map();
let PLATE = null;

function sharedMats(env) {
  if (MAT.glass) return MAT;
  MAT.glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a0d13, metalness: 0.0, roughness: 0.16, opacity: 0.92, transparent: true,
    envMap: env, envMapIntensity: 0.5, reflectivity: 0.6,
  });
  MAT.black = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.15, roughness: 0.82 });
  MAT.rubber = new THREE.MeshStandardMaterial({ color: 0x171819, metalness: 0.0, roughness: 0.95 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xb2b6bb, metalness: 0.88, roughness: 0.30, envMap: env, envMapIntensity: 1.3 });
  MAT.chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.24, envMap: env, envMapIntensity: 1.0 });
  // farurile sunt stinse: masinile sunt parcate, deci doar sticla reflecta
  MAT.head = new THREE.MeshStandardMaterial({ color: 0x9fa8b6, metalness: 0.15, roughness: 0.3, envMap: env, envMapIntensity: 0.9 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0x5e1216, metalness: 0.1, roughness: 0.32, envMap: env, envMapIntensity: 0.8 });
  return MAT;
}

function paintFor(color, env) {
  let m = PAINT.get(color.name);
  if (!m) {
    // vopsea: pigment difuz + lac lucios deasupra (asa arata tabla reala)
    m = new THREE.MeshPhysicalMaterial({
      color: color.c, metalness: color.m, roughness: color.r,
      clearcoat: 1.0, clearcoatRoughness: 0.2, envMap: env, envMapIntensity: 0.55,
    });
    PAINT.set(color.name, m);
  }
  return m;
}

/** Un singur atlas cu toate placutele, ca masinile sa poata fi contopite. */
export function preparePlates(texts) {
  const list = [...new Set(texts)];
  const cols = 4, cw = 256, ch = 58;
  const c = document.createElement('canvas');
  c.width = cols * cw; c.height = Math.ceil(list.length / cols) * ch;
  const ctx = c.getContext('2d');
  const uv = {};
  list.forEach((t, k) => {
    const src = plateTexture(t).image;
    const x = (k % cols) * cw, y = Math.floor(k / cols) * ch;
    ctx.drawImage(src, x, y);
    uv[t] = [x / c.width, 1 - (y + ch) / c.height, (x + cw) / c.width, 1 - y / c.height];
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  PLATE = { uv, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.0 }) };
  return PLATE;
}

export function buildCar(opts = {}) {
  const {
    type = 'sedan', color = CAR_COLORS[0], plate = 'B 42 CLD', seed = 1, env = null,
  } = opts;
  const t = CAR_TYPES[type];
  const rnd = makeRng(seed);

  let cache = sharedGeoCache.get(type);
  if (!cache) {
    cache = {
      body: bodyGeometry(t),
      glass: glassGeometry(t),
      wheel: wheelGeometry(t.wr, t.tw),
    };
    sharedGeoCache.set(type, cache);
  }

  const group = new THREE.Group();

  // vopsea: pigment difuz + lac lucios deasupra (asa arata tabla reala)
  const M = sharedMats(env);
  const paint = paintFor(color, env);
  const glassMat = M.glass, black = M.black, rubber = M.rubber, rimMat = M.rim;
  const chrome = M.chrome, headMat = M.head, tailMat = M.tail;

  const bodyMesh = new THREE.Mesh(cache.body, paint);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  const glassMesh = new THREE.Mesh(cache.glass, glassMat);
  glassMesh.castShadow = false;
  group.add(glassMesh);

  const L = t.L, W = t.W;
  const detail = [];
  const detailBlack = [];

  // bara fata/spate + grila
  detailBlack.push(box(W * 0.94, 0.20, 0.10, 0, t.sill + 0.12, -L / 2 + 0.10));
  detailBlack.push(box(W * 0.94, 0.20, 0.10, 0, t.sill + 0.12, L / 2 - 0.10));
  const grilleY = t.prof[2][1] - 0.06;
  detailBlack.push(box(W * 0.50, 0.17, 0.08, 0, grilleY, -L / 2 + 0.09));
  // podeaua caroseriei: inchide golul dintre prag si sol
  detailBlack.push(box(W * 0.88, 0.18, L * 0.80, 0, t.sill - 0.07, 0.04));
  // praguri + benzi laterale
  for (const s of [-1, 1]) {
    detailBlack.push(box(0.07, 0.11, L * 0.56, s * (W / 2 - 0.03), t.sill + 0.02, 0.05));
    detailBlack.push(box(0.035, 0.075, L * 0.42, s * (W / 2 + 0.005), t.sill + 0.46, 0.06));
  }
  // linii de portiera
  for (const s of [-1, 1]) {
    for (const zz of [-0.55, 0.42, 1.24]) {
      detailBlack.push(box(0.016, 0.62, 0.012, s * (W / 2 + 0.002), t.sill + 0.55, zz));
    }
  }
  // oglinzi
  for (const s of [-1, 1]) {
    const arm = box(0.10, 0.05, 0.07, s * (W / 2 + 0.06), t.glass[0][1] + 0.06, t.glass[0][0] + 0.10);
    const cap = box(0.19, 0.11, 0.09, s * (W / 2 + 0.15), t.glass[0][1] + 0.09, t.glass[0][0] + 0.08);
    detailBlack.push(arm, cap);
  }
  // manere + esapament
  for (const s of [-1, 1]) {
    detail.push(box(0.12, 0.035, 0.035, s * (W / 2 + 0.015), t.sill + 0.60, -0.28));
    detail.push(box(0.12, 0.035, 0.035, s * (W / 2 + 0.015), t.sill + 0.60, 0.72));
  }
  detailBlack.push(cyl(0.035, 0.035, 0.14, 8, -W * 0.28, t.sill - 0.04, L / 2 - 0.02, Math.PI / 2));

  // antena aripa
  detail.push(box(0.05, 0.05, 0.14, 0, t.prof[6] ? t.prof[6][1] + 0.03 : 1.45, L * 0.30));

  group.add(new THREE.Mesh(mergeGeos(detailBlack), black));
  const chromeMesh = new THREE.Mesh(mergeGeos(detail), chrome);
  chromeMesh.castShadow = true;
  group.add(chromeMesh);

  // faruri
  const headGeos = [];
  const zF = -L / 2 + 0.06;
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.44, 0.17);
    g.rotateY(Math.PI + s * 0.16);
    g.translate(s * (W * 0.33), t.prof[2][1] + 0.02, zF + Math.abs(s) * 0.01);
    headGeos.push(g);
  }
  const headMesh = new THREE.Mesh(mergeGeos(headGeos), headMat);
  group.add(headMesh);

  // stopuri
  const tailGeos = [];
  const zR = L / 2 - 0.04;
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.38, 0.18);
    g.rotateY(-s * 0.18);
    g.translate(s * (W * 0.33), t.prof[9][1] - 0.02, zR);
    tailGeos.push(g);
  }
  const tailMesh = new THREE.Mesh(mergeGeos(tailGeos), tailMat);
  group.add(tailMesh);

  // placute (din atlasul comun, daca exista)
  const cell = PLATE && PLATE.uv[plate];
  const plateMat = cell ? PLATE.mat : new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.6 });
  for (const [zz, ry] of [[-L / 2 + 0.035, Math.PI], [L / 2 - 0.025, 0]]) {
    const g = new THREE.PlaneGeometry(0.52, 0.118);
    if (cell) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, cell[0] + uv.getX(i) * (cell[2] - cell[0]), cell[1] + uv.getY(i) * (cell[3] - cell[1]));
    }
    g.rotateY(ry);
    g.translate(0, t.sill + 0.12, zz);
    group.add(new THREE.Mesh(g, plateMat));
  }

  // roti
  const wheels = [];
  const zr = t.wb / 2;
  for (const [sx, sz, front] of [[-1, -1, true], [1, -1, true], [-1, 1, false], [1, 1, false]]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(cache.wheel.tire, rubber);
    tire.castShadow = true;
    const rim = new THREE.Mesh(cache.wheel.rim, rimMat);
    if (sx < 0) { rim.scale.x = -1; }
    w.add(tire, rim);
    w.position.set(sx * (W / 2 - t.tw / 2 - 0.02), t.wr, sz * zr);
    const pivot = new THREE.Group();
    pivot.position.copy(w.position);
    w.position.set(0, 0, 0);
    pivot.add(w);
    group.add(pivot);
    wheels.push({ pivot, spin: w, front, side: sx });
  }

  group.userData = { type, spec: t, paint, wheels, plate };
  return group;
}

/** Aseaza corect masina pe teren: inaltime + ruliu/tangaj dupa panta reala. */
export function placeOnGround(obj, surfaceY, x, z, yaw) {
  const spec = obj.userData.spec;
  const hw = spec.W / 2 - 0.1, hl = spec.wb / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const pt = (lx, lz) => {
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    return surfaceY(wx, wz);
  };
  const fl = pt(-hw, -hl), fr = pt(hw, -hl), rl = pt(-hw, hl), rr = pt(hw, hl);
  const y = (fl + fr + rl + rr) / 4;
  const roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, hw * 2);
  const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, hl * 2);
  obj.position.set(x, y, z);
  obj.rotation.set(0, 0, 0);
  obj.rotateY(yaw);
  obj.rotateX(pitch);
  obj.rotateZ(roll);
  return { y, roll, pitch };
}

/**
 * Masinile parcate sunt decor static: le contopim pe material, ca toate
 * masinile sa coste ~15 draw-call-uri in loc de ~8 per masina.
 */
export function bakeCars(scene, groups, tile = 0) {
  const byMat = new Map();
  for (const g of groups) {
    const tk = tile > 0 ? Math.floor(g.position.x / tile) + ',' + Math.floor(g.position.z / tile) : '0';
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // scara negativa (jantele oglindite) inverseaza triunghiurile: le reintoarcem,
      // altfel ar fi eliminate de back-face culling dupa coacere
      if (o.matrixWorld.determinant() < 0) {
        if (!geo.index) {
          const n = geo.attributes.position.count, idx = new Uint32Array(n);
          for (let i = 0; i < n; i++) idx[i] = i;
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        const a = geo.index.array;
        for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
        geo.index.needsUpdate = true;
      }
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      const key = o.material.uuid + '|' + tk;
      let arr = byMat.get(key);
      if (!arr) { arr = { mat: o.material, geos: [] }; byMat.set(key, arr); }
      arr.geos.push(geo);
    });
  }
  const meshes = [];
  for (const { mat, geos } of byMat.values()) {
    const m = new THREE.Mesh(mergeGeos(geos), mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    m.name = 'cars';
    if (mat.transparent) m.renderOrder = 2;
    scene.add(m);
    meshes.push(m);
  }
  return meshes;
}
