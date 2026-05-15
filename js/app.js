// ================================================================
// PRIMA – Main Application Logic
// ================================================================

let map = null;
let chatbot = null;
let mapMarkers = [];
let activeFilter = 'Semua';

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
  initNav();
  renderHome();
  renderLayananQuick();
  renderLayanan(PRIMA_DATA.layanan);
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

  localStorage.setItem('prima_last_page', pageId);
}

// ── HOME PAGE ────────────────────────────────────────────────────
function renderHome() {
  // Stats in hero (real numbers from survey)
  document.getElementById('stat-layanan').textContent = PRIMA_DATA.layanan.length + '+';
  document.getElementById('stat-lokasi').textContent = PRIMA_DATA.petaMarkers.length + '+';
  document.getElementById('stat-always').textContent = '24/7';

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
function renderLayanan(data) {
  const container = document.getElementById('layanan-list');
  container.innerHTML = data.map(l => `
    <div class="layanan-card" onclick="showLayananDetail('${l.id}')">
      <span class="lcard-emoji">${l.emoji}</span>
      <div class="lcard-body">
        <h3>${l.nama}</h3>
        <div class="lcard-meta">
          <span class="badge badge-blue">${l.kategori}</span>
          <span class="badge badge-green">⏱ ${l.waktuProses}</span>
          <span class="badge badge-gray">${l.biaya}</span>
        </div>
      </div>
      <span class="lcard-arrow">›</span>
    </div>
  `).join('');

  // Search filter
  const searchInput = document.getElementById('layanan-search');
  searchInput.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = q
      ? PRIMA_DATA.layanan.filter(l =>
          l.nama.toLowerCase().includes(q) ||
          l.tags.some(t => t.includes(q)) ||
          l.kategori.toLowerCase().includes(q)
        )
      : PRIMA_DATA.layanan;
    renderLayanan(filtered);
  });
}

