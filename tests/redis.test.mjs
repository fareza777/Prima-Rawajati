import test from 'node:test';
import assert from 'node:assert/strict';
import { isRedisConfigured, redisCommand } from '../lib/redis.mjs';

test('redisCommand sends an authenticated JSON command', async () => {
  let captured;
  const result = await redisCommand(['HGETALL', 'prima:test'], {
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret'
  }, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ result: ['a', 'b'] }), { status: 200 });
  });
  assert.deepEqual(result, ['a', 'b']);
  assert.equal(captured.url, 'https://redis.example');
  assert.equal(captured.options.headers.Authorization, 'Bearer secret');
  assert.equal(captured.options.body, '["HGETALL","prima:test"]');
});

test('supports Vercel Marketplace prefixed Upstash credentials', async () => {
  const env = {
    UPSTASH_REDIS_REST_KV_REST_API_URL: 'https://marketplace-redis.example',
    UPSTASH_REDIS_REST_KV_REST_API_TOKEN: 'marketplace-secret'
  };
  let captured;
  assert.equal(isRedisConfigured(env), true);
  const result = await redisCommand(['PING'], env, async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ result: 'PONG' }), { status: 200 });
  });
  assert.equal(result, 'PONG');
  assert.equal(captured.url, env.UPSTASH_REDIS_REST_KV_REST_API_URL);
  assert.equal(captured.options.headers.Authorization, 'Bearer marketplace-secret');
});

test('redisCommand reports missing configuration', async () => {
  await assert.rejects(() => redisCommand(['PING'], {}, async () => new Response()), /REDIS_NOT_CONFIGURED/);
});

test('redisCommand reports upstream failure without leaking response body', async () => {
  await assert.rejects(() => redisCommand(['PING'], {
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'secret'
  }, async () => new Response('sensitive', { status: 503 })), /REDIS_HTTP_503/);
});
