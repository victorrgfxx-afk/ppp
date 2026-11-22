import * as THREE from 'three';
import { GEO, inPoly } from './geo/data.js';
import { ROOF_FRAMES } from './geo/buildings.js';
import { SNOW } from './rain.js';

// The snow lying on the roofs (V114). Until now a roof under snow was only whitened (rain.js SNOW_MAIN): the white
// ended at the tiles' edge, with no thickness. Snow on a roof is a slab as deep as on the ground (a little less where
// the wind takes it, much less on a smooth metal sheet, which sheds it once the sun warms it), and at the eaves it does
// not stop at the edge: it creeps a little over the gutter before it breaks off and rounds into a cornice. Over every
// pitched roof near you (geo/buildings.js ROOF_FRAMES: hipped and gable roofs over the footprint's rectangles) a slab:
// its top the roof's planes raised by the snow's depth, its eaves a rounded cornice out over the gutter by up to ~0.35
// of the depth, the gable verges a smaller round edge; each a little irregular. Its depth is the ground's
// (SNOW.uSnowDepth, up to 42 cm) times the roof's own share; it grows and melts with it (a uniform: the geometry is made
// once, in cells of 128 m, the cells within ~330 m of you drawn, one draw each).
const N = 14, CELL = 128, RAD = 330;
// the cornice's section at an eave: [out from the roof's edge, up from it] in depths, plus [out, up] in metres that
// come in with a few centimetres of snow (uSlabFix): out over the gutter (13 cm past the roof's edge, its top 3 cm
// under it), draping a little over its lip, rounded up into the top; at a verge, smaller and with no gutter
const EAVE = [[0, 0, 0, 0], [0.1, 0.05, 0.16, -0.04], [0.32, 0.42, 0.17, -0.03], [0.22, 0.82, 0.1, 0], [0, 1, 0, 0]];
const VERGE = [[0, 0, 0, 0], [0.12, 0.12, 0.03, 0], [0.15, 0.5, 0.04, 0], [0.08, 0.85, 0.02, 0], [0, 1, 0, 0]];
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

export const SLAB_T = { value: 0 };             // the slab's depth now (m), before each roof's share
export const SLAB_FIX = { value: 0 };           // how far its fixed reach (out over a gutter) has come in (0-1)

let slabMat = null;
// (one material for every slab of snow: the roofs', the cars' - cars.js)
export function snowSlabMaterial() { return slabMat ??= material(); }
function material() {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.87, 0.9, 0.94), roughness: 0.82 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSlabT = SLAB_T; sh.uniforms.uSlabFix = SLAB_FIX;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 snowDir, snowFix;\nuniform float uSlabT, uSlabFix;')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + snowDir * uSlabT + snowFix * uSlabFix;');
  };
  m.customProgramCacheKey = () => 'snowSlab';
  return m;
}

