# Unduh file AAB untuk Play Store

AAB **tidak** disimpan di repo (file signed + besar). Dibuat otomatis oleh GitHub Actions.

## Build yang benar untuk review Play (v1.2.4)

**Penyebab penolakan “doesn't open or load”:**
- AAB lama (1.2.1) memakai `androidbrowserhelper` 2.5.0 + targetSdk 36 → sesi Chrome/TWA sering gagal.
- AAB 1.2.2 meminta `POST_NOTIFICATIONS` sebelum TWA dibuka → bot review Google tidak grant → layar kosong.

**Perbaikan di 1.2.4:**
- `androidbrowserhelper` **2.7.2**, `minSdk` **23**, `targetSdk` **36**
- Launcher **tidak** menunggu izin notifikasi (langsung buka TWA)
- Web push popup tetap **paused** sampai Play approve

## Cara unduh

1. Buka: https://github.com/fareza777/Prima-Rawajati/actions/workflows/build-android.yml
2. Run terbaru yang **hijau** → Artifacts → `prima-aab-v*-sdk36`
3. Extract → upload **`PRIMA-v1.2.4-code23-targetSdk36.aab`**

**Cek sebelum upload:** Target SDK **36**, versionCode **23**, versionName **1.2.4**.

## Upload Play Console

- Track: **Internal testing** dulu → install & buka app → baru Production / resubmit review
- Release name: `1.2.4`
