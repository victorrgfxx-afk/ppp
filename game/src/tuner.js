import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { specFor, stockMaps, stagePreset, stageFig, kitParts, clutchNm, evaluate, gameTune, cloneMaps, vinFor, WARN, VMAX_OFF } from './tunerdata.js';

// (V94) The autotuner: a laptop and an OBD flashing interface left on the veranda's steps by the dog. Taken (E), it is
// used from the driver's seat of any car standing still (U): the laptop starts, finds the interface, identifies the
// car's ECU, reads its file (the original kept), opens it in the map editor - where the Stage 1 preset or your own hand
// changes the maps, the engine model (tunerdata.js) answering with the power and torque they give - and writes it
// back. What is written drives the car: its pull, its top speed, its limiter. As on a real car: ignition on, engine
// stopped, the lights off, the battery watched, the original always kept to be written back.
// (V96) Stage 2 and Stage 3: a stage past the first is a file made for parts - its kit (tunerdata.js: an intercooler, a
// downpipe and an intake; then a hybrid turbo, injectors, a stronger clutch). The laptop's "Kit de piese" fits them (in
// the game at once; in a workshop hours or days), the editor's presets make the file for the kit fitted, and the same
// file on fewer parts gives what those parts allow - with the engine model's warnings.
// (V97) The speed limiter: on a car whose ECU limits its speed (the Maybach at 250 km/h, the user's Peugeot at 500) the
// editor takes it out or puts it back - "Vmax off": then the car goes as fast as its power, the air and its gears let
// it. The other cars have none: their top speed is the air's and the gearbox's, and the laptop says so.

const SPOT = { x: 5.615, z: 3.86 };          // on the lower of the two steps to the veranda's door (hero.js)
const T_BOOT = 3.4, T_ID = 2.6, T_READ = 9, T_WRITE = 13, T_MOUNT = 7;
const fmt = (x, d = 0) => x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (x, d = 0) => x.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- the things on the step ----------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const logoPath = (g, x, y, r) => {            // (the program's mark: a chip's hexagon with a rev needle in it)
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.stroke();
  g.beginPath(); g.arc(x, y + r * 0.15, r * 0.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.beginPath(); g.moveTo(x, y + r * 0.15); g.lineTo(x + r * 0.34, y - r * 0.22); g.stroke();
};
function buildProp(y) {
  const grp = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, metalness: 0.55, roughness: 0.42 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.1, roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0, roughness: 0.85 });
  const B = (w, h, d, x, yy, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, yy, z); return g; };
  // the laptop: its base, the lid open 108 deg at the hinge along its back edge
  const lean = 0.31, hz = 0.108, hy = 0.017, LH = 0.214;
  const lidAt = (u, off) => [hy + Math.cos(lean) * u - Math.sin(lean) * off, hz + Math.sin(lean) * u + Math.cos(lean) * off];   // (u up the lid, off out of its back)
  const [ly, lz] = lidAt(LH / 2, 0);
  const aluG = [B(0.325, 0.016, 0.225, 0, 0.009, 0), B(0.325, LH, 0.006, 0, ly, lz, lean)];
  const hinge = new THREE.CylinderGeometry(0.006, 0.006, 0.24, 10); hinge.rotateZ(Math.PI / 2); hinge.translate(0, hy, hz);
  const blackG = [hinge];
  for (const [fx, fz] of [[-0.14, -0.095], [0.14, -0.095], [-0.14, 0.095], [0.14, 0.095]]) blackG.push(B(0.03, 0.002, 0.012, fx, 0.001, fz));
  // the keys and the pad, drawn
  const keys = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#8f949b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#17191c';
    const rows = [14, 14, 13, 12, 11];
    rows.forEach((n, r) => { const kw = (w - 24) / 14; for (let k = 0; k < n; k++) { const x = 12 + k * kw + (r > 1 ? (r - 1) * 9 : 0), ww = (r === 2 && k === n - 1) || (r === 3 && (k === 0 || k === n - 1)) ? kw * 1.5 : kw; g.fillRect(x + 2, 10 + r * 30 + 2, ww - 4, 26); } });
    g.fillRect(12 + 2, 10 + 5 * 30 + 2, 70, 26); g.fillRect(90, 162, 250, 26); g.fillRect(346, 162, 152, 26);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '700 11px sans-serif';
    'QWERTYUIOP'.split('').forEach((c, k) => g.fillText(c, 12 + (k + 1.42) * (w - 24) / 14, 10 + 30 + 17));
    'ASDFGHJKL'.split('').forEach((c, k) => g.fillText(c, 12 + (k + 1.7) * (w - 24) / 14 + 9, 10 + 60 + 17));
    'ZXCVBNM'.split('').forEach((c, k) => g.fillText(c, 12 + (k + 2.2) * (w - 24) / 14 + 18, 10 + 90 + 17));
  });
  const deck = new THREE.PlaneGeometry(0.296, 0.118); deck.rotateX(-Math.PI / 2); deck.rotateY(Math.PI); deck.translate(0, 0.0172, 0.035);   // (its top row toward the hinge)
  const pad = new THREE.PlaneGeometry(0.105, 0.062); pad.rotateX(-Math.PI / 2); pad.translate(0, 0.0172, -0.066);
  const keyM = new THREE.MeshStandardMaterial({ map: keys, roughness: 0.55, metalness: 0.3 });
  const padM = new THREE.MeshStandardMaterial({ color: 0x7c8188, roughness: 0.25, metalness: 0.5 });
  // the screen, lit: the program waiting for a car
  const scr = canvasTex(640, 400, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#10161c'); bg.addColorStop(1, '#0a0d11'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#37d6c0'; g.lineWidth = 7; g.lineJoin = 'round'; logoPath(g, w / 2, 132, 62);
    g.fillStyle = '#e8edf2'; g.font = '700 46px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('ECU LAB', w / 2, 258);
    g.fillStyle = '#8b96a3'; g.font = '22px system-ui, sans-serif'; g.fillText('Conectează interfața la mufa OBD a mașinii', w / 2, 300);
    g.fillStyle = '#1e252d'; g.fillRect(170, 334, 300, 10); g.fillStyle = '#37d6c0'; g.fillRect(170, 334, 96, 10);
    g.fillStyle = '#171b21'; g.fillRect(0, 0, w, 30); g.fillStyle = '#8b96a3'; g.font = '15px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText('ECU LAB 4.2', 12, 21);
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(w - 20, 15, 5, 0, 7); g.fill();
  });
  const [sy, sz] = lidAt(LH / 2 + 0.002, -0.0034);
  const screen = new THREE.PlaneGeometry(0.303, 0.19); screen.rotateY(Math.PI); screen.rotateX(lean); screen.translate(0, sy, sz);
  const scrM = new THREE.MeshStandardMaterial({ color: 0x050607, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0 });
  // the interface: a small case with its lamps, the lead to the laptop, the long lead to the car's diagnostic socket
  // coiled beside it, its 16-pin plug at the end
  const bx = 0.31;
  const caseG = [B(0.15, 0.032, 0.092, bx, 0.016, 0.01), B(0.158, 0.012, 0.1, bx, 0.016, 0.01)];
  const lab = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#1b1f25'; g.fillRect(0, 0, w, h); g.strokeStyle = '#37d6c0'; g.lineWidth = 4; g.lineJoin = 'round'; logoPath(g, 40, 62, 24);
    g.fillStyle = '#e8edf2'; g.font = '700 30px system-ui, sans-serif'; g.fillText('FLASH', 78, 58); g.fillStyle = '#8b96a3'; g.font = '17px system-ui, sans-serif'; g.fillText('OBD · ECU', 79, 84);
    g.fillStyle = '#6fe08a'; g.beginPath(); g.arc(222, 38, 7, 0, 7); g.fill(); g.fillStyle = '#ffb347'; g.beginPath(); g.arc(222, 66, 7, 0, 7); g.fill(); g.fillStyle = '#39424d'; g.beginPath(); g.arc(222, 94, 7, 0, 7); g.fill();
  });
  const labG = new THREE.PlaneGeometry(0.138, 0.069); labG.rotateX(-Math.PI / 2); labG.rotateY(Math.PI); labG.translate(bx, 0.0323, 0.01);
  const labM = new THREE.MeshStandardMaterial({ map: lab, roughness: 0.5, metalness: 0.1 });
  const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'), pts.length * 8, r, 6, false);
  const usb = tube([[bx - 0.075, 0.014, 0.01], [bx - 0.1, 0.006, 0.02], [0.2, 0.004, 0.06], [0.1635, 0.008, 0.06]], 0.002);
  const coil = [[bx + 0.075, 0.016, 0.0], [bx + 0.11, 0.006, -0.01]];
  for (let k = 0; k <= 26; k++) { const a = -0.6 + k / 26 * Math.PI * 4.4, r = 0.055 + 0.0012 * k; coil.push([bx + 0.2 + Math.cos(a) * r, 0.0045 + 0.0035 * Math.floor(k / 13), 0.0 + Math.sin(a) * r * 0.85]); }
  coil.push([bx + 0.3, 0.008, -0.07], [bx + 0.33, 0.011, -0.075]);
  const lead = tube(coil, 0.0034);
  const plug = [B(0.05, 0.022, 0.03, bx + 0.355, 0.011, -0.077), B(0.02, 0.017, 0.036, bx + 0.385, 0.0105, -0.077)];
  const mesh = (geos, m) => { const o = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)) : geos[0], m); o.castShadow = o.receiveShadow = true; grp.add(o); return o; };
  mesh(aluG, alu); mesh([...blackG, usb, lead, ...plug], black); mesh(caseG, rubber);
  mesh([deck], keyM); mesh([pad], padM); mesh([labG], labM);
  const s = mesh([screen], scrM); s.castShadow = false;
  grp.position.set(SPOT.x, y, SPOT.z); grp.rotation.y = Math.PI / 2;     // (its keys toward the yard)
  return grp;
}

