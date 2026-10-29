import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightToNormalCanvas } from './textures.js';

// A Glock 18 (V85): the select-fire Glock, 9 x 19 mm, its dimensions the Gen 3 frame's (a 186 mm slide and 114 mm
// barrel, the grip raked 22 degrees, 32 mm across), with a threaded barrel and a 9 mm suppressor (34 mm across, 170 mm
// long) and the 33-round magazine; the frame, the grip, the suppressor and the magazine wrapped in white cloth tape for
// the snow, the slide's front half in bands too (its top, the sights, the ejection port and the controls left bare).
// The model's frame: x to the right, y up, the muzzle toward -z; the bore's axis at y = BORE; the slide's rear face at
// z = 0. Its moving parts are their own meshes: the slide (back on every shot, locked back on an empty magazine), the
// trigger, the selector lever on the slide's left (the G18's), the magazine (along the grip's axis).

export const BORE = 0.003;
export const RAKE = 22 * Math.PI / 180;                       // (the grip's angle from the vertical)
export const MAG_AXIS = new THREE.Vector3(0, -Math.cos(RAKE), Math.sin(RAKE));   // (out of the grip: down and back)
export const GRIP_AXIS = MAG_AXIS.clone().negate();           // (up the grip, the way the hand's bar runs: up and forward)
export const GRIP_C = new THREE.Vector3(0, -0.066, -0.0070);  // (the grip's middle, where the hand holds it)
export const MAG_WELL = new THREE.Vector3(0, -0.1085, 0.0100); // (the magazine well's floor: the baseplate seats here)
export const MUZZLE = new THREE.Vector3(0, BORE, -0.366);     // (the suppressor's end)
export const EJECT = new THREE.Vector3(0.012, 0.012, -0.055);  // (the ejection port, on the right)
export const SIGHT_REAR = new THREE.Vector3(0, 0.0245, -0.016), SIGHT_FRONT = new THREE.Vector3(0, 0.0235, -0.176);

// ---- the tape: white cloth tape (athletic tape, 25 mm wide) wound with a little overlap; its weave, the raised lip of
// every edge with a soft shadow under it, a little grime from the hands and the snow. One tile: 0.1 m x 0.1 m
let TAPE = null;
export function tapeTextures() {
  if (TAPE) return TAPE;
  const W = 512, c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d'), img = g.createImageData(W, W), H = new Float32Array(W * W);
  const rnd = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y, p) => {                 // (periodic value noise, p cells across the tile)
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = rnd(xi % p, yi % p), b = rnd((xi + 1) % p, yi % p), cc = rnd(xi % p, (yi + 1) % p), d = rnd((xi + 1) % p, (yi + 1) % p);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  const band = 0.025, m = 0.1 / W;              // (metres per pixel)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    // (a wrap: each turn one band further along - the tile is one turn across, so it runs on round a cylinder)
    const t = (y * m + (x / W) * band) / band, f = t - Math.floor(t);
    // the band's lip: the next turn lies over this one, its edge raised and casting a thin shadow
    const lip = f > 0.9 ? (f - 0.9) / 0.1 : 0, shadow = f < 0.08 ? 1 - f / 0.08 : 0;
    const weave = 0.5 + 0.25 * Math.sin(x * Math.PI * 0.9) * Math.sin(y * Math.PI * 0.9) + 0.25 * Math.sin((x + y) * Math.PI * 0.45);
    const crinkle = vnoise(x / 24, y / 9, W / 24) * 0.6 + vnoise(x / 7, y / 5, Math.round(W / 7)) * 0.4;
    H[y * W + x] = 0.55 * lip + 0.12 * weave + 0.22 * crinkle - 0.2 * shadow;
    const grime = Math.max(0, vnoise(x / 64, y / 64, W / 64) - 0.62) * 0.22 + Math.max(0, vnoise(x / 13, y / 13, Math.round(W / 13)) - 0.85) * 0.35;
    const k = (0.93 + 0.05 * weave - 0.16 * shadow - grime) * (0.98 + 0.03 * crinkle);
    const i = (y * W + x) * 4;
    img.data[i] = Math.min(255, 244 * k); img.data[i + 1] = Math.min(255, 245 * k); img.data[i + 2] = Math.min(255, 242 * k); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const nrm = new THREE.CanvasTexture(heightToNormalCanvas(H, W, W, 3));
  for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  TAPE = { map, nrm };
  return TAPE;
}

