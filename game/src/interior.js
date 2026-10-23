import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeByMaterial, profileAt, section, windscreenSpan, wiperGlass } from './cars.js';

// The cars' cabins, from the driver's seat (V) and through the windows: built for each model from its lofted body
// (cars.js) and the layout of the real interior (photos of the E90, the Corsa C, the 508, the Kangoo II, the T5 and
// the user's photo 86 from the Doblò's seat):
//  * the inside of the body: a skin 3-8 cm inside the paint - headliner, pillars, door cards - which also keeps the
//    sun out of the cabin: the light comes in through the glass only (the windows cast no shadow, cars.js);
//  * the dashboard lofted across the cabin from the foot of the windscreen over its top and down its face to the
//    knees and under to the bulkhead, in its two tones, the trim strip (walnut, aluminium...), the side vents, the
//    demister slots and the glovebox;
//  * the instrument cluster in its recess under the hood: the brand's dials painted (scales, numbers, red zones,
//    rings, displays) and real needles, which follow the speed and the revs and light up when the engine runs;
//  * the steering wheel (rim, spokes, airbag hub with the badge) on its column with the stalks;
//  * the centre stack (vents, radio, climate knobs, screen), the console with the gear lever and the handbrake;
//  * shaped seats (cushion, bolsters, backrest, headrest on its posts), the rear bench fitted under the roof, the
//    seat belts, the door cards (armrest, handle, pocket, speaker), the carpet, pedals, mirror, sun visors.
// Measured from the driver's eyes (headPos, vehicle.js), as a car's package is: the H-point of the seat 0.64 m under
// them and 0.17 m behind, the wheel's centre ~0.57 m ahead and ~0.27 m down, tilted 23-35 degrees, the dials ~0.8 m
// away, seen through the top of the wheel.

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pose = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(1, 1, 1));
const at = (M, ...a) => M.clone().multiply(pose(...a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- each model's cabin: its floor, the dashboard's drop under the eyes (T) and distance ahead of them (D), the wheel,
// the colours (sRGB) and the brand's instruments, stack, gear lever, handbrake and rear seats
export const CABINS = {
  bmw: { saloon: true, floor: 0.26, T: 0.19, D: 0.7, tunnel: 0.2, doors: 4, seat: { kind: 'sport', cover: 'leather', col: 0xcdbb98 },
    col: { top: 0x232324, low: 0xbcaa88, door: 0xbcaa88, liner: 0xc6bba5, carpet: 0x8a7a60, trim: 0x19191a },
    accent: 'walnut', wheel: { spokes: 'bmw', R: 0.186, tilt: 0.42, cover: 'leather', hub: [0.15, 0.12] },
    brand: 'bmw', cluster: 'bmw', stack: 'bmw', vents: 'rect', gear: 'auto', hb: 'lever', rear: 'bench' },
  corsa: { floor: 0.28, T: 0.24, D: 0.68, tunnel: 0.1, doors: 4, seat: { kind: 'std', cover: 'fabric', col: 0x45474b },
    col: { top: 0x3a3c3f, low: 0x484b4e, door: 0x484b4e, liner: 0xa3a5a7, carpet: 0x2e2f31, trim: 0x1d1e20 },
    accent: null, wheel: { spokes: 'three', R: 0.182, tilt: 0.44, cover: 'leather', hub: [0.14, 0.12] },
    brand: 'opel', cluster: 'opel', stack: 'opel', vents: 'round', gear: 'manual', hb: 'lever', rear: 'bench', pod: 'opel' },
  p508: { saloon: true, floor: 0.27, T: 0.2, D: 0.72, tunnel: 0.12, doors: 4, seat: { kind: 'sport', cover: 'fabric', col: 0x2c2c2e },
    col: { top: 0x2a2b2d, low: 0x37383b, door: 0x343538, liner: 0x7c7c7e, carpet: 0x232325, trim: 0x18181a },
    accent: 'alu', wheel: { spokes: 'three', R: 0.183, tilt: 0.42, cover: 'leather', hub: [0.15, 0.115], chrome: true },
    brand: 'peugeot', cluster: 'peugeot', stack: 'peugeot', vents: 'rect', gear: 'manual', hb: 'electric', rear: 'bench' },
  suv: { floor: 0.34, T: 0.22, D: 0.72, tunnel: 0.14, doors: 4, seat: { kind: 'std', cover: 'fabric', col: 0x2f3032 },
    col: { top: 0x262729, low: 0x313235, door: 0x313235, liner: 0x8c8c8e, carpet: 0x252527, trim: 0x18181a },
    accent: 'piano', wheel: { spokes: 'three', R: 0.187, tilt: 0.45, cover: 'leather', hub: [0.15, 0.12], h: -0.3 },
    brand: 'generic', cluster: 'generic', stack: 'generic', vents: 'rect', gear: 'auto', hb: 'electric', rear: 'bench' },
  sedan: { saloon: true, floor: 0.29, T: 0.24, D: 0.7, tunnel: 0.1, doors: 4, seat: { kind: 'std', cover: 'fabric', col: 0x4c4e52 },
    col: { top: 0x2f3032, low: 0x3a3b3e, door: 0x3e3f42, liner: 0x9c9d9e, carpet: 0x2b2c2e, trim: 0x1c1c1e },
    accent: null, wheel: { spokes: 'three', R: 0.19, tilt: 0.46, cover: 'plastic', hub: [0.15, 0.13] },
    brand: 'dacia', cluster: 'dacia', stack: 'dacia', vents: 'round', gear: 'manual', hb: 'lever', rear: 'bench' },
  hatch: { floor: 0.3, T: 0.25, D: 0.7, tunnel: 0.1, doors: 4, seat: { kind: 'std', cover: 'fabric', col: 0x3f4145 },
    col: { top: 0x2e2f31, low: 0x393a3d, door: 0x3d3e41, liner: 0x9a9b9c, carpet: 0x2a2b2d, trim: 0x1c1c1e },
    accent: null, wheel: { spokes: 'three', R: 0.19, tilt: 0.46, cover: 'plastic', hub: [0.15, 0.13] },
    brand: 'dacia', cluster: 'sandero', stack: 'dacia', vents: 'round', gear: 'manual', hb: 'lever', rear: 'bench' },
  kangoo: { floor: 0.32, T: 0.32, D: 0.76, tunnel: 0.04, doors: 4, seat: { kind: 'std', cover: 'fabric', col: 0x77797c },
    col: { top: 0x55575a, low: 0x9a9c9e, door: 0x8f9193, liner: 0xa9abad, carpet: 0x2a2b2c, trim: 0x2a2b2d },
    accent: null, wheel: { spokes: 'four', R: 0.19, tilt: 0.55, cover: 'plastic', hub: [0.15, 0.13], h: -0.36 },
    brand: 'renault', cluster: 'renault', stack: 'renault', vents: 'round', gear: 'dash', hb: 'lever', rear: 'bench', pod: 'renault' },
  van: { floor: 0.52, T: 0.38, D: 0.76, tunnel: 0, doors: 2, hBack: 0.12, seat: { kind: 'van', cover: 'fabric', col: 0x7e8186 },
    col: { top: 0x55575a, low: 0xb4b6b8, door: 0xa9abad, liner: 0xb4b6b8, carpet: 0x1d1d1e, trim: 0x3a3c3e },
    accent: null, wheel: { spokes: 'four', R: 0.195, tilt: 0.62, cover: 'plastic', hub: [0.15, 0.13], h: -0.43, d: 0.55 },
    brand: 'vw', cluster: 'vw', stack: 'vw', vents: 'rect', gear: 'dash', leverHigh: true, hb: 'lever', rear: 'bench2', front: 'double', hood: 0.08 },
  doblo: { floor: 0.42, T: 0.37, D: 0.8, tunnel: 0.03, doors: 2, hBack: 0.12, seat: { kind: 'van', cover: 'fabric', col: 0x515458 },
    col: { top: 0x3d3f42, low: 0x4a4c4f, door: 0x4a4c4f, liner: 0x8a8b8d, carpet: 0x1c1c1d, trim: 0x232426 },
    accent: null, wheel: { spokes: 'four', R: 0.19, tilt: 0.58, cover: 'plastic', hub: [0.15, 0.13], h: -0.42, d: 0.55 },
    brand: 'fiat', cluster: 'fiat', stack: 'fiat', vents: 'rect', gear: 'dash', hb: 'lever', rear: null, demist: 4, hood: 0.1 },
  maybach: { saloon: false, floor: 0.52, T: 0.36, D: 0.78, tunnel: 0.16, doors: 4, seat: { kind: 'lux', cover: 'leather', col: 0xb7a385 },
    col: { top: 0x3b2d23, low: 0xb3a083, door: 0xb3a083, liner: 0xcfc4ae, carpet: 0x8a7a64, trim: 0x1c1a19 },
    accent: 'wood', wheel: { spokes: 'mb', R: 0.19, tilt: 0.45, cover: 'leather', hub: [0.16, 0.12], h: -0.33 },
    brand: 'mb', cluster: 'mbux', stack: 'mb', vents: 'rect', gear: 'column', hb: 'electric', rear: 'exec' },
};

const SPOKES = {
  three: [{ a: -0.1, w: 0.05 }, { a: Math.PI + 0.1, w: 0.05 }, { a: -Math.PI / 2, w: 0.055 }],
  bmw: [{ a: -0.14, w: 0.058 }, { a: Math.PI + 0.14, w: 0.058 }, { a: -Math.PI / 2 - 0.3, w: 0.022 }, { a: -Math.PI / 2 + 0.3, w: 0.022 }],
  four: [{ a: -0.2, w: 0.045 }, { a: Math.PI + 0.2, w: 0.045 }, { a: -Math.PI / 2 - 0.45, w: 0.03 }, { a: -Math.PI / 2 + 0.45, w: 0.03 }],
  mb: [{ a: -0.04, w: 0.05 }, { a: Math.PI + 0.04, w: 0.05 }, { a: -Math.PI / 2, w: 0.045 }],
};

// ---- the instruments, in the atlas's cluster region (1024 x 384 px for a 0.36 x 0.135 m face): dials (k: what the
// needle shows; max, step between numbers, sub ticks per step, red: where the red zone starts), small gauges, displays
const CW = 0.36, CH = 0.135;
const CLUSTERS = {
  bmw: { bg: '#0c0c0d', face: '#0a0a0b', ink: '#f0efea', lit: '#ff8418', ring: 'chrome', needle: 0xff5c12,
    dials: [{ k: 'speed', x: 300, y: 186, r: 150, max: 260, step: 20, sub: 2, fs: 0.12, unit: 'km/h' },
      { k: 'rpm', x: 724, y: 186, r: 150, max: 7, step: 1, sub: 5, red: 6.5, unit: '1/min x1000' }],
    minis: [{ k: 'fuel', x: 724, y: 282, r: 42, l: ['0', '1/1'] }, { k: 'eco', x: 300, y: 282, r: 42, l: ['', ''] }],
    lcd: [{ x: 452, y: 300, w: 120, h: 32, t: '148902 km' }] },
  opel: { bg: '#18191a', face: '#c4c7ca', ink: '#141414', lit: '#f2f1ea', ring: 'thin', needle: 0xff3a1c,
    dials: [{ k: 'rpm', x: 285, y: 196, r: 132, max: 7, step: 1, sub: 2, red: 6, unit: 'x1000/min' },
      { k: 'speed', x: 640, y: 192, r: 158, max: 220, step: 20, sub: 2, fs: 0.12, unit: 'km/h' }],
    minis: [{ k: 'temp', x: 880, y: 128, r: 56, l: ['50', '130'] }, { k: 'fuel', x: 880, y: 270, r: 56, l: ['0', '1/1'] }],
    lcd: [{ x: 578, y: 292, w: 124, h: 30, t: '084215 km' }] },
  peugeot: { bg: '#0b0b0c', face: '#0a0a0b', ink: '#f4f4f2', lit: '#f6f7fb', ring: 'chrome', thick: 0.1, needle: 0xff4a1a,
    dials: [{ k: 'speed', x: 286, y: 192, r: 150, max: 240, step: 20, sub: 2, fs: 0.12, unit: 'km/h' },
      { k: 'rpm', x: 738, y: 192, r: 150, max: 7, step: 1, sub: 2, red: 5, unit: 'x1000 tr/min' }],
    minis: [], lcd: [{ x: 452, y: 84, w: 120, h: 216, screen: 'trip' }] },
  generic: { bg: '#0b0b0c', face: '#0a0a0b', ink: '#f1f3f6', lit: '#eef4ff', ring: 'thin', needle: 0xff4a1a,
    dials: [{ k: 'speed', x: 292, y: 192, r: 152, max: 220, step: 20, sub: 2, fs: 0.12, unit: 'km/h' },
      { k: 'rpm', x: 732, y: 192, r: 152, max: 7, step: 1, sub: 2, red: 6, unit: 'x1000 rpm' }],
    minis: [], lcd: [{ x: 456, y: 80, w: 112, h: 224, screen: 'trip' }] },
  dacia: { bg: '#121213', face: '#0b0b0c', ink: '#f1f1f1', lit: '#e3ece4', ring: 'thin', needle: 0xff4018,
    dials: [{ k: 'rpm', x: 205, y: 205, r: 118, max: 7, step: 1, sub: 2, red: 6, unit: 'x1000' },
      { k: 'speed', x: 512, y: 192, r: 160, max: 200, step: 20, sub: 2, fs: 0.12, unit: 'km/h' }],
    minis: [{ k: 'temp', x: 812, y: 150, r: 60, l: ['C', 'H'] }, { k: 'fuel', x: 812, y: 262, r: 60, l: ['0', '1'] }],
    lcd: [{ x: 452, y: 302, w: 120, h: 30, t: '132507' }] },
  sandero: { bg: '#121213', face: '#0b0b0c', ink: '#f1f1f1', lit: '#e8eef0', ring: 'chrome', needle: 0xff4018,
    dials: [{ k: 'rpm', x: 262, y: 200, r: 136, max: 7, step: 1, sub: 2, red: 6, unit: 'x1000 tr/min' },
      { k: 'speed', x: 512, y: 196, r: 156, max: 200, step: 20, sub: 2, fs: 0.12, unit: 'km/h' }],
    minis: [{ k: 'temp', x: 762, y: 150, r: 56, l: ['C', 'H'] }, { k: 'fuel', x: 762, y: 262, r: 56, l: ['0', '1'] }],
    rings: [[762, 200, 136]], lcd: [{ x: 452, y: 304, w: 120, h: 28, t: '096318' }] },
  renault: { bg: '#141516', face: '#0b0b0c', ink: '#f2f2f2', lit: '#f1f4f8', ring: 'chrome', needle: 0xff3a1a,
    dials: [{ k: 'rpm', x: 250, y: 212, r: 118, max: 6, step: 1, sub: 2, red: 4.5, unit: 'x1000 tr/min' },
      { k: 'speed', x: 512, y: 190, r: 162, max: 180, step: 20, sub: 2, fs: 0.12, unit: 'km/h' }],
    minis: [{ k: 'temp', x: 774, y: 162, r: 54, l: ['C', 'H'] }, { k: 'fuel', x: 774, y: 266, r: 54, l: ['0', '1'] }],
    rings: [[774, 212, 118]], lcd: [{ x: 452, y: 304, w: 120, h: 28, t: '021450 km' }] },
  vw: { bg: '#101112', face: '#0b0b0c', ink: '#f3f3f3', lit: '#ffffff', ring: 'thin', needle: 0xff2a12,
    dials: [{ k: 'rpm', x: 296, y: 190, r: 150, max: 6, step: 1, sub: 2, red: 4.5, unit: '1/min x1000' },
      { k: 'speed', x: 728, y: 190, r: 150, max: 200, step: 20, sub: 2, fs: 0.12, unit: 'km/h' }],
    minis: [], lcd: [{ x: 456, y: 72, w: 112, h: 228, screen: 'mfd' }] },
  fiat: { bg: '#121213', face: '#0c0c0d', ink: '#f2f2f2', lit: '#f0f0ec', ring: 'thin', needle: 0xff4a14,
    dials: [{ k: 'speed', x: 296, y: 196, r: 150, max: 180, step: 20, sub: 2, fs: 0.12, unit: 'km/h' },
      { k: 'rpm', x: 736, y: 196, r: 140, max: 6, step: 1, sub: 2, red: 4.5, unit: 'x1000 rpm' }],
    minis: [{ k: 'temp', x: 516, y: 124, r: 48, l: ['', ''] }, { k: 'fuel', x: 516, y: 236, r: 48, l: ['0', '1'] }],
    lcd: [{ x: 466, y: 300, w: 100, h: 28, t: '214785' }] },
  mbux: { bg: '#04060a', face: '#05080e', ink: '#e6edf6', lit: '#a8d4ff', ring: 'glow', needle: 0xffffff,
    dials: [{ k: 'speed', x: 250, y: 192, r: 150, max: 260, step: 20, sub: 2, fs: 0.12, unit: 'km/h' },
      { k: 'rpm', x: 774, y: 192, r: 150, max: 6, step: 1, sub: 2, red: 5.5, unit: 'x1000/min' }],
    minis: [], lcd: [{ x: 420, y: 70, w: 184, h: 240, screen: 'trip' }] },
};

// ---- the centre stacks, in normalised panel coordinates (u across, v down): panels, vents, radio, screens, knobs
const STACKS = {
  bmw: [['panel', 0, 0, 1, 1, '#1b1b1c', 0.05], ['panel', 0.02, 0, 0.98, 0.31, 'wood', 0.04], ['vent', 0.07, 0.035, 0.47, 0.25, '#151516'],
    ['vent', 0.53, 0.035, 0.93, 0.25, '#151516'], ['haz', 0.5, 0.285, 0.03], ['radio', 0.08, 0.35, 0.92, 0.6, '#ff8418'],
    ['panel', 0.06, 0.64, 0.94, 0.93, '#121213', 0.03], ['knob', 0.2, 0.785, 0.07, 'temp'], ['knob', 0.8, 0.785, 0.07, 'temp'],
    ['lcd', 0.35, 0.69, 0.65, 0.79, '#ff8418', '21.5  AUTO  21.5'], ['btns', 0.33, 0.82, 0.67, 0.9, 5]],
  opel: [['panel', 0, 0, 1, 1, '#a2a5a8', 0.06], ['vent', 0.06, 0.04, 0.44, 0.27, '#7d8083'], ['vent', 0.56, 0.04, 0.94, 0.27, '#7d8083'],
    ['panel', 0.455, 0.04, 0.545, 0.27, '#c8231c', 0.01], ['haz', 0.5, 0.155, 0.028], ['radio', 0.1, 0.33, 0.9, 0.62, '#e8b04a'],
    ['knob', 0.22, 0.8, 0.075, 'temp'], ['knob', 0.5, 0.8, 0.075, 'fan'], ['knob', 0.78, 0.8, 0.075, 'mode']],
  peugeot: [['panel', 0, 0, 1, 1, '#202123', 0.04], ['panel', 0.02, 0.02, 0.98, 0.32, '#cfd2d5', 0.04], ['panel', 0.035, 0.035, 0.965, 0.305, '#141416', 0.035],
    ['vent', 0.05, 0.05, 0.25, 0.29, '#141416'], ['vent', 0.75, 0.05, 0.95, 0.29, '#141416'], ['screen', 0.28, 0.06, 0.72, 0.28, 'nav'],
    ['btns', 0.18, 0.36, 0.82, 0.41, 7], ['haz', 0.5, 0.385, 0.022], ['radio', 0.1, 0.46, 0.9, 0.64, '#ffffff'],
    ['panel', 0.12, 0.7, 0.88, 0.92, '#141416', 0.03], ['knob', 0.25, 0.81, 0.06, 'temp'], ['knob', 0.75, 0.81, 0.06, 'temp'],
    ['lcd', 0.38, 0.75, 0.62, 0.86, '#f0f4ff', '20.0 A/C']],
  generic: [['panel', 0, 0, 1, 1, '#1f2022', 0.04], ['vent', 0.05, 0.04, 0.45, 0.22, '#141416'], ['vent', 0.55, 0.04, 0.95, 0.22, '#141416'],
    ['haz', 0.5, 0.13, 0.026], ['screen', 0.12, 0.27, 0.88, 0.58, 'nav'], ['btns', 0.12, 0.62, 0.88, 0.68, 6],
    ['knob', 0.22, 0.82, 0.07, 'temp'], ['knob', 0.78, 0.82, 0.07, 'temp'], ['lcd', 0.36, 0.76, 0.64, 0.88, '#eef4ff', '21  AUTO']],
  dacia: [['panel', 0, 0, 1, 1, '#2e2f31', 0.04], ['vent', 0.08, 0.04, 0.46, 0.25, '#1a1a1b'], ['vent', 0.54, 0.04, 0.92, 0.25, '#1a1a1b'],
    ['haz', 0.5, 0.145, 0.028], ['radio', 0.1, 0.32, 0.9, 0.56, '#9ad0ff'], ['panel', 0.08, 0.64, 0.92, 0.93, '#262729', 0.03],
    ['knob', 0.22, 0.785, 0.07, 'temp'], ['knob', 0.5, 0.785, 0.07, 'fan'], ['knob', 0.78, 0.785, 0.07, 'mode']],
  renault: [['panel', 0, 0, 1, 1, '#55575a', 0.04], ['panel', 0.04, 0, 0.96, 0.43, '#b5b8bb', 0.05], ['vent', 0.12, 0.03, 0.88, 0.16, '#8e9194'],
    ['knob', 0.24, 0.3, 0.07, 'temp'], ['knob', 0.76, 0.3, 0.07, 'fan'], ['lcd', 0.4, 0.23, 0.6, 0.36, '#ffb347', 'AUTO'],
    ['radio', 0.1, 0.48, 0.9, 0.68, '#ffb347'], ['haz', 0.5, 0.8, 0.032]],
  vw: [['panel', 0, 0, 1, 1, '#5d6063', 0.04], ['vent', 0.03, 0.06, 0.22, 0.3, '#3d3f42'], ['vent', 0.78, 0.06, 0.97, 0.3, '#3d3f42'],
    ['radio', 0.26, 0.05, 0.74, 0.36, '#b4f07a'], ['panel', 0.27, 0.4, 0.73, 0.5, '#1a1b1c', 0.02], ['panel', 0.25, 0.55, 0.75, 0.76, '#4a4c4f', 0.03],
    ['knob', 0.33, 0.655, 0.06, 'temp'], ['knob', 0.5, 0.655, 0.06, 'fan'], ['knob', 0.67, 0.655, 0.06, 'mode'],
    ['btns', 0.04, 0.5, 0.22, 0.58, 2], ['btns', 0.04, 0.61, 0.22, 0.69, 2], ['btns', 0.78, 0.5, 0.96, 0.58, 2], ['haz', 0.13, 0.85, 0.032]],
  fiat: [['panel', 0, 0, 1, 1, '#3a3c3f', 0.04], ['vent', 0.07, 0.04, 0.45, 0.26, '#232426'], ['vent', 0.55, 0.04, 0.93, 0.26, '#232426'],
    ['haz', 0.5, 0.15, 0.028], ['radio', 0.1, 0.33, 0.9, 0.57, '#ff9a30'], ['knob', 0.22, 0.78, 0.07, 'temp'],
    ['knob', 0.5, 0.78, 0.07, 'fan'], ['knob', 0.78, 0.78, 0.07, 'mode']],
  mb: [['panel', 0, 0, 1, 1, '#1a1612', 0.03], ['vent', 0.02, 0.03, 0.235, 0.25, '#8e9296'], ['vent', 0.265, 0.03, 0.48, 0.25, '#8e9296'],
    ['vent', 0.52, 0.03, 0.735, 0.25, '#8e9296'], ['vent', 0.765, 0.03, 0.98, 0.25, '#8e9296'], ['panel', 0.04, 0.3, 0.96, 0.42, '#0e0e0f', 0.03],
    ['btns', 0.06, 0.32, 0.94, 0.4, 8], ['haz', 0.5, 0.36, 0.02], ['panel', 0, 0.46, 1, 1, 'wood', 0.02]],
};

// ---- the atlas each model's small parts are painted on (1024 x 768): [x, y, w, h]
const AW = 1024, AH = 768;
const AT = { CL: [0, 0, 1024, 384], ST: [0, 384, 384, 384], LG: [384, 384, 256, 256], DP: [640, 384, 384, 192],
  VR: [640, 576, 256, 128], VO: [896, 576, 128, 128], DS: [384, 640, 256, 128], KN: [640, 704, 64, 64], GT: [704, 704, 64, 64] };
// a geometry's uv (0..1) into a region of the atlas
function inAtlas(g, r) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (r[0] + uv.getX(i) * r[2]) / AW, 1 - (r[1] + (1 - uv.getY(i)) * r[3]) / AH);
  return g;
}

