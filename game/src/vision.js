import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { EYE } from './eye.js';

// How the eye sees in the dark. Below ~5 cd/m2 the cones give way to the rods, which see no colour: by moonlight
// (~0.25 lux: grass ~0.01 cd/m2) the world is a blue-grey, reds go black and blues and greens stay lightest (the
// Purkinje shift); under a street lamp (~1-2 cd/m2 on the road) colour is only partly there; where the torch or a
// lamp lights it close, fully. Per pixel, on the scene's linear light before the tone curve:
//  * its luminance in cd/m2: the frame's light times uAbs (cd/m2 per unit of the scene: main.js, from the key light:
//    the moon's 0.05 is ~0.25 lux, the sun's ~3.8 ~100 000 lux);
//  * the rods' share s (CIE 191:2010 mesopic range, 0.005-5 cd/m2: 1 below, 0 above, linear in log L between);
//  * the rods' luminance from CIE XYZ, V = Y (1.33 (1 + (Y + Z) / X) - 1.68) (Larson, Rushmeier & Piatko 1997;
//    Jensen et al. 2000), scaled so a neutral grey keeps its luminance;
//  * shown as a grey shifted a third of the way to the blue of rod vision, chromaticity (0.25, 0.25) (Thompson,
//    Shirley & Ferwerda 2002): (0.9, 0.99, 1.32) in linear sRGB, luminance kept (half way read as a film's blue night).
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
// (V101) And the eye adapts: at night the frame is scaled by (L_ref / L_a)^0.3, within 0.55-1.6, L_a the luminance the
// eye is adapted to - the log-mean round the centre of the view, where one looks (eye.js keeps it, smoothed: the
// pupil and the retina's fast part, in ~0.3 s brighter, ~1.5 s darker) - and L_ref the one the night's exposure was set
// for (moonlight on the street). Looking from the dark into a lamp-lit snowy street the picture comes down by up to
// ~1 stop (and the lamps' glare with it), into a dark wood it opens up a little: as an eye, not a fixed camera.
const FRAG = /* glsl */`
uniform sampler2D tDiffuse, tProbe;
uniform float uAbs, uRef, uAdapt, uProbeW;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 L = max(c.rgb, vec3(0.0));
  float X = dot(L, vec3(0.4124, 0.3576, 0.1805)), Y = dot(L, vec3(0.2126, 0.7152, 0.0722)), Z = dot(L, vec3(0.0193, 0.1192, 0.9505));
  float s = clamp((0.699 - log2(max(Y * uAbs, 1e-6)) * 0.30103) / 3.0, 0.0, 1.0);
  float V = Y * (1.33 * (1.0 + (Y + Z) / max(X, 1e-6)) - 1.68) / 2.573;
  float La = texture2D(tProbe, vec2(0.5 / uProbeW, 0.5)).b;
  float k = uAdapt > 0.0 && La > 0.0 ? clamp(pow(uRef / La, uAdapt), 0.55, 1.6) : 1.0;
  gl_FragColor = vec4(mix(L, max(V, 0.0) * vec3(0.9, 0.99, 1.32), s) * k, c.a);
}`;

export class VisionPass extends Pass {
  constructor() {
    super();
    this.mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uAbs: { value: 1e5 }, tProbe: EYE.probe, uProbeW: EYE.probeW, uRef: { value: 0.03 }, uAdapt: { value: 0.3 } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    this.abs = 1e5;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture; this.mat.uniforms.uAbs.value = this.abs;
    this.mat.uniforms.uRef.value = this.abs * 0.058;                 // (cd/m2: the night's exposure is set for ~0.03)
    this.mat.uniforms.uAdapt.value = EYE.probe.value ? 0.3 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}
