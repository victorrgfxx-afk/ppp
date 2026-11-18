// Every car body on its own, in true orthographic views at a known scale (tools/car-viewer.html), to compare with
// photos of the real car:  node tools/car-shots.mjs OUTDIR car:view[:ppm] ...   (server on :8765, or PORT=...;
// CHROME=path to a Chromium, else the installed Chrome). Writes OUTDIR/<car>_<view>.png and OUTDIR/frames.json -
// for each image where s = 0 (the nose), the axles and y = 0 (the ground) fall, in pixels.
//   node tools/car-shots.mjs /tmp/cars bmw:side bmw:front bmw:rear bmw:top bmw:q34
//   node tools/car-shots.mjs /tmp/cars all:side          (every model)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.PORT || 8765;
const [out, ...jobs] = process.argv.slice(2);
if (!out || !jobs.length) { console.log('node tools/car-shots.mjs OUTDIR car:view[:ppm] ...'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
page.setDefaultTimeout(600000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${port}/tools/car-viewer.html`);
const keys = await page.evaluate(() => window.ready);
const frames = fs.existsSync(path.join(out, 'frames.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'frames.json'), 'utf8')) : {};
const list = jobs.flatMap(j => { const [car, ...rest] = j.split(':'); return car === 'all' ? keys.map(k => [k, ...rest].join(':')) : [j]; });
for (const job of list) {
  const [car, view = 'side', ppm = '260', ...rest] = job.split(':'), extra = rest.join(':');
  const opt = { ppm: +ppm, ...(extra ? JSON.parse(extra) : {}) };
  if (view === 'front' || view === 'rear') Object.assign(opt, { w: opt.w ?? 900, h: opt.h ?? 600 });
  if (view === 'top') Object.assign(opt, { w: opt.w ?? 1500, h: opt.h ?? 700 });
  if (view.startsWith('q34')) Object.assign(opt, { w: opt.w ?? 1200, h: opt.h ?? 700 });
  const t0 = Date.now();
  const r = await page.evaluate(([car, view, opt]) => window.view(car, view, opt), [car, view, opt]);
  const file = path.join(out, `${car}_${view}${opt.tag ?? ''}.png`);
  fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
  const w = opt.w ?? 1400, h = opt.h ?? 600, gp = opt.groundPx ?? 70;
  // (side: the nose to the right; s = 0 at x0 + ... : the car's middle in the image's middle)
  const sx = (s) => view === 'left' ? w / 2 + (s - r.L / 2) * opt.ppm : w / 2 - (s - r.L / 2) * opt.ppm;
  frames[`${car}_${view}${opt.tag ?? ''}`] = { view, ppm: opt.ppm, w, h, groundRow: h - gp, L: r.L, W: r.W, r: r.r, axles: r.axles, name: r.name,
    ...(view === 'side' || view === 'left' ? { noseX: sx(0), axleX: r.axles.map(sx) } : {}) };
  console.log(file, `${Date.now() - t0} ms`);
}
fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(frames, null, 1));
console.log(errors.length ? 'page errors: ' + errors.slice(0, 5).join(' | ') : 'page errors: 0');
await browser.close();
process.exit(errors.length ? 1 : 0);
