import * as THREE from 'three';
import { GEO } from './data.js';
import { TEX } from '../textures.js';
import { M } from '../materials.js';
import { rng } from '../util.js';

// Every OSM building footprint extruded with its levels, a plinth that follows the terrain,
// window facades and hipped / gable / flat roofs from a rectangle decomposition of the footprint.

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const WALLS = [0xefede7, 0xeae2cf, 0xe9dcb0, 0xe6c9a8, 0xd2dcc0, 0xd3d8dc, 0xe6cbc2, 0xc9c6bf, 0xdcc08e, 0xf1efe9, 0xe4e0d4];
const BLOCKS = [0xd9d2c3, 0xc9c8c2, 0xe0d6bf, 0xd8c8b0, 0xc7ccd0];
const ROOF_METAL = [0x7a3b30, 0x5a3a2c, 0x52565b, 0x3b3e43, 0x4a5c4c, 0x6d3530, 0x9aa0a6, 0x86503a, 0x5f6368];
const OVR_WALL = { stuccoWhite: 0xe8e6e0, stuccoCream: 0xe3d6bd, stuccoPeach: 0xdcb99a, stuccoGrayLight: 0xa9a8a4, woodDark: 0x6a4a3a, ochre: 0xd8a94e, gray: 0xb3b2ac, shingle: 0x7c7771, stampedGray: 0xa9acad, sand: 0xe3d0a0, brickRed: 0x9b5f47 };
const OVR_ROOF = { roofMetalGray: 0xa8adb3, roofMetalBrown: 0x5d3a2a, roofMetalRed: 0x8a2e24, roofMetalLight: 0xc4c9ce, metalTileBrown: 0x52302a, metalTileGreen: 0x2f4a36, roofMetalRust: 0x86553d, roofMetalDark: 0x45484d, tileRed: 0xffffff };
// facade texture per wall material
const FKEY = { house: 'facadeHouse', block: 'facadeBlock', wood: 'facadeWood', ind: 'facadeInd', shingle: 'facadeShingle', stamped: 'facadeStamped' };

function hashId(id) { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

export function makeBuildingMaterials() {
  const facade = (key, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: TEX[key], normalMap: TEX[key + 'N'], roughnessMap: TEX[key + 'R'] ?? null, roughness: TEX[key + 'R'] ? 1 : 0.8, metalness: 0, vertexColors: true, ...extra });
    if (TEX[key + 'R']) {
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <color_fragment>', '')
          .replace('#include <map_fragment>', `#include <map_fragment>
  float wallMask = texture2D(roughnessMap, vRoughnessMapUv).b;
  diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, wallMask);`);
      };
      m.customProgramCacheKey = () => 'facadeMask';
    }
    return m;
  };
  return {
    house: facade('facadeHouse'),
    block: facade('facadeBlock'),
    wood: facade('facadeWood'),
    shingle: facade('facadeShingle'),
    stamped: facade('facadeStamped'),
    // gable ends of shingled houses: the same shingles without windows, mapped in metres
    shinglePlain: facade('facadeShingleP'),
    ind: facade('facadeInd'),
    plinth: M.stuccoGray,
    plinthBrown: new THREE.MeshStandardMaterial({ color: 0x5a3a2e, roughness: 0.8 }),
    stone: M.stoneCladding,
    roofMetal: new THREE.MeshStandardMaterial({ map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.48, metalness: 0.45, vertexColors: true, side: THREE.DoubleSide }),
    roofTiles: new THREE.MeshStandardMaterial({ map: TEX.roofTiles, normalMap: TEX.roofTilesN, roughness: 0.78, vertexColors: true, side: THREE.DoubleSide }),
    // pressed-steel 'metal tile' roofing (photos 17, 21): the tile relief, glossy painted steel
    roofMetalTile: new THREE.MeshStandardMaterial({ normalMap: TEX.roofTilesN, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.42, metalness: 0.35, vertexColors: true, side: THREE.DoubleSide }),
    roofFlat: new THREE.MeshStandardMaterial({ map: TEX.gravel, roughness: 0.95, color: 0x6b6b68 }),
    brick: M.brick,
    spire: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8, color: 0x8a8f94 }),
  };
}

function pushFace(B, material, pts, uvs, color) {
  // convex polygon fan; flips so the normal points up (or outwards for vertical faces)
  const [a, b, c] = pts;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  let order = pts.map((_, i) => i);
  if (ny < 0) { order = order.reverse(); nx = -nx; ny = -ny; nz = -nz; }
  const pos = [], nrm = [], uv = [];
  for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
    pos.push(...pts[k]); nrm.push(nx, ny, nz); uv.push(...uvs[k]);
  }
  B.tris(material, pos, nrm, uv, color);
}

