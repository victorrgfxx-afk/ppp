import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surfTex } from './interior.js';

// You at the wheel (V74): the body of whoever drives the car you are in, built on its package (interior.js: the eyes,
// the seat's H-point, the wheel, the pedals) with an adult's lengths (shoulder to elbow 0.31 m, elbow to wrist
// 0.29, hip to knee 0.46, knee to ankle 0.45, the shoulders 0.38 apart).
//  * The hands hold the rim a little above the spokes (the "9 and 3" grip, raised clear of the spokes' roots) and turn
//    with it up to ~60 degrees each way; past that they slide on the rim, as hands on a wheel do (push-pull).
//  * The arms reach them from the shoulders, the elbows bending down and out (two-bone inverse kinematics), every frame.
//  * The legs from the hips to the feet: the right on the accelerator, the left beside the pedals, the knees by the
//    same kinematics; the torso between the shoulders and the hips.
//  * The head and neck only where the camera is not in them (the view from behind the car).
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0), _a = V3(), _b = V3(), _c = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const ARM = [0.31, 0.29], LEG = [0.46, 0.45], GRIP = 0.28, SLIDE = 1.05;

// the middle joint of a two-bone limb from root to tip, bent toward pole (the tip pulled in if out of reach)
function ik(root, tip, [a, b], pole, outMid, outTip) {
  const d0 = _a.subVectors(tip, root).length(), dir = _a.divideScalar(d0 || 1);
  const d = Math.min(d0, a + b - 1e-3), ca = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const perp = _b.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  outMid.copy(root).addScaledVector(dir, a * ca).addScaledVector(perp, a * Math.sqrt(1 - ca * ca));
  outTip.copy(root).addScaledVector(dir, d);
}
// a mesh stretched between two points: a tapered tube with its joints rounded (unit length along y, scaled)
function tube(r0, r1, mat) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, 16, 1, true); g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
  return m;
}
function place(m, a, b) {
  const d = _c.subVectors(b, a), len = d.length();
  _q.setFromUnitVectors(UP, d.divideScalar(len || 1));
  m.matrix.compose(a, _q, _a.set(1, len, 1));
  m.matrixWorldNeedsUpdate = true;
}
function ball(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
  return m;
}
const at = (m, p) => { m.matrix.makeTranslation(p.x, p.y, p.z); m.matrixWorldNeedsUpdate = true; };

// a hand around the rim at angle phi (the wheel's frame: the rim in its xy plane, +z toward the driver), as a hand
// holds a pole: the back of the hand on the rim's outer side, the knuckles at its front-outer edge, the four fingers
// curled round its front to the inner side, the thumb across its driver's side; the wrist toward the driver
function handGeometry(R, tubeR, phi) {
  const c = Math.cos(phi), s = Math.sin(phi), P = V3(R * c, R * s, 0);
  const e1 = V3(c, s, 0), e2 = V3(0, 0, 1), ax = V3().crossVectors(e1, e2);                         // out, to the driver
  const up = V3(-s, c, 0).multiplyScalar(c < 0 ? -1 : 1);                                             // (along the rim, to its top)
  const parts = [], basis = (x, y, z, p) => new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
  const ring = tubeR + 0.0105, kA = -0.55;                                                            // (the knuckles' angle round the tube)
  const at = (a, r = ring) => P.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a));
  [[-0.031, 0.0088, 0.97], [-0.011, 0.0099, 1], [0.009, 0.0099, 1], [0.028, 0.0091, 0.94]].forEach(([o, r, k]) => {
    // (each finger from its knuckle round the front to its tip on the inner side, toward the driver)
    const arc = 2.5 * k, g = new THREE.TorusGeometry(ring, r, 8, 14, arc);
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(kA - arc));
    g.applyMatrix4(basis(e1, e2, ax, P.clone().addScaledVector(up, o)));
    parts.push(g);
  });
  // the knuckles: a row along the rim; the back of the hand from them to the wrist, on the outer side
  const K = at(kA), h = e1.clone().multiplyScalar(0.62).addScaledVector(e2, 0.78).normalize();
  const kn = new THREE.CapsuleGeometry(0.0125, 0.06, 4, 10);
  kn.applyMatrix4(new THREE.Matrix4().compose(K, new THREE.Quaternion().setFromUnitVectors(UP, up), V3(1, 1, 1)));
  parts.push(kn);
  let nb = V3().crossVectors(up, h).normalize();
  if (nb.dot(e1) < 0) nb.negate();
  const plate = new RoundedBoxGeometry(0.08, 0.026, 0.088, 3, 0.012);
  // (x along the rim, y out of the back of the hand, z to the wrist)
  const zx = V3().crossVectors(up, nb);
  plate.applyMatrix4(basis(up, nb, zx.dot(h) < 0 ? zx.negate() : zx, K.clone().addScaledVector(h, 0.042).addScaledVector(nb, -0.004)));
  parts.push(plate);
  // the thumb: from the palm's root near the wrist across the rim's driver side to its inner side
  const t0 = K.clone().addScaledVector(h, 0.07).addScaledVector(nb, -0.016).addScaledVector(up, -0.022);
  const t1 = P.clone().addScaledVector(e2, tubeR + 0.007).addScaledVector(e1, -0.012).addScaledVector(up, 0.012);
  const thumb = new THREE.CapsuleGeometry(0.0105, t0.distanceTo(t1), 4, 10);
  thumb.applyMatrix4(new THREE.Matrix4().compose(t0.clone().lerp(t1, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, t1.clone().sub(t0).normalize()), V3(1, 1, 1)));
  parts.push(thumb);
  const wrist = K.clone().addScaledVector(h, 0.095);
  return { parts, wrist };
}

