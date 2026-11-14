import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './geo/data.js';

// Fighter jets over the valley (V100). The Romanian Air Force flies F-16s (the 86th Air Base at Borcea-Fetești, the
// 71st at Câmpia Turzii, the 57th at Mihail Kogălniceanu) and announces its low-level training: 150-2 000 m over the
// ground, all over the country, "loud" (MApN; Romania Insider, 2025). From time to time a pair crosses the sky here:
//  * a low pass (clear weather, day or night): leader and wingman 180-500 m over the ground, ~830 km/h, the line passing
//    within a few hundred metres of you; now and then they pull up on afterburner past you;
//  * a transit at 9-11 km on clear days: two specks drawing contrails (at -40 to -55 C the exhaust's water freezes:
//    the Schmidt-Appleman criterion), short-lived in autumn, spreading and lasting in the winter's cold, dry air;
//    rarely (exercise windows: "low-altitude and supersonic flights") supersonic - its boom reaches the ground as a
//    double thump (N-wave) of 1-2 psf (48-96 Pa: NASA), the windows rattle;
//  * above the cloud deck (overcast, rain, snow): only heard, a roar rolling across the sky.
// The airframe is a generic F-16-like shape (15 m long, 9.5 m span: a cropped delta at 40 deg, one fin, a bubble
// canopy, the chin intake; the grey of the type), drawn as one mesh; by night its position lights (red to the left,
// green to the right, white aft: 14 CFR 25.1385) and the white anti-collision strobe (~1 Hz: 40-100 flashes a minute,
// 14 CFR 25.1401).
// The sound is heard as it is in the open: from where the jet WAS when it left (the retarded time: |P - V s - L| = c s,
// so the roar comes from behind the jet and peaks after it has passed), Doppler-shifted by its speed along that line,
// louder aft (jet mixing noise peaks ~130 deg from the nose: Plotkin, Lee & Downing on an F-16C), 103 dB at 305 m at
// military power (AFRL: F-16 with the F100-PW-220, the Romanian jets' engine), +7 dB on afterburner, falling 6 dB per
// doubling of distance and losing its highs to the air (ISO 9613-1: ~30 dB per km at 4 kHz). Past ~95 dB the low
// end is felt: the view shudders (jets.rumble, main.js).

const C_SOUND = 337;                                 // (m/s, ~10 C; 331.3 + 0.606 T)
const L_MIL = 103, R_REF = 305;                      // dB at 305 m, military power (AFRL)

// where the sound heard now left a jet flying straight at constant velocity V, now at P (listener L): it left s seconds
// ago from P - V s, r = c s away. cosT: the angle from its nose to the listener then; vr: its speed toward the listener.
export function heardFrom(P, V, L, c = C_SOUND) {
  const dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z, dv = dx * V.x + dy * V.y + dz * V.z;
  const v2 = V.x * V.x + V.y * V.y + V.z * V.z, a = v2 - c * c, d2 = dx * dx + dy * dy + dz * dz;
  let s;
  if (Math.abs(a) < 1e-6) s = d2 / Math.max(2 * dv, 1e-6);
  else if (a > 0 && dv * dv - a * d2 < 0) return { s: NaN, r: NaN, cosT: 0, vr: 0, ex: dx, ey: dy, ez: dz };   // (supersonic, outside its cone: not heard yet)
  else s = (dv - Math.sqrt(Math.max(dv * dv - a * d2, 0))) / a;   // (subsonic: the one root > 0)
  const ex = dx - V.x * s, ey = dy - V.y * s, ez = dz - V.z * s;       // (the jet then, from the listener)
  const r = Math.max(Math.hypot(ex, ey, ez), 1e-3), sp = Math.sqrt(v2) || 1;
  const toL = -(ex * V.x + ey * V.y + ez * V.z) / r;                  // (its velocity along jet -> listener)
  return { s, r, cosT: toL / sp, vr: toL, ex, ey, ez };
}
// the level heard (dB) at r, cosT from the nose; power: 0 cruise, 1 military, 2 afterburner
export function jetLevel(r, cosT, power = 1) {
  const th = Math.acos(Math.max(-1, Math.min(1, cosT))) * 180 / Math.PI;
  const dir = -13 + 13 * Math.exp(-(((th - 130) / 38) ** 2));        // (aft-peaked: 0 at its peak, ~13 dB less ahead)
  const absorb = 1.5 * Math.max(0, r - R_REF) / 1000;                 // (what is left far off is the low rumble: ~1.5 dB/km; the highs: the low-pass)
  return L_MIL + (power === 2 ? 7 : power === 0 ? -10 : 0) + 20 * Math.log10(R_REF / r) + dir - absorb;
}

