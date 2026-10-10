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

t('scoate metricile de audienta din datele pentru scorer si pune data de azi', () => {
  const out = runNode('a1-merge-extractions.js', {
    input: [{ json: { content: JSON.stringify({ platform: 'instagram', account: { bio_text: 'x' }, metrics: { followers: '12K' }, engagement_visible: [{ likes: '300' }] }) } }],
    nodes: { 'Form Trigger': [{ json: { 'Nume client': 'X' } }] },
  })[0].json;
  assert(out.extractions[0].metrics, 'extractia completa pastreaza metricile (pentru strateg)');
  assert(!('metrics' in out.scoring_extractions[0]), 'scorer-ul nu vede urmaritorii');
  assert(!('engagement_visible' in out.scoring_extractions[0]), 'scorer-ul nu vede like-urile si vizualizarile');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(out.today), `data de azi in format AAAA-LL-ZZ: ${out.today}`);
});

/* ---------- fixture pentru scor ---------- */
const crit = (metIds = [], { notIn = [], noEvidence = [], omit = [] } = {}) =>
  Array.from({ length: 20 }, (_, k) => k + 1).filter((id) => !omit.includes(id)).map((id) => ({
    id,
    met: metIds.includes(id),
    not_in_screenshots: notIn.includes(id),
    evidence: metIds.includes(id) && !noEvidence.includes(id) ? `dovada ${id}` : '',
  }));
const post = (o = {}) => ({ media_type: 'foto', visible_text_on_cover: null, text_legible: null, has_face: false, vertical_fullscreen: true, image_clear: true, caption_has_cta: null, ...o });
const reel = (o = {}) => post({ media_type: 'reel', visible_text_on_cover: 'Hook', text_legible: true, ...o });
const mergedWith = (extractions, today = '2026-10-10') => [{ json: {
  client: { 'Nume client': 'Test' }, extractions, failed: [],
  covered: [...new Set(extractions.map((e) => e.platform))],
  lowConfidence: [], screenshotCount: extractions.length, extractedCount: extractions.length, today,
} }];
const computeScore = (platforms, extractions, today) => runNode('a1-compute-score.js', {
  input: [{ json: { output: { platforms } } }],
  nodes: { 'Merge Extractions': mergedWith(extractions, today) },
})[0].json.score;
const rowOf = (sc, platform, id) => sc.platforms.find((p) => p.platform === platform).rows.find((r) => r.id === id);
// Instagram care indeplineste toate conditiile numarabile (18 si 19 ies ✅ din date)
const igFull = { platform: 'instagram', posts_visible: [reel(), reel(), reel()], pinned_posts: [{}, {}], highlights: [{}, {}, {}, {}] };
const igEmpty = { platform: 'instagram' };
const NON_AUTO_IG = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20];

