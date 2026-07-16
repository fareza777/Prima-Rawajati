import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { urlBase64ToUint8Array, mapPushStatus, shouldShowPushOnboarding } from '../js/push.js';

test('converts a URL-safe VAPID key to bytes', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')], [1, 2, 3, 4]);
});

test('maps unsupported and disabled states', () => {
  assert.equal(mapPushStatus({ supported: false }).code, 'unsupported');
  assert.equal(mapPushStatus({ supported: true, configured: false }).code, 'unconfigured');
});

test('maps notification permissions without prompting', () => {
  assert.equal(mapPushStatus({ supported: true, configured: true, permission: 'denied' }).code, 'blocked');
  assert.equal(mapPushStatus({ supported: true, configured: true, permission: 'default' }).code, 'inactive');
  assert.equal(mapPushStatus({ supported: true, configured: true, permission: 'granted', subscribed: true }).code, 'active');
  assert.equal(mapPushStatus({ supported: true, configured: true, permission: 'granted', subscribed: false }).code, 'inactive');
});

test('shows onboarding only for an unseen eligible inactive user', () => {
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: false }), true);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'active', permission: 'granted', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'blocked', permission: 'denied', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: true }), false);
});

test('app shell contains push onboarding controls and a fresh cache version', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

  assert.match(html, /data-push-onboarding(?:[\s=>]|$)/);
  assert.match(html, /data-push-onboarding-activate(?:[\s=>]|$)/);
  assert.match(html, /data-push-onboarding-later(?:[\s=>]|$)/);
  assert.match(serviceWorker, /const CACHE = 'prima-v4\.12\.0'/);
});
