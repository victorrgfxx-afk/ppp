import * as THREE from 'three';
import { circleBox } from './collision.js';
import { damp, clamp } from './util.js';
import { W } from './config.js';

const tmp = [];
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
  }
  setPose(x, z, yaw, pitch = 0) {
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.vel.set(0, 0, 0);
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
  update(dt, input, audio, sens) {
    const m = input.consumeMouse();
    this.yaw -= m.x * sens;
    this.pitch = clamp(this.pitch - m.y * sens, -1.45, 1.45);

    const ax = input.axis();
    const run = input.down('ShiftLeft') || input.down('ShiftRight') || input.touchRun;
    const crouch = input.down('KeyC') || input.down('ControlLeft');
    const speed = crouch ? 1.3 : run ? 6.2 : 2.5;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = new THREE.Vector3().addScaledVector(fwd, -ax.y * speed).addScaledVector(right, ax.x * speed);
    const accel = this.onGround ? 11 : 2.5;
    this.vel.x = damp(this.vel.x, want.x, accel, dt);
    this.vel.z = damp(this.vel.z, want.z, accel, dt);

    if (this.onGround && (input.hit('Space'))) { this.vel.y = 4.1; this.onGround = false; audio?.jump(); }
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
    const gh = this.world.groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh + 0.001) {
      if (!this.onGround && this.vel.y < -3) { this.landShake = Math.min(0.08, -this.vel.y * 0.012); audio?.land(this.surface()); }
      this.pos.y = gh; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.pos.y - gh < 0.32 && this.vel.y <= 0) {
      this.pos.y = gh; this.vel.y = 0;        // walk down steps/curbs
    } else {
      this.onGround = false;
    }

    // camera: eye height, head bob, landing dip, FOV kick
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.eyeCur = damp(this.eyeCur, crouch ? 1.05 : this.eye, 10, dt);
    this.bobAmt = damp(this.bobAmt, this.onGround ? Math.min(1, hs / 6) : 0, 8, dt);
    const prev = this.bobPhase;
    this.bobPhase += dt * (hs > 0.2 ? 1.85 + hs * 0.55 : 0) * Math.PI;
    if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && this.onGround && hs > 0.5) audio?.step(this.surface(), hs / 6);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * this.bobAmt - 0.03 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmt;
    this.landShake = damp(this.landShake, 0, 6, dt);
    this.camera.position.set(this.pos.x + right.x * bobX, this.pos.y + this.eyeCur + bobY - this.landShake, this.pos.z + right.z * bobX);
    this.camera.rotation.set(this.pitch, this.yaw, Math.cos(this.bobPhase) * 0.004 * this.bobAmt, 'YXZ');
    this.fovKick = damp(this.fovKick, run && hs > 4 ? 5 : 0, 4, dt);
  }
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
    this.pos.x = clamp(this.pos.x, -30, 30);
  }
}
