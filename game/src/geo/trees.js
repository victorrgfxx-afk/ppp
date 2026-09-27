import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt } from './data.js';
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
];

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
  const top = new THREE.Vector3(0, t.H * 0.4, 0);
  wood.push(cyl(new THREE.Vector3(0, -0.3, 0), top, t.trunkR, t.trunkR * 0.7, 6));
  const ends = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + r() * 0.6;
    const e = top.clone().add(new THREE.Vector3(Math.cos(a) * t.crown * 0.55, t.H * 0.25, Math.sin(a) * t.crown * 0.55));
    wood.push(cyl(top, e, t.trunkR * 0.55, t.trunkR * 0.2, 5));
    ends.push(e);
  }
  const c = new THREE.Vector3(0, t.H * 0.62, 0);
  for (let i = 0; i < t.cards; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.pow(r(), 0.45);
    const p = c.clone().add(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th) * t.crown * rr, u * t.H * 0.34 * rr, Math.sqrt(1 - u * u) * Math.sin(th) * t.crown * rr));
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
  const parts = [[mergeGeometries(wood.map(clean)), 'bark'], [mergeGeometries(cards), 'leaf']];
  if (t.crown > 3) {
    const core = new THREE.IcosahedronGeometry(1, 1);
    const cp = core.attributes.position, cn = core.attributes.normal;
    for (let k = 0; k < cp.count; k++) {
      const x = cp.getX(k), y = cp.getY(k), z = cp.getZ(k);
      const f = 0.85 + 0.2 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.3);
      cp.setXYZ(k, x * t.crown * 0.5 * f, y * t.H * 0.22 * f + c.y, z * t.crown * 0.5 * f);
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
  const core = new THREE.ConeGeometry(t.crown * 0.42, t.H - 1.6, 8, 4);
  core.translate(0, 1.6 + (t.H - 1.6) / 2, 0);
  for (let y = 1.3; y < t.H - 0.4; y += 0.85) {
    const k = (y - 1.2) / (t.H - 1.2), R = t.crown * Math.pow(1 - k, 0.9) + 0.35;
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

// ---- distance switch in the vertex shader (per instance) ----
function withSwitch(material, near, farSide, key) {
  const m = material.clone();
  const prev = material.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uSwitch = { value: near };
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  { vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float dd = distance(ip.xz, cameraPosition.xz);
    if (${farSide ? 'dd < uSwitch' : 'dd > uSwitch'}) transformed *= 0.0; }
#endif`).replace('#include <common>', '#include <common>\nuniform float uSwitch;');
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
  };
  const models = TYPES.map((t, i) => {
    const parts = t.conifer ? spruceModel(t, 50 + i) : broadModel(t, 50 + i);
    const leaf = M[t.leaf] ?? M.leaves;
    const pm = parts.map(([g, k]) => [g, k === 'leaf' ? leaf : mats[k]]);
    const imp = bakeImpostor(renderer, pm, t);
    return { t, parts: pm, imp };
  });
  // compact per-tree arrays + chunk lists (near: 300 m, far impostors: 1500 m)
  const n = T.n, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), R = new Float32Array(n), S = new Float32Array(n), V = new Float32Array(n), TY = new Uint8Array(n);
  const CH = 300, FCH = 1500, near = new Map(), far = new Map(), cell = new Map(), CELL = 16;
  const r = rng(99);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (density < 1 && r() > density) continue;
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
        const leafy = mat !== M.bark;
        const im = new THREE.InstancedMesh(g, nearMat(mat), list.length);
        list.forEach((k, j) => setInst(im, k, j, TYPES[ty].tint ?? 0xffffff, leafy));
        im.castShadow = true; im.receiveShadow = true;
        im.userData.noAO = true;
        im.computeBoundingSphere();
        grp.add(im);
      }
    });
    scene.add(grp);
    return grp;
  };
  // far impostors: 3 crossed quads per tree, one InstancedMesh per 1.5 km chunk and type (frustum culled)
  const impGeo = models.map(({ imp }) => {
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
  const impMat = models.map(({ imp }) => withSwitch(new THREE.MeshStandardMaterial({ map: imp.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff }), nearR, true, 'far'));
  for (const ch of far.values()) {
    const byType = TYPES.map(() => []);
    for (const k of ch.idx) byType[TY[k]].push(k);
    byType.forEach((list, ty) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(impGeo[ty], impMat[ty], list.length);
      list.forEach((k, j) => {
        im.setMatrixAt(j, m4.compose(p.set(X[k], Y[k], Z[k]), q.setFromAxisAngle(up, R[k]), sv.setScalar(S[k])));
        im.setColorAt(j, c.setScalar(V[k]));
      });
      im.computeBoundingSphere();
      im.castShadow = false; im.receiveShadow = true;
      im.userData.noAO = true;
      scene.add(im);
    });
  }
  const nearList = [...near.values()];
  return {
    count,
    update(camPos) {
      const reach = nearR + CH * 0.75;
      for (const ch of nearList) {
        const inside = Math.hypot(ch.cx - camPos.x, ch.cz - camPos.z) < reach;
        if (inside && !ch.grp) ch.grp = buildNear(ch);
        if (ch.grp) ch.grp.visible = inside;
      }
    },
  };
}
export { addWind };
