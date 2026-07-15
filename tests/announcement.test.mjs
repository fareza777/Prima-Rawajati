import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnnouncement,
  validateAnnouncement,
  mergeAnnouncements,
  buildNotificationPayload
} from '../lib/announcement.mjs';

const NOW = new Date('2026-07-15T12:00:00+07:00');

function emission(overrides = {}) {
  return {
    judul: 'Uji Emisi Kendaraan Bermotor Gratis',
    ringkasan: 'Uji emisi gratis bagi masyarakat Kecamatan Pancoran.',
    eventStart: '2026-07-16T09:00:00+07:00',
    eventEnd: '2026-07-16T14:00:00+07:00',
    expiresAt: '2026-07-16T14:00:00+07:00',
    notification: {
      enabled: true,
      title: 'Uji Emisi Gratis Besok',
      body: 'Kamis, 16 Juli · 09.00–14.00 WIB · Kantor Kecamatan Pancoran.'
    },
    ...overrides
  };
}

test('normalizes the emission announcement to a stable event ID', () => {
  const item = normalizeAnnouncement(emission(), NOW);
  assert.equal(item.id, 'pg-uji-emisi-kendaraan-bermotor-gratis-20260716');
  assert.equal(item.eventStart, '2026-07-16T09:00:00+07:00');
  assert.equal(item.createdAt, '2026-07-15T05:00:00.000Z');
});

test('requires title and summary', () => {
  const result = validateAnnouncement({ id: 'pg-valid-id', judul: '', ringkasan: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['Judul wajib diisi.', 'Ringkasan wajib diisi.']);
});

test('rejects event timestamps without explicit Jakarta offset', () => {
  const result = validateAnnouncement({
    id: 'pg-valid-id', judul: 'Acara', ringkasan: 'Ringkas', eventStart: '2026-07-16T09:00:00Z'
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /eventStart/);
});

test('merge prefers newer dynamic records and removes expired items', () => {
  const staticItems = [
    normalizeAnnouncement(emission({ id: 'pg-event', updatedAt: '2026-07-14T00:00:00.000Z' }), NOW),
    normalizeAnnouncement(emission({ id: 'pg-expired', expiresAt: '2026-07-14T12:00:00+07:00' }), NOW)
  ];
  const dynamicItems = [normalizeAnnouncement(emission({
    id: 'pg-event', ringkasan: 'Versi terbaru', updatedAt: '2026-07-15T06:00:00.000Z'
  }), NOW)];
  const merged = mergeAnnouncements(staticItems, dynamicItems, NOW);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].ringkasan, 'Versi terbaru');
});

test('builds a bounded same-origin notification payload', () => {
  const item = normalizeAnnouncement(emission({ id: 'pg-event' }), NOW);
  const payload = buildNotificationPayload(item);
  assert.equal(payload.url, '/?s=info&announcement=pg-event');
  assert.equal(payload.tag, 'prima-announcement-pg-event');
  assert.ok(payload.title.length <= 60);
  assert.ok(payload.body.length <= 160);
});

test('rejects unsafe notification deep links', () => {
  assert.throws(() => buildNotificationPayload(normalizeAnnouncement(emission({
    id: 'pg-event', notification: { enabled: true, url: 'https://evil.example/' }
  }), NOW)), /URL notifikasi/);
});
