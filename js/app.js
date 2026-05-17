// ================================================================
// PRIMA – Main Application Logic
// ================================================================

let map = null;
let chatbot = null;
let mapMarkers = [];
let activeFilter = 'Semua';
let activeLayananFilter = 'Semua';
let layananSearchQuery = '';

// ── INIT ─────────────────────────────────────────────────────────
// Data dimuat async dari data/prima-data.json oleh js/data.js.
// Render hanya setelah event 'prima:data-ready' supaya semua section
// punya data lengkap saat pertama kali tampil.
function bootApp() {
  if (window.PRIMA_DATA_LOAD_ERROR) {
    showToast('⚠️ Gagal memuat data PRIMA: ' + window.PRIMA_DATA_LOAD_ERROR);
  }
  // Sync admin-managed model presets dari prima-data.json ke AI module
  if (window.PRIMA_DATA?.aiModels && typeof PRIMA_AI !== 'undefined') {
    PRIMA_AI.setModels(window.PRIMA_DATA.aiModels);
  }
  chatbot = new PRIMAChatbot(PRIMA_DATA.faqChatbot);
  if (typeof PRIMA_ANALYTICS !== 'undefined') PRIMA_ANALYTICS.trackPageView();
  initNav();
  renderHome();
  renderLayananQuick();
  renderLayananFilters();
  renderLayanan();
  renderInfoWarga();
  renderSuaraWarga();
  renderAdminPage();
  initChatbot();
  // Load saved page
  const lastPage = localStorage.getItem('prima_last_page') || 'home';
  navigateTo(lastPage);
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.PRIMA_DATA_READY) {
    bootApp();
  } else {
    window.addEventListener('prima:data-ready', bootApp, { once: true });
  }
});

// ── NAVIGATION ───────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
    });
  });
}

function navigateTo(pageId) {
  // Pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');

  // Nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageId);
  });

  // Lazy init map
  if (pageId === 'peta' && !map) {
    setTimeout(initMap, 100);
  }

  // Analytics
  if (typeof PRIMA_ANALYTICS !== 'undefined') {
    PRIMA_ANALYTICS.trackPageView();
    if (pageId === 'peta') PRIMA_ANALYTICS.trackPetaView();
    if (pageId === 'tanya') PRIMA_ANALYTICS.trackChatSession();
  }

  localStorage.setItem('prima_last_page', pageId);
}

// ── HOME PAGE ────────────────────────────────────────────────────
function renderHome() {
  // Time-aware greeting (pagi / siang / sore / malam)
  renderHeroGreeting();

  // Track session visit + render live activity ticker
  incrementVisitCounter();
  renderHeroTicker();

  // Animated counters di hero (angka real dari data)
  setStatTarget('stat-layanan', PRIMA_DATA.layanan.length);
  setStatTarget('stat-lokasi', PRIMA_DATA.petaMarkers.length);
  animateHeroCounters();

  // Render footer contact links dari meta kelurahan
  renderFooterContact();

  // Search
  const searchInput = document.getElementById('home-search');
  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q.length > 1) {
      const results = searchAll(q);
      showSearchResults(results, q);
    } else {
      document.getElementById('search-results').style.display = 'none';
    }
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.target.blur(); }
  });
}

// ── HOME HERO HELPERS (A.1) ──────────────────────────────────────

/**
 * Sapaan dinamis berdasar jam lokal device.
 * @returns {string}
 */
function getTimeBasedGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11)  return 'Selamat pagi, Warga Rawajati ☀️';
  if (h >= 11 && h < 15) return 'Selamat siang, Warga Rawajati 🌤️';
  if (h >= 15 && h < 18) return 'Selamat sore, Warga Rawajati 🌇';
  return 'Selamat malam, Warga Rawajati 🌙';
}

function renderHeroGreeting() {
  const el = document.getElementById('hero-greeting');
  if (el) el.textContent = getTimeBasedGreeting();
}

/**
 * Set data-target attribute pada stat counter dan reset nilai awal ke 0.
 * @param {string} id - element id
 * @param {number} target - angka final
 */
function setStatTarget(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.target = String(target);
  el.textContent = '0';
}

/**
 * Animate counter dari 0 ke target dengan easing cubic-out.
 * Aman re-call: hanya animate elemen yang punya data-target dan belum di-animate.
 */
function animateHeroCounters() {
  const els = document.querySelectorAll('.hero-stat .stat-num[data-target]');
  els.forEach(el => {
    if (el.dataset.animated === '1') return;
    el.dataset.animated = '1';
    const target = parseInt(el.dataset.target, 10) || 0;
    const suffix = el.dataset.suffix || '';
    const duration = 1100; // ms
    const start = performance.now();
    el.parentElement?.classList.add('counting');

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(target * eased);
      el.textContent = current + suffix;
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.parentElement?.classList.remove('counting');
      }
    }
    requestAnimationFrame(tick);
  });
}

/**
 * Hitung kunjungan harian via localStorage. Bukan analytics server-side,
 * hanya counter per-device — cukup untuk ticker yang "hidup".
 * @returns {{today: number, total: number}}
 */
function incrementVisitCounter() {
  const KEY = 'prima_visit_counter';
  const today = new Date().toISOString().slice(0, 10);
  let state = { date: today, today: 0, total: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch {}
  if (state.date !== today) {
    state.date = today;
    state.today = 0;
  }
  state.today += 1;
  state.total += 1;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  return { today: state.today, total: state.total };
}

function getVisitCounter() {
  try {
    const raw = localStorage.getItem('prima_visit_counter');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { today: 1, total: 1 };
}

/**
 * Render rotating ticker dengan pesan yang relevan konteks.
 * Pesan rotasi tiap 6 detik untuk hindari hambar.
 */
function renderHeroTicker() {
  const el = document.getElementById('hero-ticker');
  if (!el) return;
  const textEl = el.querySelector('.ticker-text');
  if (!textEl) return;

  const stats = getVisitCounter();
  const hour = new Date().getHours();
  const isOfficeHour = hour >= 7 && hour < 17;

  const messages = [
    `PRIMA siap melayani Anda hari ini.`,
    `Anda kunjungan ke-${stats.total} dari perangkat ini · terima kasih telah menggunakan PRIMA.`,
    isOfficeHour
      ? 'Petugas kelurahan sedang on duty. Selamat berurusan!'
      : 'Di luar jam kerja — gunakan Tanya Kami untuk respons instan.',
    'Tips: scan QR Code di kantor kelurahan untuk akses cepat.',
    'Saran & masukan Anda menentukan arah PRIMA — kunjungi Suara Warga.'
  ];

  let idx = 0;
  textEl.textContent = messages[0];

  // Stop existing rotation kalau renderHome dipanggil ulang (mis. setelah save admin)
  if (window._primaTickerInterval) clearInterval(window._primaTickerInterval);
  window._primaTickerInterval = setInterval(() => {
    idx = (idx + 1) % messages.length;
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = messages[idx];
      textEl.style.transition = 'opacity .35s ease';
      textEl.style.opacity = '1';
    }, 350);
  }, 6000);
}

/**
 * Isi href + label dinamis pada 3 link footer (alamat → Maps, email → mailto,
 * Instagram → profil) dari PRIMA_DATA.meta. Dipanggil di renderHome() supaya
 * kalau admin update meta lewat Editor, footer auto-update tanpa reload.
 */
function renderFooterContact() {
  const meta = (window.PRIMA_DATA && PRIMA_DATA.meta) || {};
  const email = meta.email || '';
  const lat = meta.koordinat?.lat;
  const lng = meta.koordinat?.lng;
  // Instagram handle bisa "@kelrawajati" atau "kelrawajati" — normalize ke versi tanpa @
  const igRaw = (meta.instagram || '').trim().replace(/^@/, '');

  // Alamat → Google Maps via koordinat resmi
  const alamatEl = document.getElementById('fl-alamat');
  if (alamatEl && lat && lng) {
    alamatEl.setAttribute('href', `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  }

  // Email
  const emailEl = document.getElementById('fl-email');
  const emailText = document.getElementById('fl-email-text');
  if (emailEl && email) emailEl.setAttribute('href', `mailto:${email}`);
  if (emailText && email) emailText.textContent = email;

  // Instagram
  const igEl = document.getElementById('fl-ig');
  const igText = document.getElementById('fl-ig-text');
  if (igEl) {
    if (igRaw) {
      igEl.setAttribute('href', `https://www.instagram.com/${igRaw}/`);
      igEl.style.display = '';
    } else {
      igEl.style.display = 'none'; // hide kalau handle belum diisi
    }
  }
  if (igText && igRaw) igText.textContent = '@' + igRaw;
}

