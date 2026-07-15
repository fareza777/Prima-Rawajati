# PRIMA – Kelurahan Rawajati

**Platform Ringkas Interaktif Masyarakat** — PWA informatif untuk layanan, peta wilayah, dan info warga Kelurahan Rawajati. Akses 24/7 via QR Code, tanpa server backend.

## Fitur

- **Layanan & Surat** — syarat, prosedur, template dokumen.
- **Peta Wilayah** — Leaflet map dengan filter kategori (Pemerintahan, RW, Ibadah, Ekonomi, Kesehatan, Rawan Banjir, dll).
- **Info Warga** — kuliner, usaha binaan KUKM, kegiatan RT/RW.
- **Tanya Kami** — AI chatbot rule-based 24 jam.
- **Suara Warga** — form masukan & rating.
- **Admin Panel** — statistik penggunaan, ekspor feedback, generate QR.
- **PWA** — installable, offline-capable via Service Worker.
- **Pengumuman dari Dokumen** — PDF/foto/Word/Excel → OCR → draft AI → review admin → publish.
- **Notifikasi Warga** — Web Push opt-in untuk pengumuman yang sudah diperiksa admin.

## Stack

- Vanilla HTML + CSS + JS (tanpa build step)
- Leaflet 1.9.4 (peta)
- QRCode.js (generator QR)
- Lucide Icons (ikon SVG)
- Google Fonts: Fraunces + Plus Jakarta Sans

## Desain

Tema **Royal Government** — navy `#0A1F44` + gold accent `#D4AF37`, glassmorphism, typography display serif.

## Menjalankan Lokal

```bash
python -m http.server 8765
```

Lalu buka `http://localhost:8765`.

## Struktur

```
├── index.html          # Entry + inline desktop fix
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── css/
│   └── style.css       # Royal Government theme
└── js/
    ├── data.js         # Seluruh data (layanan, peta, info warga, FAQ)
    ├── app.js          # Navigasi, render, peta, modal, admin
    └── chatbot.js      # Rule-based NLP chatbot
```

## AI Chatbot (OpenRouter)

Chatbot mendukung mode **AI** (LLM via OpenRouter) selain mesin keyword bawaan.

### Setup

1. Daftar di https://openrouter.ai → buat API key.
2. Di Vercel Dashboard project → **Settings → Environment Variables**, tambah:
   - Name: `OPENROUTER_API_KEY`
   - Value: `sk-or-v1-...` (key Anda)
   - Apply ke: Production + Preview + Development
3. Redeploy.

### Cara kerja

- Endpoint serverless `api/chat.js` (Vercel Edge) memproksi request ke OpenRouter — **API key tidak pernah dikirim ke browser**.
- Client (`js/ai.js`) melakukan **basic RAG** keyword-retrieval dari `PRIMA_DATA` (layanan, peta, info warga, FAQ) → top-6 dokumen relevan dimasukkan ke system prompt.
- Response **streaming** (SSE) untuk UX seperti ChatGPT.
- Tombol toggle di chat header → user bisa matikan AI dan pakai mesin lokal.
- Fallback otomatis: jika AI gagal/tidak tersedia, balik ke rule-based.

### Model tersedia

- `google/gemma-4-26b-a4b-it:free`
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
- `nvidia/nemotron-3-super-120b-a12b:free`
- Fallback: `google/gemma-2-9b-it:free`, `meta-llama/llama-3.1-8b-instruct:free`, `mistralai/mistral-7b-instruct:free`

### Lokal Development

Endpoint `/api/chat` butuh runtime Vercel. Untuk dev lokal:
```bash
npm i -g vercel
vercel dev
```
Lalu `OPENROUTER_API_KEY` ambil dari `.env.local`.

Kalau pakai `python -m http.server`, mode AI **mati** otomatis (chatbot fallback ke rule-based).

## Admin

Password login default: `prima2026` (ubah di `js/app.js`).

### Editor Data PRIMA (Self-service via Admin Panel)

