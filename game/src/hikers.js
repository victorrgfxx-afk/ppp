import * as THREE from 'three';
import { Actor, makeCast } from './cast.js';
import { laneAt, CLIP, bankWeight, ROAD_O } from './geo/urcus.js';

// The user's clip IMG_0725, live on the lane through the wood above the meadow (geo/urcus.js) at 16:11 on a clear
// afternoon, as the clip has it: a grey-haired man walks barefoot in a white T-shirt and khaki shorts, a black and red
// backpack on, his boots hanging from his right hand; ~50 m ahead three walkers go on abreast (a dark blue shirt
// and a blue backpack, a light blue shirt, a white one and a pale cap), along the bank past the thicket. They come up the
// lane from the bend below the meadow (~250 m, 4 minutes; each comes round the bend in turn) to the top of the rise, stop and
// look about. It happens again after you have been 250 m away; the clip's own view (in the photo list) puts you where it
// was filmed, at the moment it shows. You walk among them: each has a collider, they do not walk through you.
const D = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const T_CLIP = 28;                         // s: the clip's moment
const S_IN = 1165;                                // they come round the bend at s = 1165 m and walk towards smaller s
// at the clip's moment ([s, o] on the lane, from the clip: geo/urcus.js); stop: where each stands at the top (lane s)
const [MAN, WA, WB, WC] = [CLIP.man, ...CLIP.walkers];
const WALKERS = [
  { kind: 'barefoot', s: MAN[0], o: MAN[1], v: 1.0, stop: 918, o2: -1.6, pack: [0x1c1d22, 0x27282e], boots: true },
  { kind: 'walkerA', s: WA[0], o: WA[1], or: ROAD_O[0], v: 1.12, stop: 909, o2: 1.6, pack: [0x24407a, 0x1d2c52] },
  { kind: 'walkerB', s: WB[0], o: WB[1], or: ROAD_O[1], v: 1.12, stop: 907, o2: -0.4 },
  { kind: 'walkerC', s: WC[0], o: WC[1], or: ROAD_O[2], v: 1.12, stop: 910.5, o2: 0.6 },
];
// the first of them comes round the bend this long before the clip's moment
export const T_START = Math.floor(Math.min(...WALKERS.map(w => T_CLIP - (S_IN - w.s) / w.v)));
const CYCLE = 1.36;                               // m walked per stride cycle (two steps)
const ORDER = WALKERS.map(w => w.kind);

