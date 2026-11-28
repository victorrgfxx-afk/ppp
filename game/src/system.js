// (V128) VEGHE: the system of Postul 7's operations centre (bunker.js), what its console runs - full screen, as such
// systems are: a bar of status across the top, the apps down the left, the assistant down the right.
//  * Panou: the state of everything at a glance - the cameras live, the network, the power, the weather, the events.
//  * Terminal: a shell; the network's tools (scan, probe, vulns, breach, act), the cameras, the launcher.
//  * Rețea: the commune's network as the post sees it, as a map - each host found, probed, looked up, broken into, then
//    told what to do. A game (netsim.js): its services, protocols and weaknesses invented; it plays like the real thing
//    and teaches nothing that works anywhere else.
//  * Camere: every camera (cctv.js: drawn from the game, 640 x 360 to 1280 x 720 by the quality, the main view's colours, infrared at night), the
//    commune's ones locked until broken into; pan, tilt and zoom on the domes (drag, wheel); any of them on the video
//    wall.
//  * Energie: the commune's transformer station (its breakers: power.js) and the post's own supply (the mains, the UPS,
//    the generator).
//  * Meteo · NOR: the weather station's readings, a radar, the anti-hail launcher on the hill over Câmpina (silver
//    iodide rockets: a storm, rain, a clear sky; a rocket trailing a wire to bring the lightning down).
//  * Vehicule: the cars near the hill, their telematics units - lights, horn, alarm.
//  * Web: the internet, through the built-in browser of the Claude desktop app (a host MCP server: navigate, read the
//    page's text), when the game is opened there by its owner; anywhere else it says so plainly.
//  * The assistant: Claude itself (the artifact's `sample` capability), with the system's functions as its tools - it
//    scans, breaks in, works the cameras and the devices, reads the web where the browser is there; its replies read
//    aloud (tts) and the operator's voice taken down (dictation) where the viewer allows them. Locally (no claude.ai) it
//    says it is not there.
import { NetSim, ACTIONS, KIND_LABEL } from './netsim.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const BROWSER = 'host:claude_browser';   // (as the artifact service keeps it: lower case)
const SVG = (p, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  panou: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15h4.5"/>',
  retea: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M12 7.2v4.3M12 11.5l-5.5 4.6M12 11.5l5.5 4.6"/>',
  camere: '<rect x="2.5" y="6.5" width="13" height="11" rx="2"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/>',
  energie: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  meteo: '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 11a3.5 3.5 0 0 1-.5 7z"/>',
  vehicule: '<path d="M5 16.5h14M6.5 16.5v2M17.5 16.5v2M4 16.5l1.6-5.2A2 2 0 0 1 7.5 10h9a2 2 0 0 1 1.9 1.3L20 16.5"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  jurnal: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
};
const APPS = [['panou', 'Panou'], ['terminal', 'Terminal'], ['retea', 'Rețea'], ['camere', 'Camere'], ['energie', 'Energie'], ['meteo', 'Meteo · NOR'], ['vehicule', 'Vehicule'], ['web', 'Web'], ['jurnal', 'Jurnal']];
const KIND_IC = { router: 'R', server: 'S', grid: '⚡', lights: '☀', launcher: '▲', meteo: '≈', camera: '◉', car: '▭' };
const LAUNCH = { seed: ['Însămânțare: furtună', 6, 16], rain: ['Ploaie', 4, 16], clear: ['Risipește norii', 6, 20], strike: ['Trăsnet (în furtună)', 1, 4] };

const CSS = `
#veghe{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;background:#06090d;color:#d8e1ea;font:14px/1.45 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
#veghe *{box-sizing:border-box}
#veghe button{font:inherit;color:inherit}
#veghe .top{height:50px;flex:none;display:flex;align-items:center;gap:10px;padding:0 12px 0 16px;border-bottom:1px solid #17202a;background:linear-gradient(#0b1118,#090d13)}
#veghe .logo{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:.22em;font-size:14px;color:#f3f7fb;margin-right:8px}
#veghe .logo svg{color:#4f9cff}
#veghe .chips{display:flex;gap:6px;flex:1;min-width:0;overflow:hidden}
#veghe .chip{display:flex;align-items:center;gap:7px;padding:4px 11px;border:1px solid #1b2632;border-radius:999px;font-size:12px;color:#8fa2b6;white-space:nowrap;background:#0b1118}
#veghe .chip b{color:#e7eef6;font-weight:600}
#veghe .dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 7px #22c55e;flex:none}
#veghe .dot.a{background:#f59e0b;box-shadow:0 0 7px #f59e0b}#veghe .dot.r{background:#ef4444;box-shadow:0 0 7px #ef4444}#veghe .dot.g{background:#64748b;box-shadow:none}
#veghe .tbtn{height:34px;min-width:34px;padding:0 10px;border-radius:9px;border:1px solid #1d2935;background:#0e151d;display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:#c9d6e3}
#veghe .tbtn:hover{background:#132030;border-color:#284055}
#veghe .tbtn.on{background:#13253d;border-color:#2b4f7d;color:#7fb6ff}
#veghe .body{flex:1;display:flex;min-height:0}
#veghe .rail{width:66px;flex:none;border-right:1px solid #17202a;display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:3px;background:#080c11;overflow:auto}
#veghe .rail button{width:48px;height:46px;border-radius:12px;border:0;background:transparent;color:#71859a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:9.5px;letter-spacing:.02em}
#veghe .rail button:hover{background:#0f1822;color:#cfe0f1}
#veghe .rail button.on{background:#112139;color:#6aaeff;box-shadow:inset 0 0 0 1px #1d3a60}
#veghe .main{flex:1;min-width:0;overflow:auto;padding:16px 18px;position:relative}
#veghe .main::-webkit-scrollbar,#veghe .msgs::-webkit-scrollbar,#veghe .term::-webkit-scrollbar{width:9px}
#veghe .main::-webkit-scrollbar-thumb,#veghe .msgs::-webkit-scrollbar-thumb,#veghe .term::-webkit-scrollbar-thumb{background:#1c2733;border-radius:9px}
#veghe h2{margin:0 0 14px;font-size:20px;font-weight:650;color:#f1f5f9;display:flex;align-items:center;gap:10px}
#veghe h2 small{font-size:12px;font-weight:500;color:#7c8ea2}
#veghe .grid{display:grid;gap:14px}
#veghe .card{background:#0b1118;border:1px solid #17212c;border-radius:14px;padding:14px;min-width:0}
#veghe .card h3{margin:0 0 10px;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:#7f93a8;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}
#veghe .big{font-size:26px;font-weight:650;color:#f1f5f9;line-height:1.1}
#veghe .mut{color:#7c8ea2;font-size:12.5px}
#veghe .kv{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px}#veghe .kv span{color:#7c8ea2}#veghe .kv b{font-weight:600;color:#e2e8f0;text-align:right}
#veghe .btn{height:32px;padding:0 13px;border-radius:9px;border:1px solid #223244;background:#101a25;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#d6e2ee}
#veghe .btn:hover:not(:disabled){background:#15243a;border-color:#2e4a6c}
#veghe .btn:disabled{opacity:.42;cursor:default}
#veghe .btn.pri{background:#1d4ed8;border-color:#2b5ff0;color:#fff}#veghe .btn.pri:hover:not(:disabled){background:#2563eb}
#veghe .btn.red{background:#3b1013;border-color:#6b1d22;color:#ffb4b4}#veghe .btn.grn{background:#0f2a1a;border-color:#1d5133;color:#9ff0bf}
#veghe .btn.sm{height:27px;padding:0 10px;font-size:12px;border-radius:8px}
#veghe .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#veghe .pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:2px 9px;border-radius:999px;background:#111b26;border:1px solid #1d2a38;color:#9fb2c5;white-space:nowrap}
#veghe .pill.g{color:#86efac;border-color:#1c4a30;background:#0c2216}#veghe .pill.a{color:#fcd34d;border-color:#5a4512;background:#21190a}#veghe .pill.r{color:#fca5a5;border-color:#5a1a1a;background:#220c0c}#veghe .pill.b{color:#93c5fd;border-color:#1e3a62;background:#0c1830}
#veghe .term{background:#04070a;border:1px solid #141e28;border-radius:12px;font:13px/1.55 "JetBrains Mono","Cascadia Mono",Consolas,"Courier New",monospace;padding:12px 14px;overflow:auto;user-select:text;color:#c9d4df;white-space:pre-wrap;word-break:break-word}
#veghe .term .d{color:#6b7f93}#veghe .term .g{color:#4ade80}#veghe .term .y{color:#facc15}#veghe .term .r{color:#f87171}#veghe .term .c{color:#67e8f9}#veghe .term .p{color:#93c5fd}
#veghe .tin{display:flex;align-items:center;gap:8px;margin-top:8px;background:#04070a;border:1px solid #1a2633;border-radius:10px;padding:0 12px;font:13px "JetBrains Mono","Cascadia Mono",Consolas,monospace}
#veghe .tin span{color:#4ade80;white-space:nowrap}#veghe .tin input{flex:1;height:40px;background:transparent;border:0;outline:0;color:#e2e8f0;font:inherit}
#veghe .net{display:grid;grid-template-columns:1fr 340px;gap:14px;height:calc(100% - 46px);min-height:460px}
#veghe .net svg{width:100%;height:100%;display:block}
#veghe .node{cursor:pointer}#veghe .node:hover circle.o{stroke-width:3}
#veghe .ports{width:100%;border-collapse:collapse;font-size:12.5px}#veghe .ports td{padding:4px 6px;border-bottom:1px solid #141d27}#veghe .ports td:first-child{color:#93c5fd;font-family:Consolas,monospace}
#veghe .mini{background:#04070a;border:1px solid #141e28;border-radius:9px;font:12px/1.5 Consolas,monospace;padding:8px 10px;max-height:150px;overflow:auto;white-space:pre-wrap;color:#b8c6d4;margin-top:10px;user-select:text}
#veghe .mini .g{color:#4ade80}#veghe .mini .r{color:#f87171}#veghe .mini .y{color:#facc15}#veghe .mini .d{color:#6b7f93}
#veghe .camv{position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:16/9;border:1px solid #17212c;cursor:grab}
#veghe .camv canvas{width:100%;height:100%;display:block}
#veghe .ov{position:absolute;left:10px;top:9px;right:10px;display:flex;justify-content:space-between;pointer-events:none;font:600 12.5px "Segoe UI",system-ui;color:#f1f5f9;text-shadow:0 1px 2px #000}
#veghe .ov .rec{color:#ff453a}
#veghe .ovb{position:absolute;left:10px;bottom:8px;font:12px Consolas,monospace;color:#e5e7eb;text-shadow:0 1px 2px #000;pointer-events:none}
#veghe .ptz{position:absolute;right:10px;bottom:10px;display:grid;grid-template-columns:repeat(3,30px);gap:4px}
#veghe .ptz button{width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(10,14,20,.7);cursor:pointer;color:#e5e7eb;font-size:13px}
#veghe .ptz button:hover{background:rgba(40,70,110,.8)}
#veghe .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
#veghe .tile{position:relative;border-radius:10px;overflow:hidden;background:#05080b;border:1px solid #17212c;cursor:pointer;aspect-ratio:16/9}
#veghe .tile.sel{outline:2px solid #3b82f6;outline-offset:-2px}
#veghe .tile canvas{width:100%;height:100%;display:block}
#veghe .tile .lb{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 5px;font-size:11.5px;background:linear-gradient(transparent,rgba(0,0,0,.85));color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#veghe .tile .lk{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:repeating-linear-gradient(135deg,#0a0f15 0 10px,#0c121a 10px 20px);color:#7c8ea2;font-size:12px}
#veghe .ai{width:390px;flex:none;border-left:1px solid #17202a;display:flex;flex-direction:column;background:#080c11;min-height:0}
#veghe .ai.off{display:none}
#veghe .aih{padding:12px 14px;border-bottom:1px solid #17202a;display:flex;align-items:center;gap:8px}
#veghe .aih b{flex:1;font-size:14px;color:#f1f5f9;display:flex;align-items:center;gap:8px}
#veghe .msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;user-select:text}
#veghe .m{max-width:92%;padding:9px 12px;border-radius:13px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
#veghe .m.u{align-self:flex-end;background:#1d4ed8;color:#fff;border-bottom-right-radius:4px}
#veghe .m.a{align-self:flex-start;background:#111a24;border:1px solid #1a2634;border-bottom-left-radius:4px}
#veghe .m.t{align-self:flex-start;background:transparent;border:1px dashed #22344a;color:#8fb3d9;font-size:12px;padding:5px 10px}
#veghe .m.e{align-self:stretch;background:#1c1010;border:1px solid #4a1e1e;color:#fecaca;font-size:12.5px}
#veghe .m.i{align-self:stretch;background:#0d1723;border:1px solid #1b2c40;color:#a9c3dd;font-size:12.5px}
#veghe .aif{padding:10px;border-top:1px solid #17202a;display:flex;gap:8px;align-items:flex-end}
#veghe .aif textarea{flex:1;min-height:42px;max-height:140px;resize:none;background:#0d141c;border:1px solid #1e2b39;border-radius:11px;color:#e2e8f0;padding:10px 12px;font:13.5px/1.4 inherit;outline:0}
#veghe .aif textarea:focus{border-color:#2f5d93}
#veghe .ib{width:40px;height:40px;border-radius:11px;border:1px solid #1e2b39;background:#0f1822;display:grid;place-items:center;cursor:pointer;color:#c6d4e2;flex:none}
#veghe .ib:hover{background:#15243a}#veghe .ib.on{background:#7f1d1d;border-color:#b91c1c;color:#fff}#veghe .ib.pri{background:#1d4ed8;border-color:#2b5ff0;color:#fff}
#veghe .ib:disabled{opacity:.35;cursor:default}
#veghe .sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}
#veghe .sug button{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid #1f2e3e;background:#0d141c;color:#9fb6cc;cursor:pointer}
#veghe .sug button:hover{background:#13202e;color:#d6e6f5}
#veghe .toastV{position:absolute;right:16px;bottom:16px;background:#0f1a26;border:1px solid #234060;color:#e2ecf6;border-radius:11px;padding:10px 14px;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:5;max-width:420px}
#veghe .web{display:flex;flex-direction:column;height:100%}
#veghe .url{display:flex;gap:8px;margin-bottom:12px}
#veghe .url input{flex:1;height:38px;background:#0d141c;border:1px solid #1e2b39;border-radius:10px;color:#e2e8f0;padding:0 12px;font:13.5px inherit;outline:0}
#veghe .page{flex:1;overflow:auto;background:#0b1118;border:1px solid #17212c;border-radius:12px;padding:20px 26px;font-size:14.5px;line-height:1.65;color:#d5dee8;white-space:pre-wrap;user-select:text}
#veghe .sld{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
#veghe .brk{border:1px solid #1d2a38;border-radius:12px;padding:12px;background:#0d141c;display:flex;flex-direction:column;gap:8px}
#veghe .brk b{font-size:13px}
#veghe .ev{display:flex;gap:10px;font-size:13px;padding:6px 0;border-bottom:1px solid #121b25}#veghe .ev span{color:#6b7f93;font-family:Consolas,monospace;font-size:12px;white-space:nowrap}
#veghe .ev.g b{color:#86efac}#veghe .ev.r b{color:#fca5a5}#veghe .ev.a b{color:#fcd34d}#veghe .ev b{font-weight:500;color:#d5dee8}
#veghe .gate{border:1px dashed #2a3b4e;border-radius:12px;padding:16px;background:#0a1017;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
@media (max-width:1100px){#veghe .ai{position:absolute;right:0;top:50px;bottom:0;z-index:4;box-shadow:-20px 0 40px rgba(0,0,0,.5)}#veghe .net{grid-template-columns:1fr}}
`;

