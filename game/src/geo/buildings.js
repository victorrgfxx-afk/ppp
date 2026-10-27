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
// what the roofs of the houses are, by share: counted on the user's drone photo 3 of the streets by the Prahova (18 Oct
// 2026, ~50 roofs; photos 1 and 5 agree): zinc-coated corrugated or trapezoidal sheet ~35 % (bright when new, dull grey
// when old), pressed-steel tile or standing seam painted brown ~18 %, red ~12 %, burgundy ~10 %, anthracite ~4 %,
// green ~4 %, old sheet rusting through ~10 %, ceramic tiles ~6 %. Sheds and garages: mostly bare sheet, half of it rusty.
const ROOF_KINDS = [
  [0.35, 'galv', [0xb4b8bc, 0xa4a9ae, 0x969ba0, 0xa8a8a2]],
  [0.18, 'paint', [0x4e3026, 0x5a3a2c, 0x45302a]],
  [0.12, 'paint', [0x8a3a2e, 0x7e3a30, 0x944236]],
  [0.10, 'paint', [0x5e2a26, 0x542624, 0x64302c]],
  [0.04, 'paint', [0x3b3e43, 0x45484d]],
  [0.04, 'paint', [0x2f4a36, 0x3a5c44]],
  [0.10, 'rust', [0xffffff, 0xe6dcd2, 0xd2c8bc]],
  [0.07, 'tiles', [0xffffff, 0xd8c8c0, 0xb89a90]],
];
const SHED_KINDS = [[0.5, 'galv', [0xa4a9ae, 0x969ba0, 0x8c9196]], [0.35, 'rust', [0xffffff, 0xe6dcd2]], [0.15, 'paint', [0x5a3a2c, 0x8a2e24, 0x45484d]]];
const pickKind = (K, u, h) => { let a = 0; for (const k of K) { a += k[0]; if (u < a) return [k[1], k[2][h % k[2].length]]; } const k = K[K.length - 1]; return [k[1], k[2][0]]; };
const OVR_WALL = { stuccoWhite: 0xe8e6e0, stuccoCream: 0xe3d6bd, stuccoPeach: 0xdcb99a, stuccoGrayLight: 0xa9a8a4, woodDark: 0x6a4a3a, ochre: 0xd8a94e, gray: 0xb3b2ac, shingle: 0x7c7771, stampedGray: 0xa9acad, sand: 0xe3d0a0, brickRed: 0x9b5f47,
  // V81, from photos 17, 21, 22 against the game's renders of the same views: the dusty peach, the muted mustard, the
  // dark grey stamped render
  peachDusty: 0xd8bfb0, mustard: 0xcfad62, stampedDark: 0x8a8d8f };
const OVR_ROOF = { roofMetalGray: 0xa8adb3, roofMetalBrown: 0x5d3a2a, roofMetalRed: 0x8a2e24, roofMetalLight: 0xc4c9ce, metalTileBrown: 0x52302a, metalTileGreen: 0x2f4a36, roofMetalRust: 0x86553d, roofMetalDark: 0x45484d, roofMetalTeal: 0x5c9a92, tileRed: 0xffffff,
  // (photos 17, 21, 22) chocolate pressed-steel tile; old sheet, its paint faded and rusting in patches
  metalTileChoc: 0x45322c, roofRustOld: 0x7d5a46 };
