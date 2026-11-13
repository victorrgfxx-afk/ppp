import * as THREE from 'three';
import { Box, boxBox } from './collision.js';
import { clamp, damp } from './util.js';
import { W } from './config.js';
import { DAYLIGHT } from './cars.js';
import { torque0 } from './tunerdata.js';

// Arcade-realistic car: bicycle-model steering, tyre grip with handbrake drift,
// 5-speed gearbox for the engine sound, per-wheel ground sampling for pitch/roll.
const GEARS = [3.6, 2.2, 1.5, 1.12, 0.9];
const tmp = [];
// (the tyre's round over a step: five points under it, along the car, and how far each is above its lowest point,
// in its radius)
// (and four across it, its tread and shoulders - a round of ~15 cm in its cross-section: a curb met from the side is
// climbed over the tyre's width, not in one step)
const TYRE = [-0.85, -0.45, 0, 0.45, 0.85].map(d => [d, 1 - Math.sqrt(1 - d * d), 0]);
const SHOULDER = [-0.12, -0.06, 0.06, 0.12].map(o => [o, 0.15 - Math.sqrt(0.15 * 0.15 - o * o)]);
const ALL_GRIP = [1, 1, 1], _grips = [1, 1, 1];
// 'hyper' tune (the user's Peugeot 508): 1400 W/kg with a 1.43 g traction limit, drag for a natural 580 km/h,
// electronic limiter at 500 km/h -> 0-100 km/h 2.0 s, 0-300 6.4 s, 0-500 14 s (tools/../README); 8-speed box
// grip of the road under the tyres, relative to dry asphalt (main.js: ~0.3 on snow): on snow the longitudinal and
// lateral acceleration stay within mu * g (the hyper tune's 1.43 g of traction scaled the same way)
// sink: how deep the snow lies under the wheels off the roads (m): it holds the car back; wind: a gale's push (m/s)
export const TRACTION = { mu: 1, sink: 0, wind: null, wet: 0 };
// (V95) what is under the tyres: [grip dry, grip wet - both relative to dry asphalt (mu ~0.85) - rolling resistance dry,
// wet]. From the usual tables of tyre-road friction (README, V95): asphalt 0.8-0.9 dry and 0.5-0.7 wet, concrete the same
// dry and 0.6-0.8 wet, rolled gravel 0.4-0.7 dry and 0.3-0.5 wet, an earth road 0.68 dry and ~0.55 wet, grass 0.35
// (wet grass, setts and paving blocks: taken between their neighbours, no figure found). TRACTION.wet: how wet the
// ground is (0-1, main.js); snow goes over all of it (TRACTION.mu)
export const SURF = {
  asphalt: [1, 0.71, 0.013, 0.014], concrete: [1, 0.8, 0.013, 0.014], paving: [0.9, 0.66, 0.016, 0.017], cobble: [0.82, 0.58, 0.02, 0.021],
  gravel: [0.68, 0.5, 0.022, 0.026], dirt: [0.8, 0.6, 0.03, 0.05], grass: [0.41, 0.3, 0.06, 0.08],
};

const HYPER = { P: 1400, A0: 14, top: 580 / 3.6, limit: 500 / 3.6, brake: 14, shifts: [0, 70, 125, 185, 250, 320, 390, 450, 505],
  // cornering: 3.2 g of mechanical grip plus aero downforce growing with v^2 (+1.6 g at 500 km/h);
  // progressive steering: full lock in 0.16 s (50 km/h) to 0.35 s (300+ km/h), back to centre in 0.15 s; tyre scrub 4 %
  lat: 3.2 * 9.81, latAero: 1.6 * 9.81, steerIn: 0.35, steerOut: 0.15, scrub: 0.04 };
HYPER.cd = (HYPER.P / HYPER.top - 0.15) / (HYPER.top * HYPER.top);

