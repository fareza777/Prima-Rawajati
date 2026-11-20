# PRIMA – Migrasi Vercel → Cloudflare Workers (Free)

Situs ini sekarang bisa jalan di **Cloudflare Workers + Static Assets** (gratis):

| Bagian | Dulu (Vercel) | Sekarang (Cloudflare) |
|---|---|---|
| File statis (`index.html`, `js/`, `css/`, `img/`, `data/`, `dokumen/`, `.well-known/`) | Static | Workers Static Assets (gratis, tidak dihitung kuota request) |
| `/api/*` (chat, analytics, feedback, save-data, push, announcement…) | Edge/Node Functions | `worker/index.js` memanggil handler yang sama di `api/*.js` |
| Rewrite `/(.*)` → `/index.html` | `vercel.json` | `not_found_handling: single-page-application` |
| Header `assetlinks.json` / `sw.js` | `vercel.json` | `_headers` |

URL baru: **https://prima-rawajati.fajar-mreza.workers.dev**

`vercel.json` dibiarkan supaya Vercel tetap bisa dipakai kalau perlu.

## File

- `wrangler.jsonc` – konfigurasi Worker (`nodejs_compat` supaya `process.env` dan `web-push` jalan).
- `worker/index.js` – router `/api/<nama>` → `api/<nama>.js`, sisanya file statis.
- `.assetsignore` – folder yang **tidak** ikut di-upload (api, lib, tests, tools, app, docs, node_modules, dll.).
- `_headers` – header untuk `/.well-known/assetlinks.json` dan `/sw.js`.

## Deploy (Workers Builds dari GitHub)

Dashboard Cloudflare → Workers & Pages → `prima-rawajati` → Settings → Build:

- Repo: `fareza777/Prima-Rawajati`, branch produksi `main`
- Build command: *(kosong)*
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy: `npx wrangler versions upload`

Manual dari laptop: `npx wrangler deploy`.

## Environment variables

Variabel non-rahasia ada di `wrangler.jsonc` (`GITHUB_REPO`, `GITHUB_BRANCH`).
Yang rahasia di-set lewat dashboard (Settings → Variables and Secrets → *Secret*) atau
`npx wrangler secret put NAMA`:

| Nama | Wajib | Untuk |
|---|---|---|
| `OPENROUTER_API_KEY` | ya | Chatbot `/api/chat`, `/api/announcement-ai` |
| `ADMIN_SECRET` | ya | `/api/save-data`, `/api/push-broadcast`, admin pengumuman |
| `GITHUB_TOKEN` | ya | `/api/save-data`, `/api/feedback` (commit ke repo) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | opsional | Analytics global, pengumuman, daftar push |
| `PUSH_NOTIFICATIONS_ENABLED` (`true`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | opsional | Web Push |
| `MINIMAX_API_KEY` / `OPENAI_API_KEY` / dll. | opsional | Provider AI lain |

Lokal: salin ke `.dev.vars` (sudah di `.gitignore`) lalu `npx wrangler dev`.

## Aplikasi Android (TWA `id.rawajati.prima`)

Aplikasi lama membuka `https://prima-rawajati.vercel.app`. Supaya pindah ke host baru,
TWA harus di-build ulang dengan host baru (lihat PR terpisah yang mengubah
`twa-manifest.json`). `/.well-known/assetlinks.json` di host baru berisi fingerprint
SHA-256 yang sama, jadi verifikasi Digital Asset Links tetap lolos tanpa ganti keystore.
