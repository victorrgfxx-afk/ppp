import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS, buildCar, paintMaterial, roundedRectGeo } from './cars.js';

// The black Mercedes-Maybach GLS 600 4MATIC (X167, the facelift shown in April 2023 and sold as the GLS 600 since; the
// 2026 update is the GLS 680) parked on the hill of the cross. Lofted like the other cars (cars.js) from its real
// dimensions - 5205 mm long, 2030 mm wide, 1838 mm high, 3135 mm between the axles - with its own details:
//  * the Maybach grille: a chrome frame, fine vertical chrome bars, the MAYBACH lettering; the upright star on the bonnet;
//  * MULTIBEAM LED headlamps (the daytime lights along the top, two projector modules);
//  * the bumper's air inlets in the Maybach pattern with chrome surrounds, the chrome-wrapped underguard;
//  * chrome round the side windows, the Maybach emblem on the C-pillar, chrome handles, the running boards folded away
//    under the sills (they come out when a door opens), a chrome strip along the sills;
//  * 22-inch forged multi-spoke wheels on 285/45 R22 (front) and 325/40 R22 tyres;
//  * the facelift's tail lamps (three horizontal light blocks each), the chrome strip across the tailgate, the star,
//    the tailpipe trims set into the bumper and the chrome strip of its diffuser;
//  * obsidian black metallic; a beige nappa cabin with wood, the MBUX widescreen, the executive rear console.
// It drives as the real one: 410 kW (557 PS) V8 biturbo with 48 V boost, ~2.8 t, 4MATIC, 9G-TRONIC: 0-100 km/h in 4.9 s,
// 250 km/h (limited); air suspension with E-ACTIVE BODY CONTROL, so the body barely leans in the bends.

// the longitudinal and cornering model of vehicle.js (the hyper car's), with this car's numbers: P (W/kg at the wheels)
// and A0 (traction) give 0-100 km/h in 4.93 s and 0-200 in ~18 s, the drag a natural top speed of ~280 km/h held at
// 250 by the limiter; 100-0 km/h in ~37 m; ~0.86 g of lateral grip; 9 gears
export const MAYBACH_TUNE = {
  P: 116, A0: 6.4, top: 280 / 3.6, limit: 250 / 3.6, brake: 10.5, aMax: 10,
  shifts: [0, 38, 62, 90, 120, 150, 180, 210, 235, 330], rpm: [1900, 5800],
  lat: 0.86 * 9.81, latAero: 0, steerIn: 0.42, steerOut: 0.2, scrub: 0.05, roll: 0.0022,
};

const pose = (x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(1, 1, 1));

function rrShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
// a rounded-rectangle frame (outer w x h, the band t wide), d deep, centred on z = 0
function frameGeo(w, h, r, t, d) {
  const s = rrShape(w, h, r);
  s.holes.push(new THREE.Path(rrShape(w - 2 * t, h - 2 * t, Math.max(0.004, r - t)).getPoints(6).reverse()));
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -d / 2);
  return g;
}
const plane = (w, h) => new THREE.PlaneGeometry(w, h);

// ---- canvas textures: the lettering, the Maybach pattern, the emblem
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function lettering() {
  return canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 50px "Times New Roman", Georgia, serif';
    if ('letterSpacing' in g) g.letterSpacing = '14px';
    g.fillText('MAYBACH', w / 2, h / 2 + 2);
  });
}
// the Maybach pattern: small double-M marks in a diagonal grid, chrome on gloss black
function pattern(rep) {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, w, w);
    const mark = (cx, cy, s) => {
      g.strokeStyle = '#e4e6e9'; g.lineWidth = s * 0.16; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(cx - s, cy - s * 0.55); g.quadraticCurveTo(cx, cy - s * 0.75, cx + s, cy - s * 0.55); g.quadraticCurveTo(cx + s * 0.55, cy + s * 0.25, cx, cy + s); g.quadraticCurveTo(cx - s * 0.55, cy + s * 0.25, cx - s, cy - s * 0.55); g.stroke();
      g.lineWidth = s * 0.1; g.beginPath();
      for (const o of [-0.38, 0.38]) { g.moveTo(cx + o * s - 0.22 * s, cy + 0.15 * s); g.lineTo(cx + o * s - 0.22 * s, cy - 0.3 * s); g.lineTo(cx + o * s, cy - 0.02 * s); g.lineTo(cx + o * s + 0.22 * s, cy - 0.3 * s); g.lineTo(cx + o * s + 0.22 * s, cy + 0.15 * s); }
      g.stroke();
    };
    for (const [x, y] of [[32, 32], [96, 96]]) mark(x, y, 20);
    g.fillStyle = '#c9ccd0';
    for (const [x, y] of [[96, 32], [32, 96]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  }, rep);
}
function emblem() {
  return canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    const tri = (k) => { g.beginPath(); g.moveTo(w * 0.08 + k, w * 0.16 + k); g.quadraticCurveTo(w / 2, w * 0.06 + k, w * 0.92 - k, w * 0.16 + k); g.quadraticCurveTo(w * 0.78 - k, w * 0.62, w / 2, w * 0.95 - k * 1.4); g.quadraticCurveTo(w * 0.22 + k, w * 0.62, w * 0.08 + k, w * 0.16 + k); g.closePath(); };
    const gr = g.createLinearGradient(0, 0, w, w); gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(0.5, '#9a9da2'); gr.addColorStop(1, '#eceef0');
    tri(0); g.fillStyle = gr; g.fill();
    tri(9); g.fillStyle = '#1a1b1e'; g.fill();
    g.fillStyle = '#e8eaed'; g.font = 'bold 40px "Times New Roman", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MM', w / 2, w * 0.42);
  });
}

