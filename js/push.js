export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decode = typeof atob === 'function'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  return Uint8Array.from([...decode].map(char => char.charCodeAt(0)));
}

export function withTimeout(promise, timeoutMs, message = 'Proses notifikasi terlalu lama.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// Compact environment fingerprint appended to activation failures. Push can
// fail inside a TWA while working in the same device's browser, and the error
// message alone does not say which engine or permission state produced it.
export function describePushEnvironment({ userAgent = '', permission = '?', standalone = false } = {}) {
  const chrome = /Chrome\/(\d+)/.exec(userAgent);
  const engine = / wv\b|\bwv\)/.test(userAgent)
    ? 'WebView'
    : chrome ? `Chrome ${chrome[1]}` : 'browser lain';
  return `${engine} · ${standalone ? 'TWA' : 'tab'} · izin:${permission}`;
}

const STATUS = {
  paused: { code: 'paused', label: 'Ditunda sementara', detail: 'Notifikasi akan diaktifkan setelah pembaruan aplikasi tersedia di Play Store.', action: '' },
  active: { code: 'active', label: 'Aktif', detail: 'Pengumuman penting akan dikirim ke perangkat ini.', action: 'Matikan notifikasi' },
  inactive: { code: 'inactive', label: 'Belum aktif', detail: 'Aktifkan agar tidak ketinggalan informasi terbaru Rawajati.', action: 'Aktifkan notifikasi' },
  // Android 13+ reports "denied" for a freshly installed app that has never
  // been asked, so this state is not evidence the user blocked anything.
  blocked: { code: 'blocked', label: 'Belum diizinkan', detail: 'Aktifkan agar pengumuman dan kegiatan kelurahan muncul di HP Anda.', action: 'Aktifkan notifikasi' },
  unsupported: { code: 'unsupported', label: 'Tidak didukung', detail: 'Perangkat atau browser ini belum mendukung Web Push.', action: '' },
  unconfigured: { code: 'unconfigured', label: 'Belum dikonfigurasi', detail: 'Layanan notifikasi belum diaktifkan oleh pengelola PRIMA.', action: '' }
};

export const PUSH_FEATURE_ENABLED = true;
export const PUSH_ONBOARDING_ENABLED = PUSH_FEATURE_ENABLED;
const PUSH_ONBOARDING_STORAGE_KEY = 'prima_push_onboarding_v3';

export function mapPushStatus(state = {}) {
  if (!state.supported) return STATUS.unsupported;
  if (!state.configured) return STATUS.unconfigured;
  if (state.permission === 'denied') return STATUS.blocked;
  if (state.permission === 'granted' && state.subscribed) return STATUS.active;
  return STATUS.inactive;
}

// "denied" is included on purpose: on Android 13+ a newly installed app holds
// POST_NOTIFICATIONS in that state until it asks, so gating on "default" alone
// hides the offer from exactly the users who still need to see it.
const OFFERABLE_STATUS = ['inactive', 'blocked'];
const OFFERABLE_PERMISSION = ['default', 'denied'];

export function shouldShowPushOnboarding({ statusCode, permission, seen, appReady = true, introVisible = false } = {}) {
  return OFFERABLE_STATUS.includes(statusCode)
    && OFFERABLE_PERMISSION.includes(permission)
    && seen !== true
    && appReady
    && !introVisible;
}

