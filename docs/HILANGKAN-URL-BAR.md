# Hilangkan URL bar Vercel di atas aplikasi (TWA fullscreen)

Jika aplikasi dari Play Store menampilkan **alamat `prima-rawajati.vercel.app` di bagian atas**, artinya Android membuka situs sebagai **Chrome Custom Tab** (browser), bukan **Trusted Web Activity** (layar penuh tanpa URL).

Penyebab umum: **sertifikat penandatangan aplikasi di HP tidak cocok** dengan file `/.well-known/assetlinks.json` di server.

## Kenapa ini terjadi setelah install dari Play Store?

Google Play **menandatangani ulang** APK/AAB dengan **App signing key** (bukan hanya upload key dari GitHub).

`assetlinks.json` saat ini hanya berisi SHA-256 **upload key** dari CI. HP penguji memakai sertifikat **Play App Signing** → verifikasi gagal → URL bar muncul.

## Perbaikan (wajib)

### 1. Ambil SHA-256 App signing key

1. Buka [Google Play Console](https://play.google.com/console)
2. Pilih app **PRIMA – Kelurahan Rawajati**
3. **Setup** → **App integrity** (atau **Release** → **Setup** → **App signing**)
4. Di bagian **App signing key certificate**, salin **SHA-256 certificate fingerprint**  
   (format: `AA:BB:CC:...` — **bukan** Upload key certificate)

### 2. Tambahkan ke proyek (pilih salah satu)

**Opsi A — GitHub Secret (disarankan)**

1. Repo → **Settings** → **Secrets and variables** → **Actions**
2. New secret: `PLAY_APP_SIGNING_SHA256` = nilai SHA-256 dari langkah 1
3. Jalankan ulang workflow **Build Play Store APK/AAB** (atau push ke `main`)
4. CI akan memperbarui `.well-known/assetlinks.json` dan push ke repo → Vercel auto-deploy

**Opsi B — Manual di repo**

1. Edit `twa-manifest.json`, isi array `fingerprints`:

```json
"fingerprints": [
  "XX:XX:XX:...:SHA256_DARI_PLAY_CONSOLE"
]
```

2. Edit `.well-known/assetlinks.json` — tambahkan fingerprint yang sama ke array `sha256_cert_fingerprints` (jangan hapus yang lama).
3. Commit & push ke `main`

### 3. Verifikasi di web

Buka: https://prima-rawajati.vercel.app/.well-known/assetlinks.json  

Harus ada **minimal 2** fingerprint jika upload key dan Play signing key berbeda.

Cek juga: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://prima-rawajati.vercel.app&relation=delegate_permission/common.handle_all_urls

### 4. Di HP penguji

1. **Copot pemasangan** app PRIMA
2. Install lagi dari link internal testing
3. Buka app — URL bar seharusnya hilang (layar penuh navy)

Jika sudah menambahkan SHA Play tapi URL bar masih ada: upload **AAB baru** (versi terbaru) — APK harus berisi `asset_statements` (tautan app → web). Cukup reinstall saja **tidak** cukup untuk build lama.

## Masih ada URL bar?

- Pastikan SHA yang disalin dari **App signing key**, bukan Upload key
- Tunggu 5–15 menit setelah deploy Vercel (cache)
- Hapus data **Chrome** → Site settings → `prima-rawajati.vercel.app` → Clear (opsional)
- Pastikan package name di assetlinks: `id.rawajati.prima`
