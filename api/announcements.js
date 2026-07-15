import { redisCommand, isRedisConfigured } from '../lib/redis.mjs';
import { mergeAnnouncements, normalizeAnnouncement, validateAnnouncement } from '../lib/announcement.mjs';

export const config = { runtime: 'edge' };
const ANNOUNCEMENT_HASH = 'prima:announcements:v1';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

export function createAnnouncementsHandler(options = {}) {
  const env = options.env || process.env;
  const command = options.command || ((cmd) => redisCommand(cmd, env));
  const now = options.now || (() => new Date());

  return async function announcementsHandler(req) {
    if (req.method === 'GET') {
      if (!isRedisConfigured(env)) {
        return json(200, { ok: true, configured: false, announcements: [] });
      }
      try {
        const values = await command(['HVALS', ANNOUNCEMENT_HASH]);
        const parsed = (Array.isArray(values) ? values : []).map(safeParse).filter(Boolean);
        return json(200, {
          ok: true,
          configured: true,
          announcements: mergeAnnouncements([], parsed, now())
        });
      } catch {
        return json(200, { ok: true, configured: false, announcements: [] });
      }
    }

    if (req.method !== 'POST') return json(405, { error: 'Method tidak diizinkan.' });
    const secret = req.headers.get('x-admin-secret') || '';
    if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return json(401, { error: 'Admin secret salah.' });

    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body JSON tidak valid.' }); }
    const announcement = normalizeAnnouncement(body?.announcement || body, now());
    const validation = validateAnnouncement(announcement);
    if (!validation.ok) return json(400, { error: validation.errors.join(' '), errors: validation.errors });
    if (!isRedisConfigured(env)) return json(503, { error: 'Penyimpanan pengumuman dinamis belum dikonfigurasi.' });

    try {
      await command(['HSET', ANNOUNCEMENT_HASH, announcement.id, JSON.stringify(announcement)]);
      return json(200, { ok: true, configured: true, announcement });
    } catch {
      return json(503, { error: 'Pengumuman belum dapat dipublikasikan secara langsung.' });
    }
  };
}

export default createAnnouncementsHandler();
