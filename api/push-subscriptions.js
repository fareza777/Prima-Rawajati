import { redisCommand } from '../lib/redis.mjs';
import { isPushConfigured } from './push-config.js';
import {
  PUSH_SUBSCRIPTIONS_HASH,
  normalizePushSubscription,
  subscriptionField,
  validatePushSubscription
} from '../lib/push-store.mjs';

export const config = { runtime: 'edge' };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function createPushSubscriptionsHandler(options = {}) {
  const env = options.env || process.env;
  const command = options.command || ((cmd) => redisCommand(cmd, env));

  return async function pushSubscriptionsHandler(req) {
    if (!['POST', 'DELETE'].includes(req.method)) return json(405, { error: 'Method tidak diizinkan.' });
    if (!isPushConfigured(env)) return json(503, { error: 'Notifikasi PRIMA belum dikonfigurasi.' });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body JSON tidak valid.' }); }
    const subscription = normalizePushSubscription(body?.subscription || body);
    const validation = validatePushSubscription(subscription);
    if (!validation.ok) return json(400, { error: validation.errors.join(' '), errors: validation.errors });
    const field = await subscriptionField(subscription);
    try {
      if (req.method === 'DELETE') {
        await command(['HDEL', PUSH_SUBSCRIPTIONS_HASH, field]);
        return json(200, { ok: true, subscribed: false });
      }
      await command(['HSET', PUSH_SUBSCRIPTIONS_HASH, field, JSON.stringify(subscription)]);
      return json(200, { ok: true, subscribed: true });
    } catch {
      return json(503, { error: 'Status notifikasi belum dapat disimpan.' });
    }
  };
}

export default createPushSubscriptionsHandler();
