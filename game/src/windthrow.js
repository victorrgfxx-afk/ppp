import * as THREE from 'three';
import { gustAt } from './treewind.js';
import { heightAt } from './geo/data.js';

// (V118) Windthrow in the storm (furtună): edge trees broken by the gusts.
//
//  * Which: the trees on the forest's edge where the open ground lies upwind - they take the wind of the open field on
//    their whole crown, where the trees inside stand in the canopy's lee. (Edge trees that have long stood there are
//    sturdier than the ones inside - ForestGALES treats an acclimated edge apart - so it is their weak ones that go.)
//  * When: a healthy stem snaps at a wind of ~42 m/s whatever its size or kind (Virot et al., Phys. Rev. E 2016: the
//    critical speed only ~9 % higher for a tree twice as tall), ±10 % from tree to tree. The storm's crowns take up to
//    ~32 m/s in the strongest bursts (main.js: its gale and the gusts the wind carries through the woods, gustAt -
//    the same field the crowns are seen to lean in), so a healthy tree all but never goes; one in ~8 has a defect - a
//    rotten or cracked stem, a canker, an old wound - that takes its strength down to 55-80 % (23-34 m/s): these are
//    the ones that break, each the first time a gust at its own place passes its own limit.
//  * How: the stem snaps low where it has a defect (12-42 % of its height), else at 25-50 %; the top turns over about
//    the leeward fibres, which hold like a hinge, under its weight - a rod about its end, th'' ~ (3 g / 2 L) sin th, the
//    crown's weight a little higher - and the wind on its crown, and is down in 2-4 s; it stops where its crown meets
//    the ground, or, falling into the wood as it mostly does, the next tree's crown (a hung tree). The stump stays,
//    jagged with pale fresh splinters; the crack, the rush of the crown and the crash come after the sound has
//    travelled.
const G = 9.81, UC = 42, R_SCAN = 170;
const fr = (x) => x - Math.floor(x);
const h1 = (x, z, k) => fr(Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453);
// a tree's own limit: its critical wind at the crown (m/s), and whether it has a defect
function limitOf(x, z) {
  if (h1(x, z, 1) < 0.12) return { uc: UC * (0.55 + 0.25 * h1(x, z, 2)), defect: true };
  const u1 = Math.max(1e-6, h1(x, z, 3)), u2 = h1(x, z, 4);
  return { uc: UC * (1 + 0.1 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)), defect: false };
}
const UP = new THREE.Vector3(0, 1, 0);
const WOOD = new THREE.MeshStandardMaterial({ color: 0xd9c49b, roughness: 0.85 });          // (fresh beech or oak wood)
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: 0x9c8460, roughness: 0.9 });

