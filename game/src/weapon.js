import * as THREE from 'three';
import { glockModel, magazineModel, BORE, RAKE, GRIP_C, GRIP_AXIS, MAG_AXIS, MUZZLE, EJECT } from './glock.js';
import { prepareHands, barHands, barWrists, skinMaterial, gloveMaterial, prepareArms, gripArms } from './hand.js';
import { ik, poseArm, INV, ARM } from './driver.js';
import { gloveCuff } from './handgeo.js';

// The Glock 18 on the concrete slab of the cross on the hill (V85): picked up with E (or F), then yours. Two-handed in
// front of you (your hands and arms: hand.js, the driver's, sculpted in a pistol's grip: HOLD), it fires as the G18
// does: full auto at 1200 rounds a minute or one round a pull (X: the selector on the slide), 33 in the magazine and
// one in the chamber; R reloads, the way Call of Duty 4 shows it - the gun raised and tipped toward the left hand, the
// magazine dropped (it lies where it falls), the hand down to the belt and back with a full one, pushed home and
// slapped; from an empty gun (the slide locked back) the left hand then racks the slide over the top. The right button
// aims down the sights (the view narrows); Q puts it away and takes it out.
// The rounds: subsonic 9 mm (147 grain, ~295 m/s: the suppressed load), each flying its arc (gravity, frame by frame)
// to what it meets: the ground (dust, a mark), a wall or a house (a puff of plaster and a hole), a trunk (bark), a car
// or the cross's steel (sparks and a ring); people and animals are not targets here (the rounds go past them). The
// spent cases fly out to the right, bounce and stay a while. The sound: the suppressor's cough and the slide's clatter.
// V89, the shooter's mode of the modern Call of Duty games while it is out (the moves: player.js; the range: range.js):
// the tactical stance (MWIII's Tac Stance: V while aiming, or Z - the gun canted ~45 deg, between the hip and the
// sights; aiming in a slide takes it by itself), the tactical sprint's raised pistol (and the longer wait to fire out
// of it), a slide's cant, the strike (V, not aiming: the pistol whipped across), the inspection (I, as MWII binds
// it: both sides and a press check); on the range the hit markers (white a hit, red a kill), the score, the medals
// and the feed; under the dot the games' prompts (low on rounds, reload, none).

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CAP = 33, RESERVE = 99, RPM = 1200, V0 = 295, G = 9.81, VM_FOV = 55, SLIDE = 0.027;   // (SLIDE: the slide's travel, m)
const L_FREE = 0.019, FREE = { glove: true };             // (the left hand's shape off the grip: round the slide, a magazine)
// (how far the wrist may bend inside the glove's cuff: the forearm is turned toward the cuff's axis until this far off)
const WRIST = 0.22;
const LIVING = new Set(['actor', 'npc', 'dog', 'bear']);
const pose = (x, y, z, rx, ry, rz) => ({ p: V3(x, y, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')) });
// the gun's poses in the camera's frame: held in front, in the middle, a little below the eyes' line and canted a few
// degrees to the right, both hands on it, as the modern Call of Duty games hold a pistol (V86: the user's clip); aimed
// down the sights (the rear sight's notch on the eye's line), running, put away, tucked against a wall
const HIP = pose(0.03, -0.078, -0.36, 0, 0, -0.2);
const OLD_HIP = pose(0.066, -0.084, -0.245, 0.04, 0.12, -0.08);
// (the shot's flip turns the gun about this point: between the hands' web and the grip's middle, the gun's frame)
const PIVOT = V3(0, -0.04, 0.01);
const ADS = pose(0, -0.0222, -0.255, 0, 0, 0);
const SPRINT = pose(0.06, -0.13, -0.3, -0.45, 0.4, 0.4);
const DOWN = pose(0.07, -0.42, -0.2, -1.1, 0.3, 0.3);
const TUCK = pose(0.075, -0.07, -0.2, 0.6, 0.18, -0.15);
// (V89) the tactical stance: canted ~45 deg in toward the middle, a little lower and further out than at the sights;
// the tactical sprint: the pistol up beside your head in the right hand, its muzzle to the sky (the left arm swinging,
// out of sight)
const STANCE = pose(0.018, -0.052, -0.315, 0.02, 0.03, 0.78);
const TAC = pose(0.13, -0.075, -0.24, 1.2, 0.45, 0.25);
export const VIEW = { hip: HIP, ads: ADS, sprint: SPRINT, down: DOWN, tuck: TUCK, stance: STANCE, tac: TAC };
// the hands' holds on the gun (each hand sculpted round a bar in a pose of its own: handgeo.js): its bar laid along the
// grip (raised up it, moved forward and across, turned about it). The right: a high grip, the web up under the
// beavertail, the index finger on the trigger, the thumb forward along the frame's left side under the slide. The left
// round the right's fingers, its palm over their tips on the left, its thumb forward along the frame below the right's
// (the thumbs-forward grip). The thumbs' places are given in the gun's frame (mcp: the thumb's knuckle; dir: the way
// it points; in: the side its joints bend toward)
export const HOLD = {
  right: { tube: 0.019, raise: 0.012, fwd: 0.006, side: 0.001, dy: 0, phi: 0, gam: 0.3, index: { bend: [0.7, 0.45, 1.05], splay: 0.35 },
    thumb: { mcp: [-0.022, -0.0215, 0.0], dir: [0, 0.02, -1], in: [1, -0.2, 0], bend: [0, 0] } },
  left: { tube: 0.026, raise: -0.012, fwd: 0.032, side: -0.005, dy: 0, phi: -0.4, gam: 0.5, mirror: true,
    thumb: { mcp: [-0.027, -0.034, -0.022], dir: [0, 0, -1], in: [1, 0.2, 0], bend: [0, 0.05] } },
};
const Q_GRIP = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -RAKE);
// a hold: the hand's place on the gun { p, q } and the pose it is sculpted in (the thumb's places in its own frame)
function holdOf(h) {
  const p = GRIP_C.clone().addScaledVector(GRIP_AXIS, h.raise).add(V3(h.side, h.dy, -h.fwd));
  const q = Q_GRIP.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), h.phi)), qi = q.clone().invert();
  const own = (v, point) => { const w = V3(...v); if (point) w.sub(p); w.applyQuaternion(qi); if (h.mirror) w.x = -w.x; return [w.x, w.y, w.z].map(x => +x.toFixed(5)); };
  const t = h.thumb, pose = { gam: h.gam, glove: true };
  if (h.fore) pose.fore = h.fore;
  if (h.index) pose.index = h.index;
  if (t) pose.thumb = { mcp: own(t.mcp, true), dir: own(t.dir), in: own(t.in), bend: t.bend };
  return { p, q, tube: h.tube, pose };
}
// the left hand racking the slide over the top: the bar along the slide, the back of the hand up
// (each turned round the bar it holds - the slide, the magazine: the hand's y - until its wrist faces the left arm as
// it comes from the shoulder through the reloads, so the wrist need not bend much in the glove's cuff: measured, the
// best turn is the same within ~3 degrees all through each hold)
const LH_RACK = { p: V3(0, BORE + 0.006, -0.016), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, -1, 0), V3(0, 0, 1), V3(-1, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(0.46))) };   // (the wrist to the left, the fingers over to the right side)
// the left hand holding a magazine (the magazine's frame: its mouth at the origin, its length down -y), low on it
const LH_MAG = { p: V3(0, -0.135, 0.0), q: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -1.86) };
// down at the belt, out of sight (the camera's frame)
const BELT = pose(-0.12, -0.46, -0.12, -0.6, 0.4, 0.6);

// the reloads: the gun's own motion over the pose [t, x, y, z, rx, ry, rz], the left hand's [t, where], the events.
// The magazine changed as in the user's clip: the gun raised to the right of the middle and turned on its side, its
// muzzle up and to the left, its left side toward you, the grip's foot down toward the left hand (the attitudes are
// poses of their own; their offsets from the idle worked out here); racking: the gun brought in toward the middle, its
// muzzle up and its top tipped toward you, the hand over it
const rel = (P) => { const e = new THREE.Euler().setFromQuaternion(HIP.q.clone().invert().multiply(P.q), 'YXZ'); return [P.p.x - HIP.p.x, P.p.y - HIP.p.y, P.p.z - HIP.p.z, e.x, e.y, e.z]; };
const MAGP = rel(pose(0.15, -0.012, -0.42, 0.6, 1.25, 0)), MAGW = rel(pose(0.145, -0.024, -0.415, 0.55, 1.2, 0.03)), SLAP = rel(pose(0.15, 0, -0.425, 0.68, 1.25, 0));
const RACKP = rel({ p: V3(0.021, -0.064, -0.275), q: OLD_HIP.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.25, 0.6, 'YXZ'))) });
const k7 = (t, v, f = 1) => [t, ...v.map(x => x * f)];
// (strip: the left hand pulls the magazine out down the grip's axis, stow: it is put away at the belt and the new one
// taken; drop: an empty one falls free)
// (the times as the clip's: up in ~0.18 s, the magazine pulled 0.28-0.43, the hand away until ~1.0, the new one pushed
// home 1.15-1.28, the hand back on the grip at ~1.55 and the gun home at 1.8)
const TACT = { dur: 1.8, strip: [0.28, 0.43], stow: 0.7, insert: [1.15, 1.28], slap: 1.28,
  gun: [k7(0, MAGP, 0), k7(0.18, MAGP), k7(0.7, MAGW), k7(1.12, MAGP), k7(1.3, SLAP), k7(1.38, MAGP), k7(1.6, MAGP, 0.45), k7(1.8, MAGP, 0)],
  left: [[0, 'grip'], [0.05, 'grip'], [0.28, 'magIn1'], [0.43, 'magIn0'], [0.7, 'belt'], [0.88, 'belt'], [1.15, 'magIn0'], [1.28, 'magIn1'], [1.33, 'magIn1'], [1.5, 'grip']] };