// seeded random, so every build paints the same
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const font = (px, w = 'bold') => `${w} ${Math.max(6, Math.round(px))}px Arial, Helvetica, sans-serif`;
function chrome(c, x0, y0, x1, y1) {
  const gr = c.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#f5f7f9'); gr.addColorStop(0.35, '#8d9196'); gr.addColorStop(0.55, '#e4e7ea'); gr.addColorStop(1, '#6e7276');
  return gr;
}
function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); }
function woodFill(c, x, y, w, h, base = '#5a3519') {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = base; c.fillRect(x, y, w, h);
  const r = rng(11);
  for (let i = 0; i < 260; i++) {
    const cx = x + r() * w, cy = y + r() * h, rx = 4 + r() * w * 0.12, ry = 2 + r() * h * 0.08;
    c.strokeStyle = r() < 0.5 ? `rgba(30,14,5,${0.15 + r() * 0.25})` : `rgba(150,95,50,${0.1 + r() * 0.2})`;
    c.lineWidth = 0.6 + r() * 1.6; c.beginPath(); c.ellipse(cx, cy, rx, ry, r() * 0.6 - 0.3, 0, Math.PI * 2); c.stroke();
  }
  const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.restore();
}

// a round dial: face, ring, scale, numbers, red zone (the same on the emissive canvas, lit, on black)
function dial(g, h, st, d) {
  const sweep = 4.19, a0 = -sweep / 2, n = Math.round(d.max / d.step), r = d.r;
  const P = (f, rr) => [d.x + Math.sin(a0 + f * sweep) * rr, d.y - Math.cos(a0 + f * sweep) * rr];
  for (const [c, lit] of [[g, false], [h, true]]) {
    c.fillStyle = lit ? '#000' : st.face; c.beginPath(); c.arc(d.x, d.y, r, 0, Math.PI * 2); c.fill();
    if (!lit && st.ring === 'chrome') { c.strokeStyle = chrome(c, d.x - r, d.y - r, d.x + r, d.y + r); c.lineWidth = r * (st.thick ?? 0.07); c.beginPath(); c.arc(d.x, d.y, r * 1.0, 0, Math.PI * 2); c.stroke(); }
    if (!lit && st.ring === 'thin') { c.strokeStyle = '#55585c'; c.lineWidth = r * 0.025; c.beginPath(); c.arc(d.x, d.y, r * 0.99, 0, Math.PI * 2); c.stroke(); }
    if (st.ring === 'glow') { c.strokeStyle = lit ? '#2a86ff' : '#1e5fb8'; c.lineWidth = r * 0.03; c.beginPath(); c.arc(d.x, d.y, r * 0.98, -Math.PI / 2 + a0, -Math.PI / 2 + a0 + sweep); c.stroke(); }
    const ink = lit ? st.lit : st.ink;
    if (d.red != null) { c.strokeStyle = lit ? '#ff2a10' : '#d4231a'; c.lineWidth = r * 0.07; c.beginPath(); c.arc(d.x, d.y, r * 0.875, -Math.PI / 2 + a0 + d.red / d.max * sweep, -Math.PI / 2 + a0 + sweep); c.stroke(); }
    const N = n * d.sub;
    for (let i = 0; i <= N; i++) {
      const f = i / N, major = i % d.sub === 0, [x0, y0] = P(f, r * (major ? 0.78 : 0.85)), [x1, y1] = P(f, r * 0.92);
      c.strokeStyle = d.red != null && f * d.max >= d.red - 1e-6 ? (lit ? '#ff2a10' : '#e0281c') : ink;
      c.lineWidth = r * (major ? 0.03 : 0.014); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.fillStyle = ink; c.font = font(r * (d.fs ?? 0.17)); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k <= n; k += d.every ?? 1) { const [x, y] = P(k / n, r * 0.62); c.fillText(String(Math.round(k * d.step)), x, y); }
    if (d.unit) { c.font = font(r * 0.085, 'normal'); c.fillText(d.unit, d.x, d.y - r * 0.32); }
  }
  return { k: d.k, x: d.x, y: d.y, r, a0, a1: a0 + sweep, max: d.max };
}
// a small gauge on an arc over its centre (fuel, temperature)
function mini(g, h, st, d) {
  const a0 = -0.9, a1 = 0.9, r = d.r;
  const P = (f, rr) => [d.x + Math.sin(a0 + f * (a1 - a0)) * rr, d.y - Math.cos(a0 + f * (a1 - a0)) * rr];
  for (const [c, lit] of [[g, false], [h, true]]) {
    const ink = lit ? st.lit : st.ink;
    c.strokeStyle = ink; c.lineWidth = r * 0.06; c.beginPath(); c.arc(d.x, d.y, r * 0.9, -Math.PI / 2 + a0, -Math.PI / 2 + a1); c.stroke();
    for (const f of [0, 0.5, 1]) { const [x0, y0] = P(f, r * 0.72), [x1, y1] = P(f, r * 0.95); c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
    if (d.k === 'fuel' || d.k === 'temp') { c.strokeStyle = lit ? '#ff2a10' : '#d4231a'; c.lineWidth = r * 0.08; c.beginPath(); c.arc(d.x, d.y, r * 0.9, ...(d.k === 'fuel' ? [-Math.PI / 2 + a0, -Math.PI / 2 + a0 + 0.3] : [-Math.PI / 2 + a1 - 0.3, -Math.PI / 2 + a1])); c.stroke(); }
    c.fillStyle = ink; c.font = font(r * 0.3); c.textAlign = 'center'; c.textBaseline = 'middle';
    const [lx0, ly0] = P(0, r * 1.25), [lx1, ly1] = P(1, r * 1.25);
    c.fillText(d.l?.[0] ?? '', lx0, ly0 + r * 0.15); c.fillText(d.l?.[1] ?? '', lx1, ly1 + r * 0.15);
  }
  return { k: d.k, x: d.x, y: d.y, r: r * 0.95, a0, a1, max: 1 };
}
function lcdText(c, x, y, w, hh, txt, col, lit) {
  rrect(c, x, y, w, hh, 4); c.fillStyle = lit ? '#000' : '#0b0e0c'; c.fill();
  c.fillStyle = col; c.font = font(hh * 0.62); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x + w / 2, y + hh / 2 + 1);
}
// a display in the cluster or on the dash: trip computer, a multi-function display, a map
function screen(c, x, y, w, hh, kind, ink, lit) {
  rrect(c, x, y, w, hh, 8); c.fillStyle = lit ? '#000' : kind === 'nav' || kind === 'mb' ? '#0d1522' : '#08090b'; c.fill();
  c.save(); rrect(c, x, y, w, hh, 8); c.clip();
  if (kind === 'nav' || kind === 'mb') {
    const r = rng(5);
    c.fillStyle = lit ? '#0a1626' : '#16243a'; c.fillRect(x, y, w, hh);
    // a town map: blocks, a park, the river, side streets and two main roads
    c.fillStyle = lit ? '#0e2a1c' : '#1d3a2c'; c.fillRect(x + w * 0.62, y + hh * 0.08, w * 0.22, hh * 0.25);
    c.strokeStyle = lit ? '#123a66' : '#24507e'; c.lineWidth = Math.max(4, w * 0.035);
    c.beginPath(); c.moveTo(x - 5, y + hh * 0.7); c.bezierCurveTo(x + w * 0.3, y + hh * 0.6, x + w * 0.6, y + hh * 0.95, x + w + 5, y + hh * 0.82); c.stroke();
    c.strokeStyle = lit ? '#3a5274' : '#56698a';
    for (let i = 0; i < 7; i++) { const a = 0.06 * (r() - 0.5), yy = y + hh * (0.08 + i * 0.14 + 0.04 * r()); c.lineWidth = 1.5 + r() * 1.5; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy + w * a); c.stroke(); }
    for (let i = 0; i < 6; i++) { const a = 0.08 * (r() - 0.5), xx = x + w * (0.07 + i * 0.17 + 0.05 * r()); c.lineWidth = 1.5 + r() * 1.5; c.beginPath(); c.moveTo(xx, y); c.lineTo(xx + hh * a, y + hh); c.stroke(); }
    c.strokeStyle = lit ? '#7d8ea8' : '#9aa7bb'; c.lineWidth = Math.max(3, w * 0.022);
    c.beginPath(); c.moveTo(x, y + hh * 0.45); c.lineTo(x + w, y + hh * 0.38); c.stroke(); c.beginPath(); c.moveTo(x + w * 0.3, y); c.lineTo(x + w * 0.36, y + hh); c.stroke();
    c.strokeStyle = '#38a0ff'; c.lineWidth = Math.max(3, w * 0.03); c.beginPath(); c.moveTo(x + w * 0.5, y + hh); c.lineTo(x + w * 0.5, y + hh * 0.55); c.lineTo(x + w * 0.75, y + hh * 0.3); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + w * 0.5, y + hh * 0.78); c.lineTo(x + w * 0.47, y + hh * 0.86); c.lineTo(x + w * 0.53, y + hh * 0.86); c.fill();
    c.fillStyle = lit ? '#cfe4ff' : '#e8eef6'; c.font = font(hh * 0.09); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('Str. Uzinei  ·  1.2 km', x + w * 0.05, y + hh * 0.05);
  } else {
    c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(w * 0.17); c.fillText(kind === 'mfd' ? 'D' : '14°C', x + w / 2, y + hh * 0.2);
    c.font = font(w * 0.13, 'normal'); c.fillText('6.8 l/100', x + w / 2, y + hh * 0.45); c.fillText('412 km', x + w / 2, y + hh * 0.62);
    c.fillText('12:45', x + w / 2, y + hh * 0.85);
  }
  c.restore();
}