// the break: a jagged cap of fresh wood over the stem's section and the splinters round its rim, pointing up (the
// stump) or down (the top)
function breakGeometry(r, y, dir, seed) {
  const pos = [], idx = [], N = 12;
  const rnd = (k) => h1(seed, k, 7.7);
  // the cap: a fan, its rim a little ragged
  const c0 = pos.length / 3; pos.push(0, y + dir * 0.04, 0);
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, rr = r * (0.95 + 0.12 * rnd(i)); pos.push(Math.cos(a) * rr, y + dir * (0.02 + 0.05 * rnd(i + 40)), Math.sin(a) * rr); }
  for (let i = 0; i < N; i++) dir > 0 ? idx.push(c0, c0 + 1 + (i + 1) % N, c0 + 1 + i) : idx.push(c0, c0 + 1 + i, c0 + 1 + (i + 1) % N);
  // the splinters: thin wedges standing from the rim, longer on the side the stem tore last
  for (let i = 0; i < 16; i++) {
    const a = (i + rnd(i + 80) * 0.6) / 16 * Math.PI * 2, rr = r * (0.55 + 0.45 * rnd(i + 120)), w = r * (0.18 + 0.15 * rnd(i + 160));
    const len = (0.12 + 0.55 * rnd(i + 200) ** 1.5) * (0.6 + 2.4 * r), ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
    const b = pos.length / 3;
    pos.push(ca * rr - tx * w, y, sa * rr - tz * w, ca * rr + tx * w, y, sa * rr + tz * w, ca * rr * 0.85, y, sa * rr * 0.85,
      ca * rr * (0.9 + 0.2 * rnd(i + 240)), y + dir * len, sa * rr * (0.9 + 0.2 * rnd(i + 240)));
    idx.push(b, b + 1, b + 3, b + 1, b + 2, b + 3, b + 2, b, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Windthrow {
  constructor(scene, forest, world, audio) {
    this.scene = scene; this.forest = forest; this.world = world; this.audio = audio;
    this.falls = []; this.scanT = 0; this.lastBreak = -1e9; this.t = 0; this.count = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    // the leaves torn off with the crown, blown along (one pool)
    const lg = new THREE.PlaneGeometry(0.07, 0.05);
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x6b6a2c, side: THREE.DoubleSide, roughness: 0.8 });
    this.leaves = new THREE.InstancedMesh(lg, this.leafMat, 160);
    this.leaves.count = 0; this.leaves.frustumCulled = false;
    this.leafP = [];
    scene.add(this.leaves);
  }
  // ctx: { on: 0..1 (the severe storm), crown: the wind at the crowns now (m/s), dir: the way it blows (unit, world xz),
  // cam: where you are, autumn: the leaves' colour }
  update(dt, ctx) {
    this.t += dt;
    for (const f of this.falls) if (!f.done) this.stepFall(f, dt, ctx);
    this.stepLeaves(dt, ctx);
    if (!(ctx.on > 0.5) || !this.forest?.treesNear) return;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.25;
    const wx = ctx.dir.x, wz = ctx.dir.y, c = ctx.cam;
    let best = null, over = 0;
    this.forest.treesNear(c.x, c.z, R_SCAN, (t) => {
      if (!(t.ox || t.oz)) return;
      const ty = this.forest.modelOf(t).type;
      if (!ty || ty.H * t.s < 7 || (ty.conifer && !ty.pine)) return;          // (not the bushes; the spruces go by the roots)
      const ol = Math.hypot(t.ox, t.oz), facing = -(t.ox * wx + t.oz * wz) / ol;
      if (facing < 0.35) return;                                             // (the open ground not upwind of it)
      const lim = limitOf(t.x, t.z);
      const U = ctx.crown * (0.62 + 0.76 * gustAt(t.x, t.z)) * (0.85 + 0.15 * facing);
      if (U - lim.uc > over) { over = U - lim.uc; best = t; }
    });
    // (one at a time: the gust that breaks one moves on through the wood)
    if (best && this.t - this.lastBreak > 1.2) { this.lastBreak = this.t; this.breakTree(best, wx, wz, ctx); }
  }
  breakTree(t, wx, wz, ctx) {
    const model = this.forest.modelOf(t), ty = model.type, lim = limitOf(t.x, t.z);
    const H = ty.H * t.s, r0 = (ty.trunkR ?? 0.3) * t.s;
    const hb = Math.max(1.1, (lim.defect ? 0.12 + 0.3 * h1(t.x, t.z, 5) : 0.25 + 0.25 * h1(t.x, t.z, 5)) * H);
    const yb = t.y + hb, rb = r0 * (1 - 0.28 * hb / H), L = H - hb;
    this.forest.removeTree(t);
    this.count++;
    // the way it falls: downwind, give or take ~20 deg
    const a = Math.atan2(wz, wx) + (h1(t.x, t.z, 6) - 0.5) * 0.7, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const P = new THREE.Vector3(t.x, yb, t.z).addScaledVector(d, rb);       // (the hinge: the leeward side of the stem)
    const axis = new THREE.Vector3().crossVectors(UP, d).normalize();
    // where it comes to rest: its crown on the ground, or on the next tree's crown in its way
    const cr = (ty.crown ?? 4) * t.s;
    let thG = 1.5;
    for (let th = 0.06; th < 1.55; th += 0.02) {
      const tx = P.x + d.x * L * Math.sin(th), tz = P.z + d.z * L * Math.sin(th), ty2 = P.y + L * Math.cos(th);
      if (ty2 - cr * 0.45 * Math.sin(th) < heightAt(tx, tz) + 0.3) { thG = th; break; }
    }
    let thN = 9;
    this.forest.treesNear(P.x, P.z, L + 6, (n) => {
      if (n === t) return;
      const rx = n.x - P.x, rz = n.z - P.z, along = rx * d.x + rz * d.z, lat = Math.abs(rx * d.z - rz * d.x);
      const nt = this.forest.modelOf(n).type, ncr = (nt?.crown ?? 3.5) * n.s, nH = (nt?.H ?? 15) * n.s;
      if (along < 1.5 || along > L * 0.95 || lat > ncr * 0.75 + cr * 0.25 || nH < hb + 3) return;
      thN = Math.min(thN, Math.asin(Math.min(1, Math.max(0, (along - ncr * 0.35) / (0.8 * L)))));
    });
    const hung = thN < thG;
    const stop = hung ? Math.max(thN, 0.7) : thG;                              // (its crown pushed ~40 deg and more into theirs)
    // the stump and the top: the tree's own model, cut at the break (the near materials: its colours, its wind)
    const M = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromAxisAngle(UP, t.rot), new THREE.Vector3(t.s, t.s, t.s));
    const below = new THREE.Plane(new THREE.Vector3(0, -1, 0), yb), above0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yb - 0.03), above = above0.clone();
    const stump = new THREE.Group(), top = new THREE.Group();
    top.matrixAutoUpdate = false;
    const tint = new THREE.Color(), mats = [];
    for (const [g, m0] of model.parts) {
      const leafy = !m0.userData.bark;
      tint.set(leafy ? ty.tint ?? 0xffffff : 0xffffff).multiplyScalar(t.v);
      for (const [grp, plane] of [[stump, below], [top, above]]) {
        if (grp === stump && leafy && hb < H * 0.3 && !ty.form?.startsWith?.('edge')) continue;   // (no crown that low, except an edge tree's skirt)
        const m = model.mat(m0, 1e5).clone();
        m.onBeforeCompile = model.mat(m0, 1e5).onBeforeCompile; m.customProgramCacheKey = model.mat(m0, 1e5).customProgramCacheKey;
        m.clippingPlanes = [plane]; mats.push(m);
        const im = new THREE.InstancedMesh(g, m, 1);
        im.setMatrixAt(0, M); im.setColorAt(0, tint); im.computeBoundingSphere();
        im.castShadow = false; im.receiveShadow = true; im.userData.noAO = true;
        grp.add(im);
      }
    }
    // the break's wood: the stump's cap and splinters (up), the top's (down)
    const sg = breakGeometry(rb, 0, 1, t.x + t.z), tg = breakGeometry(rb, 0, -1, t.x - t.z);
    const sm = new THREE.Mesh(sg, WOOD); sm.position.set(t.x, yb, t.z); stump.add(sm);
    const tm = new THREE.Mesh(tg, WOOD_DARK); tm.position.set(t.x, yb + 0.03, t.z); top.add(tm);
    this.scene.add(stump); this.scene.add(top);
    // the stump stands in your way still
    this.world.addStatic(new this.world.Box(t.x, t.z, rb + 0.05, rb + 0.05, 0, t.y - 1, yb + 0.3, 'tree'));
    const f = { t, top, P, axis, d, L, cr, th: 0.02, w: 0.22, stop, hung, above0, above, mats, done: false, hit: false, n: 0, U: ctx.crown };
    this.falls.push(f);
    this.setTop(f);
    // the sounds, after the sound has come this far: the crack and the splintering, the crown's rush as it goes
    const dist = Math.hypot(t.x - ctx.cam.x, yb - ctx.cam.y, t.z - ctx.cam.z);
    this.audio?.treeCrack?.(dist / 343, dist, r0);
    // the leaves torn off the crown with it
    this.spawnLeaves(new THREE.Vector3(t.x, yb + L * 0.7, t.z), cr, 70, ctx);
  }
  setTop(f) {
    const m = this._m, q = this._q.setFromAxisAngle(f.axis, f.th), r = this._r ??= new THREE.Matrix4(), p = this._p ??= new THREE.Matrix4();
    m.makeTranslation(-f.P.x, -f.P.y, -f.P.z).premultiply(r.makeRotationFromQuaternion(q)).premultiply(p.makeTranslation(f.P.x, f.P.y, f.P.z));
    f.top.matrix.copy(m); f.top.matrixWorldNeedsUpdate = true;
    f.above.copy(f.above0).applyMatrix4(m);
  }
  stepFall(f, dt, ctx) {
    const h = Math.min(dt, 0.05);
    // its weight about the hinge (the crown's ~1.2 g / L), the wind on its crown at first, the crown's drag in the air
    const push = f.th < 0.5 ? 0.06 * (f.U / 30) ** 2 : 0;
    f.w += (1.2 * G / f.L * Math.sin(f.th + 0.02) + push - 0.35 * f.w) * h;
    f.th += f.w * h;
    if (f.th >= f.stop) {
      f.th = f.stop;
      if (!f.hit) {
        f.hit = true;
        const dist = Math.hypot(f.P.x - ctx.cam.x, f.P.y - ctx.cam.y, f.P.z - ctx.cam.z);
        this.audio?.treeCrash?.(dist / 343, dist, f.hung);
        this.spawnLeaves(new THREE.Vector3(f.P.x + f.d.x * f.L * 0.7 * Math.sin(f.th), f.P.y + f.L * 0.7 * Math.cos(f.th), f.P.z + f.d.z * f.L * 0.7 * Math.sin(f.th)), f.cr, 60, ctx);
      }
      f.w = -0.22 * f.w;                                                     // (its branches give and throw it back up a little)
      if (Math.abs(f.w) < 0.04) {
        f.done = true;
        // down on the ground: its stem lies in your way
        if (!f.hung) {
          const len = f.L * 0.5, cx = f.P.x + f.d.x * len * 0.5, cz = f.P.z + f.d.z * len * 0.5, g0 = heightAt(cx, cz);
          this.world.addStatic(new this.world.Box(cx, cz, len * 0.5, 0.35, Math.atan2(-f.d.z, f.d.x), g0 - 0.5, g0 + 0.9, 'tree'));
        }
      }
    }
    this.setTop(f);
  }
  spawnLeaves(p, r, n, ctx) {
    for (let i = 0; i < n; i++) {
      if (this.leafP.length >= 160) this.leafP.shift();
      this.leafP.push({ x: p.x + (Math.random() - 0.5) * r, y: p.y + (Math.random() - 0.5) * r * 0.6, z: p.z + (Math.random() - 0.5) * r,
        vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, a: Math.random() * 6.28, s: 2 + Math.random() * 6, life: 7 + Math.random() * 4 });
    }
    this.leafMat.color.set(ctx.autumn ? 0x8a6a2a : 0x56632a);
  }
  stepLeaves(dt, ctx) {
    const L = this.leafP, wx = ctx.dir.x * ctx.crown, wz = ctx.dir.y * ctx.crown, m = this._m, q = this._q, v = this._v, s = this._s.set(1, 1, 1);
    let k = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      const g = heightAt(p.x, p.z);
      if (p.life <= 0 || (p.y < g + 0.02 && p.life < 3)) { L.splice(i, 1); continue; }
      // a leaf rides the wind (its drag ~ the air's speed relative to it) and falls at ~1-2 m/s
      const ax = (wx * 0.7 - p.vx) * 1.6, az = (wz * 0.7 - p.vz) * 1.6, ay = (-1.4 - p.vy) * 2.2;
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      p.x += p.vx * dt; p.y = Math.max(g + 0.02, p.y + p.vy * dt); p.z += p.vz * dt; p.a += p.s * dt;
    }
    for (const p of L) {
      if (k >= 160) break;
      q.setFromEuler((this._e ??= new THREE.Euler()).set(p.a, p.a * 0.7, p.a * 0.3));
      this.leaves.setMatrixAt(k++, m.compose(v.set(p.x, p.y, p.z), q, s));
    }
    this.leaves.count = k;
    if (k) this.leaves.instanceMatrix.needsUpdate = true;
  }
}
