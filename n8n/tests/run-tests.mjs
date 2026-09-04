// Teste pentru nodurile Code, rulate in afara n8n.
// Mocheaza $input / $() / $json si verifica logica. Ruleaza:  node n8n/tests/run-tests.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { runNode, renderTemplate, parseCsv, toCsv, loadPrompt } from '../local/n8n-shim.mjs';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg} (primit: ${JSON.stringify(a)}, asteptat: ${JSON.stringify(b)})`); };

console.log('\nAgent A — Normalize Screenshots');
t('sparge un item cu 3 imagini in 3 item-uri pe cheia "data"', () => {
  const out = runNode('a1-normalize-screenshots.js', {
    input: [{
      json: { 'Nume client': 'Cabinet X' },
      binary: {
        Capturi_de_ecran_0: { fileName: 'ig.png', mimeType: 'image/png' },
        Capturi_de_ecran_1: { fileName: 'tt.png', mimeType: 'image/png' },
        field_2: { fileName: 'fb.jpg', mimeType: 'image/jpeg' },
      },
    }],
  });
  eq(out.length, 3, 'numar de item-uri');
  assert(out.every((o) => o.binary.data), 'toate au binary pe cheia "data"');
  eq(out[2].json.fileName, 'fb.jpg', 'numele fisierului se pastreaza');
  eq(out[0].json['Nume client'], 'Cabinet X', 'datele din formular se propaga');
});
t('arunca eroare clara daca nu exista imagini', () => {
  let threw = false;
  try { runNode('a1-normalize-screenshots.js', { input: [{ json: {}, binary: {} }] }); }
  catch (e) { threw = /nicio imagine/i.test(e.message); }
  assert(threw, 'trebuia sa arunce eroare descriptiva');
});

console.log('\nAgent A — Merge Extractions');
t('parseaza JSON in ```json, ignora raspunsurile invalide', () => {
  const out = runNode('a1-merge-extractions.js', {
    input: [
      { json: { content: '```json\n{"platform":"instagram","account":{"bio_text":"Zambete","bio_char_count":7},"confidence":"high"}\n```' } },
      { json: { content: 'Imi pare rau, nu pot analiza aceasta imagine.' } },
      { json: { content: '{"platform":"tiktok","account":{"bio_text":null},"confidence":"low"}' } },
    ],
    nodes: { 'Form Trigger': [{ json: { 'Nume client': 'Cabinet X' } }] },
  });
  const r = out[0].json;
  eq(r.extractedCount, 2, 'extractii valide');
  eq(r.failed.length, 1, 'extractii esuate');
  eq(r.covered.join(','), 'instagram,tiktok', 'platforme acoperite');
  eq(r.lowConfidence.length, 1, 'capturi cu confidence scazut');
});

