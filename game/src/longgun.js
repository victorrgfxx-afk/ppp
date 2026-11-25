import * as THREE from 'three';
import { akmGeometry, m4Geometry, pslGeometry, shotgunGeometry, mergeArms } from './arms.js';
import { GRIP_C, RAKE } from './glock.js';
import { prepareHands, barHands, barWrists, prepareArms, gripArms, gloveMaterial, skinMaterial } from './hand.js';
import { ik, poseArm, INV, ARM } from './driver.js';
import { HOLD, holdOf } from './weapon.js';

// (V119) The long guns from the shepherds' shed (magazie.js) in your hands: taken off the wall (E), carried, aimed down
// their own sights (their rear sight and front post, the M4's holographic dot, the PSL's 4x scope, the 870's bead),
// fired as each one fires, reloaded, put back (E at the rack). The same black gloves and arms as the Glock's (hand.js,
// driver.js): the right hand the Glock's own grip hand on each gun's pistol grip (its rake measured), the left round
// the handguard (the M4's vertical foregrip). Their places on each gun are the measured ones of arms.js (s along it from
// the butt, y over the bore, mm).
//
// How each fires (their makers' and the manuals' figures; the recoil as the momentum of the bullet and the powder gas -
// the gas leaving ~1.5x the bullet's speed - into the gun's mass):
//  * AKM: 7.62x39 mm, 7.9 g at 715 m/s, 600 rounds a minute, 30 in the magazine; free recoil ~7.5 J;
//  * M4: 5.56x45 mm, 4 g at 905 m/s, ~800 a minute, 30; ~5 J;
//  * PSL: 7.62x54R, 9.8 g at 830 m/s, semi-automatic, 10; ~16 J; its LPS-4 scope magnifies 4x;
//  * Remington 870: 12 gauge, 9 pellets of 00 buckshot (34 g) at ~400 m/s, pump action, 4 in the tube + 1; ~30 J.
const MM = 0.001, V3 = (x, y, z) => new THREE.Vector3(x, y, z), VM_FOV = 55, WRIST = 0.22;
export const LONG = [
  { name: 'PSL', geo: pslGeometry, L: 1150, grip: [[270, -40], [252, -104]], fore: [650, -8], sight: [[262, 72.5], [518, 72.5]], eye: 190, muzzle: 1150, port: [430, 12],
    cap: 10, spare: 2, rpm: 0, v0: 830, p: 12, mass: 4.6, reload: 2.9, scope: 4, kind: 'psl', spread: 0.0006 },
  { name: 'AKM', geo: akmGeometry, L: 880, grip: [[279, -26], [258, -133]], fore: [585, -4], sight: [[494, 48], [838, 47]], eye: 200, muzzle: 880, port: [420, 12],
    cap: 30, spare: 2, rpm: 600, v0: 715, p: 7.4, mass: 3.6, reload: 2.6, kind: 'ak', spread: 0.0018 },
  { name: 'M4', geo: m4Geometry, L: 838, grip: [[302, -38], [260, -137]], fore: [566, -72], foreUp: true, sight: [[339, 57.5], [700, 57.5]], eye: 215, muzzle: 838, port: [380, 8],
    cap: 30, spare: 2, rpm: 800, v0: 905, p: 5.8, mass: 3.3, reload: 2.3, kind: 'm4', spread: 0.0014 },
  { name: 'Remington 870', geo: shotgunGeometry, L: 990, grip: [[305, -25], [272, -85]], fore: [700, -30.5], sight: [[420, 12], [984, 13.5]], eye: 170, muzzle: 990, port: [430, 4],
    cap: 5, spare: 29, rpm: 0, pump: true, pellets: 9, v0: 400, p: 15, mass: 3.6, reload: 0.55, kind: 'sg', spread: 0.035 },
];
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _a = V3(), _b = V3(), _w = V3(), _hd = V3(), _bk = V3();
const _el = V3(), _sh = V3(), _tip = V3(), _fa = V3(), _d = V3(), _u = V3(), _r = V3(), _v = V3(), _sc = new THREE.Matrix4(), ONE = V3(1, 1, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const LONG_SH = [V3(-0.17, -0.23, 0.1), V3(0.15, -0.22, 0.12)], LONG_POLE = [V3(-0.35, -1, 0.1).normalize(), V3(0.75, -0.65, 0.3).normalize()];
// a point of a gun (s, y in mm) in its own frame: the grip's top at the origin, the bore along -z, up +y
const at = (S, s, y) => V3(0, (y - S.grip[0][1]) * MM, -(s - S.grip[0][0]) * MM);

// the muzzle's flash: a hot core and four ragged petals (a rifle's flash seen from behind it)
let FLASH = null;
function flashTexture() {
  if (FLASH) return FLASH;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.55, 'rgba(255,150,60,0.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.3 * Math.random();
    x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a - 0.12) * 30, 32 + Math.sin(a - 0.12) * 30); x.lineTo(32 + Math.cos(a + 0.12) * 30, 32 + Math.sin(a + 0.12) * 30);
    x.fillStyle = 'rgba(255,200,110,0.35)'; x.fill();
  }
  FLASH = new THREE.CanvasTexture(c); FLASH.colorSpace = THREE.SRGBColorSpace;
  return FLASH;
}
function build(S) {
  // the model (arms.js: already along -z from its butt at +L/2 to its muzzle, y up, x across) moved into the frame
  const M = new THREE.Matrix4().makeTranslation(0, -S.grip[0][1] * MM, -(S.L / 2 - S.grip[0][0]) * MM);
  const { P } = S.geo(), group = mergeArms([{ P, matrix: M }]);
  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  // the right hand: the Glock's grip hand where it holds the Glock's grip, carried onto this grip (its middle ~36 mm
  // under its top, as the Glock's; turned by the difference of their rakes)
  const top = at(S, ...S.grip[0]), bot = at(S, ...S.grip[1]), ax = top.clone().sub(bot).normalize();
  const rake = Math.atan2(-ax.z, ax.y), gc = top.clone().addScaledVector(ax, -0.036);
  const Fg = new THREE.Matrix4().compose(GRIP_C, _q.setFromAxisAngle(V3(1, 0, 0), -RAKE), ONE), Fr = new THREE.Matrix4().compose(gc, _q2.setFromAxisAngle(V3(1, 0, 0), -rake), ONE);
  const relR = Fr.clone().multiply(Fg.clone().invert());
  // the sights: the rear's and the front's points; the eye on their line, behind the rear at the cheek's weld
  const rs = at(S, ...S.sight[0]), fs = at(S, ...S.sight[1]), dir = fs.clone().sub(rs).normalize();
  const qa = new THREE.Quaternion().setFromUnitVectors(dir, V3(0, 0, -1));
  const ads = { p: V3(0, 0, -(S.sight[0][0] - S.eye) * MM).sub(rs.clone().applyQuaternion(qa)), q: qa };
  // (held low at the hip, its fore end in the lower right, the muzzle pointing at the middle from below)
  const hip = { p: V3(0.07, -0.115, -0.05), q: new THREE.Quaternion().setFromEuler(_e.set(0.15, 0.11, -0.1, 'YXZ')).multiply(qa) };
  const low = { p: ads.p.clone().add(V3(0.06, -0.2, 0.06)), q: new THREE.Quaternion().setFromEuler(_e.set(-0.75, 0.45, 0.3, 'YXZ')).multiply(qa) };
  const load = { p: ads.p.clone().add(V3(0.05, -0.12, 0.08)), q: new THREE.Quaternion().setFromEuler(_e.set(-0.25, 0.15, 0.65, 'YXZ')).multiply(qa) };
  return { S, group, relR, fore: at(S, ...S.fore), muzzle: at(S, S.muzzle, 0), port: at(S, ...S.port), views: { ads, hip, low, load } };
}

