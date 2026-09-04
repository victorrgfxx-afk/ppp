// Code node: "Dedupe & Number"  (Run Once for All Items)
// Ruleaza pe iesirea "done" a buclei. Trei straturi de deduplicare, in ordinea costului:
//   1. normalizare + hash exact
//   2. trigrame Jaccard pe titlu (prinde parafrazele)
//   3. raport de deficit, daca nu s-a atins tinta
// Pentru volume mari (5.000+ idei) treci pe embeddings + vector store, prag cosine ~0.90.

// Doua semnale de similaritate, pentru ca prind lucruri diferite:
//  - cosinus ponderat cu IDF pe cuvinte: cuvintele comune multor titluri ("cat", "costa",
//    "explicat") cantaresc putin, cele distinctive ("implant", "fatete") cantaresc mult.
//    Asta e diferenta care conteaza: doua idei care impart acelasi sablon dar au subiecte
//    diferite NU sunt duplicate, iar Jaccard simplu le taia.
//  - trigrame, pentru variantele aproape identice ca sir ("albirea dentara" / "albire dentara")
//
// Praguri calibrate pe perechi etichetate manual (vezi testul "calibrarea pragurilor"
// din tests/run-tests.mjs). Marja pana la cea mai apropiata pereche care trebuie PASTRATA
// este mare la ambele, deci nu sunt fragile.
//
// LIMITA CUNOSCUTA: doua idei identice ca sens, dar formulate cu cuvinte complet diferite
// ("Ce se intampla la prima vizita" / "Cum decurge prima ta consultatie") NU sunt prinse.
// Nicio metoda lexicala nu le prinde. Daca ajunge sa te deranjeze, treci pe embeddings:
// inlocuiesti vectorize() cu un vector de embedding si compari cu acelasi cosinus, prag ~0.90.
const COSINE_THRESHOLD = 0.85;   // 0.80 = agresiv, 0.90 = permisiv
const TRIGRAM_THRESHOLD = 0.7;   // prinde reformularile marunte si formele gramaticale

const items = $input.all().map((i) => i.json).filter((i) => i && i.title);
if (!items.length) throw new Error('Bucla nu a produs nicio idee. Verifica Structured Output Parser-ul.');

const target = Number(items[0].target_ideas) || Number($('Start').first().json.target_ideas) || 500;
const nicheKey = items[0].niche_key || 'nisa';
const year = $('Start').first().json.year || new Date().getFullYear();

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(si|sau|de|la|in|pe|cu|un|o|al|ale|cel|cea|ce|care|pentru|din|despre|cum|top|idei)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const trigrams = (s) => {
  const t = `  ${s}  `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
};

// --- IDF peste setul de titluri, calculat inainte de comparatii ---
// Frecventa se calculeaza pe titlurile UNICE: altfel un titlu repetat de 3 ori umfla df-ul
// cuvintelor lui, le scade greutatea si duplicatele lui scapa nedetectate. Efect real,
// prins de teste, nu teoretic.
const normed = items.map((it) => norm(it.title));
const tokenLists = normed.map((n) => n.split(' ').filter(Boolean));
const df = new Map();
for (const n of new Set(normed)) for (const t of new Set(n.split(' ').filter(Boolean))) df.set(t, (df.get(t) || 0) + 1);
const N = new Set(normed).size;
const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;

const vectorize = (toks) => {
  const v = new Map();
  for (const t of toks) v.set(t, (v.get(t) || 0) + 1);
  let sumSq = 0;
  for (const [t, c] of v) { const w = c * idf(t); v.set(t, w); sumSq += w * w; }
  const len = Math.sqrt(sumSq) || 1;
  for (const [t, w] of v) v.set(t, w / len);
  return v;
};

const cosine = (a, b) => {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [t, w] of small) { const w2 = big.get(t); if (w2) s += w * w2; }
  return s;
};

const kept = [];
const keptGrams = [];
const keptVecs = [];
const seenExact = new Set();
let droppedExact = 0;
let droppedSimilar = 0;

for (let idx = 0; idx < items.length; idx++) {
  const it = items[idx];
  const n = normed[idx];
  if (!n) continue;

  const sortedKey = n.split(' ').sort().join(' ');
  if (seenExact.has(sortedKey)) { droppedExact++; continue; }

  const g = trigrams(n);
  const v = vectorize(tokenLists[idx]);
  let similar = false;
  for (let i = 0; i < kept.length; i++) {
    if (cosine(v, keptVecs[i]) >= COSINE_THRESHOLD || jaccard(g, keptGrams[i]) >= TRIGRAM_THRESHOLD) {
      similar = true;
      break;
    }
  }
  if (similar) { droppedSimilar++; continue; }

  seenExact.add(sortedKey);
  keptGrams.push(g);
  keptVecs.push(v);
  kept.push(it);
}

// Echilibram taierea la tinta: luam pe rand din fiecare felie, ca sa nu ramanem
// cu 500 de idei toate din primele 8 felii (adica din primele 5 luni).
const bySlice = new Map();
for (const it of kept) {
  const k = it.slice_index || 0;
  if (!bySlice.has(k)) bySlice.set(k, []);
  bySlice.get(k).push(it);
}
const balanced = [];
let round = 0;
while (balanced.length < Math.min(target, kept.length)) {
  let addedThisRound = 0;
  for (const [, arr] of bySlice) {
    if (arr[round]) { balanced.push(arr[round]); addedThisRound++; }
    if (balanced.length >= target) break;
  }
  if (!addedThisRound) break;
  round++;
}

const final = balanced.map((it, i) => ({
  json: {
    id: `${nicheKey}-${year}-${String(i + 1).padStart(3, '0')}`,
    ...it,
    status: 'idee',
    generated_at: new Date().toISOString().slice(0, 10),
    _stats_total_generated: items.length,
    _stats_unique: kept.length,
    _stats_dropped_exact: droppedExact,
    _stats_dropped_similar: droppedSimilar,
    _stats_deficit: Math.max(0, target - kept.length),
  },
}));

if (kept.length < target) {
  console.log(
    `ATENTIE: ${kept.length} idei unice din ${target} cerute (generate brut: ${items.length}, ` +
    `duplicate exacte: ${droppedExact}, prea similare: ${droppedSimilar}). ` +
    `Creste ideas_per_slice sau imbunatateste seed_examples din brief.`
  );
}

return final;
