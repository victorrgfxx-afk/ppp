/**
 * Punctul de intrare: renderer, bucla, input, urcarea/coborarea din masina,
 * setari si legarea tuturor sistemelor.
 */
import * as THREE from '../vendor/three.module.min.js';
import { buildAll, setAnisotropy } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicle } from './vehicle.js';
import { PostFX } from './postfx.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { surfaceY } from './terrain.js';
import { clamp } from './noise.js';

const QUALITY = {
  low:    { msaa: 0, scale: 0.72, levels: 4, haze: false, shadows: false, cars: 12, aniso: 4 },
  medium: { msaa: 2, scale: 0.88, levels: 5, haze: true,  shadows: true,  cars: 16, aniso: 8 },
  high:   { msaa: 4, scale: 1.00, levels: 5, haze: true,  shadows: true,  cars: 19, aniso: 16 },
  ultra:  { msaa: 8, scale: 1.00, levels: 5, haze: true,  shadows: true,  cars: 19, aniso: 16 },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.quality = localStorage.getItem('nv_quality') || 'high';
    this.input = {
      fwd: false, back: false, left: false, right: false,
      sprint: false, crouch: false, jump: false, handbrake: false,
    };
    this.time = 0;
    this.frames = 0;
    this.fpsT = 0;
    this.fps = 60;
    this.paused = false;
    this.accum = 0;
    this.tod = 0.0;          // 0 = noapte adanca
    this.fade = 0;
    this.shot = false;
  }

  async boot() {
    const bar = document.getElementById('bar');
    const label = document.getElementById('lstatus');
    const q = QUALITY[this.quality] || QUALITY.high;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance', stencil: false, depth: true,
    });
    if (!renderer.capabilities.isWebGL2) {
      label.textContent = 'Ai nevoie de un browser cu WebGL2.';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.NoToneMapping;    // tonemapping-ul se face in post
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    setAnisotropy(Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy()));
    // MSAA cerut poate depasi limita hardware -> il plafonam, altfel esueaza FBO-ul
    const gl = renderer.getContext();
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
    q.msaa = Math.min(q.msaa, maxSamples);

    label.textContent = 'generez texturile...';
    const T = await buildAll((p, name) => {
      bar.style.width = (8 + p * 62).toFixed(1) + '%';
      label.textContent = 'generez ' + name + '...';
    }, this.quality === 'low' ? 'low' : this.quality === 'medium' ? 'medium' : 'high');

    label.textContent = 'construiesc harta...';
    bar.style.width = '74%';
    await new Promise((r) => requestAnimationFrame(r));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.14, 900);

    this.world = new World(this.scene, T, renderer, {
      quality: this.quality, carCount: q.cars, haze: q.haze,
    });
    this.world.build();

    bar.style.width = '88%';
    label.textContent = 'pornesc motorul grafic...';
    await new Promise((r) => requestAnimationFrame(r));

    this.player = new Player(this.world, { x: this.world.spawn.x, z: this.world.spawn.z, yaw: 0 });
    this.scene.add(this.player.mesh);

    this.postfx = new PostFX(renderer, this.scene, this.camera, {
      msaa: q.msaa, levels: q.levels, scale: q.scale,
      exposure: 1.28, bloom: 0.55, threshold: 0.72, grain: 0.034,
      vignette: 0.88, ca: 0.0024, sat: 0.9,
    });
    this.postfx.setSize(window.innerWidth, window.innerHeight);

    // pool FIX de faruri (numarul de lumini din scena nu se schimba niciodata)
    this.rig = [];
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff2dc, 0, 58, 0.62, 0.52, 1.6);
      l.target = new THREE.Object3D();
      this.scene.add(l, l.target);
      if (q.shadows && s > 0) {
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.camera.near = 0.8;
        l.shadow.camera.far = 46;
        l.shadow.bias = -0.0012;
        l.shadow.normalBias = 0.04;
      }
      this.rig.push({ light: l, side: s });
    }

    this.audio = new GameAudio();
    this.hud = new HUD(document.getElementById('hud'));

    this.bindInput();
    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      document.getElementById('lstatus').textContent = 'Context WebGL pierdut. Reincarca pagina.';
      document.getElementById('loader').style.display = 'flex';
    });

    // preincalzire shadere: evita micro-freeze-ul la primele cadre
    renderer.compile(this.scene, this.camera);
    bar.style.width = '100%';
    label.textContent = 'gata';
    await new Promise((r) => setTimeout(r, 120));
    document.getElementById('loader').classList.add('gone');
    document.getElementById('start').classList.add('show');

    this.last = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  bindInput() {
    const map = {
      KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', ControlLeft: 'crouch', KeyC: 'crouch',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); }
      if (map[e.code]) { this.input[map[e.code]] = true; return; }
      if (e.code === 'Space') {
        if (this.vehicle) this.input.handbrake = true; else this.input.jump = true;
        return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyF': this.toggleVehicle(); break;
        case 'KeyV': this.cycleCamera(); break;
        case 'KeyL':
          if (this.vehicle) {
            this.vehicle.lightsOn = !this.vehicle.lightsOn;
            this.hud.setHint(this.vehicle.lightsOn ? 'faruri pornite' : 'faruri oprite');
            setTimeout(() => this.hud.setHint(''), 1200);
          }
          break;
        case 'KeyH': this.hud.toggle(); break;
        case 'KeyP': this.shot = true; break;
        case 'KeyR': this.respawn(); break;
        case 'Escape': this.openMenu(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) this.input[map[e.code]] = false;
      if (e.code === 'Space') { this.input.handbrake = false; this.input.jump = false; }
    });

    const onMove = (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      const s = this.sens || 0.0022;
      const t = this.vehicle ? null : this.player;
      if (t) {
        t.yaw -= e.movementX * s;
        t.pitch = clamp(t.pitch - e.movementY * s, -1.25, 1.05);
      } else {
        this.vehicle.yaw -= 0;   // camera masinii urmareste automat
        this.camOrbit = (this.camOrbit || 0) - e.movementX * s * 0.0;
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('wheel', (e) => {
      if (this.vehicle || document.pointerLockElement !== this.canvas) return;
      this.player.camDist = clamp(this.player.camDist + Math.sign(e.deltaY) * 0.4, 1.4, 8.5);
    }, { passive: true });

    const lock = () => {
      this.canvas.requestPointerLock();
      this.audio.resume();
      document.getElementById('start').classList.remove('show');
      document.getElementById('menu').classList.remove('show');
      this.paused = false;
    };
    this.canvas.addEventListener('click', lock);
    document.getElementById('startbtn').addEventListener('click', lock);
    document.getElementById('resume').addEventListener('click', lock);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && !this.paused) this.openMenu();
    });
  }

  openMenu() {
    this.paused = true;
    document.getElementById('menu').classList.add('show');
    document.getElementById('start').classList.remove('show');
  }

  bindUI() {
    const on = (id, ev, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(ev, fn);
      return el;
    };
    on('sExposure', 'input', (e) => this.postfx.set('exposure', +e.target.value));
    on('sBloom', 'input', (e) => this.postfx.set('bloom', +e.target.value));
    on('sGrain', 'input', (e) => this.postfx.set('grain', +e.target.value));
    on('sFov', 'input', (e) => {
      this.camera.fov = +e.target.value;
      this.camera.updateProjectionMatrix();
    });
    on('sSens', 'input', (e) => { this.sens = +e.target.value / 1000; });
    on('sVol', 'input', (e) => this.audio.setVolume(+e.target.value));
    on('sScale', 'input', (e) => {
      this.postfx.opts.scale = +e.target.value;
      this.postfx._size.set(0, 0);
      this.postfx.setSize(window.innerWidth, window.innerHeight);
    });
    on('sTod', 'input', (e) => { this.tod = +e.target.value; });
    const qsel = on('sQuality', 'change', (e) => {
      localStorage.setItem('nv_quality', e.target.value);
      location.reload();
    });
    if (qsel) qsel.value = this.quality;
    this.sens = 0.0022;
  }

  cycleCamera() {
    if (this.vehicle) {
      this.vehicle.camMode = (this.vehicle.camMode + 1) % 3;
      this.hud.setHint(['camera urmaritoare', 'camera de pe capota', 'camera cinematica'][this.vehicle.camMode]);
    } else {
      this.player.mode = this.player.mode === 'tps' ? 'fps' : 'tps';
      this.hud.setHint(this.player.mode === 'fps' ? 'vedere subiectiva' : 'vedere din spate');
    }
    setTimeout(() => this.hud.setHint(''), 1300);
  }

  toggleVehicle() {
    if (this.vehicle) {
      // coborare: langa usa soferului, fara sa intram in gard
      const v = this.vehicle;
      if (Math.abs(v.vLong) > 6) {
        this.hud.setHint('prea repede ca sa cobori');
        setTimeout(() => this.hud.setHint(''), 1200);
        return;
      }
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      const lx = -(v.spec.W / 2 + 0.55);
      let px = v.pos.x + lx * c, pz = v.pos.z - lx * s;
      const r = this.player.resolve(px, pz, v.pos.y + 0.1);
      this.player.pos.set(r.x, Math.max(surfaceY(r.x, r.z), r.support > -1e8 ? r.support : -1e9), r.z);
      this.player.vel.set(0, 0, 0);
      this.player.yaw = v.yaw;
      this.player.inVehicle = null;
      // colliderul masinii revine la pozitia curenta
      const col = v.collider;
      if (col) {
        const cc = Math.abs(Math.cos(v.yaw)), ss = Math.abs(Math.sin(v.yaw));
        col.cx = v.pos.x; col.cz = v.pos.z;
        col.hx = (v.spec.W / 2) * cc + (v.spec.L / 2) * ss;
        col.hz = (v.spec.W / 2) * ss + (v.spec.L / 2) * cc;
        col.yBottom = v.pos.y; col.yTop = v.pos.y + 1.5;
        col.disabled = false;
        this.world.colliders.build();
      }
      for (const h of this.rig) h.light.intensity = 0;
      v.carRef.inUse = false;
      this.vehicle = null;
      this.audio.doorClose();
      this.hud.setCarInfo('');
      return;
    }
    const car = this.world.nearestCar(this.player.pos, 3.4);
    if (!car) {
      this.hud.setHint('nicio masina in apropiere');
      setTimeout(() => this.hud.setHint(''), 1200);
      return;
    }
    const v = new Vehicle(car.mesh);
    v.headlights = this.rig;
    v.collider = car.collider;
    v.carRef = car;
    car.collider.disabled = true;
    car.inUse = true;
    v.place(car.mesh.position.x, car.mesh.position.z, car.mesh.rotation.y);
    v.lightsOn = true;
    this.vehicle = v;
    this.player.inVehicle = v;
    this.audio.doorClose();
    this.hud.setCarInfo(car.type.toUpperCase() + ' · ' + car.color.name + ' · ' + car.plate);
    this.world.colliders.build();
  }

  respawn() {
    if (this.vehicle) {
      const v = this.vehicle;
      v.place(v.carRef.x, v.carRef.z, v.carRef.yaw);
    } else {
      this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
      this.player.pos.y = surfaceY(this.player.pos.x, this.player.pos.z);
      this.player.vel.set(0, 0, 0);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(w, h);
  }

  loop(now) {
    requestAnimationFrame(this.loop.bind(this));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    this.fade = Math.min(1, this.fade + dt * 0.8);

    this.frames++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0; this.fpsT = 0;
    }

    if (!this.paused) this.step(dt);
    this.render(dt);
  }

  step(dt) {
    const day = this.world.setTimeOfDay(this.tod);
    const lampsOn = 1 - clamp((day - 0.05) * 2.4, 0, 1);
    this.world.setLampsOn(lampsOn > 0.05);

    if (this.vehicle) {
      // fizica la pas fix, pentru stabilitate la orice framerate
      this.accum += dt;
      const h = 1 / 120;
      let n = 0;
      while (this.accum >= h && n < 8) {
        this.vehicle.update(h, this.input, this.world);
        this.accum -= h;
        n++;
      }
      this.player.pos.copy(this.vehicle.pos);
      this.player.mesh.visible = false;
      this.camera.position.copy(this.vehicle.camPos);
      this.camera.lookAt(this.vehicle.camTarget);
      if (this.vehicle.impact > 1.6) {
        this.audio.impact(this.vehicle.impact);
        this.vehicle.impact = 0;
      }
    } else {
      this.accum = 0;
      this.player.update(dt, this.input);
      this.camera.position.copy(this.player.camPos);
      this.camera.lookAt(this.player.camTarget);
      if (this.player.stepEvent) {
        this.audio.footstep(this.player.surfaceType(), this.player.stepEvent === 2);
        this.player.stepEvent = 0;
      }
    }

    this.world.lamps.update(this.camera.position, dt, lampsOn);

    this.audio.update(dt, {
      driving: !!this.vehicle,
      rpm: this.vehicle ? this.vehicle.rpm : 0,
      throttle: this.input.fwd ? 1 : 0,
      speed: this.vehicle ? Math.abs(this.vehicle.vLong) : this.player.speed,
      slip: this.vehicle ? this.vehicle.slip : 0,
      outdoors: true,
    });

    // HUD
    const px = this.vehicle ? this.vehicle.pos.x : this.player.pos.x;
    const pz = this.vehicle ? this.vehicle.pos.z : this.player.pos.z;
    const yaw = this.vehicle ? this.vehicle.yaw : this.player.yaw;
    this.hud.drawMinimap(px, pz, yaw, this.world.cars, this.world.lamps.lamps, !!this.vehicle);
    if (this.vehicle) {
      this.hud.drawSpeedo(this.vehicle.kmh, this.vehicle.rpm, this.vehicle.gear,
        this.vehicle.lightsOn, this.vehicle.brakeLevel);
      document.getElementById('speedo').style.opacity = '1';
    } else {
      document.getElementById('speedo').style.opacity = '0';
      const near = this.world.nearestCar(this.player.pos, 3.4);
      this.hud.setHint(near ? 'F — urca la volan' : '');
    }
    this.hud.setZone(this.hud.zoneAt(px, pz));
    this.hud.setStats(
      Math.round(this.fps) + ' FPS · ' + (this.postfx.stats ? this.postfx.stats.calls : 0) + ' draw · '
      + ((this.postfx.stats ? this.postfx.stats.tris : 0) / 1000).toFixed(0) + 'k tri');
  }

  render(dt) {
    this.postfx.render(this.time, this.fade);
    if (this.shot) {
      this.shot = false;
      try {
        const a = document.createElement('a');
        a.download = 'strada-' + Date.now() + '.png';
        a.href = this.canvas.toDataURL('image/png');
        a.click();
      } catch (err) { /* ignora */ }
    }
  }
}

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('lstatus');
  if (s) s.textContent = 'Eroare: ' + e.message;
});