export class LongGuns {
  constructor(scene, world, audio, glock) {
    this.scene = scene; this.world = world; this.audio = audio; this.glock = glock;
    this.held = -1; this.want = false; this.out = 0; this.ads = 0; this.t = 0; this.cool = 0; this.reload = null; this.pump = 0;
    this.kickP = V3(); this.kickPv = V3(); this.kickR = V3(); this.kickRv = V3(); this.sway = V3(); this.shake = 0; this.flashT = -1; this.fovMul = 1;
    this.guns = LONG.map(() => null); this.ammo = LONG.map(S => ({ mag: S.cap, spare: S.spare }));
    this.rack = null;
    const vm = this.vm = new THREE.Group(); vm.matrixAutoUpdate = false; vm.visible = false; vm.name = 'longgun';
    this.gun = new THREE.Group(); this.gun.matrixAutoUpdate = false; vm.add(this.gun);
    // the muzzle's flash (a sprite in the gun's frame) and its light on everything round you for a frame or two (one
    // light kept, dark between shots: no shader rebuilt for it)
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: flashTexture(), color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
    this.flash.visible = false; this.flash.frustumCulled = false; this.gun.add(this.flash);
    this.light = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(this.light);
    this.skin = { hand: gloveMaterial(), arm: skinMaterial(true) };
    this.rh = holdOf(HOLD.right); this.lh = holdOf(HOLD.left);
    prepareHands(this.rh.tube, this.rh.pose); prepareHands(this.lh.tube, this.lh.pose); prepareArms();
    this.hands = null; this.arms = null;
    scene.add(vm);
  }
  // the shed's rack (magazie.js: its guns' meshes, in the order of LONG)
  setRack(lm) { this.rack = lm; }
  // E at the rack looking at gun i: take it (the one you hold back on its hooks first)
  take(i) {
    if (this.held === i) return;
    if (this.held >= 0) this.putBack();
    this.held = i; this.want = true; this.out = 0; this.reload = null; this.pump = 0;
    this.guns[i] ??= build(LONG[i]);
    this.gun.clear(); this.gun.add(this.guns[i].group); this.gun.add(this.flash);
    if (this.rack?.rack?.[i]) { this.rack.rack[i].userData.taken = true; this.rack.rack[i].visible = false; }
    this.audio?.gunCloth?.();
  }
  putBack() {
    if (this.held < 0) return;
    if (this.rack?.rack?.[this.held]) { this.rack.rack[this.held].userData.taken = false; this.rack.rack[this.held].visible = !!this.rack.rack[this.held].userData.near; }
    this.held = -1; this.want = false; this.out = 0; this.vm.visible = false; this.fovMul = 1;
    this.audio?.gunCloth?.();
  }
  get S() { return this.held >= 0 ? LONG[this.held] : null; }
  // every frame: ctx { dt, camera, input, player, foot }
  update(ctx) {
    const { dt, input, player } = ctx, S = this.S;
    this.t += dt; this.body = !!ctx.bodycam;
    this.light.intensity = this.t - this.flashT < 0.035 ? 30 : 0;
    if (!S) { this.vm.visible = false; this.fovMul = 1; return; }
    const free = ctx.foot;
    if (!free) { this.vm.visible = false; this.out = 0; this.reload = null; this.fovMul = 1; return; }
    // Q: the long gun slung or in your hands (the Glock comes out when it is slung: main.js)
    if (input.hit('KeyQ')) { this.want = !this.want; input.pressed?.delete('KeyQ'); this.audio?.gunCloth?.(); if (this.glock) this.glock.want = !this.want && this.glock.owned; }
    this.out = Math.max(0, Math.min(1, this.out + (this.want ? dt / 0.6 : -dt / 0.45)));
    this.vm.visible = this.out > 0.01;
    const ready = this.want && this.out > 0.95, A = this.ammo[this.held];
    // aiming: the right button held; running lowers it (no sprinting with the sights up)
    const aim = ready && input.down('Mouse2') && !this.reload;
    this.busy = aim || (ready && input.down('Mouse0'));                     // (main.js: no sprinting with it up or firing)
    this.ads += ((aim ? 1 : 0) - this.ads) * Math.min(1, dt * (aim ? 9 : 11));
    this.run = (this.run ?? 0) + (((player.running && !aim) ? 1 : 0) - (this.run ?? 0)) * Math.min(1, dt * 7);
    // the scope's 4x only through it, aimed (not with the body camera: it stays on your chest)
    this.fovMul = S.scope && !ctx.bodycam ? 1 / (1 + (S.scope - 1) * smooth(Math.max(0, (this.ads - 0.6) / 0.4))) : 1;
    // reloading: R (a magazine swap; the 870 a shell at a time until full)
    if (input.hit('KeyR') && ready && !this.reload && A.spare > 0 && A.mag < S.cap) {
      this.reload = { t: 0, dur: S.pump ? S.reload : S.reload + (A.mag === 0 ? 0.45 : 0), empty: A.mag === 0, step: 0 };
      this.audio?.gunMagOut?.();
    }
    const r = this.reload;
    if (r) {
      r.t += dt;
      if (!S.pump && r.step === 0 && r.t > r.dur * 0.62) { r.step = 1; this.audio?.gunMagIn?.(); }
      if (!S.pump && r.empty && r.step === 1 && r.t > r.dur * 0.86) { r.step = 2; this.audio?.gunRack?.(); }
      if (r.t >= r.dur) {
        if (S.pump) { A.mag++; A.spare--; this.audio?.gunMagIn?.(); this.reload = A.mag < S.cap && A.spare > 0 && !input.down('Mouse0') ? { t: 0, dur: S.reload, step: 0 } : null; }
        else { const need = S.cap - A.mag; A.mag += Math.min(need, S.cap); A.spare--; this.reload = null; }
      }
    }
    // the trigger: automatic at the gun's rate, else one a press (the 870's pump worked between: ~0.45 s)
    this.cool -= dt; this.pump = Math.max(0, this.pump - dt);
    const pull = S.rpm ? input.down('Mouse0') : input.hit('Mouse0');
    if (pull && ready && !this.reload && this.cool <= 0 && this.pump <= 0 && this.run < 0.3) {
      if (A.mag > 0) { this.shoot(ctx); A.mag--; this.cool = S.rpm ? 60 / S.rpm : 0.12; if (S.pump) { this.pump = 0.45; setTimeout(() => this.audio?.gunRack?.(), 180); } }
      else if (input.hit('Mouse0')) this.audio?.gunDry?.();
    }
    if (S.pump && this.reload && input.hit('Mouse0') && A.mag > 0) this.reload = null;       // (a shell in: fire, the loading stops)
    // the kick's springs (the gun pushed back and its muzzle up, coming back), the sway after the view's turns
    const k = 1 - Math.exp(-dt * 60);
    this.kickPv.addScaledVector(this.kickP, -180 * dt).multiplyScalar(1 - k * 0.35); this.kickP.addScaledVector(this.kickPv, dt);
    this.kickRv.addScaledVector(this.kickR, -140 * dt).multiplyScalar(1 - k * 0.3); this.kickR.addScaledVector(this.kickRv, dt);
    const yaw = player.yaw, pitch = player.pitch;
    if (this.prevYaw !== undefined) {
      const dy = Math.atan2(Math.sin(yaw - this.prevYaw), Math.cos(yaw - this.prevYaw)), dp = pitch - this.prevPitch;
      this.sway.x += (THREE.MathUtils.clamp(dp * 1.6, -0.06, 0.06) - this.sway.x) * Math.min(1, dt * 10);
      this.sway.y += (THREE.MathUtils.clamp(dy * 1.6, -0.06, 0.06) - this.sway.y) * Math.min(1, dt * 10);
    }
    this.prevYaw = yaw; this.prevPitch = pitch;
    this.shake = Math.max(0, this.shake - dt * 6);
    this.hudText = S.name + ' · ' + A.mag + (S.pump ? '' : ' / ' + A.spare * S.cap) + (S.pump ? ' + ' + A.spare : '');
  }
  shoot(ctx) {
    const { camera, player } = ctx, S = this.S, gl = this.glock;
    camera.getWorldDirection(_d);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion); _r.crossVectors(_d, _u).normalize(); _u.crossVectors(_r, _d);
    const sp = S.spread * (1 + 2.5 * (1 - this.ads)) + (S.pellets ? 0 : 0.004 * (1 - this.ads));
    for (let i = 0; i < (S.pellets ?? 1); i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
      _v.copy(_d).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize().multiplyScalar(S.v0);
      const hit = gl?.trace(camera.position, _v, 2.5);
      if (i === 0) gl?.targets?.shot(camera.position);
      if (hit?.target) gl.targets.hit(hit, camera.position);
      else if (hit) gl?.fx?.impact(hit, camera.position, ctx, this.audio);
    }
    // the kick: the gun's momentum (the bullet's and the gas's) into the shoulder - the muzzle up and a little aside, the
    // gun back - and the view up (more of it held than with the pistol: the stock is on the shoulder)
    const kp = S.p * 0.0022, fl = 1 - 0.35 * this.ads;
    player.pitch = Math.min(1.45, player.pitch + kp * (0.8 + 0.4 * Math.random()));
    player.yaw += (Math.random() - 0.45) * kp * 0.6;
    this.kickPv.z += S.p * 0.035 * fl; this.kickRv.x += S.p * 0.09 * fl; this.kickRv.z += (Math.random() - 0.5) * S.p * 0.03;
    this.shake = Math.min(1, this.shake + S.p / 15);
    this.flashT = this.t; this.shotN = (this.shotN ?? 0) + 1;
    this.audio?.rifleShot?.(S.kind);
    // the case out of the port to the right (the 870's hull too, on the pump), the muzzle's smoke
    this.placeView(camera);
    if (gl?.fx) {
      if (!S.pump) gl.fx.casing(_a.copy(this.guns[this.held].port).applyMatrix4(this.gun.matrix), camera, player.vel, this.vm);
      _n.multiplyMatrices(this.vm.matrix, this.gun.matrix);
      gl.fx.puff(_b.copy(this.guns[this.held].muzzle).applyMatrix4(_n), 0.06, 0.7, 0xcfcac2, 0.4, V3(0, 0.3, 0));
      this.light.position.copy(_b);
    }
  }
  placeView(camera) {
    camera.updateMatrixWorld();
    // (the eyes' view: drawn as through a ~55 deg lens, as the Glock; the body camera sees it where it really is)
    const k = this.body ? 1 : Math.tan(camera.fov * Math.PI / 360) / Math.tan(VM_FOV * (1 - 0.12 * this.ads) * Math.PI / 360);
    this.vm.matrix.copy(camera.matrixWorld).multiply(_sc.makeScale(k, k, 1));
    this.vm.matrixWorldNeedsUpdate = true;
  }
  // where it is in your hands this frame (after the camera has been placed; before the body camera moves it)
  draw(camera, player) {
    if (!this.vm.visible || this.held < 0) return;
    const g = this.guns[this.held], V = g.views;
    this.placeView(camera);
    const P = this._P ??= { p: V3(), q: new THREE.Quaternion() };
    P.p.copy(V.hip.p).lerp(V.ads.p, smooth(this.ads)); P.q.copy(V.hip.q).slerp(V.ads.q, smooth(this.ads));
    if (this.run > 0.01) { P.p.lerp(V.low.p, this.run); P.q.slerp(V.low.q, this.run); }
    const rl = this.reload ? Math.sin(Math.min(1, this.reload.t / this.reload.dur) * Math.PI) : 0;
    if (rl > 0) { P.p.lerp(V.load.p, rl); P.q.slerp(V.load.q, rl); }
    const down = 1 - smooth(this.out);
    if (down > 0) { P.p.y -= 0.45 * down; P.q.multiply(_q.setFromEuler(_e.set(-0.9 * down, 0.3 * down, 0, 'YXZ'))); }
    // the walk's bob, the breath, the sway, the kick
    const bob = player.bobAmt * (1 - 0.8 * this.ads), ph = player.bobPhase;
    P.p.x += Math.cos(ph) * 0.007 * bob + this.sway.y * 0.06; P.p.y += -(Math.sin(ph) ** 2) * 0.01 * bob - this.sway.x * 0.05 + Math.sin(this.t * 1.3) * 0.0015 * (1 - 0.7 * this.ads);
    P.p.z += this.kickP.z;
    if (this.pump > 0) P.p.z += Math.sin((0.45 - this.pump) / 0.45 * Math.PI) * 0.015;
    P.q.multiply(_q.setFromEuler(_e.set(this.kickR.x - this.sway.x * 0.6, -this.sway.y * 0.8, this.kickR.z - this.sway.y * 0.4, 'YXZ')));
    this.gun.matrix.compose(P.p, P.q, ONE); this.gun.matrixWorldNeedsUpdate = true;
    // the muzzle's flash for two frames, turned at random
    const fl = this.t - this.flashT < 0.034;
    this.flash.visible = fl;
    if (fl) { this.flash.position.copy(g.muzzle).add(V3(0, 0, -0.06)); this.flash.rotation.set(0, 0, Math.random() * 6.28); this.flash.scale.setScalar(this.S.pump ? 1.6 : this.S.kind === 'psl' ? 1.3 : 1); }
    this.limbs(g);
  }
  limbs(g) {
    if (!this.hands) {
      const h0 = barHands(this.rh.tube, this.rh.pose), h1 = barHands(this.lh.tube, this.lh.pose);
      if (h0 && h1) {
        this.hands = [h1.left, h0.right, h0.left].map(geo => { const ms = new THREE.Mesh(geo, this.skin.hand); ms.matrixAutoUpdate = false; ms.frustumCulled = false; this.vm.add(ms); return ms; });
        this.wr = [barWrists(this.lh.tube, this.lh.pose)[1], barWrists(this.rh.tube, this.rh.pose)[0], barWrists(this.rh.tube, this.rh.pose)[1]];
      }
    }
    if (!this.arms) {
      const ag = gripArms();
      if (ag) this.arms = [ag.left, ag.right].map(geo => {
        const bones = INV.map(() => new THREE.Bone()), sk = new THREE.SkinnedMesh(geo, this.skin.arm);
        sk.bindMode = THREE.DetachedBindMode; sk.bind(new THREE.Skeleton(bones, INV.map(x => x.clone())), new THREE.Matrix4());
        sk.matrixAutoUpdate = false; sk.frustumCulled = false; this.vm.add(sk);
        return bones;
      });
    }
    if (!this.hands) return;
    // the right: the Glock's grip hand carried onto this gun's grip; the left round the handguard (its bar along the
    // bore, the palm under it, the thumb along its left side) or, the M4, the vertical foregrip in a grip hand
    const HR = this._HR ??= new THREE.Matrix4(), HL = this._HL ??= new THREE.Matrix4();
    HR.multiplyMatrices(this.gun.matrix, _m.multiplyMatrices(g.relR, _n.compose(this.rh.p, this.rh.q, ONE)));
    const S = g.S, up = !!S.foreUp;
    if (up) _q.setFromEuler(_e.set(0.12, 0, 0, 'YXZ'));
    else _q.setFromAxisAngle(V3(1, 0, 0), Math.PI / 2).premultiply(_q2.setFromAxisAngle(V3(0, 0, 1), -0.45));   // (its cuff down and to the left)
    HL.multiplyMatrices(this.gun.matrix, _m.compose(g.fore, _q, ONE));
    this.hands[0].visible = !up; this.hands[2].visible = up; this.hands[1].visible = true;
    for (const [i, h] of [[0, HL], [1, HR], [2, HL]]) { this.hands[i].matrix.copy(h); this.hands[i].matrixWorldNeedsUpdate = true; }
    if (!this.arms) return;
    // (from the chest the body camera would see the arms' ends at the shoulders, which have no body to go on: the
    // gloves and the gun only there)
    for (const o of this.vm.children) if (o.isSkinnedMesh) o.visible = !this.body;
    // (a long gun's shoulders: the right one where the stock sits, the elbows down and out - not the pistol's arms out
    // in front: ARMS)
    const SH = LONG_SH, POLE = LONG_POLE;
    for (let i = 0; i < 2; i++) {
      const H = i === 0 ? HL : HR, w = this.wr[i === 0 && up ? 2 : i];
      _w.copy(w.at).applyMatrix4(H); _bk.copy(w.back).transformDirection(H); _hd.copy(w.dir).transformDirection(H);
      ik(SH[i], _w, ARM, POLE[i], _el, _tip);
      _fa.subVectors(_w, _el).normalize();
      const th = Math.acos(THREE.MathUtils.clamp(_fa.dot(_hd), -1, 1));
      if (th > WRIST) { const s = Math.sin(Math.min(th, 3.1)); _fa.multiplyScalar(Math.sin(WRIST) / s).addScaledVector(_hd, Math.sin(th - WRIST) / s).normalize(); }
      _el.copy(_w).addScaledVector(_fa, -ARM[1]);
      _sh.subVectors(SH[i], _el).normalize().multiplyScalar(ARM[0]).add(_el);
      poseArm(this.arms[i], _sh, _el, _w, _bk);
    }
  }
}
