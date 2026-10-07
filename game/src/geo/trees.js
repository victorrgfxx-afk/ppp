import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt, forestCode, inHole, speciesAt, speciesCompanion } from './data.js';
import { M, addWind } from '../materials.js';
import { rng } from '../util.js';

// ~90 000 trees placed from the map (forests, orchards, riverside willows, yard trees where
// Sentinel-2 shows vegetation). Near: light 3D trees per 200 m chunk; far: impostor billboards
// rendered from the same models. A vertex-shader distance switch avoids drawing both.

const TYPES = [
  { name: 'oak', H: 15, crown: 5.0, trunkR: 0.34, cards: 115, leaf: 'leavesDark', tint: 0xb9c7a3 },
  { name: 'hornbeam', H: 12, crown: 3.8, trunkR: 0.24, cards: 100, leaf: 'leaves', tint: 0xc4d0a8 },
  { name: 'spruce', H: 17, crown: 3.0, conifer: true },
  { name: 'fruit', H: 5.2, crown: 2.4, trunkR: 0.13, cards: 80, leaf: 'leavesSmall', tint: 0xd8e0c0 },
  { name: 'walnut', H: 13, crown: 5.4, trunkR: 0.36, cards: 115, leaf: 'leaves', tint: 0xb4c49c },
  { name: 'willow', H: 11, crown: 4.0, trunkR: 0.3, cards: 100, leaf: 'leavesSmall', tint: 0xc8d7a0, droop: true },
  // forest-grown trees of the mapped stands (generated around the player): tall clear boles, high crowns
  { name: 'beech', H: 23, crown: 4.3, trunkR: 0.3, cards: 125, leaf: 'leaves', tint: 0xbccb98, bole: 0.5, bark: 'barkLight' },
  { name: 'oak (forest)', H: 20, crown: 4.7, trunkR: 0.36, cards: 130, leaf: 'leavesDark', tint: 0xaabd92, bole: 0.44 },
  { name: 'hornbeam (forest)', H: 16, crown: 3.5, trunkR: 0.22, cards: 105, leaf: 'leaves', tint: 0xc6d2a4, bole: 0.4 },
  { name: 'spruce (forest)', H: 26, crown: 3.3, conifer: true, low: 7 },
  { name: 'black pine', H: 19, crown: 3.4, pine: true },
  { name: 'shrub', H: 2.6, crown: 1.5, trunkR: 0.05, cards: 34, leaf: 'leaves', tint: 0xd2dcae, bole: 0.1, noImpostor: true },
  // stand edges: trees in the light keep their branches down to the ground (a wall of leaves, not a row of poles)
  { name: 'edge broadleaf', H: 13, crown: 4.4, trunkR: 0.26, cards: 140, leaf: 'leaves', tint: 0xb6c895, bole: 0.13 },
  // Strada Gării (photos 46-48): Lombardy poplars (narrow columns), a black poplar (tall oval), young planted pines
  { name: 'lombardy poplar', H: 26, crown: 2.5, trunkR: 0.34, cards: 180, leaf: 'leaves', tint: 0xb2c294, bole: 0.14 },
  { name: 'poplar', H: 25, crown: 4.2, trunkR: 0.42, cards: 170, leaf: 'leaves', tint: 0xb6c698, bole: 0.2 },
  { name: 'young pine', H: 8.5, crown: 2.3, conifer: true, low: 1.9 },
  // the wood of the user's clip IMG_0725 in mid-October (geo/urcus.js): broadleaves gone yellow, a birch
  { name: 'autumn broadleaf', H: 16, crown: 4.6, trunkR: 0.3, cards: 150, leaf: 'leavesAutumn', tint: 0xffffff, bole: 0.28 },
  { name: 'autumn birch', H: 15, crown: 3.1, trunkR: 0.19, cards: 115, leaf: 'leavesAutumn', tint: 0xfff4dc, bole: 0.36, bark: 'barkLight' },
  // and the wood there (forest-grown, as the stands' beech and hornbeam): beech turning orange and yellow, hornbeam yellow
  { name: 'autumn beech (forest)', H: 22, crown: 4.3, trunkR: 0.3, cards: 125, leaf: 'leavesAutumn', tint: 0xffe2c0, bole: 0.48, bark: 'barkLight' },
  { name: 'autumn hornbeam (forest)', H: 16, crown: 3.5, trunkR: 0.22, cards: 105, leaf: 'leavesAutumn', tint: 0xf4f6d6, bole: 0.4 },
  // black locust (Robinia, planted on the eroded slopes and by the villages): airy crown of pinnate light leaves, dark
  // bark; at the stand edges (as along DN1 at Cornu, KartaView July 2016) leafy down to a few metres
  { name: 'black locust (forest)', H: 18, crown: 3.7, trunkR: 0.24, cards: 105, leaf: 'leavesPinnate', tint: 0xd6e2a6, bole: 0.42 },
  { name: 'edge black locust', H: 14, crown: 4.0, trunkR: 0.22, cards: 125, leaf: 'leavesPinnate', tint: 0xd6e2a6, bole: 0.18 },
];
export const TREE_T = { oak: 0, hornbeam: 1, spruceLow: 2, beech: 6, oakF: 7, hornbeamF: 8, spruceF: 9, pine: 10, shrubTall: 11, edge: 12, autumn: 16, autumnBirch: 17, autumnBeechF: 18, autumnHornbeamF: 19, robinia: 20, robiniaEdge: 21 };
const T_BEECH = 6, T_OAK = 7, T_HORN = 8, T_SPRUCE = 9, T_PINE = 10, T_SHRUB = 11, T_EDGE = 12, T_SPRUCE_LOW = 2, T_ROBINIA = 20, T_ROBINIA_EDGE = 21;
// genus groups of species.json (data.js) -> forest tree type: Fagus, Quercus, Carpinus, Abies, Picea, Pinus, Populus,
// Robinia, Salix, Tilia, other deciduous (maples, ash, cherry ...), other evergreen
const GENUS_T = [0, T_BEECH, T_OAK, T_HORN, T_SPRUCE, T_SPRUCE, T_PINE, 14, T_ROBINIA, 5, T_HORN, T_HORN, T_SPRUCE];
const GENUS_CONIFER = [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1];
// understory under each genus: beech casts the deepest shade (a bare floor), oak and black locust stands are full of
// hazel, hawthorn and dogwood
const GENUS_SHRUB = [1, 0.45, 1, 0.65, 0.5, 0.5, 0.6, 0.9, 1, 0.9, 0.7, 0.8, 0.5];