function paintCluster(g, h, key) {
  const st = CLUSTERS[key];
  const [x0, y0, w, hh] = AT.CL;
  g.fillStyle = st.bg; g.fillRect(x0, y0, w, hh);
  const vg = g.createRadialGradient(512, 192, 60, 512, 192, 560); vg.addColorStop(0, 'rgba(255,255,255,0.04)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg; g.fillRect(x0, y0, w, hh);
  if (key === 'mbux') { const bg = g.createLinearGradient(0, 0, 0, 384); bg.addColorStop(0, '#0a1424'); bg.addColorStop(1, '#03050a'); g.fillStyle = bg; g.fillRect(0, 0, 1024, 384); }
  const out = [];
  for (const rr of st.rings ?? []) for (const [c, lit] of [[g, false], [h, true]]) {
    c.fillStyle = lit ? '#000' : st.face; c.beginPath(); c.arc(rr[0], rr[1], rr[2], 0, Math.PI * 2); c.fill();
    if (!lit) { c.strokeStyle = chrome(c, rr[0] - rr[2], rr[1] - rr[2], rr[0] + rr[2], rr[1] + rr[2]); c.lineWidth = rr[2] * 0.07; c.beginPath(); c.arc(rr[0], rr[1], rr[2], 0, Math.PI * 2); c.stroke(); }
  }
  for (const d of st.dials) out.push(dial(g, h, st, d));
  for (const d of st.minis) out.push(mini(g, h, st, d));
  for (const l of st.lcd) {
    if (l.screen) { screen(g, l.x, l.y, l.w, l.h, l.screen, st.ink, false); screen(h, l.x, l.y, l.w, l.h, l.screen, st.lit, true); }
    else { lcdText(g, l.x, l.y, l.w, l.h, l.t, st.lit, false); lcdText(h, l.x, l.y, l.w, l.h, l.t, st.lit, true); }
  }
  // the warning lamps' row, unlit
  g.globalAlpha = 0.35; g.fillStyle = '#3a3a3a';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(452 + i * 24, 40, 6, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  return { st, dials: out };
}

function paintStack(g, h, key) {
  const [x0, y0, W, H] = AT.ST;
  const X = (u) => x0 + u * W, Y = (v) => y0 + v * H, S = (k) => k * W;
  const knobs = [];
  for (const f of STACKS[key]) {
    const t = f[0];
    if (t === 'panel') {
      const [, u0, v0, u1, v1, col, rr] = f;
      if (col === 'wood') woodFill(g, X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0));
      else { rrect(g, X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0), S(rr)); g.fillStyle = col; g.fill(); }
    } else if (t === 'vent') {
      const [, u0, v0, u1, v1, frame] = f, x = X(u0), y = Y(v0), w = X(u1) - x, hh = Y(v1) - y;
      rrect(g, x, y, w, hh, S(0.02)); g.fillStyle = frame; g.fill();
      rrect(g, x + w * 0.04, y + hh * 0.07, w * 0.92, hh * 0.86, S(0.015)); g.fillStyle = '#070708'; g.fill();
      for (let k = 0; k < 6; k++) {
        const yy = y + hh * (0.15 + k * 0.14);
        g.fillStyle = '#2b2b2d'; g.fillRect(x + w * 0.06, yy, w * 0.88, hh * 0.05); g.fillStyle = '#3c3c3f'; g.fillRect(x + w * 0.06, yy, w * 0.88, hh * 0.015);
      }
      g.fillStyle = '#4a4a4d'; rrect(g, x + w * 0.46, y + hh * 0.4, w * 0.08, hh * 0.2, 2); g.fill();
    } else if (t === 'radio') {
      const [, u0, v0, u1, v1, lcd] = f, x = X(u0), y = Y(v0), w = X(u1) - x, hh = Y(v1) - y;
      rrect(g, x, y, w, hh, S(0.02)); g.fillStyle = '#111112'; g.fill();
      g.fillStyle = '#000'; g.fillRect(x + w * 0.2, y + hh * 0.08, w * 0.6, hh * 0.03); g.fillStyle = '#2a2a2c'; g.fillRect(x + w * 0.2, y + hh * 0.11, w * 0.6, hh * 0.01);
      for (const [c, lit] of [[g, false], [h, true]]) lcdText(c, x + w * 0.28, y + hh * 0.2, w * 0.44, hh * 0.28, 'FM 98.4  KISS', lcd, lit);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
        rrect(g, x + w * (0.1 + i * 0.135), y + hh * (0.58 + j * 0.2), w * 0.11, hh * 0.15, 3); g.fillStyle = '#2a2b2d'; g.fill();
        g.fillStyle = '#c8c8c8'; g.font = font(hh * 0.09); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1 + j * 6), x + w * (0.155 + i * 0.135), y + hh * (0.655 + j * 0.2));
      }
      for (const u of [0.12, 0.88]) { knobs.push({ u: u0 + (u1 - u0) * u, v: v0 + (v1 - v0) * 0.33, r: (u1 - u0) * 0.055, small: true }); g.fillStyle = '#060607'; g.beginPath(); g.arc(x + w * u, y + hh * 0.33, w * 0.07, 0, Math.PI * 2); g.fill(); }
    } else if (t === 'screen') {
      const [, u0, v0, u1, v1, kind] = f;
      screen(g, X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0), kind, '#e8eef6', false); screen(h, X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0), kind, '#cfe4ff', true);
    } else if (t === 'knob') {
      const [, u, v, r, kind] = f, x = X(u), y = Y(v), R = S(r);
      g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(x, y, R * 1.35, 0, Math.PI * 2); g.fill();
      for (const [c, lit] of [[g, false], [h, true]]) {
        if (kind === 'temp') { const gr = c.createLinearGradient(x - R, y, x + R, y); gr.addColorStop(0, '#2f7dff'); gr.addColorStop(1, '#ff3a1a'); c.strokeStyle = gr; c.lineWidth = R * 0.14; c.beginPath(); c.arc(x, y, R * 1.2, Math.PI * 0.75, Math.PI * 2.25); c.stroke(); }
        else { c.fillStyle = lit ? '#e8e8e8' : '#d0d0d0'; for (let i = 0; i < 5; i++) { const a = Math.PI * 0.75 + i * Math.PI * 0.375; c.beginPath(); c.arc(x + Math.cos(a) * R * 1.2, y + Math.sin(a) * R * 1.2, R * 0.06, 0, Math.PI * 2); c.fill(); } }
      }
      knobs.push({ u, v, r });
    } else if (t === 'btns') {
      const [, u0, v0, u1, v1, n] = f, x = X(u0), y = Y(v0), w = X(u1) - x, hh = Y(v1) - y, bw = w / n;
      for (let i = 0; i < n; i++) { rrect(g, x + i * bw + bw * 0.08, y, bw * 0.84, hh, 3); g.fillStyle = '#28292b'; g.fill(); g.fillStyle = '#d6d6d6'; g.fillRect(x + i * bw + bw * 0.4, y + hh * 0.42, bw * 0.2, hh * 0.16); }
    } else if (t === 'haz') {
      const [, u, v, r] = f, x = X(u), y = Y(v), R = S(r);
      for (const [c, lit] of [[g, false], [h, true]]) {
        rrect(c, x - R, y - R, R * 2, R * 2, R * 0.3); c.fillStyle = lit ? '#300400' : '#b81c14'; c.fill();
        c.strokeStyle = lit ? '#ff5030' : '#f2f2f2'; c.lineWidth = R * 0.18; c.beginPath(); c.moveTo(x, y - R * 0.55); c.lineTo(x + R * 0.55, y + R * 0.4); c.lineTo(x - R * 0.55, y + R * 0.4); c.closePath(); c.stroke();
      }
    } else if (t === 'lcd') {
      const [, u0, v0, u1, v1, col, txt] = f;
      for (const [c, lit] of [[g, false], [h, true]]) lcdText(c, X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0), txt, col, lit);
    }
  }
  return knobs;
}

