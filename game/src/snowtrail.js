import * as THREE from 'three';
import { SNOW } from './rain.js';

// Footprints and tyre tracks in the snow: a map laid on the ground around you (±24 m, 2.3 cm a texel on high) of how
// much of the snow's depth has been pressed out (R), the rim pushed up around the prints (G) and the tread on their
// floor (B), stamped with every step (yours and the villager's) and every turn of the wheels of the car you drive.
// The lying snow (rain.js: the blanket and the cover) sinks by it. While it snows the prints fill in again (in a few
// minutes; in a blizzard the drift fills them in about a minute). It follows you in steps of 64 texels, keeping what
// it holds.
const STAMP_VERT = /* glsl */`
attribute vec2 corner;
attribute vec4 aP;          // centre x, z, heading, kind (0 a boot, 1 a tyre's track, 2 a drag or a car's belly)
attribute vec4 aS;          // half width, half length (a track: of its segment), how hard it presses (0..1), its rim
attribute float aT;         // a track: how far its wheel had rolled at the segment's start (m: the tread stays put)
uniform vec4 uBox;          // centre x, z, half size
varying vec2 vL;
varying vec4 vS;
varying float vK, vT;
void main() {
  vec2 ext = (aP.w > 0.5 ? vec2(aS.x, aS.y + aS.x) : aS.xy) + 0.13;      // (room for the rim)
  vL = corner * ext;
  // local x across, y forward (the heading's forward is -sin h, -cos h in world x, z)
  float c = cos(aP.z), s = sin(aP.z);
  vec2 w = aP.xy + vec2(c * vL.x - s * vL.y, -s * vL.x - c * vL.y);
  vS = aS; vK = aP.w; vT = aT + aS.y;
  gl_Position = vec4((w.x - uBox.x) / uBox.z, -(w.y - uBox.y) / uBox.z, 0.0, 1.0);
}`;
const STAMP_FRAG = /* glsl */`
varying vec2 vL;
varying vec4 vS;
varying float vK, vT;
float sdEllipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }     // (near enough so close)
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
void main() {
  float d, tread = 0.0;
  if (vK < 0.5) {
    // a boot (a 29 x 10.5 cm sole): the ball and toes, the waist, the heel; the lugs of its tread across it
    vec2 p = vL * vec2(0.055 / vS.x, 0.145 / vS.y);
    d = smin(sdEllipse(p - vec2(0.0, 0.035), vec2(0.052, 0.105)), sdEllipse(p - vec2(0.0, -0.09), vec2(0.042, 0.055)), 0.03);
    tread = step(0.5, fract(p.y * 22.0 + 0.3 * sin(p.x * 70.0)));
  } else {
    // a track: a capsule along the segment; a tyre's blocks across it, where the wheel rolled
    d = length(vec2(vL.x, max(abs(vL.y) - vS.y, 0.0))) - vS.x;
    if (vK < 1.5) tread = step(0.5, fract((vT + vL.y) * 9.0 + abs(vL.x) * 7.0));
  }
  // its walls: fresh snow crumbles in a little (and the fine blanket's 3.3 cm vertices draw a steeper one jagged);
  // the rim pushed up round it, highest ~3 cm out, gone by ~11 cm
  float press = vS.z * (1.0 - smoothstep(-0.045, 0.02, d));
  float rim = vS.w * smoothstep(-0.015, 0.03, d) * (1.0 - smoothstep(0.03, 0.11, d));
  gl_FragColor = vec4(press, rim, tread * press * smoothstep(-0.01, -0.03, d), 0.0);
}`;
const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// moving with you: the old map shifted by whole texels (sampled at texel centres: exact)
const SHIFT_FRAG = /* glsl */`
uniform sampler2D uOld;
uniform vec2 uShift, uSize;
void main() {
  vec2 px = gl_FragCoord.xy + uShift;
  gl_FragColor = all(greaterThan(px, vec2(0.0))) && all(lessThan(px, uSize)) ? texture2D(uOld, px / uSize) : vec4(0.0);
}`;
// filling in: the map multiplied by k (blended: dst * src)
const FILL_FRAG = /* glsl */`
uniform float uK;
void main() { gl_FragColor = vec4(uK); }`;

