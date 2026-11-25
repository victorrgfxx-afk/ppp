import * as THREE from 'three';

// (V120) The commune's electricity: what the levers of the transformer station in the wood on the hill of the cross set
// (geo/releu.js, main.js), what the houses' windows and the street lamps read.
//
// A village's low-voltage network (0.4 kV, TN-C) leaves its transformer station (PTA 20/0.4 kV) on three phases and the
// neutral; a house is fed single-phase (230 V, under 11 kVA) from one of them, the houses of a street spread over the
// three by the distributor - so with one phase off a third of the houses go dark, here and there along every street.
// The street lamps have a circuit of their own (BMPT-IP: the public lighting's block, fed from a feeder of the
// station's box, switched by a photocell or a clock - ST 35-JT 2024, 4.1 c), off with the station's main switch too.
//
// uPower: x, y, z = phases L1, L2, L3 (1 on, 0 off), w = the main switch (the box's 3-pole breaker); ip = the public
// lighting. uWin: x = how dark it is out (0 by day .. 1 at night), y = how many are still up (the hour: most windows lit
// in the evening, few after midnight, some again before dawn).
export const POWER = {
  uPower: { value: new THREE.Vector4(1, 1, 1, 1) },
  uWin: { value: new THREE.Vector2(0, 1) },
  ip: 1,
  // the commune's lamps lit (main switch and the lighting's circuit both on): main.js, lamps.js
  get lamps() { return this.uPower.value.w > 0.5 && this.ip > 0.5; },
};

// how many of those at home have a light on at a given hour (0-24): a share of the evening's peak. Shaped after the
// daily load curve of homes (the evening peak about 19-22 h, the trough at 2-5 h, a small rise before dawn)
export function awake(h) {
  const K = [[0, 0.38], [1, 0.2], [2, 0.12], [4, 0.1], [5, 0.22], [6, 0.48], [7, 0.4], [9, 0.25], [16, 0.35], [17, 0.62], [19, 0.95], [21, 1], [22, 0.88], [23, 0.62], [24, 0.38]];
  h = ((h % 24) + 24) % 24;
  for (let i = 1; i < K.length; i++) if (h <= K[i][0]) { const [h0, a] = K[i - 1], [h1, b] = K[i], t = (h - h0) / (h1 - h0); return a + (b - a) * t; }
  return K[0][1];
}

// The hand-built street's windows (world.js, hero.js: the glass behind which the curtain or the blinds hang): lit at
// night as the map's houses are (geo/buildings.js), the lit ones picked by a hash of where they are - a house ~9 m
// across, its phase, each window ~1.4 m wide and a floor high.
const HAND_V = 'varying vec3 vWinW;';
const HAND_F = 'uniform vec4 uPower;\nuniform vec2 uWin;\nvarying vec3 vWinW;';
const HAND_EMIT = `
  {
    vec2 hc = floor(vWinW.xz / 9.0);
    float hh = fract(sin(dot(hc, vec2(127.1, 311.7))) * 43758.5453), ph = floor(fract(hh * 7.13) * 3.0);
    float on = uPower.w * (ph < 0.5 ? uPower.x : ph < 1.5 ? uPower.y : uPower.z);
    float wh = fract(sin(dot(floor(vWinW / vec3(1.4, 2.8, 1.4)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float lit = on * step(hh, 0.82) * step(wh, 0.6 * uWin.y) * uWin.x;
    vec3 wcol = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.84, 0.64), step(0.75, fract(wh * 7.13)));
    totalEmissiveRadiance += wcol * diffuseColor.rgb * lit * (1.2 + 1.2 * fract(wh * 3.7));
  }`;
export function handWindows(m) {
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uPower = POWER.uPower; sh.uniforms.uWin = POWER.uWin;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HAND_V)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWinW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HAND_F)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + HAND_EMIT);
  };
  m.customProgramCacheKey = () => key0 + '|handWin';
  return m;
}
