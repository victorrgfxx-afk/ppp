/* Komatsu-style backhoe loader (WB93 proportions): front loader bucket, rear
   boom + dipper + bucket, stabiliser legs, the "40" plate on the cab and an
   operator in a hi-viz vest — all of it visible in the fourth photo. */
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { signTexture } from '../gfx/Textures.js';
import { GROUP } from '../physics/Physics.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function buildBackhoe(mats) {
  const root = new THREE.Group();
  root.name = 'backhoe';
  const yellow = mats.plain(0xe8ab08, { roughness: 0.46, metalness: 0.25 });
  const dark = mats.plain(0x1e2124, { roughness: 0.6, metalness: 0.4 });
  const steel = mats.plain(0x8a9095, { roughness: 0.35, metalness: 0.85 });
  const glass = mats.glass({ opacity: 0.32, tint: 0x14202a });

  /* ------------------------------ chassis -------------------------------- */
  const hull = new THREE.Mesh(box(2.9, 0.78, 1.28), yellow);
  hull.position.set(0, 1.02, 0); hull.castShadow = true; root.add(hull);
  const nose = new THREE.Mesh(box(1.5, 0.66, 1.06), yellow);
  nose.position.set(1.9, 1.05, 0); nose.castShadow = true; root.add(nose);
  const grille = new THREE.Mesh(box(0.08, 0.5, 0.9), dark);
  grille.position.set(2.66, 1.05, 0); root.add(grille);

  /* -------------------------------- cab ---------------------------------- */
  const cab = new THREE.Group();
  cab.position.set(-0.15, 1.42, 0);
  const posts = [[-0.62, 0.62], [0.62, 0.62], [-0.62, -0.62], [0.62, -0.62]];
  for (const [px, pz] of posts) {
    const p = new THREE.Mesh(box(0.09, 1.7, 0.09), yellow);
    p.position.set(px, 0.85, pz); p.castShadow = true; cab.add(p);
  }
  const roof = new THREE.Mesh(box(1.5, 0.1, 1.44), yellow);
  roof.position.y = 1.74; roof.castShadow = true; cab.add(roof);
  const floor = new THREE.Mesh(box(1.4, 0.07, 1.36), dark);
  floor.position.y = 0.03; cab.add(floor);
  for (const [w, h, px, py, pz, ry] of [
    [1.3, 1.5, 0, 0.88, 0.66, 0], [1.3, 1.5, 0, 0.88, -0.66, 0],
    [1.28, 1.5, 0.66, 0.88, 0, Math.PI / 2], [1.28, 1.5, -0.66, 0.88, 0, Math.PI / 2],
  ]) {
    const gpane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    gpane.position.set(px, py, pz); gpane.rotation.y = ry;
    cab.add(gpane);
  }
  const seat = new THREE.Mesh(box(0.44, 0.1, 0.42), mats.plain(0x141619, { roughness: 0.9 }));
  seat.position.set(0, 0.45, 0); cab.add(seat);
  const seatBack = new THREE.Mesh(box(0.44, 0.52, 0.1), mats.plain(0x141619, { roughness: 0.9 }));
  seatBack.position.set(-0.18, 0.74, 0); cab.add(seatBack);
  // the "40" plate on the cab side
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshStandardMaterial({
      map: signTexture(['40'], { bg: '#f4f4ef', fg: '#111', w: 256, h: 256, border: '#111' }),
      roughness: 0.6,
    }));
  plate.position.set(0.1, 1.05, 0.675); cab.add(plate);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.13, 10),
    mats.lamp(0xff8c14, 0.4));
  beacon.position.set(0.5, 1.86, 0.4); cab.add(beacon);
  root.add(cab);
  root.userData.beacon = beacon;

  /* ----------------------------- operator -------------------------------- */
  const op = new THREE.Group();
  const hiviz = mats.plain(0xc8e21a, { roughness: 0.75 });
  const torso = new THREE.Mesh(box(0.34, 0.5, 0.22), hiviz);
  torso.position.set(-0.05, 0.78, 0); op.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mats.plain(0xb98a68, { roughness: 0.85 }));
  head.position.set(-0.05, 1.12, 0); op.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 8, 0, 6.3, 0, 1.3), mats.plain(0x24303f, { roughness: 0.8 }));
  cap.position.set(-0.05, 1.13, 0); op.add(cap);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(box(0.1, 0.36, 0.1), hiviz);
    arm.position.set(0.06, 0.82, s * 0.2); arm.rotation.z = -0.5; op.add(arm);
    const leg = new THREE.Mesh(box(0.13, 0.4, 0.13), mats.plain(0x27313f, { roughness: 0.85 }));
    leg.position.set(0.12, 0.42, s * 0.1); leg.rotation.z = 0.9; op.add(leg);
  }
  op.position.copy(cab.position);
  op.position.y += 0.06;
  root.add(op);
  root.userData.operator = op;

  /* --------------------------- loader (front) ---------------------------- */
  const loader = new THREE.Group();
  loader.position.set(0.5, 1.15, 0);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(box(2.5, 0.16, 0.14), yellow);
    arm.position.set(1.2, 0.06, s * 0.66); arm.castShadow = true; loader.add(arm);
    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), steel);
    ram.rotation.z = Math.PI / 2 - 0.25; ram.position.set(0.7, -0.22, s * 0.66); loader.add(ram);
  }
  const bucket = new THREE.Group();
  bucket.position.set(2.45, 0.06, 0);
  const bk = new THREE.Mesh(box(0.5, 0.62, 1.95), yellow);
  bk.position.set(0.18, -0.2, 0); bk.castShadow = true; bucket.add(bk);
  const bfloor = new THREE.Mesh(box(0.66, 0.08, 1.95), yellow);
  bfloor.position.set(0.44, -0.46, 0); bucket.add(bfloor);
  const edge = new THREE.Mesh(box(0.1, 0.06, 1.98), steel);
  edge.position.set(0.78, -0.47, 0); bucket.add(edge);
  for (let i = -3; i <= 3; i++) {
    const tooth = new THREE.Mesh(box(0.14, 0.05, 0.08), steel);
    tooth.position.set(0.86, -0.47, i * 0.26); bucket.add(tooth);
  }
  loader.add(bucket);
  root.add(loader);
  root.userData.loader = loader;
  root.userData.bucket = bucket;

  /* ---------------------------- backhoe (rear) --------------------------- */
  const swing = new THREE.Group();
  swing.position.set(-1.75, 1.15, 0);
  const kingpost = new THREE.Mesh(box(0.34, 0.9, 0.5), yellow);
  kingpost.position.y = 0.3; swing.add(kingpost);
  const boom = new THREE.Group();
  boom.position.set(-0.1, 0.62, 0);
  const boomArm = new THREE.Mesh(box(2.3, 0.28, 0.26), yellow);
  boomArm.position.set(-1.0, 0.45, 0); boomArm.rotation.z = 0.62; boomArm.castShadow = true;
  boom.add(boomArm);
  const boomRam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), steel);
  boomRam.position.set(-0.5, 0.1, 0.22); boomRam.rotation.z = 1.1; boom.add(boomRam);
  const dipper = new THREE.Group();
  dipper.position.set(-1.95, 1.62, 0);
  const dipArm = new THREE.Mesh(box(1.7, 0.22, 0.2), yellow);
  dipArm.position.set(-0.6, -0.5, 0); dipArm.rotation.z = -0.75; dipArm.castShadow = true;
  dipper.add(dipArm);
  const digBucket = new THREE.Group();
  digBucket.position.set(-1.2, -1.1, 0);
  const db = new THREE.Mesh(box(0.55, 0.42, 0.62), yellow);
  db.position.set(-0.1, -0.2, 0); digBucket.add(db);
  for (let i = -2; i <= 2; i++) {
    const tooth = new THREE.Mesh(box(0.16, 0.05, 0.07), steel);
    tooth.position.set(-0.38, -0.36, i * 0.13); digBucket.add(tooth);
  }
  dipper.add(digBucket);
  boom.add(dipper);
  swing.add(boom);
  root.add(swing);
  root.userData.swing = swing;
  root.userData.boom = boom;
  root.userData.dipper = dipper;
  root.userData.digBucket = digBucket;

  /* -------------------------- stabiliser legs ---------------------------- */
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(box(0.2, 1.1, 0.18), yellow);
    leg.position.set(-1.9, 0.6, s * 0.78); leg.rotation.z = 0.24; leg.castShadow = true;
    root.add(leg);
    const pad = new THREE.Mesh(box(0.42, 0.1, 0.34), dark);
    pad.position.set(-2.15, 0.06, s * 0.78); root.add(pad);
  }

  /* ------------------------------- wheels -------------------------------- */
  const mkWheel = (r, w) => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), mats.plain(0x121315, { roughness: 0.96 }));
    t.rotation.z = Math.PI / 2; t.castShadow = true; g.add(t);
    for (let i = 0; i < 14; i++) {          // chunky agricultural tread
      const lug = new THREE.Mesh(box(w * 1.02, 0.07, 0.16), mats.plain(0x0e0f11, { roughness: 0.98 }));
      const a = (i / 14) * Math.PI * 2;
      lug.position.set(0, Math.cos(a) * (r - 0.02), Math.sin(a) * (r - 0.02));
      lug.rotation.x = -a + (i % 2 ? 0.3 : -0.3);
      g.add(lug);
    }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, w * 1.04, 14),
      mats.plain(0xd8a814, { roughness: 0.5, metalness: 0.3 }));
    rim.rotation.z = Math.PI / 2; g.add(rim);
    return g;
  };
  const wheels = [];
  const frontR = 0.52, rearR = 0.82;
  for (const [ax, r, w] of [[1.85, frontR, 0.32], [-1.15, rearR, 0.46]]) {
    for (const s of [-1, 1]) {
      const wl = mkWheel(r, w);
      wl.position.set(ax, r, s * 0.85);
      wl.userData.side = s;
      root.add(wl);
      wheels.push(wl);
    }
  }
  root.userData.wheels = wheels;
  root.userData.dims = { frontR, rearR, len: 5.8, width: 2.3, height: 3.7, wheelR: rearR, wheelbase: 3.0 };
  // eye point set back from the front cab posts so they frame the view
  // instead of looming in the middle of it
  root.userData.seatPos = new THREE.Vector3(-0.52, 2.18, 0);
  return root;
}

