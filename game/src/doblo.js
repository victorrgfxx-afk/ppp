import * as THREE from 'three';
import { MODELS, roundedRectGeo, section } from './cars.js';

// The red Fiat Doblò Cargo on the oil wells' pad (photo 85, and the user's photo from its driver's seat on the forest
// road): the first Doblò (type 223) as a panel van, after the 2005 facelift. Lofted like the other cars (cars.js) from
// its real dimensions - 4253 mm long, 1722 mm wide, 1818 mm high, 2583 mm between the axles - and the side, front and
// rear photos of the model (Wikimedia Commons), with its own details:
//  * the facelift's front: the big swept headlamps with two round reflectors each, the black grille with the Fiat
//    badge, the unpainted dark grey bumper with the wide lower intake and the round fog lamp recesses;
//  * the sides: a long front door, blind load space behind it with a sliding door, pressed panels above the shoulder
//    crease, the sliding door's track running back along the quarter panel at the shoulder, black rubbing strips on
//    the doors, black handles, the tall black two-arm mirrors, the fuel cap on the left quarter panel;
//  * the rear: two side-hinged doors split 60/40, the tall tail lamps (red, the white reverse light, red) set in the
//    black corner trims that run from the bumper to the roof, the third brake light, the badge and the Doblò script;
//  * the cabin: the grey dashboard with the four demister slots, the open bin on its top and the hood over the dials
//    (as in the photo from the driver's seat), a bulkhead behind the seats;
//  * 175/70 R14 tyres on steel wheels with plastic covers; Fiat's red, oxidised to a chalky matt on the bonnet.
// It drives as the 1.3 Multijet (63 kW): 0-100 km/h in ~16 s, ~155 km/h.

const L = 4.253;
export const DOBLO_MODEL = {
  name: 'Fiat Doblò Cargo', L, W: 1.722, axles: [0.85, 3.433], r: 0.3, tireW: 0.175, wheelTex: 'wheelGen',
  taper: [0.86, 0.32],
  // the nose up to the bonnet's leading edge, the bonnet up to the cowl, then the door sills at the shoulder crease
  belt: [[0, 0.8], [0.03, 0.9], [0.07, 0.97], [0.15, 1.01], [0.35, 1.05], [0.6, 1.09], [0.9, 1.125], [1.06, 1.14], [1.25, 1.1], [1.45, 1.075], [2.4, 1.08], [4.1, 1.09], [4.2, 1.08], [4.235, 0.98], [4.253, 0.86]],
  // the windscreen (~43 deg) up to its header, the flat roof of the box, its rear edge and the upright rear doors
  roof: [[1.02, 1.14], [1.1, 1.22], [1.25, 1.36], [1.4, 1.5], [1.55, 1.635], [1.66, 1.725], [1.76, 1.78], [1.9, 1.805], [2.3, 1.815], [3.9, 1.818], [4.12, 1.812], [4.19, 1.79], [4.222, 1.73], [4.238, 1.55], [4.246, 1.25], [4.25, 1.0]],
  bottom: [[0, 0.3], [0.1, 0.25], [0.35, 0.22], [3.95, 0.23], [4.15, 0.28], [4.253, 0.32]],
  // the door glass leans in, the load box above the crease stands upright
  hwr: 0.755, hwrAt: [[0, 0.7], [2.3, 0.7], [2.5, 0.755], [L, 0.755]],
  wind: [1.0, 1.68], rear: [4.05, 4.05], side: [1.5, 2.36], pillars: [2.4, 3.25], interior: 0x3c3d3f,
  lights: { head: [0.06, 0.94, 0.56, 0.4, 0.17], tail: [4.25, 1.12, 0.79, 0.08, 0.5] }, grille: 'doblo',
  ownSides: true, pillarPaint: true, cargo: true, linerFrom: 1.8, eyeY: 1.47, chase: [7.0, 1.7],
  plates: { front: [0.47, -L / 2 - 0.036], rear: [0.71, L / 2 + 0.008], rearX: -0.17 },
};

