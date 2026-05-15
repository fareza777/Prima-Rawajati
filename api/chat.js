// PRIMA – OpenRouter proxy (Vercel Edge Function)
// Keeps OPENROUTER_API_KEY server-side. Streams response back to client.
export const config = { runtime: 'edge' };

// Validasi minimal: model harus format vendor/model (OpenRouter style).
// OpenRouter sendiri yang akan reject kalau model tidak tersedia atau
// API key tidak punya credits.
function isValidModelId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]+\/[a-z0-9._-]+$/i.test(id);
}

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
  if (!isValidModelId(model)) {
    return json({ error: `Model ID tidak valid: ${model}` }, 400, req);
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
