/* Yard clutter. The items visible in the reference photos (blue barrel, TOTAL
   oil drum, fire extinguisher, jerrycan, pallets, tyres, cones) plus the
   workshop kit that makes the interiors read as real bays. */
import * as THREE from 'three';
import * as CANNON from 'cannon';
import { signTexture } from '../gfx/Textures.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/* ------------------------------- barrels --------------------------------- */
export function plasticBarrel(mats, color = 0x1f57b5) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.92, 18, 1),
    mats.plain(color, { roughness: 0.42, metalness: 0.02 }));
  body.position.y = 0.46; body.castShadow = body.receiveShadow = true; g.add(body);
  for (const y of [0.30, 0.62]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.028, 6, 20),
      mats.plain(color, { roughness: 0.38 }));
    rib.rotation.x = Math.PI / 2; rib.position.y = y; g.add(rib);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 18),
    mats.plain(0x18181a, { roughness: 0.6 }));
  lid.position.y = 0.935; g.add(lid);
  g.userData.phys = { mass: 14, size: new THREE.Vector3(0.58, 0.94, 0.58) };
  return g;
}

/** Steel oil drum with a printed label — the TOTAL drum from the first photo. */
export function oilDrum(mats, { color = 0xc4351f, label = 'TOTAL', labelBg = '#d8451f' } = {}) {
  const g = new THREE.Group();
  const mat = mats.plain(color, { roughness: 0.46, metalness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 20, 1), mat);
  body.position.y = 0.44; body.castShadow = body.receiveShadow = true; g.add(body);
  for (const y of [0.30, 0.58]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 6, 22), mat);
    rib.rotation.x = Math.PI / 2; rib.position.y = y; g.add(rib);
  }
  for (const y of [0.02, 0.86]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 22), mat);
    rim.rotation.x = Math.PI / 2; rim.position.y = y; g.add(rim);
  }
  const tex = signTexture([label], { bg: labelBg, fg: '#ffffff', w: 512, h: 200 });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 3;
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.296, 0.296, 0.3, 20, 1, true),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }));
  wrap.position.y = 0.46; g.add(wrap);
  g.userData.phys = { mass: 26, size: new THREE.Vector3(0.58, 0.9, 0.58) };
  return g;
}

export function fireExtinguisher(mats) {
  const g = new THREE.Group();
  const red = mats.plain(0xc01a12, { roughness: 0.34, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.44, 14), red);
  body.position.y = 0.24; body.castShadow = true; g.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 8, 0, 6.3, 0, Math.PI / 2), red);
  dome.position.y = 0.46; g.add(dome);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8),
    mats.plain(0x2a2d30, { roughness: 0.5, metalness: 0.6 }));
  neck.position.y = 0.55; g.add(neck);
  const handle = new THREE.Mesh(box(0.14, 0.03, 0.05), mats.plain(0x1c1e20, { roughness: 0.5 }));
  handle.position.set(0.04, 0.60, 0); g.add(handle);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.015, 6, 14, Math.PI * 1.2),
    mats.plain(0x141516, { roughness: 0.8 }));
  hose.rotation.set(Math.PI / 2, 0, 0.6); hose.position.set(-0.05, 0.36, 0.06); g.add(hose);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 14),
    mats.plain(0x18191b, { roughness: 0.7 }));
  base.position.y = 0.02; g.add(base);
  g.userData.phys = { mass: 9, size: new THREE.Vector3(0.22, 0.62, 0.22) };
  return g;
}

