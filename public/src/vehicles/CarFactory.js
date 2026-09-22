/* ============================================================================
   Parametric car builder.

   A car is a lofted side-profile: the silhouette is extruded across the width
   and then re-shaped per vertex (plan-view taper, roof narrowing, tumblehome)
   so it reads as a real body rather than a loaf. Wheels, glass, lights, trim,
   plates and a drivable interior are added on top.
   ========================================================================== */
import * as THREE from 'three';
import { plateTexture } from '../gfx/Textures.js';
import { mergeByMaterial } from '../world/Optimize.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

/* --------------------------- silhouette profiles -------------------------- */
/* Points run clockwise from the front bumper along the top and back along the
   underside. x = longitudinal (−rear .. +front), y = height. Normalised to a
   4.6 m / 1.45 m car and scaled to each model's real dimensions. */
const CABIN = {
  sedan: [4, 9], wagon: [4, 9], hatch: [4, 9], suv: [4, 9], van: [4, 8], pickup: [4, 8],
};

const PROFILES = {
  sedan: [
    [0.500, 0.180], [0.498, 0.300], [0.470, 0.360], [0.360, 0.395], [0.245, 0.410],
    [0.150, 0.610], [0.020, 0.735], [-0.150, 0.740], [-0.290, 0.600], [-0.395, 0.440],
    [-0.470, 0.400], [-0.498, 0.330], [-0.500, 0.190], [-0.480, 0.090], [-0.300, 0.062],
    [0.300, 0.062], [0.480, 0.090],
  ],
  wagon: [
    [0.500, 0.180], [0.498, 0.300], [0.470, 0.360], [0.360, 0.398], [0.245, 0.415],
    [0.145, 0.620], [0.010, 0.760], [-0.300, 0.775], [-0.440, 0.740], [-0.478, 0.560],
    [-0.492, 0.330], [-0.500, 0.190], [-0.480, 0.090], [-0.300, 0.062], [0.300, 0.062],
    [0.480, 0.090],
  ],
  hatch: [
    [0.500, 0.185], [0.496, 0.310], [0.465, 0.372], [0.345, 0.408], [0.230, 0.425],
    [0.130, 0.640], [-0.010, 0.775], [-0.250, 0.780], [-0.400, 0.640], [-0.470, 0.420],
    [-0.496, 0.300], [-0.500, 0.190], [-0.480, 0.090], [-0.300, 0.062], [0.300, 0.062],
    [0.480, 0.090],
  ],
  suv: [
    [0.500, 0.210], [0.498, 0.380], [0.470, 0.500], [0.362, 0.565], [0.250, 0.600],
    [0.160, 0.790], [0.020, 0.965], [-0.300, 0.975], [-0.450, 0.905], [-0.487, 0.640],
    [-0.498, 0.420], [-0.500, 0.250], [-0.480, 0.235], [-0.300, 0.228],
    [0.300, 0.228], [0.480, 0.235],
  ],
  van: [
    [0.500, 0.180], [0.498, 0.330], [0.468, 0.440], [0.380, 0.520], [0.300, 0.580],
    [0.230, 0.840], [0.120, 0.965], [-0.420, 0.990], [-0.485, 0.920], [-0.497, 0.400],
    [-0.500, 0.200], [-0.480, 0.175], [-0.300, 0.168], [0.300, 0.168], [0.480, 0.175],
  ],
  pickup: [
    [0.500, 0.230], [0.498, 0.430], [0.480, 0.560], [0.395, 0.620], [0.300, 0.640],
    [0.205, 0.860], [0.040, 0.995], [-0.130, 1.000], [-0.180, 0.700], [-0.480, 0.690],
    [-0.500, 0.640], [-0.500, 0.300], [-0.480, 0.270], [-0.300, 0.265],
    [0.300, 0.265], [0.480, 0.270],
  ],
};