function cyl(p0, p1, r0, r1, seg) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(p0.x, p0.y, p0.z);
  return g.toNonIndexed();
}
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };

function broadModel(t, seed) {
  const r = rng(seed);
  const wood = [], cards = [];
  const bole = t.bole ?? 0.4, vr = t.H * 0.34 * (1 - bole) / 0.6;          // crown base and vertical radius
  const top = new THREE.Vector3(0, t.H * bole, 0);
  wood.push(cyl(new THREE.Vector3(0, -0.3, 0), top, t.trunkR, t.trunkR * 0.7, 6));
  const ends = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + r() * 0.6;
    const e = top.clone().add(new THREE.Vector3(Math.cos(a) * t.crown * 0.55, vr * 0.74, Math.sin(a) * t.crown * 0.55));
    wood.push(cyl(top, e, t.trunkR * 0.55, t.trunkR * 0.2, 5));
    ends.push(e);
  }
  const c = new THREE.Vector3(0, t.H * bole + vr * 0.65, 0);
  for (let i = 0; i < t.cards; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.pow(r(), 0.45);
    const p = c.clone().add(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th) * t.crown * rr, u * vr * rr, Math.sqrt(1 - u * u) * Math.sin(th) * t.crown * rr));
    if (t.droop) p.y -= (1 - rr) * 0.5 + Math.max(0, rr - 0.6) * 1.2;
    const s = t.crown * 0.7 * (0.75 + r() * 0.5);
    const g = new THREE.PlaneGeometry(s, s * (t.droop ? 1.4 : 1));
    const out = p.clone().sub(c).setY(0).normalize();
    g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.5 + (t.droop ? 1.0 : 0));
    g.rotateY(Math.atan2(out.x, out.z) + (r() - 0.5) * 1.2);
    g.translate(p.x, p.y, p.z);
    // normals pointing out of the crown: soft, volumetric lighting
    const nrm = g.attributes.normal, pos = g.attributes.position;
    for (let k = 0; k < nrm.count; k++) {
      const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).normalize();
      v.y = v.y * 0.7 + 0.4; v.normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
    cards.push(clean(g));
  }
  // dark, slightly lumpy inner volume so the crown reads as a solid mass from a distance
  const parts = [[mergeGeometries(wood.map(clean)), t.bark ?? 'bark'], [mergeGeometries(cards), 'leaf']];
  if (t.crown > 3) {
    const core = new THREE.IcosahedronGeometry(1, 1);
    const cp = core.attributes.position, cn = core.attributes.normal;
    for (let k = 0; k < cp.count; k++) {
      const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k);
      const f = 0.85 + 0.2 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.3);
      cp.setXYZ(k, x * t.crown * 0.5 * f, y * vr * 0.65 * f + c.y, z * t.crown * 0.5 * f);
      const v = new THREE.Vector3(x, y * 0.7 + 0.35, z).normalize();
      cn.setXYZ(k, v.x, v.y, v.z);                       // smooth, sky-facing normals
    }
    parts.splice(1, 0, [clean(core), 'crown']);
  }
  return parts;
}

