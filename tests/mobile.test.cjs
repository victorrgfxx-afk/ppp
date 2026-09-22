const BASE = process.env.GAME_URL || 'http://127.0.0.1:8099';
const { chromium, devices } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({
    viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  page.on('console',m=>{ if(m.type()==='error') errs.push('err: '+m.text().slice(0,160)); });
  const pass=[], fail=[];
  const check=(n,ok,d='')=> (ok?pass:fail).push(`${ok?'PASS':'FAIL'} ${n}${d?' — '+d:''}`);
  const ev = e => page.evaluate(`JSON.stringify(${e})`).then(JSON.parse);
  const simWait = async (sec, cap=90000) => { const t0=await ev('__game.clock.t'); const s=Date.now();
    while(Date.now()-s<cap){ await page.waitForTimeout(140); if((await ev('__game.clock.t'))-t0>=sec) return true; } return false; };

  await page.goto(BASE + '/?q=low&auto=1', { waitUntil:'load', timeout:60000 });
  await page.waitForFunction('window.__ready===true', {timeout:90000}).catch(()=>{});
  await page.waitForTimeout(1500);
  check('boots on a phone viewport', await ev('!!window.__ready'));
  check('detected as a mobile device', await ev('!!(window.__game && __game.engine && document.body.classList.contains("touch-ui"))'));
  check('touch overlay visible', await ev('!document.getElementById("touch").hidden'));

  const layout = await ev(`(function(){var r=function(id){var e=document.getElementById(id);if(!e)return null;var b=e.getBoundingClientRect();
    return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
    return {stick:r('stick'),btns:r('btns'),mini:r('minimap-wrap'),top:r('topbtns'),vw:innerWidth,vh:innerHeight};})()`);
  check('joystick sits in the lower-left, thumb-sized', layout.stick.w >= 90 && layout.stick.y + layout.stick.h <= layout.vh, JSON.stringify(layout.stick));
  check('action buttons stay on screen', layout.btns.x + layout.btns.w <= layout.vw + 2 && layout.btns.y + layout.btns.h <= layout.vh + 2, JSON.stringify(layout.btns));
  check('minimap does not overlap the top buttons', layout.mini.y + layout.mini.h <= layout.top.y + 4, `map ends ${layout.mini.y+layout.mini.h}, buttons at ${layout.top.y}`);
  check('no horizontal overflow', await ev('document.documentElement.scrollWidth <= innerWidth'), await ev('document.documentElement.scrollWidth')+'px vs '+layout.vw);

  // --- the joystick must actually be the topmost element at its own centre.
  // Dispatching straight at #stick would pass even when a full-screen overlay
  // covers it, which is exactly the bug this guards against.
  const hit = await ev(`(function(){
    var b=document.getElementById('stick').getBoundingClientRect();
    var el=document.elementFromPoint(b.x+b.width/2, b.y+b.height/2);
    return {id: el ? (el.id || el.className || el.tagName) : null,
            inStick: !!(el && el.closest && el.closest('#stick'))};})()`);
  check('joystick is the topmost element at its own centre', hit.inStick, 'hit-test found: ' + hit.id);

  // --- touch the stick through real hit-testing ----------------------------
  const p0 = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z})');
  await page.evaluate(`(function(){
    var b=document.getElementById('stick').getBoundingClientRect();
    var cx=b.x+b.width/2, cy=b.y+b.height/2;
    var el=document.elementFromPoint(cx,cy);       // whatever is really on top
    var mk=function(t,x,y){return new PointerEvent(t,{pointerId:7,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true});};
    el.dispatchEvent(mk('pointerdown',cx,cy));
    el.dispatchEvent(mk('pointermove',cx,cy-b.height*0.45));
    window.__stickEl=el; window.__mk=mk; window.__c=[cx,cy]; window.__b=b;
  })()`);
  await simWait(2.0);
  const p1 = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z,mv:[+__game.input.state.move.x.toFixed(2),+__game.input.state.move.y.toFixed(2)]})');
  const moved = Math.hypot(p1.x-p0.x, p1.z-p0.z);
  check('virtual joystick drives the player', moved > 2, `${moved.toFixed(2)} m, stick ${JSON.stringify(p1.mv)}`);
  await page.evaluate(`window.__stickEl.dispatchEvent(window.__mk('pointerup',window.__c[0],window.__c[1]))`);
  await page.waitForTimeout(300);
  check('releasing the stick stops the player', Math.abs(await ev('__game.input.state.move.y')) < 0.01);

  // --- a thumb anywhere in the lower-left should raise a stick there --------
  const p1b = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z})');
  await page.evaluate(`(function(){
    var x=Math.round(innerWidth*0.28), y=Math.round(innerHeight*0.72);
    var el=document.elementFromPoint(x,y);
    var mk=function(t,cx,cy){return new PointerEvent(t,{pointerId:8,pointerType:'touch',isPrimary:true,clientX:cx,clientY:cy,bubbles:true,cancelable:true});};
    el.dispatchEvent(mk('pointerdown',x,y));
    el.dispatchEvent(mk('pointermove',x,y-Math.round(innerHeight*0.10)));
    window.__dynEl=el; window.__dyn=[x,y];
  })()`);
  await simWait(1.5);
  const p1c = await ev('({x:__game.player.body.position.x,z:__game.player.body.position.z})');
  const dynMoved = Math.hypot(p1c.x-p1b.x, p1c.z-p1b.z);
  await page.evaluate(`window.__dynEl.dispatchEvent(new PointerEvent('pointerup',{pointerId:8,pointerType:'touch',clientX:window.__dyn[0],clientY:window.__dyn[1],bubbles:true}))`);
  check('a floating stick appears under a thumb in the lower-left', dynMoved > 1.5, dynMoved.toFixed(2)+' m');

  // --- look drag on the right side (through real hit-testing) --------------
  const yaw0 = await ev('+__game.player.yaw.toFixed(3)');
  await page.evaluate(`(function(){
    var el=document.elementFromPoint(300,400);
    var mk=function(t,x,y){return new PointerEvent(t,{pointerId:9,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,bubbles:true,cancelable:true});};
    el.dispatchEvent(mk('pointerdown',300,400));
    for(var i=1;i<=6;i++) el.dispatchEvent(mk('pointermove',300-i*18,400));
    el.dispatchEvent(mk('pointerup',300-108,400));
  })()`);
  await page.waitForTimeout(500);
  const yaw1 = await ev('+__game.player.yaw.toFixed(3)');
  check('look drag rotates the camera', Math.abs(yaw1-yaw0) > 0.05, `yaw ${yaw0} -> ${yaw1}`);

  // --- on-screen buttons ----------------------------------------------------
  await page.evaluate(`(function(){var q=document.querySelector('#btns [data-act="jump"]');
    var r=q.getBoundingClientRect();
    var top=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
    if(!top || !top.closest('[data-act="jump"]')) throw new Error('jump button is covered by '+(top&&(top.id||top.className)));
    var b=q;
    var mk=function(t){return new PointerEvent(t,{pointerId:11,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true});};
    b.dispatchEvent(mk('pointerdown'));})()`);
  // the software renderer runs at a few fps, so wait for the game to actually
  // sample input rather than for wall-clock milliseconds
  let jumped = false;
  { const s0 = Date.now();
    while (Date.now() - s0 < 20000) {
      await page.waitForTimeout(120);
      if (await ev('__game.input.state.jump === true || __game.player.body.velocity.y > 0.4')) { jumped = true; break; }
    } }
  check('jump button registers', jumped);
  await page.evaluate(`document.querySelector('#btns [data-act="jump"]').dispatchEvent(new PointerEvent('pointerup',{pointerId:11,pointerType:'touch',bubbles:true}))`);

  // --- enter a car by touch, then check the driving HUD swaps in -----------
  await page.evaluate(`(function(){var v=__game.vehicles.find(function(v){return v.spec&&v.spec.id==='dokker';});
    __game.player.teleport(v.mesh.position.x+2.4, v.mesh.position.z, 90);})()`);
  await simWait(0.6);
  await page.evaluate(`(function(){var b=document.querySelector('#btns [data-act="use"]');
    b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:13,pointerType:'touch',bubbles:true}));
    b.dispatchEvent(new PointerEvent('pointerup',{pointerId:13,pointerType:'touch',bubbles:true}));})()`);
  await simWait(0.5);
  check('USE button enters the vehicle', await ev('__game.mode') === 'drive', 'mode '+await ev('__game.mode'));
  check('pedals replace the on-foot buttons', await ev('(!document.getElementById("drive-btns").hidden) && document.getElementById("btns").hidden'));
  check('dashboard appears', await ev('!document.getElementById("vehicle-hud").hidden'));

  // --- throttle pedal -------------------------------------------------------
  await page.evaluate(`document.querySelector('#drive-btns [data-act="throttle"]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:15,pointerType:'touch',bubbles:true}))`);
  let peak=0; { const t0=await ev('__game.clock.t'); const s=Date.now();
    while(Date.now()-s<90000){ await page.waitForTimeout(150);
      const st=await ev('({sp:+Math.abs(__game.vehicle.speed).toFixed(2),t:+__game.clock.t.toFixed(2)})');
      if(st.sp>peak) peak=st.sp; if(st.t-t0>=5) break; } }
  await page.evaluate(`document.querySelector('#drive-btns [data-act="throttle"]').dispatchEvent(new PointerEvent('pointerup',{pointerId:15,pointerType:'touch',bubbles:true}))`);
  check('throttle pedal accelerates the car', peak > 3, `peak ${(peak*3.6).toFixed(0)} km/h`);

  check('no frame-loop errors', !(await ev('__game.lastError || null')), String(await ev('__game.lastError || null')).slice(0,160));
  check('no page errors', errs.length === 0, errs.slice(0,2).join(' | '));

  await page.screenshot({ path: process.argv[2] || 'mobile.png' });
  console.log([...pass, ...fail].join('\n'));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  await browser.close();
  process.exit(fail.length?1:0);
})().catch(e=>{ console.error('HARNESS FAIL', e); process.exit(2); });
