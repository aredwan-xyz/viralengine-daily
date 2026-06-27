/**
 * Minimal Gemini client (OpenAI-compatible endpoint, zero deps).
 * Used by the daily generator. Falls back gracefully when GEMINI_API_KEY
 * is absent so the build never depends on a live key.
 */

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.MODEL || 'gemini-2.0-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const hasKey = () => Boolean(KEY) && typeof fetch === 'function';

async function chat(system, user, { maxTokens = 2048, temperature = 0.7 } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
}

function extractJSON(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const obj = [t.indexOf('{'), t.lastIndexOf('}')];
  const arr = [t.indexOf('['), t.lastIndexOf(']')];
  if (obj[0] !== -1 && obj[1] !== -1 && (arr[0] === -1 || obj[0] < arr[0])) return JSON.parse(t.slice(obj[0], obj[1] + 1));
  if (arr[0] !== -1 && arr[1] !== -1) return JSON.parse(t.slice(arr[0], arr[1] + 1));
  return JSON.parse(t);
}

async function chatJSON(system, user, opts) {
  return extractJSON(await chat(system, user, opts));
}

module.exports = { hasKey, chat, chatJSON, MODEL };
