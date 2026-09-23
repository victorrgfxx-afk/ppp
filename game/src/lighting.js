/**
 * Iluminatul public. Trucul de performanta: un POOL FIX de SpotLight-uri
 * (numarul de lumini nu se schimba niciodata -> zero recompilari de shadere)
 * care se re-ataseaza la cele mai apropiate lampi. Lampile departate sunt
 * redate prin balti de lumina proiectate pe carosabil + flare-uri.
 */
import * as THREE from '../vendor/three.module.min.js';
import { surfaceY } from './terrain.js';
import { clamp, smoothstep } from './noise.js';
import { mergeGeos } from './geo.js';

const _q0 = new THREE.Quaternion();

const HAZE_VS = `
varying vec3 vN;
varying vec3 vV;
varying float vH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vH = uv.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const HAZE_FS = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vN;
varying vec3 vV;
varying float vH;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = pow(clamp(rim, 0.0, 1.0), 6.0) * (0.6 + 0.4 * rim);
  a *= smoothstep(0.0, 0.22, vH) * (1.0 - smoothstep(0.30, 1.0, vH) * 0.96);
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}`;

export class StreetLights {
  constructor(scene, tex, opts = {}) {
    this.scene = scene;
    this.tex = tex;
    this.lamps = [];
    this.opts = Object.assign({
      poolSize: 6, shadowCount: 2, intensity: 1150, color: 0xfff0d2,
      distance: 72, angle: 1.2, penumbra: 0.55, haze: true, flares: true,
      shadowMapSize: 1024,
    }, opts);
    this.lights = [];
    this.group = new THREE.Group();
    this.group.name = 'streetlights';
    scene.add(this.group);
    this._tmp = new THREE.Vector3();
    this._order = [];
  }

  /** dir = directia de la stalp spre carosabil ([dx, dz]) - bratul e deasupra strazii. */
  addLamp(pos, dir = [1, 0], opts = {}) {
    const d = Array.isArray(dir) ? dir : [dir, 0];
    const L = Math.hypot(d[0], d[1]) || 1;
    this.lamps.push({
      pos: pos.clone(), dir: [d[0] / L, d[1] / L], on: true, d2: 0, weight: 0,
      pool: null, flare: null, glow: null, haze: null, poolMat: null,
      poolLen: opts.poolLen || 16, poolWid: opts.poolWid || 7.2,
    });
  }

  finalize() {
    const o = this.opts;
    for (let i = 0; i < o.poolSize; i++) {
      const l = new THREE.SpotLight(o.color, 0, o.distance, o.angle, o.penumbra, 2);
      l.target = new THREE.Object3D();
      this.group.add(l, l.target);
      if (i < o.shadowCount) {
        l.castShadow = true;
        l.shadow.mapSize.set(o.shadowMapSize, o.shadowMapSize);
        l.shadow.camera.near = 1.2;
        l.shadow.camera.far = 34;
        l.shadow.bias = -0.0009;
        l.shadow.normalBias = 0.035;
        l.shadow.radius = 2.0;
      }
      this.lights.push(l);
    }

    const poolGeoCache = new Map();
    // toate baltile intr-un singur mesh; opacitatea fiecareia e culoarea varfurilor
    const geos = [];
    this.poolRanges = [];
    let vOff = 0;
    for (const lamp of this.lamps) {
      const g = this._poolGeometry(lamp);
      const n = g.attributes.position.count;
      this.poolRanges.push([vOff, n]);
      vOff += n;
      geos.push(g);
    }
    const merged = mergeGeos(geos);
    this.poolColor = new THREE.BufferAttribute(new Float32Array(vOff * 3), 3);
    this.poolColor.setUsage(THREE.DynamicDrawUsage);
    merged.setAttribute('color', this.poolColor);
    this.poolMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({
      map: this.tex.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, color: 0xffedd2, fog: true,
    }));
    this.poolMesh.renderOrder = 3;
    this.poolMesh.frustumCulled = false;
    this.group.add(this.poolMesh);

