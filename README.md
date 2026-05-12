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

## Admin

Password default: `prima2026` (ubah di `js/app.js`).

## Lisensi

Internal use — Kelurahan Rawajati.
