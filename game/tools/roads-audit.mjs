// Every road of the map audited on its real geometry (tools/roads-audit-page.js): the ground through it, its edges in
// the air, its long profile, overlaps with other roads, the far terrain LODs over it, and what stands on it.
//   python3 -m http.server 8765  (in game/)   then   node tools/roads-audit.mjs [out.json] [port]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = process.argv[2] || 'roads-audit.json', port = process.argv[3] || 8765;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--js-flags=--max-old-space-size=8192'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultTimeout(3000000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); else if (/drumuri|teren|clădiri/.test(m.text())) console.log(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.addInitScript(() => localStorage.setItem('strada.quality', JSON.stringify('medium')));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.__game || document.getElementById('loader').classList.contains('err'), null, { timeout: 3000000, polling: 2000 });
console.log('loaded', ((Date.now() - t0) / 1000).toFixed(0) + 's');
const res = await page.evaluate(async () => (await import('/tools/roads-audit-page.js')).audit());
res.errors = errors;
fs.writeFileSync(out, JSON.stringify(res));
console.log(res.log.join('\n'));
console.log('roads', res.roads, 'triangles', res.tris);
console.log('totals', JSON.stringify(res.totals));
console.log('roadbed', JSON.stringify(res.roadbed));
console.log('errors', errors.length, errors.slice(0, 5).join('\n'));
await browser.close();