const EMPTY = { dur: 2.15, drop: 0.2, stow: 0.55, insert: [0.9, 1.03], slap: 1.03, rack: [1.33, 1.46], release: 1.46,
  gun: [k7(0, MAGP, 0), k7(0.18, MAGP), k7(0.6, MAGW), k7(1.0, MAGP), k7(1.07, SLAP), k7(1.3, RACKP), k7(1.46, RACKP), k7(1.53, RACKP, 0.7), k7(1.83, RACKP, 0.15), k7(2.15, RACKP, 0)],
  left: [[0, 'grip'], [0.12, 'grip'], [0.4, 'belt'], [0.62, 'belt'], [0.9, 'magIn0'], [1.03, 'magIn1'], [1.1, 'magIn1'], [1.33, 'rack0'], [1.46, 'rack1'], [1.53, 'rack1'], [1.83, 'grip']] };
// the first time you take it up: the slide racked to chamber a round
const FIRST = { dur: 1.15, rack: [0.55, 0.7], release: 0.7,
  gun: [k7(0, RACKP, 0), k7(0.35, RACKP), k7(0.7, RACKP), k7(0.78, RACKP, 0.7), k7(1.15, RACKP, 0)],
  left: [[0, 'grip'], [0.15, 'grip'], [0.4, 'rack0'], [0.7, 'rack1'], [0.76, 'rack1'], [1.05, 'grip']] };
export const RELOADS = { TACT, EMPTY, FIRST };
// (V89) the strike (V, not aiming): the pistol whipped across from the right, the left hand off it, the blow at 0.17 s,
// back by 0.6 s; the inspection (I): the gun turned to show its left side, a press check (the muzzle forward again,
// the gun rolled to bring its port up to the eye, the slide eased back ~1 cm by the left hand over it: the brass in the
// chamber), its right side, and back (~3.5 s). Their keys as the reloads' (the
// gun's motion over the pose, the left hand's places)
const MELEE = { dur: 0.6, strike: 0.17,
  gun: [[0, 0, 0, 0, 0, 0, 0], [0.1, 0.07, 0.03, 0.05, 0.25, -0.5, -0.6], [0.2, -0.1, -0.03, -0.12, -0.15, 0.75, 0.9], [0.3, -0.13, -0.06, -0.08, -0.2, 0.9, 1.0], [0.6, 0, 0, 0, 0, 0, 0]],
  left: [[0, 'grip'], [0.05, 'grip'], [0.15, 'belt'], [0.4, 'belt'], [0.58, 'grip']] };
const INSPECT = { dur: 3.5, press: [1.75, 1.9, 2.15, 2.25],
  gun: [[0, 0, 0, 0, 0, 0, 0], [0.5, -0.01, 0.03, 0.03, 0.3, 1.1, 0.15], [1.3, -0.005, 0.035, 0.03, 0.32, 1.15, 0.12], [1.6, -0.015, 0.012, 0.05, 0.12, 0.08, 0.5], [2.3, -0.015, 0.014, 0.05, 0.13, 0.07, 0.48],
    [2.75, 0.02, 0.03, 0.02, 0.2, -0.9, -0.2], [3.1, 0.02, 0.032, 0.02, 0.22, -0.95, -0.22], [3.5, 0, 0, 0, 0, 0, 0]],
  left: [[0, 'grip'], [1.45, 'grip'], [1.65, 'press0'], [1.85, 'press1'], [2.15, 'press1'], [2.25, 'press0'], [2.5, 'grip']] };
export const ACTS = { MELEE, INSPECT };
const smooth = (t) => t * t * (3 - 2 * t);
function track(keys, t, out) {                         // (the gun's keys: piecewise smooth)
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], f = b[0] > a[0] ? smooth(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 1;
  for (let k = 1; k < 7; k++) out[k - 1] = a[k] + (b[k] - a[k]) * f;
  return out;
}

