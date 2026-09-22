/* ============================================================================
   Service Auto — Freeroam
   Open-world first-person sandbox on a yard reconstructed 1:1 from photographs.
   ========================================================================== */
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { AudioEngine } from './core/AudioEngine.js';
import { settings, Device } from './core/Settings.js';
import { TextureLibrary } from './gfx/Textures.js';
import { MaterialLibrary } from './gfx/Materials.js';
import { Atmosphere } from './gfx/Atmosphere.js';
import { Physics } from './physics/Physics.js';
import { World } from './world/World.js';
import { Player } from './player/Player.js';
import { Vehicle } from './vehicles/Vehicle.js';
import { BackhoeVehicle } from './vehicles/Backhoe.js';
import { CARS, BACKHOE } from './vehicles/CarSpecs.js';
import { Npc, NPCS } from './entities/Human.js';
import { DustSystem, DUST_COLOURS } from './gfx/Particles.js';
import { Freestyle } from './core/Freestyle.js';
import { Hud } from './ui/Hud.js';
import { Menu } from './ui/Menu.js';
import * as PLAN from './world/SitePlan.js';

const $ = id => document.getElementById(id);

class Game {
  constructor() {
    this.paused = false;
    this.photoIndex = -1;
    this.mode = 'foot';           // 'foot' | 'drive'
    this.vehicle = null;
    this.clock = { last: performance.now(), t: 0 };
  }

  /* ------------------------------ boot ----------------------------------- */
  async boot(progress) {
    progress(0.04, 'pornesc motorul grafic…');
    this.engine = new Engine($('view'));
    const P = this.engine.preset;

    progress(0.08, 'generez texturile procedurale…');
    this.tex = new TextureLibrary({
      size: P.texSize,
      aniso: Math.min(P.aniso, this.engine.maxAniso),
    });
    await this.tex.build((p, n) => progress(0.08 + p * 0.42, 'texturi: ' + n));
    this.mats = new MaterialLibrary(this.tex);

    progress(0.52, 'cer, soare și vreme…');
    this.atmo = new Atmosphere(this.engine.scene, this.engine.renderer);
    this.atmo.setTime(settings.get('timeOfDay'));
    this.atmo.setWeather(settings.get('weather'));
    this.atmo.setShadowDistance(P.shadowDist);
    this.atmo.setShadowMapSize(P.shadowSize);
    this.atmo.windStrength = settings.get('wind') / 100;
    const tune = settings.tune || {};
    if (tune.exposure) this.engine.renderer.toneMappingExposure = tune.exposure;
    if (tune.env != null) this.engine.scene.environmentIntensity = tune.env;
    if (tune.sun != null) this.atmo.sunGain = tune.sun;

    progress(0.58, 'fizică…');
    this.physics = new Physics();

    progress(0.62, 'construiesc curtea 1:1…');
    // footprints where a vehicle is parked: scenery colliders are skipped there
    const reserved = [...CARS.map(c => ({ x: c.x, z: c.z, r: Math.max(c.len, 4) * 0.72 })),
                      { x: BACKHOE.x, z: BACKHOE.z, r: 4.6 }];
    this.world = new World(this.engine.scene, this.mats, this.physics, P, reserved);
    await new Promise(r => setTimeout(r, 0));

    progress(0.82, 'mașinile din fotografii…');
    this.vehicles = [];
    for (const spec of CARS) {
      this.vehicles.push(new Vehicle(spec, this.mats, this.physics, this.engine.scene));
      await new Promise(r => setTimeout(r, 0));
    }
    this.backhoe = new BackhoeVehicle(BACKHOE, this.mats, this.physics, this.engine.scene);
    this.vehicles.push(this.backhoe);
    for (const v of this.vehicles) v.label = v.label || v.spec.label;

    progress(0.93, 'oameni…');
    this.npcs = NPCS.map(o => {
      const n = new Npc(this.mats, o);
      this.engine.scene.add(n.mesh);
      return n;
    });

    progress(0.96, 'interfață…');
    this.input = new Input();
    this.audio = new AudioEngine();
    this.player = new Player(this.physics, this.engine.camera, PLAN.SPAWN);
    this.hud = new Hud();
    this.dust = new DustSystem(this.engine.scene, { max: P.name === 'low' ? 90 : 220 });
    this.freestyle = new Freestyle(this.hud);
    this.menu = new Menu(this);
    this._registerVehicleInteractions();
    this._bindTopButtons();

    progress(1, 'gata');
  }

