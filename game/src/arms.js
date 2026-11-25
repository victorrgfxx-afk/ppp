import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightToNormalCanvas } from './textures.js';

// The guns on the wall of the shepherds' shed (V117, geo/magazie.js): an AK-47 (the AKM, the one there is most of), an
// M4 carbine (the "M4A4" of the games), the Romanian PSL marksman rifle (made at Cugir) with its LPS-4 scope and a
// Remington 870 pump gun. Their lengths are the real ones (Wikipedia: the AKM 880 mm, its barrel 415 mm; the M4 838 mm
// with its stock out, its barrel 368 mm; the PSL 1150 mm, its barrel 620 mm; the 870 with an 18.5 in barrel), and their
// side views were traced from photographs on Wikimedia Commons, each scaled to millimetres - by the gun's length, the
// M4's by the 10 mm pitch of its Picatinny rail's slots (MIL-STD-1913) - and read off a 10 mm grid: the AKM of the
// Swedish Army Museum (Armémuseum, CC BY-SA 4.0), PEO Soldier's M4 (CC BY-SA 4.0), a PSL ("Psl sniper rifle.jpeg",
// CC BY-SA 3.0), an 870 Wingmaster ("Remington 870 Wmaster.jpg"). Each part is a side profile extruded to its width with
// its edges rounded (the stocks narrowing toward the wrist), the round ones turned, as the Glock's (glock.js). No
// maker's mark on any. The finishes: the AK's stamped receiver and its barrel a worn black (bare steel showing where
// the hands go), its furniture laminated birch under a reddish lacquer, its grip bakelite; the M4's receivers
// hard-anodised aluminium, its stock and grip polymer; the PSL's furniture a lighter laminate, its scope black; the
// 870 blued, its stock and forend walnut.
//
// A model's frame: x to its right, y up, the muzzle toward -z, the bore's axis at y = 0, its middle at z = 0. Profiles
// are given in mm from the butt (s) and up from the bore (y).

const MM = 0.001;
let TEX = null, MATS = null;

