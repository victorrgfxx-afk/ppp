import * as THREE from 'three';

// A snow night as a mission (V100): when it snows or a blizzard blows after dark, the street turns into the opening
// of a winter operation, the way shooters stage their snow missions (Call of Duty's "Cliffhanger": a storm that
// hides you and blinds you as it builds, frost forming on the weapons, the scope's lens frosting over - Kotaku's
// preview, 2009). Nothing here is taken from a game; only the mood:
//  * the opening lines typed out, one key at a time: the operation's name, the place, the day and the hour, the
//    coordinates and the weather as they are in the game (the map's real origin, the snow's 1 February 2026, the wind
//    and the visibility of the preset);
//  * a cold, hard look: the colour drained, the shadows steel blue, more contrast (post.js grade: uCold);
//  * frost: on the gun you carry (a matt white-blue crust, thickest on the surfaces facing up) and creeping in from the
//    corners of the view, as on a lens out in the wind; it grows over ~2 minutes outside, ~4 times faster in the
//    blizzard, and thaws in a car;
//  * your breath, visible: below ~7 C the breath's water condenses as it cools (the dew point; drier air needs
//    colder) - a puff with every breath, ~15 a minute standing, faster running;
//  * the quiet of fresh snow: it absorbs sound (absorption coefficient 0.5-0.9 for fresh snow: the town's hum and the
//    echoes go - audio.js), a low drone under the wind;
//  * fighter jets above the snow clouds, heard and not seen (jets.js).

const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SV', 'V', 'NV'];
export const dms = (v, pos, neg) => {
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60);
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″ ${v >= 0 ? pos : neg}`;
};

// the gun's frost: one shared value in its materials (a matt crust, thickest where the surface faces up)
const GUN_FROST = { value: 0 };
function frostGun(root) {
  const seen = new Set();
  root.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m || seen.has(m) || !m.isMeshStandardMaterial) continue;
      seen.add(m);
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
        sh.uniforms.uGunFrost = GUN_FROST;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGunFrost;')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uGunFrost > 0.0) {
    vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    // (rime: fine crystals, ~half a millimetre, thicker on the faces turned up; in the gun's own frame, which the
    // camera carries: they glitter as it sways)
    vec3 cq = floor(vViewPosition * 1800.0);
    float cr = fract(sin(dot(cq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float fz = clamp(uGunFrost * (0.45 + 0.55 * smoothstep(-0.3, 0.85, nW.y)) * (0.7 + 0.6 * cr), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.85, 0.9), fz * 0.95);
    roughnessFactor = mix(roughnessFactor, 0.9 - 0.5 * step(0.93, cr), fz);
    metalnessFactor = mix(metalnessFactor, 0.0, fz);
  }`);
      };
      m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|gunFrost';
      m.needsUpdate = true;
    }
  });
}

// the breath: soft puffs of condensed vapour in front of the face - camera-facing quads (points that big near the eye
// would hit the hardware's point-size limit), adding the light the droplets scatter (they never darken what is
// behind them) and leaving the frame's alpha (the haze's share, post.js) as it was
const BREATH_VERT = /* glsl */`
attribute vec3 aPos;
attribute float aAge;
attribute float aSize;
varying vec2 vQ;
varying float vA;
void main() {
  float life = clamp(aAge, 0.0, 1.0);
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aSize * (0.5 + 1.6 * life);
  gl_Position = projectionMatrix * mv;
  vQ = position.xy;
  vA = aAge < 0.0 ? 0.0 : smoothstep(0.0, 0.15, life) * (1.0 - life);
}`;
const BREATH_FRAG = /* glsl */`
uniform vec3 uCol;
varying vec2 vQ;
varying float vA;
void main() {
  float r = length(vQ) * 2.0;
  float a = vA * (1.0 - smoothstep(0.0, 1.0, r)) * (1.0 - smoothstep(0.0, 1.0, r));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uCol * a, 1.0);
}`;

const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();

