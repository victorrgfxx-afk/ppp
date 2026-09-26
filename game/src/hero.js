import * as THREE from 'three';
import { M } from './materials.js';
import { W, baseHeight } from './config.js';
import { boxGeo, cylGeo, mat, quadGeo, tubeGeo } from './util.js';
import { polyGeo, orient, wallGeos, addWindow, gableRoof, addGutter, FACE, wallMatrix } from './buildings.js';
import { ironIvyFence, picketFence, fenceGate, meshFence } from './fences.js';

// The photographed house, rebuilt 1:1 from photos 2-5 (dimensions estimated from the
// photos using the BMW E90 / door widths as scale references).
//   street side = -X ; north = -Z
export const HERO = {
  fenceX: W.EAST_FENCE, z0: -5.45, z1: 5.5, gate: [5.55, 6.65],
  porchY: 0.25, verandaX: 5.0, wallX: 6.3, backX: 14.3,
  gableX: 5.3, gableZ: [-6.0, -2.3], houseZ: [-2.3, 6.8],
  loggia: [-5.3, -3.0, 3.1, 5.3],
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function faceQuad(batch, material, x0, x1, y0, y1, z0, z1, facing, u = [0, 1], v = [0, 1]) {
  // vertical quad; facing: '-x' | '+x' | '-z' | '+z'
  let pts;
  if (facing === '-x') pts = [V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0)];
  else if (facing === '+x') pts = [V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1)];
  else if (facing === '+z') pts = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0)];
  else pts = [V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0)];
  const g = new THREE.BufferGeometry();
  const P = [pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]];
  const UV = [[u[0], v[0]], [u[1], v[0]], [u[1], v[1]], [u[0], v[0]], [u[1], v[1]], [u[0], v[1]]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV.flat(), 2));
  g.computeVertexNormals();
  batch.add(material, g);
}

