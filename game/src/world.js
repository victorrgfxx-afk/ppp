/**
 * HARTA. Reconstituie strada din fotografii: carosabil ingust de cartier
 * cu marcaj lateral discontinuu, masini parcate pe stanga langa bordura,
 * stalpi de utilitati cu lampi cobra-head si zeci de cabluri suspendate,
 * garduri de lemn / piatra / metal pe dreapta, curti, thuja si case.
 * Pe langa strada-erou exista un cvartal intreg, ca sa ai unde circula.
 */
import * as THREE from '../vendor/three.module.min.js';
import { ColliderSet, closestOnCollider, mergeGeos, box, scaleUV } from './geo.js';
import {
  ROADS, surfaceY, landY, asphaltGeo, kerbGeo, walkGeo, markingGeos,
  terrainGeo, tireTrackGeos, ROAD_HW,
} from './terrain.js';
import {
  GeoBag, utilityPole, powerLines, fenceRun, gate, house, tree,
  manhole, drainGrate, culvertSlab, meterBox, trashBin, mailbox, grassTufts,
} from './props.js';
import { StreetLights, nightAmbience } from './lighting.js';
import { SkyDome } from './sky.js';
import { buildCar, placeOnGround, CAR_TYPES, CAR_COLORS } from './carmodel.js';
import { makeRng, clamp } from './noise.js';

const PLATES = ['B 42 CLD', 'IF 07 ASD', 'B 118 POV', 'AG 22 VXR', 'B 91 TRK',
  'IF 55 MND', 'DB 13 OCT', 'B 404 NVM', 'PH 66 ZLT', 'B 77 GTA', 'IF 30 BRK', 'B 09 SCR'];

function mat(t, extra = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: t.map || null,
    normalMap: t.normalMap || null,
    roughnessMap: t.roughnessMap || null,
    roughness: t.roughness != null ? t.roughness : 0.9,
    metalness: 0.0,
  }, extra));
  if (m.normalMap) m.normalScale = new THREE.Vector2(1, 1);
  return m;
}

export class World {
  constructor(scene, textures, renderer, opts = {}) {
    this.scene = scene;
    this.T = textures;
    this.renderer = renderer;
    this.opts = Object.assign({ quality: 'high', carCount: 16, haze: true }, opts);
    this.colliders = new ColliderSet(9);
    this.cars = [];
    this.lamps = null;
    this.spawn = { x: 1.6, z: 26, yaw: 0 };
    this._q = [];
    this._hit = { lx: 0, lz: 0, qx: 0, qz: 0, wx: 0, wz: 0 };
  }

