// PRIMA – Save Data to GitHub (Vercel Edge Function)
// Admin Panel POST endpoint untuk commit data/prima-data.json ke repo.
//
// Auth: header X-Admin-Secret harus match env ADMIN_SECRET.
// GitHub PAT (env GITHUB_TOKEN) tidak pernah disentuh client.
//
// Env vars yang dibutuhkan di Vercel:
//   GITHUB_TOKEN   - Personal Access Token, scope: repo (contents write)
//   GITHUB_REPO    - "owner/repo", mis. "fareza777/Prima-Rawajati"
//   GITHUB_BRANCH  - mis. "main"
//   ADMIN_SECRET   - string acak panjang, dipakai sebagai password kedua

export const config = { runtime: 'edge' };

const FILE_PATH = 'data/prima-data.json';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Validasi struktur minimum agar admin tidak meng-commit JSON rusak yang
// bakal crash app saat dimuat semua pengunjung.
function validateData(d) {
  if (!d || typeof d !== 'object') return 'Data harus berupa object JSON.';
  if (!d.meta || typeof d.meta !== 'object') return 'Field "meta" wajib ada.';
  if (!Array.isArray(d.layanan)) return 'Field "layanan" harus array.';
  if (!Array.isArray(d.petaMarkers)) return 'Field "petaMarkers" harus array.';
  if (!d.infoWarga || typeof d.infoWarga !== 'object') return 'Field "infoWarga" wajib ada.';
  if (!Array.isArray(d.faqChatbot)) return 'Field "faqChatbot" harus array.';
  return null;
}

// btoa di edge runtime kadang tidak handle non-ASCII; pakai TextEncoder
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed. Pakai POST.' });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const adminSecret = process.env.ADMIN_SECRET;

  if (!token || !repo || !adminSecret) {
    return json(500, {
      error: 'Server belum dikonfigurasi. Set env vars: GITHUB_TOKEN, GITHUB_REPO, ADMIN_SECRET di Vercel.'
    });
  }

  // Auth admin
  const provided = req.headers.get('x-admin-secret') || '';
  if (provided !== adminSecret) {
    return json(401, { error: 'Admin secret salah.' });
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body bukan JSON valid.' });
  }

  const newData = body.data;
  const commitMessage = body.message || 'chore(data): admin update via Panel';

  const validationError = validateData(newData);
  if (validationError) {
    return json(400, { error: 'Validasi gagal: ' + validationError });
  }

  // Stamp last update
  if (newData.meta) {
    newData.meta.terakhirUpdate = new Date().toISOString();
  }

  const apiBase = `https://api.github.com/repos/${repo}/contents/${FILE_PATH}`;
  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'prima-rawajati-admin'
  };

  // Step 1: get current file sha (kalau ada) — diperlukan PUT GitHub Contents API
  let currentSha;
  try {
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders
    });
    if (getRes.status === 200) {
      const existing = await getRes.json();
      currentSha = existing.sha;
    } else if (getRes.status !== 404) {
      const txt = await getRes.text();
      return json(502, { error: `GitHub GET error ${getRes.status}: ${txt.slice(0, 200)}` });
    }
  } catch (e) {
    return json(502, { error: 'Gagal cek file existing: ' + e.message });
  }

  // Step 2: PUT new content
  const newContent = JSON.stringify(newData, null, 2) + '\n';
  const putBody = {
    message: commitMessage,
    content: toBase64(newContent),
    branch
  };
  if (currentSha) putBody.sha = currentSha;

  try {
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });
    const putJson = await putRes.json().catch(() => ({}));
    if (!putRes.ok) {
      return json(502, {
        error: `GitHub PUT error ${putRes.status}: ${putJson.message || 'unknown'}`,
        github: putJson
      });
    }
    return json(200, {
      ok: true,
      commit: putJson.commit?.sha,
      url: putJson.commit?.html_url,
      message: 'Data tersimpan. Vercel akan auto-deploy ~1-2 menit.'
    });
  } catch (e) {
    return json(502, { error: 'Gagal commit ke GitHub: ' + e.message });
  }
}