export class Glock {
  constructor(scene, world, audio, cross) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.owned = false; this.out = 0; this.want = false; this.first = true;
    this.mag = CAP; this.chambered = false; this.locked = false; this.reserve = RESERVE; this.auto = true;
    this.reload = null; this.cool = 0; this.ads = 0; this.sprint = 0; this.tuck = 0; this.trig = false;
    this.bloom = 0; this.kickP = V3(); this.kickR = V3(); this.kickPv = V3(); this.kickRv = V3(); this.slide = 0; this.slideT = 1; this.selT = 0;
    this.flips = []; this.flip = V3(); this.flipP = V3(); this.heat = 0;
    this.camKick = 0; this.prevYaw = null; this.prevPitch = 0; this.sway = V3(); this.swV = V3(); this.swW = V3(); this.t = 0; this.fovMul = 1;
    // (V89) the tactical stance (canted), the tactical sprint's raised pistol, a slide's cant; a strike or the
    // inspection (act); the range's targets (range.js, main.js)
    this.stance = 0; this.tacOn = false; this.tacAds = false; this.tacS = 0; this.slideS = 0; this.act = null; this.targets = null;
    // ---- in your hands: the gun, the hands, the arms, all in the camera's frame (placed every frame)
    const vm = this.vm = new THREE.Group(); vm.name = 'viewmodel'; vm.matrixAutoUpdate = false; vm.visible = false;
    const m = this.model = glockModel();
    this.gun = new THREE.Group(); this.gun.matrixAutoUpdate = false; this.gun.add(m.group); vm.add(this.gun);
    // the suppressor's first-round flash: a can full of air, whose oxygen burns the first shot's gases (a brief orange
    // flash round its end, the shooters' "first round pop"); the rounds after it find it full of spent gas: none
    this.pop = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshBasicMaterial({ map: flashTexture(), color: 0xffb468, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pop.position.copy(MUZZLE).add(V3(0, 0, -0.012)); this.pop.visible = false; this.pop.frustumCulled = false; this.gun.add(this.pop);
    this.popT = -1; this.lastShot = -10;
    m.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.newMag = magazineModel(m.M); this.newMag.matrixAutoUpdate = false; this.newMag.visible = false; vm.add(this.newMag);
    this.oldMag = magazineModel(m.M); this.oldMag.matrixAutoUpdate = false; this.oldMag.visible = false; vm.add(this.oldMag);
    for (const g of [this.newMag, this.oldMag]) g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.skin = { hand: gloveMaterial(), arm: skinMaterial(true) };  // (black tactical gloves, sculpted with their cuffs: handgeo.js)
    this.hands = null; this.arms = null;
    this.rh = holdOf(HOLD.right); this.lh = holdOf(HOLD.left);
    prepareHands(this.rh.tube, this.rh.pose); prepareHands(this.lh.tube, this.lh.pose); prepareHands(L_FREE, FREE); prepareArms();
    scene.add(vm);
    // ---- the world's: on the slab, and the things it leaves (cases, dropped magazines, marks, puffs)
    this.fx = new Effects(scene, m.M);
    this.place(cross);
    this.hud = new GunHud();
  }

  // ---- on the slab of the cross: on its right side between two of the cross's legs, the spare magazines beside it
  place(cross) {
    if (!cross) return;
    const top = cross.y + 0.35, c = Math.cos(cross.rot), s = Math.sin(cross.rot);
    const at = (lx, lz) => V3(cross.x + lx * c + lz * s, top, cross.z - lx * s + lz * c);   // (the slab's frame: landmarks.js)
    const lying = glockModel();
    lying.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = this.lying = new THREE.Group();
    const yaw = cross.rot + 0.9;
    lying.group.quaternion.setFromAxisAngle(V3(0, 0, 1), -Math.PI / 2);   // (its right side down: the selector up)
    lying.group.position.set(0, 0.0172, 0);
    g.add(lying.group);
    // (the spare magazines side by side beside it: each on its side, its length along the gun's)
    const qm = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -Math.PI / 2));
    for (let k = 0; k < 3; k++) {
      const mg = magazineModel(lying.M);
      mg.quaternion.copy(qm);
      mg.position.set(0.11 + k * 0.042, 0.0125, -0.13 + k * 0.012);
      g.add(mg);
    }
    g.position.copy(at(1.85, 1.75)); g.rotation.y = yaw;
    this.scene.add(g);
    this.spot = g.position.clone();
  }

  // the prompt to pick it up (and E takes it), when you stand by it; null else
  pickup(cam, input) {
    if (this.owned || !this.spot) return null;
    const d = cam.position.distanceTo(this.spot);
    if (d > 2.2) return null;
    if (input.hit('KeyE') || input.hit('KeyF')) {
      this.owned = true; this.want = true; this.out = 0; this.reload = null;
      this.scene.remove(this.lying); this.lying = null;
      this.audio?.gunCloth?.();
      return '';
    }
    return 'E / F — ia Glock 18-ul (cu amortizor, în bandă albă de iarnă) și încărcătoarele de lângă el';
  }

  // every frame (logic): ctx { dt, camera, input, player, foot (on foot, not riding), snow }
  update(ctx) {
    const { dt, input, player } = ctx;
    ctx.world ??= this.world; ctx.audio ??= this.audio;
    this.t += dt;
    const free = this.owned && ctx.foot;
    this.hud.touch(free);
    if (!free) { this.out = 0; this.vm.visible = false; this.reload = null; this.act = null; this.hud.show(false); this.hud.aim(false); this.hud.tick(); this.fovMul = 1; this.ads = 0; this.stance = 0; this.tacOn = false; player.aimSlow = 1; player.armed = false; player.gunBusy = false; this.fx.update(dt, ctx); return; }
    if (input.hit('KeyQ')) { this.want = !this.want; this.audio?.gunCloth?.(); }
    // taking it out / putting it away
    this.out = Math.max(0, Math.min(1, this.out + (this.want ? dt / 0.45 : -dt / 0.35)));
    const ready = this.out >= 1;
    if (ready && this.first) { this.first = false; this.startReload(FIRST); }
    // the selector
    if (input.hit('KeyX') && ready && !this.reload) { this.auto = !this.auto; this.selT = 0.35; this.audio?.gunSelect?.(); this.hud.flash(this.auto ? 'AUTOMAT' : 'FOC CU FOC'); }
    this.selT = Math.max(0, this.selT - dt);
    // reloading (the inspection gives way to it; not in a strike)
    if (input.hit('KeyR') && ready && this.act?.k !== MELEE) { if (this.act) this.endAct(); this.tryReload(); }
    if (this.reload) this.stepReload(dt);
    // running (the sprint, player.js), aiming or the tactical stance, a wall in front
    const running = !!player.running, aimHeld = input.down('Mouse2') && ready, busy = this.reload && this.reload.k !== FIRST;
    // (the tactical stance: V while aiming, as MWIII binds it, or Z any time; letting go of the sights ends a V-stance,
    // a sprint ends it; aiming in a slide takes it by itself)
    const vHit = input.hit('KeyV') && ready;
    if (vHit && aimHeld) { this.tacOn = !this.tacOn; this.tacAds = this.tacOn; this.audio?.gunCloth?.(); }
    if (input.hit('KeyZ') && ready) { this.tacOn = !this.tacOn; this.tacAds = false; this.audio?.gunCloth?.(); }
    if ((this.tacAds && !aimHeld) || running) { this.tacOn = false; this.tacAds = false; }
    const inStance = ready && !running && !busy && (this.tacOn || (aimHeld && (player.slK ?? 0) > 0.5));
    const aiming = aimHeld && !running && !busy && !inStance;
    // (V not aiming: the strike; I: the inspection - the hands free for it; anything else cuts the inspection short)
    const handsFree = ready && !this.reload && !this.act;
    if (vHit && !aimHeld && handsFree) this.startAct(MELEE);
    if (input.hit('KeyI') && handsFree && !aiming && !inStance && !running && !input.down('Mouse0')) this.startAct(INSPECT);
    if (this.act?.k === INSPECT && (aimHeld || input.down('Mouse0') || running || inStance || player.tac || player.sl)) this.endAct();
    if (this.act) this.stepAct(dt, ctx);
    this.ads = damp1(this.ads, aiming ? 1 : 0, player.sup ? 7 : 14, dt);          // (on your back: slower to the sights, MW4's)
    this.stance = damp1(this.stance, inStance ? 1 : 0, 16, dt);
    this.sprint = damp1(this.sprint, running && !this.trig ? 1 : 0, 8, dt);
    // (flat out: the pistol up - slower down from it than from the run: firing out of a tactical sprint waits longer)
    this.tacS = damp1(this.tacS, player.tac && !this.reload && !this.act ? 1 : 0, player.tac ? 7 : 5, dt);
    this.slideS = player.slK ?? 0;
    this.tuck = damp1(this.tuck, this.wallAhead(ctx.camera) ? 1 : 0, 10, dt);
    player.aimSlow = 1 - 0.4 * this.ads - 0.12 * this.stance;
    this.fovMul = 1 - 0.2 * this.ads - 0.05 * this.stance;
    player.armed = ready; player.gunBusy = aimHeld || (input.down('Mouse0') && ready);    // (no sprinting with the sights up or the trigger held)
    // the trigger
    const pull = input.down('Mouse0') && ready && this.tuck < 0.5 && !this.act;
    const pressed = input.hit('Mouse0') && ready && this.tuck < 0.5 && !this.act;
    // (the cycle's time carried over from frame to frame: 1200 a minute is 3 frames a round at 60 fps, not 4)
    this.cool -= dt;
    let fired = false;
    if (pull && !this.reload && this.sprint < 0.5 && this.tacS < 0.3) {
      if (this.chambered && (this.auto || pressed)) { while (this.cool <= 1e-9 && this.chambered) { this.shoot(ctx); fired = true; this.cool += 60 / RPM; if (!this.auto) break; } }
      else if (!this.chambered && pressed) { this.audio?.gunDry?.(); if (this.reserve > 0) this.tryReload(); }
    }
    if (!fired) this.cool = Math.max(this.cool, 0);
    if (!pull) this.cool = Math.min(this.cool, 0);
    this.trig = pull;
    this.bloom = Math.max(0, this.bloom - dt * (pull ? 0.02 : 0.12));
    // the recoil: the shots' flips (each its own bump in time), the gun's slower settle (springs); the view's kick
    // partly comes back
    this.flip.set(0, 0, 0); this.flipP.set(0, 0, 0);
    for (let i = this.flips.length - 1; i >= 0; i--) {
      const s = this.flips[i], g = bump(this.t - s.t);
      if (this.t - s.t > 0.15) { this.flips.splice(i, 1); continue; }
      this.flip.addScaledVector(s.r, g); this.flipP.addScaledVector(s.p, g);
    }
    spring(this.kickP, this.kickPv, 16, 0.95, dt); spring(this.kickR, this.kickRv, 15, 0.92, dt);
    this.heat *= Math.exp(-dt / 0.12);
    const back = this.camKick * Math.min(1, dt * 7);
    this.camKick -= back; player.pitch -= back * 0.6;
    // the slide: back on a shot and home again (back in ~12 ms, home in ~30: a cycle within the 50 ms between two rounds,
    // seen over two or three frames), held back once the last round has gone (the slide stop)
    if (this.reload?.slideHeld || this.act?.slideHeld) { /* (in the left hand: stepReload, stepAct) */ }
    else if (this.locked) this.slide = damp1(this.slide, SLIDE, 40, dt);
    else { this.slideT += dt; this.slide = SLIDE * (this.slideT < 0.012 ? this.slideT / 0.012 : Math.max(0, 1 - (this.slideT - 0.012) / 0.03)); }
    // the sway: the gun lags behind the turning view and swings back, with the inertia of a gun in two hands. It is
    // driven by the view's turn rate with the input's unevenness smoothed out (a mouse's or a finger's moves come into
    // the frames unevenly: two in one, three or none in the next; the old sway took each frame's own step, so the gun
    // and the hands shook ~0.4 deg frame to frame on a swung view, measured), its lag ~55 ms of the turn (at most ~0.11
    // rad, reached softly, not against a stop) followed through a critically damped spring; the same at any frame rate
    if (this.prevYaw === null) { this.prevYaw = player.yaw; this.prevPitch = player.pitch; }
    let dy = player.yaw - this.prevYaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = player.pitch - this.prevPitch; this.prevYaw = player.yaw; this.prevPitch = player.pitch;
    if (Math.abs(dy) > 0.6 || Math.abs(dp) > 0.6 || dt <= 0) this.swW.set(0, 0, 0);          // (a cut: a view picked)
    else { const a = 1 - Math.exp(-dt / 0.05); this.swW.x += (dp / dt - this.swW.x) * a; this.swW.y += (dy / dt - this.swW.y) * a; }
    critical(this.sway, this.swV, 0.11 * Math.tanh(this.swW.x * 0.5), 0.11 * Math.tanh(this.swW.y * 0.5), 18, dt);
    this.vm.visible = this.out > 0;
    this.hud.show(ready || this.out > 0.5);
    const rounds = this.mag + (this.chambered ? 1 : 0);
    this.hud.set(rounds, this.reserve, this.auto, this.reload ? (this.reload.k === FIRST ? '' : 'Reîncarcă…') : this.inStanceHint(inStance));
    this.hud.warn(ready && !this.reload ? rounds : -1, this.reserve);
    this.hud.cross(this.out > 0.9 && this.ads < 0.5 && this.sprint < 0.5 && this.tacS < 0.5 && this.act?.k !== INSPECT, this.spread(player), ctx.camera.fov);
    this.hud.aim(this.ads > 0.5);
    this.hud.range(this.targets?.near(ctx.camera.position) ? this.targets : null);
    this.hud.tick();
    this.fx.update(dt, ctx);
  }

  inStanceHint(on) { return on ? 'TAC-STANCE' : ''; }
  // (the hip's spread; at the sights ~a fifth of it, in the tactical stance half; moving, in the air: more)
  spread(player) {
    const hs = Math.hypot(player.vel.x, player.vel.z);
    return (0.024 + 0.02 * Math.min(1, hs / 6) + this.bloom) * (1 - 0.82 * this.ads) * (1 - 0.5 * this.stance) + (player.onGround ? 0 : 0.03);
  }

  // ---- (V89) a strike, the inspection: their timelines (as a reload's), the blow
  startAct(k) { this.act = { k, t: 0, slideHeld: false }; if (k === MELEE) this.audio?.swing?.(); else this.audio?.gunCloth?.(); }
  endAct() { if (this.act?.slideHeld) { this.slide = 0; this.slideT = 1; } this.act = null; }
  stepAct(dt, ctx) {
    const a = this.act, k = a.k, t0 = a.t; a.t += dt;
    const at = (x) => t0 < x && a.t >= x;
    if (k === MELEE && at(k.strike)) this.strike(ctx);
    if (k.press) {
      // (the press check: the slide eased back ~11 mm and held a moment, then let forward under its spring by the hand)
      const [p0, p1, p2, p3] = k.press;
      if (at(p0)) { a.slideHeld = true; this.audio?.slideBack?.(); }
      if (a.slideHeld) this.slide = 0.011 * smooth(Math.min(1, Math.max(0, (a.t - p0) / (p1 - p0)))) * (a.t < p2 ? 1 : Math.max(0, 1 - (a.t - p2) / (p3 - p2)));
      if (at(p3)) { a.slideHeld = false; this.slide = 0; this.slideT = 1; this.audio?.gunDry?.(); }
    }
    if (a.t >= k.dur) this.endAct();
  }
  // the blow: what is within reach in front (~1.25 m) - a target goes down; a wall, a trunk, a car: a thud
  strike(ctx) {
    const cam = ctx.camera; cam.getWorldDirection(_d);
    const hit = this.trace(cam.position, _v.copy(_d).multiplyScalar(1.25), 1, true);
    if (!hit) return;
    this.audio?.meleeHit?.(!hit.target);
    if (hit.target) this.targets.blow(hit, cam.position);
    this.kickRv.z -= 1.5; this.kickPv.z += 0.15; ctx.player.landShake = Math.max(ctx.player.landShake, 0.012);
  }
  // the range's word on a round (range.js): the hit marker and its tick, the score, the medal, the feed; a puff off it
  onRange(e) {
    const kill = e.type === 'kill';
    this.hud.hit(kill, !!e.head);
    if (kill) this.audio?.killMark?.(e.head); else this.audio?.hitMark?.();
    if (e.lines.length) this.hud.score(e.pts, e.lines.map(l => l[0]));
    if (e.medal) this.hud.medal(e.medal);
    if (kill) this.hud.feed(e.name.toUpperCase() + ' · ' + Math.round(e.d) + ' m' + (e.head ? ' · în cap' : '') + (e.melee ? ' · corp la corp' : ''));
    if (e.p) this.fx.puff(_a.copy(e.p).addScaledVector(e.n, 0.02), 0.02, 0.35, e.plate ? 0xa9abaf : 0x6b7448, 0.55, e.n.clone().multiplyScalar(0.6));
  }

  tryReload() {
    if (this.reload || this.mag >= CAP || this.reserve <= 0) return;
    this.startReload(this.chambered ? TACT : EMPTY);
  }
  startReload(k) { this.reload = { k, t: 0, done: {}, slideHeld: false }; if (k !== FIRST) this.audio?.gunCloth?.(); }
  stepReload(dt) {
    const r = this.reload, k = r.k, t0 = r.t; r.t += dt;
    const at = (x) => t0 < x && r.t >= x;
    if (k.drop !== undefined && at(k.drop)) { this.dropT = 0; this.audio?.magOut?.(); }
    if (k.strip && at(k.strip[0])) this.audio?.magOut?.();
    if (k.insert && at(k.insert[1])) {
      const take = Math.min(CAP - this.mag, this.reserve);
      this.mag += take; this.reserve -= take; this.audio?.magIn?.();
      this.kickPv.y += 0.15; this.kickRv.x -= 0.9;            // (the slap)
    }
    if (k.rack && at(k.rack[0])) { r.slideHeld = true; this.audio?.slideBack?.(); }
    if (k.rack && r.t >= k.rack[0] && r.t < k.release) this.slide = SLIDE + 0.003 * smooth(Math.min(1, (r.t - k.rack[0]) / (k.rack[1] - k.rack[0])));
    if (k.release !== undefined && at(k.release)) {
      r.slideHeld = false; this.locked = false; this.slideT = 0.012;          // (let go: it flies home)
      if (!this.chambered && this.mag > 0) { this.mag--; this.chambered = true; }
      this.audio?.slideRelease?.();
    }
    if (r.t >= k.dur) this.reload = null;
  }

  // a wall right in front: the gun is tucked up (it would go through it)
  wallAhead(cam) {
    if ((this._wallT = (this._wallT ?? 0) + 1) % 4) return this._wall;
    cam.getWorldDirection(_d);
    const hit = this.trace(cam.position, _d.multiplyScalar(0.75), 1, true);
    return (this._wall = !!hit);
  }

  // ---- a shot
  shoot(ctx) {
    const { camera, player } = ctx;
    if (this.mag > 0) this.mag--; else { this.chambered = false; this.locked = true; }
    // the round: from the eye along the view, scattered by the spread
    camera.getWorldDirection(_d);
    const sp = this.spread(player), a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp * 0.5;
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion); _r.crossVectors(_d, _u).normalize(); _u.crossVectors(_r, _d);
    _v.copy(_d).addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize().multiplyScalar(V0);
    const hit = this.trace(camera.position, _v, 2.5);
    this.targets?.shot(camera.position);
    if (hit?.target) this.targets.hit(hit, camera.position);           // (on the range: its effect when the round gets there)
    else if (hit) this.fx.impact(hit, camera.position, ctx, this.audio);
    // the kick: the gun flips up in the hands, a little to the left and turned, and comes back toward you (~12 deg at
    // its peak 32 ms after the shot, gone by ~90 ms: the user's clip); aimed, less; in a burst each round flips
    // it less (the hands bear down on it) while the view climbs; the view up a little (more of it comes back than stays)
    const k = 1 - 0.6 * this.ads, f = k / (1 + 0.8 * this.heat);
    this.heat += 1;
    if (this.flips.length >= 8) this.flips.shift();
    this.flips.push({ t: this.t, r: V3((0.21 + Math.random() * 0.05) * f, (Math.random() - 0.3) * 0.05 * f, (0.045 + Math.random() * 0.035) * f), p: V3(0, 0.004 * f, 0.03 * f) });
    this.kickPv.z += 0.1 * k; this.kickRv.x += (0.5 + 0.3 * Math.random()) * k;
    const up = (0.0065 + Math.random() * 0.003) * (1 - 0.3 * this.ads);
    player.pitch = Math.min(1.45, player.pitch + up); this.camKick += up;
    player.yaw += (Math.random() - 0.5) * 0.005;
    this.bloom = Math.min(0.045, this.bloom + 0.006);
    this.slideT = 0;                                            // (the slide's cycle)
    if (this.t - this.lastShot > 2) { this.popT = this.t; this.pop.rotation.z = Math.random() * Math.PI; }
    this.lastShot = this.t;
    this.audio?.gunShot?.();
    // the case out of the port (its first flight in the hands' frame, seen through their lens, then in the world); the
    // suppressor's little puff (in the world, where it is in the hands; its size and drift as through their lens: the
    // view's squeeze across, placeView - a narrow lens would show it several times too big)
    this.placeView(camera);
    _m4.multiplyMatrices(this.vm.matrix, this.gun.matrix);
    this.fx.casing(_a.copy(EJECT).applyMatrix4(this.gun.matrix), camera, player.vel, this.vm);
    const sq = _s.setFromMatrixColumn(this.vm.matrix, 0).length();
    this.fx.puff(_b.copy(MUZZLE).applyMatrix4(_m4), 0.035 * sq, 0.5, 0xd8d6d2, 0.45, V3(0, 0.25 * sq, 0));
  }

  // where a round (or a probe) from o with velocity v meets something within tMax seconds: { p, n, tag, t, d } | null
  trace(o, v, tMax, probe = false) {
    const world = this.world, step = probe ? 1 : 0.02, out = [];
    let x = o.x, y = o.y, z = o.z, vx = v.x, vy = v.y, vz = v.z, t = 0, d = 0;
    while (t < tMax) {
      const nx = x + vx * step, nz = z + vz * step, nvy = probe ? vy : vy - G * step, ny = y + (vy + nvy) * 0.5 * step;
      // the boxes along the segment
      const mx = (x + nx) / 2, mz = (z + nz) / 2, half = Math.hypot(nx - x, nz - z) / 2;
      world.query(mx, mz, half + 1.5, out);
      let best = null;
      for (const b of out) {
        if (LIVING.has(b.tag) || b.ghost || b.tag === 'range') continue;
        let y0 = b.y0, y1 = b.y1;
        if (b.tag === 'car') { const gy = b.vehicle?.car?.group?.position?.y ?? world.groundHeight(b.x, b.z); y0 = gy - 0.1; y1 = gy + 1.5; }
        const h = segBox(x, y, z, nx, ny, nz, b, y0, y1);
        if (h && (!best || h.f < best.f)) best = { ...h, b };
      }
      // the ground along it (every ~0.5 m)
      const L = Math.hypot(nx - x, ny - y, nz - z), n = Math.max(1, Math.ceil(L / 0.5));
      let gf = null;
      for (let i = 1; i <= n; i++) {
        const f = i / n, px = x + (nx - x) * f, py = y + (ny - y) * f, pz = z + (nz - z) * f;
        if (py < world.groundHeight(px, pz, py + 0.5)) {
          let lo = (i - 1) / n, hi = f;
          for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2, qx = x + (nx - x) * mid, qy = y + (ny - y) * mid, qz = z + (nz - z) * mid; if (qy < world.groundHeight(qx, qz, qy + 0.5)) hi = mid; else lo = mid; }
          gf = hi; break;
        }
      }
      // the range's targets along it, as they stand this frame (range.js: the plastic, the steel)
      const tg = this.targets?.segment(x, y, z, nx, ny, nz);
      if (tg && (!best || tg.f < best.f) && (gf === null || tg.f < gf)) return { p: tg.p, n: tg.n, tag: 'target', t: t + tg.f * step, d: d + tg.f * L, target: tg.target, zone: tg.zone, local: tg.local };
      if (gf !== null && (!best || gf < best.f)) {
        const px = x + (nx - x) * gf, pz = z + (nz - z) * gf, e = 0.25;
        const h0 = world.groundHeight(px, pz), hx = world.groundHeight(px + e, pz), hz = world.groundHeight(px, pz + e);
        return { p: V3(px, h0, pz), n: V3(-(hx - h0) / e, 1, -(hz - h0) / e).normalize(), tag: 'ground', t: t + gf * step, d: d + gf * L };
      }
      if (best) return { p: V3(x + (nx - x) * best.f, y + (ny - y) * best.f, z + (nz - z) * best.f), n: best.n, tag: best.b.tag, t: t + best.f * step, d: d + best.f * L, box: best.b };
      x = nx; y = ny; z = nz; vy = nvy; t += step; d += L;
    }
    return null;
  }

  // ---- the hands' frames and the view: every frame, last (the camera's final place)
  // (the hands and the gun are seen with a field of view of their own, ~55 deg up and down, whatever the camera's - the
  // game's natural one can be 25 deg: a gun 30 cm in front would fill the screen; as games draw their weapons: the frame
  // squeezed across by the ratio of the two lenses, its depth kept; a little narrower aimed, the gun nearer)
  placeView(camera) {
    camera.updateMatrixWorld();
    const k = Math.tan(camera.fov * Math.PI / 360) / Math.tan(VM_FOV * (1 - 0.12 * this.ads) * Math.PI / 360);
    this.vm.matrix.copy(camera.matrixWorld).multiply(_sc.makeScale(k, k, 1));
    this.vm.matrixWorldNeedsUpdate = true;
  }
  draw(camera, player) {
    if (!this.vm.visible) return;
    this.placeView(camera);
    // the gun's pose: hip / aimed / running / tucked, down when put away; the sway, the bob, the breath, the recoil
    blend(_P, VIEW.hip, VIEW.ads, this.ads); blendTo(_P, VIEW.stance, this.stance);
    blendTo(_P, VIEW.sprint, this.sprint * (1 - this.ads) * (1 - this.tacS)); blendTo(_P, VIEW.tac, this.tacS); blendTo(_P, VIEW.tuck, this.tuck);
    blendTo(_P, VIEW.down, 1 - smooth(this.out));
    const bob = player.bobAmt * (1 - 0.8 * this.ads), ph = player.bobPhase;
    _P.p.x += Math.cos(ph) * 0.006 * bob + this.sway.y * 0.08; _P.p.y += -Math.abs(Math.sin(ph)) * 0.008 * bob - this.sway.x * 0.06 - player.landShake * 0.5 + Math.sin(this.t * 1.4) * 0.0012 * (1 - this.ads);
    _P.p.add(this.kickP);
    // (sliding: the gun canted in ~16 deg; flat out: swinging with the stride)
    _P.p.y -= Math.abs(Math.sin(ph)) * 0.012 * this.tacS;
    _e.set(this.kickR.x - this.sway.x * 0.7 + Math.sin(this.t * 1.1) * 0.003 * (1 - this.ads), this.kickR.y - this.sway.y * 0.9, this.kickR.z - this.sway.y * 0.5 + Math.cos(ph) * (0.01 * bob + 0.05 * this.tacS) + 0.28 * this.slideS * (1 - this.ads) * (1 - this.stance), 'YXZ');
    this._ph = ph;
    _q.setFromEuler(_e); _P.q.multiply(_q);
    // a reload's own motion of the gun (or a strike's, the inspection's); the selector's flick
    const r = this.reload, act = r ?? this.act;
    if (act) {
      const o = track(act.k.gun, act.t, _o);
      _P.p.x += o[0]; _P.p.y += o[1]; _P.p.z += o[2];
      _q.setFromEuler(_e.set(o[3], o[4], o[5], 'YXZ')); _P.q.multiply(_q);
    }
    if (this.selT > 0) { const s = Math.sin(this.selT / 0.35 * Math.PI); _P.p.y += 0.01 * s; _q.setFromEuler(_e.set(0.05 * s, 0, -0.25 * s, 'YXZ')); _P.q.multiply(_q); }
    this.pop.visible = this.t - this.popT < 0.03;             // (two frames at 60 fps)
    // the shot's flip: the gun turned about the hands' web (not about its bore), and pushed back
    _q.setFromEuler(_e.set(this.flip.x, this.flip.y, this.flip.z, 'YXZ'));
    _P.p.add(_a.copy(PIVOT).applyQuaternion(_P.q)).sub(_b.copy(PIVOT).applyQuaternion(_q).applyQuaternion(_P.q)).add(this.flipP);
    _P.q.multiply(_q);
    this.gun.matrix.compose(_P.p, _P.q, ONE); this.gun.matrixWorldNeedsUpdate = true;
    // the moving parts
    const m = this.model;
    m.slide.position.z = this.slide;
    m.trigger.rotation.x = this.trig && this.chambered ? -0.25 : 0;
    m.selector.rotation.x = this.auto ? -0.9 : 0;
    // the cases still in the hands' frame, where they are through its lens this frame
    this.fx.vmCases(camera);
    // the magazine: seated, out (dropped), or coming in in the left hand
    this.mags(r);
    this.limbs(act);
  }

  mags(r) {
    const m = this.model, seat = m.mag.userData.seat;
    m.mag.visible = true; m.mag.position.copy(seat);
    this.newMag.visible = false;
    if (!r || r.k === FIRST) { this.oldMag.visible = false; this.oldInHand = false; this.magInFree = false; return; }
    const k = r.k;
    this.oldInHand = false;
    // the old one stripped by the left hand: down the grip's axis with it, then in the hand to the belt (put away)
    if (k.strip && r.t >= k.strip[0]) {
      m.mag.visible = false;
      this.oldMag.visible = r.t < k.stow;
      if (r.t < k.strip[1]) {
        const f = smooth((r.t - k.strip[0]) / (k.strip[1] - k.strip[0]));
        _m4.copy(this.gun.matrix).multiply(_n4.compose(_a.copy(seat).addScaledVector(MAG_AXIS, 0.06 * f), m.mag.quaternion, ONE));
        this.oldMag.matrix.copy(_m4); this.oldMag.matrixWorldNeedsUpdate = true;
      } else this.oldInHand = this.oldMag.visible;
    }
    // the old one: out at the drop, falling out of the grip, gone after a little (dropped into the world)
    if (k.drop !== undefined && r.t >= k.drop) {
      const tf = r.t - k.drop;
      m.mag.visible = false;
      if (tf < 0.35) {
        this.oldMag.visible = true;
        _m4.copy(this.gun.matrix).multiply(_n4.compose(_a.copy(seat).addScaledVector(MAG_AXIS, 0.25 * tf + 2.4 * tf * tf), m.mag.quaternion, ONE));
        this.oldMag.matrix.copy(_m4); this.oldMag.matrixWorldNeedsUpdate = true;
      } else if (this.oldMag.visible) {
        this.oldMag.visible = false;
        this.fx.dropMag(_m4b.multiplyMatrices(this.vm.matrix, this.oldMag.matrix), this.model.M);
      }
    }
    // the new one: from the belt in the left hand, then up the grip's axis into the well
    if (r.t >= k.stow && r.t < k.insert[1]) {
      this.newMag.visible = true;
      const f = r.t < k.insert[0] ? 1 : 1 - smooth((r.t - k.insert[0]) / (k.insert[1] - k.insert[0]));
      // (its place below the well, 6 cm down at the start of the push; before that it is in the hand: limbs())
      _m4.copy(this.gun.matrix).multiply(_n4.compose(_a.copy(seat).addScaledVector(MAG_AXIS, 0.06 * f), m.mag.quaternion, ONE));
      this.magIn = _m4.clone();
      if (r.t < k.insert[0]) this.magInFree = true; else this.magInFree = false;
      this.newMag.matrix.copy(_m4); this.newMag.matrixWorldNeedsUpdate = true;
    } else if (r.t >= k.insert[1]) { m.mag.visible = true; this.magIn = null; }
  }

  // the hands on the gun and the arms to them
  limbs(r) {
    if (!this.hands) {
      const h0 = barHands(this.rh.tube, this.rh.pose), h1 = barHands(this.lh.tube, this.lh.pose), h2 = barHands(L_FREE, FREE);
      if (h0 && h1 && h2) {
        // (the left: on the grip, or open round the slide or a magazine)
        this.hands = [h1.left, h0.right, h2.left].map(g => { const ms = new THREE.Mesh(g, this.skin.hand); ms.matrixAutoUpdate = false; ms.frustumCulled = false; this.vm.add(ms); return ms; });
        this.wr = [barWrists(this.lh.tube, this.lh.pose)[1], barWrists(this.rh.tube, this.rh.pose)[0], barWrists(L_FREE, FREE)[1]];
        // (a steel D-ring on the right glove's cuff, sewn on its little finger's side, as the clip's)
        const c = gloveCuff(this.rh.tube, this.rh.pose), A = (v) => V3(...v), ring = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0011, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8e8e8e, metalness: 1, roughness: 0.35 }));
        const side = A(c.little), fore = A(c.fore), back = A(c.back);
        ring.position.copy(A(c.J)).addScaledVector(fore, -0.016).addScaledVector(side, 0.0335 + 0.0062);
        ring.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, fore, back).multiply(new THREE.Matrix4().makeRotationX(0.35)));   // (side x fore = back: a turn)
        ring.frustumCulled = false; this.hands[1].add(ring);
      }
    }
    if (!this.arms) {
      const ag = gripArms();
      if (ag) this.arms = [ag.left, ag.right].map(geo => {
        const bones = INV.map(() => new THREE.Bone()), sk = new THREE.SkinnedMesh(geo, this.skin.arm);
        sk.bindMode = THREE.DetachedBindMode; sk.bind(new THREE.Skeleton(bones, INV.map(x => x.clone())), new THREE.Matrix4());
        sk.matrixAutoUpdate = false; sk.frustumCulled = false;
        this.vm.add(sk);
        return bones;
      });
    }
    if (!this.hands) return;
    // the right hand: on the grip always
    _HR.multiplyMatrices(this.gun.matrix, _n4.compose(this.rh.p, this.rh.q, ONE));
    // the left: on the grip, or down at the belt, or with the magazine, or racking the slide (its shape for it)
    const left = this.leftPose(r), onGrip = this.leftOnGrip;
    const H = [left, _HR, left];
    for (let i = 0; i < 3; i++) { this.hands[i].matrix.copy(H[i]); this.hands[i].matrixWorldNeedsUpdate = true; }
    this.hands[0].visible = onGrip; this.hands[2].visible = !onGrip;
    if (!this.arms) return;
    for (let i = 0; i < 2; i++) {
      const w = this.wr[i === 0 && !onGrip ? 2 : i];
      _w.copy(w.at).applyMatrix4(H[i]); _bk.copy(w.back).transformDirection(H[i]);
      this.forearm(i, _w, _hd.copy(w.dir).transformDirection(H[i]));
      poseArm(this.arms[i], _sh, _el, _w, _bk);
    }
  }
  // an arm to a hand's wrist (w; the hand's own forearm direction, the glove's cuff's axis: hd): the forearm as the arm
  // would come from the shoulder (two-bone kinematics), turned toward the cuff's axis until at most WRIST off it (the
  // wrist bent inside the cuff: no forearm's end standing out of the hand); the elbow along it, the shoulder where the
  // upper arm then reaches (out of sight) -> _el, _sh
  forearm(i, w, hd) {
    ik(SH[i], w, ARM, POLE[i], _el, _tip);
    _fa.subVectors(w, _el).normalize();
    const th = Math.acos(THREE.MathUtils.clamp(_fa.dot(hd), -1, 1));
    if (th > WRIST) { const s = Math.sin(Math.min(th, 3.1)); _fa.multiplyScalar(Math.sin(WRIST) / s).addScaledVector(hd, Math.sin(th - WRIST) / s).normalize(); }
    _el.copy(w).addScaledVector(_fa, -ARM[1]);
    _sh.subVectors(SH[i], _el).normalize().multiplyScalar(ARM[0]).add(_el);
  }
  leftPose(r) {
    const onGrip = _HL.multiplyMatrices(this.gun.matrix, _n4.compose(this.lh.p, this.lh.q, ONE));
    this.leftOnGrip = true;
    if (!r) {
      if (this.tacS < 0.02) return onGrip;
      // (flat out: off the gun, low and swinging with the stride - out of sight; its shape changes halfway)
      const f = smooth(Math.min(1, this.tacS * 1.25));
      this.leftOnGrip = f < 0.5;
      onGrip.decompose(_a, _q, _s); this.leftAt('pump', onGrip, _LB).decompose(_b, _q2, _s);
      _a.lerp(_b, f); _q.slerp(_q2, f);
      return _HL.compose(_a, _q, ONE);
    }
    const keys = r.k.left;
    let i = 0;
    while (i < keys.length - 2 && r.t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], f = b[0] > a[0] ? smooth(Math.min(1, Math.max(0, (r.t - a[0]) / (b[0] - a[0])))) : 1;
    // (the hand's shape changes halfway between the grip and anywhere else, as it opens and closes)
    this.leftOnGrip = f < 0.5 ? a[1] === 'grip' : b[1] === 'grip';
    const A = this.leftAt(a[1], onGrip, _LA), B = this.leftAt(b[1], onGrip, _LB);
    // (between two places: the positions and the turns blended)
    A.decompose(_a, _q, _s); B.decompose(_b, _q2, _s);
    _a.lerp(_b, f); _q.slerp(_q2, f);
    // the new magazine rides in the hand until the push; the stripped one from its pull to the belt
    const carried = this.newMag.visible && this.magInFree ? this.newMag : this.oldInHand ? this.oldMag : null;
    if (carried) {
      const hm = _HL.compose(_a, _q, ONE);
      carried.matrix.multiplyMatrices(hm, _n4.compose(LH_MAG.p, LH_MAG.q, ONE).invert()); carried.matrixWorldNeedsUpdate = true;
      return hm;
    }
    return _HL.compose(_a, _q, ONE);
  }
  leftAt(name, onGrip, out) {
    if (name === 'grip') return out.copy(onGrip);
    if (name === 'belt') return out.compose(BELT.p, BELT.q, ONE);
    if (name === 'pump') { const ph = this._ph ?? 0; return out.compose(_c.set(BELT.p.x - 0.04, BELT.p.y + 0.05 * Math.sin(ph), BELT.p.z - 0.1 * Math.cos(ph)), BELT.q, ONE); }
    if (name === 'magIn0' || name === 'magIn1') {
      // (the hand low on the magazine where it will be: below the well, 6 cm down / pushed home)
      const seat = this.model.mag.userData.seat;
      _n4.compose(_c.copy(seat).addScaledVector(MAG_AXIS, name === 'magIn0' ? 0.06 : 0), this.model.mag.quaternion, ONE);
      return out.multiplyMatrices(this.gun.matrix, _n4).multiply(_m4b.compose(LH_MAG.p, LH_MAG.q, ONE));
    }
    // racking: on the slide's rear, pulled back with it (a press check: eased back ~11 mm)
    const pull = name === 'rack1' ? 0.03 : name === 'press1' ? 0.011 : 0;
    return out.multiplyMatrices(this.gun.matrix, _n4.compose(_c.copy(LH_RACK.p).add(V3(0, 0, pull)), LH_RACK.q, ONE));
  }
}

