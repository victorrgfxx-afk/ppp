/* Dust kicked up by tyres on the loose surfaces, plus the odd gravel chip.
   One THREE.Points draw call with a pooled attribute buffer — cheap enough to
   leave on at every quality level. */
import * as THREE from 'three';

function dustSprite(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DustSystem {
  constructor(scene, { max = 220 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, max);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uMap: { value: dustSprite() }, uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute vec3 aTint;
        varying float vAlpha; varying vec3 vTint;
        uniform float uScale;
        void main(){
          vAlpha = aAlpha; vTint = aTint;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vAlpha; varying vec3 vTint;
        void main(){
          if (vAlpha <= 0.001) discard;
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vTint, t.a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.geo = geo;
    this._dirty = false;
  }

  /** @param {THREE.Vector3} p  @param {THREE.Vector3} v  base velocity */
  spawn(p, v, { size = 0.5, life = 1.1, color = [0.72, 0.66, 0.54], spread = 1.2 } = {}) {
    const i = this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x + (Math.random() - 0.5) * spread;
    this.vel[i3 + 1] = v.y + Math.random() * 0.9;
    this.vel[i3 + 2] = v.z + (Math.random() - 0.5) * spread;
    this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
    this.size[i] = size * (0.65 + Math.random() * 0.8);
    this.alpha[i] = 0.0001;
    this.tint[i3] = color[0]; this.tint[i3 + 1] = color[1]; this.tint[i3 + 2] = color[2];
    this._dirty = true;
  }

  update(dt, wind) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
      any = true;
      const i3 = i * 3;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i3] += (wind.x * 1.4 - this.vel[i3]) * dt * 0.9;
      this.vel[i3 + 2] += (wind.y * 1.4 - this.vel[i3 + 2]) * dt * 0.9;
      this.vel[i3 + 1] -= dt * 0.55;                       // settles back down
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] = Math.max(0.03, this.pos[i3 + 1] + this.vel[i3 + 1] * dt);
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] += dt * 1.15;                            // puffs expand
      this.alpha[i] = Math.sin(Math.PI * t) * 0.42;
    }
    if (any || this._dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aTint.needsUpdate = true;
      this._dirty = false;
    }
  }

  dispose() { this.geo.dispose(); this.points.material.dispose(); }
}

/** Colours per surface, so dust off the concrete pad is grey and the yard warm. */
export const DUST_COLOURS = {
  gravel: [0.74, 0.67, 0.53],
  dirt: [0.56, 0.45, 0.33],
  grass: [0.42, 0.44, 0.26],
  concrete: [0.66, 0.66, 0.64],
  asphalt: [0.4, 0.4, 0.41],
};
