import * as THREE from 'three';
import { Box, boxBox } from './collision.js';
import { clamp, damp } from './util.js';
import { W } from './config.js';

// Arcade-realistic car: bicycle-model steering, tyre grip with handbrake drift,
// 5-speed gearbox for the engine sound, per-wheel ground sampling for pitch/roll.
const GEARS = [3.6, 2.2, 1.5, 1.12, 0.9];
const tmp = [];
// 'hyper' tune (the user's Peugeot 508): 1400 W/kg with a 1.43 g traction limit, drag for a natural 580 km/h,
// electronic limiter at 500 km/h -> 0-100 km/h 2.0 s, 0-300 6.4 s, 0-500 14 s (tools/../README); 8-speed box
// grip of the road under the tyres, relative to dry asphalt (main.js: ~0.3 on snow): on snow the longitudinal and
// lateral acceleration stay within mu * g (the hyper tune's 1.43 g of traction scaled the same way)
export const TRACTION = { mu: 1 };

const HYPER = { P: 1400, A0: 14, top: 580 / 3.6, limit: 500 / 3.6, brake: 14, shifts: [0, 70, 125, 185, 250, 320, 390, 450, 505],
  // cornering: 3.2 g of mechanical grip plus aero downforce growing with v^2 (+1.6 g at 500 km/h);
  // progressive steering: full lock in 0.16 s (50 km/h) to 0.35 s (300+ km/h), back to centre in 0.15 s; tyre scrub 4 %
  lat: 3.2 * 9.81, latAero: 1.6 * 9.81, steerIn: 0.35, steerOut: 0.15, scrub: 0.04 };
