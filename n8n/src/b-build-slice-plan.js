// Code node: "Build Slice Plan"  (Run Once for All Items)
// Construieste planul de felii: fiecare felie = o combinatie unica de
// pilon x format x etapa funnel x luna x platforma, cu ocaziile lunii atasate.
// Feliile fiind disjuncte, modelul nu are cum sa repete masiv chiar daca apelurile ruleaza separat.
//
// Citeste din: "Start" (parametrii rularii), "Get Niche Brief" (Sheets),
//              "Get Public Holidays" (HTTP), "Get International Days" (Sheets).

const params = $('Start').first().json;
const brief = $('Get Niche Brief').first().json;

const nicheKey = String(params.niche_key || brief.niche_key || '').toLowerCase();
const year = Number(params.year) || new Date().getFullYear();
const target = Number(params.target_ideas) || 500;
const platforms = String(params.platforms || 'tiktok,instagram,facebook').split(',').map((s) => s.trim()).filter(Boolean);

if (!brief || !brief.niche_key) {
  throw new Error(`Nu am gasit briefingul pentru nisa "${nicheKey}" in tab-ul NicheBriefs.`);
}

// ---------- Zile mobile: se calculeaza, nu se hardcodeaza ----------
const nthWeekday = (y, month, weekday, n) => {
  // month 1-12, weekday 0=duminica
  const first = new Date(Date.UTC(y, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(y, month - 1, 1 + shift + (n - 1) * 7));
};
const iso = (d) => d.toISOString().slice(0, 10);

const resolveMovable = (name, y) => {
  const n = name.toLowerCase();
  if (n.includes('ziua mamei')) return iso(nthWeekday(y, 5, 0, 1));          // prima duminica din mai
  if (n.includes('ziua tatalui')) return iso(nthWeekday(y, 5, 0, 2));        // a doua duminica din mai
  if (n.includes('habitatului')) return iso(nthWeekday(y, 10, 1, 1));        // prima luni din octombrie
  if (n.includes('blue monday')) return iso(nthWeekday(y, 1, 1, 3));         // a treia luni din ianuarie
  if (n.includes('black friday')) {
    const thanksgiving = nthWeekday(y, 11, 4, 4);                            // al 4-lea joi din noiembrie
    return iso(new Date(thanksgiving.getTime() + 86400000));
  }
  if (n.includes('cyber monday')) {
    const thanksgiving = nthWeekday(y, 11, 4, 4);
    return iso(new Date(thanksgiving.getTime() + 4 * 86400000));
  }
  return null; // ramane data aproximativa din CSV
};

// ---------- Sarbatori legale si religioase (din API) ----------
const holidays = $('Get Public Holidays').all().map((i) => i.json).filter((h) => h && h.date).map((h) => ({
  date: h.date,
  name: h.localName || h.name,
  type: 'sarbatoare',
}));

// ---------- Zile internationale / tematice (din Google Sheets) ----------
const truthy = (v) => String(v).toLowerCase() === 'true' || v === true;
const intlDays = $('Get International Days').all().map((i) => i.json)
  .filter((d) => d && d.date && d.name_ro)
  .filter((d) => {
    const niches = String(d.niches || 'all').toLowerCase();
    return niches === 'all' || niches.split(',').map((s) => s.trim()).includes(nicheKey);
  })
  .map((d) => {
    const movableDate = truthy(d.movable) ? resolveMovable(d.name_ro, year) : null;
    return {
      date: movableDate || `${year}-${String(d.date).trim()}`,
      name: d.name_ro,
      type: d.type || 'international',
      note: d.note || '',
    };
  });

// ---------- Zile specifice nisei, din brief (format "MM-DD Nume; MM-DD Nume") ----------
const nicheDays = String(brief.niche_days || '').split(';').map((s) => s.trim()).filter(Boolean).map((chunk) => {
  const m = chunk.match(/^(\d{2}-\d{2})\s+(.+)$/);
  return m ? { date: `${year}-${m[1]}`, name: m[2], type: 'nisa' } : null;
}).filter(Boolean);

const allOccasions = [...holidays, ...intlDays, ...nicheDays]
  .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date))
  .sort((a, b) => a.date.localeCompare(b.date));

const byMonth = {};
for (const o of allOccasions) {
  const m = Number(o.date.slice(5, 7));
  (byMonth[m] = byMonth[m] || []).push(o);
}

// ---------- Matricea de felii ----------
const DEFAULT_PILLARS = [
  'Educatie (cum functioneaza, ce sa astepti)',
  'Autoritate si dovezi',
  'Behind the scenes (oameni si proces)',
  'Obiectii si mituri',
  'Comunitate si context local',
];
const pillars = Array.isArray(brief.pillars) && brief.pillars.length
  ? brief.pillars
  : String(brief.pillars || '').split(';').map((s) => s.trim()).filter(Boolean).length
  ? String(brief.pillars).split(';').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_PILLARS;

const formats = ['short video', 'carusel', 'postare statica', 'story serie', 'live/Q&A', 'UGC/testimonial'];
const stages = ['TOFU', 'MOFU', 'BOFU'];

const IDEAS_PER_SLICE = Number(params.ideas_per_slice) || 25;
// Supragenerare intentionata cu ~10%: deduplicarea taie din ele, iar deficitul
// costa un al doilea pas de generare. Mai ieftin sa generezi in plus.
const sliceCount = Math.ceil((target * 1.1) / IDEAS_PER_SLICE);

const MONTH_NAMES = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];

const seedExamples = Array.isArray(brief.seed_examples)
  ? brief.seed_examples.join('\n- ')
  : String(brief.seed_examples || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean).join('\n- ');

const slices = [];
for (let i = 0; i < sliceCount; i++) {
  const month = Math.floor((i * 12) / sliceCount) + 1;
  const occasions = (byMonth[month] || []).slice(0, 6)
    .map((o) => `${o.date} — ${o.name}${o.type === 'sarbatoare' ? ' (sarbatoare legala/religioasa)' : ''}`)
    .join('; ') || 'nicio ocazie relevanta luna aceasta — genereaza doar evergreen';

  slices.push({
    slice_index: i + 1,
    slice_total: sliceCount,
    niche: brief.niche_label || brief.niche_key,
    niche_key: nicheKey,
    client: params.client || '',
    year,
    month,
    month_name: MONTH_NAMES[month - 1],
    occasions,
    pillar: pillars[i % pillars.length],
    format: formats[i % formats.length],
    funnel_stage: stages[i % stages.length],
    platform: platforms[i % platforms.length],
    ideas_per_slice: IDEAS_PER_SLICE,
    target_ideas: target,
    // briefing, injectat in prompt
    audience: brief.audience,
    pains: brief.pains,
    objections: brief.objections,
    desires: brief.desires,
    services: brief.services,
    proof_assets: brief.proof_assets,
    tone: brief.tone,
    local_context: brief.local_context,
    forbidden: brief.forbidden,
    seed_examples: seedExamples ? `- ${seedExamples}` : '(niciun exemplu furnizat — calitatea va fi vizibil mai slaba)',
  });
}

return slices.map((s) => ({ json: s }));
