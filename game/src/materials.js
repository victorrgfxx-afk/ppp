import * as THREE from 'three';
import { TEX } from './textures.js';
import { WIND } from './util.js';

export const M = {};

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
  };
  material.customProgramCacheKey = () => 'wind' + amp + freq;
  return material;
}

export function buildMaterials() {
  const n = (t, s = 1) => new THREE.Vector2(s, s);

  // --- ground ---
  std('asphalt', { map: TEX.asphalt, normalMap: TEX.asphaltN, normalScale: n(0, 0.9), roughness: 0.93, color: 0xf2f2f2 });
  std('pavers', { map: TEX.pavers, normalMap: TEX.paversN, roughness: 0.9, color: 0xe8e6e2 });
  std('curb', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.88, color: 0xd6d4cf });
  std('concrete', { map: TEX.concrete, normalMap: TEX.concreteN, roughness: 0.92, color: 0xe6e4df });
  std('gravel', { map: TEX.gravel, normalMap: TEX.gravelN, normalScale: n(0, 1.2), roughness: 0.97 });
  std('grassGround', { map: TEX.grass, normalMap: TEX.grassN, roughness: 0.98 });
  std('soil', { map: TEX.soil, normalMap: TEX.soilN, roughness: 0.98 });
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
  std('brick', { map: TEX.brick, normalMap: TEX.brickN, roughness: 0.85 });
  std('wood', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.72, color: 0x5e3322 });      // stained soffit/rafters
  std('woodDark', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.74, color: 0x3f2117 });
  std('woodLight', { map: TEX.wood, normalMap: TEX.woodN, roughness: 0.6, color: 0xb87a45 });  // oak window frames
  std('picket', { map: TEX.picket, normalMap: TEX.picketN, roughness: 0.75 });
  std('bark', { map: TEX.bark, normalMap: TEX.barkN, roughness: 0.95 });

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
  const leaf = (name, map, color, amp) => addWind(std(name, { map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color, alphaToCoverage: false }), amp);
  leaf('leaves', TEX.leaves, 0xffffff, 0.035);
  leaf('leavesSmall', TEX.leavesSmall, 0xe8f0d8, 0.04);
  leaf('leavesDark', TEX.leaves, 0x93a67e, 0.035);
  leaf('fir', TEX.fir, 0x9fb59a, 0.018);
  leaf('sumac', TEX.fir, 0xd8e0a0, 0.05);           // pinnate sumac fronds (photo 7, across the street)
  M.yucca = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 0.05, 1.5);
  M.firCore = std('firCore', { color: 0x1c2a1e, roughness: 1 });

  // --- hills ---
  M.hills = new THREE.MeshStandardMaterial({ map: TEX.forest, roughness: 1, color: 0xffffff, fog: false });
  return M;
}
