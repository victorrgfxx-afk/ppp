// Close-ups of the two dogs (photos 15-16):  node tools/dogs-test.mjs <outDir>   (server on :8765)
import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => localStorage.setItem('strada.quality', JSON.stringify('high')));
const t0 = Date.now();
await page.goto('http://localhost:8765/index.html');
await page.waitForFunction(() => window.__game || document.getElementById('loader').classList.contains('err'), null, { timeout: 600000 });
console.log('loaded', (Date.now() - t0) / 1000);
if (!(await page.evaluate(() => !!window.__game))) { console.log(await page.textContent('#loadText')); console.log(errors.join('\n')); process.exit(1); }
const frames = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); };
await page.evaluate(() => window.__game.begin());
const shots = [
  ['v15', { view: 14 }], ['v16', { view: 15 }],
  ['black_close', { cam: { x: 4.75, y: 0.7, z: 14.2, yaw: -2.53, pitch: -0.1 } }],
  ['black_side', { cam: { x: 7.4, y: 0.9, z: 14.4, yaw: 2.2, pitch: -0.22 } }],
  ['fawn_close', { cam: { x: 4.35, y: 0.55, z: 4.3, yaw: -1.9, pitch: -0.05 } }],
];
for (const [name, s] of shots) {
  await page.evaluate((s) => { const g = window.__game; g.cam = s.cam || null; if (s.view !== undefined) g.gotoView(s.view); }, s);
  await frames(6);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log('errors', errors.length, errors.slice(0, 10).join('\n'));
await browser.close();
