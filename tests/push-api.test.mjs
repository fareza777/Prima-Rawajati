import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushConfigHandler } from '../api/push-config.js';
import { createPushSubscriptionsHandler } from '../api/push-subscriptions.js';
import { createPushBroadcastHandler } from '../api/push-broadcast.js';

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example-token',
  expirationTime: null,
  keys: { p256dh: 'public-key-material', auth: 'auth-material' }
};

const announcement = {
  id: 'pg-uji-emisi-20260716',
  judul: 'Uji Emisi Gratis',
  ringkasan: 'Uji emisi gratis untuk warga Pancoran.',
  notification: { enabled: true, title: 'Uji Emisi Gratis Besok', body: 'Kamis pukul 09.00–14.00 WIB.' }
};

function req(method, body, secret = '') {
  return new Request('https://prima.example/api/push', {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('push config stays disabled unless all credentials are present', async () => {
  const response = await createPushConfigHandler({ env: { PUSH_NOTIFICATIONS_ENABLED: 'true', VAPID_PUBLIC_KEY: 'public' } })(req('GET'));
  assert.deepEqual(await response.json(), { ok: true, enabled: false, publicKey: '' });
});

test('subscription API stores valid data without returning the endpoint', async () => {
  const calls = [];
  const env = { PUSH_NOTIFICATIONS_ENABLED: 'true', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:test@example.com', UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' };
  const handler = createPushSubscriptionsHandler({ env, command: async cmd => { calls.push(cmd); return 1; } });
  const response = await handler(req('POST', subscription));
  const data = await response.json();
  assert.deepEqual(data, { ok: true, subscribed: true });
  assert.equal(calls[0][0], 'HSET');
  assert.doesNotMatch(JSON.stringify(data), /fcm\.googleapis/);
});

test('subscription API rejects malformed subscriptions', async () => {
  const env = { PUSH_NOTIFICATIONS_ENABLED: 'true', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:test@example.com', UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' };
  const response = await createPushSubscriptionsHandler({ env, command: async () => 1 })(req('POST', { endpoint: 'bad' }));
  assert.equal(response.status, 400);
});

test('broadcast rejects unauthorized callers', async () => {
  const response = await createPushBroadcastHandler({ env: { ADMIN_SECRET: 'right' } })(req('POST', announcement, 'wrong'));
  assert.equal(response.status, 401);
});

test('broadcast reports missing VAPID configuration', async () => {
  const response = await createPushBroadcastHandler({ env: { ADMIN_SECRET: 'right' } })(req('POST', announcement, 'right'));
  assert.equal(response.status, 503);
});

test('broadcast counts success/failure and removes 410 subscriptions', async () => {
  const expired = { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/expired' };
  const removed = [];
  const env = { ADMIN_SECRET: 'right', PUSH_NOTIFICATIONS_ENABLED: 'true', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:test@example.com', UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' };
  const command = async cmd => {
    if (cmd[0] === 'HVALS') return [JSON.stringify(subscription), JSON.stringify(expired)];
    if (cmd[0] === 'HDEL') removed.push(cmd[2]);
    return 1;
  };
  const sendNotification = async sub => {
    if (sub.endpoint.endsWith('expired')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    return { statusCode: 201 };
  };
  const response = await createPushBroadcastHandler({ env, command, sendNotification })(req('POST', announcement, 'right'));
  const data = await response.json();
  assert.deepEqual(data.result, { total: 2, sent: 1, failed: 1, removed: 1 });
  assert.equal(removed.length, 1);
});
