import * as THREE from 'three';
import { GEO, heightAt, farAt } from './geo/data.js';

// (V118) The thunderstorm's lightning (Furtună): flashes in the cloud and bolts to the ground, their light on the sky
// and on everything, their thunder from the channel's own shape.
//
//  * How often: a severe storm flashes ~60 times a minute or more over its whole extent (the total-lightning studies
//    of severe storms: none under ~60 a minute at their peak), most of it inside the cloud (IC: CG ~3 and more); within
//    ~15 km of you that is one every ~3 s, every fourth or so a bolt to the ground.
//  * A bolt (cloud-to-ground): the stepped leader's path from the cloud base (a storm's ~1-1.6 km up) to the ground, a
//    walk of ~20-35 m steps each turned off the way by ~17 deg (the channel's tortuosity, Hill 1968), with the forks
//    the leader left - lit by the first return stroke only. 3-4 return strokes on average (3.4 in Sweden, 3.67 in a
//    high-speed video study of 1,174 flashes; ~1 in 5 a single stroke), ~48 ms apart (geometric mean; 65 arithmetic),
//    each down the main channel; about one in three of the later ones with a continuing current that keeps the channel
//    glowing for a tenth of a second or more. The flash over in ~0.2-0.5 s.
//  * Its light: the channel itself (seen through the rain: dimmed and spread by it), the cloud base lit around where it
//    leaves the cloud, the sky and the scene by the strokes (main.js: the sky's flash toward it, the hemisphere and the
//    image-based light) - by day too, under a storm's ~100-200 lux.
//  * Its thunder: every stretch of the channel sends its shock at the same moment; at your ears they arrive spread over
//    the differences of their distances at 343 m/s - the rumble's length (rarely over 30-40 s, the WMO) and its claps
//    (a stretch square to your line of sight arrives all at once). A near one cracks (the high frequencies), a far one
//    only rumbles (the air takes the highs away with distance); past ~16-20 km it is not heard at all.
const C = 343, RATE = 80;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
function groundAt(x, z) {
  if (Math.abs(x) < GEO.worldExt && Math.abs(z) < GEO.worldExt) return heightAt(x, z);
  if (GEO.farExt && Math.abs(x) < GEO.farExt * 0.995 && Math.abs(z) < GEO.farExt * 0.995) return farAt(x, z);
  return heightAt(0, 0);
}
// a stepped walk from a toward b: steps of ~step m, each turned off the way still to go by a Gaussian angle (sd tort)
function walk(r, a, b, step, tort, maxN = 500) {
  const pts = [a.clone()], p = a.clone(), d = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < maxN; i++) {
    d.subVectors(b, p);
    const rem = d.length();
    if (rem < step * 1.2) { pts.push(b.clone()); break; }
    d.divideScalar(rem);
    q.set(r() - 0.5, r() - 0.5, r() - 0.5); q.addScaledVector(d, -q.dot(d)).normalize();
    const ang = gauss(r) * tort;
    d.multiplyScalar(Math.cos(ang)).addScaledVector(q, Math.sin(ang));
    p.addScaledVector(d, step * (0.6 + 0.8 * r()));
    pts.push(p.clone());
  }
  return pts;
}
// (V118) a channel between a and b as lightning's own shape - jagged at every scale: its middle pushed aside by ~rough of
// its length, then each half's, and so on down to minLen (the wiggles of a few hundred metres seen kilometres away, the
// zig-zags of a few metres up close)
function fractal(r, a, b, rough, minLen, out = [a.clone()]) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  if (len < minLen) { out.push(b.clone()); return out; }
  d.divideScalar(len);
  const q = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5); q.addScaledVector(d, -q.dot(d)).normalize();
  const m = a.clone().lerp(b, 0.42 + 0.16 * r()).addScaledVector(q, len * rough * gauss(r));
  fractal(r, a, m, rough, minLen, out);
  return fractal(r, m, b, rough, minLen, out);
}
const BOLT_V = /* glsl */`
attribute vec3 aOther;
attribute float aSide, aW, aDir;
uniform vec2 uRes;
uniform float uPx, uWide;
varying float vW, vS;
varying vec3 vWp;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 a = projectionMatrix * viewMatrix * wp;
  vec4 b = projectionMatrix * viewMatrix * (modelMatrix * vec4(aOther, 1.0));
  float aw = max(a.w, 1e-3), bw = max(b.w, 1e-3);
  vec2 dir = (b.xy / bw - a.xy / aw) * aDir * uRes;
  dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
  // the half width in pixels: the channel's glare at least uPx, a near one its few metres' worth (uWide m)
  float px = max(uPx, uWide * projectionMatrix[1][1] * uRes.y * 0.5 / aw);
  a.xy += vec2(-dir.y, dir.x) * aSide * px / uRes * 2.0 * a.w;
  gl_Position = a;
  vW = aW; vS = aSide; vWp = wp.xyz;
}`;
const BOLT_F = /* glsl */`
uniform float uI, uExt, uBase, uSoft;
uniform vec3 uCol;
varying float vW, vS;
varying vec3 vWp;
void main() {
  float prof = exp(-vS * vS * uSoft);
  float T = exp(-uExt * distance(vWp, cameraPosition));
  float inCloud = 1.0 - smoothstep(uBase - 90.0, uBase + 30.0, vWp.y);       // (above the cloud base it is not seen)
  gl_FragColor = vec4(uCol * (uI * vW * prof * T * inCloud), 1.0);
}`;

