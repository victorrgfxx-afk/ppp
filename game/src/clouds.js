import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TEX } from './textures.js';

// Volumetric cumulus (V113). The fair-weather cumulus of the clear presets were a layer of 2D noise on a plane, lit by
// a step towards the sun. Here they are a volume marched through: the cloud layer from 1500 m over the street (the
// same deck the clouds' shadows are read from, lighting.js CLOUD_SH: the very same field of value noise, carried by the
// same wind - every cloud lies over its own shadow) up to 2.7 km, a cloud's top the higher the deeper inside the field
// (a dome over its core), its flat base at the condensation level, its billows eaten out of its edges by detail noise
// (Schneider, "The real-time volumetric cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015: a coverage field, a height
// profile, erosion by detail). Light: the sun's (the moon's by night) through four steps towards it, Beer-Lambert, with
// the multiple scattering of a thick cloud as octaves of lowered extinction and a flatter phase (Hillaire, "Physically
// based sky, atmosphere and cloud rendering in Frostbite", SIGGRAPH 2016; Wrenninge et al. 2013), a two-lobed
// Henyey-Greenstein phase (the bright, silver edges towards the sun) and the sky's light from above, the ground's from
// below; each step's light integrated over its length (energy kept: Hillaire 2016). Far ones sink into the haze.
//
// Drawn into a map of the sky (the upper hemisphere, equidistant azimuthal: the zenith in the middle, the horizon on the
// rim), a band of it a frame - the whole of it every BANDS frames, the clouds drifting a few metres meanwhile - and read
// by the sky's shader (sky.js), in every view and in the image-based light. A frame costs ~32 000 texels' marches. Each
// march starts at its own random depth along its step, another each time, and is blended into what the map held (a
// third of it): the grain of 56 steps averages out over a few passes.
export const CLOUD_BASE = 1500, CLOUD_TOP = 2700;
const SIZE = 1024, BANDS = 32;

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */`
uniform vec3 uCam, uLight, uLit, uDark, uHor;
uniform vec4 uSh;                 // lighting.js CLOUD_SH: x, y how far the wind has carried the field; z its level
uniform float uTime, uSeed, uHeight;
uniform sampler2D uNoise;
varying vec2 vUv;
// lighting.js cloudNoise, to the bit: the field the shadows are read from
float cHash( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
float cNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cHash( i ), cHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cHash( i + vec2( 0.0, 1.0 ) ), cHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float field( vec2 xz ) {
  vec2 p = ( xz - uSh.xy ) / 850.0;
  return 0.55 * cNoise( p ) + 0.3 * cNoise( p * 2.17 + 5.3 ) + 0.15 * cNoise( p * 4.93 + 11.1 );
}
// 3D detail from the sky's tiling 2D noise (textures.js: fbm bands), sliced in height: two slices, blended linearly
float slab( vec3 q, float k ) {
  float fy = floor( q.y ), ty = q.y - fy;
  vec2 o0 = fract( vec2( 0.371, 0.719 ) * fy ), o1 = fract( vec2( 0.371, 0.719 ) * ( fy + 1.0 ) );
  vec4 a = texture2D( uNoise, q.xz + o0 ), b = texture2D( uNoise, q.xz + o1 );
  return mix( mix( a.g, a.r, k ), mix( b.g, b.r, k ), ty );
}
// the density (0-1) at a point of the world, and how high in its cloud it is (0 its base, 1 its top). Over the field's
// every cloud a dome (its top 520 m over the base a field's step inside it, ~900 m over a deep core - times uHeight: lower
// on a clear day - sinking to nothing at its edge, where the shadows begin), the density full 120 m under the dome's
// surface and 30 m over the flat base; the surface pushed in and out by the detail in 100-200 m lumps (the
// cauliflower), more of it near the top
float dens( vec3 w, out float hf ) {
  hf = 0.0;
  float h = w.y - ${CLOUD_BASE.toFixed(1)};
  if ( h < 0.0 || h > ${(CLOUD_TOP - CLOUD_BASE).toFixed(1)} ) return 0.0;
  float c = ( field( w.xz ) - uSh.z ) / 0.11;           // how deep inside the field's cloud (0 at its edge)
  if ( c < -0.12 ) return 0.0;
  float dome = min( 1100.0, 520.0 * uHeight * sqrt( c + 0.12 ) );
  if ( h > dome + 70.0 ) return 0.0;
  hf = clamp( h / max( dome, 1.0 ), 0.0, 1.0 );
  float inside = clamp( ( dome - h ) / 120.0, -0.6, 1.0 ) * clamp( h / 30.0, 0.0, 1.0 );
  vec3 q = vec3( w.x - uSh.x * 1.15, h + uTime * 0.6, w.z - uSh.y * 1.15 );
  float det = 0.72 * slab( q * vec3( 1.0 / 2600.0, 1.0 / 110.0, 1.0 / 2600.0 ), 0.0 ) + 0.28 * slab( q * vec3( 1.0 / 1300.0, 1.0 / 60.0, 1.0 / 1300.0 ), 1.0 );
  return clamp( ( inside - ( det - 0.45 ) * ( 0.9 + 0.8 * hf ) ) * 1.7, 0.0, 1.0 );
}
float hg( float mu, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * mu, 1.5 ); }   // (x 4 pi: 1 is isotropic)
float rnd( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length( p );
  gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );           // (clear: nothing scattered, all let through)
  if ( r > 1.0 ) return;
  float th = r * 1.5707963;
  vec2 az = r > 1e-6 ? p / r : vec2( 0.0 );
  vec3 d = vec3( sin( th ) * az.x, cos( th ), sin( th ) * az.y );
  if ( d.y < 0.004 ) return;
  float t0 = max( 0.0, ( ${CLOUD_BASE.toFixed(1)} - uCam.y ) / d.y ), t1 = ( ${CLOUD_TOP.toFixed(1)} - uCam.y ) / d.y;
  t1 = min( t1, t0 + 26000.0 );
  if ( t1 <= t0 ) return;
  const int N = 56;
  float dt = ( t1 - t0 ) / float( N ), t = t0 + dt * rnd( gl_FragCoord.xy + uSeed * 97.31 );
  float mu = dot( d, uLight );
  float ph = mix( hg( mu, -0.2 ), hg( mu, 0.72 ), 0.45 ), ph2 = mix( 1.0, ph, 0.5 );
  vec3 sunC = max( uLit - uDark, vec3( 0.0 ) ), L = vec3( 0.0 );
  float T = 1.0, hf, hh;
  for ( int i = 0; i < N; i++ ) {
    vec3 w = uCam + d * t;
    float de = dens( w, hf );
    if ( de > 0.002 ) {
      float sig = de * 0.045;                           // extinction (1/m): a core's mean free path ~22 m
      float tau = 0.0, s = 0.0;
      for ( int k = 0; k < 4; k++ ) { float ds = 45.0 * exp2( float( k ) ); s += ds * 0.5; tau += dens( w + uLight * s, hh ) * 0.045 * ds; s += ds * 0.5; }
      // the sun's light at this point: single scattering, then two octaves of the multiple (Hillaire 2016)
      float sunT = exp( -tau ) * ph + 0.5 * exp( -tau * 0.4 ) * ph2 + 0.25 * exp( -tau * 0.16 );
      vec3 S = sunC * min( sunT, 7.0 ) * 0.6 + uDark * ( 0.55 + 0.6 * hf );
      float tr = exp( -sig * dt );
      L += T * S * ( 1.0 - tr );
      T *= tr;
      if ( T < 0.01 ) break;
    }
    t += dt;
  }
  // the air between: far clouds take the horizon's haze (~40 % at 20 km)
  float air = 1.0 - exp( -t0 / 38000.0 );
  L = mix( L, uHor * ( 1.0 - T ), air );
  gl_FragColor = vec4( L, T );
}`;