// ---- textures (canvas, generated once)
function rnd(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a) => ((a % p) + p) % p;
  const a = rnd(m(xi), m(yi)), b = rnd(m(xi + 1), m(yi)), c = rnd(m(xi), m(yi + 1)), d = rnd(m(xi + 1), m(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function canvasTex(W, H, fn, normal = 0) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), HT = normal ? new Float32Array(W * H) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = fn(x, y), i = (y * W + x) * 4;
    img.data[i] = o[0]; img.data[i + 1] = o[1]; img.data[i + 2] = o[2]; img.data[i + 3] = 255;
    if (HT) HT[y * W + x] = o[3];
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const out = { map };
  if (HT) out.nrm = new THREE.CanvasTexture(heightToNormalCanvas(HT, W, H, normal));
  for (const t of Object.values(out)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return out;
}
function textures() {
  if (TEX) return TEX;
  // the guns' steel: a parkerised / black-oxide black, mottled, fine scratches along the length (u), the wear lighter
  // (the base colour: roughness and metal from the material; this tints and roughens it). One tile 0.1 m
  const metal = canvasTex(256, 256, (x, y) => {
    const n = 0.55 * vnoise(x / 18, y / 18, 256 / 18 | 0) + 0.45 * vnoise(x / 5, y / 5, 256 / 5 | 0);
    const scr = Math.max(0, rnd(Math.floor(y / 2), 7) - 0.985) * 40 * (0.5 + 0.5 * Math.sin(x * 0.05 + y));
    const k = 0.82 + 0.22 * n + Math.min(0.5, scr);
    return [Math.min(255, 58 * k), Math.min(255, 60 * k), Math.min(255, 63 * k), n * 0.5 + scr * 0.3];
  }, 1.2);
  // laminated wood (the AKM's and the PSL's furniture): veneers 1.5 mm thick along its length, each its own tone, the
  // glue lines thin and dark, the figure wavy where the cut crosses the plies; a light orange here, the material's
  // colour darkens it for the AKM. 5 px a millimetre both ways
  // (every term repeats in 512 px both ways, so the tile has no seam)
  const lam = canvasTex(512, 512, (x, y) => {
    // (the figure: where the shaped surface cuts across the plies at a shallow angle they show as broad wavy bands -
    // the plies' height here bent by a large, slow noise, so its contours wander over the part)
    const wav = y + 3 * Math.sin(x * Math.PI * 2 / 512 + vnoise(x / 64, y / 64, 8) * 4) + 150 * vnoise(x / 128, y / 128, 4) + 14 * vnoise(x / 64, y / 32, 8);
    const ply = wav / (512 / 68), pi = Math.floor(ply), f = ply - pi, glue = f < 0.1 ? 1 - f / 0.1 : 0;
    const tone = rnd(((pi % 68) + 68) % 68, 3) - 0.5;
    const grain = vnoise(x / 32, wav / 2, 16) * 0.55 + vnoise(x / 8, wav / 0.8, 64) * 0.3;
    const k = 0.76 + 0.24 * tone + 0.22 * grain - 0.34 * glue;
    return [Math.min(255, 255 * k), Math.min(255, 150 * k), Math.min(255, 82 * k), grain * 0.5 + tone * 0.3 - glue * 0.5];
  }, 0.6);
  // walnut (the 870's): dark streaks running with the grain, unevenly spaced, the figure wavy, the pores open
  const walnut = canvasTex(512, 512, (x, y) => {
    const w = y + 10 * vnoise(x / 128, y / 64, 4) + 3 * Math.sin(x * Math.PI * 2 / 512 * 3 + vnoise(x / 64, y / 32, 8) * 3);
    const streak = vnoise(x / 64, w / 4, 8) * 0.6 + vnoise(x / 32, w / 2, 16) * 0.4, dark = Math.max(0, streak - 0.55) * 2.2;
    const pore = vnoise(x / 2, y / 2, 256) > 0.82 ? 1 : 0;
    const k = 0.86 + 0.12 * vnoise(x / 256, y / 128, 2) - 0.42 * dark - 0.12 * pore;
    return [Math.min(255, 128 * k), Math.min(255, 76 * k), Math.min(255, 42 * k), -dark * 0.6 - pore * 0.5];
  }, 0.8);
  // polymer: a fine stipple
  const poly = canvasTex(128, 128, (x, y) => {
    const s = vnoise(x / 1.6, y / 1.6, 80) * 0.7 + vnoise(x / 6, y / 6, 21) * 0.3;
    const k = 0.9 + 0.12 * s;
    return [Math.min(255, 26 * k), Math.min(255, 27 * k), Math.min(255, 28 * k), s];
  }, 1.6);
  // the grips' chequering (the M4's, the AKM's bakelite): a diamond pattern
  // (a diamond each 8 px; the tile repeated 8 times a 0.1 m: 1.6 mm each, as a grip's 16 lines an inch)
  const cheq = canvasTex(64, 64, (x, y) => {
    const a = Math.abs(((x + y) % 8) - 4), b = Math.abs(((x - y + 64) % 8) - 4), h = Math.min(a, b) / 4;
    return [30, 31, 32, h];
  }, 2.5);
  for (const t of Object.values(cheq)) t.repeat.set(8, 8);
  TEX = { metal, lam, walnut, poly, cheq };
  return TEX;
}

export function armsMaterials() {
  if (MATS) return MATS;
  const T = textures();
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.noWet = true; return m; };
  const phy = (o) => { const m = new THREE.MeshPhysicalMaterial(o); m.userData.noWet = true; return m; };
  MATS = {
    steel: std({ map: T.metal.map, normalMap: T.metal.nrm, normalScale: new THREE.Vector2(0.35, 0.35), color: 0x9da2a8, metalness: 0.82, roughness: 0.44 }),
    bare: std({ map: T.metal.map, normalMap: T.metal.nrm, color: 0xe1e4e8, metalness: 0.95, roughness: 0.3 }),      // (worn to the metal)
    blued: std({ map: T.metal.map, normalMap: T.metal.nrm, normalScale: new THREE.Vector2(0.2, 0.2), color: 0x6c7891, metalness: 0.9, roughness: 0.28 }),
    alu: std({ map: T.metal.map, normalMap: T.metal.nrm, normalScale: new THREE.Vector2(0.25, 0.25), color: 0x4a4c50, metalness: 0.5, roughness: 0.52 }),   // (hard-anodised: near black)
    polymer: std({ map: T.poly.map, normalMap: T.poly.nrm, normalScale: new THREE.Vector2(0.5, 0.5), color: 0xffffff, roughness: 0.78 }),
    grip: std({ map: T.cheq.map, normalMap: T.cheq.nrm, color: 0xffffff, roughness: 0.82 }),
    bakel: phy({ normalMap: T.cheq.nrm, normalScale: new THREE.Vector2(0.8, 0.8), color: 0x5a200c, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    lam: phy({ map: T.lam.map, normalMap: T.lam.nrm, normalScale: new THREE.Vector2(0.3, 0.3), color: 0x96707a, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35 }),
    lam2: phy({ map: T.lam.map, normalMap: T.lam.nrm, normalScale: new THREE.Vector2(0.3, 0.3), color: 0xd6aa86, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    walnut: phy({ map: T.walnut.map, normalMap: T.walnut.nrm, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    rubber: std({ color: 0x101011, roughness: 0.92 }),
    glass: phy({ color: 0x08130f, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
    dot: std({ color: 0x300000, emissive: 0xff2a10, emissiveIntensity: 2.2, roughness: 0.4 }),
    brass: std({ color: 0xc19a55, metalness: 1, roughness: 0.32 }),
    chrome: std({ color: 0xd8dade, metalness: 1, roughness: 0.16 }),
    shell: std({ color: 0x8f1d1d, roughness: 0.55 }),
    card: std({ color: 0x8a1e19, roughness: 0.85 }),
    paper: std({ color: 0xe6dfcf, roughness: 0.9 }),
    olive: std({ normalMap: T.metal.nrm, normalScale: new THREE.Vector2(0.3, 0.3), color: 0x4f5734, metalness: 0.15, roughness: 0.66 }),   // (olive drab paint)
    canvas: std({ map: T.poly.map, color: 0xb9ad8a, roughness: 0.95 }),
    leather: std({ map: T.poly.map, color: 0x8a5a36, roughness: 0.7 }),
  };
  return MATS;
}

// ---- shapes (mm in, metres out; s from the butt, y up from the bore; L the gun's length)
const v2 = (x, y) => new THREE.Vector2(x, y);
function makeKit(L) {
  const Z = (s) => (L / 2 - s) * MM;
  // a side profile [[s, y]] extruded w across (x0 its middle), its edges rounded r; holes optional
  const ext = (pts, w, r = 1.5, x0 = 0, holes = [], curve = 4) => {
    const sh = new THREE.Shape(pts.map(([s, y]) => v2(s * MM, y * MM)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([s, y]) => v2(s * MM, y * MM))));
    const rr = Math.min(r, w / 2 - 0.2) * MM;
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0002, w * MM - 2 * rr), bevelEnabled: rr > 0, bevelThickness: rr, bevelSize: rr, bevelOffset: -rr, bevelSegments: 2, curveSegments: curve });
    g.translate(0, 0, -(w * MM - 2 * rr) / 2);
    g.rotateY(Math.PI / 2);                     // (s -> -z, the extrusion across x)
    g.translate(x0 * MM, 0, L / 2 * MM);
    uvMetres(g);
    return g;
  };
  // a round part turned along the bore: [[r, s]] (mm), at (x, y); phi0 .. phi0 + phiL of the way round (0 its top,
  // pi / 2 its right side), for a band only on one side
  // (uvR: its UVs in metres too - along it, and round it at that radius - for a wooden part's grain to run its length)
  const turn = (prof, seg = 24, x = 0, y = 0, phi0 = 0, phiL = Math.PI * 2, uvR = 0) => {
    const g = new THREE.LatheGeometry(prof.map(([r, s]) => v2(r * MM, -Z(s))), seg, phi0, phiL);
    g.rotateX(-Math.PI / 2);                   // (lathe's y -> -z ... its points' y is -Z(s): back to Z(s))
    if (uvR) {
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, -p.getZ(i) * 10, Math.atan2(p.getX(i), p.getY(i)) * uvR * MM * 10);
    }
    g.translate(x * MM, y * MM, 0);
    return g;
  };
  const tube = (r, s0, s1, y = 0, x = 0, seg = 20) => turn([[0, s0], [r, s0], [r, s1], [0, s1]], seg, x, y);
  const box = (w, h, s0, s1, x, y) => { const g = new THREE.BoxGeometry(w * MM, h * MM, (s1 - s0) * MM); g.translate(x * MM, y * MM, (Z(s0) + Z(s1)) / 2); return g; };
  // an upright round part (a grip, a shell): r, from y0 down to y1, at s (and x)
  const post = (r, y0, y1, s, x = 0, seg = 16) => { const g = new THREE.CylinderGeometry(r * MM, r * MM, (y0 - y1) * MM, seg); g.translate(x * MM, (y0 + y1) / 2 * MM, Z(s)); return g; };
  // a pin, a rivet, a button across the gun (its axis along x): r, its length, at s, y, its middle at x
  const pin = (r, len, s, y, x, seg = 10) => { const g = new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg); g.rotateZ(Math.PI / 2); g.translate(x * MM, y * MM, Z(s)); return g; };
  // a part narrowed along its length: its x scaled by k about x0, k piecewise linear in s ([[s, k], ...]); its normals
  // turned to match
  const taper = (g, pts, x0 = 0) => {
    const p = g.attributes.position, n = g.attributes.normal;
    const kAt = (s) => {
      if (s <= pts[0][0]) return pts[0][1];
      for (let j = 1; j < pts.length; j++) if (s <= pts[j][0]) return pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * (s - pts[j - 1][0]) / (pts[j][0] - pts[j - 1][0]);
      return pts[pts.length - 1][1];
    };
    for (let i = 0; i < p.count; i++) {
      const k = kAt(L / 2 - p.getZ(i) / MM);
      p.setX(i, x0 * MM + (p.getX(i) - x0 * MM) * k);
      if (n) { const nx = n.getX(i) / k, ny = n.getY(i), nz = n.getZ(i), l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l); }
    }
    return g;
  };
  return { Z, ext, turn, tube, box, post, pin, taper };
}
// (UVs in metres along the part: the tiles above are 0.1 m)
function uvMetres(g, k = 10) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    // (the long side faces: along z and y; the edges: along z and x)
    uv.setXY(i, -p.getZ(i) * k, (nx > ny ? p.getY(i) : p.getX(i) + p.getY(i) * 0.3) * k);
  }
}
// a magazine's side: its back edge bk(t) and its front edge fr(t), [s, y] each, t 0 at its mouth .. 1 at its floor; or
// the strip of it from f0 to f1 across (0 its back, 1 its front) and t0 to t1 down it (a rib)
function magSide(bk, fr, f0 = 0, f1 = 1, t0 = 0, t1 = 1, n = 12) {
  const a = [], b = [];
  for (let k = 0; k <= n; k++) {
    const t = t0 + (t1 - t0) * k / n, p = bk(t), q = fr(t);
    a.push([p[0] + (q[0] - p[0]) * f0, p[1] + (q[1] - p[1]) * f0]);
    b.push([p[0] + (q[0] - p[0]) * f1, p[1] + (q[1] - p[1]) * f1]);
  }
  return [...a, ...b.reverse()];
}
// (an arc's edge: round (cs, cy), radius r, the angle from a0 to a1 degrees as t goes 0 .. 1)
const arc = (cs, cy, r, a0, a1) => (t) => { const a = (a0 + (a1 - a0) * t) * Math.PI / 180; return [cs + r * Math.cos(a), cy + r * Math.sin(a)]; };
// a straight rib w wide from (s0, y0) to (s1, y1)
function rib(s0, y0, s1, y1, w) {
  const l = Math.hypot(s1 - s0, y1 - y0), nx = -(y1 - y0) / l * w / 2, ny = (s1 - s0) / l * w / 2;
  return [[s0 + nx, y0 + ny], [s1 + nx, y1 + ny], [s1 - nx, y1 - ny], [s0 - nx, y0 - ny]];
}
// a slot's outline, its ends round: from s0 to s1 along, h high, its middle at y
function stadium(s0, s1, y, h, n = 6) {
  const r = h / 2, pts = [];
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + Math.PI * k / n; pts.push([s1 - r + r * Math.cos(a), y + r * Math.sin(a)]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + Math.PI * k / n; pts.push([s0 + r + r * Math.cos(a), y + r * Math.sin(a)]); }
  return pts;
}

