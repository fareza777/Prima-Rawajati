// PRIMA – Analytics Global (Vercel Edge Function)
// Menghitung pemakaian AGREGAT semua pengguna (bukan per-perangkat).
//
// Penyimpanan: Upstash Redis (REST) — gratis, cocok untuk serverless.
//   POST /api/analytics  { "event": "pageViews" }  -> INCR counter harian
//   GET  /api/analytics?days=14                    -> daily buckets + totals
//
// Env vars yang dibutuhkan di Vercel (kalau belum diisi, endpoint balas
// { configured:false } dan aplikasi otomatis fallback ke hitungan lokal):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

export const config = { runtime: 'edge' };

const REST = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const EVENTS = ['pageViews', 'chatSessions', 'layananClicks', 'petaViews', 'downloads'];
const TTL = 60 * 60 * 24 * 400; // simpan ~400 hari

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function dayKeyOffset(offset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Kirim satu command Redis via REST. cmd = ['INCR', 'key', ...]
async function redis(cmd) {
  const r = await fetch(REST, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const j = await r.json();
  return j.result;
}

export default async function handler(req) {
  // Belum dikonfigurasi -> beri tahu client supaya fallback ke lokal.
  if (!REST || !TOKEN) return json(200, { ok: true, configured: false });

  try {
    if (req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch {}
      const ev = body && body.event;
      if (!EVENTS.includes(ev)) return json(400, { ok: false, error: 'event tidak valid' });
      const key = `prima:a:${dayKeyOffset(0)}:${ev}`;
      await redis(['INCR', key]);
      redis(['EXPIRE', key, TTL]).catch(() => {}); // best-effort
      return json(200, { ok: true, configured: true });
    }

    // GET -> agregasi beberapa hari terakhir
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)));
    const dates = [];
    const keys = [];
    for (let i = days - 1; i >= 0; i--) {
      const dd = dayKeyOffset(i);
      dates.push(dd);
      for (const ev of EVENTS) keys.push(`prima:a:${dd}:${ev}`);
    }
    const vals = await redis(['MGET', ...keys]); // array selaras dengan keys
    const totals = {}; EVENTS.forEach(e => (totals[e] = 0));
    const daily = [];
    let idx = 0;
    for (const dd of dates) {
      const rec = { date: dd };
      for (const ev of EVENTS) {
        const v = parseInt(vals[idx++] || '0', 10) || 0;
        rec[ev] = v;
        totals[ev] += v;
      }
      daily.push(rec);
    }
    return json(200, { ok: true, configured: true, totals, daily });
  } catch (e) {
    // Jangan pernah bikin app crash gara-gara analytics.
    return json(200, { ok: false, configured: false, error: String(e && e.message || e) });
  }
}
