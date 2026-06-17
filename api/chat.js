// PRIMA – Multi-Provider AI Proxy (Vercel Edge Function)
// Supports: OpenRouter, OpenAI, Anthropic, Google Gemini, MiniMax, Custom endpoint
// API keys stored in server env vars. Client sends provider + baseUrl.
export const config = { runtime: 'edge' };

// Provider → default baseUrl + env var name (keys are lowercase)
const PROVIDER_CONFIG = {
  openrouter: { base: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  openai:     { base: 'https://api.openai.com/v1/chat/completions',     envKey: 'OPENAI_API_KEY' },
  anthropic:  { base: 'https://api.anthropic.com/v1/messages',          envKey: 'ANTHROPIC_API_KEY' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/models', envKey: 'GEMINI_API_KEY' },
  minimax:    { base: 'https://api.minimax.io/v1/chat/completions',     envKey: 'MINIMAX_API_KEY' },
  custom:     { base: '', envKey: 'CUSTOM_AI_API_KEY' }
};

function resolveProvider(provider) {
  const key = String(provider || 'openrouter').toLowerCase();
  return PROVIDER_CONFIG[key] || PROVIDER_CONFIG.openrouter;
}

function resolveModel(model, provider) {
  let m = String(model || '').trim();
  if (/minimax/i.test(provider || '')) {
    m = m.replace(/^MiniMax\/MiniMax-/i, 'MiniMax-').replace(/^MiniMax\//i, '');
    if (!/^MiniMax-/i.test(m)) m = 'MiniMax-M3';
  }
  return m;
}

function resolveApiKey(cfg, providerKey, clientApiKey) {
  const envKeys = [cfg.envKey];
  if (providerKey === 'minimax') {
    envKeys.push('MINIMAX_API_KEY', 'MINIMAX_API_TOKEN', 'MINIMAX_KEY');
  }
  if (providerKey === 'openrouter') {
    envKeys.push('OPENROUTER_API_KEY');
  }

  let key = '';
  for (const name of envKeys) {
    const val = process.env[name];
    if (val && String(val).trim()) {
      key = String(val).trim().replace(/^["']|["']$/g, '');
      break;
    }
  }

  // Server env wins; client key only for custom provider testing
  if (!key && providerKey === 'custom' && clientApiKey) {
    key = String(clientApiKey).trim().replace(/^["']|["']$/g, '');
  }
  return key;
}

function buildUpstreamBody(providerKey, model, messages, stream, temperature, max_tokens) {
  const body = { model, messages, stream, temperature, max_tokens };
  if (providerKey === 'minimax') {
    body.reasoning_split = true;
    body.thinking = { type: 'disabled' };
    body.top_p = 0.95;
  }
  return body;
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

  const {
    model,
    messages,
    stream = true,
    temperature = 0.4,
    max_tokens = 800,
    provider = 'openrouter',
    baseUrl,
    apiKey: clientApiKey
  } = body || {};

  if (!model || !Array.isArray(messages) || !messages.length) {
    return json({ error: 'Missing model or messages' }, 400, req);
  }

  const providerKey = String(provider || 'openrouter').toLowerCase();
  const cfg = resolveProvider(provider);
  const endpoint = providerKey === 'custom'
    ? (baseUrl || cfg.base || '')
    : (cfg.base || baseUrl || '');
  if (!endpoint) {
    return json({ error: 'Base URL / endpoint tidak dikonfigurasi untuk provider ini' }, 500, req);
  }

  const apiKey = resolveApiKey(cfg, providerKey, clientApiKey);
  if (!apiKey) {
    return json({
      error: `API key tidak ditemukan untuk provider "${provider}". Set ${cfg.envKey} di Vercel (Production).`
    }, 500, req);
  }

  const resolvedModel = resolveModel(model, provider);
  const origin = req.headers.get('origin') || 'https://prima-rawajati.vercel.app';

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (providerKey === 'openrouter') {
    headers['HTTP-Referer'] = origin;
    headers['X-Title'] = 'PRIMA Rawajati';
  }

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildUpstreamBody(providerKey, resolvedModel, messages, stream, temperature, max_tokens))
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    let message = `Provider ${provider} mengembalikan HTTP ${upstream.status}`;
    if (upstream.status === 401) {
      message = 'Autentikasi MiniMax gagal. Periksa MINIMAX_API_KEY di Vercel (Production) — gunakan key dari platform.minimax.io.';
    }
    return json({ error: message, status: upstream.status, detail: detail.slice(0, 300) }, upstream.status, req);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
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
