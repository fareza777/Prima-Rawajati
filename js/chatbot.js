// ================================================================
// PRIMA – AI CHATBOT ENGINE
// Keyword-based intent matching dengan conversational context
// ================================================================

class PRIMAChatbot {
  constructor(faqData) {
    this.faq = faqData;
    this.conversationHistory = [];
    this.messageCount = 0;
    this.sessionId = this._generateSessionId();
    this._loadStats();
  }

  _generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  _loadStats() {
    const stats = JSON.parse(localStorage.getItem('prima_chat_stats') || '{"totalConversations":0,"totalMessages":0,"lastActive":null}');
    this.stats = stats;
  }

  _saveStats() {
    this.stats.lastActive = new Date().toISOString();
    localStorage.setItem('prima_chat_stats', JSON.stringify(this.stats));
  }

  _normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _calculateScore(userInput, keywords) {
    const normalized = this._normalizeText(userInput);
    let score = 0;
    for (const kw of keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        score += kw.length; // Longer keyword match = higher score
      }
    }
    return score;
  }

  _findBestMatch(userInput) {
    let bestMatch = null;
    let bestScore = 0;

    for (const faq of this.faq) {
      const score = this._calculateScore(userInput, faq.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = faq;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  _formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
      .replace(/✅/g, '<span class="check">✅</span>');
  }

  processMessage(userMessage) {
    this.messageCount++;
    this.stats.totalMessages++;

    // Record new conversation
    if (this.messageCount === 1) {
      this.stats.totalConversations++;
    }
    this._saveStats();

    // Add to history
    this.conversationHistory.push({
      role: 'user',
      text: userMessage,
      timestamp: new Date().toISOString()
    });

    // Find matching intent
    const match = this._findBestMatch(userMessage);
    let responseText;

    if (match) {
      responseText = match.jawaban;
    } else {
      responseText = this._generateFallback(userMessage);
    }

    // Add bot response to history
    this.conversationHistory.push({
      role: 'bot',
      text: responseText,
      timestamp: new Date().toISOString()
    });

    // Persist conversation log
    this._persistConversation(userMessage, responseText);

    return {
      text: this._formatMarkdown(responseText),
      raw: responseText,
      intent: match ? match.intent : 'unknown',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
  }

  _generateFallback(userInput) {
    const normalized = this._normalizeText(userInput);

    // Context-aware suggestions
    const suggestions = [];

    if (/surat|syarat|persyaratan|dokumen|berkas/.test(normalized)) {
      suggestions.push('📋 Ketik nama jenis surat yang Anda butuhkan (contoh: "syarat domisili")');
    }
    if (/lokasi|tempat|dimana/.test(normalized)) {
      suggestions.push('🗺️ Lihat menu **Peta Wilayah** untuk lokasi fasilitas di Rawajati');
    }
    if (/kontak|telepon|hubungi|hp|nomor/.test(normalized)) {
      suggestions.push('📞 Hubungi Kelurahan Rawajati: **(021) 7994427**');
    }

    const sugestText = suggestions.length > 0
      ? '\n\n💡 **Mungkin Anda mencari:**\n' + suggestions.join('\n')
      : '';

    return `Maaf, saya belum memahami pertanyaan tersebut. 🙏${sugestText}\n\n**Saya bisa membantu dengan:**\n📋 Syarat surat (domisili, ahli waris, SKCK, dll)\n⏰ Jam kerja & lokasi Kelurahan\n♻️ Info bank sampah & posyandu\n📢 Cara pengaduan\n\n*Coba ketik lebih spesifik, ya!*`;
  }

  _persistConversation(userMsg, botMsg) {
    const logs = JSON.parse(localStorage.getItem('prima_chat_logs') || '[]');
    logs.push({
      session: this.sessionId,
      timestamp: new Date().toISOString(),
      user: userMsg,
      bot: botMsg.substring(0, 200) // Limit stored text
    });
    // Keep only last 200 messages
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    localStorage.setItem('prima_chat_logs', JSON.stringify(logs));
  }

  // Record an AI-driven exchange (used when AI mode handles the response)
  recordExchange(userMessage, botResponse, source = 'ai') {
    this.messageCount++;
    this.stats.totalMessages++;
    if (this.messageCount === 1) this.stats.totalConversations++;
    this._saveStats();

    this.conversationHistory.push({ role: 'user', text: userMessage, timestamp: new Date().toISOString() });
    this.conversationHistory.push({ role: 'bot', text: botResponse, timestamp: new Date().toISOString(), source });
    this._persistConversation(userMessage, botResponse);
  }

  getStats() {
    return this.stats;
  }

  getSuggestedQuestions() {
    return [
      "Syarat surat keterangan domisili?",
      "Syarat surat ahli waris?",
      "Jam buka kelurahan?",
      "Syarat PM-1 pecah PBB?",
      "Lokasi bank sampah?",
      "Syarat pengantar SKCK?",
      "Jadwal posyandu?",
      "Cara buat surat keterangan usaha?"
    ];
  }
}
