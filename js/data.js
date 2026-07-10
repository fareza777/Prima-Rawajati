// ================================================================
// PRIMA - DATA LOADER
// Sumber data utama: data/prima-data.json (committed di repo).
// Admin Panel bisa edit via /api/save-data endpoint yang commit ke GitHub.
//
// Saat halaman dimuat:
//   1. Fetch data/prima-data.json
//   2. Expose ke window.PRIMA_DATA
//   3. Fire CustomEvent 'prima:data-ready' supaya app.js mulai render
//
// Fallback: jika fetch gagal (mis. offline + cache miss), pakai
// minimal data agar UI tidak crash dan tampil pesan error.
// ================================================================

window.PRIMA_DATA = null;
window.PRIMA_DATA_READY = false;

const PRIMA_DATA_FALLBACK = {
  meta: {
    namaApp: 'PRIMA',
    kelurahan: 'Rawajati',
    kecamatan: 'Pancoran',
    kota: 'Jakarta Selatan',
    provinsi: 'DKI Jakarta',
    alamat: 'Jl. Rawajati Barat RT.006/RW.04, Rawajati, Pancoran, Jakarta Selatan 12750',
    telepon: '(021) 7994427',
    email: 'kel.rawajati@jakarta.go.id',
    jamKerja: 'Senin–Kamis 07.30–16.00 WIB, Jumat 07.30–16.30 WIB',
    koordinat: { lat: -6.260252, lng: 106.852497 },
    versi: '1.0.0',
    terakhirUpdate: 'Mei 2026'
  },
  layanan: [],
  petaMarkers: [],
  infoWarga: { kuliner: [], usahaBinaan: [], kegiatanRTRW: [] },
  infoKelurahan: { pengumuman: [], kegiatan: [] },
  faqChatbot: [],
  knowledgeBase: []
};

(async function loadPrimaData() {
  let data;
  try {
    // Cache-bust dengan timestamp agar admin selalu lihat versi terbaru
    const url = 'data/prima-data.json?t=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (err) {
    console.error('[PRIMA] Gagal memuat data/prima-data.json:', err);
    data = PRIMA_DATA_FALLBACK;
    window.PRIMA_DATA_LOAD_ERROR = err.message || String(err);
  }

  window.PRIMA_DATA = data;
  window.PRIMA_DATA_READY = true;
  window.dispatchEvent(new CustomEvent('prima:data-ready', { detail: { data } }));
})();
