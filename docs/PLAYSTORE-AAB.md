# Unduh file AAB untuk Play Store

AAB **tidak** disimpan di repo (file signed + besar). Dibuat otomatis oleh GitHub Actions.

## Cara 1 — Build terbaru (disarankan)

1. Buka: https://github.com/fareza777/Prima-Rawajati/actions/workflows/build-android.yml
2. Klik **Run workflow** → branch `main` → **Run workflow**
3. Tunggu status **hijau** (~3–5 menit)
4. Buka run tersebut → scroll ke **Artifacts**
5. Unduh **`prima-aab-v*`** (file ZIP berisi `.aab`)
6. Extract ZIP → upload file bernama **`PRIMA-v1.0.4-code5-targetSdk35.aab`** (nama bisa sedikit beda jika versi naik)
7. Upload ke Play Console → Internal testing

**PENTING:** Jangan upload `intermediary-bundle.aab` — file itu **belum di-sign** dan Play Console akan menolak.

**Cek sebelum upload:** Di Play Console, bundle harus menampilkan **Target SDK 35** dan **versionName 1.0.4** (bukan 1.0.0 / SDK 34). Kalau masih 1.0.0, itu file lama di laptop — unduh ulang dari Actions.

## Build terbaru (SDK 35 + version code 5)

https://github.com/fareza777/Prima-Rawajati/actions/runs/26557809309

Artifact: **prima-aab-v11-sdk35** (login GitHub wajib)

## Penting — signing key

- Keystore disimpan di GitHub Secret **`KEYSTORE_BASE64`**
- Fingerprint harus cocok dengan `/.well-known/assetlinks.json`
- **Jangan** generate keystore baru di laptop — TWA bisa gagal buka fullscreen
- **URL bar Vercel di atas app?** → lihat [HILANGKAN-URL-BAR.md](./HILANGKAN-URL-BAR.md) (tambah SHA **App signing key** dari Play Console)

Jika secret hilang, jalankan workflow sekali, salin BASE64 dari log step **Setup signing keystore**, simpan sebagai secret, lalu build ulang.

## Upload Play Console

- **Release name**: `1.0.1` (atau sama dengan `versionName`)
- File: `app-release.aab` dari dalam ZIP artifact
