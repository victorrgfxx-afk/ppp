import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SNOW, RAIN, BLANKET_PARS } from './rain.js';

// Deep snow (V115): how far your feet go into it, and so where you stand - down through fresh powder, up on a drift the
// wind has packed hard. A boot (~30 kPa: 80 kg on a 29 x 10.5 cm sole) sinks until the snow under it is packed dense
// enough to bear it, ~400 kg/m3 (as dense as wind-packed snow, which bears a walker): a layer of snow of density rho
// goes down to rho / 400 of its depth. Fresh snow fallen in calm air, 50-70 kg/m3 (Paterson, The Physics of Glaciers,
// 1994), 30-100 a few hours old (Sommer, Lehning & Fierz, Frontiers in Earth Science 6, 2018), 100 by the rule of thumb
// of the classification (Fierz et al., The International Classification for Seasonal Snow on the Ground, UNESCO 2009) -
// 100 here: the boot goes three quarters of the way down, as the prints always did (snowtrail.js, rain.js trailDh).
// Settled snow, 200-300 (Paterson) - 250: 37 %. The wind breaks the flying crystals and packs them (ICSSG: 'wind
// packed', RGwp - "hardness increases with wind speed"; the thicker, denser wind slabs "usually found on lee slopes"):
// during a drift the surface is ~280 kg/m3 and still gives way (its hardness from 5 kPa), the day after ~380 and hard
// (from 148 kPa: Sugiura, Yang & Ohata, Rapid change of tundra snow hardness in Alaska, Annals of Glaciology 52(58),
// 2011) - you walk on it, and on the drifts the gale piled up (wind-packed snow 350-400: Paterson). New snow on top of
// an old, hard cover: only the new gives way.
// Where your feet go in more than ~30 cm your legs, then your hips, plough a trench as wide as you (snowtrail.js
// body): the snow takes your shape, its walls stand round you (and the camera never ends up inside it).
//
// The lying snow's shape is on the GPU (rain.js: RainOcclusion's field, the prints of snowtrail.js), so a small probe
// reads it there: 9 x 9 points 0.2 m apart round your feet, drawn with the very GLSL the blanket of snow is drawn with
// and read back without stalling (a fence, then the read a frame or two later).
export const RHO = { fresh: 100, settled: 250, drifting: 280, slab: 380, packed: 400, boot: 400 };   // kg/m3

const N = 9, SP = 0.2, H = (N - 1) / 2;
const VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */`
${BLANKET_PARS}
uniform vec4 uC;      // the grid's centre x, z, its spacing, the height its heights are given from
uniform vec4 uPack;   // the snowpack (SnowPack): the share of the depth fallen fresh, the old snow's density in the open and in the drifts, a boot's (kg/m3)
// (16 bits in two bytes: read back from an ordinary RGBA8 target, as every GPU can)
vec2 enc(float v) { float u = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5), hi = floor(u / 256.0); return vec2(hi, u - hi * 256.0) / 255.0; }
void main() {
  vec2 ij = floor(gl_FragCoord.xy);
  float blk = floor(ij.y / ${N}.0);
  vec2 xz = uC.xy + (vec2(ij.x, ij.y - blk * ${N}.0) - ${H.toFixed(1)}) * uC.z;
  float d0, b = snowBase(xz, d0);
  // a drift: where the wind laid more than ~1.2x the cover (the field's shape: rain.js BAKE_FRAG)
  vec2 uv = vec2(0.5 + (xz.x - uOccBox.x) / (2.0 * uOccBox.z), 0.5 - (xz.y - uOccBox.y) / (2.0 * uOccBox.z));
  float rho = mix(uPack.y, uPack.z, smoothstep(1.2, 1.9, fieldCubic(uv).g));
  // how far a boot goes in (the fresh layer down to ${RHO.fresh} / ${RHO.boot} of it, the old one to rho / ${RHO.boot}; a print at least)
  float sink = d0 * (uPack.x * (1.0 - ${RHO.fresh.toFixed(1)} / uPack.w) + (1.0 - uPack.x) * max(0.0, 1.0 - rho / uPack.w));
  sink = max(sink, min(d0, 0.015));
  float top = b + d0 + trailDh(xz, d0);
  // where you stand: down through what gives way, or on the floor of a print or a track that went deeper
  float sup = min(b + d0 - sink, top);
  gl_FragColor = blk < 0.5 ? vec4(enc((sup - uC.w + 8.0) / 16.0), enc((top - uC.w + 8.0) / 16.0))
               : blk < 1.5 ? vec4(enc(d0 / 4.0), enc(sink / 4.0)) : vec4(enc((b - uC.w + 8.0) / 16.0), 0.0, 1.0);
}`;