console.log('\nAgent A — Compute Score (scorul de optimizare)');
t('formula: 5 + 0,25 × ✅, potențial = 5 + 0,25 × (✅ + ❌), două zecimale cu virgulă', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([1, 2, 3, 4]) }], [igFull]);
  const p = sc.platforms[0];
  eq(p.count_ok, 6, '4 de la model + 18 și 19 din numărători');
  eq(p.score_display, '6,50', 'scor');
  eq(p.label, 'Bază pusă', 'etichetă');
  eq(p.count_fixable, 11, 'criteriile de profil neîndeplinite (1–15 minus 4)');
  eq(p.potential_display, '9,25', 'potențial: 5 + 0,25 × (6 + 11)');
});
t('etichetele, la fiecare prag', () => {
  const cases = [[0, '5,50', 'Potențial neexploatat'], [1, '5,75', 'Potențial neexploatat'], [2, '6,00', 'Bază pusă'],
    [6, '7,00', 'Pe drumul cel bun'], [10, '8,00', 'Bine optimizat'], [14, '9,00', 'Excelent'], [18, '10,00', 'Excelent']];
  for (const [k, disp, lab] of cases) {
    const p = computeScore([{ platform: 'instagram', criteria: crit(NON_AUTO_IG.slice(0, k)) }], [igFull]).platforms[0];
    eq(`${p.score_display} · ${p.label}`, `${disp} · ${lab}`, `${k + 2} criterii îndeplinite`);
  }
  const zero = computeScore([{ platform: 'instagram', criteria: crit([]) }], [igEmpty]).platforms[0];
  eq(`${zero.score_display} · ${zero.label}`, '5,00 · Potențial neexploatat', 'niciun criteriu');
});
t('simbolul depinde de tipul criteriului, nu de model', () => {
  const sc = computeScore([
    { platform: 'instagram', criteria: crit([]) },
    { platform: 'tiktok', criteria: crit([]) },
    { platform: 'facebook', criteria: crit([]) },
  ], [igEmpty, { platform: 'tiktok' }, { platform: 'facebook' }]);
  const sym = (pl, id) => rowOf(sc, pl, id).symbol;
  eq(sym('instagram', 12), '❌', 'IG 12 profil');
  eq(sym('instagram', 15), '❌', 'IG 15 profil');
  eq(sym('instagram', 16), '⏳', 'IG 16 conținut');
  eq(sym('tiktok', 13), '❌', 'TikTok 13 profil');
  eq(sym('tiktok', 14), '⏳', 'TikTok 14 conținut');
  eq(sym('facebook', 14), '❌', 'Facebook 14 profil');
  eq(sym('facebook', 15), '⏳', 'Facebook 15 conținut');
});
t('ordinea și denumirile scurte sunt fixe, identice în fiecare raport', () => {
  const sc = computeScore([{ platform: 'tiktok', criteria: crit([]).reverse() }], [{ platform: 'tiktok' }]);
  const names = sc.platforms[0].rows.map((r) => `${r.id}. ${r.name}`);
  eq(names.length, 20, '20 de criterii');
  eq(names[0], '1. Poză de profil', 'primul');
  eq(names[12], '13. Username', 'primul specific TikTok');
  eq(names[19], '20. Mix de formate', 'ultimul');
});
t('regula 4: DA + „nu apare în capturi" devine NU, cu mențiunea în text', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([1, 2], { notIn: [2] }) }], [igFull]);
  eq(rowOf(sc, 'instagram', 2).met, false, 'criteriul 2 devine NU');
  assert(sc.text.includes('❌ Nume cu cuvânt-cheie (nu apare în capturi)'), 'mențiunea apare în raport');
  assert(sc.overrides.some((o) => o.id === 2), 'corecția e înregistrată');
});
t('regula 3: DA fără dovadă devine NU', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([1, 3], { noEvidence: [3] }) }], [igFull]);
  eq(rowOf(sc, 'instagram', 1).met, true, 'DA cu dovadă rămâne');
  eq(rowOf(sc, 'instagram', 3).met, false, 'DA fără dovadă devine NU');
});
t('criteriu omis de model = NU, cu avertisment', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([5], { omit: [5] }) }], [igFull]);
  eq(rowOf(sc, 'instagram', 5).met, false, 'NU');
  assert(sc.flags.some((f) => /5\. Dovadă de încredere: neevaluat/.test(f)), 'avertisment');
});
t('o platformă cu capturi dar neevaluată oprește execuția', () => {
  let msg = '';
  try { computeScore([{ platform: 'instagram', criteria: crit([]) }], [igFull, { platform: 'tiktok' }]); } catch (e) { msg = e.message; }
  assert(/nu a evaluat platforma: tiktok/.test(msg), `mesaj: ${msg}`);
});
t('o platformă evaluată fără capturi e ignorată', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([]) }, { platform: 'facebook', criteria: crit([1]) }], [igFull]);
  eq(sc.platforms.length, 1, 'doar Instagram');
  assert(sc.flags.some((f) => /facebook/.test(f)), 'avertisment');
});
t('scor general: medie cu o zecimală, doar de la 2 platforme', () => {
  const two = computeScore([
    { platform: 'instagram', criteria: crit([1, 2, 3]) },   // 5 ✅ → 6,25
    { platform: 'tiktok', criteria: crit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) }, // 10 ✅ → 7,50
  ], [igFull, { platform: 'tiktok' }]);
  eq(two.general.score_display, '6,9', '(6,25 + 7,50) / 2 = 6,875 → 6,9');
  eq(two.general.label, 'Bază pusă', 'eticheta valorii afișate');
  assert(two.text.includes('📊 SCOR GENERAL: 6,9/10 · Bază pusă'), 'linia de scor general');
  assert(two.text.includes('🚀 POTENȚIAL DUPĂ OPTIMIZARE:'), 'linia de potențial general');
  const one = computeScore([{ platform: 'instagram', criteria: crit([1]) }], [igFull]);
  eq(one.general, null, 'o singură platformă: fără scor general');
  assert(!one.text.includes('SCOR GENERAL'), 'fără linia de scor general');
});
t('formatul secțiunii, rând cu rând', () => {
  const sc = computeScore([{ platform: 'instagram', criteria: crit([1, 2, 3, 4]) }], [igFull]);
  const L = sc.text.split('\n');
  eq(L[0], '🎯 SCOR DE OPTIMIZARE', 'titlu');
  eq(L[1], '✅ îndeplinit · ❌ se rezolvă imediat · ⏳ crește odată cu conținutul', 'legendă');
  eq(L[3], 'INSTAGRAM', 'platformă');
  eq(L[4], '✅ Poză de profil', 'primul criteriu');
  eq(L[8], '❌ Dovadă de încredere', 'criteriu de profil neîndeplinit');
  eq(L[19], '⏳ Grilă coerentă', 'criteriu de conținut neîndeplinit');
  eq(L[23], '⏳ Rubrici recurente', 'ultimul criteriu');
  eq(L[24], '→ Scor: 6,50/10 · Bază pusă', 'scor');
  eq(L[25], '→ Potențial după optimizarea profilului: 9,25/10', 'potențial');
  eq(L[L.length - 1], 'Fiecare ❌ rezolvat = +0,25 puncte.', 'încheiere');
});