// ---------------------------------------------------------------- the AK-47 (AKM)
export function akmGeometry() {
  const L = 880, K = makeKit(L), P = {};
  const add = (m, g) => (P[m] ??= []).push(g);
  // the butt stock (s 4 .. 238): its comb nearly at the bore's height, its toe 95 mm under it; 41 mm across at the butt,
  // narrowing to the receiver's 30; the steel butt plate
  add('lam', K.taper(K.ext([[4, -1], [100, -2], [160, -3], [186, -1], [212, 3], [238, 9], [238, -37], [4, -95]], 41, 6), [[0, 1], [150, 0.92], [238, 0.74]]));
  add('steel', K.ext([[0, 0.5], [5, 0.5], [5, -96.5], [0, -96.5]], 42, 1.6));
  // the receiver (stamped, s 236 .. 492): its sides up to y 18, the dust cover over them to 35 (its rear end rounded
  // down, the AKM's ribs across it); the rear sight's block on the front trunnion, its leaf and slider
  add('steel', K.ext([[236, 8], [246, 18], [492, 18], [492, -28], [236, -28]], 30, 1.2));
  add('steel', K.ext([[247, 18], [251, 28], [261, 35], [463, 35], [463, 18]], 28, 4));
  for (let s = 284; s < 450; s += 22) add('steel', K.ext([[s - 3, 30], [s + 3, 30], [s + 3, 35.8], [s - 3, 35.8]], 20, 2.5));
  add('steel', K.ext([[462, 18], [535, 18], [535, 30], [520, 42], [470, 42], [462, 34]], 22, 2.5));
  add('steel', K.ext([[466, 42], [522, 42], [522, 45], [470, 48], [466, 48]], 16, 0.8));
  add('steel', K.ext([[488, 41], [500, 41], [500, 49], [488, 49]], 18, 1));
  // the grip (bakelite, chequered, raked back), the trigger guard, the trigger, the magazine's release paddle
  add('bakel', K.ext([[252, -26], [306, -26], [302, -44], [281, -124], [271, -133], [246, -133], [238, -123], [248, -44]], 28, 7));
  add('steel', K.ext([[304, -27], [372, -27], [372, -36], [368, -66], [312, -68], [306, -60]], 10, 1, 0, [[[311, -30], [365, -30], [362, -62], [314, -63]]]));
  add('steel', K.ext([[322, -27], [329, -27], [334, -40], [332, -52], [327, -58], [323, -55], [327, -46], [325, -36]], 6, 0.6));
  add('steel', K.ext([[360, -27], [369, -27], [377, -62], [371, -67], [364, -64]], 12, 1));
  // the right side: the selector lever (its hub at the back, its finger tab at the front, worn bare), the charging
  // handle on the bolt carrier
  add('steel', K.pin(6.5, 3, 295, 2, 16.4, 14));
  add('steel', K.ext([[292, -2], [300, -3], [398, 14], [401, 20], [396, 22], [291, 6]], 2.6, 0.6, 16.6));
  add('bare', K.ext([[384, 12], [400, 15], [402, 22], [386, 20]], 3, 0.5, 16.8));
  add('steel', K.ext([[452, 16], [478, 16], [478, 28], [452, 28]], 3, 1, 15.6));
  add('steel', K.pin(5, 13, 466, 22, 22, 12));
  // the handguards: the steel retainer, the lower one with its swell, the upper one over the gas tube
  add('steel', K.ext([[487, 21], [497, 21], [497, -29], [487, -29]], 42, 2));
  add('lam', K.ext([[495, 20], [636, 20], [641, 15], [641, -13], [633, -18], [560, -18], [522, -24], [497, -28], [495, -26]], 40, 7));
  add('lam', K.ext([[538, 21], [640, 21], [640, 37], [634, 44], [546, 44], [538, 37]], 30, 6));
  // the gas tube and its block, the barrel (thinning to the muzzle), the cleaning rod under it
  add('steel', K.tube(9, 535, 741, 31, 0, 16));
  add('steel', K.ext([[734, 41], [757, 41], [757, -9], [751, -11], [740, -11], [734, -6]], 26, 3));
  add('steel', K.turn([[0, 490], [10.5, 490], [10.5, 600], [9, 650], [8.4, 760], [8.2, 852], [0, 852]], 22));
  add('steel', K.tube(3, 645, 846, -13, 0, 10));
  // the front sight's block: its post between the ears of its hood, the bayonet lug under it
  add('steel', K.ext([[826, -16], [851, -16], [851, 12], [846, 17], [831, 17], [826, 11]], 24, 3));
  for (const x of [-9, 9]) add('steel', K.ext([[829, 15], [849, 15], [849, 50], [842, 55], [834, 55], [829, 48]], 3.2, 0.8, x));
  add('steel', K.ext([[836, 15], [841, 15], [841, 47], [836, 47]], 2.4, 0.4));
  add('steel', K.ext([[828, -15], [850, -15], [850, -23], [828, -21]], 14, 1.5));
  // the slant brake (the AKM's: its lip longer underneath, the gas thrown up), its lip worn bright
  add('steel', K.turn([[0, 849], [9.6, 849], [9.6, 872], [8, 874], [0, 874]], 20));
  add('steel', K.ext([[868, -9.4], [880, -9.4], [880, 0], [868, 3]], 17, 4));
  add('bare', K.ext([[875, -9.6], [880, -9.6], [880, -6], [875, -6]], 17.4, 1));
  // the 30-round magazine: steel, its curve an arc round (586, -14.5) - its back 204 mm out, its front 148 - from its
  // mouth to its floor 60 degrees on; the ribs pressed down its sides, the floor plate
  const MB = arc(586, -14.5, 204, 183, 243), MF = arc(586, -14.5, 148, 183, 243);
  add('steel', K.ext(magSide(MB, MF), 26, 3, 0, [], 6));
  for (const f of [0.18, 0.38, 0.58, 0.78]) add('steel', K.ext(magSide(MB, MF, f, f + 0.06, 0.05, 0.93), 27.6, 1, 0, [], 4));
  add('steel', K.ext(magSide(arc(586, -14.5, 206, 183, 243), arc(586, -14.5, 146, 183, 243), 0, 1, 0.94, 1.01, 2), 29, 1.5));
  // the rivets of the trunnions and the trigger group's pins, both sides
  for (const x of [-15.6, 15.6]) {
    for (const [ss, yy] of [[241, -3], [241, -18], [474, 6], [484, 6], [474, -8], [484, -8], [474, -20], [300, -16], [314, -16], [340, -16]])
      add(x > 0 ? 'bare' : 'steel', K.pin(1.9, 1.2, ss, yy, x, 8));
  }
  return { P, L };
}