/** Re-shape an extruded slab into a car-like solid. */
function sculpt(geo, o) {
  const { len, width, noseTaper = 0.18, tailTaper = 0.12, roofNarrow = 0.22,
    beltline = 0.42, tumblehome = 0.055, topY = 1.0 } = o;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const sm = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const tx = (v.x / len) + 0.5;                       // 0 at tail, 1 at nose
    let w = 1;
    w -= noseTaper * sm(0.72, 1.02, tx);                // nose pulls in
    w -= tailTaper * sm(0.24, 0.0, tx);                 // and so does the tail
    const yr = v.y / topY;
    w *= 1 - roofNarrow * sm(beltline, 1.0, yr);        // greenhouse is narrower
    w *= 1 - tumblehome * sm(0.22, 0.02, yr);           // rocker tucks under
    v.z *= w;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * One road wheel. The axle runs along **Z** (the vehicle's right axis), which is
 * what cannon-es's RaycastVehicle expects with axleLocal = (0,0,1); building it
 * on any other axis makes the wheels face forwards.
 * `side` is +1 for the right-hand wheels, -1 for the left, so the rim face can
 * be put on the outboard side without mirroring the whole group.
 */
function wheel(mats, { radius = 0.33, width = 0.22, rim = 0xbfc4c8, spokes = 5, side = 1 }) {
  const g = new THREE.Group();
  const rubber = mats.plain(0x0e0f11, { roughness: 0.95 });
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 22, 1, true), rubber);
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);
  // rounded shoulders so the tread is not a raw open cylinder
  for (const z of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.038, 0.04, 6, 20),
      mats.plain(0x131417, { roughness: 0.93 }));
    sh.position.z = z * (width / 2 - 0.005);
    g.add(sh);
  }
  const rimMat = mats.plain(rim, { roughness: 0.38, metalness: 0.86 });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.70, radius * 0.70, width * 0.9, 20), rimMat);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width * 0.12, 20),
    mats.plain(0x2a2d31, { roughness: 0.55, metalness: 0.4 }));
  dish.rotation.x = Math.PI / 2;
  dish.position.z = side * (width * 0.40);
  g.add(dish);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.20, radius * 0.20, width * 0.2, 12), rimMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = side * (width * 0.46);
  g.add(hub);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.17, radius * 0.60, width * 0.16), rimMat);
    sp.position.set(Math.cos(a) * radius * 0.33, Math.sin(a) * radius * 0.33, side * (width * 0.44));
    sp.rotation.z = a + Math.PI / 2;
    g.add(sp);
  }
  // bolt circle
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, width * 0.08, 6),
      mats.plain(0x9ba1a6, { roughness: 0.4, metalness: 0.9 }));
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * radius * 0.16, Math.sin(a) * radius * 0.16, side * (width * 0.50));
    g.add(b);
  }
  // a wheel moves as one rigid unit, so batch its 15 parts down to a handful
  mergeByMaterial(g);
  return g;
}

/**
 * First-person interior — what you actually look at while driving.
 * +X is forward, +Z is the car's right, so lateral offsets go on Z.
 * Romania drives on the right, so the driver sits on the −Z side.
 */
