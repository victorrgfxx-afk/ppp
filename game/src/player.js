/**
 * Personajul jucabil: capsula cu coliziuni fata de AABB-urile lumii,
 * pas peste borduri, mers/alergat/ghemuit/sarit, plus un model uman
 * simplu cu ciclu de mers procedural (se vede in camera third-person).
 */
import * as THREE from '../vendor/three.module.min.js';
import { closestOnCollider } from './geo.js';
import { surfaceY, onRoad } from './terrain.js';
import { clamp, lerp } from './noise.js';

const R = 0.34;            // raza capsulei
const H = 1.80;            // inaltime
const EYE = 1.66;
const STEP = 0.45;         // inaltime maxima de pasit (borduri, praguri)

export function buildCharacter() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d6a52, roughness: 0.85, metalness: 0.0 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.82, metalness: 0.02 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.9, metalness: 0.0 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.75, metalness: 0.05 });

  const mk = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  const hips = new THREE.Group(); hips.position.y = 0.92; g.add(hips);

  const torso = mk(new THREE.CapsuleGeometry(0.19, 0.34, 4, 12), jacket, 0, 0.30, 0);
  torso.scale.set(1.18, 1, 0.74);
  hips.add(torso);
  const pelvis = mk(new THREE.CapsuleGeometry(0.17, 0.12, 4, 10), jeans, 0, 0.02, 0);
  pelvis.scale.set(1.1, 1, 0.8);
  hips.add(pelvis);

  const neck = mk(new THREE.CylinderGeometry(0.055, 0.07, 0.09, 8), skin, 0, 0.60, 0);
  hips.add(neck);
  const head = mk(new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 0.725, 0.01);
  head.scale.set(0.92, 1.12, 1.0);
  hips.add(head);
  const hair = mk(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.95 }), 0, 0.735, -0.005);
  hair.scale.set(0.94, 1.05, 1.02);
  hips.add(hair);

  const limbs = {};
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'L' : 'R';
    const sh = new THREE.Group();
    sh.position.set(side * 0.215, 0.52, 0);
    hips.add(sh);
    const upper = mk(new THREE.CapsuleGeometry(0.058, 0.20, 4, 8), jacket, 0, -0.14, 0);
    sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.28; sh.add(elbow);
    const lower = mk(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), jacket, 0, -0.12, 0);
    elbow.add(lower);
    const hand = mk(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, -0.25, 0);
    elbow.add(hand);
    limbs['arm' + k] = sh; limbs['elbow' + k] = elbow;

    const hip = new THREE.Group();
    hip.position.set(side * 0.095, -0.02, 0);
    hips.add(hip);
    const thigh = mk(new THREE.CapsuleGeometry(0.075, 0.24, 4, 8), jeans, 0, -0.19, 0);
    hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.40; hip.add(knee);
    const shin = mk(new THREE.CapsuleGeometry(0.062, 0.24, 4, 8), jeans, 0, -0.18, 0);
    knee.add(shin);
    const foot = mk(new THREE.BoxGeometry(0.10, 0.07, 0.25), shoe, 0, -0.36, 0.05);
    knee.add(foot);
    limbs['leg' + k] = hip; limbs['knee' + k] = knee;
  }
  g.userData = { hips, head, limbs };
  return g;
}

export class Player {
  constructor(world, opts = {}) {
    this.world = world;
    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.pos.y = surfaceY(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw != null ? opts.yaw : 0;
    this.pitch = -0.04;
    this.onGround = true;
    this.crouch = 0;
    this.speed = 0;
    this.bob = 0;
    this.stepPhase = 0;
    this.stepEvent = 0;
    this.mode = 'tps';
    this.camDist = 4.0;
    this.camHeight = 1.52;
    this.camSide = 0.52;
    this.mesh = buildCharacter();
    this.mesh.castShadow = true;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this._hit = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0 };
    this._list = [];
    this._smoothY = this.pos.y;
  }

  get height() { return H - this.crouch * 0.62; }