// ---------------- the laptop's screen (DOM) ----------------
const CSS = `
#tuner{position:fixed;inset:0;z-index:12;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(4,6,8,.62);
 --b:#0f1216;--p:#171b21;--p2:#1d232b;--l:#2a313a;--t:#e8edf2;--m:#8b96a3;--a:#37d6c0;--w:#ffb347;--r:#ff6b6b;--g:#6fe08a;
 color:var(--t);font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;touch-action:manipulation;-webkit-user-select:none;user-select:none}
#tuner.on{display:flex}
#tuner *{box-sizing:border-box}
.tn-lap{width:min(1120px,97vw);height:min(690px,calc(100vh - 34px));background:#090a0c;border:10px solid #24272c;border-bottom-width:14px;border-radius:14px 14px 4px 4px;box-shadow:0 18px 60px rgba(0,0,0,.6);display:flex;flex-direction:column;position:relative}
.tn-lap:before{content:"";position:absolute;top:-7px;left:50%;width:5px;height:5px;margin-left:-2px;border-radius:50%;background:#0d0e10;box-shadow:0 0 0 1px #33383f}
.tn-deck{width:min(1180px,100vw);height:14px;background:linear-gradient(#3a3e45,#1f2226);border-radius:0 0 12px 12px;flex:none}
.tn-scr{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--b)}
.tn-top{flex:none;display:flex;align-items:center;gap:10px;height:34px;padding:0 6px 0 10px;background:var(--p);border-bottom:1px solid var(--l)}
.tn-brand{display:flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.06em}
.tn-brand svg{width:18px;height:18px;stroke:var(--a);fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.tn-brand small{color:var(--m);font-weight:400;letter-spacing:0}
.tn-car{color:var(--m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.tn-chips{display:flex;gap:6px;flex:none}
.tn-chip{display:flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid var(--l);border-radius:20px;color:var(--m);font-size:11.5px;white-space:nowrap}
.tn-chip i{width:7px;height:7px;border-radius:50%;background:#48515c}
.tn-chip.ok i{background:var(--g)} .tn-chip.warn i{background:var(--w)} .tn-chip.bad i{background:var(--r)}
#tuner button{font:inherit;color:var(--t);background:var(--p2);border:1px solid var(--l);border-radius:7px;padding:7px 12px;cursor:pointer}
#tuner button:hover:not(:disabled){border-color:#46515e}
#tuner button:disabled{opacity:.4;cursor:default}
#tuner button.pri{background:var(--a);border-color:var(--a);color:#06231f;font-weight:700}
#tuner button.x{padding:3px 10px;font-size:16px;line-height:1.2}
.tn-main{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column}
.tn-foot{flex:none;height:24px;padding:0 10px;display:flex;align-items:center;gap:14px;border-top:1px solid var(--l);background:var(--p);color:var(--m);font-size:11.5px;white-space:nowrap;overflow:hidden}
.tn-boot{margin:auto;width:min(460px,100%);text-align:center}
.tn-boot svg{width:92px;height:92px;stroke:var(--a);fill:none;stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.tn-boot h1{margin:6px 0 2px;font-size:30px;letter-spacing:.14em}
.tn-boot p{margin:0 0 18px;color:var(--m)}
.tn-bar{height:8px;background:#1e252d;border-radius:4px;overflow:hidden}
.tn-bar b{display:block;height:100%;width:0;background:var(--a)}
.tn-log{margin-top:12px;min-height:108px;text-align:left;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;color:var(--m);white-space:pre-wrap}
.tn-log .ok{color:var(--g)} .tn-log .bad{color:var(--r)} .tn-log .w{color:var(--w)}
.tn-menu{display:grid;grid-template-columns:minmax(230px,1fr) 1.5fr;gap:12px;flex:1;min-height:0}
.tn-card{background:var(--p);border:1px solid var(--l);border-radius:10px;padding:12px}
.tn-card h3{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--m);font-weight:600}
.tn-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px}
.tn-kv span{color:var(--m)} .tn-kv b{font-weight:600;overflow-wrap:anywhere}
.tn-tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;align-content:start}
#tuner button.tile{text-align:left;padding:12px 14px;border-radius:10px;display:flex;flex-direction:column;gap:3px;min-height:74px}
.tile b{font-size:15px} .tile span{color:var(--m);font-size:12px} .tile em{font-style:normal;color:var(--a);font-size:11px;letter-spacing:.06em}
.tn-note{margin-top:10px;color:var(--m);font-size:12px}
.tn-job{margin:auto;width:min(640px,100%)}
.tn-job h2{margin:0 0 4px;font-size:19px}
.tn-job .sub{color:var(--m);margin-bottom:12px}
.tn-chk{display:grid;gap:5px;margin:0 0 12px;padding:0;list-style:none}
.tn-chk li{display:flex;align-items:center;gap:8px}
.tn-chk li:before{content:"";width:9px;height:9px;border-radius:50%;background:var(--g);flex:none}
.tn-chk li.bad:before{background:var(--r)} .tn-chk li.w:before{background:var(--w)}
.tn-chk li button{padding:3px 9px;margin-left:auto}
.tn-pct{display:flex;justify-content:space-between;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.tn-hex{margin-top:10px;height:96px;overflow:hidden;font:11.5px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#5d6875;white-space:pre}
.tn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.tn-ed{display:grid;grid-template-columns:172px minmax(0,1fr) 300px;gap:10px;flex:1;min-height:0}
.tn-maps{display:flex;flex-direction:column;gap:4px;overflow:auto}
#tuner .tn-maps button{text-align:left;padding:6px 9px;display:flex;justify-content:space-between;gap:6px}
#tuner .tn-maps button.on{border-color:var(--a);color:var(--a)}
.tn-maps i{font-style:normal;color:var(--w);font-size:11px}
.tn-tabw{display:flex;flex-direction:column;min-height:0;min-width:0}
.tn-tabh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.tn-tabh b{font-size:14px} .tn-tabh span{color:var(--m);font-size:12px}
.tn-scroll{overflow:auto;flex:0 1 auto;min-height:0}
table.tn-t{border-collapse:separate;border-spacing:2px;font:12px/1 ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;width:100%}
.tn-t th{color:var(--m);font-weight:400;padding:4px 5px;text-align:right;white-space:nowrap}
.tn-t td{padding:6px 5px;text-align:right;border-radius:3px;cursor:pointer;color:#0b0d10;min-width:44px}
.tn-t td.ch{box-shadow:inset 0 0 0 2px #fff}
.tn-t td.sel{outline:2px solid var(--a);outline-offset:-1px;color:#000;font-weight:700}
.tn-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#tuner .tn-tools button{padding:6px 10px}
.tn-side{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto}
.tn-dyno{background:var(--p);border:1px solid var(--l);border-radius:10px;padding:8px}
.tn-dyno canvas{width:100%;height:170px;display:block}
.tn-leg{display:flex;gap:12px;font-size:11.5px;color:var(--m);margin-top:4px;flex-wrap:wrap}
.tn-leg i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}
.tn-res{display:grid;grid-template-columns:auto 1fr 1fr;gap:3px 10px;font-variant-numeric:tabular-nums}
.tn-res.r4{grid-template-columns:auto 1fr 1fr auto} .tn-res .wide{grid-column:2/-1}
.tn-res span{color:var(--m)} .tn-res b{text-align:right} .tn-res .up{color:var(--g)} .tn-res .dn{color:var(--r)}
.tn-warn{color:var(--w);font-size:12px;display:grid;gap:4px}
.tn-okl{color:var(--g);font-size:12px}
.tn-big{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
.tn-kits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start}
.tn-card.kit.on{border-color:var(--a)}
.tn-parts{margin:0 0 6px;padding-left:18px;display:grid;gap:3px}
.tn-note .est,.tn-card .est{color:var(--w)}
.tn-vmax{display:grid;gap:3px;padding:9px 11px} .tn-vmax span{color:var(--m);font-size:12px}
@media (max-width:860px){.tn-ed{grid-template-columns:minmax(0,1fr) 244px}.tn-maps{grid-column:1/-1;flex-direction:row;flex-wrap:wrap}.tn-menu{grid-template-columns:minmax(200px,1fr) 1.4fr}.tn-chips .tn-chip.opt{display:none}}
@media (max-width:620px){.tn-ed{grid-template-columns:1fr;grid-auto-rows:min-content}.tn-menu{grid-template-columns:1fr}.tn-kits{grid-template-columns:1fr}}
@media (max-height:480px){.tn-lap{border-width:5px;border-bottom-width:7px;height:calc(100vh - 12px)}.tn-deck{height:6px}.tn-main{padding:8px}.tn-dyno canvas{height:118px}#tuner .tn-maps button{padding:4px 8px}#tuner button.tile{min-height:0;padding:8px 11px}.tn-t td{padding:5px 4px}.tn-card{padding:9px}}
`;
const LOGO = '<svg viewBox="0 0 24 24"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M7.6 14.2a4.6 4.6 0 0 1 8.8 0"/><path d="M12 13.4l3.1-3.3"/></svg>';