// facade texture per wall material
const FKEY = { house: 'facadeHouse', houseB: 'facadeHouseB', block: 'facadeBlock', wood: 'facadeWood', ind: 'facadeInd', shingle: 'facadeShingle', stamped: 'facadeStamped' };
// the eaves on the photos (1, 2, 17-23): a fascia board along the eaves and up the verges, the overhang boarded
// underneath, a gutter with its downpipes, the chimney's corbelled brick cap. Colours by share as on the photos: the
// boards stained dark brown ~50 %, varnished pine ~15 %, painted white ~15 %, the roof's own sheet folded over ~20 %;
// gutters zinc ~40 %, brown ~30 %, white ~10 %, none ~20 % (the old houses: photo 22). -1: the roof's colour
const TRIMS = [[0.5, 0x4a3124], [0.15, 0x94643a], [0.15, 0xe2e0da], [0.2, -1]];
const GUTTERS = [[0.4, 0xa3a8ac], [0.3, 0x4b3428], [0.1, 0xe6e6e2], [0.2, 0]];
const OVR_TRIM = { woodDark: 0x4a3124, pine: 0x94643a, white: 0xe2e0da, roof: -1 };
const OVR_GUTTER = { zinc: 0xa3a8ac, brown: 0x4b3428, white: 0xe6e6e2, none: 0, roof: -1 };
const pickShare = (K, u) => { let a = 0; for (const [p, v] of K) { a += p; if (u < a) return v; } return K[K.length - 1][1]; };

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
    houseB: facade('facadeHouseB'),
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
    // the halls (the drone photos 5-6): light grey trapezoidal sheet, long strips of polycarbonate skylights
    roofHall: new THREE.MeshStandardMaterial({ map: TEX.roofGalv, normalMap: TEX.roofCorrN, roughness: 0.55, metalness: 0.3, vertexColors: true }),
    skylight: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, color: 0x9fb4c4 }),
    // corrugated sheet: galvanised, and old and rusting (the rust is rough and dull, the zinc a dull metal)
    roofGalv: new THREE.MeshStandardMaterial({ map: TEX.roofGalv, normalMap: TEX.roofCorrN, roughnessMap: TEX.roofGalvRM, metalnessMap: TEX.roofGalvRM, roughness: 1, metalness: 1, vertexColors: true, side: THREE.DoubleSide }),
    roofRust: new THREE.MeshStandardMaterial({ map: TEX.roofRust, normalMap: TEX.roofCorrN, roughnessMap: TEX.roofRustRM, metalnessMap: TEX.roofRustRM, roughness: 1, metalness: 1, vertexColors: true, side: THREE.DoubleSide }),
    brick: M.brick,
    // the eaves (eaves()): planed boards tinted per house, the gutters and downpipes painted sheet
    trim: Object.assign(facade('facadeWoodP'), { name: 'eaves' }),
    gutter: new THREE.MeshStandardMaterial({ name: 'gutters', roughness: 0.45, metalness: 0.4, vertexColors: true, side: THREE.DoubleSide }),
    spire: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8, color: 0x8a8f94 }),
  };
}

function pushFace(B, material, pts, uvs, color, down = false) {
  // convex polygon fan; flips so the normal points up (down: points down, a soffit)
  const [a, b, c] = pts;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  let order = pts.map((_, i) => i);
  if (down ? ny > 0 : ny < 0) { order = order.reverse(); nx = -nx; ny = -ny; nz = -nz; }
  const pos = [], nrm = [], uv = [];
  for (let i = 1; i < order.length - 1; i++) for (const k of [order[0], order[i], order[i + 1]]) {
    pos.push(...pts[k]); nrm.push(nx, ny, nz); uv.push(...uvs[k]);
  }
  B.tris(material, pos, nrm, uv, color);
}

// hipped (or gable) roof over one rectangle
function rectRoof(B, mats, r, top, pitch, ov, color, roofMat, gable, wallColor, { ridge = null, gableMat = mats.house, gableColor = wallColor } = {}) {
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
      B.tris(gableMat, pos, [nx, 0, nz, nx, 0, nz, nx, 0, nz], uv, gableColor);
    }
  }
  return { ridgeY, eaveY, P, H, D, R, hw, hd, gable, cx, cz };
}

