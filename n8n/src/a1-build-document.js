// Code node: "Build Document"  (Run Once for All Items)
// Ruleaza DUPA "Create Client Folder" (are nevoie de id-ul folderului).
// Face lucrurile pe care un LLM nu le face de incredere:
//   1. Pune scorul de optimizare ca PRIMA sectiune, exact in formatul cerut.
//   2. Numara caracterele descrierilor si marcheaza depasirile.
//   3. Verifica raportul: coerenta cu checklist-ul, ton, cifre inventate, CTA si canal in descrieri.
//   4. Randeaza totul in HTML, ca sa ajunga in Google Docs cu formatare reala.
// Output: { docName, folderId, flags, multipart, html }

const strateg = $('Strateg').first().json;
const audit = strateg.output ?? strateg.data ?? strateg;
const form = $('Form Trigger').first().json;
const context = $('Merge Extractions').first().json;
const score = $('Compute Score').first().json.score;
const folderId = $json.id;

if (!folderId) {
  throw new Error('Nu am primit id-ul folderului din Google Drive. Verifica nodul "Create Client Folder".');
}
if (!audit || !Array.isArray(audit.platforms)) {
  throw new Error('Auditul nu are structura asteptata. Verifica Structured Output Parser-ul nodului "Strateg".');
}
if (!score || !Array.isArray(score.platforms)) {
  throw new Error('Lipseste scorul de optimizare. Verifica nodul "Compute Score".');
}

// --- Limite de caractere. Reconfirma-le anual, platformele le schimba. ---
const PLATFORM_LIMITS = {
  instagram: { bio: 150, name: 30, label: 'Instagram' },
  tiktok:    { bio: 80,  name: 30, label: 'TikTok' },
  facebook:  { bio: 101, name: 50, label: 'Facebook' },
};

const len = (s) => Array.from(String(s ?? '')).length; // code points, nu bytes
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const plain = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const flags = [];
const clientName = form['Nume client'] || 'Client';
const today = score.today || new Date().toISOString().slice(0, 10);

const scoreOf = new Map(score.platforms.map((p) => [p.platform, p]));
const symbolOf = (platform, id) => {
  const p = scoreOf.get(platform);
  const r = p && p.rows.find((x) => x.id === Number(id));
  return r ? r.symbol : null;
};
const criterionName = (platform, id) => {
  const p = scoreOf.get(platform);
  const r = p && p.rows.find((x) => x.id === Number(id));
  return r ? `${id}. ${r.name}` : `${id}`;
};

/* ---------- 1. Descrierile: limita, criterii obligatorii, CTA, canal, cifre ---------- */

// Toate cifrele care apar in capturi si in formular. O cifra din descriere care nu e aici
// a fost inventata de model (ani de experienta, numar de clienti, telefon).
const sourceText = JSON.stringify(context.extractions || []) + JSON.stringify(form || {});
const sourceGroups = new Set((sourceText.match(/\d+/g) || []));
const sourceJoined = sourceText.replace(/(\d)[\s.\-]+(?=\d)/g, '$1').match(/\d+/g) || [];
const numberKnown = (tok) => sourceGroups.has(tok) || sourceJoined.some((g) => g.includes(tok));

const CTA_VERB = /\b(programeaz|scrie|suna|sunati|comanda|rezerv|trimite|cere|vino|veniti|intra|afla|contacteaz|apasa|urmareste|intreaba|vezi|descopera|alege|ia legatura|da click|acceseaza)/;
const CTA_CHANNEL = /(whatsapp|\bdm\b|mesaj|link|⬇|👇|telefon|\bsuna|\bapel|e-?mail|\bsite|comentari|inbox|messenger|\bbio\b|formular|online|\b07\d|\b02\d|\b03\d)/;

