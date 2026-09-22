/* ============================================================================
   Parametric builders for everything man-made on the site.
   Each returns a THREE.Group and pushes its colliders onto `colliders`
   ({cx,cy,cz,sx,sy,sz,rotY}) so the physics world can mirror the geometry.
   ========================================================================== */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { signTexture } from '../gfx/Textures.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Merge a list of {geo, matrix} into one BufferGeometry (single draw call). */
function mergeParts(parts) {
  const geos = parts.map(p => {
    const g = p.geo.clone();
    g.applyMatrix4(p.matrix);
    return g;
  });
  const merged = BGU.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return merged;
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1));

/**
 * A wall with rectangular openings, built from solid segments instead of CSG.
 * `openings`: [{x, w, y0, y1}] in wall-local coordinates (x centred on 0).
 */
export function wallWithOpenings(width, height, thickness, openings = []) {
  const parts = [];
  const sorted = [...openings].sort((a, b) => (a.x - a.w / 2) - (b.x - b.w / 2));
  let cursor = -width / 2;
  for (const o of sorted) {
    const left = o.x - o.w / 2, right = o.x + o.w / 2;
    if (left > cursor + 0.001) {
      const w = left - cursor;
      parts.push({ geo: box(w, height, thickness), matrix: M(cursor + w / 2, height / 2, 0) });
    }
    if (o.y0 > 0.001) parts.push({ geo: box(o.w, o.y0, thickness), matrix: M(o.x, o.y0 / 2, 0) });
    if (o.y1 < height - 0.001) {
      const h = height - o.y1;
      parts.push({ geo: box(o.w, h, thickness), matrix: M(o.x, o.y1 + h / 2, 0) });
    }
    cursor = Math.max(cursor, right);
  }
  if (cursor < width / 2 - 0.001) {
    const w = width / 2 - cursor;
    parts.push({ geo: box(w, height, thickness), matrix: M(cursor + w / 2, height / 2, 0) });
  }
  return mergeParts(parts);
}

/** Right-triangle gable piece: fills between a rectangular wall of height
    `hLow` and a roof that rises to `hHigh` at the `high` end (-1 = west). */
function gableTriangle(width, hLow, hHigh, thickness, high = -1) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  if (high < 0) shape.lineTo(-width / 2, hHigh - hLow);
  else { shape.lineTo(width / 2, hHigh - hLow); shape.lineTo(-width / 2, 0); }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** Sloped (mono-pitch) side wall: trapezoid extruded through the wall thickness. */