export class SnowMission {
  constructor({ scene, post, audio, gun, origin }) {
    this.post = post; this.audio = audio; this.origin = origin;
    this.k = 0; this.frost = 0; this.gunFrost = 0; this.lastIntro = -1e9; this.t = 0; this.armed = true;
    if (gun?.traverse) frostGun(gun);
    // the breath's particles (a small pool, reused)
    const N = 40;
    this.N = N; this.next = 0; this.breathT = 0; this.puffLeft = 0;
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.instanceCount = N;
    this.pos = new Float32Array(N * 3); this.age = new Float32Array(N).fill(-1); this.size = new Float32Array(N); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.InstancedBufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.size, 1));
    this.bu = { uCol: { value: new THREE.Color(0.2, 0.2, 0.2) } };
    this.breath = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.bu, vertexShader: BREATH_VERT, fragmentShader: BREATH_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    this.breath.frustumCulled = false; this.breath.userData.noAO = true; this.breath.visible = false;
    scene.add(this.breath);
    // the opening lines
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:6vw;top:34vh;z-index:30;pointer-events:none;font:600 15px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'color:#e8eef2;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 12px rgba(0,0,0,.6);letter-spacing:.04em;opacity:0;transition:opacity 1.2s;white-space:pre';
    document.body.appendChild(el);
    this.typing = null;
  }

  // the lines for now: o.weather ('viscol' | 'ninsoare'), o.date (Date), o.wind (m/s), o.windFrom (deg, from north), o.vis (m)
  lines(o) {
    const d = o.date, hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
    const name = o.weather === 'viscol' ? 'OPERAȚIUNEA „CRIVĂȚ”' : 'OPERAȚIUNEA „NOAPTE ALBĂ”';
    const dn = DAYS[d.getUTCDay()], day = `${dn[0].toUpperCase() + dn.slice(1)}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hh}:${mm}`;
    const where = `${dms(this.origin.lat, 'N', 'S')}   ${dms(this.origin.lon, 'E', 'V')} · ${Math.round(this.origin.h0)} m`;
    const from = o.windFrom != null ? ' din ' + CARD[Math.round(((o.windFrom % 360) + 360) % 360 / 45) % 8] : '';
    const vis = o.vis >= 1000 ? `${(o.vis / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(o.vis / 10) * 10} m`;
    return [name, 'Strada Gării, Poiana Câmpina · Prahova, România', day, where, `Vânt ${Math.round(o.wind)} m/s${from} · vizibilitate ${vis}`];
  }
  intro(o) {
    this.lastIntro = this.t;
    const text = this.lines(o).join('\n');
    this.typing = { text, n: 0, acc: 0, hold: 0 };
    this.el.textContent = ''; this.el.style.opacity = '1';
  }

  // o: { snow, night, weather, date, wind, windFrom, vis, cam, outside (on foot), car, running, light (0-1), height }
  update(dt, o) {
    this.t += dt;
    const want = o.snow > 0.05 && o.night > 0.5 ? 1 : 0;
    this.k += (want - this.k) * Math.min(1, dt * 0.6);
    // the opening lines: once as the mission begins (and again only after it has been off a while)
    if (want && this.armed && this.k > 0.5) { this.armed = false; this.intro(o); }
    if (!want && this.k < 0.05 && this.t - this.lastIntro > 90) this.armed = true;
    if (this.typing) {
      const ty = this.typing;
      if (ty.n < ty.text.length) {
        ty.acc += dt;
        while (ty.acc > 0.034 && ty.n < ty.text.length) {
          ty.acc -= 0.034; const ch = ty.text[ty.n++];
          if (ch !== ' ' && ch !== '\n' && (ty.n & 1)) this.audio?.tick();
        }
        this.el.textContent = ty.text.slice(0, ty.n) + (ty.n < ty.text.length ? '▌' : '');
      } else if ((ty.hold += dt) > 6) { this.el.style.opacity = '0'; if (ty.hold > 8) this.typing = null; }
    }
    // frost: outside in the cold it forms (faster in the gale), in a car it thaws
    const cold = o.winter ? 1 : 0, gale = o.weather === 'viscol' ? 1 : 0;
    const fz = o.outside ? cold * (1 + 3 * gale) / 120 : -1 / 25;
    this.frost = Math.max(0, Math.min(1, this.frost + dt * fz * (o.outside ? this.k : 1)));
    this.gunFrost = Math.max(0, Math.min(1, this.gunFrost + dt * (o.outside ? cold * (1 + 2 * gale) / 150 : -1 / 30)));
    GUN_FROST.value = this.gunFrost * (0.4 + 0.6 * Math.max(this.k, 0.3 * cold));
    const gu = this.post.grade.uniforms;
    gu.uCold.value = this.k;
    gu.uFrost.value = this.frost * this.k;
    // the breath (on foot, in the cold): puffs of ~0.5 s every ~4 s standing, ~2 s running
    this.breathT -= dt;
    const breathing = !!o.winter && o.outside;
    if (breathing && this.breathT <= 0) { this.breathT = o.running ? 2 + Math.random() * 0.4 : 3.6 + Math.random() * 0.9; this.puffLeft = 0.5; }
    if (this.puffLeft > 0) {
      this.puffLeft -= dt;
      const cam = o.cam;
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
      for (let e = 0; e < 2 && breathing; e++) {
        const i = this.next = (this.next + 1) % this.N;
        _p.copy(cam.position).addScaledVector(_f, 0.3 + 0.05 * Math.random()).addScaledVector(_u, -0.17);
        this.pos.set([_p.x, _p.y, _p.z], i * 3);
        const sp = 0.6 + 0.35 * Math.random();
        this.vel.set([_f.x * sp + (Math.random() - 0.5) * 0.15 + (o.windX ?? 0) * 0.15, -0.05 + Math.random() * 0.1, _f.z * sp + (Math.random() - 0.5) * 0.15 + (o.windZ ?? 0) * 0.15], i * 3);
        this.age[i] = 0; this.life[i] = 1.0 + Math.random() * 0.6; this.size[i] = 0.09 + Math.random() * 0.06;
      }
      this.breath.geometry.attributes.aSize.needsUpdate = true;
    }
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.age[i] < 0) continue;
      const a = this.age[i] + dt / this.life[i];
      if (a >= 1) { this.age[i] = -1; continue; }
      this.age[i] = a; any = true;
      const k = Math.exp(-dt * 1.6);                                  // (the air slows the puff)
      this.vel[i * 3] *= k; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.breath.visible = any;
    if (any) {
      this.breath.geometry.attributes.aPos.needsUpdate = true; this.breath.geometry.attributes.aAge.needsUpdate = true;
      // the light the droplets scatter: as the air around you is lit (the day, the moon and the snow, the flashlight)
      const L = Math.max(0.03, Math.min(1, o.light ?? 0.5));
      this.bu.uCol.value.setRGB(0.16 * L, 0.165 * L, 0.175 * L);
    }
    return this.k;
  }
}
