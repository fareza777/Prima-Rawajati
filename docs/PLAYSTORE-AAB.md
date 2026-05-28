# Unduh file AAB untuk Play Store

AAB **tidak** disimpan di repo (file signed + besar). Dibuat otomatis oleh GitHub Actions.

## Cara 1 — Build terbaru (disarankan)

1. Buka: https://github.com/fareza777/Prima-Rawajati/actions/workflows/build-android.yml
2. Klik **Run workflow** → branch `main` → **Run workflow**
3. Tunggu status **hijau** (~3–5 menit)
4. Buka run tersebut → scroll ke **Artifacts**
5. Unduh **`prima-aab-v*`** (file ZIP berisi `.aab`)
6. Extract ZIP → upload **`app-release.aab`** (bukan `intermediary-bundle.aab`)
7. Upload ke Play Console → Internal testing

**PENTING:** Jangan upload `intermediary-bundle.aab` — file itu **belum di-sign** dan Play Console akan menolak.

## Cara 2 — Artifact build lama (jika masih ada)

Run sukses terakhir (22 Mei 2026):

https://github.com/fareza777/Prima-Rawajati/actions/runs/26273766821

Artifact: **prima-aab-v7** (login GitHub wajib)

## Penting — signing key

- Keystore disimpan di GitHub Secret **`KEYSTORE_BASE64`**
- Fingerprint harus cocok dengan `/.well-known/assetlinks.json`
- **Jangan** generate keystore baru di laptop — TWA bisa gagal buka fullscreen

Jika secret hilang, jalankan workflow sekali, salin BASE64 dari log step **Setup signing keystore**, simpan sebagai secret, lalu build ulang.

## Upload Play Console

- **Release name**: `1.0.1` (atau sama dengan `versionName`)
- File: `app-release.aab` dari dalam ZIP artifact
