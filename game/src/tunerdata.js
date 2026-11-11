// (V94) The autotuner's data and its engine model (no drawing here: tuner.js).
//
// What is real: each car's series power and torque, and what a "Stage 1" file gives it - software only, the hardware as
// it left the factory - as the tuning-file sellers list them for that engine (their figures, not dyno sheets of ours;
// README, V94). Across engines they agree with the general rule: a turbodiesel gains ~20-35 % of power and ~25-40 % of
// torque, a turbo petrol ~15-35 %, a naturally aspirated petrol 5-15 %.
//
// What is a model: the maps themselves. A real file holds thousands of them, different in every ECU; here each kind of
// engine has the handful a Stage 1 is made of - the driver's wish, the torque limiters, the boost, the smoke limiter
// (diesel) or the ignition and the full-load lambda (petrol), the rail pressure, the start of injection - built from
// the car's own torque curve so that, as mapped at the factory, they give exactly its series figures. Through them runs
// a small engine model, per rev column at full load:
//   diesel:  the air a stroke takes in follows the boost (cc x mbar x 0.00101 mg, the turbo giving at most 30 % over
//            series); the smoke limiter allows a fuel quantity for that air; the quantity injected is the lesser of that
//            and what the wish and the limiters ask (0.734 mg per Nm per stroke, all cylinders: 40 % brake efficiency,
//            42.8 MJ/kg); below lambda 1.3 the extra fuel burns less well, below 1.15 it makes smoke, not torque;
//   petrol, turbo: torque follows the air (the boost), the ignition (0.9 % a degree up to the knock limit, which more
//            boost brings closer; past it the ECU pulls the timing back) and the lambda (best near 0.875);
//   petrol, aspirated: the throttle the pedal maps open at full pedal, the ignition, the lambda.
// So raising one map alone does what it does on a car: a limiter raised with the boost as it was gives nothing, fuel
// without air gives smoke. The Stage 1 preset raises them together to the seller's figures for that engine.

export const PS = 7023.5;                    // P [PS] = T [Nm] x n [rpm] / 7023.5

