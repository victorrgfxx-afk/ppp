import * as THREE from 'three';
import { Box } from './collision.js';
import { damp } from './util.js';

// A villager walking along the street with a yellow shopping bag (seen far down the road in photo 7).
// Simple articulated body with a procedural walk cycle; gets knocked over (and gets back up) if hit by a car.
export class Walker {
  constructor(scene, world, { x = -0.35, z0 = 44, z1 = 104, speed = 1.25, jacket = 0x2d4f95 } = {}) {
    this.world = world;
    this.x = x; this.z = z0; this.z0 = z0; this.z1 = z1; this.dir = 1; this.speed = speed;
    this.h = 0; this.phase = 0; this.down = 0; this.fall = 0; this.fallDir = new THREE.Vector2();
    const m = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = m(0xd2a083, 0.6), jack = m(jacket, 0.75), pants = m(0x2b2c33, 0.85), shoe = m(0x1d1d1f, 0.5), hair = m(0x6e6a66, 0.9), bag = m(0xe8c11e, 0.5);
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group();
    root.add(body);
    const mesh = (geo, mat, parent, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    // torso + head
    mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), jack, body, 0, 1.28, 0).scale.set(1.05, 1, 0.72);
    mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), skin, body, 0, 1.6, 0);
    const head = mesh(new THREE.SphereGeometry(0.105, 14, 10), skin, body, 0, 1.72, 0.0);
    head.scale.set(0.92, 1.08, 1);
    mesh(new THREE.SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, 1.25), hair, body, 0, 1.745, -0.012);
    mesh(new THREE.CapsuleGeometry(0.16, 0.12, 4, 10), pants, body, 0, 0.98, 0).scale.set(1.0, 1, 0.75);
    // limbs: pivots at hips / shoulders, knees / elbows
    const limb = (x, y, upperLen, lowerLen, r, matU, matL, foot) => {
      const hip = new THREE.Group(); hip.position.set(x, y, 0); body.add(hip);
      mesh(new THREE.CapsuleGeometry(r, upperLen - r * 2, 3, 8), matU, hip, 0, -upperLen / 2, 0);
      const knee = new THREE.Group(); knee.position.y = -upperLen; hip.add(knee);
      mesh(new THREE.CapsuleGeometry(r * 0.85, lowerLen - r * 2, 3, 8), matL, knee, 0, -lowerLen / 2, 0);
      if (foot) mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe, knee, 0, -lowerLen - 0.01, 0.05);
      return { hip, knee };
    };
    this.legL = limb(-0.09, 0.93, 0.45, 0.45, 0.065, pants, pants, true);
    this.legR = limb(0.09, 0.93, 0.45, 0.45, 0.065, pants, pants, true);
    this.armL = limb(-0.22, 1.5, 0.3, 0.28, 0.048, jack, skin, false);
    this.armR = limb(0.22, 1.5, 0.3, 0.28, 0.048, jack, skin, false);
    // shopping bag in the right hand
    const bagG = new THREE.Group(); bagG.position.y = -0.3; this.armR.knee.add(bagG);
    mesh(new THREE.BoxGeometry(0.1, 0.34, 0.3), bag, bagG, 0.02, -0.2, 0);
    scene.add(root);
    this.box = world.addDynamic(new Box(x, this.z, 0.22, 0.22, 0, -1, 2, 'npc'));
    this.box.npc = this;
  }
  hit(vehicle, push) {
    const v = Math.hypot(vehicle.vx, vehicle.vz);
    if (this.down > 0) return;
    if (v > 3) {
      this.down = 5; this.fall = 0;
      this.fallDir.set(vehicle.vx, vehicle.vz).normalize();
      this.x += this.fallDir.x * 1.2; this.z += this.fallDir.y * 1.2;
    } else {
      this.x -= push.x; this.z -= push.z;
    }
  }
  update(dt) {
    if (this.down > 0) {
      this.down -= dt;
      this.fall = damp(this.fall, this.down > 1.2 ? 1 : 0, this.down > 1.2 ? 9 : 3, dt);
    } else {
      this.z += this.dir * this.speed * dt;
      if (this.z > this.z1) this.dir = -1;
      if (this.z < this.z0) this.dir = 1;
      this.phase += dt * this.speed * 2.9;
    }
    const targetH = this.dir > 0 ? 0 : Math.PI;       // model faces +Z: south when dir > 0
    this.h = damp(this.h, targetH, 3, dt);
    const s = Math.sin(this.phase), walking = this.down > 0 ? 0 : 1;
    this.legL.hip.rotation.x = s * 0.42 * walking;
    this.legR.hip.rotation.x = -s * 0.42 * walking;
    this.legL.knee.rotation.x = Math.max(0, -Math.cos(this.phase)) * 0.55 * walking;
    this.legR.knee.rotation.x = Math.max(0, Math.cos(this.phase)) * 0.55 * walking;
    this.armL.hip.rotation.x = -s * 0.35 * walking;
    this.armR.hip.rotation.x = s * 0.12 * walking;           // the bag arm swings less
    this.armL.knee.rotation.x = -0.25; this.armR.knee.rotation.x = -0.1;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.03 * walking;
    const y = this.world.groundHeight(this.x, this.z);
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.set(0, this.h, 0);
    this.body.rotation.x = -this.fall * 1.45;
    this.body.position.y += this.fall * 0.12;
    this.box.x = this.x; this.box.z = this.z; this.box.y1 = this.down > 0 ? 0.3 : 2; this.box.update();
  }
}