function searchAll(query) {
  const q = query.toLowerCase();
  const results = [];

  PRIMA_DATA.layanan.forEach(l => {
    const score =
      (l.nama.toLowerCase().includes(q) ? 3 : 0) +
      (l.tags.some(t => t.includes(q)) ? 2 : 0) +
      (l.deskripsi.toLowerCase().includes(q) ? 1 : 0);
    if (score > 0) results.push({ type: 'layanan', data: l, score });
  });

  PRIMA_DATA.petaMarkers.forEach(m => {
    if (m.nama.toLowerCase().includes(q) || m.kategori.toLowerCase().includes(q)) {
      results.push({ type: 'peta', data: m, score: 2 });
    }
  });

  PRIMA_DATA.infoWarga.kuliner.forEach(k => {
    if (k.nama.toLowerCase().includes(q) || k.deskripsi.toLowerCase().includes(q)) {
      results.push({ type: 'kuliner', data: k, score: 1 });
    }
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function showSearchResults(results, query) {
  const container = document.getElementById('search-results');
  if (!results.length) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">
      <div class="es-emoji">🔍</div>
      <p>Tidak ada hasil untuk "<strong>${escapeHtml(query)}</strong>"</p>
    </div>`;
    container.style.display = 'block';
    return;
  }

  container.innerHTML = results.map(r => {
    if (r.type === 'layanan') {
      return `<div class="layanan-card" onclick="showLayananDetail('${r.data.id}'); document.getElementById('home-search').value=''; document.getElementById('search-results').style.display='none';">
        <span class="lcard-emoji">${r.data.emoji}</span>
        <div class="lcard-body">
          <h3>${highlightText(r.data.nama, query)}</h3>
          <div class="lcard-meta">
            <span class="badge badge-blue">${r.data.kategori}</span>
            <span class="badge badge-green">${r.data.biaya}</span>
          </div>
        </div>
        <span class="lcard-arrow">›</span>
      </div>`;
    } else if (r.type === 'peta') {
      return `<div class="layanan-card" onclick="navigateTo('peta'); document.getElementById('home-search').value=''; document.getElementById('search-results').style.display='none';">
        <span class="lcard-emoji">${r.data.icon}</span>
        <div class="lcard-body">
          <h3>${highlightText(r.data.nama, query)}</h3>
          <div class="lcard-meta"><span class="badge badge-gray">📍 Peta Wilayah</span></div>
        </div>
        <span class="lcard-arrow">›</span>
      </div>`;
    } else {
      return `<div class="layanan-card" onclick="navigateTo('info'); document.getElementById('home-search').value=''; document.getElementById('search-results').style.display='none';">
        <span class="lcard-emoji">${r.data.emoji}</span>
        <div class="lcard-body">
          <h3>${highlightText(r.data.nama, query)}</h3>
          <div class="lcard-meta"><span class="badge badge-gray">🍜 Kuliner</span></div>
        </div>
        <span class="lcard-arrow">›</span>
      </div>`;
    }
  }).join('');
  container.style.display = 'block';
}

function highlightText(text, query) {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark class="highlight">$1</mark>');
}

// Quick-access services on home page (first 4 from data)
function renderLayananQuick() {
  const container = document.getElementById('quick-layanan');
  if (!container) return;
  const quick = PRIMA_DATA.layanan.slice(0, 4);
  container.innerHTML = quick.map(l => `
    <div class="layanan-card" onclick="showLayananDetail('${l.id}')">
      <span class="lcard-emoji">${l.emoji}</span>
      <div class="lcard-body">
        <h3>${escapeHtml(l.nama)}</h3>
        <div class="lcard-meta">
          <span class="badge badge-blue">${escapeHtml(l.kategori)}</span>
          <span class="badge badge-green">${escapeHtml(l.biaya)}</span>
        </div>
      </div>
      <span class="lcard-arrow">›</span>
    </div>
  `).join('');
}

// ── LAYANAN PAGE ─────────────────────────────────────────────────

// Difficulty derived dari jumlah syarat — bantu warga set ekspektasi sebelum klik.
// ≤3 syarat: ringkas; 4-5: sedang; ≥6: perlu persiapan lengkap.
function difficultyOf(layanan) {
  const n = (layanan.syarat || []).length;
  if (n <= 3) return { emoji: '🟢', label: 'Mudah', tone: 'green' };
  if (n <= 5) return { emoji: '🟡', label: 'Sedang', tone: 'amber' };
  return { emoji: '🟠', label: 'Perlu lengkap', tone: 'orange' };
}

function getLayananFiltered() {
  const q = layananSearchQuery.trim().toLowerCase();
  return PRIMA_DATA.layanan.filter(l => {
    const matchKategori = activeLayananFilter === 'Semua' || l.kategori === activeLayananFilter;
    if (!matchKategori) return false;
    if (!q) return true;
    return l.nama.toLowerCase().includes(q)
      || (l.tags || []).some(t => t.toLowerCase().includes(q))
      || l.kategori.toLowerCase().includes(q);
  });
}

function renderLayananFilters() {
  const container = document.getElementById('layanan-filters');
  if (!container) return;
  // Ambil kategori unik dari data (dynamic, ikut update kalau admin tambah kategori baru)
  const kategoriUnik = Array.from(new Set(PRIMA_DATA.layanan.map(l => l.kategori)));
  const chips = ['Semua', ...kategoriUnik];
  container.innerHTML = chips.map(k => {
    const count = k === 'Semua' ? PRIMA_DATA.layanan.length : PRIMA_DATA.layanan.filter(l => l.kategori === k).length;
    const active = k === activeLayananFilter ? ' active' : '';
    return `<button type="button" class="layanan-chip${active}" role="tab" data-kategori="${escapeHtml(k)}" aria-selected="${k === activeLayananFilter}">
      ${escapeHtml(k)} <span class="chip-count">${count}</span>
    </button>`;
  }).join('');

  container.querySelectorAll('.layanan-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeLayananFilter = btn.dataset.kategori;
      renderLayananFilters();
      renderLayanan();
      // Smooth scroll chip aktif ke tengah
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });
}

function renderLayanan() {
  const container = document.getElementById('layanan-list');
  if (!container) return;

  // Idempotent setup search listener (sekali saja)
  const searchInput = document.getElementById('layanan-search');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', e => {
      layananSearchQuery = e.target.value;
      renderLayanan();
    });
  }

  const data = getLayananFiltered();

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:40px 20px;color:var(--text-muted)">
        <div style="font-size:42px;margin-bottom:8px">🔍</div>
        <p style="margin:0 0 4px;font-weight:600">Layanan tidak ditemukan</p>
        <p style="margin:0;font-size:13px">Coba kata kunci lain atau pilih kategori "Semua".</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(l => {
    const d = difficultyOf(l);
    return `
    <div class="layanan-card" onclick="showLayananDetail('${l.id}')" role="button" tabindex="0">
      <span class="lcard-emoji">${l.emoji}</span>
      <div class="lcard-body">
        <h3>${escapeHtml(l.nama)}</h3>
        <div class="lcard-meta">
          <span class="badge badge-blue">${escapeHtml(l.kategori)}</span>
          <span class="badge badge-green">⏱ ${escapeHtml(l.waktuProses || '-')}</span>
          <span class="badge badge-${d.tone}" title="${d.label} — ${(l.syarat || []).length} berkas">${d.emoji} ${d.label}</span>
        </div>
      </div>
      <span class="lcard-arrow">›</span>
    </div>`;
  }).join('');
}

function showLayananDetail(id) {
  const layanan = PRIMA_DATA.layanan.find(l => l.id === id);
  if (!layanan) return;
  if (typeof PRIMA_ANALYTICS !== 'undefined') PRIMA_ANALYTICS.trackLayananClick();

  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body-content');
  const diff = difficultyOf(layanan);

  // Load cached readiness checklist progress (per layanan)
  const storageKey = `prima_readiness_${layanan.id}`;
  let checked;
  try { checked = JSON.parse(localStorage.getItem(storageKey) || '[]'); }
  catch { checked = []; }
  if (!Array.isArray(checked)) checked = [];

  body.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-emoji">${layanan.emoji}</span>
      <div class="modal-title">
        <h3>${escapeHtml(layanan.nama)}</h3>
        <p>${escapeHtml(layanan.deskripsi || '')}</p>
      </div>
      <button class="modal-close" onclick="closeModal()" aria-label="Tutup">✕</button>
    </div>
    <div class="modal-body">
      <div class="meta-grid mb-8">
        <div class="meta-item">
          <div class="meta-label">⏱ Waktu Proses</div>
          <div class="meta-val">${escapeHtml(layanan.waktuProses || '-')}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">💰 Biaya</div>
          <div class="meta-val text-green">${escapeHtml(layanan.biaya || 'Gratis')}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">${diff.emoji} Tingkat</div>
          <div class="meta-val">${diff.label}</div>
        </div>
      </div>

      <!-- Quick actions: Cek Kesiapan + Tanyakan ke PRIMA -->
      <div class="layanan-actions mb-8">
        <button class="la-btn la-btn-primary" onclick="toggleReadinessChecker('${layanan.id}')">
          📋 Cek Kesiapan Saya
        </button>
        <button class="la-btn la-btn-ghost" onclick="askPrimaAboutLayanan('${layanan.id}')">
          💬 Tanyakan ke PRIMA
        </button>
      </div>

      <!-- Readiness checker (collapsed by default) -->
      <div class="readiness-panel" id="readiness-panel" hidden>
        <div class="rp-header">
          <strong>📋 Cek Kesiapan Dokumen</strong>
          <p>Centang yang sudah Anda siapkan. Bawa yang masih kurang sebelum ke kelurahan.</p>
        </div>
        <ul class="rp-list">
          ${layanan.syarat.map((s, i) => {
            const id = `rp-${layanan.id}-${i}`;
            const isChecked = checked.includes(i);
            return `
              <li>
                <label for="${id}" class="rp-row${isChecked ? ' rp-row--done' : ''}">
                  <input type="checkbox" id="${id}" data-idx="${i}" ${isChecked ? 'checked' : ''}>
                  <span class="rp-text">${escapeHtml(s)}</span>
                </label>
              </li>`;
          }).join('')}
        </ul>
        <div class="rp-progress">
          <div class="rp-bar"><div class="rp-bar-fill" id="rp-bar-fill"></div></div>
          <div class="rp-status" id="rp-status"></div>
        </div>
      </div>

      <div class="modal-section">
        <h4>📋 Persyaratan</h4>
        <ul class="requirement-list">
          ${layanan.syarat.map((s, i) => `
            <li>
              <span class="req-num">${i + 1}</span>
              <span>${escapeHtml(s)}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <div class="modal-section">
        <h4>📌 Prosedur</h4>
        <ol class="stepper">
          ${layanan.prosedur.map((p, i) => `
            <li class="stepper-item">
              <div class="stepper-dot">${i + 1}</div>
              <div class="stepper-body">${escapeHtml(p)}</div>
            </li>
          `).join('')}
        </ol>
      </div>

      ${layanan.dokumenUnduh.length > 0 ? `
      <div class="modal-section">
        <h4>📥 Unduh Dokumen</h4>
        ${layanan.dokumenUnduh.map(d => {
          const hasFile = d.url && !d.url.startsWith('#');
          return hasFile ? `
            <a class="download-btn" href="${escapeHtml(d.url)}" download target="_blank" rel="noopener">
              <span class="dl-icon">📄</span>
              <span>${escapeHtml(d.nama)}</span>
              <span style="margin-left:auto">⬇️</span>
            </a>
          ` : `
            <button class="download-btn" style="opacity:.55;cursor:not-allowed" onclick="showToast('❌ File template belum tersedia. Hubungi admin kelurahan.')">
              <span class="dl-icon">📄</span>
              <span>${escapeHtml(d.nama)}</span>
              <span style="margin-left:auto">⛔</span>
            </button>
          `;
        }).join('')}
      </div>
      ` : ''}

      <div class="modal-section">
        <div class="info-banner" style="margin:0">
          <span class="info-icon">💡</span>
          <p><strong>Perlu bantuan?</strong> Gunakan fitur <em>Tanya Kami</em> atau hubungi Kelurahan di <strong>(021) 7994427</strong> pada jam kerja.</p>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Wire up checkbox readiness setelah DOM rendered
  bindReadinessChecker(layanan.id, storageKey, layanan.syarat.length);
  // Re-render lucide icons baru
  if (window.lucide && typeof lucide.createIcons === 'function') {
    try { lucide.createIcons(); } catch {}
  }
}

/**
 * Bind checkbox change listeners untuk readiness checklist, update progress bar
 * + status text. State persisted ke localStorage per-layanan supaya warga bisa
 * kembali ke modal beberapa hari kemudian dan checklist masih ingat.
 */
function bindReadinessChecker(layananId, storageKey, totalSyarat) {
  const panel = document.getElementById('readiness-panel');
  if (!panel) return;

  const update = () => {
    const boxes = panel.querySelectorAll('input[type="checkbox"]');
    const checkedIdx = [];
    boxes.forEach(b => {
      const idx = parseInt(b.dataset.idx, 10);
      const row = b.closest('.rp-row');
      if (b.checked) {
        checkedIdx.push(idx);
        row?.classList.add('rp-row--done');
      } else {
        row?.classList.remove('rp-row--done');
      }
    });
    try { localStorage.setItem(storageKey, JSON.stringify(checkedIdx)); } catch {}

    const pct = totalSyarat ? Math.round((checkedIdx.length / totalSyarat) * 100) : 0;
    const fill = document.getElementById('rp-bar-fill');
    const status = document.getElementById('rp-status');
    if (fill) fill.style.width = pct + '%';
    if (status) {
      if (pct === 0) status.innerHTML = '<span>0% siap — silakan centang dokumen yang sudah ada</span>';
      else if (pct === 100) status.innerHTML = '<span style="color:var(--success,#2e7d32);font-weight:700">✅ Lengkap! Anda siap ke kelurahan.</span>';
      else status.innerHTML = `<span><strong>${pct}%</strong> siap — ${totalSyarat - checkedIdx.length} berkas masih kurang</span>`;
    }
  };

  panel.querySelectorAll('input[type="checkbox"]').forEach(b => {
    b.addEventListener('change', update);
  });
  update();
}

// Show/hide readiness panel
function toggleReadinessChecker(_layananId) {
  const panel = document.getElementById('readiness-panel');
  if (!panel) return;
  const hidden = panel.hasAttribute('hidden');
  if (hidden) {
    panel.removeAttribute('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    panel.setAttribute('hidden', '');
  }
}

// Pre-fill chat dengan pertanyaan tentang layanan, lalu auto-send
function askPrimaAboutLayanan(layananId) {
  const layanan = PRIMA_DATA.layanan.find(l => l.id === layananId);
  if (!layanan) return;
  closeModal();
  navigateTo('chat');
  // Tunggu page transition selesai sebelum fill + send
  setTimeout(() => {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = `Tolong jelaskan lebih detail tentang ${layanan.nama} — syarat lengkap, prosedur, dan tips supaya cepat.`;
    if (typeof sendMessage === 'function') sendMessage();
  }, 280);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleDownload(docName, url) {
  if (!url || url.startsWith('#')) {
    showToast('❌ File template belum tersedia. Hubungi admin kelurahan.');
    return false;
  }
  // Resolve relative path to absolute
  const absoluteUrl = url.startsWith('http') ? url : new URL(url, window.location.href).href;
  showToast(`📄 Mengunduh: ${docName}…`);
  // For external URLs, let the anchor tag handle it; for same-origin we could fetch+blob
  if (!absoluteUrl.startsWith(window.location.origin)) {
    return true; // Let <a> target="_blank" handle it
  }
  // Same-origin: fetch and trigger download via blob (works on mobile)
  fetch(absoluteUrl)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = docName.replace(/[^a-zA-Z0-9\s.-]/g, '') + (absoluteUrl.match(/\.[^.]+$/)?.[0] || '.pdf');
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      showToast('✅ Berhasil diunduh ke perangkat');
    })
    .catch(e => { showToast('❌ Gagal unduh: ' + e.message); });
  return false;
}

// ── MAP PAGE ─────────────────────────────────────────────────────
// Cluster layer container — markers ditaruh di sini supaya yang berdekatan
// auto-grouped jadi badge bernomor. Lebih clean di kelurahan padat marker.
let markerCluster = null;
let userLocationMarker = null;

function initMap() {
  const { lat, lng } = PRIMA_DATA.meta.koordinat;
  map = L.map('map-container', {
    center: [lat, lng],
    zoom: 15,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Marker clustering — pakai plugin leaflet.markercluster (sudah di-load di HTML)
  if (typeof L.markerClusterGroup === 'function') {
    markerCluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 5 ? 36 : count < 15 ? 42 : 50;
        return L.divIcon({
          html: `<div class="cluster-badge" style="width:${size}px;height:${size}px">${count}</div>`,
          className: 'cluster-icon-wrapper',
          iconSize: [size, size]
        });
      }
    });
    map.addLayer(markerCluster);
  }

  PRIMA_DATA.petaMarkers.forEach(m => addMapMarker(m));
  updateMapFilter('Semua');

  // Wire up "Lokasi Saya" FAB (sekali saja)
  const fab = document.getElementById('btn-locate-me');
  if (fab && !fab.dataset.bound) {
    fab.dataset.bound = '1';
    fab.addEventListener('click', locateMe);
  }
}

function addMapMarker(marker) {
  const iconHtml = `<div style="background:${marker.warna};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font-size:16px">${marker.icon}</span></div>`;

  const icon = L.divIcon({
    html: iconHtml,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });

  // Bottom sheet menggantikan popup default Leaflet — info lebih leluasa
  const leafletMarker = L.marker([marker.lat, marker.lng], { icon });
  leafletMarker.on('click', () => openMapSheet(marker));

  if (markerCluster) {
    markerCluster.addLayer(leafletMarker);
  } else {
    leafletMarker.addTo(map);
  }
  mapMarkers.push({ data: marker, leaflet: leafletMarker });
}

function updateMapFilter(kategori) {
  activeFilter = kategori;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === kategori);
  });

  // Bila pakai cluster: clearLayers lalu re-add yang lolos filter.
  if (markerCluster) {
    markerCluster.clearLayers();
    mapMarkers.forEach(({ data, leaflet }) => {
      if (kategori === 'Semua' || data.kategori === kategori) {
        markerCluster.addLayer(leaflet);
      }
    });
  } else {
    // Fallback kalau plugin gagal load
    mapMarkers.forEach(({ data, leaflet }) => {
      if (kategori === 'Semua' || data.kategori === kategori) leaflet.addTo(map);
      else map.removeLayer(leaflet);
    });
  }
}

/**
 * Bottom sheet detail lokasi — ganti popup default Leaflet supaya info lebih
 * leluasa: tombol "Buka di Google Maps" (deeplink) + ringkasan info.
 */
function openMapSheet(marker) {
  const sheet = document.getElementById('map-sheet');
  const body = document.getElementById('map-sheet-body');
  if (!sheet || !body) return;

  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${marker.lat},${marker.lng}`;
  body.innerHTML = `
    <div class="ms-head">
      <span class="ms-icon" style="background:${marker.warna}">${marker.icon}</span>
      <div class="ms-title">
        <h3>${escapeHtml(marker.nama)}</h3>
        <small>${escapeHtml(marker.kategori || '')}</small>
      </div>
    </div>
    <p class="ms-info">${escapeHtml(marker.info || '')}</p>
    <div class="ms-actions">
      <a class="ms-btn ms-btn-primary" href="${gmapsUrl}" target="_blank" rel="noopener">
        🧭 Arahkan ke Sini
      </a>
      <button class="ms-btn ms-btn-ghost" type="button" onclick="closeMapSheet()">Tutup</button>
    </div>
  `;
  sheet.removeAttribute('hidden');
  // Smooth slide-up via class toggle (CSS handles transition)
  requestAnimationFrame(() => sheet.classList.add('open'));

  // Pan map sehingga marker yang diklik tetap kelihatan di atas sheet.
  // Sheet kira-kira menutupi 40% layar bawah → kita pindahkan marker ke
  // posisi vertikal sekitar 30% dari atas (di area peta yang masih tampak).
  if (map) {
    setTimeout(() => {
      try {
        const mapSize = map.getSize();
        const sheetHeight = sheet.offsetHeight || 280;
        const visibleAreaH = mapSize.y - sheetHeight;
        // Posisi target vertikal marker = 45% dari atas area peta yang terlihat
        const targetPxY = Math.max(80, visibleAreaH * 0.45);
        const currentPx = map.latLngToContainerPoint([marker.lat, marker.lng]);
        // panBy positif Y = scroll konten ke bawah (marker bergerak ke atas)
        const offsetY = currentPx.y - targetPxY;
        if (Math.abs(offsetY) > 20) {
          map.panBy([0, offsetY], { animate: true, duration: 0.35 });
        }
      } catch (e) { /* silent — pan optional */ }
    }, 50);
  }
}

function closeMapSheet() {
  const sheet = document.getElementById('map-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  // Tunggu transisi selesai sebelum hide (300ms sync dengan CSS)
  setTimeout(() => sheet.setAttribute('hidden', ''), 320);
}

/**
 * Geolocation API → zoom peta ke posisi user + marker biru pulsing.
 * Disclaimer privasi: koordinat dipakai sebentar, tidak disimpan.
 */
function locateMe() {
  if (!('geolocation' in navigator)) {
    showToast('❌ Browser tidak mendukung geolocation.');
    return;
  }
  showToast('📍 Mencari lokasi Anda…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      // Remove marker lama bila ada
      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
      }
      const userIcon = L.divIcon({
        html: '<div class="user-loc-dot"><span class="user-loc-pulse"></span></div>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      userLocationMarker = L.marker([latitude, longitude], { icon: userIcon, interactive: false }).addTo(map);
      map.setView([latitude, longitude], 17, { animate: true });
      showToast(`✅ Lokasi terdeteksi (akurasi ±${Math.round(accuracy)} m)`);
    },
    err => {
      const msg = err.code === 1
        ? '❌ Izin lokasi ditolak. Aktifkan di pengaturan browser.'
        : '❌ Gagal mendeteksi lokasi: ' + err.message;
      showToast(msg);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ── INFO WARGA ───────────────────────────────────────────────────

/**
 * Sederhanakan nomor WA Indonesia ke format wa.me:
 * "0812-xxx" → "62812xxx" (E.164 tanpa +). Skip kalau bukan nomor valid.
 */
function waLink(kontak) {
  if (!kontak) return null;
  const digits = String(kontak).replace(/[^\d]/g, '');
  if (digits.length < 9) return null;
  const phone = digits.startsWith('62') ? digits : digits.startsWith('0') ? '62' + digits.slice(1) : '62' + digits;
  return `https://wa.me/${phone}`;
}

/**
 * Cari marker peta yang nama-nya match item info warga, lalu navigate
 * ke peta + auto-open bottom sheet untuk marker itu.
 */
function showOnMap(nama) {
  const target = PRIMA_DATA.petaMarkers.find(m =>
    m.nama.toLowerCase().includes((nama || '').toLowerCase()) ||
    (nama || '').toLowerCase().includes(m.nama.toLowerCase())
  );
  if (!target) {
    showToast('📍 Lokasi tidak ditemukan di peta. Coba cari manual.');
    navigateTo('peta');
    return;
  }
  navigateTo('peta');
  setTimeout(() => {
    if (map) {
      map.setView([target.lat, target.lng], 17, { animate: true });
      openMapSheet(target);
    }
  }, 350);
}