// the badge on the wheel's hub (and the dark hub around it)
function paintLogo(g, brand) {
  const [x0, y0] = AT.LG;
  g.save(); g.translate(x0 + 128, y0 + 128);
  g.fillStyle = '#141415'; g.fillRect(-128, -128, 256, 256);
  const cr = (r) => chrome(g, -r, -r, r, r);
  if (brand === 'bmw') {
    g.fillStyle = cr(118); g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(0, 0, 108, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9ecef'; g.font = font(40); g.textAlign = 'center'; g.textBaseline = 'middle';
    [...'BMW'].forEach((ch, i) => { const a = -0.55 + i * 0.55; g.save(); g.rotate(a); g.fillText(ch, 0, -86); g.restore(); });
    g.fillStyle = cr(66); g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.fill();
    for (let q = 0; q < 4; q++) { g.fillStyle = q % 2 ? '#f3f5f7' : '#1c69d4'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 60, -Math.PI / 2 + q * Math.PI / 2, q * Math.PI / 2); g.closePath(); g.fill(); }
  } else if (brand === 'opel') {
    g.strokeStyle = cr(110); g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 104, 0, Math.PI * 2); g.stroke();
    g.fillStyle = cr(110); g.beginPath(); g.moveTo(-112, 6); g.lineTo(-8, 6); g.lineTo(18, -30); g.lineTo(112, -10); g.lineTo(112, -2); g.lineTo(26, -14); g.lineTo(4, 20); g.lineTo(-112, 20); g.closePath(); g.fill();
  } else if (brand === 'peugeot') {
    // the lion rampant, facing left, its forepaws raised, the tail curling up behind
    g.fillStyle = cr(110); g.beginPath();
    g.moveTo(-28, -95); g.bezierCurveTo(-5, -90, 8, -70, 0, -50); g.lineTo(15, -35); g.bezierCurveTo(40, -15, 50, 10, 45, 35);
    g.bezierCurveTo(48, 55, 55, 75, 50, 98); g.lineTo(30, 98); g.bezierCurveTo(32, 80, 25, 62, 15, 55); g.bezierCurveTo(10, 70, 8, 85, 5, 98);
    g.lineTo(-15, 98); g.bezierCurveTo(-12, 75, -10, 55, -15, 40); g.bezierCurveTo(-25, 20, -30, 10, -40, 5);
    g.lineTo(-62, 18); g.lineTo(-78, 14); g.lineTo(-70, 4); g.lineTo(-50, -5); g.lineTo(-72, -22); g.lineTo(-90, -24); g.lineTo(-84, -34); g.lineTo(-55, -30);
    g.bezierCurveTo(-58, -42, -62, -50, -78, -55); g.lineTo(-82, -66); g.bezierCurveTo(-70, -80, -55, -92, -28, -95); g.closePath(); g.fill();
    g.strokeStyle = cr(110); g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(44, 32); g.bezierCurveTo(75, 20, 80, -10, 64, -30); g.stroke();
    g.beginPath(); g.arc(62, -36, 9, 0, Math.PI * 2); g.fill();
  } else if (brand === 'dacia') {
    g.fillStyle = cr(110); g.beginPath(); g.moveTo(-80, -90); g.lineTo(80, -90); g.bezierCurveTo(85, 0, 60, 60, 0, 105); g.bezierCurveTo(-60, 60, -85, 0, -80, -90); g.fill();
    g.fillStyle = '#1a3d8a'; g.beginPath(); g.moveTo(-60, -72); g.lineTo(60, -72); g.bezierCurveTo(64, -5, 45, 45, 0, 80); g.bezierCurveTo(-45, 45, -64, -5, -60, -72); g.fill();
    g.fillStyle = cr(80); g.font = font(30); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DACIA', 0, -10);
  } else if (brand === 'renault') {
    g.fillStyle = cr(110); g.beginPath(); g.moveTo(0, -116); g.lineTo(72, 0); g.lineTo(0, 116); g.lineTo(-72, 0); g.closePath(); g.fill();
    g.fillStyle = '#141415'; g.beginPath(); g.moveTo(0, -66); g.lineTo(40, 0); g.lineTo(0, 66); g.lineTo(-40, 0); g.closePath(); g.fill();
  } else if (brand === 'vw') {
    g.strokeStyle = cr(110); g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 106, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 15; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-58, -78); g.lineTo(0, 22); g.lineTo(58, -78); g.stroke();
    g.beginPath(); g.moveTo(-92, -30); g.lineTo(-44, 82); g.lineTo(0, 10); g.lineTo(44, 82); g.lineTo(92, -30); g.stroke();
  } else if (brand === 'fiat') {
    g.fillStyle = cr(116); g.beginPath(); g.arc(0, 0, 116, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9c111a'; rrect(g, -78, -96, 156, 192, 40); g.fill();
    g.fillStyle = cr(80); g.font = font(56); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FIAT', 0, 4);
  } else if (brand === 'mb') {
    g.strokeStyle = cr(110); g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 108, 0, Math.PI * 2); g.stroke();
    g.fillStyle = cr(110);
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a + 2.4) * 16, Math.sin(a + 2.4) * 16); g.lineTo(0, 0); g.lineTo(Math.cos(a - 2.4) * 16, Math.sin(a - 2.4) * 16); g.closePath(); g.fill(); }
  } else {
    g.strokeStyle = cr(110); g.lineWidth = 12; g.beginPath(); g.ellipse(0, 0, 108, 70, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

function paintSmall(g, h, spec) {
  // a top display (Opel's info display, Renault's), the vents' faces, the door switches, a gear knob's top
  const [dx, dy, dw, dh] = AT.DP;
  const col = spec.pod === 'renault' ? '#ffb347' : '#e8c060';
  if (spec.cluster === 'mbux') { screen(g, dx, dy, dw, dh, 'mb', '#e8eef6', false); screen(h, dx, dy, dw, dh, 'mb', '#cfe4ff', true); }
  else for (const [c, lit] of [[g, false], [h, true]]) {
    rrect(c, dx, dy, dw, dh, 10); c.fillStyle = lit ? '#000' : '#10130f'; c.fill();
    c.fillStyle = col; c.font = font(dh * 0.3); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('12:45', dx + dw * 0.3, dy + dh * 0.5); c.font = font(dh * 0.22); c.fillText('14°C', dx + dw * 0.72, dy + dh * 0.5);
  }
  const [vx, vy, vw, vh] = AT.VR;
  rrect(g, vx, vy, vw, vh, 10); g.fillStyle = '#1b1b1d'; g.fill(); rrect(g, vx + 8, vy + 8, vw - 16, vh - 16, 8); g.fillStyle = '#070708'; g.fill();
  for (let k = 0; k < 6; k++) { const yy = vy + 16 + k * 17; g.fillStyle = '#2b2b2d'; g.fillRect(vx + 14, yy, vw - 28, 7); g.fillStyle = '#3d3d40'; g.fillRect(vx + 14, yy, vw - 28, 2); }
  g.fillStyle = '#4a4a4d'; rrect(g, vx + vw / 2 - 10, vy + vh / 2 - 14, 20, 28, 3); g.fill();
  const [ox, oy, ow] = AT.VO, oc = ox + ow / 2, ocy = oy + ow / 2;
  g.fillStyle = '#141415'; g.fillRect(ox, oy, ow, ow);
  g.strokeStyle = chrome(g, ox, oy, ox + ow, oy + ow); g.lineWidth = 9; g.beginPath(); g.arc(oc, ocy, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#060607'; g.beginPath(); g.arc(oc, ocy, 51, 0, Math.PI * 2); g.fill();
  for (let k = -2; k <= 2; k++) { g.fillStyle = '#2c2c2e'; g.fillRect(oc - Math.sqrt(48 * 48 - (k * 17) ** 2), ocy + k * 17 - 3, 2 * Math.sqrt(48 * 48 - (k * 17) ** 2), 6); }
  g.fillStyle = '#3d3d40'; g.beginPath(); g.arc(oc, ocy, 10, 0, Math.PI * 2); g.fill();
  const [sx, sy, sw, sh] = AT.DS;
  g.fillStyle = '#151516'; g.fillRect(sx, sy, sw, sh);
  for (let i = 0; i < 2; i++) { rrect(g, sx + 26 + i * 86, sy + 18, 64, 92, 10); g.fillStyle = '#2c2d2f'; g.fill(); g.fillStyle = '#d8d8d8'; g.beginPath(); g.moveTo(sx + 58 + i * 86, sy + 40); g.lineTo(sx + 48 + i * 86, sy + 56); g.lineTo(sx + 68 + i * 86, sy + 56); g.fill(); }
  g.fillStyle = '#2c2d2f'; g.beginPath(); g.arc(sx + 214, sy + 64, 26, 0, Math.PI * 2); g.fill();
  const [kx, ky] = AT.KN;
  g.fillStyle = '#121213'; g.fillRect(kx, ky, 64, 64); g.strokeStyle = '#e6e6e6'; g.lineWidth = 2.5; g.font = font(11); g.fillStyle = '#e6e6e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.beginPath(); for (const x of [16, 32, 48]) { g.moveTo(kx + x, ky + 18); g.lineTo(kx + x, ky + 46); } g.moveTo(kx + 16, ky + 32); g.lineTo(kx + 48, ky + 32); g.stroke();
  [['1', 16, 11], ['3', 32, 11], ['5', 48, 11], ['2', 16, 53], ['4', 32, 53], ['R', 48, 53]].forEach(([t, x, y]) => g.fillText(t, kx + x, ky + y));
  const [gx, gy] = AT.GT;
  g.fillStyle = '#121213'; g.fillRect(gx, gy, 64, 64);
  for (const [c, lit] of [[g, false], [h, true]]) { c.font = font(13); c.textAlign = 'center'; c.textBaseline = 'middle'; ['P', 'R', 'N', 'D'].forEach((t, i) => { c.fillStyle = t === 'P' ? (lit ? '#ff9a30' : '#f0f0f0') : lit ? '#3a2a10' : '#9a9a9a'; c.fillText(t, gx + 32, gy + 9 + i * 15); }); }
}

function makeAtlas(spec) {
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const e = document.createElement('canvas'); e.width = AW / 2; e.height = AH / 2;
  const g = c.getContext('2d'), h = e.getContext('2d');
  h.scale(0.5, 0.5);
  g.fillStyle = '#1a1a1b'; g.fillRect(0, 0, AW, AH); h.fillStyle = '#000'; h.fillRect(0, 0, AW, AH);
  const cl = paintCluster(g, h, spec.cluster);
  const knobs = paintStack(g, h, spec.stack);
  paintLogo(g, spec.brand);
  paintSmall(g, h, spec);
  const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
  map.colorSpace = em.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return { map, em, cluster: cl, knobs };
}

// ---- the navigation's screen (the car's own, or your phone in its clip on a vent): the map; NO SIGNAL on the hill of
// the cross (main.js), the map frozen and dimmed behind it; dark with the engine off. Shared by every car: each switches
// its own material between them
let NAVT = null;
function navTextures() {
  if (NAVT) return NAVT;
  const mk = (draw) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const e = document.createElement('canvas'); e.width = 256; e.height = 128;
    const g = c.getContext('2d'), h = e.getContext('2d');
    h.scale(0.5, 0.5);
    draw(g, false); draw(h, true);
    const map = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
    map.colorSpace = em.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return { map, em };
  };
  NAVT = {
    on: mk((c, lit) => screen(c, 0, 0, 512, 256, 'nav', '#e8eef6', lit)),
    off: mk((c, lit) => { c.fillStyle = lit ? '#000' : '#060708'; c.fillRect(0, 0, 512, 256); }),
    nosig: mk((c, lit) => {
      screen(c, 0, 0, 512, 256, 'nav', '#e8eef6', lit);
      c.fillStyle = lit ? 'rgba(0,0,0,0.8)' : 'rgba(8,10,14,0.8)'; c.fillRect(0, 0, 512, 256);
      // the satellite (its body, two panels), struck through
      c.save(); c.translate(256, 84); c.rotate(-Math.PI / 4);
      c.fillStyle = lit ? '#c8d2e0' : '#b8c4d4';
      c.fillRect(-11, -11, 22, 22); c.fillRect(-46, -8, 28, 16); c.fillRect(18, -8, 28, 16);
      c.fillRect(-18, -2, 7, 4); c.fillRect(11, -2, 7, 4);
      c.restore();
      c.strokeStyle = lit ? '#ff4a2e' : '#ff5a3c'; c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.moveTo(220, 50); c.lineTo(292, 118); c.stroke();
      c.fillStyle = lit ? '#ffffff' : '#f4f6f8'; c.font = font(58); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('NO SIGNAL', 256, 168);
      c.fillStyle = lit ? '#9aa8bc' : '#8e9cb0'; c.font = font(24, 'normal'); c.fillText('GPS', 256, 214);
    }),
  };
  return NAVT;
}

// ---- the surface textures, grey, tinted by each material's colour (shared by all the models)
const TX = {};
export function surfTex(key) {
  if (TX[key]) return TX[key];
  const n = key === 'wood' ? 512 : 256, c = document.createElement('canvas'); c.width = n; c.height = key === 'wood' ? 128 : n;
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), D = img.data, r = rng(key.length * 977 + 3);
  // value noise (tiling): a few octaves for mottling
  const grid = (cells) => { const v = Array.from({ length: cells * cells }, r); return (x, y) => {
    const fx = x / c.width * cells, fy = y / c.height * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const q = (i, j) => v[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(q(ix, iy), q(ix + 1, iy), sx), lerp(q(ix, iy + 1), q(ix + 1, iy + 1), sx), sy); }; };
  const o1 = grid(8), o2 = grid(32);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4, w = r();
    let v = 230, R, G, B;
    if (key === 'grain') v = 226 + 14 * o2(x, y) + 16 * (w - 0.5);
    else if (key === 'fabric') v = 188 + 34 * ((x + y) % 4 < 2 ? 1 : 0) + 22 * w + 16 * o1(x, y);
    else if (key === 'leather') v = 214 + 22 * o1(x, y) + 14 * o2(x, y) + 10 * (w - 0.5);
    else if (key === 'carpet') v = 150 + 100 * w * (0.6 + 0.4 * o2(x, y));
    else if (key === 'felt') v = 232 + 18 * w;
    else if (key === 'alu') v = 205 + 30 * ((o2(0, y) + r() * 0.3) - 0.6);
    if (key === 'wood') {
      const t = Math.sin(x * 0.11 + 9 * o2(x, y) + 4 * o1(x, y)) * 0.5 + 0.5;
      R = lerp(70, 150, t); G = lerp(40, 95, t); B = lerp(20, 52, t);
    } else R = G = B = clamp(v, 0, 255);
    D[i] = R; D[i + 1] = G; D[i + 2] = B; D[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return TX[key] = t;
}

function cabinMats(spec, atlas) {
  const C = spec.col, leather = spec.seat.cover === 'leather';
  // (inside the car: dry, and lit by the sky through the glass only - less of it than in the open)
  const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.userData.noWet = true; m.envMapIntensity = 0.55; return m; };
  const low = mk({ color: C.low, roughness: 0.72, map: surfTex('grain') });
  const acc = { walnut: () => mk({ color: 0xffffff, map: surfTex('wood'), roughness: 0.2 }), wood: () => mk({ color: 0xd8c8b8, map: surfTex('wood'), roughness: 0.42 }),
    alu: () => mk({ color: 0x8e9195, map: surfTex('alu'), metalness: 1, roughness: 0.42 }), piano: () => mk({ color: 0x060607, roughness: 0.08 }),
    silver: () => mk({ color: 0x9da0a4, metalness: 0.6, roughness: 0.38 }) };
  const cl = CLUSTERS[spec.cluster];
  return {
    top: mk({ color: C.top, roughness: 0.84, map: surfTex('grain') }), low,
    door: C.door === C.low ? low : mk({ color: C.door, roughness: 0.75, map: surfTex('grain') }),
    trim: mk({ color: C.trim, roughness: 0.5 }),
    seat: mk({ color: spec.seat.col, roughness: leather ? 0.52 : 0.96, map: surfTex(leather ? 'leather' : 'fabric') }),
    carpet: mk({ color: C.carpet, roughness: 1, map: surfTex('carpet') }),
    liner: mk({ color: C.liner, roughness: 0.95, map: surfTex('felt') }),
    shell: mk({ vertexColors: true, roughness: 0.93, map: surfTex('felt'), side: THREE.BackSide }),
    chrome: mk({ color: 0xc9ccd0, roughness: 0.22, metalness: 1 }),
    mirror: mk({ color: 0xa0a6ac, roughness: 0.04, metalness: 1 }),
    wheel: mk({ color: spec.wheel.cover === 'leather' ? 0x171718 : 0x222324, roughness: spec.wheel.cover === 'leather' ? 0.55 : 0.72, map: surfTex(spec.wheel.cover === 'leather' ? 'leather' : 'grain') }),
    accent: spec.accent ? acc[spec.accent]() : null,
    atlas: mk({ map: atlas.map, emissiveMap: atlas.em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35 }),
    needle: mk({ color: cl.needle, emissive: cl.needle, emissiveIntensity: 0, roughness: 0.4 }),
    nav: mk({ map: navTextures().off.map, emissiveMap: navTextures().off.em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 }),
    phone: mk({ color: 0x0b0b0c, roughness: 0.18, metalness: 0.4 }),
  };
}

// a rounded box whose top (+y) or front (-z / +z) bulges like a cushion, and narrows toward its top (taper)
function pillow(w, h, d, r, o = {}) {
  const g = new RoundedBoxGeometry(w, h, d, o.seg ?? 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const p = g.attributes.position, b = o.bulge ?? 0, tp = o.taper ?? 0;
  const bell = (a, c) => Math.max(0, 1 - a * a) * Math.max(0, 1 - c * c);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = x / (w / 2), v = y / (h / 2), t = z / (d / 2);
    if (b && o.face === '+y' && v > 0) y += b * bell(u, t) * Math.min(1, v * 1.5);
    else if (b && o.face === '-z' && t < 0) z -= b * bell(u, v) * Math.min(1, -t * 1.5);
    else if (b && o.face === '+z' && t > 0) z += b * bell(u, v) * Math.min(1, t * 1.5);
    if (tp) x *= 1 - tp * (v + 1) / 2;
    p.setXYZ(i, x, y, z);
  }
  smoothNormals(g);
  return g;
}
const rbox = (w, h, d, r, seg = 1) => pillow(w, h, d, r, { seg });
// smooth normals over a non-indexed mesh: averaged at every position, whatever the uv seams
function smoothNormals(g) {
  const p = g.attributes.position.array, n = new Float32Array(p.length), acc = new Map();
  // (a number for a position to 0.1 mm, within +-2 m: exact in a double)
  const key = (i) => (Math.round(p[i] * 1e4) + 2e4) + (Math.round(p[i + 1] * 1e4) + 2e4) * 4e4 + (Math.round(p[i + 2] * 1e4) + 2e4) * 1.6e9;
  const a = V3(), b = V3(), c = V3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i); b.fromArray(p, i + 3).sub(a); c.fromArray(p, i + 6).sub(a); b.cross(c);
    for (let k = 0; k < 3; k++) { const kk = key(i + 3 * k); const v = acc.get(kk); if (v) { v[0] += b.x; v[1] += b.y; v[2] += b.z; } else acc.set(kk, [b.x, b.y, b.z]); }
  }
  for (let i = 0; i < p.length; i += 3) { const v = acc.get(key(i)), l = Math.hypot(v[0], v[1], v[2]) || 1; n[i] = v[0] / l; n[i + 1] = v[1] / l; n[i + 2] = v[2] / l; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
}

