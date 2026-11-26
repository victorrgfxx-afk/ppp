// (V126) CORB's laptop in Postul 7 (bunker.js): a desktop in the style of the usual office PC (a taskbar, a start
// menu, windows you drag, a file explorer) - an original one: no maker's name or logo. Everything on it works, and some
// of it reaches the world outside:
//  * Fișiere: the folders - Documente, Imagini, and the locked ones (NOR, PERSONAL: their passwords are in the post
//    and in the mail); text files open in Notițe (edits kept), pictures in a viewer, programs run;
//  * Terminal: a command line (help); scan, connect, the hacks;
//  * NOR: the anti-hail launcher on the hill over Câmpina, its radio modem never asked for a password - silver iodide
//    rockets to seed the clouds (a storm, rain) or to break them up (clear sky), and in a thunderstorm a rocket that
//    trails a wire to bring the lightning down (triggered lightning: how it is studied in the field);
//  * REȚEA: the commune's transformer station in the wood (the same levers as on the pole: power.js);
//  * AUTO: the cars near the hill - their lights, their horns, their alarms;
//  * Camere: live pictures from cameras round the commune;
//  * Mail, a diary, Mine (the old game).
// The story (the post, CORB, the storms) is invented; nothing here is a real system's or a real attack's.

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- the files
const T = {
  jurnal: `JURNAL - postul 7

12 martie
Am găsit trapa. Dealul crucii, la marginea fâneței, sub iarba înaltă. Ramă de beton, capac de oțel ruginit,
încuietoarea cu pârghie mâncată de rugină dar întreagă. Dedesubt: Postul 7 al Protecției Civile, sigilat
în 1990. Totul e cum l-au lăsat: paturile, conservele din '87, filtroventilația cu manivelă.

20 martie
Curent: am tras un cablu de la postul de transformare din pădure (PTA 20/0,4 kV). 250 de metri prin iarbă și
prin rădăcini. Bateriile țin laptopul și rackul vreo 9 ore fără rețea.

3 aprilie
Linia telefonică veche a postului (1983) merge până la centrala din comună. Cupru, nimeni nu l-a scos. Prin
ea ajung la tot ce e „pe fir" în comună: postul de transformare, felinarele, camerele.

19 mai
Lansatorul antigrindină de pe dealul de peste Câmpina are un modem radio. Comenzile nu sunt autentificate.
Rachetele cu iodură de argint „taie" norii de grindină... sau, dacă tragi altfel, îi îngroașă. Am scris un
program. I-am zis NOR.

14 iulie
Prima furtună. A plouat o oră pe deal, apa s-a strâns pe drum până la bordură. Nu mi-a venit să cred.

16 iulie
Cineva știe. Am primit un mail. Adresa asta n-ar trebui s-o știe nimeni.

18 iulie
Dacă găsește cineva laptopul: parola de la NOR e pe bilețelul galben de pe tablă. Ca un prost, știu.
PERSONAL - ziua primei furtuni, așa cum o scrii (fără spații).
`,
  istoric: `POSTUL 7 - fișa postului (copie)

Construit:      1983, de formațiunile de protecție civilă ale comunei
Destinație:     punct de comandă și adăpost pentru 12 persoane
                (1 m² de pardoseală utilă de persoană)
Alcătuire:      ieșire de salvare (trapă și scară), sas între uși metalice etanșe,
                încăperea de comandă, instalație de filtroventilație (ventilator electric
                și manivelă, filtru absorbant), paturi suprapuse, rezervă de apă
Legături:       telefon de campanie, linie telefonică spre centrala comunei, stație radio
Sigilat:        martie 1990
`,
  inventar: `INVENTAR - 12.XI.1987

conserve carne de vită ......................... 48 buc.
apă potabilă (bidoane 20 l) ..................... 10 buc.
pături .......................................... 12 buc.
lumânări ........................................ 2 cutii
lanterne 4,5 V .................................. 3 buc.
baterii plate 4,5 V ............................. 24 buc.
trusă sanitară .................................. 1
măști de protecție .............................. 12 buc.
cartuș de rezervă pentru filtrul absorbant ...... 1
`,
  todo: `DE FĂCUT
- schimb cartușul filtrului (e din '86!)
- nu lăsa trapa deschisă când plouă
- camera 3 face condens
- bateriile: 2 din 6 țin tot mai puțin
- C. - cine e??
`,
  lansari: `LG-12 · jurnalul lansărilor (NOR)
2025-07-14 15:41:07  însămânțare  x6  AgI  ->  ecou 46 dBZ la 15:58
2025-07-14 16:02:11  însămânțare  x4  AgI  ->  ploaie torențială pe deal
2025-07-16 13:20:40  dispersare   x6  AgI  ->  cer senin la 13:51
2025-07-18 17:05:02  trăsnet      x1  fir  ->  descărcare la 30 m de cruce
`,
  protocol: `LG-12 - note (CORB)

Lansatorul primește comenzi pe radio. N-are autentificare: oricine are modemul potrivit poate trage.
Rachetele duc iodură de argint în nor. Trase la baza norului de grindină îl „rup" (asta e menirea lor).
Trase devreme, în celula care abia crește, o hrănesc: ploaia vine mai repede și mai multă.
Racheta cu fir: urcă cu un fir subțire după ea, iar trăsnetul o urmează în jos. Așa se studiază trăsnetul
pe teren. Numai într-o furtună cu trăsnete.

18 rachete în lansator. Se reîncarcă singur (în joc: câte una la două minute).
`,
  scada: `[pta-20kv]
model      = PTA 20/0,4 kV, 100 kVA
legătură   = linia telefonică a postului -> RTU din cutia de distribuție
comenzi    = IG (întreruptorul general), IP (iluminatul public), L1 L2 L3 (siguranțele fazelor)
atenție    = siguranțele nu se scot în sarcină; întâi IG
`,
  camere: `[camere]
# camerele comunei pe care le văd prin linia postului
`,
  ultim: `Dacă citești asta, ai găsit trapa. Bine.

Nu mai sunt aici. Pe 18 iulie am urcat la cruce să văd furtuna pe care o făcusem eu. Am tras racheta cu fir
și trăsnetul a coborât pe ea la treizeci de metri de mine. Am simțit cum mi se ridică părul pe brațe și am
înțeles că jucăria asta nu e a mea.

Am lăsat totul pornit. NOR, REȚEA, camerele. Poate cineva o să le folosească mai bine.
Sau poate o să facă aceeași greșeală.

Un singur lucru: apa care se strânge pe drumuri după furtunile mele curge în curțile cuiva.

- CORB
`,
};
const MAIL = [
  { from: 'necunoscut', subj: 'Știu ce faci pe deal', date: '16 iul, 23:12', body: 'Ploaia de alaltăieri nu era în nicio prognoză. Nici cea de azi.\nOprește-te până nu rănești pe cineva.\n\n- C.' },
  { from: 'Mihai (vecin)', subj: 'Ai văzut drumul?', date: '14 iul, 18:40', body: 'Salut! Ai văzut ce a fost pe drum după-amiază? Apa până la bordură, la vale curgea ca un pârâu.\nMașina am lăsat-o sus, lângă cruce. Tu unde ai fost? Nu te-am văzut toată ziua.' },
  { from: 'necunoscut', subj: 're: cine ești', date: '17 iul, 02:05', body: 'Nu contează cine sunt. Contează că lansatorul de pe deal nu e al tău.\nIar parola de la PERSONAL e ziua în care ai început. Schimb-o.\n\n- C.' },
  { from: 'stația meteo a comunei', subj: 'Raport automat: precipitații', date: '14 iul, 19:00', body: 'Precipitații în ultimele 3 ore: 61,4 mm. Intensitate maximă: 92 mm/h la 16:20.\nVânt la rafală: 21 m/s. Trăsnete în rază de 5 km: 37.' },
];

