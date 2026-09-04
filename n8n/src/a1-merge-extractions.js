// Code node: "Merge Extractions"  (Run Once for All Items)
// Aduna toate extractiile vision intr-un singur item pentru Strateg.
// Tolerant la JSON impachetat in ```json ... ``` sau cu text in jur.

const items = $input.all();
const client = $('Form Trigger').first().json;

const parseJson = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  if (!raw) return null;
  const s = String(raw).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
};

const extractions = [];
const failed = [];

items.forEach((it, i) => {
  const j = it.json || {};
  const raw = j.content ?? j.text ?? j.output ?? j.message?.content ?? j.data ?? j;
  const parsed = parseJson(raw);
  if (parsed && (parsed.platform || parsed.account)) {
    extractions.push({ screenshot: i + 1, ...parsed });
  } else {
    failed.push({ screenshot: i + 1, raw: String(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 300) });
  }
});

if (!extractions.length) {
  throw new Error(
    'Nicio extractie valida din capturi. Cauze frecvente: "Length of Description (Max Tokens)" a ramas pe 300 la nodul Analyze Image, sau modelul selectat nu suporta vision.'
  );
}

// Ce platforme au fost efectiv acoperite de capturi (strategul nu are voie sa evalueze restul)
const covered = [...new Set(extractions.map((e) => e.platform).filter((p) => p && p !== 'unknown'))];

const lowConfidence = extractions.filter((e) => e.confidence === 'low').map((e) => e.screenshot);

return [{
  json: {
    client,
    extractions,
    failed,
    covered,
    lowConfidence,
    screenshotCount: items.length,
    extractedCount: extractions.length,
  },
}];
