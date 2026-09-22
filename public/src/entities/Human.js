/* Simple articulated figures for the two people visible in the photos: the man
   working at the Octavia's tailgate and the man in a cap by the Astra. */
import * as THREE from 'three';
import { mergeByMaterial } from '../world/Optimize.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function buildHuman(mats, o = {}) {
  const {
    shirt = 0x8d9296, trousers = 0x2b3239, skin = 0xc09171,
    hair = 0x9b9995, cap = null, height = 1.76, vest = false,
  } = o;
  const g = new THREE.Group();
  const s = height / 1.76;
  const shirtM = mats.plain(shirt, { roughness: 0.88 });
  const trM = mats.plain(trousers, { roughness: 0.9 });
  const skinM = mats.plain(skin, { roughness: 0.78 });

  // hips carry the legs; the chest is a separate pivot so bending forward to
  // work in a car boot does not swing the legs out from under the figure
  const hips = new THREE.Group(); hips.position.y = 0.92 * s; g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);
  const torso = new THREE.Mesh(box(0.40 * s, 0.56 * s, 0.22 * s), shirtM);
  torso.position.y = 0.28 * s; torso.castShadow = true; chest.add(torso);
  if (vest) {
    const v = new THREE.Mesh(box(0.42 * s, 0.40 * s, 0.24 * s), mats.plain(0xd6ec1c, { roughness: 0.7 }));
    v.position.y = 0.30 * s; chest.add(v);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.06 * s, 0.09 * s, 8), skinM);
  neck.position.y = 0.60 * s; chest.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.108 * s, 14, 12), skinM);
  head.scale.set(0.92, 1.12, 1.0);
  head.position.y = 0.72 * s; head.castShadow = true; chest.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.112 * s, 14, 10, 0, 6.3, 0, 1.5),
    mats.plain(cap ? cap : hair, { roughness: 0.85 }));
  hairM.position.y = 0.735 * s; chest.add(hairM);
  if (cap) {
    const peak = new THREE.Mesh(box(0.20 * s, 0.02 * s, 0.11 * s), mats.plain(cap, { roughness: 0.85 }));
    peak.position.set(0, 0.705 * s, 0.11 * s); chest.add(peak);
  }

  const limbs = { arms: [], legs: [] };
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235 * s, 0.53 * s, 0);
    const upper = new THREE.Mesh(box(0.095 * s, 0.30 * s, 0.10 * s), shirtM);
    upper.position.y = -0.15 * s; upper.castShadow = true; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.30 * s; shoulder.add(elbow);
    const fore = new THREE.Mesh(box(0.085 * s, 0.27 * s, 0.09 * s), skinM);
    fore.position.y = -0.135 * s; elbow.add(fore);
    chest.add(shoulder);
    limbs.arms.push({ shoulder, elbow, side });

    const hip = new THREE.Group();
    hip.position.set(side * 0.10 * s, 0, 0);
    const thigh = new THREE.Mesh(box(0.125 * s, 0.42 * s, 0.13 * s), trM);
    thigh.position.y = -0.21 * s; thigh.castShadow = true; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42 * s; hip.add(knee);
    const shin = new THREE.Mesh(box(0.11 * s, 0.42 * s, 0.115 * s), trM);
    shin.position.y = -0.21 * s; knee.add(shin);
    const foot = new THREE.Mesh(box(0.11 * s, 0.07 * s, 0.24 * s), mats.plain(0x17191c, { roughness: 0.9 }));
    foot.position.set(0, -0.42 * s, 0.05 * s); knee.add(foot);
    hips.add(hip);
    limbs.legs.push({ hip, knee, side });
  }
  // each limb segment is rigid, so batch inside it
  for (const a of limbs.arms) { mergeByMaterial(a.elbow); }
  for (const l of limbs.legs) { mergeByMaterial(l.knee); }
  g.userData = { limbs, hips, chest, scale: s };
  return g;
}

export class Npc {
  /** mode: 'work' (leaning into a boot), 'stand', 'walk' */
  constructor(mats, o) {
    this.mesh = buildHuman(mats, o);
    this.mesh.position.set(o.x, 0, o.z);
    this.mesh.rotation.y = THREE.MathUtils.degToRad(180 - (o.yaw || 0));
    this.mode = o.mode || 'stand';
    this.t = Math.random() * 10;
    this.seed = Math.random();
    this.mesh.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }

  update(dt) {
    this.t += dt;
    const u = this.mesh.userData;
    const [aL, aR] = u.limbs.arms;
    const [lL, lR] = u.limbs.legs;
    if (this.mode === 'work') {
      u.chest.rotation.x = 0.55 + Math.sin(this.t * 1.6) * 0.07;
      const reach = Math.sin(this.t * 2.1) * 0.35;
      aL.shoulder.rotation.x = -1.15 + reach;
      aR.shoulder.rotation.x = -1.05 - reach * 0.6;
      aL.elbow.rotation.x = -0.9 - reach * 0.5;
      aR.elbow.rotation.x = -1.1 + reach * 0.4;
      lL.hip.rotation.x = -0.1; lR.hip.rotation.x = 0.12;
      lL.knee.rotation.x = 0.16; lR.knee.rotation.x = 0.1;
    } else if (this.mode === 'walk') {
      const p = this.t * 3.1;
      u.chest.rotation.x = 0.06;
      u.hips.position.y = (0.92 + Math.abs(Math.sin(p)) * 0.025) * u.scale;
      lL.hip.rotation.x = Math.sin(p) * 0.6;
      lR.hip.rotation.x = -Math.sin(p) * 0.6;
      lL.knee.rotation.x = Math.max(0, -Math.sin(p)) * 0.8;
      lR.knee.rotation.x = Math.max(0, Math.sin(p)) * 0.8;
      aL.shoulder.rotation.x = -Math.sin(p) * 0.45;
      aR.shoulder.rotation.x = Math.sin(p) * 0.45;
      aL.elbow.rotation.x = -0.25; aR.elbow.rotation.x = -0.25;
    } else {
      const sway = Math.sin(this.t * 0.9 + this.seed * 6) * 0.03;
      u.chest.rotation.y = sway;
      u.chest.rotation.x = 0.03;
      aL.shoulder.rotation.x = -0.12 + sway; aR.shoulder.rotation.x = -0.12 - sway;
      aL.elbow.rotation.x = -0.3; aR.elbow.rotation.x = -0.35;
      lL.hip.rotation.x = 0.02; lR.hip.rotation.x = -0.02;
    }
  }
}

export const NPCS = [
  { id: 'mecanic', x: 20.3, z: -46.4, yaw: 180, mode: 'work',
    shirt: 0x8d9296, trousers: 0x33393f, hair: 0xb9b7b2, height: 1.74,
    label: 'mecanicul de la Octavia' },
  { id: 'clientul', x: -24.3, z: -20.5, yaw: 250, mode: 'stand',
    shirt: 0x2f3a46, trousers: 0x23272c, cap: 0x2b3641, height: 1.72,
    label: 'omul cu șapcă de lângă Astra' },
];
