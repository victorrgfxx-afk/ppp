// (V128) The commune's network as the post's system sees it - a game, in the manner of hacking games: the devices round
// the hill, what each answers on, how each is got into, what it does once it is yours. The services, the protocols and
// the weaknesses are invented for the game (their names and numbers too): it plays like the real thing - find the
// hosts, probe them, look up what they are known for, break in, use what you got - and teaches nothing that works
// anywhere else.

const KINDS = {
  router: { label: 'router / firewall', ports: [[22, 'shell'], [8443, 'panou']], weak: [] },
  server: { label: 'server', ports: [[22, 'shell'], [9100, 'metrici']], weak: [] },
  grid: {
    label: 'nod de comandă · post de transformare', ports: [[7001, 'gridlink'], [7080, 'panou']],
    weak: [{ id: 'NX-1137', sev: 9.1, kind: 'breach', t: 9, title: 'cheie de sesiune care se poate ghici (fictiv)' }],
  },
  lights: {
    label: 'controler iluminat public', ports: [[7002, 'lumen'], [7080, 'panou']],
    weak: [{ id: 'NX-1204', sev: 7.4, kind: 'pass', t: 7, title: 'parolă de fabrică neschimbată' }],
  },
  launcher: {
    label: 'lansator antigrindină LG-12 (modem radio)', ports: [[4100, 'hailnet'], [4180, 'diagnoză']],
    weak: [{ id: 'NX-2290', sev: 8.6, kind: 'breach', t: 11, title: 'comenzi primite fără semnătură (fictiv)' }],
  },
  meteo: {
    label: 'stație meteo', ports: [[80, 'web'], [7883, 'telemetrie']],
    weak: [{ id: 'NX-0815', sev: 5.3, kind: 'open', t: 2, title: 'telemetrie publică, fără cont' }],
  },
  camera: {
    label: 'cameră IP', ports: [[80, 'web'], [8554, 'vidstream']],
    weak: [{ id: 'NX-0042', sev: 8.1, kind: 'pass', t: 5, title: 'parolă de fabrică neschimbată' }],
  },
  car: {
    label: 'unitate telematică (mașină)', ports: [[8443, 'telematică']],
    weak: [{ id: 'NX-3310', sev: 7.9, kind: 'pin', t: 8, title: 'PIN scurt, fără limită de încercări (fictiv)' }],
  },
};
export const KIND_LABEL = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label]));

