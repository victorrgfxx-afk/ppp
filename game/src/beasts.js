import * as THREE from 'three';
import { v3, E, C, Flat, surfaceNets } from './dogs.js';
import { WIND } from './util.js';

// The wild animals of the woods (wildlife.js moves them): red fox, grey wolf, wild boar (and this year's young, in late
// September past their stripes), brown bear. Each is one signed-distance sculpture (ellipsoids and tapered capsules
// blended with a smooth minimum) meshed with surface nets and skinned to a 19-bone skeleton - spine, neck, head, two
// tail bones, three bones in every leg (shoulder or hip, elbow or knee, wrist or hock) - so the body bends as a body
// does, with no seams at the joints. Every vertex belongs to the bone of the part it was sculpted from and blends into
// the next bone across each joint. The coat is a stack of shells of the same mesh pushed out along the skin (strands from
// 3D Worley noise on the rest pose: they stay put on the skin as it moves), its colour painted per vertex.
// Sizes as the Carpathian animals: fox ~38 cm at the shoulder, ~6 kg; wolf ~75 cm, ~40 kg; boar ~85 cm, ~90 kg (the
// young ~50 cm); bear ~1.05 m at the hump, ~2 m long.

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'tail1', 'tail2',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'hockL', 'hipR', 'kneeR', 'hockR'];
export const PARENT = [-1, 0, 1, 2, 3, 0, 5, 2, 7, 8, 2, 10, 11, 0, 13, 14, 0, 16, 17];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const TIP = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head', head: 'headTip', tail1: 'tail2', tail2: 'tailTip',
  shoulderL: 'elbowL', elbowL: 'wristL', wristL: 'toeL', shoulderR: 'elbowR', elbowR: 'wristR', wristR: 'toeR',
  hipL: 'kneeL', kneeL: 'hockL', hockL: 'htoeL', hipR: 'kneeR', kneeR: 'hockR', hockR: 'htoeR' };
const sRGB = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

// joints from a few numbers; legs mirrored (x > 0 is the animal's left)
function legs(J, f, h) {
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    J['shoulder' + L] = [s * f.x, f.y0, f.z0]; J['elbow' + L] = [s * f.x, f.y1, f.z1]; J['wrist' + L] = [s * f.x, f.y2, f.z2]; J['toe' + L] = [s * f.x, 0.01, f.z2 + f.toe];
    J['hip' + L] = [s * h.x, h.y0, h.z0]; J['knee' + L] = [s * h.x, h.y1, h.z1]; J['hock' + L] = [s * h.x, h.y2, h.z2]; J['htoe' + L] = [s * h.x, 0.01, h.z2 + h.toe];
  }
  return J;
}
// a part of the sculpture, owned by a bone
const P = (bone, prim) => ({ ...prim, bone: BI[bone] });
const mirror = (bone, make) => [P(bone + 'L', make(1)), P(bone + 'R', make(-1))];

