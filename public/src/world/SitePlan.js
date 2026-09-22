/* ============================================================================
   THE MAP — reconstructed 1:1 from the four reference photographs.
   See docs/MAP-SURVEY.md for how each figure was derived.

   Axes: +X east, +Z south, +Y up. Origin = centre of the big concrete pad.
   Every dimension is in metres.
   ========================================================================== */

export const BOUNDS = { minX: -58, maxX: 44, minZ: -54, maxZ: 34 };

/* --------------------------------------------------------------- surfaces */
/* Drawn in order; later entries sit on top. `y` lifts poured slabs off the
   gravel by their real kerb height. */
export const SURFACES = [
  { id: 'yard',      tex: 'gravel',   x: -7,    z: -10,  w: 104, d: 90,  y: 0.00 },
  { id: 'orchard',   tex: 'grass',    x: 24,    z: -9,   w: 40,  d: 42,  y: 0.02 },
  { id: 'northGrass',tex: 'grass',    x: -20,   z: -48,  w: 78,  d: 10,  y: 0.02 },
  { id: 'westGrass', tex: 'grass',    x: -55,   z: -8,   w: 8,   d: 78,  y: 0.02 },
  { id: 'southGrass',tex: 'grass',    x: 20,    z: 26,   w: 46,  d: 14,  y: 0.02 },
  { id: 'wornA',     tex: 'dirt',     x: -12,   z: -6,   w: 18,  d: 16,  y: 0.01 },
  { id: 'wornB',     tex: 'dirt',     x: -30,   z: -14,  w: 14,  d: 10,  y: 0.01 },
  { id: 'pad',       tex: 'concrete', x: -28,   z: 8,    w: 24,  d: 16,  y: 0.06 },
  { id: 'drive',     tex: 'concrete', x: -8,    z: 25,   w: 28,  d: 14,  y: 0.06 },
  { id: 'apron',     tex: 'concrete', x: -26,   z: -19,  w: 28,  d: 6,   y: 0.05 },
  { id: 'street',    tex: 'asphalt',  x: -7,    z: 37,   w: 104, d: 8,   y: 0.00 },
];

/* -------------------------------------------------------------- buildings */
export const BUILDINGS = {
  /* The three-bay service hall that closes the north-east side of the yard
     (photos 3 and 4). Doors face south, into the yard. */
  hallB: {
    type: 'hall', x: -26, z: -29, w: 28, d: 14,
    hFront: 4.6, hBack: 5.6, rotY: 0, name: 'hala-service',
    doors: [{ x: -8, w: 4.2, h: 4.0 }, { x: -1.5, w: 4.2, h: 4.0 }, { x: 5, w: 4.2, h: 4.0 }],
    openDoors: [0, 2],
    windowStrip: true, canopy: 0,
  },
  /* The single-bay garage from the first photo: door facing south, with the
     shallow canopy over it and the Octavia parked half inside. */
  garageA: {
    type: 'hall', x: -16, z: 9, w: 16, d: 14,
    hFront: 4.4, hBack: 5.2, rotY: 0, name: 'garaj',
    doors: [{ x: 1, w: 4.2, h: 3.7 }],
    openDoors: [0],
    windowStrip: false, canopy: 1.7,
  },
  house1: { type: 'house', x: -3, z: -3, w: 12, d: 11, wallH: 3.0, roofH: 3.0, rotY: 0.06, dormer: true, name: 'casa-vecin-est' },
  house2: { type: 'house', x: -39.5, z: -46.5, w: 13, d: 11, wallH: 3.1, roofH: 3.2, rotY: -0.1, dormer: false, name: 'casa-vecin-nord' },
  office: { type: 'container', x: -47.5, z: -24, rotY: 0.1 },
  /* Beyond the north boundary: the dark-green industrial hall, the distant
     warehouses and the two chimneys from the second photo. */
  greenHall: { type: 'shed', x: -45, z: -73, w: 38, d: 22, h: 9.5, rotY: 0.04, color: 0x2a3a33, roofColor: 0x333b38 },
  warehouse1:{ type: 'shed', x: 10,  z: -79, w: 60, d: 26, h: 11,  rotY: 0.0,  color: 0x7d858c, roofColor: 0x5f666c },
  warehouse2:{ type: 'shed', x: -10, z: -66, w: 24, d: 12, h: 7,   rotY: 0.08, color: 0x8e959a, roofColor: 0x666d72 },
};

export const CHIMNEYS = [
  { x: 4, z: -118, r: 1.7, h: 34 },
  { x: 11, z: -123, r: 1.2, h: 26 },
];

/* ---------------------------------------------------------------- fences */
export const FENCES = [
  /* orchard boundary — the mesh fence with the two licence plates nailed to it */
  { id: 'orchard', pts: [[4, 12], [44, 12]], h: 1.9 },
  { id: 'orchardN', pts: [[4, 12], [4, -30]], h: 1.9 },
  { id: 'orchardE', pts: [[44, 12], [44, -30]], h: 1.9 },
  /* north boundary towards the industrial estate */
  { id: 'north', pts: [[-58, -52], [4, -52]], h: 1.9 },
  /* west boundary under the tree line */
  { id: 'west', pts: [[-56, -52], [-56, 30]], h: 1.9 },
  /* street frontage, with the gate opening left out of the panels */
  { id: 'street', pts: [[-56, 31], [12, 31]], h: 1.9, gaps: [{ seg: 0, from: 40, to: 47 }] },
];