for (const p of audit.platforms) {
  const key = String(p.platform || '').toLowerCase();
  const limits = PLATFORM_LIMITS[key];
  if (!limits || !Array.isArray(p.bio_variants)) continue;

  p.bio_variants.forEach((v, i) => {
    const where = `${limits.label} / varianta ${i + 1}`;
    const text = String(v.text || '');
    const actual = len(text);
    v.char_count = actual;                       // NU avem incredere in numaratoarea modelului
    v.limit = limits.bio;
    v.over_limit = actual > limits.bio;
    v.tight = !v.over_limit && actual > limits.bio * 0.95;
    v.has_placeholder = /\[[^\]]+\]/.test(text);
    if (v.over_limit) flags.push(`${where}: ${actual} caractere, peste limita de ${limits.bio}.`);
    if (v.name_field && len(v.name_field) > limits.name) {
      flags.push(`${where}: câmpul Name are ${len(v.name_field)} caractere, peste limita de ${limits.name}.`);
    }

    const declared = new Set((v.criteria_covered || []).map(Number));
    const lipsa = [3, 7, 8].filter((c) => !declared.has(c));
    if (lipsa.length) flags.push(`${where}: nu bifează criteriile obligatorii ${lipsa.join(', ')} (Ce oferi / CTA / Canal CTA).`);

    const t = plain(text.replace(/\[[^\]]+\]/g, ' '));
    if (!CTA_VERB.test(t)) flags.push(`${where}: nu am găsit un verb de acțiune (CTA) în text.`);
    if (!CTA_CHANNEL.test(t)) flags.push(`${where}: CTA-ul nu spune pe ce canal (WhatsApp, DM, link, telefon).`);

    const numbers = (text.replace(/\[[^\]]+\]/g, ' ').match(/\d+/g) || []).filter((n) => n.length >= 2);
    const invented = [...new Set(numbers.filter((n) => !numberKnown(n)))];
    if (invented.length) flags.push(`${where}: cifre care nu apar în capturi (${invented.join(', ')}) — înlocuiește cu date reale sau cu un placeholder.`);
    if (v.has_placeholder) flags.push(`${where}: conține placeholder — completează-l înainte de publicare și reverifică lungimea.`);
  });
}

/* ---------- 2. Coerenta cu checklist-ul ---------- */

for (const p of audit.platforms) {
  const key = String(p.platform || '').toLowerCase();
  if (!scoreOf.has(key)) continue;
  const label = (PLATFORM_LIMITS[key] || {}).label || key;
  const check = (list, allowed, section) => {
    for (const item of list || []) {
      for (const id of item.criteria || []) {
        const sym = symbolOf(key, id);
        if (sym && !allowed.includes(sym)) {
          flags.push(`${label} / „${section}" se referă la ${criterionName(key, id)}, marcat ${sym} în checklist.`);
        }
      }
    }
  };
  check(p.what_works, ['✅'], 'Ce e bine');
  check(p.what_doesnt, ['❌', '⏳'], 'Ce nu');
  check(p.improvements, ['❌', '⏳'], 'Ce facem concret');

  // Fiecare ❌ trebuie sa aiba o sugestie de rezolvare
  const addressed = new Set((p.improvements || []).flatMap((im) => (im.criteria || []).map(Number)));
  const neacoperite = scoreOf.get(key).rows.filter((r) => r.symbol === '❌' && !addressed.has(r.id));
  if (neacoperite.length) {
    flags.push(`${label}: ❌ fără sugestie de rezolvare: ${neacoperite.map((r) => `${r.id}. ${r.name}`).join(', ')}.`);
  }
}

for (const q of audit.quick_wins || []) {
  const key = String(q.platform || '').toLowerCase();
  const platformsToCheck = scoreOf.has(key) ? [key] : [...scoreOf.keys()];
  for (const id of q.criteria || []) {
    const isFixable = platformsToCheck.some((k) => symbolOf(k, id) === '❌');
    if (!isFixable) flags.push(`Quick win „${String(q.action).slice(0, 60)}" se referă la criteriul ${id}, care nu e ❌ — quick wins sunt doar pentru ce se rezolvă imediat.`);
  }
}

/* ---------- 3. Ton ---------- */

