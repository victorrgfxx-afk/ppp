import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addMownGrass } from './geo/hillwood.js';

// The range on the meadow by the cross (V89): where the Glock lies, a training lane up the hill as the Call of Duty
// games' firing ranges have it - pop-up targets that go down when "killed" and come back up, and steel plates that
// ring. It runs from a firing line 9 m out from the cross toward the north-north-west (340 deg): up a slope of ~5 %,
// open grass to the wood's edge ~75 m on (a backstop of rising ground and trees), the lane itself mown; away from the
// lane over the hill (it passes the cross on its east side, coming from the north-north-east and going on to the
// south-east) and from the clearing of the night's scene (to the west-north-west, ~115 m).
// The pop-ups: olive plastic E-type silhouettes (the army's, ~50 x 100 cm) on lifters - a round in the head puts one
// down, three in the body (it falls back flat behind its lifter, is raised again 3.5 s later by its motor). The
// plates: AR500 steel discs of 20, 25 and 30 cm, white, hung by two chains from a bar on two posts, swinging with
// each round (the round's momentum, ~2.8 N s) and ringing (audio.js: gong). The rounds leave their holes in the
// plastic and their grey lead splashes on the steel.
// It tells what a round did (onEvent): a hit, a kill (head, distance, a melee blow) - the hit markers, the score and
// the medals of the HUD (weapon.js: GunHud)

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const G = 9.81, M_ROUND = 0.0095, V_ROUND = 295;
// the E-type's outline: half of it (x >= 0), from the base up; the head above the neck (y > NECK)
// (the neck from 0.72 up counts as the head, as the games' head boxes take it)
const HALF = [[0.25, 0], [0.25, 0.555], [0.243, 0.6], [0.222, 0.635], [0.19, 0.658], [0.09, 0.7], [0.075, 0.777]];
const HEAD = { y: 0.875, rx: 0.105, ry: 0.14 }, NECK = 0.777, HEADZ = 0.72, STEM = 0.1, LIFT_H = 0.22;
// the lane's layout: [down range from the firing line, to the right] (m)
const POPUPS = [[7, -2.0], [10, 2.2], [14, -0.6], [18, 1.4], [23, -2.4], [28, 0.4]];
const PLATES = [[15, 4.6, 0.1], [25, 4.0, 0.125], [35, 4.4, 0.15]];   // (+ the disc's radius)

