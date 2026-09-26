import * as THREE from 'three';
import { W, baseHeight } from './config.js';
import { M } from './materials.js';
import { TEX } from './textures.js';
import { fbm, rng, mat, boxGeo } from './util.js';

// A ground strip following the street profile: columns xs[], from z0 to z1.
// yfn(x, z, base) -> y.  UVs in meters / tile.
export function stripGeo(xs, z0, z1, yfn, tileU = 1, tileV = 1, step = 2) {
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const nx = xs.length;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * j / nz;
    const b = baseHeight(z);
    for (let i = 0; i < nx; i++) {
      const x = xs[i];
      pos.push(x, yfn(x, z, b), z);
      uv.push(x / tileU, -z / tileV);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A vertical face along Z at x, from yBot(z) to yTop(z) (curb faces, wall faces). facing: +1 => normal +X
export function wallAlongZ(x, z0, z1, yBotOff, yTopOff, facing = 1, tile = 1, step = 2) {
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * j / nz;
    const b = baseHeight(z);
    pos.push(x, b + yBotOff, z, x, b + yTopOff, z);
    uv.push(-z / tile, 0, -z / tile, (yTopOff - yBotOff) / tile);
  }
  for (let j = 0; j < nz; j++) {
    const a = j * 2, c = a + 2;
    if (facing > 0) idx.push(a, c, a + 1, a + 1, c, c + 1);
    else idx.push(a, a + 1, c, a + 1, c + 1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildStreet(batch, world, opts) {
  const { zA, zB, aprons, beds = [], westAprons = [] } = opts;
  const flat = (off) => (x, z, b) => b + off;

  // Asphalt with a slight crown (2%) so light plays across it like on the real road
  batch.add(M.asphalt, stripGeo([-W.ROAD_HALF, -1, 0, 1, W.ROAD_HALF], zA, zB,
    (x, z, b) => b + 0.035 * (1 - (x / W.ROAD_HALF) ** 2), 1.3, 1.3, 2), null, { noCast: true });

  // East gutter pavers + curb
  batch.add(M.pavers, stripGeo([W.ROAD_HALF, W.PAVER_X1], zA, zB, flat(0.006), 1, 1, 2), null, { noCast: true });
  batch.add(M.curb, wallAlongZ(W.PAVER_X1, zA, zB, 0.0, W.CURB_H, -1, 0.5, 2), null, { noCast: true });

  // East strip (curb top .. fence): gravel, with concrete aprons (driveways) where given
  const cuts = [...aprons.map(a => ({ ...a, kind: 'apron' })), ...beds.map(a => ({ ...a, kind: 'bed' }))].sort((a, b) => a.z0 - b.z0);
  let z = zA;
  const curbTop = (x0, x1, za, zb, material, tile) => {
    batch.add(M.curb, stripGeo([W.PAVER_X1, W.CURB_X1], za, zb, flat(W.CURB_H), 0.5, 0.5, 2), null, { noCast: true });
    batch.add(material, stripGeo([x0, x1], za, zb, flat(W.CURB_H - 0.004), tile, tile, 2), null, { noCast: true });
  };
  for (const c of cuts) {
    if (c.z0 > z) curbTop(W.CURB_X1, W.EAST_FENCE + 0.4, z, c.z0, M.gravel, 1.2);
    batch.add(M.curb, stripGeo([W.PAVER_X1, W.CURB_X1], c.z0, c.z1, flat(W.CURB_H), 0.5, 0.5, 2), null, { noCast: true });
    if (c.kind === 'bed') {
      // flower bed: raised concrete edging + planted soil (photo 6)
      batch.add(M.curb, wallAlongZ(W.CURB_X1, c.z0, c.z1, W.CURB_H, W.CURB_H + 0.1, -1, 0.5, 2), null, { noCast: true });
      batch.add(M.curb, stripGeo([W.CURB_X1, W.CURB_X1 + 0.08], c.z0, c.z1, flat(W.CURB_H + 0.1), 0.5, 0.5, 2), null, { noCast: true });
      batch.add(M.soil, stripGeo([W.CURB_X1 + 0.08, W.EAST_FENCE + 0.4], c.z0, c.z1, flat(W.CURB_H + 0.07), 1.5, 1.5, 2), null, { noCast: true });
    } else {
      // apron: concrete sloping from curb to the gate
      batch.add(M.concrete, stripGeo([W.CURB_X1, W.EAST_FENCE + 0.4], c.z0, c.z1,
        (x, zz, b) => b + W.CURB_H + (x - W.CURB_X1) * 0.05, 2.2, 1.1, 2), null, { noCast: true });
    }
    z = c.z1;
  }
  if (z < zB) curbTop(W.CURB_X1, W.EAST_FENCE + 0.4, z, zB, M.gravel, 1.2);

  // West grass verge, interrupted by concrete aprons in front of gates (photo 8)
  let wz = zA;
  for (const a of [...westAprons].sort((p, q) => p.z0 - q.z0)) {
    if (a.z0 > wz) batch.add(M.grassGround, stripGeo([W.WEST_FENCE - 0.4, -2.6, -W.ROAD_HALF], wz, a.z0, (x, zz, b) => b + (x > -2.2 ? 0.0 : 0.04), 3, 3, 2), null, { noCast: true });
    batch.add(M.concrete, stripGeo([a.x1 - 0.1, -W.ROAD_HALF], a.z0, a.z1, (x, zz, b) => b + 0.01 + (-W.ROAD_HALF - x) * 0.03, 2.2, 1.1, 2), null, { noCast: true });
    wz = a.z1;
  }
  if (wz < zB) batch.add(M.grassGround, stripGeo([W.WEST_FENCE - 0.4, -2.6, -W.ROAD_HALF], wz, zB, (x, zz, b) => b + (x > -2.2 ? 0.0 : 0.04), 3, 3, 2), null, { noCast: true });
  // asphalt edge lip on the west
  batch.add(M.asphalt, wallAlongZ(-W.ROAD_HALF, zA, zB, -0.1, 0.0, -1, 1.3, 4), null, { noCast: true });

  // Dashed edge lines (worn paint)
  const dashGeo = [];
  for (const lx of [W.LINE_L, W.LINE_R]) {
    for (let d = zA + 0.7; d < zB - W.DASH; d += W.DASH + W.GAP) {
      const zc = d + W.DASH / 2;
      const b = baseHeight(zc) + 0.035 * (1 - (lx / W.ROAD_HALF) ** 2) + 0.004;
      const g = new THREE.PlaneGeometry(W.LINE_W, W.DASH);
      g.rotateX(-Math.PI / 2);
      const slope = Math.atan2(baseHeight(d + W.DASH) - baseHeight(d), W.DASH);
      g.rotateX(-slope);
      // vary the wear per dash
      const uv = g.attributes.uv; const o = Math.random();
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.35 + o * 0.6);
      g.translate(lx, b, zc);
      dashGeo.push(g);
    }
  }
  for (const g of dashGeo) batch.add(M.marking, g, null, { noCast: true });

  // Manhole covers roughly in the road center (one ~4 m ahead of the photo-1 camera)
  for (const [mx, mz] of [[-0.18, -5.05], [0.1, -41], [-0.2, -78], [0.15, -118], [-0.1, 32], [0.05, 71]]) {
    const g = new THREE.CircleGeometry(0.42, 28);
    g.rotateX(-Math.PI / 2);
    g.translate(mx, baseHeight(mz) + 0.035 * (1 - (mx / W.ROAD_HALF) ** 2) + 0.006, mz);
    batch.add(M.manhole, g, null, { noCast: true });
  }
  // storm drain grates in the east gutter
  for (let gz = zA + 12; gz < zB; gz += 37) {
    const g = boxGeo(0.4, 0.02, 0.6);
    batch.add(M.manhole, g, mat(2.3, baseHeight(gz) + 0.0, gz), { noCast: true });
  }

  // Colliders so cars can't drive into the lots; the curb itself is a height step.
  void world;
}

// Big ground beyond the lots (gardens/fields), gently undulating further out.
export function buildGround(batch) {
  const r = rng(4);
  void r;
  const undulate = (x, z) => {
    const far = Math.max(0, Math.abs(x) - 45) / 60;
    return Math.min(1, far) * (fbm(x / 90 + 50, z / 90, 3, 1e9, 7) - 0.4) * 10;
  };
  const xsE = [W.EAST_FENCE + 0.39, 10, 20, 30, 40, 55, 75, 100, 140, 200, 280, 380];
  const xsW = [-380, -280, -200, -140, -100, -75, -55, -40, -30, -20, -10, W.WEST_FENCE - 0.39];
  const zA = -560, zB = 480;
  batch.add(M.grassGround, stripGeo(xsE, zA, zB, (x, z, b) => b + 0.13 + undulate(x, z), 3, 3, 8), null, { noCast: true });
  batch.add(M.grassGround, stripGeo(xsW, zA, zB, (x, z, b) => b + 0.04 + undulate(x, z), 3, 3, 8), null, { noCast: true });
  // road continues beyond the playable area (visible into the haze)
}

// Distant forested hills with aerial perspective: the wooded ridge at the north end (photo 1)
// and the closer hill with a bare, eroded clay slope at the south end (photos 6-8).
export function buildHills(scene) {
  const segA = 200, segR = 12;
  const pos = [], uv = [], idx = [];
  const r0 = 360, r1 = 1700;
  const a0 = Math.PI - 0.07;                    // south hill, slightly east of the street axis
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const rad = r0 + (r1 - r0) * Math.pow(t, 1.35);
    for (let i = 0; i <= segA; i++) {
      const a = i / segA * Math.PI * 2;
      const x = Math.sin(a) * rad, z = -Math.cos(a) * rad;
      const north = Math.max(0, Math.cos(a));
      const ridge = fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 5, 1e9, 3);
      let h = (35 + 160 * north + 100 * ridge) * Math.min(1, t * 2.4 + 0.05);
      const da = Math.atan2(Math.sin(a - a0), Math.cos(a - a0));
      h += 75 * Math.exp(-((da / 0.42) ** 2)) * Math.min(1, t * 3.2) * Math.exp(-Math.max(0, rad - 520) / 500);
      h *= 0.65 + 0.45 * fbm(x / 250, z / 250, 3, 1e9, 9);
      if (j === 0) h = -6;
      pos.push(x, h + baseHeight(Math.max(-200, Math.min(130, z))) * 0.5, z);
      uv.push(a * 60, rad / 30);
    }
  }
  for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
    const a = j * (segA + 1) + i, b = a + 1, c = a + segA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const matl = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: TEX.forest },
      uNoise: { value: TEX.noise },
      uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uHaze: { value: new THREE.Color(0.56, 0.60, 0.65) },
      uFogStart: { value: 200 }, uFogEnd: { value: 2200 },
      uCliff: { value: new THREE.Vector3(Math.sin(a0) * 400 - 12, 0, -Math.cos(a0) * 400) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying float vD; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(normal); vec4 wp = modelMatrix*vec4(position,1.0);
      vW = wp.xyz; vD = length(wp.xyz - cameraPosition);
      gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform sampler2D uMap; uniform sampler2D uNoise; uniform vec3 uSun; uniform vec3 uHaze; uniform float uFogStart; uniform float uFogEnd; uniform vec3 uCliff;
      varying vec2 vUv; varying vec3 vN; varying float vD; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = pow(texture2D(uMap, vUv).rgb, vec3(2.2));
        // eroded clay slope on the north face of the south hill
        vec2 dq = (vW.xz - uCliff.xz) / vec2(48.0, 70.0);
        float nz = texture2D(uNoise, vW.xz * 0.012).g;
        float mask = (1.0 - smoothstep(0.55, 1.0, length(dq) + (nz - 0.5) * 0.6));
        mask *= smoothstep(-0.05, -0.35, n.z);
        mask *= smoothstep(4.0, 14.0, vW.y) * (1.0 - smoothstep(38.0, 60.0, vW.y + (nz - 0.5) * 20.0));
        float streak = 0.75 + 0.25 * sin(vW.x * 0.9 + nz * 9.0) * texture2D(uNoise, vec2(vW.x * 0.05, vW.y * 0.01)).r;
        vec3 clay = vec3(0.47, 0.42, 0.34) * streak;
        float scrub = smoothstep(0.55, 0.75, texture2D(uNoise, vW.xz * 0.05 + vW.y * 0.03).b);
        alb = mix(alb, mix(clay, alb, scrub * 0.8), mask);
        float ndl = max(dot(n, uSun), 0.0);
        vec3 lit = alb * (0.5 + 0.9 * ndl) * 1.2;
        float f = clamp((vD - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
        f = 1.0 - pow(1.0 - f, 1.6);
        vec3 c = mix(lit, uHaze * 1.1, f * 0.85);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, matl);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  scene.add(mesh);
  return mesh;
}
