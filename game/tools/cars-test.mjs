// Getting into the cars as a player does (V94.1):  node tools/cars-test.mjs   (server on :8765, or PORT=...; CHROME=path
// to a Chromium, else the installed Chrome). On foot at the driver's door of several cars, the real F key, both cameras
// (the real V key), a few frames in each, a push on W, out again with F. Any error a frame throws fails the test: in
// V94 the interior camera threw on every frame (a name used before its declaration further down the same function) -
// the first tests had only run the chase camera. (V95) Each run starts from where the car was parked: the 320d stands
// 56 cm from a post, and the first run's push on W took it there.
import { chromium } from 'playwright-core';
const port = process.env.PORT || 8765;
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.setDefaultTimeout(900000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { localStorage.setItem('strada.quality', JSON.stringify('low')); localStorage.setItem('strada.camMode', JSON.stringify('chase')); });
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.__game || document.getElementById('loader').classList.contains('err'), null, { timeout: 900000, polling: 1000 });
if (!(await page.evaluate(() => !!window.__game))) { console.log('the game did not load:', await page.textContent('#loadText'), errors.join('\n')); await browser.close(); process.exit(1); }
const frames = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
const resume = () => page.evaluate(() => { const g = window.__game; if (document.getElementById('pause').classList.contains('on') || !g.input.enabled) g.begin(); });
const tap = async (key, n = 2) => { await page.keyboard.down(key); await frames(n); await page.keyboard.up(key); await frames(1); };
await page.evaluate(() => window.__game.begin());
await frames(3);
let failed = 0;
for (const re of ['Peugeot 508 · 500', 'Dacia Sandero', 'BMW Seria 3', 'ATV', 'Maybach']) {   // (V95: the Sandero and the 320d on their own engines)
  for (const cam of ['chase', 'cockpit']) {
    const e0 = errors.length;
    await resume();
    const name = await page.evaluate((re) => { const g = window.__game; if (g.mode === 'car') g.exitCar(true); const v = g.vehicles.find(q => q.name.includes(re)); if (!v) return null; const p0 = v.__p0 ??= { x: v.x, z: v.z, h: v.h }; v.x = p0.x; v.z = p0.z; v.h = p0.h; v.vx = v.vz = 0; v.vs = null; v._ground = null; v.update(0.016, null); const d = v.doorPos(-1); g.player.setPose(d.x, d.z, v.h, 0); return v.name; }, re);
    if (!name) { console.log('FAIL', re, 'no such car'); failed++; continue; }
    await frames(2);
    const prompt = await page.textContent('#prompt');
    await tap('f');
    const entered = await page.evaluate(() => window.__game.mode === 'car');
    if (entered && (await page.evaluate(() => JSON.parse(localStorage.getItem('strada.camMode') || '"chase"'))) !== cam) await tap('v');
    await frames(6);
    await page.keyboard.down('w'); await frames(8); await page.keyboard.up('w');
    const st = await page.evaluate(() => { const g = window.__game, v = g.vehicles.find(q => q.box && g.mode === 'car' && Math.abs(q.speed) > 0.2); return { mode: g.mode, cam: JSON.parse(localStorage.getItem('strada.camMode') || '"chase"'), moving: !!v, paused: document.getElementById('pause').classList.contains('on') }; });
    await page.evaluate(() => { const g = window.__game; for (const v of g.vehicles) { v.vx = v.vz = 0; } });
    await frames(1); await tap('f');
    const out = await page.evaluate(() => window.__game.mode === 'foot');
    const errs = errors.slice(e0), ok = /urcă/.test(prompt) && entered && st.cam === cam && st.moving && out && !errs.length;
    if (!ok) failed++;
    console.log(ok ? 'ok  ' : 'FAIL', name, '·', cam, ok ? '' : JSON.stringify({ prompt, entered, ...st, out, errs: errs.slice(0, 2) }));
  }
}
console.log(failed ? `${failed} FAILED` : 'all cars, both cameras: ok', '· page errors:', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
