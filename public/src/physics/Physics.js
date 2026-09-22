/* cannon-es world wrapper: fixed-step simulation, material pairs tuned for a
   gravel yard, plus helpers for the static level geometry. */
import * as CANNON from 'cannon';
import * as THREE from 'three';

export const GROUP = {
  GROUND: 1, STATIC: 2, VEHICLE: 4, PLAYER: 8, PROP: 16, TRIGGER: 32,
};

export class Physics {
  constructor() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.broadphase.axisIndex = 0;
    world.allowSleep = true;
    world.solver.iterations = 12;
    world.solver.tolerance = 0.0015;
    world.defaultContactMaterial.contactEquationStiffness = 1e8;
    world.defaultContactMaterial.contactEquationRelaxation = 3;
    this.world = world;

    this.mat = {
      ground: new CANNON.Material('ground'),
      wheel: new CANNON.Material('wheel'),
      body: new CANNON.Material('body'),
      player: new CANNON.Material('player'),
      prop: new CANNON.Material('prop'),
    };
    const pair = (a, b, o) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, o));
    pair(this.mat.ground, this.mat.wheel, { friction: 0.0, restitution: 0, contactEquationStiffness: 1e8 });
    pair(this.mat.ground, this.mat.body, { friction: 0.42, restitution: 0.06 });
    pair(this.mat.ground, this.mat.prop, { friction: 0.55, restitution: 0.14 });
    pair(this.mat.ground, this.mat.player, { friction: 0.0, restitution: 0 });
    pair(this.mat.body, this.mat.body, { friction: 0.28, restitution: 0.12 });
    pair(this.mat.body, this.mat.prop, { friction: 0.3, restitution: 0.25 });
    pair(this.mat.prop, this.mat.prop, { friction: 0.4, restitution: 0.2 });
    pair(this.mat.player, this.mat.body, { friction: 0.0, restitution: 0 });
    pair(this.mat.player, this.mat.prop, { friction: 0.0, restitution: 0 });

    this.fixedStep = 1 / 60;
    this._acc = 0;
    this.bodies = [];
  }

  /**
   * Flat ground at y = 0 (the yard is level in the photos).
   * A large static box rather than a Plane: an infinite plane has an infinite
   * AABB, which SAPBroadphase and the wheel raycasts do not handle reliably.
   */
  addGroundPlane(size = 600) {
    const b = new CANNON.Body({
      mass: 0, material: this.mat.ground,
      shape: new CANNON.Box(new CANNON.Vec3(size / 2, 10, size / 2)),
      position: new CANNON.Vec3(0, -10, 0),
      collisionFilterGroup: GROUP.GROUND,
    });
    this.world.addBody(b);
    this.ground = b;
    return b;
  }

  /** Static box collider, sized/positioned in world units. `rotY` in radians. */
  addStaticBox(cx, cy, cz, sx, sy, sz, rotY = 0) {
    const b = new CANNON.Body({
      mass: 0, material: this.mat.ground,
      shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)),
      position: new CANNON.Vec3(cx, cy, cz),
      collisionFilterGroup: GROUP.STATIC,
    });
    if (rotY) b.quaternion.setFromEuler(0, rotY, 0);
    this.world.addBody(b);
    return b;
  }

  /**
   * Dynamic box prop (barrels, crates, cones...).
   * Prop meshes are modelled with their origin on the ground, while the rigid
   * body's origin is its centre — `offset` bridges the two so nothing sinks or
   * floats, and the mesh keeps following the body once it topples over.
   */
  addProp(mesh, { mass = 8, size, shape, offset, linearDamping = 0.12, angularDamping = 0.25 } = {}) {
    const s = size || new THREE.Vector3(1, 1, 1);
    const off = offset || new THREE.Vector3(0, s.y / 2, 0);
    const body = new CANNON.Body({
      mass, material: this.mat.prop,
      shape: shape || new CANNON.Box(new CANNON.Vec3(s.x / 2, s.y / 2, s.z / 2)),
      position: new CANNON.Vec3(mesh.position.x + off.x, mesh.position.y + off.y, mesh.position.z + off.z),
      collisionFilterGroup: GROUP.PROP,
      linearDamping, angularDamping,
      allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.6,
    });
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    this.world.addBody(body);
    const rec = { mesh, body, offset: off, home: { p: body.position.clone(), q: body.quaternion.clone() } };
    this.bodies.push(rec);
    return rec;
  }

  /** Deterministic fixed-step integration with interpolation-free sync. */
  step(dt) {
    this._acc += Math.min(dt, 0.1);
    let n = 0;
    while (this._acc >= this.fixedStep && n < 5) {
      this.world.step(this.fixedStep);
      this._acc -= this.fixedStep;
      n++;
    }
    if (n === 5) this._acc = 0;
    const q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (const r of this.bodies) {
      q.set(r.body.quaternion.x, r.body.quaternion.y, r.body.quaternion.z, r.body.quaternion.w);
      v.copy(r.offset).applyQuaternion(q);
      r.mesh.position.set(r.body.position.x - v.x, r.body.position.y - v.y, r.body.position.z - v.z);
      r.mesh.quaternion.copy(q);
    }
  }

  resetProps() {
    for (const r of this.bodies) {
      r.body.position.copy(r.home.p);
      r.body.quaternion.copy(r.home.q);
      r.body.velocity.setZero();
      r.body.angularVelocity.setZero();
      r.body.wakeUp();
    }
  }

  /** Ray test against everything but the given body. Returns {hit, point, normal, distance}. */
  ray(from, to, skip = null) {
    const r = new CANNON.Ray(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z));
    const res = new CANNON.RaycastResult();
    r.intersectWorld(this.world, { result: res, skipBackfaces: true });
    if (res.hasHit && res.body === skip) return { hit: false };
    return res.hasHit
      ? { hit: true, point: res.hitPointWorld, normal: res.hitNormalWorld, distance: res.distance, body: res.body }
      : { hit: false };
  }
}