// ------------------------------------------------------------------ the species
const SPECIES = {
  fox: () => {
    const J = legs({ hips: [0, 0.33, -0.16], spine: [0, 0.335, 0], chest: [0, 0.335, 0.14], neck: [0, 0.37, 0.23], head: [0, 0.445, 0.31], headTip: [0, 0.41, 0.47],
      tail1: [0, 0.33, -0.26], tail2: [0, 0.23, -0.45], tailTip: [0, 0.15, -0.66] },
    { x: 0.055, y0: 0.3, z0: 0.15, y1: 0.19, z1: 0.14, y2: 0.045, z2: 0.165, toe: 0.04 }, { x: 0.06, y0: 0.31, z0: -0.18, y1: 0.19, z1: -0.12, y2: 0.085, z2: -0.21, toe: 0.04 });
    const L = J;
    const parts = [
      P('chest', E(v3(0, 0.315, 0.12), v3(0.075, 0.1, 0.12), 0.05)), P('spine', E(v3(0, 0.315, -0.02), v3(0.07, 0.085, 0.15), 0.05)), P('hips', E(v3(0, 0.315, -0.17), v3(0.07, 0.08, 0.1), 0.05)),
      P('neck', C(v3(0, 0.34, 0.19), v3(0, 0.43, 0.3), 0.055, 0.042, 0.04)),
      P('head', E(v3(0, 0.448, 0.325), v3(0.05, 0.046, 0.058), 0.03)), P('head', C(v3(0, 0.432, 0.355), v3(0, 0.412, 0.47), 0.028, 0.01, 0.03)),
      P('head', E(v3(0.032, 0.428, 0.34), v3(0.026, 0.022, 0.032), 0.02)), P('head', E(v3(-0.032, 0.428, 0.34), v3(0.026, 0.022, 0.032), 0.02)),
      P('head', Flat(C(v3(0.03, 0.475, 0.31), v3(0.046, 0.555, 0.3), 0.026, 0.004, 0.02), 2, 0.35, 0.305)), P('head', Flat(C(v3(-0.03, 0.475, 0.31), v3(-0.046, 0.555, 0.3), 0.026, 0.004, 0.02), 2, 0.35, 0.305)),
      P('tail1', C(v3(0, 0.325, -0.25), v3(0, 0.23, -0.45), 0.025, 0.035, 0.03)), P('tail2', C(v3(0, 0.23, -0.45), v3(0, 0.155, -0.65), 0.035, 0.022, 0.03)),
      ...mirror('shoulder', s => E(v3(s * 0.058, 0.26, 0.145), v3(0.028, 0.06, 0.04), 0.03)), ...mirror('shoulder', s => C(v3(...L['shoulderL'].map((v, i) => i ? v : s * v)), v3(s * 0.057, 0.19, 0.14), 0.03, 0.02, 0.03)),
      ...mirror('elbow', s => C(v3(s * 0.057, 0.19, 0.14), v3(s * 0.055, 0.045, 0.165), 0.016, 0.011, 0.02)), ...mirror('wrist', s => E(v3(s * 0.055, 0.022, 0.185), v3(0.017, 0.015, 0.03), 0.015)),
      ...mirror('hip', s => E(v3(s * 0.062, 0.265, -0.16), v3(0.032, 0.07, 0.06), 0.035)), ...mirror('knee', s => C(v3(s * 0.063, 0.19, -0.12), v3(s * 0.06, 0.085, -0.21), 0.019, 0.011, 0.02)),
      ...mirror('hock', s => C(v3(s * 0.06, 0.085, -0.21), v3(s * 0.06, 0.03, -0.18), 0.011, 0.01, 0.015)), ...mirror('hock', s => E(v3(s * 0.06, 0.02, -0.165), v3(0.016, 0.014, 0.028), 0.015)),
    ];
    const red = sRGB(0.66, 0.33, 0.12), white = sRGB(0.92, 0.89, 0.82), black = sRGB(0.12, 0.085, 0.06), grey = sRGB(0.55, 0.42, 0.3);
    const col = (x, y, z, c) => {
      c.copy(red);
      if (z > 0.08 && y < 0.31 && y > 0.18 && Math.abs(x) < 0.06) c.lerp(white, 0.85);                      // the white throat and chest
      if (z > 0.3 && y < 0.43) c.lerp(white, 0.8);                                                             // the white upper lip and chin
      if (z > -0.2 && z < 0.1 && y < 0.25 && Math.abs(x) < 0.05) c.lerp(sRGB(0.85, 0.78, 0.66), 0.6);         // a pale belly
      if (y < 0.15 && (z > 0.1 || z < -0.08) && Math.abs(x) > 0.035) c.copy(black);                             // the black stockings
      if (y > 0.5) c.lerp(black, 0.75);                                                                          // the backs of the ears
      if (z < -0.6) c.copy(white);                                                                               // the white tail tip
      else if (z < -0.3 && y > 0.2) c.lerp(grey, 0.3);
    };
    const fur = (x, y, z) => (z < -0.24 ? 0.055 : y > 0.47 ? 0.004 : z > 0.27 ? 0.01 : y < 0.17 ? 0.007 : 0.024);
    return { J, parts, col, fur, cell: 0.0105, look: { shells: 7, density: 260, tip: 0xd69a5a, sheen: 0x9a5a2a, gravity: [0, -0.3, -0.9], lift: 0.55, thick: 0.55, ao: 0.45, vary: 0.2 },
      eyes: { y: 0.452, z: 0.367, x: 0.026, r: 0.0085, col: 0x2a1606 }, nose: { y: 0.414, z: 0.472, s: [0.01, 0.008, 0.008] }, half: [0.07, 0.36] };
  },
  wolf: () => {
    const J = legs({ hips: [0, 0.66, -0.35], spine: [0, 0.68, -0.04], chest: [0, 0.68, 0.27], neck: [0, 0.73, 0.43], head: [0, 0.84, 0.58], headTip: [0, 0.79, 0.86],
      tail1: [0, 0.65, -0.52], tail2: [0, 0.45, -0.66], tailTip: [0, 0.28, -0.78] },
    { x: 0.1, y0: 0.6, z0: 0.29, y1: 0.42, z1: 0.27, y2: 0.09, z2: 0.31, toe: 0.06 }, { x: 0.11, y0: 0.62, z0: -0.37, y1: 0.42, z1: -0.26, y2: 0.19, z2: -0.42, toe: 0.06 });
    const parts = [
      P('chest', E(v3(0, 0.6, 0.24), v3(0.155, 0.25, 0.23), 0.08)), P('spine', E(v3(0, 0.63, 0.0), v3(0.145, 0.19, 0.3), 0.08)), P('hips', E(v3(0, 0.645, -0.31), v3(0.13, 0.15, 0.17), 0.07)),
      P('spine', E(v3(0, 0.56, -0.12), v3(0.1, 0.07, 0.17), 0.08)),
      P('neck', C(v3(0, 0.66, 0.36), v3(0, 0.82, 0.55), 0.14, 0.095, 0.07)),
      P('head', E(v3(0, 0.855, 0.6), v3(0.1, 0.09, 0.105), 0.05)), P('head', C(v3(0, 0.825, 0.66), v3(0, 0.795, 0.84), 0.06, 0.032, 0.04)),
      P('head', E(v3(0.058, 0.81, 0.63), v3(0.048, 0.048, 0.055), 0.03)), P('head', E(v3(-0.058, 0.81, 0.63), v3(0.048, 0.048, 0.055), 0.03)),
      P('head', Flat(C(v3(0.05, 0.915, 0.575), v3(0.064, 0.995, 0.555), 0.038, 0.006, 0.03), 2, 0.35, 0.565)), P('head', Flat(C(v3(-0.05, 0.915, 0.575), v3(-0.064, 0.995, 0.555), 0.038, 0.006, 0.03), 2, 0.35, 0.565)),
      P('tail1', C(v3(0, 0.645, -0.5), v3(0, 0.45, -0.66), 0.04, 0.05, 0.04)), P('tail2', C(v3(0, 0.45, -0.66), v3(0, 0.29, -0.77), 0.05, 0.035, 0.04)),
      ...mirror('shoulder', s => E(v3(s * 0.11, 0.54, 0.27), v3(0.058, 0.12, 0.085), 0.05)), ...mirror('shoulder', s => C(v3(s * 0.1, 0.58, 0.29), v3(s * 0.104, 0.42, 0.27), 0.058, 0.042, 0.05)),
      ...mirror('elbow', s => C(v3(s * 0.104, 0.42, 0.27), v3(s * 0.1, 0.09, 0.31), 0.037, 0.026, 0.03)), ...mirror('wrist', s => E(v3(s * 0.1, 0.04, 0.34), v3(0.036, 0.03, 0.055), 0.025)),
      ...mirror('hip', s => E(v3(s * 0.115, 0.55, -0.33), v3(0.068, 0.13, 0.11), 0.06)), ...mirror('knee', s => C(v3(s * 0.114, 0.42, -0.26), v3(s * 0.11, 0.19, -0.42), 0.042, 0.027, 0.03)),
      ...mirror('hock', s => C(v3(s * 0.11, 0.19, -0.42), v3(s * 0.11, 0.05, -0.38), 0.026, 0.023, 0.02)), ...mirror('hock', s => E(v3(s * 0.11, 0.035, -0.365), v3(0.034, 0.028, 0.05), 0.025)),
    ];
    const base = sRGB(0.5, 0.45, 0.38), dark = sRGB(0.26, 0.23, 0.2), pale = sRGB(0.8, 0.75, 0.64), tan = sRGB(0.62, 0.5, 0.36);
    const col = (x, y, z, c) => {
      c.copy(base);
      if (y > 0.74 && z < 0.4 && z > -0.45) c.lerp(dark, 0.7);                                                 // the dark saddle
      if (y < 0.58 && Math.abs(x) < 0.12 && z > -0.4 && z < 0.4) c.lerp(pale, 0.7);                            // the pale underside
      if (y < 0.42) c.lerp(tan, 0.6);                                                                          // tawny legs
      if (z > 0.62 && y < 0.82) c.lerp(pale, 0.75);                                                           // the pale muzzle and cheeks
      if (y > 0.9) c.lerp(sRGB(0.42, 0.32, 0.24), 0.6);                                                       // the ears
      if (z < -0.72) c.copy(dark);                                                                             // the black tail tip
    };
    const fur = (x, y, z) => (z < -0.48 ? 0.07 : (z > 0.3 && z < 0.56 && y > 0.6) ? 0.08 : y > 0.9 ? 0.006 : z > 0.62 ? 0.014 : y < 0.42 ? 0.013 : 0.045);
    return { J, parts, col, fur, cell: 0.017, look: { shells: 7, density: 170, tip: 0xc9bca4, sheen: 0x8a7a64, gravity: [0, -0.4, -0.8], lift: 0.55, thick: 0.55, ao: 0.45, vary: 0.24 },
      eyes: { y: 0.87, z: 0.68, x: 0.047, r: 0.012, col: 0x6a4a10 }, nose: { y: 0.8, z: 0.845, s: [0.024, 0.018, 0.016] }, half: [0.14, 0.62] };
  },
  boar: () => {
    const J = legs({ hips: [0, 0.62, -0.42], spine: [0, 0.68, -0.05], chest: [0, 0.75, 0.3], neck: [0, 0.7, 0.48], head: [0, 0.68, 0.62], headTip: [0, 0.44, 1.04],
      tail1: [0, 0.62, -0.66], tail2: [0, 0.45, -0.7], tailTip: [0, 0.32, -0.71] },
    { x: 0.13, y0: 0.55, z0: 0.37, y1: 0.36, z1: 0.36, y2: 0.1, z2: 0.38, toe: 0.05 }, { x: 0.13, y0: 0.56, z0: -0.45, y1: 0.36, z1: -0.36, y2: 0.16, z2: -0.48, toe: 0.05 });
    const parts = [
      P('chest', E(v3(0, 0.66, 0.26), v3(0.19, 0.3, 0.3), 0.1)), P('spine', E(v3(0, 0.62, -0.06), v3(0.2, 0.26, 0.38), 0.1)), P('hips', E(v3(0, 0.6, -0.42), v3(0.16, 0.22, 0.2), 0.08)),
      P('chest', E(v3(0, 0.88, 0.16), v3(0.045, 0.1, 0.36), 0.08)),                                          // the bristly ridge of the withers
      P('neck', C(v3(0, 0.67, 0.42), v3(0, 0.68, 0.6), 0.21, 0.17, 0.08)),
      P('head', C(v3(0, 0.7, 0.62), v3(0, 0.5, 0.98), 0.15, 0.055, 0.07)), P('head', E(v3(0, 0.6, 0.7), v3(0.12, 0.13, 0.14), 0.07)), P('head', E(v3(0, 0.76, 0.69), v3(0.095, 0.075, 0.12), 0.05)),
      P('head', C(v3(0, 0.47, 1.0), v3(0, 0.455, 1.05), 0.05, 0.048, 0.02)),                                 // the snout's disc
      P('head', Flat(C(v3(0.07, 0.81, 0.65), v3(0.1, 0.93, 0.6), 0.048, 0.01, 0.03), 2, 0.4, 0.625)), P('head', Flat(C(v3(-0.07, 0.81, 0.65), v3(-0.1, 0.93, 0.6), 0.048, 0.01, 0.03), 2, 0.4, 0.625)),
      P('tail1', C(v3(0, 0.62, -0.62), v3(0, 0.45, -0.7), 0.02, 0.012, 0.02)), P('tail2', C(v3(0, 0.45, -0.7), v3(0, 0.33, -0.71), 0.012, 0.01, 0.01)),
      ...mirror('shoulder', s => E(v3(s * 0.13, 0.48, 0.34), v3(0.07, 0.14, 0.1), 0.07)), ...mirror('elbow', s => C(v3(s * 0.13, 0.36, 0.36), v3(s * 0.12, 0.1, 0.38), 0.036, 0.022, 0.03)),
      ...mirror('wrist', s => E(v3(s * 0.12, 0.035, 0.4), v3(0.026, 0.035, 0.035), 0.02)),
      ...mirror('hip', s => E(v3(s * 0.13, 0.48, -0.41), v3(0.08, 0.15, 0.13), 0.07)), ...mirror('knee', s => C(v3(s * 0.13, 0.36, -0.36), v3(s * 0.12, 0.16, -0.48), 0.04, 0.024, 0.03)),
      ...mirror('hock', s => C(v3(s * 0.12, 0.16, -0.48), v3(s * 0.12, 0.05, -0.45), 0.024, 0.021, 0.02)), ...mirror('hock', s => E(v3(s * 0.12, 0.035, -0.44), v3(0.026, 0.035, 0.035), 0.02)),
    ];
    const base = sRGB(0.23, 0.2, 0.17), dark = sRGB(0.12, 0.1, 0.09), disc = sRGB(0.33, 0.27, 0.26);
    const col = (x, y, z, c) => {
      c.copy(base);
      if (y < 0.3 || (z > 0.85 && y < 0.62)) c.copy(dark);                                                    // the legs, the long snout
      if (z > 0.99) c.copy(disc);
      if (z > 0.62 && z < 0.85 && y < 0.62 && Math.abs(x) > 0.07) c.lerp(sRGB(0.45, 0.42, 0.38), 0.4);       // the grizzled cheeks
    };
    const fur = (x, y, z) => (y > 0.84 && z < 0.55 ? 0.09 : z > 0.99 ? 0.002 : z > 0.62 ? 0.02 : y < 0.3 ? 0.012 : 0.038);
    return { J, parts, col, fur, cell: 0.019, look: { shells: 6, density: 150, tip: 0x7e7262, sheen: 0x3a3028, gravity: [0, -0.5, -0.4], lift: 0.6, thick: 0.45, ao: 0.45, vary: 0.28 },
      eyes: { y: 0.745, z: 0.77, x: 0.075, r: 0.011, col: 0x150c06 }, tusks: true, half: [0.2, 0.62] };
  },
  bear: () => {
    const J = legs({ hips: [0, 0.8, -0.45], spine: [0, 0.86, -0.05], chest: [0, 0.96, 0.34], neck: [0, 0.92, 0.6], head: [0, 0.9, 0.8], headTip: [0, 0.85, 1.3],
      tail1: [0, 0.86, -0.75], tail2: [0, 0.84, -0.82], tailTip: [0, 0.82, -0.86] },
    { x: 0.2, y0: 0.66, z0: 0.42, y1: 0.42, z1: 0.44, y2: 0.08, z2: 0.47, toe: 0.13 }, { x: 0.21, y0: 0.68, z0: -0.46, y1: 0.42, z1: -0.36, y2: 0.14, z2: -0.5, toe: 0.14 });
    const parts = [
      P('spine', E(v3(0, 0.78, -0.02), v3(0.36, 0.34, 0.6), 0.1)), P('chest', E(v3(0, 0.98, 0.34), v3(0.3, 0.22, 0.3), 0.16)), P('chest', E(v3(0, 0.7, 0.4), v3(0.33, 0.33, 0.3), 0.12)),
      P('hips', E(v3(0, 0.8, -0.48), v3(0.34, 0.31, 0.3), 0.12)), P('spine', E(v3(0, 0.6, -0.02), v3(0.3, 0.2, 0.5), 0.1)),
      P('neck', C(v3(0, 0.9, 0.58), v3(0, 0.89, 0.8), 0.24, 0.21, 0.1)), P('tail1', E(v3(0, 0.86, -0.79), v3(0.07, 0.07, 0.06), 0.05)),
      P('head', E(v3(0, 0.93, 0.95), v3(0.22, 0.2, 0.21), 0.08)), P('head', E(v3(0, 0.98, 1.03), v3(0.16, 0.1, 0.12), 0.06)), P('head', C(v3(0, 0.88, 1.06), v3(0, 0.845, 1.27), 0.11, 0.07, 0.06)),
      P('head', E(v3(0.16, 1.1, 0.88), v3(0.065, 0.07, 0.04), 0.04)), P('head', E(v3(-0.16, 1.1, 0.88), v3(0.065, 0.07, 0.04), 0.04)),
      ...mirror('shoulder', s => E(v3(s * 0.2, 0.62, 0.42), v3(0.14, 0.22, 0.17), 0.1)), ...mirror('elbow', s => C(v3(s * 0.205, 0.42, 0.44), v3(s * 0.2, 0.08, 0.47), 0.12, 0.095, 0.05)),
      ...mirror('wrist', s => E(v3(s * 0.2, 0.06, 0.52), v3(0.1, 0.055, 0.15), 0.06)),
      ...mirror('hip', s => E(v3(s * 0.21, 0.64, -0.46), v3(0.15, 0.25, 0.22), 0.1)), ...mirror('knee', s => C(v3(s * 0.215, 0.42, -0.36), v3(s * 0.21, 0.14, -0.5), 0.1, 0.088, 0.05)),
      ...mirror('hock', s => E(v3(s * 0.21, 0.05, -0.42), v3(0.095, 0.05, 0.16), 0.05)),
    ];
    const dark = sRGB(0.25, 0.165, 0.1), muzzle = sRGB(0.36, 0.25, 0.16), hump = sRGB(0.34, 0.24, 0.15);
    const col = (x, y, z, c) => { c.copy(dark); if (y > 1.05 && z > 0.1 && z < 0.6) c.lerp(hump, 0.6); if (z > 1.12) c.copy(muzzle); if (y < 0.2) c.multiplyScalar(0.75); };
    const fur = (x, y, z) => (y > 1.0 && z > 0.1 && z < 0.6 ? 0.12 : y < 0.55 && Math.abs(x) < 0.3 && z > -0.5 && z < 0.5 ? 0.11 : z > 1.12 ? 0.015 : y < 0.3 ? 0.06 : 0.085);
    return { J, parts, col, fur, cell: 0.03, look: { shells: 8, density: 140, tip: 0x9a7048, sheen: 0x4a3424, gravity: [0, -0.55, -0.35], lift: 0.55, thick: 0.56, ao: 0.35, vary: 0.28 },
      eyes: { y: 0.98, z: 1.12, x: 0.08, r: 0.018, col: 0x120a04 }, nose: { y: 0.84, z: 1.28, s: [0.05, 0.035, 0.035] }, half: [0.38, 0.95] };
  },
};

