/* ============================================================================
   Drivable vehicle: cannon-es RaycastVehicle + an engine/gearbox model.

   The feel target is a heavy road car on loose gravel — torque that falls off
   with revs, an automatic that hunts a little, speed-sensitive steering, and a
   handbrake that will step the tail out.
   ========================================================================== */
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { buildCar } from './CarFactory.js';
import { mergeByMaterial } from '../world/Optimize.js';
import { GROUP } from '../physics/Physics.js';

const GEARS = [-3.6, 0, 3.62, 2.10, 1.36, 1.00, 0.82, 0.68];   // R, N, 1..6
const FINAL = 3.9;
const IDLE_RPM = 820, MAX_RPM = 6400, SHIFT_UP = 5900, SHIFT_DOWN = 2100;

/** Normalised torque curve — peaks in the mid range like a real turbo engine. */
function torqueAt(rpm) {
  const r = Math.max(0, Math.min(1, (rpm - 700) / (MAX_RPM - 700)));
  return 0.42 + 1.05 * Math.sin(Math.PI * Math.pow(r, 0.78)) * (1 - 0.26 * r);
}

export class Vehicle {
  constructor(spec, mats, physics, scene) {
    this.spec = spec;
    this.physics = physics;
    this.mesh = buildCar(spec, mats);
    this.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.batch = mergeByMaterial(this.mesh);
    scene.add(this.mesh);

    const d = this.mesh.userData.dims;
    this.dims = d;

    /* --- chassis ------------------------------------------------------- */
    const half = new CANNON.Vec3(d.len * 0.46, d.height * 0.28, d.width * 0.44);
    const body = new CANNON.Body({
      mass: spec.mass || 1400,
      material: physics.mat.body,
      collisionFilterGroup: GROUP.VEHICLE,
      angularDamping: 0.22,
      linearDamping: 0.008,
    });
    // shape sits above the origin so the centre of mass stays low: less roll
    body.addShape(new CANNON.Box(half), new CANNON.Vec3(0, d.height * 0.46, 0));
    // drop the chassis so the wheel rays (restLength + radius long) start
    // comfortably above the ground and the suspension catches immediately
    body.position.set(spec.x, d.wheelR + 0.16, spec.z);
    body.quaternion.setFromEuler(0, THREE.MathUtils.degToRad(90 - spec.yaw), 0);
    this.body = body;

    const v = new CANNON.RaycastVehicle({
      chassisBody: body,
      indexForwardAxis: 0, indexRightAxis: 2, indexUpAxis: 1,
    });
    const opts = {
      radius: d.wheelR,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(0, 0, 1),
      suspensionStiffness: 36,
      suspensionRestLength: 0.32,
      frictionSlip: 2.6,
      dampingRelaxation: 2.6,
      dampingCompression: 4.3,
      maxSuspensionForce: 1e5,
      rollInfluence: 0.035,
      maxSuspensionTravel: 0.28,
      customSlidingRotationalSpeed: -28,
      useCustomSlidingRotationalSpeed: true,
    };
    const yOff = d.wheelR * 0.12;
    for (const [ax, track] of [[d.wheelbase / 2, d.trackF], [-d.wheelbase / 2, d.trackR]]) {
      for (const s of [1, -1]) {
        v.addWheel({ ...opts, chassisConnectionPointLocal: new CANNON.Vec3(ax, yOff, s * track / 2) });
      }
    }
    v.addToWorld(physics.world);
    this.vehicle = v;
    this.wheelBodies = this.mesh.userData.wheels;

    /* The body profiles are drawn from the ground up — a van's floor sits at
       0.17 of its height, which is its real sill — so the visual origin belongs
       on the ground, while the physics chassis rides a suspension length above
       it. Without this offset every car floated a third of a metre, wheels
       hanging clear below the sills. The equilibrium suspension length is
       restLength − g/stiffness, clamped so a stiff setup cannot invert it. */
    const restEq = Math.max(0.02, opts.suspensionRestLength - 9.82 / opts.suspensionStiffness);
    this.visualDrop = d.wheelR - yOff + restEq;
    this._drop = new THREE.Vector3();
    // start at that same height, so the cars parked in the yard — which never
    // wake the solver — sit on their tyres instead of settling later
    body.position.y = this.visualDrop;

    /* --- drivetrain ----------------------------------------------------- */
    // Real units: peak crank torque in Nm, multiplied by the gear and final
    // ratios and divided by the rolling radius to get force at the contact
    // patch. ~300 Nm is a typical modern turbo-diesel/petrol family car.
    this.peakTorque = (spec.power || 1) * 300;
    this.drive = spec.drive || 'fwd';
    // Cd*A: enough aerodynamic drag to give a sensible top speed instead of
    // letting sixth gear accelerate forever.
    this.cdA = d.width * d.height * (spec.style === 'pickup' ? 0.44 : spec.style === 'van' ? 0.40 : 0.32);
    this.rollRes = 0.013 * (spec.mass || 1400) * 9.82;
    this.gear = 2;                                  // start in first
    this.rpm = IDLE_RPM;
    this.steer = 0;
    this.speed = 0;
    this.shiftCooldown = 0;
    this.engineOn = false;
    this.slip = 0;
    this.lightsOn = false;
    this.home = { p: body.position.clone(), q: body.quaternion.clone() };

    this._tmpQ = new THREE.Quaternion();
    this._lastVel = new THREE.Vector3();
    this.impact = 0;
    body.addEventListener('collide', (e) => {
      const rel = e.contact.getImpactVelocityAlongNormal();
      const m = Math.abs(rel);
      if (m > 2.2) this.impact = Math.max(this.impact, Math.min(1, (m - 2.2) / 9));
    });
  }

