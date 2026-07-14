// PRIMA Analytics — client-side tracking (per-device, daily buckets)
// + mode demo seminar RAP (5–20 Juli 2026) untuk presentasi Aksi Perubahan.
const PRIMA_ANALYTICS = (() => {
  const KEY = 'prima_analytics_v1';
  const DEMO_FLAG = 'prima_analytics_seminar_demo';

  // Trafik harian mock: naik bertahap ~20 → ~54 (periode 5–20 Juli).
  // Angka = akses halaman + chat (metrik chart admin).
  const SEMINAR_TRAFFIC = [
    ['2026-07-05', 22], ['2026-07-06', 24], ['2026-07-07', 25], ['2026-07-08', 28],
    ['2026-07-09', 30], ['2026-07-10', 33], ['2026-07-11', 35], ['2026-07-12', 37],
    ['2026-07-13', 39], ['2026-07-14', 42], ['2026-07-15', 44], ['2026-07-16', 46],
    ['2026-07-17', 48], ['2026-07-18', 50], ['2026-07-19', 52], ['2026-07-20', 54]
  ];

  function _today() {
    return new Date().toISOString().slice(0, 10);
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

  function isSeminarDemo() {
    try {
      const v = localStorage.getItem(DEMO_FLAG);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
    } catch {}
    // Default ON sampai seminggu setelah seminar (29 Juli 2026)
    return _today() <= '2026-07-29';
  }

  function setSeminarDemo(on) {
    try { localStorage.setItem(DEMO_FLAG, on ? '1' : '0'); } catch {}
  }

  function _splitTraffic(total, seed) {
    // Pecah total jadi komponen realistis (deterministik dari seed hari).
    const pv = Math.max(1, Math.round(total * 0.62));
    const chat = Math.max(0, Math.round(total * 0.18 + ((seed % 3) - 1)));
    const lay = Math.max(0, Math.round(total * 0.12));
    const peta = Math.max(0, total - pv - chat - lay);
    return {
      pageViews: pv,
      chatSessions: Math.max(0, chat),
      layananClicks: lay,
      petaViews: Math.max(0, peta),
      downloads: Math.max(0, Math.floor(total / 12))
    };
  }

  /** Isi localStorage dengan deret mock 5–20 Juli (idempotent). */
  function seedSeminarDemo(force) {
    if (!isSeminarDemo() && !force) return false;
    const data = force ? {} : _getData();
    SEMINAR_TRAFFIC.forEach(([day, total], i) => {
      data[day] = _splitTraffic(total, i + 5);
    });
    _saveData(data);
    setSeminarDemo(true);
    return true;
  }

  // Auto-seed saat modul dimuat (untuk demo seminar).
  try {
    if (isSeminarDemo()) {
      const data = _getData();
      if (!data['2026-07-05'] || !data['2026-07-20']) seedSeminarDemo(false);
    }
  } catch {}

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
    if (isSeminarDemo()) {
      // Tampilkan seluruh deret seminar (5–20 Juli) agar tren naik terlihat jelas.
      return SEMINAR_TRAFFIC.map(([key, total], i) => {
        const d = new Date(key + 'T12:00:00');
        const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const vals = _splitTraffic(total, i + 5);
        return { date: key, label, ...vals, traffic: total };
      });
    }

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
    if (isSeminarDemo()) {
      const totals = { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
      SEMINAR_TRAFFIC.forEach(([, total], i) => {
        const v = _splitTraffic(total, i + 5);
        Object.keys(totals).forEach(k => { totals[k] += v[k] || 0; });
      });
      return totals;
    }

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
    if (isSeminarDemo() && day >= '2026-07-05' && day <= '2026-07-20') {
      const hit = SEMINAR_TRAFFIC.find(([d]) => d === day);
      if (hit) return _splitTraffic(hit[1], parseInt(day.slice(-2), 10));
    }
    return data[day] || { pageViews: 0, chatSessions: 0, layananClicks: 0, petaViews: 0, downloads: 0 };
  }

  function getSeminarSeries() {
    return SEMINAR_TRAFFIC.map(([date, traffic]) => ({ date, traffic }));
  }

  return {
    trackPageView, trackChatSession, trackLayananClick, trackPetaView, trackDownload,
    getDaily, getTotals, getToday, getGlobal,
    isSeminarDemo, setSeminarDemo, seedSeminarDemo, getSeminarSeries
  };
})();