// ---- the world's side: cases, dropped magazines, bullet marks, dust and sparks
const _d = V3(), _u = V3(), _r = V3(), _v = V3(), _a = V3(), _b = V3(), _c = V3(), _w = V3(), _bk = V3(), _el = V3(), _tip = V3(), _s = V3();
const _hd = V3(), _fa = V3(), _sh = V3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _n4 = new THREE.Matrix4();
const _sc = new THREE.Matrix4(), _HR = new THREE.Matrix4(), _HL = new THREE.Matrix4(), _LA = new THREE.Matrix4(), _LB = new THREE.Matrix4(), _o = [0, 0, 0, 0, 0, 0];
const _P = { p: V3(), q: new THREE.Quaternion() }, ONE = V3(1, 1, 1);
// the shoulders (the camera's frame) and which way each elbow bends
const SH = [V3(-0.19, -0.25, 0.05), V3(0.19, -0.25, 0.05)], POLE = [V3(-0.6, -1, 0.25).normalize(), V3(0.6, -1, 0.25).normalize()];
export const ARMS = { SH, POLE };
const damp1 = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// a shot's flip over the time since it: none on the shot's own frame (it shows the slide back and the case), half of it
// ~17 ms on, all of it at 32 ms, a quarter at ~68 ms, gone by ~90 ms (the clip's, frame by frame)
const bump = (t) => t <= 0 ? 0 : (t / 0.032) ** 4 * Math.exp(4 * (1 - t / 0.032));
// a critically damped spring (no overshoot) pulling x (x, y) toward (tx, ty), solved exactly over dt: angular frequency w
function critical(x, v, tx, ty, w, dt) {
  const e = Math.exp(-w * dt);
  for (const [k, t] of [['x', tx], ['y', ty]]) {
    const d = x[k] - t, b = v[k] + w * d;
    x[k] = t + (d + b * dt) * e; v[k] = (v[k] - w * b * dt) * e;
  }
}
// a damped spring solved exactly over dt (the same motion at any frame rate): angular frequency w, damping ratio z < 1
function spring(x, v, w, z, dt) {
  const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
  for (const k of ['x', 'y', 'z']) {
    const x0 = x[k], v0 = v[k];
    x[k] = e * (x0 * c + (v0 + z * w * x0) / wd * s);
    v[k] = e * (v0 * c - (z * w * v0 + w * w * x0) / wd * s);
  }
}
function blend(out, A, B, f) { out.p.copy(A.p).lerp(B.p, f); out.q.copy(A.q).slerp(B.q, f); }
function blendTo(out, B, f) { if (f <= 0) return; out.p.lerp(B.p, f); out.q.slerp(B.q, f); }
// a segment against a box (its own frame: landmarks' and buildings' boxes turn about y): the fraction along it and the
// face's normal, or null
function segBox(x0, y0, z0, x1, y1, z1, b, by0, by1) {
  const c = b.c, s = b.s;
  const ax = (x0 - b.x) * c - (z0 - b.z) * s, az = (x0 - b.x) * s + (z0 - b.z) * c;
  const bx = (x1 - b.x) * c - (z1 - b.z) * s, bz = (x1 - b.x) * s + (z1 - b.z) * c;
  const d = [bx - ax, y1 - y0, bz - az], o = [ax, y0, az], lo = [-b.hw, by0, -b.hd], hi = [b.hw, by1, b.hd];
  let t0 = 0, t1 = 1, axis = -1, sign = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k], sg = -1;
    if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; sg = 1; }
    if (ta > t0) { t0 = ta; axis = k; sign = sg; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (axis < 0) return null;                                  // (it starts inside: not a hit)
  // the face's normal back in the world (the local x axis is (c, -s) in x z, the local z (s, c))
  const n = axis === 1 ? V3(0, sign, 0) : axis === 0 ? V3(c * sign, 0, -s * sign) : V3(s * sign, 0, c * sign);
  return { f: t0, n };
}

