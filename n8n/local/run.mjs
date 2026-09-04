#!/usr/bin/env node
// Runner local pentru cei doi agenti. Executa EXACT aceleasi noduri Code ca workflow-urile
// n8n (din src/), doar ca apeleaza modelul direct. Serveste la doua lucruri:
//   1. testezi calitatea prompturilor si a briefurilor inainte sa configurezi n8n
//   2. rulezi la nevoie fara n8n (util pentru backfill sau pentru o singura nisa)
//
//   node n8n/local/run.mjs ideas --niche dentist --count 500 --year 2026
//   node n8n/local/run.mjs audit --client "Cabinet X" --niche dentist --screens ./capturi
//   node n8n/local/run.mjs briefs
//
// Fara cheie API: adauga --dry-run (verifica tot lantul cu date sintetice).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { ROOT, runNode, renderTemplate, loadPrompt, loadSchema, parseCsv, toCsv, mapPool, parseLooseJson } from './n8n-shim.mjs';
import { makeClient, completeJson, detectProvider } from './llm.mjs';

/* ---------------- argumente ---------------- */
const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name, def = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const num = (name, def) => Number(flag(name, def));

const OUT_DIR = String(flag('out-dir', join(ROOT, 'output')));
const DRY = !!flag('dry-run', false);

const say = (...a) => console.log(...a);
const die = (msg) => { console.error(`\nEroare: ${msg}\n`); process.exit(1); };

/* ---------------- date ---------------- */
const listNiches = () => readdirSync(join(ROOT, 'data', 'niches')).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json'));

const loadBrief = (key) => {
  const p = join(ROOT, 'data', 'niches', `${key}.json`);
  if (!existsSync(p)) die(`Nisa "${key}" nu exista. Disponibile: ${listNiches().join(', ')}`);
  return JSON.parse(readFileSync(p, 'utf8'));
};

const loadInternationalDays = () => parseCsv(readFileSync(join(ROOT, 'data', 'international-days-seed.csv'), 'utf8'));

const fetchHolidays = async (year, country) => {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    say(`  sarbatori: ${data.length} din API (${country} ${year})`);
    return data;
  } catch (e) {
    // Acelasi comportament ca in n8n (onError: continueRegularOutput): mergem mai departe
    console.error(`  atentie: API-ul de sarbatori nu a raspuns (${e.message}). Continui doar cu zilele din CSV.`);
    return [];
  }
};

/* ---------------- stub pentru --dry-run ---------------- */
// Genereaza titluri chiar distincte (nu variatii ale aceluiasi sablon), ca verificarea
// sa treaca prin deduplicare exact ca datele reale. Indexul global garanteaza unicitatea.
const STUB_FRAMES = [
  'explicat pas cu pas', 'ce nu scrie nicaieri', 'raspuns la o intrebare din comentarii',
  'filmat fara montaj', 'comparatie pe cifre', 'povestea unui client',
  'demontat de un specialist', 'testat timp de o luna', 'varianta ieftina versus cea scumpa',
  'greselile pe care le vede toata lumea', 'inainte si dupa', 'pe intelesul tuturor',
  'in cifre, nu in vorbe', 'intrebarea pe care nu o pune nimeni', 'ce am invatat anul trecut',
  'mit versus realitate', 'cronologia unei decizii', 'de la zero pana la rezultat',
  'ce spun clientii dupa sase luni', 'echipa raspunde', 'o zi obisnuita', 'raspuns in 60 de secunde',
];
const STUB_ANGLES = ['Cat costa', 'Cat dureaza', 'Ce nu ti se spune despre', 'Trei greseli la', 'Cum alegi', 'De ce amana oamenii'];