export class Range {
  constructor(scene, world, audio, cross) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.onEvent = null; this.t = 0; this.pending = []; this.kills = 0; this.heads = 0; this.hits = 0; this.shots = 0; this.xp = 0;
    this.multi = { n: 0, t: -10 };
    const a = 340 * Math.PI / 180;
    const f = this.f = V3(Math.sin(a), 0, Math.cos(a)), r = this.r = V3(-f.z, 0, f.x);
    const at = (d, l) => { const x = cross.x + f.x * (9 + d) + r.x * l, z = cross.z + f.z * (9 + d) + r.z * l; return V3(x, world.groundHeight(x, z), z); };
    this.line = at(0, 0);
    this.center = at(18, 1);
    // (its lane mown, as a range's is: from behind the firing line to past the last plate, 7 m to each side)
    addMownGrass((x, z) => { const dx = x - this.line.x, dz = z - this.line.z, a = dx * f.x + dz * f.z; return a > -3 && a < 40 && Math.abs(dx * r.x + dz * r.z) < 7; });
    const g = this.group = new THREE.Group(); g.name = 'range'; scene.add(g);
    const olive = new THREE.MeshStandardMaterial({ color: 0x4d5a2a, roughness: 0.72 });
    const drab = new THREE.MeshStandardMaterial({ color: 0x3a4027, roughness: 0.55, metalness: 0.35 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9 });
    const steelBar = new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.45, metalness: 0.9 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.6, metalness: 0.1 });
    this.holeMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.splatMat = new THREE.MeshStandardMaterial({ map: splatTexture(), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const yaw = Math.atan2(-f.x, -f.z);                      // (each faces back up the lane, toward the firing line)
    const woodG = [], drabG = [];
    // the firing line: a beam on the grass across the lane
    const beam = new THREE.BoxGeometry(3.2, 0.08, 0.12);
    beam.applyMatrix4(new THREE.Matrix4().compose(V3(0, 0.04, 0), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw), V3(1, 1, 1)));
    beam.translate(this.line.x, this.line.y, this.line.z); woodG.push(beam);
    // the pop-ups
    const shape = new THREE.Shape();
    // (the outline: up the right side, over the head from where it meets the neck, down the left)
    shape.moveTo(-0.25, 0);
    for (const [x, y] of HALF) shape.lineTo(x, y);
    const th0 = Math.atan2((NECK - HEAD.y) / HEAD.ry, HALF[HALF.length - 1][0] / HEAD.rx);
    for (let k = 1; k < 24; k++) { const t = th0 + k / 24 * (Math.PI - 2 * th0); shape.lineTo(Math.cos(t) * HEAD.rx, HEAD.y + Math.sin(t) * HEAD.ry); }
    for (const [x, y] of [...HALF].reverse()) shape.lineTo(-x, y);
    const sil = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 4 });
    sil.translate(0, STEM, -0.006);
    const stem = new THREE.BoxGeometry(0.03, STEM + 0.02, 0.02); stem.translate(0, STEM / 2, 0);
    this.targets = [];
    POPUPS.forEach(([d, l], i) => {
      const base = at(d, l);
      const lifter = new THREE.BoxGeometry(0.46, LIFT_H, 0.3);
      lifter.applyMatrix4(new THREE.Matrix4().compose(V3(0, LIFT_H / 2, 0), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), yaw), V3(1, 1, 1)));
      lifter.translate(base.x, base.y, base.z); drabG.push(lifter);
      world.addStatic(new world.Box(base.x, base.z, 0.23, 0.15, yaw, base.y - 1, base.y + LIFT_H, 'pole'));            // (its steel: sparks)
      const body = world.addStatic(new world.Box(base.x, base.z, 0.26, 0.04, yaw, base.y, base.y + 1.35, 'range'));    // (you do not walk through it)
      const pivot = new THREE.Group(); pivot.position.set(base.x, base.y + LIFT_H, base.z); pivot.rotation.y = yaw; g.add(pivot);
      const arm = new THREE.Group(); pivot.add(arm);         // (turned about its x: down flat behind the lifter)
      const m = new THREE.Mesh(sil, olive); m.castShadow = true; m.receiveShadow = true; arm.add(m);
      const sm = new THREE.Mesh(stem, drab); sm.castShadow = true; arm.add(sm);
      const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.014, 0.014), this.holeMat, 40); holes.count = 0; holes.frustumCulled = false; holes.visible = false; arm.add(holes);
      this.targets.push({ kind: 'popup', n: i + 1, base, pivot, arm, holes, body, hi: 0, hp: 100, hitsOn: 0, state: 'up', ang: 0, av: 0, tDown: 0, mid: V3(0, STEM + 0.5, 0) });
    });
    // the plates
    PLATES.forEach(([d, l, R], i) => {
      const base = at(d, l), H = 1.2, CH = 0.22;
      for (const s of [-1, 1]) {
        const p = new THREE.BoxGeometry(0.09, H + 0.1, 0.09);
        p.applyMatrix4(new THREE.Matrix4().compose(V3(s * 0.42, (H + 0.1) / 2 - 0.05, 0), new THREE.Quaternion(), V3(1, 1, 1)));
        p.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); p.translate(base.x, base.y, base.z); woodG.push(p);
        const wx = base.x + r.x * s * 0.42, wz = base.z + r.z * s * 0.42;
        world.addStatic(new world.Box(wx, wz, 0.05, 0.05, 0, base.y - 1, base.y + H + 0.1, 'fence'));
      }
      const bar = new THREE.CylinderGeometry(0.02, 0.02, 0.92, 10); bar.rotateZ(Math.PI / 2); bar.translate(0, H, 0);
      bar.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)); bar.translate(base.x, base.y, base.z);
      const barM = new THREE.Mesh(bar, steelBar); barM.castShadow = true; g.add(barM);
      const pivot = new THREE.Group(); pivot.position.set(base.x, base.y + H, base.z); pivot.rotation.y = yaw; g.add(pivot);
      const arm = new THREE.Group(); pivot.add(arm);
      const disc = new THREE.CylinderGeometry(R, R, 0.0127, 40); disc.rotateX(Math.PI / 2); disc.translate(0, -CH - R, 0);
      const links = [];
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { const lk = new THREE.TorusGeometry(0.012, 0.0028, 4, 8); if (k & 1) lk.rotateY(Math.PI / 2); lk.translate(s * R * 0.6, -0.02 - k * (CH - 0.02) / 4.4, 0); links.push(lk); }
      const plate = new THREE.Mesh(disc, paint); plate.castShadow = true; plate.receiveShadow = true; arm.add(plate);
      const chain = new THREE.Mesh(mergeGeometries(links), steelBar); chain.castShadow = true; arm.add(chain);
      const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05), this.splatMat, 40); marks.count = 0; marks.frustumCulled = false; marks.visible = false; arm.add(marks);
      const L = CH + R, mass = 7850 * Math.PI * R * R * 0.0127;
      // (its swing about the bar: the disc's moment of inertia there, m (L^2 + R^2 / 4))
      this.targets.push({ kind: 'plate', n: i + 1, base, pivot, arm, holes: marks, hi: 0, R, L, mass, I: mass * (L * L + R * R / 4), ang: 0, av: 0, f0: 816 * (0.125 / R) ** 2, mid: V3(0, -CH - R, 0) });
    });
    for (const [geos, mat] of [[drabG, drab], [woodG, wood]]) { const ms = new THREE.Mesh(mergeGeometries(geos), mat); ms.castShadow = true; ms.receiveShadow = true; g.add(ms); }
    g.updateMatrixWorld(true);
  }

  // where a round's segment (a -> b, one step of its flight) first meets a target as it stands this frame:
  // { f (along the segment), p, n (the face it hit, toward the round), target, zone } | null
  segment(x0, y0, z0, x1, y1, z1) {
    let best = null;
    for (const tg of this.targets) {
      // (quick: the segment's distance from the target's middle)
      const c = _c.copy(tg.mid).applyMatrix4(tg.arm.matrixWorld), rr = tg.kind === 'popup' ? 0.7 : tg.R + 0.05;
      _a.set(x0, y0, z0); _b.set(x1, y1, z1); _d.subVectors(_b, _a);
      const L2 = _d.lengthSq(); if (L2 < 1e-9) continue;
      const u = Math.max(0, Math.min(1, _e.subVectors(c, _a).dot(_d) / L2));
      if (_e.copy(_a).addScaledVector(_d, u).distanceToSquared(c) > rr * rr) continue;
      // (into the target's own frame: its face the plane z = 0)
      _m.copy(tg.arm.matrixWorld).invert();
      _a.applyMatrix4(_m); _b.applyMatrix4(_m);
      const za = _a.z, zb = _b.z;
      if ((za > 0) === (zb > 0)) continue;
      const fz = za / (za - zb), x = _a.x + (_b.x - _a.x) * fz, y = _a.y + (_b.y - _a.y) * fz;
      let zone = null;
      if (tg.kind === 'popup') zone = inSilhouette(x, y - STEM);
      else if (Math.hypot(x, y - tg.mid.y) <= tg.R) zone = 'plate';
      if (!zone || (best && fz >= best.f)) continue;
      const n = V3(0, 0, za > 0 ? 1 : -1).transformDirection(tg.arm.matrixWorld);
      best = { f: fz, p: V3(x0 + (x1 - x0) * fz, y0 + (y1 - y0) * fz, z0 + (z1 - z0) * fz), n, target: tg, zone, local: V3(x, y, za > 0 ? 1 : -1) };
    }
    return best;
  }

  // a round fired (for the accuracy), on the range or near it
  near(p) { return Math.hypot(p.x - this.center.x, p.z - this.center.z) < 90; }
  shot(eye) { if (this.near(eye)) this.shots++; }
  // a round on a target: its effect when it gets there (the round's flight time, h.t), the hit marker with it
  hit(h, eye) { this.pending.push({ at: this.t + h.t, h, d: eye.distanceTo(h.p) }); }
  // the pistol swung into one (V: weapon.js): down at once
  blow(h, eye) { this.apply(h, eye.distanceTo(h.p), true); }

  apply(h, d, melee = false) {
    const tg = h.target;
    if (!melee) this.mark(tg, h.local);
    if (tg.kind === 'plate') {
      // (the round's push on the plate about its bar, at its distance below it: the momentum, all of it left in the
      // plate and a little more - the lead splashes back out)
      tg.av += (h.local.z > 0 ? 1 : -1) * 1.1 * M_ROUND * V_ROUND * Math.max(0.05, -h.local.y) / tg.I;
      this.audio?.gong?.(d, d / 343, tg.f0);
      if (!melee) this.hits++;
      this.emit({ type: 'hit', plate: true, d, target: tg });
      return;
    }
    if (tg.state !== 'up') return;
    if (!melee) { this.audio?.plasticHit?.(d, d / 343); this.hits++; }
    const head = h.zone === 'head';
    tg.hitsOn++;
    tg.hp -= melee || head ? 100 : 34;
    if (tg.hp > 0) { this.emit({ type: 'hit', d, target: tg }); return; }
    tg.state = 'down'; tg.av = 2; tg.ang = 0; tg.settled = false; tg.tDown = this.t; tg.dir = h.local.z > 0 || melee ? 1 : -1; tg.body.ghost = true;
    this.audio?.targetDown?.(d);
    this.kills++; if (head && !melee) this.heads++;
    const m = this.multi; m.n = this.t - m.t < 3 ? m.n + 1 : 1; m.t = this.t;
    this.emit({ type: 'kill', head: head && !melee, melee, d, first: tg.hitsOn === 1, multi: m.n, target: tg });
  }
  emit(e) {
    // the score, as the games add it: a kill 100, a head +50, from far (over ~22 m with a pistol) +50, two or more
    // within 3 s +50 to +100; the medal: the best of it
    const lines = [];
    let medal = null;
    if (e.type === 'kill') {
      lines.push(['ELIMINARE', 100]);
      if (e.melee) { lines.push(['CORP LA CORP', 50]); medal = 'CORP LA CORP'; }
      if (e.head) { lines.push(['LOVITURĂ ÎN CAP', 50]); medal = 'LOVITURĂ ÎN CAP'; }
      if (e.d >= 22 && !e.melee) { lines.push(['DE LA DISTANȚĂ', 50]); medal = 'DE LA DISTANȚĂ'; }
      if (e.first && !e.head && !e.melee) lines.push(['UN GLONȚ, O ELIMINARE', 50]);
      if (e.multi >= 2) { const nm = e.multi === 2 ? 'DUBLĂ ELIMINARE' : e.multi === 3 ? 'TRIPLĂ ELIMINARE' : e.multi + ' DINTR-O SUFLARE'; lines.push([nm, Math.min(100, 25 * e.multi)]); medal = nm; }
    }
    const pts = lines.reduce((s, l) => s + l[1], 0);
    this.xp += pts;
    this.onEvent?.({ ...e, lines, pts, medal, name: (e.target.kind === 'plate' ? 'Placa ' : 'Ținta ') + e.target.n });
  }
  mark(tg, l) {
    const i = tg.hi++ % 40;
    _q.identity(); if (l.z < 0) _q.setFromAxisAngle(V3(0, 1, 0), Math.PI);
    _q2.setFromAxisAngle(V3(0, 0, 1), Math.random() * 6.28); _q.multiply(_q2);
    const z = tg.kind === 'popup' ? 0.0062 : 0.0066, s = tg.kind === 'popup' ? 0.8 + Math.random() * 0.4 : 0.7 + Math.random() * 0.6;
    tg.holes.setMatrixAt(i, _m.compose(_c.set(l.x, l.y, l.z > 0 ? z : -z), _q, _e.set(s, s, s)));
    tg.holes.count = Math.min(40, Math.max(tg.holes.count, i + 1)); tg.holes.instanceMatrix.needsUpdate = true; tg.holes.visible = true;
  }

  update(dt, cam) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) { const p = this.pending[i]; if (this.t >= p.at) { this.pending.splice(i, 1); this.apply(p.h, p.d); } }
    // (only near: from further off the lane is not drawn at all - nothing of it would show)
    const near = !cam || cam.position.distanceTo(this.center) < 400;
    this.group.visible = near;
    for (const tg of this.targets) {
      if (tg.kind === 'plate') {
        if (Math.abs(tg.ang) < 1e-5 && Math.abs(tg.av) < 1e-5) continue;
        // (a pendulum on its chains: m g L / I, damped by the chains' links and the air)
        const w2 = tg.mass * G * tg.L / tg.I, n = Math.ceil(dt / 0.004);
        for (let k = 0; k < n; k++) { const h = dt / n; tg.av += (-w2 * Math.sin(tg.ang) - 0.9 * tg.av) * h; tg.ang += tg.av * h; }
        tg.arm.rotation.x = tg.ang;
      } else {
        if (tg.state === 'down') {
          // (let go by its lifter, falling back about its pivot: a board ~1.1 m tall on its edge, 3 g / 2 h sin a, ~0.4 s
          // to the flat; a bounce or two)
          if (!tg.settled) {
            tg.av += 1.5 * G / 1.1 * Math.sin(tg.ang) * dt; tg.ang += tg.av * dt;
            if (tg.ang >= Math.PI / 2 && tg.av > 0) { tg.ang = Math.PI / 2; if (tg.av < 1) { tg.av = 0; tg.settled = true; } else tg.av *= -0.25; }
          }
          tg.arm.rotation.x = -tg.dir * tg.ang;
          if (this.t - tg.tDown > 3.5) { tg.state = 'rising'; tg.tUp = this.t; if (near) this.audio?.targetUp?.(cam ? cam.position.distanceTo(tg.base) : 30); }
        } else if (tg.state === 'rising') {
          const u = Math.min(1, (this.t - tg.tUp) / 0.8), s = u * u * (3 - 2 * u);
          tg.arm.rotation.x = -tg.dir * Math.PI / 2 * (1 - s);
          if (u >= 1) { tg.state = 'up'; tg.hp = 100; tg.hitsOn = 0; tg.ang = 0; tg.av = 0; tg.arm.rotation.x = 0; tg.body.ghost = false; }
        }
      }
    }
    this.group.updateMatrixWorld(true);
  }
}

