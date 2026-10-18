import * as THREE from 'three';

// The leaves' colour in autumn. The broadleaves turn one by one, each when its own time comes (the earliest a couple
// of weeks before the last), and patchily within a crown (the sunny outer twigs first). What they turn to depends on
// the genus: beech copper and orange-yellow, hornbeam and hazel clear yellow, oak late and only olive-brown, walnut and
// poplars yellow, black locust yellow-green, wild cherries and pears orange-red. The conifers keep their green.
// The colour change follows the green texel's brightness (so the light and shade within a crown stay); yellow leaves
// reflect ~2x the light of green ones (the chlorophyll that absorbed the red and blue is gone; carotenoids remain:
// leaf spectra, e.g. Gitelson & Merzlyak 1994), orange ~1.5x, browns about as much.
// SEASON.uAutumn: 0 the summer green; 0.5 mid-October in the Prahova Subcarpathians at 400-700 m (the user's drone
// photos of 18 Oct: about a quarter of the broadleaves in full colour, as many again turning, the rest olive or still
// green, the oaks the last). The game's day stays 26 September (its sun and its real full moon): the leaves are a setting.
export const SEASON = { uAutumn: { value: 0 } };
export const FOLIAGE = { toamna: 0.5, vara: 0 };

// per leaf material: two colours a tree picks between (sRGB hex, brightness over its green), how early it turns
const PAL = {
  leavesBeech: [[0xb07430, 1.45], [0xc0983a, 1.8], 1.0],
  leavesHornbeam: [[0xc8b03c, 2.0], [0xa88a3c, 1.6], 1.05],
  leavesOak: [[0x8c7a3c, 1.25], [0x96602e, 1.15], 0.7],
  leaves: [[0xccb444, 2.0], [0xa08838, 1.5], 1.1],
  leavesDark: [[0xa08838, 1.5], [0x8c7a3c, 1.25], 0.9],
  leavesSmall: [[0xd0b040, 2.1], [0xb8963a, 1.7], 1.15],
  leavesDense: [[0xb0602e, 1.35], [0xb4ae44, 1.7], 1.0],
  leavesPinnate: [[0xc8be50, 1.9], [0xa8aa48, 1.5], 0.85],
};
const LUM = new THREE.Vector3(0.2126, 0.7152, 0.0722);
// (a colour of unit luminance, linear, and the gain in w)
const hue = ([hex, gain]) => { const c = new THREE.Color(hex); const l = c.r * LUM.x + c.g * LUM.y + c.b * LUM.z; return new THREE.Vector4(c.r / l, c.g / l, c.b / l, gain); };

// the colour change in a compiled shader: after the texture and the instance colour; only where the texel is green
// (bark, twigs, the yellow leaves of the hand-placed autumn trees stay as they are)
export const AUTUMN_GLSL = `
  if (uAutumn > 0.0) {
    vec3 c = diffuseColor.rgb;
    float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float gr = smoothstep(0.02, 0.22, (c.g - max(c.r, c.b)) / max(c.g, 1e-4));
    float n = 0.5 + 0.25 * (sin(vAutP.x * 1.7 + vAutP.y * 0.9 + vAutK * 40.0) + sin(vAutP.z * 1.5 - vAutP.y * 1.2 + vAutK * 17.0));
    float s = uAutumn * uAutRate + (vAutK - 0.5) * 0.75 + (n - 0.5) * 0.45;
    vec4 A = fract(vAutK * 7.13) < 0.5 ? uAutA : uAutB;
    vec3 full = A.rgb * L * A.w;
    vec3 aut = mix(mix(c, mix(c, full, 0.25), smoothstep(0.25, 0.55, s)), full, smoothstep(0.55, 0.9, s));
    diffuseColor.rgb = mix(c, aut, gr);
  }`;

// patch a foliage material (its own shader patch, e.g. the wind, still runs first); key: the leaf material's name
export function autumnize(material, key) {
  const p = PAL[key];
  if (!p) return material;
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  const uni = { uAutumn: SEASON.uAutumn, uAutA: { value: hue(p[0]) }, uAutB: { value: hue(p[1]) }, uAutRate: { value: p[2] } };
  material.onBeforeCompile = (sh, r) => {
    prev?.call(material, sh, r);
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAutK;\nvarying vec3 vAutP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 tp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #ifdef USE_INSTANCING
    tp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
    vAutK = fract(sin(dot(floor(tp.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
    vAutP = position; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAutumn, uAutRate;\nuniform vec4 uAutA, uAutB;\nvarying float vAutK;\nvarying vec3 vAutP;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + AUTUMN_GLSL);
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey.call(material) : '') + '|aut';
  material.userData.autumn = key;
  return material;
}
