import * as THREE from 'three';
import { GEO, heightAt } from './data.js';
import { TEX } from '../textures.js';
import { M } from '../materials.js';

// Street fences in front of the lots, village utility poles with street lamps, the 110 kV line
// (towers at the mapped positions), minor lines, and all overhead wires (as line segments).

function fadingLines(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvDist = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= clamp(1.25 - vDist / 260.0, 0.12, 1.0);');
  };
  m.customProgramCacheKey = () => 'fadingLines';
  return m;
}

export function makePropMaterials() {
  const cut = (map, normalMap, extra = {}) => new THREE.MeshStandardMaterial({ map, normalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, ...extra });
  const panel = (color) => new THREE.MeshStandardMaterial({ map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.5, metalness: 0.4, color, side: THREE.DoubleSide });
  return {
    fences: [
      { m: cut(TEX.fencePicket, TEX.fencePicketN), h: 1.55, tile: 1 },
      { m: M.chain, h: 1.35, tile: 0.25, base: M.stoneWall, baseH: 0.45 },
      { m: [panel(0x6e2626), panel(0x4d3226), panel(0x3a5a45), panel(0x7a6a58)], h: 1.8, tile: 1 },
      { m: [M.stuccoCream, M.stuccoWhite, M.stuccoBeige], h: 1.85, tile: 1.5, solid: true },
      { m: cut(TEX.fenceIron, null, { metalness: 0.6, roughness: 0.45 }), h: 1.3, tile: 1, base: M.stuccoGray, baseH: 0.4 },
      { m: cut(TEX.fenceWoodOld, TEX.fenceWoodOldN), h: 1.6, tile: 1 },
    ],
    pole: M.concretePole, metal: M.galv, lamp: M.lampGlass, insulator: M.ceramicWhite,
    tower: new THREE.MeshStandardMaterial({ color: 0x8e959b, roughness: 0.55, metalness: 0.6 }),
    wire: fadingLines(new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true })),
  };
}

export function buildFences(B, world, mats) {
  let n = 0;
  for (const f of GEO.fences) {
    const style = mats.fences[f[0]];
    const P = [];
    for (let i = 1; i < f.length; i += 2) P.push([f[i], f[i + 1]]);
    const pick = (arr) => Array.isArray(arr) ? arr[Math.abs(Math.round(P[0][0] * 7 + P[0][1] * 3)) % arr.length] : arr;
    const mat = pick(style.m);
    let acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      const k = Math.max(1, Math.ceil(L / 4));
      for (let s = 0; s < k; s++) {
        const x0 = ax + (bx - ax) * s / k, z0 = az + (bz - az) * s / k, x1 = ax + (bx - ax) * (s + 1) / k, z1 = az + (bz - az) * (s + 1) / k;
        const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
        const l = L / k;
        let b0 = 0;
        if (style.base) {
          B.quad(style.base, x0, z0, x1, z1, y0 - 0.1, y0 + style.baseH, y1 - 0.1, y1 + style.baseH, acc, acc + l, 0, style.baseH, 0, style.baseH, null);
          B.quad(style.base, x1, z1, x0, z0, y1 - 0.1, y1 + style.baseH, y0 - 0.1, y0 + style.baseH, acc + l, acc, 0, style.baseH, 0, style.baseH, null);
          b0 = style.baseH;
        }
        const u0 = acc / style.tile, u1 = (acc + l) / style.tile, vt = style.tile === 1 ? 1 : style.h / style.tile;
        B.quad(mat, x0, z0, x1, z1, y0 + b0 - 0.05, y0 + b0 + style.h, y1 + b0 - 0.05, y1 + b0 + style.h, u0, u1, 0, vt, 0, vt, null);
        if (style.solid) B.quad(mat, x1, z1, x0, z0, y1 - 0.05, y1 + style.h, y0 - 0.05, y0 + style.h, u1, u0, 0, vt, 0, vt, null);
        acc += l;
      }
      world.addStatic(new world.Box((ax + bx) / 2, (az + bz) / 2, L / 2, 0.08, Math.atan2(-(bz - az), bx - ax), -5, 1e4, 'fence'));
      n++;
    }
  }
  return n;
}

function catenary(out, a, b, sag, seg = 8) {
  for (let t = 0; t < seg; t++) {
    const f0 = t / seg, f1 = (t + 1) / seg;
    out.push(a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0 - sag * 4 * f0 * (1 - f0), a.z + (b.z - a.z) * f0,
      a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1 - sag * 4 * f1 * (1 - f1), a.z + (b.z - a.z) * f1);
  }
}

// n: unit vector across the line (crossarm direction); lampSide: +-1 = lamp arm along +-n, 0 = none
function concretePoleGeo(B, mats, x, z, n, lampSide) {
  const y = heightAt(x, z);
  const h = 9.5;
  const g = new THREE.CylinderGeometry(0.1, 0.16, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2 - 0.3, 0);
  const T = new THREE.Matrix4().makeRotationY(Math.atan2(-n[1], n[0])).setPosition(x, y, z);
  B.geo(mats.pole, g, T);
  const arm = new THREE.BoxGeometry(1.5, 0.08, 0.08); arm.translate(0, h - 0.8, 0);
  B.geo(mats.metal, arm, T);
  for (const ox of [-0.65, 0, 0.65]) {
    const ins = new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6); ins.translate(ox, h - 0.66, 0);
    B.geo(mats.insulator, ins, T);
  }
  if (lampSide) {
    const la = new THREE.BoxGeometry(1.3, 0.05, 0.05); la.translate(lampSide * 0.62, h - 2.2, 0);
    B.geo(mats.metal, la, T);
    const head = new THREE.BoxGeometry(0.5, 0.07, 0.22); head.translate(lampSide * 1.3, h - 2.22, 0);
    B.geo(mats.lamp, head, T);
  }
  return { top: y + h - 0.6, y, T };
}