console.log('\nAgent A — Compute Score: criteriile numărabile');
t('IG Reels: minimum o treime din postările vizibile, indiferent ce spune modelul', () => {
  const posts = (k) => [...Array(k)].map(() => reel()).concat([...Array(9 - k)].map(() => post()));
  const yes = computeScore([{ platform: 'instagram', criteria: crit([]) }], [{ platform: 'instagram', posts_visible: posts(3) }]);
  eq(rowOf(yes, 'instagram', 18).met, true, '3 din 9 = o treime');
  const no = computeScore([{ platform: 'instagram', criteria: crit([18]) }], [{ platform: 'instagram', posts_visible: posts(2) }]);
  eq(rowOf(no, 'instagram', 18).symbol, '⏳', '2 din 9, deși modelul a spus DA');
  assert(no.overrides.some((o) => o.id === 18 && o.model === true && o.final === false), 'corecția e înregistrată');
});
t('IG Hook pe copertă: se numără doar textul lizibil', () => {
  const ps = [reel(), reel(), reel({ text_legible: false }), post(), post()];
  const sc = computeScore([{ platform: 'instagram', criteria: crit([19]) }], [{ platform: 'instagram', posts_visible: ps }]);
  eq(rowOf(sc, 'instagram', 19).met, false, '2 lizibile din 5 < jumătate');
});
t('Highlights și postări fixate: numărul e condiție necesară, rolul îl judecă modelul', () => {
  const few = computeScore([{ platform: 'instagram', criteria: crit([14, 12]) }],
    [{ platform: 'instagram', highlights: [{}, {}, {}], pinned_posts: [{}] }]);
  eq(rowOf(few, 'instagram', 14).met, false, '3 highlights < 4');
  eq(rowOf(few, 'instagram', 12).met, false, '1 postare fixată, necesar 2–3');
  const ok = computeScore([{ platform: 'instagram', criteria: crit([]) }],
    [{ platform: 'instagram', highlights: [{}, {}, {}, {}, {}], pinned_posts: [{}, {}] }]);
  eq(rowOf(ok, 'instagram', 14).met, false, 'numărul e bun, dar modelul a spus NU: rămâne NU');
  const fb = computeScore([{ platform: 'facebook', criteria: crit([12]) }], [{ platform: 'facebook', pinned_posts: [{}, {}] }]);
  eq(rowOf(fb, 'facebook', 12).met, false, 'pe Facebook trebuie exact 1');
});
t('TikTok: prezență umană, calitate tehnică, mix de formate', () => {
  const vid = (o) => post({ media_type: 'video', ...o });
  const half = computeScore([{ platform: 'tiktok', criteria: crit([]) }],
    [{ platform: 'tiktok', posts_visible: [vid({ has_face: true }), vid({ has_face: true }), vid(), vid()] }]);
  eq(rowOf(half, 'tiktok', 17).met, true, '2 din 4 fețe = jumătate');
  const blur = computeScore([{ platform: 'tiktok', criteria: crit([19]) }],
    [{ platform: 'tiktok', posts_visible: [vid(), vid({ vertical_fullscreen: null })] }]);
  eq(rowOf(blur, 'tiktok', 19).met, false, 'un video nedeterminat = dubiu = NU');
  eq(rowOf(blur, 'tiktok', 20).met, false, 'doar video, fără Photo Mode');
  const mix = computeScore([{ platform: 'tiktok', criteria: crit([]) }],
    [{ platform: 'tiktok', posts_visible: [vid(), post({ media_type: 'carusel_foto' })] }]);
  eq(rowOf(mix, 'tiktok', 20).met, true, 'video + carusel foto');
});
t('Facebook Activitate: maximum 30 de zile, calculat din data literală', () => {
  const fb = (txt, iso = null) => computeScore([{ platform: 'facebook', last_post_date: iso, criteria: crit([18]) }],
    [{ platform: 'facebook', facebook_page: { last_post_date_text: txt } }], '2026-10-10');
  eq(rowOf(fb('3 săpt.'), 'facebook', 18).met, true, '21 de zile');
  eq(rowOf(fb('Ieri'), 'facebook', 18).met, true, 'ieri');
  eq(rowOf(fb('12 august'), 'facebook', 18).met, false, '59 de zile');
  eq(rowOf(fb('2 luni'), 'facebook', 18).met, false, '60 de zile');
  eq(rowOf(fb('12 noiembrie'), 'facebook', 18).met, false, 'fără an și în viitor = anul trecut');
  eq(rowOf(fb('20 septembrie 2026'), 'facebook', 18).met, true, '20 de zile, cu an');
  eq(rowOf(fb(null, '2026-09-15'), 'facebook', 18).met, true, 'fără text: data AAAA-LL-ZZ de la model');
  const none = fb(null);
  eq(rowOf(none, 'facebook', 18).met, false, 'fără nicio dată');
  assert(none.text.includes('⏳ Activitate (nu apare în capturi)'), 'mențiunea apare');
});
t('Facebook: Video / Reels prezente și CTA la majoritatea postărilor', () => {
  const fb = (ps) => computeScore([{ platform: 'facebook', criteria: crit([19, 20]) }], [{ platform: 'facebook', posts_visible: ps }]);
  const half = fb([post({ caption_has_cta: true }), post({ caption_has_cta: true }), post(), post()]);
  eq(rowOf(half, 'facebook', 20).met, false, '2 din 4 nu e majoritate');
  eq(rowOf(half, 'facebook', 19).met, false, 'niciun video');
  const most = fb([post({ caption_has_cta: true }), post({ caption_has_cta: true }), post({ media_type: 'video', caption_has_cta: true }), post()]);
  eq(rowOf(most, 'facebook', 20).met, true, '3 din 4');
  eq(rowOf(most, 'facebook', 19).met, true, 'un video e suficient');
});

