# Checklist de testare înainte de primul client

Testele automate (`node n8n/tests/run-tests.mjs`) acoperă logica nodurilor Code. Ce urmează acoperă restul: modelele, Google API-urile și calitatea rezultatului. Modelele nu se testează automat — se citesc.

## Agent A — audit

### Extractorul vision
- [ ] **O captură Instagram clară** → în ieșirea `Analyze Screenshot`, `bio_text` e **identic literal** cu bio-ul real (diacritice și emoji incluse). Dacă diferă, nu continua — tot auditul se construiește pe transcrierea asta.
- [ ] **Numerele nu sunt convertite**: `12,4K` rămâne `12,4K`, nu devine `12400`.
- [ ] **O captură intenționat blurată sau tăiată** → `confidence: "low"` și câmpurile ilizibile în `unreadable`, **nu** valori inventate. Ăsta e testul care contează: un model care ghicește aici va ghici și la client.
- [ ] **O captură TikTok și una Facebook** → `platform` detectat corect.

### Strategul
- [ ] Fiecare observație din `what_works` / `what_doesnt` citează ceva concret în `evidence`. Dacă apar formulări de tip „conținutul pare inconsistent" fără dovadă, întărește regula 2 din prompt.
- [ ] **Nicio recomandare generică**: caută în document „postează constant" și „hashtag-uri relevante". Dacă apar, promptul nu e respectat — coboară temperatura la 0.2.
- [ ] Trimite capturi **doar de pe Instagram** → Facebook și TikTok apar cu `covered: false` și textul „Nu s-au primit capturi", nu evaluate din burtă. **Acesta e testul anti-halucinație numărul unu.**
- [ ] `missing_data` conține cereri concrete de capturi suplimentare.

### Descrierile
- [ ] 3 variante per platformă acoperită, cu unghiuri **vizibil diferite** (nu trei parafraze).
- [ ] Numără manual caracterele la 2 variante și compară cu `char_count` din document — trebuie să coincidă (codul le recalculează, nu se bazează pe model).
- [ ] Nicio variantă marcată „PESTE LIMITA". Dacă apar constant, adaugă în prompt: „scrie cu 15% sub limită".
- [ ] Bio-ul TikTok chiar se citește ca TikTok, nu ca o versiune scurtată a celui de Instagram.

### Drive și documentul
- [ ] Folderul apare **în folderul părinte corect**, nu în „My Drive".
- [ ] Documentul e **Google Doc**, nu fișier HTML sau TXT (verifică iconița).
- [ ] Titlurile sunt titluri reale, bold-ul e bold. Zero `##` sau `**` vizibile.
- [ ] Tabelele cu descrierile se văd ca tabele.
- [ ] **ID de folder greșit intenționat** → workflow-ul eșuează cu eroare clară, nu „reușește" fără să creeze nimic.
- [ ] Rândul apare în tab-ul `Clienti`, cu link-uri care se deschid.

### Volum
- [ ] **9 imagini într-o singură rulare** → se termină fără timeout și fără out-of-memory. Dacă pică: `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` nu e setat.
- [ ] Notează durata și costul. Sunt cifrele cu care îți construiești prețul serviciului.

## Agent B — idei

### Calendar
- [ ] Nager întoarce **Paștele ortodox** corect pentru anul curent **și** pentru următorul (e mobil — asta e tot rostul apelului).
- [ ] Zilele mobile din CSV sunt recalculate: Ziua Mamei = prima duminică din mai, Black Friday = vinerea de după al 4-lea joi din noiembrie. *(Acoperit și de testele automate, pentru 2026.)*
- [ ] Zilele filtrate pe nișă funcționează: la dentist **nu** apare Ziua Internațională a Cafelei.
- [ ] **API-ul de sărbători pică** (oprește temporar internetul sau strică URL-ul) → workflow-ul continuă doar cu zilele din Sheets, nu se oprește. Nodul e setat `onError: continueRegularOutput` exact pentru asta.

### Calitate — partea care nu se automatizează
- [ ] Rulează pe **50 de idei** și notează manual fiecare: `păstrez / ajustez / gunoi`. **Țintă: peste 70% în primele două categorii.**
- [ ] Sub 70% → problema e aproape sigur în brief (`seed_examples`, `pains`), nu în prompt. Adaugă 4 exemple bune și rulează din nou.
- [ ] Hook-urile sunt scrise cuvânt cu cuvânt, gata de citit în cameră — nu descrieri de tipul „un hook despre...".
- [ ] Ideile sunt filmabile cu telefonul, în 20 de minute, fără actori.
- [ ] **20 de idei la întâmplare, verificate față de `forbidden`.** Pentru medical: zero promisiuni de rezultat, zero diagnostic la distanță. O singură scăpare aici e o problemă de conformitate, nu una de calitate.
- [ ] Ideile legate de ocazii cad în luna corectă.
- [ ] Cel mult ~30% din idei sunt legate de ocazii — restul evergreen.

### Volum și unicitate
- [ ] Rulare pe 500 → verifică în ieșirea nodului `Dedupe & Number` câmpurile `_stats_unique` (țintă: ≥ 500) și `_stats_dropped_similar`.
- [ ] `_stats_dropped_similar` foarte mare (peste ~15% din brut) → modelul se repetă: crește temperatura sau îmbunătățește `seed_examples`.
- [ ] `_stats_unique` sub țintă → crește `ideas_per_slice` de la 25 la 30 în nodul `Start`.
- [ ] Sortează în Sheets după `month` → toate cele 12 luni sunt reprezentate, nu doar primele.
- [ ] Sortează după `platform` și `funnel_stage` → distribuție echilibrată, nu 400 de idei TOFU.

### Scalare
- [ ] Rulează pe **a doua nișă fără nicio modificare în n8n** — doar un rând nou în `NicheBriefs`. Dacă trebuie să atingi workflow-ul, ceva e hardcodat unde nu trebuie.
- [ ] Repetă pentru nișele 3 și 4.
