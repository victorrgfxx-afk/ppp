// Client LLM minimal, agnostic de furnizor. Suporta OpenAI-compatibil si Anthropic,
// text si imagini. Nu are dependinte externe: doar fetch.
import { parseLooseJson } from './n8n-shim.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const callWithRetry = async (fn, { tries = 4, label = 'LLM' } = {}) => {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retriable = /429|5\d\d|timeout|ECONNRESET|fetch failed/i.test(e.message);
      if (!retriable || i === tries - 1) break;
      const wait = 2000 * 2 ** i;
      console.error(`  ${label}: ${e.message} — reincerc in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastErr;
};

export const detectProvider = () => {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
};

export const makeClient = ({ provider = detectProvider(), model, dryRun = false } = {}) => {
  if (dryRun) return { provider: 'dry-run', model: 'stub', complete: null };
  if (!provider) {
    throw new Error(
      'Nicio cheie API gasita. Seteaza OPENAI_API_KEY sau ANTHROPIC_API_KEY, ' +
      'sau ruleaza cu --dry-run ca sa testezi lantul fara model.'
    );
  }

  const complete = async ({ prompt, images = [], temperature = 0.7, maxTokens = 4096, json = false, label = 'LLM' }) => {
    if (provider === 'anthropic') {
      const content = [
        ...images.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
        })),
        { type: 'text', text: prompt },
      ];
      const res = await callWithRetry(async () => {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages: [{ role: 'user', content }] }),
        });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
        return r.json();
      }, { label });
      return res.content.map((c) => c.text || '').join('');
    }

    // OpenAI-compatibil (functioneaza si cu OpenRouter, Groq, vLLM etc. prin OPENAI_BASE_URL)
    const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const content = [
      { type: 'text', text: prompt },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' },
      })),
    ];
    const res = await callWithRetry(async () => {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'user', content }],
        }),
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
      return r.json();
    }, { label });
    return res.choices[0].message.content;
  };

  return { provider, model, complete };
};

// Cere JSON si il parseaza tolerant; o singura reincercare cu instructiune de corectie,
// echivalentul local al nodului Auto-fixing Parser din n8n.
export const completeJson = async (client, opts) => {
  const raw = await client.complete({ ...opts, json: true });
  const parsed = parseLooseJson(raw);
  if (parsed) return parsed;
  const fixed = await client.complete({
    ...opts,
    prompt: `${opts.prompt}\n\nRaspunsul tau anterior nu a fost JSON valid. Returneaza DOAR obiectul JSON, fara text in jur.`,
    json: true,
  });
  const reparsed = parseLooseJson(fixed);
  if (!reparsed) throw new Error(`Modelul nu a returnat JSON valid: ${String(fixed).slice(0, 200)}`);
  return reparsed;
};