  update(dt, input) {
    this.mesh.visible = this.mode === 'tps';

    // --- intentie de miscare in spatiul camerei (tastatura sau joystick) ---
    let ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let az = (input.back ? 1 : 0) - (input.fwd ? 1 : 0);
    if (input.axisX || input.axisY) { ax = input.axisX; az = input.axisY; }
    let mag = Math.hypot(ax, az);
    if (mag > 1) { ax /= mag; az /= mag; mag = 1; }
    const moving = mag > 0.08;

    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wx = ax * cy + az * sy;
    const wz = -ax * sy + az * cy;

    this.crouch = lerp(this.crouch, input.crouch ? 1 : 0, 1 - Math.pow(0.001, dt));

    const base = input.crouch ? 1.35 : (input.sprint ? 5.6 : 2.15);
    const target = moving ? base * Math.min(1, mag) : 0;
    const accel = this.onGround ? (moving ? 26 : 22) : 5;
    const desiredX = wx * target, desiredZ = wz * target;
    this.vel.x += (desiredX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (desiredZ - this.vel.z) * Math.min(1, accel * dt);

    if (input.jump && this.onGround) {
      this.vel.y = 5.15;
      this.onGround = false;
      input.jump = false;
    }
    this.vel.y -= 21.5 * dt;

    // --- integrare + coliziuni ---
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const feet = this.pos.y;
    const res = this.resolve(nx, nz, feet);
    this.pos.x = res.x; this.pos.z = res.z;
    if (res.hit) {
      this.vel.x *= 0.5; this.vel.z *= 0.5;
    }

    this.pos.y += this.vel.y * dt;
    const g = surfaceY(this.pos.x, this.pos.z);
    const top = res.support;
    const ground = Math.max(g, top);
    if (this.pos.y <= ground + 0.001) {
      if (this.vel.y < -6) this.stepEvent = 2;
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = false;

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // --- pasi + legan ---
    if (this.onGround && this.speed > 0.35) {
      const prev = this.stepPhase;
      this.stepPhase += this.speed * dt * (input.sprint ? 1.22 : 1.55);
      if (Math.floor(prev * 2) !== Math.floor(this.stepPhase * 2)) this.stepEvent = 1;
    } else {
      this.stepPhase += dt * 0.4;
    }
    this.bob = lerp(this.bob, this.onGround ? clamp(this.speed / 5.6, 0, 1) : 0, 1 - Math.pow(0.004, dt));

    this.animate(dt);
    this.updateCamera(dt, input);
  }

  /** Impinge in afara AABB-urilor; returneaza si suportul pe care stam. */
  resolve(x, z, feetY) {
    const list = this.world.colliders.query(x, z, R + 1.2, this._list);
    let hit = false;
    let support = -Infinity;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of list) {
        if (it.disabled) continue;
        if (it.yTop <= feetY + 0.02) {            // suprafata pe care poti sta
          if (Math.abs(x - it.cx) < it.hx + R && Math.abs(z - it.cz) < it.hz + R) {
            if (it.yTop > support && it.yTop <= feetY + STEP) support = it.yTop;
          }
          continue;
        }
        if (it.yBottom > feetY + this.height) continue;
        if (it.yTop <= feetY + STEP) {            // il putem pasi (bordura)
          if (Math.abs(x - it.cx) < it.hx + R && Math.abs(z - it.cz) < it.hz + R) {
            if (it.yTop > support) support = it.yTop;
          }
          continue;
        }
        const h = closestOnCollider(it, x, z, this._hit);
        const dx = x - h.wx, dz = z - h.wz;
        const d = Math.hypot(dx, dz);
        const inside = Math.abs(h.lx) <= it.hx && Math.abs(h.lz) <= it.hz;
        if (inside) {
          // centrul e in interior: iesim pe cea mai apropiata fata
          const pushX = it.hx - Math.abs(h.lx), pushZ = it.hz - Math.abs(h.lz);
          const c = it.cos, s = it.sin;
          let ox, oz;
          if (pushX < pushZ) { ox = Math.sign(h.lx || 1) * (pushX + R); oz = 0; }
          else { ox = 0; oz = Math.sign(h.lz || 1) * (pushZ + R); }
          x += ox * c + oz * s;
          z += -ox * s + oz * c;
          hit = true; moved = true;
        } else if (d < R) {
          const k = (R - d) / (d || 1e-4);
          x += dx * k; z += dz * k;
          hit = true; moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit, support };
  }

  animate(dt) {
    const u = this.mesh.userData;
    const L = u.limbs;
    const sp = clamp(this.speed / 5.6, 0, 1);
    const ph = this.stepPhase * Math.PI * 2;
    const amp = 0.28 + sp * 0.72;
    const air = this.onGround ? 0 : 1;

    L.legL.rotation.x = Math.sin(ph) * amp * 0.85 - air * 0.4;
    L.legR.rotation.x = Math.sin(ph + Math.PI) * amp * 0.85 - air * 0.4;
    L.kneeL.rotation.x = Math.max(0, -Math.sin(ph - 0.7)) * amp * 1.1 + air * 0.8;
    L.kneeR.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * amp * 1.1 + air * 0.8;
    L.armL.rotation.x = Math.sin(ph + Math.PI) * amp * 0.62 - air * 0.5;
    L.armR.rotation.x = Math.sin(ph) * amp * 0.62 - air * 0.5;
    L.armL.rotation.z = 0.14 + sp * 0.05;
    L.armR.rotation.z = -0.14 - sp * 0.05;
    L.elbowL.rotation.x = -0.25 - Math.max(0, Math.sin(ph + Math.PI)) * amp * 0.6;
    L.elbowR.rotation.x = -0.25 - Math.max(0, Math.sin(ph)) * amp * 0.6;

    u.hips.position.y = 0.92 - this.crouch * 0.42 + Math.sin(ph * 2) * 0.022 * sp;
    u.hips.rotation.z = Math.sin(ph) * 0.035 * sp;
    u.hips.rotation.x = 0.06 + sp * 0.12 + this.crouch * 0.3;

    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    const moving = this.speed > 0.25;
    if (moving) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z) + Math.PI;
      let d = targetYaw - this.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y += d * Math.min(1, 12 * dt);
    } else {
      let d = this.yaw - this.mesh.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y += d * Math.min(1, 4 * dt);
    }
    u.head.rotation.x = clamp(this.pitch * 0.5, -0.5, 0.5);
  }

