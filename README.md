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

Password default: `prima2026` (ubah di `js/app.js`).

## Lisensi

Internal use — Kelurahan Rawajati.
