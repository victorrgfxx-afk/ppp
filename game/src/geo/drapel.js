import * as THREE from 'three';
import { GEO, heightAt } from './data.js';
import { Acc } from './bridge.js';
import { canvas, tex, grain } from './pitigaia.js';
import { HILL, CLUMPS } from './drapel_mask.js';

// The flag by the cross on the hill above Strada Măgurii, from the user's photo 60 (45.1184398 N 25.7042024 E, by
// their car): a tall faded red-orange pole with the Romanian tricolour hanging limp from it, the lattice cross beyond seen
// exactly edge-on (its arms point along the view), the track climbing the knoll behind it to the wooded hill, the lane on
// the left, the thorn scrub on the meadow.
// The camera is resected on the photo: the skyline of the wooded hill (its dome just left of the frame's centre, traced
// on ~100 columns) against the DEM with ~18 m of canopy on the stands, and the cross's top and foot (pixels 646,1106 /
// 650,1283 on the 1320 x 1517 photo), solved for position, heading, tilt and focal length: 4 of 5 starts land on the
// same pose, the skyline fits to 0.37 deg rms, the cross to 2-6 px. The camera stands ~103 m east of the cross (bearing
// 98 deg: the photo's coordinate is ~70 m off), looks west (279 deg), tilted up 15.3 deg, 49 deg vertical field of view
// (a cropped frame). Seen edge-on from there, the cross's arms run along bearing 98/278 deg (build_geo.py).
// The pole: 17 px thick at the car's roof (a ~11 cm steel pipe) puts it ~11 m ahead, 5 deg right of the centre, just
// past the car's nose; the frame's top edge is ~10.4 m up there and the flag's hoist runs on above it: a ~11.5 m pole,
// the flag (~3 x 2 m) hanging down to ~7 m.
const DIST = 102.95, POLE_AHEAD = 11, POLE_RIGHT = 0.97;       // metres
const VIEW = { pitch: 0.268, fov: 49.0, yawOff: -0.0067 };       // the frame's centre is 0.4 deg right of the cross
const POLE = { h: 11.5, r0: 0.057, r1: 0.032 };
const FLAG = { hoist: 2.0, fly: 3.0, droop: 1.0 };

// the view line: from the cross along its arms (the landmark's rot) back to the camera
function layout() {
  const cross = (GEO.landmarks || []).find(l => l.type === 'cross');
  if (!cross) return null;
  const ux = Math.cos(cross.rot), uz = -Math.sin(cross.rot);            // arms' direction, the eastern end (bearing 98 deg)
  const cam = [cross.x + ux * DIST, cross.z + uz * DIST];
  const hx = -ux, hz = -uz, rx = -hz, rz = hx;                           // heading towards the cross; right of it
  const pole = [cam[0] + hx * POLE_AHEAD + rx * POLE_RIGHT, cam[1] + hz * POLE_AHEAD + rz * POLE_RIGHT];
  return { cross, cam, pole, hx, hz, rx, rz };
}