function slopedSideWall(depth, hFront, hBack, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(-depth / 2, 0);
  shape.lineTo(depth / 2, 0);
  shape.lineTo(depth / 2, hBack);
  shape.lineTo(-depth / 2, hFront);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/* ============================== workshop hall ============================= */
/**
 * @param {object} o
 *  w,d            footprint (X, Z)
 *  hFront,hBack   eave heights; the roof slopes up towards −Z (north)
 *  doors          [{x, w, h}] on the south face
 *  canopy         depth of the canopy over the doors (0 = none)
 */
export function buildHall(o, mats, colliders) {
  const {
    x = 0, z = 0, w = 28, d = 14, hFront = 4.6, hBack = 5.6, rotY = 0,
    doors = [], canopy = 0, windowStrip = true, name = 'hall',
    wallMat = 'panel', plinth = 0.85, interior = true, openDoors = [],
    // 'z' (default): the roof rises towards the back. 'x': it rises towards the
    // west, so the door face itself is a trapezoid — which is what the garage
    // in the reference photos actually does.
    slopeAxis = 'z', overhang: overIn = 0.55, brackets = false,
  } = o;
  const hHigh = Math.max(hFront, hBack), hLow = Math.min(hFront, hBack);
  const eaveH = slopeAxis === 'x' ? hLow : hFront;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.name = name;

  const T = 0.22;                       // panel thickness
  const wall = mats.surface(wallMat, w, hFront);
  const plinthMat = mats.plain(0x5c6268, { roughness: 0.72 });
  const trim = mats.plain(0x3a4046, { roughness: 0.5, metalness: 0.45 });

  /* --- south face (the one with the doors) --- */
  const openings = doors.map(dr => ({ x: dr.x, w: dr.w + 0.18, y0: 0, y1: dr.h + 0.18 }));
  const south = new THREE.Mesh(wallWithOpenings(w, eaveH, T, openings), wall);
  south.position.z = d / 2;
  south.castShadow = south.receiveShadow = true;
  g.add(south);

  if (slopeAxis === 'x') {
    /* the face is a trapezoid: rectangle up to the low eave, triangle above */
    for (const sz of [1, -1]) {
      const tri = new THREE.Mesh(gableTriangle(w, hLow, hHigh, T, -1), wall);
      tri.position.set(0, hLow, sz * d / 2);
      tri.castShadow = tri.receiveShadow = true;
      g.add(tri);
    }
    const north = new THREE.Mesh(box(w, hLow, T), wall);
    north.position.set(0, hLow / 2, -d / 2);
    north.castShadow = north.receiveShadow = true;
    g.add(north);
    /* west end is the tall one, east end the low one */
    for (const [sx, hh] of [[-1, hHigh], [1, hLow]]) {
      const side = new THREE.Mesh(box(T, hh, d), wall);
      side.position.set(sx * (w / 2 - T / 2), hh / 2, 0);
      side.castShadow = side.receiveShadow = true;
      g.add(side);
    }
  } else {
    const north = new THREE.Mesh(box(w, hBack, T), wall);
    north.position.set(0, hBack / 2, -d / 2);
    north.castShadow = north.receiveShadow = true;
    g.add(north);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(slopedSideWall(d, hFront, hBack, T), wall);
      side.position.set(s * (w / 2 - T / 2), 0, 0);
      side.castShadow = side.receiveShadow = true;
      g.add(side);
    }
  }

  /* --- plinth band: these halls all sit on a grey painted skirt --- */
  const skirt = new THREE.Mesh(box(w + 0.06, plinth, d + 0.06), plinthMat);
  skirt.position.y = plinth / 2;
  skirt.castShadow = skirt.receiveShadow = true;
  g.add(skirt);

  /* --- mono-pitch roof --- */
  const over = overIn;
  if (slopeAxis === 'x') {
    const slopeLen = Math.hypot(w, hHigh - hLow);
    const angle = Math.atan2(hHigh - hLow, w);
    // the eaves project deeply over the door face but only a little past the
    // gable ends, which is what the close-up photo shows
    const overEnd = Math.min(0.5, over * 0.4);
    const roof = new THREE.Mesh(box(slopeLen + overEnd * 2, 0.14, d + over * 2),
      mats.surface('roofSheet', slopeLen, d + over * 2));
    roof.position.set(0, (hHigh + hLow) / 2 + 0.07, 0);
    roof.rotation.z = angle;            // high at −X, low at +X
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);
    /* verge trim along both long edges, following the slope */
    for (const sz of [1, -1]) {
      const fascia = new THREE.Mesh(box(slopeLen + overEnd * 2, 0.2, 0.08), trim);
      fascia.position.set(0, (hHigh + hLow) / 2 + 0.01, sz * (d / 2 + over));
      fascia.rotation.z = angle;
      g.add(fascia);
    }
    /* diagonal struts from the wall up to the eave, as in the photo */
    if (brackets) {
      const n = Math.max(2, Math.round(w / 3.4));
      const eaveAt = (bx) => hLow + (hHigh - hLow) * (0.5 - bx / w);
      for (let i = 0; i <= n; i++) {
        const bx = -w / 2 + (i / n) * w;
        const yTop = eaveAt(bx) + 0.02;
        const yWall = yTop - 0.85;
        const len = Math.hypot(over, yTop - yWall);
        const br = new THREE.Mesh(box(0.08, 0.09, len), trim);
        br.position.set(bx, (yTop + yWall) / 2, d / 2 + over / 2);
        br.rotation.x = -Math.atan2(yTop - yWall, over);
        br.castShadow = true;
        g.add(br);
      }
    }
    /* downpipe on the low (east) end */
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hLow - 0.3, 8),
      mats.plain(0x99a0a6, { roughness: 0.45, metalness: 0.6 }));
    pipe.position.set(w / 2 - 0.3, (hLow - 0.3) / 2, d / 2 + 0.14);
    g.add(pipe);
  } else {
    const slopeLen = Math.hypot(d, hBack - hFront);
    const angle = Math.atan2(hBack - hFront, d);
    const overEnd = Math.min(0.5, over * 0.5);
    const roof = new THREE.Mesh(box(w + overEnd * 2, 0.14, slopeLen + over * 1.6),
      mats.surface('roofSheet', w + overEnd * 2, slopeLen, { rotation: Math.PI / 2 }));
    roof.position.set(0, (hFront + hBack) / 2 + 0.07, 0);
    roof.rotation.x = -angle;
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);

    if (brackets) {
      const n = Math.max(2, Math.round(w / 3.4));
      for (let i = 0; i <= n; i++) {
        const bx = -w / 2 + (i / n) * w;
        const yTop = hFront - 0.1, yWall = yTop - 0.8;
        const len = Math.hypot(over, yTop - yWall);
        const br = new THREE.Mesh(box(0.08, 0.09, len), trim);
        br.position.set(bx, (yTop + yWall) / 2, d / 2 + over / 2);
        br.rotation.x = -Math.atan2(yTop - yWall, over);
        br.castShadow = true;
        g.add(br);
      }
    }

    const fascia = new THREE.Mesh(box(w + overEnd * 2, 0.26, 0.1), trim);
    fascia.position.set(0, hFront - 0.06, d / 2 + over);
    g.add(fascia);
    const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, w + overEnd * 1.6, 8, 1, true, 0, Math.PI),
      mats.plain(0x99a0a6, { roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide }));
    gutter.rotation.set(0, 0, Math.PI / 2);
    gutter.position.set(0, hFront - 0.24, d / 2 + over - 0.04);
    g.add(gutter);
    for (const s of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hFront - 0.3, 8),
        mats.plain(0x99a0a6, { roughness: 0.45, metalness: 0.6 }));
      pipe.position.set(s * (w / 2 - 0.35), (hFront - 0.3) / 2, d / 2 + 0.16);
      g.add(pipe);
    }
  }

  /* --- window strip just under the eave, as on the real halls --- */
  if (windowStrip) {
    const strip = new THREE.Mesh(box(w * 0.82, 0.55, 0.06), mats.glass({ opacity: 0.48 }));
    strip.position.set(0, eaveH - 0.75, d / 2 + 0.06);
    g.add(strip);
    const frame = new THREE.Mesh(box(w * 0.82 + 0.1, 0.68, 0.05), trim);
    frame.position.set(0, eaveH - 0.75, d / 2 + 0.02);
    g.add(frame);
  }

  /* --- sectional doors --- */
  const doorMat = mats.surface('sectionalDoor', 4.2, 4.0);
  g.userData.doors = [];
  doors.forEach((dr, i) => {
    const open = openDoors.includes(i);
    const leaf = new THREE.Mesh(box(dr.w, dr.h, 0.1), doorMat);
    leaf.castShadow = leaf.receiveShadow = true;
    const frame = new THREE.Mesh(wallWithOpenings(dr.w + 0.22, dr.h + 0.22, 0.09,
      [{ x: 0, w: dr.w, y0: 0, y1: dr.h }]), trim);
    frame.position.set(dr.x, 0, d / 2 + 0.12);
    g.add(frame);
    const pivot = new THREE.Group();
    pivot.position.set(dr.x, 0, d / 2 + 0.02);
    leaf.position.y = dr.h / 2;
    pivot.add(leaf);
    g.add(pivot);
    // glazed top row, like the door in the first photo
    const glazing = new THREE.Mesh(box(dr.w * 0.86, 0.42, 0.04), mats.glass({ opacity: 0.4 }));
    glazing.position.set(0, dr.h - 0.52, 0.06);
    leaf.add(glazing);
    if (open) { leaf.position.y = dr.h / 2 + (dr.h - 0.18); leaf.visible = false; }
    g.userData.doors.push({ pivot, leaf, h: dr.h, open, t: open ? 1 : 0, worldX: x + dr.x, worldZ: z + d / 2 });
  });

  /* --- canopy over the doorway (the first photo's garage has one) --- */
  if (canopy > 0) {
    const cw = w * 0.92;
    const c = new THREE.Mesh(box(cw, 0.1, canopy),
      mats.surface('roofSheet', cw, canopy, { rotation: Math.PI / 2 }));
    c.position.set(0, eaveH - 0.45, d / 2 + canopy / 2);
    c.rotation.x = 0.07;
    c.castShadow = c.receiveShadow = true;
    g.add(c);
    const edge = new THREE.Mesh(box(cw, 0.18, 0.06), trim);
    edge.position.set(0, eaveH - 0.52, d / 2 + canopy);
    g.add(edge);
    for (const s of [-1, 1]) {
      const stay = new THREE.Mesh(box(0.05, 0.05, canopy * 1.2), trim);
      stay.position.set(s * cw * 0.46, eaveH - 0.28, d / 2 + canopy / 2);
      stay.rotation.x = -0.32;
      g.add(stay);
    }
  }

  /* --- interior shell so open doors reveal a real space --- */
  if (interior) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - T * 2, d - T * 2),
      mats.surface('concrete', w, d));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.02;
    floor.receiveShadow = true;
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w - T * 2, d - T * 2),
      mats.plain(0xb8bcc0, { roughness: 0.92 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, eaveH + (hHigh - hLow) * 0.35 - 0.2, 0);
    g.add(ceil);
    // interior fill light so the bays are not pitch black from outside
    const il = new THREE.PointLight(0xffeedd, 0.5, 26, 2);
    il.position.set(0, eaveH - 1.2, 0);
    g.add(il);
    g.userData.interiorLight = il;
  }

  /* --- colliders: four walls, with gaps left at the doorways --- */
  const push = (cx, cy, cz, sx, sy, sz) => {
    const p = new THREE.Vector3(cx, cy, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    colliders.push({ cx: x + p.x, cy, cz: z + p.z, sx, sy, sz, rotY });
  };
  push(0, hHigh / 2, -d / 2, w, hHigh, 0.4);                       // north
  push(-w / 2, hHigh / 2, 0, 0.4, hHigh, d);                       // west
  push(w / 2, eaveH / 2, 0, 0.4, eaveH + 0.6, d);                  // east
  {   // south face split around the openings
    const sorted = [...doors].sort((a, b) => a.x - b.x);
    let cur = -w / 2;
    for (const dr of sorted) {
      const l = dr.x - dr.w / 2;
      if (l > cur + 0.05) push((cur + l) / 2, eaveH / 2, d / 2, l - cur, eaveH, 0.4);
      cur = dr.x + dr.w / 2;
    }
    if (cur < w / 2 - 0.05) push((cur + w / 2) / 2, eaveH / 2, d / 2, w / 2 - cur, eaveH, 0.4);
    for (const dr of sorted) push(dr.x, dr.h + (eaveH - dr.h) / 2, d / 2, dr.w, Math.max(0.2, eaveH - dr.h), 0.4);
  }
  return g;
}

