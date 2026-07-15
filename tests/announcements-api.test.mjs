import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncementsHandler } from '../api/announcements.js';

function request(method, body, secret = '') {
  return new Request('https://prima.example/api/announcements', {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const valid = {
  id: 'pg-uji-emisi-20260716',
  judul: 'Uji Emisi Gratis',
  ringkasan: 'Uji emisi gratis untuk warga Pancoran.',
  eventStart: '2026-07-16T09:00:00+07:00',
  eventEnd: '2026-07-16T14:00:00+07:00',
  expiresAt: '2026-07-16T14:00:00+07:00'
};

test('GET falls back cleanly when Redis is not configured', async () => {
  const handler = createAnnouncementsHandler({ env: {} });
  const response = await handler(request('GET'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, configured: false, announcements: [] });
});

test('POST rejects an incorrect admin secret', async () => {
  const handler = createAnnouncementsHandler({ env: { ADMIN_SECRET: 'right' } });
  const response = await handler(request('POST', valid, 'wrong'));
  assert.equal(response.status, 401);
});

test('POST rejects invalid announcement data', async () => {
  const handler = createAnnouncementsHandler({ env: { ADMIN_SECRET: 'right' } });
  const response = await handler(request('POST', { id: 'bad' }, 'right'));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Judul/);
});

test('POST upserts a normalized announcement', async () => {
  const calls = [];
  const handler = createAnnouncementsHandler({
    env: { ADMIN_SECRET: 'right', UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' },
    command: async cmd => { calls.push(cmd); return 1; },
    now: () => new Date('2026-07-15T12:00:00+07:00')
  });
  const response = await handler(request('POST', valid, 'right'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.announcement.id, valid.id);
  assert.deepEqual(calls[0].slice(0, 3), ['HSET', 'prima:announcements:v1', valid.id]);
});

test('GET filters expired stored records', async () => {
  const handler = createAnnouncementsHandler({
    env: { UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' },
    command: async () => [JSON.stringify(valid), JSON.stringify({ ...valid, id: 'pg-old', expiresAt: '2026-07-14T10:00:00+07:00' })],
    now: () => new Date('2026-07-15T12:00:00+07:00')
  });
  const response = await handler(request('GET'));
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.deepEqual(data.announcements.map(item => item.id), [valid.id]);
});
