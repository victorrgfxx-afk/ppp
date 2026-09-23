/**
 * HUD: minimap rotativ in stil GTA, vitezometru analogic, banner cu
 * numele zonei si indicatoare de stare.
 */
import { ZONA } from './zona.js';
import { ROADS, HERO, NORTH, inRiverBed, distToPrahova, nearestRoadName } from './terrain.js';

export class HUD {
  constructor(root) {
    this.root = root;
    this.map = root.querySelector('#minimap');
    this.mctx = this.map.getContext('2d');
    this.zoneEl = root.querySelector('#zone');
    this.hintEl = root.querySelector('#hint');
    this.statEl = root.querySelector('#stats');
    this.zone = '';
    this.zoneT = 0;
    this.visible = true;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._sizeCanvas(this.map, 200, 200);
  }

  _sizeCanvas(c, w, h) {
    c.width = w * this.dpr; c.height = h * this.dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    c.getContext('2d').setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  toggle() {
    this.visible = !this.visible;
    this.root.style.opacity = this.visible ? '1' : '0';
  }

  /** Numele locului, din datele reale: strada, malul, albia, gara. */
  zoneAt(x, z) {
    if (inRiverBed(x, z)) return distToPrahova(x, z) < ZONA.channelHW ? 'Prahova' : 'Albia Prahovei';
    if (z < HERO.z1 - 10 && distToPrahova(x, z) < 90) return z < -280 ? 'Malul drept al Prahovei' : 'Malul Prahovei';
    if (z > HERO.z0 + 14) return 'Gara Câmpina';
    const n = nearestRoadName(x, z, 16);
    return n ? n + ', Câmpina' : 'Câmpina';
  }

  drawMinimap(px, pz, yaw, cars, lamps) {
    const ctx = this.mctx;
    const W = 200, H = 200, R = 96;
    const SCALE = 1.6;                     // px per metru
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.translate(-px * SCALE, -pz * SCALE);
    const path = (pts, close) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * SCALE, p[1] * SCALE) : ctx.moveTo(p[0] * SCALE, p[1] * SCALE)));
      if (close) ctx.closePath();
    };

    // albia si firul apei
    for (const w of ZONA.water) { path(w, true); ctx.fillStyle = '#233447'; ctx.fill(); }
    const pr = ZONA.rivers.find((r) => r.name === 'Prahova');
    path(pr.pts); ctx.strokeStyle = '#3f7fc0'; ctx.lineWidth = ZONA.channelHW * 2 * SCALE; ctx.lineCap = 'round'; ctx.stroke();
    for (const r of ZONA.rivers) if (r !== pr) { path(r.pts); ctx.lineWidth = 2.4 * SCALE; ctx.stroke(); }

    // calea ferata
    ctx.setLineDash([3, 3]);
    for (const r of ZONA.rail) {
      if (r.kind === 'platform') continue;
      path(r.pts); ctx.strokeStyle = 'rgba(160,160,170,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.setLineDash([]);

    // drumuri
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of ROADS) {
      path(r.pts);
      ctx.strokeStyle = r.surface === 'asphalt' ? '#4a5166' : '#5c5446';
      ctx.lineWidth = Math.max(1.5, r.hw * 2 * SCALE);
      ctx.stroke();
    }
    path([[0, HERO.z0 + 6], [0, HERO.z1]]);
    ctx.strokeStyle = '#6a7390'; ctx.lineWidth = 6 * SCALE; ctx.stroke();

    // cladiri
    ctx.fillStyle = '#3a3630';
    for (const b of ZONA.buildings) {
      const cx = b.pts[0][0], cz = b.pts[0][1];
      if (Math.abs(cx - px) > 90 || Math.abs(cz - pz) > 90) continue;
      path(b.pts, true); ctx.fill();
    }

    for (const l of lamps) {
      ctx.beginPath();
      ctx.arc(l.pos.x * SCALE, l.pos.z * SCALE, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,224,150,0.85)';
      ctx.fill();
    }
    for (const c of cars) {
      ctx.save();
      ctx.translate(c.x * SCALE, c.z * SCALE);
      ctx.fillStyle = '#98a2b8';
      ctx.fillRect(-1.5, -3.4, 3.0, 6.8);
      ctx.restore();
    }
    ctx.restore();

    // sageata jucatorului
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6.5, 8); ctx.lineTo(0, 4.5); ctx.lineTo(-6.5, 8);
    ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.stroke();

    // N: nordul adevarat (strada are azimut 42 de grade)
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const nx = NORTH.x * c - NORTH.z * sn, nz = NORTH.x * sn + NORTH.z * c;
    ctx.fillStyle = 'rgba(255,90,80,0.95)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', W / 2 + nx * (R - 11), H / 2 + nz * (R - 11));
  }

  setZone(name) {
    if (name === this.zone) return;
    this.zone = name;
    this.zoneEl.textContent = name;
    this.zoneEl.classList.remove('show');
    void this.zoneEl.offsetWidth;
    this.zoneEl.classList.add('show');
  }

  setHint(text) {
    if (this.hintEl.textContent === text) return;
    this.hintEl.textContent = text;
    this.hintEl.style.opacity = text ? '1' : '0';
  }

  setStats(text) { this.statEl.textContent = text; }
}