// ---------------------------------------------------------------- the styles
const CSS = `
#lap{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(8,10,12,.55),rgba(0,0,0,.92));font-family:"Segoe UI",system-ui,sans-serif;user-select:none}
#lap .bez{background:#16181b;border-radius:16px;padding:22px 22px 30px;box-shadow:0 30px 80px rgba(0,0,0,.8),inset 0 0 0 1px #2a2d31;position:relative}
#lap .bez:before{content:'';position:absolute;top:8px;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#0b0c0d;box-shadow:0 0 0 1px #2c3035}
#lap .scr{position:relative;width:min(94vw,calc(84vh*1.6));aspect-ratio:16/10;overflow:hidden;background:#0b1220;border-radius:3px;color:#1b1b1b}
#lap .desk{position:absolute;inset:0 0 44px 0;background:radial-gradient(ellipse at 70% 40%,#1d3150,#0a1322 70%);overflow:hidden}
#lap .desk svg.raven{position:absolute;right:7%;bottom:12%;width:30%;opacity:.13}
#lap .desk .wm{position:absolute;right:7.5%;bottom:7%;color:#9fb6d8;opacity:.28;font:600 13px/1 "Segoe UI",system-ui;letter-spacing:.3em}
#lap .icons{position:absolute;left:10px;top:10px;display:grid;grid-auto-flow:column;grid-template-rows:repeat(5,92px);gap:4px 6px}
#lap .ico{width:84px;height:88px;display:flex;flex-direction:column;align-items:center;gap:4px;color:#eef2f8;font-size:12px;text-align:center;border-radius:6px;padding-top:6px;cursor:default;text-shadow:0 1px 2px #000}
#lap .ico:hover{background:rgba(255,255,255,.08)} #lap .ico.sel{background:rgba(120,170,255,.25)}
#lap .ico i{font-style:normal;font-size:34px;line-height:40px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
#lap .tbar{position:absolute;left:0;right:0;bottom:0;height:44px;background:rgba(22,26,34,.92);backdrop-filter:blur(8px);display:flex;align-items:center;gap:4px;padding:0 8px;color:#e8ecf2;font-size:12px;border-top:1px solid rgba(255,255,255,.06)}
#lap .tbar .st{width:40px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer}
#lap .tbar .st:hover,#lap .tbar .tb:hover{background:rgba(255,255,255,.1)}
#lap .tbar .tb{height:34px;min-width:34px;max-width:160px;padding:0 10px;border-radius:6px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:2px solid transparent}
#lap .tbar .tb.on{background:rgba(255,255,255,.08);border-bottom-color:#7fb2ff}
#lap .tbar .tray{margin-left:auto;display:flex;align-items:center;gap:12px;padding-right:6px}
#lap .tbar .clk{text-align:right;line-height:1.25}
#lap .smenu{position:absolute;left:8px;bottom:52px;width:340px;max-height:calc(100% - 64px);overflow:auto;box-sizing:border-box;background:rgba(30,34,44,.97);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.6);color:#eef2f8;padding:14px;display:none;z-index:9000}
#lap .smenu .u{display:flex;align-items:center;gap:10px;padding:6px 6px 12px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:8px}
#lap .smenu .u b{display:block;font-size:14px} #lap .smenu .u span{font-size:11px;opacity:.6}
#lap .smenu .it{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:13px}
#lap .smenu .it:hover{background:rgba(255,255,255,.08)}
#lap .win{position:absolute;background:#f3f4f6;border-radius:8px;box-shadow:0 14px 48px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;min-width:280px;min-height:160px}
#lap .win.dark{background:#0d0f12;color:#d6dde6}
#lap .win .tt{height:32px;display:flex;align-items:center;gap:8px;padding-left:10px;font-size:12px;background:rgba(0,0,0,.03);flex:none;cursor:default}
#lap .win.dark .tt{background:#17191d;color:#c8d0da}
#lap .win .tt .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lap .win .tt button{width:44px;height:32px;border:0;background:transparent;color:inherit;font-size:14px;cursor:pointer}
#lap .win .tt button:hover{background:rgba(127,127,127,.18)} #lap .win .tt button.x:hover{background:#c42b1c;color:#fff}
#lap .win .bd{flex:1;overflow:auto;position:relative;font-size:13px}
#lap .win .rs{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize}
#lap .ex{display:flex;height:100%}
#lap .ex .side{width:150px;background:#eceef2;padding:8px 4px;font-size:12px;flex:none;overflow:auto}
#lap .ex .side div{padding:5px 8px;border-radius:4px;cursor:pointer;white-space:nowrap} #lap .ex .side div:hover{background:#dde3ee}
#lap .ex .main{flex:1;display:flex;flex-direction:column;min-width:0}
#lap .ex .path{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid #dde1e7;font-size:12px}
#lap .ex .path button{border:0;background:#e3e7ee;border-radius:4px;padding:3px 8px;cursor:pointer}
#lap .ex .path .crumb{flex:1;background:#fff;border:1px solid #d5dae2;border-radius:4px;padding:4px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lap .ex table{width:100%;border-collapse:collapse;font-size:12px}
#lap .ex th{text-align:left;font-weight:500;color:#555;padding:5px 8px;border-bottom:1px solid #e1e4ea;position:sticky;top:0;background:#f7f8fa}
#lap .ex td{padding:5px 8px;white-space:nowrap} #lap .ex tr.r:hover td{background:#e8effa} #lap .ex tr.r.sel td{background:#cfe0fb}
#lap textarea.np{width:100%;height:100%;border:0;resize:none;outline:0;padding:10px;font:13px/1.45 Consolas,"Courier New",monospace;background:#fff;color:#111;box-sizing:border-box}
#lap .term{height:100%;background:#0b0d10;color:#c7f7c7;font:13px/1.4 Consolas,"Courier New",monospace;padding:8px 10px;box-sizing:border-box;overflow:auto;white-space:pre-wrap;word-break:break-word}
#lap .term .in{display:flex} #lap .term input{flex:1;background:transparent;border:0;outline:0;color:#e9ffe9;font:inherit;caret-color:#7dff7d}
#lap .term .g{color:#7dff7d} #lap .term .r{color:#ff6b6b} #lap .term .y{color:#ffd166} #lap .term .c{color:#6cc8ff} #lap .term .d{color:#7b8794}
#lap .dlg{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9500}
#lap .dlg .box{background:#f3f4f6;border-radius:8px;padding:18px 20px;width:330px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
#lap .dlg h4{margin:0 0 6px;font-size:14px} #lap .dlg p{margin:0 0 10px;font-size:12px;color:#444}
#lap .dlg input{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #b9c0cb;border-radius:4px;font-size:13px}
#lap .dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
#lap .btn{border:0;border-radius:4px;padding:6px 14px;font-size:12px;cursor:pointer;background:#e1e5ec;color:#111}
#lap .btn.pri{background:#2f6fe4;color:#fff} #lap .btn:disabled{opacity:.45;cursor:default}
#lap .app{padding:12px;box-sizing:border-box;height:100%}
#lap .dark .app{color:#d6dde6}
#lap .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#lap .card{background:#151a21;border:1px solid #232b36;border-radius:8px;padding:10px}
#lap .card h5{margin:0 0 8px;font-size:12px;font-weight:600;color:#9fb3c8;letter-spacing:.04em;text-transform:uppercase}
#lap .kv{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:12px} #lap .kv span{color:#8193a8}
#lap .big{display:flex;flex-wrap:wrap;gap:8px} #lap .big .btn{padding:8px 12px}
#lap .dark .btn{background:#222a35;color:#dfe7f1} #lap .dark .btn:hover:not(:disabled){background:#2c3746} #lap .dark .btn.pri{background:#2f6fe4;color:#fff}
#lap .dark .btn.red{background:#7d1f1f} #lap .dark .btn.grn{background:#1f6b3a}
#lap .sw{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #222a35;font-size:12px}
#lap .led{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#555} #lap .led.on{background:#3ddc6b;box-shadow:0 0 6px #3ddc6b} #lap .led.off{background:#e0443e}
#lap .cams{display:grid;grid-template-columns:1fr 1fr;gap:6px;height:100%;box-sizing:border-box;padding:6px;background:#000}
#lap .cam{position:relative;background:#111;overflow:hidden;cursor:pointer} #lap .cam canvas{width:100%;height:100%;display:block;object-fit:cover}
#lap .cam .lb{position:absolute;left:6px;top:4px;color:#fff;font:11px Consolas,monospace;text-shadow:0 1px 2px #000}
#lap .cam .rec{position:absolute;right:6px;top:4px;color:#ff4040;font:11px Consolas,monospace}
#lap .mail{display:flex;height:100%} #lap .mail .lst{width:240px;border-right:1px solid #dde1e7;overflow:auto;flex:none;background:#fafbfc}
#lap .mail .m{padding:9px 10px;border-bottom:1px solid #eceff3;cursor:pointer;font-size:12px} #lap .mail .m b{display:block;font-size:12px} #lap .mail .m:hover{background:#eef3fb} #lap .mail .m.sel{background:#dbe7fb}
#lap .mail .rd{flex:1;padding:14px 18px;font-size:13px;white-space:pre-wrap;overflow:auto}
#lap .mine{padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;background:#c9ccd1;height:100%;box-sizing:border-box}
#lap .mine .hd{display:flex;gap:16px;font:600 14px Consolas,monospace}
#lap .mine .gr{display:grid;gap:1px;background:#8d939b;padding:1px}
#lap .mine .q{width:22px;height:22px;background:#dfe2e6;display:flex;align-items:center;justify-content:center;font:700 13px Consolas,monospace;cursor:pointer;box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #8d939b}
#lap .mine .q.o{background:#eef0f2;box-shadow:none;cursor:default} #lap .mine .q.b{background:#e24b4b}
#lap .img{height:100%;display:flex;align-items:center;justify-content:center;background:#1b1d20} #lap .img canvas{max-width:100%;max-height:100%}
#lap .toastL{position:absolute;right:14px;bottom:56px;background:rgba(28,33,42,.96);color:#e9eef5;border-radius:8px;padding:10px 14px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:320px;z-index:9800;border-left:3px solid #7fb2ff}
#lap,#lap .lock{outline:none}
#lap .lock{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,#203a5e,#060a12);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#eef3fa;z-index:9900;cursor:pointer}
#lap .lock .t{font:200 88px/1 "Segoe UI",system-ui} #lap .lock .d{font-size:16px;opacity:.8;margin-top:6px} #lap .lock .h{margin-top:40px;font-size:13px;opacity:.6}
`;
const RAVEN = `<svg class="raven" viewBox="0 0 200 140"><path fill="#c9dcff" d="M10 92c22-6 40-20 56-38 10-11 18-24 34-30 12-4 24-1 32 8l14-4-6 12c8 10 10 22 6 34 12 4 26 10 44 22-22-2-38-4-52-2-8 14-24 24-44 26l10 18-16-6-6-12c-26 0-52-8-72-28z"/></svg>`;
const ICONS = { fisiere: '📁', notite: '📝', terminal: '⌨️', nor: '⛈️', retea: '⚡', auto: '🚗', camere: '📹', mail: '✉️', mine: '💣', imagine: '🖼️', cos: '🗑️' };