// ---- the lofted surface, as carBodyGeometry builds it: the sections at the same stations, straight between them
const STATIONS = (() => {
  const st = [];
  for (let s = 0; s <= L + 1e-6; s += (s < 0.4 || s > L - 0.4) ? 0.035 : 0.06) st.push(Math.min(s, L));
  if (st[st.length - 1] < L) st.push(L);
  return st;
})();
const SEC = STATIONS.map(s => section(DOBLO_MODEL, s));
function secAt(s) {
  s = Math.min(L, Math.max(0, s));
  let j = 0; while (j < STATIONS.length - 2 && STATIONS[j + 1] < s) j++;
  const t = (s - STATIONS[j]) / (STATIONS[j + 1] - STATIONS[j] || 1), A = SEC[j], B = SEC[j + 1];
  return A.map((p, i) => [p[0] + (B[i][0] - p[0]) * t, p[1] + (B[i][1] - p[1]) * t]);
}
// the half width of the body at height y in a section (-1: above or below it)
function halfW(R, y) {
  for (let i = 1; i < R.length - 1; i++) {
    const [x0, y0] = R[i], [x1, y1] = R[i + 1];
    if (y >= y0 && y <= y1) return y1 - y0 < 1e-6 ? Math.max(x0, x1) : x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return -1;
}
const sideX = (s, y) => halfW(secAt(s), y);
// where the surface is, for a point (x, y), from the nose or the tail
function endS(x, y, front) {
  for (let k = 0; k <= 400; k++) { const s = front ? k * 0.002 : L - k * 0.002; if (halfW(secAt(s), y) >= Math.abs(x)) return s; }
  return front ? 0.4 : L - 0.4;
}

const pose = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// the Fiat badge of 2007: a red disc in a chrome ring, FIAT in chrome capitals
function badge() {
  return canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    const ring = g.createLinearGradient(0, 0, w, w); ring.addColorStop(0, '#f2f3f5'); ring.addColorStop(0.5, '#8d9095'); ring.addColorStop(1, '#e9ebee');
    g.fillStyle = ring; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2); g.fill();
    const red = g.createRadialGradient(w * 0.42, w * 0.38, 4, w / 2, w / 2, w * 0.4); red.addColorStop(0, '#d8343a'); red.addColorStop(1, '#8a0f16');
    g.fillStyle = red; g.beginPath(); g.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#eceef1'; g.font = 'bold 34px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, w / 2 + 2); g.scale(0.8, 1.25); g.fillText('FIAT', 0, 0); g.restore();
  });
}
function script(text, font) {
  return canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font; g.fillText(text, w / 2, h / 2 + 2);
  });
}

let MAT = null;
function mats() {
  if (MAT) return MAT;
  MAT = {
    // the unpainted bumpers, trims, handles and mirrors: dark grey grained plastic
    plastic: new THREE.MeshStandardMaterial({ color: 0x323437, roughness: 0.8, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.65 }),
    housing: new THREE.MeshStandardMaterial({ color: 0x7e8287, roughness: 0.25, metalness: 0.85 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xe9ecef, roughness: 0.12, clearcoat: 1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xc27a18, roughness: 0.2, emissive: 0xff9a20, emissiveIntensity: 0.04 }),
    mesh: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.6 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0x5a0707, roughness: 0.3 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.08, metalness: 1 }),   // (it shows the sky and the road behind, darker than the sky)
    badge: new THREE.MeshStandardMaterial({ map: badge(), alphaTest: 0.4, metalness: 0.5, roughness: 0.25 }),
    word: new THREE.MeshStandardMaterial({ map: script('Doblò', 'italic bold 46px Georgia, "Times New Roman", serif'), alphaTest: 0.45, metalness: 1, roughness: 0.2, color: 0xd9dbde }),
    cargo: new THREE.MeshStandardMaterial({ map: script('CARGO', 'bold 40px Arial, Helvetica, sans-serif'), alphaTest: 0.45, metalness: 1, roughness: 0.2, color: 0xd9dbde }),
    dash: new THREE.MeshStandardMaterial({ color: 0x585957, roughness: 0.85 }),
    dashDark: new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.9 }),
  };
  MAT.dash.userData.noWet = MAT.dashDark.userData.noWet = true;           // (the cabin's: dry)
  return MAT;
}