  build() {
    const T = this.T, scene = this.scene;
    const hi = this.opts.quality !== 'low';

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
    const M = this.materials = {
      asphalt: mat(T.asphalt, { roughness: 1.0, envMapIntensity: 0.30 }),
      paint: new THREE.MeshStandardMaterial({ map: T.paint, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.4 }),
      kerb: mat(T.kerb, { envMapIntensity: 0.22, color: 0x7d7a73 }),
      walk: mat(T.pavers, { envMapIntensity: 0.22, color: 0x565550 }),
      grass: mat(T.grass, { envMapIntensity: 0.18, color: 0x6e7a66 }),
      concrete: mat(T.concrete, { envMapIntensity: 0.22, color: 0x74716b }),
      stone: mat(T.stone, { envMapIntensity: 0.18, color: 0x8b8880 }),
      brick: mat(T.brick, { envMapIntensity: 0.18, color: 0xa09088 }),
      brickPillar: mat(T.brickPillar, { envMapIntensity: 0.18, color: 0x7e7068 }),
      wood: mat(T.wood, { envMapIntensity: 0.16, color: 0x8a7a6c }),
      woodDark: mat(T.woodDark, { roughness: 0.96, envMapIntensity: 0.14, color: 0x6e6157 }),
      stucco: mat(T.stucco, { envMapIntensity: 0.18, color: 0x8b8880 }),
      stuccoWarm: mat(T.stuccoWarm, { envMapIntensity: 0.18, color: 0x877f73 }),
      stuccoWhite: mat(T.stuccoWhite, { envMapIntensity: 0.18, color: 0x908e88 }),
      roof: mat(T.roof, { envMapIntensity: 0.22, color: 0xa39c98 }),
      roofDark: mat(T.roofDark, { envMapIntensity: 0.28, color: 0xa8a6a4 }),
      bark: mat(T.woodDark, { roughness: 0.99, envMapIntensity: 0.1, color: 0x4a443e }),
      poleConcrete: mat(T.concrete, { roughness: 0.95, envMapIntensity: 0.16, color: 0x7d7a73 }),
      metalDark: new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.8 }),
      metalPaint: new THREE.MeshStandardMaterial({ color: 0x2c3a32, roughness: 0.52, metalness: 0.55, envMapIntensity: 0.7 }),
      metalTeal: new THREE.MeshStandardMaterial({ color: 0x1d5e5a, roughness: 0.48, metalness: 0.5, envMapIntensity: 0.8 }),
      metalBox: new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.6, metalness: 0.6, envMapIntensity: 0.7 }),
      insulator: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.9 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.75, metalness: 0.25, envMapIntensity: 0.5 }),
      lampBody: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7, envMapIntensity: 0.9 }),
      lampLens: new THREE.MeshStandardMaterial({
        color: 0xfff8ec, emissive: 0xfff1d6, emissiveIntensity: 16, roughness: 0.2,
        metalness: 0.0, side: THREE.DoubleSide,
      }),
      windowOff: new THREE.MeshStandardMaterial({ map: T.windowOff, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.6, side: THREE.DoubleSide }),
      windowOn: new THREE.MeshStandardMaterial({
        map: T.windowOn, emissiveMap: T.windowOn, emissive: 0xffffff,
        emissiveIntensity: 1.35, roughness: 0.3, side: THREE.DoubleSide,
      }),
      windowFrame: new THREE.MeshStandardMaterial({ color: 0xcdc9c1, roughness: 0.75 }),
      binBody: new THREE.MeshStandardMaterial({ color: 0x1f3b22, roughness: 0.78, metalness: 0.05 }),
      binLid: new THREE.MeshStandardMaterial({ color: 0x16291a, roughness: 0.78, metalness: 0.05 }),
      leaf: new THREE.MeshStandardMaterial({ map: T.leaf, color: 0x424a3d, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.12 }),
      leafDark: new THREE.MeshStandardMaterial({ map: T.leafDark, color: 0x3a4035, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.96, metalness: 0, envMapIntensity: 0.1 }),
      leafLight: new THREE.MeshStandardMaterial({ map: T.leafLight, color: 0x4e5445, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.93, metalness: 0, envMapIntensity: 0.14 }),
      blades: new THREE.MeshStandardMaterial({ map: T.blades, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 }),
    };

    /* ------------------------------ teren ------------------------------ */
    const terrain = new THREE.Mesh(terrainGeo(560, hi ? 200 : 130), M.grass);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    scene.add(terrain);

    /* ------------------------------ strazi ----------------------------- */
    const roadBag = new GeoBag();
    for (const r of ROADS) {
      roadBag.add('asphalt', asphaltGeo(r, r.id === 'main' ? 2.0 : 3.0));
      roadBag.add('kerb', kerbGeo(r, -1, 2.5));
      roadBag.add('kerb', kerbGeo(r, 1, 2.5));
      if (r.walkL) roadBag.add('walk', walkGeo(r, -1, 1.25, 2.5));
      if (r.walkR) roadBag.add('walk', walkGeo(r, 1, 1.25, 2.5));
      roadBag.add('paint', markingGeos(r, r.id === 'main'
        ? { dash: 1.5, gap: 2.0, width: 0.12, inset: 0.45 }
        : { dash: 1.2, gap: 2.4, width: 0.10, inset: 0.4 }));
    }
    // trotuar betonat pe dreapta, doar pe portiunile unde apare in poze
    for (const [a, b] of [[4, -26], [-62, -88]]) {
      roadBag.add('walk', walkGeo({ axis: 'z', c: 0, a, b, hw: ROAD_HW }, 1, 1.15, 2.5));
    }
    const roadMeshes = roadBag.build(scene, M, { castShadow: false, receiveShadow: true });
    for (const m of roadMeshes) if (m.name === 'bag_paint') m.renderOrder = 1;

    // urme de pneu lustruite pe firele de circulatie
    const trackMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.10, depthWrite: false, fog: true,
    });
    const tracks = new THREE.Mesh(mergeGeos(tireTrackGeos(ROADS[0], 4)), trackMat);
    tracks.renderOrder = 2;
    scene.add(tracks);

    /* -------------------- stalpi, lampi si retea aeriana ---------------- */
    const bag = new GeoBag();
    this.lamps = new StreetLights(scene, T, {
      poolSize: this.opts.quality === 'low' ? 4 : 6,
      shadowCount: this.opts.quality === 'low' ? 0 : 2,
      haze: this.opts.haze && this.opts.quality !== 'low',
      shadowMapSize: this.opts.quality === 'ultra' ? 2048 : 1024,
    });

    const poles = [];
    const POLE_X = -3.95;
    for (let i = 0; i < 13; i++) {
      const z = -6 - i * 28;
      const p = utilityPole(bag, this.colliders, POLE_X, z, { withLamp: true, armSide: 1 });
      poles.push(p);
      if (p.lampPos) this.lamps.addLamp(p.lampPos, 1);
    }
    // doi stalpi in spatele punctului de start (strada continua si inapoi)
    for (let i = 0; i < 2; i++) {
      const z = 24 + i * 28;
      const p = utilityPole(bag, this.colliders, POLE_X, z, { withLamp: i === 0, armSide: 1 });
      poles.unshift(p);
      if (p.lampPos) this.lamps.addLamp(p.lampPos, 1);
    }
    poles.sort((a, b) => b.pos.z - a.pos.z);

    // bransamente care traverseaza strada catre curtile din dreapta
    const drops = [];
    for (let i = 1; i < poles.length - 1; i += 2) {
      drops.push({ pole: i, x: 7.4, y: poles[i].pos.y + 5.0, z: poles[i].pos.z - 9, sag: 0.8, dy: 0.9 });
      drops.push({ pole: i, x: 6.9, y: poles[i].pos.y + 4.6, z: poles[i].pos.z + 7, sag: 0.9, dy: 1.6 });
      drops.push({ pole: i, x: -8.6, y: poles[i].pos.y + 4.4, z: poles[i].pos.z + 5, sag: 0.7, dy: 2.4 });
    }
    powerLines(bag, poles, { drops });

    // stalpi pe strazile secundare
    const sidePoles = [];
    for (const [x, z, arm] of [[-20, -101, -1], [-52, -101, -1], [-84.5, -110, 1],
      [-84.5, -150, 1], [-84.5, -195, 1], [-84.5, -235, 1], [-20, -249, -1], [-52, -249, -1],
      [-3.95, -262, 1], [-3.95, -294, 1], [-3.95, -326, 1]]) {
      const p = utilityPole(bag, this.colliders, x, z, { withLamp: true, armSide: arm, crossArm: true });
      sidePoles.push(p);
      if (p.lampPos) this.lamps.addLamp(p.lampPos, arm);
    }
    powerLines(bag, [sidePoles[2], sidePoles[3], sidePoles[4], sidePoles[5]], {});
    powerLines(bag, [poles[poles.length - 1], sidePoles[8], sidePoles[9], sidePoles[10]], {});

    /* ------------------------ garduri si porti ------------------------- */
    // STANGA: gard metalic pe soclu, apoi piatra, apoi lemn (ca in poze)
    fenceRun(bag, this.colliders, { axis: 'z', c: -4.9, from: 34, to: -2, style: 'metal', seed: 3, gaps: [[16, 20]] });
    gate(bag, this.colliders, -4.9, 16, 3.4, 'z', 'metal', 'green');
    fenceRun(bag, this.colliders, { axis: 'z', c: -4.9, from: -2, to: -40, style: 'stone', seed: 11, gaps: [[14, 18]] });
    gate(bag, this.colliders, -4.9, -18, 3.6, 'z', 'metal', 'teal');
    fenceRun(bag, this.colliders, { axis: 'z', c: -4.9, from: -40, to: -96, style: 'metal', seed: 21, gaps: [[20, 24]] });
    gate(bag, this.colliders, -4.9, -62, 3.4, 'z', 'metal', 'green');
    fenceRun(bag, this.colliders, { axis: 'z', c: -4.9, from: -110, to: -190, style: 'wood', seed: 31, gaps: [[28, 32]] });
    gate(bag, this.colliders, -4.9, -140, 3.4, 'z', 'wood', 'green');

    // DREAPTA: zid de piatra cu stalpi de caramida, poarta verde, apoi gard de lemn
    fenceRun(bag, this.colliders, { axis: 'z', c: 4.75, from: 30, to: -18, style: 'stone', seed: 7, gaps: [[44, 48]] });
    gate(bag, this.colliders, 4.75, -16, 3.6, 'z', 'metal', 'teal');
    fenceRun(bag, this.colliders, { axis: 'z', c: 4.75, from: -20, to: -58, style: 'wood', seed: 13, gaps: [[16, 20]] });
    gate(bag, this.colliders, 4.75, -38, 3.2, 'z', 'wood', 'green');
    fenceRun(bag, this.colliders, { axis: 'z', c: 4.75, from: -60, to: -104, style: 'wood', seed: 17, gaps: [[22, 26]] });
    gate(bag, this.colliders, 4.75, -84, 3.4, 'z', 'metal', 'teal');
    fenceRun(bag, this.colliders, { axis: 'z', c: 4.75, from: -108, to: -190, style: 'metal', seed: 19, gaps: [[30, 34]] });

    // strazile secundare
    fenceRun(bag, this.colliders, { axis: 'x', c: -110, from: -10, to: -80, style: 'wood', seed: 41 });
    fenceRun(bag, this.colliders, { axis: 'x', c: -97, from: -10, to: -80, style: 'metal', seed: 43 });
    fenceRun(bag, this.colliders, { axis: 'x', c: -258, from: -10, to: -80, style: 'wood', seed: 47 });
    fenceRun(bag, this.colliders, { axis: 'x', c: -245, from: -10, to: -80, style: 'stone', seed: 53 });
    fenceRun(bag, this.colliders, { axis: 'z', c: -94, from: -116, to: -240, style: 'wood', seed: 59 });
    fenceRun(bag, this.colliders, { axis: 'z', c: -81, from: -116, to: -240, style: 'metal', seed: 61 });

    // podete de beton in dreptul portilor + detalii de curte
    for (const [x, z] of [[6.1, -16], [6.1, -38], [6.1, -84], [-6.2, -18], [-6.2, -62], [-6.2, -140]]) {
      culvertSlab(bag, this.colliders, x, z, 3.8, 1.8, 'z');
    }
    meterBox(bag, this.colliders, 5.6, -24.5, 0);
    meterBox(bag, this.colliders, -5.7, -47, Math.PI);
    trashBin(bag, this.colliders, 5.5, -41.5, 0.2);
    trashBin(bag, this.colliders, 5.6, -43.0, -0.1);
    mailbox(bag, 5.5, -13.5, 0);
    mailbox(bag, -5.6, -59, Math.PI);
    manhole(bag, -0.9, -31);
    manhole(bag, 0.7, -97);
    manhole(bag, -1.2, -173);
    drainGrate(bag, -2.65, -25.5);
    drainGrate(bag, -2.65, -89.5);
    drainGrate(bag, 2.7, -55);

    /* -------------------------------- case ----------------------------- */
    const rnd = makeRng(1234);
    const wallSet = ['stucco', 'stuccoWarm', 'stuccoWhite'];
    const roofSet = ['roof', 'roof', 'roofDark'];
    const leftHouses = [
      { z: 20, d: 9, w: 10, st: 1, porch: true }, { z: -6, d: 8, w: 9, st: 1 },
      { z: -26, d: 9, w: 11, st: 2, garage: true }, { z: -48, d: 8, w: 9, st: 1, porch: true },
      { z: -70, d: 9, w: 10, st: 1 }, { z: -92, d: 8, w: 9, st: 2 },
      { z: -128, d: 9, w: 10, st: 1, garage: true }, { z: -156, d: 8, w: 9, st: 1 },
      { z: -184, d: 9, w: 11, st: 2 },
    ];
    for (let i = 0; i < leftHouses.length; i++) {
      const h = leftHouses[i];
      house(bag, this.colliders, {
        x: -6.2 - h.d / 2 - 4.6, z: h.z, ry: Math.PI / 2 + (rnd() - 0.5) * 0.05,
        w: h.w, d: h.d, storeys: h.st, wall: wallSet[i % 3], roof: roofSet[i % 3],
        litChance: 0.3, seed: 100 + i * 7, garage: !!h.garage, porch: !!h.porch,
      });
    }
    const rightHouses = [
      { z: 12, d: 9, w: 10, st: 1 }, { z: -8, d: 8, w: 9, st: 2, porch: true },
      { z: -30, d: 9, w: 10, st: 1 }, { z: -52, d: 8, w: 9, st: 1, garage: true },
      { z: -76, d: 9, w: 11, st: 2 }, { z: -100, d: 8, w: 9, st: 1 },
      { z: -134, d: 9, w: 10, st: 1, porch: true }, { z: -168, d: 8, w: 9, st: 2 },
    ];
    for (let i = 0; i < rightHouses.length; i++) {
      const h = rightHouses[i];
      house(bag, this.colliders, {
        x: 6.0 + h.d / 2 + 5.0, z: h.z, ry: -Math.PI / 2 + (rnd() - 0.5) * 0.05,
        w: h.w, d: h.d, storeys: h.st, wall: wallSet[(i + 1) % 3], roof: roofSet[(i + 2) % 3],
        litChance: 0.28, seed: 300 + i * 11, garage: !!h.garage, porch: !!h.porch,
      });
    }
    // case pe strazile secundare
    for (let i = 0; i < 10; i++) {
      const x = -16 - i * 7.4;
      house(bag, this.colliders, {
        x, z: -117, ry: 0, w: 8.5, d: 8, storeys: rnd() < 0.3 ? 2 : 1,
        wall: wallSet[i % 3], roof: roofSet[i % 3], litChance: 0.22, seed: 500 + i,
      });
      house(bag, this.colliders, {
        x, z: -265, ry: Math.PI, w: 8.5, d: 8, storeys: rnd() < 0.3 ? 2 : 1,
        wall: wallSet[(i + 2) % 3], roof: roofSet[(i + 1) % 3], litChance: 0.22, seed: 700 + i,
      });
    }
    for (let i = 0; i < 8; i++) {
      const z = -126 - i * 14;
      house(bag, this.colliders, {
        x: -101, z, ry: Math.PI / 2, w: 8.5, d: 8, storeys: 1,
        wall: wallSet[i % 3], roof: roofSet[i % 3], litChance: 0.2, seed: 900 + i,
      });
    }

    /* ----------------------------- vegetatie --------------------------- */
    // z-urile sunt alese departe de stalpi (la -6, -34, -62, ... ) ca sa nu
    // avem coroane la un metru de corpul de iluminat
    const trees = [
      [8.2, 6, 'broadleaf', 1.25], [7.4, -18, 'conifer', 1.15], [7.8, -24, 'conifer', 1.0],
      [8.4, -46, 'broadleaf', 1.05], [7.5, -52, 'conifer', 1.3], [8.1, -76, 'conifer', 1.05],
      [8.5, -82, 'broadleaf', 1.15], [7.6, -104, 'conifer', 1.2], [8.2, -110, 'broadleaf', 0.95],
      [7.7, -132, 'conifer', 1.1], [8.4, -160, 'broadleaf', 1.2], [7.8, -188, 'conifer', 1.0],
      [-8.8, 8, 'broadleaf', 1.1], [-8.2, -18, 'conifer', 0.95], [-9.0, -46, 'broadleaf', 1.3],
      [-8.4, -76, 'conifer', 1.15], [-8.9, -104, 'broadleaf', 1.05], [-8.2, -132, 'conifer', 1.1],
      [-8.8, -160, 'broadleaf', 1.15], [-8.5, -188, 'conifer', 1.0],
    ];
    for (let i = 0; i < trees.length; i++) {
      const [x, z, k, s] = trees[i];
      tree(bag, this.colliders, x, z, k, s, 2000 + i * 13);
    }
    // tufe pe acostamente
    for (let i = 0; i < (hi ? 46 : 24); i++) {
      const side = i % 2 ? 1 : -1;
      const z = 24 - i * 4.6 - rnd() * 2.6;
      const x = side * (5.4 + rnd() * 0.9);
      tree(bag, this.colliders, x, z, 'bush', 0.55 + rnd() * 0.5, 4000 + i);
    }
    for (let i = 0; i < 26; i++) {
      tree(bag, this.colliders, -14 - i * 3.3, -112 - rnd() * 3, 'bush', 0.6 + rnd() * 0.5, 6000 + i);
      if (i % 3 === 0) tree(bag, this.colliders, -90 - rnd() * 4, -130 - i * 4.6, 'conifer', 0.9 + rnd() * 0.5, 6500 + i);
    }

    this.staticMeshes = bag.build(scene, M, { castShadow: true, receiveShadow: true });

    /* ------------------------ smocuri de iarba ------------------------- */
    if (hi) {
      const spots = [];
      const gr = makeRng(77);
      for (let i = 0; i < 2200; i++) {
        const z = 36 - gr() * 240;
        const x = ROAD_HW + 0.45 + gr() * 1.35;       // acostamentul din dreapta
        spots.push({ x, z, r: gr() * Math.PI, s: 0.45 + gr() * 0.5, v: gr() });
      }
      for (let i = 0; i < 700; i++) {                 // iarba din curti, langa garduri
        const z = 34 - gr() * 230;
        const x = (gr() < 0.5 ? -1 : 1) * (5.3 + gr() * 2.4);
        spots.push({ x, z, r: gr() * Math.PI, s: 0.45 + gr() * 0.55, v: gr() });
      }
      for (let i = 0; i < 900; i++) {
        const z = -100 - gr() * 160;
        spots.push({ x: -88 + (gr() < 0.5 ? -1 : 1) * (2.9 + gr() * 1.6), z, r: gr() * Math.PI, s: 0.45 + gr() * 0.5, v: gr() });
      }
      grassTufts(scene, M.blades, spots);
    }

    /* --------------------------- masini parcate ------------------------ */
    this.buildCars();

    this.lamps.finalize();
    this.colliders.build();
    return this;
  }

  buildCars() {
    // pozitiile reproduc sirul de masini parcate pe stanga din fotografii
    const layout = [
      [-2.00, 9.5, 'sedan', 1, 0],     // masina taiata de cadru, langa camera
      [-2.00, -7.0, 'sedan', 0, 0],    // berlina inchisa la culoare (poza 1)
      [-2.02, -14.6, 'wagon', 1, 0],   // break gri
      [-1.98, -21.4, 'hatch', 2, 0],   // hatchback argintiu (poza 2)
      [-2.04, -28.2, 'wagon', 0, 0],
      [-1.98, -36.5, 'suv', 4, 0],     // SUV albastru inchis (poza 3)
      [-1.97, -43.6, 'hatch', 3, 0],
      [-2.02, -52.0, 'wagon', 6, 0],
      [-2.00, -66.0, 'sedan', 1, 0],
      [-2.00, -79.0, 'hatch', 2, 0],
      [-2.00, -95.0, 'wagon', 0, 0],
      [-2.02, -118.0, 'sedan', 7, 0],
      [-2.00, -142.0, 'wagon', 5, 0],
      [1.75, -131.0, 'hatch', 3, Math.PI],   // masina de la capat, cu fata spre noi
      [1.78, -160.0, 'sedan', 0, Math.PI],
      [-84.6, -140.0, 'wagon', 2, Math.PI / 2],
      [-84.6, -176.0, 'hatch', 6, Math.PI / 2],
      [-26.0, -101.6, 'sedan', 4, Math.PI / 2],
      [-58.0, -250.4, 'suv', 1, -Math.PI / 2],
    ];
    const n = Math.min(layout.length, this.opts.carCount);
    const contact = [];
    for (let i = 0; i < n; i++) {
      const [x, z, type, ci, yaw] = layout[i];
      const color = CAR_COLORS[ci % CAR_COLORS.length];
      const mesh = buildCar({
        type, color, plate: PLATES[i % PLATES.length], seed: 10 + i * 3,
        env: this.scene.environment,
      });
      // mic dezaliniere naturala a parcarii
      const jitter = (((i * 37) % 11) - 5) * 0.006;
      placeOnGround(mesh, surfaceY, x, z, yaw + jitter);
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(mesh);
      const spec = mesh.userData.spec;
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const col = this.colliders.add(x, z,
        (spec.W / 2) * c + (spec.L / 2) * s, (spec.W / 2) * s + (spec.L / 2) * c,
        mesh.position.y, mesh.position.y + 1.5, 0, 'car');
      mesh.userData.collider = col;
      this.cars.push({ mesh, collider: col, x, z, yaw, type, color, plate: mesh.userData.plate });

      // umbra de contact: masinile fara shadow map trebuie totusi ancorate la sol
      const dg = new THREE.PlaneGeometry(spec.W * 1.28, spec.L * 1.06, 3, 3);
      dg.rotateX(-Math.PI / 2);
      dg.rotateY(yaw);
      const dp = dg.attributes.position;
      for (let k = 0; k < dp.count; k++) {
        dp.setY(k, surfaceY(dp.getX(k) + x, dp.getZ(k) + z) + 0.012 - surfaceY(x, z));
      }
      dp.needsUpdate = true;
      dg.translate(x, surfaceY(x, z), z);
      contact.push(dg);
    }
    if (contact.length) {
      const cm = new THREE.MeshBasicMaterial({
        map: this.T.glow, color: 0x000000, transparent: true, opacity: 0.5,
        depthWrite: false, fog: true,
      });
      const cmesh = new THREE.Mesh(mergeGeos(contact), cm);
      cmesh.renderOrder = 2;
      this.scene.add(cmesh);
    }
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
      const g = surfaceY(px, pz);
      if (py < g + radius) return Math.max(0.12, (i - 1) / steps);
      for (const it of list) {
        if (it.disabled) continue;
        if (py < it.yBottom - radius || py > it.yTop + radius) continue;
        const h = closestOnCollider(it, px, pz, this._hit);
        const inside = Math.abs(h.lx) <= it.hx && Math.abs(h.lz) <= it.hz;
        if (inside || Math.hypot(px - h.wx, pz - h.wz) < radius) {
          return Math.max(0.12, (i - 1) / steps);
        }
      }
    }
    return 1;
  }

  nearestCar(pos, maxDist = 3.2) {
    let best = null, bd = maxDist * maxDist;
    for (const c of this.cars) {
      if (c.inUse) continue;
      const d = (c.mesh.position.x - pos.x) ** 2 + (c.mesh.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  setLampsOn(on) {
    this.materials.lampLens.emissiveIntensity = on ? 16 : 0.0;
  }

  setTimeOfDay(t) {
    // t: 0 = miez de noapte, 0.5 = amiaza (harta e construita pentru noapte)
    const day = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const sky = new THREE.Color(0x05060b).lerp(new THREE.Color(0x8fb2dd), day);
    this.scene.fog.color.copy(sky);
    this.sky.setDay(day);
    this.scene.environmentIntensity = 0.62 + day * 1.7;
    this.ambience.hemi.intensity = 0.125 + day * 1.95;
    this.ambience.moon.intensity = day * 2.4;
    this.ambience.moon.color.setHex(day > 0.4 ? 0xfff3e0 : 0x9db4dd);
    this.scene.fog.density = 0.0135 - day * 0.0075;
    return day;
  }
}