/* ================================= house ================================== */
export function buildHouse(o, mats, colliders) {
  const {
    x = 0, z = 0, w = 12, d = 11, wallH = 3.0, roofH = 3.0, rotY = 0,
    overhang = 0.7, name = 'house', dormer = false,
  } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.name = name;

  const plasterMat = mats.surface('plaster', w, wallH);
  const tileMat = mats.surface('roofTile', w, roofH * 1.6);

  const windows = [];
  for (let i = -1; i <= 1; i++) windows.push({ x: i * (w / 3.2), w: 1.3, y0: 1.0, y1: 2.4 });
  const front = new THREE.Mesh(wallWithOpenings(w, wallH, 0.3, windows), plasterMat);
  front.position.z = d / 2; front.castShadow = front.receiveShadow = true; g.add(front);
  const back = new THREE.Mesh(box(w, wallH, 0.3), plasterMat);
  back.position.set(0, wallH / 2, -d / 2); back.castShadow = back.receiveShadow = true; g.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(box(0.3, wallH, d), plasterMat);
    side.position.set(s * w / 2, wallH / 2, 0);
    side.castShadow = side.receiveShadow = true; g.add(side);
  }
  for (const win of windows) {
    const pane = new THREE.Mesh(box(win.w - 0.1, win.y1 - win.y0 - 0.1, 0.05), mats.glass({ opacity: 0.62 }));
    pane.position.set(win.x, (win.y0 + win.y1) / 2, d / 2 + 0.02);
    g.add(pane);
    const fr = new THREE.Mesh(wallWithOpenings(win.w, win.y1 - win.y0, 0.07,
      [{ x: 0, w: win.w - 0.14, y0: 0.07, y1: win.y1 - win.y0 - 0.07 }]), mats.plain(0xf0eee8, { roughness: 0.6 }));
    fr.position.set(win.x, win.y0, d / 2 + 0.1);
    g.add(fr);
  }

  /* hipped tile roof */
  const rw = w + overhang * 2, rd = d + overhang * 2;
  const roofGeo = new THREE.BufferGeometry();
  const hx = rw / 2, hz = rd / 2, ridge = rw * 0.22;
  const v = [
    -hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz,      // eave 0..3
    -ridge, roofH, 0, ridge, roofH, 0,                    // ridge 4,5
  ];
  const idx = [
    0, 1, 5, 0, 5, 4,     // north slope
    2, 3, 4, 2, 4, 5,     // south slope
    1, 2, 5,              // east hip
    3, 0, 4,              // west hip
  ];
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  // planar UVs so the tile texture runs down the slope
  const pos = roofGeo.attributes.position;
  const uv = [];
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / 2.4, (pos.getZ(i) + pos.getY(i) * 1.1) / 2.4);
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const roof = new THREE.Mesh(roofGeo, tileMat);
  roof.material.side = THREE.DoubleSide;
  roof.position.y = wallH;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);

  if (dormer) {
    const dm = new THREE.Mesh(box(1.6, 1.1, 1.4), plasterMat);
    dm.position.set(0, wallH + 0.9, d / 2 - 1.2);
    dm.castShadow = true; g.add(dm);
    const dw = new THREE.Mesh(box(0.9, 0.7, 0.06), mats.glass({ opacity: 0.6 }));
    dw.position.set(0, wallH + 0.95, d / 2 - 0.52);
    g.add(dw);
  }

  const p = new THREE.Vector3(0, 0, 0);
  colliders.push({ cx: x + p.x, cy: (wallH + roofH * 0.5) / 2, cz: z, sx: w, sy: wallH + roofH * 0.5, sz: d, rotY });
  return g;
}