// type: td turbodiesel, tp turbo petrol, na aspirated petrol. hp (PS), nm: series; s1: [hp, Nm] after Stage 1 (as listed);
// nT: where the torque peaks (from, to rpm), nP: where the power does, red: the limiter; cc, cyl; ecu: as the sellers list
// it (blank where they do not agree); vlim: an electronic speed limiter (km/h); est: no seller's figure for this
// engine - the Stage 1 taken from the general rule (a turbo petrol's ~10 %, an aspirated engine's ~7 %); pump: a
// distributor pump, no common rail
export const SPECS = [
  { re: /BMW Seria 3/, make: 'BMW', wmi: 'WBA', label: '320d · 2.0 turbodiesel (N47)', type: 'td', hp: 177, nm: 350, s1: [209, 419], nT: [1750, 3000], nP: 4000, red: 4750, cc: 1995, cyl: 4, ecu: 'Bosch EDC17CP02' },
  { re: /BMW Seria 1/, make: 'BMW', wmi: 'WBA', label: '118d · 2.0 turbodiesel (N47)', type: 'td', hp: 143, nm: 300, s1: [183, 400], nT: [1750, 2500], nP: 4000, red: 4750, cc: 1995, cyl: 4, ecu: 'Bosch EDC17C41' },
  { re: /Opel Corsa/, make: 'Opel', wmi: 'W0L', label: '1.2 16V · benzină aspirat (Z12XE)', type: 'na', hp: 75, nm: 110, s1: [82, 125], nT: [4000, 4000], nP: 5600, red: 6400, cc: 1199, cyl: 4, ecu: 'Bosch ME1.5.5' },
  { re: /Dacia Logan/, make: 'Dacia', wmi: 'UU1', label: '1.4 MPI · benzină aspirat', type: 'na', hp: 75, nm: 112, s1: [82, 122], nT: [3000, 3000], nP: 5500, red: 6200, cc: 1390, cyl: 4, ecu: '' },
  { re: /Dacia Sandero/, make: 'Dacia', wmi: 'UU1', label: '0.9 TCe 90 · benzină turbo', type: 'tp', hp: 90, nm: 140, s1: [107, 175], nT: [2250, 3500], nP: 5250, red: 6200, cc: 898, cyl: 3, ecu: 'Valeo V50' },
  { re: /Ford Focus/, make: 'Ford', wmi: 'WF0', label: '1.6 TDCi 109 · turbodiesel (G8DA)', type: 'td', hp: 109, nm: 240, s1: [141, 315], nT: [1750, 2500], nP: 4000, red: 4750, cc: 1560, cyl: 4, ecu: 'Bosch EDC16C34' },
  { re: /VW Golf/, make: 'Volkswagen', wmi: 'WVW', label: '1.9 TDI 90 · turbodiesel (ALH)', type: 'td', hp: 90, nm: 210, s1: [122, 267], nT: [1900, 2400], nP: 4000, red: 4600, cc: 1896, cyl: 4, ecu: 'Bosch EDC15V', pump: true },
  { re: /Ford Kuga|^SUV/, make: 'Ford', wmi: 'WF0', label: '2.0 TDCi 140 · turbodiesel (UFDA)', type: 'td', hp: 140, nm: 320, s1: [175, 400], nT: [1750, 2750], nP: 3750, red: 4600, cc: 1997, cyl: 4, ecu: 'Delphi DCM3.5' },
  { re: /Mercedes argintiu/, make: 'Mercedes-Benz', wmi: 'WDD', label: 'A 180 CDI · 2.0 turbodiesel (W169)', type: 'td', hp: 109, nm: 250, s1: [139, 310], nT: [1600, 2600], nP: 4200, red: 4800, cc: 1991, cyl: 4, ecu: '' },
  { re: /Renault Kangoo/, make: 'Renault', wmi: 'VF1', label: '1.5 dCi 90 · turbodiesel (K9K)', type: 'td', hp: 90, nm: 200, s1: [108, 243], nT: [1750, 2500], nP: 4000, red: 4750, cc: 1461, cyl: 4, ecu: 'Delphi DCM3.4' },
  { re: /VW Transporter/, make: 'Volkswagen', wmi: 'WV1', label: 'T5 2.0 TDI 140 · turbodiesel (CAAC)', type: 'td', hp: 140, nm: 340, s1: [180, 410], nT: [1750, 2500], nP: 3500, red: 4500, cc: 1968, cyl: 4, ecu: 'Bosch EDC17CP20' },
  { re: /Fiat Dobl/, make: 'Fiat', wmi: 'ZFA', label: '1.3 Multijet 90 · turbodiesel', type: 'td', hp: 90, nm: 200, s1: [112, 247], nT: [1500, 2500], nP: 4000, red: 4800, cc: 1248, cyl: 4, ecu: 'Marelli MJ8DF' },
  { re: /^Peugeot 508$/, make: 'Peugeot', wmi: 'VF3', label: '2.0 HDi 163 · turbodiesel (DW10)', type: 'td', hp: 163, nm: 340, s1: [191, 400], nT: [2000, 3000], nP: 3750, red: 4750, cc: 1997, cyl: 4, ecu: '' },
  { re: /Maybach/, make: 'Mercedes-Maybach', wmi: '4JG', label: 'GLS 600 · 4.0 V8 biturbo (M177)', type: 'tp', hp: 557, nm: 730, s1: [613, 803], nT: [2500, 5000], nP: 6250, red: 7000, cc: 3982, cyl: 8, ecu: '', vlim: 250, est: true },
  { re: /ATV/, make: 'ATV', wmi: '', label: '495 cm³ · monocilindru, injecție', type: 'na', hp: 38, nm: 39, s1: [40.7, 41.7], nT: [5750, 5750], nP: 7000, red: 7800, cc: 495, cyl: 1, ecu: '', est: true },
];
const GENERIC = { make: 'Auto', wmi: '', label: '1.5 turbodiesel', type: 'td', hp: 90, nm: 200, s1: [110, 245], nT: [1750, 2500], nP: 4000, red: 4750, cc: 1461, cyl: 4, ecu: '', est: true };

