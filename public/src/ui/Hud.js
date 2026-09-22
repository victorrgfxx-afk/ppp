/* HUD: compass strip, vehicle dash, interaction prompt, toasts, stamina. */
import { Minimap } from './Minimap.js';

const DIRS = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
  [180, 'S'], [225, 'SV'], [270, 'V'], [315, 'NV'],
];

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.compass = document.getElementById('compass-cv');
    this.cctx = this.compass.getContext('2d');
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.dash = document.getElementById('dash');
    this.dctx = this.dash.getContext('2d');
    this.vehHud = document.getElementById('vehicle-hud');
    this.prompt = document.getElementById('prompt');
    this.promptKey = this.prompt.querySelector('b');
    this.promptTxt = this.prompt.querySelector('span');
    this.toasts = document.getElementById('toast-wrap');
    this.stamina = document.getElementById('stamina');
    this.staminaBar = this.stamina.querySelector('i');
    this.fps = document.getElementById('st-fps');
    this.pos = document.getElementById('st-pos');
    this.crosshair = document.getElementById('crosshair');
    this.photoFrame = document.getElementById('photo-frame');
    this.photoLabel = document.getElementById('photo-label');
    this._acc = 0;
  }

  show(v) { this.root.hidden = !v; }

  setPrompt(key, text) {
    if (!text) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.promptKey.textContent = key;
    this.promptTxt.textContent = text;
  }

  toast(text, ms = 2600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 420); }, ms);
  }

  photoMode(on, label = '') {
    this.photoFrame.hidden = !on;
    this.photoLabel.textContent = label;
    this.crosshair.style.display = on ? 'none' : '';
    document.getElementById('minimap-wrap').style.opacity = on ? '0' : '1';
    document.getElementById('compass').style.opacity = on ? '0' : '0.9';
    document.getElementById('stats').style.opacity = on ? '0' : '1';
  }

  /* ------------------------------- compass ------------------------------- */
  _drawCompass(yawDeg) {
    const ctx = this.cctx, W = this.compass.width, H = this.compass.height;
    ctx.clearRect(0, 0, W, H);
    const pxPerDeg = W / 140;
    ctx.fillStyle = 'rgba(8,11,14,.55)';
    ctx.fillRect(0, 8, W, H - 16);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.strokeRect(0.5, 8.5, W - 1, H - 17);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = -70; d <= 70; d += 5) {
      const ang = ((yawDeg + d) % 360 + 360) % 360;
      const x = W / 2 + d * pxPerDeg;
      const off = ang % 45;
      const major = off < 2.5 || off > 42.5;
      ctx.strokeStyle = major ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, H - 12); ctx.lineTo(x, H - (major ? 24 : 18));
      ctx.stroke();
      if (major) {
        const [, name] = DIRS[Math.round(ang / 45) % 8];
        ctx.fillStyle = name === 'N' ? '#ff6b6b' : '#eef2f6';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText(name, x, 19);
      }
    }
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(W / 2, H - 8); ctx.lineTo(W / 2 - 6, H - 1); ctx.lineTo(W / 2 + 6, H - 1);
    ctx.closePath(); ctx.fill();
  }

  /* --------------------------------- dash -------------------------------- */
  _drawDash(v) {
    const ctx = this.dctx, W = this.dash.width, H = this.dash.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W * 0.32, cy = H * 0.62, R = H * 0.44;

    ctx.strokeStyle = 'rgba(10,14,18,.72)'; ctx.lineWidth = R * 0.34;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.76, Math.PI * 2.24); ctx.stroke();

    const kmh = Math.abs(v.speed) * 3.6;
    const t = Math.min(1, kmh / 200);
    ctx.strokeStyle = kmh > 130 ? '#ff5252' : '#ffb300';
    ctx.lineWidth = R * 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.76, Math.PI * 0.76 + t * Math.PI * 1.48);
    ctx.stroke();

    ctx.fillStyle = '#eef2f6';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(R * 0.62)}px system-ui, sans-serif`;
    ctx.fillText(Math.round(kmh), cx, cy - R * 0.06);
    ctx.font = `600 ${Math.round(R * 0.2)}px system-ui, sans-serif`;
    ctx.fillStyle = '#9aa6b2';
    ctx.fillText('km/h', cx, cy + R * 0.34);

    // rev bar + gear
    const bx = W * 0.62, bw = W * 0.34, by = H * 0.30, bh = H * 0.13;
    ctx.fillStyle = 'rgba(10,14,18,.72)';
    ctx.fillRect(bx, by, bw, bh);
    const rt = Math.min(1, (v.rpm - 700) / 5700);
    const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grd.addColorStop(0, '#3ddc84'); grd.addColorStop(0.72, '#ffb300'); grd.addColorStop(1, '#ff5252');
    ctx.fillStyle = grd;
    ctx.fillRect(bx, by, bw * rt, bh);
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    ctx.fillStyle = 'rgba(10,14,18,.72)';
    ctx.fillRect(bx, by + bh * 1.5, bw, H * 0.34);
    ctx.fillStyle = '#eef2f6';
    ctx.font = `800 ${Math.round(H * 0.24)}px system-ui, sans-serif`;
    const gear = v.gear === 0 ? 'R' : v.gear === 1 ? 'N' : String(v.gear - 1);
    ctx.fillText(gear, bx + bw / 2, by + bh * 1.5 + H * 0.18);

    ctx.font = `600 ${Math.round(H * 0.075)}px system-ui, sans-serif`;
    ctx.fillStyle = '#9aa6b2';
    ctx.textAlign = 'right';
    ctx.fillText(v.label || '', W - 6, H * 0.10);
  }

  update(dt, ctx2) {
    const { yawDeg, player, vehicle, vehicles, fps, showStats } = ctx2;
    this._acc += dt;
    this._drawCompass(yawDeg);
    if (this._acc > 0.12) {
      this._acc = 0;
      this.minimap.draw(player.x, player.z, -((yawDeg * Math.PI) / 180), vehicles, vehicle);
      if (showStats) {
        this.fps.textContent = Math.round(fps);
        this.pos.textContent = `${player.x.toFixed(0)} , ${player.z.toFixed(0)}`;
      }
    }
    if (vehicle) {
      this.vehHud.hidden = false;
      this._drawDash(vehicle);
      this.stamina.classList.remove('show');
    } else {
      this.vehHud.hidden = true;
      const st = ctx2.stamina ?? 1;
      this.stamina.classList.toggle('show', st < 0.995);
      this.staminaBar.style.width = (st * 100).toFixed(0) + '%';
      this.staminaBar.style.background = st < 0.25 ? '#ff5252' : '#3ddc84';
    }
  }
}