// a wall of height y0..y1 along a polyline in plan ([x, z] points), with a flat top and bottom d deep (inwards: to
// the left of the walk) - the bumpers and the corner trims
function band(pts, y0, y1, d) {
  const P = [];
  const q = (a, b, c, e) => P.push(...a, ...b, ...c, ...a, ...c, ...e);
  const inward = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / l * d, p[1] + dx / l * d];
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], [cx, cz] = inward[i], [ex, ez] = inward[i + 1];
    q([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]);
    q([ax, y1, az], [bx, y1, bz], [ex, y1, ez], [cx, y1, cz]);
    q([ax, y0, az], [cx, y0, cz], [ex, y0, ez], [bx, y0, bz]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

// the details, in the car's frame (forward -z, right +x, the ground y = 0; s from the nose)
function details({ add, S, paint, zAt, headMat, tailMat, rigid }) {
  const X = mats(), m = DOBLO_MODEL;
  const put = (g, mat, M) => rigid.push([g, mat, M]);
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => put(new THREE.BoxGeometry(w, h, d), mat, pose(x, y, z, rx, ry, rz));

  // ---- the bumpers: round the nose to the front arches, round the tail to the rear arches
  const outline = (s0, s1, y, out, step = 0.02) => {
    const side = [];
    for (let s = s0; s0 < s1 ? s <= s1 + 1e-6 : s >= s1 - 1e-6; s += s0 < s1 ? step : -step) side.push([sideX(s, y) + out, zAt(s)]);
    return side;
  };
  const yF = 0.52, front = outline(0.5, 0, yF, 0.018).reverse();                  // (from the nose back, the right side)
  const zf = zAt(0) - 0.03, xf = sideX(0.02, yF);
  const fPts = [...front.slice().reverse().map(([x, z]) => [-x, z]), [-xf + 0.02, zf], [xf - 0.02, zf], ...front];
  put(band(fPts, 0.27, 0.73, 0.08), X.plastic);
  // the lower intake across the bumper, the fog lamps in their round recesses, the number plate's recess
  box(0.92, 0.12, 0.012, X.mesh, 0, 0.38, zf - 0.004);
  for (const sg of [-1, 1]) {
    put(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 20), X.rubber, pose(sg * 0.6, 0.4, zf - 0.006, Math.PI / 2, 0, 0));
    put(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), X.white, pose(sg * 0.6, 0.4, zf - 0.012, Math.PI / 2, 0, 0));
  }
  const yR = 0.45, rear = outline(3.82, L, yR, 0.02), zr = zAt(L) + 0.035, xr = sideX(L - 0.02, yR);
  const rPts = [...rear, [xr - 0.02, zr], [-xr + 0.02, zr], ...rear.slice().reverse().map(([x, z]) => [-x, z])];
  put(band(rPts, 0.3, 0.62, 0.13), X.plastic);
  for (const sg of [-1, 1]) box(0.08, 0.035, 0.01, X.reflector, sg * 0.62, 0.5, zr + 0.006);
  box(0.06, 0.06, 0.25, X.rubber, -0.42, 0.27, zAt(L) - 0.05, 0.12, 0, 0);    // (the tailpipe, under the left of the bumper)

  // ---- the facelift's front: the swept headlamps, the grille with the badge
  for (const sg of [-1, 1]) {
    const x = sg * 0.53, y = 0.885, s0 = endS(x, y, true) + 0.012;
    const H = pose(x, y, zAt(s0), 0.36, Math.PI - sg * 0.34, 0);
    put(roundedRectGeo(0.44, 0.2, 0.07, 0.05), X.housing, H);
    for (const k of [0, 1]) {
      const cx = sg * (0.08 - k * 0.16);
      put(new THREE.CylinderGeometry(0.068, 0.058, 0.03, 24), X.housing, H.clone().multiply(pose(cx, -0.01, 0.02, Math.PI / 2, 0, 0)));
      put(new THREE.CircleGeometry(0.036, 20), headMat, H.clone().multiply(pose(cx, -0.01, 0.036)));
    }
    put(new THREE.BoxGeometry(0.08, 0.03, 0.01), X.amber, H.clone().multiply(pose(-sg * 0.17, 0.065, 0.03)));
    put(roundedRectGeo(0.45, 0.21, 0.075, 0.01), X.lens, H.clone().multiply(pose(0, 0, 0.05)));
    // its tail swept back along the wing
    const s1 = 0.2, y1 = 0.93, xs = sideX(s1, y1);
    box(0.02, 0.09, 0.22, X.housing, sg * (xs - 0.004), y1, zAt(s1), 0, 0, 0);
    box(0.012, 0.1, 0.23, X.lens, sg * (xs + 0.006), y1, zAt(s1));
    // the side repeater on the wing behind the arch
    box(0.008, 0.03, 0.06, X.amber, sg * (sideX(1.2, 0.98) + 0.003), 0.98, zAt(1.2));
  }
  const sg0 = endS(0, 0.86, true);
  const G = pose(0, 0.86, zAt(sg0) - 0.012, 0.36, Math.PI, 0);
  put(roundedRectGeo(0.58, 0.15, 0.04, 0.04), X.plastic, G);
  for (let i = 0; i < 5; i++) put(new THREE.BoxGeometry(0.54, 0.008, 0.02), X.rubber, G.clone().multiply(pose(0, -0.055 + i * 0.027, 0.022)));
  put(new THREE.CircleGeometry(0.046, 32), X.badge, G.clone().multiply(pose(0, 0, 0.034)));

  // ---- the wipers parked along the windscreen's foot, the aerial on the roof's front
  const yw = secAt(1.13)[9][1] + 0.012;
  for (const x0 of [-0.52, 0.04]) box(0.56, 0.014, 0.022, X.rubber, x0 + 0.27, yw, zAt(1.13), 0, 0, 0.08);
  put(new THREE.CylinderGeometry(0.004, 0.006, 0.42, 6), X.rubber, pose(0.0, 1.81 + 0.19, zAt(1.95), 0.45, 0, 0));
  box(0.04, 0.02, 0.07, X.rubber, 0, 1.82, zAt(1.86));

  // ---- the sides
  for (const sg of [-1, 1]) {
    const onSide = (s, y, o = 0.002) => sg * (sideX(s, y) + o);
    // rubbing strips on the front and sliding doors
    for (const [a, b] of [[1.34, 2.37], [2.46, 3.18]]) {
      const n = 6, y = 0.69;
      for (let i = 0; i < n; i++) {
        const s0 = a + (b - a) * i / n, s1 = a + (b - a) * (i + 1) / n, sm = (s0 + s1) / 2;
        box(0.024, 0.062, s1 - s0 + 0.004, X.plastic, onSide(sm, y, 0.01), y, zAt(sm), 0, sg * Math.atan2(sideX(s1, y) - sideX(s0, y), s1 - s0), 0);
      }
    }
    // handles: the front door's at its rear edge, the sliding door's at its front edge
    for (const s of [2.24, 2.56]) {
      box(0.03, 0.045, 0.15, X.plastic, onSide(s, 0.97, 0.012), 0.97, zAt(s));
      box(0.008, 0.06, 0.17, X.rubber, onSide(s, 0.97, 0.002), 0.97, zAt(s));
    }
    // shut lines: the front door's leading edge, the B pillar, the sliding door's edges and top
    const seam = (s, y0, y1) => {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const ya = y0 + (y1 - y0) * i / n, yb = y0 + (y1 - y0) * (i + 1) / n, xa = sideX(s, ya), xb = sideX(s, yb);
        if (xa < 0 || xb < 0) continue;
        box(0.004, Math.hypot(yb - ya, xb - xa) + 0.002, 0.006, X.rubber, sg * ((xa + xb) / 2 + 0.002), (ya + yb) / 2, zAt(s), 0, 0, -sg * Math.atan2(xb - xa, yb - ya));
      }
    };
    seam(1.3, 0.38, 1.08); seam(2.4, 0.36, 1.74); seam(2.43, 0.36, 1.74); seam(3.25, 0.66, 1.74);
    for (let s = 2.45; s < 3.24; s += 0.2) box(0.004, 0.005, 0.2, X.rubber, onSide(s + 0.1, 1.74), 1.74, zAt(s + 0.1));
    // the sliding door's track along the quarter panel, at the shoulder
    box(0.03, 0.035, 0.9, X.plastic, onSide(3.72, 1.085, 0.012), 1.085, zAt(3.72));
    // the pressed panels on the load box (a raised edge round each)
    for (const [a, b] of [[2.5, 3.18], [3.32, 4.1]]) {
      const y0 = 1.16, y1 = 1.69, x = onSide((a + b) / 2, 1.4, 0.003);
      for (const y of [y0, y1]) box(0.006, 0.012, b - a, paint, x, y, zAt((a + b) / 2));
      for (const s of [a, b]) box(0.006, y1 - y0, 0.012, paint, x, (y0 + y1) / 2, zAt(s));
    }
    // the door frame ahead of the glass: the window's leading edge runs up parallel to the A pillar
    {
      const top = (s) => secAt(s)[7][1] - 0.004, pts = [[1.5, secAt(1.5)[6][1]]];
      for (let s = 1.5; s <= 1.725; s += 0.025) pts.push([s, top(s)]);
      const P = [], Pin = [];
      for (let i = 1; i < pts.length - 1; i++) {
        for (const [o, Q] of [[0.003, P], [-0.004, Pin]]) {                    // (outside: paint; inside: the trim)
          const v = [pts[0], pts[i], pts[i + 1]].map(([s, y]) => [sg * (sideX(s, y) + o), y, zAt(s)]);
          if ((sg < 0) === (o > 0)) v.reverse();
          Q.push(...v.flat());
        }
      }
      for (const [Q, mat] of [[P, paint], [Pin, X.dashDark]]) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Q, 3)); g.computeVertexNormals();
        put(g, mat);
      }
    }
    // the mirror: tall, black, on two arms from the door's front corner
    const sm = 1.5, xm = sideX(sm, 1.15);
    for (const y of [1.13, 1.27]) box(0.17, 0.025, 0.035, X.plastic, sg * (xm + 0.085), y, zAt(sm));
    box(0.17, 0.28, 0.08, X.plastic, sg * (xm + 0.2), 1.2, zAt(sm + 0.02));
    box(0.15, 0.26, 0.005, X.mirror, sg * (xm + 0.2), 1.2, zAt(sm + 0.02) + 0.042);
  }
  // the fuel cap on the left quarter panel, the CARGO badge on the right sliding door
  put(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 24), paint, pose(-(sideX(3.62, 0.97) + 0.003), 0.97, zAt(3.62), 0, 0, Math.PI / 2));
  put(new THREE.TorusGeometry(0.06, 0.003, 4, 24), X.rubber, pose(-(sideX(3.62, 0.97) + 0.004), 0.97, zAt(3.62), 0, Math.PI / 2, 0));
  put(new THREE.PlaneGeometry(0.16, 0.04), X.cargo, pose(sideX(3.05, 1.02) + 0.004, 1.02, zAt(3.05), 0, Math.PI / 2, 0));

  // ---- the rear: the corner trims with the tall lamps, the doors split 60/40, the brake light, badge and script
  const rearZ = (x, y) => zAt(endS(x, y, false));
  for (const sg of [-1, 1]) {
    // the trim: from the bumper up to the roof's edge, round the corner onto the side (one piece, leaning with the doors)
    const xs = sideX(4.2, 1.2), xo = (y) => { const v = sideX(L - 0.012, y); return v > 0 ? v : xs * 0.95; };
    const upright = (w, y0, y1, d, mat, out, inset) => {
      const xa = xo(y0) - inset, xb = xo(y1) - inset, za = rearZ(sg * xa, y0) + out, zb = rearZ(sg * xb, y1) + out;
      box(w, Math.hypot(y1 - y0, zb - za), d, mat, sg * (xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2, Math.atan2(zb - za, y1 - y0), 0, 0);
    };
    upright(0.11, 0.6, 1.75, 0.014, X.plastic, 0.006, 0.05);
    box(0.012, 1.15, 0.07, X.plastic, sg * (sideX(4.205, 1.17) + 0.004), 1.175, zAt(4.205));
    // the lamp: red over the white reverse light over red, proud of the trim, wrapping round it
    for (const [y0, y1, mat] of [[1.15, 1.42, tailMat], [1.065, 1.15, X.white], [0.86, 1.065, tailMat]]) {
      upright(0.095, y0 + 0.003, y1 - 0.003, 0.024, mat, 0.02, 0.05);
      box(0.018, y1 - y0 - 0.006, 0.06, mat, sg * (sideX(4.21, (y0 + y1) / 2) + 0.012), (y0 + y1) / 2, zAt(4.21));
    }
  }
  // the doors' split (60/40, the wide one on the left), their top edge, the handle; the brake light over them
  for (let y = 0.64; y < 1.72; y += 0.12) box(0.006, 0.12, 0.004, X.rubber, 0.13, y + 0.06, rearZ(0.13, y + 0.06) + 0.004);
  box(1.3, 0.006, 0.004, X.rubber, 0, 1.725, rearZ(0, 1.725) + 0.004);
  box(0.13, 0.04, 0.03, X.plastic, 0.05, 1.0, rearZ(0.05, 1.0) + 0.014);
  box(0.16, 0.035, 0.03, tailMat, 0, 1.765, rearZ(0, 1.765) + 0.012);
  put(new THREE.CircleGeometry(0.04, 28), X.badge, pose(-0.34, 1.0, rearZ(-0.34, 1.0) + 0.006));
  put(new THREE.PlaneGeometry(0.2, 0.05), X.word, pose(-0.45, 0.88, rearZ(-0.45, 0.88) + 0.006));

  // ---- the cabin: the grey dashboard of the photo (the demister slots along the glass, the open bin on top, the hood
  // over the dials), the bulkhead behind the seats
  const pd = 1.33, yd = 1.1;
  box(m.W - 0.3, 0.05, 0.42, X.dash, 0, yd, zAt(pd), -0.12, 0, 0);
  for (const x of [-0.58, -0.2, 0.2, 0.58]) box(0.22, 0.008, 0.012, X.dashDark, x, yd + 0.03, zAt(1.16));
  box(0.5, 0.012, 0.22, X.dashDark, 0.22, yd + 0.035, zAt(1.4));
  for (const x of [-0.03, 0.47]) box(0.02, 0.06, 0.24, X.dash, x, yd + 0.055, zAt(1.4));
  box(0.5, 0.06, 0.02, X.dash, 0.22, yd + 0.055, zAt(1.52));
  put(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 20, 1, true, 0, Math.PI), X.dash, pose(-0.38, yd - 0.03, zAt(1.46), 0, 0, Math.PI / 2));
  box(m.W - 0.25, 1.15, 0.03, X.dashDark, 0, 1.2, zAt(2.86));
}
DOBLO_MODEL.details = details;
MODELS.doblo = DOBLO_MODEL;

// the 1.3 Multijet: ~1300 kg, 63 kW: the arcade model's power and top speed (vehicle.js) for ~16 s to 100 km/h
export const DOBLO_OPTS = { power: 0.6, vmax: 43, name: 'Fiat Doblò Cargo' };
