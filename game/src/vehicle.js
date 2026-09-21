/**
 * Fizica masinii: model "bicicleta" cu unghiuri de deriva si saturarea
 * fortei laterale (deci subvirare/supravirare reale + drift la frana de
 * mana), suspensie vizuala, faruri cu SpotLight si coliziuni cu lumea.
 */
import * as THREE from '../vendor/three.module.min.js';
import { closestOnCollider } from './geo.js';
import { surfaceY, onRoad } from './terrain.js';
import { clamp, lerp } from './noise.js';

const G = 9.81;

export class Vehicle {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    const spec = mesh.userData.spec;
    this.spec = spec;
    this.body = new THREE.Group();          // pentru ruliu/tangaj de suspensie
    this.mass = opts.mass || (spec.L > 4.3 ? 1480 : 1250);
    this.lf = spec.wb * 0.47;
    this.lr = spec.wb * 0.53;
    this.Iz = this.mass * 1.55;
    this.Cf = opts.Cf || 92000;
    this.Cr = opts.Cr || 108000;
    this.mu = opts.mu || 1.02;
    this.engine = opts.engine || (spec.L > 4.3 ? 5200 : 4300);
    this.brakeForce = 11500;
    this.maxSteer = 0.56;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vLong = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.rpm = 850;
    this.gear = 1;
    this.slip = 0;
    this.lightsOn = true;
    this.brakeLevel = 0;
    this.collider = null;
    this.pitchVis = 0;
    this.rollVis = 0;
    this._list = [];
    this._hit = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0 };
    this.impact = 0;

    this.headlights = [];
    this.camMode = 0;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this._camSmooth = new THREE.Vector3();
    this._camInit = false;
  }

  attachLights(scene, { shadows = false } = {}) {
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff2dc, 0, 58, 0.62, 0.52, 1.6);
      l.target = new THREE.Object3D();
      scene.add(l, l.target);
      if (shadows && s > 0) {
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.camera.near = 0.8;
        l.shadow.camera.far = 48;
        l.shadow.bias = -0.0012;
        l.shadow.normalBias = 0.04;
      }
      this.headlights.push({ light: l, side: s });
    }
    return this;
  }

  place(x, z, yaw) {
    this.pos.set(x, surfaceY(x, z), z);
    this.yaw = yaw;
    this.vLong = this.vLat = this.yawRate = 0;
    this.syncMesh();
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.vLong * 3.6; }

  update(dt, input, world) {
    const steerTarget = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * -1;
    // directie mai putin sensibila la viteza mare (ca in realitate)
    const speedFactor = 1 / (1 + Math.abs(this.vLong) * 0.055);
    const maxS = this.maxSteer * speedFactor;
    const rate = (steerTarget === 0 ? 5.4 : 3.4);
    this.steer = lerp(this.steer, steerTarget * maxS, Math.min(1, rate * dt));
    if (steerTarget === 0 && Math.abs(this.steer) < 0.004) this.steer = 0;

    const fwd = input.fwd ? 1 : 0;
    const bwd = input.back ? 1 : 0;
    const hb = input.handbrake ? 1 : 0;

    let drive = 0, brake = 0;
    if (fwd) {
      if (this.vLong < -0.4) brake = 1; else drive = 1;
    } else if (bwd) {
      if (this.vLong > 0.4) brake = 1; else drive = -0.45;
    }
    this.brakeLevel = brake;

    const m = this.mass;
    const Fzf = m * G * (this.lr / (this.lf + this.lr));
    const Fzr = m * G * (this.lf / (this.lf + this.lr));
    const maxFyf = this.mu * Fzf;
    const maxFyr = this.mu * Fzr * (hb ? 0.44 : 1.0);

    // ATENTIE: pragul de viteza mica se ia pe viteza TOTALA. Daca s-ar lua
    // doar pe componenta longitudinala, o masina pusa in travers (vLong ~ 0,
    // vLat mare) ar ramane brusc fara alunecare laterala.
    const vMag = Math.hypot(this.vLong, this.vLat);
    const vDen = Math.max(Math.abs(this.vLong), 1.6);   // numitor cu prag, fara singularitate
    let af, ar;
    if (vMag < 1.2) {
      const k = vMag / 1.2;
      this.yawRate = lerp(this.vLong * Math.tan(this.steer) / (this.lf + this.lr),
        this.yawRate, k);
      this.vLat = lerp(0, this.vLat, k);
      af = ar = 0;
    } else {
      af = Math.atan2(this.vLat + this.yawRate * this.lf, vDen)
         - this.steer * Math.sign(this.vLong || 1);
      ar = Math.atan2(this.vLat - this.yawRate * this.lr, vDen);
    }
    let Fyf = clamp(-this.Cf * af, -maxFyf, maxFyf);
    let Fyr = clamp(-this.Cr * ar, -maxFyr, maxFyr);

    // tractiune / franare longitudinala
    const powerFade = clamp(1 - Math.abs(this.vLong) / 48, 0, 1);
    let Fx = drive * this.engine * powerFade;
    if (brake) Fx -= Math.sign(this.vLong) * this.brakeForce;
    if (hb) Fx -= Math.sign(this.vLong) * 2900;
    Fx -= 0.44 * this.vLong * Math.abs(this.vLong);          // rezistenta aerodinamica
    Fx -= 21.0 * this.vLong;                                 // rezistenta la rulare
    if (!fwd && !bwd && Math.hypot(this.vLong, this.vLat) < 0.45) {
      this.vLong *= 0.82; this.vLat *= 0.82; Fx = 0;
    }
    // panta longitudinala a drumului
    const ahead = this.localToWorld(0, -2.0);
    const behind = this.localToWorld(0, 2.0);
    const grade = (surfaceY(behind.x, behind.z) - surfaceY(ahead.x, ahead.z)) / 4.0;
    Fx += m * G * clamp(grade, -0.25, 0.25) * 0.9;

    const aLong = (Fx - Fyf * Math.sin(this.steer)) / m + this.vLat * this.yawRate;
    const aLat = (Fyf * Math.cos(this.steer) + Fyr) / m - this.vLong * this.yawRate;
    const aYaw = (this.lf * Fyf * Math.cos(this.steer) - this.lr * Fyr) / this.Iz;

    this.vLong += aLong * dt;
    if (vMag >= 1.2) {
      this.vLat += aLat * dt;
      this.yawRate += aYaw * dt;
      this.yawRate *= Math.pow(0.986, dt * 60);
      this.yawRate = clamp(this.yawRate, -3.2, 3.2);   // plafon de stabilitate
    }
    this.vLat = clamp(this.vLat, -14, 14);
    this.slip = clamp(Math.abs(this.vLat) / 4.5, 0, 1);

    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const vx = -s * this.vLong + c * this.vLat;
    const vz = -c * this.vLong - s * this.vLat;

    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    this.yaw += this.yawRate * dt;

    const res = this.collide(nx, nz, world);
    this.pos.x = res.x; this.pos.z = res.z;
    if (res.hit) {
      const imp = Math.abs(this.vLong) + Math.abs(this.vLat);
      this.impact = Math.max(this.impact, imp);
      this.vLong *= 0.32;
      this.vLat *= 0.2;
      this.yawRate *= 0.35;
    }

    this.wheelSpin += (this.vLong / this.spec.wr) * dt;
    const targetRpm = 850 + Math.min(1, Math.abs(this.vLong) / 11) * 4600 * (drive ? 1 : 0.55)
      + Math.abs(this.vLong) * 42;
    this.rpm = lerp(this.rpm, clamp(targetRpm, 780, 6200), Math.min(1, 6 * dt));
    this.gear = clamp(1 + Math.floor(Math.abs(this.vLong) / 8.5), 1, 5);

    // suspensie vizuala
    this.pitchVis = lerp(this.pitchVis, clamp(-aLong * 0.0075, -0.06, 0.06), Math.min(1, 9 * dt));
    this.rollVis = lerp(this.rollVis, clamp(aLat * 0.0085, -0.07, 0.07), Math.min(1, 8 * dt));
    this.impact *= Math.pow(0.02, dt);

    this.syncMesh();
    this.syncLights();
    this.updateCamera(dt, world);
  }

  localToWorld(lx, lz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.pos.x + lx * c + lz * s, z: this.pos.z - lx * s + lz * c };
  }

  collide(x, z, world) {
    const spec = this.spec;
    const hw = spec.W / 2, hl = spec.L / 2;
    const list = world.colliders.query(x, z, hl + 1.5, this._list);
    let hit = false;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl], [0, -hl], [0, hl]];
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const it of list) {
        if (it.disabled || it === this.collider) continue;
        if (it.yTop < this.pos.y + 0.22) continue;
        for (const [lx, lz] of corners) {
          const px = x + lx * c + lz * s;
          const pz = z - lx * s + lz * c;
          const h = closestOnCollider(it, px, pz, this._hit);
          const inside = Math.abs(h.lx) <= it.hx && Math.abs(h.lz) <= it.hz;
          if (inside) {
            const pushX = it.hx - Math.abs(h.lx), pushZ = it.hz - Math.abs(h.lz);
            let ox = 0, oz = 0;
            if (pushX < pushZ) ox = Math.sign(h.lx || 1) * (pushX + 0.04);
            else oz = Math.sign(h.lz || 1) * (pushZ + 0.04);
            x += ox * it.cos + oz * it.sin;
            z += -ox * it.sin + oz * it.cos;
            hit = true; moved = true;
          } else {
            const dx = px - h.wx, dz = pz - h.wz;
            const d = Math.hypot(dx, dz);
            if (d < 0.06) {
              const k = (0.06 - d) / (d || 1e-4);
              x += dx * k; z += dz * k;
              hit = true; moved = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  syncMesh() {
    const spec = this.spec;
    const hw = spec.W / 2 - 0.1, hl = spec.wb / 2;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const pt = (lx, lz) => surfaceY(this.pos.x + lx * c + lz * s, this.pos.z - lx * s + lz * c);
    const fl = pt(-hw, -hl), fr = pt(hw, -hl), rl = pt(-hw, hl), rr = pt(hw, hl);
    this.pos.y = (fl + fr + rl + rr) / 4;
    const roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, hw * 2) + this.rollVis;
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, hl * 2) + this.pitchVis;

    const o = this.mesh;
    o.position.set(this.pos.x, this.pos.y, this.pos.z);
    o.rotation.set(0, 0, 0);
    o.rotateY(this.yaw);
    o.rotateX(pitch);
    o.rotateZ(roll);

    for (const w of this.mesh.userData.wheels) {
      w.pivot.rotation.y = w.front ? this.steer : 0;
      w.spin.rotation.x = this.wheelSpin;
    }
    const ud = this.mesh.userData;
    ud.tailMat.emissiveIntensity = (this.lightsOn ? 0.55 : 0) + this.brakeLevel * 2.4;
    ud.headMat.emissiveIntensity = this.lightsOn ? 3.2 : 0;
  }

  syncLights() {
    const spec = this.spec;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const h of this.headlights) {
      const lx = h.side * spec.W * 0.33, lz = -spec.L / 2 + 0.1;
      h.light.position.set(
        this.pos.x + lx * c + lz * s,
        this.pos.y + spec.sill + 0.42,
        this.pos.z - lx * s + lz * c);
      const tz = lz - 22;
      const tx = lx * 0.4;
      h.light.target.position.set(
        this.pos.x + tx * c + tz * s,
        this.pos.y + 0.05,
        this.pos.z - tx * s + tz * c);
      h.light.target.updateMatrixWorld();
      h.light.intensity = this.lightsOn ? 900 : 0;
    }
  }

  updateCamera(dt, world) {
    const spec = this.spec;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fwd = new THREE.Vector3(-s, 0, -c);
    const speedK = clamp(Math.abs(this.vLong) / 26, 0, 1);

    if (this.camMode === 1) {         // capota
      const lz = -spec.L / 2 + 1.35;
      this.camPos.set(this.pos.x + lz * s, this.pos.y + spec.sill + 0.82, this.pos.z + lz * c);
      this.camTarget.copy(this.camPos).addScaledVector(fwd, 12).add(new THREE.Vector3(0, -0.6, 0));
      this._camInit = false;
      return;
    }
    if (this.camMode === 2) {         // cinematic, din lateral-spate
      const lx = 3.4, lz = 5.6;
      this.camPos.set(this.pos.x + lx * c + lz * s, this.pos.y + 1.55, this.pos.z - lx * s + lz * c);
      this.camTarget.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
      this._camInit = false;
      return;
    }

    const dist = 5.4 + speedK * 1.5;
    const want = new THREE.Vector3(
      this.pos.x + dist * s, this.pos.y + 2.05 + speedK * 0.15, this.pos.z + dist * c);
    if (!this._camInit) { this._camSmooth.copy(want); this._camInit = true; }
    this._camSmooth.lerp(want, Math.min(1, (5.5 + speedK * 6) * dt));
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.1, this.pos.z);
    const k = world ? world.rayClearance(head, this._camSmooth, 0.4) : 1;
    this.camPos.copy(head).lerp(this._camSmooth, k);
    this.camTarget.set(this.pos.x, this.pos.y + 0.95, this.pos.z)
      .addScaledVector(fwd, 7 + speedK * 6);
  }

  onRoadNow() { return !!onRoad(this.pos.x, this.pos.z); }
}
