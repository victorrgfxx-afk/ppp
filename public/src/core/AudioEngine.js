/* Fully procedural audio — no sample files anywhere in this project.
   Engine note is a stack of saw harmonics at the firing frequency plus
   filtered noise; everything else is shaped noise or short oscillator hits. */
import { settings } from './Settings.js';

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;      // a touch of brown for body
    d[i] = white * 0.7 + last * 3.2;
  }
  return b;
}

export class AudioEngine {
  constructor() {
    this.ready = false;
    this.ctx = null;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2.5);

    this.master = ctx.createGain();
    this.master.gain.value = settings.get('volume') / 100;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);

    this._buildEngine();
    this._buildTyres();
    this._buildWind();
    this._buildAmbient();
    this.ready = true;
    settings.on((k, v) => { if (k === 'volume') this.master.gain.value = v / 100; });
  }

  _src(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = loop; s.start();
    return s;
  }

  /* ------------------------------- engine -------------------------------- */
  _buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 45;
    out.connect(lp).connect(hp).connect(this.master);

    this.engOscs = [];
    // firing order harmonics: the fundamental plus a few partials reads as 4-cyl
    for (const [mult, level, type] of [[1, 0.5, 'sawtooth'], [2, 0.32, 'sawtooth'],
                                       [0.5, 0.26, 'square'], [3, 0.14, 'sawtooth'], [4.5, 0.07, 'square']]) {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g).connect(out); o.start();
      this.engOscs.push({ o, g, mult });
    }
    const n = this._src();
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 340; nf.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.30;
    n.connect(nf).connect(ng).connect(out);
    this.engNoise = { nf, ng };
    this.engGain = out; this.engLP = lp;
  }

  /** @param {number} rpm  @param {number} load 0..1  @param {number} mix 0..1 */
  engine(rpm, load, mix) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const f = Math.max(18, (rpm / 60) * 2);            // 4-stroke, 4 cylinders
    for (const e of this.engOscs) {
      e.o.frequency.setTargetAtTime(f * e.mult, t, 0.035);
    }
    this.engLP.frequency.setTargetAtTime(420 + load * 2600 + rpm * 0.25, t, 0.05);
    this.engNoise.nf.frequency.setTargetAtTime(220 + rpm * 0.12, t, 0.06);
    this.engNoise.ng.gain.setTargetAtTime(0.14 + load * 0.34, t, 0.06);
    this.engGain.gain.setTargetAtTime(mix * (0.055 + load * 0.115), t, 0.045);
  }

  /* -------------------------------- tyres -------------------------------- */
  _buildTyres() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 1.4;
    this._src().connect(bp).connect(g).connect(this.master);
    this.skidGain = g; this.skidF = bp;

    const rg = ctx.createGain(); rg.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 480;
    this._src().connect(rf).connect(rg).connect(this.master);
    this.rollGain = rg; this.rollF = rf;
  }
  tyres(slip, speed, surface = 'gravel') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.skidGain.gain.setTargetAtTime(Math.min(0.24, slip * 0.28), t, 0.07);
    this.skidF.frequency.setTargetAtTime(surface === 'gravel' ? 1150 : 1900, t, 0.1);
    const v = Math.min(1, speed / 26);
    this.rollGain.gain.setTargetAtTime(v * (surface === 'gravel' ? 0.13 : 0.07), t, 0.09);
    this.rollF.frequency.setTargetAtTime(260 + v * 1500, t, 0.09);
  }

  /* -------------------------------- wind --------------------------------- */
  _buildWind() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    this._src().connect(f).connect(g).connect(this.master);
    this.windGain = g; this.windF = f;
  }
  wind(speed) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 34);
    this.windGain.gain.setTargetAtTime(v * v * 0.17, t, 0.15);
    this.windF.frequency.setTargetAtTime(340 + v * 1500, t, 0.15);
  }

  /* ------------------------------ ambience ------------------------------- */
  _buildAmbient() {
    const ctx = this.ctx;
    // distant plant hum from the industrial estate next door
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 51;
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
    hum.connect(hf).connect(hg).connect(this.master); hum.start();
    // leaf rustle
    const rg = ctx.createGain(); rg.gain.value = 0.02;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3400; rf.Q.value = 0.5;
    this._src().connect(rf).connect(rg).connect(this.master);
    this.rustle = rg;
    this._nextBird = 2 + Math.random() * 5;
  }
  ambient(dt, windStrength, isDay) {
    if (!this.ready) return;
    this.rustle.gain.setTargetAtTime(0.008 + windStrength * 0.045, this.ctx.currentTime, 0.4);
    this._nextBird -= dt;
    if (this._nextBird <= 0) {
      this._nextBird = isDay ? 3 + Math.random() * 9 : 22 + Math.random() * 40;
      if (isDay || Math.random() < 0.3) this.bird();
    }
  }
  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const base = 2100 + Math.random() * 1800;
    o.frequency.setValueAtTime(base, t);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.11;
      o.frequency.setValueAtTime(base * (0.85 + Math.random() * 0.4), s);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, s + 0.05);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.02, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.085);
    }
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + n * 0.12 + 0.2);
  }

  /* ------------------------------ one-shots ------------------------------ */
  footstep(surface = 'gravel', strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this._src(false);
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const cfg = {
      gravel:   { type: 'bandpass', freq: 2400, q: 0.7, vol: 0.075, dur: 0.12 },
      concrete: { type: 'bandpass', freq: 1300, q: 1.6, vol: 0.055, dur: 0.09 },
      asphalt:  { type: 'bandpass', freq: 1000, q: 1.4, vol: 0.05, dur: 0.09 },
      grass:    { type: 'lowpass',  freq: 900,  q: 0.6, vol: 0.045, dur: 0.14 },
    }[surface] || { type: 'bandpass', freq: 1800, q: 1, vol: 0.06, dur: 0.11 };
    f.type = cfg.type; f.frequency.value = cfg.freq * (0.85 + Math.random() * 0.3); f.Q.value = cfg.q;
    g.gain.setValueAtTime(cfg.vol * strength, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    s.connect(f).connect(g).connect(this.master);
    s.stop(t + cfg.dur + 0.02);
  }

  impact(force = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this._src(false);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, 0.16 + force * 0.34), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    s.connect(f).connect(g).connect(this.master);
    s.stop(t + 0.36);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.1 * force, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.3);
  }

  horn(on) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (on && !this._horn) {
      const g = ctx.createGain(); g.gain.value = 0.0;
      const a = ctx.createOscillator(); a.type = 'square'; a.frequency.value = 400;
      const b = ctx.createOscillator(); b.type = 'square'; b.frequency.value = 500;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      a.connect(f); b.connect(f); f.connect(g).connect(this.master);
      a.start(); b.start();
      g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.01);
      this._horn = { a, b, g };
    } else if (!on && this._horn) {
      const h = this._horn; this._horn = null;
      h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { h.a.stop(); h.b.stop(); }, 120);
    }
  }

  click(freq = 900, dur = 0.05, vol = 0.05) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  doorThud() { this.impact(0.25); this.click(220, 0.08, 0.04); }

  stopAll() {
    this.horn(false);
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.05);
    this.skidGain.gain.setTargetAtTime(0, t, 0.05);
    this.rollGain.gain.setTargetAtTime(0, t, 0.05);
    this.windGain.gain.setTargetAtTime(0, t, 0.05);
  }
}