const FORBIDDEN = /\b(slab|slaba|slabe|slabi|slabul|prost|proasta|proaste|prosti|prostul|gresit|gresita|gresite|gresiti|gresitul|dezastru|dezastrul|dezastruos|dezastruoasa|dezastruoase)\b/g;
const scanTone = (where, text) => {
  const found = plain(text).match(FORBIDDEN);
  if (found) flags.push(`Ton — ${where}: „${[...new Set(found)].join('", „')}". Reformulează orientat spre oportunitate.`);
};
scanTone('Pe scurt', audit.executive_summary);
for (const p of audit.platforms) {
  const label = (PLATFORM_LIMITS[String(p.platform || '').toLowerCase()] || {}).label || p.platform;
  for (const [section, list] of [['Ce e bine', p.what_works], ['Ce nu', p.what_doesnt], ['Ce facem concret', p.improvements], ['Descrieri', p.bio_variants]]) {
    for (const item of list || []) scanTone(`${label} / ${section}`, Object.values(item).filter((v) => typeof v === 'string').join(' '));
  }
}
for (const [section, list] of [['Quick wins', audit.quick_wins], ['Plan 30 de zile', audit.content_strategy_30_days], ['Date lipsă', audit.missing_data], ['Urgent', audit.red_flags]]) {
  for (const item of list || []) scanTone(section, typeof item === 'string' ? item : JSON.stringify(item));
}

/* ---------- 4. Randare HTML ---------- */

const li = (arr, fn) => (Array.isArray(arr) && arr.length ? `<ul>${arr.map(fn).join('')}</ul>` : '<p><em>—</em></p>');
const badge = (txt, color) => `<span style="background:${color};padding:1px 6px;border-radius:3px;font-size:9pt;">${esc(txt)}</span>`;

// Sectiunea de scor: aceleasi randuri ca textul simplu din "Compute Score", in HTML.
const scoreSection = (() => {
  const blocks = score.platforms.map((p) => `
    <h3>${esc(p.title)}</h3>
    <p style="line-height:1.6;">${p.rows.map((r) => `${r.symbol} ${esc(r.name)}${r.not_in_screenshots ? ' <span style="color:#777;">(nu apare în capturi)</span>' : ''}`).join('<br>')}</p>
    <p>→ <strong>Scor: ${esc(p.score_display)}/10 · ${esc(p.label)}</strong><br>→ Potențial după optimizarea profilului: <strong>${esc(p.potential_display)}/10</strong></p>`).join('');
  const general = score.general
    ? `<p style="font-size:13pt;">📊 <strong>SCOR GENERAL: ${esc(score.general.score_display)}/10 · ${esc(score.general.label)}</strong><br>🚀 <strong>POTENȚIAL DUPĂ OPTIMIZARE: ${esc(score.general.potential_display)}/10</strong></p>`
    : '';
  return `
    <h2>🎯 SCOR DE OPTIMIZARE</h2>
    <p>✅ îndeplinit · ❌ se rezolvă imediat · ⏳ crește odată cu conținutul</p>
    ${blocks}
    ${general}
    <p><em>Fiecare ❌ rezolvat = +0,25 puncte.</em></p>`;
})();

const platformSection = (p) => {
  const key = String(p.platform || '').toLowerCase();
  const limits = PLATFORM_LIMITS[key] || { bio: 0, label: p.platform };

  if (p.covered === false || !scoreOf.has(key)) {
    return `<h2>${esc(limits.label)}</h2><p><em>Nu s-au primit capturi de ecran pentru această platformă. Nu a fost evaluată.</em></p>`;
  }

  const variants = (p.bio_variants || []).map((v, i) => {
    const status = v.over_limit
      ? badge(`${v.char_count}/${limits.bio} — peste limită, trebuie scurtat`, '#ffd6d6')
      : v.tight
      ? badge(`${v.char_count}/${limits.bio} — la limită`, '#fff3cd')
      : badge(`${v.char_count}/${limits.bio}`, '#d9f2e0');
    const bifate = (v.criteria_covered || []).map(Number).sort((a, b) => a - b);
    return `
      <p><strong>Varianta ${i + 1} — ${esc(v.angle || '')}</strong> ${status}</p>
      <table style="border-collapse:collapse;width:100%;">
        <tr><td style="border:1px solid #ddd;padding:8px;">${nl2br(v.text)}</td></tr>
      </table>
      ${v.name_field ? `<p style="font-size:10pt;">Câmp <em>Name</em> propus: <strong>${esc(v.name_field)}</strong> (${len(v.name_field)}/${limits.name})</p>` : ''}
      <p style="font-size:10pt;">${bifate.length ? `Criterii bifate: ${bifate.join(', ')}<br>` : ''}De ce funcționează: ${esc(v.rationale)}</p>`;
  }).join('');

  return `
    <h2>${esc(limits.label)}${p.handle ? ` — ${esc(p.handle)}` : ''}</h2>
    ${p.current_bio ? `<p style="font-size:10pt;color:#555;">Descriere actuală (${len(p.current_bio)}/${limits.bio} caractere): ${esc(p.current_bio)}</p>` : ''}

    <h3>Ce e bine</h3>
    ${li(p.what_works, (w) => `<li><strong>${esc(w.observation)}</strong><br><em>Din capturi:</em> ${esc(w.evidence)}<br><em>De ce contează:</em> ${esc(w.why_it_matters)}</li>`)}

    <h3>Ce nu</h3>
    ${li(p.what_doesnt, (w) => `<li><strong>${esc(w.issue)}</strong><br><em>Din capturi:</em> ${esc(w.evidence)}<br><em>Câștig când se rezolvă:</em> ${esc(w.cost)}</li>`)}

    <h3>Ce facem concret</h3>
    ${li(p.improvements, (im) => `<li><strong>${esc(im.action)}</strong> ${badge(`impact ${im.impact}`, '#e7eefc')} ${badge(`efort ${im.effort}`, '#f0f0f0')}<br>${esc(im.how_to)}${im.expected_result ? `<br><em>Rezultat așteptat:</em> ${esc(im.expected_result)}` : ''}</li>`)}

    <h3>Trei propuneri de descriere</h3>
    ${variants || '<p><em>—</em></p>'}`;
};

