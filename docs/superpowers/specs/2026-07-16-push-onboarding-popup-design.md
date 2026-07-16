# Desain Popup Onboarding Notifikasi PRIMA

## Tujuan

Pengguna yang baru memasang atau pertama kali membuka PRIMA langsung mengetahui bahwa notifikasi pengumuman tersedia, tanpa harus menemukan sendiri kartu **Aktifkan notifikasi** di halaman Info.

## Pendekatan yang Dipertimbangkan

1. **Popup onboarding khusus saat pertama membuka aplikasi (dipilih).** Pesan terlihat jelas, dapat dibuat aksesibel, dan tetap meminta izin hanya setelah pengguna menekan tombol.
2. Memakai modal konten umum yang sudah ada. Implementasinya lebih singkat, tetapi modal tersebut dipakai banyak fitur dan berisiko saling menimpa saat aplikasi mulai.
3. Meminta izin sistem otomatis saat aplikasi dibuka. Pendekatan ini ditolak karena izin Web Push/Android harus dipicu oleh tindakan pengguna dan permintaan mendadak cenderung ditolak.

## Perilaku

- Setelah `PRIMA_PUSH.init()` selesai, popup muncul bila seluruh kondisi berikut terpenuhi:
  - Web Push didukung perangkat;
  - layanan push sudah dikonfigurasi;
  - izin masih berstatus `default`;
  - perangkat belum memiliki subscription;
  - popup versi ini belum pernah ditutup atau diproses pada perangkat tersebut.
- Popup tidak muncul untuk pengguna yang notifikasinya sudah aktif, diblokir, tidak didukung, atau belum dikonfigurasi.
- Popup berisi judul **Aktifkan Notifikasi PRIMA**, penjelasan singkat manfaatnya, tombol utama **Aktifkan sekarang**, dan tombol sekunder **Nanti saja**.
- Popup tidak memanggil `Notification.requestPermission()` ketika tampil. Permintaan izin hanya dijalankan setelah tombol **Aktifkan sekarang** ditekan.
- Setelah tombol utama ditekan, popup ditutup dan status kartu notifikasi diperbarui. Jika izin gagal atau ditolak, kartu utama tetap memberi petunjuk pengaturan.
- **Nanti saja** menutup popup untuk versi onboarding ini. Tombol aktivasi pada halaman Info dan halaman Tentang tetap tersedia.
- Preferensi disimpan lokal dengan kunci berversi agar perubahan onboarding di masa depan dapat diperkenalkan secara terkontrol.

## Tampilan dan Aksesibilitas

- Menggunakan overlay khusus dengan `role="dialog"`, `aria-modal="true"`, judul yang terhubung melalui `aria-labelledby`, serta fokus awal pada tombol utama.
- Warna, radius, tipografi, dan tombol mengikuti palet biru–emas PRIMA.
- Popup nyaman pada layar Android kecil, tidak tertutup navigasi bawah, dan menghormati safe-area.
- Tombol dapat digunakan dengan sentuhan, keyboard, dan pembaca layar.

## Struktur Implementasi

- `index.html`: markup dialog onboarding yang tersembunyi saat awal.
- stylesheet PRIMA: overlay, kartu dialog, ikon, serta layout tombol responsif.
- `js/push.js`: keputusan kapan popup tampil, penyimpanan status lokal, serta handler aktifkan/tunda.
- `tests/push-client.test.mjs`: regresi untuk keputusan tampil/tidak tampil dan status penyimpanan onboarding.
- `sw.js`: versi cache diperbarui agar perangkat menerima HTML, CSS, dan JavaScript terbaru segera setelah deployment.

## Penanganan Kesalahan

- Kegagalan membaca/menulis `localStorage` tidak mematikan fitur push.
- Kegagalan subscribe menutup status sibuk, mempertahankan kontrol aktivasi utama, dan menampilkan pesan kesalahan yang sudah digunakan PRIMA.
- Klik berulang dinonaktifkan selama permintaan izin/subscription berlangsung.

## Kriteria Selesai

- Pengguna baru yang memenuhi syarat melihat popup setelah status push diketahui.
- Tidak ada prompt izin sistem sebelum klik pengguna.
- Pengguna aktif atau terblokir tidak mendapat popup yang salah.
- Pilihan **Nanti saja** bertahan setelah aplikasi dibuka ulang.
- Aktivasi melalui popup memakai alur subscription yang sama dengan tombol yang sudah ada.
- Seluruh tes lama dan tes onboarding baru lulus.