function spruceModel(t, seed) {
  const r = rng(seed);
  const cards = [];
  const low = t.low ?? 1.3;                         // forest spruces shed their lower whorls
  const core = new THREE.ConeGeometry(t.crown * 0.42, t.H - low - 0.3, 8, 4);
  core.translate(0, low + 0.3 + (t.H - low - 0.3) / 2, 0);
  for (let y = low; y < t.H - 0.4; y += 0.85) {
    const k = (y - low + 0.1) / (t.H - low + 0.1), R = t.crown * Math.pow(1 - k, 0.9) + 0.35;
    const nW = 7 + Math.round(3 * (1 - k));
    for (let i = 0; i < nW; i++) {
      const a = i / nW * Math.PI * 2 + r() * 0.8;
      const g = new THREE.PlaneGeometry(R * 1.05, R * 1.25);
      g.translate(0, R * 0.55, 0);
      g.rotateX(-(Math.PI / 2 + 0.35));
      g.rotateY(a);
      g.translate(0, y, 0);
      cards.push(clean(g));
    }
  }
  const trunk = cyl(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, t.H * 0.9, 0), 0.3, 0.05, 6);
  return [[clean(trunk), 'bark'], [clean(core.toNonIndexed()), 'core'], [mergeGeometries(cards), 'fir']];
}

// Black pine (Pinus nigra), planted on the eroded hills around Câmpina (photos 17, 23): long straight
// bole, flat-topped crown of dark needle clumps in the top third.
function pineModel(t, seed) {
  const r = rng(seed);
  const wood = [], cards = [];
  const base = t.H * 0.6;
  wood.push(cyl(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, t.H * 0.96, 0), 0.27, 0.07, 6));
  const clumps = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4 + r() * 0.8, k = r();
    const y = base + 0.8 + k * (t.H - base - 1.6);
    const rad = t.crown * (0.35 + 0.65 * r()) * (1 - 0.45 * k);
    const p = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);
    clumps.push(p);
    wood.push(cyl(new THREE.Vector3(0, y - 0.9, 0), p, 0.07, 0.03, 4));
    for (let q = 0; q < 6; q++) {
      const s = 1.5 + r() * 0.9;
      const g = new THREE.PlaneGeometry(s * 1.3, s);
      g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.1);
      g.rotateY(r() * Math.PI * 2);
      g.translate(p.x + (r() - 0.5) * 0.8, p.y + (r() - 0.3) * 0.5, p.z + (r() - 0.5) * 0.8);
      const nrm = g.attributes.normal, pos = g.attributes.position;
      for (let m = 0; m < nrm.count; m++) {
        const v = new THREE.Vector3(pos.getX(m), (pos.getY(m) - (base + t.H) / 2) * 0.6 + 0.8, pos.getZ(m)).normalize();
        nrm.setXYZ(m, v.x, v.y, v.z);
      }
      cards.push(clean(g));
    }
  }
  const core = new THREE.SphereGeometry(1, 8, 5);
  const cp = core.attributes.position;
  for (let k = 0; k < cp.count; k++) cp.setXYZ(k, cp.getX(k) * t.crown * 0.62, cp.getY(k) * (t.H - base) * 0.3 + base + (t.H - base) * 0.55, cp.getZ(k) * t.crown * 0.62);
  return [[mergeGeometries(wood.map(clean)), 'bark'], [clean(core), 'core'], [mergeGeometries(cards), 'fir']];
}