/* ============================ site container ============================== */
export function buildContainer(o, mats, colliders) {
  const { x = 0, z = 0, rotY = 0, w = 6.06, d = 2.44, h = 2.59, color = 0xe8e9e4 } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;

  const shell = new THREE.Mesh(box(w, h, d), mats.surface('corrugated', w, h, {
    color, metalness: 0.25, roughness: 0.55, normalScale: 0.6,
  }));
  shell.position.y = h / 2 + 0.18;
  shell.castShadow = shell.receiveShadow = true;
  g.add(shell);

  const roof = new THREE.Mesh(box(w + 0.1, 0.1, d + 0.1), mats.plain(0xd6d8d2, { roughness: 0.6, metalness: 0.3 }));
  roof.position.y = h + 0.23; roof.castShadow = true; g.add(roof);

  const win = new THREE.Mesh(box(1.5, 1.0, 0.06), mats.glass({ opacity: 0.5 }));
  win.position.set(-0.6, 1.62, d / 2 + 0.02); g.add(win);
  const wf = new THREE.Mesh(box(1.62, 1.12, 0.05), mats.plain(0xffffff, { roughness: 0.55 }));
  wf.position.set(-0.6, 1.62, d / 2 + 0.005); g.add(wf);
  const door = new THREE.Mesh(box(0.9, 2.0, 0.07), mats.plain(0xdfe1dc, { roughness: 0.6, metalness: 0.2 }));
  door.position.set(1.9, 1.18, d / 2 + 0.02); g.add(door);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), mats.chrome());
  handle.rotation.z = Math.PI / 2; handle.position.set(1.55, 1.1, d / 2 + 0.08); g.add(handle);

  for (const s of [-1, 1]) {                      // skids
    const sk = new THREE.Mesh(box(w, 0.18, 0.2), mats.plain(0x4a4f55, { roughness: 0.7, metalness: 0.3 }));
    sk.position.set(0, 0.09, s * (d / 2 - 0.16)); g.add(sk);
  }
  colliders.push({ cx: x, cy: h / 2, cz: z, sx: w, sy: h + 0.3, sz: d, rotY });
  return g;
}