// ---------------------------------------------------------------- the M4 (the games' "M4A4")
export function m4Geometry() {
  const L = 838, K = makeKit(L), P = {};
  const add = (m, g) => (P[m] ??= []).push(g);
  // the stock (6-position, out to its last notch): its body over the buffer tube, the butt plate, the sling's slot by
  // the toe, the lock lever under it; the buffer tube and its castle nut
  add('polymer', K.ext([[6, 20], [176, 20], [184, 14], [184, -17], [172, -22], [140, -28], [60, -80], [30, -98], [6, -100]], 38, 5, 0, [[[16, -82], [42, -82], [42, -88], [16, -88]]]));
  add('rubber', K.ext([[0, 21], [6, 21], [6, -101], [0, -100]], 40, 2));
  add('steel', K.ext([[150, -22], [176, -22], [176, -34], [150, -30]], 10, 1));
  add('alu', K.tube(14.5, 120, 255, 2, 0, 22));
  add('steel', K.turn([[0, 243], [17, 243], [17, 252], [0, 252]], 16, 0, 2));
  // the upper receiver (s 257 .. 455): flat-topped, its rail's lands every 10 mm (MIL-STD-1913); the forward assist and
  // the brass deflector behind the ejection port's dust cover; the charging handle's T at its back
  add('alu', K.ext([[257, -13], [455, -13], [455, 24], [257, 24]], 28, 2));
  add('alu', K.ext([[262, 24], [455, 24], [455, 29.8], [262, 29.8]], 21.2, 1));
  for (let s = 266; s < 452; s += 10) add('alu', K.ext([[s, 29.4], [s + 4.8, 29.4], [s + 4.8, 32.2], [s, 32.2]], 21.2, 0.4));
  add('alu', K.tube(6.5, 340, 366, 18, 14.5, 14));
  add('steel', K.tube(7.5, 334, 342, 18, 14.5, 14));
  add('alu', K.ext([[364, 6], [380, 10], [380, 24], [364, 24]], 8, 2, 14));
  add('steel', K.ext([[381, -3], [453, -3], [453, 16], [381, 16]], 1.6, 0.4, 14.4));
  add('alu', K.ext([[244, 22], [262, 22], [262, 31], [244, 31]], 50, 2.5));
  // the lower receiver: the magazine's well and its flared lip, the takedown pins, the selector and the bolt catch
  // (left), the magazine's release (right)
  add('alu', K.ext([[257, -13], [455, -13], [455, -24], [449, -30], [449, -56], [453, -62], [372, -62], [374, -56], [374, -44], [330, -41], [257, -41]], 25, 1.6));
  add('alu', K.ext([[366, -56], [455, -56], [457, -64], [368, -64]], 28, 1.5));
  for (const x of [-12.8, 12.8]) for (const [ss, yy] of [[270, -19], [441, -19], [318, -30], [342, -30]]) add('steel', K.pin(2.6, 1.6, ss, yy, x, 10));
  add('steel', K.ext([[296, -18], [322, -18], [322, -12], [296, -14]], 3, 0.8, -13.6));
  add('steel', K.pin(6, 2, 307, -22, -13.2, 12));
  add('steel', K.ext([[358, -20], [372, -20], [372, -34], [358, -30]], 3, 0.6, -12.8));
  add('steel', K.pin(4.2, 3, 368, -26, 13.4, 12));
  // the A2 grip (chequered, raked, its finger swell), the trigger guard, the trigger
  add('grip', K.ext([[283, -38], [322, -38], [318, -58], [308, -88], [313, -97], [297, -118], [289, -125], [288, -137], [232, -137], [228, -126], [244, -96], [278, -45]], 30, 6));
  add('alu', K.ext([[320, -40], [374, -40], [374, -46], [372, -72], [324, -72], [318, -66]], 10, 1, 0, [[[325, -43], [369, -43], [367, -67], [327, -68]]]));
  add('steel', K.ext([[332, -40], [339, -40], [344, -52], [341, -62], [335, -65], [334, -60], [338, -52], [334, -45]], 6, 0.6));
  // the quad rail round the barrel (its four rails' lands, the vents along its sides), the barrel nut behind it
  add('alu', K.turn([[0, 455], [20, 455], [20, 467], [0, 467]], 18, 0, 2));
  add('alu', K.box(48, 48, 466, 632, 0, 0));
  for (const [x, y, w, h] of [[0, 27.5, 21.2, 7], [0, -27.5, 21.2, 7], [27.5, 0, 7, 21.2], [-27.5, 0, 7, 21.2]]) {
    add('alu', K.box(w, h, 468, 630, x, y));
    for (let s = 472; s < 626; s += 10) add('alu', K.box(w + (x ? 2.6 : 0), h + (y ? 2.6 : 0), s, s + 4.8, x * 1.05, y * 1.05));
  }
  for (let k = 0; k < 8; k++) for (const x of [-24.1, 24.1]) add('rubber', K.pin(5.5, 0.4, 490 + 18.5 * k, -17, x, 12));
  // the barrel (stepped for a grenade launcher's clamp), the front sight's base (its ears round the post, the sling's
  // loop and the bayonet lug under it), the A2 "birdcage" flash hider
  add('steel', K.turn([[0, 455], [9.5, 455], [9.5, 690], [8.6, 700], [8.6, 744], [9.5, 750], [9.5, 790], [0, 790]], 22));
  add('steel', K.ext([[632, -14], [676, -14], [676, 20], [632, 20]], 24, 6));
  for (const x of [-8, 8]) add('steel', K.ext([[638, 18], [674, 18], [674, 62], [666, 64], [658, 60], [638, 30]], 3, 0.6, x));
  add('steel', K.ext([[661, 38], [666, 38], [666, 60], [661, 60]], 3, 0.5));
  add('steel', K.ext([[646, -12], [670, -12], [668, -32], [648, -32]], 4, 0.8, 0, [[[651, -18], [665, -18], [663, -28], [653, -28]]]));
  add('steel', K.ext([[656, -12], [676, -12], [676, -19], [656, -17]], 12, 1));
  add('steel', K.turn([[0, 790], [11, 790], [11, 838], [0, 838]], 22));
  for (const a of [0, 1, 2, -1, -2]) { const g = K.ext([[798, 9.4], [832, 9.4], [832, 11.5], [798, 11.5]], 3, 0.4, 0); g.rotateZ(a * Math.PI / 4); add('rubber', g); }
  // a holographic sight on the rail (its hood, the window, the dot), a vertical foregrip under the rail
  add('polymer', K.ext([[296, 32], [400, 32], [400, 41], [392, 47], [304, 47], [296, 41]], 34, 3));
  for (const x of [-17, 17]) add('polymer', K.ext([[318, 45], [386, 45], [384, 75], [322, 75]], 4, 1.2, x));
  add('polymer', K.ext([[318, 69], [386, 69], [384, 76], [322, 76]], 38, 2));
  add('glass', K.ext([[340, 46], [343, 46], [343, 69], [340, 69]], 30, 0.2));
  add('dot', K.ext([[338.6, 57], [339.6, 57], [339.6, 58], [338.6, 58]], 1, 0.1));
  add('polymer', K.post(15, -31, -118, 566, 0, 18));
  add('rubber', K.post(15.6, -104, -118, 566, 0, 18));
  // the magazine: the aluminium 30-rounder (its slight curve, the ribs down its front, the steel floor plate)
  const MB = (t) => [376 + 30 * t ** 1.6, -28 - 150 * t], MF = (t) => [444 + 24 * t ** 1.5, -28 - 138 * t];
  add('alu', K.ext(magSide(MB, MF), 22.5, 2, 0, [], 4));
  for (const f of [0.6, 0.82]) add('alu', K.ext(magSide(MB, MF, f, f + 0.06, 0.22, 0.92), 24, 0.8, 0, [], 4));
  add('steel', K.ext([[402, -172], [470, -160], [472, -169], [405, -183]], 25, 2));
  return { P, L };
}