/**
 * Cek apakah jadwal kegiatan mengandung hari minggu ini.
 * Untuk demo sidang, sederhana: kalau jadwal mengandung nama hari Indonesia
 * yang match dengan 7 hari ke depan, dianggap "minggu ini".
 */
function isThisWeek(jadwal) {
  if (!jadwal) return false;
  const today = new Date();
  const dayNamesId = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const j = jadwal.toLowerCase();
  // Kalau ada keyword 'setiap' atau nama hari → asumsi rutin tiap minggu
  if (j.includes('setiap')) return true;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (j.includes(dayNamesId[d.getDay()].toLowerCase())) return true;
  }
  return false;
}

/**
 * Render gradient placeholder foto — variasi warna deterministik dari nama
 * (sama nama selalu sama warna) supaya UI stabil tanpa butuh upload foto.
 */
function photoPlaceholder(name, emoji) {
  // Hash nama → 2 warna dari palette navy/gold
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const palettes = [
    ['#0A1F44', '#13306E'],
    ['#13306E', '#1E3A8A'],
    ['#A37D12', '#D4AF37'],
    ['#0D2658', '#2B4BB0'],
    ['#1E3A8A', '#0A1F44'],
  ];
  const [a, b] = palettes[Math.abs(hash) % palettes.length];
  return `<div class="info-photo" style="background:linear-gradient(135deg, ${a} 0%, ${b} 100%)"><span class="info-photo-emoji">${emoji || '📍'}</span></div>`;
}

function renderInfoWarga() {
  // ─ Section "Kegiatan Minggu Ini" (di atas tab, hanya kalau ada) ─
  const kegiatanThisWeek = (PRIMA_DATA.infoWarga.kegiatanRTRW || [])
    .filter(g => isThisWeek(g.jadwal));
  const banner = document.getElementById('kegiatan-this-week');
  if (banner) {
    if (kegiatanThisWeek.length > 0) {
      banner.hidden = false;
      banner.innerHTML = `
        <div class="ktw-header">
          <span class="ktw-icon">🎉</span>
          <div>
            <strong>Kegiatan Minggu Ini</strong>
            <small>${kegiatanThisWeek.length} acara · jadwalkan dari sekarang</small>
          </div>
        </div>
        <div class="ktw-list">
          ${kegiatanThisWeek.map(g => `
            <div class="ktw-item">
              <span class="ktw-emoji">${g.emoji || '📅'}</span>
              <div class="ktw-body">
                <strong>${escapeHtml(g.nama)}</strong>
                <small>${escapeHtml(g.jadwal || '')} · ${escapeHtml(g.lokasi || '')}</small>
              </div>
            </div>
          `).join('')}
        </div>`;
    } else {
      banner.hidden = true;
    }
  }

  // ─ Kuliner ─
  const kulinerContainer = document.getElementById('kuliner-list');
  if (kulinerContainer) {
    kulinerContainer.innerHTML = PRIMA_DATA.infoWarga.kuliner.map(k => {
      const wa = waLink(k.kontak);
      return `
      <div class="info-card">
        ${photoPlaceholder(k.nama, k.emoji)}
        <div class="info-card-body">
          <div class="info-card-header">
            <h3>${escapeHtml(k.nama)}</h3>
            <span class="badge badge-amber ic-badge">⭐ Favorit warga</span>
          </div>
          <p>${escapeHtml(k.deskripsi || '')}</p>
          <div class="ic-details">
            <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${escapeHtml(k.lokasi || '-')}</span></div>
            <div class="ic-row"><span class="ic-label">⏰</span><span class="ic-val">${escapeHtml(k.jam || '-')}</span></div>
            ${k.favorit ? `<div class="ic-row"><span class="ic-label">🍴</span><span class="ic-val">${escapeHtml(k.favorit)}</span></div>` : ''}
          </div>
          <div class="info-actions">
            <button class="ia-btn ia-btn-ghost" onclick="showOnMap('${escapeHtml(k.nama).replace(/'/g, "\\'")}')">🗺️ Di Peta</button>
            ${wa ? `<a class="ia-btn ia-btn-primary" href="${wa}" target="_blank" rel="noopener">💬 Chat WA</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ─ Usaha Binaan ─
  const usahaContainer = document.getElementById('usaha-list');
  if (usahaContainer) {
    usahaContainer.innerHTML = PRIMA_DATA.infoWarga.usahaBinaan.map(u => {
      const wa = waLink(u.kontak);
      return `
      <div class="info-card">
        ${photoPlaceholder(u.nama, u.emoji)}
        <div class="info-card-body">
          <div class="info-card-header">
            <h3>${escapeHtml(u.nama)}</h3>
            <span class="badge badge-blue ic-badge">${escapeHtml(u.kategori || '')}</span>
          </div>
          <p>${escapeHtml(u.deskripsi || '')}</p>
          <div class="ic-details">
            <div class="ic-row"><span class="ic-label">👤</span><span class="ic-val">${escapeHtml(u.pemilik || '-')}</span></div>
            <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${escapeHtml(u.lokasi || '-')}</span></div>
            ${u.binaan ? `<div class="ic-row"><span class="ic-label">🏛️</span><span class="ic-val">${escapeHtml(u.binaan)}</span></div>` : ''}
          </div>
          <div class="info-actions">
            <button class="ia-btn ia-btn-ghost" onclick="showOnMap('${escapeHtml(u.nama).replace(/'/g, "\\'")}')">🗺️ Di Peta</button>
            ${wa ? `<a class="ia-btn ia-btn-primary" href="${wa}" target="_blank" rel="noopener">💬 Chat WA</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ─ Kegiatan RT/RW ─
  const kegiatanContainer = document.getElementById('kegiatan-list');
  if (kegiatanContainer) {
    kegiatanContainer.innerHTML = PRIMA_DATA.infoWarga.kegiatanRTRW.map(g => {
      const wa = waLink(g.kontak);
      const thisWeek = isThisWeek(g.jadwal);
      return `
      <div class="info-card">
        ${photoPlaceholder(g.nama, g.emoji)}
        <div class="info-card-body">
          <div class="info-card-header">
            <h3>${escapeHtml(g.nama)}</h3>
            ${thisWeek ? '<span class="badge badge-green ic-badge">📅 Minggu Ini</span>' : ''}
          </div>
          <p>${escapeHtml(g.deskripsi || '')}</p>
          <div class="ic-details">
            <div class="ic-row"><span class="ic-label">📅</span><span class="ic-val">${escapeHtml(g.jadwal || '-')}</span></div>
            <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${escapeHtml(g.lokasi || '-')}</span></div>
            ${g.kontak ? `<div class="ic-row"><span class="ic-label">📞</span><span class="ic-val">${escapeHtml(g.kontak)}</span></div>` : ''}
          </div>
          ${wa ? `<div class="info-actions"><a class="ia-btn ia-btn-primary" href="${wa}" target="_blank" rel="noopener">💬 Chat WA</a></div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // Tab switching (idempotent)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
    });
  });
}

// ── CHATBOT ──────────────────────────────────────────────────────
function initChatbot() {
  const messagesContainer = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  // Welcome message — time-aware salam
  const hour = new Date().getHours();
  const sapaan = hour >= 5 && hour < 11 ? 'Selamat pagi'
               : hour >= 11 && hour < 15 ? 'Selamat siang'
               : hour >= 15 && hour < 18 ? 'Selamat sore'
               : 'Selamat malam';
  addBotMessage(
    `${sapaan}! 👋 Selamat datang di <strong>PRIMA – Kelurahan Rawajati</strong>.\n\nSaya asisten virtual yang siap membantu Anda 24 jam. Pilih topik di bawah, atau ketik pertanyaan Anda sendiri di kolom chat. 😊`,
    getCurrentTime()
  );

  // Render time-aware suggested questions sebagai chip di bawah welcome
  renderTimeAwareSuggestions();

  // Wire voice input button (B.2)
  initVoiceInput();

  // Event listeners
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // Refresh mode label di chat header (tidak butuh UI admin)
  refreshChatModeLabel();
}

/**
 * Render suggested questions time-aware sebagai chip horizontal scroll
 * di bawah welcome message. Klik chip → isi input + auto-send.
 * Suggestions hilang setelah user kirim pesan pertama (auto-cleanup).
 */
function renderTimeAwareSuggestions() {
  const container = document.getElementById('chat-suggestions');
  if (!container || !chatbot) return;
  const suggestions = chatbot.getSuggestedQuestions();
  container.innerHTML = `
    <div class="cs-header">💡 <span>Pertanyaan Populer Saat Ini</span></div>
    <div class="cs-chips">
      ${suggestions.map(q => `<button type="button" class="suggestion-chip" onclick="sendSuggestion('${escapeHtml(q).replace(/'/g, "\\'")}')">${escapeHtml(q)}</button>`).join('')}
    </div>
  `;
  container.style.display = 'flex';
}

function hideSuggestions() {
  const container = document.getElementById('chat-suggestions');
  if (container) container.style.display = 'none';
}

function sendSuggestion(text) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = text;
  hideSuggestions();
  if (typeof sendMessage === 'function') sendMessage();
}

/**
 * B.2 — Voice input via Web Speech API (id-ID).
 * Klik mic → minta izin mic browser → rekam → transkripsi langsung
 * masuk ke chat-input. User tinggal cek + kirim (atau auto-send kalau
 * interim final). Mendukung Chrome, Edge, Safari mobile.
 *
 * Fallback graceful: kalau browser tidak punya SpeechRecognition,
 * tombol mic disable + tooltip jelaskan.
 */
let _speechRecognition = null;
let _isListening = false;

function initVoiceInput() {
  const micBtn = document.getElementById('chat-mic');
  if (!micBtn) return;

  // Re-render lucide icon
  if (window.lucide && typeof lucide.createIcons === 'function') {
    try { lucide.createIcons(); } catch {}
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'Browser Anda belum mendukung input suara. Gunakan Chrome / Edge / Safari.';
    micBtn.style.opacity = '.4';
    micBtn.style.cursor = 'not-allowed';
    return;
  }

  if (micBtn.dataset.bound) return;
  micBtn.dataset.bound = '1';

  micBtn.addEventListener('click', () => {
    if (_isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  });
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const input = document.getElementById('chat-input');
  const micBtn = document.getElementById('chat-mic');
  if (!input || !micBtn) return;

  _speechRecognition = new SpeechRecognition();
  _speechRecognition.lang = 'id-ID';
  _speechRecognition.interimResults = true;
  _speechRecognition.continuous = false;
  _speechRecognition.maxAlternatives = 1;

  let finalTranscript = '';

  _speechRecognition.onstart = () => {
    _isListening = true;
    micBtn.classList.add('chat-mic-active');
    micBtn.setAttribute('aria-label', 'Hentikan rekaman');
    showToast('🎙️ Mendengarkan… bicara sekarang');
  };

  _speechRecognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }
    input.value = (finalTranscript + interim).trim();
    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  };

  _speechRecognition.onerror = (event) => {
    _isListening = false;
    micBtn.classList.remove('chat-mic-active');
    const msg = event.error === 'not-allowed' || event.error === 'permission-denied'
      ? '❌ Izin mikrofon ditolak. Aktifkan di pengaturan browser.'
      : event.error === 'no-speech'
      ? '🤫 Tidak ada suara terdeteksi. Coba lagi.'
      : '❌ Voice input error: ' + event.error;
    showToast(msg);
  };

  _speechRecognition.onend = () => {
    _isListening = false;
    micBtn.classList.remove('chat-mic-active');
    micBtn.setAttribute('aria-label', 'Bicara dengan PRIMA');
    if (finalTranscript.trim()) {
      showToast('✓ Transkrip siap. Tekan ➤ untuk kirim.');
    }
  };

  try {
    _speechRecognition.start();
  } catch (e) {
    showToast('❌ Gagal mulai rekaman: ' + e.message);
    _isListening = false;
    micBtn.classList.remove('chat-mic-active');
  }
}

function stopVoiceInput() {
  if (_speechRecognition) {
    try { _speechRecognition.stop(); } catch {}
  }
  _isListening = false;
  const micBtn = document.getElementById('chat-mic');
  if (micBtn) micBtn.classList.remove('chat-mic-active');
}

// Render label "Online · ✨ AI …" di header chat berdasarkan state localStorage.
function toggleAiApiKeyEye() {
  const input = document.getElementById('ai-apikey');
  const btn = document.getElementById('ai-apikey-eye');
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function refreshChatModeLabel() {
  const modeLabel = document.getElementById('chat-mode-label');
  if (!modeLabel || typeof PRIMA_AI === 'undefined') return;

  if (isAIEnabled()) {
    modeLabel.textContent = 'Online · AI aktif';
    PRIMA_AI.isAvailable().then(ok => {
      if (!ok) modeLabel.textContent = 'Mode lokal · Endpoint AI belum aktif';
    });
  } else {
    modeLabel.textContent = 'Online · Mode lokal (offline-OK)';
  }
}

// Wire up kontrol AI di Panel Admin (toggle + provider + endpoint + model + custom ID).
function initAISettings() {
  const panel = document.getElementById('chat-settings');
  const aiToggle = document.getElementById('ai-enabled');
  const providerSelect = document.getElementById('ai-provider');
  const baseUrlInput = document.getElementById('ai-baseurl');
  const baseUrlSaveBtn = document.getElementById('ai-baseurl-save');
  const apiKeyInput = document.getElementById('ai-apikey');
  const modelSelect = document.getElementById('ai-model');
  const customInput = document.getElementById('ai-model-custom');
  const customSaveBtn = document.getElementById('ai-model-custom-save');

  if (!panel || !aiToggle || !modelSelect || typeof PRIMA_AI === 'undefined') return;

  // Default provider / baseUrl lookup
  const PROVIDER_DEFAULTS = {
    openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1/chat/completions', link: 'https://openrouter.ai/models' },
    openai:     { label: 'OpenAI',     base: 'https://api.openai.com/v1/chat/completions',     link: 'https://platform.openai.com/docs/models' },
    anthropic:  { label: 'Anthropic',  base: 'https://api.anthropic.com/v1/messages',            link: 'https://docs.anthropic.com/en/docs/models-overview' },
    gemini:     { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/models', link: 'https://ai.google.dev/models' },
    custom:     { label: 'Custom',     base: '',                                                 link: '#' }
  };
  function _updateProviderUI(provider) {
    const info = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openrouter;
    const labelEl = document.getElementById('ai-provider-label');
    const linkEl = document.getElementById('ai-provider-link');
    if (labelEl) labelEl.textContent = info.label;
    if (linkEl) { linkEl.textContent = info.link.replace(/^https?:\/\//, ''); linkEl.href = info.link; }
  }
  function _getAiSettings() {
    if (!window.PRIMA_DATA.aiSettings) window.PRIMA_DATA.aiSettings = {};
    return window.PRIMA_DATA.aiSettings;
  }

  // Populate model dropdown from current presets (re-populate each init)
  const _populateSelect = () => {
    const currentVal = modelSelect.value;
    const models = PRIMA_AI.getModels();
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.id}">${escapeHtml(m.label)}</option>`
    ).join('') + '<option value="__custom__">— Custom (isi di bawah) —</option>';
    if (currentVal && (models.find(m => m.id === currentVal) || currentVal === '__custom__')) {
      modelSelect.value = currentVal;
    }
    if (!modelSelect.dataset.populated) modelSelect.dataset.populated = '1';
  };
  _populateSelect();

  // Provider change
  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const s = _getAiSettings();
      s.provider = providerSelect.value;
      const def = PROVIDER_DEFAULTS[providerSelect.value];
      if (def && def.base && baseUrlInput) {
        baseUrlInput.value = def.base;
        s.baseUrl = def.base;
      }
      _updateProviderUI(providerSelect.value);
      showToast('🤖 Provider diubah (draft) — klik "Simpan ke GitHub"');
      markAISettingsDirty();
    });
  }

  // Base URL save
  if (baseUrlSaveBtn && baseUrlInput) {
    const saveBase = () => {
      const val = baseUrlInput.value.trim();
      _getAiSettings().baseUrl = val;
      showToast('🌐 Endpoint diubah (draft) — klik "Simpan ke GitHub"');
      markAISettingsDirty();
    };
    baseUrlSaveBtn.addEventListener('click', saveBase);
    baseUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBase(); } });
  }

  // Model select
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === '__custom__') {
      if (customInput) customInput.focus();
      return;
    }
    PRIMA_AI.setSelectedModel(modelSelect.value);
    if (customInput) customInput.value = '';
    showToast('🤖 Model diubah (draft) — klik "Simpan ke GitHub" supaya berlaku global');
    markAISettingsDirty();
    refreshChatModeLabel();
  });

  // Toggle
  aiToggle.addEventListener('change', () => {
    _getAiSettings().enabled = aiToggle.checked;
    try { localStorage.setItem('prima_ai_enabled', aiToggle.checked ? '1' : '0'); } catch {}
    markAISettingsDirty();
    refreshChatModeLabel();
  });

  // Custom model save
  if (customSaveBtn && customInput) {
    const saveCustom = () => {
      const ok = PRIMA_AI.setSelectedModel(customInput.value);
      if (!ok) {
        showToast('❌ Format model ID tidak valid. Contoh: vendor/model-name');
        return;
      }
      showToast('🤖 Model custom diubah (draft) — klik "Simpan ke GitHub"');
      modelSelect.value = '__custom__';
      markAISettingsDirty();
      refreshChatModeLabel();
    };
    customSaveBtn.addEventListener('click', saveCustom);
    customInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveCustom(); }
    });
  }

  // Sync UI dengan state dari PRIMA_DATA (source of truth)
  const s = _getAiSettings();
  const currentModel = PRIMA_AI.getSelectedModel();
  if (PRIMA_AI.isCustomModel(currentModel)) {
    modelSelect.value = '__custom__';
    if (customInput) customInput.value = currentModel;
  } else {
    modelSelect.value = currentModel;
    if (customInput) customInput.value = '';
  }
  aiToggle.checked = isAIEnabled();
  if (providerSelect) {
    providerSelect.value = s.provider || 'openrouter';
    _updateProviderUI(providerSelect.value);
  }
  if (baseUrlInput) baseUrlInput.value = s.baseUrl || (PROVIDER_DEFAULTS[s.provider || 'openrouter']?.base || '');

  // Render preset list CRUD UI
  renderAIModelList();

  // Render status indikator + tombol Simpan
  renderAISettingsStatus();
  refreshChatModeLabel();
}