class Effects {
  constructor(scene, M) {
    this.scene = scene;
    // the cases: 9 x 19 mm brass, instanced
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 1 });
    this.cases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0049, 0.0049, 0.0192, 10), brass, 80);
    this.cases.count = 0; this.cases.frustumCulled = false; this.cases.castShadow = true; scene.add(this.cases);
    this.cs = [];
    // the marks: a dark hole with its torn rim (on hard surfaces), a scuff of earth (on the ground)
    const holeTex = markTexture(), mat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, 120); this.marks.count = 0; this.marks.frustumCulled = false; scene.add(this.marks);
    this.mi = 0;
    // dust, plaster, bark, snow: soft puffs; sparks: bright streaks
    this.puffs = []; this.sparks = [];
    this.puffMat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.mags = [];
    this.M = M;
    this.world = null;
  }
  // a case out of the port: first in the hands' frame (the viewmodel's, vm; p there), seen through their lens while it is
  // in sight (as the gun: a narrow lens of the game's would show it several times too big and too fast), then in the
  // world: falling, bouncing, lying
  casing(p, cam, vel, vm) {
    // (in the camera's frame: to the right and up, a little back; your own motion with it)
    _q.copy(cam.quaternion).invert();
    const v = V3(2.2 + Math.random() * 0.8, 1.6 + Math.random() * 0.7, 0.1 + Math.random() * 0.3).add(_v.copy(vel).applyQuaternion(_q));
    if (this.cs.length >= 80) this.cs.shift();
    this.cs.push({ p: p.clone(), v, vm, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)), w: V3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40), age: 0, rest: false, hit: false });
  }
  // (the cases still in the hands' frame: placed through the lens of this frame - the view's place after the update)
  vmCases(cam) {
    let any = false;
    for (const c of this.cs) if (c.vm) { this.vmCase(c, c.i, cam); any = true; }
    if (any) this.cases.instanceMatrix.needsUpdate = true;
  }
  vmCase(c, i, cam) {
    const k = _s.setFromMatrixColumn(c.vm.matrix, 0).length();
    this.cases.setMatrixAt(i, _m4.compose(_a.copy(c.p).applyMatrix4(c.vm.matrix), _q.copy(cam.quaternion).multiply(c.q), _s.set(k, k, k)));
  }
  dropMag(mw, M) {
    const g = magazineModel(M); g.matrixAutoUpdate = false; g.matrix.copy(mw); this.scene.add(g);
    const p = V3(), q = new THREE.Quaternion(); mw.decompose(p, q, _s);
    if (this.mags.length >= 6) { const o = this.mags.shift(); this.scene.remove(o.g); }
    this.mags.push({ g, p, q, v: V3(0, -1, 0), w: V3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), rest: false, hit: false });
  }
  puff(p, r0, life, color, alpha = 0.7, v = null) {
    const m = new THREE.Mesh(this.quad, this.puffMat.clone()); m.material.color.set(color); m.material.opacity = alpha;
    m.position.copy(p); m.frustumCulled = false; this.scene.add(m);
    if (this.puffs.length > 60) { const o = this.puffs.shift(); this.scene.remove(o.m); o.m.material.dispose(); }
    this.puffs.push({ m, r0, life, age: 0, a0: alpha, v: v ?? V3(0, 0.25, 0) });
  }
  // a round's end: the mark, the puff (what it hit), the sound from there (flight time + the sound's way back)
  impact(h, eye, ctx, audio) {
    const tag = h.tag, snow = (ctx.snow ?? 0) > 0.5 && (tag === 'ground' || h.n.y > 0.7);
    const metal = tag === 'car' || tag === 'cross' || tag === 'pole' || tag === 'gate';
    const wood = tag === 'tree' || tag === 'fence';
    const col = snow ? 0xf2f4f8 : tag === 'ground' ? 0x7a6650 : wood ? 0x6b5640 : metal ? 0x9a9a9a : 0xb8b2a8;
    const at = h.p.clone().addScaledVector(h.n, 0.02);
    if (metal) for (let k = 0; k < 7; k++) this.spark(at, h.n);
    else { this.puff(at, 0.04, 0.45, col, 0.85, h.n.clone().multiplyScalar(0.9)); this.puff(at, 0.08, 1.1, col, 0.55, h.n.clone().multiplyScalar(0.35).add(V3(0, 0.15, 0))); }
    if (!metal) this.mark(h.p, h.n, tag === 'ground' ? (snow ? 0.035 : 0.05) : 0.016);
    const d = eye.distanceTo(h.p);
    audio?.bulletHit?.(metal ? 'metal' : wood ? 'wood' : tag === 'ground' ? 'ground' : 'hard', d, h.t + d / 343);
  }
  spark(p, n) {
    const m = new THREE.Mesh(this.quad, this.sparkMat); m.position.copy(p); m.frustumCulled = false; this.scene.add(m);
    const v = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4).addScaledVector(n, 3);
    if (this.sparks.length > 80) { const o = this.sparks.shift(); this.scene.remove(o.m); }
    this.sparks.push({ m, v, age: 0, life: 0.12 + Math.random() * 0.12 });
  }
  mark(p, n, size) {
    const i = this.mi++ % 120;
    _q.setFromUnitVectors(V3(0, 0, 1), n); _q2.setFromAxisAngle(V3(0, 0, 1), Math.random() * 6.28); _q.multiply(_q2);
    this.marks.setMatrixAt(i, _m4.compose(_a.copy(p).addScaledVector(n, 0.003), _q, _s.set(size, size, size)));
    this.marks.count = Math.min(120, Math.max(this.marks.count, i + 1)); this.marks.instanceMatrix.needsUpdate = true;
  }
  update(dt, ctx) {
    const world = ctx.world, cam = ctx.camera;
    // the cases: thrown, spinning, bouncing on the ground, then lying there (~40 s)
    let n = 0;
    for (const c of this.cs) {
      c.age += dt;
      if (c.vm) {
        // (in the hands' frame: the camera's, gravity turned into it; until out of sight through their lens)
        _q.copy(cam.quaternion).invert();
        c.v.addScaledVector(_v.set(0, -G, 0).applyQuaternion(_q), dt); c.p.addScaledVector(c.v, dt);
        _q.setFromEuler(_e.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)); c.q.multiply(_q);
        const z = -c.p.z, tv = Math.tan(VM_FOV * Math.PI / 360) * 1.1, th = tv * cam.aspect;
        if (c.vm.visible && c.age < 0.4 && z > 0.02 && Math.abs(c.p.y) < z * tv && Math.abs(c.p.x) < z * th) { c.i = n; this.vmCase(c, n++, cam); continue; }
        // (out of sight: on into the world from where it is through the lens, at its own speed)
        c.p.applyMatrix4(c.vm.matrix); c.v.applyQuaternion(cam.quaternion); c.q.premultiply(cam.quaternion); c.vm = null;
      }
      if (!c.rest) {
        c.v.y -= G * dt; c.p.addScaledVector(c.v, dt);
        _q.setFromEuler(_e.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)); c.q.multiply(_q);
        const gy = world.groundHeight(c.p.x, c.p.z, c.p.y + 0.3) + 0.005;
        if (c.p.y < gy) {
          c.p.y = gy;
          if (!c.hit) { c.hit = true; ctx.audio?.caseTink?.(cam.position.distanceTo(c.p)); }
          if (Math.abs(c.v.y) < 0.6) { c.rest = true; c.q.setFromEuler(_e.set(Math.PI / 2, Math.random() * 6.28, 0)); }
          else { c.v.y = -c.v.y * 0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); }
        }
      }
      this.cases.setMatrixAt(n++, _m4.compose(c.p, c.q, ONE));
    }
    this.cs = this.cs.filter(c => c.age < 40);
    this.cases.count = n; this.cases.instanceMatrix.needsUpdate = true;
    // the dropped magazines: fall, a bounce, lie on their side
    for (const m of this.mags) {
      if (m.rest) continue;
      m.v.y -= G * dt; m.p.addScaledVector(m.v, dt);
      _q.setFromEuler(_e.set(m.w.x * dt, m.w.y * dt, m.w.z * dt)); m.q.multiply(_q);
      const gy = world.groundHeight(m.p.x, m.p.z, m.p.y + 0.3) + 0.012;
      if (m.p.y < gy) {
        m.p.y = gy;
        if (!m.hit) { m.hit = true; ctx.audio?.magDrop?.(cam.position.distanceTo(m.p)); }
        if (Math.abs(m.v.y) < 0.8) { m.rest = true; m.q.setFromEuler(_e.set(0, Math.random() * 6.28, Math.PI / 2)); }
        else { m.v.y = -m.v.y * 0.25; m.w.multiplyScalar(0.4); }
      }
      m.g.matrix.compose(m.p, m.q, ONE); m.g.matrixWorldNeedsUpdate = true;
    }
    // the puffs: swell and fade, facing you
    for (const p of this.puffs) {
      p.age += dt; const f = p.age / p.life;
      p.m.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.max(0, 1 - 3 * dt));
      const s = p.r0 * (1 + 4 * Math.sqrt(f)); p.m.scale.set(s, s, s); p.m.quaternion.copy(cam.quaternion);
      p.m.material.opacity = p.a0 * Math.max(0, 1 - f) * Math.max(0, 1 - f);
    }
    for (const p of this.puffs) if (p.age >= p.life) { this.scene.remove(p.m); p.m.material.dispose(); }
    this.puffs = this.puffs.filter(p => p.age < p.life);
    for (const s of this.sparks) {
      s.age += dt; s.v.y -= G * dt; s.m.position.addScaledVector(s.v, dt);
      const L = Math.min(0.08, s.v.length() * 0.012); s.m.scale.set(0.004, L, 1);
      s.m.quaternion.copy(cam.quaternion);
      s.m.visible = s.age < s.life;
    }
    for (const s of this.sparks) if (s.age >= s.life) this.scene.remove(s.m);
    this.sparks = this.sparks.filter(s => s.age < s.life);
  }
}
function markTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(10,9,8,1)'); rg.addColorStop(0.25, 'rgba(25,22,20,0.95)'); rg.addColorStop(0.5, 'rgba(60,55,50,0.6)'); rg.addColorStop(1, 'rgba(90,85,80,0)');
  g.fillStyle = rg; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, r = 22 + 8 * Math.sin(k * 2.7) * Math.cos(k * 1.3); g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the first-round flash: a hot core, an orange glow and a few short tongues of flame
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.25, 'rgba(255,170,70,0.8)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 7; i++) {
    const a = (i + Math.random() * 0.5) / 7 * Math.PI * 2, l = 18 + Math.random() * 12, x = 32 + Math.cos(a) * l, y = 32 + Math.sin(a) * l;
    const lg = g.createLinearGradient(32, 32, x, y);
    lg.addColorStop(0, 'rgba(255,200,120,0.7)'); lg.addColorStop(1, 'rgba(255,120,40,0)');
    g.strokeStyle = lg; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 32); g.lineTo(x, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- the counter (the rounds in the gun, the rest, the fire mode) and the crosshair, the way Call of Duty shows them
class GunHud {
  constructor() {
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:26px;bottom:22px;color:#fff;font:600 13px system-ui,sans-serif;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.8);pointer-events:none;display:none;z-index:20';
    el.innerHTML = '<div style="opacity:.85;letter-spacing:.06em">GLOCK 18 · <span data-k="mode"></span></div><div><span data-k="mag" style="font-size:38px;font-weight:700"></span><span style="font-size:20px;opacity:.75"> / <span data-k="res"></span></span></div><div data-k="hint" style="color:#ffd27a;min-height:16px"></div><div data-k="rng" style="font-size:11px;font-weight:600;opacity:.88;letter-spacing:.03em"></div>';
    document.body.appendChild(el);
    this.k = Object.fromEntries([...el.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e]));
    const x = this.x = document.createElement('div');
    x.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;pointer-events:none;display:none;z-index:20';
    x.innerHTML = [0, 1, 2, 3].map(i => `<div data-i="${i}" style="position:absolute;background:rgba(255,255,255,.85);box-shadow:0 0 2px rgba(0,0,0,.8)"></div>`).join('');
    document.body.appendChild(x);
    this.bars = [...x.children];
    this.flashT = 0; this.last = '';
    // (V89) the hit marker: four short strokes on the diagonals round the middle - white a hit, red a kill, bigger for a
    // head - gone in a quarter of a second (a kill's in half); the score beside it (+100 ...), the medal above, the feed
    // on the left; under the dot the games' prompts: low on rounds, reload, none
    const mk = (css, html = '') => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;pointer-events:none;' + css; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.hm = mk('left:50%;top:50%;width:0;height:0;z-index:21;opacity:0', [45, 135, 225, 315].map(a => `<div style="position:absolute;left:-1px;top:0;width:2px;height:8px;transform-origin:1px 0;transform:rotate(${a}deg) translateY(6px);background:currentColor;box-shadow:0 0 2px rgba(0,0,0,.9)"></div>`).join(''));
    this.sc = mk('left:calc(50% + 34px);top:calc(50% + 12px);z-index:21;opacity:0;font:700 20px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85);white-space:nowrap');
    this.md = mk('left:50%;top:22%;transform:translateX(-50%);z-index:21;opacity:0;text-align:center;font:800 18px system-ui,sans-serif;color:#ffe9a8;letter-spacing:.08em;text-shadow:0 2px 6px rgba(0,0,0,.9);white-space:nowrap');
    this.fd = mk('left:14px;top:46%;z-index:20;font:600 12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.9)');
    this.wn = mk('left:50%;top:calc(50% + 40px);transform:translateX(-50%);z-index:20;font:700 12px system-ui,sans-serif;letter-spacing:.12em;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap');
    this.touchUI = matchMedia('(pointer: coarse)').matches;
    this.hmT = -1e9; this.hmK = 0; this.scT = -1e9; this.scPts = 0; this.scLines = []; this.mdT = -1e9; this.feeds = []; this.wnS = ''; this.rngS = '';
  }
  hit(kill, head) {
    this.hmT = performance.now(); this.hmK = kill ? (head ? 3 : 2) : 1;
    this.hm.style.color = kill ? '#ff3b30' : '#ffffff';
  }
  // (a kill's points add up while they keep coming, ~1.6 s)
  score(pts, lines) {
    const now = performance.now();
    if (now - this.scT > 1600) { this.scPts = 0; this.scLines = []; }
    this.scT = now; this.scPts += pts; this.scLines = [...lines, ...this.scLines].slice(0, 4);
    this.sc.innerHTML = '+' + this.scPts + '<div style="font:700 11px system-ui,sans-serif;color:#f2e6b8;letter-spacing:.06em;line-height:1.35">' + this.scLines.join('<br>') + '</div>';
  }
  medal(name) {
    this.mdT = performance.now();
    this.md.innerHTML = '<div style="width:44px;height:44px;margin:0 auto 6px;border-radius:50%;border:3px solid #e8c25a;background:radial-gradient(circle,#6a5822 0,#2a220c 72%);box-shadow:0 0 14px rgba(232,194,90,.55)"></div>' + name;
  }
  feed(text) {
    const d = document.createElement('div');
    d.style.cssText = 'background:rgba(10,12,14,.5);padding:3px 8px;margin-bottom:3px;border-radius:2px;transition:opacity .4s';
    d.innerHTML = 'TU <span style="color:#c9c9c9">▸ GLOCK 18 ▸</span> ' + text;
    this.fd.prepend(d); this.feeds.unshift({ d, t: performance.now() });
    while (this.feeds.length > 4) this.feeds.pop().d.remove();
  }
  warn(rounds, res) {
    const [txt, col] = rounds < 0 ? ['', ''] : rounds === 0 ? (res > 0 ? [(this.touchUI ? '' : '[R] ') + 'REÎNCARCĂ', '#ff5a4a'] : ['FĂRĂ MUNIȚIE', '#ff5a4a']) : rounds <= 10 ? ['MUNIȚIE PUȚINĂ', '#ffd24a'] : ['', ''];
    const k = txt + col; if (k === this.wnS) return; this.wnS = k;
    this.wn.textContent = txt; this.wn.style.color = col;
  }
  range(r) {
    const t = r ? 'POLIGON · doborâte: ' + r.kills + ' · precizie: ' + (r.shots ? Math.round(100 * Math.min(1, r.hits / r.shots)) : 0) + '% · în cap: ' + r.heads + ' · ' + r.xp + ' XP' : '';
    if (t !== this.rngS) { this.rngS = t; this.k.rng.textContent = t; }
  }
  tick() {
    const now = performance.now();
    const a = now - this.hmT, life = this.hmK > 1 ? 480 : 260;
    if (a < life) { const u = a / life; this.hm.style.opacity = String(1 - u * u); this.hm.style.transform = 'scale(' + ((this.hmK === 3 ? 1.45 : this.hmK === 2 ? 1.2 : 1) * (1 + 0.25 * Math.max(0, 1 - a / 60))).toFixed(3) + ')'; }
    else if (this.hm.style.opacity !== '0') this.hm.style.opacity = '0';
    const b = now - this.scT;
    this.sc.style.opacity = b < 1600 ? String(Math.min(1, (1600 - b) / 300)) : '0';
    const c = now - this.mdT;
    this.md.style.opacity = c < 2200 ? String(Math.min(1, c / 120, (2200 - c) / 400)) : '0';
    for (let i = this.feeds.length - 1; i >= 0; i--) { const f = this.feeds[i]; if (now - f.t > 5000) { f.d.remove(); this.feeds.splice(i, 1); } else if (now - f.t > 4600) f.d.style.opacity = '0'; }
  }
  show(on) { this.el.style.display = on ? 'block' : 'none'; if (!on) { this.x.style.display = 'none'; this.warn(-1, 0); } }
  // the touch screen's buttons for it (index.html: fire, aim, reload, the selector, put it away), while it is yours on
  // foot; the screen's own dot hidden while you aim down the sights (the sights are the aim)
  touch(on) { if (on === this.touchOn) return; this.touchOn = on; document.getElementById('gunTouch')?.classList.toggle('on', on); }
  aim(on) { if (on === this.aimOn) return; this.aimOn = on; const c = document.getElementById('cross'); if (c) c.style.visibility = on ? 'hidden' : ''; }
  set(mag, res, auto, hint) {
    if (performance.now() < (this.flashUntil ?? 0)) hint = this.flashText;
    const s = mag + '|' + res + '|' + auto + '|' + hint;
    if (s === this.last) return; this.last = s;
    this.k.mag.textContent = mag; this.k.mag.style.color = mag <= 6 ? '#ff6b5a' : '#fff';
    this.k.res.textContent = res; this.k.mode.textContent = auto ? 'AUTOMAT' : 'FOC CU FOC'; this.k.hint.textContent = hint;
  }
  flash(text) { this.flashText = text; this.flashUntil = performance.now() + 1200; this.last = ''; }
  cross(on, spread, fov) {
    this.x.style.display = on ? 'block' : 'none';
    if (!on) return;
    // (the gap: where the spread's edge falls on the screen, at the view's own field of view)
    const g = Math.round(4 + innerHeight / 2 * Math.tan(spread / 2) / Math.tan(fov * Math.PI / 360));
    const L = 9, W = 2;
    const set = (b, x, y, w, h) => { b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = w + 'px'; b.style.height = h + 'px'; };
    set(this.bars[0], -W / 2, -g - L, W, L); set(this.bars[1], -W / 2, g, W, L); set(this.bars[2], -g - L, -W / 2, L, W); set(this.bars[3], g, -W / 2, L, W);
  }
}