// lattice tower of a 110 kV double-circuit line
function towerGeo(B, mats, x, z, ang) {
  const y = heightAt(x, z);
  const T = new THREE.Matrix4().makeRotationY(ang).setPosition(x, y, z);
  const H = 29;
  const leg = (sx, sz) => {
    const p0 = new THREE.Vector3(sx * 2.4, 0, sz * 2.4), p1 = new THREE.Vector3(sx * 0.6, H * 0.8, sz * 0.6);
    const d = new THREE.Vector3().subVectors(p1, p0), L = d.length();
    const g = new THREE.BoxGeometry(0.14, L, 0.14);
    g.translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(p0.x, p0.y, p0.z);
    B.geo(mats.tower, g, T);
  };
  leg(1, 1); leg(1, -1); leg(-1, 1); leg(-1, -1);
  // horizontal/diagonal bracing rings
  for (let k = 0; k < 7; k++) {
    const yy = k * H * 0.8 / 7 + 1, w = 2.4 - (2.4 - 0.6) * yy / (H * 0.8);
    for (const [sx, sz, rx] of [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]]) {
      const g = new THREE.BoxGeometry(rx ? 0.08 : w * 2, 0.08, rx ? w * 2 : 0.08);
      g.translate(sx * w, yy, sz * w);
      B.geo(mats.tower, g, T);
    }
  }
  const top = new THREE.BoxGeometry(0.5, H * 0.2, 0.5); top.translate(0, H * 0.9, 0); B.geo(mats.tower, top, T);
  const arms = [[H * 0.62, 3.2], [H * 0.74, 4.2], [H * 0.86, 3.2]];
  for (const [yy, w] of arms) { const g = new THREE.BoxGeometry(w * 2, 0.35, 0.5); g.translate(0, yy, 0); B.geo(mats.tower, g, T); }
  const pts = [];
  const v = new THREE.Vector3();
  for (const [yy, w] of arms) for (const s of [-1, 1]) { v.set(s * w, yy - 1.6, 0).applyMatrix4(T); pts.push(v.clone()); }
  v.set(0, H, 0).applyMatrix4(T); pts.push(v.clone());
  return pts;
}

export function buildPower(B, world, mats, scene) {
  const wires = [];
  let nPoles = 0, nTowers = 0;
  // village poles along the streets (every ~38 m), 3 conductors + lamps
  for (const { s: side, p: run } of GEO.poles) {
    let prev = null;
    for (let i = 0; i < run.length; i++) {
      const [x, z] = run[i];
      const nb = run[Math.min(run.length - 1, i + 1)], pb = run[Math.max(0, i - 1)];
      const dir = [nb[0] - pb[0], nb[1] - pb[1]];
      const L = Math.hypot(...dir) || 1;
      // the street lies on the -side of the left normal: lamp arm over the road on every 2nd pole
      const P = concretePoleGeo(B, mats, x, z, [-dir[1] / L, dir[0] / L], i % 2 === 0 ? -side : 0);
      world.addStatic(new world.Box(x, z, 0.16, 0.16, 0, P.y - 1, P.y + 10, 'pole'));
      nPoles++;
      const tips = [-0.65, 0, 0.65].map(ox => new THREE.Vector3(ox, 9.5 - 0.58, 0).applyMatrix4(P.T));
      if (prev) for (let k = 0; k < 3; k++) catenary(wires, prev[k], tips[k], 0.5, 6);
      prev = tips;
    }
  }
  // mapped power lines: 110 kV towers and minor-line poles at their real positions
  for (const ln of GEO.power) {
    const pts = ln.p;
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, isSupport] = pts[i];
      if (!isSupport || Math.max(Math.abs(x), Math.abs(z)) > GEO.worldExt - 5) { prev = null; continue; }
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      let tips;
      if (ln.k === 'line') {
        tips = towerGeo(B, mats, x, z, ang);
        world.addStatic(new world.Box(x, z, 2.5, 2.5, 0, -1e4, 1e4, 'tower'));
        nTowers++;
      } else {
        const P = concretePoleGeo(B, mats, x, z, [Math.cos(ang), -Math.sin(ang)], 0);
        tips = [-0.65, 0, 0.65].map(ox => new THREE.Vector3(ox, 9.5 - 0.58, 0).applyMatrix4(P.T));
        world.addStatic(new world.Box(x, z, 0.16, 0.16, 0, P.y - 1, P.y + 10, 'pole'));
        nPoles++;
      }
      if (prev && prev.length === tips.length) {
        const span = prev[0].distanceTo(tips[0]);
        for (let k = 0; k < tips.length; k++) catenary(wires, prev[k], tips[k], span * (ln.k === 'line' ? 0.028 : 0.012), 10);
      }
      prev = tips;
    }
  }
  return { wires, nPoles, nTowers };
}

export function addWires(scene, positions, mats) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeBoundingSphere();
  const l = new THREE.LineSegments(g, mats.wire);
  l.userData.noAO = true;
  l.frustumCulled = false;
  scene.add(l);
  return l;
}