// ---- distance switch in the vertex shader (per instance) ----
// near side: hidden beyond `near`; far side: hidden inside `near` and (dithered per tree) beyond `far`
function withSwitch(material, near, farSide, key, far = 0) {
  const m = material.clone();
  const prev = material.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uSwitch = { value: near };
    sh.uniforms.uFar = { value: far };
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  { vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float dd = distance(ip.xz, cameraPosition.xz);
    float hh = fract(sin(dot(floor(ip.xz), vec2(12.9898, 78.233))) * 43758.5453);
    if (${farSide ? 'dd < uSwitch || (uFar > 0.0 && dd > uFar * (0.78 + 0.22 * hh))' : 'dd > uSwitch'}) transformed *= 0.0; }
#endif`).replace('#include <common>', '#include <common>\nuniform float uSwitch, uFar;');
  };
  m.customProgramCacheKey = () => key + (material.customProgramCacheKey ? material.customProgramCacheKey() : '');
  return m;
}

function bakeImpostor(renderer, parts, t) {
  const size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const sc = new THREE.Scene();
  for (const [g, mat] of parts) sc.add(new THREE.Mesh(g, mat));
  sc.add(new THREE.HemisphereLight(0xe8eef4, 0x4a4a3a, 1.6));
  const dl = new THREE.DirectionalLight(0xfff4e0, 1.8); dl.position.set(0.5, 1, 0.8); sc.add(dl);
  const S = Math.max(2 * (t.crown * 1.15 + 0.4), t.H * 1.04 + 0.3);
  const cam = new THREE.OrthographicCamera(-S / 2, S / 2, S - 0.3, -0.3, 0.1, 100);
  cam.position.set(0, 0, 40); cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x3d4a30, 0);
  renderer.clear();
  renderer.render(sc, cam);
  renderer.setRenderTarget(prevT);
  renderer.setClearColor(prevC, prevA);
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return { tex: rt.texture, halfW: S / 2, H: S, y0: -0.3 };
}