// ---- the 22-inch forged multi-spoke wheel: polished, 10 pairs of slim spokes dished towards a recessed hub; the disc
// faces +z like the plain rims of cars.js (one geometry, its parts told apart by vertex colour)
function maybachRim(R) {
  const parts = [];
  const put = (g, hex, m) => { g = g.index ? g.toNonIndexed() : g; if (m) g.applyMatrix4(m); g.deleteAttribute('uv'); const c = new THREE.Color(hex), n = g.attributes.position.count, C = new Float32Array(n * 3); for (let i = 0; i < n; i++) C.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); parts.push(g); };
  const bright = 0xe1e3e6, inner = 0x8c8f94, dark = 0x1b1c1f;
  put(new THREE.RingGeometry(R - 0.024, R, 56), bright, pose(0, 0, 0.006));
  put(new THREE.CylinderGeometry(R - 0.024, R - 0.024, 0.022, 56, 1, true), bright, pose(0, 0, -0.005, Math.PI / 2, 0, 0));
  put(new THREE.CylinderGeometry(R - 0.014, R - 0.014, 0.16, 48, 1, true), inner, pose(0, 0, -0.085, Math.PI / 2, 0, 0));
  put(new THREE.CircleGeometry(R - 0.02, 48), 0x3a3b3e, pose(0, 0, -0.105));                    // (the brake disc behind)
  const r0 = 0.088, r1 = R - 0.02, len = r1 - r0, dz = 0.04;
  for (let k = 0; k < 10; k++) for (const o of [-0.075, 0.075]) {
    const a = k / 10 * Math.PI * 2 + o, rm = (r0 + r1) / 2;
    const m = new THREE.Matrix4().makeRotationZ(a - Math.PI / 2)
      .multiply(pose(0, rm, -0.012 - dz / 2, Math.atan2(dz, len), 0, 0));                 // (the outer end forward: dished)
    put(new THREE.BoxGeometry(0.015, Math.hypot(len, dz), 0.024), bright, m);
  }
  put(new THREE.CylinderGeometry(0.092, 0.1, 0.034, 40), bright, pose(0, 0, -0.045, Math.PI / 2, 0, 0));
  // the centre cap: polished, the Maybach mark on black in its middle
  put(new THREE.CylinderGeometry(0.058, 0.06, 0.012, 40), bright, pose(0, 0, -0.024, Math.PI / 2, 0, 0));
  put(new THREE.CircleGeometry(0.036, 32), dark, pose(0, 0, -0.0175));
  put(new THREE.TorusGeometry(0.036, 0.003, 6, 32), bright, pose(0, 0, -0.017));
  return mergeGeometries(parts);
}

