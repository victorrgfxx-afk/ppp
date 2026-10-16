import * as THREE from 'three';
import { Beast, species } from './beasts.js';
import { gaitPose } from './gait.js';
import { forestCode, inHole } from './geo/data.js';
import { damp } from './util.js';

// The animals of the woods around you (beasts.js models, gait.js legs): a red fox, a sounder of wild boar (sows and
// this year's young), a pack of grey wolves, a brown bear - as many as live in the Subcarpathian woods of Prahova,
// though met far more often here than in life. They are where the map has forest (the fox also out on the meadows
// along its edges), come and go 70-180 m from you (out of sight: behind you or in the trees), and behave as they do:
//  * the fox trots its rounds along the edges, stops to listen and pounces on a mouse in the grass; it notices you at
//    ~45 m (much farther in a car), stares, and lopes off into the trees;
//  * the boar forage in a loose group, heads down, rooting the litter, grunting; at ~40 m the sow stops and sniffs, then
//    the whole sounder bolts the same way;
//  * the wolves travel in single file at their tireless trot, each in the leader's tracks; they are the shyest: they
//    notice you at ~85 m, turn away and are gone; at night, settled, they howl;
//  * the bear ambles and forages; come within ~30 m on foot and it stands, huffs and moves off at a long walk (faster
//    than you walk); run at it to within ~18 m and it bluff-charges, stops short and makes off (what brown bears nearly
//    always do), and does not charge again for a good while; from cars it runs. In the snow modes the bears are asleep
//    in their dens.
//  Spooked once, a group stays wary for two minutes (it notices you sooner and bolts without stopping to look); a group
//  retreating that you catch up with breaks into a run.
// Active by the hour as they are: boar, wolves and the bear mostly at dusk and by night (fewer by day), the fox at any
// hour. Each comes back to the same spots: nothing is stored, a group just lives out its time near you.

const KIND = {
  fox: { h: 0.38, walk: 1.0, trot: 2.6, run: 11, notice: 45, flee: 30, car: 2.0, size: [1, 1], radius: 0.25, day: 0.9, night: 1, edge: true, winter: true, opts: {} },
  boar: { h: 0.85, walk: 0.8, trot: 2.0, run: 9.5, notice: 40, flee: 28, car: 1.6, size: [4, 7], radius: 0.4, day: 0.45, night: 1, winter: true, opts: { trotMax: 1.4, nod: 1.6 } },
  wolf: { h: 0.75, walk: 1.2, trot: 2.4, run: 12, notice: 85, flee: 70, car: 1.4, size: [3, 6], radius: 0.35, day: 0.3, night: 1, file: true, winter: true, opts: { walkMax: 0.15 } },
  bear: { h: 1.05, walk: 1.0, trot: 1.7, run: 10, notice: 30, flee: 18, car: 1.5, size: [1, 1], radius: 0.6, day: 0.35, night: 1, winter: false, bluff: true, opts: { noTrot: true, walkMax: 0.32, nod: 1.4 } },
};
const R = Math.random;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Animal {
  constructor(kind, beast, x, z, h) {
    Object.assign(this, { kind, b: beast, x, z, h, speed: 0, want: 0, gs: { cycle: R() }, headYaw: 0, headPitch: 0, root: 0, look: 0, tailT: R() * 9, slope: 0, y: 0 });
  }
}