console.log('\nAgent A — Build Document');
const auditMock = { json: { output: {
    overall_score: 61,
    score_rationale: 'Profil ingrijit vizual, dar bio-ul nu spune ce serviciu se vinde.',
    executive_summary: 'Rezumat.',
    quick_wins: [{ action: 'Adauga orasul in bio', time_needed: '2 minute', platform: 'instagram' }],
    content_strategy_30_days: [{ week: 1, focus: 'Incredere', post_types: ['tur cabinet', 'echipa'], goal: 'salvari' }],
    missing_data: ['Captura cu Insights > Audienta'],
    red_flags: [],
    platforms: [
      {
        platform: 'instagram', covered: true, handle: '@cabinet', current_bio: 'Zambete frumoase',
        what_works: [{ observation: 'Grid consistent', evidence: '9/9 thumbnails cu aceeasi paleta', why_it_matters: 'Creste rata de follow' }],
        what_doesnt: [{ issue: 'Bio fara serviciu', evidence: 'bio_text = "Zambete frumoase"', cost: 'Vizitatorul nu afla ce se ofera' }],
        improvements: [{ action: 'Rescrie bio', how_to: 'Serviciu + oras + CTA', impact: 'mare', effort: 'mic', expected_result: 'Mai multe click-uri pe link' }],
        bio_variants: [
          { angle: 'claritate', text: 'Implant si fatete in Cluj. Programari in 24h.', cta: 'Scrie-ne pe WhatsApp', rationale: 'Contine serviciul si orasul', char_count: 999, name_field: 'Dr. Pop | Stomatologie Estetica Cluj-Napoca' },
          { angle: 'beneficiu', text: 'Zambesti fara sa iti acoperi gura. Tratament fara durere, explicat pe intelesul tau.', cta: 'Programeaza-te', rationale: 'Vorbeste despre rezultat' },
          { angle: 'diferentiator', text: 'Acesta este un text absurd de lung, pus intentionat in test ca sa depaseasca limita de o suta cincizeci de caractere impusa de Instagram pentru campul bio.', cta: 'Suna', rationale: 'Test depasire' },
        ],
      },
      { platform: 'facebook', covered: false, bio_variants: [] },
    ],
  },
} };
t('recalculeaza numarul de caractere si marcheaza depasirea limitei', () => {
  const out = runNode('a1-build-document.js', {
    json: { id: 'FOLDER_ID_123' },
    nodes: {
      Strateg: [auditMock],
      'Form Trigger': [{ json: { 'Nume client': 'Cabinet X', 'Nișă': 'dentist' } }],
      'Merge Extractions': [{ json: { extractedCount: 3, screenshotCount: 4, failed: [{}], lowConfidence: [2] } }],
    },
  });
  const r = out[0].json;
  const v = auditMock.json.output.platforms[0].bio_variants;
  eq(v[0].char_count, 45, 'char_count recalculat (modelul spusese 999)');
  eq(v[0].over_limit, false, 'varianta 1 incape');
  eq(v[2].over_limit, true, 'varianta 3 depaseste 150');
  assert(r.flags.some((f) => /peste limita de 150/.test(f)), 'depasirea e raportata in flags');
  assert(r.flags.some((f) => /Name/.test(f)), 'campul Name peste 30 e raportat');
});
t('genereaza corp multipart valid pentru Drive (HTML -> Google Doc)', () => {
  const out = runNode('a1-build-document.js', {
    json: { id: 'FOLDER_ID_123' },
    nodes: {
      Strateg: [JSON.parse(JSON.stringify(auditMock))],
      'Form Trigger': [{ json: { 'Nume client': 'Cabinet X', 'Nișă': 'dentist' } }],
      'Merge Extractions': [{ json: { extractedCount: 3, screenshotCount: 3, failed: [], lowConfidence: [] } }],
    },
  });
  const mp = out[0].json.multipart;
  const parts = mp.split('--n8nDocBoundary');
  eq(parts.length, 4, 'doua parti + inchidere');
  assert(parts[3].startsWith('--'), 'boundary-ul de final e "--n8nDocBoundary--"');
  const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
  eq(meta.mimeType, 'application/vnd.google-apps.document', 'tinta = Google Doc');
  eq(meta.parents[0], 'FOLDER_ID_123', 'documentul merge in folderul creat');
  assert(parts[2].includes('Content-Type: text/html'), 'sursa e declarata text/html');
  assert(/<h1>Audit social media/.test(mp), 'HTML-ul contine titlul');
  assert(/Nu s-au primit capturi/.test(mp), 'platforma neacoperita e marcata, nu evaluata');
  assert(!/undefined/.test(out[0].json.html), 'HTML fara "undefined"');
});
t('esueaza explicit daca lipseste id-ul folderului', () => {
  let msg = '';
  try {
    runNode('a1-build-document.js', {
      json: {},
      nodes: { Strateg: [auditMock], 'Form Trigger': [{ json: {} }], 'Merge Extractions': [{ json: {} }] },
    });
  } catch (e) { msg = e.message; }
  assert(/id-ul folderului/.test(msg), 'mesaj de eroare descriptiv');
});