// one roof's slab into the arrays (p: where each vertex starts, on the roof; d: where it goes per metre of depth; n)
function slab(F, i, A) {
  const cx = F[i], cz = F[i + 1], ex0 = F[i + 2], ex1 = F[i + 3], ez0 = F[i + 4], ez1 = F[i + 5], H = F[i + 6], D = F[i + 7], R = F[i + 8];
  const eY = F[i + 9], rY = F[i + 10], gable = F[i + 11] > 0.5, keep = F[i + 12], bld = GEO.buildings[F[i + 13]];
  const P = (s, u, y) => [cx + ex0 * s + ez0 * u, y, cz + ex1 * s + ez1 * u];
  const EX = [ex0, 0, ex1], EZ = [ez0, 0, ez1];
  const poly = [];
  if (bld) for (let k = 0; k < bld.p.length; k += 2) poly.push([bld.p[k], bld.p[k + 1]]);
  const up = [0, keep, 0], nofix = [0, 0, 0];
  // the top: the roof's planes, raised
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b, c]) { A.p.push(v[0], v[1], v[2]); A.d.push(...up); A.f.push(...nofix); A.n.push(nx / l, ny / l, nz / l); }
  };
  const c1 = P(-H, -D, eY), c2 = P(H, -D, eY), c3 = P(H, D, eY), c4 = P(-H, D, eY), r1 = P(-R, 0, rY), r2 = P(R, 0, rY);
  tri(c1, c2, r2); tri(c1, r2, r1); tri(c3, c4, r1); tri(c3, r1, r2);
  if (!gable) { tri(c4, c1, r1); tri(c2, c3, r2); }
  // an edge a -> b of the slab, its section prof pushed out along `out` (at each end along its mitre), up by `up`
  const edge = (a, b, out, mA, mB, prof, seg) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / seg)), K = prof.length;
    const rows = [];
    for (let j = 0; j <= n; j++) {
      const t = j / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const m = j === 0 ? mA : j === n ? mB : out;
      const jit = j === 0 || j === n ? 1 : 0.78 + 0.44 * hash(x * 1.7, z * 1.7);   // (a cornice is never even)
      const inside = poly.length > 2 && inPoly(poly, x + out[0] * 0.3, z + out[2] * 0.3);   // (an eave over a wing's roof)
      rows.push({ x, y, z, m, jit, inside });
    }
    for (let j = 0; j < n; j++) {
      const r0 = rows[j], r1 = rows[j + 1];
      if (r0.inside && r1.inside) continue;
      for (let k = 0; k < K - 1; k++) {
        const v = (r, kk) => {
          const [o, h, fo, fh] = prof[kk], jo = kk === K - 1 ? 1 : r.jit;
          return { p: [r.x, r.y, r.z], d: [r.m[0] * o * jo * keep, h * keep, r.m[2] * o * jo * keep], f: [r.m[0] * fo, fh, r.m[2] * fo] };
        };
        // the section's normal: across its slope, out and up
        const nrm = (kk) => {
          const a0 = prof[Math.max(0, kk - 1)], a1 = prof[Math.min(K - 1, kk + 1)];
          const to = a1[0] - a0[0], th = a1[1] - a0[1], l = Math.hypot(to, th) || 1;
          const no = th / l, nh = -to / l;                   // (the section's tangent turned out)
          return [out[0] * no, nh, out[2] * no];
        };
        const q = [v(r0, k), v(r1, k), v(r1, k + 1), v(r0, k + 1)], nq = [nrm(k), nrm(k), nrm(k + 1), nrm(k + 1)];
        for (const idx of [0, 1, 2, 0, 2, 3]) {
          A.p.push(...q[idx].p); A.d.push(...q[idx].d); A.f.push(...q[idx].f);
          const nn = nq[idx], l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
          A.n.push(nn[0] / l, nn[1] / l, nn[2] / l);
        }
      }
    }
  };
  const neg = (v) => [-v[0], 0, -v[2]], add = (a, b) => [a[0] + b[0], 0, a[2] + b[2]];
  const front = neg(EZ), back = EZ, left = neg(EX), right = EX;
  if (!gable) {
    // the four eaves, mitred at the corners (the miter of two square edges: their outward directions added)
    edge(c1, c2, front, add(front, left), add(front, right), EAVE, 1.6);
    edge(c2, c3, right, add(right, front), add(right, back), EAVE, 1.6);
    edge(c3, c4, back, add(back, right), add(back, left), EAVE, 1.6);
    edge(c4, c1, left, add(left, back), add(left, front), EAVE, 1.6);
  } else {
    edge(c1, c2, front, add(front, left), add(front, right), EAVE, 1.6);
    edge(c3, c4, back, add(back, right), add(back, left), EAVE, 1.6);
    // the verges, up from the eaves' corners to the ridge's ends and down again
    edge(c1, r1, left, add(left, front), left, VERGE, 1.6); edge(r1, c4, left, left, add(left, back), VERGE, 1.6);
    edge(c2, r2, right, add(right, front), right, VERGE, 1.6); edge(r2, c3, right, right, add(right, back), VERGE, 1.6);
  }
}