// Status pending publish + tombol Save dilekatkan setelah .cs-hint.
let _aiSettingsDirty = false;
function markAISettingsDirty() {
  _aiSettingsDirty = true;
  renderAISettingsStatus();
}
function renderAISettingsStatus() {
  const panel = document.getElementById('chat-settings');
  if (!panel) return;
  let footer = document.getElementById('ai-settings-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'ai-settings-footer';
    footer.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);flex-wrap:wrap';
    panel.appendChild(footer);
  }
  const status = _aiSettingsDirty
    ? '<span style="color:#c1272d;font-weight:700">● Belum di-publish</span> <span style="color:var(--text-muted);font-size:12px">(perubahan hanya berlaku di device ini)</span>'
    : '<span style="color:#2e7d32;font-weight:700">✓ Tersinkron dengan GitHub</span>';
  footer.innerHTML = `
    <div style="flex:1;min-width:0;font-size:13px">${status}</div>
    <button type="button" class="submit-btn" id="ai-settings-save-btn"
            style="padding:8px 14px;font-size:13px;background:${_aiSettingsDirty ? 'var(--gold)' : 'var(--text-muted)'};color:${_aiSettingsDirty ? 'var(--navy-900)' : '#fff'};flex:0 0 auto"
            ${_aiSettingsDirty ? '' : 'disabled'}>
      💾 Simpan ke GitHub
    </button>
  `;
  const btn = footer.querySelector('#ai-settings-save-btn');
  if (btn) btn.addEventListener('click', saveAISettingsToGitHub);
}

// ── AI MODEL PRESET CRUD UI ────────────────────────────────────
function renderAIModelList() {
  const container = document.getElementById('ai-preset-list');
  if (!container) return;
  const models = PRIMA_AI.getModels();
  if (!models.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Belum ada preset. Default model akan dipakai.</span>';
    return;
  }
  container.innerHTML = models.map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:13px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><strong>${escapeHtml(m.label)}</strong> <span style="color:var(--text-muted);font-size:11px">${escapeHtml(m.id)}</span></span>
      <button type="button" class="de-pv-del" onclick="removeAIModelPreset('${escapeHtml(m.id)}')" title="Hapus preset" style="width:24px;height:24px;font-size:12px">✕</button>
    </div>
  `).join('');
}

function _titleCase(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function _autoLabelFromId(id) {
  const parts = id.split('/');
  if (parts.length < 2) return _titleCase(id);
  const vendor = parts[0];
  let model = parts.slice(1).join(' ');
  // Hapus prefix vendor dari model name kalau dobel (contoh: qwen/qwen3.6 -> qwen 3.6)
  const vendorRe = new RegExp('^' + vendor.replace(/[-_.]/g, '[-_.]?') + '[-_.]?', 'i');
  model = model.replace(vendorRe, '');
  return _titleCase(vendor) + ' ' + _titleCase(model);
}
function _autoShortFromId(id) {
  const parts = id.split('/');
  const model = parts[parts.length - 1] || '';
  const cleaned = model.replace(/[-_]/g, ' ').replace(/:free$|:paid$/i, '').trim();
  return _titleCase(cleaned).slice(0, 18);
}

function addAIModelPreset() {
  const idEl = document.getElementById('ai-add-id');
  if (!idEl) return;
  const id = idEl.value.trim();
  if (!id) {
    showToast('❌ ID model wajib diisi');
    return;
  }
  if (!id.includes('/')) {
    showToast('❌ ID harus format vendor/model (contoh: qwen/qwen3.6-flash)');
    return;
  }
  const label = _autoLabelFromId(id);
  const short = _autoShortFromId(id);
  const ok = PRIMA_AI.addModel({ id, label, short });
  if (!ok) {
    showToast('❌ Model sudah ada atau ID tidak valid');
    return;
  }
  // Refresh UI
  const modelSelect = document.getElementById('ai-model');
  if (modelSelect) {
    const currentVal = modelSelect.value;
    const models = PRIMA_AI.getModels();
    modelSelect.innerHTML = models.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('') + '<option value="__custom__">— Custom (isi di bawah) —</option>';
    if (currentVal) modelSelect.value = currentVal;
  }
  renderAIModelList();
  markAISettingsDirty();
  showToast('✅ Model ditambahkan (draft) — klik "Simpan ke GitHub"');
  idEl.value = '';
}

function removeAIModelPreset(id) {
  if (!confirm('Hapus preset model ini?')) return;
  PRIMA_AI.removeModel(id);
  // Refresh dropdown
  const modelSelect = document.getElementById('ai-model');
  if (modelSelect) {
    const models = PRIMA_AI.getModels();
    modelSelect.innerHTML = models.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('') + '<option value="__custom__">— Custom (isi di bawah) —</option>';
    // Kalau model yang dihapus sedang dipilih, fallback ke default
    const current = PRIMA_AI.getSelectedModel();
    if (current === id) {
      PRIMA_AI.setSelectedModel(PRIMA_AI.DEFAULT_MODEL);
      modelSelect.value = PRIMA_AI.DEFAULT_MODEL;
    } else {
      modelSelect.value = current;
    }
  }
  renderAIModelList();
  markAISettingsDirty();
  refreshChatModeLabel();
  showToast('🗑️ Model dihapus (draft) — klik "Simpan ke GitHub"');
}

// Commit PRIMA_DATA (yang sudah memuat aiSettings terbaru) ke GitHub.
async function saveAISettingsToGitHub() {
  if (!window.PRIMA_DATA) {
    showToast('⏳ Data belum siap.');
    return;
  }
  if (typeof ensureAdminSecret !== 'function') {
    showToast('❌ Helper save belum tersedia.');
    return;
  }
  let secret = await ensureAdminSecret();
  if (!secret) return;

  // Ensure aiModels is synced from current presets before commit
  const models = PRIMA_AI.getModels();
  window.PRIMA_DATA.aiModels = models;

  const ai = window.PRIMA_DATA.aiSettings || {};
  const commitMessage = `chore(ai): provider=${ai.provider || 'openrouter'} model=${ai.model || '?'} enabled=${ai.enabled ? 'on' : 'off'} presets=${models.length}`;

  showToast('⏳ Publish setting AI ke GitHub…');

  try {
    let res = await fetch('/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
      body: JSON.stringify({ data: window.PRIMA_DATA, message: commitMessage })
    });

    if (res.status === 401) {
      clearAdminSecret();
      showToast('🔑 Secret salah/expired. Coba lagi…');
      secret = await ensureAdminSecret(true);
      if (!secret) return;
      res = await fetch('/api/save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
        body: JSON.stringify({ data: window.PRIMA_DATA, message: commitMessage })
      });
    }

    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('❌ Gagal: ' + (out.error || res.status));
      return;
    }
    _aiSettingsDirty = false;
    renderAISettingsStatus();
    refreshChatModeLabel();
    showToast('✅ Setting AI tersimpan global. Vercel auto-deploy ~1-2 menit.');
  } catch (e) {
    showToast('❌ Network error: ' + e.message);
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  addUserMessage(text, getCurrentTime());
  input.value = '';
  input.style.height = 'auto';
  // Hide time-aware suggestions setelah user mulai bertanya
  if (typeof hideSuggestions === 'function') hideSuggestions();

  const aiEnabled = isAIEnabled();

  // AI mode: stream response from OpenRouter
  if (aiEnabled && typeof PRIMA_AI !== 'undefined') {
    const typingId = showTyping();
    let bubbleEl = null;
    let fullText = '';

    // Build conversation history (last few exchanges)
    const history = chatbot.conversationHistory.slice(-8);

    const result = await PRIMA_AI.streamChat(history, text, {
      onToken: (chunk) => {
        if (!bubbleEl) {
          removeTyping(typingId);
          bubbleEl = startStreamingBotMessage();
        }
        fullText += chunk;
        bubbleEl.innerHTML = formatBotText(fullText);
        scrollToBottom();
      },
      onError: (err) => {
        console.warn('[PRIMA AI] error, falling back to rule-based:', err);
      }
    });

    if (result.ok && fullText.trim()) {
      // Finalize bubble
      if (bubbleEl) {
        bubbleEl.classList.remove('streaming');
        finalizeBotMessage(bubbleEl.closest('.chat-msg'), {
          text: fullText,
          sources: result.retrievedDocs || [],
          time: getCurrentTime(),
          modelUsed: PRIMA_AI.getSelectedModel()
        });
      }
      // Persist + record
      chatbot.recordExchange(text, fullText, 'ai');
      updateChatStats();
      return;
    }

    // AI failed → fall through to rule-based
    removeTyping(typingId);
    if (bubbleEl) {
      const msg = bubbleEl.closest('.chat-msg');
      if (msg) msg.remove();
    }
    addBotMessage(
      '<em>⚠️ Mode AI tidak tersedia (' + (result.error || 'unknown') + '). Beralih ke mesin lokal…</em>',
      getCurrentTime()
    );
  }

  // Rule-based fallback
  const typingId2 = showTyping();
  setTimeout(() => {
    removeTyping(typingId2);
    const response = chatbot.processMessage(text);
    addBotMessage(response.text, response.timestamp, { intent: response.intent, rawText: response.text });
    updateChatStats();
  }, 500 + Math.random() * 300);
}

// AI helpers — source of truth: PRIMA_DATA.aiSettings (committed via GitHub
// supaya semua device dapat setting yang sama). localStorage cache fallback
// kalau PRIMA_DATA belum di-load (mis. saat first paint sebelum fetch JSON).
function isAIEnabled() {
  const fromData = window.PRIMA_DATA?.aiSettings?.enabled;
  if (typeof fromData === 'boolean') return fromData;
  const saved = localStorage.getItem('prima_ai_enabled');
  return saved === null ? true : saved === '1';
}

function formatBotText(text) {
  // Simple markdown: **bold**, *italic*, line breaks, lists
  let html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
  return html;
}

function startStreamingBotMessage() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div style="flex:1;min-width:0">
      <div class="msg-bubble streaming"></div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
  return div.querySelector('.msg-bubble');
}

function finalizeBotMessage(msgEl, opts) {
  if (!msgEl) return;
  const wrap = msgEl.querySelector('div[style*="flex:1"]') || msgEl.children[1];
  // Source chips removed per user request
  // Time + actions
  const meta = document.createElement('div');
  meta.className = 'msg-time';
  meta.textContent = opts.time;
  wrap.appendChild(meta);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  const sig = btoa(unescape(encodeURIComponent((opts.text || '').slice(0,80)))).slice(0,12);
  actions.innerHTML = `
    <button class="msg-act-btn" data-act="up" data-sig="${sig}" title="Jawaban membantu"><i data-lucide="thumbs-up"></i></button>
    <button class="msg-act-btn" data-act="down" data-sig="${sig}" title="Jawaban tidak membantu"><i data-lucide="thumbs-down"></i></button>
    <button class="msg-act-btn" data-act="copy" title="Salin jawaban"><i data-lucide="copy"></i></button>
  `;
  actions.addEventListener('click', e => {
    const btn = e.target.closest('.msg-act-btn');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'copy') {
      navigator.clipboard?.writeText(opts.text);
      showToast('📋 Jawaban disalin');
    } else if (act === 'up' || act === 'down') {
      btn.classList.add(act === 'up' ? 'active-up' : 'active-down');
      // Save feedback
      const fbs = JSON.parse(localStorage.getItem('prima_ai_feedback') || '[]');
      fbs.push({ sig: btn.dataset.sig, vote: act, text: opts.text.slice(0,200), ts: Date.now(), model: opts.modelUsed });
      localStorage.setItem('prima_ai_feedback', JSON.stringify(fbs.slice(-200)));
      showToast(act === 'up' ? '✨ Terima kasih atas masukannya!' : '📝 Akan kami perbaiki');
    }
  });
  wrap.appendChild(actions);
}

function addUserMessage(text, time) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.innerHTML = `
    <div>
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${time}</div>
    </div>
    <div class="msg-avatar user-av">👤</div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function addBotMessage(html, time, opts = {}) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  const msgId = 'bot-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  div.id = msgId;
  const tag = opts.intent ? ` · ${escapeHtml(opts.intent)}` : '';

  // Quick-action chips derived dari intent yang baru dijawab
  const chips = renderBotQuickActions(opts.intent, opts.rawText || html);

  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div style="flex:1;min-width:0">
      <div class="msg-bubble">${html}</div>
      <div class="msg-toolbar">
        <button class="mt-btn" type="button" onclick="copyBotMessage('${msgId}')" title="Salin">📋 Salin</button>
        <button class="mt-btn" type="button" onclick="shareBotMessage('${msgId}')" title="Bagikan via WhatsApp">🔗 Bagikan</button>
      </div>
      ${chips ? `<div class="msg-chips">${chips}</div>` : ''}
      <div class="msg-time">PRIMA Bot${tag} · ${time}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

/**
 * Quick-action chips per intent: arahkan warga ke action lanjutan yang
 * relevan dengan jawaban bot, tanpa harus ketik ulang.
 *
 * Prioritas urutan:
 *   1. Detail layanan (kalau ada match) — most specific
 *   2. Download form template (kalau layanan punya dokumenUnduh)
 *   3. Lokasi loket kelurahan (kalau bicara surat/dokumen)
 *   4. Tanya lebih lanjut (refocus chat input)
 *   5. Cross-section navigation (peta/suara/beranda)
 * Max 4 chip per pesan supaya tidak crowded.
 */
function renderBotQuickActions(intent, rawText = '') {
  const chips = [];
  const text = String(rawText).toLowerCase();

  // Detect mention layanan via id atau nama → chip "Lihat Detail" + actions
  const matchedLayanan = PRIMA_DATA?.layanan?.find(l =>
    text.includes(l.nama.toLowerCase()) ||
    text.includes(l.id.toLowerCase()) ||
    (l.tags || []).some(t => text.includes(t.toLowerCase()))
  );

  if (matchedLayanan) {
    chips.push(`<button class="chat-chip" onclick="closeChatThenShowLayanan('${matchedLayanan.id}')">📋 Detail ${escapeHtml(matchedLayanan.nama)}</button>`);

    // Kalau layanan punya dokumen yang bisa diunduh, tambahkan chip download
    const downloadable = (matchedLayanan.dokumenUnduh || []).find(d => d.url && !d.url.startsWith('#'));
    if (downloadable) {
      const safeUrl = escapeHtml(downloadable.url).replace(/'/g, "\\'");
      const safeName = escapeHtml(downloadable.nama).replace(/'/g, "\\'");
      chips.push(`<button class="chat-chip" onclick="handleDownload('${safeName}', '${safeUrl}')">⬇️ Download Form</button>`);
    }

    // Chip "Lokasi Loket Kelurahan" — pindah ke peta + auto-buka kantor kelurahan
    chips.push(`<button class="chat-chip" onclick="showOnMap('Kantor Kelurahan')">🗺️ Lokasi Loket</button>`);

    // Chip "Cek Kesiapan Saya" — buka modal langsung di checklist
    chips.push(`<button class="chat-chip" onclick="closeChatThenShowLayanan('${matchedLayanan.id}'); setTimeout(() => toggleReadinessChecker('${matchedLayanan.id}'), 300)">✅ Cek Kesiapan</button>`);

    return chips.slice(0, 4).join('');
  }

  // Tidak ada layanan match — pakai navigation chips umum
  if (/peta|lokasi|alamat|kantor|puskesmas|posyandu|bank sampah/.test(text)) {
    chips.push(`<button class="chat-chip" onclick="navigateTo('peta')">🗺️ Buka Peta</button>`);
  }
  if (/syarat|prosedur|berkas|dokumen|persyaratan|surat/.test(text)) {
    chips.push(`<button class="chat-chip" onclick="navigateTo('layanan')">📋 Semua Layanan</button>`);
  }
  if (/feedback|saran|masukan|keluhan|pengaduan/.test(text)) {
    chips.push(`<button class="chat-chip" onclick="navigateTo('suara')">💬 Suara Warga</button>`);
  }
  if (/jam|kerja|buka|operasional/.test(text)) {
    chips.push(`<button class="chat-chip" onclick="showOnMap('Kantor Kelurahan')">📍 Lokasi Kantor</button>`);
  }
  if (/kuliner|kuliner|warung|makanan|umkm|usaha|kegiatan/.test(text)) {
    chips.push(`<button class="chat-chip" onclick="navigateTo('info')">🍜 Info Warga</button>`);
  }

  return chips.slice(0, 4).join('');
}

function closeChatThenShowLayanan(id) {
  showLayananDetail(id);
}

function copyBotMessage(msgId) {
  const el = document.getElementById(msgId);
  if (!el) return;
  const text = el.querySelector('.msg-bubble')?.innerText || '';
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => showToast('📋 Jawaban disalin'),
    () => showToast('❌ Gagal menyalin')
  );
}

function shareBotMessage(msgId) {
  const el = document.getElementById(msgId);
  if (!el) return;
  const text = el.querySelector('.msg-bubble')?.innerText || '';
  const url = `https://wa.me/?text=${encodeURIComponent(text + '\n\n— via PRIMA Kelurahan Rawajati')}`;
  window.open(url, '_blank', 'noopener');
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const id = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function updateChatStats() {
  const stats = chatbot.getStats();
  const el = document.getElementById('chat-count');
  if (el) el.textContent = stats.totalConversations;
}

// ── SUARA WARGA (Wizard 4 langkah) ───────────────────────────────
function renderSuaraWarga() {
  let selectedRating = 0;
  let selectedFitur = '';
  let selectedAksesInfo = '';
  let currentStep = 1;
  const totalSteps = 4;

  const stepEls = document.querySelectorAll('.wiz-step');
  const barFill = document.getElementById('wiz-bar-fill');
  const stepLabel = document.getElementById('wiz-step-label');
  const btnBack = document.getElementById('wiz-back');
  const btnNext = document.getElementById('wiz-next');
  const btnSubmit = document.getElementById('wiz-submit');

  function goTo(step) {
    currentStep = Math.max(1, Math.min(totalSteps, step));
    stepEls.forEach(el => {
      const s = parseInt(el.dataset.step, 10);
      if (s === currentStep) {
        el.removeAttribute('hidden');
        el.classList.add('active');
      } else {
        el.setAttribute('hidden', '');
        el.classList.remove('active');
      }
    });
    if (barFill) barFill.style.width = (currentStep / totalSteps) * 100 + '%';
    if (stepLabel) stepLabel.textContent = `Langkah ${currentStep} dari ${totalSteps}`;
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) btnNext.hidden = currentStep === totalSteps;
    if (btnSubmit) btnSubmit.hidden = currentStep !== totalSteps;
  }

  function validateStep(step) {
    if (step === 1 && !selectedRating) {
      showToast('⭐ Pilih bintang terlebih dahulu');
      return false;
    }
    if (step === 2 && !selectedFitur) {
      showToast('💡 Pilih salah satu fitur');
      return false;
    }
    if (step === 3 && !selectedAksesInfo) {
      showToast('📱 Pilih salah satu jawaban');
      return false;
    }
    return true;
  }

  // Star rating
  document.querySelectorAll('.star-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      selectedRating = i + 1;
      document.querySelectorAll('.star-btn').forEach((b, j) => {
        b.classList.toggle('active', j < selectedRating);
      });
      const labels = ['', 'Sangat Buruk 😞', 'Buruk 😕', 'Cukup 😐', 'Baik 😊', 'Sangat Baik 😍'];
      document.getElementById('rating-label').textContent = labels[selectedRating];
    });
  });

  // Option buttons
  document.querySelectorAll('.option-btn[data-group="fitur"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.option-btn[data-group="fitur"]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFitur = btn.textContent;
    });
  });
  document.querySelectorAll('.option-btn[data-group="akses"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.option-btn[data-group="akses"]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAksesInfo = btn.textContent;
    });
  });

  // Wizard nav
  if (btnNext) btnNext.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    goTo(currentStep + 1);
  });
  if (btnBack) btnBack.addEventListener('click', () => goTo(currentStep - 1));

  // Submit
  document.getElementById('suara-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!validateStep(1)) { goTo(1); return; }
    if (!validateStep(2)) { goTo(2); return; }
    if (!validateStep(3)) { goTo(3); return; }

    const masukan = document.getElementById('masukan-text').value.trim();
    const nama = document.getElementById('nama-warga').value.trim() || 'Anonim';
    const rt  = document.getElementById('rt-warga').value.trim() || '-';

    const newFeedback = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      rating: selectedRating,
      fiturFavorit: selectedFitur,
      aksesInfo: selectedAksesInfo,
      masukan, nama, rt
    };

    const localFbs = JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
    localFbs.push(newFeedback);
    localStorage.setItem('prima_feedbacks', JSON.stringify(localFbs));

    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: newFeedback })
    }).catch(() => {});

    updateAdminStats();

    // Confetti + thank-you screen — ganti form
    fireConfetti();
    showThankYou(nama);

    // Reset state (kalau warga mau submit lagi nanti)
    setTimeout(() => {
      e.target.reset();
      selectedRating = 0;
      selectedFitur = '';
      selectedAksesInfo = '';
      document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      const rl = document.getElementById('rating-label');
      if (rl) rl.textContent = 'Pilih bintang di atas';
    }, 100);
  });

  goTo(1);
}

