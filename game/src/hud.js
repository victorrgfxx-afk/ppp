import { W } from './config.js';

// GTA-style round minimap (rotates with the view), prompts, speedometer.
export class HUD {
  constructor(world, houses) {
    this.el = {
      prompt: document.getElementById('prompt'),
      speed: document.getElementById('speed'),
      speedVal: document.getElementById('speedVal'),
      gear: document.getElementById('gear'),
      carName: document.getElementById('carName'),
      fps: document.getElementById('fps'),
      toast: document.getElementById('toast'),
      loc: document.getElementById('loc'),
    };
    this.map = document.getElementById('minimap');
    this.ctx = this.map.getContext('2d');
    this.fpsAcc = 0; this.fpsN = 0; this.toastT = 0;
    // pre-render the static map (1 px = 0.5 m)
    const S = 2, X0 = -70, X1 = 70, Z0 = -270, Z1 = 200;
    this.S = S; this.X0 = X0; this.Z0 = Z0;
    const c = document.createElement('canvas');
    c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
    const g = c.getContext('2d');
    g.fillStyle = '#56643f'; g.fillRect(0, 0, c.width, c.height);
    const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect((x0 - X0) * S, (z0 - Z0) * S, (x1 - x0) * S, (z1 - z0) * S); };
    R(-W.ROAD_HALF, Z0, W.ROAD_HALF, Z1, '#8d8f91');
    R(W.ROAD_HALF, Z0, W.CURB_X1, Z1, '#b3b1ab');
    for (const b of world.all) {
      const col = b.tag === 'house' ? '#d9cdb8' : b.tag === 'fence' || b.tag === 'gate' ? '#3a3a35' : b.tag === 'shed' ? '#9b7b61' : null;
      if (!col) continue;
      g.save();
      g.translate((b.x - X0) * S, (b.z - Z0) * S);
      g.rotate(-b.rot);
      g.fillStyle = col;
      g.fillRect(-b.hw * S, -b.hd * S, b.hw * 2 * S, b.hd * 2 * S);
      g.restore();
    }
    this.static = c;
    void houses;
  }
  toast(msg, t = 2.5) { this.el.toast.textContent = msg; this.el.toast.classList.add('on'); this.toastT = t; }
  update(dt, st) {
    // fps
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.el.fps.textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsN = 0; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    this.el.prompt.textContent = st.prompt || '';
    this.el.prompt.classList.toggle('on', !!st.prompt);
    this.el.speed.classList.toggle('on', !!st.driving);
    if (st.driving) {
      this.el.speedVal.textContent = Math.round(Math.abs(st.kmh));
      this.el.gear.textContent = st.kmh < -1 ? 'R' : st.gear;
      this.el.carName.textContent = st.carName;
    }
    this.el.loc.textContent = st.location;
    // minimap
    const g = this.ctx, w = this.map.width, h = this.map.height, S = this.S;
    const zoom = st.driving ? 1.1 : 1.8;
    g.save();
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#44503a'; g.fillRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    g.rotate(st.yaw);
    g.scale(zoom, zoom);
    g.translate(-(st.x - this.X0) * S, -(st.z - this.Z0) * S);
    g.drawImage(this.static, 0, 0);
    for (const c of st.cars) {
      g.save();
      g.translate((c.x - this.X0) * S, (c.z - this.Z0) * S);
      g.rotate(-c.h);
      g.fillStyle = c.active ? '#ffd23f' : '#5fa8ff';
      g.fillRect(-0.9 * S, -2.2 * S, 1.8 * S, 4.4 * S);
      g.restore();
    }
    g.restore();
    // player arrow
    g.save();
    g.translate(w / 2, h / 2);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.stroke(); g.fill();
    g.restore();
    // north marker
    g.save();
    g.translate(w / 2, h / 2); g.rotate(st.yaw);
    g.fillStyle = '#fff'; g.font = 'bold 13px system-ui'; g.textAlign = 'center';
    g.fillText('N', 0, -h / 2 + 16);
    g.restore();
  }
}
