/**
 * Iluminatul public. Trucul de performanta: un POOL FIX de SpotLight-uri
 * (numarul de lumini nu se schimba niciodata -> zero recompilari de shadere)
 * care se re-ataseaza la cele mai apropiate lampi. Lampile departate sunt
 * redate prin balti de lumina proiectate pe carosabil + flare-uri.
 */
import * as THREE from '../vendor/three.module.min.js';
import { surfaceY } from './terrain.js';
import { clamp, smoothstep } from './noise.js';

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
  float a = pow(clamp(rim, 0.0, 1.0), 4.5);
  a *= smoothstep(0.0, 0.22, vH) * (1.0 - smoothstep(0.30, 1.0, vH) * 0.96);
  gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
}`;

export class StreetLights {
  constructor(scene, tex, opts = {}) {
    this.scene = scene;
    this.tex = tex;
    this.lamps = [];
    this.opts = Object.assign({
      poolSize: 6, shadowCount: 2, intensity: 980, color: 0xfff0d2,
      distance: 72, angle: 1.05, penumbra: 0.92, haze: true, flares: true,
      shadowMapSize: 1024,
    }, opts);
    this.lights = [];
    this.group = new THREE.Group();
    this.group.name = 'streetlights';
    scene.add(this.group);
    this._tmp = new THREE.Vector3();
    this._order = [];
  }

  addLamp(pos, dirX = 1) {
    this.lamps.push({
      pos: pos.clone(), dirX, on: true, d2: 0, weight: 0,
      pool: null, flare: null, glow: null, haze: null, poolMat: null,
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
    for (const lamp of this.lamps) {
      // balta de lumina, mulata pe bombamentul strazii
      const g = this._poolGeometry(lamp.pos);
      const mat = new THREE.MeshBasicMaterial({
        map: this.tex.pool, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.0, color: 0xffedd2, fog: true,
        toneMapped: true,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      lamp.pool = mesh;
      lamp.poolMat = mat;

      if (this.opts.flares) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.tex.glow, blending: THREE.AdditiveBlending, depthWrite: false,
          transparent: true, opacity: 0.9, fog: false, color: 0xfff0d2,
        }));
        glow.position.copy(lamp.pos);
        glow.scale.setScalar(1.1);
        glow.renderOrder = 6;
        this.group.add(glow);
        lamp.glow = glow;

        const fl = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.tex.flare, blending: THREE.AdditiveBlending, depthWrite: false,
          transparent: true, opacity: 0.55, fog: false, color: 0xffe9c0,
        }));
        fl.position.copy(lamp.pos);
        fl.scale.setScalar(3.2);
        fl.renderOrder = 7;
        this.group.add(fl);
        lamp.flare = fl;
      }

      if (this.opts.haze) {
        const gy = surfaceY(lamp.pos.x + lamp.dirX * 1.6, lamp.pos.z);
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
        hz.position.set(lamp.pos.x + lamp.dirX * 0.35, lamp.pos.y, lamp.pos.z);
        hz.renderOrder = 4;
        this.group.add(hz);
        lamp.haze = hz;
      }
    }
    return this;
  }

  _poolGeometry(pos) {
    const cx = pos.x + 3.4, cz = pos.z;
    const RX = 7.2, RZ = 16.0, N = 8;
    const g = new THREE.PlaneGeometry(RX * 2, RZ * 2, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      p.setY(i, surfaceY(x, z) + 0.016 - surfaceY(cx, cz));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    g.translate(cx, surfaceY(cx, cz), cz);
    return g;
  }

  setOn(on) {
    this.on = on;
    for (const lamp of this.lamps) lamp.on = on;
  }

  /** Reatribuie pool-ul de lumini reale celor mai apropiate lampi. */
  update(camPos, dt, masterOn = 1) {
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
      light.target.position.set(lamp.pos.x + lamp.dirX * 1.9,
        surfaceY(lamp.pos.x + lamp.dirX * 1.9, lamp.pos.z), lamp.pos.z);
      light.target.updateMatrixWorld();
      light.intensity = o.intensity * w;
    }
    for (let i = n; i < lamps.length; i++) lamps[this._order[i]].weight = 0;

    for (const lamp of lamps) {
      const d = Math.sqrt(lamp.d2);
      // baltile preiau exact cat lasa lumina reala (fara dubla contributie)
      const fade = smoothstep(260, 40, d);
      lamp.poolMat.opacity = masterOn * (0.40 + 0.40 * (1 - lamp.weight)) * fade;
      if (lamp.glow) {
        const vis = d < 300 && masterOn > 0.01;
        lamp.glow.visible = vis;
        lamp.flare.visible = vis;
        const near = smoothstep(4, 14, d);
        lamp.glow.material.opacity = masterOn * (0.75 + 0.25 * near);
        lamp.glow.scale.setScalar(clamp(0.9 + d * 0.016, 0.9, 3.4));
        lamp.flare.material.opacity = masterOn * clamp(0.30 + d * 0.004, 0.30, 0.62) * near;
        lamp.flare.scale.setScalar(clamp(1.6 + d * 0.026, 1.6, 6.0));
      }
      if (lamp.haze) {
        lamp.haze.material.uniforms.uIntensity.value = masterOn * 0.055 * smoothstep(70, 14, d);
        lamp.haze.visible = d < 90;
      }
      lamp.pool.visible = lamp.poolMat.opacity > 0.004;
    }
  }
}

/** Lumina ambientala de noapte: cer slab + o umplere rece dinspre zenit. */
export function nightAmbience(scene) {
  const hemi = new THREE.HemisphereLight(0x243358, 0x09090c, 0.125);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x2e3a58, 0.022);
  fill.position.set(-40, 80, 30);
  scene.add(fill);
  const moon = new THREE.DirectionalLight(0x8fa6d8, 0.0);
  moon.position.set(60, 90, -40);
  scene.add(moon);
  return { hemi, fill, moon };
}