export class SnowProbe {
  constructor(pack) {
    this.rt = new THREE.WebGLRenderTarget(N, 3 * N, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rt.texture.name = 'snowProbe';
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { uSnowField: SNOW.uSnowField, uTrail: SNOW.uTrail, uOccBox: RAIN.uOccBox, uSnowCar: SNOW.uSnowCar, uTrailBox: SNOW.uTrailBox, uSnowFine: SNOW.uSnowFine,
        uSnowCarSize: SNOW.uSnowCarSize, uSnowDepth: SNOW.uSnowDepth, uC: { value: new THREE.Vector4() }, uPack: { value: pack.u } } });
    this.quad = new FullScreenQuad(this.mat);
    this.buf = new Uint8Array(N * 3 * N * 4);
    const f = () => new Float32Array(N * N);
    this.v = { sup: f(), top: f(), d0: f(), sink: f(), base: f() };
    this.cx = 0; this.cz = 0;
    this.valid = false; this.busy = false; this.gen = 0;
  }
  // a new read round (x, z), its heights given from y - unless the last one is not in yet
  request(renderer, x, z, y) {
    if (this.busy) return;
    this.mat.uniforms.uC.value.set(x, z, SP, y);
    const rt0 = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
    renderer.setRenderTarget(rt0);
    this.busy = true;
    const gen = this.gen;
    renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, N, 3 * N, this.buf).then(() => {
      this.busy = false;
      if (gen !== this.gen) return;                        // (switched off meanwhile)
      const b = this.buf, v = this.v, dec = (k) => (b[k] * 256 + b[k + 1]) / 65535;
      for (let k = 0; k < N * N; k++) {
        const a = k * 4, c = (k + N * N) * 4, e = (k + 2 * N * N) * 4;
        v.sup[k] = dec(a) * 16 - 8 + y; v.top[k] = dec(a + 2) * 16 - 8 + y;
        v.d0[k] = dec(c) * 4; v.sink[k] = dec(c + 2) * 4;
        v.base[k] = dec(e) * 16 - 8 + y;
      }
      this.cx = x; this.cz = z; this.valid = true;
    }, () => { this.busy = false; });
  }
  off() { if (this.valid || this.busy) this.gen++; this.valid = false; }
  // the snow at (x, z), from the last read (null off its grid): where you stand in it (support), its surface (top),
  // how deep it lay (d0) and how far a boot goes in (sink) before anyone walked there, the surface it lies on (base)
  at(x, z, out = {}) {
    if (!this.valid) return null;
    const gx = (x - this.cx) / SP + H, gz = (z - this.cz) / SP + H;
    if (!(gx >= 0 && gz >= 0 && gx <= N - 1 && gz <= N - 1)) return null;
    const i = Math.min(N - 2, Math.floor(gx)), j = Math.min(N - 2, Math.floor(gz)), fx = gx - i, fz = gz - j, k = j * N + i;
    const bl = (a) => (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fz) + (a[k + N] * (1 - fx) + a[k + N + 1] * fx) * fz;
    const v = this.v;
    out.support = bl(v.sup); out.top = bl(v.top); out.d0 = bl(v.d0); out.sink = bl(v.sink); out.base = bl(v.base);
    return out;
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}

// The state of the snow lying round (one for the whole street, as the depth): how much of it fell fresh in calm air
// (on top), and the density of the rest - in the open, and in the drifts. A calm fall lays powder; a gale packs what
// lies and lays its own wind slab, hard once it stops (time-lapse, as the snowfall: main.js); fresh snow settles.
export class SnowPack {
  constructor() {
    this.fresh = 0; this.open = RHO.settled; this.drift = RHO.settled; this.wind = 0; this.depth = 0;
    this.u = new THREE.Vector4(0, RHO.settled, RHO.settled, RHO.boot);
  }
  // a game started in the snow: falling in calm air (all of it fresh), a blizzard blowing (wind-packed), or the clear
  // day after (settled; the drifts wind slab - the wind laid them)
  start(kind, depth) {
    this.depth = depth;
    this.fresh = kind === 'fall' ? depth : 0;
    this.wind = kind === 'gale' ? 1 : kind === 'cover' ? 0.85 : 0;
    this.open = this.targetOpen(kind === 'gale'); this.drift = this.targetDrift(kind === 'gale');
    this.sync();
  }
  targetOpen(storm) { return storm ? RHO.drifting : RHO.settled + (RHO.slab - RHO.settled) * THREE.MathUtils.smoothstep(this.wind, 0.9, 1); }
  targetDrift(storm) { const o = this.targetOpen(storm); return storm ? 350 : o + (RHO.packed - o) * THREE.MathUtils.smoothstep(this.wind, 0.3, 0.8); }
  // falling: it snows; gale: how hard a blizzard blows (0..1)
  update(dt, depth, falling, gale) {
    if (depth < 0.01) { this.fresh = 0; this.wind = 0; this.open = this.drift = RHO.settled; this.depth = depth; this.sync(); return; }
    // (snow where there was none: as a game started in it - a fall, a blizzard, or the clear day after's cover)
    if (this.depth < 0.01) { this.start(gale > 0.3 ? 'gale' : falling ? 'fall' : 'cover', depth); return; }
    const dd = depth - this.depth;
    this.depth = depth;
    if (dd > 0 && falling && gale < 0.3) this.fresh += dd;                  // a calm fall: powder on top
    else if (dd < 0) this.fresh += dd;                                     // (melting: the top first)
    this.fresh = THREE.MathUtils.clamp(this.fresh, 0, depth);
    if (gale > 0.05) {
      this.fresh *= Math.exp(-dt * gale / 20);                              // the gale breaks and packs the new crystals (~20 s)
      this.wind = Math.min(1, this.wind + dt * gale / 30);
    } else if (!falling) this.fresh *= Math.exp(-dt / 300);                 // the fresh snow settles (~5 min)
    const storm = gale > 0.3, k = 1 - Math.exp(-dt / (storm ? 30 : 90));    // (packed in ~30 s; hard ~1.5 min after it stops)
    this.open += (this.targetOpen(storm) - this.open) * k;
    this.drift += (this.targetDrift(storm) - this.drift) * k;
    this.sync();
  }
  sync() { this.u.set(this.depth > 0 ? this.fresh / this.depth : 0, this.open, this.drift, RHO.boot); }
  // in words (the HUD)
  get label() { return this.u.x > 0.5 ? 'pufoasă' : this.u.x > 0.15 ? 'proaspătă peste strat vechi' : this.open > 330 ? 'întărită de vânt' : this.open > 265 ? 'bătută de vânt' : 'așezată'; }
}