// hipped (or gable) roof over one rectangle
function rectRoof(B, mats, r, top, pitch, ov, color, roofMat, gable, wallColor, { ridge = null, gableMat = mats.house } = {}) {
  let [cx, cz, hw, hd, a] = r;
  let ex = [Math.cos(a), Math.sin(a)], ez = [-Math.sin(a), Math.cos(a)];
  // ridge along the longer side, unless the photos say otherwise ('x' / 'z' = the game axis it follows)
  const swap = ridge === 'x' ? Math.abs(ex[0]) < Math.abs(ez[0]) : ridge === 'z' ? Math.abs(ex[1]) < Math.abs(ez[1]) : hd > hw;
  if (swap) { [hw, hd] = [hd, hw]; ex = [ez[0], ez[1]]; ez = [-Math.cos(a), -Math.sin(a)]; }
  const t = Math.tan(pitch);
  const rise = Math.min(4.8, hd * t);
  const tt = rise / hd;
  const H = hw + ov, D = hd + ov;
  const eaveY = top - ov * tt, ridgeY = top + rise;
  const P = (s, u, y) => [cx + ex[0] * s + ez[0] * u, y, cz + ex[1] * s + ez[1] * u];
  const R = gable ? H : Math.max(0, H - D);
  const c1 = P(-H, -D, eaveY), c2 = P(H, -D, eaveY), c3 = P(H, D, eaveY), c4 = P(-H, D, eaveY);
  const r1 = P(-R, 0, ridgeY), r2 = P(R, 0, ridgeY);
  const slope = Math.hypot(D, ridgeY - eaveY);
  // slopes: u along the eave (m), v up the slope (m)
  pushFace(B, roofMat, [c1, c2, r2, r1], [[-H, 0], [H, 0], [R, slope], [-R, slope]], color);
  pushFace(B, roofMat, [c3, c4, r1, r2], [[H, 0], [-H, 0], [-R, slope], [R, slope]], color);
  if (!gable && R < H) {
    const sl = Math.hypot(H - R, ridgeY - eaveY);
    pushFace(B, roofMat, [c4, c1, r1], [[-D, 0], [D, 0], [0, sl]], color);
    pushFace(B, roofMat, [c2, c3, r2], [[-D, 0], [D, 0], [0, sl]], color);
  } else if (gable) {
    // gable triangles in the end walls
    for (const s of [-hw, hw]) {
      const g1 = P(s, -hd, top), g2 = P(s, hd, top), g3 = P(s, 0, ridgeY);
      const pts = s < 0 ? [g1, g2, g3] : [g2, g1, g3];
      const ax = pts[1][0] - pts[0][0], az = pts[1][2] - pts[0][2], L = Math.hypot(ax, az);
      const nx = -az / L, nz = ax / L;
      const pos = [...pts[0], ...pts[1], ...pts[2]];
      const uv = gableMat === mats.house ? [0.04, 0.05, 0.04, 0.05, 0.1, 0.3]
        : [-hd / 3.2, top / 2.8, hd / 3.2, top / 2.8, 0, ridgeY / 2.8].map((v, i) => s < 0 && i % 2 === 0 ? -v : v);
      B.tris(gableMat, pos, [nx, 0, nz, nx, 0, nz, nx, 0, nz], uv, wallColor);
    }
  }
  return { ridgeY, eaveY };
}