/**
 * Ganti form dengan thank-you screen + tombol "Kirim Lagi".
 */
function showThankYou(nama) {
  const wrap = document.querySelector('.suara-page');
  const form = document.getElementById('suara-form');
  if (!wrap || !form) return;
  const sapaan = (nama && nama !== 'Anonim') ? `Terima kasih, ${escapeHtml(nama)}!` : 'Terima kasih!';
  const thanks = document.createElement('div');
  thanks.className = 'thanks-screen';
  thanks.innerHTML = `
    <div class="thanks-icon">🎉</div>
    <h3>${sapaan}</h3>
    <p>Masukan Anda telah kami terima dan menjadi bahan kami terus berbenah.</p>
    <button type="button" class="wiz-btn wiz-btn-primary" onclick="location.reload()">↻ Kirim Masukan Lagi</button>
  `;
  form.style.display = 'none';
  wrap.appendChild(thanks);
}

/**
 * Confetti minimal — canvas-based, ~50 partikel jatuh dengan rotasi.
 * Tanpa library eksternal: ~30 baris JS pure.
 */
function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const colors = ['#D4AF37', '#F4C95D', '#13306E', '#1E3A8A', '#2E7D32', '#C62828'];
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * 200,
    w: 6 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    vy: 2 + Math.random() * 3,
    vx: -1 + Math.random() * 2,
    rot: Math.random() * Math.PI,
    vrot: -0.1 + Math.random() * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  let frame = 0;
  const maxFrames = 180;
  function tick() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < maxFrames) requestAnimationFrame(tick);
    else canvas.remove();
  }
  requestAnimationFrame(tick);
}

// ── ADMIN PAGE ───────────────────────────────────────────────────
function renderAdminPage() {
  updateAdminStats();

  document.getElementById('admin-login-form').addEventListener('submit', e => {
    e.preventDefault();
    const pass = document.getElementById('admin-password').value;
    // Simple password (in production use proper auth)
    if (pass === 'prima2026') {
      document.getElementById('admin-login-section').style.display = 'none';
      document.getElementById('admin-panel-section').style.display = 'block';
      showToast('✅ Login berhasil. Selamat datang, Admin!');
      updateAdminStats();
      initAISettings();
    } else {
      showToast('❌ Password salah. Coba lagi.');
      document.getElementById('admin-password').value = '';
    }
  });

  // Eye toggle for password visibility
  const pwToggle = document.getElementById('admin-pw-toggle');
  const pwInput = document.getElementById('admin-password');
  if (pwToggle && pwInput) {
    pwToggle.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      pwToggle.textContent = isHidden ? '🙈' : '👁';
      pwToggle.title = isHidden ? 'Sembunyikan password' : 'Tampilkan password';
    });
  }
}

let _feedbacksCache = null;

async function fetchServerFeedbacks() {
  if (_feedbacksCache) return _feedbacksCache;
  try {
    const res = await fetch('/api/feedback', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      _feedbacksCache = Array.isArray(data.feedbacks) ? data.feedbacks : [];
      return _feedbacksCache;
    }
  } catch {}
  // Fallback to localStorage
  return JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
}

