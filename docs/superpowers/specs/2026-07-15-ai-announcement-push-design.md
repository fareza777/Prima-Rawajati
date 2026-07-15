# PRIMA AI Announcement & Push Notification Design

**Date:** 2026-07-15
**Status:** Approved concept; written specification awaiting user review
**Owner:** PRIMA Rawajati administrator

## 1. Objective

Add an admin workflow that turns an uploaded public document into a reviewed PRIMA announcement and, only after explicit administrator approval, publishes it and broadcasts a push notification to subscribed residents.

The primary workflow is:

`Upload PDF/image/document -> extract text/OCR -> AI draft -> administrator review -> Publish & Broadcast -> announcement appears immediately -> opted-in devices receive a notification`

The system must optimize a daily administrator workflow while preventing an AI or OCR error from being published without human review.

## 2. Scope

### In scope

- Upload PDF, JPG, PNG, DOCX, XLSX, XLS, CSV, TXT, and Markdown from the admin panel.
- Extract embedded text where available and use OCR for scanned PDF/image pages.
- Use the configured PRIMA text AI to convert extracted text into a structured announcement draft.
- Show an editable preview with source facts and validation warnings.
- Publish the announcement to `Info Kelurahan` and optionally broadcast it.
- Store a dynamic copy so residents can see a newly published announcement immediately without waiting for a Vercel deployment.
- Keep the existing GitHub-backed JSON as the durable content copy and deployment path.
- Allow residents to explicitly opt in or out of notifications.
- Open the correct announcement when a notification is tapped.
- Automatically hide expired event announcements from the default active list while retaining their data.
- Update the TWA configuration so Android delegates notification permission and presentation to the PRIMA app.
- Update the privacy disclosure for push subscriptions and AI-assisted document processing.

### Out of scope

- Publishing without administrator review.
- Notifications to residents who have not opted in.
- Native Android Firebase SDK integration; PRIMA remains a TWA/PWA and uses standards-based Web Push.
- Per-RT/RW targeting in the first release. The data model leaves room for future topics.
- Guaranteed delivery. Device settings, browser state, and revoked permissions can prevent delivery.
- Treating PRIMA as an official complaint or emergency-alert channel.

## 3. Selected Approach

### 3.1 Document extraction

Use a hybrid, browser-side extraction pipeline:

1. Existing DOCX/XLSX/CSV/TXT/Markdown extraction remains unchanged.
2. PDF.js first attempts to read a PDF text layer.
3. If a PDF page has insufficient embedded text, PDF.js renders it to an image and Tesseract.js performs Indonesian/English OCR.
4. JPG and PNG inputs go directly to OCR.
5. Only extracted text is sent to the PRIMA AI endpoint. The source file stays on the admin device until the administrator publishes it as an attachment.

This approach works with the currently configured text models, avoids coupling the feature to one vision-model vendor, and handles the supplied two-page scanned letter.

Limits for the first release:

- Maximum source file size: 10 MB.
- Maximum PDF pages processed: 10.
- OCR runs sequentially per page to control memory usage on a phone.
- Pages over the limit are rejected before processing; they are not silently truncated.
- OCR progress reports the current page and permits cancellation.

### 3.2 AI drafting

Add an authenticated `POST /api/announcement-ai` endpoint. It uses the existing configured provider/model and accepts extracted text plus the source filename. It must:

- Treat document text as untrusted source data, not instructions.
- Return only schema-conforming JSON.
- Extract public, resident-relevant facts.
- Exclude NIK, NIP, signatures, recipient distribution lists, personal phone numbers, and private addresses unless the administrator manually adds an authorized public contact.
- Preserve uncertainty as warnings rather than inventing missing facts.
- Generate a concise title, summary, detail text, event time, location, source attribution, expiry, and notification copy.
- Never trigger publishing or notification delivery.

The endpoint requires `X-Admin-Secret`, validates origin and payload size, applies a low temperature, and performs server-side schema validation before returning a draft.

### 3.3 Publication and immediate availability

The administrator sees the AI result in a dedicated review screen. `Publish & Broadcast` performs these steps:

1. Validate required fields and highlight OCR/AI warnings.
2. Upload the optional source attachment through the existing authenticated GitHub content flow.
3. Add or update the announcement in the existing `infoKelurahan.pengumuman` draft and call `/api/save-data` for durable GitHub persistence.
4. Upsert the same announcement into Upstash Redis through a new authenticated `/api/announcements` endpoint.
5. Refresh the current admin UI with the published item.
6. If broadcasting is selected, send the notification only after the dynamic upsert succeeds.

