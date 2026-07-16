# Push Notification Onboarding Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menampilkan popup onboarding satu kali kepada pengguna baru yang memenuhi syarat agar mereka mengetahui dan mengaktifkan notifikasi PRIMA.

**Architecture:** Keputusan tampil dibuat sebagai fungsi murni di `js/push.js` agar mudah diuji. Dialog memiliki markup dan gaya khusus, tetapi aktivasi memakai fungsi `subscribe()` yang sudah ada sehingga hanya ada satu alur izin dan penyimpanan subscription.

**Tech Stack:** JavaScript ES modules, HTML, CSS, Web Push API, Node test runner, service worker.

## Global Constraints

- Izin sistem hanya diminta setelah klik **Aktifkan sekarang**.
- Popup tidak muncul jika push aktif, diblokir, tidak didukung, atau belum dikonfigurasi.
- **Nanti saja** disimpan lokal untuk versi onboarding ini.
- Tidak menambahkan dependency baru.

---

### Task 1: Keputusan onboarding yang dapat diuji

**Files:**
- Modify: `tests/push-client.test.mjs`
- Modify: `js/push.js`

**Interfaces:**
- Produces: `shouldShowPushOnboarding({ statusCode, permission, seen }): boolean`
- Produces: storage key `prima_push_onboarding_v1`

- [ ] **Step 1: Tulis tes gagal untuk keputusan tampil**

```js
test('shows onboarding only for an unseen eligible inactive user', () => {
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: false }), true);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'active', permission: 'granted', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'blocked', permission: 'denied', seen: false }), false);
  assert.equal(shouldShowPushOnboarding({ statusCode: 'inactive', permission: 'default', seen: true }), false);
});
```

- [ ] **Step 2: Jalankan tes dan pastikan gagal karena export belum ada**

Run: `node --test tests/push-client.test.mjs`
Expected: FAIL karena `shouldShowPushOnboarding` belum diekspor.

- [ ] **Step 3: Implementasikan fungsi keputusan minimum**

```js
export function shouldShowPushOnboarding({ statusCode, permission, seen } = {}) {
  return statusCode === 'inactive' && permission === 'default' && seen !== true;
}
```

- [ ] **Step 4: Jalankan tes dan pastikan lulus**

Run: `node --test tests/push-client.test.mjs`
Expected: seluruh tes push client PASS.

### Task 2: Dialog, tindakan pengguna, dan pembaruan cache

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/push.js`
- Modify: `sw.js`
- Test: `tests/push-client.test.mjs`

**Interfaces:**
- Consumes: `shouldShowPushOnboarding(...)` dan `subscribe()` dari Task 1.
- Produces: elemen `[data-push-onboarding]`, `[data-push-onboarding-activate]`, dan `[data-push-onboarding-later]`.

- [ ] **Step 1: Tambahkan tes kontrak markup/cache yang gagal**

```js
test('app shell contains push onboarding controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-push-onboarding/);
  assert.match(html, /data-push-onboarding-activate/);
  assert.match(html, /data-push-onboarding-later/);
});
```

- [ ] **Step 2: Jalankan tes dan pastikan gagal karena dialog belum ada**

Run: `node --test tests/push-client.test.mjs`
Expected: FAIL pada kontrak markup onboarding.

- [ ] **Step 3: Tambahkan dialog aksesibel dan gaya PRIMA**

```html
<div class="push-onboarding" data-push-onboarding hidden>
  <section role="dialog" aria-modal="true" aria-labelledby="push-onboarding-title">
    <h2 id="push-onboarding-title">Aktifkan Notifikasi PRIMA</h2>
    <p>Dapatkan pengumuman penting Kelurahan Rawajati langsung di HP Anda.</p>
    <button data-push-onboarding-activate>Aktifkan sekarang</button>
    <button data-push-onboarding-later>Nanti saja</button>
  </section>
</div>
```

- [ ] **Step 4: Hubungkan lifecycle dialog ke init dan subscribe**

Implementasikan helper internal untuk membaca/menulis `prima_push_onboarding_v1`, membuka dialog setelah `init()`, menutup pada pilihan pengguna, mengunci tombol saat subscribe, dan memfokuskan tombol utama.

- [ ] **Step 5: Naikkan versi cache service worker**

Ubah `const CACHE = 'prima-v4.11.1'` menjadi `const CACHE = 'prima-v4.12.0'` agar shell terbaru segera menggantikan cache lama.

- [ ] **Step 6: Jalankan seluruh pengujian**

Run: `npm test`
Expected: seluruh tes PASS tanpa kegagalan.

- [ ] **Step 7: Verifikasi produksi setelah deploy**

Run: request `https://prima-rawajati.vercel.app/`, `js/push.js`, dan `sw.js`; pastikan markup onboarding dan cache `prima-v4.12.0` tersedia, lalu uji dialog pada profil browser bersih tanpa memicu izin otomatis.
