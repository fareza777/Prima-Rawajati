# PRIMA AI Announcement & Push Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reviewed document-to-announcement workflow that publishes immediately and sends opt-in Android/PWA push notifications.

**Architecture:** Browser-side PDF text extraction/OCR feeds an authenticated text-AI parser. Reviewed announcements are persisted to the existing GitHub JSON, mirrored to Upstash for immediate reads, and broadcast with standards-based Web Push/VAPID through the existing service worker. Shared pure modules isolate validation, normalization, Redis access, and push payload construction so backend and browser behavior can be tested independently.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Vercel Functions, Upstash Redis REST, Web Push/VAPID (`web-push`), PDF.js, Tesseract.js, Node built-in test runner, Bubblewrap TWA.

## Global Constraints

- Publishing always requires administrator review; AI never publishes or broadcasts directly.
- Source file limit is 10 MB and PDF processing limit is 10 pages.
- OCR processes pages sequentially and supports cancellation.
- Existing DOCX/XLSX/XLS/CSV/TXT/Markdown extraction remains supported.
- Store event timestamps as ISO 8601 with Jakarta `+07:00` offsets.
- Push permission is requested only after a resident user gesture.
- Push subscription endpoints stay in Redis and never enter GitHub or analytics.
- A broadcast occurs only after GitHub persistence and dynamic publication both succeed.
- Existing untracked `tools/*.py` files are user-owned and must not be staged or modified.
- Existing static announcement JSON remains the fallback when Redis is unavailable.

---

## File Structure

- Create `lib/announcement.mjs`: pure announcement normalization, validation, merge, expiry, and notification-payload helpers.
- Create `lib/redis.mjs`: focused Upstash Redis REST command helper.
- Create `lib/push-store.mjs`: push-subscription serialization, validation, storage keys, and cleanup decisions.
- Create `api/announcement-ai.js`: authenticated document-text-to-draft AI endpoint.
- Create `api/announcements.js`: public dynamic reads and authenticated upserts.
- Create `api/push-config.js`: public feature health and VAPID public-key endpoint.
- Create `api/push-subscriptions.js`: subscribe/unsubscribe endpoint.
- Create `api/push-broadcast.js`: authenticated Web Push broadcast endpoint.
- Create `js/announcement-import.js`: file extraction, PDF.js/Tesseract OCR, cancellation, and draft request.
- Create `js/push.js`: resident opt-in status, subscribe, unsubscribe, and UI binding.
- Modify `js/app.js`: admin review UI, publish orchestration, announcement merge/render, and deep-link behavior.
- Modify `index.html`: import dependencies/modules and add resident/admin UI hooks.
- Modify `css/style.css`: polished importer, review, status, warning, and notification-control styles.
- Modify `sw.js`: push receipt and notification-click behavior.
- Modify `privacy.html`: AI processing and push-subscription disclosure.
- Modify `twa-manifest.json`: enable notification delegation and increment app version.
- Modify `README.md` and `docs/PLAYSTORE-AAB.md`: environment and release instructions.
- Create `package.json` and `package-lock.json`: test command and `web-push` runtime dependency.
- Create `tests/*.test.mjs`: domain, API helper, OCR routing, publish-state, and push tests.

---

### Task 1: Test Harness and Announcement Domain

**Files:**
- Create: `package.json`
- Create: `lib/announcement.mjs`
- Create: `tests/announcement.test.mjs`

**Interfaces:**
- Produces: `normalizeAnnouncement(input, now)`, `validateAnnouncement(input)`, `mergeAnnouncements(staticItems, dynamicItems, now)`, `buildNotificationPayload(announcement)`.
- Consumers: dynamic announcement API, admin importer, resident renderer, and broadcast API.

- [ ] **Step 1: Add the Node test command and failing domain tests**

```json
{
  "private": true,
  "scripts": { "test": "node --test tests/*.test.mjs" },
  "dependencies": { "web-push": "^3.6.7" }
}
```