export function jerrycan(mats, color = 0x2f6b35) {
  const g = new THREE.Group();
  const m = mats.plain(color, { roughness: 0.48, metalness: 0.35 });
  const body = new THREE.Mesh(box(0.34, 0.46, 0.17), m);
  body.position.y = 0.23; body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) {
    const dent = new THREE.Mesh(box(0.2, 0.3, 0.02), mats.plain(color, { roughness: 0.55 }));
    dent.position.set(0, 0.24, s * 0.086); g.add(dent);
  }
  const hand = new THREE.Mesh(box(0.3, 0.035, 0.035), m);
  hand.position.y = 0.47; g.add(hand);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8), mats.plain(0x141414, { roughness: 0.6 }));
  cap.position.set(0.11, 0.49, 0); g.add(cap);
  g.userData.phys = { mass: 12, size: new THREE.Vector3(0.34, 0.5, 0.18) };
  return g;
}

export function pallet(mats) {
  const g = new THREE.Group();
  const wood = mats.plain(0xa8875a, { roughness: 0.92 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(box(1.2, 0.022, 0.1), wood);
    s.position.set(0, 0.13, -0.4 + i * 0.16); s.castShadow = s.receiveShadow = true; g.add(s);
  }
  for (const zz of [-0.36, 0, 0.36]) {
    const b = new THREE.Mesh(box(1.2, 0.09, 0.14), wood);
    b.position.set(0, 0.055, zz); g.add(b);
    const u = new THREE.Mesh(box(1.2, 0.02, 0.14), wood);
    u.position.set(0, 0.005, zz); g.add(u);
  }
  g.userData.phys = { mass: 16, size: new THREE.Vector3(1.2, 0.15, 0.8) };
  return g;
}

export function tyre(mats, r = 0.33) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, r * 0.24, 10, 22),
    mats.plain(0x141416, { roughness: 0.94 }));
  t.rotation.x = Math.PI / 2;
  t.castShadow = t.receiveShadow = true;
  const g = new THREE.Group();
  t.position.y = r * 0.24; g.add(t);
  g.userData.phys = { mass: 10, size: new THREE.Vector3(r * 2, r * 0.5, r * 2) };
  return g;
}

export function tyreStack(mats, n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const t = tyre(mats, 0.33);
    t.position.y = i * 0.2;
    t.rotation.y = i * 1.1;
    g.add(t);
  }
  return g;
}

export function trafficCone(mats) {
  const g = new THREE.Group();
  const orange = mats.plain(0xe4571b, { roughness: 0.6 });
  const base = new THREE.Mesh(box(0.34, 0.035, 0.34), mats.plain(0x1b1b1d, { roughness: 0.85 }));
  base.position.y = 0.018; base.castShadow = true; g.add(base);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.52, 12, 1, true), orange);
  cone.position.y = 0.29; cone.castShadow = true; g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.108, 0.08, 12, 1, true),
    mats.plain(0xf0f2f2, { roughness: 0.35 }));
  band.position.y = 0.34; g.add(band);
  g.userData.phys = { mass: 2.2, size: new THREE.Vector3(0.3, 0.52, 0.3) };
  return g;
}

export function crate(mats, w = 0.6, h = 0.4, d = 0.42, color = 0x2c6e4f) {
  const g = new THREE.Group();
  const m = mats.plain(color, { roughness: 0.62 });
  const b = new THREE.Mesh(box(w, h, d), m);
  b.position.y = h / 2; b.castShadow = b.receiveShadow = true; g.add(b);
  const lip = new THREE.Mesh(box(w + 0.03, 0.04, d + 0.03), mats.plain(color, { roughness: 0.5 }));
  lip.position.y = h - 0.02; g.add(lip);
  g.userData.phys = { mass: 6, size: new THREE.Vector3(w, h, d) };
  return g;
}

