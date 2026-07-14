// PRIMA Analytics — client-side tracking (per-device, daily buckets)
// Stores in localStorage. Can be upgraded to server-side later.
const PRIMA_ANALYTICS = (() => {
  const KEY = 'prima_analytics_v1';

  function _today() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function _getData() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch { return {}; }
  }

  function _saveData(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }

  function _ensureDay(data, day) {
    if (!data[day]) data[day] = { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
    return data;
  }

  function track(eventType) {
    // 1) Simpan lokal (backup + tampilan instan tanpa jaringan)
    const data = _getData();
    const day = _today();
    _ensureDay(data, day);
    if (data[day][eventType] !== undefined) data[day][eventType]++;
    _saveData(data);
    // 2) Kirim ke server agar terhitung GLOBAL (semua pengguna).
    //    Fire-and-forget; kalau backend belum dikonfigurasi, diabaikan diam-diam.
    try {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventType }),
        keepalive: true
      }).catch(() => {});
    } catch {}
  }

  function _labelFor(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
  }

  // Ambil analytics GLOBAL dari server. Mengembalikan
  // { configured:true, totals, daily:[{date,label,...}] } bila backend aktif,
  // atau null bila belum dikonfigurasi / gagal (pemanggil fallback ke lokal).
  async function getGlobal(days = 14) {
    try {
      const r = await fetch('/api/analytics?days=' + days, { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !j.ok || !j.configured) return null;
      const daily = (j.daily || []).map(d => ({ ...d, label: _labelFor(d.date) }));
      return { configured: true, totals: j.totals || {}, daily };
    } catch { return null; }
  }

  function trackPageView() { track('pageViews'); }
  function trackChatSession() { track('chatSessions'); }
  function trackLayananClick() { track('layananClicks'); }
  function trackPetaView() { track('petaViews'); }
  function trackDownload() { track('downloads'); }

  function getDaily(days = 7) {
    const data = _getData();
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      const vals = data[key] || { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
      out.push({ date: key, label, ...vals });
    }
    return out;
  }

  function getTotals() {
    const data = _getData();
    const totals = { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
    Object.values(data).forEach(day => {
      Object.keys(totals).forEach(k => { totals[k] += (day[k] || 0); });
    });
    return totals;
  }

  function getToday() {
    const data = _getData();
    const day = _today();
    return data[day] || { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
  }

  return { trackPageView, trackChatSession, trackLayananClick, trackPetaView, trackDownload, getDaily, getTotals, getToday, getGlobal };
})();
