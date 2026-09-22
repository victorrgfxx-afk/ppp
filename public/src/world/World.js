/* Assembles the whole site from SitePlan + Structures + Props + Vegetation. */
import * as THREE from 'three';
import * as PLAN from './SitePlan.js';
import * as S from './Structures.js';
import * as P from './Props.js';
import { Vegetation } from './Vegetation.js';
import { mergeByMaterial } from './Optimize.js';
import { Fbm, mulberry32, clamp01 } from '../gfx/Noise.js';

/* Large-scale tint baked into the ground mesh. A 3 m texture tile repeated over
   a 100 m yard reads as an obvious grid; low-frequency vertex colour breaks that
   up and doubles as dust drifts, tyre tracks and oil staining. */
const tintNoise = new Fbm(6, 4, 4242, 0.55);
const stainNoise = new Fbm(3, 3, 9191);
function tintedGround(w, d, cx, cz, kind) {
  const step = 2.0;
  const sx = Math.max(1, Math.min(120, Math.round(w / step)));
  const sz = Math.max(1, Math.min(120, Math.round(d / step)));
  const geo = new THREE.PlaneGeometry(w, d, sx, sz);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + pos.getX(i), wz = cz - pos.getY(i);   // plane is rotated later
    const n = tintNoise.at(wx * 0.022 + 40, wz * 0.022 + 40);
    const st = clamp01(stainNoise.at(wx * 0.05 + 10, wz * 0.05 + 10) * 1.55 - 0.72);
    let r = 1 + (n - 0.5) * 0.30, g = 1 + (n - 0.5) * 0.26, b = 1 + (n - 0.5) * 0.20;
    if (kind === 'concrete' || kind === 'asphalt') {       // oil and rubber
      const f = st * 0.55;
      r *= 1 - f; g *= 1 - f * 1.02; b *= 1 - f * 0.94;
    } else if (kind === 'gravel' || kind === 'dirt') {     // dust drifts and damp patches
      r *= 1 + (n - 0.5) * 0.16; b *= 1 - (n - 0.5) * 0.2;
      const f = st * 0.35; r *= 1 - f; g *= 1 - f; b *= 1 - f * 0.8;
    } else if (kind === 'grass') {                          // dry/green patches
      r *= 1 + st * 0.5; g *= 1 + st * 0.22; b *= 1 - st * 0.1;
    }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class World {
  constructor(scene, mats, physics, preset, reserved = []) {
    this.scene = scene;
    this.mats = mats;
    this.physics = physics;
    this.preset = preset;
    this.reserved = reserved;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);

    this.colliders = [];
    this.doors = [];
    this.floodlights = [];
    this.interactables = [];

    this._buildGround();
    this._buildBuildings();
    this._buildBoundaries();
    this._buildUtilities();
    this._buildVegetation();
    this._buildProps();
    this._commitColliders();
    this._batch();
  }

  /* ------------------------------------------------------------- ground -- */
  _buildGround() {
    const g = new THREE.Group(); g.name = 'ground';
    for (const s of PLAN.SURFACES) {
      const raised = s.y >= 0.04;
      const mat = this.mats.surface(s.tex, s.w, s.d, { vertexColors: true });
      const mesh = new THREE.Mesh(tintedGround(s.w, s.d, s.x, s.z, s.tex), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(s.x, s.y, s.z);
      mesh.renderOrder = Math.round(s.y * 100);
      mesh.receiveShadow = true;
      mesh.name = 'surface-' + s.id;
      g.add(mesh);
      if (s.tex === 'concrete') g.add(this._joints(s));
      if (raised) {
        // visible kerb around poured slabs, plus a collider so vehicles ride on top
        const h = s.y + 0.25;
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), this.mats.surface(s.tex, s.w, h));
        skirt.position.set(s.x, s.y - h / 2 - 0.002, s.z);
        skirt.receiveShadow = true;
        g.add(skirt);
        this.colliders.push({ cx: s.x, cy: s.y - h / 2, cz: s.z, sx: s.w, sy: h, sz: s.d, rotY: 0 });
      }
    }
    this.root.add(g);
    this.physics.addGroundPlane();
  }

  /** Expansion joints scored into poured slabs — very visible in the photos. */
  _joints(s) {
    const g = new THREE.Group();
    const mat = this.mats.plain(0x4d4f4f, { roughness: 0.95 });
    const cell = 3.6, wJ = 0.035;
    const y = s.y + 0.004;
    for (let x = -s.w / 2 + cell; x < s.w / 2 - 0.2; x += cell) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wJ, s.d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x + x, y, s.z);
      m.renderOrder = Math.round(s.y * 100) + 1;
      g.add(m);
    }
    for (let z = -s.d / 2 + cell; z < s.d / 2 - 0.2; z += cell) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, wJ), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, y, s.z + z);
      m.renderOrder = Math.round(s.y * 100) + 1;
      g.add(m);
    }
    return g;
  }

  /* ---------------------------------------------------------- buildings -- */
  _buildBuildings() {
    const g = new THREE.Group(); g.name = 'buildings';
    for (const [key, b] of Object.entries(PLAN.BUILDINGS)) {
      let obj = null;
      if (b.type === 'hall') obj = S.buildHall(b, this.mats, this.colliders);
      else if (b.type === 'house') obj = S.buildHouse(b, this.mats, this.colliders);
      else if (b.type === 'container') obj = S.buildContainer(b, this.mats, this.colliders);
      else if (b.type === 'shed') obj = S.buildShed(b, this.mats, this.colliders);
      if (!obj) continue;
      obj.userData.key = key;
      g.add(obj);
      if (obj.userData.doors) {
        obj.userData.doors.forEach((d, i) => {
          d.building = key; d.index = i;
          this.doors.push(d);
          this.interactables.push({
            kind: 'door', pos: new THREE.Vector3(d.worldX, 1.2, d.worldZ), radius: 3.4,
            label: () => (d.open ? 'Închide ușa' : 'Deschide ușa'),
            act: () => { d.open = !d.open; },
          });
        });
      }
      if (obj.userData.interiorLight) {
        obj.userData.interiorLight.userData.key = key;
      }
      this[key] = obj;
    }
    for (const c of PLAN.CHIMNEYS) g.add(S.buildChimney(c, this.mats, this.colliders));
    this.root.add(g);
  }

  /* --------------------------------------------------------- boundaries -- */
  _buildBoundaries() {
    const g = new THREE.Group(); g.name = 'boundaries';
    for (const f of PLAN.FENCES) {
      g.add(S.buildFence(f.pts, this.mats, this.colliders, { h: f.h, gaps: f.gaps || [] }));
    }
    const gate = S.buildGate(PLAN.GATE, this.mats, this.colliders);
    g.add(gate);
    this.gate = gate;
    this.interactables.push({
      kind: 'gate', pos: new THREE.Vector3(PLAN.GATE.x, 1.2, PLAN.GATE.z), radius: 4.5,
      label: () => (this._gateOpen ? 'Închide poarta' : 'Deschide poarta'),
      act: () => { this._gateOpen = !this._gateOpen; },
    });
    this._gateOpen = true;
    this._gateT = 1;
    for (const s of PLAN.FENCE_SIGNS) g.add(S.buildSign(s, this.mats));
    for (const s of (PLAN.BAY_SIGNS || [])) g.add(S.buildSign(s, this.mats));
    this.root.add(g);
  }

  /* ---------------------------------------------------------- utilities -- */
  _buildUtilities() {
    const g = new THREE.Group(); g.name = 'utilities';
    for (const p of PLAN.POWER_POLES) g.add(S.buildPowerPole(p, this.mats, this.colliders));
    g.add(S.buildWires(PLAN.POWER_POLES, this.mats));
    for (const l of (PLAN.WALL_LAMPS || [])) {
      const wl = S.buildWallLamp(l, this.mats);
      this.floodlights.push(wl);
      g.add(wl);
    }
    for (const f of PLAN.FLOODLIGHTS) {
      const fl = S.buildFloodlight(f, this.mats, this.colliders);
      this.floodlights.push(fl);
      g.add(fl);
    }
    this.root.add(g);
  }

  /* --------------------------------------------------------- vegetation -- */
  _buildVegetation() {
    this.veg = new Vegetation(PLAN.TREES, this.mats, this.colliders, {
      foliageQuality: this.preset.foliage,
      reserved: this.reserved,
    });
    this.veg.addGrass(PLAN.GRASS_AREAS, this.mats, { density: this.preset.grassDensity });
    this.root.add(this.veg.group);
  }

  /* -------------------------------------------------------------- props -- */
  _buildProps() {
    const g = new THREE.Group(); g.name = 'props';
    const M = this.mats;
    for (const p of PLAN.PROPS) {
      let obj = null;
      switch (p.kind) {
        case 'barrel':        obj = P.plasticBarrel(M, p.color); break;
        case 'oilDrum':       obj = P.oilDrum(M); break;
        case 'extinguisher':  obj = P.fireExtinguisher(M); break;
        case 'jerrycan':      obj = P.jerrycan(M); break;
        case 'pallet':        obj = P.pallet(M); break;
        case 'tyre':          obj = P.tyre(M); break;
        case 'tyreStack':     obj = P.tyreStack(M, p.n || 4); break;
        case 'cone':          obj = P.trafficCone(M); break;
        case 'crate':         obj = P.crate(M, 0.6, 0.4, 0.42, p.color); break;
        case 'toolbox':       obj = P.toolbox(M); break;
        case 'workbench':     obj = P.workbench(M, p.len || 2.6); break;
        case 'lift':          obj = P.carLift(M); break;
        case 'compressor':    obj = P.compressor(M); break;
        case 'hoseReel':      obj = P.hoseReel(M); break;
        case 'skip':          obj = P.skip(M); break;
        case 'bin':           obj = P.wheelieBin(M, p.color); break;
        case 'scrapPile':     obj = P.scrapPile(M); break;
        case 'gasTrolley':    obj = P.gasTrolley(M); break;
        case 'block':         obj = P.concreteBlock(M); break;
        case 'meshPanel':     obj = P.meshPanel(M); break;
        case 'rubble':        obj = P.rubble(M); break;
        default: continue;
      }
      if (this.reserved.some(v => Math.hypot(v.x - p.x, v.z - p.z) < (v.r || 3.4) * 0.8)) continue;
      obj.position.set(p.x, p.y || 0, p.z);
      obj.rotation.y = p.rotY || 0;
      obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (p.d) { obj.userData.noMerge = true; mergeByMaterial(obj); }   // moves as one rigid body
      g.add(obj);
      if (p.d) P.makeDynamic(this.physics, obj);
    }
    this.root.add(g);
  }

  /** Batch the static scenery. Doors, the gate leaf and the lights move, so
      they are flagged and skipped. */
  _batch() {
    for (const d of this.doors) { d.pivot.userData.noMerge = true; d.leaf.userData.noMerge = true; }
    this.gate.userData.leaf.userData.noMerge = true;
    for (const fl of this.floodlights) fl.userData.lens.userData.noMerge = true;
    this.batch = {};
    for (const name of ['buildings', 'boundaries', 'utilities', 'props', 'ground']) {
      const g = this.root.getObjectByName(name);
      if (g) this.batch[name] = mergeByMaterial(g);
    }
  }

  /* ---------------------------------------------------------- colliders -- */
  _commitColliders() {
    for (const c of this.colliders) {
      this.physics.addStaticBox(c.cx, c.cy, c.cz, c.sx, c.sy, c.sz, c.rotY || 0);
    }
  }

  /* ------------------------------------------------------------- update -- */
  update(dt, t, atmo) {
    // doors slide up under the lintel
    for (const d of this.doors) {
      const target = d.open ? 1 : 0;
      if (Math.abs(d.t - target) > 0.001) {
        d.t += Math.sign(target - d.t) * dt * 0.55;
        d.t = Math.max(0, Math.min(1, d.t));
        d.leaf.position.y = d.h / 2 + d.t * (d.h - 0.18);
        d.leaf.visible = d.t < 0.985;
      }
    }
    // sliding gate
    const gt = this._gateOpen ? 1 : 0;
    if (Math.abs(this._gateT - gt) > 0.001) {
      this._gateT += Math.sign(gt - this._gateT) * dt * 0.4;
      this._gateT = Math.max(0, Math.min(1, this._gateT));
      this.gate.userData.leaf.position.x = this._gateT * this.gate.userData.width * 0.96;
    }
    // vegetation wind
    this.veg.update(t, atmo.windStrength, atmo.windDir);
    // yard lights follow the sun
    const dark = atmo.sunDirection.y < 0.08;
    for (const fl of this.floodlights) {
      const on = dark ? 1 : 0;
      const l = fl.userData.light;
      const peak = fl.userData.peak || 55;
      l.intensity += (on * peak - l.intensity) * Math.min(1, dt * 1.6);
      fl.userData.lens.material.emissiveIntensity = l.intensity / peak * 2.4;
    }
    for (const key of ['hallB', 'garageA']) {
      const b = this[key];
      if (b?.userData?.interiorLight) {
        const anyOpen = b.userData.doors.some(d => d.t > 0.15);
        const target = dark ? 1.4 : (anyOpen ? 0.55 : 0.30);
        b.userData.interiorLight.intensity += (target - b.userData.interiorLight.intensity) * Math.min(1, dt * 2);
      }
    }
  }

  /** Nearest interactable within its radius, for the "press E" prompt. */
  findInteractable(pos) {
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      const d = it.pos.distanceTo(pos);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }
}