/* ============================== fences ==================================== */
/** Welded-mesh boundary fence. `pts` is a polyline of [x,z] in world space. */
export function buildFence(pts, mats, colliders, o = {}) {
  const { h = 1.9, postEvery = 2.5, postColor = 0x2f4a33, gaps = [] } = o;
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.045, 0.05, h + 0.18, 6);
  const postMat = mats.plain(postColor, { roughness: 0.55, metalness: 0.35 });
  const meshMat = mats.cutout('wireMesh', { alphaTest: 0.35, roughness: 0.55 });

  const posts = [];
  const panels = new THREE.Group();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(len / postEvery));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      posts.push(M(x1 + dx * t, (h + 0.18) / 2, z1 + dz * t));
    }
    // panel sections, skipping any gap (gates, openings)
    const segs = [];
    let cur = 0;
    const local = gaps.filter(gp => gp.seg === i).sort((a, b) => a.from - b.from);
    for (const gp of local) { segs.push([cur, gp.from]); cur = gp.to; }
    segs.push([cur, len]);
    for (const [a, b] of segs) {
      if (b - a < 0.2) continue;
      const segLen = b - a, mid = (a + b) / 2;
      const pg = new THREE.PlaneGeometry(segLen, h);
      const pm = new THREE.Mesh(pg, mats.cutout('wireMesh', {
        alphaTest: 0.35, roughness: 0.55, repeat: [segLen / 0.5, h / 0.5],
      }));
      pm.position.set(x1 + (dx / len) * mid, h / 2 + 0.06, z1 + (dz / len) * mid);
      pm.rotation.y = ang - Math.PI / 2;
      pm.receiveShadow = true;
      panels.add(pm);
      // top and bottom rails
      for (const yy of [h + 0.02, 0.12]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, segLen, 5), postMat);
        rail.rotation.set(0, ang, Math.PI / 2);
        rail.position.set(x1 + (dx / len) * mid, yy, z1 + (dz / len) * mid);
        panels.add(rail);
      }
      colliders.push({
        cx: x1 + (dx / len) * mid, cy: h / 2, cz: z1 + (dz / len) * mid,
        sx: segLen, sy: h, sz: 0.12, rotY: ang - Math.PI / 2,
      });
    }
  }
  const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  posts.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  g.add(inst, panels);
  return g;
}

