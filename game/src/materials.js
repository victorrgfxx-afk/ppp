import * as THREE from 'three';
import { TEX } from './textures.js';
import { WIND } from './util.js';
import { autumnize } from './season.js';

export const M = {};

// The bark's shading: moss and green algae (Pleurococcus on the smooth barks, the mosses at the stem's foot) on the north side -
// the shaded, damper one (compass north in the game's frame) - up to ~1-3 m, all round the foot, in the bark's hollows
// first. The height is the vertex's own (an instanced tree's frame: its foot at 0). k: how much the species carries
// (beech and hornbeam the most green, the oak's fissures mossy, black locust and birch little).
const NORTH = '0.6693, 0.7429';
export function mossy(m, k) {
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMossN;\nvarying float vMossH;')
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
  { vec3 mn = objectNormal;
  #ifdef USE_INSTANCING
    mn = mat3(instanceMatrix) * mn;
  #endif
    vMossN = normalize(mat3(modelMatrix) * mn); vMossH = position.y; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vMossN;
varying float vMossH;
float mossHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mossNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mossHash(i), mossHash(i + vec2(1.0, 0.0)), f.x), mix(mossHash(i + vec2(0.0, 1.0)), mossHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float mossK = 0.0;
  {
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec2 hn = vMossN.xz; float north = dot(hn, vec2(${NORTH})) / max(length(hn), 1e-3);
    float side = smoothstep(-0.25, 0.9, north) * smoothstep(-0.7, 0.1, vMossN.y);
    float foot = 1.0 - smoothstep(0.1, 0.7 + 1.6 * side, vMossH);
    float amt = (foot * (0.4 + 0.6 * side) + side * 0.4 * (1.0 - smoothstep(1.5, 5.0, vMossH))) * ${k.toFixed(2)};
    float n = 0.6 * mossNoise(vMapUv * vec2(7.0, 3.0)) + 0.4 * mossNoise(vMapUv * vec2(23.0, 11.0));
    mossK = clamp(amt * 1.6 - 0.25, 0.0, 1.0) * smoothstep(0.3, 0.7, n + (0.45 - lum) * 0.9);
    // (green algae light and yellowish, moss darker and deeper green; down in a furrow as shaded as the furrow itself:
    // the bark map's own darkening there is its depth, not its colour)
    vec3 moss = mix(vec3(0.16, 0.2, 0.06), vec3(0.06, 0.1, 0.03), smoothstep(0.4, 0.8, foot)) * clamp(lum / 0.12, 0.25, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, moss * (0.85 + 0.3 * n), mossK * 0.9);
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 1.0, mossK);')
      // under the crown: the stem sees less of the sky (its own crown and the neighbours' over it), least at its foot -
      // its light from the sky and the surroundings ~75 % there, ~95 % at 15 m (the sun's own light comes through the
      // shadow maps; the floor round it keeps all of its own: lower, the stems came out darker than the litter)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  { float skyK = mix(0.75, 0.95, smoothstep(0.0, 15.0, vMossH));
    reflectedLight.indirectDiffuse *= skyK; reflectedLight.indirectSpecular *= skyK; }`);
  };
  m.customProgramCacheKey = () => key0 + '|moss' + k;
  m.needsUpdate = true;
  return m;
}

function std(name, o) {
  const m = new THREE.MeshStandardMaterial(o);
  m.name = name;
  M[name] = m;
  return m;
}

// Adds a gentle wind sway to foliage (vertex shader), strength by height above object base.
export function addWind(material, amp = 0.08, freq = 1.3) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.time;
    shader.uniforms.uWind = WIND.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #endif
          float h = max(0.0, position.y);
          float ph = wp.x * 0.35 + wp.z * 0.27;
          float s = sin(uTime * ${freq.toFixed(2)} + ph) * 0.6 + sin(uTime * ${(freq * 2.7).toFixed(2)} + ph * 1.7) * 0.25;
          float gust = 0.6 + 0.4 * sin(uTime * 0.23 + wp.x * 0.02);
          transformed.x += s * ${amp.toFixed(3)} * h * uWind * gust;
          transformed.z += cos(uTime * ${(freq * 0.8).toFixed(2)} + ph) * ${(amp * 0.6).toFixed(3)} * h * uWind * gust;
        }`);
    // (a negative alpha in the scene buffer marks what sways: the anti-aliasing, taa.js, keeps less of its past there -
    // it moves with no motion the reprojection knows of; the passes reading the alpha take its magnitude)
    // (only in the frame's scene pass: WIND.mark; an impostor baked from these leaves must keep its alpha)
    shader.uniforms.uSwayMark = WIND.mark;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uSwayMark;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef OPAQUE\n  if (uSwayMark > 0.5) gl_FragColor.a = -abs(gl_FragColor.a);\n#endif');
  };
  material.customProgramCacheKey = () => 'wind' + amp + freq;
  return material;
}

