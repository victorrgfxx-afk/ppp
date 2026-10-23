import * as THREE from 'three';
import { DAYLIGHT } from './cars.js';

// The other players in this world (multiplayer, net.js): a walking figure where they walk, the car they drive moved
// by them (the same car in both games: the parked cars are the same, by key), their name over them, seen through
// walls. A car someone else drives is theirs: it is not simulated here, nobody else can get in at the wheel (a friend
// can ride along as the passenger). The cars a player moved stay where they left them for the other, a friend who
// joins later too (net.js `c`).
const JACKETS = [0xb83227, 0x2a72b5, 0x2f8f4e, 0xc9821c, 0x7d3f98, 0x15807a];
const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

// a figure of a person: torso, head, arms and legs on pivots, a walk cycle by the distance covered
class Avatar {
  constructor(scene, jacket) {
    const m = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const skin = m(0xd2a083, 0.6), jack = m(jacket, 0.75), pants = m(0x2b2c33, 0.85), shoe = m(0x1d1d1f, 0.5), hair = m(0x3a2c22, 0.9);
    this.mats = [skin, jack, pants, shoe, hair];
    const root = this.root = new THREE.Group(), body = this.body = new THREE.Group();
    root.add(body);
    const mesh = (geo, mat, parent, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), jack, body, 0, 1.28, 0).scale.set(1.05, 1, 0.72);
    mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 8), skin, body, 0, 1.6, 0);
    const head = this.head = new THREE.Group(); head.position.set(0, 1.72, 0); body.add(head);
    mesh(new THREE.SphereGeometry(0.105, 14, 10), skin, head, 0, 0, 0).scale.set(0.92, 1.08, 1);
    mesh(new THREE.SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, 1.25), hair, head, 0, 0.025, -0.012);
    mesh(new THREE.CapsuleGeometry(0.16, 0.12, 4, 10), pants, body, 0, 0.98, 0).scale.set(1.0, 1, 0.75);
    const limb = (x, y, upper, lower, r, mU, mL, foot) => {
      const hip = new THREE.Group(); hip.position.set(x, y, 0); body.add(hip);
      mesh(new THREE.CapsuleGeometry(r, upper - r * 2, 3, 8), mU, hip, 0, -upper / 2, 0);
      const knee = new THREE.Group(); knee.position.y = -upper; hip.add(knee);
      mesh(new THREE.CapsuleGeometry(r * 0.85, lower - r * 2, 3, 8), mL, knee, 0, -lower / 2, 0);
      if (foot) mesh(new THREE.BoxGeometry(0.1, 0.07, 0.25), shoe, knee, 0, -lower - 0.01, 0.05);
      return { hip, knee };
    };
    this.legL = limb(-0.09, 0.93, 0.45, 0.45, 0.065, pants, pants, true);
    this.legR = limb(0.09, 0.93, 0.45, 0.45, 0.065, pants, pants, true);
    this.armL = limb(-0.22, 1.5, 0.3, 0.28, 0.048, jack, skin, false);
    this.armR = limb(0.22, 1.5, 0.3, 0.28, 0.048, jack, skin, false);
    this.phase = 0; this.last = null; this.speed = 0;
    scene.add(root);
  }
  // x, y, z: the feet; yaw as the game's (the camera's: forward is -z); pitch: where the head looks
  pose(dt, x, y, z, yaw, pitch) {
    const l = this.last;
    const v = l && dt > 0 ? Math.hypot(x - l.x, z - l.z) / dt : 0;
    this.speed += (Math.min(v, 9) - this.speed) * Math.min(1, dt * 8);
    this.last = { x, z };
    const walk = Math.min(1, this.speed / 0.6), run = this.speed > 3.2;
    this.phase += dt * this.speed * (run ? 2.2 : 2.9);
    const s = Math.sin(this.phase), a = (run ? 0.75 : 0.42) * walk;
    this.legL.hip.rotation.x = s * a; this.legR.hip.rotation.x = -s * a;
    this.legL.knee.rotation.x = Math.max(0, -Math.cos(this.phase)) * (run ? 1.1 : 0.55) * walk;
    this.legR.knee.rotation.x = Math.max(0, Math.cos(this.phase)) * (run ? 1.1 : 0.55) * walk;
    this.armL.hip.rotation.x = -s * a * 0.8; this.armR.hip.rotation.x = s * a * 0.8;
    this.armL.knee.rotation.x = this.armR.knee.rotation.x = run ? -1.1 : -0.25;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * (run ? 0.06 : 0.03) * walk;
    this.body.rotation.x = run ? -0.12 : 0;
    this.head.rotation.x = -Math.max(-0.6, Math.min(0.6, pitch)) * 0.7;
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw + Math.PI, 0);            // (the figure faces its +z; the camera looks down its -z)
  }
  dispose() { this.root.removeFromParent(); this.root.traverse(o => o.geometry?.dispose()); for (const m of this.mats) m.dispose(); }
}