// ---------------------------------------------------------------- the PSL (Romanian marksman rifle) with its LPS-4 scope
export function pslGeometry() {
  const L = 1150, K = makeKit(L), P = {};
  const add = (m, g) => (P[m] ??= []).push(g);
  // the skeleton stock (laminated): its comb high, the thumbhole, the open frame by the butt, the grip at its front
  // with its bakelite cap; the rubber butt pad
  add('lam2', K.taper(K.ext([[25, -20], [45, -10], [100, -2], [190, 2], [247, 0], [247, -38], [312, -38], [300, -70], [287, -97], [279, -107], [262, -110], [232, -110], [226, -116], [30, -118], [25, -115]], 40, 6, 0,
    [[[150, -26], [228, -26], [233, -31], [183, -52], [148, -68], [143, -58]], [[37, -40], [82, -40], [85, -45], [85, -93], [80, -97], [40, -97], [35, -92], [35, -45]]], 6), [[0, 1], [150, 0.9], [247, 0.75], [320, 0.75]]));
  add('bakel', K.ext([[230, -108], [280, -105], [281, -118], [276, -125], [234, -125], [229, -118]], 30, 3));
  add('rubber', K.ext([[2, -19], [25, -19], [25, -123], [2, -123]], 42, 3));
  for (let y = -30; y > -118; y -= 9) add('rubber', K.ext([[0.5, y], [3, y], [3, y - 4], [0.5, y - 4]], 38, 1));
  // the receiver (s 247 .. 523, longer than the AKM's), its dust cover and the cover's ribs; the rear sight
  add('steel', K.ext([[247, 10], [255, 18], [523, 18], [523, -38], [247, -38]], 30, 1.2));
  add('steel', K.ext([[257, 18], [261, 26], [271, 30], [500, 30], [500, 18]], 28, 4));
  for (let s = 300; s < 490; s += 24) add('steel', K.ext([[s - 3, 26], [s + 3, 26], [s + 3, 30.8], [s - 3, 30.8]], 22, 2.5));
  add('steel', K.ext([[503, 18], [570, 18], [570, 30], [556, 42], [510, 42], [503, 34]], 22, 2.5));
  add('steel', K.ext([[497, 42], [552, 42], [552, 45], [501, 48], [497, 48]], 16, 0.8));
  // the trigger guard, the trigger, the magazine's release; the selector lever and the charging handle (right)
  add('steel', K.ext([[313, -37], [370, -37], [370, -45], [366, -70], [318, -72], [313, -64]], 10, 1, 0, [[[318, -40], [364, -40], [361, -66], [320, -67]]]));
  add('steel', K.ext([[323, -37], [330, -37], [336, -50], [333, -60], [328, -63], [325, -59], [329, -51], [326, -44]], 6, 0.6));
  add('steel', K.ext([[368, -37], [383, -37], [388, -72], [380, -76], [372, -72]], 12, 1));
  add('steel', K.pin(6.5, 3, 300, -6, 16.4, 14));
  add('steel', K.ext([[297, -10], [305, -11], [404, 6], [407, 12], [402, 14], [296, -2]], 2.6, 0.6, 16.6));
  add('bare', K.ext([[390, 4], [406, 7], [408, 14], [392, 12]], 3, 0.5, 16.8));
  add('steel', K.pin(5, 13, 500, 12, 22, 12));
  // the 10-round magazine (7.62 x 54R), nearly straight, the X pressed in its back half and three ribs in its front;
  // the floor plate
  add('steel', K.ext(magSide((t) => [385 + 6 * t, -30 - 94 * t], (t) => [472 - 2 * t, -30 - 94 * t], 0, 1, 0, 1, 4), 30, 2.5));
  add('steel', K.ext(rib(398, -44, 437, -112, 5), 31.6, 1));
  add('steel', K.ext(rib(437, -44, 398, -112, 5), 31.2, 1));
  for (const s of [446, 455, 464]) add('steel', K.ext(rib(s, -44, s - 1, -112, 3.5), 31.6, 1));
  add('steel', K.ext([[383, -118], [474, -118], [474, -127], [383, -127]], 32, 2));
  // the handguards: the lower one's two long vents, its steel cap at the front; the upper one over the gas tube
  add('lam2', K.ext([[523, 15], [785, 15], [785, -24], [779, -30], [530, -30], [523, -24]], 44, 8));
  for (const [s0, s1] of [[627, 683], [703, 750]]) add('rubber', K.ext(stadium(s0, s1, 0, 5), 44.6, 0.3));
  add('steel', K.ext([[781, 16], [791, 16], [791, -31], [781, -31]], 46, 2));
  add('lam2', K.ext([[572, 15], [728, 15], [728, 32], [720, 41], [580, 41], [572, 34]], 34, 7));
  for (const [s0, s1] of [[600, 640], [660, 705]]) add('rubber', K.ext(stadium(s0, s1, 24, 5), 34.6, 0.3));
  // the gas tube and its block (slanting down to the barrel), the barrel, the front sight (its fin, the hole through
  // it), the brake with its five slots through each side
  add('steel', K.tube(9, 560, 852, 24, 0, 16));
  add('steel', K.ext([[818, 33], [850, 33], [882, 8], [882, -10], [856, -10], [850, 12], [818, 15]], 24, 4));
  add('steel', K.turn([[0, 523], [9, 523], [9, 790], [8, 890], [7.3, 1057], [0, 1057]], 22));
  add('steel', K.turn([[0, 1055], [10, 1055], [10, 1082], [0, 1082]], 20));
  add('steel', K.ext([[1059, 8], [1081, 8], [1078, 50], [1068, 50], [1062, 30]], 6, 1, 0, [[[1066, 21], [1073, 21], [1073, 31], [1066, 31]]]));
  add('steel', K.turn([[0, 1082], [8.6, 1082], [8.6, 1146], [7.6, 1150], [0, 1150]], 22));
  for (let k = 0; k < 5; k++) for (const ph of [Math.PI / 2, Math.PI * 1.5]) add('rubber', K.turn([[8.7, 1100 + 7 * k], [8.7, 1104 + 7 * k]], 6, 0, 0, ph - 0.62, 1.24));
  // the LPS-4 (4x, its eyepiece with the rubber cup, the turret saddle - elevation on top, windage on the right - the
  // objective's tube with its rings) on its mount: two legs on the receiver, the clamp on the left side rail
  const SX = -8, SY = 72.5;
  add('steel', K.turn([[0, 258], [16, 258], [17.5, 262], [17.5, 285], [14, 290], [11, 300], [11, 346], [0, 346]], 26, SX, SY));
  add('rubber', K.turn([[14, 256], [18, 256], [18.5, 268], [14, 268]], 26, SX, SY));
  add('steel', K.turn([[0, 346], [19, 348], [19, 420], [0, 420]], 26, SX, SY));
  add('steel', K.box(30, 36, 350, 418, SX, SY));
  add('steel', K.turn([[0, 420], [14.5, 420], [14.5, 513], [15.5, 515], [15.5, 518], [0, 518]], 26, SX, SY));
  for (const s of [450, 497]) add('steel', K.turn([[15.4, s], [15.4, s + 3]], 26, SX, SY));
  add('steel', K.post(12.5, SY + 38, SY + 16, 394.5, SX, 18));
  add('bare', K.post(11, SY + 40, SY + 37.5, 394.5, SX, 18));
  add('steel', K.pin(12, 8, 394, SY, SX + 19, 18));
  add('bare', K.pin(8, 1.2, 394, SY, SX + 23.4, 18));
  add('glass', K.turn([[0, 517.5], [13, 517.5], [13, 518.5], [0, 518.5]], 24, SX, SY));
  add('glass', K.turn([[0, 257.5], [12, 257.5], [12, 258.5], [0, 258.5]], 24, SX, SY));
  for (const s of [360, 432]) add('steel', K.ext([[s, 29], [s + 18, 29], [s + 18, 56], [s, 56]], 14, 2, SX));
  add('steel', K.ext([[352, 50], [458, 50], [458, 56], [352, 56]], 24, 2, SX));
  add('steel', K.ext([[350, -12], [460, -12], [460, 28], [350, 28]], 6, 1.5, -19));
  return { P, L };
}