// ------------------------------------------------------------------ building a species: mesh, skin weights, coat
const BLEND = { spine: 0.12, chest: 0.12, neck: 0.08, head: 0.05, tail1: 0.05, tail2: 0.06, shoulderL: 0.07, shoulderR: 0.07, elbowL: 0.04, elbowR: 0.04,
  wristL: 0.03, wristR: 0.03, hipL: 0.08, hipR: 0.08, kneeL: 0.045, kneeR: 0.045, hockL: 0.03, hockR: 0.03 };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

function coatMaterial(look, key, tint = null) {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, sheen: 1, sheenColor: new THREE.Color(look.sheen), sheenRoughness: 0.45 });
  if (tint) m.color = tint;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uDensity: { value: look.density }, uTip: { value: new THREE.Color(look.tip) }, uGrav: { value: new THREE.Vector3(...look.gravity) },
      uTime: WIND.time, uLift: { value: look.lift }, uThick: { value: look.thick }, uAO: { value: look.ao }, uVary: { value: look.vary } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFur; attribute float aShell;
uniform vec3 uGrav; uniform float uTime; uniform float uLift;
varying vec3 vFurObj; varying float vShell;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vShell = aShell;
  vFurObj = position;
  float sway = sin(uTime * 1.7 + position.x * 9.0 + position.z * 7.0) * 0.12;
  transformed += normal * aFur * aShell * uLift + (uGrav + vec3(sway, 0.0, sway * 0.5)) * aFur * pow(aShell, 1.4);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uDensity; uniform vec3 uTip; uniform float uThick; uniform float uAO; uniform float uVary;