Tests must assert that the emission-test fixture normalizes to ID `pg-uji-emisi-20260716`, rejects a missing title, retains `+07:00`, removes expired items from the active merge, prefers newer `updatedAt`, and produces a same-origin deep link.

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test`

Expected: FAIL because `lib/announcement.mjs` does not exist.

- [ ] **Step 3: Implement the pure domain functions**

```js
export function validateAnnouncement(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['Pengumuman tidak valid.'] };
  if (!String(value.id || '').match(/^pg-[a-z0-9-]{3,80}$/)) errors.push('ID pengumuman tidak valid.');
  if (!String(value.judul || '').trim()) errors.push('Judul wajib diisi.');
  if (!String(value.ringkasan || '').trim()) errors.push('Ringkasan wajib diisi.');
  for (const key of ['eventStart', 'eventEnd', 'expiresAt']) {
    if (value[key] && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(value[key])) errors.push(`${key} wajib memakai zona +07:00.`);
  }
  return { ok: errors.length === 0, errors };
}
```

Implement normalization without mutating the input, cap notification title at 60 characters/body at 160 characters, escape no HTML at this layer, and return active merged items sorted newest/event-soonest first.

- [ ] **Step 4: Run tests and install the locked dependency**

Run: `npm install && npm test`

Expected: all `announcement.test.mjs` tests PASS and `package-lock.json` is created.

- [ ] **Step 5: Commit the domain unit**

```powershell
git add package.json package-lock.json lib/announcement.mjs tests/announcement.test.mjs
git commit -m "feat: add announcement domain model"
```

---

### Task 2: Redis Storage and Dynamic Announcement API

**Files:**
- Create: `lib/redis.mjs`
- Create: `api/announcements.js`
- Create: `tests/redis.test.mjs`
- Create: `tests/announcements-api.test.mjs`

**Interfaces:**
- Consumes: `normalizeAnnouncement`, `validateAnnouncement` from `lib/announcement.mjs`.
- Produces: `redisCommand(command, env)`, `GET /api/announcements`, authenticated `POST /api/announcements`.

- [ ] **Step 1: Write failing Redis and API tests**

Use an injected `fetchImpl` to assert the Redis request is a JSON command with Bearer auth. API tests must cover unconfigured Redis returning `{ configured:false, announcements:[] }`, wrong admin secret returning 401, invalid schema returning 400, and valid upsert returning 200.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/redis.test.mjs tests/announcements-api.test.mjs`

Expected: FAIL because the helper and API do not exist.

- [ ] **Step 3: Implement the Redis helper and API**

```js
export async function redisCommand(command, env = process.env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('REDIS_NOT_CONFIGURED');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`REDIS_HTTP_${response.status}`);
  return (await response.json()).result;
}
```

Store announcements in a Redis hash named `prima:announcements:v1` keyed by announcement ID. Public GET parses values, filters invalid/expired entries through the domain module, and returns `Cache-Control: no-store`. POST compares `X-Admin-Secret`, validates and stamps `updatedAt`, then `HSET`s the JSON value.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/redis.test.mjs tests/announcements-api.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit dynamic storage**

```powershell
git add lib/redis.mjs api/announcements.js tests/redis.test.mjs tests/announcements-api.test.mjs
git commit -m "feat: add dynamic announcement storage"
```

---

### Task 3: Web Push Backend

**Files:**
- Create: `lib/push-store.mjs`
- Create: `api/push-config.js`
- Create: `api/push-subscriptions.js`
- Create: `api/push-broadcast.js`
- Create: `tests/push-store.test.mjs`
- Create: `tests/push-api.test.mjs`

**Interfaces:**
- Consumes: `redisCommand`, `buildNotificationPayload`.
- Produces: public push health/key response, subscribe/unsubscribe endpoints, authenticated broadcast summary `{ sent, failed, removed }`.

- [ ] **Step 1: Write failing subscription and broadcast tests**

Cover valid Chrome-style subscription validation, malformed/cross-shape rejection, feature-disabled config, unauthorized broadcast, missing VAPID configuration, successful send counts, 404/410 removal, and stable announcement notification tags.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/push-store.test.mjs tests/push-api.test.mjs`

Expected: FAIL because the push modules do not exist.

- [ ] **Step 3: Implement subscription storage**

Hash a subscription endpoint with SHA-256 for the Redis hash field and store the complete subscription only as the hash value under `prima:push:subscriptions:v1`. Accept endpoints beginning with `https://` and require non-empty `keys.p256dh` and `keys.auth`. Never return stored endpoints from an API response.

- [ ] **Step 4: Implement push config, subscription, and broadcast APIs**

```js
const enabled = process.env.PUSH_NOTIFICATIONS_ENABLED === 'true';
const configured = enabled && Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
```

The broadcast endpoint configures `web-push.setVapidDetails`, loads subscriptions with `HVALS`, sends sequentially in bounded batches of 20, removes 404/410 endpoints, and returns only aggregate counts. Validate notification payload lengths and PRIMA-relative URLs before sending.

