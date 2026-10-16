import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { forestCode } from './geo/data.js';

// The birds of the woods and the meadows by day (late September):
//  * common buzzard (Buteo buteo): one or two soaring in wide circles over the woods' edges and the meadows, 40-120 m up,
//    wings in a shallow V, now and then a few flaps; the mewing "pee-yow";
//  * hooded crows (Corvus cornix, grey and black, the crow of Romania): a loose flock crossing from wood to field, down
//    on the meadows walking and pecking; they lift off when you come close;
//  * Eurasian jays (Garrulus glandarius): pinkish brown, white rump, blue in the wing; short undulating flights from
//    crown to crown in the woods (autumn: hiding acorns), screeching at you;
//  * tits (great and blue): small parties flitting through the crowns at the woods' edges, the bounding flight;
//  * a great spotted woodpecker heard drumming in the woods.
// Each species' birds share five instanced meshes (body, two inner and two outer wing halves) posed every frame: one
// draw call per part. None at night or in a downpour; buzzards and crows stay in the snow.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a bird: body along +z, wings along x; scale 1 = a crow (0.45 m long); colours per region
function birdGeo(c) {
  const col = (g, rgb) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(rgb, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };
  const body = new THREE.SphereGeometry(1, 10, 7); body.scale(0.07, 0.065, 0.17);
  const head = new THREE.SphereGeometry(0.055, 9, 6); head.translate(0, 0.035, 0.16);
  const beak = new THREE.ConeGeometry(0.016, 0.06, 6); beak.rotateX(Math.PI / 2); beak.translate(0, 0.03, 0.235);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.01, -0.12, -0.06, 0.005, -0.3, 0.06, 0.005, -0.3, 0, 0.01, -0.12, 0.06, 0.005, -0.3, -0.06, 0.005, -0.3], 3));
  tail.computeVertexNormals();
  const parts = [col(body, c.body), col(head, c.head), col(beak, c.beak), col(tail, c.tail)];
  if (c.rump) { const r = new THREE.SphereGeometry(0.04, 6, 4); r.scale(1.2, 0.5, 1); r.translate(0, 0.045, -0.1); parts.push(col(r, c.rump)); }
  const wing = (x0, x1, w0, w1, rgb, patch) => {
    // a wing half from x0 to x1 (span), chord w0 at its root, w1 at its tip (both sides: drawn double-sided)
    const g = new THREE.BufferGeometry(), p = [x0, 0, 0.04, x1, 0, 0.02, x1, 0, 0.02 - w1, x0, 0, 0.04, x1, 0, 0.02 - w1, x0, 0, 0.04 - w0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    const a = new Float32Array(18); for (let i = 0; i < 6; i++) a.set(patch && i % 3 === 1 ? patch : rgb, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  return {
    body: mergeGeometries(parts.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; })),
    inner: wing(0, 0.24, 0.16, 0.14, c.wing, c.patch), outer: wing(0, 0.26, 0.14, 0.07, c.tip ?? c.wing),
  };
}
const RGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const KINDS = {
  buzzard: { scale: 1.75, colors: { body: RGB(0x6a4c34), head: RGB(0x5a4030), beak: RGB(0x2a2420), tail: RGB(0x8a6a4c), wing: RGB(0x5e4430), tip: RGB(0x3a2a20), patch: RGB(0xc8b49a) }, n: [1, 2], day: true, snow: true },
  crow: { scale: 1, colors: { body: RGB(0x8e9092), head: RGB(0x1a1a1c), beak: RGB(0x141414), tail: RGB(0x1a1a1c), wing: RGB(0x1c1c1e) }, n: [4, 9], day: true, snow: true },
  jay: { scale: 0.75, colors: { body: RGB(0xb9907a), head: RGB(0xc4a08a), beak: RGB(0x2a2a2a), tail: RGB(0x1c1c20), wing: RGB(0x3a3434), patch: RGB(0x3a6ad0), rump: RGB(0xf2f0ea) }, n: [1, 3], day: true, snow: true, forest: true },
  tit: { scale: 0.33, colors: { body: RGB(0xd6c040), head: RGB(0x1c1c1c), beak: RGB(0x222222), tail: RGB(0x56686a), wing: RGB(0x5a7268) }, n: [6, 12], day: true, snow: true, forest: true },
};

