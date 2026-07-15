import test from 'node:test';
import assert from 'node:assert/strict';
import { executePublishFlow } from '../lib/publish-flow.mjs';

const draft = { id: 'pg-uji-emisi-20260716', notification: { enabled: true } };

test('halts after GitHub persistence failure', async () => {
  const calls = [];
  const result = await executePublishFlow(draft, {
    saveStatic: async () => { calls.push('github'); return { ok: false, error: 'fail' }; },
    upsertDynamic: async () => { calls.push('redis'); return { ok: true }; },
    broadcast: async () => { calls.push('push'); return { ok: true }; }
  });
  assert.deepEqual(calls, ['github']);
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'github');
});

test('does not broadcast when dynamic publication fails', async () => {
  const calls = [];
  const result = await executePublishFlow(draft, {
    saveStatic: async () => { calls.push('github'); return { ok: true }; },
    upsertDynamic: async () => { calls.push('redis'); return { ok: false }; },
    broadcast: async () => { calls.push('push'); return { ok: true }; }
  });
  assert.deepEqual(calls, ['github', 'redis']);
  assert.equal(result.status, 'partial');
  assert.equal(result.stage, 'redis');
});

test('completes without push when notification is disabled', async () => {
  const calls = [];
  const result = await executePublishFlow({ ...draft, notification: { enabled: false } }, {
    saveStatic: async () => { calls.push('github'); return { ok: true }; },
    upsertDynamic: async () => { calls.push('redis'); return { ok: true }; },
    broadcast: async () => { calls.push('push'); return { ok: true }; }
  });
  assert.deepEqual(calls, ['github', 'redis']);
  assert.equal(result.status, 'complete');
  assert.equal(result.broadcast, null);
});

test('returns aggregate broadcast result after both publication steps', async () => {
  const result = await executePublishFlow(draft, {
    saveStatic: async () => ({ ok: true, commit: 'abc' }),
    upsertDynamic: async () => ({ ok: true }),
    broadcast: async () => ({ ok: true, result: { total: 3, sent: 2, failed: 1, removed: 1 } })
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.broadcast.result, { total: 3, sent: 2, failed: 1, removed: 1 });
});

test('keeps the stable draft ID as idempotency key for all steps', async () => {
  const ids = [];
  await executePublishFlow(draft, {
    saveStatic: async value => { ids.push(value.id); return { ok: true }; },
    upsertDynamic: async value => { ids.push(value.id); return { ok: true }; },
    broadcast: async value => { ids.push(value.id); return { ok: true, result: {} }; }
  });
  assert.deepEqual(ids, [draft.id, draft.id, draft.id]);
});