- [ ] **Step 5: Run push and full tests**

Run: `node --test tests/push-store.test.mjs tests/push-api.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit the push backend**

```powershell
git add lib/push-store.mjs api/push-config.js api/push-subscriptions.js api/push-broadcast.js tests/push-store.test.mjs tests/push-api.test.mjs
git commit -m "feat: add web push backend"
```

---

### Task 4: Service Worker and Resident Notification Controls

**Files:**
- Create: `js/push.js`
- Create: `tests/push-client.test.mjs`
- Modify: `sw.js`
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `/api/push-config`, `/api/push-subscriptions`, service-worker registration.
- Produces: `PRIMA_PUSH.init()`, `PRIMA_PUSH.subscribe()`, `PRIMA_PUSH.unsubscribe()`, `PRIMA_PUSH.getStatus()`.

- [ ] **Step 1: Write failing tests for key conversion and UI status mapping**

Test `urlBase64ToUint8Array`, permission states `default/granted/denied`, unsupported browsers, and config-disabled behavior without invoking a permission prompt during initialization.

- [ ] **Step 2: Run the client tests and verify failure**

Run: `node --test tests/push-client.test.mjs`

Expected: FAIL because `js/push.js` does not exist.

- [ ] **Step 3: Implement resident push controls**

`init()` fetches configuration and existing subscription status but never calls `Notification.requestPermission()`. `subscribe()` is called only by the notification button, requests permission, registers with the public VAPID key, then posts the subscription. `unsubscribe()` removes it server-side before browser unsubscribe when possible and always refreshes visible status.

- [ ] **Step 4: Add service-worker push handlers**

```js
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'PRIMA Rawajati', {
    body: data.body || 'Ada informasi terbaru untuk warga.',
    icon: '/img/icons/icon-192.png',
    badge: '/img/icons/icon-192.png',
    tag: data.tag || 'prima-info',
    renotify: false,
    data: { url: data.url || '/?s=info' }
  }));
});
```

`notificationclick` closes the notification, focuses an existing same-origin PRIMA window if present, otherwise calls `clients.openWindow(url)`.

- [ ] **Step 5: Add polished opt-in UI**

Add a notification card to Info Kelurahan and a compact control to About. States must say `Aktif`, `Belum aktif`, `Diblokir di pengaturan`, `Tidak didukung`, or `Belum dikonfigurasi`. Use accessible buttons, live status text, and no automatic permission modal.

- [ ] **Step 6: Run tests and static syntax checks**

Run: `node --test tests/push-client.test.mjs && node --check js/push.js && node --check sw.js && npm test`

Expected: all tests and checks PASS.

- [ ] **Step 7: Commit resident notifications**

```powershell
git add js/push.js tests/push-client.test.mjs sw.js index.html css/style.css
git commit -m "feat: add resident push notification controls"
```

---

### Task 5: PDF/Image Extraction and OCR

**Files:**
- Create: `js/announcement-import.js`
- Create: `tests/announcement-import.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Produces: `PRIMA_ANNOUNCEMENT_IMPORT.extract(file, options)`, `.cancel()`, `.requestDraft(extracted, fileName, secret)`.
- Consumers: admin review workflow in Task 7.

- [ ] **Step 1: Write failing extraction-routing tests**

Test extension/MIME validation, 10 MB rejection, 10-page rejection, embedded PDF text preferred over OCR, scan fallback when normalized text is under 40 characters per page, sequential OCR progress, cancellation, and image routing.

- [ ] **Step 2: Run importer tests and verify failure**

Run: `node --test tests/announcement-import.test.mjs`

Expected: FAIL because the importer does not exist.

- [ ] **Step 3: Implement validation and extraction adapters**

Keep pure routing functions exported for tests. Browser adapters use `window.pdfjsLib`, `window.Tesseract`, existing Mammoth, and existing SheetJS. Normalize OCR whitespace while preserving line breaks needed for dates, labels, and lists.

- [ ] **Step 4: Add PDF.js and Tesseract.js dependencies to the page**

Load pinned browser builds with `defer`, set the PDF.js worker URL explicitly, and initialize OCR languages `ind+eng`. A missing dependency must yield a recoverable Indonesian error rather than crash the editor.

- [ ] **Step 5: Run tests and verify the supplied fixture manually**

Run: `node --test tests/announcement-import.test.mjs && npm test`