export const GLS_MODEL = {
  name: 'Mercedes-Maybach GLS 600 4MATIC', L: 5.205, W: 2.03, axles: [0.99, 4.125], r: 0.408, tireW: 0.3, rimK: 0.685,
  taper: [0.84, 0.5],
  belt: [[0, 0.99], [0.04, 1.02], [0.15, 1.045], [0.4, 1.06], [0.9, 1.09], [1.6, 1.15], [3.0, 1.17], [4.5, 1.2], [5.08, 1.215], [5.16, 1.19], [5.205, 1.04]],
  roof: [[1.6, 1.15], [1.85, 1.35], [2.1, 1.54], [2.35, 1.7], [2.6, 1.785], [2.95, 1.825], [3.6, 1.838], [4.4, 1.83], [4.8, 1.812], [4.98, 1.775], [5.06, 1.66], [5.12, 1.48], [5.155, 1.3], [5.165, 1.2]],
  bottom: [[0, 0.4], [0.14, 0.31], [0.5, 0.215], [4.7, 0.225], [5.0, 0.33], [5.205, 0.47]],
  hwr: 0.79, wind: [1.63, 2.5], rear: [4.99, 5.16], side: [1.72, 4.86], pillars: [2.98, 4.14], interior: 0xb39f82,
  lights: { head: [0.1, 0.95, 0.66, 0.5, 0.15], tail: [5.18, 1.08, 0.7, 0.5, 0.15] }, grille: 'maybach',
  mirror: [0.27, 0.17], chromeHandles: true, eyeY: 1.56, chase: [7.4, 1.6],
  plates: { front: [0.48, -5.205 / 2 - 0.035], rear: [0.83, 5.205 / 2 + 0.014] },
};

let MAT = null;
function mats() {
  if (MAT) return MAT;
  MAT = {
    black: new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    matte: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7 }),
    housing: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.25, metalness: 0.9 }),
    cell: new THREE.MeshStandardMaterial({ color: 0x8d9198, roughness: 0.12, metalness: 1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
    tailBase: new THREE.MeshPhysicalMaterial({ color: 0x1a0304, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
    letters: new THREE.MeshStandardMaterial({ map: lettering(), alphaTest: 0.45, metalness: 1, roughness: 0.15, color: 0xe6e8ea }),
    patternSide: new THREE.MeshStandardMaterial({ map: pattern([3, 2.2]), metalness: 0.75, roughness: 0.28 }),
    patternLow: new THREE.MeshStandardMaterial({ map: pattern([9, 1.2]), metalness: 0.75, roughness: 0.28 }),
    emblem: new THREE.MeshStandardMaterial({ map: emblem(), alphaTest: 0.45, metalness: 1, roughness: 0.2 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.35, metalness: 1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x8a5a10, roughness: 0.2, emissive: 0xff9a20, emissiveIntensity: 0.05 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0x5a0606, roughness: 0.25 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5b3820, roughness: 0.3, metalness: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.3, emissive: 0x1a2a40, emissiveIntensity: 0.6 }),
    nappa: new THREE.MeshStandardMaterial({ color: 0xb39f82, roughness: 0.62 }),
  };
  return MAT;
}

// the three-pointed star (in its ring): ring radius r, the points' thickness t; facing +z
function starParts(out, mat, M, r, t) {
  out.push([new THREE.TorusGeometry(r, r * 0.085, 8, 40), mat, M]);
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 3, s = new THREE.Shape();
    s.moveTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
    s.lineTo(Math.cos(a + 2.2) * r * 0.16, Math.sin(a + 2.2) * r * 0.16);
    s.lineTo(Math.cos(a - 2.2) * r * 0.16, Math.sin(a - 2.2) * r * 0.16);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2);
    out.push([g, mat, M]);
  }
}