function showLayananDetail(id) {
  const layanan = PRIMA_DATA.layanan.find(l => l.id === id);
  if (!layanan) return;

  const modal = document.getElementById('modal-overlay');
  const body  = document.getElementById('modal-body-content');

  body.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-emoji">${layanan.emoji}</span>
      <div class="modal-title">
        <h3>${layanan.nama}</h3>
        <p>${layanan.deskripsi}</p>
      </div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="meta-grid mb-8">
        <div class="meta-item">
          <div class="meta-label">⏱ Waktu Proses</div>
          <div class="meta-val">${layanan.waktuProses}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">💰 Biaya</div>
          <div class="meta-val text-green">${layanan.biaya}</div>
        </div>
      </div>

      <div class="modal-section">
        <h4>📋 Persyaratan</h4>
        <ul class="requirement-list">
          ${layanan.syarat.map((s, i) => `
            <li>
              <span class="req-num">${i + 1}</span>
              <span>${s}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <div class="modal-section">
        <h4>📌 Prosedur</h4>
        <div class="step-list">
          ${layanan.prosedur.map((p, i) => `
            <div class="step-item">
              <div class="step-num">${i + 1}</div>
              <div class="step-body">${p}</div>
            </div>
          `).join('')}
        </div>
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

  // Add all markers
  PRIMA_DATA.petaMarkers.forEach(m => addMapMarker(m));
  updateMapFilter('Semua');
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

  const leafletMarker = L.marker([marker.lat, marker.lng], { icon })
    .bindPopup(`<strong>${marker.nama}</strong><br><small style="color:#666">${marker.kategori}</small><br><br>${marker.info}`, {
      maxWidth: 260
    });

  leafletMarker.addTo(map);
  mapMarkers.push({ data: marker, leaflet: leafletMarker });
}

function updateMapFilter(kategori) {
  activeFilter = kategori;
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === kategori);
  });

  mapMarkers.forEach(({ data, leaflet }) => {
    if (kategori === 'Semua' || data.kategori === kategori) {
      leaflet.addTo(map);
    } else {
      map.removeLayer(leaflet);
    }
  });
}

// ── INFO WARGA ───────────────────────────────────────────────────
function renderInfoWarga() {
  // Kuliner
  const kulinerContainer = document.getElementById('kuliner-list');
  kulinerContainer.innerHTML = PRIMA_DATA.infoWarga.kuliner.map(k => `
    <div class="info-card">
      <div class="info-card-header">
        <span class="ic-emoji">${k.emoji}</span>
        <h3>${k.nama}</h3>
        <span class="badge badge-gray ic-badge">⭐ Favorit</span>
      </div>
      <p>${k.deskripsi}</p>
      <div class="ic-details">
        <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${k.lokasi}</span></div>
        <div class="ic-row"><span class="ic-label">⏰</span><span class="ic-val">${k.jam}</span></div>
        <div class="ic-row"><span class="ic-label">⭐</span><span class="ic-val">${k.favorit}</span></div>
      </div>
    </div>
  `).join('');

  // Usaha Binaan
  const usahaContainer = document.getElementById('usaha-list');
  usahaContainer.innerHTML = PRIMA_DATA.infoWarga.usahaBinaan.map(u => `
    <div class="info-card">
      <div class="info-card-header">
        <span class="ic-emoji">${u.emoji}</span>
        <h3>${u.nama}</h3>
        <span class="badge badge-blue ic-badge">${u.kategori}</span>
      </div>
      <p>${u.deskripsi}</p>
      <div class="ic-details">
        <div class="ic-row"><span class="ic-label">👤</span><span class="ic-val">${u.pemilik}</span></div>
        <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${u.lokasi}</span></div>
        <div class="ic-row"><span class="ic-label">📞</span><span class="ic-val">${u.kontak}</span></div>
        <div class="ic-row"><span class="ic-label">🏛️</span><span class="ic-val">${u.binaan}</span></div>
      </div>
    </div>
  `).join('');

  // Kegiatan RT/RW
  const kegiatanContainer = document.getElementById('kegiatan-list');
  kegiatanContainer.innerHTML = PRIMA_DATA.infoWarga.kegiatanRTRW.map(g => `
    <div class="info-card">
      <div class="info-card-header">
        <span class="ic-emoji">${g.emoji}</span>
        <h3>${g.nama}</h3>
      </div>
      <p>${g.deskripsi}</p>
      <div class="ic-details">
        <div class="ic-row"><span class="ic-label">📅</span><span class="ic-val">${g.jadwal}</span></div>
        <div class="ic-row"><span class="ic-label">📍</span><span class="ic-val">${g.lokasi}</span></div>
        <div class="ic-row"><span class="ic-label">📞</span><span class="ic-val">${g.kontak}</span></div>
      </div>
    </div>
  `).join('');

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
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

  // Welcome message
  addBotMessage(
    'Halo! 👋 Selamat datang di <strong>PRIMA – Kelurahan Rawajati</strong>!\n\nSaya asisten virtual yang siap membantu Anda 24 jam. Tanya saja tentang syarat surat, jadwal layanan, info wilayah, dan lainnya! 😊',
    getCurrentTime()
  );

  // Suggestions
  renderSuggestions();

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

// Render label "Online · ✨ AI …" di header chat berdasarkan state localStorage.
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

// Wire up kontrol AI di Panel Admin (toggle + model selector + custom ID).
function initAISettings() {
  const panel = document.getElementById('chat-settings');
  const aiToggle = document.getElementById('ai-enabled');
  const modelSelect = document.getElementById('ai-model');
  const customInput = document.getElementById('ai-model-custom');
  const customSaveBtn = document.getElementById('ai-model-custom-save');

  if (!panel || !aiToggle || !modelSelect || typeof PRIMA_AI === 'undefined') return;

  // Populate model dropdown from current presets (re-populate each init)
  const _populateSelect = () => {
    const currentVal = modelSelect.value;
    const models = PRIMA_AI.getModels();
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.id}">${escapeHtml(m.label)}</option>`
    ).join('') + '<option value="__custom__">— Custom (isi di bawah) —</option>';
    // Restore selection if still valid
    if (currentVal && (models.find(m => m.id === currentVal) || currentVal === '__custom__')) {
      modelSelect.value = currentVal;
    }
    if (!modelSelect.dataset.populated) modelSelect.dataset.populated = '1';
  };
  _populateSelect();

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

    aiToggle.addEventListener('change', () => {
      // Mutate PRIMA_DATA.aiSettings (source of truth) + cache di localStorage
      if (!window.PRIMA_DATA.aiSettings) window.PRIMA_DATA.aiSettings = {};
      window.PRIMA_DATA.aiSettings.enabled = aiToggle.checked;
      try { localStorage.setItem('prima_ai_enabled', aiToggle.checked ? '1' : '0'); } catch {}
      markAISettingsDirty();
      refreshChatModeLabel();
    });

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
  const currentModel = PRIMA_AI.getSelectedModel();
  if (PRIMA_AI.isCustomModel(currentModel)) {
    modelSelect.value = '__custom__';
    if (customInput) customInput.value = currentModel;
  } else {
    modelSelect.value = currentModel;
    if (customInput) customInput.value = '';
  }
  aiToggle.checked = isAIEnabled();

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
  const commitMessage = `chore(ai): set model=${ai.model || '?'} enabled=${ai.enabled ? 'on' : 'off'} presets=${models.length}`;

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

function renderSuggestions() {
  const container = document.getElementById('chat-suggestions');
  const suggestions = chatbot.getSuggestedQuestions();
  container.innerHTML = suggestions.map(s =>
    `<button class="suggestion-chip" onclick="sendSuggestion('${escapeHtml(s)}')">${s}</button>`
  ).join('');
}

function sendSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  addUserMessage(text, getCurrentTime());
  input.value = '';
  input.style.height = 'auto';

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
    addBotMessage(response.text, response.timestamp, { intent: response.intent });
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
  // Add sources chips
  if (opts.sources && opts.sources.length) {
    const srcDiv = document.createElement('div');
    srcDiv.className = 'msg-sources';
    srcDiv.innerHTML = opts.sources.slice(0, 4).map(d =>
      `<span class="msg-source-chip">${escapeHtml(d.title)}</span>`
    ).join('');
    wrap.appendChild(srcDiv);
  }
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
  const tag = opts.intent ? ` · ${escapeHtml(opts.intent)}` : '';
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div style="flex:1;min-width:0">
      <div class="msg-bubble">${html}</div>
      <div class="msg-time">PRIMA Bot${tag} · ${time}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
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

// ── SUARA WARGA ──────────────────────────────────────────────────
function renderSuaraWarga() {
  let selectedRating = 0;
  let selectedFitur = '';
  let selectedAksesInfo = '';

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

  // Submit
  document.getElementById('suara-form').addEventListener('submit', e => {
    e.preventDefault();
    const masukan = document.getElementById('masukan-text').value.trim();
    const nama = document.getElementById('nama-warga').value.trim() || 'Anonim';
    const rt  = document.getElementById('rt-warga').value.trim() || '-';

    if (!selectedRating) {
      showToast('⭐ Mohon berikan rating terlebih dahulu');
      return;
    }

    const newFeedback = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      rating: selectedRating,
      fiturFavorit: selectedFitur,
      aksesInfo: selectedAksesInfo,
      masukan,
      nama,
      rt
    };

    // Local backup (in case server unavailable)
    const localFbs = JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
    localFbs.push(newFeedback);
    localStorage.setItem('prima_feedbacks', JSON.stringify(localFbs));

    // Async send to server
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: newFeedback })
    }).catch(() => {});

    // Update admin stats
    updateAdminStats();

    // Reset form
    e.target.reset();
    selectedRating = 0;
    selectedFitur = '';
    selectedAksesInfo = '';
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('rating-label').textContent = 'Pilih bintang di atas';
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));

    showToast('✅ Terima kasih! Masukan Anda tersimpan.');
  });
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

  _renderFeedbackList(feedbacks);
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
