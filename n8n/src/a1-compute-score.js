// Code node: "Compute Score"  (Run Once for All Items)
// Scorul de optimizare a profilului (scala 5-10).
//
// Impartirea muncii, intentionat:
//   - modelul ("Scorer") decide DOAR DA/NU pe fiecare criteriu, cu dovada din capturi;
//   - aici, determinist: denumirile si ordinea criteriilor (identice in fiecare raport),
//     simbolul (depinde de tipul criteriului, nu de model), criteriile care sunt pure
//     numaratori sau date calendaristice, scorul, potentialul, etichetele, mediile, formatarea.
// Specificatia cere "scorul rezulta doar din numarare". Numaratoarea, proportiile si
// diferentele de date sunt exact lucrurile pe care modelele le gresesc ocazional.

const scorerItem = $input.first().json;
const scored = scorerItem.output ?? scorerItem;
const merged = $('Merge Extractions').first().json;

const P = 'profil';    // neindeplinit = ❌ (se rezolva imediat)
const C = 'continut';  // neindeplinit = ⏳ (creste in timp)

const COMMON = [
  [1, 'Poză de profil', P], [2, 'Nume cu cuvânt-cheie', P], [3, 'Ce oferi', P],
  [4, 'Pentru cine / rezultat', P], [5, 'Dovadă de încredere', P], [6, 'Localizare', P],
  [7, 'CTA', P], [8, 'Canal CTA', P], [9, 'Bio lizibil', P],
  [10, 'Cale de contact', P], [11, 'Contact de conversie', P], [12, 'Postări fixate', P],
];
const SPECIFIC = {
  instagram: [
    [13, 'Cont profesional', P], [14, 'Highlights', P], [15, 'Coperte highlights', P],
    [16, 'Grilă coerentă', C], [17, 'Dovadă socială', C], [18, 'Reels', C],
    [19, 'Hook pe copertă', C], [20, 'Rubrici recurente', C],
  ],
  tiktok: [
    [13, 'Username', P], [14, 'Hook pe copertă', C], [15, 'Stil recognoscibil', C],
    [16, 'Rubrici recurente', C], [17, 'Prezență umană', C], [18, 'Dovadă socială', C],
    [19, 'Calitate tehnică', C], [20, 'Mix de formate', C],
  ],
  facebook: [
    [13, 'Pagină completă', P], [14, 'Cover de brand', P], [15, 'Identitate vizuală', C],
    [16, 'Dovadă socială', C], [17, 'Recenzii', C], [18, 'Activitate', C],
    [19, 'Video / Reels', C], [20, 'CTA în postări', C],
  ],
};
const PLATFORM_ORDER = ['instagram', 'tiktok', 'facebook'];
const PLATFORM_TITLE = { instagram: 'INSTAGRAM', tiktok: 'TIKTOK', facebook: 'FACEBOOK' };
const DAY = 86400000;

/* ---------------- utilitare ---------------- */

const fmt2 = (v) => v.toFixed(2).replace('.', ',');
const fmt1 = (v) => v.toFixed(1).replace('.', ',');
const round1 = (v) => Math.round((v + 1e-9) * 10) / 10;
const labelOf = (v) => {
  const i = Math.floor(v + 1e-9);
  if (i >= 9) return 'Excelent';
  if (i === 8) return 'Bine optimizat';
  if (i === 7) return 'Pe drumul cel bun';
  if (i === 6) return 'Bază pusă';
  return 'Potențial neexploatat';
};

const today = (() => {
  const s = String(merged.today || '').slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
})();