Resident clients fetch active dynamic announcements from `GET /api/announcements`, merge them with the static JSON by `id`, prefer the newer `updatedAt` value, and render immediately. This removes the current 1-2 minute Vercel-deploy delay from the announcement experience while retaining the repository copy as a durable backup.

If GitHub persistence fails, the workflow stops before dynamic publication and broadcasting. If GitHub persistence succeeds but the dynamic upsert fails, the UI reports `Saved to repository; not live or broadcast yet` and offers retry. The workflow must not claim full success for partial completion.

### 3.4 Push delivery

Use standards-based Web Push with VAPID:

- The existing service worker handles `push`, displays a PRIMA-branded notification, and handles `notificationclick`.
- A resident opts in from a clear `Aktifkan Notifikasi` action initiated by a user gesture.
- `POST /api/push-subscriptions` stores a validated subscription in Upstash Redis.
- `DELETE /api/push-subscriptions` removes it.
- `POST /api/push-broadcast` requires `X-Admin-Secret`, sends a bounded payload to all stored subscriptions, removes expired subscriptions, and returns sent/failed/removed counts.
- A notification uses a stable tag per announcement to prevent accidental duplicates.
- The notification deep link is `/?s=info&announcement=<id>`.

Required environment variables:

- Existing `UPSTASH_REDIS_REST_URL`
- Existing `UPSTASH_REDIS_REST_TOKEN`
- New `VAPID_PUBLIC_KEY`
- New `VAPID_PRIVATE_KEY`
- New `VAPID_SUBJECT`, using a controlled `mailto:` address

The TWA manifest changes `enableNotifications` to `true`, after which a new Android App Bundle must be built and released through Google Play. Residents who already installed PRIMA receive notification capability after updating and granting Android notification permission.

## 4. Admin Experience

Add `Buat dari Dokumen` to the `Pengumuman Kelurahan` editor.

### Stage A: Upload and extraction

- Drag/drop area plus file picker.
- Accepted formats and limits displayed before selection.
- Progress stages: reading, rendering page, OCR page N/M, drafting.
- Cancel action during OCR.
- Clear error messages for encrypted, corrupt, oversized, or unsupported files.

### Stage B: Review

The editable review form contains:

- Title
- Publication date
- Event start and end
- Location
- Organizer
- Summary
- Full description
- Source agency, document number, and document date
- Original attachment name
- Important flag
- Automatic expiry
- Notification title and body
- `Send notification` checkbox, default on only when event information is time-sensitive and complete

The source panel shows extracted text beside the form on desktop and in a collapsible section on mobile. Fields with low confidence or conflicting date/time values receive a visible warning. The publish button remains available after warnings are acknowledged; missing required fields block publishing.

### Stage C: Result

After publication, show:

- Announcement status and ID
- GitHub persistence status
- Immediate publication status
- Notification sent/failed/removed counts
- Buttons to view the announcement and retry only failed steps

## 5. Resident Experience

### Notification opt-in

- Do not show the browser permission prompt on first load.
- Show a PRIMA explanation card on the Info page and in About/Settings.
- Request OS/browser permission only after the resident presses `Aktifkan Notifikasi`.
- Display current status: active, blocked in device settings, unsupported, or inactive.
- Provide `Matikan Notifikasi` and a short privacy explanation.

### Announcement display

- New announcements can be opened directly from a push notification.
- Time-sensitive announcements show `Hari ini`, `Besok`, or `Berakhir dalam ...` badges.
- Expired announcements move out of the active default list.
- The original document is available only when the administrator chose to publish it.
- Source agency and document reference are visible to strengthen trust.

## 6. Announcement Data Model

Existing fields remain compatible. New optional fields are additive:

```json
{
  "id": "pg-uji-emisi-20260716",
  "judul": "Uji Emisi Kendaraan Bermotor Gratis",
  "emoji": "🚗",
  "tanggal": "2026-07-15",
  "eventStart": "2026-07-16T09:00:00+07:00",
  "eventEnd": "2026-07-16T14:00:00+07:00",
  "lokasi": "Halaman belakang Kantor Kecamatan Pancoran",
  "penyelenggara": "Sudin Lingkungan Hidup Kota Administrasi Jakarta Selatan",
  "ringkasan": "Uji emisi gratis bagi masyarakat di wilayah Kecamatan Pancoran.",
  "deskripsi": "...",
  "penting": true,
  "sumber": {
    "instansi": "Kecamatan Pancoran",
    "nomorDokumen": "586/-LH.02.00",
    "tanggalDokumen": "2026-07-14"
  },
  "lampiran": {
    "nama": "GIAT UJI EMISI KAMIS, 16 JULI 2026.pdf",
    "url": "dokumen/pengumuman/giat-uji-emisi-2026-07-16.pdf"
  },
  "expiresAt": "2026-07-16T14:00:00+07:00",
  "notification": {
    "title": "Uji Emisi Gratis Besok",
    "body": "Kamis, 16 Juli · 09.00–14.00 WIB · Kantor Kecamatan Pancoran.",
    "enabled": true
  },
  "createdAt": "2026-07-15T20:00:00+07:00",
  "updatedAt": "2026-07-15T20:00:00+07:00"
}
```

