/* Trees and ground cover. Everything is instanced and shares a wind shader so a
   full orchard costs a handful of draw calls. */
import * as THREE from 'three';
import { mulberry32 } from '../gfx/Noise.js';

/** Injects a cheap vertex-sway into any material. Returns the uniform holder. */
export function makeWindy(material, { strength = 1, stiffness = 1 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.82, -0.57) },
    uWindAmp: { value: 0.16 * strength },
    uStiff: { value: stiffness },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec2 uWind; uniform float uWindAmp; uniform float uStiff;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 instOrigin = vec3(0.0);
          #endif
          vec3 wp = instOrigin + (modelMatrix[3]).xyz;
          float phase = uTime * 1.35 + wp.x * 0.22 + wp.z * 0.17;
          float gust = 0.65 + 0.35 * sin(uTime * 0.37 + wp.x * 0.05);
          float h = max(transformed.y, 0.0) * uStiff;
          float sway = sin(phase) * 0.7 + sin(phase * 2.31 + 1.7) * 0.3;
          transformed.xz += uWind * (sway * uWindAmp * gust * h);
        }`);
  };
  material.customProgramCacheKey = () => 'windy';
  material.needsUpdate = true;
  return uniforms;
}

/** Build one tree as {trunk: Matrix4[], cards: Matrix4[]} contributions. */
function treeMatrices(x, z, scale, seed, out, kind) {
  const rnd = mulberry32(seed);
  const yaw = rnd() * Math.PI * 2;
  const lean = (rnd() - 0.5) * 0.07;
  const trunkH = (kind === 'orchard' ? 1.5 : 2.4) * scale;

  const tm = new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, yaw, lean * 0.6)),
    new THREE.Vector3(scale, scale, scale));
  out.trunks.push(tm);

  const crownR = (kind === 'orchard' ? 1.75 : 2.5) * scale;
  const crownY = trunkH + crownR * 0.72;
  const cards = kind === 'orchard' ? 7 : 9;
  for (let i = 0; i < cards; i++) {
    const a = yaw + (i / cards) * Math.PI * 2 + rnd() * 0.7;
    const rr = crownR * (0.30 + rnd() * 0.55);
    const yy = crownY + (rnd() - 0.5) * crownR * 1.15;
    const size = crownR * (1.05 + rnd() * 0.55);
    out.cards.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, a + Math.PI / 2, (rnd() - 0.5) * 0.4)),
      new THREE.Vector3(size, size, size)));
  }
  return { trunkH, crownR, crownY };
}

export class Vegetation {
  /**
   * @param {Array} specs [{x, z, scale, kind:'orchard'|'tall', seed}]
   */
  constructor(specs, mats, colliders, { foliageQuality = 1, reserved = [] } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    const out = { trunks: [], cards: [] };
    for (const s of specs) {
      const r = treeMatrices(s.x, s.z, s.scale, s.seed || 1, out, s.kind || 'orchard');
      // keep the trunk visible but skip its collider where a vehicle is parked,
      // otherwise a car can spawn wedged against a tree and refuse to move
      const blocked = reserved.some(v => Math.hypot(v.x - s.x, v.z - s.z) < (v.r || 3.4));
      if (colliders && s.solid !== false && !blocked) {
        colliders.push({ cx: s.x, cy: r.trunkH / 2, cz: s.z, sx: 0.34 * s.scale, sy: r.trunkH, sz: 0.34 * s.scale, rotY: 0 });
      }
    }

    const trunkGeo = new THREE.CylinderGeometry(0.10, 0.17, 1.0, 7, 1);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = mats.surface('bark', 0.9, 1.6, { roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, out.trunks.length);
    out.trunks.forEach((m, i) => {
      // trunks are scaled non-uniformly: taller than the unit cylinder
      const s = new THREE.Vector3(); const p = new THREE.Vector3(); const q = new THREE.Quaternion();
      m.decompose(p, q, s);
      trunks.setMatrixAt(i, new THREE.Matrix4().compose(p, q, new THREE.Vector3(s.x, s.y * 2.1, s.z)));
    });
    trunks.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true; trunks.receiveShadow = true;
    this.group.add(trunks);

    const keep = Math.max(1, Math.round(out.cards.length * foliageQuality));
    const cardGeo = new THREE.PlaneGeometry(1, 1);
    const cardMat = mats.cutout('foliage', { alphaTest: 0.44, doubleSide: true, roughness: 0.78 });
    cardMat.alphaToCoverage = true;
    this.windUniforms = makeWindy(cardMat, { strength: 1.0, stiffness: 0.16 });
    const cards = new THREE.InstancedMesh(cardGeo, cardMat, keep);
    for (let i = 0; i < keep; i++) cards.setMatrixAt(i, out.cards[i]);
    cards.instanceMatrix.needsUpdate = true;
    cards.castShadow = true; cards.receiveShadow = true;
    cards.frustumCulled = false;
    this.group.add(cards);
    this.cards = cards;
    this.trunks = trunks;
  }

  /** Scattered grass tufts, limited to a set of rectangles. */
  addGrass(areas, mats, { density = 1, seed = 7 } = {}) {
    if (density <= 0) return;
    const rnd = mulberry32(seed);
    const mats4 = [];
    for (const a of areas) {
      const n = Math.round(a.w * a.d * 0.18 * density);
      for (let i = 0; i < n; i++) {
        const x = a.x + (rnd() - 0.5) * a.w;
        const z = a.z + (rnd() - 0.5) * a.d;
        const s = 0.45 + rnd() * 0.5;
        mats4.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x, 0, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0)),
          new THREE.Vector3(s, s * (0.8 + rnd() * 0.5), s)));
      }
    }
    if (!mats4.length) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const cross = geo.clone(); cross.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const g2 = [geo, cross];
    const pos = [], uv = [], idx = [], nor = [];
    let off = 0;
    for (const g of g2) {
      const p = g.attributes.position, u = g.attributes.uv, n = g.attributes.normal, ix = g.index;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
      off += p.count;
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    merged.setIndex(idx);
    geo.dispose(); cross.dispose();

    const m = mats.cutout('grassCard', { alphaTest: 0.38, doubleSide: true, roughness: 0.9 });
    m.alphaToCoverage = true;
    this.grassUniforms = makeWindy(m, { strength: 1.6, stiffness: 0.55 });
    const inst = new THREE.InstancedMesh(merged, m, mats4.length);
    mats4.forEach((mm, i) => inst.setMatrixAt(i, mm));
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    this.group.add(inst);
    this.grass = inst;
  }

  update(t, windStrength, windDir) {
    if (this.windUniforms) {
      this.windUniforms.uTime.value = t;
      this.windUniforms.uWindAmp.value = 0.06 + windStrength * 0.22;
      this.windUniforms.uWind.value.copy(windDir);
    }
    if (this.grassUniforms) {
      this.grassUniforms.uTime.value = t;
      this.grassUniforms.uWindAmp.value = 0.05 + windStrength * 0.16;
      this.grassUniforms.uWind.value.copy(windDir);
    }
  }
}