export class SnowRoofs {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'snowRoofs'; this.group.visible = false;
    scene.add(this.group);
    this.mat = snowSlabMaterial();
    this.cells = new Map();                    // 'i,j' -> frame offsets in ROOF_FRAMES
    for (let i = 0; i < ROOF_FRAMES.length; i += N) {
      const k = Math.floor(ROOF_FRAMES[i] / CELL) + ',' + Math.floor(ROOF_FRAMES[i + 1] / CELL);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(i);
    }
    this.meshes = new Map(); this.at = ''; this.tris = 0;
  }
  build(key) {
    const A = { p: [], d: [], f: [], n: [] };
    for (const i of this.cells.get(key) ?? []) slab(ROOF_FRAMES, i, A);
    if (!A.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
    g.setAttribute('snowDir', new THREE.Float32BufferAttribute(A.d, 3));
    g.setAttribute('snowFix', new THREE.Float32BufferAttribute(A.f, 3));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 1;               // (the slab rises out of what the roofs span)
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
    this.tris += A.p.length / 9;
    return m;
  }
  // every frame: shown while the snow lies deep enough; the cells round you built as you reach them
  update(eye) {
    const depth = SNOW.uSnowDepth.value, on = SNOW.uSnow.value > 0.9 && depth > 0.04;
    this.group.visible = on;
    SLAB_T.value = on ? Math.min(0.42, depth - 0.02) + 0.015 : 0;
    SLAB_FIX.value = THREE.MathUtils.smoothstep(depth, 0.04, 0.15);
    if (!on) return;
    const ci = Math.floor(eye.x / CELL), cj = Math.floor(eye.z / CELL), at = ci + ',' + cj;
    if (at === this.at) return;
    this.at = at;
    const r = Math.ceil(RAD / CELL);
    for (const [k, m] of this.meshes) { const [i, j] = k.split(',').map(Number); if (m) m.visible = Math.abs(i - ci) <= r && Math.abs(j - cj) <= r; }
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const k = i + ',' + j;
      if (this.meshes.has(k) || !this.cells.has(k)) continue;
      const m = this.build(k);
      this.meshes.set(k, m);
      if (m) this.group.add(m);
    }
  }
}

