import * as THREE from 'three';
import { glockModel, magazineModel, BORE, RAKE, GRIP_C, MAG_AXIS, MUZZLE, EJECT } from './glock.js';
import { prepareHands, barHands, barWrists, skinMaterial, prepareArms, gripArms } from './hand.js';
import { ik, poseArm, INV, ARM } from './driver.js';

// The Glock 18 on the concrete slab of the cross on the hill (V85): picked up with E, then yours. Two-handed in front of
// you (your hands and arms: hand.js, the driver's; the right round the grip, the left wrapped over it), it fires as the
// G18 does: full auto at ~1200 rounds a minute or one round a pull (X: the selector on the slide), 33 in the magazine
// and one in the chamber; R reloads, the way Call of Duty 4 shows it - the gun tipped toward the left hand, the
// magazine dropped (it lies where it falls), the hand down to the belt and back with a full one, pushed home and
// slapped; from an empty gun (the slide locked back) the left hand then racks the slide over the top. The right button
// aims down the sights (the view narrows); Q puts it away and takes it out.
// The rounds: subsonic 9 mm (147 grain, ~295 m/s: the suppressed load), each flying its arc (gravity, frame by frame)
// to what it meets: the ground (dust, a mark), a wall or a house (a puff of plaster and a hole), a trunk (bark), a car
// or the cross's steel (sparks and a ring); people and animals are not targets here (the rounds go past them). The
// spent cases fly out to the right, bounce and stay a while. The sound: the suppressor's cough and the slide's clatter.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CAP = 33, RESERVE = 99, RPM = 1200, V0 = 295, G = 9.81, VM_FOV = 55;
const R_TUBE = 0.019, L_TUBE = 0.024;                      // (the hands sculpted round: the grip; the grip and the right hand)
const LIVING = new Set(['actor', 'npc', 'dog', 'bear']);
const pose = (x, y, z, rx, ry, rz) => ({ p: V3(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')) });
// the gun's poses in the camera's frame: from the hip, aimed down the sights (the rear sight's notch on the eye's line),
// running, put away, tucked against a wall
const HIP = pose(0.082, -0.098, -0.315, 0.03, 0.05, -0.03);
const ADS = pose(0, -0.0222, -0.255, 0, 0, 0);
const SPRINT = pose(0.07, -0.165, -0.27, -0.55, 0.45, 0.42);
const DOWN = pose(0.07, -0.42, -0.2, -1.1, 0.3, 0.3);
const TUCK = pose(0.075, -0.07, -0.2, 0.6, 0.18, -0.15);
// the hands in the gun's frame: the right round the grip (its bar up the grip's rake), the left over it
const Q_GRIP = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -RAKE);
const RH = { p: GRIP_C.clone().add(V3(0.001, 0, 0.002)), q: Q_GRIP.clone() };
const LH = { p: GRIP_C.clone().add(V3(-0.006, -0.006, -0.014)), q: Q_GRIP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), 0.5)) };
// the left hand racking the slide over the top: the bar along the slide, the back of the hand up
const LH_RACK = { p: V3(0, BORE + 0.006, -0.016), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, -1, 0), V3(0, 0, 1), V3(-1, 0, 0))) };   // (the wrist to the left, the fingers over to the right side)
// the left hand holding a magazine (the magazine's frame: its mouth at the origin, its length down -y), low on it
const LH_MAG = { p: V3(0, -0.135, 0.0), q: new THREE.Quaternion() };
// down at the belt, out of sight (the camera's frame)
const BELT = pose(-0.12, -0.46, -0.12, -0.6, 0.4, 0.6);

// the reloads: the gun's own motion over the pose [t, x, y, z, rx, ry, rz], the left hand's [t, where, blend], the events
const TACT = { dur: 1.55, drop: 0.15, insert: [0.82, 0.95], slap: 0.95,
  gun: [[0, 0, 0, 0, 0, 0, 0], [0.16, -0.02, 0.022, 0.012, 0.14, 0.1, 0.5], [0.85, -0.02, 0.024, 0.012, 0.15, 0.1, 0.52], [0.96, -0.02, 0.036, 0.006, 0.06, 0.1, 0.5],
    [1.05, -0.02, 0.026, 0.012, 0.12, 0.1, 0.46], [1.3, -0.008, 0.01, 0.004, 0.05, 0.04, 0.18], [1.55, 0, 0, 0, 0, 0, 0]],
  left: [[0, 'grip'], [0.12, 'grip'], [0.3, 'belt'], [0.5, 'belt'], [0.82, 'magIn0'], [0.95, 'magIn1'], [1.05, 'magIn1'], [1.3, 'grip']] };
const EMPTY = { dur: 2.05, drop: 0.15, insert: [0.82, 0.95], slap: 0.95, rack: [1.25, 1.38], release: 1.38,
  gun: [[0, 0, 0, 0, 0, 0, 0], [0.16, -0.02, 0.022, 0.012, 0.14, 0.1, 0.5], [0.85, -0.02, 0.024, 0.012, 0.15, 0.1, 0.52], [0.96, -0.02, 0.036, 0.006, 0.06, 0.1, 0.5],
    [1.1, -0.012, 0.02, 0.01, 0.1, 0.05, -0.12], [1.38, -0.01, 0.018, 0.02, 0.08, 0.04, -0.15], [1.45, -0.008, 0.02, 0.0, 0.03, 0.03, -0.1], [1.75, -0.004, 0.006, 0.0, 0.02, 0.02, 0.0], [2.05, 0, 0, 0, 0, 0, 0]],
  left: [[0, 'grip'], [0.12, 'grip'], [0.3, 'belt'], [0.5, 'belt'], [0.82, 'magIn0'], [0.95, 'magIn1'], [1.02, 'magIn1'], [1.25, 'rack0'], [1.38, 'rack1'], [1.45, 'rack1'], [1.75, 'grip']] };
