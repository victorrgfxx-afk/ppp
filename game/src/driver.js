import * as THREE from 'three';
import { surfTex } from './interior.js';
import { prepareHands, gripHands, handWrists, skinMaterial, prepareArms, gripArms } from './hand.js';
import { REST } from './armgeo.js';

// You at the wheel (V74): the body of whoever drives the car you are in, built on its package (interior.js: the eyes,
// the seat's H-point, the wheel, the pedals) with an adult's lengths (shoulder to elbow 0.31 m, elbow to wrist
// 0.29, hip to knee 0.46, knee to ankle 0.45, the shoulders 0.38 apart).
//  * The hands hold the rim a little above the spokes (the "9 and 3" grip, raised clear of the spokes' roots: sculpted
//    round it, hand.js) and turn with it up to ~60 degrees each way; past that they slide on the rim, as hands on a
//    wheel do (push-pull).
//  * The arms reach them from the shoulders, the elbows bending down and out (two-bone inverse kinematics), every frame:
//    a muscular man's arms in a T-shirt (armgeo.js), skinned to five bones each - the upper arm, and the forearm four
//    times, turned a third more each toward the wrist, so the forearm turns from the elbow (as it is sculpted, palm up)
//    to the hand's wrist (the radius rolling round the ulna) without wringing.
//  * The legs from the hips to the feet: the right on the accelerator, the left beside the pedals, the knees by the
//    same kinematics; the torso between the shoulders and the hips.
//  * The head and neck only where the camera is not in them (the view from behind the car).
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0), _a = V3(), _b = V3(), _c = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _x = V3(), _f = V3(), _y = V3(), _z = V3(), _y2 = V3(), _bk = V3(), _ty = V3(), _tz = V3(), _tq = new THREE.Quaternion();
// the arm's bones as sculpted (armgeo.js), inverted: what each bone's frame now is applied to
export const INV = [REST.upper, REST.fore, REST.fore, REST.fore, REST.fore].map(r => new THREE.Matrix4().makeBasis(V3(...r.x), V3(...r.y), V3(...r.z)).setPosition(...r.o).invert());
export const ARM = [0.31, 0.29];
const LEG = [0.46, 0.45], SLIDE = 1.05;

