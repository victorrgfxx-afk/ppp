/* Top-down minimap drawn from the site plan data, rotated to the player. */
import * as PLAN from '../world/SitePlan.js';

const COL = {
  gravel: '#6d6558', concrete: '#8b8b86', asphalt: '#3a3c3e',
  grass: '#4a6136', dirt: '#6a5844',
};

export class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 3.1;                 // pixels per metre
    this.zoom = 1;
  }

  draw(px, pz, yaw, vehicles, playerInCar) {
    const ctx = this.ctx;
    const W = this.cv.width, H = this.cv.height;
    const S = this.scale * this.zoom;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#20252b';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);                  // north-up becomes player-up
    ctx.scale(S, S);
    ctx.translate(-px, -pz);

    for (const s of PLAN.SURFACES) {
      ctx.fillStyle = COL[s.tex] || '#555';
      ctx.fillRect(s.x - s.w / 2, s.z - s.d / 2, s.w, s.d);
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#2c3138';
    for (const f of PLAN.FENCES) {
      ctx.beginPath();
      f.pts.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z));
      ctx.stroke();
    }
    for (const [, b] of Object.entries(PLAN.BUILDINGS)) {
      const w = b.w || 6.06, d = b.d || 2.44;
      ctx.save();
      ctx.translate(b.x, b.z);
      ctx.rotate(b.rotY || 0);
      ctx.fillStyle = b.type === 'shed' ? '#3c4a44' : b.type === 'house' ? '#7a4136' : '#c9ccd0';
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.3;
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.restore();
    }
    for (const t of PLAN.TREES) {
      ctx.fillStyle = 'rgba(58,92,42,.85)';
      ctx.beginPath(); ctx.arc(t.x, t.z, 1.1 * t.scale, 0, 7); ctx.fill();
    }
    for (const v of vehicles) {
      const d = v.dims;
      ctx.save();
      ctx.translate(v.mesh.position.x, v.mesh.position.z);
      ctx.rotate(-(v.mesh.rotation.y - Math.PI / 2));
      ctx.fillStyle = v === playerInCar ? '#ffc400' : '#d8dde2';
      ctx.fillRect(-(d.len || 4) / 2, -(d.width || 1.8) / 2, d.len || 4, d.width || 1.8);
      ctx.restore();
    }
    ctx.restore();

    // player arrow, always centred and pointing up
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7.5, 9); ctx.lineTo(0, 4.5); ctx.lineTo(-7.5, 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // north pip
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw);
    ctx.fillStyle = '#ff5252';
    ctx.beginPath(); ctx.arc(0, -H / 2 + 12, 4, 0, 7); ctx.fill();
    ctx.restore();
  }
}
