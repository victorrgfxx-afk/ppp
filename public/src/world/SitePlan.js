/* ============================================================================
   THE MAP — reconstructed from the reference photographs.
   See docs/MAP-SURVEY.md for how every figure was derived.

   Axes: +X east, +Z south, +Y up. Origin roughly the centre of the yard.
   All dimensions in metres.

   Third reconstruction. The first two both guessed at the camera's field of
   view, and both guessed wrong, which threw every distance derived from an
   apparent size. The photographs were in fact taken on two different lenses:
   measuring the same hall in the wide yard shot and in the one taken a moment
   later from the same spot gives an angular ratio of 1.93, i.e. a 1x main
   camera (48 deg horizontal on a 3:4 portrait frame) and a 0.5x ultra-wide
   (about 87 deg). Fixing that makes all five viewpoints agree:

     hall facade   3 bays, 390 px wide in the wide shot, doors 86 px
     office cabin  window measures 1.86 x 1.29 m against its own 2.55 m height
     both shots    cabin at 30 m, hall facade at 41 m from the same standpoint
     close-up      cabin corner at 5.0 m, hall facade at 14.4 m — 9.4 m apart
     garage        door 3.05 m wide, 1.0 m from the building's east corner

   So the office cabin stands about 10 m out from the hall doors, the yard in
   front of them is some 40 m deep, and the row of waiting cars queues up the
   west side of it. Those three facts are what the earlier layouts got wrong.
   ========================================================================== */

export const BOUNDS = { minX: -62, maxX: 78, minZ: -92, maxZ: 42 };

/* --------------------------------------------------------------- surfaces */
export const SURFACES = [
  { id: 'yard',       tex: 'gravel',   x: -7,  z: -9,  w: 112, d: 96, y: 0.00 },
  { id: 'orchard',    tex: 'grass',    x: 50,  z: -66, w: 48,  d: 44, y: 0.02 },
  { id: 'westGrass',  tex: 'grass',    x: -57, z: -25, w: 10,  d: 126, y: 0.02 },
  { id: 'northGrass', tex: 'grass',    x: -16, z: -84, w: 92,  d: 10, y: 0.02 },
  { id: 'southGrass', tex: 'grass',    x: 44,  z: 24,  w: 60,  d: 30, y: 0.02 },
  { id: 'wornA',      tex: 'dirt',     x: -20, z: -30, w: 14,  d: 22, y: 0.01 },
  { id: 'wornB',      tex: 'dirt',     x: -12, z: -34, w: 12,  d: 10, y: 0.01 },
  /* Poured concrete. Every photograph taken close to a building stands on it
     and every one taken out in the yard stands on gravel, so the slabs are an
     apron along the hall and the cabin, a bigger one round the garage, and the
     entrance drive — not the whole yard. */
  { id: 'apron',      tex: 'concrete', x: -14, z: -45, w: 46,  d: 16, y: 0.06 },
  { id: 'garageYard', tex: 'concrete', x: 18,  z: -40, w: 28,  d: 18, y: 0.06 },
  { id: 'drive',      tex: 'concrete', x: -10, z: 28,  w: 30,  d: 18, y: 0.06 },
  { id: 'street',     tex: 'asphalt',  x: -7,  z: 40,  w: 140, d: 8,  y: 0.00 },
];

