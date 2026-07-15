const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 10;
const ACCEPTED = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'md']);

function extension(name = '') {
  return String(name).toLowerCase().split('.').pop();
}

export function validateImportFile(file) {
  if (!file) return { ok: false, error: 'Pilih file terlebih dahulu.' };
  const ext = extension(file.name);
  if (!ACCEPTED.has(ext)) return { ok: false, error: `Format .${ext || '?'} tidak didukung.` };
  if (Number(file.size || 0) > MAX_BYTES) return { ok: false, error: 'Ukuran file maksimal 10 MB.' };
  return { ok: true, extension: ext };
}

export function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function shouldOcrPage(value) {
  return normalizeExtractedText(value).replace(/\s/g, '').length < 40;
}

function browserDeps(root) {
  const pdfjs = root?.pdfjsLib;
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return {
    loadPdf: async data => {
      if (!pdfjs) throw new Error('PDF.js belum termuat. Periksa koneksi internet.');
      return pdfjs.getDocument({ data }).promise;
    },
    readPdfText: async page => {
      const content = await page.getTextContent();
      return content.items.map(item => item.str || '').join(' ');
    },
    renderPdfPage: async page => {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = root.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas;
    },
    recognize: async (input, onProgress) => {
      if (!root?.Tesseract) throw new Error('OCR belum termuat. Periksa koneksi internet.');
      const result = await root.Tesseract.recognize(input, 'ind+eng', {
        logger: message => onProgress?.({ stage: 'ocr-engine', progress: message.progress || 0, status: message.status || '' })
      });
      return result?.data?.text || '';
    },
    mammoth: root?.mammoth,
    XLSX: root?.XLSX,
    fetchImpl: root?.fetch?.bind(root)
  };
}

export function createAnnouncementImporter(deps = {}) {
  const root = deps.root || (typeof window !== 'undefined' ? window : null);
  const adapters = { ...browserDeps(root), ...deps };
  let cancelled = false;

  function assertActive() {
    if (cancelled) throw new Error('Proses dibatalkan.');
  }

  async function extractPdf(file, onProgress) {
    const pdf = await adapters.loadPdf(await file.arrayBuffer());
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF maksimal 10 halaman; file ini memiliki ${pdf.numPages} halaman.`);
    const pages = [];
    let usedOcr = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertActive();
      onProgress({ stage: 'reading', page: pageNumber, total: pdf.numPages });
      const page = await pdf.getPage(pageNumber);
      let text = normalizeExtractedText(await adapters.readPdfText(page));
      if (shouldOcrPage(text)) {
        usedOcr = true;
        onProgress({ stage: 'ocr', page: pageNumber, total: pdf.numPages, progress: 0 });
        const image = await adapters.renderPdfPage(page, pageNumber);
        text = normalizeExtractedText(await adapters.recognize(image, info => onProgress({ ...info, page: pageNumber, total: pdf.numPages })));
        assertActive();
      }
      pages.push(`=== Halaman ${pageNumber} ===\n${text}`);
    }
    return { text: normalizeExtractedText(pages.join('\n\n')), pageCount: pdf.numPages, usedOcr };
  }

  async function extractSheet(file) {
    if (!adapters.XLSX) throw new Error('SheetJS belum termuat.');
    const workbook = adapters.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return workbook.SheetNames.map(name => `=== Sheet: ${name} ===\n${adapters.XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n');
  }

  async function extract(file, options = {}) {
    cancelled = false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const validation = validateImportFile(file);
    if (!validation.ok) throw new Error(validation.error);
    const ext = validation.extension;
    onProgress({ stage: 'reading', page: 0, total: 0 });
    if (ext === 'pdf') return extractPdf(file, onProgress);
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      onProgress({ stage: 'ocr', page: 1, total: 1, progress: 0 });
      const text = normalizeExtractedText(await adapters.recognize(file, info => onProgress({ ...info, page: 1, total: 1 })));
      assertActive();
      return { text, pageCount: 1, usedOcr: true };
    }
    if (ext === 'docx') {
      if (!adapters.mammoth) throw new Error('Mammoth.js belum termuat.');
      const result = await adapters.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { text: normalizeExtractedText(result.value), pageCount: 1, usedOcr: false };
    }
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      return { text: normalizeExtractedText(await extractSheet(file)), pageCount: 1, usedOcr: false };
    }
    return { text: normalizeExtractedText(await file.text()), pageCount: 1, usedOcr: false };
  }

  async function requestDraft(extracted, fileName, secret) {
    if (!adapters.fetchImpl) throw new Error('Koneksi API tidak tersedia.');
    const aiSettings = root?.PRIMA_DATA?.aiSettings || {};
    const response = await adapters.fetchImpl('/api/announcement-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': secret },
      body: JSON.stringify({
        text: extracted.text,
        fileName,
        usedOcr: Boolean(extracted.usedOcr),
        pageCount: extracted.pageCount,
        provider: aiSettings.provider || '',
        model: aiSettings.model || '',
        baseUrl: aiSettings.baseUrl || ''
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `AI gagal (${response.status}).`);
    return payload;
  }

  return { extract, requestDraft, cancel: () => { cancelled = true; } };
}

if (typeof window !== 'undefined') window.PRIMA_ANNOUNCEMENT_IMPORT = createAnnouncementImporter();
