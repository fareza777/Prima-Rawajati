export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decode = typeof atob === 'function'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  return Uint8Array.from([...decode].map(char => char.charCodeAt(0)));
}

const STATUS = {
  active: { code: 'active', label: 'Aktif', detail: 'Pengumuman penting akan dikirim ke perangkat ini.', action: 'Matikan notifikasi' },
  inactive: { code: 'inactive', label: 'Belum aktif', detail: 'Aktifkan agar tidak ketinggalan informasi terbaru Rawajati.', action: 'Aktifkan notifikasi' },
  blocked: { code: 'blocked', label: 'Diblokir di pengaturan', detail: 'Izinkan notifikasi PRIMA melalui pengaturan aplikasi atau browser.', action: 'Lihat petunjuk' },
  unsupported: { code: 'unsupported', label: 'Tidak didukung', detail: 'Perangkat atau browser ini belum mendukung Web Push.', action: '' },
  unconfigured: { code: 'unconfigured', label: 'Belum dikonfigurasi', detail: 'Layanan notifikasi belum diaktifkan oleh pengelola PRIMA.', action: '' }
};

export function mapPushStatus(state = {}) {
  if (!state.supported) return STATUS.unsupported;
  if (!state.configured) return STATUS.unconfigured;
  if (state.permission === 'denied') return STATUS.blocked;
  if (state.permission === 'granted' && state.subscribed) return STATUS.active;
  return STATUS.inactive;
}

export function createPrimaPush(deps = {}) {
  const root = deps.root || (typeof window !== 'undefined' ? window : null);
  const fetchImpl = deps.fetch || root?.fetch?.bind(root);
  const navigatorObj = deps.navigator || root?.navigator;
  const notification = deps.Notification || root?.Notification;
  let config = { enabled: false, publicKey: '' };
  let subscription = null;

  function supported() {
    return Boolean(root && notification && navigatorObj?.serviceWorker && root.PushManager);
  }

  function status() {
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

  async function registration() {
    return navigatorObj.serviceWorker.ready;
  }

  async function init() {
    if (!supported()) { render(); return status(); }
    try {
      const response = await fetchImpl('/api/push-config', { cache: 'no-store' });
      const payload = await response.json();
      config = { enabled: Boolean(payload.enabled), publicKey: String(payload.publicKey || '') };
      if (config.enabled) subscription = await (await registration()).pushManager.getSubscription();
    } catch {
      config = { enabled: false, publicKey: '' };
    }
    render();
    return status();
  }

  async function subscribe() {
    if (!supported() || !config.enabled) return status();
    const permission = await notification.requestPermission();
    if (permission !== 'granted') { render(); return status(); }
    const reg = await registration();
    subscription = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey)
    });
    const response = await fetchImpl('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON ? subscription.toJSON() : subscription)
    });
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

  function bind() {
    root?.document?.querySelectorAll('[data-push-action]').forEach(button => {
      if (button.dataset.pushBound) return;
      button.dataset.pushBound = '1';
      button.addEventListener('click', handleAction);
    });
  }

  return { init, subscribe, unsubscribe, getStatus: status, render, bind };
}

if (typeof window !== 'undefined') {
  window.PRIMA_PUSH = createPrimaPush();
  const start = () => { window.PRIMA_PUSH.bind(); window.PRIMA_PUSH.init(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