// the car's data: its engine's (by its name), or - a car the game itself tuned (v.hyper: the user's Peugeot at 1400 W/kg)
// - what its own tune makes at an assumed 1500 kg, a Stage 1 on it taken at the low end of a turbo petrol's (+10 %)
export function specFor(v) {
  const Hy = v.stock?.hyper ?? v.hyper;
  if (Hy && /508/.test(v.name)) {
    const hp = Math.round(Hy.P * 1500 / 735.5), nP = 7500, nm = Math.round(hp * PS / nP * 1.08 / 10) * 10;
    return { make: 'Peugeot', wmi: 'VF3', label: 'preparat de curse · benzină turbo (' + Hy.P + ' W/kg, la 1500 kg)', type: 'tp', hp, nm, s1: [Math.round(hp * 1.1), Math.round(nm * 1.1)], nT: [4000, 6500], nP, red: 8500, cc: 1598, cyl: 4, ecu: 'ECU de competiție', vlim: Math.round(Hy.limit * 3.6), own: true, est: true };
  }
  return SPECS.find(s => s.re.test(v.name)) ?? SPECS.find(s => s.re.test(v.m?.name ?? '')) ?? GENERIC;
}

const sstep = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
// the series torque curve (Nm at n rpm): up to its peak, the plateau, down to what the peak power needs at nP, then
// falling away to the limiter fast enough that the power peaks at nP
export function torque0(sp, n) {
  const idle = sp.cyl === 1 ? 1400 : 800, k0 = sp.type === 'na' ? 0.72 : sp.type === 'tp' ? 0.55 : 0.5;
  const TP = sp.hp * PS / sp.nP, kR = 1 - 1.15 * (sp.red - sp.nP) / sp.nP;
  if (n <= sp.nT[0]) { const u = Math.max(0, (n - idle) / (sp.nT[0] - idle)); return sp.nm * (k0 + (1 - k0) * (1 - (1 - u) * (1 - u))); }
  if (n <= sp.nT[1]) return sp.nm;
  if (n <= sp.nP) return sp.nm + (TP - sp.nm) * sstep((n - sp.nT[1]) / (sp.nP - sp.nT[1]));
  return TP * (1 - (1 - kR) * Math.min(1.3, (n - sp.nP) / (sp.red - sp.nP)));
}
// the rev axis of its maps (8 columns to the limiter)
export const revAxis = (sp) => [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 1].map(f => Math.round(f * sp.red / 250) * 250);
const PEDAL = [10, 20, 30, 40, 55, 70, 85, 100], PCURVE = [0.06, 0.15, 0.27, 0.4, 0.58, 0.76, 0.92, 1.02];
const AIRCC = 0.00101;                       // mg of air per cc of cylinder per mbar of boost (charge at ~45 C, 92 % filled)
const FUEL = 0.734;                          // mg of diesel per stroke, all cylinders, per Nm
const lam0d = (sp, n) => 1.3 + 0.16 * sstep((n - sp.nT[1]) / (sp.red - sp.nT[1]));             // (a diesel's full-load lambda, series)
const lam0p = (sp, n) => (sp.type === 'na' ? 0.9 : 0.92) - (sp.type === 'na' ? 0.05 : 0.12) * sstep((n - 0.3 * sp.red) / (0.7 * sp.red));
const ign0 = (sp, n) => (sp.type === 'na' ? 14 : 5) + (sp.type === 'na' ? 16 : 17) * Math.max(0, (n - 1000) / (sp.red - 1000));
const thr0 = (sp, n) => 90 + 6 * sstep((n - 0.3 * sp.red) / (0.5 * sp.red));                    // (% of full air at full pedal, series)
// (what the series turbo can give over its series air: 30 % in the middle of the revs, less toward its flow limit at the top)
const airMax = (sp, n) => 1.3 - (sp.type === 'tp' ? 0.08 : 0.16) * sstep((n - sp.nT[1]) / (sp.nP - sp.nT[1]));
// (a diesel's burn by its lambda: all of the fuel above 1.3, a little less well down to 1.15, and below that more fuel
// makes smoke, not torque)
const etaLamD = (l) => l >= 1.15 ? 1 - 0.35 * Math.max(0, 1.3 - l) : 0.9475 * Math.pow(l / 1.15, 1.3);
const etaLamP = (l) => 1 - 4 * (l - 0.875) * (l - 0.875);

