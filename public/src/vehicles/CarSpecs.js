/* The actual vehicles in the photographs, with factory dimensions and the
   plates as they read in the images. Positions are from SitePlan coordinates;
   `yaw` is degrees clockwise from north (the direction the nose points). */

export const CARS = [
  {
    id: 'octavia', label: 'Škoda Octavia III Combi',
    style: 'wagon', len: 4.659, width: 1.814, height: 1.452, wheelbase: 2.686,
    trackF: 1.549, trackR: 1.520, wheelR: 0.331, wheelW: 0.225,
    color: 0x0b0d10, metallic: 0.28, rim: 0xb9bec3,
    plate: { text: 'E 202 A', country: 'MD' },
    x: -12.65, z: 14.2, yaw: 0, tailgateOpen: true, doorOpen: true,
    mass: 1395, power: 1.00, drive: 'fwd',
    note: 'în ușa garajului, cu haionul și portiera deschise',
  },
  {
    id: 'mondeo', label: 'Ford Mondeo Mk5',
    style: 'sedan', len: 4.871, width: 1.852, height: 1.482, wheelbase: 2.850,
    trackF: 1.587, trackR: 1.591, wheelR: 0.339, wheelW: 0.235,
    color: 0xb9bdc2, metallic: 0.86, rim: 0xd2d7db,
    plate: { text: 'PH 14 PSP', country: 'RO' },
    x: 3, z: 15, yaw: 90, mass: 1520, power: 1.10, drive: 'fwd',
    note: 'parcat lângă gardul livezii',
  },
  {
    id: 'dokker', label: 'Dacia Dokker',
    style: 'van', len: 4.363, width: 1.751, height: 1.814, wheelbase: 2.810,
    trackF: 1.490, trackR: 1.478, wheelR: 0.318, wheelW: 0.205,
    color: 0xf2f4f3, metallic: 0.05, rim: 0xd8dce0,
    plate: { text: 'PH 76 VLS', country: 'RO' },
    x: -24.5, z: -15.5, yaw: 0, mass: 1230, power: 0.78, drive: 'fwd',
    note: 'în fața halei, cu spatele spre curte',
  },
  {
    id: 'astra', label: 'Opel Astra G',
    style: 'sedan', len: 4.252, width: 1.709, height: 1.425, wheelbase: 2.606,
    trackF: 1.470, trackR: 1.458, wheelR: 0.308, wheelW: 0.195,
    color: 0xc6cace, metallic: 0.72, rim: 0xa8adb2,
    plate: { text: 'PH 11 WLE', country: 'RO' },
    x: -48, z: -6, yaw: 272, mass: 1180, power: 0.72, drive: 'fwd',
  },
  {
    id: 'ram', label: 'RAM 1500 Crew Cab',
    style: 'pickup', len: 5.817, width: 2.017, height: 1.943, wheelbase: 3.569,
    trackF: 1.717, trackR: 1.717, wheelR: 0.393, wheelW: 0.285,
    color: 0x0a0b0d, metallic: 0.35, rim: 0x33373b,
    plate: { text: 'PH 74 BRB', country: 'RO' },
    x: -46, z: 4, yaw: 284, tonneau: true, mass: 2430, power: 1.55, drive: 'awd',
  },
  {
    id: 'peugeot', label: 'Peugeot 407',
    style: 'sedan', len: 4.676, width: 1.811, height: 1.445, wheelbase: 2.725,
    trackF: 1.558, trackR: 1.546, wheelR: 0.330, wheelW: 0.215,
    color: 0x4d5a68, metallic: 0.75, rim: 0xb4b9be,
    plate: { text: 'PH 09 TDX', country: 'RO' },
    x: -48, z: -12, yaw: 266, mass: 1470, power: 0.95, drive: 'fwd',
  },
  {
    id: 'xc70', label: 'Volvo XC70',
    style: 'wagon', len: 4.838, width: 1.861, height: 1.604, wheelbase: 2.815,
    trackF: 1.588, trackR: 1.585, wheelR: 0.348, wheelW: 0.235,
    color: 0x2a2f36, metallic: 0.55, rim: 0x9ea4a9,
    plate: { text: 'PH 33 KLM', country: 'RO' },
    x: -48, z: -18.5, yaw: 276, roofRails: true, roofBox: true,
    mass: 1720, power: 1.15, drive: 'awd',
  },
  {
    id: 'jeep', label: 'Jeep Grand Cherokee',
    style: 'suv', len: 4.822, width: 1.943, height: 1.761, wheelbase: 2.915,
    trackF: 1.630, trackR: 1.640, wheelR: 0.372, wheelW: 0.265,
    color: 0x101215, metallic: 0.42, rim: 0x7e848a,
    plate: { text: 'PH 02 GHI', country: 'RO' },
    x: -48, z: 0.5, yaw: 268, mass: 2170, power: 1.35, drive: 'awd',
  },
  {
    id: 'golf', label: 'VW Golf V',
    style: 'hatch', len: 4.204, width: 1.759, height: 1.485, wheelbase: 2.578,
    trackF: 1.540, trackR: 1.513, wheelR: 0.316, wheelW: 0.205,
    color: 0x5c1418, metallic: 0.62, rim: 0xb0b5ba,
    plate: { text: 'PH 51 ARD', country: 'RO' },
    x: -20.5, z: 19.5, yaw: 168, mass: 1280, power: 0.86, drive: 'fwd',
    note: 'mașina roșie din colțul primei fotografii',
  },
  {
    id: 'v70', label: 'Volvo V70',
    style: 'wagon', len: 4.936, width: 1.891, height: 1.484, wheelbase: 2.872,
    trackF: 1.593, trackR: 1.591, wheelR: 0.340, wheelW: 0.225,
    color: 0x1b2026, metallic: 0.5, rim: 0xa9aeb3,
    plate: { text: 'B 137 XYZ', country: 'RO' },
    x: -17.5, z: -17.5, yaw: 352, mass: 1610, power: 1.05, drive: 'fwd',
  },
];

export const BACKHOE = {
  id: 'komatsu', label: 'Komatsu WB93 — buldoexcavator',
  x: -18, z: -10, yaw: 205,
};