export class Hikers {
  // ground(x, z): the surface under the feet (world); world: the collision world; renderer: to make their shaders before
  // they are seen
  constructor(scene, ground, world, renderer) {
    this.scene = scene; this.groundW = ground; this.world = world; this.renderer = renderer;
    const o = laneAt(0, 0);
    this.origin = { x: o.x, z: o.z, y: ground(o.x, o.z) };
    this.stage = new THREE.Group(); this.stage.position.set(o.x, this.origin.y, o.z); scene.add(this.stage);
    this.state = 'off'; this.ready = false; this.t = 0; this.tn = 0;
    this.end = Math.max(...WALKERS.map(w => T_CLIP + (w.s - w.stop) / w.v));
    this._f = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._s = new THREE.Sphere();
  }
  ground(x, z) { return this.groundW(x + this.origin.x, z + this.origin.z) - this.origin.y; }
  local(s, o) { const p = laneAt(s, o); return { x: p.x - this.origin.x, z: p.z - this.origin.z, hx: p.hx, hz: p.hz }; }
  // the four bodies, made in a worker (cast.js) as soon as it is the clip's hour; their backpacks and the boots
  prepare(camera) {
    if (this.making) return;
    this.making = makeCast(ORDER).then(async ({ bodies, how, ms }) => {
      this.how = how; this.buildMs = ms;
      this.actors = WALKERS.map((w) => {
        const a = new Actor(bodies[w.kind]);
        a.w = w; a.feet = null;
        a.box = new this.world.Box(0, 0, 0.22, 0.22, 0, -1e4, 1e4, 'actor'); a.boxIn = false;
        if (w.pack) a.bones[2].add(backpack(w.pack));
        if (w.boots) { a.boots = boots(); this.stage.add(a.boots); }
        this.stage.add(a.mesh);
        return a;
      });
      // their shaders made now, while nobody sees them (and so no stutter when they come into view)
      this.stage.updateMatrixWorld(true);
      for (const a of this.actors) a.mesh.visible = true;
      const done = this.renderer.compileAsync ? this.renderer.compileAsync(this.stage, camera, this.scene) : Promise.resolve();
      for (const a of this.actors) { a.mesh.visible = false; if (a.boots) a.boots.visible = false; }
      await done.catch(() => {});
      this.ready = true;
    });
  }
  // the clip's moment, now (its view in the photo list)
  atClip() { this.state = 'run'; this.t = T_CLIP; this.clip = true; }
  // ctx: ok (16:11, clear), px pz (you, world), camera
  update(dt, ctx) {
    this.tn += dt;
    if (!ctx.ok) { if (this.state !== 'off') this.hide(); this.state = 'off'; return; }
    this.prepare(ctx.camera);
    if (!this.ready) return;
    const px = ctx.px - this.origin.x, pz = ctx.pz - this.origin.z;
    const mid = this.local(1040, 0), far = Math.hypot(px - mid.x, pz - mid.z);
    ctx.camera.updateMatrixWorld();
    this._m.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse); this._f.setFromProjectionMatrix(this._m);
    if (this.state === 'off') {
      // from the start; not before your eyes
      const start = this.local(S_IN, 0);
      if (this.clip || far > 140 || !this.seen(start.x, start.z, 18)) { this.state = 'run'; if (!this.clip) this.t = T_START; }
      else return;
    }
    if (far > 250 && !this.clip) { this.t = T_START; this.hide(); return; }      // away: it starts again when you come back
    if (far < 220) this.t = Math.min(this.t + dt, this.end + 600);
    this.clip = false;
    for (const a of this.actors) this.pose(a, this.t, px, pz);
  }
  seen(x, z, r) {
    this._s.center.set(x + this.origin.x, this.ground(x, z) + this.origin.y + 1, z + this.origin.z); this._s.radius = r;
    return this._f.intersectsSphere(this._s);
  }
  hide() {
    for (const a of this.actors ?? []) {
      a.mesh.visible = false; if (a.boots) a.boots.visible = false; a.feet = null;
      if (a.boxIn) { this.world.removeDynamic(a.box); a.boxIn = false; }
    }
  }
  // one walker at time t: up the lane at its pace, then standing at the top, looking about
  pose(a, t, px, pz) {
    // d: metres walked from the bend (the lane at S_IN - d)
    const w = a.w, end = S_IN - w.stop, d0 = (S_IN - w.s) + w.v * (t - T_CLIP), d = Math.max(0.5, Math.min(end, d0)), walking = d0 > 0.5 && d0 < end;
    if (d0 < 0) { if (a.mesh.visible) { a.mesh.visible = false; if (a.boots) a.boots.visible = false; if (a.boxIn) { this.world.removeDynamic(a.box); a.boxIn = false; } } return; }   // (not yet round the bend)
    // at the top they spread out across the lane (o2) and turn to the view
    // on the asphalt, along the bank past the thicket (the three: where the clip has them), at the top spread across it
    const sl = S_IN - d, ow = w.or === undefined ? w.o : w.or + (w.o - w.or) * bankWeight(sl);
    const u = Math.max(0, Math.min(1, (d - (end - 6)) / 6)), o = ow + (w.o2 - ow) * u * u * (3 - 2 * u);
    const p = this.local(sl, o);
    if (!a.mesh.visible) {
      a.mesh.visible = true; if (a.boots) a.boots.visible = true;
      if (!a.boxIn) { this.world.addDynamic(a.box); a.boxIn = true; }
    }
    let yaw = Math.atan2(-p.hx, -p.hz) / D;                               // (walking towards smaller s)
    if (!walking) yaw -= 55 + (w.o2 * 9);                                   // standing: turned to the meadow and the valley
    const ph = d / CYCLE, sd = w.kind.length * 7, n = (f, k) => Math.sin(this.tn * f + sd + k) * 0.5 + Math.sin(this.tn * f * 2.3 + sd * 1.7 + k) * 0.5;
    const g = this.ground(p.x, p.z), hipY = a.J.hips[1] - (walking ? 0.035 : 0.015);
    const bob = walking ? Math.abs(Math.sin(ph * 2 * Math.PI)) * 0.022 : 0;
    const hips = a.bones[0];
    hips.position.set(p.x, g + hipY + bob, p.z);
    hips.quaternion.setFromEuler(new THREE.Euler((walking ? 5 : 1) * D, yaw * D, (walking ? Math.sin(ph * 2 * Math.PI) * 2 : n(0.4, 1) * 1.5) * D, 'YXZ'));
    a.bones[1].rotation.set(0.02, walking ? Math.sin(ph * 2 * Math.PI) * 0.05 : 0, 0); a.bones[2].rotation.set(0.02, walking ? -Math.sin(ph * 2 * Math.PI) * 0.08 : 0, 0);
    const look = walking ? n(0.35, 3) * 8 : n(0.22, 3) * 35;
    a.bones[3].rotation.set(-0.04, look * 0.4 * D, 0); a.bones[4].rotation.set(walking ? 0.06 : -0.04, look * 0.6 * D, 0);
    a.fk();
    // the feet: planted, then swung forward (no sliding: a foot on the ground stays where it is while the body walks on)
    const fx = Math.sin(yaw * D), fz = Math.cos(yaw * D), rx = fz, rz = -fx, reach = 0.55 * CYCLE;
    for (const [L, sg, phase] of [['L', 1, 0.5], ['R', -1, 0]]) {
      let tg;
      if (walking) {
        const q = ((ph + phase) % 1 + 1) % 1, stance = q < 0.55, v = stance ? q / 0.55 : (q - 0.55) / 0.45;
        const s = stance ? reach * (0.5 - v) : reach * (-0.5 + v), lift = stance ? 0 : Math.sin(Math.PI * v) * 0.09;
        const bx = p.x + fx * (0.06 + s) + rx * sg * 0.1, bz = p.z + fz * (0.06 + s) + rz * sg * 0.1;
        tg = V(bx, this.ground(bx, bz) + 0.06 + lift, bz);
      } else {
        const bx = p.x + rx * sg * 0.12 + fx * 0.04, bz = p.z + rz * sg * 0.12 + fz * 0.04;
        tg = V(bx, this.ground(bx, bz) + 0.06, bz);
      }
      a.ik('thigh' + L, tg, a.point('hips', [sg * 0.08, -0.3, 0.9]), V(0, 0, 1));
    }
    // the arms swing against the legs; the man's right hand carries his boots
    for (const [L, sg, phase] of [['L', 1, 0.5], ['R', -1, 0]]) {
      const sw = walking ? Math.sin((ph + phase) * 2 * Math.PI) * 0.17 : 0.02;
      const carry = w.boots && L === 'R';
      const tg = a.point('chest', carry ? [sg * 0.25, -0.56, 0.07 + sw * 0.25] : [sg * 0.25, -0.53, sw]);
      a.ik('upperArm' + L, tg, a.point('chest', [sg * 0.55, -0.45, -0.7]), V(0, 0, -1));
    }
    if (a.boots) {
      const h = a.point('handR', [0, -0.09, 0.02]), swing = walking ? Math.sin(ph * 2 * Math.PI) * 0.22 : n(0.5, 5) * 0.05;
      a.boots.position.copy(h); a.boots.rotation.set(swing, yaw * D, 0, 'YXZ');
    }
    const [wx, wz] = [p.x + this.origin.x, p.z + this.origin.z];
    a.box.x = wx; a.box.z = wz; a.box.update();
  }
}

