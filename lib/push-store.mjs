export const PUSH_SUBSCRIPTIONS_HASH = 'prima:push:subscriptions:v1';

export function validatePushSubscription(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || !String(value.endpoint || '').startsWith('https://')) {
    errors.push('Endpoint push wajib HTTPS.');
  }
  if (!String(value?.keys?.p256dh || '').trim()) errors.push('Kunci p256dh wajib ada.');
  if (!String(value?.keys?.auth || '').trim()) errors.push('Kunci auth wajib ada.');
  return { ok: errors.length === 0, errors };
}

export function normalizePushSubscription(value) {
  return {
    endpoint: String(value?.endpoint || '').trim(),
    expirationTime: value?.expirationTime ?? null,
    keys: {
      p256dh: String(value?.keys?.p256dh || '').trim(),
      auth: String(value?.keys?.auth || '').trim()
    }
  };
}

export async function subscriptionField(value) {
  const normalized = normalizePushSubscription(value);
  const bytes = new TextEncoder().encode(normalized.endpoint);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function shouldRemoveSubscription(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}