// a surface through rows of points (the same count in each): uv by distance (or uvAt(i, j)), facing `toward`,
// cells skip(i, j) left out
function grid(rows, toward, { skip, uvs = 4, uvAt } = {}) {
  const nr = rows.length, nc = rows[0].length;
  const pos = new Float32Array(nr * nc * 3), uv = new Float32Array(nr * nc * 2);
  rows.forEach((row, i) => row.forEach((p, j) => p.toArray(pos, (i * nc + j) * 3)));
  for (let i = 0; i < nr; i++) for (let j = 0, a = 0; j < nc; j++) { if (j) a += rows[i][j].distanceTo(rows[i][j - 1]); uv[(i * nc + j) * 2] = a * uvs; }
  for (let j = 0; j < nc; j++) for (let i = 0, a = 0; i < nr; i++) { if (i) a += rows[i][j].distanceTo(rows[i - 1][j]); uv[(i * nc + j) * 2 + 1] = a * uvs; }
  if (uvAt) for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const [u, v] = uvAt(i, j); uv[(i * nc + j) * 2] = u; uv[(i * nc + j) * 2 + 1] = v; }
  const idx = [], e1 = V3(), e2 = V3(), e3 = V3();
  let facing = 0;
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    if (skip?.(i, j)) continue;
    const a = i * nc + j, b = a + 1, c = a + nc, d = c + 1;
    idx.push(a, b, c, b, d, c);
    if (toward) { e1.subVectors(rows[i][j + 1], rows[i][j]); e2.subVectors(rows[i + 1][j], rows[i][j]); facing += e1.cross(e2).dot(e3.subVectors(toward, rows[i][j])); }
  }
  if (facing < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a box whose broad face looks along `n`, centred at p, its long side along `up`
function slab(w, h, d, r, p, n, up = V3(0, 1, 0)) {
  const z = n.clone().normalize(), x = V3().crossVectors(up, z).normalize(), y = V3().crossVectors(z, x);
  return [rbox(w, h, d, r), new THREE.Matrix4().makeBasis(x, y, z).setPosition(p)];
}

// ---- the inside of the body: its painted surface (not the glass, not the underside) moved 3-8 cm in, seen from inside,
// coloured by height: the headliner and pillars above the belt, the door tops, the door cards
function shellGeo(m, body, caps, C) {
  const pos = [], nor = [], col = [], uv = [], c = new THREE.Color();
  const cLiner = new THREE.Color(C.liner), cDoor = new THREE.Color(C.door), cTop = new THREE.Color(C.top), cTrim = new THREE.Color(C.trim);
  // (2.2 cm in at the sides and pillars, ~6 cm under the roof: the headliner hangs below the roof's skin and its
  // bows; the window seals between stay narrow)
  const offAt = (ny) => 0.022 + 0.04 * Math.max(0, ny);
  const vert = (x, y, z, nx, ny, nz, trim) => {
    const off = offAt(ny), px = x - nx * off, py = y - ny * off, pz = z - nz * off, s = pz + m.L / 2;
    pos.push(px, py, pz); nor.push(nx, ny, nz); uv.push(s * 3, (Math.abs(px) + py) * 3);
    const b = profileAt(m, s).belt;
    // (the black of the trim panel outside the sail by the mirror is black inside too; a blacked-out B pillar is not:
    // inside it is the headliner's trim)
    c.copy(trim && py > b - 0.03 && s < m.wind[1] + 0.15 ? cTrim : py > b + 0.02 ? cLiner : py > b - 0.09 ? cTop : cDoor);
    col.push(c.r, c.g, c.b);
  };
  const P = body.attributes.position, N = body.attributes.normal, I = body.index.array;
  for (const gr of body.groups) {
    if (gr.materialIndex === 1 || gr.materialIndex === 3) continue;
    for (let k = gr.start; k < gr.start + gr.count; k++) { const i = I[k]; vert(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), gr.materialIndex === 2); }
  }
  // the window frames: round every edge between glass and paint, a strip from the outside surface to the inside skin
  // (the seals, black), so no gap shows the world past the glass's edge
  const glassTri = [], edges = new Map(), cSeal = new THREE.Color(C.trim);
  for (const gr of body.groups) for (let k = gr.start; k < gr.start + gr.count; k += 3) {
    if (gr.materialIndex === 3) continue;
    for (let e = 0; e < 3; e++) {
      const a = I[k + e], b = I[k + (e + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a;
      const v = edges.get(key) ?? edges.set(key, { a, b, glass: 0, paint: 0 }).get(key);
      if (gr.materialIndex === 1) v.glass++; else v.paint++;
    }
  }
  for (const { a, b, glass, paint } of edges.values()) {
    if (!glass || !paint) continue;
    const q = [a, b].map(i => { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), off = offAt(ny);
      return { o: [x, y, z], i: [x - nx * off, y - ny * off, z - nz * off], n: [nx, ny, nz] }; });
    const quad = [q[0].o, q[1].o, q[1].i, q[0].o, q[1].i, q[0].i];
    for (const tri of [quad, [...quad].reverse()]) for (const p of tri) { pos.push(...p); nor.push(...q[0].n); uv.push(0, 0); col.push(cSeal.r, cSeal.g, cSeal.b); }
  }
  // the rear end's inside (a tailgate's), not the front one (the engine bay)
  const CP = caps.attributes.position, CN = caps.attributes.normal;
  for (let i = 0; i < CP.count; i += 3) if (CP.getZ(i) > 0) for (let k = i; k < i + 3; k++) vert(CP.getX(k), CP.getY(k), CP.getZ(k), CN.getX(k), CN.getY(k), CN.getZ(k));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// ---- the windscreen seen from inside (V73): a skin 4 mm inside the body's glass, exactly over it, which draws what a
// real one shows from the driver's seat:
//  * the black ceramic band fired onto its edges (the frit: it hides the glue and the pillars' edges), solid then in
//    dots that thin out inward (a 4 mm hexagonal halftone) - wider at the top and bottom than at the sides - and the
//    patch behind the mirror's foot at the top;
//  * the laminated glass's tint (it passes ~80-86 %, a little more green than red);
//  * the dashboard mirrored in it (the veil: from inside, the glass's slope sends the eye's rays down onto the dash),
//    as bright as the dash is lit, by Fresnel for two faces of glass at that angle; elsewhere the dim cabin.
// Two draws over the same triangles: one multiplies what is behind (tint, the band's black), one adds the reflection.
// Each point carries (across, up the slope, to the side edge, to the top edge) in metres.
function windscreenGeo(m, eye, zA) {
  const [s0, s1] = windscreenSpan(m);
  if (s0 === null) return null;
  const NS = 30, NX = 40, f = (s) => { const R = section(m, s); return { x8: R[8][0], y8: R[8][1], y9: R[9][1] }; };
  // the length up the slope along its middle, from the foot
  const len = [0];
  for (let i = 1; i <= NS; i++) {
    const a = s0 + (s1 - s0) * (i - 1) / NS, b = s0 + (s1 - s0) * i / NS;
    len.push(len[i - 1] + Math.hypot(b - a, f(b).y9 - f(a).y9));
  }
  const L = len[NS], P = [], E = [];
  for (let i = 0; i <= NS; i++) {
    const s = s0 + (s1 - s0) * i / NS, q = f(s), slant = Math.hypot(1, (q.y8 - q.y9) / Math.max(0.05, q.x8));
    for (let j = 0; j <= NX; j++) {
      const u = -1 + 2 * j / NX, x = u * q.x8;
      P.push(V3(x, q.y9 + (q.y8 - q.y9) * Math.abs(u), zA(s)));
      E.push(x, len[i], (q.x8 - Math.abs(x)) * slant, L - len[i]);
    }
  }
  // normals from the neighbours, toward the eye; the skin 4 mm in from the glass
  const id = (i, j) => i * (NX + 1) + j, pos = [], nor = [];
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NX; j++) {
    const a = P[id(Math.max(0, i - 1), j)], b = P[id(Math.min(NS, i + 1), j)], c = P[id(i, Math.max(0, j - 1))], d = P[id(i, Math.min(NX, j + 1))];
    const n = b.clone().sub(a).cross(d.clone().sub(c)).normalize();
    if (n.dot(eye.clone().sub(P[id(i, j)])) < 0) n.negate();
    const p = P[id(i, j)].clone().addScaledVector(n, 0.004);
    pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
  }
  const idx = [];
  for (let i = 0; i < NS; i++) for (let j = 0; j < NX; j++) idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aE', new THREE.Float32BufferAttribute(E, 4)); g.setIndex(idx);
  g.addGroup(0, idx.length, 0); g.addGroup(0, idx.length, 1);
  g.computeBoundingSphere();
  return g;
}
const WS_VERT = /* glsl */`
attribute vec4 aE;
varying vec4 vE; varying vec3 vP, vN;
void main() { vE = aE; vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WS_COMMON = /* glsl */`
uniform vec4 uFrit;                   // the band's solid widths: top, sides, foot; the width its dots fade over (m)
uniform vec3 uPatch;                  // the patch behind the mirror: half width at the top, at its foot; its height
varying vec4 vE; varying vec3 vP, vN;
// the distance to the nearest dot centre of a hexagonal grid of pitch p
float hexD(vec2 q, float p) {
  vec2 r = vec2(p, p * 1.7320508), h = r * 0.5;
  return min(length(mod(q, r) - h), length(mod(q - h, r) - h));
}
// how much of a point is black: 1 in the solid band, dots whose area shrinks to 0 inward
float frit() {
  float band = uFrit.w;
  float fT = 1.0 - clamp((vE.w - uFrit.x) / band, 0.0, 1.0);
  float fS = 1.0 - clamp((vE.z - uFrit.y) / band, 0.0, 1.0);
  float fB = 1.0 - clamp((vE.y - uFrit.z) / band, 0.0, 1.0);
  float hw = mix(uPatch.x, uPatch.y, clamp(vE.w / uPatch.z, 0.0, 1.0));
  float fP = 1.0 - clamp(max(abs(vE.x) - hw, vE.w - uPatch.z) / (band * 0.6), 0.0, 1.0);
  float f = max(max(fT, fS), max(fB, fP));
  if (f >= 0.999) return 1.0;
  if (f <= 0.001) return 0.0;
  const float P = 0.0042;
  float r = 0.5 * P * sqrt(f);                            // (the dots' area grows with f; they touch at f = 1)
  float d = hexD(vE.xy, P), w = fwidth(vE.y) * 0.7 + 1e-6;
  float sharp = 1.0 - smoothstep(r - w, r + w, d);
  return mix(sharp, f, clamp((w / P - 0.2) * 2.5, 0.0, 1.0));   // (dots finer than the pixels: their average)
}`;
const WS_MUL = /* glsl */`
uniform vec3 uTint;
${WS_COMMON}
void main() { gl_FragColor = vec4(mix(uTint, vec3(0.0), frit()), 1.0); }`;
const WS_ADD = /* glsl */`
uniform vec3 uCam;                    // the eye, in the car's frame
uniform vec4 uDash;                   // the dash's top: its height at the lip, its slope (dy/dz), the lip's z, the glass foot's z
uniform float uDashW;
uniform vec3 uDashRad, uCabRad;       // how bright the dash's top is; the rest of the cabin
uniform vec3 uSunL, uSunE;            // the sun (or the moon) in the car's frame; its light
uniform vec4 uW0, uW1;                // the wipers (cars.js wiperGlass): pivot across, up the slope; blade from, to (m)
uniform float uWOff;                  // (their glass's foot, up the slope from this one's)
${WS_COMMON}
float wsHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float wsNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wsHash(i), wsHash(i + vec2(1.0, 0.0)), f.x), mix(wsHash(i + vec2(0.0, 1.0)), wsHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// how much of a wiper's sweep a point is in (it parks at 0.07 rad and goes up to top)
float swept(vec2 g, vec4 w, float top) {
  vec2 d = g - vec2(w.x, w.y + uWOff);
  float r = length(d), a = atan(d.y, d.x);
  return smoothstep(w.z - 0.04, w.z, r) * (1.0 - smoothstep(w.w, w.w + 0.04, r)) * (1.0 - smoothstep(top, top + 0.06, a)) * smoothstep(-0.06, 0.04, a);
}
void main() {
  vec3 V = normalize(vP - uCam), N = normalize(vN);
  if (dot(N, V) > 0.0) N = -N;
  float c = clamp(-dot(V, N), 0.0, 1.0);
  float F = min(1.0, (0.04 + 0.96 * pow(1.0 - c, 5.0)) * 1.9);   // (two faces)
  vec3 R = reflect(V, N), refl = uCabRad;
  float den = R.y - uDash.y * R.z;
  if (abs(den) > 1e-4) {
    float t = (uDash.x + uDash.y * (vP.z - uDash.z) - vP.y) / den;
    vec3 h = vP + t * R;
    if (t > 0.0 && h.z < uDash.z && h.z > uDash.w && abs(h.x) < uDashW) {
      // (the demister's slots, dark lines along the glass's foot)
      float g = h.z - uDash.w, slot = step(0.04, g) * step(g, 0.1) * step(0.5, fract(h.x * 9.0));
      refl = uDashRad * (1.0 - 0.7 * slot);
    }
  }
  vec3 col = F * refl;
  // the film a windscreen gathers (dust, a wiper's smear; ~1 % of the light through it scattered: haze in ASTM D1003's
  // sense - cleaner where the blades go, thicker in the corners they miss, the arcs of their strokes in it), lit by
  // the sun from outside and scattering it forward (Henyey-Greenstein, g = 0.7): a veil toward a low sun, nothing
  // away from it. Single scattering in a thin layer: the sun's light x its depth along the view x the phase.
  float lit = smoothstep(0.0, 0.08, dot(-N, uSunL));
  if (lit > 0.0) {
    float mu = dot(V, uSunL), g = 0.7, hg = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec2 q = vE.xy;
    float sA = swept(q, uW0, 1.85), sB = swept(q, uW1, 1.65), sw = max(sA, sB);
    float film = 0.55 + 0.7 * wsNoise(q * 7.0) * wsNoise(q * 23.0 + 3.1) + 0.25 * wsNoise(q * 61.0);
    // (the arcs: the blade leaves fine concentric streaks where it wipes)
    float r = sA >= sB ? length(q - vec2(uW0.x, uW0.y + uWOff)) : length(q - vec2(uW1.x, uW1.y + uWOff));
    float arcs = 0.8 + 0.45 * wsNoise(vec2(r * 110.0, atan(q.y, q.x - uW0.x) * 4.0)) * wsNoise(vec2(r * 37.0 + 5.0, q.x * 6.0));
    float tau = 0.012 * film * mix(1.6, 0.55 * arcs, sw);
    col += uSunE * lit * tau * hg / max(0.15, abs(dot(N, V))) * (1.0 - frit());
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function windscreenMats(spec, dash) {
  const u = {
    uFrit: { value: new THREE.Vector4(...(spec.frit ?? [0.065, 0.032, 0.08, 0.035])) },
    uPatch: { value: new THREE.Vector3(0.085, 0.055, spec.patch ?? 0.1) },
  };
  const mul = new THREE.ShaderMaterial({ vertexShader: WS_VERT, fragmentShader: WS_MUL, uniforms: { ...u, uTint: { value: new THREE.Color(0.91, 0.97, 0.945) } },
    transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false });
  const add = new THREE.ShaderMaterial({ vertexShader: WS_VERT, fragmentShader: WS_ADD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...u, uCam: { value: V3() }, uDash: { value: new THREE.Vector4(...dash.plane) }, uDashW: { value: dash.w },
      uDashRad: { value: new THREE.Color(0, 0, 0) }, uCabRad: { value: new THREE.Color(0, 0, 0) },
      uSunL: { value: V3(0, 1, 0) }, uSunE: { value: new THREE.Color(0, 0, 0) },
      uW0: { value: new THREE.Vector4(...dash.wipers.W[0]) }, uW1: { value: new THREE.Vector4(...dash.wipers.W[1]) }, uWOff: { value: dash.wipers.off } } });
  for (const m of [mul, add]) { m.side = THREE.DoubleSide; m.userData.noWet = true; }
  add.userData.dashAlbedo = new THREE.Color(spec.col.top);              // (sRGB in, linear here)
  return [mul, add];
}

// ---- a seat about its H-point (forward -z): cushion, bolsters, backrest, its plastic back, the headrest on posts
function seatParts(kind, w, mats, { back, len = 0.85, heads = [0] } = {}) {
  const out = [], sport = kind === 'sport' || kind === 'lux';
  back ??= kind === 'van' ? 0.3 : kind === 'lux' ? 0.34 : kind === 'bench' ? 0.42 : 0.37;
  const C = pose(0, -0.15, -0.19, 0.19);
  out.push([pillow(w - (sport ? 0.13 : 0.02), 0.11, 0.5, 0.045, { bulge: 0.014, face: '+y' }), mats.seat, C]);
  if (sport) for (const sg of [-1, 1]) out.push([pillow(0.09, 0.13, 0.48, 0.04, { bulge: 0.01, face: '+y' }), mats.seat, at(C, sg * (w / 2 - 0.045), 0.03, 0, 0, 0, sg * 0.12)]);
  // the backrest and the headrest within len along the back: tall, lower, sitting on the backrest, or none
  const B = pose(0, -0.07, 0.11, back), bh = len >= 0.85 ? 0.62 : len >= 0.76 ? 0.6 : len >= 0.66 ? 0.53 : len - 0.03;
  out.push([pillow(w - (sport ? 0.12 : 0.02), bh, 0.11, 0.045, { bulge: 0.018, face: '-z', taper: kind === 'bench' ? 0 : 0.08 }), mats.seat, at(B, 0, bh / 2, 0)]);
  if (sport) for (const sg of [-1, 1]) out.push([pillow(0.09, bh - 0.08, 0.14, 0.04), mats.seat, at(B, sg * (w / 2 - 0.05), bh / 2 - 0.02, -0.02, 0, sg * 0.28, 0)]);
  if (kind !== 'bench') out.push([rbox(w - 0.05, bh - 0.06, 0.03, 0.012), mats.trim, at(B, 0, bh / 2, 0.06)]);
  if (len >= 0.66) for (const x of heads) {
    const hy = len >= 0.85 ? bh + 0.14 : len >= 0.76 ? bh + 0.07 : bh + 0.05;
    out.push([pillow(0.26, 0.17, 0.1, 0.045, { bulge: 0.01, face: '-z' }), mats.seat, at(B, x, hy, 0.005)]);
    for (const sg of [-1, 1]) out.push([new THREE.CylinderGeometry(0.0055, 0.0055, hy - bh + 0.02, 8), mats.chrome, at(B, x + sg * 0.075, (bh + hy) / 2 - 0.03, 0.012)]);
  }
  return out;
}

const CACHE = {};
export function buildCabin(key, m, body, caps) {
  const spec = CABINS[key];
  if (!spec) return null;
  const k = CACHE[key] ??= makeCabin(m, spec, body, caps);
  // this car's own meshes on the model's geometry, and its own copy of the lit materials (its dials alone light up)
  const atlas = k.mats.atlas.clone(), needle = k.mats.needle.clone(), nav = k.mats.nav.clone();
  const own = (mats) => mats.map(x => x === k.mats.atlas ? atlas : x === k.mats.needle ? needle : x === k.mats.nav ? nav : x);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(k.shell, k.mats.shell), rigid = new THREE.Mesh(k.rigid.geo, own(k.rigid.mats));
  for (const o of [shell, rigid]) { o.castShadow = true; o.receiveShadow = true; }
  const steer = new THREE.Group();
  steer.position.copy(k.wheelAt); steer.rotation.x = -k.tilt;
  const wm = new THREE.Mesh(k.wheel.geo, own(k.wheel.mats)); wm.castShadow = true; wm.receiveShadow = true;
  steer.add(wm);
  const face = new THREE.Group(); face.matrix.copy(k.faceM);
  const needles = k.dials.map(d => { const p = new THREE.Object3D(); p.position.set(d.lx, d.ly, 0.004); p.add(new THREE.Mesh(d.geo, needle)); face.add(p); return { p, d }; });
  group.add(shell, rigid, steer, face);
  const phone = k.phone && new THREE.Mesh(k.phone.geo, own(k.phone.mats));
  if (phone) group.add(phone);
  // the windscreen's inside (from a seat in this car only: main.js), after the body's glass
  let screen = null;
  if (k.screen) {
    screen = new THREE.Mesh(k.screen, k.screenMats);
    screen.renderOrder = 2; screen.visible = false; screen.frustumCulled = false; screen.userData.noAO = true; screen.userData.ueSkip = 'cabin';
    const inv = new THREE.Matrix4(), cam = V3();
    screen.onBeforeRender = (r, sc, camera) => { k.screenMats[1].uniforms.uCam.value.copy(cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv.copy(screen.matrixWorld).invert())); };
    group.add(screen);
  }
  // (nothing in a cabin moves but the wheel and the needles, which are updated where they turn: vehicle.js, update())
  group.traverse(o => { if (o !== face) o.updateMatrix(); o.matrixAutoUpdate = false; });
  let state = '';
  const cabin = {
    group, steer, info: k.info, screen, mirror: k.mirrorAt, pkg: k.pkg,
    // the light on the dash the windscreen mirrors (main.js): the sun's direction in the car's frame, its light and
    // the sky's (irradiance, as three.js has it: a surface's radiance is albedo / pi times it)
    lightGlass(sunLocal, sunC, skyC) {
      const u = k.screenMats?.[1].uniforms, a = k.screenMats?.[1].userData.dashAlbedo;
      if (!u) return;
      // (the sun reaches the dash's top only through the windscreen: from ahead and above it; the roof and pillars
      // leave the dash under ~40 % of the sky, the rest of the cabin under a fraction of that)
      const vis = Math.min(1, Math.max(0, -sunLocal.z * 2.5)) * Math.min(1, Math.max(0, sunLocal.y * 6)) * Math.min(1, Math.max(0, 1.6 - 1.4 * Math.abs(sunLocal.x)));
      const d = vis * Math.max(0, sunLocal.y) / Math.PI;
      u.uDashRad.value.setRGB(a.r * (sunC.r * d + skyC.r * 0.4 / Math.PI), a.g * (sunC.g * d + skyC.g * 0.4 / Math.PI), a.b * (sunC.b * d + skyC.b * 0.4 / Math.PI));
      u.uCabRad.value.copy(skyC).multiplyScalar(0.12 * 0.12 / Math.PI);
      u.uSunL.value.copy(sunLocal).normalize(); u.uSunE.value.copy(sunC);
    },
    // the needles: the speed, the revs, the fuel and the temperature (at rest with the engine off); the dials' light
    // (by day the needles and a little of the scales, at night all of it); the navigation: its map, or NO SIGNAL
    update(v, on, night = 0, noSignal = false) {
      for (const { p, d } of needles) {
        const f = !on ? 0 : d.k === 'speed' ? Math.abs(v.speed) * 3.6 / d.max : d.k === 'rpm' ? v.rpm / 1000 / d.max : d.k === 'fuel' ? 0.68 : d.k === 'temp' ? 0.5 : 0.3;
        p.rotation.z = -(d.a0 + clamp(f, 0, 1.02) * (d.a1 - d.a0)); p.updateMatrix();
      }
      const s = (on ? (night > 0.5 ? 'n' : 'd') : 'o') + (on && noSignal ? 'x' : '');
      if (s !== state) {
        state = s; atlas.emissiveIntensity = on ? (night > 0.5 ? 1 : 0.25) : 0; needle.emissiveIntensity = on ? (night > 0.5 ? 1.4 : 0.6) : 0;
        rigid.castShadow = wm.castShadow = on;        // (the seats', the dash's shadows inside: in the car you drive)
        const t = navTextures()[!on ? 'off' : noSignal ? 'nosig' : 'on'];
        nav.map = t.map; nav.emissiveMap = t.em; nav.emissiveIntensity = on ? (night > 0.5 ? 0.9 : 0.75) : 0;
        if (phone) phone.visible = on;                  // (you take your phone with you)
      }
    },
  };
  cabin.update(null, false);
  return cabin;
}

function makeCabin(m, spec, body, caps) {
  const atlas = makeAtlas(spec), mats = cabinMats(spec, atlas);
  const L = m.L, zA = (s) => s - L / 2;
  const es = m.pillars[0] - 0.06, ey = m.eyeY, ex = -0.37;
  const yF = spec.floor, hs = es + (spec.hBack ?? 0.17), hy = ey - 0.64;
  const P3 = (d, h, x) => V3(x, ey + h, zA(es - d));            // d ahead of the eyes, h above them
  const eyeP = V3(ex, ey, zA(es));
  const SEC = new Map();
  const sec = (s) => { const k = Math.round(s * 200); let R = SEC.get(k); if (!R) SEC.set(k, R = section(m, k / 200)); return R; };
  // the body's half width at a height, on the section at s
  const halfAt = (s, y) => {
    const R = sec(s);
    if (y <= R[1][1]) return R[1][0];
    for (let i = 1; i < R.length - 1; i++) {
      const [x0, y0] = R[i], [x1, y1] = R[i + 1];
      if (y1 !== y0 && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    }
    return R[R.length - 2][0] * 0.5;
  };
  const inner = (s, y, t = 0.045) => Math.max(0.12, halfAt(s, y) - t);
  const glassY = (s) => profileAt(m, s).roof;
  const parts = [], put = (g, mat, M) => { if (mat) parts.push([g, mat, M]); };
  let hasNav = false;

  // ---- the dashboard
  let T = spec.T, D = spec.D;
  if (ey - T > glassY(es - D) - 0.035) T = ey - (glassY(es - D) - 0.035);
  const topH = (d) => -T - 0.05 * (d - D);
  const lim = (d) => glassY(es - d) - 0.015 - ey;
  const dMax = es - m.wind[0] + 0.02;
  let dG = dMax, meet = false;
  for (let d = D; d < dMax; d += 0.005) if (topH(d) >= lim(d)) { dG = d; meet = true; break; }
  if (dG < D + 0.16) { D = dG - 0.16; }
  // (a dash lower than the windscreen's foot rises to meet it over its last 30 cm)
  const rise = meet ? 0 : Math.max(0, lim(dG) - topH(dG));
  const topAt = (d) => Math.min(lim(d), topH(d) + rise * sstep(dG - 0.3, dG, d));
  const pl = [], nTop = Math.max(2, Math.ceil((dG - D - 0.1) / 0.06));
  for (let i = 0; i < nTop; i++) { const d = lerp(dG, D + 0.1, i / nTop); pl.push([d, topAt(d)]); }
  const iA = pl.length;
  pl.push([D + 0.1, topH(D + 0.1)], [D + 0.03, topH(D + 0.03)]);
  for (const [dd, h] of [[0.006, -0.003], [-0.004, -0.02], [-0.008, -0.05], [-0.024, -0.135], [-0.05, -0.2], [-0.085, -0.29], [-0.125, -0.35],
    [-0.115, -0.395], [-0.05, -0.425], [0.15, -0.44], [0.4, -0.43]]) pl.push([D + dd, -T + h]);
  const iB = iA + 5;
  const mbux = spec.cluster === 'mbux', sw = spec.sw ?? 0.26;
  const cutL = ex - CW / 2 - 0.012, cutR = ex + CW / 2 + 0.012;
  const XS = [...new Set([...Array.from({ length: 51 }, (_, i) => -1.25 + i * 0.05), cutL, cutR, -sw / 2, sw / 2].map(v => Math.round(v * 1e4) / 1e4))].sort((a, b) => a - b);
  const rows = pl.map(([d, h]) => { const w = inner(es - d, ey + h); return XS.map(x => P3(d, h, clamp(x, -w, w))); });
  const inCut = (j) => !mbux && XS[j] >= cutL - 1e-6 && XS[j + 1] <= cutR + 1e-6;
  put(grid(rows.slice(0, iB + 1), eyeP, { skip: (i, j) => i >= iA && i < iB && inCut(j) }), mats.top);
  put(grid(rows.slice(iB), eyeP), mats.low);
  // the face, from the lip down: where it is at a height, and which way it looks (toward the driver)
  const facePts = pl.slice(iA + 1);
  const faceAt = (h) => {
    for (let i = 0; i < facePts.length - 1; i++) {
      const [d0, h0] = facePts[i], [d1, h1] = facePts[i + 1];
      if (h <= h0 && h >= h1 && h0 !== h1) { const t = (h0 - h) / (h0 - h1), dd = d1 - d0, dh = h1 - h0, l = Math.hypot(dd, dh); return { d: d0 + dd * t, n: [dh / l, -dd / l] }; }
    }
    return { d: facePts[facePts.length - 1][0], n: [-1, 0] };
  };
  const onFace = (h, x, off = 0) => { const f = faceAt(h); return { p: P3(f.d + f.n[0] * off, h + f.n[1] * off, x), n: V3(0, f.n[1], -f.n[0]) }; };
  // the trim strip across the face (walnut, aluminium, piano black)
  if (mats.accent) {
    const r = [-T - 0.15, -T - 0.175, -T - 0.2].map(h => { const f = faceAt(h); const w = inner(es - f.d, ey + h) - 0.004; return XS.map(x => P3(f.d + f.n[0] * 0.004, h + f.n[1] * 0.004, clamp(x, -w, w))); });
    put(grid(r, eyeP, { uvs: 5 }), mats.accent);
  }
  // demister slots along the foot of the windscreen
  const slots = spec.demist === 4 ? [-0.58, -0.2, 0.2, 0.58] : [-0.36, 0.36];
  for (const x of slots) { const d = dG - 0.06, h = topAt(d) + 0.001; put(rbox(spec.demist ? 0.22 : 0.4, 0.004, 0.014, 0.002), mats.trim, pose(x, ey + h, zA(es - d))); }
  // the side vents at the dash's ends, the glovebox
  {
    const h = -T - 0.075, f = faceAt(h);
    for (const sg of [-1, 1]) {
      const w = inner(es - f.d, ey + h), x = sg * (w - 0.13), o = onFace(h, x, 0.003);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), o.n);
      const M = new THREE.Matrix4().compose(o.p, q, V3(1, 1, 1));
      if (spec.vents === 'round') put(inAtlas(new THREE.CircleGeometry(0.042, 28), AT.VO), mats.atlas, M);
      else put(inAtlas(new THREE.PlaneGeometry(0.13, 0.065), AT.VR), mats.atlas, M);
    }
    const g = onFace(-T - 0.27, 0.42, 0.006);
    const [gb, gM] = slab(0.36, 0.14, 0.012, 0.01, g.p, g.n); put(gb, mats.low, gM);
    const gh = onFace(-T - 0.215, 0.42, 0.013); const [hb, hM] = slab(0.09, 0.018, 0.012, 0.005, gh.p, gh.n); put(hb, mats.trim, hM);
  }

  // ---- the instruments: the cluster's face in its recess under the hood (the MBUX's glass panel standing on the dash)
  let faceM;
  if (!mbux) {
    const hh = spec.hood ?? 0.065, hwH = CW / 2 + 0.06;
    const arch = (x) => { const u = Math.abs((x - ex) / hwH); return u >= 1 ? 0 : hh * (1 - u ** 4); };
    const d0 = D - 0.035, d1 = Math.min(D + 0.27, dG - 0.01), NX = 18, NV = 9;
    const xsH = Array.from({ length: NX + 1 }, (_, j) => ex - hwH + 2 * hwH * j / NX);
    const hood = [xsH.map(x => P3(d0, Math.min(topH(d0) + arch(x) * 0.66, lim(d0)), x))];
    for (let i = 0; i <= NV; i++) { const v = i / NV, d = lerp(d0, d1, v); hood.push(xsH.map(x => P3(d, Math.min(topAt(d) + arch(x) * (1 - sstep(0.3, 1, v)), lim(d)), x))); }
    put(grid(hood, V3(ex, ey + 1, zA(es))), mats.top);
    // (its top just under the sight line past the hood's lip, its bottom over the recess's sill)
    const Cc = P3(D + 0.08, -T - 0.06, ex);
    faceM = new THREE.Matrix4().lookAt(eyeP, Cc, V3(0, 1, 0)).setPosition(Cc);
    put(new THREE.PlaneGeometry(CW + 0.05, CH + 0.09), mats.trim, at(faceM, 0, 0, -0.006));
    // the recess: its floor and sides
    put(new THREE.PlaneGeometry(cutR - cutL, 0.14), mats.trim, pose(ex, ey - T - 0.135, zA(es - D - 0.04), -Math.PI / 2));
    for (const [x, ry] of [[cutL, Math.PI / 2], [cutR, -Math.PI / 2]]) {
      const top = arch(x) * 0.92 + 0.135;
      put(new THREE.PlaneGeometry(0.14, top), mats.trim, pose(x, ey - T - 0.135 + top / 2, zA(es - D - 0.04), 0, ry));
    }
  } else {
    // the MBUX: two 12.3-inch screens under one glass, from in front of the driver to the middle of the dash
    const c = P3(D + 0.04, -T + 0.085, ex + 0.155);
    const M = new THREE.Matrix4().lookAt(eyeP, c, V3(0, 1, 0)).setPosition(c);
    put(rbox(0.68, 0.16, 0.02, 0.008), mats.trim, M);
    put(rbox(0.4, 0.06, 0.04, 0.01), mats.trim, at(M, 0, -0.07, -0.02));
    put(new THREE.PlaneGeometry(0.27, 0.135), mats.nav, at(M, 0.18, 0, 0.0105));
    hasNav = true;
    faceM = at(M, -0.155, 0, 0.0105);
  }
  put(inAtlas(new THREE.PlaneGeometry(CW, CH), AT.CL), mats.atlas, faceM);
  const dials = atlas.cluster.dials.map(d => {
    const lx = (d.x / 1024 - 0.5) * CW, ly = (0.5 - d.y / 384) * CH, len = d.r / 384 * CH * (d.max === 1 ? 0.85 : 0.84);
    const g = new THREE.BoxGeometry(0.0034, len + 0.012, 0.0016); g.translate(0, len / 2 - 0.006, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * (1 - 0.6 * p.getY(i) / len));
    g.computeVertexNormals();
    put(new THREE.CylinderGeometry(d.max === 1 ? 0.005 : 0.0085, d.max === 1 ? 0.006 : 0.0095, 0.006, 16), mats.trim, at(faceM, lx, ly, 0.007, Math.PI / 2));
    return { ...d, lx, ly, geo: g };
  });
  // a display in its own small hood on top of the dash (the Corsa's, the Kangoo's)
  if (spec.pod) {
    const x = spec.pod === 'opel' ? 0.04 : 0, d = D + 0.06, h = topH(d);
    put(rbox(0.2, 0.075, 0.1, 0.02), mats.top, pose(x, ey + h + 0.03, zA(es - d)));
    const c = P3(d - 0.052, h + 0.035, x), M = new THREE.Matrix4().lookAt(eyeP, c, V3(0, 1, 0)).setPosition(c);
    put(inAtlas(new THREE.PlaneGeometry(0.15, 0.045), AT.DP), mats.atlas, M);
  }

  // ---- the centre stack: its panel standing 12 mm proud of the face, its edges, the knobs
  {
    const h0 = -T - 0.035, h1 = -T - 0.315, NS = 10, off = 0.012;
    const rowAt = (i, o) => { const h = lerp(h0, h1, i / NS), f = faceAt(h); return [-sw / 2, sw / 2].map(x => P3(f.d + f.n[0] * o, h + f.n[1] * o, x)); };
    const panel = Array.from({ length: NS + 1 }, (_, i) => rowAt(i, off));
    put(inAtlas(grid(panel, eyeP, { uvAt: (i, j) => [j, 1 - i / NS] }), AT.ST), mats.atlas);
    for (const j of [0, 1]) put(grid(Array.from({ length: NS + 1 }, (_, i) => [rowAt(i, 0)[j], rowAt(i, off)[j]]), P3(0.3, -T - 0.2, (j ? 1 : -1) * 2)), mats.trim);
    put(grid([rowAt(0, 0), rowAt(0, off)], V3(0, ey + 1, zA(es))), mats.trim);
    for (const f of STACKS[spec.stack]) if (f[0] === 'screen' && f[5] === 'nav') {
      const [, u0, v0, u1, v1] = f, NR = 3, o2 = off + 0.0015;
      const rows = Array.from({ length: NR + 1 }, (_, i) => { const h = lerp(h0, h1, lerp(v0, v1, i / NR)), q = faceAt(h); return [u0, u1].map(u => P3(q.d + q.n[0] * o2, h + q.n[1] * o2, (u - 0.5) * sw)); });
      put(grid(rows, eyeP, { uvAt: (i, j) => [j, 1 - i / NR] }), mats.nav);
      hasNav = true;
    }
    for (const kb of atlas.knobs) {
      const h = lerp(h0, h1, kb.v), o = onFace(h, (kb.u - 0.5) * sw, off + 0.009), r = kb.r * sw;
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), o.n);
      put(new THREE.CylinderGeometry(r * 0.92, r, kb.small ? 0.012 : 0.02, 28), mats.trim, new THREE.Matrix4().compose(o.p, q, V3(1, 1, 1)));
      if (!kb.small) put(new THREE.TorusGeometry(r * 0.93, 0.0015, 6, 28), mats.chrome, new THREE.Matrix4().compose(o.p.clone().addScaledVector(o.n, 0.0095), new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), o.n), V3(1, 1, 1)));
    }
  }

  // ---- the steering wheel (turning, its own group) on its column, the stalks
  const W = spec.wheel, R = W.R, tube = 0.0165, tilt = W.tilt;
  const wheelAt = P3(W.d ?? 0.57, W.h ?? -0.27, ex);
  const wp = [[new THREE.TorusGeometry(R, tube, 12, 72), mats.wheel]];
  const [hw, hh] = W.hub;
  wp.push([pillow(hw, hh, 0.05, 0.022, { bulge: 0.01, face: '+z', seg: 3 }), mats.wheel, pose(0, -0.008, 0.024)]);
  wp.push([inAtlas(new THREE.CircleGeometry(0.023, 32), AT.LG), mats.atlas, pose(0, -0.004, 0.0595)]);
  for (const sp of SPOKES[W.spokes]) {
    const r0 = 0.05, r1 = R - tube * 0.4, rm = (r0 + r1) / 2;
    wp.push([rbox(r1 - r0, sp.w, 0.016, 0.006), mats.wheel, pose(Math.cos(sp.a) * rm, Math.sin(sp.a) * rm - 0.004, 0.008, 0, 0, sp.a)]);
  }
  if (W.cover === 'leather') for (const sg of [-1, 1]) {
    wp.push([rbox(0.034, 0.03, 0.008, 0.004), mats.trim, pose(sg * 0.093, -0.012, 0.019)]);
    wp.push([new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 12), mats.chrome, pose(sg * 0.093, -0.004, 0.024, Math.PI / 2)]);
  }
  if (W.chrome) wp.push([new THREE.TorusGeometry(0.075, 0.0035, 6, 32, Math.PI * 0.8), mats.chrome, pose(0, -0.01, 0.03, 0, 0, Math.PI * 1.1)]);
  const Wm = pose(wheelAt.x, wheelAt.y, wheelAt.z, -tilt);
  put(rbox(0.1, 0.085, 0.27, 0.028), mats.trim, at(Wm, 0, -0.012, -0.2));
  for (const sg of [-1, 1]) put(new THREE.CylinderGeometry(0.0065, 0.0055, 0.13, 8), mats.trim, at(Wm, sg * 0.1, 0.012, -0.072, 0, 0, Math.PI / 2 - sg * 0.12));

  // ---- the floor: the toe board up to the bulkhead under the dash, the tunnel, carpet to the back
  const rearS = spec.saloon ? null : L - 0.22;                // (a saloon's boot is closed off behind the rear seat)
  let hsR = null, rearFit = null;
  if (spec.rear) {
    // the rear row, as far back as its backrest (and its headrests) fits under the roof
    const back = 0.4;
    outer: for (const len of [0.85, 0.76, 0.66, 0.6]) for (const dy of [0, -0.03, -0.06]) for (let g = 0.92; g >= 0.62; g -= 0.02) {
      const s = hs + g, ts = s + 0.11 + len * Math.sin(back), ty = hy + dy - 0.07 + len * Math.cos(back);
      // (under the roof: the headliner's 8 cm; under the rear window: the glass itself)
      const room = (x) => glassY(x) - (x < m.rear[0] ? 0.1 : 0.045);
      if (ts < L - 0.3 && ty < room(ts) && ty < room(ts - 0.15)) { hsR = s; rearFit = { len, back, dy }; break outer; }
    }
  }
  {
    const sFw = es - D - 0.42, sEnd = rearS ?? (hsR ?? hs) + 0.3, yDash = ey - T - 0.43;
    const prof = [[sFw, yDash], [sFw + 0.03, yF + 0.22], [sFw + 0.2, yF + 0.02], [sFw + 0.3, yF]];
    for (let s = sFw + 0.45; s < sEnd; s += 0.15) prof.push([s, yF]);
    prof.push([sEnd, yF]);
    const NXF = 26;
    const fl = prof.map(([s, y]) => { const w = inner(s, Math.max(y, yF + 0.04), 0.035); return Array.from({ length: NXF + 1 }, (_, j) => { const x = -w + 2 * w * j / NXF; const tun = y <= yF + 0.03 ? spec.tunnel * (1 - sstep(0.09, 0.2, Math.abs(x))) : 0; return V3(x, y + tun, zA(s)); }); });
    put(grid(fl, V3(0, yF + 1, zA(hs))), mats.carpet);
  }
  // pedals hanging from under the dash: clutch (a manual box), brake, accelerator
  {
    const s = es - D - 0.2, y = yF + 0.16;
    const peds = spec.gear === 'auto' || spec.gear === 'column' ? [[ex - 0.06, 0.12, 0.08, 0.2], [ex + 0.13, 0.065, 0.16, 0.13]] : [[ex - 0.24, 0.065, 0.065, 0.2], [ex - 0.04, 0.085, 0.07, 0.2], [ex + 0.13, 0.065, 0.16, 0.13]];
    for (const [x, w, h, up] of peds) {
      put(rbox(w, h, 0.014, 0.006), mats.trim, pose(x, y + up - 0.12, zA(s), -0.5));
      if (up > 0.15) put(new THREE.BoxGeometry(0.014, 0.26, 0.018), mats.trim, pose(x, y + up + 0.0, zA(s - 0.06), 0.3));
    }
  }

  // ---- the console between the seats: the gear lever, the handbrake, the armrest
  {
    const yC = Math.max(yF + 0.12, ey - T - 0.4), d0 = faceAt(-T - 0.4).d, d1 = -0.08;
    if (spec.tunnel >= 0.08) {
      put(rbox(0.22, yC - yF, d0 - d1, 0.03), mats.low, pose(0, (yC + yF) / 2, zA(es - (d0 + d1) / 2)));
      put(rbox(0.2, 0.07, 0.34, 0.03), mats.top, pose(0, hy + 0.125, zA(es + 0.08 + 0.17)));
      put(rbox(0.18, hy + 0.09 - yF, 0.32, 0.02), mats.low, pose(0, (hy + 0.09 + yF) / 2, zA(es + 0.08 + 0.17)));
      put(rbox(0.17, 0.006, 0.12, 0.004), mats.trim, pose(0, yC + 0.001, zA(es - 0.45)));
      if (spec.accent) put(rbox(0.2, 0.006, d0 - d1 - 0.1, 0.003), mats.accent, pose(0, yC + 0.002, zA(es - (d0 + d1) / 2 + 0.05)));
    }
    const gear = (x, y, s, tiltX) => {
      if (spec.gear === 'auto') {
        put(rbox(0.09, 0.012, 0.2, 0.006), mats.trim, pose(x, y + 0.004, zA(s)));
        put(inAtlas(new THREE.PlaneGeometry(0.018, 0.05), AT.GT), mats.atlas, pose(x + 0.03, y + 0.011, zA(s), -Math.PI / 2));
        put(rbox(0.042, 0.1, 0.07, 0.016, 2), mats.trim, pose(x, y + 0.055, zA(s - 0.02), -0.15));
        put(rbox(0.044, 0.006, 0.05, 0.003), mats.chrome, pose(x, y + 0.104, zA(s - 0.03), -0.15));
      } else if (spec.gear !== 'column') {
        put(new THREE.CylinderGeometry(0.022, 0.065, 0.09, 16, 1, true), mats.trim, pose(x, y + 0.045, zA(s), tiltX));
        put(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), mats.chrome, at(pose(x, y, zA(s), tiltX), 0, 0.12, 0));
        put(new THREE.SphereGeometry(0.028, 18, 12), mats.trim, at(pose(x, y, zA(s), tiltX), 0, 0.185, 0));
        put(inAtlas(new THREE.CircleGeometry(0.018, 20), AT.KN), mats.atlas, at(pose(x, y, zA(s), tiltX), 0, 0.212, 0, -Math.PI / 2));
      }
    };
    if (spec.gear === 'dash') {
      // the lever on a plinth at the foot of the stack (Kangoo, Doblò) or out of the dash (T5)
      const f = faceAt(-T - 0.4), yP = ey - T - (spec.leverHigh ? 0.36 : 0.44);
      put(rbox(0.24, yP - yF, 0.3, 0.03), mats.low, pose(0, (yP + yF) / 2, zA(es - f.d + 0.12)));
      gear(0, yP, es - f.d + 0.12, 0.35);
    } else if (spec.tunnel >= 0.08) gear(0, yC, es - 0.32, 0.12);
    else { put(rbox(0.22, yF + 0.3 - yF, 0.3, 0.03), mats.low, pose(0, yF + 0.15, zA(es - 0.32))); gear(0, yF + 0.3, es - 0.32, 0.25); }
    if (spec.hb === 'lever') {
      const y = spec.tunnel >= 0.08 ? yC : yF + 0.16, s = es - 0.02;
      if (spec.tunnel < 0.08) put(rbox(0.16, y - yF, 0.36, 0.03), mats.low, pose(0, (y + yF) / 2, zA(s + 0.05)));
      put(new THREE.CylinderGeometry(0.02, 0.05, 0.06, 12, 1, true), mats.trim, pose(-0.01, y + 0.02, zA(s + 0.08)));
      put(rbox(0.035, 0.03, 0.26, 0.012), mats.trim, pose(-0.01, y + 0.06, zA(s - 0.02), 0.26));
      put(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), mats.chrome, pose(-0.01, y + 0.1, zA(s - 0.14), Math.PI / 2 + 0.26));
    } else if (spec.tunnel >= 0.08) put(rbox(0.03, 0.012, 0.045, 0.004), mats.chrome, pose(0.05, yC + 0.007, zA(es - 0.2)));
  }

  // ---- the seats: the driver's and the passenger's (the T5's double seat), the rear row fitted under the roof
  const kind = spec.seat.kind;
  const placeSeat = (list, x, s, y) => {
    const M = pose(x, y, zA(s));
    for (const [g, mat, Mp] of list) put(g, mat, M.clone().multiply(Mp));
    const bottom = y - 0.15 - 0.055 - 0.05;
    if (bottom - yF > 0.04) put(rbox(0.4, bottom - yF, 0.42, 0.015), mats.trim, pose(x, (bottom + yF) / 2, zA(s - 0.17)));
    for (const sg of [-1, 1]) put(new THREE.BoxGeometry(0.025, 0.02, 0.6), mats.trim, pose(x + sg * 0.17, yF + 0.01, zA(s - 0.15)));
  };
  placeSeat(seatParts(kind, 0.52, mats), ex, hs, hy);
  if (spec.front === 'double') placeSeat(seatParts(kind, 0.92, mats, { heads: [-0.22, 0.22] }), 0.42, hs, hy);
  else placeSeat(seatParts(kind, 0.52, mats), -ex, hs, hy);
  if (hsR) {
    const { len, back, dy } = rearFit, hyR = hy + dy;
    if (spec.rear === 'exec') {
      for (const sg of [-1, 1]) placeSeat(seatParts('lux', 0.56, mats, { back: back + 0.05, len }), sg * 0.37, hsR, hyR);
      put(rbox(0.28, hyR + 0.12 - yF, 0.72, 0.03), mats.low, pose(0, (hyR + 0.12 + yF) / 2, zA(hsR - 0.1)));
      if (mats.accent) put(rbox(0.26, 0.012, 0.6, 0.004), mats.accent, pose(0, hyR + 0.125, zA(hsR - 0.1)));
    } else {
      const rows = spec.rear === 'bench2' ? [hsR, hsR + 0.92] : [hsR];
      for (const s of rows) {
        if (s > L - 0.6) continue;
        const w = Math.min(1.42, 2 * inner(s, hyR, 0.06));
        const heads = len >= 0.66 ? (w > 1.25 && len >= 0.76 ? [-w / 2 + 0.28, 0, w / 2 - 0.28] : [-w / 2 + 0.28, w / 2 - 0.28]) : [];
        placeSeat(seatParts('bench', w, mats, { back, len, heads }), 0, s, hyR);
      }
      // a saloon's parcel shelf under the rear window; a hatchback's load cover
      const sT = hsR + 0.11 + len * Math.sin(back) + 0.03;
      const sE = rearS ? L - 0.15 : m.rear[1] - 0.02;
      if (sE - sT > 0.05) { const y = profileAt(m, (sT + sE) / 2).belt - 0.02, sm = (sT + sE) / 2; put(rbox(2 * inner(sm, y, 0.05), 0.015, sE - sT, 0.005), mats.carpet, pose(0, y, zA(sm))); }
    }
  }
  // the seat belts, stowed down the B pillars
  for (const sg of [-1, 1]) {
    const sB = m.pillars[0] + 0.02, pt = profileAt(m, sB), yT = Math.min(pt.belt + 0.33, pt.roof - 0.16), yB = yF + 0.12;
    const A = V3(sg * (inner(sB, yT, 0.04)), yT, zA(sB)), B = V3(sg * (inner(sB + 0.05, yB, 0.05)), yB, zA(sB + 0.05));
    const dir = B.clone().sub(A), len = dir.length(), z = V3(sg, 0, 0), y = dir.normalize(), x = V3().crossVectors(y, z).normalize();
    put(new THREE.BoxGeometry(0.04, len, 0.002), mats.trim, new THREE.Matrix4().makeBasis(x, y, V3().crossVectors(x, y)).setPosition(A.clone().lerp(B, 0.5)));
    put(rbox(0.05, 0.03, 0.03, 0.008), mats.trim, pose(A.x - sg * 0.01, yT, zA(sB)));
  }

  // ---- the door cards: armrest, pull handle, inner handle, window switches, pocket, speaker, sill strip
  const doorSpans = [[m.side[0] + 0.04, m.pillars[0] - 0.03, hy, true]];
  if (spec.doors === 4) doorSpans.push([m.pillars[0] + 0.07, Math.min(m.pillars[1] - 0.05, m.axles[1] - 0.12), hy, false]);
  for (const [s0, s1, yS, front] of doorSpans) for (const sg of [-1, 1]) {
    if (s1 - s0 < 0.3) continue;
    const sm = (s0 + s1) / 2, xi = (s, y) => sg * (halfAt(s, y) - 0.03);
    const yArm = yS + 0.15;
    const xa = xi(sm + 0.05, yArm);
    put(rbox(0.08, 0.05, (s1 - s0) * 0.55, 0.02), spec.seat.cover === 'leather' ? mats.seat : mats.door, pose(xa - sg * 0.04, yArm, zA(sm + 0.05)));
    put(rbox(0.03, 0.03, 0.14, 0.01), mats.trim, pose(xa - sg * 0.03, yArm + 0.1, zA(sm - 0.02)));
    const yH = profileAt(m, s0 + 0.2).belt - 0.13;
    put(rbox(0.018, 0.028, 0.11, 0.008), mats.chrome, pose(xi(s0 + 0.2, yH) - sg * 0.012, yH, zA(s0 + 0.2)));
    if (front) put(inAtlas(new THREE.PlaneGeometry(0.1, 0.05), AT.DS), mats.atlas, pose(xa - sg * 0.04, yArm + 0.026, zA(sm - 0.12), -Math.PI / 2, 0, sg > 0 ? Math.PI / 2 : -Math.PI / 2));
    const yP = yF + 0.16;
    put(rbox(0.05, 0.11, (s1 - s0) * 0.55, 0.012), mats.door, pose(xi(sm + 0.08, yP) - sg * 0.03, yP, zA(sm + 0.08)));
    if (front) put(new THREE.CylinderGeometry(0.064, 0.064, 0.012, 24), mats.trim, pose(xi(s0 + 0.13, yP + 0.15) - sg * 0.004, yP + 0.15, zA(s0 + 0.13), 0, 0, Math.PI / 2));
    const yS2 = profileAt(m, sm).belt - 0.012;
    put(rbox(0.03, 0.02, s1 - s0 - 0.04, 0.008), mats.trim, pose(xi(sm, yS2) - sg * 0.012, yS2, zA(sm)));
  }

  // ---- the A pillars' trims: a moulded panel over each, from the windscreen's edge to the door glass's, swelling 2 cm
  // into the cabin in its middle (the body gives only its skin), from the dash up into the headliner
  {
    const NS = 18, NA = 8, sA = m.wind[0] + 0.04, sB = m.wind[1] + 0.03;
    for (const sg of [-1, 1]) {
      const pos = [], idx = [];
      let rows = 0;
      for (let i = 0; i <= NS; i++) {
        const s = lerp(sA, sB, i / NS), R = sec(s);
        if (profileAt(m, s).cab < 0.3) continue;
        const A = R[8], B = R[7], ex2 = B[0] - A[0], ey2 = B[1] - A[1], l = Math.hypot(ex2, ey2) || 1;
        const nx = -ey2 / l, ny = ex2 / l;                              // (across the strip, inward when flipped below)
        const inX = nx > 0 ? -nx : nx, inY = nx > 0 ? -ny : ny;        // (toward the cabin: -x on this side's half)
        for (let j = 0; j <= NA; j++) {
          const t = j / NA, bulge = 0.024 + 0.022 * Math.sin(Math.PI * t);
          const x = lerp(A[0], B[0], t) + inX * bulge, y = lerp(A[1], B[1], t) + inY * bulge;
          pos.push(sg * x, y, zA(s));
        }
        rows++;
      }
      for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NA; j++) {
        const a = i * (NA + 1) + j, b = a + NA + 1;
        if (sg > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
      if (rows > 2) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.map((v, k) => k % 3 === 2 ? 0 : v * 3).filter((_, k) => k % 3 !== 2), 2));
        g.computeVertexNormals();
        put(g.toNonIndexed(), mats.liner);
      }
    }
  }

  // ---- under the roof: the mirror on the windscreen, the sun visors, the dome light
  let mirrorAt = null;
  {
    // (set as a driver sets it: its glass's normal halves the angle between the eye and the middle of the rear window)
    const sM = m.wind[1] - 0.06, yR = glassY(m.wind[1]), sR = (m.rear[0] + m.rear[1]) / 2, pR = profileAt(m, sR);
    const P = V3(0, yR - 0.14, zA(sM + 0.02)), nG = eyeP.clone().sub(P).normalize().add(V3(0, (pR.roof + pR.belt) / 2, zA(sR)).sub(P).normalize()).normalize();
    const aim = (o) => new THREE.Matrix4().compose(P.clone().add(V3(0, 0, o).applyEuler(new THREE.Euler(-Math.asin(nG.y), Math.atan2(nG.x, nG.z), 0, 'YXZ'))),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.asin(nG.y), Math.atan2(nG.x, nG.z), 0, 'YXZ')), V3(1, 1, 1));
    put(rbox(0.25, 0.07, 0.035, 0.02, 2), mats.trim, aim(0));
    put(new THREE.PlaneGeometry(0.23, 0.055), mats.mirror, aim(0.018));
    mirrorAt = { w: 0.23, h: 0.055, m: aim(0.019) };   // (its glass: mirror.js)
    put(new THREE.CylinderGeometry(0.008, 0.01, 0.1, 8), mats.trim, pose(0, yR - 0.08, zA(sM - 0.01), 0.5));
    // (the sun visors folded up flat under the headliner: padded, round-cornered, their hinge rod going up into the
    // roof at the outer end, a clip holding the inner one)
    // (from the mirror's foot to ~5 cm short of the pillar, where the headliner still runs flat enough)
    for (const sg of [-1, 1]) {
      const s = m.wind[1] + 0.1, y = glassY(s) - 0.08 - 0.016, xo = Math.min(0.53, sec(s)[8][0] - 0.05), xi = 0.16, w = xo - xi, x0 = sg * (xo + xi) / 2;
      put(pillow(w, 0.026, 0.165, 0.012, { seg: 3 }), mats.liner, pose(x0, y, zA(s), 0.12));
      put(new THREE.CylinderGeometry(0.0055, 0.0055, 0.05, 8), mats.trim, pose(x0 + sg * (w / 2 + 0.01), y + 0.002, zA(s - 0.07), 0, 0, Math.PI / 2));
      put(rbox(0.03, 0.02, 0.03, 0.006), mats.liner, pose(x0 + sg * (w / 2 + 0.035), y + 0.014, zA(s - 0.07)));
      put(rbox(0.024, 0.016, 0.022, 0.005), mats.liner, pose(x0 - sg * (w / 2 + 0.01), y + 0.012, zA(s - 0.065)));
    }
    // (the dome light: its housing and its frosted lens in the headliner's colour, two switches)
    const s = m.wind[1] + 0.16, y = glassY(s) - 0.08 - 0.012;
    put(rbox(0.2, 0.022, 0.1, 0.008, 2), mats.liner, pose(0, y, zA(s)));
    put(rbox(0.12, 0.008, 0.05, 0.004, 2), mats.liner, pose(0, y - 0.012, zA(s + 0.01)));
    for (const sg of [-1, 1]) put(rbox(0.018, 0.008, 0.012, 0.003), mats.trim, pose(sg * 0.075, y - 0.012, zA(s - 0.02)));
  }

  let phone = null;
  if (!hasNav) {
    const o = onFace(-T - 0.085, -0.02, 0.047), Mp = new THREE.Matrix4().lookAt(eyeP, o.p, V3(0, 1, 0)).setPosition(o.p);
    phone = mergeByMaterial([[rbox(0.152, 0.073, 0.009, 0.006, 2), mats.phone, Mp], [new THREE.PlaneGeometry(0.142, 0.066), mats.nav, at(Mp, 0, 0, 0.0047)],
      ...[-1, 1].map(sg => [rbox(0.012, 0.03, 0.022, 0.004), mats.trim, at(Mp, sg * 0.081, 0, -0.004)]), [rbox(0.05, 0.035, 0.045, 0.008), mats.trim, at(Mp, 0, 0, -0.025)]]);
  }
  const rigid = mergeByMaterial(parts);
  const wheel = mergeByMaterial(wp);
  const shell = shellGeo(m, body, caps, spec.col);
  // the windscreen from inside, and the dash's top it mirrors: its height at the lip, slope, lip and foot
  const screen = windscreenGeo(m, eyeP, zA);
  // (the wipers' glass, cars.js, measured from this one's foot)
  const wg = wiperGlass(m), sF = windscreenSpan(m)[0];
  const wOff = sF === null ? 0 : Math.sign(wg.s0 - sF) * Math.hypot(wg.s0 - sF, wg.B.y - 0.008 - section(m, sF)[9][1]);
  const dashPlane = [ey - T, 0.05, zA(es - D), zA(es - dG)], dashW = Math.max(0.3, halfAt(es - (D + dG) / 2, ey - T) - 0.06);
  const info = { T, D, dG: +dG.toFixed(3), hsR: hsR && +hsR.toFixed(2), rear: rearFit, tris: (rigid.geo.attributes.position.count + wheel.geo.attributes.position.count + shell.attributes.position.count) / 3,
    draws: rigid.geo.groups.length + 1 + wheel.geo.groups.length + dials.length };
  return { mats, rigid, wheel, shell, phone, wheelAt, tilt, faceM, dials, info, screen, screenMats: screen && windscreenMats(spec, { plane: dashPlane, w: dashW, wipers: { W: wg.W, off: wOff } }), mirrorAt,
    // (the driver's package, for the driver at the wheel: driver.js)
    pkg: { eye: eyeP.clone(), hip: V3(ex, hy, zA(hs)), floor: yF, wheelAt: wheelAt.clone(), tilt, R, tube, pedalZ: zA(es - D - 0.2), accX: ex + 0.13, restX: spec.gear === 'auto' || spec.gear === 'column' ? ex - 0.2 : ex - 0.33 } };
}