// ---- the maps of an engine, as the factory mapped them. Each: { id, name, unit, dec (decimals), rows (labels), rowName,
// cols (rpm), v (rows x cols), step (what one "+" adds: a fraction, or - abs - a number) }
export function stockMaps(sp) {
  const C = revAxis(sp), T = C.map(n => torque0(sp, n)), ccCyl = sp.cc / sp.cyl, maps = [];
  const grid = (rows, f) => rows.map((r, i) => C.map((n, j) => f(i, j, n)));
  const add = (m) => { m.cols = C; maps.push(m); };
  add({ id: 'wish', name: sp.type === 'na' ? 'Dorința șoferului — clapetă' : 'Dorința șoferului — cuplu cerut', unit: sp.type === 'na' ? '% aer' : 'Nm', dec: 0, rowName: 'pedală %', rows: PEDAL.map(String),
    v: sp.type === 'na' ? grid(PEDAL, (i, j, n) => Math.min(100, PCURVE[i] / 1.02 * thr0(sp, n))) : grid(PEDAL, (i, j) => PCURVE[i] * T[j]) });
  add({ id: 'tlim', name: 'Limitator de cuplu', unit: 'Nm', dec: 0, rowName: 'treaptă', rows: ['1–2', '3–4', '5+'], v: grid([0.95, 1, 1], (i, j) => [0.95, 1, 1][i] * T[j]) });
  if (sp.type === 'td') {
    const IQ = T.map(t => t * FUEL / sp.cyl), air = C.map((n, j) => 14.5 * IQ[j] * lam0d(sp, n)), boost = air.map(a => Math.max(1000, a / (ccCyl * AIRCC)));
    const iqMax = Math.max(...IQ), IR = [0.15, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9, 1].map(f => f * iqMax);
    add({ id: 'boost', name: 'Presiune turbo — țintă', unit: 'mbar abs.', dec: 0, rowName: 'mg/cursă', rows: IR.map(q => q.toFixed(0)), v: grid(IR, (i, j) => 1000 + (boost[j] - 1000) * Math.pow(IR[i] / iqMax, 1.4)) });
    // (the smoke limiter: the quantity allowed for the air taken in - lambda 1.22 - over rows of air up to 115 % of what
    // the series boost brings)
    const aMax = Math.max(...air) * 1.15, AR = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(f => f * aMax);
    add({ id: 'smoke', name: 'Limitator de fum', unit: 'mg/cursă', dec: 1, rowName: 'aer mg', rows: AR.map(a => a.toFixed(0)), air: AR, v: grid(AR, (i) => AR[i] / (14.5 * 1.22)) });
    if (!sp.pump) add({ id: 'rail', name: 'Presiune rampă', unit: 'bar', dec: 0, rowName: 'mg/cursă', rows: IR.map(q => q.toFixed(0)), v: grid(IR, (i, j, n) => 300 + (1100 + 200 * Math.min(1, n / 3000)) * Math.pow(IR[i] / iqMax, 0.8)) });
    add({ id: 'soi', name: 'Avans injecție', unit: '° înainte de PMS', dec: 1, abs: true, step: 0.5, rowName: 'mg/cursă', rows: IR.map(q => q.toFixed(0)), v: grid(IR, (i, j, n) => -2 + 0.004 * (n - 1000) + 6 * IR[i] / iqMax) });
    add({ id: 'svbl', name: 'Limită de presiune (protecție)', unit: 'mbar abs.', dec: 0, rowName: '', rows: ['max'], v: [C.map(() => Math.round((Math.max(...boost) + 180) / 10) * 10)] });
  } else {
    if (sp.type === 'tp') {
      const pk = sp.cyl >= 8 ? 2150 : 2050, LR = [20, 35, 50, 60, 70, 80, 90, 100];
      add({ id: 'boost', name: 'Presiune turbo — țintă', unit: 'mbar abs.', dec: 0, rowName: 'sarcină %', rows: LR.map(String), v: grid(LR, (i, j) => 1000 + (pk - 1000) * (T[j] / sp.nm) * Math.max(0, (LR[i] - 35) / 65)) });
      add({ id: 'svbl', name: 'Limită de presiune (protecție)', unit: 'mbar abs.', dec: 0, rowName: '', rows: ['max'], v: [C.map(() => pk + 200)] });
    }
    const LR = [20, 35, 50, 60, 70, 80, 90, 100];
    add({ id: 'ign', name: 'Avans aprindere', unit: '° înainte de PMS', dec: 1, abs: true, step: 0.5, rowName: 'sarcină %', rows: LR.map(String), v: grid(LR, (i, j, n) => ign0(sp, n) + (100 - LR[i]) * 0.26) });
    add({ id: 'lam', name: 'Lambda la sarcină mare', unit: 'λ', dec: 3, abs: true, step: 0.005, rowName: 'sarcină %', rows: ['80', '90', '100'], v: grid([80, 90, 100], (i, j, n) => Math.min(1, lam0p(sp, n) + (2 - i) * 0.03)) });
  }
  if (sp.vlim) maps.push({ id: 'vmax', name: 'Limitator de viteză', unit: 'km/h', dec: 0, abs: true, step: 5, rowName: '', rows: ['max'], cols: ['—'], v: [[sp.vlim]] });
  for (const m of maps) m.v = m.v.map(r => r.map(x => +x.toFixed(m.dec + 1)));
  return maps;
}
export const cloneMaps = (maps) => maps.map(m => ({ ...m, v: m.v.map(r => r.slice()) }));
const byId = (maps, id) => maps.find(m => m.id === id);
const top = (m) => m.v[m.v.length - 1];                       // (the full-load row)
const lerpRow = (xs, ys, x) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[ys.length - 1]; };

