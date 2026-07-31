import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PUSH_FEATURE_ENABLED,
  PUSH_ONBOARDING_ENABLED,
  createPrimaPush,
  urlBase64ToUint8Array,
  mapPushStatus,
  shouldShowPushOnboarding,
  describePushEnvironment,
  withTimeout
} from '../js/push.js';

test('fingerprints the engine that produced a push failure', () => {
  const chromeTwa = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36';
  assert.equal(
    describePushEnvironment({ userAgent: chromeTwa, permission: 'granted', standalone: true }),
    'Chrome 141 · TWA · izin:granted'
  );

  const webview = 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36';
  assert.match(describePushEnvironment({ userAgent: webview, permission: 'granted' }), /^WebView/);

  assert.match(describePushEnvironment({ userAgent: 'MiuiBrowser/17', permission: 'default' }), /^browser lain/);
  assert.equal(describePushEnvironment(), 'browser lain · tab · izin:?');
});

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

test('shows onboarding to an unseen user who has not granted notifications yet', () => {
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: false }), true);

  // Android 13+ reports denied/blocked for a fresh install that was never
  // asked — these users are the ones who most need the offer.
  assert.equal(shouldShowPushOnboarding({ statusCode: 'blocked', permission: 'denied', seen: false }), true);

  assert.equal(shouldShowPushOnboarding({ statusCode: 'active', permission: 'granted', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'unsupported', permission: 'default', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'unconfigured', permission: 'default', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: true }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: false, appReady: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: false, introVisible: true }), false);
});

test('a blocked device still gets a permission request before any settings advice', async () => {
  let permissionRequests = 0;
  const notification = {
    permission: 'denied',
    requestPermission() {
      permissionRequests += 1;
      notification.permission = 'granted';
      return Promise.resolve('granted');
    }
  };
  const subscription = {
    endpoint: 'https://push.example/blocked',
    toJSON: () => ({ endpoint: 'https://push.example/blocked' })
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
            subscribe: () => Promise.resolve(subscription)
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  assert.equal(push.getStatus().code, 'blocked');

  const result = await push.subscribe();
  assert.equal(permissionRequests, 1, 'must ask instead of only pointing at settings');
  assert.equal(result.code, 'active');
});

test('never prompts for permission before the server reports push is configured', async () => {
  let permissionRequests = 0;
  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: { serviceWorker: {} },
    Notification: {
      permission: 'default',
      requestPermission() {
        permissionRequests += 1;
        return Promise.resolve('granted');
      }
    }
  });

  assert.equal(PUSH_FEATURE_ENABLED, true);
  assert.equal(PUSH_ONBOARDING_ENABLED, true);
  assert.equal((await push.subscribe()).code, 'unconfigured');
  assert.equal(permissionRequests, 0);
});

test('activates notifications once the server reports push is configured', async () => {
  let permissionRequests = 0;
  const saved = [];
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc' })
  };
  const notification = {
    permission: 'default',
    requestPermission() {
      permissionRequests += 1;
      notification.permission = 'granted';
      return Promise.resolve('granted');
    }
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () => Promise.resolve(null),
            subscribe: () => Promise.resolve(subscription)
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url, options) => {
      if (url === '/api/push-config') {
        return { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) };
      }
      saved.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  await push.init();
  assert.equal(permissionRequests, 0, 'init must not prompt on startup');

  const result = await push.subscribe();
  assert.equal(permissionRequests, 1);
  assert.equal(result.code, 'active');
  assert.deepEqual(saved, [{ endpoint: 'https://push.example/abc' }]);
});

test('subscribes directly from a granted-permission click', async () => {
  let userActivation = true;
  let activationAtSubscribe = false;
  let permissionRequests = 0;
  const subscription = {
    endpoint: 'https://push.example/gesture',
    toJSON: () => ({ endpoint: 'https://push.example/gesture' })
  };
  const notification = {
    permission: 'granted',
    requestPermission: async () => {
      permissionRequests += 1;
      return 'granted';
    }
  };
  const registration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: () => {
        activationAtSubscribe = userActivation;
        return Promise.resolve(subscription);
      }
    }
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: { serviceWorker: { ready: Promise.resolve(registration) } },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  const result = await push.subscribe();
  userActivation = false;

  assert.equal(permissionRequests, 0, 'must not request permission again');
  assert.equal(activationAtSubscribe, true, 'subscribe must run in the click activation');
  assert.equal(result.code, 'active');
});

