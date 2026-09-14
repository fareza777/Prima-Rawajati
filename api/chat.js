// PRIMA – Multi-Provider AI Proxy (Vercel Edge Function)
// Supports: OpenRouter, OpenAI, Anthropic, Google Gemini, MiniMax, Custom endpoint
// OpenRouter primary: qwen/qwen3.7-flash
export const config = { runtime: 'edge' };

const PROVIDER_CONFIG = {
  openrouter: { base: 'https://openrouter.ai/api/v1/chat/completions', envKey: 'OPENROUTER_API_KEY' },
  openai:     { base: 'https://api.openai.com/v1/chat/completions',     envKey: 'OPENAI_API_KEY' },
  anthropic:  { base: 'https://api.anthropic.com/v1/messages',          envKey: 'ANTHROPIC_API_KEY' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/models', envKey: 'GEMINI_API_KEY' },
  minimax:    { base: 'https://api.minimax.io/v1/chat/completions',     envKey: 'MINIMAX_API_KEY' },
  custom:     { base: '', envKey: 'CUSTOM_AI_API_KEY' }
};

const DEFAULT_OPENROUTER_FALLBACKS = [];

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

  if (!key && providerKey === 'custom' && clientApiKey) {
    key = String(clientApiKey).trim().replace(/^["']|["']$/g, '');
  }
  return key;
}

function buildUpstreamBody(providerKey, model, messages, stream, temperature, max_tokens, extra = {}) {
  const body = { model, messages, stream, temperature, max_tokens };
  if (providerKey === 'minimax') {
    body.reasoning_split = true;
    body.thinking = { type: 'disabled' };
    body.top_p = 0.95;
  }
  // Qwen 3.7 Flash (dan reasoning model OpenRouter lain) sering menghabiskan
  // budget di field reasoning. Cap reasoning supaya sisa token untuk jawaban.
  if (providerKey === 'openrouter') {
    body.reasoning = extra.reasoning || { max_tokens: 256 };
  }
  return body;
}

function buildModelChain(primary, fallbacks, providerKey) {
  const extras = Array.isArray(fallbacks) && fallbacks.length
    ? fallbacks
    : (providerKey === 'openrouter' ? DEFAULT_OPENROUTER_FALLBACKS : []);
  const chain = [primary, ...extras].map(m => String(m || '').trim()).filter(Boolean);
  const seen = new Set();
  return chain.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function shouldRetryUpstream(status) {
  return status === 402 || status === 404 || status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
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
    max_tokens = 2000,
    provider = 'openrouter',
    baseUrl,
    apiKey: clientApiKey,
    fallbacks,
    reasoning
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

  const origin = req.headers.get('origin') || 'https://prima-rawajati.vercel.app';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (providerKey === 'openrouter') {
    headers['HTTP-Referer'] = origin;
    headers['X-Title'] = 'PRIMA Rawajati';
  }

  const primary = resolveModel(model, provider);
  const chain = buildModelChain(primary, fallbacks, providerKey);
  let lastStatus = 502;
  let lastDetail = '';

  for (const candidate of chain) {
    const resolvedModel = resolveModel(candidate, provider);
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildUpstreamBody(providerKey, resolvedModel, messages, stream, temperature, max_tokens, { reasoning }))
    });

    if (upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-PRIMA-Model': resolvedModel,
          ...corsHeaders(req)
        }
      });
    }

    lastStatus = upstream.status;
    lastDetail = await upstream.text().catch(() => '');
    if (!shouldRetryUpstream(upstream.status) || candidate === chain[chain.length - 1]) {
      break;
    }
  }

  let message = `Provider ${provider} mengembalikan HTTP ${lastStatus}`;
  if (lastStatus === 401) {
    message = providerKey === 'openrouter'
      ? 'Autentikasi OpenRouter gagal. Periksa OPENROUTER_API_KEY di Vercel (Production).'
      : 'Autentikasi MiniMax gagal. Periksa MINIMAX_API_KEY di Vercel (Production) — gunakan key dari platform.minimax.io.';
  } else if (lastStatus === 429) {
    message = 'Kuota/rate-limit model OpenRouter habis. Mencoba fallback gagal — coba lagi nanti.';
  }

  return json({
    error: message,
    status: lastStatus,
    detail: lastDetail.slice(0, 300),
    tried: chain
  }, lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502, req);
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
