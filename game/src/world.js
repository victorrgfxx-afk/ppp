/**
 * HARTA - Strada Garii (nr. 103-128), Campina, cu capatul ei la Prahova.
 *
 * Geometria vine din date reale (src/zona.js): amprentele celor ~170 de
 * cladiri, traseele strazilor, albia si firul Prahovei, calea ferata a garii
 * Campina si relieful Copernicus. Deasupra lor, detaliile din fotografii:
 * stalpii cu lampi cobra-head pe stanga, cablurile, gardurile, masinile
 * parcate, marcajul lateral discontinuu.
 */
import * as THREE from '../vendor/three.module.min.js';
import { ZONA } from './zona.js';
import { ColliderSet, closestOnCollider, mergeGeos, wire } from './geo.js';
import {
  HERO, ROAD_HW, ROADS, JUNCTIONS, BOUNDS, surfaceY, landY, polyRibbon, polyDist,
  heroAsphalt, heroKerbs, heroWalk, heroMarkings, heroTireTracks, kerbSpans, inJunction,
  terrainGeos, backdropGeo, inRiverBed, distToPrahova,
} from './terrain.js';
import {
  GeoBag, utilityPole, powerLines, tree, manhole, drainGrate, meterBox, trashBin, mailbox,
  grassTufts, wallBox, concreteBlock, fencePanel, gatePanel, osmBuilding, offsetLine, catenaryMast,
} from './props.js';
import { StreetLights, nightAmbience } from './lighting.js';
import { SkyDome } from './sky.js';
import { River } from './water.js';
import { buildCar, placeOnGround, CAR_COLORS, preparePlates, bakeCars } from './carmodel.js';
import { housePlates } from './textures.js';
import { makeRng, clamp, lerp } from './noise.js';

const PLATES = ['PH 42 CLD', 'PH 07 ASD', 'PH 18 POV', 'B 222 VXR', 'PH 91 TRK', 'PH 55 MND',
  'PH 13 OCT', 'B 404 NVM', 'PH 66 ZLT', 'PH 77 CMP', 'PH 30 BRK', 'PH 09 SCR', 'PH 21 GAR',
  'PH 88 PRA', 'B 150 KLM', 'PH 03 VIC', 'PH 44 BLD', 'PH 12 RDR', 'PH 70 MOB', 'PH 29 CRS', 'PH 61 ZRZ'];

function mat(t, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({
    map: t.map || null, normalMap: t.normalMap || null, roughnessMap: t.roughnessMap || null,
    roughness: t.roughness != null ? t.roughness : 0.9, metalness: 0.0,
  }, extra));
}

