function redisCredentials(env = process.env) {
  return {
    url: env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
  };
}

export function isRedisConfigured(env = process.env) {
  const { url, token } = redisCredentials(env);
  return Boolean(url && token);
}

export async function redisCommand(command, env = process.env, fetchImpl = fetch) {
  const { url, token } = redisCredentials(env);
  if (!url || !token) throw new Error('REDIS_NOT_CONFIGURED');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`REDIS_HTTP_${response.status}`);
  const payload = await response.json();
  return payload.result;
}
