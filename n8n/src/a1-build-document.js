// Code node: "Build Document"  (Run Once for All Items)
// Ruleaza DUPA "Create Client Folder" (are nevoie de id-ul folderului).
// Face doua lucruri pe care un LLM nu le face de incredere:
//   1. Numara caracterele fiecarei descrieri si marcheaza depasirile.
//   2. Randeaza raportul in HTML, ca sa ajunga in Google Docs cu formatare reala.
// Output: { docName, folderId, flags, multipart, html }

const strateg = $('Strateg').first().json;
const audit = strateg.output ?? strateg.data ?? strateg;
const form = $('Form Trigger').first().json;
const context = $('Merge Extractions').first().json;
const folderId = $json.id;

if (!folderId) {
  throw new Error('Nu am primit id-ul folderului din Google Drive. Verifica nodul "Create Client Folder".');
}
if (!audit || !Array.isArray(audit.platforms)) {
  throw new Error('Auditul nu are structura asteptata. Verifica Structured Output Parser-ul nodului "Strateg".');
}

// --- Limite de caractere. Reconfirma-le anual, platformele le schimba. ---
const PLATFORM_LIMITS = {
  instagram: { bio: 150, name: 30, label: 'Instagram' },
  tiktok:    { bio: 80,  name: 30, label: 'TikTok' },
  facebook:  { bio: 101, name: 50, label: 'Facebook' },
};

// Numaram code points, nu bytes: un emoji = 1 aici, dar platformele il pot conta ca 2.
// De aceea marja de siguranta: avertizam de la 95% din limita.
const len = (s) => Array.from(String(s ?? '')).length;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

const flags = [];
const clientName = form['Nume client'] || 'Client';
const today = new Date().toISOString().slice(0, 10);

// ---------- Validarea descrierilor ----------
for (const p of audit.platforms) {
  const key = String(p.platform || '').toLowerCase();
  const limits = PLATFORM_LIMITS[key];
  if (!limits || !Array.isArray(p.bio_variants)) continue;

  p.bio_variants.forEach((v, i) => {
    const actual = len(v.text);
    v.char_count = actual;                       // NU avem incredere in numaratoarea modelului
    v.limit = limits.bio;
    v.over_limit = actual > limits.bio;
    v.tight = !v.over_limit && actual > limits.bio * 0.95;
    if (v.over_limit) {
      flags.push(`${limits.label} / varianta ${i + 1}: ${actual} caractere, peste limita de ${limits.bio}.`);
    }
    if (v.name_field && len(v.name_field) > limits.name) {
      flags.push(`${limits.label} / varianta ${i + 1}: campul Name are ${len(v.name_field)} caractere, peste limita de ${limits.name}.`);
    }
  });
}

// ---------- Randare HTML ----------
const li = (arr, fn) => (Array.isArray(arr) && arr.length ? `<ul>${arr.map(fn).join('')}</ul>` : '<p><em>—</em></p>');

const badge = (txt, color) =>
  `<span style="background:${color};padding:1px 6px;border-radius:3px;font-size:9pt;">${esc(txt)}</span>`;

const platformSection = (p) => {
  const key = String(p.platform || '').toLowerCase();
  const limits = PLATFORM_LIMITS[key] || { bio: 0, label: p.platform };

  if (p.covered === false) {
    return `<h2>${esc(limits.label)}</h2><p><em>Nu s-au primit capturi de ecran pentru aceasta platforma. Nu a fost evaluata.</em></p>`;
  }

  const variants = (p.bio_variants || []).map((v, i) => {
    const status = v.over_limit
      ? badge(`${v.char_count}/${limits.bio} — PESTE LIMITA, trebuie scurtat`, '#ffd6d6')
      : v.tight
      ? badge(`${v.char_count}/${limits.bio} — la limita`, '#fff3cd')
      : badge(`${v.char_count}/${limits.bio}`, '#d9f2e0');
    return `
      <p><strong>Varianta ${i + 1} — ${esc(v.angle || '')}</strong> ${status}</p>
      <table style="border-collapse:collapse;width:100%;">
        <tr><td style="border:1px solid #ddd;padding:8px;">${nl2br(v.text)}</td></tr>
      </table>
      ${v.name_field ? `<p style="font-size:10pt;">Camp <em>Name</em> propus: <strong>${esc(v.name_field)}</strong> (${len(v.name_field)}/${limits.name})</p>` : ''}
      <p style="font-size:10pt;">CTA: ${esc(v.cta)}<br>De ce functioneaza: ${esc(v.rationale)}</p>`;
  }).join('');

  return `
    <h2>${esc(limits.label)}${p.handle ? ` — ${esc(p.handle)}` : ''}</h2>
    ${p.current_bio ? `<p style="font-size:10pt;color:#555;">Descriere actuala (${p.current_bio_chars ?? len(p.current_bio)}/${limits.bio} caractere): ${esc(p.current_bio)}</p>` : ''}

    <h3>Ce functioneaza</h3>
    ${li(p.what_works, (w) => `<li><strong>${esc(w.observation)}</strong><br><em>Din capturi:</em> ${esc(w.evidence)}<br><em>De ce conteaza:</em> ${esc(w.why_it_matters)}</li>`)}

    <h3>Ce nu functioneaza</h3>
    ${li(p.what_doesnt, (w) => `<li><strong>${esc(w.issue)}</strong><br><em>Din capturi:</em> ${esc(w.evidence)}<br><em>Cost:</em> ${esc(w.cost)}</li>`)}

    <h3>Ce facem concret</h3>
    ${li(p.improvements, (im) => `<li><strong>${esc(im.action)}</strong> ${badge(`impact ${im.impact}`, '#e7eefc')} ${badge(`efort ${im.effort}`, '#f0f0f0')}<br>${esc(im.how_to)}${im.expected_result ? `<br><em>Rezultat asteptat:</em> ${esc(im.expected_result)}` : ''}</li>`)}

    <h3>Trei propuneri de descriere</h3>
    ${variants || '<p><em>—</em></p>'}`;
};