export class Tuner {
  // o: { scene, world, audio, hud, store, input, vehicles }
  constructor(o) {
    Object.assign(this, o);
    const saved = this.store.get('tuner', {});
    this.owned = !!saved.owned; this.cars = saved.cars ?? {};
    this.open = false; this.view = 'boot'; this.job = null; this.booted = false; this.sel = new Set(); this.mapId = 'tlim';
    this.prop = null;
    if (!this.owned) { this.prop = buildProp(this.world.groundHeight(SPOT.x, SPOT.z)); this.scene.add(this.prop); }
    // each car's key: its name and how many of that name came before it (the same in every game: the same cars parked
    // in the same order), and the tune it was left with
    const n = new Map();
    for (const v of this.vehicles) { const i = n.get(v.name) ?? 0; n.set(v.name, i + 1); v.tunerKey = v.name + '#' + i; }
    for (const v of this.vehicles) { const rec = this.cars[v.tunerKey]; if (rec?.maps || (rec?.hw ?? 1) > 1) this.applyMaps(v, rec.maps ?? null); }
    this.root = null;
  }
  save() { this.store.set('tuner', { owned: this.owned, cars: this.cars }); }
  beep(f = 880, g = 0.05, d = 0.05) { try { if (this.audio?.ctx?.state === 'running') this.audio.ring([f], [g], [d], 0); } catch (_) { /* no sound */ } }

  // the prompt to take it (and E takes it) when you stand by the steps and look at it rather than at the dog; '' as
  // it is taken; null else. dog: the dog by you, if one is (dogs.js)
  pickup(cam, input, dog) {
    if (this.owned || !this.prop) return null;
    const p = this.prop.position, dx = p.x - cam.position.x, dy = p.y + 0.08 - cam.position.y, dz = p.z - cam.position.z, d = Math.hypot(dx, dy, dz);
    if (d > 2.6) return null;
    const f = cam.getWorldDirection(this._f ??= new THREE.Vector3()), dot = (f.x * dx + f.y * dy + f.z * dz) / d;
    if (dot < 0.6) return null;
    if (dog) { const ex = dog.x - cam.position.x, ey = 0.6 - cam.position.y, ez = dog.z - cam.position.z, e = Math.hypot(ex, ey, ez); if ((f.x * ex + f.y * ey + f.z * ez) / e > dot) return null; }
    if (input.hit('KeyE') || input.hit('KeyF')) {
      this.owned = true; this.scene.remove(this.prop); this.prop = null; this.save();
      this.audio?.gunCloth?.();
      return '';
    }
    return 'E — ia autotunerul (laptopul și interfața OBD)';
  }

  // ---- a car's file and what it does to the car
  spec(v) { return v._tsp ??= specFor(v); }
  stockOf(v) { return v._tst ??= stockMaps(this.spec(v)); }
  // maps as saved ({ id: rows }) onto the series set
  mapsFrom(v, saved) { const m = cloneMaps(this.stockOf(v)); for (const q of m) if (saved?.[q.id] && saved[q.id].length === q.v.length) q.v = saved[q.id].map(r => r.slice()); return m; }
  kitOf(v) { return this.cars[v.tunerKey]?.hw ?? 1; }
  applyMaps(v, saved) {
    const sp = this.spec(v), st = this.stockOf(v), hw = this.kitOf(v), rec = this.cars[v.tunerKey] ?? {}, maps = saved ? this.mapsFrom(v, saved) : st, ev = evaluate(sp, maps, st, hw), g = gameTune(sp, ev);
    const s0 = v.stock ??= { power: v.power, vmax: v.vmax, hyper: v.hyper };
    if (v.eng) v.eng.clutchNm = clutchNm(sp, hw);            // (the clutch the kit fitted: vehicle.js lets it slip past that)
    const same = !saved || maps.every((m, k) => m.v.every((r, i) => r.every((x, j) => Math.abs(x - st[k].v[i][j]) < 1e-9)));
    // (V95) a car with its own engine in the game (vehicle.js): the file's torque, rev column by rev column, is what its
    // engine now gives - its pull in every gear and its top speed follow from it
    if (v.eng) v.eng.gain = same ? null : { cols: ev.cols, g: ev.gain };
    if (same) { v.power = s0.power; v.vmax = s0.vmax; v.hyper = s0.hyper; v.tune = null; return ev; }
    if (s0.hyper) {
      // (a car on the hyper model: its power to weight, its pull where the tyres still hold, its limiter where the map
      // puts it - at most where that power meets the air's drag)
      const H = s0.hyper, top = H.top * g.kV, lim = g.vlim === 'off' ? top : g.vlim != null ? Math.min(top, g.vlim / 3.6) : H.limit;
      v.hyper = { ...H, P: H.P * g.kP, A0: Math.min(Math.max(H.A0, H.aMax ?? H.A0), H.A0 * ev.kNm), limit: lim, vAero: H.vAero ?? H.limit };
    } else { v.power = s0.power * g.kA; v.vmax = s0.vmax * g.kV; }
    // (the label: the stage whose preset the file was made from - "retușat" when changed by hand after it, "fără kit" when
    // its parts are not fitted; a file of before V96, Stage 1 when it gains)
    const k = rec.stage, off = ev.vlim === 'off', onlyV = maps.every((m, kk) => m.id === 'vmax' || m.v.every((r, i) => r.every((x, j) => Math.abs(x - st[kk].v[i][j]) < 1e-9)));
    let label = k ? 'Stage ' + k + (rec.hand ? ' · retușat' : '') + (hw < k ? ' · fără kit' : '') : k === 0 && !onlyV ? 'modificat' : ev.kHp >= 1.02 && ev.kNm >= 1.02 ? 'Stage 1' : onlyV ? '' : 'modificat';
    if (off) label = label ? label + ' · fără limitator' : 'fără limitator';
    if (!label) label = 'modificat';
    v.tune = { hp: ev.hp, nm: ev.nm, kA: g.kA, kV: g.kV, label, stage: k ?? null, kit: hw };
    return ev;
  }

