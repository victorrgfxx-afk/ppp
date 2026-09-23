/**
 * Punctul de intrare: renderer, bucla de joc, input si setari.
 * Jocul e exclusiv pe jos - masinile de pe strada sunt decor, asa cum apar
 * in fotografii, si au coliziuni, dar nu se conduc.
 */
import * as THREE from '../vendor/three.module.min.js';
import { buildAll, setAnisotropy } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { PostFX } from './postfx.js';
import { GameAudio } from './audio.js';
import { HUD } from './hud.js';
import { surfaceY, distToPrahova } from './terrain.js';
import { clamp } from './noise.js';
import { TouchControls, isTouchDevice, isPhone } from './touch.js';

const QUALITY = {
  // preset pentru telefon: fara MSAA, rezolutie interna redusa, fara umbre
  mobil:  { msaa: 0, scale: 1.00, levels: 4, haze: false, shadows: false, aniso: 4, dpr: 1.2, lamps: 5 },
  low:    { msaa: 0, scale: 1.00, levels: 4, haze: false, shadows: false, aniso: 4, dpr: 1.5, lamps: 5 },
  medium: { msaa: 2, scale: 0.88, levels: 5, haze: true,  shadows: true,  aniso: 8, dpr: 2, lamps: 6 },
  high:   { msaa: 4, scale: 1.00, levels: 5, haze: true,  shadows: true,  aniso: 16, dpr: 2, lamps: 6 },
  ultra:  { msaa: 8, scale: 1.00, levels: 5, haze: true,  shadows: true,  aniso: 16, dpr: 2, lamps: 6 },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.touch = isTouchDevice();
    this.phone = isPhone();
    this.quality = localStorage.getItem('nv_quality')
      || (this.phone ? 'mobil' : this.touch ? 'low' : 'high');
    this.input = {
      fwd: false, back: false, left: false, right: false,
      sprint: false, crouch: false, jump: false, axisX: 0, axisY: 0,
    };
    this.time = 0;
    this.frames = 0;
    this.fpsT = 0;
    this.fps = 60;
    this.paused = false;
    this.tod = 0;
    this.fade = 0;
    this.shot = false;
    this.sens = 0.0022;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr || 2));
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
    q.msaa = Math.min(q.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);

    label.textContent = 'generez texturile...';
    const T = await buildAll((p, name) => {
      bar.style.width = (8 + p * 62).toFixed(1) + '%';
      label.textContent = 'generez ' + name + '...';
    }, this.quality === 'mobil' ? 'mobil' : this.quality === 'low' ? 'low'
       : this.quality === 'medium' ? 'medium' : 'high');

    label.textContent = 'construiesc strada...';
    bar.style.width = '74%';
    await new Promise((r) => requestAnimationFrame(r));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.14, 520);

    this.world = new World(this.scene, T, renderer, {
      quality: this.quality, haze: q.haze, lampPool: q.lamps,
    });
    this.world.build();

    bar.style.width = '88%';
    label.textContent = 'pornesc motorul grafic...';
    await new Promise((r) => requestAnimationFrame(r));

    this.player = new Player(this.world, { x: this.world.spawn.x, z: this.world.spawn.z, yaw: 0 });
    this.scene.add(this.player.mesh);

    this.postfx = new PostFX(renderer, this.scene, this.camera, {
      msaa: q.msaa, levels: q.levels, scale: q.scale,
      exposure: 0.55, bloom: 0.55, threshold: 0.72, grain: 0.015,
      vignette: 0.88, ca: 0.0024, sat: 0.9,
    });
    this.postfx.setSize(window.innerWidth, window.innerHeight);

    this.audio = new GameAudio();
    this.hud = new HUD(document.getElementById('hud'));

    if (this.touch) {
      this.touchCtl = new TouchControls(this);
      this.touchCtl.enable();
      document.getElementById('kbdkeys').style.display = 'none';
      document.getElementById('touchkeys').style.display = 'grid';
      document.getElementById('helpline').style.display = 'none';
    }
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
      if (e.code === 'Space') e.preventDefault();
      if (map[e.code]) { this.input[map[e.code]] = true; return; }
      if (e.code === 'Space') { this.input.jump = true; return; }
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyV': this.cycleCamera(); break;
        case 'KeyH': this.hud.toggle(); break;
        case 'KeyP': this.shot = true; break;
        case 'KeyR': this.respawn(); break;
        case 'Escape': this.openMenu(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) this.input[map[e.code]] = false;
      if (e.code === 'Space') this.input.jump = false;
    });

    // Privirea cu mouse-ul: preferam pointer lock, dar el poate fi refuzat
    // (de exemplu intr-un iframe fara permisiunea respectiva). In acest caz
    // trecem automat pe "tine apasat si trage", ca jocul sa ramana jucabil.
    this.dragLook = false;
    this.dragging = false;
    document.addEventListener('mousemove', (e) => {
      if (this.touch || this.paused) return;
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && !(this.dragLook && this.dragging)) return;
      this.player.yaw -= e.movementX * this.sens;
      this.player.pitch = clamp(this.player.pitch - e.movementY * this.sens, -1.25, 1.05);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.dragLook && !this.paused) { this.dragging = true; e.preventDefault(); }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('blur', () => {
      this.dragging = false;
      this.input.fwd = this.input.back = this.input.left = this.input.right = false;
      this.input.sprint = this.input.jump = false;
    });
    document.addEventListener('wheel', (e) => {
      if (!this.touch && document.pointerLockElement !== this.canvas) return;
      this.player.camDist = clamp(this.player.camDist + Math.sign(e.deltaY) * 0.4, 1.4, 8.5);
    }, { passive: true });

    const lock = () => {
      // pe telefon nu exista pointer lock: comenzile sunt tactile
      if (!this.touch && this.canvas.requestPointerLock) {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { this.enableDragLook(); });
        setTimeout(() => {
          if (!this.touch && document.pointerLockElement !== this.canvas) this.enableDragLook();
        }, 400);
      }
      this.audio.resume();
      document.getElementById('start').classList.remove('show');
      document.getElementById('menu').classList.remove('show');
      this.paused = false;
    };
    this.startGame = lock;
    if (!this.touch) this.canvas.addEventListener('click', lock);
    document.getElementById('startbtn').addEventListener('click', lock);
    document.getElementById('resume').addEventListener('click', lock);
    if (!this.touch) {
      document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== this.canvas && !this.paused) this.openMenu();
      });
    }

    const fs = document.getElementById('btnFull');
    if (fs) {
      const canFs = !!(document.documentElement.requestFullscreen);
      if (!canFs) fs.style.display = 'none';
      else fs.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      });
    }
  }

  enableDragLook() {
    if (this.dragLook) return;
    this.dragLook = true;
    this.canvas.style.cursor = 'grab';
    this.hud.setHint('tine apasat cu mouse-ul si trage ca sa privesti');
    clearTimeout(this._dragHintT);
    this._dragHintT = setTimeout(() => this.hud.setHint(''), 4500);
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
    const tod = document.getElementById('sTod');
    if (tod) tod.value = String(this.tod);
  }

  cycleCamera() {
    this.player.mode = this.player.mode === 'tps' ? 'fps' : 'tps';
    this.hud.setHint(this.player.mode === 'fps' ? 'vedere subiectiva' : 'vedere din spate');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.hud.setHint(''), 1300);
  }

  respawn() {
    this.player.pos.set(this.world.spawn.x, 0, this.world.spawn.z);
    this.player.pos.y = surfaceY(this.player.pos.x, this.player.pos.z);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = this.world.spawn.yaw;
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

    this.player.update(dt, this.input);
    this.camera.position.copy(this.player.camPos);
    this.camera.lookAt(this.player.camTarget);
    if (this.player.stepEvent) {
      this.audio.footstep(this.player.surfaceType(), this.player.stepEvent === 2);
      this.player.stepEvent = 0;
    }

    this.world.lamps.update(this.camera.position, dt, lampsOn, this.camera.quaternion);
    this.world.update(dt);
    const pp = this.player.pos;
    // Prahova se aude de la ~220 m; cel mai tare pe prundis
    this.audio.setRiver(clamp(1 - (distToPrahova(pp.x, pp.z) - 8) / 210, 0, 1));
    this.audio.update(dt, { speed: this.player.speed, outdoors: true, railDist: Math.abs(pp.z - 155) });

    const p = this.player.pos;
    this.hud.drawMinimap(p.x, p.z, this.player.yaw, this.world.cars, this.world.lamps.lamps);
    this.hud.setZone(this.hud.zoneAt(p.x, p.z));
    const s = this.postfx.stats;
    this.hud.setStats(Math.round(this.fps) + ' FPS · ' + (s ? s.calls : 0) + ' draw · '
      + ((s ? s.tris : 0) / 1000).toFixed(0) + 'k tri');
  }

  render(dt = 0.016) {
    this.postfx.render(this.time, this.fade, dt);
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
