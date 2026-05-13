// PRIMA – OpenRouter proxy (Vercel Edge Function)
// Keeps OPENROUTER_API_KEY server-side. Streams response back to client.
export const config = { runtime: 'edge' };

const ALLOWED_MODELS = new Set([
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  // Reliable fallbacks (in case the names above are unavailable on OpenRouter):
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free'
]);

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req)
    });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY not configured on server' }, 500, req);
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400, req); }

  const { model, messages, stream = true, temperature = 0.4, max_tokens = 800 } = body || {};
  if (!model || !Array.isArray(messages) || !messages.length) {
    return json({ error: 'Missing model or messages' }, 400, req);
  }
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: `Model not allowed: ${model}` }, 400, req);
  }

  const origin = req.headers.get('origin') || 'https://prima-rawajati.vercel.app';

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': origin,
      'X-Title': 'PRIMA Rawajati'
    },
    body: JSON.stringify({ model, messages, stream, temperature, max_tokens })
  });

  // Pass-through (supports both JSON & SSE streams)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-cache, no-transform',
      ...corsHeaders(req)
    }
  });
}

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(obj, status = 200, req) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
  });
}