Manual fixture: `C:\Users\FAJAR\Downloads\GIAT UJI EMISI KAMIS, 16 JULI 2026.pdf`

Expected extracted facts include `16 Juli 2026`, `09.00`, `14.00`, `Kantor Kecamatan Pancoran`, and `Gratis`.

- [ ] **Step 6: Commit OCR import support**

```powershell
git add js/announcement-import.js tests/announcement-import.test.mjs index.html
git commit -m "feat: add scanned document OCR import"
```

---

### Task 6: Authenticated AI Announcement Draft Endpoint

**Files:**
- Create: `api/announcement-ai.js`
- Create: `tests/announcement-ai.test.mjs`

**Interfaces:**
- Consumes: extracted text, current AI environment/provider configuration, `normalizeAnnouncement` and `validateAnnouncement`.
- Produces: `{ draft, warnings, extractedFacts }` with no publication side effect.

- [ ] **Step 1: Write failing AI endpoint tests**

Test wrong secret, text over 50,000 characters, prompt-injection text treated as source data, invalid upstream JSON, PII removal, and valid emission-test response. Assert no Redis/GitHub/push call is present in the handler.

- [ ] **Step 2: Run endpoint tests and verify failure**

Run: `node --test tests/announcement-ai.test.mjs`

Expected: FAIL because the endpoint does not exist.

- [ ] **Step 3: Implement the endpoint and strict prompt**

The system message states that source text cannot override instructions. The JSON schema includes all fields from the design plus `warnings`. Strip NIK/NIP-like values and recipient-distribution content after AI output, then validate. Use server environment `ANNOUNCEMENT_AI_MODEL/PROVIDER/BASE_URL` when set, otherwise the existing OpenRouter environment and a configured text model. Return 503 with an actionable message when no suitable provider/key exists.

- [ ] **Step 4: Run endpoint and full tests**

