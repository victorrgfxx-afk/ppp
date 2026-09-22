/* Persisted user settings + automatic device/quality detection. */

const KEY = 'sa-freeroam-settings-v1';

export const QUALITY_PRESETS = {
  low:    { shadows:false, shadowSize: 512, shadowDist: 40,  post:false, ao:false, bloom:false,
            resScale:0.62, aniso:2,  texSize:256, foliage:0.35, grassDensity:0.0,  reflections:false, maxPixelRatio:1.5 },
  medium: { shadows:true,  shadowSize:1024, shadowDist: 55,  post:false, ao:false, bloom:false,
            resScale:0.8,  aniso:4,  texSize:512, foliage:0.6,  grassDensity:0.35, reflections:false, maxPixelRatio:2 },
  high:   { shadows:true,  shadowSize:2048, shadowDist: 80,  post:true,  ao:false, bloom:true,
            resScale:1.0,  aniso:8,  texSize:512, foliage:0.85, grassDensity:0.7,  reflections:true,  maxPixelRatio:2 },
  ultra:  { shadows:true,  shadowSize:4096, shadowDist:120,  post:true,  ao:true,  bloom:true,
            resScale:1.0,  aniso:16, texSize:1024, foliage:1.0, grassDensity:1.0,  reflections:true,  maxPixelRatio:2 },
};

const DEFAULTS = {
  quality: 'auto',
  resScale: 100,          // % of preset resolution scale
  fov: 72,
  shadowDist: 80,
  post: true,
  ao: false,
  shadows: true,
  adaptive: true,
  grain: true,
  sens: 110,              // look sensitivity
  deadzone: 12,           // joystick deadzone %
  invertY: false,
  gyro: false,
  tiltSteer: false,
  haptics: true,
  headbob: true,
  volume: 70,
  timeOfDay: 13 * 60 + 40, // 13:40 — matches the sun height in the reference photos
  timeFlow: false,
  weather: 'clear',
  wind: 35,
  npcs: true,
};

export const Device = (() => {
  const ua = navigator.userAgent || '';
  const coarse = matchMedia('(pointer:coarse)').matches;
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (coarse && touch);
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const cores = navigator.hardwareConcurrency || (mobile ? 4 : 8);
  const mem = navigator.deviceMemory || (mobile ? 4 : 8);
  return { ua, mobile, ios, touch, coarse, cores, mem, dpr: window.devicePixelRatio || 1 };
})();

/** Best-effort GPU tier from the unmasked renderer string plus CPU/mem hints. */
export function detectQuality(gl) {
  let renderer = '';
  try {
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
  } catch { /* privacy-restricted; fall through to heuristics */ }
  const r = renderer.toLowerCase();

  // Software rasterisers (CI, headless, locked-down browsers) must stay cheap.
  if (/swiftshader|llvmpipe|software|mesa offscreen|angle \(google/.test(r)) return 'low';

  if (Device.mobile) {
    // Apple silicon phones and recent Adreno/Mali flagships handle "high".
    if (/apple a1[4-9]|apple a2\d|apple m\d/.test(r)) return 'high';
    if (/adreno \(tm\) (7\d\d|6[5-9]\d)/.test(r)) return 'high';
    if (/mali-g(7[1-9]|[89]\d)/.test(r)) return 'high';
    if (Device.cores >= 8 && Device.mem >= 6) return 'medium';
    return Device.cores >= 6 ? 'medium' : 'low';
  }
  if (/rtx|radeon rx|arc a|geforce gtx 1[06-9]|apple m[1-9]/.test(r)) return 'ultra';
  if (/geforce|radeon|nvidia|iris xe|arc /.test(r)) return 'high';
  return Device.cores >= 8 ? 'high' : 'medium';
}

class SettingsStore extends EventTarget {
  constructor() {
    super();
    this.data = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch { /* storage blocked (private mode): run on defaults */ }
    // URL overrides, e.g. ?q=high&exp=0.9 — handy for testing and for forcing a
    // preset on a device whose GPU string is masked.
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('q')) this.data.quality = q.get('q');
      for (const k of ['fov', 'volume', 'sens', 'shadowDist']) if (q.has(k)) this.data[k] = +q.get(k);
      for (const k of ['post', 'ao', 'shadows', 'adaptive', 'grain', 'npcs', 'timeFlow']) {
        if (q.has(k)) this.data[k] = q.get(k) !== '0';
      }
      if (q.has('t')) this.data.timeOfDay = +q.get('t');
      if (q.has('w')) this.data.weather = q.get('w');
      this.tune = {
        exposure: q.has('exp') ? +q.get('exp') : null,
        env: q.has('env') ? +q.get('env') : null,
        sun: q.has('sun') ? +q.get('sun') : null,
      };
    } catch { this.tune = {}; }
    this._save = this._save.bind(this);
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    this.dispatchEvent(new CustomEvent('change', { detail: { key: k, value: v } }));
    clearTimeout(this._t);
    this._t = setTimeout(this._save, 250);
  }
  /** Effective preset object with user overrides folded in. */
  preset() {
    const q = this.data.quality === 'auto' ? (this.autoQuality || 'medium') : this.data.quality;
    const p = { ...QUALITY_PRESETS[q] };
    p.name = q;
    p.resScale *= this.data.resScale / 100;
    p.shadows = p.shadows && this.data.shadows;
    p.post = p.post && this.data.post;
    p.ao = this.data.ao && this.data.post;
    p.shadowDist = this.data.shadowDist;
    return p;
  }
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  on(fn) { this.addEventListener('change', e => fn(e.detail.key, e.detail.value)); }
}

export const settings = new SettingsStore();
export { DEFAULTS };
