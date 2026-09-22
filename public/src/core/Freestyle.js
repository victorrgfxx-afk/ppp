/* Freestyle scoring — the GTA-ish reason to keep driving around a yard.
   Points for holding a drift, for airtime, for near misses at speed and for
   sustained speed; the multiplier climbs while you keep it going and the run
   banks when you stop. */

const LABELS = {
  drift: 'DERAPAJ', air: 'ZBOR', nearmiss: 'LA MILIMETRU',
  speed: 'VITEZĂ', flip: 'SALT', combo: 'COMBO',
};

export class Freestyle {
  constructor(hud) {
    this.hud = hud;
    this.total = 0;
    this.best = 0;
    this.run = 0;
    this.multiplier = 1;
    this.idle = 0;
    this.airTime = 0;
    this.driftTime = 0;
    this.lastEvent = '';
    try { this.best = +(localStorage.getItem('sa-freestyle-best') || 0); } catch { /* ignore */ }
  }

  _award(kind, points) {
    this.run += points * this.multiplier;
    this.idle = 0;
    this.multiplier = Math.min(8, this.multiplier + 0.08);
    this.lastEvent = LABELS[kind] || kind;
  }

  /** @param {object} v the vehicle being driven, or null on foot */
  update(dt, v, nearMiss) {
    if (!v) { this.bank(); return; }
    const speed = Math.abs(v.speed);
    const kmh = speed * 3.6;

    /* drift: lateral velocity while the wheels are down and moving fast */
    const lateral = Math.abs(v.body.velocity.x * Math.sin(-v.mesh.rotation.y)
                           + v.body.velocity.z * Math.cos(-v.mesh.rotation.y));
    const sideSlip = v.onGround && kmh > 22 ? Math.min(1, (v.slip * 0.7 + Math.min(1, lateral / 6) * 0.6)) : 0;
    if (sideSlip > 0.25) {
      this.driftTime += dt;
      this._award('drift', dt * 90 * sideSlip);
    } else if (this.driftTime > 0) {
      if (this.driftTime > 1.2) this._award('combo', this.driftTime * 40);
      this.driftTime = 0;
    }

    /* airtime */
    if (!v.onGround && v.body.position.y > 0.2) {
      this.airTime += dt;
      this._award('air', dt * 160);
    } else if (this.airTime > 0) {
      if (this.airTime > 0.45) this._award('flip', this.airTime * 320);
      this.airTime = 0;
    }

    /* sustained speed */
    if (kmh > 70) this._award('speed', dt * (kmh - 70) * 1.6);

    /* near miss, fed by the caller */
    if (nearMiss) this._award('nearmiss', 220);

    /* decay */
    this.idle += dt;
    if (this.idle > 1.8) {
      this.multiplier = Math.max(1, this.multiplier - dt * 1.4);
      if (this.idle > 3.2) this.bank();
    }
  }

  bank() {
    if (this.run < 50) { this.run = 0; this.multiplier = 1; return; }
    this.total += Math.round(this.run);
    const banked = Math.round(this.run);
    this.run = 0;
    this.multiplier = 1;
    if (this.total > this.best) {
      this.best = this.total;
      try { localStorage.setItem('sa-freestyle-best', String(this.best)); } catch { /* ignore */ }
    }
    this.hud?.toast(`+${banked.toLocaleString('ro-RO')} puncte · total ${this.total.toLocaleString('ro-RO')}`);
  }

  reset() { this.run = 0; this.total = 0; this.multiplier = 1; }

  get display() {
    return {
      run: Math.round(this.run),
      total: this.total,
      best: this.best,
      mult: this.multiplier,
      label: this.lastEvent,
      active: this.run > 0,
    };
  }
}
