import * as THREE from 'three';
import { BONES, PARENT, B, TAIL, buildBody } from './castgeo.js';

// The cast of the forest scene (forest.js) as skinned meshes: the bodies' geometry comes from castgeo.js, made in a
// worker (or, where there is none, a few milliseconds at a time between frames), so the game never stops for it.
// Posing: forward kinematics for the trunk and head, two-bone IK for the arms and legs (hands can hold on to a bone of
// another actor), all in the stage's frame.

// ------------------------------------------------------------------ material: regions and fine detail in the shader
// region -> [colour (sRGB hex), material class]: 0 skin, 1 cloth, 2 hair, 3 shoe, 4 eye, 5 mouth / socket, 6 creature skin
const NOISE = /* glsl */`
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
// distance to the nearest cell border of a 3D Worley pattern (cracks)
float crack(vec3 p) { vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec3 g = vec3(x, y, z), o = vec3(h3(i + g), h3(i + g + 7.1), h3(i + g + 13.7));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }
`;
function castMaterial(kind) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.userData.noWet = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; attribute vec3 aRest; varying float vMat; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vRest = aRest;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vRest;\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float mc = floor(vMat + 0.5);
      float grain = fbm(vRest * 140.0);
      float rough = 0.55;
      if (mc < 0.5) { diffuseColor.rgb *= 0.92 + 0.16 * fbm(vRest * 60.0); rough = 0.5 + 0.12 * grain; }                 // skin: blotches, pores
      else if (mc < 1.5) { float w = fbm(vRest * vec3(18.0, 6.0, 18.0)); diffuseColor.rgb *= 0.86 + 0.24 * w; rough = 0.88; }   // cloth: folds
      else if (mc < 2.5) { diffuseColor.rgb *= 0.7 + 0.5 * fbm(vRest * 220.0); rough = 0.72; }                          // hair: strands, curls
      else if (mc < 3.5) { rough = 0.6; }                                                                                 // shoes
      else if (mc < 4.5) { rough = 0.08; }                                                                                // eyes: wet
      else if (mc < 5.5) { rough = 0.5; }                                                                                 // mouth, sockets
      else {                                                                                                              // the creature
        float c = crack(vRest * 22.0), c2 = crack(vRest * 70.0 + 3.0);
        float lines = (1.0 - smoothstep(0.0, 0.045, c)) * 0.8 + (1.0 - smoothstep(0.0, 0.035, c2)) * 0.3;
        float bl = fbm(vRest * 9.0);
        float wr = fbm(vRest * vec3(160.0, 60.0, 160.0));
        diffuseColor.rgb *= (0.74 + 0.4 * bl) * (1.0 - 0.55 * clamp(lines, 0.0, 1.0)) * (0.84 + 0.3 * wr);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 0.88, 0.84), smoothstep(0.55, 0.8, fbm(vRest * 4.0)));
        rough = 0.62 + 0.25 * lines;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;');
  };
  m.customProgramCacheKey = () => 'cast-' + kind;
  return m;
}


// ------------------------------------------------------------------ the actor: mesh + skeleton + posing
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m3 = new THREE.Matrix4();
function frame(x, n, out) {                       // rotation whose X axis is x and whose Z axis is n (made orthogonal)
  const X = _v.copy(x).normalize(), Z = _v2.copy(n).addScaledVector(X, -n.dot(X)).normalize(), Y = new THREE.Vector3().crossVectors(Z, X);
  _m3.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m3);
}

