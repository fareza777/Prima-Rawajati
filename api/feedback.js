// PRIMA – Feedback endpoint (Vercel Edge Function)
// Simpan masukan warga ke data/feedbacks.json di repo via GitHub API.
// GET  → ambil semua feedback
// POST → tambah feedback baru (public, tidak perlu auth)

export const config = { runtime: 'edge' };

const FILE_PATH = 'data/feedbacks.json';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getGitHubFile(repo, token, branch, path, ghHeaders) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders });
  if (res.status === 404) return { exists: false, content: [], sha: null };
  if (!res.ok) return { exists: false, content: [], sha: null, error: res.status };
  const data = await res.json();
  const text = new TextDecoder().decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0)));
  try {
    return { exists: true, content: JSON.parse(text), sha: data.sha };
  } catch {
    return { exists: true, content: [], sha: data.sha };
  }
}

async function putGitHubFile(repo, token, branch, path, base64Content, message, sha, ghHeaders) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: base64Content, branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !repo) {
    return json(500, { error: 'Server belum dikonfigurasi. Set GITHUB_TOKEN dan GITHUB_REPO di Vercel.' });
  }

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'prima-rawajati-feedback'
  };

  if (req.method === 'GET') {
    const file = await getGitHubFile(repo, token, branch, FILE_PATH, ghHeaders);
    return json(200, { feedbacks: file.content || [] });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); }
    catch { return json(400, { error: 'Body bukan JSON valid.' }); }

    const fb = body.feedback;
    if (!fb || typeof fb !== 'object') {
      return json(400, { error: 'Field "feedback" wajib ada.' });
    }

    // Get current file
    const file = await getGitHubFile(repo, token, branch, FILE_PATH, ghHeaders);
    const list = Array.isArray(file.content) ? file.content : [];

    // Append new feedback (limit 500 entries to keep file manageable)
    list.push(fb);
    if (list.length > 500) list.splice(0, list.length - 500);

    const newContent = JSON.stringify(list, null, 2) + '\n';
    const commitMsg = `chore(feedback): masukan warga via Suara Warga — ${fb.nama || 'Anonim'}`;
    const res = await putGitHubFile(repo, token, branch, FILE_PATH, toBase64(newContent), commitMsg, file.sha, ghHeaders);

    if (!res.ok) {
      return json(502, { error: `GitHub PUT error ${res.status}`, github: res.json });
    }

    return json(200, { ok: true, feedbacks: list });
  }

  return json(405, { error: 'Method not allowed. Pakai GET atau POST.' });
}