export function buildBuildings(B, world, mats) {
  const fronts = [];
  const stats = { n: 0, hip: 0, gable: 0, flat: 0 };
  for (const b of GEO.buildings) {
    const h = hashId(b.id);
    const r = rng(h);
    const o = b.o || {};
    const P = [];
    for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    if (P.length < 3) continue;
    const kind = b.b;
    const lv = o.levels ?? b.lv ?? 1;
    const isBlock = kind === 'apartments' || lv >= 4;
    const isInd = ['industrial', 'warehouse', 'manufacture', 'hangar', 'retail', 'supermarket', 'commercial', 'storage_tank', 'sports_hall'].includes(kind);
    const isShed = b.roof === 'shed' || kind === 'garage' || kind === 'garages' || kind === 'shed';
    const wk = o.wall === 'woodDark' ? 'wood' : o.wall === 'shingle' ? 'shingle' : o.wall === 'stampedGray' ? 'stamped' : isBlock ? 'block' : (isInd || isShed) ? 'ind' : 'house';
    const wallMat = mats[wk];
    const bayW = TEX[FKEY[wk]].userData.W;
    const floorH = TEX[FKEY[wk]].userData.Hf;
    const wc = col(o.wall ? OVR_WALL[o.wall] ?? 0xe8e6e0 : isBlock ? BLOCKS[h % BLOCKS.length] : isInd || isShed ? [0xcfd2d4, 0xb9bcbf, 0xd8d4c8][h % 3] : WALLS[h % WALLS.length]);
    const base = b.y0 - 0.3;
    const floor0 = o.eave !== undefined ? b.y1 : b.y1 + 0.45;
    let top;
    if (o.eave !== undefined) top = b.y1 + o.eave;
    else if (isInd || b.roof === 'flat') top = b.y1 + (b.h ?? (isInd ? 7 : lv * 2.9 + 0.6));
    else if (isShed) top = b.y1 + 2.6;
    else top = floor0 + lv * floorH + 0.15;
    // --- walls (edges walked backwards so the quad normal points outwards) ---
    const n = P.length;
    for (let k = n - 1; k >= 0; k--) {
      const A = P[(k + 1) % n], C = P[k];
      const L = Math.hypot(C[0] - A[0], C[1] - A[1]);
      if (L < 0.05) continue;
      let u0 = 0, u1;
      if (L < 2.1 || isShed) { u0 = 0.02; u1 = 0.02 + Math.min(0.14, L / bayW * 0.14); }
      else u1 = Math.max(1, Math.round(L / bayW));
      const vTop = (top - floor0) / floorH;
      B.quad(wallMat, A[0], A[1], C[0], C[1], floor0, top, floor0, top, u0, u1, 0, vTop, 0, vTop, wc);
      // plinth / foundation following the terrain
      B.quad(o.plinth === 'stoneCladding' ? mats.stone : o.plinth === 'brown' ? mats.plinthBrown : mats.plinth, A[0], A[1], C[0], C[1], base, floor0, base, floor0, 0, L, 0, floor0 - base, 0, floor0 - base, null, { noCast: true });
      world.addStatic(new world.Box((A[0] + C[0]) / 2, (A[1] + C[1]) / 2, L / 2, 0.2, Math.atan2(-(C[1] - A[1]), C[0] - A[0]), base - 2, top + 6, 'house'));
    }
    stats.n++;
    // --- roof ---
    const flat = b.roof === 'flat' || b.roof === 'tank' || isInd;
    if (flat || isShed) {
      stats.flat++;
      const shape = P.map(p => new THREE.Vector2(p[0], p[1]));
      const tri = THREE.ShapeUtils.triangulateShape(shape, []);
      const pos = [], nrm = [], uv = [];
      for (const t of tri) for (const k of [t[0], t[2], t[1]]) { pos.push(P[k][0], top, P[k][1]); nrm.push(0, 1, 0); uv.push(P[k][0] / 3, P[k][1] / 3); }
      // ShapeUtils winding depends on the input orientation: make sure the cap faces up
      for (let i = 0; i < pos.length; i += 9) {
        const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
        if (uz * vx - ux * vz < 0) {
          for (const off of [0, 1, 2]) { const t = pos[i + 3 + off]; pos[i + 3 + off] = pos[i + 6 + off]; pos[i + 6 + off] = t; }
          const j = i / 9 * 6; const t0 = uv[j + 2], t1 = uv[j + 3]; uv[j + 2] = uv[j + 4]; uv[j + 3] = uv[j + 5]; uv[j + 4] = t0; uv[j + 5] = t1;
        }
      }
      B.tris(isShed ? mats.roofMetal : mats.roofFlat, pos, nrm, uv, isShed ? col(o.roof ? OVR_ROOF[o.roof] ?? 0xa8adb3 : ROOF_METAL[h % ROOF_METAL.length]) : null);
      // coping on the parapet
      if (!isShed) for (let k = 0; k < n; k++) {
        const A = P[k], C = P[(k + 1) % n];
        B.quad(mats.plinth, C[0], C[1], A[0], A[1], top, top + 0.35, top, top + 0.35, 0, 1, 0, 0.35, 0, 0.35, null, { noCast: true });
      }
    } else {
      const tiles = !o.roof && r() < 0.24;
      const roofMat = tiles || o.roofMat === 'tiles' ? mats.roofTiles : o.roofMat === 'metalTile' ? mats.roofMetalTile : mats.roofMetal;
      const rc = o.roof ? col(OVR_ROOF[o.roof] ?? 0xa8adb3) : tiles ? col([0xffffff, 0xd8c8c0, 0xb89a90][h % 3]) : col(ROOF_METAL[h % ROOF_METAL.length]);
      const pitch = THREE.MathUtils.degToRad(o.pitch ?? (tiles ? 34 : 27 + (h % 7)));
      const gable = o.roofType === 'gable' || (!o.roofType && b.r.length === 1 && r() < 0.28 && Math.max(b.r[0][2], b.r[0][3]) > 1.3 * Math.min(b.r[0][2], b.r[0][3]));
      if (gable) stats.gable++; else stats.hip++;
      let ridge = top;
      const gableMat = wk === 'shingle' ? mats.shinglePlain : mats.house;
      for (const [i, rr] of b.r.entries()) {
        // o.ridge applies to the main (largest) rectangle; the others keep their own axis (cross wings)
        const res = rectRoof(B, mats, rr, top, pitch, 0.45, rc, roofMat, gable, wc, { ridge: i === 0 || o.ridgeAll ? o.ridge : null, gableMat });
        ridge = Math.max(ridge, res.ridgeY);
      }
      if (b.roof === 'church') {
        const [cx, cz, hw, hd, a] = b.r[0];
        const along = hw >= hd ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
        const Lh = Math.max(hw, hd), s = Math.min(4.5, Math.min(hw, hd) * 1.3);
        const tx = cx - along[0] * (Lh - s / 2), tz = cz - along[1] * (Lh - s / 2);
        const tower = new THREE.BoxGeometry(s, ridge + 9 - b.y0, s);
        tower.translate(0, (ridge + 9 + b.y0) / 2, 0);
        const Tm = new THREE.Matrix4().makeRotationY(-Math.atan2(along[1], along[0])).setPosition(tx, 0, tz);
        B.geo(mats.house, tower, Tm, wc);
        const sp = new THREE.ConeGeometry(s * 0.72, 7, 4); sp.rotateY(Math.PI / 4); sp.translate(0, ridge + 9 + 3.5, 0);
        B.geo(mats.spire, sp, Tm);
        const cr = new THREE.BoxGeometry(0.12, 1.4, 0.7); cr.translate(0, ridge + 17.2, 0);
        B.geo(mats.spire, cr, Tm);
      }
      if (o.chimney || (!o.roofType && r() < 0.45)) {
        const rr = b.r[0];
        const off = (r() - 0.5) * Math.max(rr[2], rr[3]);
        const cxh = rr[0] + Math.cos(rr[4]) * off * (rr[2] >= rr[3] ? 1 : 0) - Math.sin(rr[4]) * off * (rr[2] < rr[3] ? 1 : 0);
        const czh = rr[1] + Math.sin(rr[4]) * off * (rr[2] >= rr[3] ? 1 : 0) + Math.cos(rr[4]) * off * (rr[2] < rr[3] ? 1 : 0);
        const ch = new THREE.BoxGeometry(0.5, ridge - top + 1.4, 0.5);
        ch.translate(cxh, top + (ridge - top + 1.4) / 2, czh);
        B.geo(mats.brick, ch);
      }
    }
    // street-facing service-drop anchor for buildings near the hand-built street
    const cx = P.reduce((s, p) => s + p[0], 0) / n, cz = P.reduce((s, p) => s + p[1], 0) / n;
    if (Math.abs(cx) < 40 && cz > GEO.meta.street.z0 && cz < GEO.meta.street.z1) {
      let best = P[0];
      for (const p of P) if (Math.abs(p[0]) < Math.abs(best[0])) best = p;
      fronts.push({ side: cx > 0 ? 1 : -1, z0: cz - 3, z1: cz + 3, x: best[0], drop: new THREE.Vector3(best[0], top - 0.3, best[1]) });
    }
  }
  return { fronts, stats };
}

// point-in-footprint test (for keeping hand-placed trees out of mapped buildings)
export function footprintIndex() {
  const cell = 20, grid = new Map();
  for (const b of GEO.buildings) {
    const P = [];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < b.p.length; i += 2) { P.push([b.p[i], b.p[i + 1]]); x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      const k = i + ',' + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(P);
    }
  }
  return (x, z, pad = 0) => {
    const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell));
    if (!list) return false;
    for (const P of list) {
      let inside = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, zi] = P[i], [xj, zj] = P[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) return true;
      if (pad > 0) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [ax, az] = P[j], [bx, bz] = P[i];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < pad) return true;
      }
    }
    return false;
  };
}