export function toolbox(mats) {
  const g = new THREE.Group();
  const red = mats.plain(0xb3261e, { roughness: 0.38, metalness: 0.45 });
  const body = new THREE.Mesh(box(0.78, 1.05, 0.46), red);
  body.position.y = 0.55; body.castShadow = body.receiveShadow = true; g.add(body);
  for (let i = 0; i < 4; i++) {
    const dr = new THREE.Mesh(box(0.72, 0.19, 0.02), mats.plain(0x8e1c17, { roughness: 0.4, metalness: 0.4 }));
    dr.position.set(0, 0.25 + i * 0.23, 0.235); g.add(dr);
    const h = new THREE.Mesh(box(0.34, 0.03, 0.03), mats.chrome(0xc9ced2, 0.25));
    h.position.set(0, 0.25 + i * 0.23, 0.26); g.add(h);
  }
  const top = new THREE.Mesh(box(0.82, 0.05, 0.5), mats.plain(0x2a2c2e, { roughness: 0.5 }));
  top.position.y = 1.1; g.add(top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.plain(0x141414, { roughness: 0.8 }));
    c.position.set(sx * 0.3, 0.05, sz * 0.16); g.add(c);
  }
  return g;
}

export function workbench(mats, len = 2.6) {
  const g = new THREE.Group();
  const steel = mats.plain(0x6e767d, { roughness: 0.5, metalness: 0.6 });
  const top = new THREE.Mesh(box(len, 0.07, 0.72), mats.plain(0x8a6f4c, { roughness: 0.75 }));
  top.position.y = 0.9; top.castShadow = top.receiveShadow = true; g.add(top);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(box(0.07, 0.9, 0.66), steel);
    leg.position.set(s * (len / 2 - 0.12), 0.45, 0); g.add(leg);
  }
  const back = new THREE.Mesh(box(len, 0.9, 0.04), mats.plain(0x9aa1a7, { roughness: 0.55, metalness: 0.4 }));
  back.position.set(0, 1.4, -0.34); g.add(back);
  const vice = new THREE.Mesh(box(0.22, 0.16, 0.2), mats.plain(0x2f5d86, { roughness: 0.45, metalness: 0.5 }));
  vice.position.set(-len / 2 + 0.34, 1.0, 0.1); vice.castShadow = true; g.add(vice);
  return g;
}

/** Two-post lift — the thing that makes a bay unmistakably a workshop. */
export function carLift(mats) {
  const g = new THREE.Group();
  const yellow = mats.plain(0xe0a80f, { roughness: 0.45, metalness: 0.35 });
  const dark = mats.plain(0x26292c, { roughness: 0.55, metalness: 0.5 });
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(box(0.3, 3.4, 0.3), yellow);
    col.position.set(s * 1.55, 1.7, 0); col.castShadow = col.receiveShadow = true; g.add(col);
    const base = new THREE.Mesh(box(0.7, 0.08, 0.7), dark);
    base.position.set(s * 1.55, 0.04, 0); g.add(base);
    for (const zz of [-0.85, 0.85]) {
      const arm = new THREE.Mesh(box(1.15, 0.12, 0.14), yellow);
      arm.position.set(s * 0.95, 0.35, zz);
      arm.rotation.y = s * zz * 0.05;
      arm.castShadow = true; g.add(arm);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 10), dark);
      pad.position.set(s * 0.42, 0.42, zz); g.add(pad);
    }
  }
  const top = new THREE.Mesh(box(3.4, 0.22, 0.24), yellow);
  top.position.y = 3.42; top.castShadow = true; g.add(top);
  return g;
}

export function compressor(mats) {
  const g = new THREE.Group();
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 16), mats.plain(0x1d4f8a, { roughness: 0.4, metalness: 0.5 }));
  tank.rotation.z = Math.PI / 2; tank.position.y = 0.42; tank.castShadow = true; g.add(tank);
  const motor = new THREE.Mesh(box(0.42, 0.3, 0.32), mats.plain(0x2a2d31, { roughness: 0.5, metalness: 0.5 }));
  motor.position.set(-0.1, 0.78, 0); g.add(motor);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.04, 8, 14), mats.plain(0x141416, { roughness: 0.9 }));
  wheel.position.set(0.44, 0.11, 0); g.add(wheel);
  g.userData.phys = { mass: 60, size: new THREE.Vector3(1.2, 0.95, 0.6) };
  return g;
}