export class CloudVolume {
  constructor(sky, cloudSh) {
    this.sky = sky; this.sh = cloudSh;
    this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rt.texture.name = 'cloudVolume';
    const su = sky.material.uniforms;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { uCam: { value: new THREE.Vector3() }, uLight: { value: su.uSunDir.value }, uLit: { value: su.uCloudLit.value }, uDark: { value: su.uCloudDark.value },
        uHor: { value: su.uHorizon.value }, uSh: { value: new THREE.Vector4() }, uTime: su.uTime, uSeed: { value: 0 }, uHeight: { value: 1 }, uNoise: { value: TEX.noise } },
      // (blended into the map: ConstantAlpha of the new, the rest of the old - 1 for a whole new map)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ConstantAlphaFactor, blendDst: THREE.OneMinusConstantAlphaFactor,
    });
    this.material.blendAlpha = 1;
    this.quad = new FullScreenQuad(this.material);
    this.band = 0; this.ready = false;
    su.uVolMap.value = this.rt.texture;
  }
  // one band of the map (all of them: `all`), from where the eye is now; k: how much of it the new pass takes
  update(renderer, eye, all = false, k = all ? 1 : 0.34) {
    const u = this.material.uniforms, sh = this.sh;
    u.uCam.value.copy(eye); u.uSh.value.set(sh.x, sh.y, sh.z, sh.w);
    u.uSeed.value = (u.uSeed.value + 0.618034) % 1;
    // (a clear day's fair-weather cumulus are flat, humilis; with more of them, more convection: mediocris)
    u.uHeight.value = THREE.MathUtils.clamp(0.6 + 0.8 * (this.sky.material.uniforms.uCover.value - 0.25), 0.55, 1.1);
    this.material.blendAlpha = k;
    // (the whole map: still band by band - one draw over a million texels can outlast a weak GPU's watchdog)
    const rt = this.rt, h = SIZE / BANDS, prevTarget = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = false;
    rt.scissorTest = true;
    for (let i = 0; i < (all ? BANDS : 1); i++) {
      rt.scissor.set(0, this.band * h, SIZE, h); this.band = (this.band + 1) % BANDS;
      renderer.setRenderTarget(rt);
      this.quad.render(renderer);
    }
    rt.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = ac;
    if (all) this.ready = true;
  }
  dispose() { this.rt.dispose(); this.material.dispose(); this.quad.dispose(); }
}
