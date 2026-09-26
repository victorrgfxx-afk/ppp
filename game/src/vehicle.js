import * as THREE from 'three';
import { Box, boxBox } from './collision.js';
import { clamp, damp } from './util.js';
import { W } from './config.js';

// Arcade-realistic car: bicycle-model steering, tyre grip with handbrake drift,
// 5-speed gearbox for the engine sound, per-wheel ground sampling for pitch/roll.
const GEARS = [3.6, 2.2, 1.5, 1.12, 0.9];
const tmp = [];

export class Vehicle {
  constructor(car, world, x, z, heading, opts = {}) {
    this.car = car; this.world = world;
    this.m = car.model;
    this.name = this.m.name;
    this.x = x; this.z = z; this.h = heading;
    this.vx = 0; this.vz = 0;
    this.steer = 0; this.throttle = 0; this.brake = 0;
    this.rpm = 850; this.gear = 1;
    this.pitchV = 0; this.pitch = 0; this.rollV = 0; this.roll = 0;
    this.spin = 0; this.lightsOn = false;
    this.power = opts.power ?? 1;
    this.vmax = opts.vmax ?? 52;
    this.wheelbase = this.m.axles[1] - this.m.axles[0];
    this.box = new Box(x, z, car.half.w, car.half.l, heading, -1, 1.6, 'car');
    this.box.vehicle = this;
    world.addDynamic(this.box);
    this.impact = 0;
    this.lastLat = 0;
    this.place(0);
  }
  get speed() { return -(this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h)); }
  place(dt) {
    const g = this.car.group;
    // ground under the 4 wheels
    const s = Math.sin(this.h), c = Math.cos(this.h);
    const hw = this.m.W / 2 - 0.15;
    const zf = this.m.axles[0] - this.m.L / 2, zr = this.m.axles[1] - this.m.L / 2;
    const at = (lx, lz) => this.world.groundHeight(this.x + lx * c + lz * s, this.z - lx * s + lz * c);
    const fl = at(-hw, zf), fr = at(hw, zf), rl = at(-hw, zr), rr = at(hw, zr);
    const y = (fl + fr + rl + rr) / 4;
    const pitchG = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, this.wheelbase);
    const rollG = Math.atan2((fr + rr) / 2 - (fl + fr + rl + rr - (fr + rr)) / 2, hw * 2);
    g.position.set(this.x, y, this.z);
    g.rotation.set(pitchG, this.h, rollG, 'YXZ');
    this.car.bodyPivot.rotation.set(this.pitch, 0, this.roll);
    this.car.bodyPivot.position.y = -Math.abs(this.pitch) * 0.2;
    // wheels
    for (const w of this.car.wheels) {
      w.spin.rotation.x = this.spin;
      if (w.front) w.pivot.rotation.y = -this.steer;
    }
    if (this.car.steer) this.car.steer.rotation.z = this.steer * 7;
    this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
    void dt;
  }
  setLights(on) {
    this.lightsOn = on;
    this.car.lights.headMat.emissiveIntensity = on ? 2.5 : 0;
  }
  update(dt, ctl) {
    const fwdX = -Math.sin(this.h), fwdZ = -Math.cos(this.h);
    const rtX = Math.cos(this.h), rtZ = -Math.sin(this.h);
    let vF = this.vx * fwdX + this.vz * fwdZ;
    let vR = this.vx * rtX + this.vz * rtZ;
    let accel = 0, hand = false, steerIn = 0;
    this.brake = 0;
    if (ctl) {
      steerIn = ctl.steer;
      hand = ctl.handbrake;
      const t = ctl.throttle;
      if (t > 0) {
        if (vF < -0.5) { accel = 9; this.brake = 1; }
        else {
          const k = 1 - Math.pow(Math.max(0, vF) / this.vmax, 2);
          const gearBoost = [1.25, 1.0, 0.85, 0.72, 0.62][this.gear - 1];
          accel = 4.2 * this.power * t * k * gearBoost;
        }
      } else if (t < 0) {
        if (vF > 0.5) { accel = -9.5; this.brake = 1; }
        else accel = vF > -7 ? -3.2 : 0;
      }
      this.throttle = t;
    } else {
      this.throttle = 0;
      hand = true;
    }
    // rolling resistance + aero drag + engine braking
    const drag = 0.02 * vF * Math.abs(vF) * 0.06 + Math.sign(vF) * (ctl && ctl.throttle ? 0.15 : 0.55);
    if (Math.abs(vF) < 0.3 && (!ctl || !ctl.throttle)) { vF *= Math.exp(-6 * dt); }
    else vF -= drag * dt;
    if (hand) vF *= Math.exp(-(ctl ? 1.2 : 5) * dt);
    vF += accel * dt;

    // steering (less lock at speed)
    const maxSteer = 0.58 / (1 + (vF * vF) / 220);
    this.steer = damp(this.steer, steerIn * maxSteer, 6, dt);
    const yawRate = -vF * Math.tan(this.steer) / this.wheelbase;
    const slip = hand && Math.abs(vF) > 4 ? 1.55 : 1;
    this.h += yawRate * dt * slip;

    // lateral grip (handbrake lets the rear slide)
    const grip = hand && Math.abs(vF) > 3 ? 1.4 : 11;
    vR *= Math.exp(-grip * dt);
    this.lastLat = vR;
    const nfX = -Math.sin(this.h), nfZ = -Math.cos(this.h);
    const nrX = Math.cos(this.h), nrZ = -Math.sin(this.h);
    this.vx = nfX * vF + nrX * vR;
    this.vz = nfZ * vF + nrZ * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // body dynamics (springy pitch/roll)
    const longA = accel - (hand ? vF * 1.2 : 0);
    const latA = vF * yawRate;
    const tp = clamp(longA * 0.006, -0.05, 0.05), tr = clamp(-latA * 0.0065, -0.06, 0.06);
    this.pitchV += ((tp - this.pitch) * 60 - this.pitchV * 9) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((tr - this.roll) * 50 - this.rollV * 8) * dt; this.roll += this.rollV * dt;
    this.spin -= (vF / this.m.r) * dt;

    // gearbox & rpm
    const kmh = Math.abs(vF) * 3.6;
    const up = [0, 22, 45, 70, 98];
    let g = 1; for (let i = 0; i < up.length; i++) if (kmh > up[i]) g = i + 1;
    this.gear = g;
    const wheelRpm = Math.abs(vF) / (2 * Math.PI * this.m.r) * 60;
    const target = Math.max(850, wheelRpm * GEARS[g - 1] * 3.9 + (ctl && ctl.throttle > 0 ? 900 : 0));
    this.rpm = damp(this.rpm, Math.min(6800, target), 8, dt);

    this.resolveStatic();
    // lights
    const tl = this.car.lights.tailMat;
    tl.emissiveIntensity = this.brake ? 3.0 : (this.lightsOn ? 0.9 : 0.12);
    this.place(dt);
  }
  resolveStatic() {
    const list = this.world.query(this.x, this.z, 4, tmp);
    this.impact = 0;
    for (let it = 0; it < 3; it++) {
      let any = false;
      this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
      for (const b of list) {
        if (b === this.box || b.y1 < 0.45 || b.ghost) continue;
        const p = boxBox(this.box, b);
        if (!p) continue;
        any = true;
        if (b.vehicle) {
          // push both cars (equal mass), exchange normal velocity
          const o = b.vehicle;
          this.x += p.x * 0.5; this.z += p.z * 0.5;
          o.x -= p.x * 0.5; o.z -= p.z * 0.5;
          const rvx = this.vx - o.vx, rvz = this.vz - o.vz;
          const vn = rvx * p.nx + rvz * p.nz;
          if (vn < 0) {
            const j = -vn * 0.6;
            this.vx += p.nx * j; this.vz += p.nz * j;
            o.vx -= p.nx * j; o.vz -= p.nz * j;
            this.impact = Math.max(this.impact, -vn);
          }
          o.box.x = o.x; o.box.z = o.z; o.box.update();
        } else {
          this.x += p.x; this.z += p.z;
          const vn = this.vx * p.nx + this.vz * p.nz;
          if (vn < 0) {
            this.vx -= p.nx * vn * 1.25; this.vz -= p.nz * vn * 1.25;
            this.vx *= 0.8; this.vz *= 0.8;
            this.impact = Math.max(this.impact, -vn);
          }
        }
      }
      if (!any) break;
    }
    this.z = clamp(this.z, W.Z_MIN, W.Z_MAX);
  }
  // world position of the driver's door (left side) for exiting
  doorPos(side = -1) {
    const lx = side * (this.m.W / 2 + 0.55), lz = this.m.pillars[0] - 0.35 - this.m.L / 2;
    const s = Math.sin(this.h), c = Math.cos(this.h);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
  headPos() {
    const pm = this.m;
    const lz = pm.pillars[0] - 0.06 - pm.L / 2, lx = -0.37;
    const s = Math.sin(this.h), c = Math.cos(this.h);
    const beltY = pm.belt.reduce((a, b) => Math.max(a, b[1]), 0);
    return new THREE.Vector3(this.x + lx * c + lz * s, this.car.group.position.y + beltY + 0.22, this.z - lx * s + lz * c);
  }
}