function pip(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class World {
  constructor(scene, textures, renderer, opts = {}) {
    this.scene = scene;
    this.T = textures;
    this.renderer = renderer;
    this.opts = Object.assign({ quality: 'high', haze: true, lampPool: 6 }, opts);
    this.colliders = new ColliderSet(9);
    this.cars = [];
    this.lamps = null;
    this.spawn = { x: 1.6, z: HERO.z0 - 14, yaw: 0 };
    this.bounds = BOUNDS;
    this._q = [];
    this._hit = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0 };
    // cutii de incadrare ale cladirilor, pentru teste rapide de "spatiu liber"
    this.bld = ZONA.buildings.map((b) => {
      const xs = b.pts.map((p) => p[0]), zs = b.pts.map((p) => p[1]);
      return { b, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    });
  }

  inBuilding(x, z, m = 0) {
    for (const q of this.bld) {
      if (x < q.x0 - m || x > q.x1 + m || z < q.z0 - m || z > q.z1 + m) continue;
      if (pip(x, z, q.b.pts)) return true;
      if (m > 0 && polyDist(x, z, [...q.b.pts, q.b.pts[0]]) < m) return true;
    }
    return false;
  }

  nearRoad(x, z, m = 0) {
    if (Math.abs(x) < ROAD_HW + m && z < HERO.z0 + 7 && z > HERO.z1 - 2) return true;
    for (const r of ROADS) {
      if (r.kind === 'path' || r.kind === 'footway') continue;
      if (polyDist(x, z, r.pts) < r.hw + m) return true;
    }
    return false;
  }

  build() {
    const T = this.T, scene = this.scene;
    const q = this.opts.quality;
    const hi = q !== 'low' && q !== 'mobil';
    const rnd = makeRng(20260923);

    /* ------------------------- mediu si ceata -------------------------- */
    this.sky = new SkyDome(scene);
    this.sky.setDay(0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.envRT = pmrem.fromEquirectangular(T.sky);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.62;
    pmrem.dispose();
    scene.fog = new THREE.FogExp2(0x05060b, 0.0135);
    this.ambience = nightAmbience(scene);

    /* ---------------------------- materiale ---------------------------- */
    const plates = housePlates(ZONA.buildings.map((b) => b.nr));
    const M = this.materials = {
      asphalt: mat(T.asphalt, { roughness: 1.0, envMapIntensity: 0.30 }),
      paint: new THREE.MeshStandardMaterial({ map: T.paint, roughness: 0.62, envMapIntensity: 0.4 }),
      kerb: mat(T.kerb, { envMapIntensity: 0.22, color: 0x7d7a73 }),
      walk: mat(T.pavers, { envMapIntensity: 0.22, color: 0x4d4b46 }),
      grass: mat(T.grass, { envMapIntensity: 0.18, color: 0xa4ae9a }),
      grassFar: mat(T.grass, { envMapIntensity: 0.12, color: 0x7c8a78 }),
      riverbed: mat(T.gravel, { envMapIntensity: 0.3, color: 0xd6d4d0 }),
      gravelRoad: mat(T.gravel, { envMapIntensity: 0.22, color: 0xc8c0b2 }),
      ballast: mat(T.ballast, { envMapIntensity: 0.2, color: 0x77746f }),
      rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.92, roughness: 0.26, envMapIntensity: 1.2 }),
      metalGalv: new THREE.MeshStandardMaterial({ color: 0x8d9297, metalness: 0.75, roughness: 0.45, envMapIntensity: 0.8 }),
      concrete: mat(T.concrete, { envMapIntensity: 0.22, color: 0x74716b }),
      stone: mat(T.stone, { envMapIntensity: 0.18, color: 0x8b8880 }),
      brick: mat(T.brick, { envMapIntensity: 0.18, color: 0xa09088 }),
      brickPillar: mat(T.brickPillar, { envMapIntensity: 0.18, color: 0x7e7068 }),
      wood: mat(T.wood, { envMapIntensity: 0.16, color: 0x8a7a6c }),
      woodDark: mat(T.woodDark, { roughness: 0.96, envMapIntensity: 0.14, color: 0x6e6157 }),
      woodClad: mat(T.wood, { envMapIntensity: 0.16, color: 0x7d6a58 }),
      stucco: mat(T.stucco, { envMapIntensity: 0.18, color: 0x8b8880 }),
      stuccoWarm: mat(T.stuccoWarm, { envMapIntensity: 0.18, color: 0x877f73 }),
      stuccoWhite: mat(T.stuccoWhite, { envMapIntensity: 0.18, color: 0x908e88 }),
      roof: mat(T.roof, { envMapIntensity: 0.22, color: 0xa39c98, side: THREE.DoubleSide }),
      roofDark: mat(T.roofDark, { envMapIntensity: 0.28, color: 0xa8a6a4, side: THREE.DoubleSide }),
      bark: mat(T.woodDark, { roughness: 0.99, envMapIntensity: 0.1, color: 0x4a443e }),
      poleConcrete: mat(T.concrete, { roughness: 0.95, envMapIntensity: 0.16, color: 0x7d7a73 }),
      metalDark: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.8 }),
      metalPaint: new THREE.MeshStandardMaterial({ color: 0x2c3a32, roughness: 0.52, metalness: 0.55, envMapIntensity: 0.7 }),
      pickets: new THREE.MeshStandardMaterial({ map: T.pickets, color: 0x3a4a40, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.7 }),
      metalTeal: new THREE.MeshStandardMaterial({ color: 0x1d5e5a, roughness: 0.48, metalness: 0.5, envMapIntensity: 0.8 }),
      metalBox: new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.6, metalness: 0.6, envMapIntensity: 0.7 }),
      meterCabinet: new THREE.MeshStandardMaterial({ color: 0x9b9990, roughness: 0.6, metalness: 0.2, envMapIntensity: 0.5 }),
      insulator: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.9 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.75, metalness: 0.25, envMapIntensity: 0.5 }),
      lampBody: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.9 }),
      lampLens: new THREE.MeshStandardMaterial({ color: 0xfff8ec, emissive: 0xfff1d6, emissiveIntensity: 16, roughness: 0.2, side: THREE.DoubleSide }),
      windowOff: new THREE.MeshStandardMaterial({ map: T.windowOff, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.6 }),
      windowOn: new THREE.MeshStandardMaterial({ map: T.windowOn, emissiveMap: T.windowOn, emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.3 }),
      windowFrame: new THREE.MeshStandardMaterial({ color: 0xcdc9c1, roughness: 0.75 }),
      plates: new THREE.MeshStandardMaterial({ map: plates.tex, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.9 }),
      binBody: new THREE.MeshStandardMaterial({ color: 0x1f3b22, roughness: 0.78 }),
      binLid: new THREE.MeshStandardMaterial({ color: 0x16291a, roughness: 0.78 }),
      leaf: new THREE.MeshStandardMaterial({ map: T.leaf, color: 0x424a3d, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.12 }),
      leafDark: new THREE.MeshStandardMaterial({ map: T.leafDark, color: 0x3a4035, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.96, envMapIntensity: 0.1 }),
      leafLight: new THREE.MeshStandardMaterial({ map: T.leafLight, color: 0x4e5445, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.93, envMapIntensity: 0.14 }),
      blades: new THREE.MeshStandardMaterial({ map: T.blades, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
    };
    // materiale de baza nuantate pe varf (mult mai putine draw-call-uri)
    const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
    const base = (key, color) => { M[key].vertexColors = true; M[key].color.set(0xffffff); M[key].needsUpdate = true; return hex(color); };
    const tStucco = { stucco: base('stucco', 0x8b8880), stuccoWarm: hex(0x877f73), stuccoWhite: hex(0x908e88) };
    const tWood = { wood: base('wood', 0x8a7a6c), woodDark: hex(0x6e6157), woodClad: hex(0x7d6a58), bark: hex(0x4a443e) };
    const tMetal = {
      metalDark: base('metalDark', 0x1b1d21), metalPaint: hex(0x2c3a32), metalTeal: hex(0x1d5e5a), metalBox: hex(0x51565c),
      metalGalv: hex(0x8d9297), lampBody: hex(0x3a3d42), binBody: hex(0x1f3b22), binLid: hex(0x16291a),
    };
    const tLeaf = { leaf: base('leaf', 0x5a6454), leafDark: hex(0x434d3d), leafLight: hex(0x6f7a60) };
    const tConc = { concrete: base('concrete', 0x74716b), poleConcrete: hex(0x7d7a73) };
    const tLight = { windowFrame: base('windowFrame', 0xcdc9c1), insulator: hex(0x9aa0a4), meterCabinet: hex(0x9b9990) };
    this.aliases = {};
    for (const [b, tab] of [['stucco', tStucco], ['wood', tWood], ['metalDark', tMetal], ['leaf', tLeaf], ['concrete', tConc], ['windowFrame', tLight]]) {
      for (const [k, tint] of Object.entries(tab)) this.aliases[k] = { base: b, tint };
    }
    M.metalDark.roughness = 0.52; M.metalDark.metalness = 0.62;
    this.noShadow = ['windowOn', 'windowOff', 'windowFrame', 'plates', 'lampLens', 'paint'];

    for (const k of ['riverbed', 'gravelRoad']) {
      M[k].map = M[k].map.clone(); M[k].normalMap = M[k].normalMap.clone(); M[k].roughnessMap = M[k].roughnessMap.clone();
      for (const t of [M[k].map, M[k].normalMap, M[k].roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
    }

    /* ------------------------------ teren ------------------------------ */
    const tg = terrainGeos(hi ? 1 : 2);
    const grassMesh = new THREE.Mesh(tg.grass, M.grass);
    const bedMesh = new THREE.Mesh(tg.bed, M.riverbed);
    for (const m of [grassMesh, bedMesh]) { m.receiveShadow = true; scene.add(m); }
    const back = new THREE.Mesh(backdropGeo(), M.grassFar);
    back.receiveShadow = false;
    scene.add(back);

    /* ------------------------------ strazi ----------------------------- */
    const roadBag = new GeoBag();
    roadBag.add('asphalt', heroAsphalt());
    roadBag.add('kerb', heroKerbs());
    roadBag.add('walk', heroWalk(-1));
    // dale de beton pe dreapta doar pe primii metri (ca in prima poza)
    roadBag.add('walk', heroWalk(1, 1.15, [[HERO.z0 - 7, HERO.z0 - 38]]));
    roadBag.add('paint', heroMarkings());
    for (const r of ROADS) {
      if (r.bridge) continue;
      const path = r.kind === 'path' || r.kind === 'footway';
      const key = r.surface === 'asphalt' && !path ? 'asphalt' : 'gravelRoad';
      const lift = key === 'asphalt' ? 0.012 : 0.02;
      roadBag.add(key, polyRibbon(r.pts, path ? 0.7 : r.hw, lift, { step: 2.5, uScale: 1 / 2.6, vScale: 1 / 2.6 }));
    }
    const roadMeshes = roadBag.build(scene, M, { castShadow: false, receiveShadow: true });
    for (const m of roadMeshes) if (m.name === 'bag_paint') m.renderOrder = 1;
    const tracks = new THREE.Mesh(mergeGeos(heroTireTracks()), new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.07, depthWrite: false, fog: true }));
    tracks.renderOrder = 2;
    scene.add(tracks);

    /* ----------------------------- lampile ----------------------------- */
    const lowQ = !hi;
    this.lamps = new StreetLights(scene, T, {
      poolSize: this.opts.lampPool || (lowQ ? 4 : 6),
      shadowCount: lowQ ? 0 : 2,
      haze: this.opts.haze && !lowQ,
      shadowMapSize: q === 'ultra' ? 2048 : 1024,
    });

    const bag = new GeoBag();

    /* ---------------- stalpii strazii-erou, pe stanga ------------------ */
    const poles = [];
    for (let z = HERO.z0 - 8; z > HERO.z1 + 8; z -= 28) {
      let zz = z;
      for (const dz of [0, 2.5, -2.5, 5, -5, 7.5]) {
        if (!this.inBuilding(-3.95, z + dz, 0.5) && !inJunction(-1, z + dz)) { zz = z + dz; break; }
      }
      const p = utilityPole(bag, this.colliders, -3.95, zz, { withLamp: true, dir: [1, 0] });
      poles.push(p);
      this.lamps.addLamp(p.lampPos, [1, 0]);
    }
    // bransamente: de la fiecare stalp la cele mai apropiate case, pe ambele laturi
    const drops = [];
    poles.forEach((p, i) => {
      for (const side of [-1, 1]) {
        const cand = this.bld
          .map((q) => ({ q, cx: (q.x0 + q.x1) / 2, cz: (q.z0 + q.z1) / 2 }))
          .filter((o) => Math.sign(o.cx) === side && Math.abs(o.cz - p.pos.z) < 16 && Math.abs(o.cx) < 26)
          .sort((a, b) => Math.abs(a.cz - p.pos.z) - Math.abs(b.cz - p.pos.z)).slice(0, side < 0 ? 1 : 2);
        for (const o of cand) {
          const ex = side < 0 ? o.q.x1 : o.q.x0;
          const y = surfaceY(ex, o.cz) + 3.6 + rnd() * 0.6;
          drops.push({ pole: i, x: ex, y, z: o.cz, sag: 0.6 + rnd() * 0.4, dy: 1.2 + rnd() * 1.5 });
        }
      }
    });
    powerLines(bag, poles, { drops });

    /* -------------------- garduri pe fronturile libere ----------------- */
    const styles = ['wood', 'stone', 'metal', 'wood', 'metal'];
    const frontage = (line, side, offset, isHero) => {
      const res = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.4));
        for (let k = 0; k < n; k++) res.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
      }
      res.push(line[line.length - 1]);
      const off = offsetLine(res, side * offset);
      let run = [];
      const flush = () => {
        if (run.length < 2) { run = []; return; }
        const style = styles[Math.floor(rnd() * styles.length)];
        const gateAt = run.length >= 5 ? Math.floor(run.length / 2) : -1;
        const hue = rnd() < 0.5 ? 'teal' : 'green';
        for (let k = 0; k < run.length - 1; k++) {
          const [p0, p1] = [run[k], run[k + 1]];
          if (k === gateAt) gatePanel(bag, this.colliders, p0[0], p0[1], p1[0], p1[1], rnd() < 0.3 ? 'wood' : 'metal', hue, style === 'stone' ? 'stone' : 'concrete');
          else fencePanel(bag, this.colliders, p0[0], p0[1], p1[0], p1[1], style, rnd);
        }
        run = [];
      };
      for (let k = 0; k < off.length; k++) {
        const [x, z] = off[k];
        let ok = !this.inBuilding(x, z, 1.1) && x > BOUNDS[0] - 12 && x < BOUNDS[1] + 12 && z > BOUNDS[2] && z < BOUNDS[3];
        if (ok && isHero) ok = !inJunction(side, z) && z < HERO.z0 - 7 && z > HERO.z1 + 1.5;
        if (ok) {
          for (const r of ROADS) {
            if (r.kind === 'path' || r.kind === 'footway' || r.kind === 'track') continue;
            if (polyDist(x, z, r.pts) < r.hw + 0.9) { ok = false; break; }
          }
          if (ok && !isHero && Math.abs(x) < ROAD_HW + 1.5 && z < HERO.z0 + 6 && z > HERO.z1) ok = false;
        }
        if (ok) run.push([x, z]); else flush();
      }
      flush();
    };
    const heroLine = [[0, HERO.z0 - 6], [0, HERO.z1 + 1]];
    frontage(heroLine, -1, 4.6, true);
    frontage(heroLine, 1, 4.6, true);
    for (const r of ROADS) {
      if (r.kind !== 'residential' && r.kind !== 'living_street') continue;
      for (const side of [-1, 1]) frontage(r.pts, side, r.hw + 1.6, false);
    }

    /* ------------------- stalpi si lampi pe strazile vecine ------------ */
    for (const r of ROADS) {
      if (r.kind !== 'residential' || r.surface !== 'asphalt') continue;
      const res = [];
      let acc = 16;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        for (let s = 0; s < L; s += 1) {
          acc += 1;
          if (acc < 36) continue;
          const px = ax + tx * s + tz * (r.hw + 0.9), pz = az + tz * s - tx * (r.hw + 0.9);
          if (px < BOUNDS[0] - 10 || px > BOUNDS[1] + 10 || pz < BOUNDS[2] || pz > BOUNDS[3] - 12) continue;
          if (this.inBuilding(px, pz, 0.6) || this.nearRoad(px, pz, 0.4)) continue;
          if (Math.abs(px) < 8 && pz < HERO.z0 + 10 && pz > HERO.z1 - 6) continue;
          acc = 0;
          res.push({ x: px, z: pz, dir: [-tz, tx] });
        }
      }
      const rp = res.map((o) => {
        const p = utilityPole(bag, this.colliders, o.x, o.z, { withLamp: true, dir: o.dir });
        this.lamps.addLamp(p.lampPos, o.dir);
        return p;
      });
      if (rp.length > 1) powerLines(bag, rp, {});
    }

    /* ------------------------------- cladiri --------------------------- */
    const wallSet = ['stucco', 'stuccoWarm', 'stuccoWhite', 'stucco', 'stuccoWarm'];
    const roofSet = ['roof', 'roof', 'roofDark', 'roof'];
    for (const b of ZONA.buildings) {
      const cx = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length;
      const cz = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length;
      let toward;
      if (Math.abs(cx) < 30 && cz < HERO.z0 + 4 && cz > HERO.z1 - 4) toward = [-Math.sign(cx) || 1, 0];
      else {
        let best = Infinity, tp = [cx, cz + 1];
        for (const r of ROADS) {
          for (let i = 0; i < r.pts.length - 1; i++) {
            const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
            const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
            const t = L2 ? clamp(((cx - ax) * dx + (cz - az) * dz) / L2, 0, 1) : 0;
            const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(cx - px, cz - pz);
            if (d < best) { best = d; tp = [px, pz]; }
          }
        }
        const L = Math.hypot(tp[0] - cx, tp[1] - cz) || 1;
        toward = [(tp[0] - cx) / L, (tp[1] - cz) / L];
      }
      const h = (b.nr ? parseInt(b.nr, 10) : Math.round(cx * 7 + cz * 13)) || 0;
      osmBuilding(bag, this.colliders, b, {
        toward, rnd, plates, nearStreet: Math.abs(cx) < 30 && cz < HERO.z0 + 4 && cz > HERO.z1 - 4,
        wall: b.nr === '124' || b.nr === '110' ? 'stuccoWhite' : wallSet[Math.abs(h) % wallSet.length],
        roof: roofSet[Math.abs(h * 7) % roofSet.length],
        litChance: Math.abs(cx) < 30 ? 0.3 : 0.18,
      });
    }

    /* ------------------------- detalii de strada ----------------------- */
    manhole(bag, -0.9, 38); manhole(bag, 0.7, -31); manhole(bag, -1.1, -118);
    drainGrate(bag, -2.65, 64); drainGrate(bag, -2.65, -12); drainGrate(bag, 2.7, -56); drainGrate(bag, -2.65, -140);
    const freeFront = (side, z) => !this.inBuilding(side * 4.6, z, 1.2) && !inJunction(side, z);
    for (const [z, side, k] of [[70, 1, 'wb'], [33, -1, 'wb'], [-20, 1, 'wb'], [-110, -1, 'wb'],
      [58, 1, 'cb'], [8, 1, 'cb'], [-66, 1, 'cb'], [48, 1, 'bin'], [-36, 1, 'bin'], [-124, -1, 'bin'],
      [80, 1, 'mb'], [-4, -1, 'mb'], [-96, 1, 'mb'], [20, 1, 'meter'], [-58, -1, 'meter']]) {
      if (!freeFront(side, z)) continue;
      if (k === 'wb') wallBox(bag, side * 4.45, z, 1.25, side > 0 ? 0 : Math.PI);
      else if (k === 'cb') concreteBlock(bag, this.colliders, side * 3.75, z, rnd() - 0.5);
      else if (k === 'bin') trashBin(bag, this.colliders, side * 4.1, z, rnd() * 0.3);
      else if (k === 'mb') mailbox(bag, side * 4.25, z, side > 0 ? 0 : Math.PI);
      else meterBox(bag, this.colliders, side * 4.1, z, 0);
    }

    /* ----------------------------- vegetatie --------------------------- */
    const free = (x, z, m) => !this.inBuilding(x, z, m) && !this.nearRoad(x, z, m + 0.5)
      && !inRiverBed(x, z) && Math.abs(x) < 328;
    const plant = (x, z, kind, scale, seed) => { tree(bag, this.colliders, x, z, kind, scale, seed); };
    // copacii reali din OSM
    ZONA.trees.forEach((p, i) => { if (free(p[0], p[1], 1)) plant(p[0], p[1], 'broadleaf', 1.1, 9000 + i); });
    // malurile Prahovei: salcii si plopi, dens
    const bank = ZONA.water[0];
    let bi = 0;
    for (let i = 0; i < bank.length; i++) {
      const a = bank[i], c = bank[(i + 1) % bank.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (let s = 0; s < L; s += hi ? 9 : 14) {
        const t = s / L;
        const bx = lerp(a[0], c[0], t), bz = lerp(a[1], c[1], t);
        for (const out of [3.5 + rnd() * 5, 10 + rnd() * 10]) {
          // pe normala, spre exterior
          let nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L;
          if (inRiverBed(bx + nx * 2, bz + nz * 2)) { nx = -nx; nz = -nz; }
          const x = bx + nx * out + (rnd() - 0.5) * 3, z = bz + nz * out + (rnd() - 0.5) * 3;
          if (!free(x, z, 1.5)) continue;
          const r = rnd();
          plant(x, z, r < 0.45 ? 'broadleaf' : r < 0.7 ? 'conifer' : 'bush', 0.8 + rnd() * 0.6, 12000 + bi++);
        }
      }
    }
    // tufe de salcie pe prundis, departe de fir
    for (let i = 0; i < (hi ? 90 : 40); i++) {
      const x = -300 + rnd() * 600, z = -320 + rnd() * 140;
      if (!inRiverBed(x, z) || distToPrahova(x, z) < ZONA.channelHW + 4) continue;
      tree(bag, this.colliders, x, z, 'bush', 0.6 + rnd() * 0.6, 15000 + i);
    }
    // malul celalalt: lizierea padurii
    for (let i = 0; i < (hi ? 130 : 60); i++) {
      const x = -300 + rnd() * 600, z = -338 + rnd() * 50;
      if (inRiverBed(x, z) || !free(x, z, 1.5)) continue;
      const r = rnd();
      plant(x, z, r < 0.55 ? 'broadleaf' : 'conifer', 0.9 + rnd() * 0.7, 17000 + i);
    }
    // curtile: pomi in spatele caselor, tufe langa garduri
    let yi = 0;
    for (const qb of this.bld) {
      const cx = (qb.x0 + qb.x1) / 2, cz = (qb.z0 + qb.z1) / 2;
      if (cx < BOUNDS[0] - 40 || cx > BOUNDS[1] + 40 || cz < -300) continue;
      const away = Math.abs(cx) < 30 && cz < HERO.z0 && cz > HERO.z1 ? [Math.sign(cx) || 1, 0] : [rnd() - 0.5, rnd() - 0.5];
      for (let k = 0; k < (hi ? 2 : 1); k++) {
        const d = 8 + rnd() * 10;
        const x = cx + away[0] * d + (rnd() - 0.5) * 6, z = cz + away[1] * d + (rnd() - 0.5) * 8;
        if (!free(x, z, 2)) continue;
        const r = rnd();
        plant(x, z, r < 0.5 ? 'broadleaf' : r < 0.8 ? 'conifer' : 'bush', 0.7 + rnd() * 0.5, 20000 + yi++);
      }
    }
    // tufe si thuja chiar dupa gardurile strazii-erou
    for (let z = HERO.z0 - 10; z > HERO.z1 + 4; z -= hi ? 5.5 : 9) {
      for (const side of [-1, 1]) {
        const x = side * (5.4 + rnd() * 1.2), zz = z + (rnd() - 0.5) * 3;
        if (rnd() < 0.55 && free(x, zz, 0.6)) plant(x, zz, rnd() < 0.7 ? 'bush' : 'conifer', 0.55 + rnd() * 0.5, 30000 + Math.round(z * 10) + side);
      }
    }

    /* ---------------------------- calea ferata ------------------------- */
    const railBag = new GeoBag();
    const rails = ZONA.rail;
    for (const r of rails) {
      if (r.kind === 'platform') continue;
      railBag.add('ballast', polyRibbon(r.pts, 1.65, 0.22, { step: 3, uScale: 1 / 3.2, vScale: 1 / 3.0 }));
      for (const d of [-0.7175, 0.7175]) {
        railBag.add('rail', polyRibbon(offsetLine(r.pts, d), 0.036, 0.42, { step: 3, uScale: 1, vScale: 1 }));
      }
    }
    for (const r of rails) {
      if (r.kind !== 'platform') continue;
      const closed = r.pts.length > 3 && Math.hypot(r.pts[0][0] - r.pts[r.pts.length - 1][0], r.pts[0][1] - r.pts[r.pts.length - 1][1]) < 0.5;
      if (closed) {
        const shape = new THREE.Shape(r.pts.map((p) => new THREE.Vector2(p[0], -p[1])));
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        const cx = r.pts.reduce((s, p) => s + p[0], 0) / r.pts.length, cz = r.pts.reduce((s, p) => s + p[1], 0) / r.pts.length;
        g.translate(0, landY(cx, cz) + 0.2, 0);
        railBag.add('concrete', g);
      } else {
        railBag.add('concrete', polyRibbon(r.pts, 1.9, 0.75, { step: 3, uScale: 1 / 2, vScale: 1 / 2 }));
      }
      // lampi de peron
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 6; s < L; s += 26) {
          const tx = (bx - ax) / L, tz = (bz - az) / L;
          if (Math.abs(ax + tx * s) > 130) continue;
          const p = utilityPole(railBag, this.colliders, ax + tx * s, az + tz * s, { height: 6.8, withLamp: true, crossArm: false, dir: [-tz, tx] });
          this.lamps.addLamp(p.lampPos, [-tz, tx], { poolLen: 9, poolWid: 5 });
        }
      }
    }
    // catenara pe liniile magistrale
    for (const r of rails) {
      if (!r.main) continue;
      const tips = [];
      let acc = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
        for (let s = 0; s < L; s += 5) {
          acc += 5;
          if (acc < 55) continue;
          const mx = ax + tx * s - tz * 3.3, mz = az + tz * s + tx * 3.3;
          let clash = false;
          for (const o of rails) if (o !== r && o.kind !== 'platform' && polyDist(mx, mz, o.pts) < 2.3) { clash = true; break; }
          if (clash || this.inBuilding(mx, mz, 0.5)) continue;
          acc = 0;
          tips.push(catenaryMast(railBag, this.colliders, mx, mz, tz, -tx));
        }
      }
      for (let i = 0; i < tips.length - 1; i++) railBag.add('cable', wire(tips[i], tips[i + 1], 0.35, 0.014, 10));
    }
    railBag.build(scene, M, { castShadow: true, receiveShadow: true, tile: 200, aliases: this.aliases, noShadow: this.noShadow });

    // dale mici doar cand exista umbre (conurile de umbra ating atunci putine dale);
    // fara umbre, dalele mari inseamna mai putine draw-call-uri
    this.staticMeshes = bag.build(scene, M, { castShadow: true, receiveShadow: true, tile: hi ? 70 : 170, aliases: this.aliases, noShadow: this.noShadow });

    /* ------------------------ smocuri de iarba ------------------------- */
    {
      const spots = [];
      const gr = makeRng(77);
      const N = hi ? 2600 : 900;
      for (let i = 0; i < N; i++) {
        const z = HERO.z0 - 6 - gr() * (HERO.z0 - HERO.z1 - 8);
        const x = ROAD_HW + 0.45 + gr() * 1.35;
        if (inJunction(1, z) || this.inBuilding(x, z, 0.2)) continue;
        spots.push({ x, z, r: gr() * Math.PI, s: 0.45 + gr() * 0.5, v: gr() });
      }
      for (let i = 0; i < N; i++) {
        const x = -150 + gr() * 300, z = HERO.z1 - 6 - gr() * 50;       // malul dinspre strada
        if (!free(x, z, 0.3)) continue;
        spots.push({ x, z, r: gr() * Math.PI, s: 0.5 + gr() * 0.6, v: gr() });
      }
      grassTufts(scene, M.blades, spots);
    }

    /* ------------------------------- raul ------------------------------ */
    this.river = new River(scene, T);

    /* --------------------------- masini parcate ------------------------ */
    this.buildCars(rnd);

    this.lamps.finalize();
    this.colliders.build();
    return this;
  }

  buildCars(rnd) {
    // sirul din fotografii, pe stanga: berlina de langa aparat cu botul spre noi,
    // apoi spatele hatchback-ului argintiu si al SUV-ului albastru
    const P = Math.PI, z0 = HERO.z0 - 14;
    const layout = [
      [-2.03, z0 - 4, 'hatch', 0, 0], [-2.00, z0 - 11, 'wagon', 2, P], [-2.00, z0 - 16.5, 'sedan', 1, P],
      [-2.00, z0 - 33, 'sedan', 0, P], [-2.02, z0 - 40.6, 'wagon', 1, 0], [-1.98, z0 - 47.4, 'hatch', 2, 0],
      [-2.04, z0 - 54.2, 'wagon', 0, 0], [-1.98, z0 - 62.5, 'suv', 4, 0], [-1.97, z0 - 69.6, 'hatch', 3, P],
      [-2.02, z0 - 78, 'wagon', 6, 0], [-2.00, z0 - 92, 'sedan', 1, P], [-2.00, z0 - 105, 'hatch', 2, 0],
      [-2.00, z0 - 121, 'wagon', 0, 0], [-2.02, z0 - 150, 'sedan', 7, P], [-2.00, z0 - 172, 'wagon', 5, 0],
      [-2.00, z0 - 205, 'hatch', 3, 0], [1.75, z0 - 160, 'hatch', 3, P], [1.78, z0 - 195, 'sedan', 0, P],
    ];
    const ok = layout.filter(([x, z]) => z < HERO.z0 - 8 && z > HERO.z1 + 5
      && !inJunction(Math.sign(x), z) && !inJunction(Math.sign(x), z - 2.3) && !inJunction(Math.sign(x), z + 2.3));
    preparePlates(PLATES.slice(0, ok.length));
    const groups = [];
    ok.forEach(([x, z, type, ci, yaw], i) => {
      const color = CAR_COLORS[ci % CAR_COLORS.length];
      const g = buildCar({ type, color, plate: PLATES[i], seed: 10 + i * 3, env: this.scene.environment });
      const jitter = (((i * 37) % 11) - 5) * 0.006;
      placeOnGround(g, surfaceY, x, z, yaw + jitter);
      groups.push(g);
      const spec = g.userData.spec;
      const col = this.colliders.add(x, z, spec.W / 2, spec.L / 2, g.position.y, g.position.y + 1.5, 0, 'car');
      this.cars.push({ mesh: g, collider: col, x, z, yaw, type, color, plate: PLATES[i] });
    });
    bakeCars(this.scene, groups, 110);
  }

  /** Cat de departe poate ajunge camera pe segmentul from->to (0..1). */
  rayClearance(from, to, radius = 0.3) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return 1;
    const steps = Math.max(3, Math.ceil(len / 0.35));
    const list = this.colliders.query((from.x + to.x) / 2, (from.z + to.z) / 2, len / 2 + 2, this._q);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = from.x + dx * t, py = from.y + dy * t, pz = from.z + dz * t;
      if (py < surfaceY(px, pz) + radius) return Math.max(0.12, (i - 1) / steps);
      for (const it of list) {
        if (it.disabled) continue;
        if (py < it.yBottom - radius || py > it.yTop + radius) continue;
        const h = closestOnCollider(it, px, pz, this._hit);
        const inside = Math.abs(h.lx) <= it.hx && Math.abs(h.lz) <= it.hz;
        if (inside || Math.hypot(px - h.wx, pz - h.wz) < radius) return Math.max(0.12, (i - 1) / steps);
      }
    }
    return 1;
  }

  setLampsOn(on) {
    this.materials.lampLens.emissiveIntensity = on ? 16 : 0.0;
  }

  setTimeOfDay(t) {
    const day = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const sky = new THREE.Color(0x05060b).lerp(new THREE.Color(0x8fb2dd), day);
    this.scene.fog.color.copy(sky);
    this.sky.setDay(day);
    this.scene.environmentIntensity = 0.62 + day * 1.7;
    this.ambience.hemi.intensity = 0.26 + day * 1.5;
    // ziua, cerul lumineaza alb-albastrui, nu albastrul inchis al noptii
    this.ambience.hemi.color.setHex(0x3a4458).lerp(new THREE.Color(0xc9dcf2), day);
    this.ambience.hemi.groundColor.setHex(0x0c0c0f).lerp(new THREE.Color(0x6b6558), day);
    // noaptea: luna slaba, rece, ca relieful malului sa aiba forma
    this.ambience.moon.intensity = 0.12 + day * 2.3;
    this.ambience.moon.color.setHex(day > 0.4 ? 0xfff3e0 : 0x9db4dd);
    this.scene.fog.density = 0.0135 - day * 0.0075;
    return day;
  }

  update(dt) {
    if (this.river) this.river.update(dt);
  }
}