export function buildTrees(scene, world, renderer, quality) {
  const T = GEO.trees;
  const density = quality.label === 'Scăzută' ? 0.35 : quality.label === 'Medie' ? 0.65 : 1;
  const nearR = { 'Scăzută': 110, 'Medie': 150, 'Înaltă': 200 }[quality.label] ?? 260;
  const mats = {
    bark: M.bark, core: M.firCore, fir: M.fir,
    crown: new THREE.MeshStandardMaterial({ color: 0x3a4b2c, roughness: 1 }),
    barkLight: M.bark.clone(),
  };
  mats.barkLight.color = new THREE.Color(0xc9c4ba);             // smooth grey beech bark
  M.bark.userData.bark = mats.barkLight.userData.bark = true;
  mats.crown.userData.core = true;
  const models = TYPES.map((t, i) => {
    const parts = t.pine ? pineModel(t, 50 + i) : t.conifer ? spruceModel(t, 50 + i) : broadModel(t, 50 + i);
    const leaf = M[t.leaf] ?? M.leaves;
    const pm = parts.map(([g, k]) => [g, k === 'leaf' ? leaf : mats[k]]);
    const imp = t.noImpostor ? null : bakeImpostor(renderer, pm, t);
    return { t, parts: pm, imp };
  });
  // compact per-tree arrays + chunk lists (near: 300 m, far impostors: 1500 m)
  const n = T.n, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), R = new Float32Array(n), S = new Float32Array(n), V = new Float32Array(n), TY = new Uint8Array(n);
  const CH = 300, FCH = 1500, near = new Map(), far = new Map(), cell = new Map(), CELL = 16;
  const r = rng(99);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (density < 1 && !T.keep?.[i] && r() > density) continue;             // (keep: trees a place needs at every quality)
    if (T.s[i] <= 0 || inHole(T.x[i], T.z[i])) { r(); r(); r(); continue; }      // (scale 0: a tree a place has removed)
    const k = count++;
    X[k] = T.x[i]; Z[k] = T.z[i]; Y[k] = heightAt(X[k], Z[k]) - 0.05;
    TY[k] = Math.min(TYPES.length - 1, T.t[i]); R[k] = r() * Math.PI * 2; S[k] = T.s[i] * (0.9 + r() * 0.2); V[k] = 0.85 + r() * 0.3;
    const push = (map, key, cx, cz) => { let c = map.get(key); if (!c) { c = { cx, cz, idx: [] }; map.set(key, c); } c.idx.push(k); };
    const ci = Math.floor(X[k] / CH), cj = Math.floor(Z[k] / CH);
    push(near, ci + ',' + cj, (ci + 0.5) * CH, (cj + 0.5) * CH);
    const fi = Math.floor(X[k] / FCH), fj = Math.floor(Z[k] / FCH);
    push(far, fi + ',' + fj, 0, 0);
    const key = Math.floor(X[k] / CELL) + ',' + Math.floor(Z[k] / CELL);
    let l = cell.get(key); if (!l) { l = []; cell.set(key, l); } l.push(k);
  }
  // trunk colliders on demand (a static box per tree would cost ~300k objects)
  const pool = [];
  world.addProvider((qx, qz, qr, out) => {
    let used = 0;
    for (let i = Math.floor((qx - qr) / CELL); i <= Math.floor((qx + qr) / CELL); i++) for (let j = Math.floor((qz - qr) / CELL); j <= Math.floor((qz + qr) / CELL); j++) {
      const l = cell.get(i + ',' + j); if (!l) continue;
      for (const k of l) {
        if (Math.abs(X[k] - qx) > qr + 1 || Math.abs(Z[k] - qz) > qr + 1) continue;
        const tr = (TYPES[TY[k]].trunkR ?? 0.3) * S[k] + 0.05;
        let b = pool[used];
        if (!b) { b = new world.Box(0, 0, 1, 1, 0, 0, 1, 'tree'); pool.push(b); }
        b.x = X[k]; b.z = Z[k]; b.hw = b.hd = tr; b.rot = 0; b.y0 = Y[k] - 1; b.y1 = Y[k] + 8; b.update();
        out.push(b); used++;
      }
    }
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const setInst = (im, k, j, tint, leafy) => {
    im.setMatrixAt(j, m4.compose(p.set(X[k], Y[k], Z[k]), q.setFromAxisAngle(up, R[k]), sv.setScalar(S[k])));
    im.setColorAt(j, leafy ? c.setHex(tint).multiplyScalar(V[k]) : c.setScalar(0.8 + 0.2 * V[k]));
  };
  // near 3D models: built lazily the first time a chunk comes close
  const nearMats = new Map();
  const nearMat = (mat) => { if (!nearMats.has(mat)) nearMats.set(mat, withSwitch(mat, nearR, false, 'near')); return nearMats.get(mat); };
  const buildNear = (ch) => {
    const grp = new THREE.Group();
    const byType = TYPES.map(() => []);
    for (const k of ch.idx) byType[TY[k]].push(k);
    byType.forEach((list, ty) => {
      if (!list.length) return;
      for (const [g, mat] of models[ty].parts) {
        if (mat.userData.core) continue;                 // the dark inner volume is only for the impostors
        const leafy = mat !== M.bark;
        const im = new THREE.InstancedMesh(g, nearMat(mat), list.length);
        list.forEach((k, j) => setInst(im, k, j, TYPES[ty].tint ?? 0xffffff, leafy));
        im.castShadow = true; im.receiveShadow = true;
        im.userData.noAO = true;
        im.computeBoundingSphere();
        grp.add(im);
      }
    });
    grp.userData.ueSkip = 'trees';
    scene.add(grp);
    return grp;
  };
  // far impostors: 3 crossed quads per tree, one InstancedMesh per 1.5 km chunk and type (frustum culled)
  const impGeo = models.map(({ imp }) => {
    if (!imp) return null;
    const quads = [];
    for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      const g = new THREE.PlaneGeometry(imp.halfW * 2, imp.H);
      g.translate(0, imp.H / 2 + imp.y0, 0);
      g.rotateY(a);
      const nn = g.attributes.normal; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0);
      quads.push(g);
    }
    return mergeGeometries(quads);
  });
  const farList = [];
  const farCull = { 'Scăzută': 3200, 'Medie': 4300, 'Înaltă': 5500 }[quality.label] ?? 6500;   // impostor chunks fade into the ground colour
  const impMat = models.map(({ imp }) => imp && withSwitch(new THREE.MeshStandardMaterial({ map: imp.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff }), nearR, true, 'far'));
  for (const ch of far.values()) {
    const byType = TYPES.map(() => []);
    for (const k of ch.idx) byType[TY[k]].push(k);
    byType.forEach((list, ty) => {
      if (!list.length || !impGeo[ty]) return;                   // (shrubs have no impostor: none far away)
      const im = new THREE.InstancedMesh(impGeo[ty], impMat[ty], list.length);
      list.forEach((k, j) => {
        im.setMatrixAt(j, m4.compose(p.set(X[k], Y[k], Z[k]), q.setFromAxisAngle(up, R[k]), sv.setScalar(S[k])));
        im.setColorAt(j, c.setScalar(V[k]));
      });
      im.computeBoundingSphere();
      im.castShadow = false; im.receiveShadow = true;
      im.userData.noAO = true;
      im.userData.ueSkip = 'trees';
      scene.add(im);
      farList.push({ im, c: im.boundingSphere.center, r: im.boundingSphere.radius });
    });
  }
  const nearList = [...near.values()];
  const forest = buildForest(scene, world, quality, { models, impGeo, withSwitch, setInst });
  return {
    count,
    forest,
    // everything the Unreal export needs (tools/export-unreal.mjs): the models and every mapped tree as placed here
    exportData: { TYPES, models, count, X, Y, Z, R, S, V, TY },
    update(camPos) {
      forest.update(camPos);
      for (const f of farList) f.im.visible = Math.hypot(f.c.x - camPos.x, f.c.z - camPos.z) - f.r < farCull;
      const reach = nearR + CH * 0.75;
      for (const ch of nearList) {
        const inside = Math.hypot(ch.cx - camPos.x, ch.cz - camPos.z) < reach;
        if (inside && !ch.grp) ch.grp = buildNear(ch);
        if (ch.grp) ch.grp.visible = inside;
      }
    },
  };
}

