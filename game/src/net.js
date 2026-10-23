// Multiplayer (alpha): you and a friend in the same world, each in their own copy of the game.
// Each game tells the other about its player about 15 times a second, as its `presence` in a room of the claude.ai
// artifact (the `room` capability: whoever has the page open right now). The platform admits to a room only people
// signed in to claude.ai whom the artifact is shared with - its owner and those invited to it - never visitors by a
// public link; nothing goes through a server of ours and nothing is stored. A named room ("strada-" + the code both type
// in the menu) keeps two groups apart. Outside claude.ai (a local copy of the game) the tabs of one browser find each
// other through a BroadcastChannel instead: the same game, for trying it out.
// What travels (presence, latest wins per field):
//   s: the player now - { t (the sender's clock, ms), f (0 on foot, 1 driving, 2 a passenger), p [x, y, z], a [yaw,
//      pitch], o (1: the torch on), v (the car's key), c [x, z, h, pitch, roll, steer, spin, speed, lights, brake, rpm,
//      throttle, horn] }
//   n: a nickname (outside claude.ai; in it the name is the viewer's own, resolved by the platform)
//   w: the weather and the hour { k, h, st }: whoever changed them last sets them for both (st: when; until someone
//      changes them, the one who came first keeps theirs)
//   c: the cars this game moved (driven away, pushed) [[key, x, z, h, st], ...]: a friend who comes later finds them
//   e: this game's claim to run the world (share.js): 0 until it has been alone in the room a moment, then 1; one more
//      than any seen when it takes the world over. The world's host is the live player with the highest (ties: the
//      lowest peer), so whoever came first keeps it, and a player whose tab sleeps hands it on
//   z: the world, from its host only: the animals, the birds, the bear, the villager, the lightning, the scenes (share.js)
//   k: a knock this game gave the villager (its car), for the host to apply [seq, i, vx, vz, px, pz]
// The other's state is drawn ~120 ms in the past, between the two updates around that moment (snapshot interpolation),
// so it moves smoothly whatever the network's jitter.
const SEND_DT = 1 / 15, DELAY = 120, KEEP = 1500;
const LIVE = 3000;                                       // ms: a player silent this long is away (a sleeping tab)
const BUDGET = 3900;                                     // bytes: the whole presence object stays under the platform's 4 KiB
const enc = new TextEncoder(), bytes = (o) => enc.encode(JSON.stringify(o)).length;
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
const lerp = (a, b, k) => a + (b - a) * k, lerpA = (a, b, k) => a + wrap(b - a) * k;
// (presence strings must be free of control and invisible characters: the platform refuses the whole object otherwise)
export const clean = (t, n) => String(t ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ue000-\uf8ff]/g, '').trim().slice(0, n);

// the same calls as the claude.ai room's (presence / peers / onPeers / connected / leave), between the tabs of one browser
function localRoom(name) {
  const ch = new BroadcastChannel('strada-mp:' + name), me = 'l' + Math.random().toString(36).slice(2, 10);
  const others = new Map(), fns = new Set();
  let mine = {}, dirty = true, seen = performance.now();
  const peerOf = (id, presence, updatedAt, self) => Object.freeze({ peer: id, by: null, isMe: self, sameTab: self, kind: 'viewer', guest: false, presence: Object.freeze(presence), updatedAt });
  let snapshot = [peerOf(me, {}, Date.now(), true)];
  const rebuild = (joined = [], left = [], updated = []) => {
    snapshot = Object.freeze([peerOf(me, mine, Date.now(), true), ...[...others.values()].map(o => o.peer)]);
    for (const f of fns) f({ peers: snapshot, joined, left, updated });
  };
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.id === me) return;
    if (m.bye) { const o = others.get(m.id); if (o) { others.delete(m.id); rebuild([], [o.peer]); } return; }
    const was = others.get(m.id), peer = peerOf(m.id, m.p, Date.now(), false);
    others.set(m.id, { peer, at: performance.now() });
    if (!was) { ch.postMessage({ id: me, p: mine }); rebuild([peer]); } else rebuild([], [], [peer]);   // (a newcomer hears us at once)
  };
  const tick = setInterval(() => {
    const now = performance.now();
    if (dirty || now - seen > 1000) { ch.postMessage({ id: me, p: mine }); dirty = false; seen = now; }   // (~30 a second at most; a keepalive)
    // (gone after 15 s of silence: a tab busy drawing a long frame hears its queued messages late)
    for (const [id, o] of others) if (now - o.at > 15000) { others.delete(id); rebuild([], [o.peer]); }
  }, 33);
  const bye = () => ch.postMessage({ id: me, bye: true });
  addEventListener('pagehide', bye);
  return {
    name,
    presence(patch) { mine = { ...mine }; for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; } dirty = true; return Promise.resolve(); },
    peers: () => snapshot,
    onPeers(fn) { fns.add(fn); queueMicrotask(() => fn({ peers: snapshot, joined: snapshot, left: [], updated: [] })); return () => fns.delete(fn); },
    connected: () => true,
    leave() { clearInterval(tick); removeEventListener('pagehide', bye); bye(); ch.close(); fns.clear(); return Promise.resolve(); },
  };
}