export function hoseReel(mats) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), mats.plain(0x1b1c1e, { roughness: 0.85 }));
  drum.rotation.x = Math.PI / 2; g.add(drum);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 16), mats.plain(0xb43a25, { roughness: 0.5, metalness: 0.3 }));
    cheek.rotation.x = Math.PI / 2; cheek.position.z = s * 0.11; g.add(cheek);
  }
  const br = new THREE.Mesh(box(0.1, 0.36, 0.3), mats.plain(0x8d9399, { roughness: 0.5, metalness: 0.5 }));
  br.position.set(0, -0.2, 0); g.add(br);
  return g;
}

export function skip(mats) {
  const g = new THREE.Group();
  const m = mats.plain(0x6d5c2a, { roughness: 0.75, metalness: 0.35 });
  const w = 2.6, h = 1.15, d = 1.7;
  for (const [px, py, pz, sx, sy, sz, rot] of [
    [0, h / 2, -d / 2, w, h, 0.06, 0], [0, h / 2, d / 2, w, h, 0.06, 0],
    [-w / 2, h / 2, 0, 0.06, h, d, 0], [w / 2, h / 2, 0, 0.06, h, d, 0],
    [0, 0.03, 0, w, 0.06, d, 0],
  ]) {
    const p = new THREE.Mesh(box(sx, sy, sz), m);
    p.position.set(px, py, pz); p.castShadow = p.receiveShadow = true; g.add(p);
  }
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(box(0.07, h, 0.07), mats.plain(0x5a4c22, { roughness: 0.7, metalness: 0.4 }));
    rib.position.set(-w / 2 + 0.3 + i * (w - 0.6) / 3, h / 2, d / 2 + 0.04); g.add(rib);
  }
  return g;
}

export function wheelieBin(mats, color = 0x24502c) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(0.58, 0.9, 0.52), mats.plain(color, { roughness: 0.55 }));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const lid = new THREE.Mesh(box(0.62, 0.06, 0.56), mats.plain(color, { roughness: 0.45 }));
  lid.position.y = 1.02; g.add(lid);
  for (const s of [-1, 1]) {
    const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), mats.plain(0x131313, { roughness: 0.9 }));
    wl.rotation.z = Math.PI / 2; wl.position.set(s * 0.25, 0.09, -0.2); g.add(wl);
  }
  g.userData.phys = { mass: 18, size: new THREE.Vector3(0.6, 1.05, 0.55) };
  return g;
}

/** Scrap heap of wheels and body panels — every yard like this has one. */
export function scrapPile(mats, seed = 3) {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 7; i++) {
    const t = tyre(mats, 0.28 + rnd() * 0.08);
    t.position.set((rnd() - 0.5) * 1.6, rnd() * 0.25, (rnd() - 0.5) * 1.4);
    t.rotation.set(rnd() * 0.7, rnd() * 3, rnd() * 0.5);
    g.add(t);
  }
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(box(0.7 + rnd() * 0.7, 0.03, 0.5 + rnd() * 0.5),
      mats.plain([0x8d9196, 0x6d3a33, 0x2b3038][i % 3], { roughness: 0.55, metalness: 0.5 }));
    p.position.set((rnd() - 0.5) * 1.8, 0.2 + rnd() * 0.3, (rnd() - 0.5) * 1.6);
    p.rotation.set(rnd() * 0.6, rnd() * 3, rnd() * 0.6);
    p.castShadow = true; g.add(p);
  }
  return g;
}

/** Register a prop group with the physics world (falls over when hit). */
export function makeDynamic(physics, group) {
  const p = group.userData.phys;
  if (!p) return null;
  return physics.addProp(group, {
    mass: p.mass,
    size: p.size,
    shape: new CANNON.Box(new CANNON.Vec3(p.size.x / 2, p.size.y / 2, p.size.z / 2)),
  });
}
