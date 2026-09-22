/* The actual vehicles in the photographs, with factory dimensions and the
   plates as they read in the images. Positions are from SitePlan coordinates;
   `yaw` is degrees clockwise from north (the direction the nose points).

   Where a vehicle appears in the wide yard shot its position is measured, not
   guessed: apparent width against factory width gives its distance, and its
   offset from the frame centre gives its bearing, both from the standpoint at
   (-22, -11). That is what puts the queue of waiting cars up the west side of
   the yard rather than parked in a block. */

export const CARS = [
  {
    id: 'octavia', label: 'Škoda Octavia III Combi',
    style: 'wagon', len: 4.659, width: 1.814, height: 1.452, wheelbase: 2.686,
    trackF: 1.549, trackR: 1.520, wheelR: 0.331, wheelW: 0.225,
    color: 0x0b0d10, metallic: 0.28, rim: 0xb9bec3,
    plate: { text: 'E 202 A', country: 'MD' },
    x: 20.475, z: -49.4, yaw: 0, tailgateOpen: true, doorOpen: true,
    mass: 1395, power: 1.00, drive: 'fwd',
    note: 'în ușa garajului, cu haionul și portiera deschise',
  },
  {
    id: 'mondeo', label: 'Ford Mondeo Mk5',
    style: 'sedan', len: 4.871, width: 1.852, height: 1.482, wheelbase: 2.850,
    trackF: 1.587, trackR: 1.591, wheelR: 0.339, wheelW: 0.235,
    color: 0xb9bdc2, metallic: 0.86, rim: 0xd2d7db,
    plate: { text: 'PH 14 PSP', country: 'RO' },
    x: 27.0, z: -44.0, yaw: 100, mass: 1520, power: 1.10, drive: 'fwd',
    note: 'parcat pe pietriș, la sud de gardul livezii',
  },
  {
    id: 'dokker', label: 'Dacia Dokker',
    style: 'van', len: 4.363, width: 1.751, height: 1.814, wheelbase: 2.810,
    trackF: 1.490, trackR: 1.478, wheelR: 0.318, wheelW: 0.205,
    color: 0xf2f4f3, metallic: 0.05, rim: 0xd8dce0,
    plate: { text: 'PH 76 VLS', country: 'RO' },
    x: -19.9, z: -24.1, yaw: 2, mass: 1230, power: 0.78, drive: 'fwd',
    note: 'în mijlocul curții, cu spatele spre aparat — 13 m de standpoint',
  },
  {
    id: 'astra', label: 'Opel Astra G',
    style: 'sedan', len: 4.252, width: 1.709, height: 1.425, wheelbase: 2.606,
    trackF: 1.470, trackR: 1.458, wheelR: 0.308, wheelW: 0.195,
    color: 0xc6cace, metallic: 0.72, rim: 0xa8adb2,
    plate: { text: 'PH 11 WLE', country: 'RO' },
    x: -25.2, z: -22.2, yaw: 8, mass: 1180, power: 0.72, drive: 'fwd',
  },
  {
    id: 'ram', label: 'RAM 1500 Crew Cab',
    style: 'pickup', len: 5.817, width: 2.017, height: 1.943, wheelbase: 3.569,
    trackF: 1.717, trackR: 1.717, wheelR: 0.393, wheelW: 0.285,
    color: 0x0a0b0d, metallic: 0.35, rim: 0x33373b,
    plate: { text: 'PH 74 BRB', country: 'RO' },
    x: -26.8, z: -18.4, yaw: 6, tonneau: true, mass: 2430, power: 1.55, drive: 'awd',
  },
  {
    id: 'peugeot', label: 'Peugeot 407',
    style: 'sedan', len: 4.676, width: 1.811, height: 1.445, wheelbase: 2.725,
    trackF: 1.558, trackR: 1.546, wheelR: 0.330, wheelW: 0.215,
    color: 0x4d5a68, metallic: 0.75, rim: 0xb4b9be,
    plate: { text: 'PH 09 TDX', country: 'RO' },
    x: -27.6, z: -26.6, yaw: 4, mass: 1470, power: 0.95, drive: 'fwd',
  },
  {
    id: 'xc70', label: 'Volvo XC70',
    style: 'wagon', len: 4.838, width: 1.861, height: 1.604, wheelbase: 2.815,
    trackF: 1.588, trackR: 1.585, wheelR: 0.348, wheelW: 0.235,
    color: 0x2a2f36, metallic: 0.55, rim: 0x9ea4a9,
    plate: { text: 'PH 33 KLM', country: 'RO' },
    x: -28.5, z: -30.4, yaw: 6, roofRails: true, roofBox: true,
    mass: 1720, power: 1.15, drive: 'awd',
  },
  {
    id: 'jeep', label: 'Jeep Grand Cherokee',
    style: 'suv', len: 4.822, width: 1.943, height: 1.761, wheelbase: 2.915,
    trackF: 1.630, trackR: 1.640, wheelR: 0.372, wheelW: 0.265,
    color: 0x101215, metallic: 0.42, rim: 0x7e848a,
    plate: { text: 'PH 02 GHI', country: 'RO' },
    x: -28.2, z: -34.4, yaw: 5, mass: 2170, power: 1.35, drive: 'awd',
  },
  {
    id: 'golf', label: 'VW Golf V',
    style: 'hatch', len: 4.204, width: 1.759, height: 1.485, wheelbase: 2.578,
    trackF: 1.540, trackR: 1.513, wheelR: 0.316, wheelW: 0.205,
    color: 0x5c1418, metallic: 0.62, rim: 0xb0b5ba,
    plate: { text: 'PH 51 ARD', country: 'RO' },
    x: 12.0, z: -43.0, yaw: 176, mass: 1280, power: 0.86, drive: 'fwd',
    note: 'mașina roșie din colțul primei fotografii',
  },
  {
    id: 'v70', label: 'Volvo V70',
    style: 'wagon', len: 4.936, width: 1.891, height: 1.484, wheelbase: 2.872,
    trackF: 1.593, trackR: 1.591, wheelR: 0.340, wheelW: 0.225,
    color: 0x1b2026, metallic: 0.5, rim: 0xa9aeb3,
    plate: { text: 'B 137 XYZ', country: 'RO' },
    x: -15.5, z: -34.5, yaw: 356, mass: 1610, power: 1.05, drive: 'fwd',
  },
];

/* The backhoe stands 8.4 m from the yard standpoint at a bearing of 22 deg,
   which is what makes it fill the right edge of both yard shots. */
export const BACKHOE = {
  id: 'komatsu', label: 'Komatsu WB93 — buldoexcavator',
  x: -15.85, z: -20.1, yaw: 270,
};
