/* Renderer, camera and the adaptive-resolution controller. */
import * as THREE from 'three';
import { PostChain } from '../gfx/Post.js';
import { settings, QUALITY_PRESETS, detectQuality, Device } from './Settings.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;

    const ctxAttribs = { antialias: true, powerPreference: 'high-performance', stencil: false, alpha: false };
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, ...ctxAttribs,
        outputBufferType: THREE.HalfFloatType,   // native HDR output pipeline (r186+)
      });
      this.hdrPipeline = true;
    } catch (e) {
      renderer = new THREE.WebGLRenderer({ canvas, ...ctxAttribs });
      this.hdrPipeline = false;
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;  // PCFSoft was removed in r186
    renderer.shadowMap.autoUpdate = true;
    renderer.info.autoReset = false;

    settings.autoQuality = detectQuality(renderer.getContext());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.12, 2600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.post = new PostChain(renderer, this.scene, this.camera);

    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this._resScale = 1;
    this._targetScale = 1;
    this._frameTimes = [];
    this._lastAdapt = 0;
    this.fps = 60;

    this._onResize = this.resize.bind(this);
    addEventListener('resize', this._onResize);
    addEventListener('orientationchange', () => setTimeout(this._onResize, 220));
    if (window.visualViewport) visualViewport.addEventListener('resize', this._onResize);

    this.applyQuality();
    this.resize();
  }

  get preset() { return settings.preset(); }

  applyQuality() {
    const p = this.preset;
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this._targetScale = p.resScale;
    this._resScale = p.resScale;
    this.post.configure({
      post: p.post && this.hdrPipeline,
      bloom: p.bloom,
      ao: p.ao,
      grain: settings.get('grain'),
    });
    this.camera.fov = settings.get('fov');
    this.camera.updateProjectionMatrix();
    this.resize();
    return p;
  }

  resize() {
    const w = Math.max(1, Math.floor(innerWidth));
    const h = Math.max(1, Math.floor(innerHeight));
    const p = this.preset;
    const dpr = Math.min(devicePixelRatio || 1, p.maxPixelRatio);
    this.renderer.setPixelRatio(dpr * this._resScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Phones in portrait need a vertical FOV bump or the world feels claustrophobic.
    const portrait = h > w;
    // photo-match mode pins its own field of view; an adaptive-resolution
    // resize must not quietly reset it
    this.camera.fov = this.fovOverride != null
      ? this.fovOverride * (portrait ? 1 : 0.86)
      : settings.get('fov') * (portrait ? 1.16 : 1);
    this.camera.updateProjectionMatrix();
    const bw = Math.floor(w * dpr * this._resScale), bh = Math.floor(h * dpr * this._resScale);
    this.post.setSize(bw, bh);
    this.viewport = { w, h, bw, bh, dpr };
  }

  /** Nudge the internal resolution to hold ~58fps without visible popping. */
  adapt(dtMs, now) {
    this._frameTimes.push(dtMs);
    if (this._frameTimes.length > 50) this._frameTimes.shift();
    if (this._frameTimes.length >= 24) {
      const sorted = [...this._frameTimes].sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      this.fps = 1000 / Math.max(1, med);
      if (settings.get('adaptive') && now - this._lastAdapt > 900) {
        const base = this.preset.resScale;
        let s = this._resScale;
        if (med > 21.5) s -= 0.07;
        else if (med < 14.0) s += 0.05;
        s = Math.max(base * 0.55, Math.min(base, s));
        if (Math.abs(s - this._resScale) > 0.011) {
          this._resScale = s;
          this._lastAdapt = now;
          this.resize();
        }
      }
    }
  }

  render() {
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