Admin bisa edit konten (layanan, FAQ chatbot, info warga, peta) langsung dari Panel Admin tanpa developer. Perubahan di-commit otomatis ke GitHub via API → Vercel auto-deploy.

**Cara kerja:**

```
Admin Panel → POST /api/save-data → GitHub Contents API → Vercel rebuild
```

Token GitHub disimpan di Vercel env vars — **tidak pernah** menyentuh browser.

**Setup (sekali saja):**

1. **Buat GitHub Personal Access Token (PAT)**
   - Buka https://github.com/settings/tokens?type=beta → "Generate new token (fine-grained)"
   - Repository access: **Only select repositories** → pilih `Prima-Rawajati`
   - Permissions → Repository → **Contents: Read and write**
   - Generate & salin token (`github_pat_…`)

2. **Set Env Vars di Vercel** (Dashboard → Settings → Environment Variables → Production + Preview + Development)
   ```
   GITHUB_TOKEN   = github_pat_xxxxx (dari langkah 1)
   GITHUB_REPO    = fareza777/Prima-Rawajati
   GITHUB_BRANCH  = main
   ADMIN_SECRET   = <string acak 32+ karakter, simpan baik-baik>
   ```

3. **Redeploy** sekali (Vercel → Deployments → terakhir → Redeploy)

**Pemakaian admin:**

1. Masuk Panel Admin (login dengan `prima2026`)
2. Klik **📝 Editor Data PRIMA**
3. Pilih tab kategori (Layanan / FAQ / Peta / Kuliner / Usaha Binaan / Kegiatan / Meta)
4. Edit langsung di JSON editor **ATAU** klik "⬇ Download Excel" → edit di Excel desktop → "⬆ Upload Excel"
5. Klik **💾 Simpan & Publish ke GitHub** → masukkan Admin Secret → tunggu konfirmasi
6. Vercel auto-build ~1-2 menit → warga akan lihat versi terbaru saat refresh

**Format Excel:**
- Setiap kategori punya kolom standar (lihat header sheet saat download)
- Untuk field array (mis. `syarat`, `prosedur`, `keywords`): pisahkan item dengan ` | ` (spasi-pipe-spasi)
  - Contoh: `KTP asli | KK asli | Surat pengantar RT`
- Untuk `dokumenUnduh` (JSON kompleks): isi dengan JSON array string seperti `[{"nama":"Form A","url":"..."}]`

**Sumber data sekarang:** [`data/prima-data.json`](data/prima-data.json) — file ini di-fetch async oleh `js/data.js` saat halaman dimuat.

### Pengumuman AI + Web Push

Fitur pengumuman memakai alur aman: dokumen dibaca di perangkat admin, AI membuat draft, lalu admin memeriksa sebelum menekan **Publish & Broadcast**. Pengumuman disimpan ke GitHub dan dicerminkan ke Redis agar langsung tampil tanpa menunggu deployment.

Tambahkan environment variables berikut di Vercel untuk Production, Preview, dan Development:

```text
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
PUSH_NOTIFICATIONS_ENABLED=true
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:kel.rawajati@jakarta.go.id
```

Buat pasangan VAPID satu kali:

```bash
npx web-push generate-vapid-keys
```

Simpan private key hanya di Vercel. Public key memang dikirim ke perangkat warga untuk membuat subscription.

Secara default endpoint draft memakai provider/model AI aktif milik PRIMA. Jika ingin model khusus pengumuman, tambahkan:

```text
ANNOUNCEMENT_AI_PROVIDER=minimax
ANNOUNCEMENT_AI_MODEL=MiniMax-M3
ANNOUNCEMENT_AI_BASE_URL=https://api.minimax.io/v1/chat/completions
```

`OPENROUTER_API_KEY` atau `MINIMAX_API_KEY` tetap wajib sesuai provider. Bila Redis/VAPID belum lengkap, kontrol notifikasi otomatis menampilkan status *Belum dikonfigurasi* dan endpoint broadcast menolak pengiriman.

## Lisensi

Internal use — Kelurahan Rawajati.
