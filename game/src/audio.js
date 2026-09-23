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

    /* ---- Prahova: curgere peste prundis (doua benzi) ---- */
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = 0;
    this.riverGain.connect(this.bus);
    for (const [f, q, g] of [[720, 0.6, 1.0], [240, 0.8, 0.55], [2600, 1.2, 0.22]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      src.connect(bp).connect(gg).connect(this.riverGain);
      src.start(0, Math.random() * 2);
    }
    const rl = ctx.createOscillator(); rl.frequency.value = 0.11;
    const rlg = ctx.createGain(); rlg.gain.value = 0.18;
    rl.connect(rlg).connect(this.riverGain.gain); rl.start();
    this.riverLevel = 0;

    this.ready = true;
    this._nextBark = ctx.currentTime + 12 + Math.random() * 30;
    this._nextTrain = ctx.currentTime + 45 + Math.random() * 60;
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
    const k = hard ? 1.8 : 1;
    if (surface === 'grass') this._burst(2100 + Math.random() * 900, 1.1, 0.10, 0.085 * k);
    else if (surface === 'gravel') {
      // pietris: scrasnet in doua reprize
      this._burst(1900 + Math.random() * 900, 1.4, 0.13, 0.11 * k);
      setTimeout(() => this._burst(2800 + Math.random() * 900, 2.0, 0.08, 0.07 * k), 35);
    } else if (surface === 'water') {
      this._burst(520 + Math.random() * 250, 0.9, 0.32, 0.16 * k, 'lowpass');
      this._burst(1600 + Math.random() * 900, 1.8, 0.2, 0.06 * k);
    } else {
      this._burst(320 + Math.random() * 130, 2.4, 0.075, 0.10 * k);
      this._burst(3600 + Math.random() * 1400, 3.0, 0.045, 0.045 * k);
    }
  }

  /** 0..1 dupa distanta pana la firul apei. */
  setRiver(level) {
    this.riverLevel = level;
  }

  /** Un tren care trece prin gara Campina: huruit + bataia rotilor la joante. */
  train(distance = 150) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = Math.max(0.12, Math.min(1, 1 - distance / 450)) * 0.22;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 9);
    out.gain.setValueAtTime(vol, t + 19);
    out.gain.linearRampToValueAtTime(0, t + 30);
    if (pan) {
      pan.pan.setValueAtTime(-0.8, t);
      pan.pan.linearRampToValueAtTime(0.8, t + 30);
      out.connect(pan).connect(this.bus);
    } else out.connect(this.bus);
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    src.connect(lp).connect(out);
    src.start(t); src.stop(t + 31);
    // joantele: perechi de batai, ritmul urmeaza viteza trenului
    let tt = t + 6;
    while (tt < t + 25) {
      for (const d of [0, 0.11]) {
        const s2 = ctx.createBufferSource(); s2.buffer = this.noise;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, tt + d);
        g.gain.linearRampToValueAtTime(0.6, tt + d + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, tt + d + 0.07);
        s2.connect(bp).connect(g).connect(out);
        s2.start(tt + d, Math.random() * 2); s2.stop(tt + d + 0.1);
      }
      tt += 0.62;
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

    this.cricketGain.gain.value = 0.010 * (state.outdoors ? 1 : 0.4) * (1 - this.riverLevel * 0.6);
    this.riverGain.gain.setTargetAtTime(0.16 * this.riverLevel * this.riverLevel, t, 0.4);
    if (t > this._nextTrain) {
      this._nextTrain = t + 120 + Math.random() * 180;
      this.train(state.railDist || 200);
    }

    if (t > this._nextBark) {
      this._nextBark = t + 20 + Math.random() * 55;
      this.bark();
      if (Math.random() < 0.6) setTimeout(() => this.bark(), 320);
      if (Math.random() < 0.35) setTimeout(() => this.bark(), 700);
    }

  }
}