// the name over a player: drawn after the anti-aliasing (taa.js), over everything, the same size at any distance
function nameTag() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true, fog: false });
  const s = new THREE.Sprite(mat); s.scale.set(0.2, 0.0375, 1); s.renderOrder = 30; s.center.set(0.5, 0);
  let text = null;
  s.userData.set = (t, col) => {
    if (t === text) return; text = t;
    const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(c.width - 8, g.measureText(t).width + 36);
    g.fillStyle = 'rgba(12,14,18,0.62)'; g.beginPath(); g.roundRect((c.width - w) / 2, 14, w, 64, 32); g.fill();
    g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.beginPath(); g.arc((c.width - w) / 2 + 22, 46, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillText(t, c.width / 2 + 8, 47);
    tex.needsUpdate = true;
  };
  s.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return s;
}

export class RemotePlayers {
  constructor(scene, vehicles) {
    this.scene = scene;
    this.tags = new THREE.Group(); this.tags.name = 'mpTags';
    scene.add(this.tags);
    this.byKey = new Map(); this.vehicles = vehicles;
    this.keyCars(vehicles);
    this.players = new Map();                            // peer -> { avatar, tag, car, color }
  }
  // each car's key: its name and how many of that name came before it (the same in every game: the same map, the same
  // order), and the pose it was parked in
  keyCars(vehicles) {
    const n = new Map();
    for (const v of vehicles) {
      if (v.mpKey) continue;
      const k = (v.name || 'car'), i = n.get(k) ?? 0; n.set(k, i + 1);
      v.mpKey = k + '#' + i; v.mpLast = { x: v.x, z: v.z, h: v.h }; v.mpSpawn = { x: v.x, z: v.z, h: v.h };
      this.byKey.set(v.mpKey, v);
    }
  }
  // drive a car from a remote state c = [x, z, h, pitch, roll, steer, spin, speed, lights, brake]
  drive(v, c, dt) {
    v.x = c[0]; v.z = c[1]; v.h = c[2]; v.pitch = c[3]; v.roll = c[4]; v.steer = c[5]; v.spin = c[6];
    v.vx = -Math.sin(v.h) * c[7]; v.vz = -Math.cos(v.h) * c[7];
    if (!!c[8] !== v.lightsOn) v.setLights(!!c[8]);
    v.brake = c[9] ? 1 : 0;
    v.car.lights.tailMat.emissiveIntensity = v.brake ? 3.0 : (v.lightsOn ? 0.9 : 0.12 * DAYLIGHT.k);
    if (v.car.rider) v.car.rider.visible = true;
    v.place(dt);
    v.mpLast = { x: v.x, z: v.z, h: v.h };
  }
  release(v) {
    v.remote = null; v.vx = v.vz = 0; v.brake = 0;
    if (v.car.rider) v.car.rider.visible = false;
    v.mpLast = { x: v.x, z: v.z, h: v.h };
  }
  // once a frame: everyone's figure, name and car. me: { active, riding, camera }; returns the cars this game drives
  // that someone else also took (both got in at once), for main.js to settle
  update(dt, net, me) {
    const seen = new Set(), clash = [];
    for (const r of net.remotes.values()) {
      const st = r.now;
      if (!st) continue;
      seen.add(r.peer);
      let p = this.players.get(r.peer);
      if (!p) {
        const color = JACKETS[hash(r.peer) % JACKETS.length];
        p = { avatar: new Avatar(this.scene, color), tag: nameTag(), car: null, color };
        this.tags.add(p.tag);
        this.players.set(r.peer, p);
      }
      p.tag.userData.set(net.nameOf(r), p.color);
      const car = st.v ? this.byKey.get(st.v) : null;
      // their car: theirs while they drive it (if this game drives it too, both got in at once: main.js decides)
      if (p.car && (st.f !== 1 || p.car !== car)) { if (p.car.remote === r.peer) this.release(p.car); p.car = null; }
      if (st.f === 1 && car && st.c) {
        if (car === me.active) clash.push({ car, peer: r.peer });
        else { car.remote = r.peer; p.car = car; this.drive(car, st.c, dt); }
      }
      const onFoot = st.f === 0;
      p.avatar.root.visible = onFoot;
      if (onFoot) p.avatar.pose(dt, st.p[0], st.p[1], st.p[2], st.a[0], st.a[1]);
      else p.avatar.last = null;
      const top = onFoot ? [st.p[0], st.p[1] + 2.05, st.p[2]] : car ? [car.car.group.position.x, car.car.group.position.y + 2.1, car.car.group.position.z] : [st.p[0], st.p[1] + 2, st.p[2]];
      p.tag.position.set(top[0], top[1], top[2]);
      // the same size on screen at any field of view: the label ~3 % of the screen's height (30 px at 1080p)
      const sy = 0.084 * Math.tan((me.fov ?? 70) * Math.PI / 360);
      p.tag.scale.set(sy * 512 / 96, sy, 1);
      p.tag.visible = !(me.riding && car === me.riding && st.f === 1);     // (not over the driver you ride beside)
      // the cars they moved and left: where they left them, if they moved them after this game did
      if (r.cars) for (const e of r.cars) {
        const v = Array.isArray(e) && this.byKey.get(e[0]);
        if (!v || v === me.active || v.remote || !(e[4] > (v.mpSt ?? 0))) continue;
        v.x = e[1]; v.z = e[2]; v.h = e[3]; v.vx = v.vz = 0; v.mpSt = e[4]; v.mpMine = false;
        v.place(0); v.mpLast = { x: v.x, z: v.z, h: v.h };
      }
    }
    for (const [peer, p] of this.players) if (!seen.has(peer)) {
      if (p.car && p.car.remote === peer) this.release(p.car);
      p.avatar.dispose(); p.tag.removeFromParent(); p.tag.userData.dispose();
      this.players.delete(peer);
    }
    return clash;
  }
  // the cars this game moved since they were parked (driven, pushed), newest first: [key, x, z, h, when]
  moved(active) {
    let changed = false;
    for (const v of this.vehicles) {
      if (v.remote || !v.mpKey) continue;
      const l = v.mpLast;
      if (Math.abs(v.x - l.x) > 0.02 || Math.abs(v.z - l.z) > 0.02 || Math.abs(v.h - l.h) > 0.01) {
        v.mpLast = { x: v.x, z: v.z, h: v.h }; v.mpSt = Date.now(); v.mpMine = true;
        if (v !== active) changed = true; else v.mpDriving = true;
      } else if (v.mpDriving && v !== active) { v.mpDriving = false; changed = true; }   // (got out: where it stands now)
    }
    if (!changed) return null;
    // (only those that really left their place: a parked car settling by a few centimetres is not news)
    const away = (v) => Math.hypot(v.x - v.mpSpawn.x, v.z - v.mpSpawn.z) > 0.3 || Math.abs(v.h - v.mpSpawn.h) > 0.05;
    return this.vehicles.filter(v => v.mpMine && v !== active && away(v)).sort((a, b) => b.mpSt - a.mpSt).slice(0, 20)
      .map(v => [v.mpKey, Math.round(v.x * 100) / 100, Math.round(v.z * 100) / 100, Math.round(v.h * 1000) / 1000, v.mpSt]);
  }
  // the friends, for the minimap and the menu
  list(net, from) {
    const out = [];
    for (const r of net.remotes.values()) {
      if (!r.now) continue;
      const p = this.players.get(r.peer), [x, , z] = r.now.p;
      out.push({ x, z, yaw: r.now.a[0], name: net.nameOf(r), color: p?.color ?? 0xffffff, d: Math.hypot(x - from.x, z - from.z), r });
    }
    return out.sort((a, b) => a.d - b.d);
  }
}

// the passenger's seat of a car: the driver's mirrored to the right
export function seatPos(v, out = new THREE.Vector3()) {
  const pm = v.m, s = Math.sin(v.h), c = Math.cos(v.h);
  if (pm.seat) { const lz = pm.seat.z + 0.45; return out.set(v.x + lz * s, v.car.group.position.y + pm.seat.eye + 0.08, v.z + lz * c); }   // (an ATV: behind the rider)
  const lz = pm.pillars[0] - 0.06 - pm.L / 2, lx = 0.37;
  const beltY = pm.belt.reduce((a, b) => Math.max(a, b[1]), 0);
  return out.set(v.x + lx * c + lz * s, v.car.group.position.y + (pm.eyeY ?? beltY + 0.22), v.z - lx * s + lz * c);
}