/** Drivable wrapper — slow, heavy, with working loader and boom. */
export class BackhoeVehicle {
  constructor(spec, mats, physics, scene) {
    this.spec = spec;
    this.mesh = buildBackhoe(mats);
    this.mesh.position.set(spec.x, 0, spec.z);
    this.mesh.rotation.y = THREE.MathUtils.degToRad(90 - spec.yaw);
    scene.add(this.mesh);
    this.dims = this.mesh.userData.dims;
    this.label = spec.label;

    const body = new CANNON.Body({
      mass: 7600, material: physics.mat.body,
      collisionFilterGroup: GROUP.VEHICLE,
      angularDamping: 0.45, linearDamping: 0.06,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(2.4, 0.7, 1.1)), new CANNON.Vec3(-0.1, 1.25, 0));
    body.position.set(spec.x, this.dims.rearR + 0.12, spec.z);
    body.quaternion.setFromEuler(0, THREE.MathUtils.degToRad(90 - spec.yaw), 0);
    this.body = body;

    const v = new CANNON.RaycastVehicle({ chassisBody: body, indexForwardAxis: 0, indexRightAxis: 2, indexUpAxis: 1 });
    const mk = (ax, r, s) => v.addWheel({
      radius: r,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(0, 0, 1),
      chassisConnectionPointLocal: new CANNON.Vec3(ax, 0.1, s * 0.85),
      suspensionStiffness: 55, suspensionRestLength: 0.28, frictionSlip: 3.4,
      dampingRelaxation: 3.2, dampingCompression: 5.0, maxSuspensionForce: 3e5,
      rollInfluence: 0.02, maxSuspensionTravel: 0.18,
      customSlidingRotationalSpeed: -12, useCustomSlidingRotationalSpeed: true,
    });
    mk(1.85, this.dims.frontR, 1); mk(1.85, this.dims.frontR, -1);
    mk(-1.15, this.dims.rearR, 1); mk(-1.15, this.dims.rearR, -1);
    v.addToWorld(physics.world);
    this.vehicle = v;
    this.home = { p: body.position.clone(), q: body.quaternion.clone() };

    this.steer = 0; this.rpm = 900; this.speed = 0; this.slip = 0; this.impact = 0;
    this.gear = 2; this.lightsOn = false;
    this.arm = { loader: 0, boom: 0, dipper: 0, swing: 0 };
    this._q = new THREE.Quaternion();
  }