  get forwardSpeed() {
    const f = new CANNON.Vec3(1, 0, 0);
    this.body.quaternion.vmult(f, f);
    return this.body.velocity.dot(f);
  }

  /**
   * @param {object} c {throttle, brake, steer, handbrake, reverse}
   */
  update(dt, c) {
    const v = this.vehicle;
    // a sleeping rigid body ignores the engine impulses entirely, so any driver
    // input has to wake it first
    if (c.throttle > 0.01 || c.brake > 0.01 || Math.abs(c.steer || 0) > 0.01 || c.handbrake) {
      this.body.wakeUp();
    }
    const speed = this.forwardSpeed;
    this.speed = speed;
    const kmh = Math.abs(speed) * 3.6;

    /* steering: full lock when parking, a few degrees at speed */
    const maxSteer = THREE.MathUtils.lerp(0.55, 0.13, Math.min(1, kmh / 110));
    const target = (c.steer || 0) * maxSteer;
    const rate = dt * (3.2 + 4 * (1 - Math.min(1, kmh / 90)));
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate, rate);
    v.setSteeringValue(this.steer, 0);
    v.setSteeringValue(this.steer, 1);

    /* gearbox */
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    const wantReverse = c.reverse && kmh < 4;
    if (wantReverse) this.gear = 0;
    else if (this.gear === 0 && c.throttle > 0.1 && kmh < 3) this.gear = 2;

    const ratio = GEARS[this.gear] * FINAL;
    const wheelRps = Math.abs(speed) / (Math.PI * 2 * this.dims.wheelR);
    let rpm = Math.abs(wheelRps * ratio * 60);
    if (this.gear === 1) rpm = IDLE_RPM + c.throttle * 3200;
    this.rpm += (Math.max(IDLE_RPM, Math.min(MAX_RPM, rpm)) - this.rpm) * Math.min(1, dt * 9);

    if (this.gear >= 2 && this.shiftCooldown <= 0) {
      if (this.rpm > SHIFT_UP && this.gear < GEARS.length - 1) { this.gear++; this.shiftCooldown = 0.45; }
      else if (this.rpm < SHIFT_DOWN && this.gear > 2) { this.gear--; this.shiftCooldown = 0.35; }
    }

    /* engine force at the contact patch; the reverse ratio is negative, which
       flips the direction on its own */
    let force = 0;
    if (this.gear !== 1) {
      force = c.throttle * torqueAt(this.rpm) * this.peakTorque * ratio / this.dims.wheelR;
      if (kmh > 195) force = 0;                      // limiter
    }
    const driveWheels = this.drive === 'fwd' ? [0, 1] : this.drive === 'rwd' ? [2, 3] : [0, 1, 2, 3];
    const perWheel = force / driveWheels.length;
    for (let i = 0; i < 4; i++) v.applyEngineForce(driveWheels.includes(i) ? perWheel : 0, i);

    /* brakes: front-biased, plus a rear-only handbrake for the tail-out */
    const braking = c.brake || 0;
    const base = braking * 42;
    v.setBrake(base * 1.25, 0); v.setBrake(base * 1.25, 1);
    v.setBrake(base * 0.75, 2); v.setBrake(base * 0.75, 3);
    if (c.handbrake) { v.setBrake(95, 2); v.setBrake(95, 3); }
    if (!braking && !c.handbrake && c.throttle < 0.02) {          // engine braking + rolling drag
      const drag = this.gear === 1 ? 1.5 : 7;
      for (let i = 0; i < 4; i++) v.setBrake(drag, i);
    }