// the middle joint of a two-bone limb from root to tip, bent toward pole (the tip pulled in if out of reach)
export function ik(root, tip, [a, b], pole, outMid, outTip) {
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

export class Driver {
  constructor() {
    this.v = null; this.g = null;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.noWet = true; m.envMapIntensity = 0.55; return m; };
    this.M = {
      shirt: mk({ color: 0x2c3038, roughness: 0.92, map: surfTex('fabric') }),
      jeans: mk({ color: 0x3a4a68, roughness: 0.92, map: surfTex('fabric') }),
      skin: mk({ color: 0xc8957c, roughness: 0.55 }),
      shoes: mk({ color: 0x1b1b1c, roughness: 0.5, map: surfTex('leather') }),
      hair: mk({ color: 0x2a2018, roughness: 0.85 }),
      hand: skinMaterial(),
      arm: skinMaterial(true),
    };
  }
  // the car you drive (null: none)
  attach(v) {
    if (v === this.v) return;
    if (this.g) { this.g.parent?.remove(this.g); this.g.traverse(o => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); }); }
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
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, chest.distanceTo(pelvis), 6, 18), M.shirt);
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
    // the arms (placed every frame; plain tubes until the sculpted ones are made: hand.js, off the main thread)
    this.arms = [0, 1].map(() => ({ up: tube(0.05, 0.044, M.shirt), fore: tube(0.043, 0.037, M.shirt), sb: ball(0.055, M.shirt), eb: ball(0.045, M.shirt) }));
    for (const a of this.arms) g.add(a.up, a.fore, a.sb, a.eb);
    this.limbs = null;
    prepareArms();
    // the hands (hand.js: made once per rim, off the main thread), each in the wheel's frame, placed by its turn; the
    // forearms reach where the hands' wrists go into them
    this.wrists = handWrists(pk.R, pk.tube).reverse();
    this.hands = null;
    prepareHands(pk.tube);
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
    if (!this.hands) {
      const h = gripHands(pk.R, pk.tube);
      if (h) this.hands = [h.left, h.right].map(geo => {
        const m = new THREE.Mesh(geo, this.M.hand); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
        this.g.add(m);
        return m;
      });
    }
    if (!this.limbs) {
      const ag = gripArms();
      if (ag) {
        this.limbs = [ag.left, ag.right].map(geo => {
          const bones = INV.map(() => new THREE.Bone()), m = new THREE.SkinnedMesh(geo, this.M.arm);
          // (the bones' frames set here in the driver's frame, the mesh's own, every frame: detached from the scene)
          m.bindMode = THREE.DetachedBindMode; m.bind(new THREE.Skeleton(bones, INV.map(x => x.clone())), new THREE.Matrix4());
          m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
          this.g.add(m);
          return bones;
        });
        for (const a of this.arms) a.up.visible = a.fore.visible = a.sb.visible = a.eb.visible = false;
      }
    }
    const wrist = V3(), elbow = V3(), tip = V3(), end = V3();
    for (let i = 0; i < 2; i++) {
      if (this.hands) { this.hands[i].matrix.copy(_m); this.hands[i].matrixWorldNeedsUpdate = true; }
      wrist.copy(this.wrists[i].at).applyMatrix4(_m);
      const a = this.arms[i], S = this.sh[i], sg = i ? 1 : -1;
      ik(S, wrist, ARM, V3(sg * 0.55, -1, 0.15).normalize(), elbow, tip);
      // (the sleeve over the wrist's forearm, to a centimetre short of the wrist bones: the skin shows past it)
      end.subVectors(tip, elbow).setLength(0.012).add(tip);
      place(a.up, S, elbow); place(a.fore, elbow, end);
      at(a.sb, S); at(a.eb, elbow);
      if (this.limbs) this.pose(this.limbs[i], S, elbow, tip, this.wrists[i].back);
    }
  }
  // (the back of the hand's wrist as sculpted, from the wheel's frame)
  pose(B, S, E, W, back) { poseArm(B, S, E, W, _bw.copy(back).transformDirection(_m)); }
}
const _bw = V3();
// an arm's bones (in the frame of S, E, W): the upper arm from the shoulder (its front: the way the elbow bends), the
// forearm from the elbow, turned toward the back of the hand's wrist (bk, the same frame) a third more at each of its
// bones (the pistol's arms too: weapon.js)
export function poseArm(B, S, E, W, bk) {
  _x.subVectors(E, S).normalize(); _f.subVectors(W, E).normalize();
  _y.copy(_f).addScaledVector(_x, -_f.dot(_x));
  if (_y.lengthSq() < 1e-8) _y.set(0, -1, 0).addScaledVector(_x, _x.y);
  _y.normalize(); _z.crossVectors(_x, _y);
  B[0].matrixWorld.makeBasis(_x, _y, _z).setPosition(S);
  _y2.crossVectors(_z, _f);
  // (the wrist's back as sculpted: the forearm's back, -y; as the hand has it)
  _bk.copy(bk);
  _bk.addScaledVector(_f, -_bk.dot(_f)).normalize();
  _ty.copy(_y2).negate();
  const tau = Math.atan2(_c.crossVectors(_ty, _bk).dot(_f), _ty.dot(_bk));
  for (let k = 0; k < 4; k++) {
    _tq.setFromAxisAngle(_f, tau * k / 3);
    _ty.copy(_y2).applyQuaternion(_tq); _tz.copy(_z).applyQuaternion(_tq);
    B[1 + k].matrixWorld.makeBasis(_f, _ty, _tz).setPosition(E);
  }
}
