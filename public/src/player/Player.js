/* First-person character controller.

   The body is a two-sphere compound (a capsule cannon-es does not have), with
   zero friction against the world and velocity driven directly — the classic
   arrangement that climbs kerbs without sticking to walls. */
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { GROUP } from '../physics/Physics.js';
import { settings } from '../core/Settings.js';

const STAND_EYE = 1.62, CROUCH_EYE = 1.05;
const RADIUS = 0.32;

export class Player {
  constructor(physics, camera, spawn) {
    this.physics = physics;
    this.camera = camera;
    this.yaw = THREE.MathUtils.degToRad(-(spawn.yaw || 0));
    this.pitch = 0;
    this.eye = STAND_EYE;
    this.crouching = false;
    this.stamina = 1;
    this.bob = 0;
    this.bobAmp = 0;
    this.onGround = false;
    this.stepPhase = 0;
    this.surface = 'gravel';
    this.lastFootstep = 0;

    const body = new CANNON.Body({
      mass: 78,
      material: physics.mat.player,
      fixedRotation: true,
      linearDamping: 0.0,
      collisionFilterGroup: GROUP.PLAYER,
      position: new CANNON.Vec3(spawn.x, spawn.y + 0.4, spawn.z),
    });
    body.addShape(new CANNON.Sphere(RADIUS), new CANNON.Vec3(0, RADIUS, 0));
    body.addShape(new CANNON.Sphere(RADIUS), new CANNON.Vec3(0, 1.75 - RADIUS, 0));
    body.updateMassProperties();
    body.allowSleep = false;
    physics.world.addBody(body);
    this.body = body;

    this._down = new CANNON.Vec3();
    this._ray = new CANNON.Ray();
    this._res = new CANNON.RaycastResult();
  }

  get position() { return this.body.position; }

  teleport(x, z, yaw) {
    this.body.position.set(x, 1.2, z);
    this.body.velocity.setZero();
    if (yaw != null) this.yaw = THREE.MathUtils.degToRad(-yaw);
  }

  _groundCheck() {
    const p = this.body.position;
    this._ray.from.set(p.x, p.y + 0.4, p.z);
    this._ray.to.set(p.x, p.y - 0.28, p.z);
    this._res.reset();
    this._ray.intersectWorld(this.physics.world, {
      result: this._res, skipBackfaces: true,
      collisionFilterMask: GROUP.GROUND | GROUP.STATIC | GROUP.PROP | GROUP.VEHICLE,
    });
    this.onGround = this._res.hasHit;
    this.groundY = this._res.hasHit ? this._res.hitPointWorld.y : 0;
    return this.onGround;
  }

  /** Surface type under the feet, for footstep sound selection. */
  _surfaceAt(x, z) {
    // matches the SURFACES table: concrete pads, the drive and the apron
    const inRect = (cx, cz, w, d) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
    if (inRect(-28, 8, 24, 16) || inRect(-8, 25, 28, 14) || inRect(-26, -19, 28, 6)) return 'concrete';
    if (inRect(-7, 37, 104, 8)) return 'asphalt';
    if (inRect(24, -9, 40, 42) || inRect(-20, -48, 78, 10) || inRect(-55, -8, 8, 78)) return 'grass';
    if (inRect(-26, -29, 28, 14) || inRect(-16, 9, 16, 14)) return 'concrete';
    return 'gravel';
  }

  update(dt, input, look) {
    const s = input;
    /* --- look ---------------------------------------------------------- */
    this.yaw -= look.x;
    this.pitch -= look.y;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    /* --- crouch -------------------------------------------------------- */
    const wantCrouch = s.crouch;
    this.crouching = wantCrouch;
    const targetEye = wantCrouch ? CROUCH_EYE : STAND_EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 11);

    /* --- ground + movement --------------------------------------------- */
    this._groundCheck();
    const sprinting = s.sprint && !wantCrouch && s.move.y > 0.1 && this.stamina > 0.02;
    const speed = wantCrouch ? 1.35 : sprinting ? 5.1 : 2.85;
    this.stamina = THREE.MathUtils.clamp(
      this.stamina + (sprinting ? -dt * 0.115 : dt * 0.19), 0, 1);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, s.move.y)
      .addScaledVector(right, s.move.x);
    const mag = Math.min(1, wish.length());
    if (mag > 0.001) wish.normalize().multiplyScalar(speed * mag);

    const v = this.body.velocity;
    const accel = this.onGround ? 14 : 3.2;
    v.x += (wish.x - v.x) * Math.min(1, dt * accel);
    v.z += (wish.z - v.z) * Math.min(1, dt * accel);

    if (s.jump && this.onGround && this.jumpCooldown <= 0) {
      v.y = 4.55;
      this.jumpCooldown = 0.32;
      this.onGround = false;
    }
    this.jumpCooldown = Math.max(0, (this.jumpCooldown || 0) - dt);

    /* --- head bob + footsteps ------------------------------------------ */
    const planar = Math.hypot(v.x, v.z);
    this.surface = this._surfaceAt(this.body.position.x, this.body.position.z);
    if (this.onGround && planar > 0.4) {
      const stride = sprinting ? 9.4 : wantCrouch ? 5.2 : 7.0;
      const prev = this.stepPhase;
      this.stepPhase += dt * stride * Math.min(1, planar / speed);
      if (Math.floor(this.stepPhase / Math.PI) !== Math.floor(prev / Math.PI)) {
        this.footstep = { surface: this.surface, strength: sprinting ? 1 : wantCrouch ? 0.35 : 0.7 };
      }
      this.bobAmp += (Math.min(1, planar / 5) - this.bobAmp) * Math.min(1, dt * 6);
    } else {
      this.bobAmp += (0 - this.bobAmp) * Math.min(1, dt * 5);
    }
    const bobOn = settings.get('headbob') ? 1 : 0;
    this.bob = Math.sin(this.stepPhase) * 0.042 * this.bobAmp * bobOn;
    const sway = Math.cos(this.stepPhase * 0.5) * 0.028 * this.bobAmp * bobOn;

    /* --- camera --------------------------------------------------------- */
    const p = this.body.position;
    this.camera.position.set(p.x + sway * 0.4, p.y + this.eye + this.bob, p.z);
    this.camera.rotation.set(this.pitch, this.yaw, sway * 0.12, 'YXZ');
    this.speed = planar;
  }

  /** Point 1.2 m in front of the eyes, used for interaction queries. */
  reach(out = new THREE.Vector3()) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(1.3);
    out.add(this.camera.position);
    return out;
  }

  setVisible() { /* first person: nothing to draw */ }
}
