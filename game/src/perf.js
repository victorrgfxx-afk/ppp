import * as THREE from 'three';

// Frame meter (G): frames per second, the CPU time of a frame (game, three.js and the WebGL calls), the GPU time of
// a frame where the browser offers timer queries (EXT_disjoint_timer_query_webgl2: Chrome / Edge on desktop), the
// draw calls and triangles, and the size the frame is drawn at. Off, it shows the plain frame rate as before.
export class PerfMeter {
  constructor(renderer, el) {
    this.r = renderer; this.el = el; this.gl = renderer.getContext();
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.on = false;
    this.free = []; this.pending = [];           // timer queries: reused, and those waiting for the GPU's answer
    this.q = null;
    renderer.info.autoReset = false;             // the counts of the whole frame (all passes), not of its last pass
    this.reset();
  }
  reset() { this.acc = { t: 0, n: 0, f: 0, cpu: 0, cpuMax: 0, gpu: 0, gpuN: 0, calls: 0, tris: 0 }; }
  begin() {
    this.t0 = performance.now();
    if (this.last !== undefined) { this.acc.t += (this.t0 - this.last) / 1000; this.acc.n++; }   // (the real interval, not the game's clamped step)
    this.last = this.t0;
    this.r.info.reset();
    if (this.on && this.ext && !this.q) {
      this.q = this.free.pop() ?? this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.q);
    }
  }
  end() {
    const gl = this.gl, a = this.acc, cpu = performance.now() - this.t0;
    if (this.q) { gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.q); this.q = null; }
    // the GPU answers a few frames later; a disjoint event (power state, another app) spoils the pending ones
    if (this.pending.length) {
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = this.pending.shift();
        if (!disjoint) { a.gpu += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; a.gpuN++; }
        this.free.push(q);
      }
      if (disjoint) { this.free.push(...this.pending); this.pending.length = 0; }
    }
    a.f++; a.cpu += cpu; a.cpuMax = Math.max(a.cpuMax, cpu);
    a.calls += this.r.info.render.calls; a.tris += this.r.info.render.triangles;
    if (a.t < 0.5 || !a.n) return;
    const fps = Math.round(a.n / a.t);
    if (!this.on) this.el.textContent = fps + ' FPS';
    else {
      const s = this.r.getDrawingBufferSize(this.size ??= new THREE.Vector2());
      const gpu = !this.ext ? 'GPU n/d' : a.gpuN ? `GPU ${(a.gpu / a.gpuN).toFixed(1)} ms` : 'GPU …';
      this.el.textContent = `${fps} FPS · cadru ${(1000 * a.t / a.n).toFixed(1)} ms\nCPU ${(a.cpu / a.f).toFixed(1)} ms (max ${a.cpuMax.toFixed(1)}) · ${gpu}\n` +
        `${Math.round(a.calls / a.f)} desenări · ${(a.tris / a.f / 1e6).toFixed(1)} M triunghiuri\n${s.x}×${s.y} px`;
    }
    this.reset();
  }
  set(on) {
    this.on = on;
    this.el.classList.toggle('detail', on);
    if (!on && this.q) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.q); this.q = null; }
  }
}