const stubIdeas = (slice) => {
  const subiecte = String(slice.services || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const subjects = subiecte.length ? subiecte : ['serviciul principal'];
  const out = [];
  for (let i = 0; i < slice.ideas_per_slice; i++) {
    const g = (slice.slice_index - 1) * slice.ideas_per_slice + i; // index global unic
    const angle = STUB_ANGLES[g % STUB_ANGLES.length];
    const subject = subjects[Math.floor(g / STUB_ANGLES.length) % subjects.length];
    const frame = STUB_FRAMES[Math.floor(g / (STUB_ANGLES.length * subjects.length)) % STUB_FRAMES.length];
    out.push({
      title: `${angle} ${subject}, ${frame}`,
      hook: `[dry-run] Primele 3 secunde despre ${subject}.`,
      outline: ['[dry-run] pasul 1', '[dry-run] pasul 2', '[dry-run] pasul 3'],
      cta: '[dry-run] CTA',
      platform: slice.platform, format: slice.format, funnel_stage: slice.funnel_stage, pillar: slice.pillar,
      suggested_month: slice.month, occasion: i % 4 === 0 ? String(slice.occasions).split(';')[0]?.trim() || '' : '',
      keywords_hashtags: ['#dryrun'], effort: 'low', compliance_ok: true, notes: '',
    });
  }
  return { ideas: out };
};

/* ---------------- comanda: ideas ---------------- */
const cmdIdeas = async () => {
  const nicheKey = String(flag('niche', '')) || die(`Lipseste --niche. Disponibile: ${listNiches().join(', ')}`);
  const brief = loadBrief(nicheKey);
  const start = {
    niche_key: nicheKey,
    client: String(flag('client', '')),
    year: num('year', new Date().getFullYear()),
    target_ideas: num('count', 500),
    platforms: String(flag('platforms', 'tiktok,instagram,facebook')),
    country: String(flag('country', 'RO')),
    ideas_per_slice: num('per-slice', 25),
  };

  say(`\nAgent B — ${brief.niche_label}`);
  say(`  tinta: ${start.target_ideas} idei | an: ${start.year} | platforme: ${start.platforms}`);

  const holidays = DRY && flag('offline') ? [] : await fetchHolidays(start.year, start.country);
  const intlDays = loadInternationalDays();

  let slices = runNode('b-build-slice-plan.js', {
    nodes: {
      Start: [{ json: start }],
      'Get Niche Brief': [{ json: brief }],
      'Get Public Holidays': holidays.map((h) => ({ json: h })),
      'Get International Days': intlDays.map((d) => ({ json: d })),
    },
  });

  const limit = Number(flag('limit-slices', 0));
  if (limit) slices = slices.slice(0, limit);
  say(`  felii de generat: ${slices.length} x ${start.ideas_per_slice} idei`);

  const client = makeClient({ model: String(flag('model', process.env.LLM_MODEL || 'gpt-4o')), dryRun: DRY });
  if (!DRY) say(`  model: ${client.provider} / ${client.model}`);
  else say('  mod: dry-run (fara apeluri LLM)');

  const tpl = loadPrompt('03-idea-generator.md');
  const schemaHint = `\n\nRaspunde EXCLUSIV cu un obiect JSON conform acestei scheme:\n${JSON.stringify(loadSchema('idea-row.schema.json'))}`;

  // Genereaza un set de felii. `avoid` = titluri deja folosite, trimise modelului la rundele
  // de completare: e cea mai eficienta masura anti-duplicat, mai buna decat orice filtru de dupa.
  const generate = async (list, avoid = []) => {
    let done = 0;
    const avoidBlock = avoid.length
      ? `\n\nIDEI DEJA GENERATE — nu le repeta si nu le reformula:\n- ${avoid.slice(-150).join('\n- ')}`
      : '';
    const res = await mapPool(list, num('concurrency', 3), async (slice) => {
      const payload = DRY
        ? stubIdeas(slice.json)
        : await completeJson(client, {
            prompt: renderTemplate(tpl, slice.json) + avoidBlock + schemaHint,
            temperature: num('temperature', 0.8),
            maxTokens: 8000,
            label: `felia ${slice.json.slice_index}`,
          });
      const flat = runNode('b-flatten-ideas.js', { input: [{ json: payload }], nodes: { 'Loop Over Slices': [slice] } });
      done++;
      process.stdout.write(`\r  generate: ${done}/${list.length} felii`);
      return flat;
    });
    say('');
    return res.flat();
  };

  let raw = await generate(slices);
  if (!raw.length) die('Nicio idee generata.');

  let final = runNode('b-dedupe-and-number.js', { input: raw, nodes: { Start: [{ json: start }] } });
  let s0 = final[0].json;
  say(`  brut: ${s0._stats_total_generated} | unice: ${s0._stats_unique} | duplicate: ${s0._stats_dropped_exact} | prea similare: ${s0._stats_dropped_similar}`);

  // Top-up: cat timp lipsesc idei, mai generam felii, decalate pe alta combinatie
  // pilon/format/platforma si cu titlurile existente trimise modelului ca lista de evitat.
  const maxRounds = num('topup-rounds', 3);
  for (let round = 1; round <= maxRounds && s0._stats_deficit > 0; round++) {
    const nevoie = s0._stats_deficit;
    const cate = Math.ceil((nevoie * 1.4) / start.ideas_per_slice);
    say(`  completare ${round}/${maxRounds}: lipsesc ${nevoie} idei, generez ${cate} felii in plus`);
    const extra = Array.from({ length: cate }, (_, k) => {
      const base = slices[(k + round) % slices.length].json;
      return { json: { ...base,
        slice_index: slices.length + round * 100 + k,
        pillar: slices[(k + round * 2) % slices.length].json.pillar,
        format: slices[(k + round * 3 + 1) % slices.length].json.format,
        platform: slices[(k + round + 2) % slices.length].json.platform,
        funnel_stage: slices[(k + round * 5) % slices.length].json.funnel_stage,
      } };
    });
    const more = await generate(extra, final.map((f) => f.json.title));
    raw = raw.concat(more);
    final = runNode('b-dedupe-and-number.js', { input: raw, nodes: { Start: [{ json: start }] } });
    s0 = final[0].json;
    say(`  dupa completare: unice ${s0._stats_unique} / ${start.target_ideas}`);
  }

  if (s0._stats_deficit > 0) {
    say(`  ATENTIE: raman ${s0._stats_deficit} idei sub tinta dupa ${maxRounds} runde de completare.`);
    say('  Cauza obisnuita: prea putine seed_examples sau o nisa cu servicii putine. Creste --per-slice.');
  }

  const cols = ['id','niche','client','month','suggested_date','occasion','pillar','funnel_stage','platform','format','hook','title','outline','cta','keywords_hashtags','effort','compliance_ok','notes','status'];
  const rows = final.map((f) => Object.fromEntries(cols.map((c) => [c, f.json[c] ?? ''])));

  mkdirSync(OUT_DIR, { recursive: true });
  const stem = String(flag('out', join(OUT_DIR, `idei-${nicheKey}-${start.year}`)));
  writeFileSync(`${stem}.csv`, toCsv(rows, cols));
  writeFileSync(`${stem}.json`, JSON.stringify(rows, null, 2) + '\n');
  say(`\n  scris: ${stem}.csv  (${rows.length} idei — importa in tab-ul "Idei")`);
  say(`  scris: ${stem}.json\n`);

  const nonCompliant = rows.filter((r) => r.compliance_ok === false || r.compliance_ok === 'false');
  if (nonCompliant.length) say(`  de verificat manual: ${nonCompliant.length} idei marcate compliance_ok=false\n`);
};

/* ---------------- comanda: audit ---------------- */
const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const cmdAudit = async () => {
  const dir = String(flag('screens', '')) || die('Lipseste --screens <folder cu capturi de ecran>');
  if (!existsSync(dir)) die(`Folderul "${dir}" nu exista.`);
  const files = readdirSync(dir).filter((f) => IMG[extname(f).toLowerCase()]).map((f) => join(dir, f));
  if (!files.length && !DRY) die(`Niciun fisier imagine in "${dir}".`);

  const form = {
    'Nume client': String(flag('client', 'Client')),
    'Nișă': String(flag('niche', '')),
    'Platforme incluse': String(flag('platforms', 'instagram, tiktok, facebook')),
    'Obiectivul contului': String(flag('goal', 'lead-uri')),
    'Public țintă': String(flag('audience', '')),
  };

  say(`\nAgent A — ${form['Nume client']}`);
  say(`  capturi: ${files.length}`);

  const client = makeClient({ model: String(flag('model', process.env.LLM_MODEL || 'gpt-4o')), dryRun: DRY });
  const visionTpl = loadPrompt('01-vision-extractor.md');

  const raw = DRY
    ? files.map((f, i) => ({ json: { content: JSON.stringify({
        platform: ['instagram', 'tiktok', 'facebook'][i % 3], screen_type: 'profil',
        account: { username: '@dryrun', display_name: 'Dry Run', bio_text: '[dry-run] bio', bio_char_count: 13, link_in_bio: null, category_or_label: null, verified: false, profile_photo_description: 'logo' },
        metrics: { followers: '1,2K', following: '300', posts_count: '48', likes_total: null },
        visual_elements: { highlights_or_pinned: [], grid_first_9: [], grid_consistency_observed: 'paleta constanta', dominant_colors: ['alb'], text_overlay_style: null },
        engagement_visible: [], cta_elements: { buttons_visible: [], contact_info_visible: [] }, unreadable: [], confidence: 'high',
      }) } }))
    : await mapPool(files, num('concurrency', 3), async (f, i) => {
        const b64 = readFileSync(f).toString('base64');
        const text = await client.complete({
          prompt: visionTpl,
          images: [{ base64: b64, mimeType: IMG[extname(f).toLowerCase()] }],
          temperature: 0, maxTokens: 1500, json: true, label: basename(f),
        });
        process.stdout.write(`\r  extras: ${i + 1}/${files.length}`);
        return { json: { content: text } };
      });
  if (!DRY) say('');

  const merged = runNode('a1-merge-extractions.js', { input: raw, nodes: { 'Form Trigger': [{ json: form }] } })[0];
  say(`  extractii valide: ${merged.json.extractedCount}/${merged.json.screenshotCount} | platforme: ${merged.json.covered.join(', ') || '—'}`);

  const audit = DRY
    ? { overall_score: 0, score_rationale: '[dry-run]', executive_summary: '[dry-run]', quick_wins: [], content_strategy_30_days: [], missing_data: [], red_flags: [],
        platforms: merged.json.covered.map((p) => ({ platform: p, covered: true, what_works: [], what_doesnt: [], improvements: [],
          bio_variants: [1, 2, 3].map((n) => ({ angle: ['claritate', 'beneficiu', 'diferentiator'][n - 1], text: `[dry-run] varianta ${n}`, cta: '—', rationale: '—' })) })) }
    : await completeJson(client, {
        prompt: renderTemplate(loadPrompt('02-strategist-audit.md'), merged.json) +
          `\n\nRaspunde EXCLUSIV cu un obiect JSON conform acestei scheme:\n${JSON.stringify(loadSchema('audit-output.schema.json'))}`,
        temperature: num('temperature', 0.4), maxTokens: 8000, label: 'strateg',
      });

  const doc = runNode('a1-build-document.js', {
    json: { id: 'local-run' },
    nodes: { Strateg: [{ json: { output: audit } }], 'Form Trigger': [{ json: form }], 'Merge Extractions': [merged] },
  })[0].json;

  mkdirSync(OUT_DIR, { recursive: true });
  const stem = String(flag('out', join(OUT_DIR, `audit-${form['Nume client'].replace(/\s+/g, '-').toLowerCase()}`)));
  writeFileSync(`${stem}.html`, doc.html);
  writeFileSync(`${stem}.json`, JSON.stringify(audit, null, 2) + '\n');
  say(`  scor: ${audit.overall_score}/100`);
  if (doc.flags.length) { say('  verificari automate:'); doc.flags.forEach((f) => say(`    - ${f}`)); }
  say(`\n  scris: ${stem}.html  (acelasi HTML pe care n8n il incarca in Drive ca Google Doc)`);
  say(`  scris: ${stem}.json\n`);
};

/* ---------------- comanda: briefs ---------------- */
const cmdBriefs = () => {
  const cols = ['niche_key','niche_label','audience','pains','objections','desires','services','proof_assets','tone','forbidden','local_context','niche_days','seed_examples','pillars'];
  const rows = listNiches().map((k) => {
    const b = loadBrief(k);
    return Object.fromEntries(cols.map((c) => {
      const v = b[c];
      return [c, Array.isArray(v) ? v.join(c === 'pillars' ? '; ' : '\n') : (v ?? '')];
    }));
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const out = String(flag('out', join(OUT_DIR, 'niche-briefs.csv')));
  writeFileSync(out, toCsv(rows, cols));
  say(`\n  scris: ${out}  (${rows.length} nise: ${rows.map((r) => r.niche_key).join(', ')})`);
  say('  Google Sheets → tab "NicheBriefs" → File → Import → Upload → Replace current sheet\n');
};

/* ---------------- dispatch ---------------- */
const help = `
Runner local pentru agentii de social media.

  node n8n/local/run.mjs ideas  --niche <nisa> [optiuni]
  node n8n/local/run.mjs audit  --screens <folder> [optiuni]
  node n8n/local/run.mjs briefs

Nise disponibile: ${listNiches().join(', ')}

Optiuni comune
  --dry-run              ruleaza tot lantul fara apeluri LLM (verificare de instalare)
  --model <id>           modelul (implicit: $LLM_MODEL sau gpt-4o)
  --concurrency <n>      apeluri LLM in paralel (implicit 3)
  --out <cale>           prefixul fisierelor de iesire
  --out-dir <folder>     folderul de iesire (implicit n8n/output)

ideas
  --count <n>            cate idei (implicit 500)
  --per-slice <n>        idei per felie (implicit 25)
  --limit-slices <n>     genereaza doar primele n felii — pentru teste rapide
  --topup-rounds <n>     runde de completare daca lipsesc idei (implicit 3)
  --year <an>  --country <RO>  --platforms tiktok,instagram,facebook
  --client "<nume>"      optional, apare in fisierul de iesire
  --temperature <n>      implicit 0.8

audit
  --screens <folder>     folderul cu capturi (.png .jpg .webp)
  --client "<nume>"  --niche <nisa>  --goal "<obiectiv>"  --audience "<public>"
  --temperature <n>      implicit 0.4

Chei API: OPENAI_API_KEY (si optional OPENAI_BASE_URL) sau ANTHROPIC_API_KEY.
Furnizor detectat acum: ${detectProvider() || 'niciunul (foloseste --dry-run)'}
`;

const main = async () => {
  if (command === 'ideas') await cmdIdeas();
  else if (command === 'audit') await cmdAudit();
  else if (command === 'briefs') cmdBriefs();
  else { say(help); process.exit(command ? 1 : 0); }
};

main().catch((e) => die(e.stack || e.message));
