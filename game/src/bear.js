import * as THREE from 'three';
import { v3, E, C, sdfOf, furryPart, glossy, contactShadow } from './dogs.js';
import { damp } from './util.js';

// A Carpathian brown bear (Ursus arctos) that roams the hill of the cross on stormy nights. Sculpted like the dogs:
// signed-distance body meshed with surface nets and a coat of instanced fur shells; the four legs, the head and the
// jaw are separate parts that move. ~2 m long, ~1.05 m at the shoulder hump, the size of a grown male.

const DARK = new THREE.Color().setRGB(0.12, 0.078, 0.048, THREE.SRGBColorSpace);
const MUZZLE = new THREE.Color().setRGB(0.24, 0.16, 0.1, THREE.SRGBColorSpace);
const LOOK = { shells: 8, density: 150, tip: 0x8f6a44, sheen: 0x4a3424, gravity: [0, -0.55, -0.35], lift: 0.55, thick: 0.56, ao: 0.28, vary: 0.4 };

function legPart(front) {
  // in the leg's own frame: the pivot (shoulder / hip) at the origin, the paw on the ground at y = -0.6
  const sdf = front ? sdfOf([
    C(v3(0, 0.06, 0), v3(0, -0.5, 0.03), 0.125, 0.095, 0.05),
    E(v3(0, -0.56, 0.08), v3(0.1, 0.055, 0.15), 0.06),
  ]) : sdfOf([
    C(v3(0, 0.06, 0), v3(0, -0.3, -0.07), 0.15, 0.11, 0.05),
    C(v3(0, -0.3, -0.07), v3(0, -0.53, 0.0), 0.1, 0.088, 0.05),
    E(v3(0, -0.57, 0.07), v3(0.095, 0.05, 0.16), 0.05),
  ]);
  const fur = (x, y) => (y < -0.5 ? 0.025 : 0.075);
  const col = (x, y, z, c) => c.copy(DARK).multiplyScalar(y < -0.48 ? 0.7 : 1);
  const m = furryPart(sdf, [v3(-0.2, -0.66, -0.25), v3(0.2, 0.22, 0.3)], 0.034, fur, col, LOOK);
  const g = new THREE.Group(); g.add(m);
  // claws: five dark curved hooks per paw
  const claw = glossy(0x2a2420, 0.35);
  for (let i = 0; i < 5; i++) {
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.012, front ? 0.07 : 0.05, 6), claw);
    k.position.set((i - 2) * 0.034, -0.585, (front ? 0.21 : 0.2) + (2 - Math.abs(i - 2)) * 0.008);
    k.rotation.x = Math.PI / 2 + 0.5;
    g.add(k);
  }
  return g;
}