// ---- the engine run through a set of maps: per rev column, the torque at full load, and what is wrong with it
export function evaluate(sp, maps, stock = stockMaps(sp)) {
  const C = revAxis(sp), ccCyl = sp.cc / sp.cyl, warn = new Set(), Tq = [], info = [];
  const wish = byId(maps, 'wish'), tlim = byId(maps, 'tlim'), boost = byId(maps, 'boost'), sv = byId(maps, 'svbl');
  const tl = (j) => (tlim.v[0][j] + tlim.v[1][j] + tlim.v[2][j]) / 2.95;       // (the gears' limiters, as the car goes up through them)
  for (let j = 0; j < C.length; j++) {
    const n = C[j], T0 = torque0(sp, n);
    let T, note = {};
    if (sp.type === 'td') {
      const b0 = top(byId(stock, 'boost'))[j], b = top(boost)[j], air0 = ccCyl * AIRCC * b0, cap = air0 * airMax(sp, n);
      let air = ccCyl * AIRCC * b;
      if (air > cap * 1.005) { air = cap; warn.add('turbo'); }
      const sm = byId(maps, 'smoke'), allowed = lerpRow(sm.air, sm.v.map(r => r[j]), air);
      const req = Math.min(top(wish)[j], tl(j)) * FUEL / sp.cyl, iq = Math.min(req, allowed), lam = air / (14.5 * iq);
      if (lam < 1.15) warn.add('smoke');
      const rm = byId(maps, 'rail'), rl = rm ? top(rm)[j] / top(byId(stock, 'rail'))[j] : 1, ds = top(byId(maps, 'soi'))[j] - top(byId(stock, 'soi'))[j];
      if (rl > 1.12) warn.add('rail');
      if (ds > 3) warn.add('soi');
      T = iq * sp.cyl / FUEL * etaLamD(lam) / etaLamD(lam0d(sp, n)) * Math.max(0.97, Math.min(1.02, 1 + 0.2 * (rl - 1))) * Math.max(0.98, Math.min(1.012, 1 + 0.004 * ds));
      if (b > sv.v[0][j] + 1) { T *= 0.6; warn.add('limp'); }
      note = { boost: b, lam, iq };
    } else {
      let a = 1, bNow = null;
      if (sp.type === 'tp') {
        const b0 = top(byId(stock, 'boost'))[j]; bNow = top(boost)[j];
        a = bNow / b0;
        if (a > airMax(sp, n) * 1.005) { a = airMax(sp, n); warn.add('turbo'); }
      } else a = Math.min(100, top(wish)[j]) / thr0(sp, n);
      const dI = top(byId(maps, 'ign'))[j] - top(byId(stock, 'ign'))[j], lam = top(byId(maps, 'lam'))[j], l0 = lam0p(sp, n);
      const m = sp.type === 'na' ? 5 : 2 - 14 * (a - 1);          // (degrees to the knock limit on the fuel in the tank)
      if (dI > m + 0.6) warn.add('knock');
      if (lam > 0.925 && (sp.type === 'tp' ? a > 1.05 : true) && n > sp.nT[0]) warn.add('lean');
      const eI = 1 + (sp.type === 'na' ? 0.012 : 0.009) * Math.min(dI, m) - (dI > m ? 0.025 * (dI - m) : 0);
      const made = T0 * a * eI * etaLamP(lam) / etaLamP(l0);
      T = sp.type === 'tp' ? Math.min(made, top(wish)[j], tl(j)) : Math.min(made, tl(j) * 1.0001);
      if (sp.type === 'tp' && bNow > sv.v[0][j] + 1) { T *= 0.6; warn.add('limp'); }
      note = { boost: bNow, lam, ign: dI };
    }
    if (T > T0 * 1.42 && T > sp.nm * 1.05) warn.add('clutch');
    Tq.push(T); info.push(note);
  }
  // the curves, on a fine grid: the series one scaled by each column's gain
  const g = Tq.map((t, j) => t / torque0(sp, C[j])), pts = [];
  let nm = 0, hp = 0, nm0 = 0, hp0 = 0;
  for (let n = 1000; n <= sp.red; n += 50) {
    const t0 = torque0(sp, n), t1 = t0 * lerpRow(C, g, n), p0 = t0 * n / PS, p1 = t1 * n / PS;
    pts.push([n, t0, t1, p0, p1]);
    nm = Math.max(nm, t1); hp = Math.max(hp, p1); nm0 = Math.max(nm0, t0); hp0 = Math.max(hp0, p0);
  }
  const vm = byId(maps, 'vmax');
  return { cols: C, torque: Tq, gain: g, info, pts, nm, hp, nm0, hp0, kNm: nm / nm0, kHp: hp / hp0, vlim: vm ? vm.v[0][0] : null, warn: [...warn] };
}
export const WARN = {
  turbo: 'Presiunea cerută depășește ce poate livra turbina de serie: aerul rămâne la limita ei',
  smoke: 'Fum și temperatură mare a gazelor: prea mult combustibil pentru aerul admis (λ sub 1,15)',
  rail: 'Presiune de rampă peste 12 % față de serie: pompa și injectoarele sunt forțate',
  soi: 'Avans de injecție prea mare: zgomot de ardere, presiune de vârf în cilindru',
  limp: 'Presiunea țintă trece de limita de protecție: ECU-ul intră în avarie (putere tăiată)',
  knock: 'Detonație: avansul trece de limita benzinei din rezervor — ECU-ul îl retrage, puterea scade',
  lean: 'Amestec prea sărac la sarcină mare: temperatura gazelor crește',
  clutch: 'Cuplu cu peste 40 % peste serie: ambreiajul și cutia nu mai sunt în limitele lor',
};

