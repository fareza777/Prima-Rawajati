// ================================================================
// PRIMA – Main Application Logic
// ================================================================

let map = null;
let chatbot = null;
let mapMarkers = [];
let activeFilter = 'Semua';

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chatbot = new PRIMAChatbot(PRIMA_DATA.faqChatbot);
  initNav();
  renderHome();
  renderLayanan(PRIMA_DATA.layanan);
  renderInfoWarga();
  renderSuaraWarga();
  renderAdminPage();
  initChatbot();
  // Load saved page
  const lastPage = localStorage.getItem('prima_last_page') || 'home';
  navigateTo(lastPage);
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
        ${layanan.dokumenUnduh.map(d => `
          <button class="download-btn" onclick="handleDownload('${d.nama}')">
            <span class="dl-icon">📄</span>
            <span>${d.nama}</span>
            <span style="margin-left:auto">⬇️</span>
          </button>
        `).join('')}
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

function handleDownload(docName) {
  showToast(`📄 Mengunduh: ${docName}…`);
  // In production this would fetch real file
  setTimeout(() => showToast('✅ Template berhasil diunduh!'), 1500);
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

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  addUserMessage(text, getCurrentTime());
  input.value = '';
  input.style.height = 'auto';

  // Show typing indicator
  const typingId = showTyping();

  // Process with slight delay for natural feel
  setTimeout(() => {
    removeTyping(typingId);
    const response = chatbot.processMessage(text);
    addBotMessage(response.text, response.timestamp);
    updateChatStats();
  }, 600 + Math.random() * 400);
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

function addBotMessage(html, time) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div>
      <div class="msg-bubble">${html}</div>
      <div class="msg-time">PRIMA Bot · ${time}</div>
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

    // Save to localStorage
    const feedbacks = JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
    feedbacks.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      rating: selectedRating,
      fiturFavorit: selectedFitur,
      aksesInfo: selectedAksesInfo,
      masukan,
      nama,
      rt
    });
    localStorage.setItem('prima_feedbacks', JSON.stringify(feedbacks));

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
    } else {
      showToast('❌ Password salah. Coba lagi.');
      document.getElementById('admin-password').value = '';
    }
  });
}

function updateAdminStats() {
  const feedbacks = JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
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

  // Feedback list
  const list = document.getElementById('admin-feedback-list');
  if (list) {
    if (!feedbacks.length) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Belum ada masukan dari warga.</p>';
      return;
    }
    list.innerHTML = feedbacks.slice().reverse().slice(0, 10).map(f => `
      <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;background:var(--bg)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <strong style="font-size:14px">${escapeHtml(f.nama)}</strong>
          <span style="font-size:12px;color:var(--text-muted)">RT ${escapeHtml(f.rt)}</span>
          <span style="margin-left:auto;font-size:12px">${'⭐'.repeat(f.rating)}</span>
        </div>
        ${f.masukan ? `<p style="font-size:13px;color:var(--text)">"${escapeHtml(f.masukan)}"</p>` : ''}
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(f.timestamp).toLocaleString('id-ID')}</p>
      </div>
    `).join('');
  }
}

function showAdminFeedback() {
  updateAdminStats();
  showToast('📊 Data feedback dimuat ulang');
}

function exportData() {
  const feedbacks = JSON.parse(localStorage.getItem('prima_feedbacks') || '[]');
  const chatLogs  = JSON.parse(localStorage.getItem('prima_chat_logs')  || '[]');
  const chatStats = JSON.parse(localStorage.getItem('prima_chat_stats') || '{}');

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
