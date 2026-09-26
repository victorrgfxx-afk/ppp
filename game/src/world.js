import * as THREE from 'three';
import { W, baseHeight } from './config.js';
import { M } from './materials.js';
import { Batcher, rng, mat, boxGeo, cylGeo, tubeGeo } from './util.js';
import { buildStreet, buildGround, buildHills } from './terrain.js';
import { buildHero } from './hero.js';
import { genericHouse, addWindow, wallGeos, wallMatrix, FACE, hipRoof, gableRoof } from './buildings.js';
import { ironIvyFence, stoneWallChainFence, picketFence, panelFence, wallFence, fenceGate, plasterWall, boardGate } from './fences.js';
import { Forest, spruceArchetype, broadleafArchetype, buildGrass, sumacArchetype, yuccaArchetype, flowerArchetype } from './vegetation.js';
import { concretePole, wire } from './poles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const STREET = { zA: -262, zB: 192 };

// archetype factories (built once, instanced everywhere)
const fx = {
  spruce: () => spruceArchetype(11, 14, 2.9),
  spruceB: () => spruceArchetype(12, 10, 2.2),
  walnut: () => broadleafArchetype(21, { H: 10, crown: 4.2, trunkR: 0.3, density: 1.3 }),
  broad: () => broadleafArchetype(22, { H: 7.5, crown: 3.0, trunkR: 0.2 }),
  broadDark: () => broadleafArchetype(23, { H: 8.5, crown: 3.4, trunkR: 0.22, leafMat: 'leavesDark' }),
  fruitTree: () => broadleafArchetype(24, { H: 4.6, crown: 2.2, trunkR: 0.12 }),
  heroBush: () => broadleafArchetype(31, { H: 3.9, crown: 1.45, bush: true, density: 1.7 }),
  bush: () => broadleafArchetype(32, { H: 1.7, crown: 0.9, bush: true, density: 0.8 }),
  lambEar: () => broadleafArchetype(33, { H: 0.55, crown: 0.4, bush: true, leafMat: 'leavesSmall', density: 0.35 }),
  potPlant: () => broadleafArchetype(34, { H: 0.4, crown: 0.3, bush: true, leafMat: 'leavesSmall', density: 0.4 }),
  sumac: () => sumacArchetype(41, 4.3),
  flowers: () => flowerArchetype(43, 0.2, 0.15, 14),
  yucca: () => yuccaArchetype(42, 0.85),
  flowerBox: () => broadleafArchetype(35, { H: 0.22, crown: 0.2, bush: true, leafMat: 'leavesSmall', density: 0.3 }),
};

// Fences on sloped ground are built in short chunks that follow the street profile.
let CB = null, CW = null;
function chunked(fn, args, step = 4.8) {
  const { z0, z1 } = args;
  const n = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i < n; i++) {
    const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n;
    const off = args.x > 0 ? W.CURB_H : 0.04;
    fn(CB, CW, { ...args, z0: a, z1: b, groundY: baseHeight((a + b) / 2) + off, seed: (args.seed ?? 1) + i });
  }
}

function westT(zc) { return new THREE.Matrix4().makeTranslation(0, 0, 2 * zc).multiply(new THREE.Matrix4().makeRotationY(Math.PI)); }

