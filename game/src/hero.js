import * as THREE from 'three';
import { M } from './materials.js';
import { W, baseHeight } from './config.js';
import { boxGeo, cylGeo, mat, quadGeo, tubeGeo } from './util.js';
import { polyGeo, orient, wallGeos, addWindow, gableRoof, addGutter, FACE, wallMatrix } from './buildings.js';
import { ironIvyFence, picketFence, fenceGate, meshFence } from './fences.js';

// The photographed house, rebuilt from photos 2-5 and 9-14.
// Scale references: BMW E90 (4.52 m), Opel Corsa C (1.65 m wide), door leaves (~0.9 m),
// fence bars and the 4 rows of roof panels over the porch. Street side = -X, north = -Z.
export const HERO = {
  fenceX: W.EAST_FENCE, z0: -5.45, z1: 5.5, gate: [5.55, 6.65],
  porchY: 0.25, verandaX: 6.4, wallX: 7.7, backX: 15.7,
  gableX: 5.5, gableZ: [-6.0, -2.3], houseZ: [-2.3, 8.2],
  loggia: [-5.3, -3.0, 3.1, 5.3],
  lotBack: 26, lotSouth: 20,
  veranda: [1.0, 5.5],                  // z extent of the enclosed veranda
  door: [2.92, 3.8],                    // veranda entrance door (z), from the photo texture
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

function hangingBasket(batch, forest, fx, x, y, z) {
  for (const a of [0, 2.1, 4.2]) batch.add(M.cable, cylGeo(0.003, 0.003, 0.5, 3), mat(x + Math.cos(a) * 0.07, y + 0.22, z + Math.sin(a) * 0.07, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
  batch.add(M.coco, new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(x, y, z));
  forest.add('flowers', fx.flowers, x, y - 0.02, z, x * 7, 1.2);
}

function rattanChair(batch, world, x, py, z, ry) {
  const T = (lx, ly, lz) => new THREE.Matrix4().multiplyMatrices(mat(x, py, z, 0, ry, 0), mat(lx, ly, lz));
  batch.add(M.rattan, boxGeo(0.62, 0.42, 0.6, 0.3), T(0, 0.21, 0));
  batch.add(M.rattan, boxGeo(0.62, 0.45, 0.1, 0.3), T(0, 0.62, 0.27));
  for (const sx of [-1, 1]) batch.add(M.rattan, boxGeo(0.08, 0.22, 0.6, 0.3), T(sx * 0.31, 0.53, 0));
  batch.add(M.cushion, boxGeo(0.5, 0.07, 0.5), T(0, 0.45, -0.02));
  batch.add(M.cushion, boxGeo(0.5, 0.36, 0.07), T(0, 0.66, 0.2));
  world.addAABB(x - 0.34, x + 0.34, z - 0.34, z + 0.34, -5, 1.0, 'chair');
}

export function buildHero(batch, world, forest, fx) {
  const H = HERO;
  const b = baseHeight(0);                          // flat here (0)
  const py = b + H.porchY;
  const apronTop = (x) => b + W.CURB_H + (x - W.CURB_X1) * 0.05;
  const [vz0, vz1] = H.veranda;

  // ---------------- fence, gate, pillar ----------------
  ironIvyFence(batch, world, { x: H.fenceX, z0: H.z0, z1: H.z1, panels: 5, groundY: apronTop(H.fenceX) });
  // gray concrete pillar where the house fence meets the neighbour's stone wall (photo 2)
  batch.add(M.concretePole, boxGeo(0.34, 1.62, 0.34, 0.6), mat(H.fenceX + 0.17, apronTop(3.7) + 0.81, -5.63));
  batch.add(M.concretePole, boxGeo(0.4, 0.06, 0.4, 0.6), mat(H.fenceX + 0.17, apronTop(3.7) + 1.65, -5.63));
  world.addAABB(3.7, 4.05, -5.8, -5.45, -5, 3, 'pillar');
  // gate post with a solar lamp + open gate leaf (photos 5, 11)
  for (const z of [H.gate[1] + 0.05]) {
    batch.add(M.blackMetal, boxGeo(0.1, 1.62, 0.1), mat(H.fenceX + 0.12, apronTop(3.7) + 0.81, z));
    batch.add(M.darkPlastic, boxGeo(0.14, 0.02, 0.14), mat(H.fenceX + 0.12, apronTop(3.7) + 1.63, z));
    batch.add(M.lampGlass, boxGeo(0.1, 0.1, 0.1), mat(H.fenceX + 0.12, apronTop(3.7) + 1.69, z));
    batch.add(M.darkPlastic, new THREE.ConeGeometry(0.1, 0.07, 4), mat(H.fenceX + 0.12, apronTop(3.7) + 1.78, z, 0, Math.PI / 4, 0));
    world.addAABB(3.7, 3.95, z - 0.06, z + 0.06, -5, 3, 'post');
  }
  fenceGate(batch, world, { x: H.fenceX, z0: H.gate[0], z1: H.gate[1], groundY: apronTop(3.7) + 0.02, open: 1.25 });
  batch.add(M.tiles, boxGeo(0.28, 0.1, H.gate[1] - H.gate[0] + 0.1, 0.8), mat(H.fenceX + 0.14, apronTop(3.7) + 0.02, (H.gate[0] + H.gate[1]) / 2));
  world.addRegion(3.66, 3.97, H.gate[0], H.gate[1], 0.22);

  // rusted, white-painted angle iron ramp over the curb (photo 4)
  {
    const za = -2.1, zb = 3.1;
    const pts = [V(2.45, b + 0.012, zb), V(2.45, b + 0.012, za), V(2.78, b + W.CURB_H + 0.012, za), V(2.78, b + W.CURB_H + 0.012, zb)];
    batch.add(M.rustStrip, polyGeo(orient(pts, true), V(0, 0, -1), V(1, 0.4, 0).normalize(), zb - za, 0.35, pts[0]), null, { noCast: true });
  }

  // ---------------- floors & yard levels ----------------
  const floor = (x0, x1, z0, z1, m = M.tiles, top = py) => {
    batch.add(m, boxGeo(x1 - x0, top - b - 0.1, z1 - z0, 0.8), mat((x0 + x1) / 2, b + 0.1 + (top - b - 0.1) / 2, (z0 + z1) / 2), { noCast: true });
  };
  // porch + walkway tiles (terracotta mosaic), with a strip of large gray slabs along the fence
  floor(4.35, H.wallX, H.houseZ[0], H.houseZ[1] + 0.6);
  floor(3.95, 4.35, -5.45, H.houseZ[1] + 0.6, M.pavers);
  floor(4.35, H.gableX, -5.45, H.houseZ[0], M.soil);
  // lawn: south garden + backyard
  floor(3.95, H.lotBack, H.houseZ[1] + 0.6, H.lotSouth, M.grassGround);
  floor(H.backX, H.lotBack, -6.0, H.houseZ[1] + 0.6, M.grassGround);
  // veranda door steps (two tiled steps, photo 12)
  const [dz0, dz1] = H.door;
  const vx = H.verandaX;
  floor(vx - 0.62, vx, dz0 - 0.1, dz1 + 0.1, M.tiles, py + 0.32);
  floor(vx - 0.95, vx - 0.62, dz0 - 0.35, dz1 + 0.35, M.tiles, py + 0.16);
  batch.add(M.doorMat, new THREE.PlaneGeometry(0.62, 0.42).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), mat(vx - 0.3, py + 0.322, (dz0 + dz1) / 2));
  world.addRegion(vx - 0.62, vx, dz0 - 0.1, dz1 + 0.1, H.porchY + 0.32);
  world.addRegion(vx - 0.95, vx, dz0 - 0.35, dz1 + 0.35, H.porchY + 0.16);
  // raised flower bed with concrete edging along the fence (photo 13)
  {
    const bx0 = 4.4, bx1 = 5.1, bz0 = -1.9, bz1 = 1.4, ey = py + 0.2;
    for (const [x, zz, w, d] of [[bx0, (bz0 + bz1) / 2, 0.08, bz1 - bz0], [bx1, (bz0 + bz1) / 2, 0.08, bz1 - bz0], [(bx0 + bx1) / 2, bz0, bx1 - bx0, 0.08], [(bx0 + bx1) / 2, bz1, bx1 - bx0, 0.08]]) {
      batch.add(M.concrete, boxGeo(w, 0.2, d, 0.5), mat(x, py + 0.1, zz));
    }
    batch.add(M.soil, boxGeo(bx1 - bx0 - 0.08, 0.02, bz1 - bz0 - 0.08, 1), mat((bx0 + bx1) / 2, ey - 0.03, (bz0 + bz1) / 2), { noCast: true });
    world.addAABB(bx0 - 0.04, bx1 + 0.04, bz0 - 0.04, bz1 + 0.04, -5, py + 0.2, 'bed');
    for (const [x, z, t, s] of [[4.75, -1.5, 'bush', 0.55], [4.7, -0.7, 'lambEar', 1.1], [4.8, 0.1, 'potPlant', 1.6], [4.65, 0.8, 'bush', 0.45]]) forest.add(t, fx[t], x, ey, z, z * 3, s);
    for (const z of [-1.2, 0.5]) {                    // solar garden torches
      batch.add(M.blackMetal, cylGeo(0.015, 0.015, 0.6, 6), mat(4.55, ey + 0.3, z));
      batch.add(M.darkPlastic, cylGeo(0.04, 0.03, 0.14, 8), mat(4.55, ey + 0.65, z));
    }
  }
  world.addRegion(3.95, H.wallX, H.houseZ[0], H.houseZ[1] + 0.6, H.porchY);
  world.addRegion(3.95, H.gableX, -5.45, H.houseZ[0], H.porchY);
  world.addRegion(3.95, H.lotBack + 0.5, H.houseZ[1], H.lotSouth, H.porchY);
  world.addRegion(H.backX, H.lotBack + 0.5, -6.0, H.lotSouth, H.porchY);
  world.addRegion(W.CURB_X1, W.EAST_FENCE, H.z0, H.gate[1] + 0.1, 0, (x, z, bb) => bb + W.CURB_H + (x - W.CURB_X1) * 0.05);

  // ---------------- veranda (enclosed, wooden windows + door) ----------------
  const sillY = py + 0.87;
  const topY = 2.62;
  const uz = (z) => (z - vz0) / (vz1 - vz0);        // z -> u in the facade photo
  const pier0 = 2.55, pier1 = 4.0;
  // stone base under the windows, stucco jambs around the door, the door's lower part
  for (const [za, zb] of [[vz0, pier0], [pier1, vz1]]) {
    faceQuad(batch, M.stoneCladding, vx, 0, py, sillY, za, zb, '-x', [za / 1.2, zb / 1.2], [0, (sillY - py) / 0.95]);
    batch.add(M.stuccoGrayLight, boxGeo(0.14, 0.05, zb - za + 0.04, 0.6), mat(vx - 0.03, sillY + 0.02, (za + zb) / 2));
  }
  for (const [za, zb] of [[pier0, dz0], [dz1, pier1]]) faceQuad(batch, M.stuccoGrayLight, vx, 0, py, sillY + 0.04, za, zb, '-x', [0, (zb - za) / 1.5], [0, 0.6]);
  faceQuad(batch, M.facadeVeranda, vx, 0, py + 0.32, sillY + 0.04, dz0, dz1, '-x', [uz(dz0), uz(dz1)], [0, 0.07]);
  faceQuad(batch, M.facadeVeranda, vx, 0, sillY + 0.04, topY, vz0, vz1, '-x');
  // brown screen door frame in front of the entrance (photo 12)
  for (const zz of [dz0 + 0.02, dz1 - 0.02]) batch.add(M.woodDark, boxGeo(0.04, 2.2, 0.035), mat(vx - 0.03, py + 0.32 + 1.1, zz));
  batch.add(M.woodDark, boxGeo(0.04, 0.035, dz1 - dz0), mat(vx - 0.03, py + 0.32 + 2.2, (dz0 + dz1) / 2));
  batch.add(M.woodDark, boxGeo(0.03, 0.035, dz1 - dz0), mat(vx - 0.03, py + 0.32 + 0.75, (dz0 + dz1) / 2));
  // window boxes with flowers
  for (const [za, zb] of [[1.25, 1.95], [2.05, 2.5], [4.05, 4.72], [4.8, 5.45]]) {
    batch.add(M.darkPlastic, boxGeo(0.17, 0.15, zb - za, 0.5), mat(vx - 0.12, sillY + 0.12, (za + zb) / 2));
    for (let k = 0; k < 3; k++) forest.add('flowers', fx.flowers, vx - 0.12, sillY + 0.18, za + (k + 0.5) * (zb - za) / 3, k * 1.7 + za, 1.0);
  }
  // Horezu vase left of the steps, pot on a white wicker stand on the right (photo 12)
  {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(0.06 + 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (t > 0.9 ? 0.03 : 0), t * 0.78)); }
    batch.add(M.horezu, new THREE.LatheGeometry(pts, 20), mat(vx - 0.3, py, dz0 - 0.62));
    forest.add('potPlant', fx.potPlant, vx - 0.3, py + 0.78, dz0 - 0.62, 0.5, 0.7);
    batch.add(M.wicker, cylGeo(0.13, 0.11, 0.26, 12, 0.25, true), mat(vx - 0.25, py + 0.13, dz1 + 0.5));
    batch.add(M.terracotta, cylGeo(0.12, 0.09, 0.12, 12), mat(vx - 0.25, py + 0.32, dz1 + 0.5));
    forest.add('potPlant', fx.potPlant, vx - 0.25, py + 0.38, dz1 + 0.5, 1.5, 0.8);
  }
  // veranda side walls + a wooden lintel
  faceQuad(batch, M.stuccoGray, vx, H.wallX, py, 2.8, vz0, 0, '-z', [0, 1.3 / 1.5], [0, 2.5 / 1.5]);
  faceQuad(batch, M.stuccoGray, vx, H.wallX, py, 2.8, vz1, 0, '+z', [0, 1.3 / 1.5], [0, 2.5 / 1.5]);
  batch.add(M.woodDark, boxGeo(0.14, 0.2, vz1 - vz0 + 0.1, 1), mat(vx - 0.02, topY + 0.08, (vz0 + vz1) / 2));
  world.addAABB(vx, H.wallX, vz0, vz1, -5, 5, 'house');

  // ---------------- open porch (photo texture on the back wall) ----------------
  const pz0 = H.houseZ[0], pz1 = vz0;
  faceQuad(batch, M.facadePorch, H.wallX, 0, py, 2.64, pz0, pz1, '-x');
  faceQuad(batch, M.stuccoGray, H.wallX, 0, 2.64, 2.9, pz0, pz1, '-x', [0, 2.2], [0, 0.2]);
  batch.add(M.whitePVC, boxGeo(0.1, 0.035, 1.5), mat(H.wallX - 0.05, py + 0.73, -1.07));
  for (const [z, s] of [[-1.62, 1], [-1.3, 0.8], [-0.95, 1.1], [-0.6, 0.9]]) {
    batch.add(M.terracotta, cylGeo(0.08 * s, 0.06 * s, 0.13 * s, 10), mat(H.wallX - 0.12, py + 0.82, z));
    forest.add('flowers', fx.flowers, H.wallX - 0.12, py + 0.84, z, z * 3, 0.9 * s);
  }
  // rattan lounge set with white cushions and a glass-top table (photo 13)
  rattanChair(batch, world, 7.2, py, -1.45, Math.PI / 2 + 0.2);
  rattanChair(batch, world, 7.25, py, 0.25, Math.PI / 2 - 0.15);
  batch.add(M.rattan, boxGeo(0.55, 0.36, 0.9, 0.3), mat(6.55, py + 0.18, -0.6));
  batch.add(M.windowDark, boxGeo(0.57, 0.012, 0.92), mat(6.55, py + 0.37, -0.6));
  world.addAABB(6.25, 6.85, -1.07, -0.13, -5, 0.6, 'table');
  // clothes drying rack by the flower bed (photo 13)
  {
    const cx = 5.45, cz = -1.35;
    for (const sx of [-0.35, 0.35]) for (const sz of [-0.25, 0.25]) batch.add(M.whitePVC, cylGeo(0.008, 0.008, 1.0, 4), mat(cx + sx, py + 0.5, cz + sz, sz * 0.4, 0, 0));
    for (const dz of [-0.2, 0, 0.2]) batch.add(M.whitePVC, cylGeo(0.006, 0.006, 0.74, 4), mat(cx, py + 0.97, cz + dz, 0, 0, Math.PI / 2));
    const cl = [M.clothesA, M.clothesB, M.clothesC, M.clothesA, M.clothesB, M.clothesC];
    cl.forEach((m, i) => batch.add(m, new THREE.PlaneGeometry(0.2, 0.45 + (i % 3) * 0.12), mat(cx - 0.27 + (i % 3) * 0.26, py + 0.95 - (0.45 + (i % 3) * 0.12) / 2, cz + (i < 3 ? -0.2 : 0.2))));
    world.addAABB(cx - 0.4, cx + 0.4, cz - 0.3, cz + 0.3, -5, 1.2, 'rack');
  }
  // porch north end wall: brick cladding with a screen door and hanging baskets (photo 13)
  {
    const T = wallMatrix(H.gableX, py, pz0, FACE.S);
    const L = H.wallX - H.gableX;
    const op = [L * 0.5 - 0.45, L * 0.5 + 0.45, 0.16, 2.25];
    for (const g of wallGeos(L, 2.9 - py, [op], 0.5)) batch.add(M.brick, g, T);
    addWindow(batch, T, op, { door: true, frame: M.woodDark, doorMat: M.woodDark, reveal: M.brick });
    batch.add(M.tiles, boxGeo(1.2, 0.16, 0.4, 0.8), mat(H.gableX + L * 0.5, py + 0.08, pz0 + 0.2));
    world.addRegion(H.gableX + L * 0.5 - 0.6, H.gableX + L * 0.5 + 0.6, pz0, pz0 + 0.4, H.porchY + 0.16);
    faceQuad(batch, M.stuccoGrayLight, H.gableX, H.wallX, 2.9, 4.6, pz0, 0, '+z', [0, L / 1.5], [0, 1.7 / 1.5]);
    for (const [x, z] of [[H.gableX + 0.45, pz0 + 0.35], [H.gableX + L * 0.5 + 0.8, pz0 + 0.3], [H.wallX - 0.5, 0.2]]) hangingBasket(batch, forest, fx, x, 2.05, z);
    // climbing plant in a tall white pot next to the door
    batch.add(M.ceramicWhite, cylGeo(0.14, 0.12, 0.42, 14), mat(H.gableX + L * 0.5 + 0.75, py + 0.21, pz0 + 0.3));
    forest.add('bush', fx.bush, H.gableX + L * 0.5 + 0.75, py + 0.42, pz0 + 0.3, 1.2, 0.6);
  }

  // recessed end section: gray stucco, stone base, white PVC window with blinds (photos 5, 14)
  {
    const T = wallMatrix(H.wallX, py, vz1, FACE.W);
    const L = H.houseZ[1] - vz1;
    const op = [0.55, 1.55, 0.95, 2.1];
    for (const g of wallGeos(L, 2.9 - py - 0.62, [[op[0], op[1], op[2] - 0.62, op[3] - 0.62]], 1.5)) { g.translate(0, 0.62, 0); batch.add(M.stuccoGray, g, T); }
    for (const g of wallGeos(L, 0.62, [], 1.2)) { g.translate(0, 0, 0.02); batch.add(M.stoneCladding, g, T); }
    addWindow(batch, T, op, { frame: M.whitePVC, glass: M.windowBlinds, reveal: M.stuccoGray, sillMat: M.stuccoGrayLight });
  }

  // ---------------- lower (porch) roof: 4 rows of metal panels from the photo ----------------
  const rz0 = H.houseZ[0], rz1 = H.houseZ[1] + 0.15;
  const rA = { x: H.wallX, y: 2.97 }, rB = { x: 4.0, y: 2.36 };
  const postX = 5.05;
  {
    const pts = [V(rB.x, rB.y, rz1), V(rB.x, rB.y, rz0), V(rA.x, rA.y, rz0), V(rA.x, rA.y, rz1)];
    const upv = new THREE.Vector3(rA.x - rB.x, rA.y - rB.y, 0).normalize();
    batch.add(M.roofPhoto, polyGeo(orient(pts, true), V(0, 0, -1), upv, 7.8, 3.7, pts[0]));
    const d = 0.13;
    const sp = [V(rB.x, rB.y - d, rz0), V(rB.x, rB.y - d, rz1), V(rA.x, rA.y - d, rz1), V(rA.x, rA.y - d, rz0)];
    batch.add(M.wood, polyGeo(orient(sp, false), V(0, 0, 1), upv, 0.9, 3, sp[0]));
    batch.add(M.woodDark, boxGeo(0.03, 0.17, rz1 - rz0, 1), mat(rB.x - 0.01, rB.y - 0.07, (rz0 + rz1) / 2));
    // exposed rafters (photos 11-13)
    const len = Math.hypot(rA.x - rB.x, rA.y - rB.y);
    const ang = Math.atan2(rA.y - rB.y, rA.x - rB.x);
    for (let z = rz0 + 0.3; z < rz1 - 0.1; z += 0.62) {
      batch.add(M.woodDark, boxGeo(len, 0.14, 0.08, 1), mat((rA.x + rB.x) / 2 + 0.05, (rA.y + rB.y) / 2 - d - 0.07, z, 0, 0, ang));
    }
    // beam on square wooden posts
    const beamTop = rB.y + (postX - rB.x) / (rA.x - rB.x) * (rA.y - rB.y) - d - 0.12;
    batch.add(M.wood, boxGeo(0.14, 0.2, rz1 - rz0, 1), mat(postX, beamTop - 0.1, (rz0 + rz1) / 2));
    for (const z of [rz0 + 0.12, 5.62, H.houseZ[1] - 0.1]) {
      const h = beamTop - 0.2 - py;
      batch.add(M.woodDark, boxGeo(0.12, h, 0.12, 1), mat(postX, py + h / 2, z));
      world.addAABB(postX - 0.07, postX + 0.07, z - 0.07, z + 0.07, -5, 5, 'post');
    }
    addGutter(batch, new THREE.Matrix4(), rB.x - 0.06, rB.y - 0.05, rz0, rz1, py, 4.2);
  }

  // ---------------- knee wall + upper roof ----------------
  faceQuad(batch, M.kneeWall, H.wallX, 0, 2.93, 4.12, -2.3, H.houseZ[1], '-x', [0, 1]);
  gableRoof(batch, new THREE.Matrix4(), {
    x0: H.wallX, x1: H.backX, z0: -4.15, z1: H.houseZ[1], eave: 4.2, ridge: 6.45, ov: 0.5, ovEnd: 0.45,
    mat: M.roofPhoto, soffit: M.wood, fascia: M.woodDark, gableWall: null, gy: py,
  });
  {
    const x0 = H.wallX, x1 = H.backX, xm = (x0 + x1) / 2, z = H.houseZ[1];
    const tri = [V(x0, 4.2, z), V(x1, 4.2, z), V(xm, 6.45, z)];
    batch.add(M.stuccoTan, polyGeo(tri, V(1, 0, 0), V(0, 1, 0), 1.5, 1.5));
    const Ts = wallMatrix(x0, py, z, FACE.S);
    const ops = [[2.4, 3.6, 1.0, 2.3]];
    for (const g of wallGeos(x1 - x0, 2.93 - py - 0.62, [[2.4, 3.6, 0.38, 1.68]], 1.5)) { g.translate(0, 0.62, 0); batch.add(M.stuccoGray, g, Ts); }
    for (const g of wallGeos(x1 - x0, 0.62, [], 1.2)) { g.translate(0, 0, 0.02); batch.add(M.stoneCladding, g, Ts); }
    const Ts2 = wallMatrix(x0, 2.93, z, FACE.S);
    for (const g of wallGeos(x1 - x0, 4.2 - 2.93, [], 1.5)) batch.add(M.stuccoTan, g, Ts2);
    addWindow(batch, Ts, ops[0], { frame: M.whitePVC, glass: M.windowBlinds, reveal: M.stuccoGray, sillMat: M.stuccoGrayLight });
    const Te = wallMatrix(x1, py, z, FACE.E);
    const opsE = [[1.5, 2.7, 1.0, 2.3], [5.0, 6.2, 1.0, 2.3], [8.3, 9.3, 1.0, 2.3]];
    for (const g of wallGeos(z - H.houseZ[0], 4.2 - py, opsE, 1.5)) batch.add(M.stuccoTan, g, Te);
    for (const o of opsE) addWindow(batch, Te, o, { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.stuccoTan, shutterBox: true });
  }
  world.addAABB(H.wallX, H.backX, H.houseZ[0], H.houseZ[1], -5, 8, 'house');

  // roof mast for the service cable (photo 4) + vent pipe
  batch.add(M.galv, cylGeo(0.03, 0.03, 2.3, 8), mat(H.wallX - 0.25, 2.95 + 1.15, -0.17));
  batch.add(M.galv, cylGeo(0.035, 0.035, 1.9, 8), mat(H.wallX + 0.25, 3.1 + 0.95, 0.3));
  batch.add(M.galv, cylGeo(0.06, 0.05, 0.2, 8), mat(H.wallX + 0.25, 5.1, 0.3));

  // ---------------- gable block (north, 2 storeys with loggia) ----------------
  {
    const gx = H.gableX, [gz0, gz1] = H.gableZ, zc = (gz0 + gz1) / 2, hw = (gz1 - gz0) / 2;
    const eave = 4.6, ridge = 7.4;
    const [lz0, lz1, ly0, ly1] = H.loggia;
    const T = wallMatrix(gx, py, gz0, FACE.W);
    const opsGF = [[0.9, 2.1, 1.0 - 0.1, 2.3 - 0.05], [2.55, 3.45, 0.0, 2.2]];
    const opL = [lz0 - gz0, lz1 - gz0, ly0 - py, eave - py];
    for (const g of wallGeos(gz1 - gz0, 2.9 - py, opsGF, 0.5)) batch.add(M.brick, g, T);
    for (const g of wallGeos(gz1 - gz0, eave - 2.9, [[opL[0], opL[1], opL[2] - (2.9 - py), opL[3] - (2.9 - py)]], 1.5)) { g.translate(0, 2.9 - py, 0); batch.add(M.stuccoGrayLight, g, T); }
    addWindow(batch, T, opsGF[0], { frame: M.woodLight, glass: M.windowBlinds, reveal: M.brick });
    addWindow(batch, T, opsGF[1], { door: true, frame: M.woodDark, doorMat: M.woodDark, reveal: M.brick });
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
    batch.add(M.blackMetal, boxGeo(0.04, 0.04, lz1 - lz0), mat(gx - 0.02, ly0 + 0.95, (lz0 + lz1) / 2));
    for (let z = lz0 + 0.08; z < lz1; z += 0.12) batch.add(M.blackMetal, boxGeo(0.016, 0.92, 0.016), mat(gx - 0.02, ly0 + 0.48, z));
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
    const bt = [V(H.backX, eave, gz1), V(H.backX, eave, gz0), V(H.backX, ridge, zc)];
    batch.add(M.stuccoGrayLight, polyGeo(bt, V(0, 0, 1), V(0, 1, 0), 1.5));
    const Tr = mat(0, 0, 0, 0, Math.PI / 2, 0);
    gableRoof(batch, Tr, {
      x0: -gz1, x1: -gz0, z0: gx, z1: H.backX, eave, ridge, ov: 0.5, ovEnd: 0.65,
      mat: M.roofPhoto, soffit: M.wood, fascia: M.woodDark, gableWall: null, gy: py,
    });
    world.addAABB(gx, H.backX, gz0, gz1, -5, 9, 'house');
    // big flowering shrub in front of the gable (photo 3)
    forest.add('heroBush', fx.heroBush, 4.7, py, -4.0, 0.3, 1.0);
    world.addAABB(4.5, 4.9, -4.2, -3.8, -5, 3, 'bush');
  }

  // ---------------- gas pipes (yellow) crossing the walkway to the meter cabinet (photo 14) ----------------
  const gas = (pts) => batch.add(M.gasPipe, tubeGeo(pts.map(p => V(...p)), 0.028, 6));
  const boxTop = b + W.CURB_H + 1.1;
  gas([[H.wallX, 2.42, 7.7], [5.5, 2.42, 7.7], [4.3, 2.42, 7.7]]);
  gas([[H.wallX, 2.2, 8.0], [5.6, 2.2, 8.0], [4.45, 2.2, 8.0]]);
  batch.add(M.gasPipe, cylGeo(0.028, 0.028, 2.42 - boxTop, 6), mat(4.3, (2.42 + boxTop) / 2, 7.7));
  batch.add(M.gasPipe, cylGeo(0.028, 0.028, 2.2 - boxTop, 6), mat(4.45, (2.2 + boxTop) / 2, 8.0));
  batch.add(M.meterBox, boxGeo(0.9, 0.97, 0.56), mat(4.1, b + W.CURB_H + 0.615, 7.85));
  world.addAABB(3.65, 4.55, 7.57, 8.13, -5, 2, 'meter');
  // concrete planter with a big four-o'clock bush on the walkway (photo 14)
  batch.add(M.concrete, boxGeo(0.7, 0.35, 0.7, 0.6), mat(4.75, py + 0.17, 8.5));
  forest.add('bush', fx.bush, 4.75, py + 0.35, 8.5, 0.7, 0.75);
  world.addAABB(4.4, 5.1, 8.15, 8.85, -5, 1.5, 'planter');

  // ---------------- garden south of the house: lawn, bench, table, parasol, trellis ----------------
  {
    const T = (x, y, z, ry = 0) => mat(x, py + y, z, 0, ry, 0);
    // wooden bench (photo 14)
    const bxz = [8.6, 13.2];
    batch.add(M.woodDark, boxGeo(1.5, 0.05, 0.4, 1), T(bxz[0], 0.45, bxz[1]));
    batch.add(M.woodDark, boxGeo(1.5, 0.35, 0.05, 1), T(bxz[0], 0.72, bxz[1] + 0.2));
    for (const sx of [-0.65, 0.65]) batch.add(M.woodDark, boxGeo(0.07, 0.45, 0.4, 1), T(bxz[0] + sx, 0.22, bxz[1]));
    world.addAABB(bxz[0] - 0.78, bxz[0] + 0.78, bxz[1] - 0.25, bxz[1] + 0.25, -5, 1, 'bench');
    // table with a lilac tablecloth and a white parasol
    const tx = 10.2, tz = 11.6;
    batch.add(M.woodDark, boxGeo(1.6, 0.05, 0.9, 1), T(tx, 0.74, tz));
    batch.add(M.tablecloth, boxGeo(1.7, 0.02, 1.0, 1), T(tx, 0.77, tz));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.add(M.woodDark, boxGeo(0.06, 0.72, 0.06), T(tx + sx * 0.7, 0.36, tz + sz * 0.35));
    for (const sz of [-1, 1]) batch.add(M.tablecloth, new THREE.PlaneGeometry(1.7, 0.3), mat(tx, py + 0.62, tz + sz * 0.5, 0, sz > 0 ? 0 : Math.PI, 0));
    batch.add(M.tablecloth, new THREE.PlaneGeometry(1.0, 0.3), mat(tx - 0.85, py + 0.62, tz, 0, -Math.PI / 2, 0));
    batch.add(M.tablecloth, new THREE.PlaneGeometry(1.0, 0.3), mat(tx + 0.85, py + 0.62, tz, 0, Math.PI / 2, 0));
    world.addAABB(tx - 0.86, tx + 0.86, tz - 0.51, tz + 0.51, -5, 1, 'table');
    batch.add(M.whitePVC, cylGeo(0.02, 0.02, 2.3, 6), T(tx, 1.15, tz));
    batch.add(M.umbrella, new THREE.ConeGeometry(1.35, 0.42, 16, 1, true), T(tx, 2.3, tz));
    // red-brown lattice trellis at the end of the garden
    batch.add(M.lattice, new THREE.PlaneGeometry(2.4, 1.8), T(12.8, 0.95, H.lotSouth - 0.6));
    batch.add(M.woodDark, boxGeo(0.07, 1.95, 0.07), T(11.6, 0.97, H.lotSouth - 0.6));
    batch.add(M.woodDark, boxGeo(0.07, 1.95, 0.07), T(14.0, 0.97, H.lotSouth - 0.6));
    forest.add('bush', fx.bush, 16.5, py, 18.8, 2, 1.3);
    forest.add('bush', fx.bush, 7.4, py, 19.0, 1, 1.1);
  }

  // ---------------- side/back boundaries ----------------
  picketFence(batch, world, { x: W.EAST_FENCE, z0: H.gate[1] + 0.1, z1: 9.0, groundY: b + W.CURB_H, seed: 5 });
  meshFence(batch, world, { ax: H.lotBack, az: -6.05, bx: H.lotBack, bz: H.lotSouth, groundY: py });
  meshFence(batch, world, { ax: H.backX, az: -6.1, bx: H.lotBack, bz: -6.1, groundY: py });
  meshFence(batch, world, { ax: 3.98, az: H.lotSouth, bx: H.lotBack, bz: H.lotSouth, groundY: py });

  // backyard trees & a small shed
  forest.add('fruitTree', fx.fruitTree, 19, py, 3, 1.2, 0.9);
  forest.add('fruitTree', fx.fruitTree, 22.5, py, -2.5, 2.2, 0.8);
  forest.add('fruitTree', fx.fruitTree, 20.5, py, 14, 0.6, 1.0);
  batch.add(M.woodDark, boxGeo(2.4, 2.1, 2.0, 1), mat(24, py + 1.05, 9.5));
  batch.add(M.roofMetalGray, boxGeo(2.8, 0.05, 2.4, 1), mat(24, py + 2.15, 9.5, 0, 0, 0.12));
  world.addAABB(22.8, 25.2, 8.5, 10.5, -5, 3, 'shed');
}
