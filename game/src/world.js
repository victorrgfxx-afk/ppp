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
  heroAsphalt, heroKerbs, heroWalk, heroVerge, heroYards, heroSeams, heroMarkings, heroTireTracks, kerbSpans, inJunction,
  FENCE_L, FENCE_R, WALK_R_SPANS,
  terrainGeos, backdropGeo, inRiverBed, distToPrahova,
} from './terrain.js';
import {
  GeoBag, utilityPole, powerLines, tree, manhole, drainGrate, meterBox, trashBin, mailbox,
  grassTufts, wallBox, concreteBlock, fencePanel, gatePanel, osmBuilding, offsetLine, catenaryMast,
  streetFence, streetGate, downpipe, bench,
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
    // locul din care e facuta poza 3, privind spre Prahova
    this.spawn = { x: 0.3, z: -18, yaw: 0 };
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
    scene.environmentIntensity = 0.45;
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
      walkR: mat(T.concrete, { envMapIntensity: 0.2, color: 0x8e8a82 }),
      // iarba acostamentului: pe poze e ~jumatate din luminozitatea asfaltului
      grassVerge: mat(T.grass, { envMapIntensity: 0.12, color: 0x6c775f }),
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
      cable: new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.2 }),
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
      blades: new THREE.MeshStandardMaterial({ map: T.blades, color: 0x8a9478, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
      // plasa sudata: transparenta mediata pe mipmap-uri (de departe devine perdea gri)
      meshPanel: new THREE.MeshStandardMaterial({ map: T.meshPanel, color: 0x9aa0a4, transparent: true, depthWrite: false,
        alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.55, envMapIntensity: 0.9 }),
      sheet: new THREE.MeshStandardMaterial({ map: T.corrugated.map, normalMap: T.corrugated.normalMap, color: 0x9a9ea2,
        roughness: 0.42, metalness: 0.55, envMapIntensity: 0.8 }),
    };
    // materiale de baza nuantate pe varf (mult mai putine draw-call-uri)
    const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
    const base = (key, color) => { M[key].vertexColors = true; M[key].color.set(0xffffff); M[key].needsUpdate = true; return hex(color); };
    const tStucco = { stucco: base('stucco', 0x8b8880), stuccoWarm: hex(0x877f73), stuccoWhite: hex(0x908e88) };
    const tWood = { wood: base('wood', 0x8a7a6c), woodDark: hex(0x6e6157), woodClad: hex(0x7d6a58), bark: hex(0x4a443e), woodFence: hex(0x5a4c44) };
    const tMetal = {
      metalDark: base('metalDark', 0x1b1d21), metalPaint: hex(0x2c3a32), metalTeal: hex(0x1d5e5a), metalBox: hex(0x51565c),
      metalGalv: hex(0x8d9297), lampBody: hex(0x3a3d42), binBody: hex(0x1f3b22), binLid: hex(0x16291a),
      metalAnthracite: hex(0x2f3336), metalBrown: hex(0x3b2a21),
    };
    const tLeaf = { leaf: base('leaf', 0xd2d8c6), leafDark: hex(0xaab4a2), leafLight: hex(0xdfe4cf) };
    const tConc = { concrete: base('concrete', 0x74716b), poleConcrete: hex(0x5d5b57) };
    const tLight = { windowFrame: base('windowFrame', 0xcdc9c1), insulator: hex(0x9aa0a4), meterCabinet: hex(0x9b9990) };
    this.aliases = {};
    for (const [b, tab] of [['stucco', tStucco], ['wood', tWood], ['metalDark', tMetal], ['leaf', tLeaf], ['concrete', tConc], ['windowFrame', tLight]]) {
      for (const [k, tint] of Object.entries(tab)) this.aliases[k] = { base: b, tint };
    }
    M.metalDark.roughness = 0.52; M.metalDark.metalness = 0.62;
    this.noShadow = ['windowOn', 'windowOff', 'windowFrame', 'plates', 'lampLens', 'paint', 'meshPanel', 'cable'];

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
    roadBag.add('walkR', heroWalk(1));             // dalele de langa garduri, pe dreapta
    roadBag.add('grassVerge', heroVerge());
    roadBag.add('grass', heroYards());
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
      color: 0x000000, transparent: true, opacity: 0.035, depthWrite: false, fog: true }));
    tracks.renderOrder = 2;
    scene.add(tracks);
    const seams = new THREE.Mesh(mergeGeos(heroSeams()), new THREE.MeshStandardMaterial({
      color: 0x0b0b0c, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.2 }));
    seams.receiveShadow = true; seams.renderOrder = 1;
    scene.add(seams);

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
    // Pozitiile vin din poze: umbra fotografului pune lampa din spate la ~10 m
    // (poza 3) si ~15 m (poza 2), lampa din fata la ~24 m, respectiv ~19 m ->
    // pas de ~34 m; in poza 1 lampa din fata e la ~11 m, urmatoarea la ~46 m.
    const POLES_Z = [94, 60, 26, -8, -42, -71, -106, -141];
    for (const z of POLES_Z) {
      let zz = z;
      for (const dz of [0, 2.5, -2.5, 5, -5, 7.5]) {
        if (!this.inBuilding(-3.45, z + dz, 0.5) && !inJunction(-1, z + dz)) { zz = z + dz; break; }
      }
      // stalp de beton de ~8 m, lampa LED la ~6,9 m, iesita ~1,3 m peste carosabil (masurat pe poze)
      const p = utilityPole(bag, this.colliders, -3.45, zz, { withLamp: true, dir: [1, 0], height: 8.0, reach: 1.3, lampDrop: 1.05, crossArm: false });
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
    powerLines(bag, poles, { drops, bundled: true });

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
          // fara garduri pe coborarea de la capatul strazii spre rau
          if (ok && Math.abs(x) < 5 && z < HERO.z1 + 2 && z > HERO.z1 - 75) ok = false;
        }
        if (ok) run.push([x, z]); else flush();
      }
      flush();
    };
    this.heroFrontage(bag, rnd);
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
        litChance: Math.abs(cx) < 30 ? 0.04 : 0.12,
      });
    }

    /* ------------------------- detalii de strada ----------------------- */
    manhole(bag, -0.3, 38); manhole(bag, 0.5, -38.5); manhole(bag, -0.6, -118);
    drainGrate(bag, -2.02, 64); drainGrate(bag, -2.02, -12); drainGrate(bag, -2.02, -57); drainGrate(bag, -2.02, -140);
    const freeFront = (side, z) => !this.inBuilding(side < 0 ? FENCE_L - 0.4 : FENCE_R + 0.4, z, 0.6) && !inJunction(side, z)
      && !this.gateAt(side, z);
    const fx = (side) => (side < 0 ? FENCE_L + 0.16 : FENCE_R - 0.16);
    for (const [z, side, k] of [[70, 1, 'wb'], [33, -1, 'wb'], [-8, 1, 'wb'], [-110, -1, 'wb'],
      [58, 1, 'cb'], [8, 1, 'cb'], [-104, 1, 'cb'], [48, 1, 'bin'], [-2, -1, 'bin'], [-124, -1, 'bin'],
      [80, 1, 'mb'], [-4, -1, 'mb'], [-120, 1, 'mb'], [20, 1, 'meter'], [-106, -1, 'meter']]) {
      if (!freeFront(side, z)) continue;
      if (k === 'wb') wallBox(bag, fx(side), z, 1.25, side > 0 ? 0 : Math.PI);
      else if (k === 'cb') { if (side > 0) concreteBlock(bag, this.colliders, 2.75, z, rnd() - 0.5); }
      else if (k === 'bin') trashBin(bag, this.colliders, side < 0 ? FENCE_L + 0.45 : FENCE_R - 0.45, z, rnd() * 0.3);
      else if (k === 'mb') mailbox(bag, fx(side), z, side > 0 ? 0 : Math.PI);
      else meterBox(bag, this.colliders, side < 0 ? FENCE_L + 0.35 : FENCE_R - 0.35, z, 0);
    }

    /* ----------------------------- vegetatie --------------------------- */
    // culoarul de la capatul strazii pana in albie ramane liber (drumul spre apa)
    const toRiver = (x, z) => Math.abs(x) < 5 && z < HERO.z1 + 2 && z > HERO.z1 - 75;
    const free = (x, z, m) => !this.inBuilding(x, z, m) && !this.nearRoad(x, z, m + 0.5)
      && !inRiverBed(x, z) && Math.abs(x) < 328 && !toRiver(x, z);
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
      if (!inRiverBed(x, z) || distToPrahova(x, z) < ZONA.channelHW + 4 || toRiver(x, z)) continue;
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
    // copacii din spatele gardurilor strazii-erou: pe dreapta o perdea continua de
    // pomi inalti (pozele 2-3), pe stanga pomi dupa gardurile vii (poza 1)
    for (let z = HERO.z0 - 9; z > HERO.z1 + 3; z -= hi ? 4.2 : 6.5) {
      for (const side of [-1, 1]) {
        const seg = this.frontAt(side, z);
        const dense = side > 0 || (seg && seg.style === 'hedge');
        if (!dense && rnd() < 0.55) continue;
        // in dreptul pozelor 2-3, pe dreapta: doua randuri de pomi inalti
        const rows = side > 0 && z < -8 && z > -72 ? 2 : 1;
        for (let rw = 0; rw < rows; rw++) {
          const x = side > 0 ? FENCE_R + 1.2 + rw * 3.2 + rnd() * 2.6 : FENCE_L - 1.2 - rnd() * 4.0;
          const zz = z + (rnd() - 0.5) * 2.4 + rw * 1.9;
          if (!free(x, zz, 1.2) || inJunction(side, zz)) continue;
          if (side < 0 && poles.some((p) => Math.abs(p.pos.z - zz) < 5.5)) continue;
          const r = rnd();
          plant(x, zz, r < 0.78 ? 'broadleaf' : 'conifer', side > 0 ? 1.1 + rnd() * 0.45 : 0.85 + rnd() * 0.45, 30000 + Math.round(z * 10) + side + rw * 7);
        }
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
      for (let i = 0; i < N * 0.45; i++) {
        const z = HERO.z0 - 6 - gr() * (HERO.z0 - HERO.z1 - 8);
        const x = ROAD_HW + 0.3 + gr() * (FENCE_R - ROAD_HW - 0.45);
        if (inJunction(1, z) || this.inBuilding(x, z, 0.2)) continue;
        if (x > 2.95 && WALK_R_SPANS.some(([a, b]) => z <= a && z >= b)) continue;
        spots.push({ x, z, r: gr() * Math.PI, s: 0.28 + gr() * 0.32, v: gr() });
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

  /**
   * Gardurile de pe strada-erou. Intre z = -18 si -100 (unde s-au facut pozele,
   * privind spre Prahova) fiecare segment e pus dupa fotografii; in rest,
   * aceleasi tipuri de garduri si porti, in proportiile din poze.
   */
  heroFrontage(bag, rnd) {
    const PH = {
      1: [                                   // dreapta (x = +4,3)
        ['planks', -18.0, -26.0],
        ['sheet', -26.0, -30.5],             // tabla gri + banca (poza 3)
        ['planks', -30.5, -34.3],
        ['door', -34.3, -35.4, { color: 'metalTeal' }],   // portita verde-albastruie (poza 2)
        ['planks', -35.4, -70.8],
        ['stucco', -70.8, -76.9],            // zidul bej cu burlan si contor (poza 1)
        ['drive', -77.1, -80.5, { color: 'metalBrown', canopy: true, posts: 'brick' }],
      ],
      [-1]: [                                // stanga (x = -3,8)
        ['mesh', -18.0, -31.0],              // panouri 3D pe soclu de piatra (poza 2)
        // golul de ~10 m dintre SUV si Corsa din poze: intrarea in curte
        ['drive', -31.0, -34.6, { color: 'metalAnthracite', posts: 'metal' }],
        ['mesh', -34.6, -58.5],
        ['door', -58.5, -59.6, { color: 'metalAnthracite', posts: 'metal' }],
        ['hedge', -59.6, -76.5],             // gard viu des (poza 1)
        ['drive', -76.5, -80.0, { color: 'metalPaint', posts: 'brick' }],
        ['hedge', -80.0, -100.0],
      ],
    };
    const photoEnd = { 1: -80.6, [-1]: -100.0 };
    const STY = {
      1: [['planks', 0.45], ['stucco', 0.2], ['mesh', 0.2], ['sheet', 0.15]],
      [-1]: [['mesh', 0.45], ['hedge', 0.3], ['stucco', 0.15], ['planks', 0.1]],
    };
    const COL = ['metalAnthracite', 'metalBrown', 'metalPaint', 'metalAnthracite', 'metalTeal'];
    const pick = (tab) => { let r = rnd(); for (const [k, w] of tab) { r -= w; if (r <= 0) return k; } return tab[0][0]; };
    this.front = { 1: [], [-1]: [] };
    const put = (side, kind, za, zb, o = {}) => {
      const x = side < 0 ? FENCE_L : FENCE_R;
      if (kind === 'drive' || kind === 'door') {
        streetGate(bag, this.colliders, x, za, zb, { kind, ...o });
        this.front[side].push({ style: kind, za, zb, gate: true });
      } else {
        streetFence(bag, this.colliders, kind, x, za, zb, { rnd, ...o });
        this.front[side].push({ style: kind, za, zb });
      }
    };
    for (const side of [1, -1]) {
      for (const [kind, za, zb, o] of PH[side]) put(side, kind, za, zb, o);
      // restul strazii: parcele de 13-22 m, fiecare cu gardul ei si o poarta
      const ranges = [[HERO.z0 - 7, -18.0], [photoEnd[side], HERO.z1 + 1.5]];
      for (const [ra, rb] of ranges) {
        for (const [a, b] of kerbSpans(side, ra, rb)) {
          let z = a;
          while (z - b > 2.0) {
            const end = Math.max(b, z - (13 + rnd() * 9));
            const style = pick(STY[side]);
            let cur = z;
            if (z - end > 7 && rnd() < 0.8) {
              const drive = rnd() < 0.7, w = drive ? 3.2 + rnd() * 0.6 : 1.05;
              const g0 = z - 0.6 - rnd() * 1.5;
              if (g0 < z - 0.3) put(side, style, z, g0);
              put(side, drive ? 'drive' : 'door', g0, g0 - w, { color: COL[Math.floor(rnd() * COL.length)], posts: rnd() < 0.3 ? 'brick' : rnd() < 0.5 ? 'metal' : 'concrete' });
              cur = g0 - w;
            }
            if (cur - end > 0.3) put(side, style, cur, end);
            z = end;
          }
        }
      }
    }
    // elementele punctuale din poze
    bench(bag, this.colliders, FENCE_R - 0.45, -28.2);                        // poza 3
    downpipe(bag, FENCE_R - 0.15, -74.0);                                      // poza 1
    meterBox(bag, this.colliders, FENCE_R - 0.3, -72.4, 0);                    // poza 1
    // stalpul de beton fara lampa de pe dreapta, in fata portitei (poza 3)
    const pr = utilityPole(bag, this.colliders, 3.3, -31.2, { withLamp: false, crossArm: false, height: 8.0, dir: [-1, 0] });
    this.rightPole = pr;
  }

  /** Segmentul de gard de pe o latura in dreptul lui z (sau null). */
  frontAt(side, z) {
    for (const f of this.front[side] || []) if (z <= Math.max(f.za, f.zb) && z >= Math.min(f.za, f.zb)) return f;
    return null;
  }

  gateAt(side, z, m = 0.6) {
    for (const f of this.front[side] || []) {
      if (f.gate && z <= Math.max(f.za, f.zb) + m && z >= Math.min(f.za, f.zb) - m) return true;
    }
    return false;
  }

  buildCars(rnd) {
    // Sirul din fotografii (privind spre Prahova, adica spre -z). yaw 0 = spatele
    // spre privitor, PI = botul spre privitor. Pozitiile vin din latimea masinilor
    // in poze (distanta pana la bara) si din lampile vazute in spatele lor.
    // Toate stau pe stanga cu rotile din stanga pe trotuar (x ~ -2,0; bordura la -2,2).
    const P = Math.PI;
    const photo = [
      // poza 3 (z = -18)
      [-2.02, -20.8, 'hatch', 2, 0],          // argintiu, chiar langa aparat
      [-1.92, -26.5, 'suv', 4, P],            // SUV-ul inchis cu bara de LED in fata
      [-2.08, -40.9, 'hatch', 2, 0],          // Opel Corsa C argintiu, spatele spre noi
      // poza 2 (z = -24)
      [-2.00, -46.6, 'sedan', 1, P],          // gri inchis, farul aprins de lampa
      [-2.04, -52.4, 'wagon', 0, 0],          // break negru
      // poza 1 (z = -60)
      [-2.04, -64.5, 'wagon', 2, 0],          // argintiu, marginea din stanga a pozei
      [-1.96, -73.1, 'sedan', 0, P],          // BMW Seria 3 E90 negru, botul spre noi
      [-2.02, -83.2, 'suv', 1, 0],            // Audi Q5 inchis, spatele spre noi
      [-2.05, -95.5, 'hatch', 6, 0],
      [2.55, -114.0, 'hatch', 4, P],          // singura masina parcata pe dreapta
      [-2.00, -129.0, 'sedan', 3, 0],
    ];
    // restul strazii (in spatele locului de start), in acelasi stil
    const rest = [
      [-2.02, 90.0, 'wagon', 1, 0], [-2.00, 83.0, 'hatch', 0, P], [-2.05, 62.5, 'suv', 3, 0],
      [-1.98, 55.4, 'sedan', 2, P], [-2.03, 41.0, 'hatch', 5, 0], [-2.00, 22.0, 'wagon', 0, 0],
      [-1.97, 8.0, 'sedan', 6, P], [-2.04, 1.0, 'hatch', 2, 0], [-2.00, -148.0, 'wagon', 7, P],
    ];
    const layout = [...photo, ...rest];
    const ok = layout.filter(([x, z]) => z < HERO.z0 - 8 && z > HERO.z1 + 5
      && !inJunction(Math.sign(x), z) && !inJunction(Math.sign(x), z - 2.3) && !inJunction(Math.sign(x), z + 2.3)
      && !this.gateAt(Math.sign(x), z, 1.6));
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
    this.scene.environmentIntensity = 0.45 + day * 1.85;
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