class Flock {
  constructor(scene, key, n) {
    const k = this.k = KINDS[key];
    this.key = key;
    const g = (Flock.geo ??= {})[key] ??= birdGeo(k.colors);
    const mat = Flock.mat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.meshes = ['body', 'inner', 'inner', 'outer', 'outer'].map((p) => { const m = new THREE.InstancedMesh(g[p], mat, n); m.castShadow = key !== 'tit'; m.userData.noAO = true; m.userData.ueSkip = 'birds'; m.frustumCulled = false; scene.add(m); return m; });
    this.birds = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, h: 0, pitch: 0, bank: 0, phase: Math.random() * 6, flap: 1, mode: 'fly', t: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0, wait: 0 }));
    this.scene = scene;
  }
  dispose() { for (const m of this.meshes) { this.scene.remove(m); m.dispose(); } }
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), off = new THREE.Vector3();
const R = Math.random;

export class Birds {
  constructor(scene, world, { audio = null } = {}) { this.scene = scene; this.world = world; this.audio = audio; this.flocks = []; this.timer = 0; this.drumT = 15; }
  ground(x, z) { return this.world.groundHeight(x, z); }
  forestNear(x, z) { return forestCode(x, z) > 0; }
  // a place for the flock: buzzards over open ground by a wood, jays and tits in the wood (tits at its edge), crows on a meadow
  site(key, st) {
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = 40 + R() * 140, x = st.px + Math.sin(a) * d, z = st.pz + Math.cos(a) * d, f = this.forestNear(x, z);
      if (key === 'jay' && !f) continue;
      if (key === 'tit' && !(f && (!this.forestNear(x + 20, z) || !this.forestNear(x - 20, z) || !this.forestNear(x, z + 20) || !this.forestNear(x, z - 20)))) continue;
      if (key === 'crow' && f) continue;
      return { x, z };
    }
    return null;
  }
  spawn(key, st) {
    const k = KINDS[key], c = this.site(key, st);
    if (!c) return;
    const n = k.n[0] + Math.floor(R() * (k.n[1] - k.n[0] + 1)), f = new Flock(this.scene, key, n);
    f.cx = c.x; f.cz = c.z; f.r = key === 'buzzard' ? 35 + R() * 30 : 8; f.alt = key === 'buzzard' ? 50 + R() * 60 : key === 'crow' ? 22 : key === 'jay' ? 14 : 9; f.dir = R() < 0.5 ? 1 : -1;
    f.callT = 5 + R() * 20; f.life = 0;
    for (const b of f.birds) {
      b.x = c.x + (R() - 0.5) * 12; b.z = c.z + (R() - 0.5) * 12; b.y = this.ground(b.x, b.z) + f.alt + (R() - 0.5) * 4;
      b.ang = R() * Math.PI * 2;
      if (key === 'crow' && R() < 0.7) { b.mode = 'ground'; b.y = this.ground(b.x, b.z); b.h = R() * 6.28; }
      if (key === 'jay' || key === 'tit') { b.mode = 'perch'; b.wait = R() * 5; b.y = this.ground(b.x, b.z) + 6 + R() * 10; }
    }
    this.flocks.push(f);
  }
  // st: { px, pz, camX, camZ, day (0..1), rain, snow }
  update(dt, t, st) {
    if ((this.timer -= dt) <= 0) {
      this.timer = 2;
      for (const f of [...this.flocks]) { f.life += 2; if (Math.hypot(f.cx - st.px, f.cz - st.pz) > 320 || st.day < 0.3 || st.rain > 0.3) { f.dispose(); this.flocks.splice(this.flocks.indexOf(f), 1); } }
      if (st.day > 0.4 && st.rain < 0.3) for (const key of Object.keys(KINDS)) {
        const want = key === 'buzzard' ? 1 : key === 'crow' ? 1 : key === 'jay' ? (this.forestNear(st.px, st.pz) ? 1 : 0) : 1;
        if (this.flocks.filter(f => f.key === key).length < want && R() < 0.5) this.spawn(key, st);
      }
      // the woodpecker drums somewhere in the wood
      if ((this.drumT -= 2) <= 0) { this.drumT = 25 + R() * 50; if (st.day > 0.4 && st.rain < 0.3 && this.forestNear(st.px + 40, st.pz) + this.forestNear(st.px - 40, st.pz) + this.forestNear(st.px, st.pz + 40) > 0) this.audio?.birdCall('woodpecker', 35 + R() * 60); }
    }
    for (const f of this.flocks) this.fly(f, dt, t, st);
  }

  fly(f, dt, t, st) {
    const k = f.k, key = f.key, sc = k.scale;
    const dP = Math.hypot(f.cx - st.px, f.cz - st.pz);
    if ((f.callT -= dt) <= 0) { f.callT = key === 'buzzard' ? 18 + R() * 30 : 8 + R() * 18; if (key !== 'tit') this.audio?.birdCall(key, dP); }
    f.birds.forEach((b, i) => {
      const gy = this.ground(b.x, b.z);
      const near = Math.hypot(b.x - st.px, b.z - st.pz);
      if (key === 'buzzard') {
        // soaring: a circle drifting with the wind, the wings still; a few flaps now and then
        b.ang += f.dir * dt * (14 / f.r);
        f.cx += dt * 0.6; f.cz += dt * 0.25;
        const tx = f.cx + Math.cos(b.ang + i * 2.5) * f.r, tz = f.cz + Math.sin(b.ang + i * 2.5) * f.r;
        b.y += ((this.ground(tx, tz) + f.alt + i * 8) - b.y) * dt * 0.2;
        b.h = Math.atan2(tx - b.x, tz - b.z); b.x = tx; b.z = tz;
        b.bank = -f.dir * 0.32; b.pitch = 0;
        b.flap = ((t + i * 7) % 14) < 1.6 ? 1 : 0;
        b.phase += dt * 2.4 * Math.PI * 2;
        b.wing = b.flap ? Math.sin(b.phase) * 0.6 : 0.12;
      } else if (key === 'crow') {
        if (b.mode === 'ground') {
          b.y = gy; b.pitch = 0; b.bank = 0; b.wing = -1.35;                 // folded
          if ((b.wait -= dt) <= 0) { b.wait = 0.5 + R() * 2; b.h += (R() - 0.5) * 1.5; const st2 = R() < 0.6 ? 0.25 : 0; b.x += Math.sin(b.h) * st2; b.z += Math.cos(b.h) * st2; }
          b.pitch = Math.sin(t * 5 + i) > 0.6 ? 0.5 : 0;                        // pecking
          if (near < 28 || R() < dt * 0.01) { b.mode = 'fly'; b.vy = 4; b.tx = b.x + (R() - 0.5) * 160; b.tz = b.z + (R() - 0.5) * 160; this.audio?.birdCall('wings', near); }
        } else {
          const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
          const sp = 11;
          b.h = Math.atan2(dx, dz);
          b.x += Math.sin(b.h) * sp * dt; b.z += Math.cos(b.h) * sp * dt;
          const want = gy + (d > 25 ? f.alt : 0);
          b.y += Math.max(-4 * dt, Math.min(5 * dt, (want - b.y) * dt * 1.5));
          b.phase += dt * 3.6 * Math.PI * 2; b.wing = Math.sin(b.phase) * 0.75; b.bank = 0; b.pitch = 0;
          if (d < 2 || b.y < gy + 0.2) { b.mode = 'ground'; b.y = gy; b.wait = 1; f.cx = b.x; f.cz = b.z; }
        }
      } else {
        // jays and tits: perched in a crown (still, now and then a turn), then a short bounding flight to the next one
        if (b.mode === 'perch') {
          b.wing = -1.35; b.pitch = 0; b.bank = 0;
          if ((b.wait -= dt) <= 0 || near < (key === 'jay' ? 20 : 9)) {
            b.mode = 'fly';
            const a = R() * Math.PI * 2, d = key === 'jay' ? 15 + R() * 25 : 4 + R() * 9;
            b.tx = b.x + Math.sin(a) * d; b.tz = b.z + Math.cos(a) * d; b.ty = this.ground(b.tx, b.tz) + (key === 'jay' ? 8 + R() * 10 : 5 + R() * 9);
            if (key === 'jay' && near < 25) this.audio?.birdCall('jay', near);
          }
        } else {
          const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz), sp = key === 'jay' ? 9 : 7;
          b.h = Math.atan2(dx, dz);
          const st2 = Math.min(d, sp * dt);
          b.x += Math.sin(b.h) * st2; b.z += Math.cos(b.h) * st2;
          b.y += (b.ty - b.y) * Math.min(1, dt * 2) + Math.sin(t * 9 + i) * dt * 1.5;   // (bounding)
          b.phase += dt * (key === 'tit' ? 14 : 6) * Math.PI * 2;
          b.wing = (Math.sin(t * 2.2 + i) > -0.2 ? Math.sin(b.phase) * 0.8 : -1.2);    // bursts of beats, wings closed between
          if (d < 0.3) { b.mode = 'perch'; b.wait = 2 + R() * (key === 'tit' ? 4 : 10); }
        }
      }
      // pose the five parts
      e.set(b.pitch, b.h, b.bank, 'YXZ'); q.setFromEuler(e);
      s.setScalar(sc);
      const show = Math.hypot(b.x - st.camX, b.z - st.camZ) < 260;
      m4.compose(p.set(b.x, b.y + (b.mode === 'ground' ? 0.06 * sc : 0), b.z), q, show ? s : s.setScalar(0));
      f.meshes[0].setMatrixAt(i, m4);
      const fold = b.wing < -1, wa = fold ? 0 : b.wing, wo = fold ? 0 : b.wing * 0.6 + (key === 'buzzard' ? 0.18 : 0);
      for (const [mi, side, part] of [[1, 1, 0], [2, -1, 0], [3, 1, 1], [4, -1, 1]]) {
        // the inner half from the shoulder; the outer from the inner's tip; folded: both along the body
        qw.setFromEuler(e.set(0, fold ? side * 1.45 : 0, side * (part ? wa + wo : wa), 'YXZ'));
        const qq = q.clone().multiply(qw);
        off.set(side * 0.04, 0.02, 0.03);
        if (part) { off.x += side * 0.24 * Math.cos(fold ? 0 : wa); off.y += 0.24 * Math.sin(fold ? 0 : wa) * 1; if (fold) { off.set(side * 0.05, 0.03, -0.2); } }
        off.applyQuaternion(q).multiplyScalar(sc);
        m4.compose(p.set(b.x + off.x, b.y + off.y + (b.mode === 'ground' ? 0.06 * sc : 0), b.z + off.z), qq, side < 0 ? s.set(-sc, sc, sc) : s.set(sc, sc, sc));
        if (!show) m4.makeScale(0, 0, 0);
        f.meshes[mi].setMatrixAt(i, m4);
      }
    });
    for (const m of f.meshes) m.instanceMatrix.needsUpdate = true;
  }
  info() { return this.flocks.map(f => ({ key: f.key, n: f.birds.length, x: +f.cx.toFixed(0), z: +f.cz.toFixed(0) })); }
}
