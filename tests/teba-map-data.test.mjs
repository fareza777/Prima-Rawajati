import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SOURCE_MAP_ID = '1PML3dFA0Jwi-uR-Nl1KuqTX4eIfsw_c';

test('imports every Teba Komunal point from the referenced My Maps source', async () => {
  const data = JSON.parse(
    await readFile(new URL('../data/prima-data.json', import.meta.url), 'utf8')
  );
  const markers = data.petaMarkers.filter(marker =>
    marker.sumberPeta?.includes(SOURCE_MAP_ID)
  );

  assert.equal(markers.length, 36);
  assert.equal(new Set(markers.map(marker => marker.id)).size, 36);
  assert.equal(markers.filter(marker => marker.jenis === 'Teba Komunal').length, 34);
  assert.equal(markers.filter(marker => marker.jenis === 'Tong Komposter').length, 2);
  assert.deepEqual(
    [...new Set(markers.map(marker => marker.rw))].sort(),
    ['01', '02', '03', '04', '06', '07', '08']
  );

  for (const marker of markers) {
    assert.equal(marker.kategori, 'Lingkungan');
    assert.ok(marker.lat >= -6.264 && marker.lat <= -6.257);
    assert.ok(marker.lng >= 106.849 && marker.lng <= 106.861);
    assert.match(marker.info, /PETA TEBA KOMUNAL/);
  }
});

test('adds a source-backed Teba Komunal summary to PRIMA AI knowledge', async () => {
  const data = JSON.parse(
    await readFile(new URL('../data/prima-data.json', import.meta.url), 'utf8')
  );
  const knowledge = data.knowledgeBase.find(item => item.id === 'PETA-TEBA-KOMUNAL-2026');

  assert.ok(knowledge);
  assert.equal(knowledge.kategori, 'Lingkungan');
  assert.ok(knowledge.sumber.some(source => source.includes(SOURCE_MAP_ID)));
  assert.match(knowledge.ringkasan, /36 titik/);
});