export function buildHero(batch, world, forest, fx) {
  const H = HERO;
  const b = baseHeight(0);                          // flat here (0)
  const py = b + H.porchY;
  const apronTop = (x) => b + W.CURB_H + (x - W.CURB_X1) * 0.05;

  // ---------------- fence, gate, pillar ----------------
  ironIvyFence(batch, world, { x: H.fenceX, z0: H.z0, z1: H.z1, panels: 5, groundY: apronTop(H.fenceX) });
  // gray concrete pillar where the house fence meets the neighbour's stone wall (photo 2)
  batch.add(M.concretePole, boxGeo(0.34, 1.62, 0.34, 0.6), mat(H.fenceX + 0.17, apronTop(3.7) + 0.81, -5.63));
  batch.add(M.concretePole, boxGeo(0.4, 0.06, 0.4, 0.6), mat(H.fenceX + 0.17, apronTop(3.7) + 1.65, -5.63));
  world.addAABB(3.7, 4.05, -5.8, -5.45, -5, 3, 'pillar');
  // gate posts with solar lamps + open gate leaf (photo 5)
  for (const z of [H.gate[1] + 0.05]) {
    batch.add(M.blackMetal, boxGeo(0.1, 1.62, 0.1), mat(H.fenceX + 0.12, apronTop(3.7) + 0.81, z));
    batch.add(M.darkPlastic, boxGeo(0.14, 0.02, 0.14), mat(H.fenceX + 0.12, apronTop(3.7) + 1.63, z));
    batch.add(M.lampGlass, boxGeo(0.1, 0.1, 0.1), mat(H.fenceX + 0.12, apronTop(3.7) + 1.69, z));
    batch.add(M.darkPlastic, new THREE.ConeGeometry(0.1, 0.07, 4), mat(H.fenceX + 0.12, apronTop(3.7) + 1.78, z, 0, Math.PI / 4, 0));
    world.addAABB(3.7, 3.95, z - 0.06, z + 0.06, -5, 3, 'post');
  }
  fenceGate(batch, world, { x: H.fenceX, z0: H.gate[0], z1: H.gate[1], groundY: apronTop(3.7) + 0.02, open: 1.25 });
  // threshold under the gate
  batch.add(M.tiles, boxGeo(0.28, 0.1, H.gate[1] - H.gate[0] + 0.1, 0.8), mat(H.fenceX + 0.14, apronTop(3.7) + 0.02, (H.gate[0] + H.gate[1]) / 2));
  world.addRegion(3.66, 3.97, H.gate[0], H.gate[1], 0.22);

  // rusted, white-painted angle iron ramp over the curb (photo 4)
  {
    const za = -2.1, zb = 3.1;
    const pts = [V(2.45, b + 0.012, zb), V(2.45, b + 0.012, za), V(2.78, b + W.CURB_H + 0.012, za), V(2.78, b + W.CURB_H + 0.012, zb)];
    batch.add(M.rustStrip, polyGeo(orient(pts, true), V(0, 0, -1), V(1, 0.4, 0).normalize(), zb - za, 0.35, pts[0]), null, { noCast: true });
  }

  // ---------------- floors ----------------
  const floor = (x0, x1, z0, z1, m = M.tiles) => {
    batch.add(m, boxGeo(x1 - x0, py - b - 0.1, z1 - z0, 0.8), mat((x0 + x1) / 2, b + 0.1 + (py - b - 0.1) / 2, (z0 + z1) / 2), { noCast: true });
  };
  floor(3.95, H.wallX, H.houseZ[0], H.houseZ[1]);
  floor(3.95, H.backX, H.houseZ[1], 9.0, M.tiles);
  floor(3.95, H.gableX, -5.45, H.houseZ[0], M.soil);
  world.addRegion(3.95, H.wallX, H.houseZ[0], H.houseZ[1], H.porchY);
  world.addRegion(3.95, H.gableX, -5.45, H.houseZ[0], H.porchY);
  world.addRegion(3.95, 24.5, H.houseZ[1], 9.0, H.porchY);
  world.addRegion(H.backX, 24.5, -6.0, 9.0, H.porchY);
  world.addRegion(W.CURB_X1, W.EAST_FENCE, H.z0, H.gate[1] + 0.1, 0, (x, z, bb) => bb + W.CURB_H + (x - W.CURB_X1) * 0.05);
  // backyard lawn
  batch.add(M.grassGround, boxGeo(24 - H.backX, 0.1, 15, 3), mat((24 + H.backX) / 2, py - 0.05, 1.5), { noCast: true });

  // ---------------- veranda (enclosed, wooden windows + door) ----------------
  const vz0 = 1.0, vz1 = 5.5, vx = H.verandaX;
  const sillY = py + 0.87;
  const topY = 2.6;
  faceQuad(batch, M.stoneCladding, vx, 0, py, sillY, vz0, vz1, '-x', [0, (vz1 - vz0) / 1.2], [0, (sillY - py) / 0.95]);
  faceQuad(batch, M.facadeVeranda, vx, 0, sillY + 0.04, topY, vz0, vz1, '-x');
  batch.add(M.stuccoGrayLight, boxGeo(0.14, 0.05, vz1 - vz0 + 0.04, 0.6), mat(vx - 0.03, sillY + 0.02, (vz0 + vz1) / 2));
  // window boxes with flowers
  for (const [za, zb] of [[1.25, 1.95], [2.05, 2.7], [4.02, 4.72], [4.8, 5.45]]) {
    batch.add(M.darkPlastic, boxGeo(0.17, 0.15, zb - za, 0.5), mat(vx - 0.12, sillY + 0.12, (za + zb) / 2));
    for (let k = 0; k < 6; k++) {
      const z = za + (k + 0.5) * (zb - za) / 6;
      forest.add('flowerBox', fx.flowerBox, vx - 0.12, sillY + 0.19, z, k * 1.7, 0.9 + (k % 3) * 0.1);
    }
  }
  // veranda side walls + a wooden lintel
  faceQuad(batch, M.stuccoGray, vx, H.wallX, py, 2.75, vz0, 0, '-z', [0, 1.3 / 1.5], [0, 2.5 / 1.5]);
  faceQuad(batch, M.stuccoGray, vx, H.wallX, py, 2.75, vz1, 0, '+z', [0, 1.3 / 1.5], [0, 2.5 / 1.5]);
  batch.add(M.woodDark, boxGeo(0.14, 0.2, vz1 - vz0 + 0.1, 1), mat(vx - 0.02, topY + 0.08, (vz0 + vz1) / 2));
  world.addAABB(vx, H.wallX, vz0, vz1, -5, 5, 'house');

  // ---------------- open porch (photo texture on the back wall) ----------------
  const pz0 = H.houseZ[0], pz1 = vz0;
  faceQuad(batch, M.facadePorch, H.wallX, 0, py, 2.64, pz0, pz1, '-x');
  faceQuad(batch, M.stuccoGray, H.wallX, 0, 2.64, 2.9, pz0, pz1, '-x', [0, 2.2], [0, 0.2]);
  // white window sill + pots under the (photographed) PVC window
  batch.add(M.whitePVC, boxGeo(0.1, 0.035, 1.5), mat(H.wallX - 0.05, py + 0.73, -1.07));
  for (const [z, s] of [[-1.62, 1], [-1.3, 0.8], [-0.95, 1.1], [-0.6, 0.9]]) {
    batch.add(M.terracotta, cylGeo(0.08 * s, 0.06 * s, 0.13 * s, 10), mat(H.wallX - 0.12, py + 0.8 * 1 + 0.02, z));
    forest.add('potPlant', fx.potPlant, H.wallX - 0.12, py + 0.82 + 0.1 * s, z, z * 3, 0.6 * s);
  }
  // big pots on the porch floor
  for (const [x, z, s] of [[4.2, -1.9, 1], [4.3, 0.6, 1.2], [4.25, 1.6, 0.9]]) {
    batch.add(M.pot, cylGeo(0.16 * s, 0.12 * s, 0.3 * s, 12), mat(x, py + 0.15 * s, z));
    forest.add('potPlant', fx.potPlant, x, py + 0.28 * s, z, z, 0.9 * s);
  }
  // porch north end wall (brick cladding) and gable-block face above the porch roof
  faceQuad(batch, M.brick, H.gableX, H.wallX, py, 2.9, pz0, 0, '+z', [0, 1 / 0.5], [0, 2.65 / 0.5]);
  faceQuad(batch, M.stuccoGrayLight, H.gableX, H.wallX, 2.9, 4.6, pz0, 0, '+z', [0, 1 / 1.5], [0, 1.7 / 1.5]);

  // recessed end section (gray stucco + small window with blinds, photo 5)
  {
    const T = wallMatrix(H.wallX, py, vz1, FACE.W);
    const L = H.houseZ[1] - vz1, Hh = 2.9 - py;
    const op = [0.35, 0.95, 1.0, 2.05];
    for (const g of wallGeos(L, Hh, [op], 1.5)) batch.add(M.stuccoGray, g, T);
    addWindow(batch, T, op, { frame: M.woodLight, glass: M.windowBlinds, reveal: M.stuccoGray, sill: false });
  }

  // ---------------- lower (porch) roof: metal panels from the photo ----------------
  const rz0 = H.houseZ[0], rz1 = H.houseZ[1] + 0.15;
  const rA = { x: H.wallX, y: 2.97 }, rB = { x: 4.0, y: 2.5 };
  {
    const pts = [V(rB.x, rB.y, rz1), V(rB.x, rB.y, rz0), V(rA.x, rA.y, rz0), V(rA.x, rA.y, rz1)];
    const upv = new THREE.Vector3(rA.x - rB.x, rA.y - rB.y, 0).normalize();
    batch.add(M.roofPhoto, polyGeo(orient(pts, true), V(0, 0, -1), upv, 7.8, 2.3, pts[0]));
    // soffit boards underneath
    const d = 0.13;
    const sp = [V(rB.x, rB.y - d, rz0), V(rB.x, rB.y - d, rz1), V(rA.x, rA.y - d, rz1), V(rA.x, rA.y - d, rz0)];
    batch.add(M.wood, polyGeo(orient(sp, false), V(0, 0, 1), upv, 0.9, 3, sp[0]));
    batch.add(M.woodDark, boxGeo(0.03, 0.17, rz1 - rz0, 1), mat(rB.x - 0.01, rB.y - 0.07, (rz0 + rz1) / 2));
    // rafters under the soffit
    const len = Math.hypot(rA.x - rB.x, rA.y - rB.y);
    const ang = Math.atan2(rA.y - rB.y, rA.x - rB.x);
    for (let z = rz0 + 0.3; z < rz1 - 0.1; z += 0.62) {
      batch.add(M.woodDark, boxGeo(len, 0.13, 0.07, 1), mat((rA.x + rB.x) / 2 + 0.05, (rA.y + rB.y) / 2 - d - 0.065, z, 0, 0, ang));
    }
    // front beam and posts
    batch.add(M.wood, boxGeo(0.14, 0.2, rz1 - rz0, 1), mat(4.22, 2.3, (rz0 + rz1) / 2));
    for (const z of [rz0 + 0.1, 1.0, H.houseZ[1] - 0.05]) {
      batch.add(M.wood, boxGeo(0.13, 2.2 - py + 0.1, 0.13, 1), mat(4.22, py + (2.2 - py) / 2, z));
      world.addAABB(4.15, 4.29, z - 0.07, z + 0.07, -5, 5, 'post');
    }
    addGutter(batch, new THREE.Matrix4(), rB.x - 0.06, rB.y - 0.05, rz0, rz1, py, 4.22 - 0.1);
  }

  // ---------------- knee wall + upper roof ----------------
  faceQuad(batch, M.kneeWall, H.wallX, 0, 2.93, 4.12, -2.3, H.houseZ[1], '-x', [0, 9.1 / 9.3]);
  gableRoof(batch, new THREE.Matrix4(), {
    x0: H.wallX, x1: H.backX, z0: -4.15, z1: H.houseZ[1], eave: 4.2, ridge: 6.45, ov: 0.5, ovEnd: 0.45,
    mat: M.roofPhoto, soffit: M.wood, fascia: M.woodDark, gableWall: null, gy: py,
  });
  // south gable end + walls of the long section
  {
    const x0 = H.wallX, x1 = H.backX, xm = (x0 + x1) / 2, z = H.houseZ[1];
    const tri = [V(x0, 4.2, z), V(x1, 4.2, z), V(xm, 6.45, z)];
    batch.add(M.stuccoTan, polyGeo(tri, V(1, 0, 0), V(0, 1, 0), 1.5, 1.5));
    const Ts = wallMatrix(x0, py, z, FACE.S);
    const ops = [[2.2, 3.4, 1.0, 2.3]];
    for (const g of wallGeos(x1 - x0, 2.93 - py, ops, 1.5)) batch.add(M.stuccoGray, g, Ts);
    const Ts2 = wallMatrix(x0, 2.93, z, FACE.S);
    for (const g of wallGeos(x1 - x0, 4.2 - 2.93, [], 1.5)) batch.add(M.stuccoTan, g, Ts2);
    addWindow(batch, Ts, ops[0], { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.stuccoGray, shutterBox: true });
    const Te = wallMatrix(x1, py, z, FACE.E);
    const opsE = [[1.5, 2.7, 1.0, 2.3], [5.0, 6.2, 1.0, 2.3]];
    for (const g of wallGeos(z - H.houseZ[0], 4.2 - py, opsE, 1.5)) batch.add(M.stuccoTan, g, Te);
    for (const o of opsE) addWindow(batch, Te, o, { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.stuccoTan, shutterBox: true });
  }
  world.addAABB(H.wallX, H.backX, H.houseZ[0], H.houseZ[1], -5, 8, 'house');

  // roof mast for the service cable (photo 4) + vent pipe
  batch.add(M.galv, cylGeo(0.03, 0.03, 2.3, 8), mat(6.05, 2.95 + 1.15, -0.17));
  batch.add(M.galv, cylGeo(0.035, 0.035, 1.9, 8), mat(6.55, 3.1 + 0.95, 0.3));
  batch.add(M.galv, cylGeo(0.06, 0.05, 0.2, 8), mat(6.55, 5.1, 0.3));

  // ---------------- gable block (north, 2 storeys with loggia) ----------------
  {
    const gx = H.gableX, [gz0, gz1] = H.gableZ, zc = (gz0 + gz1) / 2, hw = (gz1 - gz0) / 2;
    const eave = 4.6, ridge = 7.4;
    const [lz0, lz1, ly0, ly1] = H.loggia;
    // front ground floor + first floor up to the eave line, with loggia opening
    const T = wallMatrix(gx, py, gz0, FACE.W);
    const opsGF = [[0.9, 2.1, 1.0 - 0.1, 2.3 - 0.05], [2.55, 3.45, 0.0, 2.2]];
    const opL = [lz0 - gz0, lz1 - gz0, ly0 - py, eave - py];
    for (const g of wallGeos(gz1 - gz0, eave - py, [...opsGF, opL], 1.5)) batch.add(M.stuccoGrayLight, g, T);
    addWindow(batch, T, opsGF[0], { frame: M.woodLight, glass: M.windowBlinds, reveal: M.stuccoGrayLight });
    addWindow(batch, T, opsGF[1], { door: true, frame: M.woodDark, doorMat: M.woodDark, reveal: M.stuccoGrayLight });
    // gable triangle minus the loggia opening (polygons CCW in the (z, y) plane => facing -X)
    const zAtY = (y, side) => zc + side * hw * (ridge - y) / (ridge - eave);
    const P = (y, z) => V(gx, y, z);
    const zl = zAtY(ly1, -1), zr = zAtY(ly1, 1);
    const polys = [
      [P(eave, gz0), P(eave, lz0), P(ly1, lz0), P(ly1, zl)],
      [P(eave, lz1), P(eave, gz1), P(ly1, zr), P(ly1, lz1)],
      [P(ly1, zl), P(ly1, zr), P(ridge, zc)],
    ];
    for (const pts of polys) batch.add(M.stuccoGrayLight, polyGeo(pts, V(0, 0, 1), V(0, 1, 0), 1.5, 1.5, V(gx, 0, 0)));
    // loggia interior
    const lx1 = gx + 1.1;
    faceQuad(batch, M.stuccoTan, lx1, 0, ly0, ly1, lz0, lz1, '-x', [0, 1.5], [0, 1.4]);
    faceQuad(batch, M.stuccoTan, gx, lx1, ly0, ly1, lz0, 0, '+z', [0, 0.7], [0, 1.4]);
    faceQuad(batch, M.stuccoTan, gx, lx1, ly0, ly1, lz1, 0, '-z', [0, 0.7], [0, 1.4]);
    batch.add(M.wood, boxGeo(1.1, 0.05, lz1 - lz0, 0.9, 3), mat(gx + 0.55, ly1 - 0.02, (lz0 + lz1) / 2));
    batch.add(M.tiles, boxGeo(1.1, 0.06, lz1 - lz0, 0.8), mat(gx + 0.55, ly0 + 0.03, (lz0 + lz1) / 2));
    addWindow(batch, wallMatrix(lx1, ly0, lz0, FACE.W), [0.4, 1.4, 0.0, 2.05], { door: true, frame: M.whitePVC, doorMat: M.windowCurtain, reveal: M.stuccoTan });
    // railing
    batch.add(M.blackMetal, boxGeo(0.04, 0.04, lz1 - lz0), mat(gx - 0.02, ly0 + 0.95, (lz0 + lz1) / 2));
    for (let z = lz0 + 0.08; z < lz1; z += 0.12) batch.add(M.blackMetal, boxGeo(0.016, 0.92, 0.016), mat(gx - 0.02, ly0 + 0.48, z));
    // hanging planter in the loggia (photo 3)
    batch.add(M.cable, cylGeo(0.004, 0.004, 0.7, 3), mat(gx + 0.5, ly1 - 0.35, zc + 0.3));
    batch.add(M.terracotta, new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(gx + 0.5, ly1 - 0.62, zc + 0.3));
    forest.add('potPlant', fx.potPlant, gx + 0.5, ly1 - 0.66, zc + 0.3, 0, 0.8);
    // side and back walls
    const Tn = wallMatrix(H.backX, py, gz0, FACE.N);
    const opsN = [[2.0, 3.2, 1.0, 2.3], [5.5, 6.7, 1.0, 2.3], [3.5, 4.5, 3.4, 4.3]];
    for (const g of wallGeos(H.backX - gx, eave - py, opsN, 1.5)) batch.add(M.stuccoGrayLight, g, Tn);
    for (const o of opsN) addWindow(batch, Tn, o, { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.stuccoGrayLight, shutterBox: true });
    const Tsg = wallMatrix(H.wallX, py, gz1, FACE.S);
    for (const g of wallGeos(H.backX - H.wallX, eave - py, [], 1.5)) batch.add(M.stuccoGrayLight, g, Tsg);
    const Tb = wallMatrix(H.backX, py, gz1, FACE.E);
    for (const g of wallGeos(gz1 - gz0, eave - py, [[1.3, 2.4, 1.0, 2.3]], 1.5)) batch.add(M.stuccoGrayLight, g, Tb);
    addWindow(batch, Tb, [1.3, 2.4, 1.0, 2.3], { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.stuccoGrayLight });
    // back gable triangle
    const bt = [V(H.backX, eave, gz1), V(H.backX, eave, gz0), V(H.backX, ridge, zc)];
    batch.add(M.stuccoGrayLight, polyGeo(bt, V(0, 0, 1), V(0, 1, 0), 1.5));
    // roof: ridge perpendicular to the street (local Z -> world X)
    const Tr = mat(0, 0, 0, 0, Math.PI / 2, 0);
    gableRoof(batch, Tr, {
      x0: -gz1, x1: -gz0, z0: gx, z1: H.backX, eave, ridge, ov: 0.5, ovEnd: 0.65,
      mat: M.roofPhoto, soffit: M.wood, fascia: M.woodDark, gableWall: null, gy: py,
    });
    world.addAABB(gx, H.backX, gz0, gz1, -5, 9, 'house');
    // big flowering shrub in front of the gable (photo 3)
    forest.add('heroBush', fx.heroBush, 4.6, py, -4.0, 0.3, 1.0);
    world.addAABB(4.4, 4.8, -4.2, -3.8, -5, 3, 'bush');
  }

  // ---------------- gas pipes (yellow), photo 5 ----------------
  const gas = (pts) => batch.add(M.gasPipe, tubeGeo(pts.map(p => V(...p)), 0.03, 6));
  gas([[6.22, 2.35, 5.6], [6.22, 2.36, 7.2], [6.22, 2.36, 8.4]]);
  batch.add(M.gasPipe, cylGeo(0.03, 0.03, 2.1, 6), mat(6.22, py + 1.05, 8.4));
  batch.add(M.gasPipe, cylGeo(0.03, 0.03, 2.3, 6), mat(7.2, py + 1.15, 8.4));
  batch.add(M.gasPipe, cylGeo(0.03, 0.03, 0.98, 6), mat(6.71, 2.36, 8.4, 0, 0, Math.PI / 2));
  batch.add(M.meterBox, boxGeo(0.3, 0.4, 0.2), mat(7.2, py + 1.1, 8.55));

  // ---------------- side/back boundaries ----------------
  picketFence(batch, world, { x: W.EAST_FENCE, z0: H.gate[1] + 0.1, z1: 9.0, groundY: b + W.CURB_H, seed: 5 });
  meshFence(batch, world, { ax: 24, az: -6.05, bx: 24, bz: 9.0, groundY: py });
  meshFence(batch, world, { ax: H.backX, az: -6.1, bx: 24, bz: -6.1, groundY: py });
  // meter box on the picket fence (photo 5)
  batch.add(M.meterBox, boxGeo(0.2, 0.55, 0.42), mat(W.EAST_FENCE - 0.1, b + 0.9, 7.8));

  // backyard trees & a small shed
  forest.add('fruitTree', fx.fruitTree, 18, py, 3, 1.2, 0.9);
  forest.add('fruitTree', fx.fruitTree, 21, py, -2.5, 2.2, 0.8);
  batch.add(M.woodDark, boxGeo(2.4, 2.1, 2.0, 1), mat(22.5, py + 1.05, 6.5));
  batch.add(M.roofMetalGray, boxGeo(2.8, 0.05, 2.4, 1), mat(22.5, py + 2.15, 6.5, 0, 0, 0.12));
  world.addAABB(21.3, 23.7, 5.5, 7.5, -5, 3, 'shed');
}