  get forwardSpeed() {
    const f = new CANNON.Vec3(1, 0, 0);
    this.body.quaternion.vmult(f, f);
    return this.body.velocity.dot(f);
  }

  update(dt, c) {
    const v = this.vehicle;
    this.speed = this.forwardSpeed;
    const kmh = Math.abs(this.speed) * 3.6;

    const maxSteer = 0.62;
    const target = (c.steer || 0) * maxSteer;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -dt * 2.2, dt * 2.2);
    v.setSteeringValue(this.steer, 0);
    v.setSteeringValue(this.steer, 1);

    const dir = c.reverse ? 1 : -1;
    const limit = kmh > 38 ? 0 : 1;                        // 40 km/h machine
    const force = (c.throttle || 0) * 11000 * limit * dir;
    v.applyEngineForce(force / 2, 2);
    v.applyEngineForce(force / 2, 3);
    const brake = (c.brake || 0) * 260 + (c.throttle < 0.02 ? 60 : 0) + (c.handbrake ? 600 : 0);
    for (let i = 0; i < 4; i++) v.setBrake(brake, i);

    this.rpm += ((900 + (c.throttle || 0) * 1300) - this.rpm) * Math.min(1, dt * 5);

    /* arm controls */
    const A = this.arm;
    if (c.armUp) A.loader = Math.min(1, A.loader + dt * 0.7);
    if (c.armDown) A.loader = Math.max(0, A.loader - dt * 0.7);
    if (c.boomUp) A.boom = Math.min(1, A.boom + dt * 0.5);
    if (c.boomDown) A.boom = Math.max(0, A.boom - dt * 0.5);
    this.mesh.userData.loader.rotation.z = A.loader * 0.95;
    this.mesh.userData.bucket.rotation.z = -A.loader * 0.55;
    this.mesh.userData.boom.rotation.z = -A.boom * 0.55;
    this.mesh.userData.dipper.rotation.z = A.boom * 0.85;

    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
    this.mesh.quaternion.set(this.body.quaternion.x, this.body.quaternion.y, this.body.quaternion.z, this.body.quaternion.w);
    this.mesh.updateMatrixWorld(true);
    const inv = this._invQ || (this._invQ = new THREE.Quaternion());
    inv.copy(this.mesh.quaternion).invert();
    const p = this._tmpV || (this._tmpV = new THREE.Vector3());
    for (let i = 0; i < 4; i++) {
      v.updateWheelTransform(i);
      const t = v.wheelInfos[i].worldTransform;
      const w = this.mesh.userData.wheels[i];
      p.set(t.position.x, t.position.y, t.position.z);
      this.mesh.worldToLocal(p);
      w.position.copy(p);
      this._q.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
      w.quaternion.copy(inv).multiply(this._q);
    }
    this.mesh.userData.beacon.material.emissiveIntensity = 0.4 + Math.sin(performance.now() * 0.012) * 0.4;
    this.slip = 0;
    this.onGround = true;
    this.impact *= Math.max(0, 1 - dt * 3);
  }

  idle() { this.update(1 / 60, { throttle: 0, brake: 0, steer: 0 }); }

  /** Hide the seated operator while the player is the one driving. */
  setOperatorVisible(v) {
    const op = this.mesh.userData.operator;
    if (op) op.visible = v;
  }
  reset() {
    this.body.position.copy(this.home.p);
    this.body.quaternion.copy(this.home.q);
    this.body.velocity.setZero(); this.body.angularVelocity.setZero();
    this.body.wakeUp();
  }
  flip() {
    const e = new CANNON.Vec3();
    this.body.quaternion.toEuler(e);
    this.body.quaternion.setFromEuler(0, e.y, 0);
    this.body.position.y += 0.8;
    this.body.velocity.setZero(); this.body.angularVelocity.setZero();
  }
  eyePoint(out = new THREE.Vector3()) {
    out.copy(this.mesh.userData.seatPos).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
    return out;
  }
}