const html = `<html><body style="font-family:Arial,sans-serif;">
<h1>Audit social media — ${esc(clientName)}</h1>
<p style="color:#666;">Nisa: ${esc(form['Nișă'] || form['Nisa'] || '—')} &nbsp;|&nbsp; Data: ${today} &nbsp;|&nbsp; Capturi analizate: ${context.extractedCount}/${context.screenshotCount}</p>

<h2>Pe scurt</h2>
<p><strong>Scor general: ${esc(audit.overall_score)}/100.</strong> ${esc(audit.score_rationale)}</p>
${audit.executive_summary ? `<p>${nl2br(audit.executive_summary)}</p>` : ''}

${Array.isArray(audit.red_flags) && audit.red_flags.length ? `<h2>De rezolvat urgent</h2>${li(audit.red_flags, (r) => `<li>${esc(r)}</li>`)}` : ''}

<h2>Trei lucruri de facut azi</h2>
${li(audit.quick_wins, (q) => `<li><strong>${esc(q.action)}</strong>${q.platform ? ` (${esc(q.platform)})` : ''} — ${esc(q.time_needed)}</li>`)}

${audit.platforms.map(platformSection).join('\n')}

<h2>Plan de continut, 30 de zile</h2>
${li(audit.content_strategy_30_days, (w) => `<li><strong>Saptamana ${esc(w.week)} — ${esc(w.focus)}</strong><br>Tipuri de postari: ${esc((w.post_types || []).join(', '))}${w.goal ? `<br>Obiectiv: ${esc(w.goal)}` : ''}</li>`)}

${Array.isArray(audit.missing_data) && audit.missing_data.length ? `<h2>Ce ne mai trebuie de la tine</h2>${li(audit.missing_data, (m) => `<li>${esc(m)}</li>`)}` : ''}

${flags.length ? `<hr><h3 style="color:#a00;">Verificari automate — de corectat inainte de trimitere</h3>${li(flags, (f) => `<li>${esc(f)}</li>`)}` : ''}
${context.failed?.length ? `<p style="font-size:9pt;color:#888;">Capturi neprocesate: ${context.failed.length}.</p>` : ''}
${context.lowConfidence?.length ? `<p style="font-size:9pt;color:#888;">Capturi cu lizibilitate scazuta (nr.): ${context.lowConfidence.join(', ')}.</p>` : ''}
</body></html>`;

// ---------- Corpul multipart pentru Google Drive (HTML -> Google Doc) ----------
// Construit aici, nu in UI-ul nodului HTTP Request: escaping-ul in expresii n8n e o sursa
// clasica de bug-uri greu de depanat.
const boundary = 'n8nDocBoundary';
const docName = `Audit social media — ${clientName} — ${today}`;
const metadata = {
  name: docName,
  mimeType: 'application/vnd.google-apps.document', // tinta: conversie in Google Doc
  parents: [folderId],
};

const multipart =
  `--${boundary}\r\n` +
  'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
  JSON.stringify(metadata) + '\r\n' +
  `--${boundary}\r\n` +
  'Content-Type: text/html; charset=UTF-8\r\n\r\n' +   // sursa: HTML, Google il converteste
  html + '\r\n' +
  `--${boundary}--`;

return [{ json: { docName, folderId, flags, multipart, html } }];
