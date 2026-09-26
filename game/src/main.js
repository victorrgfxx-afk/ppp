import * as THREE from 'three';
import { QUALITY, defaultQuality, W, baseHeight } from './config.js';
import { loadTextures, TEX } from './textures.js';
import { buildMaterials, M } from './materials.js';
import { createSky, createLights, buildEnvironment } from './sky.js';
import { CollisionWorld } from './collision.js';
import { buildWorld } from './world.js';
import { buildCar, paintMaterial } from './cars.js';
import { Vehicle } from './vehicle.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { createComposer } from './post.js';
import { WIND, damp, clamp } from './util.js';
import { Walker } from './npc.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('strada.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('strada.' + k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};

// Camera poses matching the five reference photos (keys 1..5)
const PHOTO_VIEWS = [
  { x: 0.18, z: -1.14, yaw: 0.0, pitch: 0.04, label: 'Poza 1 — strada spre nord' },
  { x: 0.95, z: -1.6, yaw: -0.5, pitch: 0.18, label: 'Poza 2 — stâlpul și BMW-ul' },
  { x: 1.25, z: 1.9, yaw: -1.3, pitch: 0.12, label: 'Poza 3 — casa și tufa' },
  { x: 2.35, z: 3.0, yaw: -Math.PI / 2, pitch: 0.1, label: 'Poza 4 — fațada' },
  { x: 2.2, z: 3.9, yaw: -2.05, pitch: 0.06, label: 'Poza 5 — poarta' },
  { x: 2.35, z: 4.2, yaw: -2.8, pitch: 0.04, label: 'Poza 6 — straturile și Peugeot-ul' },
  { x: 0.3, z: 2.0, yaw: Math.PI, pitch: 0.02, label: 'Poza 7 — strada spre sud' },
  { x: 0.2, z: 2.6, yaw: 2.62, pitch: 0.03, label: 'Poza 8 — zidul gri de vizavi' },
  { x: -1.4, z: 1.2, yaw: -Math.PI / 2, pitch: 0.12, label: 'Poza 9 — toată fațada' },
  { x: 0.4, z: 0.8, yaw: -2.25, pitch: 0.08, label: 'Poza 10 — fațada și poarta' },
  { x: 4.3, z: 6.2, yaw: -1.27, pitch: 0.0, label: 'Poza 11 — intrarea în verandă' },
  { x: 5.15, z: 3.4, yaw: -Math.PI / 2, pitch: -0.14, label: 'Poza 12 — ușa și preșul' },
  { x: 5.2, z: 2.9, yaw: 0.06, pitch: 0.08, label: 'Poza 13 — prispa spre nord' },
  { x: 4.75, z: 5.9, yaw: -2.9, pitch: 0.04, label: 'Poza 14 — aleea spre grădină' },
];

