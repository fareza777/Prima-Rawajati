import webpush from 'web-push';
import { redisCommand } from '../lib/redis.mjs';
import { buildNotificationPayload } from '../lib/announcement.mjs';
import { isPushConfigured } from './push-config.js';
import {
  PUSH_SUBSCRIPTIONS_HASH,
  subscriptionField,
  shouldRemoveSubscription,
  validatePushSubscription
} from '../lib/push-store.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function createPushBroadcastHandler(options = {}) {
  const env = options.env || process.env;
  const command = options.command || ((cmd) => redisCommand(cmd, env));
  let sendNotification = options.sendNotification;

  return async function pushBroadcastHandler(req) {
    if (req.method !== 'POST') return json(405, { error: 'Method tidak diizinkan.' });
    const secret = req.headers.get('x-admin-secret') || '';
    if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return json(401, { error: 'Admin secret salah.' });
    if (!isPushConfigured(env)) return json(503, { error: 'Web Push/VAPID belum dikonfigurasi.' });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Body JSON tidak valid.' }); }
    let payload;
    try { payload = buildNotificationPayload(body?.announcement || body); }
    catch (error) { return json(400, { error: error.message }); }

    if (!sendNotification) {
      try {
        webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      } catch {
        return json(503, { error: 'Konfigurasi VAPID tidak valid.' });
      }
      sendNotification = (subscription, data) => webpush.sendNotification(subscription, data, { TTL: 86400, urgency: 'normal' });
    }

    let values;
    try { values = await command(['HVALS', PUSH_SUBSCRIPTIONS_HASH]); }
    catch { return json(503, { error: 'Daftar penerima notifikasi tidak tersedia.' }); }
    const subscriptions = (Array.isArray(values) ? values : []).map(value => {
      try { return JSON.parse(value); } catch { return null; }
    }).filter(value => value && validatePushSubscription(value).ok);

    const result = { total: subscriptions.length, sent: 0, failed: 0, removed: 0 };
    for (let start = 0; start < subscriptions.length; start += 20) {
      const batch = subscriptions.slice(start, start + 20);
      const settled = await Promise.all(batch.map(async subscription => {
        try {
          await sendNotification(subscription, JSON.stringify(payload));
          result.sent += 1;
        } catch (error) {
          result.failed += 1;
          if (shouldRemoveSubscription(error)) {
            const field = await subscriptionField(subscription);
            await command(['HDEL', PUSH_SUBSCRIPTIONS_HASH, field]).catch(() => {});
            result.removed += 1;
          }
        }
      }));
      void settled;
    }
    return json(200, { ok: true, result });
  };
}

const pushBroadcastHandler = createPushBroadcastHandler();

export function POST(request) {
  return pushBroadcastHandler(request);
}