// a 4-sided pipe from a to b ([x, y, z]), w wide (downpipes)
function pipe(B, m, a, b, w, color) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1;
  const t = d.map(v => v / L);
  // two axes across the pipe: horizontal, then the third
  let p = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [-t[2], 0, t[0]];
  const pl = Math.hypot(...p); p = p.map(v => v / pl * w / 2);
  const q = [t[1] * p[2] - t[2] * p[1], t[2] * p[0] - t[0] * p[2], t[0] * p[1] - t[1] * p[0]];
  const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => [p[0] * i + q[0] * j, p[1] * i + q[1] * j, p[2] * i + q[2] * j]);
  const pos = [], nrm = [], uv = [];
  for (let k = 0; k < 4; k++) {
    const c0 = C[k], c1 = C[(k + 1) % 4], n = [c0[0] + c1[0], c0[1] + c1[1], c0[2] + c1[2]], nl = Math.hypot(...n) || 1;
    const v = [a.map((x, i) => x + c0[i]), b.map((x, i) => x + c0[i]), b.map((x, i) => x + c1[i]), a.map((x, i) => x + c1[i])];
    // wound so the face looks outwards
    const e1 = v[1].map((x, i) => x - v[0][i]), e2 = v[2].map((x, i) => x - v[0][i]);
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const o = f[0] * n[0] + f[1] * n[1] + f[2] * n[2] > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of o) { pos.push(...v[i]); nrm.push(n[0] / nl, n[1] / nl, n[2] / nl); uv.push(i === 1 || i === 2 ? L : 0, 0); }
  }
  B.tris(m, pos, nrm, uv, color);
}

// the eaves of one roof rectangle (rectRoof's frame): the fascia board along the eaves and up the verges, the soffit
// boarded under the overhang, the gutter along the eaves; downpipes from it down the walls at the corners in `pipes`
// ([s, u] signs: the corner of the rectangle), unless `inside` says the spot is in the building
function eaves(B, mats, f, { trim, fasciaMat, soffit, gutter, pipes = [], base, inside }) {
  const { P, H, D, hw, hd, gable, eaveY, ridgeY, cx, cz } = f, ft = 0.2, yS = eaveY - ft;
  const W = 3.2, Hf = 2.8;                                  // the board texture's tile (facadeWoodP)
  // a vertical board a -> b ([s, u] in the roof's frame) between the heights given at each end, facing out
  const board = (m, a, b, ya, yb, h, col) => {
    let A = P(a[0], a[1], 0), C = P(b[0], b[1], 0), y0 = ya, y1 = yb;
    const nx = -(C[2] - A[2]), nz = C[0] - A[0];
    if (nx * ((A[0] + C[0]) / 2 - cx) + nz * ((A[2] + C[2]) / 2 - cz) < 0) { [A, C] = [C, A]; [y0, y1] = [y1, y0]; }
    const L = Math.hypot(C[0] - A[0], C[2] - A[2]);
    B.quad(m, A[0], A[2], C[0], C[2], y0 - h, y0, y1 - h, y1, 0, L / W, (y0 - h) / Hf, y0 / Hf, (y1 - h) / Hf, y1 / Hf, col, { noCast: true });
  };
  // the soffit: one board per side under the overhang (mitred at a hip's corners), sloping under a gable's verges
  const sof = (pts) => pushFace(B, mats.trim, pts.map(([s, u, y]) => P(s, u, y)), pts.map(([s, u]) => [s / W, u / Hf]), soffit, true);
  const yR = ridgeY - ft;
  if (gable) {
    sof([[-hw, -D, yS], [hw, -D, yS], [hw, -hd, yS], [-hw, -hd, yS]]);
    sof([[-hw, D, yS], [hw, D, yS], [hw, hd, yS], [-hw, hd, yS]]);
    for (const k of [-1, 1]) {
      sof([[k * hw, -D, yS], [k * H, -D, yS], [k * H, 0, yR], [k * hw, 0, yR]]);
      sof([[k * hw, 0, yR], [k * H, 0, yR], [k * H, D, yS], [k * hw, D, yS]]);
    }
  } else {
    sof([[-H, -D, yS], [H, -D, yS], [hw, -hd, yS], [-hw, -hd, yS]]);
    sof([[H, D, yS], [-H, D, yS], [-hw, hd, yS], [hw, hd, yS]]);
    sof([[H, -D, yS], [H, D, yS], [hw, hd, yS], [hw, -hd, yS]]);
    sof([[-H, D, yS], [-H, -D, yS], [-hw, -hd, yS], [-hw, hd, yS]]);
  }
  // the fascia: along the eaves, and up the verges of a gable
  const top = eaveY + 0.03;
  board(fasciaMat, [-H, -D], [H, -D], top, top, ft + 0.03, trim);
  board(fasciaMat, [-H, D], [H, D], top, top, ft + 0.03, trim);
  for (const k of [-1, 1]) {
    if (gable) {
      board(fasciaMat, [k * H, -D], [k * H, 0], top, ridgeY + 0.03, ft + 0.03, trim);
      board(fasciaMat, [k * H, 0], [k * H, D], ridgeY + 0.03, top, ft + 0.03, trim);
    } else board(fasciaMat, [k * H, -D], [k * H, D], top, top, ft + 0.03, trim);
  }
  if (!gutter) return;
  // the gutter: its outer face and its bottom, 13 cm out from the fascia, along the eaves (round a hip's corners)
  const g = 0.13, yg0 = eaveY - 0.17, yg1 = eaveY - 0.03, e = gable ? 0 : g;
  const run = (a, b, ao, bo) => {
    board(mats.gutter, ao, bo, yg1, yg1, yg1 - yg0, gutter);
    pushFace(B, mats.gutter, [a, b, bo, ao].map(([s, u]) => P(s, u, yg0)), [[0, 0], [1, 0], [1, 1], [0, 1]], gutter, true);
  };
  for (const k of [-1, 1]) run([-H - e, k * D], [H + e, k * D], [-H - e, k * (D + g)], [H + e, k * (D + g)]);
  if (!gable) for (const k of [-1, 1]) run([k * H, -D - g], [k * H, D + g], [k * (H + g), -D - g], [k * (H + g), D + g]);
  // the downpipes: down the wall from a gooseneck under the gutter
  for (const [ks, ku] of pipes) {
    const s = ks * Math.max(0, hw - 0.25), uw = ku * (hd + 0.07);
    const w0 = P(s, uw, 0);
    if (inside && inside(w0[0], w0[2])) continue;
    const yk = yS - 0.25;
    pipe(B, mats.gutter, P(s, uw, base), P(s, uw, yk), 0.08, gutter);
    pipe(B, mats.gutter, P(s, uw, yk), P(s, ku * (D + g / 2), yg0), 0.08, gutter);
  }
}

