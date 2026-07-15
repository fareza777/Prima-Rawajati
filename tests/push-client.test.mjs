import test from 'node:test';
import assert from 'node:assert/strict';
import { urlBase64ToUint8Array, mapPushStatus } from '../js/push.js';

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
