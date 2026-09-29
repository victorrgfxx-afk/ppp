// Headless test of the map-built world: load time, errors, stats and screenshots.
//   python3 -m http.server 8765  (in game/)   then   node tools/geo-test.mjs [outDir] [quality]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = process.argv[2] || 'shots-geo';
const quality = process.argv[3] || 'high';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(300000);
const errors = [], logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else logs.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript((q) => localStorage.setItem('strada.quality', JSON.stringify(q)), quality);
const t0 = Date.now();
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__game || document.getElementById('loader').classList.contains('err'), null, { timeout: 600000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
for (const l of logs) if (l.startsWith('[geo]')) console.log(l);
if (!(await page.evaluate(() => !!window.__game))) { console.log(await page.textContent('#loadText')); for (const e of errors) console.log(e); process.exit(1); }
console.log('geo', JSON.stringify(await page.evaluate(() => window.__game.geo)), 'sun', JSON.stringify(await page.evaluate(() => ({ el: window.__game.sun.el, az: window.__game.sun.az }))));
await page.evaluate(() => window.__game.begin());
const frames = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
const only = process.argv[4] ? process.argv[4].split(',') : null;
const shots = [
  ['view1', 0], ['view7', 6], ['view9', 8], ['view2', 1],
  ['view17', 16], ['view18', 17], ['view19', 18], ['view20', 19], ['view21', 20], ['view22', 21], ['view23', 22], ['view24', 23], ['view25', 24], ['view26', 25], ['view27', 26], ['view28', 27], ['view29', 28], ['view30', 29], ['view31', 30], ['view32', 31], ['view33', 32], ['view34', 33], ['view35', 34], ['view36', 35], ['view37', 36], ['view38', 37], ['view39', 38], ['view40', 39], ['view41', 40], ['view42', 41], ['view43', 42], ['view44', 43], ['view45', 44], ['view46', 45], ['view47', 46], ['view48', 47], ['view49', 48], ['view50', 49], ['view51', 50], ['view52', 51], ['view53', 52], ['view54', 53], ['view55', 54], ['view56', 55], ['view57', 56], ['view58', 57], ['view59', 58], ['view60', 59], ['view61', 60], ['view62', 61], ['view63', 62],
];
for (const [name, k] of shots) {
  if (only && !only.includes(name)) continue;
  await page.evaluate((k) => { window.__game.cam = null; window.__game.gotoView(k); }, k);
  await frames(8);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const cams = [
  ['aerial_home', { x: -120, y: 90, z: -160, yaw: Math.PI + 0.6, pitch: -0.45 }],
  ['aerial_river', { x: -60, y: 140, z: -40, yaw: Math.PI - 0.1, pitch: -0.32 }],
  ['street_ne', { x: 0.3, y: 1.6, z: 60, yaw: Math.PI, pitch: 0.03 }],
  ['river_bank', { x: 20, y: 3, z: 150, yaw: Math.PI - 0.3, pitch: 0.0 }],
  ['station', { x: 40, y: 12, z: -200, yaw: 0.4, pitch: -0.15 }],
  ['overview', { x: 700, y: 650, z: -900, yaw: 2.6, pitch: -0.5 }],
  ['campina', { x: -600, y: 180, z: 700, yaw: 2.2, pitch: -0.3 }],
  ['hills', { x: 1500, y: 420, z: -1500, yaw: 0.6, pitch: -0.22 }],
  ['backyard', { x: 27, y: 2.2, z: 14, yaw: 0.9, pitch: -0.05 }],
  ['cliff', { x: 0.2, y: 1.6, z: 140, yaw: Math.PI, pitch: 0.06 }],
  ['breaza', { x: 5200, y: 420, z: 300, yaw: -2.154, pitch: -0.25 }],
  ['world', { x: -1500, y: 900, z: -9500, yaw: Math.PI - 0.15, pitch: -0.2 }],
  ['bridge', { x: -775, y: 22, z: 70, yaw: 2.2, pitch: -0.28 }],
  ['sport', { x: -905, y: 45, z: 95, yaw: 2.0, pitch: -0.5 }],
  ['cornu', { x: 470, y: 40, z: 360, yaw: -2.2, pitch: -0.5 }],
  ['etu', { x: 1985, y: 45, z: 395, yaw: 2.31, pitch: -0.55 }],
  ['pitigaia', { x: -1120, y: 45, z: -735, yaw: -2.47, pitch: -0.75 }],
  ['magurii', { x: -690, y: 32, z: -700, yaw: 2.47, pitch: -0.7 }],
  ['gara', { x: -610, y: 45, z: -60, yaw: -2.2, pitch: -0.6 }],
  ['castel', { x: -120, y: 40, z: -80, yaw: -0.64, pitch: -0.75 }],
  ['monument', { x: -545, y: 30, z: -345, yaw: -0.91, pitch: -0.7 }],
  ['cantacuzino', { x: 200, y: 80, z: -345, yaw: -2.57, pitch: -0.95 }],
  ['hala', { x: 345, y: 55, z: -250, yaw: -0.83, pitch: -0.62 }],
  ['triaj', { x: 405, y: 50, z: -250, yaw: -2.43, pitch: -0.62 }],
];
for (const [name, c] of cams) {
  if (only && !only.includes(name)) continue;
  await page.evaluate((c) => { window.__game.cam = c; }, c);
  await frames(8);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const stats = await page.evaluate(() => {
  const g = window.__game, r = g.renderer, i = r.info;
  g.cam = null; g.gotoView(0); i.autoReset = false; i.reset(); r.render(g.scene, g.camera);
  const o = { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  i.autoReset = true; return o;
});
console.log('scene stats (view 1, single pass):', JSON.stringify(stats));
// walk + drive sanity: ground height along the street and outside
console.log('ground', JSON.stringify(await page.evaluate(() => { const w = window.__game.world; return [[0, 0], [5, 0], [-6, 0], [0, 100], [0, -200], [300, 300], [-100, 200]].map(([x, z]) => [x, z, +w.groundHeight(x, z).toFixed(2)]); })));
if (!only || only.includes('drive')) {
  // the BMW is parked right behind the pole (photo 2): steer out around it, then straight
  await page.evaluate(() => { const g = window.__game; g.cam = null; g.gotoView(0); g.enterCar(g.vehicles[0]); g.input.keys.add('KeyW'); g.input.keys.add('KeyA'); });
  await frames(12);
  await page.evaluate(() => { const g = window.__game; g.input.keys.delete('KeyA'); g.input.keys.add('KeyD'); });
  await frames(10);
  await page.evaluate(() => window.__game.input.keys.delete('KeyD'));
  await frames(40);
  await page.evaluate(() => window.__game.input.keys.delete('KeyW'));
  await frames(4);
  await page.screenshot({ path: `${out}/drive.png` });
  console.log('drive', JSON.stringify(await page.evaluate(() => { const v = window.__game.vehicles[0]; return { x: +v.x.toFixed(1), z: +v.z.toFixed(1), speed: +v.speed.toFixed(1) }; })));
}
console.log('errors/warnings:', errors.length);
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
