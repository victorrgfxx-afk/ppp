import * as THREE from 'three';
import { M } from './materials.js';
import { boxGeo, cylGeo, mat } from './util.js';
import { baseHeight } from './config.js';

// Concrete utility poles (Romanian SC/SE type), insulators, LED street lamps, sagging wires.

export function concretePole(batch, world, x, z, { h = 10, type = 'SC', lamp = 0, ry = 0 } = {}) {
  const y = baseHeight(z) + (x > 0 ? 0.13 : 0.04);
  const w0 = type === 'MV' ? 0.32 : 0.26, d0 = type === 'MV' ? 0.26 : 0.19;
  // tapered rectangular shaft
  const g = new THREE.CylinderGeometry(0.5, 0.5, h, 4, 8);
  g.rotateY(Math.PI / 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    const k = 1 - 0.45 * t;
    p.setX(i, p.getX(i) / 0.7071 * (w0 / 2) * k);
    p.setZ(i, p.getZ(i) / 0.7071 * (d0 / 2) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * h / 1.5);
  const T = mat(x, y + h / 2 - 0.4, z, 0, ry, 0);
  batch.add(M.concretePole, g, T);
  // the long recessed slots of SC poles (photo 2)
  if (type === 'SC') {
    for (let s = 0; s < 6; s++) {
      const yy = 0.8 + s * 1.35;
      const k = 1 - 0.45 * (yy / h);
      for (const sg of [-1, 1]) {
        batch.add(M.interiorDark, boxGeo(0.045 * k, 1.0, 0.012), new THREE.Matrix4().multiplyMatrices(mat(x, y + yy, z, 0, ry, 0), mat(0, 0.5, sg * d0 / 2 * k + sg * 0.001)), { noCast: true });
      }
    }
  }
  // warning sign plate (yellow, as on the pole in photo 2)
  batch.add(M.gasPipe, boxGeo(0.16, 0.24, 0.01), new THREE.Matrix4().multiplyMatrices(mat(x, y + 2.3, z, 0, ry, 0), mat(0, 0, d0 / 2 + 0.006)), { noCast: true });

  const top = y + h - 0.4;
  if (type === 'MV') {
    // steel cross-arm with 3 pin insulators (photo 1, left pole)
    const arm = new THREE.Matrix4().multiplyMatrices(mat(x, top - 0.35, z, 0, ry, 0), mat(0, 0, 0));
    batch.add(M.galv, boxGeo(2.0, 0.08, 0.08), arm);
    for (const ox of [-0.9, 0, 0.9]) {
      const T2 = new THREE.Matrix4().multiplyMatrices(mat(x, top - 0.35, z, 0, ry, 0), mat(ox, 0.05, 0));
      for (let k = 0; k < 4; k++) batch.add(M.ceramicWhite, cylGeo(0.07 - k * 0.008, 0.07 - k * 0.008, 0.035, 10), new THREE.Matrix4().multiplyMatrices(T2, mat(0, 0.05 + k * 0.045, 0)));
    }
    batch.add(M.galv, boxGeo(1.4, 0.07, 0.07), new THREE.Matrix4().multiplyMatrices(mat(x, top - 1.3, z, 0, ry, 0), mat(0, 0, 0)));
  } else {
    batch.add(M.galv, boxGeo(0.35, 0.06, 0.06), new THREE.Matrix4().multiplyMatrices(mat(x, top - 0.25, z, 0, ry, 0), mat(0, 0, 0)));
  }
  // LV bundle clamps
  batch.add(M.darkPlastic, boxGeo(0.1, 0.12, 0.1), mat(x, top - 2.3, z, 0, ry, 0));
  let lampHead = null;
  if (lamp) {
    // LED street lamp on a short bracket over the road
    const dir = lamp; // +1 => towards +X, -1 => towards -X
    const ly = top - 2.9;
    batch.add(M.galv, cylGeo(0.025, 0.025, 1.3, 6), mat(x + dir * 0.65, ly + 0.15, z, 0, 0, Math.PI / 2 - dir * 0.15));
    batch.add(M.darkPlastic, boxGeo(0.55, 0.08, 0.22), mat(x + dir * 1.35, ly + 0.25, z, 0, 0, dir * 0.08));
    batch.add(M.lampGlass, boxGeo(0.45, 0.01, 0.16), mat(x + dir * 1.35, ly + 0.205, z, 0, 0, dir * 0.08));
    lampHead = new THREE.Vector3(x + dir * 1.35, ly + 0.2, z);
  }
  world.addStatic(new world.Box(x, z, w0 / 2 + 0.02, d0 / 2 + 0.02, ry, -5, 20, 'pole'));
  return { top, x, z, lampHead };
}

// Catenary wire from a to b with sag (meters), as a thin tube.
export function wire(batch, a, b, sag = 0.6, r = 0.011, m = M.cable) {
  const pts = [];
  const n = Math.max(6, Math.ceil(a.distanceTo(b) / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= 4 * sag * t * (1 - t);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  batch.add(m, new THREE.TubeGeometry(curve, n * 2, r, 4, false), null, { noCast: false });
}