// the first time you take it up: the slide racked to chamber a round
const FIRST = { dur: 1.15, rack: [0.55, 0.7], release: 0.7,
  gun: [[0, 0, 0, 0, 0, 0, 0], [0.35, -0.012, 0.02, 0.01, 0.1, 0.05, -0.12], [0.7, -0.01, 0.018, 0.02, 0.08, 0.04, -0.15], [0.78, -0.008, 0.02, 0, 0.03, 0.03, -0.1], [1.15, 0, 0, 0, 0, 0, 0]],
  left: [[0, 'grip'], [0.15, 'grip'], [0.4, 'rack0'], [0.7, 'rack1'], [0.76, 'rack1'], [1.05, 'grip']] };

const smooth = (t) => t * t * (3 - 2 * t);
function track(keys, t, out) {                         // (the gun's keys: piecewise smooth)
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], f = b[0] > a[0] ? smooth(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 1;
  for (let k = 1; k < 7; k++) out[k - 1] = a[k] + (b[k] - a[k]) * f;
  return out;
}

export class Glock {
  constructor(scene, world, audio, cross) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.owned = false; this.out = 0; this.want = false; this.first = true;
    this.mag = CAP; this.chambered = false; this.locked = false; this.reserve = RESERVE; this.auto = true;
    this.reload = null; this.cool = 0; this.ads = 0; this.sprint = 0; this.tuck = 0; this.trig = false;
    this.bloom = 0; this.kickP = V3(); this.kickR = V3(); this.kickPv = V3(); this.kickRv = V3(); this.slide = 0; this.slideV = 0; this.selT = 0;
    this.camKick = 0; this.prevYaw = null; this.prevPitch = 0; this.sway = V3(); this.t = 0; this.fovMul = 1;
    // ---- in your hands: the gun, the hands, the arms, all in the camera's frame (placed every frame)
    const vm = this.vm = new THREE.Group(); vm.name = 'viewmodel'; vm.matrixAutoUpdate = false; vm.visible = false;
    const m = this.model = glockModel();
    this.gun = new THREE.Group(); this.gun.matrixAutoUpdate = false; this.gun.add(m.group); vm.add(this.gun);
    m.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.newMag = magazineModel(m.M); this.newMag.matrixAutoUpdate = false; this.newMag.visible = false; vm.add(this.newMag);
    this.oldMag = magazineModel(m.M); this.oldMag.matrixAutoUpdate = false; this.oldMag.visible = false; vm.add(this.oldMag);
    for (const g of [this.newMag, this.oldMag]) g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.skin = { hand: skinMaterial(), arm: skinMaterial(true) };
    this.hands = null; this.arms = null;
    prepareHands(R_TUBE); prepareHands(L_TUBE); prepareArms();
    scene.add(vm);
    // ---- the world's: on the slab, and the things it leaves (cases, dropped magazines, marks, puffs)
    this.fx = new Effects(scene, m.M);
    this.place(cross);
    this.hud = new GunHud();
  }

  // ---- on the slab of the cross: on its right side between two of the cross's legs, the spare magazines beside it
  place(cross) {
    if (!cross) return;
    const top = cross.y + 0.35, c = Math.cos(cross.rot), s = Math.sin(cross.rot);
    const at = (lx, lz) => V3(cross.x + lx * c + lz * s, top, cross.z - lx * s + lz * c);   // (the slab's frame: landmarks.js)
    const lying = glockModel();
    lying.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = this.lying = new THREE.Group();
    const yaw = cross.rot + 0.9;
    lying.group.quaternion.setFromAxisAngle(V3(0, 0, 1), -Math.PI / 2);   // (its right side down: the selector up)
    lying.group.position.set(0, 0.0172, 0);
    g.add(lying.group);
    // (the spare magazines side by side beside it: each on its side, its length along the gun's)
    const qm = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -Math.PI / 2));
    for (let k = 0; k < 3; k++) {
      const mg = magazineModel(lying.M);
      mg.quaternion.copy(qm);
      mg.position.set(0.11 + k * 0.042, 0.0125, -0.13 + k * 0.012);
      g.add(mg);
    }
    g.position.copy(at(1.85, 1.75)); g.rotation.y = yaw;
    this.scene.add(g);
    this.spot = g.position.clone();
  }

  // the prompt to pick it up (and E takes it), when you stand by it; null else
  pickup(cam, input) {
    if (this.owned || !this.spot) return null;
    const d = cam.position.distanceTo(this.spot);
    if (d > 2.2) return null;
    if (input.hit('KeyE')) {
      this.owned = true; this.want = true; this.out = 0; this.reload = null;
      this.scene.remove(this.lying); this.lying = null;
      this.audio?.gunCloth?.();
      return '';
    }
    return 'E — ia Glock 18-ul (cu amortizor, în bandă albă de iarnă) și încărcătoarele de lângă el';
  }

  // every frame (logic): ctx { dt, camera, input, player, foot (on foot, not riding), snow }
  update(ctx) {
    const { dt, input, player } = ctx;
    ctx.world ??= this.world; ctx.audio ??= this.audio;
    this.t += dt;
    const free = this.owned && ctx.foot;
    if (!free) { this.out = 0; this.vm.visible = false; this.reload = null; this.hud.show(false); this.fovMul = 1; this.ads = 0; player.aimSlow = 1; this.fx.update(dt, ctx); return; }
    if (input.hit('KeyQ')) { this.want = !this.want; this.audio?.gunCloth?.(); }
    // taking it out / putting it away
    this.out = Math.max(0, Math.min(1, this.out + (this.want ? dt / 0.45 : -dt / 0.35)));
    const ready = this.out >= 1;
    if (ready && this.first) { this.first = false; this.startReload(FIRST); }
    // the selector
    if (input.hit('KeyX') && ready && !this.reload) { this.auto = !this.auto; this.selT = 0.35; this.audio?.gunSelect?.(); this.hud.flash(this.auto ? 'AUTOMAT' : 'FOC CU FOC'); }
    this.selT = Math.max(0, this.selT - dt);
    // reloading
    if (input.hit('KeyR') && ready) this.tryReload();
    if (this.reload) this.stepReload(dt);
    // running, aiming, a wall in front
    const hs = Math.hypot(player.vel.x, player.vel.z), running = (input.down('ShiftLeft') || input.down('ShiftRight')) && hs > 4;
    const aiming = input.down('Mouse2') && ready && !running && !(this.reload && this.reload.k !== FIRST);
    this.ads = damp1(this.ads, aiming ? 1 : 0, 14, dt);
    this.sprint = damp1(this.sprint, running && !this.trig ? 1 : 0, 8, dt);
    this.tuck = damp1(this.tuck, this.wallAhead(ctx.camera) ? 1 : 0, 10, dt);
    player.aimSlow = 1 - 0.4 * this.ads;
    this.fovMul = 1 - 0.2 * this.ads;
    // the trigger
    const pull = input.down('Mouse0') && ready && this.tuck < 0.5;
    const pressed = input.hit('Mouse0') && ready && this.tuck < 0.5;
    this.cool = Math.max(0, this.cool - dt);
    if (pull && !this.reload && this.sprint < 0.5) {
      if (this.chambered && (this.auto || pressed)) { while (this.cool <= 0 && this.chambered) { this.shoot(ctx); this.cool += 60 / RPM; if (!this.auto) break; } }
      else if (!this.chambered && pressed) { this.audio?.gunDry?.(); if (this.reserve > 0) this.tryReload(); }
    }
    if (!pull) this.cool = Math.min(this.cool, 0);
    this.trig = pull;
    this.bloom = Math.max(0, this.bloom - dt * (pull ? 0.02 : 0.12));
    // the recoil's springs (the gun in the hands; the view's kick partly comes back)
    spring(this.kickP, this.kickPv, 260, 26, dt); spring(this.kickR, this.kickRv, 220, 22, dt);
    const back = this.camKick * Math.min(1, dt * 7);
    this.camKick -= back; player.pitch -= back * 0.6;
    // the slide: back on a shot and home again (a quick spring), held back once the last round has gone (the slide stop)
    if (this.reload?.slideHeld) { /* (in the left hand: stepReload) */ }
    else if (this.locked) this.slide = damp1(this.slide, 0.027, 40, dt);
    else { this.slideV += (-this.slide * 2600 - this.slideV * 70) * dt; this.slide = Math.max(0, this.slide + this.slideV * dt); }
    // the sway: the gun lags behind the turning view and swings back
    if (this.prevYaw === null) { this.prevYaw = player.yaw; this.prevPitch = player.pitch; }
    let dy = player.yaw - this.prevYaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = player.pitch - this.prevPitch; this.prevYaw = player.yaw; this.prevPitch = player.pitch;
    this.sway.x = damp1(this.sway.x + dp * 0.5, 0, 9, dt); this.sway.y = damp1(this.sway.y + dy * 0.5, 0, 9, dt);
    this.sway.x = Math.max(-0.12, Math.min(0.12, this.sway.x)); this.sway.y = Math.max(-0.12, Math.min(0.12, this.sway.y));
    this.vm.visible = this.out > 0;
    this.hud.show(ready || this.out > 0.5);
    this.hud.set(this.mag + (this.chambered ? 1 : 0), this.reserve, this.auto, this.reload ? (this.reload.k === FIRST ? '' : 'Reîncarcă…') : (!this.chambered && this.reserve <= 0 && this.mag <= 0 ? 'Fără muniție' : (this.mag + (this.chambered ? 1 : 0) <= 6 ? 'R — reîncarcă' : '')));
    this.hud.cross(this.out > 0.9 && this.ads < 0.5 && this.sprint < 0.5, this.spread(player), ctx.camera.fov);
    this.fx.update(dt, ctx);
  }

  spread(player) {
    const hs = Math.hypot(player.vel.x, player.vel.z);
    return (0.024 + 0.02 * Math.min(1, hs / 6) + this.bloom) * (1 - 0.82 * this.ads) + (player.onGround ? 0 : 0.03);
  }

  tryReload() {
    if (this.reload || this.mag >= CAP || this.reserve <= 0) return;
    this.startReload(this.chambered ? TACT : EMPTY);
  }
  startReload(k) { this.reload = { k, t: 0, done: {}, slideHeld: false }; if (k !== FIRST) this.audio?.gunCloth?.(); }
  stepReload(dt) {
    const r = this.reload, k = r.k, t0 = r.t; r.t += dt;
    const at = (x) => t0 < x && r.t >= x;
    if (k.drop !== undefined && at(k.drop)) { this.dropT = 0; this.audio?.magOut?.(); }
    if (k.insert && at(k.insert[1])) {
      const take = Math.min(CAP - this.mag, this.reserve);
      this.mag += take; this.reserve -= take; this.audio?.magIn?.();
      this.kickPv.y += 0.25; this.kickRv.x -= 1.5;            // (the slap)
    }
    if (k.rack && at(k.rack[0])) { r.slideHeld = true; this.audio?.slideBack?.(); }
    if (k.rack && r.t >= k.rack[0] && r.t < k.release) this.slide = 0.027 + 0.003 * smooth(Math.min(1, (r.t - k.rack[0]) / (k.rack[1] - k.rack[0])));
    if (k.release !== undefined && at(k.release)) {
      r.slideHeld = false; this.locked = false; this.slideV = -1.6;
      if (!this.chambered && this.mag > 0) { this.mag--; this.chambered = true; }
      this.audio?.slideRelease?.();
    }
    if (r.t >= k.dur) this.reload = null;
  }

  // a wall right in front: the gun is tucked up (it would go through it)
  wallAhead(cam) {
    if ((this._wallT = (this._wallT ?? 0) + 1) % 4) return this._wall;
    cam.getWorldDirection(_d);
    const hit = this.trace(cam.position, _d.multiplyScalar(0.75), 1, true);
    return (this._wall = !!hit);
  }

  // ---- a shot
  shoot(ctx) {
    const { camera, player } = ctx;
    if (this.mag > 0) this.mag--; else { this.chambered = false; this.locked = true; }
    // the round: from the eye along the view, scattered by the spread
    camera.getWorldDirection(_d);
    const sp = this.spread(player), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp * 0.5;
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion); _r.crossVectors(_d, _u).normalize(); _u.crossVectors(_r, _d);
    _v.copy(_d).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize().multiplyScalar(V0);
    const hit = this.trace(camera.position, _v, 2.5);
    if (hit) this.fx.impact(hit, camera.position, ctx, this.audio);
    // the kick: the gun back and up in the hands, the view up a little (more of it comes back than stays)
    const k = 1 - 0.55 * this.ads;
    this.kickPv.z += 0.55 * k; this.kickPv.y += 0.12 * k; this.kickRv.x += (2.4 + Math.random()) * k; this.kickRv.y += (Math.random() - 0.5) * 1.6 * k; this.kickRv.z += (Math.random() - 0.5) * 2 * k;
    const up = (0.0055 + Math.random() * 0.002) * (1 - 0.3 * this.ads);
    player.pitch = Math.min(1.45, player.pitch + up); this.camKick += up;
    player.yaw += (Math.random() - 0.5) * 0.004;
    this.bloom = Math.min(0.045, this.bloom + 0.006);
    this.slideV = 3.2;                                          // (the slide flies back, the spring brings it home)
    this.audio?.gunShot?.();
    // the case out of the port, the suppressor's little puff (in the world: where they are in the hands)
    this.placeView(camera);
    _m4.multiplyMatrices(this.vm.matrix, this.gun.matrix);
    this.fx.casing(_a.copy(EJECT).applyMatrix4(_m4), camera, player.vel);
    this.fx.puff(_b.copy(MUZZLE).applyMatrix4(_m4), 0.035, 0.5, 0xd8d6d2, 0.45);
  }

  // where a round (or a probe) from o with velocity v meets something within tMax seconds: { p, n, tag, t, d } | null
  trace(o, v, tMax, probe = false) {
    const world = this.world, step = probe ? 1 : 0.02, out = [];
    let x = o.x, y = o.y, z = o.z, vx = v.x, vy = v.y, vz = v.z, t = 0, d = 0;
    while (t < tMax) {
      const nx = x + vx * step, nz = z + vz * step, nvy = probe ? vy : vy - G * step, ny = y + (vy + nvy) * 0.5 * step;
      // the boxes along the segment
      const mx = (x + nx) / 2, mz = (z + nz) / 2, half = Math.hypot(nx - x, nz - z) / 2;
      world.query(mx, mz, half + 1.5, out);
      let best = null;
      for (const b of out) {
        if (LIVING.has(b.tag) || b.ghost) continue;
        let y0 = b.y0, y1 = b.y1;
        if (b.tag === 'car') { const gy = b.vehicle?.car?.group?.position?.y ?? world.groundHeight(b.x, b.z); y0 = gy - 0.1; y1 = gy + 1.5; }
        const h = segBox(x, y, z, nx, ny, nz, b, y0, y1);
        if (h && (!best || h.f < best.f)) best = { ...h, b };
      }
      // the ground along it (every ~0.5 m)
      const L = Math.hypot(nx - x, ny - y, nz - z), n = Math.max(1, Math.ceil(L / 0.5));
      let gf = null;
      for (let i = 1; i <= n; i++) {
        const f = i / n, px = x + (nx - x) * f, py = y + (ny - y) * f, pz = z + (nz - z) * f;
        if (py < world.groundHeight(px, pz, py + 0.5)) {
          let lo = (i - 1) / n, hi = f;
          for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2, qx = x + (nx - x) * mid, qy = y + (ny - y) * mid, qz = z + (nz - z) * mid; if (qy < world.groundHeight(qx, qz, qy + 0.5)) hi = mid; else lo = mid; }
          gf = hi; break;
        }
      }
      if (gf !== null && (!best || gf < best.f)) {
        const px = x + (nx - x) * gf, pz = z + (nz - z) * gf, e = 0.25;
        const h0 = world.groundHeight(px, pz), hx = world.groundHeight(px + e, pz), hz = world.groundHeight(px, pz + e);
        return { p: V3(px, h0, pz), n: V3(-(hx - h0) / e, 1, -(hz - h0) / e).normalize(), tag: 'ground', t: t + gf * step, d: d + gf * L };
      }
      if (best) return { p: V3(x + (nx - x) * best.f, y + (ny - y) * best.f, z + (nz - z) * best.f), n: best.n, tag: best.b.tag, t: t + best.f * step, d: d + best.f * L, box: best.b };
      x = nx; y = ny; z = nz; vy = nvy; t += step; d += L;
    }
    return null;
  }

  // ---- the hands' frames and the view: every frame, last (the camera's final place)
  // (the hands and the gun are seen with a field of view of their own, ~55 deg up and down, whatever the camera's - the
  // game's natural one can be 25 deg: a gun 30 cm in front would fill the screen; as games draw their weapons: the frame
  // squeezed across by the ratio of the two lenses, its depth kept; a little narrower aimed, the gun nearer)
  placeView(camera) {
    camera.updateMatrixWorld();
    const k = Math.tan(camera.fov * Math.PI / 360) / Math.tan(VM_FOV * (1 - 0.12 * this.ads) * Math.PI / 360);
    this.vm.matrix.copy(camera.matrixWorld).multiply(_sc.makeScale(k, k, 1));
    this.vm.matrixWorldNeedsUpdate = true;
  }
  draw(camera, player) {
    if (!this.vm.visible) return;
    this.placeView(camera);
    // the gun's pose: hip / aimed / running / tucked, down when put away; the sway, the bob, the breath, the recoil
    blend(_P, HIP, ADS, this.ads); blendTo(_P, SPRINT, this.sprint * (1 - this.ads)); blendTo(_P, TUCK, this.tuck);
    blendTo(_P, DOWN, 1 - smooth(this.out));
    const bob = player.bobAmt * (1 - 0.8 * this.ads), ph = player.bobPhase;
    _P.p.x += Math.cos(ph) * 0.006 * bob + this.sway.y * 0.08; _P.p.y += -Math.abs(Math.sin(ph)) * 0.008 * bob - this.sway.x * 0.06 - player.landShake * 0.5 + Math.sin(this.t * 1.4) * 0.0012 * (1 - this.ads);
    _P.p.add(this.kickP);
    _e.set(this.kickR.x * 0.6 - this.sway.x * 0.7 + Math.sin(this.t * 1.1) * 0.003 * (1 - this.ads), this.kickR.y * 0.6 - this.sway.y * 0.9, this.kickR.z * 0.6 - this.sway.y * 0.5 + Math.cos(ph) * 0.01 * bob, 'YXZ');
    _q.setFromEuler(_e); _P.q.multiply(_q);
    // a reload's own motion of the gun; the selector's flick
    const r = this.reload;
    if (r) {
      const o = track(r.k.gun, r.t, _o);
      _P.p.x += o[0]; _P.p.y += o[1]; _P.p.z += o[2];
      _q.setFromEuler(_e.set(o[3], o[4], o[5], 'YXZ')); _P.q.multiply(_q);
    }
    if (this.selT > 0) { const s = Math.sin(this.selT / 0.35 * Math.PI); _P.p.y += 0.01 * s; _q.setFromEuler(_e.set(0.05 * s, 0, -0.25 * s, 'YXZ')); _P.q.multiply(_q); }
    this.gun.matrix.compose(_P.p, _P.q, ONE); this.gun.matrixWorldNeedsUpdate = true;
    // the moving parts
    const m = this.model;
    m.slide.position.z = this.slide;
    m.trigger.rotation.x = this.trig && this.chambered ? -0.25 : 0;
    m.selector.rotation.x = this.auto ? -0.9 : 0;
    // the magazine: seated, out (dropped), or coming in in the left hand
    this.mags(r);
    this.limbs(r);
  }

  mags(r) {
    const m = this.model, seat = m.mag.userData.seat;
    m.mag.visible = true; m.mag.position.copy(seat);
    this.newMag.visible = false;
    if (!r || r.k === FIRST) { this.oldMag.visible = false; return; }
    const k = r.k;
    // the old one: out at the drop, falling out of the grip, gone after a little (dropped into the world)
    if (r.t >= k.drop) {
      const tf = r.t - k.drop;
      m.mag.visible = false;
      if (tf < 0.35) {
        this.oldMag.visible = true;
        _m4.copy(this.gun.matrix).multiply(_n4.compose(_a.copy(seat).addScaledVector(MAG_AXIS, 0.25 * tf + 2.4 * tf * tf), m.mag.quaternion, ONE));
        this.oldMag.matrix.copy(_m4); this.oldMag.matrixWorldNeedsUpdate = true;
      } else if (this.oldMag.visible) {
        this.oldMag.visible = false;
        this.fx.dropMag(_m4b.multiplyMatrices(this.vm.matrix, this.oldMag.matrix), this.model.M);
      }
    }
    // the new one: from the belt in the left hand, then up the grip's axis into the well
    if (r.t >= 0.5 && r.t < k.insert[1]) {
      this.newMag.visible = true;
      const f = r.t < k.insert[0] ? 1 : 1 - smooth((r.t - k.insert[0]) / (k.insert[1] - k.insert[0]));
      // (its place below the well, 6 cm down at the start of the push; before that it is in the hand: limbs())
      _m4.copy(this.gun.matrix).multiply(_n4.compose(_a.copy(seat).addScaledVector(MAG_AXIS, 0.06 * f), m.mag.quaternion, ONE));
      this.magIn = _m4.clone();
      if (r.t < k.insert[0]) this.magInFree = true; else this.magInFree = false;
      this.newMag.matrix.copy(_m4); this.newMag.matrixWorldNeedsUpdate = true;
    } else if (r.t >= k.insert[1]) { m.mag.visible = true; this.magIn = null; }
  }

  // the hands on the gun and the arms to them
  limbs(r) {
    if (!this.hands) {
      const h0 = barHands(R_TUBE), h1 = barHands(L_TUBE);
      if (h0 && h1) {
        this.hands = [h1.left, h0.right].map(g => { const ms = new THREE.Mesh(g, this.skin.hand); ms.matrixAutoUpdate = false; ms.frustumCulled = false; this.vm.add(ms); return ms; });
        this.wr = [barWrists(L_TUBE)[1], barWrists(R_TUBE)[0]];
      }
    }
    if (!this.arms) {
      const ag = gripArms();
      if (ag) this.arms = [ag.left, ag.right].map(geo => {
        const bones = INV.map(() => new THREE.Bone()), sk = new THREE.SkinnedMesh(geo, this.skin.arm);
        sk.bindMode = THREE.DetachedBindMode; sk.bind(new THREE.Skeleton(bones, INV.map(x => x.clone())), new THREE.Matrix4());
        sk.matrixAutoUpdate = false; sk.frustumCulled = false;
        this.vm.add(sk);
        return bones;
      });
    }
    if (!this.hands) return;
    // the right hand: on the grip always
    _HR.multiplyMatrices(this.gun.matrix, _n4.compose(RH.p, RH.q, ONE));
    // the left: on the grip, or down at the belt, or with the magazine, or racking the slide
    const left = this.leftPose(r);
    const H = [left, _HR];
    for (let i = 0; i < 2; i++) { this.hands[i].matrix.copy(H[i]); this.hands[i].matrixWorldNeedsUpdate = true; }
    if (!this.arms) return;
    for (let i = 0; i < 2; i++) {
      const w = this.wr[i], S = SH[i];
      _w.copy(w.at).applyMatrix4(H[i]); _bk.copy(w.back).transformDirection(H[i]);
      ik(S, _w, ARM, POLE[i], _el, _tip);
      poseArm(this.arms[i], S, _el, _tip, _bk);
    }
  }
  leftPose(r) {
    const onGrip = _HL.multiplyMatrices(this.gun.matrix, _n4.compose(LH.p, LH.q, ONE));
    if (!r) return onGrip;
    const keys = r.k.left;
    let i = 0;
    while (i < keys.length - 2 && r.t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], f = b[0] > a[0] ? smooth(Math.min(1, Math.max(0, (r.t - a[0]) / (b[0] - a[0])))) : 1;
    const A = this.leftAt(a[1], onGrip, _LA), B = this.leftAt(b[1], onGrip, _LB);
    // (between two places: the positions and the turns blended)
    A.decompose(_a, _q, _s); B.decompose(_b, _q2, _s);
    _a.lerp(_b, f); _q.slerp(_q2, f);
    // the new magazine rides in the hand until the push
    if (this.newMag.visible && this.magInFree) {
      const hm = _HL.compose(_a, _q, ONE);
      this.newMag.matrix.multiplyMatrices(hm, _n4.compose(LH_MAG.p, LH_MAG.q, ONE).invert()); this.newMag.matrixWorldNeedsUpdate = true;
      return hm;
    }
    return _HL.compose(_a, _q, ONE);
  }
  leftAt(name, onGrip, out) {
    if (name === 'grip') return out.copy(onGrip);
    if (name === 'belt') return out.compose(BELT.p, BELT.q, ONE);
    if (name === 'magIn0' || name === 'magIn1') {
      // (the hand low on the magazine where it will be: below the well, 6 cm down / pushed home)
      const seat = this.model.mag.userData.seat;
      _n4.compose(_c.copy(seat).addScaledVector(MAG_AXIS, name === 'magIn0' ? 0.06 : 0), this.model.mag.quaternion, ONE);
      return out.multiplyMatrices(this.gun.matrix, _n4).multiply(_m4b.compose(LH_MAG.p, LH_MAG.q, ONE));
    }
    // racking: on the slide's rear, pulled back with it
    const pull = name === 'rack1' ? 0.03 : 0;
    return out.multiplyMatrices(this.gun.matrix, _n4.compose(_c.copy(LH_RACK.p).add(V3(0, 0, pull)), LH_RACK.q, ONE));
  }
}