varying vec3 vFurObj; varying float vShell;
vec3 furHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 q = vFurObj * uDensity, cell = floor(q);
    float best = 9.0; vec3 bh = vec3(0.5);
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
      vec3 c = cell + vec3(float(i), float(j), float(k));
      vec3 h = furHash(c);
      float d = length(q - c - h);
      if (d < best) { best = d; bh = h; }
    }
    float thick = (uThick + 0.3 * bh.x) * (1.0 - vShell * (0.75 + 0.2 * bh.y));
    if (vShell > 0.001 && best > thick) discard;
    // strands thinner than a pixel (further off): their light and dark average out, so the coat takes its mean colour
    // instead of a speckle of single bright tips and dark roots
    float sub = smoothstep(0.35, 1.0, length(fwidth(q)));
    diffuseColor.rgb *= mix(mix(uAO, 1.0, pow(vShell, 0.7)) * (1.0 - uVary * 0.5 + uVary * bh.z), mix(uAO, 1.0, 0.62), sub);
    diffuseColor.rgb = mix(diffuseColor.rgb, uTip, mix(vShell * vShell * 0.6, 0.16, sub));
  }`);
  };
  m.customProgramCacheKey = () => 'beastCoat' + key;
  return m;
}
// shadows from the skin only: the outer shells are discarded in the depth pass
function skinDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShell; varying float vShellD;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShellD = aShell;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShellD;').replace('void main() {', 'void main() {\n  if (vShellD > 0.001) discard;');
  };
  m.customProgramCacheKey = () => 'beastDepth';
  return m;
}

const CACHE = new Map();
// species key -> { J, geo: [full, few shells, skin only], mats, spec } (built once, shared by every animal of the kind)
export function species(key) {
  if (CACHE.has(key)) return CACHE.get(key);
  const spec = SPECIES[key]();
  const { J, parts } = spec;
  const sdf = (x, y, z) => { let d = parts[0].f(x, y, z); for (let i = 1; i < parts.length; i++) d = smin(d, parts[i].f(x, y, z), parts[i].k); return d; };
  // bounds from the joints and a margin
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of Object.values(J)) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  const pad = Math.max(0.08, (hi[1] - lo[1]) * 0.35);
  const base = surfaceNets(sdf, v3(lo[0] - pad, -0.02, lo[2] - pad), v3(hi[0] + pad, hi[1] + pad, hi[2] + pad), spec.cell);
  const pos = base.attributes.position, nrm = base.attributes.normal, nv = pos.count, idx = base.index.array;
  // skin weights: the owning part's bone, blended into the neighbouring bone across each joint
  const dirs = BONES.map(n => { const h = J[n], t = J[TIP[n]], d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]], l = Math.hypot(...d) || 1; return d.map(x => x / l); });
  const children = BONES.map((_, i) => PARENT.map((p, c) => p === i ? c : -1).filter(c => c >= 0));
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), fur = new Float32Array(nv), col = new Float32Array(nv * 3), c = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    let o = parts[0], bd = 1e9;
    for (const p of parts) { const d = Math.abs(p.f(x, y, z)); if (d < bd) { bd = d; o = p; } }
    const b = o.bone;
    let jb = PARENT[b] >= 0 ? b : -1, jd = jb >= 0 ? Math.hypot(x - J[BONES[b]][0], y - J[BONES[b]][1], z - J[BONES[b]][2]) : 1e9;
    for (const ch of children[b]) { const h = J[BONES[ch]], d = Math.hypot(x - h[0], y - h[1], z - h[2]); if (d < jd) { jd = d; jb = ch; } }
    if (jb < 0) { si[v * 4] = b; sw[v * 4] = 1; }
    else {
      const h = J[BONES[jb]], d = dirs[jb], s = (x - h[0]) * d[0] + (y - h[1]) * d[1] + (z - h[2]) * d[2], R = BLEND[BONES[jb]] * Math.max(1, spec.cell / 0.012);
      const w = ss(-R, R, s);
      si[v * 4] = jb; sw[v * 4] = w; si[v * 4 + 1] = PARENT[jb]; sw[v * 4 + 1] = 1 - w;
    }
    fur[v] = spec.fur(x, y, z);
    spec.col(x, y, z, c); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  // the coat: the mesh repeated once per shell (skin first), so a shorter draw range draws fewer shells
  const S = spec.look.shells, nI = idx.length;
  const P = new Float32Array(nv * 3 * S), N = new Float32Array(nv * 3 * S), CO = new Float32Array(nv * 3 * S), FU = new Float32Array(nv * S), SH = new Float32Array(nv * S);
  const SI = new Uint16Array(nv * 4 * S), SW = new Float32Array(nv * 4 * S), I = new Uint32Array(nI * S);
  for (let s = 0; s < S; s++) {
    P.set(pos.array, s * nv * 3); N.set(nrm.array, s * nv * 3); CO.set(col, s * nv * 3); FU.set(fur, s * nv); SH.fill(s / Math.max(1, S - 1), s * nv, (s + 1) * nv);
    SI.set(si, s * nv * 4); SW.set(sw, s * nv * 4);
    for (let k = 0; k < nI; k++) I[s * nI + k] = idx[k] + s * nv;
  }
  const attrs = { position: new THREE.BufferAttribute(P, 3), normal: new THREE.BufferAttribute(N, 3), color: new THREE.BufferAttribute(CO, 3), aFur: new THREE.BufferAttribute(FU, 1),
    aShell: new THREE.BufferAttribute(SH, 1), skinIndex: new THREE.Uint16BufferAttribute(SI, 4), skinWeight: new THREE.BufferAttribute(SW, 4) };
  const index = new THREE.BufferAttribute(I, 1);
  const lod = [S, Math.min(S, 3), 1].map(n => {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a);
    g.setIndex(index); g.setDrawRange(0, nI * n);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2), Math.hypot(hi[1] - lo[1], hi[2] - lo[2]) * 0.75 + 0.3);
    return g;
  });
  const out = { key, spec, J, geo: lod, coat: coatMaterial(spec.look, key), depth: skinDepthMaterial(), tris: nI / 3 };
  if (key === 'boar') out.coatYoung = coatMaterial({ ...spec.look, tip: 0xb08a5c }, 'boarYoung', new THREE.Color(4.2, 3.0, 1.9));
  CACHE.set(key, out);
  return out;
}

const glossy = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
const EYE_MAT = new Map();

// one animal: its own skeleton on the species' shared mesh
export class Beast {
  constructor(key, { young = false } = {}) {
    const sp = this.sp = species(key);
    const J = sp.J;
    this.key = key; this.young = young;
    this.bones = BONES.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones.forEach((b, i) => {
      const h = J[BONES[i]], p = PARENT[i] >= 0 ? J[BONES[PARENT[i]]] : [0, 0, 0];
      b.position.set(h[0] - p[0], h[1] - p[1], h[2] - p[2]);
      if (PARENT[i] >= 0) this.bones[PARENT[i]].add(b);
    });
    this.rest = this.bones.map(b => b.position.clone());
    this.group = new THREE.Group();
    this.group.userData.ueSkip = 'wildlife';                       // (they come and go: not part of the Unreal export)
    this.mesh = new THREE.SkinnedMesh(sp.geo[0], young ? sp.coatYoung : sp.coat);
    this.mesh.add(this.bones[0]);
    this.bones[0].updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = sp.depth;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noAO = true; this.mesh.userData.noWet = true;
    this.group.add(this.mesh);
    // eyes (and the nose) on the head bone; the boar's tusks
    const s = sp.spec, head = this.bones[BI.head], hj = J.head;
    const em = EYE_MAT.get(s.eyes.col) ?? EYE_MAT.set(s.eyes.col, glossy(s.eyes.col)).get(s.eyes.col);
    for (const sg of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(s.eyes.r, 10, 8), em); e.position.set(sg * s.eyes.x, s.eyes.y - hj[1], s.eyes.z - hj[2]); head.add(e); }
    if (s.nose) { const n = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), EYE_MAT.get(0x080606) ?? EYE_MAT.set(0x080606, glossy(0x080606)).get(0x080606)); n.scale.set(...s.nose.s); n.position.set(0, s.nose.y - hj[1], s.nose.z - hj[2]); head.add(n); }
    if (s.tusks && !young) {
      const tm = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.4 });
      for (const sg of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 6), tm); t.position.set(sg * 0.06, 0.5 - hj[1], 0.93 - hj[2]); t.rotation.set(-0.5, 0, sg * 0.6); head.add(t); }
    }
    this.lod = 0;
  }
  // when it goes: its skeleton's bone texture and its own little meshes (the species' mesh and materials stay, shared)
  dispose() {
    this.mesh.skeleton.dispose();
    this.group.traverse(o => { if (o.isMesh && o !== this.mesh) o.geometry.dispose(); });
  }
  setLod(k) { if (k !== this.lod) { this.lod = k; this.mesh.geometry = this.sp.geo[k]; this.mesh.castShadow = k < 2; } }
  // the pose: bone rotations from the gait (wildlife.js) - all angles in radians, about the bones' rest frames
  pose(p) {
    const b = this.bones, q = (i, x, y = 0, z = 0) => b[i].rotation.set(x, y, z, 'YXZ');
    q(BI.hips, p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0);
    q(BI.spine, p.spine ?? 0, p.bend ?? 0, 0); q(BI.chest, p.chest ?? 0, p.bend ?? 0, 0);
    q(BI.neck, p.neck ?? 0, p.headYaw * 0.4 || 0, 0); q(BI.head, p.head ?? 0, p.headYaw * 0.6 || 0, 0);
    q(BI.tail1, p.tail ?? 0, p.tailYaw ?? 0, 0); q(BI.tail2, (p.tail ?? 0) * 0.6, (p.tailYaw ?? 0) * 1.4, 0);
    const L = p.legs;                                                   // [FL, FR, HL, HR]: [upper, middle, lower]
    q(BI.shoulderL, L[0][0]); q(BI.elbowL, L[0][1]); q(BI.wristL, L[0][2]);
    q(BI.shoulderR, L[1][0]); q(BI.elbowR, L[1][1]); q(BI.wristR, L[1][2]);
    q(BI.hipL, L[2][0]); q(BI.kneeL, L[2][1]); q(BI.hockL, L[2][2]);
    q(BI.hipR, L[3][0]); q(BI.kneeR, L[3][1]); q(BI.hockR, L[3][2]);
    b[0].position.y = this.rest[0].y + (p.bob ?? 0);
  }
}
export const SPECIES_KEYS = Object.keys(SPECIES);
