// Code node: "Flatten Ideas"  (Run Once for All Items) — ruleaza IN interiorul buclei
// Sparge raspunsul LLM (un obiect cu array-ul "ideas") in item-uri individuale
// si ataseaza metadatele feliei curente.

const slice = $('Loop Over Slices').first().json;
const out = [];

for (const item of $input.all()) {
  const payload = item.json.output ?? item.json;
  const ideas = payload.ideas || payload;
  if (!Array.isArray(ideas)) continue;

  for (const idea of ideas) {
    if (!idea || !idea.title) continue;
    out.push({
      json: {
        niche: slice.niche,
        niche_key: slice.niche_key,
        client: slice.client,
        slice_index: slice.slice_index,
        pillar: idea.pillar || slice.pillar,
        funnel_stage: idea.funnel_stage || slice.funnel_stage,
        format: idea.format || slice.format,
        platform: idea.platform || slice.platform,
        month: idea.suggested_month || slice.month,
        suggested_date: idea.suggested_date || '',
        occasion: idea.occasion || '',
        title: String(idea.title).trim(),
        hook: String(idea.hook || '').trim(),
        outline: Array.isArray(idea.outline) ? idea.outline.join(' | ') : String(idea.outline || ''),
        cta: idea.cta || '',
        keywords_hashtags: Array.isArray(idea.keywords_hashtags) ? idea.keywords_hashtags.join(' ') : String(idea.keywords_hashtags || ''),
        effort: idea.effort || '',
        compliance_ok: idea.compliance_ok !== false,
        notes: idea.notes || '',
      },
    });
  }
}

return out;