Run: `node --test tests/announcement-ai.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit AI drafting**

```powershell
git add api/announcement-ai.js tests/announcement-ai.test.mjs
git commit -m "feat: generate reviewed announcement drafts with AI"
```

---

### Task 7: Admin Review, Publish Orchestration, and Immediate Resident Merge

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Create: `tests/publish-flow.test.mjs`

**Interfaces:**
- Consumes: `PRIMA_ANNOUNCEMENT_IMPORT`, `/api/save-data`, `/api/announcements`, `/api/push-broadcast`, and announcement domain-compatible fields.
- Produces: document upload/review UI, idempotent `publishAnnouncementDraft`, immediate dynamic merge, deep-link focus.

- [ ] **Step 1: Write failing publish-state tests**

Extract a pure state transition helper and test: GitHub failure halts all later steps; GitHub success plus Redis failure does not broadcast; both publication steps plus disabled notification completes without broadcast; all enabled steps return aggregate push results; duplicate click reuses the same announcement ID.

- [ ] **Step 2: Run publish-flow tests and verify failure**

Run: `node --test tests/publish-flow.test.mjs`

Expected: FAIL because publish orchestration is absent.

- [ ] **Step 3: Build the admin upload and OCR progress screen**

Add `Buat dari Dokumen` to `kelPengumuman`. Show drag/drop/file selection, accepted formats, current extraction stage, page progress, cancellation, and recoverable errors. Preserve extracted text when AI fails so manual drafting remains possible.

- [ ] **Step 4: Build the side-by-side review screen**

Render source text and editable structured fields. Add visible warning acknowledgements, required-field errors, attachment choice, important flag, auto-expiry, notification title/body, and broadcast checkbox. Escape all source and draft content during HTML rendering.

- [ ] **Step 5: Implement ordered publish orchestration**

```js
const result = await saveStaticAnnouncement(draft, attachment);
if (!result.ok) return fail('github', result);
const live = await upsertDynamicAnnouncement(draft);
if (!live.ok) return partial('redis', result, live);
if (draft.notification?.enabled) return broadcastAnnouncement(draft);
return complete(result, live);
```

Disable the button while active, use the stable announcement ID as idempotency key, report each stage separately, and add retry buttons only for failed stages.

- [ ] **Step 6: Merge dynamic announcements and support deep links**

Fetch `/api/announcements` after base data readiness, merge/dedupe by ID and `updatedAt`, rerender Info Kelurahan, and focus/open `?s=info&announcement=<id>`. Network failure silently retains static items but records a console warning without exposing secrets.

- [ ] **Step 7: Run tests, syntax checks, and local smoke test**

Run: `node --test tests/publish-flow.test.mjs && node --check js/app.js && npm test`

Expected: all tests/checks PASS. Manual local smoke verifies existing admin JSON editing still works.

- [ ] **Step 8: Commit the reviewed publish workflow**

```powershell
git add js/app.js index.html css/style.css tests/publish-flow.test.mjs
git commit -m "feat: add reviewed publish and broadcast workflow"
```

---

### Task 8: Privacy, TWA, Environment, and Release Documentation

**Files:**
- Modify: `privacy.html`
- Modify: `twa-manifest.json`
- Modify: `README.md`
- Modify: `docs/PLAYSTORE-AAB.md`
- Modify: `sw.js`

**Interfaces:**
- Documents and enables the production configuration created by Tasks 2-7.

- [ ] **Step 1: Update privacy disclosure**

Explain that document text is processed by the configured AI provider only during admin drafting; push endpoints/keys are stored in Redis to deliver opted-in notifications; endpoints are removed when invalid or unsubscribed; residents can disable notifications; subscriptions are not committed to GitHub or used for advertising.

- [ ] **Step 2: Enable TWA notification delegation and bump versions**

Set `enableNotifications` to `true`, increment `appVersion` from `18` to `19`, set `appVersionName` from `1.1.7` to `1.2.0`, and increment the service-worker cache version so installed clients receive new handlers.

- [ ] **Step 3: Document exact production variables and VAPID generation**

```powershell
npx web-push generate-vapid-keys
```

Document `PUSH_NOTIFICATIONS_ENABLED=true`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, Upstash variables, and optional `ANNOUNCEMENT_AI_*` overrides. State that private values belong only in Vercel environment variables.

- [ ] **Step 4: Document AAB update procedure**

Include Bubblewrap regeneration/build, signing-key preservation, notification permission verification, closed/internal testing, version-code check, and staged Play Store rollout. Do not replace the existing keystore.

- [ ] **Step 5: Run documentation/config checks**

Run: `node -e "JSON.parse(require('fs').readFileSync('twa-manifest.json','utf8')); JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON OK')" && git diff --check`

Expected: `JSON OK` and no whitespace errors.

- [ ] **Step 6: Commit release configuration**

```powershell
git add privacy.html twa-manifest.json README.md docs/PLAYSTORE-AAB.md sw.js
git commit -m "docs: configure announcement push release"
```

---

### Task 9: Full Verification and Supplied-PDF Acceptance

**Files:**
- Modify only files required to correct verified defects.
- Test: all `tests/*.test.mjs` plus browser/device acceptance.

**Interfaces:**
- Verifies the complete system and prevents completion claims without evidence.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero skipped tests.

- [ ] **Step 2: Run JavaScript and repository checks**

Run: `Get-ChildItem api,lib,js -Recurse -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName }; git diff --check; git status --short`

Expected: every syntax check passes; only intentional feature files and pre-existing untracked user tools appear.

- [ ] **Step 3: Verify the supplied scanned PDF end-to-end locally**

Start the supported local environment with `vercel dev`, upload `C:\Users\FAJAR\Downloads\GIAT UJI EMISI KAMIS, 16 JULI 2026.pdf`, and confirm the review draft contains:

- `Uji Emisi Kendaraan Bermotor Gratis`
- `2026-07-16T09:00:00+07:00`
- `2026-07-16T14:00:00+07:00`
- `Halaman belakang Kantor Kecamatan Pancoran`
- `Sudin Lingkungan Hidup Kota Administrasi Jakarta Selatan`

Confirm the draft excludes the recipient list, signature, and NIP.

- [ ] **Step 4: Verify resident and regression flows in browser**

Verify home, services, map, Info Kelurahan, chatbot, Suara Warga, admin login/editor, dynamic announcement fallback, notification state UI, permission prompt only on click, mobile layout, and offline refresh behavior.

- [ ] **Step 5: Verify Android TWA notification behavior when credentials/device are available**

Install the version-19 internal-test AAB, opt in, background PRIMA, send one reviewed announcement, verify one branded notification, tap it, and confirm the correct announcement opens. If credentials or a physical Android device are unavailable, report this exact external verification as pending rather than claiming it passed.

- [ ] **Step 6: Final review and commit verified corrections**

If verification changed files, rerun Steps 1-2 and commit only those fixes:

```powershell
git add <verified-feature-files-only>
git commit -m "fix: resolve announcement push verification issues"
```

Record remaining external configuration steps and never include secrets in the report.
