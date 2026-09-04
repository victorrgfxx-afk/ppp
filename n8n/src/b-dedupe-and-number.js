// Code node: "Dedupe & Number"  (Run Once for All Items)
// Ruleaza pe iesirea "done" a buclei. Trei straturi de deduplicare, in ordinea costului:
//   1. normalizare + hash exact
//   2. trigrame Jaccard pe titlu (prinde parafrazele)
//   3. raport de deficit, daca nu s-a atins tinta
// Pentru volume mari (5.000+ idei) treci pe embeddings + vector store, prag cosine ~0.90.

// Doua praguri, pentru ca prind lucruri diferite:
//  - trigramele prind reformularile marunte ("albirea dentara" vs "albire dentara")
//  - setul de cuvinte prinde reordonarea ("5 mituri despre X" vs "Mituri despre X: 5 lucruri")
const TRIGRAM_THRESHOLD = 0.72; // 0.65 = agresiv, 0.80 = permisiv
const TOKEN_THRESHOLD = 0.8;

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
    .replace(/\b(si|sau|de|la|in|pe|cu|un|o|al|ale|cel|cea|ce|care|pentru|din|despre|cum|ce|top|idei)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const trigrams = (s) => {
  const t = `  ${s}  `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
};

const tokens = (s) => new Set(s.split(' ').filter(Boolean));

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
};

const kept = [];
const keptGrams = [];
const keptTokens = [];
const seenExact = new Set();
let droppedExact = 0;
let droppedSimilar = 0;

for (const it of items) {
  const n = norm(it.title);
  if (!n) continue;

  const sortedKey = n.split(' ').sort().join(' ');
  if (seenExact.has(sortedKey)) { droppedExact++; continue; }

  const g = trigrams(n);
  const tk = tokens(n);
  let similar = false;
  for (let i = 0; i < keptGrams.length; i++) {
    if (jaccard(g, keptGrams[i]) >= TRIGRAM_THRESHOLD || jaccard(tk, keptTokens[i]) >= TOKEN_THRESHOLD) {
      similar = true;
      break;
    }
  }
  if (similar) { droppedSimilar++; continue; }

  seenExact.add(sortedKey);
  keptGrams.push(g);
  keptTokens.push(tk);
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
