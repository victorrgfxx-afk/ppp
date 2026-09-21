/**
 * Sunet procedural (WebAudio): ambianta de noapte - vant filtrat, greieri si
 * cate un latrat departat - plus pasi al caror timbru depinde de suprafata
 * (asfalt sau iarba). Niciun fisier audio: totul e sintetizat.
 */

function noiseBuffer(ctx, seconds = 2) {
  const n = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;       // usor "pink"
    d[i] = last * 3.2 + white * 0.35;
  }
  return buf;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2.5);

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(this.master);
    this.bus = comp;

    /* ---- ambianta: vant ---- */
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.noise;
    this.windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 340;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.045;
    this.windSrc.connect(windLp).connect(this.windGain).connect(this.bus);
    this.windSrc.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();

    /* ---- greieri ---- */
    this.cricketSrc = ctx.createBufferSource();
    this.cricketSrc.buffer = this.noise;
    this.cricketSrc.loop = true;
    const cbp = ctx.createBiquadFilter();
    cbp.type = 'bandpass';
    cbp.frequency.value = 4600;
    cbp.Q.value = 22;
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0.0;
    this.cricketSrc.connect(cbp).connect(this.cricketGain).connect(this.bus);
    this.cricketSrc.start();
    const trill = ctx.createOscillator();
    trill.type = 'square';
    trill.frequency.value = 14;
    const trillGain = ctx.createGain();
    trillGain.gain.value = 0.011;
    trill.connect(trillGain).connect(this.cricketGain.gain);
    trill.start();

    this.ready = true;
    this._nextBark = ctx.currentTime + 12 + Math.random() * 30;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  _burst(freq, Q, dur, gain, type = 'bandpass') {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  footstep(surface = 'asphalt', hard = false) {
    if (!this.ready) return;
    if (surface === 'grass') this._burst(2100 + Math.random() * 900, 1.1, 0.10, hard ? 0.16 : 0.085);
    else {
      this._burst(320 + Math.random() * 130, 2.4, 0.075, hard ? 0.20 : 0.10);
      this._burst(3600 + Math.random() * 1400, 3.0, 0.045, hard ? 0.09 : 0.045);
    }
  }

  bark() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = 3;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    o.connect(f).connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.3);
  }

  update(dt, state) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    this.cricketGain.gain.value = 0.010 * (state.outdoors ? 1 : 0.4);

    if (t > this._nextBark) {
      this._nextBark = t + 20 + Math.random() * 55;
      this.bark();
      if (Math.random() < 0.6) setTimeout(() => this.bark(), 320);
      if (Math.random() < 0.35) setTimeout(() => this.bark(), 700);
    }

  }
}