console.log('\nAgent A — Build Document');
const scoredItem = runNode('a1-compute-score.js', {
  input: [{ json: { output: { platforms: [
    { platform: 'instagram', criteria: crit([1, 3, 6, 10]) },
    { platform: 'facebook', criteria: crit([1]) },
  ] } } }],
  nodes: { 'Merge Extractions': mergedWith([
    { ...igFull, account: { bio_text: 'Zambete frumoase', display_name: 'Cabinet' }, contact: { phone: '0264 123 456' } },
    { platform: 'facebook' },
  ]) },
})[0];
const auditFixture = () => ({ output: {
  executive_summary: 'Profilul are o bază bună.',
  quick_wins: [{ action: 'Adaugă serviciul în câmpul Name', time_needed: '2 minute', platform: 'instagram', criteria: [2] }],
  content_strategy_30_days: [{ week: 1, focus: 'Încredere', post_types: ['tur cabinet'], goal: 'salvări' }],
  missing_data: [], red_flags: [],
  platforms: [
    {
      platform: 'instagram', covered: true, handle: '@cabinet', current_bio: 'Zambete frumoase',
      what_works: [{ observation: 'Poza e clară', evidence: 'logo lizibil', why_it_matters: 'recunoaștere', criteria: [1] }],
      what_doesnt: [{ issue: 'Bio fără serviciu', evidence: '„Zambete frumoase"', cost: 'apariție în căutări', criteria: [2] }],
      improvements: [{ action: 'Rescrie bio-ul', how_to: 'serviciu + oraș + CTA', impact: 'mare', effort: 'mic', criteria: [2, 4, 5, 7, 8, 9, 11, 12, 13, 14, 15] }],
      bio_variants: [
        { angle: 'claritate', text: 'Stomatologie în Cluj. Programează-te pe WhatsApp: 0264 123 456', criteria_covered: [3, 6, 7, 8], rationale: 'r', name_field: 'Cabinet | Stomatolog Cluj' },
        { angle: 'beneficiu', text: 'Implant și fațete, [ani experiență] de experiență. Scrie-ne în DM ⬇️', criteria_covered: [3, 5, 7, 8], rationale: 'r' },
        { angle: 'diferentiator', text: 'Stomatologie fără durere', criteria_covered: [3], rationale: 'r' },
      ],
    },
    { platform: 'facebook', covered: true, what_works: [], what_doesnt: [], bio_variants: [],
      improvements: [{ action: 'Completează pagina', how_to: 'Intro, buton, contact, cover', impact: 'mare', effort: 'mic', criteria: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] }] },
  ],
} });
const buildDoc = (audit, json = { id: 'FOLDER_ID_123' }) => runNode('a1-build-document.js', {
  json,
  nodes: {
    Strateg: [{ json: audit }],
    'Form Trigger': [{ json: { 'Nume client': 'Cabinet X', 'Nișă': 'dentist' } }],
    'Merge Extractions': [{ json: { ...scoredItem.json, extractedCount: 2, screenshotCount: 2, failed: [], lowConfidence: [] } }],
    'Compute Score': [scoredItem],
  },
})[0].json;