// one other player: their updates, and where they are now on our clock
class Remote {
  constructor(peer) {
    this.peer = peer; this.buf = []; this.offs = []; this.offset = null; this.lastT = null;
    this.name = ''; this.by = null; this.guest = false; this.pres = null;
    this.now = null;                                     // the interpolated state (sample())
    this.zb = []; this.lastZ = null;                     // the world, if they run it
    this.lastRecv = null; this.speed = 0;
  }
  push(s, recv) {
    if (typeof s?.t !== 'number' || s.t === this.lastT) return;
    if (this.lastT !== null && s.t < this.lastT) this.buf.length = 0;    // (their page reloaded: a new clock)
    this.lastT = s.t;
    this.buf.push(s);
    while (this.buf.length > 2 && this.buf[1].t < s.t - KEEP) this.buf.shift();
    this.clock(s.t, recv);
  }
  // (arrival minus their clock: the smallest over the last 4 s is the least delayed path, the timeline's anchor)
  clock(t, recv) {
    this.offs.push([recv - t, recv]);
    while (this.offs.length && this.offs[0][1] < recv - 4000) this.offs.shift();
    this.offset = Math.min(...this.offs.map(o => o[0]));
  }
  pushZ(z, recv) {
    if (typeof z?.t !== 'number' || z.t === this.lastZ) return;
    if (this.lastZ !== null && z.t < this.lastZ) this.zb.length = 0;
    this.lastZ = z.t;
    this.zb.push(z);
    while (this.zb.length > 2 && this.zb[1].t < z.t - KEEP) this.zb.shift();
    this.clock(z.t, recv);
  }
  // their world as it was DELAY ms ago, like their player: the two snapshots around then and how far between
  sampleZ(now) {
    const b = this.zb;
    if (!b.length || this.offset === null) return null;
    const tr = now - DELAY - this.offset;
    let i = b.length - 1;
    while (i > 0 && b[i].t > tr) i--;
    const A = b[i], B = b[i + 1];
    return B && tr >= A.t ? [A, B, Math.min(1, (tr - A.t) / Math.max(1, B.t - A.t))] : [A, A, 0];
  }
  // their state as it was DELAY ms ago (their clock), between the two updates around then; past the last one, a little
  // further along its motion (at most 0.25 s), then still
  sample(now) {
    const b = this.buf;
    if (!b.length || this.offset === null) return null;
    const tr = now - DELAY - this.offset;
    let i = b.length - 1;
    while (i > 0 && b[i].t > tr) i--;
    const A = b[i], B = b[i + 1];
    if (B && B.f === A.f && B.v === A.v && tr >= A.t) return mix(A, B, (tr - A.t) / Math.max(1, B.t - A.t));
    if (!B && i > 0 && b[i - 1].f === A.f && b[i - 1].v === A.v) {
      const P = b[i - 1], k = Math.min(250, Math.max(0, tr - A.t)) / Math.max(1, A.t - P.t);
      return mix(A, A, 0, P, k);
    }
    return mix(A, A, 0);
  }
}
// a state between A and B (k 0..1); with P, A moved on along P -> A by k of that step
function mix(A, B, k, P = null, ke = 0) {
  const out = { f: A.f, v: A.v, o: A.o | 0, p: [0, 0, 0], a: [0, 0], c: A.c ? A.c.slice() : null };
  for (let j = 0; j < 3; j++) out.p[j] = P ? A.p[j] + (A.p[j] - P.p[j]) * ke : lerp(A.p[j], B.p[j], k);
  out.a[0] = P ? A.a[0] + wrap(A.a[0] - P.a[0]) * ke : lerpA(A.a[0], B.a[0], k);
  out.a[1] = P ? A.a[1] : lerp(A.a[1], B.a[1], k);
  if (A.c && (B.c || P?.c)) {
    const c = out.c, Q = P ? P.c : null, C = B.c;
    for (const j of [0, 1, 3, 4, 5, 7]) c[j] = Q ? A.c[j] + (A.c[j] - Q[j]) * ke : lerp(A.c[j], C[j], k);
    for (const j of [2, 6]) c[j] = Q ? A.c[j] + wrap(A.c[j] - Q[j]) * ke : lerpA(A.c[j], C[j], k);
  }
  return out;
}

