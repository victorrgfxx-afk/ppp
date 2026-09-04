# Doi agenți n8n pentru o agenție de social media

1. **Agent A — Audit de profil din screenshot-uri** → ce e bine / ce nu / plan de îmbunătățire + 3 variante de descriere per platformă (TikTok, Instagram, Facebook) → folder + document în Google Drive.
2. **Agent B — Generator de 500 idei de content pe nișă**, calibrat pe zile internaționale + sărbători religioase, pornind de la 4 nișe și scalabil la N.

Totul e proiectat ca **date + prompturi în afara workflow-ului** (Google Sheets), ca să scalezi pe nișe noi fără să atingi n8n.

---

## 0. Ce pregătești înainte (30–60 min)

### 0.1 Instanța n8n
Self-hosted (Docker) e recomandat: capturile de ecran sunt fișiere mari, iar Agent B rulează 20+ apeluri LLM într-o execuție.

```bash
docker run -d --name n8n -p 5678:5678 \
  -e N8N_DEFAULT_BINARY_DATA_MODE=filesystem \
  -e N8N_PAYLOAD_SIZE_MAX=32 \
  -e EXECUTIONS_TIMEOUT=3600 \
  -e EXECUTIONS_TIMEOUT_MAX=7200 \
  -e GENERIC_TIMEZONE=Europe/Bucharest \
  -e N8N_HOST=n8n.domeniul-tau.ro \
  -e WEBHOOK_URL=https://n8n.domeniul-tau.ro/ \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

- `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` — obligatoriu, altfel screenshot-urile stau în memorie/DB și execuția crapă la 8–10 imagini.
- `N8N_PAYLOAD_SIZE_MAX=32` — formularul acceptă upload multiplu; default-ul (16 MB) e mic pentru 10 capturi de pe mobil.
- `WEBHOOK_URL` — fără el, link-ul public al formularului iese greșit.

### 0.2 Credentials necesare
| Credential | Unde se folosește |
|---|---|
| Google Drive OAuth2 | creare folder client, upload document, HTTP Request (predefined credential type) |
| Google Sheets OAuth2 | briefuri nișă, zile internaționale, registru clienți, output idei |
| OpenAI API (sau Anthropic) | vision + raționament |

În Google Cloud Console: proiect nou → **activezi Google Drive API, Google Docs API, Google Sheets API** → OAuth consent screen (External + tu ca test user e suficient) → OAuth Client ID tip *Web application* → Authorized redirect URI:
`https://n8n.domeniul-tau.ro/rest/oauth2-credential/callback`

### 0.3 Structura în Drive și Sheets
- Un folder părinte, ex. `Clienți` → copiezi ID-ul din URL (`drive.google.com/drive/folders/<ACESTA_E_ID-ul>`).
- Un spreadsheet `Agency OS` cu 4 tab-uri:
  - `Clienti` — registru audituri (se completează automat)
  - `NicheBriefs` — „antrenamentul" pe nișe (vezi §3)
  - `ZileInternationale` — seed în `data/international-days-seed.csv`
  - `Idei` — output-ul Agentului B

---

## 1. Agent A — Audit profil din screenshot-uri

### 1.1 Principiul de arhitectură (partea care face diferența)
Nu pune un singur prompt care „se uită la poze și dă verdictul". Împarte în **două creiere**:

| Etapă | Rol | Temperature | De ce |
|---|---|---|---|
| **Extractor (vision)** | doar *transcrie* ce se vede: username, bio literal, nr. followers, nr. postări, highlights, grid, CTA, link, primele 9 thumbnails | 0 | Modelele vision halucinează mult mai puțin când li se cere transcriere, nu opinie. Un apel per imagine. |
| **Strateg (text)** | primește JSON-ul extras + brieful clientului, aplică o rubrică fixă, judecă și scrie | 0.4 | Raționamentul se face pe text structurat, nu pe pixeli. Poți schimba modelul independent și e de ~10x mai ieftin. |

