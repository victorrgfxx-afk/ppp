// Headless smoke test: loads the game, checks for errors, captures the 10 photo viewpoints
// and a driving shot.  Usage:
//   python3 -m http.server 8765   (in game/)
//   node tools/smoke-test.mjs [outDir] [quality]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = process.argv[2] || 'shots';
const quality = process.argv[3] || 'high';
fs.mkdirSync(out, { recursive: true });
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const mobile = process.argv[4] === 'mobile';
const page = await browser.newPage(mobile ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript((q) => localStorage.setItem('strada.quality', JSON.stringify(q)), quality);
const t0 = Date.now();
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__game || document.getElementById('loader').classList.contains('err'), null, { timeout: 240000 });
console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(1), 's');
const ok = await page.evaluate(() => !!window.__game);
if (!ok) { console.log(await page.textContent('#loadText')); }
await page.evaluate(() => window.__game.begin());
const frames = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
for (let i = 0; i < 10; i++) {
  await page.evaluate((k) => window.__game.gotoView(k), i);
  await frames(6);
  await page.screenshot({ path: `${out}/view${i + 1}.png` });
}
// extra angles: car close-up, house seen from up the street
const extra = [
  ['car', -0.2, -3.2, -Math.PI / 2, -0.12],
  ['street_south', -1.2, -19, -2.86, 0.02],
  ['yard', 4.4, 6.2, -0.35, 0.05],
];
for (const [name, x, z, yaw, pitch] of extra) {
  await page.evaluate(([x, z, yaw, pitch]) => window.__game.player.setPose(x, z, yaw, pitch), [x, z, yaw, pitch]);
  await frames(6);
  await page.screenshot({ path: `${out}/${name}.png` });
}
const stats = await page.evaluate(() => {
  const g = window.__game, r = g.renderer, i = r.info;
  g.gotoView(0); i.autoReset = false; i.reset(); r.render(g.scene, g.camera);
  const o = { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  i.autoReset = true; return o;
});
console.log('scene stats (main view, single pass):', JSON.stringify(stats));
// drive the BMW: steer left around the pole, then straight
const info = await page.evaluate(async () => {
  const g = window.__game;
  g.gotoView(0);
  const bmw = g.vehicles[0];
  g.enterCar(bmw);
  g.input.keys.add('KeyW'); g.input.keys.add('KeyA');
  return { mode: g.mode, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
});
await frames(12);
await page.evaluate(() => { window.__game.input.keys.delete('KeyA'); window.__game.input.keys.add('KeyD'); });
await frames(10);
await page.evaluate(() => { window.__game.input.keys.delete('KeyD'); });
await frames(30);
await page.evaluate(() => window.__game.input.keys.delete('KeyW'));
await frames(4);
await page.screenshot({ path: `${out}/drive.png` });
const st = await page.evaluate(() => { const v = window.__game.vehicles[0]; return { x: v.x, z: v.z, speed: v.speed, calls: window.__game.renderer.info.render.calls, tris: window.__game.renderer.info.render.triangles }; });
console.log('before drive', JSON.stringify(info), 'after', JSON.stringify(st));
console.log('errors/warnings:', errors.length);
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