/* -------------------------------------------------------------- buildings */
export const BUILDINGS = {
  /* Three-bay service hall, doors facing south into the yard. Measured off the
     wide shot: the facade is 390 px against 86 px door openings on a 125 px bay
     pitch, so three 3.2 m doors at 4.95 m centres in a 15.5 m building — only
     as long as its three bays, exactly as the photographs show. */
  hallB: {
    type: 'hall', x: -14, z: -58.5, w: 15.5, d: 13,
    hFront: 4.6, hBack: 5.4, rotY: 0, name: 'hala-service',
    overhang: 0.95, brackets: false,
    doors: [{ x: -4.95, w: 3.2, h: 3.9 }, { x: 0, w: 3.2, h: 3.9 }, { x: 4.95, w: 3.2, h: 3.9 }],
    openDoors: [0, 2],
    windowStrip: true, canopy: 0,
  },
  /* The single-bay garage, east along the same north side, with the orchard
     immediately beyond its east gable. Mono-pitch roof falling east along the
     door face, on a deep bracketed eave; the opening sits 1.0 m in from the
     east corner, which is where the close-up puts it. */
  garageA: {
    type: 'hall', x: 17, z: -54, w: 12, d: 12,
    hFront: 6.2, hBack: 4.6, slopeAxis: 'x', overhang: 1.3, brackets: true,
    rotY: 0, name: 'garaj',
    doors: [{ x: 3.475, w: 3.05, h: 3.8 }],
    openDoors: [0],
    windowStrip: false, canopy: 0,
  },
  /* Prefab office cabin. The close-up puts its near corner 5.0 m from the
     camera and the hall doors at 14.4 m, so it stands about 10 m out from the
     hall and a little west of it, turned slightly off the hall's line. */
  office: { type: 'container', x: -25.5, z: -42.5, rotY: 0.30 },
  /* the red tiled roof that shows over the hedge behind the garage in both
     close-ups, bearing -4 deg in one and +2 deg in the other */
  house1: { type: 'house', x: 19.5, z: -73, w: 12, d: 11, wallH: 3.0, roofH: 3.2, rotY: 0.06, dormer: true, name: 'casa-vecin-nord-est' },
  /* and the one behind the office cabin in the yard shots, 45 m out and
     4 deg left of the standpoint */
  house2: { type: 'house', x: -35, z: -58, w: 13, d: 11, wallH: 3.1, roofH: 3.4, rotY: -0.1, dormer: false, name: 'casa-vecin-vest' },
  house3: { type: 'house', x: -8, z: -78, w: 12, d: 10, wallH: 3.0, roofH: 3.0, rotY: 0.12, dormer: false, name: 'casa-vecin-nord' },
  /* The industrial estate seen across the boundary in the fourth photograph —
     west of the yard, which is the only direction with a clear line of sight. */
  greenHall:  { type: 'shed', x: -92, z: -26, w: 38, d: 22, h: 9.5, rotY: 0.04, color: 0x2a3a33, roofColor: 0x333b38 },
  warehouse1: { type: 'shed', x: -104, z: 16, w: 60, d: 26, h: 11, rotY: 0.06, color: 0x7d858c, roofColor: 0x5f666c },
  warehouse2: { type: 'shed', x: -84, z: 2,  w: 24, d: 12, h: 7,  rotY: 0.08, color: 0x8e959a, roofColor: 0x666d72 },
};

export const CHIMNEYS = [
  { x: -132, z: -6, r: 1.7, h: 34 },
  { x: -126, z: 4, r: 1.2, h: 26 },
];

/* ---------------------------------------------------------------- fences */
export const FENCES = [
  /* Orchard boundary: the mesh fence with the two licence plates wired to it.
     The plates measure 64 px for 520 mm in the close-up, which puts them
     16.8 m out and 0.8 m right of that standpoint — just past the garage's
     east corner, where the hedge ends. */
  { id: 'orchardS', pts: [[24, -46.5], [74, -46.5]], h: 1.9 },
  { id: 'orchardW', pts: [[24, -46.5], [24, -88]], h: 1.9 },
  { id: 'orchardE', pts: [[74, -46.5], [74, -88]], h: 1.9 },
  /* north boundary, behind the buildings */
  { id: 'north', pts: [[-58, -88], [24, -88]], h: 1.9 },
  /* west boundary, with the industrial estate beyond it */
  { id: 'west', pts: [[-58, -88], [-58, 36]], h: 1.9 },
  /* street frontage, with the gate opening left out of the panels */
  { id: 'street', pts: [[-58, 36], [30, 36]], h: 1.9, gaps: [{ seg: 0, from: 42, to: 50 }] },
];

export const GATE = { x: -12, z: 36, w: 8, h: 1.9, rotY: 0 };

export const POWER_POLES = [
  { x: -66, z: -70 }, { x: -66, z: -38 }, { x: -66, z: -6 }, { x: -66, z: 26 },
];

/* Street-lamp head on a curved tube bracket, on the garage's door face west of
   the opening — clearly visible in the close-up. */