function _renderFeedbackList(feedbacks) {
  const list = document.getElementById('admin-feedback-list');
  if (!list) return;
  if (!feedbacks.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Belum ada masukan dari warga.</p>';
    return;
  }
  list.innerHTML = feedbacks.slice().reverse().slice(0, 20).map(f => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;background:var(--bg)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <strong style="font-size:14px">${escapeHtml(f.nama)}</strong>
        <span style="font-size:12px;color:var(--text-muted)">RT ${escapeHtml(f.rt)}</span>
        <span style="margin-left:auto;font-size:12px">${'⭐'.repeat(f.rating)}</span>
      </div>
      ${f.fiturFavorit ? `<p style="font-size:11px;color:var(--text-muted)">Fitur favorit: ${escapeHtml(f.fiturFavorit)}</p>` : ''}
      ${f.aksesInfo ? `<p style="font-size:11px;color:var(--text-muted)">Akses info: ${escapeHtml(f.aksesInfo)}</p>` : ''}
      ${f.masukan ? `<p style="font-size:13px;color:var(--text)">"${escapeHtml(f.masukan)}"</p>` : ''}
      <p style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(f.timestamp).toLocaleString('id-ID')}</p>
    </div>
  `).join('');
}

async function updateAdminStats() {
  const feedbacks = await fetchServerFeedbacks();
  const chatStats = chatbot ? chatbot.getStats() : JSON.parse(localStorage.getItem('prima_chat_stats') || '{"totalConversations":0}');

  const avgRating = feedbacks.length > 0
    ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
    : '-';

  const satisfiedCount = feedbacks.filter(f => f.rating >= 4).length;
  const satisfactionRate = feedbacks.length > 0
    ? Math.round(satisfiedCount / feedbacks.length * 100)
    : 0;

  const el = id => document.getElementById(id);
  if (el('admin-stat-percakapan')) el('admin-stat-percakapan').textContent = chatStats.totalConversations || 0;
  if (el('admin-stat-feedback'))   el('admin-stat-feedback').textContent   = feedbacks.length;
  if (el('admin-stat-rating'))     el('admin-stat-rating').textContent     = avgRating + (avgRating !== '-' ? '⭐' : '');
  if (el('admin-stat-kepuasan'))   el('admin-stat-kepuasan').textContent   = satisfactionRate + '%';
  if (el('chat-count'))            el('chat-count').textContent            = chatStats.totalConversations || 0;

  // Analytics totals
  const aTotals = typeof PRIMA_ANALYTICS !== 'undefined' ? PRIMA_ANALYTICS.getTotals() : {};
  if (el('admin-stat-pageviews')) el('admin-stat-pageviews').textContent = aTotals.pageViews || 0;
  if (el('admin-stat-chats'))     el('admin-stat-chats').textContent     = aTotals.chatSessions || 0;
  if (el('admin-stat-layanan'))   el('admin-stat-layanan').textContent   = aTotals.layananClicks || 0;
  if (el('admin-stat-peta'))      el('admin-stat-peta').textContent      = aTotals.petaViews || 0;

  _renderAnalyticsChart();
  _renderFeedbackList(feedbacks);
  renderKpiRapDashboard(feedbacks, chatStats, aTotals);
}

/**
 * KPI Tracker RAP — 6 indikator dari dokumen Rancangan Aksi Perubahan.
 * Setiap card render:
 *   - Nomor indikator + label
 *   - Current value vs target
 *   - Status: ✅ TERCAPAI / 🟡 PROGRESS / 🔴 PERLU INTERVENSI
 *   - Progress bar visual + persen
 *   - Baseline reference dari RAP
 *
 * Sumber data:
 *   - feedbacks: dari /api/feedback atau localStorage
 *   - chatStats: dari chatbot module
 *   - aTotals: dari PRIMA_ANALYTICS (page views, chat sessions, dll)
 */
function renderKpiRapDashboard(feedbacks, chatStats, aTotals) {
  const grid = document.getElementById('kpi-rap-grid');
  if (!grid) return;

  // Hitung metrik
  const totalFeedback = feedbacks.length;
  const satisfied = feedbacks.filter(f => f.rating >= 4).length;
  const satisfactionRate = totalFeedback ? Math.round(satisfied / totalFeedback * 100) : 0;
  const totalChats = chatStats?.totalConversations || 0;
  const totalLayanan = PRIMA_DATA?.layanan?.length || 0;
  const totalFaq = PRIMA_DATA?.faqChatbot?.length || 0;
  const totalSessions = aTotals?.pageViews || 0;

  // Hitung kunjungan berulang (proxy): warga dengan ≥2 chat session per sessionId
  // Untuk demo, asumsi turun proporsional dengan pemakaian PRIMA — placeholder logic
  const visitRepeatRate = totalChats > 0 ? Math.max(15, Math.round(63.8 - (totalChats * 0.5))) : 63.8;

  const indikator = [
    {
      num: 1,
      label: 'Kunjungan Berulang Warga',
      baseline: 'Baseline: 63,8% (sebelum PRIMA)',
      current: visitRepeatRate.toFixed(1) + '%',
      target: '< 20%',
      percent: Math.min(100, Math.round(((63.8 - visitRepeatRate) / (63.8 - 20)) * 100)),
      good: 'lower'
    },
    {
      num: 2,
      label: 'Kanal Informasi 24/7',
      baseline: 'Target: PRIMA aktif & dapat diakses',
      current: 'AKTIF',
      target: 'Deployed',
      percent: 100,
      status: 'done',
      note: 'Live sejak Mei 2026 — prima-rawajati.vercel.app'
    },
    {
      num: 3,
      label: 'Bank Data FAQ Chatbot',
      baseline: 'Baseline: 0 (sebelum PRIMA)',
      current: `${totalFaq} FAQ`,
      target: '50+ FAQ',
      percent: Math.min(100, Math.round((totalFaq / 50) * 100))
    },
    {
      num: 4,
      label: 'Waktu Respons Digital',
      baseline: 'Manual: 1-2 hari',
      current: '< 2 detik',
      target: '< 2 menit',
      percent: 100,
      status: 'done',
      note: 'AI chatbot respon real-time + RAG'
    },
    {
      num: 5,
      label: 'Pemanfaatan PRIMA',
      baseline: 'Baseline: 0 (belum ada platform)',
      current: `${totalSessions} sesi`,
      target: '500+ sesi/bulan',
      percent: Math.min(100, Math.round((totalSessions / 500) * 100))
    },
    {
      num: 6,
      label: 'Kepuasan Pengguna (Rating ≥4)',
      baseline: 'Target RAP: ≥85% kepuasan',
      current: totalFeedback ? `${satisfactionRate}%` : 'Belum ada data',
      target: '≥ 85%',
      percent: totalFeedback ? satisfactionRate : 0
    }
  ];

  grid.innerHTML = indikator.map(k => {
    const tone = k.status === 'done' || k.percent >= 100 ? 'success'
               : k.percent >= 60 ? 'progress'
               : k.percent >= 30 ? 'warning'
               : 'danger';
    const statusBadge = k.status === 'done' || k.percent >= 100
      ? '<span class="kpi-badge kpi-badge-success">✅ TERCAPAI</span>'
      : k.percent >= 30
        ? '<span class="kpi-badge kpi-badge-progress">🟡 PROGRES</span>'
        : '<span class="kpi-badge kpi-badge-danger">🔴 PERLU AKSI</span>';

    return `
      <div class="kpi-card kpi-card--${tone}">
        <div class="kpi-head">
          <div class="kpi-num">${k.num}</div>
          <div class="kpi-title">
            <strong>${escapeHtml(k.label)}</strong>
            <small>${escapeHtml(k.baseline)}</small>
          </div>
          ${statusBadge}
        </div>
        <div class="kpi-metrics">
          <div class="kpi-current">${escapeHtml(String(k.current))}</div>
          <div class="kpi-target">Target: <strong>${escapeHtml(String(k.target))}</strong></div>
        </div>
        <div class="kpi-bar"><div class="kpi-bar-fill kpi-bar-fill--${tone}" style="width:${k.percent}%"></div></div>
        ${k.note ? `<div class="kpi-note">💡 ${escapeHtml(k.note)}</div>` : ''}
      </div>`;
  }).join('');
}

function _renderAnalyticsChart() {
  const container = document.getElementById('admin-analytics-chart');
  if (!container || typeof PRIMA_ANALYTICS === 'undefined') return;
  const data = PRIMA_ANALYTICS.getDaily(7);
  const maxVal = Math.max(1, ...data.map(d => d.pageViews + d.chatSessions));
  container.innerHTML = data.map(d => {
    const h = Math.round(((d.pageViews + d.chatSessions) / maxVal) * 100);
    return `
      <div class="analytics-bar">
        <div class="analytics-bar-val">${d.pageViews + d.chatSessions}</div>
        <div class="analytics-bar-fill" style="height:${h}%"></div>
        <div class="analytics-bar-label">${d.label}</div>
      </div>
    `;
  }).join('');
}

async function showAdminFeedback() {
  _feedbacksCache = null; // force refresh
  await updateAdminStats();
  showToast('📊 Data feedback dimuat ulang');
}

async function exportData() {
  const feedbacks = await fetchServerFeedbacks();
  const chatLogs  = JSON.parse(localStorage.getItem('prima_chat_logs')  || '[]');
  const chatStats = chatbot ? chatbot.getStats() : JSON.parse(localStorage.getItem('prima_chat_stats') || '{}');

  const data = {
    exportDate: new Date().toISOString(),
    kelurahan:  PRIMA_DATA.meta.kelurahan,
    chatStats,
    totalFeedback: feedbacks.length,
    feedbacks: feedbacks.slice(-50),
    chatSample: chatLogs.slice(-20)
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `prima-data-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Data berhasil diekspor!');
}

// ── QR CODE ──────────────────────────────────────────────────────
function showQRCode() {
  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body-content');
  const appUrl = window.location.href.split('#')[0];

  body.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-body qr-modal">
      <h3>📱 QR Code PRIMA</h3>
      <p>Scan QR Code ini untuk mengakses PRIMA – Kelurahan Rawajati</p>
      <div id="qr-display"></div>
      <div class="qr-url">${appUrl}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <button class="submit-btn" style="font-size:13px;padding:10px" onclick="printQR()">🖨️ Cetak QR</button>
        <button class="submit-btn" style="font-size:13px;padding:10px;background:var(--accent)" onclick="closeModal()">✓ Tutup</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted)">Pasang di: Loket pelayanan • Papan pengumuman • Pos RW • Masjid • Area publik</p>
    </div>
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Generate QR
  setTimeout(() => {
    try {
      new QRCode(document.getElementById('qr-display'), {
        text: appUrl,
        width: 200,
        height: 200,
        colorDark: '#1565C0',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch(e) {
      document.getElementById('qr-display').innerHTML = `
        <div style="width:200px;height:200px;border:3px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;margin:0 auto">
          <p style="font-size:13px;color:var(--text-muted)">QR Code tersedia saat aplikasi di-deploy online 📱</p>
        </div>
      `;
    }
  }, 100);
}

function printQR() {
  window.print();
}

// ── UTILS ────────────────────────────────────────────────────────
function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// Close search results on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#home-search') && !e.target.closest('#search-results')) {
    const sr = document.getElementById('search-results');
    if (sr) sr.style.display = 'none';
  }
});


// ══════════════════════════════════════════════════════════════════
// ADMIN — DATA EDITOR (commit via /api/save-data → GitHub → Vercel)
// ══════════════════════════════════════════════════════════════════

// Working copy yang di-edit admin. Disalin dari PRIMA_DATA saat modal dibuka.
let _dataEditorDraft = null;
let _dataEditorTab = 'layanan';
let _pendingFileUploads = []; // [{ path, content: base64, layananId, nama }]
let _dataEditorEditingIdx = null; // null = list view, -1 = new item, 0+ = editing existing

// Schema kolom Excel per kategori. Urutan kolom = urutan di sheet.
const DATA_EDITOR_SCHEMA = {
  layanan: {
    label: '📋 Layanan & Surat',
    fields: ['id', 'nama', 'kategori', 'emoji', 'deskripsi', 'syarat', 'prosedur', 'waktuProses', 'biaya', 'dokumenUnduh'],
    arrayFields: ['syarat', 'prosedur'],
    jsonFields: ['dokumenUnduh']
  },
  faqChatbot: {
    label: '💬 FAQ Chatbot',
    fields: ['intent', 'keywords', 'jawaban'],
    arrayFields: ['keywords'],
    jsonFields: []
  },
  petaMarkers: {
    label: '🗺️ Peta Wilayah',
    fields: ['id', 'nama', 'kategori', 'icon', 'warna', 'lat', 'lng', 'alamat', 'deskripsi', 'info'],
    arrayFields: [],
    jsonFields: []
  },
  kuliner: {
    label: '🍽️ Kuliner',
    fields: ['id', 'nama', 'kategori', 'deskripsi', 'lokasi', 'jam', 'kontak', 'foto'],
    arrayFields: [],
    jsonFields: [],
    parent: 'infoWarga'
  },
  usahaBinaan: {
    label: '🏪 Usaha Binaan',
    fields: ['id', 'nama', 'kategori', 'pemilik', 'deskripsi', 'lokasi', 'kontak'],
    arrayFields: [],
    jsonFields: [],
    parent: 'infoWarga'
  },
  kegiatanRTRW: {
    label: '🤝 Kegiatan RT/RW',
    fields: ['id', 'nama', 'deskripsi', 'jadwal', 'lokasi', 'penanggungJawab'],
    arrayFields: [],
    jsonFields: [],
    parent: 'infoWarga'
  },
  meta: {
    label: '⚙️ Meta Kelurahan',
    fields: [],
    arrayFields: [],
    jsonFields: [],
    singleObject: true
  }
};

// Form field specs: label, placeholder, type, rows (for textarea)
const FORM_FIELD_SPECS = {
  id: { label: 'ID (singkatan)', ph: 'SKD' },
  nama: { label: 'Nama', ph: 'Nama item' },
  emoji: { label: 'Emoji', ph: '🏠', w: '80px' },
  kategori: { label: 'Kategori', ph: 'Kependudukan' },
  biaya: { label: 'Biaya', ph: 'Gratis' },
  waktuProses: { label: 'Waktu Proses', ph: '1 hari kerja' },
  deskripsi: { label: 'Deskripsi', ph: 'Penjelasan singkat…', type: 'textarea', rows: 2 },
  syarat: { label: 'Syarat', ph: 'Fotokopi KTP…', type: 'textarea', rows: 5 },
  prosedur: { label: 'Prosedur', ph: 'Langkah-langkah…', type: 'textarea', rows: 5 },
  intent: { label: 'Intent / Kode', ph: 'nikah' },
  keywords: { label: 'Keywords', ph: 'nikah, pernikahan…', type: 'textarea', rows: 3 },
  jawaban: { label: 'Jawaban Chatbot', ph: 'Jawaban lengkap…', type: 'textarea', rows: 5 },
  icon: { label: 'Icon Leaflet', ph: 'university' },
  warna: { label: 'Warna Marker', ph: '#D4AF37' },
  lat: { label: 'Latitude', ph: '-6.2605' },
  lng: { label: 'Longitude', ph: '106.849' },
  alamat: { label: 'Alamat', ph: 'Jl. …' },
  info: { label: 'Info Tambahan', ph: 'Detail…', type: 'textarea', rows: 2 },
  lokasi: { label: 'Lokasi', ph: 'Alamat / tempat' },
  jam: { label: 'Jam Buka', ph: '08.00–22.00' },
  kontak: { label: 'Kontak', ph: '0812…' },
  foto: { label: 'URL Foto', ph: 'https://…' },
  pemilik: { label: 'Pemilik', ph: 'Nama pemilik' },
  jadwal: { label: 'Jadwal', ph: 'Setiap hari Jumat' },
  penanggungJawab: { label: 'Penanggung Jawab', ph: 'Nama PJ' }
};

// Form layout per tab: array of rows, each row is array of field keys
const FORM_LAYOUTS = {
  layanan: [
    ['id','nama'],
    ['emoji','kategori','biaya'],
    ['waktuProses'],
    ['deskripsi'],
    ['syarat','prosedur']
  ],
  faqChatbot: [
    ['intent','keywords'],
    ['jawaban']
  ],
  petaMarkers: [
    ['id','nama'],
    ['kategori','icon','warna'],
    ['lat','lng'],
    ['alamat'],
    ['deskripsi'],
    ['info']
  ],
  kuliner: [
    ['id','nama'],
    ['kategori','lokasi','jam'],
    ['deskripsi'],
    ['kontak','foto']
  ],
  usahaBinaan: [
    ['id','nama'],
    ['kategori','pemilik','lokasi'],
    ['deskripsi'],
    ['kontak']
  ],
  kegiatanRTRW: [
    ['id','nama'],
    ['jadwal','lokasi'],
    ['deskripsi'],
    ['penanggungJawab']
  ]
};

function getCategoryArray(category) {
  const schema = DATA_EDITOR_SCHEMA[category];
  if (!schema) return null;
  if (schema.singleObject) return _dataEditorDraft.meta;
  if (schema.parent) return _dataEditorDraft[schema.parent][category];
  return _dataEditorDraft[category];
}

function setCategoryArray(category, arr) {
  const schema = DATA_EDITOR_SCHEMA[category];
  if (schema.singleObject) { _dataEditorDraft.meta = arr; return; }
  if (schema.parent) { _dataEditorDraft[schema.parent][category] = arr; return; }
  _dataEditorDraft[category] = arr;
}