HYPER.cd = (HYPER.P / HYPER.top - 0.15) / (HYPER.top * HYPER.top);

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
    this.hyper = opts.hyper ? HYPER : null;
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
    // (the ground does not change: a car that has not moved since the last call stands on the same 4 heights, so a
    // parked car does not sample the terrain and the bridge decks every frame)
    const k = this._ground ??= { x: NaN };
    if (k.x !== this.x || k.z !== this.z || k.h !== this.h || k.gy !== this.gy) {
      const at = (lx, lz) => this.world.groundHeight(this.x + lx * c + lz * s, this.z - lx * s + lz * c, this.gy);
      k.x = this.x; k.z = this.z; k.h = this.h; k.gy = this.gy;
      k.fl = at(-hw, zf); k.fr = at(hw, zf); k.rl = at(-hw, zr); k.rr = at(hw, zr);
    }
    const { fl, fr, rl, rr } = k;
    const y = (fl + fr + rl + rr) / 4;
    this.gy = y;
    const pitchG = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, this.wheelbase);
    const rollG = Math.atan2((fr + rr) / 2 - (fl + fr + rl + rr - (fr + rr)) / 2, hw * 2);
    g.position.set(this.x, y, this.z);
    g.rotation.set(pitchG, this.h, rollG, 'YXZ');
    this.car.bodyPivot.rotation.set(this.pitch, 0, this.roll);
    this.car.bodyPivot.position.y = -Math.abs(this.pitch) * 0.2;
    // wheels
    this.car.setWheels(this.spin, this.steer);
    if (this.car.steer) this.car.steer.rotation.z = this.steer * 7;
    this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
    void dt;
  }
  setLights(on) {
    this.lightsOn = on;
    this.car.lights.headMat.emissiveIntensity = on ? 2.5 : 0;
  }
  update(dt, ctl) {
    // sub-steps at speed: never move more than ~0.8 m per step (no tunnelling through walls at 500 km/h)
    const n = this._sub ? 1 : Math.min(10, Math.ceil(Math.hypot(this.vx, this.vz) * dt / 0.8));
    if (n > 1) {
      let imp = 0;
      this._sub = true;
      for (let i = 0; i < n; i++) { this.update(dt / n, ctl); imp = Math.max(imp, this.impact); }
      this._sub = false;
      this.impact = imp;
      return;
    }
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
      const Hy = this.hyper;
      if (t > 0 && Hy) {
        if (vF < -0.5) { accel = Hy.brake; this.brake = 1; }
        else accel = t * Math.min(Hy.A0, Hy.P / Math.max(1, vF));
      } else if (t < 0 && Hy && vF > 0.5) { accel = -Hy.brake; this.brake = 1; }
      else if (t > 0) {
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
    // the tyres cannot push or brake harder than the road lets them (snow: wheelspin, long stops)
    const mu = TRACTION.mu;
    if (mu < 0.999) { const aMax = (this.hyper ? 14 : 10) * mu; accel = clamp(accel, -aMax, aMax); }
    // rolling resistance + aero drag + engine braking
    const cd = this.hyper ? this.hyper.cd : 0.0012;
    const drag = cd * vF * Math.abs(vF) + Math.sign(vF) * (ctl && ctl.throttle ? 0.15 : 0.55);
    if (Math.abs(vF) < 0.3 && (!ctl || !ctl.throttle)) { vF *= Math.exp(-6 * dt); }
    else vF -= drag * dt;
    if (hand) vF *= Math.exp(-(ctl ? 1.2 : 5) * dt);
    vF += accel * dt;
    if (this.hyper) vF = Math.min(vF, this.hyper.limit);

    // steering (less lock at speed)
    let maxSteer = 0.58 / (1 + (vF * vF) / 220);
    const Hs = this.hyper;
    if (Hs && Math.abs(vF) > 12) {
      // steering angle for the grip available at this speed (tyres + downforce), so full lock = the limit
      const q = Math.min(1, (vF * vF) / (Hs.limit * Hs.limit));
      maxSteer = Math.atan((Hs.lat + Hs.latAero * q) * this.wheelbase / (vF * vF));
      // progressive, rate-limited steering: a tap gives a small correction, holding builds to the limit
      const target = steerIn * maxSteer;
      const building = Math.abs(target) > Math.abs(this.steer) && (this.steer === 0 || Math.sign(target) === Math.sign(this.steer));
      const tIn = Hs.steerIn * (0.45 + 0.55 * Math.min(1, Math.abs(vF) / 83));   // quicker at town speeds, calmer at 300+
      const rate = maxSteer / (building ? tIn : Hs.steerOut);
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    } else this.steer = damp(this.steer, steerIn * maxSteer, 6, dt);
    // on a slippery road the car turns only as tightly as the tyres hold (lateral mu * g): it runs wide
    let yawRate = -vF * Math.tan(this.steer) / this.wheelbase;
    if (mu < 0.999 && Math.abs(vF) > 1) { const lim = 9.81 * mu * 1.05 / Math.abs(vF); yawRate = clamp(yawRate, -lim, lim); }
    const slip = hand && Math.abs(vF) > 4 ? 1.55 : 1;
    this.h += yawRate * dt * slip;
    // tyre scrub: cornering hard costs a little speed
    if (Hs) vF -= Math.sign(vF) * Math.abs(vF * yawRate) * Hs.scrub * dt;

    // lateral grip (handbrake lets the rear slide)
    const grip = (hand && Math.abs(vF) > 3 ? 1.4 : 11) * (0.25 + 0.75 * mu);
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
    const tp = clamp(longA * 0.006, -0.05, 0.05), tr = clamp(-latA * (Hs ? 0.0016 : 0.0065), -0.06, 0.06);   // stiff, low hyper car
    this.pitchV += ((tp - this.pitch) * 60 - this.pitchV * 9) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((tr - this.roll) * 50 - this.rollV * 8) * dt; this.roll += this.rollV * dt;
    this.spin -= (vF / this.m.r) * dt;

    // gearbox & rpm
    const kmh = Math.abs(vF) * 3.6;
    if (this.hyper) {
      const up = this.hyper.shifts;
      let g = 1; for (let i = 0; i < up.length - 1; i++) if (kmh > up[i]) g = i + 1;
      this.gear = g;
      const f = (kmh - up[g - 1]) / (up[g] - up[g - 1]);
      const target = kmh < 3 ? 900 + (ctl && ctl.throttle > 0 ? 2600 : 0) : 3000 + 5000 * Math.min(1, f);
      this.rpm = damp(this.rpm, target, 10, dt);
    } else {
      const up = [0, 22, 45, 70, 98];
      let g = 1; for (let i = 0; i < up.length; i++) if (kmh > up[i]) g = i + 1;
      this.gear = g;
      const wheelRpm = Math.abs(vF) / (2 * Math.PI * this.m.r) * 60;
      const target = Math.max(850, wheelRpm * GEARS[g - 1] * 3.9 + (ctl && ctl.throttle > 0 ? 900 : 0));
      this.rpm = damp(this.rpm, Math.min(6800, target), 8, dt);
    }

    this.resolveStatic();
    // lights
    const tl = this.car.lights.tailMat;
    tl.emissiveIntensity = this.brake ? 3.0 : (this.lightsOn ? 0.9 : 0.12);
    this.place(dt);
  }
  resolveStatic() {
    const list = this.world.query(this.x, this.z, 4, tmp);
    const gy = this.gy ?? this.world.groundHeight(this.x, this.z);
    this.impact = 0;
    for (let it = 0; it < 3; it++) {
      let any = false;
      this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
      for (const b of list) {
        if (b === this.box || b.y1 < gy + 0.45 || b.y0 > gy + 2.2 || b.ghost) continue;   // curbs and decks overhead don't count
        const p = boxBox(this.box, b);
        if (!p) continue;
        if (b.npc) { b.npc.hit(this, p); continue; }
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
            // Coulomb friction of the scrape (mu 0.5 on the normal impulse): a glancing hit keeps most of the speed,
            // a head-on one still stops the car
            const tx = -p.nz, tz = p.nx, vt = this.vx * tx + this.vz * tz, dv = Math.sign(vt) * Math.min(Math.abs(vt), 0.5 * 1.25 * -vn);
            this.vx -= tx * dv; this.vz -= tz * dv;
            this.impact = Math.max(this.impact, -vn);
          }
        }
      }
      if (!any) break;
    }
    this.z = clamp(this.z, W.Z_MIN, W.Z_MAX);
    this.x = clamp(this.x, W.X_MIN, W.X_MAX);
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