export class System {
  // o: { audio, store, cctv, hooks, onClose }
  //   hooks: hour(), date(), weather(), weatherLabel(), storm(), setWeather(k), strike(), notify(msg), power(),
  //   setPower(k, on), feed() {source, ups, fuel, mains}, cars() [{id, name, dist, v}], carAct(v, what), meteo(),
  //   map(g, w, h, marks), camRender(i) (draws a camera now), night()
  constructor(o) {
    Object.assign(this, o);
    this.open = false; this.root = null; this.app = 'panou';
    this.events = [];
    this.term = [];                                    // (the terminal's lines: { t, c })
    this.hist = []; this.hi = 0;
    this.rockets = 18; this.reload = 0; this.pending = [];
    this.sel = { cam: 0, dev: null };
    this.camT = 0; this.thumbK = 0; this.liveT = 0;
    this.ai = { msgs: [], busy: null, voice: false, tier: 'quick', ready: false };
    this.webSt = { url: '', text: '', title: '', busy: false };
    const st = this.store?.get('veghe', {}) ?? {};
    this.saved = st;
    this.ai.voice = !!st.voice;
    this.wallPin = Array.isArray(st.wall) ? st.wall : [];
    this.net = new NetSim({
      power: (k, on) => this.hooks.setPower?.(k, on),
      launch: (w) => this.fire(w),
      meteo: () => this.meteoText(),
      camera: (i) => { this.sel.cam = i; this.go('camere'); },
      car: (id, what) => { const c = (this.hooks.cars?.() ?? []).find(x => x.id === id); if (c) this.hooks.carAct?.(c.v, what); },
    });
    this.net.onChange = () => { this.saveSoon(); this.dirty = true; };
    this.ready = false;
    this.caps();
  }

  // ---- the viewer's capabilities on claude.ai (each null where this view has none: locally, other browsers, outside
  // the owner's organization): Claude (sample), its voice (tts), the operator's voice (dictation), the browser (mcp)
  async caps() {
    const C = window.claude;
    this.cap = { sample: null, tts: null, dictation: null, mcp: null, tools: false, browser: false };
    if (!C?.use) { this.capDone = true; this.refreshAi(); return; }
    const get = (n) => C.use(n).catch(() => null);
    const [sample, tts, dictation, mcp] = await Promise.all(['sample', 'tts', 'dictation', 'mcp'].map(get));
    Object.assign(this.cap, { sample, tts, dictation, mcp });
    if (sample) { const lim = await sample.limits?.().catch(() => null); this.cap.tools = !!lim?.tools; }
    if (mcp) {
      const lt = await mcp.listTools(BROWSER).catch(() => null);
      const srv = lt?.servers?.find(s => s.name === BROWSER || s.server === BROWSER || s.id === BROWSER) ?? lt?.servers?.[0];
      this.cap.browser = !!srv && (srv.tools?.length ?? 0) > 0;
    }
    if (tts) tts.onState?.(({ state }) => { this.ttsState = state; this.paintVoice(); });
    if (dictation) {
      dictation.onPartial?.(({ text }) => { if (this.$ta) this.$ta.placeholder = text || 'Scrie sau vorbește...'; });
      dictation.onFinal?.(({ text }) => { if (this.$ta) { this.$ta.value = (this.$ta.value ? this.$ta.value : text.replace(/^\s+/, '')) + (this.$ta.value ? text : ''); this.autoGrow(); } });
      dictation.onState?.(({ state, reason }) => {
        this.micState = state; this.paintVoice();
        if (state === 'idle' && this.$ta) { this.$ta.placeholder = 'Scrie sau vorbește...'; if ((reason === 'stopped' || reason === 'viewer_stopped') && this.$ta.value.trim()) this.aiSend(); }
        if (reason === 'unavailable' || reason === 'not_granted') { this.cap.dictation = null; this.paintVoice(); }
      });
    }
    this.capDone = true;
    this.refreshAi();
  }

  // ---- the network: the post's own gear, the commune's devices, the cameras (cctv.cams), the cars near the hill
  setup() {
    if (this.ready) return;
    this.ready = true;
    const N = this.net, S = this.saved;
    N.add({ ip: '10.7.0.1', host: 'poarta-postului', kind: 'router', own: true });
    N.add({ ip: '10.7.0.10', host: 'veghe-core', kind: 'server', own: true, label: 'serverul sistemului (VEGHE)' });
    N.add({ ip: '10.7.0.11', host: 'veghe-stocare', kind: 'server', own: true, label: 'stocare (înregistrările camerelor)' });
    N.add({ ip: '10.7.20.5', host: 'pta-padure-scada', kind: 'grid' });
    N.add({ ip: '10.7.20.6', host: 'iluminat-public', kind: 'lights' });
    N.add({ ip: '10.7.40.2', host: 'lg12-campina', kind: 'launcher' });
    N.add({ ip: '10.7.40.9', host: 'meteo-dealul-crucii', kind: 'meteo' });
    this.cctv.cams.forEach((c, i) => N.add({ ip: c.ip, host: c.host, kind: 'camera', cam: i, own: !!c.own, label: `cameră IP · ${c.model}` }));
    let k = 11;
    for (const c of (this.hooks.cars?.() ?? []).slice(0, 10)) N.add({ ip: `10.7.50.${k++}`, host: 'auto-' + c.id, kind: 'car', car: c.id, label: `telematică · ${c.name}` });
    // what was found and taken before (kept)
    for (const d of N.devs) {
      const s = S.devs?.[d.ip]; if (!s || d.own) continue;
      d.found = !!s[0]; d.probed = !!s[1]; d.known = !!s[2]; d.owned = !!s[3];
    }
    if (!this.wallPin.length) this.wallPin = this.cctv.cams.map((c, i) => (c.own ? i : -1)).filter(i => i >= 0).slice(0, 8);
    this.log('VEGHE pornit · ' + N.devs.length + ' adrese în evidență', 'g');
  }
  saveSoon() { clearTimeout(this._sv); this._sv = setTimeout(() => this.save(), 800); }
  save() {
    const devs = {};
    for (const d of this.net.devs) if (!d.own && d.found) devs[d.ip] = [d.found ? 1 : 0, d.probed ? 1 : 0, d.known ? 1 : 0, d.owned ? 1 : 0];
    this.store?.set('veghe', { devs, wall: this.wallPin, voice: this.ai.voice });
  }
  timeStr() { const h = this.hooks.hour?.() ?? 12; return `${pad2(Math.floor(h))}:${pad2(Math.floor((h % 1) * 60))}`; }
  clock() { const h = this.hooks.hour?.() ?? 12, s = Math.floor((h * 3600) % 60); return `${this.hooks.date?.() ?? ''}  ${this.timeStr()}:${pad2(s)}`; }
  log(msg, kind = '') { this.events.unshift({ t: this.timeStr(), msg, kind }); this.evN = (this.evN ?? 0) + 1; if (this.events.length > 200) this.events.pop(); this.dirty = true; }
  beep(f = 880, g = 0.03, d = 0.05) { try { if (this.audio?.ctx?.state === 'running') this.audio.ring([f], [g], [d], 0); } catch (_) { /* no sound */ } }
  toast(msg, s = 4) {
    if (!this.$main) return;
    this.$toast?.remove();
    const t = this.$toast = document.createElement('div'); t.className = 'toastV'; t.textContent = msg; this.root.querySelector('.body').appendChild(t);
    setTimeout(() => t.remove(), s * 1000);
  }
  owned(kind) { return this.net.devs.find(d => d.kind === kind && d.owned) ?? null; }
  dev(kind) { return this.net.devs.find(d => d.kind === kind) ?? null; }

  // ---- the terminal's output (the network's tools write here too)
  out(text, c = '') { this.term.push({ t: String(text), c }); if (this.term.length > 700) this.term.splice(0, this.term.length - 700); this.termDirty = true; }
  // the four steps on one host, one after another (as an operator would): found (ping), probed, looked up, broken into
  async hack(ip, out = (t, c) => this.out(t, c), signal) {
    const N = this.net, d = N.get(ip); if (!d) { out(`nu cunosc ${ip}`, 'r'); return false; }
    if (d.owned) { out(`${d.host} e deja al tău`, 'g'); return true; }
    if (!d.found) { out(`ping ${d.ip} ...`, 'd'); await N.wait(500, signal); d.found = true; out(`${d.ip} răspunde (${(8 + Math.random() * 30).toFixed(1)} ms)`, ''); N.changed(); }
    if (!d.probed) await N.probe(d.ip, out, signal);
    if (!d.known) await N.vulns(d.ip, out, signal);
    const ok = await N.breach(d.ip, null, out, signal);
    if (ok) { this.log(`Acces obținut: ${d.host} (${d.ip})`, 'g'); this.beep(1320, 0.03, 0.08); }
    return ok;
  }

  async hackAll(kind, out = (t, c) => this.out(t, c), signal) {
    if (this.hackingAll) return 0;
    this.hackingAll = true;
    const s = this.net.speed; this.net.speed = Math.max(s, 2.5);
    let n = 0;
    try { for (const d of this.net.devs.filter(x => x.kind === kind && !x.owned && !x.own)) { if (signal?.aborted) break; if (await this.hack(d.ip, out, signal)) n++; } }
    finally { this.net.speed = s; this.hackingAll = false; }
    return n;
  }

  // ---- the launcher (NOR): its rockets (18, one more every 2 minutes), what each salvo does and when
  fire(w) {
    const L = LAUNCH[w];
    if (!L) return { ok: false, msg: 'acțiuni: seed | rain | clear | strike' };
    if (this.pending.length) return { ok: false, msg: 'o lansare e deja în curs' };
    if (w === 'strike' && !this.hooks.storm?.()) return { ok: false, msg: 'trăsnetul se aduce doar dintr-o furtună (seed întâi)' };
    if (this.rockets < L[1]) return { ok: false, msg: `prea puține rachete (${this.rockets}); se reîncarcă una la 2 minute` };
    this.rockets -= L[1];
    this.pending.push({ w, t: L[2] });
    for (let i = 0; i < L[1]; i++) setTimeout(() => { try { this.audio?.burst?.({ f: 140, q: 0.7, dur: 0.5, gain: 0.2, type: 'lowpass' }); this.audio?.burst?.({ f: 420, q: 1, dur: 0.6, gain: 0.06, delay: 1.8 }); } catch (_) { /* no sound */ } }, i * 700);
    this.log(`NOR: ${L[0]} - ${L[1]} rachete lansate`, 'a');
    return { ok: true, msg: `${L[1]} rachete lansate: ${L[0].toLowerCase()} în ~${L[2]} s` };
  }
  meteoText() { const m = this.hooks.meteo?.() ?? {}; return `${m.label ?? ''} · ${m.temp ?? '?'} °C · vânt ${m.wind ?? '?'} m/s (rafale ${m.gust ?? '?'}) · umiditate ${m.hum ?? '?'}% · ${m.pres ?? '?'} hPa · precipitații ${m.rain ?? 0} mm/h`; }