    /* wheel friction drops under handbrake so it actually slides */
    for (let i = 2; i < 4; i++) v.wheelInfos[i].frictionSlip = c.handbrake ? 0.9 : 2.6;

    /* aerodynamic drag + rolling resistance, opposing the direction of travel */
    const vel = this.body.velocity;
    const planar = Math.hypot(vel.x, vel.z);
    if (planar > 0.4) {
      const dragN = 0.5 * 1.2 * this.cdA * planar * planar + this.rollRes * 0.5;
      this._drag = this._drag || new CANNON.Vec3();
      this._drag.set(-vel.x / planar * dragN, 0, -vel.z / planar * dragN);
      this.body.applyForce(this._drag, this.body.position);
    }

    /* Read the contact state BEFORE touching the wheel transforms:
       updateWheelTransform() clears isInContact, so sampling it afterwards
       always reports the car as airborne. */
    let slipSum = 0;
    this.onGround = false;
    for (let i = 0; i < 4; i++) {
      const inf = v.wheelInfos[i];
      if (inf.isInContact) this.onGround = true;
      slipSum += Math.min(1, Math.abs(inf.sideImpulse || 0) / 3200) + (inf.skidInfo < 0.7 ? 0.35 : 0);
    }
    this.slip = Math.min(1, slipSum / 4);

    /* body first, then the wheels — the raycast gives world transforms and the
       wheel meshes are children of the body, so they need converting back */
    this.placeMesh();

    const sw = this.mesh.userData.steering;
    if (sw) sw.rotation.z = -this.steer * 4.2;

    /* lamps: driven through the shared materials so the meshes can be batched */
    const lm = this.mesh.userData.lampMaterials;
    if (lm) {
      lm.head.emissiveIntensity = this.lightsOn ? 2.6 : 0.05;
      lm.tail.emissiveIntensity = (braking > 0.05 || c.handbrake) ? 3.0 : (this.lightsOn ? 0.8 : 0.1);
    }

    this.impact *= Math.max(0, 1 - dt * 3.2);
  }

  /** Copy the raycast wheel transforms onto the wheel meshes (world -> local). */
  syncWheels() {
    const inv = this._invQ || (this._invQ = new THREE.Quaternion());
    inv.copy(this.mesh.quaternion).invert();
    const p = this._tmpV || (this._tmpV = new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      const w = this.wheelBodies[i];
      if (!w) continue;
      p.set(t.position.x, t.position.y, t.position.z);
      this.mesh.worldToLocal(p);
      w.position.copy(p);
      this._tmpQ.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
      w.quaternion.copy(inv).multiply(this._tmpQ);
    }
  }

  /** Parked: keep the body asleep so a yard full of cars costs nothing. */
  idle() {
    if (this.body.velocity.lengthSquared() < 0.02 && this.body.angularVelocity.lengthSquared() < 0.02) {
      this.body.sleep();
    }
    this.placeMesh();
  }

  /** Put the visual body on the chassis, dropped onto its own ground line. */
  placeMesh() {
    const q = this.body.quaternion;
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    this._drop.set(0, -this.visualDrop, 0).applyQuaternion(this.mesh.quaternion);
    this.mesh.position.set(
      this.body.position.x + this._drop.x,
      this.body.position.y + this._drop.y,
      this.body.position.z + this._drop.z);
    this.mesh.updateMatrixWorld(true);
    this.syncWheels();
  }

  reset() {
    this.body.position.copy(this.home.p);
    this.body.quaternion.copy(this.home.q);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.wakeUp();
    this.gear = 2; this.rpm = IDLE_RPM; this.steer = 0;
  }

  /** Put the car back on its wheels where it stands. */
  flip() {
    const e = new CANNON.Vec3();
    this.body.quaternion.toEuler(e);
    this.body.quaternion.setFromEuler(0, e.y, 0);
    this.body.position.y += 0.6;
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.wakeUp();
  }

  /** World-space driver's eye point. */
  eyePoint(out = new THREE.Vector3()) {
    out.copy(this.mesh.userData.seatPos);
    out.applyQuaternion(this.mesh.quaternion);
    out.add(this.mesh.position);
    return out;
  }
}
