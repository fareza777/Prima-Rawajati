// PRIMA – Cloudflare Worker entry.
//
// Static files (index.html, js/, css/, img/, data/, dokumen/, .well-known/…)
// are served by Workers Static Assets straight from the repo root (see
// .assetsignore for what is excluded). /api/* is routed to the same
// fetch-style handlers that ran as Vercel Edge/Node functions; they read
// configuration from process.env, which nodejs_compat populates from the
// Worker's vars and secrets.
import analytics from '../api/analytics.js';
import announcementAi from '../api/announcement-ai.js';
import announcements from '../api/announcements.js';
import chat from '../api/chat.js';
import feedback from '../api/feedback.js';
import { POST as pushBroadcastPost } from '../api/push-broadcast.js';
import pushConfig from '../api/push-config.js';
import pushSubscriptions from '../api/push-subscriptions.js';
import saveData from '../api/save-data.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  });

const API_ROUTES = {
  'analytics': analytics,
  'announcement-ai': announcementAi,
  'announcements': announcements,
  'chat': chat,
  'feedback': feedback,
  'push-broadcast': (req) =>
    req.method === 'POST' ? pushBroadcastPost(req) : json(405, { error: 'Method tidak diizinkan.' }),
  'push-config': pushConfig,
  'push-subscriptions': pushSubscriptions,
  'save-data': saveData
};

async function handleApi(request, name) {
  const handler = API_ROUTES[name];
  if (!handler) return json(404, { error: 'Endpoint tidak ditemukan.' });
  const response = await handler(request);
  // Same as the old vercel.json /api/(.*) header rule.
  if (!response.headers.has('Cache-Control')) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/([a-z0-9-]+?)(?:\.js)?\/?$/);
    if (match) return handleApi(request, match[1]);
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Endpoint tidak ditemukan.' });
    return env.ASSETS.fetch(request);
  }
};