// ---- the world's side: cases, dropped magazines, bullet marks, dust and sparks
const _d = V3(), _u = V3(), _r = V3(), _v = V3(), _a = V3(), _b = V3(), _c = V3(), _w = V3(), _bk = V3(), _el = V3(), _tip = V3(), _s = V3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _n4 = new THREE.Matrix4();
const _sc = new THREE.Matrix4(), _HR = new THREE.Matrix4(), _HL = new THREE.Matrix4(), _LA = new THREE.Matrix4(), _LB = new THREE.Matrix4(), _o = [0, 0, 0, 0, 0, 0];
const _P = { p: V3(), q: new THREE.Quaternion() }, ONE = V3(1, 1, 1);
// the shoulders (the camera's frame) and which way each elbow bends
const SH = [V3(-0.19, -0.25, 0.05), V3(0.19, -0.25, 0.05)], POLE = [V3(-0.6, -1, 0.25).normalize(), V3(0.6, -1, 0.25).normalize()];
const damp1 = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function spring(x, v, k, c, dt) { v.addScaledVector(x, -k * dt).multiplyScalar(Math.max(0, 1 - c * dt)); x.addScaledVector(v, dt); }
function blend(out, A, B, f) { out.p.copy(A.p).lerp(B.p, f); out.q.copy(A.q).slerp(B.q, f); }
function blendTo(out, B, f) { if (f <= 0) return; out.p.lerp(B.p, f); out.q.slerp(B.q, f); }
// a segment against a box (its own frame: landmarks' and buildings' boxes turn about y): the fraction along it and the
// face's normal, or null
function segBox(x0, y0, z0, x1, y1, z1, b, by0, by1) {
  const c = b.c, s = b.s;
  const ax = (x0 - b.x) * c - (z0 - b.z) * s, az = (x0 - b.x) * s + (z0 - b.z) * c;
  const bx = (x1 - b.x) * c - (z1 - b.z) * s, bz = (x1 - b.x) * s + (z1 - b.z) * c;
  const d = [bx - ax, y1 - y0, bz - az], o = [ax, y0, az], lo = [-b.hw, by0, -b.hd], hi = [b.hw, by1, b.hd];
  let t0 = 0, t1 = 1, axis = -1, sign = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k], sg = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; sg = 1; }
    if (ta > t0) { t0 = ta; axis = k; sign = sg; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (axis < 0) return null;                                  // (it starts inside: not a hit)
  // the face's normal back in the world (the local x axis is (c, -s) in x z, the local z (s, c))
  const n = axis === 1 ? V3(0, sign, 0) : axis === 0 ? V3(c * sign, 0, -s * sign) : V3(s * sign, 0, c * sign);
  return { f: t0, n };
}