// The hill's forests as the photo and the aerial show them: the dense broadleaf wood covering the hill behind the cross,
// the woods east and south, the rows of shrubs; the game's stand raster had only parts of them. The traced cover is
// added as broadleaf (code 1) where the raster has none; the map's scattered trees on the open meadow give way to the
// scrub clumps the aerial shows (the photo: dark thorn bushes and small trees on the yellowing grass).
export function prepareDrapel() {
  const B = GEO.forestBits, F = GEO.forest;
  if (!B || !F) return false;
  const bits = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const fo = bits(HILL.forest), op = bits(HILL.open), on = (u, k) => (u[k >> 3] >> (k & 7)) & 1;
  for (let j = 0; j < HILL.nj; j++) for (let i = 0; i < HILL.ni; i++) {
    const k = j * HILL.ni + i;
    if (!on(fo, k)) continue;
    const x = HILL.x0 + 5 * i, z = HILL.z0 + 5 * j, gi = Math.round((x + F.ext) / F.step), gj = Math.round((z + F.ext) / F.step);
    if (gi < 0 || gj < 0 || gi >= F.n || gj >= F.n) continue;
    if ((GEO.holes || []).some(h => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1 && h.test(x, z, 2))) continue;   // kept clear by another module
    const g = gj * F.n + gi;
    if (((B[g >> 2] >> ((g & 3) << 1)) & 3) === 0) B[g >> 2] |= 1 << ((g & 3) << 1);
  }
  const T = GEO.trees;
  if (T) {
    const keep = [];
    for (let t = 0; t < T.n; t++) {
      const i = Math.round((T.x[t] - HILL.x0) / 5), j = Math.round((T.z[t] - HILL.z0) / 5);
      if (!(i >= 0 && j >= 0 && i < HILL.ni && j < HILL.nj && on(op, j * HILL.ni + i))) keep.push(t);
    }
    // and the scrub clumps the aerial shows there, in their place (off the dirt track)
    const u = bits(CLUMPS.b64), dv = new DataView(u.buffer), n = keep.length + CLUMPS.n;
    const out = { n, x: new Float32Array(n), z: new Float32Array(n), t: new Uint8Array(n), s: new Float32Array(n) };
    keep.forEach((t, k) => { out.x[k] = T.x[t]; out.z[k] = T.z[t]; out.t[k] = T.t[t]; out.s[k] = T.s[t]; });
    let k = keep.length;
    for (let c = 0; c < CLUMPS.n; c++) {
      const x = CLUMPS.x0 + dv.getInt16(6 * c, true) / 10, z = CLUMPS.z0 + dv.getInt16(6 * c + 2, true) / 10;
      if (trackDist(x, z) < 3) continue;
      out.x[k] = x; out.z[k] = z; out.t[k] = u[6 * c + 4]; out.s[k] = u[6 * c + 5] / 100; k++;
    }
    GEO.trees = { n: k, x: out.x.subarray(0, k), z: out.z.subarray(0, k), t: out.t.subarray(0, k), s: out.s.subarray(0, k) };
  }
  if (GEO.roads && !GEO.roads.some(r => r.id === 'drapel-track')) GEO.roads.push({ id: 'drapel-track', c: 'track', w: 2.6, s: 'dirt', p: TRACK.flat() });
  // no village poles on the open hilltop (photos 24 and 60: the lane past the cross has none; the generated runs end here)
  const cross = (GEO.landmarks || []).find(l => l.type === 'cross');
  if (cross) for (const run of GEO.poles || []) run.p = run.p.filter(p => Math.hypot(p[0] - cross.x, p[1] - cross.z) > 210);
  return true;
}

// the dirt track from the lane by the cross up across the meadow to the woods (the aerial's bare wheel track, ~2.5 m;
// OSM has only the lane): in the photo it runs up the meadow right of the cross, 100-350 m out, among the scrub
const TRACK = [[-732.5, -1671.3], [-725, -1671.3], [-702.5, -1671.3], [-682.5, -1678.8], [-665, -1690], [-650, -1698.8], [-632.5, -1705],
  [-617.5, -1711.3], [-600, -1718.8], [-580, -1723.8], [-565, -1730], [-550, -1740], [-535, -1752.5], [-522.5, -1756.3], [-500, -1755],
  [-475, -1751.3], [-452.5, -1745], [-432.5, -1735], [-415, -1725], [-400, -1718.8]];