console.log('\nAgent B — Build Slice Plan');
const briefMock = [{
  json: {
    niche_key: 'dentist', niche_label: 'Cabinet stomatologic',
    audience: 'A', pains: 'P', objections: 'O', desires: 'D', services: 'S',
    proof_assets: 'PA', tone: 'T', local_context: 'LC', forbidden: 'F',
    niche_days: '03-20 Ziua Mondiala a Sanatatii Orale; 11-14 Ziua Mondiala a Diabetului',
    pillars: 'Educatie; Autoritate; Behind the scenes; Obiectii; Comunitate',
    seed_examples: 'Exemplu 1\nExemplu 2',
  },
}];
const holidaysMock = [
  { json: { date: '2026-01-01', localName: 'Anul Nou', name: "New Year's Day" } },
  { json: { date: '2026-01-24', localName: 'Unirea Principatelor Române/Mica Unire', name: 'Union Day' } },
  { json: { date: '2026-04-12', localName: 'Paștele', name: 'Easter Sunday' } },
  { json: { date: '2026-04-13', localName: 'Paștele', name: 'Easter Monday' } },
  { json: { date: '2026-12-25', localName: 'Crăciunul', name: 'Christmas Day' } },
];
const intlMock = [
  { json: { date: '03-20', name_ro: 'Ziua Mondiala a Sanatatii Orale', type: 'nisa', niches: 'dentist', movable: 'false' } },
  { json: { date: '03-20', name_ro: 'Ziua Internationala a Fericirii', type: 'international', niches: 'all', movable: 'false' } },
  { json: { date: '01-24', name_ro: 'Ziua Unirii Principatelor Romane', type: 'national', niches: 'all', movable: 'false' } },
  { json: { date: '05-03', name_ro: 'Ziua Mamei (Romania)', type: 'national', niches: 'all', movable: 'true' } },
  { json: { date: '11-27', name_ro: 'Black Friday', type: 'comercial', niches: 'all', movable: 'true' } },
  { json: { date: '10-01', name_ro: 'Ziua Internationala a Cafelei', type: 'nisa', niches: 'horeca', movable: 'false' } },
];
const startMock = [{ json: { niche_key: 'dentist', client: 'Cabinet X', year: 2026, target_ideas: 500, platforms: 'tiktok,instagram,facebook' } }];

