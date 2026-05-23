# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

PRIMA is a zero-build vanilla HTML/CSS/JS PWA for Kelurahan Rawajati (a local government ward in South Jakarta). There is no `package.json`, no build step, and no `node_modules`. The frontend is entirely static.

### Running the Application

**Static frontend (recommended for most development):**

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

Open `http://localhost:8765`. All features work except AI chatbot (falls back to rule-based mode) and admin data persistence (saves only to localStorage).

**Full-stack with API routes (requires Vercel account):**

```bash
vercel dev
```

Requires `vercel login` first. API routes (`/api/chat`, `/api/save-data`, `/api/feedback`) only function under the Vercel dev runtime.

### Key Architecture Notes

- **No linter/formatter configured** — there is no ESLint, Prettier, or any other linting tool in this project.
- **No automated tests** — no test framework or test files exist.
- **No build step** — all JS/CSS is served as-is (vanilla, no transpilation).
- **Data lives in JSON** — `data/prima-data.json` is fetched at runtime; `data/feedbacks.json` stores feedback.
- **Service Worker** (`sw.js`) caches assets for offline use; during development, you may need to unregister it or use incognito mode to see fresh changes.
- **Admin password** is hardcoded: `prima2026` (in `js/app.js`).

### Environment Variables (for API routes)

Copy `.env.example` to `.env.local` and fill in real values for:
- `OPENROUTER_API_KEY` — enables AI chatbot mode
- `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `ADMIN_SECRET` — enables admin data editor persistence

Without these, the app gracefully degrades (chatbot → rule-based, save → localStorage only).

### Gotchas

- The `vercel.json` rewrite rule (`"source": "/(.*)", "destination": "/index.html"`) means all non-file routes serve `index.html`. When using `python -m http.server`, this SPA rewrite does NOT apply, so direct URL navigation to sub-routes will 404 — always navigate from the root.
- The Service Worker aggressively caches files. Clear caches or disable SW during active development.
- The map (Leaflet) loads tiles from external CDNs; it won't render map imagery without internet access.