function headPart() {
  // in the head's frame: the neck joint at the origin
  const sdf = sdfOf([
    E(v3(0, 0.02, 0.15), v3(0.2, 0.18, 0.2), 0.08),
    E(v3(0, 0.08, 0.23), v3(0.16, 0.1, 0.12), 0.06),
    C(v3(0, -0.02, 0.26), v3(0, -0.055, 0.46), 0.11, 0.07, 0.06),
    E(v3(0.15, 0.17, 0.07), v3(0.06, 0.065, 0.035), 0.04), E(v3(-0.15, 0.17, 0.07), v3(0.06, 0.065, 0.035), 0.04),
    C(v3(0, -0.02, -0.1), v3(0, 0, 0.08), 0.2, 0.19, 0.06),
  ]);
  const fur = (x, y, z) => (z > 0.36 ? 0.012 : y > 0.14 && Math.abs(x) > 0.1 ? 0.03 : z < 0.05 ? 0.09 : 0.045);
  const col = (x, y, z, c) => c.copy(z > 0.34 ? MUZZLE : DARK);
  const g = new THREE.Group();
  g.add(furryPart(sdf, [v3(-0.28, -0.2, -0.32), v3(0.28, 0.3, 0.56)], 0.022, fur, col, { ...LOOK, density: 190 }));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glossy(0x0a0807, 0.3));
  nose.scale.set(0.05, 0.035, 0.035); nose.position.set(0, -0.035, 0.515);
  g.add(nose);
  // small dark eyes that throw the light back (eyeshine) at night
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x120a04, roughness: 0.08, clearcoat: 1, emissive: 0xff9a30, emissiveIntensity: 0 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), eyeMat); e.position.set(s * 0.078, 0.055, 0.33); g.add(e); }
  // lower jaw with the canines, hinged so it can open for a roar
  const jaw = new THREE.Group(); jaw.position.set(0, -0.085, 0.22);
  const jsdf = sdfOf([C(v3(0, 0, 0), v3(0, -0.015, 0.2), 0.075, 0.05, 0.03)]);
  jaw.add(furryPart(jsdf, [v3(-0.12, -0.11, -0.1), v3(0.12, 0.09, 0.3)], 0.02, () => 0.02, (x, y, z, c) => c.copy(MUZZLE), { ...LOOK, shells: 6, density: 200 }));
  const tooth = new THREE.MeshPhysicalMaterial({ color: 0xe8dcc0, roughness: 0.3, clearcoat: 0.5 });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a0e10, roughness: 0.4 }));
  mouth.scale.set(0.055, 0.02, 0.11); mouth.position.set(0, 0.02, 0.12); jaw.add(mouth);
  for (const s of [-1, 1]) {
    const lo = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.045, 6), tooth); lo.position.set(s * 0.035, 0.035, 0.17); jaw.add(lo);
    const up = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), tooth); up.position.set(s * 0.037, -0.115, 0.43); up.rotation.x = Math.PI; g.add(up);
  }
  g.add(jaw);
  return { g, jaw, eyeMat };
}

function buildModel() {
  const body = sdfOf([
    E(v3(0, 0.78, -0.02), v3(0.36, 0.34, 0.66), 0.1),        // barrel
    E(v3(0, 0.98, 0.34), v3(0.3, 0.22, 0.3), 0.16),           // the shoulder hump
    E(v3(0, 0.7, 0.42), v3(0.33, 0.33, 0.3), 0.12),           // chest
    E(v3(0, 0.8, -0.48), v3(0.34, 0.31, 0.3), 0.12),          // rump
    E(v3(0, 0.6, -0.02), v3(0.3, 0.2, 0.5), 0.1),             // belly
    C(v3(0, 0.9, 0.6), v3(0, 0.88, 0.8), 0.24, 0.21, 0.1),   // neck
    E(v3(0, 0.86, -0.79), v3(0.07, 0.07, 0.06), 0.05),        // stub of a tail
    E(v3(0.2, 0.66, 0.42), v3(0.14, 0.2, 0.17), 0.1), E(v3(-0.2, 0.66, 0.42), v3(0.14, 0.2, 0.17), 0.1),       // upper arms
    E(v3(0.21, 0.68, -0.46), v3(0.15, 0.24, 0.22), 0.1), E(v3(-0.21, 0.68, -0.46), v3(0.15, 0.24, 0.22), 0.1), // thighs
  ]);
  const fur = (x, y, z) => (y > 0.95 && z > 0.1 && z < 0.6 ? 0.12 : y < 0.5 ? 0.11 : 0.09);   // a shaggy hump, a long belly fringe
  const grp = new THREE.Group();
  const torso = furryPart(body, [v3(-0.62, 0.22, -0.98), v3(0.62, 1.3, 1.08)], 0.045, fur, (x, y, z, c) => c.copy(DARK).multiplyScalar(0.85 + 0.3 * Math.max(0, y - 0.9)), LOOK);
  grp.add(torso);
  const legs = [];
  for (const [front, sx] of [[true, -1], [true, 1], [false, -1], [false, 1]]) {
    const leg = legPart(front);
    leg.position.set(sx * (front ? 0.2 : 0.21), 0.62, front ? 0.42 : -0.46);
    grp.add(leg); legs.push(leg);
  }
  const head = headPart();
  head.g.position.set(0, 0.9, 0.8);
  grp.add(head.g);
  const shadow = contactShadow(1.3, 2.3); grp.add(shadow);
  // shadows from the skin only (one invisible copy of each part), not from every fur shell
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  grp.traverse((o) => {
    o.userData.noAO = true;
    if (o.isInstancedMesh) { o.castShadow = false; const sh = new THREE.Mesh(o.geometry, ghost); sh.castShadow = true; sh.userData.noAO = true; sh.userData.noWet = true; o.parent.add(sh); }
  });
  grp.userData.ueSkip = 'bear';
  return { grp, torso, legs, head: head.g, jaw: head.jaw, eyeMat: head.eyeMat };
}

