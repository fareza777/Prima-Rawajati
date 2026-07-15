import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImportFile,
  normalizeExtractedText,
  shouldOcrPage,
  createAnnouncementImporter
} from '../js/announcement-import.js';

function file(name, size = 1024, type = 'application/pdf') {
  return { name, size, type, arrayBuffer: async () => new ArrayBuffer(8), text: async () => 'teks sumber' };
}

test('validates accepted formats and the 10 MB limit', () => {
  assert.equal(validateImportFile(file('surat.pdf')).ok, true);
  assert.equal(validateImportFile(file('foto.jpg', 1024, 'image/jpeg')).ok, true);
  assert.equal(validateImportFile(file('virus.exe')).ok, false);
  assert.match(validateImportFile(file('besar.pdf', 10 * 1024 * 1024 + 1)).error, /10 MB/);
});

test('normalizes OCR whitespace while preserving useful lines', () => {
  assert.equal(normalizeExtractedText('  Hari : Kamis  \n\n\n  pukul : 09.00   s/d 14.00  '), 'Hari : Kamis\n\npukul : 09.00 s/d 14.00');
});

test('uses OCR only for pages with insufficient text', () => {
  assert.equal(shouldOcrPage('Nomor 586 dan pelaksanaan uji emisi gratis pada tanggal 16 Juli 2026.'), false);
  assert.equal(shouldOcrPage('scan'), true);
});

test('rejects PDFs over 10 pages', async () => {
  const importer = createAnnouncementImporter({
    loadPdf: async () => ({ numPages: 11 })
  });
  await assert.rejects(() => importer.extract(file('surat.pdf')), /maksimal 10 halaman/);
});

test('prefers embedded PDF text and OCRs scanned pages sequentially', async () => {
  const order = [];
  const pages = {
    1: { text: 'Surat pemberitahuan pelaksanaan uji emisi kendaraan bermotor gratis bagi masyarakat Pancoran.' },
    2: { text: '' }
  };
  const importer = createAnnouncementImporter({
    loadPdf: async () => ({ numPages: 2, getPage: async n => pages[n] }),
    readPdfText: async page => page.text,
    renderPdfPage: async (_page, n) => `canvas-${n}`,
    recognize: async canvas => { order.push(canvas); return 'Kamis 16 Juli 2026 pukul 09.00 s/d 14.00 WIB'; }
  });
  const progress = [];
  const result = await importer.extract(file('surat.pdf'), { onProgress: p => progress.push(p) });
  assert.deepEqual(order, ['canvas-2']);
  assert.match(result.text, /uji emisi/);
  assert.match(result.text, /16 Juli 2026/);
  assert.ok(progress.some(p => p.stage === 'ocr' && p.page === 2));
});

test('supports cancellation during sequential OCR', async () => {
  let importer;
  importer = createAnnouncementImporter({
    loadPdf: async () => ({ numPages: 2, getPage: async () => ({ text: '' }) }),
    readPdfText: async () => '',
    renderPdfPage: async () => 'canvas',
    recognize: async () => { importer.cancel(); return 'hasil'; }
  });
  await assert.rejects(() => importer.extract(file('scan.pdf')), /dibatalkan/);
});

test('routes image files directly to OCR', async () => {
  const importer = createAnnouncementImporter({ recognize: async input => `OCR ${input.name}` });
  const result = await importer.extract(file('surat.png', 1000, 'image/png'));
  assert.equal(result.text, 'OCR surat.png');
  assert.equal(result.usedOcr, true);
});
