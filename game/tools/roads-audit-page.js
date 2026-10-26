// The map's roads audited on their real geometry (run in the game's page by tools/roads-audit.mjs, once the world is
// built): every road is rebuilt by geo/roads.js into a recording builder, and its triangles are checked against the
// ground (geo/data.js heightAt: the terrain mesh at full resolution, the fine zones and underpasses included), the
// ground as the farther terrain LODs draw it (geo/terrain.js), the other roads, and what stands on the map.
import { GEO, heightAt, holeFlag } from '../src/geo/data.js';
import { emitRibbon, makeRoadMaterials, planRoads } from '../src/geo/roads.js';
import { eachForestTree, eachShrub } from '../src/geo/trees.js';
import { onRoad as onPlan } from '../src/geo/roadbed.js';

const SURF = 1, SHOULDER = 2;

export async function audit(opt = {}) {
  const T0 = performance.now(), log = [];
  const t = (m) => log.push(m + ' ' + ((performance.now() - T0) / 1000).toFixed(1) + 's');
  // ---- 1. every road's triangles, by road (the builder's calls tagged with the road being built)
  const mats = makeRoadMaterials();
  const cls = new Map([[mats.asphalt, SURF], [mats.concrete, SURF], [mats.paving, SURF], [mats.cobble, SURF], [mats.gravel, SURF], [mats.dirt, SURF], [mats.shoulder, SHOULDER]]);
  let cap = 1 << 20, n = 0, TP = new Float32Array(cap * 9), TR = new Int32Array(cap), TC = new Uint8Array(cap);
  const grow = () => { cap *= 2; const a = new Float32Array(cap * 9); a.set(TP); TP = a; const b = new Int32Array(cap); b.set(TR); TR = b; const c = new Uint8Array(cap); c.set(TC); TC = c; };
  // (the plans the game built, by road: geo/roads.js planRoads, roadbed.js)
  const orig = GEO.roads, ix = new Map(orig.map((r, i) => [r, i]));
  let cur = -1;
  const fake = {
    tris(m, pos) {
      const c = cls.get(m);
      if (!c || cur < 0) return;
      for (let i = 0; i + 8 < pos.length; i += 9) {
        if (n >= cap) grow();
        for (let k = 0; k < 9; k++) TP[n * 9 + k] = pos[i + k];
        TR[n] = cur; TC[n] = c; n++;
      }
    },
    quad() {}, geo() {},
  };
  const plans = GEO.roadPlan ?? planRoads();
  const byRoad = new Map();
  for (const pl of plans) { const i = ix.get(pl.r) ?? orig.findIndex(r => r.id === pl.r.id); if (!byRoad.has(i)) byRoad.set(i, []); byRoad.get(i).push(pl); }
  for (const [i, list] of [...byRoad].sort((a, b) => a[0] - b[0])) { cur = i; for (const pl of list) emitRibbon(fake, mats, pl, () => false); }
  t('triangles ' + n);
  // per road: its triangles [from, to)
  const R = orig.map((r, i) => ({ i, r, from: -1, to: -1 }));
  for (let k = 0; k < n; k++) { const q = R[TR[k]]; if (q.from < 0) q.from = k; q.to = k + 1; }

  // ---- 2. spatial index of the surfaces (8 m cells, CSR)
  const CELL = 8, ORG = -8400, NC = 2100;
  const cellOf = (x, z) => { const i = Math.floor((x - ORG) / CELL), j = Math.floor((z - ORG) / CELL); return i < 0 || j < 0 || i >= NC || j >= NC ? -1 : j * NC + i; };
  const cnt = new Int32Array(NC * NC + 1);
  const bboxCells = (k, cb) => {
    const o = k * 9;
    const x0 = Math.min(TP[o], TP[o + 3], TP[o + 6]), x1 = Math.max(TP[o], TP[o + 3], TP[o + 6]);
    const z0 = Math.min(TP[o + 2], TP[o + 5], TP[o + 8]), z1 = Math.max(TP[o + 2], TP[o + 5], TP[o + 8]);
    const i0 = Math.max(0, Math.floor((x0 - ORG) / CELL)), i1 = Math.min(NC - 1, Math.floor((x1 - ORG) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - ORG) / CELL)), j1 = Math.min(NC - 1, Math.floor((z1 - ORG) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cb(j * NC + i);
  };
  for (let k = 0; k < n; k++) if (TC[k] === SURF) bboxCells(k, (c) => cnt[c + 1]++);
  for (let c = 0; c < NC * NC; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, NC * NC), idx = new Int32Array(cnt[NC * NC]);
  for (let k = 0; k < n; k++) if (TC[k] === SURF) bboxCells(k, (c) => { idx[fill[c]++] = k; });
  t('index');
  // the surfaces at (x, z): cb(tri, y) for each road triangle containing the point
  const surfAt = (x, z, cb) => {
    const c = cellOf(x, z);
    if (c < 0) return;
    for (let q = cnt[c]; q < cnt[c + 1]; q++) {
      const k = idx[q], o = k * 9;
      const ax = TP[o], az = TP[o + 2], bx = TP[o + 3], bz = TP[o + 5], cx = TP[o + 6], cz = TP[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      cb(k, l1 * TP[o + 1] + l2 * TP[o + 4] + l3 * TP[o + 7]);
    }
  };
  const onRoad = (x, z, skip = -1) => { let hit = -1; surfAt(x, z, (k) => { if (hit < 0 && TR[k] !== skip) hit = TR[k]; }); return hit; };
  // deep inside a road: the point and four around it at r metres
  const deepIn = (x, z, r) => { const a = onRoad(x, z); if (a < 0) return -1; for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (onRoad(x + dx, z + dz) < 0) return -1; return a; };

  // junctions (as geo/roads.js): vertices shared by several ways
  const jc = new Map(), inner = new Set(), key = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
  for (const r of orig) for (let i = 0; i < r.p.length; i += 2) { const k = key(r.p[i], r.p[i + 1]); jc.set(k, (jc.get(k) || 0) + 1); if (i > 0 && i < r.p.length - 2) inner.add(k); }
  const JH = new Map(), JCELL = 40;
  for (const [k, c] of jc) if (c > 2 || (c === 2 && inner.has(k))) {
    const [x, z] = k.split(',').map(v => v / 10), hk = Math.floor(x / JCELL) + ',' + Math.floor(z / JCELL);
    if (!JH.has(hk)) JH.set(hk, []); JH.get(hk).push([x, z]);
  }
  const nearJ = (x, z, d) => { const i = Math.floor(x / JCELL), j = Math.floor(z / JCELL); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) for (const p of JH.get(a + ',' + b) || []) if (Math.hypot(p[0] - x, p[1] - z) < d) return true; return false; };

  // ---- 3. per road: the ground through the surface, the edges in the air, the long profile, overlaps
  const lenOf = (r) => { let L = 0; for (let i = 2; i < r.p.length; i += 2) L += Math.hypot(r.p[i] - r.p[i - 2], r.p[i + 1] - r.p[i - 1]); return L; };
  // the farther LODs of the terrain (geo/terrain.js levels): the grid's every s-th node, the same diagonal
  const coarse = (G, s, x, z) => {
    const { n: gn, ext, step, H } = G, st = step * s, m = (gn - 1) / s;
    let fx = (x + ext) / st, fz = (z + ext) / st;
    fx = Math.min(m - 1e-4, Math.max(0, fx)); fz = Math.min(m - 1e-4, Math.max(0, fz));
    const C = GEO.lodAdj?.get(G)?.get(s), mc = m + 1, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => C ? C[b * mc + a] : H[(b * s) * gn + a * s];
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const inNear = (x, z) => Math.abs(x) < GEO.ext && Math.abs(z) < GEO.ext;
  const out = [];
  const tot = { through: 0, throughShoulder: 0, float: 0, overlap: 0, overlapConflict: 0, junctionStep: 0, shoulderOver: 0, lod2: 0, lod5: 0, lodN: 0, area: 0 };
  for (const q of R) {
    const r = q.r;
    if (q.from < 0) continue;
    const res = { i: q.i, id: r.id, n: r.n || '', c: r.c, s: r.s, w: r.w, br: !!r.br, len: Math.round(lenOf(r)) };
    let thA = 0, thM = 0, thAt = null, shA = 0, shM = 0, shAt = null, ovA = 0, ovC = 0, ovAt = null, ovWith = new Map(), jsA = 0, jsM = 0, jsAt = null, soA = 0, soAt = null;
    let l2 = 0, l5 = 0, ln = 0, lnAt = null, l5M = 0, area = 0;
    const edges = new Map(), ek = (ax, az, bx, bz) => { const a = Math.round(ax * 200) + ':' + Math.round(az * 200), b = Math.round(bx * 200) + ':' + Math.round(bz * 200); return a < b ? a + '|' + b : b + '|' + a; };
    for (let k = q.from; k < q.to; k++) {
      if (TR[k] !== q.i) continue;
      const o = k * 9, c = TC[k];
      const A = [TP[o], TP[o + 1], TP[o + 2]], B = [TP[o + 3], TP[o + 4], TP[o + 5]], C = [TP[o + 6], TP[o + 7], TP[o + 8]];
      const triA = Math.abs((B[0] - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (B[2] - A[2])) / 2;
      if (c === SURF) area += triA;
      for (const [p, s] of [[A, B], [B, C], [C, A]]) { const kk = ek(p[0], p[2], s[0], s[2]); const e = edges.get(kk); if (e) e.n++; else edges.set(kk, { n: 1, a: p, b: s }); }
      const L = Math.max(Math.hypot(B[0] - A[0], B[2] - A[2]), Math.hypot(C[0] - B[0], C[2] - B[2]), Math.hypot(A[0] - C[0], A[2] - C[2]));
      const m = Math.max(1, Math.ceil(L / 0.6)), np = (m + 1) * (m + 2) / 2, dA = triA / np;
      for (let a = 0; a <= m; a++) for (let b = 0; a + b <= m; b++) {
        const l1 = a / m, l2b = b / m, l3 = 1 - l1 - l2b;
        const x = A[0] * l1 + B[0] * l2b + C[0] * l3, y = A[1] * l1 + B[1] * l2b + C[1] * l3, z = A[2] * l1 + B[2] * l2b + C[2] * l3;
        const g = heightAt(x, z), d = g - y;
        if (c === SURF) {
          if (d > 0.02) { thA += dA; if (d > thM) { thM = d; thAt = [x, z]; } }
        } else if (d > 0.02 && onRoad(x, z, q.i) < 0) { shA += dA; if (d > shM) { shM = d; shAt = [x, z]; } }
        // overlaps with other roads (a lattice point in four)
        if ((a + b) % 2 === 0 && (a % 2 === 0)) {
          let best = null;
          surfAt(x, z, (kk, yy) => { if (TR[kk] !== q.i && (!best || Math.abs(yy - y) > Math.abs(best[1] - y))) best = [TR[kk], yy]; });
          if (best) {
            const dd = y - best[1], o2 = R[best[0]].r, jn = nearJ(x, z, (r.w + o2.w) / 2 + 3);
            if (c === SHOULDER) { if (dd > 0.008) { soA += dA * 4; soAt ??= [x, z, best[0], +dd.toFixed(3)]; } }
            else if (jn) { if (Math.abs(dd) > 0.05) { jsA += dA * 4; if (Math.abs(dd) > jsM) { jsM = Math.abs(dd); jsAt = [x, z, best[0]]; } } }
            else if (!(r.br || o2.br)) { ovA += dA * 4; ovAt ??= [x, z]; ovWith.set(best[0], (ovWith.get(best[0]) || 0) + dA * 4); if (Math.abs(dd) > 0.02) ovC += dA * 4; }
          }
        }
        // the far terrain over the road (surfaces only, a lattice point in four)
        if (c === SURF && !r.br && (a + b) % 2 === 0 && (a % 2 === 0)) {
          if (inNear(x, z)) {
            const h2 = coarse(GEO, 2, x, z) - y, h5 = coarse(GEO, 5, x, z) - y;
            if (h2 > 0.05) l2 += dA * 4;
            if (h5 > 0.05) { l5 += dA * 4; if (h5 > l5M) l5M = h5; }
          } else if (GEO.W) {
            const h2 = coarse(GEO.W, 2, x, z) - y;
            if (h2 > 0.05) { ln += dA * 4; lnAt ??= [x, z]; }
          }
        }
      }
    }
    // edges in the air: the road's outline (an edge of one triangle only), where the ground lies more than 12 cm below
    let flL = 0, flM = 0, flAt = null;
    if (!r.br) for (const e of edges.values()) {
      if (e.n !== 1) continue;
      const L = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]), m = Math.max(1, Math.ceil(L / 0.5));
      for (let s = 0; s < m; s++) {
        const f = (s + 0.5) / m, x = e.a[0] + (e.b[0] - e.a[0]) * f, z = e.a[2] + (e.b[2] - e.a[2]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f;
        const gap = y - heightAt(x, z);
        if (gap > 0.12 && onRoad(x + 0.3, z) < 0 && onRoad(x - 0.3, z) < 0 && onRoad(x, z + 0.3) < 0 && onRoad(x, z - 0.3) < 0) { flL += L / m; if (gap > flM) { flM = gap; flAt = [x, z]; } }
      }
    }
    // the long profile along the axis (the ribbon follows the ground there): steepest grade, sharpest kink over 4 m
    let gM = 0, gAt = null, kM = 0, kAt = null;
    if (!r.br) for (const pl of byRoad.get(q.i) || []) {
      // (the road's own long profile: its axis heights, geo/roads.js planRibbon)
      const pts = pl.P, Y = pl.Yc, S = [0];
      for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      let j = 0;
      for (let i = 0; i < pts.length; i++) {
        while (j < pts.length - 1 && S[j] - S[i] < 4) j++;
        if (S[j] - S[i] < 3.5) break;
        const gr = (Y[j] - Y[i]) / (S[j] - S[i]);
        if (Math.abs(gr) > gM) { gM = Math.abs(gr); gAt = pts[i]; }
        let h = j; while (h < pts.length - 1 && S[h] - S[j] < 4) h++;
        if (S[h] - S[j] >= 3.5) { const g2 = (Y[h] - Y[j]) / (S[h] - S[j]), kk = Math.abs(g2 - gr); if (kk > kM) { kM = kk; kAt = pts[j]; } }
      }
    }
    Object.assign(res, {
      area: Math.round(area),
      through: { a: +thA.toFixed(2), max: +thM.toFixed(3), at: thAt && thAt.map(v => +v.toFixed(1)) },
      shoulderThrough: { a: +shA.toFixed(2), max: +shM.toFixed(3), at: shAt && shAt.map(v => +v.toFixed(1)) },
      float: { len: +flL.toFixed(1), max: +flM.toFixed(2), at: flAt && flAt.map(v => +v.toFixed(1)) },
      grade: { max: +gM.toFixed(3), at: gAt && gAt.map(v => +v.toFixed(1)) }, kink: { max: +kM.toFixed(3), at: kAt && kAt.map(v => +v.toFixed(1)) },
      overlap: { a: +ovA.toFixed(1), conflict: +ovC.toFixed(1), at: ovAt && ovAt.map(v => +v.toFixed(1)), with: [...ovWith].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i, a]) => ({ id: orig[i].id, c: orig[i].c, s: orig[i].s, n: orig[i].n || '', a: +a.toFixed(1) })) },
      junctionStep: { a: +jsA.toFixed(1), max: +jsM.toFixed(2), at: jsAt && [+jsAt[0].toFixed(1), +jsAt[1].toFixed(1), orig[jsAt[2]].id] },
      shoulderOver: { a: +soA.toFixed(1), at: soAt && [+soAt[0].toFixed(1), +soAt[1].toFixed(1), orig[soAt[2]].id, soAt[3]] },
      lod: { a2: +l2.toFixed(1), a5: +l5.toFixed(1), max5: +l5M.toFixed(2), aW: +ln.toFixed(1), atW: lnAt && lnAt.map(v => +v.toFixed(1)) },
      objects: { buildings: [], trees: 0, forest: 0, shrubs: 0, poles: 0, power: 0, fences: [] },
    });
    tot.through += thA; tot.throughShoulder += shA; tot.float += flL; tot.overlap += ovA; tot.overlapConflict += ovC; tot.junctionStep += jsA; tot.shoulderOver += soA;
    tot.lod2 += l2; tot.lod5 += l5; tot.lodN += ln; tot.area += area;
    out[q.i] = res;
  }
  t('per road');

  // ---- 4. what stands on the carriageway
  const objAt = (x, z, r) => deepIn(x, z, r);
  let nB = 0;
  for (const b of GEO.buildings) {
    const P = [];
    for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    const hit = new Map();
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 0.7));
      for (let s = 0; s <= m; s++) { const x = ax + (bx - ax) * s / m, z = az + (bz - az) * s / m, a = objAt(x, z, 0.3); if (a >= 0) hit.set(a, (hit.get(a) || 0) + L / m); }
    }
    for (const [a, l] of hit) if (l > 0.5 && out[a]) { out[a].objects.buildings.push({ id: b.id, b: b.b, len: +l.toFixed(1), at: [+P[0][0].toFixed(1), +P[0][1].toFixed(1)] }); nB++; }
  }
  t('buildings');
  const tr = GEO.trees;
  let nT = 0;
  for (let i = 0; i < tr.n; i++) { if (tr.s[i] <= 0) continue; const a = objAt(tr.x[i], tr.z[i], 0.25); if (a >= 0 && out[a]) { out[a].objects.trees++; (out[a].objects.treeAt ??= [+tr.x[i].toFixed(1), +tr.z[i].toFixed(1)]); nT++; } }
  let nF = 0, nS = 0;
  const E = GEO.worldExt, TILE = 400;
  for (let z0 = -E; z0 < E; z0 += TILE) for (let x0 = -E; x0 < E; x0 += TILE) {
    let any = false;
    for (let z = z0; z < z0 + TILE && !any; z += CELL) for (let x = x0; x < x0 + TILE && !any; x += CELL) { const c = cellOf(x, z); if (c >= 0 && cnt[c + 1] > cnt[c]) any = true; }
    if (!any) continue;
    eachForestTree(x0, z0, x0 + TILE, z0 + TILE, (x, z) => { const a = objAt(x, z, 0.25); if (a >= 0 && out[a]) { out[a].objects.forest++; out[a].objects.forestAt ??= [+x.toFixed(1), +z.toFixed(1)]; nF++; } });
    eachShrub(x0, z0, x0 + TILE, z0 + TILE, (x, z) => { const a = objAt(x, z, 0.4); if (a >= 0 && out[a]) { out[a].objects.shrubs++; out[a].objects.shrubAt ??= [+x.toFixed(1), +z.toFixed(1)]; nS++; } });
  }
  t('trees');
  let nP = 0, nW = 0, nFe = 0;
  for (const { p: run } of GEO.poles) for (const [x, z] of run) {
    if (holeFlag(x, z, 'noFences')) continue;
    const a = objAt(x, z, 0.15); if (a >= 0 && out[a]) { out[a].objects.poles++; out[a].objects.poleAt ??= [+x.toFixed(1), +z.toFixed(1)]; nP++; }
  }
  for (const ln of GEO.power) for (const p of ln.p) { const a = objAt(p[0], p[1], 0.3); if (a >= 0 && out[a]) { out[a].objects.power++; out[a].objects.powerAt ??= [+p[0].toFixed(1), +p[1].toFixed(1)]; nW++; } }
  for (const f of GEO.fences) {
    if (holeFlag(f[1], f[2], 'noFences')) continue;
    const hit = new Map();
    for (let i = 1; i + 3 < f.length; i += 2) {
      const ax = f[i], az = f[i + 1], bx = f[i + 2], bz = f[i + 3], L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 0.5));
      for (let s = 0; s <= m; s++) {
        const x = ax + (bx - ax) * s / m, z = az + (bz - az) * s / m, a = objAt(x, z, 0.4);
        if (a < 0 || onPlan(x, z, -0.6)) continue;                // (geo/props.js leaves those pieces out)
        if (!hit.has(a)) hit.set(a, [0, x, z]);
        hit.get(a)[0] += L / m;
      }
    }
    for (const [a, h] of hit) if (h[0] > 0.6 && out[a]) { out[a].objects.fences.push({ len: +h[0].toFixed(1), at: [+h[1].toFixed(1), +h[2].toFixed(1)] }); nFe++; }
  }
  t('poles, fences');
  return {
    log, roads: orig.length, tris: n, roadbed: GEO.roadbedLog,
    totals: { ...Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, +v.toFixed(1)])), buildings: nB, trees: nT, forest: nF, shrubs: nS, poles: nP, power: nW, fences: nFe },
    per: out.filter(Boolean),
  };
}