    // stralucirea si razele lampilor: doua InstancedMesh, intoarse spre camera
    if (this.opts.flares) {
      const quad = new THREE.PlaneGeometry(1, 1);
      const mk = (map, color, order) => {
        const m = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({
          map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }), this.lamps.length);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.lamps.length * 3), 3);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.renderOrder = order;
        this.group.add(m);
        return m;
      };
      this.glowIM = mk(this.tex.glow, 0xfff0d2, 6);
      this.flareIM = mk(this.tex.flare, 0xffe9c0, 7);
    }

    for (const lamp of this.lamps) {
      if (this.opts.haze) {
        const gy = surfaceY(lamp.pos.x + lamp.dir[0] * 0.6, lamp.pos.z + lamp.dir[1] * 0.6);
        const h = lamp.pos.y - gy;
        let cg = poolGeoCache.get(Math.round(h * 10));
        if (!cg) {
          cg = new THREE.ConeGeometry(h * 0.50, h, 18, 1, true);
          cg.translate(0, -h / 2, 0);
          poolGeoCache.set(Math.round(h * 10), cg);
        }
        const hm = new THREE.ShaderMaterial({
          vertexShader: HAZE_VS, fragmentShader: HAZE_FS,
          uniforms: { uColor: { value: new THREE.Color(0xffeccb) }, uIntensity: { value: 0 } },
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide,
        });
        const hz = new THREE.Mesh(cg, hm);
        hz.position.set(lamp.pos.x + lamp.dir[0] * 0.2, lamp.pos.y, lamp.pos.z + lamp.dir[1] * 0.2);
        hz.renderOrder = 4;
        hz.visible = false;
        this.group.add(hz);
        lamp.haze = hz;
      }
    }
    return this;
  }

  _poolGeometry(lamp) {
    // balta: centrata putin spre axul strazii, alungita pe lungul ei
    const [dx, dz] = lamp.dir;
    const cx = lamp.pos.x + dx * 1.2, cz = lamp.pos.z + dz * 1.2;
    const RX = lamp.poolWid, RZ = lamp.poolLen, N = 8;
    const g = new THREE.PlaneGeometry(RX * 2, RZ * 2, N, N);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(-dz, dx));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      p.setX(i, x); p.setZ(i, z);
      p.setY(i, surfaceY(x, z) + 0.016);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  setOn(on) {
    this.on = on;
    for (const lamp of this.lamps) lamp.on = on;
  }

  /** Reatribuie pool-ul de lumini reale celor mai apropiate lampi. */
  update(camPos, dt, masterOn = 1, camQuat = null) {
    const o = this.opts;
    const lamps = this.lamps;
    for (const l of lamps) l.d2 = l.pos.distanceToSquared(camPos);
    this._order.length = 0;
    for (let i = 0; i < lamps.length; i++) this._order.push(i);
    this._order.sort((a, b) => lamps[a].d2 - lamps[b].d2);

    const n = Math.min(o.poolSize, lamps.length);
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      if (i >= n) { light.intensity = 0; continue; }
      const lamp = lamps[this._order[i]];
      const d = Math.sqrt(lamp.d2);
      // atenuare lina la marginea pool-ului, ca sa nu "pocneasca" la comutare
      const w = masterOn * smoothstep(o.distance * 1.30, o.distance * 0.85, d);
      lamp.weight = w;
      light.position.copy(lamp.pos);
      const tx = lamp.pos.x + lamp.dir[0] * 1.3, tz = lamp.pos.z + lamp.dir[1] * 1.3;
      light.target.position.set(tx, surfaceY(tx, tz), tz);
      light.target.updateMatrixWorld();
      light.intensity = o.intensity * w;
    }
    for (let i = n; i < lamps.length; i++) lamps[this._order[i]].weight = 0;

    const col = this.poolColor.array;
    const im = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let li = 0; li < lamps.length; li++) {
      const lamp = lamps[li];
      const d = Math.sqrt(lamp.d2);
      // baltile preiau exact cat lasa lumina reala (fara dubla contributie)
      const op = masterOn * (0.18 + 0.52 * (1 - lamp.weight)) * smoothstep(260, 40, d);
      const [v0, n] = this.poolRanges[li];
      for (let k = v0 * 3, e = (v0 + n) * 3; k < e; k++) col[k] = op;
      if (this.glowIM) {
        const vis = d < 300 && masterOn > 0.01 ? 1 : 0;
        const near = smoothstep(4, 14, d);
        const gs = clamp(0.9 + d * 0.016, 0.9, 3.4) * vis;
        const fs = clamp(1.6 + d * 0.026, 1.6, 6.0) * vis;
        pos.copy(lamp.pos);
        im.compose(pos, camQuat || _q0, sc.set(gs, gs, gs)); this.glowIM.setMatrixAt(li, im);
        im.compose(pos, camQuat || _q0, sc.set(fs, fs, fs)); this.flareIM.setMatrixAt(li, im);
        const go = masterOn * (0.75 + 0.25 * near);
        const fo = masterOn * clamp(0.30 + d * 0.004, 0.30, 0.62) * near;
        this.glowIM.instanceColor.setXYZ(li, go, go, go);
        this.flareIM.instanceColor.setXYZ(li, fo, fo, fo);
      }
      if (lamp.haze) {
        lamp.haze.material.uniforms.uIntensity.value = masterOn * 0.034 * smoothstep(70, 14, d) * smoothstep(9, 22, d);
        lamp.haze.visible = d < 70 && masterOn > 0.01;
      }
    }
    this.poolColor.needsUpdate = true;
    if (this.glowIM) {
      this.glowIM.instanceMatrix.needsUpdate = true; this.glowIM.instanceColor.needsUpdate = true;
      this.flareIM.instanceMatrix.needsUpdate = true; this.flareIM.instanceColor.needsUpdate = true;
    }
  }
}

/** Lumina ambientala de noapte: cer slab + o umplere rece dinspre zenit. */
export function nightAmbience(scene) {
  const hemi = new THREE.HemisphereLight(0x3a4458, 0x0c0c0f, 0.26);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x2e3a58, 0.022);
  fill.position.set(-40, 80, 30);
  scene.add(fill);
  const moon = new THREE.DirectionalLight(0x8fa6d8, 0.0);
  moon.position.set(-70, 60, -90);
  scene.add(moon);
  return { hemi, fill, moon };
}