export class Laptop {
  // o: { audio, store, hooks: { weather(), setWeather(k), hour(), setHour(h), power(), setPower(k, on), cars(),
  //   carAct(v, what), strike(), storm(), cams(), cctv(i, canvas), map(canvas) }, onClose }
  constructor(o) {
    Object.assign(this, o);
    this.open = false; this.root = null; this.wins = []; this.z = 10; this.booted = false;
    const st = this.store?.get('laptop', {}) ?? {};
    this.unlocked = st.unlocked ?? {}; this.notes = st.notes ?? {};
    this.rockets = 18; this.reload = 0; this.pending = [];   // (NOR's launches under way)
    this.alarms = [];                                          // (the cars' alarms going)
    this.fs = this.makeFS();
    this.camI = 0; this.camT = 0;
  }
  save() { this.store?.set('laptop', { unlocked: this.unlocked, notes: this.notes }); }
  beep(f = 880, g = 0.04, d = 0.04) { try { if (this.audio?.ctx?.state === 'running') this.audio.ring([f], [g], [d], 0); } catch (_) { /* no sound */ } }

  // ---- the files: folders { kids, lock }, files { kind, text | draw | app }
  makeFS() {
    const f = (name, kind, x = {}) => ({ name, kind, date: x.date ?? '18.07.2025 23:58', size: x.size ?? (x.text ? Math.ceil(x.text.length / 1024) + ' KB' : x.app ? '2.304 KB' : '96 KB'), ...x });
    const d = (name, kids, x = {}) => ({ name, kind: 'dir', kids, date: x.date ?? '18.07.2025', ...x });
    return d('corb', [
      d('Desktop', []),
      d('Documente', [f('jurnal.txt', 'txt', { text: T.jurnal }), f('postul7_istoric.txt', 'txt', { text: T.istoric, date: '03.04.2025 21:14' }), f('inventar_1987.txt', 'txt', { text: T.inventar, date: '12.11.1987 08:00' }), f('de_facut.txt', 'txt', { text: T.todo })]),
      d('Imagini', [f('harta_comunei.png', 'img', { draw: 'map' }), f('radar_14iul.png', 'img', { draw: 'radar' })]),
      d('NOR', [f('nor.exe', 'exe', { app: 'nor' }), f('lansari.log', 'txt', { text: T.lansari, ro: true }), f('protocol_LG12.txt', 'txt', { text: T.protocol })], { lock: 'grindina1983' }),
      d('RETEA', [f('retea.exe', 'exe', { app: 'retea' }), f('pta_scada.cfg', 'txt', { text: T.scada, ro: true })]),
      d('AUTO', [f('auto.exe', 'exe', { app: 'auto' })]),
      d('CAMERE', [f('camere.exe', 'exe', { app: 'camere' }), f('camere.cfg', 'txt', { text: T.camere + (this.hooks?.cams?.() ?? []).map((c, i) => `cam${pad2(i + 1)} = ${c.name}`).join('\n'), ro: true })]),
      d('PERSONAL', [f('ultimul_mesaj.txt', 'txt', { text: T.ultim, ro: true })], { lock: '14iulie' }),
    ]);
  }
  node(path) { let n = this.fs; for (const p of path) { n = n.kids.find(k => k.name === p); if (!n) return null; } return n; }