// ---- the airframe (metres; nose along +z, up +y)
function jetGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const TOP = 0x6f767d, BELLY = 0x9aa1a8, DARK = 0x24262a;          // (FS 36118 / 36270 / 36375 greys)
  // a thin plate from a planform [[a, b]] in a plane: 'xz' (wings, tailplanes) or 'zy' (the fin)
  const plate = (pts, t, plane) => {
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    if (plane === 'xz') g.rotateX(Math.PI / 2); else g.rotateY(-Math.PI / 2);
    return g;
  };
  // the fuselage: a body of revolution (wider than tall), the nozzle at its end
  const prof = [[0, 7.6], [0.22, 6.9], [0.42, 6.0], [0.58, 4.8], [0.68, 3.2], [0.74, 1.2], [0.77, -1.5], [0.74, -4.2], [0.64, -6.3], [0.56, -7.4]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 18); fus.rotateX(Math.PI / 2); fus.scale(1.15, 0.92, 1);
  paint(fus, TOP);
  // the lighter belly, blended into the body (a flattened lower half)
  const belly = new THREE.LatheGeometry(prof, 18, -Math.PI / 2, Math.PI); belly.rotateX(Math.PI / 2); belly.scale(1.16, 0.95, 1); belly.translate(0, -0.01, 0);
  paint(belly, BELLY);
  // the chin intake under the cockpit: a rounded duct, its mouth dark
  const intake = new THREE.CylinderGeometry(0.46, 0.5, 3.4, 14); intake.rotateX(Math.PI / 2); intake.scale(1.05, 0.72, 1); intake.translate(0, -0.66, 2.2);
  paint(intake, BELLY);
  const mouth = new THREE.CircleGeometry(0.42, 14); mouth.scale(1.05, 0.72, 1); mouth.translate(0, -0.66, 3.92); paint(mouth, DARK);
  // the bubble canopy (smoked, a gold tint)
  const can = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); can.scale(0.4, 0.48, 1.55); can.translate(0, 0.6, 3.6);
  paint(can, 0x4a4434);
  // the wings with their strakes, the tailplanes, the fin, the wingtip rails
  for (const s of [-1, 1]) {
    const m = (pts) => pts.map(([x, z]) => [x * s, z]);
    const wing = plate(m([[0.7, 0.3], [4.75, -3.0], [4.75, -4.0], [0.7, -4.3]]), 0.16, 'xz');
    paint(wing, 0x7c838a);
    paint(plate(m([[0.55, 3.9], [1.0, 0.5], [0.6, 0.4]]), 0.1, 'xz'), TOP);
    paint(plate(m([[0.7, -5.2], [2.9, -6.6], [2.9, -7.2], [0.7, -7.5]]), 0.1, 'xz'), TOP);
    const rail = new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6); rail.rotateX(Math.PI / 2); rail.translate(4.85 * s, 0, -2.6); paint(rail, BELLY);
  }
  const fin = plate([[-3.6, 0.55], [-5.9, 3.55], [-6.8, 3.55], [-7.05, 0.55]], 0.14, 'zy'); paint(fin, TOP);
  const noz = new THREE.CylinderGeometry(0.5, 0.56, 0.9, 16, 1, true); noz.rotateX(Math.PI / 2); noz.translate(0, 0, -7.7); paint(noz, 0x3b3a38);
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// the position lights and the strobe: points kept a few pixels wide at any distance, additive, by night
const LIGHT_VERT = /* glsl */`
attribute vec3 color;
attribute float strobe;
uniform float uTime, uPx;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(0.9 * uPx / -mv.z, 3.5, 14.0);     // (a few pixels at any distance: lamps are seen from kilometres off)
  vCol = color;
  vA = strobe > 0.5 ? step(fract(uTime * 1.1 + strobe * 0.37), 0.06) * 2.5 : 1.0;
}`;
const LIGHT_FRAG = /* glsl */`
uniform float uOn;
varying vec3 vCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA * uOn;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;
// the afterburner's flame: a cone behind the nozzle, white-blue inside (shock diamonds) to orange at its tip
const AB_VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const AB_FRAG = /* glsl */`
uniform float uAB, uTime;
varying vec3 vP;
void main() {
  float t = clamp((-vP.z - 8.1) / 6.5, 0.0, 1.0);         // (0 at the nozzle's exit, 8.1 m aft of the jet's middle; 1 at the tip)
  float diamonds = 0.65 + 0.35 * sin(t * 34.0 - uTime * 40.0);
  vec3 c = mix(vec3(1.0, 0.78, 0.5) * diamonds + vec3(0.12, 0.16, 0.35) * (1.0 - diamonds), vec3(1.3, 0.42, 0.08), smoothstep(0.1, 0.75, t));
  float a = uAB * (1.0 - t) * (0.85 + 0.15 * sin(uTime * 63.0 + vP.x * 9.0));
  gl_FragColor = vec4(c * a * 1.25, 1.0);
}`;

// a contrail: a ribbon of the jet's past positions, widening and fading with age
class Contrail {
  constructor(scene, n = 90) {
    this.n = n; this.pts = []; this.age = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.userData.noAO = true; this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = 0;
  }
  reset() { this.pts.length = 0; this.age.length = 0; this.mesh.visible = false; }
  // add the jet's tail position every ~0.6 s; life: how long the trail lasts (s); light: the sun's share on it
  update(dt, tail, emitting, cam, life, light) {
    this.t += dt;
    if (emitting && this.t > 0.6) { this.t = 0; this.pts.unshift(tail.clone()); this.age.unshift(0); if (this.pts.length > this.n) { this.pts.pop(); this.age.pop(); } }
    for (let i = 0; i < this.age.length; i++) this.age[i] += dt;
    while (this.age.length && this.age[this.age.length - 1] > life) { this.pts.pop(); this.age.pop(); }
    const m = this.pts.length;
    this.mesh.visible = m > 1 && light > 0.02;
    if (!this.mesh.visible) return;
    const _d = Contrail._d ??= new THREE.Vector3(), _s = Contrail._s ??= new THREE.Vector3(), _v = Contrail._v ??= new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const k = Math.min(i, m - 1), p = this.pts[k], a = this.age[k];
      _d.subVectors(this.pts[Math.min(k + 1, m - 1)], this.pts[Math.max(k - 1, 0)]);
      if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0);
      _v.subVectors(cam, p);
      _s.crossVectors(_d, _v).normalize().multiplyScalar(5 + 22 * Math.sqrt(a / 30));   // (half its width: ~10 m young, ~55 m after a minute as it spreads)
      this.pos.set([p.x + _s.x, p.y + _s.y, p.z + _s.z, p.x - _s.x, p.y - _s.y, p.z - _s.z], i * 6);
      // (a gap right behind the nozzles: the water freezes ~a wingspan aft; fading as it disperses)
      const al = (i < m ? 1 : 0) * Math.min(1, a / 1.2) * Math.max(0, 1 - a / life) * 0.85 * light;
      this.col.set([1, 1, 1, al, 1, 1, 1, al], i * 8);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

const _P = new THREE.Vector3(), _L = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

export class Jets {
  constructor(scene, opts = {}) {
    this.audio = opts.audio; this.scene = scene;
    const geo = jetGeometry();
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
    this.lightU = { uTime: { value: 0 }, uPx: { value: 800 }, uOn: { value: 0 } };
    this.abU = { uAB: { value: 0 }, uTime: this.lightU.uTime };
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([-4.9, 0, -2.6, 4.9, 0, -2.6, 0, 0.7, -7.6, 0, 3.6, -6.4, 0, -1.1, -1.5], 3));
    // (the nose along +z, up +y: the left wing is +x - red there, green on the right: the rule of the road in the air)
    lg.setAttribute('color', new THREE.Float32BufferAttribute([0.2, 6, 0.8, 6, 0.3, 0.2, 3.5, 3.5, 3.5, 6, 6, 6, 6, 6, 6], 3));
    lg.setAttribute('strobe', new THREE.Float32BufferAttribute([0, 0, 0, 1, 2], 1));
    const lmat = new THREE.ShaderMaterial({ uniforms: this.lightU, vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const abGeo = new THREE.ConeGeometry(0.5, 6.5, 14, 1, true); abGeo.rotateX(-Math.PI / 2); abGeo.translate(0, 0, -8.1 - 3.25);
    const abMat = new THREE.ShaderMaterial({ uniforms: this.abU, vertexShader: AB_VERT, fragmentShader: AB_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.jets = [0, 1].map(() => {
      const g = new THREE.Group(); g.visible = false;
      const body = new THREE.Mesh(geo, this.mat); body.userData.noAO = true; body.castShadow = false;
      const lights = new THREE.Points(lg, lmat); lights.frustumCulled = false; lights.userData.noAO = true;
      const ab = new THREE.Mesh(abGeo, abMat); ab.visible = false; ab.userData.noAO = true; ab.frustumCulled = false;
      g.add(body, lights, ab); scene.add(g);
      return { g, ab, pos: new THREE.Vector3(), vel: new THREE.Vector3(), trail: new Contrail(scene), power: 1, heard: null, level: 0 };
    });
    this.ev = null;                  // the pass in progress
    this.next = 70 + Math.random() * 90;   // (s to the first one)
    this.rumble = 0; this.level = 0; this.t = 0;
    this.boomAt = -1;
  }

  // a pass now: 'low', 'high', 'cloud' or 'boom' (tests, or the schedule); around the listener at L
  spawn(kind, L) {
    const yaw = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const off = kind === 'low' ? (Math.random() - 0.5) * 900 : (Math.random() - 0.5) * 4000;
    const closest = new THREE.Vector3(L.x, 0, L.z).addScaledVector(side, off);
    let alt, speed, half;
    if (kind === 'low') {
      // over the highest ground on the line (sampled), 180-500 m above it
      let hmax = -1e9;
      for (let k = -8; k <= 8; k++) { const p = closest.clone().addScaledVector(dir, k * 1200); hmax = Math.max(hmax, heightAt(p.x, p.z) || 0); }
      alt = Math.max(hmax, heightAt(closest.x, closest.z) || 0) + 180 + Math.random() * 320; speed = 230; half = 14000;
    } else if (kind === 'cloud') { alt = 2200 + Math.random() * 1800; speed = 230; half = 16000; }
    else { alt = 9000 + Math.random() * 2000; speed = kind === 'boom' ? 400 : 250; half = 26000; }
    const start = closest.clone().addScaledVector(dir, -half); start.y = alt;
    this.ev = { kind, dir, start, speed, half, t: 0, dur: 2 * half / speed, pull: kind === 'low' && Math.random() < 0.35, pullAt: half / speed + 1.5 + Math.random() * 2,
      wing: new THREE.Vector3().addScaledVector(side, kind === 'low' ? 110 : 600).addScaledVector(dir, kind === 'low' ? -90 : -400).add(new THREE.Vector3(0, kind === 'low' ? 12 : 40, 0)) };
    for (const j of this.jets) { j.trail.reset(); j.pullK = 0; }
    if (kind === 'boom') {
      // the boom rides the Mach cone (M ~1.35 at 10+ km, where sound goes ~297 m/s: mu = asin(1/M) ~ 48 deg); the cone,
      // fixed to the jet, sweeps over you when it is (its distance from you at the closest point) / tan(mu) past it
      const M = speed / 297, mu = Math.asin(1 / M);
      this.boomAt = half / speed + Math.hypot(alt - (L.y ?? 0), off) / Math.tan(mu) / speed;
    } else this.boomAt = -1;
    return this.ev;
  }

  // o: { cam, night, light (the sun's share 0-1), cover, rain, snow, winter, paused }; returns the shudder (0-1)
  update(dt, o) {
    this.t += dt;
    const L = _L.copy(o.cam.position), audio = this.audio;
    this.lightU.uTime.value = this.t;
    this.lightU.uPx.value = (o.height ?? 800) / (2 * Math.tan((o.cam.fov * Math.PI / 180) / 2));
    const overcast = o.cover >= 0.9 || o.rain > 0.05 || o.snow > 0.05;
    if (!this.ev && !o.paused) {
      this.next -= dt;
      if (this.next <= 0) {
        const kind = overcast ? 'cloud' : o.cover > 0.65 ? 'low' : Math.random() < 0.55 ? 'low' : Math.random() < 0.1 ? 'boom' : 'high';
        this.spawn(kind, L);
        this.next = (kind === 'low' ? 240 : 180) + Math.random() * 300;
      }
    }
    let rumble = 0, loud = -200;
    const ev = this.ev;
    if (ev) {
      ev.t += dt;
      const lowLight = 1 - (o.light ?? 1);
      this.lightU.uOn.value = 0.06 + 0.94 * lowLight * lowLight;      // (by day hardly seen against the sky)
      for (let i = 0; i < 2; i++) {
        const j = this.jets[i], te = ev.t - i * (ev.kind === 'low' ? 0.4 : 1.6);
        // straight and level, the leader's pull-up past you: a climb at up to 25 deg, on afterburner
        j.vel.copy(ev.dir).multiplyScalar(ev.speed);
        j.pos.copy(ev.start).addScaledVector(ev.dir, ev.speed * te);
        if (i === 1) j.pos.add(ev.wing);
        if (ev.pull && te > ev.pullAt) {
          const tp = te - ev.pullAt, TH = 0.44, T = 3, a = Math.min(tp, T), pitch = TH * Math.min(1, tp / T);
          j.pos.y += ev.speed * (T / TH) * (1 - Math.cos(TH * a / T)) + (tp > T ? ev.speed * Math.sin(TH) * (tp - T) : 0);
          j.vel.set(ev.dir.x * Math.cos(pitch), Math.sin(pitch), ev.dir.z * Math.cos(pitch)).multiplyScalar(ev.speed);
          j.pullK = Math.min(1, j.pullK + dt * 1.5);
        } else j.pullK = Math.max(0, j.pullK - dt);
        j.power = j.pullK > 0.3 ? 2 : ev.kind === 'low' ? 1 : 0;
        // pose: along its velocity, banked a little into nothing (wings level)
        _f.copy(j.vel).normalize();
        _m.lookAt(_P.set(0, 0, 0), _r.copy(_f).negate(), _up);
        j.g.quaternion.setFromRotationMatrix(_m);
        j.g.position.copy(j.pos);
        // seen: not inside or above the deck (cloud passes: heard only); the afterburner's flame
        j.g.visible = ev.kind !== 'cloud' && te > 0 && te < ev.dur;
        j.ab.visible = j.g.visible && j.pullK > 0.05;
        this.abU.uAB.value = j.pullK;
        // the contrail (high transits: at -40 C and colder the trail forms; lasting in winter)
        if (ev.kind === 'high' || ev.kind === 'boom') {
          _P.set(0, 0, -9).applyQuaternion(j.g.quaternion).add(j.pos);
          j.trail.update(dt, _P, j.g.visible, L, o.winter ? 110 : 26, (o.light ?? 1) * (1 - 0.8 * Math.min(1, o.cover / 0.7)));
        } else j.trail.update(dt, j.pos, false, L, 1, 0);
        // heard now: from where it was when this sound left it
        const h = te > -5 && te < ev.dur + 60 && ev.kind !== 'boom' ? heardFrom(j.pos, j.vel, L) : null;
        if (h && Number.isFinite(h.r)) {
          let lv = jetLevel(h.r, h.cosT, j.power);
          if (ev.kind === 'cloud') lv -= 4;                       // (through the deck: duller)
          lv -= 3 * (o.snowHush ?? 0);                              // (fresh snow swallows the ground's echo)
          const doppler = C_SOUND / (C_SOUND - Math.max(-C_SOUND * 0.6, Math.min(C_SOUND * 0.6, h.vr)));
          // the air's absorption: the highs lost over the path (ISO 9613-1, roughly), more in the cloud
          const cutoff = Math.max(180, Math.min(14000, 2600 * Math.pow(1000 / h.r, 0.75))) * (ev.kind === 'cloud' ? 0.45 : 1);
          // the listener's left/right: the source's bearing in the camera's frame
          _r.set(-h.ex, -h.ey, -h.ez).applyQuaternion(_q.copy(o.cam.quaternion).invert());
          const pan = Math.max(-1, Math.min(1, -_r.x / Math.max(1, Math.hypot(_r.x, _r.z))));
          // (the game's mix is by loudness, not pressure: loudness doubles per +10 dB (Stevens), so the gain does too -
          // 105 dB ~1.3, the loudest thing in the game; 93 dB ~0.5; a jet 10 km up ~0.02, as faint as the town's hum)
          const gain = te < -2 ? 0 : Math.min(1.5, 1.3 * Math.pow(10, (lv - 105) / 30));
          audio?.jet(i, { gain, cutoff, rate: doppler, pan, whine: h.cosT > 0.3 ? 0.06 * h.cosT : 0, crackle: 0.25 + 0.25 * (j.power === 2 ? 1 : 0) });
          j.level = lv; loud = Math.max(loud, lv);
          rumble = Math.max(rumble, THREE.MathUtils.smoothstep(lv, 93, 112));
        } else { audio?.jet(i, { gain: 0, cutoff: 500, rate: 1, pan: 0, whine: 0, crackle: 0 }); j.level = -200; }
      }
      // the boom: a double thump and the windows' rattle
      if (this.boomAt > 0 && ev.t >= this.boomAt) { this.boomAt = -1; audio?.boom(); this.boomK = 1; }
      if (ev.t > ev.dur + 60) { this.ev = null; for (const j of this.jets) { j.g.visible = false; } }
    } else {
      for (const j of this.jets) { j.g.visible = false; j.trail.update(dt, j.pos, false, L, o.winter ? 110 : 26, o.light ?? 1); }
    }
    this.boomK = Math.max(0, (this.boomK ?? 0) - dt * 3);
    this.level = loud;
    this.rumble = Math.max(rumble, this.boomK);
    return this.rumble;
  }
}