// ------------------------------------------------------------------ procedural forest
// The mapped stands (geo/build_geo.py -> forest.json, 5 m cells: broadleaved / mixed / needleleaved) are filled
// with trees generated around the player from a hash of their 5.2 m cell, so every forest is dense and the
// same each time: 3D trees and understory near, impostors to ~1 km, the canopy shell (canopy.js) beyond.
export const FOREST_Q = { 'Scăzută': { imp: 520, near: 75, shrub: 0 }, 'Medie': { imp: 820, near: 105, shrub: 45 }, 'Înaltă': { imp: 1100, near: 140, shrub: 70 } };

function hash3(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function valueNoise2(x, z, cell, s) {
  const fx = x / cell, fz = z / cell, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash3(i, j, s), b = hash3(i + 1, j, s), c = hash3(i, j + 1, s), d = hash3(i + 1, j + 1, s);
  return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}

const SP = 5.2, GT = 280, ST = 70, SSP = 7.5;
// places that set their own stand composition (urcus.js: the wood around the clip IMG_0725):
// fn(x, z, type, edge, code, h1, h2) -> type, with h1 and h2 two hashes of the tree's cell
const MIX = [];
export function addForestMix(fn) { MIX.push(fn); }
// every forest tree in [x0, x1) x [z0, z1): cb(x, z, type, scale, rotation, brightness)
function eachForestTree(x0, z0, x1, z1, cb) {
  for (let j = Math.floor(z0 / SP); j <= Math.floor(z1 / SP); j++) for (let i = Math.floor(x0 / SP); i <= Math.floor(x1 / SP); i++) {
    if (hash3(i, j, 1) > 0.93) continue;
    const x = (i + 0.5 + (hash3(i, j, 2) - 0.5) * 0.9) * SP, z = (j + 0.5 + (hash3(i, j, 3) - 0.5) * 0.9) * SP;
    if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
    const code = forestCode(x, z);
    if (!code) continue;
    const edge = !forestCode(x + 8, z) || !forestCode(x - 8, z) || !forestCode(x, z + 8) || !forestCode(x, z - 8);
    const sp = speciesAt(x, z), g = sp & 15;
    let ty;
    if (g && g < 13) {
      // the mapped genus (Romanian genus map 2025): it leads with >= 80 % of the trees in a pure stand, 50-80 % in a
      // dominant one (taken as 88 / 62 %); the others are its companions. Open stands are thinned to their cover density.
      if (hash3(i, j, 14) > Math.min(1, Math.max(0.3, (sp >> 5) / 7 * 100 / 80))) continue;
      const gg = hash3(i, j, 4) < (sp & 16 ? 0.88 : 0.62) ? g : speciesCompanion(x, z, g, hash3(i, j, 15));
      ty = GENUS_T[gg];
      // stand edges: the broadleaves keep their branches down to the ground, spruces their low skirts
      if (edge && (ty === T_BEECH || ty === T_OAK || ty === T_HORN)) ty = T_EDGE;
      else if (edge && ty === T_ROBINIA) ty = T_ROBINIA_EDGE;
      else if (edge && ty === T_SPRUCE) ty = T_SPRUCE_LOW;
    } else {
      // stands outside the genus map: species in stands of a few hectares, pines in the needle stands
      const needle = code === 3 ? 0.9 : code === 2 ? 0.45 : 0.02;
      if (hash3(i, j, 4) < needle * (0.55 + 0.9 * valueNoise2(x, z, 55, 7))) ty = edge ? T_SPRUCE_LOW : hash3(i, j, 5) < 0.62 ? T_PINE : T_SPRUCE;
      else if (edge) ty = T_EDGE;
      else { const b = hash3(i, j, 6) * 0.7 + valueNoise2(x, z, 80, 11) * 0.6 - 0.15; ty = b < 0.55 ? T_BEECH : b < 0.75 ? T_HORN : T_OAK; }
    }
    for (const f of MIX) ty = f(x, z, ty, edge, code, hash3(i, j, 12), hash3(i, j, 13));
    // age classes: whole stands younger or older
    const s = (0.68 + 0.45 * valueNoise2(x, z, 110, 9)) * (0.88 + 0.24 * hash3(i, j, 7));
    cb(x, z, ty, s, hash3(i, j, 8) * Math.PI * 2, 0.82 + 0.3 * hash3(i, j, 9));
  }
}
function eachShrub(x0, z0, x1, z1, cb) {
  for (let j = Math.floor(z0 / SSP); j <= Math.floor(z1 / SSP); j++) for (let i = Math.floor(x0 / SSP); i <= Math.floor(x1 / SSP); i++) {
    if (hash3(i, j, 21) > 0.72) continue;
    const x = (i + hash3(i, j, 22)) * SSP, z = (j + hash3(i, j, 23)) * SSP;
    const code = x < x0 || x >= x1 || z < z0 || z >= z1 ? 0 : forestCode(x, z);
    if (!code) continue;
    const g = speciesAt(x, z) & 15;
    if (g && g < 13 && hash3(i, j, 28) > GENUS_SHRUB[g]) continue;
    // understory: hazel / hawthorn shrubs, and saplings of the stand (young beeches under the beeches, hornbeams,
    // spruces in conifer stands)
    const k = hash3(i, j, 27);
    const sap = g && g < 13 ? (GENUS_CONIFER[g] ? T_SPRUCE : g === 1 ? T_BEECH : T_HORN) : code === 3 && k < 0.2 ? T_SPRUCE : T_HORN;
    if (k < 0.3) cb(x, z, sap, 0.22 + 0.2 * hash3(i, j, 24), hash3(i, j, 25) * Math.PI * 2, 0.8 + 0.3 * hash3(i, j, 26));
    else cb(x, z, T_SHRUB, 0.6 + 0.8 * hash3(i, j, 24), hash3(i, j, 25) * Math.PI * 2, 0.8 + 0.3 * hash3(i, j, 26));
  }
}

function buildForest(scene, world, quality, { models, impGeo, withSwitch, setInst }) {
  if (!GEO.forestBits) return { update() {}, count: () => 0, Q: null };
  const Q = FOREST_Q[quality.label] ?? { imp: 1500, near: 180, shrub: 95 };
  const impMat = models.map(({ imp }) => imp && withSwitch(new THREE.MeshStandardMaterial({ map: imp.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff }), Q.near, true, 'ffar', Q.imp));
  const nearMats = new Map();
  const nearMat = (mat, r) => { const k = mat.uuid + r; if (!nearMats.has(k)) nearMats.set(k, withSwitch(mat, r, false, 'fnear')); return nearMats.get(k); };
  const tiles = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  let live = 0;
  const instancedFrom = (list, g, mat, cast, leafy, tint) => {
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((t, k) => {
      im.setMatrixAt(k, m4.compose(p.set(t.x, t.y, t.z), q.setFromAxisAngle(up, t.rot), sv.setScalar(t.s)));
      im.setColorAt(k, leafy ? c.setHex(tint).multiplyScalar(t.v) : c.setScalar(t.v));
    });
    im.computeBoundingSphere();
    im.castShadow = cast; im.receiveShadow = true; im.userData.noAO = true;
    return im;
  };
  const buildTile = (ti, tj) => {
    const x0 = ti * GT, z0 = tj * GT;
    const grp = new THREE.Group(), byType = new Map(), subs = new Map();
    let n = 0;
    eachForestTree(x0, z0, x0 + GT, z0 + GT, (x, z, ty, s, rot, v) => {
      const t = { x, y: heightAt(x, z) - 0.12, z, ty, s, rot, v };
      if (!byType.has(ty)) byType.set(ty, []);
      byType.get(ty).push(t);
      const sk = Math.floor(x / ST) + ',' + Math.floor(z / ST);
      if (!subs.has(sk)) subs.set(sk, { cx: (Math.floor(x / ST) + 0.5) * ST, cz: (Math.floor(z / ST) + 0.5) * ST, trees: [], grp: null });
      subs.get(sk).trees.push(t);
      n++;
    });
    for (const [ty, list] of byType) grp.add(instancedFrom(list, impGeo[ty], impMat[ty], false, false));
    grp.userData.ueSkip = 'forest';
    scene.add(grp);
    live += n;
    return { grp, subs, n, cx: x0 + GT / 2, cz: z0 + GT / 2 };
  };
  // near 3D models (and the understory) of a 70 m sub-tile
  const buildSub = (sub) => {
    const grp = new THREE.Group();
    const byType = new Map();
    for (const t of sub.trees) { if (!byType.has(t.ty)) byType.set(t.ty, []); byType.get(t.ty).push(t); }
    if (Q.shrub > 0) {
      const x0 = sub.cx - ST / 2, z0 = sub.cz - ST / 2, sh = [];
      eachShrub(x0, z0, x0 + ST, z0 + ST, (x, z, ty, s, rot, v) => sh.push({ x, y: heightAt(x, z) - 0.05, z, ty, s, rot, v, under: true }));
      for (const t of sh) { const key = 'u' + t.ty; if (!byType.has(key)) byType.set(key, []); byType.get(key).push(t); }
    }
    for (const [key, list] of byType) {
      const ty = list[0].ty;
      const r = list[0].under ? Q.shrub : Q.near;
      for (const [g, mat] of models[ty].parts) {
        if (mat.userData.core) continue;
        const leafy = !mat.userData.bark;
        grp.add(instancedFrom(list, g, nearMat(mat, r), !list[0].under, leafy, TYPES[ty].tint ?? 0xffffff));
      }
    }
    grp.userData.ueSkip = 'forest';
    scene.add(grp);
    return grp;
  };
  const dispose = (grp) => { scene.remove(grp); grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); };
  // trunk colliders on demand, from the same hash (no stored trees)
  const pool = [];
  world.addProvider((qx, qz, qr, out) => {
    let used = 0;
    eachForestTree(qx - qr - 1, qz - qr - 1, qx + qr + 1, qz + qr + 1, (x, z, ty, s) => {
      const tr = (TYPES[ty].trunkR ?? 0.28) * s + 0.05;
      let b = pool[used];
      if (!b) { b = new world.Box(0, 0, 1, 1, 0, 0, 1, 'tree'); pool.push(b); }
      const y = heightAt(x, z);
      b.x = x; b.z = z; b.hw = b.hd = tr; b.rot = 0; b.y0 = y - 1; b.y1 = y + 10; b.update();
      out.push(b); used++;
    });
  });
  const reach = Q.imp + GT * 0.72;
  let last = null;
  return {
    Q,
    count: () => live,
    update(cam) {
      // a jump (photo views, tests, respawn) builds everything at once; walking/driving spreads the work
      const jump = !last || Math.hypot(cam.x - last.x, cam.z - last.z) > 150;
      last = { x: cam.x, z: cam.z };
      const t0 = performance.now(), budget = jump ? 1e9 : 12;
      const ci = Math.floor(cam.x / GT), cj = Math.floor(cam.z / GT), R = Math.ceil(reach / GT);
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const ti = ci + di, tj = cj + dj, key = ti + ',' + tj;
        if (tiles.has(key) || Math.hypot((ti + 0.5) * GT - cam.x, (tj + 0.5) * GT - cam.z) > reach) continue;
        if (Math.max(Math.abs((ti + 0.5) * GT), Math.abs((tj + 0.5) * GT)) > GEO.worldExt + GT) continue;
        if (performance.now() - t0 > budget) continue;
        tiles.set(key, buildTile(ti, tj));
      }
      for (const [key, t] of tiles) {
        const d = Math.hypot(t.cx - cam.x, t.cz - cam.z);
        if (d > reach + 350) {
          dispose(t.grp); for (const s of t.subs.values()) if (s.grp) dispose(s.grp);
          live -= t.n; tiles.delete(key); continue;
        }
        if (d > Q.near + GT) { for (const s of t.subs.values()) if (s.grp) { dispose(s.grp); s.grp = null; } continue; }
        for (const s of t.subs.values()) {
          const inR = Math.hypot(s.cx - cam.x, s.cz - cam.z) < Q.near + ST * 0.75;
          if (inR && !s.grp && performance.now() - t0 < budget + 10) s.grp = buildSub(s);
          if (s.grp) s.grp.visible = inR;
        }
      }
    },
  };
}
export { addWind, eachForestTree, eachShrub, TYPES as TREE_TYPES };