/** Sliding entrance gate. */
export function buildGate(o, mats, colliders) {
  const { x, z, w = 6, h = 1.9, rotY = 0, open = 0.0 } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  const frameMat = mats.plain(0x2f4a33, { roughness: 0.5, metalness: 0.45 });
  const leaf = new THREE.Group();
  const bars = new THREE.Group();
  for (let i = 0; i <= Math.floor(w / 0.22); i++) {
    const b = new THREE.Mesh(box(0.035, h - 0.1, 0.035), frameMat);
    b.position.set(-w / 2 + i * 0.22, h / 2, 0);
    bars.add(b);
  }
  const top = new THREE.Mesh(box(w, 0.09, 0.07), frameMat); top.position.y = h - 0.02;
  const bot = new THREE.Mesh(box(w, 0.09, 0.07), frameMat); bot.position.y = 0.1;
  leaf.add(bars, top, bot);
  leaf.position.x = open * w;
  leaf.castShadow = true;
  g.add(leaf);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(box(0.16, h + 0.5, 0.16), frameMat);
    post.position.set(s * (w / 2 + 0.2), (h + 0.5) / 2, 0);
    post.castShadow = true;
    g.add(post);
  }
  g.userData.leaf = leaf;
  g.userData.width = w;
  return g;
}