function trackDist(x, z) {
  let d = Infinity;
  for (let i = 1; i < TRACK.length; i++) {
    const [ax, az] = TRACK[i - 1], [bx, bz] = TRACK[i], ex = bx - ax, ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return d;
}

let MT = null;
function mats() {
  if (MT) return MT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // the tricolour: blue, yellow, red vertical bands from the hoist, sun-faded, with a little grain
  const flag = canvas(192, 128), fg = flag.getContext('2d');
  [['#1f3f8f', 0], ['#f2cf1c', 64], ['#cf2a2a', 128]].forEach(([c, x]) => { fg.fillStyle = c; fg.fillRect(x, 0, 64, 128); });
  grain(fg, 192, 128, 10, Math.random);
  // the pole: faded red-orange paint, chipped
  const pole = canvas(32, 256), pg = pole.getContext('2d');
  pg.fillStyle = '#c4553a'; pg.fillRect(0, 0, 32, 256);
  for (let i = 0; i < 90; i++) { pg.fillStyle = `rgba(${150 + Math.random() * 60 | 0},${90 + Math.random() * 40 | 0},70,${0.3 + Math.random() * 0.3})`; pg.fillRect(Math.random() * 32, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 10); }
  MT = {
    flag: std({ map: tex(flag), side: THREE.DoubleSide, roughness: 0.85 }),
    pole: std({ map: tex(pole), roughness: 0.6, metalness: 0.4 }),
    base: std({ color: 0x9f9c94, roughness: 0.95 }),
  };
  return MT;
}

export function buildDrapel(B, world) {
  const L = layout();
  if (!L) return null;
  const Mt = mats();
  const { cam, pole, hx, hz, rx, rz } = L;
  const [px, pz] = pole, py = heightAt(px, pz);
  // the pole, tapering, on a small concrete footing; a halyard down its side
  const g = new THREE.CylinderGeometry(POLE.r1, POLE.r0, POLE.h, 10, 1); g.translate(px, py + POLE.h / 2, pz);
  B.geo(Mt.pole, g);
  const cap = new THREE.SphereGeometry(0.06, 8, 6); cap.translate(px, py + POLE.h + 0.05, pz); B.geo(Mt.pole, cap);
  const foot = new THREE.BoxGeometry(0.8, 0.3, 0.8); foot.translate(px, py + 0.05, pz); B.geo(Mt.base, foot);
  world.addStatic(new world.Box(px, pz, 0.12, 0.12, 0, py - 1, py + POLE.h, 'pole'));
  const wires = [px - rx * 0.06, py + POLE.h - 0.1, pz - rz * 0.06, px - rx * 0.06, py + 1.2, pz - rz * 0.06];   // the halyard, left of the pole in the photo
  // the flag: hoisted to the top and hanging limp down the pole's right side, twisted, the fly end lowest (photo 60)
  {
    const acc = new Acc(), NU = 16, NV = 8, top = py + POLE.h - 0.2;
    const dx = rx * 0.8 + hx * 0.6, dz = rz * 0.8 + hz * 0.6, dl = Math.hypot(dx, dz), ax = dx / dl, az = dz / dl;   // out from the pole
    const P = (i, j) => {
      const u = i / NU, v = j / NV, a = FLAG.droop * (0.55 + 0.45 * u);                                         // steeper towards the fly
      const out = u * FLAG.fly * Math.cos(a) * 0.4 + Math.sin(u * 6 + v * 2) * 0.12, down = v * FLAG.hoist + u * FLAG.fly * Math.sin(a);
      const tw = Math.sin(u * 3.2) * 0.35 * u;                                                                 // the twist
      return [px + ax * out - az * tw, top - down, pz + az * out + ax * tw];
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) acc.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), [-az, 0, ax], [i / NU, 1 - j / NV, (i + 1) / NU, 1 - j / NV, (i + 1) / NU, 1 - (j + 1) / NV, i / NU, 1 - (j + 1) / NV]);
    acc.flush(B, Mt.flag, null, {});
  }
  // the user's car parked just in front of the camera, facing the cross (photo 60): its rear spans half the frame's width
  // (1.8 m over 660 px: the tail ~4.5 m ahead), its roof sits at eye level, the body's centre line 10 deg right of the axis
  const car = { model: 'suv', paint: 0x8b9895, x: cam[0] + hx * 6.75 + rx * 0.82, z: cam[1] + hz * 6.75 + rz * 0.82, h: Math.atan2(-hx, -hz) };
  const bbox = { x0: Math.min(cam[0], px) - 5, x1: Math.max(cam[0], px) + 5, z0: Math.min(cam[1], pz) - 5, z1: Math.max(cam[1], pz) + 5 };
  // the open hilltop: no map trees on the pole, the car or the first 30 m of the view
  const T = GEO.trees;
  if (T) {
    const clear = (x, z) => { const vx = x - cam[0], vz = z - cam[1], f = vx * hx + vz * hz, r = Math.abs(vx * rx + vz * rz); return (f > -6 && f < 30 && r < 7) || Math.hypot(x - px, z - pz) < 6; };
    const keep = []; for (let i = 0; i < T.n; i++) if (!clear(T.x[i], T.z[i])) keep.push(i);
    if (keep.length < T.n) GEO.trees = { n: keep.length, x: Float32Array.from(keep, i => T.x[i]), z: Float32Array.from(keep, i => T.z[i]), t: Uint8Array.from(keep, i => T.t[i]), s: Float32Array.from(keep, i => T.s[i]) };
  }
  return {
    type: 'drapel', name: 'Drapelul de lângă crucea de pe deal', bbox, wires, cars: [car],
    view: { from: cam, yaw: Math.atan2(-hx, -hz) + VIEW.yawOff, pitch: VIEW.pitch, fov: VIEW.fov },
  };
}