export class Driver {
  constructor() {
    this.v = null; this.g = null;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.noWet = true; m.envMapIntensity = 0.55; return m; };
    this.M = {
      jacket: mk({ color: 0x2b3038, roughness: 0.9, map: surfTex('fabric') }),
      jeans: mk({ color: 0x3a4a68, roughness: 0.92, map: surfTex('fabric') }),
      skin: mk({ color: 0xc8957c, roughness: 0.55 }),
      shoes: mk({ color: 0x1b1b1c, roughness: 0.5, map: surfTex('leather') }),
      hair: mk({ color: 0x2a2018, roughness: 0.85 }),
    };
  }
  // the car you drive (null: none)
  attach(v) {
    if (v === this.v) return;
    if (this.g) { this.g.parent?.remove(this.g); this.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    this.g = null; this.v = v;
    const pk = v?.car.cabin?.pkg;
    if (!pk) return;
    const M = this.M, g = this.g = new THREE.Group(), E = pk.eye, sx = E.x;
    g.userData.ueSkip = 'driver';
    // the shoulders, the hips
    this.sh = [-1, 1].map(sg => V3(sx + sg * 0.19, E.y - 0.21, E.z + 0.06));
    const hips = [-1, 1].map(sg => V3(pk.hip.x + sg * 0.09, pk.hip.y, pk.hip.z));
    // the torso: a rounded trunk from the chest to the pelvis
    // (its top stays under the shoulders and behind the eyes: in view only looking down)
    const chest = V3(sx, E.y - 0.3, E.z + 0.14), pelvis = V3(sx, pk.hip.y + 0.1, pk.hip.z + 0.03);
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, chest.distanceTo(pelvis), 6, 18), M.jacket);
    trunk.applyMatrix4(new THREE.Matrix4().compose(chest.clone().lerp(pelvis, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, chest.clone().sub(pelvis).normalize()), V3(1.32, 1, 0.82)));
    g.add(trunk);
    // the legs: the right foot on the accelerator, the left beside the pedals, knees by the kinematics
    const knee = V3(), ank = V3();
    [[0, pk.restX, pk.pedalZ + 0.24, -1], [1, pk.accX, pk.pedalZ + 0.17, 1]].forEach(([i, x, z, sg]) => {
      const target = V3(x, pk.floor + 0.1, z);
      ik(hips[i], target, LEG, V3(sg * 0.15, 1, -0.45).normalize(), knee, ank);
      const thigh = tube(0.078, 0.06, M.jeans); place(thigh, hips[i], knee); g.add(thigh);
      const shin = tube(0.054, 0.042, M.jeans); place(shin, knee, ank); g.add(shin);
      const kb = ball(0.06, M.jeans); at(kb, knee); g.add(kb);
      const hb = ball(0.078, M.jeans); at(hb, hips[i]); g.add(hb);
      // the shoe: its heel on the floor, its sole up to the pedal's pad (the right) or flat (the left)
      const toe = i === 1 ? V3(x, pk.floor + 0.2, pk.pedalZ - 0.02) : V3(x - 0.02, pk.floor + 0.04, pk.pedalZ + 0.02);
      const heel = V3(x, pk.floor + 0.04, ank.z + 0.04), mid = heel.clone().lerp(toe, 0.5), dir = toe.clone().sub(heel).normalize();
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, heel.distanceTo(toe) - 0.03, 4, 12), M.shoes);
      shoe.applyMatrix4(new THREE.Matrix4().compose(mid.add(V3(0, 0.02, 0)), new THREE.Quaternion().setFromUnitVectors(UP, dir), V3(1.15, 1, 0.75)));
      shoe.castShadow = true; g.add(shoe);
      const ab = ball(0.045, M.jeans); at(ab, ank); g.add(ab);
    });
    // the head and neck (hidden from the driver's own eyes)
    const head = new THREE.Group(); head.name = 'head';
    const hc = V3(sx, E.y + 0.03, E.z + 0.075);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.skin); skull.scale.set(0.076, 0.105, 0.096); skull.position.copy(hc);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair); hair.scale.set(0.081, 0.11, 0.101); hair.position.copy(hc).add(V3(0, 0.01, 0.006));
    const neck = tube(0.052, 0.05, M.skin); place(neck, V3(sx, E.y - 0.2, E.z + 0.1), V3(sx, E.y - 0.04, E.z + 0.085));
    head.add(skull, hair, neck); g.add(head); this.head = head;
    // the arms (placed every frame)
    this.arms = [0, 1].map(() => ({ up: tube(0.05, 0.044, M.jacket), fore: tube(0.043, 0.036, M.jacket), cuff: tube(0.026, 0.024, M.skin),
      sb: ball(0.055, M.jacket), eb: ball(0.045, M.jacket), hand: null, angle: null }));
    for (const a of this.arms) g.add(a.up, a.fore, a.cuff, a.sb, a.eb);
    // the hands: one geometry per hand in the wheel's frame (their wrists with them), placed by the wheel's turn
    this.hands = [Math.PI - GRIP, GRIP].map(phi => {
      const { parts, wrist } = handGeometry(pk.R, pk.tube, phi);
      const m = new THREE.Mesh(mergeAll(parts), M.skin); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      return { m, wrist };
    });
    v.car.cabin.group.add(g);
    this.pk = pk;
  }
  // every frame: the hands on the wheel as it turns, the arms to them; head: whether the head shows
  update(head) {
    if (!this.g) return;
    this.head.visible = head;
    const pk = this.pk, turn = this.v.car.steer.rotation.z;
    const w = THREE.MathUtils.clamp(turn, -SLIDE, SLIDE);
    _m.compose(pk.wheelAt, _q.setFromEuler(new THREE.Euler(-pk.tilt, 0, w)), _a.set(1, 1, 1));
    const wrist = V3(), elbow = V3(), tip = V3();
    this.hands.forEach((h, i) => {
      h.m.matrix.copy(_m); h.m.matrixWorldNeedsUpdate = true;
      wrist.copy(h.wrist).applyMatrix4(_m);
      const a = this.arms[i], S = this.sh[i], sg = i ? 1 : -1;
      ik(S, wrist, ARM, V3(sg * 0.55, -1, 0.15).normalize(), elbow, tip);
      // (the sleeve ends 3 cm short of the wrist: the wrist's skin shows)
      const cuffAt = tip.clone().lerp(elbow, 0.12);
      place(a.up, S, elbow); place(a.fore, elbow, cuffAt); place(a.cuff, cuffAt, tip);
      at(a.sb, S); at(a.eb, elbow);
    });
  }
}
function mergeAll(geos) {
  // (the hand's pieces as one geometry: positions and normals, no index)
  const P = [], N = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