  // ---- the screen
  build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const r = this.root = document.createElement('div'); r.id = 'tuner';
    r.innerHTML = `<div class="tn-lap"><div class="tn-scr"><div class="tn-top"><div class="tn-brand">${LOGO}ECU LAB <small>4.2</small></div><div class="tn-car"></div><div class="tn-chips"></div><button class="x" data-act="close" title="Închide laptopul (Esc)">×</button></div><div class="tn-main"></div><div class="tn-foot"></div></div></div><div class="tn-deck"></div>`;
    document.body.appendChild(r);
    this.$main = r.querySelector('.tn-main'); this.$foot = r.querySelector('.tn-foot'); this.$chips = r.querySelector('.tn-chips'); this.$car = r.querySelector('.tn-car');
    r.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) { e.preventDefault(); this.act(b.dataset.act, b.dataset); } });
    // the table: a click picks a cell (with Shift, or dragging, a block of them)
    let drag = null;
    r.addEventListener('pointerdown', (e) => {
      const td = e.target.closest('td[data-c]'); if (!td) return;
      const key = td.dataset.c, ij = key.split(',').map(Number);
      if (e.shiftKey && this.last) this.block(this.last, ij, false);
      else if (e.pointerType === 'touch' || e.ctrlKey || e.metaKey) { if (this.sel.has(key)) this.sel.delete(key); else this.sel.add(key); }
      else { const only = this.sel.size === 1 && this.sel.has(key); this.sel.clear(); if (!only) this.sel.add(key); }
      this.last = ij; drag = e.pointerType === 'mouse' && !e.shiftKey ? ij : null; this.paintSel();
    });
    r.addEventListener('pointerover', (e) => { if (!drag) return; const td = e.target.closest('td[data-c]'); if (td) { this.block(drag, td.dataset.c.split(',').map(Number), false); this.paintSel(); } });
    addEventListener('pointerup', () => { drag = null; });
    addEventListener('keydown', (e) => {
      if (!this.open || this.view !== 'edit') return;
      if (e.key === '+' || e.key === '=') this.nudge(1); else if (e.key === '-' || e.key === '_') this.nudge(-1); else return;
      e.preventDefault();
    });
  }
  block(a, b, add) { if (!add) this.sel.clear(); for (let i = Math.min(a[0], b[0]); i <= Math.max(a[0], b[0]); i++) for (let j = Math.min(a[1], b[1]); j <= Math.max(a[1], b[1]); j++) this.sel.add(i + ',' + j); }
  paintSel() { this.root.querySelectorAll('td[data-c]').forEach(td => td.classList.toggle('sel', this.sel.has(td.dataset.c))); const n = this.root.querySelector('[data-n]'); if (n) n.textContent = this.sel.size ? this.sel.size + ' celule alese' : 'nicio celulă aleasă: atinge celulele (sau «Sarcină mare»)'; }

  openFor(v) {
    if (!this.root) this.build();
    this.v = v; this.sp = this.spec(v); this.stock = this.stockOf(v); this.ids = vinFor(this.sp, v.tunerKey);
    this.rec = this.cars[v.tunerKey] ??= { read: false, maps: null };
    this.ecu = this.mapsFrom(v, this.rec.maps);              // (what is in the ECU now)
    this.maps = cloneMaps(this.ecu);                         // (the file being worked on)
    this.identified = !!this.rec.read; this.sel.clear(); this.mapId = 'tlim'; this.msg = '';      // (a car read before is known to the laptop)
    this.fileStage = this.rec.stage ?? null; this.fileHand = !!this.rec.hand;
    this.open = true; v.engineOff = true; this.volt = 12.6; this.wrote = null;
    this.root.classList.add('on');
    this.$car.textContent = v.name;
    if (this.booted) this.go('menu'); else this.start('boot', T_BOOT);
    this.beep(660, 0.04, 0.06);
  }
  close() {
    if (!this.open || (this.job && this.job.kind === 'write' && !this.job.done)) return false;      // (never in the middle of a write)
    this.open = false; this.job = null; this.root.classList.remove('on');
    if (this.v) this.v.engineOff = false;
    this.onClose?.();
    return true;
  }
  start(kind, T, extra = {}) { this.job = { kind, t: 0, T, done: false, log: [], ...extra }; this.view = kind === 'boot' ? 'boot' : 'job'; this.render(); }
  go(view) { this.view = view; this.job = null; this.render(); }

  checks(write) {
    const v = this.v, c = [];
    c.push({ ok: Math.abs(v.speed) < 0.3, t: 'Mașina stă pe loc' });
    c.push({ ok: true, t: 'Contact pus, motor oprit' });
    c.push(v.lightsOn ? { ok: false, t: 'Farurile sunt aprinse: consumatorii trag tensiunea în jos', fix: 'lights', fixT: 'Stinge farurile' } : { ok: true, t: 'Consumatori opriți (faruri, climă, radio)' });
    c.push({ ok: this.volt >= 12, w: this.volt < 12.3, t: 'Tensiune baterie ' + fmt(this.volt, 1) + ' V' + (write ? ' — la scrieri lungi se pune un redresor' : '') });
    if (write) c.push({ ok: true, t: 'Fișierul e al acestui ECU (' + this.ids.sw + '), suma de control recalculată' });
    return c;
  }

  act(a, d) {
    const v = this.v;
    this.beep(520, 0.025, 0.03);
    if (a === 'close') this.close();
    else if (a === 'menu') this.go('menu');
    else if (a === 'id') this.start('id', T_ID);
    else if (a === 'read') this.go('preread');
    else if (a === 'doread') this.start('read', T_READ);
    else if (a === 'edit') { this.go('edit'); }
    else if (a === 'towrite') { this.writing = 'file'; this.go('prewrite'); }
    else if (a === 'restore') { this.writing = 'ori'; this.go('prewrite'); }
    else if (a === 'dowrite') this.start('write', T_WRITE);
    else if (a === 'lights') { v.setLights(false); this.render(); }
    else if (a === 'map') { this.mapId = d.id; this.sel.clear(); this.render(); }
    else if (a === 'stage') {
      const k = +d.k, hw = this.kitOf(v);
      if (hw < k) { this.msg = 'Presetarea Stage ' + k + ' cere kitul ei de piese: Meniu › Kit de piese.'; this.render(); return; }
      const vm0 = this.maps.find(q => q.id === 'vmax');
      this.maps = stagePreset(this.sp, this.stock, k, hw); this.fileStage = k; this.fileHand = false;
      const vm1 = this.maps.find(q => q.id === 'vmax'); if (vm0 && vm1) vm1.v = vm0.v.map(r => r.slice());   // (the limiter as it was set)
      this.msg = 'Presetarea Stage ' + k + ' e în hărți: celulele schimbate au chenar alb. Poți umbla tu la ele, apoi «Scrie în ECU».'; this.render();
    }
    else if (a === 'ori') { this.maps = cloneMaps(this.stock); this.fileStage = null; this.fileHand = false; this.msg = 'Hărțile sunt din nou cele originale.'; this.render(); }
    else if (a === 'parts') this.go('parts');
    else if (a === 'vmax') {
      const vm = this.maps.find(q => q.id === 'vmax'), s0 = this.stock.find(q => q.id === 'vmax');
      if (!vm) return;
      const out = d.on !== '1';
      vm.v = [[out ? VMAX_OFF : s0.v[0][0]]];
      this.msg = out ? 'Limitatorul de viteză e scos din fișier: după scriere mașina merge cât o lasă puterea, aerul și treptele cutiei. În realitate, anvelopele au un indice de viteză (W = 270, Y = 300 km/h) peste care nu sunt făcute să meargă.' : 'Limitatorul e pus la loc: ' + s0.v[0][0] + ' km/h, ca de la fabrică.';
      this.render();
    }
    else if (a === 'mount') { const k = +d.k; if (k !== this.kitOf(v)) this.start('mount', T_MOUNT, { to: k, from: this.kitOf(v) }); }
    else if (a === 'selfull') { const m = this.map(), n = m.v.length; this.sel.clear(); for (let i = Math.max(0, n - 3); i < n; i++) for (let j = 0; j < m.v[i].length; j++) this.sel.add(i + ',' + j); this.paintSel(); }
    else if (a === 'selall') { const m = this.map(); this.sel.clear(); m.v.forEach((r, i) => r.forEach((x, j) => this.sel.add(i + ',' + j))); this.paintSel(); }
    else if (a === 'selnone') { this.sel.clear(); this.paintSel(); }
    else if (a === 'nudge') this.nudge(+d.k);
    else if (a === 'resetsel') { const m = this.map(), s0 = this.stock.find(q => q.id === m.id); for (const c of this.sel) { const [i, j] = c.split(',').map(Number); m.v[i][j] = s0.v[i][j]; } this.fileHand = true; this.render(); }
  }
  map() { return this.maps.find(m => m.id === this.mapId) ?? this.maps[0]; }
  // one step on the chosen cells: 1 % of each (or the map's own step: half a degree, 0.005 of lambda, 5 km/h)
  nudge(k) {
    const m = this.map();
    if (!this.sel.size) { this.msg = 'Alege întâi celulele din tabel.'; this.render(); return; }
    for (const c of this.sel) {
      const [i, j] = c.split(',').map(Number);
      let x = m.abs ? m.v[i][j] + k * m.step : m.v[i][j] * (1 + 0.01 * k);
      if (m.id === 'lam') x = Math.max(0.7, Math.min(1.05, x)); else if (m.id === 'vmax') x = Math.max(60, Math.min(900, x)); else if (m.id === 'wish' && this.sp.type === 'na') x = Math.max(0, Math.min(100, x)); else if (m.id !== 'soi' && m.id !== 'ign') x = Math.max(0, x);
      m.v[i][j] = +x.toFixed(m.dec + 1);
    }
    this.fileHand = true; this.msg = ''; this.render();
  }
  changed(a, b) { return a.some((m, k) => m.v.some((r, i) => r.some((x, j) => Math.abs(x - b[k].v[i][j]) > 1e-9))); }

  // every frame while it is open: the battery, the job under way
  update(dt) {
    if (!this.open) return;
    const v = this.v;
    this.volt += ((v.lightsOn ? 11.9 : 12.5) - this.volt) * Math.min(1, dt * 0.25);
    if (Math.abs(v.speed) > 1.5) { this.close(); return; }
    const J = this.job;
    if (J && !J.done) {
      J.t += dt;
      const u = Math.min(1, J.t / J.T);
      const bar = this.root.querySelector('.tn-bar b'); if (bar) bar.style.width = (u * 100).toFixed(1) + '%';
      const pct = this.root.querySelector('[data-pct]'); if (pct) pct.textContent = Math.floor(u * 100) + ' %';
      this.jobText(J, u);
      if (u >= 1) this.finish(J);
    }
    if ((this._ct = (this._ct ?? 0) + dt) > 0.5) { this._ct = 0; this.chips(); }
  }
  logLine(J, s, cls = '') { J.log.push(cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s)); const el = this.root.querySelector('.tn-log'); if (el) el.innerHTML = J.log.join('\n'); }
  jobText(J, u) {
    const sp = this.sp, at = (k, f) => { if (u >= k && !J['s' + k]) { J['s' + k] = 1; f(); } };
    if (J.kind === 'boot') {
      at(0.02, () => this.logLine(J, 'Pornire ECU LAB 4.2 …'));
      at(0.2, () => this.logLine(J, 'Driver interfață OBD (USB) ............ OK', 'ok'));
      at(0.42, () => this.logLine(J, 'Interfață găsită: FLASH OBD · firmware 2.14', 'ok'));
      at(0.62, () => this.logLine(J, 'Protocoale: K-Line, CAN, UDS ............ OK', 'ok'));
      at(0.82, () => this.logLine(J, 'Tensiune la mufă: ' + fmt(this.volt, 1) + ' V ............... OK', 'ok'));
      at(0.96, () => this.logLine(J, 'Gata.'));
    } else if (J.kind === 'mount') {
      // (the parts off and on, in order: the old ones out, each new one in, the checks)
      const sp2 = this.sp, out = J.from > 1 ? kitParts(sp2, J.from).filter(q => !kitParts(sp2, J.to).includes(q)) : [], put = kitParts(sp2, J.to).filter(q => !kitParts(sp2, J.from).includes(q));
      const steps = [...out.map(q => ['Se demontează: ' + q, '']), ...put.map(q => ['Se montează: ' + q, 'ok']), ...(J.to === 1 ? [['Se pun la loc piesele de serie', 'ok']] : []), ['Strângere la cuplu, etanșări verificate, fără scurgeri', 'ok']];
      const el = this.root.querySelector('[data-ph]'); if (el) el.textContent = J.to > 1 ? 'Montaj kit Stage ' + J.to : 'Piese de serie la loc';
      steps.forEach((st2, i) => at(0.02 + 0.9 * i / steps.length, () => this.logLine(J, st2[0], st2[1])));
    } else if (J.kind === 'id') {
      const el = this.root.querySelector('[data-ph]'); if (el) el.textContent = 'Sesiune de diagnoză';
      at(0.05, () => this.logLine(J, 'Se deschide sesiunea de diagnoză …'));
      at(0.35, () => this.logLine(J, 'ECU răspunde · protocol ' + (sp.ecu.includes('EDC15') || sp.ecu.includes('ME1.5') ? 'K-Line (KWP2000)' : 'CAN (UDS)'), 'ok'));
      at(0.6, () => this.logLine(J, 'VIN ' + this.ids.vin, 'ok'));
      at(0.85, () => this.logLine(J, 'Versiune software ' + this.ids.sw, 'ok'));
    } else {
      const kb = 2048, ph = J.kind === 'read' ? [[0, 'Citire memorie flash']] : [[0, 'Ștergere sectoare'], [0.16, 'Scriere'], [0.74, 'Verificare']];
      let name = ph[0][1], a = 0, b = 1; ph.forEach(([k, n], i) => { if (u >= k) { name = n; a = k; b = ph[i + 1]?.[0] ?? 1; } });
      const el = this.root.querySelector('[data-ph]'); if (el) el.textContent = name + ' · ' + fmt(Math.floor(kb * Math.min(1, (u - a) / (b - a)))) + ' / ' + fmt(kb) + ' kB · ' + fmt(this.volt, 1) + ' V';
      const hx = this.root.querySelector('.tn-hex');
      if (hx && (J.hx = (J.hx ?? 0) + 1) % 3 === 0) {
        let h = Math.floor(u * 0x1ffff0) & ~15, lines = [];
        for (let r = 0; r < 6; r++) { let s = '0x' + (h + r * 16).toString(16).toUpperCase().padStart(6, '0') + '  ', x = (h + r * 16) * 2654435761 >>> 0; for (let k = 0; k < 16; k++) { x = (x * 1664525 + 1013904223) >>> 0; s += (name === 'Ștergere sectoare' ? 'FF' : (x >>> 24).toString(16).toUpperCase().padStart(2, '0')) + ' '; } lines.push(s); }
        hx.textContent = lines.join('\n');
      }
    }
  }
  finish(J) {
    J.done = true;
    const v = this.v;
    if (J.kind === 'boot') { this.booted = true; this.beep(990, 0.05, 0.08); this.go('menu'); }
    else if (J.kind === 'id') { this.identified = true; this.go('ident'); }
    else if (J.kind === 'read') { this.rec.read = true; this.save(); this.beep(990, 0.05, 0.08); this.msg = ''; this.go('readok'); }
    else if (J.kind === 'mount') {
      // (the same file in the ECU on the new parts: what they allow)
      this.rec.hw = J.to; this.save();
      this.applyMaps(v, this.rec.maps);
      const k = this.rec.stage;
      this.msg = J.to > 1 ? 'Kitul Stage ' + J.to + ' e montat. Fă acum fișierul pentru el: Editor › presetarea Stage ' + J.to + ', apoi «Scrie în ECU».' : 'Piesele de serie sunt la loc.';
      if (k && k > J.to) this.msg += ' Atenție: în ECU e un fișier Stage ' + k + ', făcut pentru piese care nu mai sunt montate — scrie un fișier Stage ' + Math.max(1, J.to) + ' sau originalul.';
      this.beep(990, 0.05, 0.08); this.go('parts');
    }
    else if (J.kind === 'write') {
      const before = v.tune ? { hp: v.tune.hp, nm: v.tune.nm } : { hp: this.sp.hp, nm: this.sp.nm };
      const src = this.writing === 'ori' ? this.stock : this.maps;
      const saved = this.changed(src, this.stock) ? Object.fromEntries(src.map(m => [m.id, m.v.map(r => r.slice())])) : null;
      this.rec.maps = saved;
      // (which stage's preset it was made from: 0 by hand, none for the original)
      if (!saved) { delete this.rec.stage; delete this.rec.hand; } else { this.rec.stage = this.fileStage ?? 0; this.rec.hand = !!this.fileHand && !!this.fileStage; }
      this.save();
      this.result = { ev: this.applyMaps(v, saved), before };
      this.wrote = v.tune ? `${v.name}: ${v.tune.label} — ${fmt(v.tune.hp)} CP · ${fmt(v.tune.nm)} Nm (de la ${fmt(this.sp.hp)} CP · ${fmt(this.sp.nm)} Nm)` : v.name + ': din nou cu fișierul original';
      this.ecu = this.mapsFrom(v, saved); this.maps = cloneMaps(this.ecu);
      this.beep(1320, 0.06, 0.12);
      this.go('done');
    }
  }

  chips() {
    if (!this.$chips) return;
    const st = this.v.tune ? this.v.tune.label : 'original';
    this.$chips.innerHTML = `<span class="tn-chip ok"><i></i>OBD</span><span class="tn-chip ok opt"><i></i>contact · motor oprit</span><span class="tn-chip ${this.volt < 12 ? 'bad' : this.volt < 12.3 ? 'warn' : 'ok'}"><i></i>${fmt(this.volt, 1)} V</span><span class="tn-chip ${this.v.tune ? 'warn' : ''} opt"><i></i>ECU: ${st}</span><span class="tn-chip ${this.kitOf(this.v) > 1 ? 'warn' : ''} opt"><i></i>piese: ${this.kitOf(this.v) > 1 ? 'kit Stage ' + this.kitOf(this.v) : 'serie'}</span>`;
  }
  render() {
    const v = this.v, sp = this.sp, J = this.job, M = this.$main;
    this.chips();
    let foot = 'Interfață: FLASH OBD · USB';
    const ck = (list) => `<ul class="tn-chk">${list.map(c => `<li class="${c.ok ? (c.w ? 'w' : '') : 'bad'}">${esc(c.t)}${c.fix ? `<button data-act="${c.fix}">${c.fixT}</button>` : ''}</li>`).join('')}</ul>`;
    if (this.view === 'boot') {
      M.innerHTML = `<div class="tn-boot">${LOGO}<h1>ECU LAB</h1><p>citire · editare hărți · scriere</p><div class="tn-bar"><b></b></div><div class="tn-log"></div></div>`;
      foot = 'Se încarcă …';
    } else if (this.view === 'menu') {
      const tuned = !!v.tune, read = this.rec.read;
      M.innerHTML = `<div class="tn-menu"><div class="tn-card"><h3>Vehicul conectat</h3><div class="tn-kv"><span>Mașina</span><b>${esc(v.name)}</b>${this.identified ? `<span>Motor</span><b>${esc(sp.label)}</b><span>Serie</span><b>${fmt(sp.hp)} CP · ${fmt(sp.nm)} Nm</b><span>ECU</span><b>${esc(sp.ecu || 'neidentificat după tip')}</b><span>VIN</span><b>${this.ids.vin}</b>` : '<span>ECU</span><b>neidentificat încă</b>'}<span>Fișier original</span><b>${read ? 'salvat pe laptop' : 'necitit'}</b><span>În ECU acum</span><b>${tuned ? `${esc(v.tune.label)} · ${fmt(v.tune.hp)} CP · ${fmt(v.tune.nm)} Nm` : 'original'}</b><span>Piese</span><b>${this.kitOf(v) > 1 ? 'kit Stage ' + this.kitOf(v) : 'de serie'}</b>${sp.vlim ? `<span>Limitator</span><b>${v.tune && /fără limitator/.test(v.tune.label) ? 'scos' : fmt(sp.vlim) + ' km/h'}</b>` : ''}</div><div class="tn-note">Ordinea de lucru: identifici ECU-ul, îi citești fișierul (originalul rămâne salvat), îl modifici în editor, apoi îl scrii înapoi.</div></div>
        <div class="tn-tiles">
        <button class="tile" data-act="id"><em>1</em><b>Identifică ECU-ul</b><span>marcă, motor, VIN, versiune software</span></button>
        <button class="tile" data-act="read" ${this.identified ? '' : 'disabled'}><em>2</em><b>Citește ECU-ul</b><span>${read ? 'citit: originalul e salvat (poți reciti)' : 'copie a fișierului original, pe laptop'}</span></button>
        <button class="tile" data-act="edit" ${read ? '' : 'disabled'}><em>3</em><b>Editor de hărți</b><span>presetările Stage 1, 2, 3 sau modificări de mână, cu puterea și cuplul rezultate</span></button>
        <button class="tile" data-act="towrite" ${read && this.changed(this.maps, this.ecu) ? '' : 'disabled'}><em>4</em><b>Scrie în ECU</b><span>${read && this.changed(this.maps, this.ecu) ? 'fișierul modificat e gata de scris' : 'nimic de scris: fișierul e cel din ECU'}</span></button>
        <button class="tile" data-act="parts"><b>Kit de piese</b><span>${this.kitOf(v) > 1 ? 'montat: kitul Stage ' + this.kitOf(v) : 'piese de serie · Stage 2 și 3 cer kitul lor'}</span></button>
        <button class="tile" data-act="restore" ${tuned && read ? '' : 'disabled'}><b>Revino la original</b><span>scrie înapoi fișierul citit la început</span></button>
        <button class="tile" data-act="close"><b>Închide laptopul</b><span>pornești motorul și pleci (Esc)</span></button>
        </div></div>`;
      foot = this.identified ? sp.label : 'Niciun ECU identificat';
    } else if (this.view === 'job') {
      const T = { mount: [J.to > 1 ? 'Kit Stage ' + J.to + ' — montaj' : 'Înapoi la piesele de serie', 'În joc se face pe loc; într-un atelier durează ore (Stage 2) sau zile (Stage 3)'], id: ['Identificare ECU', 'Se întreabă ECU-ul cine este'], read: ['Citire ECU', 'Nu opri contactul și nu scoate mufa'], write: [this.writing === 'ori' ? 'Scriere — fișierul original' : 'Scriere — fișierul modificat', 'NU opri contactul, NU scoate mufa, NU închide laptopul'] }[J.kind];
      M.innerHTML = `<div class="tn-job"><h2>${T[0]}</h2><div class="sub">${T[1]}</div><div class="tn-pct"><span data-ph>…</span><b data-pct>0 %</b></div><div class="tn-bar"><b></b></div>${J.kind === 'id' || J.kind === 'mount' ? '<div class="tn-log"></div>' : '<div class="tn-hex"></div>'}</div>`;
      this.root.querySelector('[data-act="close"]').disabled = J.kind === 'write';
      foot = T[0] + ' …';
    } else if (this.view === 'ident') {
      M.innerHTML = `<div class="tn-job"><h2>ECU identificat</h2><div class="sub">Datele mașinii conectate</div><div class="tn-card"><div class="tn-kv"><span>Mașina</span><b>${esc(v.name)}</b><span>Motor</span><b>${esc(sp.label)}</b><span>Putere · cuplu de serie</span><b>${fmt(sp.hp)} CP · ${fmt(sp.nm)} Nm</b><span>ECU</span><b>${esc(sp.ecu || 'tip nelistat — se citește prin OBD')}</b><span>VIN</span><b>${this.ids.vin}</b><span>Software</span><b>${this.ids.sw}</b><span>Stare</span><b>${v.tune ? 'modificat' : 'original'}</b></div></div><div class="tn-row"><button class="pri" data-act="read">Citește ECU-ul</button><button data-act="menu">Meniu</button></div></div>`;
    } else if (this.view === 'preread' || this.view === 'prewrite') {
      const w = this.view === 'prewrite', list = this.checks(w), ok = list.every(c => c.ok);
      const ev = w && this.writing === 'file' ? evaluate(sp, this.maps, this.stock, this.kitOf(v)) : null;
      M.innerHTML = `<div class="tn-job"><h2>${w ? (this.writing === 'ori' ? 'Scrie înapoi fișierul original' : 'Scrie fișierul modificat în ECU') : 'Citește fișierul din ECU'}</h2><div class="sub">${w ? 'Scrierea durează; dacă se întrerupe, ECU-ul rămâne fără program. Verificările de dinainte:' : 'Se face o copie a programului din ECU. Originalul rămâne salvat pe laptop.'}</div>${ck(list)}${ev && ev.warn.length ? `<div class="tn-warn">${ev.warn.map(k => '⚠ ' + esc(WARN[k])).join('<br>')}</div>` : ''}<div class="tn-row"><button class="pri" data-act="${w ? 'dowrite' : 'doread'}" ${ok ? '' : 'disabled'}>${w ? 'Scrie acum' : 'Citește acum'}</button><button data-act="${w && this.writing === 'file' ? 'edit' : 'menu'}">Înapoi</button></div></div>`;
    } else if (this.view === 'parts') {
      const hw = this.kitOf(v), fig = (k) => { const [hp, nm, est] = stageFig(sp, k); return `${fmt(hp)} CP · ${fmt(nm)} Nm${est ? ' <span class="est">(estimare)</span>' : ''}`; };
      const card = (k, title, parts, note) => `<div class="tn-card kit${hw === k ? ' on' : ''}"><h3>${title}${hw === k ? ' · montat' : ''}</h3><ul class="tn-parts">${parts.map(q => '<li>' + esc(q) + '</li>').join('')}</ul><div class="tn-note">${note}</div><div class="tn-row"><button ${hw === k ? 'disabled' : 'class="pri"'} data-act="mount" data-k="${k}">${hw === k ? 'Montat' : k === 1 ? 'Pune la loc piesele de serie' : 'Montează kitul Stage ' + k}</button></div></div>`;
      M.innerHTML = `<div class="tn-kits">${card(1, 'Piese de serie', ['Turbină, injectoare, intercooler, evacuare și ambreiaj de la fabrică'].slice(0, sp.type === 'na' ? 0 : 1).concat(sp.type === 'na' ? ['Galerie, evacuare, admisie și came de la fabrică'] : []), 'Stage 1: doar fișierul — ' + fig(1))}${card(2, 'Kit Stage 2', kitParts(sp, 2), 'Stage 2: fișierul făcut pentru aceste piese — ' + fig(2))}${card(3, 'Kit Stage 3', kitParts(sp, 3), 'Stage 3: fișierul făcut pentru aceste piese — ' + fig(3))}</div>
        ${this.msg ? `<div class="tn-note">${esc(this.msg)}</div>` : ''}<div class="tn-note">În realitate, pe drum public piesele care schimbă evacuarea sau emisiile trebuie omologate (RAR); fără filtru de particule sau catalizator mașina nu trece inspecția.</div><div class="tn-row"><button data-act="menu">Meniu</button>${this.rec.read ? '<button data-act="edit">Editor de hărți</button>' : ''}</div>`;
      foot = 'Kit de piese · ' + sp.label;
    } else if (this.view === 'readok') {
      M.innerHTML = `<div class="tn-job"><h2>Citire reușită</h2><div class="sub">Fișierul original e salvat: ORI_${this.ids.vin.slice(-6)}.bin · 2 048 kB · suma de control corectă</div><div class="tn-row"><button class="pri" data-act="edit">Deschide în editorul de hărți</button><button data-act="menu">Meniu</button></div></div>`;
    } else if (this.view === 'done') {
      const { ev, before } = this.result, tuned = !!v.tune, t = v.tune;
      const top = v.hyper ? (ev.vlim === 'off' ? 'fără limitator (max. ~' + Math.round(v.hyper.limit * 3.6) + ' km/h)' : 'limitator ' + Math.round(v.hyper.limit * 3.6) + ' km/h') : null;
      M.innerHTML = `<div class="tn-job"><h2>${tuned ? 'Scriere reușită — ' + esc(t.label) : 'Scriere reușită — mașina e din nou originală'}</h2><div class="sub">Verificarea a trecut. Contactul se ia 10 secunde, apoi pornești motorul.</div><div class="tn-card"><div class="tn-res"><span></span><b>înainte</b><b>acum</b><span>Putere</span><b>${fmt(before.hp)} CP</b><b class="${ev.hp > before.hp + 0.5 ? 'up' : ev.hp < before.hp - 0.5 ? 'dn' : ''}">${fmt(ev.hp)} CP</b><span>Cuplu</span><b>${fmt(before.nm)} Nm</b><b class="${ev.nm > before.nm + 0.5 ? 'up' : ev.nm < before.nm - 0.5 ? 'dn' : ''}">${fmt(ev.nm)} Nm</b>${tuned ? `<span>Față de serie</span><b></b><b class="up">${ev.kHp >= 1 ? '+' : ''}${fmt((ev.kHp - 1) * 100, 1)} % CP · ${ev.kNm >= 1 ? '+' : ''}${fmt((ev.kNm - 1) * 100, 1)} % Nm</b><span>În joc</span><b></b><b>accelerație ×${fmt(t.kA, 2)}${top ? ' · ' + top : ' · viteză maximă ×' + fmt(t.kV, 2)}</b>` : ''}</div></div>${ev.warn.length ? `<div class="tn-warn" style="margin-top:10px">${ev.warn.map(k => '⚠ ' + esc(WARN[k])).join('<br>')}</div>` : ''}<div class="tn-row"><button class="pri" data-act="close">Închide laptopul și pornește</button><button data-act="menu">Meniu</button></div></div>`;
    } else if (this.view === 'edit') { this.renderEdit(); foot = 'Editor · ' + sp.label + ' · + / − schimbă celulele alese'; }
    const x = this.root.querySelector('.tn-top [data-act="close"]'); if (x && this.view !== 'job') x.disabled = false;
    this.$foot.innerHTML = `<span>${esc(foot)}</span><span style="margin-left:auto">${esc(v.name)}</span>`;
  }

  renderEdit() {
    const sp = this.sp, m = this.map(), s0 = this.stock.find(q => q.id === m.id), hw = this.kitOf(this.v), ev = evaluate(sp, this.maps, this.stock, hw);
    // the cells coloured by their value across the map (a heat map), the changed ones framed
    let lo = Infinity, hi = -Infinity; m.v.forEach(r => r.forEach(x => { lo = Math.min(lo, x); hi = Math.max(hi, x); })); s0.v.forEach(r => r.forEach(x => { lo = Math.min(lo, x); hi = Math.max(hi, x); }));
    const col = (x) => { const u = hi > lo ? (x - lo) / (hi - lo) : 0.5; return `hsl(${Math.round(205 - 185 * u)} 62% ${Math.round(46 + 14 * u)}%)`; };
    const cell = (x) => m.id === 'vmax' && x >= VMAX_OFF ? 'scos' : num(x, m.dec);
    const rows = m.v.map((r, i) => `<tr><th>${esc(m.rows[i])}</th>${r.map((x, j) => `<td data-c="${i},${j}" class="${Math.abs(x - s0.v[i][j]) > 1e-9 ? 'ch' : ''}${this.sel.has(i + ',' + j) ? ' sel' : ''}" style="background:${col(x)}" title="serie: ${num(s0.v[i][j], m.dec)}">${cell(x)}</td>`).join('')}</tr>`).join('');
    const diff = (q) => { const o = this.stock.find(k => k.id === q.id); return q.v.some((r, i) => r.some((x, j) => Math.abs(x - o.v[i][j]) > 1e-9)); };
    const d = (a, b, u) => { const k0 = (a / b - 1) * 100, k = Math.abs(k0) < 0.05 ? 0 : k0, c = k > 0.05 ? 'up' : k < -0.05 ? 'dn' : ''; return `<b class="${c}">${fmt(a)} ${u}</b><b class="${c}">${k >= 0 ? '+' : ''}${fmt(k, 1)} %</b>`; };
    const g = gameTune(sp, ev), dirty = this.changed(this.maps, this.ecu);
    this.$main.innerHTML = `<div class="tn-ed">
      <div class="tn-maps">${this.maps.map(q => `<button data-act="map" data-id="${q.id}" class="${q.id === m.id ? 'on' : ''}">${esc(q.name)}${diff(q) ? '<i>modif.</i>' : ''}</button>`).join('')}</div>
      <div class="tn-tabw"><div class="tn-tabh"><b>${esc(m.name)}</b><span>${esc(m.unit)}${m.rowName ? ' · rânduri: ' + esc(m.rowName) : ''}${m.cols.length > 1 ? ' · coloane: rot/min' : ''}</span></div>
        <div class="tn-scroll"><table class="tn-t"><tr><th></th>${m.cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows}</table></div>
        <div class="tn-tools"><button data-act="selfull">Sarcină mare</button><button data-act="selall">Tot</button><button data-act="selnone">Nimic</button><button data-act="nudge" data-k="-5">−−</button><button data-act="nudge" data-k="-1">−</button><button data-act="nudge" data-k="1">+</button><button data-act="nudge" data-k="5">++</button><button data-act="resetsel">Serie</button></div>
        <div class="tn-note"><span data-n></span> · un pas = ${m.abs ? fmt(m.step, m.step < 0.1 ? 3 : 1) + ' ' + esc(m.unit.split(' ')[0]) : '1 %'}${this.msg ? '<br>' + esc(this.msg) : ''}</div></div>
      <div class="tn-side">
        <div class="tn-dyno"><canvas></canvas><div class="tn-leg"><span><i style="background:var(--a)"></i>putere (CP)</span><span><i style="background:var(--w)"></i>cuplu (Nm)</span><span><i style="background:#5d6875"></i>serie</span></div></div>
        <div class="tn-card"><div class="tn-res r4"><span></span><b>serie</b><b>fișier</b><b></b><span>Putere</span><b>${fmt(ev.hp0)} CP</b>${d(ev.hp, ev.hp0, 'CP')}<span>Cuplu</span><b>${fmt(ev.nm0)} Nm</b>${d(ev.nm, ev.nm0, 'Nm')}<span>În joc</span><b class="wide">accelerație ×${fmt(g.kA, 2)} · viteză max. ×${fmt(g.kV, 2)}</b></div></div>
        ${ev.warn.length ? `<div class="tn-warn">${ev.warn.map(k => '⚠ ' + esc(WARN[k])).join('<br>')}</div>` : `<div class="tn-okl">${this.changed(this.maps, this.stock) ? '✓ În limitele pieselor montate (' + (hw > 1 ? 'kit Stage ' + hw : 'de serie') + ')' : 'Fișierul e cel original'}</div>`}
        <div class="tn-row" style="margin-top:0">${[1, 2, 3].map(k => `<button data-act="stage" data-k="${k}" ${hw < k ? 'disabled title="Cere kitul Stage ' + k + ': Meniu › Kit de piese"' : ''}>Stage ${k}</button>`).join('')}<button data-act="ori">Original</button></div>
        <div class="tn-row" style="margin-top:0"><button class="pri" data-act="towrite" ${dirty ? '' : 'disabled'}>Scrie în ECU</button><button data-act="menu">Meniu</button></div>
        ${this.vmaxRow(ev)}
        <div class="tn-note">${[1, 2, 3].map(k => { const [hp, nm, est] = stageFig(sp, k); return 'Stage ' + k + ': ' + fmt(hp) + ' CP · ' + fmt(nm) + ' Nm' + (est ? ' (estimare)' : ' (listat)'); }).join(' · ')}. ${hw < 3 ? 'Stage ' + (hw + 1) + ' cere kitul lui de piese (Meniu › Kit de piese). ' : ''}Curbele sunt calculate din hărți, nu măsurate pe stand.</div>
      </div></div>`;
    this.paintSel(); this.dyno(ev);
  }
  // the speed limiter's line in the editor: its state and the button that takes it out or puts it back
  vmaxRow(ev) {
    const vm = this.maps.find(q => q.id === 'vmax'), s0 = this.stock.find(q => q.id === 'vmax');
    if (!vm) {
      const top = this.sp.v ?? (this.v.vmax ? Math.round(this.v.vmax * 3.6) : null);
      return `<div class="tn-card tn-vmax"><b>Limitator de viteză</b><span>Mașina asta nu are limitator electronic: viteza maximă${top ? ' (' + fmt(top) + ' km/h de serie)' : ''} e dată de putere, de aer și de treptele cutiei. Mai multă putere (Stage 1–3) o ridică.</span></div>`;
    }
    const out = ev.vlim === 'off';
    return `<div class="tn-card tn-vmax"><b>Limitator de viteză: ${out ? 'scos' : fmt(vm.v[0][0]) + ' km/h' + (vm.v[0][0] === s0.v[0][0] ? ' (de serie)' : '')}</b><span>${out ? 'Mașina merge cât o lasă puterea, aerul și treptele cutiei.' : 'Taie puterea la viteza asta, oricât ai apăsa.'}</span><div class="tn-row" style="margin-top:6px">${out ? `<button data-act="vmax" data-on="1">Pune limitatorul la loc (${fmt(s0.v[0][0])} km/h)</button>` : '<button data-act="vmax" data-on="0">Scoate limitatorul de viteză</button>'}</div></div>`;
  }
  dyno(ev) {
    const c = this.root.querySelector('.tn-dyno canvas'); if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth || 280, H = c.clientHeight || 170;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const P = ev.pts, n0 = P[0][0], n1 = P[P.length - 1][0], L = 30, R = 32, T = 8, B = 18;
    const tMax = Math.max(ev.nm, ev.nm0) * 1.12, pMax = Math.max(ev.hp, ev.hp0) * 1.12;
    const X = (n) => L + (n - n0) / (n1 - n0) * (W - L - R), Yt = (t) => H - B - t / tMax * (H - T - B), Yp = (p) => H - B - p / pMax * (H - T - B);
    g.font = '10px system-ui, sans-serif'; g.lineWidth = 1; g.strokeStyle = '#232a32'; g.fillStyle = '#8b96a3';
    for (let k = 0; k <= 4; k++) { const y = T + k * (H - T - B) / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.textAlign = 'right'; g.fillText(Math.round(tMax * (1 - k / 4)), L - 4, y + 3); g.textAlign = 'left'; g.fillText(Math.round(pMax * (1 - k / 4)), W - R + 4, y + 3); }
    g.textAlign = 'center'; for (let n = Math.ceil(n0 / 1000) * 1000; n <= n1; n += 1000) g.fillText(n / 1000 + 'k', X(n), H - 5);
    g.fillStyle = '#ffb347'; g.textAlign = 'left'; g.fillText('Nm', 2, H - 5); g.fillStyle = '#37d6c0'; g.textAlign = 'right'; g.fillText('CP', W - 2, H - 5);
    const line = (k, Y, color, dash) => { g.beginPath(); P.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](X(p[0]), Y(p[k]))); g.strokeStyle = color; g.lineWidth = dash ? 1.2 : 2; g.setLineDash(dash ? [4, 3] : []); g.stroke(); g.setLineDash([]); };
    line(1, Yt, '#5d6875', true); line(3, Yp, '#5d6875', true); line(2, Yt, '#ffb347'); line(4, Yp, '#37d6c0');
  }
}
