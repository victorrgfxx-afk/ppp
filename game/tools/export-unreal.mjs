// Export of the whole world for Unreal Engine 5: node tools/export-unreal.mjs [outDir] [--quality ultra|high] [--headless]
// Serves the game itself (no python needed), opens it in a browser (Edge on Windows, else Chrome / the Playwright
// Chromium), builds the world and receives the files written by src/export/unreal.js into outDir (default:
// ../unreal-export next to the game folder). Then run unreal/import_poiana.py inside the Unreal Editor.
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..');
const args = process.argv.slice(2);
const VALUED = new Set(['--quality', '--browser']), pos = [];
for (let i = 0; i < args.length; i++) { if (VALUED.has(args[i])) i++; else if (!args[i].startsWith('--')) pos.push(args[i]); }
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (VALUED.has('--' + k) ? args[i + 1] : true) : d; };
const out = path.resolve(pos[0] ?? path.join(root, '..', 'unreal-export'));
const quality = opt('quality', 'ultra');
const headless = !!opt('headless', process.platform !== 'win32');
fs.mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bin': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm' };
let bytes = 0, files = 0;
// PNG from raw RGBA (8-byte header: width, height): RGB when fully opaque, 'Up' filter, zlib level 6
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(raw) {
  const w = raw.readUInt32LE(0), h = raw.readUInt32LE(4), px = raw.subarray(8);
  let opaque = true; for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) { opaque = false; break; }
  const ch = opaque ? 3 : 4, stride = w * ch, rows = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1); rows[o] = y ? 2 : 0;                   // filter: Up (none on the first row)
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) {
      const v = px[(y * w + x) * 4 + c], up = y ? px[((y - 1) * w + x) * 4 + c] : 0;
      rows[o + 1 + x * ch + c] = (v - up) & 255;
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'PUT' && url.startsWith('/__ue/')) {
    const rel = path.normalize(url.slice(6)).replace(/^(\.\.[/\\])+/, '');
    const dst = path.join(out, rel);
    if (!dst.startsWith(out)) { res.writeHead(400); res.end(); return; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (dst.endsWith('.rgba')) {                                        // a texture: raw pixels -> PNG
      const parts = [];
      req.on('data', (d) => parts.push(d));
      req.on('end', () => {
        try { const out = png(Buffer.concat(parts)); fs.writeFileSync(dst.slice(0, -5), out); files++; bytes += out.length; res.writeHead(200); res.end('ok'); }
        catch (e) { res.writeHead(500); res.end(String(e)); }
      });
      return;
    }
    const ws = fs.createWriteStream(dst);
    req.pipe(ws);
    ws.on('finish', () => { files++; bytes += ws.bytesWritten; res.writeHead(200); res.end('ok'); });
    ws.on('error', (e) => { res.writeHead(500); res.end(String(e)); });
    return;
  }
  const f = path.join(root, url === '/' ? 'index.html' : url);
  if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(f).pipe(res);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// the browser: CHROME=<path> wins; else Edge on Windows, Chrome elsewhere, else the Playwright Chromium of the tests
// 2D canvases on the CPU: reading the generated textures back is then fast (WebGL keeps the GPU)
const launch = { headless, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--disable-accelerated-2d-canvas', '--js-flags=--max-old-space-size=8192'] };
const pw = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browserOpt = opt('browser', null);
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
else if (browserOpt && browserOpt !== true) launch.channel = browserOpt;
else if (process.platform === 'win32') launch.channel = 'msedge';
else if (fs.existsSync(pw)) { launch.executablePath = pw; launch.args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader'); }
else launch.channel = 'chrome';
console.log(`Export Unreal -> ${out}\nbrowser: ${launch.executablePath ?? launch.channel} (${headless ? 'headless' : 'cu fereastră'}), calitate: ${quality}`);
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(0);
const errors = [];
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[ue]') || t.startsWith('[geo]')) console.log(t); else if (m.type() === 'error') errors.push(t); });
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((q) => localStorage.setItem('strada.quality', JSON.stringify(q)), quality);
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__game || document.getElementById('loader')?.classList.contains('err'), null, { timeout: 0 });
if (!(await page.evaluate(() => !!window.__game))) { console.log(await page.textContent('#loadText')); for (const e of errors) console.log(e); process.exit(1); }
console.log(`jocul s-a încărcat în ${((Date.now() - t0) / 1000).toFixed(0)} s; export…`);
const stats = await page.evaluate(async () => {
  const m = await import('./src/export/unreal.js');
  return m.exportUnreal(window.__game, m.httpSink('/__ue/'), { log: (s) => console.log('[ue] ' + s) });
});
await browser.close();
server.close();
console.log(`\n${files} fișiere, ${(bytes / 1e6).toFixed(0)} MB în ${out}`);
console.log(JSON.stringify(stats));
if (errors.length) { console.log('erori în pagină:'); for (const e of errors.slice(0, 20)) console.log('  ' + e); }