  // ---------------------------------------------------------------- the screen
  build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const r = this.root = document.createElement('div'); r.id = 'veghe'; r.tabIndex = -1;
    r.innerHTML = `<div class="top"><div class="logo">${SVG(IC.eye, 22)}VEGHE</div><div class="chips"></div>
      <button class="tbtn" data-t="ai" title="Asistentul (Ctrl+Space)">${SVG(IC.ai, 17)}Asistent</button><button class="tbtn" data-t="x" title="Închide (Esc)">${SVG(IC.x, 17)}</button></div>
      <div class="body"><nav class="rail">${APPS.map(([k, n]) => `<button data-app="${k}" title="${n}">${SVG(IC[k], 21)}<span>${n.split(' ')[0]}</span></button>`).join('')}</nav><div class="main"></div><aside class="ai"></aside></div>`;
    document.body.appendChild(r);
    this.$main = r.querySelector('.main'); this.$chips = r.querySelector('.chips'); this.$ai = r.querySelector('.ai');
    r.querySelector('.rail').addEventListener('click', (e) => { const b = e.target.closest('[data-app]'); if (b) this.go(b.dataset.app); });
    r.querySelector('.top').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'x') this.close(); else { this.$ai.classList.toggle('off'); b.classList.toggle('on', !this.$ai.classList.contains('off')); }
    });
    // (keys stay in here: the game does not walk while you type)
    r.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.code === 'Space' && e.ctrlKey) { e.preventDefault(); this.$ai.classList.remove('off'); this.$ta?.focus(); }
    });
    r.addEventListener('keyup', (e) => e.stopPropagation());
    this.aiBuild();
    if (innerWidth < 1100) this.$ai.classList.add('off');
    r.querySelector('[data-t="ai"]').classList.toggle('on', !this.$ai.classList.contains('off'));
  }
  show(app) {
    this.setup();
    if (!this.root) this.build();
    this.root.style.display = 'flex'; this.open = true;
    this.go(app || this.app);
    this.root.focus();
    if (!this.greeted) { this.greeted = true; this.log('Operator conectat la consolă', ''); }
  }
  close() { if (!this.root || !this.open) return; this.root.style.display = 'none'; this.open = false; this.onClose?.(); }
  go(app) {
    if (!this.root) { this.app = app; return; }
    this.app = app; this.view = null;
    this.root.querySelectorAll('.rail button').forEach(b => b.classList.toggle('on', b.dataset.app === app));
    this.$main.innerHTML = '';
    this.$main.scrollTop = 0;
    this[app]?.();
    this.chips();
  }
  chips() {
    if (!this.$chips) return;
    const f = this.hooks.feed?.() ?? {}, N = this.net.devs, own = N.filter(d => d.owned && !d.own).length, found = N.filter(d => d.found && !d.own).length;
    const src = { retea: ['Rețea 400 V', ''], ups: ['UPS · baterii', 'a'], generator: ['Generator', 'a'] }[f.source] ?? ['?', 'g'];
    const camsOn = this.cctv.cams.filter((c, i) => this.camOwned(i)).length;
    this.$chips.innerHTML = `<div class="chip"><span class="dot ${src[1]}"></span>Alimentare <b>${src[0]}</b></div><div class="chip">UPS <b>${Math.round(f.ups ?? 100)}%</b></div>
      <div class="chip"><span class="dot ${own ? '' : 'g'}"></span>Rețea <b>${own}/${found || '–'}</b> controlate</div><div class="chip">Camere <b>${camsOn}/${this.cctv.cams.length}</b></div>
      <div class="chip">${esc(this.hooks.weatherLabel?.() ?? '')} <b>${this.timeStr()}</b></div>`;
  }
  // the app's own redraw, every ~0.12 s while it is shown
  tick() { this.view?.tick?.(); }

  // ---------------------------------------------------------------- Panou
  panou() {
    const M = this.$main;
    M.innerHTML = `<h2>Panou <small>${esc(this.hooks.date?.() ?? '')} · Postul 7</small></h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <div class="card" style="grid-column:span 2;min-width:0"><h3>Camere live <button class="btn sm" data-go="camere">Toate camerele</button></h3><div class="tiles" style="grid-template-columns:repeat(2,1fr)"></div></div>
        <div class="card"><h3>Rețea</h3><div class="big nk"></div><div class="mut ns"></div><div class="row" style="margin-top:12px"><button class="btn pri sm" data-x="scan">Scanează rețeaua</button><button class="btn sm" data-go="retea">Harta rețelei</button></div><div class="mini" style="display:none"></div></div>
        <div class="card"><h3>Energie</h3><div class="kv pw"></div><div class="row" style="margin-top:12px"><button class="btn sm" data-go="energie">Detalii</button></div></div>
        <div class="card"><h3>Meteo · NOR</h3><div class="kv mt"></div><div class="row" style="margin-top:12px"><button class="btn sm" data-go="meteo">Radar și lansator</button></div></div>
        <div class="card"><h3>Evenimente <button class="btn sm" data-go="jurnal">Jurnal</button></h3><div class="evs"></div></div>
        <div class="card"><h3>Asistent</h3><div class="mut">Cere-i ce vrei: „scanează rețeaua și preia camerele”, „taie curentul în comună”, „adu o furtună”, „ce scrie azi pe un site”.</div><div class="row" style="margin-top:10px"><button class="btn pri sm" data-x="ai">Vorbește cu asistentul</button></div></div>
      </div>`;
    const tiles = M.querySelector('.tiles'), list = this.wallSlots().slice(0, 4);
    tiles.innerHTML = list.map((i) => i < 0 ? '<div class="tile"><div class="lk">fără semnal</div></div>' : `<div class="tile" data-cam="${i}"><canvas width="480" height="270"></canvas><div class="lb">${esc(this.cctv.cams[i].name)}</div></div>`).join('');
    const cv = [...tiles.querySelectorAll('[data-cam]')].map(t => ({ i: +t.dataset.cam, c: t.querySelector('canvas') }));
    M.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]'); if (g) return this.go(g.dataset.go);
      const t = e.target.closest('[data-cam]'); if (t) { this.sel.cam = +t.dataset.cam; return this.go('camere'); }
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'ai') { this.$ai.classList.remove('off'); this.root.querySelector('[data-t="ai"]').classList.add('on'); this.$ta?.focus(); }
      if (x.dataset.x === 'scan' && !this.scanning) {
        const mini = M.querySelector('.mini'); mini.style.display = 'block'; mini.innerHTML = '';
        const out = (t, c) => { const d = document.createElement('div'); d.className = c; d.textContent = t; mini.appendChild(d); mini.scrollTop = 1e9; this.out(t, c); };
        this.scanning = true; x.disabled = true;
        this.net.scan(out).finally(() => { this.scanning = false; x.disabled = false; this.log('Scanare: ' + this.net.devs.filter(d => d.found).length + ' gazde', ''); });
      }
    });
    let k = 0;
    this.view = {
      tick: () => {
        const N = this.net.devs, own = N.filter(d => d.owned && !d.own).length, found = N.filter(d => d.found && !d.own).length, vuln = N.filter(d => d.known && !d.owned && d.weak.length).length;
        M.querySelector('.nk').textContent = `${own} controlate`;
        M.querySelector('.ns').textContent = found ? `${found} gazde găsite · ${vuln} vulnerabile, neatinse` : 'rețeaua comunei nescanată încă';
        const f = this.hooks.feed?.() ?? {}, p = this.hooks.power?.() ?? {};
        M.querySelector('.pw').innerHTML = `<span>Alimentarea postului</span><b>${{ retea: 'rețea', ups: 'UPS (baterii)', generator: 'generator diesel' }[f.source] ?? '?'}</b><span>UPS</span><b>${Math.round(f.ups ?? 100)}%</b><span>Motorină</span><b>${Math.round(f.fuel ?? 100)}%</b><span>Comuna (PTA)</span><b>${p.IG ? 'are curent' : 'FĂRĂ CURENT'}</b><span>Iluminat public</span><b>${p.IP && p.IG ? 'aprins' : 'stins'}</b>`;
        const m = this.hooks.meteo?.() ?? {};
        M.querySelector('.mt').innerHTML = `<span>Vremea</span><b>${esc(m.label ?? '')}</b><span>Temperatura</span><b>${m.temp ?? '?'} °C</b><span>Vânt</span><b>${m.wind ?? '?'} m/s</b><span>Rachete NOR</span><b>${this.rockets} / 18</b><span>Lansare</span><b>${this.pending.length ? `${LAUNCH[this.pending[0].w][0]} în ${Math.ceil(this.pending[0].t)} s` : '–'}</b>`;
        M.querySelector('.evs').innerHTML = this.events.slice(0, 7).map(e => `<div class="ev ${e.kind}"><span>${e.t}</span><b>${esc(e.msg)}</b></div>`).join('') || '<div class="mut">nimic încă</div>';
        if (cv.length) { const f2 = cv[k++ % cv.length]; this.hooks.camRender?.(f2.i); this.cctv.readTo(f2.i, f2.c); }
      },
    };
    this.view.tick();
  }

  // ---------------------------------------------------------------- Terminal
  terminal() {
    const M = this.$main;
    M.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><h2>Terminal <small>operator@veghe · ajutor: help</small></h2><div class="term" style="flex:1"></div>
      <div class="tin"><span>operator@veghe:~$</span><input spellcheck="false" autocomplete="off" placeholder="help"></div></div>`;
    const T = M.querySelector('.term'), I = M.querySelector('input');
    if (!this.term.length) { this.out('VEGHE · consola postului 7', 'c'); this.out('Scrie help pentru comenzi. Tab completează, ↑ ↓ istoricul, Ctrl+C oprește.', 'd'); }
    let shown = 0;
    const paint = () => {
      if (shown > this.term.length) { T.innerHTML = ''; shown = 0; }
      const frag = document.createDocumentFragment();
      for (; shown < this.term.length; shown++) { const l = this.term[shown], d = document.createElement('div'); d.className = l.c; d.textContent = l.t; frag.appendChild(d); }
      T.appendChild(frag); T.scrollTop = 1e9;
      while (T.childNodes.length > 700) T.removeChild(T.firstChild);
    };
    I.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = I.value; I.value = ''; this.hist.push(v); this.hi = this.hist.length; this.run(v); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.hi = Math.max(0, this.hi - 1); I.value = this.hist[this.hi] ?? ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.hi = Math.min(this.hist.length, this.hi + 1); I.value = this.hist[this.hi] ?? ''; }
      else if (e.key === 'Tab') { e.preventDefault(); I.value = this.complete(I.value); }
      else if (e.key === 'c' && e.ctrlKey && this.busy) { e.preventDefault(); this.busy.abort(); this.out('^C', 'd'); }
    });
    T.addEventListener('mouseup', () => { if (!getSelection().toString()) I.focus(); });
    this.view = { tick: () => { if (this.termDirty) { this.termDirty = false; paint(); } } };
    paint(); setTimeout(() => I.focus(), 0);
  }
  complete(v) {
    const parts = v.split(/\s+/), last = parts[parts.length - 1].toLowerCase();
    const pool = parts.length < 2 ? ['help', 'scan', 'hosts', 'probe', 'vulns', 'breach', 'hack', 'act', 'cams', 'cam', 'nor', 'meteo', 'ping', 'whoami', 'date', 'clear', 'ai', 'web', 'history']
      : this.net.devs.filter(d => d.found).flatMap(d => [d.ip, d.host]);
    const m = pool.filter(x => x.toLowerCase().startsWith(last));
    if (m.length === 1) parts[parts.length - 1] = m[0] + ' ';
    else if (m.length > 1) { this.out(m.join('   '), 'd'); let p = m[0]; for (const x of m) while (!x.startsWith(p)) p = p.slice(0, -1); parts[parts.length - 1] = p; }
    return parts.join(' ');
  }
  async run(line) {
    const v = line.trim();
    this.out(`operator@veghe:~$ ${v}`, 'p');
    if (!v) return;
    if (this.busy) { this.out('o comandă rulează încă (Ctrl+C o oprește)', 'y'); return; }
    const [cmd, ...a] = v.split(/\s+/), N = this.net, out = (t, c) => this.out(t, c);
    const ctl = this.busy = new AbortController();
    try {
      switch (cmd.toLowerCase()) {
        case 'help': case 'ajutor':
          for (const [c, d] of [['scan', 'caută gazdele din rețeaua comunei'], ['hosts', 'ce știi despre fiecare gazdă'], ['probe <gazdă>', 'porturile și serviciile ei'], ['vulns <gazdă>', 'slăbiciunile cunoscute ale versiunilor ei'],
            ['breach <gazdă> [NX-id]', 'intră folosind o slăbiciune'], ['hack <gazdă>', 'toți pașii, unul după altul'], ['act <gazdă> <acțiune>', 'comandă un dispozitiv al tău (acțiunile: act <gazdă>)'],
            ['cams · cam <n>', 'camerele · deschide camera n'], ['nor <seed|rain|clear|strike>', 'lansatorul antigrindină (al tău întâi)'], ['meteo', 'citirile stației meteo'], ['ping <gazdă>', 'răspunde?'],
            ['ai <întrebare>', 'întreabă asistentul'], ['web <adresă>', 'deschide o pagină'], ['clear · history · whoami · date', '']]) out(`  ${c.padEnd(30)} ${d}`, c.startsWith('ai') || c.startsWith('web') ? 'c' : '');
          out('Gazdele: după IP sau după nume (Tab le completează). Totul e o simulare a jocului: servicii și slăbiciuni inventate.', 'd');
          break;
        case 'clear': this.term.length = 0; this.termDirty = true; break;
        case 'history': this.hist.forEach((h, i) => out(`${String(i + 1).padStart(4)}  ${h}`)); break;
        case 'whoami': out('operator (postul 7 · VEGHE)'); break;
        case 'date': out(this.clock()); break;
        case 'scan': await N.scan(out, ctl.signal); this.log('Scanare: ' + N.devs.filter(d => d.found).length + ' gazde', ''); break;
        case 'hosts': {
          const L = N.devs.filter(d => d.found);
          if (!L.length) { out('nicio gazdă cunoscută (scan)', 'y'); break; }
          out('IP            NUME                     TIP                                STARE', 'y');
          for (const d of L) out(`${d.ip.padEnd(13)} ${d.host.padEnd(24)} ${(KIND_LABEL[d.kind] ?? d.kind).slice(0, 34).padEnd(34)} ${d.own ? 'al tău' : d.owned ? 'CONTROLAT' : d.known ? (d.weak.length ? 'vulnerabil' : 'fără slăbiciuni') : d.probed ? 'sondat' : 'găsit'}`, d.owned ? 'g' : '');
          break;
        }
        case 'probe': await N.probe(this.ipOf(a[0]), out, ctl.signal); break;
        case 'vulns': await N.vulns(this.ipOf(a[0]), out, ctl.signal); break;
        case 'breach': case 'exploit': { const ok = await N.breach(this.ipOf(a[0]), a[1], out, ctl.signal); if (ok) this.log(`Acces obținut: ${N.get(this.ipOf(a[0]))?.host}`, 'g'); break; }
        case 'hack': await this.hack(this.ipOf(a[0]), out, ctl.signal); break;
        case 'act': case 'cmd': {
          const d = N.get(this.ipOf(a[0]));
          if (!d) { out(`nu cunosc ${a[0] ?? ''}`, 'r'); break; }
          if (!a[1]) { out(`${d.host}: ` + ((ACTIONS[d.kind] ?? []).map(x => `${x[0]} (${x[1]})`).join(', ') || 'nimic de comandat'), 'd'); break; }
          const r = N.act(d.ip, a[1]); out(r.msg, r.ok ? 'g' : 'r'); if (r.ok) this.log(`${d.host}: ${r.msg}`, 'a');
          break;
        }
        case 'ping': {
          const d = N.get(this.ipOf(a[0])); if (!d) { out(`ping: ${a[0] ?? ''}: gazdă necunoscută`, 'r'); break; }
          for (let k = 0; k < 4; k++) { await N.wait(400, ctl.signal); out(`64 octeți de la ${d.ip}: icmp_seq=${k + 1} ttl=${d.kind === 'car' ? 52 : 63} timp=${(6 + Math.random() * (d.kind === 'car' ? 80 : 20)).toFixed(1)} ms`); }
          if (!d.found) { d.found = true; N.changed(); }
          break;
        }
        case 'cams': this.cctv.cams.forEach((c, i) => out(`${String(i + 1).padStart(2)}  ${c.ip.padEnd(12)} ${c.name.padEnd(36)} ${this.camOwned(i) ? 'live' : 'blocată'}${c.ptz ? ' · PTZ' : ''}`, this.camOwned(i) ? 'g' : 'd')); break;
        case 'cam': { const i = (+a[0] || 1) - 1; if (!this.cctv.cams[i]) { out('nu există camera ' + a[0], 'r'); break; } if (!this.camOwned(i)) { out(`camera ${i + 1} e blocată: hack ${this.cctv.cams[i].ip}`, 'y'); break; } this.sel.cam = i; this.go('camere'); break; }
        case 'nor': { const d = this.owned('launcher'); if (!d) { out('lansatorul nu e al tău: hack lg12-campina', 'y'); break; } const r = N.act(d.ip, a[0] ?? ''); out(r.msg, r.ok ? 'g' : 'r'); break; }
        case 'meteo': { const d = this.owned('meteo'); if (!d) { out('stația meteo nu răspunde fără cont: hack meteo-dealul-crucii', 'y'); break; } out(this.meteoText(), 'c'); break; }
        case 'ai': this.$ai.classList.remove('off'); this.aiSend(a.join(' ')); break;
        case 'web': case 'open': this.webSt.url = a[0] ?? ''; this.go('web'); this.webGo(this.webSt.url); break;
        default: out(`${cmd}: comandă necunoscută (help)`, 'r');
      }
    } catch (e) { out(String(e?.message ?? e), 'r'); }
    finally { this.busy = null; }
  }
  ipOf(x) { const d = x ? this.net.get(x) : null; return d ? d.ip : x ?? ''; }

  // ---------------------------------------------------------------- Rețea: the map
  retea() {
    const M = this.$main;
    M.innerHTML = `<h2>Rețea <small>10.7.0.0/16 · harta a ceea ce vede postul</small></h2><div class="net"><div class="card" style="padding:0;overflow:hidden"><svg></svg></div><div class="card side" style="overflow:auto"></div></div>`;
    const S = M.querySelector('svg'), side = M.querySelector('.side');
    const HF = { '0': ['Postul 7', 0.5, 0.5], '20': ['Energie', 0.2, 0.2], '30': ['Camere', 0.77, 0.24], '40': ['Meteo · NOR', 0.21, 0.8], '50': ['Vehicule', 0.78, 0.8] };
    let HUB = {};
    const pos = () => {
      const w = Math.max(320, S.clientWidth || 640), h = Math.max(320, S.clientHeight || 520), u = Math.min(w, h);
      S.setAttribute('viewBox', `0 0 ${w} ${h}`);
      HUB = Object.fromEntries(Object.entries(HF).map(([k, [n, fx, fy]]) => [k, [n, fx * w, fy * h]]));
      const by = {}; const P = {};
      for (const d of this.net.devs) { const s = d.ip.split('.')[2]; (by[s] ??= []).push(d); }
      for (const [s, L] of Object.entries(by)) {
        const hb = HUB[s] ?? ['?', w / 2, h / 2], n = L.length, R = u * (s === '0' ? 0.15 : 0.11 + Math.min(0.08, n * 0.005));
        L.forEach((d, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; P[d.ip] = [hb[1] + Math.cos(a) * R * 1.15, hb[2] + Math.sin(a) * R * 0.85]; });
      }
      return P;
    };
    const col = (d) => (d.own ? '#3b82f6' : d.owned ? '#22c55e' : d.known ? (d.weak.length ? '#f59e0b' : '#64748b') : d.probed ? '#38bdf8' : '#94a3b8');
    const draw = () => {
      const P = pos(), F = this.net.devs.filter(d => d.found || d.own);
      let h = '';
      const [, cx0, cy0] = HUB['0'];
      for (const [s, [name, x, y]] of Object.entries(HUB)) {
        if (s !== '0' && !F.some(d => d.ip.split('.')[2] === s)) continue;
        if (s !== '0') h += `<line x1="${cx0}" y1="${cy0}" x2="${x}" y2="${y}" stroke="#1e3a5f" stroke-width="2"/>`;
        h += `<circle cx="${x}" cy="${y}" r="7" fill="#0b1118" stroke="#2c4a70" stroke-width="2"/><text x="${x}" y="${y - 14}" fill="#5f7b99" font-size="12" text-anchor="middle" font-weight="600">${esc(name)} · .${s}.x</text>`;
      }
      for (const d of F) { const [x, y] = P[d.ip], hb = HUB[d.ip.split('.')[2]]; if (hb) h += `<line x1="${hb[1]}" y1="${hb[2]}" x2="${x}" y2="${y}" stroke="${d.owned ? '#1c5a3a' : '#1a2836'}" stroke-width="1.4"/>`; }
      for (const d of F) {
        const [x, y] = P[d.ip], c = col(d), sel = this.sel.dev === d.ip;
        h += `<g class="node" data-ip="${d.ip}"><circle cx="${x}" cy="${y}" r="${sel ? 19 : 16}" fill="#0b1118"/><circle class="o" cx="${x}" cy="${y}" r="${sel ? 19 : 16}" fill="none" stroke="${c}" stroke-width="${sel ? 3 : 2}"/>
          <text x="${x}" y="${y + 4.5}" fill="${c}" font-size="13" text-anchor="middle" font-weight="700">${KIND_IC[d.kind] ?? '?'}</text>
          <text x="${x}" y="${y + 33}" fill="#9fb2c5" font-size="10.5" text-anchor="middle">${esc(d.host.length > 22 ? d.host.slice(0, 21) + '…' : d.host)}</text></g>`;
      }
      if (!this.net.devs.some(d => d.found && !d.own)) h += `<text x="${cx0}" y="${cy0 * 1.75}" fill="#5f7b99" font-size="15" text-anchor="middle">Rețeaua comunei nu e scanată: apasă „Scanează” (sau scan în terminal)</text>`;
      S.innerHTML = h;
      drawSide();
    };
    const drawSide = () => {
      const d = this.sel.dev && this.net.get(this.sel.dev);
      if (!d) {
        const L = this.net.devs.filter(x => x.found && !x.own);
        side.innerHTML = `<h3>Rețeaua</h3><div class="mut" style="margin-bottom:12px">Alege o gazdă de pe hartă. Pașii, ca la un test de intruziune: găsești gazdele, le sondezi porturile, cauți slăbiciunile versiunilor lor, intri, apoi le comanzi.</div>
          <button class="btn pri" data-a="scan" ${this.scanning ? 'disabled' : ''}>Scanează rețeaua</button>
          <div style="margin-top:14px" class="kv"><span>Gazde găsite</span><b>${L.length}</b><span>Sondate</span><b>${L.filter(x => x.probed).length}</b><span>Vulnerabile</span><b>${L.filter(x => x.known && x.weak.length && !x.owned).length}</b><span>Controlate</span><b>${L.filter(x => x.owned).length}</b></div>
          <div class="row" style="margin-top:14px;font-size:12px"><span class="pill b">al postului</span><span class="pill">găsit</span><span class="pill b">sondat</span><span class="pill a">vulnerabil</span><span class="pill g">controlat</span></div><div class="mini" style="display:none"></div>`;
        return;
      }
      const st = d.own ? ['al postului', 'b'] : d.owned ? ['controlat', 'g'] : d.known ? (d.weak.length ? ['vulnerabil', 'a'] : ['fără slăbiciuni cunoscute', '']) : d.probed ? ['sondat', 'b'] : ['găsit', ''];
      const acts = d.owned ? (ACTIONS[d.kind] ?? []) : [];
      side.innerHTML = `<h3>${esc(d.host)} <span class="pill ${st[1]}">${st[0]}</span></h3><div class="kv"><span>Adresa</span><b>${d.ip}</b><span>Tip</span><b>${esc(d.label)}</b></div>
        ${d.probed ? `<div style="margin-top:12px" class="mut">Porturi deschise</div><table class="ports">${d.ports.map(([p, s]) => `<tr><td>${p}/tcp</td><td>${esc(s)}</td></tr>`).join('')}</table>` : ''}
        ${d.known ? `<div style="margin-top:12px" class="mut">Slăbiciuni (baza de date a jocului)</div>${d.weak.length ? d.weak.map(w => `<div class="row" style="margin:6px 0"><span class="pill ${w.sev >= 8 ? 'r' : 'a'}">${w.id} · ${w.sev.toFixed(1)}</span><span style="font-size:12.5px">${esc(w.title)}</span></div>`).join('') : '<div class="mut">nimic cunoscut</div>'}` : ''}
        <div class="row" style="margin-top:14px">${d.own || d.owned ? '' : `<button class="btn sm" data-a="probe" ${d.probed ? 'disabled' : ''}>Sondează</button><button class="btn sm" data-a="vulns" ${!d.probed || d.known ? 'disabled' : ''}>Caută slăbiciuni</button><button class="btn sm red" data-a="breach" ${!d.known || !d.weak.length ? 'disabled' : ''}>Exploatează</button><button class="btn sm pri" data-a="hack">Toți pașii</button>`}</div>
        ${acts.length ? `<div style="margin-top:14px" class="mut">Comenzi</div><div class="row" style="margin-top:6px">${acts.map(([k, n]) => `<button class="btn sm grn" data-act="${k}">${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="mini" style="display:none"></div><div class="row" style="margin-top:12px"><button class="btn sm" data-a="back">← Rețeaua</button></div>`;
    };
    const mini = (fn) => {
      const m = side.querySelector('.mini'); m.style.display = 'block'; m.innerHTML = '';
      const out = (t, c) => { const e = document.createElement('div'); e.className = c; e.textContent = t; m.appendChild(e); m.scrollTop = 1e9; this.out(t, c); };
      return fn(out).finally(() => { this.dirty = true; });
    };
    S.addEventListener('click', (e) => { const n = e.target.closest('[data-ip]'); this.sel.dev = n ? n.dataset.ip : null; draw(); });
    let sz = '';
    side.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = this.sel.dev && this.net.get(this.sel.dev);
      if (b.dataset.cam) { this.sel.cam = +b.dataset.cam; return this.go('camere'); }
      if (b.dataset.act && d) { const r = this.net.act(d.ip, b.dataset.act); this.toast(r.msg); if (r.ok) this.log(`${d.host}: ${r.msg}`, 'a'); return; }
      const a = b.dataset.a; b.disabled = true;
      if (a === 'back') { this.sel.dev = null; return draw(); }
      if (a === 'scan') { this.scanning = true; return mini(out => this.net.scan(out)).finally(() => { this.scanning = false; draw(); }); }
      if (!d) return;
      side.querySelectorAll('[data-a]').forEach(x => { x.disabled = true; });
      if (a === 'probe') mini(out => this.net.probe(d.ip, out));
      if (a === 'vulns') mini(out => this.net.vulns(d.ip, out));
      if (a === 'breach') mini(out => this.net.breach(d.ip, null, out).then(ok => { if (ok) this.log(`Acces obținut: ${d.host}`, 'g'); }));
      if (a === 'hack') mini(out => this.hack(d.ip, out));
    });
    let last = '';
    this.view = { tick: () => { const z = S.clientWidth + 'x' + S.clientHeight; if (z !== sz) { sz = z; last = ''; } const k = this.net.devs.map(d => +d.found + 2 * d.probed + 4 * d.known + 8 * d.owned).join(''); if (k !== last && !side.querySelector('.mini[style*="block"]')) { last = k; draw(); } else if (k !== last) { last = k; const sv = side.querySelector('.mini')?.innerHTML; draw(); const m2 = side.querySelector('.mini'); if (m2 && sv) { m2.innerHTML = sv; m2.style.display = 'block'; m2.scrollTop = 1e9; } } } };
    draw();
  }

  // ---------------------------------------------------------------- Camere
  camOwned(i) { const c = this.cctv.cams[i]; if (!c) return false; if (c.own) return true; const d = this.net.get(c.ip); return !!d?.owned; }
  camere() {
    const M = this.$main, C = this.cctv.cams;
    if (!this.camOwned(this.sel.cam)) this.sel.cam = C.findIndex((c, i) => this.camOwned(i));
    M.innerHTML = `<h2>Camere <small>${C.length} camere · ${this.cctv.w} × ${this.cctv.h} · infraroșu noaptea</small><span style="flex:1"></span><button class="btn sm pri" data-all="1" ${C.some((c, i) => !this.camOwned(i)) && !this.hackingAll ? '' : 'disabled'}>Preia toate camerele</button></h2>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start"><div><div class="camv"><canvas width="${this.cctv.w}" height="${this.cctv.h}"></canvas><div class="ov"><span class="nm"></span><span class="rec">● REC</span></div><div class="ovb"></div>
      <div class="ptz"><button data-p="ul">↖</button><button data-p="u">▲</button><button data-p="ur">↗</button><button data-p="l">◀</button><button data-p="r0">⟲</button><button data-p="r">▶</button><button data-p="zo">−</button><button data-p="d">▼</button><button data-p="zi">+</button></div></div></div>
      <div class="card info"></div></div><h3 style="margin:18px 0 10px;font-size:11.5px;letter-spacing:.09em;color:#7f93a8">TOATE CAMERELE</h3><div class="tiles"></div>`;
    const big = M.querySelector('.camv canvas'), bg = big.getContext('2d'), info = M.querySelector('.info'), tiles = M.querySelector('.tiles'), view = M.querySelector('.camv');
    const tileHtml = () => C.map((c, i) => `<div class="tile ${i === this.sel.cam ? 'sel' : ''}" data-i="${i}">${this.camOwned(i) ? '<canvas width="320" height="180"></canvas>' : `<div class="lk">${SVG(IC.lock, 22)}<span>${esc(c.ip)} · blocată</span><button class="btn sm pri" data-h="${i}">Preia controlul</button></div>`}<div class="lb">${String(i + 1).padStart(2, '0')} · ${esc(c.name)}</div></div>`).join('');
    const paintInfo = () => {
      const i = this.sel.cam, c = C[i];
      if (!c) { info.innerHTML = '<div class="mut">Nicio cameră disponibilă</div>'; return; }
      const slot = this.wallPin.indexOf(i);
      info.innerHTML = `<h3>${esc(c.name)}</h3><div class="kv"><span>Adresa</span><b>${c.ip}</b><span>Model</span><b>${esc(c.model)}</b><span>Rezoluție</span><b>${this.cctv.w} × ${this.cctv.h}</b><span>Obiectiv</span><b>${Math.round(c.fov / c.zoom)}° vertical</b><span>PTZ</span><b>${c.ptz ? `da · zoom ${c.zoom.toFixed(1)}×` : 'fixă'}</b><span>Noaptea</span><b>${c.ir === false ? 'color' : 'infraroșu'}</b></div>
        <div class="mut" style="margin:12px 0 6px">Pe peretele video</div><div class="row">${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<button class="btn sm ${slot === k ? 'pri' : ''}" data-w="${k}">${k + 1}</button>`).join('')}</div>
        <div class="mut" style="margin-top:12px">${c.ptz ? 'Trage cu mouse-ul pe imagine pentru panoramare, rotița pentru zoom.' : 'Cameră fixă.'}</div>`;
      view.querySelector('.ptz').style.display = c.ptz ? 'grid' : 'none';
    };
    tiles.innerHTML = tileHtml(); paintInfo();
    const wait = (cv) => { const g = cv.getContext('2d'); g.fillStyle = '#070b10'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#5f7b99'; g.font = '600 15px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.fillText('conectare la flux...', cv.width / 2, cv.height / 2 + 5); };
    const grab = () => [...tiles.querySelectorAll('[data-i]')].filter(t => t.querySelector('canvas')).map(t => { const c = t.querySelector('canvas'); wait(c); return { i: +t.dataset.i, c, t }; });
    let thumbs = grab();
    wait(big);
    const retile = () => { tiles.innerHTML = tileHtml(); thumbs = grab(); };
    M.querySelector('[data-all]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      await this.hackAll('camera', (t, cl) => { this.out(t, cl); if (cl === 'g') { b.textContent = t.length > 34 ? t.slice(0, 33) + '…' : t; retile(); } });
      b.textContent = 'Toate camerele sunt ale tale'; retile(); paintInfo();
    });
    tiles.addEventListener('click', async (e) => {
      const h = e.target.closest('[data-h]');
      if (h) {
        const i = +h.dataset.h, c = C[i]; h.disabled = true; h.textContent = 'se conectează...';
        const ok = await this.hack(c.ip, (t, cl) => { this.out(t, cl); if (cl !== 'd') h.textContent = t.length > 26 ? t.slice(0, 25) + '…' : t; });
        if (ok) { this.sel.cam = i; retile(); paintInfo(); }
        return;
      }
      const t = e.target.closest('[data-i]'); if (!t || !this.camOwned(+t.dataset.i)) return;
      this.sel.cam = +t.dataset.i; tiles.querySelectorAll('.tile').forEach(x => x.classList.toggle('sel', x === t)); paintInfo();
    });
    info.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; const k = +b.dataset.w; this.wallPin = this.wallPin.filter(x => x !== this.sel.cam); while (this.wallPin.length < k) this.wallPin.push(-1); this.wallPin[k] = this.sel.cam; this.wallPin = this.wallPin.slice(0, 8); this.save(); this.wallDirty = true; paintInfo(); this.toast(`Camera e pe ecranul ${k + 1} al peretelui video`); });
    const ptz = (dp, dt, dz) => { if (this.cctv.ptz(this.sel.cam, dp, dt, dz)) paintInfo(); };
    view.querySelector('.ptz').addEventListener('click', (e) => {
      const p = e.target.closest('[data-p]')?.dataset.p; if (!p) return;
      const s = 0.12 / (C[this.sel.cam]?.zoom ?? 1);
      ({ u: () => ptz(0, s, 1), d: () => ptz(0, -s, 1), l: () => ptz(s, 0, 1), r: () => ptz(-s, 0, 1), ul: () => ptz(s, s, 1), ur: () => ptz(-s, s, 1), zi: () => ptz(0, 0, 1.25), zo: () => ptz(0, 0, 0.8), r0: () => { this.cctv.reset(this.sel.cam); paintInfo(); } })[p]?.();
    });
    view.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ptz')) return;
      let x0 = e.clientX, y0 = e.clientY; view.style.cursor = 'grabbing';
      const mv = (ev) => { const c = C[this.sel.cam], k = (c?.fov ?? 60) / (c?.zoom ?? 1) * Math.PI / 180 / view.clientHeight; ptz((ev.clientX - x0) * k, (ev.clientY - y0) * k, 1); x0 = ev.clientX; y0 = ev.clientY; };
      const up = () => { view.style.cursor = ''; removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    view.addEventListener('wheel', (e) => { e.preventDefault(); ptz(0, 0, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    let k = 0;
    this.view = {
      tick: () => {
        const i = this.sel.cam, c = C[i];
        if (c && this.camOwned(i)) {
          this.hooks.camRender?.(i); this.cctv.read(i, big);
          M.querySelector('.nm').textContent = `CAM ${String(i + 1).padStart(2, '0')} · ${c.name}`;
          M.querySelector('.ovb').textContent = `${this.clock()}  ${c.irNow ? 'IR' : ''}  ${c.ptz ? `Z ${c.zoom.toFixed(1)}×` : ''}`;
        } else { bg.fillStyle = '#05080b'; bg.fillRect(0, 0, big.width, big.height); }
        // the thumbnails in view, one each tick, round them
        const mr = M.getBoundingClientRect(), vis = thumbs.filter(t => { const r = t.t.getBoundingClientRect(); return r.bottom > mr.top && r.top < mr.bottom; });
        if (vis.length) { const t = vis[k++ % vis.length]; if (t.i !== i) this.hooks.camRender?.(t.i); this.cctv.readTo(t.i, t.c); }
      },
    };
  }
  // the video wall's eight screens: the pinned cameras that are yours, then the rest of yours
  wallSlots() {
    const C = this.cctv.cams, mine = C.map((c, i) => i).filter(i => this.camOwned(i));
    const slots = this.wallPin.slice(0, 8).map(i => (i >= 0 && this.camOwned(i) ? i : -1));
    for (const i of mine) { if (slots.filter(x => x >= 0).length >= 8) break; if (!slots.includes(i)) { const e = slots.indexOf(-1); if (e >= 0) slots[e] = i; else if (slots.length < 8) slots.push(i); } }
    while (slots.length < 8) slots.push(-1);
    return slots;
  }
  wallList() { return this.wallSlots().map(i => (i < 0 ? null : { tex: this.cctv.texture(i), name: this.cctv.cams[i].name, ip: this.cctv.cams[i].ip, ir: !!this.cctv.cams[i].irNow, i })); }

  // ---------------------------------------------------------------- Energie
  energie() {
    const M = this.$main;
    M.innerHTML = `<h2>Energie <small>postul de transformare din pădurea crucii · PTA 20/0,4 kV, 100 kVA</small></h2><div class="gate" style="display:none"></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)"><div class="card"><h3>Schema monofilară</h3><svg viewBox="0 0 640 330" style="width:100%"></svg></div><div class="card"><h3>Alimentarea postului 7</h3><div class="kv pk"></div><div class="mut" style="margin-top:10px">Postul se alimentează din faza L2 a postului de transformare. Fără ea, UPS-ul ține sarcina ~9 s, cât pornește generatorul diesel.</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Întreruptoare</h3><div class="sld"></div></div>`;
    const svg = M.querySelector('svg'), sld = M.querySelector('.sld'), gate = M.querySelector('.gate');
    const L = { IG: 'Întreruptorul general · 160 A', IP: 'Iluminatul public', L1: 'Plecarea L1 · o treime din case', L2: 'Plecarea L2 · și postul 7', L3: 'Plecarea L3 · o treime din case' };
    const draw = () => {
      const p = this.hooks.power?.() ?? {}, g = this.owned('grid'), li = this.owned('lights');
      const on = (k) => !!p[k] && (k === 'IG' || !!p.IG);
      const brk = (x, y, k) => `<g data-k="${k}" style="cursor:${g || (k === 'IP' && li) ? 'pointer' : 'default'}"><rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="5" fill="${p[k] ? '#0f2a1a' : '#3b1013'}" stroke="${p[k] ? '#22c55e' : '#ef4444'}" stroke-width="2"/><text x="${x}" y="${y + 5}" fill="${p[k] ? '#86efac' : '#fca5a5'}" font-size="12" text-anchor="middle" font-weight="700">${k}</text></g>`;
      const wire = (x1, y1, x2, y2, live) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${live ? '#f59e0b' : '#334155'}" stroke-width="3"/>`;
      svg.innerHTML = `<text x="40" y="30" fill="#7c8ea2" font-size="12">LEA 20 kV</text>${wire(40, 40, 40, 70, true)}<circle cx="40" cy="90" r="18" fill="none" stroke="#f59e0b" stroke-width="2.5"/><circle cx="40" cy="112" r="18" fill="none" stroke="#f59e0b" stroke-width="2.5"/><text x="68" y="104" fill="#9fb2c5" font-size="12">20 / 0,4 kV · 100 kVA</text>
        ${wire(40, 130, 40, 165, true)}${brk(40, 180, 'IG')}${wire(40, 195, 40, 225, on('IG'))}${wire(40, 225, 600, 225, on('IG'))}<text x="60" y="216" fill="#7c8ea2" font-size="11">bara de 0,4 kV</text>
        ${[['L1', 170], ['L2', 300], ['L3', 430], ['IP', 560]].map(([k, x]) => `${wire(x, 225, x, 250, on('IG'))}${brk(x, 265, k)}${wire(x, 280, x, 310, on(k))}<text x="${x}" y="326" fill="#7c8ea2" font-size="11" text-anchor="middle">${k === 'IP' ? 'felinarele' : k === 'L2' ? 'case · postul 7' : 'case'}</text>`).join('')}`;
      gate.style.display = g ? 'none' : 'flex';
      gate.innerHTML = g ? '' : `<div><b>Nodul SCADA al postului de transformare nu e al tău.</b><div class="mut">pta-padure-scada (10.7.20.5) · intră în el ca să-i comanzi întreruptoarele${li ? '' : '; felinarele au controlerul lor, iluminat-public (10.7.20.6)'}.</div></div><button class="btn pri" data-h="grid">Preia controlul</button>`;
      sld.innerHTML = Object.entries(L).map(([k, n]) => { const can = g || (k === 'IP' && li); return `<div class="brk"><b><span class="dot ${p[k] ? '' : 'r'}" style="display:inline-block;margin-right:7px"></span>${esc(n)}</b><span class="mut">${p[k] ? 'închis · conduce' : 'deschis'}${k !== 'IG' && !p.IG ? ' (fără tensiune: IG deschis)' : ''}</span><button class="btn sm ${p[k] ? 'red' : 'grn'}" data-k="${k}" ${can ? '' : 'disabled'}>${p[k] ? 'Deschide' : 'Închide'}</button></div>`; }).join('');
      const f = this.hooks.feed?.() ?? {};
      M.querySelector('.pk').innerHTML = `<span>Sursa</span><b>${{ retea: 'rețeaua (L2)', ups: 'UPS · baterii', generator: 'generator diesel 30 kVA' }[f.source] ?? '?'}</b><span>Sarcina</span><b>4,1 kW</b><span>UPS</span><b>${Math.round(f.ups ?? 100)}%</b><span>Autonomie UPS</span><b>~${Math.round((f.ups ?? 100) / 10)} min</b><span>Motorină</span><b>${Math.round(f.fuel ?? 100)}% · ~${Math.round((f.fuel ?? 100) * 1.8)} h</b>`;
    };
    const act = (k) => {
      const p = this.hooks.power?.() ?? {}, g = this.owned('grid'), li = this.owned('lights');
      const d = g ?? (k === 'IP' ? li : null); if (!d) return;
      const r = this.net.act(d.ip, `${k}:${p[k] ? 0 : 1}`); this.log(`${d.host}: ${r.msg}`, 'a'); draw();
    };
    M.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-k]'); if (b && !b.disabled) return act(b.dataset.k);
      const h = e.target.closest('[data-h]');
      if (h) { h.disabled = true; h.textContent = 'se conectează...'; await this.hack(this.dev('grid').ip, (t, c) => { this.out(t, c); if (c !== 'd') h.textContent = t.slice(0, 40); }); draw(); }
    });
    let last = '';
    this.view = { tick: () => { const k = JSON.stringify([this.hooks.power?.(), this.hooks.feed?.()?.source, Math.round(this.hooks.feed?.()?.ups ?? 0), !!this.owned('grid'), !!this.owned('lights')]); if (k !== last) { last = k; draw(); } } };
    draw();
  }

  // ---------------------------------------------------------------- Meteo · NOR
  meteo() {
    const M = this.$main;
    M.innerHTML = `<h2>Meteo · NOR <small>stația de pe dealul crucii · lansatorul antigrindină LG-12 de peste Câmpina</small></h2>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="card"><h3>Radar · 30 km</h3><canvas width="520" height="520" style="width:100%;max-width:520px;display:block;margin:auto;border-radius:10px"></canvas></div>
      <div style="display:flex;flex-direction:column;gap:14px"><div class="card mc"></div><div class="card lc"></div></div></div>`;
    const c = M.querySelector('canvas'), g = c.getContext('2d'), mc = M.querySelector('.mc'), lc = M.querySelector('.lc');
    let last = '';
    const panels = () => {
      const st = this.owned('meteo'), ln = this.owned('launcher'), m = this.hooks.meteo?.() ?? {};
      const key = JSON.stringify([!!st, !!ln, m, this.rockets, this.pending.map(p => [p.w, Math.ceil(p.t)]), this.hooks.storm?.()]);
      if (key === last) return; last = key;
      mc.innerHTML = st ? `<h3>Stația meteo <span class="pill g">live</span></h3><div class="kv"><span>Vremea</span><b>${esc(m.label)}</b><span>Temperatura</span><b>${m.temp} °C</b><span>Umiditatea</span><b>${m.hum}%</b><span>Presiunea</span><b>${m.pres} hPa</b><span>Vântul</span><b>${m.wind} m/s · rafale ${m.gust} m/s</b><span>Precipitații</span><b>${m.rain} mm/h</b><span>Nebulozitate</span><b>${m.cloud}%</b><span>Vizibilitate</span><b>${m.vis}</b></div>`
        : `<h3>Stația meteo <span class="pill">fără date</span></h3><div class="mut" style="margin-bottom:10px">meteo-dealul-crucii (10.7.40.9) dă telemetria oricui o cere, fără cont.</div><button class="btn pri sm" data-h="meteo">Conectează-te</button>`;
      lc.innerHTML = ln ? `<h3>LG-12 · NOR <span class="pill g">controlat</span></h3><div class="kv"><span>Rachete AgI</span><b>${this.rockets} / 18</b><span>Lansare</span><b>${this.pending.length ? `${LAUNCH[this.pending[0].w][0]} în ${Math.ceil(this.pending[0].t)} s` : 'nimic în curs'}</b></div>
          <div class="row" style="margin-top:12px">${Object.entries(LAUNCH).map(([k, [n, need]]) => `<button class="btn sm ${k === 'strike' ? 'red' : k === 'seed' ? 'pri' : ''}" data-l="${k}" ${this.pending.length || this.rockets < need || (k === 'strike' && !this.hooks.storm?.()) ? 'disabled' : ''}>${esc(n)} · ${need}</button>`).join('')}</div>
          <div class="mut" style="margin-top:10px">Iodura de argint dă norului nuclee de gheață: trasă la baza unui nor de grindină îl destramă; trasă devreme într-o celulă care crește, o hrănește. Racheta cu fir aduce trăsnetul pe firul ei - așa se studiază trăsnetul pe teren.</div>`
        : `<h3>LG-12 · NOR <span class="pill a">neautorizat</span></h3><div class="mut" style="margin-bottom:10px">lg12-campina (10.7.40.2) · modemul radio al lansatorului.</div><button class="btn pri sm" data-h="launcher">Preia controlul</button>`;
    };
    M.addEventListener('click', async (e) => {
      const l = e.target.closest('[data-l]'); if (l && !l.disabled) { const r = this.net.act(this.owned('launcher').ip, l.dataset.l); this.toast(r.msg); last = ''; panels(); return; }
      const h = e.target.closest('[data-h]');
      if (h) { h.disabled = true; h.textContent = 'se conectează...'; await this.hack(this.dev(h.dataset.h).ip, (t, cc) => { this.out(t, cc); if (cc !== 'd') h.textContent = t.slice(0, 40); }); last = ''; panels(); }
    });
    this.view = { tick: () => { this.drawRadar(g, 520, 520, this.hooks.weather?.() ?? 'senin', performance.now() / 1000); panels(); } };
    this.view.tick();
  }
  drawRadar(g, w, h, wx, t = 0) {
    g.fillStyle = '#03070b'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    // the echoes: stronger the worse the weather (the dBZ colours: green, yellow, red, magenta)
    const k = { senin: 0, noros: 0.05, innorat: 0.15, ceata: 0.1, ploaie: 0.45, rafale: 0.6, furtuna: 1, ninsoare: 0.35, viscol: 0.6, zapada: 0.3 }[wx] ?? 0.1;
    const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 90 * k; i++) {
      const a = rnd(i) * 6.283 + t * 0.008, core = i < 14 * k, d = R * (0.1 + 0.85 * rnd(i + 99)) * (core ? 0.35 : 1), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const s = 7 + 28 * rnd(i + 7) * k, lev = rnd(i + 3) * k + (core ? 0.4 : 0);
      g.fillStyle = lev > 0.95 ? 'rgba(220,40,220,.5)' : lev > 0.7 ? 'rgba(235,50,40,.45)' : lev > 0.45 ? 'rgba(240,200,40,.4)' : 'rgba(60,200,70,.32)';
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(80,140,200,.28)'; g.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const sw = t * 1.1, gr = g.createConicGradient ? g.createConicGradient(sw - 0.6, cx, cy) : null;
    if (gr) { gr.addColorStop(0, 'rgba(80,200,255,0)'); gr.addColorStop(0.09, 'rgba(80,200,255,.16)'); gr.addColorStop(0.1, 'rgba(80,200,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); }
    g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
    g.fillStyle = '#8aa3bd'; g.font = '12px "Segoe UI", sans-serif'; g.fillText('postul 7', cx + 8, cy - 6); g.fillText('N', cx - 4, cy - R - 6); g.fillText('10 km', cx + R * 0.33 + 4, cy - 4);
  }

  // ---------------------------------------------------------------- Vehicule
  vehicule() {
    const M = this.$main;
    M.innerHTML = `<h2>Vehicule <small>unitățile telematice ale mașinilor de lângă deal (modem 4G, cheie fără contact)</small></h2><div class="grid lst" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"></div>`;
    const L = M.querySelector('.lst');
    let last = '';
    const draw = () => {
      const cars = this.hooks.cars?.() ?? [], devs = this.net.devs.filter(d => d.kind === 'car');
      const key = JSON.stringify(devs.map(d => [d.owned, d.found])) + cars.map(c => c.id + Math.round(c.dist / 20)).join();
      if (key === last) return; last = key;
      L.innerHTML = devs.map(d => {
        const c = cars.find(x => x.id === d.car);
        return `<div class="card"><h3>${esc(c?.name ?? d.car)} <span class="pill ${d.owned ? 'g' : ''}">${d.owned ? 'controlată' : 'blocată'}</span></h3><div class="kv"><span>Adresa</span><b>${d.ip}</b><span>Distanța</span><b>${c ? c.dist + ' m' : 'în afara razei'}</b></div>
          <div class="row" style="margin-top:12px">${d.owned ? (ACTIONS.car.map(([k, n]) => `<button class="btn sm grn" data-c="${d.ip}" data-w="${k}" ${c ? '' : 'disabled'}>${esc(n)}</button>`).join('')) : `<button class="btn sm pri" data-h="${d.ip}">Preia controlul</button>`}</div></div>`;
      }).join('') || '<div class="mut">Nicio mașină în raza modemului.</div>';
    };
    M.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-c]'); if (b && !b.disabled) { const r = this.net.act(b.dataset.c, b.dataset.w); this.toast(r.msg); this.log(r.msg, 'a'); return; }
      const h = e.target.closest('[data-h]');
      if (h) { h.disabled = true; h.textContent = 'se conectează...'; await this.hack(h.dataset.h, (t, c) => { this.out(t, c); if (c !== 'd') h.textContent = t.slice(0, 40); }); last = ''; draw(); }
    });
    this.view = { tick: draw };
    draw();
  }

  // ---------------------------------------------------------------- Web: the desktop app's own browser (a host MCP
  // server), its text read back; nothing else can reach the internet from the page
  web() {
    const M = this.$main, W = this.webSt, ok = !!this.cap?.mcp;
    M.innerHTML = `<div class="web"><h2>Web <small>${ok ? 'prin navigatorul integrat al aplicației Claude' : 'fără navigator în acest mod de rulare'}</small></h2>
      <div class="url"><input spellcheck="false" placeholder="o adresă (exemplu.ro) sau ce cauți" value="${esc(W.url)}"><button class="btn pri" data-go="1">Deschide</button></div><div class="page"></div></div>`;
    const I = M.querySelector('input'), P = M.querySelector('.page');
    const paint = () => {
      if (W.busy) { P.textContent = `Se deschide ${W.url} ...`; return; }
      if (W.text) { P.textContent = (W.title ? W.title + '\n' + W.url + '\n\n' : W.url + '\n\n') + W.text; return; }
      P.textContent = ok ? 'Scrie o adresă sau o căutare. Pagina se deschide în navigatorul aplicației desktop Claude (îl vezi în panoul lui) și aici apare textul ei. Asistentul îl poate folosi și el.'
        : 'Pagina jocului nu are voie să iasă singură pe internet: așa sunt făcute artefactele de pe claude.ai (și jocul rulat local nu are nici el pe unde).\n\nSingura cale ar fi navigatorul integrat al aplicației desktop Claude, cerut de joc la publicare; e oprită deocamdată, pentru că n-am putut-o verifica. Asistentul îți răspunde totuși din ce știe.';
    };
    const go = () => { const q = I.value.trim(); if (q) this.webGo(q).then(paint); paint(); };
    M.addEventListener('click', (e) => { if (e.target.closest('[data-go]')) go(); });
    I.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    this.view = { tick: () => { if (this.webDirty) { this.webDirty = false; I.value = W.url; paint(); } } };
    paint();
  }
  webUrl(q) { q = String(q).trim(); return /^https?:\/\//i.test(q) ? q : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) ? 'https://' + q : 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q); }
  // opens the address in the app's browser and reads its text back (throws with the reason when it cannot)
  async webFetch(q, signal) {
    const mcp = this.cap?.mcp, url = this.webUrl(q);
    if (!mcp) throw new Error('navigatorul nu e disponibil: jocul trebuie deschis în aplicația desktop Claude, de proprietarul lui');
    const why = (e) => ({ server_not_connected: 'navigatorul aplicației nu e conectat (merge doar în aplicația desktop Claude, pentru proprietarul jocului)', not_in_manifest: 'navigatorul nu e permis pentru această pagină', cancelled: 'oprit', approval_required: 'aplicația cere aprobarea ta pentru navigare', tool_error: 'pagina nu s-a putut deschide' }[e?.code] ?? (e?.message || 'eroare necunoscută'));
    try {
      await mcp.callTool(BROWSER, 'navigate', { url }, { signal });
      const r = await mcp.callTool(BROWSER, 'get_page_text', {}, { signal });
      const p = r?.payload;
      const text = typeof p === 'string' ? p : Array.isArray(p?.content) ? p.content.filter(c => c?.type === 'text').map(c => c.text).join('\n') : typeof p?.text === 'string' ? p.text : JSON.stringify(p ?? '');
      return { url, text: String(text).replace(/\n{3,}/g, '\n\n').trim() };
    } catch (e) { throw new Error(why(e)); }
  }
  async webGo(q) {
    const W = this.webSt; W.url = this.webUrl(q); W.busy = true; W.text = ''; W.title = ''; this.webDirty = true;
    try { const r = await this.webFetch(q); W.text = r.text.slice(0, 60000) || '(pagina nu are text)'; this.log('Web: ' + W.url, ''); }
    catch (e) { W.text = 'Nu s-a putut deschide: ' + e.message; }
    finally { W.busy = false; this.webDirty = true; }
  }

  // ---------------------------------------------------------------- Jurnal
  jurnal() {
    const M = this.$main;
    M.innerHTML = '<h2>Jurnal <small>evenimentele sistemului, cele noi sus</small></h2><div class="card"><div class="evs"></div></div>';
    const E = M.querySelector('.evs'); let n = -1;
    this.view = { tick: () => { if (this.evN === n) return; n = this.evN; E.innerHTML = this.events.map(e => `<div class="ev ${e.kind}"><span>${e.t}</span><b>${esc(e.msg)}</b></div>`).join('') || '<div class="mut">nimic încă</div>'; } };
    this.view.tick();
  }

  // ---------------------------------------------------------------- the assistant
  aiBuild() {
    const A = this.$ai;
    A.innerHTML = `<div class="aih"><b>${SVG(IC.ai, 18)}Asistent</b><span class="pill st">se verifică</span><button class="ib" data-v="voice" title="Citește răspunsurile cu voce">${SVG(IC.vol, 18)}</button><button class="btn sm" data-v="tier" title="Rapid: răspunde în câteva secunde. Atent: gândește mai mult.">Rapid</button></div>
      <div class="msgs"></div><div class="sug"></div>
      <div class="aif"><button class="ib" data-v="mic" title="Vorbește (dictare)">${SVG(IC.mic, 18)}</button><textarea rows="1" placeholder="Scrie sau vorbește..."></textarea><button class="ib pri" data-v="send" title="Trimite (Enter)">${SVG(IC.send, 18)}</button></div>`;
    this.$msgs = A.querySelector('.msgs'); this.$ta = A.querySelector('textarea'); this.$sug = A.querySelector('.sug');
    this.$ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.aiSend(); } });
    this.$ta.addEventListener('input', () => this.autoGrow());
    A.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      const s = e.target.closest('[data-s]'); if (s) { this.aiSend(s.dataset.s); return; }
      if (!b) return;
      const v = b.dataset.v;
      if (v === 'send') { if (this.ai.busy) this.ai.busy.abort(); else this.aiSend(); }
      if (v === 'tier') { this.ai.tier = this.ai.tier === 'quick' ? 'default' : 'quick'; b.textContent = this.ai.tier === 'quick' ? 'Rapid' : 'Atent'; }
      if (v === 'voice') { this.ai.voice = !this.ai.voice; if (!this.ai.voice) this.cap?.tts?.stop?.().catch(() => {}); this.save(); this.paintVoice(); }
      if (v === 'mic') {
        const d = this.cap?.dictation; if (!d) return;
        // (start straight from the click, nothing awaited before it: the platform asks the viewer the first time)
        if (d.active?.()) d.stop().catch(() => {});
        else d.start({ language: 'ro-RO' }).catch((err) => { if (err?.code === 'not_granted' || err?.code === 'unavailable') { this.cap.dictation = null; this.paintVoice(); } else if (err?.code !== 'stopped' && err?.code !== 'dismissed') this.bubble('e', 'Dictarea nu a pornit: ' + (err?.message ?? err?.code ?? '')); });
      }
    });
    this.refreshAi();
  }
  refreshAi() {
    if (!this.$ai) return;
    const S = this.cap?.sample, st = this.$ai.querySelector('.st');
    st.className = 'pill st ' + (S ? 'g' : this.capDone ? '' : 'b');
    st.textContent = S ? (this.cap.tools ? 'conectat · unelte' : 'conectat') : this.capDone ? 'indisponibil aici' : 'se verifică';
    if (!this.$msgs.childElementCount) {
      if (S) this.bubble('i', 'Sunt asistentul postului. Pot scana rețeaua, intra în dispozitive, lucra cu camerele, curentul, lansatorul și mașinile' + (this.cap.browser ? ', și pot citi pagini web prin navigatorul aplicației' : '') + '. Spune-mi ce vrei.' + (this.cap.dictation ? ' Poți și să-mi vorbești: butonul microfonului.' : ''));
      else if (this.capDone) this.bubble('i', 'Asistentul e Claude, prin capabilitatea „sample” a artefactului: merge când jocul e deschis de pe linkul lui de pe claude.ai (la prima întrebare îți cere acordul). Aici jocul rulează fără claude.ai, deci asistentul nu e disponibil. Terminalul și toate aplicațiile merg și fără el.');
    }
    this.$sug.innerHTML = S && this.ai.msgs.length === 0 ? ['Scanează rețeaua și spune-mi ce e vulnerabil', 'Preia toate camerele', 'Taie curentul în comună', 'Adu o furtună peste deal', 'Ce vreme e acum?', ...(this.cap.browser ? ['Caută pe internet știri din Câmpina'] : [])].map(t => `<button data-s="${esc(t)}">${esc(t)}</button>`).join('') : '';
    this.paintVoice();
  }
  paintVoice() {
    if (!this.$ai) return;
    const v = this.$ai.querySelector('[data-v="voice"]'), m = this.$ai.querySelector('[data-v="mic"]');
    v.disabled = !this.cap?.tts; v.classList.toggle('on', !!this.cap?.tts && this.ai.voice);
    v.title = this.cap?.tts ? (this.ai.voice ? 'Vocea e pornită (clic: oprește)' : 'Citește răspunsurile cu voce') : 'Vocea nu e disponibilă în acest browser / mod';
    m.disabled = !this.cap?.dictation; m.classList.toggle('on', this.micState === 'listening' || this.micState === 'starting');
    m.title = this.cap?.dictation ? (this.micState === 'listening' ? 'Ascult... (clic: gata)' : 'Vorbește (dictare)') : 'Dictarea nu e disponibilă aici (merge în Chrome / Edge pe claude.ai)';
  }
  paintSend() { const b = this.$ai?.querySelector('[data-v="send"]'); if (b) { b.innerHTML = SVG(this.ai.busy ? IC.stop : IC.send, 18); b.title = this.ai.busy ? 'Oprește' : 'Trimite (Enter)'; } }
  autoGrow() { const t = this.$ta; if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
  bubble(k, text) { const d = document.createElement('div'); d.className = 'm ' + k; d.textContent = text; this.$msgs.appendChild(d); this.$msgs.scrollTop = 1e9; this.$sug && (this.$sug.innerHTML = ''); return d; }
  // what the assistant is told every time (it remembers nothing between calls): who it is, the rules, the state now
  aiBrief() {
    return `Ești VEGHE, asistentul sistemului de operațiuni din Postul 7: un centru de operațiuni modern, îngropat sub dealul crucii, într-un joc video (o simulare a comunei Poiana Câmpina, județul Prahova). Jucătorul e operatorul și îți vorbește de la consolă.
Reguli:
- Răspunde în română, scurt (câteva propoziții), clar, ca un asistent de operațiuni. Fără titluri și liste lungi.
- Când operatorul cere ceva ce se face în sistem, fă-o cu uneltele tale, apoi spune pe scurt ce s-a întâmplat. Dacă îți lipsește o informație, cere starea cu „stare”.
- Pașii pe o gazdă: retea_scaneaza, retea_sondeaza, retea_vulnerabilitati, retea_exploateaza; sau retea_preia (toți pașii). Dispozitivele controlate se comandă cu dispozitiv_comanda.
- Rețeaua, serviciile, protocoalele și slăbiciunile (ID-uri NX-...) sunt inventate pentru joc: folosește-le liber. Nu da instrucțiuni de atac pentru sisteme reale; dacă ți se cer, spune că aici e doar simularea jocului.
- Despre lumea reală: răspunde din ce știi${this.cap?.browser ? '; poți citi pagini web cu web_citeste și web_cauta (spune de unde ai informația)' : '; nu ai acces la internet în acest mod'}.
Starea acum: ${JSON.stringify(this.aiState())}`;
  }
  aiState() {
    const f = this.hooks.feed?.() ?? {}, p = this.hooks.power?.() ?? {}, m = this.hooks.meteo?.() ?? {};
    return {
      ora: this.timeStr(), data: this.hooks.date?.(), vremea: m.label, temperatura: m.temp,
      alimentarea_postului: { sursa: f.source, ups: Math.round(f.ups ?? 100), motorina: Math.round(f.fuel ?? 100) },
      comuna: { curent: !!p.IG, felinare: !!(p.IG && p.IP), L1: !!p.L1, L2: !!p.L2, L3: !!p.L3 },
      retea: this.net.summary().filter(d => !['router', 'server'].includes(d.kind)).map(d => ({ ip: d.ip, nume: d.host, tip: d.kind, stare: d.owned ? 'controlat' : d.known ? (d.weak.length ? 'vulnerabil' : 'fara_slabiciuni') : d.probed ? 'sondat' : 'gasit', ...(d.weak.length && !d.owned ? { slabiciuni: d.weak } : {}), ...(d.actions.length ? { actiuni: d.actions } : {}) })),
      gazde_negasite: this.net.devs.filter(d => !d.found).length,
      camere: { total: this.cctv.cams.length, live: this.cctv.cams.filter((c, i) => this.camOwned(i)).length },
      nor: { rachete: this.rockets, in_curs: this.pending.map(x => x.w) },
      aplicatia_deschisa: this.app, web: !!this.cap?.browser,
    };
  }
  aiTools() {
    const N = this.net, out = (t, c) => this.out(t, c);
    const chip = (t) => { const d = this.bubble('t', '⚙ ' + t); if (this.aiEl?.parentNode === this.$msgs) this.$msgs.insertBefore(d, this.aiEl); return d; };
    const fast = async (fn) => { const s = N.speed; N.speed = 3; try { return await fn(); } finally { N.speed = s; } };
    const host = { type: 'object', properties: { gazda: { type: 'string', description: 'IP-ul sau numele gazdei (ex. 10.7.20.5 sau pta-padure-scada)' } }, required: ['gazda'] };
    const need = (g) => { const d = N.get(this.ipOf(String(g ?? ''))); if (!d) throw new Error(`nu cunosc gazda ${g}`); return d; };
    const camOf = (q) => { const C = this.cctv.cams, s = String(q ?? '').toLowerCase().trim(), n = parseInt(s, 10); let i = Number.isFinite(n) && String(n) === s ? n - 1 : C.findIndex(c => c.ip === s || c.host === s); if (i < 0) i = C.findIndex(c => c.name.toLowerCase().includes(s)); if (!C[i]) throw new Error('nu găsesc camera ' + q); return i; };
    const T = [
      { name: 'stare', description: 'Starea sistemului acum: ora, vremea, alimentarea, curentul comunei, gazdele cunoscute din rețea (stare, slăbiciuni, acțiuni posibile), camerele, lansatorul.', execute: () => this.aiState() },
      { name: 'retea_scaneaza', description: 'Scanează rețeaua comunei (10.7.0.0/16). Întoarce gazdele găsite.', execute: async (_, ctx) => { chip('scanez rețeaua'); await fast(() => N.scan(out, ctx.signal)); this.log('Asistentul a scanat rețeaua', ''); return N.summary().map(d => ({ ip: d.ip, nume: d.host, tip: d.kind, controlat: d.owned })); } },
      { name: 'retea_sondeaza', description: 'Sondează o gazdă găsită: porturile și serviciile ei.', inputSchema: host, execute: async ({ gazda }, ctx) => { const d = need(gazda); chip('sondez ' + d.host); await fast(() => N.probe(d.ip, out, ctx.signal)); if (!d.probed) throw new Error('scanează rețeaua întâi'); return { ip: d.ip, porturi: d.ports }; } },
      { name: 'retea_vulnerabilitati', description: 'Caută slăbiciunile cunoscute ale unei gazde sondate.', inputSchema: host, execute: async ({ gazda }, ctx) => { const d = need(gazda); chip('caut slăbiciunile ' + d.host); await fast(() => N.vulns(d.ip, out, ctx.signal)); if (!d.known) throw new Error('sondează gazda întâi'); return d.weak.map(w => ({ id: w.id, scor: w.sev, ce: w.title })); } },
      { name: 'retea_exploateaza', description: 'Intră într-o gazdă folosind o slăbiciune cunoscută (id opțional, ex. NX-1137). Întoarce dacă a reușit.', inputSchema: { type: 'object', properties: { gazda: host.properties.gazda, id: { type: 'string' } }, required: ['gazda'] }, execute: async ({ gazda, id }, ctx) => { const d = need(gazda); chip('exploatez ' + d.host); const ok = await fast(() => N.breach(d.ip, id ? String(id) : null, out, ctx.signal)); if (ok) this.log(`Asistentul a obținut acces: ${d.host}`, 'g'); return { reusit: ok, gazda: d.host }; } },
      { name: 'retea_preia', description: 'Toți pașii pe o gazdă (o găsește, o sondează, îi caută slăbiciunile, intră). Întoarce dacă a reușit și ce acțiuni are.', inputSchema: host, execute: async ({ gazda }, ctx) => { const d = need(gazda); chip('preiau ' + d.host); const ok = await fast(() => this.hack(d.ip, out, ctx.signal)); return { reusit: ok, gazda: d.host, actiuni: ok ? (ACTIONS[d.kind] ?? []).map(a => a[0] + ' = ' + a[1]) : [] }; } },
      { name: 'retea_preia_toate', description: 'Preia toate dispozitivele de un tip, unul după altul: camera (toate camerele comunei) sau car (toate mașinile). Întoarce câte a preluat.', inputSchema: { type: 'object', properties: { tip: { type: 'string', enum: ['camera', 'car'] } }, required: ['tip'] }, execute: async ({ tip }, ctx) => { const k = String(tip) === 'car' ? 'car' : 'camera'; chip(k === 'car' ? 'preiau toate mașinile' : 'preiau toate camerele'); const n = await this.hackAll(k, out, ctx.signal); this.log(`Asistentul a preluat ${n} ${k === 'car' ? 'mașini' : 'camere'}`, 'g'); return { preluate: n }; } },
      { name: 'dispozitiv_comanda', description: 'Comandă un dispozitiv controlat. pta-padure-scada: IG|L1|L2|L3 urmat de :0 (oprește) sau :1 (pornește), IG fiind tot curentul comunei; iluminat-public: IP:0|IP:1; lg12-campina: seed (furtună), rain (ploaie), clear (senin), strike (trăsnet, numai în furtună); mașinile (auto-...): lights, horn, alarm.', inputSchema: { type: 'object', properties: { gazda: host.properties.gazda, actiune: { type: 'string' } }, required: ['gazda', 'actiune'] }, execute: ({ gazda, actiune }) => { const d = need(gazda); const r = N.act(d.ip, String(actiune)); chip(`${d.host}: ${r.msg}`); if (!r.ok) throw new Error(r.msg); this.log(`Asistentul · ${d.host}: ${r.msg}`, 'a'); return r.msg; } },
      { name: 'camere_lista', description: 'Camerele: număr, nume, IP, live sau blocată, PTZ.', execute: () => this.cctv.cams.map((c, i) => ({ nr: i + 1, nume: c.name, ip: c.ip, live: this.camOwned(i), ptz: !!c.ptz })) },
      { name: 'camera_arata', description: 'Arată operatorului imaginea unei camere (după număr, nume sau IP). Camerele blocate se preiau întâi cu retea_preia.', inputSchema: { type: 'object', properties: { camera: { type: 'string' } }, required: ['camera'] }, execute: ({ camera }) => { const i = camOf(camera), c = this.cctv.cams[i]; if (!this.camOwned(i)) throw new Error(`camera ${c.name} e blocată: retea_preia ${c.ip}`); this.sel.cam = i; this.go('camere'); chip('deschid camera ' + c.name); return { camera: c.name, ip: c.ip }; } },
      { name: 'meteo_citeste', description: 'Citirile stației meteo de pe dealul crucii (cere stația controlată: meteo-dealul-crucii).', execute: () => { if (!this.owned('meteo')) throw new Error('stația meteo nu e controlată: retea_preia meteo-dealul-crucii'); return this.hooks.meteo?.(); } },
      { name: 'aplicatie_deschide', description: 'Deschide o aplicație a sistemului pe ecranul operatorului: panou, terminal, retea, camere, energie, meteo, vehicule, web, jurnal.', inputSchema: { type: 'object', properties: { aplicatia: { type: 'string' } }, required: ['aplicatia'] }, execute: ({ aplicatia }) => { const a = String(aplicatia).toLowerCase().replace('ț', 't'); if (!APPS.some(x => x[0] === a)) throw new Error('aplicații: ' + APPS.map(x => x[0]).join(', ')); this.go(a); return 'deschisă: ' + a; } },
    ];
    if (this.cap?.browser) {
      T.push({ name: 'web_citeste', description: 'Deschide o adresă în navigatorul operatorului și întoarce textul paginii (primele ~6000 de caractere).', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, execute: async ({ url }, ctx) => { chip('deschid ' + url); const r = await this.webFetch(String(url), ctx.signal); this.webSt = { url: r.url, text: r.text.slice(0, 60000), title: '', busy: false }; this.webDirty = true; return { url: r.url, text: r.text.slice(0, 6000) }; } });
      T.push({ name: 'web_cauta', description: 'Caută pe web (DuckDuckGo) și întoarce textul rezultatelor (titluri, adrese, rezumate).', inputSchema: { type: 'object', properties: { intrebare: { type: 'string' } }, required: ['intrebare'] }, execute: async ({ intrebare }, ctx) => { chip('caut: ' + intrebare); const r = await this.webFetch(String(intrebare), ctx.signal); return { url: r.url, text: r.text.slice(0, 6000) }; } });
    }
    return T;
  }
  async aiSend(text) {
    if (!this.$ta) return;
    const q = String(text ?? this.$ta.value).trim(); if (!q) return;
    if (text === undefined) { this.$ta.value = ''; this.autoGrow(); }
    this.$ai.classList.remove('off'); this.root?.querySelector('[data-t="ai"]')?.classList.add('on');
    if (this.ai.busy) { this.bubble('i', 'Aștept să termin răspunsul de acum (sau apasă Oprește).'); return; }
    this.bubble('u', q);
    const S = this.cap?.sample;
    if (!S) { this.bubble('i', this.capDone ? 'Asistentul nu e disponibil aici: deschide jocul de pe linkul lui de pe claude.ai.' : 'Încă verific dacă asistentul e disponibil: încearcă din nou peste câteva secunde.'); return; }
    this.ai.msgs.push({ role: 'user', content: q });
    let turns = this.ai.msgs.slice(-14); while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
    const el = this.aiEl = this.bubble('a', 'Se gândește...');
    const ctl = this.ai.busy = new AbortController(); this.paintSend();
    const opts = { modelTier: this.ai.tier, signal: ctl.signal, onText: ({ text: t }) => { el.textContent = t; this.$msgs.scrollTop = 1e9; } };
    if (this.cap.tools) opts.tools = this.aiTools(); else opts.cache = false;
    try {
      const r = await S([{ role: 'user', content: this.aiBrief() }, ...turns], opts);
      el.textContent = r.text + (r.truncated ? '\n\n(răspuns tăiat: cere mai puțin deodată)' : '');
      this.ai.msgs.push({ role: 'assistant', content: r.text });
      // (the replies read aloud, when the operator turned the voice on: the text stays on screen)
      if (this.ai.voice && this.cap.tts) this.cap.tts.speak(r.text.slice(0, 2000)).catch((e) => { if (e?.code === 'not_granted' || e?.code === 'unavailable') { this.cap.tts = null; this.paintVoice(); } });
    } catch (e) {
      const code = e?.code ?? 'upstream_error';
      if (code === 'cancelled') { el.textContent = (e.text || '') + (e.text ? '\n\n' : '') + '(oprit)'; }
      else if (code === 'refused') { el.remove(); this.bubble('e', 'Asistentul a refuzat cererea aceasta.'); }
      else {
        if (e?.text) el.textContent = e.text; else el.remove();
        const why = { not_granted: 'Nu i-ai dat voie artefactului să folosească Claude (îl poți permite din meniul Permisiuni al paginii).', sampling_disabled: 'Claude nu e disponibil pentru acest cont.', rate_limited: 'Prea multe cereri acum: încearcă peste puțin.', session_expired: 'Sesiunea claude.ai a expirat: reîncarcă pagina.', tools_unavailable: 'Uneltele nu merg în această vizualizare.' }[code] ?? 'Eroare: ' + (e?.message ?? code);
        this.bubble('e', why);
        if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { this.cap.sample = null; this.refreshAi(); }
      }
    } finally { this.ai.busy = null; this.paintSend(); }
  }

  // ---------------------------------------------------------------- every frame (main.js): the launcher's salvos, the
  // shown app's live parts, the status bar
  update(dt) {
    this.reload += dt; if (this.reload > 120 && this.rockets < 18) { this.rockets++; this.reload = 0; }
    for (const p of this.pending) p.t -= dt;
    const done = this.pending.filter(p => p.t <= 0);
    if (done.length) this.pending = this.pending.filter(p => p.t > 0);
    for (const p of done) {
      const H = this.hooks;
      if (p.w === 'seed') H.setWeather?.('furtuna'); else if (p.w === 'rain') H.setWeather?.('ploaie'); else if (p.w === 'clear') H.setWeather?.('senin'); else if (p.w === 'strike') H.strike?.();
      const msg = { seed: 'NOR: furtuna e deasupra dealului', rain: 'NOR: plouă', clear: 'NOR: norii s-au rupt', strike: 'NOR: trăsnetul a coborât pe fir' }[p.w];
      H.notify?.(msg); this.log(msg, 'a');
    }
    if (!this.open) return;
    if ((this.liveT += dt) > 0.12) { this.liveT = 0; this.tick(); }
    if ((this.chipT = (this.chipT ?? 0) + dt) > 1) { this.chipT = 0; this.chips(); }
  }

  // ---------------------------------------------------------------- the console's own screens in the post (bunker.js
  // draws them on its monitors and on the situation table, twice a second)
  drawScreen(name, g, w, h) {
    const F = (s, wt = 600) => `${wt} ${s}px "Segoe UI", system-ui, Arial, sans-serif`;
    const rr = (x, y, ww, hh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, ww, hh, r); else g.rect(x, y, ww, hh); };
    g.fillStyle = '#060a0f'; g.fillRect(0, 0, w, h);
    if (name === 'table') { this.hooks.map?.(g, w, h, { cams: this.cctv.cams.map((c, i) => ({ x: c.x, z: c.z, live: this.camOwned(i) })) }); return; }
    const head = (title) => {
      g.fillStyle = '#0b1219'; g.fillRect(0, 0, w, 56);
      g.strokeStyle = '#4f9cff'; g.lineWidth = 3; g.beginPath(); g.ellipse(32, 28, 14, 8.5, 0, 0, 7); g.stroke(); g.fillStyle = '#4f9cff'; g.beginPath(); g.arc(32, 28, 4, 0, 7); g.fill();
      g.fillStyle = '#eef4fa'; g.font = F(23, 800); g.fillText('VEGHE', 56, 36);
      g.fillStyle = '#7f93a8'; g.font = F(19, 500); g.fillText(title, 158, 36);
      g.textAlign = 'right'; g.fillStyle = '#cfe0f1'; g.font = F(21); g.fillText(this.timeStr(), w - 18, 36); g.textAlign = 'left';
    };
    const N = this.net.devs, C = this.cctv.cams;
    if (name === 'main') {
      head(this.open ? (APPS.find(a => a[0] === this.app)?.[1] ?? 'Panou') : 'Panou');
      const f = this.hooks.feed?.() ?? {}, m = this.hooks.meteo?.() ?? {}, own = N.filter(d => d.owned && !d.own).length, found = N.filter(d => d.found && !d.own).length;
      const live = C.filter((c, i) => this.camOwned(i)).length;
      const cards = [['ALIMENTARE', { retea: 'Rețea', ups: 'UPS', generator: 'Generator' }[f.source] ?? '–', `UPS ${Math.round(f.ups ?? 100)}% · motorină ${Math.round(f.fuel ?? 100)}%`, f.source === 'retea' ? '#22c55e' : '#f59e0b'],
        ['REȚEA', `${own} / ${found || '–'}`, 'controlate / găsite', own ? '#22c55e' : '#64748b'],
        ['CAMERE', `${live} / ${C.length}`, 'live', '#38bdf8'],
        ['METEO', m.label ?? '–', `${m.temp ?? '?'} °C · vânt ${m.wind ?? '?'} m/s`, '#a78bfa']];
      const x0 = 18, y0 = 74, cw = (w - 54) / 2, ch = (h - y0 - 36) / 2;
      cards.forEach(([t, v, s, col], k) => {
        const x = x0 + (k % 2) * (cw + 18), y = y0 + Math.floor(k / 2) * (ch + 18);
        g.fillStyle = '#0d141c'; rr(x, y, cw, ch, 14); g.fill(); g.strokeStyle = '#1b2632'; g.lineWidth = 2; g.stroke();
        g.fillStyle = col; g.fillRect(x, y + 18, 5, ch - 36);
        g.fillStyle = '#7f93a8'; g.font = F(17, 700); g.fillText(t, x + 22, y + 38);
        g.fillStyle = '#f1f5f9'; g.font = F(String(v).length > 9 ? 34 : 44, 700); g.fillText(String(v), x + 22, y + ch * 0.62);
        g.fillStyle = '#9fb2c5'; g.font = F(17, 500); g.fillText(s, x + 22, y + ch - 22);
      });
      return;
    }
    if (name === 'left') {
      head('Rețea · 10.7.0.0/16');
      const hubs = { '0': [0.5, 0.56], '20': [0.2, 0.3], '30': [0.8, 0.3], '40': [0.22, 0.84], '50': [0.78, 0.84] }, by = {};
      for (const d of N) if (d.found || d.own) (by[d.ip.split('.')[2]] ??= []).push(d);
      for (const [s, L] of Object.entries(by)) {
        const [hx, hy] = hubs[s] ?? [0.5, 0.5], X = hx * w, Y = 56 + hy * (h - 76);
        if (s !== '0') { g.strokeStyle = '#1e3a5f'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.5, 56 + 0.56 * (h - 76)); g.lineTo(X, Y); g.stroke(); }
        L.forEach((d, i) => {
          const a = i / L.length * Math.PI * 2, R = s === '0' ? 70 : 52 + Math.min(40, L.length * 2.5), x = X + Math.cos(a) * R, y = Y + Math.sin(a) * R * 0.7;
          g.strokeStyle = '#18283a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Y); g.lineTo(x, y); g.stroke();
          g.fillStyle = d.own ? '#3b82f6' : d.owned ? '#22c55e' : d.known && d.weak.length ? '#f59e0b' : d.probed ? '#38bdf8' : '#94a3b8';
          g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
        });
        g.fillStyle = '#0b1118'; g.strokeStyle = '#2c4a70'; g.lineWidth = 3; g.beginPath(); g.arc(X, Y, 10, 0, 7); g.fill(); g.stroke();
      }
      if (!N.some(d => d.found && !d.own)) { g.fillStyle = '#5f7b99'; g.font = F(20, 500); g.textAlign = 'center'; g.fillText('rețeaua comunei: nescanată', w / 2, h - 30); g.textAlign = 'left'; }
      return;
    }
    if (name === 'right') {
      head('Terminal');
      const L = this.term.length ? this.term.slice(-15) : this.events.slice(0, 15).reverse().map(e => ({ t: `${e.t}  ${e.msg}`, c: e.kind === 'g' ? 'g' : e.kind === 'a' ? 'y' : '' }));
      const col = { d: '#6b7f93', g: '#4ade80', y: '#facc15', r: '#f87171', c: '#67e8f9', p: '#93c5fd' };
      g.font = '17px "Cascadia Mono", Consolas, "Courier New", monospace';
      L.forEach((l, i) => { g.fillStyle = col[l.c] ?? '#c9d4df'; g.fillText(l.t.length > 70 ? l.t.slice(0, 69) + '…' : l.t, 16, 86 + i * 24.5); });
    }
  }
}