Bonus: dacă auditul iese prost, știi exact care creier a greșit.

### 1.2 Lanțul de noduri

```
Form Trigger  →  Code: Normalize Screenshots  →  OpenAI: Analyze Image  →  Code: Merge Extractions
    →  Basic LLM Chain "Strateg" (+ Chat Model + Structured Output Parser)
    →  Code: Validate + Render HTML
    →  Google Drive: Create Folder  →  HTTP Request: Drive multipart upload (HTML → Google Doc)
    →  Google Sheets: append în `Clienti`
```

Workflow gata de import: [`workflows/01-social-audit.json`](workflows/01-social-audit.json)

#### Nod 1 — **n8n Form Trigger**
Câmpuri:
| Câmp | Tip | Obligatoriu |
|---|---|---|
| Nume client | Text | da |
| Nișă | Dropdown (dentist, imobiliare, HoReCa, fitness…) | da |
| Platforme incluse | Text (`instagram, tiktok, facebook`) | da |
| Obiectivul contului | Textarea (lead-uri, vânzări, notorietate) | da |
| Public țintă | Textarea | nu |
| ID folder Drive părinte | Text | da |
| Capturi de ecran | **File**, „Multiple Files" ON, accept `image/*` | da |

> ⚠️ **Capcană reală:** numele proprietăților binare generate de câmpul File nu sunt garantate (`Capturi_de_ecran`, `field_0` etc., variază cu versiunea). De aceea nu le referi niciodată direct — le normalizezi în nodul următor.

#### Nod 2 — **Code: Normalize Screenshots** (Run Once for All Items)
Sparge orice item cu N imagini în N item-uri, fiecare cu binary-ul pe cheia `data`:

```js
const out = [];
for (const item of $input.all()) {
  const bin = item.binary || {};
  for (const key of Object.keys(bin)) {
    out.push({
      json: {
        ...item.json,
        sourceBinaryKey: key,
        fileName: bin[key].fileName || key,
        mimeType: bin[key].mimeType,
      },
      binary: { data: bin[key] },
    });
  }
}
if (!out.length) throw new Error('Nu s-a încărcat nicio imagine.');
return out;
```

