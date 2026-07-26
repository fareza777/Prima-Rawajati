#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'prima-data.json');
const sourceMapId = '1PML3dFA0Jwi-uR-Nl1KuqTX4eIfsw_c';
const sourceUrl = `https://www.google.com/maps/d/viewer?mid=${sourceMapId}`;

// Snapshot of the 36 Point placemarks published by PETA TEBA KOMUNAL,
// retrieved from the map's KML feed on 26 July 2026.
const points = [
  ['TMK 01', '01', '4K', -6.2584948, 106.8600774],
  ['TMK 02', '01', '4K', -6.2585322, 106.8600706],
  ['TMK 01', '02', '6K', -6.259953, 106.855439],
  ['TMK 02', '02', '6K', -6.2599688, 106.8554391],
  ['TMK 01', '03', '2K', -6.26158, 106.859452],
  ['TMK 02', '03', '2K', -6.262777, 106.857236],
  ['TMK 03', '03', '2K', -6.2627614, 106.857235],
  ['TMK 04', '03', '6K', -6.2618568, 106.857804],
  ['TK 05', '03', '1,5K', -6.2606569, 106.8577438],
  ['TMK 06', '03', '2K', -6.260263, 106.85659],
  ['TMK 07', '03', '2K', -6.260719, 106.859659],
  ['TMK 08', '03', '2K', -6.261669, 106.858173],
  ['TMK 09', '03', '2K', -6.261679, 106.858155],
  ['TMK 10', '03', '2K', -6.2607323, 106.8596584],
  ['TMK 01', '04', '12K', -6.2603216, 106.8519841],
  ['TMK 02', '04', '12K', -6.2603536, 106.85198],
  ['TMK 03', '04', '12K', -6.2572367, 106.8539765],
  ['TMK 04', '04', '12K', -6.2585584, 106.8494978],
  ['TMK 01', '06', '2K', -6.2629535, 106.8544958],
  ['TMK 02', '06', '2K', -6.2629855, 106.8546031],
  ['TMK 03', '06', '2K', -6.2630175, 106.8547104],
  ['TMK 04', '06', '2K', -6.2630335, 106.8548069],
  ['TMK 05', '06', '2K', -6.2630868, 106.8548767],
  ['TMK 06', '06', '2K', -6.2630708, 106.8544475],
  ['TMK 07', '06', '2K', -6.2631188, 106.8545816],
  ['TMK 08', '06', '2K', -6.2631348, 106.8546621],
  ['TMK 09', '06', '2K', -6.2631561, 106.8547318],
  ['TMK 10', '06', '2K', -6.2631934, 106.8547962],
  ['TMK 01', '07', '2K', -6.2571053, 106.8586863],
  ['TMK 02', '07', '2K', -6.2574306, 106.8587721],
  ['TMK 03', '07', '2K', -6.2572386, 106.8592603],
  ['TMK 04', '07', '2K', -6.2572333, 106.859432],
  ['TMK 01', '08', '2K', -6.260705, 106.854566],
  ['TMK 02', '08', '2K', -6.2607229, 106.8545656],
  ['TMK 03', '08', '2K', -6.2607323, 106.8545656],
  ['TK 01', '08', '1,5K', -6.2622804, 106.8539403]
];

function slug(value) {
  return value.toLowerCase().replace(/\s+/g, '-');
}

const markers = points.map(([code, rw, capacity, lat, lng]) => {
  const isComposter = code.startsWith('TK ');
  const kind = isComposter ? 'Tong Komposter' : 'Teba Komunal';
  const prefix = isComposter ? 'tong-komposter' : 'teba-komunal';

  return {
    id: `${prefix}-rw${rw}-${slug(code)}`,
    nama: `${code} - RW ${rw} - ${capacity}`,
    kategori: 'Lingkungan',
    icon: isComposter ? '🗑️' : '♻️',
    warna: isComposter ? '#795548' : '#2E7D32',
    lat,
    lng,
    alamat: `RW ${rw}, Kelurahan Rawajati, Pancoran, Jakarta Selatan`,
    info: `${kind} dengan label kapasitas ${capacity} di RW ${rw}. Koordinat mengikuti PETA TEBA KOMUNAL (Google My Maps, diakses 26 Juli 2026). Verifikasi kondisi operasional kepada pengurus RW setempat.`,
    jenis: kind,
    rw,
    kapasitasLabel: capacity,
    sumberPeta: sourceUrl
  };
});

const knowledge = {
  id: 'PETA-TEBA-KOMUNAL-2026',
  judul: 'Sebaran Teba Komunal dan Tong Komposter Rawajati',
  kategori: 'Lingkungan',
  sumber: [
    `PETA TEBA KOMUNAL — Google My Maps (diakses 26 Juli 2026): ${sourceUrl}`
  ],
  layananTerkait: [],
  ringkasan: 'PETA TEBA KOMUNAL memuat 36 titik pengelolaan sampah organik di Kelurahan Rawajati: 34 titik Teba Komunal dan 2 titik Tong Komposter yang tersebar di tujuh wilayah RW.',
  butir: [
    'Total titik pada peta sumber: 36 titik.',
    'Teba Komunal: 34 titik; Tong Komposter: 2 titik.',
    'Sebaran wilayah mencakup RW 01, RW 02, RW 03, RW 04, RW 06, RW 07, dan RW 08.',
    'Jumlah titik per wilayah: RW 01 sebanyak 2, RW 02 sebanyak 2, RW 03 sebanyak 10, RW 04 sebanyak 4, RW 06 sebanyak 10, RW 07 sebanyak 4, dan RW 08 sebanyak 4.',
    'Label kapasitas pada peta sumber meliputi 1,5K, 2K, 4K, 6K, dan 12K.',
    'Koordinat setiap titik tersedia di menu Peta PRIMA pada kategori Lingkungan.',
    'Data lokasi mengikuti peta sumber; kondisi operasional terkini perlu dikonfirmasi kepada pengurus RW setempat.'
  ]
};

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
data.petaMarkers = data.petaMarkers.filter(marker =>
  !String(marker.sumberPeta || '').includes(sourceMapId)
);
data.petaMarkers.push(...markers);
data.knowledgeBase = data.knowledgeBase.filter(item => item.id !== knowledge.id);
data.knowledgeBase.push(knowledge);

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Imported ${markers.length} map markers and 1 knowledge entry.`);