async function main() {
  const qKey = store.get('quality', defaultQuality());
  const Q = QUALITY[qKey] ?? QUALITY.medium;
  const sens = () => store.get('sens', 1) * 0.0022;

  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const progress = (p, label) => { $('bar').style.width = Math.round(p * 80) + '%'; $('loadText').textContent = label; };
  await loadTextures('assets/textures/', progress, renderer.capabilities.getMaxAnisotropy());
  buildMaterials();

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0.56, 0.60, 0.65);
  scene.fog = new THREE.FogExp2(fogColor, 0.0021);
  scene.background = fogColor;
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.06, 3000);

  const sky = createSky();
  scene.add(sky);
  const sunDir = sky.material.uniforms.uSunDir.value;
  const { sun } = createLights(scene, sunDir);
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  sun.shadow.radius = Q.shadowRadius;
  Object.assign(sun.shadow.camera, { left: -Q.shadowBox, right: Q.shadowBox, top: Q.shadowBox, bottom: -Q.shadowBox });
  sun.shadow.camera.updateProjectionMatrix();
  scene.environment = buildEnvironment(renderer, sky);
  scene.environmentIntensity = 0.75;

  progress(0.85, 'Construiesc strada și casa…');
  await new Promise(r => setTimeout(r, 20));
  const world = new CollisionWorld();
  const built = buildWorld(scene, world, Q);

  // ---------- parked cars exactly as in the photos ----------
  progress(0.93, 'Parchez mașinile…');
  await new Promise(r => setTimeout(r, 20));
  const vehicles = [];
  const park = (model, paint, plate, x, z, h, opts) => {
    const car = buildCar(model, paint, plate);
    scene.add(car.group);
    const v = new Vehicle(car, world, x, z, h, opts);
    vehicles.push(v);
    return v;
  };
  park('bmw', paintMaterial(0x040405, { metallic: 0.0, rough: 0.25, dusty: 0.55 }), 'plateBMW', 2.32, -2.96, 0, { power: 1.25, vmax: 62 });
  park('p508', paintMaterial(0x6a6f75, { metallic: 0.8, rough: 0.3, dusty: 0.1 }), 'plate508', 1.58, 13.7, Math.PI, { power: 1.1, vmax: 58 });
  park('corsa', paintMaterial(0xa9adb1, { metallic: 0.85, rough: 0.35, dusty: 0.3 }), 'plateOpel', 1.55, -11.75, Math.PI, { power: 0.85, vmax: 48 });
  park('suv', paintMaterial(0x1d2024, { metallic: 0.55, rough: 0.3 }), 'plateSUV', 1.72, -20.3, 0, { power: 1.1, vmax: 55 });
  park('sedan', paintMaterial(0xbfc2c5, { metallic: 0.85, rough: 0.33 }), 'plateA', 1.75, -26.3, 0, {});
  park('hatch', paintMaterial(0xe4e4e2, { metallic: 0.1, rough: 0.3 }), 'plateB', 1.7, -31.6, 0, {});
  park('sedan', paintMaterial(0xdadcdd, { metallic: 0.3, rough: 0.3 }), 'plateC', -1.35, -44.5, Math.PI, {});
  park('hatch', paintMaterial(0xe9e9e7, { metallic: 0.15, rough: 0.28 }), 'plateB', -1.45, 58, 0, {});
  park('hatch', paintMaterial(0x6e1f1f, { metallic: 0.6, rough: 0.3 }), 'plateA', 1.72, 96, Math.PI, {});
  park('corsa', paintMaterial(0x2f4f7a, { metallic: 0.7, rough: 0.3 }), 'plateB', -1.35, -70, 0, {});
  for (const v of vehicles) v.update(0.016, null);
  // the neighbour walking home with a yellow bag (photo 7)
  const walkers = [new Walker(scene, world, { x: -0.4, z0: 40, z1: 104 })];

  // ---------- player / input / audio / HUD ----------
  const player = new Player(camera, world);
  const input = new Input(canvas);
  const audio = new Audio();
  const hud = new HUD(world, built.houses);
  const post = createComposer(renderer, scene, camera, Q);

  let mode = 'foot';       // 'foot' | 'car'
  let active = null;       // vehicle being driven
  let camMode = store.get('camMode', 'chase');
  const orbit = { yaw: 0, pitch: 0.18, idle: 0 };
  const cockpitLook = { yaw: 0, pitch: 0 };
  let paused = true, started = false, hornOn = false;
  let shake = 0;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    post.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  // precompile shaders to avoid hitches
  progress(0.97, 'Compilez shaderele…');
  await new Promise(r => setTimeout(r, 20));
  player.update(0, input, null, 0);
  renderer.compile(scene, camera);
  post.composer.render(0);
  $('loader').classList.add('done');
  $('start').classList.add('on');
  $('quality').value = qKey;
  $('sens').value = store.get('sens', 1);

  // ---------- UI wiring ----------
  const begin = () => {
    audio.start();
    input.enabled = true;
    input.requestLock();
    paused = false; started = true;
    $('start').classList.remove('on');
    $('pause').classList.remove('on');
    $('hud').classList.add('on');
  };
  $('play').addEventListener('click', begin);
  $('resume').addEventListener('click', begin);
  $('quality').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('quality2').addEventListener('change', (e) => { store.set('quality', e.target.value); location.reload(); });
  $('sens').addEventListener('input', (e) => store.set('sens', parseFloat(e.target.value)));
  $('mute').addEventListener('click', () => { audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? 'Sunet: oprit' : 'Sunet: pornit'; });
  $('menuBtn').addEventListener('click', () => pause());
  const pause = () => {
    if (!started) return;
    paused = true; input.enabled = false;
    $('quality2').value = qKey;
    $('pause').classList.add('on');
    if (document.pointerLockElement) document.exitPointerLock();
  };
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !paused && !matchMedia('(pointer: coarse)').matches && !input.mouse.dragging) pause();
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && started && !paused) pause(); });
  $('views').innerHTML = PHOTO_VIEWS.map((v, i) => `<button data-view="${i}">${i + 1}. ${v.label.split('—')[1]}</button>`).join('');
  $('views').addEventListener('click', (e) => {
    const i = e.target.dataset.view; if (i === undefined) return;
    gotoView(+i); begin();
  });

  const gotoView = (i) => {
    const v = PHOTO_VIEWS[i];
    if (mode === 'car') exitCar(true);
    player.setPose(v.x, v.z, v.yaw, v.pitch);
    hud.toast(v.label);
  };

  const nearestCar = () => {
    let best = null, bd = 2.6;
    for (const v of vehicles) {
      for (const side of [-1, 1]) {
        const d = v.doorPos(side);
        const dist = Math.hypot(d.x - player.pos.x, d.z - player.pos.z);
        if (dist < bd) { bd = dist; best = v; }
      }
    }
    return best;
  };
  const enterCar = (v) => {
    mode = 'car'; active = v;
    audio.door();
    orbit.yaw = 0; orbit.pitch = 0.18;
    cockpitLook.yaw = 0; cockpitLook.pitch = 0;
    hud.toast(v.name + ' — W/S accelerație/frână, A/D volan, Space frână de mână, V cameră, F coboară');
  };
  const exitCar = (force = false) => {
    if (!active) return;
    if (!force && Math.abs(active.speed) > 3) { hud.toast('Oprește mașina ca să cobori'); return; }
    for (const side of [-1, 1]) {
      const d = active.doorPos(side);
      player.setPose(d.x, d.z, active.h, 0);
      player.collide();
      if (Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < 0.3) break;
    }
    player.pos.y = world.groundHeight(player.pos.x, player.pos.z);
    audio.door();
    active.vx *= 0.2; active.vz *= 0.2;
    active.car.glass.opacity = 0.86;
    mode = 'foot'; active = null;
  };

  // ---------- main loop ----------
  const clock = new THREE.Timer();
  let t = 0, frameNo = 0;
  const focus = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    WIND.time.value = t;
    sky.material.uniforms.uTime.value = t;

    let prompt = '';
    if (!paused) {
      if (input.hit('KeyP')) screenshot();
      if (mode === 'foot') {
        for (let i = 0; i < PHOTO_VIEWS.length; i++) if (input.hit('Digit' + ((i + 1) % 10))) gotoView(i);
        player.update(dt, input, audio, sens());
        const near = nearestCar();
        if (near) {
          prompt = 'F — urcă în ' + near.name;
          if (input.hit('KeyF') || input.hit('KeyE')) enterCar(near);
        }
      } else {
        const ax = input.axis();
        const ctl = { throttle: -ax.y, steer: ax.x, handbrake: input.down('Space') };
        if (input.hit('KeyF') || input.hit('KeyE')) exitCar();
        if (input.hit('KeyL')) active?.setLights(!active.lightsOn);
        if (input.hit('KeyV')) { camMode = camMode === 'chase' ? 'cockpit' : 'chase'; store.set('camMode', camMode); }
        hornOn = input.down('KeyH');
        active?.update(dt, ctl);
        if (active && active.impact > 2.5) { audio.crash(active.impact); shake = Math.min(0.35, active.impact * 0.03); }
      }
      // parked cars (and cars pushed by collisions) settle
      for (const v of vehicles) if (v !== active) v.update(dt, null);
      for (const w of walkers) w.update(dt);
    }

    // camera for driving
    let fov = 70;
    if (mode === 'car' && active) {
      const m = input.consumeMouse();
      const sp = Math.abs(active.speed);
      if (camMode === 'chase') {
        if (m.x || m.y) { orbit.yaw -= m.x * sens(); orbit.pitch = clamp(orbit.pitch + m.y * sens(), -0.1, 0.9); orbit.idle = 0; }
        else { orbit.idle += dt; if (orbit.idle > 1.5) { orbit.yaw = damp(orbit.yaw, 0, 2, dt); orbit.pitch = damp(orbit.pitch, 0.18, 2, dt); } }
        const cy = active.h + orbit.yaw;
        const dist = 6.3 + sp * 0.03;
        const g = active.car.group.position;
        const want = tmpV.set(g.x + Math.sin(cy) * dist * Math.cos(orbit.pitch), g.y + 1.3 + Math.sin(orbit.pitch) * dist, g.z + Math.cos(cy) * dist * Math.cos(orbit.pitch));
        const minY = world.groundHeight(want.x, want.z) + 0.4;
        want.y = Math.max(want.y, minY);
        camera.position.x = damp(camera.position.x, want.x, 10, dt);
        camera.position.y = damp(camera.position.y, want.y, 10, dt);
        camera.position.z = damp(camera.position.z, want.z, 10, dt);
        focus.set(g.x - Math.sin(active.h) * 1.5, g.y + 1.05, g.z - Math.cos(active.h) * 1.5);
        camera.lookAt(focus);
        fov = 62 + Math.min(14, sp * 0.3);
        active.car.glass.opacity = 0.86;
      } else {
        cockpitLook.yaw = clamp(cockpitLook.yaw - m.x * sens(), -2.2, 2.2);
        cockpitLook.pitch = clamp(cockpitLook.pitch - m.y * sens(), -0.8, 0.6);
        if (!m.x && !m.y) cockpitLook.yaw = damp(cockpitLook.yaw, 0, 0.8, dt);
        camera.position.copy(active.headPos());
        active.car.glass.opacity = 0.12;
        camera.rotation.set(cockpitLook.pitch - 0.06 + active.pitch + active.car.group.rotation.x, active.h + cockpitLook.yaw, -active.roll * 0.6, 'YXZ');
        fov = 72;
      }
    } else {
      fov = 70 + player.fovKick;
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.2;
      camera.position.y += (Math.random() - 0.5) * shake * 0.2;
      shake = damp(shake, 0, 5, dt);
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 6, dt); camera.updateProjectionMatrix(); }

    // sun + shadow box follow the view (snapped to reduce shimmering)
    const fp = mode === 'car' && active ? active.car.group.position : player.pos;
    const snap = 0.5;
    sun.target.position.set(Math.round(fp.x / snap) * snap, baseHeight(fp.z), Math.round(fp.z / snap) * snap);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 100);
    sky.position.copy(camera.position);
    // grass only near the camera (distance culling per 16 m chunk)
    if ((frameNo++ & 7) === 0) for (const gm of built.grass) gm.visible = Math.abs(gm.userData.cz - camera.position.z) < 56;

    // HUD
    const pos = mode === 'car' && active ? active.car.group.position : player.pos;
    const yaw = mode === 'car' && active ? (camMode === 'chase' ? active.h + orbit.yaw : active.h + cockpitLook.yaw) : player.yaw;
    const dHome = Math.hypot(pos.x - 6, pos.z - 0);
    hud.update(dt, {
      prompt, driving: mode === 'car', kmh: active ? active.speed * 3.6 : 0, gear: active?.gear ?? 1, carName: active?.name ?? '',
      x: pos.x, z: pos.z, yaw,
      cars: vehicles.map(v => ({ x: v.x, z: v.z, h: v.h, active: v === active })),
      location: dHome < 14 ? 'Acasă' : `Acasă: ${Math.round(dHome)} m ${pos.z < 0 ? 'N' : 'S'}`,
    });
    audio.update(dt, { driving: mode === 'car', rpm: active?.rpm ?? 0, throttle: active?.throttle ?? 0, slip: active?.lastLat ?? 0, horn: hornOn, speed: active ? Math.abs(active.speed) : 0 });
    post.grade.uniforms.uTime.value = t;
    post.composer.render(dt);
    input.endFrame();
  });

  function screenshot() {
    if (window.top !== window) { hud.toast('Captura de ecran (P) merge când rulezi jocul local'); return; }
    post.composer.render(0);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'strada-' + Date.now() + '.png';
    a.click();
    hud.toast('Captură salvată');
  }

  // automated test hooks (used by tools/test.mjs)
  window.__game = { walkers, player, vehicles, camera, renderer, scene, gotoView, enterCar, exitCar: () => exitCar(true), begin, get mode() { return mode; }, input, world, TEX, M };
}

main().catch((e) => {
  console.error(e);
  $('loadText').textContent = 'Eroare: ' + e.message;
  $('loader').classList.add('err');
});