#### Nod 3 — **OpenAI → Image → Analyze Image**
- Input Type: **Binary File(s)**
- Input Data Field Name: `data`
- Text: promptul din [`prompts/01-vision-extractor.md`](prompts/01-vision-extractor.md)
- Options → **Length of Description (Max Tokens): 1500** (default-ul e 300 → răspuns tăiat, JSON invalid — cauza #1 de eșec aici)
- Options → Detail: `high` (bio-urile și numerele mici sunt ilizibile pe `low`)
- Pe nod: **Retry On Fail** = ON, 2 încercări.

#### Nod 4 — **Code: Merge Extractions**
Adună toate extracțiile într-un singur item, tolerant la JSON împachetat în ```` ```json ````:

```js
const items = $input.all();
const trigger = $('Form Trigger').first().json;

const parseJson = (raw) => {
  if (!raw) return null;
  const s = String(raw).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
};

const extractions = [];
const failed = [];
items.forEach((it, i) => {
  const raw = it.json.content ?? it.json.text ?? it.json.message?.content ?? JSON.stringify(it.json);
  const parsed = parseJson(raw);
  if (parsed) extractions.push({ screenshot: i + 1, ...parsed });
  else failed.push({ screenshot: i + 1, raw: String(raw).slice(0, 300) });
});

if (!extractions.length) throw new Error('Nicio extracție validă. Verifică Max Tokens la Analyze Image.');

return [{ json: { client: trigger, extractions, failed, screenshotCount: items.length } }];
```

#### Nod 5 — **Basic LLM Chain „Strateg"**
- Prompt: `Define below` → promptul din [`prompts/02-strategist-audit.md`](prompts/02-strategist-audit.md), cu `{{ JSON.stringify($json.extractions) }}` injectat.
- Sub-nod **Chat Model** (OpenAI/Anthropic), temperature 0.4.
- Sub-nod **Structured Output Parser** cu schema din [`schemas/audit-output.schema.json`](schemas/audit-output.schema.json).
- Dacă modelul mai scapă JSON invalid: pune **Auto-fixing Output Parser** între parser și chain (are model propriu care repară ieșirea) — asta rezolvă ~toate eșecurile de parsing.

#### Nod 6 — **Code: Validate + Render HTML**
Face două lucruri pe care un LLM nu le face de încredere:
1. **Numără caracterele** fiecărei descrieri propuse și marchează depășirile (LLM-urile numără prost caracterele — nu te baza pe prompt).
2. Randează raportul în **HTML**, nu Markdown.

Limite pe care le validăm (verificate, sept. 2026 — reconfirmă anual, se schimbă):
| Platformă | Câmp | Limită sigură |
|---|---|---|
| Instagram | Bio | **150** caractere (Name: 30) |
| TikTok | Bio | **80** caractere (Name: 30, username: 24) |
| Facebook Page | Bio / Intro | **101** caractere (About-ul lung e separat) |

Sunt centralizate în `PLATFORM_LIMITS` la începutul nodului — le schimbi într-un loc.

#### Nod 7 — **Google Drive → Folder → Create**
- Name: `={{ $('Form Trigger').first().json['Nume client'] }} — Audit {{ $now.format('yyyy-MM-dd') }}`
- Parent Folder: **By ID** → `={{ $('Form Trigger').first().json['ID folder Drive părinte'] }}`

#### Nod 8 — **HTTP Request: HTML → Google Doc** (partea cea mai importantă tehnic)

> ⚠️ **Capcană reală:** nodul *Google Docs → Update → Insert text* inserează **text simplu**. Dacă îi dai Markdown, în document apar literal `##` și `**`. Documentul pentru client arată amatoricesc.

Soluția corectă: **Google Drive API acceptă import cu conversie** — încarci `text/html` (sau `text/markdown`) și ceri ca fișierul destinație să fie `application/vnd.google-apps.document`. Google convertește serverside: titluri, bold, tabele, liste — formatare reală.

- Method: `POST`
- URL: `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true`
- Authentication: **Predefined Credential Type** → `googleDriveOAuth2Api`
- Body Content Type: **Raw** → Content-Type: `multipart/related; boundary=n8nDocBoundary`
- Body: `={{ $json.multipart }}` (corpul multipart e construit în nodul Code anterior — evită coșmarul de escaping în UI)

Alternativa low-code, dacă nu vrei HTTP Request: **Google Drive → File → Create from text**, cu opțiunea **„Convert to Google Document"**. Merge, dar conținutul e tratat ca text simplu → fără formatare. Bun pentru intern, slab pentru livrabil client.

#### Nod 9 — **Google Sheets → Append** în `Clienti`
`data, client, nișă, platforme, link folder, link document, nr. screenshot-uri, scor general`. Îți dă istoric și, în timp, un dataset de comparat („scorul mediu la onboarding vs. după 3 luni").

### 1.3 Cele 3 descrieri per platformă — de ce cere prompt separat
Nu cere „3 bio-uri" generic. În prompt sunt hardcodate **trei unghiuri diferite** per platformă, ca variantele să nu fie sinonime:
- **V1 — Clar/SEO:** ce faci + pentru cine + unde (cuvinte cheie căutabile; pe IG numele e indexat, deci propune și Name field).
- **V2 — Beneficiu/Emoțional:** transformarea promisă, în limbajul clientului final.
- **V3 — Diferențiator/Proof:** cifra, specializarea sau dovada care te separă de concurență.

Fiecare vine cu CTA propriu și motivul alegerii. Pe TikTok se scrie pentru *scroll rece* (cine ești în 3 secunde), pe Instagram pentru *decizie de follow*, pe Facebook pentru *credibilitate locală* (categorie, oraș, program).

---

## 2. Agent B — 500 idei de content pe nișă

### 2.1 De ce un singur apel LLM nu funcționează
„Dă-mi 500 de idei" produce, în realitate: ~120 idei utile, apoi repetiții parafrazate, apoi truncare la limita de output. Soluția e **generare pe felii ortogonale + deduplicare + top-up**.

### 2.2 Matricea de felii (slice plan)
**22 felii × 25 idei = 550 generate brut, pentru o țintă de 500.** Supragenerarea de ~10% e intenționată: deduplicarea taie din ele, iar un al doilea pas de generare ar costa mai mult decât surplusul. Fiecare felie e o combinație unică de:

- **Pilon de conținut** (5, din briefului nișei): Educație · Autoritate/Proof · Behind the scenes · Obiecții & mituri · Comunitate/Trend
- **Etapă funnel**: TOFU / MOFU / BOFU
- **Format**: short video · carusel · postare statică · story serie · live/Q&A · UGC/testimonial
- **Luna** (1–12) + **ocaziile lunii** (sărbători + zile internaționale)
- **Platformă**: TikTok / Instagram / Facebook

Feliile fiind disjuncte, modelul nu are cum să repete masiv, chiar dacă apelurile rulează independent.

### 2.3 Lanțul de noduri

```
Trigger (Form sau Execute Workflow)
  → Google Sheets: citește NicheBriefs (filtru niche_key)
  → HTTP: sărbători (Nager) + Google Sheets: ZileInternationale
  → Code: Build Slice Plan (20 felii cu ocazii alocate pe luni)
  → Loop Over Items (batch 1)
       → Basic LLM Chain "Idea Generator" (+ Chat Model + Structured Output Parser)
       → Code: flatten
       → (Wait 1s, opțional, pentru rate limit)
  → Code: Dedupe (normalizare + trigrame + set de cuvinte) + tăiere echilibrată la țintă + numerotare
  → Google Sheets: Append `Idei`
```

Workflow gata de import: [`workflows/02-content-500-ideas.json`](workflows/02-content-500-ideas.json)

### 2.4 Calendarul — surse reale
**Sărbători legale și religioase** (inclusiv Paștele ortodox, care e mobil — de asta nu-l hardcodezi):

```
GET https://date.nager.at/api/v3/PublicHolidays/{an}/{RO}
```
Testat: întoarce `localName` în română (`Bobotează`, `Paștele`, `Rusaliile`), `date`, `types`. Fără API key, fără rate limit.
Serviciul a migrat pe `https://nagerholidays.com/api/v4/Holidays/{RO}/{an}` (v4 nu mai are `localName`, dar are `holidayTypes` mai granular). **v3 încă răspunde 200** — folosește v3 pentru română, v4 ca fallback.

**Zile internaționale / tematice** — nu există un API public serios. Le ții într-un Google Sheet, seed pornit în [`data/international-days-seed.csv`](data/international-days-seed.csv), cu coloane:
`date (MM-DD) | name_ro | type (international/national/religios/comercial/nisa) | niches (csv) | movable (true/false) | note`

Zilele mobile (Black Friday, Ziua Mamei — prima duminică din mai în România, Ziua Tatălui — a doua duminică din mai) sunt marcate `movable=true` și calculate în Code node, nu scrise fix. **Seed-ul trebuie revizuit manual o dată pe an** — e singura parte din sistem care nu se autoverifică.

### 2.5 Deduplicarea (Code node, fără costuri suplimentare)

Trei straturi, în ordinea costului:

1. **Normalizare + hash exact**: lowercase, fără diacritice, fără stop-words, tokens sortați.
2. **Cosinus ponderat cu IDF** pe cuvinte, prag `0.85`. Cuvintele care apar în multe titluri („cât", „costă", „explicat") cântăresc puțin; cele distinctive („implant", „fațete") cântăresc mult. Asta e diferența care contează în practică: *„Cât costă un implant, explicat pas cu pas"* și *„Cât costă o fațetă, explicat pas cu pas"* împart un șablon lung, dar au subiecte diferite — **nu** sunt duplicate. Un Jaccard simplu pe cuvinte le tăia; măsurat, cosinusul ponderat le păstrează (0.33) și în același timp prinde parafrazele reale (0.87).
3. **Trigrame Jaccard**, prag `0.70`, pentru variante aproape identice ca șir: „Cât costă un implant dentar" / „Cât costă implantul dentar" (formele gramaticale schimbă cuvântul, dar nu șirul).

Pragurile sunt **calibrate pe perechi etichetate manual** și fixate într-un test (`calibrarea pragurilor` din `tests/run-tests.mjs`): dacă le modifici, testul îți spune exact ce ai stricat. Marja până la cea mai apropiată pereche care trebuie păstrată e mare la ambele praguri, deci nu sunt fragile.

Două detalii care s-au dovedit să conteze, prinse de teste:
- **IDF se calculează pe titlurile unice**, nu pe toate. Altfel un titlu repetat de 3 ori umflă frecvența cuvintelor lui, le scade greutatea, și propriile lui duplicate scapă nedetectate.
- **Tăiere echilibrată la țintă**: se ia pe rând din fiecare felie, altfel rămâi cu 500 de idei toate din primele 8 felii, adică din primele 5 luni.

> **Limita cunoscută, documentată ca test:** două idei identice ca sens dar formulate cu cuvinte complet diferite („Ce se întâmplă la prima vizită" / „Cum decurge prima ta consultație") **nu** sunt prinse. Nicio metodă lexicală nu le prinde. Dacă ajunge să te deranjeze, treci pe embeddings: înlocuiești `vectorize()` cu un vector de embedding și compari cu același cosinus, prag ~0.90. Restul codului rămâne neschimbat.

### 2.5b Completarea deficitului (top-up)
Dacă după deduplicare rămâi sub țintă, **runner-ul local completează automat**: generează felii suplimentare, decalate pe altă combinație pilon/format/platformă, și trimite modelului **lista titlurilor deja folosite** cu instrucțiunea să nu le repete. Asta e cea mai eficientă măsură anti-duplicat — mai bună decât orice filtru aplicat după.

În n8n, echivalentul e o a doua rulare cu `ideas_per_slice` mărit (25 → 32). Dacă vrei top-up automat și în n8n, adaugi un nod IF după `Dedupe & Number` care buclează înapoi în `Loop Over Slices` — funcționează, dar face graful vizibil mai greu de depanat, motiv pentru care nu e în workflow-ul livrat.

### 2.6 Output — Google Sheets `Idei`
| Coloană | Conținut |
|---|---|
| id | `dentist-2026-001` |
| niche / client | nișa și clientul |
| month / suggested_date | luna + data sugerată (dacă e legată de ocazie) |
| occasion | sărbătoarea/ziua internațională, dacă e cazul |
| pillar / funnel_stage / format / platform | felia din matrice |
| hook | primele 3 secunde / primul rând |
| title | titlul ideii |
| outline | 3–5 bullet-uri de script |
| cta | call to action |
| keywords_hashtags | 3–5 |
| effort | low/medium/high (util la planificare) |
| status | `idee` (îl muți în `aprobat`/`produs`) |

Sheet-ul e livrabilul, nu documentul — clientul filtrează pe lună/platformă și lucrează direct în el.

---

## 3. „Antrenarea" pe 4 nișe — clarificare importantă

Nu antrenezi un model. Construiești un **knowledge base per nișă** pe care agentul îl citește la runtime (RAG simplu, pe Google Sheets). Diferența practică: adaugi o nișă în 20 de minute, nu în 2 zile, și nu ai nevoie de dataset sau fine-tuning.

Tab-ul `NicheBriefs`, o linie per nișă:

| Coloană | Exemplu (dentist) |
|---|---|
| `niche_key` | `dentist` |
| `audience` | 28–50 ani, urban, venit mediu+, decid pentru ei și copii |
| `pains` | frica de durere, cost, timp, rușine față de aspectul dinților |
| `objections` | „e scump", „durează", „mi-e frică", „merg doar când mă doare" |
| `desires` | zâmbet fără complexe, fără durere, tratament într-o singură ședință |
| `services` | implant, fațete, albire, ortodonție, urgențe |
| `proof_assets` | before/after (cu consimțământ), recenzii, aparatură, certificări |
| `tone` | cald, non-alarmist, fără jargon |
| `forbidden` | promisiuni de rezultat, „garantat", diagnostic online, before/after fără consimțământ scris |
| `local_context` | oraș, cartier, parcare, program, decontare CAS |
| `niche_days` | `03-20 Ziua Mondială a Sănătății Orale; 02-04 Ziua Mondială de Luptă Împotriva Cancerului; 11-14 Ziua Mondială a Diabetului` |
| `seed_examples` | 5–10 idei bune scrise de tine → cel mai puternic lever de calitate |

**Cele 4 nișe sunt deja scrise**, complet, în [`data/niches/`](data/niches/): `dentist`, `imobiliare`, `horeca`, `fitness`. Fiecare are 8 `seed_examples`, 5 piloni, zile specifice nișei și o listă `forbidden` construită pe riscurile reale ale domeniului (medical, juridic-imobiliar, alergeni, revendicări de slăbire). Le exporți pentru Google Sheets cu:

```bash
node n8n/local/run.mjs briefs      # → output/niche-briefs.csv, gata de importat în tab-ul NicheBriefs
```

Un test verifică permanent că toate cele 4 briefuri au câmpurile obligatorii completate și minimum 8 `seed_examples`.

**`seed_examples` face 80% din diferența de calitate.** Modelul imită tiparul, nu descrierea abstractă a tonului. Scrie 8 idei bune per nișă manual — e cea mai profitabilă oră de muncă din tot proiectul.

**Compliance (obligatoriu pentru medical/financiar):** coloana `forbidden` intră în prompt ca regulă dură, iar în `schemas/idea-row.schema.json` există câmpul `compliance_ok`. Pentru dentist: fără promisiuni de rezultat, fără diagnostic la distanță, before/after doar cu consimțământ scris (GDPR — datele de sănătate sunt categorie specială, art. 9). Reclamele pe Meta au reguli separate pentru sănătate.

### Ordinea de lucru pe cele 4 nișe
1. Cele 4 nișe livrate sunt **diferite structural** intenționat (medical / tranzacție mare cu risc juridic / consum imediat / transformare personală). Dacă alegi 4 nișe medicale, nu afli nimic despre generalizare.
2. Rulează Agent B pe fiecare, la **50 de idei**, nu 500:
   `node n8n/local/run.mjs ideas --niche horeca --count 50 --limit-slices 2`
3. Notează manual fiecare idee: `păstrez / ajustez / gunoi`. Ținta: >70% în primele două.
4. Sub 70% → problema e aproape sigur în brief (`seed_examples` și `pains`), nu în prompt. Repară briefurile.
5. Când treci pragul pe toate 4, rulează la 500 și scalează: **nișă nouă = un fișier nou în `data/niches/` + un rând nou în `NicheBriefs`**, zero modificări în n8n.

---

## 3b. Runner local — rulează fără n8n

`n8n/local/run.mjs` execută **exact aceleași noduri Code** din `src/` ca workflow-urile n8n, doar că apelează modelul direct. Nu e o a doua implementare care o ia razna față de prima — e același cod, cu alt înveliș.

La ce folosește:
- **testezi calitatea prompturilor și a briefurilor înainte** să configurezi Google OAuth, foldere și credențiale (economisește o zi);
- **verifici că tot lanțul e sănătos fără nicio cheie API** (`--dry-run`);
- rulezi la nevoie fără n8n: backfill pe o nișă, un audit rapid, regenerarea CSV-ului de briefuri.

```bash
# verificare fără cheie API — trece prin tot lanțul cu date sintetice
node n8n/local/run.mjs ideas --niche dentist --count 500 --dry-run

# real, cu model
export OPENAI_API_KEY=...            # sau ANTHROPIC_API_KEY
node n8n/local/run.mjs ideas --niche horeca --count 500 --year 2026 --model <model>
node n8n/local/run.mjs audit --client "Cabinet X" --niche dentist --screens ./capturi
node n8n/local/run.mjs briefs        # exportă cele 4 nișe pentru Google Sheets
node n8n/local/run.mjs               # ajutor complet
```

Funcționează cu orice API compatibil OpenAI (setezi `OPENAI_BASE_URL`) și cu Anthropic. Rezultatele merg în `n8n/output/` (ignorat de git): `.csv` pentru Sheets, `.json` pentru orice altceva, `.html` pentru audit — **exact HTML-ul pe care n8n îl urcă în Drive ca Google Doc**, deci îl vezi în browser înainte să atingi Drive.

> Cifrele din `--dry-run` (câte idei rămân după deduplicare) reflectă varietatea limitată a datelor sintetice, **nu** ce produce un model real. Dry-run-ul verifică instalarea și lanțul, nu calitatea.

## 4. Testare — checklist înainte de primul client

Detaliat în [`docs/testing-checklist.md`](docs/testing-checklist.md). Pe scurt:

**Agent A**
- [ ] 1 screenshot Instagram → JSON extras corect (bio literal, followers)
- [ ] Screenshot blurat/tăiat → nu inventează cifre, marchează `"unreadable"`
- [ ] 3 platforme × 3 capturi = 9 imagini → o singură execuție, sub timeout
- [ ] Documentul în Drive are **titluri și bold reale** (nu `##`)
- [ ] Toate cele 9 descrieri respectă limita de caractere (verifică manual 2)
- [ ] Folder ID greșit → eroare clară, nu execuție „reușită" fără document

**Agent B**
- [ ] Nager întoarce Paștele ortodox corect pentru anul curent și următorul
- [ ] 500 idei generate → **numără unicele** după dedupe (țintă: >480)
- [ ] Ideile legate de ocazii cad în luna corectă
- [ ] Nicio idee nu încalcă `forbidden` (verifică 20 la întâmplare)
- [ ] Rulare pe nișă a 2-a fără modificări în workflow

---

## 5. Costuri și limite (ordin de mărime — verifică pricing-ul curent)

| Operațiune | Consum aproximativ |
|---|---|
| Agent A, 9 capturi | ~9 apeluri vision (≈1.500 tokens fiecare) + 1 apel strateg (~8k in / 4k out) |
| Agent B, 500 idei | ~22 apeluri (≈2k in / 3.5k out fiecare) ≈ 45k in / 80k out |

Practic: un audit costă cât o cafea, un set de 500 idei costă cât un prânz — cu modele mid-tier. Recomandare: **model puternic pentru strateg** (acolo se vede calitatea), **model ieftin pentru extractor și pentru generarea în masă**. Nodurile fiind separate, schimbi modelul per etapă cu un click.

Limite de care te lovești real:
- Rate limit LLM la Agent B → nod **Wait** 1s în loop + `Retry On Fail` cu 3 încercări.
- Timeout execuție n8n → `EXECUTIONS_TIMEOUT=3600` (setat în §0.1) sau rulează Agent B ca **sub-workflow** apelat din Agent A.
- Google Drive: 750 GB/zi upload — irelevant aici. Sheets: 10 milioane celule/spreadsheet — la ~500 idei/client, arhivează anual.

---

## 6. Capcane n8n confirmate (economisesc ore)

| Problemă | Cauză | Soluție |
|---|---|---|
| „Cannot read property of undefined" după upload | numele binary din Form Trigger diferă | Code normalizer (§1.2, Nod 2) |
| JSON tăiat de la Analyze Image | `Max Tokens` default = 300 | setează 1500 |
| Structured Output Parser eșuează random | modelul adaugă text în jurul JSON-ului | **Auto-fixing Output Parser** + `Retry On Fail` |
| Markdown apare literal în Google Doc | Google Docs `insertText` = text simplu | upload HTML cu conversie via Drive API (§1.2, Nod 8) |
| Document creat în „My Drive", nu în folder | parent nesetat / shared drive | `supportsAllDrives=true` + `parents:[folderId]` în metadata |
| Loop Over Items pare că pierde date | nodurile interne văd doar batch-ul curent | folosește ieșirea **„done"**, sau `$('Nume Nod').all()` |
| Execuția moare la multe imagini | binary în memorie | `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` |
| Formularul returnează 413 | payload prea mare | `N8N_PAYLOAD_SIZE_MAX=32` |

---

## 7. Ordinea de implementare recomandată

| Zi | Ce faci |
|---|---|
| 1 | §0 complet: n8n up, credentials, foldere, spreadsheet cu cele 4 tab-uri |
| 2 | Agent A până la Nod 5 — testezi pe **profilul tău**, nu pe al unui client |
| 3 | Nodurile 6–9 (documentul Drive). Aici se pierde cel mai mult timp — de asta HTML-ul e gata scris |
| 4 | Scrii `NicheBriefs` pentru 4 nișe, cu 8 `seed_examples` fiecare |
| 5 | Agent B la 50 idei/nișă + notarea manuală (§3, pașii 2–4) |
| 6 | Reglezi briefurile, rulezi la 500, umpli `data/international-days-seed.csv` |
| 7 | Testele din §4, apoi primul client real |

Nu construi Agent B înainte să meargă Agent A end-to-end: infrastructura (Sheets, Drive, credențiale, parsarea JSON) e comună, iar bug-urile le rezolvi o singură dată.

---

## Conținutul acestui folder

```
n8n/
├── README.md                              ← planul (acest fișier)
├── build-workflows.mjs                    ← genereaza workflow-urile din surse
├── workflows/                             ← generate, NU se editeaza manual
│   ├── 01-social-audit.json               ← Agent A, importabil
│   └── 02-content-500-ideas.json          ← Agent B, importabil
├── src/                                   ← codul nodurilor Code, lizibil si testabil
│   ├── a1-normalize-screenshots.js
│   ├── a1-merge-extractions.js
│   ├── a1-build-document.js
│   ├── b-build-slice-plan.js
│   ├── b-flatten-ideas.js
│   └── b-dedupe-and-number.js
├── local/                                 ← runner local: același cod, fără n8n
│   ├── run.mjs                            ← CLI: ideas / audit / briefs
│   ├── n8n-shim.mjs                       ← rulează nodurile Code în afara n8n
│   └── llm.mjs                            ← client OpenAI / Anthropic, fără dependințe
├── tests/
│   └── run-tests.mjs                      ← 21 de teste pe logica nodurilor Code
├── prompts/
│   ├── 01-vision-extractor.md
│   ├── 02-strategist-audit.md
│   └── 03-idea-generator.md
├── schemas/
│   ├── audit-output.schema.json
│   └── idea-row.schema.json
├── data/
│   ├── README.md
│   ├── international-days-seed.csv
│   └── niches/                            ← cele 4 nișe „antrenate"
│       ├── dentist.json
│       ├── imobiliare.json
│       ├── horeca.json
│       └── fitness.json
└── docs/
    ├── import-guide.md                    ← ce reconectezi după import (citește primul)
    └── testing-checklist.md
```

## Cum lucrezi cu acest folder

```bash
node n8n/tests/run-tests.mjs      # 21 de teste pe logica nodurilor Code (fără n8n, fără API)
node n8n/build-workflows.mjs      # regenerează workflows/*.json din src/ + prompts/ + schemas/
```

Prompturile, schemele și codul nodurilor sunt **sursa**; JSON-urile din `workflows/` sunt **generate**.
Modifici un prompt în `prompts/*.md` (blocul ```` ``` ````) → rulezi build → reimporți. Așa nu ajungi să ai trei versiuni diferite ale aceluiași prompt în trei workflow-uri.
