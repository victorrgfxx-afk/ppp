import { rrect } from './carparts.js';

// a trapezoid with rounded corners (a grille, an intake): centre (cx, cy), wTop over wBot, h high, corners r
const trap = (k, cx, cy, wTop, wBot, h, r, n = 4) => {
  const c = [[cx + wTop / 2, cy + h / 2], [cx - wTop / 2, cy + h / 2], [cx - wBot / 2, cy - h / 2], [cx + wBot / 2, cy - h / 2]], o = [];
  for (let i = 0; i < 4; i++) {
    const P = c[i], A = c[(i + 3) % 4], B = c[(i + 1) % 4];
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const a = [P[0] + (A[0] - P[0]) * r / la, P[1] + (A[1] - P[1]) * r / la], b = [P[0] + (B[0] - P[0]) * r / lb, P[1] + (B[1] - P[1]) * r / lb];
    for (let j = 0; j <= n; j++) { const t = j / n, u = 1 - t; o.push([k, u * u * a[0] + 2 * u * t * P[0] + t * t * b[0], u * u * a[1] + 2 * u * t * P[1] + t * t * b[1]]); }
  }
  return o;
};

// (V103) the cars as the real ones: their dimensions from the makers' data, their sides, fronts and rears traced from
// photos and scale drawings of the real cars (README: V103)
export const REAL = {
  // BMW 3 Series E90 saloon before the 2008 facelift - the black 320d by the gate (photos 1-4). 4520 mm long, 1817
  // wide, 1421 high (with the aerial; the roof 1407), 2760 between the axles, tracks 1500 / 1513 (BMW's workshop data);
  // its side, front, rear and top views traced at scale from a drawing of the pre-facelift car (the-blueprints.com),
  // checked against photos 2-4: the beltline rising to the boot, the Hofmeister kink, the twin rings in the
  // headlamps, the two-tone L lamps reaching round onto the wings, the plate on the boot lid; 205/55 R16 on the
  // five twin-spoke wheels.
  bmw: {
    name: 'BMW Seria 3 (E90)', L: 4.52, W: 1.817, axles: [0.758, 3.518], r: 0.316, tireW: 0.205, track: [1.5, 1.513],
    rimK: 0.68, rimStyle: { kind: 'twin', n: 5, w: 0.032, gap: 0.22, col: 0xc3c6ca, dish: 0.03 },
    belt: [[0, 0.37], [0.02, 0.542], [0.04, 0.591], [0.06, 0.632], [0.08, 0.645], [0.1, 0.658], [0.15, 0.678], [0.2, 0.691], [0.3, 0.723], [0.45, 0.766], [0.6, 0.791], [0.8, 0.824], [1.0, 0.848], [1.2, 0.872],
      [1.31, 0.875], [1.62, 0.875], [2.42, 0.898], [3.17, 0.926], [3.47, 0.938], [3.97, 1.0], [4.2, 0.996], [4.35, 0.978], [4.44, 0.975], [4.452, 0.8], [4.47, 0.66], [4.5, 0.585], [4.52, 0.53]],
    roof: [[1.31, 0.875], [1.4, 0.998], [1.5, 1.062], [1.6, 1.116], [1.7, 1.179], [1.8, 1.233], [2.0, 1.332], [2.2, 1.368], [2.4, 1.395], [2.6, 1.395], [3.0, 1.395], [3.2, 1.386], [3.3, 1.363], [3.4, 1.332],
      [3.5, 1.296], [3.6, 1.26], [3.7, 1.215], [3.8, 1.17], [3.9, 1.125], [3.97, 1.08], [4.0, 1.0]],
    bottom: [[0, 0.33], [0.02, 0.235], [0.04, 0.216], [0.06, 0.199], [0.08, 0.19], [0.1, 0.18], [0.15, 0.171], [0.3, 0.171], [0.4, 0.18], [1.2, 0.153], [1.5, 0.162], [2.5, 0.162], [3.0, 0.171], [4.0, 0.216], [4.2, 0.235], [4.3, 0.244], [4.45, 0.244], [4.5, 0.316], [4.52, 0.46]],
    plan: [[0, 0.143], [0.02, 0.224], [0.03, 0.275], [0.05, 0.469], [0.08, 0.56], [0.1, 0.622], [0.15, 0.764], [0.2, 0.845], [0.3, 0.927], [0.4, 0.962], [0.6, 0.983], [0.8, 0.988], [1.0, 0.993], [2.5, 1.0],
      [3.0, 0.998], [3.8, 0.988], [4.0, 0.937], [4.27, 0.871], [4.32, 0.85], [4.37, 0.825], [4.42, 0.754], [4.45, 0.677], [4.47, 0.601], [4.49, 0.417], [4.5, 0.331], [4.51, 0.224], [4.52, 0.09]],
    crown: [[0, 0.03], [0.25, 0.07], [1.3, 0.085], [3.97, 0.06], [4.45, 0.05], [4.52, 0.03]],
    shoulder: [[0.3, 0.68], [1.0, 0.755], [2.5, 0.795], [4.1, 0.833], [4.4, 0.84]],
    sec: { k2: 0.96, d2: 0.1, f3: 0.6, k4: 0.99, k5: 0.88, k6: 0.846, d7: 0.06 },
    hwr: 0.578, wind: [1.31, 2.05], rear: [3.4, 3.97], side: [1.62, 3.49], pillars: [2.42, 3.17], eyeY: 1.13,
    lights: { head: [0.1, 0.64, 0.6, 0.38, 0.14], tail: [4.45, 0.85, 0.6, 0.3, 0.2] },
    dlo: {
      glass: [
        [[1.62, 0.917], [2.421, 0.94], [2.516, 1.322], [2.3, 1.316], [2.15, 1.295], [2.05, 1.27], [1.97, 1.225], [1.86, 1.15], [1.75, 1.07], [1.62, 0.98]],
        [[2.501, 0.943], [3.17, 0.968], [3.185, 1.265], [2.95, 1.3], [2.591, 1.322]],
        [[3.24, 0.97], [3.47, 0.983], [3.49, 1.053], [3.458, 1.14], [3.396, 1.203], [3.246, 1.253]],
      ],
      black: [[[2.41, 0.93], [2.512, 0.93], [2.605, 1.345], [2.505, 1.345]], [[1.5, 0.9], [1.63, 0.9], [1.63, 0.99], [1.55, 0.95]]],
      surround: 0.016, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.68, 0.98], mirror: [0.2, 0.115], handles: [[2.31, 0.79], [3.21, 0.83]],
    plates: { front: [0.45], rear: [0.785] }, exhaust: [[-0.52, 0.29, 0.037, 0.12]],
    parts: [
      // the headlamps: chrome reflectors, the two "corona" rings round the projector and the main beam, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.445, 0.698], ['f', 0.62, 0.707], ['f', 0.778, 0.711], ['f', 0.803, 0.678], ['f', 0.786, 0.62], ['f', 0.745, 0.585], ['f', 0.578, 0.566], ['f', 0.403, 0.562]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.661, 0.645, 0.042] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.661, 0.645, 0.05, 0.06] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.519, 0.645, 0.04] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.519, 0.645, 0.048, 0.058] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.445, 0.698], ['f', 0.62, 0.707], ['f', 0.778, 0.711], ['f', 0.803, 0.678], ['f', 0.786, 0.62], ['f', 0.745, 0.585], ['f', 0.578, 0.566], ['f', 0.403, 0.562]] },
      // the kidneys: chrome surrounds standing proud, chrome-edged black slats
      { at: 'f', mat: 'chrome', mirror: true, depth: 0.014, poly: rrect('f', 0.172, 0.636, 0.315, 0.165, 0.045) },
      { at: 'f', mat: 'vslats', mirror: true, off: 0.019, poly: rrect('f', 0.172, 0.636, 0.28, 0.13, 0.035) },
      // the bumper: the honeycomb intake in the middle, the black side intakes, the fog lamps at their ends
      { at: 'f', mat: 'mesh', off: 0.002, poly: rrect('f', 0, 0.335, 0.54, 0.105, 0.045) },
      { at: 'f', mat: 'matte', mirror: true, off: 0.002, poly: [['f', 0.335, 0.385], ['f', 0.645, 0.385], ['f', 0.62, 0.28], ['f', 0.36, 0.28]] },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.012, disc: ['f', 0.703, 0.33, 0.037], sx: 1.55 },
      // the sides: the repeater low on the wing, the door cuts (the rear door's round the arch)
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.27, 0.586, 0.014], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.39, 0.915], ['s', 1.39, 0.3], ['s', 3.1, 0.31]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.5, 0.935], ['s', 2.457, 0.3]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.46, 0.94], ['s', 3.4, 0.787], ['s', 3.24, 0.577], ['s', 3.135, 0.442], ['s', 3.1, 0.31]] },
      // the L lamps: from the boot lid round onto the wings, the reversing light in the lid's part; the lid's cut,
      // the black diffuser, the reflectors
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.438, 0.928], ['r', 0.697, 0.948], ['s', 4.4, 0.94], ['s', 4.3, 0.925], ['s', 4.21, 0.905], ['s', 4.2, 0.86], ['s', 4.22, 0.78], ['s', 4.28, 0.745], ['s', 4.38, 0.738], ['r', 0.73, 0.74], ['r', 0.464, 0.745], ['r', 0.413, 0.828], ['r', 0.4, 0.886]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.49, 0.775, 0.09, 0.03, 0.01) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.4, 0.66], ['r', -0.2, 0.632], ['r', 0, 0.628], ['r', 0.2, 0.632], ['r', 0.4, 0.66]] },
      { at: 'r', mat: 'matte', off: 0.002, poly: rrect('r', 0, 0.248, 1.25, 0.1, 0.035) },
      { at: 'r', mat: 'red', mirror: true, off: 0.002, poly: rrect('r', 0.72, 0.36, 0.1, 0.025, 0.01) },
    ],
  },
  // Peugeot 508 saloon before the 2014 facelift - the user's grey one, PH 77 XXS (photos 6-8, 17). Peugeot's own
  // data sheet (01/2011): 4792 mm long, 1853 wide, 1456 high, 2817 between the axles, overhangs 985 / 990, tracks
  // 1581 / 1554 on 16-17 inch wheels; the side traced from a perpendicular photo of the car (Wikimedia Commons, its
  // ends corrected for the camera's perspective: the tail lands at 4.78 m), the plan from Peugeot's drawing, the rear
  // from the user's photos: the lamps on the wings only, red with three white claws, the chrome bar across the boot
  // lid between them, the plate low in the bumper; the floating trapezoid grille with its chrome bars, the swept
  // headlamps, the chrome window surrounds and sill strip. 215/55 R17.
  p508: {
    name: 'Peugeot 508', L: 4.792, W: 1.853, axles: [0.985, 3.802], r: 0.334, tireW: 0.215, track: [1.581, 1.554],
    rimK: 0.68, rimStyle: { kind: 'twin', n: 5, w: 0.03, gap: 0.24, col: 0xbfc3c8, dish: 0.035 },
    belt: [[0, 0.57], [0.055, 0.648], [0.16, 0.738], [0.29, 0.79], [0.5, 0.849], [0.71, 0.883], [0.92, 0.903], [1.13, 0.92], [1.2, 0.925], [1.78, 0.945], [2.56, 0.97], [3.58, 0.987], [4.21, 1.087],
      [4.34, 1.067], [4.5, 1.06], [4.63, 1.04], [4.68, 1.005], [4.705, 0.935], [4.744, 0.77], [4.77, 0.62], [4.792, 0.58]],
    roof: [[1.2, 0.925], [1.35, 1.05], [1.5, 1.128], [1.8, 1.288], [2.0, 1.373], [2.23, 1.418], [2.64, 1.444], [3.05, 1.44], [3.465, 1.408], [3.67, 1.362], [3.82, 1.25], [4.08, 1.154], [4.21, 1.087]],
    bottom: [[0, 0.32], [0.03, 0.27], [0.16, 0.233], [0.42, 0.217], [1.4, 0.22], [3.3, 0.235], [4.34, 0.282], [4.6, 0.32], [4.68, 0.342], [4.731, 0.39], [4.77, 0.487], [4.792, 0.55]],
    plan: [[0, 0.43], [0.05, 0.5], [0.1, 0.585], [0.15, 0.69], [0.2, 0.77], [0.3, 0.88], [0.4, 0.935], [0.6, 0.97], [0.8, 0.985], [1.0, 0.995], [1.4, 1.0], [3.6, 1.0], [4.0, 0.99], [4.3, 0.95],
      [4.5, 0.87], [4.6, 0.78], [4.68, 0.65], [4.74, 0.5], [4.77, 0.38], [4.792, 0.25]],
    crown: [[0, 0.03], [0.3, 0.055], [1.2, 0.06], [4.21, 0.05], [4.68, 0.04], [4.792, 0.02]],
    shoulder: [[0.35, 0.78], [1.4, 0.86], [3.0, 0.89], [4.3, 0.93]],
    sec: { k2: 0.96, d2: 0.1, f3: 0.62, k4: 0.99, k5: 0.88, k6: 0.85, d7: 0.06 },
    hwr: 0.6, wind: [1.2, 2.0], rear: [3.67, 4.18], side: [1.78, 3.6], pillars: [2.555, 3.6], eyeY: 1.15,
    lights: { head: [0.1, 0.67, 0.65, 0.4, 0.12], tail: [4.7, 0.9, 0.65, 0.3, 0.15] },
    dlo: {
      glass: [
        [[1.78, 0.99], [2.555, 1.015], [2.585, 1.345], [2.43, 1.335], [2.23, 1.3], [2.03, 1.226], [1.83, 1.11]],
        [[2.693, 1.015], [3.58, 1.032], [3.606, 1.044], [3.606, 1.105], [3.58, 1.165], [3.53, 1.225], [3.43, 1.287], [3.256, 1.323], [2.73, 1.355]],
      ],
      black: [[[2.555, 1.0], [2.68, 1.0], [2.7, 1.36], [2.585, 1.36]]],
      surround: 0.015, surroundChrome: true, frame: 'body', sill: 'chrome',
    },
    mirrorAt: [1.75, 1.02], mirror: [0.21, 0.13], handles: [[2.344, 0.875], [3.356, 0.895]],
    plates: { front: [0.42], rear: [0.44], off: 0.026 }, exhaust: [[-0.42, 0.24, 0.032, 0.1]],
    parts: [
      // the floating grille: a chrome surround standing proud, black inside, three chrome bars across
      { at: 'f', mat: 'chrome', depth: 0.012, poly: trap('f', 0, 0.49, 0.94, 0.82, 0.26, 0.04) },
      { at: 'f', mat: 'slats', off: 0.017, poly: trap('f', 0, 0.49, 0.9, 0.78, 0.22, 0.03) },
      ...[0.56, 0.52, 0.48].map(y => ({ at: 'f', mat: 'chrome', off: 0.019, w: 0.01, line: [['f', -0.42 + (0.56 - y) * 0.2, y], ['f', 0, y], ['f', 0.42 - (0.56 - y) * 0.2, y]] })),
      // the headlamps: swept back over the wings, the projector in its ring, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.46, 0.7], ['f', 0.56, 0.725], ['f', 0.7, 0.755], ['f', 0.82, 0.77], ['s', 0.33, 0.785], ['s', 0.44, 0.78], ['s', 0.42, 0.745], ['f', 0.85, 0.69], ['f', 0.75, 0.645], ['f', 0.6, 0.605], ['f', 0.49, 0.59]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.58, 0.66, 0.036] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.58, 0.66, 0.041, 0.05] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, w: 0.012, line: [['f', 0.66, 0.735], ['f', 0.76, 0.755], ['f', 0.84, 0.765]] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.46, 0.7], ['f', 0.56, 0.725], ['f', 0.7, 0.755], ['f', 0.82, 0.77], ['s', 0.33, 0.785], ['s', 0.44, 0.78], ['s', 0.42, 0.745], ['f', 0.85, 0.69], ['f', 0.75, 0.645], ['f', 0.6, 0.605], ['f', 0.49, 0.59]] },
      // the bumper: the black intake at its foot, the chrome blades with the daytime LEDs in its corners
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.305, 0.9, 0.84, 0.06, 0.02) },
      { at: 'f', mat: 'chrome', mirror: true, off: 0.003, poly: rrect('f', 0.69, 0.365, 0.15, 0.035, 0.012) },
      { at: 'f', mat: 'head', mirror: true, off: 0.005, poly: rrect('f', 0.69, 0.365, 0.12, 0.012, 0.005) },
      // the sides: the door cuts (the rear door's round the arch), the chrome strip along the sills
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.394, 1.0], ['s', 1.381, 0.8], ['s', 1.4, 0.56], ['s', 1.43, 0.32], ['s', 3.32, 0.32]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.556, 1.0], ['s', 2.55, 0.32]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.654, 1.008], ['s', 3.62, 0.803], ['s', 3.52, 0.609], ['s', 3.4, 0.44], ['s', 3.32, 0.32]] },
      { at: 's', mat: 'chrome', mirror: true, off: 0.003, w: 0.012, line: [['s', 1.45, 0.275], ['s', 3.3, 0.285]] },
      // the tail lamps on the wings: red, three white claws; the chrome bar across the lid, reflectors, the black foot
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.5, 0.95], ['r', 0.6, 0.985], ['r', 0.8, 0.99], ['s', 4.6, 0.99], ['s', 4.45, 0.985], ['s', 4.3, 0.945], ['s', 4.28, 0.92], ['s', 4.35, 0.89], ['s', 4.5, 0.85], ['s', 4.62, 0.82], ['r', 0.84, 0.81], ['r', 0.7, 0.86], ['r', 0.58, 0.9]] },
      ...[0.64, 0.7, 0.76].map(x => ({ at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', x, 0.925, 0.013, 0.07, 0.006) })),
      { at: 'r', mat: 'chrome', off: 0.003, depth: 0.004, w: 0.016, line: [['r', -0.52, 0.97], ['r', 0, 0.975], ['r', 0.52, 0.97]] },
      { at: 'r', mat: 'red', mirror: true, off: 0.002, poly: rrect('r', 0.66, 0.31, 0.12, 0.022, 0.008) },
      { at: 'r', mat: 'matte', off: 0.002, poly: rrect('r', 0, 0.27, 1.05, 0.08, 0.03) },
    ],
  },
  // Volkswagen Golf IV (type 1J), 5 doors - the dark blue one by the brown board fence (photo 17). VW's dimension
  // drawing: 4149 mm long, 1735 wide, 1439 high, 2511 between the axles, 861 / 777 overhangs, tracks 1513 / 1494; the
  // silhouette traced from a vector side view of the car (Wikimedia Commons), the doors and windows of the 5-door from
  // VW's drawing (the-blueprints.com), the details from photos of a 1998 Golf S: the twin round reflectors under
  // one clear lens, the body-coloured grille with its black slats, the black rubbing strips along the bumpers and
  // doors, the plate in the rear bumper; 195/65 R15 on steel wheels with plastic covers.
  golf4: {
    name: 'VW Golf IV', cabin: 'hatch', L: 4.149, W: 1.735, axles: [0.861, 3.372], r: 0.317, tireW: 0.195, track: [1.513, 1.494],
    rimK: 0.68, rimStyle: { kind: 'cover', n: 10, w: 0.03, col: 0xb8bbbf, cap: 0x9a9da2 },
    belt: [[0, 0.558], [0.02, 0.57], [0.04, 0.62], [0.06, 0.65], [0.08, 0.668], [0.1, 0.69], [0.15, 0.735], [0.2, 0.758], [0.3, 0.782], [0.45, 0.816], [0.6, 0.844], [0.8, 0.878], [1.0, 0.9], [1.12, 0.885],
      [1.38, 0.862], [2.5, 0.885], [3.4, 0.915], [3.75, 0.94], [3.97, 0.97], [4.02, 0.965], [4.05, 0.8], [4.1, 0.64], [4.149, 0.623]],
    roof: [[1.12, 0.885], [1.2, 1.016], [1.3, 1.078], [1.4, 1.143], [1.5, 1.202], [1.6, 1.264], [1.7, 1.31], [1.8, 1.349], [1.9, 1.388], [2.0, 1.408], [2.2, 1.427], [2.8, 1.427], [3.0, 1.424], [3.2, 1.417],
      [3.4, 1.408], [3.5, 1.398], [3.6, 1.385], [3.7, 1.355], [3.75, 1.303], [3.8, 1.251], [3.85, 1.192], [3.9, 1.13], [3.95, 1.055], [3.99, 0.97]],
    bottom: [[0, 0.4], [0.04, 0.362], [0.06, 0.278], [0.1, 0.222], [0.15, 0.193], [0.3, 0.189], [0.45, 0.18], [1.3, 0.209], [3.0, 0.215], [3.75, 0.235], [3.9, 0.238], [4.0, 0.29], [4.1, 0.346], [4.149, 0.48]],
    plan: [[0, 0.45], [0.03, 0.6], [0.08, 0.72], [0.15, 0.82], [0.25, 0.9], [0.4, 0.96], [0.6, 0.985], [0.9, 1.0], [3.3, 1.0], [3.6, 0.99], [3.8, 0.97], [3.95, 0.93], [4.05, 0.87], [4.1, 0.78], [4.13, 0.65], [4.149, 0.5]],
    crown: [[0, 0.03], [0.3, 0.06], [1.1, 0.08], [3.9, 0.05], [4.149, 0.02]],
    sec: { k2: 0.965, d2: 0.09, f3: 0.55, k4: 0.99, k5: 0.9, k6: 0.86, d7: 0.06 },
    hwr: 0.6, wind: [1.12, 2.0], rear: [3.72, 3.96], side: [1.4, 3.22], pillars: [2.34, 3.15], eyeY: 1.17,
    lights: { head: [0.08, 0.69, 0.55, 0.4, 0.14], tail: [4.0, 0.88, 0.65, 0.3, 0.17] },
    dlo: {
      glass: [
        [[1.4, 0.905], [2.35, 0.925], [2.37, 1.345], [2.1, 1.35], [1.95, 1.33], [1.78, 1.24], [1.6, 1.12], [1.45, 1.0]],
        [[2.48, 0.928], [3.06, 0.94], [3.06, 1.345], [2.5, 1.35]],
        [[3.11, 0.942], [3.22, 0.946], [3.15, 1.2], [3.11, 1.33]],
      ],
      black: [[[2.33, 0.91], [2.48, 0.91], [2.5, 1.37], [2.36, 1.37]], [[1.3, 0.87], [1.42, 0.87], [1.42, 0.98], [1.36, 0.93]]],
      surround: 0.015, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.42, 0.97], mirror: [0.17, 0.13], handles: [[2.15, 0.83], [3.0, 0.84]],
    plates: { front: [0.42], rear: [0.5] }, exhaust: [[-0.45, 0.25, 0.03, 0.1]],
    parts: [
      // the headlamps: one clear lens over two round reflectors; the grille's black slats, a chrome ring in the middle
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: rrect('f', 0.55, 0.69, 0.44, 0.14, 0.045) },
      { at: 'f', mat: 'head', mirror: true, off: 0.005, ring: ['f', 0.62, 0.69, 0.042, 0.054] },
      { at: 'f', mat: 'head', mirror: true, off: 0.005, ring: ['f', 0.44, 0.69, 0.036, 0.047] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.004, disc: ['f', 0.62, 0.69, 0.02] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.004, disc: ['f', 0.44, 0.69, 0.018] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: rrect('f', 0.55, 0.69, 0.44, 0.14, 0.045) },
      { at: 'f', mat: 'slats', off: 0.003, poly: rrect('f', 0, 0.668, 0.6, 0.085, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.006, ring: ['f', 0, 0.668, 0.045, 0.055] },
      // the bumpers' black rubbing strips, the lower intake; the strips along the doors
      { at: 'f', mat: 'matte', off: 0.004, w: 0.05, line: [['f', -0.84, 0.49], ['f', 0, 0.49], ['f', 0.84, 0.49]] },
      { at: 'f', mat: 'mesh', off: 0.002, poly: rrect('f', 0, 0.31, 0.92, 0.08, 0.03) },
      { at: 's', mat: 'matte', mirror: true, off: 0.004, w: 0.045, line: [['s', 1.33, 0.5], ['s', 2.0, 0.505], ['s', 2.98, 0.51]] },
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.12, 0.78, 0.014], sx: 1.8 },
      // the door cuts
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.306, 0.9], ['s', 1.306, 0.3], ['s', 2.98, 0.31]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.43, 0.925], ['s', 2.42, 0.3]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.21, 0.94], ['s', 3.2, 0.72], ['s', 3.12, 0.62], ['s', 3.02, 0.5], ['s', 2.98, 0.31]] },
      // the tail lamps on the tailgate's corners, the reversing lights in them; the bumper's black strip
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.5, 0.97], ['r', 0.8, 0.975], ['s', 4.0, 0.975], ['s', 3.96, 0.95], ['s', 3.98, 0.82], ['r', 0.82, 0.8], ['r', 0.5, 0.8]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.57, 0.83, 0.12, 0.045, 0.01) },
      { at: 'r', mat: 'matte', off: 0.004, w: 0.06, line: [['r', -0.84, 0.6], ['r', 0, 0.6], ['r', 0.84, 0.6]] },
      { at: 'r', mat: 'chrome', off: 0.006, depth: 0.005, ring: ['r', 0, 0.88, 0.05, 0.06] },
    ],
  },
  // Mercedes-Benz A-Class W176 (2012-2018) - the silver one with its door open (photo 23: the chrome-ringed handles,
  // the framed glass and the roof falling away behind it). 4292 mm long, 1780 wide, 1433 high, 2699 between the
  // axles, tracks 1553 / 1552; traced at scale from a four-view drawing of the car (the-blueprints.com; its proportions
  // within 1 % of the data): the window line rising to the rear, the long spoiler over a short rear window, the
  // pointed headlamps with the projector and the LED torch, the big mesh grille with its two blades and the ring, the
  // trapezoid intake under the plate, the lamps from the tailgate's corners onto the wings; 205/55 R16.
  aclass: {
    name: 'Mercedes-Benz A 180 (W176)', L: 4.292, W: 1.78, axles: [0.89, 3.589], r: 0.316, tireW: 0.205, track: [1.553, 1.552],
    cabin: ['bmw', { saloon: false, brand: 'generic', cluster: 'generic', stack: 'generic', accent: 'alu', gear: 'manual', seat: { kind: 'sport', cover: 'fabric', col: 0x2c2d30 },
      col: { top: 0x1d1e20, low: 0x2a2b2e, door: 0x2a2b2e, liner: 0x8e8f91, carpet: 0x222325, trim: 0x161617 }, wheel: { spokes: 'mb', R: 0.185, tilt: 0.42, cover: 'leather', hub: [0.15, 0.12] } }],
    rimK: 0.68, rimStyle: { kind: 'twin', n: 5, w: 0.03, gap: 0.2, col: 0xc6c9cd, dish: 0.03 },
    belt: [[0, 0.453], [0.02, 0.58], [0.04, 0.645], [0.06, 0.695], [0.08, 0.72], [0.1, 0.73], [0.15, 0.758], [0.2, 0.768], [0.3, 0.795], [0.45, 0.83], [0.6, 0.857], [0.8, 0.889], [1.0, 0.917], [1.1, 0.93],
      [1.25, 0.925], [1.72, 0.909], [2.49, 0.958], [3.22, 0.98], [3.5, 0.99], [3.9, 1.0], [4.12, 0.99], [4.17, 0.93], [4.2, 0.9], [4.23, 0.65], [4.25, 0.56], [4.292, 0.53]],
    roof: [[1.25, 0.925], [1.3, 0.998], [1.4, 1.061], [1.5, 1.114], [1.6, 1.167], [1.7, 1.224], [1.8, 1.268], [1.9, 1.309], [2.0, 1.35], [2.2, 1.382], [2.4, 1.402], [2.6, 1.414], [2.8, 1.418], [3.0, 1.414],
      [3.2, 1.402], [3.4, 1.39], [3.6, 1.366], [3.7, 1.35], [3.8, 1.329], [3.9, 1.309], [3.95, 1.297], [4.0, 1.15], [4.05, 1.087], [4.1, 1.046], [4.16, 0.96]],
    bottom: [[0, 0.357], [0.02, 0.231], [0.04, 0.219], [0.1, 0.199], [0.2, 0.174], [0.3, 0.16], [0.5, 0.15], [1.3, 0.15], [3.0, 0.155], [4.0, 0.211], [4.1, 0.227], [4.2, 0.247], [4.25, 0.3], [4.292, 0.337]],
    plan: [[0, 0.065], [0.005, 0.127], [0.01, 0.176], [0.02, 0.296], [0.03, 0.359], [0.05, 0.493], [0.08, 0.607], [0.1, 0.65], [0.15, 0.734], [0.2, 0.794], [0.3, 0.885], [0.4, 0.946], [0.6, 0.996], [0.8, 1.0],
      [3.5, 1.0], [4.0, 0.975], [4.042, 0.951], [4.092, 0.914], [4.142, 0.878], [4.192, 0.826], [4.222, 0.774], [4.242, 0.724], [4.262, 0.66], [4.272, 0.613], [4.282, 0.516], [4.292, 0.401]],
    crown: [[0, 0.03], [0.3, 0.055], [1.1, 0.06], [4.0, 0.05], [4.292, 0.02]],
    shoulder: [[0.3, 0.73], [1.3, 0.83], [2.5, 0.87], [3.6, 0.91], [4.1, 0.92]],
    sec: { k2: 0.95, d2: 0.1, f3: 0.6, k4: 0.99, k5: 0.88, k6: 0.85, d7: 0.06 },
    hwr: 0.58, wind: [1.25, 2.05], rear: [3.97, 4.12], side: [1.72, 3.52], pillars: [2.49, 3.22], eyeY: 1.13,
    lights: { head: [0.1, 0.68, 0.64, 0.35, 0.15], tail: [4.2, 0.9, 0.62, 0.3, 0.15] },
    dlo: {
      glass: [
        [[1.719, 0.949], [2.49, 0.998], [2.53, 1.306], [2.25, 1.29], [2.0, 1.245], [1.86, 1.15], [1.739, 1.042]],
        [[2.66, 1.005], [3.22, 1.02], [3.22, 1.245], [2.66, 1.306]],
        [[3.25, 1.022], [3.5, 1.03], [3.52, 1.06], [3.45, 1.15], [3.35, 1.22], [3.25, 1.24]],
      ],
      black: [[[2.49, 0.99], [2.66, 0.99], [2.66, 1.33], [2.53, 1.33]], [[1.6, 0.93], [1.73, 0.93], [1.74, 1.05], [1.66, 0.99]]],
      surround: 0.014, frame: 'body', sill: 'chrome',
    },
    mirrorAt: [1.63, 1.0], mirror: [0.19, 0.12], handles: [[2.307, 0.888], [3.22, 0.908]], chromeHandles: true,
    plates: { front: [0.437], rear: [0.795] }, exhaust: [[-0.5, 0.22, 0.03, 0.1]],
    parts: [
      // the headlamps: pointed in towards the grille, the projector, the LED torch along their top
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.672, 0.8], ['f', 0.53, 0.71], ['f', 0.488, 0.576], ['f', 0.6, 0.595], ['f', 0.73, 0.61], ['f', 0.797, 0.635], ['f', 0.805, 0.751], ['f', 0.788, 0.776]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.713, 0.671, 0.03] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.713, 0.671, 0.034, 0.042] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, w: 0.012, line: [['f', 0.7, 0.78], ['f', 0.6, 0.735], ['f', 0.53, 0.69], ['f', 0.5, 0.62]] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.672, 0.8], ['f', 0.53, 0.71], ['f', 0.488, 0.576], ['f', 0.6, 0.595], ['f', 0.73, 0.61], ['f', 0.797, 0.635], ['f', 0.805, 0.751], ['f', 0.788, 0.776]] },
      // the grille: a chrome surround, the mesh, two chrome blades across, the ring in the middle
      { at: 'f', mat: 'chrome', depth: 0.008, poly: trap('f', 0, 0.618, 0.96, 0.88, 0.22, 0.05) },
      { at: 'f', mat: 'mesh', off: 0.013, poly: trap('f', 0, 0.618, 0.92, 0.84, 0.18, 0.04) },
      ...[0.662, 0.624].map(y => ({ at: 'f', mat: 'chrome', off: 0.016, w: 0.012, line: [['f', -0.43, y], ['f', 0, y], ['f', 0.43, y]] })),
      { at: 'f', mat: 'black', off: 0.017, disc: ['f', 0, 0.6, 0.078] },
      { at: 'f', mat: 'chrome', off: 0.019, depth: 0.004, ring: ['f', 0, 0.6, 0.078, 0.092] },
      // the bumper: the trapezoid intake under the plate, the black lip, the side intakes
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.328, 0.8, 1.2, 0.12, 0.04) },
      { at: 'f', mat: 'matte', off: 0.002, poly: rrect('f', 0, 0.22, 1.3, 0.04, 0.015) },
      { at: 'f', mat: 'mesh', mirror: true, off: 0.002, rim: 0.006, poly: [['f', 0.59, 0.415], ['f', 0.83, 0.418], ['f', 0.82, 0.3], ['f', 0.62, 0.31]] },
      // the sides: the door cuts, the rear door's round the arch
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.354, 0.92], ['s', 1.354, 0.25], ['s', 3.26, 0.26]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.5, 0.99], ['s', 2.47, 0.25]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.54, 1.02], ['s', 3.52, 0.86], ['s', 3.46, 0.657], ['s', 3.34, 0.515], ['s', 3.26, 0.333], ['s', 3.26, 0.26]] },
      // the tail lamps from the tailgate's corners onto the wings, the reversing lights; the tailgate's cut, the
      // black diffuser with its reflectors
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.5, 0.95], ['r', 0.72, 0.975], ['s', 4.09, 0.973], ['s', 3.95, 0.96], ['s', 3.83, 0.92], ['s', 3.9, 0.88], ['s', 4.0, 0.85], ['s', 4.12, 0.8], ['r', 0.79, 0.785], ['r', 0.6, 0.79], ['r', 0.5, 0.86]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.6, 0.83, 0.1, 0.025, 0.008) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.52, 0.66], ['r', -0.3, 0.632], ['r', 0, 0.628], ['r', 0.3, 0.632], ['r', 0.52, 0.66]] },
      { at: 'r', mat: 'matte', off: 0.002, poly: trap('r', 0, 0.255, 1.1, 1.3, 0.13, 0.03) },
      { at: 'r', mat: 'red', mirror: true, off: 0.004, poly: rrect('r', 0.61, 0.218, 0.06, 0.02, 0.008) },
    ],
  },
  // Dacia Sandero, first generation (2008-2012) - the hatchback behind most of the town's parked cars. Dacia's figures:
  // 4020 mm long, 1746 wide, 1534 high, 2589 between the axles, tracks 1469 / 1456; traced at scale from Dacia's own
  // four-view illustration (the-blueprints.com; its roof drawn ~3 % low, raised to the 1534 mm): the high bonnet, the
  // big headlamps swept up at their outer corners with the round reflector, the chrome bar over the black grille,
  // the honeycomb intake and round fog lamps, the rear door's fixed glass, the tall lamps on the tailgate's corners,
  // the plates in the bumpers; 185/65 R15.
  hatch: {
    name: 'Dacia Sandero', L: 4.02, W: 1.746, axles: [0.766, 3.355], r: 0.311, tireW: 0.185, track: [1.469, 1.456],
    rimK: 0.66, rimStyle: { kind: 'spokes', n: 5, w: 0.05, col: 0xc0c3c7, dish: 0.025 },
    belt: [[0, 0.56], [0.02, 0.61], [0.04, 0.62], [0.06, 0.65], [0.08, 0.68], [0.1, 0.705], [0.15, 0.755], [0.2, 0.78], [0.3, 0.825], [0.45, 0.868], [0.6, 0.9], [0.8, 0.935], [1.0, 0.958], [1.1, 0.97],
      [1.3, 0.94], [1.47, 0.928], [2.25, 0.933], [3.0, 0.94], [3.24, 0.945], [3.45, 0.95], [3.85, 0.97], [3.92, 0.96], [3.97, 0.8], [4.0, 0.57], [4.02, 0.55]],
    roof: [[1.12, 0.97], [1.2, 1.106], [1.3, 1.173], [1.4, 1.236], [1.5, 1.297], [1.6, 1.353], [1.7, 1.404], [1.8, 1.45], [1.9, 1.482], [2.0, 1.504], [2.2, 1.512], [2.4, 1.518], [2.6, 1.518], [2.8, 1.512],
      [3.0, 1.495], [3.2, 1.478], [3.4, 1.467], [3.45, 1.455], [3.5, 1.382], [3.6, 1.303], [3.65, 1.264], [3.7, 1.213], [3.75, 1.173], [3.8, 1.122], [3.85, 1.072], [3.9, 0.98]],
    bottom: [[0, 0.459], [0.02, 0.444], [0.04, 0.3], [0.06, 0.214], [0.3, 0.209], [0.45, 0.2], [1.2, 0.193], [3.0, 0.2], [3.7, 0.277], [3.9, 0.292], [3.97, 0.4], [4.02, 0.5]],
    plan: [[0, 0.35], [0.005, 0.38], [0.01, 0.408], [0.02, 0.457], [0.03, 0.503], [0.05, 0.573], [0.08, 0.65], [0.1, 0.693], [0.15, 0.776], [0.2, 0.828], [0.3, 0.902], [0.4, 0.954], [0.6, 0.988], [0.8, 1.0],
      [3.5, 0.99], [3.77, 0.938], [3.82, 0.886], [3.87, 0.828], [3.92, 0.72], [3.95, 0.6], [3.97, 0.5], [3.99, 0.35], [4.02, 0.2]],
    crown: [[0, 0.03], [0.3, 0.05], [1.1, 0.08], [3.85, 0.04], [4.02, 0.02]],
    sec: { k2: 0.97, d2: 0.08, f3: 0.55, k4: 0.99, k5: 0.9, k6: 0.86, d7: 0.07 },
    hwr: 0.63, wind: [1.12, 2.0], rear: [3.47, 3.82], side: [1.47, 3.23], pillars: [2.254, 3.2], eyeY: 1.22,
    lights: { head: [0.08, 0.76, 0.6, 0.36, 0.12], tail: [4.0, 0.85, 0.67, 0.12, 0.22] },
    dlo: {
      glass: [
        [[1.47, 0.968], [2.23, 0.973], [2.23, 1.412], [1.82, 1.4], [1.6, 1.246], [1.466, 1.116]],
        [[2.39, 0.976], [2.97, 0.981], [2.97, 1.408], [2.39, 1.418]],
        [[3.02, 0.981], [3.23, 0.986], [3.19, 1.224], [3.17, 1.37], [3.02, 1.397]],
      ],
      black: [[[2.25, 0.96], [2.39, 0.96], [2.4, 1.43], [2.27, 1.43]], [[1.36, 0.94], [1.48, 0.94], [1.47, 1.1], [1.42, 1.02]]],
      surround: 0.015, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.42, 1.04], mirror: [0.17, 0.13], handles: [[2.09, 0.813], [3.02, 0.838]],
    plates: { front: [0.505], rear: [0.428] }, exhaust: [[-0.45, 0.27, 0.03, 0.1]],
    parts: [
      // the headlamps: swept up at the outer corner, the round reflector, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.733, 0.868], ['f', 0.6, 0.84], ['f', 0.445, 0.755], ['f', 0.408, 0.643], ['f', 0.55, 0.675], ['f', 0.683, 0.705], ['f', 0.758, 0.743], ['f', 0.755, 0.83]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.65, 0.76, 0.03] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.65, 0.76, 0.034, 0.046] },
      { at: 'f', mat: 'amber', mirror: true, off: 0.005, poly: rrect('f', 0.48, 0.7, 0.08, 0.03, 0.01) },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.733, 0.868], ['f', 0.6, 0.84], ['f', 0.445, 0.755], ['f', 0.408, 0.643], ['f', 0.55, 0.675], ['f', 0.683, 0.705], ['f', 0.758, 0.743], ['f', 0.755, 0.83]] },
      // the grille: black, the chrome bar along its top, the badge's place; the honeycomb intake, the fog lamps
      { at: 'f', mat: 'slats', off: 0.003, poly: trap('f', 0, 0.69, 0.84, 0.68, 0.14, 0.03) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.014, line: [['f', -0.43, 0.766], ['f', 0, 0.77], ['f', 0.43, 0.766]] },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, poly: trap('f', 0, 0.69, 0.07, 0.05, 0.065, 0.012) },
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.35, 0.88, 0.8, 0.16, 0.03) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.012, disc: ['f', 0.57, 0.368, 0.03] },
      // the sides: the repeater, the door cuts
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.117, 0.788, 0.014], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.217, 0.93], ['s', 1.217, 0.3], ['s', 3.0, 0.31]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.3, 0.95], ['s', 2.28, 0.3]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.24, 0.97], ['s', 3.2, 0.82], ['s', 3.15, 0.7], ['s', 3.05, 0.55], ['s', 3.0, 0.31]] },
      // the tall lamps on the tailgate's corners, round onto the wings; the tailgate's cut, the badge's place
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.606, 0.946], ['r', 0.743, 0.951], ['s', 3.94, 0.95], ['s', 3.93, 0.75], ['r', 0.731, 0.747], ['r', 0.643, 0.734], ['r', 0.598, 0.796]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.66, 0.79, 0.07, 0.04, 0.012) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.58, 0.62], ['r', 0, 0.61], ['r', 0.58, 0.62]] },
      { at: 'r', mat: 'chrome', off: 0.005, depth: 0.004, poly: trap('r', 0, 0.87, 0.07, 0.05, 0.065, 0.012) },
    ],
  },
  // Dacia Logan, first generation before the 2008 facelift - the saloon parked across the town. Dacia's figures for
  // the 1.6: 4247 mm long, 1740 wide, 1534 high, 2630 between the axles, tracks 1480 / 1470; traced at scale from
  // Dacia's own four-view illustration (the-blueprints.com; its heights drawn 1.2 % tall, brought to the 1534 mm):
  // the tall bonnet, the triangular grille in its chrome V, the big headlamps, the plate over the black lower grille
  // with the round fog lamps; the black B pillar, the rear door's window rounding into the C pillar; the boot lid
  // between the tall lamps that wrap round onto the wings, the plates in the bumpers; 185/65 R15.
  sedan: {
    name: 'Dacia Logan', L: 4.247, W: 1.74, axles: [0.778, 3.408], r: 0.311, tireW: 0.185, track: [1.48, 1.47],
    rimK: 0.66, rimStyle: { kind: 'spokes', n: 5, w: 0.055, col: 0xc0c3c7, dish: 0.025 },
    belt: [[0, 0.565], [0.02, 0.595], [0.04, 0.622], [0.06, 0.655], [0.08, 0.69], [0.1, 0.735], [0.12, 0.76], [0.15, 0.785], [0.2, 0.808], [0.3, 0.834], [0.4, 0.855], [0.5, 0.877], [0.6, 0.894],
      [0.7, 0.909], [0.8, 0.92], [0.9, 0.928], [1.0, 0.933], [1.47, 0.934], [2.2, 0.96], [2.4, 0.972], [3.05, 0.99], [3.5, 1.0], [3.9, 1.03], [4.1, 1.037], [4.13, 1.035],
      [4.15, 1.015], [4.17, 0.96], [4.19, 0.847], [4.2, 0.788], [4.205, 0.7], [4.212, 0.61], [4.247, 0.6]],
    roof: [[1.0, 0.933], [1.04, 1.02], [1.1, 1.063], [1.15, 1.09], [1.2, 1.115], [1.3, 1.179], [1.4, 1.243], [1.5, 1.306], [1.6, 1.357], [1.7, 1.421], [1.8, 1.463], [1.9, 1.488], [2.0, 1.503],
      [2.2, 1.518], [2.4, 1.522], [2.8, 1.522], [3.0, 1.503], [3.1, 1.491], [3.15, 1.478], [3.2, 1.459], [3.25, 1.433], [3.3, 1.408], [3.4, 1.357], [3.5, 1.3], [3.6, 1.243], [3.7, 1.179],
      [3.75, 1.148], [3.79, 1.12], [3.83, 1.06], [3.86, 1.0]],
    bottom: [[0, 0.43], [0.01, 0.3], [0.03, 0.268], [0.2, 0.254], [0.4, 0.235], [0.5, 0.22], [1.15, 0.191], [3.0, 0.191], [3.7, 0.21], [3.75, 0.255], [3.9, 0.272], [4.1, 0.285], [4.2, 0.318],
      [4.225, 0.37], [4.247, 0.55]],
    plan: [[0, 0.15], [0.005, 0.23], [0.01, 0.276], [0.02, 0.323], [0.03, 0.394], [0.05, 0.487], [0.08, 0.595], [0.1, 0.692], [0.15, 0.81], [0.2, 0.867], [0.3, 0.911], [0.4, 0.953], [0.6, 0.989],
      [0.8, 0.997], [1.0, 1.0], [3.0, 0.99], [3.5, 1.0], [3.8, 0.951], [4.0, 0.903], [4.047, 0.89], [4.097, 0.867], [4.147, 0.81], [4.177, 0.685], [4.197, 0.584], [4.217, 0.466], [4.227, 0.369],
      [4.237, 0.308], [4.247, 0.14]],
    crown: [[0, 0.03], [0.1, 0.04], [0.3, 0.055], [0.8, 0.075], [0.9, 0.08], [1.0, 0.1], [1.1, 0.1], [3.75, 0.1], [3.9, 0.09], [4.0, 0.08], [4.1, 0.065], [4.13, 0.06], [4.15, 0.05], [4.2, 0.035], [4.247, 0.02]],
    sec: { k2: 0.97, d2: 0.08, f3: 0.55, k4: 0.99, k5: 0.9, k6: 0.86, d7: 0.07 },
    hwr: 0.63, wind: [1.0, 1.95], rear: [3.15, 3.8], side: [1.49, 3.08], pillars: [2.27, 3.09], eyeY: 1.22,
    lights: { head: [0.1, 0.72, 0.61, 0.33, 0.15], tail: [4.19, 0.9, 0.66, 0.15, 0.3] },
    dlo: {
      glass: [
        [[1.49, 0.97], [1.7, 0.975], [1.83, 0.98], [2.15, 0.999], [2.176, 0.999], [2.18, 1.018], [2.196, 1.094], [2.215, 1.19], [2.234, 1.285], [2.247, 1.317], [2.255, 1.385], [2.228, 1.41],
          [2.17, 1.408], [2.06, 1.394], [1.951, 1.38], [1.848, 1.349], [1.784, 1.317], [1.726, 1.285], [1.674, 1.253], [1.616, 1.221], [1.571, 1.19], [1.526, 1.158], [1.494, 1.126], [1.487, 1.062]],
        [[2.376, 1.012], [2.5, 1.015], [2.73, 1.025], [3.05, 1.03], [3.065, 1.043], [3.071, 1.075], [3.078, 1.136], [3.084, 1.202], [3.078, 1.234], [3.058, 1.266], [3.02, 1.291], [2.955, 1.343],
          [2.89, 1.387], [2.83, 1.406], [2.73, 1.419], [2.44, 1.419], [2.415, 1.393], [2.408, 1.373], [2.402, 1.33], [2.395, 1.266], [2.389, 1.202], [2.382, 1.107]],
      ],
      black: [[[2.17, 0.98], [2.38, 0.99], [2.425, 1.43], [2.25, 1.43]], [[1.37, 0.95], [1.495, 0.95], [1.487, 1.07], [1.43, 1.0]]],
      surround: 0.015, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.42, 1.02], mirror: [0.17, 0.12], handles: [[2.06, 0.82], [2.95, 0.84]],
    plates: { front: [0.47], rear: [0.47] }, exhaust: [[-0.45, 0.27, 0.03, 0.1]],
    parts: [
      // the headlamps: the two round reflectors behind the clear lens, their inner ends along the grille's V
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.775, 0.785], ['f', 0.745, 0.805], ['f', 0.6, 0.802], ['f', 0.5, 0.795], ['f', 0.465, 0.77], ['f', 0.445, 0.72], ['f', 0.45, 0.67], ['f', 0.48, 0.64], ['f', 0.6, 0.638], ['f', 0.76, 0.64], ['f', 0.777, 0.67], ['f', 0.78, 0.74]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.565, 0.717, 0.04] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.565, 0.717, 0.044, 0.056] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.69, 0.72, 0.045] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.69, 0.72, 0.05, 0.062] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.775, 0.785], ['f', 0.745, 0.805], ['f', 0.6, 0.802], ['f', 0.5, 0.795], ['f', 0.465, 0.77], ['f', 0.445, 0.72], ['f', 0.45, 0.67], ['f', 0.48, 0.64], ['f', 0.6, 0.638], ['f', 0.76, 0.64], ['f', 0.777, 0.67], ['f', 0.78, 0.74]] },
      // the grille: a triangle pointing down, black, in its chrome V; the badge's place in it
      { at: 'f', mat: 'slats', off: 0.003, poly: [['f', 0.42, 0.787], ['f', -0.42, 0.787], ['f', -0.417, 0.775], ['f', -0.35, 0.745], ['f', -0.272, 0.71], ['f', -0.19, 0.672], ['f', -0.111, 0.638], ['f', -0.05, 0.615], ['f', 0, 0.606], ['f', 0.05, 0.615], ['f', 0.111, 0.638], ['f', 0.19, 0.672], ['f', 0.272, 0.71], ['f', 0.35, 0.745], ['f', 0.417, 0.775]] },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.013, line: [['f', -0.405, 0.787], ['f', -0.35, 0.752], ['f', -0.272, 0.717], ['f', -0.19, 0.679], ['f', -0.111, 0.645], ['f', -0.05, 0.622], ['f', 0, 0.613], ['f', 0.05, 0.622], ['f', 0.111, 0.645], ['f', 0.19, 0.679], ['f', 0.272, 0.717], ['f', 0.35, 0.752], ['f', 0.405, 0.787]] },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.011, line: [['f', -0.41, 0.784], ['f', 0.41, 0.784]] },
      { at: 'f', mat: 'chrome', off: 0.007, depth: 0.004, poly: trap('f', 0, 0.705, 0.07, 0.05, 0.07, 0.012) },
      // the bumper: the black lower grille across, the fog lamps at its ends
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.35, 1.36, 1.24, 0.1, 0.035) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.012, disc: ['f', 0.643, 0.372, 0.042] },
      // the sides: the repeater, the door cuts
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.12, 0.8, 0.014], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.24, 0.94], ['s', 1.24, 0.3], ['s', 3.0, 0.31]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.25, 0.965], ['s', 2.22, 0.3]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.08, 0.995], ['s', 3.07, 0.8], ['s', 3.05, 0.65], ['s', 3.02, 0.5], ['s', 3.0, 0.31]] },
      // the lamps on the wings' corners, wrapping round onto the sides, the reversing light low in them; the boot
      // lid's cut under them, the badge's place and the lock; the fog lamp (left)
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.555, 1.03], ['r', 0.6, 1.045], ['r', 0.66, 1.04], ['s', 4.12, 1.0], ['s', 4.04, 0.995], ['s', 4.025, 0.95], ['s', 4.04, 0.74], ['s', 4.15, 0.715], ['r', 0.72, 0.715], ['r', 0.565, 0.725]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.65, 0.76, 0.1, 0.055, 0.012) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.555, 0.72], ['r', 0, 0.715], ['r', 0.555, 0.72]] },
      { at: 'r', mat: 'chrome', off: 0.005, depth: 0.004, poly: trap('r', 0, 0.955, 0.07, 0.05, 0.07, 0.012) },
      { at: 'r', mat: 'chrome', off: 0.004, disc: ['r', 0, 0.82, 0.014] },
      { at: 'r', mat: 'red', off: 0.003, rim: 0.008, disc: ['r', -0.48, 0.47, 0.03] },
    ],
  },
  // Opel Corsa C, 5 doors, after the 2003 facelift - the grey one and the blue one on the street. Opel's figures:
  // 3839 mm long, 1646 wide, 1440 high, 2491 between the axles, tracks 1429 / 1420; traced at scale from a
  // three-view drawing of the 5-door (the-blueprints.com; its heights drawn 1 % short, brought to the 1440 mm), the
  // details from photos of the car (Wikimedia Commons): the windscreen raked far forward over the short bonnet, the
  // window line rising to the rear, the black B pillar and the fixed glass behind the rear door, the headlamps swept
  // up and out, the facelift's chrome bar across the grille, the tall lamps up the tailgate's pillars; 175/65 R14
  // under plastic covers.
  corsa: {
    name: 'Opel Corsa C', L: 3.839, W: 1.646, axles: [0.748, 3.242], r: 0.2916, tireW: 0.175, track: [1.429, 1.42],
    rimK: 0.68, rimStyle: { kind: 'cover', n: 10, w: 0.03, col: 0xb8bbbf, cap: 0x9a9da2 },
    belt: [[0, 0.542], [0.045, 0.645], [0.09, 0.703], [0.136, 0.745], [0.18, 0.758], [0.227, 0.786], [0.272, 0.799], [0.363, 0.81], [0.408, 0.822], [0.453, 0.836], [0.5, 0.849], [0.59, 0.861],
      [0.68, 0.872], [0.73, 0.885], [0.82, 0.897], [1.0, 0.9], [1.04, 0.909], [1.3, 0.915], [1.62, 0.922], [2.2, 0.932], [2.46, 0.948], [3.0, 0.962], [3.4, 0.97], [3.65, 0.972], [3.72, 0.952],
      [3.764, 0.925], [3.779, 0.835], [3.794, 0.69], [3.809, 0.575], [3.839, 0.583]],
    roof: [[1.04, 0.909], [1.08, 0.985], [1.15, 1.03], [1.25, 1.083], [1.35, 1.14], [1.45, 1.2], [1.55, 1.258], [1.65, 1.315], [1.72, 1.35], [1.8, 1.38], [1.9, 1.4], [2.0, 1.415], [2.2, 1.425],
      [2.86, 1.425], [3.0, 1.413], [3.08, 1.395], [3.2, 1.388], [3.3, 1.373], [3.36, 1.364], [3.4, 1.349], [3.45, 1.3], [3.5, 1.24], [3.55, 1.18], [3.6, 1.12], [3.65, 1.065], [3.69, 1.02],
      [3.72, 0.983], [3.75, 0.95]],
    bottom: [[0, 0.405], [0.045, 0.222], [0.09, 0.191], [0.41, 0.191], [1.09, 0.195], [1.13, 0.206], [2.86, 0.206], [3.55, 0.222], [3.64, 0.25], [3.73, 0.255], [3.76, 0.298], [3.79, 0.313],
      [3.81, 0.343], [3.825, 0.374], [3.839, 0.389]],
    plan: [[0, 0.25], [0.01, 0.35], [0.03, 0.47], [0.06, 0.6], [0.1, 0.7], [0.15, 0.8], [0.2, 0.86], [0.3, 0.92], [0.45, 0.96], [0.6, 0.985], [0.8, 1.0], [3.0, 1.0], [3.4, 0.985], [3.6, 0.95],
      [3.7, 0.91], [3.76, 0.86], [3.8, 0.78], [3.82, 0.66], [3.835, 0.45], [3.839, 0.25]],
    crown: [[0, 0.03], [0.3, 0.05], [1.0, 0.075], [1.1, 0.075], [3.5, 0.06], [3.72, 0.05], [3.839, 0.02]],
    sec: { k2: 0.96, d2: 0.08, f3: 0.55, k4: 0.99, k5: 0.9, k6: 0.86, d7: 0.07 },
    hwr: 0.6, wind: [1.06, 1.9], rear: [3.36, 3.7], side: [1.5, 3.39], pillars: [2.2, 3.02], eyeY: 1.19,
    lights: { head: [0.1, 0.7, 0.55, 0.35, 0.12], tail: [3.75, 1.1, 0.6, 0.1, 0.4] },
    dlo: {
      glass: [
        [[1.62, 0.96], [2.15, 0.965], [2.177, 1.0], [2.19, 1.09], [2.22, 1.152], [2.24, 1.244], [2.25, 1.3], [2.235, 1.336], [2.07, 1.336], [1.94, 1.305], [1.8, 1.275], [1.74, 1.243], [1.65, 1.21],
          [1.58, 1.17], [1.53, 1.14], [1.52, 1.1], [1.58, 1.06]],
        [[2.465, 0.985], [2.98, 1.0], [3.005, 1.09], [3.0, 1.15], [2.98, 1.183], [2.96, 1.214], [2.93, 1.275], [2.89, 1.3], [2.81, 1.32], [2.75, 1.33], [2.43, 1.336]],
        [[3.04, 1.0], [3.39, 1.01], [3.33, 1.12], [3.25, 1.25], [3.19, 1.32], [3.04, 1.32]],
      ],
      black: [[[2.15, 0.94], [2.47, 0.96], [2.44, 1.35], [2.24, 1.35]], [[2.995, 0.98], [3.045, 0.98], [3.045, 1.33], [2.99, 1.33]], [[1.36, 0.93], [1.63, 0.95], [1.58, 1.06], [1.52, 1.1], [1.45, 1.03]]],
      surround: 0.014, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.5, 1.0], mirror: [0.17, 0.12], handles: [[2.0, 0.85], [2.85, 0.87]],
    plates: { front: [0.465], rear: [0.49] }, exhaust: [[-0.4, 0.26, 0.025, 0.1]],
    parts: [
      // the headlamps: swept up and out, the big round reflector, the indicator's inner one, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.33, 0.7], ['f', 0.45, 0.735], ['f', 0.6, 0.775], ['f', 0.7, 0.795], ['f', 0.74, 0.78], ['f', 0.745, 0.72], ['f', 0.7, 0.685], ['f', 0.55, 0.655], ['f', 0.4, 0.635], ['f', 0.34, 0.65]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.6, 0.725, 0.042] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.6, 0.725, 0.046, 0.058] },
      { at: 'f', mat: 'amber', mirror: true, off: 0.005, disc: ['f', 0.43, 0.68, 0.022] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.33, 0.7], ['f', 0.45, 0.735], ['f', 0.6, 0.775], ['f', 0.7, 0.795], ['f', 0.74, 0.78], ['f', 0.745, 0.72], ['f', 0.7, 0.685], ['f', 0.55, 0.655], ['f', 0.4, 0.635], ['f', 0.34, 0.65]] },
      // the grille between them, the facelift's chrome bar across it and the ring for the badge; the intakes below
      { at: 'f', mat: 'slats', off: 0.003, poly: trap('f', 0, 0.645, 0.62, 0.5, 0.085, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.016, line: [['f', -0.3, 0.652], ['f', 0, 0.648], ['f', 0.3, 0.652]] },
      { at: 'f', mat: 'chrome', off: 0.007, depth: 0.004, ring: ['f', 0, 0.648, 0.03, 0.04] },
      { at: 'f', mat: 'slats', off: 0.002, poly: trap('f', 0, 0.385, 0.74, 0.62, 0.075, 0.025) },
      { at: 'f', mat: 'slats', mirror: true, off: 0.002, poly: rrect('f', 0.56, 0.41, 0.15, 0.055, 0.02) },
      // the sides: the repeater, the door cuts, the fuel flap (right)
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.12, 0.83, 0.013], sx: 1.6 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.15, 0.9], ['s', 1.15, 0.32], ['s', 2.9, 0.33]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.22, 0.93], ['s', 2.2, 0.32]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.02, 0.96], ['s', 3.01, 0.8], ['s', 2.98, 0.62], ['s', 2.93, 0.48], ['s', 2.9, 0.33]] },
      { at: 's', mat: 'trim', off: 0.002, ring: ['s', 3.35, 0.88, 0.055, 0.06] },
      // the tall lamps up the tailgate's pillars, the badge's ring and the handle, the cut over the bumper, reflectors
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.48, 1.27], ['r', 0.56, 1.28], ['r', 0.59, 1.15], ['r', 0.62, 1.0], ['r', 0.63, 0.945], ['r', 0.55, 0.94], ['r', 0.52, 1.1]] },
      { at: 'r', mat: 'chrome', off: 0.006, depth: 0.004, ring: ['r', 0, 0.82, 0.028, 0.037] },
      { at: 'r', mat: 'trim', off: 0.004, poly: rrect('r', 0, 0.76, 0.14, 0.03, 0.01) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.6, 0.62], ['r', 0, 0.615], ['r', 0.6, 0.62]] },
      { at: 'r', mat: 'red', mirror: true, off: 0.003, poly: rrect('r', 0.45, 0.595, 0.1, 0.025, 0.008) },
    ],
  },
  // Ford Focus, second generation, 5 doors, after the 2008 facelift - the white one, PH 22 PXZ (photos 18-20). 1840 mm
  // wide, 1497 high, 2640 between the axles, tracks 1535 / 1531 (CarExpert, cars-data.com); the side traced at scale
  // from Ford's drawing of the car (the-blueprints.com: 4357 mm at the wheelbase's scale, its heights drawn 1.8 % tall,
  // brought to the 1497 mm), the plan's front from its top view; the doors and windows of the 5-door from a side photo
  // of the estate, which has the same doors (Wikimedia Commons, corrected for the camera's perspective); the
  // facelift's details from photos of it: the headlamps swept back to a point at the slim grille with its chrome bar,
  // the big trapezoid intake under it, the fog lamps in the corners, the window line rising to the rear, the fixed
  // glass behind the rear door's black bar, the roof spoiler, the tall lamps up the tailgate's pillars, the plate on
  // the tailgate under its chrome strip; 205/55 R16.
  focus: {
    name: 'Ford Focus', cabin: ['hatch', { brand: 'generic', cluster: 'generic', stack: 'generic', vents: 'rect', accent: 'alu' }], L: 4.357, W: 1.84, axles: [0.878, 3.518], r: 0.316, tireW: 0.205, track: [1.535, 1.531],
    rimK: 0.68, rimStyle: { kind: 'twin', n: 5, w: 0.03, gap: 0.2, col: 0xc3c6ca, dish: 0.03 },
    belt: [[0, 0.567], [0.049, 0.674], [0.098, 0.734], [0.147, 0.765], [0.196, 0.784], [0.245, 0.809], [0.294, 0.82], [0.343, 0.838], [0.392, 0.849], [0.441, 0.86], [0.49, 0.864],
      [0.587, 0.879], [0.685, 0.893], [0.783, 0.9], [0.881, 0.908], [1.03, 0.912], [1.47, 0.917], [2.43, 0.945], [3.21, 0.973], [3.6, 0.985], [4.0, 0.99], [4.2, 0.985], [4.25, 0.96],
      [4.28, 0.85], [4.3, 0.66], [4.31, 0.62], [4.357, 0.6]],
    roof: [[1.03, 0.912], [1.077, 1.006], [1.126, 1.027], [1.175, 1.054], [1.224, 1.082], [1.273, 1.109], [1.322, 1.137], [1.371, 1.158], [1.42, 1.185], [1.469, 1.205], [1.517, 1.233],
      [1.566, 1.254], [1.615, 1.281], [1.664, 1.302], [1.713, 1.322], [1.762, 1.343], [1.811, 1.364], [1.86, 1.384], [1.909, 1.398], [1.958, 1.412], [2.007, 1.426], [2.056, 1.439],
      [2.105, 1.446], [2.154, 1.453], [2.25, 1.459], [2.35, 1.473], [2.6, 1.48], [2.9, 1.473], [3.0, 1.466], [3.1, 1.453], [3.2, 1.446], [3.3, 1.434], [3.4, 1.41], [3.5, 1.39],
      [3.6, 1.384], [3.7, 1.378], [3.75, 1.3], [3.8, 1.258], [3.9, 1.212], [4.0, 1.163], [4.1, 1.108], [4.2, 1.05], [4.24, 1.0], [4.27, 0.95]],
    bottom: [[0, 0.33], [0.049, 0.247], [0.147, 0.24], [0.245, 0.234], [0.392, 0.22], [0.45, 0.218], [1.33, 0.186], [3.09, 0.186], [3.98, 0.254], [4.077, 0.282], [4.175, 0.309],
      [4.273, 0.323], [4.308, 0.337], [4.329, 0.357], [4.343, 0.385], [4.357, 0.44]],
    plan: [[0, 0.22], [0.005, 0.274], [0.01, 0.3], [0.02, 0.365], [0.03, 0.407], [0.05, 0.479], [0.08, 0.57], [0.1, 0.627], [0.15, 0.726], [0.2, 0.817], [0.3, 0.893], [0.4, 0.931],
      [0.6, 0.992], [0.8, 1.0], [3.6, 1.0], [3.9, 0.985], [4.05, 0.96], [4.15, 0.93], [4.22, 0.89], [4.27, 0.83], [4.31, 0.74], [4.335, 0.62], [4.35, 0.45], [4.357, 0.25]],
    crown: [[0, 0.03], [0.3, 0.055], [1.0, 0.08], [1.1, 0.08], [3.9, 0.07], [4.2, 0.05], [4.357, 0.02]],
    sec: { k2: 0.96, d2: 0.09, f3: 0.55, k4: 0.99, k5: 0.89, k6: 0.85, d7: 0.07 },
    hwr: 0.62, wind: [1.04, 2.1], rear: [3.75, 4.17], side: [1.47, 3.58], pillars: [2.5, 3.26], eyeY: 1.18,
    lights: { head: [0.1, 0.74, 0.6, 0.33, 0.13], tail: [4.27, 1.0, 0.7, 0.1, 0.4] },
    dlo: {
      glass: [
        [[1.47, 0.955], [2.43, 0.982], [2.44, 1.33], [2.1, 1.33], [1.9, 1.295], [1.7, 1.208], [1.55, 1.12], [1.48, 1.06]],
        [[2.555, 0.988], [3.21, 1.01], [3.21, 1.29], [3.0, 1.31], [2.8, 1.325], [2.555, 1.335]],
        [[3.29, 1.013], [3.58, 1.025], [3.55, 1.07], [3.46, 1.15], [3.37, 1.22], [3.29, 1.27]],
      ],
      black: [[[2.42, 0.97], [2.57, 0.975], [2.56, 1.35], [2.43, 1.35]], [[3.205, 0.99], [3.295, 0.99], [3.295, 1.285], [3.205, 1.295]], [[1.3, 0.93], [1.48, 0.94], [1.48, 1.06], [1.42, 1.0]]],
      surround: 0.015, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.4, 1.0], mirror: [0.2, 0.13], handles: [[2.215, 0.86], [3.19, 0.875]],
    plates: { front: [0.5], rear: [0.875] }, exhaust: [[-0.5, 0.29, 0.03, 0.12]],
    parts: [
      // the headlamps: swept back from a point at the grille, the two reflectors, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.42, 0.705], ['f', 0.5, 0.775], ['f', 0.6, 0.82], ['f', 0.7, 0.845], ['f', 0.775, 0.85], ['f', 0.79, 0.8], ['f', 0.77, 0.7], ['f', 0.72, 0.66], ['f', 0.6, 0.655], ['f', 0.48, 0.665]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.665, 0.745, 0.042] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.665, 0.745, 0.046, 0.058] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.53, 0.71, 0.03] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.42, 0.705], ['f', 0.5, 0.775], ['f', 0.6, 0.82], ['f', 0.7, 0.845], ['f', 0.775, 0.85], ['f', 0.79, 0.8], ['f', 0.77, 0.7], ['f', 0.72, 0.66], ['f', 0.6, 0.655], ['f', 0.48, 0.665]] },
      // the slim grille with the chrome bar along its top and the badge's oval; the big intake, the fog lamps' corners
      { at: 'f', mat: 'slats', off: 0.003, poly: trap('f', 0, 0.68, 0.84, 0.66, 0.08, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.014, line: [['f', -0.41, 0.716], ['f', 0, 0.721], ['f', 0.41, 0.716]] },
      { at: 'f', mat: 'chrome', off: 0.007, depth: 0.004, ring: ['f', 0, 0.684, 0.02, 0.028], sx: 1.7 },
      { at: 'f', mat: 'slats', off: 0.002, poly: trap('f', 0, 0.4, 0.8, 1.0, 0.2, 0.04) },
      { at: 'f', mat: 'slats', mirror: true, off: 0.002, poly: rrect('f', 0.67, 0.42, 0.2, 0.07, 0.025) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.01, disc: ['f', 0.7, 0.42, 0.032] },
      // the sides: the repeater, the door cuts (the rear door's round the arch), the fuel flap (right)
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.22, 0.795, 0.014], sx: 2 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.3, 0.93], ['s', 1.3, 0.33], ['s', 3.06, 0.33]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.43, 0.97], ['s', 2.42, 0.33]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.58, 1.0], ['s', 3.45, 0.8], ['s', 3.32, 0.62], ['s', 3.2, 0.5], ['s', 3.1, 0.4], ['s', 3.06, 0.33]] },
      { at: 's', mat: 'trim', off: 0.002, ring: ['s', 3.78, 0.87, 0.062, 0.067] },
      // the tall lamps up the pillars, the chrome strip and the badge's oval over the plate, the bumper's line and
      // reflectors, the fog lamp low in the middle
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.56, 1.24], ['r', 0.64, 1.25], ['r', 0.69, 1.1], ['r', 0.76, 0.95], ['r', 0.8, 0.8], ['r', 0.8, 0.73], ['r', 0.68, 0.72], ['r', 0.62, 0.85], ['r', 0.58, 1.05]] },
      { at: 'r', mat: 'chrome', off: 0.005, depth: 0.004, w: 0.012, line: [['r', -0.38, 0.985], ['r', 0, 0.99], ['r', 0.38, 0.985]] },
      { at: 'r', mat: 'chrome', off: 0.007, depth: 0.004, ring: ['r', 0, 1.02, 0.02, 0.028], sx: 1.7 },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.75, 0.7], ['r', 0, 0.695], ['r', 0.75, 0.7]] },
      { at: 'r', mat: 'red', mirror: true, off: 0.003, poly: rrect('r', 0.7, 0.455, 0.13, 0.045, 0.015) },
      { at: 'r', mat: 'red', off: 0.003, poly: rrect('r', 0, 0.33, 0.12, 0.03, 0.01) },
    ],
  },
  // Renault Kangoo, second generation (2008-2013) - the white one on Str. Uzinei. 4213 mm long, 1829 wide, 2697
  // between the axles, tracks 1533 / 1521 (auto-data.net); traced at scale from Renault's own four-view illustration
  // (the-blueprints.com; its roof 1.75 m without the bars): the bonnet short and the windscreen raked far forward,
  // the window line stepping up behind the B pillar, the sliding door's window and the rear side window with its
  // rounded corner, the black strip over the sliding door's rail, the big headlamps reaching up the wings, the slot
  // under the bonnet's edge, the plate over the lower grille and the fog lamps, the near-vertical tailgate between
  // the tall lamps; 195/65 R15.
  kangoo: {
    name: 'Renault Kangoo', L: 4.213, W: 1.829, axles: [0.806, 3.503], r: 0.317, tireW: 0.195, track: [1.533, 1.521],
    rimK: 0.66, rimStyle: { kind: 'cover', n: 8, w: 0.035, col: 0xb4b7bb, cap: 0x8f9297 },
    belt: [[0, 0.55], [0.058, 0.69], [0.115, 0.79], [0.173, 0.87], [0.23, 0.905], [0.288, 0.93], [0.346, 0.948], [0.403, 0.965], [0.461, 0.973], [0.518, 0.98], [0.576, 0.988], [0.633, 0.996],
      [0.691, 1.003], [0.806, 1.008], [0.85, 1.01], [1.32, 1.0], [2.24, 1.008], [2.44, 1.04], [3.1, 1.042], [3.23, 1.07], [3.85, 1.075], [4.0, 1.07], [4.1, 1.06], [4.15, 0.95], [4.17, 0.7],
      [4.2, 0.62], [4.213, 0.6]],
    roof: [[0.85, 1.01], [0.88, 1.12], [0.95, 1.17], [1.0, 1.21], [1.1, 1.29], [1.2, 1.37], [1.3, 1.45], [1.4, 1.52], [1.5, 1.575], [1.6, 1.625], [1.7, 1.668], [1.8, 1.69], [1.9, 1.705], [2.0, 1.715],
      [2.2, 1.726], [2.4, 1.733], [3.8, 1.733], [3.9, 1.718], [3.97, 1.69], [4.03, 1.64], [4.07, 1.45], [4.1, 1.25], [4.13, 1.1], [4.15, 1.0]],
    bottom: [[0, 0.475], [0.058, 0.245], [0.115, 0.235], [0.346, 0.226], [0.4, 0.22], [1.24, 0.206], [1.75, 0.22], [2.3, 0.228], [3.08, 0.245], [3.97, 0.302], [4.09, 0.312], [4.15, 0.322],
      [4.19, 0.335], [4.2, 0.4], [4.213, 0.5]],
    plan: [[0, 0.29], [0.005, 0.37], [0.01, 0.39], [0.02, 0.44], [0.03, 0.5], [0.05, 0.59], [0.08, 0.69], [0.1, 0.74], [0.15, 0.835], [0.2, 0.87], [0.3, 0.92], [0.4, 0.955], [0.6, 0.985], [0.8, 1.0],
      [3.5, 1.0], [3.8, 0.975], [3.96, 0.925], [4.013, 0.91], [4.063, 0.88], [4.113, 0.787], [4.143, 0.7], [4.163, 0.6], [4.183, 0.425], [4.2, 0.3], [4.213, 0.26]],
    crown: [[0, 0.03], [0.3, 0.05], [0.85, 0.06], [4.0, 0.05], [4.213, 0.02]],
    sec: { k2: 0.97, d2: 0.08, f3: 0.5, k4: 0.995, k5: 0.95, k6: 0.93, d7: 0.07 },
    hwr: 0.76, wind: [0.86, 1.6], rear: [4.0, 4.14], side: [1.32, 3.82], pillars: [2.3, 3.17], eyeY: 1.36,
    lights: { head: [0.07, 0.82, 0.62, 0.3, 0.2], tail: [4.15, 0.9, 0.77, 0.1, 0.38] },
    dlo: {
      glass: [
        [[1.32, 1.04], [2.24, 1.045], [2.25, 1.55], [2.2, 1.575], [1.7, 1.565], [1.6, 1.52], [1.45, 1.33], [1.35, 1.2], [1.32, 1.12]],
        [[2.44, 1.12], [2.47, 1.085], [3.07, 1.085], [3.11, 1.12], [3.11, 1.52], [3.07, 1.565], [2.48, 1.565], [2.44, 1.53]],
        [[3.23, 1.14], [3.26, 1.11], [3.78, 1.11], [3.82, 1.15], [3.82, 1.42], [3.78, 1.52], [3.7, 1.575], [3.6, 1.595], [3.27, 1.6], [3.23, 1.56]],
      ],
      surround: 0.016, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.36, 1.12], mirror: [0.22, 0.16], handles: [[2.1, 0.95], [2.5, 0.9]],
    plates: { front: [0.505], rear: [0.755] }, exhaust: [[-0.55, 0.3, 0.03, 0.1]],
    parts: [
      // the headlamps up the wings: the big reflector, the inner one, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.47, 0.72], ['f', 0.52, 0.83], ['f', 0.6, 0.9], ['f', 0.7, 0.935], ['f', 0.77, 0.92], ['f', 0.785, 0.85], ['f', 0.77, 0.76], ['f', 0.72, 0.71], ['f', 0.55, 0.7]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.65, 0.82, 0.05] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.65, 0.82, 0.055, 0.067] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.53, 0.755, 0.032] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.47, 0.72], ['f', 0.52, 0.83], ['f', 0.6, 0.9], ['f', 0.7, 0.935], ['f', 0.77, 0.92], ['f', 0.785, 0.85], ['f', 0.77, 0.76], ['f', 0.72, 0.71], ['f', 0.55, 0.7]] },
      // the slot under the bonnet's edge and the badge's place over it; the lower grille, the fog lamps
      { at: 'f', mat: 'slats', off: 0.003, poly: rrect('f', 0, 0.705, 0.8, 0.045, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, poly: rrect('f', 0, 0.775, 0.075, 0.075, 0.02) },
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.415, 1.0, 0.9, 0.08, 0.03) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.012, disc: ['f', 0.63, 0.385, 0.038] },
      // the sides: the repeater, the door cuts, the black strip over the sliding door's rail
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.08, 0.92, 0.014], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.22, 1.0], ['s', 1.22, 0.35], ['s', 3.1, 0.36]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.3, 1.03], ['s', 2.3, 0.35]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.15, 1.07], ['s', 3.15, 0.36]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.022, line: [['s', 3.15, 1.075], ['s', 3.98, 1.08]] },
      // the tall lamps beside the tailgate, its cuts, the badge's place and the handle; the bumper's reflectors
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.7, 1.05], ['r', 0.82, 1.06], ['r', 0.84, 0.9], ['r', 0.84, 0.7], ['r', 0.72, 0.68], ['r', 0.69, 0.85]] },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.66, 1.1], ['r', -0.66, 0.56], ['r', 0.66, 0.56], ['r', 0.66, 1.1]] },
      { at: 'r', mat: 'chrome', off: 0.005, depth: 0.004, poly: rrect('r', 0, 0.985, 0.07, 0.07, 0.018) },
      { at: 'r', mat: 'trim', off: 0.004, poly: rrect('r', 0, 0.86, 0.2, 0.035, 0.012) },
      { at: 'r', mat: 'red', mirror: true, off: 0.003, poly: rrect('r', 0.66, 0.45, 0.1, 0.03, 0.01) },
    ],
  },
  // Volkswagen Transporter T5 after the 2009 facelift, short wheelbase, with windows - the white one on Str. Uzinei.
  // 4892 mm long, 1904 wide, 3000 between the axles, tracks 1628 (Parkers, vandimensions.com), 1970 high; traced
  // from a perpendicular side photo of a long-wheelbase Multivan (Wikimedia Commons: its overhangs over its
  // wheelbase 0.54, the long one's 0.556, the short one's 0.63 - so 3400 mm, its scale from that), brought to the
  // short wheelbase by taking the long one's 400 mm out behind the sliding door, where VW adds them: the short
  // bonnet sloping up to the raked windscreen, the black B and C pillars, the sliding door's window, the side window
  // over the rear wheel, the chrome strip along the doors, the tall lamps on the rear pillars; the facelift's front:
  // the wide grille with its chrome bars between the headlamps; 215/65 R16.
  van: {
    name: 'VW Transporter', L: 4.892, W: 1.904, axles: [0.84, 3.84], r: 0.343, tireW: 0.215, track: [1.628, 1.628],
    rimK: 0.66, rimStyle: { kind: 'multi', n: 14, w: 0.018, col: 0xc0c3c7, dish: 0.03 },
    belt: [[0, 0.62], [0.05, 0.95], [0.136, 1.07], [0.3, 1.14], [0.5, 1.2], [0.7, 1.25], [0.873, 1.29], [1.13, 1.235], [2.3, 1.205], [2.4, 1.22], [3.3, 1.22], [4.36, 1.245], [4.6, 1.24],
      [4.7, 1.2], [4.77, 0.9], [4.8, 0.6], [4.892, 0.55]],
    roof: [[0.873, 1.29], [0.9, 1.36], [1.0, 1.43], [1.2, 1.57], [1.4, 1.72], [1.55, 1.82], [1.65, 1.88], [1.75, 1.92], [1.9, 1.945], [2.1, 1.955], [4.3, 1.955], [4.45, 1.94], [4.55, 1.9],
      [4.62, 1.84], [4.66, 1.78], [4.7, 1.5], [4.73, 1.2], [4.76, 1.0]],
    bottom: [[0, 0.357], [0.05, 0.3], [0.3, 0.28], [0.5, 0.27], [1.3, 0.25], [3.3, 0.25], [4.3, 0.3], [4.6, 0.32], [4.85, 0.33], [4.892, 0.45]],
    plan: [[0, 0.6], [0.03, 0.72], [0.08, 0.84], [0.15, 0.92], [0.25, 0.97], [0.4, 1.0], [4.6, 1.0], [4.75, 0.97], [4.84, 0.9], [4.87, 0.8], [4.892, 0.6]],
    crown: [[0, 0.03], [0.4, 0.045], [0.873, 0.055], [4.6, 0.05], [4.892, 0.02]],
    sec: { k2: 0.98, d2: 0.08, f3: 0.5, k4: 0.995, k5: 0.96, k6: 0.95, d7: 0.07 },
    hwr: 0.86, wind: [0.88, 1.65], rear: [4.6, 4.7], side: [1.15, 4.36], pillars: [2.35, 3.3], eyeY: 1.55,
    lights: { head: [0.06, 0.92, 0.68, 0.4, 0.2], tail: [4.75, 0.95, 0.8, 0.12, 0.3] },
    dlo: {
      glass: [
        [[1.2, 1.27], [2.29, 1.25], [2.3, 1.86], [1.84, 1.86], [1.7, 1.83], [1.55, 1.72], [1.4, 1.58], [1.25, 1.41], [1.15, 1.3]],
        [[2.41, 1.262], [3.27, 1.262], [3.27, 1.875], [2.41, 1.875]],
        [[3.32, 1.283], [4.33, 1.283], [4.36, 1.32], [4.36, 1.84], [4.32, 1.875], [3.32, 1.875]],
      ],
      black: [[[2.29, 1.22], [2.41, 1.22], [2.41, 1.9], [2.3, 1.9]], [[3.27, 1.24], [3.32, 1.24], [3.32, 1.9], [3.27, 1.9]]],
      surround: 0.02, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.12, 1.3], mirror: [0.25, 0.2], handles: [[2.149, 1.145], [2.554, 1.162]],
    plates: { front: [0.6], rear: [0.75] }, exhaust: [[-0.6, 0.3, 0.035, 0.12]],
    parts: [
      // the headlamps, their two reflectors; the wide grille between them with its chrome bars and the badge's ring
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.45, 1.0], ['f', 0.82, 1.02], ['f', 0.88, 0.98], ['f', 0.88, 0.84], ['f', 0.8, 0.81], ['f', 0.45, 0.83]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.57, 0.915, 0.05] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.57, 0.915, 0.054, 0.066] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.73, 0.915, 0.045] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.45, 1.0], ['f', 0.82, 1.02], ['f', 0.88, 0.98], ['f', 0.88, 0.84], ['f', 0.8, 0.81], ['f', 0.45, 0.83]] },
      { at: 'f', mat: 'slats', off: 0.003, poly: rrect('f', 0, 0.915, 0.9, 0.17, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.018, line: [['f', -0.44, 0.96], ['f', 0.44, 0.96]] },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.018, line: [['f', -0.44, 0.88], ['f', 0.44, 0.88]] },
      { at: 'f', mat: 'chrome', off: 0.008, depth: 0.004, ring: ['f', 0, 0.92, 0.058, 0.072] },
      // the bumper: the wide lower intake, the fog lamps
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.44, 1.1, 1.2, 0.14, 0.04) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.012, disc: ['f', 0.72, 0.47, 0.04] },
      // the sides: the repeater, the door cuts, the chrome strip along the doors
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 0.62, 0.95, 0.016], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.09, 1.24], ['s', 1.09, 0.75], ['s', 1.17, 0.62], ['s', 1.26, 0.36], ['s', 3.29, 0.36]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.3, 1.22], ['s', 2.3, 0.36]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.29, 1.24], ['s', 3.29, 0.36]] },
      { at: 's', mat: 'chrome', mirror: true, off: 0.003, depth: 0.003, w: 0.012, line: [['s', 1.37, 0.42], ['s', 3.27, 0.42]] },
      // the tall lamps on the rear pillars, the tailgate's badge ring and handle, the bumper's reflectors
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.72, 1.1], ['r', 0.86, 1.1], ['r', 0.88, 0.95], ['r', 0.87, 0.81], ['r', 0.73, 0.81], ['r', 0.71, 0.95]] },
      { at: 'r', mat: 'chrome', off: 0.006, depth: 0.004, ring: ['r', 0, 1.05, 0.045, 0.058] },
      { at: 'r', mat: 'trim', off: 0.004, poly: rrect('r', 0, 0.86, 0.3, 0.04, 0.012) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.7, 0.62], ['r', 0, 0.615], ['r', 0.7, 0.62]] },
      { at: 'r', mat: 'red', mirror: true, off: 0.003, poly: rrect('r', 0.72, 0.5, 0.12, 0.035, 0.01) },
    ],
  },
  // Ford Kuga, second generation (2013-2016) - the white one after the crossroads (photos 19-20). 4524 mm long, 1838
  // wide, 1701 high, 2690 between the axles, tracks 1563 / 1565 (cars-data.com, encycarpedia); no scale drawing of it
  // could be had, so its profile is built on those figures and shaped from photos of the car and of the Escape it
  // shares its body with (Wikimedia Commons): the long bonnet rising to the raked windscreen, the window line
  // kicking up into the small rear side window, the roof falling to the raked tailgate, the swept headlamps over the
  // trapezoid grille with its chrome bars, the big lower grille with the plate, the fog lamps in their recesses, the
  // black sills, the lamps wrapping round the rear corners, the chrome strip over the plate; 235/55 R17.
  kuga: {
    name: 'Ford Kuga', L: 4.524, W: 1.838, axles: [0.93, 3.62], r: 0.345, tireW: 0.235, track: [1.563, 1.565],
    cabin: 'suv', rimK: 0.64, rimStyle: { kind: 'twin', n: 5, w: 0.032, gap: 0.22, col: 0xc6c9cd, dish: 0.035 },
    belt: [[0, 0.72], [0.04, 0.82], [0.1, 0.9], [0.2, 0.95], [0.4, 0.99], [0.7, 1.02], [1.0, 1.04], [1.3, 1.05], [1.55, 1.04], [2.6, 1.07], [3.4, 1.1], [3.55, 1.13], [3.85, 1.2], [4.1, 1.17],
      [4.35, 1.1], [4.42, 1.0], [4.46, 0.8], [4.5, 0.65], [4.524, 0.6]],
    roof: [[1.3, 1.05], [1.35, 1.11], [1.5, 1.21], [1.7, 1.34], [1.9, 1.47], [2.05, 1.56], [2.2, 1.63], [2.4, 1.675], [2.6, 1.687], [2.9, 1.687], [3.2, 1.675], [3.5, 1.655], [3.8, 1.625],
      [3.95, 1.595], [4.05, 1.53], [4.15, 1.43], [4.25, 1.31], [4.35, 1.18], [4.4, 1.1]],
    bottom: [[0, 0.5], [0.05, 0.38], [0.15, 0.33], [0.4, 0.3], [0.5, 0.28], [1.4, 0.24], [3.2, 0.24], [4.1, 0.32], [4.4, 0.36], [4.5, 0.42], [4.524, 0.5]],
    plan: [[0, 0.35], [0.02, 0.5], [0.05, 0.62], [0.1, 0.74], [0.2, 0.86], [0.35, 0.94], [0.6, 0.985], [0.9, 1.0], [3.7, 1.0], [4.0, 0.98], [4.2, 0.94], [4.35, 0.88], [4.45, 0.78], [4.5, 0.62],
      [4.524, 0.4]],
    crown: [[0, 0.03], [0.4, 0.06], [1.3, 0.09], [3.9, 0.06], [4.524, 0.02]],
    sec: { k2: 0.96, d2: 0.1, f3: 0.55, k4: 0.99, k5: 0.88, k6: 0.84, d7: 0.07 },
    hwr: 0.64, wind: [1.32, 2.2], rear: [4.0, 4.38], side: [1.6, 3.85], pillars: [2.6, 3.44], eyeY: 1.38,
    lights: { head: [0.08, 0.93, 0.65, 0.35, 0.13], tail: [4.4, 1.0, 0.7, 0.2, 0.2] },
    dlo: {
      glass: [
        [[1.6, 1.08], [2.55, 1.105], [2.56, 1.58], [2.25, 1.565], [2.1, 1.5], [1.9, 1.38], [1.75, 1.27], [1.62, 1.16]],
        [[2.66, 1.11], [3.4, 1.135], [3.42, 1.55], [3.3, 1.57], [2.67, 1.585]],
        [[3.48, 1.17], [3.62, 1.2], [3.85, 1.27], [3.82, 1.4], [3.7, 1.5], [3.48, 1.54]],
      ],
      black: [[[2.53, 1.08], [2.69, 1.09], [2.69, 1.6], [2.55, 1.6]], [[3.4, 1.12], [3.49, 1.13], [3.49, 1.56], [3.41, 1.56]], [[1.45, 1.05], [1.62, 1.07], [1.62, 1.17], [1.53, 1.12]]],
      surround: 0.015, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.55, 1.12], mirror: [0.24, 0.15], handles: [[2.35, 1.0], [3.2, 1.02]],
    plates: { front: [0.5], rear: [0.85] }, exhaust: [[-0.5, 0.33, 0.035, 0.12]],
    parts: [
      // the headlamps swept back to a point at the grille's corners, the projector and the inner reflector, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.45, 0.93], ['f', 0.55, 0.97], ['f', 0.7, 1.0], ['f', 0.8, 1.0], ['f', 0.84, 0.96], ['f', 0.82, 0.9], ['f', 0.72, 0.86], ['f', 0.55, 0.86], ['f', 0.46, 0.88]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.7, 0.93, 0.04] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.7, 0.93, 0.044, 0.055] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.56, 0.9, 0.03] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.45, 0.93], ['f', 0.55, 0.97], ['f', 0.7, 1.0], ['f', 0.8, 1.0], ['f', 0.84, 0.96], ['f', 0.82, 0.9], ['f', 0.72, 0.86], ['f', 0.55, 0.86], ['f', 0.46, 0.88]] },
      // the upper grille with its chrome bars and the badge's oval; the big lower grille, the fog lamps' recesses
      { at: 'f', mat: 'slats', off: 0.003, poly: trap('f', 0, 0.86, 0.86, 0.74, 0.11, 0.02) },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.014, line: [['f', -0.41, 0.895], ['f', 0.41, 0.895]] },
      { at: 'f', mat: 'chrome', off: 0.006, depth: 0.004, w: 0.012, line: [['f', -0.38, 0.84], ['f', 0.38, 0.84]] },
      { at: 'f', mat: 'chrome', off: 0.008, depth: 0.004, ring: ['f', 0, 0.895, 0.022, 0.03], sx: 1.7 },
      { at: 'f', mat: 'mesh', off: 0.002, poly: trap('f', 0, 0.5, 0.9, 1.1, 0.22, 0.04) },
      { at: 'f', mat: 'slats', mirror: true, off: 0.002, poly: rrect('f', 0.68, 0.52, 0.16, 0.12, 0.03) },
      { at: 'f', mat: 'white', mirror: true, off: 0.004, rim: 0.01, disc: ['f', 0.69, 0.5, 0.034] },
      { at: 'f', mat: 'grey', off: 0.003, poly: rrect('f', 0, 0.34, 0.9, 0.045, 0.015) },
      // the sides: the black sills, the door cuts
      { at: 's', mat: 'trim', mirror: true, w: 0.09, line: [['s', 1.42, 0.33], ['s', 3.3, 0.33]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.42, 1.04], ['s', 1.42, 0.4], ['s', 3.3, 0.4]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.6, 1.08], ['s', 2.58, 0.4]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.48, 1.13], ['s', 3.45, 0.85], ['s', 3.35, 0.65], ['s', 3.3, 0.4]] },
      // the lamps round the rear corners, the chrome strip and the badge's oval over the plate, the black bumper
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.55, 1.1], ['r', 0.76, 1.11], ['s', 4.36, 1.08], ['s', 4.28, 1.06], ['s', 4.3, 0.95], ['r', 0.82, 0.9], ['r', 0.6, 0.94]] },
      { at: 'r', mat: 'chrome', off: 0.005, depth: 0.004, w: 0.012, line: [['r', -0.35, 0.94], ['r', 0.35, 0.94]] },
      { at: 'r', mat: 'chrome', off: 0.007, depth: 0.004, ring: ['r', 0, 1.0, 0.022, 0.03], sx: 1.7 },
      { at: 'r', mat: 'trim', off: 0.002, poly: rrect('r', 0, 0.42, 1.5, 0.16, 0.04) },
      { at: 'r', mat: 'red', mirror: true, off: 0.004, poly: rrect('r', 0.7, 0.56, 0.1, 0.03, 0.01) },
    ],
  },
  // BMW 1 Series E87, 5 doors, the 2007 facelift (LCI) - the dark one facing north (photo 19). BMW's own dimension
  // drawing: 4227 mm long, 1751 wide, 1430 high, 2660 between the axles, 737 / 830 overhangs, tracks 1484 / 1497; its
  // side, front, rear and top views traced at scale (the-blueprints.com); the side windows, door cuts and the
  // facelift's details from a perpendicular photo of a black 118d (Wikimedia Commons). 195/55 R16 on ten-spoke
  // star wheels.
  bmw1: {
    name: 'BMW Seria 1 (E87)', cabin: ['bmw', { saloon: false }], L: 4.227, W: 1.751, axles: [0.737, 3.397], r: 0.3105, tireW: 0.195,
    rimK: 0.69, rimStyle: { kind: 'twin', n: 5, w: 0.03, gap: 0.2, col: 0xc6c9cd, dish: 0.035 },
    belt: [[0, 0.49], [0.02, 0.5], [0.03, 0.615], [0.05, 0.686], [0.07, 0.706], [0.1, 0.731], [0.15, 0.761], [0.2, 0.782], [0.3, 0.814], [0.45, 0.852], [0.6, 0.88], [0.8, 0.91], [1.0, 0.933], [1.15, 0.946], [1.27, 0.952],
      [1.8, 0.958], [2.5, 0.966], [3.4, 0.982], [3.9, 0.99], [4.1, 0.975], [4.15, 0.93], [4.168, 0.63], [4.2, 0.62], [4.227, 0.61]],
    roof: [[1.27, 0.952], [1.3, 1.0], [1.4, 1.063], [1.6, 1.181], [1.8, 1.285], [2.0, 1.365], [2.1, 1.386], [2.2, 1.401], [2.3, 1.408], [2.5, 1.421], [2.7, 1.423], [2.9, 1.418], [3.1, 1.406],
      [3.3, 1.391], [3.5, 1.371], [3.7, 1.335], [3.83, 1.313], [3.86, 1.275], [3.9, 1.237], [3.95, 1.181], [4.0, 1.121], [4.05, 1.068], [4.1, 1.0], [4.13, 0.977], [4.15, 0.93]],
    bottom: [[0, 0.44], [0.01, 0.395], [0.04, 0.389], [0.06, 0.25], [0.08, 0.225], [0.1, 0.207], [0.15, 0.192], [0.3, 0.187], [1.1, 0.167], [3.0, 0.174], [3.75, 0.225], [4.0, 0.225], [4.15, 0.255], [4.2, 0.5], [4.227, 0.537]],
    plan: [[0, 0.154], [0.005, 0.21], [0.01, 0.255], [0.02, 0.414], [0.03, 0.455], [0.05, 0.526], [0.08, 0.612], [0.1, 0.66], [0.15, 0.756], [0.2, 0.826], [0.3, 0.916], [0.4, 0.958], [0.6, 0.983], [0.8, 0.99],
      [1.0, 0.993], [3.5, 0.997], [3.8, 0.947], [4.0, 0.854], [4.077, 0.792], [4.127, 0.71], [4.157, 0.624], [4.177, 0.55], [4.197, 0.454], [4.207, 0.39], [4.217, 0.313], [4.227, 0.195]],
    shoulder: [[0.1, 0.7], [0.5, 0.8], [1.3, 0.83], [2.5, 0.845], [3.5, 0.87], [4.1, 0.9]],
    sec: { k2: 0.955, d2: 0.1, f3: 0.62, k4: 0.99, k5: 0.87, k6: 0.84, d7: 0.055 }, track: [1.484, 1.497],
    hwr: 0.565, wind: [1.27, 2.18], rear: [3.86, 4.09], side: [1.78, 3.44], pillars: [2.42, 3.15], eyeY: 1.14,
    lights: { head: [0.1, 0.66, 0.58, 0.4, 0.14], tail: [4.2, 0.83, 0.6, 0.2, 0.18] },
    dlo: {
      glass: [
        [[1.8, 1.0], [2.42, 1.003], [2.497, 1.337], [2.32, 1.326], [2.17, 1.31], [2.02, 1.28], [1.883, 1.208], [1.776, 1.089]],
        [[2.563, 1.006], [3.114, 1.012], [3.114, 1.342], [2.595, 1.342]],
        [[3.151, 1.016], [3.395, 1.026], [3.414, 1.045], [3.426, 1.095], [3.42, 1.158], [3.395, 1.214], [3.345, 1.258], [3.27, 1.283], [3.158, 1.295]],
      ],
      black: [[[2.41, 0.985], [2.575, 0.985], [2.615, 1.37], [2.49, 1.37]], [[1.64, 0.985], [1.81, 0.985], [1.785, 1.1], [1.7, 1.05]]],
      surround: 0.018, frame: 'body', sill: 'trim',
    },
    mirrorAt: [1.72, 1.04], mirror: [0.19, 0.115], handles: [[2.27, 0.83], [3.13, 0.835]],
    plates: { front: [0.47], rear: [0.455] }, exhaust: [[-0.464, 0.279, 0.035, 0.12]],
    parts: [
      // the headlamps: the chrome reflector, the two rings (the "corona" parking lights) round the projectors, the lens
      { at: 'f', mat: 'housing', mirror: true, rim: 0.008, poly: [['f', 0.629, 0.748], ['f', 0.396, 0.74], ['f', 0.368, 0.606], ['f', 0.471, 0.59], ['f', 0.638, 0.586], ['f', 0.704, 0.603], ['f', 0.788, 0.678], ['f', 0.754, 0.711], ['f', 0.688, 0.736]] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.584, 0.661, 0.05] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.584, 0.661, 0.062, 0.073] },
      { at: 'f', mat: 'proj', mirror: true, off: 0.005, disc: ['f', 0.451, 0.656, 0.04] },
      { at: 'f', mat: 'head', mirror: true, off: 0.006, ring: ['f', 0.451, 0.656, 0.05, 0.06] },
      { at: 'f', mat: 'lens', mirror: true, off: 0.012, poly: [['f', 0.629, 0.748], ['f', 0.396, 0.74], ['f', 0.368, 0.606], ['f', 0.471, 0.59], ['f', 0.638, 0.586], ['f', 0.704, 0.603], ['f', 0.788, 0.678], ['f', 0.754, 0.711], ['f', 0.688, 0.736]] },
      // the kidneys: a chrome surround standing proud, the black slats inside
      { at: 'f', mat: 'chrome', mirror: true, depth: 0.012, poly: rrect('f', 0.156, 0.645, 0.287, 0.167, 0.045) },
      { at: 'f', mat: 'vslats', mirror: true, off: 0.017, poly: rrect('f', 0.156, 0.645, 0.252, 0.132, 0.033) },
      // the facelift's bumper: the wide black slot at its foot
      { at: 'f', mat: 'slats', off: 0.002, poly: rrect('f', 0, 0.31, 0.96, 0.075, 0.03) },
      // the sides: the repeater on the wing, the door cuts (the rear door's round the arch), the fuel flap (right)
      { at: 's', mat: 'amber', mirror: true, off: 0.002, disc: ['s', 1.24, 0.82, 0.016], sx: 1.8 },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 1.362, 0.965], ['s', 1.362, 0.37], ['s', 1.4, 0.355], ['s', 2.9, 0.37], ['s', 3.0, 0.375]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 2.47, 0.985], ['s', 2.405, 0.36]] },
      { at: 's', mat: 'trim', mirror: true, w: 0.004, line: [['s', 3.47, 0.985], ['s', 3.38, 0.8], ['s', 3.29, 0.7], ['s', 3.15, 0.54], ['s', 3.05, 0.42], ['s', 3.005, 0.375]] },
      { at: 's', mat: 'trim', off: 0.002, ring: ['s', 3.52, 0.878, 0.068, 0.073] },
      // the tail lamps, round the corner onto the wings, the reversing light in them; the reflectors, the tailgate's cut
      { at: 'r', mat: 'tail', mirror: true, rim: 0.006, poly: [['r', 0.515, 0.921], ['r', 0.69, 0.93], ['s', 4.065, 0.99], ['s', 3.95, 0.985], ['s', 3.877, 0.97], ['s', 3.877, 0.928], ['s', 3.89, 0.866], ['s', 3.92, 0.8], ['s', 4.0, 0.762], ['s', 4.096, 0.742], ['r', 0.673, 0.741], ['r', 0.49, 0.741]] },
      { at: 'r', mat: 'white', mirror: true, off: 0.005, poly: rrect('r', 0.6, 0.878, 0.15, 0.045, 0.012) },
      { at: 'r', mat: 'red', mirror: true, off: 0.002, poly: rrect('r', 0.69, 0.582, 0.17, 0.035, 0.015) },
      { at: 'r', mat: 'trim', w: 0.004, line: [['r', -0.48, 0.738], ['r', 0.48, 0.738]] },
    ],
  },
};