function boltGeometry(lines) {
  let n = 0;
  for (const l of lines) n += l.pts.length - 1;
  const P = new Float32Array(n * 12), O = new Float32Array(n * 12), S = new Float32Array(n * 4), Wt = new Float32Array(n * 4), D = new Float32Array(n * 4);
  const I = new Uint32Array(n * 6);
  let k = 0;
  for (const l of lines) {
    const m = l.pts.length - 1;
    for (let i = 0; i < m; i++, k++) {
      const a = l.pts[i], b = l.pts[i + 1], wa = l.w0 + (l.w1 - l.w0) * i / m, wb = l.w0 + (l.w1 - l.w0) * (i + 1) / m;
      const v = k * 4;
      for (let j = 0; j < 4; j++) {
        const p = j < 2 ? a : b, o = j < 2 ? b : a;
        P.set([p.x, p.y, p.z], (v + j) * 3); O.set([o.x, o.y, o.z], (v + j) * 3);
        S[v + j] = j & 1 ? 1 : -1; Wt[v + j] = j < 2 ? wa : wb; D[v + j] = j < 2 ? 1 : -1;
      }
      I.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aOther', new THREE.BufferAttribute(O, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(S, 1));
  g.setAttribute('aW', new THREE.BufferAttribute(Wt, 1));
  g.setAttribute('aDir', new THREE.BufferAttribute(D, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  return g;
}
// (a soft round glow: the cloud base lit round where the channel leaves it)
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 8; i++) { const u = i / 8; gr.addColorStop(u, `rgba(255,255,255,${Math.exp(-u * u * 4.5).toFixed(3)})`); }   // (a Gaussian: no edge)
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Thunderstorm {
  constructor(scene, audio) {
    this.scene = scene; this.audio = audio;
    this.t = 0; this.next = 2.5; this.flashes = []; this.seed = (Math.random() * 1e9) | 0; this.n = 0;
    this.level = 0; this.dir = new THREE.Vector3(0, 0.3, -1).normalize();
    this.res = new THREE.Vector2(1920, 1080);
    const mk = (px, wide, soft, k) => new THREE.ShaderMaterial({
      uniforms: { uRes: { value: this.res }, uPx: { value: px }, uWide: { value: wide }, uI: { value: 0 }, uExt: { value: 0 }, uBase: { value: 1e4 }, uSoft: { value: soft }, uCol: { value: new THREE.Color(0.82, 0.86, 1.0) }, k: { value: k } },
      vertexShader: BOLT_V, fragmentShader: BOLT_F, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, fog: false,
      side: THREE.DoubleSide,                                   // (the ribbons are turned to the screen either way round)
    });
    this.mkCore = () => mk(0.9, 1.6, 2.2, 1);
    this.mkGlow = () => mk(5, 10, 1.2, 0.05);
    this.glowTex = glowTexture();
    // a first, still storm's flash comes ~2.5 s in
  }
  setSize(w, h) { this.res.set(w, h); }
  // the next flash: where (a ring round you, most of them 2-8 km off: the distance ~ Gamma(2, 2.5 km)), what kind,
  // its strokes
  // (at: a bolt to the ground there - the tests)
  spawn(ctx, at = null) {
    const r = mulberry(this.seed + ++this.n * 7919), cam = ctx.camera.position;
    let dist = Math.min(14000, Math.max(350, -2500 * Math.log(Math.max(1e-6, r() * r())))), az = r() * Math.PI * 2;
    if (at) { dist = Math.hypot(at.x - cam.x, at.z - cam.z); az = Math.atan2(at.z - cam.z, at.x - cam.x); }
    const gx = cam.x + Math.cos(az) * dist, gz = cam.z + Math.sin(az) * dist, gy = groundAt(gx, gz);
    const base = gy + 1000 + 600 * r();
    const cg = at ? true : r() < 0.26;
    const f = { cg, t0: this.t, strokes: [], dist, base, lv: 0, done: false };
    if (cg) {
      // the strokes: the first with its branches, then down the main channel (~48 ms apart, log-normal)
      const N = r() < 0.2 ? 1 : Math.min(8, 2 + Math.floor(-Math.log(Math.max(1e-6, r())) * 2.4));
      let at = this.t + 0.02;
      for (let i = 0; i < N; i++) {
        const cc = i > 0 && r() < 0.33;
        f.strokes.push({ t: at, B: i === 0 ? 1 : 0.35 + 0.45 * r(), tau: cc ? 0.08 + 0.12 * r() : 0.018 + 0.017 * r(), first: i === 0 });
        at += Math.min(0.2, Math.max(0.012, 0.048 * Math.exp(0.6 * gauss(r))));
      }
      // the channel: out of the cloud a few hundred metres off, slanting down to the ground
      const top = new THREE.Vector3(gx + (r() - 0.5) * 900, base + 220, gz + (r() - 0.5) * 900), ground = new THREE.Vector3(gx, gy, gz);
      const fine = dist < 2500 ? 5 : dist < 6000 ? 10 : 20;
      const main = fractal(r, top, ground, 0.16, fine);
      const lines = [{ pts: main, w0: 1, w1: 1, main: true }];
      for (let i = 3; i < main.length * 0.85; i++) {
        if (r() > 0.6 / Math.sqrt(main.length)) continue;
        const s = main[i], down = new THREE.Vector3().subVectors(main[Math.min(main.length - 1, i + 3)], s).normalize();
        const side = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize();
        const dir = down.multiplyScalar(0.75).addScaledVector(side, 0.7).normalize();
        dir.y = Math.min(dir.y, -0.3); dir.normalize();
        const len = (110 + 480 * r()) * (1 - 0.7 * i / main.length);
        const b = fractal(r, s, s.clone().addScaledVector(dir, len), 0.22, fine);
        lines.push({ pts: b, w0: 0.42, w1: 0.06 });
        if (b.length > 6 && r() < 0.45) {
          const k = 2 + Math.floor(r() * (b.length - 4)), s2 = b[k], d2 = dir.clone().addScaledVector(new THREE.Vector3(r() - 0.5, 0, r() - 0.5), 1.1).normalize();
          d2.y = Math.min(d2.y, -0.25); d2.normalize();
          lines.push({ pts: fractal(r, s2, s2.clone().addScaledVector(d2, len * 0.45), 0.24, fine), w0: 0.2, w1: 0.04 });
        }
      }
      f.lines = lines; f.top = top; f.ground = ground;
      const g = boltGeometry(lines), gMain = boltGeometry([lines[0]]);
      f.mesh = [new THREE.Mesh(g, this.mkCore()), new THREE.Mesh(g, this.mkGlow()), new THREE.Mesh(gMain, this.mkCore()), new THREE.Mesh(gMain, this.mkGlow())];
      for (const m of f.mesh) { m.frustumCulled = false; m.renderOrder = 5; m.material.uniforms.uBase.value = base; m.visible = false; this.scene.add(m); }
      f.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      f.sprite.position.set(top.x, base - 40, top.z); f.sprite.scale.setScalar(2600); f.sprite.renderOrder = 4;
      this.scene.add(f.sprite);
      f.at = new THREE.Vector3(top.x, base, top.z);
      this.thunder(f, lines, ctx.camera);
    } else {
      // in the cloud: a few pulses over ~0.3-0.8 s that light a part of the cloud from within
      const n = 3 + Math.floor(r() * 6), len = 0.3 + 0.5 * r();
      for (let i = 0; i < n; i++) f.strokes.push({ t: this.t + len * (i / n + 0.08 * r()), B: 0.15 + 0.4 * r(), tau: 0.04 + 0.05 * r() });
      const alt = base + 1500 + 3500 * r();
      f.at = new THREE.Vector3(gx, alt, gz);
      // its channel for the thunder: a long, wandering run through the cloud
      const a2 = r() * Math.PI * 2, L = 3000 + 6000 * r(), h = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2)).multiplyScalar(L / 2);
      const pts = walk(r, f.at.clone().sub(h), f.at.clone().add(h), 60, 0.35);
      this.thunder(f, [{ pts, w0: 0.7, w1: 0.7 }], ctx.camera);
    }
    this.flashes.push(f);
  }
  // the thunder at your ears: the channel cut into ~8 m pieces, each a pulse ~ its length / its distance arriving at
  // its distance / 343 m/s; the highs fall away with distance (~exp(-d / 900 m))
  thunder(f, lines, camera) {
    if (!this.audio?.thunderCurve) return;
    const ear = camera.position;
    const pcs = [];
    let dmin = Infinity, dmax = 0;
    for (const l of lines) {
      for (let i = 1; i < l.pts.length; i++) {
        const a = l.pts[i - 1], b = l.pts[i], len = a.distanceTo(b), n = Math.max(1, Math.round(len / 8)), w = (l.w0 + l.w1) / 2;
        for (let j = 0; j < n; j++) {
          const u = (j + 0.5) / n, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u;
          const d = Math.hypot(x - ear.x, y - ear.y, z - ear.z);
          pcs.push(d, len / n * w * w / d);
          if (d < dmin) dmin = d; if (d > dmax) dmax = d;
        }
      }
    }
    if (dmin > 20000) return;                                                   // (past ~20 km: not heard)
    const tail = 2.5, n = Math.min(Math.ceil((dmax - dmin) / C * RATE + tail * RATE), RATE * 40);
    const lo = new Float32Array(n), hi = new Float32Array(n);
    // every stroke's thunder: the first along all of it, the later ones down the main channel only (weaker)
    const t0 = f.strokes[0].t;
    for (const s of f.strokes) {
      const off = Math.round((s.t - t0) * RATE), k = s.B;
      for (let i = 0; i < pcs.length; i += 2) {
        const d = pcs[i], bin = off + Math.floor((d - dmin) / C * RATE);
        if (bin >= n) continue;
        lo[bin] += pcs[i + 1] * k; hi[bin] += pcs[i + 1] * k * Math.exp(-d / 900);
      }
      if (!f.cg) break;
    }
    // each pulse rings on a little (the shock's own length, the ground's echo): a short smoothing, then a decay
    const sm = (a) => { let p = 0; for (let i = 0; i < n; i++) { p = Math.max(a[i], p * Math.exp(-1 / (0.09 * RATE))); a[i] = p; } };
    sm(lo); sm(hi);
    let m = 1e-9; for (let i = 0; i < n; i++) m = Math.max(m, lo[i]);
    for (let i = 0; i < n; i++) { lo[i] = Math.pow(lo[i] / m, 0.55); hi[i] = Math.pow(Math.min(1, hi[i] / m), 0.7); }
    for (let i = 0; i < RATE * 0.3 && i < n; i++) { const e = 1 - i / (RATE * 0.3); lo[n - 1 - i] *= 1 - e; hi[n - 1 - i] *= 1 - e; }
    const km = dmin / 1000, gain = 0.9 * Math.min(1, 1.15 / (0.35 + km)), crack = Math.exp(-dmin / 700);
    // where it comes from, to the left or the right of the way you look (taken now: it is heard where it happened)
    const ax = (f.cg ? f.ground.x : f.at.x) - ear.x, az = (f.cg ? f.ground.z : f.at.z) - ear.z, e = camera.matrixWorld.elements;
    const pan = (ax * e[0] + az * e[2]) / (Math.hypot(ax, az) * Math.hypot(e[0], e[2]) || 1);
    this.audio.thunderCurve(dmin / C, lo, hi, RATE, gain, crack, pan, 120 + 900 * Math.exp(-dmin / 2500));
  }
  // ctx: { on: 0..1, camera, vis: the visibility now (m), paused };
  // returns how bright the flash is now (the sky, the scene: main.js) and its direction (this.dir)
  update(dt, ctx) {
    this.t += dt;
    if (ctx.on > 0.5 && !ctx.paused) {
      this.next -= dt;
      if (this.next <= 0) { this.next = -Math.log(Math.max(1e-6, Math.random())) * 3 / ctx.on; this.spawn(ctx); }
    }
    let level = 0;
    const acc = this._acc ??= new THREE.Vector3(), cam = ctx.camera.position, dv = this._d ??= new THREE.Vector3();
    acc.set(0, 0, 0);
    const ext = 3.912 / Math.max(300, (ctx.vis ?? 2000) * 2.5);
    for (const f of this.flashes) {
      let lv = 0, first = 0;
      for (const s of f.strokes) {
        if (this.t < s.t) continue;
        const e = s.B * Math.exp(-(this.t - s.t) / s.tau);
        if (e > lv) { lv = e; first = s.first ? 1 : 0; }
      }
      f.lv = lv;
      const last = f.strokes[f.strokes.length - 1];
      if (this.t > last.t + last.tau * 8) f.done = true;
      // its light where you are: a bolt ~ a point a few km off (~1/d^2 past ~1.2 km), the cloud's glow ~ more spread;
      // dimmed by the rain between (but the cloud above scatters it back down to you)
      const km = f.dist / 1000, T = 0.35 + 0.65 * Math.exp(-ext * f.dist);
      const k = (f.cg ? 1 / (1 + (km / 1.2) ** 2) : 0.55 / (1 + (km / 2.5) ** 2)) * T;
      level += lv * k;
      if (lv > 0.01) acc.addScaledVector(dv.subVectors(f.at, cam).normalize(), lv * k);
      if (f.mesh) {
        const on = lv > 0.01 && !f.done;
        // the first stroke lights the forks too; the later ones the main channel only
        const [all, allG, main, mainG] = f.mesh;
        all.visible = allG.visible = on && first === 1;
        main.visible = mainG.visible = on && first === 0;
        // (a channel's luminance is enormous - ~10^7 cd/m2 and more - so it stays white through a few per cent of the
        // rain's transmission; past a few kilometres in a downpour only its glow comes through)
        for (const m of f.mesh) { m.material.uniforms.uI.value = lv * 400; m.material.uniforms.uExt.value = m.material.uniforms.k.value < 1 ? ext * 0.6 : ext; }
        for (const m of [allG, mainG]) m.material.uniforms.uI.value = lv * 400 * 0.006;
        f.sprite.visible = on;
        f.sprite.material.color.setScalar(Math.min(0.9, lv * 0.8) * Math.exp(-ext * 0.5 * f.dist));
      }
    }
    // (gone: their meshes with them)
    for (const f of this.flashes) if (f.done && f.mesh) {
      for (const m of f.mesh) { this.scene.remove(m); m.material.dispose(); }
      f.mesh[0].geometry.dispose(); f.mesh[2].geometry.dispose();
      this.scene.remove(f.sprite); f.sprite.material.dispose();
      f.mesh = null;
    }
    this.flashes = this.flashes.filter(f => !f.done);
    if (acc.lengthSq() > 1e-8) this.dir.copy(acc).normalize();
    this.level = Math.min(2.5, level);
    return this.level;
  }
}
