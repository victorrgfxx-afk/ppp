// Ruleaza nodurile Code din src/ in afara n8n, cu aceleasi globale ($input, $, $json).
// Folosit si de teste, si de runner-ul local: exista o singura implementare a logicii,
// nu doua care o iau razna una fata de cealalta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const compiled = new Map();

export const runNode = (file, { input = [], nodes = {}, json = {} } = {}) => {
  if (!compiled.has(file)) {
    const src = readFileSync(join(ROOT, 'src', file), 'utf8');
    compiled.set(file, new Function('$input', '$', '$json', 'console', src));
  }
  const $input = { all: () => input };
  const $ = (name) => {
    if (!(name in nodes)) throw new Error(`Nodul "${name}" nu e disponibil in acest context`);
    const items = nodes[name];
    return { first: () => items[0], all: () => items, last: () => items[items.length - 1] };
  };
  return compiled.get(file)($input, $, json, console);
};

// Evalueaza expresiile n8n {{ ... }} dintr-un prompt, cu acelasi $json ca in workflow.
export const renderTemplate = (tpl, json) => {
  const literal = String(tpl).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const withExpr = literal.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => '${' + expr.trim() + '}');
  try {
    return new Function('$json', 'JSON', 'return `' + withExpr + '`;')(json, JSON);
  } catch (e) {
    throw new Error(`Nu am putut evalua promptul: ${e.message}`);
  }
};

// Extrage promptul dintre ``` din fisierul .md — acelasi bloc pe care il inlineaza build-workflows.mjs
export const loadPrompt = (file) => {
  const md = readFileSync(join(ROOT, 'prompts', file), 'utf8');
  const m = md.match(/```\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`Nu am gasit blocul de prompt in ${file}`);
  return m[1].trim();
};

export const loadSchema = (file) => JSON.parse(readFileSync(join(ROOT, 'schemas', file), 'utf8'));

/* ---------------- CSV ---------------- */

export const parseCsv = (text) => {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
};

export const toCsv = (rows, columns) => {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
};

/* ---------------- utilitare ---------------- */

// Pool de concurenta: n apeluri LLM in paralel, restul asteapta.
export const mapPool = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

export const parseLooseJson = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = Math.min(...['{', '['].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c))));
  if (!isFinite(start)) return null;
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
};
