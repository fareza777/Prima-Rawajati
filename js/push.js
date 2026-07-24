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

const STATUS = {
  paused: { code: 'paused', label: 'Ditunda sementara', detail: 'Notifikasi akan diaktifkan setelah pembaruan aplikasi tersedia di Play Store.', action: '' },
  active: { code: 'active', label: 'Aktif', detail: 'Pengumuman penting akan dikirim ke perangkat ini.', action: 'Matikan notifikasi' },
  inactive: { code: 'inactive', label: 'Belum aktif', detail: 'Aktifkan agar tidak ketinggalan informasi terbaru Rawajati.', action: 'Aktifkan notifikasi' },
  blocked: { code: 'blocked', label: 'Diblokir di pengaturan', detail: 'Izinkan notifikasi PRIMA melalui pengaturan aplikasi atau browser.', action: 'Lihat petunjuk' },
  unsupported: { code: 'unsupported', label: 'Tidak didukung', detail: 'Perangkat atau browser ini belum mendukung Web Push.', action: '' },
  unconfigured: { code: 'unconfigured', label: 'Belum dikonfigurasi', detail: 'Layanan notifikasi belum diaktifkan oleh pengelola PRIMA.', action: '' }
};

export const PUSH_FEATURE_ENABLED = false;
export const PUSH_ONBOARDING_ENABLED = PUSH_FEATURE_ENABLED;
const PUSH_ONBOARDING_STORAGE_KEY = 'prima_push_onboarding_v3';

export function mapPushStatus(state = {}) {
  if (!state.supported) return STATUS.unsupported;
  if (!state.configured) return STATUS.unconfigured;
  if (state.permission === 'denied') return STATUS.blocked;
  if (state.permission === 'granted' && state.subscribed) return STATUS.active;
  return STATUS.inactive;
}

export function shouldShowPushOnboarding({ statusCode, permission, seen, appReady = true, introVisible = false } = {}) {
  return statusCode === 'inactive'
    && permission === 'default'
    && seen !== true
    && appReady
    && !introVisible;
}

export function createPrimaPush(deps = {}) {
  const root = deps.root || (typeof window !== 'undefined' ? window : null);
  const fetchImpl = deps.fetch || root?.fetch?.bind(root);
  const navigatorObj = deps.navigator || root?.navigator;
  const notification = deps.Notification || root?.Notification;
  let config = { enabled: false, publicKey: '' };
  let subscription = null;
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
      button.dataset.pushAction = current.code === 'active' ? 'unsubscribe' : current.code === 'blocked' ? 'help' : 'subscribe';
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
      if (config.enabled) subscription = await (await registration()).pushManager.getSubscription();
    } catch {
      config = { enabled: false, publicKey: '' };
    }
    render();
    scheduleOnboarding();
    return status();
  }

  async function subscribe(options = {}) {
    if (!PUSH_FEATURE_ENABLED) return status();
    if (!supported() || !config.enabled) return status();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    onProgress('Meminta izin Android...');
    const permission = await withTimeout(
      notification.requestPermission(),
      15000,
      'Izin Android tidak merespons. Buka Pengaturan HP > Aplikasi > PRIMA > Notifikasi > Izinkan, lalu coba lagi.'
    );
    if (permission !== 'granted') { render(); return status(); }
    onProgress('Menyiapkan notifikasi...');
    const reg = await withTimeout(registration(), 10000, 'Service worker notifikasi belum siap. Coba tutup dan buka kembali PRIMA.');
    subscription = await reg.pushManager.getSubscription() || await withTimeout(
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey)
      }),
      15000,
      'Pendaftaran notifikasi tidak selesai. Periksa koneksi lalu coba lagi.'
    );
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

  function showBlockedHelp() {
    const message = 'Buka Pengaturan aplikasi PRIMA → Notifikasi → Izinkan notifikasi.';
    if (typeof root?.showToast === 'function') root.showToast(message);
    else root?.alert?.(message);
  }

  async function handleAction(event) {
    const action = event.currentTarget?.dataset.pushAction;
    event.currentTarget.disabled = true;
    try {
      if (action === 'unsubscribe') await unsubscribe();
      else if (action === 'help') showBlockedHelp();
      else await subscribe();
    } catch (error) {
      if (typeof root?.showToast === 'function') root.showToast(`❌ ${error.message}`);
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
      if (completed) {
        rememberOnboarding();
        closeOnboarding({ remember: false });
      }
    } catch (error) {
      if (description) description.textContent = error.message;
      if (typeof root?.showToast === 'function') root.showToast(`Gagal: ${error.message}`);
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