// ---- the Stage 1 preset: the maps raised together to the seller's figures for this engine (torque gain kT where the
// torque peaks, power gain kP where the power does, a turbo's own low revs gaining less). The recipe below is worked
// for a gain per rev column, run through the model, and corrected by what the model answers until it gives the figures
const part = (i, rows) => sstep((i / (rows - 1) - 0.45) / 0.4);   // (the full-load rows take all of a change, fading out below ~55 % load)
function recipe(sp, stock, gv) {
  const maps = cloneMaps(stock), C = revAxis(sp), ccCyl = sp.cc / sp.cyl;
  const wish = byId(maps, 'wish'), tlim = byId(maps, 'tlim');
  C.forEach((n, j) => {
    const g = gv[j], T0 = torque0(sp, n);
    if (sp.type !== 'td') { for (let i = 0; i < 3; i++) tlim.v[i][j] *= g * 1.004; }
    if (sp.type === 'tp') wish.v.forEach((r, i) => { r[j] *= 1 + (g - 1) * part(i, 8); });
    if (sp.type === 'td') {
      const boost = byId(maps, 'boost'), sm = byId(maps, 'smoke'), rail = byId(maps, 'rail'), soi = byId(maps, 'soi');
      // (the quantity for that torque, at most what the turbo's air burns clean - lambda 1.16)
      const lamT = Math.max(1.2, lam0d(sp, n) - 0.07), b0 = top(boost)[j], cap = ccCyl * AIRCC * b0 * airMax(sp, n);
      const iq = Math.min(T0 * g * FUEL / sp.cyl, cap / (14.5 * 1.16));
      const air = Math.min(14.5 * iq * lamT, cap), b = Math.max(b0, air / (ccCyl * AIRCC)), gq = iq * sp.cyl / FUEL / T0;
      for (let i = 0; i < 3; i++) tlim.v[i][j] *= gq * 1.004;
      wish.v.forEach((r, i) => { r[j] *= 1 + (gq - 1) * part(i, 8); });
      boost.v.forEach((r, i) => { r[j] += (b - b0) * part(i, 8); });
      // (the smoke limiter: where the new air reaches, room for the new quantity and 3 % over)
      const need = iq * 1.03, have = lerpRow(sm.air, sm.v.map(q => q[j]), ccCyl * AIRCC * b);
      if (need > have) sm.v.forEach((r, i) => { r[j] *= 1 + (need / have - 1) * sstep((sm.air[i] / (ccCyl * AIRCC * b) - 0.6) / 0.3); });
      if (rail) rail.v.forEach((r, i) => { r[j] *= 1 + Math.min(0.07, (g - 1) * 0.3) * part(i, 8); });
      soi.v.forEach((r, i) => { r[j] += Math.min(1.5, (g - 1) * 6) * part(i, 8); });
    } else if (sp.type === 'tp') {
      const boost = byId(maps, 'boost'), ign = byId(maps, 'ign'), lam = byId(maps, 'lam');
      const l0 = top(lam)[j], l1 = Math.min(0.875, l0 + 0.03), eL = etaLamP(l1) / etaLamP(lam0p(sp, n));
      let a = g, dI = 0;
      for (let it = 0; it < 4; it++) { dI = Math.min(1.5, 2 - 14 * (a - 1)); a = Math.min(airMax(sp, n), g * 1.01 / ((1 + 0.009 * dI) * eL)); }
      const b0 = top(boost)[j];
      boost.v.forEach((r, i) => { r[j] += b0 * (a - 1) * part(i, 8); });
      ign.v.forEach((r, i) => { r[j] += dI * part(i, 8); });
      lam.v.forEach((r, i) => { r[j] += (l1 - l0) * (i / 2); });
    } else {
      const ign = byId(maps, 'ign'), lam = byId(maps, 'lam');
      const a = 100 / thr0(sp, n), l0 = top(lam)[j], l1 = 0.875, eL = etaLamP(l1) / etaLamP(lam0p(sp, n));
      wish.v.forEach((r, i) => { r[j] = Math.min(100, r[j] * (1 + (a - 1) * part(i, 8))); });
      const dI = Math.max(0, Math.min(5, (g * 1.006 / (a * eL) - 1) / 0.012));
      ign.v.forEach((r, i) => { r[j] += dI * part(i, 8); });
      lam.v.forEach((r, i) => { r[j] += (l1 - l0) * (i / 2); });
    }
  });
  const boost = byId(maps, 'boost'), sv = byId(maps, 'svbl');
  if (sv) { const mx = Math.max(...top(boost)); sv.v[0] = sv.v[0].map(() => Math.round((mx + 180) / 10) * 10); }
  for (const m of maps) m.v = m.v.map(r => r.map(x => +x.toFixed(m.dec + 1)));
  return maps;
}
export function stage1(sp, stock = stockMaps(sp)) {
  const C = revAxis(sp), kT = sp.s1[1] / sp.nm, kP = sp.s1[0] / sp.hp;
  const want = C.map(n => {
    const hi = kT + (kP - kT) * sstep((n - sp.nT[1]) / Math.max(1, sp.nP - sp.nT[1]));
    return sp.type === 'na' ? hi : 1 + (hi - 1) * (0.35 + 0.65 * sstep((n - 900) / (sp.nT[0] - 900)));
  });
  let gv = want.slice(), maps = recipe(sp, stock, gv);
  for (let it = 0; it < 6; it++) {
    const ev = evaluate(sp, maps, stock);
    // (each column to its own gain, then the whole to the peak figures: the power's peak may fall between columns)
    gv = gv.map((g, j) => 1 + (g - 1) * (want[j] - 1) / Math.max(1e-3, ev.gain[j] - 1));
    const fT = kT / ev.kNm, fP = kP / ev.kHp;
    if (it >= 2) gv = gv.map((g, j) => g * (C[j] <= sp.nT[1] ? fT : C[j] >= sp.nP ? fP : fT + (fP - fT) * (C[j] - sp.nT[1]) / (sp.nP - sp.nT[1])));
    maps = recipe(sp, stock, gv);
  }
  return maps;
}

// ---- what a set of maps does to the car in the game: its pull scaled by the mean of the torque's and the power's
// gain, its top speed by the cube root of the power's (the air's drag grows with the cube of the speed), an electronic
// limiter moved to where the map says (at most to what the power can reach)
export function gameTune(sp, ev) {
  return { kA: (ev.kNm + ev.kHp) / 2, kP: ev.kHp, kV: Math.cbrt(ev.kHp), vlim: ev.vlim, hp: ev.hp, nm: ev.nm };
}

// a car's own serial numbers, made from its key (no real car's): the make's world manufacturer code and 14 characters
export function vinFor(sp, key) {
  let h = 2166136261; for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const A = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; let s = sp.wmi || 'ZZZ';
  for (let i = 0; i < 14; i++) { h = Math.imul(h ^ (h >>> 13), 1274126177) + i; s += i > 7 ? '0123456789'[Math.abs(h) % 10] : A[Math.abs(h) % A.length]; }
  return { vin: s, sw: 'SW ' + (Math.abs(h) % 90000000 + 10000000) };
}
