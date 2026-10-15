import * as THREE from 'three';
import { mergeByMaterial } from './cars.js';

// A utility 4x4 ATV (quad), parked on the hill of the cross: the size and layout of the 500 cc class (CFMoto CForce
// 520: 2.12 m long, 1.18 m wide, 1.29 m between the axles, the seat 0.87 m high, 25" tyres on 12" wheels, ~360 kg):
// a tubular frame, the plastic fenders over the wheels, the steel racks front and rear, the bumper with its winch, the
// headlights in the nose and on the handlebar pod, the tank and console under the bars, the seat, the floorboards,
// double wishbones and coil-over shocks at every wheel, knobby tyres (chevron lugs), hand guards for the cold; and its
// rider (helmet, winter jacket), seen when the camera follows from outside.
// The same interface as a car (cars.js buildCar), with its model's extras for the Vehicle (vehicle.js): seat (where the
// rider's eyes are), steerRatio (the bars turn as the wheels), snowGrip (knobby tyres and 4x4: the snow takes less of
// the grip away), float (wide light tyres: the deep snow holds them back less), offroad (the slope pulls it back).
// Local frame: forward -Z, right +X, origin on the ground under the middle.
export const ATV_MODEL = {
  name: 'ATV 4x4 (500 cc)', L: 2.15, W: 1.18, axles: [0.4, 1.69], r: 0.3175, tireW: 0.23,
  pillars: [1.0, 1.6], belt: [[0, 0.9], [2.15, 0.9]], seat: { z: 0.04, eye: 1.58 }, steerRatio: 1.15,
  snowGrip: 0.45, float: 0.35, offroad: true, chase: [4.3, 1.15], headY: 0.72, roofH: 1.12, atv: true,
};

const pose = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// a tube from a to b (radius r)
function tube(list, mat, a, b, r = 0.016, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  list.push([g, mat]);
}
// a polyline of tubes with rounded joints
function rail(list, mat, pts, r = 0.016) {
  for (let i = 0; i < pts.length - 1; i++) tube(list, mat, pts[i], pts[i + 1], r);
  for (const p of pts) { const s = new THREE.SphereGeometry(r * 1.05, 8, 6); s.translate(...p); list.push([s, mat]); }
}
// a side profile (y, z pairs) extruded across x from x0 to x1, its edges bevelled
function slab(list, mat, prof, x0, x1, bevel = 0.012) {
  const s = new THREE.Shape(prof.map(([y, z]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, x1 - x0 - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bevel, 0, 0);
  list.push([g, mat]);
}
// the arc of a fender over a wheel (centre y, z), radius r, from angle a0 to a1 (0 = forward, pi/2 = up), thickness t
function fender(list, mat, yc, zc, r, a0, a1, t, x0, x1) {
  const prof = [];
  const n = 14;
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; prof.push([yc + Math.sin(a) * (r + t), zc - Math.cos(a) * (r + t)]); }
  for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; prof.push([yc + Math.sin(a) * r, zc - Math.cos(a) * r]); }
  slab(list, mat, prof, x0, x1, 0.008);
}
// a coil spring from a to b (radius R, n turns) round a damper body
function coilover(list, spring, body, a, b, R = 0.035, turns = 7) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const pts = [];
  for (let k = 0; k <= turns * 12; k++) { const t = k / (turns * 12), a2 = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a2) * R, 0.06 * L + t * 0.8 * L, Math.sin(a2) * R)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.006, 5, false);
  g.applyQuaternion(q); g.translate(A.x, A.y, A.z);
  list.push([g, spring]);
  tube(list, body, a, [A.x + d.x * 0.62, A.y + d.y * 0.62, A.z + d.z * 0.62], R * 0.55, 10);
  tube(list, body, [A.x + d.x * 0.5, A.y + d.y * 0.5, A.z + d.z * 0.5], b, R * 0.28, 8);
}