export class Actor {
  // body: what castgeo.js's buildBody made (vertices, normals, colours, material classes, skin weights, joints)
  constructor(body) {
    const J = this.J = body.J;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(body.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(body.nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(body.col, 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(body.mat, 1));
    g.setAttribute('aRest', new THREE.BufferAttribute(body.pos.slice(), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(body.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(body.sw, 4));
    g.setIndex(new THREE.BufferAttribute(body.idx, 1));
    // bones in the rest pose (identity rotations: each bone's frame is the model frame)
    this.bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones.forEach((b, i) => {
      const h = J[BONES[i]], p = PARENT[i] >= 0 ? J[BONES[PARENT[i]]] : [0, 0, 0];
      b.position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]);
      if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b);
    });
    this.rest = this.bones.map(b => b.position.clone());
    this.mesh = new THREE.SkinnedMesh(g, castMaterial(body.kind));
    this.mesh.add(this.bones[0]);
    this.bones[0].updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;                    // (posed far from the rest pose: thrown, upside down)
    this.mesh.name = body.kind;
    this.stats = { verts: body.nv, tris: body.idx.length / 3 };
    this.len = {};
    for (const n of BONES) { const h = J[n], t = J[TAIL[n]]; this.len[n] = Math.hypot(t[0] - h[0], t[1] - h[1], t[2] - h[2]); }
    this.restDir = BONES.map(n => { const h = J[n], t = J[TAIL[n]]; return new THREE.Vector3(t[0] - h[0], t[1] - h[1], t[2] - h[2]).normalize(); });
    // model-space bone transforms (positions of heads, rotations) after posing
    this.mq = BONES.map(() => new THREE.Quaternion()); this.mp = BONES.map(() => new THREE.Vector3());
  }
  // forward kinematics into the model (= stage) frame, from bone `from` down its subtree (all bones if omitted)
  fk() {
    for (let i = 0; i < BONES.length; i++) {
      const b = this.bones[i], p = PARENT[i];
      if (p < 0) { this.mq[i].copy(b.quaternion); this.mp[i].copy(b.position); }
      else { this.mq[i].multiplyQuaternions(this.mq[p], b.quaternion); this.mp[i].copy(b.position).applyQuaternion(this.mq[p]).add(this.mp[p]); }
    }
  }
  // the stage-frame position of a point fixed to a bone (offset in the bone's rest frame)
  point(bone, off, out = new THREE.Vector3()) { const i = B[bone]; return out.set(off[0], off[1], off[2]).applyQuaternion(this.mq[i]).add(this.mp[i]); }
  tip(bone, out = new THREE.Vector3()) { const i = B[bone]; return out.copy(this.restDir[i]).multiplyScalar(this.len[bone]).applyQuaternion(this.mq[i]).add(this.mp[i]); }
  // two-bone IK (upper, lower, end): the end's head reaches `target`, the middle joint bends towards `pole`.
  // restPole: the direction the middle joint bends towards in the rest pose (model frame)
  ik(upper, target, pole, restPole, endQ = null) {
    const u = B[upper], l = u + 1, e = u + 2;
    this.fk();
    const S = this.mp[u], a = this.len[BONES[u]], b = this.len[BONES[l]];
    const d = new THREE.Vector3().subVectors(target, S), dist = Math.min(Math.max(d.length(), 0.02), (a + b) * 0.9995);
    d.normalize();
    const toPole = new THREE.Vector3().subVectors(pole, S); toPole.addScaledVector(d, -toPole.dot(d));
    if (toPole.lengthSq() < 1e-8) toPole.set(0, 0, 1).addScaledVector(d, -d.z);
    toPole.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + dist * dist - b * b) / (2 * a * dist))), sinA = Math.sqrt(1 - cosA * cosA);
    const E = new THREE.Vector3().copy(S).addScaledVector(d, a * cosA).addScaledVector(toPole, a * sinA);
    const T = new THREE.Vector3().copy(S).addScaledVector(d, dist);
    const nT = new THREE.Vector3().crossVectors(d, toPole).normalize();
    const nR = new THREE.Vector3().crossVectors(this.restDir[u], restPole).normalize();
    const dirU = new THREE.Vector3().subVectors(E, S).normalize(), dirL = new THREE.Vector3().subVectors(T, E).normalize();
    const qU = frame(dirU, nT, new THREE.Quaternion()).multiply(frame(this.restDir[u], nR, _q).invert());
    const qL = frame(dirL, nT, new THREE.Quaternion()).multiply(frame(this.restDir[l], nR, _q).invert());
    this.bones[u].quaternion.copy(_q2.copy(this.mq[PARENT[u]]).invert().multiply(qU));
    this.bones[l].quaternion.copy(_q2.copy(qU).invert().multiply(qL));
    if (endQ) this.bones[e].quaternion.copy(_q2.copy(qL).invert().multiply(endQ));
    this.fk();
  }
}

// ------------------------------------------------------------------ making the bodies without stopping the game
// Resolves { kind: body } for the kinds asked. A module worker builds them off the main thread; if workers are not
// allowed (or one fails), the rest are built here in slices of ~5 ms between frames. `how` says which was used.
export function makeCast(kinds) {
  return new Promise((resolve) => {
    const out = {}, todo = new Set(kinds), t0 = performance.now();
    const done = (b, how) => { out[b.kind] = b; todo.delete(b.kind); if (!todo.size) resolve({ bodies: out, how, ms: Math.round(performance.now() - t0) }); };
    const here = () => {
      const list = [...todo];
      let it = null;
      const slice = () => {
        const s = performance.now();
        while (performance.now() - s < 5) {
          if (!it) { if (!list.length) return; it = buildBody(list.shift()); }
          const r = it.next();
          if (r.done) { done(r.value, 'frames'); it = null; }
        }
        setTimeout(slice, 0);
      };
      slice();
    };
    let w = null;
    try { w = new Worker(new URL('./castworker.js', import.meta.url), { type: 'module' }); } catch (e) { w = null; }
    if (!w) { here(); return; }
    w.onmessage = (e) => { done(e.data, 'worker'); if (!todo.size) w.terminate(); };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); if (todo.size) here(); };
    for (const k of kinds) w.postMessage(k);
  });
}

export { BONES, B as BONE_INDEX, PARENT as BONE_PARENT };
