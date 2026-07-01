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
  if (d.infoKelurahan !== undefined && typeof d.infoKelurahan !== 'object') return 'Field "infoKelurahan" harus object.';
  if (!Array.isArray(d.faqChatbot)) return 'Field "faqChatbot" harus array.';
  if (d.aiSettings !== undefined) {
    if (typeof d.aiSettings !== 'object' || d.aiSettings === null) return 'Field "aiSettings" harus object.';
    if (d.aiSettings.enabled !== undefined && typeof d.aiSettings.enabled !== 'boolean') return 'aiSettings.enabled harus boolean.';
    if (d.aiSettings.model !== undefined && (typeof d.aiSettings.model !== 'string' || !(/^[a-z0-9_-]+\/[a-z0-9._:-]+$/i.test(d.aiSettings.model) || /^[A-Za-z][A-Za-z0-9._-]{1,63}$/.test(d.aiSettings.model)))) {
      return 'aiSettings.model harus string dengan format yang valid (vendor/model atau model-id).';
    }
  }
  if (d.aiModels !== undefined) {
    if (!Array.isArray(d.aiModels)) return 'Field "aiModels" harus array.';
    for (let i = 0; i < d.aiModels.length; i++) {
      const m = d.aiModels[i];
      if (!m || typeof m !== 'object') return `aiModels[${i}] harus object.`;
      if (typeof m.id !== 'string' || !(/^[a-z0-9_-]+\/[a-z0-9._:-]+$/i.test(m.id) || /^[A-Za-z][A-Za-z0-9._-]{1,63}$/.test(m.id))) return `aiModels[${i}].id harus string dengan format yang valid (vendor/model atau model-id).`;
      if (typeof m.label !== 'string') return `aiModels[${i}].label harus string.`;
      if (typeof m.short !== 'string') return `aiModels[${i}].short harus string.`;
    }
  }
  return null;
}

// btoa di edge runtime kadang tidak handle non-ASCII; pakai TextEncoder
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function putGitHubFile(repo, token, branch, path, base64Content, message, ghHeaders) {
  const apiBase = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
  // Get sha if exists
  let sha;
  try {
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    if (getRes.status === 200) {
      const existing = await getRes.json();
      sha = existing.sha;
    }
  } catch {}
  const putBody = { message, content: base64Content, branch };
  if (sha) putBody.sha = sha;
  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody)
  });
  return { ok: putRes.ok, status: putRes.status, json: await putRes.json().catch(() => ({})) };
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
  const files = body.files || []; // [{ path, content: base64 }]

  const validationError = validateData(newData);
  if (validationError) {
    return json(400, { error: 'Validasi gagal: ' + validationError });
  }

  // Stamp last update
  if (newData.meta) {
    newData.meta.terakhirUpdate = new Date().toISOString();
  }

  const ghHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'prima-rawajati-admin'
  };

  // Upload files first (if any)
  const fileResults = [];
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      if (!f.path || !f.content) continue;
      const res = await putGitHubFile(repo, token, branch, f.path, f.content, `chore(dokumen): upload ${f.path}`, ghHeaders);
      fileResults.push({ path: f.path, ok: res.ok, status: res.status });
    }
  }

  // Commit data JSON
  const dataPath = 'data/prima-data.json';
  const newContent = JSON.stringify(newData, null, 2) + '\n';
  const dataRes = await putGitHubFile(repo, token, branch, dataPath, toBase64(newContent), commitMessage, ghHeaders);

  if (!dataRes.ok) {
    return json(502, {
      error: `GitHub PUT error ${dataRes.status}: ${dataRes.json.message || 'unknown'}`,
      github: dataRes.json,
      files: fileResults
    });
  }

  return json(200, {
    ok: true,
    commit: dataRes.json.commit?.sha,
    url: dataRes.json.commit?.html_url,
    files: fileResults,
    message: 'Data tersimpan. Vercel akan auto-deploy ~1-2 menit.'
  });
}
