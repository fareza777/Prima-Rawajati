# Unduh file AAB untuk Play Store

AAB **tidak** disimpan di repo (file signed + besar). Dibuat otomatis oleh GitHub Actions.

## Cara 1 — Build terbaru (disarankan)

1. Buka: https://github.com/fareza777/Prima-Rawajati/actions/workflows/build-android.yml
2. Klik **Run workflow** → branch `main` → **Run workflow**
3. Tunggu status **hijau** (~3–5 menit)
4. Buka run tersebut → scroll ke **Artifacts**
5. Unduh **`prima-aab-v*`** (file ZIP berisi `.aab`)
6. Extract ZIP → upload file **`PRIMA-v1.2.0-code19-targetSdk35.aab`**
7. Upload ke Play Console → Internal testing

**PENTING:** Jangan upload `intermediary-bundle.aab` — file itu **belum di-sign** dan Play Console akan menolak.

**Cek sebelum upload:** Di Play Console, bundle harus menampilkan **Target SDK 35**, **versionCode 19**, dan **versionName 1.2.0**. Versi ini mengaktifkan delegasi izin notifikasi TWA.

## Verifikasi notifikasi sebelum Production

1. Pastikan `enableNotifications` bernilai `true` di `twa-manifest.json`.
2. Jalankan workflow pada branch rilis dan pertahankan signing key yang sudah ada.
3. Upload AAB ke **Internal testing** terlebih dahulu.
4. Install/update PRIMA dari tautan internal test pada perangkat Android.
5. Buka Info Kelurahan, tekan **Aktifkan notifikasi**, dan berikan izin Android.
6. Dari Panel Admin, publish satu pengumuman uji yang aman dengan opsi broadcast.
7. Background PRIMA, pastikan satu notifikasi berlogo PRIMA muncul dan saat diketuk membuka pengumuman yang benar.
8. Setelah lolos, gunakan staged rollout sebelum Production penuh.

## Penting — signing key

- Keystore disimpan di GitHub Secret **`KEYSTORE_BASE64`**
- Fingerprint harus cocok dengan `/.well-known/assetlinks.json`
- **Jangan** generate keystore baru di laptop — TWA bisa gagal buka fullscreen
- **URL bar Vercel di atas app?** → lihat [HILANGKAN-URL-BAR.md](./HILANGKAN-URL-BAR.md) (tambah SHA **App signing key** dari Play Console)

Jika secret hilang, jalankan workflow sekali, salin BASE64 dari log step **Setup signing keystore**, simpan sebagai secret, lalu build ulang.

## Upload Play Console

- **Release name**: `1.2.0`
- File: `app-release.aab` dari dalam ZIP artifact
