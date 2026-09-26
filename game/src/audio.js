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
    switch (surface) {
      case 'grass': this.burst({ f: 900, q: 0.7, dur: 0.12, gain: 0.08 * k }); this.burst({ f: 3000, q: 1, dur: 0.06, gain: 0.03 * k, delay: 0.02 }); break;
      case 'gravel': for (let i = 0; i < 4; i++) this.burst({ f: 2200 + Math.random() * 2000, q: 2, dur: 0.05, gain: 0.07 * k, delay: i * 0.018 }); break;
      case 'tiles': this.burst({ f: 1900, q: 3, dur: 0.05, gain: 0.14 * k }); this.burst({ f: 300, q: 1, dur: 0.05, gain: 0.1 * k }); break;
      default: this.burst({ f: 1300, q: 1.2, dur: 0.07, gain: 0.12 * k }); this.burst({ f: 180, q: 0.8, dur: 0.06, gain: 0.12 * k });
    }
  }
  jump() { this.burst({ f: 600, q: 0.8, dur: 0.08, gain: 0.05 }); }
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
  update(dt, st) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    const now = this.ctx.currentTime;
    this.windFilter.frequency.setTargetAtTime(300 + 200 * Math.sin(this.t * 0.13) + 120 * Math.sin(this.t * 0.41), now, 0.5);
    this.windGain.gain.setTargetAtTime(0.04 + 0.025 * (0.5 + 0.5 * Math.sin(this.t * 0.07)) + (st.speed ? Math.min(0.15, st.speed * 0.004) : 0), now, 0.3);
    this.nextBird -= dt;
    if (this.nextBird <= 0) { this.chirp(Math.random() * 2 - 1); this.nextBird = 1.5 + Math.random() * 6; }
    const e = this.eng;
    if (st.driving) {
      const f = st.rpm / 60 * 2;
      e.o1.frequency.setTargetAtTime(f, now, 0.03);
      e.o2.frequency.setTargetAtTime(f * 0.5, now, 0.03);
      e.o3.frequency.setTargetAtTime(f * 2.02, now, 0.03);
      e.lp.frequency.setTargetAtTime(350 + st.rpm * 0.28 + st.throttle * 900, now, 0.05);
      e.out.gain.setTargetAtTime(0.06 + Math.abs(st.throttle) * 0.1 + st.rpm / 60000, now, 0.08);
      this.squeal.gain.setTargetAtTime(Math.max(0, Math.min(0.25, (Math.abs(st.slip) - 2.5) * 0.05)), now, 0.05);
      this.horn.gain.setTargetAtTime(st.horn ? 0.12 : 0, now, 0.01);
    } else {
      e.out.gain.setTargetAtTime(0, now, 0.2);
      this.squeal.gain.setTargetAtTime(0, now, 0.05);
      this.horn.gain.setTargetAtTime(0, now, 0.02);
    }
  }
}
