// Genereaza workflows/*.json din surse (src/*.js, prompts/*.md, schemas/*.json).
// Rulare:  node n8n/build-workflows.mjs
// Motivul existentei: codul nodurilor Code si prompturile raman fisiere lizibile si testabile,
// iar JSON-ul de import e mereu valid si sincronizat cu ele.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const code = (f) => readFileSync(join(ROOT, 'src', f), 'utf8');
const schema = (f) => readFileSync(join(ROOT, 'schemas', f), 'utf8').trim();

// Extrage primul bloc ``` din fisierul de prompt: un singur loc de adevar pentru prompt.
const prompt = (f) => {
  const md = readFileSync(join(ROOT, 'prompts', f), 'utf8');
  const m = md.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`Nu am gasit blocul de prompt in ${f}`);
  return m[1].trim();
};

// Modelele se aleg din dropdown dupa import; astea sunt doar valori initiale.
const VISION_MODEL = 'gpt-4o';
const REASONING_MODEL = 'gpt-4o';
const PLACEHOLDER_SHEET = 'INLOCUIESTE_CU_ID_SPREADSHEET';

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters,
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name,
  type,
  typeVersion,
  position,
  ...extra,
});

const sheetDoc = { __rl: true, value: PLACEHOLDER_SHEET, mode: 'id' };
const sheetName = (n) => ({ __rl: true, value: n, mode: 'name' });