/* ============================ power line ================================== */
export function buildPowerPole(o, mats, colliders) {
  const { x, z, h = 10, rotY = 0, arms = 2 } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  const cMat = mats.plain(0x9a9793, { roughness: 0.88 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h, 6), cMat);
  pole.position.y = h / 2; pole.castShadow = true; g.add(pole);
  for (let i = 0; i < arms; i++) {
    const y = h - 0.7 - i * 1.25;
    const arm = new THREE.Mesh(box(2.4, 0.12, 0.12), mats.plain(0x6b6560, { roughness: 0.8, metalness: 0.4 }));
    arm.position.y = y; arm.castShadow = true; g.add(arm);
    for (const s of [-1, 0, 1]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 6),
        mats.plain(0x6d7d8c, { roughness: 0.25 }));
      ins.position.set(s * 1.08, y + 0.14, 0);
      g.add(ins);
    }
  }
  colliders.push({ cx: x, cy: h / 2, cz: z, sx: 0.45, sy: h, sz: 0.45, rotY: 0 });
  return g;
}

/** Catenary wires between a list of pole positions. */
export function buildWires(poles, mats, heights = [9.3, 8.05]) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x23282c, transparent: true, opacity: 0.85 });
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    for (const hy of heights) {
      for (const off of [-1.08, 0, 1.08]) {
        const pts = [];
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        const sag = Math.min(0.9, span * 0.022);
        for (let t = 0; t <= 12; t++) {
          const u = t / 12;
          pts.push(new THREE.Vector3(
            a.x + (b.x - a.x) * u + off * 0.0,
            hy + 0.14 - sag * Math.sin(Math.PI * u),
            a.z + (b.z - a.z) * u + off));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      }
    }
  }
  return g;
}

/* ============================== chimney =================================== */
export function buildChimney(o, mats, colliders) {
  const { x, z, r = 1.6, h = 38 } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, h, 14, 4),
    mats.plain(0x8e877d, { roughness: 0.92 }));
  body.position.y = h / 2; body.castShadow = true; g.add(body);
  for (let i = 1; i <= 4; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.9, 14),
      mats.plain(0x9c5a45, { roughness: 0.88 }));
    band.position.y = h - i * (h / 5.5);
    band.scale.setScalar(1 + (1 - band.position.y / h) * 0.18);
    g.add(band);
  }
  colliders.push({ cx: x, cy: h / 2, cz: z, sx: r * 2, sy: h, sz: r * 2, rotY: 0 });
  return g;
}

/* ====================== industrial shed (background) ====================== */
export function buildShed(o, mats, colliders) {
  const { x, z, w, d, h, rotY = 0, color = 0x2b3a33, roofColor = 0x39413f, tex = 'corrugated' } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  const wallMat = mats.surface(tex, w, h, { color, metalness: 0.28, roughness: 0.62 });
  for (const [sx, sz, ww, dd] of [[0, d / 2, w, 0.3], [0, -d / 2, w, 0.3], [w / 2, 0, 0.3, d], [-w / 2, 0, 0.3, d]]) {
    const m = new THREE.Mesh(box(ww, h, dd), wallMat);
    m.position.set(sx, h / 2, sz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const ridge = h + Math.min(3.2, w * 0.07);
  const roofGeo = new THREE.BufferGeometry();
  const hx = w / 2 + 0.4, hz = d / 2 + 0.4;
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz, 0, ridge - h, -hz, 0, ridge - h, hz,
  ], 3));
  roofGeo.setIndex([0, 1, 4, 3, 5, 2, 0, 4, 5, 0, 5, 3, 1, 2, 5, 1, 5, 4]);
  roofGeo.computeVertexNormals();
  const pos = roofGeo.attributes.position; const uv = [];
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / 2, pos.getZ(i) / 2);
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const roof = new THREE.Mesh(roofGeo, mats.surface('roofSheet', w, d, { color: roofColor }));
  roof.material.side = THREE.DoubleSide;
  roof.position.y = h; roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  colliders.push({ cx: x, cy: h / 2, cz: z, sx: w, sy: h, sz: d, rotY });
  return g;
}