// Icicles (V114): where the sun melts the snow on a roof and the water freezes again at the eaves, in the cold air
// beyond the warm roof. Under the eaves of the roofs within ~60 m of you, hanging from the gutter's lip: in clusters
// along an eave (no eave is hung all along), 6-55 cm long, a few longer; the more and the longer the more the eave faces
// south (the sun's side: geo/data.js origin.bearing gives the compass), some on any side (a warm house melts its snow
// from below). They grow with the snow on the roof and go with it. One cone of ice, rippled, tapering to a point
// (5 sides, 5 rings: 50 triangles): instanced, one draw per 40 m cell, the 3 x 3 round you (an icicle further off is a
// pixel or two). Glossy, half clear, out of the rain's and snow's shaders.
const ICELL = 40;
export const ICE_K = { value: 0 };             // how far grown (0-1)
function icicleGeometry() {
  const pts = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5, r = 0.028 * Math.pow(1 - t, 0.85) * (1 + 0.14 * Math.sin(t * 17.0)) + (k === 5 ? 0.0003 : 0);
    pts.push(new THREE.Vector2(r, -t));
  }
  return new THREE.LatheGeometry(pts, 5);
}
export class Icicles {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'icicles'; this.group.visible = false;
    scene.add(this.group);
    this.geo = icicleGeometry();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xe6f0f6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.74, envMapIntensity: 1.7 });
    this.mat.userData.noWet = true;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uIceK = ICE_K;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uIceK;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, position.y * uIceK, position.z);');
    };
    this.mat.customProgramCacheKey = () => 'icicle';
    const th = (GEO.meta?.origin?.bearing ?? 0) * Math.PI / 180;
    this.south = [-Math.sin(th), -Math.cos(th)];   // (the world's x, z towards the south: main.js's compass)
    this.cells = new Map();
    for (let i = 0; i < ROOF_FRAMES.length; i += N) {
      const k = Math.floor(ROOF_FRAMES[i] / ICELL) + ',' + Math.floor(ROOF_FRAMES[i + 1] / ICELL);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(i);
    }
    this.meshes = new Map(); this.at = ''; this.count = 0;
  }
  build(key) {
    const F = ROOF_FRAMES, mats = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (const i of this.cells.get(key) ?? []) {
      const cx = F[i], cz = F[i + 1], ex0 = F[i + 2], ex1 = F[i + 3], ez0 = F[i + 4], ez1 = F[i + 5], H = F[i + 6], D = F[i + 7], eY = F[i + 9], gable = F[i + 11] > 0.5, bld = GEO.buildings[F[i + 13]];
      const poly = [];
      if (bld) for (let k = 0; k < bld.p.length; k += 2) poly.push([bld.p[k], bld.p[k + 1]]);
      const P = (s, u) => [cx + ex0 * s + ez0 * u, cz + ex1 * s + ez1 * u];
      // the eaves: [from, to, outward x, z]
      const eaves = [[P(-H, -D), P(H, -D), -ez0, -ez1], [P(H, D), P(-H, D), ez0, ez1]];
      if (!gable) eaves.push([P(H, -D), P(H, D), ex0, ex1], [P(-H, D), P(-H, -D), -ex0, -ex1]);
      for (const [a, b, ox, oz] of eaves) {
        const sun = ox * this.south[0] + oz * this.south[1], f = 0.3 + 0.7 * Math.min(1, Math.max(0, (sun + 0.3) / 1.1));
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0.12 + 0.2 * hash(a[0], a[1]); d < L - 0.12; d += 0.07 + 0.13 * hash(d * 3.1 + a[0], a[1])) {
          const t = d / L, x = a[0] + (b[0] - a[0]) * t + ox * 0.1, z = a[1] + (b[1] - a[1]) * t + oz * 0.1;
          // clusters along the eave: a slow wave of where the water runs off
          const cl = 0.5 + 0.5 * Math.sin(d * 1.3 + hash(a[0] * 0.3, a[1] * 0.3) * 6.28) * Math.sin(d * 0.47 + 2.0);
          if (cl < 0.55 - 0.3 * f) continue;
          if (poly.length > 2 && inPoly(poly, x - ox * 0.5, z - oz * 0.5) && inPoly(poly, x + ox * 0.35, z + oz * 0.35)) continue;   // (an eave over a wing)
          const r = hash(x * 7.3, z * 7.3), len = (0.35 + 0.65 * f) * (cl - 0.15) * (0.1 + 0.55 * r * r + (r > 0.95 ? 0.4 : 0));
          if (len < 0.04) continue;
          const w = 0.6 + 0.9 * Math.min(1, len / 0.45);
          q.setFromEuler(e.set((hash(x, z * 3.0) - 0.5) * 0.08, r * 6.28, (hash(x * 3.0, z) - 0.5) * 0.08));
          m4.compose(ps.set(x, eY - 0.12, z), q, sc.set(w, len, w));
          mats.push(m4.clone());
        }
      }
    }
    if (!mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, mats.length);
    mats.forEach((m, k) => im.setMatrixAt(k, m));
    im.computeBoundingSphere();
    im.castShadow = false; im.receiveShadow = false;
    this.count += mats.length;
    return im;
  }
  update(eye, on, grow) {
    this.group.visible = on && grow > 0.02;
    ICE_K.value = grow;
    if (!this.group.visible) return;
    const ci = Math.floor(eye.x / ICELL), cj = Math.floor(eye.z / ICELL), at = ci + ',' + cj;
    if (at === this.at) return;
    this.at = at;
    for (const [k, m] of this.meshes) { const [i, j] = k.split(',').map(Number); if (m) m.visible = Math.abs(i - ci) <= 1 && Math.abs(j - cj) <= 1; }
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const k = i + ',' + j;
      if (this.meshes.has(k) || !this.cells.has(k)) continue;
      const m = this.build(k);
      this.meshes.set(k, m);
      if (m) this.group.add(m);
    }
  }
}
