import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEO, heightAt } from './data.js';
import { M, addWind } from '../materials.js';
import { rng } from '../util.js';

// ~90 000 trees placed from the map (forests, orchards, riverside willows, yard trees where
// Sentinel-2 shows vegetation). Near: light 3D trees per 200 m chunk; far: impostor billboards
// rendered from the same models. A vertex-shader distance switch avoids drawing both.

const TYPES = [
  { name: 'oak', H: 15, crown: 5.0, trunkR: 0.34, cards: 150, leaf: 'leavesDark', tint: 0xb9c7a3 },
  { name: 'hornbeam', H: 12, crown: 3.8, trunkR: 0.24, cards: 130, leaf: 'leaves', tint: 0xc4d0a8 },
  { name: 'spruce', H: 17, crown: 3.0, conifer: true },
  { name: 'fruit', H: 5.2, crown: 2.4, trunkR: 0.13, cards: 95, leaf: 'leavesSmall', tint: 0xd8e0c0 },
  { name: 'walnut', H: 13, crown: 5.4, trunkR: 0.36, cards: 150, leaf: 'leaves', tint: 0xb4c49c },
  { name: 'willow', H: 11, crown: 4.0, trunkR: 0.3, cards: 130, leaf: 'leavesSmall', tint: 0xc8d7a0, droop: true },
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
  const core = new THREE.IcosahedronGeometry(1, 1);
  const cp = core.attributes.position;
  for (let k = 0; k < cp.count; k++) {
    const f = 0.8 + r() * 0.3;
    cp.setXYZ(k, cp.getX(k) * t.crown * 0.66 * f, cp.getY(k) * t.H * 0.26 * f + c.y, cp.getZ(k) * t.crown * 0.66 * f);
  }
  core.computeVertexNormals();
  return [[mergeGeometries(wood.map(clean)), 'bark'], [clean(core), 'crown'], [mergeGeometries(cards), 'leaf']];
}

function spruceModel(t, seed) {
  const r = rng(seed);
  const cards = [];
  const core = new THREE.ConeGeometry(t.crown * 0.7, t.H - 1.2, 8, 4);
  core.translate(0, 1.2 + (t.H - 1.2) / 2, 0);
  for (let y = 1.4; y < t.H - 0.5; y += 1.25) {
    const k = (y - 1.2) / (t.H - 1.2), R = t.crown * (1 - k) + 0.3;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + r() * 0.8;
      const g = new THREE.PlaneGeometry(R * 0.9, R * 1.1);
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
    crown: new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 1 }),
  };
  const models = TYPES.map((t, i) => {
    const parts = t.conifer ? spruceModel(t, 50 + i) : broadModel(t, 50 + i);
    const leaf = M[t.leaf] ?? M.leaves;
    const pm = parts.map(([g, k]) => [g, k === 'leaf' ? leaf : mats[k]]);
    const imp = bakeImpostor(renderer, pm, t);
    return { t, parts: pm, imp };
  });
  // instance lists per chunk and type
  const CH = 200, chunks = new Map(), all = TYPES.map(() => []);
  const r = rng(99);
  for (let i = 0; i < T.n; i++) {
    if (density < 1 && r() > density) continue;
    const x = T.x[i], z = T.z[i], ty = Math.min(TYPES.length - 1, T.t[i]), s = T.s[i];
    const y = heightAt(x, z) - 0.05;
    const rot = r() * Math.PI * 2;
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    if (!chunks.has(k)) chunks.set(k, { cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH, lists: TYPES.map(() => []) });
    const item = [x, y, z, rot, s * (0.9 + r() * 0.2), 0.85 + r() * 0.3];
    chunks.get(k).lists[ty].push(item);
    all[ty].push(item);
    const tr = (TYPES[ty].trunkR ?? 0.3) * s;
    world.addStatic(new world.Box(x, z, tr + 0.05, tr + 0.05, 0, y - 1, y + 8, 'tree'));
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  // near 3D models, one InstancedMesh per chunk/type/part
  const nearMats = new Map();
  const nearMat = (mat) => { if (!nearMats.has(mat)) nearMats.set(mat, withSwitch(mat, nearR, false, 'near')); return nearMats.get(mat); };
  const nearGroups = [];
  for (const ch of chunks.values()) {
    const grp = new THREE.Group();
    grp.userData.c = [ch.cx, ch.cz];
    ch.lists.forEach((list, ty) => {
      if (!list.length) return;
      for (const [g, mat] of models[ty].parts) {
        const leafy = mat !== M.bark;
        const im = new THREE.InstancedMesh(g, nearMat(mat), list.length);
        list.forEach(([x, y, z, rot, s, v], i) => {
          im.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), sv.setScalar(s)));
          im.setColorAt(i, leafy ? c.setHex(TYPES[ty].tint ?? 0xffffff).multiplyScalar(v) : c.setScalar(0.8 + 0.2 * v));
        });
        im.castShadow = true; im.receiveShadow = true;
        im.userData.noAO = true;
        im.computeBoundingSphere();
        grp.add(im);
      }
    });
    grp.visible = false;
    scene.add(grp);
    nearGroups.push(grp);
  }
  // far impostors: 3 crossed quads per tree, one InstancedMesh per type
  const farMeshes = [];
  models.forEach(({ imp }, ty) => {
    const list = all[ty];
    if (!list.length) return;
    const quads = [];
    for (const a of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      const g = new THREE.PlaneGeometry(imp.halfW * 2, imp.H);
      g.translate(0, imp.H / 2 + imp.y0, 0);
      g.rotateY(a);
      const n = g.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
      quads.push(g);
    }
    const g = mergeGeometries(quads);
    const mat = withSwitch(new THREE.MeshStandardMaterial({ map: imp.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xffffff }), nearR, true, 'far');
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach(([x, y, z, rot, s, v], i) => {
      im.setMatrixAt(i, m4.compose(p.set(x, y, z), q.setFromAxisAngle(up, rot), sv.setScalar(s)));
      im.setColorAt(i, c.setScalar(v));
    });
    im.frustumCulled = false;
    im.castShadow = false; im.receiveShadow = true;
    im.userData.noAO = true;
    scene.add(im);
    farMeshes.push(im);
  });
  let count = 0; for (const l of all) count += l.length;
  return {
    count,
    update(camPos) {
      for (const g of nearGroups) {
        const [x, z] = g.userData.c;
        g.visible = Math.hypot(x - camPos.x, z - camPos.z) < nearR + CH * 0.75;
      }
    },
  };
}
export { addWind };