class Effects {
  constructor(scene, M) {
    this.scene = scene;
    // the cases: 9 x 19 mm brass, instanced
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 1 });
    this.cases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0049, 0.0049, 0.0192, 10), brass, 80);
    this.cases.count = 0; this.cases.frustumCulled = false; this.cases.castShadow = true; scene.add(this.cases);
    this.cs = [];
    // the marks: a dark hole with its torn rim (on hard surfaces), a scuff of earth (on the ground)
    const holeTex = markTexture(), mat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, 120); this.marks.count = 0; this.marks.frustumCulled = false; scene.add(this.marks);
    this.mi = 0;
    // dust, plaster, bark, snow: soft puffs; sparks: bright streaks
    this.puffs = []; this.sparks = [];
    this.puffMat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.mags = [];
    this.M = M;
    this.world = null;
  }
  casing(p, cam, vel) {
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion); cam.getWorldDirection(_d);
    const v = V3().addScaledVector(_r, 2.2 + Math.random() * 0.8).addScaledVector(_u, 1.6 + Math.random() * 0.7).addScaledVector(_d, -0.4 + Math.random() * 0.3).add(vel);
    if (this.cs.length >= 80) this.cs.shift();
    this.cs.push({ p: p.clone(), v, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)), w: V3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40), age: 0, rest: false, hit: false });
  }
  dropMag(mw, M) {
    const g = magazineModel(M); g.matrixAutoUpdate = false; g.matrix.copy(mw); this.scene.add(g);
    const p = V3(), q = new THREE.Quaternion(); mw.decompose(p, q, _s);
    if (this.mags.length >= 6) { const o = this.mags.shift(); this.scene.remove(o.g); }
    this.mags.push({ g, p, q, v: V3(0, -1, 0), w: V3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), rest: false, hit: false });
  }
  puff(p, r0, life, color, alpha = 0.7, v = null) {
    const m = new THREE.Mesh(this.quad, this.puffMat.clone()); m.material.color.set(color); m.material.opacity = alpha;
    m.position.copy(p); m.frustumCulled = false; this.scene.add(m);
    if (this.puffs.length > 60) { const o = this.puffs.shift(); this.scene.remove(o.m); o.m.material.dispose(); }
    this.puffs.push({ m, r0, life, age: 0, a0: alpha, v: v ?? V3(0, 0.25, 0) });
  }
  // a round's end: the mark, the puff (what it hit), the sound from there (flight time + the sound's way back)
  impact(h, eye, ctx, audio) {
    const tag = h.tag, snow = (ctx.snow ?? 0) > 0.5 && (tag === 'ground' || h.n.y > 0.7);
    const metal = tag === 'car' || tag === 'cross' || tag === 'pole' || tag === 'gate';
    const wood = tag === 'tree' || tag === 'fence';
    const col = snow ? 0xf2f4f8 : tag === 'ground' ? 0x7a6650 : wood ? 0x6b5640 : metal ? 0x9a9a9a : 0xb8b2a8;
    const at = h.p.clone().addScaledVector(h.n, 0.02);
    if (metal) for (let k = 0; k < 7; k++) this.spark(at, h.n);
    else { this.puff(at, 0.04, 0.45, col, 0.85, h.n.clone().multiplyScalar(0.9)); this.puff(at, 0.08, 1.1, col, 0.55, h.n.clone().multiplyScalar(0.35).add(V3(0, 0.15, 0))); }
    if (!metal) this.mark(h.p, h.n, tag === 'ground' ? (snow ? 0.035 : 0.05) : 0.016);
    const d = eye.distanceTo(h.p);
    audio?.bulletHit?.(metal ? 'metal' : wood ? 'wood' : tag === 'ground' ? 'ground' : 'hard', d, h.t + d / 343);
  }
  spark(p, n) {
    const m = new THREE.Mesh(this.quad, this.sparkMat); m.position.copy(p); m.frustumCulled = false; this.scene.add(m);
    const v = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4).addScaledVector(n, 3);
    if (this.sparks.length > 80) { const o = this.sparks.shift(); this.scene.remove(o.m); }
    this.sparks.push({ m, v, age: 0, life: 0.12 + Math.random() * 0.12 });
  }
  mark(p, n, size) {
    const i = this.mi++ % 120;
    _q.setFromUnitVectors(V3(0, 0, 1), n); _q2.setFromAxisAngle(V3(0, 0, 1), Math.random() * 6.28); _q.multiply(_q2);
    this.marks.setMatrixAt(i, _m4.compose(_a.copy(p).addScaledVector(n, 0.003), _q, _s.set(size, size, size)));
    this.marks.count = Math.min(120, Math.max(this.marks.count, i + 1)); this.marks.instanceMatrix.needsUpdate = true;
  }
  update(dt, ctx) {
    const world = ctx.world, cam = ctx.camera;
    // the cases: thrown, spinning, bouncing on the ground, then lying there (~40 s)
    let n = 0;
    for (const c of this.cs) {
      c.age += dt;
      if (!c.rest) {
        c.v.y -= G * dt; c.p.addScaledVector(c.v, dt);
        _q.setFromEuler(_e.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)); c.q.multiply(_q);
        const gy = world.groundHeight(c.p.x, c.p.z, c.p.y + 0.3) + 0.005;
        if (c.p.y < gy) {
          c.p.y = gy;
          if (!c.hit) { c.hit = true; ctx.audio?.caseTink?.(cam.position.distanceTo(c.p)); }
          if (Math.abs(c.v.y) < 0.6) { c.rest = true; c.q.setFromEuler(_e.set(Math.PI / 2, Math.random() * 6.28, 0)); }
          else { c.v.y = -c.v.y * 0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); }
        }
      }
      this.cases.setMatrixAt(n++, _m4.compose(c.p, c.q, ONE));
    }
    this.cs = this.cs.filter(c => c.age < 40);
    this.cases.count = n; this.cases.instanceMatrix.needsUpdate = true;
    // the dropped magazines: fall, a bounce, lie on their side
    for (const m of this.mags) {
      if (m.rest) continue;
      m.v.y -= G * dt; m.p.addScaledVector(m.v, dt);
      _q.setFromEuler(_e.set(m.w.x * dt, m.w.y * dt, m.w.z * dt)); m.q.multiply(_q);
      const gy = world.groundHeight(m.p.x, m.p.z, m.p.y + 0.3) + 0.012;
      if (m.p.y < gy) {
        m.p.y = gy;
        if (!m.hit) { m.hit = true; ctx.audio?.magDrop?.(cam.position.distanceTo(m.p)); }
        if (Math.abs(m.v.y) < 0.8) { m.rest = true; m.q.setFromEuler(_e.set(0, Math.random() * 6.28, Math.PI / 2)); }
        else { m.v.y = -m.v.y * 0.25; m.w.multiplyScalar(0.4); }
      }
      m.g.matrix.compose(m.p, m.q, ONE); m.g.matrixWorldNeedsUpdate = true;
    }
    // the puffs: swell and fade, facing you
    for (const p of this.puffs) {
      p.age += dt; const f = p.age / p.life;
      p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.max(0, 1 - 3 * dt));
      const s = p.r0 * (1 + 4 * Math.sqrt(f)); p.m.scale.set(s, s, s); p.m.quaternion.copy(cam.quaternion);
      p.m.material.opacity = p.a0 * Math.max(0, 1 - f) * Math.max(0, 1 - f);
    }
    for (const p of this.puffs) if (p.age >= p.life) { this.scene.remove(p.m); p.m.material.dispose(); }
    this.puffs = this.puffs.filter(p => p.age < p.life);
    for (const s of this.sparks) {
      s.age += dt; s.v.y -= G * dt; s.m.position.addScaledVector(s.v, dt);
      const L = Math.min(0.08, s.v.length() * 0.012); s.m.scale.set(0.004, L, 1);
      s.m.quaternion.copy(cam.quaternion);
      s.m.visible = s.age < s.life;
    }
    for (const s of this.sparks) if (s.age >= s.life) this.scene.remove(s.m);
    this.sparks = this.sparks.filter(s => s.age < s.life);
  }
}
function markTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(10,9,8,1)'); rg.addColorStop(0.25, 'rgba(25,22,20,0.95)'); rg.addColorStop(0.5, 'rgba(60,55,50,0.6)'); rg.addColorStop(1, 'rgba(90,85,80,0)');
  g.fillStyle = rg; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, r = 22 + 8 * Math.sin(k * 2.7) * Math.cos(k * 1.3); g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- the counter (the rounds in the gun, the rest, the fire mode) and the crosshair, the way Call of Duty shows them