// a hiking backpack on the back (in the chest bone's frame): the bag, its darker lid, the red bottom pocket
let packMats = null;
function backpack([body, lid]) {
  packMats ??= {};
  const m = (c) => (packMats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 }));
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.44, 0.19, 2, 2, 2), m(body));
  bag.position.set(0, -0.05, -0.23);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.08, 0.2), m(lid));
  top.position.set(0, 0.2, -0.22);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.2), m(0x6a1d24));
  pocket.position.set(0, -0.24, -0.235);
  for (const o of [bag, top, pocket]) { o.castShadow = true; o.receiveShadow = true; g.add(o); }
  if (body !== 0x1c1d22) pocket.material = m(lid);                        // (only the man's has the red pocket)
  return g;
}
// a pair of hiking boots hanging by their laces (origin: the hand)
function boots() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x2a231e, roughness: 0.7 }), sole = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.9 });
  for (const sx of [-0.045, 0.05]) {
    const b = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.17, 10), mat); shaft.position.set(0, -0.12, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.27), mat); foot.position.set(0, -0.2, 0.07);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.29), sole); so.position.set(0, -0.245, 0.07);
    for (const o of [shaft, foot, so]) { o.castShadow = true; b.add(o); }
    b.position.x = sx; b.rotation.z = sx * 0.6;
    g.add(b);
  }
  return g;
}