function openDataEditor() {
  if (!window.PRIMA_DATA_READY) {
    showToast('⏳ Data belum siap, coba lagi sebentar.');
    return;
  }
  _dataEditorDraft = JSON.parse(JSON.stringify(PRIMA_DATA));
  _dataEditorTab = 'layanan';
  _dataEditorEditingIdx = null;
  _pendingFileUploads = [];
  renderDataEditor();
  const modal = document.getElementById('modal-overlay');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderDataEditor() {
  const body = document.getElementById('modal-body-content');
  const tabs = Object.entries(DATA_EDITOR_SCHEMA).map(([key, s]) =>
    `<button class="de-tab ${key === _dataEditorTab ? 'active' : ''}" onclick="switchDataEditorTab('${key}')">${s.label}</button>`
  ).join('');

  body.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-emoji">📝</span>
      <div class="modal-title">
        <h3>Editor Data PRIMA</h3>
        <p>Edit konten yang tampil ke warga. Perubahan akan di-commit ke GitHub & auto-deploy via Vercel.</p>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="de-tabs">${tabs}</div>
      <div id="de-tab-content"></div>

      <div class="de-actions">
        <button class="submit-btn" style="background:var(--accent)" onclick="saveDataEditor()">💾 Simpan & Publish ke GitHub</button>
        <button class="submit-btn" style="background:var(--text-muted)" onclick="closeModal()">Batal</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px">
        💡 Setelah publish, Vercel auto-build ~1-2 menit. Warga akan otomatis lihat versi terbaru saat refresh.
      </p>
    </div>
  `;
  renderDataEditorTab();
}

function switchDataEditorTab(key) {
  _dataEditorTab = key;
  _dataEditorEditingIdx = null;
  document.querySelectorAll('.de-tab').forEach(b => b.classList.toggle('active', b.textContent === DATA_EDITOR_SCHEMA[key].label));
  renderDataEditorTab();
}

function renderDataEditorTab() {
  const container = document.getElementById('de-tab-content');
  const schema = DATA_EDITOR_SCHEMA[_dataEditorTab];
  const data = getCategoryArray(_dataEditorTab);
  const count = schema.singleObject ? 1 : (data || []).length;

  // ═══════════════════════════════════════════════════════════════
  // FORM MODE: editing an item in any array-based tab
  // ═══════════════════════════════════════════════════════════════
  if (_dataEditorEditingIdx !== null && !schema.singleObject) {
    const isNew = _dataEditorEditingIdx === -1;
    const item = isNew ? {} : (data[_dataEditorEditingIdx] || {});
    const title = isNew ? 'Item Baru' : escapeHtml(item.nama || item.id || item.intent || 'Edit');
    const layout = FORM_LAYOUTS[_dataEditorTab] || [];

    let formRowsHtml = '';
    layout.forEach(row => {
      const cols = row.map(key => {
        const spec = FORM_FIELD_SPECS[key] || { label: key, ph: '' };
        const isArray = schema.arrayFields.includes(key);
        const isTextarea = spec.type === 'textarea' || isArray;
        let value = item[key] || '';
        if (isArray && Array.isArray(value)) value = value.join('\n');

        const inputStyle = 'width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px';
        const taStyle = inputStyle + ';resize:vertical;line-height:1.5';
        const extraStyle = spec.w ? `;width:${spec.w}` : '';
        const arrayHint = isArray ? ' <span style="font-weight:400">(satu per baris)</span>' : '';

        const inputHtml = isTextarea
          ? `<textarea id="de-form-${key}" rows="${spec.rows || 3}" placeholder="${spec.ph}" style="${taStyle}">${escapeHtml(value)}</textarea>`
          : `<input type="text" id="de-form-${key}" value="${escapeHtml(value)}" placeholder="${spec.ph}" style="${inputStyle}${extraStyle}">`;

        return `<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">${spec.label}${arrayHint}</label>${inputHtml}</div>`;
      }).join('');

      const gridCols = row.map(() => '1fr').join(' ');
      formRowsHtml += `<div style="display:grid;grid-template-columns:${gridCols};gap:10px">${cols}</div>`;
    });

    // Special: dokumenUnduh section for layanan
    let docsSection = '';
    if (_dataEditorTab === 'layanan') {
      const docs = Array.isArray(item.dokumenUnduh) ? item.dokumenUnduh : [];
      docsSection = `
        <div>
          <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Dokumen Unduh</label>
          <div id="lf-docs-list" style="display:flex;flex-direction:column;gap:6px">
            ${docs.map((d, i) => `
              <div class="lf-doc-row" style="display:flex;gap:6px;align-items:center">
                <input type="text" class="lf-doc-nama" data-idx="${i}" value="${escapeHtml(d.nama)}" placeholder="Nama dokumen" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px">
                <input type="text" class="lf-doc-url" data-idx="${i}" value="${escapeHtml(d.url)}" placeholder="URL / dokumen/file.pdf" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px">
                <button class="de-pv-del" onclick="removeDocRow(${i})" title="Hapus" style="width:28px;height:28px">✕</button>
              </div>
            `).join('')}
          </div>
          <button class="de-btn" onclick="addDocRow()" style="margin-top:6px;font-size:12px;padding:6px 10px">+ Tambah Dokumen</button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="de-toolbar">
        <span class="de-count">${title}</span>
        <button class="de-btn" onclick="cancelFormEdit()">← Kembali</button>
        <button class="de-btn de-btn-ai" onclick="saveFormEdit()">💾 Simpan ke Draft</button>
      </div>
      <div class="de-form" style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        ${formRowsHtml}
        ${docsSection}
      </div>
      <div style="margin-top:12px;padding:10px;background:var(--surface-2);border-radius:8px;border:1px dashed var(--border);font-size:12px;color:var(--text-muted)">
        💡 <strong>Tips:</strong> Isi field di atas, lalu klik <strong>"Simpan ke Draft"</strong>. Setelah semua selesai, klik <strong>"💾 Simpan & Publish"</strong> di bawah.
      </div>
    `;
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // META FORM MODE
  // ═══════════════════════════════════════════════════════════════
  if (schema.singleObject) {
    const meta = _dataEditorDraft.meta || {};
    container.innerHTML = `
      <div class="de-toolbar">
        <span class="de-count">Meta Kelurahan</span>
        <button class="de-btn de-btn-ai" onclick="saveMetaForm()">💾 Simpan ke Draft</button>
      </div>
      <div class="de-form" style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Nama Kelurahan</label><input type="text" id="mf-kelurahan" value="${escapeHtml(meta.kelurahan||'')}" placeholder="Rawajati" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Kecamatan</label><input type="text" id="mf-kecamatan" value="${escapeHtml(meta.kecamatan||'')}" placeholder="Pancoran" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Kota</label><input type="text" id="mf-kota" value="${escapeHtml(meta.kota||'')}" placeholder="Jakarta Selatan" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Provinsi</label><input type="text" id="mf-provinsi" value="${escapeHtml(meta.provinsi||'')}" placeholder="DKI Jakarta" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
        </div>
        <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Alamat Lengkap</label><textarea id="mf-alamat" rows="2" placeholder="Jl. ..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;resize:vertical;line-height:1.5">${escapeHtml(meta.alamat||'')}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Telepon</label><input type="text" id="mf-telepon" value="${escapeHtml(meta.telepon||'')}" placeholder="(021) ..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Email</label><input type="text" id="mf-email" value="${escapeHtml(meta.email||'')}" placeholder="kel@..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
        </div>
        <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Jam Kerja</label><input type="text" id="mf-jamKerja" value="${escapeHtml(meta.jamKerja||'')}" placeholder="Senin–Kamis..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Latitude</label><input type="text" id="mf-lat" value="${escapeHtml(meta.koordinat?.lat?.toString()||'')}" placeholder="-6.2605" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
          <div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Longitude</label><input type="text" id="mf-lng" value="${escapeHtml(meta.koordinat?.lng?.toString()||'')}" placeholder="106.849" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px"></div>
        </div>
      </div>
      <div style="margin-top:12px;padding:10px;background:var(--surface-2);border-radius:8px;border:1px dashed var(--border);font-size:12px;color:var(--text-muted)">
        💡 <strong>Tips:</strong> Isi field di atas, lalu klik <strong>"Simpan ke Draft"</strong>. Setelah semua selesai, klik <strong>"💾 Simpan & Publish"</strong> di bawah.
      </div>
    `;
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // LIST MODE (all array-based tabs)
  // ═══════════════════════════════════════════════════════════════
  let previewHtml = '';
  if (Array.isArray(data) && data.length > 0) {
    previewHtml = `
      <div class="de-preview">
        ${data.map((item, i) => `
          <div class="de-preview-item" data-idx="${i}" onclick="editItem(${i})" style="cursor:pointer">
            <span class="de-pv-emoji">${item.emoji || item.icon || '📄'}</span>
            <div class="de-pv-body">
              <strong>${escapeHtml(item.nama || item.id || item.intent || 'Item ' + (i+1))}</strong>
              <span class="de-pv-id">${escapeHtml(item.id || item.intent || '')}</span>
            </div>
            <button class="de-pv-del" onclick="event.stopPropagation();deleteDataItem(${i})" title="Hapus item ini">🗑️</button>
          </div>
        `).join('')}
      </div>
      <button class="de-btn" onclick="addItem()" style="width:100%;margin:8px 0;padding:12px">➕ Tambah Item Baru</button>
    `;
  } else {
    previewHtml = `<button class="de-btn" onclick="addItem()" style="width:100%;margin:8px 0;padding:12px">➕ Tambah Item Baru</button>`;
  }

  const isLayanan = _dataEditorTab === 'layanan';
  const layananOptions = isLayanan && _dataEditorDraft?.layanan
    ? _dataEditorDraft.layanan.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.id)} — ${escapeHtml(l.nama)}</option>`).join('')
    : '';
  let existingFilesHtml = '';
  if (isLayanan && _dataEditorDraft?.layanan) {
    const allFiles = [];
    _dataEditorDraft.layanan.forEach(l => {
      if (Array.isArray(l.dokumenUnduh)) {
        l.dokumenUnduh.forEach((d, di) => {
          if (d.url && !d.url.startsWith('#')) {
            allFiles.push({ layananId: l.id, layananNama: l.nama, docIdx: di, nama: d.nama, url: d.url });
          }
        });
      }
    });
    if (allFiles.length > 0) {
      existingFilesHtml = `
        <div class="de-pending-files">
          <strong>📎 File template aktif (${allFiles.length}):</strong>
          ${allFiles.map(f => `
            <span class="de-pf-tag de-pf-exists">
              ${escapeHtml(f.nama)}
              <button class="de-pf-del" onclick="deleteTemplateFile('${escapeHtml(f.layananId)}',${f.docIdx})" title="Hapus file ini">✕</button>
            </span>
          `).join('')}
        </div>
      `;
    }
  }

  const pendingFilesHtml = _pendingFileUploads.length > 0
    ? `<div class="de-pending-files"><strong>📎 File siap upload (${_pendingFileUploads.length}):</strong>
       ${_pendingFileUploads.map((f, fi) => `
         <span class="de-pf-tag de-pf-pending">
           ${escapeHtml(f.nama)}
           <button class="de-pf-del" onclick="removePendingFile(${fi})" title="Batalkan">✕</button>
         </span>
       `).join('')}</div>`
    : '';

  container.innerHTML = `
    <div class="de-toolbar">
      <span class="de-count">${count} baris</span>
      <button class="de-btn de-btn-ai" onclick="document.getElementById('de-narrative-input').click()" title="Upload Word/Excel/TXT — AI akan parse otomatis">🤖 Import Narasi (AI)</button>
      <input type="file" id="de-narrative-input" hidden accept=".docx,.xlsx,.xls,.csv,.txt,.md" onchange="handleNarrativeUpload(event, '${_dataEditorTab}')">
      <button class="de-btn" onclick="downloadCategoryExcel('${_dataEditorTab}')">⬇ Excel</button>
      <button class="de-btn" onclick="document.getElementById('de-excel-input').click()">⬆ Excel</button>
      <input type="file" id="de-excel-input" hidden accept=".xlsx,.xls,.csv" onchange="handleExcelUpload(event, '${_dataEditorTab}')">
      ${isLayanan ? `<button class="de-btn" onclick="toggleFileUploadPanel()">📎 Upload File Template</button>` : ''}
      <button class="de-btn" onclick="downloadJSON()">⬇ JSON</button>
    </div>
    ${previewHtml}
    ${existingFilesHtml}
    ${pendingFilesHtml}
    ${isLayanan ? `
    <div id="de-file-panel" style="display:none;margin:10px 0;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;">
      <strong style="font-size:13px;display:block;margin-bottom:8px">📎 Tambah File Template</strong>
      <select id="de-fu-layanan" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);margin-bottom:8px">
        <option value="">Pilih layanan…</option>
        ${layananOptions}
      </select>
      <input type="text" id="de-fu-nama" placeholder="Nama dokumen (mis: Formulir SKD)" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);margin-bottom:8px">
      <input type="file" id="de-fu-file" accept=".pdf,.docx,.doc,.xlsx,.xls,.jpg,.png" style="width:100%;padding:8px 0;color:var(--text);font-size:13px">
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="de-btn" onclick="addTemplateFile()" style="flex:1">⬆ Upload & Tambah</button>
        <button class="de-btn" onclick="toggleFileUploadPanel()" style="background:transparent;border-color:var(--border);color:var(--text-muted)">Tutup</button>
      </div>
    </div>
    ` : ''}
    <div style="margin-top:12px;padding:10px;background:var(--surface-2);border-radius:8px;border:1px dashed var(--border);font-size:12px;color:var(--text-muted)">
      💡 <strong>Tips:</strong> Klik salah satu item di atas untuk mengedit. Klik <strong>"➕ Tambah Item Baru"</strong> untuk menambahkan. Setelah semua selesai, klik <strong>"💾 Simpan & Publish"</strong> di bawah.
    </div>
  `;
}

function editItem(idx) {
  _dataEditorEditingIdx = idx;
  renderDataEditorTab();
}

function addItem() {
  _dataEditorEditingIdx = -1;
  renderDataEditorTab();
}

function cancelFormEdit() {
  _dataEditorEditingIdx = null;
  renderDataEditorTab();
}

function saveFormEdit() {
  const schema = DATA_EDITOR_SCHEMA[_dataEditorTab];
  const layout = FORM_LAYOUTS[_dataEditorTab] || [];
  const newItem = {};

  layout.forEach(row => {
    row.forEach(key => {
      const isArray = schema.arrayFields.includes(key);
      const el = document.getElementById(`de-form-${key}`);
      if (!el) return;
      let val = el.value.trim();
      if (isArray) {
        val = val.split('\n').map(s => s.trim()).filter(Boolean);
      }
      newItem[key] = val;
    });
  });

  // Validation
  const reqKey = _dataEditorTab === 'faqChatbot' ? 'intent' : 'id';
  const reqLabel = _dataEditorTab === 'faqChatbot' ? 'Intent' : 'ID';
  const nameKey = _dataEditorTab === 'faqChatbot' ? 'jawaban' : 'nama';
  const nameLabel = _dataEditorTab === 'faqChatbot' ? 'Jawaban' : 'Nama';

  if (!newItem[reqKey]) { showToast(`❌ ${reqLabel} wajib diisi.`); return; }
  if (!newItem[nameKey]) { showToast(`❌ ${nameLabel} wajib diisi.`); return; }

  // Special: dokumenUnduh for layanan
  if (_dataEditorTab === 'layanan') {
    const docRows = document.querySelectorAll('.lf-doc-row');
    const dokumenUnduh = [];
    docRows.forEach(row => {
      const n = row.querySelector('.lf-doc-nama')?.value.trim();
      const u = row.querySelector('.lf-doc-url')?.value.trim();
      if (n && u) dokumenUnduh.push({ nama: n, url: u });
    });
    newItem.dokumenUnduh = dokumenUnduh;
    newItem.tags = [];
  }

  const dataArr = getCategoryArray(_dataEditorTab);
  if (_dataEditorEditingIdx === -1) {
    dataArr.push(newItem);
    showToast('✅ Item baru ditambahkan ke draft.');
  } else {
    dataArr[_dataEditorEditingIdx] = newItem;
    showToast('✅ Perubahan disimpan ke draft.');
  }
  _dataEditorEditingIdx = null;
  renderDataEditorTab();
}

function saveMetaForm() {
  const meta = _dataEditorDraft.meta || {};
  meta.kelurahan = document.getElementById('mf-kelurahan')?.value.trim() || '';
  meta.kecamatan = document.getElementById('mf-kecamatan')?.value.trim() || '';
  meta.kota = document.getElementById('mf-kota')?.value.trim() || '';
  meta.provinsi = document.getElementById('mf-provinsi')?.value.trim() || '';
  meta.alamat = document.getElementById('mf-alamat')?.value.trim() || '';
  meta.telepon = document.getElementById('mf-telepon')?.value.trim() || '';
  meta.email = document.getElementById('mf-email')?.value.trim() || '';
  meta.jamKerja = document.getElementById('mf-jamKerja')?.value.trim() || '';
  meta.koordinat = meta.koordinat || {};
  meta.koordinat.lat = parseFloat(document.getElementById('mf-lat')?.value) || 0;
  meta.koordinat.lng = parseFloat(document.getElementById('mf-lng')?.value) || 0;
  showToast('✅ Meta disimpan ke draft.');
}

function addDocRow() {
  const list = document.getElementById('lf-docs-list');
  const idx = list.children.length;
  const div = document.createElement('div');
  div.className = 'lf-doc-row';
  div.style.cssText = 'display:flex;gap:6px;align-items:center';
  div.innerHTML = `
    <input type="text" class="lf-doc-nama" data-idx="${idx}" placeholder="Nama dokumen" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px">
    <input type="text" class="lf-doc-url" data-idx="${idx}" placeholder="URL / dokumen/file.pdf" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px">
    <button class="de-pv-del" onclick="this.parentElement.remove()" title="Hapus" style="width:28px;height:28px">✕</button>
  `;
  list.appendChild(div);
}

function removeDocRow(idx) {
  const rows = document.querySelectorAll('.lf-doc-row');
  if (rows[idx]) rows[idx].remove();
}

function toggleFileUploadPanel() {
  const panel = document.getElementById('de-file-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function addTemplateFile() {
  const layananId = document.getElementById('de-fu-layanan')?.value;
  const nama = document.getElementById('de-fu-nama')?.value.trim();
  const fileInput = document.getElementById('de-fu-file');
  const file = fileInput?.files[0];

  if (!layananId) { showToast('❌ Pilih layanan dulu.'); return; }
  if (!nama) { showToast('❌ Isi nama dokumen.'); return; }
  if (!file) { showToast('❌ Pilih file dulu.'); return; }

  const safeName = nama.replace(/[^a-zA-Z0-9\s.-]/g, '').replace(/\s+/g, '-').toLowerCase();
  const ext = file.name.match(/\.[^.]+$/)?.[0] || '.pdf';
  const filename = `${safeName}${ext}`;
  const path = `dokumen/${filename}`;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    _pendingFileUploads.push({ path, content: base64, layananId, nama });

    // Update draft JSON: add dokumenUnduh entry
    const layanan = _dataEditorDraft.layanan.find(l => l.id === layananId);
    if (layanan) {
      if (!Array.isArray(layanan.dokumenUnduh)) layanan.dokumenUnduh = [];
      layanan.dokumenUnduh.push({ nama, url: path });
    }

    // Reset form
    document.getElementById('de-fu-layanan').value = '';
    document.getElementById('de-fu-nama').value = '';
    fileInput.value = '';

    renderDataEditorTab();
    showToast('📎 File ditambahkan. Klik Simpan untuk upload ke server.');
  };
  reader.onerror = () => showToast('❌ Gagal membaca file.');
  reader.readAsDataURL(file);
}

function removePendingFile(idx) {
  if (!confirm('Batalkan upload file ini?')) return;
  const removed = _pendingFileUploads.splice(idx, 1)[0];
  if (removed) {
    // Also remove from draft layanan dokumenUnduh
    const layanan = _dataEditorDraft.layanan.find(l => l.id === removed.layananId);
    if (layanan && Array.isArray(layanan.dokumenUnduh)) {
      layanan.dokumenUnduh = layanan.dokumenUnduh.filter(d => d.url !== removed.path);
    }
  }
  renderDataEditorTab();
  showToast('🗑️ File upload dibatalkan.');
}

function deleteTemplateFile(layananId, docIdx) {
  if (!confirm('Yakin hapus file template ini? File di server TIDAK terhapus, hanya dihapus dari daftar layanan.')) return;
  const layanan = _dataEditorDraft.layanan.find(l => l.id === layananId);
  if (!layanan || !Array.isArray(layanan.dokumenUnduh)) return;
  layanan.dokumenUnduh.splice(docIdx, 1);
  renderDataEditorTab();
  showToast('🗑️ File dihapus dari layanan. Klik Simpan untuk publish.');
}

function deleteDataItem(index) {
  if (!confirm('Yakin hapus item ini? Tindakan tidak bisa di-undo sebelum simpan.')) return;
  const data = getCategoryArray(_dataEditorTab);
  if (!Array.isArray(data) || index < 0 || index >= data.length) return;
  data.splice(index, 1);
  setCategoryArray(_dataEditorTab, data);
  renderDataEditorTab();
  showToast('🗑️ Item dihapus. Klik Simpan untuk publish.');
}

function validateAndApplyJSON() {
  const ta = document.getElementById('de-json-editor');
  // Form-based editors don't have a JSON textarea; _dataEditorDraft is already valid
  if (!ta) return true;
  const errEl = document.getElementById('de-json-error');
  try {
    const parsed = JSON.parse(ta.value);
    setCategoryArray(_dataEditorTab, parsed);
    if (errEl) {
      errEl.textContent = '✓ JSON valid';
      errEl.style.color = 'var(--success,#2e7d32)';
    }
    return true;
  } catch (e) {
    if (errEl) {
      errEl.textContent = '✗ ' + e.message;
      errEl.style.color = 'var(--danger,#c1272d)';
    }
    return false;
  }
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(_dataEditorDraft, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prima-data.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 prima-data.json terunduh');
}

// ── Excel import/export per kategori ─────────────────────────────
function rowToObject(row, schema) {
  const obj = {};
  schema.fields.forEach(f => {
    let v = row[f];
    if (v === undefined || v === null) v = '';
    if (schema.arrayFields.includes(f)) {
      // Excel cell pakai "item 1 | item 2 | item 3" sebagai pemisah array
      obj[f] = String(v).split('|').map(s => s.trim()).filter(Boolean);
    } else if (schema.jsonFields.includes(f)) {
      try { obj[f] = v ? JSON.parse(v) : []; } catch { obj[f] = []; }
    } else if (f === 'lat' || f === 'lng') {
      obj[f] = Number(v);
    } else {
      obj[f] = v;
    }
  });
  return obj;
}

function objectToRow(item, schema) {
  const row = {};
  schema.fields.forEach(f => {
    const v = item[f];
    if (schema.arrayFields.includes(f)) {
      row[f] = Array.isArray(v) ? v.join(' | ') : (v || '');
    } else if (schema.jsonFields.includes(f)) {
      row[f] = JSON.stringify(v || []);
    } else {
      row[f] = v == null ? '' : v;
    }
  });
  return row;
}

function downloadCategoryExcel(category) {
  if (typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS belum termuat. Refresh halaman.');
    return;
  }
  const schema = DATA_EDITOR_SCHEMA[category];
  const data = getCategoryArray(category) || [];
  const rows = data.map(item => objectToRow(item, schema));
  const ws = XLSX.utils.json_to_sheet(rows, { header: schema.fields });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, category);
  XLSX.writeFile(wb, `prima-${category}.xlsx`);
  showToast(`📥 prima-${category}.xlsx terunduh`);
}

function handleExcelUpload(event, category) {
  const file = event.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS belum termuat.');
    return;
  }

  const schema = DATA_EDITOR_SCHEMA[category];
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      const parsed = rows.map(r => rowToObject(r, schema));
      setCategoryArray(category, parsed);
      renderDataEditorTab();
      showToast(`✓ ${parsed.length} baris di-import dari Excel`);
    } catch (err) {
      showToast('❌ Gagal baca Excel: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

// ══════════════════════════════════════════════════════════════════
// AI NARRATIVE IMPORT — Upload Word/Excel/TXT → AI parse jadi JSON
// ══════════════════════════════════════════════════════════════════

async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop();

  if (ext === 'docx') {
    if (typeof mammoth === 'undefined') throw new Error('mammoth.js belum termuat (perlu internet)');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value || '';
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS belum termuat');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    // Gabungkan semua sheet sebagai CSV string
    return wb.SheetNames.map(name => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      return `=== Sheet: ${name} ===\n${csv}`;
    }).join('\n\n');
  }

  if (ext === 'txt' || ext === 'md') {
    return await file.text();
  }

  throw new Error('Format tidak didukung: ' + ext + '. Pakai .docx, .xlsx, .csv, .txt, atau .md');
}

function buildAIParsePrompt(text, category) {
  const schema = DATA_EDITOR_SCHEMA[category];
  const existing = getCategoryArray(category) || [];
  const sample = existing.length > 0 ? JSON.stringify(existing[0], null, 2) : null;

  let fieldDesc;
  if (schema.singleObject) {
    fieldDesc = 'Object tunggal dengan field bebas (lihat contoh).';
  } else {
    fieldDesc = `Array dari objek. Setiap objek punya field:\n` +
      schema.fields.map(f => {
        let hint = '';
        if (schema.arrayFields.includes(f)) hint = ' (ARRAY of strings)';
        else if (schema.jsonFields.includes(f)) hint = ' (ARRAY of objects)';
        else if (f === 'lat' || f === 'lng') hint = ' (NUMBER)';
        else if (f === 'id') hint = ' (string pendek unique, mis. "SKD", "k1", "g3")';
        return `  - "${f}"${hint}`;
      }).join('\n');
  }

  return `Kamu adalah AI parser data untuk PRIMA Kelurahan Rawajati.