export class Wildlife {
  // audio: the sound board (audio.js), world: collisions and the ground (world.js)
  constructor(scene, world, { audio = null, quality = 'Înaltă' } = {}) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.groups = []; this.timer = 1; this.t = 0;
    this.cap = quality === 'Scăzută' ? 0.5 : 1;
    this.frustum = new THREE.Frustum(); this.m4 = new THREE.Matrix4(); this.sph = new THREE.Sphere(new THREE.Vector3(), 2);
    this.tmp = [];
  }

  // is (x, z) somewhere the kind lives: forest (the fox also within ~20 m of it)
  habitat(k, x, z) {
    if (inHole(x, z)) return false;
    if (forestCode(x, z)) return true;
    if (!k.edge) return false;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (forestCode(x + a * 18, z + b * 18)) return true;
    return false;
  }
  blocked(x, z, r) {
    for (const b of this.world.query(x, z, r + 0.6, this.tmp)) {
      if (b.tag === 'beast' || b.tag === 'bear' || b.sapling) continue;
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hd + r) return true;
    }
    return false;
  }

  spawn(key, st) {
    const k = KIND[key];
    for (let tries = 0; tries < 14; tries++) {
      // behind you or to the side, 70-180 m off, in its habitat
      const a = st.camYaw + Math.PI + (R() - 0.5) * 3.4, d = 70 + R() * 110;
      const x = st.px - Math.sin(a) * d, z = st.pz - Math.cos(a) * d;
      if (!this.habitat(k, x, z) || this.blocked(x, z, k.radius)) continue;
      const n = k.size[0] + Math.floor(R() * (k.size[1] - k.size[0] + 1));
      const h = R() * Math.PI * 2, members = [];
      for (let i = 0; i < n; i++) {
        // a sounder: one or two sows, the rest this year's young; a pack: the pair and their grown pups
        const young = key === 'boar' && i >= (n > 5 ? 2 : 1);
        const b = new Beast(key, { young });
        if (young) b.group.scale.setScalar(0.55 + 0.1 * R());
        else if (key === 'wolf') b.group.scale.setScalar(i < 2 ? 1 : 0.9 + 0.08 * R());
        else b.group.scale.setScalar(0.92 + 0.16 * R());
        const ox = key === 'wolf' ? -Math.sin(h) * i * 2.6 : (R() - 0.5) * 6, oz = key === 'wolf' ? -Math.cos(h) * i * 2.6 : (R() - 0.5) * 6;
        const an = new Animal(k, b, x + ox, z + oz, h + (key === 'wolf' ? 0 : (R() - 0.5) * 2));
        an.young = young; an.scale = b.group.scale.x;
        this.scene.add(b.group);
        members.push(an);
      }
      const g = { key, k, members, state: 'roam', timer: 3 + R() * 6, target: null, trail: [], howlT: 20 + R() * 60, soundT: 2 + R() * 6, fleeFrom: null, life: 0 };
      this.groups.push(g);
      return g;
    }
    return null;
  }
  // tests: a group of `key` at (x, z) heading h, n animals, in `state`
  spawnAt(key, x, z, h = 0, n = null, state = 'pause') {
    const k = KIND[key], g = { key, k, members: [], state, timer: 1e9, target: null, trail: [], howlT: 1e9, soundT: 1e9, life: 0 };
    const cnt = n ?? k.size[0];
    for (let i = 0; i < cnt; i++) {
      const young = key === 'boar' && i >= 1, b = new Beast(key, { young });
      if (young) b.group.scale.setScalar(0.6);
      const an = new Animal(k, b, x - Math.sin(h) * i * (key === 'wolf' ? 2.6 : 1.4) + (key === 'boar' ? (i % 2 - 0.5) * 1.5 : 0), z - Math.cos(h) * i * (key === 'wolf' ? 2.6 : 1.4), h);
      an.young = young; an.scale = b.group.scale.x;
      this.scene.add(b.group); g.members.push(an);
    }
    this.groups.push(g);
    return g;
  }
  despawn(g) { for (const a of g.members) { this.scene.remove(a.b.group); a.b.dispose(); } this.groups.splice(this.groups.indexOf(g), 1); }

  pickTarget(g, from, far = 70) {
    for (let i = 0; i < 12; i++) {
      const a = R() * Math.PI * 2, d = 20 + R() * far, x = from.x + Math.sin(a) * d, z = from.z + Math.cos(a) * d;
      if (this.habitat(g.k, x, z)) return { x, z };
    }
    return { x: from.x, z: from.z };
  }

  // st: { px, pz, camX, camZ, camYaw, camera, inCar, running, night (0..1), winter, horror }
  update(dt, t, st) {
    this.t += dt;
    // who should be about: by the hour and the season
    if ((this.timer -= dt) <= 0) {
      this.timer = 1.5;
      for (const g of [...this.groups]) {
        const L = g.members[0], d = Math.hypot(L.x - st.px, L.z - st.pz);
        g.life += 1.5;
        if (d > 260 || (st.winter && !g.k.winter) || st.horror) this.despawn(g);
      }
      // the models are made one kind at a time, the first seconds after the start (a few hundred ms each)
      const todo = Object.keys(KIND).find(key => !this.built?.[key]);
      if (todo) { species(todo); (this.built ??= {})[todo] = true; return; }
      if (!st.horror) for (const key of Object.keys(KIND)) {
        const k = KIND[key];
        if (st.winter && !k.winter) continue;
        const want = (st.night * k.night + (1 - st.night) * k.day) * this.cap;
        const have = this.groups.filter(g => g.key === key).length;
        if (have < (want > 0.25 ? 1 : 0) + (key === 'fox' && st.night > 0.5 ? 1 : 0) && R() < want * 0.5) this.spawn(key, st);
      }
    }
    if (st.camera) { this.m4.multiplyMatrices(st.camera.projectionMatrix, st.camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.m4); }
    for (const g of this.groups) this.updateGroup(g, dt, t, st);
  }

  updateGroup(g, dt, t, st) {
    const k = g.k, L = g.members[0];
    const dP = Math.hypot(L.x - st.px, L.z - st.pz), car = st.inCar ? k.car : st.running ? 1.25 : 1;
    const away = Math.atan2(L.x - st.px, L.z - st.pz);
    g.timer -= dt; g.soundT -= dt; g.howlT -= dt; g.wary = Math.max(0, (g.wary ?? 0) - dt); g.bluffT = Math.max(0, (g.bluffT ?? 0) - dt);
    const notice = k.notice * car * (g.wary > 0 ? 1.4 : 1);
    // ---- the group's mind
    switch (g.state) {
      case 'roam': case 'forage': case 'pause': {
        if (dP < notice) {
          if (g.wary > 0 && !k.bluff) { g.state = 'flee'; g.timer = 10; g.wary = 120; this.sound(g, 'flee', dP); break; }
          g.state = 'alert'; g.timer = 1.2 + R() * 1.6; g.wary = 120; this.sound(g, 'alert', dP); break;
        }
        if (g.timer <= 0) {
          // roam: walk (wolves trot) to somewhere new; forage or pause on the way
          if (g.state === 'roam' && R() < (g.key === 'wolf' ? 0.2 : 0.6)) { g.state = g.key === 'boar' || g.key === 'bear' ? 'forage' : 'pause'; g.timer = 4 + R() * (g.key === 'boar' ? 14 : 6); }
          else { g.state = 'roam'; g.target = this.pickTarget(g, L, g.key === 'wolf' ? 140 : 70); g.timer = 25; }
        }
        if (g.key === 'wolf' && st.night > 0.6 && g.state === 'pause' && g.howlT <= 0) { g.howlT = 70 + R() * 90; this.sound(g, 'howl', dP); g.howling = 4.5; }
        if (g.soundT <= 0) { g.soundT = 4 + R() * 9; if (g.key === 'boar' || (g.key === 'fox' && st.night > 0.5 && R() < 0.3)) this.sound(g, 'idle', dP); }
        break;
      }
      case 'alert':
        if (g.timer <= 0) {
          if (k.bluff) {
            if (!st.inCar && dP < k.flee && g.bluffT <= 0) { g.state = 'bluff'; g.timer = 4; this.sound(g, 'huff', dP); }
            else if (dP < k.flee * car) { g.state = 'flee'; g.timer = 8; }
            else if (dP < k.notice * car) { g.state = 'retreat'; g.timer = 10; }
            else { g.state = 'roam'; g.timer = 1; }
          } else if (dP < k.flee * car || (g.key === 'boar' && dP < k.notice * car && R() < 0.5)) { g.state = 'flee'; g.timer = 9 + R() * 5; this.sound(g, 'flee', dP); }
          else if (dP < k.notice * car) { g.state = 'retreat'; g.timer = 8; }
          else { g.state = 'roam'; g.timer = 1; }
        }
        break;
      case 'bluff':                                                        // the bear's charge: it stops short
        // then it turns and makes off, and does not charge again for a good while
        if (dP < 4.5 || g.timer <= 0) { g.state = 'flee'; g.timer = 8; g.bluffT = 90; this.sound(g, 'huff', dP); }
        break;
      case 'retreat': case 'flee':
        if (g.state === 'retreat' && !k.bluff && dP < k.flee * car) { g.state = 'flee'; g.timer = 8; this.sound(g, 'flee', dP); }
        // the bear: followed on foot, it turns and bluffs; a car right behind it, it runs
        else if (g.state === 'retreat' && k.bluff && !st.inCar && dP < k.flee && g.bluffT <= 0) { g.state = 'bluff'; g.timer = 4; this.sound(g, 'huff', dP); }
        else if (g.state === 'retreat' && k.bluff && dP < (st.inCar ? 20 : k.flee)) { g.state = 'flee'; g.timer = 8; }
        if (g.timer <= 0 && dP > notice) {
          // gone far enough: on again, away from you
          g.state = 'roam'; g.timer = 2;
          const a = away + (R() - 0.5) * 1.2, x = L.x + Math.sin(a) * 90, z = L.z + Math.cos(a) * 90;
          g.target = this.habitat(k, x, z) ? { x, z } : this.pickTarget(g, L, 90);
        }
        else if (g.timer <= 0) g.timer = 3;
        break;
    }
    // ---- the leader's heading and pace
    let want = L.h, v = 0;
    if (g.state === 'pose') { v = g.poseSpeed ?? 0; }
    else if (g.state === 'roam' && g.target) { want = Math.atan2(g.target.x - L.x, g.target.z - L.z); v = g.key === 'wolf' ? k.trot : k.walk; if (Math.hypot(g.target.x - L.x, g.target.z - L.z) < 3) g.timer = 0; }
    else if (g.state === 'forage') { want = L.h + Math.sin(t * 0.3 + L.tailT) * 0.6; v = 0.25 + 0.25 * Math.max(0, Math.sin(t * 0.7 + L.tailT)); }
    else if (g.state === 'alert') { want = away + Math.PI; v = 0; }
    else if (g.state === 'bluff') { want = away + Math.PI; v = k.run * 0.8; }
    else if (g.state === 'retreat') { want = away; v = k.trot; }
    else if (g.state === 'flee') {
      // away from you, bending towards the trees
      want = away; v = g.timer > 3 || dP < k.flee * car * 1.3 ? k.run : k.trot;
      const ax = L.x + Math.sin(want) * 12, az = L.z + Math.cos(want) * 12;
      if (!this.habitat(k, ax, az)) for (const da of [0.6, -0.6, 1.2, -1.2]) { if (this.habitat(k, L.x + Math.sin(want + da) * 12, L.z + Math.cos(want + da) * 12)) { want += da; break; } }
    }
    this.steer(L, want, v, dt);
    // ---- the others: in the leader's tracks (wolves), round it (the sounder)
    if (g.key === 'wolf') { g.trail.push([L.x, L.z]); if (g.trail.length > 400) g.trail.shift(); }
    for (let i = 1; i < g.members.length; i++) {
      const a = g.members[i];
      let tx, tz;
      if (g.key === 'wolf') {
        // the point on the trail i x 2.6 m back
        let need = i * 2.6, px = L.x, pz = L.z;
        tx = px; tz = pz;
        for (let j = g.trail.length - 1; j > 0 && need > 0; j--) { const [qx, qz] = g.trail[j - 1], s = Math.hypot(qx - px, qz - pz); need -= s; px = qx; pz = qz; tx = qx; tz = qz; }
      } else {
        a.slot ??= [(R() - 0.5) * 7, -1 - R() * 5];
        const c = Math.cos(L.h), s = Math.sin(L.h);
        tx = L.x + a.slot[0] * c + a.slot[1] * s; tz = L.z - a.slot[0] * s + a.slot[1] * c;
      }
      const d = Math.hypot(tx - a.x, tz - a.z), w = Math.atan2(tx - a.x, tz - a.z);
      const pace = g.state === 'flee' ? k.run * 1.05 : g.state === 'forage' ? Math.min(0.6, d * 0.4) : Math.min(k.run, Math.max(0, (d - 0.5) * 1.2) + (L.speed > 0.2 ? L.speed * 0.85 : 0));
      this.steer(a, d > 0.6 ? w : (g.state === 'forage' ? a.h + Math.sin(t * 0.5 + i) * 0.4 : L.h), d > 0.4 || g.state === 'flee' ? pace : 0, dt);
    }
    // ---- bodies on the ground, legs, heads
    for (const a of g.members) this.animate(g, a, dt, t, st, dP);
  }

  steer(a, want, v, dt) {
    const k = a.kind;
    let dh = ang(want - a.h);
    const turn = (v > k.trot ? 2.4 : 1.8) * dt;
    a.h += Math.max(-turn, Math.min(turn, dh));
    a.speed = damp(a.speed, v * (Math.abs(dh) > 1.3 ? 0.35 : 1), v > a.speed ? 1.6 : 3, dt);
    if (a.speed < 0.02) return;
    const step = a.speed * dt, nx = a.x + Math.sin(a.h) * step, nz = a.z + Math.cos(a.h) * step;
    const r = k.radius * (a.scale ?? 1);
    if (this.blocked(nx + Math.sin(a.h) * r * 2, nz + Math.cos(a.h) * r * 2, r)) {
      // round the trunk: try either side
      for (const da of [0.7, -0.7, 1.4, -1.4]) {
        const hx = a.x + Math.sin(a.h + da) * step, hz = a.z + Math.cos(a.h + da) * step;
        if (!this.blocked(hx + Math.sin(a.h + da) * r * 2, hz + Math.cos(a.h + da) * r * 2, r)) { a.h += da * Math.min(1, dt * 6); a.x = hx; a.z = hz; return; }
      }
      a.speed *= 0.5; return;
    }
    a.x = nx; a.z = nz;
  }

  animate(g, a, dt, t, st, dP) {
    const k = a.kind, b = a.b, s = a.scale ?? 1, w = this.world;
    const camD = Math.hypot(a.x - st.camX, a.z - st.camZ);
    const gy = w.groundHeight(a.x, a.z);
    b.group.position.set(a.x, gy, a.z);
    this.sph.center.set(a.x, gy + k.h * s * 0.6, a.z); this.sph.radius = 1.6 * s + k.h;
    const show = camD < 230 && (!st.camera || this.frustum.intersectsSphere(this.sph));
    b.group.visible = show;
    if (!show) return;
    b.setLod(camD < 16 ? 0 : camD < 45 ? 1 : 2);
    const fx = Math.sin(a.h) * 0.6 * s, fz = Math.cos(a.h) * 0.6 * s;
    const pitch = Math.atan2(w.groundHeight(a.x + fx, a.z + fz) - w.groundHeight(a.x - fx, a.z - fz), 1.2 * s);
    a.slope = damp(a.slope, pitch, 6, dt);
    b.group.rotation.set(-a.slope, a.h, 0, 'YXZ');
    const p = gaitPose(a.gs, dt, a.speed / s, k.h, k.opts);
    // the head: alert towards you, down while rooting or sniffing, up to howl
    const toP = ang(Math.atan2(st.px - a.x, st.pz - a.z) - a.h);
    let hy = 0, hp = 0;
    if (g.state === 'alert' || g.state === 'bluff') { hy = Math.max(-1, Math.min(1, toP)); hp = -0.12; }
    else if (g.state === 'forage') { hp = g.key === 'boar' ? 0.75 + 0.12 * Math.sin(t * 6 + a.tailT) : 0.5; hy = 0.3 * Math.sin(t * 0.8 + a.tailT); }
    else if (g.state === 'pause') { hy = 0.6 * Math.sin(t * 0.4 + a.tailT); hp = g.key === 'fox' ? 0.25 : 0; }
    if (g.howling > 0) { g.howling -= dt / g.members.length; hp = -0.9; hy = 0; }
    a.headYaw = damp(a.headYaw, hy, 4, dt); a.headPitch = damp(a.headPitch, hp, 4, dt);
    p.neck = (p.neck ?? 0) + a.headPitch * 0.55; p.head = (p.head ?? 0) + a.headPitch * 0.45; p.headYaw = a.headYaw;
    // the tail: the fox's and the wolves' held low, up when they run; the boar's flicks
    a.tailT += dt;
    if (g.key === 'boar') p.tailYaw = 0.4 * Math.sin(a.tailT * 7);
    if (g.state === 'alert' && g.key !== 'boar') p.tail = -0.25;
    // breathing
    p.chest = (p.chest ?? 0) + 0.015 * Math.sin(t * (g.state === 'flee' ? 9 : 2.2) + a.tailT);
    b.pose(p);
  }
  // st.night etc are passed by main.js; the sounds go to the board with the distance and side
  sound(g, what, d) {
    const A = this.audio; if (!A?.ctx) return;
    const k = g.key;
    if (what === 'howl' && k === 'wolf') A.howl?.(d, g.members.length);
    else if (k === 'fox' && (what === 'alert' || what === 'idle')) A.foxBark?.(d);
    else if (k === 'boar') A.boarGrunt?.(d, what === 'flee' || what === 'alert');
    else if (k === 'bear') A.bear?.(false, d);
  }
  // for tests: where everyone is
  info() { return this.groups.map(g => ({ key: g.key, n: g.members.length, state: g.state, x: +g.members[0].x.toFixed(1), z: +g.members[0].z.toFixed(1), v: +g.members[0].speed.toFixed(2) })); }
}
