import { isRedisConfigured } from '../lib/redis.mjs';

export const config = { runtime: 'edge' };

export function isPushConfigured(env = process.env) {
  return env.PUSH_NOTIFICATIONS_ENABLED === 'true'
    && Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT)
    && isRedisConfigured(env);
}

export function createPushConfigHandler(options = {}) {
  const env = options.env || process.env;
  return async function pushConfigHandler(req) {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method tidak diizinkan.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }
    const enabled = isPushConfigured(env);
    return new Response(JSON.stringify({ ok: true, enabled, publicKey: enabled ? env.VAPID_PUBLIC_KEY : '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  };
}

export default createPushConfigHandler();