// a knobby tyre: the carcass, rounded at the shoulders, with chevron lugs in two rows round it (axis along x)
function knobbyTyre(r, w) {
  const parts = [];
  const core = new THREE.CylinderGeometry(r - 0.025, r - 0.025, w, 32, 1, true);
  const p = core.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i));
    if (rr > 0.1) { const k = 1 - 0.09 * Math.pow(Math.abs(y) / (w / 2), 3); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  }
  core.computeVertexNormals();
  core.rotateZ(Math.PI / 2);
  parts.push(core);
  // the sidewalls: from the shoulder down to the bead on the 12" wheel, bulging a little
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6, rr = r * 0.6 + (r * 0.91 - r * 0.6) * t; pts.push(new THREE.Vector2(rr, sd * (w * 0.4 + w * 0.08 * Math.sin(t * Math.PI)))); }
    const sw = new THREE.LatheGeometry(pts, 32); sw.rotateZ(Math.PI / 2);
    parts.push(sw);
  }
  const nL = 22;
  for (let k = 0; k < nL; k++) for (const side of [-1, 1]) {
    const a = (k + (side > 0 ? 0.5 : 0)) / nL * Math.PI * 2;
    const lug = new THREE.BoxGeometry(w * 0.42, 0.028, 0.06);
    lug.rotateY(side * 0.5);
    lug.translate(side * w * 0.24, r - 0.018, 0);
    lug.rotateX(a);
    parts.push(lug);
  }
  return parts;
}