// Behaviour: roams the hill around the cross; notices you within ~30 m (more with a torch), stops, roars and charges.
// On foot it knocks you down and backs off; it cannot reach you in a car, so it stands and growls at it.
export class Bear {
  constructor(scene, world, home, cb = {}) {
    Object.assign(this, buildModel());
    this.world = world; this.home = home; this.cb = cb;
    this.grp.visible = false;
    scene.add(this.grp);
    this.x = home.x + 70; this.z = home.z; this.h = 0; this.speed = 0;
    this.state = 'wander'; this.timer = 0; this.target = null; this.phase = 0; this.active = false;
    this.headYaw = 0; this.headPitch = 0; this.jawOpen = 0; this.growlT = 0;
    this.box = new world.Box(this.x, this.z, 0.45, 1.0, 0, -1e4, 1e4, 'bear');   // a collider only while it is out
  }

  spawn() {
    const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 40;
    this.x = this.home.x + Math.cos(a) * r; this.z = this.home.z + Math.sin(a) * r;
    this.h = Math.random() * Math.PI * 2; this.state = 'wander'; this.target = null; this.speed = 0;
  }

  blocked(x, z) {
    for (const b of this.world.query(x, z, 1.4)) {
      if (b.tag === 'bear') continue;
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hw + 0.55 && Math.abs(lz) < b.hd + 0.55) return true;
    }
    return false;
  }

  pickTarget() {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 110;
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      if (!this.blocked(x, z)) return { x, z };
    }
    return { x: this.home.x + 30, z: this.home.z };
  }

  // st: { active, px, pz, py, inCar, torch, camX, camZ }
  update(dt, t, st) {
    if (st.active !== this.active) {
      this.active = st.active;
      if (this.active) { this.spawn(); this.world.addDynamic(this.box); } else this.world.removeDynamic(this.box);
    }
    const camD = Math.hypot(st.camX - this.x, st.camZ - this.z);
    this.grp.visible = this.active && camD < 320;
    if (!this.active) return;
    const dx = st.px - this.x, dz = st.pz - this.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    this.calm = Math.max(0, (this.calm ?? 0) - dt);
    const sees = this.calm <= 0 && d < (st.torch ? 44 : 30);             // (after a blow it leaves you alone for a while)
    let want = this.h, v = 0;
    this.timer -= dt; this.growlT -= dt;
    switch (this.state) {
      case 'wander': {
        if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 3) {
          this.state = 'sniff'; this.timer = 2 + Math.random() * 4; this.target = this.pickTarget(); break;
        }
        want = Math.atan2(this.target.x - this.x, this.target.z - this.z); v = 1.25;
        if (sees) { this.state = 'alert'; this.timer = 1.6; this.cb.roar?.(d); }
        break;
      }
      case 'sniff':
        if (this.timer <= 0) this.state = 'wander';
        if (sees) { this.state = 'alert'; this.timer = 1.6; this.cb.roar?.(d); }
        break;
      case 'alert':
        want = toP;
        if (this.timer <= 0) {
          if (st.inCar) { this.timer = 2.5; if (this.growlT <= 0) { this.cb.growl?.(d); this.growlT = 3.5; } if (d > 45) this.state = 'wander'; }
          else this.state = 'charge';
        }
        break;
      case 'charge':
        want = toP; v = 9;                                                      // ~32 km/h; a bear can reach 50
        if (st.inCar && d < 6) { this.state = 'alert'; this.timer = 2; }
        else if (d < 1.9) { this.cb.attack?.(dx / (d || 1), dz / (d || 1)); this.state = 'retreat'; this.timer = 7; this.calm = 25; }
        else if (d > 70) this.state = 'wander';
        break;
      case 'retreat':
        want = toP + Math.PI; v = 3.2;
        if (this.timer <= 0) { this.state = 'wander'; this.target = null; }
        break;
    }
    // back home if it strayed from the hill
    if (this.state === 'wander' && Math.hypot(this.x - this.home.x, this.z - this.home.z) > 170) this.target = { x: this.home.x, z: this.home.z };
    // turn, then move; steer around trunks, walls and the cross
    let dh = Math.atan2(Math.sin(want - this.h), Math.cos(want - this.h));
    const turn = (v > 5 ? 3.2 : 1.6) * dt;
    this.h += Math.max(-turn, Math.min(turn, dh));
    this.speed = damp(this.speed, v * (Math.abs(dh) > 1.2 ? 0.3 : 1), v > this.speed ? 2.2 : 4, dt);
    const nx = this.x + Math.sin(this.h) * this.speed * dt, nz = this.z + Math.cos(this.h) * this.speed * dt;
    if (this.speed > 0.05 && this.blocked(nx + Math.sin(this.h) * 0.8, nz + Math.cos(this.h) * 0.8)) { this.h += (this.state === 'charge' ? 1.6 : 0.9) * dt * 3; if (this.state === 'wander') this.target = this.pickTarget(); }
    else { this.x = nx; this.z = nz; }
    // stance on the slope
    const w = this.world, gy = w.groundHeight(this.x, this.z);
    const fx = Math.sin(this.h) * 0.85, fz = Math.cos(this.h) * 0.85;
    const pitch = Math.atan2(w.groundHeight(this.x + fx, this.z + fz) - w.groundHeight(this.x - fx, this.z - fz), 1.7);
    // gait: a walk (hind - fore on the same side, a quarter cycle apart) or a gallop
    const run = this.speed > 4.5;
    this.phase += dt * (run ? 2.6 : 0.85 + this.speed * 0.25) * Math.PI * 2;
    const A = Math.min(1, this.speed / 1.2) * (run ? 0.75 : 0.42);
    const off = run ? [0.0, 0.25, 0.5 + 0.0, 0.62] : [0.25, 0.75, 0.0, 0.5];   // FL, FR, HL, HR (cycles)
    this.legs.forEach((l, i) => { l.rotation.x = A * Math.sin(this.phase + off[i] * Math.PI * 2); });
    const bob = (run ? 0.07 : 0.025) * Math.min(1, this.speed) * Math.sin(this.phase * 2);
    this.grp.position.set(this.x, gy + bob, this.z);
    this.grp.rotation.set(-pitch + (run ? 0.05 * Math.sin(this.phase) : 0), this.h, 0, 'YXZ');
    this.box.x = this.x; this.box.z = this.z; this.box.rot = this.h; this.box.update();
    // head: sniffing the ground, swinging on the walk, up and open-mouthed when it roars
    const roar = this.state === 'alert' || (this.state === 'charge' && Math.sin(t * 3) > 0.6);
    const wantPitch = this.state === 'sniff' ? 0.45 + 0.1 * Math.sin(t * 5) : roar ? -0.3 : 0.08 * Math.sin(this.phase);
    const wantYaw = this.state === 'sniff' ? 0.4 * Math.sin(t * 0.9) : 0.07 * Math.sin(this.phase * 0.5);
    this.headPitch = damp(this.headPitch, wantPitch, 4, dt); this.headYaw = damp(this.headYaw, wantYaw, 4, dt);
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');
    this.jawOpen = damp(this.jawOpen, roar ? 0.55 + 0.1 * Math.sin(t * 23) : 0.03, 8, dt);
    this.jaw.rotation.x = this.jawOpen;
    const br = Math.sin(t * (this.state === 'charge' ? 9 : 2.2));
    this.torso.scale.set(1 + br * 0.01, 1 + br * 0.015, 1);
    if (this.state === 'wander' && this.growlT <= 0 && d < 60) { this.cb.growl?.(d); this.growlT = 6 + Math.random() * 8; }
  }
}
