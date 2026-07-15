import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePushSubscription, subscriptionField, shouldRemoveSubscription } from '../lib/push-store.mjs';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example-token',
  expirationTime: null,
  keys: { p256dh: 'public-key-material', auth: 'auth-material' }
};

test('validates a Chrome-style push subscription', () => {
  assert.deepEqual(validatePushSubscription(valid), { ok: true, errors: [] });
});

test('rejects malformed or insecure subscriptions', () => {
  const result = validatePushSubscription({ endpoint: 'http://bad', keys: {} });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
});

test('uses a stable non-secret field for an endpoint', async () => {
  assert.equal(await subscriptionField(valid), await subscriptionField(valid));
  assert.match(await subscriptionField(valid), /^[a-f0-9]{64}$/);
});

test('removes only permanently invalid push endpoints', () => {
  assert.equal(shouldRemoveSubscription({ statusCode: 404 }), true);
  assert.equal(shouldRemoveSubscription({ statusCode: 410 }), true);
  assert.equal(shouldRemoveSubscription({ statusCode: 500 }), false);
});