  _registerVehicleInteractions() {
    for (const v of this.vehicles) {
      this.world.interactables.push({
        kind: 'vehicle', vehicle: v,
        get pos() { return v.mesh.position; },
        radius: (v.dims.len || 5) * 0.55 + 1.4,
        label: () => 'Urcă în ' + (v.label || 'mașină'),
        act: () => this.enterVehicle(v),
      });
    }
  }

  _bindTopButtons() {
    const act = {
      menu: () => this.menu.toggle(),
      photo: () => this.cyclePhotoSpot(),
      lights: () => this.toggleLights(),
    };
    for (const b of document.querySelectorAll('#topbtns .ibtn')) {
      b.addEventListener('click', (e) => { e.preventDefault(); act[b.dataset.act]?.(); });
    }
  }

  /* --------------------------- vehicle handling -------------------------- */
  enterVehicle(v) {
    if (this.vehicle) return;
    this.vehicle = v;
    this.mode = 'drive';
    this.player.body.sleep();
    this.player.body.collisionResponse = false;
    v.body.allowSleep = false;      // stays awake while it is the player's car
    v.body.wakeUp();
    v.engineOn = true;
    this.hud.toast('🔑 ' + (v.label || 'Vehicul') + ' — E pentru a coborî');
    this.audio.click(520, 0.08, 0.05);
    document.getElementById('btns').hidden = true;
    document.getElementById('drive-btns').hidden = false;
    // the backhoe gets its loader/boom controls on screen
    document.getElementById('arm-btns').hidden = !(v === this.backhoe);
    if (v === this.backhoe) v.setOperatorVisible(false);
    this.driveYaw = v.mesh.rotation.y - Math.PI / 2;
    this.drivePitch = 0;
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v) return;
    const side = new THREE.Vector3(0, 0, -1.65).applyQuaternion(v.mesh.quaternion);
    const p = v.mesh.position.clone().add(side);
    this.player.body.collisionResponse = true;
    this.player.body.wakeUp();
    this.player.teleport(p.x, p.z, null);
    this.player.body.position.y = 1.2;
    this.player.yaw = v.mesh.rotation.y - Math.PI / 2;
    v.body.allowSleep = true;
    this.vehicle = null;
    this.mode = 'foot';
    v.engineOn = false;
    this.audio.engine(800, 0, 0);
    this.audio.click(320, 0.09, 0.05);
    document.getElementById('btns').hidden = false;
    document.getElementById('drive-btns').hidden = true;
    document.getElementById('arm-btns').hidden = true;
    if (v === this.backhoe) v.setOperatorVisible(true);
    this.hud.toast('Ai coborât din ' + (v.label || 'vehicul'));
  }

  toggleLights() {
    if (this.vehicle) {
      this.vehicle.lightsOn = !this.vehicle.lightsOn;
      this.hud.toast('Faruri ' + (this.vehicle.lightsOn ? 'pornite' : 'oprite'));
    } else {
      this.torchOn = !this.torchOn;
      this.torch.visible = this.torchOn;
      this.hud.toast('Lanternă ' + (this.torchOn ? 'pornită' : 'oprită'));
    }
  }

  resetVehicles() {
    for (const v of this.vehicles) v.reset();
    this.physics.resetProps();
    this.hud.toast('Vehiculele și obiectele au fost resetate');
  }

  /* ------------------------------ movement ------------------------------- */
  respawn() {
    if (this.vehicle) this.exitVehicle();
    this.player.teleport(PLAN.SPAWN.x, PLAN.SPAWN.z, PLAN.SPAWN.yaw);
  }
  teleport(t) {
    if (this.vehicle) this.exitVehicle();
    this.player.teleport(t.x, t.z, t.yaw);
    this.hud.toast('📍 ' + t.name);
  }

  /* ----------------------------- photo mode ------------------------------ */
  gotoPhotoSpot(i) {
    const s = PLAN.PHOTO_SPOTS[i];
    if (!s) return;
    if (this.vehicle) this.exitVehicle();
    this.photoIndex = i;
    this.player.teleport(s.x, s.z, s.yaw);
    this.player.body.position.y = s.y - 1.62 + 0.4;
    this.player.pitch = THREE.MathUtils.degToRad(s.pitch);
    this.photoFov = s.fov;
    this.hud.photoMode(true, s.name);
    this.engine.fovOverride = s.fov;
    this.engine.resize();
    this.hud.toast('Photo-match ' + (i + 1) + '/4 — P pentru următoarea');
  }
  cyclePhotoSpot() {
    const next = this.photoIndex + 1;
    if (next >= PLAN.PHOTO_SPOTS.length) this.exitPhotoMode();
    else this.gotoPhotoSpot(next);
  }
  exitPhotoMode() {
    this.photoIndex = -1;
    this.photoFov = null;
    this.engine.fovOverride = null;
    this.hud.photoMode(false);
    this.engine.applyQuality();
    this.hud.toast('Ieșire din photo-match');
  }

  /* ------------------------------ lifecycle ------------------------------ */
  async begin() {
    this.hud.show(true);
    if (Device.touch) { $('touch').hidden = false; document.body.classList.add('touch-ui'); }
    await this.audio.start();

    this.torch = new THREE.SpotLight(0xfff0d0, 0, 26, 0.55, 0.5, 1.6);
    this.torch.visible = false;
    this.engine.camera.add(this.torch);
    this.torch.position.set(0, 0, 0);
    const tt = new THREE.Object3D(); tt.position.set(0, 0, -6);
    this.engine.camera.add(tt);
    this.torch.target = tt;
    this.torch.intensity = 60;

    this.input.requestLock();
    this.hud.toast('WASD / joystick pentru mers · E lângă o mașină ca să urci');
    requestAnimationFrame(this.frame);
  }

  async requestGyro() {
    const ok = await Input.requestGyroPermission();
    if (!ok) { settings.set('gyro', false); this.hud.toast('Giroscopul a fost refuzat'); }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  /* -------------------------------- frame -------------------------------- */
  frame = (now) => {
    requestAnimationFrame(this.frame);
    this.frames = (this.frames || 0) + 1;
    try { this._tick(now); } catch (e) {
      this.lastError = (e && e.stack) || String(e);
      if (!this._errLogged) { this._errLogged = true; console.error('frame error:', e); }
    }
  };

  _tick = (now) => {
    const rawDt = (now - this.clock.last) / 1000;
    this.clock.last = now;
    const dt = Math.min(0.05, rawDt);
    this.clock.t += dt;

    const input = this.input.sample();
    const look = this.input.consumeLook();

    /* --- global actions ------------------------------------------------- */
    if (this.input.took('menu')) this.menu.toggle();
    if (this.input.took('photo')) this.cyclePhotoSpot();
    for (let i = 1; i <= 4; i++) if (this.input.took('photo' + i)) this.gotoPhotoSpot(i - 1);
    if (this.input.took('lights')) this.toggleLights();
    if (this.input.took('reset') && this.vehicle) { this.vehicle.reset(); this.hud.toast('Mașină resetată'); }
    if (this.input.took('flip') && this.vehicle) this.vehicle.flip();

    if (this.menu.open) {
      this.input.endFrame();
      this.engine.render();
      return;
    }
    if (this.photoIndex >= 0 && (look.x || look.y || input.move.x || input.move.y)) this.exitPhotoMode();

    /* --- time of day ---------------------------------------------------- */
    if (settings.get('timeFlow')) {
      const m = (settings.get('timeOfDay') + dt * 0.6) % 1440;
      settings.data.timeOfDay = m;
      this.atmo.setTime(m);
    }

    /* --- simulate ------------------------------------------------------- */
    const use = this.input.took('use');
    if (this.mode === 'drive') this._driveFrame(dt, input, look, use);
    else this._footFrame(dt, input, look, use);

    this.physics.step(dt);
    for (const v of this.vehicles) if (v !== this.vehicle) v.idle();
    this.world.update(dt, this.clock.t, this.atmo);
    if (settings.get('npcs')) for (const n of this.npcs) n.update(dt);

    const focus = this.vehicle ? this.vehicle.mesh.position : this.engine.camera.position;
    this.atmo.update(dt, focus);
    this.engine.post.setWet(this.atmo.wetness);
    this.dust.update(dt, this.atmo.windDir);
    this.freestyle.update(dt, this.vehicle, this._nearMiss);
    this._nearMiss = false;
    this.hud.setScore(this.freestyle.display);

    /* --- audio ---------------------------------------------------------- */
    this.audio.ambient(dt, this.atmo.windStrength, this.atmo.sunDirection.y > 0.02);
    if (this.vehicle) {
      const v = this.vehicle;
      this.audio.engine(v.rpm, Math.min(1, input.throttle * 0.8 + Math.abs(v.speed) / 40), 1);
      this.audio.tyres(v.slip, Math.abs(v.speed), this.player.surface);
      this.audio.wind(Math.abs(v.speed));
      this.audio.horn(input.horn);
      if (v.impact > 0.25 && !this._impactFlag) {
        this._impactFlag = true;
        this.audio.impact(v.impact);
        if (settings.get('haptics')) navigator.vibrate?.(Math.round(v.impact * 90));
      }
      if (v.impact < 0.1) this._impactFlag = false;
      this.engine.post.setDamage(v.impact * 0.6);
    } else {
      this.audio.engine(820, 0, 0);
      this.audio.tyres(0, 0);
      this.audio.wind(0);
      this.audio.horn(false);
      this.engine.post.setDamage(0);
      if (this.player.footstep) {
        this.audio.footstep(this.player.footstep.surface, this.player.footstep.strength);
        this.player.footstep = null;
      }
    }

    /* --- hud ------------------------------------------------------------ */
    const yawDeg = ((-(this.mode === 'drive' ? this.driveYaw : this.player.yaw) * 180 / Math.PI) % 360 + 360) % 360;
    this.hud.update(dt, {
      yawDeg,
      player: this.engine.camera.position,
      vehicle: this.vehicle,
      vehicles: this.vehicles,
      fps: this.engine.fps,
      showStats: true,
      stamina: this.player.stamina,
    });

    this.input.endFrame();
    this.engine.render();
    this.engine.adapt(rawDt * 1000, now);
  };

  /* ------------------------------ on foot -------------------------------- */
  _footFrame(dt, input, look, use) {
    this.player.update(dt, input, look);
    const near = this.world.findInteractable(this.engine.camera.position);
    if (near) {
      this.hud.setPrompt('E', near.label());
      document.querySelector('[data-act="use"] , #btns [data-act="use"]')?.classList.add('accent');
      if (use) {
        near.act();
        if (near.kind === 'door' || near.kind === 'gate') this.audio.doorThud();
      }
    } else {
      this.hud.setPrompt(null, null);
    }
  }

  /** Tyres throw up the loose surface — the whole yard is crushed stone. */
  _spawnWheelDust(dt, v) {
    const speed = Math.abs(v.speed);
    if (speed < 2.4 || !v.onGround) return;
    const surf = this.player.surface;
    const loose = surf === 'gravel' || surf === 'dirt' || surf === 'grass';
    const intensity = (loose ? 1 : 0.28) * Math.min(1, speed / 16) + v.slip * 0.8;
    if (intensity < 0.12) return;
    this._dustAcc = (this._dustAcc || 0) + dt * intensity * (loose ? 42 : 14);
    const colour = DUST_COLOURS[surf] || DUST_COLOURS.gravel;
    const p = new THREE.Vector3(), vel = new THREE.Vector3();
    while (this._dustAcc >= 1) {
      this._dustAcc -= 1;
      // behind the rear axle, alternating sides
      const side = Math.random() < 0.5 ? -1 : 1;
      p.set(-v.dims.wheelbase / 2, v.dims.wheelR * 0.35, side * v.dims.trackR / 2)
        .applyQuaternion(v.mesh.quaternion).add(v.mesh.position);
      vel.set(v.body.velocity.x * -0.16, 0.5 + v.slip * 1.4, v.body.velocity.z * -0.16);
      this.dust.spawn(p, vel, {
        size: 0.35 + intensity * 0.5, life: 0.9 + intensity * 0.9,
        color: colour, spread: 1.0 + v.slip * 2.2,
      });
    }
  }

  /* ------------------------------ driving -------------------------------- */
  _driveFrame(dt, input, look, use) {
    const v = this.vehicle;
    if (use) { this.exitVehicle(); return; }

    let steer = input.move.x;
    if (settings.get('tiltSteer') && this.input.tilt != null) {
      steer = THREE.MathUtils.clamp(this.input.tilt / 26, -1, 1);
    }
    const ctl = {
      throttle: Math.max(input.throttle, input.move.y > 0.05 ? input.move.y : 0),
      brake: Math.max(input.brake, input.move.y < -0.05 ? -input.move.y : 0),
      steer,
      handbrake: input.handbrake,
      reverse: input.brake > 0.5 || input.move.y < -0.5,
      armUp: input.armUp, armDown: input.armDown,
      boomUp: input.boomUp, boomDown: input.boomDown,
    };
    v.update(dt, ctl);

    // near miss: brushing past another vehicle at speed without touching it
    if (Math.abs(v.speed) > 11) {
      for (const other of this.vehicles) {
        if (other === v) continue;
        const d = other.mesh.position.distanceTo(v.mesh.position);
        const limit = (v.dims.width + (other.dims.width || 2)) * 0.5 + 1.25;
        const was = this._nearSet || (this._nearSet = new Set());
        if (d < limit && !was.has(other)) { was.add(other); this._nearMiss = true; }
        else if (d > limit * 2.2) was.delete(other);
      }
    }

    /* chase-free first-person camera: eye point in the cab, free look around */
    this.driveYaw -= look.x;
    this.drivePitch = THREE.MathUtils.clamp(this.drivePitch - look.y, -0.9, 0.8);
    const carYaw = v.mesh.rotation.y - Math.PI / 2;
    // spring the free look back to straight ahead when the player lets go
    const delta = ((this.driveYaw - carYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.driveYaw = carYaw + delta * Math.max(0, 1 - dt * 2.2);
    this.drivePitch *= Math.max(0, 1 - dt * 1.6);

    const eye = v.eyePoint(new THREE.Vector3());
    const shake = v.impact * 0.05;
    this.engine.camera.position.set(
      eye.x + (Math.random() - 0.5) * shake,
      eye.y + (Math.random() - 0.5) * shake,
      eye.z + (Math.random() - 0.5) * shake);
    this.engine.camera.rotation.set(this.drivePitch, this.driveYaw, -v.steer * 0.035, 'YXZ');

    this.player.body.position.set(v.mesh.position.x, v.mesh.position.y + 1, v.mesh.position.z);
    this.player.surface = this.player._surfaceAt(v.mesh.position.x, v.mesh.position.z);
    this.hud.setPrompt('E', 'Coboară din ' + (v.label || 'vehicul'));
    this._spawnWheelDust(dt, v);
  }
}

/* ============================== bootstrap ================================= */
(async () => {
  const bar = $('boot-bar'), msg = $('boot-msg'), err = $('boot-err'), start = $('boot-start');
  const progress = (v, t) => {
    bar.style.width = (v * 100).toFixed(0) + '%';
    if (t) msg.textContent = t;
  };
  try {
    if (!document.createElement('canvas').getContext('webgl2')) {
      throw new Error('Browserul nu suportă WebGL2. Încearcă Chrome, Edge, Firefox sau Safari actualizat.');
    }
    const game = new Game();
    window.__game = game;
    await game.boot(progress);
    window.__engine = game.engine;

    msg.textContent = 'apasă pentru a intra';
    start.hidden = false;
    const go = async () => {
      start.disabled = true;
      $('boot').hidden = true;
      await game.begin();
      window.__ready = true;
    };
    start.addEventListener('click', go);
    addEventListener('keydown', (e) => { if (!$('boot').hidden && (e.code === 'Enter' || e.code === 'Space')) go(); });

    // automated smoke tests can skip the gesture gate
    const q = new URLSearchParams(location.search);
    if (q.has('auto')) setTimeout(go, 60);
    if (q.has('cam')) setTimeout(() => {
      const [x, z, yaw, pitch, y] = q.get('cam').split(',').map(Number);
      game.player.teleport(x, z, yaw);
      if (y) game.player.body.position.y = y;
      game.player.pitch = THREE.MathUtils.degToRad(pitch || 0);
    }, 400);
  } catch (e) {
    err.hidden = false;
    err.textContent = (e && e.stack) || String(e);
    msg.textContent = 'a eșuat pornirea';
    console.error(e);
  }
})();