export function buildWorld(scene, world, quality) {
  const batch = new Batcher();
  CB = batch; CW = world;
  const forest = new Forest(scene);
  const aprons = [{ z0: -5.45, z1: 6.75 }];
  const beds = [{ z0: 6.75, z1: 17.0 }];
  const westAprons = [{ z0: 2.4, z1: 12.6, x1: -4.3 }];
  const houses = [];      // for service drops / minimap
  const r = rng(2024);

  // ---------- photographed lots ----------
  buildHero(batch, world, forest, fx);
  houses.push({ side: 1, z0: -6, z1: 8.2, x: 7.7, drop: V(7.45, 5.05, -0.17), hero: true });

  // North neighbour: white single-storey house, spruce, green chain fence on a stone wall (photos 1, 2)
  chunked(stoneWallChainFence, { x: W.EAST_FENCE, z0: -26.5, z1: -5.8 });
  chunked(stoneWallChainFence, { x: W.EAST_FENCE, z0: -52, z1: -29.5 });
  aprons.push({ z0: -29.6, z1: -26.4 });
  fenceGate(batch, world, { x: W.EAST_FENCE, z0: -29.5, z1: -26.5, groundY: baseHeight(-28) + W.CURB_H, open: 0 });
  {
    const T = new THREE.Matrix4();
    const b = baseHeight(-15) + 0.3;
    const x0 = 7.4, x1 = 15.4, z0 = -21.5, z1 = -8.6;
    const ops = [[1.2, 2.5, 0.95, 2.3], [4.2, 5.1, 0.25, 2.35], [7.0, 8.3, 0.95, 2.3], [10.2, 11.5, 0.95, 2.3]];
    const Tf = wallMatrix(x0, b, z0, FACE.W);
    for (const g of wallGeos(z1 - z0, 2.95, ops, 1.5)) batch.add(M.stuccoWhite, g, Tf);
    for (const g of wallGeos(z1 - z0, 0.4, [], 1.2)) { g.translate(0, 0, 0.03); batch.add(M.stoneCladding, g, Tf); }
    ops.forEach((o, i) => addWindow(batch, Tf, o, i === 1 ? { door: true, frame: M.woodDark, doorMat: M.woodDark, reveal: M.stuccoWhite } : { frame: M.woodDark, glass: M.windowCurtain, reveal: M.stuccoWhite, sillMat: M.stuccoGrayLight }));
    for (const [face, ox, oz, L] of [[FACE.S, x0, z1, x1 - x0], [FACE.E, x1, z1, z1 - z0], [FACE.N, x1, z0, x1 - x0]]) {
      const Tw = wallMatrix(ox, b, oz, face);
      const o2 = [[L / 2 - 0.6, L / 2 + 0.6, 0.95, 2.3]];
      for (const g of wallGeos(L, 2.95, o2, 1.5)) batch.add(M.stuccoWhite, g, Tw);
      addWindow(batch, Tw, o2[0], { frame: M.woodDark, glass: M.windowCurtain, reveal: M.stuccoWhite });
    }
    batch.add(M.stuccoGray, boxGeo(x1 - x0, 1.2, z1 - z0), mat((x0 + x1) / 2, b - 0.6, (z0 + z1) / 2), { noCast: true });
    hipRoof(batch, T, { x0, x1, z0, z1, eave: b + 2.95, ridge: b + 5.2, mat: M.roofMetalGray, fascia: M.woodDark, gy: b });
    world.addAABB(x0, x1, z0, z1, -5, 8, 'house');
    // entrance lamp + yellow gas pipe along the facade (photo 2)
    batch.add(M.darkPlastic, boxGeo(0.12, 0.25, 0.12), mat(x0 - 0.08, b + 2.3, z0 + 5.35));
    batch.add(M.gasPipe, tubeGeo([V(x0 - 0.12, b + 2.2, z0 + 0.3), V(x0 - 0.12, b + 2.2, z1 - 0.8)], 0.03, 6));
    batch.add(M.gasPipe, cylGeo(0.03, 0.03, 2.1, 6), mat(x0 - 0.12, b + 1.15, z1 - 0.8));
    batch.add(M.concrete, boxGeo(3.7, 0.12, 2.5, 1.2), mat(5.55, b - 0.05, z0 + 4.7));
    world.addRegion(W.EAST_FENCE + 0.3, 24, -52, -6.1, 0.3);
    forest.add('spruce', fx.spruce, 11.5, b - 0.2, -24.5, 0.4, 1.0);
    forest.add('bush', fx.bush, 5.2, b, -9.5, 1, 1.1);
    forest.add('bush', fx.bush, 5.0, b, -14.5, 2, 0.8);
    forest.add('fruitTree', fx.fruitTree, 18.5, b, -12, 0, 1.0);
    houses.push({ side: 1, z0, z1, x: x0, drop: V(x0, b + 2.7, z0 + 2) });
  }
  // Second house north: dark wood-clad two-storey (far right in photo 1)
  {
    const T = new THREE.Matrix4();
    const zc = -41;
    const b = baseHeight(zc) + 0.3;
    const x0 = 8.2, x1 = 16.2, z0 = zc - 5, z1 = zc + 5;
    for (const [face, ox, oz, L, ops] of [
      [FACE.W, x0, z0, z1 - z0, [[1.4, 2.6, 1.0, 2.3], [4.2, 5.2, 0.3, 2.4], [7.2, 8.4, 1.0, 2.3], [1.4, 2.6, 3.9, 5.1], [7.2, 8.4, 3.9, 5.1]]],
      [FACE.S, x0, z1, x1 - x0, [[3.4, 4.6, 1.0, 2.3], [3.4, 4.6, 3.9, 5.1]]],
      [FACE.N, x1, z0, x1 - x0, [[3.4, 4.6, 3.9, 5.1]]],
      [FACE.E, x1, z1, z1 - z0, [[4.4, 5.6, 1.0, 2.3]]]]) {
      const Tw = wallMatrix(ox, b, oz, face);
      for (const g of wallGeos(L, 5.7, ops, 0.9)) batch.add(M.woodDark, g, Tw);
      ops.forEach((o) => addWindow(batch, Tw, o, o[2] < 0.5 ? { door: true, frame: M.woodLight, reveal: M.woodDark } : { frame: M.whitePVC, glass: M.windowCurtain, reveal: M.woodDark }));
    }
    batch.add(M.stuccoGray, boxGeo(x1 - x0, 1.4, z1 - z0), mat((x0 + x1) / 2, b - 0.7, zc), { noCast: true });
    gableRoof(batch, T, { x0, x1, z0, z1, eave: b + 5.7, ridge: b + 8.2, mat: M.roofMetalGray, gableWall: M.woodDark, gy: b });
    world.addAABB(x0, x1, z0, z1, -5, 12, 'house');
    forest.add('broad', fx.broad, 5.8, b, -48, 1, 0.9);
    houses.push({ side: 1, z0, z1, x: x0, drop: V(x0, b + 5.4, z0 + 1) });
  }

  // South neighbour: maroon picket fence, planted strip (photo 5)
  chunked(picketFence, { x: W.EAST_FENCE, z0: 9.0, z1: 27 });
  const bedY = W.CURB_H + 0.07;
  for (let z = 7.4; z < 16.6; z += 0.55) {
    forest.add('lambEar', fx.lambEar, 2.95 + r() * 0.35, bedY, z + r() * 0.3, r() * 6, 0.7 + r() * 0.6);
  }
  for (const [x, z, s] of [[3.35, 9.6, 1.0], [3.25, 13.4, 1.15], [3.45, 15.6, 0.8]]) forest.add('yucca', fx.yucca, x, bedY, z, z * 2, s);
  for (const [x, z, s] of [[3.45, 7.9, 1.2], [3.5, 11.6, 1.35], [3.4, 16.2, 1.0]]) forest.add('bush', fx.bush, x, bedY, z, z, s);
  forest.add('fruitTree', fx.fruitTree, 5.3, 0.25, 10.6, 0.3, 1.25);
  forest.add('broad', fx.broad, 6.2, 0.25, 16.5, 2.3, 0.8);

  // ---------- opposite side (west) as in photo 1 ----------
  chunked(picketFence, { x: W.WEST_FENCE, dir: -1, z0: -12.3, z1: 2.3, postMat: M.tealMetal, rounded: false, h: 1.55 });
  fenceGate(batch, world, { x: W.WEST_FENCE, dir: -1, z0: -13.35, z1: -12.35, groundY: 0.04, open: 0, style: 'picket' });
  chunked(panelFence, { x: W.WEST_FENCE, dir: -1, z0: -36, z1: -13.4 });
  {
    const zc = -7.5;
    const T = westT(zc);
    genericHouse(batch, world, T, { seed: 7, zc, fx: 9.5, width: 9.5, depth: 9, floors: 2, baseY: 0.34, wall: 'stuccoWhite', roof: 'roofMetalGray', roofType: 'gable' });
    // brick chimney visible above the roof in photo 1
    batch.add(M.brick, boxGeo(0.55, 2.2, 0.55, 0.6), mat(-13.2, 8.7, -10.2));
    for (const [x, z, s, t] of [[-6.2, -3.2, 1.1, 'walnut'], [-5.4, -9.8, 0.85, 'broad']]) forest.add(t, fx[t], x, 0.04, z, x * z, s);
    houses.push({ side: -1, z0: zc - 4.75, z1: zc + 4.75, x: -9.5, drop: V(-9.6, 5.5, zc - 3) });
    world.addRegion(-40, W.WEST_FENCE - 0.3, -40, 12, 0.3);
  }
  // Across from the gate: gray plaster wall, stone ledge, tile coping, wooden car gate,
  // pedestrian door no. 10 with a mailbox, wide concrete apron (photo 8)
  {
    const wx = -4.3, gy = 0.06;
    plasterWall(batch, world, { x: wx, z0: 2.35, z1: 2.75, groundY: gy, h: 1.95, ledge: false });
    boardGate(batch, world, { x: wx, z0: 2.75, z1: 6.25, groundY: gy, h: 2.05, peak: 0.32 });
    plasterWall(batch, world, { x: wx, z0: 6.25, z1: 6.6, groundY: gy, h: 1.95, ledge: false });
    plasterWall(batch, world, { x: wx, z0: 6.6, z1: 8.85, groundY: gy, h: 1.72 });
    batch.add(M.woodDark, boxGeo(0.14, 0.34, 0.3), mat(wx + 0.07, gy + 1.38, 8.55));
    boardGate(batch, world, { x: wx, z0: 8.85, z1: 9.8, groundY: gy, h: 1.92, peak: 0.2, board: 0.105, number: 'houseNo10', handle: true });
    plasterWall(batch, world, { x: wx, z0: 9.8, z1: 12.3, groundY: gy, h: 1.72 });
    genericHouse(batch, world, westT(8.5), { seed: 11, zc: 8.5, fx: 10.5, width: 10, depth: 8.5, floors: 1, baseY: 0.34, wall: 'stuccoCream', roof: 'roofMetalGray', roofType: 'hip' });
    houses.push({ side: -1, z0: 3.5, z1: 13.5, x: -10.5, drop: V(-10.6, 3.1, 5) });
    forest.add('walnut', fx.walnut, -7.2, 0.3, 11.8, 0.7, 1.05);
    forest.add('broad', fx.broad, -6.8, 0.3, 4.2, 2.1, 0.95);
    world.addRegion(-40, wx - 0.3, 2.3, 12.6, 0.3);
  }
  // then a grass verge and a maroon corrugated fence with a staghorn sumac (photo 7)
  chunked(panelFence, { x: -4.6, dir: -1, z0: 12.8, z1: 33.5, m: M.roofMetalRed });
  forest.add('sumac', fx.sumac, -5.6, 0.3, 21.5, 0.4, 1.0);
  forest.add('sumac', fx.sumac, -5.2, 0.3, 26.0, 2.0, 0.85);
  forest.add('bush', fx.bush, -3.9, 0.04, 14.2, 1.3, 1.1);
  forest.add('bush', fx.bush, -4.1, 0.04, 30.5, 0.2, 0.9);
  genericHouse(batch, world, westT(24), { seed: 12, zc: 24, fx: 12, width: 11, depth: 9, floors: 1, baseY: 0.34, wall: 'stuccoPeach', roof: 'roofMetalBrown', roofType: 'gable' });
  houses.push({ side: -1, z0: 18.5, z1: 29.5, x: -12, drop: V(-12.1, 3.1, 20) });
  world.addRegion(-40, -4.9, 12.6, 34, 0.3);
  {
    const zc = -25;
    genericHouse(batch, world, westT(zc), { seed: 8, zc, fx: 8.5, width: 10, depth: 8, floors: 1, baseY: 0.34, wall: 'stuccoCream', roof: 'roofMetalBrown', roofType: 'hip' });
    forest.add('broad', fx.broad, -6.5, 0.04, -31, 0.5, 0.9);
    houses.push({ side: -1, z0: zc - 5, z1: zc + 5, x: -8.5, drop: V(-8.6, 3.2, zc + 2) });
  }

  // ---------- generic lots filling the rest of the street ----------
  const fenceKinds = ['picket', 'chain', 'panel', 'black', 'wall', 'picket', 'chain'];
  const genLot = (side, z0, z1, seed) => {
    const lr = rng(seed);
    const zc = (z0 + z1) / 2;
    const fxw = side > 0 ? W.EAST_FENCE : W.WEST_FENCE;
    const kind = lr.pick(fenceKinds);
    const gateW = 3.2;
    const gz = lr() < 0.5 ? z0 + 1.2 : z1 - 1.2 - gateW;
    const args = { x: fxw, dir: side, seed };
    const segs = [[z0 + 0.1, gz], [gz + gateW, z1 - 0.1]];
    for (const [a, b] of segs) {
      if (b - a < 0.5) continue;
      if (kind === 'picket') chunked(picketFence, { ...args, z0: a, z1: b, postMat: lr() < 0.4 ? M.tealMetal : null, rounded: lr() < 0.6 });
      else if (kind === 'chain') chunked(stoneWallChainFence, { ...args, z0: a, z1: b });
      else if (kind === 'panel') chunked(panelFence, { ...args, z0: a, z1: b, m: lr() < 0.5 ? M.tealPanel : M.roofMetalBrown });
      else if (kind === 'black') chunked((bb, ww, o) => ironIvyFence(bb, ww, { ...o, panels: Math.max(1, Math.round((o.z1 - o.z0) / 2.4)), ivy: false, lamps: false, spacing: 0.13, simpleTips: true }), { ...args, z0: a, z1: b }, 5);
      else chunked(wallFence, { ...args, z0: a, z1: b, m: M[lr.pick(['stuccoCream', 'stuccoWhite', 'stuccoPeach'])] });
    }
    const gy = baseHeight(gz + gateW / 2) + (side > 0 ? W.CURB_H : 0.04);
    fenceGate(batch, world, { x: fxw, dir: side, z0: gz, z1: gz + gateW, groundY: gy, open: 0, style: kind === 'picket' ? 'picket' : 'black' });
    if (side > 0) aprons.push({ z0: gz - 0.2, z1: gz + gateW + 0.2 });
    const b = baseHeight(zc) + 0.3;
    const setback = lr.range(3.5, 9);
    const width = Math.min(z1 - z0 - 4, lr.range(8.5, 13));
    const hzc = zc + lr.range(-1, 1) * (z1 - z0 - width - 4) / 2;
    const T = side > 0 ? new THREE.Matrix4() : westT(hzc);
    const fxLocal = Math.abs(fxw) + setback;
    const h = genericHouse(batch, world, T, { seed: seed * 3 + 1, zc: hzc, fx: fxLocal, width, baseY: b });
    // foundation hides slope gaps
    batch.add(M.stuccoGray, boxGeo(h.x1 - h.x0, 1.6, width), new THREE.Matrix4().multiplyMatrices(T, mat((h.x0 + h.x1) / 2, b - 0.8, hzc)), { noCast: true });
    houses.push({ side, z0: hzc - width / 2, z1: hzc + width / 2, x: side * fxLocal, drop: V(side * (fxLocal + 0.05), h.eave - 0.3, hzc - width / 2 + 1) });
    // yard trees
    const nt = lr.int(1, 3);
    for (let i = 0; i < nt; i++) {
      const tz = lr.range(z0 + 1.5, z1 - 1.5);
      const tx = side * lr.range(Math.abs(fxw) + 1.2, Math.abs(fxw) + setback - 0.8);
      if (setback < 3) continue;
      const t = lr.pick(['broad', 'fruitTree', 'broadDark', 'walnut', 'spruceB', 'fruitTree']);
      forest.add(t, fx[t], tx, baseHeight(tz) + 0.1, tz, lr() * 6, lr.range(0.75, 1.1));
    }
    const bt = lr.pick(['broad', 'walnut', 'spruce', 'broadDark', 'fruitTree']);
    forest.add(bt, fx[bt], side * (fxLocal + lr.range(10, 14)), b - 0.1, lr.range(z0 + 2, z1 - 2), lr() * 6, lr.range(0.8, 1.15));
  };
  // east
  let seed = 100;
  for (let z = -52; z > STREET.zA + 20;) { const w = r.range(16, 22); genLot(1, z - w, z, seed++); z -= w; }
  for (let z = 27; z < STREET.zB - 20;) { const w = r.range(16, 22); genLot(1, z, z + w, seed++); z += w; }
  // west
  for (let z = -36; z > STREET.zA + 20;) { const w = r.range(16, 22); genLot(-1, z - w, z, seed++); z -= w; }
  for (let z = 34; z < STREET.zB - 20;) { const w = r.range(16, 22); genLot(-1, z, z + w, seed++); z += w; }

  // ---------- street surface ----------
  buildStreet(batch, world, { zA: STREET.zA, zB: STREET.zB, aprons, beds, westAprons });
  for (const a of aprons.slice(1)) world.addRegion(W.CURB_X1, W.EAST_FENCE, a.z0, a.z1, 0, (x, z, bb) => bb + W.CURB_H + (x - W.CURB_X1) * 0.05);
  buildGround(batch);

  // ---------- poles, wires, street lamps ----------
  const westZ = [-15.8, -52, -88, -124, -160, -196, -232].sort((a, b) => a - b);
  // south of the house the line runs on the east side, with LED street lamps (photos 6-8)
  const eastZ = [-5.9, -40, -76, -112, -148, -184, -220, 30, 58, 86, 114, 142, 170].sort((a, b) => a - b);
  const wp = westZ.map((z, i) => concretePole(batch, world, -2.95, z, { h: 12, type: 'MV', lamp: i % 2 === 0 ? 1 : 0 }));
  const ep = eastZ.map((z) => concretePole(batch, world, 3.3, z, { h: z === -5.9 ? 9.4 : 9.6, type: 'SC', lamp: z > 0 ? -1 : 0 }));
  const lamps = [...wp, ...ep].filter(p => p.lampHead).map(p => p.lampHead);
  for (let i = 0; i < wp.length - 1; i++) {
    const a = wp[i], b = wp[i + 1];
    for (const ox of [-0.9, 0, 0.9]) wire(batch, V(a.x + ox, a.top - 0.1, a.z), V(b.x + ox, b.top - 0.1, b.z), 0.9, 0.01);
    wire(batch, V(a.x + 0.12, a.top - 2.3, a.z), V(b.x + 0.12, b.top - 2.3, b.z), 0.55, 0.022);
    wire(batch, V(a.x - 0.1, a.top - 1.3, a.z), V(b.x - 0.1, b.top - 1.3, b.z), 0.7, 0.009);
  }
  for (let i = 0; i < ep.length - 1; i++) {
    const a = ep[i], b = ep[i + 1];
    for (const ox of [-0.12, 0.12]) wire(batch, V(a.x + ox, a.top - 0.25, a.z), V(b.x + ox, b.top - 0.25, b.z), 0.6, 0.01);
    wire(batch, V(a.x, a.top - 1.0, a.z), V(b.x, b.top - 1.0, b.z), 0.5, 0.02);
  }
  // wires crossing the street diagonally (photo 1 has lots of them)
  for (const e of ep.filter(q => q.z < 0)) {
    const w = wp.reduce((best, p) => Math.abs(p.z - e.z) < Math.abs(best.z - e.z) ? p : best, wp[0]);
    wire(batch, V(w.x, w.top - 2.3, w.z), V(e.x, e.top - 0.3, e.z), 0.35, 0.012);
    wire(batch, V(w.x - 0.9, w.top - 0.1, w.z), V(e.x, e.top - 1.0, e.z), 0.5, 0.009);
  }
  // service drops to every house from the nearest pole on its side (or across)
  for (const h of houses) {
    const list = h.side > 0 ? ep : wp;
    const zc = (h.z0 + h.z1) / 2;
    const p = list.reduce((best, q) => Math.abs(q.z - zc) < Math.abs(best.z - zc) ? q : best, list[0]);
    if (Math.abs(p.z - zc) > 45) continue;
    wire(batch, V(p.x, p.top - (h.side > 0 ? 1.0 : 2.3), p.z), h.drop, 0.3, 0.009);
  }

  // ---------- build meshes ----------
  const meshes = batch.build(scene, 120);
  forest.build();

  // grass on the verges / strips
  const areas = [
    { x0: W.WEST_FENCE + 0.05, x1: -W.ROAD_HALF - 0.08, z0: -150, z1: 2.3, d: 30 },
    { x0: W.WEST_FENCE + 0.05, x1: -W.ROAD_HALF - 0.08, z0: 12.7, z1: 110, d: 30 },
    { x0: W.EAST_FENCE - 0.35, x1: W.EAST_FENCE - 0.02, z0: -52, z1: -5.9, d: 14, s: 1.2 },
    { x0: 2.75, x1: 3.68, z0: 6.9, z1: 27, d: 26 },
    { x0: 16.0, x1: 25.8, z0: -5.8, z1: 8.6, d: 9 },
    { x0: 4.2, x1: 25.8, z0: 9.0, z1: 19.8, d: 10 },
    { x0: 4.4, x1: 5.4, z0: -5.4, z1: -2.35, d: 18 },
    { x0: W.EAST_FENCE - 0.3, x1: W.EAST_FENCE - 0.02, z0: 27, z1: 110, d: 16, s: 1.4 },
    { x0: W.EAST_FENCE - 0.3, x1: W.EAST_FENCE - 0.02, z0: -150, z1: -52, d: 16, s: 1.4 },
  ];
  const grass = buildGrass(scene, areas, quality.grass, (x, z) => world.groundHeight(x, z));
  buildHills(scene);
  return { meshes, lamps, houses, grass };
}