function interior(mats, o) {
  const { width, len, height, style } = o;
  const g = new THREE.Group();
  const dark = mats.plain(0x15181c, { roughness: 0.86 });
  const seatMat = mats.plain(0x1d2126, { roughness: 0.9 });
  const driverZ = -width * 0.25;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(len * 0.60, 0.04, width * 0.86), dark);
  floor.position.set(-len * 0.02, height * 0.30, 0);
  g.add(floor);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, width * 0.86), dark);
  dash.position.set(len * 0.205, height * 0.545, 0);
  dash.rotation.z = 0.16;
  g.add(dash);
  const topPad = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, width * 0.84), dark);
  topPad.position.set(len * 0.175, height * 0.625, 0);
  g.add(topPad);

  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.32),
    mats.plain(0x05070a, { roughness: 0.35 }));
  cluster.position.set(len * 0.165, height * 0.63, driverZ);
  cluster.rotation.z = 0.35;
  g.add(cluster);

  /* steering wheel: the column rakes back, the rim spins about the column */
  const pivot = new THREE.Group();
  pivot.position.set(len * 0.145, height * 0.615, driverZ);
  pivot.rotation.z = -0.50;
  const spinner = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.022, 8, 24),
    mats.plain(0x101215, { roughness: 0.7 }));
  rim.rotation.y = Math.PI / 2;
  spinner.add(rim);
  const boss = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.10), mats.plain(0x181b1f, { roughness: 0.6 }));
  spinner.add(boss);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.155, 0.03), mats.plain(0x181b1f, { roughness: 0.6 }));
    spoke.position.set(0, Math.sin(a) * 0.088, Math.cos(a) * 0.088);
    spoke.rotation.x = -a + Math.PI / 2;
    spinner.add(spoke);
  }
  pivot.add(spinner);
  g.add(pivot);
  g.userData.steering = spinner;

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 8), dark);
  column.position.set(len * 0.178, height * 0.545, driverZ);
  column.rotation.z = Math.PI / 2 - 0.5;
  g.add(column);

  const seatX = style === 'pickup' || style === 'van' ? len * 0.02 : -len * 0.03;
  for (const sz of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.12, width * 0.32), seatMat);
    base.position.set(seatX, height * 0.395, sz * width * 0.25);
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, width * 0.32), seatMat);
    back.position.set(seatX - 0.27, height * 0.615, sz * width * 0.25);
    back.rotation.z = -0.14;
    g.add(back);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.17, width * 0.17), seatMat);
    head.position.set(seatX - 0.32, height * 0.80, sz * width * 0.25);
    g.add(head);
  }
  if (style !== 'pickup') {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, width * 0.80), seatMat);
    bench.position.set(seatX - 0.88, height * 0.395, 0);
    g.add(bench);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.54, width * 0.80), seatMat);
    bb.position.set(seatX - 1.12, height * 0.60, 0);
    bb.rotation.z = -0.12;
    g.add(bb);
  }
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.22), mats.plain(0x101215, { roughness: 0.5 }));
  mirror.position.set(len * 0.135, height * 0.915, 0);
  g.add(mirror);
  return g;
}

/**
 * @param {object} spec
 *   style   sedan|wagon|hatch|suv|van|pickup
 *   len,width,height   real dimensions in metres
 *   wheelbase, trackF/trackR, wheelR, wheelW
 *   color, rim, plate {text,country}
 *   roofRails, roofBox, tonneau, tailgateOpen, doorOpen
 */
