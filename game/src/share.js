// The world you and a friend share (multiplayer): the animals of the woods (wildlife.js), the birds (birds.js), the bear
// of the hill (bear.js), the villager on the street (npc.js), the lightning (night.js), the forest scene (forest.js) and
// the walkers' clip (hikers.js), and the dogs in the yard (dogs.js). One game runs them for both - the host: whoever
// was in the room first (net.js elects it) - and they mind whichever of you is nearest; it sends them with its player
// ~15 times a second, and the other game draws them where the host has them, 120 ms in the past like the players
// (follow()), so you both see the same fox in the same place doing the same thing. If the host leaves, or its tab
// sleeps, the other game takes over the world it has, as it is.
const lerp = (a, b, k) => a + (b - a) * k;

export class Share {
  // parts: { wildlife, birds, bear, walkers, lightning, forest, hikers, dogs }
  constructor(parts) {
    Object.assign(this, parts);
    this.role = 'solo'; this.ppl = [];
    for (const o of [this.wildlife, this.birds]) o.idBase = 100000;
    this.knock = 0; this.knocks = new Map();             // the villager knocked down by a friend's car: told to the host
    this.pet = 0; this.pets = new Map();                 // a dog petted
  }
  // everyone the world minds: you (me) first, then the friends in the room now (net.js live), as the animals see them
  people(me, net) {
    const out = [me];
    for (const r of net.live) {
      const s = r.now;
      if (!s) continue;
      out.push({ x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.a[0], car: s.f !== 0, run: s.f === 0 && r.speed > 4, torch: !!(s.o & 1), peer: r.peer });
    }
    return (this.ppl = out);
  }
  // the friends' heads, for the dogs to look at
  heads() { return this.ppl.slice(1).map(p => ({ x: p.x, y: p.y + 1.6, z: p.z })); }
  // a new role (net.js): the host's world comes in place of ours, or ours goes on from what the host had
  setRole(role, net) {
    if (role === this.role) return;
    const was = this.role; this.role = role;
    const base = Math.max(1, net.hostE) * 100000;         // (each host numbers its groups apart from the one before)
    for (const o of [this.wildlife, this.birds]) { o.idBase = base; o.seq = 0; }
    const guest = role === 'guest';
    for (const w of this.walkers) w.puppet = guest;
    this.lightning.puppet = guest;
    if (this.bear) this.bear.puppet = guest;
    if (guest) { this.wildlife.clear(); this.birds.clear(); }
    else if (was === 'guest') { this.wildlife.adopt(); this.birds.adopt(); this.bear?.adopt(); }
  }
  // the host's world for the friend's game, within budget bytes (the birds farthest from you both give way first, then
  // the animals: the platform keeps a player's whole presence under 4 KiB)
  encode(budget) {
    const z = { a: this.wildlife.encode(), f: this.birds.encode(), w: this.walkers.map(w => [Math.round(w.x * 10), Math.round(w.z * 10), w.dir, Math.round(Math.max(0, w.down) * 10)]),
      l: this.lightning.bolt ?? 0, s: this.forest.encode(), h: this.hikers.encode() };
    if (this.bear) z.b = this.bear.encode();
    budget -= 24;                                        // (the snapshot's time, added by net.js)
    if (JSON.stringify(z).length > budget) {
      const far = (x, zz) => Math.min(...this.ppl.map(p => Math.hypot(p.x - x, p.z - zz)));
      z.f.sort((a, b) => far(a[2] / 10, a[3] / 10) - far(b[2] / 10, b[3] / 10));
      z.a.sort((a, b) => far(a[4][0] / 10, a[4][1] / 10) - far(b[4][0] / 10, b[4][1] / 10));
      while (JSON.stringify(z).length > budget && (z.f.length || z.a.length)) (z.f.length ? z.f : z.a).pop();
    }
    return z;
  }
  // the host's world here (st: as wildlife.update's; net: its snapshots); false while none has come yet
  follow(dt, t, st, net) {
    const Z = net.zNow;
    if (!Z) return false;
    const [A, B, k] = Z;
    this.wildlife.follow(A.a ?? [], B.a ?? [], k, dt, t, st);
    this.birds.follow(A.f ?? [], B.f ?? [], k, dt, t, st);
    if (this.bear && Array.isArray(B.b)) this.bear.follow(Array.isArray(A.b) ? A.b : B.b, B.b, k, dt, t, st, net.myPeer);
    (B.w ?? []).forEach((wb, i) => {
      const w = this.walkers[i], wa = A.w?.[i] ?? wb;
      if (w) w.follow(lerp(wa[0], wb[0], k) / 10, lerp(wa[1], wb[1], k) / 10, wb[2], wb[3] / 10, dt);
    });
    this.lightning.follow(B.l);
    return true;
  }
  // the two scenes at the host's clock
  scenes(dt, forestCtx, hikersCtx, net) {
    const Z = net.zNow;
    if (!Z) return;
    const [A, B, k] = Z;
    if (Array.isArray(B.s)) this.forest.follow(Array.isArray(A.s) ? A.s : B.s, B.s, k, dt, forestCtx);
    if (Array.isArray(B.h)) this.hikers.follow(Array.isArray(A.h) ? A.h : B.h, B.h, k, dt, hikersCtx);
  }
  // this game's car knocked the villager i, while the host runs him: tell it (net.js k)
  knocked(net, i, car, push) {
    net.publish({ k: [++this.knock, i, Math.round(car.vx * 10), Math.round(car.vz * 10), Math.round(push.x * 100), Math.round(push.z * 100)] });
  }
  // a dog petted here: the friend's dog wags too (net.js g)
  petted(net, i) { net.publish({ g: [++this.pet, i] }); }
  // what the friends did here (each frame): their knocks, if we run the world; their petting, always
  events(net) {
    for (const r of net.live) {
      const k = r.pres?.k, g = r.pres?.g, ks = Array.isArray(k) ? k[0] : 0, gs = Array.isArray(g) ? g[0] : 0;
      // (what they did before we saw them is not done again)
      if (!this.knocks.has(r.peer)) { this.knocks.set(r.peer, ks); this.pets.set(r.peer, gs); continue; }
      if (ks !== this.knocks.get(r.peer)) {
        this.knocks.set(r.peer, ks);
        if (this.role === 'host') this.walkers[k[1]]?.hit({ vx: k[2] / 10, vz: k[3] / 10 }, { x: k[4] / 100, z: k[5] / 100 });
      }
      if (gs !== this.pets.get(r.peer)) { this.pets.set(r.peer, gs); if (this.dogs.dogs[g[1]]) this.dogs.pet(this.dogs.dogs[g[1]]); }
    }
  }
}
