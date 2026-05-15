// ================================================================
// PRIMA – AI Client (OpenRouter via Vercel proxy)
// Basic RAG: keyword-based retrieval over PRIMA_DATA
// Streaming SSE consumption
// ================================================================

const PRIMA_AI = (() => {
  const ENDPOINT = '/api/chat';

  const MODELS = [
    { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (Google)', short: 'Gemma 4' },
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano 30B (Reasoning)', short: 'Nemotron Nano' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super 120B', short: 'Nemotron Super' },
    { id: 'qwen/qwen3.6-flash', label: 'Qwen 3.6 Flash (Alibaba)', short: 'Qwen 3.6' },
    { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', short: 'DeepSeek V4' },
    // Fallback yang sudah pasti tersedia di OpenRouter free tier:
    { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (Fallback)', short: 'Gemma 2' },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Fallback)', short: 'Llama 3.1' },
    { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Fallback)', short: 'Mistral 7B' }
  ];

  const DEFAULT_MODEL = MODELS[0].id;

  // ── BASIC RAG ──────────────────────────────────────────────────
  // Indeks sederhana: tokenize semua dokumen sekali, lalu skor TF terhadap query.
  let _index = null;

  function _tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  function _buildIndex() {
    if (_index || typeof PRIMA_DATA === 'undefined') return _index;
    const docs = [];

    // Layanan
    PRIMA_DATA.layanan.forEach(l => {
      const text = `LAYANAN ${l.nama}. Kategori: ${l.kategori}. ${l.deskripsi || ''} ` +
        `Syarat: ${(l.syarat || []).join('; ')}. ` +
        `Prosedur: ${(l.prosedur || []).join('; ')}. ` +
        `Waktu proses: ${l.waktuProses || '-'}. Biaya: ${l.biaya || 'Gratis'}.`;
      docs.push({ type: 'layanan', id: l.id, title: l.nama, text, tokens: _tokenize(text) });
    });

    // Peta
    (PRIMA_DATA.petaMarkers || []).forEach(p => {
      const text = `LOKASI ${p.nama}. Kategori: ${p.kategori || ''}. ${p.deskripsi || ''} Alamat: ${p.alamat || ''}.`;
      docs.push({ type: 'peta', id: p.id, title: p.nama, text, tokens: _tokenize(text) });
    });

    // Info Warga
    const iw = PRIMA_DATA.infoWarga || {};
    (iw.kuliner || []).forEach(k => {
      const text = `KULINER ${k.nama}. ${k.deskripsi || ''} Lokasi: ${k.lokasi || ''}. Jam: ${k.jam || ''}.`;
      docs.push({ type: 'kuliner', id: k.id, title: k.nama, text, tokens: _tokenize(text) });
    });
    (iw.usahaBinaan || []).forEach(u => {
      const text = `USAHA BINAAN ${u.nama}. Kategori: ${u.kategori || ''}. ${u.deskripsi || ''} Pemilik: ${u.pemilik || ''}. Lokasi: ${u.lokasi || ''}.`;
      docs.push({ type: 'usaha', id: u.id, title: u.nama, text, tokens: _tokenize(text) });
    });
    (iw.kegiatanRTRW || []).forEach(g => {
      const text = `KEGIATAN ${g.nama}. ${g.deskripsi || ''} Jadwal: ${g.jadwal || ''}. Lokasi: ${g.lokasi || ''}.`;
      docs.push({ type: 'kegiatan', id: g.id, title: g.nama, text, tokens: _tokenize(text) });
    });

    // FAQ
    (PRIMA_DATA.faqChatbot || []).forEach(f => {
      const text = `FAQ ${f.intent}. Kata kunci: ${(f.keywords || []).join(', ')}. Jawaban: ${f.jawaban}`;
      docs.push({ type: 'faq', id: f.intent, title: f.intent, text, tokens: _tokenize(text) });
    });

    _index = docs;
    return _index;
  }

  // Reset index supaya next retrieval rebuild dari PRIMA_DATA terbaru.
  // Wajib dipanggil setelah admin save data baru via /api/save-data.
  function resetIndex() {
    _index = null;
  }

  function retrieveContext(query, topK = 6) {
    const docs = _buildIndex();
    if (!docs) return [];
    const qTokens = _tokenize(query);
    if (!qTokens.length) return [];

    const scored = docs.map(d => {
      let score = 0;
      for (const qt of qTokens) {
        for (const dt of d.tokens) {
          if (dt === qt) score += 2;
          else if (dt.includes(qt) || qt.includes(dt)) score += 1;
        }
      }
      return { doc: d, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.doc);

    return scored;
  }

  // ── SYSTEM PROMPT ──────────────────────────────────────────────
  function buildSystemPrompt(retrievedDocs) {
    const meta = (typeof PRIMA_DATA !== 'undefined' && PRIMA_DATA.meta) || {};
    const ctxBlocks = retrievedDocs.map((d, i) =>
      `[Dok ${i + 1} | ${d.type.toUpperCase()} | ${d.title}]\n${d.text}`
    ).join('\n\n');

    return `Kamu adalah **Asisten PRIMA**, chatbot resmi Kelurahan ${meta.kelurahan || 'Rawajati'}, ${meta.kecamatan || ''}, ${meta.kota || ''}.

ATURAN MUTLAK:
1. Jawab HANYA berdasarkan KONTEKS DATA di bawah. Jika info tidak ada di konteks, katakan dengan jujur "Maaf, informasi itu belum tersedia di data PRIMA. Silakan hubungi kelurahan langsung di ${meta.telepon || '(021) 7994427'}." JANGAN MENGARANG.
2. Bahasa: Indonesia santun, ramah, ringkas. Boleh sapa "Pak/Bu" atau "Kak".
3. Format: pakai **bold** untuk poin penting, gunakan bullet "- " atau angka "1." untuk list. JANGAN pakai tabel markdown.
4. Untuk syarat/prosedur surat: tampilkan list lengkap & berurut.
5. Akhiri jawaban dengan saran lanjutan singkat (mis. "Mau saya jelaskan tahap berikutnya?") bila relevan.
6. Selalu sebutkan bahwa semua layanan **GRATIS**.
7. Jika pertanyaan di luar topik kelurahan, arahkan kembali dengan sopan.

KONTEKS DATA (relevan dengan pertanyaan saat ini):
${ctxBlocks || '(tidak ada konteks spesifik — pakai pengetahuan umum tentang PRIMA Rawajati saja)'}

KONTAK KELURAHAN:
- Telepon: ${meta.telepon || '(021) 7994427'}
- Alamat: ${meta.alamat || 'Jl. Rawajati Timur, Pancoran, Jakarta Selatan'}
- Jam Kerja: ${meta.jamKerja || 'Senin–Kamis 07.30–16.00 WIB, Jumat 07.30–16.30 WIB'}`;
  }

  // ── STREAMING CHAT ─────────────────────────────────────────────
  /**
   * @param {Array<{role:'user'|'assistant', content:string}>} history
   * @param {string} userMessage
   * @param {{model?:string, onToken?:(text:string)=>void, onDone?:(full:string)=>void, onError?:(err:Error)=>void, signal?:AbortSignal}} opts
   */
  async function streamChat(history, userMessage, opts = {}) {
    const model = opts.model || getSelectedModel();
    const docs = retrieveContext(userMessage);
    const systemPrompt = buildSystemPrompt(docs);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(m => ({
        role: m.role === 'bot' ? 'assistant' : m.role,
        content: m.text
      })),
      { role: 'user', content: userMessage }
    ];

    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.4, max_tokens: 800 }),
        signal: opts.signal
      });
    } catch (e) {
      opts.onError?.(e);
      return { ok: false, error: e.message, retrievedDocs: docs };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const err = new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      opts.onError?.(err);
      return { ok: false, error: err.message, status: response.status, retrievedDocs: docs };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content
                       || parsed.choices?.[0]?.message?.content
                       || '';
            if (delta) {
              full += delta;
              opts.onToken?.(delta);
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') opts.onError?.(e);
    }

    opts.onDone?.(full);
    return { ok: true, text: full, retrievedDocs: docs };
  }

  // ── MODEL SELECTION ────────────────────────────────────────────
  // Source of truth: window.PRIMA_DATA.aiSettings (committed via /api/save-data
  // → semua device dapat setting yang sama). localStorage hanya cache fallback
  // saat PRIMA_DATA belum di-load.
  function getSelectedModel() {
    const fromData = window.PRIMA_DATA?.aiSettings?.model;
    if (fromData && typeof fromData === 'string') return fromData;
    return localStorage.getItem('prima_ai_model') || DEFAULT_MODEL;
  }
  // Menerima ID preset maupun custom (mis. "anthropic/claude-3.5-sonnet").
  // Validasi minimal: harus format "vendor/model", non-empty.
  // Mutate PRIMA_DATA.aiSettings.model in-memory; admin perlu klik "Simpan ke
  // GitHub" supaya berlaku global. localStorage tetap ditulis sebagai cache.
  function setSelectedModel(id) {
    const clean = (id || '').trim();
    if (!clean || !clean.includes('/')) return false;
    if (window.PRIMA_DATA) {
      if (!window.PRIMA_DATA.aiSettings) window.PRIMA_DATA.aiSettings = {};
      window.PRIMA_DATA.aiSettings.model = clean;
    }
    try { localStorage.setItem('prima_ai_model', clean); } catch {}
    return true;
  }
  function isCustomModel(id) {
    return !MODELS.find(m => m.id === id);
  }

  // ── AVAILABILITY CHECK ─────────────────────────────────────────
  // Quick test: HEAD /api/chat → if 405/200 it exists, if 404 → no AI.
  let _availability = null;
  async function isAvailable() {
    if (_availability !== null) return _availability;
    try {
      const r = await fetch(ENDPOINT, { method: 'OPTIONS' });
      _availability = r.status !== 404;
    } catch { _availability = false; }
    return _availability;
  }

  return {
    MODELS,
    DEFAULT_MODEL,
    streamChat,
    retrieveContext,
    buildSystemPrompt,
    getSelectedModel,
    setSelectedModel,
    isCustomModel,
    isAvailable,
    resetIndex
  };
})();