t('scorul de optimizare e prima secțiune, înaintea analizei', () => {
  const { html } = buildDoc(auditFixture());
  const iScore = html.indexOf('🎯 SCOR DE OPTIMIZARE');
  assert(iScore > 0, 'secțiunea de scor există');
  assert(iScore < html.indexOf('<h2>Pe scurt</h2>'), 'înainte de „Pe scurt"');
  assert(iScore < html.indexOf('<h3>Ce e bine</h3>'), 'înainte de analiză');
  assert(html.includes('SCOR GENERAL: '), 'scor general, sunt 2 platforme');
  assert(html.includes('Fiecare ❌ rezolvat = +0,25 puncte.'), 'încheierea');
});
t('descrieri: limita, criteriile obligatorii, CTA și canal', () => {
  const a = auditFixture();
  a.output.platforms[0].bio_variants[0].text = 'Stomatologie în Cluj-Napoca. Implant, fațete, ortodonție, albire, urgențe în aceeași zi, parcare proprie. Programează-te pe WhatsApp la 0264 123 456 sau în DM.';
  const { flags } = buildDoc(a);
  assert(flags.some((f) => /varianta 1: \d+ caractere, peste limita de 150/.test(f)), 'peste 150');
  assert(flags.some((f) => /varianta 3: nu bifează criteriile obligatorii 7, 8/.test(f)), 'lipsesc 7 și 8 declarate');
  assert(flags.some((f) => /varianta 3: nu am găsit un verb de acțiune/.test(f)), 'fără verb de acțiune');
  assert(flags.some((f) => /varianta 3: CTA-ul nu spune pe ce canal/.test(f)), 'fără canal');
  assert(!flags.some((f) => /varianta 2: nu am găsit un verb/.test(f)), '„Scrie-ne" e recunoscut');
});
t('cifrele inventate sunt raportate, cele din capturi și placeholderele nu', () => {
  const a = auditFixture();
  a.output.platforms[0].bio_variants[1].text = '15 ani de experiență și 2000 de pacienți. Scrie-ne în DM';
  const { flags } = buildDoc(a);
  assert(flags.some((f) => /varianta 2: cifre care nu apar în capturi \(15, 2000\)/.test(f)), 'cifrele inventate');
  assert(!flags.some((f) => /varianta 1: cifre/.test(f)), 'telefonul apare în capturi');
  const b = buildDoc(auditFixture()).flags;
  assert(b.some((f) => /varianta 2: conține placeholder/.test(f)), 'placeholderul e semnalat pentru completare');
  assert(!b.some((f) => /varianta 2: cifre/.test(f)), 'placeholderul nu e cifră inventată');
});
t('coerența cu checklist-ul: lauda unui ❌, critica unui ✅, ❌ fără sugestie, quick win pe ⏳', () => {
  const a = auditFixture();
  a.output.platforms[0].what_works.push({ observation: 'x', evidence: 'x', why_it_matters: 'x', criteria: [2] });
  a.output.platforms[0].what_doesnt.push({ issue: 'x', evidence: 'x', cost: 'x', criteria: [3] });
  a.output.platforms[0].improvements[0].criteria = [2];
  a.output.quick_wins.push({ action: 'Postează reels', time_needed: '1 lună', platform: 'instagram', criteria: [16] });
  const { flags } = buildDoc(a);
  assert(flags.some((f) => /„Ce e bine" se referă la 2\. Nume cu cuvânt-cheie, marcat ❌/.test(f)), 'laudă pe ❌');
  assert(flags.some((f) => /„Ce nu" se referă la 3\. Ce oferi, marcat ✅/.test(f)), 'critică pe ✅');
  assert(flags.some((f) => /❌ fără sugestie de rezolvare: .*4\. Pentru cine/.test(f)), '❌ fără sugestie');
  assert(flags.some((f) => /criteriul 16, care nu e ❌/.test(f)), 'quick win pe ⏳');
  const clean = buildDoc(auditFixture()).flags;
  assert(!clean.some((f) => /se referă la|fără sugestie|nu e ❌/.test(f)), `raportul coerent nu are avertismente de coerență: ${clean.join(' | ')}`);
});
t('tonul: cuvintele interzise sunt detectate, inclusiv fără diacritice', () => {
  const a = auditFixture();
  a.output.executive_summary = 'Bio-ul actual e slab, iar grila e gresit organizata.';
  const { flags } = buildDoc(a);
  assert(flags.some((f) => /Ton — Pe scurt: „slab", „gresit"/.test(f)), `ton: ${flags.join(' | ')}`);
  assert(!buildDoc(auditFixture()).flags.some((f) => /^Ton/.test(f)), 'textul curat nu e semnalat');
});
t('genereaza corp multipart valid pentru Drive (HTML -> Google Doc)', () => {
  const mp = buildDoc(auditFixture()).multipart;
  const parts = mp.split('--n8nDocBoundary');
  eq(parts.length, 4, 'doua parti + inchidere');
  const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
  eq(meta.mimeType, 'application/vnd.google-apps.document', 'tinta = Google Doc');
  eq(meta.parents[0], 'FOLDER_ID_123', 'documentul merge in folderul creat');
  assert(parts[2].includes('Content-Type: text/html'), 'sursa e declarata text/html');
  assert(!/undefined/.test(mp), 'HTML fara "undefined"');
});
t('esueaza explicit daca lipseste id-ul folderului', () => {
  let msg = '';
  try { buildDoc(auditFixture(), {}); } catch (e) { msg = e.message; }
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