/* ============================ yard flood light ============================ */
export function buildFloodlight(o, mats, colliders) {
  const { x, z, h = 7, rotY = 0 } = o;
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rotY;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 8),
    mats.plain(0x8b9197, { roughness: 0.5, metalness: 0.55 }));
  mast.position.y = h / 2; mast.castShadow = true; g.add(mast);
  const head = new THREE.Mesh(box(0.6, 0.34, 0.26), mats.plain(0x3b4148, { roughness: 0.5, metalness: 0.5 }));
  head.position.set(0, h - 0.1, 0.22); head.rotation.x = 0.42; g.add(head);
  const lens = new THREE.Mesh(box(0.5, 0.26, 0.03), mats.lamp(0xfff0cf, 0));
  lens.position.set(0, h - 0.19, 0.36); lens.rotation.x = 0.42; g.add(lens);
  const light = new THREE.SpotLight(0xffeccb, 0, 42, 0.78, 0.45, 1.4);
  light.position.set(0, h - 0.15, 0.3);
  const tgt = new THREE.Object3D(); tgt.position.set(0, -h, 9);
  g.add(light, tgt); light.target = tgt;
  g.userData.light = light; g.userData.lens = lens;
  colliders.push({ cx: x, cy: h / 2, cz: z, sx: 0.3, sy: h, sz: 0.3, rotY: 0 });
  return g;
}

/** Wall-mounted street lamp on a curved tube bracket — the one on the garage. */
export function buildWallLamp(o, mats) {
  const { x, y = 3.4, z, rotY = 0, reach = 0.75 } = o;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const steel = mats.plain(0x9aa1a7, { roughness: 0.45, metalness: 0.6 });

  const boxy = new THREE.Mesh(box(0.16, 0.22, 0.11), steel);   // junction box
  boxy.position.set(0, 0.62, 0.05);
  g.add(boxy);
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.5, 6), steel);
  conduit.position.set(0, -0.2, 0.05);
  g.add(conduit);

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.06),
    new THREE.Vector3(0, 0.34, 0.10),
    new THREE.Vector3(0, 0.50, 0.32),
    new THREE.Vector3(0, 0.54, reach),
  ]);
  const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.026, 6, false), steel);
  arm.castShadow = true;
  g.add(arm);

  const head = new THREE.Mesh(box(0.34, 0.09, 0.2), mats.plain(0xb6bcc1, { roughness: 0.4, metalness: 0.55 }));
  head.position.set(0, 0.52, reach + 0.08);
  head.rotation.x = 0.12;
  head.castShadow = true;
  g.add(head);
  const lens = new THREE.Mesh(box(0.27, 0.02, 0.15), mats.lamp(0xfff2d4, 0));
  lens.position.set(0, 0.47, reach + 0.08);
  g.add(lens);

  const light = new THREE.SpotLight(0xffeecb, 0, 20, 0.85, 0.6, 1.5);
  light.position.set(0, 0.46, reach + 0.08);
  const tgt = new THREE.Object3D(); tgt.position.set(0, -4, reach + 1.6);
  g.add(light, tgt); light.target = tgt;
  g.userData.light = light; g.userData.lens = lens; g.userData.peak = 26;
  return g;
}

/** Small flat sign board (shop plates, the plates nailed to the orchard fence). */
export function buildSign(o, mats) {
  const { x, y = 1.5, z, w = 0.52, h = 0.11, rotY = 0, lines = [''], bg = '#f2f3f0', fg = '#101418' } = o;
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = rotY;
  const t = signTexture(lines, { bg, fg, w: 512, h: Math.round(512 * h / w) });
  const m = new THREE.Mesh(box(w, h, 0.012), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.1 }));
  g.add(m);
  return g;
}
