/**
 * HUD: minimap rotativ in stil GTA, vitezometru analogic, banner cu
 * numele zonei si indicatoare de stare.
 */
import { ROADS } from './terrain.js';

const ZONES = [
  { name: 'Strada Salciei', x: 0, z: -80, r: 140 },
  { name: 'Intrarea Fantanii', x: -50, z: -104, r: 60 },
  { name: 'Strada Viilor', x: -88, z: -178, r: 90 },
  { name: 'Aleea Teilor', x: -50, z: -252, r: 70 },
  { name: 'Capatul Satului', x: 0, z: -300, r: 120 },
];

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

  zoneAt(x, z) {
    let best = 'Sat', bd = Infinity;
    for (const zn of ZONES) {
      const d = Math.hypot(x - zn.x, z - zn.z) / zn.r;
      if (d < bd) { bd = d; best = zn.name; }
    }
    return best;
  }

  drawMinimap(px, pz, yaw, cars, lamps) {
    const ctx = this.mctx;
    const W = 200, H = 200, R = 96;
    const SCALE = 2.2;                     // px per metru
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.translate(-px * SCALE, -pz * SCALE);

    ctx.lineCap = 'round';
    for (const r of ROADS) {
      ctx.beginPath();
      if (r.axis === 'z') {
        ctx.moveTo(r.c * SCALE, r.a * SCALE);
        ctx.lineTo(r.c * SCALE, r.b * SCALE);
      } else {
        ctx.moveTo(r.a * SCALE, r.c * SCALE);
        ctx.lineTo(r.b * SCALE, r.c * SCALE);
      }
      ctx.strokeStyle = '#2b3040';
      ctx.lineWidth = r.hw * 2 * SCALE + 3;
      ctx.stroke();
      ctx.strokeStyle = '#4a5166';
      ctx.lineWidth = r.hw * 2 * SCALE;
      ctx.stroke();
    }

    for (const l of lamps) {
      ctx.beginPath();
      ctx.arc(l.pos.x * SCALE, l.pos.z * SCALE, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,224,150,0.85)';
      ctx.fill();
    }
    for (const c of cars) {
      const m = c.mesh;
      ctx.save();
      ctx.translate(m.position.x * SCALE, m.position.z * SCALE);
      ctx.rotate(-m.rotation.y);
      ctx.fillStyle = '#98a2b8';
      ctx.fillRect(-1.6, -3.2, 3.2, 6.4);
      ctx.restore();
    }
    ctx.restore();

    // sageata jucatorului
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6.5, 8); ctx.lineTo(0, 4.5); ctx.lineTo(-6.5, 8);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0a0c10';
    ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // N
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.translate(0, -R + 11);
    ctx.rotate(-yaw);
    ctx.fillStyle = 'rgba(255,90,80,0.95)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, 4);
    ctx.restore();
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