export const WALL_LAMPS = [
  { x: 12.6, y: 3.6, z: -47.88, rotY: 0, reach: 0.8 },
  { x: -20.4, y: 3.4, z: -51.88, rotY: 0, reach: 0.8 },
];

export const FLOODLIGHTS = [
  { x: -36, z: -40, h: 7, rotY: -0.5 },
  { x: -4, z: -20, h: 7, rotY: 0.6 },
  { x: -26, z: 14, h: 6.5, rotY: Math.PI },
];

/* ------------------------------------------------------------- vegetation */
function orchardRows() {
  const out = [];
  let s = 1000;
  const house = { x: 19.5, z: -73, r: 9 };
  for (let x = 28; x <= 72; x += 4.2) {
    for (let z = -84; z <= -50; z += 4.6) {
      const j = ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
      if (Math.hypot(x - house.x, z - house.z) < house.r) continue;
      out.push({ x: x + (j - 0.5) * 0.7, z: z + (j - 0.5) * 0.9, scale: 0.85 + j * 0.4, kind: 'orchard', seed: s % 100000 });
    }
  }
  return out;
}
export const TREES = [
  ...orchardRows(),
  /* The overgrown hedge hard against the garage's east gable, between the
     building and the orchard fence — it fills the gap in both close-ups. */
  { x: 24.3, z: -47.6, scale: 0.50, kind: 'orchard', seed: 11 },
  { x: 24.5, z: -50.0, scale: 0.62, kind: 'orchard', seed: 12 },
  { x: 24.4, z: -52.4, scale: 0.55, kind: 'orchard', seed: 13 },
  { x: 24.7, z: -54.8, scale: 0.66, kind: 'orchard', seed: 14 },
  { x: 24.6, z: -57.2, scale: 0.58, kind: 'orchard', seed: 15 },
  { x: 24.8, z: -59.6, scale: 0.63, kind: 'orchard', seed: 16 },
  /* the belt between the hall and the garage, seen past the backhoe */
  { x: -1.5, z: -49.5, scale: 1.05, kind: 'orchard', seed: 21 },
  { x: 2.5,  z: -50.5, scale: 1.20, kind: 'tall', seed: 22 },
  { x: 6.0,  z: -52.0, scale: 1.10, kind: 'orchard', seed: 23 },
  /* The tree line that closes off the west side behind the queue of cars: it
     fills the whole left edge of the yard shots, so it stands just beyond the
     parked row rather than out on the boundary. */
  ...Array.from({ length: 11 }, (_, i) => ({ x: -33.5 - (i % 2) * 2.4, z: -46 + i * 4.4, scale: 1.05 + (i % 3) * 0.22, kind: 'tall', seed: 150 + i })),
  /* and the boundary line proper, further out */
  ...Array.from({ length: 16 }, (_, i) => ({ x: -55 + (i % 2) * 2.2, z: -70 + i * 7, scale: 1.3 + (i % 3) * 0.25, kind: 'tall', seed: 200 + i })),
  /* around the neighbours' houses */
  { x: -38, z: -50, scale: 1.5, kind: 'tall', seed: 301 },
  { x: -36, z: -64, scale: 1.35, kind: 'tall', seed: 302 },
  { x: -16, z: -78, scale: 1.2, kind: 'tall', seed: 303 },
  { x: 16, z: -78, scale: 1.3, kind: 'tall', seed: 304 },
  /* along the street */
  { x: 20, z: 32, scale: 1.4, kind: 'tall', seed: 401 },
  { x: 34, z: 30, scale: 1.25, kind: 'tall', seed: 402 },
  { x: 48, z: 32, scale: 1.35, kind: 'tall', seed: 403 },
];

export const GRASS_AREAS = [
  { x: 50, z: -66, w: 47, d: 43 },
  { x: -57, z: -25, w: 9, d: 124 },
  { x: -16, z: -84, w: 90, d: 9 },
  { x: 44, z: 24, w: 58, d: 28 },
];

