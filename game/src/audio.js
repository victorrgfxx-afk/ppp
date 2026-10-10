// Fully procedural audio (no sound files): wind, birds, footsteps per surface,
// engine with rpm/throttle, tyre squeal, horn, impacts, doors.
export class Audio {
  constructor() {
    this.ctx = null; this.muted = false;
    this.nextBird = 2; this.t = 0;
  }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3; }
    // wind bed
    const wn = ctx.createBufferSource(); wn.buffer = this.noise; wn.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    wn.connect(wf).connect(this.windGain).connect(this.master); wn.start();
    this.windFilter = wf;
    // rain: a hiss (drops on asphalt and leaves) over a soft roar, silent until it rains
    const ra = ctx.createBufferSource(); ra.buffer = this.noise; ra.loop = true;
    const rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 900;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    const rb = ctx.createBufferSource(); rb.buffer = this.noise; rb.loop = true; rb.playbackRate.value = 0.7;
    const rbf = ctx.createBiquadFilter(); rbf.type = 'bandpass'; rbf.frequency.value = 420; rbf.Q.value = 0.6;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    ra.connect(rh).connect(rl).connect(this.rainGain); rb.connect(rbf).connect(this.rainGain);
    this.rainGain.connect(this.master); ra.start(); rb.start();
    // night storm: a low uneasy drone (two detuned tones and a hollow wind), silent until then
    this.drone = ctx.createGain(); this.drone.gain.value = 0; this.drone.connect(this.master);
    for (const f of [41.2, 43.6, 61.7]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.35; o.connect(g).connect(this.drone); o.start(); }
    const hw = ctx.createBufferSource(); hw.buffer = this.noise; hw.loop = true; hw.playbackRate.value = 0.35;
    const hwf = ctx.createBiquadFilter(); hwf.type = 'bandpass'; hwf.frequency.value = 260; hwf.Q.value = 4;
    const hwg = ctx.createGain(); hwg.gain.value = 0.6; hw.connect(hwf).connect(hwg).connect(this.drone); hw.start();
    this.howlF = hwf;
    // distant village rumble
    const rn = ctx.createBufferSource(); rn.buffer = this.noise; rn.loop = true; rn.playbackRate.value = 0.5;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 120;
    const rg = ctx.createGain(); rg.gain.value = 0.03;
    rn.connect(rf).connect(rg).connect(this.master); rn.start();
    // engine
    this.eng = {};
    const e = this.eng;
    e.o1 = ctx.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = ctx.createOscillator(); e.o2.type = 'square';
    e.o3 = ctx.createOscillator(); e.o3.type = 'triangle';
    e.g1 = ctx.createGain(); e.g1.gain.value = 0.5; e.g2 = ctx.createGain(); e.g2.gain.value = 0.25; e.g3 = ctx.createGain(); e.g3.gain.value = 0.4;
    e.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.5); }
    e.shaper.curve = curve;
    e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 500; e.lp.Q.value = 2;
    e.out = ctx.createGain(); e.out.gain.value = 0;
    e.o1.connect(e.g1).connect(e.shaper); e.o2.connect(e.g2).connect(e.shaper); e.o3.connect(e.g3).connect(e.shaper);
    e.shaper.connect(e.lp).connect(e.out).connect(this.master);
    e.o1.start(); e.o2.start(); e.o3.start();
    // tyre squeal
    const sq = ctx.createBufferSource(); sq.buffer = this.noise; sq.loop = true;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2400; sf.Q.value = 6;
    this.squeal = ctx.createGain(); this.squeal.gain.value = 0;
    sq.connect(sf).connect(this.squeal).connect(this.master); sq.start();
    // horn
    this.horn = ctx.createGain(); this.horn.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const f of [415, 510]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.horn).connect(this.master);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; }
  burst({ f = 1000, q = 1, dur = 0.07, gain = 0.2, type = 'bandpass', delay = 0, rate = 1 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate;
    const f1 = ctx.createBiquadFilter(); f1.type = type; f1.frequency.value = f; f1.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f1).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  step(surface, intensity = 0.5) {
    const k = 0.5 + intensity * 0.6;
    if ((this.snowCover ?? 0) > 0.45 && surface !== 'tiles') surface = 'snow';     // (the porch tiles stay under the roof)
    switch (surface) {
      // fresh snow: a muffled thud and the squeak-crunch of the crystals packing under the sole
      case 'snow': this.burst({ f: 220, q: 0.8, dur: 0.09, gain: 0.08 * k }); for (let i = 0; i < 5; i++) this.burst({ f: 700 + Math.random() * 1300, q: 3, dur: 0.035, gain: 0.05 * k, delay: 0.015 + i * 0.022 }); break;
      case 'grass': this.burst({ f: 900, q: 0.7, dur: 0.12, gain: 0.08 * k }); this.burst({ f: 3000, q: 1, dur: 0.06, gain: 0.03 * k, delay: 0.02 }); break;
      case 'gravel': for (let i = 0; i < 4; i++) this.burst({ f: 2200 + Math.random() * 2000, q: 2, dur: 0.05, gain: 0.07 * k, delay: i * 0.018 }); break;
      case 'tiles': this.burst({ f: 1900, q: 3, dur: 0.05, gain: 0.14 * k }); this.burst({ f: 300, q: 1, dur: 0.05, gain: 0.1 * k }); break;
      default: this.burst({ f: 1300, q: 1.2, dur: 0.07, gain: 0.12 * k }); this.burst({ f: 180, q: 0.8, dur: 0.06, gain: 0.12 * k });
    }
  }
  jump() { this.burst({ f: 600, q: 0.8, dur: 0.08, gain: 0.05 }); }
  // snow sliding off branches: a soft thump and the hiss of the powder (a whole tree's load: longer and heavier)
  snowDrop(k = 1, big = false) {
    if (!this.ctx || k < 0.02) return;
    this.burst({ f: 150, q: 0.7, dur: big ? 0.55 : 0.28, gain: (big ? 0.45 : 0.2) * k, type: 'lowpass' });
    for (let i = 0; i < (big ? 10 : 4); i++) this.burst({ f: 2800 + Math.random() * 4500, q: 0.6, dur: 0.25 + Math.random() * 0.45, gain: 0.03 * k, delay: 0.04 + i * 0.07 + Math.random() * 0.05 });
  }
  land(surface) { this.step(surface, 1.2); this.burst({ f: 140, q: 0.7, dur: 0.12, gain: 0.2 }); }
  door() { this.burst({ f: 180, q: 0.8, dur: 0.18, gain: 0.35 }); this.burst({ f: 900, q: 2, dur: 0.05, gain: 0.1, delay: 0.02 }); }
  crash(v) { const g = Math.min(0.9, v * 0.08); this.burst({ f: 250, q: 0.5, dur: 0.4, gain: g, type: 'lowpass' }); this.burst({ f: 3200, q: 1, dur: 0.25, gain: g * 0.4 }); }
  chirp(pan) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain(); out.gain.value = 0.035 + Math.random() * 0.04;
    if (p) { p.pan.value = pan; out.connect(p).connect(this.master); } else out.connect(this.master);
    const n = 2 + Math.floor(Math.random() * 5);
    const base = 2800 + Math.random() * 2500;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), t + 0.06);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
    }
  }
  // thunder: a crack (close strikes) and a long rolling rumble, after the sound has travelled `delay` s
  thunder(delay, km) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, near = Math.max(0, 1 - km / 3);
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = 0.4 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(300 + 1500 * near, t); f.frequency.exponentialRampToValueAtTime(70, t + 5.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((0.5 + 0.9 * near), t + 0.05 + 0.4 * (1 - near));
    for (let k = 1; k < 6; k++) g.gain.linearRampToValueAtTime((0.5 + 0.7 * near) * Math.random() * (1 - k / 7), t + 0.4 + k * 0.7);
    g.gain.linearRampToValueAtTime(0, t + 6.5);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 7);
  }
  // a bear: a low growl (rough, pulsing) or a roar (louder, opening up); quieter with distance
  bear(roar, dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, len = roar ? 2.2 : 1.6, k = Math.max(0.08, Math.min(1, 12 / Math.max(dist, 1)));
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = roar ? 0.55 : 0.4;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 3; f1.frequency.setValueAtTime(roar ? 220 : 120, t);
    if (roar) f1.frequency.linearRampToValueAtTime(420, t + 0.5);
    f1.frequency.linearRampToValueAtTime(roar ? 180 : 95, t + len);
    const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = roar ? 700 : 380; f2.gain.value = 8; f2.Q.value = 2;
    const am = ctx.createGain(); am.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = roar ? 34 : 26; const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg).connect(am.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((roar ? 2.4 : 1.4) * k, t + 0.15); g.gain.setValueAtTime((roar ? 2.0 : 1.1) * k, t + len * 0.7); g.gain.linearRampToValueAtTime(0, t + len);
    s.connect(f1).connect(f2).connect(am).connect(g).connect(this.master);
    s.start(t); s.stop(t + len + 0.1); lfo.start(t); lfo.stop(t + len + 0.1);
  }
  // the forest scene (forest.js): the creature's hoarse shriek (a rasping cry that rises and breaks), a body hitting
  // the ground, dry leaves thrown about; k: how loud where you are (1 close by)
  shriek(k = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, len = 0.9 + Math.random() * 0.5, top = 560 + Math.random() * 220;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55 * k, t + 0.05); g.gain.setValueAtTime(0.5 * k, t + len * 0.6); g.gain.linearRampToValueAtTime(0, t + len);
    g.connect(this.master);
    // the voice: a sawtooth sliding up and down, roughened by a fast flutter, through two formants
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(top, t + 0.22); o.frequency.exponentialRampToValueAtTime(top * 0.62, t + len);
    const am = ctx.createGain(); am.gain.value = 0.55;
    const fl = ctx.createOscillator(); fl.frequency.value = 31 + Math.random() * 12; const flg = ctx.createGain(); flg.gain.value = 0.45; fl.connect(flg).connect(am.gain);
    for (const [f, q, k] of [[1150, 3, 0.7], [2700, 5, 0.45]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const w = ctx.createGain(); w.gain.value = k; o.connect(am); am.connect(b).connect(w).connect(g); }
    // and the breath through the throat
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; n.playbackRate.value = 1.3;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.setValueAtTime(1600, t); nf.frequency.linearRampToValueAtTime(2400, t + len); nf.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(nf).connect(ng).connect(g);
    o.start(t); fl.start(t); n.start(t); o.stop(t + len + 0.05); fl.stop(t + len + 0.05); n.stop(t + len + 0.05);
  }
  thud(k = 1) {
    this.burst({ f: 110, q: 0.7, dur: 0.35, gain: 0.6 * k, type: 'lowpass' });
    this.burst({ f: 260, q: 0.8, dur: 0.12, gain: 0.25 * k });
    this.rustle(5, k);
  }
  rustle(n = 4, k = 1) { for (let i = 0; i < n; i++) this.burst({ f: 2600 + Math.random() * 3000, q: 0.9, dur: 0.07 + Math.random() * 0.1, gain: 0.08 * k, delay: i * 0.035 + Math.random() * 0.03 }); }
  hit() {                                                     // the bear's blow: a thud
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  update(dt, st) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    const now = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(300 + 200 * Math.sin(this.t * 0.13) + 120 * Math.sin(this.t * 0.41), now, 0.5);
    this.windGain.gain.setTargetAtTime(0.04 + 0.025 * (0.5 + 0.5 * Math.sin(this.t * 0.07)) + (st.speed ? Math.min(0.15, st.speed * 0.004) : 0), now, 0.3);
    const rain = st.rain ?? 0;
    this.snowCover = st.snowCover ?? 0;
    this.drone.gain.setTargetAtTime(0.09 * (st.horror ?? 0), now, 1.5);
    this.howlF.frequency.setTargetAtTime(220 + 120 * Math.sin(this.t * 0.17) + 60 * Math.sin(this.t * 0.53), now, 0.8);
    this.rainGain.gain.setTargetAtTime(0.34 * rain * (0.55 + 0.45 * (st.rainOpen ?? 1)), now, 0.6);
    this.nextBird -= dt;
    if (this.nextBird <= 0) { if (rain < 0.2 && !(st.snow > 0.2) && !(st.night > 0.5)) this.chirp(Math.random() * 2 - 1); this.nextBird = (st.snowCover > 0.5 ? 6 : 1.5) + Math.random() * 6; }   // (no birdsong in a downpour, while it snows or at night; little in winter)
    const e = this.eng;
    if (st.driving) {
      const f = st.rpm / 60 * 2;
      e.o1.frequency.setTargetAtTime(f, now, 0.03);
      e.o2.frequency.setTargetAtTime(f * 0.5, now, 0.03);
      e.o3.frequency.setTargetAtTime(f * 2.02, now, 0.03);
      e.lp.frequency.setTargetAtTime(350 + st.rpm * 0.28 + Math.abs(st.throttle) * 900, now, 0.05);   // (braking / reverse: the pedal is -1; a negative cutoff silenced the engine)
      e.out.gain.setTargetAtTime(0.06 + Math.abs(st.throttle) * 0.1 + st.rpm / 60000, now, 0.08);
      this.squeal.gain.setTargetAtTime(Math.max(0, Math.min(0.25, (Math.abs(st.slip) - 2.5) * 0.05)) * (1 - 0.85 * this.snowCover), now, 0.05);   // (no squeal on snow)
      this.horn.gain.setTargetAtTime(st.horn ? 0.12 : 0, now, 0.01);
    } else {
      e.out.gain.setTargetAtTime(0, now, 0.2);
      this.squeal.gain.setTargetAtTime(0, now, 0.05);
      this.horn.gain.setTargetAtTime(0, now, 0.02);
    }
  }
}