export function buildMaterials() {
  const n = (t, s = 1) => new THREE.Vector2(s, s);

  // --- ground ---
  // (albedo ~0.17: aged asphalt 0.10-0.18; against the overcast sky as in the user's photos 1 and 7)
  std('asphalt', { map: TEX.asphalt, normalMap: TEX.asphaltN, normalScale: n(0, 0.9), roughness: 0.93, color: 0xe3e3e3 });
  std('pavers', { map: TEX.pavers, normalMap: TEX.paversN, roughness: 0.9, color: 0xe8e6e2 });
  std('curb', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.88, color: 0xd8d1c3 });
  std('concrete', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.92, color: 0xe9e2d3 });   // (weathered concrete: a warm grey-beige, photo 7)
  // hard road surfaces: puddles on the level and water running downhill when it rains (rain.js; clones inherit it)
  for (const k of ['asphalt', 'pavers', 'concrete']) M[k].userData.wet = 'road';
  std('gravel', { map: TEX.gravel, normalMap: TEX.gravelN, normalScale: n(0, 1.2), roughness: 0.97 });
  std('grassGround', { map: TEX.grass, normalMap: TEX.grassN, roughness: 0.98 });
  std('soil', { map: TEX.soil, normalMap: TEX.soilN, roughness: 0.98 });
  // the bare ground: the water that runs off it in a downpour is muddy (rain.js)
  for (const k of ['gravel', 'grassGround', 'soil']) M[k].userData.wet = 'ground';
  std('tiles', { map: TEX.tiles, normalMap: TEX.tilesN, roughness: 0.55 });
  std('plinthTile', { map: TEX.plinth, normalMap: TEX.plinthN, roughness: 0.6 });
  std('rustStrip', { map: TEX.rust_strip, normalMap: TEX.rust_stripN, roughness: 0.75, metalness: 0.3 });
  std('marking', { map: TEX.paint, transparent: true, alphaTest: 0.35, roughness: 0.7, color: 0xf0f0ea, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  std('manhole', { map: TEX.manhole, alphaTest: 0.5, roughness: 0.55, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  std('farField', { map: TEX.grass, roughness: 1, color: 0xb8c0a0 });

  // --- walls ---
  std('stoneCladding', { map: TEX.stone_cladding, normalMap: TEX.stone_claddingN, roughness: 0.85 });
  std('stoneWall', { map: TEX.stone_wall, normalMap: TEX.stone_wallN, roughness: 0.9 });
  // photo facades already contain the (shaded) light of the porch: add part of it back as
  // emissive so they read like the photos instead of getting darkened twice
  std('facadePorch', { map: TEX.facade_porch, normalMap: TEX.facade_porchN, normalScale: n(0, 0.5), roughness: 0.8, color: 0xffffff, emissive: 0xffffff, emissiveMap: TEX.facade_porch, emissiveIntensity: 0.42 });
  std('facadeVeranda', { map: TEX.facade_veranda, normalMap: TEX.facade_verandaN, normalScale: n(0, 0.5), roughness: 0.5, color: 0xffffff, emissive: 0xffffff, emissiveMap: TEX.facade_veranda, emissiveIntensity: 0.38 });
  std('kneeWall', { map: TEX.knee_wall, normalMap: TEX.knee_wallN, roughness: 0.92, color: 0xffffff, emissive: 0xffffff, emissiveMap: TEX.knee_wall, emissiveIntensity: 0.18 });
  const stucco = (name, color) => std(name, { map: TEX.stucco, normalMap: TEX.stuccoN, normalScale: n(0, 0.8), roughness: 0.95, color });
  stucco('stuccoTan', 0xc7a27e);      // ochre/tan of the upper walls (sampled from photo 4)
  stucco('stuccoGray', 0x8c8c8a);     // gray textured plaster of the porch
  stucco('stuccoGrayLight', 0xa9a8a4);
  stucco('stuccoWhite', 0xe8e6e0);
  stucco('stuccoCream', 0xe3d6bd);
  stucco('stuccoPeach', 0xdcb99a);
  stucco('stuccoYellow', 0xe2cf95);
  stucco('stuccoGreen', 0xbfcab0);
  stucco('stuccoPink', 0xd9b8ae);
  stucco('stuccoBeige', 0xcdbb9f);
  std('wallPlaster', { map: TEX.wall_plaster, normalMap: TEX.wall_plasterN, normalScale: n(0, 1.2), roughness: 0.97, color: 0xf4f2ef });
  std('gateBoards', { map: TEX.picket, normalMap: TEX.picketN, roughness: 0.6, color: 0xf0e4e4 });
  std('houseNo10', { map: TEX.houseNo10, roughness: 0.4 });
  std('houseNo111', { map: TEX.houseNo111, roughness: 0.4 });
  std('houseNo12', { map: TEX.houseNo12, roughness: 0.4 });
  std('doorMat', { map: TEX.doorMat, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  std('horezu', { map: TEX.horezu, roughness: 0.25, color: 0xffffff });
  std('lattice', { map: TEX.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  std('rattan', { map: TEX.picket, roughness: 0.9, color: 0x5a5a5e });
  std('cushion', { roughness: 0.95, color: 0xe9e6de });
  std('tablecloth', { roughness: 0.95, color: 0xc2b3dc, side: THREE.DoubleSide });
  std('umbrella', { roughness: 0.9, color: 0xf2efe6, side: THREE.DoubleSide });
  std('coco', { map: TEX.grass, roughness: 1, color: 0x9a7a55 });
  std('wicker', { map: TEX.chain, alphaTest: 0.5, roughness: 0.8, color: 0xf4f4f0, side: THREE.DoubleSide });
  std('clothesA', { roughness: 0.95, color: 0x8a1f3d, side: THREE.DoubleSide });
  std('clothesB', { roughness: 0.95, color: 0x2a6a7e, side: THREE.DoubleSide });
  std('clothesC', { roughness: 0.95, color: 0x3b4b7a, side: THREE.DoubleSide });
  std('brick', { map: TEX.brick, normalMap: TEX.brickN, roughness: 0.85 });
  std('wood', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.72, color: 0x5e3322 });      // stained soffit/rafters
  std('woodDark', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.74, color: 0x3f2117 });
  std('woodLight', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.6, color: 0xb87a45 });  // oak window frames
  std('picket', { map: TEX.picket, normalMap: TEX.picketN, roughness: 0.75 });
  std('bark', { map: TEX.bark, normalMap: TEX.barkN, roughness: 0.95 });
  // the forest species' own bark (barktex.js), the moss and green algae on it by species (mossy)
  for (const k of ['Beech', 'Hornbeam', 'Oak', 'Robinia', 'Birch', 'Spruce', 'Pine']) std('bark' + k, { map: TEX['bark' + k], normalMap: TEX['bark' + k + 'N'], roughness: k === 'Beech' || k === 'Birch' ? 0.82 : 0.95 });
  for (const [k, a] of [['bark', 0.6], ['barkBeech', 1], ['barkHornbeam', 0.9], ['barkOak', 0.7], ['barkRobinia', 0.45], ['barkBirch', 0.35], ['barkSpruce', 0.55], ['barkPine', 0.4]]) mossy(M[k], a);

  // --- roofs & metal ---
  std('roofPhoto', { map: TEX.roof_panels, normalMap: TEX.roof_panelsN, roughness: 0.42, metalness: 0.55, color: 0xe4e8ec });
  std('roofMetalGray', { map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.4, metalness: 0.65, color: 0xa8adb3 });
  std('roofMetalBrown', { map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.5, metalness: 0.4, color: 0x5d3a2a });
  std('roofMetalRed', { map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.5, metalness: 0.35, color: 0x8a2e24 });
  std('roofMetalGreen', { map: TEX.roofMetal, normalMap: TEX.roofMetalN, roughness: 0.5, metalness: 0.35, color: 0x3d5a45 });
  std('roofTiles', { map: TEX.roofTiles, normalMap: TEX.roofTilesN, roughness: 0.75 });
  std('galv', { map: TEX.galv, roughness: 0.4, metalness: 0.8, color: 0x9ea4aa });
  std('blackMetal', { normalMap: TEX.hammerN, roughness: 0.45, metalness: 0.6, color: 0x121314 });
  std('gold', { roughness: 0.35, metalness: 1.0, color: 0xc9a86a });
  std('greenMetal', { roughness: 0.45, metalness: 0.4, color: 0x2f6b3a });
  std('tealMetal', { roughness: 0.5, metalness: 0.35, color: 0x5fa39a });
  std('tealPanel', { roughness: 0.55, metalness: 0.3, color: 0x9fd0c2 });
  std('mintPicket', { normalMap: TEX.picketN, roughness: 0.62, color: 0xa4dccb });       // painted boards, photo 18
  std('poleBlue', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.8, color: 0xb4cde0 }); // painted pole base
  std('gasPipe', { roughness: 0.4, metalness: 0.2, color: 0xe8c21a });
  std('whitePVC', { roughness: 0.35, color: 0xf2f2ef });
  std('meterBox', { roughness: 0.6, color: 0xdedcd6 });
  std('darkPlastic', { roughness: 0.6, color: 0x2a2b2d });
  std('concretePole', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.9, color: 0xb9b6ae });
  std('ceramicWhite', { roughness: 0.25, color: 0xe9e9e6 });
  std('cable', { roughness: 0.6, color: 0x151515 });
  std('chain', { map: TEX.chain, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7, color: 0xd0d6cf });
  std('shadeCloth', { roughness: 0.9, color: 0x1f4a36, side: THREE.DoubleSide });
  std('ivy', { map: TEX.ivy, normalMap: TEX.ivyN, roughness: 0.6, side: THREE.DoubleSide });
  std('terracotta', { roughness: 0.85, color: 0xb35d3e });
  std('pot', { roughness: 0.8, color: 0xcfc6bd });
  std('lampGlass', { roughness: 0.2, color: 0xe8e2d0, emissive: 0x000000 });
  std('red', { roughness: 0.6, color: 0xa3161b });
  std('interiorDark', { roughness: 0.9, color: 0x1a1816 });

  // --- windows ---
  const glass = (name, map, tint = 0xffffff) => {
    const m = new THREE.MeshPhysicalMaterial({ map, color: tint, roughness: 0.08, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.6, envMapIntensity: 1.2 });
    m.name = name; M[name] = m; return m;
  };
  glass('windowCurtain', TEX.curtain, 0xd8d8d8);
  glass('windowBlinds', TEX.blinds, 0xdddddd);
  glass('windowDark', null, 0x1d2023);

  // --- foliage ---
  // (the broadleaves turn in autumn: season.js)
  const leaf = (name, map, color, amp) => autumnize(addWind(std(name, { map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color, alphaToCoverage: false }), amp), name);
  leaf('leaves', TEX.leaves, 0xffffff, 0.035);
  leaf('leavesSmall', TEX.leavesSmall, 0xe8f0d8, 0.04);
  leaf('leavesDense', TEX.leavesDense, 0xe8f0d8, 0.04);                     // fruit trees, willows
  leaf('leavesDark', TEX.leaves, 0x93a67e, 0.035);
  leaf('leavesAutumn', TEX.leavesAutumn, 0xffffff, 0.035);                 // the lane up to the cross in mid-October
  leaf('leavesPinnate', TEX.leavesPinnate, 0xffffff, 0.045);                // black locust
  leaf('leavesBeech', TEX.leavesBeech, 0xffffff, 0.035);                    // the forest broadleaves' own sprays (genLeafSprays)
  leaf('leavesHornbeam', TEX.leavesHornbeam, 0xffffff, 0.035);
  leaf('leavesOak', TEX.leavesOak, 0xffffff, 0.03);
  leaf('fir', TEX.fir, 0x9fb59a, 0.018);
  M.fir.userData.snow = 0.8;                       // (rain.js: in the snow the conifers' boughs carry a load, as the spruces' do)
  leaf('pine', TEX.pineTuft ?? TEX.fir, 0xb4c4a4, 0.014);   // black pine needle tufts (geo/trees.js)
  M.pine.userData.snow = 0.8;
  leaf('sumac', TEX.fir, 0xd8e0a0, 0.05);
  leaf('flowers', TEX.flowers, 0xffffff, 0.03);           // pinnate sumac fronds (photo 7, across the street)
  M.yucca = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 0.05, 1.5);
  M.firCore = std('firCore', { color: 0x1c2a1e, roughness: 1 });

  // --- hills ---
  M.hills = new THREE.MeshStandardMaterial({ map: TEX.forest, roughness: 1, color: 0xffffff, fog: false });
  return M;
}