  // ---- the screen
  build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const r = this.root = document.createElement('div'); r.id = 'lap';
    r.innerHTML = `<div class="bez"><div class="scr"><div class="desk">${RAVEN}<div class="wm">POSTUL 7</div><div class="icons"></div></div><div class="wins"></div>
      <div class="tbar"><div class="st" title="Start"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8.6" fill="none" stroke="#7fb2ff" stroke-width="2"/><path d="M7.2 7.2h7.6l-4.6 8.4" fill="none" stroke="#7fb2ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg></div><div class="tasks" style="display:flex;gap:4px"></div>
      <div class="tray"><span title="Fără internet: doar linia postului">⇅ linie</span><span class="bat" title="Bateriile postului">🔋</span><div class="clk"></div></div></div>
      <div class="smenu"></div></div></div>`;
    document.body.appendChild(r);
    this.$scr = r.querySelector('.scr'); this.$wins = r.querySelector('.wins'); this.$tasks = r.querySelector('.tasks'); this.$clk = r.querySelector('.clk'); this.$bat = r.querySelector('.bat');
    this.$menu = r.querySelector('.smenu');
    const icons = r.querySelector('.icons');
    const desk = [['fisiere', 'Fișiere'], ['terminal', 'Terminal'], ['nor', 'NOR'], ['retea', 'REȚEA'], ['auto', 'AUTO'], ['camere', 'Camere'], ['mail', 'Mail'], ['notite', 'Notițe'], ['mine', 'Mine'], ['cos', 'Coș']];
    icons.innerHTML = desk.map(([k, n]) => `<div class="ico" data-app="${k}"><i>${ICONS[k]}</i>${n}</div>`).join('');
    icons.addEventListener('click', (e) => { const i = e.target.closest('.ico'); icons.querySelectorAll('.ico').forEach(x => x.classList.toggle('sel', x === i)); });
    icons.addEventListener('dblclick', (e) => { const i = e.target.closest('.ico'); if (i) this.launch(i.dataset.app); });
    this.$menu.innerHTML = `<div class="u"><div style="font-size:30px">🐦‍⬛</div><div><b>corb</b><span>postul7 · administrator</span></div></div>` +
      desk.filter(([k]) => k !== 'cos').map(([k, n]) => `<div class="it" data-app="${k}">${ICONS[k]} ${n}</div>`).join('') + `<div class="it" data-app="__close" style="margin-top:6px;border-top:1px solid rgba(255,255,255,.08)">⏻ Închide laptopul</div>`;
    this.$menu.addEventListener('click', (e) => { const i = e.target.closest('.it'); if (!i) return; this.$menu.style.display = 'none'; if (i.dataset.app === '__close') this.close(); else this.launch(i.dataset.app); });
    r.querySelector('.st').addEventListener('click', () => { this.$menu.style.display = this.$menu.style.display === 'block' ? 'none' : 'block'; });
    r.querySelector('.desk').addEventListener('mousedown', (e) => { if (!e.target.closest('.ico')) this.$menu.style.display = 'none'; });
    r.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); const dlg = this.$scr.querySelector('.dlg'); if (dlg) dlg.remove(); else this.close(); } });
    r.addEventListener('keyup', (e) => e.stopPropagation());
    r.tabIndex = -1;
  }
  show() {
    if (!this.root) this.build();
    this.root.style.display = 'flex'; this.open = true; this.root.focus();
    if (!this.booted) {
      this.booted = true;
      const lk = document.createElement('div'); lk.className = 'lock';
      lk.innerHTML = `<div class="t">${this.timeStr()}</div><div class="d">Postul 7 · corb</div><div class="h">Clic sau Enter: laptopul nu are parolă (CORB l-a lăsat deschis)</div>`;
      const go = () => { lk.remove(); this.beep(660, 0.05, 0.08); this.toast('Bun venit, corb. Ultima conectare: 18 iulie, 23:58'); };
      lk.addEventListener('click', go); lk.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); lk.tabIndex = 0;
      this.$scr.appendChild(lk); setTimeout(() => lk.focus(), 0);
    }
  }
  close() { if (!this.root) return; this.root.style.display = 'none'; this.open = false; this.onClose?.(); }
  timeStr() { const h = this.hooks?.hour?.() ?? 12; return `${pad2(Math.floor(h))}:${pad2(Math.floor((h % 1) * 60))}`; }
  toast(msg, s = 4) {
    if (!this.$scr) return;
    const t = document.createElement('div'); t.className = 'toastL'; t.textContent = msg; this.$scr.appendChild(t);
    setTimeout(() => t.remove(), s * 1000);
  }

  // ---- windows
  win(app, title, w, h, opts = {}) {
    const same = this.wins.find(x => x.app === app && !opts.multi);
    if (same) { this.focus(same); if (same.min) this.unmin(same); return null; }
    const el = document.createElement('div'); el.className = 'win' + (opts.dark ? ' dark' : '');
    const W = this.$scr.clientWidth, H = this.$scr.clientHeight - 44;
    w = Math.min(w, W - 20); h = Math.min(h, H - 20);
    const n = this.wins.length, x = Math.max(10, Math.min(W - w - 10, (W - w) / 2 + (n % 5) * 26 - 50)), y = Math.max(8, Math.min(H - h - 8, (H - h) / 2 + (n % 5) * 22 - 40));
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    el.innerHTML = `<div class="tt"><span>${ICONS[app] ?? '▫'}</span><span class="nm">${esc(title)}</span><button data-w="min">─</button><button data-w="max">☐</button><button class="x" data-w="x">✕</button></div><div class="bd"></div><div class="rs"></div>`;
    this.$wins.appendChild(el);
    const W0 = { app, el, title, bd: el.querySelector('.bd'), min: false, max: false, onClose: null };
    this.wins.push(W0);
    const tb = document.createElement('div'); tb.className = 'tb'; tb.innerHTML = `${ICONS[app] ?? '▫'} <span>${esc(title)}</span>`; this.$tasks.appendChild(tb); W0.tb = tb;
    tb.addEventListener('click', () => { if (W0.min) this.unmin(W0); else if (W0.el.style.zIndex == this.z) this.minimize(W0); else this.focus(W0); });
    el.addEventListener('mousedown', () => this.focus(W0));
    el.querySelector('.tt').addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || W0.max) return;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, k = this.scale();
      const mv = (ev) => { el.style.left = Math.max(-w + 60, Math.min(W - 60, ox + (ev.clientX - sx) / k)) + 'px'; el.style.top = Math.max(0, Math.min(H - 32, oy + (ev.clientY - sy) / k)) + 'px'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    el.querySelector('.tt').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.maxi(W0); });
    el.querySelector('.rs').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ow = el.offsetWidth, oh = el.offsetHeight, k = this.scale();
      const mv = (ev) => { el.style.width = Math.max(280, ow + (ev.clientX - sx) / k) + 'px'; el.style.height = Math.max(160, oh + (ev.clientY - sy) / k) + 'px'; W0.onResize?.(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    el.querySelector('.tt').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.w === 'x') this.closeWin(W0); else if (b.dataset.w === 'min') this.minimize(W0); else this.maxi(W0);
    });
    this.focus(W0);
    return W0;
  }
  scale() { const r = this.$scr.getBoundingClientRect(); return r.width / this.$scr.offsetWidth || 1; }
  focus(w) { w.el.style.zIndex = ++this.z; this.wins.forEach(x => x.tb.classList.toggle('on', x === w)); }
  minimize(w) { w.min = true; w.el.style.display = 'none'; w.tb.classList.remove('on'); }
  unmin(w) { w.min = false; w.el.style.display = 'flex'; this.focus(w); }
  maxi(w) {
    if (!w.max) { w.prev = w.el.style.cssText; w.el.style.left = '0px'; w.el.style.top = '0px'; w.el.style.width = '100%'; w.el.style.height = 'calc(100% - 44px)'; w.el.style.borderRadius = '0'; }
    else { w.el.style.cssText = w.prev; }
    w.max = !w.max; this.focus(w); w.onResize?.();
  }
  closeWin(w) { w.onClose?.(); w.el.remove(); w.tb.remove(); this.wins = this.wins.filter(x => x !== w); }

  launch(app, arg) {
    const A = {
      fisiere: () => this.explorer(arg ?? []), notite: () => this.notepad(arg ?? null), terminal: () => this.terminal(), nor: () => this.nor(), retea: () => this.retea(),
      auto: () => this.auto(), camere: () => this.camere(), mail: () => this.mail(), mine: () => this.mine(), cos: () => this.toast('Coșul de gunoi e gol. CORB nu șterge nimic.'),
    };
    // (the programs in the locked folders run only once they are open)
    if (app === 'nor' && !this.unlocked.NOR) { this.ask(['NOR'], () => this.nor()); return; }
    A[app]?.();
  }
  ask(path, then) {
    const n = this.node(path);
    const dl = document.createElement('div'); dl.className = 'dlg';
    dl.innerHTML = `<div class="box"><h4>🔒 ${esc(n.name)} este criptat</h4><p>Introdu parola ca să deschizi folderul.</p><input type="password" autocomplete="off"><div class="row"><button class="btn" data-a="no">Anulează</button><button class="btn pri" data-a="ok">Deschide</button></div></div>`;
    this.$scr.appendChild(dl);
    const inp = dl.querySelector('input'); setTimeout(() => inp.focus(), 0);
    const ok = () => {
      if (inp.value.trim().toLowerCase().replace(/\s+/g, '') === n.lock) { this.unlocked[n.name] = true; this.save(); dl.remove(); this.beep(880, 0.05, 0.06); this.toast(`Acces permis: ${n.name}`); then?.(); }
      else { inp.value = ''; inp.style.borderColor = '#c42b1c'; dl.querySelector('p').textContent = 'Parolă greșită. (Indiciu: caută prin post și prin mail.)'; this.beep(220, 0.05, 0.12); }
    };
    dl.addEventListener('click', (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'ok') ok(); else if (a === 'no') dl.remove(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }

  // ---- Fișiere
  explorer(path) {
    const W = this.win('fisiere', 'Fișiere', 760, 470); if (!W) return;
    const quick = ['Desktop', 'Documente', 'Imagini', 'NOR', 'RETEA', 'AUTO', 'CAMERE', 'PERSONAL'];
    let cur = path;
    const draw = () => {
      const n = this.node(cur);
      W.el.querySelector('.nm').textContent = 'Fișiere - ' + (cur.at(-1) ?? 'corb');
      W.bd.innerHTML = `<div class="ex"><div class="side"><div data-q="">🏠 corb</div>${quick.map(q => `<div data-q="${q}">${this.node([q])?.lock && !this.unlocked[q] ? '🔒' : '📁'} ${q}</div>`).join('')}</div>
        <div class="main"><div class="path"><button data-up="1">↑</button><div class="crumb">C:\\Utilizatori\\corb${cur.map(p => '\\' + esc(p)).join('')}</div></div>
        <div style="overflow:auto;flex:1"><table><tr><th>Nume</th><th>Data modificării</th><th>Tip</th><th>Dimensiune</th></tr>
        ${n.kids.length ? n.kids.map((k, i) => `<tr class="r" data-i="${i}"><td>${k.kind === 'dir' ? (k.lock && !this.unlocked[k.name] ? '🔒' : '📁') : k.kind === 'img' ? '🖼️' : k.kind === 'exe' ? '⚙️' : '📄'} ${esc(k.name)}</td><td>${k.date}</td><td>${{ dir: 'Folder', txt: 'Text', img: 'Imagine PNG', exe: 'Aplicație' }[k.kind]}</td><td>${k.kind === 'dir' ? '' : k.size}</td></tr>`).join('') : '<tr><td colspan="4" style="color:#888;padding:20px">Folderul e gol.</td></tr>'}</table></div></div></div>`;
    };
    const go = (p) => {
      const n = this.node(p);
      if (n?.lock && !this.unlocked[n.name]) { this.ask(p, () => { cur = p; draw(); }); return; }
      cur = p; draw();
    };
    W.bd.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]'); if (q) { go(q.dataset.q ? [q.dataset.q] : []); return; }
      if (e.target.closest('[data-up]')) { go(cur.slice(0, -1)); return; }
      const r = e.target.closest('tr.r'); if (r) { W.bd.querySelectorAll('tr.r').forEach(x => x.classList.toggle('sel', x === r)); }
    });
    W.bd.addEventListener('dblclick', (e) => {
      const r = e.target.closest('tr.r'); if (!r) return;
      const k = this.node(cur).kids[+r.dataset.i];
      if (k.kind === 'dir') go([...cur, k.name]);
      else if (k.kind === 'txt') this.notepad({ path: [...cur, k.name], node: k });
      else if (k.kind === 'img') this.viewer(k);
      else if (k.kind === 'exe') this.launch(k.app);
    });
    go(cur);
  }
  // ---- Notițe
  notepad(f) {
    const key = f ? f.path.join('/') : 'nou.txt';
    const W = this.win('notite', (f ? f.node.name : 'nou.txt') + ' - Notițe', 640, 440, { multi: true }); if (!W) return;
    const ta = document.createElement('textarea'); ta.className = 'np'; ta.spellcheck = false;
    ta.value = this.notes[key] ?? (f?.node.text ?? '');
    if (f?.node.ro) ta.readOnly = true;
    ta.addEventListener('input', () => { this.notes[key] = ta.value; this.save(); });
    W.bd.appendChild(ta); setTimeout(() => ta.focus(), 0);
  }
  // ---- a picture
  viewer(k) {
    const W = this.win('imagine', k.name, 620, 470, { multi: true }); if (!W) return;
    W.bd.innerHTML = '<div class="img"><canvas width="800" height="600"></canvas></div>';
    const c = W.bd.querySelector('canvas'), g = c.getContext('2d');
    if (k.draw === 'map') { if (!this.hooks?.map?.(c)) { g.fillStyle = '#222'; g.fillRect(0, 0, 800, 600); g.fillStyle = '#aaa'; g.fillText('hartă indisponibilă', 340, 300); } }
    else this.drawRadar(g, 800, 600, 'furtuna');
  }
  // ---- Terminal
  terminal() {
    const W = this.win('terminal', 'Terminal - corb@postul7', 720, 430, { dark: true }); if (!W) return;
    W.bd.innerHTML = '<div class="term"><div class="out"></div><div class="in"><span class="g">corb@postul7</span>:<span class="c">~</span>$&nbsp;<input spellcheck="false" autocomplete="off"></div></div>';
    const $o = W.bd.querySelector('.out'), $i = W.bd.querySelector('input'), $t = W.bd.querySelector('.term');
    let cwd = [], hist = [], hi = 0, conn = null;
    const out = (s, cls = '') => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = s; $o.appendChild(d); $t.scrollTop = $t.scrollHeight; };
    const slow = async (lines, ms = 90) => { for (const [s, c] of lines) { out(s, c); await new Promise(r => setTimeout(r, ms)); } };
    out('Postul 7 · terminal (CORB). Scrie <span class="y">help</span> pentru comenzi.', 'd');
    const devs = () => {
      const L = [['pta-20kv', 'postul de transformare din pădure (RTU pe linia postului)'], ['ilum-public', 'comanda iluminatului public'], ['lg12', 'lansatorul antigrindină de peste Câmpina (modem radio)'], ['ntp', 'ceasul comunei (server de timp)']];
      (this.hooks?.cams?.() ?? []).forEach((c, i) => L.push([`cam${pad2(i + 1)}`, c.name]));
      (this.hooks?.cars?.() ?? []).slice(0, 8).forEach(v => L.push([v.id, `${v.name} · ${v.dist} m · cheie fără contact`]));
      return L;
    };
    const run = async (line) => {
      const a = line.trim().split(/\s+/), cmd = (a[0] || '').toLowerCase();
      if (!cmd) return;
      const H = this.hooks ?? {};
      switch (cmd) {
        case 'help': out(['<span class="y">Comenzi</span>', '  ls / dir [folder]      ce e în folder', '  cd &lt;folder&gt; / cd ..    schimbă folderul', '  cat / type &lt;fișier&gt;    arată un fișier', '  unlock &lt;folder&gt; &lt;parolă&gt; deschide un folder criptat', '  whoami, ipconfig, ping &lt;gazdă&gt;, clear, exit',
          '<span class="y">Pe linie</span>', '  scan                   ce se vede pe linia postului', '  connect &lt;dispozitiv&gt;   te conectezi', '  power status|on|off [IG|IP|L1|L2|L3]   postul de transformare',
          '  nor status|seed|rain|clear|strike   lansatorul (seed: furtună, rain: ploaie, clear: senin, strike: trăsnet)', '  car &lt;id&gt; lights|horn|alarm   o mașină (id din scan)', '  ntp &lt;hh:mm&gt;            mută ceasul comunei (ora din joc)', '  cam &lt;nr&gt;               deschide camera'].join('\n'), ''); break;
        case 'clear': case 'cls': $o.innerHTML = ''; break;
        case 'exit': this.closeWin(W); break;
        case 'whoami': out('postul7\\corb  (administrator)'); break;
        case 'ipconfig': out('eth0   10.7.0.2/24   gw 10.7.0.1 (router-ul din rack)\nline0  modem pe linia telefonică a postului, 1983 · 33,6 kbit/s\nwlan0  oprit (sub pământ nu e semnal)\nInternet: nu.'); break;
        case 'ping': out(a[1] && /^(10\.7|pta|lg12|ntp|cam)/.test(a[1]) ? `PING ${esc(a[1])}: 4 pachete trimise, 4 primite, timp ~${(38 + Math.random() * 30).toFixed(0)} ms (linia e veche)` : `PING ${esc(a[1] ?? '')}: nicio rută. Postul 7 nu are internet.`, a[1] && /^(10\.7|pta|lg12|ntp|cam)/.test(a[1]) ? '' : 'r'); break;
        case 'ls': case 'dir': {
          const p = a[1] ? (a[1] === '..' ? cwd.slice(0, -1) : [...cwd, a[1]]) : cwd, n = this.node(p);
          if (!n || n.kind !== 'dir') { out('nu există: ' + esc(a[1]), 'r'); break; }
          if (n.lock && !this.unlocked[n.name]) { out(`${esc(n.name)}: criptat. unlock ${esc(n.name)} &lt;parolă&gt;`, 'r'); break; }
          out(n.kids.map(k => (k.kind === 'dir' ? `<span class="c">${esc(k.name)}/</span>` + (k.lock && !this.unlocked[k.name] ? ' <span class="r">[criptat]</span>' : '') : esc(k.name))).join('\n') || '(gol)'); break;
        }
        case 'cd': {
          if (!a[1] || a[1] === '~') { cwd = []; break; }
          const p = a[1] === '..' ? cwd.slice(0, -1) : [...cwd, ...a[1].split(/[\\/]/).filter(Boolean)], n = this.node(p);
          if (!n || n.kind !== 'dir') { out('nu există: ' + esc(a[1]), 'r'); break; }
          if (n.lock && !this.unlocked[n.name]) { out(`${esc(n.name)}: criptat`, 'r'); break; }
          cwd = p; W.bd.querySelector('.in .c').textContent = '~' + (cwd.length ? '/' + cwd.join('/') : ''); break;
        }
        case 'cat': case 'type': {
          const n = this.node([...cwd, a[1] ?? '']);
          if (!n || n.kind === 'dir') { out('nu există: ' + esc(a[1] ?? ''), 'r'); break; }
          if (n.kind === 'txt') out(esc(this.notes[[...cwd, n.name].join('/')] ?? n.text)); else out('fișier binar (' + n.size + ')', 'd'); break;
        }
        case 'unlock': {
          const n = this.node([(a[1] ?? '').toUpperCase()]);
          if (!n?.lock) { out('nu e criptat: ' + esc(a[1] ?? ''), 'r'); break; }
          if ((a[2] ?? '').toLowerCase() === n.lock) { this.unlocked[n.name] = true; this.save(); await slow([['decriptez ' + n.name + ' ...', 'd'], ['cheie AES-256 derivată, 100000 de iterații', 'd'], ['ACCES PERMIS', 'g']], 260); }
          else out('parolă greșită', 'r'); break;
        }
        case 'scan': await slow([['scanez linia postului și radioul (433 MHz, 868 MHz, 125 kHz) ...', 'd'], ...devs().map(([k, v]) => [`<span class="g">${esc(k.padEnd(12))}</span> ${esc(v)}`, ''])], 110); break;
        case 'connect': {
          const id = (a[1] ?? '').toLowerCase(), d = devs().find(([k]) => k === id);
          if (!d) { out('nu găsesc: ' + esc(a[1] ?? '') + ' (scan)', 'r'); break; }
          await slow([[`conectare la ${esc(id)} ...`, 'd'], ['handshake ... ok', 'd'], [`<span class="g">conectat:</span> ${esc(d[1])}`, '']], 220);
          conn = id; break;
        }
        case 'power': {
          const s = H.power?.() ?? {};
          if (!a[1] || a[1] === 'status') { out(['IG', 'IP', 'L1', 'L2', 'L3'].map(k => `${k}  ${s[k] ? '<span class="g">PORNIT</span>' : '<span class="r">OPRIT</span>'}`).join('\n')); break; }
          const on = a[1] === 'on', k = (a[2] ?? 'IG').toUpperCase();
          if (!['IG', 'IP', 'L1', 'L2', 'L3'].includes(k) || !['on', 'off'].includes(a[1])) { out('power on|off IG|IP|L1|L2|L3', 'r'); break; }
          if (conn !== 'pta-20kv' && conn !== 'ilum-public') await slow([['conectare automată la pta-20kv ...', 'd']], 300);
          conn = 'pta-20kv';
          H.setPower?.(k, on); out(`${k} -> ${on ? '<span class="g">PORNIT</span>' : '<span class="r">OPRIT</span>'}`); break;
        }
        case 'nor': {
          const w = (a[1] ?? 'status').toLowerCase();
          if (!this.unlocked.NOR) { out('NOR: folderul NOR e criptat. unlock NOR &lt;parolă&gt;', 'r'); break; }
          if (w === 'status') { out(`LG-12: ${this.rockets} rachete · vremea acum: ${esc(H.weatherLabel?.() ?? '?')}` + (this.pending.length ? ` · ${this.pending.length} lansare(i) în curs` : '')); break; }
          const r = this.fire(w);
          out(r.ok ? `<span class="g">${esc(r.msg)}</span>` : `<span class="r">${esc(r.msg)}</span>`); break;
        }
        case 'car': {
          const v = (H.cars?.() ?? []).find(c => c.id === (a[1] ?? '').toLowerCase());
          if (!v) { out('car &lt;id&gt; lights|horn|alarm  (id din scan)', 'r'); break; }
          const what = (a[2] ?? 'lights').toLowerCase();
          if (!['lights', 'horn', 'alarm'].includes(what)) { out('lights|horn|alarm', 'r'); break; }
          await slow([[`${esc(v.name)}: retransmit cheia ... ok`, 'd']], 260);
          H.carAct?.(v, what); out(`<span class="g">${esc(v.name)}: ${{ lights: 'luminile', horn: 'claxonul', alarm: 'alarma' }[what]}</span>`); break;
        }
        case 'ntp': {
          const m = /^(\d{1,2}):(\d{2})$/.exec(a[1] ?? '');
          if (!m || +m[1] > 23 || +m[2] > 59) { out('ntp hh:mm', 'r'); break; }
          await slow([['serverul de timp al comunei: sincronizare forțată ...', 'd']], 300);
          H.setHour?.(+m[1] + +m[2] / 60); out(`<span class="g">ceasul comunei: ${pad2(+m[1])}:${m[2]}</span>`); break;
        }
        case 'cam': this.camere(+(a[1] ?? 1) - 1); break;
        default: out(`comandă necunoscută: ${esc(cmd)} (help)`, 'r');
      }
    };
    $i.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') { const v = $i.value; $i.value = ''; out(`<span class="g">corb@postul7</span>:<span class="c">~${cwd.length ? '/' + esc(cwd.join('/')) : ''}</span>$ ${esc(v)}`); if (v.trim()) { hist.push(v); hi = hist.length; } $i.disabled = true; try { await run(v); } finally { $i.disabled = false; $i.focus(); } }
      else if (e.key === 'ArrowUp') { if (hi > 0) $i.value = hist[--hi]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (hi < hist.length) $i.value = hist[++hi] ?? ''; e.preventDefault(); }
    });
    W.bd.addEventListener('mouseup', () => { if (!window.getSelection().toString()) $i.focus(); });
    setTimeout(() => $i.focus(), 0);
  }

  // ---- NOR: the launcher (what it does: fire())
  fire(w) {
    const H = this.hooks ?? {}, need = { seed: 6, rain: 4, clear: 6, strike: 1 }[w];
    if (!need) return { ok: false, msg: 'nor status|seed|rain|clear|strike' };
    if (this.pending.length) return { ok: false, msg: 'o lansare e deja în curs' };
    if (w === 'strike' && !H.storm?.()) return { ok: false, msg: 'trăsnet: numai într-o furtună cu trăsnete (nor seed)' };
    if (this.rockets < need) return { ok: false, msg: `prea puține rachete (${this.rockets}); lansatorul se reîncarcă` };
    this.rockets -= need;
    const delay = w === 'strike' ? 4 : w === 'clear' ? 20 : 16;
    this.pending.push({ w, t: delay, n: need });
    // the launches heard far off: a thump each, then the bang of the rocket's charge up in the cloud
    for (let i = 0; i < need; i++) setTimeout(() => { try { this.audio?.burst?.({ f: 140, q: 0.7, dur: 0.5, gain: 0.25, type: 'lowpass' }); this.audio?.burst?.({ f: 420, q: 1, dur: 0.6, gain: 0.08, delay: 1.8 }); } catch (_) { /* no sound */ } }, i * 700);
    return { ok: true, msg: { seed: `${need} rachete AgI lansate: celula de pe deal crește (furtună în ~${delay} s)`, rain: `${need} rachete: ploaie în ~${delay} s`, clear: `${need} rachete AgI la baza norului: se rupe în ~${delay} s`, strike: 'racheta cu fir urcă ... ' }[w] };
  }
  nor() {
    const W = this.win('nor', 'NOR - lansatorul LG-12', 760, 480, { dark: true }); if (!W) return;
    W.bd.innerHTML = `<div class="app"><div class="grid2" style="height:100%"><div class="card" style="display:flex;flex-direction:column"><h5>Radar · 30 km</h5><canvas width="420" height="420" style="width:100%;flex:1;object-fit:contain"></canvas></div>
      <div style="display:flex;flex-direction:column;gap:10px"><div class="card"><h5>LG-12 Câmpina</h5><div class="kv"><span>Rachete</span><b class="rk"></b><span>Vremea</span><b class="wx"></b><span>Lansare</span><b class="pd"></b></div></div>
      <div class="card"><h5>Comenzi</h5><div class="big"><button class="btn pri" data-n="seed">⛈ Însămânțare: furtună</button><button class="btn" data-n="rain">🌧 Ploaie</button><button class="btn" data-n="clear">☀ Dispersare: senin</button><button class="btn red" data-n="strike">⚡ Rachetă cu fir (trăsnet)</button></div>
      <p style="font-size:11px;color:#8193a8;margin:10px 0 0">Iodura de argint dă norului nuclee de gheață. Trasă la baza unui nor de grindină îl destramă; trasă devreme în celula care crește o hrănește. Racheta cu fir aduce trăsnetul jos, pe firul ei (așa se studiază trăsnetul pe teren).</p></div>
      <div class="card" style="flex:1;overflow:auto"><h5>Jurnal</h5><div class="lg" style="font:11px/1.5 Consolas,monospace;color:#9fb3c8"></div></div></div></div></div>`;
    const c = W.bd.querySelector('canvas'), g = c.getContext('2d'), lg = W.bd.querySelector('.lg');
    const log = (s) => { const d = document.createElement('div'); d.textContent = `${this.timeStr()}  ${s}`; lg.prepend(d); };
    W.bd.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; const r = this.fire(b.dataset.n); log(r.msg); if (!r.ok) this.beep(220, 0.04, 0.1); });
    W.tick = () => {
      this.drawRadar(g, 420, 420, this.hooks?.weather?.() ?? 'senin', performance.now() / 1000);
      W.bd.querySelector('.rk').textContent = `${this.rockets} / 18`;
      W.bd.querySelector('.wx').textContent = this.hooks?.weatherLabel?.() ?? '';
      W.bd.querySelector('.pd').textContent = this.pending.length ? `${{ seed: 'furtună', rain: 'ploaie', clear: 'senin', strike: 'trăsnet' }[this.pending[0].w]} în ${Math.ceil(this.pending[0].t)} s` : 'nimic în curs';
      W.bd.querySelectorAll('[data-n]').forEach(b => { b.disabled = !!this.pending.length || (b.dataset.n === 'strike' && !this.hooks?.storm?.()); });
    };
  }
  drawRadar(g, w, h, wx, t = 0) {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    // the echoes: stronger the worse the weather (dBZ colours: green, yellow, red, magenta)
    const k = { senin: 0, noros: 0.05, innorat: 0.15, ceata: 0.1, ploaie: 0.45, rafale: 0.6, furtuna: 1, ninsoare: 0.35, viscol: 0.6, zapada: 0.3 }[wx] ?? 0;
    const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 80 * k; i++) {
      const a = rnd(i) * 6.283 + t * 0.01, d = R * (0.1 + 0.85 * rnd(i + 99)), x = cx + Math.cos(a) * d * (i < 12 * k ? 0.35 : 1), y = cy + Math.sin(a) * d * (i < 12 * k ? 0.35 : 1);
      const s = 8 + 30 * rnd(i + 7) * k, lev = rnd(i + 3) * k + (i < 12 * k ? 0.4 : 0);
      g.fillStyle = lev > 0.95 ? 'rgba(220,40,220,.55)' : lev > 0.7 ? 'rgba(235,50,40,.5)' : lev > 0.45 ? 'rgba(240,200,40,.45)' : 'rgba(60,200,70,.35)';
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(80,160,120,.35)'; g.lineWidth = 1;
    for (const r of [0.33, 0.66, 1]) { g.beginPath(); g.arc(cx, cy, R * r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const sw = t * 1.2; g.strokeStyle = 'rgba(120,255,160,.6)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); g.stroke();
    g.fillStyle = '#ff5252'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
    g.fillStyle = '#9fb3c8'; g.font = '12px Consolas, monospace'; g.fillText('postul 7', cx + 8, cy - 6); g.fillText('N', cx - 4, cy - R - 4);
  }
  // ---- REȚEA
  retea() {
    const W = this.win('retea', 'REȚEA - postul de transformare', 560, 420, { dark: true }); if (!W) return;
    const L = { IG: 'Întreruptorul general (160 A)', IP: 'Iluminatul public', L1: 'Siguranțele fazei L1', L2: 'Siguranțele fazei L2', L3: 'Siguranțele fazei L3' };
    W.bd.innerHTML = `<div class="app"><div class="card"><h5>PTA 20/0,4 kV · 100 kVA · pădurea crucii</h5><div class="sws"></div><p style="font-size:11px;color:#8193a8;margin:8px 0 0">Comanda merge pe linia telefonică a postului la cutia de distribuție de pe stâlp. Postul 7 se hrănește tot de aici: fără curent, rămân bateriile.</p></div></div>`;
    const $s = W.bd.querySelector('.sws');
    W.tick = () => {
      const s = this.hooks?.power?.() ?? {};
      $s.innerHTML = Object.entries(L).map(([k, n]) => `<div class="sw"><span><span class="led ${s[k] ? 'on' : 'off'}"></span>${n}</span><button class="btn ${s[k] ? 'red' : 'grn'}" data-k="${k}">${s[k] ? 'Oprește' : 'Pornește'}</button></div>`).join('');
    };
    W.bd.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; const s = this.hooks?.power?.() ?? {}; this.hooks?.setPower?.(b.dataset.k, !s[b.dataset.k]); W.tick(); });
    W.tick();
  }
  // ---- AUTO
  auto() {
    const W = this.win('auto', 'AUTO - mașinile din jur', 600, 440, { dark: true }); if (!W) return;
    W.bd.innerHTML = '<div class="app"><div class="card"><h5>Mașini în raza modemului (cheie fără contact)</h5><div class="cl"></div></div></div>';
    const $c = W.bd.querySelector('.cl');
    let last = '';
    W.tick = () => {
      const cars = this.hooks?.cars?.() ?? [], key = cars.map(c => c.id).join();
      if (key === last) return; last = key;
      $c.innerHTML = cars.length ? cars.map(c => `<div class="sw"><span>🚗 ${esc(c.name)} <span style="color:#8193a8">· ${c.dist} m</span></span><span class="big"><button class="btn" data-c="${c.id}" data-w="lights">Lumini</button><button class="btn" data-c="${c.id}" data-w="horn">Claxon</button><button class="btn red" data-c="${c.id}" data-w="alarm">Alarmă</button></span></div>`).join('') : '<div style="color:#8193a8;font-size:12px">Nicio mașină în rază.</div>';
    };
    W.bd.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const v = (this.hooks?.cars?.() ?? []).find(c => c.id === b.dataset.c); if (v) { this.hooks?.carAct?.(v, b.dataset.w); this.toast(`${v.name}: ${{ lights: 'luminile', horn: 'claxonul', alarm: 'alarma (10 s)' }[b.dataset.w]}`); } });
    W.tick();
  }
  // ---- Camere: live, a few pictures a second (as such cameras send)
  camere(only = -1) {
    const cams = this.hooks?.cams?.() ?? [];
    const W = this.win('camere', 'Camere', 820, 520, { dark: true }); if (!W) return;
    let page = only >= 0 ? Math.floor(only / 4) : 0;
    const draw = () => {
      const list = cams.slice(page * 4, page * 4 + 4);
      W.bd.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div class="cams" style="flex:1">${list.map((c, i) => `<div class="cam" data-i="${page * 4 + i}"><canvas width="320" height="180"></canvas><div class="lb">CAM${pad2(page * 4 + i + 1)} · ${esc(c.name)}</div><div class="rec">● REC</div></div>`).join('')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#0b0d10;font-size:12px;color:#8193a8"><button class="btn" data-p="-1">◀</button><span>pagina ${page + 1} / ${Math.max(1, Math.ceil(cams.length / 4))} · 2-4 cadre pe secundă</span><button class="btn" data-p="1">▶</button></div></div>`;
      W.cv = [...W.bd.querySelectorAll('canvas')].map((c, i) => ({ c, i: page * 4 + i }));
    };
    W.bd.addEventListener('click', (e) => { const p = e.target.closest('[data-p]'); if (p) { page = Math.max(0, Math.min(Math.ceil(cams.length / 4) - 1, page + +p.dataset.p)); draw(); } });
    draw();
    W.k = 0;
    W.tick = () => { if (!W.cv?.length) return; const f = W.cv[W.k++ % W.cv.length]; this.hooks?.cctv?.(f.i, f.c, this.timeStr()); };
  }
  // ---- Mail
  mail() {
    const W = this.win('mail', 'Mail - corb@postul7', 720, 440); if (!W) return;
    W.bd.innerHTML = `<div class="mail"><div class="lst">${MAIL.map((m, i) => `<div class="m" data-i="${i}"><b>${esc(m.from)}</b>${esc(m.subj)}<div style="color:#888;font-size:11px">${m.date}</div></div>`).join('')}</div><div class="rd">Alege un mesaj.</div></div>`;
    W.bd.addEventListener('click', (e) => {
      const m = e.target.closest('.m'); if (!m) return;
      W.bd.querySelectorAll('.m').forEach(x => x.classList.toggle('sel', x === m));
      const M = MAIL[+m.dataset.i]; W.bd.querySelector('.rd').innerHTML = `<b>${esc(M.subj)}</b><div style="color:#666;font-size:12px;margin:4px 0 14px">De la: ${esc(M.from)} · ${M.date}</div>${esc(M.body)}`;
    });
  }
  // ---- Mine
  mine() {
    const W = this.win('mine', 'Mine', 300, 360); if (!W) return;
    const N = 9, B = 10;
    let grid, open, flag, over, left;
    const reset = () => {
      grid = Array(N * N).fill(0); open = Array(N * N).fill(false); flag = Array(N * N).fill(false); over = false; left = N * N - B;
      let b = 0; while (b < B) { const i = Math.floor(Math.random() * N * N); if (grid[i] !== -1) { grid[i] = -1; b++; } }
      for (let i = 0; i < N * N; i++) if (grid[i] !== -1) { let c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = i % N + dx, y = Math.floor(i / N) + dy; if (x >= 0 && y >= 0 && x < N && y < N && grid[y * N + x] === -1) c++; } grid[i] = c; }
      draw('🙂');
    };
    const draw = (face) => {
      const col = ['', '#1d4ed8', '#15803d', '#b91c1c', '#4338ca', '#7f1d1d', '#0e7490', '#111', '#666'];
      W.bd.innerHTML = `<div class="mine"><div class="hd"><span>💣 ${B - flag.filter(Boolean).length}</span><button class="btn" data-r="1">${face}</button></div><div class="gr" style="grid-template-columns:repeat(${N},22px)">${grid.map((v, i) => `<div class="q ${open[i] ? 'o' : ''} ${open[i] && v === -1 ? 'b' : ''}" data-i="${i}" style="color:${col[v] ?? ''}">${open[i] ? (v === -1 ? '💣' : v || '') : flag[i] ? '🚩' : ''}</div>`).join('')}</div></div>`;
    };
    const flood = (i) => { if (open[i] || flag[i]) return; open[i] = true; left--; if (grid[i] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = i % N + dx, y = Math.floor(i / N) + dy; if (x >= 0 && y >= 0 && x < N && y < N) flood(y * N + x); } };
    W.bd.addEventListener('click', (e) => {
      if (e.target.closest('[data-r]')) { reset(); return; }
      const q = e.target.closest('.q'); if (!q || over) return; const i = +q.dataset.i;
      if (grid[i] === -1) { over = true; grid.forEach((v, k) => { if (v === -1) open[k] = true; }); draw('😵'); this.beep(160, 0.06, 0.2); return; }
      flood(i); if (left === 0) { over = true; draw('😎'); this.beep(990, 0.05, 0.1); } else draw('🙂');
    });
    W.bd.addEventListener('contextmenu', (e) => { e.preventDefault(); const q = e.target.closest('.q'); if (!q || over) return; const i = +q.dataset.i; if (!open[i]) { flag[i] = !flag[i]; draw('🙂'); } });
    reset();
  }

  // ---- every frame (open or not): the launches landing, the alarms, the clock, the windows' live parts
  update(dt) {
    this.reload += dt; if (this.reload > 120 && this.rockets < 18) { this.rockets++; this.reload = 0; }
    for (const p of this.pending) p.t -= dt;
    const done = this.pending.filter(p => p.t <= 0);
    this.pending = this.pending.filter(p => p.t > 0);
    for (const p of done) {
      const H = this.hooks ?? {};
      if (p.w === 'seed') H.setWeather?.('furtuna'); else if (p.w === 'rain') H.setWeather?.('ploaie'); else if (p.w === 'clear') H.setWeather?.('senin'); else if (p.w === 'strike') H.strike?.();
      H.notify?.({ seed: 'NOR: furtuna e deasupra dealului', rain: 'NOR: plouă', clear: 'NOR: norii s-au rupt', strike: 'NOR: trăsnetul a coborât pe fir' }[p.w]);
      this.toast({ seed: 'Celula s-a făcut furtună.', rain: 'Plouă.', clear: 'Cerul s-a limpezit.', strike: 'Trăsnetul a coborât pe fir!' }[p.w]);
    }
    if (!this.open) return;
    this.camT += dt;
    if (this.$clk) { this.$clk.innerHTML = `${this.timeStr()}<br><span style="opacity:.7">18.07.2025</span>`; this.$bat.textContent = (this.hooks?.mains?.() ? '🔌' : '🔋') + ' ' + (this.hooks?.battery?.() ?? 100) + '%'; }
    if (this.camT > 0.12) { this.camT = 0; for (const w of this.wins) if (!w.min) w.tick?.(); }
  }

  // ---- the picture on the laptop's own screen in the post (bunker.js: its texture)
  drawScreen(g, W, H) {
    const gr = g.createRadialGradient(W * 0.7, H * 0.4, 10, W * 0.7, H * 0.4, W * 0.8); gr.addColorStop(0, '#1d3150'); gr.addColorStop(1, '#0a1322');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(201,220,255,0.12)'; g.beginPath(); g.ellipse(W * 0.78, H * 0.68, W * 0.13, H * 0.09, -0.2, 0, 7); g.fill();
    for (let i = 0; i < 10; i++) { const x = 10 + Math.floor(i / 5) * 46, y = 10 + (i % 5) * 46; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 10, y + 4, 22, 18); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 6, y + 28, 30, 4); }
    const open = this.wins.filter(w => !w.min);
    open.forEach((w, i) => {
      const x = W * 0.25 + i * 18, y = H * 0.12 + i * 14, ww = W * 0.5, hh = H * 0.55;
      g.fillStyle = w.el.classList.contains('dark') ? '#0d0f12' : '#f3f4f6'; g.fillRect(x, y, ww, hh);
      g.fillStyle = w.el.classList.contains('dark') ? '#17191d' : '#e4e6ea'; g.fillRect(x, y, ww, 14);
      g.fillStyle = w.app === 'terminal' ? 'rgba(125,255,125,0.7)' : 'rgba(120,130,145,0.6)';
      for (let k = 0; k < 9; k++) g.fillRect(x + 8, y + 24 + k * 12, ww * (0.3 + 0.5 * ((k * 7919) % 10) / 10), 4);
    });
    g.fillStyle = 'rgba(22,26,34,0.95)'; g.fillRect(0, H - 24, W, 24);
    g.strokeStyle = '#7fb2ff'; g.lineWidth = 2; g.beginPath(); g.arc(14, H - 12, 6, 0, 7); g.stroke();
    g.fillStyle = '#e8ecf2'; g.font = '12px sans-serif'; g.textAlign = 'right'; g.fillText(this.timeStr(), W - 8, H - 8); g.textAlign = 'left';
  }
}