// ---------------------------------------------------------------- a Remington 870 (12-gauge, an 18.5 in barrel)
export function shotgunGeometry() {
  const L = 990, K = makeKit(L), P = {};
  const add = (m, g) => (P[m] ??= []).push(g);
  // the walnut stock: its comb flowing into the receiver's top, the semi-pistol grip, the drop to the heel; 42 mm
  // across at the butt, 32 at the wrist; the recoil pad, its sling stud
  add('walnut', K.taper(K.ext([[22, -47], [100, -37], [200, -28], [250, -25], [270, -21], [290, -12], [310, -4], [327, 4], [327, -40], [312, -43], [292, -53], [270, -84], [262, -95], [240, -98], [233, -96], [133, -124], [22, -158]], 42, 9), [[0, 1], [200, 0.9], [275, 0.76], [327, 0.76]]));
  add('rubber', K.ext([[3, -45], [23, -45], [23, -160], [1, -163]], 43, 4));
  add('steel', K.post(3, -141, -150, 70, 0, 8));
  // the receiver (machined, blued; its top in line with the barrel's): the ejection port with the bolt bright in it,
  // the trigger plate's pins, the trigger guard (its long ramp forward), the trigger, the cross-bolt safety
  add('blued', K.ext([[327, 10], [513, 10], [513, -36], [430, -36], [424, -42], [348, -42], [327, -40]], 30, 2.5));
  add('rubber', K.ext([[430, -12], [500, -12], [500, 8], [430, 8]], 1.5, 0.3, 15));
  add('chrome', K.ext([[436, -7], [494, -7], [494, 3], [436, 3]], 1.6, 0.6, 15.2));
  for (const ss of [343, 393]) add('blued', K.pin(2.6, 31, ss, -25, 0, 10));
  add('blued', K.ext([[333, -40], [425, -40], [400, -47], [380, -60], [365, -69], [345, -70], [334, -62]], 9, 1, 0, [[[340, -43], [394, -43], [375, -56], [362, -64], [348, -65], [340, -58]]]));
  add('blued', K.ext([[353, -42], [360, -42], [366, -55], [364, -65], [358, -67], [357, -62], [360, -55], [355, -48]], 6, 0.6));
  add('blued', K.pin(4, 34, 337, -45, 0, 12));
  // the barrel and its bead, the magazine tube under it with its cap and the barrel's ring, the action bars
  add('blued', K.tube(10, 505, 990, 0, 0, 24));
  add('brass', K.post(1.8, 13.5, 9.5, 984, 0, 8));
  add('blued', K.tube(10.5, 505, 792, -30.5, 0, 22));
  add('blued', K.turn([[0, 786], [14, 786], [14, 808], [11, 812], [0, 812]], 22, 0, -30.5));
  add('blued', K.ext([[784, -6], [798, -6], [798, -22], [784, -22]], 16, 2));
  for (const x of [-12.5, 12.5]) add('blued', K.box(2, 6, 513, 606, x, -19));
  // the forend (walnut, its grooves round it but over its top)
  add('walnut', K.turn([[0, 603], [20, 603], [23.5, 612], [23.5, 791], [20, 800], [0, 800]], 26, 0, -30.5, 0, Math.PI * 2, 23.5));
  // (the grooves dark bands just over its surface, their facets on its own - 26 round - so they never sink into it)
  for (let s = 618; s < 784; s += 7.4) add('rubber', K.turn([[23.65, s], [23.65, s + 2.6]], 20, 0, -30.5, Math.PI * 6 / 26, Math.PI * 40 / 26));
  // four shells in a side saddle on the receiver's left (red hulls, brass down)
  add('polymer', K.ext([[352, 6], [462, 6], [462, -30], [352, -30]], 4, 1, -17));
  for (let k = 0; k < 4; k++) {
    add('shell', K.post(10.2, 12, -45, 368 + k * 25, -29.5, 14));
    add('brass', K.post(10.6, -45, -58, 368 + k * 25, -29.5, 14));
  }
  return { P, L };
}