// what each kind can be told once it is yours: [action, label]
export const ACTIONS = {
  grid: [['IG:0', 'Oprește tot curentul'], ['IG:1', 'Pornește curentul'], ['L1:0', 'Taie faza L1'], ['L1:1', 'Pune faza L1'], ['L2:0', 'Taie faza L2'], ['L2:1', 'Pune faza L2'], ['L3:0', 'Taie faza L3'], ['L3:1', 'Pune faza L3']],
  lights: [['IP:0', 'Stinge felinarele'], ['IP:1', 'Aprinde felinarele']],
  launcher: [['seed', 'Însămânțare: furtună'], ['rain', 'Ploaie'], ['clear', 'Risipește norii'], ['strike', 'Trăsnet (în furtună)']],
  meteo: [['read', 'Citește datele']],
  camera: [['view', 'Deschide imaginea']],
  car: [['lights', 'Faruri'], ['horn', 'Claxon'], ['alarm', 'Alarmă']],
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export class NetSim {
  // hooks: what the devices do in the game (main.js) - power(k, on), launch(w), meteo(), camera(i), car(id, what)
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.devs = []; this.byIp = new Map();
    this.speed = 1;                          // (the AI's calls run the same steps, faster)
    this.onChange = null;
  }
  add(d) {
    const K = KINDS[d.kind];
    const dev = { found: false, probed: false, known: false, owned: false, ...d, label: d.label ?? K.label, ports: d.ports ?? K.ports, weak: d.weak ?? K.weak };
    if (d.own) { dev.found = dev.probed = dev.known = dev.owned = true; }
    this.devs.push(dev); this.byIp.set(dev.ip, dev);
    return dev;
  }
  get(ipOrName) { return this.byIp.get(ipOrName) ?? this.devs.find((d) => d.host === ipOrName || d.id === ipOrName) ?? null; }
  changed() { this.onChange?.(); }
  async wait(ms, signal) { await pause(ms / this.speed); if (signal?.aborted) throw new Error('oprit'); }

  // ---- the steps. Each writes its lines through out(text, cls) as a real tool would, with its pauses.
  async scan(out, signal) {
    out('scanez 10.7.0.0/16 (ping, ARP, mDNS) ...', 'd');
    let n = 0;
    for (const d of this.devs) {
      await this.wait(160 + Math.random() * 220, signal);
      if (!d.found) { d.found = true; n++; }
      out(`${d.ip.padEnd(13)} ${d.host.padEnd(22)} ${d.own ? 'al tău' : d.owned ? 'controlat' : KINDS[d.kind].label}`, d.owned ? 'g' : '');
    }
    out(`${this.devs.length} gazde active, ${n} noi`, 'd');
    this.changed();
  }
  async probe(ip, out, signal) {
    const d = this.get(ip); if (!d?.found) { out(`nu cunosc gazda ${ip} (rulează mai întâi: scan)`, 'r'); return; }
    out(`sondez ${d.ip} (${d.host}) ...`, 'd');
    await this.wait(900, signal);
    out('PORT       STARE    SERVICIU', 'y');
    for (const [p, s] of d.ports) { await this.wait(180, signal); out(`${String(p).padEnd(10)} deschis  ${s}`); }
    out(`tip: ${d.label}`, 'd');
    d.probed = true; this.changed();
  }
  async vulns(ip, out, signal) {
    const d = this.get(ip); if (!d?.probed) { out(`sondează întâi gazda: probe ${ip}`, 'r'); return; }
    out(`caut în baza de vulnerabilități (versiunile serviciilor de pe ${d.ip}) ...`, 'd');
    await this.wait(700, signal);
    if (!d.weak.length) { out('nimic cunoscut pentru versiunile acestea', 'd'); d.known = true; this.changed(); return; }
    for (const w of d.weak) out(`${w.id}  scor ${w.sev.toFixed(1)}  ${w.title}`, w.sev >= 8 ? 'r' : 'y');
    d.known = true; this.changed();
  }
  // breaks in with the given weakness (or the first one known); a progress bar, then the device is yours
  async breach(ip, id, out, signal) {
    const d = this.get(ip);
    if (!d?.known) { out(`caută întâi vulnerabilitățile: vulns ${ip}`, 'r'); return false; }
    if (d.owned) { out(`${d.host} e deja al tău`, 'g'); return true; }
    const w = id ? d.weak.find((x) => x.id.toLowerCase() === String(id).toLowerCase()) : d.weak[0];
    if (!w) { out(id ? `${id} nu se aplică gazdei ${d.host}` : `${d.host}: nicio slăbiciune cunoscută`, 'r'); return false; }
    const steps = { breach: ['pregătesc sarcina', 'trimit cererea', 'aștept sesiunea'], pass: ['încerc parolele de fabrică', 'listă: 2.400 de parole uzuale'], pin: ['încerc PIN-urile', '0000 → 9999'], open: ['mă conectez'] }[w.kind];
    for (const s of steps) { out(`[${w.id}] ${s} ...`, 'd'); await this.wait(w.t * 1000 / steps.length / 2, signal); }
    const bar = (k) => '[' + '#'.repeat(k) + '.'.repeat(20 - k) + ']';
    for (let k = 4; k <= 20; k += 4) { await this.wait(w.t * 1000 / 10, signal); out(bar(k) + ' ' + k * 5 + '%', 'd'); }
    d.owned = true; this.changed();
    out(`ACCES: ${d.host} (${d.ip}) e al tău`, 'g');
    return true;
  }
  // tells a device you own to do something; returns its answer
  act(ip, action) {
    const d = this.get(ip);
    if (!d) return { ok: false, msg: `nu cunosc ${ip}` };
    if (!d.owned) return { ok: false, msg: `${d.host} nu e al tău (scan, probe, vulns, breach)` };
    const H = this.hooks;
    if (d.kind === 'grid' || d.kind === 'lights') {
      const [k, v] = String(action).split(':');
      if (!['IG', 'IP', 'L1', 'L2', 'L3'].includes(k) || !['0', '1'].includes(v)) return { ok: false, msg: 'acțiuni: IG|IP|L1|L2|L3 : 0|1' };
      H.power?.(k, v === '1');
      return { ok: true, msg: `${k} -> ${v === '1' ? 'PORNIT' : 'OPRIT'}` };
    }
    if (d.kind === 'launcher') return H.launch?.(String(action)) ?? { ok: false, msg: 'lansatorul nu răspunde' };
    if (d.kind === 'meteo') return { ok: true, msg: H.meteo?.() ?? 'fără date' };
    if (d.kind === 'camera') { H.camera?.(d.cam); return { ok: true, msg: `imaginea camerei ${d.host}` }; }
    if (d.kind === 'car') {
      if (!['lights', 'horn', 'alarm'].includes(action)) return { ok: false, msg: 'acțiuni: lights | horn | alarm' };
      H.car?.(d.car, action);
      return { ok: true, msg: `${d.label}: ${{ lights: 'faruri', horn: 'claxon', alarm: 'alarmă' }[action]}` };
    }
    return { ok: false, msg: `${d.host}: nimic de comandat` };
  }
  // a short summary for the AI and the map: what is known of each host
  summary() {
    return this.devs.filter((d) => d.found).map((d) => ({ ip: d.ip, host: d.host, kind: d.kind, label: d.label, probed: d.probed, known: d.known, owned: d.owned,
      weak: d.known ? d.weak.map((w) => w.id) : [], actions: d.owned ? (ACTIONS[d.kind] ?? []).map((a) => a[0]) : [] }));
  }
}