let slicesOut;
t('construieste 22 de felii pentru tinta de 500 idei (supragenerare ~10%)', () => {
  slicesOut = runNode('b-build-slice-plan.js', {
    nodes: { Start: startMock, 'Get Niche Brief': briefMock, 'Get Public Holidays': holidaysMock, 'Get International Days': intlMock },
  });
  eq(slicesOut.length, 22, 'numar de felii');
  eq(slicesOut[0].json.ideas_per_slice, 25, 'idei per felie');
});
t('acopera toate cele 12 luni, fara gauri', () => {
  const months = new Set(slicesOut.map((s) => s.json.month));
  eq(months.size, 12, 'luni acoperite');
  eq(Math.min(...months), 1, 'prima luna');
  eq(Math.max(...months), 12, 'ultima luna');
});
t('roteste pilonii, formatele, etapele si platformele', () => {
  eq(new Set(slicesOut.map((s) => s.json.pillar)).size, 5, 'piloni distincti');
  eq(new Set(slicesOut.map((s) => s.json.format)).size, 6, 'formate distincte');
  eq(new Set(slicesOut.map((s) => s.json.funnel_stage)).size, 3, 'etape de funnel');
  eq(new Set(slicesOut.map((s) => s.json.platform)).size, 3, 'platforme');
});
t('calculeaza corect zilele mobile pentru 2026', () => {
  const may = slicesOut.find((s) => s.json.month === 5).json.occasions;
  assert(/2026-05-03 — Ziua Mamei/.test(may), `Ziua Mamei = prima duminica din mai 2026 (03.05). Primit: ${may}`);
  const nov = slicesOut.find((s) => s.json.month === 11).json.occasions;
  assert(/2026-11-27 — Black Friday/.test(nov), `Black Friday 2026 = 27.11. Primit: ${nov}`);
});
t('include sarbatorile religioase mobile din API (Pastele ortodox)', () => {
  const apr = slicesOut.find((s) => s.json.month === 4).json.occasions;
  assert(/Paștele/.test(apr) && /sarbatoare legala/.test(apr), `Pastele lipseste din aprilie. Primit: ${apr}`);
});
t('nu dubleaza ocaziile care vin din doua surse', () => {
  const ian = slicesOut.find((s) => s.json.month === 1).json.occasions;
  const nume = ian.split(';').map((o) => o.split('—')[1]?.trim().replace(/\s*\(.*\)$/, '')).filter(Boolean);
  eq(nume.length, new Set(nume).size, `ocazii duplicate in ianuarie: ${ian}`);
  const apr = slicesOut.find((s) => s.json.month === 4).json.occasions;
  const numeApr = apr.split(';').map((o) => o.split('—')[1]?.trim().replace(/\s*\(.*\)$/, '')).filter(Boolean);
  eq(numeApr.length, new Set(numeApr).size, `ocazii duplicate in aprilie: ${apr}`);
  // aceeasi zi formulata diferit de doua surse = o singura ocazie
  assert(!/Unirea Principatelor.*Ziua Unirii Principatelor/s.test(ian), `aceeasi zi, doua formulari: ${ian}`);
  // ...dar doua ocazii chiar diferite din aceeasi zi raman amandoua
  const mar = slicesOut.find((s) => s.json.month === 3).json.occasions;
  assert(/Sanatatii Orale/.test(mar) && /Fericirii/.test(mar), `20 martie are doua ocazii distincte: ${mar}`);
  assert(/2026-04-12\.\.2026-04-13 — Paștele/.test(apr), `zilele consecutive de Paste trebuie unite intr-un interval: ${apr}`);
});
t('filtreaza zilele irelevante pentru nisa', () => {
  const all = slicesOut.map((s) => s.json.occasions).join(' ');
  assert(/Sanatatii Orale/.test(all), 'ziua specifica nisei este inclusa');
  assert(!/Cafelei/.test(all), 'ziua pentru HoReCa NU apare la dentist');
});