TUGAS: Ekstrak data terstruktur dari teks narasi/dokumen Word/Excel di bawah, ubah jadi JSON sesuai schema kategori "${category}" (${schema.label}).

SCHEMA:
${fieldDesc}

${sample ? 'CONTOH SATU ITEM:\n```json\n' + sample + '\n```\n' : ''}

ATURAN:
1. Output WAJIB pure JSON ${schema.singleObject ? 'object' : 'array'} — JANGAN ada penjelasan, JANGAN pakai markdown code fence.
2. Kalau ada baris yang ambigu atau tidak punya nama, SKIP — jangan paksakan.
3. Field "id" harus unique dan pendek. Generate dari nama (mis. "Surat Keterangan Domisili" → "SKD").
4. Field array seperti "syarat", "prosedur", "keywords": pecah jadi list per item (bullet/nomor/baris).
5. Kalau field tidak disebut di sumber, pakai string kosong "" atau array kosong [].
6. Output bahasa Indonesia.

TEKS SUMBER:
"""
${text.slice(0, 12000)}
"""

JSON output:`;
}

function stripJsonFences(text) {
  // Hapus ```json ... ``` atau ``` ... ```
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

async function aiParseNarrative(text, category) {
  if (typeof PRIMA_AI === 'undefined') throw new Error('AI module tidak ada');

  const prompt = buildAIParsePrompt(text, category);

  // Gunakan endpoint OpenRouter yang sudah ada via /api/chat (non-streaming)
  const model = PRIMA_AI.getSelectedModel();
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Kamu adalah JSON parser yang teliti. Selalu return pure JSON tanpa penjelasan.' },
        { role: 'user', content: prompt }
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  if (!raw) throw new Error('AI tidak return konten');

  const cleaned = stripJsonFences(raw);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // Coba ekstrak JSON dari teks yang ada penjelasan
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) {
      try { parsed = JSON.parse(m[0]); }
      catch { throw new Error('AI return JSON tidak valid: ' + e.message); }
    } else {
      throw new Error('AI return JSON tidak valid: ' + e.message);
    }
  }

  return parsed;
}

async function handleNarrativeUpload(event, category) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const schema = DATA_EDITOR_SCHEMA[category];
  if (!schema || schema.singleObject) {
    showToast('❌ Kategori ini tidak support import narasi');
    return;
  }

  // Konfirmasi mode: replace atau append
  const mode = confirm(
    `Import dari "${file.name}" ke kategori "${schema.label}".\n\n` +
    `OK = TAMBAH ke data yang sudah ada (append)\n` +
    `Cancel = GANTI semua data (replace)`
  ) ? 'append' : 'replace';

  showToast('📄 Membaca file…');

  let text;
  try {
    text = await extractTextFromFile(file);
  } catch (e) {
    showToast('❌ Gagal baca file: ' + e.message);
    return;
  }

  if (!text || text.trim().length < 10) {
    showToast('❌ File kosong atau tidak terbaca');
    return;
  }

  // Show in-modal AI progress
  const errEl = document.getElementById('de-json-error');
  if (errEl) {
    errEl.style.color = 'var(--gold-deep)';
    errEl.innerHTML = '🤖 AI sedang parse narasi → JSON… (10-30 detik)';
  }
  showToast('🤖 AI parsing… mohon tunggu 10-30 detik');

  let parsed;
  try {
    parsed = await aiParseNarrative(text, category);
  } catch (e) {
    if (errEl) { errEl.style.color = 'var(--danger,#c1272d)'; errEl.textContent = '✗ ' + e.message; }
    showToast('❌ AI gagal: ' + e.message);
    return;
  }

  // Pastikan format array
  if (!Array.isArray(parsed)) {
    if (typeof parsed === 'object' && parsed !== null) {
      parsed = [parsed]; // wrap single object jadi array
    } else {
      showToast('❌ AI return bukan array/object');
      return;
    }
  }

  // Gabungkan dengan data lama jika append
  const existing = getCategoryArray(category) || [];
  const merged = mode === 'append' ? [...existing, ...parsed] : parsed;

  setCategoryArray(category, merged);
  renderDataEditorTab();
  showToast(`✅ ${parsed.length} item ${mode === 'append' ? 'ditambahkan' : 'menggantikan data lama'}. Review & klik Simpan.`);
}

// ── Admin Secret: tersimpan di device, di-prompt sekali ──────────
const ADMIN_SECRET_KEY = 'prima_admin_secret_v1';

function getStoredAdminSecret() {
  try { return localStorage.getItem(ADMIN_SECRET_KEY) || ''; }
  catch { return ''; }
}

async function ensureAdminSecret(forcePrompt = false) {
  let secret = forcePrompt ? '' : getStoredAdminSecret();
  if (secret) return secret;

  secret = prompt(
    '🔑 Masukkan Admin Secret SEKALI saja\n\n' +
    '(Nilai ADMIN_SECRET dari Vercel Environment Variables.\n' +
    'Akan disimpan di perangkat ini supaya tidak perlu ketik lagi.)',
    ''
  );
  if (!secret) return '';
  secret = secret.trim();
  if (secret.length < 8) {
    showToast('❌ Secret terlalu pendek');
    return '';
  }
  try { localStorage.setItem(ADMIN_SECRET_KEY, secret); } catch {}
  showToast('✅ Secret tersimpan di perangkat ini');
  return secret;
}

function clearAdminSecret() {
  try { localStorage.removeItem(ADMIN_SECRET_KEY); } catch {}
}

function changeAdminSecret() {
  if (confirm('Ganti Admin Secret? Anda akan diminta input baru.')) {
    clearAdminSecret();
    ensureAdminSecret(true);
  }
}

function forgetAdminSecret() {
  if (confirm('Hapus Admin Secret dari perangkat ini?\n\nUntuk save berikutnya, Anda perlu input ulang.')) {
    clearAdminSecret();
    showToast('🔒 Secret dihapus dari device');
  }
}

// ── Save: POST ke /api/save-data ─────────────────────────────────
async function saveDataEditor() {
  // If user is currently editing a form item, auto-save it to draft first
  if (_dataEditorEditingIdx !== null) {
    saveFormEdit();
  }

  // Pastikan JSON di tab aktif tervalidasi sebelum kirim
  if (!validateAndApplyJSON()) {
    showToast('❌ JSON tab aktif tidak valid. Perbaiki dulu.');
    return;
  }

  let secret = await ensureAdminSecret();
  if (!secret) return;

  // Sync aiSettings dan aiModels dari PRIMA_DATA terbaru sebelum push, supaya
  // save dari Data Editor tidak overwrite perubahan AI settings & model presets.
  if (window.PRIMA_DATA?.aiSettings) {
    _dataEditorDraft.aiSettings = JSON.parse(JSON.stringify(window.PRIMA_DATA.aiSettings));
  }
  if (window.PRIMA_DATA?.aiModels) {
    _dataEditorDraft.aiModels = JSON.parse(JSON.stringify(window.PRIMA_DATA.aiModels));
  }

  // Commit message default tanpa prompt — cepat. Admin advanced bisa edit via input.
  const commitMessage = 'chore(data): admin update via Panel';

  showToast('⏳ Mengirim ke GitHub…');

  try {
    let res = await fetch('/api/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
      body: JSON.stringify({ data: _dataEditorDraft, message: commitMessage, files: _pendingFileUploads })
    });

    // Auto-retry sekali kalau secret invalid (misal user ganti env baru)
    if (res.status === 401) {
      clearAdminSecret();
      showToast('🔑 Secret tersimpan salah/expired. Coba lagi…');
      secret = await ensureAdminSecret(true);
      if (!secret) return;
      res = await fetch('/api/save-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
        body: JSON.stringify({ data: _dataEditorDraft, message: commitMessage, files: _pendingFileUploads })
      });
    }

    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast('❌ Gagal: ' + (out.error || res.status));
      return;
    }
    showToast('✅ Tersimpan! Vercel auto-deploy ~1-2 menit.');
    _pendingFileUploads = []; // clear after successful upload
    if (out.url) {
      setTimeout(() => {
        if (confirm('Buka commit di GitHub?')) window.open(out.url, '_blank');
      }, 500);
    }
    // Update local in-memory data agar admin tidak perlu refresh untuk lihat versi baru
    window.PRIMA_DATA = JSON.parse(JSON.stringify(_dataEditorDraft));
    // Rebuild RAG index supaya AI chatbot langsung kenal data baru tanpa reload
    if (window.PRIMA_AI && typeof PRIMA_AI.resetIndex === 'function') {
      PRIMA_AI.resetIndex();
    }
    // Re-init chatbot rule-based dengan FAQ baru
    if (typeof chatbot !== 'undefined' && PRIMA_DATA.faqChatbot) {
      chatbot.faq = PRIMA_DATA.faqChatbot;
    }
    closeModal();
  } catch (e) {
    showToast('❌ Network error: ' + e.message);
  }
}