class GunHud {
  constructor() {
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:26px;bottom:22px;color:#fff;font:600 13px system-ui,sans-serif;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.8);pointer-events:none;display:none;z-index:20';
    el.innerHTML = '<div style="opacity:.85;letter-spacing:.06em">GLOCK 18 · <span data-k="mode"></span></div><div><span data-k="mag" style="font-size:38px;font-weight:700"></span><span style="font-size:20px;opacity:.75"> / <span data-k="res"></span></span></div><div data-k="hint" style="color:#ffd27a;min-height:16px"></div>';
    document.body.appendChild(el);
    this.k = Object.fromEntries([...el.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e]));
    const x = this.x = document.createElement('div');
    x.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;display:none;z-index:20';
    x.innerHTML = [0, 1, 2, 3].map(i => `<div data-i="${i}" style="position:absolute;background:rgba(255,255,255,.85);box-shadow:0 0 2px rgba(0,0,0,.8)"></div>`).join('');
    document.body.appendChild(x);
    this.bars = [...x.children];
    this.flashT = 0; this.last = '';
  }
  show(on) { this.el.style.display = on ? 'block' : 'none'; if (!on) this.x.style.display = 'none'; }
  set(mag, res, auto, hint) {
    if (performance.now() < (this.flashUntil ?? 0)) hint = this.flashText;
    const s = mag + '|' + res + '|' + auto + '|' + hint;
    if (s === this.last) return; this.last = s;
    this.k.mag.textContent = mag; this.k.mag.style.color = mag <= 6 ? '#ff6b5a' : '#fff';
    this.k.res.textContent = res; this.k.mode.textContent = auto ? 'AUTOMAT' : 'FOC CU FOC'; this.k.hint.textContent = hint;
  }
  flash(text) { this.flashText = text; this.flashUntil = performance.now() + 1200; this.last = ''; }
  cross(on, spread, fov) {
    this.x.style.display = on ? 'block' : 'none';
    if (!on) return;
    // (the gap: where the spread's edge falls on the screen, at the view's own field of view)
    const g = Math.round(4 + innerHeight / 2 * Math.tan(spread / 2) / Math.tan(fov * Math.PI / 360));
    const L = 9, W = 2;
    const set = (b, x, y, w, h) => { b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px'; };
    set(this.bars[0], -W / 2, -g - L, W, L); set(this.bars[1], -W / 2, g, W, L); set(this.bars[2], -g - L, -W / 2, L, W); set(this.bars[3], g, -W / 2, L, W);
  }
}