export function createPrimaPush(deps = {}) {
  const root = deps.root || (typeof window !== 'undefined' ? window : null);
  const fetchImpl = deps.fetch || root?.fetch?.bind(root);
  const navigatorObj = deps.navigator || root?.navigator;
  const notification = deps.Notification || root?.Notification;
  const wait = deps.wait || (delay => new Promise(resolve => setTimeout(resolve, delay)));
  let config = { enabled: false, publicKey: '' };
  let subscription = null;
  // Keep the registration prepared during startup. When permission is already
  // granted, subscribe() can call PushManager immediately from the click
  // instead of awaiting getRegistration() first. Chrome's push service uses
  // that transient user activation signal in a TWA.
  let readyRegistration = null;
  let onboardingTimer = null;
  let previousFocus = null;

  function supported() {
    return Boolean(root && notification && navigatorObj?.serviceWorker && root.PushManager);
  }

  function status() {
    if (!PUSH_FEATURE_ENABLED) return STATUS.paused;
    return mapPushStatus({
      supported: supported(),
      configured: config.enabled,
      permission: notification?.permission || 'default',
      subscribed: Boolean(subscription)
    });
  }

  function render() {
    if (!root?.document) return;
    const current = status();
    root.document.querySelectorAll('[data-push-status]').forEach(el => {
      el.textContent = current.label;
      el.dataset.state = current.code;
    });
    root.document.querySelectorAll('[data-push-detail]').forEach(el => { el.textContent = current.detail; });
    root.document.querySelectorAll('[data-push-action]').forEach(button => {
      button.hidden = !current.action;
      button.textContent = current.action;
      button.dataset.pushAction = current.code === 'active' ? 'unsubscribe' : 'subscribe';
      button.disabled = ['unsupported', 'unconfigured'].includes(current.code);
    });
  }

  function onboardingSeen() {
    try {
      const storage = Object.hasOwn(deps, 'storage') ? deps.storage : root?.localStorage;
      return storage?.getItem(PUSH_ONBOARDING_STORAGE_KEY) === 'seen';
    } catch {
      return false;
    }
  }

  function rememberOnboarding() {
    try {
      const storage = Object.hasOwn(deps, 'storage') ? deps.storage : root?.localStorage;
      storage?.setItem(PUSH_ONBOARDING_STORAGE_KEY, 'seen');
    } catch {
      // Private browsing/storage failures must not block notification controls.
    }
  }

  function closeOnboarding({ remember = true } = {}) {
    if (!root?.document) return;
    if (remember) rememberOnboarding();
    const overlay = root.document.querySelector('[data-push-onboarding]');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    root.document.body?.classList.remove('push-onboarding-open');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  function scheduleOnboarding(delay = 450) {
    if (!PUSH_ONBOARDING_ENABLED || !root?.document || onboardingTimer) return;
    const schedule = root.setTimeout?.bind(root) || setTimeout;
    onboardingTimer = schedule(() => {
      onboardingTimer = null;
      maybeShowOnboarding();
    }, delay);
  }

  function maybeShowOnboarding() {
    if (!PUSH_ONBOARDING_ENABLED || !root?.document) return false;
    const current = status();
    const onboardingState = {
      statusCode: current.code,
      permission: notification?.permission || 'default',
      seen: onboardingSeen()
    };
    if (!shouldShowPushOnboarding(onboardingState)) return false;

    const introVisible = Boolean(root.document.querySelector('#app-onboarding:not([hidden])'));
    const appReady = Boolean(root.document.body?.classList.contains('app-ready'));
    if (!shouldShowPushOnboarding({ ...onboardingState, appReady, introVisible })) {
      scheduleOnboarding();
      return false;
    }

    const overlay = root.document.querySelector('[data-push-onboarding]');
    if (!overlay || !overlay.hidden) return false;
    previousFocus = root.document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    root.document.body?.classList.add('push-onboarding-open');
    const focusPrimary = () => overlay.querySelector('[data-push-onboarding-activate]')?.focus();
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(focusPrimary);
    else focusPrimary();
    return true;
  }

  async function registration() {
    return navigatorObj.serviceWorker.ready;
  }

  async function ensureRegistration() {
    const serviceWorker = navigatorObj?.serviceWorker;
    try {
      const existing = await serviceWorker?.getRegistration?.();
      if (existing) return existing;
    } catch {
      // Fall through to the normal ready/register path.
    }
    if (typeof serviceWorker?.register === 'function') {
      const created = await serviceWorker.register('sw.js', { updateViaCache: 'none' });
      if (created) return created;
    }
    return registration();
  }

  async function init() {
    if (!PUSH_FEATURE_ENABLED) {
      closeOnboarding({ remember: false });
      render();
      return status();
    }
    if (!supported()) { render(); scheduleOnboarding(); return status(); }
    try {
      const response = await fetchImpl('/api/push-config', { cache: 'no-store' });
      const payload = await response.json();
      config = { enabled: Boolean(payload.enabled), publicKey: String(payload.publicKey || '') };
      if (config.enabled) {
        readyRegistration = await ensureRegistration();
        subscription = await readyRegistration.pushManager.getSubscription();
      }
    } catch {
      config = { enabled: false, publicKey: '' };
    }
    render();
    scheduleOnboarding();
    return status();
  }

  // Chrome refuses to register a new applicationServerKey while a subscription
  // created with an older VAPID key still exists, failing with "Registration
  // failed". Drop the stale one and retry once.
  async function subscribeFresh(reg) {
    const params = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey)
    };
    const isPushServiceError = error => /push service error|could not connect to push server/i.test(String(error?.message));

    async function registerWithPushServiceRetry(registration) {
      const delays = [600, 1200];
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await registration.pushManager.subscribe(params);
        } catch (error) {
          if (!isPushServiceError(error) || attempt >= delays.length) throw error;
          await wait(delays[attempt]);
        }
      }
    }

    try {
      return await registerWithPushServiceRetry(reg);
    } catch (error) {
      // Only a key conflict justifies discarding an existing subscription.
      // Doing it on any failure would destroy a working one — the browser tab
      // and the TWA share it — and leave the user worse off than before.
      if (!/applicationServerKey|gcm_sender_id/i.test(String(error?.message))) throw error;
      const stale = await reg.pushManager.getSubscription();
      if (!stale) throw error;
      await stale.unsubscribe();
      return registerWithPushServiceRetry(reg);
    }
  }

  async function subscribe(options = {}) {
    if (!PUSH_FEATURE_ENABLED) return status();
    if (!supported() || !config.enabled) return status();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    // If Android permission is already granted, do not await another promise
    // before PushManager.subscribe(). This preserves the click's transient
    // user activation required by recent Chrome versions.
    let permission = notification.permission;
    if (permission !== 'granted') {
      onProgress('Meminta izin Android...');
      permission = await withTimeout(
        notification.requestPermission(),
        15000,
        'Izin Android tidak merespons. Buka Pengaturan HP > Aplikasi > PRIMA > Notifikasi > Izinkan, lalu coba lagi.'
      );
    }
    if (permission !== 'granted') { render(); return status(); }
    onProgress('Menyiapkan notifikasi...');
    const reg = readyRegistration || await withTimeout(
      ensureRegistration(),
      10000,
      'Service worker notifikasi belum siap. Coba tutup dan buka kembali PRIMA.'
    );
    if (!subscription) {
      // subscribeFresh() is invoked before the first await in this branch, so
      // PushManager.subscribe() still runs inside the user's click gesture.
      subscription = await withTimeout(
        subscribeFresh(reg),
        15000,
        'Pendaftaran notifikasi tidak selesai. Periksa koneksi lalu coba lagi.'
      );
    }
    onProgress('Menyimpan perangkat...');
    const response = await withTimeout(fetchImpl('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON ? subscription.toJSON() : subscription)
    }), 15000, 'Server notifikasi tidak merespons. Coba lagi beberapa saat.');
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Gagal menyimpan notifikasi.');
    render();
    return status();
  }

  async function unsubscribe() {
    if (!subscription) return status();
    const data = subscription.toJSON ? subscription.toJSON() : subscription;
    await fetchImpl('/api/push-subscriptions', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    }).catch(() => null);
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
    render();
    return status();
  }

  function environmentTag() {
    return describePushEnvironment({
      userAgent: navigatorObj?.userAgent || '',
      permission: notification?.permission || '?',
      standalone: Boolean(root?.matchMedia?.('(display-mode: standalone)')?.matches)
    });
  }

  // Push registration can fail in a TWA while succeeding in a browser tab on
  // the same profile. These are the facts that tell those cases apart.
  async function collectDiagnostics() {
    const facts = [environmentTag()];
    try {
      const reg = await navigatorObj.serviceWorker.getRegistration();
      facts.push(`sw:${reg ? (reg.active ? 'aktif' : 'belum-aktif') : 'tidak-ada'}`);
      facts.push(`kendali:${navigatorObj.serviceWorker.controller ? 'ya' : 'tidak'}`);
      if (reg) {
        const existing = await reg.pushManager.getSubscription();
        facts.push(`langganan:${existing ? 'ada' : 'kosong'}`);
      }
    } catch {
      facts.push('sw:error');
    }
    try {
      const state = await navigatorObj.permissions.query({ name: 'notifications' });
      facts.push(`query:${state.state}`);
    } catch {
      facts.push('query:n/a');
    }
    return facts.join(' · ');
  }

  function showBlockedHelp() {
    const message = 'Buka Pengaturan aplikasi PRIMA → Notifikasi → Izinkan notifikasi.';
    if (typeof root?.showToast === 'function') root.showToast(message);
    else root?.alert?.(message);
  }

  async function handleAction(event) {
    const action = event.currentTarget?.dataset.pushAction;
    event.currentTarget.disabled = true;
    try {
      if (action === 'unsubscribe') {
        await unsubscribe();
      } else {
        // Always attempt the request first. Only a refusal that survives the
        // prompt earns the "go to system settings" instructions.
        const current = await subscribe();
        if (current.code === 'blocked') showBlockedHelp();
      }
    } catch (error) {
      const detail = `${error.name || 'Error'}: ${error.message}\n${await collectDiagnostics()}`;
      if (typeof root?.showToast === 'function') root.showToast(`❌ ${detail}`, 20000);
    } finally {
      event.currentTarget.disabled = false;
      render();
    }
  }

  async function handleOnboardingActivate(event) {
    const button = event.currentTarget;
    const buttonLabel = button.querySelector('span');
    const description = root?.document?.querySelector('#push-onboarding-description');
    const defaultDescription = 'Aktifkan notifikasi agar pengumuman dan kegiatan terbaru Kelurahan Rawajati langsung muncul di HP Anda.';
    button.disabled = true;
    if (description) description.textContent = defaultDescription;
    let completed = false;
    try {
      const current = await subscribe({
        onProgress: label => { if (buttonLabel) buttonLabel.textContent = label; }
      });
      completed = ['active', 'blocked'].includes(current.code);
      if (current.code === 'blocked') showBlockedHelp();
      if (completed) {
        rememberOnboarding();
        closeOnboarding({ remember: false });
      }
    } catch (error) {
      const detail = `${error.name || 'Error'}: ${error.message}\n${await collectDiagnostics()}`;
      if (description) description.textContent = detail;
      if (typeof root?.showToast === 'function') root.showToast(`Gagal: ${detail}`, 20000);
    } finally {
      button.disabled = false;
      if (buttonLabel) buttonLabel.textContent = completed ? 'Aktif' : 'Coba lagi';
      render();
    }
  }

  function bindOnboarding() {
    if (!root?.document) return;
    const activate = root.document.querySelector('[data-push-onboarding-activate]');
    const later = root.document.querySelector('[data-push-onboarding-later]');
    if (activate && !activate.dataset.pushOnboardingBound) {
      activate.dataset.pushOnboardingBound = '1';
      activate.addEventListener('click', handleOnboardingActivate);
    }
    if (later && !later.dataset.pushOnboardingBound) {
      later.dataset.pushOnboardingBound = '1';
      later.addEventListener('click', () => closeOnboarding());
    }
    const page = root.document.documentElement;
    if (page && !page.dataset.pushOnboardingKeysBound) {
      page.dataset.pushOnboardingKeysBound = '1';
      root.document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !root.document.querySelector('[data-push-onboarding]')?.hidden) closeOnboarding();
      });
    }
  }

  function bind() {
    root?.document?.querySelectorAll('[data-push-action]').forEach(button => {
      if (button.dataset.pushBound) return;
      button.dataset.pushBound = '1';
      button.addEventListener('click', handleAction);
    });
    bindOnboarding();
  }

  return { init, subscribe, unsubscribe, getStatus: status, render, bind, maybeShowOnboarding };
}

if (typeof window !== 'undefined') {
  window.PRIMA_PUSH = createPrimaPush();
  const start = () => { window.PRIMA_PUSH.bind(); window.PRIMA_PUSH.init(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