console.log('\nAgent B — Dedupe & Number');
t('elimina duplicatele exacte si parafrazele, pastreaza ideile distincte', () => {
  // Corpus de fundal intentionat: IDF-ul se calculeaza pe tot setul, deci pe 6 titluri
  // comportamentul difera de cel pe 500. Testam in conditii apropiate de rularea reala.
  const fundal = ['Cat costa o albire profesionala', 'Cat dureaza un tratament de canal',
    'Cum alegi aparatul dentar', 'Ce nu ti se spune despre implanturi', 'Cat costa un abonament la sala',
    'Cum alegi antrenorul personal', 'Trei greseli la periaj', 'Ce mananca antrenorul intr-o zi',
    'Cat dureaza recuperarea dupa extractie', 'De ce amana oamenii vizita la dentist'];
  const mk = (title, slice = 1) => ({ json: { title, slice_index: slice, niche_key: 'dentist', target_ideas: 99, hook: 'h', outline: 'o' } });
  const out = runNode('b-dedupe-and-number.js', {
    input: [
      mk('5 mituri despre albirea dentara'),
      mk('5 mituri despre albirea dentara'),              // duplicat exact
      mk('Mituri despre albirea dentara: 5 lucruri'),     // parafraza (reordonare)
      mk('Cat costa un implant dentar', 2),
      mk('Ce se intampla la prima vizita', 2),
      mk('Cum alegi aparatul dentar potrivit', 3),
      ...fundal.map((f, i) => mk(f, 4 + (i % 2))),
    ],
    nodes: { Start: [{ json: { target_ideas: 99, year: 2026 } }] },
  });
  const titluri = out.map((o) => o.json.title);
  eq(out[0].json._stats_dropped_exact, 1, 'duplicat exact eliminat');
  assert(!titluri.includes('Mituri despre albirea dentara: 5 lucruri'), 'parafraza trebuia eliminata');
  for (const t of ['5 mituri despre albirea dentara', 'Cat costa un implant dentar', 'Ce se intampla la prima vizita']) {
    assert(titluri.includes(t), `ideea distincta a fost eliminata gresit: "${t}"`);
  }
  eq(out[0].json.id, 'dentist-2026-001', 'format id');
});
t('taie la tinta echilibrat intre felii, nu doar din primele', () => {
  const subiecte = ['implant', 'fatete', 'albire', 'aparat dentar', 'detartraj', 'canal', 'urgente', 'copii', 'proteze', 'igiena'];
  const unghiuri = ['cat costa', 'cat dureaza', 'ce rezolva', 'mituri despre'];
  const input = [];
  for (let s = 1; s <= 4; s++) for (let i = 0; i < 10; i++) {
    input.push({ json: { title: `${unghiuri[s - 1]} ${subiecte[i]}`, slice_index: s, niche_key: 'x', target_ideas: 8 } });
  }
  const out = runNode('b-dedupe-and-number.js', { input, nodes: { Start: [{ json: { target_ideas: 8, year: 2026 } }] } });
  eq(out.length, 8, 'taiat la tinta');
  eq(new Set(out.map((o) => o.json.slice_index)).size, 4, 'toate cele 4 felii sunt reprezentate');
});

t('calibrarea pragurilor: ce se elimina si ce se pastreaza', () => {
  // Perechi etichetate manual. Daca schimbi COSINE_THRESHOLD / TRIGRAM_THRESHOLD,
  // testul asta iti spune exact ce ai stricat.
  const perechi = [
    ['DROP', '5 mituri despre albirea dentara', 'Mituri despre albirea dentara: 5 lucruri'],
    ['DROP', 'Cat costa un implant dentar', 'Cat costa implantul dentar'],
    ['DROP', 'Trei aparate folosite gresit in sala', 'Trei aparate pe care le folosesti gresit in sala'],
    ['KEEP', 'Cat costa un implant dentar', 'Cat costa o fateta dentara'],
    ['KEEP', 'Cat costa un implant dentar, explicat pas cu pas', 'Cat costa un implant dentar, ce nu scrie nicaieri'],
    ['KEEP', 'Turul cabinetului in 30 de secunde', 'Ce vede medicul pe radiografia ta'],
    ['KEEP', 'Trei aparate folosite gresit in sala', 'Trei greseli la antrenamentul de picioare'],
  ];
  // corpus de fundal, ca IDF-ul sa fie realist (altfel fiecare cuvant e unic)
  const fundal = ['Cat costa o albire profesionala', 'Cat dureaza un tratament de canal',
    'Cum alegi aparatul dentar', 'Ce nu ti se spune despre implanturi', 'Cat costa un abonament la sala',
    'Cum alegi antrenorul personal', 'Trei greseli la periaj', 'Ce mananca antrenorul intr-o zi',
    'Cat dureaza recuperarea dupa extractie', 'De ce amana oamenii vizita la dentist'];
  const mk = (title, i) => ({ json: { title, slice_index: 1 + (i % 3), niche_key: 'x', target_ideas: 999 } });

  for (const [want, a, b] of perechi) {
    const input = [a, b, ...fundal].map(mk);
    const out = runNode('b-dedupe-and-number.js', { input, nodes: { Start: [{ json: { target_ideas: 999, year: 2026 } }] } });
    const titluri = out.map((o) => o.json.title);
    const amandoua = titluri.includes(a) && titluri.includes(b);
    if (want === 'DROP') assert(!amandoua, `ar fi trebuit eliminata una: "${a}" ~ "${b}"`);
    else assert(amandoua, `nu trebuia eliminata: "${a}" ~ "${b}"`);
  }
});
t('limita cunoscuta: duplicatele semantice cu alte cuvinte NU sunt prinse', () => {
  // Documentat intentionat ca test: e granita metodei lexicale, nu un bug ascuns.
  const input = [
    { json: { title: 'Ce se intampla la prima vizita la stomatolog', slice_index: 1, niche_key: 'x', target_ideas: 99 } },
    { json: { title: 'Cum decurge prima ta consultatie', slice_index: 1, niche_key: 'x', target_ideas: 99 } },
  ];
  const out = runNode('b-dedupe-and-number.js', { input, nodes: { Start: [{ json: { target_ideas: 99, year: 2026 } }] } });
  eq(out.length, 2, 'ambele raman — pentru cazul asta ai nevoie de embeddings');
});