export function buildATV(paintHex = 0xa3201a) {
  const m = ATV_MODEL;
  const group = new THREE.Group(), bodyPivot = new THREE.Group();
  group.add(bodyPivot);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const MAT = {
    paint: new THREE.MeshPhysicalMaterial({ color: paintHex, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    black: std({ color: 0x141415, roughness: 0.62 }),
    grain: std({ color: 0x19191a, roughness: 0.85 }),
    frame: std({ color: 0x1b1c1d, roughness: 0.42, metalness: 0.55 }),
    seat: std({ color: 0x0f0f10, roughness: 0.5 }),
    alu: std({ color: 0xb4b7ba, roughness: 0.32, metalness: 0.95 }),
    spring: std({ color: 0xd3a21c, roughness: 0.4, metalness: 0.4 }),
    engine: std({ color: 0x2b2c2d, roughness: 0.55, metalness: 0.5 }),
    rubber: std({ color: 0x121212, roughness: 0.92, side: THREE.DoubleSide }),     // (the open carcass, the sidewalls)
    rim: std({ color: 0x55585b, roughness: 0.35, metalness: 0.75 }),
    rimDark: std({ color: 0x1c1d1e, roughness: 0.5, metalness: 0.5 }),
  };
  const headMat = new THREE.MeshPhysicalMaterial({ color: 0xd6dce2, roughness: 0.05, metalness: 0.5, clearcoat: 1, emissive: 0xfff4e0, emissiveIntensity: 0 });
  const tailMat = new THREE.MeshPhysicalMaterial({ color: 0x7a0a0a, roughness: 0.15, clearcoat: 1, emissive: 0xff1a10, emissiveIntensity: 0.12 });
  const zf = m.axles[0] - m.L / 2, zr = m.axles[1] - m.L / 2, R = m.r, track = m.W / 2 - m.tireW / 2;
  const P = [];

  // ---- frame: the lower rails, the uprights, the cross tubes
  for (const s of [-1, 1]) {
    rail(P, MAT.frame, [[s * 0.2, 0.3, -0.95], [s * 0.21, 0.27, -0.6], [s * 0.22, 0.27, 0.55], [s * 0.2, 0.32, 0.9]], 0.018);
    rail(P, MAT.frame, [[s * 0.18, 0.62, -0.85], [s * 0.2, 0.74, -0.35], [s * 0.2, 0.74, 0.62], [s * 0.18, 0.62, 0.95]], 0.016);
    tube(P, MAT.frame, [s * 0.21, 0.27, -0.6], [s * 0.2, 0.74, -0.35], 0.016);
    tube(P, MAT.frame, [s * 0.22, 0.27, 0.4], [s * 0.2, 0.74, 0.3], 0.016);
    tube(P, MAT.frame, [s * 0.2, 0.32, 0.9], [s * 0.18, 0.62, 0.95], 0.016);
  }
  for (const [y, z] of [[0.27, -0.6], [0.27, 0.55], [0.74, -0.35], [0.74, 0.62], [0.3, -0.95]]) tube(P, MAT.frame, [-0.21, y, z], [0.21, y, z], 0.015);
  // ---- the engine (single cylinder, CVT on the left), the skid plate, the exhaust to the rear right
  P.push([new THREE.BoxGeometry(0.32, 0.3, 0.46), MAT.engine, pose(0.02, 0.47, 0.05)]);
  P.push([new THREE.CylinderGeometry(0.1, 0.11, 0.28, 14), MAT.engine, pose(0.02, 0.72, -0.08, 0.35, 0, 0)]);
  for (let k = 0; k < 6; k++) P.push([new THREE.CylinderGeometry(0.125, 0.125, 0.012, 14), MAT.engine, pose(0.02, 0.62 + k * 0.035, -0.04 - k * 0.013, 0.35, 0, 0)]);
  slab(P, MAT.black, [[0.32, -0.3], [0.62, -0.18], [0.66, 0.15], [0.52, 0.42], [0.3, 0.38]], -0.29, -0.17, 0.02);
  P.push([new THREE.BoxGeometry(0.46, 0.012, 1.3), MAT.alu, pose(0, 0.255, -0.05)]);
  rail(P, MAT.alu, [[0.1, 0.72, -0.12], [0.24, 0.6, 0.1], [0.3, 0.58, 0.55], [0.3, 0.62, 0.72]], 0.022);
  P.push([new THREE.CylinderGeometry(0.06, 0.06, 0.3, 14), MAT.engine, pose(0.3, 0.64, 0.82, Math.PI / 2, 0, 0)]);
  P.push([new THREE.CylinderGeometry(0.022, 0.022, 0.04, 10), MAT.alu, pose(0.3, 0.64, 0.98, Math.PI / 2, 0, 0)]);

  // ---- the suspension: double wishbones to the hubs, coil-overs, the drive shafts
  for (const [z, front] of [[zf, true], [zr, false]]) for (const s of [-1, 1]) {
    const hx = s * (track - 0.14), fx = s * 0.2;
    for (const [yy, dz] of [[R - 0.07, 0.13], [R + 0.07, 0.11]]) {
      tube(P, MAT.frame, [fx, yy - 0.02, z - dz], [hx, yy, z], 0.014);
      tube(P, MAT.frame, [fx, yy - 0.02, z + dz], [hx, yy, z], 0.014);
    }
    P.push([new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), MAT.alu, pose(hx, R, z, 0, 0, Math.PI / 2)]);
    tube(P, MAT.alu, [s * 0.12, R + 0.02, z], [hx, R, z], 0.018);
    coilover(P, MAT.spring, MAT.alu, [s * (track - 0.2), R - 0.04, z + (front ? 0.04 : -0.04)], [s * 0.2, R + 0.38, z + (front ? 0.12 : -0.12)]);
  }

  // ---- the bodywork: fenders over the wheels, the nose, the side panels, the rear
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? track - 0.17 : -track - 0.15, x1 = s > 0 ? track + 0.15 : -track + 0.17;
    fender(P, MAT.paint, R, zf, R + 0.05, 0.12, Math.PI - 0.55, 0.05, x0, x1);
    fender(P, MAT.paint, R, zr, R + 0.05, 0.45, Math.PI - 0.1, 0.05, x0, x1);
    fender(P, MAT.black, R, zf, R + 0.03, 0.1, Math.PI - 0.5, 0.02, x0 + 0.01, x1 - 0.01);
    fender(P, MAT.black, R, zr, R + 0.03, 0.4, Math.PI - 0.08, 0.02, x0 + 0.01, x1 - 0.01);
    // the side panel below the seat, the floorboard with its tread and lip
    slab(P, MAT.grain, [[0.5, -0.3], [0.78, -0.3], [0.82, 0.1], [0.8, 0.3], [0.5, 0.3]], s > 0 ? 0.2 : -0.26, s > 0 ? 0.26 : -0.2, 0.01);
    P.push([new THREE.BoxGeometry(0.32, 0.03, 0.62), MAT.grain, pose(s * 0.39, 0.4, 0.02)]);
    for (let k = 0; k < 7; k++) P.push([new THREE.BoxGeometry(0.3, 0.012, 0.018), MAT.black, pose(s * 0.39, 0.42, -0.24 + k * 0.085)]);
    P.push([new THREE.BoxGeometry(0.03, 0.08, 0.62), MAT.grain, pose(s * 0.555, 0.45, 0.02)]);
  }
  // the front and rear decks: one moulding each, flat on top (the racks bolt to them), rounded at the corners, the
  // fenders' arcs under their outer parts
  const deck = (z0, z1, y, rc, tilt) => {
    const sh = new THREE.Shape(), xw = 0.6;
    sh.moveTo(-xw + rc, -z1); sh.lineTo(xw - rc, -z1); sh.quadraticCurveTo(xw, -z1, xw, -z1 + rc); sh.lineTo(xw, -z0 - rc); sh.quadraticCurveTo(xw, -z0, xw - rc, -z0);
    sh.lineTo(-xw + rc, -z0); sh.quadraticCurveTo(-xw, -z0, -xw, -z0 - rc); sh.lineTo(-xw, -z1 + rc); sh.quadraticCurveTo(-xw, -z1, -xw + rc, -z1);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 3, curveSegments: 8 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -(z0 + z1) / 2); g.rotateX(tilt); g.translate(0, y, (z0 + z1) / 2);
    P.push([g, MAT.paint]);
  };
  deck(-1.0, -0.36, 0.74, 0.16, -0.05);
  deck(0.3, 1.05, 0.76, 0.14, 0.03);
  // the nose between the front fenders (its slope up to the console), the front fascia with the headlights
  slab(P, MAT.paint, [[0.5, -1.02], [0.62, -1.05], [0.8, -0.95], [0.9, -0.62], [0.98, -0.38], [0.86, -0.3], [0.62, -0.42], [0.48, -0.8]], -0.3, 0.3, 0.025);
  slab(P, MAT.black, [[0.44, -1.04], [0.55, -1.08], [0.6, -1.0], [0.5, -0.96]], -0.32, 0.32, 0.01);
  const headL = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.17, 0.07, 0.03); g.rotateX(-0.45); g.translate(s * 0.17, 0.72, -1.02);
    P.push([g, headMat]); headL.push(null);
  }
  // the console / tank under the bars, its cap, the bar pod with the display and its light
  slab(P, MAT.paint, [[0.84, -0.42], [1.0, -0.38], [1.02, -0.1], [0.92, 0.02], [0.82, -0.02]], -0.21, 0.21, 0.03);
  P.push([new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), MAT.black, pose(0, 1.025, -0.22)]);
  // the seat: long, black, rounded
  slab(P, MAT.seat, [[0.82, -0.04], [0.9, -0.02], [0.93, 0.15], [0.92, 0.52], [0.9, 0.7], [0.84, 0.74], [0.8, 0.7], [0.8, 0.0]], -0.19, 0.19, 0.04);
  // the rear under the rack, the tail lights, the hitch, the plate
  slab(P, MAT.paint, [[0.5, 0.84], [0.74, 0.82], [0.76, 1.0], [0.66, 1.07], [0.5, 1.05]], -0.32, 0.32, 0.02);
  const tailL = [];
  for (const s of [-1, 1]) { P.push([new THREE.BoxGeometry(0.1, 0.06, 0.02), tailMat, pose(s * 0.24, 0.72, 1.07)]); tailL.push(null); }
  P.push([new THREE.BoxGeometry(0.05, 0.05, 0.12), MAT.frame, pose(0, 0.32, 1.06)]);
  P.push([new THREE.BoxGeometry(0.2, 0.11, 0.004), MAT.alu, pose(0, 0.58, 1.06)]);

  // ---- the racks: steel tubes over the fenders, front and rear
  for (const [z0, z1, y] of [[-1.02, -0.5, 0.95], [0.5, 1.08, 0.95]]) {
    rail(P, MAT.frame, [[-0.44, y, z0], [0.44, y, z0], [0.44, y, z1], [-0.44, y, z1], [-0.44, y, z0]], 0.014);
    for (let k = 1; k < 4; k++) { const z = z0 + (z1 - z0) * k / 4; tube(P, MAT.frame, [-0.44, y, z], [0.44, y, z], 0.01); }
    for (const x of [-0.44, 0.44]) for (const z of [z0 + 0.04, z1 - 0.04]) tube(P, MAT.frame, [x, y, z], [x * 0.75, y - 0.12, z], 0.012);
  }
  // ---- the bumper and the winch in it
  rail(P, MAT.frame, [[-0.3, 0.35, -1.0], [-0.3, 0.55, -1.12], [0.3, 0.55, -1.12], [0.3, 0.35, -1.0]], 0.02);
  tube(P, MAT.frame, [-0.3, 0.42, -1.07], [0.3, 0.42, -1.07], 0.018);
  P.push([new THREE.CylinderGeometry(0.05, 0.05, 0.32, 14), MAT.black, pose(0, 0.47, -1.04, 0, 0, Math.PI / 2)]);
  P.push([new THREE.BoxGeometry(0.1, 0.05, 0.03), MAT.alu, pose(0, 0.47, -1.1)]);
  P.push([new THREE.BoxGeometry(0.03, 0.03, 0.04), MAT.frame, pose(0, 0.47, -1.13)]);

  // ---- the handlebars: on the steering column, turning with the wheels (steer)
  const steer = new THREE.Group();
  steer.position.set(0, 1.0, -0.36);
  steer.rotation.x = -0.32;                          // (the column leans back: the bars turn about it)
  const S = [];
  tube(S, MAT.frame, [0, -0.08, 0], [0, 0.07, 0], 0.016);
  rail(S, MAT.frame, [[-0.43, 0.13, 0.05], [-0.3, 0.12, 0.02], [-0.12, 0.08, 0], [0.12, 0.08, 0], [0.3, 0.12, 0.02], [0.43, 0.13, 0.05]], 0.012);
  for (const s of [-1, 1]) {
    tube(S, MAT.rubber, [s * 0.33, 0.12, 0.025], [s * 0.45, 0.13, 0.055], 0.017, 10);
    // the hand guard round the grip (cold, the branches), the brake lever
    { const prof = [], n = 10, a0 = -0.55, a1 = 1.35;
      for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; prof.push([0.13 + 0.1 * Math.sin(a), 0.03 - 0.1 * Math.cos(a)]); }
      for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; prof.push([0.13 + 0.088 * Math.sin(a), 0.03 - 0.088 * Math.cos(a)]); }
      slab(S, MAT.black, prof, s > 0 ? 0.33 : -0.47, s > 0 ? 0.47 : -0.33, 0.004); }
    tube(S, MAT.alu, [s * 0.3, 0.13, -0.01], [s * 0.42, 0.11, -0.04], 0.005);
  }
  slab(P, MAT.black, [[1.07, -0.35], [1.15, -0.36], [1.17, -0.44], [1.13, -0.5], [1.08, -0.48]], -0.12, 0.12, 0.025);
  const pod = new THREE.BoxGeometry(0.14, 0.05, 0.01); pod.rotateX(-0.9); pod.translate(0, 1.18, -0.38);
  P.push([pod, MAT.alu]);
  const podLight = new THREE.BoxGeometry(0.12, 0.05, 0.02); podLight.translate(0, 1.12, -0.49);
  P.push([podLight, headMat]);
  const sMerged = mergeByMaterial(S);
  const bars = new THREE.Mesh(sMerged.geo, sMerged.mats); bars.castShadow = true;
  steer.add(bars);
  bodyPivot.add(steer);

  const merged = mergeByMaterial(P);
  const body = new THREE.Mesh(merged.geo, merged.mats);
  body.castShadow = true; body.receiveShadow = true;
  bodyPivot.add(body);

  // ---- the wheels: knobby tyres on black 12" steel wheels, each turning about its own pivot
  const tyreGeo = mergeByMaterial(knobbyTyre(R, m.tireW).map(g => [g, MAT.rubber])).geo;
  const rimParts = [];
  { const disc = new THREE.CylinderGeometry(R * 0.6, R * 0.6, m.tireW * 0.82, 20, 1, true); disc.rotateZ(Math.PI / 2); rimParts.push([disc, MAT.rim]);
    const face = new THREE.CircleGeometry(R * 0.6, 24); face.rotateY(Math.PI / 2); face.translate(m.tireW * 0.22, 0, 0); rimParts.push([face, MAT.rimDark]);
    for (let k = 0; k < 6; k++) { const sp = new THREE.BoxGeometry(0.02, R * 0.46, 0.045); sp.translate(m.tireW * 0.3, R * 0.33, 0); sp.rotateX(k / 6 * Math.PI * 2); rimParts.push([sp, MAT.rim]); }
    const lip = new THREE.TorusGeometry(R * 0.6, 0.012, 6, 28); lip.rotateY(Math.PI / 2); lip.translate(m.tireW * 0.4, 0, 0); rimParts.push([lip, MAT.rim]);
    for (let k = 0; k < 4; k++) { const n = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6); n.rotateZ(Math.PI / 2); const a = k / 4 * Math.PI * 2; n.translate(m.tireW * 0.31, Math.cos(a) * 0.06, Math.sin(a) * 0.06); rimParts.push([n, MAT.alu]); }
    const hub = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12); hub.rotateZ(Math.PI / 2); hub.translate(m.tireW * 0.32, 0, 0); rimParts.push([hub, MAT.alu]); }
  const rimM = mergeByMaterial(rimParts);
  const wheels = [];
  for (const [ai, a] of m.axles.entries()) for (const sg of [-1, 1]) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.set(sg * track, R, a - m.L / 2);
    const tyre = new THREE.Mesh(tyreGeo, MAT.rubber); tyre.castShadow = true;
    const rim = new THREE.Mesh(rimM.geo, rimM.mats); rim.scale.x = sg;
    spin.add(tyre, rim); pivot.add(spin); group.add(pivot);
    wheels.push({ pivot, spin, front: ai === 0, side: sg, x: sg * track, z: a - m.L / 2 });
  }
  const setWheels = (spinA, steerA) => {
    for (const w of wheels) { w.spin.rotation.x = spinA; if (w.front) w.pivot.rotation.y = -steerA; }
  };

  // ---- the rider: winter jacket, gloves on the grips, boots on the floorboards, helmet (outside views only)
  const rider = new THREE.Group();
  const RD = { jacket: std({ color: 0x23364d, roughness: 0.8 }), pants: std({ color: 0x1b1c1e, roughness: 0.85 }), glove: std({ color: 0x0e0e0f, roughness: 0.7 }),
    boot: std({ color: 0x2a221c, roughness: 0.8 }), helmet: new THREE.MeshPhysicalMaterial({ color: 0xe6e6e4, roughness: 0.3, clearcoat: 1 }), visor: new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.05, metalness: 0.4, clearcoat: 1 }) };
  const RP = [];
  const limb = (mat, a, b, r) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); const g = new THREE.CapsuleGeometry(r, Math.max(0.01, L), 4, 10); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); RP.push([g, mat]); };
  for (const s of [-1, 1]) {
    limb(RD.pants, [s * 0.11, 0.98, 0.32], [s * 0.2, 0.98, -0.08], 0.075);           // thigh
    limb(RD.pants, [s * 0.2, 0.96, -0.08], [s * 0.36, 0.5, 0.0], 0.06);              // shin
    limb(RD.boot, [s * 0.36, 0.47, 0.03], [s * 0.38, 0.47, -0.16], 0.05);             // boot on the floorboard
    limb(RD.jacket, [s * 0.2, 1.43, 0.19], [s * 0.3, 1.2, -0.05], 0.058);            // upper arm
    limb(RD.jacket, [s * 0.3, 1.2, -0.05], [s * 0.4, 1.14, -0.31], 0.05);            // forearm
    limb(RD.glove, [s * 0.4, 1.14, -0.31], [s * 0.44, 1.14, -0.36], 0.045);          // glove on the grip
  }
  limb(RD.jacket, [0, 1.0, 0.36], [0, 1.4, 0.2], 0.17);                               // torso, leaning to the bars
  limb(RD.jacket, [-0.17, 1.44, 0.2], [0.17, 1.44, 0.2], 0.07);                       // shoulders
  { const h = new THREE.SphereGeometry(0.15, 18, 14); h.scale(1, 1.05, 1.12); h.translate(0, 1.63, 0.14); RP.push([h, RD.helmet]);
    const v = new THREE.SphereGeometry(0.152, 18, 10, -0.9, 1.8, 1.0, 0.75); v.rotateY(Math.PI); v.scale(1, 1.05, 1.12); v.translate(0, 1.63, 0.14); RP.push([v, RD.visor]); }
  const rm = mergeByMaterial(RP);
  const riderMesh = new THREE.Mesh(rm.geo, rm.mats); riderMesh.castShadow = true;
  rider.add(riderMesh);
  rider.visible = false;
  bodyPivot.add(rider);

  // soft contact shadow under it
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g2 = c.getContext('2d'), img = g2.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.max(0, Math.abs(x - 31.5) / 32 - 0.5) / 0.5, dy = Math.max(0, Math.abs(y - 63.5) / 64 - 0.6) / 0.4;
    img.data[(y * 64 + x) * 4 + 3] = Math.pow(1 - Math.min(1, Math.hypot(dx, dy)), 1.6) * 200;
  }
  g2.putImageData(img, 0, 0);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(m.W + 0.2, m.L + 0.25), new THREE.MeshBasicMaterial({ color: 0, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
  group.add(blob);

  return {
    group, bodyPivot, wheels, setWheels, steer, model: m, rider,
    lights: { head: headL, tail: tailL, tailMat, headMat },
    glass: { opacity: 0 },
    half: { w: m.W / 2 + 0.03, l: m.L / 2 },
  };
}
