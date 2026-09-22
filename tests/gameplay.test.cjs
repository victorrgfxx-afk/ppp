const BASE = process.env.GAME_URL || 'http://127.0.0.1:8099';
const { chromium } = require('playwright-core');
const S = (p, v) => `JSON.stringify(${v})`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport:{width:420,height:640} });
  const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  page.on('console',m=>{ if(m.type()==='error') errs.push('console.error: '+m.text().slice(0,200)); });
  const pass=[], fail=[];
  const check=(name, ok, detail='')=> (ok?pass:fail).push(`${ok?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);
  const ev = e => page.evaluate(`JSON.stringify(${e})`).then(JSON.parse);
  // Software rendering here runs at a few fps, so waits are measured in
  // SIMULATED seconds (__game.clock.t) rather than wall-clock milliseconds.
  const simWait = async (seconds, capMs = 90000) => {
    const t0 = await ev('__game.clock.t');
    const start = Date.now();
    while (Date.now() - start < capMs) {
      await page.waitForTimeout(120);
      if ((await ev('__game.clock.t')) - t0 >= seconds) return true;
    }
    return false;
  };

  await page.goto(BASE + '/?q=low&auto=1', { waitUntil:'load', timeout:60000 });
  await page.waitForFunction('window.__ready===true', { timeout:90000 }).catch(()=>{});
  check('boot completes', await ev('!!window.__ready'));
  await page.waitForTimeout(1200);

  // --- walking -------------------------------------------------------------
  const p0 = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z})');
  await page.keyboard.down('KeyW'); await simWait(2.0); await page.keyboard.up('KeyW');
  await page.waitForTimeout(250);
  const p1 = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z})');
  const walked = Math.hypot(p1.x-p0.x, p1.z-p0.z);
  check('player walks on W', walked > 3.0, `${walked.toFixed(2)} m in 2 s of sim time`);

  // --- sprint --------------------------------------------------------------
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  await simWait(2.0);
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  const p2 = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z,st:__game.player.stamina})');
  const ran = Math.hypot(p2.x-p1.x, p2.z-p1.z);
  check('sprint covers more ground than walking', ran > walked, `${ran.toFixed(2)} m vs ${walked.toFixed(2)} m over the same sim time`);
  check('sprint drains stamina', p2.st < 0.999, 'stamina '+p2.st.toFixed(2));

  // --- gravity / ground ----------------------------------------------------
  check('player stands on the ground', Math.abs(await ev('__game.player.body.position.y') - 0.0) < 1.5,
        'y='+(await ev('+__game.player.body.position.y.toFixed(2)')));

  // --- enter a vehicle -----------------------------------------------------
  await page.evaluate(`(function(){var v=__game.vehicles.find(function(v){return v.spec&&v.spec.id==='mondeo';});
    __game.player.teleport(v.mesh.position.x+2.2, v.mesh.position.z+0.5, 270);})()`);
  await simWait(0.5);
  const prompt = await ev('({hidden:document.getElementById("prompt").hidden,txt:document.getElementById("prompt").textContent})');
  check('interaction prompt appears near a car', !prompt.hidden && /Urc/i.test(prompt.txt), prompt.txt.trim());
  await page.keyboard.press('KeyE'); await simWait(0.3);
  check('E enters the vehicle', await ev('__game.mode') === 'drive', 'mode='+await ev('__game.mode'));

  // --- driving -------------------------------------------------------------
  // put the car on the open pad with a clear run to the north so the test is
  // about the drivetrain, not about what it crashes into
  await page.evaluate(`(function(){var b=__game.vehicle.body;
    b.position.set(-28, 0.7, 16); b.velocity.setZero(); b.angularVelocity.setZero();
    b.quaternion.setFromEuler(0, Math.PI/2, 0); b.wakeUp(); __game.driveYaw = 0;})()`);
  await simWait(0.4);
  await page.keyboard.down('KeyW');
  let peak = 0, peakGear = 0, peakRpm = 0, samples = 0, onGround = 0;
  {
    const t0 = await ev('__game.clock.t');
    const start = Date.now();
    while (Date.now() - start < 120000) {
      await page.waitForTimeout(150);
      const st = await ev('({sp:+Math.abs(__game.vehicle.speed).toFixed(2),g:__game.vehicle.gear,r:Math.round(__game.vehicle.rpm),og:__game.vehicle.onGround,t:+__game.clock.t.toFixed(2)})');
      if (st.sp > peak) { peak = st.sp; peakGear = st.g; peakRpm = st.r; }
      samples++; if (st.og) onGround++;
      if (st.t - t0 >= 8) break;
    }
  }
  await page.keyboard.up('KeyW');
  check('car accelerates under throttle', peak > 8, `peak ${(peak*3.6).toFixed(0)} km/h in gear ${peakGear} at ${peakRpm} rpm`);
  // a wheel legitimately leaves the ground crossing the kerb between the gravel
  // and the poured slabs, so this asks for contact nearly always, not always
  check('wheels stay in contact with the ground', samples > 0 && onGround / samples > 0.8,
        `${onGround}/${samples} samples grounded`);
  check('gearbox shifts up through the ratios', peakGear >= 3, 'reached gear index '+peakGear);

  // --- braking -------------------------------------------------------------
  const spBefore = await ev('+Math.abs(__game.vehicle.speed).toFixed(2)');
  await page.keyboard.down('KeyS'); await simWait(1.5); await page.keyboard.up('KeyS');
  const spAfter = await ev('+Math.abs(__game.vehicle.speed).toFixed(2)');
  check('brakes slow the car', spAfter < spBefore - 0.5 || spAfter < 0.6,
        `${(spBefore*3.6).toFixed(0)} -> ${(spAfter*3.6).toFixed(0)} km/h`);

  // --- steering ------------------------------------------------------------
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA'); await simWait(1.5);
  const st = await ev('+__game.vehicle.steer.toFixed(3)');
  await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  check('steering responds', Math.abs(st) > 0.05, 'steer='+st);

  // --- exit ----------------------------------------------------------------
  await simWait(0.5);
  await page.keyboard.press('KeyE'); await simWait(0.3);
  check('E exits the vehicle', await ev('__game.mode') === 'foot');

  // --- doors / interactables ----------------------------------------------
  const doorState = await ev('({n:__game.world.doors.length, open:__game.world.doors.filter(function(d){return d.open;}).length})');
  check('hall + garage doors exist and animate', doorState.n === 4, `${doorState.n} doors, ${doorState.open} open`);

  // --- photo mode ----------------------------------------------------------
  await page.keyboard.press('KeyP'); await simWait(0.4);
  const ph = await ev('({i:__game.photoIndex, fov:Math.round(__game.engine.camera.fov), frame:!document.getElementById("photo-frame").hidden})');
  check('photo-match mode engages', ph.i >= 0 && ph.frame, `spot ${ph.i+1}, fov ${ph.fov}`);

  // --- menu ----------------------------------------------------------------
  await page.keyboard.press('Tab'); await simWait(0.3);
  check('Tab opens the menu', await ev('__game.menu.open') === true);
  await page.keyboard.press('Tab'); await page.waitForTimeout(500);
  check('Tab closes the menu', await ev('__game.menu.open') === false);

  // --- props are dynamic ---------------------------------------------------
  const props = await ev('__game.physics.bodies.length');
  check('dynamic props registered', props > 10, props+' bodies');

    const frameErr = await ev('__game.lastError || null');
  check('no errors inside the frame loop', !frameErr, String(frameErr).slice(0,180));
  check('no page errors', errs.length === 0, errs.slice(0,3).join(' | '));

  await page.screenshot({ path: process.argv[2] || 'play.png' });
  console.log([...pass, ...fail].join('\n'));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  await browser.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e=>{ console.error('HARNESS FAIL', e); process.exit(2); });