console.log('\nInfrastructura locala');
t('renderTemplate evalueaza expresiile n8n din prompturi', () => {
  const out = renderTemplate('Nisa: {{ $json.niche }}, luna {{ $json.month }}, date {{ JSON.stringify($json.a) }}', { niche: 'dentist', month: 3, a: [1, 2] });
  eq(out, 'Nisa: dentist, luna 3, date [1,2]', 'randare');
});
t('promptul real se randeaza fara erori cu datele unei felii', () => {
  const slice = slicesOut[0].json;
  const out = renderTemplate(loadPrompt('03-idea-generator.md'), slice);
  assert(!/\{\{/.test(out), 'nu au ramas expresii neevaluate');
  assert(out.includes(slice.pillar), 'pilonul a ajuns in prompt');
  assert(out.includes(String(slice.ideas_per_slice)), 'numarul de idei a ajuns in prompt');
});
t('CSV: quotare si parsare dus-intors', () => {
  const rows = [{ a: 'simplu', b: 'cu, virgula', c: 'cu "ghilimele"' }];
  const back = parseCsv(toCsv(rows));
  eq(back[0].b, 'cu, virgula', 'virgula');
  eq(back[0].c, 'cu "ghilimele"', 'ghilimele');
});
t('CSV-ul cu zile internationale se parseaza corect', () => {
  const zile = parseCsv(readFileSync(new URL('../data/international-days-seed.csv', import.meta.url), 'utf8'));
  assert(zile.length > 50, `prea putine zile: ${zile.length}`);
  const oral = zile.find((z) => /Sanatatii Orale/.test(z.name_ro));
  eq(oral.date, '03-20', 'Ziua Mondiala a Sanatatii Orale');
  eq(oral.niches, 'dentist', 'filtrata pe nisa');
  const mobile = zile.filter((z) => z.movable === 'true');
  assert(mobile.length >= 5, 'exista zile mobile marcate');
});
t('toate cele 4 nise au brief complet', () => {
  const dir = new URL('../data/niches/', import.meta.url);
  const nise = readdirSync(dir).filter((f) => f.endsWith('.json'));
  eq(nise.length, 4, 'numar de nise');
  const obligatorii = ['niche_key', 'audience', 'pains', 'objections', 'desires', 'services', 'tone', 'forbidden', 'niche_days', 'seed_examples', 'pillars'];
  for (const f of nise) {
    const b = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const c of obligatorii) assert(b[c] && String(b[c]).length > 3, `${f}: campul "${c}" lipseste sau e gol`);
    assert(b.seed_examples.length >= 8, `${f}: sub 8 seed_examples (${b.seed_examples.length})`);
    assert(b.pillars.length >= 5, `${f}: sub 5 piloni`);
    assert(/;/.test(b.niche_days), `${f}: niche_days trebuie sa aiba mai multe zile separate prin ;`);
  }
});

console.log(`\n${pass} teste trecute, ${fail} esuate\n`);
process.exit(fail ? 1 : 0);