// Data ultimei postari, din textul literal transcris ("3 z", "2 săpt.", "12 septembrie",
// "Ieri", "5h", "September 12, 2025"). Calculata aici, nu de model.
const MONTHS = {
  ianuarie: 0, ian: 0, january: 0, jan: 0, februarie: 1, feb: 1, february: 1, martie: 2, mar: 2, march: 2,
  aprilie: 3, apr: 3, april: 3, mai: 4, may: 4, iunie: 5, iun: 5, june: 5, jun: 5, iulie: 6, iul: 6,
  july: 6, jul: 6, august: 7, aug: 7, septembrie: 8, sept: 8, sep: 8, september: 8, octombrie: 9,
  oct: 9, october: 9, noiembrie: 10, noi: 10, nov: 10, november: 10, decembrie: 11, dec: 11, december: 11,
};
const parseDateText = (raw) => {
  if (!raw) return null;
  const s = String(raw).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const t0 = today.getTime();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (/\b(azi|astazi|today|acum|just now)\b/.test(s) && !/\d/.test(s)) return new Date(t0);
  if (/\b(ieri|yesterday)\b/.test(s)) return new Date(t0 - DAY);
  m = s.match(/(\d+)\s*(min|minute|m|ore|ora|h|hr|hrs|hours?|zile|zi|z|d|days?|saptamani|saptamana|sapt|sap|w|weeks?|luni|luna|mo|months?|ani|an|y|years?)\b/);
  if (m) {
    const n = +m[1];
    const u = m[2];
    if (/^(min|minute|m|ore|ora|h|hr|hrs|hours?)$/.test(u)) return new Date(t0);
    if (/^(zile|zi|z|d|days?)$/.test(u)) return new Date(t0 - n * DAY);
    if (/^(saptamani|saptamana|sapt|sap|w|weeks?)$/.test(u)) return new Date(t0 - n * 7 * DAY);
    if (/^(luni|luna|mo|months?)$/.test(u)) return new Date(t0 - n * 30 * DAY);
    if (/^(ani|an|y|years?)$/.test(u)) return new Date(t0 - n * 365 * DAY);
  }
  const build = (day, monthIdx, year) => {
    let y = year || today.getUTCFullYear();
    let d = new Date(Date.UTC(y, monthIdx, day));
    if (!year && d.getTime() > t0) d = new Date(Date.UTC(y - 1, monthIdx, day)); // fara an si in viitor = anul trecut
    return d;
  };
  m = s.match(/\b(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?/);
  if (m && m[2] in MONTHS) return build(+m[1], MONTHS[m[2]], m[3] ? +m[3] : null);
  m = s.match(/\b([a-z]+)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m && m[1] in MONTHS) return build(+m[2], MONTHS[m[1]], m[3] ? +m[3] : null);
  return null;
};

/* ---------------- date din extractie, pentru criteriile numarabile ---------------- */

const exsOf = (platform) => (merged.extractions || []).filter((e) => String(e.platform || '').toLowerCase() === platform);

const postsOf = (e) => {
  if (Array.isArray(e.posts_visible)) return e.posts_visible;
  const old = e.visual_elements && e.visual_elements.grid_first_9; // schema veche a extractorului
  if (Array.isArray(old)) return old.map((p) => ({ visible_text_on_cover: p.visible_text_on_thumbnail, has_face: p.has_face, subject: p.subject }));
  return [];
};
// Doua capturi ale aceleiasi grile se pot suprapune. Ca sa nu numaram de doua ori,
// folosim captura cu cele mai multe postari vizibile, nu suma lor.
const bestPosts = (exs) => exs.map(postsOf).reduce((a, b) => (b.length > a.length ? b : a), []);
const known = (exs, key) => exs.some((e) => Array.isArray(e[key]));
const maxLen = (exs, key) => Math.max(0, ...exs.map((e) => (Array.isArray(e[key]) ? e[key].length : 0)));

const mediaType = (p) => String(p.media_type || '').toLowerCase();
const isVideo = (p) => ['reel', 'video'].includes(mediaType(p));
const isPhotoPost = (p) => ['carusel_foto', 'carusel', 'foto'].includes(mediaType(p));
const hasHook = (p) => !!String(p.visible_text_on_cover || '').trim() && p.text_legible !== false;

// Regulile automate intorc { mode, met, note, notIn } sau null (decide modelul).
//   mode 'decide': criteriul e o numaratoare, rezultatul e final;
//   mode 'cap':    numaratoarea e doar o conditie necesara — poate cobori un DA la NU, niciodata invers.
const ratio = (pred, num, den, strict = false) => (ctx) => {
  const n = ctx.posts.length;
  if (!n) return { mode: 'decide', met: false, notIn: true, note: 'postările nu apar în capturi' };
  const k = ctx.posts.filter(pred).length;
  const met = strict ? k * den > n * num : k * den >= n * num;
  return { mode: 'decide', met, note: `${k} din ${n} postări vizibile` };
};

const AUTO = {
  all: {
    12: (ctx) => {
      if (!ctx.pinnedKnown) return null;
      const [lo, hi] = ctx.platform === 'facebook' ? [1, 1] : [2, 3];
      if (ctx.pinned >= lo && ctx.pinned <= hi) return null; // numarul e corect, rolul il judeca modelul
      const need = lo === hi ? `${lo}` : `${lo}–${hi}`;
      return { mode: 'cap', met: false, notIn: ctx.pinned === 0, note: `${ctx.pinned} postări fixate vizibile, necesar ${need}` };
    },
  },
  instagram: {
    14: (ctx) => (ctx.highlightsKnown && ctx.highlights < 4
      ? { mode: 'cap', met: false, notIn: ctx.highlights === 0, note: `${ctx.highlights} highlights vizibile, minimum 4` }
      : null),
    18: ratio(isVideo, 1, 3),
    19: ratio(hasHook, 1, 2),
  },
  tiktok: {
    14: ratio(hasHook, 1, 2),
    17: ratio((p) => p.has_face === true, 1, 2),
    19: (ctx) => {
      const n = ctx.posts.length;
      if (!n) return { mode: 'decide', met: false, notIn: true, note: 'video-urile nu apar în capturi' };
      const ok = ctx.posts.filter((p) => p.vertical_fullscreen === true && p.image_clear === true).length;
      return { mode: 'decide', met: ok === n, note: `${ok} din ${n} video-uri verticale full-screen și clare` };
    },
    20: (ctx) => {
      if (!ctx.posts.length) return { mode: 'decide', met: false, notIn: true, note: 'postările nu apar în capturi' };
      const v = ctx.posts.some(isVideo);
      const f = ctx.posts.some(isPhotoPost);
      return { mode: 'decide', met: v && f, note: `video: ${v ? 'da' : 'nu'}, carusel foto: ${f ? 'da' : 'nu'}` };
    },
  },
  facebook: {
    18: (ctx) => {
      if (!ctx.lastPost) return { mode: 'decide', met: false, notIn: true, note: 'data ultimei postări nu apare în capturi' };
      const days = Math.round((today.getTime() - ctx.lastPost.getTime()) / DAY);
      return { mode: 'decide', met: days >= 0 && days <= 30, note: `ultima postare vizibilă: acum ${days} zile` };
    },
    19: (ctx) => {
      if (!ctx.posts.length) return { mode: 'decide', met: false, notIn: true, note: 'postările nu apar în capturi' };
      const k = ctx.posts.filter(isVideo).length;
      return { mode: 'decide', met: k > 0, note: `${k} video/reels din ${ctx.posts.length} postări vizibile` };
    },
    20: ratio((p) => p.caption_has_cta === true, 1, 2, true),
  },
};

/* ---------------- validarea raspunsului modelului ---------------- */

const flags = [];
const overrides = [];

const byPlatform = new Map();
for (const p of scored.platforms || []) {
  const key = String(p.platform || '').toLowerCase();
  if (SPECIFIC[key] && !byPlatform.has(key)) byPlatform.set(key, p);
}

const coveredRaw = (merged.covered || []).map((p) => String(p).toLowerCase());
const covered = PLATFORM_ORDER.filter((p) => coveredRaw.includes(p));
if (!covered.length) throw new Error('Nicio platformă recunoscută în capturi: scorul nu se poate calcula.');

const missing = covered.filter((p) => !byPlatform.has(p));
if (missing.length) {
  // Un scor gresit trimis clientului e mai rau decat o executie oprita.
  throw new Error(`Scorer-ul nu a evaluat platforma: ${missing.join(', ')}. Reia executia; nodul are Retry On Fail.`);
}
for (const k of byPlatform.keys()) {
  if (!covered.includes(k)) flags.push(`Scorer-ul a evaluat ${k}, dar nu există capturi pentru ea: evaluarea a fost ignorată.`);
}

/* ---------------- evaluare per platforma ---------------- */

const evaluate = (platform) => {
  const raw = byPlatform.get(platform);
  const answers = new Map();
  for (const c of raw.criteria || []) {
    const id = Number(c && c.id);
    if (id >= 1 && id <= 20 && !answers.has(id)) answers.set(id, c);
  }

  const exs = exsOf(platform);
  const lastPostText = exs.map((e) => e.facebook_page && e.facebook_page.last_post_date_text).find(Boolean);
  const ctx = {
    platform,
    posts: bestPosts(exs),
    pinnedKnown: known(exs, 'pinned_posts'),
    pinned: maxLen(exs, 'pinned_posts'),
    highlightsKnown: known(exs, 'highlights'),
    highlights: maxLen(exs, 'highlights'),
    lastPost: parseDateText(lastPostText) || parseDateText(raw.last_post_date),
  };

  const rows = [...COMMON, ...SPECIFIC[platform]].map(([id, name, type]) => {
    const a = answers.get(id);
    let met = !!a && a.met === true;
    let notIn = !!a && a.not_in_screenshots === true;
    let evidence = a ? String(a.evidence || '').trim() : '';
    let source = 'model';

    if (!a) flags.push(`${PLATFORM_TITLE[platform]} / ${id}. ${name}: neevaluat de model, marcat NU.`);
    if (met && notIn) {  // regula 4: nu apare in capturi = NU
      met = false;
      overrides.push({ platform, id, name, model: true, final: false, reason: 'marcat DA, dar și „nu apare în capturi"' });
    }
    if (met && !evidence) {  // regula 3: DA fara dovada = dubiu = NU
      met = false;
      overrides.push({ platform, id, name, model: true, final: false, reason: 'DA fără dovadă din capturi' });
    }

    const rule = (AUTO[platform] && AUTO[platform][id]) || AUTO.all[id];
    const auto = rule ? rule(ctx) : null;
    if (auto && (auto.mode === 'decide' || met)) {
      if (auto.met !== met) overrides.push({ platform, id, name, model: met, final: auto.met, reason: auto.note });
      met = auto.met;
      notIn = !met && !!auto.notIn;
      evidence = auto.note + (evidence ? ` · ${evidence}` : '');
      source = 'auto';
    }

    return {
      id, name, type, met,
      symbol: met ? '✅' : type === P ? '❌' : '⏳',
      not_in_screenshots: !met && notIn,
      evidence,
      source,
    };
  });

  const ok = rows.filter((r) => r.met).length;
  const fixable = rows.filter((r) => !r.met && r.type === P).length;
  const score = 5 + 0.25 * ok;
  const potential = 5 + 0.25 * (ok + fixable);
  return {
    platform,
    title: PLATFORM_TITLE[platform],
    rows,
    count_ok: ok,
    count_fixable: fixable,
    count_growing: rows.length - ok - fixable,
    score,
    potential,
    score_display: fmt2(score),
    potential_display: fmt2(potential),
    label: labelOf(score),
  };
};

const platforms = covered.map(evaluate);

let general = null;
if (platforms.length >= 2) {
  const s = round1(platforms.reduce((a, p) => a + p.score, 0) / platforms.length);
  const pot = round1(platforms.reduce((a, p) => a + p.potential, 0) / platforms.length);
  // Eticheta se ia din valoarea AFISATA: o medie de 6,96 se afiseaza 7,0 si trebuie sa
  // poarte eticheta lui 7, altfel raportul se contrazice singur.
  general = { score: s, potential: pot, score_display: fmt1(s), potential_display: fmt1(pot), label: labelOf(s) };
}

/* ---------------- textul sectiunii, exact in formatul cerut ---------------- */

const lines = ['🎯 SCOR DE OPTIMIZARE', '✅ îndeplinit · ❌ se rezolvă imediat · ⏳ crește odată cu conținutul', ''];
for (const p of platforms) {
  lines.push(p.title);
  for (const r of p.rows) lines.push(`${r.symbol} ${r.name}${r.not_in_screenshots ? ' (nu apare în capturi)' : ''}`);
  lines.push(`→ Scor: ${p.score_display}/10 · ${p.label}`);
  lines.push(`→ Potențial după optimizarea profilului: ${p.potential_display}/10`);
  lines.push('');
}
if (general) {
  lines.push(`📊 SCOR GENERAL: ${general.score_display}/10 · ${general.label}`);
  lines.push(`🚀 POTENȚIAL DUPĂ OPTIMIZARE: ${general.potential_display}/10`);
  lines.push('');
}
lines.push('Fiecare ❌ rezolvat = +0,25 puncte.');

// Varianta compacta pentru promptul strategului: ce e ✅, ❌, ⏳ si de ce.
const checklist = platforms.map((p) => ({
  platform: p.platform,
  scor: p.score_display,
  criterii: p.rows.map((r) => ({ id: r.id, nume: r.name, simbol: r.symbol, dovada: r.evidence })),
}));

return [{
  json: {
    ...merged,
    score: {
      today: today.toISOString().slice(0, 10),
      platforms,
      general,
      text: lines.join('\n'),
      checklist,
      overrides,
      flags,
    },
  },
}];
