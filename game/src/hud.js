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
    this.speedo = root.querySelector('#speedo');
    this.sctx = this.speedo.getContext('2d');
    this.zoneEl = root.querySelector('#zone');
    this.hintEl = root.querySelector('#hint');
    this.statEl = root.querySelector('#stats');
    this.carEl = root.querySelector('#carinfo');
    this.zone = '';
    this.zoneT = 0;
    this.visible = true;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._sizeCanvas(this.map, 200, 200);
    this._sizeCanvas(this.speedo, 190, 120);
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

  drawMinimap(px, pz, yaw, cars, lamps, inCar) {
    const ctx = this.mctx;
    const W = 200, H = 200, R = 96;
    const SCALE = inCar ? 1.35 : 2.2;      // px per metru
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
      ctx.fillStyle = c.inUse ? '#ffd24a' : '#98a2b8';
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

  drawSpeedo(kmh, rpm, gear, lights, brake) {
    const ctx = this.sctx;
    const W = 190, H = 120;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - 14, R = 72;
    const a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;

    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();

    const t = Math.min(1, Math.max(0, kmh / 180));
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#5fd0ff');
    grad.addColorStop(0.6, '#ffd166');
    grad.addColorStop(1, '#ff5a4a');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * t);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 9; i++) {
      const a = a0 + (a1 - a0) * (i / 9);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13));
      ctx.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6));
      ctx.stroke();
    }

    const rt = Math.min(1, rpm / 6500);
    ctx.strokeStyle = rt > 0.82 ? 'rgba(255,80,70,0.9)' : 'rgba(150,200,255,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 16, a0, a0 + (a1 - a0) * rt);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.fillText(Math.abs(Math.round(kmh)), cx, cy - 16);
    ctx.font = '500 10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('km/h', cx, cy - 4);
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#9fd4ff';
    ctx.fillText(kmh < -1 ? 'R' : 'D' + gear, cx + 48, cy - 8);

    ctx.fillStyle = lights ? '#6fd8ff' : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(cx - 52, cy - 10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = brake > 0.1 ? '#ff5a4a' : 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(cx - 52, cy - 24, 5, 0, Math.PI * 2); ctx.fill();
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
  setCarInfo(text) {
    this.carEl.textContent = text;
    this.carEl.style.opacity = text ? '1' : '0';
  }
}
