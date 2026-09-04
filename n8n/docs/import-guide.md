# Ghid de import — citește asta înainte de a rula ceva

## Ce sunt fișierele din `workflows/`
Sunt **schelete complete și valide structural**: noduri, conexiuni (inclusiv legăturile de sub-noduri LangChain `ai_languageModel` / `ai_outputParser`), prompturi, scheme JSON și codul nodurilor Code, toate deja la locul lor.

**Ce am verificat efectiv:**
- JSON valid, nume de noduri unice, zero conexiuni către noduri inexistente, zero noduri orfane (validator în `build-workflows.mjs`).
- Logica tuturor nodurilor Code — 21 de teste automate în `tests/run-tests.mjs`, toate trec.
- Ambele lanțuri complete, rulate end-to-end prin runner-ul local (`local/run.mjs`, mod `--dry-run`): formular → extracție → strateg → HTML, și brief → calendar → felii → generare → deduplicare → CSV.
- Endpoint-ul de sărbători, apelat live: `https://date.nager.at/api/v3/PublicHolidays/2026/RO` → 200, cu `localName` în română, inclusiv Paștele ortodox (mobil).
- Comportamentul de conversie al Google Drive API (HTML → Google Doc) — documentat oficial de Google.

**Ce NU am putut verifica** (nu am avut acces la o instanță n8n):
- Numele exacte ale parametrilor pot diferi ușor între versiuni de n8n, mai ales la nodurile LangChain, care se schimbă des.

Concret: după import, **fiecare nod marcat cu triunghi roșu are nevoie de un click**. Nu e un semn că ceva e stricat — e felul în care n8n îți cere să reatașezi credențiale și resurse. Durează 10 minute.

## Pași după import

### 1. Importă
n8n → **Workflows → Import from File** → `01-social-audit.json`. Repetă pentru `02-content-500-ideas.json`.

### 2. Reatașează credențialele (obligatoriu — nu se importă niciodată)
| Nod | Credențial |
|---|---|
| Analyze Screenshot, Chat Model Strateg, Chat Model Idei, Auto-fixing Parser | OpenAI (sau înlocuiește nodurile Chat Model cu Anthropic / Google Gemini) |
| Create Client Folder | Google Drive OAuth2 |
| Upload Google Doc | Google Drive OAuth2 (selectat ca *Predefined Credential Type*) |
| Log In Sheet, Get Niche Brief, Get International Days, Save Ideas | Google Sheets OAuth2 |

### 3. Alege modelele
Valorile din JSON (`gpt-4o`) sunt **doar valori inițiale**, ca importul să nu pice pe un câmp gol. Deschide fiecare nod și alege din dropdown modelul curent:
- **Analyze Screenshot** — obligatoriu un model cu vision.
- **Chat Model Strateg** — aici se vede calitatea auditului. Pune modelul cel mai bun pe care ți-l permiți.
- **Chat Model Idei** — volum mare, calitate medie suficientă. Pune modelul ieftin. Aici economisești real.

### 4. Completează ID-urile
- Caută `INLOCUIESTE_CU_ID_SPREADSHEET` în ambele workflow-uri (nodurile Google Sheets) și pune ID-ul spreadsheet-ului `Agency OS`.
- Verifică numele tab-urilor: `Clienti`, `NicheBriefs`, `ZileInternationale`, `Idei`.
- În nodul `Log In Sheet`, maparea e pe *Define Below* — numele coloanelor trebuie să existe în tab-ul `Clienti`.

### 5. Verifică cele două locuri mai sensibile

**a) Câmpul File din Form Trigger.** Deschide nodul, confirmă că „Capturi de ecran" e de tip *File* cu *Multiple Files* pornit. Dacă versiunea ta numește altfel opțiunea, setează-o din UI — codul din „Normalize Screenshots" e scris special ca să nu depindă de numele câmpului.

**b) Analyze Screenshot → Options.** Confirmă **Length of Description (Max Tokens) = 1500** și **Detail = high**. Dacă a rămas pe 300, JSON-ul se taie la mijloc și „Merge Extractions" aruncă eroare — cu exact acel mesaj, ca să știi unde să te uiți.

### 6. Dacă un nod nu se importă curat
`Auto-fixing Parser` / `Auto-fixing Parser Idei` sunt **opționale** — repară ieșirile JSON stricate ale modelului. Dacă versiunea ta de n8n nu are nodul:
1. Șterge-l.
2. Conectează `Audit Schema` direct la `Strateg` (ieșirea `ai_outputParser`), respectiv `Idea Schema` direct la `Idea Generator`.
Workflow-ul funcționează identic, doar că un răspuns malformat va da eroare în loc să fie reparat automat.

### 6b. Testează întâi local, apoi în n8n
Înainte de a te lupta cu OAuth și foldere, verifică prompturile și briefurile cu runner-ul local — e același cod din `src/`, doar fără n8n:

```bash
node n8n/local/run.mjs ideas --niche dentist --count 50 --limit-slices 2   # cu cheie API
node n8n/local/run.mjs audit --client "Test" --screens ./capturi           # cu cheie API
node n8n/local/run.mjs ideas --niche dentist --dry-run                     # fără cheie API
```

Dacă ideile arată prost aici, vor arăta prost și în n8n — problema e în brief sau în prompt, nu în configurare. E cel mai ieftin loc în care poți afla asta.

### 7. Prima rulare — în ordinea asta
1. **Agent A cu o singură captură**, de pe profilul tău. Uită-te la ieșirea nodului `Analyze Screenshot`: dacă bio-ul transcris nu e literal identic cu cel real, problema e la model sau la `Detail`, nu mai departe.
2. **Agent A complet**, 3 capturi. Verifică documentul din Drive.
3. **Agent B cu `Numar de idei` = 50**. Nu porni pe 500 înainte să vezi calitatea pe 50.
4. **Agent B pe 500**, după ce briefurile sunt bune.

## Regenerarea workflow-urilor
Nu edita `workflows/*.json` de mână — se suprascriu. Modifici sursa, apoi:

```bash
node n8n/tests/run-tests.mjs      # întâi testele
node n8n/build-workflows.mjs      # apoi build
```

| Vrei să schimbi | Editezi |
|---|---|
| un prompt | `prompts/*.md`, blocul dintre ``` |
| structura ieșirii LLM | `schemas/*.json` |
| logica unui nod Code | `src/*.js` (+ adaugă un test) |
| limitele de caractere | `src/a1-build-document.js`, obiectul `PLATFORM_LIMITS` |
| agresivitatea deduplicării | `src/b-dedupe-and-number.js`, `COSINE_THRESHOLD` / `TRIGRAM_THRESHOLD` |
| numărul de idei per felie | nodul `Start`, câmpul `ideas_per_slice` |