export class Net {
  constructor() {
    this.room = null; this.kind = 'off'; this.status = 'oprit'; this.code = ''; this.nick = '';
    this.remotes = new Map();                           // peer -> Remote
    this.user = null; this.names = new Map();
    this.sendT = 0; this.myPeer = null;
    this.world = { k: null, h: null, st: -Date.now() }; this.adopting = false; this.onWorld = null;
    this.cars = []; this.carsT = 0; this.carsDirty = false;
    this.epoch = 0;
    this.mine = {};                                     // our presence as the others have it (its size: BUDGET)
    this.hostE = 0; this.seenE = 0; this.connT = 0; this.role = 'solo'; this.host = null; this.live = []; this.zNow = null;
  }
  // join the room of this code (again, after the code changes)
  async start(code, nick) {
    const epoch = ++this.epoch;
    if (this.room) { const r = this.room; this.room = null; this.remotes.clear(); await r.leave?.().catch(() => {}); }
    this.code = code; this.nick = nick;
    const name = ('strada-' + String(code).toLowerCase().replace(/[^a-z0-9_.-]/g, '')).slice(0, 48);
    this.status = 'se conectează…';
    let room = null, kind = 'off';
    if (window.claude?.use) {
      const lobby = await window.claude.use('room').catch(() => null);
      if (lobby) {
        // a transient failure is retried; only a room the platform refuses falls back to the lobby
        for (let i = 0; i < 4 && !room; i++) {
          try { room = await lobby.join(name); } catch (e) {
            if (e?.code !== 'upstream_error' && e?.code !== 'limit_reached') { room = lobby; break; }
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            if (epoch !== this.epoch) return;
          }
        }
        if (room) kind = 'claude';
        this.user = await window.claude.use('user').catch(() => null);
      }
    }
    // inside claude.ai without a room (a public link, signed out, or the page opened on its own): say so
    this.note = window.claude?.use && !room ? 'claude.ai nu a deschis camera' : '';
    if (!room && typeof BroadcastChannel !== 'undefined') { room = localRoom(name); kind = 'local'; }
    if (epoch !== this.epoch) { room?.leave?.(); return; }
    this.room = room; this.kind = kind;
    if (!room) { this.status = 'indisponibil'; return; }
    this.status = 'conectat'; this.connT = performance.now(); this.mine = {}; this.role = 'solo'; this.host = null;
    room.onPeers((ch) => { if (epoch === this.epoch) this.peersChanged(ch); }, (e) => {
      if (epoch !== this.epoch) return;
      this.status = 'întrerupt (' + e.code + ')';
      // a named room lost after a reconnect: join it again (the platform says so, unless not permitted)
      if (kind === 'claude' && room.leave && ['upstream_error', 'limit_reached'].includes(e.code))
        setTimeout(() => { if (epoch === this.epoch) { this.room = null; this.start(this.code, this.nick); } }, 3000);
    });
    this.publish({ n: clean(nick, 24), w: this.world, c: this.cars });
  }
  publish(patch) {
    if (!this.room) return;
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete this.mine[k]; else this.mine[k] = v; }
    this.room.presence(patch).catch(() => {});
  }
  peersChanged({ peers, left }) {
    const now = performance.now();
    for (const p of peers) {
      if (p.sameTab) { this.myPeer = p.peer; continue; }
      if (p.kind !== 'viewer') continue;
      let r = this.remotes.get(p.peer);
      if (!r) { r = new Remote(p.peer); this.remotes.set(p.peer, r); }
      if (p.presence === r.pres) continue;
      r.pres = p.presence; r.by = p.by; r.guest = p.guest; r.lastRecv = now;
      const pr = p.presence || {};
      if (pr.s) r.push(pr.s, now);
      if (pr.z) r.pushZ(pr.z, now);
      if (Number.isFinite(pr.e)) this.seenE = Math.max(this.seenE, pr.e);
      r.nick = typeof pr.n === 'string' ? pr.n.slice(0, 24) : '';
      // the weather and the hour: theirs, if set later than ours
      const w = pr.w;
      if (w && typeof w.k === 'string' && typeof w.st === 'number' && w.st > this.world.st) {
        this.world = { k: w.k, h: w.h, st: w.st };
        this.adopting = true; try { this.onWorld?.(w.k, w.h); } finally { this.adopting = false; }
        this.publish({ w: this.world });
      }
      if (Array.isArray(pr.c)) r.cars = pr.c;
      if (this.user && p.by && !this.names.has(p.by)) {
        this.names.set(p.by, '');
        this.user.profiles([p.by]).then(ps => this.names.set(p.by, ps?.[p.by]?.name || '')).catch(() => {});
      }
    }
    for (const p of left) this.remotes.delete(p.peer);
  }
  nameOf(r) { return (r.by && this.names.get(r.by)) || r.nick || 'Prieten'; }
  // this game changed the weather or the hour (not while taking the other's)
  worldChanged(k, h) {
    this.world = { k, h, st: this.adopting ? this.world.st : Date.now() };
    if (!this.adopting) this.publish({ w: this.world });
  }
  // the cars this game moved (key, pose, when): sent when they change, at most once a second
  carsMoved(list) { this.cars = list; this.carsDirty = true; }
  // who runs the world (share.js): 'solo' (nobody else here), 'host' (we do, for them too) or 'guest' (this.host does)
  elect(now) {
    const live = this.live = [...this.remotes.values()].filter(r => r.lastRecv !== null && now - r.lastRecv < LIVE);
    const was = this.role;
    let role = 'solo', best = null;
    if (live.length && this.myPeer) {
      let e = this.hostE, peer = this.myPeer;
      for (const r of live) {
        const re = Number.isFinite(r.pres?.e) ? r.pres.e : 0;
        if (re > e || (re === e && r.peer < peer)) { best = r; e = re; peer = r.peer; }
      }
      role = best ? 'guest' : 'host';
    }
    this.host = best;
    // (alone a moment after joining: we hold the world; taking it over from a host who left: above any claim seen)
    let e = this.hostE;
    if (was === 'guest' && role !== 'guest') e = Math.max(e, this.seenE + 1);
    if (e < 1 && (role === 'host' || (role === 'solo' && now - this.connT > 2500))) e = 1;
    if (e !== this.hostE) { this.hostE = e; this.publish({ e }); }
    this.role = role;
    return role;
  }
  // our player now (about 15 times a second) and, hosting, the world (world(budget): share.js); everyone else's
  // interpolated state, and the host's world
  update(dt, me, world = null) {
    if (!this.room) return;
    const now = performance.now();
    this.elect(now);
    this.sendT -= dt;
    if (this.sendT <= 0 && me) {
      this.sendT = SEND_DT;
      const s = { t: Math.round(now), f: me.f, p: me.p.map(r2), a: [r3(me.a[0]), r3(me.a[1])] };
      if (me.o) s.o = me.o;
      if (me.v) { s.v = me.v; if (me.c) s.c = me.c.map((x, i) => i === 8 || i === 9 || i === 12 ? x : i === 10 ? Math.round(x) : r3(x)); }
      // a NaN would make the platform refuse the whole patch
      if (s.p.every(Number.isFinite) && s.a.every(Number.isFinite) && (!s.c || s.c.every(x => typeof x !== 'number' || Number.isFinite(x)))) {
        const patch = { s };
        if (this.role === 'host' && world) {
          const rest = { ...this.mine, s }; delete rest.z;
          const z = world(BUDGET - bytes(rest) - 8);
          if (z) { z.t = s.t; patch.z = z; }
        } else if (this.mine.z) patch.z = null;
        this.publish(patch);
      }
    }
    if (this.carsDirty && (this.carsT -= dt) <= 0) { this.carsT = 1; this.carsDirty = false; this.publish({ c: this.cars }); }
    for (const r of this.remotes.values()) {
      const prev = r.now;
      r.now = r.sample(now);
      // (how fast they go: the animals take a runner for a threat sooner)
      if (prev && r.now && dt > 0) r.speed += (Math.hypot(r.now.p[0] - prev.p[0], r.now.p[2] - prev.p[2]) / dt - r.speed) * Math.min(1, dt * 4);
    }
    this.zNow = this.role === 'guest' && this.host ? this.host.sampleZ(now) : null;
  }
  get count() { return [...this.remotes.values()].filter(r => r.now).length; }
}