const MAX = 512;
const _c = new THREE.Color();
export class SnowTrail {
  // size: texels along a side; half: metres from the centre to an edge
  constructor(size = 2048, half = 24) {
    this.size = size; this.half = half; this.texel = 2 * half / size;
    const rt = () => new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false });
    this.rts = [rt(), rt()]; this.cur = 0;
    this.box = SNOW.uTrailBox.value;
    this.box.set(0, 0, half, 0);
    SNOW.uTrail.value = this.rts[0].texture;
    // the stamps: one instanced quad each
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aT = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aS', this.aS); g.setAttribute('aT', this.aT);
    g.instanceCount = 0;
    this.stampGeo = g;
    const scene = (mat, geo = new THREE.PlaneGeometry(2, 2)) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; const sc = new THREE.Scene(); sc.add(m); return sc; };
    this.stampMat = new THREE.ShaderMaterial({ vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG, uniforms: { uBox: { value: this.box } },
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.stampScene = scene(this.stampMat, g);
    this.shiftMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: SHIFT_FRAG, uniforms: { uOld: { value: null }, uShift: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(size, size) } }, depthTest: false, depthWrite: false });
    this.shiftScene = scene(this.shiftMat);
    this.fillMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: FILL_FRAG, uniforms: { uK: { value: 1 } },
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, depthTest: false, depthWrite: false });
    this.fillScene = scene(this.fillMat);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.n = 0;
    this.fillT = 0;
    this.on = false; this.dirty = true;
    this.feet = { '-1': null, 1: null };          // your last print of each foot
    this.wheels = new Map();                       // a car's wheels: where they were, how far they rolled
  }

  // a stamp: centre, heading, kind; half width, half length, press, rim; t: a track's rolled distance
  add(x, z, h, kind, hw, hl, press, rim, t = 0) {
    if (!this.on || this.n >= MAX) return;
    if (Math.abs(x - this.box.x) > this.half + 1 || Math.abs(z - this.box.y) > this.half + 1) return;
    const i = this.n++;
    this.aP.array.set([x, z, h, kind], i * 4); this.aS.array.set([hw, hl, press, rim], i * 4); this.aT.array[i] = t;
  }
  // a segment of a track from (x0, z0) to (x1, z1)
  segment(x0, z0, x1, z1, kind, hw, press, rim, t = 0) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 1e-4) return;
    this.add((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-dx, -dz), kind, hw, L / 2, press, rim, t);
  }

  // a step: where the body is, which way it faces, which foot (-1 left, 1 right), running, how deep the snow lies
  // (feet: whose last prints, yours by default). The foot lands ~12 cm ahead and 10 cm to its side, toes a little out;
  // in snow over ~20 cm the toes drag a furrow into each print.
  step(pos, yaw, foot, run, depth, feet = this.feet) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const x = pos.x + rx * 0.1 * foot + fx * 0.12, z = pos.z + rz * 0.1 * foot + fz * 0.12;
    this.add(x, z, yaw - foot * 0.08, 0, 0.055, run ? 0.16 : 0.145, 1, run ? 1 : 0.8);
    const prev = feet[foot];
    if (prev && depth > 0.2) {
      const L = Math.hypot(x - prev.x, z - prev.z);
      // (the toe ploughs through it on the way down: the last ~40% of the stride)
      if (L > 0.2 && L < 2.2) this.segment(prev.x + (x - prev.x) * 0.6, prev.z + (z - prev.z) * 0.6, x, z, 2, 0.04, 0.32 * Math.min(1, (depth - 0.2) / 0.2), 0.25);
    }
    feet[foot] = { x, z };
  }
  // landing from a jump: both feet
  land(pos, yaw) { this.step(pos, yaw, -1, false, 0); this.step(pos, yaw, 1, false, 0); }

  // the car you drive (Vehicle): the four tyres roll their tracks; in snow deeper than its clearance (~17 cm) the
  // belly ploughs a trench between them
  car(v, depth) {
    const m = v.m, s = Math.sin(v.h), c = Math.cos(v.h);
    const hw = m.W / 2 - 0.15, zf = m.axles[0] - m.L / 2, zr = m.axles[1] - m.L / 2;
    let w = this.wheels.get(v);
    if (!w) { w = { p: [], t: [0, 0, 0, 0], cx: v.x, cz: v.z }; this.wheels.set(v, w); }
    let k = 0;
    for (const [lx, lz] of [[-hw, zf], [hw, zf], [-hw, zr], [hw, zr]]) {
      const x = v.x + lx * c + lz * s, z = v.z - lx * s + lz * c, p = w.p[k];
      if (p) {
        const L = Math.hypot(x - p.x, z - p.z);
        if (L > 0.02 && L < 3) { this.segment(p.x, p.z, x, z, 1, m.tireW / 2, 1, 1, w.t[k]); w.t[k] += L; }
        if (L > 0.02) w.p[k] = { x, z };
      } else w.p[k] = { x, z };
      k++;
    }
    const L = Math.hypot(v.x - w.cx, v.z - w.cz);
    if (L > 0.05) {
      if (L < 3 && depth > 0.17) this.segment(w.cx, w.cz, v.x, v.z, 2, m.W / 2 - 0.12, Math.min(1, (depth - 0.17) / (0.75 * depth)), 0.6);
      w.cx = v.x; w.cz = v.z;
    }
  }

  // each frame: on while there is snow; it follows the camera, fills in while it snows (fill: per second), and takes
  // this frame's stamps
  update(renderer, camPos, dt, fill) {
    const snow = SNOW.uSnow.value > 0.01;
    if (!snow) {
      if (this.on) { this.on = false; this.box.w = 0; this.dirty = true; this.feet = { '-1': null, 1: null }; this.wheels.clear(); }
      this.n = 0;
      return;
    }
    const rt0 = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.getClearColor(_c); const ca = renderer.getClearAlpha();
    const step = this.texel * 64;
    if (this.dirty) {
      // a fresh map, centred on you
      this.box.x = Math.round(camPos.x / step) * step; this.box.y = Math.round(camPos.z / step) * step;
      renderer.setClearColor(0x000000, 0);
      for (const r of this.rts) { renderer.setRenderTarget(r); renderer.clear(true, false, false); }
      renderer.setClearColor(_c, ca);
      this.dirty = false;
    } else if (Math.abs(camPos.x - this.box.x) > 6 || Math.abs(camPos.z - this.box.y) > 6) {
      const nx = Math.round(camPos.x / step) * step, nz = Math.round(camPos.z / step) * step;
      this.shiftMat.uniforms.uOld.value = this.rts[this.cur].texture;
      this.shiftMat.uniforms.uShift.value.set(Math.round((nx - this.box.x) / this.texel), Math.round((this.box.y - nz) / this.texel));
      this.cur ^= 1;
      renderer.setRenderTarget(this.rts[this.cur]);
      renderer.render(this.shiftScene, this.cam);
      this.box.x = nx; this.box.y = nz;
      SNOW.uTrail.value = this.rts[this.cur].texture;
    }
    this.on = true; this.box.w = 1;
    renderer.setRenderTarget(this.rts[this.cur]);
    // filling in (in half-second steps)
    this.fillT += dt;
    if (this.fillT > 0.5) {
      if (fill > 0) { this.fillMat.uniforms.uK.value = Math.exp(-fill * this.fillT); renderer.render(this.fillScene, this.cam); }
      this.fillT = 0;
    }
    if (this.n) {
      this.aP.needsUpdate = this.aS.needsUpdate = this.aT.needsUpdate = true;
      this.stampGeo.instanceCount = this.n;
      renderer.render(this.stampScene, this.cam);
      this.n = 0;
    }
    renderer.setRenderTarget(rt0);
    renderer.autoClear = ac;
  }
}