/* ------------------------------------------------------------------ props */
export const PROPS = [
  /* --- at the garage's east corner, in the order the close-up shows them,
         starting about a metre east of the door reveal: kerb block, leaning
         grating, blue barrel, TOTAL drum, gas trolley --- */
  { kind: 'block',      x: 20.0, z: -46.6, rotY: 0.05 },
  { kind: 'meshPanel',  x: 20.6, z: -46.5, rotY: 0.02 },
  { kind: 'barrel',     x: 21.2, z: -46.6, rotY: -0.3, d: true, color: 0x1f57b5 },
  { kind: 'oilDrum',    x: 21.9, z: -46.6, rotY: 0.2,  d: true },
  { kind: 'gasTrolley', x: 22.8, z: -46.5, rotY: 0.15, d: true },
  { kind: 'rubble',     x: 23.6, z: -46.4, rotY: 0.4 },
  { kind: 'jerrycan',   x: 19.2, z: -46.6, rotY: 0.5,  d: true },
  /* --- inside the garage --- */
  { kind: 'workbench',  x: 14.0, z: -58.0, rotY: 0, len: 3.0 },
  { kind: 'toolbox',    x: 12.2, z: -57.8, rotY: 0 },
  { kind: 'tyreStack',  x: 21.0, z: -57.8, rotY: 0, n: 4 },
  /* --- inside the hall bays --- */
  { kind: 'lift',       x: -18.95, z: -57.5, rotY: 0 },
  { kind: 'lift',       x: -9.05,  z: -57.5, rotY: 0 },
  { kind: 'workbench',  x: -14,   z: -63.6, rotY: 0 },
  { kind: 'toolbox',    x: -17.4, z: -63.4, rotY: 0.1 },
  { kind: 'toolbox',    x: -10.6, z: -63.4, rotY: -0.2 },
  { kind: 'compressor', x: -7.4,  z: -63.1, rotY: 1.57, d: true },
  { kind: 'hoseReel',   x: -7.0,  z: -57.0, rotY: -1.57, y: 2.2 },
  { kind: 'tyreStack',  x: -20.4, z: -63.3, rotY: 0, n: 5 },
  { kind: 'tyreStack',  x: -19.2, z: -63.5, rotY: 0, n: 3 },
  /* --- yard clutter. The wheelie bin stands against the hall wall between
         bays 1 and 2 in the close-up, a 120 L one at the same distance as the
         wall itself --- */
  { kind: 'bin',        x: -7.6,  z: -51.4, rotY: 0.1,  d: true, color: 0xd9b310 },
  { kind: 'bin',        x: -28.6, z: -44.6, rotY: 0.2,  d: true },
  { kind: 'bin',        x: -27.7, z: -44.5, rotY: -0.1, d: true, color: 0x1d4f8a },
  { kind: 'pallet',     x: -30,   z: -38,   rotY: 0.3,  d: true },
  { kind: 'pallet',     x: -29.2, z: -38.4, rotY: 0.34, d: true, y: 0.16 },
  { kind: 'skip',       x: -34,   z: -44,   rotY: 0.15 },
  { kind: 'scrapPile',  x: -33,   z: -38,   rotY: 0.4 },
  { kind: 'tyreStack',  x: -31,   z: -47,   rotY: 0, n: 6 },
  { kind: 'cone',       x: -16,   z: -46,   rotY: 0, d: true },
  { kind: 'cone',       x: -13,   z: -46.4, rotY: 0, d: true },
  { kind: 'cone',       x: -10,   z: -46.8, rotY: 0, d: true },
  { kind: 'cone',       x: 8,     z: -44,   rotY: 0, d: true },
  { kind: 'cone',       x: -12,   z: 16,    rotY: 0, d: true },
  { kind: 'cone',       x: -9,    z: 17,    rotY: 0, d: true },
  { kind: 'barrel',     x: -30,   z: -34,   rotY: 0,   d: true, color: 0x2a6b3a },
  { kind: 'barrel',     x: -29.3, z: -34.6, rotY: 0.4, d: true, color: 0x1f57b5 },
  { kind: 'crate',      x: -30.5, z: -31,   rotY: 0.6, d: true, color: 0x8a3030 },
  { kind: 'pallet',     x: -18,   z: 14,    rotY: -0.2, d: true },
  { kind: 'tyre',       x: -20,   z: 15,    rotY: 0, d: true },
  { kind: 'tyre',       x: -20.6, z: 15.6,  rotY: 0, d: true },
];