// the details, in the car's frame (forward -z, right +x, the ground y = 0; s from the nose)
function details({ add, S, paint, zAt, prof, surfaceS, headMat, tailMat, rigid }) {
  const X = mats(), m = GLS_MODEL, L = m.L;
  const put = (g, mat, M) => rigid.push([g, mat, M]);
  const at = (base, x, y, z, rx = 0, ry = 0, rz = 0) => base.clone().multiply(pose(x, y, z, rx, ry, rz));

  // ---- the front, upright as the GLS's: the grille standing a little proud of it (local +z points out of the car)
  const zf = zAt(0);
  const G = pose(0, 0.78, zf - 0.035, 0.1, Math.PI, 0);
  put(frameGeo(0.84, 0.47, 0.075, 0.034, 0.06), S.chrome, G);
  put(plane(0.78, 0.41), X.black, at(G, 0, 0, -0.025));
  for (let i = 0; i < 31; i++) put(new THREE.BoxGeometry(0.0105, 0.355, 0.04), S.chrome, at(G, -0.3675 + i * 0.0245, 0.022, -0.006));
  put(plane(0.21, 0.026), X.letters, at(G, 0, -0.18, 0.012));
  // the star upright on the bonnet
  const sb = 0.2, yb = prof(sb).belt;
  add(new THREE.CylinderGeometry(0.016, 0.022, 0.03, 20), S.chrome, 0, yb + 0.006, zAt(sb));
  starParts(rigid, S.chrome, pose(0, yb + 0.058, zAt(sb), 0, 0, 0), 0.03, 0.006);
  // MULTIBEAM LED headlamps, swept round the corners: the daytime-light strip along the top and down the outer end,
  // the LED modules in their dark chrome, the indicator, the clear cover
  for (const sg of [-1, 1]) {
    const H = pose(sg * 0.655, 0.905, zf - 0.012, 0.1, Math.PI - sg * 0.2, 0);
    put(roundedRectGeo(0.52, 0.15, 0.05, 0.04), X.housing, H);
    put(new THREE.BoxGeometry(0.44, 0.013, 0.012), headMat, at(H, sg * 0.01, 0.054, 0.024));
    put(new THREE.BoxGeometry(0.013, 0.085, 0.012), headMat, at(H, -sg * 0.228, 0.008, 0.024));
    for (let k = 0; k < 3; k++) {
      put(new THREE.BoxGeometry(0.075, 0.055, 0.012), X.cell, at(H, sg * (0.13 - k * 0.088), -0.004, 0.02));
      put(new THREE.BoxGeometry(0.05, 0.03, 0.008), headMat, at(H, sg * (0.13 - k * 0.088), -0.004, 0.026));
    }
    put(new THREE.BoxGeometry(0.16, 0.008, 0.008), X.amber, at(H, -sg * 0.1, -0.056, 0.024));
    put(roundedRectGeo(0.53, 0.16, 0.055, 0.008), X.lens, at(H, 0, 0, 0.036));
  }
  // the bumper: side inlets and the low inlet in the Maybach pattern with chrome surrounds, the chrome-wrapped underguard
  for (const sg of [-1, 1]) {
    put(frameGeo(0.29, 0.2, 0.04, 0.016, 0.03), S.chrome, pose(sg * 0.64, 0.6, zf - 0.012, 0, Math.PI, sg * 0.08));
    put(plane(0.26, 0.17), X.patternSide, pose(sg * 0.64, 0.6, zf - 0.002, 0, Math.PI, sg * 0.08));
  }
  put(frameGeo(0.94, 0.12, 0.04, 0.014, 0.03), S.chrome, pose(0, 0.47, zf - 0.012, 0, Math.PI, 0));
  put(plane(0.91, 0.095), X.patternLow, pose(0, 0.47, zf - 0.002, 0, Math.PI, 0));
  add(new THREE.BoxGeometry(0.94, 0.035, 0.07), S.chrome, 0, 0.405, zAt(0.03), 0.5, 0, 0);

  // ---- the sides: chrome round the windows (along the waist and under the roof edge), the emblem on the C-pillar,
  // the folded running boards and the sill chrome
  for (const sg of [-1, 1]) {
    const seg = (s0, s1, f) => {                                       // f(s) -> [x, y]: a chrome strip along it
      const n = Math.max(2, Math.round((s1 - s0) / 0.25));
      for (let i = 0; i < n; i++) {
        const a = s0 + (s1 - s0) * i / n, b = s0 + (s1 - s0) * (i + 1) / n, [xa, ya] = f(a), [xb, yb2] = f(b);
        const l = Math.hypot(b - a, yb2 - ya, xb - xa);
        const M = new THREE.Matrix4().lookAt(new THREE.Vector3(xa, ya, zAt(a)), new THREE.Vector3(xb, yb2, zAt(b)), new THREE.Vector3(0, 1, 0));
        M.setPosition((xa + xb) / 2, (ya + yb2) / 2, (zAt(a) + zAt(b)) / 2);
        put(new THREE.BoxGeometry(0.012, 0.018, l + 0.004), S.chrome, M);
      }
    };
    seg(1.74, 4.86, (s) => { const p = prof(s); return [sg * (p.hw * 0.915 + 0.006), p.belt + 0.02]; });
    seg(2.52, 4.84, (s) => { const p = prof(s); return [sg * (Math.min(m.hwr, p.hw * 0.9) * 1.02 + 0.008), p.roof - 0.068]; });
    // the emblem: on the C-pillar between the rear door's window and the quarter light, leaning with the glass
    const sc = m.pillars[1], pc = prof(sc), ya = pc.belt + 0.035, yt = pc.roof - 0.07, xa = pc.hw * 0.9, xt = Math.min(m.hwr, pc.hw * 0.9) * 1.02;
    const lean = Math.atan2(xa - xt, yt - ya), yE = ya + (yt - ya) * 0.42, xE = xa + (xt - xa) * 0.42 + 0.012;
    put(plane(0.07, 0.07), X.emblem, new THREE.Matrix4().makeRotationZ(sg * lean).premultiply(new THREE.Matrix4().makeTranslation(sg * xE, yE, zAt(sc))).multiply(new THREE.Matrix4().makeRotationY(sg * Math.PI / 2)));
    // the running board, folded under the sill (aluminium, black rubber treads), and the sill's chrome strip
    const p0 = prof(2.6);
    add(new THREE.BoxGeometry(0.09, 0.03, 2.05), X.alu, sg * (p0.hw - 0.07), p0.yb + 0.01, zAt(2.56));
    for (const dx of [-0.025, 0.012]) add(new THREE.BoxGeometry(0.018, 0.006, 2.0), X.matte, sg * (p0.hw - 0.07 + dx), p0.yb + 0.027, zAt(2.56));
    add(new THREE.BoxGeometry(0.01, 0.024, 2.62), S.chrome, sg * (p0.hw * 0.975 + 0.008), p0.yb + 0.105, zAt(2.56));
  }

  // ---- the rear: the facelift's lamps (three horizontal light blocks each), the chrome strip, the star, the bumper
  const zr = zAt(L) + 0.012;
  for (const sg of [-1, 1]) {
    const x = sg * 0.67, y = 1.075, s0 = surfaceS(x, y, false);
    const T = pose(x, y, zAt(s0) + 0.012, -0.28, sg * 0.32, 0);
    put(roundedRectGeo(0.57, 0.16, 0.04, 0.04), X.tailBase, T);
    for (const dy of [0.04, 0, -0.04]) put(new THREE.BoxGeometry(0.42, 0.018, 0.01), tailMat, at(T, -sg * 0.03, dy, 0.024));
    put(new THREE.BoxGeometry(0.1, 0.06, 0.008), S.chrome, at(T, sg * 0.235, 0, 0.022));
    add(new THREE.BoxGeometry(0.12, 0.028, 0.012), X.reflector, sg * 0.76, 0.66, zr);
  }
  add(new THREE.BoxGeometry(0.88, 0.024, 0.014), S.chrome, 0, 1.0, zr + 0.004);
  starParts(rigid, S.chrome, pose(0, 0.945, zr + 0.006), 0.05, 0.008);
  add(new THREE.CircleGeometry(0.046, 32), X.black, 0, 0.945, zr + 0.001);
  // the tailpipe trims set into the bumper, the diffuser's chrome strip
  for (const sg of [-1, 1]) {
    put(frameGeo(0.25, 0.075, 0.03, 0.014, 0.03), S.chrome, pose(sg * 0.56, 0.6, zr + 0.004));
    add(plane(0.22, 0.05), X.black, sg * 0.56, 0.6, zr + 0.002);
  }
  add(new THREE.BoxGeometry(1.25, 0.026, 0.02), S.chrome, 0, 0.52, zr + 0.006);
  // the roof spoiler over the rear window, its third brake light
  const sp = prof(4.97);
  add(new THREE.BoxGeometry(1.24, 0.026, 0.1), paint, 0, sp.roof + 0.006, zAt(5.0), -0.06, 0, 0);
  add(new THREE.BoxGeometry(0.5, 0.012, 0.006), tailMat, 0, sp.roof + 0.004, zAt(5.05) + 0.004);

  // ---- the cabin: the MBUX widescreen and the wood across the dash, the executive console between the rear seats
  const pw = prof(m.wind[0] + 0.2);
  add(new THREE.BoxGeometry(0.66, 0.13, 0.02), X.screen, -0.28, pw.belt + 0.06, zAt(m.wind[0] + 0.46), -0.18, 0, 0);
  add(new THREE.BoxGeometry(1.72, 0.035, 0.03), X.wood, 0, pw.belt - 0.05, zAt(m.wind[0] + 0.56));
  add(new THREE.BoxGeometry(0.24, 0.3, 0.75), X.wood, 0, pw.belt - 0.38, zAt(m.wind[0] + 0.9));
  const pr = prof(m.pillars[1] - 0.25);
  add(new THREE.BoxGeometry(0.34, 0.3, 0.8), X.nappa, 0, pr.belt - 0.52, zAt(m.pillars[1] - 0.25));
  add(new THREE.BoxGeometry(0.3, 0.02, 0.6), X.wood, 0, pr.belt - 0.36, zAt(m.pillars[1] - 0.25));
}
GLS_MODEL.details = details;
MODELS.maybach = GLS_MODEL;

// the car, with its wheels and paint: obsidian black metallic
export function buildMaybach() {
  const R = GLS_MODEL.r * GLS_MODEL.rimK;
  GLS_MODEL.rim ??= { geo: maybachRim(R), mat: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.26 }) };
  const paint = paintMaterial(0x0b0c0e, { metallic: 0.55, rough: 0.28 });
  return buildCar('maybach', paint, 'plateMaybach');
}
