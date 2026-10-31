import * as THREE from 'three';
import { circleBox } from './collision.js';
import { damp, clamp } from './util.js';
import { W } from './config.js';

const tmp = [];
// the tactical sprint: how long it lasts flat out, and how long its breath takes to come back (s)
const TAC_S = 4.5, TAC_BACK = 6;
const smooth = (t) => t * t * (3 - 2 * t);
export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(0.18, 0, -1.14);   // photo 1 viewpoint
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0.02;
    this.eye = 1.6; this.eyeCur = 1.6;
    this.radius = 0.28;
    this.onGround = true;
    this.bobPhase = 0; this.bobAmt = 0;
    this.stepAcc = 0;
    this.fovKick = 0;
    this.pos.y = world.groundHeight(this.pos.x, this.pos.z);
    this.landShake = 0;
    this.noclip = false;
    // the shooter's moves (V89: update): the tactical sprint and its breath, the slide, on your back
    this.t = 0; this.shiftT = -1; this.tac = false; this.tacWant = false; this.tacFuel = TAC_S; this.sl = null; this.sup = null;
    this.slK = 0; this.supK = 0; this.running = false; this.runWas = false; this.armed = false; this.gunBusy = false;
  }
  setPose(x, z, yaw, pitch = 0) {
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.sl = null; this.sup = null; this.tacWant = false; this.tac = false;
    this.yaw = yaw; this.pitch = pitch;
  }
  surface() {
    const x = this.pos.x, z = this.pos.z;
    if (x > -W.ROAD_HALF && x < W.ROAD_HALF) return 'asphalt';
    if (x < -W.ROAD_HALF) return 'grass';
    if (x < W.PAVER_X1) return 'concrete';
    if (x < W.EAST_FENCE) return (z > -5.5 && z < 6.8) ? 'concrete' : 'gravel';
    if (x > 14.3) return 'grass';
    return 'tiles';
  }
  // noclip (N): fly through everything; when switched off the player falls to the ground below
  setNoclip(on) {
    this.noclip = on;
    this.vel.set(0, 0, 0);
    this.sl = null; this.sup = null; this.tacWant = false; this.tac = false;
    if (!on) {
      const gh = this.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1);
      if (this.pos.y < gh) this.pos.y = gh;
      this.onGround = false;
    }
  }
  fly(dt, input, sens) {
    const m = input.consumeMouse();
    this.yaw -= m.x * sens;
    this.pitch = clamp(this.pitch - m.y * sens, -1.55, 1.55);
    const ax = input.axis();
    const fast = input.down('ShiftLeft') || input.down('ShiftRight') || input.touchRun;
    const speed = fast ? 60 : 14;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = (input.down('Space') ? 1 : 0) - (input.down('KeyC') || input.down('ControlLeft') ? 1 : 0);
    const want = new THREE.Vector3().addScaledVector(fwd, -ax.y).addScaledVector(right, ax.x);
    want.y += up;
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, want.x, 8, dt);
    this.vel.y = damp(this.vel.y, want.y, 8, dt);
    this.vel.z = damp(this.vel.z, want.z, 8, dt);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = clamp(this.pos.x, W.X_MIN, W.X_MAX);
    this.pos.z = clamp(this.pos.z, W.Z_MIN, W.Z_MAX);
    this.pos.y = clamp(this.pos.y, -300, 3000);
    this.bobAmt = 0; this.landShake = 0; this.eyeCur = this.eye;
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    this.camera.position.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  // on foot. While the pistol is out (this.armed: weapon.js), the shooter's moves of the modern Call of Duty games
  // (V89): Shift a second time within 0.3 s - the tactical sprint (flat out, ~7.6 m/s, for ~4.5 s: the breath comes
  // back in ~6 s of going easier, a sprint too, as in MWIII); C (or Ctrl) while running - a slide on your hip, ~0.9 s
  // (pressed twice: the longer, lower one that ends on your back - MW4's supine slide; Space, C or Shift gets you up),
  // Shift out of it (the slide cancel: up and on into the sprint) or Space (a jump out of it, the speed kept). Aiming or
  // firing stops a sprint (this.gunBusy: no sprinting with the sights up). Without the pistol: as before
  update(dt, input, audio, sens) {
    if (this.noclip) return this.fly(dt, input, sens);
    this.t += dt;
    const m = input.consumeMouse();
    this.yaw -= m.x * sens;
    this.pitch = clamp(this.pitch - m.y * sens, this.sup ? -0.7 : -1.45, 1.45);      // (on your back: not down through yourself)

    const ax = input.axis(), armed = !!this.armed;
    const shiftHit = input.hit('ShiftLeft') || input.hit('ShiftRight'), cHit = input.hit('KeyC') || input.hit('ControlLeft');
    const crouchKey = input.down('KeyC') || input.down('ControlLeft');
    const run = (input.down('ShiftLeft') || input.down('ShiftRight') || input.touchRun) && !(armed && this.gunBusy);
    let hs = Math.hypot(this.vel.x, this.vel.z), jumped = false;
    // the tactical sprint: Shift again within 0.3 s, going forward, with breath left; it lasts while Shift is held
    if (shiftHit) { if (armed && this.t - this.shiftT < 0.3) this.tacWant = true; this.shiftT = this.t; }
    if (!run || !armed) this.tacWant = false;
    this.tac = this.tacWant && -ax.y > 0.5 && Math.abs(ax.x) < 0.8 && this.tacFuel > 0 && !this.sl && !this.sup;
    if (this.tac) { this.tacFuel -= dt; if (this.tacFuel <= 0) { this.tacFuel = 0; this.tacWant = false; } }
    else this.tacFuel = Math.min(TAC_S, this.tacFuel + dt * TAC_S / TAC_BACK);
    // the slide: C going flat out on the ground (a push into it); twice within 0.3 s: the long one
    if (armed && cHit && !this.sl && !this.sup && this.onGround && this.runWas && hs > 4.6) {
      const v = Math.min(8.4, hs + 0.7);
      this.sl = { t: 0, long: false };
      this.vel.x *= v / hs; this.vel.z *= v / hs; hs = v;
      audio?.slide?.(this.slideKind(), 1);
    } else if (this.sl && cHit && !this.sl.long && this.sl.t < 0.3) { this.sl.long = true; audio?.slide?.(this.slideKind(), 0.7); }
    if (this.sl) {
      const s = this.sl; s.t += dt;
      // (on the hip: friction, ~0.45 g on grass or tarmac in clothes, ~0.14 on snow; the slope pulls you on or holds
      // you back: g sin a cos a along its fall)
      const mu = (this.snowK ?? 0) > 0.5 ? 0.14 : (this.wetK ?? 0) > 0.3 ? 0.32 : 0.45;
      const e = 0.4, x = this.pos.x, z = this.pos.z, ry = this.pos.y + 0.5, wg = this.world;
      const gx = (wg.groundHeight(x + e, z, ry) - wg.groundHeight(x - e, z, ry)) / (2 * e), gz = (wg.groundHeight(x, z + e, ry) - wg.groundHeight(x, z - e, ry)) / (2 * e);
      if (hs > 1e-3) { const k = Math.max(0, hs - mu * 9.81 * dt) / hs; this.vel.x *= k; this.vel.z *= k; }
      const kg = 9.81 / (1 + gx * gx + gz * gz) * dt; this.vel.x -= kg * gx; this.vel.z -= kg * gz;
      hs = Math.hypot(this.vel.x, this.vel.z);
      if (input.hit('Space') && s.t > 0.15) { this.sl = null; this.vel.y = 4.1; this.onGround = false; jumped = true; audio?.jump(); }
      else if (shiftHit && !s.long) this.sl = null;
      // (~0.9 s on grass or tarmac, the long one ~1.35; on wet grass and on snow, gliding, a little longer: ~1.0 / ~1.35 s)
      else if (s.t >= (s.long ? 1.35 : 0.9) * Math.pow(0.45 / mu, 0.35) || (hs < 1 && s.t > 0.3)) { this.sl = null; if (s.long) this.sup = { t: 0, up: -1 }; }
    }
    // on your back: still (the view free all round); getting up ~0.6 s
    if (this.sup) {
      const p = this.sup; p.t += dt;
      if (p.up < 0 && p.t > 0.25 && (input.hit('Space') || cHit || shiftHit)) { p.up = 0; audio?.gunCloth?.(); }
      if (p.up >= 0 && (p.up += dt) >= 0.6) this.sup = null;
    }
    const crouch = crouchKey && !this.sl && !this.sup;
    const speed = this.sup ? 0 : (crouch ? 1.3 : this.tac ? 7.6 : run ? 6.2 : 2.5) * (this.slow ?? 1) * (this.aimSlow ?? 1);     // (slow: wading through deep snow, main.js; aimSlow: aiming down the sights, weapon.js)
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new THREE.Vector3().addScaledVector(fwd, -ax.y * speed).addScaledVector(right, ax.x * speed);
    // (a gale no longer pushes you nor holds you back, V92: you walk as you mean to; it still shakes the view, main.js)
    if (!this.sl) {
      const accel = this.onGround ? 11 : 2.5;
      this.vel.x = damp(this.vel.x, want.x, accel, dt);
      this.vel.z = damp(this.vel.z, want.z, accel, dt);
    }

    if (this.onGround && !jumped && !this.sl && !this.sup && (input.hit('Space'))) { this.vel.y = 4.1; this.onGround = false; audio?.jump(); }
    this.vel.y -= 9.81 * dt;

    // integrate horizontally with collisions (substeps)
    const steps = Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.1) || 1;
    for (let s = 0; s < steps; s++) {
      this.pos.x += this.vel.x * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      this.collide();
    }
    // vertical
    this.pos.y += this.vel.y * dt;
    const gh = this.world.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= gh + 0.001) {
      if (!this.onGround && this.vel.y < -3) { this.landShake = Math.min(0.08, -this.vel.y * 0.012); audio?.land(this.surface()); this.onLand?.(); }
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.pos.y - gh < 0.32 && this.vel.y <= 0) {
      this.pos.y = gh; this.vel.y = 0;        // walk down steps/curbs
    } else {
      this.onGround = false;
    }

    // camera: eye height (a slide ~0.85 m, the long one ~0.55, on your back ~0.42), head bob, landing dip, FOV kick
    hs = Math.hypot(this.vel.x, this.vel.z);
    const sl = this.sl, sup = this.sup, low = !!(sl || sup);
    this.running = run && hs > 4 && !low;
    this.runWas = this.running;
    this.slK = damp(this.slK, sl ? 1 : 0, sl ? 12 : 6, dt);
    const up = sup ? (sup.up < 0 ? 0 : smooth(Math.min(1, sup.up / 0.6))) : 1;
    this.supK = sup ? 1 - up : 0;
    const eyeT = sup ? 0.42 + (this.eye - 0.42) * up : sl ? (sl.long && sl.t > 0.2 ? 0.55 : 0.85) : crouch ? 1.05 : this.eye;
    this.eyeCur = sup && sup.up >= 0 ? eyeT : damp(this.eyeCur, eyeT, low ? 14 : 10, dt);
    this.bobAmt = damp(this.bobAmt, this.onGround && !low ? Math.min(1, hs / 6) : 0, 8, dt);
    const prev = this.bobPhase;
    this.bobPhase += dt * (hs > 0.2 && !low ? 1.85 + hs * 0.55 : 0) * Math.PI;
    if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && this.onGround && hs > 0.5) {
      audio?.step(this.surface(), hs / 6);
      this.onStep?.(Math.floor(this.bobPhase / Math.PI) & 1 ? 1 : -1, hs);    // (the footprints in the snow: main.js)
    }
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * this.bobAmt - 0.03 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmt;
    this.landShake = damp(this.landShake, 0, 6, dt);
    // (sliding: the view leans ~4 deg onto the hip you are on, and the ground's roughness comes up through you)
    const rum = (Math.sin(this.t * 41) * 0.6 + Math.sin(this.t * 67)) * 0.0011 * this.slK * Math.min(1, hs / 6);
    this.camera.position.set(this.pos.x + right.x * bobX, this.pos.y + this.eyeCur + bobY - this.landShake, this.pos.z + right.z * bobX);
    this.camera.rotation.set(this.pitch + rum, this.yaw, Math.cos(this.bobPhase) * 0.004 * this.bobAmt + 0.07 * this.slK + rum, 'YXZ');
    this.fovKick = damp(this.fovKick, this.tac && hs > 5 ? 8 : sl ? 3 : run && hs > 4 ? 5 : 0, 4, dt);
  }
  // what you slide on (its sound)
  slideKind() { return (this.snowK ?? 0) > 0.5 ? 'snow' : this.surface(); }
  collide() {
    const list = this.world.query(this.pos.x, this.pos.z, 1.5, tmp);
    const y0 = this.pos.y + 0.36, y1 = this.pos.y + 1.8;
    for (let it = 0; it < 2; it++) {
      for (const b of list) {
        if (b.y1 < y0 || b.y0 > y1 || b.ghost) continue;
        const p = circleBox(this.pos.x, this.pos.z, this.radius, b);
        if (p) {
          this.pos.x += p.x; this.pos.z += p.z;
          const vn = this.vel.x * p.nx + this.vel.z * p.nz;
          if (vn < 0) { this.vel.x -= vn * p.nx; this.vel.z -= vn * p.nz; }
        }
      }
    }
    // keep inside the playable area
    this.pos.z = clamp(this.pos.z, W.Z_MIN, W.Z_MAX);
    this.pos.x = clamp(this.pos.x, W.X_MIN, W.X_MAX);
  }
}