// ---- shapes
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// a side profile [[s, y]] (s: forward from the slide's rear face) extruded w across, its edges rounded r
function side(pts, w, r = 0.0012, holes = []) {
  const sh = new THREE.Shape(pts.map(([s, y]) => new THREE.Vector2(s, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([s, y]) => new THREE.Vector2(s, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * r, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(w - 2 * r) / 2);
  g.rotateY(Math.PI / 2);                     // (s -> -z, the extrusion across x)
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a tube along -z (from z0 to z1 < z0), radius r, its UVs in metres (u round it, v along)
function tubeZ(r, z0, z1, seg = 28, open = false) {
  const g = new THREE.CylinderGeometry(r, r, z0 - z1, seg, 1, open);
  const uv = g.attributes.uv, L = z0 - z1, C = 2 * Math.PI * r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * C / 0.1, uv.getY(i) * L / 0.1);
  g.rotateX(-Math.PI / 2); g.translate(0, BORE, (z0 + z1) / 2);
  return g;
}

export function glockModel() {
  const T = tapeTextures();
  const mk = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    polymer: mk({ color: 0x17181a, roughness: 0.6, metalness: 0 }),
    steel: mk({ color: 0x1d1e20, roughness: 0.4, metalness: 0.7 }),              // (the slide's matt black nitride)
    barrel: mk({ color: 0x5b5a57, roughness: 0.32, metalness: 0.9 }),
    can: mk({ color: 0x141516, roughness: 0.5, metalness: 0.45 }),                // (the suppressor's anodised caps)
    tape: mk({ map: T.map, normalMap: T.nrm, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9, color: 0xf4f4f2 }),
    dot: mk({ color: 0xf2f2ea, roughness: 0.5, emissive: 0x9a9a90, emissiveIntensity: 0.25 }),
  };
  for (const m of Object.values(M)) { m.userData.noWet = true; m.envMapIntensity = 0.8; }
  const group = new THREE.Group(); group.name = 'glock18';
  const part = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };

  // ---- the frame: the dust cover, the trigger guard, the grip (taped), the beavertail
  const frameP = [[-0.004, -0.0105], [0.172, -0.0105], [0.174, -0.020], [0.170, -0.0265], [0.111, -0.0265], [0.110, -0.047], [0.104, -0.0505],
    [0.056, -0.0505], [0.046, -0.044], [0.040, -0.030], [0.020, -0.024], [-0.004, -0.016]];
  const guardHole = [[0.054, -0.0445], [0.104, -0.0445], [0.104, -0.0285], [0.058, -0.0285]];
  const frame = part(side(frameP, 0.0225, 0.0012, [guardHole]), M.polymer);
  // the grip: from the beavertail's tang down the backstrap (22 deg), the magazine well's floor square to its axis,
  // up the front strap with its finger grooves to the guard
  const gp = [[-0.0085, -0.0115], [-0.0035, -0.0205], [-0.0045, -0.0245], [-0.0330, -0.0985], [-0.0300, -0.1040], [0.0150, -0.1145],
    [0.0215, -0.1070], [0.0225, -0.0900], [0.0285, -0.0820], [0.0300, -0.0740], [0.0360, -0.0660], [0.0385, -0.0580], [0.0440, -0.0500],
    [0.0480, -0.0420], [0.0460, -0.0300], [0.0300, -0.0200], [0.0100, -0.0150]];
  const grip = part(side(gp, 0.0305, 0.0045), M.tape);
  // (the tape's tile on the grip's sides: the extrusion's UVs are its profile in metres - a band every 2.5 cm)
  scaleUV(grip.geometry, 10, 10);
  // ---- the slide: chamfered at the front, the serrations at the rear, the ejection port on the right; taped in bands
  // over its front half (the ejection port and the sights clear)
  const slideG = [side([[0, -0.0105], [0.186, -0.0105], [0.186, 0.011], [0.181, 0.0168], [0.004, 0.0168], [0, 0.0140]], 0.0255, 0.0011)];
  for (let k = 0; k < 9; k++) for (const sx of [-1, 1]) slideG.push(box(0.0012, 0.017, 0.0011, sx * 0.0129, 0.001, -(0.006 + k * 0.0031)));
  const slide = new THREE.Group(); slide.name = 'slide';
  slide.add(part(mergeGeometries(slideG.map(g => g.index ? g.toNonIndexed() : g)), M.steel));
  const portG = box(0.004, 0.009, 0.042, 0.0115, 0.0125, -0.056);
  slide.add(part(portG, M.polymer));                                       // (the port: a dark opening)
  const hood = part(box(0.0098, 0.0012, 0.040, 0.0069, 0.0166, -0.056), M.barrel);   // (the barrel's hood seen through the port)
  slide.add(hood);
  const tapeSlide = part(side([[0.080, -0.0118], [0.181, -0.0118], [0.181, 0.0098], [0.176, 0.0158], [0.080, 0.0158]], 0.0275, 0.0012), M.tape);
  scaleUV(tapeSlide.geometry, 10, 10);
  slide.add(tapeSlide);
  // the sights: the rear's U with its white outline, the front's white dot
  slide.add(part(mergeGeometries([box(0.0125, 0.0068, 0.009, 0, 0.0200, -0.016), box(0.0034, 0.0076, 0.0055, 0, 0.0198, -0.177)].map(g => g.toNonIndexed())), M.polymer));
  slide.add(part(mergeGeometries([box(0.0018, 0.0012, 0.0005, -0.0034, 0.0222, -0.0114), box(0.0018, 0.0012, 0.0005, 0.0034, 0.0222, -0.0114),
    box(0.0018, 0.0018, 0.0005, 0, 0.0215, -0.1795)].map(g => g.toNonIndexed())), M.dot));
  // the G18's selector lever on the slide's left, at the rear (down: semi, up: full auto)
  const selector = new THREE.Group(); selector.name = 'selector';
  selector.add(part(mergeGeometries([box(0.003, 0.0055, 0.0055, 0, 0, 0), box(0.0028, 0.0105, 0.0032, 0, -0.0065, 0.0005)].map(g => g.toNonIndexed())), M.steel));
  selector.position.set(-0.0142, 0.0055, -0.0215);
  slide.add(selector);
  group.add(slide);
  // ---- the barrel's threaded end past the slide, the suppressor on it: anodised caps, the tube taped
  const muzzleG = tubeZ(0.0067, -0.186, -0.199, 18);
  group.add(part(muzzleG, M.barrel));
  const can = new THREE.Group(); can.name = 'suppressor';
  can.add(part(tubeZ(0.0170, -0.196, -0.209, 30), M.can));
  can.add(part(tubeZ(0.0172, -0.208, -0.354, 30, true), M.tape));
  const capF = tubeZ(0.0170, -0.353, -0.366, 30);
  can.add(part(capF, M.can));
  can.add(part(new THREE.CircleGeometry(0.0055, 16).rotateY(Math.PI).translate(0, BORE, -0.3662), M.polymer));   // (the bore's exit, dark)
  group.add(can);
  group.add(frame, grip);
  // ---- the controls: the trigger (with its safety blade), the slide stop on the left, the takedown lever
  const trigger = new THREE.Group(); trigger.name = 'trigger';
  trigger.add(part(side([[0.0, 0.0], [0.004, -0.004], [0.0055, -0.011], [0.0035, -0.0165], [0.0005, -0.0165], [0.0015, -0.010], [-0.0015, -0.003]], 0.0062, 0.0008), M.polymer));
  trigger.position.set(0, -0.029, -0.068);
  group.add(trigger);
  group.add(part(mergeGeometries([box(0.0018, 0.003, 0.016, -0.0122, -0.0145, -0.072), box(0.0016, 0.0025, 0.009, -0.0121, -0.0175, -0.100),
    box(0.0016, 0.0025, 0.009, 0.0121, -0.0175, -0.100)].map(g => g.toNonIndexed())), M.polymer));
  // ---- the magazine: 33 rounds, ~95 mm out of the grip below; its body taped, the baseplate black; the top round
  // showing at its lips when it is out
  const mag = new THREE.Group(); mag.name = 'magazine';
  const L = 0.185, mb = tubeless(0.0218, 0.0322, L);
  const body = part(mb, M.tape); scaleUV(body.geometry, 10, 10);
  mag.add(body);
  mag.add(part(box(0.0250, 0.0075, 0.0390, 0, -L - 0.0035, 0.0014), M.polymer));                     // (the baseplate)
  mag.add(part(new THREE.CylinderGeometry(0.0045, 0.0045, 0.015, 10).rotateX(Math.PI / 2).translate(0, 0.0055, -0.002), M.barrel));   // (the top round)
  // (the magazine's own frame: its mouth at the origin, its length down -y; turned to the grip's rake, seated in the well)
  mag.quaternion.setFromUnitVectors(v3(0, -1, 0), MAG_AXIS);
  mag.position.copy(MAG_WELL).addScaledVector(MAG_AXIS, -(L - 0.095));
  mag.userData.seat = mag.position.clone();
  group.add(mag);
  return { group, slide, trigger, selector, mag, can, M, magLen: L };
}
// a magazine's body: a box w x d, L long below its mouth (y 0 .. -L), its edges rounded
function tubeless(w, d, L) {
  const s = new THREE.Shape(), r = 0.004, hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r); s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 3 });
  g.rotateX(Math.PI / 2);                     // (the extrusion down -y)
  return g;
}
function scaleUV(g, a, b) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * a, uv.getY(i) * b); }

// a spare magazine on its own (the pickup's, the one in the hand while reloading, the one dropped)
export function magazineModel(M) {
  const g = new THREE.Group(), L = 0.185;
  const body = new THREE.Mesh(tubeless(0.0218, 0.0322, L), M.tape); scaleUV(body.geometry, 10, 10);
  g.add(body, new THREE.Mesh(new THREE.BoxGeometry(0.0250, 0.0075, 0.0390).translate(0, -L - 0.0035, 0.0014), M.polymer));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.015, 10).rotateX(Math.PI / 2).translate(0, 0.0055, -0.002), M.barrel));
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
