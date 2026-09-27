import * as THREE from 'three';
import { M } from './materials.js';
import { cylGeo, mat } from './util.js';

// Romanian STOP sign (octagon, 0.7 m across flats, SR 1848) on a galvanised post.
let stopMat = null;
function stopMaterial() {
  if (stopMat) return stopMat;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const oct = (r) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(S / 2 + r * Math.cos(a), S / 2 + r * Math.sin(a)); } g.closePath(); };
  g.fillStyle = '#f4f4f2'; oct(S / 2); g.fill();
  g.fillStyle = '#c4161c'; oct(S / 2 * 0.9); g.fill();
  g.fillStyle = '#f4f4f2'; g.font = `bold ${S * 0.3}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('STOP', S / 2, S / 2 + S * 0.01, S * 0.8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  stopMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.0 });
  return stopMat;
}

// facing: direction the sign face looks at (radians around Y, 0 = towards +z)
export function stopSign(batch, world, x, z, groundY, facing = 0) {
  const H = 2.1, r = 0.35 / Math.cos(Math.PI / 8);
  batch.add(M.galv, cylGeo(0.03, 0.03, H + 0.35, 8), mat(x, groundY + (H + 0.35) / 2 - 0.2, z));
  const face = new THREE.CircleGeometry(r, 8, Math.PI / 8);
  const T = mat(x + Math.sin(facing) * 0.04, groundY + H, z + Math.cos(facing) * 0.04, 0, facing, 0);
  batch.add(stopMaterial(), face, T, { noCast: false });
  const back = new THREE.CircleGeometry(r, 8, Math.PI / 8); back.rotateY(Math.PI); back.translate(0, 0, -0.004);
  batch.add(M.galv, back, T);
  world.addAABB(x - 0.05, x + 0.05, z - 0.05, z + 0.05, -5, 3, 'pole');
}