/* Bay numbers screwed to the piers between the hall doors. */
export const BAY_SIGNS = [
  { x: -16.5, y: 2.6, z: -51.85, rotY: 0, lines: ['1'], w: 0.22, h: 0.28 },
  { x: -11.6, y: 2.6, z: -51.85, rotY: 0, lines: ['2'], w: 0.22, h: 0.28 },
  { x: -6.6,  y: 2.6, z: -51.85, rotY: 0, lines: ['3'], w: 0.22, h: 0.28 },
];

/* The two licence plates nailed to the orchard fence in the first photo. */
export const FENCE_SIGNS = [
  { x: 26.6, y: 1.52, z: -46.43, rotY: 0, lines: ['PH 05 FRI'], w: 0.52, h: 0.115 },
  { x: 27.8, y: 1.52, z: -46.43, rotY: 0, lines: ['PH 05 FRI'], w: 0.52, h: 0.115 },
];

/* ---------------------------------------------------------- photo matches */
/* Reconstructed standpoints. Two lenses were used, so two fields of view: the
   1x main camera is 48 deg horizontal on a 3:4 portrait frame, which at that
   aspect is a 61 deg vertical `fov`; the 0.5x ultra-wide is about 87 deg
   horizontal. Spots 3 and 4 are deliberately the same standpoint — the wide
   yard shot and the one taken a moment later are the same view at 0.5x and 1x,
   which is what let the whole layout be pinned down. */
export const PHOTO_SPOTS = [
  { id: 1, name: 'Foto 1 — garajul de la distanță, Octavia în ușă', x: 25.6, y: 1.60, z: -32.9, yaw: 0, pitch: 2, fov: 61 },
  { id: 2, name: 'Foto 2 — biroul-container și hala', x: -22.0, y: 1.60, z: -37.3, yaw: 0, pitch: 3, fov: 61 },
  { id: 3, name: 'Foto 3 — curtea și hala service (1x)', x: -22.0, y: 1.60, z: -11.0, yaw: 0, pitch: 3, fov: 61 },
  { id: 4, name: 'Foto 4 — aceeași priveliște la 0.5x', x: -22.0, y: 1.60, z: -11.0, yaw: 0, pitch: 4, fov: 96 },
  { id: 5, name: 'Foto 5 — garajul de aproape', x: 22.6, y: 1.60, z: -35.3, yaw: 0, pitch: 5, fov: 61 },
  { id: 6, name: 'Foto 6 — zona industrială peste gard', x: 8.0, y: 1.60, z: -30.0, yaw: 285, pitch: 2, fov: 78 },
];

export const SPAWN = { x: -12, y: 1.7, z: 22, yaw: 358 };

export const TELEPORTS = [
  { name: 'Intrare / poartă', x: -12, z: 30, yaw: 0 },
  { name: 'Mijlocul curții', x: -22, z: -11, yaw: 0 },
  { name: 'Hala service (3 boxe)', x: -14, z: -45, yaw: 0 },
  { name: 'Biroul-container', x: -23.5, z: -36, yaw: 0 },
  { name: 'Garajul cu Octavia', x: 22.6, z: -37, yaw: 0 },
  { name: 'Livada', x: 40, z: -60, yaw: 270 },
  { name: 'Gardul de vest', x: -52, z: -20, yaw: 270 },
  { name: 'Strada', x: -8, z: 34, yaw: 90 },
];

export const LANDMARKS = [
  { name: 'Hala service', x: -14, z: -58.5, icon: 'H' },
  { name: 'Garaj', x: 16, z: -55, icon: 'G' },
  { name: 'Birou container', x: -25.5, z: -42.5, icon: 'B' },
  { name: 'Casă vecin (NE)', x: 19.5, z: -73, icon: 'C' },
  { name: 'Casă vecin (vest)', x: -35, z: -58, icon: 'C' },
  { name: 'Livadă', x: 50, z: -66, icon: 'L' },
  { name: 'Hala industrială', x: -92, z: -26, icon: 'I' },
  { name: 'Poartă', x: -12, z: 36, icon: 'P' },
];