  updateCamera(dt, input) {
    const bobY = Math.sin(this.stepPhase * Math.PI * 4) * 0.028 * this.bob;
    const bobX = Math.cos(this.stepPhase * Math.PI * 2) * 0.034 * this.bob;
    this._smoothY = lerp(this._smoothY, this.pos.y, 1 - Math.pow(0.0001, dt));

    if (this.mode === 'fps') {
      this.camPos.set(
        this.pos.x + bobX * 0.4,
        this._smoothY + EYE - this.crouch * 0.52 + bobY,
        this.pos.z);
      this.camTarget.copy(this.camPos).add(this.forward());
      return;
    }

    const head = new THREE.Vector3(this.pos.x, this._smoothY + 1.48 - this.crouch * 0.45, this.pos.z);
    const dir = this.forward();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = head.clone()
      .addScaledVector(dir, -this.camDist)
      .addScaledVector(right, this.camSide)
      .add(new THREE.Vector3(0, this.camHeight * 0.16 + bobY * 0.5, 0));

    const d = this.world.rayClearance(head, want, 0.32);
    this.camPos.copy(head).lerp(want, d);
    this.camTarget.copy(head).addScaledVector(dir, 6).add(new THREE.Vector3(0, -0.15, 0));
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  surfaceType() {
    return onRoad(this.pos.x, this.pos.z) ? 'asphalt' : 'grass';
  }
}