// (V93) the suspension. Each wheel on a spring and a damper carrying its quarter of the car - an ordinary car bounces at
// ~1.4 Hz with ~35% of critical damping, a sports car stiffer (~1.9 Hz), an air-sprung limousine softer (~1.1 Hz) -
// and the car a rigid body over them that rises, falls, pitches and rolls (its inertia: radii of gyration ~0.48 of the
// wheelbase in pitch - a 1.6 t car's ~3000 kg m^2 - and ~0.38 of the track in roll). So it is no longer glued to the road: over a crest taken fast it
// gets light and leaves the ground (once v^2 / R > g: a crest of 145 m radius at ~136 km/h), flies its arc - the nose
// dipping, the rear wheels pushing longest - lands on its springs (the bump stops past their travel) and settles. A
// wheel carries a load (1: its quarter of the car at rest) and grips, drives, brakes and steers in proportion to it,
// up to its full grip: off the ground, nothing. Its tyre rolls over a step (a curb) instead of jumping it: the ground
// under it is the highest of five points under the tyre's round. (f: Hz, zeta: of critical damping, droop / bump: the
// wheel's travel below / above where it rests, m)
export const SUSP = { f: 1.4, zeta: 0.35, droop: 0.11, bump: 0.08 };
const SUSP_HYPER = { f: 1.9, zeta: 0.45, droop: 0.07, bump: 0.06 }, SUSP_OFFROAD = { f: 1.6, zeta: 0.4, droop: 0.15, bump: 0.12 };
// (V94) made steady. The springs have their own clock: the body is stepped at most 1/240 s at a time whatever the frame
// rate (SUB), the ground under each wheel carried evenly from where it was a step ago to where it is now - at 20 frames a
// second the bump stops, ten times a spring's stiffness, were past what one step of 1/20 s can hold. The dampers are a
// car's: softer as the wheel comes up than as it goes back down (rebound ~2.5 times bump, the same damping on the
// whole), and blowing off - they hold at most 1.2 (bump) and 2 (rebound) times the wheel's share of the car. The bump
// stops are progressive (rubber: soft at the touch, hard at the end), give back under half of what they took, with a
// hydraulic stop's push against the closing; a wheel pushes with at most 8 times its share (G4: a quarter of g). Past the
// stops (STOP) the body is held off the ground corner by corner, stopped dead there instead of thrown: off a ledge too
// high for its travel a corner takes on at most LIFT m/s. In the air a car turns on as it left the ground, the air
// damping it only slightly (~0.15 /s at 130 km/h for a body 4.6 m long): AIR is a steadying hand beyond that, chosen.
// The fast car's wings press it down as the square of its speed (its tune's latAero: 1.6 g at 500 km/h, as a
// track-day hypercar's ~1 t at 275 km/h on 1.4 t), carried by its springs at the height it rides (an active
// suspension's work): over a crest it stays down up to the speed where v^2 / R > g + the wings' push
const SUB = 1 / 240, G4 = 9.81 / 4, STOP = 0.07, LIFT = 2, AIR = 1.2;
const ratio0 = (E, g) => E.G[g - 1];
const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

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
    // a tune: the same physical model as the hyper car's, with a model's own numbers (maybach.js)
    this.hyper = opts.hyper ? HYPER : opts.tune ?? null;
    if (this.hyper && this.hyper.cd === undefined) this.hyper.cd = (this.hyper.P / this.hyper.top - 0.15) / (this.hyper.top * this.hyper.top);
    this.wheelbase = this.m.axles[1] - this.m.axles[0];
    // the springs (SUSP): per wheel, a quarter of the car's stiffness and damping, per unit of its mass
    const sp = { ...SUSP, ...(this.hyper === HYPER ? SUSP_HYPER : {}), ...(this.m.offroad ? SUSP_OFFROAD : {}), ...(opts.susp ?? {}) }, w = 2 * Math.PI * sp.f;
    const hw = this.m.W / 2 - 0.15, zf = this.m.axles[0] - this.m.L / 2, zr = this.m.axles[1] - this.m.L / 2;
    const cw = 2 * sp.zeta * w / 4;
    this.sp = { ...sp, k: w * w / 4, s0: 9.81 / (w * w), cB: cw * 0.57, cR: cw * 1.43, dB: 1.2 * G4, dR: 2 * G4,
      kb: 2.5 * w * w, cS: 0.5 * w, dS: 4 * G4, Fmax: 8 * G4,
      rp2: (0.48 * this.wheelbase) ** 2, rr2: (0.38 * 2 * hw) ** 2, spots: [[-hw, zf], [hw, zf], [-hw, zr], [hw, zr]] };
    this.vs = null; this.landing = 0; this.eng = null; this.shiftT = 0; this.reverse = false; this.skid = 0; this.spinK = 0; this.surf = 'asphalt';
    this.box = new Box(x, z, car.half.w, car.half.l, heading, -1, 1.6, 'car');
    this.box.vehicle = this;
    world.addDynamic(this.box);
    this.impact = 0;
    this.lastLat = 0;
    this.place(0);
  }
  get speed() { return -(this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h)); }
  // (kg, with its driver: its data sheet's, or its model's - a car of no known make 1.4 t)
  get mass() { return this.eng?.m ?? this.m.mass ?? (this.hyper ? 1575 : 1400); }
  // the ground under the 4 wheels (fl, fr, rl, rr) and the plane through them: where a car at rest stands
  groundFit() {
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
      k.y = (k.fl + k.fr + k.rl + k.rr) / 4;
      k.pitch = Math.atan2((k.fl + k.fr) / 2 - (k.rl + k.rr) / 2, this.wheelbase);    // (> 0: the nose up the hill)
      k.roll = Math.atan2((k.fr + k.rr) / 2 - (k.fl + k.rl) / 2, hw * 2);
    }
    return k;
  }
  place(dt) {
    if (this.remote && this.vs) this.vs.awake = false;       // (a friend's car: where they drive it, on the ground)
    const g = this.car.group, fit = this.groundFit(), S = this.vs?.awake ? this.vs : null;
    this.slope = fit.pitch;
    // on its springs (suspend), or at rest on the ground
    const y = S ? S.y : fit.y;
    this.gy = y;
    g.position.set(this.x, y, this.z);
    g.rotation.set(S ? S.th : fit.pitch, this.h, S ? S.ph : fit.roll, 'YXZ');
    this.car.bodyPivot.rotation.set(this.pitch, 0, this.roll);
    this.car.bodyPivot.position.y = -Math.abs(this.pitch) * 0.2;
    // wheels: down on the ground while they touch it, hanging at full droop off it
    this.car.setWheels(this.spin, this.steer, S ? S.drop : null);
    // its contact shadow stays on the ground under it, fading as the car leaves it
    const b = this.car.blob;
    if (b) {
      const up = S ? Math.max(0, (S.e[0] + S.e[1] + S.e[2] + S.e[3]) / 4) : 0;
      if (up > 0.01 && !b.userData.own) { b.material = b.material.clone(); b.userData.own = true; b.userData.op = b.material.opacity; }
      b.position.y = 0.02 - up;
      if (b.userData.own) b.material.opacity = b.userData.op * (1 - smooth01(up / 1.2));
    }
    // the steering wheel (7 turns of it to the wheels' angle), or an ATV's bars, about their leaning column
    if (this.car.steer) {
      if (this.m.steerRatio) this.car.steer.rotation.y = -this.steer * this.m.steerRatio; else this.car.steer.rotation.z = this.steer * 7;
      if (!this.car.steer.matrixAutoUpdate && this.car.steer.rotation.z !== this.car.steer.userData.rz) { this.car.steer.userData.rz = this.car.steer.rotation.z; this.car.steer.updateMatrix(); }
    }
    // (V95) its collision box at its own height: it stood at the home street's level (y -1..1.6) wherever the car was -
    // on the hills and in the valleys, 54 of the 119 cars let other cars and people on foot straight through them
    this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.y0 = y - 1; this.box.y1 = y + 1.6; this.box.update();
    void dt;
  }
  // (V95) the engine and the gearbox of a car with a known engine (tunerdata.js: its torque curve, its mass, its top
  // speed, which wheels drive). The gears: a typical 5- or 6-speed set, the top one such that the car's real top speed
  // falls at 97 % of the revs of its peak power (as on the cars checked: 320d 6th, Golf TDI 5th, Corsa 1.2 5th); the
  // air's drag such that the engine's power there, less 10 % lost on the way to the wheels and the tyres' rolling,
  // just holds that speed. So nothing is fitted to the acceleration figures: they come out of the torque curve
  setEngine(sp) {
    if (!sp || !sp.m || !sp.v) { this.eng = null; return; }
    const r = this.m.r, m = sp.m + 75, six = sp.gb === 6;
    const rel = six ? [6.0, 3.35, 2.1, 1.5, 1.2, 1] : sp.type === 'td' ? [4.95, 2.8, 1.8, 1.28, 1] : [4.3, 2.45, 1.62, 1.26, 1];
    const vTop = sp.v / 3.6, nTop = 0.97 * sp.nP, top = nTop / (vTop / (2 * Math.PI * r) * 60), eta = 0.9;
    const pTop = torque0(sp, nTop) * nTop / 9549 * 1000;
    const fs = sp.drv === 'r' ? 0.5 : sp.drv === 'a' ? 0.57 : 0.61, hl = 0.2;                 // (front axle's share of the weight; centre of mass height / wheelbase)
    this.eng = { sp, m, G: rel.map(k => k * top), eta, cda: 2 * (eta * pTop - 0.013 * m * 9.81 * vTop) / (1.2 * vTop ** 3), red: sp.red, drv: sp.drv ?? 'f', fs, hl,
      idle: sp.type === 'td' ? 800 : 850, launch: sp.type === 'td' ? 1900 : sp.type === 'tp' ? 2600 : 3200, eco: sp.type === 'td' ? 2000 : 2500, lug: sp.type === 'td' ? 1150 : 1350,
      shift: 0.3, gain: null, lat: sp.lat ?? 0.85 };
    this.gear = 1;
  }
  // its engine's torque (Nm) at n rpm, with the file written into its ECU (tuner.js: gain per rev column)
  torqueAt(n) {
    const E = this.eng, g = E.gain;
    let k = 1;
    if (g) { const c = g.cols, q = g.g; if (n <= c[0]) k = q[0]; else if (n >= c[c.length - 1]) k = q[q.length - 1]; else for (let i = 1; i < c.length; i++) if (n <= c[i]) { k = q[i - 1] + (q[i] - q[i - 1]) * (n - c[i - 1]) / (c[i] - c[i - 1]); break; } }
    return torque0(E.sp, Math.min(n, E.red * 1.02)) * k;
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
    // a gale pushes the car you drive (side force ~ 0.5 rho v^2 A Cy / m: ~0.9 m/s^2 at 20 m/s): it drifts across the
    // lane unless you steer against it
    const wv = TRACTION.wind;
    if (ctl && wv) { const ws = Math.hypot(wv.x, wv.z); if (ws > 3) { this.vx += wv.x * 0.0022 * ws * dt; this.vz += wv.z * 0.0022 * ws * dt; } }
    const fwdX = -Math.sin(this.h), fwdZ = -Math.cos(this.h);
    const rtX = Math.cos(this.h), rtZ = -Math.sin(this.h);
    let vF = this.vx * fwdX + this.vz * fwdZ;
    let vR = this.vx * rtX + this.vz * rtZ;
    let accel = 0, hand = false, steerIn = 0, t = 0;
    this.brake = 0; this.spinK = 0; this.kI = 1;
    const Hy = this.hyper, E = Hy ? null : this.eng;
    if (ctl) { steerIn = ctl.steer; hand = ctl.handbrake; t = ctl.throttle; this.throttle = t; }
    else { this.throttle = 0; hand = true; }
    // (V95) what is under the tyres (looked up every half metre of the way): its grip, dry or wet, and how hard it is
    // to roll on; the snow over it; an ATV's knobby tyres bite into loose ground and snow
    if (ctl || Math.abs(vF) > 0.05 || Math.abs(vR) > 0.05) {
      const c = this._sf ??= { x: 1e9, z: 1e9 };
      if (Math.abs(this.x - c.x) + Math.abs(this.z - c.z) > 0.5) { c.x = this.x; c.z = this.z; this.surf = this.world.surfaceAt ? this.world.surfaceAt(this.x, this.z, this.gy) : 'asphalt'; }
    }
    const sf = SURF[this.surf] ?? SURF.asphalt, wet = TRACTION.wet ?? 0;
    let muS = sf[0] + (sf[1] - sf[0]) * wet;
    if (this.m.offroad && muS < 0.95) muS = Math.min(1, muS * 1.3);
    const mu = Math.min(muS, this.m.snowGrip ? 1 - (1 - TRACTION.mu) * this.m.snowGrip : TRACTION.mu), crr = sf[2] + (sf[3] - sf[2]) * wet;
    this.mu = mu;
    // (V93) the wheels drive and brake by the load on them (suspend): light over a crest, nothing in the air
    const [kAll, kFront, kRear] = this.grips();
    let aGrip = 10 * mu;                                                   // (what its tyres can pull or brake with here, m/s^2)
    if (Hy) {
      aGrip = (Hy.aMax ?? 14) * mu;
      if (t > 0) { if (vF < -0.5) { accel = Hy.brake; this.brake = 1; } else accel = t * Math.min(Hy.A0, Hy.P / Math.max(1, vF)); }
      else if (t < 0) { if (vF > 0.5) { accel = -Hy.brake; this.brake = 1; } else accel = vF > -7 ? -3.2 : 0; }
      accel = clamp(accel, -aGrip, aGrip) * kAll;
    } else if (E && ctl) accel = this.powertrain(dt, t, vF, mu, kAll, kFront, kRear);
    else if (ctl) {
      // (a vehicle without an engine of its own here - the ATV's belt drive: a pull that fades toward its top speed)
      if (t > 0) { if (vF < -0.5) { accel = 9; this.brake = 1; } else accel = 4.2 * this.power * t * (1 - Math.pow(Math.max(0, vF) / this.vmax, 2)) * [1.25, 1.0, 0.85, 0.72, 0.62][this.gear - 1]; }
      else if (t < 0) { if (vF > 0.5) { accel = -9.5; this.brake = 1; } else accel = vF > -7 ? -3.2 : 0; }
      accel = clamp(accel, -aGrip, aGrip) * kAll;
    }
    // what holds it back: the air (in the air too), the tyres' rolling on what is under them, deep snow - these two at
    // most 85 % of what its driven wheels can push with there (it crawls on: on a front-drive car's tyres 30 cm of snow
    // would hold it for good)
    const sink = 2.5 * (this.m.float ?? 1) * Math.min(1, TRACTION.sink / 0.3);
    const roll = Math.min(E ? crr * 9.81 + sink : (ctl && ctl.throttle ? 0.15 : 0.55) + (crr - 0.013) * 9.81 + sink, 0.85 * (E ? this.traction(mu) : aGrip));
    const drag = (E ? 0.6 * E.cda / E.m : Hy ? Hy.cd : 0.0012) * vF * Math.abs(vF) + kAll * Math.sign(vF) * roll;
    // (V95) the hill: every car is pulled back going up it and on going down it (only the ATV was, before)
    const hill = this.slope ? -9.81 * Math.sin(this.slope) * kAll : 0;
    // standing, nothing asked of it: held where it is, on a hill too (to ~37 deg)
    const held = Math.abs(vF) < 0.3 && (!ctl || !ctl.throttle) && kAll > 0.5 && Math.abs(hill) < 5.9;
    if (held) vF *= Math.exp(-6 * dt);
    else vF += (accel - drag + hill) * this.kI * dt;                      // (kI: the engine's own turning mass rides on the gear - powertrain)
    // the handbrake: the rear wheels locked - what their tyres' sliding gives (~0.35 g; it took 3.7 g off a car at
    // 108 km/h before V95), holding a standing car against less than that. A parked car: in gear and braked
    if (hand) { const d = (ctl ? 3.4 * mu : 4.5 + 2 * Math.abs(vF)) * kRear * dt; vF = Math.abs(vF) <= d ? 0 : vF - Math.sign(vF) * d; }
    if (Hy) vF = Math.min(vF, Hy.limit);

    // steering (less lock at speed)
    let maxSteer = 0.58 / (1 + (vF * vF) / 220);
    const Hs = this.hyper, va = Hs ? Hs.vAero ?? Hs.limit : 1, aeroQ = Hs ? Math.min(1, (vF * vF) / (va * va)) : 0;   // (vAero: the speed its wings were set for, when a tune moved its limiter)
    // (V95) the tyres' side grip here (m/s^2): the car's own on dry asphalt (in g: ~0.85 for a family car - its data
    // sheet's; the fast car's 3.2 and its wings') times what is under them, less what braking or pulling already asks of
    // them (the friction circle: of the most the tyres give either way). Before, an ordinary car cornered at 2.5-4.4 g
    const latFull = (Hs ? Hs.lat + Hs.latAero * aeroQ : (E?.lat ?? this.m.lat ?? 0.85) * 9.81) * mu;
    const used = Math.min(1, Math.abs(accel) / (Math.max(aGrip, latFull) * Math.max(0.05, kAll) + 1e-6)), latMax = latFull * Math.sqrt(1 - 0.75 * used * used);
    if (Hs && Math.abs(vF) > 12) {
      // steering angle for the grip available at this speed (tyres + downforce), so full lock = the limit
      maxSteer = Math.atan(latMax * this.wheelbase / (vF * vF));
      // progressive, rate-limited steering: a tap gives a small correction, holding builds to the limit
      const target = steerIn * maxSteer;
      const building = Math.abs(target) > Math.abs(this.steer) && (this.steer === 0 || Math.sign(target) === Math.sign(this.steer));
      const tIn = Hs.steerIn * (0.45 + 0.55 * Math.min(1, Math.abs(vF) / 83));   // quicker at town speeds, calmer at 300+
      const rate = maxSteer / (building ? tIn : Hs.steerOut);
      this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    } else {
      // (an ordinary car's wheel: turned at most a little past what its tyres hold at this speed - with the keys, full
      // lock is the limit of grip and a trace of squeal)
      if (!Hs && vF * vF > 9) maxSteer = Math.min(maxSteer, Math.atan(1.12 * latMax * this.wheelbase / (vF * vF)));
      this.steer = damp(this.steer, steerIn * maxSteer, 6, dt);
    }
    // the car turns only as tightly as its tyres hold: asked for more (the brakes put on in a bend, the asphalt
    // ending), it runs wide and scrubs speed off
    let yawRate = -vF * Math.tan(this.steer) / this.wheelbase * kFront;    // (front wheels off the ground steer nothing)
    let over = 0;
    if (Math.abs(vF) > 1) {
      const lim = latMax * Math.max(0.05, kAll) / Math.abs(vF);
      if (Math.abs(yawRate) > lim) { over = Math.min(1.5, Math.abs(yawRate) / lim - 1); yawRate = Math.sign(yawRate) * lim; }
    }
    // (V95) the handbrake in a bend: the rear tyres slide - the car turns further than its way does (the tail out; its
    // way turned 1.55 times tighter than the tyres hold, before)
    const hPath = this.h + yawRate * dt;
    this.h += yawRate * dt * (hand && ctl && Math.abs(vF) > 4 ? 1.55 : 1);
    // tyre scrub: cornering hard costs a little speed; past the limit, more
    if (Hs) vF -= Math.sign(vF) * Math.abs(vF * yawRate) * Hs.scrub * dt * kFront;
    if (over > 0) vF -= Math.sign(vF) * Math.min(2.5, over * 2.2) * mu * dt;

    // sideways (the handbrake lets the rear slide): the tyres bring a slide back with at most their grip (a car going
    // sideways at 20 km/h takes ~0.7 s over it; it was stopped in 0.2 s, at over 5 g)
    const gRate = (hand && Math.abs(vF) > 3 ? 1.4 : 11) * (0.25 + 0.75 * mu) * kAll;
    vR -= Math.sign(vR) * Math.min(Math.abs(vR) * (1 - Math.exp(-gRate * dt)), latFull * kAll * dt);
    this.lastLat = vR;
    // (how hard the tyres are sliding, 0-1: past their side grip, the driven wheels spinning, the rear ones locked by
    // the handbrake, the whole car sideways - the squeal, the marks, the smoke: main.js)
    const sk = Math.max(Math.min(1, over * 1.6), this.spinK, hand && ctl && Math.abs(vF) > 3 ? 1 : 0, Math.min(1, Math.max(0, Math.abs(vR) - 1.2) / 4)) * (kAll > 0.2 ? 1 : 0);
    this.skid += (sk - this.skid) * Math.min(1, dt * (sk > this.skid ? 14 : 6));
    const nfX = -Math.sin(hPath), nfZ = -Math.cos(hPath);
    const nrX = Math.cos(hPath), nrZ = -Math.sin(hPath);
    this.vx = nfX * vF + nrX * vR;
    this.vz = nfZ * vF + nrZ * vR;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // body dynamics (springy pitch/roll)
    const longA = accel - (hand ? Math.sign(vF) * 3 : 0);
    const latA = vF * yawRate;
    const tp = clamp(longA * 0.006, -0.05, 0.05), tr = clamp(-latA * (Hs ? Hs.roll ?? 0.0016 : 0.0065), -0.06, 0.06);   // stiff, low hyper car
    this.pitchV += ((tp - this.pitch) * 60 - this.pitchV * 9) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((tr - this.roll) * 50 - this.rollV * 8) * dt; this.roll += this.rollV * dt;
    this.spin -= (vF / this.m.r) * dt;

    // gearbox & rpm (a car with its own engine: powertrain)
    const kmh = Math.abs(vF) * 3.6;
    if (this.hyper) {
      const up = this.hyper.shifts;
      let g = 1; for (let i = 0; i < up.length - 1; i++) if (kmh > up[i]) g = i + 1;
      this.gear = g;
      const f = (kmh - up[g - 1]) / (up[g] - up[g - 1]);
      const [r0, r1] = this.hyper.rpm ?? [3000, 8000];
      const target = kmh < 3 ? 900 + (ctl && ctl.throttle > 0 ? 2600 : 0) : r0 + (r1 - r0) * Math.min(1, f);
      this.rpm = damp(this.rpm, this.engineOff ? 0 : target, 10, dt);
      this.reverse = vF < -0.5;
    } else if (!E) {
      const up = [0, 22, 45, 70, 98];
      let g = 1; for (let i = 0; i < up.length; i++) if (kmh > up[i]) g = i + 1;
      this.gear = g;
      const wheelRpm = Math.abs(vF) / (2 * Math.PI * this.m.r) * 60;
      const target = Math.max(850, wheelRpm * GEARS[g - 1] * 3.9 + (ctl && ctl.throttle > 0 ? 900 : 0));
      this.rpm = damp(this.rpm, this.engineOff ? 0 : Math.min(6800, target), 8, dt);   // (engineOff: the ignition on, the engine stopped - tuner.js)
      this.reverse = vF < -0.5;
    } else if (!ctl) { this.gear = 1; this.reverse = false; this.rpm = damp(this.rpm, this.engineOff ? 0 : E.idle, 8, dt); }

    this.resolveStatic();
    this.suspend(dt, !!ctl);
    // lights
    const tl = this.car.lights.tailMat;
    tl.emissiveIntensity = this.brake ? 3.0 : (this.lightsOn ? 0.9 : 0.12 * DAYLIGHT.k);
    this.place(dt);
  }
  // (V95) the engine, the clutch and the gearbox for one step: the acceleration they give at the wheels (m/s^2).
  // The gearbox changes by itself: up at the revs the right foot asks for (2000-2500 going gently, 94 % of the limiter
  // flat out), down when the revs fall too low or the foot goes down (kickdown, several gears at once); a change takes
  // 0.3 s with no pull. Pulling away, the clutch slips with the engine held near its launch revs. The driven wheels
  // push at most what their tyres hold with the weight that is on them as the car squats (front-drive
  // mu g fs / (1 + mu h/L), rear-drive mu g (1 - fs) / (1 - mu h/L), all four ~mu g): past it they spin (spinK). Off
  // the throttle in gear the engine holds the car back (~9 % of its peak torque, more with revs). The brakes: all
  // four wheels at their grip (~1 g dry: 100-0 km/h in ~39 m), anti-lock
  powertrain(dt, t, vF, mu, kAll, kFront, kRear) {
    const E = this.eng, r = this.m.r, N = E.G.length, wr = Math.abs(vF) / (2 * Math.PI * r) * 60;
    let g = Math.min(N, Math.max(1, this.gear | 0)), thr = 0, rev = false;
    if (t > 0 && vF >= -0.5) thr = t;
    else if (t < 0 && vF <= 0.5) { thr = -t; rev = true; }
    else if (t !== 0) this.brake = 1;
    this.reverse = rev || vF < -0.5;
    if (this.shiftT > 0) this.shiftT -= dt;
    else if (!rev) {
      const upAt = E.eco + (0.94 * E.red - E.eco) * Math.pow(thr, 1.5), dnAt = E.lug + (0.6 * E.red - E.lug) * thr * thr;
      // (flat out past its power peak, the next gear pulls harder: a six-speed car reaches its top speed in sixth)
      const n0 = wr * E.G[g - 1];
      if (g < N && (n0 > upAt || (thr > 0.6 && n0 > E.sp.nP && this.torqueAt(wr * E.G[g]) * E.G[g] > this.torqueAt(n0) * ratio0(E, g) * 1.01))) { g++; this.shiftT = E.shift; }
      else { let k = g; while (k > 1 && wr * E.G[k - 1] < dnAt && wr * E.G[k - 2] < upAt * 0.92) k--; if (k !== g) { g = k; this.shiftT = E.shift * 0.7; } }
    } else g = 1;
    this.gear = g;
    const ratio = E.G[g - 1], nW = wr * ratio;                           // (the engine's revs with the clutch home)
    const nE = Math.max(nW, thr > 0 && g === 1 ? E.idle + (E.launch - E.idle) * thr : E.idle);
    let Tq = 0;
    if (this.shiftT > 0 || this.engineOff) Tq = 0;
    else if (thr > 0) Tq = nE > E.red ? 0 : this.torqueAt(nE) * thr;
    else if (nW > E.idle + 150) Tq = -0.09 * E.sp.nm * (0.4 + nE / E.red);
    const F = Tq * ratio * E.eta / r / E.m;                              // (at the wheels, per kg of the car)
    // the engine's own turning mass rides on the gear (a flywheel of ~0.2 kg m^2: in first, a third of the car again)
    const kI = 1 / (1.03 + 0.0016 * ratio * ratio);
    const aTrac = this.traction(mu) * (E.drv === 'f' ? kFront : E.drv === 'r' ? kRear : kAll);
    let a;
    if (F > 0) {
      if (F * kI > aTrac) { this.spinK = Math.min(1, (F * kI - aTrac) / Math.max(0.5, aTrac) * 2); a = aTrac; } else { a = F; this.kI = kI; }
      if (rev) a = -a;
    } else a = -Math.sign(vF) * Math.min(-F, aTrac);                      // (off the throttle: the engine holds it back)
    if (this.brake) a = clamp(a - Math.sign(vF) * 10 * mu * Math.abs(t) * kAll, -10.4 * mu, 10.4 * mu);
    // (the rev counter: the wheels spinning take the engine up with them)
    const nShow = this.shiftT > 0 ? Math.max(E.idle, nW) : nE + Math.max(0, 0.92 * E.red - nE) * 0.6 * this.spinK;
    this.rpm = damp(this.rpm, this.engineOff ? 0 : nShow, this.shiftT > 0 ? 9 : 18, dt);
    return a;
  }
  // what its driven wheels can push with (m/s^2) on a grip of mu: the weight on them as the car squats
  traction(mu) {
    const E = this.eng, mg = 9.81 * mu;
    return E.drv === 'f' ? mg * E.fs / (1 + mu * E.hl) : E.drv === 'r' ? mg * (1 - E.fs) / (1 - mu * E.hl) : mg * 0.97;
  }
  // (V93) the springs: one step of the car's rise and fall, pitch and roll over its 4 wheels (update's sub-steps), and
  // the loads the wheels carry. A parked car sleeps on the ground (the plane through its wheels: place) until it is
  // driven or pushed; a car taken somewhere else at a stroke starts again at rest there
  suspend(dt, driven) {
    const P = this.sp, fit = this.groundFit();
    const S = this.vs ??= { awake: false, y: 0, vy: 0, th: 0, wth: 0, ph: 0, wph: 0, e: [0, 0, 0, 0], load: [1, 1, 1, 1], drop: [0, 0, 0, 0], gp: null, still: 0, air: 0, x: NaN, z: NaN };
    const moving = Math.hypot(this.vx, this.vz) > 0.05;
    if (!S.awake && !driven && !moving) return;
    if (!S.awake || dt <= 0 || Math.hypot(this.x - S.x, this.z - S.z) > 12 || Math.abs(S.y - fit.y) > 4) {
      // (at rest on its springs where it stands, rising and falling with the road under it as it goes)
      S.awake = true; S.y = fit.y; S.th = fit.pitch; S.ph = fit.roll; S.vy = Math.tan(fit.pitch) * this.speed; S.wth = S.wph = 0; S.gp = null; S.still = 0; S.air = 0;
      S.e.fill(0); S.load.fill(1); S.drop.fill(0);
    }
    S.x = this.x; S.z = this.z;
    if (dt <= 0) return;
    // the ground under each tyre: the corners' (a car pushed about), or the highest of five points under the tyre's
    // round (the car you drive: it rolls up a curb's edge)
    const g4 = this._g4 ??= [0, 0, 0, 0];
    if (driven) {
      const s = Math.sin(this.h), c = Math.cos(this.h), r = this.m.r;
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = P.spots[i];
        let best = -Infinity;
        for (const d of TYRE) {
          const dz = lz + d[0] * r, h = this.world.groundHeight(this.x + lx * c + dz * s, this.z - lx * s + dz * c, this.gy) - d[1] * r;
          if (h > best) best = h;
        }
        for (const [o, up] of SHOULDER) {
          const h = this.world.groundHeight(this.x + (lx + o) * c + lz * s, this.z - (lx + o) * s + lz * c, this.gy) - up;
          if (h > best) best = h;
        }
        g4[i] = best;
      }
    } else { g4[0] = fit.fl; g4[1] = fit.fr; g4[2] = fit.rl; g4[3] = fit.rr; }
    // (just woken: the ground where it stands)
    const gp = S.gp ??= g4.slice(), gd = this._gd ??= [0, 0, 0, 0], Fm = this._Fm ??= [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) { gd[i] = Math.max(-25, Math.min(25, (g4[i] - gp[i]) / dt)); Fm[i] = 0; }   // (how fast the ground under it rises)
    // the wings' push (per unit of the car's mass), by the square of its speed
    const Hy = this.hyper, va = Hy ? Hy.vAero ?? Hy.limit : 1, aero = Hy?.latAero ? Hy.latAero * Math.min(1, (this.vx * this.vx + this.vz * this.vz) / (va * va)) : 0;
    const n = Math.max(1, Math.ceil(dt / SUB - 1e-6)), h = dt / n, air = Math.exp(-AIR * h);
    let touching = 0, hit = 0, crash = 0;
    for (let j = 1; j <= n; j++) {
      const u = j / n;
      let sth = Math.sin(S.th), cth = Math.cos(S.th), sph = Math.sin(S.ph), cph = Math.cos(S.ph), Fy = 0, Mt = 0, Mp = 0;
      touching = 0;
      for (let i = 0; i < 4; i++) {
        const lx = P.spots[i][0], lz = P.spots[i][1];
        const e = S.y - lz * sth + lx * sph - (gp[i] + (g4[i] - gp[i]) * u);       // (the chassis over this wheel, above its rest)
        const ed = S.vy - lz * cth * S.wth + lx * cph * S.wph - gd[i];
        let F = 0;
        if (e < P.droop) {
          // the spring (and the wings' load, carried while the wheel is down), the damper
          F = P.k * (P.s0 - e) + aero * 0.25 * (1 - e / P.droop);
          F -= ed < 0 ? P.dB * Math.tanh(P.cB * ed / P.dB) : P.dR * Math.tanh(P.cR * ed / P.dR);
          const x = -P.bump - e;
          if (x > 0) F += P.kb * x * (1 + x / 0.035) * (ed <= -0.2 ? 1 : ed >= 0.2 ? 0.45 : 1 - 0.55 * (ed + 0.2) / 0.4) + Math.min(P.dS, -P.cS * Math.min(0, ed));   // (on the bump stop)
          F = Math.max(0, Math.min(P.Fmax, F));
          touching++;
          if (S.air > 0.12 && ed < hit) hit = ed;                                // (the landing: how fast it came down on it)
        }
        Fm[i] += F; Fy += F; Mt -= F * lz; Mp += F * lx;
        if (j === n) { S.e[i] = e; S.drop[i] = -Math.max(-P.bump - 0.02, Math.min(P.droop, e)); }
      }
      S.air = touching ? 0 : S.air + h;
      // gravity, the wings, the springs' push and their turning moments over the car's inertia (semi-implicit Euler)
      S.vy += (Fy - 9.81 - aero) * h; S.wth += Mt / P.rp2 * h; S.wph += Mp / P.rr2 * h;
      if (!touching) { S.wth *= air; S.wph *= air; }
      S.y += S.vy * h; S.th += S.wth * h; S.ph += S.wph * h;
      // (past its stops a corner would go into the ground: held on it, moved up with it, the blow taken there)
      for (let pass = 0; pass < 2; pass++) {
        sth = Math.sin(S.th); cth = Math.cos(S.th); sph = Math.sin(S.ph); cph = Math.cos(S.ph);
        let any = false;
        for (let i = 0; i < 4; i++) {
          const lx = P.spots[i][0], lz = P.spots[i][1];
          const pen = gp[i] + (g4[i] - gp[i]) * u - P.bump - STOP - (S.y - lz * sth + lx * sph);
          if (pen <= 0) continue;
          any = true;
          const jt = -lz * cth, jp = lx * cph, wi = 1 / (1 + jt * jt / P.rp2 + jp * jp / P.rr2), dq = pen * wi;
          S.y += dq; S.th += dq * jt / P.rp2; S.ph += dq * jp / P.rr2;
          const va = S.vy + jt * S.wth + jp * S.wph, want = Math.min(gd[i], LIFT);
          if (va < want) { const l = (want - va) * wi; S.vy += l; S.wth += l * jt / P.rp2; S.wph += l * jp / P.rr2; crash = Math.max(crash, want - va); }
        }
        if (!any) break;
      }
    }
    for (let i = 0; i < 4; i++) { S.load[i] = Fm[i] / n / G4; gp[i] = g4[i]; }   // (1: its share of the car at rest)
    // (the model has no roof to land on: a car here does not go over - past ~30 deg from the ground under it, it turns
    // no further that way; its angle is left as it is: the ground may have turned under it, at a bank's edge)
    if ((S.th - fit.pitch) * S.wth > 0 && Math.abs(S.th - fit.pitch) > 0.52) S.wth = 0;
    if ((S.ph - fit.roll) * S.wph > 0 && Math.abs(S.ph - fit.roll) > 0.52) S.wph = 0;
    this.landing = Math.max(this.landing, hit < -1 ? -hit : 0, crash > 1 ? crash : 0);
    this.crashed = crash;
    // (asleep again once it has stood still on its wheels for a second, the car not driven: back to the plane)
    if (!driven && !moving && touching === 4 && Math.abs(S.vy) < 0.03 && Math.abs(S.wth) < 0.03 && Math.abs(S.wph) < 0.03) { S.still += dt; if (S.still > 1) S.awake = false; }
    else S.still = 0;
  }
  // (how much of each wheel's grip it has: its load, at most its full grip; all 4, the front pair, the rear pair)
  grips() {
    const S = this.vs?.awake ? this.vs : null;
    if (!S) return ALL_GRIP;
    const l = S.load, c = (x) => Math.max(0, Math.min(1, x));
    _grips[0] = c((l[0] + l[1] + l[2] + l[3]) / 4); _grips[1] = c((l[0] + l[1]) / 2); _grips[2] = c((l[2] + l[3]) / 2);
    return _grips;
  }
  resolveStatic() {
    const list = this.world.query(this.x, this.z, 4, tmp);
    const gy = this.gy ?? this.world.groundHeight(this.x, this.z);
    this.impact = 0;
    for (let it = 0; it < 3; it++) {
      let any = false;
      const sx = this.x, sz = this.z;
      this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
      for (const b of list) {
        if (b === this.box || b.y1 < gy + 0.45 || b.y0 > gy + 2.2 || b.ghost || b.sapling) continue;   // curbs and decks overhead don't count; a car rides over the young spruces
        const p = boxBox(this.box, b);
        if (!p) continue;
        if (b.npc) { b.npc.hit(this, p); continue; }
        any = true;
        if (b.vehicle) {
          // push both cars apart and share the blow by their masses ((V95) they were all taken as equal: a Corsa threw
          // a van as far as the van threw it): the heavier one moves less and keeps more of its speed; the blow is
          // mostly spent in the metal (restitution 0.2 - what two equal cars had)
          const o = b.vehicle, m1 = this.mass, m2 = o.mass, k1 = m2 / (m1 + m2), k2 = 1 - k1;
          this.x += p.x * k1; this.z += p.z * k1;
          o.x -= p.x * k2; o.z -= p.z * k2;
          const rvx = this.vx - o.vx, rvz = this.vz - o.vz;
          const vn = rvx * p.nx + rvz * p.nz;
          if (vn < 0) {
            const j = -vn * 1.2;
            this.vx += p.nx * j * k1; this.vz += p.nz * j * k1;
            o.vx -= p.nx * j * k2; o.vz -= p.nz * j * k2;
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
      // (V94) wedged between two things that each push it into the other (two trunks, a fence and a wall, closer than
      // it is wide): held midway between them - it was thrown from one to the other every frame, 0.9 m at a time
      if (it === 2) { this.x = (this.x + sx) / 2; this.z = (this.z + sz) / 2; }
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
    if (pm.seat) {
      // astride: the rider's eyes over the middle of the seat
      const s = Math.sin(this.h), c = Math.cos(this.h), lz = pm.seat.z;
      return new THREE.Vector3(this.x + lz * s, this.car.group.position.y + pm.seat.eye, this.z + lz * c);
    }
    const lz = pm.pillars[0] - 0.06 - pm.L / 2, lx = -0.37;
    const s = Math.sin(this.h), c = Math.cos(this.h);
    const beltY = pm.belt.reduce((a, b) => Math.max(a, b[1]), 0);
    return new THREE.Vector3(this.x + lx * c + lz * s, this.car.group.position.y + (pm.eyeY ?? beltY + 0.22), this.z - lx * s + lz * c);
  }
}