export function buildCar(spec, mats) {
  const {
    style = 'sedan', len = 4.66, width = 1.81, height = 1.47,
    wheelbase = 2.68, trackF = 1.55, trackR = 1.54, wheelR = 0.33, wheelW = 0.225,
    color = 0x1a1c1f, metallic = 0.65, rim = 0xc2c7cb,
    plate = { text: 'PH 00 XXX', country: 'RO' },
    roofRails = false, roofBox = false, tonneau = false,
    tailgateOpen = false, doorOpen = false, glassTint = 0x0c1116, glassOpacity = 0.5,
    lightsOn = false, name = 'car',
  } = spec;

  const root = new THREE.Group();
  root.name = name;

  /* ------------------------------ body ---------------------------------- */
  const profRaw = PROFILES[style] || PROFILES.sedan;
  // each profile is normalised by its own roof height, so a van or a pickup
  // ends up exactly as tall as its spec says rather than 30 % too tall
  const profMaxY = Math.max(...profRaw.map(p => p[1]));
  const prof = profRaw.map(([x, y]) => [x * len, y * height / profMaxY]);
  const [ca, cb] = CABIN[style] || CABIN.sedan;
  const roofY = Math.max(...prof.map(p => p[1]));
  const beltY = (prof[ca][1] + prof[cb][1]) / 2;
  const cabFrontX = prof[ca][0], cabBackX = prof[cb][0];
  const paint = mats.carPaint(color, { metallic });
  const glassMat = mats.glass({ tint: glassTint, opacity: glassOpacity });
  const trimMat = mats.plain(0x121417, { roughness: 0.55, metalness: 0.3 });

  const extrude = (points, depth, bev = 0.05) => {
    const shape = new THREE.Shape(points.map(([x, y]) => V2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bev * 2, bevelEnabled: bev > 0,
      bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 2,
    });
    g.translate(0, 0, -(depth - bev * 2) / 2);
    return g;
  };

  /* --- tub: the silhouette with the greenhouse removed ------------------ */
  const tubPts = [...prof.slice(0, ca + 1), ...prof.slice(cb)];
  const tubGeo = extrude(tubPts, width, Math.min(0.07, width * 0.05));
  sculpt(tubGeo, {
    len, width, topY: height,
    noseTaper: style === 'van' ? 0.10 : style === 'pickup' ? 0.10 : 0.16,
    tailTaper: style === 'van' ? 0.06 : 0.10,
    roofNarrow: 0.10, beltline: 0.62, tumblehome: 0.07,
  });
  const body = new THREE.Mesh(tubGeo, paint);
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);

  /* --- greenhouse: glass volume + opaque roof skin + pillars ------------- */
  const cabinPts = prof.slice(ca, cb + 1);
  const glassW = width * (style === 'van' ? 0.90 : 0.87);
  const cabinGeo = extrude(cabinPts, glassW, 0.025);
  sculpt(cabinGeo, {
    len, width: glassW, topY: height,
    noseTaper: 0.06, tailTaper: 0.05, roofNarrow: 0.16, beltline: 0.80, tumblehome: 0,
  });
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.renderOrder = 2;
  root.add(cabin);

  // roof skin in body colour, sitting on the top of the glass volume
  const roofPts = cabinPts.filter(([, y]) => y > roofY - height * 0.055);
  if (roofPts.length >= 2) {
    const rx0 = Math.min(...roofPts.map(p => p[0])), rx1 = Math.max(...roofPts.map(p => p[0]));
    const roofSkin = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, rx1 - rx0) + 0.06, 0.07, glassW * 1.015), paint);
    roofSkin.position.set((rx0 + rx1) / 2, roofY - 0.03, 0);
    roofSkin.castShadow = true;
    root.add(roofSkin);
  }

  // A / B / C pillars, mirrored either side of the glass volume
  {
    const pillarZ = glassW * 0.47;
    const mkPillar = (x0, y0, x1, y1, thick) => {
      // trimmed at both ends so pillars sit between the beltline and the roof
      // skin instead of poking through them like a roll cage
      const L = Math.hypot(x1 - x0, y1 - y0) - 0.09;
      if (L < 0.05) return;
      for (const sgn of [-1, 1]) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(L, thick, 0.05), paint);
        pl.position.set((x0 + x1) / 2, (y0 + y1) / 2, sgn * pillarZ);
        pl.rotation.z = Math.atan2(y1 - y0, x1 - x0);
        pl.castShadow = true;
        root.add(pl);
      }
    };
    const top = cabinPts.filter(([, y]) => y > roofY - height * 0.055);
    const roofFront = top.length ? top.reduce((a, b) => (b[0] > a[0] ? b : a)) : cabinPts[1];
    const roofBack = top.length ? top.reduce((a, b) => (b[0] < a[0] ? b : a)) : cabinPts[cabinPts.length - 2];
    mkPillar(prof[ca][0], prof[ca][1], roofFront[0], roofFront[1], 0.065);    // A
    mkPillar(prof[cb][0], prof[cb][1], roofBack[0], roofBack[1], 0.065);     // C
    const bx = (roofFront[0] + roofBack[0]) / 2 + (style === 'van' ? 0.4 : 0.05);
    mkPillar(bx, beltY - 0.03, bx, roofY - 0.02, 0.07);                      // B
  }

  /* ------------------------------ wheels --------------------------------- */
  const wheels = [];
  const axleF = wheelbase / 2, axleR = -wheelbase / 2;
  for (const [ax, track, front] of [[axleF, trackF, true], [axleR, trackR, false]]) {
    for (const s of [-1, 1]) {
      const w = wheel(mats, { radius: wheelR, width: wheelW, rim, side: s });
      w.position.set(ax, wheelR, s * (track / 2));
      w.userData.front = front; w.userData.side = s;
      w.userData.noMerge = true;         // wheels move independently of the body
      root.add(w);
      wheels.push(w);
      // arch lip: reads as a wheel cut-out without needing CSG on the body
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(wheelR * 1.10, 0.022, 6, 18, Math.PI * 1.02),
        mats.plain(0x0b0c0e, { roughness: 0.85 }));
      arch.rotation.set(0, Math.PI / 2, -0.04);
      arch.position.set(ax, wheelR + 0.005, s * (width * 0.452));
      root.add(arch);
    }
  }

  /* ------------------------------ lights --------------------------------- */
  const headMat = mats.lamp(0xfff6e2, lightsOn ? 2.4 : 0.05).clone();
  const tailMat = mats.lamp(0xd41c14, 0.12).clone();
  const housing = mats.plain(0x14171a, { roughness: 0.32, metalness: 0.25 });
  const lampGroups = { head: [], tail: [], brake: [], reverse: [] };
  const nose = len * 0.478, tail = -len * 0.478;
  const hlY = height * (style === 'pickup' || style === 'suv' ? 0.50 : 0.47);
  const tlY = height * (style === 'van' ? 0.60 : 0.50);
  for (const s of [-1, 1]) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, width * 0.27), housing);
    hb.position.set(nose - 0.02, hlY, s * width * 0.30);
    root.add(hb);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, width * 0.22), headMat);
    hl.position.set(nose + 0.05, hlY, s * width * 0.30);
    root.add(hl); lampGroups.head.push(hl);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, width * 0.23), housing);
    tb.position.set(tail + 0.02, tlY, s * width * 0.32);
    root.add(tb);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, width * 0.19), tailMat);
    tl.position.set(tail - 0.04, tlY, s * width * 0.32);
    root.add(tl); lampGroups.tail.push(tl);
  }
  // grille + bumper inserts
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, height * 0.12, width * 0.46),
    mats.plain(0x0b0c0e, { roughness: 0.42, metalness: 0.5 }));
  grille.position.set(nose - 0.02, height * 0.44, 0);
  root.add(grille);
  const lowerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.05, height * 0.09, width * 0.56),
    mats.plain(0x0d0e10, { roughness: 0.6 }));
  lowerIntake.position.set(nose - 0.03, height * 0.27, 0);
  root.add(lowerIntake);

  /* ------------------------------ plates --------------------------------- */
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTexture(plate.text, plate.country), roughness: 0.5, metalness: 0.05,
  });
  for (const [px, ry] of [[nose - 0.01, Math.PI / 2], [tail + 0.01, -Math.PI / 2]]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plateMat);
    pl.position.set(px, height * 0.28, 0);
    pl.rotation.y = ry;
    root.add(pl);
  }

  /* ------------------------------- trim ---------------------------------- */
  for (const s of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.05), paint);
    mirror.position.set(cabFrontX - 0.18, beltY + 0.10, s * (width * 0.53));
    root.add(mirror);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.09), trimMat);
    arm.position.set(cabFrontX - 0.16, beltY + 0.08, s * (width * 0.49));
    root.add(arm);
    // door shut lines
    for (const dx of [cabFrontX - (cabFrontX - cabBackX) * 0.5, cabFrontX - (cabFrontX - cabBackX) * 0.02]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.012, height * 0.42), trimMat);
      line.position.set(dx, height * 0.40, s * (width * 0.478));
      line.rotation.y = s * Math.PI / 2;
      root.add(line);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 0.03), mats.chrome(0xb9bec3, 0.3));
    handle.position.set(cabFrontX - (cabFrontX - cabBackX) * 0.30, beltY - 0.06, s * (width * 0.487));
    root.add(handle);
  }
  for (const s of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(len * 0.48, 0.05, 0.05), trimMat);
    sill.position.set(0, height * 0.145, s * (width * 0.455));
    root.add(sill);
  }

  /* --------------------------- style extras ------------------------------ */
  if (roofRails) {
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len * 0.44, 0.04, 0.05),
        mats.chrome(0x8d9399, 0.35));
      rail.position.set(-len * 0.06, roofY + 0.03, s * width * 0.34);
      root.add(rail);
    }
  }
  if (roofBox) {
    const bx = new THREE.Mesh(new THREE.BoxGeometry(len * 0.38, 0.34, width * 0.52),
      mats.plain(0x15181b, { roughness: 0.35, metalness: 0.1 }));
    bx.position.set(-len * 0.04, roofY + 0.20, 0);
    bx.castShadow = true;
    root.add(bx);
  }
  if (tonneau) {
    const cov = new THREE.Mesh(new THREE.BoxGeometry(len * 0.34, 0.05, width * 0.86),
      mats.plain(0x0d0f11, { roughness: 0.55 }));
    cov.position.set(-len * 0.30, height * 0.70, 0);
    cov.castShadow = true;
    root.add(cov);
  }

  /* ---------------------------- interior --------------------------------- */
  const inner = interior(mats, { width, len, height, style });
  inner.userData.steering.userData.noMerge = true;   // the wheel turns
  root.add(inner);

  /* --------------------------- open panels ------------------------------- */
  if (tailgateOpen) {
    // hinged at the rear of the roof and swung up, like the Octavia in the photo
    const hingeX = cabBackX - 0.08, hingeY = roofY - 0.06;
    const panelLen = Math.hypot(prof[cb][0] - hingeX, prof[cb][1] - hingeY) + 0.30;
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, hingeY, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.06, width * 0.82), paint);
    panel.position.set(-panelLen / 2, 0, 0);
    panel.castShadow = true;
    pivot.add(panel);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(panelLen * 0.62, 0.03, width * 0.7), glassMat);
    pane.position.set(-panelLen * 0.58, 0.04, 0);
    pivot.add(pane);
    pivot.rotation.z = -1.05;
    pivot.userData.noMerge = true;
    root.add(pivot);
    root.userData.tailgate = pivot;
  }
  if (doorOpen) {
    const pivot = new THREE.Group();
    pivot.position.set(cabFrontX - (cabFrontX - cabBackX) * 0.05, 0, -width * 0.47);
    const door = new THREE.Mesh(new THREE.BoxGeometry((cabFrontX - cabBackX) * 0.45, height * 0.52, 0.06), paint);
    door.position.set(-(cabFrontX - cabBackX) * 0.22, height * 0.42, 0);
    door.castShadow = true;
    pivot.add(door);
    pivot.rotation.y = -1.0;
    root.add(pivot);
  }

  root.userData = {
    spec, wheels, lamps: lampGroups,
    lampMaterials: { head: headMat, tail: tailMat }, steering: inner.userData.steering,
    dims: { len, width, height, wheelR, wheelbase, trackF, trackR },
    // driver's eye: roughly 0.75 m behind the wheel rim and a little above it,
    // which is what the view out of a real car looks like
    seatPos: new THREE.Vector3(
      len * (style === 'van' || style === 'pickup' ? -0.005 : -0.05),
      height * (style === 'van' ? 0.80 : style === 'pickup' ? 0.78 : 0.79),
      -width * 0.25),
  };
  return root;
}
