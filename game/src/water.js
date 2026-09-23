/**
 * Prahova si Campinita. Firul Prahovei e o banda pe axul real al raului,
 * la nivelul apei calculat pe lungul cursului; marginile ei intra sub
 * prundisul albiei, deci linia malului iese exact din intersectia cu relieful.
 */
import * as THREE from '../vendor/three.module.min.js';
import { ZONA } from './zona.js';
import { polyRibbon, landY, inRiverBed } from './terrain.js';
import { lerp, clamp } from './noise.js';

function smoothLine(pts, step = 3) {
  const v = pts.map((p) => new THREE.Vector3(p[0], 0, p[1]));
  const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  const n = Math.max(8, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}

export class River {
  constructor(scene, T) {
    this.scene = scene;
    const wn = T.waterN;
    wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x0b1316, roughness: 0.05, metalness: 0.0,
      normalMap: wn, normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 1.35,
    });
    this.flow = 0;

    // --- Prahova: nivelul apei pe fiecare punct al axului ---
    const P = ZONA.rivers.find((r) => r.name === 'Prahova');
    const raw = P.pts, wl = P.wl;
    const arc = [0];
    for (let i = 1; i < raw.length; i++) arc.push(arc[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const levelAt = (x, z) => {
      let best = Infinity, lvl = wl[0];
      for (let i = 0; i < raw.length - 1; i++) {
        const ax = raw[i][0], az = raw[i][1], bx = raw[i + 1][0], bz = raw[i + 1][1];
        const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
        const t = L === 0 ? 0 : clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
        const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
        if (d < best) { best = d; lvl = wl[i] + (wl[i + 1] - wl[i]) * t; }
      }
      return lvl;
    };
    const hw = ZONA.channelHW + 3.5;
    const geo = polyRibbon(smoothLine(raw, 3), hw, 0, {
      step: 3, uScale: 1 / 7, vScale: 1 / 9, yFn: (x, z, cx, cz) => levelAt(cx, cz),
    });
    this.prahova = new THREE.Mesh(geo, this.mat);
    this.prahova.receiveShadow = true;
    this.prahova.renderOrder = 1;
    scene.add(this.prahova);

    // --- Campinita: parau ingust, pe fundul santului sau ---
    const C = ZONA.rivers.find((r) => r.name && r.name.startsWith('Câmpini'));
    if (C) {
      const pts = smoothLine(C.pts, 2.5);
      const cg = polyRibbon(pts, 1.25, 0.05, {
        step: 2.5, uScale: 1 / 3, vScale: 1 / 5,
        yFn: (x, z, cx, cz) => (inRiverBed(cx, cz) ? Math.min(landY(cx, cz), levelAt(cx, cz) + 0.1) : landY(cx, cz) - 0.02),
      });
      this.campinita = new THREE.Mesh(cg, this.mat);
      this.campinita.renderOrder = 1;
      scene.add(this.campinita);
    }
  }

  update(dt) {
    // curentul duce ondulatiile in aval (~0,9 m/s)
    this.flow += dt;
    this.mat.normalMap.offset.set(Math.sin(this.flow * 0.13) * 0.02, -this.flow * 0.9 / 9);
  }
}