export const GATE = { x: -12.5, z: 31, w: 7, h: 1.9, rotY: 0 };

export const POWER_POLES = [
  { x: -56, z: -57 }, { x: -38, z: -57 }, { x: -20, z: -57 }, { x: -2, z: -57 }, { x: 16, z: -57 },
];

export const FLOODLIGHTS = [
  { x: -44, z: -14, h: 7, rotY: -0.5 },
  { x: -12, z: -16, h: 7, rotY: 0.6 },
  { x: -30, z: 18, h: 6.5, rotY: Math.PI },
];

/* ------------------------------------------------------------- vegetation */
function orchardRows() {
  const out = [];
  let s = 1000;
  for (let x = 7; x <= 41; x += 4.2) {
    for (let z = -27; z <= 8; z += 4.6) {
      const j = ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
      out.push({ x: x + (j - 0.5) * 0.7, z: z + (j - 0.5) * 0.9, scale: 0.85 + j * 0.4, kind: 'orchard', seed: s % 100000 });
    }
  }
  return out;
}
export const TREES = [
  ...orchardRows(),
  /* the hedge and trees between the garage and the neighbouring house (photo 1) */
  { x: -7.0, z: 9.5, scale: 1.30, kind: 'tall', seed: 11 },
  { x: -5.0, z: 17.0, scale: 1.05, kind: 'orchard', seed: 12 },
  { x: 0.5, z: 10.5, scale: 1.15, kind: 'tall', seed: 13 },
  { x: 2.5, z: 19.5, scale: 0.95, kind: 'orchard', seed: 14 },
  { x: 9.0, z: 17.0, scale: 1.35, kind: 'tall', seed: 15 },
  { x: 12.5, z: 15.0, scale: 1.25, kind: 'orchard', seed: 16 },
  { x: 15.5, z: 18.0, scale: 1.10, kind: 'orchard', seed: 17 },
  /* west tree line behind the parked car row (photos 3 and 4) */
  ...Array.from({ length: 13 }, (_, i) => ({ x: -55 + (i % 2) * 2.2, z: -44 + i * 6, scale: 1.3 + (i % 3) * 0.25, kind: 'tall', seed: 200 + i })),
  /* around the north neighbour's house */
  { x: -33, z: -44, scale: 1.5, kind: 'tall', seed: 301 },
  { x: -47, z: -43, scale: 1.35, kind: 'tall', seed: 302 },
  { x: -26, z: -47, scale: 1.2, kind: 'tall', seed: 303 },
  /* a few along the street */
  { x: 18, z: 29, scale: 1.4, kind: 'tall', seed: 401 },
  { x: 30, z: 28, scale: 1.25, kind: 'tall', seed: 402 },
  { x: 40, z: 29, scale: 1.35, kind: 'tall', seed: 403 },
];

export const GRASS_AREAS = [
  { x: 24, z: -9, w: 39, d: 41 },
  { x: -20, z: -48, w: 76, d: 9 },
  { x: -55, z: -8, w: 7, d: 76 },
  { x: 20, z: 26, w: 44, d: 12 },
];