Dates are stored as ISO 8601. Jakarta event times must include `+07:00`; they must not be inferred through UTC-only browser parsing.

## 7. Security, Privacy, and Abuse Controls

- AI parsing, dynamic publication, and broadcasting require the existing admin secret.
- Never expose AI keys, VAPID private keys, Redis tokens, or GitHub tokens to the client.
- Only the VAPID public key is shipped to residents.
- Validate file type by extension and MIME; reject unexpected binary formats.
- Escape all AI-generated and OCR-derived fields before rendering.
- Treat OCR/document content as untrusted and defend the AI prompt against document prompt injection.
- Apply strict server-side announcement and notification schemas.
- Limit notification title/body length and deep links to the PRIMA origin.
- Store push subscription endpoints only in Redis; never commit them to GitHub or analytics.
- Update `privacy.html` to disclose notification subscriptions, retention, opt-out, and AI processing.
- Log aggregate send counts, not subscription endpoints, in the admin result.
- Require an explicit confirmation when broadcasting an announcement marked non-public or containing unresolved privacy warnings.

## 8. Failure Handling

- No text layer: automatically use OCR.
- OCR unavailable/offline: keep the file selected and offer retry; do not create an empty draft.
- AI unavailable: retain extracted text and permit manual announcement entry.
- Invalid AI JSON: retry normalization once, then show a recoverable error.
- Attachment upload failure: do not broadcast; allow publishing without attachment only after explicit confirmation.
- Redis unavailable: static GitHub publication may continue, but broadcast is disabled and clearly reported.
- Individual push endpoint expired: delete it and continue other recipients.
- Notification permission denied: show instructions to re-enable it in app/device settings; do not repeatedly prompt.
- Duplicate publish click: use announcement ID/idempotency keys and disable the action while in progress.

## 9. Testing and Verification

### Automated tests

- File acceptance, size/page limits, and extraction routing.
- OCR text normalization.
- AI response schema validation and PII filtering.
- Announcement timestamp handling in Asia/Jakarta.
- Static/dynamic merge and ID deduplication.
- Expiry filtering.
- Push subscription validation and unsubscribe behavior.
- Broadcast auth, payload limits, duplicate tags, and expired-endpoint cleanup.
- Partial publication failure states.

### Browser and device verification

- Use the supplied scanned two-page emission-test PDF as the primary acceptance fixture.
- Verify the generated draft contains 16 July 2026, 09.00-14.00 WIB, the Kecamatan Pancoran location, free cost, and the correct organizer.
- Verify it excludes the recipient list, signature, and NIP.
- Verify manual edits survive publication.
- Verify the announcement appears immediately on a second device/browser.
- Verify notification opt-in, background delivery, tap-to-open, duplicate suppression, and opt-out on an Android device with the Play Store TWA build.
- Verify existing PWA offline, service, map, chat, admin, and data-editor flows still work.

## 10. Release and Rollback

Release in two coordinated parts:

1. Deploy the web/backend changes and configure Upstash/VAPID secrets.
2. Build and upload a new AAB with TWA notification delegation enabled.

Do not expose the broadcast button until Redis and VAPID health checks pass. If push causes a production issue, disable broadcast through a server environment flag while keeping document-to-announcement drafting and publication available. Existing static JSON remains a fallback if dynamic announcement retrieval is unavailable.

## 11. Acceptance Criteria

The feature is complete when:

- The supplied scanned PDF can be uploaded from a phone or desktop admin session.
- A structured, editable draft is generated without publishing automatically.
- Public facts are correct and private/irrelevant letter metadata is excluded.
- One administrator action publishes the reviewed announcement and optionally broadcasts it.
- The announcement is visible immediately to residents.
- An opted-in Android PRIMA installation receives a branded notification while the app is backgrounded, and tapping it opens the correct announcement.
- Failures and partial successes are visible and retryable.
- Existing app features pass regression checks.
- Privacy disclosure and Play Store/TWA notification configuration are updated.