test('recovers when a subscription from an older VAPID key blocks registration', async () => {
  const fresh = { endpoint: 'https://push.example/fresh', toJSON: () => ({ endpoint: 'https://push.example/fresh' }) };
  let unsubscribed = false;
  let attempts = 0;
  let staleExists = true;

  const stale = {
    endpoint: 'https://push.example/stale',
    unsubscribe: async () => { unsubscribed = true; staleExists = false; return true; }
  };
  const notification = {
    permission: 'default',
    requestPermission: async () => { notification.permission = 'granted'; return 'granted'; }
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            // The active registration reports nothing, but Chrome still holds
            // an FCM registration bound to the previous key.
            getSubscription: async () => (attempts === 0 ? null : (staleExists ? stale : null)),
            subscribe: async () => {
              attempts += 1;
              if (attempts === 1) {
                throw new Error(
                  'Registration failed - A subscription with a different applicationServerKey already exists'
                );
              }
              return fresh;
            }
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  const result = await push.subscribe();

  assert.equal(attempts, 2, 'must retry after dropping the stale subscription');
  assert.equal(unsubscribed, true);
  assert.equal(result.code, 'active');
});

test('keeps an existing subscription when the failure is not a key conflict', async () => {
  let unsubscribed = false;
  const existing = {
    endpoint: 'https://push.example/works',
    unsubscribe: async () => { unsubscribed = true; return true; }
  };
  const notification = {
    permission: 'granted',
    requestPermission: async () => 'granted'
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            // Nothing on this registration at subscribe time, but a working
            // subscription exists elsewhere on the profile.
            getSubscription: async () => (unsubscribed ? null : existing),
            subscribe: async () => { throw new Error('Registration failed - push service error'); }
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  await push.subscribe().catch(() => {});
  assert.equal(unsubscribed, false, 'an unrelated failure must not destroy a working subscription');
});

test('surfaces the original error when there is no stale subscription to drop', async () => {
  const notification = {
    permission: 'default',
    requestPermission: async () => { notification.permission = 'granted'; return 'granted'; }
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => { throw new Error('Registration failed - push service error'); }
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  await assert.rejects(push.subscribe(), /Registration failed - push service error/);
});

test('retries a transient Chrome push service error without deleting subscriptions', async () => {
  const fresh = {
    endpoint: 'https://push.example/recovered',
    toJSON: () => ({ endpoint: 'https://push.example/recovered' })
  };
  const delays = [];
  let attempts = 0;
  const notification = {
    permission: 'granted',
    requestPermission: async () => 'granted'
  };

  const push = createPrimaPush({
    root: { PushManager() {} },
    wait: async delay => { delays.push(delay); },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => {
              attempts += 1;
              if (attempts < 3) throw new Error('Registration failed - push service error');
              return fresh;
            }
          }
        })
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  const result = await push.subscribe();

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [600, 1200]);
  assert.equal(result.code, 'active');
});

test('does not unregister the service worker on a persistent push service error', async () => {
  const delays = [];
  let attempts = 0;
  let unregisterCalled = false;
  const brokenRegistration = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => {
        attempts += 1;
        throw new Error('Registration failed - push service error');
      }
    },
    unregister: async () => { unregisterCalled = true; return true; }
  };
  const notification = {
    permission: 'granted',
    requestPermission: async () => 'granted'
  };
  const push = createPrimaPush({
    root: { PushManager() {} },
    wait: async delay => { delays.push(delay); },
    navigator: {
      serviceWorker: {
        ready: Promise.resolve(brokenRegistration),
        register: async () => brokenRegistration
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  await assert.rejects(push.subscribe(), /Registration failed - push service error/);

  assert.equal(attempts, 3, 'must exhaust transient retries before returning the original error');
  assert.deepEqual(delays, [600, 1200]);
  assert.equal(unregisterCalled, false, 'a push error must not remove the service worker');
});

test('re-registers the service worker when an update left no registration', async () => {
  const fresh = {
    endpoint: 'https://push.example/recovered-without-service-worker',
    toJSON: () => ({ endpoint: 'https://push.example/recovered-with-service-worker' })
  };
  let registerCalls = 0;
  let currentRegistration = null;
  const activeRegistration = {
    active: {},
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => fresh
    }
  };
  const notification = {
    permission: 'granted',
    requestPermission: async () => 'granted'
  };
  const push = createPrimaPush({
    root: { PushManager() {} },
    navigator: {
      serviceWorker: {
        ready: new Promise(() => {}),
        getRegistration: async () => currentRegistration,
        register: async () => {
          registerCalls += 1;
          currentRegistration = activeRegistration;
          return currentRegistration;
        }
      }
    },
    Notification: notification,
    fetch: async (url) => url === '/api/push-config'
      ? { ok: true, json: async () => ({ enabled: true, publicKey: 'AQIDBA' }) }
      : { ok: true, json: async () => ({ ok: true }) }
  });

  await push.init();
  const result = await push.subscribe();

  assert.equal(registerCalls, 1);
  assert.equal(result.code, 'active');
});

test('bounds an unresolved notification permission request', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'Izin Android tidak merespons.'),
    /Izin Android tidak merespons\./
  );
  assert.equal(await withTimeout(Promise.resolve('granted'), 50), 'granted');
});

test('app shell contains push onboarding controls and a fresh cache version', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pushClient = await readFile(new URL('../js/push.js', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

  assert.match(html, /data-push-onboarding(?:[\s=>]|$)/);
  assert.match(html, /data-push-onboarding-activate(?:[\s=>]|$)/);
  assert.match(html, /data-push-onboarding-later(?:[\s=>]|$)/);
  assert.match(pushClient, /prima_push_onboarding_v3/);
  assert.match(serviceWorker, /const CACHE = 'prima-v4\.12\.10'/);
});