const internal = [
  ...flags.map((f) => esc(f)),
  ...(score.flags || []).map((f) => esc(f)),
  ...(score.overrides || []).map((o) => esc(`Scor ${o.platform} / ${o.id}. ${o.name}: modelul a spus ${o.model ? 'DA' : 'NU'}, s-a stabilit ${o.final ? 'DA' : 'NU'} — ${o.reason}`)),
];

const html = `<html><body style="font-family:Arial,sans-serif;">
<h1>Audit social media — ${esc(clientName)}</h1>
<p style="color:#666;">Nișă: ${esc(form['Nișă'] || form['Nisa'] || '—')} &nbsp;|&nbsp; Data: ${esc(today)} &nbsp;|&nbsp; Capturi analizate: ${context.extractedCount}/${context.screenshotCount}</p>

${scoreSection}

<h2>Pe scurt</h2>
${audit.executive_summary ? `<p>${nl2br(audit.executive_summary)}</p>` : '<p><em>—</em></p>'}

${Array.isArray(audit.red_flags) && audit.red_flags.length ? `<h2>De rezolvat cu prioritate</h2>${li(audit.red_flags, (r) => `<li>${esc(r)}</li>`)}` : ''}

<h2>Trei lucruri de făcut azi</h2>
${li(audit.quick_wins, (q) => `<li><strong>${esc(q.action)}</strong>${q.platform ? ` (${esc(q.platform)})` : ''} — ${esc(q.time_needed)}</li>`)}

${audit.platforms.map(platformSection).join('\n')}

<h2>Plan de conținut, 30 de zile</h2>
${li(audit.content_strategy_30_days, (w) => `<li><strong>Săptămâna ${esc(w.week)} — ${esc(w.focus)}</strong><br>Tipuri de postări: ${esc((w.post_types || []).join(', '))}${w.goal ? `<br>Obiectiv: ${esc(w.goal)}` : ''}</li>`)}

${Array.isArray(audit.missing_data) && audit.missing_data.length ? `<h2>Ce ne mai trebuie de la tine</h2>${li(audit.missing_data, (m) => `<li>${esc(m)}</li>`)}` : ''}

${internal.length ? `<hr><h3 style="color:#a00;">Verificări automate — intern, șterge secțiunea înainte de trimitere</h3><ul>${internal.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
${context.failed && context.failed.length ? `<p style="font-size:9pt;color:#888;">Capturi neprocesate: ${context.failed.length}.</p>` : ''}
${context.lowConfidence && context.lowConfidence.length ? `<p style="font-size:9pt;color:#888;">Capturi cu lizibilitate scăzută (nr.): ${context.lowConfidence.join(', ')}.</p>` : ''}
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

return [{ json: { docName, folderId, flags, multipart, html, score_text: score.text } }];