/* ------------------------------------------------------------------ */
/* AGENT A — Audit profil din screenshot-uri                           */
/* ------------------------------------------------------------------ */
const agentA = {
  name: 'Agent A — Audit social media din screenshot-uri',
  nodes: [
    node('Form Trigger', 'n8n-nodes-base.formTrigger', 2.2, [-620, 300], {
      formTitle: 'Audit profil social media',
      formDescription: 'Incarca capturi de ecran ale profilelor (profil complet + grid). Minim 1, recomandat 3 pe platforma.',
      formFields: {
        values: [
          { fieldLabel: 'Nume client', requiredField: true },
          {
            fieldLabel: 'Nișă', fieldType: 'dropdown', requiredField: true,
            fieldOptions: { values: [{ option: 'dentist' }, { option: 'imobiliare' }, { option: 'horeca' }, { option: 'fitness' }] },
          },
          { fieldLabel: 'Platforme incluse', placeholder: 'ex: instagram, tiktok, facebook', requiredField: true },
          { fieldLabel: 'Obiectivul contului', fieldType: 'textarea', placeholder: 'lead-uri / vanzari / notorietate', requiredField: true },
          { fieldLabel: 'Public țintă', fieldType: 'textarea' },
          { fieldLabel: 'ID folder Drive părinte', placeholder: 'din URL-ul folderului', requiredField: true },
          { fieldLabel: 'Capturi de ecran', fieldType: 'file', multipleFiles: true, acceptFileTypes: '.jpg,.jpeg,.png,.webp', requiredField: true },
        ],
      },
      options: {},
    }),
    node('Normalize Screenshots', 'n8n-nodes-base.code', 2, [-400, 300], { jsCode: code('a1-normalize-screenshots.js') }),
    node('Analyze Screenshot', '@n8n/n8n-nodes-langchain.openAi', 1.8, [-180, 300], {
      resource: 'image',
      operation: 'analyze',
      modelId: { __rl: true, value: VISION_MODEL, mode: 'list', cachedResultName: VISION_MODEL },
      text: prompt('01-vision-extractor.md'),
      inputType: 'base64',
      binaryPropertyName: 'data',
      options: { detail: 'high', maxTokens: 1500 },
    }, { retryOnFail: true, maxTries: 2, onError: 'continueRegularOutput' }),
    node('Merge Extractions', 'n8n-nodes-base.code', 2, [40, 300], { jsCode: code('a1-merge-extractions.js') }),
    node('Strateg', '@n8n/n8n-nodes-langchain.chainLlm', 1.5, [260, 300], {
      promptType: 'define',
      text: `=${prompt('02-strategist-audit.md')}`,
      hasOutputParser: true,
    }, { retryOnFail: true, maxTries: 2 }),
    node('Chat Model Strateg', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1.2, [200, 520], {
      model: { __rl: true, value: REASONING_MODEL, mode: 'list', cachedResultName: REASONING_MODEL },
      options: { temperature: 0.4 },
    }),
    node('Auto-fixing Parser', '@n8n/n8n-nodes-langchain.outputParserAutofixing', 1, [400, 520], { options: {} }),
    node('Audit Schema', '@n8n/n8n-nodes-langchain.outputParserStructured', 1.2, [560, 700], {
      schemaType: 'manual',
      inputSchema: schema('audit-output.schema.json'),
    }),
    node('Create Client Folder', 'n8n-nodes-base.googleDrive', 3, [520, 300], {
      resource: 'folder',
      operation: 'create',
      name: "={{ $('Form Trigger').first().json['Nume client'] }} — Audit {{ $now.format('yyyy-MM-dd') }}",
      driveId: { __rl: true, value: 'My Drive', mode: 'list', cachedResultName: 'My Drive' },
      folderId: { __rl: true, value: "={{ $('Form Trigger').first().json['ID folder Drive părinte'] }}", mode: 'id' },
      options: {},
    }),
    node('Build Document', 'n8n-nodes-base.code', 2, [740, 300], { jsCode: code('a1-build-document.js') }),
    node('Upload Google Doc', 'n8n-nodes-base.httpRequest', 4.2, [960, 300], {
      method: 'POST',
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googleDriveOAuth2Api',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'multipart/related; boundary=n8nDocBoundary',
      body: '={{ $json.multipart }}',
      options: {},
    }),
    node('Log In Sheet', 'n8n-nodes-base.googleSheets', 4.5, [1180, 300], {
      operation: 'append',
      documentId: sheetDoc,
      sheetName: sheetName('Clienti'),
      columns: {
        mappingMode: 'defineBelow',
        value: {
          data: "={{ $now.format('yyyy-MM-dd') }}",
          client: "={{ $('Form Trigger').first().json['Nume client'] }}",
          nisa: "={{ $('Form Trigger').first().json['Nișă'] }}",
          platforme: "={{ $('Form Trigger').first().json['Platforme incluse'] }}",
          scor: "={{ $('Strateg').first().json.output.overall_score }}",
          folder_url: "=https://drive.google.com/drive/folders/{{ $('Create Client Folder').first().json.id }}",
          document_url: '=https://docs.google.com/document/d/{{ $json.id }}/edit',
          avertismente: "={{ $('Build Document').first().json.flags.join(' | ') }}",
        },
        matchingColumns: [],
      },
      options: {},
    }),
  ],
  connections: {
    'Form Trigger': { main: [[{ node: 'Normalize Screenshots', type: 'main', index: 0 }]] },
    'Normalize Screenshots': { main: [[{ node: 'Analyze Screenshot', type: 'main', index: 0 }]] },
    'Analyze Screenshot': { main: [[{ node: 'Merge Extractions', type: 'main', index: 0 }]] },
    'Merge Extractions': { main: [[{ node: 'Strateg', type: 'main', index: 0 }]] },
    Strateg: { main: [[{ node: 'Create Client Folder', type: 'main', index: 0 }]] },
    'Create Client Folder': { main: [[{ node: 'Build Document', type: 'main', index: 0 }]] },
    'Build Document': { main: [[{ node: 'Upload Google Doc', type: 'main', index: 0 }]] },
    'Upload Google Doc': { main: [[{ node: 'Log In Sheet', type: 'main', index: 0 }]] },
    'Chat Model Strateg': {
      ai_languageModel: [[
        { node: 'Strateg', type: 'ai_languageModel', index: 0 },
        { node: 'Auto-fixing Parser', type: 'ai_languageModel', index: 0 },
      ]],
    },
    'Audit Schema': { ai_outputParser: [[{ node: 'Auto-fixing Parser', type: 'ai_outputParser', index: 0 }]] },
    'Auto-fixing Parser': { ai_outputParser: [[{ node: 'Strateg', type: 'ai_outputParser', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
};

/* ------------------------------------------------------------------ */
/* AGENT B — 500 idei de content pe nisa                               */
/* ------------------------------------------------------------------ */
const agentB = {
  name: 'Agent B — 500 idei de content pe nisa',
  nodes: [
    node('Formular', 'n8n-nodes-base.formTrigger', 2.2, [-840, 300], {
      formTitle: 'Generator de idei de content',
      formDescription: 'Genereaza un an de idei pentru o nisa, calibrat pe sarbatori si zile internationale.',
      formFields: {
        values: [
          {
            fieldLabel: 'Nișă', fieldType: 'dropdown', requiredField: true,
            fieldOptions: { values: [{ option: 'dentist' }, { option: 'imobiliare' }, { option: 'horeca' }, { option: 'fitness' }] },
          },
          { fieldLabel: 'Client', placeholder: 'optional' },
          { fieldLabel: 'An', fieldType: 'number', requiredField: true },
          { fieldLabel: 'Numar de idei', fieldType: 'number', placeholder: '500', requiredField: true },
          { fieldLabel: 'Platforme', placeholder: 'tiktok,instagram,facebook', requiredField: true },
          { fieldLabel: 'Tara', placeholder: 'RO', requiredField: true },
        ],
      },
      options: {},
    }),
    node('Start', 'n8n-nodes-base.set', 3.4, [-620, 300], {
      assignments: {
        assignments: [
          { id: '1', name: 'niche_key', value: "={{ $json['Nișă'] }}", type: 'string' },
          { id: '2', name: 'client', value: '={{ $json.Client }}', type: 'string' },
          { id: '3', name: 'year', value: '={{ $json.An }}', type: 'number' },
          { id: '4', name: 'target_ideas', value: "={{ $json['Numar de idei'] }}", type: 'number' },
          { id: '5', name: 'platforms', value: '={{ $json.Platforme }}', type: 'string' },
          { id: '6', name: 'country', value: '={{ $json.Tara }}', type: 'string' },
          { id: '7', name: 'ideas_per_slice', value: '25', type: 'number' },
        ],
      },
      options: {},
    }),
    node('Get Niche Brief', 'n8n-nodes-base.googleSheets', 4.5, [-400, 300], {
      documentId: sheetDoc,
      sheetName: sheetName('NicheBriefs'),
      filtersUI: { values: [{ lookupColumn: 'niche_key', lookupValue: '={{ $json.niche_key }}' }] },
      options: {},
    }),
    node('Get Public Holidays', 'n8n-nodes-base.httpRequest', 4.2, [-180, 300], {
      url: "=https://date.nager.at/api/v3/PublicHolidays/{{ $('Start').first().json.year }}/{{ $('Start').first().json.country || 'RO' }}",
      options: {},
    }, { alwaysOutputData: true, onError: 'continueRegularOutput' }),
    node('Get International Days', 'n8n-nodes-base.googleSheets', 4.5, [40, 300], {
      documentId: sheetDoc,
      sheetName: sheetName('ZileInternationale'),
      options: {},
    }),
    node('Build Slice Plan', 'n8n-nodes-base.code', 2, [260, 300], { jsCode: code('b-build-slice-plan.js') }),
    node('Loop Over Slices', 'n8n-nodes-base.splitInBatches', 3, [480, 300], { batchSize: 1, options: { reset: false } }),
    node('Idea Generator', '@n8n/n8n-nodes-langchain.chainLlm', 1.5, [740, 420], {
      promptType: 'define',
      text: `=${prompt('03-idea-generator.md')}`,
      hasOutputParser: true,
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 }),
    node('Chat Model Idei', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1.2, [700, 640], {
      model: { __rl: true, value: REASONING_MODEL, mode: 'list', cachedResultName: REASONING_MODEL },
      options: { temperature: 0.8 },
    }),
    node('Auto-fixing Parser Idei', '@n8n/n8n-nodes-langchain.outputParserAutofixing', 1, [900, 640], { options: {} }),
    node('Idea Schema', '@n8n/n8n-nodes-langchain.outputParserStructured', 1.2, [1060, 800], {
      schemaType: 'manual',
      inputSchema: schema('idea-row.schema.json'),
    }),
    node('Flatten Ideas', 'n8n-nodes-base.code', 2, [960, 420], { jsCode: code('b-flatten-ideas.js') }),
    node('Wait', 'n8n-nodes-base.wait', 1.1, [1180, 420], { amount: 1, unit: 'seconds' }),
    node('Dedupe & Number', 'n8n-nodes-base.code', 2, [740, 160], { jsCode: code('b-dedupe-and-number.js') }),
    node('Save Ideas', 'n8n-nodes-base.googleSheets', 4.5, [960, 160], {
      operation: 'append',
      documentId: sheetDoc,
      sheetName: sheetName('Idei'),
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [] },
      options: {},
    }),
  ],
  connections: {
    Formular: { main: [[{ node: 'Start', type: 'main', index: 0 }]] },
    Start: { main: [[{ node: 'Get Niche Brief', type: 'main', index: 0 }]] },
    'Get Niche Brief': { main: [[{ node: 'Get Public Holidays', type: 'main', index: 0 }]] },
    'Get Public Holidays': { main: [[{ node: 'Get International Days', type: 'main', index: 0 }]] },
    'Get International Days': { main: [[{ node: 'Build Slice Plan', type: 'main', index: 0 }]] },
    'Build Slice Plan': { main: [[{ node: 'Loop Over Slices', type: 'main', index: 0 }]] },
    // iesirea 0 = "done" (toate item-urile acumulate), iesirea 1 = "loop" (batch-ul curent)
    'Loop Over Slices': {
      main: [
        [{ node: 'Dedupe & Number', type: 'main', index: 0 }],
        [{ node: 'Idea Generator', type: 'main', index: 0 }],
      ],
    },
    'Idea Generator': { main: [[{ node: 'Flatten Ideas', type: 'main', index: 0 }]] },
    'Flatten Ideas': { main: [[{ node: 'Wait', type: 'main', index: 0 }]] },
    Wait: { main: [[{ node: 'Loop Over Slices', type: 'main', index: 0 }]] },
    'Dedupe & Number': { main: [[{ node: 'Save Ideas', type: 'main', index: 0 }]] },
    'Chat Model Idei': {
      ai_languageModel: [[
        { node: 'Idea Generator', type: 'ai_languageModel', index: 0 },
        { node: 'Auto-fixing Parser Idei', type: 'ai_languageModel', index: 0 },
      ]],
    },
    'Idea Schema': { ai_outputParser: [[{ node: 'Auto-fixing Parser Idei', type: 'ai_outputParser', index: 0 }]] },
    'Auto-fixing Parser Idei': { ai_outputParser: [[{ node: 'Idea Generator', type: 'ai_outputParser', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
};

/* ------------------------------------------------------------------ */
mkdirSync(join(ROOT, 'workflows'), { recursive: true });

const validate = (wf) => {
  const names = new Set(wf.nodes.map((n) => n.name));
  if (names.size !== wf.nodes.length) throw new Error(`${wf.name}: nume de noduri duplicate`);
  for (const [from, outs] of Object.entries(wf.connections)) {
    if (!names.has(from)) throw new Error(`${wf.name}: conexiune de la nodul inexistent "${from}"`);
    for (const branches of Object.values(outs)) {
      for (const branch of branches) {
        for (const c of branch) {
          if (!names.has(c.node)) throw new Error(`${wf.name}: conexiune catre nodul inexistent "${c.node}"`);
        }
      }
    }
  }
  // Fiecare nod trebuie sa fie fie trigger, fie tinta unei conexiuni
  const targets = new Set();
  for (const outs of Object.values(wf.connections)) {
    for (const branches of Object.values(outs)) for (const b of branches) for (const c of b) targets.add(c.node);
  }
  const orphans = wf.nodes
    .filter((n) => !targets.has(n.name) && !wf.connections[n.name] && !/trigger/i.test(n.type))
    .map((n) => n.name);
  if (orphans.length) throw new Error(`${wf.name}: noduri neconectate: ${orphans.join(', ')}`);
  return true;
};

for (const wf of [agentA, agentB]) {
  validate(wf);
  const file = wf === agentA ? '01-social-audit.json' : '02-content-500-ideas.json';
  writeFileSync(join(ROOT, 'workflows', file), JSON.stringify(wf, null, 2) + '\n');
  console.log(`scris workflows/${file} — ${wf.nodes.length} noduri, structura validata`);
}
