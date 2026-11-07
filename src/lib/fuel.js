// Akaryakıt fiyatları.
// Kaynak 1: hasanadiguzel.com.tr akaryakıt API'si (ücretsiz, anahtarsız, resmî olmayan; SLA yok)
// Kaynak 2: admin panelinden manuel giriş (API'nin vermediği LPG ve kesintilerde yedek)
//
// Gözlenen yanıt biçimi (Kasım 2026):
//   {"qualifications":{"city":"ANKARA"},"data":{"81,50":{"Kursunsuz_95(Excellium95)_TL/lt":"105,66",
//    "Gazyagi_TL/lt":"101,50","Motorin(Eurodiesel)_TL/lt":"101,50", ... ,"Otogaz_TL/lt":""}}}
// Kaynak tablo bir sütun kaymış geliyor: kurşunsuz 95 fiyatı nesne ANAHTARI olarak dönüyor.
// Ayrıştırıcı hem bu kaymış biçimi hem de düzeltilmiş (Ilce_Adi alanlı dizi) biçimi destekler
// ve mantık dışı değerleri reddeder.
const db = require('../db');
const config = require('../config');
const { FUEL_REGIONS } = require('../data/taxonomy');

const API_BASE = process.env.FUEL_API_BASE || 'https://hasanadiguzel.com.tr/api/akaryakit/sehir=';

const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  const n = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n > 5 && n < 500 ? Math.round(n * 100) / 100 : null;
};
const field = (obj, ...needles) => {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = k.toLowerCase();
    if (needles.every((n) => key.includes(n))) return v;
  }
  return undefined;
};

// Bir şehir yanıtını [{benzin, motorin, lpg}] dizisine çevirir (İstanbul: [Avrupa, Anadolu])
function parseCity(body) {
  const data = body && body.data;
  if (!data) return [];
  const out = [];
  const entries = Array.isArray(data) ? data.map((r) => [null, r]) : Object.entries(data);
  for (const [key, row] of entries) {
    const shifted = key != null && num(key) != null;           // kaymış biçim
    const benzin = shifted ? num(key) : num(field(row, 'kursunsuz'));
    const motorin = num(field(row, 'motorin(eurodiesel)')) ?? num(field(row, 'motorin'));
    const lpg = num(field(row, 'otogaz'));
    if (benzin || motorin) out.push({ benzin, motorin, lpg });
  }
  return out;
}

const CITY_REGIONS = {
  ISTANBUL: ['istanbul_avrupa', 'istanbul_anadolu'],
  ANKARA: ['ankara'],
  IZMIR: ['izmir'],
  BURSA: ['bursa'],
};

async function fetchCity(city) {
  const res = await fetch(API_BASE + encodeURIComponent(city), {
    headers: { accept: 'application/json', 'user-agent': 'ServisTeam/1.0 (+https://servisteam.com)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCity(await res.json());
}

async function refresh() {
  if (config.fuel.provider === 'manual') return { skipped: true };
  const saved = [];
  for (const [city, regions] of Object.entries(CITY_REGIONS)) {
    try {
      const rows = await fetchCity(city);
      for (let i = 0; i < regions.length && i < rows.length; i++) {
        const r = rows[i];
        await db.query('INSERT INTO fuel_prices(region, benzin, motorin, lpg, source) VALUES ($1,$2,$3,$4,$5)',
          [regions[i], r.benzin, r.motorin, r.lpg, 'api']);
        saved.push(r);
      }
    } catch (e) { console.error(`[fuel] ${city}:`, e.message); }
  }
  if (saved.length) {
    const mean = (k) => { const a = saved.map((v) => v[k]).filter(Boolean); return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null; };
    await db.query('INSERT INTO fuel_prices(region, benzin, motorin, lpg, source) VALUES ($1,$2,$3,$4,$5)',
      ['turkiye', mean('benzin'), mean('motorin'), mean('lpg'), 'api']);
  }
  invalidate();
  return { count: saved.length };
}

let cache = null; let cacheAt = 0;
async function latest() {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  const rows = await db.many(`SELECT DISTINCT ON (region) region, benzin, motorin, lpg, source, fetched_at
                              FROM fuel_prices ORDER BY region, fetched_at DESC`);
  // API LPG vermediğinde son 10 günün manuel LPG değeri kullanılır
  const lpgRows = await db.many(`SELECT DISTINCT ON (region) region, lpg FROM fuel_prices
                                 WHERE lpg IS NOT NULL AND fetched_at > now() - interval '10 days'
                                 ORDER BY region, fetched_at DESC`);
  const lpgBy = Object.fromEntries(lpgRows.map((r) => [r.region, r.lpg]));
  const byRegion = Object.fromEntries(rows.map((r) => [r.region, { ...r, lpg: r.lpg ?? lpgBy[r.region] ?? null }]));
  cache = Object.keys(FUEL_REGIONS).filter((k) => byRegion[k]).map((k) => ({ key: k, label: FUEL_REGIONS[k], ...byRegion[k] }));
  cacheAt = Date.now();
  return cache;
}
function invalidate() { cache = null; }

function regionForCity(code) {
  return { '34': 'istanbul_avrupa', '06': 'ankara', '35': 'izmir', '16': 'bursa' }[code] || 'turkiye';
}

module.exports = { refresh, latest, invalidate, regionForCity, parseCity };
