const JAKARTA_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/;
const SAFE_ID = /^pg-[a-z0-9-]{3,100}$/;

function string(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function slug(value) {
  return string(value, 120)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'pengumuman';
}

function compactEventDate(value) {
  const match = string(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function validateAnnouncement(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['Pengumuman tidak valid.'] };
  }
  if (!SAFE_ID.test(string(value.id))) errors.push('ID pengumuman tidak valid.');
  if (!string(value.judul)) errors.push('Judul wajib diisi.');
  if (!string(value.ringkasan)) errors.push('Ringkasan wajib diisi.');
  for (const key of ['eventStart', 'eventEnd', 'expiresAt']) {
    if (value[key] && !JAKARTA_TIMESTAMP.test(string(value[key]))) {
      errors.push(`${key} wajib memakai zona +07:00.`);
    }
  }
  if (value.eventStart && value.eventEnd && Date.parse(value.eventEnd) < Date.parse(value.eventStart)) {
    errors.push('Waktu selesai tidak boleh sebelum waktu mulai.');
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeAnnouncement(input, now = new Date()) {
  const source = cloneObject(input);
  const judul = string(source.judul, 180);
  const eventStart = string(source.eventStart, 25);
  const generatedId = `pg-${slug(judul)}${compactEventDate(eventStart) ? `-${compactEventDate(eventStart)}` : ''}`;
  const notification = cloneObject(source.notification);
  const sumber = cloneObject(source.sumber);
  const lampiran = cloneObject(source.lampiran);
  const instant = now instanceof Date ? now : new Date(now);
  const stamp = Number.isNaN(instant.getTime()) ? new Date().toISOString() : instant.toISOString();

  return {
    ...source,
    id: SAFE_ID.test(string(source.id)) ? string(source.id) : generatedId.slice(0, 103),
    judul,
    emoji: string(source.emoji || '📢', 8),
    tanggal: string(source.tanggal || stamp.slice(0, 10), 10),
    eventStart,
    eventEnd: string(source.eventEnd, 25),
    lokasi: string(source.lokasi, 240),
    penyelenggara: string(source.penyelenggara, 240),
    ringkasan: string(source.ringkasan, 600),
    deskripsi: string(source.deskripsi, 5000),
    penting: source.penting === true,
    sumber: {
      instansi: string(sumber.instansi, 240),
      nomorDokumen: string(sumber.nomorDokumen, 100),
      tanggalDokumen: string(sumber.tanggalDokumen, 10)
    },
    lampiran: {
      nama: string(lampiran.nama, 240),
      url: string(lampiran.url, 500)
    },
    expiresAt: string(source.expiresAt, 25),
    notification: {
      enabled: notification.enabled === true,
      title: string(notification.title || judul, 60),
      body: string(notification.body || source.ringkasan, 160),
      url: string(notification.url, 240)
    },
    createdAt: string(source.createdAt || stamp, 30),
    updatedAt: string(source.updatedAt || stamp, 30)
  };
}

function isExpired(item, now) {
  if (!item.expiresAt) return false;
  const expiry = Date.parse(item.expiresAt);
  return Number.isFinite(expiry) && expiry < now.getTime();
}

export function mergeAnnouncements(staticItems = [], dynamicItems = [], now = new Date()) {
  const byId = new Map();
  for (const raw of [...staticItems, ...dynamicItems]) {
    const item = normalizeAnnouncement(raw, now);
    if (!validateAnnouncement(item).ok) continue;
    const previous = byId.get(item.id);
    if (!previous || Date.parse(item.updatedAt || 0) >= Date.parse(previous.updatedAt || 0)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .filter(item => !isExpired(item, now))
    .sort((a, b) => {
      if (a.penting !== b.penting) return a.penting ? -1 : 1;
      const aTime = Date.parse(a.eventStart || a.updatedAt || a.tanggal) || 0;
      const bTime = Date.parse(b.eventStart || b.updatedAt || b.tanggal) || 0;
      return bTime - aTime;
    });
}

export function buildNotificationPayload(announcement) {
  const item = normalizeAnnouncement(announcement);
  const validation = validateAnnouncement(item);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const customUrl = item.notification.url;
  if (customUrl && (!customUrl.startsWith('/') || customUrl.startsWith('//'))) {
    throw new Error('URL notifikasi harus berada di origin PRIMA.');
  }
  return {
    title: string(item.notification.title || item.judul, 60),
    body: string(item.notification.body || item.ringkasan, 160),
    url: customUrl || `/?s=info&announcement=${encodeURIComponent(item.id)}`,
    tag: `prima-announcement-${item.id}`,
    announcementId: item.id
  };
}
