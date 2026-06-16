// PRIMA – Multi-Provider AI Proxy (Vercel Edge Function)
// Supports: OpenRouter, OpenAI, Anthropic, Google Gemini, Custom endpoint
// API keys stored in server env vars. Client sends provider + baseUrl.
export const config = { runtime: 'edge' };

// Provider → default baseUrl + env var name
const PROVIDER_CONFIG = {
  openrouter: { base: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  openai:     { base: 'https://api.openai.com/v1/chat/completions',     envKey: 'OPENAI_API_KEY' },
  anthropic:  { base: 'https://api.anthropic.com/v1/messages',          envKey: 'ANTHROPIC_API_KEY' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/models', envKey: 'GEMINI_API_KEY' },
  MiniMax:    { base: 'https://api.MiniMax.io/v1/chat/completions',  envKey: 'MINIMAX_API_KEY' },
  custom:     { base: '', envKey: 'CUSTOM_AI_API_KEY' }
};

function isValidModelId(id) {
  return typeof id === 'string' && (/^[a-z0-9_-]+\/[a-z0-9._-]+$/i.test(id) || /^[A-Za-z][A-Za-z0-9._-]{1,63}$/.test(id));
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400, req); }

  const { model, messages, stream = true, temperature = 0.4, max_tokens = 800, provider = 'openrouter', baseUrl, apiKey: clientApiKey } = body || {};

  if (!model || !Array.isArray(messages) || !messages.length) {
    return json({ error: 'Missing model or messages' }, 400, req);
  }

  // Resolve endpoint
  const cfg = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.openrouter;
  const endpoint = baseUrl || cfg.base || '';
  if (!endpoint) {
    return json({ error: 'Base URL / endpoint tidak dikonfigurasi untuk provider ini' }, 500, req);
  }

  // Resolve API key: prefer client-sent (for testing), fallback to server env
  let apiKey = clientApiKey || process.env[cfg.envKey] || '';
  if (!apiKey) {
    // Fallback: try generic env var
    apiKey = process.env.OPENROUTER_API_KEY || '';
  }
  if (!apiKey) {
    return json({ error: `API key tidak ditemukan untuk provider "${provider}". Hubungi developer.` }, 500, req);
  }

  const origin = req.headers.get('origin') || 'https://prima-rawajati.vercel.app';

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = origin;
    headers['X-Title'] = 'PRIMA Rawajati';
  }

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
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