// is (x, y) - the silhouette's frame, from its base - on it: 'head' | 'body' | null
function inSilhouette(x, y) {
  if (y < 0) return null;
  const ax = Math.abs(x);
  if (y >= NECK) { const dx = ax / HEAD.rx, dy = (y - HEAD.y) / HEAD.ry; return dx * dx + dy * dy <= 1 ? 'head' : null; }
  for (let i = 0; i < HALF.length - 1; i++) {
    const [x0, y0] = HALF[i], [x1, y1] = HALF[i + 1];
    if (y <= y1) return ax <= (y1 > y0 ? x0 + (x1 - x0) * (y - y0) / (y1 - y0) : Math.max(x0, x1)) ? (y >= HEADZ ? 'head' : 'body') : null;
  }
  return null;
}
// a round's hole through the plastic: dark, its rim lighter (stressed plastic); a lead splash on painted steel
function holeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  rg.addColorStop(0, 'rgba(8,8,6,1)'); rg.addColorStop(0.42, 'rgba(14,14,10,1)'); rg.addColorStop(0.55, 'rgba(150,160,120,0.9)'); rg.addColorStop(0.75, 'rgba(110,120,80,0.35)'); rg.addColorStop(1, 'rgba(90,100,60,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + Math.random() * 0.3, l = 10 + Math.random() * 18;
    g.strokeStyle = 'rgba(120,122,126,0.85)'; g.lineWidth = 1.5 + Math.random() * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
  }
  const rg = g.createRadialGradient(0, 0, 1, 0, 0, 12);
  rg.addColorStop(0, 'rgba(70,72,76,1)'); rg.addColorStop(0.5, 'rgba(110,112,116,0.95)'); rg.addColorStop(1, 'rgba(140,142,146,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