// detailR: the eaves' boards, gutters and downpipes and the chimneys' caps on the buildings within it of the street
// (and on every photographed one): QUALITY.bldDetail
export function buildBuildings(B, world, mats, detailR = 1200) {
  const fronts = [];
  const stats = { n: 0, hip: 0, gable: 0, flat: 0, eaves: 0 };
  B.cullFor.set(mats.trim, 1500); B.cullFor.set(mats.gutter, 600);
  for (const b of GEO.buildings) {
    const h = hashId(b.id);
    const r = rng(h);
    const r2 = rng(h ^ 0x5bd1e995);          // (the eaves' draws: the looks drawn with r stay as they were)
    const o = b.o || {};
    const P = [];
    for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    if (P.length < 3) continue;
    const kind = b.b;
    const lv = o.levels ?? b.lv ?? 1;
    const isBlock = kind === 'apartments' || lv >= 4;
    const isInd = ['industrial', 'warehouse', 'manufacture', 'hangar', 'retail', 'supermarket', 'commercial', 'storage_tank', 'sports_hall'].includes(kind);
    const isShed = b.roof === 'shed' || kind === 'garage' || kind === 'garages' || kind === 'shed';
    let wk = o.wall === 'woodDark' ? 'wood' : o.wall === 'shingle' ? 'shingle' : o.wall === 'stampedGray' || o.wall === 'stampedDark' ? 'stamped' : isBlock ? 'block' : (isInd || isShed) ? 'ind' : 'house';
    // brown wood-look window frames on about a third of the houses (the photos), on the photographed ones as seen
    if (wk === 'house' && (o.frame ? o.frame === 'woodDark' : r2() < 0.35)) wk = 'houseB';
    const near = !!b.o || P[0][0] * P[0][0] + P[0][1] * P[0][1] < detailR * detailR;
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
    // the yellow gas pipe along the front nearest the street, under the eaves, down to the ground at its +z end (photo 2)
    if (o.gas) {
      let k0 = 0, best = Infinity;
      for (let k = 0; k < n; k++) { const m = Math.abs(P[k][0] + P[(k + 1) % n][0]); if (m < best) { best = m; k0 = k; } }
      const A = P[k0], C = P[(k0 + 1) % n], L = Math.hypot(C[0] - A[0], C[1] - A[1]), tx = (C[0] - A[0]) / L, tz = (C[1] - A[1]) / L;
      const mx = P.reduce((s, p) => s + p[0], 0) / n, mz = P.reduce((s, p) => s + p[1], 0) / n;
      let nx = -tz, nz = tx;
      if (nx * (A[0] - mx) + nz * (A[1] - mz) < 0) { nx = -nx; nz = -nz; }
      const at = (s, y = floor0 + 2.2) => [A[0] + tx * s + nx * 0.12, y, A[1] + tz * s + nz * 0.12];
      pipe(B, M.gasPipe, at(0.3), at(L - 0.3), 0.06, null);
      const e = tz > 0 ? L - 0.3 : 0.3;
      pipe(B, M.gasPipe, at(e, b.y0 - 0.05), at(e), 0.06, null);
    }
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
      const [sk, sc] = pickKind(SHED_KINDS, r(), h);
      const shedMat = o.roof ? mats.roofMetal : sk === 'galv' ? mats.roofGalv : sk === 'rust' ? mats.roofRust : mats.roofMetal;
      const hall = isInd && kind !== 'storage_tank' && b.roof !== 'tank';
      B.tris(isShed ? shedMat : hall ? mats.roofHall : mats.roofFlat, pos, nrm, uv, isShed ? col(o.roof ? OVR_ROOF[o.roof] ?? 0xa8adb3 : sc) : hall ? col([0xb8bcc0, 0xa8adb2, 0xc4c6c4][h % 3]) : null);
      // a big hall's skylights: strips along its length every ~9 m, clear of its edges
      if (hall && b.r?.length && 4 * b.r[0][2] * b.r[0][3] > 600) {
        const [cx, cz, hw, hd, a] = b.r[0], ex = [Math.cos(a), Math.sin(a)], ez = [-Math.sin(a), Math.cos(a)];
        const [L, S, Lh, Sh] = hw >= hd ? [ex, ez, hw, hd] : [ez, ex, hd, hw];
        const k = Math.max(1, Math.round(2 * Sh / 9));
        for (let i = 0; i < k; i++) {
          const t = -Sh + (i + 0.5) * 2 * Sh / k, Q = (u, v) => [cx + L[0] * u + S[0] * v, top + 0.06, cz + L[1] * u + S[1] * v];
          pushFace(B, mats.skylight, [Q(-Lh + 2.5, t - 0.8), Q(Lh - 2.5, t - 0.8), Q(Lh - 2.5, t + 0.8), Q(-Lh + 2.5, t + 0.8)], [[0, 0], [1, 0], [1, 1], [0, 1]], null);
        }
      }
      // coping on the parapet
      if (!isShed) for (let k = 0; k < n; k++) {
        const A = P[k], C = P[(k + 1) % n];
        B.quad(mats.plinth, C[0], C[1], A[0], A[1], top, top + 0.35, top, top + 0.35, 0, 1, 0, 0.35, 0, 0.35, null, { noCast: true });
      }
    } else {
      const [rk, rhex] = pickKind(ROOF_KINDS, r(), h), tiles = !o.roof && rk === 'tiles';
      const roofMat = tiles || o.roofMat === 'tiles' ? mats.roofTiles : o.roofMat === 'metalTile' ? mats.roofMetalTile : o.roof ? mats.roofMetal
        : rk === 'galv' ? mats.roofGalv : rk === 'rust' ? mats.roofRust : r() < 0.55 ? mats.roofMetalTile : mats.roofMetal;
      const rc = o.roof ? col(OVR_ROOF[o.roof] ?? 0xa8adb3) : col(rhex);
      const pitch = THREE.MathUtils.degToRad(o.pitch ?? (tiles ? 34 : 27 + (h % 7)));
      const gable = o.roofType === 'gable' || (!o.roofType && b.r.length === 1 && r() < 0.28 && Math.max(b.r[0][2], b.r[0][3]) > 1.3 * Math.min(b.r[0][2], b.r[0][3]));
      if (gable) stats.gable++; else stats.hip++;
      let ridge = top;
      // the overhang: 0.5-0.8 m on the houses of the photos; the gables boarded on a quarter of the newer houses
      // (photos 21, 23), as seen on the photographed ones (o.gable)
      const ov = o.ov ?? (isBlock ? 0.45 : 0.5 + 0.3 * r2());
      const trimHex = o.trim ? OVR_TRIM[o.trim] ?? 0x4a3124 : pickShare(TRIMS, r2());
      const gutHex = o.gutter ? OVR_GUTTER[o.gutter] ?? 0xa3a8ac : pickShare(GUTTERS, r2());
      const woodGable = o.gable ? o.gable === 'wood' : gable && !isBlock && r2() < 0.25;
      const trim = trimHex === -1 ? rc : col(trimHex);
      const ed = near && {
        trim, fasciaMat: trimHex === -1 ? mats.gutter : mats.trim, soffit: trimHex === -1 ? wc.map(v => v * 0.8) : trim,
        gutter: gutHex === 0 ? null : gutHex === -1 ? rc : col(gutHex), base: b.y0,
        inside: (x, z) => inPoly(P, x, z),
      };
      const gableMat = woodGable ? mats.trim : wk === 'shingle' ? mats.shinglePlain : mats.house;
      const gableColor = woodGable ? col(OVR_TRIM[o.gableTrim] ?? (trimHex > 0 ? trimHex : 0x4a3124)) : wc;
      let f0 = null;
      for (const [i, rr] of b.r.entries()) {
        // o.ridge applies to the main (largest) rectangle; the others keep their own axis (cross wings)
        const res = rectRoof(B, mats, rr, top, pitch, ov, rc, roofMat, gable, wc, { ridge: i === 0 || o.ridgeAll ? o.ridge : null, gableMat, gableColor });
        ridge = Math.max(ridge, res.ridgeY);
        if (i === 0) f0 = res;
        if (ed) eaves(B, mats, res, { ...ed, pipes: i === 0 ? [[1, -1], [-1, 1]] : [] });
      }
      if (ed) stats.eaves++;
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
        let cxh = rr[0] + Math.cos(rr[4]) * off * (rr[2] >= rr[3] ? 1 : 0) - Math.sin(rr[4]) * off * (rr[2] < rr[3] ? 1 : 0);
        let czh = rr[1] + Math.sin(rr[4]) * off * (rr[2] >= rr[3] ? 1 : 0) + Math.cos(rr[4]) * off * (rr[2] < rr[3] ? 1 : 0);
        let cTop = ridge + 1.4;
        // where the photos show it: [along the ridge, across it] as fractions of the main rectangle's half sides
        if (Array.isArray(o.chimney) && f0) { [cxh, , czh] = f0.P(o.chimney[0] * f0.hw, o.chimney[1] * f0.hd, 0); cTop = f0.ridgeY + 0.9; }
        const ch = new THREE.BoxGeometry(0.5, cTop - top, 0.5);
        ch.translate(cxh, (top + cTop) / 2, czh);
        B.geo(mats.brick, ch);
        if (near) {
          // the corbelled courses at the top and the concrete cap (photos 1, 18)
          const cap = new THREE.BoxGeometry(0.66, 0.18, 0.66); cap.translate(cxh, cTop - 0.2, czh); B.geo(mats.brick, cap);
          const slab = new THREE.BoxGeometry(0.72, 0.05, 0.72); slab.translate(cxh, cTop + 0.025, czh); B.geo(mats.plinth, slab, null, null, { noCast: true });
        }
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

function inPoly(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
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