// ---------------------------------------------------------------- the spares on the shelf under them
// each its own { material: [geometries] }, in metres: a loose AK magazine and an M4 one lying on their sides (their
// middle at the origin, their length along x, their side up), a 7.62 mm ammunition can (M19A1: 273 x 95 x 184 mm, its
// floor at y 0, its length along x), a box of 25 12-gauge shells (its floor at y 0) and a loose shell (along x)
export function spares() {
  const out = {};
  const flat = (P, L, s, y) => {              // (the part's middle (s, y) to the origin, laid on its side)
    const T = new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, -y * MM, -(L / 2 - s) * MM));
    for (const k in P) for (const g of P[k]) g.applyMatrix4(T);
    return P;
  };
  {
    const K = makeKit(880), P = {}, add = (m, g) => (P[m] ??= []).push(g);
    const MB = arc(586, -14.5, 204, 183, 243), MF = arc(586, -14.5, 148, 183, 243);
    add('steel', K.ext(magSide(MB, MF), 26, 3, 0, [], 6));
    for (const f of [0.18, 0.38, 0.58, 0.78]) add('steel', K.ext(magSide(MB, MF, f, f + 0.06, 0.05, 0.93), 27.6, 1, 0, [], 4));
    add('steel', K.ext(magSide(arc(586, -14.5, 206, 183, 243), arc(586, -14.5, 146, 183, 243), 0, 1, 0.94, 1.01, 2), 29, 1.5));
    out.akMag = flat(P, 880, 452, -110);
  }
  {
    const K = makeKit(838), P = {}, add = (m, g) => (P[m] ??= []).push(g);
    const MB = (t) => [376 + 30 * t ** 1.6, -28 - 150 * t], MF = (t) => [444 + 24 * t ** 1.5, -28 - 138 * t];
    add('alu', K.ext(magSide(MB, MF), 22.5, 2, 0, [], 4));
    for (const f of [0.6, 0.82]) add('alu', K.ext(magSide(MB, MF, f, f + 0.06, 0.22, 0.92), 24, 0.8, 0, [], 4));
    add('steel', K.ext([[402, -172], [470, -160], [472, -169], [405, -183]], 25, 2));
    out.m4Mag = flat(P, 838, 422, -103);
  }
  // (boxes in metres: centre and size)
  const bx = (P, m, cx, cy, cz, sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(cx, cy, cz); (P[m] ??= []).push(g); };
  {
    // the can: olive drab, its two pressed ribs along each side, the lid with its rim, the latch lever over the lid's
    // end, the folding handle on top
    const P = {};
    bx(P, 'olive', 0, 0.075, 0, 0.268, 0.15, 0.093);
    for (const y of [0.05, 0.1]) bx(P, 'olive', 0, y, 0, 0.24, 0.008, 0.097);
    bx(P, 'olive', 0, 0.167, 0, 0.276, 0.034, 0.1);
    bx(P, 'olive', 0, 0.186, 0, 0.26, 0.006, 0.084);
    bx(P, 'olive', 0.14, 0.13, 0, 0.008, 0.11, 0.05);
    bx(P, 'olive', 0.115, 0.188, 0, 0.05, 0.008, 0.05);
    bx(P, 'steel', 0, 0.192, 0, 0.12, 0.007, 0.01);
    for (const x of [-0.055, 0.055]) bx(P, 'steel', x, 0.19, 0, 0.012, 0.01, 0.016);
    out.can = P;
  }
  {
    // the shells' box: red card, a white band round it; its flap a little open
    const P = {};
    bx(P, 'card', 0, 0.036, 0, 0.106, 0.072, 0.106);
    bx(P, 'paper', 0, 0.036, 0, 0.1075, 0.026, 0.1075);
    const f = new THREE.BoxGeometry(0.106, 0.002, 0.05); f.translate(0, 0, -0.025); f.rotateX(-0.5); f.translate(0, 0.073, 0.053); (P.card ??= []).push(f);
    out.shellBox = P;
  }
  {
    const P = {};
    const s = new THREE.CylinderGeometry(0.0102, 0.0102, 0.057, 14); s.rotateZ(Math.PI / 2); s.translate(-0.0065, 0, 0); (P.shell ??= []).push(s);
    const b = new THREE.CylinderGeometry(0.0106, 0.0106, 0.013, 14); b.rotateZ(Math.PI / 2); b.translate(0.0285, 0, 0); (P.brass ??= []).push(b);
    out.shell = P;
  }
  return out;
}

// all of them merged by material: { material: [geometries] } for each gun placed by its matrix
export function mergeArms(list) {
  const M = armsMaterials(), byMat = new Map();
  for (const { P, matrix } of list) {
    for (const [k, geos] of Object.entries(P)) {
      for (const g0 of geos) {
        let g = g0.index ? g0.toNonIndexed() : g0.clone();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
        g.applyMatrix4(matrix);
        (byMat.get(k) ?? byMat.set(k, []).get(k)).push(g);
      }
    }
  }
  const group = new THREE.Group();
  for (const [k, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), M[k]);
    m.castShadow = true; m.receiveShadow = true;
    m.name = 'arms-' + k;
    group.add(m);
  }
  return group;
}
