import { W } from './config.js';

// GTA-style round minimap (rotates with the view), prompts, speedometer.
export class HUD {
  constructor(world, houses, opts = {}) {
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
    if (opts.geo) { this.geoMap(opts.geo, opts.ortho, opts.orthoW); return; }
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
  // GTA-style map of the real area: Sentinel-2 ground, water, OSM roads, rails and buildings.
  // Two pre-rendered sheets: a sharp one around the street (+-3 km) and one for the whole map (+-8 km).
  geoMap(G, orthoImg, orthoWImg) {
    this.northRot = Math.PI - G.meta.origin.bearing * Math.PI / 180;   // real north in the game frame
    const sheet = (ext, S, img) => {
      const c = document.createElement('canvas');
      c.width = c.height = Math.round(2 * ext * S);
      const g = c.getContext('2d');
      g.filter = 'saturate(0.55) brightness(0.62) contrast(1.1)';
      if (img) g.drawImage(img, 0, 0, c.width, c.height);
      g.filter = 'none';
      const X = (x) => (x + ext) * S;
      g.fillStyle = '#3f7fc4';
      const cells = (list, e, st) => { for (const [i, j] of list) g.fillRect(X(-e + i * st) - 0.3, X(-e + j * st) - 0.3, st * S + 0.6, st * S + 0.6); };
      if (G.W && G.water2) cells(G.water2, G.W.ext, G.W.step);
      cells(G.water, G.ext, G.step);
      const inside = (flat) => { for (let i = 0; i < flat.length; i += 2) if (Math.abs(flat[i]) < ext + 50 && Math.abs(flat[i + 1]) < ext + 50) return true; return false; };
      const line = (flat, w, color, dash = null) => {
        if (!inside(flat)) return;
        g.strokeStyle = color; g.lineWidth = Math.max(0.8, w * S); g.setLineDash(dash || []);
        g.beginPath();
        for (let i = 0; i < flat.length; i += 2) { const px = X(flat[i]), pz = X(flat[i + 1]); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }
        g.stroke();
      };
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const r of G.rails) line(r.p, 2.2, '#5a5550', [3, 2]);
      const major = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary']);
      for (const r of G.roads) if (!major.has(r.c)) line(r.p, Math.max(2.5, r.w + 1), r.s === 'asphalt' ? '#b9b7b1' : '#a89a7e');
      for (const r of G.roads) if (major.has(r.c)) line(r.p, r.w + 2, r.c.startsWith('trunk') ? '#e8b04a' : '#f2f0ea');
      g.setLineDash([]);
      g.fillStyle = '#d9cdb8'; g.strokeStyle = 'rgba(40,35,30,0.6)'; g.lineWidth = 0.6;
      for (const b of G.buildings) {
        if (Math.abs(b.p[0]) > ext + 30 || Math.abs(b.p[1]) > ext + 30) continue;
        g.beginPath();
        for (let i = 0; i < b.p.length; i += 2) { const px = X(b.p[i]), pz = X(b.p[i + 1]); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }
        g.closePath(); g.fill(); if (S > 0.3) g.stroke();
      }
      return { c, S, X0: -ext, Z0: -ext, ext };
    };
    this.sheets = [sheet(G.ext, Math.min(0.6, 1200 / G.ext), orthoImg)];
    if (G.W) this.sheets.push(sheet(G.W.ext, Math.min(0.6, 1600 / G.W.ext), orthoWImg || orthoImg));
    this.useSheet(this.sheets[0]);
  }
  useSheet(s) { this.sheet = s; this.static = s.c; this.S = s.S; this.X0 = s.X0; this.Z0 = s.Z0; }
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
    if (this.sheets && this.sheets.length > 1) {
      const inNear = Math.max(Math.abs(st.x), Math.abs(st.z)) < this.sheets[0].ext - 400;
      const want = this.sheets[inNear ? 0 : 1];
      if (want !== this.sheet) this.useSheet(want);
    }
    const g = this.ctx, w = this.map.width, h = this.map.height, S = this.S;
    const zoom = (st.driving ? 1.1 : 1.8) * (this.S < 1 ? 1.32 / this.S : 1);
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
    g.translate(w / 2, h / 2); g.rotate(st.yaw + (this.northRot || 0));
    g.fillStyle = '#fff'; g.font = 'bold 13px system-ui'; g.textAlign = 'center';
    g.fillText('N', 0, -h / 2 + 16);
    g.restore();
  }
}