/* ------------------------------------------------------------------ props */
/* `d` = dynamic (can be knocked over). Positions are ground-level origins. */
export const PROPS = [
  /* --- against the garage wall, exactly as in the first photo --- */
  { kind: 'oilDrum',    x: -10.6, z: 16.6, rotY: 0.2,  d: true },
  { kind: 'barrel',     x: -11.6, z: 16.7, rotY: -0.3, d: true, color: 0x1f57b5 },
  { kind: 'extinguisher', x: -9.6, z: 16.5, rotY: 0,   d: true },
  { kind: 'jerrycan',   x: -12.4, z: 16.4, rotY: 0.5,  d: true },
  { kind: 'crate',      x: -13.2, z: 16.5, rotY: -0.2, d: true, color: 0x2c6e4f },
  /* --- workshop bays --- */
  { kind: 'lift',       x: -34,  z: -29,  rotY: 0 },
  { kind: 'lift',       x: -21,  z: -29,  rotY: 0 },
  { kind: 'workbench',  x: -27.5,z: -35,  rotY: 0 },
  { kind: 'toolbox',    x: -30.5,z: -34.6,rotY: 0.1 },
  { kind: 'toolbox',    x: -17,  z: -34.6,rotY: -0.2 },
  { kind: 'compressor', x: -13.6,z: -34.3,rotY: 1.57, d: true },
  { kind: 'hoseReel',   x: -13.2,z: -28,  rotY: -1.57, y: 2.2 },
  { kind: 'tyreStack',  x: -38,  z: -34.4,rotY: 0, n: 5 },
  { kind: 'tyreStack',  x: -36.6,z: -34.6,rotY: 0, n: 3 },
  { kind: 'workbench',  x: -19,  z: 4.4,  rotY: 0, len: 3.0 },
  { kind: 'toolbox',    x: -22,  z: 4.2,  rotY: 0 },
  { kind: 'tyreStack',  x: -10.6,z: 4.2,  rotY: 0, n: 4 },
  /* --- yard clutter --- */
  { kind: 'pallet',     x: -43,  z: -17,  rotY: 0.3,  d: true },
  { kind: 'pallet',     x: -42.2,z: -17.4,rotY: 0.34, d: true, y: 0.16 },
  { kind: 'skip',       x: -50,  z: -12,  rotY: 0.15 },
  { kind: 'scrapPile',  x: -49,  z: -6,   rotY: 0.4 },
  { kind: 'tyreStack',  x: -46,  z: -18,  rotY: 0, n: 6 },
  { kind: 'bin',        x: -45.5,z: -21.5,rotY: 0.2, d: true },
  { kind: 'bin',        x: -44.6,z: -21.4,rotY: -0.1, d: true, color: 0x1d4f8a },
  { kind: 'cone',       x: -20,  z: -14,  rotY: 0, d: true },
  { kind: 'cone',       x: -22.5,z: -13.4,rotY: 0, d: true },
  { kind: 'cone',       x: -25,  z: -13.0,rotY: 0, d: true },
  { kind: 'cone',       x: -33,  z: -16,  rotY: 0, d: true },
  { kind: 'cone',       x: -8,   z: 20,   rotY: 0, d: true },
  { kind: 'cone',       x: -5,   z: 21,   rotY: 0, d: true },
  { kind: 'barrel',     x: -41,  z: -8,   rotY: 0,   d: true, color: 0x2a6b3a },
  { kind: 'barrel',     x: -40.3,z: -8.6, rotY: 0.4, d: true, color: 0x1f57b5 },
  { kind: 'crate',      x: -38,  z: -12,  rotY: 0.6, d: true, color: 0x8a3030 },
  { kind: 'pallet',     x: -15,  z: 18.5, rotY: -0.2, d: true },
  { kind: 'tyre',       x: -17,  z: 19,   rotY: 0, d: true },
  { kind: 'tyre',       x: -17.6,z: 19.6, rotY: 0, d: true },
];

/* The two licence plates nailed to the orchard fence in the first photo. */
export const FENCE_SIGNS = [
  { x: 11.4, y: 1.52, z: 12.07, rotY: Math.PI, lines: ['B 150 HGI'], w: 0.52, h: 0.115 },
  { x: 12.6, y: 1.52, z: 12.07, rotY: Math.PI, lines: ['PH 05 FRI'], w: 0.52, h: 0.115 },
];

/* ---------------------------------------------------------- photo matches */
/* Reconstructed poses of the four reference shots. */
export const PHOTO_SPOTS = [
  { id: 1, name: 'Foto 1 — garaj, livadă, Ford argintiu', x: -6.0, y: 1.58, z: 27.0, yaw: 4, pitch: 3, fov: 79 },
  { id: 2, name: 'Foto 2 — Dokker, zona industrială', x: -31.0, y: 1.58, z: 6.0, yaw: 338, pitch: 4, fov: 79 },
  { id: 3, name: 'Foto 3 — curtea și hala service', x: -30.0, y: 1.58, z: 10.0, yaw: 356, pitch: 3, fov: 79 },
  { id: 4, name: 'Foto 4 — curte largă, buldoexcavatorul', x: -34.0, y: 1.58, z: 16.0, yaw: 350, pitch: 4, fov: 84 },
];

export const SPAWN = { x: -10, y: 1.7, z: 27, yaw: 345 };

export const TELEPORTS = [
  { name: 'Intrare / poartă', x: -12.5, z: 27, yaw: 0 },
  { name: 'Platforma de beton', x: -28, z: 8, yaw: 20 },
  { name: 'Hala service (3 boxe)', x: -26, z: -16, yaw: 0 },
  { name: 'Garajul cu Octavia', x: -15, z: 18, yaw: 350 },
  { name: 'Livada', x: 16, z: 2, yaw: 300 },
  { name: 'Gardul de nord', x: -30, z: -48, yaw: 180 },
  { name: 'Strada', x: -8, z: 36, yaw: 90 },
];

/* Minimap legend / map tab. */
export const LANDMARKS = [
  { name: 'Hala service', x: -26, z: -29, icon: 'H' },
  { name: 'Garaj', x: -16, z: 9, icon: 'G' },
  { name: 'Birou container', x: -47.5, z: -24, icon: 'B' },
  { name: 'Casă vecin (est)', x: -3, z: -3, icon: 'C' },
  { name: 'Casă vecin (nord)', x: -39.5, z: -46.5, icon: 'C' },
  { name: 'Livadă', x: 24, z: -9, icon: 'L' },
  { name: 'Hala industrială', x: -45, z: -73, icon: 'I' },
  { name: 'Poartă', x: -12.5, z: 31, icon: 'P' },
];
